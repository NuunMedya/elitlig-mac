// Yayın Stüdyosu — VAR KONTROLÜ çerçevesi (programa çizilir, yayına gider).
// Markalı koyu zemin, üstte "VAR KONTROLÜ" bandı (yanıp sönen kırmızı nokta),
// içerik alanının çevresinde nabız gibi atan kenarlık; türüne göre canlı
// kaynak ve / veya pozisyon tekrarı.
import { varLayout, varPulse } from "../../../lib/studio/var";
import { stingerPalette } from "../../../lib/studio/stinger";
import { drawSource, drawVideoIn } from "../draw";

const FONT = "\"Archivo\", -apple-system, \"Helvetica Neue\", sans-serif";

/**
 * v: { mode, title, subtitle, source, sourceRt, video } · brand: { logo, branding }
 */
export function drawVar(ctx, W, H, now, v, brand) {
  const L = varLayout(v.mode, W, H);
  const pal = stingerPalette(brand?.branding);
  const [, dark] = pal.stops[0];
  const primary = pal.stops[1][1];
  const accent = pal.stops[3][1];
  // Zemin
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, "#05030a");
  g.addColorStop(0.55, dark);
  g.addColorStop(1, "#05030a");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // İnce ızgara (monitör hissi)
  ctx.save();
  ctx.globalAlpha = 0.07;
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1;
  const step = Math.round(W / 24);
  ctx.beginPath();
  for (let x = 0; x < W; x += step) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, H); }
  for (let y = 0; y < H; y += step) { ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); }
  ctx.stroke();
  ctx.restore();

  // Başlık bandı
  const hb = L.header;
  const hg = ctx.createLinearGradient(0, 0, W, 0);
  hg.addColorStop(0, primary);
  hg.addColorStop(1, accent);
  ctx.fillStyle = hg;
  ctx.fillRect(hb.x, hb.y, hb.w, hb.h);
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.fillRect(hb.x, hb.y + hb.h - Math.max(2, H / 270), hb.w, Math.max(2, H / 270));
  const pulse = varPulse(now);
  const fs = hb.h * 0.5;
  ctx.font = `900 ${fs}px ${FONT}`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  const title = v.title || "VAR KONTROLÜ";
  const tw = ctx.measureText(title).width;
  // Kırmızı nokta
  ctx.fillStyle = `rgba(255,45,85,${0.45 + 0.55 * pulse})`;
  ctx.beginPath();
  ctx.arc(W / 2 - tw / 2 - fs * 0.7, hb.h / 2, fs * 0.26, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = pal.text;
  ctx.fillText(title, W / 2, hb.h / 2 + fs * 0.04);
  if (brand?.logo?.naturalWidth) {
    const lh = hb.h * 0.7;
    const lw = (brand.logo.naturalWidth / brand.logo.naturalHeight) * lh;
    try { ctx.drawImage(brand.logo, W - lw - hb.h * 0.35, (hb.h - lh) / 2, lw, lh); } catch { /* yoksay */ }
  }

  // Nabızlı kenarlık
  const fr = L.frame;
  const lw = Math.max(3, W / 240);
  ctx.save();
  ctx.shadowColor = "rgba(255,45,85,0.9)";
  ctx.shadowBlur = (W / 60) * pulse;
  ctx.strokeStyle = `rgba(255,${Math.round(45 + 120 * (1 - pulse))},${Math.round(85 + 100 * (1 - pulse))},${0.55 + 0.45 * pulse})`;
  ctx.lineWidth = lw;
  ctx.strokeRect(fr.x + lw / 2, fr.y + lw / 2, fr.w - lw, fr.h - lw);
  ctx.restore();

  if (L.mode === "bg") {
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.font = `900 ${H * 0.26}px ${FONT}`;
    ctx.fillText("VAR", W / 2, fr.y + fr.h * 0.45);
    if (v.subtitle) {
      ctx.font = `700 ${H * 0.045}px ${FONT}`;
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.fillText(v.subtitle, W / 2, fr.y + fr.h * 0.72, fr.w * 0.9);
    }
    return L;
  }
  for (const pane of L.panes) {
    const r = pane.rect;
    ctx.fillStyle = "#000";
    ctx.fillRect(r.x, r.y, r.w, r.h);
    if (pane.role === "source") {
      if (v.source) drawSource(ctx, v.source, v.sourceRt, r, "contain", { placeholders: true });
    } else if (!drawVideoIn(ctx, v.video, r, "contain")) {
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.font = `700 ${H * 0.03}px ${FONT}`;
      ctx.fillText("Tekrar seçilmedi", r.x + r.w / 2, r.y + r.h / 2);
    }
    // Etiket
    const ls = H * 0.026;
    ctx.font = `800 ${ls}px ${FONT}`;
    const lwid = ctx.measureText(pane.label).width + ls * 1.2;
    ctx.fillStyle = pane.role === "replay" ? accent : "rgba(255,45,85,0.95)";
    ctx.fillRect(r.x, r.y, lwid, ls * 1.7);
    ctx.fillStyle = "#fff";
    ctx.textAlign = "left";
    ctx.fillText(pane.label, r.x + ls * 0.6, r.y + ls * 0.88);
    ctx.textAlign = "center";
    if (pane.role === "replay" && v.rate && v.rate < 1) {
      const txt = `${String(v.rate).replace(".", ",")}×`;
      ctx.textAlign = "right";
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(r.x + r.w - ls * 4, r.y, ls * 4, ls * 1.7);
      ctx.fillStyle = "#fff";
      ctx.fillText(txt, r.x + r.w - ls * 0.6, r.y + ls * 0.88);
      ctx.textAlign = "center";
    }
  }
  if (v.subtitle) {
    ctx.font = `700 ${H * 0.03}px ${FONT}`;
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.fillText(v.subtitle, W / 2, fr.y + fr.h - H * 0.022, fr.w * 0.9);
  }
  return L;
}
