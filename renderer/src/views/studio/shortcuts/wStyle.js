// Yayın Stüdyosu · DÜĞME RENGİ VE BİÇİMİ (saf). Pano parçacıkları (panel açma düğmeleri dahil
// tüm kısayol parçacıkları) bir renk ve biçimle boyanabilir:
//   renk   "theme" (tema vurgusu, temayla değişir) · "#rrggbb" (hazır paletten ya da serbest)
//   biçim  "fill" (dolu) · "outline" (çerçeve) · "soft" (yumuşak: renkli ton)
// Pano öğesinde: item.o.wc (renk) · item.o.ws (biçim). Grup varsayılanı: layout.wstyle[grup]
// (grup: railModel grup anahtarı — "panel", "go-mac", "reji" …). Öğe ayarı grubu ezer.
// Dolu biçimde yazı rengi rengin parlaklığına göre seçilir (beyaz ya da koyu; WCAG kontrastı).

export const WIDGET_COLORS = [
  ["#e11d48", "Kırmızı"], ["#ea580c", "Turuncu"], ["#d97706", "Kehribar"], ["#eab308", "Sarı"],
  ["#65a30d", "Yeşil-sarı"], ["#16a34a", "Yeşil"], ["#0d9488", "Turkuaz"], ["#0284c7", "Gök mavisi"],
  ["#2563eb", "Mavi"], ["#4f46e5", "Çivit"], ["#7c3aed", "Mor"], ["#c026d3", "Fuşya"],
  ["#db2777", "Pembe"], ["#64748b", "Arduvaz"],
];
export const WIDGET_STYLES = [["fill", "Dolu"], ["outline", "Çerçeve"], ["soft", "Yumuşak"]];
const HEX = /^#[0-9a-f]{6}$/i;
const STYLE_KEYS = new Set(WIDGET_STYLES.map(([k]) => k));

/** Renk değeri: "theme" | "#rrggbb" (küçük harf) | null (yok / geçersiz). */
export function normColor(c) {
  if (c === "theme") return "theme";
  return typeof c === "string" && HEX.test(c) ? c.toLowerCase() : null;
}
export const normStyle = (s) => (STYLE_KEYS.has(s) ? s : null);

/** { c, s } (her ikisi null olabilir). */
export function normalizeWStyle(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  return { c: normColor(r.c), s: normStyle(r.s) };
}

/** Grup varsayılanları: { [grup]: { c, s } } (boşlar atılır). */
export function normalizeGroupStyles(raw) {
  const out = {};
  for (const [g, v] of Object.entries(raw && typeof raw === "object" ? raw : {})) {
    if (!/^[\w-]{1,40}$/.test(g)) continue;
    const n = normalizeWStyle(v);
    if (n.c || n.s) out[g] = { ...(n.c ? { c: n.c } : {}), ...(n.s ? { s: n.s } : {}) };
  }
  return out;
}

/** Etkin biçim: öğe (o.wc / o.ws) ⟶ grup varsayılanı. Renk yoksa null (parçacığın kendi rengi). */
export function resolveWStyle(opts, group) {
  const o = opts || {};
  const g = normalizeWStyle(group);
  const c = normColor(o.wc) || g.c;
  const s = normStyle(o.ws) || g.s;
  if (!c && !s) return null;
  return { c: c || "theme", s: s || "soft" };
}

const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
export const luminance = (hex) => { const [r, g, b] = hexRgb(hex); return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); };
export const contrast = (a, b) => { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
export const ON_LIGHT = "#111111";
export const ON_DARK = "#ffffff";
/** Dolgu üstündeki yazı: beyaz ile koyudan kontrastı yüksek olan. */
export const textOn = (hex) => (contrast(hex, ON_DARK) >= contrast(hex, ON_LIGHT) ? ON_DARK : ON_LIGHT);

/** Kap özellikleri: { className, style } (CSS: wStyle.css). Biçim yoksa boş. */
export function wStyleAttrs(st) {
  if (!st) return { className: "", style: undefined };
  const className = `has-wc wc-${st.s}`;
  // --wc-tint-rgb: dolgunun üstündeki iç yüzeylerin tonu — yazının tersi (beyaz yazıda koyu, koyu yazıda açık ton)
  if (st.c === "theme") return { className: `${className} wc-theme`, style: { "--wc": "var(--acc)", "--wc-rgb": "var(--acc-rgb)", "--wc-on": "var(--on-strong)", "--wc-on-rgb": "var(--on-strong-rgb)", "--wc-tint-rgb": "0, 0, 0" } };
  const on = textOn(st.c);
  return { className, style: { "--wc": st.c, "--wc-rgb": hexRgb(st.c).join(", "), "--wc-on": on, "--wc-on-rgb": hexRgb(on).join(", "), "--wc-tint-rgb": on === ON_DARK ? "0, 0, 0" : "255, 255, 255" } };
}

/** Pano öğesinin grup anahtarı (railModel grubu) — bileşen kaydından. */
export const styleGroupOf = (railWidget) => railWidget?.group || null;
