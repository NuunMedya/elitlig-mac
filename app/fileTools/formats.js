// Dosya Araçları — biçim kataloğu (ana süreç tarafı).
//
// Arayüzdeki katalog (renderer/src/lib/files/catalog.js) aynı uzantı listelerini
// taşır; ikisinin eşit kaldığını renderer/test/files-catalog.test.js denetler.
// Burada yalnız ana sürecin doğrulama için ihtiyaç duyduğu bilgi vardır:
// hangi uzantı hangi türdür, hangi hedefe dönüştürülebilir.
"use strict";

const path = require("node:path");

const KIND_EXTS = Object.freeze({
  image: ["jpg", "jpeg", "png", "webp", "gif", "bmp", "tif", "tiff", "heic", "heif", "avif", "ico"],
  video: ["mp4", "mov", "m4v", "webm", "mkv", "avi", "wmv", "flv", "mpg", "mpeg", "3gp", "ts", "mts"],
  audio: ["mp3", "m4a", "aac", "wav", "ogg", "oga", "opus", "flac", "aif", "aiff", "wma", "caf"],
  pdf: ["pdf"],
  archive: ["zip"],
  subtitle: ["srt", "vtt"],
  text: ["txt", "csv", "tsv", "md", "json", "xml", "log", "ini", "yml", "yaml"],
  html: ["html", "htm"],
});

const EXT_KIND = Object.freeze(Object.fromEntries(Object.entries(KIND_EXTS).flatMap(([kind, exts]) => exts.map((e) => [e, kind]))));

/** Dönüştürme hedefleri (tür başına). */
const TARGETS = Object.freeze({
  image: ["jpg", "png", "webp", "heic", "tiff", "bmp", "gif"],
  video: ["mp4", "mov", "webm", "mkv", "gif", "mp3", "m4a", "wav"],
  audio: ["mp3", "m4a", "wav", "ogg", "flac"],
  subtitle: ["srt", "vtt"],
});

const extOf = (file) => path.extname(String(file || "")).slice(1).toLowerCase();
const kindOf = (file) => EXT_KIND[extOf(file)] || "other";

const MIME = Object.freeze({
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", bmp: "image/bmp", avif: "image/avif", ico: "image/x-icon",
  tif: "image/tiff", tiff: "image/tiff", heic: "image/heic", heif: "image/heif", svg: "image/svg+xml",
  mp4: "video/mp4", m4v: "video/mp4", mov: "video/quicktime", webm: "video/webm", mkv: "video/x-matroska",
  mp3: "audio/mpeg", m4a: "audio/mp4", aac: "audio/aac", wav: "audio/wav", ogg: "audio/ogg", oga: "audio/ogg", opus: "audio/ogg", flac: "audio/flac",
  pdf: "application/pdf", zip: "application/zip", txt: "text/plain; charset=utf-8", srt: "text/plain; charset=utf-8", vtt: "text/vtt; charset=utf-8",
  json: "application/json", csv: "text/csv; charset=utf-8", md: "text/plain; charset=utf-8", html: "text/html; charset=utf-8", htm: "text/html; charset=utf-8",
});
const mimeOf = (file) => MIME[extOf(file)] || "application/octet-stream";

module.exports = { KIND_EXTS, EXT_KIND, TARGETS, extOf, kindOf, mimeOf };
