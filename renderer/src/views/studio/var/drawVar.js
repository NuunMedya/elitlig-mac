// Yayın Stüdyosu — VAR sahnesi (kırmızı ÇERÇEVE tasarımı, dikkat çekici).
//
//   zemin      çok koyu kırmızı-siyah, merkez kızıl ışık, çapraz doku, kenar karartması
//   çerçeve    tüm ekranı saran nabızlı kırmızı kenarlık (parlama), köşelerde beyaz
//              ayraçlar, sol / sağ raylarda dikey "VAR · VİDEO YARDIMCI HAKEM" ve çentikler
//   üst bant   "VAR" rozeti (ekran simgeli logo), "VİDEO YARDIMCI HAKEM" + konu,
//              İNCELEME › KONTROL › KARAR adımları (etkin olan yanıp söner), zaman kodu, marka logosu
//   pencereler tek / ikili / üçlü; HER açı kırmızı çerçeveli (nabızlı parlama),
//              beyaz köşe ayraçları, "AÇI n" sekmesi + kaynak / açı adı, ağır çekim / CANLI,
//              taranan ışık çizgisi
//   alt bant   raydan raya kırmızı bant: incelemede "POZİSYON İNCELENİYOR…" + tarayan çubuk;
//              KARAR'da beyaz karar levhası kayarak açılır (GOL / GOL İPTAL / PENALTI …, ✓ / ✕)
import { varDecisionPositive, varLayout, varLayoutV2, varPulse, varScan, varStatus, varSteps, varTimecode, normalizeVarV2, varLayoutOf } from "../../../lib/studio/var";
import { drawSource, drawVideoIn } from "../draw";

const FONT = "\"Archivo\", -apple-system, \"Helvetica Neue\", Arial, sans-serif";
const MONO = "\"SF Mono\", \"JetBrains Mono\", Menlo, Consolas, monospace";
export const VAR_RED = "#ff1f3d";
const RED_DEEP = "#b00020";
const RED_DARK = "#2a0208";

const rgba = (hex, a) => {
  const h = String(hex || "#ffffff").replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((x) => x + x).join("") : h, 16) || 0;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};
function rr(ctx, x, y, w, h, r) {
  const q = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + q, y);
  ctx.arcTo(x + w, y, x + w, y + h, q);
  ctx.arcTo(x + w, y + h, x, y + h, q);
  ctx.arcTo(x, y + h, x, y, q);
  ctx.arcTo(x, y, x + w, y, q);
  ctx.closePath();
}
const clamp01 = (t) => Math.min(1, Math.max(0, t));
const easeOut = (t) => 1 - (1 - clamp01(t)) ** 3;
const spaced = (ctx, px) => { try { ctx.letterSpacing = `${px}px`; } catch { /* eski tarayıcı */ } };

function background(ctx, W, H, now) {
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
}

/** Nabızlı kırmızı kenarlık (parlamalı). */
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

/** Beyaz köşe ayraçları (dışa taşan). */
function brackets(ctx, r, len, lw, color, out = 0) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.lineCap = "square";
  ctx.beginPath();
  const x0 = r.x - out; const y0 = r.y - out; const x1 = r.x + r.w + out; const y1 = r.y + r.h + out;
  for (const [x, y, dx, dy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]]) {
    ctx.moveTo(x, y + dy * len); ctx.lineTo(x, y); ctx.lineTo(x + dx * len, y);
  }
  ctx.stroke();
  ctx.restore();
}

/** Ekranı saran çerçeve: raylar (dikey yazı, çentikler), kenarlık, köşeler. */
function screenFrame(ctx, W, H, L, now, s, flash) {
  const pulse = varPulse(now, 1400);
  // Raylar
  L.rails.forEach((r, i) => {
    const g = ctx.createLinearGradient(r.x, 0, r.x + r.w, 0);
    g.addColorStop(i ? 1 : 0, rgba(RED_DARK, 0.96));
    g.addColorStop(i ? 0 : 1, rgba("#120104", 0.9));
    ctx.fillStyle = g;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    // iç kenarda ince kırmızı çizgi
    ctx.fillStyle = rgba(VAR_RED, 0.75);
    ctx.fillRect(i ? r.x : r.x + r.w - Math.max(1, 2 * s), r.y, Math.max(1, 2 * s), r.h);
    // çentikler (yukarı akan)
    const tick = 26 * s;
    const off = ((now / 30) * s) % tick;
    ctx.fillStyle = rgba("#ff8a99", 0.28);
    for (let y = r.y + r.h - off; y > r.y; y -= tick) ctx.fillRect(r.x + r.w * 0.3, y, r.w * 0.4, Math.max(1, 2 * s));
    // dikey yazı
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
  // Ekran kenarlığı
  glowRect(ctx, L.frame, Math.max(3, 7 * s), pulse, s);
  brackets(ctx, L.frame, 110 * s, Math.max(3, 9 * s), "#ffffff", -1 * s);
  // köşe üçgenleri
  ctx.fillStyle = VAR_RED;
  const t = 34 * s;
  for (const [x, y, dx, dy] of [[0, 0, 1, 1], [W, 0, -1, 1], [0, H, 1, -1], [W, H, -1, -1]]) {
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + dx * t, y); ctx.lineTo(x, y + dy * t); ctx.closePath(); ctx.fill();
  }
  if (flash > 0) { ctx.fillStyle = `rgba(255,255,255,${0.35 * flash})`; ctx.fillRect(0, 0, W, H); }
}

/** "VAR" rozeti: ekran simgesi içinde VAR yazısı (logo). → genişlik. */
export function drawVarBadge(ctx, x, y, h, s = 1) {
  const w = h * 2.15;
  rr(ctx, x, y, w, h, h * 0.16);
  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, "#ff3552");
  g.addColorStop(1, RED_DEEP);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = Math.max(1.5, 2.5 * s);
  ctx.stroke();
  // ekran simgesi
  const sx = x + h * 0.14; const sy = y + h * 0.14; const sw = w - h * 0.28; const sh = h * 0.58;
  rr(ctx, sx, sy, sw, sh, h * 0.07);
  ctx.lineWidth = Math.max(2, h * 0.055);
  ctx.strokeStyle = "#fff";
  ctx.stroke();
  ctx.fillStyle = "#fff";
  ctx.fillRect(x + w / 2 - h * 0.05, sy + sh, h * 0.1, h * 0.09);
  ctx.fillRect(x + w / 2 - h * 0.22, sy + sh + h * 0.08, h * 0.44, h * 0.055);
  ctx.font = `900 ${h * 0.4}px ${FONT}`;
  spaced(ctx, h * 0.03);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("VAR", sx + sw / 2, sy + sh * 0.55);
  spaced(ctx, 0);
  return w;
}

function header(ctx, L, n, st, now, tcMs, logo, s) {
  const hb = L.header;
  // bant
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
  // rozet
  const bh = hb.h * 0.78;
  const bx = hb.x + hb.h * 0.18;
  const bw = drawVarBadge(ctx, bx, hb.y + (hb.h - bh) / 2 - 1 * s, bh, s);
  // başlıklar
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
  ctx.fillText(String(n.topic || n.title || "VAR KONTROLÜ").toLocaleUpperCase("tr-TR"), tx, hb.y + hb.h * 0.66, hb.w * 0.32);

  // sağdan sola: logo, zaman kodu, durum adımları
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
    const tc = varTimecode(tcMs);
    ctx.fillText(tc, rx, hb.y + hb.h * 0.54);
    const tw = ctx.measureText(tc).width;
    ctx.fillStyle = "#ff8a99";
    ctx.font = `800 ${hb.h * 0.16}px ${FONT}`;
    ctx.fillText("TC", rx - tw - hb.h * 0.14, hb.y + hb.h * 0.54);
    rx -= tw + hb.h * 0.62;
  }
  // adımlar
  const steps = varSteps(n.state);
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
    // nokta
    ctx.fillStyle = x.on ? rgba(VAR_RED, st.key === "decision" ? 1 : blink) : x.done ? "#fff" : "rgba(255,255,255,0.35)";
    ctx.beginPath();
    ctx.arc(cx + ch * 0.42, cy + ch / 2, ch * 0.13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = x.on ? RED_DEEP : x.done ? "#fff" : "rgba(255,255,255,0.5)";
    ctx.textAlign = "left";
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

/** Sekme (pencerenin üst kenarına yapışık). → genişlik. */
function tab(ctx, x, y, text, fs, bg, fg = "#fff", align = "left") {
  ctx.font = `900 ${fs}px ${FONT}`;
  spaced(ctx, fs * 0.06);
  const w = ctx.measureText(text).width + fs * 1.3;
  const h = fs * 1.85;
  const x0 = align === "right" ? x - w : x;
  ctx.fillStyle = bg;
  ctx.fillRect(x0, y, w, h);
  ctx.fillStyle = fg;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x0 + fs * 0.62, y + h * 0.54);
  spaced(ctx, 0);
  return w;
}

function pane(ctx, pane, i, n, info, now, s) {
  const r = pane.rect;
  const pulse = varPulse(now + i * 233, 1400);
  // içerik
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
    drawVarBadge(ctx, r.x + r.w / 2 - bh * 1.075, r.y + r.h / 2 - bh * 0.75, bh, s);
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
  // tarama çizgisi + kırmızı iç gölge
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
  // çerçeve
  const lw = Math.max(3, (pane.big ? 7 : 5) * s);
  glowRect(ctx, { x: r.x - lw / 2, y: r.y - lw / 2, w: r.w + lw, h: r.h + lw }, lw, pulse, s);
  brackets(ctx, r, Math.min(r.w, r.h) * 0.09, Math.max(2, (pane.big ? 6 : 4.5) * s), "#ffffff", lw + 4 * s);
  // sekmeler
  const fs = Math.max(8, (pane.big ? 20 : 15) * s);
  const w1 = tab(ctx, r.x, r.y, `AÇI ${i + 1}`, fs, VAR_RED);
  if (info?.label) tab(ctx, r.x + w1, r.y, String(info.label).toLocaleUpperCase("tr-TR"), fs * 0.92, "rgba(0,0,0,0.72)");
  if (info?.live) {
    const wl = tab(ctx, r.x + r.w, r.y, "    CANLI", fs * 0.92, "rgba(0,0,0,0.72)", "#fff", "right");
    ctx.fillStyle = rgba(VAR_RED, 0.5 + 0.5 * varPulse(now, 900));
    ctx.beginPath(); ctx.arc(r.x + r.w - wl + fs * 0.95, r.y + fs * 0.88, fs * 0.3, 0, Math.PI * 2); ctx.fill();
  } else if (info?.rate && info.rate < 1) {
    tab(ctx, r.x + r.w, r.y, `${String(info.rate).replace(".", ",")}× AĞIR ÇEKİM`, fs * 0.92, "rgba(0,0,0,0.72)", "#fff", "right");
  }
}

function footer(ctx, L, st, v, now, s) {
  const f = L.footer;
  // kırmızı bant
  const g = ctx.createLinearGradient(0, f.y, 0, f.y + f.h);
  g.addColorStop(0, "#ff2b47");
  g.addColorStop(1, RED_DEEP);
  ctx.fillStyle = g;
  ctx.fillRect(f.x, f.y, f.w, f.h);
  // akan çapraz çizgiler
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

  // sol: küçük VAR rozeti
  const bh = f.h * 0.66;
  const bx = f.x + f.h * 0.22;
  const bw = drawVarBadge(ctx, bx, f.y + (f.h - bh) / 2, bh, s);
  const x0 = bx + bw + f.h * 0.3;

  if (st.key === "decision") {
    const k = easeOut((now - (v?.decisionAt || 0)) / 600);
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
    // KARAR bloğu
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
    // karar metni
    const pos = varDecisionPositive(st.decision?.key);
    ctx.fillStyle = RED_DEEP;
    ctx.font = `900 ${ph * 0.62}px ${FONT}`;
    spaced(ctx, ph * 0.03);
    const textX = x0 + kw + (pw - kw - ph * 1.2) / 2;
    ctx.fillText(st.text, textX, py + ph * 0.56, pw - kw - ph * 1.6);
    spaced(ctx, 0);
    // simge (✓ / ✕)
    const ix = x0 + pw - ph * 0.62; const iy = py + ph / 2; const ir = ph * 0.34;
    ctx.fillStyle = pos ? "#12a150" : RED_DEEP;
    ctx.beginPath(); ctx.arc(ix, iy, ir, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = Math.max(2, ir * 0.24);
    ctx.lineCap = "round";
    ctx.beginPath();
    if (pos) { ctx.moveTo(ix - ir * 0.45, iy + ir * 0.02); ctx.lineTo(ix - ir * 0.1, iy + ir * 0.36); ctx.lineTo(ix + ir * 0.48, iy - ir * 0.34); }
    else { ctx.moveTo(ix - ir * 0.38, iy - ir * 0.38); ctx.lineTo(ix + ir * 0.38, iy + ir * 0.38); ctx.moveTo(ix + ir * 0.38, iy - ir * 0.38); ctx.lineTo(ix - ir * 0.38, iy + ir * 0.38); }
    ctx.stroke();
    ctx.restore();
    return;
  }
  // inceleme / kontrol
  ctx.fillStyle = "#fff";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.font = `900 ${f.h * 0.34}px ${FONT}`;
  spaced(ctx, f.h * 0.02);
  const dots = ".".repeat(1 + (Math.floor(now / 450) % 3));
  ctx.fillText(`${String(st.text || "").toLocaleUpperCase("tr-TR")}${dots}`, x0, f.y + f.h * 0.53, f.w * 0.55);
  spaced(ctx, 0);
  // tarayan çubuk (sağda)
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

/**
 * VAR sahnesi.
 * v:      VAR ayarları (normalizeVarV2) + { decisionAt, startedAt }
 * paint:  (ctx, slot, rect, index) → { label, rate, timeMs, live } | null   pencere içeriğini çizer
 * brand:  { logo, branding }
 */
export function drawVarScene(ctx, W, H, now, v, paint, brand) {
  const n = normalizeVarV2(v);
  const L = varLayoutV2(n.layout, W, H);
  const st = varStatus(n);
  const s = W / 1920;
  background(ctx, W, H, now);
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

  let tcMs = null;
  const count = varLayoutOf(n.layout).count;
  L.panes.slice(0, count).forEach((p, i) => {
    const r = p.rect;
    ctx.fillStyle = "#000";
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.save();
    ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
    const info = paint?.(ctx, n.slots[i], r, i) || null;
    ctx.restore();
    if (info && tcMs == null && info.timeMs != null) tcMs = info.timeMs;
    pane(ctx, p, i, n, info, now, s);
  });

  const flash = st.key === "decision" ? 1 - clamp01((now - (v?.decisionAt || 0)) / 350) : 0;
  screenFrame(ctx, W, H, L, now, s, flash);
  header(ctx, L, n, st, now, tcMs ?? Math.max(0, now - (v?.startedAt || 0)), brand?.logo, s);
  footer(ctx, L, st, v, now, s);
  return L;
}

/**
 * ESKİ çizim (Studio'nun eski karıştırıcısı varRef ile çağırır): v1 ayarlarını
 * yeni tasarıma çevirir. v: { mode, title, subtitle, source, sourceRt, video, rate }.
 */
export function drawVar(ctx, W, H, now, v, brand) {
  const mode = varLayout(v?.mode, W, H).mode;
  const slots = mode === "both" ? [{ kind: "source" }, { kind: "replay" }] : mode === "source" ? [{ kind: "source" }] : mode === "replay" ? [{ kind: "replay" }] : [];
  const paint = (c, slot, r) => {
    if (slot?.kind === "source" && v.source) { drawSource(c, v.source, v.sourceRt, r, "cover", { placeholders: true }); return { label: v.source.name, live: true }; }
    if (slot?.kind === "replay" && drawVideoIn(c, v.video, r, "cover")) return { label: "TEKRAR", rate: v.rate, timeMs: (v.video.currentTime || 0) * 1000 };
    return null;
  };
  return drawVarScene(ctx, W, H, now, { layout: slots.length === 2 ? "two" : "single", slots, topic: v?.title, subtitle: v?.subtitle, state: "review" }, paint, brand);
}
