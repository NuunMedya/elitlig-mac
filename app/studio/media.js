// Yayın Stüdyosu — kullanıcının seçtiği yerel medya dosyaları (video, görsel, ses).
//
// Kaynak eklerken seçilen dosyanın TAM YOLU ana süreçteki izin listesine yazılır
// (userData/studio-media.json) ve dosya elitlig-studio://media/<kimlik>/<ad> ile
// Range destekli sunulur. Böylece blob: adresleri gibi oturum sonunda ölmez:
// uygulama yeniden açılınca kaynak kendiliğinden yüklenir.
//
// Güvenlik: yalnız izin listesindeki dosyalar sunulur. Listeye yalnız iki yoldan
// girilir: (1) preload'daki webUtils.getPathForFile (arayüzün kendi uydurduğu File
// nesnesinin yolu yoktur), (2) ana süreçteki dosya seçme penceresi. Kimlik yolun
// özetidir; adreste yol görünmez, yol klasör dışına taşınamaz.
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const MEDIA_ID = /^[0-9a-f]{24}$/;
const MAX_ENTRIES = 500;

const EXT_TYPES = {
  ".mp4": "video/mp4", ".m4v": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm", ".mkv": "video/x-matroska",
  ".mp3": "audio/mpeg", ".m4a": "audio/mp4", ".aac": "audio/aac", ".wav": "audio/wav", ".ogg": "audio/ogg", ".oga": "audio/ogg", ".opus": "audio/ogg", ".flac": "audio/flac",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".bmp": "image/bmp", ".avif": "image/avif",
};
const KIND_EXTS = {
  video: [".mp4", ".m4v", ".mov", ".webm", ".mkv", ".mp3", ".m4a", ".aac", ".wav", ".ogg", ".flac"],
  image: [".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".avif"],
  audio: [".mp3", ".m4a", ".aac", ".wav", ".ogg", ".oga", ".opus", ".flac", ".mp4", ".m4v", ".mov", ".webm"],
};
const KIND_LABELS = { video: "Video / medya", image: "Görsel", audio: "Ses / müzik" };

const contentTypeOf = (file) => EXT_TYPES[path.extname(String(file || "")).toLowerCase()] || null;
const mediaIdOf = (absPath) => crypto.createHash("sha256").update(path.resolve(String(absPath))).digest("hex").slice(0, 24);
const mediaUrl = (scheme, id, name) => `${scheme}://media/${id}/${encodeURIComponent(String(name || "dosya").replace(/[\\/\0]/g, "_"))}`;

/** Ana sürecin dosya seçme penceresi süzgeçleri. */
function dialogFilters(kind) {
  const exts = KIND_EXTS[kind] || [...new Set(Object.values(KIND_EXTS).flat())];
  return [{ name: KIND_LABELS[kind] || "Medya", extensions: exts.map((e) => e.slice(1)) }];
}

/**
 * file: izin listesinin JSON dosyası. scheme: elitlig-studio.
 * → { allow(path) → giriş | null, resolve(id) → yol | null, check(ids) → { id: bool }, forget(id), list() }
 */
function createMediaLibrary({ file, scheme = "elitlig-studio" } = {}) {
  let entries = {};
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    if (raw && typeof raw === "object" && raw.items && typeof raw.items === "object") entries = raw.items;
  } catch { /* ilk açılış */ }
  for (const [id, e] of Object.entries(entries)) if (!MEDIA_ID.test(id) || !e || typeof e.path !== "string" || !path.isAbsolute(e.path)) delete entries[id];

  const save = () => {
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const tmp = `${file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify({ version: 1, items: entries }));
      fs.renameSync(tmp, file);
    } catch { /* yoksay: bu oturumda yine çalışır */ }
  };

  const describe = (id, e) => ({ id, url: mediaUrl(scheme, id, e.name), path: e.path, name: e.name, type: contentTypeOf(e.path), sizeBytes: e.size ?? null });

  /** Gerçek bir dosyayı listeye ekler (yoksa / klasörse / türü bilinmiyorsa null). */
  function allow(p) {
    if (typeof p !== "string" || !p || !path.isAbsolute(p) || p.includes("\0")) return null;
    const abs = path.resolve(p);
    if (!contentTypeOf(abs)) return null;
    let st;
    try { st = fs.statSync(abs); } catch { return null; }
    if (!st.isFile()) return null;
    const id = mediaIdOf(abs);
    entries[id] = { path: abs, name: path.basename(abs), size: st.size, addedAt: entries[id]?.addedAt || Date.now(), usedAt: Date.now() };
    const ids = Object.keys(entries);
    if (ids.length > MAX_ENTRIES) {
      ids.sort((a, b) => (entries[a].usedAt || 0) - (entries[b].usedAt || 0)).slice(0, ids.length - MAX_ENTRIES).forEach((x) => delete entries[x]);
    }
    save();
    return describe(id, entries[id]);
  }

  /** Kimlik → diskteki yol (listede değilse ya da dosya yoksa null). */
  function resolve(id) {
    if (!MEDIA_ID.test(String(id || ""))) return null;
    const e = entries[id];
    if (!e) return null;
    try { if (!fs.statSync(e.path).isFile()) return null; } catch { return null; }
    return e.path;
  }

  const check = (ids) => Object.fromEntries((Array.isArray(ids) ? ids : []).slice(0, 200).map((id) => [String(id), Boolean(resolve(id))]));
  const forget = (id) => { if (entries[id]) { delete entries[id]; save(); return true; } return false; };
  const list = () => Object.entries(entries).map(([id, e]) => describe(id, e));

  return { allow, resolve, check, forget, list };
}

/** elitlig-studio://media/<kimlik>/<ad> → kimlik (ya da null). */
function mediaIdFromParts(parts) {
  if (!Array.isArray(parts) || parts.length < 1 || parts.length > 2) return null;
  return MEDIA_ID.test(parts[0]) ? parts[0] : null;
}

module.exports = { MEDIA_ID, EXT_TYPES, createMediaLibrary, mediaIdOf, mediaUrl, mediaIdFromParts, contentTypeOf, dialogFilters };
