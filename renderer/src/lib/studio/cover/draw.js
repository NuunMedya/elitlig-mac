// YouTube yayın kapağı · tuval çizimi (1280×720 mantıksal ölçü).
//
// drawCover(ctx, data, settings, images, { width, height }) — tuval başka
// boyuttaysa (önizleme) ölçeklenir. images: { home, away, brand, bg } yüklenmiş
// HTMLImageElement / tuval (yoksa null: arma yerine baş harf rozeti, marka
// logosu yerine marka adı çizilir). Altı şablon: klasik, stadyum, capraz,
// minimal, neon, poster.

import {
  COVER_H, COVER_W, competitionLine, normalizeCoverSettings, resolveCoverColors, shade, upperTr, whenLine, whereLine,
} from "./model";
import { parseHex } from "../graphics/branding";

const SANS = '"SF Pro Display", "Helvetica Neue", Inter, "Segoe UI", Arial, sans-serif';
const COND = 'Oswald, "Bebas Neue", "Arial Narrow", "Helvetica Neue", Arial, sans-serif';
const SERIF = '"Playfair Display", Georgia, "Times New Roman", serif';
const F = (px, weight = 800, family = SANS, style = "") => `${style ? `${style} ` : ""}${weight} ${Math.max(1, px).toFixed(1)}px ${family}`;

const rgba = (hex, a) => {
  const rgb = parseHex(hex) || [255, 255, 255];
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${a})`;
};

/* ------------------------------ yardımcılar ------------------------------ */

function measure(ctx, t, font, spacing = 0) {
  ctx.font = font;
  const s = String(t ?? "");
  if (!spacing) return ctx.measureText(s).width;
  let w = 0;
  for (const ch of s) w += ctx.measureText(ch).width;
  return w + spacing * Math.max(0, Array.from(s).length - 1);
}

/** Metin (harf aralığı elle; ctx.letterSpacing kullanılmaz). */
function text(ctx, t, x, y, { font, color = "#fff", align = "left", spacing = 0, baseline = "middle", shadow = null, stroke = null, strokeWidth = 0, alpha = 1 } = {}) {
  const s = String(t ?? "");
  if (!s) return 0;
  ctx.save();
  ctx.font = font;
  ctx.textBaseline = baseline;
  ctx.globalAlpha *= alpha;
  if (shadow) { ctx.shadowColor = shadow.color; ctx.shadowBlur = shadow.blur || 0; ctx.shadowOffsetX = shadow.x || 0; ctx.shadowOffsetY = shadow.y || 0; }
  const w = measure(ctx, s, font, spacing);
  let cx = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
  const paint = (str, px) => {
    if (stroke && strokeWidth) { ctx.lineJoin = "round"; ctx.lineWidth = strokeWidth; ctx.strokeStyle = stroke; ctx.strokeText(str, px, y); }
    if (color) { ctx.fillStyle = color; ctx.fillText(str, px, y); }
  };
  ctx.textAlign = "left";
  if (!spacing) paint(s, cx);
  else for (const ch of s) { paint(ch, cx); cx += ctx.measureText(ch).width + spacing; }
  ctx.restore();
  return w;
}

/** Metnin maxW'ye sığdığı en büyük punto (minPx'e kadar; altında "…" ile kısaltılır). */
function fit(ctx, t, maxW, px, weight, family, { spacing = 0, minPx = 16, style = "" } = {}) {
  let size = px;
  while (size > minPx && measure(ctx, t, F(size, weight, family, style), spacing * (size / px)) > maxW) size -= 1;
  let s = String(t ?? "");
  const font = F(size, weight, family, style);
  const sp = spacing * (size / px);
  if (measure(ctx, s, font, sp) > maxW) {
    while (s.length > 1 && measure(ctx, `${s}…`, font, sp) > maxW) s = s.slice(0, -1).trimEnd();
    s = `${s}…`;
  }
  return { text: s, font, size, spacing: sp };
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

const imgSize = (img) => ({ w: img?.naturalWidth || img?.videoWidth || img?.width || 0, h: img?.naturalHeight || img?.videoHeight || img?.height || 0 });

function drawContain(ctx, img, x, y, w, h) {
  const { w: iw, h: ih } = imgSize(img);
  if (!iw || !ih) return false;
  const k = Math.min(w / iw, h / ih);
  const dw = iw * k; const dh = ih * k;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  return true;
}

function drawFill(ctx, img, x, y, w, h) {
  const { w: iw, h: ih } = imgSize(img);
  if (!iw || !ih) return false;
  const k = Math.max(w / iw, h / ih);
  const sw = w / k; const sh = h / k;
  ctx.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, x, y, w, h);
  return true;
}

/** Arma (logo) ya da baş harf rozeti. plate: "glass" | "white" | "none" | "neon" | "paper". */
function crest(ctx, team, cx, cy, size, color, { plate = "glass", ring = null, glow = null, ink = "#fff" } = {}) {
  const r = size / 2;
  ctx.save();
  if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = size * 0.22; }
  if (plate !== "none") {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    if (plate === "white") ctx.fillStyle = "rgba(255,255,255,0.96)";
    else if (plate === "neon") ctx.fillStyle = "rgba(10,2,24,0.92)";
    else if (plate === "paper") ctx.fillStyle = "#f7f0df";
    else {
      const g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.4, r * 0.1, cx, cy, r);
      g.addColorStop(0, "rgba(255,255,255,0.22)");
      g.addColorStop(1, "rgba(255,255,255,0.05)");
      ctx.fillStyle = g;
    }
    ctx.fill();
  }
  ctx.restore();
  if (ring) {
    ctx.save();
    if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = size * 0.12; }
    ctx.beginPath();
    ctx.arc(cx, cy, r - ring.width / 2, 0, Math.PI * 2);
    ctx.lineWidth = ring.width;
    ctx.strokeStyle = ring.color;
    ctx.stroke();
    ctx.restore();
  }
  const box = plate === "none" ? size : size * 0.66;
  if (team.img && drawContainSafe(ctx, team.img, cx - box / 2, cy - box / 2, box, box)) return;
  // Baş harf rozeti.
  const br = plate === "none" ? r : r * 0.8;
  ctx.save();
  const g = ctx.createLinearGradient(cx, cy - br, cx, cy + br);
  g.addColorStop(0, shade(color, 0.08));
  g.addColorStop(1, shade(color, -0.16));
  ctx.beginPath();
  ctx.arc(cx, cy, br, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = Math.max(2, size * 0.025);
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.stroke();
  ctx.restore();
  const label = team.initials || "?";
  const f = fit(ctx, label, br * 1.5, br * (Array.from(label).length > 2 ? 0.72 : 0.9), 900, SANS, { minPx: 12 });
  text(ctx, f.text, cx, cy + br * 0.04, { font: f.font, color: ink, align: "center", shadow: { color: "rgba(0,0,0,0.35)", blur: 8, y: 2 } });
}

function drawContainSafe(ctx, img, x, y, w, h) {
  try { return drawContain(ctx, img, x, y, w, h); } catch { return false; }
}

/** Kırmızı "● CANLI" rozeti; align: left | right | center. Genişliği döner. */
function liveBadge(ctx, label, x, y, { h = 44, align = "left", tone = "#ff1f3d", textColor = "#fff", outline = false } = {}) {
  const font = F(h * 0.46, 900, SANS);
  const tw = measure(ctx, label, font, h * 0.06);
  const w = tw + h * 1.25;
  const x0 = align === "right" ? x - w : align === "center" ? x - w / 2 : x;
  ctx.save();
  roundRect(ctx, x0, y, w, h, h * 0.22);
  if (outline) { ctx.lineWidth = 3; ctx.strokeStyle = tone; ctx.stroke(); } else {
    ctx.shadowColor = rgba(tone, 0.6); ctx.shadowBlur = 18;
    ctx.fillStyle = tone; ctx.fill();
  }
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  ctx.arc(x0 + h * 0.42, y + h / 2, h * 0.13, 0, Math.PI * 2);
  ctx.fillStyle = outline ? tone : textColor;
  ctx.fill();
  ctx.restore();
  text(ctx, label, x0 + h * 0.7, y + h / 2 + 1, { font, color: outline ? tone : textColor, spacing: h * 0.06 });
  return w;
}

/** Marka logosu (yükseklik h) ya da marka adı. dark: açık zeminde koyu yonga. */
function brandMark(ctx, img, name, x, y, h, { align = "right", dark = false, color = "#fff" } = {}) {
  const { w: iw, h: ih } = imgSize(img);
  if (img && iw && ih) {
    const w = (iw / ih) * h;
    const x0 = align === "right" ? x - w : align === "center" ? x - w / 2 : x;
    if (dark) {
      ctx.save();
      roundRect(ctx, x0 - h * 0.2, y - h * 0.2, w + h * 0.4, h * 1.4, h * 0.3);
      ctx.fillStyle = "#141414";
      ctx.fill();
      ctx.restore();
    }
    try { ctx.drawImage(img, x0, y, w, h); return; } catch { /* yazıya düş */ }
  }
  text(ctx, upperTr(name || "ELİT LİG"), x, y + h / 2, { font: F(h * 0.5, 900, SANS), color: dark ? "#141414" : color, align, spacing: h * 0.08 });
}

/** Zemin fotoğrafı + şablon zemini (fotoğraf varsa şablon zemini saydamlıkla üstüne). */
function base(ctx, I, S, paint) {
  if (I.bg && imgSize(I.bg).w) {
    try { drawFill(ctx, I.bg, 0, 0, COVER_W, COVER_H); } catch { /* yoksay */ }
    ctx.save();
    ctx.globalAlpha = S.backgroundDim / 100;
    paint();
    ctx.restore();
  } else paint();
}

function vignette(ctx, strength = 0.55) {
  const g = ctx.createRadialGradient(COVER_W / 2, COVER_H / 2, COVER_H * 0.35, COVER_W / 2, COVER_H / 2, COVER_W * 0.72);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, `rgba(0,0,0,${strength})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, COVER_W, COVER_H);
}

/** Deterministik sözde rastgele (kâğıt dokusu, yıldızlar). */
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

const teamsOf = (D, I) => ({ home: { ...D.home, img: I.home }, away: { ...D.away, img: I.away } });

/** Ortak üst köşeler: CANLI (sol) + marka (sağ). */
function corners(ctx, D, S, I, { y = 44, dark = false, liveOutline = false, brandH = 76 } = {}) {
  if (S.show.live) liveBadge(ctx, upperTr(S.liveLabel), 48, y, { outline: liveOutline });
  if (S.show.brand) brandMark(ctx, I.brand, D.brand.name, COVER_W - 44, y - 14, brandH, { dark });
}

/** İki satırlık takım adı alanı: adı sığdırır. */
function teamName(ctx, name, cx, y, maxW, { px = 48, weight = 900, family = SANS, color = "#fff", shadow = null, spacing = 1, style = "", upper = true } = {}) {
  const f = fit(ctx, upper ? upperTr(name) : name, maxW, px, weight, family, { spacing, minPx: 22, style });
  text(ctx, f.text, cx, y, { font: f.font, color, align: "center", spacing: f.spacing, shadow });
}

/* ------------------------------ 1. Klasik VS ------------------------------ */

function klasik(ctx, D, S, C, I) {
  base(ctx, I, S, () => {
    const g = ctx.createLinearGradient(0, 0, COVER_W, COVER_H);
    g.addColorStop(0, "#0b0614"); g.addColorStop(1, "#160a26");
    ctx.fillStyle = g; ctx.fillRect(0, 0, COVER_W, COVER_H);
    for (const [x, col] of [[250, C.home], [1030, C.away]]) {
      const r = ctx.createRadialGradient(x, 330, 20, x, 330, 620);
      r.addColorStop(0, rgba(col, 0.62)); r.addColorStop(0.55, rgba(col, 0.16)); r.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = r; ctx.fillRect(0, 0, COVER_W, COVER_H);
    }
  });
  // İnce çapraz çizgiler.
  ctx.save();
  ctx.globalAlpha = 0.05;
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 2;
  for (let x = -COVER_H; x < COVER_W; x += 28) { ctx.beginPath(); ctx.moveTo(x, COVER_H); ctx.lineTo(x + COVER_H, 0); ctx.stroke(); }
  ctx.restore();
  vignette(ctx, 0.6);

  const T = teamsOf(D, I);
  const comp = competitionLine(D, S.show);
  if (comp) {
    const f = fit(ctx, upperTr(comp), 640, 26, 800, SANS, { spacing: 4 });
    const w = measure(ctx, f.text, f.font, f.spacing) + 64;
    ctx.save(); roundRect(ctx, 640 - w / 2, 42, w, 56, 28); ctx.fillStyle = "rgba(255,255,255,0.08)"; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = rgba(C.accent, 0.9); ctx.stroke(); ctx.restore();
    text(ctx, f.text, 640, 71, { font: f.font, color: "#fff", align: "center", spacing: f.spacing });
  }
  crest(ctx, T.home, 300, 318, 260, C.home, { ring: { color: C.home, width: 7 }, glow: rgba(C.home, 0.9) });
  crest(ctx, T.away, 980, 318, 260, C.away, { ring: { color: C.away, width: 7 }, glow: rgba(C.away, 0.9) });
  teamName(ctx, T.home.name, 300, 500, 440, { shadow: { color: "rgba(0,0,0,0.5)", blur: 12, y: 3 } });
  teamName(ctx, T.away.name, 980, 500, 440, { shadow: { color: "rgba(0,0,0,0.5)", blur: 12, y: 3 } });
  text(ctx, "EV SAHİBİ", 300, 540, { font: F(15, 800), color: "rgba(255,255,255,0.6)", align: "center", spacing: 5 });
  text(ctx, "DEPLASMAN", 980, 540, { font: F(15, 800), color: "rgba(255,255,255,0.6)", align: "center", spacing: 5 });

  // VS
  ctx.save();
  const vg = ctx.createLinearGradient(0, 250, 0, 400);
  vg.addColorStop(0, "#ffffff"); vg.addColorStop(1, shade(C.accent, 0.18));
  text(ctx, "VS", 640, 326, { font: F(150, 900, SANS, "italic"), color: vg, align: "center", stroke: "rgba(0,0,0,0.35)", strokeWidth: 10, shadow: { color: rgba(C.accent, 0.8), blur: 40 } });
  ctx.restore();
  for (const [x1, x2] of [[488, 556], [724, 792]]) {
    ctx.save(); ctx.strokeStyle = rgba(C.accent, 0.85); ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x1, 420); ctx.lineTo(x2, 420); ctx.stroke(); ctx.restore();
  }

  // Alt bant.
  const bg = ctx.createLinearGradient(0, 590, 0, COVER_H);
  bg.addColorStop(0, "rgba(0,0,0,0)"); bg.addColorStop(0.4, "rgba(0,0,0,0.55)"); bg.addColorStop(1, "rgba(0,0,0,0.75)");
  ctx.fillStyle = bg; ctx.fillRect(0, 590, COVER_W, COVER_H - 590);
  const when = whenLine(D, S.show); const where = whereLine(D, S.show);
  if (when) { const f = fit(ctx, upperTr(when), 1100, 32, 800, SANS, { spacing: 2 }); text(ctx, f.text, 640, where ? 640 : 660, { font: f.font, color: "#fff", align: "center", spacing: f.spacing }); }
  if (where) { const f = fit(ctx, where, 1000, 23, 600, SANS); text(ctx, f.text, 640, when ? 680 : 660, { font: f.font, color: "rgba(255,255,255,0.72)", align: "center" }); }
  ctx.save(); ctx.fillStyle = C.home; ctx.fillRect(0, COVER_H - 8, COVER_W / 2, 8); ctx.fillStyle = C.away; ctx.fillRect(COVER_W / 2, COVER_H - 8, COVER_W / 2, 8); ctx.restore();
  corners(ctx, D, S, I);
}

/* ------------------------------ 2. Stadyum ışıkları ------------------------------ */

function stadyum(ctx, D, S, C, I) {
  base(ctx, I, S, () => {
    const g = ctx.createLinearGradient(0, 0, 0, COVER_H);
    g.addColorStop(0, "#01040b"); g.addColorStop(0.62, "#0a1a33"); g.addColorStop(1, "#04101f");
    ctx.fillStyle = g; ctx.fillRect(0, 0, COVER_W, COVER_H);
  });
  // Tribün silueti.
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.beginPath(); ctx.moveTo(0, 470); ctx.lineTo(0, 300); ctx.quadraticCurveTo(640, 220, COVER_W, 300); ctx.lineTo(COVER_W, 470); ctx.closePath(); ctx.fill();
  const rand = rng(7);
  ctx.fillStyle = "rgba(255,255,255,0.10)";
  for (let i = 0; i < 520; i += 1) { const x = rand() * COVER_W; const y = 300 + rand() * 160 - Math.sin((x / COVER_W) * Math.PI) * 60; ctx.fillRect(x, y, 2, 2); }
  ctx.restore();
  // Çim.
  ctx.save();
  ctx.beginPath(); ctx.moveTo(-200, COVER_H); ctx.lineTo(220, 470); ctx.lineTo(1060, 470); ctx.lineTo(1480, COVER_H); ctx.closePath();
  const pg = ctx.createLinearGradient(0, 470, 0, COVER_H);
  pg.addColorStop(0, "#0b4a22"); pg.addColorStop(1, "#0f6b2f");
  ctx.fillStyle = pg; ctx.fill(); ctx.clip();
  for (let i = 0; i < 9; i += 1) {
    if (i % 2) continue;
    const t0 = i / 9; const t1 = (i + 1) / 9;
    // Yatay biçme şeritleri (perspektif: uzakta sık, yakında seyrek).
    const y0 = 470 + (COVER_H - 470) * t0 * t0; const y1 = 470 + (COVER_H - 470) * t1 * t1;
    ctx.fillStyle = "rgba(255,255,255,0.045)"; ctx.fillRect(0, y0, COVER_W, y1 - y0 + 1);
  }
  ctx.strokeStyle = "rgba(255,255,255,0.55)"; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.ellipse(640, 610, 250, 62, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(640, 470); ctx.lineTo(640, COVER_H); ctx.stroke();
  ctx.restore();
  // Projektörler.
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const [x, y, a] of [[250, 34, 0.3], [520, 16, 0.2], [760, 16, 0.2], [1030, 34, 0.3]]) {
    const r = ctx.createRadialGradient(x, y, 4, x, y, 640);
    r.addColorStop(0, `rgba(235,245,255,${a})`); r.addColorStop(0.2, `rgba(190,215,255,${a * 0.3})`); r.addColorStop(1, "rgba(120,160,255,0)");
    ctx.fillStyle = r; ctx.fillRect(0, 0, COVER_W, COVER_H);
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    for (let i = 0; i < 4; i += 1) for (let j = 0; j < 2; j += 1) { ctx.beginPath(); ctx.arc(x - 21 + i * 14, y - 6 + j * 13, 4.6, 0, Math.PI * 2); ctx.fill(); }
  }
  ctx.restore();
  const haze = ctx.createRadialGradient(640, 330, 30, 640, 330, 520);
  haze.addColorStop(0, "rgba(255,255,255,0.10)"); haze.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = haze; ctx.fillRect(0, 0, COVER_W, COVER_H);
  vignette(ctx, 0.5);

  const T = teamsOf(D, I);
  crest(ctx, T.home, 315, 300, 230, C.home, { ring: { color: "rgba(255,255,255,0.85)", width: 4 }, glow: rgba(C.home, 1) });
  crest(ctx, T.away, 965, 300, 230, C.away, { ring: { color: "rgba(255,255,255,0.85)", width: 4 }, glow: rgba(C.away, 1) });
  const sh = { color: "rgba(0,0,0,0.8)", blur: 14, y: 3 };
  teamName(ctx, T.home.name, 315, 470, 430, { px: 44, shadow: sh });
  teamName(ctx, T.away.name, 965, 470, 430, { px: 44, shadow: sh });
  ctx.save(); ctx.fillStyle = C.home; ctx.fillRect(315 - 50, 500, 100, 5); ctx.fillStyle = C.away; ctx.fillRect(965 - 50, 500, 100, 5); ctx.restore();

  const time = S.show.time ? D.time : "";
  if (time) {
    text(ctx, time, 640, 290, { font: F(104, 800, COND), color: "#fff", align: "center", shadow: { color: "rgba(150,200,255,0.8)", blur: 30 } });
    const date = S.show.date ? [D.date, D.day].filter(Boolean).join(" ") : "";
    if (date) { const f = fit(ctx, upperTr(date), 300, 22, 800, SANS, { spacing: 2 }); text(ctx, f.text, 640, 362, { font: f.font, color: "rgba(255,255,255,0.86)", align: "center", spacing: f.spacing }); }
  } else {
    text(ctx, "VS", 640, 300, { font: F(110, 900, COND), color: "#fff", align: "center", shadow: { color: "rgba(150,200,255,0.8)", blur: 30 } });
    const date = S.show.date ? [D.date, D.day].filter(Boolean).join(" ") : "";
    if (date) { const f = fit(ctx, upperTr(date), 300, 22, 800, SANS, { spacing: 2 }); text(ctx, f.text, 640, 372, { font: f.font, color: "rgba(255,255,255,0.86)", align: "center", spacing: f.spacing }); }
  }
  const comp = competitionLine(D, S.show);
  if (comp) {
    const f = fit(ctx, upperTr(comp), 620, 24, 800, SANS, { spacing: 4 });
    const w = measure(ctx, f.text, f.font, f.spacing) + 60;
    ctx.save(); roundRect(ctx, 640 - w / 2, 120, w, 50, 10); ctx.fillStyle = rgba(C.accent, 0.92); ctx.fill(); ctx.restore();
    text(ctx, f.text, 640, 146, { font: f.font, color: "#fff", align: "center", spacing: f.spacing });
  }
  const where = whereLine(D, S.show);
  if (where) {
    const f = fit(ctx, upperTr(where), 900, 24, 700, SANS, { spacing: 2 });
    const w = measure(ctx, f.text, f.font, f.spacing) + 70;
    ctx.save(); roundRect(ctx, 640 - w / 2, 646, w, 46, 23); ctx.fillStyle = "rgba(0,0,0,0.55)"; ctx.fill(); ctx.restore();
    text(ctx, f.text, 640, 670, { font: f.font, color: "#fff", align: "center", spacing: f.spacing });
  }
  corners(ctx, D, S, I);
}

/* ------------------------------ 3. Çapraz renkler ------------------------------ */

function capraz(ctx, D, S, C, I) {
  base(ctx, I, S, () => {
    ctx.save();
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(720, 0); ctx.lineTo(560, COVER_H); ctx.lineTo(0, COVER_H); ctx.closePath();
    let g = ctx.createLinearGradient(0, 0, 640, COVER_H);
    g.addColorStop(0, shade(C.home, 0.06)); g.addColorStop(1, shade(C.home, -0.24));
    ctx.fillStyle = g; ctx.fill();
    ctx.beginPath(); ctx.moveTo(720, 0); ctx.lineTo(COVER_W, 0); ctx.lineTo(COVER_W, COVER_H); ctx.lineTo(560, COVER_H); ctx.closePath();
    g = ctx.createLinearGradient(COVER_W, 0, 640, COVER_H);
    g.addColorStop(0, shade(C.away, 0.06)); g.addColorStop(1, shade(C.away, -0.24));
    ctx.fillStyle = g; ctx.fill();
    ctx.restore();
  });
  // Yarım ton noktalar.
  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,0.09)";
  for (let y = 12; y < COVER_H; y += 22) for (let x = 12; x < COVER_W; x += 22) {
    const k = ((x + y) / (COVER_W + COVER_H));
    ctx.beginPath(); ctx.arc(x, y, 1 + 3.2 * Math.abs(0.5 - k), 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
  // Orta bant.
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.45)"; ctx.shadowBlur = 30;
  ctx.beginPath(); ctx.moveTo(698, 0); ctx.lineTo(742, 0); ctx.lineTo(582, COVER_H); ctx.lineTo(538, COVER_H); ctx.closePath();
  ctx.fillStyle = "#ffffff"; ctx.fill();
  ctx.restore();
  const shadeBottom = ctx.createLinearGradient(0, 440, 0, COVER_H);
  shadeBottom.addColorStop(0, "rgba(0,0,0,0)"); shadeBottom.addColorStop(1, "rgba(0,0,0,0.55)");
  ctx.fillStyle = shadeBottom; ctx.fillRect(0, 440, COVER_W, COVER_H - 440);

  const T = teamsOf(D, I);
  crest(ctx, T.home, 300, 300, 270, C.home, { plate: "white", glow: "rgba(0,0,0,0.45)", ink: "#fff" });
  crest(ctx, T.away, 985, 300, 270, C.away, { plate: "white", glow: "rgba(0,0,0,0.45)", ink: "#fff" });
  const sh = { color: "rgba(0,0,0,0.45)", blur: 10, y: 3 };
  teamName(ctx, T.home.name, 300, 492, 470, { px: 52, shadow: sh });
  teamName(ctx, T.away.name, 985, 492, 470, { px: 52, shadow: sh });

  // VS rozeti bandın ortasında.
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.5)"; ctx.shadowBlur = 24;
  ctx.beginPath(); ctx.arc(640, 300, 70, 0, Math.PI * 2); ctx.fillStyle = "#0d0d12"; ctx.fill();
  ctx.restore();
  ctx.save(); ctx.beginPath(); ctx.arc(640, 300, 70, 0, Math.PI * 2); ctx.lineWidth = 5; ctx.strokeStyle = "#fff"; ctx.stroke(); ctx.restore();
  text(ctx, "VS", 640, 303, { font: F(60, 900, SANS, "italic"), color: "#fff", align: "center" });

  const comp = competitionLine(D, S.show);
  if (comp) {
    const f = fit(ctx, upperTr(comp), 560, 24, 900, SANS, { spacing: 3 });
    const w = measure(ctx, f.text, f.font, f.spacing) + 48;
    ctx.save(); ctx.translate(640, 120); ctx.transform(1, 0, -0.18, 1, 0, 0);
    ctx.fillStyle = "#0d0d12"; ctx.fillRect(-w / 2, -26, w, 52); ctx.restore();
    text(ctx, f.text, 640, 121, { font: f.font, color: "#fff", align: "center", spacing: f.spacing });
  }
  const when = whenLine(D, S.show); const where = whereLine(D, S.show);
  ctx.save(); ctx.fillStyle = "rgba(10,10,14,0.82)"; ctx.fillRect(0, 610, COVER_W, 110); ctx.restore();
  if (when) { const f = fit(ctx, upperTr(when), 1120, 32, 900, SANS, { spacing: 2 }); text(ctx, f.text, 640, where ? 646 : 665, { font: f.font, color: "#fff", align: "center", spacing: f.spacing }); }
  if (where) { const f = fit(ctx, where, 1100, 23, 600, SANS); text(ctx, f.text, 640, when ? 688 : 665, { font: f.font, color: "rgba(255,255,255,0.75)", align: "center" }); }
  corners(ctx, D, S, I);
}

/* ------------------------------ 4. Minimal ------------------------------ */

function minimal(ctx, D, S, C, I) {
  base(ctx, I, S, () => {
    ctx.fillStyle = "#f4f2ee"; ctx.fillRect(0, 0, COVER_W, COVER_H);
    const r = ctx.createRadialGradient(1100, 80, 10, 1100, 80, 520);
    r.addColorStop(0, "rgba(0,0,0,0.035)"); r.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = r; ctx.fillRect(0, 0, COVER_W, COVER_H);
  });
  const top = ctx.createLinearGradient(0, 0, COVER_W, 0);
  top.addColorStop(0, C.home); top.addColorStop(1, C.away);
  ctx.fillStyle = top; ctx.fillRect(0, 0, COVER_W, 10);

  const ink = "#121212";
  const comp = competitionLine(D, S.show);
  if (comp) { const f = fit(ctx, upperTr(comp), 760, 22, 700, SANS, { spacing: 7 }); text(ctx, f.text, 640, 128, { font: f.font, color: "#6b6b6b", align: "center", spacing: f.spacing }); }
  ctx.save(); ctx.fillStyle = C.accent; ctx.fillRect(610, 160, 60, 4); ctx.restore();

  const T = teamsOf(D, I);
  crest(ctx, T.home, 400, 330, 200, C.home, { plate: "none" });
  crest(ctx, T.away, 880, 330, 200, C.away, { plate: "none" });
  ctx.save(); ctx.strokeStyle = "rgba(0,0,0,0.14)"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(640, 262); ctx.lineTo(640, 304); ctx.moveTo(640, 356); ctx.lineTo(640, 398); ctx.stroke(); ctx.restore();
  text(ctx, "VS", 640, 331, { font: F(30, 300, SANS), color: "#8a8a8a", align: "center", spacing: 6 });
  teamName(ctx, T.home.name, 400, 488, 420, { px: 40, weight: 800, color: ink, spacing: 0.5, upper: false });
  teamName(ctx, T.away.name, 880, 488, 420, { px: 40, weight: 800, color: ink, spacing: 0.5, upper: false });

  const when = whenLine(D, S.show); const where = whereLine(D, S.show);
  if (when) { const f = fit(ctx, when, 1000, 30, 600, SANS); text(ctx, f.text, 640, 590, { font: f.font, color: ink, align: "center" }); }
  if (where) { const f = fit(ctx, where, 1000, 22, 500, SANS); text(ctx, f.text, 640, 632, { font: f.font, color: "#7a7a7a", align: "center" }); }
  ctx.save(); ctx.fillStyle = "rgba(0,0,0,0.1)"; ctx.fillRect(80, 676, COVER_W - 160, 1); ctx.restore();

  if (S.show.live) {
    ctx.save(); ctx.beginPath(); ctx.arc(70, 66, 8, 0, Math.PI * 2); ctx.fillStyle = "#e5172f"; ctx.fill();
    ctx.beginPath(); ctx.arc(70, 66, 14, 0, Math.PI * 2); ctx.strokeStyle = "rgba(229,23,47,0.35)"; ctx.lineWidth = 3; ctx.stroke(); ctx.restore();
    text(ctx, upperTr(S.liveLabel), 96, 67, { font: F(20, 800), color: "#e5172f", spacing: 4 });
  }
  if (S.show.brand) brandMark(ctx, I.brand, D.brand.name, COVER_W - 62, 40, 52, { dark: true });
}

/* ------------------------------ 5. Neon ------------------------------ */

function neon(ctx, D, S, C, I) {
  const horizon = 500;
  base(ctx, I, S, () => {
    const g = ctx.createLinearGradient(0, 0, 0, COVER_H);
    g.addColorStop(0, "#05010c"); g.addColorStop(0.6, "#1d0335"); g.addColorStop(0.63, "#09010f"); g.addColorStop(1, "#05010a");
    ctx.fillStyle = g; ctx.fillRect(0, 0, COVER_W, COVER_H);
  });
  const rand = rng(11);
  ctx.save(); ctx.fillStyle = "rgba(255,255,255,0.6)";
  for (let i = 0; i < 90; i += 1) { const r = rand() * 1.6; ctx.globalAlpha = 0.2 + rand() * 0.6; ctx.beginPath(); ctx.arc(rand() * COVER_W, rand() * (horizon - 40), r, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
  // Ufuk parıltısı + ızgara.
  ctx.save();
  const hg = ctx.createRadialGradient(640, horizon, 10, 640, horizon, 640);
  hg.addColorStop(0, rgba(C.accent, 0.55)); hg.addColorStop(1, rgba(C.accent, 0));
  ctx.fillStyle = hg; ctx.fillRect(0, 0, COVER_W, COVER_H);
  ctx.strokeStyle = rgba(C.accent, 0.75); ctx.shadowColor = C.accent; ctx.shadowBlur = 12; ctx.lineWidth = 2;
  for (let i = -14; i <= 14; i += 1) { ctx.beginPath(); ctx.moveTo(640 + i * 12, horizon); ctx.lineTo(640 + i * 150, COVER_H); ctx.stroke(); }
  for (let k = 1; k <= 9; k += 1) { const y = horizon + (COVER_H - horizon) * ((k / 9) ** 2); ctx.globalAlpha = 0.35 + 0.65 * (k / 9); ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(COVER_W, y); ctx.stroke(); }
  ctx.globalAlpha = 1; ctx.lineWidth = 3; ctx.strokeStyle = shade(C.accent, 0.25);
  ctx.beginPath(); ctx.moveTo(0, horizon); ctx.lineTo(COVER_W, horizon); ctx.stroke();
  ctx.restore();

  const T = teamsOf(D, I);
  for (const [t, x, col] of [[T.home, 330, C.home], [T.away, 950, C.away]]) {
    ctx.save(); ctx.shadowColor = col; ctx.shadowBlur = 40; ctx.beginPath(); ctx.arc(x, 280, 128, 0, Math.PI * 2); ctx.lineWidth = 6; ctx.strokeStyle = col; ctx.stroke(); ctx.stroke(); ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.arc(x, 280, 128, 0, Math.PI * 2); ctx.lineWidth = 2; ctx.strokeStyle = "rgba(255,255,255,0.9)"; ctx.stroke(); ctx.restore();
    crest(ctx, t, x, 280, 236, col, { plate: "neon" });
  }
  const glow = (col) => ({ color: col, blur: 26 });
  teamName(ctx, T.home.name, 330, 458, 440, { px: 44, color: "#fff", shadow: glow(C.home), spacing: 2 });
  teamName(ctx, T.away.name, 950, 458, 440, { px: 44, color: "#fff", shadow: glow(C.away), spacing: 2 });
  text(ctx, "VS", 640, 282, { font: F(120, 900, COND, "italic"), color: null, stroke: shade(C.accent, 0.3), strokeWidth: 6, align: "center", shadow: { color: C.accent, blur: 34 } });
  text(ctx, "VS", 640, 282, { font: F(120, 900, COND, "italic"), color: null, stroke: "#fff", strokeWidth: 1.6, align: "center" });

  const pill = (label, y, col, px) => {
    const f = fit(ctx, label, 1000, px, 800, SANS, { spacing: 3 });
    const w = measure(ctx, f.text, f.font, f.spacing) + 64;
    ctx.save(); roundRect(ctx, 640 - w / 2, y - 26, w, 52, 26); ctx.shadowColor = col; ctx.shadowBlur = 20; ctx.lineWidth = 3; ctx.strokeStyle = col; ctx.stroke();
    ctx.fillStyle = "rgba(8,1,18,0.75)"; ctx.fill(); ctx.restore();
    text(ctx, f.text, 640, y + 1, { font: f.font, color: "#fff", align: "center", spacing: f.spacing, shadow: { color: col, blur: 12 } });
  };
  const comp = competitionLine(D, S.show);
  if (comp) pill(upperTr(comp), 92, C.accent, 24);
  const info = [whenLine(D, S.show), whereLine(D, S.show)].filter(Boolean).join("  •  ");
  if (info) pill(upperTr(info), 640, C.home, 23);
  if (S.show.live) liveBadge(ctx, upperTr(S.liveLabel), 48, 44, { tone: "#ff2d6f" });
  if (S.show.brand) brandMark(ctx, I.brand, D.brand.name, COVER_W - 44, 30, 76);
}

/* ------------------------------ 6. Gazete / Poster ------------------------------ */

function poster(ctx, D, S, C, I) {
  const ink = "#16120c";
  const red = "#b3121f";
  base(ctx, I, S, () => {
    ctx.fillStyle = "#ece2cc"; ctx.fillRect(0, 0, COVER_W, COVER_H);
  });
  // Kâğıt dokusu.
  const rand = rng(3);
  ctx.save();
  for (let i = 0; i < 2600; i += 1) { ctx.fillStyle = rand() > 0.5 ? "rgba(90,70,40,0.06)" : "rgba(255,255,255,0.08)"; ctx.fillRect(rand() * COVER_W, rand() * COVER_H, 1 + rand() * 2, 1 + rand() * 2); }
  ctx.restore();
  const vg = ctx.createRadialGradient(640, 360, 300, 640, 360, 820);
  vg.addColorStop(0, "rgba(120,90,40,0)"); vg.addColorStop(1, "rgba(120,90,40,0.22)");
  ctx.fillStyle = vg; ctx.fillRect(0, 0, COVER_W, COVER_H);

  // Manşet.
  ctx.fillStyle = ink; ctx.fillRect(48, 34, COVER_W - 96, 7); ctx.fillRect(48, 47, COVER_W - 96, 2);
  const comp = competitionLine(D, S.show) || "MAÇ GÜNÜ";
  const f = fit(ctx, upperTr(comp), 760, 44, 900, SERIF, { spacing: 2 });
  text(ctx, f.text, 640, 96, { font: f.font, color: ink, align: "center", spacing: f.spacing });
  ctx.fillStyle = ink; ctx.fillRect(48, 140, COVER_W - 96, 2); ctx.fillRect(48, 146, COVER_W - 96, 6);
  text(ctx, "★ MAÇ GÜNÜ ★", 640, 172, { font: F(16, 800, SANS), color: red, align: "center", spacing: 6 });

  const T = teamsOf(D, I);
  for (const [t, x, col] of [[T.home, 300, C.home], [T.away, 980, C.away]]) {
    // Yarım ton halka.
    ctx.save(); ctx.fillStyle = rgba(col, 0.85);
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 36) for (let k = 0; k < 3; k += 1) {
      const rr = 128 + k * 11; ctx.beginPath(); ctx.arc(x + Math.cos(a) * rr, 340 + Math.sin(a) * rr, 3.6 - k, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    crest(ctx, t, x, 340, 236, col, { plate: "paper", ring: { color: ink, width: 4 } });
  }
  text(ctx, "vs.", 640, 330, { font: F(110, 700, SERIF, "italic"), color: red, align: "center" });
  teamName(ctx, T.home.name, 300, 518, 480, { px: 46, weight: 900, family: SERIF, color: ink, spacing: 0.5 });
  teamName(ctx, T.away.name, 980, 518, 480, { px: 46, weight: 900, family: SERIF, color: ink, spacing: 0.5 });

  // Alt sütunlar.
  ctx.fillStyle = ink; ctx.fillRect(48, 562, COVER_W - 96, 3);
  const cols = [
    S.show.date && D.date ? ["TARİH", [D.date, D.day].filter(Boolean).join(" ")] : null,
    S.show.time && D.time ? ["SAAT", D.time] : null,
    whereLine(D, S.show) ? ["SAHA", whereLine(D, S.show)] : null,
  ].filter(Boolean);
  if (cols.length) {
    const w = (COVER_W - 96) / cols.length;
    cols.forEach(([label, value], i) => {
      const cx = 48 + w * i + w / 2;
      if (i > 0) { ctx.fillStyle = "rgba(22,18,12,0.5)"; ctx.fillRect(48 + w * i, 584, 2, 104); }
      text(ctx, label, cx, 606, { font: F(15, 800, SANS), color: red, align: "center", spacing: 4 });
      const v = fit(ctx, value, w - 40, 32, 800, SERIF);
      text(ctx, v.text, cx, 650, { font: v.font, color: ink, align: "center" });
    });
  }
  ctx.fillStyle = ink; ctx.fillRect(48, 700, COVER_W - 96, 2);

  if (S.show.live) {
    ctx.save(); ctx.translate(640, 448); ctx.rotate(-0.12);
    ctx.globalAlpha = 0.9;
    const lab = upperTr(S.liveLabel);
    const lf = F(34, 900, SANS);
    const lw = Math.min(300, measure(ctx, lab, lf, 6) + 48);
    ctx.strokeStyle = red; ctx.lineWidth = 5; ctx.strokeRect(-lw / 2, -30, lw, 60); ctx.lineWidth = 2; ctx.strokeRect(-lw / 2 + 7, -23, lw - 14, 46);
    text(ctx, lab, 0, 2, { font: lf, color: red, align: "center", spacing: 6 });
    ctx.restore();
  }
  if (S.show.brand) brandMark(ctx, I.brand, D.brand.name, 92, 72, 46, { align: "left", dark: true });
}

export const TEMPLATE_DRAWERS = Object.freeze({ klasik, stadyum, capraz, minimal, neon, poster });

/**
 * Kapağı çizer.
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} data      model.buildCoverData çıktısı
 * @param {object} settings  model.normalizeCoverSettings girdisi
 * @param {{ home?, away?, brand?, bg? }} images
 * @param {{ width?: number, height?: number, colors?: object }} opts
 */
export function drawCover(ctx, data, settings, images = {}, { width = COVER_W, height = COVER_H, colors = null } = {}) {
  const S = normalizeCoverSettings(settings);
  const C = colors || resolveCoverColors(data, S);
  const draw = TEMPLATE_DRAWERS[S.template] || klasik;
  ctx.save();
  ctx.setTransform?.(1, 0, 0, 1, 0, 0);
  ctx.clearRect?.(0, 0, width, height);
  ctx.scale(width / COVER_W, height / COVER_H);
  ctx.beginPath();
  ctx.rect(0, 0, COVER_W, COVER_H);
  ctx.clip();
  draw(ctx, data, S, C, { home: images.home || null, away: images.away || null, brand: images.brand || null, bg: S.background ? images.bg || null : null });
  ctx.restore();
  return C;
}
