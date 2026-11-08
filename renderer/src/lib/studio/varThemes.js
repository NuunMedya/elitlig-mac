// Yayın Stüdyosu — VAR TEMALARI (saf kayıt): ad, açıklama, renk örnekleri, yerleşim ölçüleri.
//
// Her tema aynı içeriği çizer (açı pencereleri + ince çerçeve, VAR rozeti / konu,
// İNCELEME › KONTROL › KARAR adım çubukları, zaman kodu, açı etiketleri, karar
// kartı) — ortak motorla (views/studio/var/themes/engine.js), yalnız renk ve
// karakter değişir: ciddi, sade, net. Burada yalnız veri (testlenebilir, tuval
// gerektirmez). Seçim prefs.modes.var.theme'de. Anahtarlar kalıcıdır (kayıtlı
// tercihler bozulmasın).
//
//   kirmizi   Kırmızı Alarm   grafit zemin, ince kırmızı ekran çerçevesi, yavaş nabız
//   stadyum   Stadyum         lacivert, altın vurgu, dolu üst bant
//   minimal   Minimal Pro     grafit, yalnız ince çizgiler, beyaz vurgu
//   neon      Neon Arena      koyu mor, camgöbeği ince parıltılı çizgiler, silik ızgara
//   klasik    Klasik TV       siyah sahne, beyaz üst bant, kırmızı aksan, beyaz karar kartı
//   gece      Gece Mavisi     derin lacivert, buz mavisi çizgiler (yeni)
//   beyaz     Stüdyo Beyaz    açık zemin, siyah tipografi, kırmızı aksan (yeni)

// Ortak ölçüler: raysız, ince bantlar, geniş sahne.
const LAYOUT = Object.freeze({ rail: 0, side: 0.034, header: 0.082, footer: 0.084, vpad: 0.03, edge: 0.004, gap: 0.014 });

export const VAR_THEMES = [
  {
    key: "kirmizi", label: "Kırmızı Alarm", hint: "Grafit zemin, ince kırmızı ekran çerçevesi ve yavaş nabız",
    swatch: ["#0e0d0f", "#ff2d3d", "#f3f5f8"], accent: "#ff2d3d",
    layout: { ...LAYOUT, side: 0.04 },
  },
  {
    key: "stadyum", label: "Stadyum", hint: "Lacivert yayın görünümü, altın vurgu, dolu üst bant",
    swatch: ["#0b1527", "#e3b65c", "#f4f1ea"], accent: "#e3b65c",
    layout: { ...LAYOUT },
  },
  {
    key: "minimal", label: "Minimal Pro", hint: "Grafit zemin, yalnız ince çizgiler ve beyaz vurgu",
    swatch: ["#131416", "#f5f6f7", "#4ade80"], accent: "#f5f6f7",
    layout: { ...LAYOUT, gap: 0.016 },
  },
  {
    key: "neon", label: "Neon Arena", hint: "Koyu mor zemin, camgöbeği ince parıltılı çizgiler",
    swatch: ["#0a0716", "#3ee6ff", "#7c3aed"], accent: "#3ee6ff",
    layout: { ...LAYOUT, side: 0.04 },
  },
  {
    key: "klasik", label: "Klasik TV", hint: "Siyah sahne, beyaz üst bant, kırmızı aksan",
    swatch: ["#f4f4f2", "#111111", "#e5242f"], accent: "#e5242f",
    layout: { ...LAYOUT },
  },
  {
    key: "gece", label: "Gece Mavisi", hint: "Derin lacivert, buz mavisi ince çizgiler — sakin ve soğuk",
    swatch: ["#0a1020", "#8ab4ff", "#eaf1ff"], accent: "#8ab4ff",
    layout: { ...LAYOUT, side: 0.04 },
  },
  {
    key: "beyaz", label: "Stüdyo Beyaz", hint: "Açık zemin, siyah tipografi, kırmızı aksan — gündüz yayını",
    swatch: ["#eceef1", "#0e1013", "#e5242f"], accent: "#e5242f",
    layout: { ...LAYOUT, gap: 0.016 },
  },
];

export const DEFAULT_VAR_THEME = "kirmizi";
export const VAR_THEME_KEYS = VAR_THEMES.map((t) => t.key);
export const varThemeOf = (key) => VAR_THEMES.find((t) => t.key === key) || VAR_THEMES[0];
export const normalizeVarTheme = (key) => varThemeOf(key).key;
/** Stüdyo tercihlerinden seçili tema (prefs.modes.var.theme; eski düzende prefs.var.theme). */
export const varThemeFromPrefs = (prefs) => normalizeVarTheme(prefs?.modes?.var?.theme ?? prefs?.var?.theme);
/** prefs.modes'a tema yazar (VAR ayarlarının geri kalanı korunur). */
export const withVarTheme = (modes, key) => {
  const m = modes && typeof modes === "object" ? modes : {};
  const v = m.var && typeof m.var === "object" ? m.var : {};
  return { ...m, var: { ...v, theme: normalizeVarTheme(key) } };
};
/** Sıradaki tema (hızlı geçiş). */
export const nextVarTheme = (key, dir = 1) => {
  const i = VAR_THEME_KEYS.indexOf(normalizeVarTheme(key));
  return VAR_THEME_KEYS[(i + dir + VAR_THEME_KEYS.length) % VAR_THEME_KEYS.length];
};
