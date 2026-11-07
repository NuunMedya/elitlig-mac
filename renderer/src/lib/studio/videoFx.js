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
// İşleme sırası (gölgelendirici ve CPU başvuru işlevi aynı): kroma anahtarı (özgün
// renk) → kazançlar (pozlama · sıcaklık · renk tonu) → gama → kontrast / parlaklık /
// doygunluk / ton / tek renk (3×3 dönüşüm + öteleme) → negatif → kenar karartma.
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
  flipH: false, flipV: false, rotate: 0, chroma: CHROMA_DEFAULTS,
});

/** Kaydırıcı tanımları (arayüz ve doğrulama ortak). */
export const FX_SLIDERS = [
  { key: "brightness", label: "Parlaklık", min: -100, max: 100, step: 1, group: "renk" },
  { key: "contrast", label: "Kontrast", min: -100, max: 100, step: 1, group: "renk" },
  { key: "saturation", label: "Doygunluk", min: -100, max: 100, step: 1, group: "renk" },
  { key: "hue", label: "Ton", min: -180, max: 180, step: 1, suffix: "°", group: "renk" },
  { key: "exposure", label: "Pozlama", min: -2, max: 2, step: 0.05, suffix: " EV", group: "isik" },
  { key: "gamma", label: "Gama", min: 0.3, max: 3, step: 0.05, group: "isik" },
  { key: "temperature", label: "Sıcaklık", min: -100, max: 100, step: 1, group: "isik", hint: "+ sıcak · − soğuk" },
  { key: "tint", label: "Renk tonu", min: -100, max: 100, step: 1, group: "isik", hint: "+ macenta · − yeşil" },
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
  const m = U.matrix; const o = U.offset;
  let out = [m[0] * r + m[1] * g + m[2] * b + o[0], m[3] * r + m[4] * g + m[5] * b + o[1], m[6] * r + m[7] * g + m[8] * b + o[2]];
  if (U.invert) out = out.map((x) => 1 - x);
  if (U.vignette > 0) {
    const d = Math.hypot(uv[0] - 0.5, uv[1] - 0.5) * 1.4142;
    const s = clamp01((d - 0.35) / 0.7);
    const v = 1 - U.vignette * s * s * (3 - 2 * s);
    out = out.map((x) => x * v);
  }
  return [clamp01(out[0]), clamp01(out[1]), clamp01(out[2]), a];
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
  return out;
}
