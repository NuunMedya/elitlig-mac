// Yayın Stüdyosu — kodlama yolu yardımcıları (saf; webcodecs.js ve testler).
//
// Kodlama yolları:
//   "webcodecs": program tuvali tarayıcıda BİR KEZ H.264'e kodlanır (VideoEncoder,
//                donanım: VideoToolbox / Media Foundation / NVENC), ffmpeg yalnız
//                kopyalar (-c:v copy). OBS'teki gibi tek kodlama, sabit bit hızı,
//                kodlayıcı zaman damgaları.
//   "legacy":    MediaRecorder (2× bit hızı) → ffmpeg yeniden kodlar (iki kayıplı kodlama).
//   "auto":      donanım VideoEncoder varsa webcodecs, yoksa legacy (x264 yazılım
//                kodlayıcısı OpenH264'ten iyidir).

export const PIPELINES = [
  { key: "auto", label: "Otomatik (önerilen)", hint: "Donanım WebCodecs varsa tek kodlama, yoksa eski yol" },
  { key: "webcodecs", label: "WebCodecs (tek kodlama)", hint: "Görüntü bir kez kodlanır; ffmpeg yalnız kopyalar" },
  { key: "legacy", label: "Eski (MediaRecorder + ffmpeg)", hint: "İki kez kodlar; en uyumlu" },
];
export const normalizePipeline = (v) => (PIPELINES.some((p) => p.key === v) ? v : "auto");

/** H.264 düzeyi (Ek A; ffmpeg h264level.js ile aynı kural): 1080p30 → 4.1 (0x29), 1080p60 → 4.2 (0x2A). */
const LEVELS = [[30, 1620, 40500], [31, 3600, 108000], [32, 5120, 216000], [41, 8192, 245760], [42, 8704, 522240], [50, 22080, 589824], [51, 36864, 983040], [52, 36864, 2073600]];
export function avcLevelIdc(width, height, fps) {
  const mbs = Math.ceil((Number(width) || 1920) / 16) * Math.ceil((Number(height) || 1080) / 16);
  const rate = mbs * Math.ceil((Number(fps) || 30) - 0.01);
  const found = LEVELS.find(([, fs, mbps]) => mbs <= fs && rate <= mbps);
  const lv = found ? found[0] : 52;
  return lv < 41 ? 41 : lv > 42 && lv < 51 ? 51 : lv; // h264level.js: 4.2'yi aşan en az 5.1
}
/** "avc1.PPCCLL": High profil (0x64), düzey çözünürlüğe göre. */
export const avcCodecString = (width, height, fps, profile = "high") => {
  const pp = profile === "main" ? "4d40" : profile === "baseline" ? "42e0" : "6400";
  return `avc1.${pp}${avcLevelIdc(width, height, fps).toString(16).padStart(2, "0").toUpperCase()}`;
};

/**
 * VideoEncoder için denenecek yapılandırmalar (sırayla isConfigSupported):
 * önce donanım + sabit bit hızı (CBR) + "quality" gecikme kipi (kodlayıcı kare
 * atmaz), sonra değişken bit hızı, sonra (yalnız allowSoftware) yazılım.
 * Profil: High → Main → Baseline (bazı donanımlar High vermez).
 */
export function videoEncoderCandidates({ width, height, fps, videoBitrateKbps, allowSoftware = false }) {
  const base = { width, height, framerate: fps, bitrate: Math.round(videoBitrateKbps * 1000), avc: { format: "avc" } };
  const out = [];
  const accel = allowSoftware ? ["prefer-hardware", "no-preference"] : ["prefer-hardware"];
  for (const hardwareAcceleration of accel) {
    for (const profile of ["high", "main", "baseline"]) {
      for (const bitrateMode of ["constant", "variable"]) {
        out.push({ ...base, codec: avcCodecString(width, height, fps, profile), hardwareAcceleration, bitrateMode, latencyMode: "quality" });
      }
    }
  }
  return out;
}

/**
 * Sabit kare ızgarası (OBS'teki gibi çıktı saati): çizim döngüsünden gelen her
 * kare için ızgaradaki sıra numarası. Kare hızından hızlı çizimde fazla kare
 * atlanır (null); titreşimde (yarım kareye kadar) ardışık sıra korunur;
 * takılmada (1,5 kareden fazla geride) sıra duvar saatine atlar (boşluk).
 * Zaman damgası µs: idx × 1e6 / fps — tam CFR ızgarası.
 */
export function createFrameClock(fps, startMs) {
  const dur = 1000 / Math.max(1, fps);
  let t0 = startMs ?? null;
  let last = -1;
  let gaps = 0;
  let skipped = 0;
  return {
    next(nowMs) {
      if (t0 === null) t0 = nowMs;
      const ideal = (nowMs - t0) / dur;
      let idx = last + 1;
      if (idx > ideal + 0.5) { skipped += 1; return null; } // erken: bu kare gönderilmez
      if (ideal - idx > 1.5) { gaps += Math.round(ideal) - idx; idx = Math.round(ideal); }
      last = idx;
      return { idx, tsUs: Math.round((idx * 1e6) / fps), durUs: Math.round(1e6 / fps) };
    },
    /** Duvar saatinde şu ana denk gelen ms (ses zaman damgalarını hizalamak için). */
    elapsedMs: (nowMs) => (t0 === null ? 0 : nowMs - t0),
    started: () => t0 !== null,
    stats: () => ({ frames: last + 1, gaps, skipped }),
  };
}

/** Anahtar kare zamanı geldi mi: her keyframeSec'te bir (ızgara sırasına göre; atlanan kare sonrası ilk kare). */
export function createKeyframePlanner(fps, keyframeSec = 2) {
  const gop = Math.max(1, Math.round(fps * keyframeSec));
  let nextKey = 0;
  let force = false;
  return {
    due(idx) {
      if (force || idx >= nextKey) {
        force = false;
        nextKey = (Math.floor(idx / gop) + 1) * gop;
        return true;
      }
      return false;
    },
    force() { force = true; },
    gop,
  };
}

/**
 * Ses zaman damgası: örnek sayısından (kayma yok), duvar saatine göre denetlenir.
 * |fark| > maxDriftMs olursa yeniden hizalanır (ffmpeg aresample=async boşluğu doldurur).
 * push(frames, wallMs) → tsMs (bu ses bloğunun başlangıcı).
 */
export function createAudioClock(sampleRate, { maxDriftMs = 80 } = {}) {
  let anchorMs = null;
  let samples = 0;
  let resyncs = 0;
  let drift = 0;
  return {
    push(frames, wallStartMs) {
      if (anchorMs === null) anchorMs = wallStartMs;
      let ts = anchorMs + (samples * 1000) / sampleRate;
      const d = wallStartMs - ts;
      drift = drift * 0.9 + d * 0.1;
      if (Math.abs(drift) > maxDriftMs) {
        anchorMs += drift;
        ts = anchorMs + (samples * 1000) / sampleRate;
        drift = 0;
        resyncs += 1;
      }
      samples += frames;
      return ts;
    },
    stats: () => ({ resyncs, driftMs: Math.round(drift) }),
  };
}

/** Kodlama yolu seçimi: ayar + destek → "webcodecs" | "legacy". */
export function choosePipeline(setting, { webcodecs = false, hardware = false } = {}) {
  const s = normalizePipeline(setting);
  if (s === "legacy" || !webcodecs) return "legacy";
  if (s === "webcodecs") return "webcodecs";
  return hardware ? "webcodecs" : "legacy";
}
