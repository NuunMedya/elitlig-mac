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
import { createTimestampSync, monitorFps, pickDue } from "../../../lib/studio/framePacing";
import { createHoleCtx } from "./videoHoles";

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
let rendererNameMemo = null;
/** WebGL'in bildirdiği grafik işlemcisi adı (ör. "ANGLE (NVIDIA, … Direct3D11 …)"); Performans raporu. */
export function gpuRendererName() { softwareGpu(); return rendererNameMemo; }
export function softwareGpu() {
  if (softwareGpuMemo !== null) return softwareGpuMemo;
  softwareGpuMemo = false;
  try {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl2") || c.getContext("webgl");
    if (!gl) { softwareGpuMemo = true; rendererNameMemo = "WebGL yok"; return true; }
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const name = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    rendererNameMemo = name;
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
  // Ayna (Program ekranı) SUNUMU ekran karesinde (rAF): gelen küçük kareler işçinin ideal tik
  // zamanıyla kuyruğa girer, her ekran karesinde zamanı gelmiş en yeni kare basılır. İleti
  // geliş titreşimi (çift / atlanan kare) Program ekranına yansımaz.
  const mq = []; // [{ bmp, ts }] (ts: yerel ideal tik zamanı)
  const msync = createTimestampSync();
  let mraf = 0;
  let mShown = null;
  let vsyncAt = 0;
  let vsync = 0; // ekran karesi aralığı (ms, ortalama)
  const presentMirror = (now) => {
    mraf = 0;
    if (dead) return;
    if (vsyncAt && now - vsyncAt < 50) vsync = vsync ? vsync * 0.9 + (now - vsyncAt) * 0.1 : now - vsyncAt;
    vsyncAt = now;
    if (mq.length) {
      if (vsync > 4) msync.align(now, vsync, mq[mq.length - 1].ts);
      const idx = pickDue(mq, now, msync);
      for (let i = 0; i < idx; i += 1) { try { mq.shift().bmp.close(); } catch { /* yoksay */ } }
      const head = mq[0];
      if (head && head !== mShown && msync.dueAt(head.ts) <= now) {
        try {
          const ctx = mirrorCanvas.getContext("2d", { alpha: false });
          ctx.drawImage(head.bmp, 0, 0, mirrorCanvas.width, mirrorCanvas.height);
          mirrorN += 1;
          lastMirrorAt = performance.now();
        } catch { /* yoksay */ }
        mShown = head;
      }
    }
    if (mq.length > 1 || (mq[0] && mq[0] !== mShown)) mraf = requestAnimationFrame(presentMirror);
  };

  const fail = (reason) => { if (dead) return; dead = true; try { enc?.handlers.onError?.("WORKER", reason); } catch { /* yoksay */ } try { onFail?.(reason); } catch { /* yoksay */ } };
  const post = (m, tr) => { if (dead) return false; try { worker.postMessage(m, tr || []); return true; } catch { return false; } };

  const mirrorSize = (W, H) => { const w = Math.min(W, W >= 1920 ? 1280 : 960); return { w, h: Math.round((w * H) / W), fps: monitorFps(fps) }; };
  const initMirror = (W, H) => { const m = mirrorSize(W, H); if (mirrorCanvas.width !== m.w) mirrorCanvas.width = m.w; if (mirrorCanvas.height !== m.h) mirrorCanvas.height = m.h; return m; };

  worker.onmessage = (e) => {
    const m = e.data || {};
    if (m.type === "mirror") {
      post({ type: "mirrorAck" });
      const ts = Number.isFinite(m.tAbs) ? m.tAbs - performance.timeOrigin : performance.now();
      if (mq.length && ts <= mq[mq.length - 1].ts) { for (const x of mq) { try { x.bmp.close(); } catch { /* yoksay */ } } mq.length = 0; mShown = null; }
      msync.observe(ts, performance.now());
      mq.push({ bmp: m.bmp, ts });
      while (mq.length > 4) { try { mq.shift().bmp.close(); } catch { /* yoksay */ } }
      if (!mraf && typeof requestAnimationFrame === "function") mraf = requestAnimationFrame(presentMirror);
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
    if (m.type === "srcFirst") { for (const v of vids.values()) if (v.id === m.id && v.gen === m.gen) v.ready = true; return; }
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

  /* ─────────────── kip tabanı: videolar işçide (2.36.0) ─────────────── */
  // Tekrar / VAR / röportaj / özet tabanı ana iş parçacığında çizilir (React durumuna bağlı
  // katmanlar, izler, rozetler). İçindeki VİDEO kareleri ise artık işçide çizilir: ana taraf
  // drawImage(video) çağrısını yakalar, videonun yerini / dönüşümünü / saydamlığını bildirir ve
  // tabanda o bölgeyi deler (destination-out). İşçi her tikte EN SON video karesini (kendi
  // beslemesinden; MediaStreamTrackProcessor) çizer, tabanı üstüne koyar. Böylece ana iş
  // parçacığı takılsa da (panel açma, GC) tekrar görüntüsü akmaya devam eder; ana taraf piksel
  // kopyalamaz. Kırpma (clip), süzgeç (filter) ya da başka birleştirme kipiyle çizilen video,
  // ya da beslemesi henüz ilk karesini vermemiş video eski yolla (ana iş parçacığında) çizilir.
  const vids = new Map(); // video öğesi → { id, key, gen, ready, lastUsed, stop }
  let vidSeq = 0;
  const elTrack = (el) => {
    const own = el.srcObject?.getVideoTracks?.()[0];
    if (own) return own.readyState === "live" ? own : null;
    if (typeof el.captureStream !== "function" || !el.currentSrc) return null;
    let st = captured.get(el);
    if (!st) { try { st = el.captureStream(); captured.set(el, st); } catch { return null; } }
    const t = st.getVideoTracks()[0];
    return t && t.readyState === "live" ? t : null;
  };
  function stopVid(el) {
    const v = vids.get(el);
    if (!v) return;
    vids.delete(el);
    try { v.stop?.(); } catch { /* yoksay */ }
    post({ type: "srcOff", id: v.id });
  }
  function vidFeed(el, now) {
    const track = elTrack(el);
    const key = track ? track.id : null;
    let v = vids.get(el);
    if (v && v.key === key) { v.lastUsed = now; return v; }
    if (v) stopVid(el);
    if (!track || dead) return null;
    const id = `vid:${++vidSeq}`;
    const g = ++gen;
    v = { id, key, gen: g, ready: false, lastUsed: now, stop: null };
    const t = track.clone();
    try {
      const proc = new MediaStreamTrackProcessor({ track: t });
      if (!post({ type: "srcStream", id, gen: g, readable: proc.readable, notify: true }, [proc.readable])) { t.stop(); return null; }
      v.stop = () => t.stop();
    } catch { t.stop(); return null; }
    vids.set(el, v);
    return v;
  }
  /** 3 sn kullanılmayan video beslemeleri bırakılır. */
  function gcVideos(now) { for (const [el, v] of vids) if (now - v.lastUsed > 3000) stopVid(el); }

  /** Tabanın çizim bağlamı: drawImage(video) yerine yer bildirimi (./videoHoles). */
  function holeCtx(ctx, now, placements) {
    return createHoleCtx(ctx, { placements, isVideo, feedFor: (el) => vidFeed(el, now) });
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
    holeCtx,
    gcVideos,
    baseVideos: () => vids.size,
    videoTrack,
    stats: () => ({ ...(stats.draw || {}), enc: stats.enc, ageMs: stats.at ? Math.round(performance.now() - stats.at) : null, mirrorAgeMs: lastMirrorAt ? Math.round(performance.now() - lastMirrorAt) : null, mirrors: mirrorN, feeds: feeds.size }),
    alive: () => !dead,
    resize(W, H, f) { post({ type: "size", width: W, height: H, fps: f, mirror: initMirror(W, H) }); },
    /** Program ekranı (ayna) hızı: ekran yöneticisi düşürür / yükseltir (yayın çıkışı etkilenmez). */
    setMirrorFps(f) { post({ type: "mirrorFps", fps: Math.max(1, Math.min(monitorFps(fps), Math.round(Number(f) || 30))) }); },
    stop() {
      if (dead) return;
      for (const id of [...feeds.keys()]) { try { feeds.get(id)?.stop?.(); } catch { /* yoksay */ } }
      feeds.clear();
      for (const v of vids.values()) { try { v.stop?.(); } catch { /* yoksay */ } }
      vids.clear();
      try { tap?.writer.close().catch(() => {}); tap?.track.stop(); } catch { /* yoksay */ }
      post({ type: "stop" });
      dead = true;
      if (mraf) cancelAnimationFrame(mraf);
      for (const x of mq) { try { x.bmp.close(); } catch { /* yoksay */ } }
      mq.length = 0;
      setTimeout(() => { try { worker.terminate(); } catch { /* yoksay */ } }, 500);
    },
  };
}
