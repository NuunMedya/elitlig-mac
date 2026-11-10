// Ortak dışa aktarma: rapor → .docx (WordprocessingML), bağımlılıksız.
// BU DOSYA elitlig-mac ve elitlig-client depolarında AYNIDIR.
//
// Parçalar: document.xml (başlık, süzgeç satırı, özet kartları tablosu, bölüm
// başlıkları + tablolar / Markdown metni), styles.xml (Türkçe dil, Calibri, başlık
// stilleri), numbering.xml (madde / numaralı liste), header1.xml (koyu Elitlig
// şeridi, isteğe bağlı logo görseli), footer1.xml (tarih + "Sayfa X / Y" alanları).
// Word, LibreOffice ve Google Dokümanlar açar.
import { formatDateTimeTr, formatValue, isNumericType, mdBlocks, mdInline } from "./exportCore";
import { xmlEsc as esc, zipStore } from "./zip";

const W_NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';
const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

const BRAND = "5B21B6";
const BRAND_DARK = "3B0764";
const HEAD_FILL = "EDE9FE";
const GROUP_FILL = "F5F3FF";
const TOTAL_FILL = "FAF5FF";

/** Metin koşusu. opts: { b, i, strike, code, color, size (yarım punto), link } */
function run(text, o = {}) {
  const props = [
    o.code ? '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/>' : "",
    o.b ? "<w:b/>" : "", o.i ? "<w:i/>" : "", o.strike ? "<w:strike/>" : "",
    o.color ? `<w:color w:val="${o.color}"/>` : o.link ? '<w:color w:val="2563EB"/>' : "",
    o.size ? `<w:sz w:val="${o.size}"/><w:szCs w:val="${o.size}"/>` : "",
    o.link ? '<w:u w:val="single"/>' : "",
    o.code ? '<w:shd w:val="clear" w:color="auto" w:fill="F3F4F6"/>' : "",
  ].join("");
  const parts = String(text ?? "").split("\n");
  return parts.map((t, i) => `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ""}${i ? "<w:br/>" : ""}<w:t xml:space="preserve">${esc(t)}</w:t></w:r>`).join("");
}
const inlineRuns = (text, base = {}) => mdInline(text).map((r) => run(r.text, { ...base, b: base.b || r.b, i: base.i || r.i, strike: r.strike, code: r.code, link: r.link })).join("");

function para(content, o = {}) {
  const ppr = [
    o.style ? `<w:pStyle w:val="${o.style}"/>` : "",
    o.keepNext ? "<w:keepNext/>" : "",
    o.num ? `<w:numPr><w:ilvl w:val="${o.num.lvl || 0}"/><w:numId w:val="${o.num.id}"/></w:numPr>` : "",
    o.shd ? `<w:shd w:val="clear" w:color="auto" w:fill="${o.shd}"/>` : "",
    o.spacing ? `<w:spacing ${o.spacing}/>` : "",
    o.ind ? `<w:ind ${o.ind}/>` : "",
    o.align ? `<w:jc w:val="${o.align}"/>` : "",
  ].join("");
  return `<w:p>${ppr ? `<w:pPr>${ppr}</w:pPr>` : ""}${content}</w:p>`;
}

const cellXml = (content, { width, fill, align, bold, color, italic, header, noWrap } = {}) => `<w:tc><w:tcPr>${width ? `<w:tcW w:w="${width}" w:type="dxa"/>` : ""}${fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>` : ""}${noWrap ? "<w:noWrap/>" : ""}<w:vAlign w:val="${header ? "center" : "top"}"/></w:tcPr>${String(content).split("\n").map((line) => para(run(line, { b: bold, color, i: italic, size: header ? 17 : 18 }), { align, spacing: 'w:before="20" w:after="20"' })).join("")}</w:tc>`;

function tableXml(s, usable) {
  const cols = s.columns;
  // Genişlik: içerik uzunluğuna göre doğal genişlik; sayı / tarih sütunları önce tam
  // genişliğini alır (kaydırılmasın), kalan alan metin sütunlarına oranla dağıtılır.
  const tight = (c) => isNumericType(c.type) || c.type === "date" || c.type === "datetime";
  const longest = cols.map((c, i) => {
    let n = Math.max(...String(c.label).split(" ").map((w) => w.length), 4);
    for (const g of s.groups) for (const r of g.rows) n = Math.max(n, ...formatValue(r[i], c.type).split("\n").map((l) => l.length));
    if (s.totals) n = Math.max(n, formatValue(s.totals.values[i], c.type).length);
    return Math.min(n, c.type === "longtext" ? 60 : 36);
  });
  const natural = cols.map((c, i) => (c.width ? c.width * 15 : Math.max(620, longest[i] * 100 + 200)));
  const tightSum = cols.reduce((a, c, i) => a + (tight(c) ? natural[i] : 0), 0);
  const looseSum = cols.reduce((a, c, i) => a + (tight(c) ? 0 : natural[i]), 0) || 1;
  const room = usable - tightSum;
  const looseCount = cols.filter((c) => !tight(c)).length;
  let widths;
  if (tightSum + looseSum <= usable) widths = natural.map((w, i) => (tight(cols[i]) ? w : Math.floor(w + ((usable - tightSum - looseSum) * w) / looseSum)));
  else if (room >= looseCount * 620) widths = natural.map((w, i) => (tight(cols[i]) ? w : Math.max(620, Math.floor((room * w) / looseSum))));
  else { const total = tightSum + looseSum; widths = natural.map((w) => Math.max(450, Math.floor((usable * w) / total))); }
  const borders = '<w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="DDD6FE"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="DDD6FE"/><w:insideH w:val="single" w:sz="2" w:space="0" w:color="E5E7EB"/></w:tblBorders>';
  const rows = [];
  rows.push(`<w:tr><w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>${cols.map((c, i) => cellXml(c.label, { width: widths[i], fill: HEAD_FILL, bold: true, color: BRAND_DARK, align: isNumericType(c.type) ? "right" : "left", header: true })).join("")}</w:tr>`);
  for (const g of s.groups) {
    if (g.label && s.groups.length > 1) rows.push(`<w:tr><w:trPr><w:cantSplit/></w:trPr><w:tc><w:tcPr><w:gridSpan w:val="${cols.length}"/><w:shd w:val="clear" w:color="auto" w:fill="${GROUP_FILL}"/></w:tcPr>${para(run(`${g.label} (${g.rows.length})`, { b: true, color: "4C1D95", size: 18 }), { keepNext: true, spacing: 'w:before="20" w:after="20"' })}</w:tc></w:tr>`);
    for (const r of g.rows) rows.push(`<w:tr><w:trPr><w:cantSplit/></w:trPr>${r.map((v, i) => cellXml(formatValue(v, cols[i].type), { width: widths[i], align: isNumericType(cols[i].type) ? "right" : "left", noWrap: tight(cols[i]) })).join("")}</w:tr>`);
    if (g.subtotal && s.groups.length > 1) rows.push(`<w:tr>${cols.map((c, i) => cellXml(g.subtotal.labels[i] ? "Ara toplam" : c.total ? formatValue(g.subtotal.values[i], c.type) : "", { width: widths[i], italic: true, align: c.total ? "right" : "left" })).join("")}</w:tr>`);
  }
  if (!s.rowCount) rows.push(`<w:tr><w:tc><w:tcPr><w:gridSpan w:val="${cols.length}"/></w:tcPr>${para(run("Bu seçimde kayıt yok.", { i: true, color: "6B7280" }), { align: "center" })}</w:tc></w:tr>`);
  if (s.totals) rows.push(`<w:tr><w:trPr><w:cantSplit/></w:trPr>${cols.map((c, i) => cellXml(s.totals.labels[i] || (c.total ? formatValue(s.totals.values[i], c.type) : ""), { width: widths[i], fill: TOTAL_FILL, bold: true, align: c.total ? "right" : "left", noWrap: Boolean(c.total) })).join("")}</w:tr>`);
  return `<w:tbl><w:tblPr><w:tblW w:w="${usable}" w:type="dxa"/>${borders}<w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar><w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="1" w:noVBand="1"/></w:tblPr><w:tblGrid>${widths.map((w) => `<w:gridCol w:w="${w}"/>`).join("")}</w:tblGrid>${rows.join("")}</w:tbl>${para("", { spacing: 'w:after="60"' })}`;
}

function summaryXml(items, usable) {
  const perRow = Math.min(4, items.length);
  const w = Math.floor(usable / perRow);
  const rows = [];
  for (let i = 0; i < items.length; i += perRow) {
    const slice = items.slice(i, i + perRow);
    while (slice.length < perRow) slice.push(null);
    rows.push(`<w:tr><w:trPr><w:cantSplit/></w:trPr>${slice.map((c) => `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${c ? `<w:tcBorders><w:left w:val="single" w:sz="18" w:space="0" w:color="${c.tone === "green" ? "059669" : c.tone === "red" ? "DC2626" : c.tone === "amber" ? "D97706" : c.tone === "blue" ? "2563EB" : "7C3AED"}"/></w:tcBorders><w:shd w:val="clear" w:color="auto" w:fill="FAFAFA"/>` : ""}</w:tcPr>${c ? para(run(c.label.toLocaleUpperCase("tr-TR"), { size: 14, color: "6B7280" }), { spacing: 'w:before="40" w:after="0"' }) + para(run(formatValue(c.value, c.type), { b: true, size: 24 }), { spacing: 'w:after="0"' }) + (c.hint ? para(run(c.hint, { size: 14, color: "6B7280" }), { spacing: 'w:after="40"' }) : "") : para("")}</w:tc>`).join("")}</w:tr>`);
  }
  return `<w:tbl><w:tblPr><w:tblW w:w="${usable}" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblCellSpacing w:w="40" w:type="dxa"/><w:tblCellMar><w:left w:w="120" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${Array.from({ length: perRow }, () => `<w:gridCol w:w="${w}"/>`).join("")}</w:tblGrid>${rows.join("")}</w:tbl>${para("", { spacing: 'w:after="60"' })}`;
}

function textXml(text) {
  return mdBlocks(text).map((b) => {
    if (b.t === "h") return para(inlineRuns(b.text), { style: `Heading${Math.min(3, b.level + 1)}` });
    if (b.t === "li") {
      if (b.checked != null) return para(run(b.checked ? "☑ " : "☐ ") + inlineRuns(b.text, b.checked ? { color: "6B7280" } : {}), { ind: `w:left="${360 + b.depth * 360}" w:hanging="280"` });
      return para(inlineRuns(b.text), { style: "ListParagraph", num: { id: b.ordered ? 2 : 1, lvl: Math.min(2, b.depth) } });
    }
    if (b.t === "code") return para(run(b.text, { code: true, size: 18 }), { shd: "F3F4F6" });
    if (b.t === "quote") return para(inlineRuns(b.text, { i: true, color: "4B5563" }), { style: "Quote" });
    if (b.t === "hr") return '<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="DDD6FE"/></w:pBdr></w:pPr></w:p>';
    return para(inlineRuns(b.text));
  }).join("");
}

function kvXml(items, usable) {
  const a = Math.floor(usable * 0.32);
  const b = usable - a;
  return `<w:tbl><w:tblPr><w:tblW w:w="${usable}" w:type="dxa"/><w:tblBorders><w:insideH w:val="single" w:sz="2" w:space="0" w:color="E5E7EB"/><w:bottom w:val="single" w:sz="2" w:space="0" w:color="E5E7EB"/></w:tblBorders><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid><w:gridCol w:w="${a}"/><w:gridCol w:w="${b}"/></w:tblGrid>${items.map((it) => `<w:tr><w:trPr><w:cantSplit/></w:trPr>${cellXml(it.label, { width: a, fill: "F9FAFB", bold: true })}${cellXml(formatValue(it.value, it.type), { width: b })}</w:tr>`).join("")}</w:tbl>${para("", { spacing: 'w:after="60"' })}`;
}

/** PNG boyutları (IHDR). */
export function pngSize(bytes) {
  if (!bytes || bytes.length < 24 || bytes[0] !== 0x89 || bytes[1] !== 0x50) return null;
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: v.getUint32(16), height: v.getUint32(20) };
}

function drawing(rid, cx, cy, name = "Logo") {
  return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="1" name="${esc(name)}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="${esc(name)}.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
}

const STYLES = `${HEAD}<w:styles ${W_NS}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/><w:sz w:val="20"/><w:szCs w:val="20"/><w:lang w:val="tr-TR" w:eastAsia="tr-TR" w:bidi="ar-SA"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="80" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="40"/></w:pPr><w:rPr><w:b/><w:color w:val="${BRAND_DARK}"/><w:sz w:val="40"/><w:szCs w:val="40"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:rPr><w:color w:val="4B5563"/><w:sz w:val="19"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="80"/><w:pBdr><w:bottom w:val="single" w:sz="8" w:space="2" w:color="DDD6FE"/></w:pBdr><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:color w:val="${BRAND_DARK}"/><w:sz w:val="26"/><w:szCs w:val="26"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="180" w:after="60"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:color w:val="${BRAND}"/><w:sz w:val="23"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="120" w:after="40"/><w:outlineLvl w:val="2"/></w:pPr><w:rPr><w:b/><w:color w:val="374151"/><w:sz w:val="21"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="20"/><w:contextualSpacing/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:pBdr><w:left w:val="single" w:sz="18" w:space="6" w:color="C4B5FD"/></w:pBdr><w:ind w:left="200"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Header"><w:name w:val="header"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="0"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Footer"><w:name w:val="footer"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="0"/></w:pPr><w:rPr><w:color w:val="6B7280"/><w:sz w:val="15"/></w:rPr></w:style>
<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>
</w:styles>`;

const NUMBERING = `${HEAD}<w:numbering ${W_NS}>
<w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/>${["•", "◦", "▪"].map((ch, l) => `<w:lvl w:ilvl="${l}"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="${ch}"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${360 + l * 360}" w:hanging="260"/></w:pPr></w:lvl>`).join("")}</w:abstractNum>
<w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="hybridMultilevel"/>${["decimal", "lowerLetter", "lowerRoman"].map((f, l) => `<w:lvl w:ilvl="${l}"><w:start w:val="1"/><w:numFmt w:val="${f}"/><w:lvlText w:val="%${l + 1}."/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${360 + l * 360}" w:hanging="300"/></w:pPr></w:lvl>`).join("")}</w:abstractNum>
<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num></w:numbering>`;

/**
 * Hazırlanmış raporu .docx baytlarına çevirir.
 * opts: { logoPng: Uint8Array (beyaz/şeffaf PNG, koyu şerit üstünde) }
 */
export function reportToDocx(p, opts = {}) {
  const landscape = p.orientation === "landscape";
  const pageW = landscape ? 16838 : 11906;
  const pageH = landscape ? 11906 : 16838;
  const margin = 850;
  const usable = pageW - margin * 2;
  const body = [];
  body.push(para(run(p.title), { style: "Title" }));
  const sub = [p.subtitle, p.filterText, formatDateTimeTr(p.generatedAt), p.author].filter(Boolean).join(" · ");
  if (sub) body.push(para(run(sub), { style: "Subtitle" }));
  if (p.summary.length) body.push(summaryXml(p.summary, usable));
  for (const s of p.sections) {
    if (s.title) body.push(para(run(s.title) + (s.kind === "table" ? run(`  ${s.rowCount} kayıt`, { color: "6B7280", size: 17, b: false }) : ""), { style: "Heading1" }));
    if (s.kind === "text") body.push(textXml(s.text));
    else if (s.kind === "keyvalue") body.push(kvXml(s.items || [], usable));
    else body.push(tableXml(s, usable));
  }
  const logo = opts.logoPng instanceof Uint8Array ? opts.logoPng : null;
  const size = logo ? pngSize(logo) : null;
  const logoH = 300000; // EMU ≈ 0,83 cm
  const logoW = size ? Math.round((logoH * size.width) / size.height) : 0;
  const headerXml = `${HEAD}<w:hdr ${W_NS}>${para(
    (size ? `${drawing("rIdLogo", logoW, logoH)}${run("   ")}` : run(`${p.brand.toLocaleUpperCase("tr-TR")}   `, { b: true, color: "FFFFFF", size: 22 }))
      + run(p.title, { color: "FFFFFF", size: 17 }),
    { style: "Header", shd: BRAND, spacing: 'w:before="60" w:after="60"', ind: 'w:left="0"' },
  )}${para("", { style: "Header" })}</w:hdr>`;
  const footerXml = `${HEAD}<w:ftr ${W_NS}><w:p><w:pPr><w:pStyle w:val="Footer"/><w:tabs><w:tab w:val="right" w:pos="${usable}"/></w:tabs></w:pPr>${run(`${p.brand} · ${formatDateTimeTr(p.generatedAt)}`)}<w:r><w:tab/></w:r>${run("Sayfa ")}<w:fldSimple w:instr=" PAGE "><w:r><w:t>1</w:t></w:r></w:fldSimple>${run(" / ")}<w:fldSimple w:instr=" NUMPAGES "><w:r><w:t>1</w:t></w:r></w:fldSimple></w:p></w:ftr>`;
  const sect = `<w:sectPr><w:headerReference w:type="default" r:id="rIdHeader"/><w:footerReference w:type="default" r:id="rIdFooter"/><w:pgSz w:w="${pageW}" w:h="${pageH}"${landscape ? ' w:orient="landscape"' : ""}/><w:pgMar w:top="1000" w:right="${margin}" w:bottom="900" w:left="${margin}" w:header="400" w:footer="400" w:gutter="0"/><w:cols w:space="708"/></w:sectPr>`;
  const document = `${HEAD}<w:document ${W_NS}><w:body>${body.join("")}${sect}</w:body></w:document>`;
  const now = p.generatedAt.toISOString().replace(/\.\d{3}Z$/, "Z");
  const files = [
    { name: "[Content_Types].xml", data: `${HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>` },
    { name: "_rels/.rels", data: `${HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>` },
    { name: "docProps/core.xml", data: `${HEAD}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(p.title)}</dc:title><dc:creator>${esc(p.author || p.brand)}</dc:creator><dc:language>tr-TR</dc:language><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>` },
    { name: "docProps/app.xml", data: `${HEAD}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Elitlig</Application></Properties>` },
    { name: "word/document.xml", data: document },
    { name: "word/styles.xml", data: STYLES },
    { name: "word/numbering.xml", data: NUMBERING },
    { name: "word/settings.xml", data: `${HEAD}<w:settings ${W_NS}><w:defaultTabStop w:val="708"/><w:characterSpacingControl w:val="doNotCompress"/><w:themeFontLang w:val="tr-TR"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>` },
    { name: "word/header1.xml", data: headerXml },
    { name: "word/footer1.xml", data: footerXml },
    { name: "word/_rels/document.xml.rels", data: `${HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/><Relationship Id="rIdHeader" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/><Relationship Id="rIdFooter" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/></Relationships>` },
  ];
  if (size) {
    files.push({ name: "word/_rels/header1.xml.rels", data: `${HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdLogo" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/logo.png"/></Relationships>` });
    files.push({ name: "word/media/logo.png", data: logo });
  }
  return zipStore(files, p.generatedAt);
}
