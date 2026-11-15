// Tablolar: .xlsx (Office Open XML) dışa aktarım — dış kütüphane olmadan.
//
// Çalışma kitabı XML parçalarına yazılır ve sıkıştırmasız (STORE) bir ZIP
// arşivinde paketlenir; Excel, LibreOffice ve Google E-Tablolar açar.
//   • Formüller Excel söz dizimine çevrilir: Türkçe işlev adları İngilizceye,
//     ";" ayracı ",", ondalık virgül noktaya, DOĞRU/YANLIŞ → TRUE/FALSE.
//     Son hesaplanan değer de yazılır; Excel açılışta yeniden hesaplar.
//   • Biçimler: kalın/italik/altı çizili/üstü çizili, yazı tipi ve boyutu,
//     yazı ve dolgu rengi, yatay/dikey hizalama, kaydırma, döndürme, girinti,
//     kenarlıklar, sayı/para/yüzde/tarih/saat/bilimsel/metin biçimleri.
//   • Birleştirilmiş hücreler, sütun genişlikleri, satır yükseklikleri,
//     gizli satır/sütunlar, dondurulmuş bölmeler, otomatik süzgeç, koşullu
//     biçimlendirme, açılır liste doğrulaması, kılavuz çizgisi ve sekme rengi.
import { FUNCTIONS, addr, colIndex, isError, parseAddr, parseLiteral, tokenize } from "./sheetEngine";
import { DEF_H, getFrozen, parseRange, rangeText, styleAt } from "./sheetModel";

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
const XLFN = new Set(["CONCAT", "TEXTJOIN", "DAYS", "XLOOKUP", "IFS", "SWITCH", "IFNA", "MAXIFS", "MINIFS", "XOR"]);
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
  const grp = s.ng ? "0" : "#,##0";
  switch (s.f) {
    case "money": return `${grp}${dec(d ?? 2)} "₺"`;
    case "percent": return `0${dec(d ?? 0)}%`;
    case "number": return `${grp}${dec(d ?? 2)}`;
    case "date": return "dd.mm.yyyy";
    case "dateLong": return "d mmmm yyyy";
    case "time": return d > 0 ? "hh:mm:ss" : "hh:mm";
    case "datetime": return "dd.mm.yyyy hh:mm";
    case "sci": return `0${dec(d ?? 2)}E+00`;
    case "text": return "@";
    default: return d != null ? `0${dec(d)}` : null;
  }
};

const BORDER_XML = { thin: "thin", medium: "medium", thick: "thick", dashed: "dashed", dotted: "dotted", double: "double" };
const rotationXml = (rot) => (!rot ? 0 : rot > 0 ? Math.min(90, rot) : 90 + Math.min(90, -rot));

class StyleBook {
  constructor() {
    this.fonts = ["<font><sz val=\"10\"/><name val=\"Calibri\"/><family val=\"2\"/></font>"];
    this.fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'];
    this.borders = ["<border><left/><right/><top/><bottom/><diagonal/></border>"];
    this.numFmts = [];
    this.xfs = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'];
    this.dxfs = [];
    this.cache = new Map([["", 0]]);
    this.fontIdx = new Map();
    this.fillIdx = new Map();
    this.borderIdx = new Map();
    this.fmtIdx = new Map();
  }

  font(s) {
    const key = `${s.b ? 1 : 0}${s.i ? 1 : 0}${s.u ? 1 : 0}${s.st ? 1 : 0}|${s.c || ""}|${s.fs || ""}|${s.ff || ""}`;
    if (key === "0000|||") return 0;
    if (!this.fontIdx.has(key)) {
      this.fontIdx.set(key, this.fonts.length);
      this.fonts.push(`<font>${s.b ? "<b/>" : ""}${s.i ? "<i/>" : ""}${s.st ? "<strike/>" : ""}${s.u ? "<u/>" : ""}<sz val="${s.fs || 10}"/>${s.c ? `<color rgb="${argb(s.c)}"/>` : ""}<name val="${esc(s.ff || "Calibri")}"/><family val="2"/></font>`);
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

  border(bd) {
    if (!bd || !Object.keys(bd).length) return 0;
    const key = JSON.stringify(["l", "r", "t", "b"].map((k) => bd[k] ? [bd[k].s, bd[k].c] : null));
    if (!this.borderIdx.has(key)) {
      const side = (tag, b) => (b ? `<${tag} style="${BORDER_XML[b.s] || "thin"}"><color rgb="${argb(b.c || "#000000")}"/></${tag}>` : `<${tag}/>`);
      this.borderIdx.set(key, this.borders.length);
      this.borders.push(`<border>${side("left", bd.l)}${side("right", bd.r)}${side("top", bd.t)}${side("bottom", bd.b)}<diagonal/></border>`);
    }
    return this.borderIdx.get(key);
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
    const key = JSON.stringify([s.b, s.i, s.u, s.st, s.c, s.bg, s.al, s.va, s.wr, s.rot, s.ind, s.fs, s.ff, s.f, s.d, s.ng, s.bd, isDate]);
    if (this.cache.has(key)) return this.cache.get(key);
    const fontId = this.font(s);
    const fillId = this.fill(s.bg);
    const borderId = this.border(s.bd);
    const numFmtId = this.numFmt(s, isDate);
    const al = [];
    if (s.al) al.push(`horizontal="${s.al}"`);
    if (s.va) al.push(`vertical="${s.va === "middle" ? "center" : s.va}"`);
    if (s.wr) al.push('wrapText="1"');
    if (s.rot) al.push(`textRotation="${rotationXml(s.rot)}"`);
    if (s.ind) al.push(`indent="${s.ind}"`);
    const align = al.length ? `<alignment ${al.join(" ")}/>` : "";
    const attrs = [`numFmtId="${numFmtId}"`, `fontId="${fontId}"`, `fillId="${fillId}"`, `borderId="${borderId}"`, 'xfId="0"'];
    if (numFmtId) attrs.push('applyNumberFormat="1"');
    if (fontId) attrs.push('applyFont="1"');
    if (fillId) attrs.push('applyFill="1"');
    if (borderId) attrs.push('applyBorder="1"');
    if (align) attrs.push('applyAlignment="1"');
    const index = this.xfs.length;
    this.xfs.push(align ? `<xf ${attrs.join(" ")}>${align}</xf>` : `<xf ${attrs.join(" ")}/>`);
    this.cache.set(key, index);
    return index;
  }

  /** Koşullu biçim stili (dxf). */
  dxf(s = {}) {
    const font = s.b || s.i || s.c ? `<font>${s.b ? "<b/>" : ""}${s.i ? "<i/>" : ""}${s.c ? `<color rgb="${argb(s.c)}"/>` : ""}</font>` : "";
    const fill = s.bg ? `<fill><patternFill patternType="solid"><fgColor rgb="${argb(s.bg)}"/><bgColor rgb="${argb(s.bg)}"/></patternFill></fill>` : "";
    this.dxfs.push(`<dxf>${font}${fill}</dxf>`);
    return this.dxfs.length - 1;
  }

  xml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${this.numFmts.length ? `<numFmts count="${this.numFmts.length}">${this.numFmts.join("")}</numFmts>` : ""}<fonts count="${this.fonts.length}">${this.fonts.join("")}</fonts><fills count="${this.fills.length}">${this.fills.join("")}</fills><borders count="${this.borders.length}">${this.borders.join("")}</borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${this.xfs.length}">${this.xfs.join("")}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>${this.dxfs.length ? `<dxfs count="${this.dxfs.length}">${this.dxfs.join("")}</dxfs>` : '<dxfs count="0"/>'}</styleSheet>`;
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

function cellXml(ref, cell, value, styles, sheetNames, style = cell.s || {}) {
  const s = style;
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

const CF_OPS = { gt: "greaterThan", lt: "lessThan", ge: "greaterThanOrEqual", le: "lessThanOrEqual", between: "between", eq: "equal", neq: "notEqual" };
const cfValue = (v) => {
  const n = Number(String(v ?? "").replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) && String(v ?? "").trim() !== "" ? String(n) : `"${String(v ?? "").replace(/"/g, '""')}"`;
};

function cfXml(rules, styles) {
  let priority = 1;
  return rules.map((rule) => {
    const rect = parseRange(rule.ref);
    if (!rect) return "";
    const first = addr(rect.c1, rect.r1);
    const body = (() => {
      if (rule.type === "scale") {
        const cols = rule.colors?.length >= 2 ? rule.colors : ["#f8696b", "#ffeb84", "#63be7b"];
        const three = cols.length >= 3;
        return `<cfRule type="colorScale" priority="${priority}"><colorScale><cfvo type="min"/>${three ? '<cfvo type="percentile" val="50"/>' : ""}<cfvo type="max"/>${cols.slice(0, three ? 3 : 2).map((c) => `<color rgb="${argb(c)}"/>`).join("")}</colorScale></cfRule>`;
      }
      if (rule.type === "bar") return `<cfRule type="dataBar" priority="${priority}"><dataBar><cfvo type="min"/><cfvo type="max"/><color rgb="${argb(rule.colors?.[0] || "#638ec6")}"/></dataBar></cfRule>`;
      const dxf = styles.dxf(rule.style || {});
      const head = (type, extra = "") => `<cfRule type="${type}" dxfId="${dxf}" priority="${priority}"${extra}>`;
      if (CF_OPS[rule.type]) return `${head("cellIs", ` operator="${CF_OPS[rule.type]}"`)}<formula>${esc(cfValue(rule.a))}</formula>${rule.type === "between" ? `<formula>${esc(cfValue(rule.b))}</formula>` : ""}</cfRule>`;
      const text = String(rule.a ?? "").replace(/"/g, '""');
      if (rule.type === "contains") return `${head("containsText", ` operator="containsText" text="${esc(rule.a ?? "")}"`)}<formula>${esc(`NOT(ISERROR(SEARCH("${text}",${first})))`)}</formula></cfRule>`;
      if (rule.type === "notContains") return `${head("notContainsText", ` operator="notContains" text="${esc(rule.a ?? "")}"`)}<formula>${esc(`ISERROR(SEARCH("${text}",${first}))`)}</formula></cfRule>`;
      if (rule.type === "begins") return `${head("beginsWith", ` operator="beginsWith" text="${esc(rule.a ?? "")}"`)}<formula>${esc(`LEFT(${first},LEN("${text}"))="${text}"`)}</formula></cfRule>`;
      if (rule.type === "ends") return `${head("endsWith", ` operator="endsWith" text="${esc(rule.a ?? "")}"`)}<formula>${esc(`RIGHT(${first},LEN("${text}"))="${text}"`)}</formula></cfRule>`;
      if (rule.type === "blank") return `${head("containsBlanks")}<formula>${esc(`LEN(TRIM(${first}))=0`)}</formula></cfRule>`;
      if (rule.type === "notBlank") return `${head("notContainsBlanks")}<formula>${esc(`LEN(TRIM(${first}))>0`)}</formula></cfRule>`;
      if (rule.type === "dup") return `${head("duplicateValues")}</cfRule>`;
      if (rule.type === "unique") return `${head("uniqueValues")}</cfRule>`;
      if (rule.type === "top" || rule.type === "bottom") return `${head("top10", ` rank="${Math.max(1, Math.floor(Number(rule.a) || 10))}"${rule.type === "bottom" ? ' bottom="1"' : ""}`)}</cfRule>`;
      if (rule.type === "aboveAvg" || rule.type === "belowAvg") return `${head("aboveAverage", rule.type === "belowAvg" ? ' aboveAverage="0"' : "")}</cfRule>`;
      return "";
    })();
    if (!body) return "";
    priority += 1;
    return `<conditionalFormatting sqref="${rule.ref}">${body}</conditionalFormatting>`;
  }).join("");
}

function dvXml(rules) {
  const items = rules.map((rule) => {
    const formula = rule.source ? String(rule.source).replace(/^=/, "") : `"${(rule.list || []).join(",").replace(/"/g, '""').slice(0, 250)}"`;
    return `<dataValidation type="list" allowBlank="1" showInputMessage="1" showErrorMessage="${rule.strict ? 1 : 0}"${rule.strict ? "" : ' errorStyle="information"'} sqref="${rule.ref}"><formula1>${esc(formula)}</formula1></dataValidation>`;
  });
  return items.length ? `<dataValidations count="${items.length}">${items.join("")}</dataValidations>` : "";
}

const colLetters = (i) => addr(i, 0).replace(/\d+$/, "");
const absRef = (c, r) => `$${colLetters(c)}$${r + 1}`;

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
  const hiddenRows = new Set(sheet.hiddenRows || []);
  const hiddenCols = new Set(sheet.hiddenCols || []);
  const rowH = sheet.rowH || {};
  const rowStyle = sheet.rowStyle || {};
  // Yalnız boyu/gizliliği/biçimi olan boş satırlar da yazılır.
  const rowKeys = new Set(rows.keys());
  for (const k of Object.keys(rowH)) rowKeys.add(Number(k) - 1);
  for (const k of Object.keys(rowStyle)) rowKeys.add(Number(k) - 1);
  for (const r of hiddenRows) rowKeys.add(r);
  const body = [...rowKeys].filter((r) => r >= 0).sort((a, b) => a - b).map((r) => {
    const cells = (rows.get(r) || []).sort((a, b) => a.col - b.col)
      .map(({ key, cell, col }) => cellXml(key, cell, evaluator ? evaluator.value(si, key) : null, styles, sheetNames, styleAt(sheet, r, col)))
      .join("");
    const attrs = [`r="${r + 1}"`];
    const h = rowH[r + 1];
    if (h) attrs.push(`ht="${Math.round(h * 0.75 * 100) / 100}"`, 'customHeight="1"');
    if (hiddenRows.has(r)) attrs.push('hidden="1"');
    if (rowStyle[r + 1]) attrs.push(`s="${styles.xf(rowStyle[r + 1])}"`, 'customFormat="1"');
    return `<row ${attrs.join(" ")}>${cells}</row>`;
  }).join("");

  // Sütunlar: genişlik, gizlilik ve sütun biçimi.
  const colKeys = new Set([...Object.keys(sheet.colW || {}).map(colIndex), ...Object.keys(sheet.colStyle || {}).map(colIndex), ...hiddenCols]);
  const cols = [...colKeys].filter((i) => i >= 0).sort((a, b) => a - b).map((i) => {
    const name = colLetters(i);
    const px = sheet.colW?.[name] || 100;
    const st = sheet.colStyle?.[name];
    return `<col min="${i + 1}" max="${i + 1}" width="${Math.max(1, Math.round(((px - 5) / 7) * 100) / 100)}" customWidth="1"${hiddenCols.has(i) ? ' hidden="1"' : ""}${st ? ` style="${styles.xf(st)}"` : ""}/>`;
  }).join("");
  const dim = rows.size ? `A1:${addr(maxCol, maxRow)}` : "A1";

  const fz = getFrozen(sheet);
  let pane = "";
  if (fz.r || fz.c) {
    const top = addr(fz.c, fz.r);
    const active = fz.r && fz.c ? "bottomRight" : fz.r ? "bottomLeft" : "topRight";
    pane = `<pane${fz.c ? ` xSplit="${fz.c}"` : ""}${fz.r ? ` ySplit="${fz.r}"` : ""} topLeftCell="${top}" activePane="${active}" state="frozen"/><selection pane="${active}" activeCell="${top}" sqref="${top}"/>`;
  }
  const merges = (sheet.merges || []).filter((m) => parseRange(m));
  const filter = sheet.filter && parseRange(sheet.filter.ref) ? `<autoFilter ref="${rangeText(parseRange(sheet.filter.ref))}"/>` : "";
  const sheetPr = sheet.tab ? `<sheetPr><tabColor rgb="${argb(sheet.tab)}"/></sheetPr>` : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${sheetPr}<dimension ref="${dim}"/><sheetViews><sheetView workbookViewId="0"${sheet.noGrid ? ' showGridLines="0"' : ""}${si === 0 ? ' tabSelected="1"' : ""}>${pane}</sheetView></sheetViews><sheetFormatPr defaultRowHeight="${DEF_H * 0.75}" customHeight="1"/>${cols ? `<cols>${cols}</cols>` : ""}<sheetData>${body}</sheetData>${filter}${merges.length ? `<mergeCells count="${merges.length}">${merges.map((m) => `<mergeCell ref="${m}"/>`).join("")}</mergeCells>` : ""}${cfXml(sheet.cf || [], styles)}${dvXml(sheet.dv || [])}<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/></worksheet>`;
}

/** Süzgeç aralıkları Excel'in gizli _FilterDatabase adlarıyla tanımlanır. */
function definedNames(book, names) {
  const out = [];
  book.sheets.forEach((sheet, i) => {
    const rect = sheet.filter && parseRange(sheet.filter.ref);
    if (!rect) return;
    out.push(`<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">${esc(sheetRef(names[i]))}!${absRef(rect.c1, rect.r1)}:${absRef(rect.c2, rect.r2)}</definedName>`);
  });
  return out.length ? `<definedNames>${out.join("")}</definedNames>` : "";
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
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>${names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets>${definedNames(book, names)}<calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`,
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
