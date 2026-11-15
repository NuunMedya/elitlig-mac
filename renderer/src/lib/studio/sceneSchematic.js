// Yayın Stüdyosu · SABİT sahne şeması (küçük resimler için; saf).
//
// Sahne kutuları / kartları canlı video ÇİZMEZ: katmanlar yalnız kutu + kaynak adı olarak
// gösterilir (yerleşim şeması). Böylece sahne şeridi, kart listesi, kısayol düğmeleri ve LED
// önizlemesi kare başına video çözmez / tuval çizmez; yalnız sahne değişince bir kez çizilir.
import { sourceKindLabel } from "./scenes";

/** Şemada kendi rengiyle (gerçek içerik yerine) gösterilen türlerin tonları. */
const TONE = {
  camera: "#1d4ed8", phone: "#1d4ed8", ingest: "#1d4ed8", stream: "#1d4ed8",
  screen: "#0f766e", window: "#0f766e", region: "#0f766e", web: "#0f766e",
  video: "#7c3aed", playlist: "#7c3aed", replay: "#7c3aed",
  image: "#a16207", slideshow: "#a16207",
  text: "#374151", ticker: "#374151", clock: "#374151",
  color: "#334155",
};

/**
 * Sahnenin şema kutuları (alttan üste): [{ x, y, w, h, rot, name, kind, label, tone }] — 0…1
 * oranında. Görünmeyen, kaynağı olmayan ya da sesli (audio) katmanlar atlanır.
 */
export function sceneSchematic(scene, sources = []) {
  if (!scene?.layers) return [];
  const byId = new Map((sources || []).map((s) => [s.id, s]));
  const out = [];
  for (const l of scene.layers) {
    if (!l?.visible) continue;
    const s = byId.get(l.sourceId);
    if (!s || s.kind === "audio") continue;
    const w = Number(l.w) || 0;
    const h = Number(l.h) || 0;
    if (w <= 0 || h <= 0) continue;
    out.push({
      x: Number(l.x) || 0, y: Number(l.y) || 0, w, h, rot: Number(l.rot) || 0,
      name: s.name || sourceKindLabel(s.kind), kind: s.kind, label: sourceKindLabel(s.kind),
      tone: s.kind === "color" && typeof s.color === "string" ? s.color : TONE[s.kind] || "#334155",
    });
  }
  return out;
}

/** Şemayı tuvale BİR KEZ çizer (döngü yok). ctx: 2B bağlam. */
export function paintSchematic(ctx, scene, sources, W, H, { empty = "Boş sahne" } = {}) {
  if (!ctx) return;
  ctx.save();
  ctx.fillStyle = "#0b0f17";
  ctx.fillRect(0, 0, W, H);
  const boxes = sceneSchematic(scene, sources);
  const fs = Math.max(9, Math.round(H * 0.1));
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  for (const b of boxes) {
    const bw = b.w * W;
    const bh = b.h * H;
    ctx.save();
    ctx.translate(b.x * W + bw / 2, b.y * H + bh / 2);
    if (b.rot) ctx.rotate((b.rot * Math.PI) / 180);
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = b.tone;
    ctx.fillRect(-bw / 2, -bh / 2, bw, bh);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 1;
    ctx.strokeRect(-bw / 2 + 0.5, -bh / 2 + 0.5, bw - 1, bh - 1);
    if (bw > 28 && bh > fs) {
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.font = `700 ${Math.min(fs, Math.round(bh * 0.4))}px -apple-system, system-ui, sans-serif`;
      const name = fitText(ctx, b.name, bw - 6);
      ctx.fillText(name, 0, 0);
    }
    ctx.restore();
  }
  if (!boxes.length) {
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.font = `600 ${fs}px -apple-system, system-ui, sans-serif`;
    ctx.fillText(empty, W / 2, H / 2);
  }
  ctx.restore();
}

function fitText(ctx, text, max) {
  const t = String(text || "");
  if (!ctx.measureText || ctx.measureText(t).width <= max) return t;
  let s = t;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > max) s = s.slice(0, -1);
  return `${s}…`;
}
