// Ortak dışa aktarma: rapor → .xlsx (Office Open XML), dış kütüphane olmadan.
// BU DOSYA elitlig-mac ve elitlig-client depolarında AYNIDIR.
//
// Her tablo bölümü ayrı bir sayfa; özet kartları varsa ilk sayfa "Özet".
// Biçimli başlık şeridi, süzgeç satırı, kalın başlık satırı (dondurulmuş, süzgeçli),
// sayı / para (₺) / yüzde / tarih biçimleri, grup başlıkları, ara toplam ve toplam
// satırı (SUBTOTAL formülü + önceden hesaplanmış değer).
import { formatDateTimeTr, formatValue, isNumericType, mdBlocks, toDate, toNumber } from "./exportCore";
import { xmlEsc as esc, zipStore } from "./zip";

const colName = (i) => { let s = ""; let n = i + 1; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
const ref = (c, r) => `${colName(c)}${r + 1}`;

/** Yerel tarih → Excel seri sayısı (1900 tarih sistemi). */
export function excelSerial(value, withTime = false) {
  const d = toDate(value);
  if (!d) return null;
  const utc = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), withTime ? d.getHours() : 0, withTime ? d.getMinutes() : 0, withTime ? d.getSeconds() : 0);
  return Math.round(((utc - Date.UTC(1899, 11, 30)) / 86400000) * 100000) / 100000;
}

/** Excel kurallarına uygun (≤31 karakter, tekil) sayfa adları. */
export function sheetNames(titles) {
  const used = new Set();
  return titles.map((t, i) => {
    const base = String(t || "").replace(/[[\]:*?/\\]/g, "").replace(/^'+|'+$/g, "").trim().slice(0, 31) || `Sayfa${i + 1}`;
    let name = base;
    let n = 2;
    while (used.has(name.toLocaleLowerCase("tr-TR"))) { name = `${base.slice(0, 27)} (${n})`; n += 1; }
    used.add(name.toLocaleLowerCase("tr-TR"));
    return name;
  });
}

/* ---- biçim tablosu: sabit, okunur dizinler ---- */
const FONTS = [
  '<font><sz val="10"/><name val="Calibri"/><family val="2"/></font>',
  '<font><b/><sz val="10"/><name val="Calibri"/><family val="2"/></font>',
  '<font><b/><sz val="14"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>',
  '<font><i/><sz val="9"/><color rgb="FF6B7280"/><name val="Calibri"/><family val="2"/></font>',
  '<font><b/><sz val="10"/><color rgb="FF3B0764"/><name val="Calibri"/><family val="2"/></font>',
  '<font><b/><sz val="12"/><name val="Calibri"/><family val="2"/></font>',
];
const FILLS = [
  '<fill><patternFill patternType="none"/></fill>',
  '<fill><patternFill patternType="gray125"/></fill>',
  '<fill><patternFill patternType="solid"><fgColor rgb="FF5B21B6"/><bgColor indexed="64"/></patternFill></fill>',
  '<fill><patternFill patternType="solid"><fgColor rgb="FFEDE9FE"/><bgColor indexed="64"/></patternFill></fill>',
  '<fill><patternFill patternType="solid"><fgColor rgb="FFF5F3FF"/><bgColor indexed="64"/></patternFill></fill>',
  '<fill><patternFill patternType="solid"><fgColor rgb="FFFAF5FF"/><bgColor indexed="64"/></patternFill></fill>',
];
const BORDERS = [
  "<border><left/><right/><top/><bottom/><diagonal/></border>",
  '<border><left/><right/><top/><bottom style="thin"><color rgb="FFA78BFA"/></bottom><diagonal/></border>',
  '<border><left/><right/><top style="medium"><color rgb="FF7C3AED"/></top><bottom/><diagonal/></border>',
  '<border><left/><right/><top/><bottom style="hair"><color rgb="FFE5E7EB"/></bottom><diagonal/></border>',
];
const NUMFMTS = { 164: '#,##0.00\\ "₺"', 165: "dd.mm.yyyy", 166: "dd.mm.yyyy hh:mm", 167: "0.0%", 169: "hh:mm" };
// value-kind → numFmtId
const FMT = { text: 0, longtext: 0, number: 3, decimal: 4, money: 164, percent: 167, date: 165, datetime: 166, time: 169, bool: 0 };
const KINDS = Object.keys(FMT);
// XF sırası: 0 normal, 1 başlık şeridi, 2 alt bilgi, 3 sütun başlığı, 4 sütun başlığı (sağ),
// 5 grup başlığı, 6 özet etiketi, 7 özet değeri, ardından her tür için: gövde / ara toplam / toplam.
const XFS = [
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>',
  '<xf numFmtId="0" fontId="2" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf>',
  '<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>',
  '<xf numFmtId="0" fontId="4" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>',
  '<xf numFmtId="0" fontId="4" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center" wrapText="1"/></xf>',
  '<xf numFmtId="0" fontId="4" fillId="4" borderId="0" xfId="0" applyFont="1" applyFill="1"/>',
  '<xf numFmtId="0" fontId="1" fillId="4" borderId="3" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>',
];
const XF_BASE = {};
const SUMMARY_VALUE = {};
KINDS.forEach((k) => {
  const fmt = FMT[k];
  const nf = fmt ? ` applyNumberFormat="1"` : "";
  const wrap = k === "longtext" ? '<alignment vertical="top" wrapText="1"/>' : '<alignment vertical="top"/>';
  XF_BASE[k] = XFS.length;
  XFS.push(`<xf numFmtId="${fmt}" fontId="0" fillId="0" borderId="3" xfId="0" applyBorder="1" applyAlignment="1"${nf}>${wrap}</xf>`);
  XFS.push(`<xf numFmtId="${fmt}" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"${nf}/>`);
  XFS.push(`<xf numFmtId="${fmt}" fontId="1" fillId="5" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1"${nf}/>`);
  SUMMARY_VALUE[k] = XFS.length;
  XFS.push(`<xf numFmtId="${fmt}" fontId="5" fillId="0" borderId="3" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"${nf}><alignment horizontal="left"/></xf>`);
});
const xfBody = (k) => XF_BASE[k] ?? XF_BASE.text;
const xfSub = (k) => xfBody(k) + 1;
const xfTot = (k) => xfBody(k) + 2;

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="${Object.keys(NUMFMTS).length}">${Object.entries(NUMFMTS).map(([id, code]) => `<numFmt numFmtId="${id}" formatCode="${esc(code)}"/>`).join("")}</numFmts><fonts count="${FONTS.length}">${FONTS.join("")}</fonts><fills count="${FILLS.length}">${FILLS.join("")}</fills><borders count="${BORDERS.length}">${BORDERS.join("")}</borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${XFS.length}">${XFS.join("")}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

/* ---- hücreler ---- */
const strCell = (r, s, text) => (text === "" || text == null ? (s ? `<c r="${r}" s="${s}"/>` : "") : `<c r="${r}"${s ? ` s="${s}"` : ""} t="inlineStr"><is><t xml:space="preserve">${esc(text)}</t></is></c>`);
const numCell = (r, s, n) => `<c r="${r}"${s ? ` s="${s}"` : ""}><v>${n}</v></c>`;

/** Bir değeri türüne göre hücreye yazar. */
function valueCell(r, kind, value, s) {
  if (value == null || value === "") return s ? `<c r="${r}" s="${s}"/>` : "";
  if (kind === "number" || kind === "decimal" || kind === "money") { const n = toNumber(value); return n == null ? strCell(r, s, String(value)) : numCell(r, s, n); }
  if (kind === "percent") { const n = toNumber(value); return n == null ? strCell(r, s, String(value)) : numCell(r, s, Math.round(n * 1000) / 100000); }
  if (kind === "date" || kind === "datetime") { const n = excelSerial(value, kind === "datetime"); return n == null ? strCell(r, s, String(value)) : numCell(r, s, n); }
  return strCell(r, s, formatValue(value, kind));
}

class Sheet {
  constructor(name) { this.name = name; this.rows = []; this.merges = []; this.widths = []; this.freeze = null; this.filter = null; this.heights = {}; }
  row(cells, height) { this.rows.push(cells.join("")); if (height) this.heights[this.rows.length - 1] = height; return this.rows.length - 1; }
  get next() { return this.rows.length; }
  xml() {
    const body = this.rows.map((c, i) => `<row r="${i + 1}"${this.heights[i] ? ` ht="${this.heights[i]}" customHeight="1"` : ""}>${c}</row>`).join("");
    const cols = this.widths.length ? `<cols>${this.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>` : "";
    const pane = this.freeze != null ? `<pane ySplit="${this.freeze}" topLeftCell="A${this.freeze + 1}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${this.freeze + 1}" sqref="A${this.freeze + 1}"/>` : "";
    const merges = this.merges.length ? `<mergeCells count="${this.merges.length}">${this.merges.map((m) => `<mergeCell ref="${m}"/>`).join("")}</mergeCells>` : "";
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><sheetViews><sheetView workbookViewId="0" showGridLines="0">${pane}</sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/>${cols}<sheetData>${body}</sheetData>${this.filter ? `<autoFilter ref="${this.filter}"/>` : ""}${merges}<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.6" header="0.3" footer="0.3"/><pageSetup paperSize="9" orientation="${this.landscape ? "landscape" : "portrait"}" fitToWidth="1" fitToHeight="0"/><headerFooter><oddFooter>&amp;L${esc(this.footer || "Elitlig")}&amp;RSayfa &amp;P / &amp;N</oddFooter></headerFooter></worksheet>`;
  }
}

function banner(sheet, p, width, title) {
  const span = Math.max(1, width) - 1;
  sheet.row([strCell("A1", 1, title), ...Array.from({ length: span }, (_, i) => `<c r="${ref(i + 1, 0)}" s="1"/>`)], 26);
  if (span) sheet.merges.push(`A1:${ref(span, 0)}`);
  const info = [p.subtitle, p.filterText, `Oluşturma: ${formatDateTimeTr(p.generatedAt)}`].filter(Boolean).join(" · ");
  sheet.row([strCell("A2", 2, info)]);
  if (span) sheet.merges.push(`A2:${ref(span, 1)}`);
  sheet.row([]);
}

const textWidth = (s) => Math.max(...String(s ?? "").split("\n").map((l) => l.length), 0);

function tableSheet(sheet, p, s) {
  const cols = s.columns;
  banner(sheet, p, cols.length, s.title && s.title !== p.title ? `${p.title} — ${s.title}` : p.title);
  const head = sheet.next;
  sheet.row(cols.map((c, i) => strCell(ref(i, head), isNumericType(c.type) ? 4 : 3, c.label)), 20);
  sheet.freeze = head + 1;
  const widths = cols.map((c) => Math.max(8, c.label.length + 2));
  const firstData = sheet.next;
  const subtotalRows = [];
  for (const g of s.groups) {
    if (g.label && s.groups.length > 1) {
      const r = sheet.next;
      sheet.row([strCell(ref(0, r), 5, `${g.label} (${g.rows.length})`), ...cols.slice(1).map((_, i) => `<c r="${ref(i + 1, r)}" s="5"/>`)]);
    }
    const gStart = sheet.next;
    for (const values of g.rows) {
      const r = sheet.next;
      sheet.row(values.map((v, i) => {
        const kind = cols[i].type || "text";
        const shown = formatValue(v, kind);
        widths[i] = Math.max(widths[i], Math.min(kind === "longtext" ? 60 : 48, textWidth(shown) + 2));
        const n = kind === "number" ? toNumber(v) : null;
        return valueCell(ref(i, r), kind, v, xfBody(n != null && !Number.isInteger(n) ? "decimal" : kind));
      }));
    }
    if (g.subtotal && s.groups.length > 1) {
      const r = sheet.next;
      const gEnd = r - 1;
      sheet.row(cols.map((c, i) => {
        const kind = c.type || "text";
        if (g.subtotal.labels[i]) return strCell(ref(i, r), xfSub("text"), "Ara toplam");
        if (!c.total || gEnd < gStart) return "";
        const fn = c.total === "avg" ? 101 : c.total === "count" ? 103 : 109;
        const v = g.subtotal.values[i];
        return `<c r="${ref(i, r)}" s="${xfSub(c.total === "count" ? "number" : kind)}"><f>SUBTOTAL(${fn},${ref(i, gStart)}:${ref(i, gEnd)})</f>${v == null ? "" : `<v>${kind === "percent" && c.total !== "count" ? v / 100 : v}</v>`}</c>`;
      }));
      subtotalRows.push(r);
    }
  }
  const lastData = sheet.next - 1;
  if (!s.rowCount) sheet.row([strCell(ref(0, sheet.next), 2, "Bu seçimde kayıt yok.")]);
  if (s.totals) {
    const r = sheet.next;
    sheet.row(cols.map((c, i) => {
      const kind = c.type || "text";
      if (s.totals.labels[i]) return strCell(ref(i, r), xfTot("text"), s.totals.labels[i]);
      if (!c.total) return `<c r="${ref(i, r)}" s="${xfTot("text")}"/>`;
      const v = s.totals.values[i];
      const fn = c.total === "avg" ? 101 : c.total === "count" ? 103 : 109;
      const f = lastData >= firstData ? `<f>SUBTOTAL(${fn},${ref(i, firstData)}:${ref(i, lastData)})</f>` : "";
      return `<c r="${ref(i, r)}" s="${xfTot(c.total === "count" ? "number" : kind)}">${f}${v == null ? "" : `<v>${kind === "percent" && c.total !== "count" ? v / 100 : v}</v>`}</c>`;
    }));
  }
  sheet.widths = widths.map((w, i) => (cols[i].xlsxWidth || (cols[i].width ? Math.round(cols[i].width / 7) : w)));
  if (cols.length && lastData >= firstData) sheet.filter = `${ref(0, head)}:${ref(cols.length - 1, lastData)}`;
  sheet.landscape = p.orientation === "landscape";
}

function summarySheet(sheet, p, items, title) {
  banner(sheet, p, 3, title);
  for (const it of items) {
    const r = sheet.next;
    const kind = it.type || "text";
    sheet.row([strCell(ref(0, r), 6, it.label), valueCell(ref(1, r), kind, it.value, SUMMARY_VALUE[kind] ?? SUMMARY_VALUE.text), it.hint ? strCell(ref(2, r), 2, it.hint) : ""]);
  }
  sheet.widths = [Math.max(18, ...items.map((i) => String(i.label).length + 2)), Math.max(18, ...items.map((i) => formatValue(i.value, i.type).length + 4)), 40];
}

function textSheet(sheet, p, s) {
  banner(sheet, p, 1, s.title || p.title);
  for (const b of mdBlocks(s.text)) {
    const r = sheet.next;
    const t = b.t === "li" ? `${b.checked == null ? (b.ordered ? `${b.n}.` : "•") : b.checked ? "☑" : "☐"} ${b.text}` : b.t === "hr" ? "" : b.text;
    sheet.row([strCell(ref(0, r), b.t === "h" ? 5 : xfBody("longtext"), t.replace(/\*\*|__|`/g, ""))]);
  }
  sheet.widths = [100];
}

/** Hazırlanmış raporu .xlsx baytlarına çevirir. */
export function reportToXlsx(p) {
  const plan = [];
  if (p.summary.length) plan.push({ title: "Özet", build: (sh) => summarySheet(sh, p, p.summary, `${p.title} — Özet`) });
  for (const s of p.sections) {
    if (s.kind === "table") plan.push({ title: s.title || p.title, build: (sh) => tableSheet(sh, p, s) });
    else if (s.kind === "keyvalue") plan.push({ title: s.title || "Bilgiler", build: (sh) => summarySheet(sh, p, s.items || [], s.title || p.title) });
    else plan.push({ title: s.title || "Metin", build: (sh) => textSheet(sh, p, s) });
  }
  if (!plan.length) plan.push({ title: p.title, build: (sh) => banner(sh, p, 1, p.title) });
  const names = sheetNames(plan.map((x) => x.title));
  const sheets = plan.map((x, i) => { const sh = new Sheet(names[i]); sh.footer = `${p.brand} · ${p.title}`; x.build(sh); return sh; });
  const now = p.generatedAt.toISOString().replace(/\.\d{3}Z$/, "Z");
  const files = [
    { name: "[Content_Types].xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>` },
    { name: "_rels/.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>` },
    { name: "docProps/core.xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(p.title)}</dc:title><dc:creator>${esc(p.author || p.brand)}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>` },
    { name: "docProps/app.xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Elitlig</Application></Properties>` },
    { name: "xl/workbook.xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="0"/></bookViews><sheets>${sheets.map((sh, i) => `<sheet name="${esc(sh.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets><definedNames>${sheets.map((sh, i) => (sh.filter ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${esc(sh.name.replace(/'/g, "''"))}'!${sh.filter.replace(/([A-Z]+)(\d+)/g, "$$$1$$$2")}</definedName>` : "")).join("")}</definedNames><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`.replace("<definedNames></definedNames>", "") },
    { name: "xl/_rels/workbook.xml.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: "xl/styles.xml", data: STYLES_XML },
    ...sheets.map((sh, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sh.xml() })),
  ];
  return zipStore(files, p.generatedAt);
}
