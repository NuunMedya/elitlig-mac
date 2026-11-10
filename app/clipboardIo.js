// Pano (clipboard) okuma / yazma katmanı — Electron sürümünden bağımsız.
//
// Electron 44 ana süreç `clipboard` modülü W3C Async Clipboard API'sine geçti:
// readText / writeText / read / write / has / clear artık Promise döner;
// availableFormats, readImage, writeImage, readBuffer, writeBuffer kaldırıldı.
// Eski (eşzamanlı) çağrılar hata fırlattığı için pano izleme, panodan yapıştırma
// ve raftan geri kopyalama hiç çalışmıyordu. Bu katman yeni API'yi kullanır;
// eski API'li bir Electron'da (ör. testlerdeki sahte pano) eskisine düşer.
//
// İşletim sisteminin ham biçimleri (macOS pasteboard türleri, Windows kayıtlı
// biçimleri, X11 atomları) yeni API'de
//   electron application/osclipboard;format="<ad>"
// türü olarak görünür; burada yalnız "<ad>" kısmına indirgenir, böylece gizli
// içerik işaretleri (org.nspasteboard.ConcealedType vb.) ve dosya listeleri
// (NSFilenamesPboardType, FileNameW, text/uri-list) doğrudan tanınır.
"use strict";

const RAW = /^electron application\/osclipboard;format="(.*)"$/;
const rawType = (name) => `electron application/osclipboard;format="${name}"`;
const BOOKMARK = "electron application/bookmark";

/** Yeni API türlerinden düz biçim adları (ham biçimler "<ad>" olarak). */
function normalizeTypes(types = []) {
  const out = [];
  for (const t of types) {
    const m = String(t).match(RAW);
    const name = m ? m[1] : String(t);
    if (name && !out.includes(name)) out.push(name);
  }
  return out;
}

async function blobToBuffer(blob) {
  if (blob == null) return null;
  if (Buffer.isBuffer(blob)) return blob;
  if (typeof blob === "string") return Buffer.from(blob, "utf8");
  if (typeof blob.arrayBuffer === "function") return Buffer.from(await blob.arrayBuffer());
  return null;
}

/**
 * clipboard: Electron clipboard (ya da sahtesi). ClipboardItem: Electron'un
 * ClipboardItem sınıfı (yeni API). nativeImage: yalnız eski API'de görsel yazmak için.
 */
function createClipboardIo({ clipboard, ClipboardItem = globalThis.ClipboardItem, nativeImage = null } = {}) {
  const legacy = typeof clipboard?.availableFormats === "function";

  /* ---------------------------------- okuma ---------------------------------- */

  async function readItems() {
    try { return (await clipboard.read()) || []; } catch { return []; }
  }
  const itemWith = (items, type) => items.find((i) => (i.types || []).includes(type)) || null;
  async function getType(items, type) {
    const item = itemWith(items, type);
    if (!item) return null;
    try { return await blobToBuffer(await item.getType(type)); } catch { return null; }
  }

  /** Panodaki biçimler (düz adlar). */
  async function formats() {
    if (legacy) { try { return clipboard.availableFormats(); } catch { return []; } }
    const items = await readItems();
    return normalizeTypes(items.flatMap((i) => i.types || []));
  }

  /**
   * Tek seferde anlık görüntü. want: { text, image } — istenmeyen içerik okunmaz.
   * skip(formats) true dönerse (ör. gizli içerik) metin / görsel hiç okunmaz.
   * → { formats, text, png (Buffer | null) }
   */
  async function snapshot({ text: wantText = true, image: wantImage = false, skip = null } = {}) {
    if (legacy) {
      let fm = [];
      try { fm = clipboard.availableFormats(); } catch { return { formats: [], text: "", png: null }; }
      if (skip?.(fm)) return { formats: fm, text: "", png: null, skipped: true };
      const text = wantText ? String(clipboard.readText() || "") : "";
      let png = null;
      if (wantImage && fm.some((f) => /^image\//i.test(f) || /^(public\.(png|tiff|jpeg)|PNG|Bitmap|DeviceIndependentBitmap|CF_DIB)$/i.test(f))) {
        const img = clipboard.readImage?.();
        if (img && !img.isEmpty()) png = img.toPNG();
      }
      return { formats: fm, text, png };
    }
    const items = await readItems();
    const fm = normalizeTypes(items.flatMap((i) => i.types || []));
    if (skip?.(fm)) return { formats: fm, text: "", png: null, skipped: true };
    const text = wantText && fm.includes("text/plain") ? String((await getType(items, "text/plain"))?.toString("utf8") || "") : "";
    const png = wantImage && fm.includes("image/png") ? await getType(items, "image/png") : null;
    return { formats: fm, text, png: png?.length ? png : null };
  }

  async function readText() {
    try { return String((await clipboard.readText()) || ""); } catch { return ""; }
  }

  async function readImagePng() {
    if (legacy) {
      const img = clipboard.readImage?.();
      return img && !img.isEmpty() ? img.toPNG() : null;
    }
    const buf = await getType(await readItems(), "image/png");
    return buf?.length ? buf : null;
  }

  /** İşletim sisteminin ham biçimi (NSFilenamesPboardType, FileNameW, public.file-url…). */
  async function readRaw(name) {
    if (legacy) {
      try { return clipboard.readBuffer(name); } catch { return null; }
    }
    const items = await readItems();
    return (await getType(items, rawType(name))) || (await getType(items, name));
  }

  /* ---------------------------------- yazma ---------------------------------- */

  async function writeEntries(entries) {
    if (legacy) {
      const data = {};
      if (entries.text != null) data.text = entries.text;
      if (entries.png) data.image = nativeImage.createFromBuffer(entries.png);
      if (entries.bookmark) data.bookmark = entries.bookmark.title;
      clipboard.write(data);
      for (const [name, value] of Object.entries(entries.raw || {})) clipboard.writeBuffer(name, Buffer.from(value));
      return;
    }
    const record = {};
    if (entries.text != null) record["text/plain"] = String(entries.text);
    if (entries.png) record["image/png"] = new Blob([entries.png], { type: "image/png" });
    if (entries.bookmark) record[BOOKMARK] = { title: String(entries.bookmark.title || entries.bookmark.url), url: String(entries.bookmark.url) };
    for (const [name, value] of Object.entries(entries.raw || {})) record[rawType(name)] = Buffer.isBuffer(value) ? new Blob([value]) : String(value);
    await clipboard.write([new ClipboardItem(record)]);
  }

  return {
    legacy,
    formats,
    snapshot,
    readText,
    readImagePng,
    readRaw,
    writeText: async (text) => { if (legacy) clipboard.writeText(String(text)); else await clipboard.writeText(String(text)); },
    /** PNG baytları (isteğe bağlı yanında düz metin). */
    writeImage: (png, { text = null } = {}) => writeEntries({ png, text }),
    /** Bağlantı: düz metin + (destekleyen sistemde) yer imi. */
    writeLink: (url, title = null, { bookmark = true } = {}) => writeEntries({ text: url, bookmark: bookmark ? { url, title: title || url } : null }),
    /** Ham biçim(ler) — ör. macOS Finder dosya listesi. */
    writeRaw: (raw, { text = null } = {}) => writeEntries({ raw, text }),
  };
}

module.exports = { createClipboardIo, normalizeTypes, rawType };
