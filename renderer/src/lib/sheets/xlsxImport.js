// Tablolar: .xlsx (Excel) içe aktarım — dış kütüphane olmadan.
//
// ZIP arşivi tarayıcının DecompressionStream("deflate-raw") özelliğiyle açılır,
// XML parçaları DOMParser ile okunur. Aktarılanlar:
//   • Tüm sayfalar (en çok 20), değerler, ortak metinler, satır içi metinler
//   • Formüller: Excel söz dizimi uygulamanınkine çevrilir (SUM → TOPLA,
//     "," → ";", 2.5 → 2,5, TRUE → DOĞRU); paylaşılan formüller açılır,
//     tam sütun başvuruları (A:A) aralığa dönüştürülür
//   • Biçimler: kalın/italik/altı çizili/üstü çizili, yazı tipi ve boyutu, yazı
//     ve dolgu rengi (tema renkleri dahil), yatay/dikey hizalama, kaydırma,
//     döndürme, girinti, kenarlıklar, sayı/para/yüzde/tarih/saat biçimleri
//   • Birleştirilmiş hücreler, sütun genişlikleri, satır yükseklikleri, gizli
//     satır/sütunlar, dondurulmuş bölmeler, otomatik süzgeç, koşullu
//     biçimlendirme (temel kurallar, renk ölçeği, veri çubuğu), açılır liste
// Grafikler, resimler ve makrolar aktarılmaz.
import { FUNCTIONS, colName, parseAddr, parseLiteral, shiftFormula, tokenize } from "./sheetEngine";
import { MAX_COLS, MAX_ROWS } from "./sheetOps";
import { parseRange, rangeText } from "./sheetModel";

export const IMPORT_LIMITS = { sheets: 20, rows: MAX_ROWS, cols: MAX_COLS, cells: 200000, cellText: 4000 };

export class XlsxImportError extends Error {}

/* ---------------------------------- ZIP ---------------------------------- */

async function inflateRaw(bytes) {
  if (typeof DecompressionStream === "undefined") {
    throw new XlsxImportError("Tarayıcınız sıkıştırılmış Excel dosyalarını açmayı desteklemiyor. Lütfen tarayıcınızı güncelleyin ya da dosyayı CSV olarak kaydedin.");
  }
  const ds = new DecompressionStream("deflate-raw");
  const writer = ds.writable.getWriter();
  const writing = writer.write(bytes).then(() => writer.close());
  const reader = ds.readable.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }
  await writing;
  const out = new Uint8Array(total);
  let pos = 0;
  for (const c of chunks) { out.set(c, pos); pos += c.length; }
  return out;
}

/** ZIP içindeki dosyaların dizini; read(name) içeriği (Uint8Array) döner. */
export function openZip(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new XlsxImportError("Dosya geçerli bir Excel (.xlsx) dosyası değil.");
  const count = view.getUint16(eocd + 10, true);
  let ptr = view.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  const entries = new Map();
  for (let i = 0; i < count; i += 1) {
    if (view.getUint32(ptr, true) !== 0x02014b50) throw new XlsxImportError("Excel dosyası bozuk görünüyor.");
    const method = view.getUint16(ptr + 10, true);
    const compSize = view.getUint32(ptr + 20, true);
    const nameLen = view.getUint16(ptr + 28, true);
    const extraLen = view.getUint16(ptr + 30, true);
    const commentLen = view.getUint16(ptr + 32, true);
    const localOffset = view.getUint32(ptr + 42, true);
    const name = dec.decode(bytes.subarray(ptr + 46, ptr + 46 + nameLen));
    entries.set(name, { method, compSize, localOffset });
    ptr += 46 + nameLen + extraLen + commentLen;
  }
  const read = async (name) => {
    const e = entries.get(name);
    if (!e) return null;
    const lNameLen = view.getUint16(e.localOffset + 26, true);
    const lExtraLen = view.getUint16(e.localOffset + 28, true);
    const start = e.localOffset + 30 + lNameLen + lExtraLen;
    const data = bytes.subarray(start, start + e.compSize);
    if (e.method === 0) return data;
    if (e.method === 8) return inflateRaw(data);
    throw new XlsxImportError("Dosyada desteklenmeyen sıkıştırma yöntemi var.");
  };
  return { names: [...entries.keys()], read };
}

/* ---------------------------------- XML ---------------------------------- */

const parseXml = (text) => new DOMParser().parseFromString(text, "application/xml");
// Ad alanından bağımsız eleman arama (Excel önekli/öneksiz yazabilir).
const kids = (node, tag) => (node ? [...node.childNodes].filter((n) => n.nodeType === 1 && n.localName === tag) : []);
const kid = (node, tag) => kids(node, tag)[0] || null;
const all = (node, tag) => (node ? [...node.getElementsByTagNameNS("*", tag)] : []);
const attr = (node, name) => (node ? node.getAttribute(name) : null);
const textOf = (node) => (node ? node.textContent : "");

async function readXml(zip, name) {
  const bytes = await zip.read(name);
  return bytes ? parseXml(new TextDecoder().decode(bytes)) : null;
}

const resolvePath = (base, target) => {
  if (target.startsWith("/")) return target.slice(1);
  const parts = base.split("/").slice(0, -1);
  for (const seg of target.split("/")) {
    if (seg === "..") parts.pop();
    else if (seg !== ".") parts.push(seg);
  }
  return parts.join("/");
};

async function relsOf(zip, partName) {
  const dir = partName.split("/").slice(0, -1).join("/");
  const file = partName.split("/").pop();
  const doc = await readXml(zip, `${dir ? `${dir}/` : ""}_rels/${file}.rels`);
  const map = new Map();
  for (const rel of all(doc, "Relationship")) map.set(attr(rel, "Id"), { target: resolvePath(partName, attr(rel, "Target")), type: attr(rel, "Type") || "" });
  return map;
}

/* --------------------------------- renkler --------------------------------- */

const THEME_ORDER = ["lt1", "dk1", "lt2", "dk2", "accent1", "accent2", "accent3", "accent4", "accent5", "accent6", "hlink", "folHlink"];
const INDEXED = { 8: "000000", 9: "FFFFFF", 10: "FF0000", 11: "00FF00", 12: "0000FF", 13: "FFFF00", 14: "FF00FF", 15: "00FFFF", 64: null };

function readTheme(doc) {
  const scheme = all(doc, "clrScheme")[0];
  if (!scheme) return [];
  const colors = {};
  for (const node of [...scheme.childNodes].filter((n) => n.nodeType === 1)) {
    const srgb = kid(node, "srgbClr");
    const sys = kid(node, "sysClr");
    colors[node.localName] = srgb ? attr(srgb, "val") : sys ? attr(sys, "lastClr") : null;
  }
  return THEME_ORDER.map((k) => colors[k] || null);
}

function applyTint(hex, tint) {
  if (!tint) return hex;
  const n = parseInt(hex, 16);
  let [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  let l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h /= 6;
  }
  l = tint < 0 ? l * (1 + tint) : l * (1 - tint) + tint;
  const hue = (p, q, t) => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  if (s === 0) r = g = b = l;
  else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue(p, q, h + 1 / 3); g = hue(p, q, h); b = hue(p, q, h - 1 / 3);
  }
  return [r, g, b].map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("");
}

function colorOf(node, theme) {
  if (!node) return null;
  let hex = null;
  if (attr(node, "rgb")) hex = attr(node, "rgb").slice(-6);
  else if (attr(node, "theme") != null) hex = theme[Number(attr(node, "theme"))] || null;
  else if (attr(node, "indexed") != null) hex = INDEXED[Number(attr(node, "indexed"))] || null;
  if (!hex || !/^[0-9a-f]{6}$/i.test(hex)) return null;
  return `#${applyTint(hex, Number(attr(node, "tint")) || 0).toLowerCase()}`;
}

/* ------------------------------ sayı biçimleri ------------------------------ */

const BUILTIN_FMT = { 0: "General", 1: "0", 2: "0.00", 3: "#,##0", 4: "#,##0.00", 9: "0%", 10: "0.00%", 11: "0.00E+00", 12: "# ?/?", 14: "dd.mm.yyyy", 15: "d-mmm-yy", 16: "d-mmm", 17: "mmm-yy", 18: "h:mm AM/PM", 19: "h:mm:ss AM/PM", 20: "h:mm", 21: "h:mm:ss", 22: "m/d/yy h:mm", 37: "#,##0 ;(#,##0)", 38: "#,##0 ;[Red](#,##0)", 39: "#,##0.00;(#,##0.00)", 40: "#,##0.00;[Red](#,##0.00)", 44: "_-* #,##0.00 ₺_-", 45: "mm:ss", 46: "[h]:mm:ss", 47: "mmss.0", 49: "@" };

/** Excel biçim kodunu uygulama biçimine çevirir: { f, d }. */
export function mapNumFmt(code) {
  if (!code || /^general$/i.test(code)) return {};
  const first = code.split(";")[0];
  const plain = first.replace(/"[^"]*"/g, "").replace(/\\./g, "").replace(/\[[^\]]*\]/g, "");
  const digits = (/\.(0+)/.exec(plain)?.[1] || "").length;
  if (first.trim() === "@") return { f: "text" };
  if (/₺|TL|TRY|\$|€|£|\[\$/.test(code)) return /#,##0|#\.##0/.test(plain) || !/0/.test(plain) ? { f: "money", d: digits } : { f: "money", d: digits, ng: true };
  if (/%/.test(plain)) return { f: "percent", d: digits };
  if (/E[+-]0/i.test(plain)) return { f: "sci", d: digits };
  const hasDate = /[dy]/i.test(plain) || /m{3,}/i.test(plain) || (/m/i.test(plain) && !/[hs]/i.test(plain));
  const hasTime = /[hs]/i.test(plain);
  if ((hasDate || hasTime) && !/[#0]/.test(plain.replace(/\.0+/g, ""))) {
    if (hasDate && hasTime) return { f: "datetime" };
    if (hasTime) return /s/i.test(plain) ? { f: "time", d: 1 } : { f: "time" };
    if (/m{4}/i.test(plain)) return { f: "dateLong" };
    return { f: "date" };
  }
  if (/#,##0|#\.##0/.test(plain)) return { f: "number", d: digits };
  if (/^0+(\.0+)?$/.test(plain.trim()) && digits) return { f: "number", d: digits, ng: true };
  if (/0/.test(plain)) return digits ? { d: digits } : {};
  return {};
}

/* ------------------------------- formül çevirisi ------------------------------- */

const EN_TO_TR = new Map(Object.entries(FUNCTIONS).map(([en, def]) => [en, def.tr]));

/** Excel formülünü (başında = olmadan) uygulama formülüne çevirir. */
export function fromExcelFormula(formula, { maxRow = MAX_ROWS, unknown = null } = {}) {
  let src = String(formula).trim().replace(/^=/, "");
  src = src.replace(/_xlfn\.|_xlws\.|_xludf\./gi, "");
  // Tam sütun (A:A) başvuruları motor tarafından doğrudan desteklenir; yalnız
  // üç harfli (AAA:AAA gibi) sütunlar sınırlı aralığa çevrilir.
  src = src.replace(/("(?:[^"]|"")*")|(^|[^A-Za-z0-9_$.])(\$?)([A-Za-z]{3})(?::)(\$?)([A-Za-z]{3})(?![A-Za-z0-9_(])/g,
    (m, str, pre, a1, c1, a2, c2) => (str || `${pre}${a1}${c1}1:${a2}${c2}${maxRow}`));
  // Kesişim / dizi sabitleri gibi desteklenmeyen yapılar olduğu gibi bırakılır.
  if (/[{}]/.test(src.replace(/"(?:[^"]|"")*"/g, ""))) return `=${src}`;
  let tokens;
  try {
    tokens = tokenize(src);
  } catch {
    return `=${src}`;
  }
  let out = "";
  tokens.forEach((tok, i) => {
    switch (tok.t) {
      // Ondalık nokta korunur: motor her durumda "2.5"i sayı olarak okur.
      case "num": out += String(tok.v); break;
      case "str": out += `"${tok.v.replace(/"/g, '""')}"`; break;
      case "ref": {
        if (tok.sheet) out += /^[A-Za-zÇĞİÖŞÜçğıöşü_][\wÇĞİÖŞÜçğıöşü]*$/.test(tok.sheet) ? `${tok.sheet}!` : `'${tok.sheet}'!`;
        out += tok.a.toUpperCase() + (tok.b ? `:${tok.b.toUpperCase()}` : "");
        break;
      }
      case "word": {
        const up = tok.v.toUpperCase();
        if (tokens[i + 1]?.t === "(") {
          const tr = EN_TO_TR.get(up);
          if (!tr && unknown) unknown.add(up);
          out += tr || up;
        }
        else if (up === "TRUE") out += "DOĞRU";
        else if (up === "FALSE") out += "YANLIŞ";
        else out += tok.v;
        break;
      }
      case ",": case ";": out += ";"; break;
      case "(": case ")": out += tok.t; break;
      default: out += tok.v;
    }
  });
  return `=${out}`;
}

/* --------------------------------- içe aktarım --------------------------------- */

const cleanSheetName = (name, used) => {
  const base = (name || "").replace(/[!'[\]*?/\\:]/g, "").trim().slice(0, 40) || `Sayfa${used.size + 1}`;
  let out = base;
  let n = 2;
  while (used.has(out.toLocaleLowerCase("tr-TR"))) { out = `${base.slice(0, 35)} (${n})`; n += 1; }
  used.add(out.toLocaleLowerCase("tr-TR"));
  return out;
};

const numberText = (n) => (Number.isInteger(n) || Math.abs(n) >= 1e-6 ? String(n).replace(".", ",") : String(n));

/**
 * .xlsx baytlarını uygulamanın çalışma kitabına çevirir.
 * Dönüş: { book, warnings: [metin] }
 */
export async function xlsxToWorkbook(buffer) {
  const zip = openZip(buffer);
  if (!zip.names.includes("xl/workbook.xml")) {
    const legacy = zip.names.length === 0;
    throw new XlsxImportError(legacy ? "Dosya okunamadı." : "Bu dosya bir Excel çalışma kitabı değil (xl/workbook.xml yok).");
  }
  const warnings = [];
  const workbook = await readXml(zip, "xl/workbook.xml");
  const wbRels = await relsOf(zip, "xl/workbook.xml");
  const date1904 = attr(all(workbook, "workbookPr")[0], "date1904") === "1" || attr(all(workbook, "workbookPr")[0], "date1904") === "true";

  // Ortak metinler
  const sst = [];
  const sstRel = [...wbRels.values()].find((r) => /sharedStrings$/.test(r.type));
  const sstDoc = await readXml(zip, sstRel?.target || "xl/sharedStrings.xml");
  for (const si of kids(sstDoc?.documentElement, "si")) {
    const t = kid(si, "t");
    sst.push(t ? textOf(t) : kids(si, "r").map((r) => textOf(kid(r, "t"))).join(""));
  }

  // Tema ve biçimler
  const themeRel = [...wbRels.values()].find((r) => /theme$/.test(r.type));
  const theme = readTheme(await readXml(zip, themeRel?.target || "xl/theme/theme1.xml"));
  const stylesRel = [...wbRels.values()].find((r) => /styles$/.test(r.type));
  const stylesDoc = await readXml(zip, stylesRel?.target || "xl/styles.xml");
  const numFmts = { ...BUILTIN_FMT };
  for (const nf of all(stylesDoc, "numFmt")) numFmts[Number(attr(nf, "numFmtId"))] = attr(nf, "formatCode");
  const fontNodes = kids(kid(stylesDoc?.documentElement, "fonts"), "font");
  const baseFont = { size: Number(attr(kid(fontNodes[0], "sz"), "val")) || 11, name: attr(kid(fontNodes[0], "name"), "val") || "Calibri" };
  const on = (n) => n && attr(n, "val") !== "0" && attr(n, "val") !== "false";
  const fonts = fontNodes.map((f) => {
    const s = {};
    if (on(kid(f, "b"))) s.b = true;
    if (on(kid(f, "i"))) s.i = true;
    const u = kid(f, "u");
    if (u && attr(u, "val") !== "none") s.u = true;
    if (on(kid(f, "strike"))) s.st = true;
    const c = colorOf(kid(f, "color"), theme);
    if (c && c !== "#000000") s.c = c;
    // Varsayılan yazı boyutu (genelde 11) uygulamanın varsayılanına (10) eşlenir; farklar korunur.
    const sz = Number(attr(kid(f, "sz"), "val"));
    if (sz && Math.abs(sz - baseFont.size) > 0.01) s.fs = Math.round((10 * sz / baseFont.size) * 2) / 2;
    const name = attr(kid(f, "name"), "val");
    if (name && name !== baseFont.name) s.ff = name;
    return s;
  });
  const borderStyle = (st) => (st === "medium" || st === "mediumDashed" || st === "mediumDashDot" ? "medium" : st === "thick" ? "thick" : st === "double" ? "double" : /dash/i.test(st || "") ? "dashed" : st === "dotted" || st === "hair" ? "dotted" : "thin");
  const borders = kids(kid(stylesDoc?.documentElement, "borders"), "border").map((b) => {
    const out = {};
    for (const [tag, k] of [["left", "l"], ["right", "r"], ["top", "t"], ["bottom", "b"]]) {
      const n = kid(b, tag);
      const st = attr(n, "style");
      if (!st || st === "none") continue;
      out[k] = { s: borderStyle(st), c: colorOf(kid(n, "color"), theme) || "#000000" };
    }
    return Object.keys(out).length ? out : null;
  });
  const fills = kids(kid(stylesDoc?.documentElement, "fills"), "fill").map((f) => {
    const p = kid(f, "patternFill");
    if (!p || attr(p, "patternType") !== "solid") return null;
    return colorOf(kid(p, "fgColor"), theme);
  });
  const xfStyles = kids(kid(stylesDoc?.documentElement, "cellXfs"), "xf").map((xf) => {
    const s = { ...(fonts[Number(attr(xf, "fontId")) || 0] || {}) };
    const bg = fills[Number(attr(xf, "fillId")) || 0];
    if (bg && bg !== "#ffffff") s.bg = bg;
    const alignNode = kid(xf, "alignment");
    const al = attr(alignNode, "horizontal");
    if (al === "left" || al === "center" || al === "right") s.al = al;
    else if (al === "centerContinuous") s.al = "center";
    const va = attr(alignNode, "vertical");
    if (va === "top") s.va = "top";
    else if (va === "center") s.va = "middle";
    if (attr(alignNode, "wrapText") === "1" || attr(alignNode, "wrapText") === "true") s.wr = true;
    const rot = Number(attr(alignNode, "textRotation"));
    if (rot === 255) s.rot = 90;
    else if (rot > 0 && rot <= 90) s.rot = rot;
    else if (rot > 90 && rot <= 180) s.rot = -(rot - 90);
    const ind = Number(attr(alignNode, "indent"));
    if (ind > 0) s.ind = Math.min(15, ind);
    const bd = borders[Number(attr(xf, "borderId")) || 0];
    if (bd) s.bd = bd;
    const fmt = mapNumFmt(numFmts[Number(attr(xf, "numFmtId")) || 0]);
    if (fmt.f) s.f = fmt.f;
    if (fmt.d != null && fmt.d !== (fmt.f === "money" || fmt.f === "number" || fmt.f === "sci" ? 2 : 0)) s.d = fmt.d;
    if (fmt.ng) s.ng = true;
    return s;
  });

  const dxfs = kids(kid(stylesDoc?.documentElement, "dxfs"), "dxf").map((d) => {
    const s = {};
    const f = kid(d, "font");
    if (on(kid(f, "b"))) s.b = true;
    if (on(kid(f, "i"))) s.i = true;
    const c = colorOf(kid(f, "color"), theme);
    if (c) s.c = c;
    const p = kid(kid(d, "fill"), "patternFill");
    const bg = colorOf(kid(p, "bgColor"), theme) || colorOf(kid(p, "fgColor"), theme);
    if (bg) s.bg = bg;
    return s;
  });

  const sheetNodes = all(workbook, "sheet").filter((s) => attr(s, "state") !== "veryHidden");
  if (sheetNodes.length > IMPORT_LIMITS.sheets) warnings.push(`Dosyada ${sheetNodes.length} sayfa var; ilk ${IMPORT_LIMITS.sheets} sayfa alındı.`);
  const usedNames = new Set();
  const renames = new Map();
  const sheets = [];
  let cellTotal = 0;
  let truncatedCells = false;
  let truncatedArea = false;
  let unsupported = 0;
  const unknownFns = new Set();

  for (const node of sheetNodes.slice(0, IMPORT_LIMITS.sheets)) {
    const original = attr(node, "name") || "";
    const name = cleanSheetName(original, usedNames);
    if (name !== original) renames.set(original, name);
    const rid = node.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id") || attr(node, "r:id");
    const target = wbRels.get(rid)?.target;
    // eslint-disable-next-line no-await-in-loop
    const doc = target ? await readXml(zip, target) : null;
    const root = doc?.documentElement;
    if (!root || root.localName !== "worksheet") { warnings.push(`"${original}" bir tablo sayfası değil (ör. grafik sayfası); atlandı.`); continue; }

    const cells = {};
    const shared = new Map();
    let maxRow = 0;
    let maxCol = 0;
    for (const row of kids(kid(root, "sheetData"), "row")) {
      for (const c of kids(row, "c")) {
        const ref = attr(c, "r");
        const pos = parseAddr(ref || "");
        if (!pos) continue;
        if (pos.row >= IMPORT_LIMITS.rows || pos.col >= IMPORT_LIMITS.cols) { truncatedArea = true; continue; }
        const t = attr(c, "t") || "n";
        const style = xfStyles[Number(attr(c, "s")) || 0] || {};
        const fNode = kid(c, "f");
        const vNode = kid(c, "v");
        let v = "";

        if (fNode) {
          let ftext = textOf(fNode);
          const si = attr(fNode, "si");
          if (attr(fNode, "t") === "shared" && si != null) {
            if (ftext) shared.set(si, { text: ftext, row: pos.row, col: pos.col });
            else if (shared.has(si)) {
              const m = shared.get(si);
              ftext = shiftFormula(`=${m.text}`, pos.row - m.row, pos.col - m.col).slice(1);
            }
          }
          if (ftext) {
            const before = unknownFns.size;
            v = fromExcelFormula(ftext, { unknown: unknownFns });
            if (unknownFns.size > before || /[{}]/.test(v)) unsupported += 1;
          }
        }
        if (!v) {
          const raw = textOf(vNode);
          if (t === "s") v = sst[Number(raw)] ?? "";
          else if (t === "inlineStr") v = all(c, "t").map(textOf).join("");
          else if (t === "str") v = raw;
          else if (t === "b") v = raw === "1" ? "DOĞRU" : "YANLIŞ";
          else if (t === "e") v = raw;
          else if (t === "d") {
            const d = new Date(raw);
            v = Number.isNaN(d.getTime()) ? raw : `${String(d.getUTCDate()).padStart(2, "0")}.${String(d.getUTCMonth() + 1).padStart(2, "0")}.${d.getUTCFullYear()}`;
          } else if (raw !== "") {
            let n = Number(raw);
            if (date1904 && style.f === "date") n += 1462;
            v = numberText(n);
          }
          // Sayıya benzeyen metin ("00123", "31.12") metin olarak kalsın.
          if ((t === "s" || t === "inlineStr" || t === "str") && v) {
            if (v.startsWith("=") || typeof parseLiteral(v) !== "string") v = `'${v}`;
          }
        }
        if (v.length > IMPORT_LIMITS.cellText) v = v.slice(0, IMPORT_LIMITS.cellText);
        const hasStyle = Object.keys(style).length > 0;
        if (!v && !hasStyle) continue;
        if (cellTotal >= IMPORT_LIMITS.cells) { truncatedCells = true; continue; }
        cellTotal += 1;
        cells[ref.toUpperCase()] = hasStyle ? { v, s: style } : { v };
        maxRow = Math.max(maxRow, pos.row);
        maxCol = Math.max(maxCol, pos.col);
      }
    }

    const colW = {};
    const hiddenCols = [];
    for (const col of kids(kid(root, "cols"), "col")) {
      const min = Number(attr(col, "min"));
      const max = Math.min(Number(attr(col, "max")), IMPORT_LIMITS.cols);
      if (max - min > 60) continue; // "tüm sütunlar" tanımları atlanır
      if (attr(col, "hidden") === "1" || attr(col, "hidden") === "true") { for (let i = min; i <= max; i += 1) hiddenCols.push(i - 1); continue; }
      const width = Number(attr(col, "width"));
      if (!width) continue;
      const px = Math.round(Math.min(1200, Math.max(8, width * 7 + 5)));
      for (let i = min; i <= max; i += 1) if (Math.abs(px - 104) > 6) colW[colName(i - 1)] = px;
    }
    // Satır yükseklikleri ve gizli satırlar
    const rowH = {};
    const hiddenRows = [];
    for (const row of kids(kid(root, "sheetData"), "row")) {
      const r = Number(attr(row, "r"));
      if (!r || r > IMPORT_LIMITS.rows) continue;
      if (attr(row, "hidden") === "1" || attr(row, "hidden") === "true") hiddenRows.push(r - 1);
      const ht = Number(attr(row, "ht"));
      if (ht && (attr(row, "customHeight") === "1" || attr(row, "customHeight") === "true")) {
        const px = Math.round(Math.min(800, Math.max(4, (ht * 4) / 3)));
        if (Math.abs(px - 20) > 1) rowH[r] = px;
      }
      maxRow = Math.max(maxRow, r - 1);
    }
    const pane = all(root, "pane")[0];
    const frozenPane = pane && /frozen/.test(attr(pane, "state") || "");
    const frozen = frozenPane ? { r: Math.max(0, Math.round(Number(attr(pane, "ySplit")) || 0)), c: Math.max(0, Math.round(Number(attr(pane, "xSplit")) || 0)) } : null;
    const merges = all(root, "mergeCell").map((m) => parseRange(attr(m, "ref"))).filter((m) => m && m.r2 < IMPORT_LIMITS.rows && m.c2 < IMPORT_LIMITS.cols).map(rangeText);
    for (const m of merges) { const rect = parseRange(m); maxRow = Math.max(maxRow, rect.r2); maxCol = Math.max(maxCol, rect.c2); }
    const view = all(root, "sheetView")[0];
    const noGrid = attr(view, "showGridLines") === "0" || attr(view, "showGridLines") === "false";
    const tab = colorOf(all(root, "tabColor")[0], theme);
    const af = parseRange(attr(all(root, "autoFilter")[0], "ref"));
    // Koşullu biçimlendirme
    const cf = [];
    const OPS = { greaterThan: "gt", lessThan: "lt", greaterThanOrEqual: "ge", lessThanOrEqual: "le", between: "between", equal: "eq", notEqual: "neq" };
    const unq = (t) => { const v = String(t ?? "").trim(); return /^".*"$/.test(v) ? v.slice(1, -1).replace(/""/g, '"') : v.replace(".", ","); };
    for (const node of kids(root, "conditionalFormatting")) {
      const ref = (attr(node, "sqref") || "").split(/\s+/)[0];
      if (!parseRange(ref)) continue;
      for (const rule of kids(node, "cfRule")) {
        const type = attr(rule, "type");
        const style = dxfs[Number(attr(rule, "dxfId"))] || {};
        const formulas = kids(rule, "formula").map(textOf);
        const id = `x${cf.length + 1}`;
        if (type === "cellIs" && OPS[attr(rule, "operator")]) cf.push({ id, ref, type: OPS[attr(rule, "operator")], a: unq(formulas[0]), ...(formulas[1] != null ? { b: unq(formulas[1]) } : {}), style });
        else if (type === "containsText" || type === "notContainsText" || type === "beginsWith" || type === "endsWith") cf.push({ id, ref, type: { containsText: "contains", notContainsText: "notContains", beginsWith: "begins", endsWith: "ends" }[type], a: attr(rule, "text") || "", style });
        else if (type === "duplicateValues" || type === "uniqueValues") cf.push({ id, ref, type: type === "duplicateValues" ? "dup" : "unique", style });
        else if (type === "containsBlanks" || type === "notContainsBlanks") cf.push({ id, ref, type: type === "containsBlanks" ? "blank" : "notBlank", style });
        else if (type === "top10") cf.push({ id, ref, type: attr(rule, "bottom") === "1" ? "bottom" : "top", a: attr(rule, "rank") || "10", style });
        else if (type === "aboveAverage") cf.push({ id, ref, type: attr(rule, "aboveAverage") === "0" ? "belowAvg" : "aboveAvg", style });
        else if (type === "colorScale") cf.push({ id, ref, type: "scale", colors: all(rule, "color").map((c) => colorOf(c, theme)).filter(Boolean) });
        else if (type === "dataBar") cf.push({ id, ref, type: "bar", colors: [colorOf(all(rule, "color")[0], theme) || "#638ec6"] });
      }
    }
    // Açılır liste doğrulaması
    const dv = [];
    for (const node of all(root, "dataValidation")) {
      if (attr(node, "type") !== "list") continue;
      const ref = (attr(node, "sqref") || "").split(/\s+/)[0];
      if (!parseRange(ref)) continue;
      const f1 = textOf(kid(node, "formula1")).trim();
      const strict = attr(node, "showErrorMessage") === "1" && (attr(node, "errorStyle") || "stop") === "stop";
      if (/^".*"$/.test(f1)) dv.push({ id: `v${dv.length + 1}`, ref, type: "list", list: f1.slice(1, -1).split(",").map((x) => x.trim()).filter(Boolean), strict });
      else if (f1) dv.push({ id: `v${dv.length + 1}`, ref, type: "list", source: `=${f1}`, strict });
    }

    sheets.push({
      name,
      rows: Math.min(IMPORT_LIMITS.rows, Math.max(100, maxRow + 21)),
      cols: Math.min(IMPORT_LIMITS.cols, Math.max(26, maxCol + 1)),
      cells,
      colW,
      ...(Object.keys(rowH).length ? { rowH } : {}),
      ...(merges.length ? { merges } : {}),
      ...(frozen && (frozen.r || frozen.c) ? { frozen, ...(frozen.r ? { freeze: true } : {}) } : {}),
      ...(hiddenRows.length ? { hiddenRows } : {}),
      ...(hiddenCols.length ? { hiddenCols } : {}),
      ...(af ? { filter: { ref: rangeText(af), crit: {} } } : {}),
      ...(cf.length ? { cf } : {}),
      ...(dv.length ? { dv } : {}),
      ...(noGrid ? { noGrid: true } : {}),
      ...(tab ? { tab } : {}),
    });
  }

  if (!sheets.length) throw new XlsxImportError("Dosyada aktarılabilecek bir tablo sayfası yok.");

  // Adı değişen sayfalara giden formül başvurularını güncelle.
  if (renames.size) {
    for (const sheet of sheets) {
      for (const cell of Object.values(sheet.cells)) {
        if (typeof cell.v !== "string" || !cell.v.startsWith("=")) continue;
        for (const [from, to] of renames) {
          const esc = from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          cell.v = cell.v.replace(new RegExp(`(?:'${esc.replace(/'/g, "''")}'|\\b${esc})!`, "g"), `${/^[\wÇĞİÖŞÜçğıöşü]+$/.test(to) ? to : `'${to}'`}!`);
        }
      }
    }
  }

  if (truncatedArea) warnings.push(`${IMPORT_LIMITS.rows} satır / ${IMPORT_LIMITS.cols} sütun (${colName(IMPORT_LIMITS.cols - 1)}) dışındaki hücreler alınmadı.`);
  if (truncatedCells) warnings.push(`Dolu hücre sınırı (${IMPORT_LIMITS.cells}) aşıldı; fazlası alınmadı.`);
  if (unknownFns.size) warnings.push(`Desteklenmeyen işlevler: ${[...unknownFns].slice(0, 8).join(", ")}${unknownFns.size > 8 ? "…" : ""}. Bu formüller korunur ama #AD? gösterir.`);
  else if (unsupported) warnings.push(`${unsupported} formül desteklenmeyen bir yapı (ör. dizi sabiti) içeriyor.`);
  return { book: { sheets }, warnings };
}

export const isXlsxFile = (file) => /\.xlsx$|\.xlsm$/i.test(file?.name || "") || file?.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
