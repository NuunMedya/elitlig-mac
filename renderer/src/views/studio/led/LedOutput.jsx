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
import { countdownText, ledFxRect, normalizeLedFx, sponsorIndex, tickerX } from "./ledFx";

const IDLE_MS = 2500;
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

/** Ortalı büyük yazı (çok satır; sığmazsa küçülür). size: ekran boyuna oran, dy: dikey kayma oranı. */
function bigText(ctx, text, W, H, color, size = 0.16, dy = 0, alpha = 1) {
  const lines = String(text || "").split(/\n/).filter((l, i, a) => l || a.length === 1);
  let px = Math.round(H * size);
  ctx.save();
  ctx.fillStyle = color || "#fff";
  ctx.globalAlpha = alpha;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const widest = () => Math.max(...lines.map((l) => ctx.measureText(l).width));
  ctx.font = `900 ${px}px ${FONT}`;
  while (px > 12 && (widest() > W * 0.92 || px * lines.length * 1.15 > H * 0.9)) { px = Math.round(px * 0.9); ctx.font = `900 ${px}px ${FONT}`; }
  const lh = px * 1.15;
  const y0 = H / 2 + H * dy - ((lines.length - 1) * lh) / 2;
  lines.forEach((l, i) => ctx.fillText(l, W / 2, y0 + i * lh));
  ctx.restore();
}

/** Alt kayan yazı bandı. */
function drawTicker(ctx, W, H, t, ms) {
  const h = Math.round(H * 0.09);
  ctx.save();
  ctx.fillStyle = t.bg || "#5b21b6";
  ctx.fillRect(0, H - h, W, h);
  ctx.font = `800 ${Math.round(h * 0.55)}px ${FONT}`;
  ctx.fillStyle = t.color || "#fff";
  ctx.textBaseline = "middle";
  const text = `${t.text}     •     `;
  const tw = ctx.measureText(text).width;
  let x = tickerX(ms, tw, W, t.speed);
  // Kesintisiz: metin soldan sağa ekranı doldurana kadar yinelenir.
  while (x > 0) x -= tw;
  while (x < W) { ctx.fillText(text, x, H - h / 2); x += tw; }
  ctx.restore();
}
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
    // İçerik önce ara tuvale çizilir; parlaklık / ölçek / konum ayarıyla LED tuvaline basılır.
    const buf = document.createElement("canvas");
    const imgs = new Map(); // adres → Image (ayna karesi, sponsor logoları)
    const imageOf = (url) => {
      if (!url) return null;
      let im = imgs.get(url);
      if (!im) {
        im = new Image();
        im.decoding = "async";
        im.src = url;
        imgs.set(url, im);
        // Ayna kareleri sürekli değişir: önbellek şişmesin.
        if (imgs.size > 40) imgs.delete(imgs.keys().next().value);
      }
      return im.complete && im.naturalWidth ? im : null;
    };
    const lastMirror = { im: null };
    const t0 = performance.now();
    const drawContent = (ctx, s, W, H, fx) => {
      const id = s.scene?.id ?? null;
      const now = performance.now();
      if (fx.content === "scene") {
        drawScene(ctx, s.route === "off" ? null : s.scene, s.sources || [], src.runtimeRef.current, W, H, { now });
        if (s.graphics && s.scene && drawGraphicsSafe) { try { drawGraphicsSafe(ctx, { width: W, height: H, now: Date.now(), sceneId: id, target: "led" }, s.graphics); } catch { /* yoksay */ } }
        return;
      }
      ctx.fillStyle = fx.bg || "#000";
      ctx.fillRect(0, 0, W, H);
      if (fx.content === "mirror") {
        const im = imageOf(s.frame) || lastMirror.im;
        if (im) { lastMirror.im = im; ctx.drawImage(im, 0, 0, W, H); }
        return;
      }
      if (fx.content === "scoreboard") {
        if (s.graphics && drawGraphicsSafe) { try { drawGraphicsSafe(ctx, { width: W, height: H, now: Date.now(), sceneId: null, target: "led" }, s.graphics); } catch { /* yoksay */ } }
        return;
      }
      if (fx.content === "sponsor") {
        const list = fx.sponsors || [];
        const i = sponsorIndex(now - t0, list.length, fx.sponsorSec);
        const sp = list[i];
        const im = sp ? imageOf(sp.logo) : null;
        if (im) {
          const k = Math.min((W * 0.7) / im.naturalWidth, (H * 0.7) / im.naturalHeight);
          const w = im.naturalWidth * k, h = im.naturalHeight * k;
          ctx.drawImage(im, (W - w) / 2, (H - h) / 2, w, h);
        } else bigText(ctx, sp?.name || "SPONSOR", W, H, fx.textColor, 0.16);
        return;
      }
      if (fx.content === "clock") {
        const d = new Date();
        bigText(ctx, d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }), W, H, fx.textColor, 0.26, -0.04);
        bigText(ctx, d.toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long" }).toLocaleUpperCase("tr-TR"), W, H, fx.textColor, 0.07, 0.2, 0.75);
        return;
      }
      if (fx.content === "countdown") {
        if (fx.countdownLabel) bigText(ctx, fx.countdownLabel.toLocaleUpperCase("tr-TR"), W, H, fx.textColor, 0.08, -0.22, 0.8);
        bigText(ctx, countdownText(fx.countdownEndsAt), W, H, fx.textColor, 0.3, 0.06);
        return;
      }
      bigText(ctx, fx.text || "", W, H, fx.textColor, 0.16);
    };
    const loop = () => {
      const c = canvasRef.current;
      const s = stateRef.current;
      const fx = normalizeLedFx(s?.fx);
      // Dondur: son kare kalır (hiç çizilmez).
      if (c && s && !fx.freeze) {
        const W = s.width || 1920;
        const H = s.height || 1080;
        if (c.width !== W) c.width = W;
        if (c.height !== H) c.height = H;
        const ctx = c.getContext("2d", { alpha: false });
        const plain = fx.content === "scene" && fx.brightness >= 100 && fx.scale === 100 && !fx.offX && !fx.offY;
        if (fx.black) { ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H); fade.id = undefined; }
        else {
          const id = fx.content === "scene" ? s.scene?.id ?? null : `fx:${fx.content}`;
          if (fade.id !== undefined && id !== fade.id) {
            // Sahne / içerik değişti: son kareyi sakla, üstte solarak kaybolsun.
            if (fade.snap.width !== W) fade.snap.width = W;
            if (fade.snap.height !== H) fade.snap.height = H;
            fade.snap.getContext("2d").drawImage(c, 0, 0);
            fade.at = performance.now();
          }
          fade.id = id;
          if (plain) drawContent(ctx, s, W, H, fx);
          else {
            if (buf.width !== W) buf.width = W;
            if (buf.height !== H) buf.height = H;
            drawContent(buf.getContext("2d", { alpha: false }), s, W, H, fx);
            ctx.fillStyle = "#000";
            ctx.fillRect(0, 0, W, H);
            const r = ledFxRect(W, H, fx);
            ctx.save();
            ctx.globalAlpha = fx.brightness / 100;
            ctx.drawImage(buf, r.x, r.y, r.w, r.h);
            ctx.restore();
          }
          const p = fade.at ? (performance.now() - fade.at) / FADE_MS : 1;
          if (p < 1) { ctx.save(); ctx.globalAlpha = 1 - p; ctx.drawImage(fade.snap, 0, 0, W, H); ctx.restore(); } else fade.at = 0;
        }
        if (fx.ticker.on && fx.ticker.text && !fx.black) drawTicker(ctx, W, H, fx.ticker, performance.now() - t0);
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
