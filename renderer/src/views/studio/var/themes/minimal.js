// VAR teması — MİNİMAL PRO: temiz ince çizgiler, buzlu cam kartlar.
//
//   zemin      koyu arduvaz geçiş, yavaş süzülen iki yumuşak renk lekesi, ince nokta ızgara
//   pencereler cam kart (yarı saydam, 1 px kenar, yumuşak gölge), ince iç çizgi,
//              cam hap etiketler ("AÇI 1 · KAMERA"), CANLI / 0,5×, ince turkuaz tarama
//   üst bant   cam şerit: VAR işareti, "VİDEO YARDIMCI HAKEM" + konu, düğümlü ilerleme
//              çizgisi İNCELEME › KONTROL › KARAR, zaman kodu, logo
//   alt bant   cam şerit + belirsiz ilerleme çizgisi; KARAR'da renk vurgulu kart
//              aşağıdan yükselerek belirir
import { varPulse, varScan } from "../../../../lib/studio/var";
import { FONT, MONO, clamp01, easeOut, rgba, rr, spaced, textW, upper, verdictIcon } from "../kit";

const INK = "#e8eef6";
const MUTED = "rgba(232,238,246,0.55)";
const TEAL = "#5eead4";
const OK = "#34d399";
const NO = "#fb7185";

function glass(ctx, x, y, w, h, r, s, { fill = 0.07, line = 0.2, shadow = true } = {}) {
  ctx.save();
  if (shadow) { ctx.shadowColor = "rgba(0,0,0,0.45)"; ctx.shadowBlur = 30 * s; ctx.shadowOffsetY = 10 * s; }
  rr(ctx, x, y, w, h, r);
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, `rgba(255,255,255,${fill + 0.04})`);
  g.addColorStop(1, `rgba(255,255,255,${fill})`);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();
  rr(ctx, x + 0.5, y + 0.5, w - 1, h - 1, r);
  ctx.strokeStyle = `rgba(255,255,255,${line})`;
  ctx.lineWidth = Math.max(1, s);
  ctx.stroke();
  // üst parlak kenar
  ctx.save();
  rr(ctx, x, y, w, h, r);
  ctx.clip();
  const hl = ctx.createLinearGradient(x, 0, x + w, 0);
  hl.addColorStop(0, "rgba(255,255,255,0)");
  hl.addColorStop(0.5, "rgba(255,255,255,0.35)");
  hl.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = hl;
  ctx.fillRect(x, y, w, Math.max(1, s));
  ctx.restore();
}

function pill(ctx, x, y, text, fs, s, { align = "left", dot = null, accent = null } = {}) {
  const font = `700 ${fs}px ${FONT}`;
  const tw = textW(ctx, text, font, fs * 0.12);
  const ph = fs * 2;
  const extra = dot ? fs * 1.1 : 0;
  const pw = tw + fs * 1.6 + extra;
  const x0 = align === "right" ? x - pw : x;
  ctx.save();
  rr(ctx, x0, y, pw, ph, ph / 2);
  ctx.fillStyle = "rgba(12,16,24,0.55)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.22)";
  ctx.lineWidth = Math.max(1, s);
  ctx.stroke();
  if (dot) { ctx.fillStyle = dot; ctx.beginPath(); ctx.arc(x0 + fs * 0.95, y + ph / 2, fs * 0.28, 0, Math.PI * 2); ctx.fill(); }
  ctx.font = font;
  spaced(ctx, fs * 0.12);
  ctx.fillStyle = accent || INK;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x0 + fs * 0.8 + extra, y + ph * 0.54);
  spaced(ctx, 0);
  ctx.restore();
  return pw;
}

export function background(ctx, S) {
  const { W, H, now, s } = S;
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, "#121925");
  g.addColorStop(1, "#090c12");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const t = now / 1000;
  for (const [cx, cy, rad, col] of [[0.22 + 0.05 * Math.sin(t * 0.21), 0.3 + 0.05 * Math.cos(t * 0.17), 0.5, "rgba(94,234,212,0.13)"], [0.8 + 0.05 * Math.cos(t * 0.19), 0.72 + 0.05 * Math.sin(t * 0.23), 0.55, "rgba(129,140,248,0.14)"]]) {
    const rg = ctx.createRadialGradient(W * cx, H * cy, 0, W * cx, H * cy, W * rad);
    rg.addColorStop(0, col);
    rg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, W, H);
  }
  // nokta ızgara
  ctx.fillStyle = "rgba(255,255,255,0.05)";
  const step = Math.max(10, 32 * s);
  const d = Math.max(1, 1.6 * s);
  for (let y = step / 2; y < H; y += step) for (let x = step / 2; x < W; x += step) ctx.fillRect(x, y, d, d);
  // cam kartlar (pencerelerin arkası)
  for (const p of S.panes) {
    const r = p.rect;
    const pad = Math.max(4, 10 * s);
    glass(ctx, r.x - pad, r.y - pad, r.w + pad * 2, r.h + pad * 2, 18 * s, s, { fill: 0.06, line: 0.18 });
  }
}

const paneRadius = (S, r) => Math.min(Math.max(3, 10 * S.s), r.w / 8, r.h / 8);

/** Pencere biçimi: yuvarlak köşeli (içerik de bu yola kırpılır). */
export function panePath(ctx, S, p) {
  const r = p.rect;
  rr(ctx, r.x, r.y, r.w, r.h, paneRadius(S, r));
}

export function pane(ctx, S, p, info, i) {
  const { now, s, n } = S;
  const r = p.rect;
  if (!info) {
    const g = ctx.createLinearGradient(r.x, r.y, r.x, r.y + r.h);
    g.addColorStop(0, "#1a2230");
    g.addColorStop(1, "#0e131b");
    ctx.fillStyle = g;
    panePath(ctx, S, p); ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = Math.max(1, 1.5 * s);
    const c = Math.min(r.w, r.h) * 0.12;
    rr(ctx, r.x + r.w / 2 - c, r.y + r.h / 2 - c * 0.8, c * 2, c * 1.25, c * 0.18);
    ctx.stroke();
    ctx.fillStyle = MUTED;
    ctx.font = `700 ${Math.max(9, r.h * 0.05)}px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("VAR", r.x + r.w / 2, r.y + r.h / 2 - c * 0.18);
    ctx.font = `600 ${Math.max(8, r.h * 0.036)}px ${FONT}`;
    spaced(ctx, r.h * 0.006);
    ctx.fillText("Açı seçilmedi", r.x + r.w / 2, r.y + r.h / 2 + c * 0.85);
    spaced(ctx, 0);
  }
  if (n.scan) {
    ctx.save();
    panePath(ctx, S, p); ctx.clip();
    const y = r.y + varScan(now + i * 700, 3400) * r.h;
    const tg = ctx.createLinearGradient(0, y - r.h * 0.08, 0, y);
    tg.addColorStop(0, rgba(TEAL, 0));
    tg.addColorStop(1, rgba(TEAL, 0.1));
    ctx.fillStyle = tg;
    ctx.fillRect(r.x, y - r.h * 0.08, r.w, r.h * 0.08);
    ctx.fillStyle = rgba(TEAL, 0.55);
    ctx.fillRect(r.x, y, r.w, Math.max(1, s));
    ctx.restore();
  }
  // ince iç çizgi + köşe işaretleri
  ctx.strokeStyle = "rgba(255,255,255,0.3)";
  ctx.lineWidth = Math.max(1, s);
  const rad = paneRadius(S, r);
  rr(ctx, r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1, rad);
  ctx.stroke();
  const cl = Math.min(r.w, r.h) * 0.07;
  ctx.strokeStyle = rgba(TEAL, 0.9);
  ctx.lineWidth = Math.max(1.5, 2 * s);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(r.x + 0.5, r.y + cl); ctx.arcTo(r.x + 0.5, r.y + 0.5, r.x + cl, r.y + 0.5, rad); ctx.lineTo(r.x + cl, r.y + 0.5);
  ctx.moveTo(r.x + r.w - cl, r.y + r.h - 0.5); ctx.arcTo(r.x + r.w - 0.5, r.y + r.h - 0.5, r.x + r.w - 0.5, r.y + r.h - cl, rad); ctx.lineTo(r.x + r.w - 0.5, r.y + r.h - cl);
  ctx.stroke();
  ctx.lineCap = "butt";
  // etiketler
  const fs = Math.max(7, (p.big ? 15 : 12) * s);
  const m = Math.max(4, 14 * s);
  const w1 = pill(ctx, r.x + m, r.y + m, `AÇI ${i + 1}`, fs, s, { accent: TEAL });
  if (info?.label) pill(ctx, r.x + m + w1 + fs * 0.5, r.y + m, upper(info.label), fs, s);
  if (info?.live) pill(ctx, r.x + r.w - m, r.y + m, "CANLI", fs, s, { align: "right", dot: rgba(NO, 0.45 + 0.55 * varPulse(now, 1000)) });
  else if (info?.rate && info.rate < 1) pill(ctx, r.x + r.w - m, r.y + m, `${String(info.rate).replace(".", ",")}×  AĞIR ÇEKİM`, fs, s, { align: "right" });
}

function header(ctx, S) {
  const { L, n, st, now, s, logo } = S;
  const hb = L.header;
  const h = hb.h;
  glass(ctx, hb.x, hb.y, hb.w, h, h * 0.28, s);
  // VAR işareti
  const m = h * 0.2;
  const bs = h - m * 2;
  rr(ctx, hb.x + m, hb.y + m, bs * 1.55, bs, bs * 0.24);
  ctx.strokeStyle = rgba(TEAL, 0.9);
  ctx.lineWidth = Math.max(1.5, 2 * s);
  ctx.stroke();
  ctx.fillStyle = rgba(TEAL, 0.1);
  ctx.fill();
  ctx.fillStyle = TEAL;
  ctx.font = `800 ${bs * 0.44}px ${FONT}`;
  spaced(ctx, bs * 0.06);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("VAR", hb.x + m + bs * 0.78, hb.y + h * 0.53);
  spaced(ctx, 0);
  const tx = hb.x + m + bs * 1.55 + h * 0.3;
  ctx.textAlign = "left";
  ctx.fillStyle = MUTED;
  ctx.font = `600 ${h * 0.17}px ${FONT}`;
  spaced(ctx, h * 0.05);
  ctx.fillText("VİDEO YARDIMCI HAKEM", tx, hb.y + h * 0.32);
  spaced(ctx, 0);
  ctx.fillStyle = INK;
  ctx.font = `700 ${h * 0.32}px ${FONT}`;
  spaced(ctx, h * 0.01);
  ctx.fillText(S.topic, tx, hb.y + h * 0.66, hb.w * 0.3);
  spaced(ctx, 0);
  // sağdan sola
  let rx = hb.x + hb.w - h * 0.35;
  if (logo?.naturalWidth) {
    const lh = h * 0.46;
    const lw = Math.min(h * 2, (logo.naturalWidth / logo.naturalHeight) * lh);
    ctx.save(); ctx.globalAlpha = 0.9;
    try { ctx.drawImage(logo, rx - lw, hb.y + (h - lh) / 2, lw, lh); } catch { /* yoksay */ }
    ctx.restore();
    rx -= lw + h * 0.35;
    ctx.fillStyle = "rgba(255,255,255,0.14)";
    ctx.fillRect(rx, hb.y + h * 0.26, Math.max(1, s), h * 0.48);
    rx -= h * 0.35;
  }
  if (n.timecode) {
    ctx.textAlign = "right";
    ctx.fillStyle = INK;
    ctx.font = `500 ${h * 0.28}px ${MONO}`;
    ctx.fillText(S.tc, rx, hb.y + h * 0.54);
    rx -= ctx.measureText(S.tc).width + h * 0.5;
  }
  // düğümlü ilerleme çizgisi
  const steps = S.steps;
  const fs = h * 0.17;
  const font = `700 ${fs}px ${FONT}`;
  const ws = steps.map((x) => textW(ctx, x.label, font, fs * 0.1));
  const seg = Math.max(...ws) + h * 0.9;
  const total = seg * (steps.length - 1);
  const x0 = rx - total - ws[ws.length - 1] / 2 - h * 0.1;
  const ly = hb.y + h * 0.36;
  const idx = steps.findIndex((x) => x.on);
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = Math.max(1, 2 * s);
  ctx.beginPath(); ctx.moveTo(x0, ly); ctx.lineTo(x0 + total, ly); ctx.stroke();
  ctx.strokeStyle = TEAL;
  ctx.beginPath(); ctx.moveTo(x0, ly); ctx.lineTo(x0 + seg * Math.max(0, idx), ly); ctx.stroke();
  const pulse = varPulse(now, 1400);
  steps.forEach((x, i) => {
    const cx = x0 + seg * i;
    const col = x.on && st.key === "decision" ? (S.positive ? OK : NO) : TEAL;
    if (x.on) {
      ctx.fillStyle = rgba(col, 0.18 + 0.2 * pulse);
      ctx.beginPath(); ctx.arc(cx, ly, h * (0.12 + 0.05 * pulse), 0, Math.PI * 2); ctx.fill();
    }
    ctx.beginPath(); ctx.arc(cx, ly, h * 0.065, 0, Math.PI * 2);
    ctx.fillStyle = x.on || x.done ? col : "#1a2130";
    ctx.fill();
    ctx.strokeStyle = x.on || x.done ? col : "rgba(255,255,255,0.35)";
    ctx.lineWidth = Math.max(1, 1.5 * s);
    ctx.stroke();
    ctx.font = font;
    spaced(ctx, fs * 0.1);
    ctx.fillStyle = x.on ? INK : x.done ? MUTED : "rgba(232,238,246,0.35)";
    ctx.textAlign = "center";
    ctx.fillText(x.label, cx, hb.y + h * 0.72);
    spaced(ctx, 0);
  });
}

function footer(ctx, S) {
  const { L, st, now, s } = S;
  const f = L.footer;
  const h = f.h;
  if (st.key === "decision") {
    const t = S.decisionMs;
    const k = easeOut(t / 650);
    const col = S.positive ? OK : NO;
    const dy = (1 - k) * h * 0.6;
    ctx.save();
    ctx.globalAlpha = clamp01(k * 1.4);
    ctx.translate(0, dy);
    glass(ctx, f.x, f.y, f.w, h, h * 0.3, s, { fill: 0.1, line: 0.25 });
    // renkli vurgu
    ctx.save();
    rr(ctx, f.x, f.y, f.w, h, h * 0.3);
    ctx.clip();
    const ag = ctx.createLinearGradient(f.x, 0, f.x + f.w * 0.6, 0);
    ag.addColorStop(0, rgba(col, 0.35));
    ag.addColorStop(1, rgba(col, 0));
    ctx.fillStyle = ag;
    ctx.fillRect(f.x, f.y, f.w, h);
    ctx.fillStyle = col;
    ctx.fillRect(f.x, f.y, Math.max(3, 6 * s), h);
    // alt ilerleme (karar sabitlendi)
    ctx.fillStyle = rgba(col, 0.9);
    ctx.fillRect(f.x, f.y + h - Math.max(2, 2 * s), f.w * easeOut(t / 1400), Math.max(2, 2 * s));
    ctx.restore();
    ctx.fillStyle = MUTED;
    ctx.font = `600 ${h * 0.2}px ${FONT}`;
    spaced(ctx, h * 0.07);
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText("KARAR", f.x + h * 0.55, f.y + h * 0.52);
    spaced(ctx, 0);
    ctx.fillStyle = INK;
    ctx.font = `800 ${h * 0.46}px ${FONT}`;
    spaced(ctx, h * 0.02);
    ctx.fillText(st.text, f.x + h * 1.95, f.y + h * 0.54, f.w - h * 3.4);
    spaced(ctx, 0);
    verdictIcon(ctx, f.x + f.w - h * 0.65, f.y + h / 2, h * 0.27, S.positive, { bg: null, fg: col, ring: col });
    ctx.restore();
    return;
  }
  glass(ctx, f.x, f.y, f.w, h, h * 0.3, s);
  ctx.fillStyle = TEAL;
  ctx.beginPath(); ctx.arc(f.x + h * 0.55, f.y + h / 2, h * 0.08 * (0.7 + 0.3 * varPulse(now, 1200)), 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = MUTED;
  ctx.font = `600 ${h * 0.18}px ${FONT}`;
  spaced(ctx, h * 0.07);
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(st.label, f.x + h * 0.85, f.y + h * 0.52);
  const lw = textW(ctx, st.label, `600 ${h * 0.18}px ${FONT}`, h * 0.1);
  spaced(ctx, 0);
  ctx.fillStyle = INK;
  ctx.font = `600 ${h * 0.32}px ${FONT}`;
  ctx.fillText(st.text, f.x + h * 1.25 + lw, f.y + h * 0.53, f.w * 0.5);
  // belirsiz ilerleme çizgisi
  const bw = f.w * 0.22;
  const bx = f.x + f.w - bw - h * 0.5;
  const by = f.y + h / 2;
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.fillRect(bx, by - Math.max(1, s), bw, Math.max(2, 2 * s));
  const t = (now % 1600) / 1600;
  const a = bw * Math.max(0, t * 1.4 - 0.4);
  const b = bw * Math.min(1, t * 1.4);
  ctx.fillStyle = TEAL;
  ctx.fillRect(bx + a, by - Math.max(1, s), Math.max(0, b - a), Math.max(2, 2 * s));
}

export function chrome(ctx, S) {
  const { W, H, flash } = S;
  header(ctx, S);
  footer(ctx, S);
  if (flash > 0) { ctx.fillStyle = `rgba(255,255,255,${0.16 * flash})`; ctx.fillRect(0, 0, W, H); }
}
