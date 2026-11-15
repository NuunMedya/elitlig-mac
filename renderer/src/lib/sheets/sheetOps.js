// Tablolar: çalışma kitabı üzerinde değişmez (immutable) işlemler.
// Her işlem yeni bir çalışma kitabı döner; geri al / yinele bu sayede basittir.
import { addr, adjustFormula, colIndex, colName, formatValue, isError, parseAddr, parseLiteral, shiftFormula } from "./sheetEngine";
import { contains, expandToMerges, getFrozen, intersects, mergeIndex, parseRange, rangeText, styleAt } from "./sheetModel";

export const MAX_ROWS = 20000;
export const MAX_COLS = 200;
export const DEFAULT_ROWS = 1000;
export const DEFAULT_COLS = 26;

export const sheetId = () => `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
export const blankSheet = (name = "Sayfa1") => ({ id: sheetId(), name, rows: DEFAULT_ROWS, cols: DEFAULT_COLS, cells: {}, colW: {} });
export const blankWorkbook = () => ({ sheets: [blankSheet()] });

/** Seçimi (iki köşe) sıralı aralığa çevirir. */
export const normRange = (a, b = a) => ({
  r1: Math.min(a.row, b.row), r2: Math.max(a.row, b.row),
  c1: Math.min(a.col, b.col), c2: Math.max(a.col, b.col),
});
export const rangeLabel = ({ r1, r2, c1, c2 }) => (r1 === r2 && c1 === c2 ? addr(c1, r1) : `${addr(c1, r1)}:${addr(c2, r2)}`);
export const eachCell = ({ r1, r2, c1, c2 }, fn) => {
  for (let r = r1; r <= r2; r += 1) for (let c = c1; c <= c2; c += 1) fn(addr(c, r), r, c);
};

const withSheet = (book, si, fn) => ({ ...book, sheets: book.sheets.map((s, i) => (i === si ? fn(s) : s)) });
const patchSheet = (book, si, patch) => withSheet(book, si, (s) => {
  const next = { ...s, ...patch };
  for (const [k, v] of Object.entries(patch)) if (v === undefined || v === null || (Array.isArray(v) && !v.length) || (v && typeof v === "object" && !Array.isArray(v) && !Object.keys(v).length)) delete next[k];
  return next;
});

/** Hücrelerin değerini/biçimini yazar. updates: { A1: { v?, s? } }; v === "" ve biçim yoksa hücre silinir. */
export function writeCells(book, si, updates) {
  return withSheet(book, si, (sheet) => {
    const cells = { ...sheet.cells };
    for (const [key, patch] of Object.entries(updates)) {
      const current = cells[key] || {};
      const next = { ...current, ...patch };
      if (patch.s !== undefined) next.s = patch.s && Object.keys(patch.s).length ? patch.s : undefined;
      if (!next.s) delete next.s;
      if ((next.v == null || next.v === "") && !next.s) delete cells[key];
      else cells[key] = { v: next.v ?? "", ...(next.s ? { s: next.s } : {}) };
    }
    return { ...sheet, cells };
  });
}

const applyPatch = (base, patch) => {
  const s = { ...(base || {}) };
  for (const [k, v] of Object.entries(patch)) {
    if (v == null || v === false || v === "") delete s[k];
    else s[k] = v;
  }
  return s;
};
const isFullCols = (sheet, range) => range.r1 === 0 && range.r2 >= sheet.rows - 1;
const isFullRows = (sheet, range) => range.c1 === 0 && range.c2 >= sheet.cols - 1;

/**
 * Aralıktaki hücrelerin biçimine yama uygular (ör. { b: true }); null değer
 * anahtarı siler. Tüm sütun/satır seçiliyse sütun/satır biçimi olarak saklanır
 * (10 000 satırı tek tek yazmadan) ve mevcut hücrelere de uygulanır.
 */
export function styleRange(book, si, range, patch) {
  const sheet = book.sheets[si];
  const fullCols = isFullCols(sheet, range);
  const fullRows = !fullCols && isFullRows(sheet, range);
  if (fullCols || fullRows) {
    const key = fullCols ? "colStyle" : "rowStyle";
    const map = { ...(sheet[key] || {}) };
    const lo = fullCols ? range.c1 : range.r1;
    const hi = fullCols ? range.c2 : range.r2;
    for (let i = lo; i <= hi; i += 1) {
      const k = fullCols ? colName(i) : String(i + 1);
      const next = applyPatch(map[k], patch);
      if (Object.keys(next).length) map[k] = next; else delete map[k];
    }
    const updates = {};
    for (const [k, cell] of Object.entries(sheet.cells)) {
      const p = parseAddr(k);
      if (!p || (fullCols ? p.col < lo || p.col > hi : p.row < lo || p.row > hi)) continue;
      if (cell.s || fullRows || Object.values(patch).some((v) => v == null || v === false)) updates[k] = { s: applyPatch(cell.s, patch) };
    }
    const next = writeCells(book, si, updates);
    return patchSheet(next, si, { [key]: map });
  }
  const updates = {};
  eachCell(range, (key) => { updates[key] = { s: applyPatch(sheet.cells[key]?.s, patch) }; });
  return writeCells(book, si, updates);
}

/** Aralığın biçimini yama yerine fonksiyonla değiştirir (ondalık artır/azalt gibi). */
export function mapStyles(book, si, range, fn) {
  const sheet = book.sheets[si];
  const updates = {};
  const r2 = isFullCols(sheet, range) ? Math.min(range.r2, Math.max(0, usedBounds(sheet).rows - 1)) : range.r2;
  eachCell({ ...range, r2 }, (key, r, c) => { updates[key] = { s: fn(styleAt(sheet, r, c), sheet.cells[key]?.s || {}) || null }; });
  return writeCells(book, si, updates);
}

export function clearRange(book, si, range, { values = true, styles = false } = {}) {
  const sheet = book.sheets[si];
  const updates = {};
  const lim = { ...range, r2: Math.min(range.r2, sheet.rows - 1), c2: Math.min(range.c2, sheet.cols - 1) };
  if (rectArea(lim) > 50000) {
    // Büyük aralık: yalnız dolu hücreler gezilir.
    for (const key of Object.keys(sheet.cells)) {
      const p = parseAddr(key);
      if (p && p.row >= lim.r1 && p.row <= lim.r2 && p.col >= lim.c1 && p.col <= lim.c2) updates[key] = { ...(values ? { v: "" } : {}), ...(styles ? { s: null } : {}) };
    }
  } else eachCell(lim, (key) => { updates[key] = { ...(values ? { v: "" } : {}), ...(styles ? { s: null } : {}) }; });
  let out = writeCells(book, si, updates);
  if (styles) {
    const s = out.sheets[si];
    const patch = {};
    if (isFullCols(s, range) && s.colStyle) { const m = { ...s.colStyle }; for (let c = range.c1; c <= range.c2; c += 1) delete m[colName(c)]; patch.colStyle = m; }
    if (isFullRows(s, range) && s.rowStyle) { const m = { ...s.rowStyle }; for (let r = range.r1; r <= range.r2; r += 1) delete m[r + 1]; patch.rowStyle = m; }
    if (Object.keys(patch).length) out = patchSheet(out, si, patch);
  }
  return out;
}
const rectArea = (r) => (r.r2 - r.r1 + 1) * (r.c2 - r.c1 + 1);

/**
 * Kopyalanan blok: 2B dizi { v, s, val } ve kaynak sol üst köşesi. val:
 * hesaplanmış değerin metni (Değerleri yapıştır için). Birleştirmeler göreli
 * olarak taşınır.
 */
export function copyBlock(sheet, range, valueAt = null) {
  const rows = [];
  for (let r = range.r1; r <= range.r2; r += 1) {
    const row = [];
    for (let c = range.c1; c <= range.c2; c += 1) {
      const cell = sheet.cells[addr(c, r)];
      const s = styleAt(sheet, r, c);
      const out = { v: cell?.v ?? "" };
      if (Object.keys(s).length) out.s = { ...s };
      if (valueAt && typeof out.v === "string" && out.v.startsWith("=")) out.val = literalText(valueAt(r, c));
      row.push(out);
    }
    rows.push(row);
  }
  const merges = mergeIndex(sheet).list.filter((m) => contains(range, m)).map((m) => ({ r1: m.r1 - range.r1, r2: m.r2 - range.r1, c1: m.c1 - range.c1, c2: m.c2 - range.c1 }));
  return { rows, origin: { row: range.r1, col: range.c1 }, merges };
}

/** Hesaplanmış değeri hücreye yazılabilecek metne çevirir. */
export function literalText(v) {
  if (v == null) return "";
  if (isError(v)) return v.code;
  if (typeof v === "boolean") return v ? "DOĞRU" : "YANLIŞ";
  if (typeof v === "number") return String(v).replace(".", ",");
  if (typeof v === "object" && "date" in v) return formatValue(v, Number.isInteger(v.date) ? { f: "date" } : { f: "datetime" });
  const t = String(v);
  return t.startsWith("=") || typeof parseLiteral(t) !== "string" ? `'${t}` : t;
}

/**
 * Bloğu hedefe yapıştırır; formüller hedefe göre kaydırılır. Hedef aralık
 * bloğun katıysa blok tekrarlanır. mode: "all" | "values" | "formats" | "formulas";
 * transpose: satır/sütun çevrilir.
 */
export function pasteBlock(book, si, target, block, { valuesOnly = false, mode = valuesOnly ? "values" : "all", transpose = false } = {}) {
  let rowsIn = block.rows;
  if (transpose && rowsIn.length) rowsIn = rowsIn[0].map((_, j) => rowsIn.map((row) => row[j]));
  const h = rowsIn.length;
  const w = rowsIn[0]?.length || 0;
  if (!h || !w) return book;
  const tr = target.r2 - target.r1 + 1;
  const tc = target.c2 - target.c1 + 1;
  const reps = { r: tr % h === 0 ? tr / h : 1, c: tc % w === 0 ? tc / w : 1 };
  const sheet = book.sheets[si];
  const updates = {};
  const newMerges = [];
  for (let rr = 0; rr < reps.r; rr += 1) {
    for (let cc = 0; cc < reps.c; cc += 1) {
      const top = target.r1 + rr * h;
      const left = target.c1 + cc * w;
      rowsIn.forEach((row, i) => row.forEach((cell, j) => {
        const r = top + i;
        const c = left + j;
        if (r >= sheet.rows || c >= sheet.cols) return;
        const key = addr(c, r);
        let v = cell.v ?? "";
        const src = transpose ? { row: (block.origin?.row ?? 0) + j, col: (block.origin?.col ?? 0) + i } : { row: (block.origin?.row ?? 0) + i, col: (block.origin?.col ?? 0) + j };
        if (mode === "values") v = cell.val ?? v;
        else if (block.origin) v = shiftFormula(v, r - src.row, c - src.col);
        if (mode === "formats") updates[key] = { s: cell.s || null };
        else if (mode === "values" || mode === "formulas") updates[key] = { v };
        else updates[key] = { v, s: cell.s || null };
      }));
      if (mode === "all" || mode === "formats") {
        for (const m of block.merges || []) {
          const mm = transpose ? { r1: m.c1, r2: m.c2, c1: m.r1, c2: m.r2 } : m;
          if (top + mm.r2 < sheet.rows && left + mm.c2 < sheet.cols) newMerges.push(rangeText({ r1: top + mm.r1, r2: top + mm.r2, c1: left + mm.c1, c2: left + mm.c2 }));
        }
      }
    }
  }
  let out = writeCells(book, si, updates);
  if (mode === "all" || mode === "formats") {
    const area = { r1: target.r1, c1: target.c1, r2: Math.min(sheet.rows - 1, target.r1 + h * reps.r - 1), c2: Math.min(sheet.cols - 1, target.c1 + w * reps.c - 1) };
    const kept = (sheet.merges || []).filter((m) => { const rect = parseRange(m); return rect && !intersects(rect, area); });
    if (kept.length !== (sheet.merges || []).length || newMerges.length) out = patchSheet(out, si, { merges: [...kept, ...newMerges] });
  }
  return out;
}

/** Panodan gelen düz metni (sekme/satır ayraçlı, tırnaklı alanlar dahil) bloğa çevirir. */
export function blockFromText(text) {
  const src = String(text ?? "").replace(/\r\n?/g, "\n").replace(/\n$/, "");
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === "\t") { row.push({ v: cell }); cell = ""; }
    else if (ch === "\n") { row.push({ v: cell }); rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  row.push({ v: cell });
  rows.push(row);
  return { rows, origin: null };
}
export const blockToText = (block) => block.rows.map((row) => row.map((c) => {
  const t = String(c.v ?? "");
  return /[\t\n"]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}).join("\t")).join("\n");

/** Aşağı / sağa doldurma (⌘D / ⌘R): ilk satırı (sütunu) aralığa kaydırarak kopyalar. */
export function fill(book, si, range, direction = "down") {
  const sheet = book.sheets[si];
  const updates = {};
  if (direction === "down") {
    for (let c = range.c1; c <= range.c2; c += 1) {
      const src = sheet.cells[addr(c, range.r1)] || { v: "" };
      for (let r = range.r1 + 1; r <= range.r2; r += 1) updates[addr(c, r)] = { v: shiftFormula(src.v, r - range.r1, 0), s: src.s || null };
    }
  } else {
    for (let r = range.r1; r <= range.r2; r += 1) {
      const src = sheet.cells[addr(range.c1, r)] || { v: "" };
      for (let c = range.c1 + 1; c <= range.c2; c += 1) updates[addr(c, r)] = { v: shiftFormula(src.v, 0, c - range.c1), s: src.s || null };
    }
  }
  return writeCells(book, si, updates);
}

/* ------------------------------ doldurma tutamacı ------------------------------ */

const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const MONTHS_SHORT = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
const DAYS = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];
const DAYS_SHORT = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];
const LISTS = [MONTHS, MONTHS_SHORT, DAYS, DAYS_SHORT, ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"], ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]];
const low = (t) => String(t).toLocaleLowerCase("tr-TR");
const numText = (n) => String(Math.round(n * 1e10) / 1e10).replace(".", ",");
const pad = (n) => String(n).padStart(2, "0");
const serialText = (serial) => { const d = new Date(Date.UTC(1899, 11, 30) + serial * 86400000); return `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`; };
const serialParts = (serial) => { const d = new Date(Date.UTC(1899, 11, 30) + serial * 86400000); return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate() }; };
const partsSerial = (y, m, d) => Math.round((Date.UTC(y, m, d) - Date.UTC(1899, 11, 30)) / 86400000);

/** Kaynak değerlerin dizisinden (Excel'in otomatik doldurması gibi) i. değeri üreten fonksiyon. */
function seriesGenerator(items, mode) {
  const k = items.length;
  const raws = items.map((it) => it.v ?? "");
  const isFormula = raws.some((v) => typeof v === "string" && v.startsWith("="));
  if (isFormula || mode === "copy") return null;
  const lits = raws.map((v) => (v === "" ? null : parseLiteral(v)));
  // Sayılar
  if (lits.every((l) => typeof l === "number")) {
    if (k === 1) return mode === "series" ? (x) => numText(lits[0] + x) : null;
    const xs = lits.map((_, i) => i);
    const mx = (k - 1) / 2;
    const my = lits.reduce((s, n) => s + n, 0) / k;
    const b = xs.reduce((s, x, i) => s + (x - mx) * (lits[i] - my), 0) / xs.reduce((s, x) => s + (x - mx) ** 2, 0);
    const a = my - b * mx;
    return (x) => numText(a + b * x);
  }
  // Tarihler
  if (lits.every((l) => l && typeof l === "object" && "date" in l)) {
    const ds = lits.map((l) => l.date);
    if (k === 1) return (x) => serialText(ds[0] + x);
    const ps = ds.map(serialParts);
    const monthStep = ps.every((p) => p.d === ps[0].d) && ps.slice(1).every((p, i) => (p.y - ps[i].y) * 12 + p.m - ps[i].m === (ps[1].y - ps[0].y) * 12 + ps[1].m - ps[0].m) && (ps[1].y !== ps[0].y || ps[1].m !== ps[0].m);
    if (monthStep) {
      const step = (ps[1].y - ps[0].y) * 12 + ps[1].m - ps[0].m;
      return (x) => serialText(partsSerial(ps[0].y, ps[0].m + step * x, ps[0].d));
    }
    const step = (ds[k - 1] - ds[0]) / (k - 1);
    return (x) => serialText(Math.round(ds[0] + step * x));
  }
  // Ay / gün adları
  for (const list of LISTS) {
    const idx = raws.map((v) => list.findIndex((n) => low(n) === low(String(v).trim())));
    if (idx.every((i) => i >= 0)) {
      const step = k > 1 ? (idx[1] - idx[0] + list.length) % list.length || 1 : 1;
      const upper = String(raws[0]) === String(raws[0]).toLocaleUpperCase("tr-TR") && String(raws[0]).length > 1;
      return (x) => { const name = list[(((idx[0] + step * x) % list.length) + list.length) % list.length]; return upper ? name.toLocaleUpperCase("tr-TR") : name; };
    }
  }
  // Sonu sayıyla biten metin: "Hafta 1" → "Hafta 2"
  const parts = raws.map((v) => /^(.*?)(\d+)(\D*)$/.exec(String(v)));
  if (parts.every((p) => p && p[1] === parts[0][1] && p[3] === parts[0][3] && p[1] !== "")) {
    const nums = parts.map((p) => Number(p[2]));
    const step = k > 1 ? (nums[k - 1] - nums[0]) / (k - 1) : 1;
    const width = parts[0][2].startsWith("0") ? parts[0][2].length : 0;
    return (x) => `${parts[0][1]}${String(Math.max(0, Math.round(nums[0] + step * x))).padStart(width, "0")}${parts[0][3]}`;
  }
  return null;
}

/**
 * Doldurma tutamacı: src aralığı dest'e (src'yi içeren, tek yönde büyümüş
 * aralık) genişletir. mode: "auto" (Excel: tek sayı kopyalanır, iki sayı
 * dizi olur) | "series" (tek sayı da artar) | "copy" (yalnız kopyala).
 */
export function fillSeries(book, si, src, dest, { mode = "auto" } = {}) {
  const sheet = book.sheets[si];
  const vertical = dest.r1 < src.r1 || dest.r2 > src.r2;
  const backward = vertical ? dest.r1 < src.r1 : dest.c1 < src.c1;
  const updates = {};
  const lines = vertical ? [src.c1, src.c2] : [src.r1, src.r2];
  for (let line = lines[0]; line <= lines[1]; line += 1) {
    const items = [];
    const lo = vertical ? src.r1 : src.c1;
    const hi = vertical ? src.r2 : src.c2;
    for (let i = lo; i <= hi; i += 1) {
      const r = vertical ? i : line;
      const c = vertical ? line : i;
      items.push({ r, c, v: sheet.cells[addr(c, r)]?.v ?? "", s: sheet.cells[addr(c, r)]?.s || null });
    }
    const k = items.length;
    const gen = seriesGenerator(items, mode);
    const count = vertical ? (backward ? src.r1 - dest.r1 : dest.r2 - src.r2) : (backward ? src.c1 - dest.c1 : dest.c2 - src.c2);
    for (let n = 0; n < count; n += 1) {
      const x = backward ? -1 - n : k + n;
      const pos = backward ? lo - 1 - n : hi + 1 + n;
      const srcItem = items[((x % k) + k) % k];
      const r = vertical ? pos : line;
      const c = vertical ? line : pos;
      const v = gen ? gen(x) : shiftFormula(srcItem.v, r - srcItem.r, c - srcItem.c);
      updates[addr(c, r)] = { v, s: srcItem.s };
    }
  }
  return writeCells(book, si, updates);
}

/* ----------------------------- satır / sütun kaydırma ----------------------------- */

/** Aralığın satır/sütun ekleme-silmeden sonraki hali (tamamen silindiyse null). */
export function adjustRect(rect, axis, at, count) {
  const k1 = axis === "row" ? "r1" : "c1";
  const k2 = axis === "row" ? "r2" : "c2";
  let lo = rect[k1];
  let hi = rect[k2];
  if (count > 0) {
    if (at <= lo) { lo += count; hi += count; } else if (at <= hi) hi += count;
  } else {
    const n = -count;
    if (hi < at) return rect;
    if (lo >= at + n) { lo -= n; hi -= n; } else {
      const nlo = lo < at ? lo : at;
      const nhi = hi >= at + n ? hi - n : at - 1;
      if (nhi < nlo) return null;
      lo = nlo;
      hi = nhi;
    }
  }
  return { ...rect, [k1]: lo, [k2]: hi };
}
const shiftIndex = (i, at, count) => {
  if (count < 0 && i >= at && i < at - count) return null;
  return i >= at ? i + count : i;
};
const shiftKeyed = (map, at, count, toIdx, toKey) => {
  if (!map) return map;
  const out = {};
  for (const [k, v] of Object.entries(map)) {
    const i = shiftIndex(toIdx(k), at, count);
    if (i != null && i >= 0) out[toKey(i)] = v;
  }
  return out;
};
const shiftRefList = (list, axis, at, count) => (list || []).map((item) => {
  const rect = parseRange(item.ref);
  const next = rect && adjustRect(rect, axis, at, count);
  return next ? { ...item, ref: rangeText(next) } : null;
}).filter(Boolean);

/**
 * Satır/sütun ekleme (count > 0) ve silme (count < 0). Hücreler kayar, tüm
 * sayfalardaki formüllerin bu sayfaya giden başvuruları güncellenir;
 * birleştirmeler, boyutlar, gizlemeler, satır/sütun biçimleri, koşullu
 * biçimler, doğrulamalar ve süzgeç de taşınır.
 */
export function shiftAxis(book, si, axis, at, count) {
  const target = book.sheets[si];
  const sheets = book.sheets.map((sheet, index) => {
    const same = index === si;
    const cells = {};
    for (const [key, cell] of Object.entries(sheet.cells)) {
      const pos = parseAddr(key);
      if (!pos) continue;
      let { row, col } = pos;
      if (same) {
        const idx = axis === "row" ? row : col;
        if (count < 0 && idx >= at && idx < at - count) continue;
        if (idx >= at) {
          if (axis === "row") row += count; else col += count;
        }
        const limit = axis === "row" ? MAX_ROWS : MAX_COLS;
        if ((axis === "row" ? row : col) >= limit) continue;
      }
      const v = adjustFormula(cell.v, axis, at, count, { sameSheet: same, sheetName: target.name });
      cells[addr(col, row)] = v === cell.v ? cell : { ...cell, v };
    }
    if (!same) return { ...sheet, cells };
    const next = { ...sheet, cells };
    const isRow = axis === "row";
    if (isRow) next.rows = Math.min(MAX_ROWS, Math.max(1, sheet.rows + count));
    else next.cols = Math.min(MAX_COLS, Math.max(1, sheet.cols + count));
    const byCol = [(k) => colIndex(k), (i) => colName(i)];
    const byRow = [(k) => Number(k) - 1, (i) => String(i + 1)];
    if (isRow) {
      if (sheet.rowH) next.rowH = shiftKeyed(sheet.rowH, at, count, ...byRow);
      if (sheet.rowStyle) next.rowStyle = shiftKeyed(sheet.rowStyle, at, count, ...byRow);
      if (sheet.hiddenRows) next.hiddenRows = sheet.hiddenRows.map((i) => shiftIndex(i, at, count)).filter((i) => i != null);
    } else {
      next.colW = shiftKeyed(sheet.colW || {}, at, count, ...byCol);
      if (sheet.colStyle) next.colStyle = shiftKeyed(sheet.colStyle, at, count, ...byCol);
      if (sheet.hiddenCols) next.hiddenCols = sheet.hiddenCols.map((i) => shiftIndex(i, at, count)).filter((i) => i != null);
    }
    if (sheet.merges) {
      next.merges = sheet.merges.map((m) => {
        const rect = parseRange(m);
        const out = rect && adjustRect(rect, axis, at, count);
        return out && (out.r2 > out.r1 || out.c2 > out.c1) ? rangeText(out) : null;
      }).filter(Boolean);
    }
    if (sheet.cf) next.cf = shiftRefList(sheet.cf, axis, at, count);
    if (sheet.dv) next.dv = shiftRefList(sheet.dv, axis, at, count);
    if (sheet.filter) {
      const rect = parseRange(sheet.filter.ref);
      const moved = rect && adjustRect(rect, axis, at, count);
      if (!moved) delete next.filter;
      else {
        const crit = isRow ? sheet.filter.crit : shiftKeyed(sheet.filter.crit, at, count, (k) => Number(k), (i) => String(i));
        next.filter = { ...sheet.filter, ref: rangeText(moved), ...(crit ? { crit } : {}) };
      }
    }
    for (const k of ["rowH", "rowStyle", "colStyle", "merges", "cf", "dv", "hiddenRows", "hiddenCols"]) {
      if (next[k] && (Array.isArray(next[k]) ? !next[k].length : !Object.keys(next[k]).length)) delete next[k];
    }
    return next;
  });
  return { ...book, sheets };
}

/**
 * Aralığı sütun(lar)a göre sıralar (değerler hesaplanmış sonuçlara göre).
 * Boşlar sona gider. opts.header: ilk satır başlık (sıralanmaz);
 * opts.keys: [{ col, asc }] çok düzeyli sıralama.
 */
export function sortRange(book, si, range, byCol, ascending, valueOf, { header = false, keys = null } = {}) {
  const sheet = book.sheets[si];
  const body = header ? { ...range, r1: range.r1 + 1 } : range;
  if (body.r2 <= body.r1) return book;
  const levels = keys && keys.length ? keys : [{ col: byCol, asc: ascending }];
  const rows = [];
  for (let r = body.r1; r <= body.r2; r += 1) {
    const cells = [];
    for (let c = body.c1; c <= body.c2; c += 1) cells.push(sheet.cells[addr(c, r)] || null);
    rows.push({ r, cells, keys: levels.map((l) => valueOf(addr(l.col, r))) });
  }
  const rank = (v) => (v == null || v === "" ? 3 : isError(v) ? 2 : typeof v === "number" || (v && typeof v === "object" && "date" in v) ? 0 : 1);
  const num = (v) => (typeof v === "number" ? v : v.date);
  rows.sort((a, b) => {
    for (let i = 0; i < levels.length; i += 1) {
      const ka = a.keys[i];
      const kb = b.keys[i];
      const ra = rank(ka);
      const rb = rank(kb);
      if (ra !== rb) return ra - rb;
      if (ra === 3 || ra === 2) continue;
      const cmp = ra === 0 ? num(ka) - num(kb) : String(ka).localeCompare(String(kb), "tr", { sensitivity: "base", numeric: true });
      if (cmp) return levels[i].asc ? cmp : -cmp;
    }
    return a.r - b.r;
  });
  const updates = {};
  rows.forEach((row, i) => {
    const r = body.r1 + i;
    row.cells.forEach((cell, j) => {
      const c = body.c1 + j;
      updates[addr(c, r)] = cell ? { v: shiftFormula(cell.v, r - row.r, 0), s: cell.s || null } : { v: "", s: null };
    });
  });
  return writeCells(book, si, updates);
}

/**
 * Aralıkta yinelenen satırları kaldırır (tüm sütunların hesaplanmış değerine
 * göre, büyük/küçük harf duyarsız). Kalanlar yukarı kayar.
 * Dönüş: { book, removed, kept }
 */
export function removeDuplicateRows(book, si, range, valueOf, { header = false, cols = null } = {}) {
  const sheet = book.sheets[si];
  const body = header ? { ...range, r1: range.r1 + 1 } : range;
  const keyCols = cols || Array.from({ length: range.c2 - range.c1 + 1 }, (_, i) => range.c1 + i);
  const seen = new Set();
  const keep = [];
  for (let r = body.r1; r <= body.r2; r += 1) {
    const key = JSON.stringify(keyCols.map((c) => { const v = valueOf(addr(c, r)); return v && typeof v === "object" && "date" in v ? v.date : typeof v === "string" ? v.toLocaleLowerCase("tr-TR") : v ?? ""; }));
    if (seen.has(key)) continue;
    seen.add(key);
    keep.push(r);
  }
  const removed = body.r2 - body.r1 + 1 - keep.length;
  if (!removed) return { book, removed: 0, kept: keep.length };
  const updates = {};
  keep.forEach((src, i) => {
    const r = body.r1 + i;
    for (let c = body.c1; c <= body.c2; c += 1) {
      const cell = sheet.cells[addr(c, src)];
      updates[addr(c, r)] = cell ? { v: shiftFormula(cell.v, r - src, 0), s: cell.s || null } : { v: "", s: null };
    }
  });
  for (let r = body.r1 + keep.length; r <= body.r2; r += 1) for (let c = body.c1; c <= body.c2; c += 1) updates[addr(c, r)] = { v: "", s: null };
  return { book: writeCells(book, si, updates), removed, kept: keep.length };
}

/** Dolu hücrelerin son satır/sütunu (CSV dışa aktarım ve Ctrl+End için). */
export function usedBounds(sheet) {
  let rows = 0;
  let cols = 0;
  for (const key of Object.keys(sheet.cells)) {
    const p = parseAddr(key);
    if (!p) continue;
    rows = Math.max(rows, p.row + 1);
    cols = Math.max(cols, p.col + 1);
  }
  for (const m of mergeIndex(sheet).list) { rows = Math.max(rows, m.r2 + 1); cols = Math.max(cols, m.c2 + 1); }
  return { rows, cols };
}

/** Etkin hücrenin çevresindeki kesintisiz veri bölgesi (Ctrl+A, süzgeç, sıralama için). */
export function currentRegion(sheet, row, col) {
  const filled = (r, c) => r >= 0 && c >= 0 && r < sheet.rows && c < sheet.cols && (sheet.cells[addr(c, r)]?.v ?? "") !== "";
  const rowHas = (r, c1, c2) => { for (let c = c1; c <= c2; c += 1) if (filled(r, c)) return true; return false; };
  const colHas = (c, r1, r2) => { for (let r = r1; r <= r2; r += 1) if (filled(r, c)) return true; return false; };
  const rect = { r1: row, r2: row, c1: col, c2: col };
  let changed = true;
  while (changed) {
    changed = false;
    while (rect.r1 > 0 && rowHas(rect.r1 - 1, rect.c1 - 1, rect.c2 + 1)) { rect.r1 -= 1; changed = true; }
    while (rect.r2 < sheet.rows - 1 && rowHas(rect.r2 + 1, rect.c1 - 1, rect.c2 + 1)) { rect.r2 += 1; changed = true; }
    while (rect.c1 > 0 && colHas(rect.c1 - 1, rect.r1 - 1, rect.r2 + 1)) { rect.c1 -= 1; changed = true; }
    while (rect.c2 < sheet.cols - 1 && colHas(rect.c2 + 1, rect.r1 - 1, rect.r2 + 1)) { rect.c2 += 1; changed = true; }
  }
  // Tek boş hücrede bölge yoksa yalnız kendisi.
  return rect;
}

/** Ctrl+ok: Excel gibi veri bölgesinin kenarına atlar. */
export function jumpEdge(sheet, row, col, dr, dc, isHidden = () => false) {
  const filled = (r, c) => (sheet.cells[addr(c, r)]?.v ?? "") !== "";
  const maxR = sheet.rows - 1;
  const maxC = sheet.cols - 1;
  const inside = (r, c) => r >= 0 && c >= 0 && r <= maxR && c <= maxC;
  const step = (r, c) => { let nr = r + dr; let nc = c + dc; while (inside(nr, nc) && isHidden(nr, nc)) { nr += dr; nc += dc; } return [nr, nc]; };
  let [nr, nc] = step(row, col);
  if (!inside(nr, nc)) return { row, col };
  if (filled(row, col) && filled(nr, nc)) {
    let r = nr; let c = nc;
    for (;;) { const [x, y] = step(r, c); if (!inside(x, y) || !filled(x, y)) return { row: r, col: c }; r = x; c = y; }
  }
  let r = nr; let c = nc;
  while (!filled(r, c)) {
    const [x, y] = step(r, c);
    if (!inside(x, y)) return { row: r, col: c };
    r = x; c = y;
  }
  return { row: r, col: c };
}

export function uniqueSheetName(book, base = "Sayfa") {
  const names = new Set(book.sheets.map((s) => s.name.toLocaleLowerCase("tr-TR")));
  let i = book.sheets.length + 1;
  while (names.has(`${base}${i}`.toLocaleLowerCase("tr-TR"))) i += 1;
  return `${base}${i}`;
}

/** Bir sayfa yeniden adlandırılınca diğer formüllerdeki 'Eski'!A1 başvuruları da güncellenir. */
export function renameSheet(book, si, nextName) {
  const old = book.sheets[si].name;
  const esc = old.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(^|[^\\w'])(?:'${esc}'|${/^[\wÇĞİÖŞÜçğıöşü]+$/.test(old) ? esc : "(?!)"})!`, "giu");
  const quoted = /^[\wÇĞİÖŞÜçğıöşü]+$/.test(nextName) ? nextName : `'${nextName.replace(/'/g, "")}'`;
  return {
    ...book,
    sheets: book.sheets.map((sheet, i) => {
      const cells = {};
      for (const [k, cell] of Object.entries(sheet.cells)) {
        cells[k] = typeof cell.v === "string" && cell.v.startsWith("=") ? { ...cell, v: cell.v.replace(re, (m, pre) => `${pre}${quoted}!`) } : cell;
      }
      return { ...sheet, cells, ...(i === si ? { name: nextName } : {}) };
    }),
  };
}

/** Sayfanın kopyası hemen sağına eklenir: "Bütçe (2)". */
export function duplicateSheet(book, si) {
  const src = book.sheets[si];
  const names = new Set(book.sheets.map((s) => s.name.toLocaleLowerCase("tr-TR")));
  let n = 2;
  let name = `${src.name.slice(0, 34)} (${n})`;
  while (names.has(name.toLocaleLowerCase("tr-TR"))) { n += 1; name = `${src.name.slice(0, 34)} (${n})`; }
  const copy = { ...JSON.parse(JSON.stringify(src)), id: sheetId(), name };
  const sheets = [...book.sheets];
  sheets.splice(si + 1, 0, copy);
  return { ...book, sheets };
}

/** Sayfanın sırasını değiştirir. */
export function moveSheet(book, from, to) {
  if (from === to || to < 0 || to >= book.sheets.length) return book;
  const sheets = [...book.sheets];
  const [s] = sheets.splice(from, 1);
  sheets.splice(to, 0, s);
  return { ...book, sheets };
}

export const setSheetProps = (book, si, patch) => patchSheet(book, si, patch);

/* --------------------------------- birleştirme --------------------------------- */

/**
 * Hücreleri birleştirir. mode: "merge" | "center" (birleştir ve ortala) |
 * "across" (her satırı ayrı birleştir). Yalnız sol üst değer kalır; o boşsa
 * aralıktaki ilk dolu değer sol üste taşınır.
 */
export function mergeCells(book, si, range, mode = "merge") {
  let sheet = book.sheets[si];
  const area = expandToMerges(sheet, range);
  const kept = (sheet.merges || []).filter((m) => { const rect = parseRange(m); return rect && !intersects(rect, area); });
  const groups = mode === "across"
    ? Array.from({ length: area.r2 - area.r1 + 1 }, (_, i) => ({ r1: area.r1 + i, r2: area.r1 + i, c1: area.c1, c2: area.c2 }))
    : [area];
  const updates = {};
  const added = [];
  for (const g of groups) {
    if (g.r1 === g.r2 && g.c1 === g.c2) continue;
    const anchor = addr(g.c1, g.r1);
    let first = null;
    eachCell(g, (key) => { if (!first && (sheet.cells[key]?.v ?? "") !== "") first = key; });
    eachCell(g, (key) => { if (key !== anchor && (sheet.cells[key]?.v ?? "") !== "") updates[key] = { v: "" }; });
    if (first && first !== anchor) updates[anchor] = { v: sheet.cells[first].v };
    added.push(rangeText(g));
  }
  let out = writeCells(book, si, updates);
  out = patchSheet(out, si, { merges: [...kept, ...added] });
  if (mode === "center") out = styleRange(out, si, area, { al: "center" });
  return out;
}

export function unmergeCells(book, si, range) {
  const sheet = book.sheets[si];
  const kept = (sheet.merges || []).filter((m) => { const rect = parseRange(m); return rect && !intersects(rect, range); });
  if (kept.length === (sheet.merges || []).length) return book;
  return patchSheet(book, si, { merges: kept });
}

/* --------------------------------- kenarlıklar --------------------------------- */

const SIDES = ["t", "r", "b", "l"];
const OPPOSITE = { t: ["b", -1, 0], b: ["t", 1, 0], l: ["r", 0, -1], r: ["l", 0, 1] };

/**
 * Kenarlık uygular. mode: all | outer | inner | top | bottom | left | right |
 * none | thickOuter | bottomDouble | bottomThick. spec: { s: "thin", c: "#000000" }.
 */
export function applyBorders(book, si, range, mode, spec = { s: "thin", c: "#000000" }) {
  const sheet = book.sheets[si];
  const rect = isFullCols(sheet, range) ? { ...range, r2: Math.max(range.r1, usedBounds(sheet).rows - 1) } : range;
  const style = mode === "thickOuter" || mode === "bottomThick" ? { ...spec, s: "thick" } : mode === "bottomDouble" ? { ...spec, s: "double" } : spec;
  const sidesFor = (r, c) => {
    const edge = { t: r === rect.r1, b: r === rect.r2, l: c === rect.c1, r: c === rect.c2 };
    switch (mode) {
      case "all": return SIDES;
      case "outer": case "thickOuter": return SIDES.filter((s) => edge[s]);
      case "inner": return SIDES.filter((s) => !edge[s]);
      case "top": return edge.t ? ["t"] : [];
      case "bottom": case "bottomDouble": case "bottomThick": return edge.b ? ["b"] : [];
      case "left": return edge.l ? ["l"] : [];
      case "right": return edge.r ? ["r"] : [];
      default: return [];
    }
  };
  const next = new Map();
  const get = (r, c) => {
    const key = addr(c, r);
    if (!next.has(key)) next.set(key, { ...(sheet.cells[key]?.s || {}), bd: { ...(sheet.cells[key]?.s?.bd || {}) } });
    return next.get(key);
  };
  const outside = (r, c) => r < rect.r1 || r > rect.r2 || c < rect.c1 || c > rect.c2;
  for (let r = rect.r1; r <= rect.r2; r += 1) {
    for (let c = rect.c1; c <= rect.c2; c += 1) {
      const s = get(r, c);
      if (mode === "none") {
        s.bd = {};
        for (const side of SIDES) {
          const [opp, dr, dc] = OPPOSITE[side];
          const nr = r + dr;
          const nc = c + dc;
          if (nr >= 0 && nc >= 0 && outside(nr, nc) && sheet.cells[addr(nc, nr)]?.s?.bd?.[opp]) delete get(nr, nc).bd[opp];
        }
        continue;
      }
      for (const side of sidesFor(r, c)) {
        s.bd[side] = { s: style.s || "thin", c: style.c || "#000000" };
        const [opp, dr, dc] = OPPOSITE[side];
        const nr = r + dr;
        const nc = c + dc;
        if (nr >= 0 && nc >= 0 && outside(nr, nc) && sheet.cells[addr(nc, nr)]?.s?.bd?.[opp]) delete get(nr, nc).bd[opp];
      }
    }
  }
  const updates = {};
  for (const [key, s] of next) {
    if (!Object.keys(s.bd).length) delete s.bd;
    updates[key] = { s };
  }
  return writeCells(book, si, updates);
}

/* ------------------------------ boyut ve görünüm ------------------------------ */

/** Sütun genişlikleri (px, null → varsayılan). */
export function setColWidths(book, si, cols, px) {
  const sheet = book.sheets[si];
  const colW = { ...(sheet.colW || {}) };
  for (const c of cols) {
    if (px == null) delete colW[colName(c)];
    else colW[colName(c)] = Math.round(Math.max(4, Math.min(1200, px)));
  }
  return withSheet(book, si, (s) => ({ ...s, colW }));
}

/** Satır yükseklikleri (px, null → varsayılan). */
export function setRowHeights(book, si, rows, px) {
  const sheet = book.sheets[si];
  const rowH = { ...(sheet.rowH || {}) };
  for (const r of rows) {
    if (px == null) delete rowH[r + 1];
    else rowH[r + 1] = Math.round(Math.max(4, Math.min(800, px)));
  }
  return patchSheet(book, si, { rowH });
}

/** Satır/sütun gizle (hidden = true) ya da göster. */
export function setHidden(book, si, axis, indices, hidden) {
  const sheet = book.sheets[si];
  const key = axis === "row" ? "hiddenRows" : "hiddenCols";
  const set = new Set(sheet[key] || []);
  for (const i of indices) { if (hidden) set.add(i); else set.delete(i); }
  return patchSheet(book, si, { [key]: [...set].sort((a, b) => a - b) });
}

/** Bölmeleri dondur: r üst satır, c sol sütun sayısı (0, 0 → çöz). */
export function setFrozen(book, si, r, c) {
  return withSheet(book, si, (s) => {
    const next = { ...s };
    delete next.frozen;
    delete next.freeze;
    if (r > 0 || c > 0) {
      next.frozen = { r: Math.max(0, r), c: Math.max(0, c) };
      if (r > 0) next.freeze = true; // eski istemciler en azından üst satırı dondurur
    }
    return next;
  });
}
export { getFrozen };

/* ------------------------- koşullu biçim · doğrulama · süzgeç ------------------------- */

const ruleId = () => `r${Math.random().toString(36).slice(2, 9)}`;

export function addCfRule(book, si, rule) {
  const sheet = book.sheets[si];
  return patchSheet(book, si, { cf: [...(sheet.cf || []), { id: ruleId(), ...rule }] });
}
export function removeCfRules(book, si, { id = null, range = null } = {}) {
  const sheet = book.sheets[si];
  const cf = (sheet.cf || []).filter((rule) => {
    if (id) return rule.id !== id;
    if (range) { const rect = parseRange(rule.ref); return !(rect && intersects(rect, range)); }
    return false;
  });
  return patchSheet(book, si, { cf });
}

/** Aralığa liste doğrulaması koyar (rule null → kaldırır). */
export function setValidation(book, si, range, rule) {
  const sheet = book.sheets[si];
  const dv = (sheet.dv || []).filter((x) => { const rect = parseRange(x.ref); return !(rect && intersects(rect, range)); });
  if (rule) dv.push({ id: ruleId(), ...rule, ref: rangeText(range) });
  return patchSheet(book, si, { dv });
}

/** Otomatik süzgeç: ref (başlık satırı dahil) ya da null (kaldır). */
export function setFilter(book, si, range) {
  if (!range) return patchSheet(book, si, { filter: null });
  return patchSheet(book, si, { filter: { ref: rangeText(range), crit: {} } });
}
export function setFilterCrit(book, si, col, crit) {
  const sheet = book.sheets[si];
  if (!sheet.filter) return book;
  const next = { ...(sheet.filter.crit || {}) };
  if (crit && (crit.hide?.length || crit.op)) next[col] = crit; else delete next[col];
  return patchSheet(book, si, { filter: { ...sheet.filter, crit: next } });
}

/* ------------------------------- bul ve değiştir ------------------------------- */

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Eşleşen hücreler (satır satır). opts: matchCase, whole (hücrenin tamamı),
 * formulas (formül metninde ara; değilse görünen değerde), displayOf(r, c).
 */
export function findCells(sheet, query, { matchCase = false, whole = false, formulas = false, displayOf = null, byColumns = false } = {}) {
  if (!query) return [];
  const re = new RegExp(whole ? `^${escapeRe(query)}$` : escapeRe(query), matchCase ? "u" : "iu");
  const out = [];
  for (const [key, cell] of Object.entries(sheet.cells)) {
    if ((cell.v ?? "") === "") continue;
    const p = parseAddr(key);
    if (!p) continue;
    const isF = typeof cell.v === "string" && cell.v.startsWith("=");
    const text = formulas || !isF || !displayOf ? String(cell.v) : String(displayOf(p.row, p.col));
    if (re.test(text)) out.push({ row: p.row, col: p.col });
  }
  out.sort((a, b) => (byColumns ? a.col - b.col || a.row - b.row : a.row - b.row || a.col - b.col));
  return out;
}

/** Hücrelerin ham metninde değiştirir; değişen hücre sayısını da döner. */
export function replaceCells(book, si, positions, query, replacement, { matchCase = false, whole = false } = {}) {
  const sheet = book.sheets[si];
  const re = new RegExp(whole ? `^${escapeRe(query)}$` : escapeRe(query), matchCase ? "gu" : "giu");
  const updates = {};
  let count = 0;
  for (const { row, col } of positions) {
    const key = addr(col, row);
    const v = String(sheet.cells[key]?.v ?? "");
    const next = v.replace(re, () => replacement);
    if (next !== v) { updates[key] = { v: next }; count += 1; }
  }
  return { book: count ? writeCells(book, si, updates) : book, count };
}

/* --------------------------------- şablonlar --------------------------------- */

const H = { b: true, bg: "#ede9fe", al: "center" };
const cellsOf = (rows, styles = {}) => {
  const cells = {};
  rows.forEach((row, r) => row.forEach((v, c) => {
    if (v === "" || v == null) return;
    const key = addr(c, r);
    cells[key] = { v: String(v), ...(styles[key] ? { s: styles[key] } : {}) };
  }));
  for (const [key, s] of Object.entries(styles)) if (!cells[key]) cells[key] = { v: "", s };
  return cells;
};
const headerStyles = (cols, row = 0, s = H) => Object.fromEntries(Array.from({ length: cols }, (_, c) => [addr(c, row), s]));
const columnStyle = (col, r1, r2, s) => Object.fromEntries(Array.from({ length: r2 - r1 + 1 }, (_, i) => [addr(col, r1 + i), s]));

export const TEMPLATES = [
  { key: "blank", name: "Boş tablo", icon: "fa-regular fa-file", description: "Sıfırdan başlayın.", build: () => blankWorkbook() },
  {
    key: "dues", name: "Aidat takibi", icon: "fa-solid fa-people-group", description: "Oyuncu başı aidat, ödenen ve kalan.",
    build: () => {
      const players = ["Ali Yılmaz", "Mehmet Kaya", "Can Demir", "Burak Şahin", "Emre Aydın", "Okan Çelik", "Serkan Arslan", "Kerem Öz"];
      const rows = [["Oyuncu", "Aidat", "Ödenen", "Kalan", "Durum"]];
      players.forEach((p, i) => {
        const r = i + 2;
        rows.push([p, "300", i % 3 === 0 ? "150" : "300", `=B${r}-C${r}`, `=EĞER(D${r}<=0; "Ödendi"; "Bekliyor")`]);
      });
      const last = players.length + 1;
      rows.push(["Toplam", `=TOPLA(B2:B${last})`, `=TOPLA(C2:C${last})`, `=TOPLA(D2:D${last})`, `=EĞERSAY(E2:E${last}; "Ödendi")&" / ${players.length} ödedi"`]);
      const money = { f: "money" };
      const styles = { ...headerStyles(5), ...columnStyle(1, 1, last, money), ...columnStyle(2, 1, last, money), ...columnStyle(3, 1, last, money) };
      const t = last + 1;
      Object.assign(styles, { [`A${t}`]: { b: true }, [`B${t}`]: { b: true, f: "money" }, [`C${t}`]: { b: true, f: "money" }, [`D${t}`]: { b: true, f: "money", c: "#be123c" }, [`E${t}`]: { b: true } });
      return { sheets: [{ ...blankSheet("Aidatlar"), cells: cellsOf(rows, styles), colW: { A: 160, E: 150 } }] };
    },
  },
  {
    key: "budget", name: "Aylık bütçe", icon: "fa-solid fa-wallet", description: "Gelir-gider kalemleri ve net sonuç.",
    build: () => {
      const rows = [
        ["Kalem", "Tür", "Planlanan", "Gerçekleşen", "Fark"],
        ["Lig katılım ücretleri", "Gelir", "40000", "38500"],
        ["Sponsorluk", "Gelir", "25000", "25000"],
        ["Saha kirası", "Gider", "18000", "19200"],
        ["Hakem ücretleri", "Gider", "9600", "9600"],
        ["Ödüller", "Gider", "6000", "5400"],
        ["Yayın", "Gider", "4500", "4800"],
      ];
      for (let r = 2; r <= 7; r += 1) rows[r - 1][4] = `=D${r}-C${r}`;
      rows.push([]);
      rows.push(["Toplam gelir", "", '=ETOPLA(B2:B7; "Gelir"; C2:C7)', '=ETOPLA(B2:B7; "Gelir"; D2:D7)']);
      rows.push(["Toplam gider", "", '=ETOPLA(B2:B7; "Gider"; C2:C7)', '=ETOPLA(B2:B7; "Gider"; D2:D7)']);
      rows.push(["Net", "", "=C9-C10", "=D9-D10", "=D11-C11"]);
      const money = { f: "money" };
      const styles = { ...headerStyles(5) };
      for (let r = 1; r <= 10; r += 1) for (const c of [2, 3, 4]) styles[addr(c, r)] = money;
      for (const c of [0, 2, 3, 4]) styles[addr(c, 10)] = { b: true, f: c ? "money" : undefined, bg: "#dcfce7" };
      return { sheets: [{ ...blankSheet("Bütçe"), cells: cellsOf(rows, styles), colW: { A: 170 } }] };
    },
  },
  {
    key: "standings", name: "Puan tablosu", icon: "fa-solid fa-trophy", description: "O-G-B-M, averaj ve puan hesaplı.",
    build: () => {
      const teams = [["Yıldız FK", 6, 4, 1, 1, 15, 7], ["Kartal SK", 6, 4, 0, 2, 12, 8], ["Anadolu Gücü", 6, 3, 2, 1, 11, 6], ["Boğaziçi", 6, 2, 1, 3, 9, 11], ["Çankaya SK", 6, 1, 2, 3, 7, 12], ["Mavi Şimşek", 6, 0, 2, 4, 5, 15]];
      const rows = [["Takım", "O", "G", "B", "M", "A", "Y", "AV", "Puan", "Sıra"]];
      teams.forEach((t, i) => {
        const r = i + 2;
        rows.push([...t.map(String), `=F${r}-G${r}`, `=C${r}*3+D${r}`, `=RANK(I${r}; I$2:I$7)`]);
      });
      const styles = { ...headerStyles(10, 0, { b: true, bg: "#dbeafe", al: "center" }) };
      for (let r = 1; r <= 6; r += 1) { for (let c = 1; c <= 9; c += 1) styles[addr(c, r)] = { al: "center" }; styles[addr(8, r)] = { al: "center", b: true }; }
      return { sheets: [{ ...blankSheet("Puan Durumu"), cells: cellsOf(rows, styles), colW: { A: 150, B: 50, C: 50, D: 50, E: 50, F: 50, G: 50, H: 60, I: 70, J: 60 } }] };
    },
  },
  {
    key: "attendance", name: "Katılım listesi", icon: "fa-solid fa-clipboard-check", description: "Maç maç katılım ve oran.",
    build: () => {
      const rows = [["Oyuncu", "1. Hafta", "2. Hafta", "3. Hafta", "4. Hafta", "Katılım", "Oran"]];
      ["Ali", "Mehmet", "Can", "Burak", "Emre", "Okan"].forEach((p, i) => {
        const r = i + 2;
        const marks = ["Var", i % 2 ? "Yok" : "Var", "Var", i % 3 ? "Var" : "Yok"];
        rows.push([p, ...marks, `=EĞERSAY(B${r}:E${r}; "Var")`, `=F${r}/4`]);
      });
      const styles = { ...headerStyles(7, 0, { b: true, bg: "#fef3c7", al: "center" }) };
      for (let r = 1; r <= 6; r += 1) styles[addr(6, r)] = { f: "percent", al: "center" };
      return { sheets: [{ ...blankSheet("Katılım"), cells: cellsOf(rows, styles), colW: { A: 140 } }] };
    },
  },
];

/* ------------------------------ eşzamanlı düzenleme ------------------------------ */

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
// Anahtar anahtar birleştirilen sayfa alanları; diğerleri (birleştirmeler,
// dondurma, gizlemeler, koşullu biçim, süzgeç…) bütün olarak alınır.
const KEYED = ["cells", "colW", "rowH", "colStyle", "rowStyle"];
const WHOLE = ["name", "merges", "frozen", "freeze", "hiddenRows", "hiddenCols", "cf", "dv", "filter", "noGrid", "tab"];

function mergeSheet(b, m, t) {
  const out = { ...t };
  for (const field of KEYED) {
    const bm = b[field] || {};
    const mm = m[field] || {};
    const merged = { ...(t[field] || {}) };
    for (const k of new Set([...Object.keys(bm), ...Object.keys(mm)])) {
      if (same(mm[k], bm[k])) continue;
      if (mm[k] != null) merged[k] = mm[k];
      else delete merged[k];
    }
    if (Object.keys(merged).length || field === "cells" || field === "colW") out[field] = merged;
    else delete out[field];
  }
  for (const field of WHOLE) {
    if (same(m[field], b[field])) continue;
    if (m[field] === undefined) delete out[field];
    else out[field] = m[field];
  }
  if (m.rows !== b.rows) out.rows = Math.max(t.rows, m.rows);
  if (m.cols !== b.cols) out.cols = Math.max(t.cols, m.cols);
  return out;
}

/**
 * Üç yollu birleştirme: base = son eşitlenen sürüm, mine = benim sürümüm,
 * theirs = sunucudaki güncel sürüm. Benim değiştirdiğim hücreler (ve
 * boyutlar, biçimler, birleştirmeler, dondurma…) theirs'in üstüne uygulanır;
 * dokunmadıklarım theirs'ten gelir. Sayfalar kimlikleriyle (yoksa sırayla)
 * eşleştirilir; benim sildiğim sayfa silinir, sıralamam korunur.
 */
export function mergeWorkbooks(base, mine, theirs) {
  const keyOf = (s, i) => s.id || `#${i}`;
  const baseBy = new Map(base.sheets.map((s, i) => [keyOf(s, i), s]));
  const theirsBy = new Map(theirs.sheets.map((s, i) => [keyOf(s, i), s]));
  const out = [];
  // Benim sıram: ortak sayfalar benim sıramla, sonra yalnız onlarda olanlar.
  const myOrderChanged = !same(base.sheets.map(keyOf), mine.sheets.map(keyOf));
  const order = myOrderChanged ? mine.sheets.map(keyOf) : theirs.sheets.map(keyOf);
  for (const [i, s] of theirs.sheets.entries()) if (!order.includes(keyOf(s, i))) order.push(keyOf(s, i));
  for (const key of order) {
    const m = mine.sheets.find((s, i) => keyOf(s, i) === key);
    const b = baseBy.get(key);
    const t = theirsBy.get(key);
    if (t && b && !m) continue; // ben sildim
    if (t && m && b) out.push(mergeSheet(b, m, t));
    else if (t && m && !b) { out.push(t); if (!m.id || m.id !== t.id) out.push(m); }
    else if (t) out.push(t);
    else if (m && !b) out.push(m); // benim eklediğim
  }
  // Ad çakışmaları (iki tarafın eklediği aynı adlı sayfa) düzeltilir.
  const names = new Set();
  const sheets = out.map((s) => {
    let name = s.name;
    let n = 2;
    while (names.has(name.toLocaleLowerCase("tr-TR"))) { name = `${s.name.slice(0, 34)} (${n})`; n += 1; }
    names.add(name.toLocaleLowerCase("tr-TR"));
    return name === s.name ? s : { ...s, name };
  });
  return { ...theirs, sheets };
}

/** İki sürüm arasında içerik farkı var mı? */
export const workbooksDiffer = (a, b) => !same(a, b);
