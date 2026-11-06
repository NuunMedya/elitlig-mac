// Yayın Stüdyosu — açılar, tekrarlar ve öne çıkanlar için ffmpeg komutları.
//
// Kodlayıcı seçimi ve kodlayıcı ayarları ffmpeg.js'te kalır (videoEncoderArgs,
// pickEncoder); burada yalnız komutun geri kalanı kurulur. Electron'a bağlı
// değildir (testler doğrudan çağırır).
"use strict";

const ff = require("./ffmpeg");
const { levelBsfArgs } = require("./h264level");

const pixFmt = (encoder) => (typeof ff.encoderPixelFormat === "function" ? ff.encoderPixelFormat(encoder) : "yuv420p");

const clampInt = (value, min, max, fallback) => {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
const even = (n) => Math.max(2, n - (n % 2));

/** ["-a","1","-g","60"] içinden verilen seçenekleri (değerleriyle) çıkarır. */
function withoutOptions(args, names) {
  const out = [];
  for (let i = 0; i < args.length; i += 1) {
    if (names.includes(args[i])) { i += 1; continue; }
    out.push(args[i]);
  }
  return out;
}

/**
 * Açı (kamera vb.) boyutu: kaynak boyutu en çok 1920×1080 kutusuna sığdırılır
 * (en-boy oranı korunur); bilinmiyorsa 1280×720. Bit hızı piksele göre.
 */
function angleOptions({ width, height, fps, mimeType } = {}) {
  let w = Number(width) > 0 ? Number(width) : 1280;
  let h = Number(height) > 0 ? Number(height) : 720;
  const scale = Math.min(1, 1920 / w, 1080 / h);
  w = even(Math.round(w * scale));
  h = even(Math.round(h * scale));
  const pixels = w * h;
  return {
    width: w,
    height: h,
    fps: clampInt(fps, 15, 60, 30),
    videoBitrateKbps: pixels > 1280 * 720 ? 4500 : pixels > 640 * 360 ? 3000 : 1500,
    audioBitrateKbps: 128,
    mimeType: String(mimeType || ""),
    // Kaydedici H.264 yazıyorsa görüntü yeniden kodlanmaz (kopya): açı başına
    // ikinci bir kodlama yok, işlemci yükü ~sıfır. VP8/VP9 ise yeniden kodlanır.
    copy: isH264Mime(mimeType),
  };
}

/** MediaRecorder MIME türü H.264 mü: "video/x-matroska;codecs=avc1", "video/webm;codecs=h264" … */
const isH264Mime = (mimeType) => /(?:codecs\s*=\s*"?[^;]*\b(?:avc1|avc3|h264)\b)/i.test(String(mimeType || ""));

/** Açıların 1 sn'lik MPEG-TS parça halkası (her iki kipte ortak çıkış). */
const angleSegmentArgs = ({ segmentSeconds, segmentStart, listFile }) => [
  "-max_muxing_queue_size", "1024",
  "-f", "segment", "-segment_time", String(segmentSeconds), "-segment_time_delta", "0.05",
  "-break_non_keyframes", "0",
  "-segment_format", "mpegts", "-reset_timestamps", "1",
  "-segment_start_number", String(segmentStart),
  "-segment_list", listFile, "-segment_list_type", "csv",
  ff.SEGMENT_PATTERN,
];

/**
 * Açı kaydı: MediaRecorder (Matroska/WebM) stdin'den → 1 sn'lik MPEG-TS parça
 * halkası (RTMP yok).
 *   copy (H.264 kaydedici, 1 sn'de bir anahtar kare — arayüz MediaRecorder'a
 *   videoKeyFrameIntervalDuration: 1000 verir): görüntü KOPYALANIR (-c:v copy,
 *   Annex B), parçalar anahtar karelerde bölünür; yalnız ses AAC'ye çevrilir.
 *   Aksi halde (VP8/VP9): H.264'e yeniden kodlanır, 1 sn'de bir anahtar kare.
 * Motorun buildArgs imzası: ({ ...opts, encoder, segmentStart, listFile }).
 */
function buildAngleArgs({ width, height, fps, videoBitrateKbps, audioBitrateKbps = 128, encoder, segmentSeconds = 1, segmentStart = 0, listFile = "list.csv", inputFormat = "matroska", copy = false, speedLevel = 0 }) {
  const head = [
    "-hide_banner", "-nostdin", "-loglevel", "level+warning", "-nostats",
    "-progress", "pipe:1", "-stats_period", "1",
    "-fflags", "+genpts+discardcorrupt", "-thread_queue_size", "1024",
    "-probesize", "1000000", "-analyzeduration", "1000000",
    "-f", inputFormat, "-i", "pipe:0",
    "-map", "0:v:0", "-map", "0:a:0?",
  ];
  const audio = ["-c:a", "aac", "-b:a", `${audioBitrateKbps}k`, "-ar", "48000", "-ac", "2", "-af", "aresample=async=1000"];
  if (copy) {
    return [...head, "-c:v", "copy", "-bsf:v", "h264_mp4toannexb", ...audio, ...angleSegmentArgs({ segmentSeconds, segmentStart, listFile })];
  }
  // ffmpeg.js'teki GOP 2 sn; açılarda 1 sn: -g / -keyint_min çıkarılıp yeniden verilir.
  const enc = withoutOptions(ff.videoEncoderArgs(encoder, { videoBitrateKbps, fps, width, height, keyframeSeconds: segmentSeconds, speedLevel }), ["-g", "-keyint_min"]);
  return [
    ...head,
    "-vf", `scale=${width}:${height}:flags=bicubic,fps=${fps},format=${pixFmt(encoder)}`,
    ...enc,
    "-g", String(fps), "-keyint_min", String(fps),
    "-force_key_frames", `expr:gte(t,n_forced*${segmentSeconds})`,
    ...audio,
    ...angleSegmentArgs({ segmentSeconds, segmentStart, listFile }),
  ];
}

/**
 * Parçaları yeniden kodlamadan MP4'e birleştirir; düzey (level) bsf ile düzeltilir,
 * moov başa alınır. durationSec verilirse çıktı o süreyle kesilir (paket sınırında).
 */
function buildConcatLevelArgs(listFile, outFile, { width, height, fps, durationSec = null } = {}) {
  return [
    "-hide_banner", "-nostdin", "-loglevel", "error", "-y",
    "-f", "concat", "-safe", "0", "-i", listFile,
    "-map", "0:v:0", "-map", "0:a:0?",
    "-c", "copy", "-bsf:a", "aac_adtstoasc", ...levelBsfArgs(width, height, fps),
    ...(durationSec > 0 ? ["-t", durationSec.toFixed(3)] : []),
    "-movflags", "+faststart",
    outFile,
  ];
}

/** Kapak: ~%40'taki kare, 640 px genişlik, JPEG. */
function buildPosterArgs(videoFile, posterFile, { durationMs = null, width = 640 } = {}) {
  const at = durationMs > 0 ? Math.max(0, (durationMs / 1000) * 0.4) : 0;
  return [
    "-hide_banner", "-nostdin", "-loglevel", "error", "-y",
    "-ss", at.toFixed(3), "-i", videoFile,
    "-frames:v", "1", "-vf", `scale=${width}:-2`, "-q:v", "4", "-update", "1",
    posterFile,
  ];
}

/**
 * Öne çıkanlar: MediaRecorder çıktısını (stdin ya da dosya) H.264 High yuv420p +
 * AAC MP4'e kodlar; düzey çözünürlük/kare hızına göre, +faststart.
 */
function buildRenderArgs({ input = "pipe:0", inputFormat = "matroska", outFile, width, height, fps, videoBitrateKbps, audioBitrateKbps = 160, encoder, progress = true }) {
  return [
    "-hide_banner", "-nostdin", "-loglevel", "warning", "-nostats", "-y",
    ...(progress ? ["-progress", "pipe:1", "-stats_period", "1"] : []),
    "-fflags", "+genpts+discardcorrupt", "-thread_queue_size", "1024",
    "-probesize", "5000000", "-analyzeduration", "2000000",
    "-f", inputFormat, "-i", input,
    "-map", "0:v:0", "-map", "0:a:0?",
    // 4:2:0 (yuv420p; QSV / AMF / Media Foundation aynı örneklemenin NV12 düzenini ister).
    "-vf", `scale=${width}:${height}:flags=bicubic,fps=${fps},format=${pixFmt(encoder)}`,
    ...ff.videoEncoderArgs(encoder, { videoBitrateKbps, fps, width, height }),
    "-c:a", "aac", "-b:a", `${audioBitrateKbps}k`, "-ar", "48000", "-ac", "2", "-af", "aresample=async=1000",
    ...levelBsfArgs(width, height, fps),
    "-max_muxing_queue_size", "4096",
    "-movflags", "+faststart",
    "-f", "mp4", outFile,
  ];
}

/** Kaydedici MIME türü → ffmpeg giriş biçimi. */
const inputFormatFor = (mimeType) => (/mp4/i.test(String(mimeType || "")) ? "mp4" : "matroska");

/** `ffmpeg -i` stderr'inden video bilgisi (süre, boyut, kare hızı, ses). */
function parseVideoInfo(text) {
  const base = ff.parseProbe(text);
  const s = String(text || "");
  const line = s.split(/\r?\n/).find((l) => /Stream #\S+.*?Video:/.test(l)) || "";
  const fps = Number(line.match(/([\d.]+) fps/)?.[1] || line.match(/([\d.]+) tbr/)?.[1]) || null;
  return { ...base, fps };
}

module.exports = { withoutOptions, angleOptions, isH264Mime, buildAngleArgs, buildConcatLevelArgs, buildPosterArgs, buildRenderArgs, inputFormatFor, parseVideoInfo };
