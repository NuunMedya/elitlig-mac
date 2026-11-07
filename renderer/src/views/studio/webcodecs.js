// Yayın Stüdyosu — WebCodecs kodlama yolu (tek kodlama; OBS'teki gibi).
//
//   program tuvali ──(karıştırıcının her karesinden sonra, sabit kare ızgarası)──▶
//     VideoFrame ──▶ VideoEncoder (H.264 High, donanım, CBR, 2 sn anahtar kare)
//   karıştırıcı ses izi ──▶ MediaStreamTrackProcessor ──▶ AudioEncoder (Opus)
//        ──▶ mkvmux.js (canlı Matroska) ──50 ms'lik demetler──▶ studio.pushChunk
//   Ana süreç ffmpeg'i görüntüyü YENİDEN KODLAMADAN kopyalar (-c:v copy), sesi AAC'ye çevirir.
//
// Eski yola göre: iki kayıplı kodlama yerine bir (MediaRecorder 2× bit hızı +
// ffmpeg x264/VideoToolbox yerine tek donanım kodlaması), MediaRecorder'ın
// titreşen zaman damgaları yerine sabit ızgara, ffmpeg'de kodlama yükü yok.
//
// Hata (kodlayıcı kapandı, yapılandırma reddedildi, SPS değişti …): onFatal →
// useEngine eski yola (MediaRecorder + yeniden kodlama) geçer; yayın kesilmez
// (yalnız ffmpeg yeniden başlar, aktarıcı RTMP bağlantısını korur).
import { createMkvMuxer, opusHead, sameBytes } from "../../lib/studio/mkvmux";
import { createAudioClock, createFrameClock, createKeyframePlanner, videoEncoderCandidates } from "../../lib/studio/encodepath";

const FLUSH_MS = 50;
const FLUSH_BYTES = 256 * 1024;
export const MAX_ENCODE_QUEUE = 6; // ~200 ms (30 fps): kodlayıcı geride kalırsa kare atlanır (gecikme birikmez)

export const webCodecsAvailable = () => typeof window !== "undefined" && typeof window.VideoEncoder === "function" && typeof window.VideoFrame === "function";
const audioCodecsAvailable = () => typeof window.AudioEncoder === "function" && typeof window.MediaStreamTrackProcessor === "function";

/**
 * Desteklenen ilk VideoEncoder yapılandırması.
 * → { ok, config, hardware, audio } | { ok: false, reason }
 */
export async function probeWebCodecs({ width, height, fps, videoBitrateKbps, allowSoftware = false }) {
  if (!webCodecsAvailable()) return { ok: false, reason: "NO_WEBCODECS" };
  let audio = false;
  if (audioCodecsAvailable()) {
    try { audio = Boolean((await window.AudioEncoder.isConfigSupported({ codec: "opus", sampleRate: 48000, numberOfChannels: 2, bitrate: 128000 }))?.supported); } catch { audio = false; }
  }
  if (!audio) return { ok: false, reason: "NO_OPUS_ENCODER" };
  for (const config of videoEncoderCandidates({ width, height, fps, videoBitrateKbps, allowSoftware })) {
    try {
      const r = await window.VideoEncoder.isConfigSupported(config);
      if (r?.supported) return { ok: true, config: { ...config, ...(r.config || {}) }, hardware: config.hardwareAcceleration === "prefer-hardware", audio };
    } catch { /* sonraki */ }
  }
  return { ok: false, reason: "NO_H264_ENCODER" };
}

export function createWebCodecsPipeline({ canvas, audioTrack, fps, width, height, audioBitrateKbps = 128, keyframeSec = 2, videoConfig, onData, onFatal, now = () => performance.now() }) {
  const clock = createFrameClock(fps);
  const keys = createKeyframePlanner(fps, Math.min(2, keyframeSec || 2));
  const st = {
    framesIn: 0, framesEncoded: 0, encodeDropped: 0, keyframes: 0, bytesOut: 0, maxQueue: 0,
    audioChunks: 0, audioDropped: 0, restarts: 0, latencyMs: 0, maxLatencyMs: 0, errors: 0,
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

  const venc = new window.VideoEncoder({
    output: (chunk, meta) => {
      if (dead) return;
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
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
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
    },
    error: (e) => fatal("VIDEO_ENCODER", e),
  });
  try { venc.configure(videoConfig); } catch (e) { dead = true; throw e; }

  /** Karıştırıcı bir kare çizdi (useCompositor aboneliği). */
  function onFrame(nowMs) {
    if (dead || venc.state !== "configured") return;
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
  const audioMap = []; // [{ inUs, offsetMs }] giriş zaman damgası → akış zamanı
  const track = audioTrack && audioCodecsAvailable() ? audioTrack.clone() : null;

  function audioOut(chunk, meta) {
    if (dead) return;
    if (meta?.decoderConfig?.description && !audioDesc) {
      const d = meta.decoderConfig.description;
      const b = new Uint8Array(d instanceof ArrayBuffer ? d : d.buffer ? new Uint8Array(d.buffer, d.byteOffset, d.byteLength) : d);
      // Yalnız geçerli OpusHead kullanılır (başlık henüz yazılmadıysa).
      if (b.length >= 19 && b[0] === 0x4f && !muxer) audioDesc = b.slice();
    }
    if (!muxer) { st.audioDropped += 1; return; }
    let offset = audioMap.length ? audioMap[0].offsetMs : 0;
    for (const m of audioMap) { if (m.inUs <= chunk.timestamp) offset = m.offsetMs; else break; }
    while (audioMap.length > 2 && audioMap[1].inUs <= chunk.timestamp) audioMap.shift();
    const tsMs = chunk.timestamp / 1000 + offset;
    if (tsMs < 0) return;
    const data = new Uint8Array(chunk.byteLength);
    chunk.copyTo(data);
    queue(muxer.block(2, tsMs, true, data));
    st.audioChunks += 1;
  }

  async function audioLoop() {
    try {
      const proc = new window.MediaStreamTrackProcessor({ track });
      reader = proc.readable.getReader();
      for (;;) {
        const { value: data, done } = await reader.read();
        if (done || dead) { data?.close?.(); break; }
        try {
          if (!aenc) {
            audioInfo = { sampleRate: data.sampleRate, channels: Math.min(2, data.numberOfChannels || 2) };
            audioClock = createAudioClock(data.sampleRate);
            aenc = new window.AudioEncoder({ output: audioOut, error: (e) => { st.errors += 1; console.warn("AudioEncoder", e); } });
            aenc.configure({ codec: "opus", sampleRate: data.sampleRate, numberOfChannels: audioInfo.channels, bitrate: Math.round(audioBitrateKbps * 1000) });
          }
          if (!clock.started() || aenc.state !== "configured") continue;
          const durMs = (data.numberOfFrames * 1000) / data.sampleRate;
          const wall = clock.elapsedMs(now()) - durMs;
          const ts = audioClock.push(data.numberOfFrames, wall);
          const offsetMs = ts - data.timestamp / 1000;
          const lastMap = audioMap[audioMap.length - 1];
          if (!lastMap || Math.abs(lastMap.offsetMs - offsetMs) > 0.5) audioMap.push({ inUs: data.timestamp, offsetMs });
          if (aenc.encodeQueueSize > 20) { st.audioDropped += 1; continue; }
          aenc.encode(data);
        } finally {
          data.close();
        }
      }
    } catch (e) {
      if (!dead) console.warn("ses kodlama döngüsü", e);
    }
  }
  if (track) audioLoop();

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
        queue: dead ? 0 : venc.encodeQueueSize,
        encodedFps: win.fps,
        outKbps: win.kbps,
        ...clock.stats(),
        ...st,
        latencyMs: Math.round(st.latencyMs),
        maxLatencyMs: Math.round(st.maxLatencyMs),
        audio: audioClock ? audioClock.stats() : null,
        alive: !dead,
      };
    },
    alive: () => !dead,
    stop() {
      dead = true;
      flush();
      try { reader?.cancel(); } catch { /* yoksay */ }
      try { track?.stop(); } catch { /* yoksay */ }
      try { if (venc.state !== "closed") venc.close(); } catch { /* yoksay */ }
      try { if (aenc && aenc.state !== "closed") aenc.close(); } catch { /* yoksay */ }
    },
  };
}
