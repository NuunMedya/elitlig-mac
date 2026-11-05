// Yayın Stüdyosu — MAÇ ÖZETİ çizimi ve kaydı (ekran dışı 1920×1080 tuval).
//
// Plan (lib/studio/highlights.js buildHighlightPlan) gerçek zamanlı oynatılır:
// giriş kartı (maç adı, takımlar, son skor, tarih) → klipler (orta-alt büyük
// skorbord o anın skoruyla, GOL · OYUNCU bandı) → kapanış kartı; her sınırda
// ElitLig logo geçişi. Tuval + kliplerin sesi MediaRecorder'a verilir, 250 ms
// parçalar sırayla studio.render.pushChunk(renderId, …) ile ana sürece gider;
// finish(renderId) MP4 dosyasını döndürür.
import { HIGHLIGHT_SIZE, planAt } from "../../lib/studio/highlights";
import { drawBottomBoard, bugFont } from "../../lib/studio/scorebug";
import { drawStinger } from "../../lib/studio/stinger";
import { MIME_PREFERENCE, pickMimeType, recorderBitsPerSecond } from "../../lib/studio/broadcast";
import { drawVideoFull } from "./draw";

const studio = () => window.elitlig?.studio;

function loadVideo(url) {
  return new Promise((resolve) => {
    const el = document.createElement("video");
    el.playsInline = true;
    el.preload = "auto";
    el.crossOrigin = "anonymous";
    let done = false;
    const finish = (ok) => { if (done) return; done = true; resolve(ok ? el : null); };
    el.addEventListener("loadeddata", () => finish(true), { once: true });
    el.addEventListener("error", () => {
      // CORS'suz yeniden dene (yerel elitlig-studio:// şeması CORS başlığı vermeyebilir).
      if (el.crossOrigin) { el.removeAttribute("crossorigin"); el.src = url; el.load(); return; }
      finish(false);
    });
    setTimeout(() => finish(el.readyState >= 2), 15000);
    el.src = url;
    el.load();
  });
}

const ready = (img) => Boolean(img && (img.naturalWidth || img.width));
function contain(ctx, img, x, y, w, h) {
  if (!ready(img)) return;
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const k = Math.min(w / iw, h / ih);
  ctx.drawImage(img, x + (w - iw * k) / 2, y + (h - ih * k) / 2, iw * k, ih * k);
}

/** Giriş / kapanış kartı. kind: "intro" | "outro"; local: kartın içindeki ms. */
export function drawCard(ctx, W, H, kind, info, images, local = 0) {
  const s = W / 1920;
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, "#14001f");
  g.addColorStop(0.55, "#3d0070");
  g.addColorStop(1, "#54009c");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // Hafif çapraz şeritler.
  ctx.save();
  ctx.globalAlpha = 0.07;
  ctx.fillStyle = "#d8bfff";
  for (let i = -4; i < 14; i += 1) {
    const x = i * 220 * s + ((local / 40) % (220 * s));
    ctx.beginPath();
    ctx.moveTo(x, H); ctx.lineTo(x + 90 * s, H); ctx.lineTo(x + 90 * s + 400 * s, 0); ctx.lineTo(x + 400 * s, 0);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  const appear = Math.min(1, local / 600);
  ctx.save();
  ctx.globalAlpha = appear;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  contain(ctx, images.logo, W / 2 - 70 * s, 120 * s, 140 * s, 140 * s);
  ctx.fillStyle = "#d8bfff";
  ctx.font = bugFont(30 * s, 800);
  ctx.fillText(kind === "intro" ? "MAÇ ÖZETİ" : "MAÇ SONU", W / 2, 310 * s);
  if (info.title) {
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.font = bugFont(24 * s, 600);
    ctx.fillText(info.title, W / 2, 360 * s, W * 0.8);
  }
  // Takımlar ve skor.
  const y = 590 * s;
  contain(ctx, images.home, W / 2 - 640 * s, y - 110 * s, 220 * s, 220 * s);
  contain(ctx, images.away, W / 2 + 420 * s, y - 110 * s, 220 * s, 220 * s);
  ctx.fillStyle = "#fff";
  ctx.font = bugFont(40 * s, 800);
  const up = (v) => String(v || "").toLocaleUpperCase("tr-TR");
  ctx.fillText(up(info.homeName), W / 2 - 530 * s, y + 160 * s, 520 * s);
  ctx.fillText(up(info.awayName), W / 2 + 530 * s, y + 160 * s, 520 * s);
  ctx.font = bugFont(170 * s, 900);
  ctx.fillText(`${info.score?.home ?? 0}`, W / 2 - 150 * s, y);
  ctx.fillText(`${info.score?.away ?? 0}`, W / 2 + 150 * s, y);
  ctx.fillStyle = "#a855f7";
  ctx.fillRect(W / 2 - 24 * s, y - 6 * s, 48 * s, 12 * s);
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.font = bugFont(26 * s, 700);
  if (info.date) ctx.fillText(info.date, W / 2, 880 * s);
  if (kind === "outro") {
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.font = bugFont(22 * s, 600);
    ctx.fillText("elitlig.com", W / 2, 940 * s);
  }
  ctx.restore();
}

/**
 * Özeti oluşturur. Dönüş: { ok, file } | { ok: false, error }.
 * opts: { plan, info: { title, homeName, awayName, score, date }, images,
 *         boardOf(segment) → skorbord durumu, signal: { cancelled }, onProgress(p, t) }
 */
export async function renderHighlight({ plan, info, images, boardOf, signal, onProgress, onPhase }) {
  const s = studio();
  if (!s?.render?.start) return { ok: false, error: { message: "Özet oluşturma bu uygulama sürümünde yok. Uygulamayı güncelleyin." } };
  const { width: W, height: H, fps, videoBitrateKbps } = HIGHLIGHT_SIZE;

  // 1. Klipleri yükle.
  onPhase?.("preparing");
  const clipSegs = plan.segments.filter((x) => x.type === "clip");
  const videos = new Map();
  let loaded = 0;
  for (const seg of clipSegs) {
    if (signal.cancelled) return { ok: false, cancelled: true };
    const el = await loadVideo(seg.url);
    loaded += 1;
    onProgress?.(0, 0, { loaded, total: clipSegs.length });
    if (el) videos.set(seg, el);
  }
  if (!videos.size && clipSegs.length) return { ok: false, error: { message: "Kliplerin hiçbiri açılamadı." } };

  // 2. Tuval, ses, kaydedici.
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d", { alpha: false });
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);
  let audioCtx = null;
  let dest = null;
  try {
    audioCtx = new AudioContext({ sampleRate: 48000 });
    dest = audioCtx.createMediaStreamDestination();
    for (const el of videos.values()) {
      try { audioCtx.createMediaElementSource(el).connect(dest); el.muted = false; } catch { el.muted = true; }
    }
    await audioCtx.resume().catch(() => {});
  } catch { audioCtx = null; dest = null; }
  const tracks = [canvas.captureStream(fps).getVideoTracks()[0], dest?.stream.getAudioTracks()[0]].filter(Boolean);
  const mimeType = pickMimeType((t) => MediaRecorder.isTypeSupported(t), MIME_PREFERENCE);
  const res = await s.render.start({ width: W, height: H, fps, videoBitrateKbps, mimeType, audio: tracks.length > 1 });
  if (!res?.ok || !res.renderId) { audioCtx?.close().catch(() => {}); return { ok: false, error: res?.error || { message: "Özet kaydı başlatılamadı." } }; }
  const renderId = res.renderId;
  let rec;
  try {
    rec = new MediaRecorder(new MediaStream(tracks), { mimeType: mimeType || undefined, videoBitsPerSecond: recorderBitsPerSecond(videoBitrateKbps), audioBitsPerSecond: 160_000 });
  } catch (e) {
    s.render.cancel?.(renderId);
    audioCtx?.close().catch(() => {});
    return { ok: false, error: { message: `Kaydedici açılamadı: ${e?.message || e}` } };
  }
  let chain = Promise.resolve();
  rec.ondataavailable = (e) => {
    if (!e.data?.size) return;
    const blob = e.data;
    chain = chain.then(async () => { const buf = await blob.arrayBuffer(); await s.render.pushChunk(renderId, buf); }).catch(() => {});
  };
  const stopped = new Promise((r) => { rec.onstop = r; });
  onPhase?.("rendering");
  rec.start(250);

  // 3. Gerçek zamanlı oynat ve çiz.
  const t0 = performance.now();
  let current = null;
  await new Promise((resolve) => {
    const tick = () => {
      if (signal.cancelled) { resolve(); return; }
      const t = performance.now() - t0;
      const at = planAt(plan, t);
      if (at.segment !== current) {
        if (current && videos.get(current)) { try { videos.get(current).pause(); } catch { /* yoksay */ } }
        current = at.segment;
        const el = videos.get(current);
        if (el) { el.currentTime = 0; el.play().catch(() => {}); }
      }
      const seg = at.segment;
      if (seg?.type === "clip") {
        const el = videos.get(seg);
        if (el) drawVideoFull(ctx, el, W, H); else { ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H); }
        const board = boardOf?.(seg);
        if (board) drawBottomBoard(ctx, board, { outW: W, outH: H, images });
      } else if (seg) {
        drawCard(ctx, W, H, seg.type, info, images, at.local);
      }
      if (at.stinger != null) drawStinger(ctx, W, H, at.stinger, images.logo);
      onProgress?.(Math.min(1, t / plan.durationMs), t);
      if (at.done) { resolve(); return; }
      setTimeout(tick, 1000 / fps / 2);
    };
    tick();
  });
  for (const el of videos.values()) { try { el.pause(); el.removeAttribute("src"); el.load(); } catch { /* yoksay */ } }
  try { rec.stop(); } catch { /* yoksay */ }
  await stopped;
  await chain;
  audioCtx?.close().catch(() => {});
  tracks.forEach((t) => { try { t.stop(); } catch { /* yoksay */ } });
  if (signal.cancelled) { await s.render.cancel?.(renderId); return { ok: false, cancelled: true }; }
  onPhase?.("finishing");
  const out = await s.render.finish(renderId);
  if (!out?.ok || !out.file) return { ok: false, error: out?.error || { message: "Özet dosyası yazılamadı." } };
  return { ok: true, file: out.file };
}
