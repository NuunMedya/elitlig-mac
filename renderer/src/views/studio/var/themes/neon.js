// VAR teması — NEON ARENA: neon parıltı, perspektif ızgara, kayan tarama çizgileri.
//
//   zemin      mor-siyah gece, ufukta macenta ışık, izleyiciye akan perspektif ızgara
//   pencereler köşesi kesik neon çerçeve (camgöbeği / macenta), parlayan "AÇI n"
//              etiketi, CANLI / AĞIR ÇEKİM, camgöbeği tarama çizgisi
//   üst bant   köşesi kesik koyu panel + neon kenar: parlayan VAR, konu, neon hap
//              adımlar İNCELEME › KONTROL › KARAR, zaman kodu, logo
//   alt bant   ekolayzer çubukları; KARAR'da RGB kaymalı "glitch" girişi, sonra
//              yeşil / kırmızı neon karar yazısı; tüm ekranda tarama çizgileri
import { varPulse, varScan } from "../../../../lib/studio/var";
import { FONT, MONO, chamfer, clamp01, rgba, spaced, textW, upper, verdictIcon } from "../kit";

const CYAN = "#22d3ee";
const MAG = "#ff2bd6";
const VIO = "#8b5cf6";
const GOOD = "#39ff88";
const BAD = "#ff3366";

function neonPath(ctx, pathFn, color, lw, s, glow = 1) {
  ctx.save();
  ctx.lineJoin = "round";
  ctx.shadowColor = color;
  ctx.strokeStyle = color;
  ctx.shadowBlur = 22 * s * glow;
  ctx.lineWidth = lw;
  pathFn(); ctx.stroke();
  ctx.shadowBlur = 8 * s * glow;
  pathFn(); ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.lineWidth = Math.max(1, lw * 0.35);
  pathFn(); ctx.stroke();
  ctx.restore();
}
function neonText(ctx, text, x, y, color, font, s, { glow = 1, maxW, align = "left", sp = 0 } = {}) {
  ctx.save();
  ctx.font = font;
  spaced(ctx, sp);
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.shadowColor = color;
  ctx.shadowBlur = 18 * s * glow;
  ctx.fillStyle = color;
  ctx.fillText(text, x, y, maxW);
  ctx.shadowBlur = 6 * s * glow;
  ctx.fillStyle = "#fff";
  ctx.globalAlpha = 0.85;
  ctx.fillText(text, x, y, maxW);
  ctx.restore();
  spaced(ctx, 0);
}
/** Pencere biçimi: köşeleri kesik (içerik de bu yola kırpılır). */
export function panePath(ctx, S, p) {
  const r = p.rect;
  chamfer(ctx, r.x, r.y, r.w, r.h, Math.min(r.w, r.h) * 0.06);
}
const flicker = (now, seed = 0) => (Math.sin(now / 37 + seed) > 0.97 ? 0.55 : 1);

export function background(ctx, S) {
  const { W, H, now, s } = S;
  ctx.fillStyle = "#05010f";
  ctx.fillRect(0, 0, W, H);
  const g = ctx.createRadialGradient(W * 0.5, H * 0.35, 0, W * 0.5, H * 0.35, W * 0.7);
  g.addColorStop(0, "rgba(91,33,182,0.45)");
  g.addColorStop(0.6, "rgba(30,8,70,0.4)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // ufuk ve perspektif ızgara
  const hy = H * 0.52;
  const hg = ctx.createLinearGradient(0, hy - H * 0.08, 0, hy + H * 0.04);
  hg.addColorStop(0, "rgba(255,43,214,0)");
  hg.addColorStop(0.7, "rgba(255,43,214,0.35)");
  hg.addColorStop(1, "rgba(255,43,214,0)");
  ctx.fillStyle = hg;
  ctx.fillRect(0, hy - H * 0.08, W, H * 0.12);
  ctx.save();
  ctx.beginPath(); ctx.rect(0, hy, W, H - hy); ctx.clip();
  ctx.strokeStyle = rgba(MAG, 0.35);
  ctx.lineWidth = Math.max(1, 1.5 * s);
  ctx.beginPath();
  const vx = W / 2;
  for (let k = -14; k <= 14; k += 1) { ctx.moveTo(vx + k * W * 0.012, hy); ctx.lineTo(vx + k * W * 0.11, H); }
  const t = (now % 1400) / 1400;
  for (let k = 0; k < 12; k += 1) {
    const z = (k + t) / 12;
    const y = hy + (H - hy) * z * z;
    ctx.moveTo(0, y); ctx.lineTo(W, y);
  }
  ctx.stroke();
  const fade = ctx.createLinearGradient(0, hy, 0, H);
  fade.addColorStop(0, "rgba(5,1,15,0.9)");
  fade.addColorStop(0.5, "rgba(5,1,15,0.2)");
  fade.addColorStop(1, "rgba(5,1,15,0.5)");
  ctx.fillStyle = fade;
  ctx.fillRect(0, hy, W, H - hy);
  ctx.restore();
  // pencerelerin arkası: koyu cam
  for (const p of S.panes) {
    const r = p.rect;
    const c = Math.min(r.w, r.h) * 0.06;
    const pad = 8 * s;
    chamfer(ctx, r.x - pad, r.y - pad, r.w + pad * 2, r.h + pad * 2, c + pad);
    ctx.fillStyle = "rgba(8,3,24,0.85)";
    ctx.fill();
  }
}

export function pane(ctx, S, p, info, i) {
  const { now, s, n } = S;
  const r = p.rect;
  const col = i % 2 ? MAG : CYAN;
  if (!info) {
    ctx.fillStyle = "#0a0420";
    panePath(ctx, S, p); ctx.fill();
    ctx.save();
    panePath(ctx, S, p); ctx.clip();
    ctx.strokeStyle = rgba(VIO, 0.25);
    ctx.lineWidth = 1;
    ctx.beginPath();
    const st = Math.max(8, r.w / 24);
    for (let x = r.x; x < r.x + r.w; x += st) { ctx.moveTo(x, r.y); ctx.lineTo(x, r.y + r.h); }
    for (let y = r.y; y < r.y + r.h; y += st) { ctx.moveTo(r.x, y); ctx.lineTo(r.x + r.w, y); }
    ctx.stroke();
    ctx.restore();
    neonText(ctx, "VAR", r.x + r.w / 2, r.y + r.h * 0.45, col, `900 ${Math.min(r.h * 0.24, r.w * 0.11)}px ${FONT}`, s, { align: "center", sp: r.h * 0.02 });
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.font = `700 ${Math.max(9, r.h * 0.04)}px ${FONT}`;
    spaced(ctx, r.h * 0.012);
    ctx.textAlign = "center";
    ctx.fillText("AÇI SEÇİLMEDİ", r.x + r.w / 2, r.y + r.h * 0.64);
    spaced(ctx, 0);
  }
  if (n.scan) {
    ctx.save();
    panePath(ctx, S, p); ctx.clip();
    const y = r.y + varScan(now + i * 600, 2200) * r.h;
    const tg = ctx.createLinearGradient(0, y - r.h * 0.18, 0, y);
    tg.addColorStop(0, rgba(col, 0));
    tg.addColorStop(1, rgba(col, 0.22));
    ctx.fillStyle = tg;
    ctx.fillRect(r.x, y - r.h * 0.18, r.w, r.h * 0.18);
    ctx.shadowColor = col;
    ctx.shadowBlur = 12 * s;
    ctx.fillStyle = "#fff";
    ctx.fillRect(r.x, y, r.w, Math.max(1, 1.5 * s));
    ctx.restore();
  }
  const c = Math.min(r.w, r.h) * 0.06;
  const pad = 4 * s;
  const lw = Math.max(2, (p.big ? 4 : 3) * s);
  neonPath(ctx, () => chamfer(ctx, r.x - pad, r.y - pad, r.w + pad * 2, r.h + pad * 2, c + pad * 0.41), col, lw, s, flicker(now, i * 3) * (0.8 + 0.4 * varPulse(now + i * 300, 1800)));
  // etiketler
  const fs = Math.max(8, (p.big ? 19 : 15) * s);
  const tx = r.x + c + 10 * s;
  const ty = r.y + fs * 1.3;
  const t1 = `AÇI ${i + 1}`;
  ctx.fillStyle = "rgba(5,1,15,0.75)";
  const f1 = `900 ${fs}px ${FONT}`;
  const w1 = textW(ctx, t1, f1, fs * 0.12);
  const lab = info?.label ? upper(info.label) : "";
  const f2 = `700 ${fs * 0.82}px ${FONT}`;
  const w2 = lab ? textW(ctx, lab, f2, fs * 0.08) : 0;
  ctx.fillRect(tx - fs * 0.5, ty - fs * 0.85, w1 + (lab ? w2 + fs * 1.2 : 0) + fs, fs * 1.7);
  neonText(ctx, t1, tx, ty, col, f1, s, { sp: fs * 0.12, glow: 0.8 });
  if (lab) { ctx.fillStyle = "rgba(255,255,255,0.85)"; ctx.font = f2; spaced(ctx, fs * 0.08); ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.fillText(lab, tx + w1 + fs * 0.8, ty); spaced(ctx, 0); }
  const rx = r.x + r.w - c - 10 * s;
  if (info?.live) {
    const a = 0.45 + 0.55 * varPulse(now, 900);
    const fw = textW(ctx, "CANLI", f2, fs * 0.1);
    ctx.fillStyle = "rgba(5,1,15,0.75)";
    ctx.fillRect(rx - fw - fs * 1.6, ty - fs * 0.85, fw + fs * 2.1, fs * 1.7);
    ctx.save(); ctx.shadowColor = BAD; ctx.shadowBlur = 12 * s; ctx.fillStyle = rgba(BAD, a);
    ctx.beginPath(); ctx.arc(rx - fw - fs * 0.85, ty, fs * 0.28, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    neonText(ctx, "CANLI", rx, ty, BAD, f2, s, { align: "right", sp: fs * 0.1, glow: 0.7 });
  } else if (info?.rate && info.rate < 1) {
    const tt = `${String(info.rate).replace(".", ",")}× AĞIR ÇEKİM`;
    const fw = textW(ctx, tt, f2, fs * 0.1);
    ctx.fillStyle = "rgba(5,1,15,0.75)";
    ctx.fillRect(rx - fw - fs * 0.5, ty - fs * 0.85, fw + fs, fs * 1.7);
    neonText(ctx, tt, rx, ty, VIO, f2, s, { align: "right", sp: fs * 0.1, glow: 0.7 });
  }
}

function header(ctx, S) {
  const { L, n, now, s, logo } = S;
  const hb = L.header;
  const h = hb.h;
  const c = h * 0.35;
  chamfer(ctx, hb.x, hb.y, hb.w, h, c);
  const g = ctx.createLinearGradient(0, hb.y, 0, hb.y + h);
  g.addColorStop(0, "rgba(30,10,70,0.92)");
  g.addColorStop(1, "rgba(8,2,26,0.92)");
  ctx.fillStyle = g;
  ctx.fill();
  neonPath(ctx, () => chamfer(ctx, hb.x, hb.y, hb.w, h, c), CYAN, Math.max(1.5, 2.5 * s), s, 0.7 * flicker(now, 1));
  // VAR
  const vx = hb.x + h * 0.4;
  neonText(ctx, "VAR", vx, hb.y + h * 0.53, MAG, `900 ${h * 0.58}px ${FONT}`, s, { sp: h * 0.04, glow: 1.2 * flicker(now, 2) });
  const vw = textW(ctx, "VAR", `900 ${h * 0.58}px ${FONT}`, h * 0.04);
  ctx.fillStyle = rgba(CYAN, 0.5);
  ctx.fillRect(vx + vw + h * 0.25, hb.y + h * 0.2, Math.max(1, 2 * s), h * 0.6);
  const tx = vx + vw + h * 0.5;
  ctx.fillStyle = CYAN;
  ctx.font = `700 ${h * 0.17}px ${FONT}`;
  spaced(ctx, h * 0.05);
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText("VİDEO YARDIMCI HAKEM", tx, hb.y + h * 0.3);
  spaced(ctx, 0);
  neonText(ctx, S.topic, tx, hb.y + h * 0.66, "#a5f3fc", `900 ${h * 0.34}px ${FONT}`, s, { maxW: hb.w * 0.3, glow: 0.5, sp: h * 0.01 });
  // sağ
  let rx = hb.x + hb.w - c - h * 0.15;
  if (logo?.naturalWidth) {
    const lh = h * 0.5;
    const lw = Math.min(h * 2, (logo.naturalWidth / logo.naturalHeight) * lh);
    try { ctx.drawImage(logo, rx - lw, hb.y + (h - lh) / 2, lw, lh); } catch { /* yoksay */ }
    rx -= lw + h * 0.4;
  }
  if (n.timecode) {
    neonText(ctx, S.tc, rx, hb.y + h * 0.54, CYAN, `700 ${h * 0.28}px ${MONO}`, s, { align: "right", glow: 0.5 });
    ctx.font = `700 ${h * 0.28}px ${MONO}`;
    rx -= ctx.measureText(S.tc).width + h * 0.5;
  }
  const steps = S.steps;
  const fs = h * 0.2;
  const font = `900 ${fs}px ${FONT}`;
  const ch = h * 0.5;
  const ws = steps.map((x) => textW(ctx, x.label, font, fs * 0.1) + ch * 0.9);
  const gap = ch * 0.55;
  let cx = rx - ws.reduce((a, b) => a + b, 0) - gap * (steps.length - 1);
  const cy = hb.y + (h - ch) / 2;
  steps.forEach((x, i) => {
    const w = ws[i];
    const col = x.on ? (S.st.key === "decision" ? (S.positive ? GOOD : BAD) : CYAN) : x.done ? MAG : "rgba(255,255,255,0.25)";
    if (x.on) {
      ctx.save();
      chamfer(ctx, cx, cy, w, ch, ch * 0.3);
      ctx.shadowColor = col;
      ctx.shadowBlur = 24 * s * (0.6 + 0.4 * varPulse(now, 800));
      ctx.fillStyle = rgba(col, 0.9);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = "#05010f";
      ctx.font = font;
      spaced(ctx, fs * 0.1);
      ctx.textAlign = "center";
      ctx.fillText(x.label, cx + w / 2, cy + ch * 0.55);
      spaced(ctx, 0);
    } else {
      if (x.done) neonPath(ctx, () => chamfer(ctx, cx, cy, w, ch, ch * 0.3), col, Math.max(1, 1.5 * s), s, 0.5);
      else { chamfer(ctx, cx, cy, w, ch, ch * 0.3); ctx.strokeStyle = col; ctx.lineWidth = Math.max(1, s); ctx.stroke(); }
      ctx.fillStyle = x.done ? "#ffd6f5" : "rgba(255,255,255,0.45)";
      ctx.font = font;
      spaced(ctx, fs * 0.1);
      ctx.textAlign = "center";
      ctx.fillText(x.label, cx + w / 2, cy + ch * 0.55);
      spaced(ctx, 0);
    }
    cx += w;
    if (i < steps.length - 1) {
      ctx.fillStyle = rgba(CYAN, 0.6);
      ctx.font = `900 ${fs}px ${FONT}`;
      ctx.textAlign = "center";
      ctx.fillText("»", cx + gap / 2, cy + ch * 0.52);
      cx += gap;
    }
  });
}

function footer(ctx, S) {
  const { L, st, now, s } = S;
  const f = L.footer;
  const h = f.h;
  const c = h * 0.35;
  const dec = st.key === "decision";
  const col = dec ? (S.positive ? GOOD : BAD) : MAG;
  chamfer(ctx, f.x, f.y, f.w, h, c);
  const g = ctx.createLinearGradient(0, f.y, 0, f.y + h);
  g.addColorStop(0, "rgba(30,10,70,0.92)");
  g.addColorStop(1, "rgba(8,2,26,0.92)");
  ctx.fillStyle = g;
  ctx.fill();
  if (dec) {
    ctx.save();
    chamfer(ctx, f.x, f.y, f.w, h, c);
    ctx.clip();
    const ag = ctx.createLinearGradient(0, f.y, 0, f.y + h);
    ag.addColorStop(0, rgba(col, 0.05));
    ag.addColorStop(1, rgba(col, 0.28));
    ctx.fillStyle = ag;
    ctx.fillRect(f.x, f.y, f.w, h);
    ctx.restore();
  }
  neonPath(ctx, () => chamfer(ctx, f.x, f.y, f.w, h, c), col, Math.max(1.5, (dec ? 3.5 : 2.5) * s), s, (dec ? 1.2 : 0.8) * flicker(now, 4));
  const vx = f.x + h * 0.45;
  neonText(ctx, "VAR", vx, f.y + h * 0.54, dec ? col : CYAN, `900 ${h * 0.44}px ${FONT}`, s, { sp: h * 0.04 });
  const x0 = vx + textW(ctx, "VAR", `900 ${h * 0.44}px ${FONT}`, h * 0.04) + h * 0.5;
  if (dec) {
    const t = S.decisionMs;
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.font = `700 ${h * 0.2}px ${FONT}`;
    spaced(ctx, h * 0.08);
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText("KARAR", x0, f.y + h * 0.53);
    const kw = textW(ctx, "KARAR", `700 ${h * 0.2}px ${FONT}`, h * 0.08);
    spaced(ctx, 0);
    const font = `900 ${h * 0.56}px ${FONT}`;
    const tx = x0 + kw + h * 0.6;
    const maxW = f.w - (tx - f.x) - h * 1.5;
    const y = f.y + h * 0.55;
    if (t < 520) {
      // glitch: RGB kayması + yatay kesikler
      const j = (1 - t / 520) * h * 0.18;
      const seed = Math.floor(t / 40);
      const ox = ((seed * 7919) % 13) / 13 - 0.5;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.font = font;
      ctx.textAlign = "left";
      ctx.fillStyle = rgba(CYAN, 0.8); ctx.fillText(st.text, tx - j + ox * j, y, maxW);
      ctx.fillStyle = rgba(MAG, 0.8); ctx.fillText(st.text, tx + j, y + ox * j * 0.4, maxW);
      ctx.restore();
      ctx.save();
      ctx.beginPath();
      for (let k = 0; k < 4; k += 1) { const yy = f.y + h * (((seed + k * 37) % 10) / 10); ctx.rect(f.x + c, yy, f.w - c * 2, h * 0.07); }
      ctx.clip();
      ctx.fillStyle = "#fff";
      ctx.font = font;
      ctx.fillText(st.text, tx + ox * j * 3, y, maxW);
      ctx.restore();
    } else neonText(ctx, st.text, tx, y, col, font, s, { maxW, glow: 1.3 * flicker(now, 5), sp: h * 0.02 });
    if (t > 300) {
      ctx.save();
      ctx.globalAlpha = clamp01((t - 300) / 300);
      ctx.shadowColor = col; ctx.shadowBlur = 18 * s;
      verdictIcon(ctx, f.x + f.w - c - h * 0.45, f.y + h / 2, h * 0.28, S.positive, { bg: null, fg: col, ring: col });
      ctx.restore();
    }
    return;
  }
  ctx.fillStyle = "#fff";
  ctx.globalAlpha = flicker(now, 7);
  neonText(ctx, `${upper(st.text)}${".".repeat(1 + (Math.floor(now / 450) % 3))}`, x0, f.y + h * 0.55, VIO, `900 ${h * 0.34}px ${FONT}`, s, { maxW: f.w * 0.5, glow: 0.6, sp: h * 0.02 });
  ctx.globalAlpha = 1;
  // ekolayzer
  const bars = 22;
  const bw = f.w * 0.22;
  const bx = f.x + f.w - c - bw - h * 0.2;
  const gw = bw / bars;
  ctx.save();
  ctx.shadowColor = CYAN;
  ctx.shadowBlur = 10 * s;
  for (let k = 0; k < bars; k += 1) {
    const a = 0.5 + 0.5 * Math.sin(now / 130 + k * 0.9) * Math.cos(now / 410 + k * 0.33);
    const bh = h * (0.12 + 0.5 * a);
    ctx.fillStyle = k % 2 ? rgba(CYAN, 0.9) : rgba(MAG, 0.9);
    ctx.fillRect(bx + k * gw, f.y + (h - bh) / 2, gw * 0.55, bh);
  }
  ctx.restore();
  ctx.fillStyle = CYAN;
  ctx.font = `800 ${h * 0.17}px ${FONT}`;
  spaced(ctx, h * 0.06);
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.fillText(st.label, bx - h * 0.3, f.y + h * 0.53);
  spaced(ctx, 0);
}

export function chrome(ctx, S) {
  const { W, H, now, s, flash } = S;
  header(ctx, S);
  footer(ctx, S);
  // tüm ekran tarama çizgileri + kayan parlak bant
  ctx.fillStyle = "rgba(0,0,0,0.16)";
  const step = Math.max(2, Math.round(3 * s));
  for (let y = 0; y < H; y += step * 2) ctx.fillRect(0, y, W, step);
  const by = ((now % 5000) / 5000) * (H * 1.3) - H * 0.15;
  const bg = ctx.createLinearGradient(0, by - H * 0.06, 0, by + H * 0.06);
  bg.addColorStop(0, "rgba(34,211,238,0)");
  bg.addColorStop(0.5, "rgba(34,211,238,0.06)");
  bg.addColorStop(1, "rgba(34,211,238,0)");
  ctx.fillStyle = bg;
  ctx.fillRect(0, by - H * 0.06, W, H * 0.12);
  // köşe parantezleri
  ctx.save();
  ctx.strokeStyle = rgba(MAG, 0.9);
  ctx.shadowColor = MAG;
  ctx.shadowBlur = 14 * s;
  ctx.lineWidth = Math.max(2, 3 * s);
  const m = 14 * s;
  const len = 60 * s;
  ctx.beginPath();
  for (const [x, y, dx, dy] of [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]]) { ctx.moveTo(x, y + dy * len); ctx.lineTo(x, y); ctx.lineTo(x + dx * len, y); }
  ctx.stroke();
  ctx.restore();
  if (flash > 0) { ctx.fillStyle = `rgba(255,180,240,${0.32 * flash})`; ctx.fillRect(0, 0, W, H); }
}
