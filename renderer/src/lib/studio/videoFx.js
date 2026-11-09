// Yayın Stüdyosu — GÖRÜNTÜ / EFEKT ayarları (saf model, DOM yok).
//
// Kaynağın (source.fx) ve isteğe bağlı olarak katmanın (layer.fx: kaynağın ayarı
// yerine bu katmana özel) görüntü ayarları. Kayda yalnız varsayılandan farklı alanlar
// yazılır (compactFx); çizimde resolveFx ile tam nesneye açılır.
//
//   brightness  parlaklık        -100…100 (0)   ekleme (kaldırma / bastırma)
//   contrast    kontrast         -100…100 (0)
//   saturation  doygunluk        -100…100 (0)   -100 = gri
//   hue         ton (renk çarkı) -180…180° (0)
//   gamma       gama             0,3…3 (1)      >1 orta tonları aydınlatır
//   exposure    pozlama          -2…2 EV (0)
//   temperature sıcaklık         -100…100 (0)   + sıcak (sarı), − soğuk (mavi)
//   tint        renk tonu        -100…100 (0)   + macenta, − yeşil
//   vibrance    canlılık         -100…100 (0)   az doygun renkleri artırır, cilt tonunu korur
//   shadows     gölgeler         -100…100 (0)   + gölgeleri açar (siyah siyah kalır)
//   highlights  parlak alanlar   -100…100 (0)   − kurtarır (yumuşak omuz: patlamaz), + açar
//   fade        mat              0…100 (0)      siyahı kaldırır, beyazı hafif indirir (film)
//   denoise     gürültü azaltma  0…100 (0)      kenar koruyan yumuşatma (yalnız WebGL)
//   sharpen     keskinlik        0…100 (0)
//   blur        bulanıklık       0…40 px (1080p'ye göre)
//   mono        "none" | "bw" (siyah-beyaz) | "sepia"
//   invert      negatif          false
//   vignette    kenar karartma   0…100 (0)
//   flipH/flipV yatay / dikey çevir
//   rotate      0 | 90 | 180 | 270 (saat yönünde)
//   chroma      { on, color, similarity 1…100 (40), smoothness 1…100 (8), spill 1…100 (10) }
//               yeşil perde (OBS'teki gibi CbCr uzaklığı)
//
// İşleme sırası (gölgelendirici ve CPU başvuru işlevi aynı): (gürültü azaltma) → kroma
// anahtarı (özgün renk) → kazançlar (pozlama · sıcaklık · renk tonu) → gama → gölgeler →
// kontrast / parlaklık / doygunluk / ton / tek renk (3×3 dönüşüm + öteleme) → canlılık →
// parlak alanlar (yumuşak omuz: kontrasttan SONRA, patlama olmasın) → mat → negatif →
// kenar karartma → (ton etkinse) rengi koruyan
// yumuşak kırpma: 1'i aşan renk tonunu bozmadan beyaza yaklaştırılır (kanal patlaması yok).
//
// Eski kayıt: kameranın "mirror" (ayna) alanı fx.flipH'ye taşınır (migrateSourceFx).

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
const HEX6 = /^#[0-9a-f]{6}$/i;

export const MONO = [
  { key: "none", label: "Yok" },
  { key: "bw", label: "Siyah-beyaz" },
  { key: "sepia", label: "Sepya" },
];
const MONO_KEYS = new Set(MONO.map((m) => m.key));
const ROTATIONS = [0, 90, 180, 270];

export const CHROMA_DEFAULTS = Object.freeze({ on: false, color: "#00ff00", similarity: 40, smoothness: 8, spill: 10 });

export const FX_DEFAULTS = Object.freeze({
  brightness: 0, contrast: 0, saturation: 0, hue: 0, gamma: 1, exposure: 0,
  temperature: 0, tint: 0, sharpen: 0, blur: 0, mono: "none", invert: false, vignette: 0,
  vibrance: 0, shadows: 0, highlights: 0, fade: 0, denoise: 0,
  flipH: false, flipV: false, rotate: 0, chroma: CHROMA_DEFAULTS,
});

/** Kaydırıcı tanımları (arayüz ve doğrulama ortak). */
export const FX_SLIDERS = [
  { key: "brightness", label: "Parlaklık", min: -100, max: 100, step: 1, group: "renk" },
  { key: "contrast", label: "Kontrast", min: -100, max: 100, step: 1, group: "renk" },
  { key: "saturation", label: "Doygunluk", min: -100, max: 100, step: 1, group: "renk" },
  { key: "vibrance", label: "Canlılık", min: -100, max: 100, step: 1, group: "renk", hint: "soluk renkleri artırır, cildi korur" },
  { key: "hue", label: "Ton", min: -180, max: 180, step: 1, suffix: "°", group: "renk" },
  { key: "exposure", label: "Pozlama", min: -2, max: 2, step: 0.05, suffix: " EV", group: "isik" },
  { key: "gamma", label: "Gama", min: 0.3, max: 3, step: 0.05, group: "isik" },
  { key: "temperature", label: "Sıcaklık", min: -100, max: 100, step: 1, group: "isik", hint: "+ sıcak · − soğuk" },
  { key: "tint", label: "Renk tonu", min: -100, max: 100, step: 1, group: "isik", hint: "+ macenta · − yeşil" },
  { key: "highlights", label: "Parlak alanlar", min: -100, max: 100, step: 1, group: "isik", hint: "− kurtar (patlamayı önle) · + aç" },
  { key: "shadows", label: "Gölgeler", min: -100, max: 100, step: 1, group: "isik", hint: "+ gölgeleri aç · − koyulaştır" },
  { key: "fade", label: "Mat (film)", min: 0, max: 100, step: 1, group: "isik", hint: "siyahı kaldırır" },
  { key: "denoise", label: "Gürültü azaltma", min: 0, max: 100, step: 1, group: "detay", hint: "düşük ışıkta karıncalanmayı yumuşatır" },
  { key: "sharpen", label: "Keskinlik", min: 0, max: 100, step: 1, group: "detay" },
  { key: "blur", label: "Bulanıklık", min: 0, max: 40, step: 0.5, suffix: " px", group: "detay" },
  { key: "vignette", label: "Kenar karartma", min: 0, max: 100, step: 1, group: "detay" },
];
const SLIDER = new Map(FX_SLIDERS.map((s) => [s.key, s]));
export const CHROMA_SLIDERS = [
  { key: "similarity", label: "Benzerlik", min: 1, max: 100, step: 1 },
  { key: "smoothness", label: "Yumuşaklık", min: 1, max: 100, step: 1 },
  { key: "spill", label: "Taşma azaltma", min: 1, max: 100, step: 1 },
];
const CHROMA_SLIDER = new Map(CHROMA_SLIDERS.map((s) => [s.key, s]));

/** Kayıtlı (eksik / bozuk olabilir) değerden tam ayar nesnesi. */
export function resolveFx(fx) {
  const f = fx && typeof fx === "object" ? fx : {};
  const out = {};
  for (const s of FX_SLIDERS) out[s.key] = clamp(num(f[s.key], FX_DEFAULTS[s.key]), s.min, s.max);
  out.mono = MONO_KEYS.has(f.mono) ? f.mono : "none";
  out.invert = f.invert === true;
  out.flipH = f.flipH === true;
  out.flipV = f.flipV === true;
  const r = ((Math.round(num(f.rotate, 0) / 90) * 90) % 360 + 360) % 360;
  out.rotate = ROTATIONS.includes(r) ? r : 0;
  const c = f.chroma && typeof f.chroma === "object" ? f.chroma : {};
  out.chroma = {
    on: c.on === true,
    color: typeof c.color === "string" && HEX6.test(c.color) ? c.color.toLowerCase() : CHROMA_DEFAULTS.color,
  };
  for (const s of CHROMA_SLIDERS) out.chroma[s.key] = clamp(num(c[s.key], CHROMA_DEFAULTS[s.key]), s.min, s.max);
  return out;
}

const near = (a, b) => Math.abs(a - b) < 1e-9;

/** Yalnız varsayılandan farklı alanlar (kayıt için); hepsi varsayılansa null. */
export function compactFx(fx) {
  if (!fx || typeof fx !== "object") return null;
  const f = resolveFx(fx);
  const out = {};
  for (const s of FX_SLIDERS) if (!near(f[s.key], FX_DEFAULTS[s.key])) out[s.key] = Math.round(f[s.key] * 1000) / 1000;
  if (f.mono !== "none") out.mono = f.mono;
  if (f.invert) out.invert = true;
  if (f.flipH) out.flipH = true;
  if (f.flipV) out.flipV = true;
  if (f.rotate) out.rotate = f.rotate;
  const c = f.chroma;
  const cd = CHROMA_DEFAULTS;
  // Kroma kapalıyken de seçilen renk / eşikler saklanır (yeniden açınca kaybolmasın).
  if (c.on || c.color !== cd.color || CHROMA_SLIDERS.some((s) => !near(c[s.key], cd[s.key]))) {
    out.chroma = { on: c.on, color: c.color, similarity: c.similarity, smoothness: c.smoothness, spill: c.spill };
  }
  return Object.keys(out).length ? out : null;
}

/** Görüntüyü değiştiren bir ayar var mı (kapalı kroma rengi sayılmaz). */
export function fxActive(fx) {
  if (!fx) return false;
  const f = resolveFx(fx);
  return FX_SLIDERS.some((s) => !near(f[s.key], FX_DEFAULTS[s.key])) || f.mono !== "none" || f.invert || f.flipH || f.flipV || f.rotate !== 0 || f.chroma.on;
}

/** Değer biçimi (kaydırıcı etiketi). */
export function fxValueLabel(key, v) {
  const s = SLIDER.get(key) || CHROMA_SLIDER.get(key);
  if (!s) return String(v);
  const n = s.step < 1 ? Number(v).toFixed(2) : String(Math.round(v));
  return `${key === "exposure" && v > 0 ? "+" : ""}${n}${s.suffix || ""}`;
}

/* ------------------------------ hazır ayarlar ------------------------------ */

export const FX_PRESETS = [
  { id: "natural", name: "Doğal", fx: {} },
  { id: "vivid", name: "Canlı", fx: { contrast: 12, saturation: 32, brightness: 2, sharpen: 18 } },
  { id: "cinema", name: "Sinematik", fx: { contrast: 18, saturation: -18, temperature: 10, tint: -4, gamma: 0.92, vignette: 35 } },
  { id: "warm", name: "Sıcak", fx: { temperature: 38, tint: 4, saturation: 8 } },
  { id: "cool", name: "Soğuk", fx: { temperature: -38, tint: -2, saturation: 4 } },
  { id: "night", name: "Gece sahası (aydınlat)", fx: { exposure: 0.6, gamma: 1.35, brightness: 4, contrast: 8, saturation: 12, sharpen: 12 } },
  { id: "bw", name: "Siyah-beyaz", fx: { mono: "bw", contrast: 14 } },
  { id: "punch", name: "Yüksek kontrast", fx: { contrast: 45, saturation: 12, sharpen: 20 } },
  // ── yayın görünümleri (profesyonel; kırpma yok, cilt tonu korunur) ──
  // Hepsi: parlak alanlar biraz kurtarılır (yumuşak omuz), doygunluk yerine çoğunlukla
  // CANLILIK (cilt korumalı) kullanılır; keskinlik ölçülü (yayın kodlayıcısı zaten keskinleştirir).
  { id: "rec709", group: "yayin", name: "Yayın standardı (Rec.709 nötr)", fx: { contrast: 6, highlights: -18, shadows: 8, vibrance: 8, sharpen: 10 } },
  { id: "nightMatch", group: "yayin", name: "Gece maçı (projektör ışığı düzelt)", fx: { exposure: 0.2, temperature: -20, tint: 10, highlights: -40, shadows: 30, contrast: 4, vibrance: 14, denoise: 28, sharpen: 6 } },
  { id: "sunnyDay", group: "yayin", name: "Gündüz güneşli (highlight kurtar)", fx: { highlights: -60, shadows: 26, contrast: 2, temperature: -4, vibrance: 10, sharpen: 8 } },
  { id: "grassVivid", group: "yayin", name: "Çim yeşili canlı", fx: { vibrance: 26, tint: -3, contrast: 6, highlights: -18, shadows: 6, sharpen: 10 } },
  { id: "warmCine", group: "yayin", name: "Sıcak sinematik", fx: { temperature: 18, tint: 3, contrast: 14, highlights: -28, shadows: -6, saturation: -8, vibrance: 4, fade: 8, vignette: 22 } },
  { id: "coolModern", group: "yayin", name: "Soğuk modern", fx: { temperature: -16, tint: -2, contrast: 10, highlights: -24, shadows: 4, saturation: -8, vibrance: 8, sharpen: 12 } },
  { id: "lowLight", group: "yayin", name: "Düşük ışık gürültü azalt", fx: { exposure: 0.35, shadows: 34, highlights: -24, contrast: 4, saturation: -8, vibrance: 6, denoise: 62 } },
  { id: "sportPunch", group: "yayin", name: "Yüksek kontrast spor", fx: { contrast: 22, highlights: -34, shadows: 12, vibrance: 15, sharpen: 20 } },
  { id: "matteFilm", group: "yayin", name: "Mat film", fx: { contrast: 12, fade: 45, saturation: -14, highlights: -22, temperature: 6, vignette: 14 } },
  { id: "skinNatural", group: "yayin", name: "Canlı ama doğal cilt", fx: { vibrance: 30, saturation: -4, highlights: -16, shadows: 8, temperature: 4, contrast: 6 } },
];

/**
 * Hazır ayarı uygular: renk / ışık / detay alanları hazır ayarınkine döner, yön
 * (çevir / döndür) ve kroma anahtarı KORUNUR (kamera ayarıdır, görünüm değil).
 */
export function applyPreset(fx, preset) {
  const cur = resolveFx(fx);
  const p = resolveFx(preset?.fx || {});
  return compactFx({ ...p, flipH: cur.flipH, flipV: cur.flipV, rotate: cur.rotate, chroma: cur.chroma });
}

/** Sıfırla: görünüm alanları varsayılana; yön ve kroma isteğe bağlı korunur. */
export function resetFx(fx, { keepOrientation = true, keepChroma = false } = {}) {
  const cur = resolveFx(fx);
  return compactFx({
    ...(keepOrientation ? { flipH: cur.flipH, flipV: cur.flipV, rotate: cur.rotate } : {}),
    ...(keepChroma ? { chroma: cur.chroma } : { chroma: { ...cur.chroma, on: false } }),
  });
}

/** Ayarın görünüm alanları hazır ayarla aynı mı (seçili hazır ayarı vurgulamak için). */
export function presetMatches(fx, preset) {
  const a = applyPreset(fx, preset);
  const b = compactFx(fx);
  return JSON.stringify(a) === JSON.stringify(b);
}

/* ------------------------------ özel hazır ayarlar ------------------------------ */

export const CUSTOM_PRESETS_KEY = "studio.fxPresets.v1";

/** Kayıtlı özel hazır ayarları okur (bozuk kayıt → boş). */
export function loadCustomPresets(storage) {
  try {
    const raw = JSON.parse(storage?.getItem(CUSTOM_PRESETS_KEY) || "[]");
    return normalizeCustomPresets(raw);
  } catch { return []; }
}
export function normalizeCustomPresets(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((p) => p && typeof p.id === "string" && typeof p.name === "string" && p.name.trim())
    .slice(0, 40)
    .map((p) => ({ id: p.id, name: p.name.trim().slice(0, 40), fx: compactFx(p.fx) || {}, custom: true }));
}
export function saveCustomPresets(storage, list) {
  try { storage?.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(normalizeCustomPresets(list))); return true; } catch { return false; }
}
/** Özel hazır ayar ekler (aynı adlı varsa üzerine yazar). Yön ve kroma hazır ayara girmez. */
export function addCustomPreset(list, name, fx) {
  const n = String(name || "").trim().slice(0, 40);
  if (!n) return list;
  const cur = resolveFx(fx);
  const look = compactFx({ ...cur, flipH: false, flipV: false, rotate: 0, chroma: { ...cur.chroma, on: false } }) || {};
  const rest = (list || []).filter((p) => p.name.toLowerCase() !== n.toLowerCase());
  return [...rest, { id: `fxp_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, name: n, fx: look, custom: true }];
}
export const removeCustomPreset = (list, id) => (list || []).filter((p) => p.id !== id);

/* ------------------------------ kaynak / katman ------------------------------ */

/** Eski kayıt göçü + temizlik: "mirror" → fx.flipH; fx yalnız farklı alanlar. */
export function migrateSourceFx(source) {
  if (!source || typeof source !== "object") return source;
  const { mirror, fx, ...rest } = source;
  const base = fx && typeof fx === "object" ? fx : {};
  const merged = mirror === true && base.flipH !== true ? { ...base, flipH: true } : base;
  const c = compactFx(merged);
  return c ? { ...rest, fx: c } : rest;
}

/** Katmanın fx'i: { ...ayarlar } (kaynağın ayarı yerine) ya da yok. */
export function normalizeLayerFx(fx) {
  if (!fx || typeof fx !== "object") return null;
  // Katmana özel ayar "tümü varsayılan" olsa da anlamlıdır (kaynağın efektini kapatır).
  return compactFx(fx) || {};
}

/**
 * Çizimde geçerli ayar: katmana özel varsa o, yoksa kaynağınki. Eski "mirror"
 * (normalize edilmemiş kaynak) yatay çevirmeyle birleşir. Etkin değilse null.
 */
const activeCache = new WeakMap(); // fx nesnesi → etkin mi (kare başına yeniden hesaplanmasın)
const mirrorCache = new WeakMap(); // normalize edilmemiş kaynak → mirror birleşik fx
const activeCached = (fx) => {
  let v = activeCache.get(fx);
  if (v === undefined) { v = fxActive(fx); activeCache.set(fx, v); }
  return v;
};
export function effectiveFx(source, layer) {
  const own = layer && layer.fx && typeof layer.fx === "object" ? layer.fx : null;
  let fx = own || (source?.fx && typeof source.fx === "object" ? source.fx : null);
  if (!own && source?.mirror === true) {
    let m = mirrorCache.get(source);
    if (!m) { m = { ...(fx || {}), flipH: fx?.flipH !== true }; mirrorCache.set(source, m); }
    fx = m;
  }
  return fx && activeCached(fx) ? fx : null;
}

/**
 * Yalnız çevirme (yatay / dikey) mi: { flipH, flipV } — çizim bunu ucuz 2D dönüşümle
 * yapar (WebGL geçişi gerekmez). Başka ayar varsa null.
 */
const orientCache = new WeakMap();
export function fxOrientOnly(fx) {
  if (!fx) return null;
  let v = orientCache.get(fx);
  if (v === undefined) {
    const f = resolveFx(fx);
    const other = FX_SLIDERS.some((s) => !near(f[s.key], FX_DEFAULTS[s.key])) || f.mono !== "none" || f.invert || f.rotate !== 0 || f.chroma.on;
    v = !other && (f.flipH || f.flipV) ? { flipH: f.flipH, flipV: f.flipV } : null;
    orientCache.set(fx, v);
  }
  return v;
}

/** Ayarın kararlı anahtarı (önbellek). */
const keyCache = new WeakMap();
export function fxKey(fx) {
  if (!fx) return "";
  let k = keyCache.get(fx);
  if (k == null) { k = JSON.stringify(compactFx(fx) || {}); keyCache.set(fx, k); }
  return k;
}

/* ------------------------------ renk matematiği ------------------------------ */

const LUMA = [0.2126, 0.7152, 0.0722];

const mul3 = (a, b) => {
  const o = new Array(9).fill(0);
  for (let r = 0; r < 3; r += 1) for (let c = 0; c < 3; c += 1) for (let k = 0; k < 3; k += 1) o[r * 3 + c] += a[r * 3 + k] * b[k * 3 + c];
  return o;
};
const mulVec = (m, v) => [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];

/** Doygunluk matrisi (s = 1 değişmez, 0 gri). */
export function saturationMatrix(s) {
  const [lr, lg, lb] = LUMA;
  const i = 1 - s;
  return [lr * i + s, lg * i, lb * i, lr * i, lg * i + s, lb * i, lr * i, lg * i, lb * i + s];
}
/** Ton döndürme (CSS hue-rotate / feColorMatrix ile aynı). */
export function hueMatrix(deg) {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a); const s = Math.sin(a);
  return [
    0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928,
    0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.140, 0.072 - c * 0.072 - s * 0.283,
    0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072,
  ];
}
const SEPIA = [0.393, 0.769, 0.189, 0.349, 0.686, 0.168, 0.272, 0.534, 0.131];
const BW = [LUMA[0], LUMA[1], LUMA[2], LUMA[0], LUMA[1], LUMA[2], LUMA[0], LUMA[1], LUMA[2]];

/**
 * Gölgelendirici değişmezleri: kazanç (rgb çarpanı), 1/gama, 3×3 matris (satır
 * sıralı) ve öteleme: renk = M · rgb + offset. Saf; birim testlerinin konusu.
 */
export function fxUniforms(fxIn) {
  const f = resolveFx(fxIn);
  const ev = 2 ** f.exposure;
  const t = f.temperature / 100;
  const g = f.tint / 100;
  const gains = [ev * (1 + 0.22 * t) * (1 + 0.08 * g), ev * (1 - 0.16 * g) * (1 + 0.02 * t), ev * (1 - 0.22 * t) * (1 + 0.08 * g)];
  const k = f.contrast >= 0 ? 1 + (f.contrast / 100) * 1.2 : 1 + f.contrast / 100 * 0.85;
  const b = (f.brightness / 100) * 0.35;
  // kontrast: (x − 0,5)·k + 0,5 + b  → M = k·I, offset = 0,5(1 − k) + b
  let M = [k, 0, 0, 0, k, 0, 0, 0, k];
  M = mul3(saturationMatrix(1 + f.saturation / 100), M);
  if (f.hue) M = mul3(hueMatrix(f.hue), M);
  let off = [0.5 * (1 - k) + b, 0.5 * (1 - k) + b, 0.5 * (1 - k) + b];
  off = mulVec(saturationMatrix(1 + f.saturation / 100), off);
  if (f.hue) off = mulVec(hueMatrix(f.hue), off);
  if (f.mono !== "none") { const T = f.mono === "sepia" ? SEPIA : BW; M = mul3(T, M); off = mulVec(T, off); }
  const hex = f.chroma.color;
  const key = [parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255];
  return {
    gains,
    // ton (gölgeler / parlak alanlar), canlılık, mat, gürültü azaltma (−1…1 / 0…1)
    shadows: f.shadows / 100,
    highlights: f.highlights / 100,
    vibrance: f.vibrance / 100,
    fade: f.fade / 100,
    denoise: f.denoise / 100,
    tone: f.shadows !== 0 || f.highlights !== 0 || f.vibrance !== 0 || f.fade !== 0,
    invGamma: 1 / f.gamma,
    matrix: M,
    offset: off,
    invert: f.invert,
    vignette: f.vignette / 100,
    sharpen: (f.sharpen / 100) * 1.6,
    blur: f.blur,
    flipH: f.flipH, flipV: f.flipV, rotate: f.rotate,
    chroma: f.chroma.on ? { keyCbCr: cbcr(key), similarity: f.chroma.similarity / 100 * 0.6, smoothness: f.chroma.smoothness / 100 * 0.6, spill: f.chroma.spill / 100 * 0.6 } : null,
  };
}

/** sRGB (0…1) → Cb, Cr (0…1, 0,5 merkez; BT.709). */
export function cbcr([r, g, b]) {
  return [-0.1146 * r - 0.3854 * g + 0.5 * b + 0.5, 0.5 * r - 0.4542 * g - 0.0458 * b + 0.5];
}

const clamp01 = (x) => clamp(x, 0, 1);

/**
 * CPU başvuru: tek pikseli işler ([r,g,b] 0…1 → [r,g,b,a]). Gölgelendiriciyle aynı
 * formül (keskinlik / bulanıklık komşu piksel ister; burada yok). uv: kenar karartma için.
 */
export function applyFxPixel(fxIn, rgb, uv = [0.5, 0.5], U = fxUniforms(fxIn)) {
  let [r, g, b] = rgb;
  let a = 1;
  if (U.chroma) {
    const [cb, cr] = cbcr([r, g, b]);
    const d = Math.hypot(cb - U.chroma.keyCbCr[0], cr - U.chroma.keyCbCr[1]);
    const base = d - U.chroma.similarity;
    a = clamp01(base / Math.max(1e-4, U.chroma.smoothness)) ** 1.5;
    const sp = clamp01(base / Math.max(1e-4, U.chroma.spill)) ** 1.5;
    const l = LUMA[0] * r + LUMA[1] * g + LUMA[2] * b;
    r = l + (r - l) * sp; g = l + (g - l) * sp; b = l + (b - l) * sp;
  }
  r *= U.gains[0]; g *= U.gains[1]; b *= U.gains[2];
  r = Math.max(0, r) ** U.invGamma; g = Math.max(0, g) ** U.invGamma; b = Math.max(0, b) ** U.invGamma;
  if (U.shadows) [r, g, b] = toneShadowsHighlights([r, g, b], U.shadows, 0);
  const m = U.matrix; const o = U.offset;
  let out = [m[0] * r + m[1] * g + m[2] * b + o[0], m[3] * r + m[4] * g + m[5] * b + o[1], m[6] * r + m[7] * g + m[8] * b + o[2]];
  if (U.vibrance) out = vibranceOf(out, U.vibrance);
  if (U.highlights) out = toneShadowsHighlights(out, 0, U.highlights);
  if (U.fade > 0) out = out.map((x) => Math.max(0, x) * (1 - 0.1 * U.fade) + 0.075 * U.fade);
  if (U.invert) out = out.map((x) => 1 - x);
  if (U.vignette > 0) {
    const d = Math.hypot(uv[0] - 0.5, uv[1] - 0.5) * 1.4142;
    const s = clamp01((d - 0.35) / 0.7);
    const v = 1 - U.vignette * s * s * (3 - 2 * s);
    out = out.map((x) => x * v);
  }
  if (U.tone) out = softClip(out);
  return [clamp01(out[0]), clamp01(out[1]), clamp01(out[2]), a];
}

const smooth = (e0, e1, x) => { const t = clamp01((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
const lumaOf = (c) => LUMA[0] * c[0] + LUMA[1] * c[1] + LUMA[2] * c[2];

/**
 * TON: gölgeler (sh, −1…1) parlaklığa göre ağırlıklı güç eğrisiyle açılır / koyulaşır
 * (siyah 0 kalır; nötr ekleme → gölgede renk gürültüsü büyümez). Parlak alanlar (hl):
 * eksi → diz (0,78 − 0,2·s) üstünde yumuşak omuz x / (1 + 0,6·s·x): 1'i aşan değerler bile
 * sıkıştırılır, renk oranı korunur (çarpımla); artı → üst tonlar açılır. Gölgelendiriciyle aynı.
 */
export function toneShadowsHighlights(c, sh, hl) {
  let [r, g, b] = c;
  if (sh) {
    const l = Math.max(0, lumaOf([r, g, b]));
    let ws = 1 - smooth(0, 0.55, l); ws *= ws;
    const p = sh >= 0 ? 1 / (1 + 0.8 * sh) : 1 + 0.8 * -sh;
    const d = (l ** p - l) * ws;
    r += d; g += d; b += d;
  }
  if (hl) {
    const l = Math.max(1e-5, lumaOf([r, g, b]));
    let lt = l;
    if (hl < 0) {
      const s = -hl;
      const k = 0.78 - 0.2 * s;
      if (l > k) { const x = (l - k) / (1 - k); lt = k + (1 - k) * (x / (1 + 0.6 * s * x)); }
    } else {
      lt = l + hl * 0.3 * smooth(0.4, 1, l) * Math.max(0, 1 - l);
    }
    const q = lt / l;
    r *= q; g *= q; b *= q;
  }
  return [r, g, b];
}

/**
 * CANLILIK (v, −1…1): az doygun renkler daha çok, doygun renkler az değişir; cilt tonu
 * (kırmızı > yeşil > mavi, turuncu bölge) korunur → yüzler turuncuya kaçmaz.
 */
export function vibranceOf(c, v) {
  const [r, g, b] = c;
  const mx = Math.max(r, g, b); const mn = Math.min(r, g, b);
  const sat = mx > 1e-5 ? (mx - mn) / mx : 0;
  let skin = 0;
  if (r > g && g > b) { const h = (g - b) / Math.max(1e-5, r - b); skin = clamp01(1 - Math.abs(h - 0.45) / 0.35) * (1 - smooth(0.55, 0.85, sat)); }
  const k = 1 + v * (1 - smooth(0, 0.7, sat)) * (1 - 0.75 * skin);
  const l = lumaOf(c);
  return [l + (r - l) * k, l + (g - l) * k, l + (b - l) * k];
}

/**
 * Rengi koruyan yumuşak kırpma (gamut omzu): en büyük kanal 0,92'yi aşınca x / (1 + x) ile
 * yumuşakça 1'e yaklaşır (1,0 → 0,96); renk tonu ve parlaklık korunur, kanal "patlaması"
 * (düz 255) olmaz.
 */
export const CLIP_KNEE = 0.92;
export function softClip(c) {
  const mx = Math.max(c[0], c[1], c[2]);
  if (mx <= CLIP_KNEE) return c;
  const x = (mx - CLIP_KNEE) / (1 - CLIP_KNEE);
  const target = CLIP_KNEE + (1 - CLIP_KNEE) * (x / (1 + x));
  const l = Math.min(target, Math.max(0, lumaOf(c)));
  const t = mx - l > 1e-6 ? (target - l) / (mx - l) : 0;
  return c.map((v) => l + (v - l) * t);
}

/* ------------------------------ otomatik beyaz ayarı / pozlama ------------------------------ */

/**
 * Kare istatistiği (RGBA bayt dizisi, küçük örnek ör. 96×54). Çim (baskın yeşil) ve
 * patlamış / çok koyu pikseller beyaz ayarı ölçümünden çıkarılır; ağırlık: nötre yakın
 * pikseller (beyaz çizgi, forma, tribün betonu) daha çok sayılır.
 * Dönüş { r, g, b (nötr ortalama, doğrusal değil 0…1), luma (ortalama), p95, clip (patlamış oran), n }.
 */
export function frameStats(data, { step = 4, gains = [1, 1, 1] } = {}) {
  let sr = 0, sg = 0, sb = 0, sw = 0, sl = 0, n = 0, clip = 0;
  const lum = [];
  for (let i = 0; i + 3 < data.length; i += step) {
    const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
    const l = LUMA[0] * r + LUMA[1] * g + LUMA[2] * b;
    n += 1; sl += l; lum.push(l);
    if (Math.max(r, g, b) >= 0.985) { clip += 1; continue; }
    // Nötrlük, o anki düzeltme tahminiyle (gains) ölçülür: sapmalı ışıkta "nötr görünen"
    // mavimsi nesneler yerine gerçekten nötr olanlar seçilsin (measureBalance yineler).
    const cr = r * gains[0], cg = g * gains[1], cb = b * gains[2];
    const mx = Math.max(cr, cg, cb); const mn = Math.min(cr, cg, cb);
    if (l < 0.06) continue;
    const grass = cg > cr * 1.12 && cg > cb * 1.08 && (mx - mn) / mx > 0.18;
    if (grass) continue;
    const sat = (mx - mn) / Math.max(1e-5, mx);
    const w = (1 - Math.min(1, sat / 0.45)) ** 2 * (0.3 + l); // nötr ve aydınlık olanlar ağır
    if (w <= 0) continue;
    sr += r * w; sg += g * w; sb += b * w; sw += w;
  }
  lum.sort((a, b) => a - b);
  const q = (p) => (lum.length ? lum[Math.min(lum.length - 1, Math.floor(p * lum.length))] : 0);
  return { r: sw ? sr / sw : 0, g: sw ? sg / sw : 0, b: sw ? sb / sw : 0, weight: sw, luma: n ? sl / n : 0, median: q(0.5), p95: q(0.95), clip: n ? clip / n : 0, n };
}

/**
 * Beyaz ayarı ölçümü (yinelemeli gri dünya + nötr ağırlık): her turda bulunan sapma
 * düzeltilerek nötr pikseller yeniden seçilir (3 tur). Dönüş frameStats biçiminde (ham ortalamalar).
 */
export function measureBalance(data, { step = 4, rounds = 3 } = {}) {
  let gains = [1, 1, 1];
  let st = frameStats(data, { step, gains });
  for (let k = 1; k < rounds && st.weight > 0; k += 1) {
    const m = (st.r + st.g + st.b) / 3;
    gains = [m / Math.max(1e-4, st.r), m / Math.max(1e-4, st.g), m / Math.max(1e-4, st.b)];
    st = frameStats(data, { step, gains });
  }
  return st;
}

/**
 * İstatistikten beyaz ayarı / pozlama önerisi (mevcut fx'in üzerine; yön, kroma, diğer
 * ayarlar korunur). Sıcaklık / renk tonu kazanç formülü (fxUniforms) tersinden çözülür:
 * nötr pikseller R = G = B olacak biçimde. Pozlama: orta ton (medyan) ≈ hedefe (yayın
 * için 0,42); patlama varsa parlak alanlar kurtarılır. strength 0…1 (temkinli: 0,85).
 */
export function autoBalance(stats, fx = {}, { target = 0.42, strength = 0.85, wb = true, exposure = true } = {}) {
  const cur = resolveFx(fx);
  const out = { ...cur };
  if (wb && stats && stats.weight > 0 && stats.r > 0 && stats.b > 0 && stats.g > 0) {
    // önce mevcut sıcaklık / renk tonu kazancını uygulayıp kalan sapmayı ölç
    const U = fxUniforms({ temperature: cur.temperature, tint: cur.tint });
    const r = stats.r * U.gains[0], g = stats.g * U.gains[1], b = stats.b * U.gains[2];
    // sıcaklık: (1 + 0,22t) / (1 − 0,22t) = b / r
    const dt = (b - r) / (0.22 * (b + r));
    const t = clamp(cur.temperature / 100 + dt * strength, -1, 1);
    // renk tonu: yeşil kazancı kırmızı / mavinin ortalamasına eşitlensin (tarama)
    let best = cur.tint / 100; let err = Infinity;
    for (let gi = -100; gi <= 100; gi += 1) {
      const T = gi / 100;
      const gr = (1 + 0.22 * t) * (1 + 0.08 * T), gg = (1 - 0.16 * T) * (1 + 0.02 * t), gb = (1 - 0.22 * t) * (1 + 0.08 * T);
      const e = Math.abs(stats.g * gg - (stats.r * gr + stats.b * gb) / 2);
      if (e < err) { err = e; best = T; }
    }
    const tint = cur.tint / 100 + (best - cur.tint / 100) * strength;
    out.temperature = Math.round(clamp(t, -1, 1) * 100);
    out.tint = Math.round(clamp(tint, -1, 1) * 100);
  }
  if (exposure && stats && stats.n) {
    const mid = Math.max(0.02, stats.median || stats.luma);
    // Pozlama kazancı (2^EV) bu boru hattında sRGB değerine doğrudan çarpılır: EV = log2(hedef / orta).
    let ev = Math.log2(target / mid) * strength * 0.8;
    // parlak uç patlamasın: p95 · 2^EV ≤ 0,97 (parlak alan kurtarma ayrıca yumuşak omuz verir)
    if (ev > 0 && stats.p95 > 0) ev = Math.max(0, Math.min(ev, Math.log2(0.99 / Math.max(0.05, stats.p95)) + 0.25));
    out.exposure = Math.round(clamp(cur.exposure + ev, -2, 2) * 20) / 20;
    if (stats.clip > 0.015 || stats.p95 > 0.93) out.highlights = Math.min(cur.highlights, -Math.round(clamp(20 + stats.clip * 800, 20, 60)));
    if (stats.median < 0.22) out.shadows = Math.max(cur.shadows, Math.round(clamp((0.22 - stats.median) * 160, 0, 35)));
  }
  return compactFx(out);
}

/** Çıkış boyutu (döndürmede genişlik / yükseklik yer değiştirir), en çok maxW × maxH içine sığar. */
export function fxOutputSize(w, h, rotate, maxW = 1920, maxH = 1080) {
  const sw = rotate === 90 || rotate === 270;
  let W = sw ? h : w;
  let H = sw ? w : h;
  const lim = W >= H ? [maxW, maxH] : [maxH, maxW];
  const k = Math.min(1, lim[0] / W, lim[1] / H);
  W = Math.max(1, Math.round(W * k));
  H = Math.max(1, Math.round(H * k));
  return { w: W, h: H };
}

/**
 * Çıkış uv'si (0…1, sol üst) → kaynak uv'si: önce çevir (çıkışta), sonra döndür.
 * Gölgelendirici aynı eşlemeyi yapar.
 */
export function mapUv([u, v], { flipH = false, flipV = false, rotate = 0 } = {}) {
  let x = flipH ? 1 - u : u;
  let y = flipV ? 1 - v : v;
  if (rotate === 90) return [y, 1 - x];
  if (rotate === 180) return [1 - x, 1 - y];
  if (rotate === 270) return [1 - y, x];
  return [x, y];
}

/**
 * Yedek yol (WebGL yoksa): CanvasRenderingContext2D.filter dizgisi. Sıcaklık /
 * renk tonu / gama / keskinlik / kroma bu yolla yapılamaz (yaklaşık ya da yok).
 */
export function cssFilterOf(fxIn) {
  const f = resolveFx(fxIn);
  const parts = [];
  const ev = 2 ** f.exposure;
  const bright = ev * (1 + f.brightness / 100 * 0.5) * (f.gamma !== 1 ? f.gamma ** 0.35 : 1);
  if (!near(bright, 1)) parts.push(`brightness(${bright.toFixed(3)})`);
  if (f.contrast) parts.push(`contrast(${(f.contrast >= 0 ? 1 + f.contrast / 100 * 1.2 : 1 + f.contrast / 100 * 0.85).toFixed(3)})`);
  if (f.saturation) parts.push(`saturate(${(1 + f.saturation / 100).toFixed(3)})`);
  if (f.hue) parts.push(`hue-rotate(${f.hue}deg)`);
  if (f.mono === "bw") parts.push("grayscale(1)");
  if (f.mono === "sepia") parts.push("sepia(1)");
  if (f.invert) parts.push("invert(1)");
  if (f.blur > 0) parts.push(`blur(${f.blur.toFixed(1)}px)`);
  return parts.join(" ") || "none";
}

/** Yedek yolda yapılamayan alanlar (arayüz uyarısı). */
export function fxUnsupported2D(fxIn) {
  const f = resolveFx(fxIn);
  const out = [];
  if (f.sharpen > 0) out.push("keskinlik");
  if (f.chroma.on) out.push("yeşil perde");
  if (f.denoise > 0) out.push("gürültü azaltma");
  if (f.highlights || f.shadows || f.vibrance || f.fade) out.push("parlak alan / gölge / canlılık / mat");
  return out;
}
