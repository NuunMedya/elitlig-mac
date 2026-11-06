// Yayın grafikleri · MARKA / TEMA (saf işlevler).
//
// Web live/overlayBranding.js ve sunucu constants/overlayBranding.js ile aynı
// biçim — maçın kaydı (GET/PUT /api/maclar/:id/overlay-branding):
//
//   { logoUrl, brandName,
//     scoreboard: { theme, baseColor, accentColor, font, logoScale },
//     led:        { theme, baseColor, accentColor, font, logoScale } }
//
// Masaüstü ekleri (`extras`) sunucunun maç kaydına yazılmaz (sunucu tanımadığı
// alanları atar); ön ayarlarla (preset) ve yerelde maç başına saklanır:
//
//   extras: { textColor, fontScale, logoPosition, homeColor, awayColor }
//
// TEMA: web kaplamaları gibi; 22 marka renginin her biri çapadan hedef renge
// ton (hue) ve doygunluk kaydırılarak yeniden hesaplanır, açıklık korunur —
// böylece "CCL CUP" (lacivert + altın) gibi bir temada tüm grafik aynı
// kontrastla yeniden boyanır.

export const DEFAULT_BRAND_NAME = "ELİT LİG";
export const LOGO_SCALE_MIN = 40;
export const LOGO_SCALE_MAX = 200;
export const FONT_SCALE_MIN = 80;
export const FONT_SCALE_MAX = 130;

const BASE_ANCHOR = "#300030";
const ACCENT_ANCHOR = "#54009c";

/** Kaplama CSS'lerindeki marka renkleri (web BRAND_COLORS ile birebir). */
export const BRAND_COLORS = Object.freeze([
  "09000a", "120012", "1a001a", "240024", "2a012a", "300030", "360a36",
  "3a0c3a", "3a0f3a", "3c0c3c", "3d0070", "4a184a", "54009c", "5f2a5f",
  "6d17bd", "7d4a7d", "8a3fe0", "a855f7", "a884ac", "c084fc", "c9b3cd",
  "d8bfff",
]);

export const OVERLAY_THEMES = Object.freeze([
  { key: "elitlig", label: "Elitlig Moru", base: BASE_ANCHOR, accent: ACCENT_ANCHOR },
  { key: "gece", label: "Gece Mavisi", base: "#001a3d", accent: "#0a6cff" },
  { key: "zumrut", label: "Zümrüt", base: "#00301c", accent: "#00a86b" },
  { key: "kizil", label: "Kızıl", base: "#30000a", accent: "#d4002a" },
  { key: "okyanus", label: "Okyanus", base: "#002a30", accent: "#00a3c4" },
  { key: "karbon", label: "Karbon", base: "#1e1e1e", accent: "#f5b301" },
  { key: "altin", label: "Altın", base: "#2e2100", accent: "#c99400" },
  { key: "custom", label: "Özel Renk", base: null, accent: null },
]);

export const OVERLAY_FONTS = Object.freeze([
  { key: "archivo", label: "Archivo", family: "Archivo" },
  { key: "montserrat", label: "Montserrat", family: "Montserrat" },
  { key: "oswald", label: "Oswald", family: "Oswald" },
  { key: "teko", label: "Teko", family: "Teko" },
  { key: "poppins", label: "Poppins", family: "Poppins" },
  { key: "space_grotesk", label: "Space Grotesk", family: "Space Grotesk" },
  { key: "inter", label: "Inter", family: "Inter" },
]);

export const LOGO_POSITIONS = Object.freeze([
  { key: "medal", label: "Ortada (madalya)" },
  { key: "left", label: "Solda" },
  { key: "off", label: "Gizli" },
]);

export const DEFAULT_SCREEN_DESIGN = Object.freeze({ theme: "elitlig", baseColor: null, accentColor: null, font: "archivo", logoScale: 100 });
export const DEFAULT_EXTRAS = Object.freeze({ textColor: "#ffffff", fontScale: 100, logoPosition: "medal", homeColor: null, awayColor: null });
export const DEFAULT_BRANDING = Object.freeze({
  logoUrl: null,
  brandName: null,
  scoreboard: DEFAULT_SCREEN_DESIGN,
  led: DEFAULT_SCREEN_DESIGN,
  extras: DEFAULT_EXTRAS,
});

/** Örnek turnuva teması: lacivert zemin, altın aksan, beyaz yazı. */
export const SAMPLE_CCL_CUP = Object.freeze({
  logoUrl: null,
  brandName: "CCL CUP",
  scoreboard: { theme: "custom", baseColor: "#0b1f4b", accentColor: "#f2b705", font: "inter", logoScale: 110 },
  led: { theme: "custom", baseColor: "#0b1f4b", accentColor: "#f2b705", font: "inter", logoScale: 110 },
  extras: { textColor: "#ffffff", fontScale: 100, logoPosition: "medal", homeColor: null, awayColor: null },
});

/* ---------------------------- renk yardımcıları ---------------------------- */

const HEX = /^#?([0-9a-f]{6})$/i;

export const parseHex = (value) => {
  const m = HEX.exec(String(value ?? "").trim());
  if (!m) return null;
  return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
};

export const normalizeColor = (value) => {
  const rgb = parseHex(value);
  return rgb ? toHex(rgb) : null;
};

export function rgbToHsl([r, g, b]) {
  const rn = r / 255; const gn = g / 255; const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return [h * 60, s, l];
}

export function hslToRgb([h, s, l]) {
  const hue = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;
  let rgb;
  if (hue < 60) rgb = [c, x, 0];
  else if (hue < 120) rgb = [x, c, 0];
  else if (hue < 180) rgb = [0, c, x];
  else if (hue < 240) rgb = [0, x, c];
  else if (hue < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  return rgb.map((v) => Math.round(Math.min(1, Math.max(0, v + m)) * 255));
}

export const toHex = (rgb) => `#${rgb.map((v) => v.toString(16).padStart(2, "0")).join("")}`;

/** "#rrggbb" + saydamlık → "rgba(r, g, b, a)". */
export function rgba(hex, alpha) {
  const rgb = parseHex(hex) || [255, 255, 255];
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
}

const isBaseFamily = (hsl) => hsl[0] >= 285;

function shiftColor(hex, anchor, target) {
  const source = rgbToHsl(parseHex(hex));
  const from = rgbToHsl(parseHex(anchor));
  const to = rgbToHsl(parseHex(target));
  const satFactor = from[1] > 0 ? to[1] / from[1] : 1;
  return hslToRgb([source[0] + (to[0] - from[0]), Math.min(1, Math.max(0, source[1] * satFactor)), source[2]]);
}

/** Ekran tasarımının hedef renkleri; Elitlig varsayılanında null (web ile aynı). */
export function resolveThemeColors(design) {
  const theme = OVERLAY_THEMES.find((t) => t.key === design?.theme);
  if (!theme || theme.key === "elitlig") return null;
  if (theme.key === "custom") {
    const base = parseHex(design?.baseColor) ? normalizeColor(design.baseColor) : BASE_ANCHOR;
    const accent = parseHex(design?.accentColor) ? normalizeColor(design.accentColor) : ACCENT_ANCHOR;
    if (base === BASE_ANCHOR && accent === ACCENT_ANCHOR) return null;
    return { base, accent };
  }
  return { base: theme.base, accent: theme.accent };
}

/** 22 marka renginin temaya göre hâli: { "1a001a": "#0a1630", … }. */
export function brandColorMap(design) {
  const colors = resolveThemeColors(design);
  const out = {};
  for (const hex of BRAND_COLORS) {
    if (!colors) { out[hex] = `#${hex}`; continue; }
    const hsl = rgbToHsl(parseHex(hex));
    out[hex] = toHex(isBaseFamily(hsl) ? shiftColor(hex, BASE_ANCHOR, colors.base) : shiftColor(hex, ACCENT_ANCHOR, colors.accent));
  }
  return out;
}

/**
 * Çizimde kullanılan adlı renkler (web SkorOverlay.css .so-root değişkenleri).
 */
export function resolvePalette(design) {
  const c = brandColorMap(design);
  return {
    ink: c["120012"], deep: c["09000a"],
    p900: c["1a001a"], p800: c["240024"], p700: c["300030"], p600: c["3c0c3c"], p500: c["4a184a"],
    p400: c["5f2a5f"], p300: c["7d4a7d"], p200: c["a884ac"], p100: c["c9b3cd"],
    v800: c["3d0070"], v700: c["54009c"], v600: c["6d17bd"], v500: c["8a3fe0"], v400: c["a855f7"], v300: c["c084fc"],
    lilac: c["d8bfff"],
    barTop: c["360a36"], barBottom: c["240024"],
    surfaceTop: c["3a0c3a"], surfaceMid: c["2a012a"], surfaceEnd: c["1a001a"],
    hair: rgba(c["d8bfff"], 0.14), hairSoft: rgba(c["d8bfff"], 0.08),
    live: "#ff2d55", amber: "#f5b301", red: "#e5484d", green: "#22c55e",
    homeBright: "#8a6cf0", awayBright: "#f06c8a",
  };
}

/* -------------------------------- normalize -------------------------------- */

const THEME_KEYS = new Set(OVERLAY_THEMES.map((t) => t.key));
const FONT_KEYS = new Set(OVERLAY_FONTS.map((f) => f.key));
const POSITION_KEYS = new Set(LOGO_POSITIONS.map((p) => p.key));

const clampInt = (value, min, max, fallback) => {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
export const normalizeLogoScale = (value, fallback = 100) => clampInt(value, LOGO_SCALE_MIN, LOGO_SCALE_MAX, fallback);

export function normalizeLogoUrl(value) {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text || text.length > 1000) return null;
  return /^https?:\/\/\S+$/i.test(text) ? text : null;
}

export function normalizeBrandName(value) {
  if (value == null) return null;
  const text = String(value).replace(/[\u0000-\u001f\u007f]/g, "").trim(); // eslint-disable-line no-control-regex
  return text ? text.slice(0, 40) : null;
}

/** Sunucu normalizeScreenDesign: gönderilmeyen (undefined) alan fallback'ten gelir. */
export function normalizeScreenDesign(input, fallback = DEFAULT_SCREEN_DESIGN) {
  const src = input && typeof input === "object" ? input : {};
  const fb = { ...DEFAULT_SCREEN_DESIGN, ...(fallback || {}) };
  return {
    theme: THEME_KEYS.has(src.theme) ? src.theme : THEME_KEYS.has(fb.theme) ? fb.theme : "elitlig",
    baseColor: src.baseColor === undefined ? normalizeColor(fb.baseColor) : normalizeColor(src.baseColor),
    accentColor: src.accentColor === undefined ? normalizeColor(fb.accentColor) : normalizeColor(src.accentColor),
    font: FONT_KEYS.has(src.font) ? src.font : FONT_KEYS.has(fb.font) ? fb.font : "archivo",
    logoScale: src.logoScale === undefined || src.logoScale === null ? normalizeLogoScale(fb.logoScale) : normalizeLogoScale(src.logoScale, normalizeLogoScale(fb.logoScale)),
  };
}

export function normalizeExtras(input, fallback = DEFAULT_EXTRAS) {
  const src = input && typeof input === "object" ? input : {};
  const fb = { ...DEFAULT_EXTRAS, ...(fallback || {}) };
  const pick = (key) => (src[key] === undefined ? fb[key] : src[key]);
  return {
    textColor: normalizeColor(pick("textColor")) || "#ffffff",
    fontScale: clampInt(pick("fontScale"), FONT_SCALE_MIN, FONT_SCALE_MAX, 100),
    logoPosition: POSITION_KEYS.has(pick("logoPosition")) ? pick("logoPosition") : "medal",
    homeColor: normalizeColor(pick("homeColor")),
    awayColor: normalizeColor(pick("awayColor")),
  };
}

/**
 * Tam, güvenli marka nesnesi. `fallback` verilirse eksik alanlar oradan gelir
 * (sunucu normalizeBranding ile aynı kısmi yama kuralı).
 */
export function normalizeBranding(input, fallback = DEFAULT_BRANDING) {
  const src = input && typeof input === "object" ? input : {};
  const fb = fallback && typeof fallback === "object" ? fallback : DEFAULT_BRANDING;
  return {
    logoUrl: src.logoUrl === undefined ? normalizeLogoUrl(fb.logoUrl) : normalizeLogoUrl(src.logoUrl),
    brandName: src.brandName === undefined ? normalizeBrandName(fb.brandName) : normalizeBrandName(src.brandName),
    scoreboard: normalizeScreenDesign(src.scoreboard, fb.scoreboard),
    led: normalizeScreenDesign(src.led, fb.led),
    extras: normalizeExtras(src.extras, fb.extras),
  };
}

/** PUT /api/maclar/:id/overlay-branding gövdesi (masaüstü ekleri hariç). */
export function serverBrandingBody(branding) {
  const b = normalizeBranding(branding);
  return { logoUrl: b.logoUrl, brandName: b.brandName, scoreboard: b.scoreboard, led: b.led };
}

/** Ön ayarı mevcut markanın üstüne uygular (ön ayarda olmayan alan korunur). */
export const mergePreset = (current, preset) => normalizeBranding(preset?.branding ?? preset, normalizeBranding(current));

/** İki marka aynı mı (kaydedilmemiş değişiklik denetimi). */
export const sameBranding = (a, b) => JSON.stringify(normalizeBranding(a)) === JSON.stringify(normalizeBranding(b));

/* ------------------------------ çizim için çözüm ------------------------------ */

const FONT_FALLBACK = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", Arial, sans-serif';

/**
 * Tuvalde kullanılacak marka: renkler, yazı ailesi, logo ölçeği.
 * screen: "scoreboard" (yayın grafikleri) | "led".
 */
export function resolveBranding(branding, { screen = "scoreboard", defaultLogo = null } = {}) {
  const b = normalizeBranding(branding);
  const design = b[screen] || b.scoreboard;
  const palette = resolvePalette(design);
  const colors = resolveThemeColors(design);
  const font = OVERLAY_FONTS.find((f) => f.key === design.font) || OVERLAY_FONTS[0];
  const extras = b.extras;
  if (extras.homeColor) palette.homeBright = extras.homeColor;
  if (extras.awayColor) palette.awayBright = extras.awayColor;
  return {
    key: JSON.stringify([b, screen, defaultLogo ? 1 : 0]),
    logoUrl: b.logoUrl || defaultLogo || null,
    customLogo: Boolean(b.logoUrl),
    brandName: b.brandName || DEFAULT_BRAND_NAME,
    logoScale: design.logoScale / 100,
    logoPosition: extras.logoPosition,
    fontKey: font.key,
    fontFamily: `"${font.family}", ${FONT_FALLBACK}`,
    fontScale: extras.fontScale / 100,
    theme: design.theme,
    primary: colors?.base || BASE_ANCHOR,
    secondary: palette.p900,
    accent: colors?.accent || ACCENT_ANCHOR,
    accentLight: palette.v400,
    text: extras.textColor,
    palette,
    raw: b,
  };
}

/** Önizleme kutucukları: zemin, yüzey, aksan, açık. */
export function themeSwatches(design) {
  const p = resolvePalette(design);
  return { deep: p.p900, base: p.p700, surface: p.p500, accent: p.v400, light: p.lilac };
}

/* ------------------------------- ön ayarlar ------------------------------- */

/** Sunucu / yerel ön ayar satırı → { id, name, branding, isDefault, updatedAt, local }. */
export function normalizePreset(row) {
  if (!row || row.id == null) return null;
  const name = String(row.name ?? row.title ?? "").trim().slice(0, 60);
  if (!name) return null;
  let branding = row.branding ?? row.settings ?? null;
  if (typeof branding === "string") { try { branding = JSON.parse(branding); } catch { branding = null; } }
  return {
    id: String(row.id),
    name,
    branding: normalizeBranding(branding),
    isDefault: Boolean(row.is_default ?? row.isDefault),
    updatedAt: row.updated_at ?? row.updatedAt ?? null,
    createdBy: row.created_by ?? row.createdBy ?? null,
    local: Boolean(row.local),
  };
}

export function normalizePresetList(payload) {
  const rows = Array.isArray(payload) ? payload : Array.isArray(payload?.presets) ? payload.presets : Array.isArray(payload?.items) ? payload.items : [];
  return rows.map(normalizePreset).filter(Boolean).sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name, "tr"));
}

export function validatePresetName(name, presets = [], exceptId = null) {
  const n = String(name || "").trim();
  if (!n) return "Ön ayar adı gir.";
  if (n.length > 60) return "Ad en çok 60 karakter.";
  const lower = n.toLocaleLowerCase("tr-TR");
  if (presets.some((p) => p.id !== exceptId && p.name.toLocaleLowerCase("tr-TR") === lower)) return "Bu adla bir ön ayar zaten var.";
  return "";
}

/** POST /api/overlay-branding/presets gövdesi. */
export const presetBody = (name, branding) => ({ name: String(name || "").trim().slice(0, 60), branding: normalizeBranding(branding) });
