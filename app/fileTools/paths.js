// Dosya Araçları — çıktı adları ve yol doğrulama (saf işlevler, Electron'a bağlı değil).
//
// Kurallar:
//   - Orijinal dosyalar asla değişmez: çıktı yolu hiçbir girdiyle aynı olamaz,
//     var olan bir dosyanın üstüne yazılmaz (çakışmada "ad (2).uzantı").
//   - Dosya adları her iki işletim sisteminde de geçerli olacak biçimde temizlenir.
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const RESERVED_WIN = /^(con|prn|aux|nul|com\d|lpt\d)$/i;
const MAX_NAME = 160;

/** Dosya adını (uzantısız kök) güvenli hâle getirir. */
function sanitizeName(name, fallback = "dosya") {
  let s = String(name ?? "")
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[.\s]+|[.\s]+$/g, "");
  if (!s || RESERVED_WIN.test(s)) s = s ? `${s}-` : fallback;
  if (s.length > MAX_NAME) s = s.slice(0, MAX_NAME).trim();
  return s || fallback;
}

/** Uzantıyı temizler: yalnız harf/rakam, küçük harf, en çok 8 karakter. */
const sanitizeExt = (ext) => String(ext || "").replace(/^\./, "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8);

const stemOf = (file) => path.basename(String(file || ""), path.extname(String(file || "")));

/**
 * Çakışmasız yol: dir/ad.uzantı, varsa dir/ad (2).uzantı, dir/ad (3).uzantı …
 * exists: (yol) => bool — testlerde sahte. taken: aynı işte henüz yazılmamış ama
 * ayrılmış yollar (toplu çıktılarda iki dosya aynı ada düşmesin).
 */
function uniquePath(dir, base, ext, { exists = fs.existsSync, taken = new Set() } = {}) {
  const stem = sanitizeName(base);
  const e = sanitizeExt(ext);
  const make = (n) => path.join(dir, `${stem}${n > 1 ? ` (${n})` : ""}${e ? `.${e}` : ""}`);
  const key = (p) => p.toLowerCase();
  for (let n = 1; n < 10000; n += 1) {
    const candidate = make(n);
    if (!exists(candidate) && !taken.has(key(candidate))) {
      taken.add(key(candidate));
      return candidate;
    }
  }
  throw new Error("Uygun dosya adı bulunamadı.");
}

/** Girdiden çıktı adı: "foto.heic" + { suffix: "kirpilmis", ext: "jpg" } → "foto-kirpilmis.jpg" (çakışmasız). */
function outputPathFor({ input, dir, suffix = "", ext, name = null, exists, taken } = {}) {
  const outDir = dir || path.dirname(String(input));
  const stem = name != null ? sanitizeName(name) : `${sanitizeName(stemOf(input))}${suffix ? `-${sanitizeName(suffix)}` : ""}`;
  const e = ext != null ? ext : path.extname(String(input)).slice(1);
  return uniquePath(outDir, stem, e, { exists, taken });
}

const samePath = (a, b, platform = process.platform) => {
  const na = path.resolve(String(a));
  const nb = path.resolve(String(b));
  // Mac (APFS varsayılanı) ve Windows büyük/küçük harf duyarsızdır.
  return platform === "linux" ? na === nb : na.toLowerCase() === nb.toLowerCase();
};

/** child, parent'ın içinde mi (aynısı dahil değil)? */
function isInside(parent, child) {
  const rel = path.relative(path.resolve(String(parent)), path.resolve(String(child)));
  return Boolean(rel) && !rel.startsWith("..") && !path.isAbsolute(rel);
}

/**
 * Çıktı yolunu doğrular. Hata metni döner (geçerliyse null).
 *   - mutlak yol, NUL karakteri yok
 *   - hiçbir girdiyle aynı değil (orijinalin üstüne yazılmaz)
 *   - var olan dosyanın üstüne yazılmaz
 */
function validateOutput(out, { inputs = [], exists = fs.existsSync, platform = process.platform } = {}) {
  const s = String(out || "");
  if (!s || s.includes("\0") || !path.isAbsolute(s)) return "Geçersiz çıktı yolu.";
  if (inputs.some((i) => samePath(i, s, platform))) return "Çıktı, orijinal dosyanın üstüne yazılamaz.";
  if (exists(s)) return "Bu adla bir dosya zaten var.";
  return null;
}

/** Geçici çalışma adı (aynı klasörde; bitince asıl ada taşınır). Uzantı korunur: ffmpeg kapsayıcıyı ondan seçer. */
function partPathFor(finalPath, token = Math.random().toString(36).slice(2, 8)) {
  const dir = path.dirname(finalPath);
  const ext = path.extname(finalPath);
  return path.join(dir, `.${path.basename(finalPath, ext)}.${token}.elitlig-part${ext}`);
}

module.exports = { sanitizeName, sanitizeExt, stemOf, uniquePath, outputPathFor, samePath, isInside, validateOutput, partPathFor };
