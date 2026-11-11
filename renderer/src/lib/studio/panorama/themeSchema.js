// Panorama rejisi · TEMA ŞEMASI (saf; sınanır).
//
// Bir tema / marka profili şu bölümlerden oluşur (brands.js normalizeBrand hepsini süzer; eski
// kayıtlarda olmayan bölüm temadan, o da yoksa buradaki varsayılandan gelir — geriye uyumlu göç):
//
//   colors     ana, ikincil, vurgu, 2. vurgu, metin, zemin, panel, canlı (kırmızı rozet)
//   bg         zemin: düz / doğrusal / dairesel / ağ (mesh) / iki tonlu gradyan, açı, doku (nokta,
//              ızgara, çizgi, çapraz, altıgen, karbon, raster, kağıt, kumlama, tarama), doku gücü,
//              vinyet, HAREKET (ışık süpürmesi, dalga, nabız, parçacık, projektör, bokeh) — kameraların
//              arkasında / aralarında oynar (draw.js drawAmbient; kamera kutuları kırpılır)
//   frame      kamera çerçevesi: yok, çizgi, çift çizgi, parıltı, neon, köşe parantezi (HUD), cam,
//              kaydırılmış gölge (dergi), eğik, gradyan; kalınlık, renk kaynağı, köşe, gölge
//   lower      alt yazı bandı (isim / unvan, bilgi, sponsor): 12 biçim; hizalama, genişlik, yükseklik,
//              vurgu çubuğu, logo, büyük harf
//   ticker     kayan bant: 8 biçim; üstte / altta, yükseklik, ayraç
//   clock      saat: biçim + köşe + saniye
//   live       CANLI rozeti: biçim + köşe + yazı
//   watermark  köşe logosu (+ hareket: nabız, nefes, süzülme, parlama, dönme)
//   fonts      başlık / metin yazı tipi, kalınlık, büyük harf, harf aralığı
//   anim       giriş / çıkış hareketi, süre, YUMUŞATMA (easing)
//   card       içerik kartı: köşe, saydamlık, gölge, cam, kenarlık, başlık biçimi
//   titleCard  tam ekran başlık kartı biçimi
//
// Her seçenek listesi [anahtar, Türkçe ad] çiftidir (tema düzenleyicisi doğrudan listeler).

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
const str = (v, d = "", max = 80) => String(v ?? d).slice(0, max);
const keysOf = (list) => list.map(([k]) => k);
export const pickKey = (v, list, d) => (keysOf(list).includes(v) ? v : d);
const bool = (v, d) => (typeof v === "boolean" ? v : d);
const round2 = (v) => Math.round(v * 100) / 100;

/* ─────────────────────────────── seçenekler ─────────────────────────────── */

export const BG_KINDS = Object.freeze([["gradient", "Doğrusal gradyan"], ["solid", "Düz renk"], ["radial", "Dairesel ışık"], ["mesh", "Ağ gradyan (çok renkli)"], ["split", "İki tonlu (çapraz)"]]);
export const TEXTURES = Object.freeze([["none", "Doku yok"], ["dots", "Nokta"], ["grid", "Izgara"], ["lines", "Yatay çizgi (saha)"], ["diagonal", "Çapraz çizgi"], ["hex", "Altıgen"], ["carbon", "Karbon"], ["halftone", "Raster (baskı)"], ["paper", "Kağıt lifi"], ["noise", "Kumlama"], ["scan", "Tarama çizgisi"]]);
export const MOTIONS = Object.freeze([["none", "Hareketsiz"], ["sweep", "Işık süpürmesi"], ["wave", "Dalga"], ["pulse", "Nabız (ışıma)"], ["particles", "Parçacıklar"], ["beams", "Projektör ışıkları"], ["bokeh", "Bokeh ışıklar"]]);
export const FRAME_STYLES = Object.freeze([["none", "Çerçevesiz"], ["line", "İnce çizgi"], ["double", "Çift çizgi"], ["glow", "Parıltı"], ["neon", "Neon"], ["corners", "Köşe parantezi (HUD)"], ["glass", "Cam kenar"], ["offset", "Kaydırılmış gölge (dergi)"], ["bevel", "Eğik kesik"], ["gradient", "Gradyan kenar"]]);
export const COLOR_SOURCES = Object.freeze([["accent", "Vurgu"], ["accent2", "2. vurgu"], ["primary", "Ana renk"], ["white", "Beyaz"], ["black", "Siyah"], ["panel", "Panel"], ["text", "Metin"]]);
export const LOWER_STYLES = Object.freeze([
  ["classic", "Klasik (iki katlı)"], ["slab", "Kalın blok"], ["glass", "Buzlu cam"], ["split", "İki renkli eğik"], ["ribbon", "Kurdele"], ["minimal", "Yalın çizgi"],
  ["neon", "Neon kutu"], ["editorial", "Editoryal (serif + çizgi)"], ["sport", "Spor (eğik + numara)"], ["pill", "Hap"], ["stack", "Yığın (kademeli)"], ["hud", "HUD (köşeli)"],
]);
export const ALIGNS = Object.freeze([["left", "Sol"], ["center", "Orta"], ["right", "Sağ"]]);
export const TICKER_STYLES = Object.freeze([["solid", "Dolu"], ["glass", "Cam"], ["split", "İki renkli"], ["minimal", "İnce çizgi"], ["neon", "Neon"], ["pill", "Hap"], ["ribbon", "Kurdele"], ["editorial", "Editoryal"]]);
export const TICKER_SEPS = Object.freeze([["dot", "•"], ["bar", "|"], ["diamond", "◆"], ["slash", "/"], ["star", "★"]]);
export const SEP_CHARS = Object.freeze({ dot: "•", bar: "|", diamond: "◆", slash: "/", star: "★" });
export const POSITIONS = Object.freeze([["tl", "Sol üst"], ["tr", "Sağ üst"], ["bl", "Sol alt"], ["br", "Sağ alt"]]);
export const CLOCK_STYLES = Object.freeze([["box", "Kutu (saat + tarih)"], ["minimal", "Yalın saat"], ["digital", "Dijital (saniyeli)"], ["pill", "Hap"], ["off", "Kapalı"]]);
export const LIVE_STYLES = Object.freeze([["box", "Kutu"], ["dot", "Nokta + yazı"], ["pill", "Hap"], ["tag", "Etiket (eğik)"], ["blink", "Yanıp sönen"]]);
export const LOGO_ANIMS = Object.freeze([["none", "Hareketsiz"], ["pulse", "Nabız"], ["breathe", "Nefes (saydamlık)"], ["float", "Süzülme"], ["shine", "Parlama"], ["spin", "Yavaş dönme (Y ekseni)"]]);
export const EASINGS = Object.freeze([["smooth", "Yumuşak"], ["snappy", "Çevik"], ["expo", "Üstel (hızlı giriş)"], ["bounce", "Geri sekme"], ["elastic", "Esnek"], ["linear", "Doğrusal"]]);
export const CARD_HEADS = Object.freeze([["gradient", "Gradyan şerit"], ["solid", "Dolu şerit"], ["underline", "Alt çizgili"], ["tab", "Sekme"], ["outline", "Çerçeveli"]]);
export const TITLE_STYLES = Object.freeze([["center", "Ortada büyük"], ["left", "Sola yaslı blok"], ["split", "İkiye bölünmüş"], ["poster", "Afiş (dev yazı)"], ["minimal", "Yalın"]]);
export const FONT_WEIGHTS = Object.freeze([[600, "Yarı kalın"], [700, "Kalın"], [800, "Çok kalın"], [900, "Siyah"]]);

/* ─────────────────────────────── yumuşatma ─────────────────────────────── */

/** p (0…1) → yumuşatılmış ilerleme. bounce / elastic 1'i kısa süre aşar (giriş hareketinde). */
export function ease(kind, p) {
  const t = clamp(Number(p) || 0, 0, 1);
  switch (kind) {
    case "linear": return t;
    case "snappy": return 1 - (1 - t) ** 4;
    case "expo": return t >= 1 ? 1 : 1 - 2 ** (-10 * t);
    case "bounce": { const c1 = 1.70158; const c3 = c1 + 1; return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2; }
    case "elastic": { if (t === 0 || t === 1) return t; const c4 = (2 * Math.PI) / 3; return 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1; }
    case "smooth":
    default: return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
  }
}

/* ─────────────────────────────── varsayılanlar ─────────────────────────────── */

export const STYLE_DEFAULTS = Object.freeze({
  bg: { kind: "gradient", angle: 135, texture: "none", textureOpacity: 0.12, vignette: 0.35, motion: "none", motionOpacity: 0.35 },
  frame: { style: "line", width: 3, color: "accent", radius: 0.035, shadow: 24 },
  lower: { style: "classic", align: "left", width: 0.46, y: 150, accentBar: true, logo: true, upper: true },
  ticker: { style: "solid", label: "", position: "bottom", height: 60, sep: "dot" },
  clock: { style: "box", pos: "tr", seconds: false },
  live: { on: false, style: "box", pos: "tl", text: "CANLI" },
  watermark: { pos: "off", size: 110, opacity: 0.85, which: "logo", anim: "none" },
  fonts: { display: "", body: "", weight: 800, upper: true, tracking: 0 },
  anim: { in: "slide", out: "fade", ms: 520, easing: "smooth" },
  card: { radius: 22, opacity: 1, shadow: 36, glass: false, border: 0, head: "gradient" },
  header: { style: "pill", tagline: "" },
  names: { style: "glass" },
  titleCard: { style: "center" },
});

/** Bir stil bölümünü süzer (bilinmeyen alan atılır, sınırlar uygulanır). raw: kayıttaki değer. */
export const SECTION_NORMALIZERS = Object.freeze({
  bg: (r, d = STYLE_DEFAULTS.bg) => ({
    kind: pickKey(r.kind, BG_KINDS, d.kind),
    angle: Math.round(((num(r.angle, d.angle) % 360) + 360) % 360),
    texture: pickKey(r.texture, TEXTURES, d.texture),
    textureOpacity: round2(clamp(num(r.textureOpacity, d.textureOpacity), 0, 0.6)),
    vignette: round2(clamp(num(r.vignette, d.vignette), 0, 1)),
    motion: pickKey(r.motion, MOTIONS, d.motion),
    motionOpacity: round2(clamp(num(r.motionOpacity, d.motionOpacity), 0, 1)),
  }),
  frame: (r, d = STYLE_DEFAULTS.frame) => ({
    style: pickKey(r.style, FRAME_STYLES, d.style),
    width: Math.round(clamp(num(r.width, d.width), 0, 16)),
    color: pickKey(r.color, COLOR_SOURCES, d.color),
    radius: Math.round(clamp(num(r.radius, d.radius), 0, 0.25) * 1000) / 1000,
    shadow: Math.round(clamp(num(r.shadow, d.shadow), 0, 80)),
  }),
  lower: (r, d = STYLE_DEFAULTS.lower) => ({
    style: pickKey(r.style, LOWER_STYLES, d.style),
    align: pickKey(r.align, ALIGNS, d.align),
    width: round2(clamp(num(r.width, d.width), 0.25, 0.92)),
    y: Math.round(clamp(num(r.y, d.y), 30, 600)),
    accentBar: bool(r.accentBar, d.accentBar),
    logo: bool(r.logo, d.logo),
    upper: bool(r.upper, d.upper),
  }),
  ticker: (r, d = STYLE_DEFAULTS.ticker) => ({
    style: pickKey(r.style, TICKER_STYLES, d.style),
    label: str(r.label, d.label, 24),
    position: r.position === "top" ? "top" : "bottom",
    height: Math.round(clamp(num(r.height, d.height), 40, 96)),
    sep: pickKey(r.sep, TICKER_SEPS, d.sep),
  }),
  clock: (r, d = STYLE_DEFAULTS.clock) => ({ style: pickKey(r.style, CLOCK_STYLES, d.style), pos: pickKey(r.pos, POSITIONS, d.pos), seconds: bool(r.seconds, d.seconds) }),
  live: (r, d = STYLE_DEFAULTS.live) => ({ on: bool(r.on, d.on), style: pickKey(r.style, LIVE_STYLES, d.style), pos: pickKey(r.pos, POSITIONS, d.pos), text: str(r.text, d.text, 16).trim() || "CANLI" }),
  watermark: (r, d = STYLE_DEFAULTS.watermark) => ({
    pos: pickKey(r.pos, [["off", ""], ...POSITIONS], d.pos),
    size: Math.round(clamp(num(r.size, d.size), 40, 400)),
    opacity: round2(clamp(num(r.opacity, d.opacity), 0.1, 1)),
    which: r.which === "logo2" ? "logo2" : "logo",
    anim: pickKey(r.anim, LOGO_ANIMS, d.anim),
  }),
  fonts: (r, d = STYLE_DEFAULTS.fonts) => ({
    display: str(r.display, d.display, 60),
    body: str(r.body, d.body, 60),
    weight: [600, 700, 800, 900].includes(Number(r.weight)) ? Number(r.weight) : d.weight,
    upper: bool(r.upper, d.upper),
    tracking: Math.round(clamp(num(r.tracking, d.tracking), -2, 10) * 10) / 10,
  }),
  anim: (r, d = STYLE_DEFAULTS.anim, animList = null) => ({
    in: animList ? pickKey(r.in, animList, d.in) : str(r.in, d.in, 12),
    out: animList ? pickKey(r.out, animList, d.out) : str(r.out, d.out, 12),
    ms: Math.round(clamp(num(r.ms, d.ms), 150, 2000)),
    easing: pickKey(r.easing, EASINGS, d.easing),
  }),
  titleCard: (r, d = STYLE_DEFAULTS.titleCard) => ({ style: pickKey(r.style, TITLE_STYLES, d.style) }),
});

/** Renk kaynağını belirteçlerden çözer (çerçeve rengi vb.). */
export function colorFrom(T, key) {
  switch (key) {
    case "accent2": return T.accent2 || T.accent;
    case "primary": return T.primary;
    case "white": return "#ffffff";
    case "black": return "#000000";
    case "panel": return T.panel;
    case "text": return T.onBg || "#ffffff";
    case "accent":
    default: return T.accent;
  }
}

/* ─────────────────────────────── tema dosyası (dışa / içe aktarma) ─────────────────────────────── */

/** Düzenleyicide "her ayrıntı": bölümler ve alanları (tür + seçenekler) — arayüz bu tablodan çizilir. */
export const EDITOR_SECTIONS = Object.freeze([
  { key: "bg", label: "Zemin", icon: "image", fields: [
    ["kind", "Zemin türü", "select", BG_KINDS], ["angle", "Açı (°)", "range", [0, 359, 1]], ["texture", "Doku", "select", TEXTURES], ["textureOpacity", "Doku gücü", "range", [0, 0.6, 0.01]],
    ["vignette", "Vinyet", "range", [0, 1, 0.01]], ["motion", "Hareket", "select", MOTIONS], ["motionOpacity", "Hareket gücü", "range", [0, 1, 0.01]],
  ] },
  { key: "frame", label: "Kamera çerçevesi", icon: "layout", fields: [
    ["style", "Biçim", "select", FRAME_STYLES], ["width", "Kalınlık (px)", "range", [0, 16, 1]], ["color", "Renk", "select", COLOR_SOURCES], ["radius", "Köşe", "range", [0, 0.25, 0.005]], ["shadow", "Gölge", "range", [0, 80, 1]],
  ] },
  { key: "lower", label: "Alt yazı bandı", icon: "type", fields: [
    ["style", "Biçim", "select", LOWER_STYLES], ["align", "Hizalama", "select", ALIGNS], ["width", "Genişlik", "range", [0.25, 0.92, 0.01]], ["y", "Alttan uzaklık (px)", "range", [30, 600, 2]],
    ["accentBar", "Vurgu çubuğu", "check"], ["logo", "Logo", "check"], ["upper", "Büyük harf", "check"],
  ] },
  { key: "ticker", label: "Kayan bant", icon: "list", fields: [
    ["style", "Biçim", "select", TICKER_STYLES], ["position", "Yer", "select", [["bottom", "Altta"], ["top", "Üstte"]]], ["height", "Yükseklik (px)", "range", [40, 96, 1]], ["sep", "Ayraç", "select", TICKER_SEPS], ["label", "Etiket", "text", 24],
  ] },
  { key: "clock", label: "Saat", icon: "clock", fields: [["style", "Biçim", "select", CLOCK_STYLES], ["pos", "Köşe", "select", POSITIONS], ["seconds", "Saniye", "check"]] },
  { key: "live", label: "CANLI rozeti", icon: "broadcast", fields: [["on", "Göster", "check"], ["style", "Biçim", "select", LIVE_STYLES], ["pos", "Köşe", "select", POSITIONS], ["text", "Yazı", "text", 16]] },
  { key: "watermark", label: "Köşe logosu", icon: "image", fields: [
    ["pos", "Köşe", "select", [["off", "Kapalı"], ...POSITIONS]], ["size", "Boy (px)", "range", [40, 400, 2]], ["opacity", "Saydamlık", "range", [0.1, 1, 0.01]], ["which", "Logo", "select", [["logo", "Ana logo"], ["logo2", "İkinci logo"]]], ["anim", "Hareket", "select", LOGO_ANIMS],
  ] },
  { key: "fonts", label: "Yazı", icon: "type", fields: [["weight", "Kalınlık", "select", FONT_WEIGHTS], ["upper", "Başlıklar büyük harf", "check"], ["tracking", "Harf aralığı (px)", "range", [-2, 10, 0.5]]] },
  { key: "anim", label: "Hareket", icon: "zap", fields: [["ms", "Süre (ms)", "range", [150, 2000, 10]], ["easing", "Yumuşatma", "select", EASINGS]] },
  { key: "card", label: "İçerik kartı", icon: "layers", fields: [
    ["head", "Başlık", "select", CARD_HEADS], ["radius", "Köşe", "range", [0, 60, 1]], ["opacity", "Saydamlık", "range", [0.3, 1, 0.01]], ["shadow", "Gölge", "range", [0, 80, 1]], ["border", "Kenarlık", "range", [0, 8, 1]], ["glass", "Cam", "check"],
  ] },
  { key: "titleCard", label: "Tam ekran başlık", icon: "maximize", fields: [["style", "Biçim", "select", TITLE_STYLES]] },
]);
