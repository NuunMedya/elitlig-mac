// Tablolar: sayfa modelinin okunması (arayüzden bağımsız, testli).
//
// Sayfa: {
//   name, rows, cols, cells: { A1: { v, s } }, colW: { A: px },
//   rowH:      { "5": px }            satır yükseklikleri (1 tabanlı satır no)
//   merges:    ["A1:C2", …]          birleştirilmiş hücreler
//   frozen:    { r, c }              dondurulmuş satır/sütun sayısı (eski: freeze: true → r = 1)
//   hiddenRows / hiddenCols: [0 tabanlı indeks]
//   colStyle:  { A: stil }, rowStyle: { "5": stil }   tüm sütun/satır biçimi
//   cf:        [{ id, ref, type, a, b, style, colors }]  koşullu biçimlendirme
//   dv:        [{ id, ref, list: [..] | source: "=$A$1:$A$5", strict }] veri doğrulama
//   filter:    { ref, crit: { "<sütun indeksi>": { hide: [metin], op, a, b } } }
//   noGrid, tab (sekme rengi), id (eşzamanlı birleştirme için kalıcı kimlik)
// }
// Hücre stili (s): b i u st (üstü çizili) fs (pt) ff (yazı tipi) c bg al
// (left|center|right) va (top|middle|bottom) wr (kaydır) rot (−90…90) ind
// f (sayı biçimi) d (ondalık) ng (binlik ayracı yok) bd: { t|r|b|l: { s, c } }
import { addr, colIndex, colName, formatValue, isError, isNumeric } from "./sheetEngine";

export const DEF_W = 100;
export const DEF_H = 24;
export const DEF_FONT_PT = 10;
export const BORDER_STYLES = ["thin", "medium", "thick", "dashed", "dotted", "double"];
export const FONT_FAMILIES = ["", "Calibri", "Arial", "Segoe UI", "Helvetica", "Verdana", "Tahoma", "Times New Roman", "Georgia", "Courier New", "Consolas"];
export const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36, 48, 72];

/* --------------------------------- aralıklar --------------------------------- */

/** "A1:C3" | "B2" → { r1, c1, r2, c2 } (0 tabanlı) ya da null. */
export function parseRange(text) {
  const m = /^\$?([A-Za-z]{1,3})\$?(\d{1,6})(?::\$?([A-Za-z]{1,3})\$?(\d{1,6}))?$/.exec(String(text || "").trim());
  if (!m) return null;
  const a = { col: colIndex(m[1]), row: Number(m[2]) - 1 };
  const b = m[3] ? { col: colIndex(m[3]), row: Number(m[4]) - 1 } : a;
  if (a.row < 0 || b.row < 0) return null;
  return { r1: Math.min(a.row, b.row), r2: Math.max(a.row, b.row), c1: Math.min(a.col, b.col), c2: Math.max(a.col, b.col) };
}
export const rangeText = ({ r1, c1, r2, c2 }) => (r1 === r2 && c1 === c2 ? addr(c1, r1) : `${addr(c1, r1)}:${addr(c2, r2)}`);
export const intersects = (a, b) => a.r1 <= b.r2 && b.r1 <= a.r2 && a.c1 <= b.c2 && b.c1 <= a.c2;
export const contains = (outer, inner) => inner.r1 >= outer.r1 && inner.r2 <= outer.r2 && inner.c1 >= outer.c1 && inner.c2 <= outer.c2;
export const inRect = (rect, r, c) => r >= rect.r1 && r <= rect.r2 && c >= rect.c1 && c <= rect.c2;
export const rectSize = (rect) => (rect.r2 - rect.r1 + 1) * (rect.c2 - rect.c1 + 1);

/* -------------------------------- birleştirme -------------------------------- */

const mergeCache = new WeakMap();
/** Sayfanın birleştirmeleri: { list: [rect], at(r, c) → rect | null }. */
export function mergeIndex(sheet) {
  const src = sheet?.merges;
  if (!src || !src.length) return EMPTY_MERGES;
  if (mergeCache.has(src)) return mergeCache.get(src);
  const list = src.map(parseRange).filter((m) => m && rectSize(m) > 1);
  const map = new Map();
  for (const m of list) {
    // Çok büyük birleştirmeler (tüm sütun) hücre hücre değil, satır satır taranır.
    for (let r = m.r1; r <= m.r2; r += 1) {
      let row = map.get(r);
      if (!row) { row = []; map.set(r, row); }
      row.push(m);
    }
  }
  const idx = {
    list,
    at(r, c) {
      const row = map.get(r);
      if (!row) return null;
      for (const m of row) if (c >= m.c1 && c <= m.c2) return m;
      return null;
    },
    inRows(r1, r2) {
      const out = new Set();
      for (let r = r1; r <= r2; r += 1) for (const m of map.get(r) || []) out.add(m);
      return [...out];
    },
  };
  mergeCache.set(src, idx);
  return idx;
}
const EMPTY_MERGES = { list: [], at: () => null, inRows: () => [] };

/** Aralığı, kesiştiği birleştirmeleri tamamen içerecek kadar büyütür (Excel gibi). */
export function expandToMerges(sheet, range) {
  const idx = mergeIndex(sheet);
  if (!idx.list.length) return range;
  let out = { ...range };
  for (let guard = 0; guard < 20; guard += 1) {
    let grown = false;
    for (const m of idx.list) {
      if (intersects(m, out) && !contains(out, m)) {
        out = { r1: Math.min(out.r1, m.r1), r2: Math.max(out.r2, m.r2), c1: Math.min(out.c1, m.c1), c2: Math.max(out.c2, m.c2) };
        grown = true;
      }
    }
    if (!grown) break;
  }
  return out;
}

/* --------------------------------- görünüm --------------------------------- */

export function getFrozen(sheet) {
  const f = sheet?.frozen;
  if (f && (f.r || f.c)) return { r: Math.max(0, Number(f.r) || 0), c: Math.max(0, Number(f.c) || 0) };
  return { r: sheet?.freeze ? 1 : 0, c: 0 };
}

const setCache = new WeakMap();
const asSet = (list) => {
  if (!list || !list.length) return EMPTY_SET;
  if (!setCache.has(list)) setCache.set(list, new Set(list));
  return setCache.get(list);
};
const EMPTY_SET = new Set();
export const hiddenRowSet = (sheet) => asSet(sheet?.hiddenRows);
export const hiddenColSet = (sheet) => asSet(sheet?.hiddenCols);

export const colWidth = (sheet, c) => sheet?.colW?.[colName(c)] || DEF_W;
export const rowHeight = (sheet, r) => sheet?.rowH?.[r + 1] || DEF_H;

/* --------------------------------- biçimler --------------------------------- */

/** Hücrenin geçerli biçimi: sütun < satır < hücre. */
export function styleAt(sheet, r, c) {
  const cell = sheet?.cells?.[addr(c, r)]?.s;
  const cs = sheet?.colStyle?.[colName(c)];
  const rs = sheet?.rowStyle?.[r + 1];
  if (!cs && !rs) return cell || NO_STYLE;
  return { ...(cs || {}), ...(rs || {}), ...(cell || {}) };
}
const NO_STYLE = Object.freeze({});

/** Kenarlık tanımı: { s: "thin", c: "#000000" } → çizim kalınlığı. */
export const borderWidth = (b) => (!b ? 0 : b.s === "thick" ? 3 : b.s === "medium" || b.s === "double" ? 2 : 1);

/* ----------------------------- koşullu biçimlendirme ----------------------------- */

export const CF_TYPES = [
  ["gt", "Büyüktür"], ["lt", "Küçüktür"], ["between", "Arasında"], ["eq", "Eşittir"], ["neq", "Eşit değildir"],
  ["contains", "Metin içerir"], ["notContains", "Metin içermez"], ["begins", "İle başlar"], ["ends", "İle biter"],
  ["blank", "Boş"], ["notBlank", "Boş değil"], ["dup", "Yinelenen değerler"], ["unique", "Benzersiz değerler"],
  ["top", "İlk N (en büyük)"], ["bottom", "Son N (en küçük)"], ["aboveAvg", "Ortalamanın üstü"], ["belowAvg", "Ortalamanın altı"],
  ["scale", "Renk ölçeği"], ["bar", "Veri çubuğu"],
];
export const CF_PRESETS = [
  { key: "red", label: "Açık kırmızı dolgu, koyu kırmızı metin", style: { bg: "#ffc7ce", c: "#9c0006" } },
  { key: "yellow", label: "Sarı dolgu, koyu sarı metin", style: { bg: "#ffeb9c", c: "#9c5700" } },
  { key: "green", label: "Yeşil dolgu, koyu yeşil metin", style: { bg: "#c6efce", c: "#006100" } },
  { key: "redText", label: "Kırmızı metin", style: { c: "#dc2626" } },
  { key: "bold", label: "Kalın", style: { b: true } },
  { key: "blue", label: "Açık mavi dolgu", style: { bg: "#dbeafe", c: "#1e3a8a" } },
];

const numOf = (v) => (typeof v === "number" ? v : v && typeof v === "object" && "date" in v ? v.date : null);
const textOf = (v) => (v == null ? "" : isError(v) ? v.code : typeof v === "boolean" ? (v ? "DOĞRU" : "YANLIŞ") : typeof v === "number" ? String(v) : numOf(v) != null ? String(numOf(v)) : String(v));
const lower = (t) => String(t).toLocaleLowerCase("tr-TR");
const cfNum = (x) => {
  if (typeof x === "number") return x;
  const n = Number(String(x ?? "").replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

const mix = (a, b, t) => {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (shift) => Math.round(((pa >> shift) & 255) * (1 - t) + ((pb >> shift) & 255) * t);
  return `#${[16, 8, 0].map((s) => ch(s).toString(16).padStart(2, "0")).join("")}`;
};

/**
 * Koşullu biçim hesaplayıcı. valueAt(r, c) hücre sonucunu verir.
 * at(r, c) → { style, bar: { ratio, color } } | null. Kural başına aralık
 * istatistikleri (yinelenen, ilk N, ortalama, ölçek) bir kez hesaplanır.
 */
export function createCfEvaluator(sheet, valueAt) {
  const rules = (sheet?.cf || []).map((rule) => ({ rule, rect: parseRange(rule.ref) })).filter((x) => x.rect);
  if (!rules.length) return { at: () => null, empty: true };
  const stats = new Map();
  const statsOf = (entry) => {
    if (stats.has(entry)) return stats.get(entry);
    const { rect } = entry;
    const nums = [];
    const counts = new Map();
    const r2 = Math.min(rect.r2, (sheet.rows || 1) - 1);
    const c2 = Math.min(rect.c2, (sheet.cols || 1) - 1);
    if ((r2 - rect.r1 + 1) * (c2 - rect.c1 + 1) <= 200000) {
      for (let r = rect.r1; r <= r2; r += 1) {
        for (let c = rect.c1; c <= c2; c += 1) {
          if (!sheet.cells[addr(c, r)]) continue;
          const v = valueAt(r, c);
          if (v == null || v === "") continue;
          const n = numOf(v);
          if (n != null) nums.push(n);
          const k = lower(textOf(v));
          counts.set(k, (counts.get(k) || 0) + 1);
        }
      }
    }
    const sorted = [...nums].sort((a, b) => a - b);
    const out = {
      counts,
      min: sorted.length ? sorted[0] : 0,
      max: sorted.length ? sorted[sorted.length - 1] : 0,
      avg: nums.length ? nums.reduce((s, n) => s + n, 0) / nums.length : 0,
      sorted,
    };
    stats.set(entry, out);
    return out;
  };

  const test = (entry, v) => {
    const { rule } = entry;
    const n = numOf(v);
    const t = lower(textOf(v));
    const a = rule.a;
    const b = rule.b;
    switch (rule.type) {
      case "gt": return n != null && cfNum(a) != null && n > cfNum(a);
      case "lt": return n != null && cfNum(a) != null && n < cfNum(a);
      case "ge": return n != null && cfNum(a) != null && n >= cfNum(a);
      case "le": return n != null && cfNum(a) != null && n <= cfNum(a);
      case "between": { const lo = Math.min(cfNum(a) ?? 0, cfNum(b) ?? 0); const hi = Math.max(cfNum(a) ?? 0, cfNum(b) ?? 0); return n != null && n >= lo && n <= hi; }
      case "eq": return cfNum(a) != null && n != null ? n === cfNum(a) : t === lower(a ?? "");
      case "neq": return cfNum(a) != null && n != null ? n !== cfNum(a) : t !== lower(a ?? "");
      case "contains": return v != null && v !== "" && t.includes(lower(a ?? ""));
      case "notContains": return !t.includes(lower(a ?? ""));
      case "begins": return v != null && v !== "" && t.startsWith(lower(a ?? ""));
      case "ends": return v != null && v !== "" && t.endsWith(lower(a ?? ""));
      case "blank": return v == null || v === "";
      case "notBlank": return v != null && v !== "";
      case "dup": return v != null && v !== "" && (statsOf(entry).counts.get(t) || 0) > 1;
      case "unique": return v != null && v !== "" && (statsOf(entry).counts.get(t) || 0) === 1;
      case "top": case "bottom": {
        if (n == null) return false;
        const s = statsOf(entry).sorted;
        const k = Math.max(1, Math.min(s.length, Math.floor(cfNum(a) ?? 10)));
        return rule.type === "top" ? n >= s[s.length - k] : n <= s[k - 1];
      }
      case "aboveAvg": return n != null && n > statsOf(entry).avg;
      case "belowAvg": return n != null && n < statsOf(entry).avg;
      default: return false;
    }
  };

  return {
    empty: false,
    at(r, c) {
      let style = null;
      let bar = null;
      for (const entry of rules) {
        if (!inRect(entry.rect, r, c)) continue;
        const v = valueAt(r, c);
        const { rule } = entry;
        if (rule.type === "scale" || rule.type === "bar") {
          const n = numOf(v);
          if (n == null) continue;
          const st = statsOf(entry);
          const span = st.max - st.min;
          const ratio = span ? (n - st.min) / span : 1;
          if (rule.type === "bar") bar = { ratio: Math.max(0.04, ratio), color: rule.colors?.[0] || "#638ec6" };
          else {
            const cols = rule.colors?.length >= 2 ? rule.colors : ["#f8696b", "#ffeb84", "#63be7b"];
            const bg = cols.length >= 3
              ? (ratio < 0.5 ? mix(cols[0], cols[1], ratio * 2) : mix(cols[1], cols[2], (ratio - 0.5) * 2))
              : mix(cols[0], cols[1], ratio);
            style = { ...(style || {}), bg };
          }
          continue;
        }
        if (test(entry, v)) style = { ...(style || {}), ...(rule.style || {}) };
      }
      return style || bar ? { style, bar } : null;
    },
  };
}

/* ------------------------------- veri doğrulama ------------------------------- */

export function validationAt(sheet, r, c) {
  for (const rule of sheet?.dv || []) {
    const rect = parseRange(rule.ref);
    if (rect && inRect(rect, r, c)) return rule;
  }
  return null;
}

/** Liste doğrulamasının seçenekleri (kaynak aralık hesaplanmış değerlerle). */
export function validationItems(rule, sheet, valueAt) {
  if (!rule) return [];
  if (Array.isArray(rule.list) && rule.list.length) return rule.list.map(String);
  const rect = parseRange(String(rule.source || "").replace(/^=/, "").replace(/^[^!]*!/, ""));
  if (!rect) return [];
  const out = [];
  for (let r = rect.r1; r <= Math.min(rect.r2, rect.r1 + 500); r += 1) {
    for (let c = rect.c1; c <= rect.c2; c += 1) {
      const v = valueAt(r, c);
      if (v != null && v !== "") out.push(formatValue(v, styleAt(sheet, r, c)));
    }
  }
  return [...new Set(out)];
}

/** Yazılan değer listede mi? (büyük/küçük harf duyarsız) */
export function isValidEntry(rule, sheet, valueAt, text) {
  if (!rule || !rule.strict || text === "" || text == null) return true;
  const items = validationItems(rule, sheet, valueAt).map(lower);
  return items.includes(lower(text));
}

/* ---------------------------------- süzgeç ---------------------------------- */

/** Süzgeç değer metni (liste ve karşılaştırma için): biçimli görünüm. */
export const filterText = (v, style) => (v == null || v === "" ? "" : formatValue(v, style || {}));

/**
 * Süzgeçle gizlenen satırlar (Set). Başlık satırı (ref'in ilk satırı) asla
 * gizlenmez. crit[col] = { hide: [metin…] } ya da { op, a, b }.
 */
export function filteredRows(sheet, valueAt) {
  const f = sheet?.filter;
  const rect = f && parseRange(f.ref);
  if (!rect || !f.crit || !Object.keys(f.crit).length) return EMPTY_SET;
  const out = new Set();
  const crits = Object.entries(f.crit).map(([c, crit]) => [Number(c), crit, crit.hide ? new Set(crit.hide.map(lower)) : null]);
  for (let r = rect.r1 + 1; r <= rect.r2; r += 1) {
    for (const [c, crit, hide] of crits) {
      const v = valueAt(r, c);
      const t = lower(filterText(v, styleAt(sheet, r, c)));
      if (hide && hide.has(t)) { out.add(r); break; }
      if (crit.op && !matchesCondition(crit, v, t)) { out.add(r); break; }
    }
  }
  return out;
}

function matchesCondition(crit, v, t) {
  const n = numOf(v);
  const a = cfNum(crit.a);
  switch (crit.op) {
    case "gt": return n != null && a != null && n > a;
    case "lt": return n != null && a != null && n < a;
    case "ge": return n != null && a != null && n >= a;
    case "le": return n != null && a != null && n <= a;
    case "eq": return a != null && n != null ? n === a : t === lower(crit.a ?? "");
    case "neq": return a != null && n != null ? n !== a : t !== lower(crit.a ?? "");
    case "contains": return t.includes(lower(crit.a ?? ""));
    case "notContains": return !t.includes(lower(crit.a ?? ""));
    case "begins": return t.startsWith(lower(crit.a ?? ""));
    case "between": { const b = cfNum(crit.b); return n != null && a != null && b != null && n >= Math.min(a, b) && n <= Math.max(a, b); }
    case "blank": return t === "";
    case "notBlank": return t !== "";
    default: return true;
  }
}

/** Süzgeç açılır listesindeki benzersiz değerler: [{ text, count }], sıralı. */
export function filterValues(sheet, col, valueAt) {
  const rect = parseRange(sheet?.filter?.ref);
  if (!rect) return [];
  const counts = new Map();
  const sample = new Map();
  for (let r = rect.r1 + 1; r <= rect.r2; r += 1) {
    const v = valueAt(r, col);
    const text = filterText(v, styleAt(sheet, r, col));
    const k = lower(text);
    counts.set(k, (counts.get(k) || 0) + 1);
    if (!sample.has(k)) sample.set(k, { text, num: numOf(v) });
  }
  return [...counts.entries()].map(([k, count]) => ({ key: k, text: sample.get(k).text, num: sample.get(k).num, count }))
    .sort((a, b) => (a.text === "" ? 1 : b.text === "" ? -1 : a.num != null && b.num != null ? a.num - b.num : a.text.localeCompare(b.text, "tr", { numeric: true })));
}

/* --------------------------------- istatistik --------------------------------- */

/** Durum çubuğu: Ortalama, Sayım, Sayısal sayım, Min, Maks, Toplam. */
export function selectionStats(values) {
  let count = 0;
  let numbers = 0;
  let sum = 0;
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (v == null || v === "") continue;
    count += 1;
    const n = isNumeric(v) ? numOf(v) : null;
    if (n == null) continue;
    numbers += 1;
    sum += n;
    if (n < min) min = n;
    if (n > max) max = n;
  }
  return { count, numbers, sum, avg: numbers ? sum / numbers : null, min: numbers ? min : null, max: numbers ? max : null };
}
