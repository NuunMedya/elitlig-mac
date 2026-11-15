// Dosya Araçları — metin işleri (saf işlevler): altyazı SRT ↔ VTT, metin
// kodlaması dönüştürme, toplu yeniden adlandırma şablonu.
"use strict";

/* --------------------------------- altyazı --------------------------------- */

const TIME = /(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})/;

const toMs = (h, m, s, ms) => ((Number(h) * 60 + Number(m)) * 60 + Number(s)) * 1000 + Number(String(ms).padEnd(3, "0"));
function fmtTime(ms, sep) {
  const t = Math.max(0, Math.round(ms));
  const h = Math.floor(t / 3600000);
  const m = Math.floor((t % 3600000) / 60000);
  const s = Math.floor((t % 60000) / 1000);
  const r = t % 1000;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}${sep}${String(r).padStart(3, "0")}`;
}

/** SRT ya da VTT metnini ipuçlarına ayırır: [{ startMs, endMs, text, settings }]. */
function parseSubtitles(input) {
  const text = String(input || "").replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const blocks = text.split(/\n{2,}/);
  const cues = [];
  for (const block of blocks) {
    const lines = block.split("\n").filter((l, i, a) => !(i === a.length - 1 && l === ""));
    const at = lines.findIndex((l) => /-->/.test(l));
    if (at < 0) continue;
    const [left, right = ""] = lines[at].split("-->");
    const a = left.match(TIME) || left.match(/(\d{2}):(\d{2})[,.](\d{1,3})/);
    const rightTime = right.trim().split(/\s+/)[0] || "";
    const b = rightTime.match(TIME) || rightTime.match(/(\d{2}):(\d{2})[,.](\d{1,3})/);
    if (!a || !b) continue;
    const ms = (m) => (m.length === 5 ? toMs(m[1], m[2], m[3], m[4]) : toMs(0, m[1], m[2], m[3]));
    const settings = right.trim().split(/\s+/).slice(1).join(" ");
    cues.push({ startMs: ms(a), endMs: ms(b), text: lines.slice(at + 1).join("\n"), settings });
  }
  return cues;
}

function toSrt(cues) {
  return `${cues.map((c, i) => `${i + 1}\n${fmtTime(c.startMs, ",")} --> ${fmtTime(c.endMs, ",")}\n${c.text}`).join("\n\n")}\n`;
}

function toVtt(cues) {
  return `WEBVTT\n\n${cues.map((c) => `${fmtTime(c.startMs, ".")} --> ${fmtTime(c.endMs, ".")}${c.settings ? ` ${c.settings}` : ""}\n${c.text}`).join("\n\n")}\n`;
}

/** Altyazıyı hedef biçime çevirir; ipucu yoksa hata. */
function convertSubtitles(text, target) {
  const cues = parseSubtitles(text);
  if (!cues.length) throw new Error("Altyazı ipucu bulunamadı.");
  return target === "vtt" ? toVtt(cues) : toSrt(cues);
}

/* ------------------------------ metin kodlaması ------------------------------ */

const ENCODINGS = Object.freeze([
  { key: "utf-8", label: "UTF-8" },
  { key: "utf-8-bom", label: "UTF-8 (BOM'lu, Excel)" },
  { key: "utf-16le", label: "UTF-16 LE" },
  { key: "windows-1254", label: "Windows-1254 (Türkçe)" },
  { key: "iso-8859-9", label: "ISO-8859-9 (Latin-5)" },
]);

function isValidUtf8(bytes) {
  try { new TextDecoder("utf-8", { fatal: true }).decode(bytes); return true; } catch { return false; }
}

/** Kodlamayı tahmin eder: BOM → geçerli UTF-8 → Windows-1254. */
function detectEncoding(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) return "utf-8-bom";
  if (b[0] === 0xff && b[1] === 0xfe) return "utf-16le";
  if (b[0] === 0xfe && b[1] === 0xff) return "utf-16be";
  return isValidUtf8(b) ? "utf-8" : "windows-1254";
}

function decodeText(bytes, encoding = detectEncoding(bytes)) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  const enc = encoding === "utf-8-bom" ? "utf-8" : encoding;
  return new TextDecoder(enc).decode(b).replace(/^﻿/, "");
}

const singleByteTables = new Map();
function singleByteTable(encoding) {
  if (!singleByteTables.has(encoding)) {
    const dec = new TextDecoder(encoding);
    const map = new Map();
    for (let i = 0; i < 256; i += 1) {
      // WHATWG "iso-8859-9" etiketini windows-1254'e eşler; gerçek Latin-5'te 0x80–0x9F denetim karakteridir.
      if (encoding === "iso-8859-9" && i >= 0x80 && i < 0xa0) continue;
      const ch = dec.decode(new Uint8Array([i]));
      if (ch !== "�" && !map.has(ch)) map.set(ch, i);
    }
    singleByteTables.set(encoding, map);
  }
  return singleByteTables.get(encoding);
}

/** Metni hedef kodlamaya yazar. Karşılığı olmayan karakter sayısı (lost) da döner ("?" yazılır). */
function encodeText(text, encoding) {
  const s = String(text ?? "");
  if (encoding === "utf-8") return { bytes: Buffer.from(s, "utf8"), lost: 0 };
  if (encoding === "utf-8-bom") return { bytes: Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(s, "utf8")]), lost: 0 };
  if (encoding === "utf-16le") return { bytes: Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(s, "utf16le")]), lost: 0 };
  if (encoding === "windows-1254" || encoding === "iso-8859-9") {
    const table = singleByteTable(encoding);
    const out = [];
    let lost = 0;
    for (const ch of s) {
      const v = table.get(ch);
      if (v == null) { out.push(0x3f); lost += 1; } else out.push(v);
    }
    return { bytes: Buffer.from(out), lost };
  }
  throw new Error("Desteklenmeyen kodlama.");
}

/** Satır sonlarını değiştirir: "lf" | "crlf" | null (dokunma). */
const withLineEndings = (text, mode) => (mode === "crlf" ? String(text).replace(/\r?\n/g, "\r\n") : mode === "lf" ? String(text).replace(/\r\n/g, "\n") : String(text));

/* --------------------------- toplu yeniden adlandırma --------------------------- */

/**
 * Şablon belirteçleri:
 *   {ad}        özgün ad (uzantısız)      {n} / {n:3}  sıra numarası (başlangıç, dolgu)
 *   {tarih}     değiştirilme tarihi (YYYY-AA-GG)   {saat} SS-DD
 *   {uzanti}    özgün uzantı              {klasor} üst klasörün adı
 * file: { name, ext, mtimeMs, folder }  index: 0'dan başlar
 */
function applyRenameTemplate(template, file, index, { start = 1, pad = 0 } = {}) {
  const d = file.mtimeMs ? new Date(file.mtimeMs) : new Date(0);
  const two = (v) => String(v).padStart(2, "0");
  const stem = String(file.name || "").replace(/\.[^.]+$/, "");
  return String(template || "{ad}").replace(/\{(ad|n|tarih|saat|uzanti|klasor)(?::(\d{1,2}))?\}/gi, (_m, key, width) => {
    switch (key.toLowerCase()) {
      case "ad": return stem;
      case "n": return String(start + index).padStart(Number(width) || pad || 0, "0");
      case "tarih": return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
      case "saat": return `${two(d.getHours())}-${two(d.getMinutes())}`;
      case "uzanti": return String(file.ext || "");
      case "klasor": return String(file.folder || "");
      default: return "";
    }
  });
}

/** Sayfa aralığı metni: "1-3, 5, 8-" (sayfa sayısı 10) → [[1,2,3],[5],[8,9,10]]. Geçersizse null. */
function parsePageRanges(text, pageCount) {
  const groups = [];
  for (const raw of String(text || "").split(/[,;]+/)) {
    const part = raw.trim();
    if (!part) continue;
    const m = part.match(/^(\d+)?\s*(-)?\s*(\d+)?$/);
    if (!m || (!m[1] && !m[3])) return null;
    const a = m[1] ? Number(m[1]) : 1;
    const b = m[2] ? (m[3] ? Number(m[3]) : pageCount) : a;
    if (a < 1 || b < a || b > pageCount) return null;
    groups.push(Array.from({ length: b - a + 1 }, (_, i) => a + i));
  }
  return groups.length ? groups : null;
}

module.exports = {
  parseSubtitles, toSrt, toVtt, convertSubtitles, fmtTime,
  ENCODINGS, detectEncoding, decodeText, encodeText, withLineEndings, isValidUtf8,
  applyRenameTemplate, parsePageRanges,
};
