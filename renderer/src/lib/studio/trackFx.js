// Yayın Stüdyosu — OYUNCU TAKİBİ vurguları (tuval çizimi; yayın çıktısına gider).
//
//   halka  ayakların altında parlayan elips (ışık halkası), hafif nabız
//   spot   spot ışığı: çevre karartılır, oyuncu yumuşak kenarlı daire içinde aydınlık
//   ok     başın üstünde aşağı bakan ok + isim etiketi (kadrodan)
//   daire  oyuncunun çevresinde daire
// p: { x, y } tuval pikseli (gövde merkezi) · h: oyuncu boyu (piksel) · clip: pencere
// dikdörtgeni (yan yana tekrarda çizim pencere dışına taşmaz) · intro: 0…1 (donmada beliriş).
import { TRACK_COLORS } from "./playerTrack";

const FONT = "\"Archivo\", -apple-system, \"Helvetica Neue\", sans-serif";

function rgba(hex, a) {
  const h = String(hex || "#ffffff").replace("#", "");
  const x = h.length === 3 ? [...h].map((c) => c + c).join("") : h.padEnd(6, "f");
  const n = parseInt(x.slice(0, 6), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/**
 * Vurguyu çiz. track: { style, color, label } · opts: { now, alpha, intro, clip, W, H }.
 */
export function drawTrackFx(ctx, track, p, h, { now = 0, alpha = 1, intro = 1, clip = null, W = 0, H = 0 } = {}) {
  if (!p || !(h > 0) || alpha <= 0.01) return;
  const color = track?.color || TRACK_COLORS[0];
  const style = track?.style || "halka";
  const pulse = 0.5 + 0.5 * Math.sin(now / 220);
  const k = Math.max(0, Math.min(1, intro));
  const ease = 1 - (1 - k) ** 3;
  ctx.save();
  if (clip) { ctx.beginPath(); ctx.rect(clip.x, clip.y, clip.w, clip.h); ctx.clip(); }
  ctx.globalAlpha *= alpha;
  const lw = Math.max(2, h * 0.035);
  if (style === "spot") {
    const r = h * (0.62 + 0.1 * (1 - ease));
    const box = clip || { x: 0, y: 0, w: W || ctx.canvas.width, h: H || ctx.canvas.height };
    const g = ctx.createRadialGradient(p.x, p.y, r * 0.75, p.x, p.y, r * 1.35);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, `rgba(0,0,0,${0.62 * ease})`);
    ctx.fillStyle = g;
    ctx.fillRect(box.x, box.y, box.w, box.h);
    // ışık lekesi
    ctx.globalCompositeOperation = "lighter";
    const lg = ctx.createRadialGradient(p.x, p.y - h * 0.1, 0, p.x, p.y, r);
    lg.addColorStop(0, rgba(color, 0.16 * ease));
    lg.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = lg;
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = rgba(color, 0.55 * ease);
    ctx.lineWidth = lw * 0.6;
    ctx.beginPath(); ctx.arc(p.x, p.y, r * 0.98, 0, Math.PI * 2); ctx.stroke();
  } else if (style === "daire") {
    const r = h * 0.58 * (0.7 + 0.3 * ease);
    ctx.shadowColor = rgba(color, 0.9);
    ctx.shadowBlur = h * 0.12;
    ctx.strokeStyle = color;
    ctx.lineWidth = lw * 1.2;
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = rgba(color, 0.35 + 0.3 * pulse);
    ctx.lineWidth = lw * 0.5;
    ctx.beginPath(); ctx.arc(p.x, p.y, r * (1.08 + 0.04 * pulse), 0, Math.PI * 2); ctx.stroke();
  } else if (style === "ok") {
    const top = p.y - h * 0.62 - h * 0.08 * pulse;
    const aw = h * 0.22;
    const ah = h * 0.24;
    const y0 = top - ah * (0.3 + 0.7 * ease);
    ctx.shadowColor = "rgba(0,0,0,0.55)"; // sabit-renk
    ctx.shadowBlur = h * 0.06;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(p.x, top);
    ctx.lineTo(p.x - aw / 2, y0);
    ctx.lineTo(p.x - aw / 5, y0);
    ctx.lineTo(p.x - aw / 5, y0 - ah * 0.55);
    ctx.lineTo(p.x + aw / 5, y0 - ah * 0.55);
    ctx.lineTo(p.x + aw / 5, y0);
    ctx.lineTo(p.x + aw / 2, y0);
    ctx.closePath();
    ctx.fill();
    const label = String(track?.label || "").trim();
    if (label) {
      const fs = Math.max(11, h * 0.2);
      ctx.font = `800 ${fs}px ${FONT}`;
      const tw = ctx.measureText(label.toLocaleUpperCase("tr-TR")).width;
      const bw = tw + fs * 1.1;
      const bh = fs * 1.55;
      const by = y0 - ah * 0.55 - bh - fs * 0.25;
      let bx = p.x - bw / 2;
      if (clip) bx = Math.max(clip.x + 4, Math.min(clip.x + clip.w - bw - 4, bx));
      ctx.shadowBlur = h * 0.05;
      ctx.fillStyle = "rgba(10,10,14,0.82)"; // sabit-renk
      ctx.fillRect(bx, by, bw, bh);
      ctx.shadowBlur = 0;
      ctx.fillStyle = color;
      ctx.fillRect(bx, by + bh - Math.max(2, fs * 0.14), bw * ease, Math.max(2, fs * 0.14));
      ctx.fillStyle = "#ffffff"; // sabit-renk
      ctx.textBaseline = "middle";
      ctx.textAlign = "center";
      ctx.fillText(label.toLocaleUpperCase("tr-TR"), bx + bw / 2, by + bh * 0.47);
    }
  } else {
    // halka: ayak altı elips
    const fy = p.y + h * 0.48;
    const rx = h * 0.42 * (0.6 + 0.4 * ease);
    const ry = rx * 0.32;
    const g = ctx.createRadialGradient(p.x, fy, 0, p.x, fy, rx * 1.2);
    g.addColorStop(0, rgba(color, 0.42));
    g.addColorStop(0.7, rgba(color, 0.12));
    g.addColorStop(1, rgba(color, 0));
    ctx.save();
    ctx.translate(p.x, fy);
    ctx.scale(1, ry / rx);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, rx * 1.2, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.shadowColor = rgba(color, 1);
    ctx.shadowBlur = h * 0.15;
    ctx.strokeStyle = color;
    ctx.lineWidth = lw * (1 + 0.25 * pulse);
    ctx.beginPath(); ctx.ellipse(p.x, fy, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = rgba(color, 0.3 + 0.3 * (1 - pulse));
    ctx.lineWidth = lw * 0.5;
    ctx.beginPath(); ctx.ellipse(p.x, fy, rx * (1.15 + 0.1 * pulse), ry * (1.15 + 0.1 * pulse), 0, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}

/** Düzenleme işaretleri (YALNIZ önizleme / operatör): anahtar kare noktaları. */
export function drawTrackKeys(ctx, pts, color) {
  ctx.save();
  for (const q of pts) {
    ctx.fillStyle = q.current ? (color || "#ffffff") : "rgba(255,255,255,0.55)"; // sabit-renk
    ctx.strokeStyle = "rgba(0,0,0,0.6)"; // sabit-renk
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(q.x, q.y, q.current ? 5 : 3.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}
