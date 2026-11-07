// Yayın Stüdyosu — AÇI KAYDI için görüntü ayarlı akış.
//
// Kaynağın görüntü ayarı varsa tekrar açısı da ayarlı görünmeli: kaynağın kendi
// boyutunda bir tuvale işlenmiş kare çizilir (fxProcessor: program aynı kareyi zaten
// işlediyse yeniden işlenmez) ve tuvalin captureStream izi kaydediciye verilir.
// Zamanlayıcı setInterval (pencere arka plandayken rAF durur, kayıt durmamalı).
import { drawableOf } from "../draw";
import { effectiveFx } from "../../../lib/studio/videoFx";
import { processFrame } from "./fxProcessor";

/**
 * getSource(): güncel kaynak; getRt(): güncel çalışma zamanı. Dönüş { track, stop } ya da null.
 */
export function createFxFeed(getSource, getRt, fps = 30) {
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = 1280; c.height = 720;
  let stream = null;
  try { stream = c.captureStream(fps); } catch { return null; }
  const track = stream.getVideoTracks()[0];
  if (!track) return null;
  const ctx = c.getContext("2d", { alpha: false });
  const tick = () => {
    const s = getSource();
    const d = drawableOf(getRt(), performance.now());
    if (!s || !d) return;
    const fx = effectiveFx(s, null);
    const out = (fx && processFrame(s.id, d, fx, { now: performance.now(), maxAge: 1000 / fps })) || d;
    if (c.width !== out.w || c.height !== out.h) { c.width = out.w; c.height = out.h; }
    try { ctx.drawImage(out.el, 0, 0, out.w, out.h, 0, 0, out.w, out.h); } catch { /* kare hazır değil */ }
  };
  tick();
  const t = setInterval(tick, Math.max(10, Math.round(1000 / fps)));
  return {
    track,
    stop: () => { clearInterval(t); stream.getTracks().forEach((x) => x.stop()); },
  };
}
