// Yayın Stüdyosu — WebCodecs kodlama yolu (tek kodlama; OBS'teki gibi).
//
//   program tuvali ──(karıştırıcının her karesinden sonra, sabit kare ızgarası)──▶
//     VideoFrame ──▶ VideoEncoder (H.264 High, donanım, CBR, 2 sn anahtar kare)
//   karıştırıcı ses izi ──▶ AudioWorklet (ses iş parçacığı) ──▶ işçi: AudioEncoder (Opus)
//        (2.20.1; ana iş parçacığından bağımsız — eski yol MediaStreamTrackProcessor yedekte)
//        ──▶ mkvmux.js (canlı Matroska) ──50 ms'lik demetler──▶ studio.pushChunk
//   Ana süreç ffmpeg'i görüntüyü YENİDEN KODLAMADAN kopyalar (-c:v copy), sesi AAC'ye çevirir.
//
// Eski yola göre: iki kayıplı kodlama yerine bir (MediaRecorder 2× bit hızı +
// ffmpeg x264/VideoToolbox yerine tek donanım kodlaması), MediaRecorder'ın
// titreşen zaman damgaları yerine sabit ızgara, ffmpeg'de kodlama yükü yok.
//
// İşçi motorunda (useCompositor engine "worker") görüntü çizim işçisinde kodlanır
// (remoteEncoder): kare ızgarası, anahtar kare ve kuyruk sınırı işçide; buraya yalnız
// kodlanmış parçalar gelir (mkv birleştirme + ses burada). Ana iş parçacığı meşgulken
// kodlanan kare hızı düşmez; zaman damgaları işçinin ızgarasından.
//
// Hata (kodlayıcı kapandı, yapılandırma reddedildi, SPS değişti …): onFatal →
// useEngine eski yola (MediaRecorder + yeniden kodlama) geçer; yayın kesilmez
// (yalnız ffmpeg yeniden başlar, aktarıcı RTMP bağlantısını korur).
import { createMkvMuxer, opusHead, sameBytes } from "../../lib/studio/mkvmux";
import { programTapFor, reportEncoderAudio } from "./audio/programTap";
import { audioCaptureMs, audioGapMs, createAudioClock, createAudioTimeline, createFrameClock, createKeyframePlanner, encodedColorSpace, opusEncoderConfig, videoEncoderCandidates } from "../../lib/studio/encodepath";

const FLUSH_MS = 50;
const FLUSH_BYTES = 256 * 1024;
export const MAX_ENCODE_QUEUE = 6; // ~200 ms (30 fps): kodlayıcı geride kalırsa kare atlanır (gecikme birikmez)
// Ses okuma kuyruğu (blok; Chromium'da blok ≈ 10 ms): ana iş parçacığı bu kadar meşgul kalsa da
// ses bloğu ATILMAZ (varsayılan kuyruk birkaç blok: gol akışında saniyelerce ses atılıyordu).
export const AUDIO_QUEUE_BLOCKS = 600;

export const webCodecsAvailable = () => typeof window !== "undefined" && typeof window.VideoEncoder === "function" && typeof window.VideoFrame === "function";
const audioCodecsAvailable = () => typeof window.AudioEncoder === "function" && typeof window.MediaStreamTrackProcessor === "function";

/** Yüksek kaliteli Opus yapılandırması destekleniyor mu; değilse yalın (codec + bit hızı) yapılandırma. */
async function supportedOpusConfig(want) {
  const plain = { codec: "opus", sampleRate: want.sampleRate, numberOfChannels: want.numberOfChannels, bitrate: want.bitrate };
  for (const c of [want, plain]) {
    try { if ((await window.AudioEncoder.isConfigSupported(c))?.supported) return c; } catch { /* sonraki */ }
  }
  return null;
}

/**
 * Kodlayıcının gerçekte yazdığı renk uzayı: tek karelik deneme kodlaması
 * (VideoDecoderConfig.colorSpace). Ana süreç bunu kopyada SPS'e açıkça yazar
 * (ffmpeg h264_metadata) — oynatıcı rengi tahmin etmez. Bilinmiyorsa null (dokunulmaz).
 */
async function probeColorSpace(config, { timeoutMs = 1500 } = {}) {
  if (typeof window.OffscreenCanvas !== "function") return null;
  let enc = null;
  try {
    const cs = await new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), timeoutMs);
      const done = (v) => { clearTimeout(timer); resolve(v); };
      enc = new window.VideoEncoder({
        output: (_chunk, meta) => { if (meta?.decoderConfig) done(encodedColorSpace(meta.decoderConfig.colorSpace)); },
        error: () => done(null),
      });
      enc.configure(config);
      const c = new window.OffscreenCanvas(config.width, config.height);
      const g = c.getContext("2d");
      g.fillStyle = "#2f7d32";
      g.fillRect(0, 0, config.width, config.height);
      const frame = new window.VideoFrame(c, { timestamp: 0, alpha: "discard" });
      try { enc.encode(frame, { keyFrame: true }); } finally { frame.close(); }
      enc.flush().catch(() => done(null));
    });
    return cs;
  } catch {
    return null;
  } finally {
    try { if (enc && enc.state !== "closed") enc.close(); } catch { /* yoksay */ }
  }
}

/**
 * Desteklenen ilk VideoEncoder yapılandırması.
 * → { ok, config, hardware, audio, audioConfig, colorSpace } | { ok: false, reason }
 */
export async function probeWebCodecs({ width, height, fps, videoBitrateKbps, audioBitrateKbps = 192, allowSoftware = false }) {
  if (!webCodecsAvailable()) return { ok: false, reason: "NO_WEBCODECS" };
  let audioConfig = null;
  if (audioCodecsAvailable()) audioConfig = await supportedOpusConfig(opusEncoderConfig({ sampleRate: 48000, numberOfChannels: 2, aacKbps: audioBitrateKbps }));
  const audio = Boolean(audioConfig);
  if (!audio) return { ok: false, reason: "NO_OPUS_ENCODER" };
  for (const config of videoEncoderCandidates({ width, height, fps, videoBitrateKbps, allowSoftware })) {
    try {
      const r = await window.VideoEncoder.isConfigSupported(config);
      if (r?.supported) {
        const chosen = { ...config, ...(r.config || {}) };
        const colorSpace = await probeColorSpace(chosen);
        return { ok: true, config: chosen, hardware: config.hardwareAcceleration === "prefer-hardware", audio, audioConfig, colorSpace };
      }
    } catch { /* sonraki */ }
  }
  return { ok: false, reason: "NO_H264_ENCODER" };
}

export function createWebCodecsPipeline({ canvas, audioTrack, fps, width, height, audioBitrateKbps = 192, keyframeSec = 2, videoConfig, audioConfig = null, onData, onFatal, remoteEncoder = null, now = () => performance.now() }) {
  // Uzak (işçi) kodlayıcıda saat ve anahtar kare planı işçidedir: burada vekilleri.
  const remoteClock = { t0: null };
  let remote = null;
  let remoteStats = null;
  const clock = remoteEncoder ? {
    next: () => null,
    elapsedMs: (t) => (remoteClock.t0 === null ? 0 : t - remoteClock.t0),
    started: () => remoteClock.t0 !== null,
    stats: () => ({ frames: remoteStats?.frames ?? 0, gaps: remoteStats?.gaps ?? 0, skipped: remoteStats?.skipped ?? 0 }),
  } : createFrameClock(fps);
  const keys = remoteEncoder ? { due: () => false, force: () => remote?.forceKey(), gop: Math.round(fps * Math.min(2, keyframeSec || 2)) } : createKeyframePlanner(fps, Math.min(2, keyframeSec || 2));
  const st = {
    framesIn: 0, framesEncoded: 0, encodeDropped: 0, keyframes: 0, bytesOut: 0, maxQueue: 0,
    audioChunks: 0, audioDropped: 0, audioGaps: 0, audioGapMs: 0, audioReadLagMaxMs: 0, restarts: 0, latencyMs: 0, maxLatencyMs: 0, errors: 0,
  };
  const win = { at: now(), frames: 0, bytes: 0, fps: 0, kbps: 0 };
  const submitted = new Map(); // tsUs → gönderim zamanı (kodlama gecikmesi)
  let avcC = null;
  let audioDesc = null;
  let audioInfo = null; // { sampleRate, channels }
  let muxer = null;
  let pending = [];
  let pendingBytes = 0;
  let flushTimer = null;
  let dead = false;
  let lastVideoMs = 0;
  let colorSpace = null; // kodlayıcının bildirdiği renk uzayı (tanılama)

  const fatal = (reason, error) => {
    if (dead) return;
    st.errors += 1;
    dead = true;
    try { onFatal?.(reason, error); } catch { /* yoksay */ }
  };

  function flush() {
    if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
    if (!pending.length) return;
    const out = new Uint8Array(pendingBytes);
    let o = 0;
    for (const p of pending) { out.set(p, o); o += p.length; }
    pending = [];
    pendingBytes = 0;
    st.bytesOut += out.length;
    win.bytes += out.length;
    try { onData?.(out.buffer); } catch { /* yoksay */ }
  }
  function queue(bytes) {
    pending.push(bytes);
    pendingBytes += bytes.length;
    if (pendingBytes >= FLUSH_BYTES) flush();
    else if (!flushTimer) flushTimer = setTimeout(flush, FLUSH_MS);
  }

  function ensureMuxer() {
    if (muxer || !avcC) return Boolean(muxer);
    // Yeni akış: bekleyen (eski ffmpeg'e ait) veri atılır, demet başlıkla başlar (engine EBML denetimi).
    pending = []; pendingBytes = 0;
    muxer = createMkvMuxer({
      video: { width, height, codecPrivate: avcC, fps },
      audio: audioInfo ? { sampleRate: audioInfo.sampleRate, channels: audioInfo.channels, codecPrivate: audioDesc || opusHead({ channels: audioInfo.channels, inputSampleRate: audioInfo.sampleRate }) } : null,
    });
    queue(muxer.header());
    return true;
  }

  /* -------------------------------- görüntü -------------------------------- */

  /** Kodlanmış görüntü parçası (yerel EncodedVideoChunk ya da işçiden gelen { tsUs, key, data }). */
  function onVideoChunk(chunk, meta) {
      if (dead) return;
      if (meta?.decoderConfig?.colorSpace && !colorSpace) colorSpace = { ...meta.decoderConfig.colorSpace };
      const desc = meta?.decoderConfig?.description;
      if (desc) {
        const d = new Uint8Array(desc instanceof ArrayBuffer ? desc : desc.buffer ? new Uint8Array(desc.buffer, desc.byteOffset, desc.byteLength) : desc);
        if (avcC && !sameBytes(avcC, d) && muxer) {
          // SPS/PPS değişti: yeni başlıkla yeni akış (ffmpeg yeniden başlamalı).
          fatal("SPS_CHANGED");
          return;
        }
        avcC = d.slice();
      }
      const key = chunk.type === "key";
      if (!muxer) {
        if (!key) return; // yeni akış anahtar kareyle başlar
        // Ses izi var ama ilk ses bloğu henüz gelmedi: başlıkta ses parçası olsun diye (en çok 1,5 sn) bekle.
        if (track && !audioInfo && clock.elapsedMs(now()) < 1500) { keys.force(); return; }
        if (!ensureMuxer()) return;
      }
      const tsMs = chunk.timestamp / 1000;
      if (tsMs + 0.5 < lastVideoMs) { fatal("REORDER"); return; } // B-kare beklenmez
      lastVideoMs = tsMs;
      let data = chunk.bytes || null;
      if (!data) { data = new Uint8Array(chunk.byteLength); chunk.copyTo(data); }
      queue(muxer.block(1, tsMs, key, data));
      st.framesEncoded += 1;
      win.frames += 1;
      if (key) st.keyframes += 1;
      const at = submitted.get(chunk.timestamp);
      if (at !== undefined) {
        submitted.delete(chunk.timestamp);
        const lat = now() - at;
        st.latencyMs = st.latencyMs * 0.9 + lat * 0.1;
        if (lat > st.maxLatencyMs) st.maxLatencyMs = lat;
      }
      if (submitted.size > 120) submitted.clear();
  }

  let venc = null;
  if (remoteEncoder) {
    remote = remoteEncoder.open({ config: videoConfig, fps, keyframeSec: Math.min(2, keyframeSec || 2), maxQueue: MAX_ENCODE_QUEUE }, {
      onChunk: (m) => {
        if (m.colorSpace && !colorSpace) colorSpace = m.colorSpace;
        onVideoChunk({ timestamp: m.tsUs, type: m.key ? "key" : "delta", bytes: new Uint8Array(m.data), byteLength: m.data.byteLength }, m.desc ? { decoderConfig: { description: m.desc } } : null);
      },
      onClock: (t0Local) => { remoteClock.t0 = t0Local; },
      onError: (reason, message) => fatal(reason === "WORKER" ? "WORKER" : reason || "VIDEO_ENCODER", message),
    });
    if (!remote) { dead = true; throw new Error("REMOTE_ENCODER"); }
  } else {
    venc = new window.VideoEncoder({ output: onVideoChunk, error: (e) => fatal("VIDEO_ENCODER", e) });
    try { venc.configure(videoConfig); } catch (e) { dead = true; throw e; }
  }

  /** Karıştırıcı bir kare çizdi (useCompositor aboneliği). */
  function onFrame(nowMs) {
    if (dead || !venc || venc.state !== "configured") return;
    const slot = clock.next(nowMs);
    if (!slot) return;
    st.framesIn += 1;
    const q = venc.encodeQueueSize;
    if (q > st.maxQueue) st.maxQueue = q;
    const keyFrame = keys.due(slot.idx);
    if (q >= MAX_ENCODE_QUEUE) {
      // Kodlayıcı yetişemiyor: kare atlanır (gecikme birikmez); anahtar kare sonraki kareye kalır.
      st.encodeDropped += 1;
      if (keyFrame) keys.force();
      return;
    }
    let frame;
    try {
      frame = new window.VideoFrame(canvas, { timestamp: slot.tsUs, duration: slot.durUs, alpha: "discard" });
    } catch (e) {
      st.encodeDropped += 1;
      return;
    }
    try {
      submitted.set(slot.tsUs, now());
      venc.encode(frame, { keyFrame });
    } catch (e) {
      fatal("VIDEO_ENCODE", e);
    } finally {
      frame.close();
    }
  }

  /* ---------------------------------- ses ---------------------------------- */

  let aenc = null;
  let reader = null;
  let audioClock = null;
  const audioMap = []; // [{ inUs, offsetMs }] giriş zaman damgası → akış zamanı (paket süresi yoksa yedek)
  const timeline = createAudioTimeline();
  let lastAudioEnd = null; // önceki bloğun bitişi (yakalama zamanı, ms): atılan ses sayacı
  const track = audioTrack && audioCodecsAvailable() ? audioTrack.clone() : null;

  function audioOut(chunk, meta) {
    if (dead) return;
    if (meta?.decoderConfig?.description && !audioDesc) {
      const d = meta.decoderConfig.description;
      const b = new Uint8Array(d instanceof ArrayBuffer ? d : d.buffer ? new Uint8Array(d.buffer, d.byteOffset, d.byteLength) : d);
      // Yalnız geçerli OpusHead kullanılır (başlık henüz yazılmadıysa).
      if (b.length >= 19 && b[0] === 0x4f && !muxer) audioDesc = b.slice();
    }
    // Akış zamanı: paketin örnekleri hangi giriş bloğundan geldiyse onun zamanı (createAudioTimeline).
    const mapped = Number(chunk.duration) > 0 ? timeline.output(chunk.duration) : null;
    if (!muxer) { st.audioDropped += 1; return; }
    let tsMs = mapped;
    if (tsMs === null) {
      let offset = audioMap.length ? audioMap[0].offsetMs : 0;
      for (const m of audioMap) { if (m.inUs <= chunk.timestamp) offset = m.offsetMs; else break; }
      while (audioMap.length > 2 && audioMap[1].inUs <= chunk.timestamp) audioMap.shift();
      tsMs = chunk.timestamp / 1000 + offset;
    }
    if (tsMs < 0) return;
    const data = new Uint8Array(chunk.byteLength);
    chunk.copyTo(data);
    queue(muxer.block(2, tsMs, true, data));
    st.audioChunks += 1;
  }

  async function audioLoop() {
    try {
      let proc;
      try { proc = new window.MediaStreamTrackProcessor({ track, maxBufferSize: AUDIO_QUEUE_BLOCKS }); } catch { proc = new window.MediaStreamTrackProcessor({ track }); }
      reader = proc.readable.getReader();
      for (;;) {
        const { value: data, done } = await reader.read();
        if (done || dead) { data?.close?.(); break; }
        try {
          if (!aenc) {
            audioInfo = { sampleRate: data.sampleRate, channels: Math.min(2, data.numberOfChannels || 2) };
            audioClock = createAudioClock(data.sampleRate);
            aenc = new window.AudioEncoder({ output: audioOut, error: (e) => { st.errors += 1; console.warn("AudioEncoder", e); } });
            // Ara Opus yüksek bit hızında (AAC hedefinin ≈ 1,5 katı), karmaşıklık 10: ffmpeg'deki
            // AAC kodlamasına neredeyse kayıpsız girer. Aygıt hızı (44,1 kHz …) korunur: yeniden örnekleme yok.
            const want = { ...(audioConfig || opusEncoderConfig({ aacKbps: audioBitrateKbps })), sampleRate: data.sampleRate, numberOfChannels: audioInfo.channels };
            try { aenc.configure(want); } catch { aenc.configure({ codec: "opus", sampleRate: data.sampleRate, numberOfChannels: audioInfo.channels, bitrate: want.bitrate }); }
          }
          if (!clock.started() || aenc.state !== "configured") continue;
          const durMs = (data.numberOfFrames * 1000) / data.sampleRate;
          const t = now();
          const wall = audioCaptureMs({ dataTsUs: data.timestamp, nowMs: t, t0Ms: t - clock.elapsedMs(t), durMs });
          const readLag = clock.elapsedMs(t) - wall - durMs;
          if (readLag > st.audioReadLagMaxMs) st.audioReadLagMaxMs = Math.round(readLag);
          const gap = audioGapMs(lastAudioEnd, wall);
          if (gap) { st.audioGaps += 1; st.audioGapMs += Math.round(gap); }
          lastAudioEnd = wall + durMs;
          const ts = audioClock.push(data.numberOfFrames, wall);
          const offsetMs = ts - data.timestamp / 1000;
          const lastMap = audioMap[audioMap.length - 1];
          if (!lastMap || Math.abs(lastMap.offsetMs - offsetMs) > 0.5) audioMap.push({ inUs: data.timestamp, offsetMs });
          if (audioMap.length > 256) audioMap.splice(0, audioMap.length - 64); // yedek eşleme sınırlı kalır
          if (aenc.encodeQueueSize > 20) { st.audioDropped += 1; continue; }
          timeline.input(Math.round(durMs * 1000), ts);
          aenc.encode(data);
        } finally {
          data.close();
        }
      }
    } catch (e) {
      if (!dead) console.warn("ses kodlama döngüsü", e);
    }
  }
  /*
   * Ses işçisi (varsayılan): AudioWorklet (ses iş parçacığı) → işçi (AudioEncoder) → ~100 ms'lik
   * demetler. Ana iş parçacığı meşgulken de ses atılmaz ve zamanı kaymaz; ffmpeg sesi
   * beklediği için tüm yayının durmasının (gol anında ~5 sn) önüne geçer. Kurulamazsa ya da
   * 2,5 sn içinde paket gelmezse eski yol (MediaStreamTrackProcessor, ana iş parçacığı).
   */
  let audioPath = null; // "worker" | "track"
  let wa = null; // { ctx, worker, node, src, sink }
  let workerStats = null;
  const workerAudioSupported = () => typeof window.AudioWorkletNode === "function" && typeof window.Worker === "function" && typeof window.AudioContext === "function" && typeof window.MessageChannel === "function";
  function stopWorkerAudio() {
    const w = wa;
    wa = null;
    if (!w) return;
    try { w.node.port.postMessage({ stop: true }); } catch { /* yoksay */ }
    // Karıştırıcı bağlamı paylaşılıyorsa (sameContext) yalnız bizim dalımız sökülür; bağlam kapanmaz.
    try { if (w.shared) w.src.disconnect(w.node); else w.src.disconnect(); } catch { /* yoksay */ }
    try { w.node.disconnect(); w.sink.disconnect(); } catch { /* yoksay */ }
    try { w.worker.postMessage({ type: "stop" }); } catch { /* yoksay */ }
    setTimeout(() => { try { w.worker.terminate(); } catch { /* yoksay */ } }, 1500);
    if (!w.shared) w.ctx.close?.().catch(() => {});
  }
  function onWorkerPackets(m) {
    if (dead) return;
    if (m.desc && !audioDesc && !muxer) audioDesc = new Uint8Array(m.desc);
    if (m.stats) {
      workerStats = m.stats;
      reportEncoderAudio({ path: "worker", sameContext: Boolean(wa?.shared), sampleRate: m.stats.sampleRate ?? null, blocks: m.stats.blocks, gaps: m.stats.gaps, gapMs: m.stats.gapMs, dropped: m.stats.dropped, queueMax: m.stats.queueMax, resyncs: m.stats.resyncs ?? 0, slewMs: m.stats.slewMs ?? 0, errMs: m.stats.errMs ?? 0 });
    }
    if (!m.packets?.length) return;
    if (!muxer || !clock.started()) { st.audioDropped += m.packets.length; return; }
    const t = now();
    const t0 = t - clock.elapsedMs(t);
    for (const p of m.packets) {
      const tsMs = p.absMs - performance.timeOrigin - t0;
      if (!(tsMs >= 0)) continue;
      queue(muxer.block(2, tsMs, true, new Uint8Array(p.data)));
      st.audioChunks += 1;
    }
  }
  async function startWorkerAudio() {
    if (!workerAudioSupported()) return false;
    let ctx = null;
    let worker = null;
    // 2.30.1: program sesi karıştırıcının KENDİ bağlamından alınır (iz → ikinci bağlam FIFO'su yok,
    // tek ses saati). İz karıştırıcıdan gelmiyorsa (testler / eski yol) ayrı bağlam: "playback"
    // (büyük tampon; yük altında aç kalmaz) ve iz hangi hızdaysa o hız (yeniden örnekleyici yok).
    const tap = programTapFor(audioTrack); // iz kopyalanır (track): kayıt asıl izde
    const shared = Boolean(tap);
    let wired = null; // { src, node, sink } — hata olursa paylaşılan bağlamdan sökülür
    try {
      if (tap) ctx = tap.ctx;
      else {
        const trackRate = track.getSettings?.().sampleRate;
        try { ctx = new window.AudioContext({ latencyHint: "playback", ...(trackRate ? { sampleRate: trackRate } : {}) }); } catch { ctx = new window.AudioContext({ latencyHint: "playback" }); }
      }
      // Başlıkta ses parçası olsun (ensureMuxer ilk anahtar karede en çok 1,5 sn bekler; işçi kurulumu sürebilir).
      audioInfo = { sampleRate: ctx.sampleRate, channels: 2 };
      const moduleUrl = new URL("./audioTap.worklet.js", import.meta.url);
      await (tap ? tap.addModule(moduleUrl) : ctx.audioWorklet.addModule(moduleUrl));
      if (dead) throw new Error("stopped");
      const sr = ctx.sampleRate;
      const node = new window.AudioWorkletNode(ctx, "elitlig-audio-tap", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1], channelCount: 2, channelCountMode: "explicit", processorOptions: { blockFrames: Math.round(sr / 50), channels: 2 } });
      const src = tap ? tap.node : ctx.createMediaStreamSource(new MediaStream([track]));
      const sink = ctx.createGain();
      sink.gain.value = 0;
      src.connect(node);
      wired = { src, node, sink };
      node.connect(sink);
      sink.connect(ctx.destination);
      worker = new Worker(new URL("./audioEncode.worker.js", import.meta.url), { type: "module" });
      const ch = new MessageChannel();
      node.port.postMessage({ port: ch.port1 }, [ch.port1]);
      const ready = new Promise((resolve) => {
        const timer = setTimeout(() => resolve(false), 3000);
        worker.onmessage = (e) => {
          const m = e.data || {};
          if (m.type === "ready") { clearTimeout(timer); resolve(true); } else if (m.type === "error") { clearTimeout(timer); resolve(false); if (audioPath === "worker") fallbackToTrack(m.reason); } else if (m.type === "packets") onWorkerPackets(m);
        };
        worker.onerror = () => { clearTimeout(timer); resolve(false); if (audioPath === "worker") fallbackToTrack("WORKER"); };
      });
      const config = { ...(audioConfig || opusEncoderConfig({ aacKbps: audioBitrateKbps })) };
      worker.postMessage({ type: "init", port: ch.port2, sampleRate: sr, channels: 2, config, flushMs: 100 }, [ch.port2]);
      if (!(await ready) || dead) throw new Error("worker");
      if (ctx.state !== "running") await Promise.race([ctx.resume(), new Promise((r) => setTimeout(r, 1000))]);
      if (ctx.state !== "running") throw new Error("suspended");
      wa = { ctx, worker, node, src, sink, shared };
      audioInfo = { sampleRate: sr, channels: 2 };
      return true;
    } catch {
      try { worker?.terminate(); } catch { /* yoksay */ }
      if (wired) { try { wired.src.disconnect(wired.node); wired.node.disconnect(); wired.sink.disconnect(); } catch { /* yoksay */ } }
      if (!shared) ctx?.close?.().catch(() => {});
      return false;
    }
  }
  function fallbackToTrack(reason) {
    if (dead || audioPath !== "worker") return;
    stopWorkerAudio();
    audioPath = "track";
    st.audioFallback = String(reason || "NO_DATA").slice(0, 40);
    reportEncoderAudio({ path: "track", reason: st.audioFallback, gaps: 0, gapMs: 0, dropped: 0, resyncs: 0 });
    audioLoop();
  }
  if (track) {
    startWorkerAudio().then((ok) => {
      if (dead) { stopWorkerAudio(); return; }
      if (!ok) { audioPath = "track"; reportEncoderAudio({ path: "track", gaps: 0, gapMs: 0, dropped: 0, resyncs: 0 }); audioLoop(); return; }
      audioPath = "worker";
      // Ses bağlamı çalışmıyorsa (aygıt yok / askıda) paket gelmez: eski yola düş.
      setTimeout(() => { if (audioPath === "worker" && !dead && workerStats === null) fallbackToTrack("NO_DATA"); }, 2500);
    });
  }

  /* ---------------------------------- API ---------------------------------- */

  return {
    onFrame,
    /** ffmpeg yeniden başladı: yeni başlık + anahtar kare (eski bekleyen veri atılır). */
    restart() {
      if (dead) return;
      st.restarts += 1;
      muxer = null;
      pending = []; pendingBytes = 0;
      keys.force();
    },
    stats() {
      const t = now();
      if (remote) {
        const r = remote.stats();
        if (r) {
          remoteStats = r;
          st.framesIn = r.framesIn; st.encodeDropped = r.encodeDropped; st.maxQueue = r.maxQueue;
          st.latencyMs = r.latencyMs; st.maxLatencyMs = r.maxLatencyMs;
        }
      }
      if (t - win.at >= 1000) {
        win.fps = Math.round((win.frames * 1000) / (t - win.at));
        win.kbps = Math.round((win.bytes * 8) / (t - win.at));
        win.at = t; win.frames = 0; win.bytes = 0;
      }
      return {
        pipeline: "webcodecs",
        hardware: videoConfig.hardwareAcceleration === "prefer-hardware",
        codec: videoConfig.codec,
        bitrateMode: videoConfig.bitrateMode,
        colorSpace,
        audioKbps: audioConfig ? Math.round(audioConfig.bitrate / 1000) : null,
        queue: dead ? 0 : remote ? remoteStats?.queue ?? 0 : venc.encodeQueueSize,
        encodeIn: remote ? "worker" : "main",
        encodedFps: win.fps,
        outKbps: win.kbps,
        ...clock.stats(),
        ...st,
        latencyMs: Math.round(st.latencyMs),
        maxLatencyMs: Math.round(st.maxLatencyMs),
        audio: audioClock ? audioClock.stats() : null,
        audioPath,
        ...(workerStats ? { audioWorker: { blocks: workerStats.blocks, gaps: workerStats.gaps, gapMs: workerStats.gapMs, dropped: workerStats.dropped, queueMax: workerStats.queueMax, offsetMs: workerStats.offsetMs, resyncs: workerStats.resyncs ?? 0, slewMs: workerStats.slewMs ?? 0, errMs: workerStats.errMs ?? 0, sampleRate: workerStats.sampleRate ?? null } } : {}),
        alive: !dead,
      };
    },
    alive: () => !dead,
    stop() {
      dead = true;
      flush();
      try { reader?.cancel(); } catch { /* yoksay */ }
      stopWorkerAudio();
      try { track?.stop(); } catch { /* yoksay */ }
      try { remote?.close(); } catch { /* yoksay */ }
      try { if (venc && venc.state !== "closed") venc.close(); } catch { /* yoksay */ }
      try { if (aenc && aenc.state !== "closed") aenc.close(); } catch { /* yoksay */ }
    },
  };
}
