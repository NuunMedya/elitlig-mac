// Yayın Stüdyosu · LED ÇIKIŞ PENCERESİ ("#led-output" yolu).
//
// Ana süreç LED ekranında tam ekran bir BrowserWindow açar ve uygulamanın
// index.html#led-output adresini yükler (studio.led.open({ mode: "studio" })).
// Bu görünüm stüdyodan gelen durumu (studio.led.onState) dinler: seçilen
// sahneyi kendi tuvaline çizer (kamera / ekran kaynaklarını bu pencerede
// ayrıca açar) ve yayın grafiklerini grafik modülüyle (drawGraphics) üstüne
// basar. Oturum açma / kabuk yok; imleç gizli, Esc ana sürece kapatma isteği.
//
// Yönlendirme "Yayın (Program)" iken stüdyo her program değişiminde yeni sahneyi
// gönderir; burada sahne değişince 350 ms yumuşak geçiş yapılır (son kare
// üstte solar). "Kapalı" (route: "off" / sahne yok) → siyah ekran.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { drawScene } from "../draw";
import { useStudioSources } from "../useStudioSources";
import { drawGraphicsSafe } from "../scenes/graphicsBridge";

export default function LedOutput() {
  const [state, setState] = useState(null);
  const stateRef = useRef(null);
  stateRef.current = state;
  const canvasRef = useRef(null);
  const sources = useMemo(() => state?.sources || [], [state?.sources]);
  // Kaynak listesi yalnız değişince yeniden kurulur (her durumda yeni dizi gelir).
  const sourcesKey = JSON.stringify(sources.map((s) => [s.id, s.kind, s.deviceId, s.screenId, s.url && String(s.url).length, s.resolution]));
  const stableSources = useMemo(() => sources, [sourcesKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const src = useStudioSources(stableSources);

  useEffect(() => {
    document.title = "ElitLig LED";
    document.body.style.background = "#000";
    document.body.style.cursor = "none";
    const led = window.elitlig?.studio?.led;
    const off = led?.onState?.((s) => { if (s && typeof s === "object") setState(s); });
    // Pencere geç açıldıysa son durum hemen alınır.
    Promise.resolve(led?.getState?.()).then((s) => { if (s && typeof s === "object") setState((cur) => cur || s); }).catch(() => {});
    const onKey = (e) => { if (e.key === "Escape") window.elitlig?.studio?.led?.close?.(); };
    window.addEventListener("keydown", onKey);
    return () => { off?.(); window.removeEventListener("keydown", onKey); };
  }, []);

  useEffect(() => {
    let raf = 0;
    const fade = { id: undefined, at: 0, snap: document.createElement("canvas") };
    const FADE_MS = 350;
    const loop = () => {
      const c = canvasRef.current;
      const s = stateRef.current;
      if (c && s) {
        const W = s.width || 1920;
        const H = s.height || 1080;
        if (c.width !== W) c.width = W;
        if (c.height !== H) c.height = H;
        const ctx = c.getContext("2d", { alpha: false });
        const id = s.scene?.id ?? null;
        if (fade.id !== undefined && id !== fade.id) {
          // Sahne değişti: son kareyi sakla, üstte solarak kaybolsun.
          if (fade.snap.width !== W) fade.snap.width = W;
          if (fade.snap.height !== H) fade.snap.height = H;
          fade.snap.getContext("2d").drawImage(c, 0, 0);
          fade.at = performance.now();
        }
        fade.id = id;
        drawScene(ctx, s.route === "off" ? null : s.scene, s.sources || [], src.runtimeRef.current, W, H, { now: performance.now() });
        if (s.graphics && s.scene && drawGraphicsSafe) { try { drawGraphicsSafe(ctx, { width: W, height: H, now: Date.now(), sceneId: id, target: "led" }, s.graphics); } catch { /* yoksay */ } }
        const p = fade.at ? (performance.now() - fade.at) / FADE_MS : 1;
        if (p < 1) { ctx.save(); ctx.globalAlpha = 1 - p; ctx.drawImage(fade.snap, 0, 0, W, H); ctx.restore(); } else fade.at = 0;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [src.runtimeRef]);

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000", display: "grid", placeItems: "center" }}>
      <canvas ref={canvasRef} style={{ width: "100vw", height: "100vh", objectFit: "contain", display: "block" }} />
      {!state && <div style={{ position: "absolute", color: "rgba(255,255,255,0.4)", font: "600 18px -apple-system, sans-serif" }}>LED çıkışı · stüdyodan görüntü bekleniyor…</div>}
    </div>
  );
}
