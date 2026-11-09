// Yayın Stüdyosu · çizim işçisinin ANA TARAFI (compositor/program.worker.js ile konuşur).
//
//   - kaynak beslemesi: program + önizleme sahnelerindeki canlı kaynaklar işçiye bir kez
//     bağlanır (görüntü izi → MediaStreamTrackProcessor.readable AKTARILIR: kareler ana iş
//     parçacığına uğramaz; dosya videosu → video.captureStream(); görsel / slayt → ImageBitmap;
//     web sayfası tuvali → saniyede birkaç ImageBitmap)
//   - durum eşleme (yalnız değişince ileti): yapılandırma, grafik anlık görüntüsü, FTB,
//     programın anlık durumu, saat, marka logosu, düzenleyicide sürüklenen kutu
//   - ayna: işçiden gelen küçültülmüş kare Program ekranı tuvaline basılır
//   - uzak kodlayıcı: webcodecs.js görüntüyü işçide kodlatır (remoteEncoder)
//   - kare dokunuşu: eski kodlama yolu için MediaStreamTrackGenerator izi
import { resolveScene } from "../../../lib/studio/scenes";
import { STUDIO_FONT_FACES } from "../../../lib/studio/fonts";
import { getImage, snapshotImageUrls } from "../../../lib/studio/graphics";

const isVideo = (el) => typeof HTMLVideoElement !== "undefined" && el instanceof HTMLVideoElement;
const isImg = (el) => typeof HTMLImageElement !== "undefined" && el instanceof HTMLImageElement;
const isCanvas = (el) => typeof HTMLCanvasElement !== "undefined" && el instanceof HTMLCanvasElement;

/** Çizim işçisi kullanılabilir mi (OffscreenCanvas + VideoFrame + aktarılabilir akış). */
export function workerCompositorSupported() {
  return typeof Worker === "function" && typeof OffscreenCanvas === "function" && typeof VideoFrame === "function"
    && typeof MediaStreamTrackProcessor === "function" && typeof createImageBitmap === "function";
}

/**
 * Grafik işlemcisi yazılım mı (SwiftShader / llvmpipe)? Yazılım çiziminde işçideki
 * drawImage(VideoFrame) kareyi CPU'ya eşlerken ana iş parçacığını bekler (ölçüm: ana
 * iş parçacığı %90 meşgulken kare 10 → 49 ms); hızlandırılmış tuvalde (Mac GPU) 0,5 ms ve
 * bağımsız. "Otomatik" bu durumda ana iş parçacığı motorunu seçer.
 */
let softwareGpuMemo = null;
export function softwareGpu() {
  if (softwareGpuMemo !== null) return softwareGpuMemo;
  softwareGpuMemo = false;
  try {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl2") || c.getContext("webgl");
    if (!gl) { softwareGpuMemo = true; return true; }
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const name = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    softwareGpuMemo = /swiftshader|llvmpipe|softpipe|software|basic render/i.test(name);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  } catch { softwareGpuMemo = false; }
  return softwareGpuMemo;
}

const captured = new WeakMap(); // video → captureStream() (dosya / ağ girişi)
function videoTrackOf(rt) {
  const el = rt.el;
  const own = (rt.stream || el?.srcObject)?.getVideoTracks?.()[0];
  if (own) return own.readyState === "live" ? own : null;
  if (!isVideo(el) || typeof el.captureStream !== "function" || !el.currentSrc) return null;
  let s = captured.get(el);
  if (!s) { try { s = el.captureStream(); captured.set(el, s); } catch { return null; } }
  const t = s.getVideoTracks()[0];
  return t && t.readyState === "live" ? t : null;
}

/** Kaynağın besleme anahtarı: değişince işçiye yeniden bağlanır. */
export function feedKeyOf(rt) {
  if (!rt || rt.status !== "live") return "off";
  if (rt.images) return `slides:${rt.images.filter((im) => im.complete && im.naturalWidth).length}:${rt.intervalMs}`;
  const el = rt.el;
  if (isVideo(el)) { const t = videoTrackOf(rt); return t ? `track:${t.id}` : "wait"; }
  if (isImg(el)) return el.complete && el.naturalWidth ? `img:${el.currentSrc || el.src}` : "wait";
  if (isCanvas(el)) return "canvas";
  return "off";
}

/** Program / önizleme / geçiş sahnelerindeki kaynak kimlikleri. */
export function neededSourceIds(cfg, extraSceneIds = []) {
  const ids = new Set();
  if (!cfg) return ids;
  for (const sid of [cfg.programSceneId, cfg.previewSceneId, ...extraSceneIds]) {
    const sc = sid ? resolveScene(cfg, sid) : null;
    for (const l of sc?.layers || []) if (l.sourceId) ids.add(l.sourceId);
  }
  return ids;
}

export function createWorkerCompositor({ width, height, fps, mirrorCanvas, onFail }) {
  const worker = new Worker(new URL("./program.worker.js", import.meta.url), { type: "module" });
  let dead = false;
  let stats = { draw: null, enc: null, at: 0 };
  const feeds = new Map(); // kaynak → { key, gen, stop }
  let gen = 0;
  const sent = {}; // son gönderilen durum (kimlik karşılaştırması)
  let enc = null; // { id, handlers }
  let encSeq = 0;
  let tap = null; // { gen: MediaStreamTrackGenerator, writer }
  let lastMirrorAt = 0;
  let mirrorN = 0;

  const fail = (reason) => { if (dead) return; dead = true; try { enc?.handlers.onError?.("WORKER", reason); } catch { /* yoksay */ } try { onFail?.(reason); } catch { /* yoksay */ } };
  const post = (m, tr) => { if (dead) return false; try { worker.postMessage(m, tr || []); return true; } catch { return false; } };

  const mirrorSize = (W, H) => { const w = Math.min(W, W >= 1920 ? 1280 : 960); return { w, h: Math.round((w * H) / W), fps: Math.min(30, fps) }; };
  const initMirror = (W, H) => { const m = mirrorSize(W, H); if (mirrorCanvas.width !== m.w) mirrorCanvas.width = m.w; if (mirrorCanvas.height !== m.h) mirrorCanvas.height = m.h; return m; };

  worker.onmessage = (e) => {
    const m = e.data || {};
    if (m.type === "mirror") {
      try {
        const ctx = mirrorCanvas.getContext("2d", { alpha: false });
        ctx.drawImage(m.bmp, 0, 0, mirrorCanvas.width, mirrorCanvas.height);
        mirrorN += 1;
        lastMirrorAt = performance.now();
      } catch { /* yoksay */ } finally { try { m.bmp.close(); } catch { /* yoksay */ } post({ type: "mirrorAck" }); }
      return;
    }
    if (m.type === "stats") { stats = { draw: m.draw, enc: m.enc, at: performance.now() }; return; }
    if (m.type === "tap") {
      if (tap?.writer) tap.writer.write(m.frame).catch(() => {});
      else m.frame.close();
      return;
    }
    if (m.type?.startsWith("enc")) {
      if (!enc || m.id !== enc.id) return;
      if (m.type === "encChunk") enc.handlers.onChunk?.(m);
      else if (m.type === "encClock") enc.handlers.onClock?.(m.t0Abs - performance.timeOrigin);
      else if (m.type === "encError") enc.handlers.onError?.(m.reason, m.message);
      else if (m.type === "encReady") enc.handlers.onReady?.();
      return;
    }
    if (m.type === "drawError") console.warn("çizim işçisi", m.message);
  };
  worker.onerror = (e) => { e.preventDefault?.(); fail(String(e.message || "WORKER_ERROR")); };

  const fonts = STUDIO_FONT_FACES.map((f) => ({ ...f, url: new URL(f.url, document.baseURI).href }));
  post({ type: "init", width, height, fps, mirror: initMirror(width, height), mediaProxy: Boolean(window.elitlig), fonts });

  /* ─────────────── kaynak beslemesi ─────────────── */

  function stopFeed(id) {
    const f = feeds.get(id);
    if (!f) return;
    feeds.delete(id);
    try { f.stop?.(); } catch { /* yoksay */ }
    post({ type: "srcOff", id });
  }

  function startFeed(id, rt, key) {
    const g = ++gen;
    const f = { key, gen: g, stop: null };
    feeds.set(id, f);
    if (key === "off" || key === "wait") { post({ type: "srcOff", id }); return; }
    if (key.startsWith("track:")) {
      const track = videoTrackOf(rt)?.clone();
      if (!track) return;
      try {
        const proc = new MediaStreamTrackProcessor({ track });
        if (!post({ type: "srcStream", id, gen: g, readable: proc.readable }, [proc.readable])) { track.stop(); return; }
        f.stop = () => track.stop();
      } catch { track.stop(); }
      return;
    }
    if (key.startsWith("img:")) {
      createImageBitmap(rt.el).then((bmp) => { if (feeds.get(id)?.gen === g) post({ type: "srcBitmap", id, gen: g, bmp }, [bmp]); else bmp.close(); }).catch(() => {});
      return;
    }
    if (key.startsWith("slides:")) {
      const list = rt.images.filter((im) => im.complete && im.naturalWidth);
      Promise.all(list.map((im) => createImageBitmap(im))).then((bmps) => {
        if (feeds.get(id)?.gen === g) post({ type: "srcSlides", id, gen: g, bmps, intervalMs: rt.intervalMs }, bmps); else bmps.forEach((b) => b.close());
      }).catch(() => {});
      return;
    }
    if (key === "canvas") {
      // Web sayfası kaynağı (karesi ana süreçten gelir): ~12 fps kopya, yalnız değişince.
      let busy = false;
      const t = setInterval(() => {
        if (busy || !rt.el?.width) return;
        busy = true;
        createImageBitmap(rt.el).then((bmp) => { busy = false; if (feeds.get(id)?.gen === g) post({ type: "srcFrame", id, gen: g, bmp }, [bmp]); else bmp.close(); }).catch(() => { busy = false; });
      }, 80);
      f.stop = () => clearInterval(t);
    }
  }

  /** Gereken kaynakları bağla / bırak (ucuz: kimlik ve iz denetimi). */
  function syncSources(cfg, runtime, extraSceneIds) {
    if (dead) return;
    const need = neededSourceIds(cfg, extraSceneIds);
    for (const id of [...feeds.keys()]) if (!need.has(id)) stopFeed(id);
    for (const id of need) {
      const rt = runtime?.get(id);
      const key = feedKeyOf(rt);
      const f = feeds.get(id);
      if (f && f.key === key) continue;
      if (f) { try { f.stop?.(); } catch { /* yoksay */ } }
      startFeed(id, rt, key);
    }
  }

  /* ─────────────── durum ─────────────── */

  /** Yalnız değişen alanlar gönderilir. patch: { cfg, snapshot, pgmFx, override, timer, replay, ftb, tr, stinger } */
  function setState(patch, { force = false } = {}) {
    const out = {};
    let any = false;
    for (const [k, v] of Object.entries(patch)) {
      if (!force && sent[k] === v) continue;
      sent[k] = v;
      out[k] = v;
      any = true;
    }
    if (!any) return;
    if ("ftb" in out && out.ftb) out.ftb = { ...out.ftb, atAbs: performance.timeOrigin + out.ftb.at };
    if ("tr" in out && out.tr) out.tr = { kind: out.tr.kind, fromId: out.tr.fromId, toId: out.tr.toId, ms: out.tr.ms, startedAtAbs: performance.timeOrigin + out.tr.startedAt };
    if ("stinger" in out && out.stinger) out.stinger = { ms: out.stinger.ms, startedAtAbs: performance.timeOrigin + out.stinger.startedAt };
    try { worker.postMessage({ type: "state", ...out }); } catch {
      // Klonlanamayan alan (işlev / DOM öğesi): düz JSON kopyası.
      try { worker.postMessage({ type: "state", ...JSON.parse(JSON.stringify(out)) }); } catch { /* yoksay */ }
    }
  }

  let brandLogo = undefined;
  let brandBranding = undefined;
  function setBrand(brand) {
    if (dead || (brand?.logo === brandLogo && brand?.branding === brandBranding)) return;
    brandLogo = brand?.logo; brandBranding = brand?.branding;
    const branding = brandBranding ? JSON.parse(JSON.stringify(brandBranding)) : null;
    const logo = brandLogo;
    if (logo && (logo.naturalWidth || logo.width)) {
      createImageBitmap(logo).then((bmp) => { if (brandLogo === logo) post({ type: "state", brand: { logo: bmp, branding } }, [bmp]); else bmp.close(); }).catch(() => post({ type: "state", brand: { logo: null, branding } }));
    } else post({ type: "state", brand: { logo: null, branding } });
  }

  /* ─────────────── grafik görselleri ─────────────── */

  // Grafik anlık görüntüsündeki görseller (armalar, logo, oyuncu fotoğrafı): ana pencere
  // yükler (önbellekli protokol), hazır olan bir kez ImageBitmap olarak işçiye gider.
  const sentImages = new Map(); // adres → görsel öğesi
  let imgSnap = null;
  function syncImages(snapshot) {
    if (dead || !snapshot) return;
    let urls = [];
    try { urls = snapshotImageUrls(snapshot) || []; } catch { urls = []; }
    if (snapshot === imgSnap && urls.every((u) => sentImages.has(u))) return;
    imgSnap = snapshot;
    for (const u of urls) {
      if (!u || typeof u !== "string") continue;
      const img = getImage(u);
      if (!img || sentImages.get(u) === img) continue;
      sentImages.set(u, img);
      createImageBitmap(img).then((bmp) => { if (!post({ type: "image", url: u, bmp }, [bmp])) bmp.close(); }).catch(() => sentImages.delete(u));
    }
    if (sentImages.size > 200) sentImages.clear();
  }

  /* ─────────────── kip tabanı ─────────────── */

  let baseOn = false;
  function pushBase(canvas, meta, tsMs) {
    if (dead) return;
    let f;
    try {
      f = typeof canvas.transferToImageBitmap === "function" ? canvas.transferToImageBitmap() : new VideoFrame(canvas, { timestamp: Math.round(tsMs * 1000), alpha: "discard" });
    } catch { return; }
    if (!post({ type: "base", frame: f, meta }, [f])) f.close();
    baseOn = true;
  }
  function baseOff() { if (baseOn) { baseOn = false; post({ type: "baseOff" }); } }

  /* ─────────────── uzak kodlayıcı ─────────────── */

  const encoder = {
    /** Görüntüyü işçide kodla. handlers: { onChunk(m), onClock(t0Local), onError(reason, message), onReady() } */
    open({ config, fps: efps, keyframeSec, maxQueue }, handlers) {
      if (dead) return null;
      const id = ++encSeq;
      enc = { id, handlers };
      post({ type: "encOpen", id, config, fps: efps, keyframeSec, maxQueue });
      return {
        id,
        forceKey: () => post({ type: "encKey", id }),
        close: () => { if (enc?.id === id) enc = null; post({ type: "encClose", id }); },
        stats: () => (stats.enc && stats.enc.id === id ? stats.enc : null),
      };
    },
  };

  /** Eski kodlama yolu (MediaRecorder) için program izi: işçi kareleri buraya yazılır. */
  function videoTrack() {
    if (tap) return tap.track;
    if (typeof MediaStreamTrackGenerator !== "function") return null;
    try {
      const g = new MediaStreamTrackGenerator({ kind: "video" });
      tap = { track: g, writer: g.writable.getWriter() };
      post({ type: "tap", on: true });
      return g;
    } catch { return null; }
  }

  return {
    worker,
    encoder,
    syncSources,
    setState,
    setBrand,
    syncImages,
    pushBase,
    baseOff,
    videoTrack,
    stats: () => ({ ...(stats.draw || {}), enc: stats.enc, ageMs: stats.at ? Math.round(performance.now() - stats.at) : null, mirrorAgeMs: lastMirrorAt ? Math.round(performance.now() - lastMirrorAt) : null, mirrors: mirrorN, feeds: feeds.size }),
    alive: () => !dead,
    resize(W, H, f) { post({ type: "size", width: W, height: H, fps: f, mirror: initMirror(W, H) }); },
    stop() {
      if (dead) return;
      for (const id of [...feeds.keys()]) { try { feeds.get(id)?.stop?.(); } catch { /* yoksay */ } }
      feeds.clear();
      try { tap?.writer.close().catch(() => {}); tap?.track.stop(); } catch { /* yoksay */ }
      post({ type: "stop" });
      dead = true;
      setTimeout(() => { try { worker.terminate(); } catch { /* yoksay */ } }, 500);
    },
  };
}
