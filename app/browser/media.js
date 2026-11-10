// Tarayıcı — sayfadaki video / görselleri bulma ve en yüksek kaliteyi seçme
// (SAF; app/test/browser.test.js sınar).
//
//   • COLLECT_SCRIPT: sayfada (yalıtılmış dünyada, executeJavaScript) çalışır; <img>,
//     <picture>/srcset, <video>/<source>/poster, <audio>, og:image / og:video,
//     twitter:image, arka plan görselleri ve dosyaya giden bağlantıları toplar.
//   • normalizeMedia: adresleri çözer, srcset'ten EN BÜYÜK adayı seçer, bilinen CDN'lerde
//     özgün boyuta yükseltir (twimg name=orig, ytimg maxresdefault, Wikimedia küçük
//     resmi → özgün, googleusercontent =s0), yineleri birleştirir, sıralar.
//   • Akış (blob:/MediaSource) videoları doğrudan indirilemez: yt-dlp önerilir.
//   • formatsFromInfo: yt-dlp -J çıktısından kalite seçenekleri.
//   • netscapeCookies: profilin çerezleri → yt-dlp --cookies dosyası (yalnız ilgili alan adları).
"use strict";

const { siteOf } = require("../fileTools/ytdlpArgs");

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|avif|bmp|svg|heic|jfif)(\?|#|$)/i;
const VIDEO_EXT = /\.(mp4|m4v|webm|mov|mkv|ogv|m3u8|mpd)(\?|#|$)/i;
const AUDIO_EXT = /\.(mp3|m4a|aac|ogg|oga|wav|flac|opus)(\?|#|$)/i;

/** "a.jpg 480w, b.jpg 1080w" → [{ url, w, x }] (çözülmüş adres) */
function parseSrcset(srcset, base) {
  // HTML "srcset" ayrıştırma algoritmasının sadeleştirilmiş hâli: adres boşluğa kadar,
  // sonundaki virgüller ayırıcıdır; tanımlayıcı (480w / 2x) virgüle kadar.
  const out = [];
  const s = String(srcset || "");
  let i = 0;
  while (i < s.length && out.length < 200) {
    while (i < s.length && /[\s,]/.test(s[i])) i += 1;
    if (i >= s.length) break;
    let j = i;
    while (j < s.length && !/\s/.test(s[j])) j += 1;
    let raw = s.slice(i, j);
    let desc = "";
    if (/,+$/.test(raw)) raw = raw.replace(/,+$/, "");
    else {
      let k = j;
      while (k < s.length && s[k] !== ",") k += 1;
      desc = s.slice(j, k).trim();
      j = k;
    }
    i = j + 1;
    let url;
    try { url = new URL(raw, base || undefined).toString(); } catch { continue; }
    const m = desc.match(/^(\d+(?:\.\d+)?)([wx])$/);
    out.push({ url, w: m && m[2] === "w" ? Number(m[1]) : null, x: m && m[2] === "x" ? Number(m[1]) : m ? null : 1 });
  }
  return out;
}

/** srcset adaylarından en büyüğü (genişlik, yoksa yoğunluk). */
function pickLargestSrcset(srcset, base) {
  const list = Array.isArray(srcset) ? srcset : parseSrcset(srcset, base);
  if (!list.length) return null;
  return [...list].sort((a, b) => (b.w || 0) - (a.w || 0) || (b.x || 0) - (a.x || 0))[0];
}

/** Bilinen CDN'lerde küçük resim adresi → özgün boyut. */
function upgradeImageUrl(url) {
  let u;
  try { u = new URL(url); } catch { return url; }
  const host = u.hostname;
  if (host === "pbs.twimg.com" && u.pathname.startsWith("/media/")) {
    if (!u.searchParams.has("format")) { const m = u.pathname.match(/\.(jpg|png|webp)$/); if (m) { u.pathname = u.pathname.slice(0, -m[0].length); u.searchParams.set("format", m[1]); } }
    u.searchParams.set("name", "orig");
    return u.toString();
  }
  if (/(^|\.)ytimg\.com$/.test(host)) {
    const m = u.pathname.match(/^\/(vi|vi_webp)\/([^/]+)\/(default|mqdefault|hqdefault|sddefault|hq720|maxresdefault)(_live)?\.(jpg|webp)$/);
    if (m) return `https://i.ytimg.com/vi/${m[2]}/maxresdefault.jpg`;
    return url;
  }
  if (host === "upload.wikimedia.org" && u.pathname.includes("/thumb/")) {
    const m = u.pathname.match(/^(.*)\/thumb\/(.+)\/[^/]+$/);
    if (m) { u.pathname = `${m[1]}/${m[2]}`; u.search = ""; return u.toString(); }
  }
  if (/(^|\.)googleusercontent\.com$/.test(host) || host === "yt3.ggpht.com") {
    const s = u.toString();
    const r = s.replace(/=(?:[swh]\d+[^/?#]*|w\d+-h\d+[^/?#]*)$/, "=s0");
    if (r !== s) return r;
  }
  return url;
}

/** Sayfada çalışan toplayıcı: düz nesne listesi döndürür (adresler henüz çözülmemiş olabilir). */
function collectInPage() {
  /* eslint-disable no-undef */
  const out = [];
  const push = (o) => { if (out.length < 1500) out.push(o); };
  const abs = (u) => { try { return new URL(u, document.baseURI).href; } catch { return null; } };
  for (const img of document.images) {
    const r = img.getBoundingClientRect();
    push({ kind: "image", url: img.currentSrc || img.src, srcset: img.srcset || "", width: img.naturalWidth || 0, height: img.naturalHeight || 0, shownW: Math.round(r.width), shownH: Math.round(r.height), alt: (img.alt || img.title || "").slice(0, 200), source: "img" });
    const pic = img.parentElement && img.parentElement.tagName === "PICTURE" ? img.parentElement : null;
    if (pic) for (const s of pic.querySelectorAll("source[srcset]")) push({ kind: "image", url: "", srcset: s.srcset, width: 0, height: 0, alt: img.alt || "", source: "picture" });
  }
  for (const v of document.querySelectorAll("video")) {
    const src = v.currentSrc || v.src || "";
    push({ kind: "video", url: src, width: v.videoWidth || 0, height: v.videoHeight || 0, duration: Number.isFinite(v.duration) ? Math.round(v.duration) : null, poster: v.poster || "", source: "video", playing: !v.paused });
    for (const s of v.querySelectorAll("source[src]")) push({ kind: "video", url: s.src, type: s.type || "", width: v.videoWidth || 0, height: v.videoHeight || 0, source: "source" });
    if (v.poster) push({ kind: "image", url: v.poster, width: 0, height: 0, alt: "Video kapağı", source: "poster" });
  }
  for (const a of document.querySelectorAll("audio")) {
    push({ kind: "audio", url: a.currentSrc || a.src || "", duration: Number.isFinite(a.duration) ? Math.round(a.duration) : null, source: "audio" });
    for (const s of a.querySelectorAll("source[src]")) push({ kind: "audio", url: s.src, source: "source" });
  }
  const metas = [["og:image", "image"], ["og:image:secure_url", "image"], ["twitter:image", "image"], ["twitter:image:src", "image"], ["og:video", "video"], ["og:video:secure_url", "video"], ["og:video:url", "video"], ["twitter:player:stream", "video"]];
  for (const [prop, kind] of metas) {
    for (const m of document.querySelectorAll(`meta[property="${prop}"], meta[name="${prop}"]`)) if (m.content) push({ kind, url: abs(m.content), width: 0, height: 0, source: "meta", alt: document.title.slice(0, 200) });
  }
  const ogw = Number(document.querySelector('meta[property="og:image:width"]')?.content) || 0;
  const ogh = Number(document.querySelector('meta[property="og:image:height"]')?.content) || 0;
  if (ogw && ogh) for (const o of out) if (o.source === "meta" && o.kind === "image" && !o.width) { o.width = ogw; o.height = ogh; }
  const link = document.querySelector('link[rel="image_src"]');
  if (link && link.href) push({ kind: "image", url: link.href, source: "meta" });
  let n = 0;
  for (const el of document.querySelectorAll("body *")) {
    if (++n > 4000) break;
    const bg = getComputedStyle(el).backgroundImage;
    if (!bg || bg === "none" || !bg.includes("url(")) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 80 || r.height < 80) continue;
    const m = bg.match(/url\(["']?([^"')]+)["']?\)/);
    if (m) push({ kind: "image", url: abs(m[1]), width: 0, height: 0, shownW: Math.round(r.width), shownH: Math.round(r.height), source: "background" });
  }
  for (const a of document.querySelectorAll("a[href]")) {
    const h = a.href || "";
    if (/\.(jpe?g|png|gif|webp|avif)(\?|#|$)/i.test(h)) push({ kind: "image", url: h, source: "link", alt: (a.textContent || "").trim().slice(0, 120) });
    else if (/\.(mp4|m4v|webm|mov|mkv)(\?|#|$)/i.test(h)) push({ kind: "video", url: h, source: "link", alt: (a.textContent || "").trim().slice(0, 120) });
    else if (/\.(mp3|m4a|wav|flac|ogg)(\?|#|$)/i.test(h)) push({ kind: "audio", url: h, source: "link" });
  }
  return { pageUrl: location.href, title: document.title, items: out };
  /* eslint-enable no-undef */
}

const COLLECT_SCRIPT = `(${collectInPage.toString()})()`;

const kindFromUrl = (url, fallback) => (VIDEO_EXT.test(url) ? "video" : AUDIO_EXT.test(url) ? "audio" : IMAGE_EXT.test(url) ? "image" : fallback);

function nameFromUrl(url, kind, i = 0) {
  try {
    const u = new URL(url);
    if (u.protocol === "data:") return `gorsel-${i + 1}.${(url.match(/^data:image\/(\w+)/) || [])[1] || "png"}`;
    let base = decodeURIComponent(u.pathname.split("/").filter(Boolean).pop() || "");
    base = base.replace(/[\\/:*?"<>|]+/g, "-").slice(0, 120);
    if (!base) base = `${kind === "video" ? "video" : kind === "audio" ? "ses" : "gorsel"}-${i + 1}`;
    if (!/\.[a-z0-9]{2,5}$/i.test(base)) {
      const fmt = u.searchParams.get("format");
      base += fmt ? `.${fmt}` : kind === "video" ? ".mp4" : kind === "audio" ? ".mp3" : ".jpg";
    }
    return base;
  } catch { return `medya-${i + 1}`; }
}

/**
 * Toplayıcı çıktısı → [{ id, kind, url, width, height, alt, source, stream, downloadable, name, poster, duration }]
 */
function normalizeMedia(raw, pageUrl) {
  const items = Array.isArray(raw?.items) ? raw.items : Array.isArray(raw) ? raw : [];
  const base = raw?.pageUrl || pageUrl;
  const byUrl = new Map();
  let streams = 0;
  for (const it of items) {
    if (!it || typeof it !== "object") continue;
    let url = String(it.url || "");
    let width = Number(it.width) || 0;
    let height = Number(it.height) || 0;
    if (it.srcset) {
      const best = pickLargestSrcset(it.srcset, base);
      // srcset'teki en büyük aday görünen (currentSrc) adresten büyükse o alınır.
      if (best && (!url || (best.w && best.w > width) || (best.x && best.x > 1 && !best.w))) {
        if (best.w && width && best.w > width) { height = height ? Math.round((height * best.w) / width) : 0; width = best.w; } else if (best.w) { width = best.w; height = 0; }
        url = best.url;
      }
    }
    if (!url) continue;
    if (/^blob:/i.test(url) || /^mediasource:/i.test(url)) { if (it.kind === "video" || it.kind === "audio") streams += 1; continue; }
    try { url = new URL(url, base || undefined).toString(); } catch { continue; }
    if (!/^(https?|data):/i.test(url)) continue;
    if (/^data:/i.test(url) && (url.length < 1500 || !/^data:image\//i.test(url))) continue; // küçük yer tutucular, boşluk gifleri
    const kind = it.kind === "image" ? (VIDEO_EXT.test(url) ? "video" : "image") : kindFromUrl(url, it.kind || "image");
    const upgraded = kind === "image" ? upgradeImageUrl(url) : url;
    const key = upgraded;
    const prev = byUrl.get(key);
    const entry = {
      kind, url: upgraded, original: upgraded !== url ? url : null,
      width: Math.max(width, prev?.width || 0), height: Math.max(height, prev?.height || 0),
      shownW: Number(it.shownW) || prev?.shownW || 0, shownH: Number(it.shownH) || prev?.shownH || 0,
      alt: String(it.alt || prev?.alt || "").slice(0, 200), source: prev?.source || it.source || "",
      duration: it.duration ?? prev?.duration ?? null, poster: it.poster || prev?.poster || "", playing: Boolean(it.playing || prev?.playing),
      hls: /\.(m3u8|mpd)(\?|#|$)/i.test(upgraded),
    };
    if (prev && prev.width * prev.height > entry.width * entry.height) { entry.width = prev.width; entry.height = prev.height; }
    byUrl.set(key, entry);
  }
  // İzleme pikselleri ve simgeler: boyutu bilinen ve çok küçük görseller elenir.
  const list = [...byUrl.values()].filter((m) => {
    if (m.kind !== "image") return true;
    // Gerçek (ya da srcset'ten gelen) boyut varsa o; yoksa sayfadaki görünen boyut.
    const natural = m.width || m.height;
    const w = natural ? m.width : m.shownW;
    const h = natural ? m.height : m.shownH;
    if ((w && w < 48) || (h && h < 48)) return false;
    return true;
  });
  const rank = { video: 0, audio: 1, image: 2 };
  list.sort((a, b) => rank[a.kind] - rank[b.kind] || Number(b.playing) - Number(a.playing) || (b.width * b.height) - (a.width * a.height));
  const site = siteOf(base || "");
  const streaming = site.key !== "other" && site.key !== "invalid";
  return {
    pageUrl: base || "",
    title: String(raw?.title || ""),
    site: streaming ? site : null,
    streams,
    // Akış videosu (YouTube, Instagram… ya da sayfada blob: video): yt-dlp ile yüksek kalite.
    suggestYtdlp: streaming || streams > 0,
    items: list.slice(0, 600).map((m, i) => ({ ...m, id: `m${i}`, name: nameFromUrl(m.url, m.kind, i), downloadable: !m.hls })),
  };
}

/** yt-dlp -J çıktısı → { title, thumbnail, duration, heights: [2160, 1080, …], audio: bool } */
function formatsFromInfo(info) {
  const formats = Array.isArray(info?.formats) ? info.formats : [];
  const heights = new Set();
  let audio = false;
  let best = null;
  for (const f of formats) {
    const h = Number(f.height) || 0;
    if (f.vcodec && f.vcodec !== "none" && h) { heights.add(h); if (!best || h > best.height) best = { height: h, fps: f.fps || null, ext: f.ext || null }; }
    if (f.acodec && f.acodec !== "none") audio = true;
  }
  if (!formats.length && info?.height) heights.add(Number(info.height));
  const sorted = [...heights].sort((a, b) => b - a);
  // Dosya Araçları'nın kalite basamakları (ytdlpArgs QUALITIES): en yakın alt basamak.
  const steps = [2160, 1440, 1080, 720, 480, 360].filter((s) => sorted.some((h) => h >= s * 0.9));
  return {
    title: String(info?.title || ""), uploader: String(info?.uploader || info?.channel || ""), thumbnail: info?.thumbnail || null,
    duration: Number(info?.duration) || null, heights: sorted, steps, best, audio: audio || !formats.length,
    isLive: Boolean(info?.is_live), playlistCount: info?._type === "playlist" ? Number(info.playlist_count) || (info.entries || []).length : 0,
  };
}

/** Çerezin alan adı hedef siteyle ilgili mi (yt-dlp'ye yalnız bunlar verilir). */
function cookieRelevant(cookieDomain, targetHost) {
  const d = String(cookieDomain || "").replace(/^\./, "").toLowerCase();
  const h = String(targetHost || "").toLowerCase();
  if (!d || !h) return false;
  if (h === d || h.endsWith(`.${d}`)) return true;
  const site = siteOf(`https://${h}/`).key;
  // YouTube oturumu google.com çerezleriyle de taşınır.
  if (site === "youtube" && (d === "google.com" || d.endsWith(".google.com") || d === "youtube.com" || d.endsWith(".youtube.com"))) return true;
  if (site === "x" && (d === "x.com" || d === "twitter.com" || d.endsWith(".twitter.com"))) return true;
  return false;
}

/** Electron çerezleri → Netscape cookies.txt metni. */
function netscapeCookies(cookies, targetHost) {
  const lines = ["# Netscape HTTP Cookie File", "# Elitlig Tarayıcı tarafından yt-dlp için yazıldı", ""];
  for (const c of cookies || []) {
    if (!c || !c.name || !cookieRelevant(c.domain, targetHost)) continue;
    const domain = c.hostOnly ? String(c.domain).replace(/^\./, "") : String(c.domain).startsWith(".") ? c.domain : `.${c.domain}`;
    const exp = c.session || !c.expirationDate ? 0 : Math.floor(c.expirationDate);
    const clean = (s) => String(s ?? "").replace(/[\t\r\n]/g, " ");
    lines.push([c.httpOnly ? `#HttpOnly_${domain}` : domain, c.hostOnly ? "FALSE" : "TRUE", clean(c.path || "/"), c.secure ? "TRUE" : "FALSE", String(exp), clean(c.name), clean(c.value)].join("\t"));
  }
  return `${lines.join("\n")}\n`;
}

module.exports = { parseSrcset, pickLargestSrcset, upgradeImageUrl, normalizeMedia, formatsFromInfo, netscapeCookies, cookieRelevant, nameFromUrl, COLLECT_SCRIPT, collectInPage };
