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

/* ═════════════════════ YENİ LOGO GEÇİŞLERİ ═════════════════════
 *
 * Hepsi marka renkleri + logo (g.branding: logoUrl, primary, secondary, accent)
 * ile; tam ortada (p = 0,5) ekran TAM örtülüdür (görüntü orada değişir).
 * Saf zaman çizelgeleri (…State) birim testlidir; çizimler yalnız tuval 2D
 * (filtre / gölge yok, geometri önbellekte) — 1080p60'ta rahat.
 *
 *   sweep   Işık süpürmesi: parlak ışık kenarlı koyu perde soldan sağa örter,
 *           logo parlayan bir yansımayla belirir, perde ikinci ışıkla çekilir.
 *   panels  Panel kayması: dört eğik marka paneli kademeli kayar, en üstte logo
 *           ve marka şeridi; ters sırayla sağa çıkar.
 *   iris    Halka: halkalar ve marka diski merkezden patlar, logo dönen yaylar
 *           ve ışınlarla belirir; yeni görüntü merkezden açılan halkayla gelir.
 *   shards  Parçacık: üçgen kırıklar kenarlardan uçup ekranı örer, logo
 *           parçalardan birleşir; kırıklar merkezden dışa saçılarak çıkar.
 */

const seg = (t, a, b) => clamp01((t - a) / (b - a));
const easeOutCubic = (t) => 1 - (1 - t) ** 3;
const easeInCubic = (t) => t * t * t;
const easeOutBackK = (t, k = 1.7) => 1 + (k + 1) * (t - 1) ** 3 + k * (t - 1) ** 2;

/** Yeni geçişlerin anahtarları (transitions.js listesine eklenir). */
export const STINGER_STYLES = [
  { key: "stinger", label: "Marka logosu (klasik)", ms: STINGER_MS },
  { key: "sweep", label: "Logo · Işık süpürmesi", ms: 1300 },
  { key: "panels", label: "Logo · Panel kayması", ms: 1250 },
  { key: "iris", label: "Logo · Halka", ms: 1300 },
  { key: "shards", label: "Logo · Parçacık", ms: 1500 },
];
export const STINGER_KEYS = STINGER_STYLES.map((s) => s.key);
export const isStingerStyle = (key) => STINGER_KEYS.includes(key);

/** Işık süpürmesi zaman çizelgesi. */
export function sweepState(p) {
  const t = clamp01(Number(p) || 0);
  const lead = easeInOut(seg(t, 0, 0.42));
  const trail = easeInOut(seg(t, 0.58, 1));
  const appear = easeOutCubic(seg(t, 0.28, 0.48));
  const vanish = seg(t, 0.6, 0.8);
  const logo = { alpha: t <= 0 || t >= 1 ? 0 : appear * (1 - vanish), scale: 0.86 + 0.14 * appear + 0.06 * easeInOut(vanish) };
  const g = seg(t, 0.38, 0.64);
  return {
    t, lead, trail, cover: Math.max(0, lead - trail), logo,
    glint: g > 0 && g < 1 ? g : null,
    flare: Math.sin(Math.PI * seg(t, 0.3, 0.7)) * (1 - vanish),
    switched: t >= 0.5, done: t >= 1,
  };
}

/** Panel kayması: 4 panel (0 = en alt … 3 = en üst, logolu). */
export const PANEL_COUNT = 4;
export function panelsState(p) {
  const t = clamp01(Number(p) || 0);
  const panels = [];
  for (let i = 0; i < PANEL_COUNT; i += 1) {
    const inStart = 0.035 * i;
    const lead = easeOutCubic(seg(t, inStart, inStart + 0.3));
    const k = PANEL_COUNT - 1 - i; // üstteki önce çıkar
    const outStart = 0.58 + 0.035 * k;
    const trail = easeInCubic(seg(t, outStart, outStart + 0.3));
    panels.push({ lead, trail });
  }
  const top = panels[PANEL_COUNT - 1];
  const appear = easeOutBackK(seg(t, 0.3, 0.48), 1.4);
  const vanish = seg(t, 0.56, 0.66);
  const cover = Math.max(...panels.map((x) => Math.max(0, x.lead - x.trail)));
  return {
    t, panels, cover,
    logo: { alpha: t <= 0 || t >= 1 ? 0 : clamp01(seg(t, 0.3, 0.42) * 1.2) * (1 - vanish), scale: 0.8 + 0.2 * appear },
    strip: easeOutCubic(seg(t, 0.32, 0.5)) * (1 - easeInCubic(vanish)),
    topLead: top.lead, switched: t >= 0.5, done: t >= 1,
  };
}

/** Halka: disk yarıçapı / delik yarıçapı ekran köşegeninin yarısına oranla (0…1). */
export function irisState(p) {
  const t = clamp01(Number(p) || 0);
  const disc = easeInOut(seg(t, 0.04, 0.42));
  const hole = easeInOut(seg(t, 0.6, 1));
  const ring = easeOutCubic(seg(t, 0, 0.3));
  const appear = easeOutBackK(seg(t, 0.28, 0.46), 2.2);
  const vanish = seg(t, 0.55, 0.64);
  const cover = Math.max(0, Math.min(1, disc) ** 2 - hole ** 2);
  return {
    t, disc, hole, ring, cover: t > 0 && t < 1 ? cover : 0,
    ringAlpha: 1 - seg(t, 0.2, 0.36),
    logo: { alpha: t <= 0 || t >= 1 ? 0 : clamp01(seg(t, 0.28, 0.38)) * (1 - vanish), scale: Math.max(0, appear) * (1 + 0.15 * vanish) },
    arcs: clamp01(seg(t, 0.3, 0.42)) * (1 - vanish),
    spin: t * Math.PI * 2.2,
    burst: seg(t, 0.4, 0.62),
    switched: t >= 0.5, done: t >= 1,
  };
}

/** Kırık geometrisi (önbellekte): kolon × satır ızgarası, hücre başına iki üçgen. */
const SHARD_COLS = 8;
const SHARD_ROWS = 5;
const shardCache = new Map();
const rnd = (i, k) => {
  const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453;
  return x - Math.floor(x);
};
export function shardGeometry(W, H) {
  const key = `${W}x${H}`;
  let g = shardCache.get(key);
  if (g) return g;
  const cw = W / SHARD_COLS;
  const ch = H / SHARD_ROWS;
  const cx0 = W / 2;
  const cy0 = H / 2;
  const maxD = Math.hypot(cx0, cy0);
  const list = [];
  // Köşeler biraz oynatılır (doğal kırık); kenar köşeleri sabit.
  const jit = (c, r, axis) => (c > 0 && c < SHARD_COLS && r > 0 && r < SHARD_ROWS ? (rnd(c * 31 + r, axis) - 0.5) * (axis ? ch : cw) * 0.45 : 0);
  const P = (c, r) => [c * cw + jit(c, r, 0), r * ch + jit(c, r, 1)];
  for (let r = 0; r < SHARD_ROWS; r += 1) {
    for (let c = 0; c < SHARD_COLS; c += 1) {
      const a = P(c, r); const b = P(c + 1, r); const d = P(c + 1, r + 1); const e = P(c, r + 1);
      const tris = (c + r) % 2 ? [[a, b, d], [a, d, e]] : [[a, b, e], [b, d, e]];
      for (const pts of tris) {
        const i = list.length;
        const cx = (pts[0][0] + pts[1][0] + pts[2][0]) / 3;
        const cy = (pts[0][1] + pts[1][1] + pts[2][1]) / 3;
        const dist = Math.hypot(cx - cx0, cy - cy0) / maxD;
        const ang = Math.atan2(cy - cy0, cx - cx0) + (rnd(i, 3) - 0.5) * 0.8;
        // Üçgen merkez çevresinde 1,5 px büyütülür: dikiş çizgisi görünmez.
        const grow = (q) => { const dx = q[0] - cx; const dy = q[1] - cy; const l = Math.hypot(dx, dy) || 1; return [q[0] + (dx / l) * 1.5, q[1] + (dy / l) * 1.5]; };
        list.push({
          pts: pts.map(grow), cx, cy, dist,
          dirX: Math.cos(ang), dirY: Math.sin(ang),
          rot: (rnd(i, 1) - 0.5) * 2.4,
          shade: rnd(i, 2),
          inDelay: 0.2 * (1 - dist) + rnd(i, 4) * 0.03,
          outDelay: 0.14 * dist + rnd(i, 5) * 0.03,
        });
      }
    }
  }
  g = { list, W, H };
  if (shardCache.size > 6) shardCache.clear();
  shardCache.set(key, g);
  return g;
}

/** Kırığın t anındaki durumu: { k (0 = yerinde … 1 = uzakta), alpha, rot, scale }. */
export function shardAt(shard, p) {
  const t = clamp01(Number(p) || 0);
  const tin = easeOutCubic(seg(t, shard.inDelay, shard.inDelay + 0.2));
  const tout = easeInCubic(seg(t, 0.58 + shard.outDelay, 0.58 + shard.outDelay + 0.24));
  if (t < 0.5) return { k: 1 - tin, alpha: clamp01(seg(t, shard.inDelay, shard.inDelay + 0.06)), rot: shard.rot * (1 - tin), scale: 0.35 + 0.65 * tin, landed: tin >= 1 };
  return { k: tout, alpha: 1 - clamp01((tout - 0.6) / 0.4), rot: shard.rot * tout, scale: 1 - 0.45 * tout, landed: tout <= 0 };
}

export function shardsState(p, W = 1920, H = 1080) {
  const t = clamp01(Number(p) || 0);
  const g = shardGeometry(W, H);
  let landed = 0;
  for (const s of g.list) if (shardAt(s, t).landed) landed += 1;
  const appear = easeOutCubic(seg(t, 0.3, 0.5));
  const vanish = seg(t, 0.58, 0.68);
  return {
    t, cover: t > 0 && t < 1 ? landed / g.list.length : 0,
    backdrop: t > 0 && t < 1 ? seg(t, 0.36, 0.42) * (1 - seg(t, 0.58, 0.61)) : 0,
    logo: { alpha: t <= 0 || t >= 1 ? 0 : clamp01(seg(t, 0.3, 0.4)) * (1 - vanish), assemble: appear, scatter: vanish },
    switched: t >= 0.5, done: t >= 1,
  };
}

/** Herhangi bir geçiş stilinin p anında ekranı örtme oranı (0…1). */
export function stingerCoverage(kind, p) {
  if (kind === "sweep") return sweepState(p).cover;
  if (kind === "panels") return panelsState(p).cover;
  if (kind === "iris") return irisState(p).cover;
  if (kind === "shards") return shardsState(p).cover;
  return stingerState(p).cover;
}

/* ───────────── çizim yardımcıları ───────────── */

const logoSize = (logo) => [logo?.naturalWidth || logo?.width || 0, logo?.naturalHeight || logo?.height || 0];

/** Logo (ya da marka adı) merkezde, size kutusuna sığarak. */
function paintLogo(ctx, logo, pal, cx, cy, size) {
  const [iw, ih] = logoSize(logo);
  if (iw && ih) {
    const k = Math.min(size / iw, size / ih);
    try { ctx.drawImage(logo, cx - (iw * k) / 2, cy - (ih * k) / 2, iw * k, ih * k); } catch { /* hazır değil */ }
    return { w: iw * k, h: ih * k };
  }
  ctx.fillStyle = pal.text;
  ctx.font = `900 ${Math.round(size * 0.24)}px "Archivo", -apple-system, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(pal.name, cx, cy, size * 1.7);
  return { w: Math.min(size * 1.7, ctx.measureText(pal.name).width), h: size * 0.3 };
}

// Logo yansıması için tek ekran dışı tuval (yeniden boyutlanır, kare başına bir çizim).
let glintCanvas = null;
function paintLogoGlint(ctx, logo, pal, cx, cy, size, g) {
  const [iw, ih] = logoSize(logo);
  if (!iw || !ih || typeof document === "undefined") return;
  const k = Math.min(size / iw, size / ih);
  const w = Math.max(2, Math.ceil(iw * k));
  const h = Math.max(2, Math.ceil(ih * k));
  if (!glintCanvas) glintCanvas = document.createElement("canvas");
  if (glintCanvas.width < w || glintCanvas.height < h) { glintCanvas.width = Math.ceil(w / 64) * 64; glintCanvas.height = Math.ceil(h / 64) * 64; }
  const c = glintCanvas.getContext("2d");
  c.clearRect(0, 0, w + 2, h + 2);
  c.globalCompositeOperation = "source-over";
  try { c.drawImage(logo, 0, 0, w, h); } catch { return; }
  c.globalCompositeOperation = "source-atop";
  const x = -w * 0.6 + g * w * 2.2;
  const lg = c.createLinearGradient(x - w * 0.25, 0, x + w * 0.25, h * 0.4);
  lg.addColorStop(0, "rgba(255,255,255,0)");
  lg.addColorStop(0.5, "rgba(255,255,255,0.95)");
  lg.addColorStop(1, "rgba(255,255,255,0)");
  c.fillStyle = lg;
  c.fillRect(0, 0, w, h);
  c.globalCompositeOperation = "source-over";
  ctx.drawImage(glintCanvas, 0, 0, w, h, cx - w / 2, cy - h / 2, w, h);
}

function radialGlow(ctx, cx, cy, r, color, alpha) {
  if (alpha <= 0.01 || r <= 0) return;
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, color);
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.globalAlpha = alpha;
  ctx.fillStyle = g;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  ctx.globalAlpha = 1;
}

const rgba = (hex, a) => {
  const h = String(hex || "#ffffff").replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((x) => x + x).join("") : h, 16) || 0;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

/** Işık süpürmesi. */
function drawSweep(ctx, W, H, p, logo, pal) {
  const st = sweepState(p);
  if (st.t <= 0 || st.t >= 1) return st;
  const slant = W * 0.12;
  const span = W + slant * 2;
  const lead = -slant + st.lead * span;
  const trail = -slant + st.trail * span;
  const primary = pal.stops[1][1];
  const accent = pal.stops[3][1];
  const dark = pal.stops[0][1];
  ctx.save();
  if (st.cover > 0.001) {
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, "#050208");
    g.addColorStop(0.5, dark);
    g.addColorStop(1, "#050208");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(trail - slant, H); ctx.lineTo(trail + slant, 0); ctx.lineTo(lead + slant, 0); ctx.lineTo(lead - slant, H);
    ctx.closePath();
    ctx.fill();
    // İnce yatay tarama çizgileri (doku).
    ctx.globalAlpha = 0.05 * Math.min(1, st.cover * 3);
    ctx.fillStyle = "#ffffff";
    for (let y = 0; y < H; y += Math.max(3, Math.round(H / 180))) ctx.fillRect(Math.max(0, trail - slant), y, Math.max(0, lead - trail + slant * 2), 1);
    ctx.globalAlpha = 1;
  }
  // Işık kenarı: geniş renkli parıltı + beyaz çekirdek.
  const edge = (x, strength) => {
    if (strength <= 0.01 || x < -slant * 2 || x > W + slant * 2) return;
    const gw = W * 0.08;
    const lg = ctx.createLinearGradient(x - gw, 0, x + gw, 0);
    lg.addColorStop(0, rgba(accent, 0));
    lg.addColorStop(0.42, rgba(accent, 0.55 * strength));
    lg.addColorStop(0.5, rgba("#ffffff", 0.95 * strength));
    lg.addColorStop(0.58, rgba(primary, 0.5 * strength));
    lg.addColorStop(1, rgba(primary, 0));
    ctx.fillStyle = lg;
    ctx.beginPath();
    ctx.moveTo(x - gw - slant, H); ctx.lineTo(x - gw + slant, 0); ctx.lineTo(x + gw + slant, 0); ctx.lineTo(x + gw - slant, H);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = rgba("#ffffff", strength);
    ctx.lineWidth = Math.max(2, W / 480);
    ctx.beginPath();
    ctx.moveTo(x - slant, H); ctx.lineTo(x + slant, 0);
    ctx.stroke();
  };
  edge(lead, st.lead < 1 ? 1 : 0);
  edge(trail, st.trail > 0 ? 1 : 0);
  // Logo, ışıma, yatay parlama.
  if (st.logo.alpha > 0.01) {
    const size = Math.min(W, H) * 0.3 * st.logo.scale * pal.logoScale;
    const cx = W / 2;
    const cy = H / 2;
    radialGlow(ctx, cx, cy, size * 1.1, rgba(accent, 0.55), st.logo.alpha);
    if (st.flare > 0.01) {
      const fw = W * (0.25 + 0.55 * st.flare);
      const fl = ctx.createLinearGradient(cx - fw, 0, cx + fw, 0);
      fl.addColorStop(0, "rgba(255,255,255,0)");
      fl.addColorStop(0.5, `rgba(255,255,255,${0.85 * st.flare})`);
      fl.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = fl;
      ctx.fillRect(cx - fw, cy - Math.max(1, H / 540), fw * 2, Math.max(2, H / 270));
    }
    ctx.globalAlpha = st.logo.alpha;
    paintLogo(ctx, logo, pal, cx, cy, size);
    if (st.glint != null) paintLogoGlint(ctx, logo, pal, cx, cy, size, st.glint);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
  return st;
}

/** Panel kayması. */
function drawPanels(ctx, W, H, p, logo, pal) {
  const st = panelsState(p);
  if (st.t <= 0 || st.t >= 1) return st;
  const slant = W * 0.22;
  const span = W + slant * 2;
  const colors = [pal.stops[3][1], pal.stops[2][1], pal.stops[1][1], null];
  ctx.save();
  st.panels.forEach((pn, i) => {
    if (pn.lead <= pn.trail) return;
    const right = -slant + pn.lead * span;
    const left = -slant + pn.trail * span;
    ctx.beginPath();
    ctx.moveTo(left - slant, H); ctx.lineTo(left + slant * 0.2, 0); ctx.lineTo(right + slant * 0.2, 0); ctx.lineTo(right - slant, H);
    ctx.closePath();
    if (colors[i]) ctx.fillStyle = colors[i];
    else {
      const g = ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, "#07030c");
      g.addColorStop(0.6, pal.stops[0][1]);
      g.addColorStop(1, darken(pal.stops[1][1], 0.3));
      ctx.fillStyle = g;
    }
    ctx.fill();
    // Ön kenar çizgisi.
    ctx.strokeStyle = i === PANEL_COUNT - 1 ? rgba(pal.stops[3][1], 0.95) : "rgba(255,255,255,0.35)";
    ctx.lineWidth = Math.max(2, W / (i === PANEL_COUNT - 1 ? 300 : 640));
    ctx.beginPath();
    ctx.moveTo(right - slant, H); ctx.lineTo(right + slant * 0.2, 0);
    ctx.stroke();
  });
  // Marka şeridi + logo + ad.
  const cy = H / 2;
  if (st.strip > 0.01) {
    const sw = W * st.strip;
    const sh = H * 0.006;
    const g = ctx.createLinearGradient(W / 2 - sw / 2, 0, W / 2 + sw / 2, 0);
    g.addColorStop(0, rgba(pal.stops[3][1], 0));
    g.addColorStop(0.5, rgba(pal.stops[3][1], 1));
    g.addColorStop(1, rgba(pal.stops[3][1], 0));
    ctx.fillStyle = g;
    ctx.fillRect(W / 2 - sw / 2, cy + H * 0.17, sw, sh);
    ctx.fillRect(W / 2 - sw / 2, cy - H * 0.17 - sh, sw, sh);
  }
  if (st.logo.alpha > 0.01) {
    const size = Math.min(W, H) * 0.26 * st.logo.scale * pal.logoScale;
    ctx.globalAlpha = st.logo.alpha;
    radialGlow(ctx, W / 2, cy, size, rgba(pal.stops[2][1], 0.5), st.logo.alpha);
    ctx.globalAlpha = st.logo.alpha;
    paintLogo(ctx, logo, pal, W / 2, cy - H * 0.01, size);
    if (logoSize(logo)[0]) {
      ctx.fillStyle = rgba(pal.text, 0.8);
      ctx.font = `800 ${Math.round(H * 0.026)}px "Archivo", -apple-system, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const name = pal.name.toLocaleUpperCase("tr-TR").split("").join(" ");
      ctx.fillText(name, W / 2, cy + H * 0.215, W * 0.6);
    }
    ctx.globalAlpha = 1;
  }
  ctx.restore();
  return st;
}

/** Halka. */
function drawIris(ctx, W, H, p, logo, pal) {
  const st = irisState(p);
  if (st.t <= 0 || st.t >= 1) return st;
  const cx = W / 2;
  const cy = H / 2;
  const R = Math.hypot(W, H) / 2 + 4;
  const dr = st.disc * R;
  const hr = st.hole * R;
  const accent = pal.stops[3][1];
  ctx.save();
  // Öncü halka.
  if (st.ringAlpha > 0.01 && st.ring > 0) {
    ctx.globalAlpha = st.ringAlpha;
    ctx.strokeStyle = accent;
    ctx.lineWidth = Math.max(3, W / 240);
    ctx.beginPath(); ctx.arc(cx, cy, st.ring * R * 0.75, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  if (dr > hr + 0.5) {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(1, dr));
    g.addColorStop(0, darken(pal.stops[1][1], 0.15));
    g.addColorStop(0.55, pal.stops[0][1]);
    g.addColorStop(1, "#06020b");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, dr, 0, Math.PI * 2);
    if (hr > 0.5) ctx.arc(cx, cy, hr, 0, Math.PI * 2, true);
    ctx.fill("evenodd");
    // Disk kenarı ve delik kenarı.
    ctx.lineWidth = Math.max(4, W / 200);
    if (st.disc < 1) { ctx.strokeStyle = pal.stops[2][1]; ctx.beginPath(); ctx.arc(cx, cy, dr, 0, Math.PI * 2); ctx.stroke(); }
    if (hr > 0.5) {
      ctx.strokeStyle = accent; ctx.beginPath(); ctx.arc(cx, cy, hr, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,0.7)"; ctx.lineWidth = Math.max(1.5, W / 900); ctx.beginPath(); ctx.arc(cx, cy, hr + W / 160, 0, Math.PI * 2); ctx.stroke();
    }
  }
  const size = Math.min(W, H) * 0.28 * Math.max(0, st.logo.scale) * pal.logoScale;
  // Işınlar.
  if (st.burst > 0 && st.burst < 1) {
    const n = 16;
    const r0 = size * 0.7 + st.burst * W * 0.08;
    const r1 = r0 + W * 0.05 * (1 - st.burst) + W * 0.02;
    ctx.strokeStyle = rgba("#ffffff", 0.75 * (1 - st.burst));
    ctx.lineWidth = Math.max(2, W / 640);
    ctx.beginPath();
    for (let i = 0; i < n; i += 1) {
      const a = (i / n) * Math.PI * 2 + 0.2;
      ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
    }
    ctx.stroke();
  }
  if (st.logo.alpha > 0.01 && size > 1) {
    radialGlow(ctx, cx, cy, size * 1.05, rgba(accent, 0.6), st.logo.alpha);
    if (st.arcs > 0.01) {
      const rr = size * 0.72;
      ctx.globalAlpha = st.arcs;
      ctx.lineCap = "round";
      ctx.strokeStyle = accent;
      ctx.lineWidth = Math.max(3, W / 300);
      ctx.beginPath(); ctx.arc(cx, cy, rr, st.spin, st.spin + Math.PI * 1.35); ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,0.85)";
      ctx.lineWidth = Math.max(2, W / 640);
      ctx.beginPath(); ctx.arc(cx, cy, rr + W / 90, -st.spin * 1.3, -st.spin * 1.3 + Math.PI * 0.7); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.globalAlpha = st.logo.alpha;
    paintLogo(ctx, logo, pal, cx, cy, size);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
  return st;
}

/** Parçacık. */
function drawShards(ctx, W, H, p, logo, pal) {
  const st = shardsState(p, W, H);
  if (st.t <= 0 || st.t >= 1) return st;
  const g = shardGeometry(W, H);
  const dark = pal.stops[0][1];
  const shades = [darken(dark, 0.35), dark, darken(pal.stops[1][1], 0.25), pal.stops[1][1], darken(pal.stops[2][1], 0.2)];
  ctx.save();
  if (st.backdrop > 0.01) {
    ctx.globalAlpha = st.backdrop;
    ctx.fillStyle = darken(dark, 0.2);
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  }
  const fly = Math.max(W, H) * 0.7;
  for (const s of g.list) {
    const a = shardAt(s, st.t);
    if (a.alpha <= 0.01) continue;
    const ox = s.dirX * fly * a.k;
    const oy = s.dirY * fly * a.k;
    const cos = Math.cos(a.rot) * a.scale;
    const sin = Math.sin(a.rot) * a.scale;
    ctx.setTransform(cos, sin, -sin, cos, s.cx + ox, s.cy + oy);
    ctx.globalAlpha = a.alpha;
    // Renk: konuma ve rastgele tona göre (yüzeyli görünüm).
    ctx.fillStyle = shades[Math.min(shades.length - 1, Math.floor((s.shade * 0.6 + (1 - s.dist) * 0.4) * shades.length))];
    ctx.beginPath();
    ctx.moveTo(s.pts[0][0] - s.cx, s.pts[0][1] - s.cy);
    ctx.lineTo(s.pts[1][0] - s.cx, s.pts[1][1] - s.cy);
    ctx.lineTo(s.pts[2][0] - s.cx, s.pts[2][1] - s.cy);
    ctx.closePath();
    ctx.fill();
    if (a.k > 0.02) { ctx.strokeStyle = rgba(pal.stops[3][1], 0.7 * a.k); ctx.lineWidth = 1.5; ctx.stroke(); }
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  // Logo 3×3 parçadan birleşir / dağılır.
  if (st.logo.alpha > 0.01) {
    const size = Math.min(W, H) * 0.3 * pal.logoScale;
    const cx = W / 2;
    const cy = H / 2;
    radialGlow(ctx, cx, cy, size * 1.1, rgba(pal.stops[3][1], 0.5), st.logo.alpha * st.logo.assemble);
    const [iw, ih] = logoSize(logo);
    if (iw && ih) {
      const k = Math.min(size / iw, size / ih);
      const w = iw * k;
      const h = ih * k;
      const spread = (1 - st.logo.assemble) + st.logo.scatter * 0.8;
      for (let r = 0; r < 3; r += 1) {
        for (let c = 0; c < 3; c += 1) {
          const i = r * 3 + c;
          const dx = (rnd(i, 7) - 0.5) * W * 0.5 * spread;
          const dy = (rnd(i, 8) - 0.5) * H * 0.5 * spread;
          ctx.globalAlpha = st.logo.alpha;
          try {
            ctx.drawImage(logo, (iw / 3) * c, (ih / 3) * r, iw / 3, ih / 3, cx - w / 2 + (w / 3) * c + dx, cy - h / 2 + (h / 3) * r + dy, w / 3 + 0.5, h / 3 + 0.5);
          } catch { /* hazır değil */ }
        }
      }
    } else {
      ctx.globalAlpha = st.logo.alpha * st.logo.assemble;
      paintLogo(ctx, logo, pal, cx, cy, size);
    }
    ctx.globalAlpha = 1;
  }
  ctx.restore();
  return st;
}

/**
 * Stile göre logo geçişini çizer (kind: STINGER_KEYS). p 0…1, tam ortada örtülü.
 * Bilinmeyen tür klasik geçişe düşer.
 */
export function drawStingerKind(ctx, W, H, kind, p, logo, branding) {
  const pal = stingerPalette(branding);
  if (kind === "sweep") return drawSweep(ctx, W, H, p, logo, pal);
  if (kind === "panels") return drawPanels(ctx, W, H, p, logo, pal);
  if (kind === "iris") return drawIris(ctx, W, H, p, logo, pal);
  if (kind === "shards") return drawShards(ctx, W, H, p, logo, pal);
  return drawStinger(ctx, W, H, p, logo, branding);
}
