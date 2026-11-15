// Yazdırma / PDF stüdyosu: görünüm (layout), tasarım (tema) ve sayfa seçenekleri.
// BU DOSYA elitlig-mac (renderer/src/lib/export) ve elitlig-client (src/features/export)
// depolarında AYNIDIR. React'e ya da platforma bağlı değildir (Node testleri de kullanır).
//
//   const d = normalizeDesign({ theme: "bw", layout: "cards", fontSize: "large" });
//   themeCss(d)            → yazdırma HTML'inin <style> içeriği (sayfa @page dahil)
//   themeTokens(d)         → renk / yazı belirteçleri (Word yazıcısı da kullanır)
//
// Tasarım nesnesi (design):
//   { layout, theme, accent, fontSize, density, zebra, pageSize, orientation, margins,
//     show: { header, logo, filters, summary, totals, pageNumbers, date, signatures },
//     footerNote, signatures: ["Hazırlayan", "Onaylayan"], title, subtitle, watermark }

export const LAYOUTS = [
  { key: "table", label: "Tablo", hint: "Klasik satır / sütun tablosu" },
  { key: "compact", label: "Kompakt tablo", hint: "Sık satırlar, küçük yazı — çok kayıt tek sayfada" },
  { key: "cards", label: "Kartlar", hint: "Her kayıt bir kart; ızgara düzeni" },
  { key: "list", label: "Liste / özet", hint: "Kayıt başına tek satırlık özet" },
  { key: "detail", label: "Ayrıntılı", hint: "Her kayıt ayrı blok, tüm alanlar alt alta" },
  { key: "grouped", label: "Gruplu", hint: "Seçilen sütuna göre gruplar ve ara toplamlar" },
];

export const THEMES = [
  { key: "corporate", label: "ELİTLİG Kurumsal", hint: "Marka renkleri, koyu başlık şeridi", accent: "#7c3aed", bw: false },
  { key: "modern", label: "Modern", hint: "Ferah, yuvarlak hatlar, vurgu çizgisi", accent: "#0f766e", bw: false },
  { key: "classic", label: "Klasik", hint: "Tırnaklı yazı, çift çizgi, resmi görünüm", accent: "#7f1d1d", bw: false },
  { key: "minimal", label: "Minimal", hint: "İnce çizgiler, bol beyaz alan", accent: "#111827", bw: false },
  { key: "vivid", label: "Canlı", hint: "Renkli başlık satırı ve kartlar — sunum için", accent: "#2563eb", bw: false },
  { key: "bw", label: "Siyah-Beyaz", hint: "Saf siyah, dolgu yok, yüksek kontrast — S/B yazıcı", accent: "#000000", bw: true },
  { key: "draft", label: "Mürekkep tasarrufu", hint: "Taslak: açık gri, ince çizgi, logo yok", accent: "#555555", bw: true },
];

export const FONT_SIZES = [
  { key: "small", label: "Küçük", pt: 8.3 },
  { key: "normal", label: "Normal", pt: 9.5 },
  { key: "large", label: "Büyük", pt: 11 },
];
export const DENSITIES = [
  { key: "tight", label: "Sık", pad: [2, 5], line: 1.25 },
  { key: "normal", label: "Normal", pad: [4, 6], line: 1.4 },
  { key: "airy", label: "Ferah", pad: [7, 8], line: 1.5 },
];
// mm cinsinden (genişlik × yükseklik, dikey)
export const PAGE_SIZES = [
  { key: "A4", label: "A4", w: 210, h: 297 },
  { key: "A3", label: "A3", w: 297, h: 420 },
  { key: "A5", label: "A5", w: 148, h: 210 },
  { key: "Letter", label: "Letter", w: 215.9, h: 279.4 },
  { key: "Legal", label: "Legal", w: 215.9, h: 355.6 },
];
// üst, sağ, alt, sol (mm)
export const MARGINS = [
  { key: "narrow", label: "Dar", mm: [8, 7, 11, 7] },
  { key: "normal", label: "Normal", mm: [13, 11, 15, 11] },
  { key: "wide", label: "Geniş", mm: [20, 18, 22, 18] },
];
export const ACCENTS = ["#7c3aed", "#c026d3", "#2563eb", "#0f766e", "#16a34a", "#d97706", "#dc2626", "#7f1d1d", "#111827"];

export const SHOW_KEYS = [
  { key: "header", label: "Başlık şeridi" },
  { key: "logo", label: "Logo" },
  { key: "filters", label: "Süzgeç özeti" },
  { key: "summary", label: "Özet kartları" },
  { key: "totals", label: "Toplamlar" },
  { key: "pageNumbers", label: "Sayfa numarası" },
  { key: "date", label: "Tarih / saat" },
  { key: "signatures", label: "İmza satırları" },
];

export const DEFAULT_DESIGN = Object.freeze({
  layout: "table",
  theme: "corporate",
  accent: "",
  fontSize: "normal",
  density: "normal",
  zebra: false,
  pageSize: "A4",
  orientation: "auto",
  margins: "normal",
  show: { header: true, logo: true, filters: true, summary: true, totals: true, pageNumbers: true, date: true, signatures: false },
  footerNote: "",
  signatures: ["Hazırlayan", "Onaylayan"],
  watermark: "",
  title: "",
  subtitle: "",
});

const pick = (list, key, fallback) => (list.some((x) => x.key === key) ? key : fallback);
const HEX = /^#[0-9a-f]{6}$/i;

/** Eksik / geçersiz alanları varsayılanla doldurur (kayıtlı tercihler eski olabilir). */
export function normalizeDesign(d = {}) {
  const src = d || {};
  return {
    layout: pick(LAYOUTS, src.layout, DEFAULT_DESIGN.layout),
    theme: pick(THEMES, src.theme, DEFAULT_DESIGN.theme),
    accent: HEX.test(String(src.accent || "")) ? String(src.accent).toLowerCase() : "",
    fontSize: pick(FONT_SIZES, src.fontSize, "normal"),
    density: pick(DENSITIES, src.density, "normal"),
    zebra: Boolean(src.zebra),
    pageSize: pick(PAGE_SIZES, src.pageSize, "A4"),
    orientation: ["portrait", "landscape"].includes(src.orientation) ? src.orientation : "auto",
    margins: pick(MARGINS, src.margins, "normal"),
    show: { ...DEFAULT_DESIGN.show, ...(src.show && typeof src.show === "object" ? src.show : {}) },
    footerNote: String(src.footerNote ?? "").slice(0, 300),
    signatures: Array.isArray(src.signatures) ? src.signatures.map((s) => String(s ?? "").slice(0, 60)).slice(0, 4) : [...DEFAULT_DESIGN.signatures],
    watermark: String(src.watermark ?? "").slice(0, 40),
    title: String(src.title ?? ""),
    subtitle: String(src.subtitle ?? ""),
  };
}

export const themeInfo = (key) => THEMES.find((t) => t.key === key) || THEMES[0];
export const layoutInfo = (key) => LAYOUTS.find((t) => t.key === key) || LAYOUTS[0];
export const pageInfo = (key) => PAGE_SIZES.find((p) => p.key === key) || PAGE_SIZES[0];
export const marginInfo = (key) => MARGINS.find((p) => p.key === key) || MARGINS[1];

/** Sayfa ölçüleri (mm), yön uygulanmış. */
export function pageBox(design, orientation = "portrait") {
  const p = pageInfo(design.pageSize);
  const land = orientation === "landscape";
  const [t, r, b, l] = marginInfo(design.margins).mm;
  return { w: land ? p.h : p.w, h: land ? p.w : p.h, margin: { t, r, b, l }, key: p.key, landscape: land };
}

/* ---------------------------------- renkler ---------------------------------- */

const toRgb = (hex) => { const h = String(hex).replace("#", ""); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) || 0); };
const toHex = (rgb) => `#${rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("")}`;
/** a ile b'yi t oranında karıştırır (t=0 → a). */
export const mix = (a, b, t) => { const x = toRgb(a); const y = toRgb(b); return toHex(x.map((v, i) => v + (y[i] - v) * t)); };
/** Göreli parlaklık (WCAG). */
export function luminance(hex) {
  const c = toRgb(hex).map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
/** Vurgu rengi üstünde okunur yazı rengi. */
export const inkOn = (hex) => (luminance(hex) > 0.45 ? "#111111" : "#ffffff");

const SANS = '-apple-system,"Segoe UI",Inter,Helvetica,Arial,"DejaVu Sans",sans-serif';
const SERIF = 'Georgia,"Times New Roman",Cambria,"DejaVu Serif",serif';
const NONE = "none";

/**
 * Tema belirteçleri. Her değer doğrudan CSS'e yazılır (CSS değişkeni yok); böylece
 * Siyah-Beyaz temasında hiçbir dolgu olmadığı testle doğrulanabilir.
 */
export function themeTokens(design) {
  const d = normalizeDesign(design);
  const t = themeInfo(d.theme);
  const ac = t.bw ? t.accent : d.accent || t.accent;
  const dark = mix(ac, "#000000", 0.45);
  const soft = mix(ac, "#ffffff", 0.86);
  const tint = mix(ac, "#ffffff", 0.94);
  const base = {
    key: t.key, bw: t.bw, font: SANS, headFont: SANS, ink: "#111827", muted: "#6b7280", line: "#e5e7eb", ac, dark, soft, tint,
    stripBg: NONE, stripInk: "#111827", stripBorder: NONE, stripRadius: 0, stripPad: "0 0 8px", stripAlign: "left",
    logoFilter: "invert(1) brightness(0.15)", logo: true,
    h1Size: 1.6, h1Weight: 800, h1Transform: NONE, h1Spacing: "0",
    h2Ink: dark, h2Border: `1.5px solid ${soft}`, h2Transform: NONE, h2Size: 1.2,
    headBg: soft, headInk: dark, headTransform: "uppercase", headBorder: `1px solid ${soft}`, headSize: 0.84, headWeight: 700,
    cellBorder: `1px solid #e5e7eb`, outer: NONE, vline: NONE,
    zebraBg: "#f8f8fb", zebraRule: NONE,
    grpBg: tint, grpInk: dark, grpBorder: `1px solid ${soft}`,
    subBg: "#fafafa", totBg: tint, totBorder: `2px solid ${ac}`,
    cardBg: "#ffffff", cardBorder: `1px solid #e5e7eb`, cardAccent: `3px solid ${ac}`, cardRadius: 8, cardLabelInk: "#6b7280",
    recBg: "#ffffff", recBorder: "1px solid #e5e7eb", recHeadBg: tint, recHeadInk: dark,
    pos: "#047857", neg: "#b91c1c", tones: { green: "#059669", red: "#dc2626", amber: "#d97706", blue: "#2563eb" },
    footInk: "#6b7280", watermarkInk: mix(ac, "#ffffff", 0.82), codeBg: "#f3f4f6",
  };
  switch (t.key) {
    case "corporate":
      return { ...base, stripBg: `linear-gradient(100deg,${mix(ac, "#000000", 0.55)} 0%,${ac} 60%,${mix(ac, "#c026d3", ac === "#7c3aed" ? 1 : 0.35)} 100%)`, stripInk: "#ffffff", stripRadius: 10, stripPad: "12px 16px", logoFilter: NONE };
    case "modern":
      return { ...base, h1Size: 1.9, h1Weight: 750, stripBorder: `6px solid ${ac}`, stripPad: "2px 0 6px 14px", h2Border: NONE, h2Ink: ac, headBg: "#f3f4f6", headInk: "#111827", headBorder: `2px solid ${ac}`, cellBorder: "1px solid #eef0f3", cardRadius: 12, cardAccent: `4px solid ${ac}`, grpBg: "#f3f4f6", grpInk: "#111827", totBorder: `2px solid #111827`, totBg: "#f9fafb", recHeadBg: "#f3f4f6", recHeadInk: ac, zebraBg: "#f6f7f9" };
    case "classic":
      return { ...base, font: SERIF, headFont: SERIF, ink: "#1c1917", muted: "#57534e", line: "#a8a29e", stripAlign: "center", stripBorder: NONE, stripPad: "0 0 6px", h1Weight: 700, h1Transform: "uppercase", h1Spacing: "1.5px", h1Size: 1.5, h2Ink: ac, h2Border: `3px double ${ac}`, h2Transform: "uppercase", h2Size: 1.08, headBg: "#f5f1e8", headInk: "#1c1917", headTransform: NONE, headSize: 0.95, headBorder: "1px solid #57534e", cellBorder: "0.6px solid #a8a29e", outer: "1px solid #57534e", vline: "0.6px solid #d6d3d1", grpBg: "#faf7f0", grpInk: ac, grpBorder: "1px solid #a8a29e", totBorder: "3px double #1c1917", totBg: "#f5f1e8", cardRadius: 2, cardAccent: `1px solid #a8a29e`, cardBorder: "1px solid #a8a29e", recHeadBg: "#f5f1e8", recHeadInk: ac, zebraBg: "#faf7f0" };
    case "minimal":
      return { ...base, ink: "#1f2937", muted: "#9ca3af", line: "#eceef1", h1Weight: 300, h1Size: 2, h2Ink: "#111827", h2Border: NONE, h2Size: 1.05, h2Transform: "uppercase", headBg: NONE, headInk: "#9ca3af", headBorder: "1px solid #111827", headWeight: 600, cellBorder: "0.5px solid #eceef1", grpBg: NONE, grpInk: "#111827", grpBorder: "0.5px solid #111827", subBg: NONE, totBg: NONE, totBorder: "1px solid #111827", cardAccent: "1px solid #eceef1", cardRadius: 0, recBorder: "0.5px solid #eceef1", recHeadBg: NONE, recHeadInk: "#111827", zebraBg: "#fafafa" };
    case "vivid":
      return { ...base, stripBg: ac, stripInk: inkOn(ac), stripRadius: 0, stripPad: "14px 16px", logoFilter: inkOn(ac) === "#ffffff" ? NONE : "invert(1) brightness(0.15)", headBg: ac, headInk: inkOn(ac), headBorder: `1px solid ${ac}`, h2Ink: ac, h2Border: `3px solid ${ac}`, grpBg: soft, grpInk: dark, totBg: soft, totBorder: `2px solid ${dark}`, cardBg: tint, cardBorder: `1px solid ${soft}`, cardAccent: `5px solid ${ac}`, recHeadBg: ac, recHeadInk: inkOn(ac), zebraBg: tint };
    case "bw":
      return {
        ...base, ink: "#000000", muted: "#000000", line: "#000000", ac: "#000000", dark: "#000000", soft: "#000000", tint: "#ffffff",
        stripBg: NONE, stripInk: "#000000", stripBorder: NONE, stripPad: "4px 0 6px", logoFilter: "grayscale(1) invert(1) brightness(0)",
        h2Ink: "#000000", h2Border: "1.5px solid #000000", h2Transform: "uppercase",
        headBg: NONE, headInk: "#000000", headBorder: "1.5px solid #000000", cellBorder: "0.5px solid #000000", outer: "1px solid #000000",
        zebraBg: NONE, zebraRule: "0.8px dotted #000000",
        grpBg: NONE, grpInk: "#000000", grpBorder: "1px solid #000000", subBg: NONE, totBg: NONE, totBorder: "3px double #000000",
        cardBg: NONE, cardBorder: "1px solid #000000", cardAccent: "3px solid #000000", cardLabelInk: "#000000",
        recBg: NONE, recBorder: "1px solid #000000", recHeadBg: NONE, recHeadInk: "#000000",
        pos: "#000000", neg: "#000000", tones: { green: "#000000", red: "#000000", amber: "#000000", blue: "#000000" },
        footInk: "#000000", watermarkInk: "#bbbbbb", codeBg: NONE,
      };
    case "draft":
      return {
        ...base, ink: "#3f3f3f", muted: "#8a8a8a", line: "#c8c8c8", ac: "#555555", dark: "#3f3f3f", soft: "#c8c8c8", tint: "#ffffff",
        logo: false, stripBg: NONE, stripInk: "#3f3f3f", stripPad: "0 0 4px", h1Size: 1.3, h1Weight: 600,
        h2Ink: "#3f3f3f", h2Border: "0.5px solid #c8c8c8", h2Size: 1.05,
        headBg: NONE, headInk: "#555555", headBorder: "0.5px solid #8a8a8a", headWeight: 600, cellBorder: "0.4px solid #d4d4d4",
        zebraBg: NONE, zebraRule: "0.5px dashed #bdbdbd",
        grpBg: NONE, grpInk: "#3f3f3f", grpBorder: "0.5px solid #8a8a8a", subBg: NONE, totBg: NONE, totBorder: "1px solid #8a8a8a",
        cardBg: NONE, cardBorder: "0.5px solid #c8c8c8", cardAccent: "0.5px solid #c8c8c8", cardRadius: 0, cardLabelInk: "#8a8a8a",
        recBg: NONE, recBorder: "0.5px dashed #bdbdbd", recHeadBg: NONE, recHeadInk: "#3f3f3f",
        pos: "#3f3f3f", neg: "#3f3f3f", tones: { green: "#8a8a8a", red: "#8a8a8a", amber: "#8a8a8a", blue: "#8a8a8a" },
        footInk: "#8a8a8a", watermarkInk: "#dddddd", codeBg: NONE,
      };
    default:
      return base;
  }
}

const cssStr = (s) => `"${String(s ?? "").replace(/["\\]/g, "\\$&").replace(/\n/g, " ")}"`;

/**
 * Yazdırma CSS'i. foot: { left, center, right } alt bilgi metinleri (sayfa kenar kutuları).
 * Ölçüler pt / mm; ekranda önizleme aynı CSS'i kullanır (.xd kökü altında).
 */
export function themeCss(design, { orientation = "portrait", foot = {} } = {}) {
  const d = normalizeDesign(design);
  const k = themeTokens(d);
  const box = pageBox(d, orientation);
  const fs = (FONT_SIZES.find((f) => f.key === d.fontSize) || FONT_SIZES[1]).pt;
  const den = DENSITIES.find((x) => x.key === d.density) || DENSITIES[1];
  const [py, px] = den.pad;
  const footFont = `7.5pt ${k.font}`;
  const pageNo = d.show.pageNumbers ? `@bottom-right{content:"Sayfa " counter(page) " / " counter(pages);font:${footFont};color:${k.footInk}}` : "";
  const left = foot.left ? `@bottom-left{content:${cssStr(foot.left)};font:${footFont};color:${k.footInk}}` : "";
  const center = foot.center ? `@bottom-center{content:${cssStr(foot.center)};font:${footFont};color:${k.footInk}}` : "";
  const zebra = d.zebra
    ? (k.zebraBg !== NONE ? `.xd .xd-t tbody tr.r:nth-of-type(even) td{background:${k.zebraBg}}` : "")
      + (k.zebraRule !== NONE ? `.xd .xd-t tbody tr.r:nth-of-type(even) td{border-bottom:${k.zebraRule}}.xd .xd-t tbody tr.r:nth-of-type(odd) td{border-bottom:${k.cellBorder}}` : "")
      + (k.zebraBg !== NONE ? `.xd .xd-list li:nth-child(even){background:${k.zebraBg}}` : `.xd .xd-list li:nth-child(even){border-bottom:${k.zebraRule}}`)
    : "";
  const bg = (v) => (v === NONE ? "background:none" : `background:${v}`);
  return `@page{size:${box.key} ${box.landscape ? "landscape" : "portrait"};margin:${box.margin.t}mm ${box.margin.r}mm ${box.margin.b}mm ${box.margin.l}mm;${left}${center}${pageNo}}
*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
html,body{margin:0;padding:0;background:#fff}
.xd{font:${fs}pt/${den.line} ${k.font};color:${k.ink};position:relative}
.xd h1,.xd h2,.xd h3{font-family:${k.headFont}}
.xd .strip{display:flex;align-items:center;gap:12px;padding:${k.stripPad};border-radius:${k.stripRadius}px;color:${k.stripInk};${bg(k.stripBg)};${k.stripBorder !== NONE ? `border-left:${k.stripBorder};` : ""}${k.stripAlign === "center" ? "flex-direction:column;text-align:center;border-bottom:3px double " + k.ink + ";padding-bottom:8px;" : ""}${k.key === "bw" ? "border-top:3pt solid #000000;border-bottom:1pt solid #000000;padding:6px 0;" : ""}}
.xd .strip img{height:${k.key === "classic" ? 30 : 34}px;width:auto;filter:${k.logoFilter}}
.xd .strip .brand{font-weight:800;font-size:${fs + 4}pt;letter-spacing:.5px${k.key === "bw" ? ";border:1.5pt solid #000000;padding:2px 6px" : ""}}
.xd .strip .t{flex:1;min-width:0}
.xd .strip h1{margin:0;font-size:${(fs * k.h1Size).toFixed(1)}pt;line-height:1.15;font-weight:${k.h1Weight};text-transform:${k.h1Transform};letter-spacing:${k.h1Spacing}}
.xd .strip p{margin:2px 0 0;font-size:${(fs * 0.9).toFixed(1)}pt;opacity:.85}
.xd .strip .when{font-size:${(fs * 0.85).toFixed(1)}pt;text-align:${k.stripAlign === "center" ? "center" : "right"};opacity:.9;white-space:nowrap}
.xd .xd-filters{margin:8px 2px 0;color:${k.muted};font-size:${(fs * 0.9).toFixed(1)}pt}
.xd .xd-filters b{color:${k.ink}}
.xd .cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(${box.landscape ? 150 : 128}px,1fr));gap:8px;margin:12px 0 4px}
.xd .card{border:${k.cardBorder};border-left:${k.cardAccent};border-radius:${k.cardRadius}px;padding:7px 10px;break-inside:avoid;${bg(k.cardBg)}}
.xd .card span{display:block;font-size:${(fs * 0.8).toFixed(1)}pt;color:${k.cardLabelInk};text-transform:uppercase;letter-spacing:.3px}
.xd .card b{display:block;font-size:${(fs * 1.3).toFixed(1)}pt;margin-top:2px}
.xd .card small{display:block;color:${k.muted};font-size:${(fs * 0.8).toFixed(1)}pt}
.xd .card.green{border-left-color:${k.tones.green}}.xd .card.red{border-left-color:${k.tones.red}}.xd .card.amber{border-left-color:${k.tones.amber}}.xd .card.blue{border-left-color:${k.tones.blue}}
.xd h2{font-size:${(fs * k.h2Size).toFixed(1)}pt;margin:14px 0 6px;color:${k.h2Ink};${k.h2Border !== NONE ? `border-bottom:${k.h2Border};` : ""}padding-bottom:3px;break-after:avoid;text-transform:${k.h2Transform};letter-spacing:${k.h2Transform === "uppercase" ? ".6px" : "0"}}
.xd h2 small{font-weight:400;color:${k.muted};font-size:${(fs * 0.82).toFixed(1)}pt;text-transform:none;letter-spacing:0}
.xd h3.xd-gh{font-size:${(fs * 1.05).toFixed(1)}pt;margin:10px 0 4px;color:${k.grpInk};border-bottom:${k.grpBorder};padding-bottom:2px;break-after:avoid}
.xd h3.xd-gh span{font-weight:400;color:${k.muted};font-size:${(fs * 0.85).toFixed(1)}pt}
.xd table{width:100%;border-collapse:collapse}
.xd .xd-t{${k.outer !== NONE ? `border:${k.outer};` : ""}}
.xd thead{display:table-header-group}
.xd tr{break-inside:avoid}
.xd th,.xd td{padding:${py}px ${px}px;border-bottom:${k.cellBorder};text-align:left;vertical-align:top}
${k.vline !== NONE ? `.xd .xd-t th+th,.xd .xd-t td+td{border-left:${k.vline}}` : ""}
.xd .xd-t th{${bg(k.headBg)};color:${k.headInk};font-size:${(fs * k.headSize).toFixed(1)}pt;font-weight:${k.headWeight};text-transform:${k.headTransform};letter-spacing:${k.headTransform === "uppercase" ? ".2px" : "0"};border-bottom:${k.headBorder}}
.xd td.n,.xd th.n{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
.xd td.long{white-space:pre-wrap}
.xd td.pos,.xd .pos{color:${k.pos}}.xd td.neg,.xd .neg{color:${k.neg}}
.xd tr.grp td{${bg(k.grpBg)};font-weight:700;color:${k.grpInk};border-bottom:${k.grpBorder}${k.key === "bw" ? ";border-top:1pt solid #000000;text-transform:uppercase" : ""}}
.xd tr.grp td span{font-weight:400;color:${k.muted}}
.xd tr.sub td{font-style:italic;${bg(k.subBg)}${k.key === "bw" || k.key === "draft" ? ";border-bottom:" + k.cellBorder.replace("solid", "dashed") : ""}}
.xd tr.tot td{font-weight:700;border-top:${k.totBorder};border-bottom:0;${bg(k.totBg)}}
.xd td.empty{color:${k.muted};text-align:center;padding:14px}
.xd table.kv th{width:30%;${bg(k.key === "bw" || k.key === "draft" || k.key === "minimal" ? NONE : "#f9fafb")};text-transform:none;color:${k.ink};font-weight:600}
.xd .l-compact th,.xd .l-compact td{padding:1.5px 4px;font-size:${(fs * 0.86).toFixed(1)}pt;line-height:1.2}
.xd .l-compact td{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:0}
.xd .l-compact td.long{white-space:normal;max-width:none}
.xd .l-compact{table-layout:auto}
.xd .xd-grid{display:grid;grid-template-columns:repeat(${box.landscape ? 3 : 2},minmax(0,1fr));gap:8px}
.xd .xd-grid .xd-gh{grid-column:1/-1}
.xd .xd-card{border:${k.cardBorder};border-top:${k.cardAccent};border-radius:${k.cardRadius}px;padding:7px 9px;break-inside:avoid;${bg(k.cardBg)}}
.xd .xd-card h4{margin:0 0 4px;font-size:${(fs * 1.05).toFixed(1)}pt;color:${k.recHeadInk === "#ffffff" ? k.dark : k.recHeadInk}}
.xd .xd-card dl,.xd .xd-rec dl{margin:0;display:grid;grid-template-columns:auto 1fr;gap:1px 8px}
.xd .xd-card dt,.xd .xd-rec dt{color:${k.cardLabelInk};font-size:${(fs * 0.82).toFixed(1)}pt;text-transform:uppercase;letter-spacing:.2px;padding-top:1px}
.xd .xd-card dd,.xd .xd-rec dd{margin:0;overflow-wrap:anywhere;white-space:pre-wrap}
.xd .xd-card dd.n,.xd .xd-rec dd.n{font-variant-numeric:tabular-nums}
.xd .xd-list{margin:0;padding:0 0 0 ${(fs * 2.4).toFixed(0)}px}
.xd .xd-list li{padding:${Math.max(1, py - 1)}px 4px;border-bottom:${k.cellBorder};break-inside:avoid}
.xd .xd-list li b{font-weight:700}
.xd .xd-list li .m{color:${k.muted}}
.xd .xd-list li .v{float:right;font-weight:700;font-variant-numeric:tabular-nums;margin-left:8px}
.xd .xd-rec{border:${k.recBorder};border-radius:${Math.min(k.cardRadius, 8)}px;margin:0 0 8px;${bg(k.recBg)}}
.xd .xd-rec h4{margin:0;padding:5px 9px;font-size:${(fs * 1.08).toFixed(1)}pt;${bg(k.recHeadBg)};color:${k.recHeadInk};border-bottom:${k.recBorder}}
.xd .xd-rec h4 span{float:right;font-weight:400;color:inherit;opacity:.75;font-size:${(fs * 0.85).toFixed(1)}pt}
.xd .xd-rec{padding-bottom:5px}
.xd .xd-rec .xd-f{display:grid;grid-template-columns:minmax(90px,28%) 1fr;gap:8px;padding:1.5px 9px;break-inside:avoid}
.xd .xd-rec .xd-f:first-of-type{padding-top:6px}
.xd .xd-rec .k{color:${k.cardLabelInk};font-size:${(fs * 0.82).toFixed(1)}pt;text-transform:uppercase;letter-spacing:.2px;padding-top:1px}
.xd .xd-rec .v{overflow-wrap:anywhere;white-space:pre-wrap}
.xd .xd-rec .v.n{font-variant-numeric:tabular-nums}
.xd .xd-tot{margin:6px 0 0;padding:5px 6px;border-top:${k.totBorder};font-weight:700;${bg(k.totBg)}}
.xd .xd-gsum{margin-top:10px}
.xd .xd-text p{margin:0 0 6px}.xd .xd-text h3,.xd .xd-text h4,.xd .xd-text h5{margin:10px 0 4px;color:${k.h2Ink}}
.xd .xd-text ul,.xd .xd-text ol{margin:0 0 6px 18px;padding:0}.xd .xd-text li.done{color:${k.muted};text-decoration:line-through}
.xd .xd-text pre{${bg(k.codeBg)};${k.codeBg === NONE ? `border:${k.cellBorder};` : ""}padding:8px;border-radius:6px;white-space:pre-wrap;font:${(fs * 0.9).toFixed(1)}pt ui-monospace,Menlo,Consolas,monospace}
.xd .xd-text code{${bg(k.codeBg)};padding:0 3px;border-radius:3px}
.xd .xd-text blockquote{margin:0 0 6px;padding:4px 10px;border-left:3px solid ${k.soft};color:${k.muted}}
.xd .xd-sign{display:flex;gap:28px;margin-top:34px;break-inside:avoid}
.xd .xd-sign div{flex:1;border-top:1px solid ${k.ink};padding-top:4px;text-align:center;font-size:${(fs * 0.9).toFixed(1)}pt;color:${k.ink}}
.xd .xd-sign small{display:block;color:${k.muted};margin-top:14px}
.xd .xd-wm{position:fixed;left:0;right:0;top:40%;text-align:center;font:800 ${box.landscape ? 90 : 110}pt ${k.font};color:transparent;-webkit-text-stroke:1.2px ${k.watermarkInk};transform:rotate(-24deg);opacity:.9;pointer-events:none;z-index:0;letter-spacing:6px}
${zebra}`;
}

/* ------------------------------- hazır ayarlar ------------------------------- */

/** Yerleşik hazır ayarlar (tasarım alanları). */
export const BUILTIN_PRESETS = [
  { id: "office-bw", label: "Ofis yazıcısı (S/B)", design: { theme: "bw", layout: "table", zebra: true, fontSize: "normal", density: "normal", show: { logo: true, summary: true } } },
  { id: "ink-saver", label: "Mürekkep tasarrufu", design: { theme: "draft", layout: "compact", zebra: false, fontSize: "small", density: "tight", margins: "narrow", show: { logo: false, summary: false } } },
  { id: "board", label: "Yönetim sunumu", design: { theme: "vivid", layout: "cards", fontSize: "large", density: "airy", orientation: "landscape", show: { summary: true } } },
  { id: "archive", label: "Arşiv / resmi", design: { theme: "classic", layout: "table", zebra: false, show: { signatures: true, pageNumbers: true } } },
];

const PRESETS_KEY = "elitlig:export-presets";
const store = () => { try { return typeof window !== "undefined" ? window.localStorage : null; } catch { return null; } };
export function loadPresets() {
  try { const v = JSON.parse(store()?.getItem(PRESETS_KEY) || "[]"); return Array.isArray(v) ? v.filter((p) => p && p.id && p.label) : []; } catch { return []; }
}
export function savePresets(list) {
  try { store()?.setItem(PRESETS_KEY, JSON.stringify((list || []).slice(0, 30))); } catch { /* yoksay */ }
}
/** Hazır ayarın tasarım alanlarını mevcut tasarıma uygular (başlık / imza metni korunur). */
export function applyPreset(design, preset) {
  const cur = normalizeDesign(design);
  const p = preset?.design || {};
  return normalizeDesign({ ...cur, ...p, title: cur.title, subtitle: cur.subtitle, show: { ...cur.show, ...(p.show || {}) } });
}
/** Hazır ayar olarak kaydedilecek alanlar (başlık / alt başlık sayfaya özgüdür, alınmaz). */
export function presetFromDesign(design) {
  const d = normalizeDesign(design);
  const { title, subtitle, ...rest } = d;
  return rest;
}
