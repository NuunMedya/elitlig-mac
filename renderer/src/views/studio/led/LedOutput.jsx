// Yayın Stüdyosu · LED ÇIKIŞ PENCERESİ ("#led-output" yolu).
//
// Ana süreç LED ekranında tam ekran bir BrowserWindow açar ve uygulamanın
// index.html#led-output adresini yükler (studio.led.open({ mode: "studio" })).
// Bu görünüm stüdyodan gelen durumu (studio.led.onState) dinler: seçilen
// sahneyi kendi tuvaline çizer (kamera / ekran kaynaklarını bu pencerede
// ayrıca açar) ve yayın grafiklerini grafik modülüyle (drawGraphics) üstüne
// basar. Oturum açma / kabuk yok. İmleç 2,5 sn hareketsiz kalınca gizlenir;
// fare oynayınca sağ üstte "Kapat" düğmesi görünür (pencere kipinde hep görünür).
// Esc ana süreçte yakalanır (led.js: pencere kipinde tek, ayrı ekranda iki basış);
// ⌘⇧L / Ctrl+Shift+L her yerden kapatır.
//
// Yönlendirme "Yayın (Program)" iken stüdyo her program değişiminde yeni sahneyi
// gönderir; burada sahne değişince 350 ms yumuşak geçiş yapılır (son kare
// üstte solar). "Kapalı" (route: "off" / sahne yok) → siyah ekran.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { drawScene } from "../draw";
import { useStudioSources } from "../useStudioSources";
import { drawGraphicsSafe } from "../scenes/graphicsBridge";

const IDLE_MS = 2500;
const closeLed = () => { try { window.elitlig?.studio?.led?.close?.(); } catch { /* yoksay */ } };

export default function LedOutput() {
  const [state, setState] = useState(null);
  const [windowed, setWindowed] = useState(false);
  const [active, setActive] = useState(true); // fare yakın zamanda oynadı
  const [escHint, setEscHint] = useState(false);
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
    const led = window.elitlig?.studio?.led;
    const off = led?.onState?.((s) => { if (s && typeof s === "object") setState(s); });
    Promise.resolve(led?.status?.()).then((st) => { if (st) setWindowed(Boolean(st.windowed)); }).catch(() => {});
    const offStatus = led?.onStatus?.((st) => {
      if (!st) return;
      if (st.open) setWindowed(Boolean(st.windowed));
      if (st.hint === "ESC_AGAIN") { setEscHint(true); setTimeout(() => setEscHint(false), 1500); }
    });
    // Pencere geç açıldıysa son durum hemen alınır.
    Promise.resolve(led?.getState?.()).then((s) => { if (s && typeof s === "object") setState((cur) => cur || s); }).catch(() => {});
    // Yedek: ana süreç Esc'yi yakalamadıysa (eski sürüm) arayüz de kapatır.
    const onKey = (e) => { if (e.key === "Escape") closeLed(); };
    window.addEventListener("keydown", onKey);
    return () => { off?.(); offStatus?.(); window.removeEventListener("keydown", onKey); };
  }, []);

  // İmleç: hareketsizken gizli, oynayınca görünür (Kapat düğmesiyle birlikte).
  useEffect(() => {
    let t = 0;
    const wake = () => {
      setActive(true);
      clearTimeout(t);
      t = setTimeout(() => setActive(false), IDLE_MS);
    };
    wake();
    window.addEventListener("mousemove", wake);
    window.addEventListener("mousedown", wake);
    return () => { clearTimeout(t); window.removeEventListener("mousemove", wake); window.removeEventListener("mousedown", wake); };
  }, []);
  useEffect(() => { document.body.style.cursor = active || windowed ? "default" : "none"; }, [active, windowed]);

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
      {(active || windowed) && (
        <button
          type="button"
          onClick={closeLed}
          title="LED çıkışını kapat (Esc · ⌘⇧L / Ctrl+Shift+L)"
          style={{ position: "absolute", top: 16, right: 16, zIndex: 10, padding: "8px 14px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.35)", background: "rgba(0,0,0,0.65)", color: "#fff", font: "600 14px -apple-system, Segoe UI, sans-serif", cursor: "pointer" }}
        >
          ✕ Kapat
        </button>
      )}
      {escHint && <div style={{ position: "absolute", bottom: 24, padding: "8px 14px", borderRadius: 8, background: "rgba(0,0,0,0.7)", color: "#fff", font: "600 14px -apple-system, Segoe UI, sans-serif" }}>Kapatmak için Esc'ye bir kez daha bas</div>}
    </div>
  );
}
