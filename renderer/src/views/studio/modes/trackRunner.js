// OYUNCU TAKİBİ — otomatik izleme koşucusu.
//
// Klip görünmez bir <video> öğesinde kare kare (fps, varsayılan 15) sarılır, kare küçük
// tuvale (genişlik 480) çizilip 3 kanala (Y + renk) çevrilir; her anahtardan ileri / geri
// parçalar (playerTrack.segmentPlan) iş parçacığında (track.worker.js; açılamazsa ana
// iş parçacığında) NCC şablon eşlemeyle izlenir ve harmanlanır (mergeSegments).
import { mergeSegments, segmentPlan, toChannels, trackSegment } from "../../../lib/studio/playerTrack";
import { prepare } from "../useReplayPlayer";

let worker = null;
let wid = 0;
const waiting = new Map();
function getWorker() {
  if (worker !== null) return worker;
  try {
    worker = new Worker(new URL("./track.worker.js", import.meta.url), { type: "module" });
    worker.onmessage = (e) => { const w = waiting.get(e.data?.id); if (w) { waiting.delete(e.data.id); w(e.data.samples || []); } };
    worker.onerror = () => { for (const w of waiting.values()) w(null); waiting.clear(); worker = false; };
  } catch { worker = false; }
  return worker;
}

function runSegment(frames, key, size) {
  const w = getWorker();
  if (!w) return Promise.resolve(trackSegment(frames, key, { size }));
  return new Promise((resolve) => {
    wid += 1;
    const id = wid;
    waiting.set(id, (res) => resolve(res == null ? trackSegment(frames, key, { size }) : res));
    try { w.postMessage({ id, frames, key, size }); } catch { waiting.delete(id); resolve(trackSegment(frames, key, { size })); }
  });
}

function seekTo(el, t) {
  return new Promise((resolve) => {
    let done = false;
    const fin = () => { if (done) return; done = true; el.removeEventListener("seeked", fin); resolve(); };
    el.addEventListener("seeked", fin);
    setTimeout(fin, 1500);
    try { el.currentTime = t; } catch { fin(); }
  });
}

/**
 * track: { keys, size } · url: açının klibi · inSec / outSec: aralık (outSec 0 → klip sonu) · durSec: kayıtlı süre (yedek).
 * onProgress(0…1) · signal: { cancelled }. Dönüş: { auto: [{ t, x, y, c }], frames } | null (iptal / hata).
 */
export async function runAutoTrack({ url, track, inSec = 0, outSec = 0, durSec = 0, fps = 15, width = 480, onProgress, signal = {} }) {
  if (!url || !track?.keys?.length) return null;
  const el = document.createElement("video");
  el.muted = true; el.playsInline = true; el.preload = "auto";
  try { await prepare(el, url); } catch { return null; }
  // MediaRecorder WebM'lerinde süre çoğu zaman Infinity: sona sarılınca tarayıcı hesaplar.
  if (!Number.isFinite(el.duration)) { await seekTo(el, 1e6); }
  const dur = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : Math.max(0, Number(durSec) || 0);
  const out = outSec > inSec + 0.2 ? Math.min(outSec, dur || outSec) : dur;
  const plan = segmentPlan(track.keys, inSec, Math.max(0, out - 0.04));
  const vw = el.videoWidth || 1280;
  const vh = el.videoHeight || 720;
  const W = Math.min(width, vw);
  const H = Math.max(1, Math.round((W * vh) / vw));
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  const total = plan.reduce((s, p) => s + Math.ceil(Math.abs(p.to - p.from) * fps) + 1, 0) || 1;
  let doneN = 0;
  const segments = [];
  try {
    for (const sg of plan) {
      const n = Math.ceil(Math.abs(sg.to - sg.from) * fps);
      const frames = [];
      for (let i = 0; i <= n; i += 1) {
        if (signal.cancelled) return null;
        const t = i === n ? sg.to : sg.from + (sg.dir * i) / fps;
        await seekTo(el, Math.max(0, Math.min(dur ? dur - 0.02 : t, t)));
        ctx.drawImage(el, 0, 0, W, H);
        frames.push({ t: Math.round(t * 10000) / 10000, frame: toChannels(ctx.getImageData(0, 0, W, H).data, W, H) });
        doneN += 1;
        onProgress?.(Math.min(0.98, doneN / total));
      }
      const samples = await runSegment(frames, sg.key, track.size);
      segments.push({ from: sg.from, to: sg.to, dir: sg.dir, samples });
    }
  } catch { return null; } finally {
    try { el.removeAttribute("src"); el.load(); } catch { /* yoksay */ }
  }
  onProgress?.(1);
  return { auto: mergeSegments(segments, { step: 1 / fps }), frames: total };
}
