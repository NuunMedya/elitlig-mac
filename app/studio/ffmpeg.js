// Yayın Stüdyosu — ffmpeg ikilisi, yetenek yoklaması ve komut satırı kurucuları.
//
// Buradaki işlevler Electron'a bağlı değildir (birim testleri doğrudan çağırır).
//
// İkili nereden gelir (ilk bulunan):
//   1. ELITLIG_FFMPEG ortam değişkeni (geliştirme / CI)
//   2. Paketli uygulama: <resources>/ffmpeg/ffmpeg(.exe)
//      Mac: Contents/Resources/ffmpeg/ffmpeg — build/fetch-ffmpeg.js her mimari
//      için ayrı ikiliyi indirir, electron-builder "${arch}" ile x64 ve arm64
//      derlemelerine koyar, @electron/universal ikisini lipo ile tek (fat)
//      ikiliye birleştirir.
//      Windows: resources\ffmpeg\ffmpeg.exe (build/ffmpeg/win-x64, build.win.extraResources)
//   3. Geliştirme: <proje>/build/ffmpeg/<arch>/ffmpeg, Windows'ta <proje>/build/ffmpeg/win-x64/ffmpeg.exe
//   4. Sistem: Homebrew (/opt/homebrew/bin, /usr/local/bin; yalnız Mac) ve PATH
//
// Kodlayıcı tercihi (yoklamada her biri gerçekten açılarak denenir):
//   Mac:     h264_videotoolbox → libx264
//   Windows: h264_nvenc (NVIDIA) → h264_qsv (Intel) → h264_amf (AMD) →
//            h264_mf (Media Foundation, donanım) → libx264
// Tüm kodlayıcılara açık H.264 seviyesi verilir (computeH264Level): seviye
// çözünürlük / kare hızına göre seçilmezse (ör. 1080p60 akışın 4.0 yazılması)
// tarayıcıların kod çözücüsü görüntüyü reddedip siyah gösterebilir.
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { execFile } = require("node:child_process");
const h264level = require("./h264level");

const ENCODERS = Object.freeze({
  videotoolbox: "h264_videotoolbox",
  nvenc: "h264_nvenc",
  qsv: "h264_qsv",
  amf: "h264_amf",
  mf: "h264_mf",
  libx264: "libx264",
});

/** İşletim sistemine göre denenecek kodlayıcılar (anahtar adlarıyla), tercih sırasıyla. */
const ENCODER_ORDER = Object.freeze({
  darwin: Object.freeze(["videotoolbox", "libx264"]),
  win32: Object.freeze(["nvenc", "qsv", "amf", "mf", "libx264"]),
  default: Object.freeze(["libx264"]),
});
const encoderOrder = (platform = process.platform) => ENCODER_ORDER[platform] || ENCODER_ORDER.default;
/** Platformdan bağımsız genel sıra (pickEncoder platform verilmeden çağrılırsa). */
const ALL_ORDER = Object.freeze(["videotoolbox", "nvenc", "qsv", "amf", "mf", "libx264"]);
const encoderKey = (name) => Object.keys(ENCODERS).find((k) => ENCODERS[k] === name) || null;
const isHardwareEncoder = (name) => Boolean(name) && name !== ENCODERS.libx264;
const emptyEncoders = () => Object.fromEntries(Object.keys(ENCODERS).map((k) => [k, false]));

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
  const win = platform === "win32";
  const P = win ? path.win32 : path.posix;
  const exe = win ? "ffmpeg.exe" : "ffmpeg";
  const list = [];
  if (env.ELITLIG_FFMPEG) list.push({ path: env.ELITLIG_FFMPEG, source: "env" });
  if (resourcesPath) list.push({ path: P.join(resourcesPath, "ffmpeg", exe), source: "bundled" });
  if (appRoot && platform === "darwin") list.push({ path: P.join(appRoot, "build", "ffmpeg", arch, exe), source: "dev" });
  if (appRoot && win) list.push({ path: P.join(appRoot, "build", "ffmpeg", "win-x64", exe), source: "dev" });
  if (platform === "darwin") list.push({ path: `/opt/homebrew/bin/${exe}`, source: "system" }, { path: `/usr/local/bin/${exe}`, source: "system" });
  // Windows'ta ortam değişkeni "Path" yazılabilir (process.env büyük/küçük harf duyarsız, düz nesne değil).
  const pathVar = env.PATH ?? env.Path ?? env.path ?? "";
  for (const dir of String(pathVar).split(P.delimiter).filter(Boolean)) list.push({ path: P.join(dir.replace(/^"|"$/g, ""), exe), source: "system" });
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

/**
 * Kodlayıcı gerçekten açılıyor mu: kısa bir deneme kodlaması (VideoToolbox sanal
 * makinede / eski Mac'te; NVENC / QSV / AMF ilgili ekran kartı ya da sürücü
 * yoksa açılmaz). Yayındaki gibi global başlık + FLV ile yapılır.
 */
const encoderTestArgs = (encoder) => [
  "-hide_banner", "-nostdin", "-loglevel", "error",
  "-f", "lavfi", "-i", "color=c=black:s=640x360:r=30:d=0.5",
  "-frames:v", "10", "-vf", `format=${encoderPixelFormat(encoder)}`,
  ...videoEncoderArgs(encoder, { videoBitrateKbps: 800, fps: 30, width: 640, height: 360 }),
  "-flags", "+global_header", "-f", "flv", "-",
];

/**
 * ffmpeg'in sürümünü ve gerekli parçalarını yoklar. Yalnız bu işletim sisteminin
 * kodlayıcıları (encoderOrder) denenir; diğerleri false kalır.
 * → { available, path, source, version, encoders: { videotoolbox, nvenc, qsv, amf, mf, libx264 },
 *     encoder (tercih edilen), muxers: { tee, segment, flv }, aac, error? }
 */
async function probeFfmpeg(candidate, { runImpl = run, testEncoders = true, platform = process.platform } = {}) {
  const none = { available: false, path: null, source: null, version: null, encoders: emptyEncoders(), encoder: null, muxers: { tee: false, segment: false, flv: false }, aac: false };
  if (!candidate) return { ...none, error: "ffmpeg bulunamadı." };
  const version = await runImpl(candidate.path, ["-hide_banner", "-version"]);
  if (!version.ok) return { ...none, path: candidate.path, source: candidate.source, error: "ffmpeg çalıştırılamadı." };
  const [enc, mux] = await Promise.all([runImpl(candidate.path, ["-hide_banner", "-encoders"]), runImpl(candidate.path, ["-hide_banner", "-muxers"])]);
  const encoders = parseCodecList(enc.stdout);
  const muxers = parseCodecList(mux.stdout);
  const has = emptyEncoders();
  for (const key of encoderOrder(platform)) has[key] = encoders.has(ENCODERS[key]);
  if (testEncoders) {
    for (const key of encoderOrder(platform)) {
      if (has[key]) has[key] = (await runImpl(candidate.path, encoderTestArgs(ENCODERS[key]), { timeout: 15000 })).ok;
    }
  }
  const info = {
    available: Boolean(Object.values(has).some(Boolean) && encoders.has("aac") && muxers.has("tee") && muxers.has("segment") && muxers.has("flv")),
    path: candidate.path,
    source: candidate.source,
    version: parseVersion(version.stdout),
    encoders: has,
    encoder: pickEncoder(has, platform),
    muxers: { tee: muxers.has("tee"), segment: muxers.has("segment"), flv: muxers.has("flv") },
    aac: encoders.has("aac"),
  };
  if (!info.available) info.error = "ffmpeg'de canlı yayın için gereken kodlayıcı / biçim yok.";
  return info;
}

/**
 * Tercih edilen kodlayıcı (ffmpeg adı) ya da null. Mac: VideoToolbox → libx264;
 * Windows: NVENC → QSV → AMF → Media Foundation → libx264.
 * platform verilmezse genel sıra kullanılır (yoklama zaten yalnız o işletim
 * sisteminin kodlayıcılarını true yapar).
 */
const pickEncoder = (encoders, platform) => {
  const order = platform ? encoderOrder(platform) : ALL_ORDER;
  const key = order.find((k) => encoders?.[k]);
  return key ? ENCODERS[key] : null;
};

/**
 * Kodlayıcı açılamazsa sıradaki (çalışma anı geri düşüşü): ör. h264_nvenc →
 * h264_qsv → … → libx264. Sırada açık kodlayıcı kalmadıysa null.
 */
const nextEncoder = (current, encoders, platform) => {
  const order = platform ? encoderOrder(platform) : ALL_ORDER;
  const i = order.indexOf(encoderKey(current));
  const key = order.slice(i + 1).find((k) => encoders?.[k]);
  return key ? ENCODERS[key] : null;
};

/* ------------------------------- H.264 seviyesi ------------------------------- */

/**
 * Çözünürlük ve kare hızına uygun H.264 seviyesi ("4.1" | "4.2" | "5.1" | "5.2" …).
 * Hesap h264level.js'tedir (klip / tekrar MP4'lerine yazılan düzeyle aynı olsun
 * diye tek yer): gereken en düşük düzey, en az 4.1; 4.2'yi aşan en az 5.1.
 * 720p / 1080p30 → 4.1, 1080p60 → 4.2, 1440p / 4K30 → 5.1, 4K60 → 5.2.
 */
const computeH264Level = ({ width, height, fps } = {}) => h264level.computeH264Level(width, height, fps);

/** Kodlayıcının istediği giriş piksel biçimi (QSV / AMF / Media Foundation NV12 ister). */
const encoderPixelFormat = (encoder) => ([ENCODERS.qsv, ENCODERS.amf, ENCODERS.mf].includes(encoder) ? "nv12" : "yuv420p");

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

/**
 * Video kodlayıcı seçenekleri: sabit bit hızı (CBR), 2 sn'de bir anahtar kare,
 * High profil, açık H.264 seviyesi, düşük gecikme ayarları.
 * width / height verilmezse 1080p varsayılır (seviye hesabı için).
 */
function videoEncoderArgs(encoder, { videoBitrateKbps, fps, width = 1920, height = 1080, keyframeSeconds = 2 }) {
  const vb = videoBitrateKbps;
  const gop = Math.max(1, Math.round(fps * keyframeSeconds));
  const level = computeH264Level({ width, height, fps });
  const rate = ["-b:v", `${vb}k`, "-maxrate", `${vb}k`, "-bufsize", `${vb * 2}k`, "-g", String(gop), "-keyint_min", String(gop)];
  switch (encoder) {
    case ENCODERS.videotoolbox:
      return ["-c:v", ENCODERS.videotoolbox, "-allow_sw", "1", "-realtime", "1", "-profile:v", "high", "-level", level, ...rate];
    case ENCODERS.nvenc:
      // forced-idr: -force_key_frames ile istenen kareler IDR olur (klip parçaları bağımsız açılır).
      return ["-c:v", ENCODERS.nvenc, "-preset", "p4", "-tune", "ll", "-rc", "cbr", "-profile:v", "high", "-level", level, "-forced-idr", "1", "-no-scenecut", "1", ...rate];
    case ENCODERS.qsv:
      // QSV seviyeyi genel AVCodecContext.level'dan okur: 4.2 → 42. b:v = maxrate → CBR.
      return ["-c:v", ENCODERS.qsv, "-preset", "veryfast", "-look_ahead", "0", "-profile:v", "high", "-level", String(h264level.levelIdc(level)), "-forced_idr", "1", ...rate];
    case ENCODERS.amf:
      return ["-c:v", ENCODERS.amf, "-usage", "lowlatency", "-rc", "cbr", "-quality", "speed", "-profile:v", "high", "-level", level, ...rate];
    case ENCODERS.mf:
      // Media Foundation'ın seviye seçeneği yok: SPS'teki level_idc h264_metadata ile yazılır.
      // Profil sayıyla verilir (100 = High; h264_mf'in adlı profil seçeneği yok).
      return ["-c:v", ENCODERS.mf, "-hw_encoding", "1", "-rate_control", "cbr", "-scenario", "live_streaming", "-profile:v", "100", ...rate, "-bsf:v", `h264_metadata=level=${level}`];
    default:
      return ["-c:v", ENCODERS.libx264, "-preset", "veryfast", "-profile:v", "high", "-level", level, "-sc_threshold", "0", ...rate, "-x264-params", "nal-hrd=cbr"];
  }
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
    "-vf", `scale=${width}:${height}:flags=bicubic,fps=${fps},format=${encoderPixelFormat(encoder)}`,
    ...videoEncoderArgs(encoder, { videoBitrateKbps, fps, width, height, keyframeSeconds: segmentSeconds }),
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
  { code: "ENCODER", re: /Error (?:initializing|while opening) (?:output stream|encoder)|Could not open encoder|cannot create compression session|Error: cannot create|Encoder not found|Unknown encoder|Error setting option|VTCompressionSession|videotoolbox.*error|Cannot load (?:nvcuda|nvEncodeAPI|libcuda)|OpenEncodeSessionEx failed|No capable devices found|Error initializing an internal MFX session|amfrt64|AMF (?:failed|initiali[sz]ation)|could not find any MFT/i, message: "Video kodlayıcı başlatılamadı." },
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
  ENCODER_ORDER,
  encoderOrder,
  encoderKey,
  isHardwareEncoder,
  nextEncoder,
  computeH264Level,
  encoderPixelFormat,
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
