// Metin ve veri araçları: satır / sözcük karşılaştırma (LCS), güvenli Markdown → HTML,
// CSV ↔ JSON ↔ tablo, düzenli ifade testi, MD5 (saf JS) ve SHA (WebCrypto) özetleri.

/* -------------------------------- diff -------------------------------- */

/** LCS tabanlı diff. a, b: dizi. → [{ op: "=", "-", "+", value }] */
export function diffArrays(a, b, eq = (x, y) => x === y) {
  const n = a.length;
  const m = b.length;
  // Büyük girdide bellek: n*m en çok ~4M hücre; daha büyükse yalnız ortak ön/son ek + bloklar.
  if (n * m > 4_000_000) {
    return [...a.map((v) => ({ op: "-", value: v })), ...b.map((v) => ({ op: "+", value: v }))];
  }
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i -= 1) for (let j = m - 1; j >= 0; j -= 1) dp[i][j] = eq(a[i], b[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (eq(a[i], b[j])) { out.push({ op: "=", value: a[i] }); i += 1; j += 1; } else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ op: "-", value: a[i] }); i += 1; } else { out.push({ op: "+", value: b[j] }); j += 1; }
  }
  while (i < n) { out.push({ op: "-", value: a[i] }); i += 1; }
  while (j < m) { out.push({ op: "+", value: b[j] }); j += 1; }
  return out;
}

/** Satır karşılaştırma. ignoreCase / ignoreSpace seçenekleri. → { parts, added, removed, same } */
export function diffLines(left, right, { ignoreCase = false, ignoreSpace = false } = {}) {
  const norm = (s) => { let t = s; if (ignoreSpace) t = t.replace(/\s+/g, " ").trim(); if (ignoreCase) t = t.toLocaleLowerCase("tr-TR"); return t; };
  const a = String(left ?? "").split("\n");
  const b = String(right ?? "").split("\n");
  const parts = diffArrays(a, b, (x, y) => norm(x) === norm(y));
  return { parts, added: parts.filter((p) => p.op === "+").length, removed: parts.filter((p) => p.op === "-").length, same: parts.filter((p) => p.op === "=").length };
}

/** Sözcük düzeyinde (tek satırlık metinler için). */
export function diffWords(left, right) {
  const tok = (s) => String(s ?? "").split(/(\s+)/).filter((x) => x !== "");
  return diffArrays(tok(left), tok(right));
}

/* ------------------------------ markdown ------------------------------ */

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function inline(text) {
  let s = esc(text);
  const codes = [];
  s = s.replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, url) => (/^(https?:|data:image\/)/i.test(url) ? `<img alt="${alt}" src="${url}">` : alt));
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, url) => (/^(https?:|mailto:|#)/i.test(url) ? `<a href="${url}" target="_blank" rel="noreferrer">${label}</a>` : label));
  s = s.replace(/\*\*([^*]+)\*\*|__([^_]+)__/g, (_, a, b) => `<strong>${a || b}</strong>`);
  s = s.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>").replace(/(^|\W)_([^_\s][^_]*)_(?=\W|$)/g, "$1<em>$2</em>");
  s = s.replace(/~~([^~]+)~~/g, "<del>$1</del>");
  s = s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[Number(i)]}</code>`);
  return s;
}

/**
 * Küçük, güvenli Markdown: başlık, paragraf, kalın/italik/üstü çizili, satır içi kod, kod bloğu,
 * alıntı, sıralı / sırasız / görev listesi, tablo, yatay çizgi, bağlantı, görsel. HTML kaçışlanır
 * (ham HTML çalışmaz), bağlantılar yalnız http(s)/mailto.
 */
export function markdownToHtml(md) {
  const lines = String(md ?? "").replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  let i = 0;
  const isTableSep = (l) => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(l);
  const cells = (l) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
  while (i < lines.length) {
    const line = lines[i];
    if (/^```/.test(line)) {
      const lang = line.slice(3).trim();
      const buf = [];
      i += 1;
      while (i < lines.length && !/^```/.test(lines[i])) { buf.push(lines[i]); i += 1; }
      i += 1;
      out.push(`<pre><code${lang ? ` class="lang-${esc(lang)}"` : ""}>${esc(buf.join("\n"))}</code></pre>`);
      continue;
    }
    if (!line.trim()) { i += 1; continue; }
    let m = line.match(/^(#{1,6})\s+(.*)$/);
    if (m) { out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`); i += 1; continue; }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { out.push("<hr>"); i += 1; continue; }
    if (/^>\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^>\s?/, "")); i += 1; }
      out.push(`<blockquote>${markdownToHtml(buf.join("\n"))}</blockquote>`);
      continue;
    }
    if (line.includes("|") && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const head = cells(line);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim()) { rows.push(cells(lines[i])); i += 1; }
      out.push(`<table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${head.map((_, k) => `<td>${inline(r[k] ?? "")}</td>`).join("")}</tr>`).join("")}</tbody></table>`);
      continue;
    }
    if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) {
      const ordered = /^\s*\d+[.)]/.test(line);
      const items = [];
      while (i < lines.length && /^\s*([-*+]|\d+[.)])\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*([-*+]|\d+[.)])\s+/, "")); i += 1; }
      const li = items.map((t) => {
        const task = t.match(/^\[( |x|X)\]\s+(.*)$/);
        return task ? `<li class="task"><input type="checkbox" disabled${task[1] !== " " ? " checked" : ""}> ${inline(task[2])}</li>` : `<li>${inline(t)}</li>`;
      }).join("");
      out.push(ordered ? `<ol>${li}</ol>` : `<ul>${li}</ul>`);
      continue;
    }
    const buf = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|```|>\s?|\s*([-*+]|\d+[.)])\s+)/.test(lines[i])) { buf.push(lines[i]); i += 1; }
    out.push(`<p>${buf.map(inline).join("<br>")}</p>`);
  }
  return out.join("\n");
}

/* -------------------------------- CSV -------------------------------- */

/** Ayırıcıyı tahmin et: ilk satırlarda en tutarlı olan ; , \t |. */
export function sniffDelimiter(text) {
  const sample = String(text || "").split("\n").slice(0, 6).filter(Boolean);
  let best = ",";
  let bestScore = -1;
  for (const d of [",", ";", "\t", "|"]) {
    const counts = sample.map((l) => l.split(d).length - 1);
    if (!counts.length || counts[0] === 0) continue;
    const consistent = counts.every((c) => c === counts[0]);
    const score = (consistent ? 1000 : 0) + counts[0];
    if (score > bestScore) { bestScore = score; best = d; }
  }
  return best;
}

/** RFC 4180 CSV ayrıştırma (tırnaklı alanlar, kaçışlı "", satır içi yeni satır). */
export function parseCsv(text, delimiter = null) {
  const s = String(text ?? "").replace(/^﻿/, "");
  const d = delimiter || sniffDelimiter(s);
  const rows = [];
  let row = [];
  let field = "";
  let q = false;
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (q) {
      if (c === '"') { if (s[i + 1] === '"') { field += '"'; i += 1; } else q = false; } else field += c;
    } else if (c === '"' && field === "") q = true;
    else if (c === d) { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i += 1;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

export function toCsv(rows, delimiter = ",") {
  const cell = (v) => {
    const t = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
    return /["\n\r]/.test(t) || t.includes(delimiter) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  return rows.map((r) => r.map(cell).join(delimiter)).join("\n");
}

/** Sayıya benzeyen alanları sayıya çevir (JSON çıktısı için). */
const typed = (v) => (/^-?\d+(\.\d+)?$/.test(v) && !/^0\d/.test(v) ? Number(v) : v === "true" ? true : v === "false" ? false : v === "" ? null : v);

export function csvToJson(text, { header = true, types = true, delimiter = null } = {}) {
  const rows = parseCsv(text, delimiter);
  if (!rows.length) return [];
  if (!header) return rows.map((r) => r.map((v) => (types ? typed(v) : v)));
  const keys = rows[0].map((k, i) => k.trim() || `alan${i + 1}`);
  return rows.slice(1).map((r) => Object.fromEntries(keys.map((k, i) => [k, types ? typed(r[i] ?? "") : r[i] ?? ""])));
}

/** JSON (nesne dizisi ya da dizi dizisi) → satırlar (ilk satır başlık). */
export function jsonToRows(input) {
  const data = typeof input === "string" ? JSON.parse(input) : input;
  const list = Array.isArray(data) ? data : data && typeof data === "object" ? [data] : [];
  if (!list.length) return [];
  if (list.every(Array.isArray)) return list;
  const keys = [];
  list.forEach((o) => Object.keys(o || {}).forEach((k) => { if (!keys.includes(k)) keys.push(k); }));
  return [keys, ...list.map((o) => keys.map((k) => (o?.[k] == null ? "" : typeof o[k] === "object" ? JSON.stringify(o[k]) : o[k])))];
}

/* -------------------------------- regex -------------------------------- */

/** → { ok, error, matches: [{ index, text, groups: [..], named }], replaced } */
export function regexTest(pattern, flags, text, replacement = null) {
  let re;
  try { re = new RegExp(pattern, flags.includes("g") ? flags : `${flags}g`); } catch (e) { return { ok: false, error: e.message, matches: [] }; }
  const matches = [];
  const src = String(text ?? "");
  let m;
  let guard = 0;
  while ((m = re.exec(src)) && guard < 5000) {
    guard += 1;
    matches.push({ index: m.index, text: m[0], groups: m.slice(1), named: m.groups || null });
    if (m[0] === "") re.lastIndex += 1;
    if (!flags.includes("g")) break;
  }
  let replaced = null;
  if (replacement != null) {
    try { replaced = src.replace(new RegExp(pattern, flags), replacement); } catch { replaced = null; }
  }
  return { ok: true, error: null, matches, replaced };
}

export const REGEX_PRESETS = [
  { label: "E-posta", pattern: "[\\w.+-]+@[\\w-]+\\.[\\w.-]+", flags: "gi" },
  { label: "TR cep telefonu", pattern: "(?:\\+?90|0)?\\s?5\\d{2}\\s?\\d{3}\\s?\\d{2}\\s?\\d{2}", flags: "g" },
  { label: "TR IBAN", pattern: "TR\\d{2}(?:\\s?\\d{4}){5}\\s?\\d{2}", flags: "gi" },
  { label: "Tarih (GG.AA.YYYY)", pattern: "\\b(\\d{2})\\.(\\d{2})\\.(\\d{4})\\b", flags: "g" },
  { label: "Skor (2-1)", pattern: "\\b(\\d{1,2})\\s*[-:]\\s*(\\d{1,2})\\b", flags: "g" },
  { label: "Bağlantı (URL)", pattern: "https?:\\/\\/[^\\s)]+", flags: "gi" },
];

/* -------------------------------- özet (hash) -------------------------------- */

/** MD5 (RFC 1321), baytlar üzerinde. */
export function md5(bytes) {
  const data = bytes instanceof Uint8Array ? bytes : new TextEncoder().encode(String(bytes ?? ""));
  const K = new Uint32Array(64);
  for (let i = 0; i < 64; i += 1) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0;
  const S = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21];
  const len = data.length;
  const padded = new Uint8Array(((len + 8) >> 6) * 64 + 64);
  padded.set(data);
  padded[len] = 0x80;
  const bits = len * 8;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, bits >>> 0, true);
  view.setUint32(padded.length - 4, Math.floor(bits / 2 ** 32), true);
  let a0 = 0x67452301; let b0 = 0xefcdab89; let c0 = 0x98badcfe; let d0 = 0x10325476;
  const M = new Uint32Array(16);
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i += 1) M[i] = view.getUint32(off + i * 4, true);
    let A = a0; let B = b0; let C = c0; let D = d0;
    for (let i = 0; i < 64; i += 1) {
      let F; let g;
      if (i < 16) { F = (B & C) | (~B & D); g = i; } else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; } else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; } else { F = C ^ (B | ~D); g = (7 * i) % 16; }
      F = (F + A + K[i] + M[g]) >>> 0;
      A = D; D = C; C = B;
      B = (B + ((F << S[i]) | (F >>> (32 - S[i])))) >>> 0;
    }
    a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0;
  }
  const out = new DataView(new ArrayBuffer(16));
  [a0, b0, c0, d0].forEach((v, i) => out.setUint32(i * 4, v, true));
  return [...new Uint8Array(out.buffer)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

const hex = (buf) => [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, "0")).join("");

/** Tüm özetler: MD5, SHA-1, SHA-256, SHA-384, SHA-512 (WebCrypto). */
export async function hashAll(input) {
  const bytes = input instanceof Uint8Array ? input : new TextEncoder().encode(String(input ?? ""));
  const subtle = globalThis.crypto?.subtle;
  const out = { "MD5": md5(bytes) };
  for (const alg of ["SHA-1", "SHA-256", "SHA-384", "SHA-512"]) out[alg] = subtle ? hex(await subtle.digest(alg, bytes)) : "";
  return out;
}
