// Yayın modları — tuval çizimi: ek katmanlar, grafikler, yayına alma geçişi.
import { extraRect, normalizeLayers, snapshotWithLayers } from "../../../lib/studio/modes";
import { drawTransitionStinger } from "../../../lib/studio/transitions";
import { drawSource, sourcesById } from "../draw";

const FONT = "\"Archivo\", -apple-system, \"Helvetica Neue\", sans-serif";

/** Ek katmanlar (alt bant, köşe kamera, tam kare). */
export function drawExtras(ctx, W, H, layers, mode, sources, runtime, now) {
  const l = normalizeLayers(layers, mode);
  if (!l.extras.length) return;
  const byId = sourcesById(sources || []);
  for (const e of l.extras) {
    if (!e.visible) continue;
    const s = byId.get(e.sourceId);
    const r = extraRect(e, W, H);
    if (!s || !r) continue;
    const rt = runtime?.get?.(e.sourceId);
    if (e.kind === "pip") {
      const b = Math.max(2, W / 480);
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.fillRect(r.x + b * 2, r.y + b * 2, r.w, r.h);
      ctx.fillStyle = "#000";
      ctx.fillRect(r.x, r.y, r.w, r.h);
      drawSource(ctx, s, rt, r, "cover", { placeholders: true, now });
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.lineWidth = b;
      ctx.strokeRect(r.x + b / 2, r.y + b / 2, r.w - b, r.h - b);
      ctx.restore();
    } else if (e.kind === "band") {
      drawSource(ctx, s, rt, r, "cover", { placeholders: false, now });
    } else {
      drawSource(ctx, s, rt, r, "stretch", { placeholders: false, now });
    }
  }
}

/** Yayın grafikleri (katman bayraklarıyla). */
export function drawModeGraphics(ctx, W, H, snapshot, layers, mode, drawGraphics, extra) {
  if (!drawGraphics || !snapshot) return;
  const snap = snapshotWithLayers(snapshot, layers, mode);
  try { drawGraphics(ctx, { width: W, height: H, now: Date.now() }, extra ? { ...snap, ...extra } : snap); } catch { /* grafik hatası yayını durdurmasın */ }
}

/** Ölçekli küçük etiket (önizlemede "ÖNİZLEME" vb.). */
export function drawTag(ctx, W, H, text, color = "rgba(0,0,0,0.6)") {
  const fs = Math.max(9, H * 0.032);
  ctx.save();
  ctx.font = `800 ${fs}px ${FONT}`;
  const w = ctx.measureText(text).width + fs;
  ctx.fillStyle = color;
  ctx.fillRect(W - w - fs * 0.6, fs * 0.6, w, fs * 1.6);
  ctx.fillStyle = "#fff";
  ctx.textBaseline = "middle";
  ctx.fillText(text, W - w - fs * 0.1, fs * 1.42);
  ctx.restore();
}

function blit(ctx, src, v, W, H) {
  if (v.alpha <= 0.001) return;
  ctx.save();
  ctx.globalAlpha = Math.min(1, v.alpha);
  if (v.scale !== 1 || v.dx || v.dy) {
    ctx.translate(W / 2 + v.dx * W, H / 2 + v.dy * H);
    ctx.scale(v.scale, v.scale);
    ctx.translate(-W / 2, -H / 2);
  }
  ctx.drawImage(src, 0, 0, W, H);
  ctx.restore();
}

/** Ara tuval havuzu (çıkış boyutunda iki tane + bulanıklık için küçük). */
export function makeScratch() {
  const c = () => (typeof document !== "undefined" ? document.createElement("canvas") : null);
  return { a: c(), b: c(), blur: c() };
}
const fit = (cv, W, H) => { if (cv && (cv.width !== W || cv.height !== H)) { cv.width = W; cv.height = H; } return cv; };

/**
 * Yayına alma / canlıya dönüş geçişi. at: modeTransitionAt sonucu.
 * drawFrom / drawTo: (ctx) => void (tam kare çizer).
 */
export function paintTransition(ctx, W, H, at, drawFrom, drawTo, scratch, brand) {
  if (at.stinger) {
    (at.frame.switched ? drawTo : drawFrom)(ctx);
    drawTransitionStinger(ctx, W, H, at.kind, at.p, brand?.logo, brand?.branding);
    return;
  }
  const f = at.frame;
  if (at.kind === "cut") { (at.p >= 1 ? drawTo : drawFrom)(ctx); return; }
  const a = fit(scratch.a, W, H).getContext("2d", { alpha: false });
  const b = fit(scratch.b, W, H).getContext("2d", { alpha: false });
  drawFrom(a);
  drawTo(b);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);
  blit(ctx, scratch.a, f.from, W, H);
  if (f.wipe != null) {
    const edge = f.wipe * (W * 1.1) - W * 0.05;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, Math.max(0, edge), H);
    ctx.clip();
    ctx.drawImage(scratch.b, 0, 0, W, H);
    ctx.restore();
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillRect(edge - Math.max(2, W / 480), 0, Math.max(2, W / 240), H);
    return;
  }
  if (f.from.blur > 0.01 || f.to.blur > 0.01) {
    const bc = scratch.blur;
    if (bc) {
      bc.width = Math.max(16, Math.round(W / 28)); bc.height = Math.max(9, Math.round(H / 28));
      const bx = bc.getContext("2d");
      const k = Math.max(f.from.blur * (1 - f.to.alpha), f.to.blur * f.to.alpha);
      bx.drawImage(f.to.alpha > 0.5 ? scratch.b : scratch.a, 0, 0, bc.width, bc.height);
      blit(ctx, scratch.b, f.to, W, H);
      ctx.globalAlpha = Math.min(1, k);
      ctx.drawImage(bc, 0, 0, W, H);
      ctx.globalAlpha = 1;
      return;
    }
  }
  blit(ctx, scratch.b, f.to, W, H);
}
