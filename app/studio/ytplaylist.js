// Yayın Stüdyosu — MÜZİK ÇALAR · YouTube oynatma listesini aç (ana süreç).
//
// Arayüzün CSP'si youtube.com'a fetch'i engeller; liste burada okunur:
//   1) Liste sayfası  https://www.youtube.com/playlist?list=ID  → gömülü ytInitialData:
//      ilk ~100 parça (videoId, başlık, süre), liste adı, devamı var mı (continuation).
//   2) Yedek: RSS akışı https://www.youtube.com/feeds/videos.xml?playlist_id=ID → en çok 15 parça
//      (başlıklı, süresiz). Otomatik karışımlar (RD…) ve gizli listeler açılmaz: arayüz gizli
//      IFrame oynatıcısıyla (getPlaylist) dener.
//   → { ok, listId, title, items: [{ videoId, title, durationSec }], more, source: "page" | "feed" } | { ok: false, error }
"use strict";

const LIST_RE = /^[A-Za-z0-9_-]{12,80}$/;
const VID_RE = /^[A-Za-z0-9_-]{11}$/;
const MAX_ITEMS = 200;
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  "Accept-Language": "tr-TR,tr;q=0.9,en;q=0.8",
  // AB çerez onayı sayfasına yönlenmesin.
  Cookie: "CONSENT=YES+cb; SOCS=CAI",
};

/** Sayfadaki `var ytInitialData = {…};` nesnesini (parantez eşleyerek) çıkar. */
function extractInitialData(html) {
  const s = String(html || "");
  const m = s.match(/(?:var\s+ytInitialData|window\["ytInitialData"\])\s*=\s*\{/);
  if (!m) return null;
  let i = m.index + m[0].length - 1;
  let depth = 0;
  let inStr = false;
  let esc = false;
  const start = i;
  for (; i < s.length; i += 1) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === "\"") inStr = false;
      continue;
    }
    if (c === "\"") inStr = true;
    else if (c === "{") depth += 1;
    else if (c === "}") { depth -= 1; if (depth === 0) break; }
  }
  try { return JSON.parse(s.slice(start, i + 1)); } catch { return null; }
}

const textOf = (t) => (t ? t.simpleText || (Array.isArray(t.runs) ? t.runs.map((r) => r.text).join("") : "") || t.content || "" : "");
const hmsToSec = (txt) => {
  const p = String(txt || "").trim().split(":").map(Number);
  if (!p.length || p.some((n) => !Number.isFinite(n))) return null;
  return p.reduce((a, n) => a * 60 + n, 0);
};

/** Küçük resim rozetlerinden "3:55" gibi süre. */
function badgeDuration(img) {
  let out = null;
  const walk = (o, depth = 0) => {
    if (out != null || !o || typeof o !== "object" || depth > 20) return;
    if (Array.isArray(o)) { for (const x of o) walk(x, depth + 1); return; }
    const t = o.thumbnailBadgeViewModel?.text;
    if (typeof t === "string" && /^\d{1,2}(:\d{2}){1,2}$/.test(t.trim())) { out = hmsToSec(t); return; }
    for (const k of Object.keys(o)) walk(o[k], depth + 1);
  };
  walk(img);
  return out;
}

/** ytInitialData → { title, items, more } */
function parseInitialData(data) {
  const items = [];
  const seen = new Set();
  let more = false;
  let title = "";
  const walk = (o, depth = 0) => {
    if (!o || typeof o !== "object" || depth > 40 || items.length >= MAX_ITEMS) return;
    if (Array.isArray(o)) { for (const x of o) walk(x, depth + 1); return; }
    const r = o.playlistVideoRenderer;
    if (r && VID_RE.test(r.videoId || "")) {
      if (!seen.has(r.videoId) && r.isPlayable !== false) {
        seen.add(r.videoId);
        const d = Number(r.lengthSeconds);
        items.push({ videoId: r.videoId, title: textOf(r.title).slice(0, 120), durationSec: Number.isFinite(d) && d > 0 ? d : hmsToSec(textOf(r.lengthText)) });
      }
      return;
    }
    // 2025+ biçimi: lockupViewModel (contentType VIDEO, süre küçük resim rozetinde)
    const l = o.lockupViewModel;
    if (l && l.contentType === "LOCKUP_CONTENT_TYPE_VIDEO" && VID_RE.test(l.contentId || "")) {
      if (!seen.has(l.contentId)) {
        seen.add(l.contentId);
        items.push({ videoId: l.contentId, title: textOf(l.metadata?.lockupMetadataViewModel?.title).slice(0, 120), durationSec: badgeDuration(l.contentImage) });
      }
      return;
    }
    if (o.continuationItemRenderer || o.continuationItemViewModel) more = true;
    if (!title && o.playlistMetadataRenderer?.title) title = String(o.playlistMetadataRenderer.title);
    if (!title && o.playlistHeaderRenderer?.title) title = textOf(o.playlistHeaderRenderer.title);
    for (const k of Object.keys(o)) walk(o[k], depth + 1);
  };
  walk(data);
  if (!title) title = textOf(data?.header?.pageHeaderRenderer?.pageTitle ? { simpleText: data.header.pageHeaderRenderer.pageTitle } : null);
  return { title: String(title || "").slice(0, 120), items, more };
}

const unxml = (s) => String(s || "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, "&").trim();
/** RSS akışı → { title, items } */
function parseFeed(xml) {
  const s = String(xml || "");
  const first = s.indexOf("<entry");
  const head = first >= 0 ? s.slice(0, first) : s;
  const title = unxml((head.match(/<title>([\s\S]*?)<\/title>/) || [])[1]);
  const items = [];
  const seen = new Set();
  const re = /<entry>([\s\S]*?)<\/entry>/g;
  let m;
  while ((m = re.exec(s)) && items.length < MAX_ITEMS) {
    const v = ((m[1].match(/<yt:videoId>([^<]+)<\/yt:videoId>/) || [])[1] || "").trim();
    if (!VID_RE.test(v) || seen.has(v)) continue;
    seen.add(v);
    items.push({ videoId: v, title: unxml((m[1].match(/<title>([\s\S]*?)<\/title>/) || [])[1]).slice(0, 120), durationSec: null });
  }
  return { title: title.slice(0, 120), items };
}

function createPlaylistFetcher({ fetchImpl = globalThis.fetch, timeoutMs = 8000 } = {}) {
  const get = async (url) => {
    const signal = typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(timeoutMs) : undefined;
    const res = await fetchImpl(url, { headers: HEADERS, signal, redirect: "follow" });
    if (!res?.ok) { const e = new Error(`HTTP ${res?.status || 0}`); e.status = res?.status || 0; throw e; }
    return res.text();
  };
  return async function fetchPlaylist(listId) {
    const id = String(listId || "").trim();
    if (!LIST_RE.test(id)) return { ok: false, error: "Geçersiz liste kimliği." };
    if (typeof fetchImpl !== "function") return { ok: false, error: "Ağ yok." };
    let pageErr = null;
    try {
      const html = await get(`https://www.youtube.com/playlist?list=${encodeURIComponent(id)}&hl=tr`);
      const data = extractInitialData(html);
      const p = data ? parseInitialData(data) : null;
      if (p?.items.length) return { ok: true, listId: id, title: p.title, items: p.items, more: p.more, source: "page" };
    } catch (e) { pageErr = e; }
    try {
      const xml = await get(`https://www.youtube.com/feeds/videos.xml?playlist_id=${encodeURIComponent(id)}`);
      const f = parseFeed(xml);
      if (f.items.length) return { ok: true, listId: id, title: f.title, items: f.items, more: f.items.length >= 15, source: "feed" };
      return { ok: false, error: "Liste boş ya da gizli." };
    } catch (e) {
      const st = e?.status || pageErr?.status;
      return { ok: false, error: st === 404 ? "Liste bulunamadı (gizli ya da otomatik karışım olabilir)." : `Liste okunamadı (${e?.message || "ağ hatası"}).` };
    }
  };
}

module.exports = { createPlaylistFetcher, extractInitialData, parseInitialData, parseFeed };
