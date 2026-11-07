// YouTube kapağı · canlı önizleme tuvali. Önce görselsiz (baş harf rozetleriyle)
// hemen çizilir, armalar / logo / zemin yüklenince yeniden çizilir.
import React, { useEffect, useRef } from "react";
import { drawCover } from "../../../../lib/studio/cover/draw";
import { prepareCover } from "../../../../lib/studio/cover/render";
import { DEFAULT_BRAND_LOGO } from "./coverStore";

export default function CoverPreview({ data, settings, width = 640, className = "", title }) {
  const ref = useRef(null);
  const painted = useRef(false);
  const height = Math.round((width * 9) / 16);
  const settingsKey = JSON.stringify(settings || null);
  const scale = typeof window !== "undefined" ? Math.min(2, window.devicePixelRatio || 1) : 1;
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !data) return undefined;
    let alive = true;
    let ctx = null;
    try { ctx = canvas.getContext("2d"); } catch { ctx = null; }
    if (!ctx) return undefined;
    // İlk açılışta görseller beklenmeden çizilir; sonraki değişikliklerde eski kare yerinde kalır (titreme yok).
    if (!painted.current) { try { drawCover(ctx, data, settings, {}, { width: canvas.width, height: canvas.height }); } catch { /* ilk çizim */ } }
    prepareCover(data, settings, { defaultBrandLogo: DEFAULT_BRAND_LOGO }).then((p) => {
      if (!alive || !ref.current) return;
      try { drawCover(ctx, p.data, settings, p.images, { width: canvas.width, height: canvas.height }); painted.current = true; } catch { /* yoksay */ }
    });
    return () => { alive = false; };
  }, [data, settingsKey, width]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <canvas ref={ref} className={`yc-preview ${className}`} width={Math.round(width * scale)} height={Math.round(height * scale)}
      style={{ aspectRatio: "16 / 9" }} role="img" aria-label={title || "Kapak önizlemesi"} />
  );
}
