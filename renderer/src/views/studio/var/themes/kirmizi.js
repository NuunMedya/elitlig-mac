// VAR teması — KIRMIZI ALARM (ilk tasarım): nabızlı kırmızı ekran çerçevesi.
//
//   zemin      çok koyu kırmızı-siyah, merkez kızıl ışık, çapraz doku, kenar karartması
//   çerçeve    tüm ekranı saran nabızlı kırmızı kenarlık, beyaz köşe ayraçları,
//              yan raylarda dikey "VAR · VİDEO YARDIMCI HAKEM" ve akan çentikler
//   üst bant   VAR rozeti, konu, İNCELEME › KONTROL › KARAR, zaman kodu, logo
//   pencereler her açı kırmızı çerçeveli (nabızlı parlama), "AÇI n" sekmesi
//   alt bant   kırmızı bant; KARAR'da beyaz karar levhası kayarak açılır
import { varPulse, varScan } from "../../../../lib/studio/var";
import { FONT, MONO, brackets, clamp01, easeOut, rgba, rr, spaced, tab, upper, varMonitorBadge, verdictIcon } from "../kit";

export const VAR_RED = "#ff1f3d";
const RED_DEEP = "#b00020";
const RED_DARK = "#2a0208";

export const badge = (ctx, x, y, h, s = 1) => varMonitorBadge(ctx, x, y, h, { fill: "#ff3552", fill2: RED_DEEP, s });

function glowRect(ctx, r, lw, pulse, s, radius = 0) {
  ctx.save();
  ctx.shadowColor = rgba(VAR_RED, 0.55 + 0.45 * pulse);
  ctx.shadowBlur = (14 + 26 * pulse) * s;
  ctx.strokeStyle = rgba(VAR_RED, 0.85 + 0.15 * pulse);
  ctx.lineWidth = lw;
  if (radius) { rr(ctx, r.x, r.y, r.w, r.h, radius); ctx.stroke(); } else ctx.strokeRect(r.x, r.y, r.w, r.h);
  ctx.shadowBlur = 0;
  ctx.strokeStyle = rgba("#ffd0d6", 0.35 + 0.25 * pulse);
  ctx.lineWidth = Math.max(1, lw * 0.22);
  if (radius) { rr(ctx, r.x, r.y, r.w, r.h, radius); ctx.stroke(); } else ctx.strokeRect(r.x, r.y, r.w, r.h);
  ctx.restore();
}

export function background(ctx, S) {
  const { W, H, now, s, L } = S;
  ctx.fillStyle = "#070103";
  ctx.fillRect(0, 0, W, H);
  const p = varPulse(now, 2400);
  const g = ctx.createRadialGradient(W * 0.5, H * 0.5, 0, W * 0.5, H * 0.5, W * 0.62);
  g.addColorStop(0, rgba("#7a0016", 0.55 + 0.1 * p));
  g.addColorStop(0.55, rgba("#3a0009", 0.35));
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.globalAlpha = 0.05;
  ctx.strokeStyle = "#ff5a70";
  ctx.lineWidth = 1;
  const step = Math.max(8, Math.round(W / 60));
  ctx.beginPath();
  for (let x = -H; x < W; x += step) { ctx.moveTo(x, H); ctx.lineTo(x + H, 0); }
  ctx.stroke();
  ctx.restore();
  const v = ctx.createLinearGradient(0, 0, 0, H);
  v.addColorStop(0, "rgba(0,0,0,0.55)");
  v.addColorStop(0.25, "rgba(0,0,0,0)");
  v.addColorStop(0.75, "rgba(0,0,0,0)");
  v.addColorStop(1, "rgba(0,0,0,0.6)");
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);
  // Sahne alanı: koyu panel, ince kırmızı çizgi, arkada silik büyük "VAR".
  const sg = L.stage;
  ctx.fillStyle = "rgba(0,0,0,0.32)";
  ctx.fillRect(sg.x, sg.y, sg.w, sg.h);
  ctx.strokeStyle = rgba(VAR_RED, 0.28);
  ctx.lineWidth = Math.max(1, s);
  ctx.strokeRect(sg.x + 0.5, sg.y + 0.5, sg.w - 1, sg.h - 1);
  ctx.save();
  ctx.fillStyle = "rgba(255,40,70,0.05)";
  ctx.font = `900 ${sg.h * 0.62}px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("VAR", sg.x + sg.w / 2, sg.y + sg.h * 0.54);
  ctx.restore();
}

export function pane(ctx, S, p, info, i) {
  const { now, s, n } = S;
  const r = p.rect;
  const pulse = varPulse(now + i * 233, 1400);
  if (!info) {
    ctx.save();
    ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
    const g = ctx.createRadialGradient(r.x + r.w / 2, r.y + r.h / 2, 0, r.x + r.w / 2, r.y + r.h / 2, r.w * 0.6);
    g.addColorStop(0, "#2a0309");
    g.addColorStop(1, "#0b0103");
    ctx.fillStyle = g;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    const bh = Math.min(r.h * 0.3, r.w * 0.14);
    ctx.globalAlpha = 0.85;
    badge(ctx, r.x + r.w / 2 - bh * 1.075, r.y + r.h / 2 - bh * 0.75, bh, s);
    ctx.globalAlpha = 1;
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.font = `800 ${Math.max(10, r.h * 0.045)}px ${FONT}`;
    spaced(ctx, r.h * 0.008);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("AÇI SEÇİLMEDİ", r.x + r.w / 2, r.y + r.h / 2 + bh * 0.62);
    spaced(ctx, 0);
    ctx.restore();
  }
  ctx.save();
  ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
  if (n.scan) {
    const y = r.y + varScan(now + i * 700) * r.h;
    const tg = ctx.createLinearGradient(0, y - r.h * 0.14, 0, y);
    tg.addColorStop(0, rgba(VAR_RED, 0));
    tg.addColorStop(1, rgba(VAR_RED, 0.2));
    ctx.fillStyle = tg;
    ctx.fillRect(r.x, y - r.h * 0.14, r.w, r.h * 0.14);
    ctx.fillStyle = "rgba(255,220,226,0.7)";
    ctx.fillRect(r.x, y, r.w, Math.max(1, 1.5 * s));
  }
  const edge = Math.min(r.w, r.h) * 0.08;
  for (const [from, to] of [[r.x, r.x + edge], [r.x + r.w, r.x + r.w - edge]]) {
    const gg = ctx.createLinearGradient(from, 0, to, 0);
    gg.addColorStop(0, rgba(VAR_RED, 0.18 + 0.12 * pulse));
    gg.addColorStop(1, rgba(VAR_RED, 0));
    ctx.fillStyle = gg;
    ctx.fillRect(Math.min(from, to), r.y, edge, r.h);
  }
  ctx.restore();
  const lw = Math.max(3, (p.big ? 7 : 5) * s);
  glowRect(ctx, { x: r.x - lw / 2, y: r.y - lw / 2, w: r.w + lw, h: r.h + lw }, lw, pulse, s);
  brackets(ctx, r, Math.min(r.w, r.h) * 0.09, Math.max(2, (p.big ? 6 : 4.5) * s), "#ffffff", lw + 4 * s);
  const fs = Math.max(8, (p.big ? 20 : 15) * s);
  const w1 = tab(ctx, r.x, r.y, `AÇI ${i + 1}`, fs, VAR_RED);
  if (info?.label) tab(ctx, r.x + w1, r.y, upper(info.label), fs * 0.92, "rgba(0,0,0,0.72)");
  if (info?.live) {
    const wl = tab(ctx, r.x + r.w, r.y, "    CANLI", fs * 0.92, "rgba(0,0,0,0.72)", "#fff", "right");
    ctx.fillStyle = rgba(VAR_RED, 0.5 + 0.5 * varPulse(now, 900));
    ctx.beginPath(); ctx.arc(r.x + r.w - wl + fs * 0.95, r.y + fs * 0.88, fs * 0.3, 0, Math.PI * 2); ctx.fill();
  } else if (info?.rate && info.rate < 1) {
    tab(ctx, r.x + r.w, r.y, `${String(info.rate).replace(".", ",")}× AĞIR ÇEKİM`, fs * 0.92, "rgba(0,0,0,0.72)", "#fff", "right");
  }
}

function screenFrame(ctx, S) {
  const { W, H, L, now, s, flash } = S;
  const pulse = varPulse(now, 1400);
  L.rails.forEach((r, i) => {
    const g = ctx.createLinearGradient(r.x, 0, r.x + r.w, 0);
    g.addColorStop(i ? 1 : 0, rgba(RED_DARK, 0.96));
    g.addColorStop(i ? 0 : 1, rgba("#120104", 0.9));
    ctx.fillStyle = g;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = rgba(VAR_RED, 0.75);
    ctx.fillRect(i ? r.x : r.x + r.w - Math.max(1, 2 * s), r.y, Math.max(1, 2 * s), r.h);
    const tick = 26 * s;
    const off = ((now / 30) * s) % tick;
    ctx.fillStyle = rgba("#ff8a99", 0.28);
    for (let y = r.y + r.h - off; y > r.y; y -= tick) ctx.fillRect(r.x + r.w * 0.3, y, r.w * 0.4, Math.max(1, 2 * s));
    ctx.save();
    ctx.translate(r.x + r.w / 2, H / 2);
    ctx.rotate(i ? Math.PI / 2 : -Math.PI / 2);
    ctx.fillStyle = "#fff";
    ctx.font = `900 ${Math.round(r.w * 0.36)}px ${FONT}`;
    spaced(ctx, r.w * 0.12);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("VAR  ·  VİDEO YARDIMCI HAKEM  ·  VAR", 0, 0);
    spaced(ctx, 0);
    ctx.restore();
  });
  glowRect(ctx, L.frame, Math.max(3, 7 * s), pulse, s);
  brackets(ctx, L.frame, 110 * s, Math.max(3, 9 * s), "#ffffff", -1 * s);
  ctx.fillStyle = VAR_RED;
  const t = 34 * s;
  for (const [x, y, dx, dy] of [[0, 0, 1, 1], [W, 0, -1, 1], [0, H, 1, -1], [W, H, -1, -1]]) {
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + dx * t, y); ctx.lineTo(x, y + dy * t); ctx.closePath(); ctx.fill();
  }
  if (flash > 0) { ctx.fillStyle = `rgba(255,255,255,${0.35 * flash})`; ctx.fillRect(0, 0, W, H); }
}

function header(ctx, S) {
  const { L, n, st, now, s, logo } = S;
  const hb = L.header;
  const g = ctx.createLinearGradient(hb.x, 0, hb.x + hb.w, 0);
  g.addColorStop(0, "rgba(60,2,12,0.96)");
  g.addColorStop(0.5, "rgba(24,1,6,0.94)");
  g.addColorStop(1, "rgba(60,2,12,0.96)");
  ctx.fillStyle = g;
  ctx.fillRect(hb.x, hb.y, hb.w, hb.h);
  ctx.fillStyle = VAR_RED;
  ctx.fillRect(hb.x, hb.y + hb.h - Math.max(2, 4 * s), hb.w, Math.max(2, 4 * s));
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.fillRect(hb.x, hb.y, hb.w, Math.max(1, s));
  const bh = hb.h * 0.78;
  const bx = hb.x + hb.h * 0.18;
  const bw = badge(ctx, bx, hb.y + (hb.h - bh) / 2 - 1 * s, bh, s);
  const tx = bx + bw + hb.h * 0.32;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ff8a99";
  ctx.font = `800 ${hb.h * 0.19}px ${FONT}`;
  spaced(ctx, hb.h * 0.06);
  ctx.fillText("VİDEO YARDIMCI HAKEM", tx, hb.y + hb.h * 0.3);
  spaced(ctx, 0);
  ctx.fillStyle = "#fff";
  ctx.font = `900 ${hb.h * 0.38}px ${FONT}`;
  ctx.fillText(S.topic, tx, hb.y + hb.h * 0.66, hb.w * 0.32);

  let rx = hb.x + hb.w - hb.h * 0.25;
  if (logo?.naturalWidth) {
    const lh = hb.h * 0.6;
    const lw = Math.min(hb.h * 2.2, (logo.naturalWidth / logo.naturalHeight) * lh);
    try { ctx.drawImage(logo, rx - lw, hb.y + (hb.h - lh) / 2, lw, lh); } catch { /* yoksay */ }
    rx -= lw + hb.h * 0.32;
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.fillRect(rx, hb.y + hb.h * 0.2, Math.max(1, s * 1.5), hb.h * 0.6);
    rx -= hb.h * 0.32;
  }
  if (n.timecode) {
    ctx.textAlign = "right";
    ctx.fillStyle = "#fff";
    ctx.font = `700 ${hb.h * 0.32}px ${MONO}`;
    ctx.fillText(S.tc, rx, hb.y + hb.h * 0.54);
    const tw = ctx.measureText(S.tc).width;
    ctx.fillStyle = "#ff8a99";
    ctx.font = `800 ${hb.h * 0.16}px ${FONT}`;
    ctx.fillText("TC", rx - tw - hb.h * 0.14, hb.y + hb.h * 0.54);
    rx -= tw + hb.h * 0.62;
  }
  const steps = S.steps;
  const fs = hb.h * 0.25;
  const ch = hb.h * 0.52;
  ctx.font = `900 ${fs}px ${FONT}`;
  const widths = steps.map((x) => ctx.measureText(x.label).width + ch * 1.05);
  const arrow = ch * 0.5;
  let cx = rx - widths.reduce((a, b) => a + b, 0) - arrow * (steps.length - 1);
  const cy = hb.y + (hb.h - ch) / 2;
  const blink = 0.45 + 0.55 * varPulse(now, 900);
  steps.forEach((x, i) => {
    const w = widths[i];
    rr(ctx, cx, cy, w, ch, ch * 0.18);
    if (x.on) {
      ctx.save();
      ctx.shadowColor = rgba(VAR_RED, 0.9);
      ctx.shadowBlur = 18 * s * blink;
      ctx.fillStyle = "#fff";
      ctx.fill();
      ctx.restore();
    } else {
      ctx.fillStyle = x.done ? rgba(VAR_RED, 0.55) : "rgba(255,255,255,0.06)";
      ctx.fill();
      ctx.strokeStyle = x.done ? rgba(VAR_RED, 0.9) : "rgba(255,255,255,0.22)";
      ctx.lineWidth = Math.max(1, 1.5 * s);
      ctx.stroke();
    }
    ctx.fillStyle = x.on ? rgba(VAR_RED, st.key === "decision" ? 1 : blink) : x.done ? "#fff" : "rgba(255,255,255,0.35)";
    ctx.beginPath();
    ctx.arc(cx + ch * 0.42, cy + ch / 2, ch * 0.13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = x.on ? RED_DEEP : x.done ? "#fff" : "rgba(255,255,255,0.5)";
    ctx.textAlign = "left";
    ctx.font = `900 ${fs}px ${FONT}`;
    ctx.fillText(x.label, cx + ch * 0.72, cy + ch * 0.55);
    cx += w;
    if (i < steps.length - 1) {
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.beginPath();
      const ax = cx + arrow * 0.32; const ay = cy + ch / 2;
      ctx.moveTo(ax, ay - ch * 0.14); ctx.lineTo(ax + arrow * 0.36, ay); ctx.lineTo(ax, ay + ch * 0.14); ctx.closePath(); ctx.fill();
      cx += arrow;
    }
  });
}

function footer(ctx, S) {
  const { L, st, now, s } = S;
  const f = L.footer;
  const g = ctx.createLinearGradient(0, f.y, 0, f.y + f.h);
  g.addColorStop(0, "#ff2b47");
  g.addColorStop(1, RED_DEEP);
  ctx.fillStyle = g;
  ctx.fillRect(f.x, f.y, f.w, f.h);
  ctx.save();
  ctx.beginPath(); ctx.rect(f.x, f.y, f.w, f.h); ctx.clip();
  ctx.fillStyle = "rgba(255,255,255,0.07)";
  const step = f.h * 0.7;
  const off = ((now / 18) * s) % step;
  for (let x = f.x - f.h + off; x < f.x + f.w; x += step) {
    ctx.beginPath(); ctx.moveTo(x, f.y + f.h); ctx.lineTo(x + f.h * 0.35, f.y + f.h); ctx.lineTo(x + f.h * 0.35 + f.h, f.y); ctx.lineTo(x + f.h, f.y); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fillRect(f.x, f.y, f.w, Math.max(1, 2 * s));

  const bh = f.h * 0.66;
  const bx = f.x + f.h * 0.22;
  const bw = badge(ctx, bx, f.y + (f.h - bh) / 2, bh, s);
  const x0 = bx + bw + f.h * 0.3;

  if (st.key === "decision") {
    const k = easeOut(S.decisionMs / 600);
    const pw = (f.x + f.w - f.h * 0.22 - x0) * (0.25 + 0.75 * k);
    const ph = f.h * 0.78;
    const py = f.y + (f.h - ph) / 2;
    ctx.save();
    ctx.globalAlpha = clamp01(k * 1.6);
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.shadowBlur = 16 * s;
    ctx.fillStyle = "#fff";
    ctx.fillRect(x0, py, pw, ph);
    ctx.shadowBlur = 0;
    ctx.beginPath(); ctx.rect(x0, py, pw, ph); ctx.clip();
    const kw = ph * 2.1;
    ctx.fillStyle = "#111";
    ctx.fillRect(x0, py, kw, ph);
    ctx.fillStyle = "#fff";
    ctx.font = `900 ${ph * 0.32}px ${FONT}`;
    spaced(ctx, ph * 0.05);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("KARAR", x0 + kw / 2, py + ph * 0.54);
    spaced(ctx, 0);
    ctx.fillStyle = RED_DEEP;
    ctx.font = `900 ${ph * 0.62}px ${FONT}`;
    spaced(ctx, ph * 0.03);
    const textX = x0 + kw + (pw - kw - ph * 1.2) / 2;
    ctx.fillText(st.text, textX, py + ph * 0.56, pw - kw - ph * 1.6);
    spaced(ctx, 0);
    verdictIcon(ctx, x0 + pw - ph * 0.62, py + ph / 2, ph * 0.34, S.positive, { bg: S.positive ? "#12a150" : RED_DEEP });
    ctx.restore();
    return;
  }
  ctx.fillStyle = "#fff";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.font = `900 ${f.h * 0.34}px ${FONT}`;
  spaced(ctx, f.h * 0.02);
  const dots = ".".repeat(1 + (Math.floor(now / 450) % 3));
  ctx.fillText(`${upper(st.text)}${dots}`, x0, f.y + f.h * 0.53, f.w * 0.55);
  spaced(ctx, 0);
  const bw2 = f.w * 0.26;
  const bx2 = f.x + f.w - bw2 - f.h * 0.3;
  const by = f.y + f.h / 2 - 5 * s;
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.fillRect(bx2, by, bw2, 10 * s);
  const segs = 12;
  const sw = bw2 / segs;
  const head = Math.floor((now / 90) % (segs * 2));
  for (let k2 = 0; k2 < segs; k2 += 1) {
    const d = Math.abs((head < segs ? head : segs * 2 - head - 1) - k2);
    ctx.fillStyle = `rgba(255,255,255,${Math.max(0.12, 1 - d * 0.28)})`;
    ctx.fillRect(bx2 + k2 * sw + 1 * s, by + 1 * s, sw - 2 * s, 8 * s);
  }
  ctx.font = `800 ${f.h * 0.17}px ${FONT}`;
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.textAlign = "right";
  spaced(ctx, f.h * 0.04);
  ctx.fillText(st.label, bx2 - f.h * 0.25, f.y + f.h * 0.53);
  spaced(ctx, 0);
}

export function chrome(ctx, S) {
  screenFrame(ctx, S);
  header(ctx, S);
  footer(ctx, S);
}
