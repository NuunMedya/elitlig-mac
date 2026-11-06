// RÖPORTAJ modu: sahne (kamera A / B, arka plan görseli; tek · yan yana ·
// köşe kamera · arka plan + kamera düzenleri), röportaj bandı (grafik modülü
// g.interview; katmanlardan aç / kapa), kayıt (Kaydı başlat / durdur → yükleme).
import { useCallback, useMemo } from "react";
import { stingerPalette } from "../../../lib/studio/stinger";
import { drawSource, sourcesById } from "../draw";
import { useInterview } from "../scenes/useInterview";

export const INTERVIEW_LAYOUTS = [
  { key: "single", label: "Tek kamera", hint: "Kamera A tam ekran" },
  { key: "two", label: "Yan yana", hint: "Kamera A | Kamera B" },
  { key: "pip", label: "Köşe kamera", hint: "Kamera A tam, B köşede" },
  { key: "framed", label: "Arka plan + kamera", hint: "Görsel arka plan, kamera çerçevede" },
];

export function normalizeInterviewScene(x) {
  const v = x && typeof x === "object" ? x : {};
  return {
    layout: INTERVIEW_LAYOUTS.some((l) => l.key === v.layout) ? v.layout : "single",
    camA: v.camA || null,
    camB: v.camB || null,
    bg: v.bg || null,
    autoRecord: Boolean(v.autoRecord),
    label: String(v.label || "Röportaj").slice(0, 80),
  };
}

/** Röportaj sahnesini çizer. */
export function drawInterviewScene(ctx, W, H, scene, sources, runtime, branding, now) {
  const n = normalizeInterviewScene(scene);
  const byId = sourcesById(sources || []);
  const S = (id) => (id ? byId.get(id) : null);
  const rt = (id) => runtime?.get?.(id);
  const pal = stingerPalette(branding);
  const bg = S(n.bg);
  if (bg) drawSource(ctx, bg, rt(bg.id), { x: 0, y: 0, w: W, h: H }, "cover", { placeholders: false, now });
  else {
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, "#07040d");
    g.addColorStop(0.6, pal.stops[0][1]);
    g.addColorStop(1, "#07040d");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  const a = S(n.camA);
  const b = S(n.camB);
  const frame = (src, r) => {
    if (!src) return;
    ctx.fillStyle = "#000";
    ctx.fillRect(r.x, r.y, r.w, r.h);
    drawSource(ctx, src, rt(src.id), r, "cover", { placeholders: true, now });
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = Math.max(1, W / 960);
    ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
  };
  if (n.layout === "two") {
    const m = Math.round(W * 0.03);
    const gap = Math.round(W * 0.015);
    const w = (W - m * 2 - gap) / 2;
    const h = Math.min(H * 0.72, (w * 9) / 16 * 1.25);
    const y = H * 0.1;
    frame(a, { x: m, y, w, h });
    frame(b, { x: m + w + gap, y, w, h });
  } else if (n.layout === "pip") {
    if (a) drawSource(ctx, a, rt(a.id), { x: 0, y: 0, w: W, h: H }, "cover", { placeholders: true, now });
    const w = Math.round(W * 0.28);
    const h = Math.round((w * 9) / 16);
    frame(b, { x: W - w - W * 0.03, y: H * 0.12, w, h });
  } else if (n.layout === "framed") {
    const w = W * 0.7;
    const h = (w * 9) / 16;
    frame(a, { x: (W - w) / 2, y: H * 0.06, w, h });
  } else if (a) {
    drawSource(ctx, a, rt(a.id), { x: 0, y: 0, w: W, h: H }, "cover", { placeholders: true, now });
  }
  if (!a && !b && !bg) {
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.font = `700 ${Math.round(H * 0.045)}px -apple-system, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Röportaj için kamera seç", W / 2, H / 2);
  }
}

export function useInterviewMode({ matchId, g, encoding, toast, scene, sources, runtimeRef, brandRef }) {
  const iv = useInterview({ matchId, graphics: g, encoding, toast });
  const n = useMemo(() => normalizeInterviewScene(scene), [scene]);
  const draw = useCallback((ctx, W, H, now) => drawInterviewScene(ctx, W, H, n, sources, runtimeRef?.current, brandRef?.current?.branding, now), [n, sources, runtimeRef, brandRef]);
  return { iv, scene: n, draw, ready: Boolean(n.camA || n.camB || n.bg) };
}
