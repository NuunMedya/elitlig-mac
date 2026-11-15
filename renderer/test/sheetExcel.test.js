// @vitest-environment jsdom
// Tablolar: Excel düzeyi özellikler — birleştirme, biçimler, kenarlıklar,
// boyutlar, gizleme, dondurma, satır/sütun ekleme-silme (formül ve model
// kaydırma), doldurma serileri, sıralama, süzgeç, koşullu biçim, doğrulama,
// bul/değiştir, pano (HTML/TSV), eşzamanlı birleştirme, geometri, xlsx gidiş-dönüş.
import { TextDecoder, TextEncoder } from "util";
import { createEvaluator, formatValue } from "../src/lib/sheets/sheetEngine";
import {
  addCfRule, applyBorders, blockFromText, blockToText, clearRange, copyBlock, currentRegion, duplicateSheet, fillSeries, findCells, jumpEdge,
  mergeCells, mergeWorkbooks, moveSheet, pasteBlock, removeDuplicateRows, replaceCells, setColWidths, setFilter, setFilterCrit,
  setFrozen, setHidden, setRowHeights, setValidation, shiftAxis, sortRange, styleRange, unmergeCells, usedBounds,
} from "../src/lib/sheets/sheetOps";
import {
  createCfEvaluator, expandToMerges, filterValues, filteredRows, getFrozen, isValidEntry, mergeIndex, parseRange, rangeText, selectionStats, styleAt, validationAt, validationItems,
} from "../src/lib/sheets/sheetModel";
import { buildAxis, colAtX, rowAtY, scrollToReveal, screenX, screenY, sheetLayout } from "../src/lib/sheets/sheetLayout";
import { blockFromHtml, blockToHtml } from "../src/lib/sheets/clipboard";
import { workbookToXlsx } from "../src/lib/sheets/xlsxExport";
import { xlsxToWorkbook } from "../src/lib/sheets/xlsxImport";

if (typeof global.TextEncoder === "undefined") global.TextEncoder = TextEncoder;
if (typeof global.TextDecoder === "undefined") global.TextDecoder = TextDecoder;

const book = (cells = {}, extra = {}) => ({ sheets: [{ id: "a", name: "Sayfa1", rows: 50, cols: 12, cells: Object.fromEntries(Object.entries(cells).map(([k, v]) => [k, typeof v === "object" ? v : { v }])), colW: {}, ...extra }] });
const R = (t) => parseRange(t);
const val = (b, key, si = 0) => createEvaluator(b).value(si, key);
const shown = (b, key, si = 0) => { const ev = createEvaluator(b); const p = /^([A-Z]+)(\d+)$/.exec(key); return formatValue(ev.value(si, key), styleAt(b.sheets[si], Number(p[2]) - 1, p[1].charCodeAt(0) - 65)); };

/* ------------------------------- birleştirme ------------------------------- */

test("birleştir ve ortala: sol üst değer kalır, diğerleri silinir; ayır", () => {
  let b = book({ A1: "Başlık", B1: "x", A2: "y" });
  b = mergeCells(b, 0, R("A1:C2"), "center");
  const s = b.sheets[0];
  expect(s.merges).toEqual(["A1:C2"]);
  expect(s.cells.A1.v).toBe("Başlık");
  expect(s.cells.B1?.v ?? "").toBe("");
  expect(s.cells.A2?.v ?? "").toBe("");
  expect(styleAt(s, 0, 0).al).toBe("center");
  expect(mergeIndex(s).at(1, 2)).toMatchObject({ r1: 0, c1: 0, r2: 1, c2: 2 });
  expect(expandToMerges(s, R("B2"))).toEqual(R("A1:C2"));
  b = unmergeCells(b, 0, R("B2"));
  expect(b.sheets[0].merges).toBeUndefined();
});

test("sol üst boşsa ilk dolu değer taşınır; yatay birleştirme satır satır", () => {
  let b = book({ B1: "ilk", C2: "iki" });
  b = mergeCells(b, 0, R("A1:C1"));
  expect(b.sheets[0].cells.A1.v).toBe("ilk");
  b = mergeCells(book({ A1: "1", A2: "2" }), 0, R("A1:C2"), "across");
  expect(b.sheets[0].merges).toEqual(["A1:C1", "A2:C2"]);
  expect(b.sheets[0].cells.A2.v).toBe("2");
});

/* ---------------------------------- biçimler ---------------------------------- */

test("tüm sütun biçimi sütun stiline yazılır; hücre > satır > sütun önceliği", () => {
  let b = book({ B3: { v: "5", s: { c: "#ff0000" } } });
  b = styleRange(b, 0, { r1: 0, r2: 49, c1: 1, c2: 1 }, { b: true, f: "money" });
  const s = b.sheets[0];
  expect(s.colStyle).toEqual({ B: { b: true, f: "money" } });
  expect(Object.keys(s.cells)).toEqual(["B3"]); // 50 satır tek tek yazılmadı
  expect(styleAt(s, 2, 1)).toEqual({ b: true, f: "money", c: "#ff0000" });
  expect(styleAt(s, 40, 1)).toEqual({ b: true, f: "money" });
  b = styleRange(b, 0, { r1: 3, r2: 3, c1: 0, c2: 11 }, { bg: "#ffff00" });
  expect(b.sheets[0].rowStyle).toEqual({ 4: { bg: "#ffff00" } });
  expect(styleAt(b.sheets[0], 3, 1)).toMatchObject({ b: true, bg: "#ffff00" });
  b = clearRange(b, 0, { r1: 0, r2: 49, c1: 1, c2: 1 }, { values: false, styles: true });
  expect(b.sheets[0].colStyle).toBeUndefined();
});

test("sayı biçimleri: sayı/binlik, para, yüzde, tarih, uzun tarih, saat, bilimsel, metin", () => {
  expect(formatValue(1234.5, { f: "number" })).toBe("1.234,50");
  expect(formatValue(1234.5, { f: "number", d: 0, ng: true })).toBe("1235");
  expect(formatValue(1234.5, { f: "money" })).toBe("1.234,50 ₺");
  expect(formatValue(0.175, { f: "percent", d: 1 })).toBe("%17,5");
  expect(formatValue({ date: 46387 }, { f: "date" })).toBe("31.12.2026");
  expect(formatValue({ date: 46387 }, { f: "dateLong" })).toBe("31 Aralık 2026");
  expect(formatValue(0.6045138889, { f: "time" })).toBe("14:30");
  expect(formatValue(46387.5, { f: "datetime" })).toBe("31.12.2026 12:00");
  expect(formatValue(12345, { f: "sci" })).toBe("1,23E+04");
});

test("kenarlıklar: tümü, dış, yok (komşu kenarlar da temizlenir)", () => {
  let b = applyBorders(book(), 0, R("B2:C3"), "all", { s: "thin", c: "#000000" });
  expect(b.sheets[0].cells.B2.s.bd).toEqual({ t: { s: "thin", c: "#000000" }, r: { s: "thin", c: "#000000" }, b: { s: "thin", c: "#000000" }, l: { s: "thin", c: "#000000" } });
  b = applyBorders(book(), 0, R("B2:C3"), "outer", { s: "thick", c: "#ff0000" });
  expect(Object.keys(b.sheets[0].cells.B2.s.bd).sort()).toEqual(["l", "t"]);
  expect(Object.keys(b.sheets[0].cells.C3.s.bd).sort()).toEqual(["b", "r"]);
  b = applyBorders(b, 0, R("B2:C3"), "thickOuter");
  expect(b.sheets[0].cells.B2.s.bd.t.s).toBe("thick");
  // komşunun karşı kenarı temizlenir
  let n = applyBorders(book(), 0, R("A1"), "all");
  n = applyBorders(n, 0, R("B1"), "none");
  expect(n.sheets[0].cells.A1.s.bd.r).toBeUndefined();
  expect(n.sheets[0].cells.A1.s.bd.l).toBeDefined();
});

/* ------------------------------ boyut ve görünüm ------------------------------ */

test("sütun genişliği, satır yüksekliği, gizleme ve dondurma", () => {
  let b = setColWidths(book(), 0, [0, 2], 180);
  b = setRowHeights(b, 0, [4], 60);
  b = setHidden(b, 0, "col", [1], true);
  b = setHidden(b, 0, "row", [2, 3], true);
  b = setFrozen(b, 0, 2, 1);
  const s = b.sheets[0];
  expect(s.colW).toEqual({ A: 180, C: 180 });
  expect(s.rowH).toEqual({ 5: 60 });
  expect(s.hiddenCols).toEqual([1]);
  expect(s.hiddenRows).toEqual([2, 3]);
  expect(getFrozen(s)).toEqual({ r: 2, c: 1 });
  expect(s.freeze).toBe(true); // eski istemciler için
  expect(getFrozen({ freeze: true })).toEqual({ r: 1, c: 0 });
  const L = sheetLayout(s);
  expect(L.cols.size(1)).toBe(0);
  expect(L.rows.size(2)).toBe(0);
  expect(L.rows.size(4)).toBe(60);
  expect(L.frozenH).toBe(48);
  expect(setFrozen(b, 0, 0, 0).sheets[0].frozen).toBeUndefined();
  b = setHidden(b, 0, "row", [2, 3], false);
  expect(b.sheets[0].hiddenRows).toBeUndefined();
});

/* --------------------------- ekleme / silme kaydırma --------------------------- */

test("satır ekleme: hücreler, formüller, birleştirme, boy, gizli, koşullu biçim, doğrulama, süzgeç kayar", () => {
  let b = book({ A1: "1", A2: "2", A3: "=TOPLA(A1:A2)", B5: "x" }, {
    merges: ["B5:C6"], rowH: { 5: 40 }, hiddenRows: [6], rowStyle: { 5: { b: true } },
    cf: [{ id: "c", ref: "A1:A3", type: "gt", a: "1", style: { bg: "#ff0000" } }],
    dv: [{ id: "d", ref: "D5:D9", type: "list", list: ["a"] }], filter: { ref: "A1:C9", crit: {} },
  });
  b = shiftAxis(b, 0, "row", 1, 2);
  const s = b.sheets[0];
  expect(s.cells.A5.v).toBe("=TOPLA(A1:A4)");
  expect(val(b, "A5")).toBe(3);
  expect(s.merges).toEqual(["B7:C8"]);
  expect(s.rowH).toEqual({ 7: 40 });
  expect(s.rowStyle).toEqual({ 7: { b: true } });
  expect(s.hiddenRows).toEqual([8]);
  expect(s.cf[0].ref).toBe("A1:A5");
  expect(s.dv[0].ref).toBe("D7:D11");
  expect(s.filter.ref).toBe("A1:C11");
});

test("sütun silme: birleştirme daralır/silinir, genişlikler ve süzgeç ölçütleri kayar", () => {
  let b = book({ A1: "1", D1: "=A1*2", E1: "=TOPLA(A1:D1)" }, { merges: ["B2:D3", "C5:C6"], colW: { A: 50, D: 150 }, colStyle: { D: { i: true } }, hiddenCols: [4], filter: { ref: "A1:E9", crit: { 3: { hide: ["x"] } } } });
  b = shiftAxis(b, 0, "col", 2, -1); // C silinir
  const s = b.sheets[0];
  expect(s.cells.C1.v).toBe("=A1*2");
  expect(s.cells.D1.v).toBe("=TOPLA(A1:C1)");
  expect(s.merges).toEqual(["B2:C3"]);
  expect(s.colW).toEqual({ A: 50, C: 150 });
  expect(s.colStyle).toEqual({ C: { i: true } });
  expect(s.hiddenCols).toEqual([3]);
  expect(s.filter).toEqual({ ref: "A1:D9", crit: { 2: { hide: ["x"] } } });
});

/* ------------------------------ doldurma serileri ------------------------------ */

const col = (b, c, r1, r2) => Array.from({ length: r2 - r1 + 1 }, (_, i) => b.sheets[0].cells[`${c}${r1 + i}`]?.v);

test("doldurma: 1,2 → 3,4,5; tek sayı kopyalanır, seri kipinde artar", () => {
  let b = fillSeries(book({ A1: "1", A2: "2" }), 0, R("A1:A2"), R("A1:A5"));
  expect(col(b, "A", 1, 5)).toEqual(["1", "2", "3", "4", "5"]);
  b = fillSeries(book({ A1: "10", A2: "7,5" }), 0, R("A1:A2"), R("A1:A4"));
  expect(col(b, "A", 3, 4)).toEqual(["5", "2,5"]);
  b = fillSeries(book({ A1: "7" }), 0, R("A1"), R("A1:A3"));
  expect(col(b, "A", 1, 3)).toEqual(["7", "7", "7"]);
  b = fillSeries(book({ A1: "7" }), 0, R("A1"), R("A1:A3"), { mode: "series" });
  expect(col(b, "A", 1, 3)).toEqual(["7", "8", "9"]);
});

test("doldurma: tarih (gün ve ay adımı), ay/gün adları, sondaki sayı, formül, yukarı ve sağa", () => {
  let b = fillSeries(book({ A1: "30.01.2026" }), 0, R("A1"), R("A1:A3"));
  expect(col(b, "A", 1, 3)).toEqual(["30.01.2026", "31.01.2026", "01.02.2026"]);
  b = fillSeries(book({ A1: "15.01.2026", A2: "15.02.2026" }), 0, R("A1:A2"), R("A1:A4"));
  expect(col(b, "A", 3, 4)).toEqual(["15.03.2026", "15.04.2026"]);
  b = fillSeries(book({ A1: "Ocak" }), 0, R("A1"), R("A1:A3"));
  expect(col(b, "A", 1, 3)).toEqual(["Ocak", "Şubat", "Mart"]);
  b = fillSeries(book({ A1: "Cuma" }), 0, R("A1"), R("A1:A4"));
  expect(col(b, "A", 2, 4)).toEqual(["Cumartesi", "Pazar", "Pazartesi"]);
  b = fillSeries(book({ A1: "Hafta 1" }), 0, R("A1"), R("A1:A3"));
  expect(col(b, "A", 2, 3)).toEqual(["Hafta 2", "Hafta 3"]);
  b = fillSeries(book({ B1: "=A1*2", C1: { v: "x", s: { b: true } } }), 0, R("B1:C1"), R("B1:C3"));
  expect(col(b, "B", 2, 3)).toEqual(["=A2*2", "=A3*2"]);
  expect(b.sheets[0].cells.C3).toEqual({ v: "x", s: { b: true } });
  b = fillSeries(book({ A5: "5", A6: "6" }), 0, R("A5:A6"), R("A3:A6"));
  expect(col(b, "A", 3, 4)).toEqual(["3", "4"]);
  b = fillSeries(book({ A1: "=$A$9+B1" }), 0, R("A1"), R("A1:C1"));
  expect(b.sheets[0].cells.C1.v).toBe("=$A$9+D1");
});

/* ------------------------------- sıralama / süzgeç ------------------------------- */

test("başlıklı ve çok düzeyli sıralama", () => {
  const b = book({ A1: "Ad", B1: "Puan", A2: "Can", B2: "5", A3: "Ali", B3: "9", A4: "Ece", B4: "5", A5: "Bora", B5: "=4+5" });
  const ev = createEvaluator(b);
  const out = sortRange(b, 0, R("A1:B5"), 1, false, (k) => ev.value(0, k), { header: true, keys: [{ col: 1, asc: false }, { col: 0, asc: true }] });
  expect(col(out, "A", 1, 5)).toEqual(["Ad", "Ali", "Bora", "Can", "Ece"]);
  expect(out.sheets[0].cells.B3.v).toBe("=4+5");
});

test("otomatik süzgeç: değer listesi ve koşul satır gizler; başlık gizlenmez", () => {
  let b = book({ A1: "Tür", B1: "Tutar", A2: "Gelir", B2: "100", A3: "Gider", B3: "50", A4: "Gelir", B4: "300", A5: "", B5: "7" });
  b = setFilter(b, 0, R("A1:B5"));
  b = setFilterCrit(b, 0, 0, { hide: ["Gider"] });
  const ev = createEvaluator(b);
  const at = (r, c) => ev.value(0, `${"AB"[c]}${r + 1}`);
  expect([...filteredRows(b.sheets[0], at)]).toEqual([2]);
  expect(filterValues(b.sheets[0], 0, at).map((v) => [v.text, v.count])).toEqual([["Gelir", 2], ["Gider", 1], ["", 1]]);
  b = setFilterCrit(b, 0, 0, null);
  b = setFilterCrit(b, 0, 1, { op: "gt", a: "60" });
  expect([...filteredRows(b.sheets[0], at)].sort()).toEqual([2, 4]);
  const L = sheetLayout(b.sheets[0], filteredRows(b.sheets[0], at));
  expect(L.rows.size(2)).toBe(0);
});

/* --------------------------- koşullu biçim / doğrulama --------------------------- */

test("koşullu biçim: büyüktür, yinelenen, ilk N, renk ölçeği, veri çubuğu", () => {
  let b = book({ A1: "10", A2: "50", A3: "50", A4: "90", B1: "Ali", B2: "ali", B3: "Can" });
  b = addCfRule(b, 0, { ref: "A1:A4", type: "gt", a: "40", style: { bg: "#ffc7ce" } });
  b = addCfRule(b, 0, { ref: "B1:B3", type: "dup", style: { c: "#ff0000" } });
  b = addCfRule(b, 0, { ref: "A1:A4", type: "top", a: "1", style: { b: true } });
  const ev = createEvaluator(b);
  const at = (r, c) => ev.value(0, `${"AB"[c]}${r + 1}`);
  const cf = createCfEvaluator(b.sheets[0], at);
  expect(cf.at(0, 0)).toBeNull();
  expect(cf.at(1, 0).style).toEqual({ bg: "#ffc7ce" });
  expect(cf.at(3, 0).style).toEqual({ bg: "#ffc7ce", b: true });
  expect(cf.at(0, 1).style).toEqual({ c: "#ff0000" });
  expect(cf.at(2, 1)).toBeNull();
  const s2 = addCfRule(addCfRule(book({ A1: "0", A2: "5", A3: "10" }), 0, { ref: "A1:A3", type: "scale", colors: ["#ff0000", "#00ff00"] }), 0, { ref: "A1:A3", type: "bar", colors: ["#0000ff"] });
  const ev2 = createEvaluator(s2);
  const cf2 = createCfEvaluator(s2.sheets[0], (r) => ev2.value(0, `A${r + 1}`));
  expect(cf2.at(0, 0).style.bg).toBe("#ff0000");
  expect(cf2.at(2, 0).style.bg).toBe("#00ff00");
  expect(cf2.at(1, 0).bar.ratio).toBeCloseTo(0.5);
});

test("açılır liste doğrulaması: liste ve aralık kaynağı, katı kip", () => {
  let b = book({ H1: "Ödendi", H2: "Bekliyor" });
  b = setValidation(b, 0, R("A1:A9"), { type: "list", list: ["Evet", "Hayır"], strict: true });
  b = setValidation(b, 0, R("B1:B9"), { type: "list", source: "=$H$1:$H$2", strict: true });
  const s = b.sheets[0];
  const ev = createEvaluator(b);
  const at = (r, c) => ev.value(0, `${String.fromCharCode(65 + c)}${r + 1}`);
  expect(validationItems(validationAt(s, 3, 0), s, at)).toEqual(["Evet", "Hayır"]);
  expect(validationItems(validationAt(s, 3, 1), s, at)).toEqual(["Ödendi", "Bekliyor"]);
  expect(isValidEntry(validationAt(s, 3, 0), s, at, "evet")).toBe(true);
  expect(isValidEntry(validationAt(s, 3, 0), s, at, "Belki")).toBe(false);
  expect(validationAt(s, 3, 2)).toBeNull();
});

/* ------------------------------ bul / temizle / pano ------------------------------ */

test("bul ve değiştir; yinelenenleri kaldır; durum çubuğu", () => {
  const b = book({ A1: "Ali Kaya", A2: "ali", B1: "=A1&\"!\"", B2: "Veli" });
  expect(findCells(b.sheets[0], "ali")).toEqual([{ row: 0, col: 0 }, { row: 1, col: 0 }]);
  expect(findCells(b.sheets[0], "ali", { matchCase: true })).toEqual([{ row: 1, col: 0 }]);
  expect(findCells(b.sheets[0], "ali", { whole: true })).toEqual([{ row: 1, col: 0 }]);
  const { book: out, count } = replaceCells(b, 0, findCells(b.sheets[0], "ali"), "ali", "Can");
  expect(count).toBe(2);
  expect(out.sheets[0].cells.A1.v).toBe("Can Kaya");
  const d = book({ A1: "Ad", A2: "x", A3: "X", A4: "y", A5: "x" });
  const ev = createEvaluator(d);
  const res = removeDuplicateRows(d, 0, R("A1:A5"), (k) => ev.value(0, k), { header: true });
  expect(res.removed).toBe(2);
  expect(col(res.book, "A", 1, 5)).toEqual(["Ad", "x", "y", undefined, undefined]);
  expect(selectionStats([1, 2, "a", null, { date: 3 }])).toMatchObject({ count: 4, numbers: 3, sum: 6, avg: 2, min: 1, max: 3 });
});

test("yapıştır: biçimler/değerler/çevirerek, birleştirmeler taşınır", () => {
  const b = book({ A1: { v: "=B1*2", s: { b: true } }, B1: "4", A2: "x" }, { merges: ["A3:B3"] });
  const ev = createEvaluator(b);
  const block = copyBlock(b.sheets[0], R("A1:B3"), (r, c) => ev.value(0, `${"AB"[c]}${r + 1}`));
  let out = pasteBlock(b, 0, R("D1"), block);
  expect(out.sheets[0].cells.D1).toEqual({ v: "=E1*2", s: { b: true } });
  expect(out.sheets[0].merges).toContain("D3:E3");
  out = pasteBlock(b, 0, R("D1"), block, { mode: "values" });
  expect(out.sheets[0].cells.D1).toEqual({ v: "8" });
  out = pasteBlock(b, 0, R("D5"), block, { mode: "formats" });
  expect(out.sheets[0].cells.D5).toEqual({ v: "", s: { b: true } });
  out = pasteBlock(b, 0, R("D1"), copyBlock(b.sheets[0], R("A1:B2")), { transpose: true });
  expect(out.sheets[0].cells.D2.v).toBe("4");
  expect(out.sheets[0].cells.E1.v).toBe("x");
});

test("pano: sekmeli metin (tırnaklı çok satırlı hücre) ve Excel / Google HTML'i", () => {
  const block = blockFromText('Ad\t"Not\nikinci satır"\nAli\t7\n');
  expect(block.rows).toEqual([[{ v: "Ad" }, { v: "Not\nikinci satır" }], [{ v: "Ali" }, { v: "7" }]]);
  expect(blockToText(block)).toBe('Ad\t"Not\nikinci satır"\nAli\t7');
  const html = `<html><head><style>.xl65{font-weight:700;background:#FFFF00;mso-pattern:auto;border:.5pt solid windowtext;}</style></head><body><table>
    <tr><td class="xl65" colspan="2">Başlık</td></tr>
    <tr><td style="color:#FF0000;text-align:right">1.250,5</td><td><b>kalın</b></td></tr></table></body></html>`;
  const b = blockFromHtml(html);
  expect(b.rows[0][0]).toMatchObject({ v: "Başlık", s: { b: true, bg: "#ffff00" } });
  expect(b.rows[0][0].s.bd.t).toEqual({ s: "thin", c: "#000000" });
  expect(b.merges).toEqual([{ r1: 0, c1: 0, r2: 0, c2: 1 }]);
  expect(b.rows[1][0]).toEqual({ v: "1.250,5", s: { c: "#ff0000", al: "right" } });
  expect(b.rows[1][1].s.b).toBe(true);
  const out = blockToHtml({ rows: [[{ v: "x", s: { b: true, bd: { b: { s: "double", c: "#000000" } } } }]], merges: [] }, () => "x");
  expect(out).toContain("font-weight:bold");
  expect(out).toContain("border-bottom:3px double #000000");
  expect(blockFromHtml(out).rows[0][0].s).toMatchObject({ b: true, bd: { b: { s: "double" } } });
});

/* ------------------------------ gezinme ve bölge ------------------------------ */

test("Ctrl+ok veri kenarına atlar; geçerli bölge; kullanılan alan birleştirmeyi sayar", () => {
  const b = book({ A1: "1", A2: "2", A3: "3", A6: "x", C1: "y" }, { merges: ["E8:F9"] });
  const s = b.sheets[0];
  expect(jumpEdge(s, 0, 0, 1, 0)).toEqual({ row: 2, col: 0 });
  expect(jumpEdge(s, 2, 0, 1, 0)).toEqual({ row: 5, col: 0 });
  expect(jumpEdge(s, 5, 0, 1, 0)).toEqual({ row: 49, col: 0 });
  expect(jumpEdge(s, 0, 0, 0, 1)).toEqual({ row: 0, col: 2 });
  expect(currentRegion(s, 1, 0)).toEqual({ r1: 0, r2: 2, c1: 0, c2: 0 });
  expect(usedBounds(s)).toEqual({ rows: 9, cols: 6 });
});

/* ------------------------------------ sayfalar ------------------------------------ */

test("sayfa çoğalt ve taşı; eşzamanlı birleştirme yeni alanları ve kimlikleri korur", () => {
  let b = book({ A1: "1" }, { merges: ["A1:B1"] });
  b = duplicateSheet(b, 0);
  expect(b.sheets.map((s) => s.name)).toEqual(["Sayfa1", "Sayfa1 (2)"]);
  expect(b.sheets[1].id).not.toBe(b.sheets[0].id);
  expect(b.sheets[1].merges).toEqual(["A1:B1"]);
  b = moveSheet(b, 1, 0);
  expect(b.sheets[0].name).toBe("Sayfa1 (2)");

  const base = { sheets: [{ id: "s1", name: "A", rows: 10, cols: 5, cells: { A1: { v: "1" } }, colW: {} }, { id: "s2", name: "B", rows: 10, cols: 5, cells: {}, colW: {} }] };
  const mine = { sheets: [{ ...base.sheets[0], merges: ["A1:B2"], rowH: { 2: 40 }, frozen: { r: 1, c: 0 }, cells: { A1: { v: "benim" } } }] }; // B'yi sildim
  const theirs = { sheets: [{ ...base.sheets[0], cells: { A1: { v: "1" }, C1: { v: "onlar" } }, colStyle: { C: { b: true } } }, base.sheets[1], { id: "s3", name: "C", rows: 5, cols: 5, cells: {}, colW: {} }] };
  const out = mergeWorkbooks(base, mine, theirs);
  expect(out.sheets.map((s) => s.id)).toEqual(["s1", "s3"]);
  expect(out.sheets[0]).toMatchObject({ merges: ["A1:B2"], rowH: { 2: 40 }, frozen: { r: 1, c: 0 }, colStyle: { C: { b: true } } });
  expect(out.sheets[0].cells).toEqual({ A1: { v: "benim" }, C1: { v: "onlar" } });
});

/* ------------------------------------ geometri ------------------------------------ */

test("geometri: önek toplamı, gizli atlama, dondurulmuş bölmede ekran dönüşümü", () => {
  const ax = buildAxis(5, (i) => (i === 2 ? 0 : 10));
  expect(ax.total).toBe(40);
  expect(ax.indexAt(15)).toBe(1);
  expect(ax.indexAt(20)).toBe(3); // gizli 2 atlanır
  expect(ax.indexAt(-5)).toBe(0);
  expect(ax.indexAt(999)).toBe(4);
  const sheet = { rows: 20000, cols: 50, cells: {}, colW: { A: 50 }, frozen: { r: 1, c: 1 } };
  const L = sheetLayout(sheet);
  expect(L.rows.total).toBe(20000 * 24);
  const view = { zoom: 2, scrollTop: 480, scrollLeft: 200, headW: 40, headH: 20 };
  // Dondurulmuş A sütunu kaymaz; B kayar
  expect(screenX(L, view, 0)).toBe(40);
  expect(screenX(L, view, 1)).toBe(40 + 100 - 200);
  expect(screenY(L, view, 0)).toBe(20);
  expect(screenY(L, view, 1)).toBe(20 + 48 - 480);
  expect(colAtX(L, view, 60)).toBe(0);
  expect(rowAtY(L, view, 20 + 48 + 1)).toBe(11);
  const next = scrollToReveal(L, view, 1000, 30, 800, 600);
  expect(next.top).toBeGreaterThan(480);
  expect(next.left).toBeGreaterThan(200);
});

/* ------------------------------ büyük sayfa formülleri ------------------------------ */

test("9999 satırdan sonraki başvurular ve tam sütun", () => {
  const b = { sheets: [{ name: "S", rows: 20000, cols: 5, cells: { A15000: { v: "7" }, A19999: { v: "3" }, B1: { v: "=TOPLA(A:A)" }, B2: { v: "=A15000*2" } }, colW: {} }] };
  expect(val(b, "B1")).toBe(10);
  expect(val(b, "B2")).toBe(14);
  const ins = shiftAxis(b, 0, "row", 0, 1);
  expect(ins.sheets[0].cells.B3.v).toBe("=A15001*2");
});

/* ---------------------------------- xlsx gidiş-dönüş ---------------------------------- */

test("xlsx gidiş-dönüş: birleştirme, biçimler, kenarlık, boyutlar, gizleme, dondurma, süzgeç, koşullu biçim, doğrulama", async () => {
  const src = {
    sheets: [{
      name: "Rapor", rows: 60, cols: 10, tab: "#ff0000", noGrid: true,
      cells: {
        A1: { v: "Başlık", s: { b: true, fs: 16, ff: "Arial", al: "center", va: "middle", bg: "#1f4e79", c: "#ffffff" } },
        A2: { v: "Tutar", s: { bd: { b: { s: "double", c: "#000000" }, t: { s: "thin", c: "#ff0000" } }, st: true, i: true } },
        B2: { v: "1250,5", s: { f: "money", ng: true } },
        C2: { v: "0,25", s: { f: "percent", d: 1 } },
        D2: { v: "31.12.2026", s: { f: "dateLong" } },
        E2: { v: "0,5", s: { f: "time" } },
        F2: { v: "uzun metin kaydırılır", s: { wr: true, rot: 45, ind: 2 } },
        G2: { v: "=B2*2", s: { f: "number", d: 0 } },
      },
      colW: { A: 180, B: 120 }, rowH: { 1: 40 }, merges: ["A1:F1"], frozen: { r: 2, c: 1 }, freeze: true,
      hiddenRows: [9], hiddenCols: [8], filter: { ref: "A2:G20", crit: {} },
      cf: [{ id: "x", ref: "B2:B20", type: "gt", a: "1000", style: { bg: "#ffc7ce", c: "#9c0006" } }, { id: "y", ref: "C2:C20", type: "scale", colors: ["#f8696b", "#ffeb84", "#63be7b"] }],
      dv: [{ id: "v", ref: "H2:H20", type: "list", list: ["Evet", "Hayır"], strict: true }],
      colStyle: { J: { bg: "#ffff00" } },
    }],
  };
  const bytes = workbookToXlsx(src, createEvaluator(src));
  const { book: back, warnings } = await xlsxToWorkbook(bytes);
  const s = back.sheets[0];
  expect(warnings).toEqual([]);
  expect(s.merges).toEqual(["A1:F1"]);
  expect(s.frozen).toEqual({ r: 2, c: 1 });
  expect(s.colW.A).toBe(180);
  expect(s.rowH).toEqual({ 1: 40 });
  expect(s.hiddenRows).toEqual([9]);
  expect(s.hiddenCols).toEqual([8]);
  expect(s.filter.ref).toBe("A2:G20");
  expect(s.noGrid).toBe(true);
  expect(s.tab).toBe("#ff0000");
  expect(s.cells.A1.s).toMatchObject({ b: true, fs: 16, ff: "Arial", al: "center", va: "middle", bg: "#1f4e79", c: "#ffffff" });
  expect(s.cells.A2.s).toMatchObject({ st: true, i: true, bd: { b: { s: "double", c: "#000000" }, t: { s: "thin", c: "#ff0000" } } });
  expect(s.cells.B2.s).toMatchObject({ f: "money", ng: true });
  expect(s.cells.C2.s).toMatchObject({ f: "percent", d: 1 });
  expect(s.cells.D2.s.f).toBe("dateLong");
  expect(s.cells.E2.s.f).toBe("time");
  expect(s.cells.F2.s).toMatchObject({ wr: true, rot: 45, ind: 2 });
  expect(s.cells.G2.v).toBe("=B2*2");
  expect(s.cf.map((r) => r.type)).toEqual(["gt", "scale"]);
  expect(s.cf[0]).toMatchObject({ ref: "B2:B20", a: "1000", style: { bg: "#ffc7ce", c: "#9c0006" } });
  expect(s.cf[1].colors).toHaveLength(3);
  expect(s.dv[0]).toMatchObject({ ref: "H2:H20", list: ["Evet", "Hayır"], strict: true });
  expect(shown(back, "B2")).toBe("1250,50 ₺");
  expect(rangeText(R("a1:b2"))).toBe("A1:B2");
});
