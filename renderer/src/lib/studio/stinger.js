// Yayın Stüdyosu — ELİTLİG LOGO GEÇİŞİ ("stinger").
//
// ~900 ms: menekşe degrade bir şerit soldan sağa ekranı örter (eğik kenarlı),
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

/**
 * Geçişi çizer (en üstte, skorbordun da üstünde). logo: yüklenmiş beyaz
 * ElitLig madalyası (HTMLImageElement) ya da null.
 */
export function drawStinger(ctx, W, H, p, logo) {
  const st = stingerState(p);
  if (st.t <= 0 || st.t >= 1) return st;
  const poly = stingerBand(st, W, H);
  ctx.save();
  // Ana şerit: menekşe → mor degrade.
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, "#2a003f");
  g.addColorStop(0.45, "#54009c");
  g.addColorStop(0.75, "#8a3fe0");
  g.addColorStop(1, "#c026d3");
  ctx.fillStyle = g;
  ctx.beginPath();
  poly.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.fill();
  // Ön kenarda ince açık çizgi (hız hissi).
  const [, , [rx0, ry0], [rx1, ry1]] = poly;
  ctx.strokeStyle = "rgba(216, 191, 255, 0.85)";
  ctx.lineWidth = Math.max(2, W / 320);
  ctx.beginPath();
  ctx.moveTo(rx0, ry0);
  ctx.lineTo(rx1, ry1);
  ctx.stroke();
  // Logo.
  if (st.logo.alpha > 0.01) {
    const size = Math.min(W, H) * 0.34 * st.logo.scale;
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
      ctx.fillStyle = "#fff";
      ctx.font = `900 ${Math.round(size * 0.22)}px "Archivo", -apple-system, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("ELİTLİG", 0, 0);
    }
  }
  ctx.restore();
  return st;
}
