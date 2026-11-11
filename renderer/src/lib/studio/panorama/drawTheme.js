// Panorama rejisi · TEMA ÇİZİMLERİ (program tuvaline; ana iş parçacığı ve çizim işçisi aynı kod).
//
//   paintBackground(ctx, T, W, H)        durağan zemin: gradyan türü + doku + vinyet (bir kez çizilip
//                                        görsel kaynağa dönüşür: zemin katmanı, kameraların ALTINDA)
//   drawAmbient(ctx, T, E, holes)        zemin HAREKETİ (ışık süpürmesi, dalga, nabız, parçacık,
//                                        projektör, bokeh) — kamera / kart kutuları kırpılarak, yalnız
//                                        zeminin göründüğü yerlerde
//   drawFrames(ctx, T, E, slots)         kamera çerçeveleri (çizgi, çift, parıltı, neon, HUD köşe,
//                                        cam, kaydırılmış gölge, eğik, gradyan)
//   drawLower(ctx, L, E)                 alt yazı bandı (12 biçim; giriş / çıkış hareketi + yumuşatma)
//   drawTickerThemed(ctx, tk, E)         kayan bant (8 biçim; üstte / altta; ayraç)
//   drawClockThemed / drawLiveBug        saat (köşe, saniye) ve CANLI rozeti
//   drawLogoMark(ctx, T, E, ...)         köşe logosu + hareket (nabız, nefes, süzülme, parlama, dönme)
//   drawTitleCard(ctx, t, E)             tam ekran başlık / geri sayım / ara / sosyal medya kartı
//
// Ölçüler 1920 genişliğe göre (drawPanorama ölçekler). Tüm işlevler saf çizimdir: durum E.now'dan.
import { drawContain, drawText, fillRound, fitText, roundRect, upper, wrapLines } from "../graphics/canvas";
import { F, FC, STAGE_W, clockText, dateText, img, istanbulParts, pad2 } from "./drawKit";
import { SEP_CHARS, ease } from "./themeSchema";

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const clamp01 = (v) => clamp(v, 0, 1);
const hexRgb = (h) => { const s = String(h || "#000000").replace("#", ""); const n = parseInt(s.length === 3 ? s.split("").map((c) => c + c).join("") : s.slice(0, 6), 16) || 0; return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
export const alpha = (h, a) => { const [r, g, b] = hexRgb(h); return `rgba(${r},${g},${b},${clamp01(a)})`; };
const mixHex = (a, b, t) => { const A = hexRgb(a); const B = hexRgb(b); return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(",")})`; };
/** Deterministik sözde rastgele (doku ve parçacıklar her karede aynı yerde). */
export function rng(seed) { let s = seed >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

/** Tema yazı biçimi: başlık yazı tipi (kalınlık), büyük harf, harf aralığı. */
export const typeOf = (T) => ({ weight: T?.type?.weight || 800, upper: T?.type?.upper !== false, tracking: Number(T?.type?.tracking) || 0 });
const D = (T, px) => FC(px, typeOf(T).weight);
const caps = (T, s, force = null) => ((force ?? typeOf(T).upper) ? upper(s) : String(s ?? ""));

/* ─────────────────────────────── zemin ─────────────────────────────── */

function texture(ctx, kind, W, H, color, a) {
  if (!kind || kind === "none" || a <= 0) return;
  ctx.save();
  ctx.globalAlpha *= a;
  ctx.fillStyle = color; ctx.strokeStyle = color;
  const r = rng(kind.length * 977 + 13);
  switch (kind) {
    case "dots": for (let y = 12; y < H; y += 24) for (let x = (y / 24) % 2 ? 24 : 12; x < W; x += 24) { ctx.beginPath(); ctx.arc(x, y, 2.2, 0, Math.PI * 2); ctx.fill(); } break;
    case "grid": ctx.lineWidth = 1; ctx.beginPath(); for (let x = 0; x <= W; x += 48) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, H); } for (let y = 0; y <= H; y += 48) { ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); } ctx.stroke(); break;
    case "lines": for (let y = 0, i = 0; y < H; y += 90, i += 1) if (i % 2) ctx.fillRect(0, y, W, 90); break; // saha biçme şeritleri
    case "diagonal": ctx.lineWidth = 2; ctx.beginPath(); for (let x = -H; x < W; x += 28) { ctx.moveTo(x, H); ctx.lineTo(x + H, 0); } ctx.stroke(); break;
    case "hex": {
      ctx.lineWidth = 1.5; const s = 26; const hh = s * Math.sqrt(3);
      ctx.beginPath();
      for (let row = -1, y = 0; y < H + hh; row += 1, y += hh / 2) for (let x = (row % 2 ? s * 1.5 : 0); x < W + s * 3; x += s * 3) {
        for (let k = 0; k <= 6; k += 1) { const ang = (Math.PI / 3) * k; const px = x + s * Math.cos(ang); const py = y + s * Math.sin(ang); if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); }
      }
      ctx.stroke();
      break;
    }
    case "carbon": for (let y = 0; y < H; y += 8) for (let x = ((y / 8) % 2) * 4; x < W; x += 8) ctx.fillRect(x, y, 4, 4); break;
    case "halftone": for (let y = 10; y < H; y += 18) for (let x = 10; x < W; x += 18) { const d = 0.6 + 4.2 * (x / W) * (1 - y / H); ctx.beginPath(); ctx.arc(x, y, d, 0, Math.PI * 2); ctx.fill(); } break;
    case "paper": ctx.lineWidth = 1; for (let i = 0; i < 2600; i += 1) { const x = r() * W; const y = r() * H; const l = 4 + r() * 18; const ang = r() * Math.PI; ctx.globalAlpha = a * (0.3 + r() * 0.7); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(ang) * l, y + Math.sin(ang) * l); ctx.stroke(); } break;
    case "noise": for (let i = 0; i < 26000; i += 1) { ctx.globalAlpha = a * r(); ctx.fillRect(r() * W, r() * H, 1.6, 1.6); } break;
    case "scan": for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1.2); break;
    default: break;
  }
  ctx.restore();
}

/**
 * Durağan zemin (W×H piksel). T: brandTokens. Gradyan türü, doku ve vinyet. Program zemini olarak bir
 * kez görsel kaynağa çizilir; tema galerisi küçük resimleri de bunu kullanır.
 */
export function paintBackground(ctx, T, W, H) {
  const B = T.bgStyle || { kind: "gradient", angle: 135, texture: "none", textureOpacity: 0, vignette: 0.3 };
  const [c0, c1] = T.bg || ["#12002b", "#54009c"];
  ctx.save();
  if (B.kind === "solid") { ctx.fillStyle = c0; ctx.fillRect(0, 0, W, H); }
  else if (B.kind === "radial") {
    ctx.fillStyle = c0; ctx.fillRect(0, 0, W, H);
    const g = ctx.createRadialGradient(W * 0.5, H * 0.18, 0, W * 0.5, H * 0.35, Math.hypot(W, H) * 0.62);
    g.addColorStop(0, c1); g.addColorStop(0.55, mixHex(c1, c0, 0.6)); g.addColorStop(1, c0);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  } else if (B.kind === "mesh") {
    ctx.fillStyle = c0; ctx.fillRect(0, 0, W, H);
    const blobs = [[0.15, 0.2, T.primary], [0.85, 0.25, T.secondary], [0.7, 0.9, T.accent2 || T.accent], [0.2, 0.85, T.primary]];
    for (const [x, y, c] of blobs) {
      const g = ctx.createRadialGradient(W * x, H * y, 0, W * x, H * y, W * 0.55);
      g.addColorStop(0, alpha(c, 0.85)); g.addColorStop(1, alpha(c, 0));
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
  } else if (B.kind === "split") {
    ctx.fillStyle = c0; ctx.fillRect(0, 0, W, H);
    const a = ((B.angle ?? 120) * Math.PI) / 180;
    ctx.save(); ctx.translate(W * 0.62, H / 2); ctx.rotate(a - Math.PI / 2);
    const g = ctx.createLinearGradient(0, -H, 0, H); g.addColorStop(0, c1); g.addColorStop(1, mixHex(c1, c0, 0.4));
    ctx.fillStyle = g; ctx.fillRect(0, -W * 2, W * 2, W * 4);
    ctx.fillStyle = alpha(T.accent, 0.9); ctx.fillRect(-10, -W * 2, 10, W * 4);
    ctx.restore();
  } else {
    const a = ((B.angle ?? 135) * Math.PI) / 180;
    const cx = W / 2; const cy = H / 2; const r = Math.hypot(W, H) / 2;
    const g = ctx.createLinearGradient(cx - Math.cos(a) * r, cy - Math.sin(a) * r, cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    g.addColorStop(0, c0); g.addColorStop(0.6, mixHex(c0, c1, 0.7)); g.addColorStop(1, c1);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  const light = (T.onBg || "#ffffff") === "#ffffff";
  texture(ctx, B.texture, W, H, light ? "#ffffff" : "#000000", B.textureOpacity ?? 0.1);
  if (B.vignette > 0) {
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.6);
    g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, `rgba(0,0,0,${0.75 * B.vignette})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();
}

/* ─────────────────────────────── zemin hareketi ─────────────────────────────── */

/** holes: [{x,y,w,h}] stage px — kırpılan (kamera / kart) kutular. */
export function drawAmbient(ctx, T, E, holes = []) {
  const B = T.bgStyle;
  if (!B || B.motion === "none" || !(B.motionOpacity > 0)) return;
  const W = STAGE_W; const H = E.H; const t = E.now / 1000;
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, W, H);
  for (const h of holes) ctx.rect(h.x + h.w, h.y, -h.w, h.h); // ters yön: evenodd ile delik
  ctx.clip("evenodd");
  ctx.globalAlpha *= B.motionOpacity;
  const acc = T.accent; const acc2 = T.accent2 || T.accent;
  switch (B.motion) {
    case "sweep": {
      const x = ((t % 7) / 7) * (W + 1400) - 700;
      ctx.translate(x, 0); ctx.transform(1, 0, -0.45, 1, 0, 0);
      const g = ctx.createLinearGradient(-260, 0, 260, 0);
      g.addColorStop(0, "rgba(255,255,255,0)"); g.addColorStop(0.5, "rgba(255,255,255,0.55)"); g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g; ctx.fillRect(-260, 0, 520, H * 1.5);
      break;
    }
    case "wave": {
      for (let k = 0; k < 3; k += 1) {
        ctx.beginPath();
        const base = H * (0.62 + k * 0.1); const amp = 40 + k * 18; const ph = t * (0.5 + k * 0.22) + k * 2;
        ctx.moveTo(0, H);
        for (let x = 0; x <= W; x += 24) ctx.lineTo(x, base + Math.sin(x / (260 + k * 70) + ph) * amp);
        ctx.lineTo(W, H); ctx.closePath();
        ctx.fillStyle = alpha(k % 2 ? acc2 : acc, 0.22 - k * 0.04); ctx.fill();
      }
      break;
    }
    case "pulse": {
      const p = 0.5 + 0.5 * Math.sin(t * 2.2);
      const g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W * (0.45 + p * 0.1));
      g.addColorStop(0, alpha(acc, 0.55 * (0.5 + p * 0.5))); g.addColorStop(1, alpha(acc, 0));
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      break;
    }
    case "particles": {
      const r = rng(77);
      for (let i = 0; i < 70; i += 1) {
        const sp = 18 + r() * 50; const x0 = r() * W; const y0 = r() * H; const s = 1.5 + r() * 3.5;
        const y = (((y0 - t * sp) % H) + H) % H; const x = x0 + Math.sin(t * 0.6 + i) * 14;
        ctx.globalAlpha = B.motionOpacity * (0.35 + 0.65 * r());
        ctx.fillStyle = i % 3 ? "#ffffff" : acc; ctx.beginPath(); ctx.arc(x, y, s, 0, Math.PI * 2); ctx.fill();
      }
      break;
    }
    case "beams": {
      const beam = (ox, ang, col) => {
        ctx.save(); ctx.translate(ox, -40); ctx.rotate(ang);
        const g = ctx.createLinearGradient(0, 0, 0, H * 1.3); g.addColorStop(0, alpha(col, 0.75)); g.addColorStop(1, alpha(col, 0));
        ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-16, 0); ctx.lineTo(16, 0); ctx.lineTo(260, H * 1.3); ctx.lineTo(-260, H * 1.3); ctx.closePath(); ctx.fill();
        ctx.restore();
      };
      beam(W * 0.08, -0.5 + Math.sin(t * 0.5) * 0.25, "#ffffff");
      beam(W * 0.92, 0.5 + Math.sin(t * 0.45 + 1) * 0.25, "#ffffff");
      beam(W * 0.35, -0.15 + Math.sin(t * 0.7 + 2) * 0.3, acc);
      beam(W * 0.65, 0.15 + Math.sin(t * 0.6 + 3) * 0.3, acc2);
      break;
    }
    case "bokeh": {
      const r = rng(31);
      for (let i = 0; i < 18; i += 1) {
        const x = (r() * W + t * (10 + r() * 20) * (i % 2 ? 1 : -1) + W) % W; const y = r() * H + Math.sin(t * 0.4 + i) * 30; const rad = 40 + r() * 110;
        const g = ctx.createRadialGradient(x, y, 0, x, y, rad); const c = [acc, acc2, "#ffffff"][i % 3];
        g.addColorStop(0, alpha(c, 0.35)); g.addColorStop(0.7, alpha(c, 0.12)); g.addColorStop(1, alpha(c, 0));
        ctx.fillStyle = g; ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      }
      break;
    }
    default: break;
  }
  ctx.restore();
}

/* ─────────────────────────────── kamera çerçeveleri ─────────────────────────────── */

function slotPath(ctx, b, rad, mask) {
  ctx.beginPath();
  if (mask === "circle") { ctx.arc(b.x + b.w / 2, b.y + b.h / 2, Math.min(b.w, b.h) / 2, 0, Math.PI * 2); return; }
  if (mask === "ellipse") { ctx.ellipse(b.x + b.w / 2, b.y + b.h / 2, b.w / 2, b.h / 2, 0, 0, Math.PI * 2); return; }
  if (rad > 0 && ctx.roundRect) ctx.roundRect(b.x, b.y, b.w, b.h, rad); else ctx.rect(b.x, b.y, b.w, b.h);
}

/** slots: [{ x, y, w, h, mask, radius }] stage px (radius: kısa kenar oranı). */
export function drawFrames(ctx, T, E, slots) {
  const Fr = T.frame;
  if (!Fr || Fr.style === "none" || !slots?.length) return;
  const col = Fr.stroke || T.accent;
  const w = Math.max(1, Fr.width || 2);
  for (const b of slots) {
    const rad = Math.min(b.w, b.h) * Math.min(0.5, b.radius ?? Fr.radius ?? 0);
    const m = b.mask && b.mask !== "rect" ? b.mask : null;
    ctx.save();
    ctx.lineJoin = "round";
    switch (Fr.style) {
      case "line": slotPath(ctx, b, rad, m); ctx.lineWidth = w; ctx.strokeStyle = col; ctx.stroke(); break;
      case "double": {
        slotPath(ctx, b, rad, m); ctx.lineWidth = w; ctx.strokeStyle = col; ctx.stroke();
        const o = w * 2 + 5; slotPath(ctx, { x: b.x - o, y: b.y - o, w: b.w + o * 2, h: b.h + o * 2 }, rad ? rad + o : 0, m); ctx.lineWidth = Math.max(1, w * 0.6); ctx.stroke();
        break;
      }
      case "glow": ctx.shadowColor = col; ctx.shadowBlur = 26; slotPath(ctx, b, rad, m); ctx.lineWidth = w; ctx.strokeStyle = col; ctx.stroke(); ctx.stroke(); break;
      case "neon": {
        ctx.shadowColor = col; ctx.shadowBlur = 34; slotPath(ctx, b, rad, m); ctx.lineWidth = w * 2.2; ctx.strokeStyle = alpha(col, 0.85); ctx.stroke();
        ctx.shadowBlur = 8; ctx.lineWidth = Math.max(1, w * 0.6); ctx.strokeStyle = "rgba(255,255,255,0.95)"; ctx.stroke();
        break;
      }
      case "corners": {
        const L = Math.min(b.w, b.h) * 0.14; const o = w;
        ctx.lineWidth = w; ctx.strokeStyle = col; ctx.lineCap = "square"; ctx.beginPath();
        const x0 = b.x - o; const y0 = b.y - o; const x1 = b.x + b.w + o; const y1 = b.y + b.h + o;
        ctx.moveTo(x0, y0 + L); ctx.lineTo(x0, y0); ctx.lineTo(x0 + L, y0);
        ctx.moveTo(x1 - L, y0); ctx.lineTo(x1, y0); ctx.lineTo(x1, y0 + L);
        ctx.moveTo(x1, y1 - L); ctx.lineTo(x1, y1); ctx.lineTo(x1 - L, y1);
        ctx.moveTo(x0 + L, y1); ctx.lineTo(x0, y1); ctx.lineTo(x0, y1 - L);
        ctx.stroke();
        slotPath(ctx, b, rad, m); ctx.lineWidth = 1; ctx.strokeStyle = alpha(col, 0.35); ctx.stroke();
        break;
      }
      case "glass": {
        slotPath(ctx, b, rad, m); ctx.lineWidth = w + 2; ctx.strokeStyle = "rgba(255,255,255,0.28)"; ctx.stroke();
        ctx.clip();
        const g = ctx.createLinearGradient(0, b.y, 0, b.y + b.h * 0.35); g.addColorStop(0, "rgba(255,255,255,0.18)"); g.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = g; ctx.fillRect(b.x, b.y, b.w, b.h * 0.35);
        break;
      }
      case "offset": {
        const o = Math.max(8, w * 5);
        ctx.beginPath(); ctx.rect(b.x + o, b.y + o, b.w, b.h); ctx.rect(b.x + b.w, b.y, -b.w, b.h); ctx.clip("evenodd");
        ctx.fillStyle = col; ctx.fillRect(b.x + o, b.y + o, b.w, b.h);
        ctx.restore(); ctx.save();
        slotPath(ctx, b, 0, m); ctx.lineWidth = w; ctx.strokeStyle = col; ctx.stroke();
        break;
      }
      case "bevel": {
        const c = Math.min(b.w, b.h) * 0.08;
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.moveTo(b.x - 1, b.y - 1); ctx.lineTo(b.x + c, b.y - 1); ctx.lineTo(b.x - 1, b.y + c); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(b.x + b.w + 1, b.y + b.h + 1); ctx.lineTo(b.x + b.w - c, b.y + b.h + 1); ctx.lineTo(b.x + b.w + 1, b.y + b.h - c); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(b.x + c, b.y); ctx.lineTo(b.x + b.w, b.y); ctx.lineTo(b.x + b.w, b.y + b.h - c); ctx.lineTo(b.x + b.w - c, b.y + b.h); ctx.lineTo(b.x, b.y + b.h); ctx.lineTo(b.x, b.y + c); ctx.closePath();
        ctx.lineWidth = w; ctx.strokeStyle = col; ctx.stroke();
        break;
      }
      case "gradient": {
        const g = ctx.createLinearGradient(b.x, b.y, b.x + b.w, b.y + b.h); g.addColorStop(0, col); g.addColorStop(1, T.accent2 || "#ffffff");
        slotPath(ctx, b, rad, m); ctx.lineWidth = w; ctx.strokeStyle = g; ctx.stroke();
        break;
      }
      default: break;
    }
    ctx.restore();
  }
}

/* ─────────────────────────────── giriş / çıkış ─────────────────────────────── */

/**
 * Grafik öğesinin görünürlüğü: at (gösterildi), hideAt (gizlendi; çıkış hareketi), ms, easing.
 * → { k (0…1 kaplama), e (yumuşatılmış giriş; bounce'ta 1'i aşabilir), out (çıkıyor mu) } | null (çizilmez).
 */
export function graphicPhase(now, at, hideAt, ms = 500, easing = "smooth") {
  if (!at || now < at) return null;
  if (hideAt && now >= hideAt) {
    const p = clamp01((now - hideAt) / ms);
    if (p >= 1) return null;
    const e = ease("smooth", 1 - p);
    return { k: e, e, out: true };
  }
  const p = clamp01((now - at) / ms);
  return { k: ease("smooth", p), e: ease(easing, p), out: false };
}

/* ─────────────────────────────── alt yazı bandı ─────────────────────────────── */

const LOWER_H = { classic: 132, slab: 128, glass: 118, split: 112, ribbon: 112, minimal: 100, neon: 116, editorial: 128, sport: 116, pill: 96, stack: 140, hud: 120 };
export const lowerHeight = (style) => LOWER_H[style] || 120;

/**
 * L: { item: { kind, title, subtitle, kicker, logo, color, style }, at, hideAt }. Stil: item.style ||
 * T.lower.style. item.color: öğeye özel vurgu (tek öğenin rengi — per-element override).
 */
export function drawLower(ctx, L, E) {
  const { T, M } = E;
  const it = L?.item;
  if (!it) return;
  const cfg = T.lower || { style: "classic", align: "left", width: 0.46, y: 150, accentBar: true, logo: true, upper: true };
  const an = T.anim || { in: "slide", ms: 520, easing: "smooth" };
  const ph = graphicPhase(E.now, L.at, L.hideAt, an.ms, an.easing);
  if (!ph) return;
  const style = it.style || cfg.style;
  const acc = it.color || T.accent;
  const accText = it.color ? (hexRgb(it.color).reduce((s, v) => s + v, 0) > 420 ? "#0b0b12" : "#ffffff") : T.accentText;
  const up = cfg.upper && typeOf(T).upper;
  const tr = typeOf(T).tracking;
  const h = lowerHeight(style);
  const w = Math.round(STAGE_W * (it.width || cfg.width));
  const x0 = cfg.align === "center" ? (STAGE_W - w) / 2 : cfg.align === "right" ? STAGE_W - 70 - w : 70;
  const tickerPad = E.tickerBottom ? (E.tickerH || 60) + 18 : 0;
  const y0 = E.H - cfg.y - h - Math.max(0, tickerPad - 40);
  const title = up ? upper(it.title) : String(it.title || "");
  const sub = String(it.subtitle || "");
  const kicker = it.kicker ? upper(it.kicker) : "";
  const logo = cfg.logo ? img(it.logo || (it.kind === "sponsor" ? T.logo2 || T.logo : T.logo)) : null;
  const inKind = an.in || "slide";
  // Hareket: zemin şekli soldan açılır (wipe), yazı hafif gecikmeyle kayarak belirir.
  const reveal = inKind === "fade" || inKind === "none" ? 1 : clamp01(ph.e * 1.15);
  const textA = clamp01((ph.k - (ph.out ? 0 : 0.25)) / 0.75);
  const dy = inKind === "rise" ? (1 - ph.e) * 60 : 0;
  ctx.save();
  if (inKind === "fade") ctx.globalAlpha *= ph.k;
  else if (inKind === "zoom") { const s = 0.85 + 0.15 * ph.e; ctx.translate(x0 + w / 2, y0 + h / 2); ctx.scale(s, s); ctx.translate(-(x0 + w / 2), -(y0 + h / 2)); ctx.globalAlpha *= ph.k; }
  else if (inKind === "flip") { ctx.translate(0, y0 + h / 2); ctx.scale(1, Math.max(0.01, ph.e)); ctx.translate(0, -(y0 + h / 2)); }
  ctx.translate(0, dy);
  const clipW = (cw) => { ctx.beginPath(); const rw = (cw + 80) * reveal; if (cfg.align === "right") ctx.rect(x0 + w - rw, y0 - 60, rw + 60, h + 120); else if (cfg.align === "center") ctx.rect(x0 + w / 2 - rw / 2, y0 - 60, rw, h + 120); else ctx.rect(x0 - 60, y0 - 60, rw + 60, h + 120); ctx.clip(); };
  clipW(w);
  const tf = (px) => D(T, px);
  const lx = logo ? h * 0.92 : 0;
  const tx = x0 + 28 + lx;
  const tw = w - 56 - lx;
  const T1 = (y, px, color, extra = {}) => drawText(ctx, fitText(title, tw, tf(px), M, tr), tx, y, { font: tf(px), color, spacing: tr, alpha: textA, ...extra });
  const T2 = (y, px, color, font = null) => drawText(ctx, fitText(sub, tw, font || F(px, 600), M), tx, y, { font: font || F(px, 600), color, alpha: textA });
  const K = (y, color) => kicker && drawText(ctx, kicker, tx, y, { font: F(16, 800), color, spacing: 2, alpha: textA });
  const drawLogo = (bg) => { if (!logo) return; if (bg) fillRound(ctx, x0, y0, h, h, 0, bg); drawContain(ctx, logo, x0 + h * 0.14, y0 + h * 0.14, h * 0.72, h * 0.72); };
  switch (style) {
    case "classic": {
      fillRound(ctx, x0, y0, w, h * 0.62, 0, T.head);
      fillRound(ctx, x0, y0 + h * 0.62, w * 0.82, h * 0.38, 0, T.panel);
      if (cfg.accentBar) { ctx.fillStyle = acc; ctx.fillRect(x0, y0, 10, h); }
      drawLogo(acc);
      T1(y0 + h * 0.31, 50, T.headText);
      T2(y0 + h * 0.81, 24, T.text);
      if (kicker) { const kw = M(kicker, F(16, 800)) + 28; fillRound(ctx, x0 + w - kw - 14, y0 - 30, kw, 30, 0, acc); drawText(ctx, kicker, x0 + w - kw, y0 - 15, { font: F(16, 800), color: accText, spacing: 2, alpha: textA }); }
      break;
    }
    case "slab": {
      ctx.save(); ctx.shadowColor = "rgba(0,0,0,0.45)"; ctx.shadowBlur = 30; ctx.shadowOffsetY = 10; fillRound(ctx, x0, y0, w, h, 0, acc); ctx.restore();
      fillRound(ctx, x0 + 12, y0 + 12, w - 24, h - 24, 0, T.panel);
      drawLogo(null);
      K(y0 + 32, acc);
      T1(y0 + (kicker ? 66 : 52), 56, T.text);
      T2(y0 + h - 30, 22, T.muted);
      break;
    }
    case "glass": {
      ctx.save(); ctx.shadowColor = "rgba(0,0,0,0.35)"; ctx.shadowBlur = 40; fillRound(ctx, x0, y0, w, h, 22, "rgba(15,18,30,0.55)"); ctx.restore();
      roundRect(ctx, x0, y0, w, h, 22); ctx.lineWidth = 1.5; ctx.strokeStyle = "rgba(255,255,255,0.35)"; ctx.stroke();
      const g = ctx.createLinearGradient(0, y0, 0, y0 + h * 0.5); g.addColorStop(0, "rgba(255,255,255,0.22)"); g.addColorStop(1, "rgba(255,255,255,0)"); fillRound(ctx, x0, y0, w, h * 0.5, [22, 22, 0, 0], g);
      if (cfg.accentBar) fillRound(ctx, x0 + 18 + lx, y0 + h - 18, 90, 5, 3, acc);
      if (logo) drawContain(ctx, logo, x0 + 16, y0 + h * 0.16, h * 0.68, h * 0.68);
      K(y0 + 26, acc);
      T1(y0 + (kicker ? 58 : 46), 46, "#ffffff");
      T2(y0 + h - 38, 22, "rgba(255,255,255,0.82)");
      break;
    }
    case "split": {
      const sk = 34;
      ctx.fillStyle = acc; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + w * 0.36 + sk, y0); ctx.lineTo(x0 + w * 0.36, y0 + h); ctx.lineTo(x0, y0 + h); ctx.closePath(); ctx.fill();
      ctx.fillStyle = T.head; ctx.beginPath(); ctx.moveTo(x0 + w * 0.36 + sk + 6, y0); ctx.lineTo(x0 + w, y0); ctx.lineTo(x0 + w - sk, y0 + h); ctx.lineTo(x0 + w * 0.36 + 6, y0 + h); ctx.closePath(); ctx.fill();
      if (logo) drawContain(ctx, logo, x0 + 18, y0 + 14, w * 0.36 - 36, h - 28);
      else drawText(ctx, fitText(kicker || caps(T, it.kind === "sponsor" ? "SPONSOR" : "KONUK"), w * 0.33 - 30, tf(40), M), x0 + 24, y0 + h / 2, { font: tf(40), color: accText, alpha: textA });
      const sx = x0 + w * 0.36 + sk + 28; const sw = w * 0.64 - sk * 2 - 40;
      drawText(ctx, fitText(title, sw, tf(48), M, tr), sx, y0 + h * 0.4, { font: tf(48), color: T.headText, spacing: tr, alpha: textA });
      drawText(ctx, fitText(sub, sw, F(22, 600), M), sx, y0 + h * 0.76, { font: F(22, 600), color: alpha(T.headText === "#ffffff" ? "#ffffff" : "#000000", 0.8), alpha: textA });
      break;
    }
    case "ribbon": {
      const fold = 22;
      ctx.fillStyle = mixHex(acc, "#000000", 0.4); ctx.beginPath(); ctx.moveTo(x0, y0 + h); ctx.lineTo(x0 + fold, y0 + h + fold); ctx.lineTo(x0 + fold, y0 + h); ctx.fill();
      ctx.fillStyle = acc; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + w, y0); ctx.lineTo(x0 + w - 30, y0 + h / 2); ctx.lineTo(x0 + w, y0 + h); ctx.lineTo(x0, y0 + h); ctx.closePath(); ctx.fill();
      fillRound(ctx, x0 + 10, y0 + h * 0.62, w * 0.7, h * 0.5, 0, T.panel);
      drawLogo(null);
      T1(y0 + h * 0.32, 48, accText);
      T2(y0 + h * 0.87, 22, T.text);
      break;
    }
    case "minimal": {
      ctx.save(); ctx.shadowColor = "rgba(0,0,0,0.6)"; ctx.shadowBlur = 16;
      T1(y0 + h * 0.36, 54, T.onBg === "#ffffff" || E.overVideo ? "#ffffff" : T.onBg);
      T2(y0 + h * 0.86, 24, T.onBg === "#ffffff" || E.overVideo ? "rgba(255,255,255,0.86)" : T.onBg);
      ctx.restore();
      if (cfg.accentBar) { ctx.fillStyle = acc; ctx.fillRect(tx, y0 + h * 0.62, Math.min(tw, 140) * reveal, 4); }
      if (logo) drawContain(ctx, logo, x0, y0 + h * 0.08, h * 0.8, h * 0.8);
      break;
    }
    case "neon": {
      ctx.save(); ctx.shadowColor = acc; ctx.shadowBlur = 30; fillRound(ctx, x0, y0, w, h, 10, "rgba(5,2,20,0.82)"); roundRect(ctx, x0, y0, w, h, 10); ctx.lineWidth = 3; ctx.strokeStyle = acc; ctx.stroke(); ctx.restore();
      roundRect(ctx, x0 + 1, y0 + 1, w - 2, h - 2, 10); ctx.lineWidth = 1; ctx.strokeStyle = "rgba(255,255,255,0.8)"; ctx.stroke();
      if (logo) drawContain(ctx, logo, x0 + 16, y0 + h * 0.15, h * 0.7, h * 0.7);
      ctx.save(); ctx.shadowColor = acc; ctx.shadowBlur = 18; T1(y0 + h * 0.38, 48, "#ffffff"); ctx.restore();
      T2(y0 + h * 0.76, 22, T.accent2 || acc);
      break;
    }
    case "editorial": {
      ctx.save(); ctx.globalAlpha *= 0.92; fillRound(ctx, x0, y0, w, h, 0, T.panel); ctx.restore();
      ctx.fillStyle = T.text; ctx.fillRect(x0 + 28 + lx, y0 + 18, Math.min(tw, 70), 3);
      drawLogo(null);
      const serif = tf(52);
      drawText(ctx, fitText(title, tw, serif, M, tr), tx, y0 + h * 0.46, { font: serif, color: T.text, spacing: tr, alpha: textA });
      drawText(ctx, fitText(kicker ? `${kicker} — ${sub}` : sub, tw, `italic ${F(22, 500)}`, M), tx, y0 + h * 0.8, { font: `italic ${F(22, 500)}`, color: T.muted, alpha: textA });
      ctx.fillStyle = acc; ctx.fillRect(x0, y0 + h - 4, w * reveal, 4);
      break;
    }
    case "sport": {
      const sk = 26;
      const num = it.number ? String(it.number) : "";
      const nw = num ? 110 : 0;
      ctx.fillStyle = T.head; ctx.beginPath(); ctx.moveTo(x0 + sk, y0); ctx.lineTo(x0 + w, y0); ctx.lineTo(x0 + w - sk, y0 + h * 0.66); ctx.lineTo(x0, y0 + h * 0.66); ctx.closePath(); ctx.fill();
      ctx.fillStyle = acc; ctx.beginPath(); ctx.moveTo(x0, y0 + h * 0.66 + 4); ctx.lineTo(x0 + w * 0.7, y0 + h * 0.66 + 4); ctx.lineTo(x0 + w * 0.7 - sk * 0.5, y0 + h); ctx.lineTo(x0 - sk * 0.5, y0 + h); ctx.closePath(); ctx.fill();
      if (num) { ctx.fillStyle = acc; ctx.beginPath(); ctx.moveTo(x0 + sk, y0); ctx.lineTo(x0 + sk + nw, y0); ctx.lineTo(x0 + nw, y0 + h * 0.66); ctx.lineTo(x0, y0 + h * 0.66); ctx.closePath(); ctx.fill(); drawText(ctx, num, x0 + sk / 2 + nw / 2, y0 + h * 0.34, { font: tf(58), color: accText, align: "center", alpha: textA }); }
      else if (logo) drawContain(ctx, logo, x0 + sk + 6, y0 + 10, h * 0.66 - 20, h * 0.66 - 20);
      const sx = x0 + sk + (num ? nw + 10 : logo ? h * 0.66 : 10) + 8;
      drawText(ctx, fitText(title, w - (sx - x0) - 50, tf(52), M, tr), sx, y0 + h * 0.34, { font: tf(52), color: T.headText, spacing: tr, alpha: textA });
      drawText(ctx, fitText(upper(sub), w * 0.66 - 40, F(20, 800), M), x0 + 20, y0 + h * 0.84, { font: F(20, 800), color: accText, spacing: 1, alpha: textA });
      break;
    }
    case "pill": {
      ctx.save(); ctx.shadowColor = "rgba(0,0,0,0.3)"; ctx.shadowBlur = 24; ctx.shadowOffsetY = 6; fillRound(ctx, x0, y0, w, h, h / 2, T.panel); ctx.restore();
      fillRound(ctx, x0 + 8, y0 + 8, h - 16, h - 16, (h - 16) / 2, acc);
      if (logo) drawContain(ctx, logo, x0 + 8 + (h - 16) * 0.18, y0 + 8 + (h - 16) * 0.18, (h - 16) * 0.64, (h - 16) * 0.64);
      else drawText(ctx, caps(T, String(it.title || "?").trim().charAt(0), true), x0 + h / 2, y0 + h / 2, { font: tf(44), color: accText, align: "center", alpha: textA });
      const px = x0 + h + 10; const pw = w - h - 40;
      drawText(ctx, fitText(title, pw, tf(40), M, tr), px, y0 + h * 0.38, { font: tf(40), color: T.text, spacing: tr, alpha: textA });
      drawText(ctx, fitText(sub, pw, F(21, 600), M), px, y0 + h * 0.72, { font: F(21, 600), color: T.muted, alpha: textA });
      break;
    }
    case "stack": {
      const h1 = h * 0.46; const h2 = h * 0.3;
      fillRound(ctx, x0, y0 + h - h1 - h2 - 10, Math.min(w, M(kicker || " ", F(18, 800)) + 40), 26, 0, acc);
      K(y0 + h - h1 - h2 + 3, accText);
      fillRound(ctx, x0, y0 + h - h1 - h2 + 16, w, h1, 0, T.head);
      fillRound(ctx, x0, y0 + h - h2 + 16, w * 0.75, h2, 0, T.panel);
      if (logo) drawContain(ctx, logo, x0 + w - h1 - 6, y0 + h - h1 - h2 + 20, h1 - 8, h1 - 8);
      drawText(ctx, fitText(title, w - 60 - (logo ? h1 : 0), tf(46), M, tr), x0 + 24, y0 + h - h1 / 2 - h2 + 16, { font: tf(46), color: T.headText, spacing: tr, alpha: textA });
      drawText(ctx, fitText(sub, w * 0.75 - 40, F(22, 600), M), x0 + 24, y0 + h - h2 / 2 + 16, { font: F(22, 600), color: T.text, alpha: textA });
      break;
    }
    case "hud": {
      const c = 18;
      ctx.fillStyle = "rgba(2,6,23,0.78)"; ctx.beginPath(); ctx.moveTo(x0 + c, y0); ctx.lineTo(x0 + w, y0); ctx.lineTo(x0 + w, y0 + h - c); ctx.lineTo(x0 + w - c, y0 + h); ctx.lineTo(x0, y0 + h); ctx.lineTo(x0, y0 + c); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = acc; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = acc; ctx.fillRect(x0 + w - 70, y0 + 10, 50, 4); ctx.fillRect(x0 + w - 40, y0 + 18, 20, 4);
      if (logo) drawContain(ctx, logo, x0 + 16, y0 + h * 0.15, h * 0.7, h * 0.7);
      K(y0 + 26, acc);
      T1(y0 + (kicker ? 60 : 48), 48, "#ffffff");
      drawText(ctx, fitText(`> ${sub}`, tw, F(21, 600), M), tx, y0 + h - 30, { font: F(21, 600), color: T.accent2 || acc, alpha: textA });
      break;
    }
    default: break;
  }
  ctx.restore();
}

/* ─────────────────────────────── kayan bant ─────────────────────────────── */

export const tickerY = (cfg, H) => (cfg?.position === "top" ? 0 : H - (cfg?.height || 60) - 18);

/** tk: { items, label, speed }. T.tickerCfg: biçim, yer, yükseklik, ayraç. */
export function drawTickerThemed(ctx, tk, E, shift) {
  const { T, M } = E;
  if (!tk?.items?.length) return;
  const cfg = T.tickerCfg || { style: T.tickerStyle || "solid", position: "bottom", height: 60, sep: "dot" };
  const style = cfg.style || "solid";
  const H = cfg.height || 60;
  const top = cfg.position === "top";
  const y = top ? 0 : E.H - H - 18;
  const full = !["glass", "pill"].includes(style);
  const x0 = full ? 0 : 24;
  const W = full ? STAGE_W : STAGE_W - 48;
  const acc = T.accent;
  ctx.save();
  switch (style) {
    case "glass": fillRound(ctx, x0, y, W, H, 14, T.glass); break;
    case "minimal": ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(0, y, STAGE_W, H); ctx.fillStyle = acc; ctx.fillRect(0, top ? y + H - 3 : y, STAGE_W, 3); break;
    case "split": ctx.fillStyle = T.ticker; ctx.globalAlpha *= 0.96; ctx.fillRect(0, y, STAGE_W, H); ctx.globalAlpha = 1; ctx.fillStyle = acc; ctx.fillRect(0, top ? y : y + H - 6, STAGE_W, 6); break;
    case "neon": ctx.fillStyle = "rgba(4,2,16,0.85)"; ctx.fillRect(0, y, STAGE_W, H); ctx.shadowColor = acc; ctx.shadowBlur = 18; ctx.fillStyle = acc; ctx.fillRect(0, y, STAGE_W, 2); ctx.fillRect(0, y + H - 2, STAGE_W, 2); break;
    case "pill": ctx.shadowColor = "rgba(0,0,0,0.3)"; ctx.shadowBlur = 20; fillRound(ctx, x0, y, W, H, H / 2, T.panel); break;
    case "ribbon": ctx.fillStyle = T.head; ctx.fillRect(0, y, STAGE_W, H); ctx.fillStyle = alpha(acc, 0.9); ctx.fillRect(0, y + 4, STAGE_W, 2); ctx.fillRect(0, y + H - 6, STAGE_W, 2); break;
    case "editorial": ctx.fillStyle = alpha(T.panel, 0.95); ctx.fillRect(0, y, STAGE_W, H); ctx.fillStyle = T.text; ctx.fillRect(0, y, STAGE_W, 2); ctx.fillRect(0, y + H - 1, STAGE_W, 1); break;
    default: ctx.fillStyle = T.ticker; ctx.globalAlpha *= 0.94; ctx.fillRect(0, y, STAGE_W, H);
  }
  ctx.restore();
  const label = caps(T, tk.label || "");
  const lf = D(T, Math.round(H * 0.52));
  const lw = label ? M(label, lf) + 52 : 0;
  let textColor = T.tickerText;
  if (label) {
    if (style === "split") { ctx.fillStyle = acc; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(lw + 26, y); ctx.lineTo(lw, y + H); ctx.lineTo(0, y + H); ctx.closePath(); ctx.fill(); }
    else if (style === "glass") fillRound(ctx, x0, y, lw, H, 14, acc);
    else if (style === "pill") fillRound(ctx, x0 + 6, y + 6, lw - 6, H - 12, (H - 12) / 2, acc);
    else if (style === "ribbon") { ctx.fillStyle = acc; ctx.beginPath(); ctx.moveTo(0, y - 6); ctx.lineTo(lw + 10, y - 6); ctx.lineTo(lw + 34, y + H / 2); ctx.lineTo(lw + 10, y + H + 6); ctx.lineTo(0, y + H + 6); ctx.closePath(); ctx.fill(); }
    else if (style === "neon") { ctx.save(); ctx.shadowColor = acc; ctx.shadowBlur = 16; ctx.strokeStyle = acc; ctx.lineWidth = 2; roundRect(ctx, 10, y + 8, lw - 10, H - 16, 6); ctx.stroke(); ctx.restore(); }
    else if (style === "editorial") { ctx.fillStyle = T.text; ctx.fillRect(0, y, lw, H); }
    else if (style !== "minimal") { ctx.fillStyle = acc; ctx.fillRect(0, y, lw, H); }
    const lc = style === "minimal" || style === "neon" ? acc : style === "editorial" ? T.panel : T.accentText;
    drawText(ctx, label, x0 + (style === "pill" ? 30 : 26), y + H / 2, { font: lf, color: lc, spacing: typeOf(T).tracking });
  }
  if (style === "glass" || style === "minimal" || style === "neon") textColor = "#ffffff";
  if (style === "pill" || style === "editorial") textColor = T.text;
  if (style === "ribbon") textColor = T.headText;
  const sep = `   ${SEP_CHARS[cfg.sep] || "•"}   `;
  const line = tk.items.join(sep) + sep;
  const f = F(Math.round(H * 0.4), 700);
  const w = M(line, f);
  const off = typeof shift === "function" ? shift(E.now, tk.speed || 120, w) : 0;
  const startX = x0 + lw + (style === "split" || style === "ribbon" ? 30 : 0);
  const endX = x0 + W - (style === "pill" ? 20 : 0);
  ctx.save();
  ctx.beginPath(); ctx.rect(startX, y, endX - startX, H); ctx.clip();
  ctx.font = f; ctx.fillStyle = textColor; ctx.textBaseline = "middle"; ctx.textAlign = "left";
  if (w > 0) for (let x = startX + 20 - off; x < endX; x += w) ctx.fillText(line, x, y + H / 2 + 1);
  ctx.restore();
}

/* ─────────────────────────────── saat ve canlı rozeti ─────────────────────────────── */

/** Köşe yerleşimi: üst köşeler künye / üst bant altında, alt köşeler alt bant üstünde. */
export function cornerOf(pos, w, h, E, { below = 0 } = {}) {
  const m = 30;
  const topY = (E.tickerTop ? (E.tickerH || 60) + 12 : 16) + below;
  const botY = E.H - h - (E.tickerBottom ? (E.tickerH || 60) + 34 : 26);
  return { x: pos.endsWith("l") ? m : STAGE_W - m - w, y: pos.startsWith("t") ? topY : botY };
}

export function drawClockThemed(ctx, T, E) {
  const c = T.clock || { style: "box", pos: "tr" };
  if (c.style === "off") return;
  const now = Date.now();
  const p = istanbulParts(now);
  const hm = c.seconds ? `${pad2(p.h)}:${pad2(p.m)}:${pad2(p.s)}` : clockText(now);
  const pos = c.pos || "tr";
  const below = pos === "tl" && E.headerOn ? 100 : 0;
  if (c.style === "minimal") {
    const f = D(T, 54); const w = E.M(hm, f) + 20; const { x, y } = cornerOf(pos, w, 70, E, { below });
    ctx.save(); ctx.shadowColor = "rgba(0,0,0,0.5)"; ctx.shadowBlur = 10;
    drawText(ctx, hm, x + w - 10, y + 36, { font: f, color: E.overVideo ? "#ffffff" : T.onBg || "#ffffff", align: "right" });
    ctx.restore();
    return;
  }
  if (c.style === "digital") {
    const cw = c.seconds ? 250 : 190; const { x, y } = cornerOf(pos, cw, 74, E, { below });
    fillRound(ctx, x, y, cw, 74, 12, "rgba(0,0,0,0.6)");
    ctx.save(); ctx.shadowColor = T.accent; ctx.shadowBlur = 14;
    drawText(ctx, hm, x + cw / 2, y + 38, { font: FC(52, 800), color: T.accent, align: "center" });
    ctx.restore();
    return;
  }
  if (c.style === "pill") {
    const f = D(T, 34); const w = E.M(hm, f) + 70; const { x, y } = cornerOf(pos, w, 56, E, { below });
    fillRound(ctx, x, y, w, 56, 28, T.panel);
    ctx.fillStyle = T.accent; ctx.beginPath(); ctx.arc(x + 28, y + 28, 7, 0, Math.PI * 2); ctx.fill();
    drawText(ctx, hm, x + 46, y + 29, { font: f, color: T.text });
    return;
  }
  const dt = dateText(now).split(", ");
  // Kutu genişliği yazı tipine göre (geniş başlık yazı tipinde saat tarihle çakışmasın).
  const tf = FC(50, 800);
  const dw = Math.max(E.M(dt[0], F(16, 700)), E.M(dt[1] || "", F(15, 600)));
  const cw = Math.max(c.seconds ? 360 : 300, 24 + E.M(hm, tf) + 22 + dw + 24); const hh = 74;
  const { x, y } = cornerOf(pos, cw, hh, E, { below });
  fillRound(ctx, x, y, cw, hh, 16, T.glass);
  drawText(ctx, hm, x + 24, y + hh / 2, { font: tf, color: "#ffffff" });
  drawText(ctx, dt[0], x + cw - 24, y + hh / 2 - 12, { font: F(16, 700), color: "#ffffff", align: "right" });
  drawText(ctx, dt[1] || "", x + cw - 24, y + hh / 2 + 12, { font: F(15, 600), color: "rgba(255,255,255,0.75)", align: "right" });
}

export function drawLiveBug(ctx, T, E, on = null) {
  const lb = T.liveBug || { on: false };
  if (!(on ?? lb.on)) return;
  const txt = upper(lb.text || "CANLI");
  const f = F(22, 900);
  const tw = E.M(txt, f);
  const pos = lb.pos || "tl";
  const clockSame = (T.clock?.pos || "tr") === pos && T.clock?.style !== "off";
  const below = (pos === "tl" && E.headerOn ? 100 : 0) + (clockSame ? 90 : 0);
  const blink = 0.5 + 0.5 * Math.sin((E.now / 1000) * Math.PI * 2);
  const w = tw + 56; const h = 44;
  const { x, y } = cornerOf(pos, w, h, E, { below });
  const dot = (cx, cy, col) => { ctx.save(); ctx.globalAlpha *= lb.style === "blink" ? 0.3 + 0.7 * blink : 1; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(cx, cy, 7, 0, Math.PI * 2); ctx.fill(); ctx.restore(); };
  switch (lb.style) {
    case "dot": ctx.save(); ctx.shadowColor = "rgba(0,0,0,0.6)"; ctx.shadowBlur = 8; dot(x + 14, y + h / 2, T.live); drawText(ctx, txt, x + 30, y + h / 2, { font: f, color: "#ffffff", spacing: 2 }); ctx.restore(); break;
    case "pill": fillRound(ctx, x, y, w, h, h / 2, "rgba(0,0,0,0.6)"); dot(x + 22, y + h / 2, T.live); drawText(ctx, txt, x + 38, y + h / 2, { font: f, color: "#ffffff", spacing: 2 }); break;
    case "tag": ctx.fillStyle = T.live; ctx.beginPath(); ctx.moveTo(x + 12, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w - 12, y + h); ctx.lineTo(x, y + h); ctx.closePath(); ctx.fill(); dot(x + 26, y + h / 2, T.liveText); drawText(ctx, txt, x + 40, y + h / 2, { font: f, color: T.liveText, spacing: 2 }); break;
    case "blink": fillRound(ctx, x, y, w, h, 6, "rgba(0,0,0,0.65)"); roundRect(ctx, x, y, w, h, 6); ctx.strokeStyle = T.live; ctx.lineWidth = 2; ctx.stroke(); dot(x + 20, y + h / 2, T.live); drawText(ctx, txt, x + 36, y + h / 2, { font: f, color: "#ffffff", spacing: 2 }); break;
    default: fillRound(ctx, x, y, w, h, 4, T.live); dot(x + 20, y + h / 2, T.liveText); drawText(ctx, txt, x + 36, y + h / 2, { font: f, color: T.liveText, spacing: 2 });
  }
}

/* ─────────────────────────────── köşe logosu ─────────────────────────────── */

export function drawLogoMark(ctx, T, E) {
  const wm = T.watermark;
  if (!wm || wm.pos === "off") return;
  const im = img(wm.which === "logo2" ? T.logo2 || T.logo : T.logo || T.logo2);
  if (!im) return;
  const s = wm.size || 110;
  const t = E.now / 1000;
  const below = wm.pos === "tl" && E.headerOn ? 100 : wm.pos === "tr" && T.clock?.style !== "off" && (T.clock?.pos || "tr") === "tr" ? 100 : 0;
  const { x, y } = cornerOf(wm.pos, s, s, E, { below });
  ctx.save();
  ctx.globalAlpha *= wm.opacity ?? 0.85;
  const cx = x + s / 2; const cy = y + s / 2;
  switch (wm.anim) {
    case "pulse": { const k = 1 + 0.06 * Math.sin(t * 3); ctx.translate(cx, cy); ctx.scale(k, k); ctx.translate(-cx, -cy); break; }
    case "breathe": ctx.globalAlpha *= 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(t * 1.6)); break;
    case "float": ctx.translate(0, Math.sin(t * 1.4) * 8); break;
    case "spin": { const k = Math.cos(t * 1.2); ctx.translate(cx, cy); ctx.scale(Math.abs(k) < 0.05 ? 0.05 : k, 1); ctx.translate(-cx, -cy); break; }
    default: break;
  }
  drawContain(ctx, im, x, y, s, s);
  if (wm.anim === "shine") {
    const p = ((t % 4) / 4) * 2.4 - 0.7;
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, s, s); ctx.clip();
    ctx.globalCompositeOperation = "lighter";
    const g = ctx.createLinearGradient(x + s * p - s * 0.3, y, x + s * p + s * 0.3, y + s);
    g.addColorStop(0, "rgba(255,255,255,0)"); g.addColorStop(0.5, "rgba(255,255,255,0.45)"); g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g; ctx.fillRect(x, y, s, s);
    ctx.restore();
  }
  ctx.restore();
}

/* ─────────────────────────────── tam ekran başlık kartı ─────────────────────────────── */

export function countdownText(target, now) {
  const t = Date.parse(target);
  if (!Number.isFinite(t)) return "--:--";
  const s = Math.max(0, Math.round((t - now) / 1000));
  const d = Math.floor(s / 86400); const h = Math.floor((s % 86400) / 3600); const m = Math.floor((s % 3600) / 60); const ss = s % 60;
  return d > 0 ? `${d}g ${pad2(h)}:${pad2(m)}:${pad2(ss)}` : h > 0 ? `${pad2(h)}:${pad2(m)}:${pad2(ss)}` : `${pad2(m)}:${pad2(ss)}`;
}

/** t: { item: { kind: title|countdown|break|social, title, subtitle, target, handles[], style, color }, at, hideAt }. */
export function drawTitleCard(ctx, t, E) {
  const { T, M } = E;
  const it = t?.item;
  if (!it) return;
  const an = T.anim || { ms: 520, easing: "smooth" };
  const ph = graphicPhase(E.now, t.at, t.hideAt, Math.max(400, an.ms), an.easing);
  if (!ph) return;
  const W = STAGE_W; const H = E.H;
  const acc = it.color || T.accent;
  const style = it.style || T.titleCard?.style || "center";
  const tr = typeOf(T).tracking;
  ctx.save();
  ctx.globalAlpha *= ph.k;
  // Zemin: tema gradyanı + vurgu şekilleri.
  const g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, T.bg?.[0] || "#000"); g.addColorStop(1, T.bg?.[1] || "#222");
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const s = 0.92 + 0.08 * ph.e;
  ctx.translate(W / 2, H / 2); ctx.scale(s, s); ctx.translate(-W / 2, -H / 2);
  const onBg = T.onBg || "#ffffff";
  const title = caps(T, it.title || "");
  const sub = String(it.subtitle || "");
  let big = title;
  if (it.kind === "countdown") big = countdownText(it.target, Date.now());
  if (it.kind === "break") big = clockText(Date.now());
  const head = it.kind === "countdown" || it.kind === "break" ? title : "";
  switch (style) {
    case "left": {
      ctx.fillStyle = acc; ctx.fillRect(140, H * 0.3, 14, H * 0.4);
      if (head) drawText(ctx, head, 190, H * 0.33, { font: F(34, 800), color: acc, spacing: 3 });
      wrapLines(big, W - 380, D(T, 130), M, 2).forEach((l, i) => drawText(ctx, l, 186, H * (head ? 0.47 : 0.42) + i * 140, { font: D(T, 130), color: onBg, spacing: tr }));
      if (sub) drawText(ctx, fitText(sub, W - 380, F(40, 600), M), 190, H * 0.7, { font: F(40, 600), color: alpha(onBg === "#ffffff" ? "#ffffff" : "#000000", 0.8) });
      break;
    }
    case "split": {
      ctx.fillStyle = acc; ctx.fillRect(0, 0, W * 0.38, H);
      if (T.logo && img(T.logo)) drawContain(ctx, img(T.logo), W * 0.07, H * 0.25, W * 0.24, H * 0.5);
      else drawText(ctx, caps(T, head || "ELİTLİG", true), W * 0.19, H / 2, { font: D(T, 70), color: T.accentText, align: "center" });
      if (head) drawText(ctx, head, W * 0.44, H * 0.34, { font: F(32, 800), color: acc, spacing: 3 });
      wrapLines(big, W * 0.5, D(T, 110), M, 2).forEach((l, i) => drawText(ctx, l, W * 0.44, H * 0.48 + i * 120, { font: D(T, 110), color: onBg, spacing: tr }));
      if (sub) drawText(ctx, fitText(sub, W * 0.5, F(36, 600), M), W * 0.44, H * 0.72, { font: F(36, 600), color: onBg });
      break;
    }
    case "poster": {
      const f = D(T, 260);
      ctx.save(); ctx.globalAlpha *= 0.12; drawText(ctx, fitText(big, W * 1.4, f, M), W / 2, H * 0.5, { font: f, color: onBg, align: "center" }); ctx.restore();
      if (head) drawText(ctx, head, W / 2, H * 0.3, { font: F(36, 800), color: acc, align: "center", spacing: 4 });
      drawText(ctx, fitText(big, W - 200, D(T, 170), M, tr), W / 2, H * 0.5, { font: D(T, 170), color: onBg, align: "center", spacing: tr });
      ctx.fillStyle = acc; ctx.fillRect(W / 2 - 120, H * 0.63, 240, 8);
      if (sub) drawText(ctx, fitText(sub, W - 300, F(40, 600), M), W / 2, H * 0.72, { font: F(40, 600), color: onBg, align: "center" });
      break;
    }
    case "minimal": {
      if (head) drawText(ctx, head, W / 2, H * 0.38, { font: F(30, 600), color: onBg, align: "center", spacing: 6 });
      drawText(ctx, fitText(big, W - 300, D(T, 120), M, tr), W / 2, H * 0.5, { font: D(T, 120), color: onBg, align: "center", spacing: tr });
      if (sub) drawText(ctx, fitText(sub, W - 300, F(30, 500), M), W / 2, H * 0.62, { font: F(30, 500), color: onBg, align: "center" });
      break;
    }
    default: {
      fillRound(ctx, W * 0.14, H * 0.26, W * 0.72, H * 0.48, 30, alpha(T.panel, 0.95));
      ctx.fillStyle = acc; ctx.fillRect(W * 0.14, H * 0.26, W * 0.72, 12);
      if (head) drawText(ctx, head, W / 2, H * 0.36, { font: F(34, 800), color: acc, align: "center", spacing: 3 });
      drawText(ctx, fitText(big, W * 0.66, D(T, 120), M, tr), W / 2, H * (head ? 0.49 : 0.46), { font: D(T, 120), color: T.text, align: "center", spacing: tr });
      if (sub) drawText(ctx, fitText(sub, W * 0.66, F(36, 600), M), W / 2, H * 0.62, { font: F(36, 600), color: T.muted, align: "center" });
    }
  }
  if (it.kind === "social" && Array.isArray(it.handles)) {
    const hs = it.handles.filter((h) => h?.handle).slice(0, 4);
    const cw = 380; const gap = 30; const tot = hs.length * cw + (hs.length - 1) * gap;
    hs.forEach((h, i) => {
      const x = (W - tot) / 2 + i * (cw + gap); const y = H * 0.78;
      fillRound(ctx, x, y, cw, 90, 45, alpha(T.panel, 0.95));
      fillRound(ctx, x + 8, y + 8, 74, 74, 37, acc);
      drawText(ctx, socialGlyph(h.platform), x + 45, y + 46, { font: F(30, 900), color: T.accentText, align: "center" });
      drawText(ctx, fitText(h.handle, cw - 110, F(28, 800), M), x + 96, y + 46, { font: F(28, 800), color: T.text });
    });
  }
  ctx.restore();
}

export const SOCIAL_PLATFORMS = Object.freeze([["instagram", "Instagram"], ["x", "X / Twitter"], ["youtube", "YouTube"], ["tiktok", "TikTok"], ["facebook", "Facebook"], ["web", "Web sitesi"]]);
export function socialGlyph(p) { return { instagram: "IG", x: "X", youtube: "▶", tiktok: "♪", facebook: "f", web: "@" }[p] || "@"; }
