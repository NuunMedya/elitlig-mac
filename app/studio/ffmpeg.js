// Yayın Stüdyosu — ffmpeg ikilisi, yetenek yoklaması ve komut satırı kurucuları.
//
// Buradaki işlevler Electron'a bağlı değildir (birim testleri doğrudan çağırır).
//
// İkili nereden gelir (ilk bulunan):
//   1. ELITLIG_FFMPEG ortam değişkeni (geliştirme / CI)
//   2. Paketli uygulama: Contents/Resources/ffmpeg/ffmpeg — build/fetch-ffmpeg.js
//      her mimari için ayrı ikiliyi indirir, electron-builder "${arch}" ile
//      x64 ve arm64 derlemelerine koyar, @electron/universal ikisini lipo ile
//      tek (fat) ikiliye birleştirir.
//   3. Geliştirme: <proje>/build/ffmpeg/<arch>/ffmpeg
//   4. Sistem: Homebrew (/opt/homebrew/bin, /usr/local/bin) ve PATH
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { execFile } = require("node:child_process");

const ENCODERS = Object.freeze({ videotoolbox: "h264_videotoolbox", libx264: "libx264" });

const isExecutable = (file) => {
  try {
    fs.accessSync(file, fs.constants.X_OK);
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
};

/** Aranacak ffmpeg yolları, öncelik sırasıyla: [{ path, source }]. */
function ffmpegCandidates({ env = process.env, platform = process.platform, arch = process.arch, resourcesPath = process.resourcesPath, appRoot = null } = {}) {
  const exe = platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
  const list = [];
  if (env.ELITLIG_FFMPEG) list.push({ path: env.ELITLIG_FFMPEG, source: "env" });
  if (resourcesPath) list.push({ path: path.join(resourcesPath, "ffmpeg", exe), source: "bundled" });
  if (appRoot && platform === "darwin") list.push({ path: path.join(appRoot, "build", "ffmpeg", arch, exe), source: "dev" });
  if (platform === "darwin") list.push({ path: `/opt/homebrew/bin/${exe}`, source: "system" }, { path: `/usr/local/bin/${exe}`, source: "system" });
  for (const dir of String(env.PATH || "").split(path.delimiter).filter(Boolean)) list.push({ path: path.join(dir, exe), source: "system" });
  const seen = new Set();
  return list.filter((c) => (seen.has(c.path) ? false : seen.add(c.path)));
}

function resolveFfmpeg(options = {}, exists = isExecutable) {
  return ffmpegCandidates(options).find((c) => exists(c.path)) || null;
}

/* ------------------------------ çıktı ayrıştırma ------------------------------ */

const parseVersion = (text) => String(text || "").match(/ffmpeg version (\S+)/i)?.[1] || null;

/** `ffmpeg -encoders` / `-muxers` çıktısındaki adlar. */
function parseCodecList(text) {
  const names = new Set();
  for (const line of String(text || "").split(/\r?\n/)) {
    const m = line.match(/^\s*(?:[VAS][A-Z.]{5}|D?E\s?|[D ]E[d ]?)\s+([\w,-]+)\s/);
    if (m) for (const name of m[1].split(",")) names.add(name);
  }
  return names;
}

/** Klip yoklaması: `ffmpeg -i dosya` stderr'inden süre ve boyut. */
function parseProbe(text) {
  const s = String(text || "");
  const d = s.match(/Duration:\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/);
  const v = s.match(/Stream #\S+.*?Video:.*?[, ](\d{2,5})x(\d{2,5})[, \]]/);
  return {
    durationMs: d ? Math.round((Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3])) * 1000) : null,
    width: v ? Number(v[1]) : null,
    height: v ? Number(v[2]) : null,
    hasAudio: /Stream #\S+.*?Audio:/.test(s),
  };
}

/* --------------------------------- yoklama --------------------------------- */

const run = (file, args, { timeout = 15000 } = {}) => new Promise((resolve) => {
  execFile(file, args, { timeout, maxBuffer: 8 * 1024 * 1024, windowsHide: true }, (error, stdout, stderr) => {
    resolve({ ok: !error, code: error ? (typeof error.code === "number" ? error.code : -1) : 0, stdout: String(stdout || ""), stderr: String(stderr || ""), error });
  });
});

/** Kodlayıcı gerçekten açılıyor mu (VideoToolbox sanal makinede / eski Mac'te açılmayabilir). */
const encoderTestArgs = (encoder) => [
  "-hide_banner", "-nostdin", "-loglevel", "error",
  "-f", "lavfi", "-i", "color=c=black:s=320x240:r=30:d=0.4",
  "-frames:v", "10", ...videoEncoderArgs(encoder, { videoBitrateKbps: 500, fps: 30 }),
  "-f", "null", "-",
];

/**
 * ffmpeg'in sürümünü ve gerekli parçalarını yoklar.
 * → { available, path, source, version, encoders: { videotoolbox, libx264 }, muxers: { tee, segment, flv }, aac, error? }
 */
async function probeFfmpeg(candidate, { runImpl = run, testEncoders = true } = {}) {
  const none = { available: false, path: null, source: null, version: null, encoders: { videotoolbox: false, libx264: false }, muxers: { tee: false, segment: false, flv: false }, aac: false };
  if (!candidate) return { ...none, error: "ffmpeg bulunamadı." };
  const version = await runImpl(candidate.path, ["-hide_banner", "-version"]);
  if (!version.ok) return { ...none, path: candidate.path, source: candidate.source, error: "ffmpeg çalıştırılamadı." };
  const [enc, mux] = await Promise.all([runImpl(candidate.path, ["-hide_banner", "-encoders"]), runImpl(candidate.path, ["-hide_banner", "-muxers"])]);
  const encoders = parseCodecList(enc.stdout);
  const muxers = parseCodecList(mux.stdout);
  const has = { videotoolbox: encoders.has(ENCODERS.videotoolbox), libx264: encoders.has(ENCODERS.libx264) };
  if (testEncoders) {
    for (const key of Object.keys(has)) {
      if (has[key]) has[key] = (await runImpl(candidate.path, encoderTestArgs(ENCODERS[key]), { timeout: 15000 })).ok;
    }
  }
  const info = {
    available: Boolean((has.videotoolbox || has.libx264) && encoders.has("aac") && muxers.has("tee") && muxers.has("segment") && muxers.has("flv")),
    path: candidate.path,
    source: candidate.source,
    version: parseVersion(version.stdout),
    encoders: has,
    muxers: { tee: muxers.has("tee"), segment: muxers.has("segment"), flv: muxers.has("flv") },
    aac: encoders.has("aac"),
  };
  if (!info.available) info.error = "ffmpeg'de canlı yayın için gereken kodlayıcı / biçim yok.";
  return info;
}

/** Tercih: VideoToolbox (donanım), olmazsa libx264. */
const pickEncoder = (encoders) => (encoders?.videotoolbox ? ENCODERS.videotoolbox : encoders?.libx264 ? ENCODERS.libx264 : null);

/* ------------------------------ komut kurucuları ------------------------------ */

const STREAM_URL = /^rtmps?:\/\/[^\s|[\]'"\\]+$/i;

/** RTMP(S) adresi geçerli mi; tee sözdizimini bozacak karakterler (| [ ] ' \ boşluk) reddedilir. */
const isValidStreamUrl = (url) => typeof url === "string" && url.length <= 2048 && STREAM_URL.test(url.trim());

/** Yayın anahtarını kayıtlardan gizler: rtmp://a.rtmp.youtube.com/live2/abcd-… → …/live2/••••ef12 */
const maskUrl = (url) => String(url || "").replace(/(rtmps?:\/\/[^/]+\/(?:[^/]+\/)*)([^/?]+)/i, (_m, base, key) => `${base}${key.length > 4 ? `••••${key.slice(-4)}` : "••••"}`);

const clampInt = (value, min, max, fallback) => {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
const even = (n) => n - (n % 2);

/** Yayın seçeneklerini sınırlar içine çeker. */
function normalizeStreamOptions(opts = {}) {
  return {
    url: opts.url ? String(opts.url).trim() : null,
    width: even(clampInt(opts.width, 320, 3840, 1920)),
    height: even(clampInt(opts.height, 180, 2160, 1080)),
    fps: clampInt(opts.fps, 15, 60, 30),
    videoBitrateKbps: clampInt(opts.videoBitrateKbps, 300, 20000, 4500),
    audioBitrateKbps: clampInt(opts.audioBitrateKbps, 64, 320, 160),
    mimeType: String(opts.mimeType || ""),
  };
}

function videoEncoderArgs(encoder, { videoBitrateKbps, fps }) {
  const vb = videoBitrateKbps;
  const gop = fps * 2;
  const rate = ["-b:v", `${vb}k`, "-maxrate", `${vb}k`, "-bufsize", `${vb * 2}k`, "-g", String(gop), "-keyint_min", String(gop)];
  if (encoder === ENCODERS.videotoolbox) {
    return ["-c:v", ENCODERS.videotoolbox, "-allow_sw", "1", "-realtime", "1", "-profile:v", "high", ...rate];
  }
  return ["-c:v", ENCODERS.libx264, "-preset", "veryfast", "-profile:v", "high", "-sc_threshold", "0", ...rate, "-x264-params", "nal-hrd=cbr"];
}

const SEGMENT_PATTERN = "seg%05d.ts";
const segmentName = (index) => `seg${String(index).padStart(5, "0")}.ts`;
const segmentIndex = (name) => {
  const m = /^seg(\d{5,})\.ts$/.exec(String(name || ""));
  return m ? Number(m[1]) : null;
};

/**
 * Yayın komutu. ffmpeg, MediaRecorder çıktısını (Matroska/WebM) stdin'den okur,
 * yeniden kodlar ve tee ile iki çıkışa yazar:
 *   1. FLV → RTMP(S) (onfail=ignore: yayın koparsa kayıt halkası sürer)
 *   2. 2 sn'lik MPEG-TS parçaları (klip / tekrar için), cwd = parça klasörü
 * İlerleme stdout'a (-progress pipe:1), uyarı/hatalar stderr'e yazılır.
 */
function buildStreamArgs({ url = null, width, height, fps, videoBitrateKbps, audioBitrateKbps, encoder, segmentSeconds = 2, segmentStart = 0, listFile = "list.csv", inputFormat = "matroska" }) {
  const outputs = [];
  if (url) outputs.push(`[f=flv:onfail=ignore:flvflags=no_duration_filesize]${url}`);
  outputs.push(`[f=segment:segment_time=${segmentSeconds}:segment_time_delta=0.05:segment_format=mpegts:reset_timestamps=1:segment_start_number=${segmentStart}:segment_list=${listFile}:segment_list_type=csv:onfail=abort]${SEGMENT_PATTERN}`);
  return [
    "-hide_banner", "-nostdin", "-loglevel", "warning", "-nostats",
    "-progress", "pipe:1", "-stats_period", "1",
    "-fflags", "+genpts+discardcorrupt", "-thread_queue_size", "1024",
    // MediaRecorder başlığı iz bilgisini taşır; uzun yoklama yalnız başlangıç gecikmesi ekler.
    "-probesize", "1000000", "-analyzeduration", "1000000",
    "-f", inputFormat, "-i", "pipe:0",
    "-map", "0:v:0", "-map", "0:a:0?",
    "-vf", `scale=${width}:${height}:flags=bicubic,fps=${fps},format=yuv420p`,
    ...videoEncoderArgs(encoder, { videoBitrateKbps, fps }),
    "-force_key_frames", `expr:gte(t,n_forced*${segmentSeconds})`,
    "-c:a", "aac", "-b:a", `${audioBitrateKbps}k`, "-ar", "44100", "-ac", "2", "-af", "aresample=async=1000",
    "-flags", "+global_header",
    "-max_muxing_queue_size", "1024",
    "-f", "tee", outputs.join("|"),
  ];
}

/** Klip birleştirme: concat demuxer, yeniden kodlama yok. */
const buildConcatArgs = (listFile, outFile) => [
  "-hide_banner", "-nostdin", "-loglevel", "error", "-y",
  "-f", "concat", "-safe", "0", "-i", listFile,
  "-map", "0:v:0", "-map", "0:a:0?",
  "-c", "copy", "-bsf:a", "aac_adtstoasc", "-movflags", "+faststart",
  outFile,
];

/** concat demuxer liste satırı (tek tırnak kaçışı). */
const concatLine = (file) => `file '${String(file).replace(/'/g, "'\\''")}'`;

/* -------------------------------- ilerleme -------------------------------- */

const num = (v) => {
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : null;
};

/** `-progress` bloğunu sadeleştirir. */
function normalizeProgress(raw) {
  let outTimeMs = null;
  if (raw.out_time_us && raw.out_time_us !== "N/A") outTimeMs = Math.round(Number(raw.out_time_us) / 1000);
  else if (raw.out_time_ms && raw.out_time_ms !== "N/A") outTimeMs = Math.round(Number(raw.out_time_ms) / 1000); // ffmpeg'de bu da mikro saniye
  else if (raw.out_time) {
    const m = raw.out_time.match(/(-?\d+):(\d{2}):(\d{2}(?:\.\d+)?)/);
    if (m) outTimeMs = Math.round((Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])) * 1000);
  }
  if (!Number.isFinite(outTimeMs) || outTimeMs < 0) outTimeMs = outTimeMs === null ? null : 0;
  const bitrate = raw.bitrate && /kbits/.test(raw.bitrate) ? num(raw.bitrate) : null;
  const speed = raw.speed && raw.speed !== "N/A" ? num(raw.speed) : null;
  return {
    frame: num(raw.frame),
    fps: num(raw.fps),
    bitrateKbps: bitrate,
    totalSize: raw.total_size && raw.total_size !== "N/A" ? num(raw.total_size) : null,
    outTimeMs,
    speed,
    droppedFrames: num(raw.drop_frames) ?? 0,
    dupFrames: num(raw.dup_frames) ?? 0,
    done: raw.progress === "end",
  };
}

/** Satır satır gelen `-progress` çıktısını bloklara böler. */
function createProgressParser(onBlock) {
  let buffer = "";
  let block = {};
  return {
    feed(chunk) {
      buffer += String(chunk);
      let i;
      while ((i = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, i).trim();
        buffer = buffer.slice(i + 1);
        const eq = line.indexOf("=");
        if (eq <= 0) continue;
        const key = line.slice(0, eq).trim();
        block[key] = line.slice(eq + 1).trim();
        if (key === "progress") {
          const done = block;
          block = {};
          onBlock(normalizeProgress(done));
        }
      }
    },
  };
}

/* ------------------------------- hata eşleme ------------------------------- */

const ERROR_RULES = [
  { code: "AUTH", re: /NetStream\.Publish\.(BadName|Rejected)|NetConnection\.Connect\.Rejected|Unauthori[sz]ed|authenticat|invalid stream key|stream key|403 Forbidden/i, message: "Yayın sunucusu yayını kabul etmedi: yayın anahtarı geçersiz ya da başka bir yayında kullanılıyor. YouTube Studio'daki anahtarı kontrol edin." },
  { code: "CONNECTION_REFUSED", re: /Connection refused|ECONNREFUSED/i, message: "Yayın sunucusu bağlantıyı reddetti. RTMP adresini ve portu kontrol edin." },
  { code: "DNS", re: /Failed to resolve hostname|nodename nor servname|Name or service not known|Could not resolve|No address associated/i, message: "Yayın sunucusunun adresi bulunamadı. İnternet bağlantınızı ve RTMP adresini kontrol edin." },
  { code: "TIMEOUT", re: /timed out|ETIMEDOUT|Operation timed out|Connection timeout/i, message: "Yayın sunucusuna bağlanılamadı (zaman aşımı). İnternet bağlantınızı kontrol edin." },
  { code: "TLS", re: /\b(TLS|SSL)\b|handshake|certificate/i, message: "Güvenli yayın bağlantısı (RTMPS) kurulamadı. Saat ayarını ve ağınızı kontrol edin ya da rtmp:// adresini deneyin." },
  { code: "ENCODER", re: /Error (?:initializing|while opening) (?:output stream|encoder)|Could not open encoder|cannot create compression session|Error: cannot create|Encoder not found|Unknown encoder|Error setting option|VTCompressionSession|videotoolbox.*error/i, message: "Video kodlayıcı başlatılamadı." },
  { code: "INPUT", re: /EBML header parsing failed|Invalid data found when processing input|Error opening input|could not find codec parameters|matroska.*(error|invalid)/i, message: "Yayın görüntüsü okunamadı (kayıt biçimi). Kaydedici yeniden başlatılıyor." },
  { code: "IO", re: /Input\/output error|Broken pipe|Connection reset|End of file|EPIPE|ECONNRESET|Network is unreachable|Host is down/i, message: "Yayın bağlantısı koptu (giriş/çıkış hatası). Ağ bağlantınızı kontrol edin." },
];

/** ffmpeg hata metnini Türkçe iletiye çevirir: { code, message }. */
function mapFfmpegError(text) {
  const s = String(text || "");
  for (const rule of ERROR_RULES) if (rule.re.test(s)) return { code: rule.code, message: rule.message };
  return { code: "UNKNOWN", message: "Yayın kodlayıcısı (ffmpeg) beklenmedik biçimde durdu." };
}

/** tee'nin RTMP çıkışı düştü mü (onfail=ignore: süreç sürer, yalnız bu satır yazılır). */
const TEE_SLAVE_FAILED = /Slave muxer #(\d+) failed:?\s*(.*?)(?:, continuing with|$)/i;
const parseSlaveFailure = (line) => {
  const m = TEE_SLAVE_FAILED.exec(String(line || ""));
  return m ? { index: Number(m[1]), reason: m[2] || "" } : null;
};

module.exports = {
  ENCODERS,
  ffmpegCandidates,
  resolveFfmpeg,
  isExecutable,
  parseVersion,
  parseCodecList,
  parseProbe,
  probeFfmpeg,
  pickEncoder,
  isValidStreamUrl,
  maskUrl,
  normalizeStreamOptions,
  videoEncoderArgs,
  buildStreamArgs,
  buildConcatArgs,
  concatLine,
  normalizeProgress,
  createProgressParser,
  mapFfmpegError,
  parseSlaveFailure,
  segmentName,
  segmentIndex,
  SEGMENT_PATTERN,
  run,
};
