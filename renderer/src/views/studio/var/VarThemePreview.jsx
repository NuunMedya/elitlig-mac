// Yayın Stüdyosu · VAR teması canlı önizlemesi: yayındaki ÇİZİM KODUNUN AYNISI
// (drawVarPreview) küçük bir tuvalde, sahte saha görüntüsüyle. animate: true ise
// ~30 kare/sn oynar (nabız, tarama, karar animasyonu); değilse tek kare.
import React, { useEffect, useRef } from "react";
import logoInline from "../../../assets/elitlig-beyaz.png?inline";
import { drawVarPreview } from "./drawVar";

let logoImg = null;
const logo = () => {
  if (!logoImg && typeof Image !== "undefined") { logoImg = new Image(); logoImg.src = logoInline; }
  return logoImg;
};
const STILL_NOW = 123_456;

export default function VarThemePreview({ theme, layout = "two", state = "review", decision = "goalOff", width = 320, height = 180, animate = false, fluid = false, className = "", title }) {
  const ref = useRef(null);
  const decisionAtRef = useRef(0);
  const key = `${state}:${decision}`;
  const lastKey = useRef(key);
  useEffect(() => {
    const c = ref.current;
    if (!c) return undefined;
    const dpr = Math.min(2, (typeof window !== "undefined" && window.devicePixelRatio) || 1);
    c.width = Math.round(width * dpr);
    c.height = Math.round(height * dpr);
    const ctx = c.getContext("2d");
    if (!ctx) return undefined;
    // Karar değişince karar animasyonu baştan oynasın.
    if (lastKey.current !== key) { lastKey.current = key; decisionAtRef.current = performance.now(); }
    const im = logo();
    const paint = (now, still) => {
      try {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, c.width, c.height);
        drawVarPreview(ctx, c.width, c.height, now, {
          theme, layout, state, decision, logo: im,
          decisionAt: still ? now - 3000 : (decisionAtRef.current || now - 3000), startedAt: still ? now - 83_400 : undefined,
        });
      } catch { /* önizleme hatası arayüzü bozmasın */ }
    };
    if (!animate) {
      paint(STILL_NOW, true);
      const onLoad = () => paint(STILL_NOW, true);
      im?.addEventListener?.("load", onLoad);
      return () => im?.removeEventListener?.("load", onLoad);
    }
    let raf = 0;
    let last = 0;
    const loop = (t) => {
      raf = requestAnimationFrame(loop);
      if (t - last < 33) return;
      last = t;
      paint(t, false);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [theme, layout, state, decision, width, height, animate, key]);
  return <canvas ref={ref} className={`vth-canvas ${className}`} style={fluid ? { width: "100%", height: "auto", aspectRatio: `${width} / ${height}` } : { width, height }} aria-label={title || "VAR teması önizlemesi"} />;
}
