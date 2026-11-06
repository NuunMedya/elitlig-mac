// VAR teması — STADYUM BROADCAST: premium TV-spor görünümü.
//
//   zemin      karbon fiber doku, lacivert ışık, yavaşça süzülen projektör huzmesi
//   pencereler ince metal çerçeve, altın L köşeler, eğik "AÇI n" + kamera sekmesi,
//              CANLI (kırmızı) / AĞIR ÇEKİM (altın) eğik etiket, çapraz parlama
//   üst bant   eğik altın VAR bloğu + lacivert ana bant (konu), ok biçimli
//              İNCELEME › KONTROL › KARAR adımları, zaman kodu kutusu, logo
//   alt bant   eğik kırmızı VAR bloğu + durum yazısı ve akan altın çubuklar;
//              KARAR'da altın silme geçişi, ardından renkli karar levhası + parlama
import { varPulse, varScan } from "../../../../lib/studio/var";
import { FONT, MONO, carbonPattern, clamp01, easeOut, rgba, skew, spaced, textW, upper, verdictIcon } from "../kit";

const NAVY = "#0b1630";
const NAVY2 = "#16295a";
const GOLD = "#f2b705";
const GOLD2 = "#ffd84d";
const RED = "#e3263a";
const GREEN = "#13a35a";

function goldGrad(ctx, y, h) {
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, GOLD2);
  g.addColorStop(0.55, GOLD);
  g.addColorStop(1, "#c98f00");
  return g;
}
function navyGrad(ctx, y, h) {
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, "#22397a");
  g.addColorStop(0.5, NAVY2);
  g.addColorStop(1, NAVY);
  return g;
}
/** Eğik banda üstten ince parlak çizgi + üst yarı ışık. */
function gloss(ctx, x, y, w, h, sk, a = 0.18) {
  ctx.save();
  skew(ctx, x, y, w, h, sk);
  ctx.clip();
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, `rgba(255,255,255,${a})`);
  g.addColorStop(0.5, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  ctx.restore();
}
/** Bant üzerinden geçen ışık süpürmesi (t 0…1). */
function sweep(ctx, x, y, w, h, sk, t, a = 0.45) {
  if (t <= 0 || t >= 1) return;
  ctx.save();
  skew(ctx, x, y, w, h, sk);
  ctx.clip();
  const cx = x - w * 0.2 + t * w * 1.4;
  const g = ctx.createLinearGradient(cx - h * 1.2, 0, cx + h * 1.2, 0);
  g.addColorStop(0, "rgba(255,255,255,0)");
  g.addColorStop(0.5, `rgba(255,255,255,${a})`);
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  ctx.restore();
}

export function background(ctx, S) {
  const { W, H, now, s, L } = S;
  ctx.fillStyle = "#070a12";
  ctx.fillRect(0, 0, W, H);
  const pat = carbonPattern(ctx, Math.max(3, 7 * s));
  if (pat) { ctx.save(); ctx.globalAlpha = 0.9; ctx.fillStyle = pat; ctx.fillRect(0, 0, W, H); ctx.restore(); }
  // lacivert ışık
  const g = ctx.createRadialGradient(W * 0.5, H * 0.42, 0, W * 0.5, H * 0.42, W * 0.7);
  g.addColorStop(0, "rgba(30,64,150,0.55)");
  g.addColorStop(0.6, "rgba(11,22,48,0.55)");
  g.addColorStop(1, "rgba(0,0,0,0.75)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // projektör huzmesi
  const t = (now % 9000) / 9000;
  ctx.save();
  ctx.translate(W * (-0.2 + t * 1.4), 0);
  ctx.rotate(0.35);
  const bg = ctx.createLinearGradient(-W * 0.08, 0, W * 0.08, 0);
  bg.addColorStop(0, "rgba(255,255,255,0)");
  bg.addColorStop(0.5, "rgba(170,200,255,0.07)");
  bg.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = bg;
  ctx.fillRect(-W * 0.08, -H, W * 0.16, H * 3);
  ctx.restore();
  // ince altın kenar çizgileri (üst / alt)
  ctx.fillStyle = rgba(GOLD, 0.85);
  ctx.fillRect(0, 0, W, Math.max(2, 4 * s));
  ctx.fillRect(0, H - Math.max(2, 4 * s), W, Math.max(2, 4 * s));
  // sahne: silik eğik VAR
  const sg = L.stage;
  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,0.025)";
  ctx.font = `italic 900 ${sg.h * 0.7}px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("VAR", sg.x + sg.w / 2, sg.y + sg.h * 0.55);
  ctx.restore();
  // pencerelerin gölgesi
  for (const p of S.panes) {
    const r = p.rect;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.65)";
    ctx.shadowBlur = 40 * s;
    ctx.shadowOffsetY = 12 * s;
    ctx.fillStyle = "#000";
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.restore();
  }
}

function skewTab(ctx, x, y, h, text, { bg, fg = "#fff", fs, sk, align = "left", font = FONT, weight = 900, italic = true }) {
  const f = `${italic ? "italic " : ""}${weight} ${fs}px ${font}`;
  const w = textW(ctx, text, f, fs * 0.06) + fs * 1.6 + sk;
  const x0 = align === "right" ? x - w : x;
  skew(ctx, x0, y, w, h, sk);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.font = f;
  spaced(ctx, fs * 0.06);
  ctx.fillStyle = fg;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x0 + w / 2, y + h * 0.54);
  spaced(ctx, 0);
  return w;
}

export function pane(ctx, S, p, info, i) {
  const { now, s, n } = S;
  const r = p.rect;
  if (!info) {
    ctx.save();
    const pat = carbonPattern(ctx, Math.max(3, 6 * s));
    ctx.fillStyle = pat || "#0d1220";
    ctx.fillRect(r.x, r.y, r.w, r.h);
    const g = ctx.createRadialGradient(r.x + r.w / 2, r.y + r.h / 2, 0, r.x + r.w / 2, r.y + r.h / 2, r.w * 0.6);
    g.addColorStop(0, "rgba(34,57,122,0.6)");
    g.addColorStop(1, "rgba(0,0,0,0.6)");
    ctx.fillStyle = g;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = rgba(GOLD, 0.9);
    ctx.font = `italic 900 ${Math.min(r.h * 0.22, r.w * 0.1)}px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("VAR", r.x + r.w / 2, r.y + r.h * 0.46);
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.font = `800 ${Math.max(9, r.h * 0.042)}px ${FONT}`;
    spaced(ctx, r.h * 0.01);
    ctx.fillText("AÇI SEÇİLMEDİ", r.x + r.w / 2, r.y + r.h * 0.62);
    spaced(ctx, 0);
    ctx.restore();
  }
  // çapraz parlama (tarama)
  if (n.scan) {
    ctx.save();
    ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
    const t = varScan(now + i * 900, 4200);
    const cx = r.x - r.w * 0.3 + t * r.w * 1.6;
    ctx.translate(cx, r.y + r.h / 2);
    ctx.rotate(0.45);
    const g = ctx.createLinearGradient(-r.w * 0.06, 0, r.w * 0.06, 0);
    g.addColorStop(0, "rgba(255,255,255,0)");
    g.addColorStop(0.5, "rgba(255,255,255,0.14)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(-r.w * 0.06, -r.h * 1.5, r.w * 0.12, r.h * 3);
    ctx.restore();
    // alt kenar ince altın tarama çubuğu
    ctx.fillStyle = rgba(GOLD, 0.8);
    ctx.fillRect(r.x, r.y + r.h - Math.max(2, 3 * s), r.w * varScan(now + i * 500, 2600), Math.max(2, 3 * s));
  }
  // metal çerçeve
  const lw = Math.max(2, (p.big ? 5 : 4) * s);
  ctx.save();
  ctx.strokeStyle = NAVY;
  ctx.lineWidth = lw * 2;
  ctx.strokeRect(r.x - lw, r.y - lw, r.w + lw * 2, r.h + lw * 2);
  const mg = ctx.createLinearGradient(r.x, r.y, r.x + r.w, r.y + r.h);
  mg.addColorStop(0, "#e9eef7");
  mg.addColorStop(0.5, "#7b8aa8");
  mg.addColorStop(1, "#dfe6f2");
  ctx.strokeStyle = mg;
  ctx.lineWidth = Math.max(1, lw * 0.45);
  ctx.strokeRect(r.x - lw * 0.3, r.y - lw * 0.3, r.w + lw * 0.6, r.h + lw * 0.6);
  ctx.restore();
  // altın L köşeler (sol üst, sağ alt)
  const cl = Math.min(r.w, r.h) * (p.big ? 0.14 : 0.16);
  const ct = Math.max(3, (p.big ? 8 : 6) * s);
  const o = lw * 1.6;
  ctx.fillStyle = goldGrad(ctx, r.y - o, ct);
  ctx.fillRect(r.x - o, r.y - o, cl, ct); ctx.fillRect(r.x - o, r.y - o, ct, cl);
  ctx.fillStyle = goldGrad(ctx, r.y + r.h + o - ct, ct);
  ctx.fillRect(r.x + r.w + o - cl, r.y + r.h + o - ct, cl, ct); ctx.fillRect(r.x + r.w + o - ct, r.y + r.h + o - cl, ct, cl);
  // sekmeler (pencerenin üst kenarına oturan eğik bloklar)
  const fs = Math.max(8, (p.big ? 21 : 16) * s);
  const th = fs * 1.75;
  const sk = th * 0.36;
  const ty = r.y + Math.max(4, 12 * s);
  const tx = r.x + Math.max(4, 12 * s);
  const w1 = skewTab(ctx, tx, ty, th, `AÇI ${i + 1}`, { bg: goldGrad(ctx, ty, th), fg: NAVY, fs, sk });
  if (info?.label) skewTab(ctx, tx + w1 - sk * 0.55, ty, th, upper(info.label), { bg: rgba(NAVY, 0.9), fs: fs * 0.82, sk, weight: 800 });
  const rx = r.x + r.w - Math.max(4, 12 * s);
  if (info?.live) {
    const wl = skewTab(ctx, rx, ty, th, "     CANLI", { bg: RED, fs: fs * 0.82, sk, align: "right" });
    ctx.fillStyle = `rgba(255,255,255,${0.45 + 0.55 * varPulse(now, 900)})`;
    ctx.beginPath(); ctx.arc(rx - wl + sk * 0.5 + fs * 1.0, ty + th / 2, fs * 0.26, 0, Math.PI * 2); ctx.fill();
  } else if (info?.rate && info.rate < 1) {
    skewTab(ctx, rx, ty, th, `${String(info.rate).replace(".", ",")}× AĞIR ÇEKİM`, { bg: rgba(NAVY, 0.92), fg: GOLD, fs: fs * 0.82, sk, align: "right" });
  }
}

function header(ctx, S) {
  const { L, n, now, s, logo } = S;
  const hb = L.header;
  const h = hb.h;
  const sk = h * 0.32;
  // gölge
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.6)";
  ctx.shadowBlur = 24 * s;
  ctx.shadowOffsetY = 8 * s;
  skew(ctx, hb.x, hb.y, hb.w, h, sk);
  ctx.fillStyle = navyGrad(ctx, hb.y, h);
  ctx.fill();
  ctx.restore();
  gloss(ctx, hb.x, hb.y, hb.w, h, sk, 0.14);
  // alt altın çizgi
  ctx.fillStyle = GOLD;
  ctx.fillRect(hb.x + sk * 0.1, hb.y + h - Math.max(2, 4 * s), hb.w - sk * 1.1, Math.max(2, 4 * s));
  // VAR bloğu (altın, eğik)
  const vw = h * 2.5;
  skew(ctx, hb.x, hb.y, vw, h, sk);
  ctx.fillStyle = goldGrad(ctx, hb.y, h);
  ctx.fill();
  gloss(ctx, hb.x, hb.y, vw, h, sk, 0.35);
  sweep(ctx, hb.x, hb.y, vw, h, sk, ((now % 5200) / 5200) * 1.6 - 0.3, 0.55);
  ctx.fillStyle = NAVY;
  ctx.font = `italic 900 ${h * 0.62}px ${FONT}`;
  spaced(ctx, h * 0.02);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("VAR", hb.x + vw / 2 + sk * 0.1, hb.y + h * 0.55);
  spaced(ctx, 0);
  // kırmızı ayraç şeridi
  skew(ctx, hb.x + vw - sk * 0.35, hb.y, sk * 0.9, h, sk);
  ctx.fillStyle = RED;
  ctx.fill();
  // başlıklar
  const tx = hb.x + vw + sk * 0.9;
  ctx.textAlign = "left";
  ctx.fillStyle = GOLD;
  ctx.font = `800 ${h * 0.17}px ${FONT}`;
  spaced(ctx, h * 0.07);
  ctx.fillText("VİDEO YARDIMCI HAKEM", tx, hb.y + h * 0.28);
  spaced(ctx, 0);
  ctx.fillStyle = "#fff";
  ctx.font = `italic 900 ${h * 0.4}px ${FONT}`;
  ctx.fillText(S.topic, tx, hb.y + h * 0.64, hb.w * 0.3);

  // sağdan sola: logo, zaman kodu, adımlar
  let rx = hb.x + hb.w - sk - h * 0.2;
  if (logo?.naturalWidth) {
    const lh = h * 0.56;
    const lw = Math.min(h * 2.2, (logo.naturalWidth / logo.naturalHeight) * lh);
    try { ctx.drawImage(logo, rx - lw, hb.y + (h - lh) / 2, lw, lh); } catch { /* yoksay */ }
    rx -= lw + h * 0.35;
  }
  if (n.timecode) {
    ctx.font = `700 ${h * 0.3}px ${MONO}`;
    const tw = ctx.measureText(S.tc).width + h * 0.5;
    const bh = h * 0.56;
    const by = hb.y + (h - bh) / 2;
    skew(ctx, rx - tw, by, tw, bh, bh * 0.3);
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fill();
    ctx.strokeStyle = rgba(GOLD, 0.6);
    ctx.lineWidth = Math.max(1, 1.5 * s);
    ctx.stroke();
    ctx.fillStyle = GOLD2;
    ctx.textAlign = "center";
    ctx.fillText(S.tc, rx - tw / 2, by + bh * 0.55);
    rx -= tw + h * 0.3;
  }
  // ok biçimli adımlar
  const steps = S.steps;
  const ch = h * 0.56;
  const cy = hb.y + (h - ch) / 2;
  const fs = h * 0.22;
  const font = `italic 900 ${fs}px ${FONT}`;
  const pt = ch * 0.38;
  const widths = steps.map((x) => textW(ctx, x.label, font, fs * 0.05) + ch * 1.0 + pt);
  let cx = rx - widths.reduce((a, b) => a + b, 0) + pt * (steps.length - 1) * 0.6;
  const blink = 0.5 + 0.5 * varPulse(now, 1000);
  steps.forEach((x, i) => {
    const w = widths[i];
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + w - pt, cy);
    ctx.lineTo(cx + w, cy + ch / 2);
    ctx.lineTo(cx + w - pt, cy + ch);
    ctx.lineTo(cx, cy + ch);
    if (i > 0) ctx.lineTo(cx + pt, cy + ch / 2);
    ctx.closePath();
    if (x.on) {
      ctx.save();
      ctx.shadowColor = rgba(GOLD, 0.8);
      ctx.shadowBlur = 16 * s * blink;
      ctx.fillStyle = goldGrad(ctx, cy, ch);
      ctx.fill();
      ctx.restore();
    } else {
      ctx.fillStyle = x.done ? rgba(RED, 0.9) : "rgba(255,255,255,0.07)";
      ctx.fill();
      ctx.strokeStyle = x.done ? rgba("#ff8090", 0.8) : "rgba(255,255,255,0.22)";
      ctx.lineWidth = Math.max(1, 1.2 * s);
      ctx.stroke();
    }
    ctx.font = font;
    spaced(ctx, fs * 0.05);
    ctx.fillStyle = x.on ? NAVY : x.done ? "#fff" : "rgba(255,255,255,0.55)";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(x.done ? `✓ ${x.label}` : x.label, cx + (i > 0 ? pt : 0) / 2 + (w - pt) / 2 + pt * 0.2, cy + ch * 0.55);
    spaced(ctx, 0);
    cx += w - pt * 0.6;
  });
}

function footer(ctx, S) {
  const { L, st, now, s } = S;
  const f = L.footer;
  const h = f.h;
  const sk = h * 0.32;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.6)";
  ctx.shadowBlur = 24 * s;
  ctx.shadowOffsetY = 8 * s;
  skew(ctx, f.x, f.y, f.w, h, sk);
  ctx.fillStyle = navyGrad(ctx, f.y, h);
  ctx.fill();
  ctx.restore();
  gloss(ctx, f.x, f.y, f.w, h, sk, 0.12);
  ctx.fillStyle = GOLD;
  ctx.fillRect(f.x + sk, f.y, f.w - sk * 1.1, Math.max(2, 3 * s));
  // kırmızı VAR bloğu
  const vw = h * 2.2;
  skew(ctx, f.x, f.y, vw, h, sk);
  const rg = ctx.createLinearGradient(0, f.y, 0, f.y + h);
  rg.addColorStop(0, "#ff4a5c");
  rg.addColorStop(1, "#a50f20");
  ctx.fillStyle = rg;
  ctx.fill();
  gloss(ctx, f.x, f.y, vw, h, sk, 0.3);
  ctx.fillStyle = "#fff";
  ctx.font = `italic 900 ${h * 0.5}px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("VAR", f.x + vw / 2, f.y + h * 0.55);
  const x0 = f.x + vw + sk * 0.4;
  const x1 = f.x + f.w - sk;

  if (st.key === "decision") {
    const t = S.decisionMs;
    const wipe = easeOut(t / 420);
    const reveal = easeOut((t - 260) / 520);
    const pos = S.positive;
    const tone = pos ? GREEN : RED;
    // altın silme
    if (wipe < 1 || reveal < 1) {
      const ww = (x1 - x0 + sk) * wipe;
      skew(ctx, x0 - sk * 0.4, f.y, ww, h, sk);
      ctx.fillStyle = goldGrad(ctx, f.y, h);
      ctx.globalAlpha = 1 - clamp01(reveal);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (reveal > 0) {
      const pw = (x1 - x0 + sk) * reveal;
      skew(ctx, x0 - sk * 0.4, f.y, pw, h, sk);
      const dg = ctx.createLinearGradient(0, f.y, 0, f.y + h);
      dg.addColorStop(0, pos ? "#1fd17a" : "#ff4a5c");
      dg.addColorStop(1, pos ? "#0b6e3b" : "#8f0b19");
      ctx.fillStyle = dg;
      ctx.fill();
      ctx.save();
      skew(ctx, x0 - sk * 0.4, f.y, pw, h, sk);
      ctx.clip();
      // KARAR altın bloğu
      const kw = h * 2.3;
      skew(ctx, x0 - sk * 0.4, f.y, kw, h, sk);
      ctx.fillStyle = goldGrad(ctx, f.y, h);
      ctx.fill();
      ctx.fillStyle = NAVY;
      ctx.font = `italic 900 ${h * 0.3}px ${FONT}`;
      spaced(ctx, h * 0.05);
      ctx.textAlign = "center";
      ctx.fillText("KARAR", x0 - sk * 0.4 + kw / 2, f.y + h * 0.55);
      spaced(ctx, 0);
      // karar metni
      ctx.fillStyle = "#fff";
      ctx.shadowColor = "rgba(0,0,0,0.45)";
      ctx.shadowBlur = 10 * s;
      ctx.shadowOffsetY = 3 * s;
      ctx.font = `italic 900 ${h * 0.6}px ${FONT}`;
      spaced(ctx, h * 0.03);
      const avail = x1 - (x0 + kw) - h * 1.4;
      ctx.fillText(st.text, x0 + kw + avail / 2, f.y + h * 0.56, avail);
      spaced(ctx, 0);
      ctx.restore();
      verdictIcon(ctx, x1 - h * 0.62, f.y + h / 2, h * 0.32, pos, { bg: "#fff", fg: tone });
      sweep(ctx, x0 - sk * 0.4, f.y, x1 - x0 + sk, h, sk, (t - 700) / 900, 0.5);
    }
    return;
  }
  ctx.fillStyle = "#fff";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.font = `italic 900 ${h * 0.36}px ${FONT}`;
  spaced(ctx, h * 0.02);
  const dots = ".".repeat(1 + (Math.floor(now / 450) % 3));
  ctx.fillText(`${upper(st.text)}${dots}`, x0 + h * 0.2, f.y + h * 0.55, f.w * 0.5);
  spaced(ctx, 0);
  // akan altın çubuklar
  const bw = f.w * 0.24;
  const bx = x1 - bw;
  const bars = 16;
  const gap = bw / bars;
  for (let k = 0; k < bars; k += 1) {
    const a = 0.5 + 0.5 * Math.sin(now / 160 - k * 0.55);
    const bh2 = h * (0.18 + 0.38 * a);
    ctx.fillStyle = rgba(GOLD, 0.35 + 0.65 * a);
    skew(ctx, bx + k * gap, f.y + (h - bh2) / 2, gap * 0.62, bh2, gap * 0.2);
    ctx.fill();
  }
  ctx.font = `italic 800 ${h * 0.18}px ${FONT}`;
  ctx.fillStyle = GOLD;
  ctx.textAlign = "right";
  spaced(ctx, h * 0.05);
  ctx.fillText(st.label, bx - h * 0.3, f.y + h * 0.55);
  spaced(ctx, 0);
}

export function chrome(ctx, S) {
  const { W, H, s, flash } = S;
  // köşe vurguları (sol üst, sağ alt)
  ctx.fillStyle = GOLD;
  const t = 70 * s;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(t, 0); ctx.lineTo(0, t); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(W, H); ctx.lineTo(W - t, H); ctx.lineTo(W, H - t); ctx.closePath(); ctx.fill();
  header(ctx, S);
  footer(ctx, S);
  if (flash > 0) { ctx.fillStyle = `rgba(255,240,200,${0.4 * flash})`; ctx.fillRect(0, 0, W, H); }
}
