// Yayın Stüdyosu — VAR TEMALARI (saf kayıt): ad, açıklama, renk örnekleri, yerleşim ölçüleri.
//
// Her tema aynı içeriği çizer (açı pencereleri + çerçeve, VAR rozeti / başlık,
// İNCELEME › KONTROL › KARAR adımları, açı etiketleri, canlı karar bandı) ama
// kendi görsel diliyle. Çizim kodu views/studio/var/themes/ altında; burada
// yalnız veri (testlenebilir, tuval gerektirmez). Seçim prefs.modes.var.theme'de.
//
//   kirmizi   Kırmızı Alarm       nabızlı kırmızı ekran çerçevesi, yan raylar (ilk tasarım)
//   stadyum   Stadyum Broadcast   premium TV-spor: eğik bantlar, karbon doku, altın vurgu
//   minimal   Minimal Pro         ince çizgiler, buzlu cam kartlar, sakin tipografi
//   neon      Neon Arena          neon parıltı, perspektif ızgara, kayan tarama çizgileri
//   klasik    Klasik TV           kalın beyaz / siyah / kırmızı, dama desenli hakem şeridi

export const VAR_THEMES = [
  {
    key: "kirmizi", label: "Kırmızı Alarm", hint: "Nabızlı kırmızı çerçeve, yan raylar — dikkat çekici",
    swatch: ["#ff1f3d", "#2a0208", "#ffffff"], accent: "#ff1f3d",
    layout: { rail: 0.034, header: 0.085, footer: 0.1, vpad: 0.03, edge: 0.012, gap: 0.016 },
  },
  {
    key: "stadyum", label: "Stadyum Broadcast", hint: "Premium TV-spor görünümü: eğik bantlar, karbon doku, altın vurgu",
    swatch: ["#0b1630", "#f2b705", "#e3263a"], accent: "#f2b705",
    layout: { rail: 0, side: 0.032, header: 0.1, footer: 0.11, vpad: 0.032, edge: 0.008, gap: 0.016 },
  },
  {
    key: "minimal", label: "Minimal Pro", hint: "Temiz ince çizgiler, buzlu cam kartlar, yumuşak geçişler",
    swatch: ["#0f141c", "#e8eef6", "#5eead4"], accent: "#5eead4",
    layout: { rail: 0, side: 0.04, header: 0.075, footer: 0.085, vpad: 0.036, edge: 0.004, gap: 0.018 },
  },
  {
    key: "neon", label: "Neon Arena", hint: "Neon parıltı, perspektif ızgara, kayan tarama çizgileri",
    swatch: ["#07021a", "#22d3ee", "#ff2bd6"], accent: "#22d3ee",
    layout: { rail: 0, side: 0.036, header: 0.088, footer: 0.098, vpad: 0.032, edge: 0.008, gap: 0.02 },
  },
  {
    key: "klasik", label: "Klasik TV", hint: "Kalın beyaz / siyah / kırmızı, dama desenli hakem şeridi",
    swatch: ["#ffffff", "#111111", "#d90429"], accent: "#d90429",
    layout: { rail: 0.024, header: 0.092, footer: 0.1, vpad: 0.028, edge: 0.014, gap: 0.016 },
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
