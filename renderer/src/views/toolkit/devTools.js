// Araç takımı — saf yardımcılar: JSON biçimlendirici, Base64 / URL kodlayıcı, UUID, dolgu metni,
// yüzde / KDV. React'a dokunmaz; renderer/test/toolkit-extra.test.js sınar.

/* ------------------------------ JSON ------------------------------ */

/** Hata iletisindeki konumdan satır / sütun (V8: "at position 12" ya da "(line 2 column 5)"). */
export function jsonErrorAt(text, message) {
  const lc = /line (\d+) column (\d+)/i.exec(message || "");
  if (lc) return { line: Number(lc[1]), column: Number(lc[2]) };
  const m = /position (\d+)/i.exec(message || "");
  if (!m) return null;
  const pos = Math.min(Number(m[1]), text.length);
  const before = text.slice(0, pos).split("\n");
  return { line: before.length, column: before[before.length - 1].length + 1 };
}

const sortDeep = (v) => {
  if (Array.isArray(v)) return v.map(sortDeep);
  if (v && typeof v === "object") return Object.fromEntries(Object.keys(v).sort((a, b) => a.localeCompare(b, "tr")).map((k) => [k, sortDeep(v[k])]));
  return v;
};

/**
 * JSON'u doğrula ve biçimle. mode: "pretty" | "minify". indent: 2 | 4 | "tab".
 * → { ok: true, text, stats: { keys, depth, bytes } } | { ok: false, error, line, column }
 */
export function formatJson(input, { mode = "pretty", indent = 2, sortKeys = false } = {}) {
  const text = String(input ?? "").replace(/^﻿/, "");
  if (!text.trim()) return { ok: false, error: "Boş metin." };
  let value;
  try { value = JSON.parse(text); } catch (e) {
    const at = jsonErrorAt(text, e.message);
    return { ok: false, error: `Geçersiz JSON${at ? ` (satır ${at.line}, sütun ${at.column})` : ""}: ${String(e.message).replace(/^JSON\.parse: /, "")}`, ...(at || {}) };
  }
  if (sortKeys) value = sortDeep(value);
  const out = mode === "minify" ? JSON.stringify(value) : JSON.stringify(value, null, indent === "tab" ? "\t" : Number(indent) || 2);
  let keys = 0;
  let depth = 0;
  const walk = (v, d) => {
    depth = Math.max(depth, d);
    if (Array.isArray(v)) v.forEach((x) => walk(x, d + 1));
    else if (v && typeof v === "object") for (const k of Object.keys(v)) { keys += 1; walk(v[k], d + 1); }
  };
  walk(value, 0);
  return { ok: true, text: out, stats: { keys, depth, bytes: new TextEncoder().encode(out).length } };
}

/* ------------------------------ kodlayıcılar ------------------------------ */

/** UTF-8 güvenli Base64 (Türkçe karakterler bozulmaz). urlSafe: - _ ve dolgusuz. */
export function base64Encode(text, { urlSafe = false } = {}) {
  const bytes = new TextEncoder().encode(String(text ?? ""));
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const b = btoa(bin);
  return urlSafe ? b.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") : b;
}

export function base64Decode(text) {
  let s = String(text ?? "").trim().replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
  if (!s) return { ok: true, text: "" };
  if (!/^[A-Za-z0-9+/]*=*$/.test(s)) return { ok: false, error: "Base64 olmayan karakter var." };
  while (s.length % 4) s += "=";
  try {
    const bin = atob(s);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return { ok: true, text: new TextDecoder("utf-8", { fatal: true }).decode(bytes) };
  } catch {
    return { ok: false, error: "Çözülemedi: metin değil (ikili veri) ya da bozuk Base64." };
  }
}

export const urlEncode = (text, { component = true } = {}) => (component ? encodeURIComponent(String(text ?? "")) : encodeURI(String(text ?? "")));
export function urlDecode(text) {
  try { return { ok: true, text: decodeURIComponent(String(text ?? "").replace(/\+/g, " ")) }; } catch { return { ok: false, error: "Geçersiz % kodu." }; }
}

const HTML_ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const htmlEscape = (text) => String(text ?? "").replace(/[&<>"']/g, (c) => HTML_ESC[c]);
export const htmlUnescape = (text) => String(text ?? "")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (_, n) => ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " })[n]);

/* ------------------------------ UUID ------------------------------ */

/** RFC 4122 sürüm 4 UUID (crypto.getRandomValues). */
export function uuidV4(rand = (n) => crypto.getRandomValues(new Uint8Array(n))) {
  const b = rand(16);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
export const isUuid = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(s || "").trim());

/* ------------------------------ dolgu metni ------------------------------ */

const LATIN = "lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea commodo consequat duis aute irure in reprehenderit voluptate velit esse cillum fugiat nulla pariatur excepteur sint occaecat cupidatat non proident sunt culpa qui officia deserunt mollit anim id est laborum".split(" ");
const TURKCE = "maç saha takım oyuncu gol lig sezon kadro antrenman taraftar hakem tribün skor fikstür puan galibiyet beraberlik yenilgi kaptan forma şampiyonluk turnuva ilk yarı ikinci yarı penaltı korner orta saha savunma hücum kaleci teknik direktör yayın kamera tekrar özet haftanın enleri halı saha akşam hafta sonu güzel hızlı sakin heyecanlı önemli yeni büyük küçük bugün yarın sonra önce birlikte yine ayrıca ancak çünkü ve ile ama için gibi kadar çok az her".split(" ");

/** Basit, tekrarlanabilir sözde rastgele (tohumlu) — aynı tohum aynı metni üretir. */
export function seeded(seed = 1) {
  let s = (Number(seed) >>> 0) || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

/**
 * Dolgu metni. unit: "paragraphs" | "sentences" | "words". lang: "latin" | "tr".
 * classic: Latin metin "Lorem ipsum dolor sit amet…" ile başlar.
 */
export function lorem({ unit = "paragraphs", count = 3, lang = "latin", classic = true, seed = Date.now() } = {}) {
  const words = lang === "tr" ? TURKCE : LATIN;
  const rnd = seeded(seed);
  const n = Math.max(1, Math.min(unit === "words" ? 2000 : unit === "sentences" ? 200 : 50, Math.round(Number(count) || 1)));
  const word = () => words[Math.floor(rnd() * words.length)];
  const cap = (s) => s.charAt(0).toLocaleUpperCase(lang === "tr" ? "tr-TR" : "en") + s.slice(1);
  const sentence = () => {
    const len = 6 + Math.floor(rnd() * 10);
    const ws = Array.from({ length: len }, word);
    if (len > 9) ws[Math.floor(len / 2)] += ",";
    return `${cap(ws.join(" "))}.`;
  };
  const paragraph = () => Array.from({ length: 3 + Math.floor(rnd() * 4) }, sentence).join(" ");
  const opener = "Lorem ipsum dolor sit amet, consectetur adipiscing elit.";
  if (unit === "words") {
    const ws = Array.from({ length: n }, word);
    if (classic && lang === "latin") ws.splice(0, Math.min(5, n), ...["lorem", "ipsum", "dolor", "sit", "amet"].slice(0, n));
    return cap(ws.join(" "));
  }
  if (unit === "sentences") {
    const ss = Array.from({ length: n }, sentence);
    if (classic && lang === "latin") ss[0] = opener;
    return ss.join(" ");
  }
  const ps = Array.from({ length: n }, paragraph);
  if (classic && lang === "latin") ps[0] = `${opener} ${ps[0]}`;
  return ps.join("\n\n");
}

/* ------------------------------ yüzde / KDV ------------------------------ */

const r2 = (v) => Math.round(v * 100) / 100;

/** Yüzde hesapları: a'nın %b'si, a b'nin yüzde kaçı, a'dan b'ye değişim, a'ya %b ekle / çıkar. */
export function percentOps(a, b) {
  const x = Number(a);
  const y = Number(b);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return {
    of: r2((x * y) / 100),
    ratio: y === 0 ? null : r2((x / y) * 100),
    change: x === 0 ? null : r2(((y - x) / Math.abs(x)) * 100),
    plus: r2(x * (1 + y / 100)),
    minus: r2(x * (1 - y / 100)),
  };
}

/** KDV: tutar KDV hariç mi dahil mi? → { net, vat, gross }. rate: yüzde (1, 10, 20…). */
export function vat(amount, rate, { included = false } = {}) {
  const a = Number(amount);
  const r = Number(rate);
  if (!Number.isFinite(a) || !Number.isFinite(r) || r < 0) return null;
  if (included) {
    const net = a / (1 + r / 100);
    return { net: r2(net), vat: r2(a - net), gross: r2(a) };
  }
  return { net: r2(a), vat: r2((a * r) / 100), gross: r2(a * (1 + r / 100)) };
}

/** "1.234,5" / "1234.5" / "1 234" → sayı (Türkçe ondalık virgül). */
export function parseTrNumber(s) {
  let t = String(s ?? "").trim().replace(/\s/g, "").replace(/[₺$€£%]/g, "");
  if (!t) return null;
  if (t.includes(",") && t.includes(".")) t = t.lastIndexOf(",") > t.lastIndexOf(".") ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  else if (t.includes(",")) t = t.replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
