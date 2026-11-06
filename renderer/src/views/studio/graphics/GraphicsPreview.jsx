// Yayın grafikleri · küçük önizleme tuvali (çeşit kutucukları, marka editörü).
// Çizim drawGraphics ile aynı; saha yerine koyu zemin. Saniyede `fps` kez
// yenilenir (saat, şerit, slaytlar); görünmüyorsa çizmez.
import React, { useEffect, useRef } from "react";
import { drawGraphics } from "../../../lib/studio/graphics";

function paintBackdrop(ctx, w, h) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#2c5236");
  g.addColorStop(1, "#13261a");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "rgba(255,255,255,0.035)";
  for (let i = 0; i < 12; i += 2) ctx.fillRect((i * w) / 12, 0, w / 12, h);
}

export default function GraphicsPreview({ snapshot, variant, isolate = false, width = 320, fps = 2, delay = 0, className = "", title }) {
  const ref = useRef(null);
  const snapRef = useRef(snapshot);
  snapRef.current = snapshot;
  const height = Math.round((width * 9) / 16);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return undefined;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const ctx = canvas.getContext("2d");
    let visible = true;
    let timer = null;
    const io = typeof IntersectionObserver !== "undefined" ? new IntersectionObserver(([e]) => { visible = e.isIntersecting; }) : null;
    io?.observe(canvas);
    const paint = () => {
      if (visible && snapRef.current) {
        const base = snapRef.current;
        const snap = variant || isolate
          ? { ...base, variant: variant || base.variant, ...(isolate ? { subtitle: { ...base.subtitle, onAir: false }, interview: { ...base.interview, onAir: false } } : {}) }
          : base;
        paintBackdrop(ctx, canvas.width, canvas.height);
        drawGraphics(ctx, { width: canvas.width, height: canvas.height, now: Date.now() }, snap);
      }
      timer = setTimeout(paint, 1000 / fps);
    };
    timer = setTimeout(paint, delay);
    return () => { clearTimeout(timer); io?.disconnect(); };
  }, [width, height, fps, delay, variant, isolate]);

  return <canvas ref={ref} className={`gx-preview ${className}`} style={{ width, height }} title={title} aria-label={title || "Grafik önizlemesi"} />;
}
