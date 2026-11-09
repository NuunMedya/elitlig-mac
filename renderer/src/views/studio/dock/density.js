// Yayın Stüdyosu — PANEL YOĞUNLUĞU (saf model + küçük depo; localStorage "studio.density.v1").
//
// Her panelin (Sahneler, Tekrar, VAR, Röportaj, Özet, LED, Reji, Ses, Yayın) kendi ayarı:
//   d       "sik" | "normal" | "genis"   boşluk / iç kenar / yazı boyu ve önerilen kart genişliği
//   card    kart / küçük resim / sütun genişliği (px; başlıktaki kaydırıcı)
//   splits  { [ayraç]: px }               iç bölümler arasındaki sürüklenebilir ayraçlar
//   bar     "top" | "bottom"              YAYIN eylem çubuğunun yeri (yapışkan)
// Varsayılan "sik": aynı satıra daha çok bileşen sığar, önemli düğmeler alta inmez.
// Ayar şablonlarına (settings/profiles "density" grubu) girer.
export const DENSITY_KEY = "studio.density.v1";

export const DENSITIES = [
  { key: "sik", label: "Sık", hint: "Dar kartlar, az boşluk: satıra en çok bileşen" },
  { key: "normal", label: "Normal", hint: "Orta boy kartlar" },
  { key: "genis", label: "Geniş", hint: "Büyük kartlar ve küçük resimler" },
];
const FACTOR = { sik: 1, normal: 1.3, genis: 1.7 };
const SPACING = {
  sik: { gap: 6, pad: 6, fs: 0.94 },
  normal: { gap: 8, pad: 8, fs: 1 },
  genis: { gap: 12, pad: 12, fs: 1.06 },
};

/**
 * Panel başına kart ölçüsü: base = "Sık" genişliği (px), min / max kaydırıcı sınırları.
 * label: kaydırıcının adı (ne büyüyor).
 */
export const PANEL_CARDS = {
  sahne: { base: 148, min: 96, max: 340, label: "Sahne kartı" },
  tekrar: { base: 104, min: 64, max: 240, label: "Açı küçük resmi" },
  var: { base: 240, min: 180, max: 460, label: "Kart" },
  roportaj: { base: 240, min: 180, max: 460, label: "Kart" },
  ozet: { base: 240, min: 180, max: 460, label: "Kart" },
  led: { base: 250, min: 190, max: 480, label: "Kart" },
  yonetim: { base: 190, min: 150, max: 340, label: "Takım sütunu" },
  yonetimReji: { base: 190, min: 150, max: 340, label: "Takım sütunu" },
  ses: { base: 84, min: 64, max: 150, label: "Kanal şeridi" },
  yayin: { base: 260, min: 200, max: 480, label: "Kart" },
};
export const DENSITY_PANELS = Object.keys(PANEL_CARDS);

/** Sürüklenebilir ayraçlar: { min, max, def } (px; sağdaki / ikinci bölümün genişliği). */
export const SPLITS = {
  "sahne:edit": { min: 300, max: 1400, def: null, label: "Sahneler ↔ katman düzenleyici" },
  "tekrar:side": { min: 220, max: 900, def: null, label: "Pozisyonlar ↔ önizleme sütunu" },
  "mode:side": { min: 200, max: 520, def: 240, label: "Yayın kartı ↔ panel" },
};

const DEFAULT_D = "sik";
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const cardOf = (panel) => PANEL_CARDS[panel] || { base: 200, min: 120, max: 480, label: "Kart" };

/** Yoğunluk düzeyinin önerdiği kart genişliği. */
export function presetCard(panel, d) {
  const c = cardOf(panel);
  return clamp(Math.round(c.base * (FACTOR[d] || 1)), c.min, c.max);
}

export function clampSplit(id, px) {
  const s = SPLITS[id] || { min: 120, max: 2000 };
  return clamp(Math.round(px), s.min, s.max);
}

function normalizePanel(panel, raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const d = FACTOR[r.d] ? r.d : DEFAULT_D;
  const c = cardOf(panel);
  const card = num(r.card) != null ? clamp(Math.round(num(r.card)), c.min, c.max) : presetCard(panel, d);
  const splits = {};
  for (const [k, v] of Object.entries(r.splits && typeof r.splits === "object" ? r.splits : {})) {
    if (num(v) != null && SPLITS[k]) splits[k] = clampSplit(k, num(v));
  }
  return { d, card, splits, bar: r.bar === "bottom" ? "bottom" : "top" };
}

/** Depodaki ham değer → { v: 1, panels: { [panel]: {...} } } (bilinmeyenler atılır). */
export function normalizeDensity(raw) {
  let obj = raw;
  if (typeof raw === "string") { try { obj = JSON.parse(raw); } catch { obj = null; } }
  const panels = {};
  const src = obj && typeof obj === "object" && obj.panels && typeof obj.panels === "object" ? obj.panels : {};
  for (const [k, v] of Object.entries(src)) if (PANEL_CARDS[k]) panels[k] = normalizePanel(k, v);
  return { v: 1, panels };
}

/** Panelin geçerli ayarı (kayıtlı değilse varsayılan "Sık"). */
export const panelDensity = (state, panel) => state?.panels?.[panel] || normalizePanel(panel, null);

const withPanel = (state, panel, fn) => ({ v: 1, panels: { ...(state?.panels || {}), [panel]: normalizePanel(panel, fn(panelDensity(state, panel))) } });
/** Sık / Normal / Geniş: kart genişliği de o düzeyin önerisine döner. */
export const setDensityMode = (state, panel, d) => withPanel(state, panel, (p) => ({ ...p, d: FACTOR[d] ? d : p.d, card: presetCard(panel, FACTOR[d] ? d : p.d) }));
export const setCardWidth = (state, panel, px) => withPanel(state, panel, (p) => ({ ...p, card: px }));
/** px null: ayraç varsayılana döner (çift tık). */
export const setSplit = (state, panel, id, px) => withPanel(state, panel, (p) => {
  const splits = { ...p.splits };
  if (px == null) delete splits[id]; else splits[id] = clampSplit(id, px);
  return { ...p, splits };
});
export const setBarPos = (state, panel, bar) => withPanel(state, panel, (p) => ({ ...p, bar: bar === "bottom" ? "bottom" : "top" }));
export const resetPanel = (state, panel) => {
  const panels = { ...(state?.panels || {}) };
  delete panels[panel];
  return { v: 1, panels };
};

/** Panel çerçevesine yazılan CSS değişkenleri. */
export function densityVars(panel, pd) {
  const s = SPACING[pd.d] || SPACING.sik;
  const card = pd.card;
  const out = {
    "--card-w": `${card}px`,
    "--thumb-w": `${card}px`,
    "--strip-w": `${card}px`,
    "--dens-gap": `${s.gap}px`,
    "--dens-pad": `${s.pad}px`,
    "--dens-fs": String(s.fs),
  };
  for (const [k, v] of Object.entries(pd.splits || {})) out[`--split-${k.replace(/[^a-z0-9]+/gi, "-")}`] = `${v}px`;
  return out;
}

/* ───────── küçük depo (tüm panel çerçeveleri aynı durumu paylaşır) ───────── */
const storage = () => { try { return typeof localStorage !== "undefined" ? localStorage : null; } catch { return null; } };
let current = null;
const listeners = new Set();
export function loadDensity() {
  let raw = null;
  try { raw = storage()?.getItem(DENSITY_KEY) ?? null; } catch { raw = null; }
  current = normalizeDensity(raw);
  return current;
}
export const getDensity = () => current || loadDensity();
export function updateDensity(fn) {
  const next = fn(getDensity());
  if (next === current) return;
  current = next;
  try { storage()?.setItem(DENSITY_KEY, JSON.stringify(next)); } catch { /* yoksay */ }
  for (const l of [...listeners]) l();
}
export function subscribeDensity(l) {
  listeners.add(l);
  return () => listeners.delete(l);
}
/** Şablon uygulanınca (ya da başka pencere yazınca) depodan yeniden oku. */
export function reloadDensity() {
  loadDensity();
  for (const l of [...listeners]) l();
}
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => { if (e.key === DENSITY_KEY) reloadDensity(); });
}
