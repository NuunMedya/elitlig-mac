// Tablolar: .xlsx (Office Open XML) dışa aktarım — dış kütüphane olmadan.
//
// Çalışma kitabı XML parçalarına yazılır ve sıkıştırmasız (STORE) bir ZIP
// arşivinde paketlenir; Excel, LibreOffice ve Google E-Tablolar açar.
//   • Formüller Excel söz dizimine çevrilir: Türkçe işlev adları İngilizceye,
//     ";" ayracı ",", ondalık virgül noktaya, DOĞRU/YANLIŞ → TRUE/FALSE.
//     Son hesaplanan değer de yazılır; Excel açılışta yeniden hesaplar.
//   • Biçimler: kalın/italik/altı çizili, yazı ve dolgu rengi, hizalama,
//     sayı/para/yüzde/tarih/metin biçimleri ve ondalık basamak.
//   • Sütun genişlikleri ve dondurulmuş ilk satır korunur.
import { FUNCTIONS, addr, isError, parseAddr, parseLiteral, tokenize } from "./sheetEngine";

/* ---------------------------------- ZIP ---------------------------------- */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Sıkıştırmasız ZIP. files: [{ name, data: string | Uint8Array }] → Uint8Array */
export function zipStore(files, date = new Date()) {
  const enc = new TextEncoder();
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const file of files) {
    const name = enc.encode(file.name);
    const data = typeof file.data === "string" ? enc.encode(file.data) : file.data;
    const crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // UTF-8 adlar
    local.setUint16(8, 0, true); // STORE
    local.setUint16(10, dosTime, true);
    local.setUint16(12, dosDate, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true);
    locals.push(new Uint8Array(local.buffer), name, data);

    const central = new DataView(new ArrayBuffer(46));
    central.setUint32(0, 0x02014b50, true);
    central.setUint16(4, 20, true);
    central.setUint16(6, 20, true);
    central.setUint16(8, 0x0800, true);
    central.setUint16(10, 0, true);
    central.setUint16(12, dosTime, true);
    central.setUint16(14, dosDate, true);
    central.setUint32(16, crc, true);
    central.setUint32(20, data.length, true);
    central.setUint32(24, data.length, true);
    central.setUint16(28, name.length, true);
    central.setUint32(42, offset, true);
    centrals.push(new Uint8Array(central.buffer), name);
    offset += 30 + name.length + data.length;
  }
  const centralSize = centrals.reduce((s, part) => s + part.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  const parts = [...locals, ...centrals, new Uint8Array(end.buffer)];
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let pos = 0;
  for (const part of parts) { out.set(part, pos); pos += part.length; }
  return out;
}

/* ------------------------------ formül çevirisi ------------------------------ */

// Excel 2010 sonrası işlevler dosyada _xlfn. önekiyle saklanır.
const XLFN = new Set(["CONCAT", "TEXTJOIN", "DAYS"]);
const ERROR_CODES = { "#BÖL/0!": "#DIV/0!", "#DEĞER!": "#VALUE!", "#AD?": "#NAME?", "#BAŞV!": "#REF!", "#YOK": "#N/A", "#SAYI!": "#NUM!", "#DÖNGÜ!": "#VALUE!" };

const fold = (s) => s.toLocaleUpperCase("tr-TR").replace(/İ/g, "I").replace(/Ğ/g, "G").replace(/Ü/g, "U").replace(/Ş/g, "S").replace(/Ö/g, "O").replace(/Ç/g, "C");
const FN_TO_EN = (() => {
  const map = new Map();
  for (const [en, def] of Object.entries(FUNCTIONS)) {
    map.set(en, en);
    map.set(def.tr.toLocaleUpperCase("tr-TR"), en);
    map.set(fold(def.tr), en);
  }
  return map;
})();

const sheetRef = (name) => (/^[A-Za-z_][A-Za-z0-9_.]*$/.test(name) && !/^[A-Za-z]{1,3}\d+$/.test(name) ? name : `'${name.replace(/'/g, "''")}'`);

/**
 * Uygulama formülünü Excel formülüne çevirir ("=" olmadan döner).
 * sheetNames: uygulamadaki ad → dosyadaki (en çok 31 karakter) ad.
 */
export function toExcelFormula(formula, sheetNames = new Map()) {
  const src = String(formula).replace(/^=/, "");
  // Silinmiş başvuru içeren formül çevrilemez; metin olarak yazılır.
  if (src.includes("#BAŞV!")) return null;
  let tokens;
  try {
    tokens = tokenize(src);
  } catch {
    return null;
  }
  let out = "";
  tokens.forEach((tok, i) => {
    switch (tok.t) {
      case "num": out += String(tok.v); break;
      case "str": out += `"${tok.v.replace(/"/g, '""')}"`; break;
      case "ref": {
        if (tok.sheet) {
          const key = tok.sheet.toLocaleLowerCase("tr-TR");
          const mapped = sheetNames.get(key) || tok.sheet;
          out += `${sheetRef(mapped)}!`;
        }
        out += tok.a.toUpperCase() + (tok.b ? `:${tok.b.toUpperCase()}` : "");
        break;
      }
      case "word": {
        const up = tok.v.toLocaleUpperCase("tr-TR");
        if (tokens[i + 1]?.t === "(") {
          const en = FN_TO_EN.get(up) || FN_TO_EN.get(fold(tok.v)) || FN_TO_EN.get(up.replace(/\./g, "_")) || up;
          out += XLFN.has(en) ? `_xlfn.${en}` : en;
        } else if (up === "DOĞRU" || up === "TRUE") out += "TRUE";
        else if (up === "YANLIŞ" || up === "FALSE") out += "FALSE";
        else out += tok.v;
        break;
      }
      case ";": case ",": out += ","; break;
      case "(": case ")": out += tok.t; break;
      default: out += tok.v;
    }
  });
  return out;
}

/* ---------------------------------- biçimler ---------------------------------- */

const esc = (s) => String(s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
  // XML 1.0'da geçersiz denetim karakterleri atılır.
  // eslint-disable-next-line no-control-regex
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
const argb = (hex) => `FF${hex.replace("#", "").toUpperCase()}`;

const numFmtCode = (s) => {
  const d = s.d;
  const dec = (n) => (n > 0 ? `.${"0".repeat(n)}` : "");
  switch (s.f) {
    case "money": return `#,##0${dec(d ?? 2)} "₺"`;
    case "percent": return `0${dec(d ?? 0)}%`;
    case "number": return `#,##0${dec(d ?? 2)}`;
    case "date": return "dd.mm.yyyy";
    case "text": return "@";
    default: return d != null ? `0${dec(d)}` : null;
  }
};

class StyleBook {
  constructor() {
    this.fonts = ["<font><sz val=\"11\"/><name val=\"Calibri\"/><family val=\"2\"/></font>"];
    this.fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'];
    this.numFmts = [];
    this.xfs = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'];
    this.cache = new Map([["", 0]]);
    this.fontIdx = new Map();
    this.fillIdx = new Map();
    this.fmtIdx = new Map();
  }

  font(s) {
    const key = `${s.b ? 1 : 0}${s.i ? 1 : 0}${s.u ? 1 : 0}${s.c || ""}`;
    if (key === "000") return 0;
    if (!this.fontIdx.has(key)) {
      this.fontIdx.set(key, this.fonts.length);
      this.fonts.push(`<font>${s.b ? "<b/>" : ""}${s.i ? "<i/>" : ""}${s.u ? "<u/>" : ""}<sz val="11"/>${s.c ? `<color rgb="${argb(s.c)}"/>` : ""}<name val="Calibri"/><family val="2"/></font>`);
    }
    return this.fontIdx.get(key);
  }

  fill(bg) {
    if (!bg) return 0;
    if (!this.fillIdx.has(bg)) {
      this.fillIdx.set(bg, this.fills.length);
      this.fills.push(`<fill><patternFill patternType="solid"><fgColor rgb="${argb(bg)}"/><bgColor indexed="64"/></patternFill></fill>`);
    }
    return this.fillIdx.get(bg);
  }

  numFmt(s, isDate) {
    const code = numFmtCode(isDate && !s.f ? { ...s, f: "date" } : s);
    if (!code) return 0;
    if (code === "@") return 49;
    if (!this.fmtIdx.has(code)) {
      const id = 164 + this.numFmts.length;
      this.fmtIdx.set(code, id);
      this.numFmts.push(`<numFmt numFmtId="${id}" formatCode="${esc(code)}"/>`);
    }
    return this.fmtIdx.get(code);
  }

  /** Hücre biçiminin xf dizini. isDate: değer tarih ama biçim verilmemiş. */
  xf(s = {}, isDate = false) {
    const key = JSON.stringify([s.b, s.i, s.u, s.c, s.bg, s.al, s.f, s.d, isDate]);
    if (this.cache.has(key)) return this.cache.get(key);
    const fontId = this.font(s);
    const fillId = this.fill(s.bg);
    const numFmtId = this.numFmt(s, isDate);
    const align = s.al ? `<alignment horizontal="${s.al}"/>` : "";
    const attrs = [`numFmtId="${numFmtId}"`, `fontId="${fontId}"`, `fillId="${fillId}"`, 'borderId="0"', 'xfId="0"'];
    if (numFmtId) attrs.push('applyNumberFormat="1"');
    if (fontId) attrs.push('applyFont="1"');
    if (fillId) attrs.push('applyFill="1"');
    if (align) attrs.push('applyAlignment="1"');
    const index = this.xfs.length;
    this.xfs.push(align ? `<xf ${attrs.join(" ")}>${align}</xf>` : `<xf ${attrs.join(" ")}/>`);
    this.cache.set(key, index);
    return index;
  }

  xml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${this.numFmts.length ? `<numFmts count="${this.numFmts.length}">${this.numFmts.join("")}</numFmts>` : ""}<fonts count="${this.fonts.length}">${this.fonts.join("")}</fonts><fills count="${this.fills.length}">${this.fills.join("")}</fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${this.xfs.length}">${this.xfs.join("")}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  }
}

/* ---------------------------------- sayfalar ---------------------------------- */

/** Uygulama sayfa adlarını Excel kurallarına (≤31 karakter, tekil) uyarlar. */
export function excelSheetNames(sheets) {
  const used = new Set();
  return sheets.map((s, i) => {
    let base = s.name.replace(/[[\]:*?/\\]/g, "").replace(/^'+|'+$/g, "").slice(0, 31) || `Sayfa${i + 1}`;
    let name = base;
    let n = 2;
    while (used.has(name.toLocaleLowerCase("tr-TR"))) { name = `${base.slice(0, 27)} (${n})`; n += 1; }
    used.add(name.toLocaleLowerCase("tr-TR"));
    return name;
  });
}

function cellXml(ref, cell, value, styles, sheetNames) {
  const s = cell.s || {};
  const raw = cell.v ?? "";
  const isDate = value && typeof value === "object" && "date" in value;
  const xf = styles.xf(s, isDate);
  const sAttr = xf ? ` s="${xf}"` : "";
  const isFormula = typeof raw === "string" && raw.startsWith("=") && raw.length > 1;

  const cached = () => {
    if (value == null) return { t: null, v: null };
    if (isError(value)) return { t: "e", v: ERROR_CODES[value.code] || "#VALUE!" };
    if (typeof value === "boolean") return { t: "b", v: value ? "1" : "0" };
    if (typeof value === "number") return { t: "n", v: String(value) };
    if (isDate) return { t: "n", v: String(value.date) };
    return { t: "str", v: String(value) };
  };

  if (isFormula) {
    const f = toExcelFormula(raw, sheetNames);
    if (f == null) return `<c r="${ref}"${sAttr} t="inlineStr"><is><t xml:space="preserve">${esc(raw)}</t></is></c>`;
    const c = cached();
    const tAttr = c.t && c.t !== "n" ? ` t="${c.t}"` : "";
    return `<c r="${ref}"${sAttr}${tAttr}><f>${esc(f)}</f>${c.v != null ? `<v>${esc(c.v)}</v>` : ""}</c>`;
  }
  if (raw === "") return xf ? `<c r="${ref}"${sAttr}/>` : "";
  // "Metin" biçimli ya da ' ile başlayan değerler yazıldığı gibi kalır.
  if (s.f === "text" || raw.startsWith("'")) {
    const text = raw.startsWith("'") ? raw.slice(1) : raw;
    return `<c r="${ref}"${sAttr} t="inlineStr"><is><t xml:space="preserve">${esc(text)}</t></is></c>`;
  }
  const lit = parseLiteral(raw);
  if (typeof lit === "number") return `<c r="${ref}"${sAttr}><v>${lit}</v></c>`;
  if (typeof lit === "boolean") return `<c r="${ref}"${sAttr} t="b"><v>${lit ? 1 : 0}</v></c>`;
  if (lit && typeof lit === "object" && "date" in lit) return `<c r="${ref}"${sAttr}><v>${lit.date}</v></c>`;
  return `<c r="${ref}"${sAttr} t="inlineStr"><is><t xml:space="preserve">${esc(raw)}</t></is></c>`;
}

function sheetXml(sheet, si, evaluator, styles, sheetNames) {
  const rows = new Map();
  let maxRow = 0;
  let maxCol = 0;
  for (const [key, cell] of Object.entries(sheet.cells)) {
    const p = parseAddr(key);
    if (!p) continue;
    if (!rows.has(p.row)) rows.set(p.row, []);
    rows.get(p.row).push({ col: p.col, key, cell });
    maxRow = Math.max(maxRow, p.row);
    maxCol = Math.max(maxCol, p.col);
  }
  const body = [...rows.keys()].sort((a, b) => a - b).map((r) => {
    const cells = rows.get(r).sort((a, b) => a.col - b.col)
      .map(({ key, cell }) => cellXml(key, cell, evaluator ? evaluator.value(si, key) : null, styles, sheetNames))
      .join("");
    return cells ? `<row r="${r + 1}">${cells}</row>` : "";
  }).join("");

  const cols = Object.entries(sheet.colW || {})
    .map(([name, px]) => ({ i: [...name].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0), px }))
    .sort((a, b) => a.i - b.i)
    .map(({ i, px }) => `<col min="${i}" max="${i}" width="${Math.max(1, Math.round(((px - 5) / 7) * 100) / 100)}" customWidth="1"/>`)
    .join("");
  const dim = rows.size ? `A1:${addr(maxCol, maxRow)}` : "A1";
  const pane = sheet.freeze ? '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/>' : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><dimension ref="${dim}"/><sheetViews><sheetView workbookViewId="0"${si === 0 ? ' tabSelected="1"' : ""}>${pane}</sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/>${cols ? `<cols>${cols}</cols>` : ""}<sheetData>${body}</sheetData><pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/></worksheet>`;
}

/** Çalışma kitabını .xlsx baytlarına çevirir. */
export function workbookToXlsx(book, evaluator, { title = "Tablo", author = "Elitlig" } = {}) {
  const styles = new StyleBook();
  const names = excelSheetNames(book.sheets);
  const nameMap = new Map(book.sheets.map((s, i) => [s.name.toLocaleLowerCase("tr-TR"), names[i]]));
  const sheetFiles = book.sheets.map((sheet, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(sheet, i, evaluator, styles, nameMap) }));
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

  const files = [
    {
      name: "[Content_Types].xml",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${book.sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`,
    },
    {
      name: "_rels/.rels",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`,
    },
    {
      name: "docProps/core.xml",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(title)}</dc:title><dc:creator>${esc(author)}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`,
    },
    {
      name: "docProps/app.xml",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Elitlig Tablolar</Application></Properties>`,
    },
    {
      name: "xl/workbook.xml",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>${names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`,
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${book.sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${book.sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    },
    ...sheetFiles,
  ];
  // styles.xml en son: hücreler yazılırken biçimler toplanır.
  files.push({ name: "xl/styles.xml", data: styles.xml() });
  return zipStore(files);
}

export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
