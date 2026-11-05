// Yayın Stüdyosu — tuvale sahne / kaynak çizimi (karıştırıcı, önizleme ve
// kaynak küçük resimleri aynı işlevi kullanır).
import { fitRect, layerRect } from "../../lib/studio/layouts";

const PLACEHOLDER = {
  waiting: "Açılıyor…",
  missing: "Kaynak yok",
  denied: "İzin yok",
  ended: "Bağlantı koptu",
  busy: "Başka uygulama kullanıyor",
  error: "Açılamadı",
  file: "Dosyayı yeniden seç",
};

/** Kaynağın çizilebilir öğesi ve doğal boyutu; hazır değilse null. */
export function drawableOf(rt) {
  const el = rt?.el;
  if (!el || rt.status !== "live") return null;
  if (el instanceof HTMLVideoElement) {
    if (el.readyState < 2 || !el.videoWidth) return null;
    return { el, w: el.videoWidth, h: el.videoHeight };
  }
  if (el instanceof HTMLImageElement) {
    if (!el.complete || !el.naturalWidth) return null;
    return { el, w: el.naturalWidth, h: el.naturalHeight };
  }
  return null;
}

function drawPlaceholder(ctx, box, source, rt) {
  ctx.save();
  ctx.fillStyle = "#120a1c";
  ctx.fillRect(box.x, box.y, box.w, box.h);
  ctx.strokeStyle = "rgba(216,191,255,0.18)";
  ctx.lineWidth = Math.max(1, box.w / 400);
  ctx.strokeRect(box.x + 0.5, box.y + 0.5, box.w - 1, box.h - 1);
  const size = Math.max(10, Math.min(box.h * 0.08, box.w * 0.05));
  ctx.fillStyle = "rgba(255,255,255,0.72)";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `700 ${size}px -apple-system, "Helvetica Neue", sans-serif`;
  ctx.fillText(source?.name || "Kaynak", box.x + box.w / 2, box.y + box.h / 2 - size * 0.7);
  ctx.font = `500 ${size * 0.8}px -apple-system, "Helvetica Neue", sans-serif`;
  ctx.fillStyle = "rgba(255,255,255,0.48)";
  ctx.fillText(PLACEHOLDER[rt?.status] || PLACEHOLDER.missing, box.x + box.w / 2, box.y + box.h / 2 + size * 0.7);
  ctx.restore();
}

function drawColorPlate(ctx, box, source) {
  ctx.save();
  ctx.fillStyle = source.color || "#54009c";
  ctx.fillRect(box.x, box.y, box.w, box.h);
  if (source.text) {
    const size = Math.max(8, box.h * 0.12);
    ctx.fillStyle = source.textColor || "#ffffff";
    ctx.font = `800 ${size}px "Archivo", -apple-system, "Helvetica Neue", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const lines = String(source.text).split("\n").slice(0, 3);
    lines.forEach((line, i) => ctx.fillText(line, box.x + box.w / 2, box.y + box.h / 2 + (i - (lines.length - 1) / 2) * size * 1.2, box.w * 0.92));
  }
  ctx.restore();
}

/** Bir kaynağı kutuya çizer. placeholders: hazır olmayan kaynak için yazılı kutu (yayına gitmez). */
export function drawSource(ctx, source, rt, box, fit = "cover", { placeholders = false } = {}) {
  if (!source) return;
  if (source.kind === "color") { drawColorPlate(ctx, box, source); return; }
  const d = drawableOf(rt);
  if (!d) {
    if (placeholders) drawPlaceholder(ctx, box, source, rt);
    return;
  }
  const f = fitRect(d.w, d.h, box, fit);
  if (!f) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(box.x, box.y, box.w, box.h);
  ctx.clip();
  if (source.mirror) {
    ctx.translate(f.dx * 2 + f.dw, 0);
    ctx.scale(-1, 1);
  }
  try {
    ctx.drawImage(d.el, f.sx, f.sy, f.sw, f.sh, f.dx, f.dy, f.dw, f.dh);
  } catch { /* kare hazır değil */ }
  ctx.restore();
}

/** Sahneyi (katmanlar alttan üste) çizer. */
export function drawScene(ctx, scene, sources, runtime, W, H, opts = {}) {
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);
  if (!scene) return;
  const byId = new Map(sources.map((s) => [s.id, s]));
  for (const layer of scene.layers) {
    if (!layer.visible) continue;
    const source = byId.get(layer.sourceId);
    drawSource(ctx, source, runtime.get(layer.sourceId), layerRect(layer.layout, W, H), layer.fit, opts);
  }
}

/** Tekrar videosu: tam kare, oranı korunarak. */
export function drawVideoFull(ctx, video, W, H) {
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);
  if (!video || video.readyState < 2 || !video.videoWidth) return false;
  const f = fitRect(video.videoWidth, video.videoHeight, { x: 0, y: 0, w: W, h: H }, "contain");
  try { ctx.drawImage(video, f.sx, f.sy, f.sw, f.sh, f.dx, f.dy, f.dw, f.dh); } catch { return false; }
  return true;
}
