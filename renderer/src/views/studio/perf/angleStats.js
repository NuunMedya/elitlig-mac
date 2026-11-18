// 2.36.0 · Kamera açısı kayıtlarının sayacı (Performans raporu): kaç MediaRecorder açık, bit hızı,
// donanım kodlama olasılığı (navigator.mediaCapabilities, bir kez).
let stats = { active: 0, bitrateKbps: 0, totalKbps: 0, sources: 0, hardware: null };
let probed = false;

export function setAngleStats(patch) {
  stats = { ...stats, ...patch };
  if (!probed && stats.active > 0) { probed = true; probeHardware(stats.bitrateKbps).then((hw) => { stats = { ...stats, hardware: hw }; }).catch(() => {}); }
}
export const angleStats = () => ({ ...stats });

/** MediaRecorder H.264 1080p30 kaydı donanımda mı (powerEfficient) — tahmin; null: bilinmiyor. */
export async function probeHardware(kbps = 6000) {
  const mc = typeof navigator !== "undefined" ? navigator.mediaCapabilities : null;
  if (!mc?.encodingInfo) return null;
  for (const contentType of ['video/mp4;codecs="avc1.640028"', 'video/webm;codecs="avc1.640028"', 'video/x-matroska;codecs="avc1.640028"']) {
    try {
      const r = await mc.encodingInfo({ type: "record", video: { contentType, width: 1920, height: 1080, bitrate: kbps * 1000, framerate: 30 } });
      if (r?.supported) return { supported: true, powerEfficient: Boolean(r.powerEfficient), smooth: Boolean(r.smooth), contentType };
    } catch { /* sonraki */ }
  }
  return { supported: false, powerEfficient: false };
}
