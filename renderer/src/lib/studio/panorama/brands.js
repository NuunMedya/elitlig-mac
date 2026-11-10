// Panorama yayını · TEMALAR VE MARKA PROFİLLERİ (saf; sınanır).
//
// Tema: hazır renk paleti + kart / künye / bant / saat / animasyon stili (salt okunur, 16 adet).
// Marka profili: bir temadan başlar, üstüne ad, logo (+ ikinci / sponsor logosu), renk paleti
// (ana, ikincil, vurgu, metin, arka plan, panel), yazı tipleri, kart stili (köşe, saydamlık,
// gölge, cam), künye / isim bandı / alt bant stilleri, giriş-çıkış animasyonu, filigran (köşe
// logosu) ve saat stili yazılır. Profil "başka bir markanın yayını" demektir: aynı stüdyo, başka
// logo ve renklerle.
//
//   brandTokens(profile)  → çizimin kullandığı belirteçler (T): draw.js themeOf ile aynı alanlar +
//                           fonts / card / header / names / ticker / clock / anim / watermark / logos
//   paletteFromPixels()   → logodan otomatik palet (RGBA piksel dizisinden; tuvalden okunur)
//   exportBrands / parseBrandFile → taşınabilir JSON (logolar gömülü base64 data: adresi)
//
// Logolar profilde { data, url, name } olarak durur: data küçültülmüş data: adresi (çizim, dışa
// aktarma ve başka bilgisayar için), url ise seçilen dosyanın kalıcı elitlig-studio://media adresi
// (izin modeli: yalnız kullanıcının seçtiği dosya) ya da web adresi.

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
const str = (v, d = "", max = 80) => String(v ?? d).slice(0, max);
let seq = 0;
export const brandId = () => `br_${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

/* ─────────────────────────────── renk yardımcıları ─────────────────────────────── */

const HEX6 = /^#[0-9a-f]{6}$/i;
export function normHex(v) {
  const s = String(v || "").trim().toLowerCase();
  if (/^#[0-9a-f]{3}$/.test(s)) return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`;
  return HEX6.test(s) ? s : null;
}
export const hexToRgb = (h) => { const x = normHex(h) || "#000000"; return [parseInt(x.slice(1, 3), 16), parseInt(x.slice(3, 5), 16), parseInt(x.slice(5, 7), 16)]; };
export const rgbToHex = (r, g, b) => `#${[r, g, b].map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, "0")).join("")}`;
/** a'dan b'ye t oranında karışım. */
export function mix(a, b, t) {
  const A = hexToRgb(a); const Bc = hexToRgb(b);
  return rgbToHex(A[0] + (Bc[0] - A[0]) * t, A[1] + (Bc[1] - A[1]) * t, A[2] + (Bc[2] - A[2]) * t);
}
export const rgba = (h, a) => { const [r, g, b] = hexToRgb(h); return `rgba(${r},${g},${b},${clamp(a, 0, 1)})`; };
/** Göreli parlaklık (WCAG). */
export function luminance(h) {
  const f = (c) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const [r, g, b] = hexToRgb(h);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
export const contrast = (a, b) => { const x = luminance(a); const y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
/** Zemin üstünde okunur metin rengi (beyaz / koyu). */
export const readableOn = (bg, dark = "#0b0b12", light = "#ffffff") => (contrast(bg, light) >= contrast(bg, dark) ? light : dark);

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b); const mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn;
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
function hslToHex(h, s, l) {
  const a = s * Math.min(l, 1 - l);
  const f = (n) => { const k = (n + h / 30) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  return rgbToHex(f(0) * 255, f(8) * 255, f(4) * 255);
}
const hueDist = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

/* ─────────────────────────────── seçenekler ─────────────────────────────── */

export const HEADER_STYLES = Object.freeze([["pill", "Hap (vurgu kutusu)"], ["bar", "Tam şerit"], ["boxed", "Cam kutu"], ["minimal", "Yalın yazı"], ["off", "Kapalı"]]);
export const NAME_STYLES = Object.freeze([["glass", "Cam bant"], ["solid", "Dolu bant"], ["accent", "Vurgu renkli"], ["minimal", "Yalın"], ["off", "Kapalı"]]);
export const TICKER_STYLES = Object.freeze([["solid", "Dolu"], ["glass", "Cam"], ["split", "İki renkli"], ["minimal", "İnce çizgi"]]);
export const CLOCK_STYLES = Object.freeze([["box", "Kutu (saat + tarih)"], ["minimal", "Yalın saat"], ["digital", "Dijital (saniyeli)"], ["off", "Kapalı"]]);
export const ANIMS = Object.freeze([["slide", "Kaydır"], ["fade", "Belir"], ["zoom", "Yakınlaş"], ["rise", "Aşağıdan yüksel"], ["wipe", "Silme (perde)"], ["flip", "Çevir"], ["none", "Yok"]]);
export const WATERMARK_POS = Object.freeze([["off", "Kapalı"], ["tl", "Sol üst"], ["tr", "Sağ üst"], ["bl", "Sol alt"], ["br", "Sağ alt"]]);
const keysOf = (list) => list.map(([k]) => k);
const pickKey = (v, list, d) => (keysOf(list).includes(v) ? v : d);

/** Panoya gömülü yazı tipleri + sık bulunan sistem yazı tipleri (yüklü olanlar listede kalır). */
export const BUILTIN_FONTS = Object.freeze(["Inter", "Barlow Condensed"]);
export const COMMON_SYSTEM_FONTS = Object.freeze([
  "Helvetica Neue", "Helvetica", "Arial", "Arial Black", "Arial Narrow", "Avenir", "Avenir Next", "Avenir Next Condensed", "Futura", "Gill Sans", "Optima",
  "Segoe UI", "Segoe UI Black", "Calibri", "Cambria", "Candara", "Consolas", "Franklin Gothic Medium", "Bahnschrift", "Impact", "Tahoma", "Trebuchet MS", "Verdana",
  "Georgia", "Times New Roman", "Palatino", "Baskerville", "Didot", "Rockwell", "Copperplate", "American Typewriter", "Menlo", "Courier New",
  "SF Pro Display", "SF Pro Text", "Roboto", "Roboto Condensed", "Open Sans", "Montserrat", "Poppins", "Oswald", "Bebas Neue", "Anton", "Teko", "Rajdhani",
  "DejaVu Sans", "DejaVu Sans Condensed", "Liberation Sans", "Liberation Sans Narrow", "Noto Sans", "Ubuntu", "Ubuntu Condensed", "Cantarell",
]);
/** Yazı tipi adı → CSS aile listesi (yedekler). */
export const fontStack = (family, fallback) => {
  const f = String(family || "").replace(/["\\]/g, "").trim();
  return f ? `"${f}", ${fallback}` : fallback;
};

/* ─────────────────────────────── hazır temalar ─────────────────────────────── */

// Renk paleti (p): primary (başlık şeridi / ana renk), secondary (zemin gradyanının ikinci ucu,
// şerit), accent (vurgu: sıra, puan, çizgi), text (panel metni), background (zemin), panel (kart).
const TH = (key, label, hint, p, extra = {}) => ({ key, label, hint, palette: p, ...extra });
export const THEMES = Object.freeze([
  TH("mor", "Elitlig klasik", "Mor zemin, beyaz kartlar, magenta vurgu", { primary: "#54009c", secondary: "#12002b", accent: "#c026d3", text: "#1b0b33", background: "#12002b", panel: "#ffffff" }),
  TH("gece", "Gece & altın", "Lacivert zemin, koyu cam kartlar, altın vurgu", { primary: "#08102a", secondary: "#14275a", accent: "#f5c542", text: "#f3f5ff", background: "#050b1f", panel: "#0c1530" }, { card: { glass: true, opacity: 0.94 }, header: { style: "boxed" } }),
  TH("gunduz", "Gündüz", "Açık gri zemin, beyaz kartlar, mavi vurgu — gün ışığında okunur", { primary: "#1d4ed8", secondary: "#e7edf6", accent: "#f97316", text: "#0f172a", background: "#dfe7f2", panel: "#ffffff" }, { card: { shadow: 18 } }),
  TH("lacivert", "Lacivert", "Klasik spor yayını: lacivert şerit, buz mavisi vurgu", { primary: "#0a1a3f", secondary: "#164a9a", accent: "#38bdf8", text: "#0a1a3f", background: "#0a1a3f", panel: "#ffffff" }),
  TH("spor", "Spor kanalı", "Siyah-kırmızı, köşeli kartlar, sert şeritler", { primary: "#b91c1c", secondary: "#111111", accent: "#ef4444", text: "#111111", background: "#0b0b0b", panel: "#ffffff" }, { card: { radius: 4 }, header: { style: "bar" }, names: { style: "accent" }, ticker: { style: "split" }, anim: { in: "wipe" } }),
  TH("minimal", "Minimal", "Beyaz-gri, ince çizgiler, gösterişsiz", { primary: "#111827", secondary: "#f3f4f6", accent: "#111827", text: "#111827", background: "#e5e7eb", panel: "#ffffff" }, { card: { radius: 10, shadow: 8 }, header: { style: "minimal" }, names: { style: "minimal" }, ticker: { style: "minimal" }, clock: { style: "minimal" }, anim: { in: "fade" } }),
  TH("neon", "Neon", "Gece siyahı, camgöbeği ve pembe neon", { primary: "#0f0726", secondary: "#05010f", accent: "#22d3ee", text: "#f5f3ff", background: "#05010f", panel: "#130a2e" }, { card: { glass: true, border: 2, opacity: 0.9 }, header: { style: "boxed" }, names: { style: "accent" }, clock: { style: "digital" }, anim: { in: "zoom" } }),
  TH("retro", "Retro", "Krem kağıt, turuncu ve petrol mavisi, 70'ler", { primary: "#0f5257", secondary: "#f4e9d8", accent: "#e76f2a", text: "#2b2118", background: "#eadbc3", panel: "#fbf4e8" }, { card: { radius: 28 }, header: { style: "pill" }, anim: { in: "rise" } }),
  TH("kurumsal", "Kurumsal", "Gece mavisi ve çelik gri, sade ve ciddi", { primary: "#1e3a5f", secondary: "#0f2238", accent: "#5b9bd5", text: "#15202b", background: "#0f2238", panel: "#f8fafc" }, { card: { radius: 8 }, header: { style: "bar" }, names: { style: "solid" } }),
  TH("sampiyon", "Şampiyonlar", "Gece laciverti, gümüş ve yıldız mavisi, büyük gece", { primary: "#0b1f5c", secondary: "#020b2e", accent: "#c0d4ff", text: "#eef2ff", background: "#020b2e", panel: "#0c1a4a" }, { card: { glass: true, opacity: 0.92, border: 1 }, header: { style: "boxed" }, anim: { in: "zoom" } }),
  TH("sahil", "Sahil", "Turkuaz deniz, kum rengi kartlar, mercan vurgu", { primary: "#0e7490", secondary: "#22d3ee", accent: "#fb7185", text: "#083344", background: "#0e7490", panel: "#fffaf0" }, { card: { radius: 26 }, anim: { in: "rise" } }),
  TH("kis", "Kış", "Buz mavisi ve kar beyazı, soğuk ve temiz", { primary: "#1e40af", secondary: "#dbeafe", accent: "#60a5fa", text: "#0c1e46", background: "#bfdbfe", panel: "#ffffff" }, { card: { glass: true, opacity: 0.9 }, header: { style: "boxed" } }),
  TH("orman", "Orman", "Koyu yeşil zemin, krem kartlar, limon vurgu", { primary: "#14532d", secondary: "#052e16", accent: "#a3e635", text: "#052e16", background: "#052e16", panel: "#f7fee7" }),
  TH("vitrin", "Vitrin", "Kesik köşeler, eğik şeritler, asit yeşili sayılar", { primary: "#111111", secondary: "#262626", accent: "#c6ff00", text: "#111111", background: "#171717", panel: "#fafafa" }, { card: { radius: 2 }, header: { style: "bar" }, names: { style: "accent" }, ticker: { style: "split" }, anim: { in: "wipe" } }),
  TH("kagit", "Kağıt", "Kemik kağıt, mürekkep siyahı, vermiyon nokta rengi", { primary: "#141210", secondary: "#d9cfb9", accent: "#e4572e", text: "#141210", background: "#ece5d6", panel: "#fbf8f1" }, { card: { radius: 6, shadow: 10 }, header: { style: "minimal" }, names: { style: "solid" } }),
  TH("gunbatimi", "Gün batımı", "Mor-turuncu gradyan, sıcak ve canlı", { primary: "#7c2d12", secondary: "#581c87", accent: "#fb923c", text: "#1c0b05", background: "#3b0764", panel: "#fff7ed" }, { card: { radius: 24 }, anim: { in: "slide" } }),
]);
export const themeByKey = (k) => THEMES.find((t) => t.key === k) || THEMES[0];

/* ─────────────────────────────── profil ─────────────────────────────── */

const DEFAULT_STYLE = Object.freeze({
  card: { radius: 22, opacity: 1, shadow: 36, glass: false, border: 0 },
  header: { style: "pill", tagline: "" },
  names: { style: "glass" },
  ticker: { style: "solid", label: "" },
  clock: { style: "box" },
  anim: { in: "slide", out: "fade", ms: 520 },
  watermark: { pos: "off", size: 110, opacity: 0.85, which: "logo" },
  fonts: { display: "", body: "" },
});

function normLogo(l) {
  if (!l || typeof l !== "object") return null;
  const data = typeof l.data === "string" && /^data:image\/(png|jpeg|webp|gif|svg\+xml);base64,/i.test(l.data) && l.data.length < 3_000_000 ? l.data : null;
  const url = typeof l.url === "string" && /^(https?:|elitlig-studio:|elitlig-media:)/i.test(l.url) ? l.url.slice(0, 600) : null;
  if (!data && !url) return null;
  return { data, url, name: str(l.name, "", 120) || null };
}
/** Çizimde kullanılacak logo adresi (gömülü veri önce). */
export const logoSrc = (l) => (l ? l.data || l.url || null : null);

/** Profili süzer (bilinmeyen alan atılır; eksik alan temadan). */
export function normalizeBrand(b) {
  const th = themeByKey(b?.theme);
  const P = { ...th.palette };
  for (const k of Object.keys(P)) { const v = normHex(b?.colors?.[k]); if (v) P[k] = v; }
  const base = { ...DEFAULT_STYLE, ...Object.fromEntries(Object.entries(th).filter(([k]) => k in DEFAULT_STYLE).map(([k, v]) => [k, { ...DEFAULT_STYLE[k], ...v }])) };
  const g = (k) => ({ ...base[k], ...(b?.[k] && typeof b[k] === "object" ? b[k] : {}) });
  const card = g("card"); const header = g("header"); const names = g("names"); const ticker = g("ticker"); const clock = g("clock"); const anim = g("anim"); const wm = g("watermark"); const fonts = g("fonts");
  return {
    id: typeof b?.id === "string" && b.id ? b.id.slice(0, 40) : brandId(),
    name: str(b?.name, th.label, 60).trim() || th.label,
    theme: th.key,
    ...(b?.builtin ? { builtin: true } : {}),
    title: str(b?.title, "", 60),
    logo: normLogo(b?.logo),
    logo2: normLogo(b?.logo2),
    colors: P,
    fonts: { display: str(fonts.display, "", 60), body: str(fonts.body, "", 60) },
    card: { radius: Math.round(clamp(num(card.radius, 22), 0, 60)), opacity: Math.round(clamp(num(card.opacity, 1), 0.3, 1) * 100) / 100, shadow: Math.round(clamp(num(card.shadow, 36), 0, 80)), glass: Boolean(card.glass), border: Math.round(clamp(num(card.border, 0), 0, 8)) },
    header: { style: pickKey(header.style, HEADER_STYLES, "pill"), tagline: str(header.tagline, "", 60) },
    names: { style: pickKey(names.style, NAME_STYLES, "glass") },
    ticker: { style: pickKey(ticker.style, TICKER_STYLES, "solid"), label: str(ticker.label, "", 24) },
    clock: { style: pickKey(clock.style, CLOCK_STYLES, "box") },
    anim: { in: pickKey(anim.in, ANIMS, "slide"), out: pickKey(anim.out, ANIMS, "fade"), ms: Math.round(clamp(num(anim.ms, 520), 150, 2000)) },
    watermark: { pos: pickKey(wm.pos, WATERMARK_POS, "off"), size: Math.round(clamp(num(wm.size, 110), 40, 400)), opacity: Math.round(clamp(num(wm.opacity, 0.85), 0.1, 1) * 100) / 100, which: wm.which === "logo2" ? "logo2" : "logo" },
    ...(Number.isFinite(Number(b?.savedAt)) ? { savedAt: Number(b.savedAt) } : {}),
  };
}

/** Hazır temalardan salt okunur profiller (kopyalanıp düzenlenir). */
export const BUILTIN_BRANDS = Object.freeze(THEMES.map((t) => normalizeBrand({ id: `th_${t.key}`, name: t.label, theme: t.key, builtin: true })));
export const DEFAULT_BRAND_ID = "th_mor";
export function findBrand(list, id) {
  return (list || []).find((b) => b.id === id) || BUILTIN_BRANDS.find((b) => b.id === id) || BUILTIN_BRANDS[0];
}

/** Tema değiştirildiğinde: renkler ve stil yeni temadan, kimlik (ad, logo, yazı tipi) korunur. */
export function applyThemeToBrand(b, themeKey) {
  const th = themeByKey(themeKey);
  return normalizeBrand({ id: b.id, name: b.name, title: b.title, logo: b.logo, logo2: b.logo2, fonts: b.fonts, watermark: b.watermark, theme: th.key });
}

export function copyBrand(b, name) {
  const { builtin, ...rest } = b; void builtin;
  return normalizeBrand({ ...rest, id: brandId(), name: str(name || `${b.name} (kopya)`, "", 60), savedAt: Date.now() });
}

/* ─────────────────────────────── belirteçler ─────────────────────────────── */

const SANS_FB = "\"Inter\", \"SF Pro Text\", \"Helvetica Neue\", \"Segoe UI\", Arial, sans-serif";
const COND_FB = "\"Barlow Condensed\", \"Arial Narrow\", \"Helvetica Neue\", Arial, sans-serif";

/**
 * Profilden çizim belirteçleri. Eski tema alanları (bg, panel, text, muted, head, headText, accent,
 * accentText, rowAlt, line, ticker, tickerText, glass, onBg) draw.js ile uyumludur.
 * override: kart başına stil (accent / panel / text / primary / radius / opacity).
 */
export function brandTokens(brand, override = null) {
  const b = brand && brand.colors ? brand : normalizeBrand(brand || {});
  const P = { ...b.colors };
  if (override) for (const k of ["primary", "secondary", "accent", "text", "panel", "background"]) { const v = normHex(override[k]); if (v) P[k] = v; }
  const darkPanel = luminance(P.panel) < 0.2;
  const text = contrast(P.text, P.panel) >= 3 ? P.text : readableOn(P.panel);
  const card = { ...b.card, ...(override && Number.isFinite(Number(override.radius)) ? { radius: clamp(Number(override.radius), 0, 60) } : {}), ...(override && Number.isFinite(Number(override.opacity)) ? { opacity: clamp(Number(override.opacity), 0.3, 1) } : {}) };
  return {
    key: b.id,
    bg: [P.background, P.secondary === P.background ? mix(P.background, P.primary, 0.6) : P.primary === P.background ? P.secondary : mix(P.primary, P.secondary, 0.25)],
    primary: P.primary,
    secondary: P.secondary,
    panel: P.panel,
    text,
    muted: mix(text, P.panel, 0.42),
    head: P.primary,
    headText: readableOn(P.primary),
    accent: P.accent,
    accentText: readableOn(P.accent),
    rowAlt: mix(P.panel, darkPanel ? "#ffffff" : P.primary, darkPanel ? 0.05 : 0.055),
    line: mix(P.panel, text, 0.13),
    ticker: luminance(P.background) < 0.35 ? P.background : P.primary,
    tickerText: readableOn(luminance(P.background) < 0.35 ? P.background : P.primary),
    glass: rgba(luminance(P.background) < 0.35 ? P.background : mix(P.primary, "#000000", 0.4), 0.78),
    onBg: readableOn(P.background),
    fonts: { sans: fontStack(b.fonts.body, SANS_FB), cond: fontStack(b.fonts.display, COND_FB) },
    card,
    header: b.header,
    names: b.names,
    tickerStyle: b.ticker.style,
    tickerLabel: b.ticker.label,
    clock: b.clock,
    anim: b.anim,
    watermark: b.watermark,
    logo: logoSrc(b.logo),
    logo2: logoSrc(b.logo2),
    title: b.title,
  };
}

/* ─────────────────────────────── logodan palet ─────────────────────────────── */

/**
 * RGBA pikselleri (Uint8ClampedArray / dizi) → { primary, secondary, accent, text, background, panel }.
 * Saydam ve neredeyse beyaz / siyah pikseller "renk" sayılmaz; kovalara ayrılır (4 bit), doygunluk
 * ağırlıklı en çok görülen renk ana renk, tonu en uzak doygun renk vurgu olur. Renksiz logoda
 * (tek renk / siyah-beyaz) güvenli bir lacivert-altın paleti döner.
 */
export function paletteFromPixels(px) {
  const buckets = new Map();
  let neutralDark = 0; let neutralLight = 0;
  for (let i = 0; i + 3 < px.length; i += 4) {
    const a = px[i + 3];
    if (a < 128) continue;
    const r = px[i]; const g = px[i + 1]; const bl = px[i + 2];
    const [h, s, l] = rgbToHsl(r, g, bl);
    if (s < 0.18 || l < 0.08 || l > 0.94) { if (l < 0.5) neutralDark += 1; else neutralLight += 1; continue; }
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (bl >> 4);
    const e = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0, w: 0 };
    e.n += 1; e.r += r; e.g += g; e.b += bl; e.w += 0.4 + s;
    buckets.set(key, e);
  }
  const list = [...buckets.values()].filter((e) => e.n > 0).map((e) => {
    const hex = rgbToHex(e.r / e.n, e.g / e.n, e.b / e.n);
    const [h, s, l] = rgbToHsl(...hexToRgb(hex));
    return { hex, h, s, l, w: e.w };
  }).sort((a, b) => b.w - a.w);
  if (!list.length) {
    return { primary: "#1e3a8a", secondary: "#0b1533", accent: "#f5c542", text: "#0f172a", background: "#0b1533", panel: "#ffffff", source: "neutral", darkLogo: neutralDark >= neutralLight };
  }
  const main = list[0];
  const acc = list.slice(1).filter((c) => hueDist(c.h, main.h) > 40 && c.s > 0.3).sort((a, b) => b.w - a.w)[0]
    || { hex: hslToHex((main.h + 180) % 360, Math.max(0.6, main.s), 0.55) };
  // Ana renk çok açıksa başlık şeridi için koyulaştır (beyaz yazı okunsun).
  const primary = main.l > 0.55 ? hslToHex(main.h, main.s, 0.38) : main.hex;
  const background = hslToHex(main.h, Math.min(0.9, main.s), 0.1);
  const secondary = hslToHex(main.h, Math.min(0.9, main.s), 0.22);
  return { primary, secondary, accent: acc.hex, text: hslToHex(main.h, 0.45, 0.12), background, panel: "#ffffff", source: "logo" };
}

/* ─────────────────────────────── dışa / içe aktarma ─────────────────────────────── */

export const BRAND_FILE_FORMAT = "elitlig-panorama-brands";

/** Taşınabilir dosya: { format, version, exportedAt, brands, presets? }. Logolar gömülü (data:). */
export function exportBrands(brands, { presets = [] } = {}) {
  const list = (brands || []).filter((b) => b && !b.builtin).map((b) => {
    const n = normalizeBrand(b);
    // Yerel izin adresi başka bilgisayarda çalışmaz: dosyaya yalnız gömülü veri ve web adresi yazılır.
    const portable = (l) => (l ? { data: l.data || null, url: l.url && /^https?:/i.test(l.url) ? l.url : null, name: l.name || null } : null);
    return { ...n, logo: portable(n.logo), logo2: portable(n.logo2) };
  });
  return { format: BRAND_FILE_FORMAT, version: 1, exportedAt: new Date().toISOString(), brands: list, presets: Array.isArray(presets) ? presets : [] };
}

/**
 * İçe aktarılan dosya → { brands, presets, errors }. Aynı kimlikli profil varsa yeni kimlik verilir
 * (mevcut profil EZİLMEZ); hazır ayarların marka bağlantısı yeni kimliğe taşınır.
 */
export function parseBrandFile(text, existing = []) {
  let raw;
  try { raw = typeof text === "string" ? JSON.parse(text) : text; } catch { return { brands: [], presets: [], errors: ["Dosya JSON değil."] }; }
  if (!raw || typeof raw !== "object") return { brands: [], presets: [], errors: ["Dosya boş."] };
  const one = raw.format !== BRAND_FILE_FORMAT && raw.colors ? [raw] : null;
  if (!one && raw.format !== BRAND_FILE_FORMAT) return { brands: [], presets: [], errors: ["Bu bir Elitlig Panorama marka dosyası değil."] };
  const taken = new Set((existing || []).map((b) => b.id));
  const remap = new Map();
  const brands = (one || (Array.isArray(raw.brands) ? raw.brands : [])).slice(0, 60).map((b) => {
    const n = normalizeBrand({ ...b, builtin: false });
    delete n.builtin;
    if (taken.has(n.id) || /^th_/.test(n.id)) { const id = brandId(); remap.set(n.id, id); n.id = id; }
    taken.add(n.id);
    return n;
  });
  const presets = (Array.isArray(raw.presets) ? raw.presets : []).slice(0, 60).map((p) => (p && typeof p === "object" ? { ...p, brandId: remap.get(p.brandId) || p.brandId } : null)).filter(Boolean);
  return { brands, presets, errors: [] };
}

/* ─────────────────────────────── kayıt ─────────────────────────────── */

export const BRANDS_KEY = "studio.panorama.brands.v1";
export function loadBrands(storage) {
  try { const a = JSON.parse(storage?.getItem(BRANDS_KEY) || "[]"); return Array.isArray(a) ? a.map(normalizeBrand).filter((b) => !b.builtin).slice(0, 60) : []; } catch { return []; }
}
export function saveBrands(storage, list) {
  try { storage?.setItem(BRANDS_KEY, JSON.stringify((list || []).filter((b) => !b.builtin).slice(0, 60))); return true; } catch { return false; }
}

/** Web Panorama yayınının program kimliği (brand_style, theme, brand_title, brand_logo_url) → profil. */
const WEB_THEME_MAP = { mor: "mor", gece: "gece", vitrin: "vitrin", kagit: "kagit", lacivert: "lacivert" };
export function brandFromWebBroadcast(bc) {
  const st = bc?.brandStyle || {};
  const theme = WEB_THEME_MAP[bc?.theme] || "mor";
  const th = themeByKey(theme);
  const colors = { ...th.palette };
  if (normHex(st.primary)) { colors.primary = normHex(st.primary); colors.secondary = mix(colors.primary, "#000000", 0.5); }
  if (normHex(st.accent)) colors.accent = normHex(st.accent);
  if (normHex(st.background)) colors.background = normHex(st.background);
  if (st.surface === "dark") { colors.panel = mix(colors.background, "#ffffff", 0.06); colors.text = "#f5f5fa"; }
  if (st.surface === "light") { colors.panel = "#ffffff"; colors.text = mix(colors.primary, "#000000", 0.6); }
  const FONT = { inter: "Inter", montserrat: "Montserrat", poppins: "Poppins", barlow: "Barlow", "barlow-condensed": "Barlow Condensed", oswald: "Oswald", bebas: "Bebas Neue", anton: "Anton", teko: "Teko", rajdhani: "Rajdhani", exo: "Exo 2", saira: "Saira Condensed", "roboto-condensed": "Roboto Condensed", archivo: "Archivo Black", playfair: "Playfair Display" };
  const corners = { rounded: 26, soft: 12, sharp: 2 };
  return normalizeBrand({
    name: str(bc?.brandTitle || bc?.name || "Web Panorama", "", 60),
    theme,
    title: str(bc?.brandTitle || bc?.name || "", "", 60),
    colors,
    logo: bc?.brandLogoUrl ? { url: bc.brandLogoUrl, name: "web logo" } : null,
    fonts: { display: FONT[st.displayFont] || "", body: FONT[st.bodyFont] || "" },
    card: corners[st.corners] != null ? { radius: corners[st.corners] } : {},
    header: { tagline: st.tagline || "" },
    savedAt: Date.now(),
  });
}
