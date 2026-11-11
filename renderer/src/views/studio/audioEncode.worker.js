// Yayın Stüdyosu — yayın sesini kodlayan işçi (Opus; ana iş parçacığından bağımsız).
//
// audioTap.worklet.js örnek bloklarını (ses iş parçacığı) doğrudan MessagePort ile alır,
// AudioEncoder (Opus) ile kodlar; paketleri ~100 ms'lik demetler hâlinde ana iş parçacığına
// (webcodecs.js → canlı Matroska) yollar. Zaman damgası: blok konumu (örnek sayısı) + ses
// saatinin duvar saatine ofseti (createCaptureClock; mutlak ms = timeOrigin + now).
// Ana iş parçacığı saniyelerce meşgul kalsa bile ses KAYBOLMAZ ve zamanı kaymaz: demetler
// kuyrukta bekler, doğru zaman damgasıyla yazılır.
import { createAudioTimeline, createCaptureClock } from "../../lib/studio/encodepath";

let enc = null;
let sampleRate = 48000;
let channels = 2;
let flushTimer = null;
let packets = [];
let transfer = [];
let desc = null;
let descSent = false;
let lastOffset = null;
let nextFrame = null;
const clock = createCaptureClock();
const timeline = createAudioTimeline(); // çıkış paketi → giriş bloğunun konumu (ms)
const st = { blocks: 0, encoded: 0, dropped: 0, gaps: 0, gapMs: 0, errors: 0, queueMax: 0 };

function flush() {
  if (!packets.length && (descSent || !desc)) return;
  const msg = { type: "packets", packets, stats: { ...st, ...clock.stats(), offsetMs: lastOffset, sampleRate } };
  if (desc && !descSent) { msg.desc = desc; descSent = true; }
  self.postMessage(msg, transfer);
  packets = [];
  transfer = [];
}

function onBlock({ frame, frames, planes }) {
  if (!enc || enc.state !== "configured") return;
  const arrival = performance.timeOrigin + performance.now();
  const frameMs = (frame * 1000) / sampleRate;
  // Blok, son örneği işlendiğinde gönderilir: ulaşma anı bloğun SONUNA denk gelir.
  lastOffset = clock.push(((frame + frames) * 1000) / sampleRate, arrival);
  st.blocks += 1;
  if (nextFrame !== null && frame > nextFrame) { st.gaps += 1; st.gapMs += Math.round(((frame - nextFrame) * 1000) / sampleRate); }
  nextFrame = frame + frames;
  if (enc.encodeQueueSize > st.queueMax) st.queueMax = enc.encodeQueueSize;
  if (enc.encodeQueueSize > 50) { st.dropped += 1; return; }
  const data = new Float32Array(frames * channels);
  for (let c = 0; c < channels; c += 1) data.set(planes[Math.min(c, planes.length - 1)], c * frames);
  let ad;
  try {
    ad = new AudioData({ format: "f32-planar", sampleRate, numberOfFrames: frames, numberOfChannels: channels, timestamp: Math.round((frame * 1e6) / sampleRate), data });
    enc.encode(ad);
    timeline.input(Math.round((frames * 1e6) / sampleRate), frameMs);
  } catch {
    st.errors += 1;
  } finally {
    ad?.close();
  }
}

function onOutput(chunk, meta) {
  const d = meta?.decoderConfig?.description;
  if (d && !desc) {
    const b = new Uint8Array(d instanceof ArrayBuffer ? d : d.buffer ? new Uint8Array(d.buffer, d.byteOffset, d.byteLength) : d);
    if (b.length >= 19 && b[0] === 0x4f) desc = b.slice().buffer; // geçerli OpusHead
  }
  const buf = new ArrayBuffer(chunk.byteLength);
  chunk.copyTo(buf);
  st.encoded += 1;
  // Paketin örnekleri hangi bloktan geldiyse onun konumu (ms) + ofset → mutlak duvar saati (ms).
  const at = chunk.duration > 0 ? timeline.output(chunk.duration) : null;
  packets.push({ absMs: (at ?? chunk.timestamp / 1000) + (lastOffset ?? 0), durUs: chunk.duration || 0, data: buf });
  transfer.push(buf);
}

self.onmessage = async (e) => {
  const m = e.data || {};
  if (m.type === "init") {
    sampleRate = m.sampleRate || 48000;
    channels = Math.max(1, Math.min(2, m.channels || 2));
    try {
      enc = new AudioEncoder({ output: onOutput, error: () => { st.errors += 1; self.postMessage({ type: "error", reason: "AUDIO_ENCODER" }); } });
      const want = { ...(m.config || { codec: "opus", bitrate: 192000 }), sampleRate, numberOfChannels: channels };
      try { enc.configure(want); } catch { enc.configure({ codec: "opus", sampleRate, numberOfChannels: channels, bitrate: want.bitrate || 192000 }); }
    } catch (err) {
      self.postMessage({ type: "error", reason: "CONFIGURE", message: String(err) });
      return;
    }
    m.port.onmessage = (ev) => onBlock(ev.data);
    flushTimer = setInterval(flush, m.flushMs || 100);
    self.postMessage({ type: "ready" });
  } else if (m.type === "stop") {
    if (flushTimer) clearInterval(flushTimer);
    try { await enc?.flush(); } catch { /* yoksay */ }
    flush();
    try { enc?.close(); } catch { /* yoksay */ }
    self.close();
  }
};
