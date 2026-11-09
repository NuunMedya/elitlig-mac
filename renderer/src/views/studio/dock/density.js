// Yayın Stüdyosu — PANEL YOĞUNLUĞU (saf model + küçük depo; localStorage "studio.density.v1").
//
// Her panelin (Sahneler, Tekrar, VAR, Röportaj, Özet, LED, Reji, Ses, Yayın) kendi ayarı:
//   d       "sik" | "normal" | "genis"   boşluk / iç kenar / yazı boyu ve önerilen kart genişliği
//   card    kart / küçük resim / sütun genişliği (px; başlıktaki kaydırıcı)
//   splits  { [ayraç]: px }               iç bölümler arasındaki sürüklenebilir ayraçlar
//   bar     "top" | "bottom"              YAYIN eylem çubuğunun yeri (yapışkan)
//   cols    { n, w: [ağırlık…], at: { [bölüm]: sütun } }   SÜTUNLAR: panelin ana ızgarası n (1–8)
//           sütunda; sütun sınırları sürüklenerek genişlik (w: kesirli ağırlıklar, toplam n). Bölümlü
//           panellerde (Reji ev | orta | deplasman, Tekrar liste | önizleme) her bölümün sütunu
//           (0 = tam satır). Yoksa (oto) panelin kendi düzeni.
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

/* ───────── SÜTUNLAR (panel başına açık sütun sayısı ve genişlikleri) ───────── */
export const COLS_MIN = 1;
export const COLS_MAX = 8;
/** Bir sütunun en dar hâli (px; sürüklerken). */
export const COL_MIN_PX = 64;
/**
 * Panelin ana içerik ızgarası: adaylar sırayla denenir, çerçevede ilk bulunan uygulanır.
 * sections: sütunlara dağıtılan bölümler (id, ad, seçici, varsayılan sütun · 0 tam satır).
 */
export const PANEL_COLS = {
  sahne: { label: "Sahne kartları", targets: [{ sel: ".scn-grid:not(.is-list)" }] },
  tekrar: {
    label: "Pozisyonlar ve önizleme",
    targets: [
      { sel: ".rpx-body2", sections: [
        { id: "list", label: "Pozisyonlar", sel: ":scope > .rpx-poss", def: 1 },
        { id: "side", label: "Açılar / önizleme", sel: ":scope > .rpx-side", def: 2 },
      ] },
      { sel: ".rpx-poslist" },
    ],
  },
  var: { label: "VAR kartları", targets: [{ sel: ".md-var" }, { sel: ".st-var" }] },
  roportaj: { label: "Röportaj kartları", targets: [{ sel: ".md-iv" }, { sel: ".iv-flow" }] },
  ozet: { label: "Özet kartları", targets: [{ sel: ".st-hl" }, { sel: ".md-var" }] },
  led: { label: "LED kartları", targets: [{ sel: ".st-led" }] },
  ses: { label: "Kanal şeritleri", targets: [{ sel: ".mx-strips" }, { sel: ".mx-cards" }] },
  yayin: { label: "Yayın kartları", targets: [{ sel: ".st-bcast" }] },
  yonetimReji: { label: "Reji bölümleri", targets: [{ sel: ".rj", sections: REJI_SECTIONS() }] },
  yonetim: { label: "Maç yönetimi bölümleri", targets: [{ sel: ".rj", sections: REJI_SECTIONS() }, { sel: ".mg-split" }, { sel: ".mg-grid-auto" }, { sel: ".mg-scope" }] },
};
function REJI_SECTIONS() {
  return [
    { id: "home", label: "Ev sahibi", sel: ":scope > .rj-team.is-home", def: 1 },
    { id: "center", label: "Orta (skor, saat, olaylar)", sel: ":scope > .rj-center", def: 2 },
    { id: "away", label: "Deplasman", sel: ":scope > .rj-team.is-away", def: 3 },
    { id: "music", label: "Gol müziği", sel: ":scope > .rj-music", def: 0 },
  ];
}
/** Panelin bilinen bölümleri (tüm adaylardan, tekil). */
export const colSections = (panel) => {
  const out = [];
  for (const t of PANEL_COLS[panel]?.targets || []) for (const s of t.sections || []) if (!out.some((x) => x.id === s.id)) out.push(s);
  return out;
};

const r3 = (v) => Math.round(v * 1000) / 1000;
/** Ağırlıklar: n tane, her biri ≥ 0,05, toplam n (eşit dağıtım = hepsi 1). */
export function normalizeWeights(w, n) {
  const arr = Array.from({ length: n }, (_, i) => {
    const v = Number(Array.isArray(w) ? w[i] : NaN);
    return Number.isFinite(v) && v > 0 ? v : 1;
  });
  const sum = arr.reduce((a, b) => a + b, 0) || n;
  return arr.map((v) => r3(Math.max(0.05, (v / sum) * n)));
}
export function normalizeCols(panel, raw) {
  if (!raw || typeof raw !== "object") return null;
  const n = Math.round(Number(raw.n));
  if (!Number.isFinite(n) || n < COLS_MIN) return null;
  const nn = Math.min(COLS_MAX, n);
  const at = {};
  const known = colSections(panel);
  for (const s of known) {
    const v = raw.at && Object.prototype.hasOwnProperty.call(raw.at, s.id) ? Math.round(Number(raw.at[s.id])) : NaN;
    at[s.id] = Number.isFinite(v) ? Math.max(0, Math.min(nn, v)) : Math.min(nn, s.def ?? 1);
  }
  return { n: nn, w: normalizeWeights(raw.w, nn), at };
}
/** grid-template-columns: her sütun minmax(0, <ağırlık>fr) (taşma olmaz; en dar hâl sürüklerken korunur). */
export const colsTemplate = (cols) => (cols ? cols.w.map((v) => `minmax(0, ${r3(v)}fr)`).join(" ") : "");
/**
 * Sınır sürükleme (saf): i ile i+1 arasındaki sınır dx px kayar. W: sütunların toplam genişliği (px,
 * boşluklar hariç). Her iki sütun en az minPx (dar panelde W/n'nin altına iner).
 */
export function dragBoundary(w, i, dxPx, W, minPx = COL_MIN_PX) {
  const n = w.length;
  if (i < 0 || i >= n - 1 || !(W > 0)) return w;
  const px = w.map((v) => (v / n) * W);
  const lo = Math.min(minPx, W / n / 1.5);
  const pair = px[i] + px[i + 1];
  const a = Math.max(lo, Math.min(pair - lo, px[i] + dxPx));
  px[i] = a;
  px[i + 1] = pair - a;
  return normalizeWeights(px.map((p) => (p / W) * n), n);
}

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
  const out = { d, card, splits, bar: r.bar === "bottom" ? "bottom" : "top" };
  const cols = normalizeCols(panel, r.cols);
  if (cols) out.cols = cols;
  return out;
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
/** Sütun sayısı (0 / null: oto — panelin kendi düzeni). Var olan genişlikler korunur, yeni sütun 1. */
export const setColCount = (state, panel, n) => withPanel(state, panel, (p) => {
  const k = Math.round(Number(n));
  if (!k || k < COLS_MIN) { const { cols, ...rest } = p; return rest; } // eslint-disable-line no-unused-vars
  const prev = p.cols;
  const nn = Math.min(COLS_MAX, k);
  const w = Array.from({ length: nn }, (_, i) => prev?.w?.[i] ?? 1);
  const at = { ...(prev?.at || {}) };
  for (const s of colSections(panel)) at[s.id] = Math.min(nn, at[s.id] ?? Math.min(nn, s.def ?? 1));
  return { ...p, cols: { n: nn, w, at } };
});
export const setColWeights = (state, panel, w) => withPanel(state, panel, (p) => (p.cols ? { ...p, cols: { ...p.cols, w } } : p));
/** Eşit dağıt: bütün sütunlar aynı genişlik. */
export const equalCols = (state, panel) => withPanel(state, panel, (p) => (p.cols ? { ...p, cols: { ...p.cols, w: Array(p.cols.n).fill(1) } } : p));
/** Bölümün sütunu (0: tam satır). */
export const setColSection = (state, panel, id, col) => withPanel(state, panel, (p) => (p.cols ? { ...p, cols: { ...p.cols, at: { ...p.cols.at, [id]: Math.round(Number(col)) || 0 } } } : p));
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
  if (pd.cols) { out["--pf-cols"] = colsTemplate(pd.cols); out["--pf-ncols"] = String(pd.cols.n); }
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
