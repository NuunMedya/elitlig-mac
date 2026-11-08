// YouTube yayın kapağı · tuval çizimi (1280×720 mantıksal ölçü).
//
// drawCover(ctx, data, settings, images, { width, height }) — tuval başka
// boyuttaysa (önizleme) ölçeklenir. images: { home, away, brand, bg } yüklenmiş
// HTMLImageElement / tuval (yoksa null: arma yerine baş harf rozeti, marka
// logosu yerine marka adı çizilir).
//
// Yazı tipleri gömülü (lib/studio/fonts.js): Barlow Condensed manşet / takım
// adı / saat, Inter etiket ve bilgi satırları. Kapak üretimi yazı tiplerinin
// yüklenmesini bekler (render.js). Tasarım ilkeleri:
//   · küçük boyutta (320×180, 168×94) okunacak üç şey: armalar, takım adları, saat
//   · YouTube'un sağ alt süre / CANLI etiketi bölgesine önemli bilgi konmaz
//   · renk takım renklerinden; yüzeyler koyu / sakin, ışık ve doku ince
//
// Dokuz şablon: klasik, stadyum, capraz, minimal, neon, poster, macgunu, bolme, sinema.

import {
  COVER_H, COVER_W, competitionLine, normalizeCoverSettings, resolveCoverColors, shade, upperTr, whereLine,
} from "./model";
import { parseHex } from "../graphics/branding";
import { COND, SANS } from "../fonts";

const F = (px, weight = 700, family = SANS, style = "") => `${style ? `${style} ` : ""}${weight} ${Math.max(1, px).toFixed(1)}px ${family}`;

const rgba = (hex, a) => {
  const rgb = parseHex(hex) || [255, 255, 255];
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${a})`;
};

/* ------------------------------ yazı ------------------------------ */

function setSpacing(ctx, px) {
  try { ctx.letterSpacing = `${px || 0}px`; } catch { /* eski tarayıcı */ }
}

/** Metin genişliği (harf aralığı dahil, son harften sonra boşluk yok). */
function measure(ctx, t, font, spacing = 0) {
  ctx.font = font;
  setSpacing(ctx, 0);
  const s = String(t ?? "");
  const w = ctx.measureText(s).width;
  return w + (spacing ? spacing * Math.max(0, Array.from(s).length - 1) : 0);
}

/** Metin çizer; genişliği döner. */
function text(ctx, t, x, y, { font, color = "#fff", align = "left", spacing = 0, baseline = "middle", shadow = null, stroke = null, strokeWidth = 0, alpha = 1 } = {}) {
  const s = String(t ?? "");
  if (!s) return 0;
  ctx.save();
  const w = measure(ctx, s, font, spacing);
  ctx.font = font;
  ctx.textBaseline = baseline;
  ctx.textAlign = "left";
  ctx.globalAlpha *= alpha;
  setSpacing(ctx, spacing);
  if (shadow) { ctx.shadowColor = shadow.color; ctx.shadowBlur = shadow.blur || 0; ctx.shadowOffsetX = shadow.x || 0; ctx.shadowOffsetY = shadow.y || 0; }
  const x0 = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
  if (stroke && strokeWidth) { ctx.lineJoin = "round"; ctx.lineWidth = strokeWidth; ctx.strokeStyle = stroke; ctx.strokeText(s, x0, y); }
  if (color) { ctx.fillStyle = color; ctx.fillText(s, x0, y); }
  setSpacing(ctx, 0);
  ctx.restore();
  return w;
}

/** maxW'ye sığan en büyük punto (minPx'e kadar; altında "…" ile kısaltılır). */
function fit(ctx, t, maxW, px, weight, family, { spacing = 0, minPx = 16, style = "" } = {}) {
  let size = px;
  const sp = (k) => spacing * (k / px);
  while (size > minPx && measure(ctx, t, F(size, weight, family, style), sp(size)) > maxW) size -= 1;
  let s = String(t ?? "");
  const font = F(size, weight, family, style);
  if (measure(ctx, s, font, sp(size)) > maxW) {
    while (s.length > 1 && measure(ctx, `${s}…`, font, sp(size)) > maxW) s = s.slice(0, -1).trimEnd();
    s = `${s}…`;
  }
  return { text: s, font, size, spacing: sp(size) };
}

/** Uzun adı iki satıra böler (yalnız sığmıyorsa): ["ANKARA", "GENÇLİKSPOR"]. */
function splitName(ctx, name, maxW, font, spacing) {
  if (measure(ctx, name, font, spacing) <= maxW) return [name];
  const words = name.split(" ");
  if (words.length < 2) return [name];
  let best = null;
  for (let i = 1; i < words.length; i += 1) {
    const a = words.slice(0, i).join(" "); const b = words.slice(i).join(" ");
    const w = Math.max(measure(ctx, a, font, spacing), measure(ctx, b, font, spacing));
    if (!best || w < best.w) best = { w, lines: [a, b] };
  }
  return best.lines;
}

/**
 * Takım adı bloğu: tek satıra sığmazsa iki satır, yine sığmazsa küçültür.
 * → kullanılan yükseklik.
 */
function nameBlock(ctx, name, x, y, maxW, { px = 64, weight = 800, family = COND, color = "#fff", align = "center", spacing = 0.5, lineGap = 0.92, shadow = null, minPx = 26, maxLines = 2, valign = "top" } = {}) {
  const s = upperTr(name);
  let size = px;
  let lines;
  for (;;) {
    const font = F(size, weight, family);
    const sp = spacing * (size / px);
    lines = maxLines > 1 ? splitName(ctx, s, maxW, font, sp) : [s];
    const widest = Math.max(...lines.map((l) => measure(ctx, l, font, sp)));
    if (widest <= maxW || size <= minPx) break;
    size -= 2;
  }
  const lh = size * lineGap;
  const total = lh * lines.length;
  const y0 = valign === "middle" ? y - total / 2 + lh / 2 : valign === "bottom" ? y - total + lh / 2 : y + lh / 2;
  lines.forEach((l, i) => {
    const f = fit(ctx, l, maxW, size, weight, family, { spacing: spacing * (size / px), minPx: size });
    text(ctx, f.text, x, y0 + i * lh, { font: f.font, color, align, spacing: f.spacing, shadow });
  });
  return total;
}

/* ------------------------------ şekil / görsel ------------------------------ */

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
  try { ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh); } catch { return false; }
  return true;
}

function drawFill(ctx, img, x, y, w, h) {
  const { w: iw, h: ih } = imgSize(img);
  if (!iw || !ih) return false;
  const k = Math.max(w / iw, h / ih);
  const sw = w / k; const sh = h / k;
  try { ctx.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, x, y, w, h); } catch { return false; }
  return true;
}

function radial(ctx, x, y, r, color, a, { mid = 0.45, midA = null } = {}) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(color, a));
  g.addColorStop(mid, rgba(color, midA ?? a * 0.35));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, COVER_W, COVER_H);
}

function vignette(ctx, strength = 0.55, inner = 0.42) {
  const g = ctx.createRadialGradient(COVER_W / 2, COVER_H / 2, COVER_H * inner, COVER_W / 2, COVER_H / 2, COVER_W * 0.75);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, `rgba(0,0,0,${strength})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, COVER_W, COVER_H);
}

/** Deterministik sözde rastgele. */
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

/* İnce film greni: 160 px'lik gürültü deseni (önbellekli; tuval yoksa atlanır). */
const grainTiles = new Map();
function grainTile(dark) {
  const key = dark ? "d" : "l";
  if (grainTiles.has(key)) return grainTiles.get(key);
  let c = null;
  try {
    if (typeof document !== "undefined" && document.createElement) {
      c = document.createElement("canvas");
      c.width = 160; c.height = 160;
      const x = c.getContext?.("2d");
      if (!x || !x.createImageData) c = null;
      else {
        const im = x.createImageData(160, 160);
        const r = rng(dark ? 7 : 11);
        for (let i = 0; i < im.data.length; i += 4) {
          const v = r();
          const on = dark ? 0 : 255;
          im.data[i] = on; im.data[i + 1] = on; im.data[i + 2] = on;
          im.data[i + 3] = Math.round(v * v * 255);
        }
        x.putImageData(im, 0, 0);
      }
    }
  } catch { c = null; }
  grainTiles.set(key, c);
  return c;
}
function grain(ctx, alpha = 0.05, { dark = false } = {}) {
  const tile = grainTile(dark);
  if (!tile) return;
  let p = null;
  try { p = ctx.createPattern?.(tile, "repeat"); } catch { p = null; }
  if (!p) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = p;
  ctx.fillRect(0, 0, COVER_W, COVER_H);
  ctx.restore();
}

/** Çapraz ince çizgi dokusu. */
function hatch(ctx, color, alpha, gap = 14, angle = 1) {
  ctx.save();
  ctx.strokeStyle = rgba(color, alpha);
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = -COVER_H; x < COVER_W + COVER_H; x += gap) { ctx.moveTo(x, 0); ctx.lineTo(x + COVER_H * angle, COVER_H); }
  ctx.stroke();
  ctx.restore();
}

/* ------------------------------ arma ------------------------------ */

/**
 * Arma (logo) ya da baş harf rozeti. style:
 *   disc   koyu disk + takım rengi halka + ince dış halka (varsayılan)
 *   plate  beyaz tabak + yumuşak gölge (renkli zeminler)
 *   bare   tabaksız logo + gölge (logo yoksa takım rengi disk)
 *   neon   koyu disk + parlayan takım rengi halka
 *   ring   ince altın / renkli halka, şeffaf iç (sinematik)
 */
function crest(ctx, team, cx, cy, size, color, { style = "disc", ring = color, glow = null } = {}) {
  const r = size / 2;
  const img = team.img && imgSize(team.img).w ? team.img : null;
  ctx.save();
  if (style === "disc" || style === "neon" || style === "ring") {
    // gölge + gövde
    ctx.save();
    ctx.shadowColor = glow || "rgba(0,0,0,0.55)";
    ctx.shadowBlur = size * (glow ? 0.28 : 0.16);
    ctx.shadowOffsetY = glow ? 0 : size * 0.05;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
    const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.45, r * 0.1, cx, cy, r);
    if (style === "ring") { g.addColorStop(0, "rgba(255,255,255,0.07)"); g.addColorStop(1, "rgba(255,255,255,0.015)"); }
    else { g.addColorStop(0, "#2a2d38"); g.addColorStop(1, "#0d0e13"); }
    ctx.fillStyle = g;
    ctx.fill();
    ctx.restore();
    // halkalar
    const lw = style === "ring" ? Math.max(1.5, size * 0.008) : Math.max(3, size * 0.026);
    ctx.save();
    if (style === "neon") { ctx.shadowColor = ring; ctx.shadowBlur = size * 0.12; }
    ctx.beginPath(); ctx.arc(cx, cy, r - lw / 2, 0, Math.PI * 2);
    ctx.lineWidth = lw; ctx.strokeStyle = ring; ctx.stroke();
    if (style === "neon") { ctx.lineWidth = lw * 0.35; ctx.strokeStyle = "rgba(255,255,255,0.85)"; ctx.stroke(); }
    ctx.restore();
    if (style === "disc") {
      ctx.beginPath(); ctx.arc(cx, cy, r + size * 0.045, 0, Math.PI * 2);
      ctx.lineWidth = Math.max(1, size * 0.006); ctx.strokeStyle = "rgba(255,255,255,0.22)"; ctx.stroke();
      // üst parıltı
      ctx.save();
      ctx.beginPath(); ctx.arc(cx, cy, r - lw, 0, Math.PI * 2); ctx.clip();
      const hl = ctx.createLinearGradient(0, cy - r, 0, cy);
      hl.addColorStop(0, "rgba(255,255,255,0.10)"); hl.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = hl; ctx.fillRect(cx - r, cy - r, size, r);
      ctx.restore();
    }
  } else if (style === "plate") {
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.45)"; ctx.shadowBlur = size * 0.14; ctx.shadowOffsetY = size * 0.05;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
    const g = ctx.createLinearGradient(0, cy - r, 0, cy + r);
    g.addColorStop(0, "#ffffff"); g.addColorStop(1, "#e9ebf0");
    ctx.fillStyle = g; ctx.fill();
    ctx.restore();
    if (ring) {
      ctx.beginPath(); ctx.arc(cx, cy, r + size * 0.035, 0, Math.PI * 2);
      ctx.lineWidth = Math.max(2, size * 0.014); ctx.strokeStyle = rgba(ring, 0.9); ctx.stroke();
    }
  }
  ctx.restore();

  const box = style === "bare" ? size : size * (style === "plate" ? 0.68 : 0.62);
  if (img) {
    ctx.save();
    ctx.shadowColor = style === "plate" ? "rgba(0,0,0,0.18)" : "rgba(0,0,0,0.5)";
    ctx.shadowBlur = box * (style === "bare" ? 0.1 : 0.06);
    ctx.shadowOffsetY = box * (style === "bare" ? 0.04 : 0.02);
    const ok = drawContain(ctx, img, cx - box / 2, cy - box / 2, box, box);
    ctx.restore();
    if (ok) return;
  }
  // Baş harf rozeti (takım rengi disk + yoğun yazı).
  const br = style === "bare" ? r * 0.92 : r * 0.74;
  ctx.save();
  if (style === "bare") { ctx.shadowColor = "rgba(0,0,0,0.45)"; ctx.shadowBlur = size * 0.1; ctx.shadowOffsetY = size * 0.04; }
  const g = ctx.createLinearGradient(cx, cy - br, cx, cy + br);
  g.addColorStop(0, shade(color, 0.06));
  g.addColorStop(1, shade(color, -0.14));
  ctx.beginPath(); ctx.arc(cx, cy, br, 0, Math.PI * 2);
  ctx.fillStyle = g; ctx.fill();
  ctx.restore();
  ctx.beginPath(); ctx.arc(cx, cy, br - Math.max(1.5, size * 0.012), 0, Math.PI * 2);
  ctx.lineWidth = Math.max(1.5, size * 0.012); ctx.strokeStyle = "rgba(255,255,255,0.35)"; ctx.stroke();
  const label = team.initials || "?";
  const f = fit(ctx, label, br * 1.45, br * (Array.from(label).length > 2 ? 0.86 : 1.06), 800, COND, { minPx: 10 });
  text(ctx, f.text, cx, cy + br * 0.04, { font: f.font, color: "#fff", align: "center", spacing: f.size * 0.02 });
}

/* ------------------------------ rozet / logo ------------------------------ */

/** "● CANLI" rozeti; align: left | right | center. → genişlik. */
function liveBadge(ctx, label, x, y, { h = 40, align = "left", tone = "#ff2337", outline = false, ink = "#fff" } = {}) {
  const font = F(h * 0.44, 800, SANS);
  const sp = h * 0.05;
  const tw = measure(ctx, label, font, sp);
  const w = tw + h * 1.24;
  const x0 = align === "right" ? x - w : align === "center" ? x - w / 2 : x;
  ctx.save();
  roundRect(ctx, x0, y, w, h, h * 0.16);
  if (outline) { ctx.lineWidth = Math.max(1.5, h * 0.05); ctx.strokeStyle = tone; ctx.stroke(); } else {
    ctx.shadowColor = "rgba(0,0,0,0.35)"; ctx.shadowBlur = 14; ctx.shadowOffsetY = 4;
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, shade(tone, 0.05)); g.addColorStop(1, shade(tone, -0.08));
    ctx.fillStyle = g; ctx.fill();
  }
  ctx.restore();
  ctx.save();
  ctx.beginPath(); ctx.arc(x0 + h * 0.42, y + h / 2, h * 0.12, 0, Math.PI * 2);
  ctx.fillStyle = outline ? tone : ink; ctx.fill();
  ctx.beginPath(); ctx.arc(x0 + h * 0.42, y + h / 2, h * 0.22, 0, Math.PI * 2);
  ctx.strokeStyle = outline ? rgba(tone, 0.4) : "rgba(255,255,255,0.4)"; ctx.lineWidth = Math.max(1, h * 0.035); ctx.stroke();
  ctx.restore();
  text(ctx, label, x0 + h * 0.8, y + h / 2 + h * 0.02, { font, color: outline ? tone : ink, spacing: sp });
  return w;
}

/** Marka logosu (yükseklik h) ya da marka adı. dark: açık zeminde koyu yonga. */
function brandMark(ctx, img, name, x, y, h, { align = "right", dark = false, color = "#fff", alpha = 1 } = {}) {
  const { w: iw, h: ih } = imgSize(img);
  ctx.save();
  ctx.globalAlpha *= alpha;
  if (img && iw && ih) {
    const w = Math.min(h * 3.2, (iw / ih) * h);
    const hh = (w / iw) * ih;
    const x0 = align === "right" ? x - w : align === "center" ? x - w / 2 : x;
    if (dark) {
      roundRect(ctx, x0 - h * 0.22, y - h * 0.18, w + h * 0.44, h * 1.36, h * 0.24);
      ctx.fillStyle = "#121318";
      ctx.fill();
    }
    let drawn = false;
    try { ctx.drawImage(img, x0, y + (h - hh) / 2, w, hh); drawn = true; } catch { /* yazıya düş */ }
    if (drawn) { ctx.restore(); return; }
  }
  text(ctx, upperTr(name || "ELİT LİG"), x, y + h / 2, { font: F(h * 0.46, 800, COND), color: dark ? "#121318" : color, align, spacing: h * 0.06 });
  ctx.restore();
}

/** Zemin fotoğrafı + şablon zemini (fotoğraf varsa şablon zemini saydamlıkla üstüne). */
function base(ctx, I, S, paint) {
  if (I.bg && imgSize(I.bg).w && drawFill(ctx, I.bg, 0, 0, COVER_W, COVER_H)) {
    ctx.save();
    ctx.globalAlpha = S.backgroundDim / 100;
    paint();
    ctx.restore();
  } else paint();
}

const teamsOf = (D, I) => ({ home: { ...D.home, img: I.home }, away: { ...D.away, img: I.away } });

/** Ortak üst köşeler: CANLI (sol) + marka (sağ). */
function corners(ctx, D, S, I, { y = 44, x = 52, liveH = 40, brandH = 58, dark = false, liveOutline = false, liveTone } = {}) {
  if (S.show.live) liveBadge(ctx, upperTr(S.liveLabel), x, y, { h: liveH, outline: liveOutline, ...(liveTone ? { tone: liveTone } : {}) });
  if (S.show.brand) brandMark(ctx, I.brand, D.brand.name, COVER_W - x, y + liveH / 2 - brandH / 2, brandH, { dark });
}

/** Küçük harf aralıklı başlık (lig · sezon). */
function kicker(ctx, t, x, y, { size = 19, color = "rgba(255,255,255,0.86)", align = "center", rule = null, weight = 700, maxW = 760 } = {}) {
  if (!t) return 0;
  const f = fit(ctx, upperTr(t), maxW, size, weight, SANS, { spacing: size * 0.24, minPx: 12 });
  const w = text(ctx, f.text, x, y, { font: f.font, color, align, spacing: f.spacing });
  if (rule) {
    const gap = 18; const len = 46;
    const x0 = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
    ctx.save();
    ctx.fillStyle = rule;
    if (align !== "left") ctx.fillRect(x0 - gap - len, y - 1, len, 2);
    if (align !== "right") ctx.fillRect(x0 + w + gap, y - 1, len, 2);
    ctx.restore();
  }
  return w;
}

/** Lig · sezon: koyu hap içinde (renkli zeminlerde okunur). */
function compPill(ctx, D, S, cx, y, { h = 42, bg = "#0a0b0f", color = "#fff" } = {}) {
  const comp = competitionLine(D, S.show);
  if (!comp) return;
  const f = fit(ctx, upperTr(comp), 520, 17, 700, SANS, { spacing: 4, minPx: 12 });
  const w = measure(ctx, f.text, f.font, f.spacing) + 48;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.35)"; ctx.shadowBlur = 16; ctx.shadowOffsetY = 4;
  roundRect(ctx, cx - w / 2, y, w, h, h / 2); ctx.fillStyle = bg; ctx.fill();
  ctx.restore();
  text(ctx, f.text, cx, y + h / 2 + 1, { font: f.font, color, align: "center", spacing: f.spacing });
}

/** "CUMA 20 KASIM" — gün adı + tarih (yıl olmadan, kısa). */
function dayLine(D, S, { year = false } = {}) {
  if (!S.show.date) return "";
  const date = year ? D.date : D.date.replace(/\s\d{4}$/, "");
  return [D.day, date].filter(Boolean).join(" ");
}

/**
 * Bilgi satırı: [tarih] | saat | [saha] — ortalanmış, ince ayraçlı.
 * timeStyle: saat vurgulu (yoğun dar yazı).
 */
function infoRow(ctx, D, S, cx, y, { color = "#fff", muted = "rgba(255,255,255,0.72)", sep = "rgba(255,255,255,0.28)", size = 22, timeSize = 44, timeColor = color, maxW = 1100, year = false } = {}) {
  const items = [];
  const day = dayLine(D, S, { year });
  if (day) items.push({ t: upperTr(day), font: F(size, 600, SANS), sp: size * 0.12, color: muted });
  if (S.show.time && D.time) items.push({ t: D.time, font: F(timeSize, 800, COND), sp: timeSize * 0.02, color: timeColor });
  const where = whereLine(D, S.show);
  if (where) items.push({ t: upperTr(where), font: F(size, 600, SANS), sp: size * 0.12, color: muted, shrink: true });
  if (!items.length) return;
  const gap = size * 1.5;
  let widths = items.map((it) => measure(ctx, it.t, it.font, it.sp));
  const total = () => widths.reduce((a, b) => a + b, 0) + gap * (items.length - 1);
  // Saha adı uzunsa kısalt.
  const last = items[items.length - 1];
  if (total() > maxW && last.shrink) {
    const room = maxW - (total() - widths[widths.length - 1]);
    const f = fit(ctx, last.t, Math.max(80, room), size, 600, SANS, { spacing: last.sp, minPx: size * 0.8 });
    last.t = f.text; last.font = f.font; last.sp = f.spacing;
    widths = items.map((it) => measure(ctx, it.t, it.font, it.sp));
  }
  let x = cx - total() / 2;
  items.forEach((it, i) => {
    if (i > 0) { ctx.fillStyle = sep; ctx.fillRect(x - gap / 2 - 1, y - size * 0.62, 2, size * 1.24); }
    text(ctx, it.t, x, y + (it.font.includes(COND) ? size * 0.06 : 0), { font: it.font, color: it.color, spacing: it.sp });
    x += widths[i] + gap;
  });
}

/** "VS" — eğik dar yazı. */
function vs(ctx, cx, cy, { size = 120, color = "#fff", shadow = { color: "rgba(0,0,0,0.5)", blur: 24, y: 6 }, stroke = null, strokeWidth = 0, style = "italic", weight = 800 } = {}) {
  text(ctx, "VS", cx, cy + size * 0.04, { font: F(size, weight, COND, style), color, align: "center", spacing: size * 0.02, shadow, stroke, strokeWidth });
}

/* ═══════════════════════════ 1. Klasik VS ═══════════════════════════ */

function klasik(ctx, D, S, C, I) {
  const T = teamsOf(D, I);
  base(ctx, I, S, () => {
    const g = ctx.createLinearGradient(0, 0, 0, COVER_H);
    g.addColorStop(0, "#0d1019"); g.addColorStop(1, "#06070b");
    ctx.fillStyle = g; ctx.fillRect(0, 0, COVER_W, COVER_H);
    radial(ctx, 150, 330, 760, C.home, 0.55, { mid: 0.5 });
    radial(ctx, 1130, 330, 760, C.away, 0.55, { mid: 0.5 });
  });
  // orta ışık sütunu
  const col = ctx.createLinearGradient(540, 0, 740, 0);
  col.addColorStop(0, "rgba(255,255,255,0)"); col.addColorStop(0.5, "rgba(255,255,255,0.05)"); col.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = col; ctx.fillRect(0, 0, COVER_W, COVER_H);
  grain(ctx, 0.07);
  vignette(ctx, 0.5);

  kicker(ctx, competitionLine(D, S.show), 640, 66, { rule: "rgba(255,255,255,0.35)" });
  crest(ctx, T.home, 300, 318, 248, C.home, { ring: C.home });
  crest(ctx, T.away, 980, 318, 248, C.away, { ring: C.away });
  vs(ctx, 640, 318, { size: 128 });
  ctx.fillStyle = "rgba(255,255,255,0.3)";
  ctx.fillRect(639, 196, 2, 54); ctx.fillRect(639, 386, 2, 54);

  nameBlock(ctx, D.home.name, 300, 514, 470, { px: 66, valign: "middle", shadow: { color: "rgba(0,0,0,0.5)", blur: 16, y: 3 } });
  nameBlock(ctx, D.away.name, 980, 514, 470, { px: 66, valign: "middle", shadow: { color: "rgba(0,0,0,0.5)", blur: 16, y: 3 } });

  // alt bilgi bandı
  const bg = ctx.createLinearGradient(0, 600, 0, COVER_H);
  bg.addColorStop(0, "rgba(0,0,0,0)"); bg.addColorStop(0.4, "rgba(0,0,0,0.55)"); bg.addColorStop(1, "rgba(0,0,0,0.75)");
  ctx.fillStyle = bg; ctx.fillRect(0, 600, COVER_W, 120);
  infoRow(ctx, D, S, 640, 660, { timeSize: 46 });
  ctx.fillStyle = C.home; ctx.fillRect(0, COVER_H - 6, COVER_W / 2, 6);
  ctx.fillStyle = C.away; ctx.fillRect(COVER_W / 2, COVER_H - 6, COVER_W / 2, 6);
  corners(ctx, D, S, I);
}

/* ═══════════════════════════ 2. Stadyum ışıkları ═══════════════════════════ */

function stadyum(ctx, D, S, C, I) {
  const T = teamsOf(D, I);
  const HZ = 452; // ufuk
  base(ctx, I, S, () => {
    const sky = ctx.createLinearGradient(0, 0, 0, HZ);
    sky.addColorStop(0, "#03060d"); sky.addColorStop(0.7, "#0b1830"); sky.addColorStop(1, "#16294a");
    ctx.fillStyle = sky; ctx.fillRect(0, 0, COVER_W, HZ);
    const pitch = ctx.createLinearGradient(0, HZ, 0, COVER_H);
    pitch.addColorStop(0, "#1d5a32"); pitch.addColorStop(1, "#0a2614");
    ctx.fillStyle = pitch; ctx.fillRect(0, HZ, COVER_W, COVER_H - HZ);
    // perspektif biçme şeritleri
    ctx.save();
    ctx.beginPath(); ctx.rect(0, HZ, COVER_W, COVER_H - HZ); ctx.clip();
    for (let i = -10; i < 11; i += 1) {
      if (i % 2) continue;
      const topL = 640 + i * 70; const topR = 640 + (i + 1) * 70;
      const botL = 640 + i * 260; const botR = 640 + (i + 1) * 260;
      ctx.beginPath(); ctx.moveTo(topL, HZ); ctx.lineTo(topR, HZ); ctx.lineTo(botR, COVER_H); ctx.lineTo(botL, COVER_H); ctx.closePath();
      ctx.fillStyle = "rgba(255,255,255,0.035)"; ctx.fill();
    }
    ctx.strokeStyle = "rgba(255,255,255,0.32)"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(640, 640, 330, 70, 0, Math.PI, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, HZ + 34); ctx.lineTo(COVER_W, HZ + 34); ctx.stroke();
    ctx.restore();
    // tribün silueti
    ctx.fillStyle = "#050a14";
    ctx.beginPath(); ctx.moveTo(0, HZ); ctx.lineTo(0, HZ - 70); ctx.lineTo(220, HZ - 92); ctx.lineTo(520, HZ - 62); ctx.lineTo(760, HZ - 62); ctx.lineTo(1060, HZ - 92); ctx.lineTo(COVER_W, HZ - 70); ctx.lineTo(COVER_W, HZ); ctx.closePath(); ctx.fill();
  });
  // projektör ışık konileri
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const [x, dir] of [[110, 1], [1170, -1]]) {
    for (let k = 0; k < 3; k += 1) {
      const g = ctx.createLinearGradient(x, 60, x + dir * 420, HZ + 120);
      g.addColorStop(0, "rgba(220,235,255,0.20)"); g.addColorStop(1, "rgba(220,235,255,0)");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(x - 10, 70); ctx.lineTo(x + 10, 70);
      ctx.lineTo(x + dir * (420 + k * 120) + 120, COVER_H); ctx.lineTo(x + dir * (180 + k * 120) - 60, COVER_H); ctx.closePath(); ctx.fill();
    }
    radial(ctx, x, 72, 210, "#dbe8ff", 0.5, { mid: 0.2, midA: 0.18 });
    for (let r = 0; r < 2; r += 1) for (let c = 0; c < 5; c += 1) {
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.beginPath(); ctx.arc(x - 34 + c * 17, 62 + r * 15, 4.2, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.restore();
  // ufuk pusu
  const haze = ctx.createLinearGradient(0, HZ - 80, 0, HZ + 60);
  haze.addColorStop(0, "rgba(190,215,255,0)"); haze.addColorStop(0.6, "rgba(190,215,255,0.12)"); haze.addColorStop(1, "rgba(190,215,255,0)");
  ctx.fillStyle = haze; ctx.fillRect(0, HZ - 80, COVER_W, 140);
  grain(ctx, 0.06);
  vignette(ctx, 0.5);

  kicker(ctx, competitionLine(D, S.show), 640, 66, { rule: "rgba(255,255,255,0.35)" });
  crest(ctx, T.home, 330, 292, 226, C.home, { ring: C.home, glow: rgba(C.home, 0.65) });
  crest(ctx, T.away, 950, 292, 226, C.away, { ring: C.away, glow: rgba(C.away, 0.65) });
  vs(ctx, 640, 292, { size: 104 });
  nameBlock(ctx, D.home.name, 330, 470, 440, { px: 58, valign: "middle", shadow: { color: "rgba(0,0,0,0.75)", blur: 18, y: 3 } });
  nameBlock(ctx, D.away.name, 950, 470, 440, { px: 58, valign: "middle", shadow: { color: "rgba(0,0,0,0.75)", blur: 18, y: 3 } });

  const shadeB = ctx.createLinearGradient(0, 560, 0, COVER_H);
  shadeB.addColorStop(0, "rgba(0,0,0,0)"); shadeB.addColorStop(1, "rgba(0,0,0,0.7)");
  ctx.fillStyle = shadeB; ctx.fillRect(0, 560, COVER_W, 160);
  infoRow(ctx, D, S, 640, 652, { timeSize: 52 });
  corners(ctx, D, S, I, { y: 118 });
}

/* ═══════════════════════════ 3. Çapraz renkler ═══════════════════════════ */

function capraz(ctx, D, S, C, I) {
  const T = teamsOf(D, I);
  const A = [770, 0]; const B = [510, COVER_H]; // ayrım çizgisi
  base(ctx, I, S, () => {
    const gh = ctx.createLinearGradient(0, 0, 760, COVER_H);
    gh.addColorStop(0, shade(C.home, 0.02)); gh.addColorStop(1, shade(C.home, -0.2));
    ctx.fillStyle = gh;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.lineTo(0, COVER_H); ctx.closePath(); ctx.fill();
    const ga = ctx.createLinearGradient(COVER_W, 0, 520, COVER_H);
    ga.addColorStop(0, shade(C.away, 0.02)); ga.addColorStop(1, shade(C.away, -0.2));
    ctx.fillStyle = ga;
    ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(COVER_W, 0); ctx.lineTo(COVER_W, COVER_H); ctx.lineTo(B[0], B[1]); ctx.closePath(); ctx.fill();
  });
  hatch(ctx, "#ffffff", 0.045, 16, -0.36);
  // ışık: sol üst ve sağ alt
  radial(ctx, 260, 240, 520, "#ffffff", 0.16);
  radial(ctx, 1020, 330, 520, "#ffffff", 0.12);
  // ayrım: koyu gölge + beyaz şerit
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.55)"; ctx.shadowBlur = 40;
  ctx.strokeStyle = "#0b0c10"; ctx.lineWidth = 30;
  ctx.beginPath(); ctx.moveTo(A[0], A[1] - 20); ctx.lineTo(B[0], B[1] + 20); ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.moveTo(A[0] + 20, A[1] - 20); ctx.lineTo(B[0] + 20, B[1] + 20); ctx.stroke();
  grain(ctx, 0.08);
  vignette(ctx, 0.42);

  // üst / alt bant
  const top = ctx.createLinearGradient(0, 0, 0, 130);
  top.addColorStop(0, "rgba(0,0,0,0.35)"); top.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = top; ctx.fillRect(0, 0, COVER_W, 130);
  compPill(ctx, D, S, 640, 44);

  crest(ctx, T.home, 300, 272, 236, C.home, { style: "plate", ring: null });
  crest(ctx, T.away, 980, 272, 236, C.away, { style: "plate", ring: null });
  // VS: ayrım üzerinde koyu disk
  const vy = 272; const vx = A[0] + (B[0] - A[0]) * (vy / COVER_H) - 20;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.5)"; ctx.shadowBlur = 24; ctx.shadowOffsetY = 6;
  ctx.beginPath(); ctx.arc(vx + 30, vy, 64, 0, Math.PI * 2); ctx.fillStyle = "#0b0c10"; ctx.fill();
  ctx.restore();
  ctx.beginPath(); ctx.arc(vx + 30, vy, 64, 0, Math.PI * 2); ctx.lineWidth = 3; ctx.strokeStyle = "#fff"; ctx.stroke();
  vs(ctx, vx + 30, vy, { size: 64, shadow: null });

  const sh = { color: "rgba(0,0,0,0.45)", blur: 14, y: 3 };
  nameBlock(ctx, D.home.name, 300, 474, 470, { px: 70, valign: "middle", shadow: sh });
  nameBlock(ctx, D.away.name, 980, 474, 470, { px: 70, valign: "middle", shadow: sh });

  ctx.fillStyle = "rgba(8,9,12,0.86)"; ctx.fillRect(0, 604, COVER_W, 116);
  ctx.fillStyle = C.home; ctx.fillRect(0, 604, COVER_W / 2, 4);
  ctx.fillStyle = C.away; ctx.fillRect(COVER_W / 2, 604, COVER_W / 2, 4);
  infoRow(ctx, D, S, 640, 662, { timeSize: 48 });
  corners(ctx, D, S, I);
}

/* ═══════════════════════════ 4. Minimal ═══════════════════════════ */

function minimal(ctx, D, S, C, I) {
  const T = teamsOf(D, I);
  const ink = "#111318";
  const muted = "#6b6f78";
  const accent = shade(C.accent, -0.06);
  base(ctx, I, S, () => {
    ctx.fillStyle = "#f4f3ef"; ctx.fillRect(0, 0, COVER_W, COVER_H);
    // çok hafif büyük daire izleri
    ctx.strokeStyle = "rgba(17,19,24,0.05)"; ctx.lineWidth = 2;
    for (const r of [260, 360, 460]) { ctx.beginPath(); ctx.arc(1090, 360, r, 0, Math.PI * 2); ctx.stroke(); }
  });
  grain(ctx, 0.05, { dark: true });
  // üst renk çizgisi
  ctx.fillStyle = C.home; ctx.fillRect(0, 0, COVER_W / 2, 8);
  ctx.fillStyle = C.away; ctx.fillRect(COVER_W / 2, 0, COVER_W / 2, 8);

  const X = 84;
  if (S.show.live) liveBadge(ctx, upperTr(S.liveLabel), X, 54, { h: 36 });
  if (S.show.brand) brandMark(ctx, I.brand, D.brand.name, COVER_W - X + 10, 50, 44, { dark: true });
  kicker(ctx, competitionLine(D, S.show), X, 136, { color: accent, align: "left", size: 18, weight: 800, maxW: 700 });

  // iki satır: arma + ad
  const rowY = [252, 438];
  const teams = [[T.home, D.home.name, C.home], [T.away, D.away.name, C.away]];
  teams.forEach(([team, name, color], i) => {
    const y = rowY[i];
    crest(ctx, team, X + 64, y, 128, color, { style: "bare" });
    nameBlock(ctx, name, X + 160, y, 760, { px: 92, color: ink, align: "left", maxLines: 1, minPx: 44, valign: "middle", spacing: 0.2 });
  });
  // orta "vs" çizgisi
  ctx.fillStyle = "rgba(17,19,24,0.14)"; ctx.fillRect(X + 160, 345, 640, 2);
  text(ctx, "VS", X + 64, 346, { font: F(30, 800, COND, "italic"), color: muted, align: "center", spacing: 1 });

  // alt bilgi: üç sütun
  ctx.fillStyle = ink; ctx.fillRect(X, 556, COVER_W - X * 2, 2);
  const cols = [
    S.show.date ? ["TARİH", upperTr(dayLine(D, S))] : null,
    S.show.time && D.time ? ["SAAT", D.time] : null,
    whereLine(D, S.show) ? ["SAHA", upperTr(whereLine(D, S.show))] : null,
  ].filter(Boolean);
  const widths = cols.map(([, v]) => (v === D.time ? 200 : 380));
  let x = X;
  cols.forEach(([label, value], i) => {
    text(ctx, label, x, 590, { font: F(14, 700, SANS), color: muted, spacing: 3 });
    const isTime = value === D.time;
    const f = fit(ctx, value, (i === cols.length - 1 ? COVER_W - X - x : widths[i]) - 20, isTime ? 54 : 34, isTime ? 800 : 700, COND, { minPx: 20, spacing: 0.5 });
    text(ctx, f.text, x, isTime ? 638 : 636, { font: f.font, color: isTime ? accent : ink, spacing: f.spacing });
    x += widths[i];
  });
}

/* ═══════════════════════════ 5. Neon ═══════════════════════════ */

function neon(ctx, D, S, C, I) {
  const T = teamsOf(D, I);
  const HZ = 470;
  base(ctx, I, S, () => {
    const g = ctx.createLinearGradient(0, 0, 0, COVER_H);
    g.addColorStop(0, "#06030d"); g.addColorStop(0.62, "#140829"); g.addColorStop(1, "#07030f");
    ctx.fillStyle = g; ctx.fillRect(0, 0, COVER_W, COVER_H);
  });
  radial(ctx, 640, HZ, 700, C.accent, 0.28, { mid: 0.35 });
  radial(ctx, 230, 300, 420, C.home, 0.22);
  radial(ctx, 1050, 300, 420, C.away, 0.22);
  // perspektif ızgara (zemin)
  ctx.save();
  ctx.beginPath(); ctx.rect(0, HZ, COVER_W, COVER_H - HZ); ctx.clip();
  ctx.strokeStyle = rgba(C.accent, 0.32); ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = -16; i <= 16; i += 1) { ctx.moveTo(640 + i * 30, HZ); ctx.lineTo(640 + i * 190, COVER_H); }
  for (let k = 0; k < 9; k += 1) { const y = HZ + (COVER_H - HZ) * ((k / 8) ** 1.9); ctx.moveTo(0, y); ctx.lineTo(COVER_W, y); }
  ctx.stroke();
  const fade = ctx.createLinearGradient(0, HZ, 0, COVER_H);
  fade.addColorStop(0, "rgba(7,3,15,0.6)"); fade.addColorStop(0.5, "rgba(7,3,15,0)"); fade.addColorStop(1, "rgba(7,3,15,0.65)");
  ctx.fillStyle = fade; ctx.fillRect(0, HZ, COVER_W, COVER_H - HZ);
  ctx.restore();
  // ufuk çizgisi
  ctx.save();
  ctx.shadowColor = C.accent; ctx.shadowBlur = 18;
  ctx.fillStyle = rgba(C.accent, 0.85); ctx.fillRect(0, HZ - 1, COVER_W, 2);
  ctx.restore();
  grain(ctx, 0.06);

  kicker(ctx, competitionLine(D, S.show), 640, 66, { color: "rgba(255,255,255,0.82)", rule: rgba(C.accent, 0.8) });
  crest(ctx, T.home, 300, 288, 232, C.home, { style: "neon", ring: C.home, glow: rgba(C.home, 0.7) });
  crest(ctx, T.away, 980, 288, 232, C.away, { style: "neon", ring: C.away, glow: rgba(C.away, 0.7) });
  vs(ctx, 640, 288, { size: 118, color: rgba(C.accent, 0.16), stroke: C.accent, strokeWidth: 4, shadow: { color: C.accent, blur: 22 } });
  vs(ctx, 640, 288, { size: 118, color: null, stroke: "#ffffff", strokeWidth: 1.2, shadow: null });

  nameBlock(ctx, D.home.name, 300, 482, 460, { px: 60, valign: "middle", shadow: { color: rgba(C.home, 0.9), blur: 22 } });
  nameBlock(ctx, D.away.name, 980, 482, 460, { px: 60, valign: "middle", shadow: { color: rgba(C.away, 0.9), blur: 22 } });

  infoRow(ctx, D, S, 640, 640, { timeSize: 58, timeColor: "#fff", muted: "rgba(255,255,255,0.78)", sep: rgba(C.accent, 0.6) });
  corners(ctx, D, S, I, { liveTone: "#ff2a6d" });
}

/* ═══════════════════════════ 6. Poster ═══════════════════════════ */

function poster(ctx, D, S, C, I) {
  const T = teamsOf(D, I);
  const ink = "#16140f";
  const red = "#d7261e";
  base(ctx, I, S, () => {
    const g = ctx.createRadialGradient(560, 320, 100, 640, 360, 900);
    g.addColorStop(0, "#f3ecdc"); g.addColorStop(1, "#ddd2ba");
    ctx.fillStyle = g; ctx.fillRect(0, 0, COVER_W, COVER_H);
  });
  grain(ctx, 0.12, { dark: true });
  // çerçeve
  ctx.strokeStyle = ink; ctx.lineWidth = 3; ctx.strokeRect(28, 28, COVER_W - 56, COVER_H - 56);
  ctx.lineWidth = 1; ctx.strokeRect(38, 38, COVER_W - 76, COVER_H - 76);

  // üst satır
  const X = 76;
  kicker(ctx, competitionLine(D, S.show), X, 86, { color: ink, align: "left", size: 18, weight: 800, maxW: 620 });
  if (S.show.brand) brandMark(ctx, I.brand, D.brand.name, COVER_W - X, 62, 46, { dark: true });
  ctx.fillStyle = ink; ctx.fillRect(X, 118, COVER_W - X * 2, 3);

  // manşet: büyük adlar (sol), armalar (sağ)
  const maxW = 700;
  const h1 = nameBlock(ctx, D.home.name, X - 4, 150, maxW, { px: 112, color: ink, align: "left", maxLines: 2, minPx: 48, lineGap: 0.9, spacing: 0 });
  const y2 = 150 + h1 + 4;
  text(ctx, "—", X, y2 + 24, { font: F(40, 800, COND), color: red });
  text(ctx, "KARŞI", X + 42, y2 + 26, { font: F(18, 800, SANS), color: red, spacing: 5 });
  nameBlock(ctx, D.away.name, X - 4, y2 + 56, maxW, { px: 112, color: red, align: "left", maxLines: 2, minPx: 48, lineGap: 0.9, spacing: 0 });

  crest(ctx, T.home, 960, 268, 210, C.home, { style: "plate", ring: ink });
  crest(ctx, T.away, 1090, 420, 210, C.away, { style: "plate", ring: ink });

  // alt satır
  ctx.fillStyle = ink; ctx.fillRect(X, 560, COVER_W - X * 2, 3);
  const cols = [
    S.show.date ? ["TARİH", upperTr(dayLine(D, S))] : null,
    S.show.time && D.time ? ["SAAT", D.time] : null,
    whereLine(D, S.show) ? ["SAHA", upperTr(whereLine(D, S.show))] : null,
  ].filter(Boolean);
  if (cols.length) {
    const w = (COVER_W - X * 2) / cols.length;
    cols.forEach(([label, value], i) => {
      const x = X + w * i;
      if (i > 0) { ctx.fillStyle = "rgba(22,20,15,0.35)"; ctx.fillRect(x - 16, 584, 2, 92); }
      text(ctx, label, x, 598, { font: F(14, 800, SANS), color: red, spacing: 4 });
      const f = fit(ctx, value, w - 40, value === D.time ? 60 : 40, 800, COND, { minPx: 22 });
      text(ctx, f.text, x, 642, { font: f.font, color: ink });
    });
  }
  if (S.show.live) {
    ctx.save(); ctx.translate(850, 516); ctx.rotate(-0.09);
    const lab = upperTr(S.liveLabel);
    const lf = F(36, 800, COND);
    const lw = Math.min(320, measure(ctx, lab, lf, 6) + 56);
    ctx.strokeStyle = red; ctx.lineWidth = 4; ctx.strokeRect(-lw / 2, -30, lw, 60);
    ctx.lineWidth = 1.5; ctx.strokeRect(-lw / 2 + 7, -23, lw - 14, 46);
    text(ctx, lab, 0, 2, { font: lf, color: red, align: "center", spacing: 6 });
    ctx.restore();
  }
}

/* ═══════════════════════════ 7. Maç günü ═══════════════════════════ */

function macgunu(ctx, D, S, C, I) {
  const T = teamsOf(D, I);
  base(ctx, I, S, () => {
    const g = ctx.createLinearGradient(0, 0, COVER_W, COVER_H);
    g.addColorStop(0, "#0c0d12"); g.addColorStop(1, "#050508");
    ctx.fillStyle = g; ctx.fillRect(0, 0, COVER_W, COVER_H);
  });
  // iki eğik renk şeridi (sağda)
  const band = (x, w, color, a) => {
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, rgba(color, 0)); g.addColorStop(0.35, rgba(color, a)); g.addColorStop(1, rgba(shade(color, -0.2), a));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(x + 220, 0); ctx.lineTo(x + w + 220, 0); ctx.lineTo(x + w, COVER_H); ctx.lineTo(x, COVER_H); ctx.closePath(); ctx.fill();
  };
  band(560, 300, C.home, 0.85);
  band(860, 440, C.away, 0.85);
  hatch(ctx, "#000000", 0.18, 6, 0.3);
  radial(ctx, 980, 330, 520, "#ffffff", 0.1);
  grain(ctx, 0.07);

  const X = 76;
  if (S.show.live) liveBadge(ctx, upperTr(S.liveLabel), X, 52, { h: 38 });
  if (S.show.brand) brandMark(ctx, I.brand, D.brand.name, COVER_W - 52, 48, 54);
  const mw = text(ctx, "MAÇ GÜNÜ", X, 148, { font: F(46, 800, COND, "italic"), color: "#fff", spacing: 2 });
  ctx.fillStyle = C.home; ctx.fillRect(X, 176, mw / 2, 4);
  ctx.fillStyle = C.away; ctx.fillRect(X + mw / 2, 176, mw / 2, 4);
  kicker(ctx, competitionLine(D, S.show), X, 206, { align: "left", size: 17, color: "rgba(255,255,255,0.7)", maxW: 520 });

  // takımlar (sol sütun)
  const rows = [[T.home, D.home.name, C.home, 312], [T.away, D.away.name, C.away, 456]];
  for (const [team, name, color, y] of rows) {
    crest(ctx, team, X + 56, y, 112, color, { style: "bare" });
    nameBlock(ctx, name, X + 136, y, 400, { px: 54, align: "left", valign: "middle", minPx: 28 });
  }
  ctx.fillStyle = "rgba(255,255,255,0.18)"; ctx.fillRect(X + 136, 384, 300, 2);

  // dev saat (sağ)
  const time = S.show.time && D.time ? D.time : "";
  if (time) {
    text(ctx, time, 1220, 352, { font: F(220, 800, COND), color: "#fff", align: "right", spacing: -2, shadow: { color: "rgba(0,0,0,0.45)", blur: 30, y: 10 } });
  }
  const day = dayLine(D, S);
  if (day) text(ctx, upperTr(day), 1214, time ? 500 : 352, { font: F(46, 700, COND), color: "#fff", align: "right", spacing: 1, shadow: { color: "rgba(0,0,0,0.4)", blur: 12, y: 3 } });
  const where = whereLine(D, S.show);
  if (where) {
    const f = fit(ctx, upperTr(where), 1100, 20, 700, SANS, { spacing: 3, minPx: 14 });
    ctx.fillStyle = "rgba(0,0,0,0.55)"; ctx.fillRect(0, 610, COVER_W, 72);
    text(ctx, f.text, X, 646, { font: f.font, color: "rgba(255,255,255,0.85)", spacing: f.spacing });
  }
}

/* ═══════════════════════════ 8. İkiye bölünmüş ═══════════════════════════ */

function bolme(ctx, D, S, C, I) {
  const T = teamsOf(D, I);
  const half = COVER_W / 2;
  base(ctx, I, S, () => {
    for (const [x0, color] of [[0, C.home], [half, C.away]]) {
      const g = ctx.createRadialGradient(x0 + half / 2, 280, 40, x0 + half / 2, 360, 620);
      g.addColorStop(0, shade(color, 0.0)); g.addColorStop(1, shade(color, -0.32));
      ctx.fillStyle = g; ctx.fillRect(x0, 0, half, COVER_H);
    }
  });
  // dev filigran armalar (yarıya kırpılmış)
  for (const [team, x0, cx, color] of [[T.home, 0, 170, C.home], [T.away, half, half + 470, C.away]]) {
    ctx.save();
    ctx.beginPath(); ctx.rect(x0, 0, half, COVER_H); ctx.clip();
    ctx.globalAlpha = 0.08;
    if (team.img && imgSize(team.img).w) drawContain(ctx, team.img, cx - 380, 360 - 380, 760, 760);
    else text(ctx, team.initials || "?", cx, 380, { font: F(520, 800, COND), color: shade(color, 0.4), align: "center" });
    ctx.restore();
  }
  grain(ctx, 0.07);
  const shadeT = ctx.createLinearGradient(0, 0, 0, 160);
  shadeT.addColorStop(0, "rgba(0,0,0,0.4)"); shadeT.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = shadeT; ctx.fillRect(0, 0, COVER_W, 160);
  vignette(ctx, 0.38);

  // orta dikiş
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.5)"; ctx.shadowBlur = 24;
  ctx.fillStyle = "#fff"; ctx.fillRect(half - 2, 0, 4, 604);
  ctx.restore();

  crest(ctx, T.home, 320, 296, 250, C.home, { style: "bare" });
  crest(ctx, T.away, 960, 296, 250, C.away, { style: "bare" });
  // VS diski
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.5)"; ctx.shadowBlur = 26; ctx.shadowOffsetY = 6;
  ctx.beginPath(); ctx.arc(half, 296, 66, 0, Math.PI * 2); ctx.fillStyle = "#0a0b0f"; ctx.fill();
  ctx.restore();
  ctx.beginPath(); ctx.arc(half, 296, 66, 0, Math.PI * 2); ctx.lineWidth = 4; ctx.strokeStyle = "#fff"; ctx.stroke();
  vs(ctx, half, 296, { size: 66, shadow: null });

  const sh = { color: "rgba(0,0,0,0.45)", blur: 16, y: 3 };
  nameBlock(ctx, D.home.name, 320, 512, 500, { px: 68, valign: "middle", shadow: sh });
  nameBlock(ctx, D.away.name, 960, 512, 500, { px: 68, valign: "middle", shadow: sh });

  ctx.fillStyle = "#0a0b0f"; ctx.fillRect(0, 604, COVER_W, 116);
  infoRow(ctx, D, S, 640, 662, { timeSize: 48 });
  compPill(ctx, D, S, half, 44);
  corners(ctx, D, S, I);
}

/* ═══════════════════════════ 9. Sinematik ═══════════════════════════ */

function sinema(ctx, D, S, C, I) {
  const T = teamsOf(D, I);
  const gold = "#d6b46a";
  const BAR = 58;
  base(ctx, I, S, () => {
    ctx.fillStyle = "#07080b"; ctx.fillRect(0, 0, COVER_W, COVER_H);
    radial(ctx, 330, 420, 620, C.home, 0.34, { mid: 0.5 });
    radial(ctx, 950, 420, 620, C.away, 0.34, { mid: 0.5 });
    radial(ctx, 640, 120, 520, "#fff3d6", 0.12);
  });
  grain(ctx, 0.05);
  vignette(ctx, 0.7, 0.3);
  // sinema bantları
  ctx.fillStyle = "#000"; ctx.fillRect(0, 0, COVER_W, BAR); ctx.fillRect(0, COVER_H - BAR, COVER_W, BAR);
  ctx.fillStyle = rgba(gold, 0.55); ctx.fillRect(0, BAR, COVER_W, 1); ctx.fillRect(0, COVER_H - BAR - 1, COVER_W, 1);

  kicker(ctx, competitionLine(D, S.show), 640, 132, { color: gold, size: 18, weight: 600, rule: rgba(gold, 0.6) });
  crest(ctx, T.home, 400, 306, 214, C.home, { style: "ring", ring: rgba(gold, 0.9) });
  crest(ctx, T.away, 880, 306, 214, C.away, { style: "ring", ring: rgba(gold, 0.9) });
  text(ctx, "VS", 640, 308, { font: F(46, 600, COND), color: gold, align: "center", spacing: 10 });
  ctx.fillStyle = rgba(gold, 0.5); ctx.fillRect(612, 262, 56, 1); ctx.fillRect(612, 352, 56, 1);

  nameBlock(ctx, D.home.name, 400, 484, 380, { px: 54, valign: "middle", weight: 600, spacing: 4, shadow: { color: "rgba(0,0,0,0.6)", blur: 16 } });
  nameBlock(ctx, D.away.name, 880, 484, 380, { px: 54, valign: "middle", weight: 600, spacing: 4, shadow: { color: "rgba(0,0,0,0.6)", blur: 16 } });

  infoRow(ctx, D, S, 640, 594, { size: 19, timeSize: 42, timeColor: gold, muted: "rgba(255,255,255,0.78)", sep: rgba(gold, 0.45) });
  if (S.show.live) liveBadge(ctx, upperTr(S.liveLabel), 52, BAR / 2 - 15, { h: 30 });
  if (S.show.brand) brandMark(ctx, I.brand, D.brand.name, COVER_W - 52, BAR / 2 - 19, 38);
}

export const TEMPLATE_DRAWERS = Object.freeze({ klasik, stadyum, capraz, minimal, neon, poster, macgunu, bolme, sinema });

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
