// VAR teması — KLASİK TV: kalın beyaz / siyah / kırmızı, dama desenli hakem şeridi.
//
//   zemin      koyu gri stüdyo zemini, yan raylarda akan siyah-beyaz dama şeridi
//   pencereler kalın beyaz çerçeve + siyah dış çizgi + sert gölge; beyaz "AÇI n"
//              kutusu + kırmızı kamera kutusu, kırmızı CANLI / siyah AĞIR ÇEKİM
//   üst bant   beyaz bant: kırmızı VAR kutusu (dama kenarlı), siyah konu yazısı,
//              kutu adımlar İNCELEME › KONTROL › KARAR, siyah zaman kodu kutusu, logo
//   alt bant   siyah bant + akan dama şeridi; KARAR'da beyaz levha dikey açılır
//              (sekme), dama kenarlar, kırmızı / yeşil kalın karar yazısı
import { varPulse, varScan } from "../../../../lib/studio/var";
import { FONT, MONO, checkerPattern, checkerStrip, clamp01, easeBack, easeOut, spaced, textW, upper, verdictIcon } from "../kit";

const RED = "#d90429";
const BLACK = "#111111";
const GREEN = "#0a8f3c";

function shadowBox(ctx, x, y, w, h, s, fill) {
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(x + 6 * s, y + 6 * s, w, h);
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w, h);
}
function box(ctx, x, y, text, fs, bg, fg, { align = "left", h = fs * 1.8, font = FONT, weight = 900, sp = 0.06 } = {}) {
  const f = `${weight} ${fs}px ${font}`;
  const w = textW(ctx, text, f, fs * sp) + fs * 1.2;
  const x0 = align === "right" ? x - w : x;
  ctx.fillStyle = bg;
  ctx.fillRect(x0, y, w, h);
  ctx.font = f;
  spaced(ctx, fs * sp);
  ctx.fillStyle = fg;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x0 + fs * 0.6, y + h * 0.54);
  spaced(ctx, 0);
  return w;
}

export function background(ctx, S) {
  const { W, H, now, s, L } = S;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#2a2a2a");
  g.addColorStop(1, "#141414");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // ince yatay çizgiler (eski TV dokusu)
  ctx.fillStyle = "rgba(255,255,255,0.025)";
  for (let y = 0; y < H; y += Math.max(3, 6 * s)) ctx.fillRect(0, y, W, Math.max(1, s));
  // raylar: akan dama
  const cell = Math.max(4, L.rails[0]?.w ? L.rails[0].w / 2 : 12 * s);
  L.rails.forEach((r, i) => {
    ctx.save();
    ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
    const pat = checkerPattern(ctx, cell, "#ffffff", BLACK);
    const off = ((now / 40) * s) % (cell * 2);
    if (pat) {
      ctx.translate(0, i ? -off : off);
      ctx.fillStyle = pat;
      ctx.fillRect(r.x - cell * 2, r.y - cell * 4, r.w + cell * 4, r.h + cell * 8);
    } else checkerStrip(ctx, r.x, r.y, r.w, r.h, cell);
    ctx.restore();
    ctx.fillStyle = RED;
    ctx.fillRect(i ? r.x - Math.max(2, 4 * s) : r.x + r.w, r.y, Math.max(2, 4 * s), r.h);
  });
  // sahne: silik büyük VAR
  const sg = L.stage;
  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,0.03)";
  ctx.font = `900 ${sg.h * 0.66}px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("VAR", sg.x + sg.w / 2, sg.y + sg.h * 0.55);
  ctx.restore();
  for (const p of S.panes) {
    const r = p.rect;
    const bw = Math.max(3, (p.big ? 8 : 6) * s);
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(r.x - bw + 10 * s, r.y - bw + 10 * s, r.w + bw * 2, r.h + bw * 2);
  }
}

export function pane(ctx, S, p, info, i) {
  const { now, s, n } = S;
  const r = p.rect;
  if (!info) {
    ctx.fillStyle = "#1e1e1e";
    ctx.fillRect(r.x, r.y, r.w, r.h);
    const cell = Math.max(4, r.h / 18);
    ctx.save();
    ctx.globalAlpha = 0.08;
    checkerStrip(ctx, r.x, r.y, r.w, r.h, cell);
    ctx.restore();
    const bh = Math.min(r.h * 0.22, r.w * 0.1);
    const bw = bh * 2.2;
    ctx.fillStyle = RED;
    ctx.fillRect(r.x + r.w / 2 - bw / 2, r.y + r.h * 0.42 - bh / 2, bw, bh);
    ctx.fillStyle = "#fff";
    ctx.font = `900 ${bh * 0.7}px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("VAR", r.x + r.w / 2, r.y + r.h * 0.42 + bh * 0.04);
    ctx.font = `900 ${Math.max(9, r.h * 0.045)}px ${FONT}`;
    spaced(ctx, r.h * 0.01);
    ctx.fillText("AÇI SEÇİLMEDİ", r.x + r.w / 2, r.y + r.h * 0.62);
    spaced(ctx, 0);
  }
  if (n.scan) {
    ctx.save();
    ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
    const y = r.y + varScan(now + i * 700, 3000) * r.h;
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fillRect(r.x, y - r.h * 0.05, r.w, r.h * 0.05);
    ctx.fillStyle = "rgba(255,255,255,0.65)";
    ctx.fillRect(r.x, y, r.w, Math.max(1, 2 * s));
    ctx.restore();
  }
  const bw = Math.max(3, (p.big ? 8 : 6) * s);
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = bw;
  ctx.strokeRect(r.x - bw / 2, r.y - bw / 2, r.w + bw, r.h + bw);
  ctx.strokeStyle = BLACK;
  ctx.lineWidth = Math.max(1, 2 * s);
  ctx.strokeRect(r.x - bw - s, r.y - bw - s, r.w + (bw + s) * 2, r.h + (bw + s) * 2);
  // köşe kırmızı kare
  const q = bw * 1.6;
  ctx.fillStyle = RED;
  ctx.fillRect(r.x + r.w + bw - q, r.y + r.h + bw - q, q, q);
  // etiketler (beyaz çerçeveye yapışık, pencerenin içinde)
  const fs = Math.max(8, (p.big ? 20 : 15) * s);
  const th = fs * 1.8;
  const ty = r.y;
  const w1 = box(ctx, r.x, ty, `AÇI ${i + 1}`, fs, "#fff", BLACK, { h: th });
  if (info?.label) box(ctx, r.x + w1, ty, upper(info.label), fs * 0.85, RED, "#fff", { h: th, weight: 800 });
  if (info?.live) {
    const on = varPulse(now, 900) > 0.5;
    const wl = box(ctx, r.x + r.w, ty, "    CANLI", fs * 0.85, RED, "#fff", { align: "right", h: th });
    ctx.fillStyle = on ? "#fff" : "rgba(255,255,255,0.35)";
    ctx.beginPath(); ctx.arc(r.x + r.w - wl + fs * 0.9, ty + th / 2, fs * 0.26, 0, Math.PI * 2); ctx.fill();
  } else if (info?.rate && info.rate < 1) {
    box(ctx, r.x + r.w, ty, `${String(info.rate).replace(".", ",")}× AĞIR ÇEKİM`, fs * 0.85, BLACK, "#fff", { align: "right", h: th });
  }
}

function header(ctx, S) {
  const { L, n, now, s, logo } = S;
  const hb = L.header;
  const h = hb.h;
  shadowBox(ctx, hb.x, hb.y, hb.w, h, s, "#ffffff");
  ctx.fillStyle = BLACK;
  ctx.fillRect(hb.x, hb.y + h - Math.max(3, 6 * s), hb.w, Math.max(3, 6 * s));
  // kırmızı VAR kutusu + dama kenar
  const vw = h * 2.3;
  ctx.fillStyle = RED;
  ctx.fillRect(hb.x, hb.y, vw, h);
  const cell = h / 6;
  checkerStrip(ctx, hb.x + vw, hb.y, cell * 2, h - Math.max(3, 6 * s), cell, "#fff", BLACK);
  ctx.fillStyle = "#fff";
  ctx.font = `900 ${h * 0.6}px ${FONT}`;
  spaced(ctx, h * 0.03);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("VAR", hb.x + vw / 2, hb.y + h * 0.52);
  spaced(ctx, 0);
  const tx = hb.x + vw + cell * 2 + h * 0.3;
  ctx.textAlign = "left";
  ctx.fillStyle = RED;
  ctx.font = `900 ${h * 0.18}px ${FONT}`;
  spaced(ctx, h * 0.06);
  ctx.fillText("VİDEO YARDIMCI HAKEM", tx, hb.y + h * 0.28);
  spaced(ctx, 0);
  ctx.fillStyle = BLACK;
  ctx.font = `900 ${h * 0.4}px ${FONT}`;
  ctx.fillText(S.topic, tx, hb.y + h * 0.62, hb.w * 0.3);
  // sağdan sola
  let rx = hb.x + hb.w;
  if (logo?.naturalWidth) {
    const lh = h * 0.52;
    const lw = Math.min(h * 2, (logo.naturalWidth / logo.naturalHeight) * lh);
    const bwid = lw + h * 0.6;
    ctx.fillStyle = BLACK;
    ctx.fillRect(rx - bwid, hb.y, bwid, h);
    try { ctx.drawImage(logo, rx - bwid + h * 0.3, hb.y + (h - lh) / 2 - 2 * s, lw, lh); } catch { /* yoksay */ }
    rx -= bwid + h * 0.25;
  } else rx -= h * 0.25;
  if (n.timecode) {
    ctx.font = `700 ${h * 0.3}px ${MONO}`;
    const tw = ctx.measureText(S.tc).width + h * 0.4;
    const bh = h * 0.56;
    const by = hb.y + (h - bh) / 2 - 2 * s;
    ctx.fillStyle = BLACK;
    ctx.fillRect(rx - tw, by, tw, bh);
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.fillText(S.tc, rx - tw / 2, by + bh * 0.55);
    rx -= tw + h * 0.3;
  }
  const steps = S.steps;
  const fs = h * 0.22;
  const font = `900 ${fs}px ${FONT}`;
  const ch = h * 0.56;
  const cy = hb.y + (h - ch) / 2 - 2 * s;
  const ws = steps.map((x) => textW(ctx, x.label, font, fs * 0.05) + ch * 0.8);
  const gap = ch * 0.18;
  let cx = rx - ws.reduce((a, b) => a + b, 0) - gap * (steps.length - 1);
  const blink = varPulse(now, 1000);
  steps.forEach((x, i) => {
    const w = ws[i];
    ctx.fillStyle = x.on ? RED : x.done ? BLACK : "#e4e4e4";
    ctx.fillRect(cx, cy, w, ch);
    if (x.on) { ctx.fillStyle = `rgba(255,255,255,${0.5 + 0.5 * blink})`; ctx.fillRect(cx, cy + ch - Math.max(2, 4 * s), w, Math.max(2, 4 * s)); }
    ctx.font = font;
    spaced(ctx, fs * 0.05);
    ctx.fillStyle = x.on || x.done ? "#fff" : "#8a8a8a";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(x.done ? `✓ ${x.label}` : x.label, cx + w / 2, cy + ch * 0.55);
    spaced(ctx, 0);
    cx += w + gap;
  });
}

function footer(ctx, S) {
  const { L, st, now, s } = S;
  const f = L.footer;
  const h = f.h;
  shadowBox(ctx, f.x, f.y, f.w, h, s, BLACK);
  ctx.fillStyle = "#fff";
  ctx.fillRect(f.x, f.y, f.w, Math.max(2, 4 * s));
  const vw = h * 2;
  ctx.fillStyle = RED;
  ctx.fillRect(f.x, f.y, vw, h);
  ctx.fillStyle = "#fff";
  ctx.font = `900 ${h * 0.48}px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("VAR", f.x + vw / 2, f.y + h * 0.55);
  const x0 = f.x + vw;
  const cell = h / 5;
  if (st.key === "decision") {
    const t = S.decisionMs;
    const k = easeBack(t / 520);
    const ph = h * Math.max(0.02, k);
    const py = f.y + (h - ph) / 2;
    ctx.save();
    ctx.beginPath(); ctx.rect(x0, f.y - h, f.w - vw, h * 3); ctx.clip();
    ctx.fillStyle = "#fff";
    ctx.fillRect(x0, py, f.w - vw, ph);
    checkerStrip(ctx, x0, py, f.w - vw, Math.min(cell * 0.8, ph / 2), cell * 0.8, BLACK, "#fff", (now / 30) * s);
    checkerStrip(ctx, x0, py + ph - Math.min(cell * 0.8, ph / 2), f.w - vw, Math.min(cell * 0.8, ph / 2), cell * 0.8, BLACK, "#fff", -(now / 30) * s);
    ctx.beginPath(); ctx.rect(x0, py, f.w - vw, ph); ctx.clip();
    const kw = h * 2.1;
    ctx.fillStyle = BLACK;
    ctx.fillRect(x0, py, kw, ph);
    ctx.fillStyle = "#fff";
    ctx.font = `900 ${h * 0.3}px ${FONT}`;
    spaced(ctx, h * 0.06);
    ctx.textAlign = "center";
    ctx.fillText("KARAR", x0 + kw / 2, f.y + h * 0.55);
    spaced(ctx, 0);
    ctx.globalAlpha = clamp01((t - 200) / 250);
    ctx.fillStyle = S.positive ? GREEN : RED;
    ctx.font = `900 ${h * 0.58}px ${FONT}`;
    spaced(ctx, h * 0.03);
    const avail = f.w - vw - kw - h * 1.5;
    ctx.fillText(st.text, x0 + kw + avail / 2, f.y + h * 0.56, avail);
    spaced(ctx, 0);
    ctx.restore();
    if (t > 300) {
      ctx.save();
      ctx.globalAlpha = easeOut((t - 300) / 250);
      verdictIcon(ctx, f.x + f.w - h * 0.6, f.y + h / 2, h * 0.3, S.positive, { bg: S.positive ? GREEN : RED });
      ctx.restore();
    }
    return;
  }
  ctx.fillStyle = "#fff";
  ctx.textAlign = "left";
  ctx.font = `900 ${h * 0.36}px ${FONT}`;
  spaced(ctx, h * 0.02);
  const dots = ".".repeat(1 + (Math.floor(now / 450) % 3));
  ctx.fillText(`${upper(st.text)}${dots}`, x0 + h * 0.35, f.y + h * 0.55, f.w * 0.5);
  spaced(ctx, 0);
  const sw = f.w * 0.22;
  const sx = f.x + f.w - sw - h * 0.3;
  checkerStrip(ctx, sx, f.y + h * 0.3, sw, h * 0.4, h * 0.2, "#fff", BLACK, (now / 25) * s);
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = Math.max(1, 2 * s);
  ctx.strokeRect(sx, f.y + h * 0.3, sw, h * 0.4);
  ctx.font = `900 ${h * 0.18}px ${FONT}`;
  ctx.textAlign = "right";
  spaced(ctx, h * 0.06);
  ctx.fillStyle = RED;
  ctx.fillText(st.label, sx - h * 0.3, f.y + h * 0.55);
  spaced(ctx, 0);
}

export function chrome(ctx, S) {
  const { W, H, flash } = S;
  header(ctx, S);
  footer(ctx, S);
  if (flash > 0) { ctx.fillStyle = `rgba(255,255,255,${0.45 * flash})`; ctx.fillRect(0, 0, W, H); }
}
