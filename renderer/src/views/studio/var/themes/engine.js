// VAR temaları · ORTAK ÇİZİM MOTORU (ciddi, sade, net).
//
// Her tema yalnız bir "tarif" verir (renkler, çerçeve, rozet biçimi, doku);
// çizim burada. Böylece bütün temalar aynı tipografi ve ölçü düzenini
// paylaşır, yalnız karakterleri değişir:
//
//   zemin      sakin geçiş + çok hafif ışık lekeleri, isteğe bağlı nokta / ızgara
//              dokusu, kenar karartması; isteğe bağlı ince ekran çerçevesi
//              (köşe ayraçlı, yavaş nabızlı)
//   pencere    ince çerçeve, köşe işaretleri, "AÇI n · KAMERA" etiketi,
//              CANLI (nabızlı nokta) / 0,5× AĞIR ÇEKİM, yavaş tarama çizgisi
//   üst bant   VAR rozeti │ VİDEO YARDIMCI HAKEM + konu  ···  adım çubukları
//              İNCELEME › KONTROL › KARAR │ zaman kodu │ logo
//   alt bant   durum noktası + durum + açıklama, belirsiz ilerleme çizgisi;
//              KARAR'da karar kartı soldan açılır (renk çubuğu, ✓ / ✕)
//
// Yazı tipleri gömülü: Barlow Condensed (VAR, konu, karar), Inter (etiketler,
// zaman kodu). lib/studio/fonts.js yüklemeyi yönetir.
import { varPulse, varScan } from "../../../../lib/studio/var";
import { COND, SANS, clamp01, easeInOut, easeOut, rgba, rr, spaced, textW, upper, verdictIcon } from "../kit";

const F = (w, px, fam = SANS) => `${w} ${Math.max(1, px).toFixed(1)}px ${fam}`;

/** Varsayılan tarif (koyu, grafit). Temalar yalnız farklı olanı verir. */
export const BASE_SPEC = Object.freeze({
  bg: ["#0d0e11", "#07080a"],
  pools: [], // [{ x, y, r, color, a }] (oran)
  texture: "none", // none | dots | grid | lines
  textureAlpha: 0.05,
  vignette: 0.45,
  ink: "#f3f5f8",
  muted: "rgba(243,245,248,0.62)",
  faint: "rgba(243,245,248,0.28)",
  line: "rgba(255,255,255,0.14)",
  accent: "#ff2d3d",
  accentInk: "#ffffff", // rozetin üstündeki yazı
  ok: "#2bd27f",
  no: "#ff4157",
  panel: "rgba(14,15,19,0.78)", // etiket / kart zemini
  paneFill: "#0c0d10",
  paneLine: "rgba(255,255,255,0.22)",
  paneRadius: 2,
  ticks: true, // pencere köşe işaretleri
  frame: null, // { color, alpha, pulse, brackets }
  badge: "solid", // solid | outline
  headerFill: null, // { fill, line, ink, muted, faint } (dolu üst bant)
  headerRule: true, // üst bandın altında ince çizgi
  footerRule: true,
  card: "rgba(16,17,21,0.92)", // karar kartı zemini
  cardInk: null, // kart yazı renkleri (açık kart için; yoksa ink / muted / line)
  cardMuted: null,
  cardLine: null,
  glow: 0, // çizgilerde parıltı (neon)
  flash: 0.1, // karar anında beyaz parlama gücü
  light: false,
  shadow: false, // pencerelerin altında yumuşak gölge (açık tema)
});

const toneOf = (S, P, col) => (S.st.key === "decision" ? (S.positive ? P.ok : P.no) : col);

function withGlow(ctx, P, color, s, k = 1) {
  if (!P.glow) return;
  ctx.shadowColor = color;
  ctx.shadowBlur = 12 * P.glow * k * s;
}

/** Sabit genişlikli rakamlarla metin (zaman kodu titremesin). align: right. → genişlik. */
function fixedDigits(ctx, str, xRight, y, font, color) {
  ctx.font = font;
  spaced(ctx, 0);
  const dw = ctx.measureText("0").width;
  const cw = (ch) => (/\d/.test(ch) ? dw : ctx.measureText(ch).width);
  const chars = Array.from(str);
  const total = chars.reduce((a, ch) => a + cw(ch), 0);
  let x = xRight - total;
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const ch of chars) { const w = cw(ch); ctx.fillText(ch, x + w / 2, y); x += w; }
  ctx.textAlign = "left";
  return total;
}

/** Hap etiket. → genişlik. */
function chip(ctx, P, x, y, h, parts, s, { align = "left" } = {}) {
  // parts: [{ text, color, weight, dot }]
  const fs = h * 0.46;
  const pad = h * 0.42;
  const sp = fs * 0.12;
  const gap = h * 0.36;
  const ws = parts.map((p) => textW(ctx, p.text, F(p.weight || 700, fs), sp) + (p.dot ? h * 0.36 : 0));
  const w = ws.reduce((a, b) => a + b, 0) + gap * (parts.length - 1) + pad * 2;
  const x0 = align === "right" ? x - w : x;
  ctx.save();
  rr(ctx, x0, y, w, h, Math.min(h * 0.2, 4 * s + 1));
  ctx.fillStyle = P.panel;
  ctx.fill();
  ctx.strokeStyle = P.line;
  ctx.lineWidth = Math.max(1, s);
  ctx.stroke();
  let cx = x0 + pad;
  parts.forEach((p, i) => {
    if (i > 0) {
      ctx.fillStyle = P.line;
      ctx.fillRect(cx - gap / 2, y + h * 0.28, Math.max(1, s), h * 0.44);
    }
    if (p.dot) {
      ctx.fillStyle = p.dot;
      ctx.beginPath(); ctx.arc(cx + h * 0.1, y + h / 2, h * 0.11, 0, Math.PI * 2); ctx.fill();
      cx += h * 0.36;
    }
    ctx.font = F(p.weight || 700, fs);
    spaced(ctx, sp);
    ctx.fillStyle = p.color || P.ink;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(p.text, cx, y + h * 0.53);
    spaced(ctx, 0);
    cx += ws[i] - (p.dot ? h * 0.36 : 0) + gap;
  });
  ctx.restore();
  return w;
}

/* ───────────────────────────── zemin ───────────────────────────── */

function background(P, ctx, S) {
  const { W, H, s, now } = S;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, P.bg[0]);
  g.addColorStop(1, P.bg[1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const t = now / 1000;
  P.pools.forEach((p, k) => {
    // çok yavaş süzülme (dikkat dağıtmaz)
    const x = W * (p.x + 0.015 * Math.sin(t * 0.13 + k * 2));
    const y = H * (p.y + 0.015 * Math.cos(t * 0.11 + k));
    const rg = ctx.createRadialGradient(x, y, 0, x, y, W * p.r);
    rg.addColorStop(0, rgba(p.color, p.a));
    rg.addColorStop(1, rgba(p.color, 0));
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, W, H);
  });
  if (P.texture !== "none") {
    ctx.save();
    const tc = P.light ? "#000000" : "#ffffff";
    if (P.texture === "dots") {
      ctx.fillStyle = rgba(tc, P.textureAlpha);
      const step = Math.max(10, 28 * s);
      const d = Math.max(1, 1.4 * s);
      for (let y = step / 2; y < H; y += step) for (let x = step / 2; x < W; x += step) ctx.fillRect(x, y, d, d);
    } else if (P.texture === "grid") {
      ctx.strokeStyle = rgba(P.accent, P.textureAlpha);
      ctx.lineWidth = Math.max(1, s);
      const step = Math.max(16, 64 * s);
      ctx.beginPath();
      for (let x = (W % step) / 2; x < W; x += step) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, H); }
      for (let y = (H % step) / 2; y < H; y += step) { ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); }
      ctx.stroke();
    } else if (P.texture === "lines") {
      ctx.strokeStyle = rgba(tc, P.textureAlpha);
      ctx.lineWidth = Math.max(1, s);
      const step = Math.max(6, 12 * s);
      ctx.beginPath();
      for (let x = -H; x < W; x += step) { ctx.moveTo(x, H); ctx.lineTo(x + H, 0); }
      ctx.stroke();
    }
    ctx.restore();
  }
  if (P.vignette) {
    const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, W * 0.72);
    v.addColorStop(0, "rgba(0,0,0,0)");
    v.addColorStop(1, `rgba(0,0,0,${P.vignette})`);
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, H);
  }
  // açık temada pencere gölgeleri
  if (P.shadow) {
    for (const p of S.panes) {
      const r = p.rect;
      ctx.save();
      ctx.shadowColor = "rgba(15,20,30,0.28)";
      ctx.shadowBlur = 28 * s;
      ctx.shadowOffsetY = 10 * s;
      rr(ctx, r.x, r.y, r.w, r.h, P.paneRadius * s);
      ctx.fillStyle = "#000";
      ctx.fill();
      ctx.restore();
    }
  }
}

/* ───────────────────────────── pencere ───────────────────────────── */

function panePath(P, ctx, S, p) {
  const r = p.rect;
  const rad = Math.min(P.paneRadius * S.s, r.w / 10);
  if (rad > 0.5) rr(ctx, r.x, r.y, r.w, r.h, rad);
  else { ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); }
}

function pane(P, ctx, S, p, info, i) {
  const { now, s, n } = S;
  const r = p.rect;
  const big = p.big || S.panes.length === 1;
  if (!info) {
    ctx.fillStyle = P.paneFill;
    panePath(P, ctx, S, p); ctx.fill();
    // ince çapraz + metin
    const c = Math.min(r.w, r.h) * 0.09;
    const cx = r.x + r.w / 2; const cy = r.y + r.h / 2 - c * 0.35;
    ctx.strokeStyle = P.faint;
    ctx.lineWidth = Math.max(1, 1.5 * s);
    rr(ctx, cx - c * 1.2, cy - c * 0.75, c * 2.4, c * 1.5, c * 0.18);
    ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, c * 0.42, 0, Math.PI * 2); ctx.stroke();
    ctx.font = F(600, Math.max(8, r.h * 0.04));
    spaced(ctx, r.h * 0.006);
    ctx.fillStyle = P.muted;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("AÇI SEÇİLMEDİ", cx, cy + c * 1.45);
    spaced(ctx, 0);
    ctx.textAlign = "left";
  }
  // tarama çizgisi (yavaş, ince)
  if (n.scan) {
    ctx.save();
    panePath(P, ctx, S, p); ctx.clip();
    const y = r.y + varScan(now + i * 900, 4200) * r.h;
    const trail = r.h * 0.12;
    const tg = ctx.createLinearGradient(0, y - trail, 0, y);
    tg.addColorStop(0, rgba(P.accent, 0));
    tg.addColorStop(1, rgba(P.accent, 0.07));
    ctx.fillStyle = tg;
    ctx.fillRect(r.x, y - trail, r.w, trail);
    ctx.fillStyle = rgba(P.accent, 0.5);
    ctx.fillRect(r.x, y, r.w, Math.max(1, s));
    ctx.restore();
  }
  // çerçeve
  ctx.save();
  withGlow(ctx, P, P.accent, s, 0.6);
  ctx.strokeStyle = P.glow ? rgba(P.accent, 0.55) : P.paneLine;
  ctx.lineWidth = Math.max(1, s);
  const rad = Math.min(P.paneRadius * s, r.w / 10);
  rr(ctx, r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1, rad);
  ctx.stroke();
  ctx.restore();
  if (P.ticks) {
    const len = Math.max(6, (big ? 22 : 16) * s);
    const o = Math.max(3, 7 * s);
    ctx.save();
    withGlow(ctx, P, P.accent, s);
    ctx.strokeStyle = P.accent;
    ctx.lineWidth = Math.max(1.5, 2 * s);
    ctx.lineCap = "square";
    ctx.beginPath();
    const x0 = r.x - o; const y0 = r.y - o; const x1 = r.x + r.w + o; const y1 = r.y + r.h + o;
    for (const [x, y, dx, dy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]]) {
      ctx.moveTo(x, y + dy * len); ctx.lineTo(x, y); ctx.lineTo(x + dx * len, y);
    }
    ctx.stroke();
    ctx.restore();
  }
  // etiketler
  const h = Math.max(12, (big ? 38 : 30) * s);
  const m = Math.max(5, (big ? 16 : 12) * s);
  const parts = [{ text: `AÇI ${i + 1}`, color: P.accent, weight: 800 }];
  if (info?.label) parts.push({ text: upper(info.label), color: P.ink, weight: 600 });
  const maxLeft = r.w * 0.62;
  // uzun kamera adı: sığmazsa yalnız "AÇI n"
  const w1 = textW(ctx, parts.map((x) => x.text).join("   "), F(700, h * 0.46), h * 0.055) + h * 1.2;
  chip(ctx, P, r.x + m, r.y + m, h, w1 > maxLeft ? parts.slice(0, 1) : parts, s);
  if (info?.live) {
    const pulse = varPulse(now, 1100);
    chip(ctx, P, r.x + r.w - m, r.y + m, h, [{ text: "CANLI", color: P.ink, weight: 800, dot: rgba(P.no, 0.45 + 0.55 * pulse) }], s, { align: "right" });
  } else if (info?.rate && info.rate < 1) {
    chip(ctx, P, r.x + r.w - m, r.y + m, h, [{ text: `${String(info.rate).replace(".", ",")}×`, color: P.accent, weight: 800 }, { text: "AĞIR ÇEKİM", color: P.ink, weight: 600 }], s, { align: "right" });
  }
}

/* ───────────────────────────── üst bant ───────────────────────────── */

function header(P, ctx, S) {
  const { L, n, now, s, logo } = S;
  const hb = L.header;
  const h = hb.h;
  const cy = hb.y + h / 2;
  const H = P.headerFill || {};
  const ink = H.ink || P.ink;
  const muted = H.muted || P.muted;
  const faint = H.faint || P.faint;
  const line = H.line || P.line;
  let x = hb.x;
  if (P.headerFill) {
    ctx.save();
    rr(ctx, hb.x, hb.y, hb.w, h, P.paneRadius * s);
    ctx.fillStyle = H.fill;
    ctx.fill();
    if (H.border) { ctx.strokeStyle = H.border; ctx.lineWidth = Math.max(1, s); ctx.stroke(); }
    ctx.restore();
    x += h * 0.22;
  }
  // VAR rozeti
  const bh = h * 0.6;
  const bw = bh * 1.9;
  const by = cy - bh / 2;
  ctx.save();
  withGlow(ctx, P, P.accent, s);
  rr(ctx, x, by, bw, bh, Math.max(2, bh * 0.08));
  if (P.badge === "solid") { ctx.fillStyle = P.accent; ctx.fill(); } else {
    ctx.strokeStyle = P.accent; ctx.lineWidth = Math.max(1.5, 2 * s); ctx.stroke();
  }
  ctx.restore();
  ctx.font = F(800, bh * 0.74, COND);
  spaced(ctx, bh * 0.06);
  ctx.fillStyle = P.badge === "solid" ? P.accentInk : P.accent;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("VAR", x + bw / 2 + bh * 0.03, cy + bh * 0.04);
  spaced(ctx, 0);
  x += bw + h * 0.34;
  ctx.fillStyle = line;
  ctx.fillRect(x, cy - h * 0.28, Math.max(1, s), h * 0.56);
  x += h * 0.34;
  // başlık bloğu
  ctx.textAlign = "left";
  ctx.font = F(600, h * 0.165);
  spaced(ctx, h * 0.03);
  ctx.fillStyle = muted;
  ctx.fillText("VİDEO YARDIMCI HAKEM", x, cy - h * 0.18);
  spaced(ctx, 0);
  const titleMax = hb.w * 0.36;
  ctx.font = F(700, h * 0.44, COND);
  spaced(ctx, h * 0.01);
  ctx.fillStyle = ink;
  ctx.fillText(S.topic, x, cy + h * 0.14, titleMax);
  spaced(ctx, 0);

  // sağdan sola: logo │ zaman kodu │ adımlar
  let rx = hb.x + hb.w - (P.headerFill ? h * 0.3 : 0);
  if (logo?.naturalWidth) {
    const lh = h * 0.42;
    const lw = Math.min(h * 2.2, (logo.naturalWidth / logo.naturalHeight) * lh);
    ctx.save();
    ctx.globalAlpha = 0.92;
    if (P.light || H.lightBg) {
      // beyaz logo açık zeminde: koyu yonga
      rr(ctx, rx - lw - h * 0.16, cy - lh / 2 - h * 0.1, lw + h * 0.32, lh + h * 0.2, h * 0.08);
      ctx.fillStyle = "#121418"; ctx.fill();
      rx -= h * 0.16;
    }
    try { ctx.drawImage(logo, rx - lw, cy - lh / 2, lw, lh); } catch { /* yoksay */ }
    ctx.restore();
    rx -= lw + h * 0.36;
    ctx.fillStyle = line;
    ctx.fillRect(rx, cy - h * 0.28, Math.max(1, s), h * 0.56);
    rx -= h * 0.36;
  }
  if (n.timecode) {
    ctx.font = F(600, h * 0.13);
    spaced(ctx, h * 0.03);
    ctx.fillStyle = faint;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText("ZAMAN KODU", rx, cy - h * 0.21);
    spaced(ctx, 0);
    const tw = fixedDigits(ctx, S.tc, rx, cy + h * 0.1, F(500, h * 0.28), ink);
    rx -= Math.max(tw, h * 1.5) + h * 0.5;
  }
  // adım çubukları
  const steps = S.steps;
  const fs = h * 0.185;
  const font = F(700, fs);
  const sp = fs * 0.14;
  const segW = Math.max(...steps.map((st) => textW(ctx, st.label, font, sp))) + h * 0.3;
  const gap = h * 0.18;
  const total = segW * steps.length + gap * (steps.length - 1);
  const x0 = rx - total;
  const pulse = varPulse(now, 1400);
  steps.forEach((st, k) => {
    const sx = x0 + k * (segW + gap);
    const col = st.on ? toneOf(S, P, P.accent) : st.done ? muted : faint;
    ctx.font = font;
    spaced(ctx, sp);
    ctx.fillStyle = st.on ? ink : st.done ? muted : faint;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(st.label, sx, cy - h * 0.07);
    spaced(ctx, 0);
    const barY = cy + h * 0.16;
    const bh2 = Math.max(2, 3 * s);
    ctx.fillStyle = st.on || st.done ? col : line;
    ctx.save();
    if (st.on) withGlow(ctx, P, col, s);
    ctx.fillRect(sx, barY, segW, bh2);
    ctx.restore();
    if (st.on && S.st.key !== "decision") {
      // yavaş dolan parlaklık
      ctx.fillStyle = rgba("#ffffff", 0.35 * pulse);
      ctx.fillRect(sx, barY, segW * (0.3 + 0.7 * pulse), bh2);
    }
  });
  if (P.headerRule && !P.headerFill) {
    ctx.fillStyle = line;
    ctx.fillRect(hb.x, hb.y + h + Math.round(L.stage.y - hb.y - h) * 0.45, hb.w, Math.max(1, s));
  }
}

/* ───────────────────────────── alt bant ───────────────────────────── */

function footer(P, ctx, S) {
  const { L, st, now, s } = S;
  const f = L.footer;
  const h = f.h;
  const cy = f.y + h / 2;
  if (st.key === "decision") {
    const t = S.decisionMs;
    const k = easeInOut(t / 520);
    const col = S.positive ? P.ok : P.no;
    const cInk = P.cardInk || P.ink; const cMuted = P.cardMuted || P.muted; const cLine = P.cardLine || P.line;
    const w = f.w * Math.max(0.02, k);
    ctx.save();
    ctx.beginPath(); ctx.rect(f.x, f.y - h, w, h * 2); ctx.clip();
    rr(ctx, f.x, f.y, f.w, h, P.paneRadius * s);
    ctx.fillStyle = P.card;
    ctx.fill();
    ctx.strokeStyle = cLine;
    ctx.lineWidth = Math.max(1, s);
    ctx.stroke();
    // renk çubuğu + yumuşak renk geçişi
    const ag = ctx.createLinearGradient(f.x, 0, f.x + f.w * 0.5, 0);
    ag.addColorStop(0, rgba(col, P.light ? 0.14 : 0.2));
    ag.addColorStop(1, rgba(col, 0));
    ctx.fillStyle = ag;
    ctx.fillRect(f.x, f.y, f.w, h);
    ctx.save();
    withGlow(ctx, P, col, s);
    ctx.fillStyle = col;
    ctx.fillRect(f.x, f.y, Math.max(3, 6 * s), h);
    ctx.restore();
    // yazılar (kısa gecikmeyle süzülür)
    const tk = easeOut((t - 160) / 420);
    ctx.globalAlpha *= clamp01(tk);
    const dy = (1 - tk) * h * 0.12;
    ctx.font = F(700, h * 0.16);
    spaced(ctx, h * 0.035);
    ctx.fillStyle = cMuted;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText("KARAR", f.x + h * 0.5, cy + dy);
    const lw = textW(ctx, "KARAR", F(700, h * 0.16), h * 0.035);
    spaced(ctx, 0);
    ctx.fillStyle = cLine;
    ctx.fillRect(f.x + h * 0.5 + lw + h * 0.3, cy - h * 0.22, Math.max(1, s), h * 0.44);
    ctx.font = F(800, h * 0.6, COND);
    spaced(ctx, h * 0.012);
    ctx.fillStyle = cInk;
    ctx.fillText(st.text, f.x + h * 0.5 + lw + h * 0.62, cy + h * 0.03 + dy, f.w - lw - h * 2.6);
    spaced(ctx, 0);
    verdictIcon(ctx, f.x + f.w - h * 0.62, cy + dy, h * 0.24, S.positive, { bg: null, fg: col, ring: col });
    ctx.restore();
    // sabitlenme çizgisi
    ctx.fillStyle = rgba(col, 0.9);
    ctx.fillRect(f.x, f.y + h - Math.max(2, 2 * s), f.w * easeOut((t - 300) / 1200), Math.max(2, 2 * s));
    return;
  }
  if (P.footerRule) {
    ctx.fillStyle = P.line;
    ctx.fillRect(f.x, f.y, f.w, Math.max(1, s));
  }
  const pulse = varPulse(now, 1200);
  const dotX = f.x + h * 0.16;
  ctx.fillStyle = rgba(st.color, 0.25 * pulse);
  ctx.beginPath(); ctx.arc(dotX, cy, h * 0.16, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = st.color;
  ctx.beginPath(); ctx.arc(dotX, cy, h * 0.07, 0, Math.PI * 2); ctx.fill();
  ctx.font = F(700, h * 0.17);
  spaced(ctx, h * 0.035);
  ctx.fillStyle = P.muted;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  const lx = f.x + h * 0.48;
  ctx.fillText(st.label, lx, cy);
  const lw = textW(ctx, st.label, F(700, h * 0.17), h * 0.035);
  spaced(ctx, 0);
  ctx.fillStyle = P.line;
  ctx.fillRect(lx + lw + h * 0.3, cy - h * 0.2, Math.max(1, s), h * 0.4);
  ctx.font = F(500, h * 0.3);
  ctx.fillStyle = P.ink;
  ctx.fillText(st.text, lx + lw + h * 0.6, cy + h * 0.02, f.w * 0.55);
  // belirsiz ilerleme çizgisi
  const bw = f.w * 0.18;
  const bx = f.x + f.w - bw;
  const bh = Math.max(2, 2 * s);
  ctx.fillStyle = P.line;
  ctx.fillRect(bx, cy - bh / 2, bw, bh);
  const t = (now % 1800) / 1800;
  const a = bw * easeInOut(Math.max(0, t * 1.5 - 0.5));
  const b = bw * easeInOut(Math.min(1, t * 1.5));
  ctx.save();
  withGlow(ctx, P, P.accent, s);
  ctx.fillStyle = P.accent;
  ctx.fillRect(bx + a, cy - bh / 2, Math.max(0, b - a), bh);
  ctx.restore();
}

/* ───────────────────────────── ekran çerçevesi ───────────────────────────── */

function frame(P, ctx, S) {
  const fr = P.frame;
  if (!fr) return;
  const { W, H, s, now } = S;
  const o = Math.round(H * 0.012);
  const pulse = fr.pulse ? varPulse(now, 2200) : 0;
  ctx.save();
  withGlow(ctx, P, fr.color, s);
  if (fr.pulse) { ctx.shadowColor = rgba(fr.color, 0.5 * pulse); ctx.shadowBlur = 14 * s * pulse; }
  ctx.strokeStyle = rgba(fr.color, (fr.alpha ?? 0.5) + (fr.pulse ? 0.35 * pulse : 0));
  ctx.lineWidth = Math.max(1, 1.5 * s);
  ctx.strokeRect(o + 0.5, o + 0.5, W - o * 2 - 1, H - o * 2 - 1);
  ctx.restore();
  if (fr.brackets) {
    const len = 34 * s;
    ctx.save();
    ctx.strokeStyle = fr.color;
    ctx.lineWidth = Math.max(2, 3 * s);
    ctx.beginPath();
    for (const [x, y, dx, dy] of [[o, o, 1, 1], [W - o, o, -1, 1], [o, H - o, 1, -1], [W - o, H - o, -1, -1]]) {
      ctx.moveTo(x, y + dy * len); ctx.lineTo(x, y); ctx.lineTo(x + dx * len, y);
    }
    ctx.stroke();
    ctx.restore();
  }
}

/**
 * Tarif → tema modülü ({ background, panePath, pane, chrome }).
 * spec: BASE_SPEC alanlarının bir kısmı.
 */
export function makeTheme(spec) {
  const P = { ...BASE_SPEC, ...spec };
  return {
    spec: P,
    background: (ctx, S) => background(P, ctx, S),
    panePath: (ctx, S, p) => panePath(P, ctx, S, p),
    pane: (ctx, S, p, info, i) => pane(P, ctx, S, p, info, i),
    chrome: (ctx, S) => {
      header(P, ctx, S);
      footer(P, ctx, S);
      frame(P, ctx, S);
      if (S.flash > 0 && P.flash) { ctx.fillStyle = `rgba(255,255,255,${P.flash * S.flash})`; ctx.fillRect(0, 0, S.W, S.H); }
    },
  };
}
