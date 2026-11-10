// Ekran Görüntüleri ve Pano rafı — yerel depo.
//
// userData/shelf/
//   index.json      öğeler, klasörler (JSON dizin; yerel modül / veritabanı yok)
//   images/<id>.<uzantı>   görselin kendi kopyası (ekran görüntüsü klasöründeki
//                          özgün dosyaya dokunulmaz)
//   images/<id>-edit.png   işaretleme / kırpma sonrası sürüm (özgün kopya korunur)
//   thumbs/<id>.jpg        küçük resim (ızgara ve raf kartları)
//
// Hiçbir şey sunucuya gitmez.
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { EventEmitter } = require("node:events");
const rules = require("./rules");

const UNDO_MAX = 32;
const newId = () => `${Date.now().toString(36)}${crypto.randomBytes(5).toString("hex")}`;
const ID = /^[0-9a-z]{8,32}$/;

/**
 * dir: depo klasörü. makeThumb(src, dest) → { width, height } | null (Electron nativeImage; testte sahte).
 */
function createShelfStore({ dir, makeThumb = () => null, now = () => Date.now() } = {}) {
  const events = new EventEmitter();
  const imagesDir = path.join(dir, "images");
  const thumbsDir = path.join(dir, "thumbs");
  fs.mkdirSync(imagesDir, { recursive: true });
  fs.mkdirSync(thumbsDir, { recursive: true });
  const indexFile = path.join(dir, "index.json");
  let data = { version: 1, items: [], folders: [] };
  try {
    const raw = JSON.parse(fs.readFileSync(indexFile, "utf8"));
    if (Array.isArray(raw?.items)) data.items = raw.items.filter((i) => i && ID.test(String(i.id)));
    if (Array.isArray(raw?.folders)) data.folders = raw.folders.filter((f) => f && typeof f.id === "string");
  } catch { /* ilk açılış */ }
  const undo = [];

  let timer = null;
  const writeNow = () => {
    clearTimeout(timer);
    timer = null;
    try {
      fs.writeFileSync(`${indexFile}.tmp`, JSON.stringify(data));
      fs.renameSync(`${indexFile}.tmp`, indexFile);
    } catch { /* yoksay */ }
  };
  const changed = (reason = "update") => {
    clearTimeout(timer);
    timer = setTimeout(writeNow, 200);
    events.emit("changed", { reason });
  };

  const byId = (id) => data.items.find((i) => i.id === String(id)) || null;
  const filePath = (item, which = "image") => {
    if (!item) return null;
    if (which === "thumb") return item.thumb ? path.join(thumbsDir, item.thumb) : null;
    if (which === "link") return item.linkImage ? path.join(thumbsDir, item.linkImage) : null;
    if (which === "original") return item.file ? path.join(imagesDir, item.file) : null;
    return item.edited ? path.join(imagesDir, item.edited) : item.file ? path.join(imagesDir, item.file) : null;
  };

  /* -------------------------------- ekleme -------------------------------- */

  function addImage({ buffer = null, from = null, ext = "png", source = "clipboard", origPath = null, name = null, hash = null } = {}) {
    const bytes = buffer ? Buffer.from(buffer) : null;
    const h = hash || (bytes ? crypto.createHash("sha1").update(bytes).digest("hex") : null);
    // Aynı ekran görüntüsü (aynı yol) iki kez gelmesin; aynı görsel baytları da.
    const dup = data.items.find((i) => !i.trashedAt && i.kind === "image" && ((origPath && i.origPath === origPath) || (h && i.hash === h)));
    if (dup) {
      dup.copiedAt = now();
      dup.onShelf = true;
      changed("refresh");
      return { item: dup, duplicate: true };
    }
    const id = newId();
    const e = String(ext || "png").toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
    const file = `${id}.${e}`;
    const dest = path.join(imagesDir, file);
    if (bytes) fs.writeFileSync(dest, bytes);
    else if (from) fs.copyFileSync(from, dest, fs.constants.COPYFILE_FICLONE);
    else throw new Error("Görsel verisi yok.");
    const thumbName = `${id}.jpg`;
    let size = null;
    try { size = makeThumb(dest, path.join(thumbsDir, thumbName)); } catch { size = null; }
    const t = now();
    const item = {
      id, kind: "image", source, createdAt: t, copiedAt: t, updatedAt: t, onShelf: true, trashedAt: null, pinned: false, tags: [], folderId: null, title: "", note: "",
      file, thumb: size ? thumbName : null, width: size?.width || null, height: size?.height || null, bytes: fs.statSync(dest).size, hash: h,
      origPath: origPath || null, name: name || (origPath ? path.basename(origPath) : null), edited: null,
    };
    data.items.unshift(item);
    changed("add");
    return { item, duplicate: false };
  }

  function addText(text, { source = "clipboard", kind = null, title = "" } = {}) {
    const s = String(text ?? "");
    if (!s.trim()) throw new Error("Boş metin.");
    const k = kind || (rules.isStandaloneUrl(s) ? "link" : "text");
    const dup = source !== "note" ? rules.findDuplicate(data.items, k, s) : null;
    if (dup) {
      dup.copiedAt = now();
      dup.onShelf = true;
      changed("refresh");
      return { item: dup, duplicate: true };
    }
    const t = now();
    const item = {
      id: newId(), kind: k, source, createdAt: t, copiedAt: t, updatedAt: t, onShelf: source !== "note", trashedAt: null, pinned: false, tags: [], folderId: null,
      title: String(title || "").slice(0, 200), note: "",
      ...(k === "link" ? { url: s.trim(), domain: rules.domainOf(s.trim()), linkTitle: null, linkSite: null, linkImage: null } : { text: s }),
    };
    data.items.unshift(item);
    changed("add");
    return { item, duplicate: false };
  }

  /* ------------------------------ düzenleme ------------------------------ */

  function update(id, patch = {}) {
    const item = byId(id);
    if (!item) throw new Error("Öğe bulunamadı.");
    if (typeof patch.title === "string") item.title = patch.title.slice(0, 200);
    if (typeof patch.note === "string") item.note = patch.note.slice(0, 5000);
    if (typeof patch.pinned === "boolean") item.pinned = patch.pinned;
    if (Array.isArray(patch.tags)) item.tags = [...new Set(patch.tags.map(rules.cleanTag).filter(Boolean))].slice(0, 20);
    if (patch.folderId !== undefined) {
      if (patch.folderId && !data.folders.some((f) => f.id === patch.folderId)) throw new Error("Klasör bulunamadı.");
      item.folderId = patch.folderId || null;
    }
    if (typeof patch.text === "string" && item.kind === "text") item.text = patch.text.slice(0, 200000);
    if (patch.link && item.kind === "link") {
      for (const k of ["linkTitle", "linkSite", "linkImage"]) if (patch.link[k] !== undefined) item[k] = patch.link[k];
    }
    if (typeof patch.ocr === "string") item.ocr = patch.ocr.slice(0, 20000);
    item.updatedAt = now();
    changed("update");
    return item;
  }

  /** Toplu işlem (sabitle, etiket ekle, klasöre koy). */
  function updateMany(ids, patch = {}) {
    const list = (ids || []).map(byId).filter(Boolean);
    for (const item of list) {
      if (typeof patch.pinned === "boolean") item.pinned = patch.pinned;
      if (Array.isArray(patch.addTags)) item.tags = [...new Set([...(item.tags || []), ...patch.addTags.map(rules.cleanTag).filter(Boolean)])].slice(0, 20);
      if (patch.folderId !== undefined) item.folderId = patch.folderId && data.folders.some((f) => f.id === patch.folderId) ? patch.folderId : null;
      item.updatedAt = now();
    }
    if (list.length) changed("update");
    return list;
  }

  function markCopied(ids) {
    const t = now();
    for (const id of ids || []) { const i = byId(id); if (i) i.copiedAt = t; }
    changed("copied");
  }

  /** Kırpma / işaretleme sonrası görsel (özgün kopya korunur). */
  function saveEdit(id, bytes) {
    const item = byId(id);
    if (!item || item.kind !== "image") throw new Error("Görsel bulunamadı.");
    const buf = Buffer.from(bytes || []);
    if (!buf.length) throw new Error("Boş görsel.");
    const edited = `${item.id}-edit.png`;
    fs.writeFileSync(path.join(imagesDir, edited), buf);
    item.edited = edited;
    const thumbName = `${item.id}.jpg`;
    try {
      const size = makeThumb(path.join(imagesDir, edited), path.join(thumbsDir, thumbName));
      if (size) { item.thumb = thumbName; item.width = size.width; item.height = size.height; }
    } catch { /* yoksay */ }
    item.updatedAt = now();
    changed("update");
    return item;
  }

  function revertEdit(id) {
    const item = byId(id);
    if (!item?.edited) return item;
    try { fs.rmSync(path.join(imagesDir, item.edited), { force: true }); } catch { /* yoksay */ }
    item.edited = null;
    try {
      const size = makeThumb(path.join(imagesDir, item.file), path.join(thumbsDir, `${item.id}.jpg`));
      if (size) { item.width = size.width; item.height = size.height; }
    } catch { /* yoksay */ }
    item.updatedAt = now();
    changed("update");
    return item;
  }

  /* --------------------------- raftan kaldır / çöp --------------------------- */

  /**
   * S: raftan kaldırır. Kütüphanede saklanan (sabit / klasörlü / etiketli) öğe
   * yalnız raftan iner; geçici kopya çöpe gider. ⌫ ile geri alınır (oturum boyunca 32 adım).
   */
  function takeDown(ids) {
    const t = now();
    const batch = [];
    for (const id of ids || []) {
      const item = byId(id);
      if (!item || item.trashedAt || !item.onShelf) continue;
      batch.push({ id: item.id, onShelf: item.onShelf, trashedAt: item.trashedAt || null });
      item.onShelf = false;
      if (!rules.isKept(item)) item.trashedAt = t;
    }
    if (!batch.length) return 0;
    undo.push(batch);
    if (undo.length > UNDO_MAX) undo.shift();
    changed("takeDown");
    return batch.length;
  }
  function undoTakeDown() {
    const batch = undo.pop();
    if (!batch) return [];
    for (const prev of batch) {
      const item = byId(prev.id);
      if (!item) continue;
      item.onShelf = prev.onShelf;
      item.trashedAt = prev.trashedAt;
    }
    changed("undo");
    return batch.map((b) => b.id);
  }
  const canUndo = () => undo.length > 0;

  function trash(ids) {
    const t = now();
    let n = 0;
    for (const id of ids || []) { const i = byId(id); if (i && !i.trashedAt) { i.trashedAt = t; i.onShelf = false; n += 1; } }
    if (n) changed("trash");
    return n;
  }
  function restore(ids) {
    let n = 0;
    for (const id of ids || []) { const i = byId(id); if (i?.trashedAt) { i.trashedAt = null; n += 1; } }
    if (n) changed("restore");
    return n;
  }
  /** Kalıcı silme: yalnız deponun kendi kopyaları silinir; ekran görüntüsünün özgün dosyası yerinde kalır. */
  function purge(ids) {
    const set = new Set((ids || []).map(String));
    const gone = data.items.filter((i) => set.has(i.id));
    for (const item of gone) {
      for (const f of [item.file && path.join(imagesDir, item.file), item.edited && path.join(imagesDir, item.edited), item.thumb && path.join(thumbsDir, item.thumb), item.linkImage && path.join(thumbsDir, item.linkImage)]) {
        if (f) try { fs.rmSync(f, { force: true }); } catch { /* yoksay */ }
      }
    }
    data.items = data.items.filter((i) => !set.has(i.id));
    if (gone.length) changed("purge");
    return gone.length;
  }
  const emptyTrash = () => purge(data.items.filter((i) => i.trashedAt).map((i) => i.id));

  function runSweep(retention) {
    const { expire, purge: old } = rules.sweep(data.items, retention, now());
    if (expire.length) trash(expire);
    if (old.length) purge(old);
    return { expired: expire.length, purged: old.length };
  }

  /* -------------------------------- klasörler -------------------------------- */

  function createFolder(name, parentId = null) {
    const n = String(name || "").trim().slice(0, 60);
    if (!n) throw new Error("Klasör adı boş olamaz.");
    if (parentId && !data.folders.some((f) => f.id === parentId)) throw new Error("Üst klasör bulunamadı.");
    const folder = { id: newId(), name: n, parentId: parentId || null, createdAt: now() };
    data.folders.push(folder);
    changed("folders");
    return folder;
  }
  function renameFolder(id, name) {
    const f = data.folders.find((x) => x.id === id);
    if (!f) throw new Error("Klasör bulunamadı.");
    const n = String(name || "").trim().slice(0, 60);
    if (!n) throw new Error("Klasör adı boş olamaz.");
    f.name = n;
    changed("folders");
    return f;
  }
  function moveFolder(id, parentId) {
    const f = data.folders.find((x) => x.id === id);
    if (!f) throw new Error("Klasör bulunamadı.");
    if (rules.wouldCycle(data.folders, id, parentId)) throw new Error("Klasör kendi içine taşınamaz.");
    f.parentId = parentId || null;
    changed("folders");
    return f;
  }
  /** Klasör silinir; içindeki öğeler klasörsüz kalır (silinmez), alt klasörler üst klasöre çıkar. */
  function deleteFolder(id) {
    const f = data.folders.find((x) => x.id === id);
    if (!f) return false;
    for (const item of data.items) if (item.folderId === id) item.folderId = null;
    for (const child of data.folders) if (child.parentId === id) child.parentId = f.parentId || null;
    data.folders = data.folders.filter((x) => x.id !== id);
    changed("folders");
    return true;
  }

  /* --------------------------------- okuma --------------------------------- */

  function list(filter = {}, { offset = 0, limit = 120 } = {}) {
    const all = rules.filterItems(data.items, filter);
    return { items: all.slice(Math.max(0, offset), Math.max(0, offset) + Math.min(500, Math.max(1, limit))), total: all.length };
  }
  function counts() {
    const live = data.items.filter((i) => !i.trashedAt);
    const c = { all: live.length, image: 0, text: 0, link: 0, pinned: 0, trash: data.items.length - live.length, shelf: { image: 0, text: 0, link: 0 }, folders: {}, tags: {}, unfiled: 0 };
    for (const i of live) {
      c[i.kind] += 1;
      if (i.pinned) c.pinned += 1;
      if (i.onShelf) c.shelf[i.kind] += 1;
      if (i.folderId) c.folders[i.folderId] = (c.folders[i.folderId] || 0) + 1; else c.unfiled += 1;
      for (const t of i.tags || []) c.tags[t] = (c.tags[t] || 0) + 1;
    }
    return c;
  }
  const folders = () => data.folders.slice();
  const all = () => data.items;

  return {
    events, addImage, addText, update, updateMany, markCopied, saveEdit, revertEdit, takeDown, undoTakeDown, canUndo, trash, restore, purge, emptyTrash,
    runSweep, createFolder, renameFolder, moveFolder, deleteFolder, list, counts, folders, get: byId, all, filePath, flush: writeNow, dirs: { imagesDir, thumbsDir },
  };
}

module.exports = { createShelfStore, UNDO_MAX };
