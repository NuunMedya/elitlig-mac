// Yayın Stüdyosu — MÜZİK ÇALAR · YOUTUBE OYNATMA LİSTESİ (saf işlevler).
//
// Listedeki bir giriş { kind: "playlist" } olabilir: YouTube oynatma listesi (list=…), açılmış
// parçalarıyla birlikte saklanır (önbellek; "Yenile" yeniden açar):
//   { id, kind: "playlist", url, listId, title, items: [{ v: videoId, t: başlık, d: süre sn | null,
//     s: başlangıç (parçaya özel) | null, e: bitiş | null, f: sık kullanılan }],
//     start (listenin varsayılan başlangıç saniyesi: girişleri atla), order: "seq" | "shuffle",
//     repeat: "list" | "one" | "off", volume, air, fav, fetchedAt, source, more, open }
// Liste parçası çalınırken "sanal parça" kimliği `${liste.id}~${videoId}` olur; oynatıcı onu
// sıradan bir YouTube parçası gibi çalar (geçiş, yayına ver aynı).
import { parseTime } from "../goalmusic/goalMusic";

export const MAX_PLAYLIST_ITEMS = 200;
export const ITEM_SEP = "~";
const VID_RE = /^[A-Za-z0-9_-]{11}$/;
const LIST_RE = /^[A-Za-z0-9_-]{12,80}$/;
export const PLAYLIST_ORDERS = [
  { key: "seq", label: "Sırayla", icon: "list" },
  { key: "shuffle", label: "Karışık", icon: "arrows" },
];
export const PLAYLIST_REPEATS = [
  { key: "list", label: "Listeyi tekrar" },
  { key: "one", label: "Tek parça tekrar" },
  { key: "off", label: "Tekrar yok" },
];

/**
 * Oynatma listesi bağlantısı: youtube.com/playlist?list=…, watch?v=…&list=…, music.youtube.com
 * (playlist?list=…, browse/VL…), youtu.be/ID?list=…, ya da çıplak liste kimliği (PL…, OLAK5uy_…).
 * "Beğenilenler" (LL) / "Sonra izle" (WL) özeldir: açılamaz. → { listId, videoId | null } | null
 */
export function parsePlaylistUrl(input) {
  const raw = String(input || "").trim();
  if (!raw) return null;
  if (/^(PL|OL|UU|FL|RD|OLAK5uy_|LM|UL|PU)[A-Za-z0-9_-]+$/.test(raw) && LIST_RE.test(raw)) return { listId: raw, videoId: null };
  let u;
  try { u = new URL(/^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw}`); } catch { return null; }
  const host = u.hostname.toLowerCase().replace(/^(www|m)\./, "");
  if (!["youtube.com", "music.youtube.com", "youtu.be", "youtube-nocookie.com"].includes(host)) return null;
  let list = u.searchParams.get("list");
  if (!list) { const m = u.pathname.match(/^\/browse\/VL([A-Za-z0-9_-]+)/); if (m) list = m[1]; }
  if (!list || !LIST_RE.test(list)) return null;
  let v = null;
  if (host === "youtu.be") v = u.pathname.split("/")[1] || null;
  else v = u.searchParams.get("v");
  return { listId: list, videoId: v && VID_RE.test(v) ? v : null };
}

const pct = (v, d) => { const n = Number(v); return Number.isFinite(n) ? Math.round(Math.min(100, Math.max(0, n))) : d; };
const secOrNull = (v) => { const n = parseTime(v); return n == null ? null : n; };

export function normalizeItem(x) {
  const o = x && typeof x === "object" ? x : { v: x };
  const v = String(o.v || o.videoId || "");
  if (!VID_RE.test(v)) return null;
  const d = Number(o.d ?? o.durationSec);
  const s = secOrNull(o.s);
  let e = secOrNull(o.e);
  if (e != null && e <= (s ?? 0)) e = null;
  return { v, t: String(o.t ?? o.title ?? "").slice(0, 120), d: Number.isFinite(d) && d > 0 ? Math.round(d) : null, s, e, ...(o.f ? { f: true } : {}) };
}

/** Liste girişi (normalizeMusicTrack'ten; base: id, title, volume, air). */
export function normalizePlaylistEntry(x, base) {
  const parsed = parsePlaylistUrl(x.listId || x.url);
  if (!parsed) return null;
  const seen = new Set();
  const items = (Array.isArray(x.items) ? x.items : []).map(normalizeItem).filter((it) => it && !seen.has(it.v) && seen.add(it.v)).slice(0, MAX_PLAYLIST_ITEMS);
  return {
    ...base,
    kind: "playlist",
    url: String(x.url || `https://www.youtube.com/playlist?list=${parsed.listId}`).slice(0, 300),
    listId: parsed.listId,
    items,
    start: Math.max(0, parseTime(x.start) ?? 0),
    end: null,
    order: x.order === "shuffle" ? "shuffle" : "seq",
    repeat: PLAYLIST_REPEATS.some((r) => r.key === x.repeat) ? x.repeat : "list",
    fetchedAt: Number(x.fetchedAt) || null,
    source: ["page", "feed", "iframe"].includes(x.source) ? x.source : null,
    more: Boolean(x.more),
    open: x.open == null ? true : Boolean(x.open),
    error: x.error ? String(x.error).slice(0, 200) : null,
  };
}

export const isItemId = (id) => typeof id === "string" && id.includes(ITEM_SEP);
export const itemId = (pl, v) => `${pl.id}${ITEM_SEP}${v}`;
export function splitItemId(id) {
  const i = String(id || "").lastIndexOf(ITEM_SEP);
  return i < 0 ? null : { plId: id.slice(0, i), v: id.slice(i + 1) };
}

/** Liste parçası → oynatıcıya verilecek sanal parça. */
export function itemTrack(pl, item) {
  if (!pl || !item) return null;
  const start = item.s ?? pl.start ?? 0;
  const end = item.e != null && item.e > start ? item.e : null;
  return {
    id: itemId(pl, item.v), kind: "youtube", url: `https://youtu.be/${item.v}`, videoId: item.v,
    title: item.t || "", start, end, volume: pl.volume ?? 100, air: pl.air || "inherit",
    playlistId: pl.id, itemIndex: pl.items.indexOf(item), fav: Boolean(item.f), durationSec: item.d,
  };
}

/** Kimlikten parça: üst düzey giriş ya da liste parçası (sanal). Liste girişinin kendisi → null. */
export function findPlayable(config, id) {
  const tracks = config?.tracks || [];
  if (isItemId(id)) {
    const sp = splitItemId(id);
    const pl = tracks.find((t) => t.id === sp.plId && t.kind === "playlist");
    const it = pl?.items.find((x) => x.v === sp.v);
    return it ? itemTrack(pl, it) : null;
  }
  const t = tracks.find((x) => x.id === id);
  return t && t.kind !== "playlist" ? t : null;
}
/** Çalınan parçanın üst düzey girişi (liste parçası → liste). */
export const entryIdOf = (track) => (track ? track.playlistId || track.id : null);

/** Tüm çalınabilir parçalar (arama / sık kullanılanlar): [{ track, entry }]. */
export function flatPlayable(config) {
  const out = [];
  for (const e of config?.tracks || []) {
    if (e.kind === "playlist") for (const it of e.items) out.push({ track: itemTrack(e, it), entry: e });
    else out.push({ track: e, entry: e });
  }
  return out;
}

/** Arama: başlık / video kimliği / dosya adı içinde (Türkçe küçük harf). */
const fold = (s) => String(s || "").toLocaleLowerCase("tr-TR").normalize("NFD").replace(/[̀-ͯ]/g, "");
export function searchPlayable(config, q, limit = 40) {
  const k = fold(q).trim();
  const all = flatPlayable(config);
  if (!k) return all.slice(0, limit);
  const words = k.split(/\s+/);
  return all.filter(({ track, entry }) => {
    const hay = fold(`${track.title} ${track.name || ""} ${track.videoId || ""} ${entry.kind === "playlist" ? entry.title : ""}`);
    return words.every((w) => hay.includes(w));
  }).slice(0, limit);
}

/**
 * Liste içinde sıradaki parçanın dizini. dir ±1; auto: parça kendiliğinden bitti.
 * history: bu listede bu turda çalınmış video kimlikleri (karışıkta tekrar etmesin).
 * → { index, ended } (ended: liste bitti, listeden çık)
 */
export function playlistStep(pl, cur, dir = 1, { auto = false, rand = Math.random, history = [] } = {}) {
  const n = pl?.items?.length || 0;
  if (!n) return { index: -1, ended: true };
  if (cur == null || cur < 0 || cur >= n) {
    if (pl.order === "shuffle") return { index: Math.min(n - 1, Math.floor(Math.max(0, Math.min(0.9999, rand())) * n)), ended: false };
    return { index: dir < 0 ? n - 1 : 0, ended: false };
  }
  if (auto && pl.repeat === "one") return { index: cur, ended: false };
  if (pl.order === "shuffle" && n > 1) {
    const used = new Set(history);
    used.add(pl.items[cur].v);
    let pool = pl.items.map((_, i) => i).filter((i) => !used.has(pl.items[i].v));
    if (!pool.length) {
      if (auto && pl.repeat === "off") return { index: -1, ended: true };
      pool = pl.items.map((_, i) => i).filter((i) => i !== cur);
    }
    return { index: pool[Math.min(pool.length - 1, Math.floor(Math.max(0, Math.min(0.9999, rand())) * pool.length))], ended: false };
  }
  const j = cur + (dir < 0 ? -1 : 1);
  if (j >= 0 && j < n) return { index: j, ended: false };
  if (pl.repeat === "off") return { index: -1, ended: true }; // listenin ucunda: listeden çık
  return { index: (j + n) % n, ended: false };
}

/** Yenilenen liste parçaları: kullanıcı ayarları (başlangıç / bitiş / sık kullanılan / el ile başlık) korunur. */
export function mergeItems(old = [], fresh = []) {
  const prev = new Map(old.map((x) => [x.v, x]));
  const seen = new Set();
  const out = [];
  for (const raw of fresh) {
    const f = normalizeItem(raw);
    if (!f || seen.has(f.v)) continue;
    seen.add(f.v);
    const o = prev.get(f.v);
    out.push(o ? { ...f, t: f.t || o.t, d: f.d ?? o.d, s: o.s, e: o.e, ...(o.f ? { f: true } : {}) } : f);
  }
  return out.slice(0, MAX_PLAYLIST_ITEMS);
}

export const playlistLength = (pl) => (pl?.items || []).reduce((a, x) => a + (x.d || 0), 0);

/** Tohumlu rastgele (karışık çalmada "Sıradaki" gösterimi ile gerçekten çalınan aynı olsun). */
export function seededRand(key) {
  let h = 2166136261 >>> 0;
  for (const ch of String(key)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  let a = h || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
