// Yayın Stüdyosu · PROGRAM ÇİZİM İŞÇİSİ (ayrı iş parçacığı).
//
// Program karesi ana iş parçacığından (React arayüzü, dock panelleri, ölçerler) BAĞIMSIZ,
// kendi sabit kare ızgarasında çizilir ve AYNI işçide VideoEncoder'a verilir:
//
//   kaynak izleri ──(ana: MediaStreamTrackProcessor.readable aktarılır; kareler ana iş
//                    parçacığına uğramadan buraya akar)──▶ son VideoFrame (kaynak başına)
//   görsel / slayt ──(bir kez ImageBitmap)──▶ çizim
//   yapılandırma, geçiş, FTB, grafik anlık görüntüsü ──(değişince ileti)──▶ durum
//   OffscreenCanvas (çıkış boyutu) ── composeBase / composeTop (ana yolla aynı kod) ──▶
//     ├─ VideoEncoder (H.264; kodlanmış parça ana tarafa — mkv birleştirme orada)
//     ├─ ayna: küçültülmüş ImageBitmap (Program ekranı, ≤30 fps, en çok 1 bekleyen)
//     └─ isteğe bağlı kare dokunuşu (eski kodlama yolu: MediaStreamTrackGenerator)
//
// Kip tabanı (tekrar / VAR / röportaj / özet): ana iş parçacığı çizer, VideoFrame olarak
// gelir ("base"); grafik / rozet / logo geçişi / FTB yine burada eklenir.
import { createFrameClock, createKeyframePlanner } from "../../../lib/studio/encodepath";
import { drawGraphics, putImage } from "../../../lib/studio/graphics";
import { composeBase, composeTop, drawFtb, drawProgramFx } from "./composeProgram";
import { progressAt } from "../../../lib/studio/transitions";
import { timerNowMs } from "../../../lib/studio/match";
import { createTimestampSync, nextSleepMs, pickDue } from "../../../lib/studio/framePacing";

// Kaynak başına bekleyen kare sayısı (titreşim tamponu; KOPYA — kaynak tuvali). Sunum gecikmesi
// en çok ~2,5 kare: 3 yeter (+1 yazılan; 1080p ≈ 8 MB / tuval).
const MAX_QUEUED = 3;
// Chromium bir kamera izinden aynı anda açık tutulabilen VideoFrame sayısını sınırlar (ölçüm:
// 2 kare açık tutulunca kamera kare vermeyi BIRAKIR). Gelen kare hemen kaynağın tuval halkasına
// çizilir ve kapatılır (ölçüm, 1080p: kopya + tuvalden çizim ≈ doğrudan çizim; NV12 → RGB
// dönüşümü bir kez). ImageBitmap kopyası daha pahalı (×1,6) olduğu için kullanılmaz. Tuval
// açılamazsa titreşim tamponu kapanır: yalnız EN SON kare tutulur (2.24.5 davranışı).
const COPY_FRAMES = typeof OffscreenCanvas === "function";
// Kopya ekran kartında ~0,1–0,5 ms. Ortalama bunu çok aşıyorsa (yazılım çizimi / zayıf kart:
// kopya işlemciye biner) kopya bırakılır — yalnız en son kare tutulur (kare atlamaktansa).
const COPY_MAX_MS = 3;

/** Kaynak kopya tuvali halkası: boşta tuval ver / geri al (bellek ayırma her karede değil). */
function createCopyRing(size = MAX_QUEUED + 1) {
  const free = [];
  let made = 0;
  return {
    take(w, h) {
      let c = free.pop();
      if (c && (c.width !== w || c.height !== h)) { c.width = w; c.height = h; c.ctx = null; }
      // Yeni tuval yalnız boşta yoksa (kullanımdaki ≤ MAX_QUEUED: kuyruk sınırı halkayı sınırlar).
      if (!c) { c = new OffscreenCanvas(w, h); made += 1; }
      if (!c.ctx) c.ctx = c.getContext("2d", { alpha: false });
      return c.ctx ? c : null;
    },
    give(c) { if (c && free.length < size) free.push(c); },
    made: () => made,
  };
}
const isCopy = (f) => Boolean(f && f.ctx && typeof f.close !== "function");
/** Kuyruktaki kareyi bırak: kopya tuvali halkaya döner, VideoFrame / ImageBitmap kapanır. */
function freeFrame(rt, f) {
  if (!f) return;
  if (isCopy(f)) rt.ring?.give(f);
  else { try { f.close?.(); } catch { /* yoksay */ } }
}

const S = {
  W: 1920, H: 1080, fps: 30, canvas: null, ctx: null, scratch: null,
  cfg: null, runtime: new Map(), readers: new Map(),
  tr: null, stinger: null, ftb: null, pgmFx: null, brand: {}, snapshot: null, replay: null, override: null, timer: null,
  base: null, baseMeta: null, baseOn: false, baseAt: 0,
  mirror: { w: 960, h: 540, every: 1, inFlight: false, n: 0 },
  tap: false, enc: null, running: false, timer0: 0,
};
const st = { frames: 0, fresh: 0, drawMs: 0, drawMax: 0, baseMs: 0, gfxMs: 0, encMs: 0, late: 0, lateMax: 0, srcFrames: 0, basesIn: 0, mirrors: 0, wakes: 0, copies: 0, copyMs: 0, copyMax: 0, openMax: 0, queueMax: 0, since: performance.now() };

let freshSince = false; // yeni kaynak karesi geldi mi (benzersiz kare sayacı)

const toLocal = (abs) => abs - performance.timeOrigin;
const post = (m, tr) => { try { self.postMessage(m, tr || []); } catch { /* yoksay */ } };

function setSize(W, H) {
  S.W = W; S.H = H;
  if (!S.canvas) S.canvas = new OffscreenCanvas(W, H);
  S.canvas.width = W; S.canvas.height = H;
  S.ctx = S.canvas.getContext("2d", { alpha: false, desynchronized: true });
  const mk = (w, h) => new OffscreenCanvas(w, h);
  S.scratch = { a: mk(W, H), b: mk(W, H), blur: mk(Math.max(16, Math.round(W / 28)), Math.max(9, Math.round(H / 28))) };
}

/* ───────────────────────────── kaynaklar ───────────────────────────── */

function releaseSource(id) {
  const r = S.readers.get(id);
  if (r) { r.dead = true; try { r.reader.cancel(); } catch { /* yoksay */ } S.readers.delete(id); }
  const rt = S.runtime.get(id);
  if (rt) {
    for (const q of rt.queue || []) { if (q.f !== rt.el) freeFrame(rt, q.f); }
    rt.queue = null;
    if (rt.el && !isCopy(rt.el)) freeFrame(rt, rt.el);
    rt.el = null;
    for (const b of rt.images || []) { try { b.close?.(); } catch { /* yoksay */ } }
    S.runtime.delete(id);
  }
}

async function readStream(id, readable, gen) {
  releaseSource(id);
  const reader = readable.getReader();
  const r = { reader, gen, dead: false };
  S.readers.set(id, r);
  // Kareler zaman damgasıyla kuyruğa girer; hangisinin çizileceğini tik seçer (selectFrames):
  // varış titreşimi çift / atlanan kareye dönüşmez.
  const rt = { status: "live", el: null, gen, queue: [], sync: createTimestampSync(), copy: COPY_FRAMES, ring: COPY_FRAMES ? createCopyRing() : null };
  S.runtime.set(id, rt);
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done || r.dead) { value?.close?.(); break; }
      const at = performance.now();
      const ts = Number.isFinite(value.timestamp) ? value.timestamp / 1000 : at;
      const q = rt.queue;
      if (!q) { value.close(); break; }
      // Damga geri giderse (döngü / yeniden bağlanma): kuyruk yeni kareyle başlar.
      if (q.length && ts <= q[q.length - 1].ts) { for (const x of q) freeFrame(rt, x.f); q.length = 0; rt.el = null; }
      let f = value;
      if (rt.copy) {
        // Kopya + hemen kapat: kamera kare havuzu tükenmez (kamera durmaz).
        const w = value.displayWidth || value.codedWidth || 0;
        const h = value.displayHeight || value.codedHeight || 0;
        // Halka doluysa en eski bekleyen bırakılır (gösterilen [0] kalır).
        if (q.length >= MAX_QUEUED) dropHead(rt);
        const c = w && h ? rt.ring.take(w, h) : null;
        if (c) {
          try { c.ctx.drawImage(value, 0, 0, w, h); f = c; } catch { rt.ring.give(c); f = value; }
        }
        if (f === value) { rt.copy = false; } // kopya olmuyor: tampon kapanır (yalnız en son kare)
        else {
          try { value.close(); } catch { /* yoksay */ }
          const ms = performance.now() - at;
          st.copies += 1; st.copyMs += ms; if (ms > st.copyMax) st.copyMax = ms;
          rt.copyN = (rt.copyN || 0) + 1;
          rt.copyAvg = rt.copyAvg == null ? ms : rt.copyAvg * 0.95 + ms * 0.05;
          if (rt.copyN >= 60 && rt.copyAvg > COPY_MAX_MS) { rt.copy = false; post({ type: "drawError", message: `kaynak kopyası pahalı (${Math.round(rt.copyAvg * 10) / 10} ms): titreşim tamponu kapandı` }); }
        }
      }
      rt.sync.observe(ts, at);
      q.push({ f, ts });
      if (!rt.el) { rt.el = f; freshSince = true; }
      const max = rt.copy ? MAX_QUEUED : 1;
      while (q.length > max) dropHead(rt);
      if (q.length > st.queueMax) st.queueMax = q.length;
      // Açık tutulan VideoFrame (kopya yolunda 0; yedek yolda en çok 1).
      let open = 0;
      for (const x of q) if (!isCopy(x.f)) open += 1;
      if (open > st.openMax) st.openMax = open;
      st.srcFrames += 1;
    }
  } catch { /* iz bitti */ }
}

/** Kuyruğun başındaki (gösterilen) kareyi bırakır; sıradaki gösterilir. */
function dropHead(rt) {
  const head = rt.queue.shift();
  if (head) freeFrame(rt, head.f);
  const next = rt.queue[0];
  rt.el = next ? next.f : null;
  if (next) freshSince = true;
}

/** Tik: her kaynakta zamanı gelmiş en yeni kare gösterilir (ideal ızgara zamanına göre). */
function selectFrames(tickMs) {
  for (const rt of S.runtime.values()) {
    const q = rt.queue;
    if (!q || !q.length) continue;
    // Sunum gecikmesi bir kez çıkış ızgarasının ortasına hizalanır (kare zamanı tik sınırına düşmez).
    rt.sync.align(tickMs, 1000 / S.fps, q[q.length - 1].ts);
    const idx = pickDue(q, tickMs, rt.sync);
    for (let i = 0; i < idx; i += 1) dropHead(rt);
  }
}

/* ───────────────────────────── grafikler ───────────────────────────── */

function overlay(ctx, info) {
  const base = S.snapshot;
  if (!base) return;
  const snap = info.event ? { ...base, replayEvent: info.event } : base;
  drawGraphics(ctx, { width: info.width, height: info.height, now: Date.now(), sceneId: info.sceneId ?? null }, snap);
}

/* ───────────────────────────── kodlayıcı ───────────────────────────── */

function openEncoder(m) {
  closeEncoder();
  const e = {
    id: m.id, clock: createFrameClock(m.fps), keys: createKeyframePlanner(m.fps, Math.min(2, m.keyframeSec || 2)), maxQueue: m.maxQueue || 6,
    framesIn: 0, encodeDropped: 0, maxQueue_: 0, latencyMs: 0, maxLatencyMs: 0, submitted: new Map(), t0Sent: false, venc: null, dead: false,
  };
  try {
    e.venc = new VideoEncoder({
      output: (chunk, meta) => {
        if (e.dead) return;
        const data = new ArrayBuffer(chunk.byteLength);
        chunk.copyTo(data);
        let desc = null;
        const d = meta?.decoderConfig?.description;
        if (d) desc = d instanceof ArrayBuffer ? d.slice(0) : new Uint8Array(d.buffer ? d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength) : d).buffer;
        const at = e.submitted.get(chunk.timestamp);
        if (at !== undefined) {
          e.submitted.delete(chunk.timestamp);
          const lat = performance.now() - at;
          e.latencyMs = e.latencyMs * 0.9 + lat * 0.1;
          if (lat > e.maxLatencyMs) e.maxLatencyMs = lat;
        }
        if (e.submitted.size > 120) e.submitted.clear();
        post({ type: "encChunk", id: e.id, tsUs: chunk.timestamp, key: chunk.type === "key", data, desc, colorSpace: meta?.decoderConfig?.colorSpace ? { ...meta.decoderConfig.colorSpace } : null }, [data, ...(desc ? [desc] : [])]);
      },
      error: (err) => { if (!e.dead) { e.dead = true; post({ type: "encError", id: e.id, reason: "VIDEO_ENCODER", message: String(err?.message || err) }); } },
    });
    e.venc.configure(m.config);
  } catch (err) {
    post({ type: "encError", id: m.id, reason: "CONFIGURE", message: String(err?.message || err) });
    return;
  }
  S.enc = e;
  post({ type: "encReady", id: e.id });
}

function closeEncoder() {
  const e = S.enc;
  S.enc = null;
  if (!e) return;
  e.dead = true;
  try { if (e.venc && e.venc.state !== "closed") e.venc.close(); } catch { /* yoksay */ }
}

function encode(now) {
  const e = S.enc;
  if (!e || e.dead || e.venc.state !== "configured") return;
  const slot = e.clock.next(now);
  if (!slot) return;
  if (!e.t0Sent) { e.t0Sent = true; post({ type: "encClock", id: e.id, t0Abs: performance.timeOrigin + (now - e.clock.elapsedMs(now)) }); }
  e.framesIn += 1;
  const q = e.venc.encodeQueueSize;
  if (q > e.maxQueue_) e.maxQueue_ = q;
  const keyFrame = e.keys.due(slot.idx);
  if (q >= e.maxQueue) { e.encodeDropped += 1; if (keyFrame) e.keys.force(); return; }
  let frame;
  try { frame = new VideoFrame(S.canvas, { timestamp: slot.tsUs, duration: slot.durUs, alpha: "discard" }); } catch { e.encodeDropped += 1; return; }
  try {
    e.submitted.set(slot.tsUs, performance.now());
    e.venc.encode(frame, { keyFrame });
  } catch (err) {
    e.dead = true;
    post({ type: "encError", id: e.id, reason: "VIDEO_ENCODE", message: String(err?.message || err) });
  } finally { frame.close(); }
}

function encStats() {
  const e = S.enc;
  if (!e) return null;
  return { id: e.id, queue: e.dead ? 0 : e.venc.encodeQueueSize, framesIn: e.framesIn, encodeDropped: e.encodeDropped, maxQueue: e.maxQueue_, latencyMs: Math.round(e.latencyMs), maxLatencyMs: Math.round(e.maxLatencyMs), ...e.clock.stats() };
}

/* ───────────────────────────── kare ───────────────────────────── */

function render(now, tick = now) {
  const cfg = S.cfg;
  if (!cfg || !S.ctx) return;
  const t0 = performance.now();
  selectFrames(tick);
  const { ctx, W, H } = S;
  // Süzme kalitesi: yalnız KÜÇÜLTMEDE (ör. 4K kamera → 1080p) "high" gerekir (titreşim / tırtık);
  // büyütme / aynı boyutta "medium" yeterli ve çok daha ucuz (yazılım çiziminde kare başına ms'ler).
  let down = false;
  for (const rt of S.runtime.values()) { const w = rt.el?.displayWidth || rt.el?.width || 0; if (w > W * 1.15) { down = true; break; } }
  const q = down ? "high" : "medium";
  if (ctx.imageSmoothingQuality !== q || !ctx.imageSmoothingEnabled) { ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = q; }
  const brand = S.brand || {};
  const fxr = drawProgramFx(ctx, W, H, S.pgmFx, brand);
  let tb = t0; let tg = t0;
  if (!fxr) {
    const tr = S.tr;
    let base;
    if (S.baseOn && S.base) {
      // Kip tabanı (ana iş parçacığı): son gelen kare; üst katmanlar burada.
      ctx.drawImage(S.base, 0, 0, W, H);
      base = { ...(S.baseMeta || {}), done: false };
    } else {
      const matchClockMs = S.timer ? timerNowMs(S.timer, Date.now()) : null;
      base = composeBase(ctx, { W, H, now, cfg, runtime: S.runtime, opts: { now, matchClockMs, override: S.override }, tr, scratch: S.scratch, vr: null, pgmOv: null, pvwOv: null, replay: null, brand });
      if (base.done) S.tr = null;
    }
    tb = performance.now();
    const top = composeTop(ctx, { W, H, now, overlay, replay: S.replay, vr: null, brand, stinger: S.stinger }, base);
    if (top.stingerDone) S.stinger = null;
    tg = performance.now();
  }
  drawFtb(ctx, W, H, S.ftb, now);
  const td = performance.now();
  // Kodlama damgası ideal tik zamanıyla: geç uyanma (Windows 15,6 ms zamanlayıcı) damgayı kaydırmaz.
  if (S.enc) encode(tick);
  const te = performance.now();
  // Ayna (Program ekranı): ana taraf öncekini aldıysa.
  S.mirror.n += 1;
  if (!S.mirror.inFlight && S.mirror.n % S.mirror.every === 0) {
    S.mirror.inFlight = true;
    createImageBitmap(S.canvas, { resizeWidth: S.mirror.w, resizeHeight: S.mirror.h, resizeQuality: "medium" })
      .then((bmp) => { st.mirrors += 1; post({ type: "mirror", bmp, tAbs: performance.timeOrigin + tick }, [bmp]); })
      .catch(() => { S.mirror.inFlight = false; });
  }
  if (S.tap) {
    try { const f = new VideoFrame(S.canvas, { timestamp: Math.round(now * 1000), alpha: "discard" }); post({ type: "tap", frame: f }, [f]); } catch { /* yoksay */ }
  }
  const dt = td - t0;
  st.frames += 1;
  if (freshSince || (S.baseOn && S.baseFresh)) { st.fresh += 1; freshSince = false; S.baseFresh = false; }
  st.drawMs += dt;
  if (dt > st.drawMax) st.drawMax = dt;
  st.baseMs += tb - t0;
  st.gfxMs += tg - tb;
  st.encMs += te - td;
}

function flushStats(now) {
  const win = now - st.since;
  if (win < 1000) return;
  const n = Math.max(1, st.frames);
  post({
    type: "stats",
    draw: {
      fps: Math.round((st.frames * 1000) / win), unique: Math.round((st.fresh * 1000) / win), avgMs: Math.round((st.drawMs / n) * 10) / 10, drawMs: Math.round(st.drawMax * 10) / 10,
      baseMs: Math.round((st.baseMs / n) * 10) / 10, gfxMs: Math.round((st.gfxMs / n) * 10) / 10, encSubmitMs: Math.round((st.encMs / n) * 10) / 10,
      late: st.late, lateMaxMs: Math.round(st.lateMax), srcFps: Math.round((st.srcFrames * 1000) / win), basesIn: Math.round((st.basesIn * 1000) / win), mirrors: st.mirrors,
      sources: S.readers.size, mainBase: S.baseOn,
      // 2.25.2 tanılama: işçi uyanma / sn, kare kopyası (ms), açık VideoFrame, kuyruk, ayna hızı.
      wakes: Math.round((st.wakes * 1000) / win), copyMs: st.copies ? Math.round((st.copyMs / st.copies) * 10) / 10 : 0, copyMaxMs: Math.round(st.copyMax * 10) / 10,
      openFrames: st.openMax, queueMax: st.queueMax, mirrorFps: Math.round((st.mirrors * 1000) / win), copyFrames: [...S.runtime.values()].every((rt) => !rt.sync || rt.copy),
    },
    enc: encStats(),
  });
  Object.assign(st, { frames: 0, fresh: 0, drawMs: 0, drawMax: 0, baseMs: 0, gfxMs: 0, encMs: 0, late: 0, lateMax: 0, srcFrames: 0, basesIn: 0, mirrors: 0, wakes: 0, copies: 0, copyMs: 0, copyMax: 0, openMax: 0, queueMax: 0, since: now });
}

// Sabit ızgara: kayan zamanlayıcı (gecikme düzeltmeli). İşçi zamanlayıcıları ana iş parçacığından bağımsızdır.
// Uyku kısa dilimlerle (framePacing.sleepSlice): tek uzun setTimeout Windows'ta düşük çözünürlüklü
// zamanlayıcıya düşüp tikleri 15,6 ms adımlara yuvarlayabilir (31 / 47 ms → takılma).
function loop() {
  if (!S.running) return;
  st.wakes += 1;
  const now = performance.now();
  const wait = S.nextAt - now;
  // 1 ms'ye kadar erken uyanma tik sayılır (kare seçimi ideal ızgara zamanıyla yapılır);
  // daha uzunsa tek bir bekleme daha (kare başına 1–2 uyanma; 2.25.0–2.25.1'de ~8).
  if (wait > 1) { setTimeout(loop, nextSleepMs(wait)); return; }
  const interval = 1000 / S.fps;
  const late = now - S.nextAt;
  if (late > interval * 0.5) { st.late += 1; if (late > st.lateMax) st.lateMax = late; }
  const tick = late > interval ? now : S.nextAt; // kare seçimi ideal ızgara zamanına göre
  try { render(now, tick); } catch (err) { post({ type: "drawError", message: String(err?.message || err) }); }
  flushStats(now);
  S.nextAt += interval;
  if (S.nextAt < now - interval) S.nextAt = now + interval; // çok geride: ızgarayı yeniden kur (biriken kare çizilmez)
  setTimeout(loop, nextSleepMs(S.nextAt - performance.now()));
}

/* ───────────────────────────── iletiler ───────────────────────────── */

self.onmessage = (ev) => {
  const m = ev.data || {};
  switch (m.type) {
    case "init": {
      S.fps = Math.max(1, m.fps || 30);
      setSize(m.width, m.height);
      if (m.mirror) { S.mirror.w = m.mirror.w; S.mirror.h = m.mirror.h; S.mirror.every = Math.max(1, Math.round(S.fps / (m.mirror.fps || 30))); }
      if (m.mediaProxy) globalThis.__elitligMediaProxy = true;
      for (const f of m.fonts || []) {
        try { const face = new FontFace(f.family, `url(${f.url}) format("woff2")`, { weight: f.weight, style: f.style, unicodeRange: f.unicodeRange }); self.fonts.add(face); face.load().catch(() => {}); } catch { /* yoksay */ }
      }
      if (!S.running) { S.running = true; S.nextAt = performance.now(); loop(); }
      post({ type: "ready" });
      break;
    }
    case "size": S.fps = Math.max(1, m.fps || S.fps); setSize(m.width, m.height); if (m.mirror) { S.mirror.w = m.mirror.w; S.mirror.h = m.mirror.h; S.mirror.every = Math.max(1, Math.round(S.fps / (m.mirror.fps || 30))); } break;
    case "state": {
      if ("cfg" in m) S.cfg = m.cfg;
      if ("ftb" in m) S.ftb = m.ftb ? { ...m.ftb, at: toLocal(m.ftb.atAbs) } : null;
      if ("pgmFx" in m) S.pgmFx = m.pgmFx;
      if ("snapshot" in m) S.snapshot = m.snapshot;
      if ("replay" in m) S.replay = m.replay;
      if ("override" in m) S.override = m.override;
      if ("timer" in m) S.timer = m.timer;
      if ("brand" in m) { try { S.brand?.logo?.close?.(); } catch { /* yoksay */ } S.brand = m.brand || {}; }
      if ("tr" in m) S.tr = m.tr ? { ...m.tr, startedAt: toLocal(m.tr.startedAtAbs) } : null;
      if ("stinger" in m) S.stinger = m.stinger ? { startedAt: toLocal(m.stinger.startedAtAbs), ms: m.stinger.ms, midFired: true } : null;
      if (S.tr && progressAt(S.tr, performance.now()) >= 1) S.tr = null;
      break;
    }
    case "base": {
      // Kip tabanı: önceki kare bırakılır.
      try { S.base?.close?.(); } catch { /* yoksay */ }
      S.base = m.frame; S.baseMeta = m.meta || null; S.baseOn = true; S.baseFresh = true; st.basesIn += 1;
      break;
    }
    case "baseOff": try { S.base?.close?.(); } catch { /* yoksay */ } S.base = null; S.baseOn = false; break;
    case "srcStream": readStream(m.id, m.readable, m.gen); break;
    case "srcBitmap": releaseSource(m.id); S.runtime.set(m.id, { status: "live", el: m.bmp, gen: m.gen }); freshSince = true; break;
    case "srcSlides": releaseSource(m.id); S.runtime.set(m.id, { status: "live", images: m.bmps, intervalMs: m.intervalMs, gen: m.gen }); break;
    case "srcFrame": {
      // Ara sıra yenilenen tuval kaynağı (web sayfası): bitmap yerine konur.
      let rt = S.runtime.get(m.id);
      if (!rt || S.readers.has(m.id)) { releaseSource(m.id); rt = { status: "live", el: null, gen: m.gen }; S.runtime.set(m.id, rt); }
      try { rt.el?.close?.(); } catch { /* yoksay */ }
      rt.el = m.bmp; freshSince = true;
      break;
    }
    case "srcOff": releaseSource(m.id); break;
    case "image": putImage(m.url, m.bmp); break;
    case "mirrorAck": S.mirror.inFlight = false; break;
    // Program ekranı hızı (ana taraftaki ekran yöneticisi; yayın çıkışı etkilenmez).
    case "mirrorFps": S.mirror.every = Math.max(1, Math.round(S.fps / Math.max(1, m.fps || 30))); break;
    case "tap": S.tap = Boolean(m.on); break;
    case "encOpen": openEncoder(m); break;
    case "encKey": S.enc?.keys.force(); break;
    case "encClose": if (!m.id || S.enc?.id === m.id) closeEncoder(); break;
    case "stop":
      S.running = false;
      closeEncoder();
      for (const id of [...S.readers.keys(), ...S.runtime.keys()]) releaseSource(id);
      try { S.base?.close?.(); } catch { /* yoksay */ }
      self.close();
      break;
    default: break;
  }
};
