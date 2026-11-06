// Yayın Stüdyosu — VAR çerçevesi (yayın kalitesinde yeni tasarım).
//
//   zemin      çok koyu, marka renginde merkez ışığı, ince çapraz doku, kenar karartması
//   başlık     cam bant: "VAR" monogramı (marka degradesi), "VİDEO YARDIMCI HAKEM" + konu,
//              durum çipi (İNCELEME / KONTROL / KARAR, renkli, yanıp sönen nokta), zaman kodu, logo
//   pencereler tek / ikili / üçlü; köşe ayraçları, AÇI etiketi, ağır çekim etiketi,
//              taranan ışık çizgisi
//   alt bant   KARAR'da büyük karar bandı (GOL İPTAL …, kayarak gelir); incelemede ilerleme çubuğu
import { VAR_TONES, varLayout, varLayoutV2, varPulse, varScan, varStatus, varTimecode, normalizeVarV2, varLayoutOf } from "../../../lib/studio/var";
import { stingerPalette } from "../../../lib/studio/stinger";
import { drawSource, drawVideoIn } from "../draw";

const FONT = "\"Archivo\", -apple-system, \"Helvetica Neue\", sans-serif";
const MONO = "\"SF Mono\", \"JetBrains Mono\", Menlo, Consolas, monospace";

const rgba = (hex, a) => {
  const h = String(hex || "#ffffff").replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((x) => x + x).join("") : h, 16) || 0;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};
function rr(ctx, x, y, w, h, r) {
  const q = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + q, y);
  ctx.arcTo(x + w, y, x + w, y + h, q);
  ctx.arcTo(x + w, y + h, x, y + h, q);
  ctx.arcTo(x, y + h, x, y, q);
  ctx.arcTo(x, y, x + w, y, q);
  ctx.closePath();
}
const easeOut = (t) => 1 - (1 - Math.min(1, Math.max(0, t))) ** 3;

function glass(ctx, x, y, w, h, r, s) {
  rr(ctx, x, y, w, h, r);
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, "rgba(255,255,255,0.10)");
  g.addColorStop(1, "rgba(255,255,255,0.03)");
  ctx.fillStyle = "rgba(8,9,14,0.72)";
  ctx.fill();
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.14)";
  ctx.lineWidth = Math.max(1, 1.5 * s);
  ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.22)";
  ctx.fillRect(x + r, y + 1, w - r * 2, Math.max(1, s));
}

function background(ctx, W, H, pal) {
  ctx.fillStyle = "#04050a";
  ctx.fillRect(0, 0, W, H);
  const g = ctx.createRadialGradient(W * 0.5, H * 0.45, 0, W * 0.5, H * 0.45, W * 0.7);
  g.addColorStop(0, rgba(pal.primary, 0.42));
  g.addColorStop(0.6, rgba(pal.dark, 0.25));
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.globalAlpha = 0.045;
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1;
  const step = Math.max(8, Math.round(W / 48));
  ctx.beginPath();
  for (let x = -H; x < W; x += step) { ctx.moveTo(x, H); ctx.lineTo(x + H, 0); }
  ctx.stroke();
  ctx.restore();
  const v = ctx.createLinearGradient(0, 0, 0, H);
  v.addColorStop(0, "rgba(0,0,0,0.5)");
  v.addColorStop(0.3, "rgba(0,0,0,0)");
  v.addColorStop(0.7, "rgba(0,0,0,0)");
  v.addColorStop(1, "rgba(0,0,0,0.6)");
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);
}

function header(ctx, W, H, L, n, st, pal, now, tcMs, logo) {
  const s = W / 1920;
  const hb = L.header;
  glass(ctx, hb.x, hb.y, hb.w, hb.h, hb.h * 0.22, s);
  // Monogram
  const m = hb.h * 0.74;
  const mx = hb.x + hb.h * 0.13;
  const my = hb.y + (hb.h - m) / 2;
  rr(ctx, mx, my, m * 1.5, m, m * 0.18);
  const mg = ctx.createLinearGradient(mx, my, mx + m * 1.5, my + m);
  mg.addColorStop(0, pal.primary);
  mg.addColorStop(1, pal.accent);
  ctx.fillStyle = mg;
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.font = `900 ${m * 0.56}px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("VAR", mx + m * 0.75, my + m * 0.53);
  // Başlıklar
  const tx = mx + m * 1.5 + hb.h * 0.3;
  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.font = `800 ${hb.h * 0.2}px ${FONT}`;
  ctx.fillText("V İ D E O   Y A R D I M C I   H A K E M", tx, hb.y + hb.h * 0.32);
  ctx.fillStyle = "#fff";
  ctx.font = `900 ${hb.h * 0.36}px ${FONT}`;
  ctx.fillText(String(n.topic || n.title || "VAR KONTROLÜ").toLocaleUpperCase("tr-TR"), tx, hb.y + hb.h * 0.68, hb.w * 0.36);
  // Sağ: logo, zaman kodu, durum çipi
  let rx = hb.x + hb.w - hb.h * 0.25;
  if (logo?.naturalWidth) {
    const lh = hb.h * 0.62;
    const lw = Math.min(hb.h * 2.2, (logo.naturalWidth / logo.naturalHeight) * lh);
    try { ctx.drawImage(logo, rx - lw, hb.y + (hb.h - lh) / 2, lw, lh); } catch { /* yoksay */ }
    rx -= lw + hb.h * 0.35;
    ctx.fillStyle = "rgba(255,255,255,0.14)";
    ctx.fillRect(rx, hb.y + hb.h * 0.2, Math.max(1, s * 1.5), hb.h * 0.6);
    rx -= hb.h * 0.35;
  }
  if (n.timecode) {
    ctx.textAlign = "right";
    ctx.fillStyle = "#fff";
    ctx.font = `700 ${hb.h * 0.34}px ${MONO}`;
    const tc = varTimecode(tcMs);
    ctx.fillText(tc, rx, hb.y + hb.h * 0.56);
    const tw = ctx.measureText(tc).width;
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.font = `800 ${hb.h * 0.17}px ${FONT}`;
    ctx.fillText("TC", rx - tw - hb.h * 0.15, hb.y + hb.h * 0.56);
    rx -= tw + hb.h * 0.7;
  }
  // Durum çipi
  ctx.font = `900 ${hb.h * 0.3}px ${FONT}`;
  const label = st.label;
  const cw = ctx.measureText(label).width + hb.h * 1.0;
  const ch = hb.h * 0.56;
  const cx = rx - cw;
  const cy = hb.y + (hb.h - ch) / 2;
  rr(ctx, cx, cy, cw, ch, ch / 2);
  ctx.fillStyle = rgba(st.color, 0.2);
  ctx.fill();
  ctx.strokeStyle = rgba(st.color, 0.9);
  ctx.lineWidth = Math.max(1.5, 2 * s);
  ctx.stroke();
  const blink = st.key === "decision" ? 1 : 0.35 + 0.65 * varPulse(now, 1000);
  ctx.fillStyle = rgba(st.color, blink);
  ctx.beginPath();
  ctx.arc(cx + ch * 0.5, cy + ch / 2, ch * 0.16, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.textAlign = "left";
  ctx.fillText(label, cx + ch * 0.82, cy + ch * 0.54);
}

function brackets(ctx, r, color, s) {
  const k = Math.min(r.w, r.h) * 0.08;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(2, 3 * s);
  ctx.beginPath();
  const o = ctx.lineWidth / 2;
  for (const [x, y, dx, dy] of [[r.x + o, r.y + o, 1, 1], [r.x + r.w - o, r.y + o, -1, 1], [r.x + o, r.y + r.h - o, 1, -1], [r.x + r.w - o, r.y + r.h - o, -1, -1]]) {
    ctx.moveTo(x, y + dy * k); ctx.lineTo(x, y); ctx.lineTo(x + dx * k, y);
  }
  ctx.stroke();
}

function chip(ctx, x, y, text, bg, fs, align = "left") {
  ctx.font = `800 ${fs}px ${FONT}`;
  const w = ctx.measureText(text).width + fs * 1.1;
  const h = fs * 1.75;
  const x0 = align === "right" ? x - w : x;
  rr(ctx, x0, y, w, h, fs * 0.3);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x0 + fs * 0.55, y + h * 0.53);
  return w;
}

/**
 * Yeni VAR sahnesi.
 * v:      VAR ayarları (normalizeVarV2) + { decisionAt, startedAt }
 * paint:  (ctx, slot, rect, index) → { label, rate, timeMs } | null   pencere içeriğini çizer
 * brand:  { logo, branding }
 */
export function drawVarScene(ctx, W, H, now, v, paint, brand) {
  const n = normalizeVarV2(v);
  const L = varLayoutV2(n.layout, W, H);
  const p0 = stingerPalette(brand?.branding);
  const pal = { primary: p0.stops[1][1], accent: p0.stops[3][1], dark: p0.stops[0][1] };
  const st = varStatus(n);
  const s = W / 1920;
  background(ctx, W, H, pal);

  // Pencereler
  let tcMs = null;
  const count = varLayoutOf(n.layout).count;
  L.panes.slice(0, count).forEach((pane, i) => {
    const r = pane.rect;
    ctx.fillStyle = "#000";
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.save();
    ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
    const info = paint?.(ctx, n.slots[i], r, i) || null;
    if (!info) {
      ctx.fillStyle = "#0b0c12";
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.font = `800 ${Math.max(10, r.h * 0.06)}px ${FONT}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("AÇI SEÇİLMEDİ", r.x + r.w / 2, r.y + r.h / 2);
    }
    if (info && tcMs == null && info.timeMs != null) tcMs = info.timeMs;
    // Taranan ışık çizgisi
    if (n.scan) {
      const y = r.y + varScan(now + i * 700) * r.h;
      const tg = ctx.createLinearGradient(0, y - r.h * 0.12, 0, y);
      tg.addColorStop(0, rgba(st.color, 0));
      tg.addColorStop(1, rgba(st.color, 0.16));
      ctx.fillStyle = tg;
      ctx.fillRect(r.x, y - r.h * 0.12, r.w, r.h * 0.12);
      ctx.fillStyle = rgba("#ffffff", 0.55);
      ctx.fillRect(r.x, y, r.w, Math.max(1, 1.5 * s));
    }
    ctx.restore();
    ctx.strokeStyle = "rgba(255,255,255,0.16)";
    ctx.lineWidth = Math.max(1, s);
    ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
    brackets(ctx, r, rgba(st.color, 0.95), s);
    const fs = Math.max(8, (pane.big ? 20 : 15) * s);
    const pad = fs * 0.9;
    const w1 = chip(ctx, r.x + pad, r.y + pad, `AÇI ${i + 1}`, rgba(st.color, 0.95), fs);
    if (info?.label) chip(ctx, r.x + pad + w1 + fs * 0.4, r.y + pad, String(info.label).toLocaleUpperCase("tr-TR"), "rgba(0,0,0,0.62)", fs);
    if (info?.rate && info.rate < 1) chip(ctx, r.x + r.w - pad, r.y + pad, `${String(info.rate).replace(".", ",")}× AĞIR ÇEKİM`, "rgba(0,0,0,0.62)", fs, "right");
    if (info?.live) chip(ctx, r.x + r.w - pad, r.y + pad, "● CANLI", rgba(VAR_TONES.red, 0.95), fs, "right");
  });

  header(ctx, W, H, L, n, st, pal, now, tcMs ?? Math.max(0, now - (v?.startedAt || 0)), brand?.logo);

  // Alt bant
  const f = L.footer;
  if (st.key === "decision") {
    const k = easeOut((now - (v?.decisionAt || 0)) / 550);
    const fw = f.w * (0.4 + 0.6 * k);
    const fx = W / 2 - fw / 2;
    ctx.save();
    ctx.globalAlpha = Math.min(1, k * 1.4);
    glass(ctx, fx, f.y, fw, f.h, f.h * 0.2, s);
    rr(ctx, fx, f.y, f.h * 2.3, f.h, f.h * 0.2);
    ctx.fillStyle = st.color;
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.font = `900 ${f.h * 0.3}px ${FONT}`;
    ctx.fillText("KARAR", fx + f.h * 1.15, f.y + f.h * 0.53);
    ctx.font = `900 ${f.h * 0.52}px ${FONT}`;
    ctx.fillText(st.text, fx + f.h * 2.3 + (fw - f.h * 2.3) / 2, f.y + f.h * 0.55, fw - f.h * 2.8);
    ctx.fillStyle = rgba(st.color, 1);
    ctx.fillRect(fx + f.h * 2.3, f.y + f.h - 4 * s, (fw - f.h * 2.3) * k, 4 * s);
    ctx.restore();
  } else {
    const fh = f.h * 0.62;
    const fy = f.y + (f.h - fh) / 2;
    glass(ctx, f.x, fy, f.w, fh, fh * 0.25, s);
    ctx.fillStyle = "#fff";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.font = `800 ${fh * 0.38}px ${FONT}`;
    const dots = ".".repeat(1 + (Math.floor(now / 450) % 3));
    ctx.fillText(`${st.text}${dots}`, f.x + fh * 0.5, fy + fh * 0.52, f.w * 0.62);
    // İlerleme çubuğu (ileri-geri)
    const bw = f.w * 0.28;
    const bx = f.x + f.w - bw - fh * 0.5;
    const by = fy + fh / 2 - 3 * s;
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.fillRect(bx, by, bw, 6 * s);
    const ph = (Math.sin(now / 520) + 1) / 2;
    ctx.fillStyle = st.color;
    ctx.fillRect(bx + ph * bw * 0.7, by, bw * 0.3, 6 * s);
  }
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
