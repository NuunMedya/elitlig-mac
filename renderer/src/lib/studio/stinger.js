// Yayın Stüdyosu — ELİTLİG LOGO GEÇİŞİ ("stinger").
//
// Marka renkleri (g.branding: ör. "CCL CUP" ön ayarı kendi logo ve renkleriyle)
// verilmezse ElitLig menekşesi. ~900 ms: degrade bir şerit soldan sağa ekranı örter (eğik kenarlı),
// ortada beyaz ElitLig madalyası dönerek büyür; tam ortada (p = 0,5) görüntü
// arkada değişir (sahne → sahne, canlı → tekrar, tekrar → canlı); sonra şerit
// sağa çekilir, logo büyüyüp söner. Program tuvaline çizilir: yayına gider.
//
// stingerState(p) saf zaman çizelgesidir (birim testli); drawStinger yalnız
// bu değerleri boyar.

export const STINGER_MS = 900;
/** Şeridin ekranı tam örttüğü aralık (değişim tam ortada). */
export const STINGER_COVER = Object.freeze({ inEnd: 0.42, outStart: 0.58, switchAt: 0.5 });

const clamp01 = (v) => (v <= 0 ? 0 : v >= 1 ? 1 : v);
/** easeInOutCubic */
export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2);
/** easeOutBack (hafif taşma). */
const easeOutBack = (t) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
};

/**
 * Geçişin p (0…1) anındaki durumu.
 *   lead  şeridin önde giden (sağ) kenarı, 0 → 1 (ekran genişliği oranı)
 *   trail şeridin arkadaki (sol) kenarı, 0 → 1
 *   cover ekranın örtülen oranı
 *   logo  { scale, rotation (radyan), alpha }
 *   switched  görüntü değişti mi (p ≥ 0,5)
 */
export function stingerState(p) {
  const t = clamp01(Number(p) || 0);
  const inT = clamp01(t / STINGER_COVER.inEnd);
  const outT = clamp01((t - STINGER_COVER.outStart) / (1 - STINGER_COVER.outStart));
  const lead = easeInOut(inT);
  const trail = easeInOut(outT);
  // Logo: 0,16'da belirir, 0,5'te tam boy; 0,84'te söner.
  const appear = clamp01((t - 0.16) / 0.34);
  const vanish = clamp01((t - 0.5) / 0.34);
  let scale;
  let alpha;
  let rotation;
  if (t < 0.5) {
    scale = 0.35 + 0.65 * easeOutBack(appear);
    alpha = clamp01(appear * 1.6);
    rotation = (-1 + easeInOut(appear)) * (Math.PI / 2);
  } else {
    scale = 1 + 0.3 * easeInOut(vanish);
    alpha = 1 - clamp01(vanish * 1.25);
    rotation = easeInOut(vanish) * (Math.PI / 9);
  }
  if (t <= 0 || t >= 1) alpha = 0;
  return { t, lead, trail, cover: Math.max(0, lead - trail), logo: { scale, rotation, alpha }, switched: t >= STINGER_COVER.switchAt, done: t >= 1 };
}

/** Şeridin çokgeni (eğik kenarlı): ekran pikseli. slant = genişliğin %18'i. */
export function stingerBand(state, W, H) {
  const slant = W * 0.18;
  const span = W + slant;
  // Kenarlar: lead 0 → şerit tamamen solda (görünmez), 1 → ekranın sağını aşar.
  const right = -slant + state.lead * (span + slant);
  const left = -slant + state.trail * (span + slant);
  return [
    [left, H], [left + slant, 0], [right + slant, 0], [right, H],
  ];
}

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const hex6 = (c) => {
  if (!HEX.test(String(c || ""))) return null;
  const s = String(c).slice(1);
  return `#${s.length === 3 ? s.split("").map((x) => x + x).join("") : s}`.toLowerCase();
};
/** Rengi siyaha doğru karartır (k 0…1). */
export function darken(c, k = 0.5) {
  const h = hex6(c);
  if (!h) return c;
  const n = parseInt(h.slice(1), 16);
  const f = (v) => Math.round(v * (1 - k)).toString(16).padStart(2, "0");
  return `#${f((n >> 16) & 255)}${f((n >> 8) & 255)}${f(n & 255)}`;
}

/** ElitLig varsayılan marka renkleri. */
export const DEFAULT_BRANDING = Object.freeze({ primary: "#54009c", secondary: "#8a3fe0", accent: "#c026d3", text: "#ffffff", logoScale: 1, name: "ELİTLİG" });

/**
 * Markadan (g.branding: { primary, secondary, accent, text, logoScale, name })
 * logo geçişinin renkleri. Geçersiz renk varsayılana düşer.
 */
export function stingerPalette(branding) {
  const b = branding || {};
  const primary = hex6(b.primary) || DEFAULT_BRANDING.primary;
  const secondary = hex6(b.secondary) || DEFAULT_BRANDING.secondary;
  const accent = hex6(b.accent) || hex6(b.secondary) || DEFAULT_BRANDING.accent;
  const text = hex6(b.text) || DEFAULT_BRANDING.text;
  const scale = Number(b.logoScale);
  return {
    stops: [[0, darken(primary, 0.55)], [0.45, primary], [0.75, secondary], [1, accent]],
    edge: text,
    text,
    logoScale: Number.isFinite(scale) && scale > 0 ? Math.min(2, Math.max(0.3, scale)) : 1,
    name: String(b.name || b.title || DEFAULT_BRANDING.name).slice(0, 24),
  };
}

/**
 * Geçişi çizer (en üstte, skorbordun da üstünde). logo: yüklenmiş marka
 * logosu (HTMLImageElement) ya da null; branding: marka renkleri ve logo ölçeği.
 */
export function drawStinger(ctx, W, H, p, logo, branding) {
  const st = stingerState(p);
  if (st.t <= 0 || st.t >= 1) return st;
  const pal = stingerPalette(branding);
  const poly = stingerBand(st, W, H);
  ctx.save();
  // Ana şerit: marka renklerinden degrade.
  const g = ctx.createLinearGradient(0, 0, W, H);
  for (const [at, c] of pal.stops) g.addColorStop(at, c);
  ctx.fillStyle = g;
  ctx.beginPath();
  poly.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.fill();
  // Ön kenarda ince açık çizgi (hız hissi).
  const [, , [rx0, ry0], [rx1, ry1]] = poly;
  ctx.strokeStyle = pal.edge;
  ctx.globalAlpha = 0.8;
  ctx.lineWidth = Math.max(2, W / 320);
  ctx.beginPath();
  ctx.moveTo(rx0, ry0);
  ctx.lineTo(rx1, ry1);
  ctx.stroke();
  ctx.globalAlpha = 1;
  // Logo.
  if (st.logo.alpha > 0.01) {
    const size = Math.min(W, H) * 0.34 * st.logo.scale * pal.logoScale;
    ctx.globalAlpha = st.logo.alpha;
    ctx.translate(W / 2, H / 2);
    ctx.rotate(st.logo.rotation);
    // Arkada yumuşak ışık halesi.
    const halo = ctx.createRadialGradient(0, 0, size * 0.1, 0, 0, size * 0.75);
    halo.addColorStop(0, "rgba(255, 255, 255, 0.28)");
    halo.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.75, 0, Math.PI * 2);
    ctx.fill();
    const iw = logo?.naturalWidth || logo?.width;
    const ih = logo?.naturalHeight || logo?.height;
    if (iw && ih) {
      const k = Math.min(size / iw, size / ih);
      try { ctx.drawImage(logo, (-iw * k) / 2, (-ih * k) / 2, iw * k, ih * k); } catch { /* hazır değil */ }
    } else {
      ctx.fillStyle = pal.text;
      ctx.font = `900 ${Math.round(size * 0.22)}px "Archivo", -apple-system, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(pal.name, 0, 0, size * 1.6);
    }
  }
  ctx.restore();
  return st;
}
