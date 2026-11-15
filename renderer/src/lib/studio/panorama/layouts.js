// Panorama yayını · KAMERA DÜZENLERİ (açı geometrisi; saf, sınanır).
//
// Düzen: { key, label, group, hint, slots: [kutu], card: kutu | null, full?, band? }
//   kutu: { x, y, w, h } çıkışa göre 0…1 (16:9); yuvada isteğe bağlı mask (daire, çapraz…),
//   radius (0…0.5), z (çizim sırası). card: içerik kartının kutusu.
// Hazır 40+ düzen (eski 12 anahtar aynen) + kullanıcının düzen editöründe kurduğu düzenler
// (setCustomLayouts — "u_" önekli anahtar).
//
// Açı geometrisi (angleGeometry): düzen + açının ayarları
//   mirror / flip      yatay / dikey ayna (ör. resim içinde resmin köşesi, sunucu solda / sağda)
//   style              { gap (boşluk 0…0.06), radius, border, borderColor, shadow, mask } tüm yuvalara
//   boxes[k]           yuva başına ince ayar: { x, y, w, h, crop: { l, t, r, b }, mask, radius }
//   cardBox            kart kutusu ince ayarı (x, y, w, h)

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
const r4 = (v) => Math.round(v * 10000) / 10000;

export const MASKS = Object.freeze([
  ["rect", "Dikdörtgen"], ["circle", "Daire"], ["ellipse", "Elips"], ["cut", "Pah kırık köşe"], ["hex", "Altıgen"],
  ["diagL", "Çapraz (sol parça)"], ["diagR", "Çapraz (sağ parça)"], ["slantL", "Eğik (sola)"], ["slantR", "Eğik (sağa)"],
]);
const MASK_KEYS = new Set(MASKS.map(([k]) => k));

const B = (x, y, w, h, extra) => ({ x, y, w, h, ...(extra || {}) });
// 16:9 çıkışta kare kutu: h = w * 16/9.
const SQ = (x, y, w, extra) => B(x, y, w, w * (16 / 9), extra);
const grid = (cols, rows, { x = 0.03, y = 0.105, w = 0.94, h = 0.785, gap = 0.008 } = {}) => {
  const cw = (w - gap * (cols - 1)) / cols;
  const ch = (h - gap * (rows - 1) * (16 / 9)) / rows;
  const out = [];
  for (let r = 0; r < rows; r += 1) for (let c = 0; c < cols; c += 1) out.push(B(r4(x + c * (cw + gap)), r4(y + r * (ch + gap * (16 / 9))), r4(cw), r4(ch)));
  return out;
};
const L = (key, label, group, hint, slots, card = null, extra = {}) => ({ key, label, group, hint, slots, card, ...extra });

export const LAYOUT_GROUPS = Object.freeze(["Temel", "Konuklu", "Izgara", "Resim içinde resim", "Şekilli", "Stüdyo"]);

export const BUILTIN_LAYOUTS = Object.freeze([
  // ── eski 12 düzen (anahtarlar değişmez: kayıtlı açılar bozulmasın) ──
  L("content", "İçerik tam ekran", "Temel", "Kamera yok; kart ekranın ortasında büyük", [], B(0.06, 0.115, 0.88, 0.775)),
  L("solo", "Tek kamera", "Temel", "Bir kamera tam ekran (kart yok)", [B(0, 0, 1, 1)], null, { full: true }),
  L("host", "Sunucu + içerik", "Temel", "Solda sunucu, sağda büyük kart", [B(0.03, 0.135, 0.36, 0.72)], B(0.415, 0.115, 0.555, 0.775)),
  L("camCard", "Kamera + kart kutusu", "Temel", "Kamera tam ekran, sağda kart kutusu", [B(0, 0, 1, 1)], B(0.53, 0.13, 0.44, 0.7), { full: true }),
  L("duo", "Sunucu + konuk", "Konuklu", "İki kamera yan yana, isim bantlı", [B(0.02, 0.17, 0.475, 0.62), B(0.505, 0.17, 0.475, 0.62)]),
  L("duoCard", "İki kamera + içerik", "Konuklu", "Solda alt alta iki kamera, sağda kart", [B(0.03, 0.12, 0.3, 0.37), B(0.03, 0.51, 0.3, 0.37)], B(0.355, 0.115, 0.615, 0.775)),
  L("grid4", "Izgara 2×2", "Izgara", "Dört kamera eşit boyda", [B(0.03, 0.11, 0.465, 0.385), B(0.505, 0.11, 0.465, 0.385), B(0.03, 0.505, 0.465, 0.385), B(0.505, 0.505, 0.465, 0.385)]),
  L("grid4Card", "2×2 + içerik", "Izgara", "Solda dört kamera, sağda kart", [B(0.025, 0.14, 0.235, 0.35), B(0.27, 0.14, 0.235, 0.35), B(0.025, 0.51, 0.235, 0.35), B(0.27, 0.51, 0.235, 0.35)], B(0.525, 0.115, 0.45, 0.775)),
  L("twoThree", "2 + 3", "Izgara", "Üstte iki büyük, altta üç küçük kamera", [B(0.03, 0.105, 0.465, 0.43), B(0.505, 0.105, 0.465, 0.43), B(0.03, 0.56, 0.307, 0.33), B(0.3465, 0.56, 0.307, 0.33), B(0.663, 0.56, 0.307, 0.33)]),
  L("bigSmall", "Büyük + küçükler", "Izgara", "Bir büyük kamera, sağda dört küçük", [B(0.02, 0.11, 0.715, 0.78), B(0.75, 0.11, 0.23, 0.18), B(0.75, 0.31, 0.23, 0.18), B(0.75, 0.51, 0.23, 0.18), B(0.75, 0.71, 0.23, 0.18)]),
  L("strip5", "Şerit (5) + içerik", "Stüdyo", "Üstte kart, altta yan yana beş kamera", [0, 1, 2, 3, 4].map((i) => B(r4(0.02 + i * 0.193), 0.665, 0.185, 0.225)), B(0.06, 0.105, 0.88, 0.535)),
  L("row3Card", "Üç kamera + içerik", "Stüdyo", "Solda kart, sağda alt alta üç kamera", [B(0.715, 0.11, 0.265, 0.25), B(0.715, 0.375, 0.265, 0.25), B(0.715, 0.64, 0.265, 0.25)], B(0.03, 0.115, 0.665, 0.775)),

  // ── resim içinde resim (köşe: açının aynası ile) ──
  L("pip", "Resim içinde resim", "Resim içinde resim", "Ana kamera tam ekran, köşede küçük kamera (köşe: ayna düğmeleri)", [B(0, 0, 1, 1), B(0.72, 0.62, 0.25, 0.25, { z: 2, radius: 0.06 })], null, { full: true }),
  L("pipCircle", "Resim içinde resim (yuvarlak)", "Resim içinde resim", "Ana kamera tam ekran, köşede daire kamera", [B(0, 0, 1, 1), SQ(0.8, 0.52, 0.17, { z: 2, mask: "circle" })], null, { full: true }),
  L("pipDouble", "Çift köşe kamera", "Resim içinde resim", "Ana kamera tam ekran, alt köşelerde iki küçük kamera", [B(0, 0, 1, 1), B(0.03, 0.66, 0.22, 0.22, { z: 2, radius: 0.06 }), B(0.75, 0.66, 0.22, 0.22, { z: 2, radius: 0.06 })], null, { full: true }),
  L("contentCam", "İçerik + köşe kamera", "Resim içinde resim", "İçerik kartı büyük, sağ altta küçük kamera", [B(0.765, 0.6, 0.205, 0.29, { z: 2, radius: 0.08 })], B(0.03, 0.115, 0.72, 0.775)),
  L("contentCircle", "İçerik + yuvarlak kamera", "Resim içinde resim", "İçerik kartı tam ekran, köşede daire kamera", [SQ(0.835, 0.55, 0.14, { z: 2, mask: "circle" })], B(0.04, 0.115, 0.78, 0.775)),
  L("camTicker", "Kamera + skor bandı", "Resim içinde resim", "Kamera tam ekran, altta canlı skor bandı ve kayan yazı", [B(0, 0, 1, 1)], null, { full: true, band: "scores" }),
  L("camCardLeft", "Kamera + sol kart", "Resim içinde resim", "Kamera tam ekran, solda kart kutusu", [B(0, 0, 1, 1)], B(0.03, 0.13, 0.42, 0.7), { full: true }),

  // ── konuklu oranlar ──
  L("side6040", "Yan yana 60/40", "Konuklu", "İki kamera, solda geniş (%60)", [B(0.02, 0.15, 0.575, 0.66), B(0.605, 0.15, 0.375, 0.66)]),
  L("side7030", "Yan yana 70/30", "Konuklu", "İki kamera, solda çok geniş (%70)", [B(0.02, 0.13, 0.67, 0.7), B(0.7, 0.13, 0.28, 0.7)]),
  L("vsplit", "Dikey bölme (üst / alt)", "Konuklu", "İki kamera üst üste", [B(0.2, 0.1, 0.6, 0.39), B(0.2, 0.505, 0.6, 0.39)]),
  L("vsplitCard", "Dikey bölme + içerik", "Konuklu", "Solda üst üste iki kamera, sağda kart", [B(0.03, 0.11, 0.42, 0.385), B(0.03, 0.505, 0.42, 0.385)], B(0.47, 0.115, 0.5, 0.775)),
  L("trio", "Üç konuk yan yana", "Konuklu", "Üç kamera eşit", [B(0.02, 0.2, 0.313, 0.56), B(0.3435, 0.2, 0.313, 0.56), B(0.667, 0.2, 0.313, 0.56)]),
  L("interview", "Röportaj (karşılıklı)", "Konuklu", "İki kamera karşılıklı, eğik kenarlar", [B(0.02, 0.14, 0.5, 0.7, { mask: "slantR" }), B(0.48, 0.14, 0.5, 0.7, { mask: "slantL" })]),
  L("interviewCard", "Röportaj + alt kart", "Konuklu", "Karşılıklı iki kamera, altta yatay kart", [B(0.03, 0.11, 0.455, 0.5, { radius: 0.05 }), B(0.515, 0.11, 0.455, 0.5, { radius: 0.05 })], B(0.03, 0.635, 0.94, 0.255)),

  // ── ızgara ──
  L("grid9", "Izgara 3×3", "Izgara", "Dokuz kamera", grid(3, 3)),
  L("grid6", "Izgara 3×2", "Izgara", "Altı kamera", grid(3, 2)),
  L("onePlus5", "1 + 5", "Izgara", "Bir büyük, çevresinde beş küçük kamera", [B(0.02, 0.105, 0.64, 0.555), B(0.67, 0.105, 0.31, 0.27), B(0.67, 0.39, 0.31, 0.27), B(0.02, 0.675, 0.313, 0.215), B(0.3435, 0.675, 0.313, 0.215), B(0.667, 0.675, 0.313, 0.215)]),
  L("twoPlus4", "2 + 4", "Izgara", "Üstte iki büyük, altta dört küçük", [B(0.03, 0.105, 0.465, 0.44), B(0.505, 0.105, 0.465, 0.44), ...[0, 1, 2, 3].map((i) => B(r4(0.03 + i * 0.2375), 0.565, 0.2275, 0.325))]),
  L("wall", "Çoklu ekran duvarı (4×3)", "Izgara", "On iki ekranlık duvar", grid(4, 3, { gap: 0.005 })),
  L("wallCard", "Ekran duvarı + içerik", "Izgara", "Solda 2×3 ekran duvarı, sağda kart", grid(2, 3, { x: 0.02, w: 0.46, gap: 0.006 }), B(0.5, 0.115, 0.475, 0.775)),

  // ── şekilli ──
  L("diagonal", "Çapraz bölme", "Şekilli", "İki kamera, çapraz çizgiyle bölünmüş tam ekran", [B(0, 0, 0.6, 1, { mask: "diagL" }), B(0.4, 0, 0.6, 1, { mask: "diagR" })], null, { full: true }),
  L("diagonalCard", "Çapraz kamera + içerik", "Şekilli", "Solda çapraz kesilmiş kamera, sağda kart", [B(0, 0, 0.5, 1, { mask: "diagL" })], B(0.47, 0.115, 0.505, 0.775)),
  L("circles2", "İki yuvarlak + içerik", "Şekilli", "Solda alt alta iki daire kamera, sağda kart", [SQ(0.06, 0.12, 0.2, { mask: "circle" }), SQ(0.06, 0.5, 0.2, { mask: "circle" })], B(0.3, 0.115, 0.67, 0.775)),
  L("circles3", "Üç yuvarlak konuk", "Şekilli", "Üç daire kamera yan yana", [SQ(0.07, 0.24, 0.24, { mask: "circle" }), SQ(0.38, 0.24, 0.24, { mask: "circle" }), SQ(0.69, 0.24, 0.24, { mask: "circle" })]),
  L("hexDuo", "Altıgen konuklar", "Şekilli", "İki altıgen çerçeveli kamera", [B(0.04, 0.16, 0.45, 0.66, { mask: "hex" }), B(0.51, 0.16, 0.45, 0.66, { mask: "hex" })]),
  L("cutGrid", "Pah kırık 2×2", "Şekilli", "Köşeleri kesik dört kamera", grid(2, 2, { gap: 0.012 }).map((b) => ({ ...b, mask: "cut" }))),
  L("slant3", "Eğik üçlü", "Şekilli", "Üç eğik kesilmiş kamera", [B(0.02, 0.15, 0.36, 0.66, { mask: "slantR" }), B(0.32, 0.15, 0.36, 0.66, { mask: "slantR" }), B(0.62, 0.15, 0.36, 0.66, { mask: "slantR" })]),

  // ── stüdyo ──
  L("newsDesk", "Haber masası", "Stüdyo", "İki sunucu altta, arkada büyük ekran (içerik)", [B(0.03, 0.56, 0.3, 0.33, { z: 2, radius: 0.04 }), B(0.67, 0.56, 0.3, 0.33, { z: 2, radius: 0.04 })], B(0.2, 0.105, 0.6, 0.6)),
  L("newsDeskWide", "Haber masası (geniş ekran)", "Stüdyo", "Arka ekran tam genişlik, önde iki sunucu", [B(0.05, 0.62, 0.24, 0.27, { z: 2, radius: 0.04 }), B(0.71, 0.62, 0.24, 0.27, { z: 2, radius: 0.04 })], B(0.03, 0.105, 0.94, 0.5)),
  L("anchor", "Spiker + arka ekran", "Stüdyo", "Sağda spiker, solda arka ekran (içerik)", [B(0.56, 0.14, 0.42, 0.75)], B(0.03, 0.115, 0.5, 0.6)),
  L("panel4", "Tartışma masası (4)", "Stüdyo", "Üstte kart, altta dört konuk", [0, 1, 2, 3].map((i) => B(r4(0.02 + i * 0.2425), 0.6, 0.23, 0.29, { radius: 0.05 })), B(0.06, 0.105, 0.88, 0.47)),
]);

/* ─────────────────────────── kullanıcı düzenleri ─────────────────────────── */

let custom = [];
const normBox = (b, lo = -0.5, hi = 1.5) => ({
  x: r4(clamp(num(b?.x, 0), lo, hi)),
  y: r4(clamp(num(b?.y, 0), lo, hi)),
  w: r4(clamp(num(b?.w, 0.3), 0.02, 2)),
  h: r4(clamp(num(b?.h, 0.3), 0.02, 2)),
  ...(MASK_KEYS.has(b?.mask) && b.mask !== "rect" ? { mask: b.mask } : {}),
  ...(num(b?.radius, 0) > 0 ? { radius: r4(clamp(num(b.radius, 0), 0, 0.5)) } : {}),
  ...(num(b?.z, 0) > 0 ? { z: Math.round(clamp(num(b.z, 0), 0, 9)) } : {}),
});
export function normalizeCustomLayout(l) {
  if (!l || typeof l !== "object") return null;
  const key = typeof l.key === "string" && /^u_[\w-]{1,40}$/.test(l.key) ? l.key : `u_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const slots = (Array.isArray(l.slots) ? l.slots : []).slice(0, 16).map((b) => normBox(b));
  const card = l.card ? normBox(l.card) : null;
  return { key, label: String(l.label || "Benim düzenim").slice(0, 40), group: "Benim düzenlerim", hint: String(l.hint || "Düzen editöründe kuruldu").slice(0, 80), slots, card, custom: true, ...(l.full ? { full: true } : {}), ...(l.band === "scores" ? { band: "scores" } : {}) };
}
export function setCustomLayouts(list) { custom = (Array.isArray(list) ? list : []).map(normalizeCustomLayout).filter(Boolean).slice(0, 40); return custom; }
export const customLayouts = () => custom;
export const allLayouts = () => [...BUILTIN_LAYOUTS, ...custom];
export const layoutOf = (key) => custom.find((l) => l.key === key) || BUILTIN_LAYOUTS.find((l) => l.key === key) || BUILTIN_LAYOUTS[0];

/* ─────────────────────────────── açı geometrisi ─────────────────────────────── */

const flipBox = (b, mirror, flip) => {
  let { x, y, mask } = b;
  if (mirror) { x = 1 - b.x - b.w; if (mask === "diagL") mask = "diagR"; else if (mask === "diagR") mask = "diagL"; else if (mask === "slantL") mask = "slantR"; else if (mask === "slantR") mask = "slantL"; }
  if (flip) y = 1 - b.y - b.h;
  return { ...b, x: r4(x), y: r4(y), ...(mask ? { mask } : {}) };
};
const shrink = (b, gap) => {
  if (!gap || (b.w >= 0.999 && b.h >= 0.999)) return b;
  const dx = Math.min(b.w * 0.3, gap);
  const dy = Math.min(b.h * 0.3, gap * (16 / 9));
  return { ...b, x: r4(b.x + dx / 2), y: r4(b.y + dy / 2), w: r4(b.w - dx), h: r4(b.h - dy) };
};

export function normalizeAngleStyle(s) {
  const o = {};
  const gap = clamp(num(s?.gap, 0), 0, 0.06); if (gap > 0) o.gap = r4(gap);
  if (s?.radius != null && s.radius !== "") o.radius = r4(clamp(num(s.radius, 0.035), 0, 0.5));
  if (s?.border != null && s.border !== "") o.border = Math.round(clamp(num(s.border, 3), 0, 30));
  if (typeof s?.borderColor === "string" && /^#[0-9a-f]{6}$/i.test(s.borderColor)) o.borderColor = s.borderColor.toLowerCase();
  if (s?.shadow != null && s.shadow !== "") o.shadow = Math.round(clamp(num(s.shadow, 24), 0, 80));
  if (MASK_KEYS.has(s?.mask) && s.mask !== "rect") o.mask = s.mask;
  return o;
}
const normCrop = (c) => {
  const v = (k) => r4(clamp(num(c?.[k], 0), 0, 0.45));
  const o = { l: v("l"), t: v("t"), r: v("r"), b: v("b") };
  return o.l || o.t || o.r || o.b ? o : null;
};
export function normalizeSlotBoxes(boxes, n) {
  const out = {};
  if (!boxes || typeof boxes !== "object") return out;
  for (let k = 0; k < n; k += 1) {
    const b = boxes[k] ?? boxes[String(k)];
    if (!b || typeof b !== "object") continue;
    const o = {};
    for (const key of ["x", "y", "w", "h"]) if (Number.isFinite(Number(b[key]))) o[key] = r4(clamp(Number(b[key]), key === "w" || key === "h" ? 0.02 : -0.5, key === "w" || key === "h" ? 2 : 1.5));
    const crop = normCrop(b.crop); if (crop) o.crop = crop;
    if (MASK_KEYS.has(b.mask)) o.mask = b.mask;
    if (b.radius != null && b.radius !== "") o.radius = r4(clamp(num(b.radius, 0), 0, 0.5));
    if (Object.keys(o).length) out[k] = o;
  }
  return out;
}

/**
 * Açının son geometrisi: { slots: [{ x, y, w, h, mask, radius, crop, z }], card: kutu | null, full, band }.
 * Sıra: düzen kutusu → ayna → boşluk → yuva ince ayarı (ayna uygulanmış kutuya göre mutlak).
 */
export function angleGeometry(angle) {
  const Lay = layoutOf(angle?.layout);
  const st = angle?.style || {};
  const boxes = angle?.boxes || {};
  const slots = Lay.slots.map((b0, k) => {
    let b = flipBox(b0, angle?.mirror, angle?.flip);
    b = shrink(b, st.gap || 0);
    const ov = boxes[k] || {};
    const mask = ov.mask || b.mask || st.mask || "rect";
    return {
      x: ov.x ?? b.x, y: ov.y ?? b.y, w: ov.w ?? b.w, h: ov.h ?? b.h,
      mask,
      radius: ov.radius ?? b.radius ?? st.radius ?? null,
      crop: ov.crop || null,
      z: b.z || 0,
    };
  });
  let card = Lay.card ? flipBox(Lay.card, angle?.mirror, angle?.flip) : null;
  if (card && angle?.cardBox) card = { ...card, ...Object.fromEntries(["x", "y", "w", "h"].filter((k) => Number.isFinite(Number(angle.cardBox[k]))).map((k) => [k, r4(Number(angle.cardBox[k]))])) };
  return { slots, card, full: Boolean(Lay.full), band: Lay.band || null };
}

/** Düzenin kopyası (editörde "bu düzeni temel al"). */
export function layoutDraftFrom(key, label) {
  const Lay = layoutOf(key);
  return normalizeCustomLayout({ label: label || `${Lay.label} (benim)`, slots: Lay.slots.map((b) => ({ ...b })), card: Lay.card ? { ...Lay.card } : null, full: Lay.full, band: Lay.band });
}
/** Açının ince ayarlı geometrisinden yeni kullanıcı düzeni. */
export function layoutFromAngle(angle, label) {
  const g = angleGeometry(angle);
  return normalizeCustomLayout({ label: label || `${angle?.name || "Açı"} düzeni`, slots: g.slots.map((s) => ({ x: s.x, y: s.y, w: s.w, h: s.h, mask: s.mask, radius: s.radius || 0, z: s.z })), card: g.card, full: g.full, band: g.band });
}
