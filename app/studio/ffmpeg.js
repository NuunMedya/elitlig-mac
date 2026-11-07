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
  const none = { available: false, path: null, source: null, version: null, encoders: emptyEncoders(), encoder: null, muxers: { tee: false, segment: false, flv: false, fifo: false, matroska: false }, aac: false };
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
    // fifo: RTMP çıkışı ayrı iş parçacığında, kopunca süreç içinde yeniden bağlanır (yoksa düz tee).
    // matroska: yerel tam kayıt (.mkv).
    muxers: { tee: muxers.has("tee"), segment: muxers.has("segment"), flv: muxers.has("flv"), fifo: muxers.has("fifo"), matroska: muxers.has("matroska") },
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

/**
 * Metindeki tüm RTMP(S) adreslerinin anahtarını gizler (günlük / tanılama).
 * Adres boşluk, tırnak, "|" ya da "]" ile biter (tee bağımsız değişkeni, ffmpeg satırları).
 */
const maskSecrets = (text) => String(text ?? "").replace(/(rtmps?:\/\/[^\s'"|\]]*\/)([^\s'"|\]/]+)/gi, (_m, base, key) => `${base}${key.length > 4 ? `••••${key.slice(-4)}` : "••••"}`);

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
    audioBitrateKbps: clampInt(opts.audioBitrateKbps, 128, 320, 160),
    mimeType: String(opts.mimeType || ""),
    // Anahtar kare aralığı (sn, 1–4; YouTube ≤ 4 ister). Parça halkası 2 sn'lik olduğundan
    // 2 sn'den uzun aralıkta yine 2 sn'de bir anahtar kare zorlanır (klip / tekrar sınırları).
    keyframeSec: opts.keyframeSec === undefined || opts.keyframeSec === null || opts.keyframeSec === "" ? null : clampInt(opts.keyframeSec, 1, 4, 2),
    // "hardware" (varsayılan: VideoToolbox / NVENC …) | "software" (libx264).
    encoderPreference: opts.encoderPreference === "software" ? "software" : "hardware",
    // Tek kodlama (WebCodecs): görüntü arayüzde H.264'e kodlanmış gelir, ffmpeg kopyalar.
    videoCopy: opts.videoCopy === true,
    pipeline: opts.videoCopy === true ? "webcodecs" : "legacy",
    videoEncoderLabel: opts.videoCopy === true && opts.videoEncoderLabel ? String(opts.videoEncoderLabel).slice(0, 120) : null,
  };
}

/** Kodlayıcı adı + kodlama yolu (durum ve tanılama): "webcodecs" ya da ffmpeg kodlayıcısı. */
const WEBCODECS_ENCODER = "webcodecs";

/** Kodlayıcı tercihi: "software" → libx264 (varsa); aksi halde pickEncoder sırası. */
const pickEncoderFor = (encoders, preference, platform) => (preference === "software" && encoders?.libx264 ? ENCODERS.libx264 : pickEncoder(encoders, platform));

/** Zorlanan anahtar kare aralığı: istenen aralık parça süresini aşamaz (parça sınırı = anahtar kare). */
const forcedKeyframeSec = (keyframeSec, segmentSeconds) => (keyframeSec > 0 ? Math.min(keyframeSec, segmentSeconds) : segmentSeconds);

/**
 * Hız düzeyi (speedLevel 0..2): kodlayıcı gerçek zamana yetişemezse (ffmpeg
 * speed < 0.95, 10 sn) bir sonraki yeniden başlatmada daha hızlı ön ayar.
 *   libx264: veryfast → superfast → ultrafast;  NVENC: p4 → p2 → p1;
 *   diğer donanım kodlayıcılarında (VideoToolbox, QSV, AMF, MF) etkisi yok.
 */
const X264_PRESETS = Object.freeze(["veryfast", "superfast", "ultrafast"]);
const NVENC_PRESETS = Object.freeze(["p4", "p2", "p1"]);
const MAX_SPEED_LEVEL = X264_PRESETS.length - 1;
const presetFor = (list, level) => list[Math.min(list.length - 1, Math.max(0, Math.round(Number(level) || 0)))];

/**
 * Video kodlayıcı seçenekleri: sabit bit hızı (YouTube CBR önerisi:
 * -minrate = -b:v = -maxrate, -bufsize = 1× bit hızı → 1 sn'lik VBV, bit hızı
 * dalgalanmaz), 2 sn'de bir anahtar kare (-g = -keyint_min = 2 × fps; sahne
 * değişiminde ek anahtar kare yok), High profil, açık H.264 seviyesi.
 * width / height verilmezse 1080p varsayılır (seviye hesabı için).
 */
function videoEncoderArgs(encoder, { videoBitrateKbps, fps, width = 1920, height = 1080, keyframeSeconds = 2, speedLevel = 0 }) {
  const vb = videoBitrateKbps;
  const gop = Math.max(1, Math.round(fps * keyframeSeconds));
  const level = computeH264Level({ width, height, fps });
  const rate = ["-b:v", `${vb}k`, "-minrate", `${vb}k`, "-maxrate", `${vb}k`, "-bufsize", `${vb}k`, "-g", String(gop), "-keyint_min", String(gop)];
  switch (encoder) {
    case ENCODERS.videotoolbox:
      // allow_sw 0: Apple'ın yazılım H.264'üne sessizce düşmesin (düşük kalite, yüksek işlemci);
      // donanım yoksa açılış hatası → x264'e geçilir (engine fallbackEncoder, yoklama da aynı seçenekle).
      return ["-c:v", ENCODERS.videotoolbox, "-allow_sw", "0", "-realtime", "1", "-profile:v", "high", "-level", level, ...rate];
    case ENCODERS.nvenc:
      // OBS ile aynı: tune hq + 2 B-kare (ll kalitesi düşük); forced-idr: -force_key_frames
      // ile istenen kareler IDR olur (klip parçaları bağımsız açılır).
      return ["-c:v", ENCODERS.nvenc, "-preset", presetFor(NVENC_PRESETS, speedLevel), "-tune", "hq", "-rc", "cbr", "-bf", "2", "-profile:v", "high", "-level", level, "-forced-idr", "1", "-no-scenecut", "1", ...rate];
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
      return ["-c:v", ENCODERS.libx264, "-preset", presetFor(X264_PRESETS, speedLevel), "-profile:v", "high", "-level", level, "-bf", "2", "-sc_threshold", "0", ...rate, "-x264-params", "nal-hrd=cbr:force-cfr=1"];
  }
}

const SEGMENT_PATTERN = "seg%05d.ts";
const segmentName = (index) => `seg${String(index).padStart(5, "0")}.ts`;
const segmentIndex = (name) => {
  const m = /^seg(\d{5,})\.ts$/.exec(String(name || ""));
  return m ? Number(m[1]) : null;
};

/**
 * tee çıkış adı kaçışı: tee bağımsız değişkeni av_get_token ile ayrıştırılır
 * ("\\", "'" ve "|" özel). Windows yolları ileri eğik çizgiye çevrilir
 * (ffmpeg Windows'ta "/" kabul eder; "\\" kaçış karakteridir).
 */
const teeEscape = (file, platform = process.platform) => {
  const s = platform === "win32" ? String(file).replace(/\\/g, "/") : String(file);
  return s.replace(/[\\'|]/g, (c) => `\\${c}`);
};

/**
 * RTMP için fifo seçenekleri (tee'de "use_fifo=1:fifo_options=…"). fifo, FLV
 * çıkışını ayrı iş parçacığında yazar: ağ yavaşlarsa kodlayıcı beklemez (kuyruk
 * dolarsa paket atılır, yeniden anahtar kareyle başlar); bağlantı koparsa
 * ffmpeg SÜRECİ YENİDEN BAŞLAMADAN 2 sn arayla yeniden bağlanır (kayıt halkası,
 * yerel kayıt ve tarayıcı kaydedicisi kesilmez). Deneme hakkı bitince tee
 * "Slave muxer #0 failed" yazar; motor o zaman süreci yeniden başlatır.
 * İç ":" iki kez kaçılır (tee bağımsız değişkeni + tee seçenek sözlüğü).
 */
const RTMP_FIFO_OPTIONS = Object.freeze({
  attempt_recovery: 1,
  recover_any_error: 1,
  recovery_wait_time: 2,
  max_recovery_attempts: 20,
  drop_pkts_on_overflow: 1,
  restart_with_keyframe: 1,
  queue_size: 900, // ~10 sn (30 fps video + AAC ≈ 77 paket/sn)
});
const fifoOptionString = (opts = RTMP_FIFO_OPTIONS) => Object.entries(opts).map(([k, v]) => `${k}=${v}`).join("\\\\\\:");

/**
 * tee çıkışlarının sırası (tee "Slave muxer #N" numarası): [rtmp?, local?, segment].
 * Motor, düşen yan çıkışın hangisi olduğunu buradan anlar (yerel kayıt düşerse
 * yayın sürer).
 */
const streamSlaves = ({ url = null, relayUrl = null, localFile = null } = {}) => [url || relayUrl ? "rtmp" : null, localFile ? "local" : null, "segment"].filter(Boolean);

/**
 * Aktarıcıya (relay.js) giden MPEG-TS çıkışı: tcp://127.0.0.1:<port>. fifo
 * varsa ayrı iş parçacığında yazılır ve yerel soket yavaşlarsa paket atılır
 * (kodlayıcı, halka ve yerel kayıt hiç beklemez); atıldıktan sonra anahtar
 * kareyle sürer. onfail=ignore: soket koparsa motor süreci yeniden başlatır.
 */
const RELAY_FIFO_OPTIONS = Object.freeze({ drop_pkts_on_overflow: 1, restart_with_keyframe: 1, queue_size: 600 });
const relaySlave = (relayUrl, fifo, select = "") => `[f=mpegts:onfail=ignore${select}${fifo ? `:use_fifo=1:fifo_options=${fifoOptionString(RELAY_FIFO_OPTIONS)}` : ""}]${relayUrl}`;
const rtmpSlave = (url, fifo, select = "") => `[f=flv:onfail=ignore:flvflags=no_duration_filesize${select}${fifo ? `:use_fifo=1:fifo_options=${fifoOptionString()}` : ""}]${url}`;
const networkSlave = ({ url, relayUrl, fifo, select = "" }) => (relayUrl ? relaySlave(relayUrl, fifo, select) : url ? rtmpSlave(url, fifo, select) : null);
/** Günlük düzeyi: yalnız doğrudan RTMP + fifo'da info (fifo'nun "Recovery successful" satırı). */
const streamLogLevel = ({ url, relayUrl, fifo }) => (url && fifo && !relayUrl ? "level+info" : "level+warning");

/**
 * RTMP aktarıcısı (relay.js): kodlayıcının MPEG-TS çıktısı stdin'den, yeniden
 * kodlamadan (-c copy) FLV olarak RTMP(S)'ye. Kopunca yalnız bu süreç yeniden
 * başlar. -rw_timeout: ölü soket 10 sn'de fark edilir (ffmpeg hata verip çıkar);
 * -tcp_nodelay: küçük paketler beklemeden gider; flvflags no_duration_filesize:
 * canlı FLV'de geri dönüp süre / boyut yazılmaz. -progress: gönderilen bayt
 * (total_size) bağlantının canlı olduğunu gösterir (askı buradan anlaşılır).
 */
function buildRelayArgs({ url, rwTimeoutMs = 10000 } = {}) {
  const rtmp = /^rtmps?:/i.test(String(url || ""));
  return [
    "-hide_banner", "-nostdin", "-y", "-loglevel", "level+warning", "-nostats",
    "-progress", "pipe:1", "-stats_period", "1",
    "-fflags", "+genpts+discardcorrupt", "-thread_queue_size", "1024",
    "-probesize", "2000000", "-analyzeduration", "2000000",
    "-f", "mpegts", "-i", "pipe:0",
    "-map", "0:v:0", "-map", "0:a:0?",
    "-c", "copy",
    // TS'teki ADTS AAC → FLV'nin istediği ham AAC + AudioSpecificConfig (flv kendiliğinden de
    // ekler; açıkça yazılır ki eski / farklı ffmpeg sürümünde de ses bozuk gitmesin).
    "-bsf:a", "aac_adtstoasc",
    "-max_muxing_queue_size", "1024",
    "-f", "flv", "-flvflags", "no_duration_filesize",
    ...(rtmp ? ["-rw_timeout", String(Math.round(rwTimeoutMs * 1000)), "-tcp_nodelay", "1"] : []),
    url,
  ];
}

/** ffmpeg sürümü -fps_mode'u (5.1+) biliyor mu; bilinmeyen (git) sürümde evet. */
const supportsFpsMode = (version) => {
  const m = /^n?(\d+)\.(\d+)/.exec(String(version || ""));
  if (!m) return true;
  const major = Number(m[1]);
  return major > 5 || (major === 5 && Number(m[2]) >= 1);
};

/**
 * Yayın sesi süzgeci (gerçek ffmpeg ile denendi, app/test/studio-audio-ffmpeg.test.js):
 *   aresample=async=1000  zaman damgası titreşimini / küçük boşlukları örnek esneterek emer
 *                         (±5 ms titreşimde tık yok). async=1 / first_pts=0 denendi: async=1
 *                         boşlukları sessizlik ekleyerek kapatır (daha çok tık); first_pts=0
 *                         sesi uzatıp esnetti — kullanılmaz.
 *   alimiter −1 dBFS      son emniyet: arayüzden 0 dBFS üstü gelen örnekler (eski sürüm,
 *                         Opus taşması) AAC'ye girmeden yumuşakça sınırlanır; level=0: otomatik
 *                         seviye YOK (sessiz sesi yükseltmez). Altındaki seste şeffaf.
 *   afade (50 ms)         kodlayıcı / kaydedici yeniden başlayınca ses sıfırdan sert bir
 *                         basamakla değil, yumuşak açılır (yeniden başlatma "tık"ı olmaz).
 */
const STREAM_AUDIO_FILTER = "aresample=async=1000,alimiter=limit=0.891:attack=5:release=50:level=0,afade=t=in:st=0:d=0.05";
/** AAC-LC, 48 kHz stereo; bit hızı 128–320 kbps (YouTube: ≥ 128 kbps stereo). */
const streamAudioArgs = (kbps) => ["-c:a", "aac", "-profile:a", "aac_low", "-b:a", `${clampInt(kbps, 128, 320, 160)}k`, "-ar", "48000", "-ac", "2", "-af", STREAM_AUDIO_FILTER];

/**
 * Yayın komutu. ffmpeg, MediaRecorder çıktısını (Matroska/WebM) stdin'den okur,
 * yeniden kodlar ve tee ile çıkışlara yazar:
 *   1. FLV → RTMP(S): onfail=ignore, flvflags=no_duration_filesize (canlı FLV'de
 *      süre/boyut için geri dönüp yazmaz); fifo varsa süreç içinde yeniden bağlanır.
 *   2. (isteğe bağlı) yerel tam kayıt: Matroska (.mkv, çökmeye dayanıklı), onfail=ignore.
 *   3. 2 sn'lik MPEG-TS parçaları (klip / tekrar / röportaj için), cwd = parça klasörü.
 * Sabit kare hızı: fps süzgeci + -fps_mode cfr + -r (MediaRecorder'ın değişken
 * zaman damgaları YouTube'a düzensiz kare olarak gitmesin). Ses 48 kHz stereo
 * (MediaRecorder Opus 48 kHz; yeniden örnekleme yok), aresample=async ile kayma düzeltilir.
 * Giriş zaman damgaları korunur (+genpts): -use_wallclock_as_timestamps stdin'den
 * topluca okunan parçalarda titreşim ve ses/görüntü kayması yaratır, kullanılmaz.
 * İlerleme stdout'a (-progress pipe:1); günlük stderr'e, düzey önekli
 * ("[warning] …"; fifo'nun "Recovery successful" satırı info düzeyindedir).
 */
function buildStreamArgs({ url = null, relayUrl = null, width, height, fps, videoBitrateKbps, audioBitrateKbps, encoder, keyframeSec = null, segmentSeconds = 2, segmentStart = 0, listFile = "list.csv", inputFormat = "matroska", fifo = false, localFile = null, localEncode = null, speedLevel = 0, fpsMode = true, platform = process.platform, videoCopy = false }) {
  if (videoCopy) return buildCopyStreamArgs({ url, relayUrl, audioBitrateKbps, segmentSeconds, segmentStart, listFile, inputFormat, fifo, localFile, platform });
  if (localFile && localEncode) {
    return buildDualEncodeArgs({ url, relayUrl, width, height, fps, videoBitrateKbps, audioBitrateKbps, encoder, keyframeSec, segmentSeconds, segmentStart, listFile, inputFormat, fifo, localFile, localEncode, speedLevel, fpsMode, platform });
  }
  const outputs = [];
  const net = networkSlave({ url, relayUrl, fifo });
  if (net) outputs.push(net);
  if (localFile) outputs.push(`[f=matroska:onfail=ignore]${teeEscape(localFile, platform)}`);
  outputs.push(`[f=segment:segment_time=${segmentSeconds}:segment_time_delta=0.05:segment_format=mpegts:reset_timestamps=1:segment_start_number=${segmentStart}:segment_list=${listFile}:segment_list_type=csv:onfail=abort]${SEGMENT_PATTERN}`);
  return [
    "-hide_banner", "-nostdin", "-loglevel", streamLogLevel({ url, relayUrl, fifo }), "-nostats",
    "-progress", "pipe:1", "-stats_period", "1",
    "-fflags", "+genpts+discardcorrupt", "-thread_queue_size", "1024",
    // MediaRecorder başlığı iz bilgisini taşır; uzun yoklama yalnız başlangıç gecikmesi ekler.
    "-probesize", "1000000", "-analyzeduration", "1000000",
    "-f", inputFormat, "-i", "pipe:0",
    "-map", "0:v:0", "-map", "0:a:0?",
    "-vf", `scale=${width}:${height}:flags=bicubic,fps=${fps},format=${encoderPixelFormat(encoder)}`,
    ...(fpsMode ? ["-fps_mode", "cfr"] : ["-vsync", "cfr"]), "-r", String(fps),
    ...videoEncoderArgs(encoder, { videoBitrateKbps, fps, width, height, keyframeSeconds: forcedKeyframeSec(keyframeSec, segmentSeconds), speedLevel }),
    "-force_key_frames", `expr:gte(t,n_forced*${forcedKeyframeSec(keyframeSec, segmentSeconds)})`,
    ...streamAudioArgs(audioBitrateKbps),
    "-flags", "+global_header",
    "-max_muxing_queue_size", "1024",
    "-f", "tee", outputs.join("|"),
  ];
}

/**
 * Tek kodlama (WebCodecs) yayın komutu: arayüz görüntüyü H.264 olarak (avcC,
 * Matroska, sabit kare ızgarası, 2 sn'de bir anahtar kare) yollar; ffmpeg
 * görüntüyü YENİDEN KODLAMADAN tee çıkışlarına kopyalar. Zaman damgaları
 * kodlayıcınındır (+genpts yalnız eksik olanlar için); fps süzgeci / -fps_mode
 * yoktur (kopya). h264_mp4toannexb: MPEG-TS (halka, aktarıcı) Annex B ister;
 * Matroska / FLV çıkışları başlığı kendileri avcC'ye çevirir. Ses buildStreamArgs
 * ile aynı (streamAudioArgs: Opus → AAC, aresample + alimiter + afade). Parça sınırları anahtar karelerde (2 sn).
 */
function buildCopyStreamArgs({ url = null, relayUrl = null, audioBitrateKbps, segmentSeconds = 2, segmentStart = 0, listFile = "list.csv", inputFormat = "matroska", fifo = false, localFile = null, platform = process.platform }) {
  const outputs = [];
  const net = networkSlave({ url, relayUrl, fifo });
  if (net) outputs.push(net);
  if (localFile) outputs.push(`[f=matroska:onfail=ignore]${teeEscape(localFile, platform)}`);
  outputs.push(`[f=segment:segment_time=${segmentSeconds}:segment_time_delta=0.05:segment_format=mpegts:reset_timestamps=1:segment_start_number=${segmentStart}:segment_list=${listFile}:segment_list_type=csv:onfail=abort]${SEGMENT_PATTERN}`);
  return [
    "-hide_banner", "-nostdin", "-loglevel", streamLogLevel({ url, relayUrl, fifo }), "-nostats",
    "-progress", "pipe:1", "-stats_period", "1",
    "-fflags", "+genpts+discardcorrupt", "-thread_queue_size", "1024",
    "-probesize", "1000000", "-analyzeduration", "1000000",
    "-f", inputFormat, "-i", "pipe:0",
    "-map", "0:v:0", "-map", "0:a:0?",
    "-c:v", "copy", "-bsf:v", "h264_mp4toannexb",
    ...streamAudioArgs(audioBitrateKbps),
    "-flags", "+global_header",
    "-max_muxing_queue_size", "1024",
    "-f", "tee", outputs.join("|"),
  ];
}

/**
 * Kodlayıcı seçeneklerini tek bir çıkış akışına bağlar: "-b:v" → "-b:v:1",
 * "-maxrate" → "-maxrate:v:1", "-profile:v" → "-profile:v:1" (spec "v:1").
 * videoEncoderArgs her zaman "-ad" "değer" çiftleri döndürür.
 */
function specifyStream(args, spec) {
  const out = [];
  for (let i = 0; i < args.length; i += 2) {
    const name = String(args[i]).replace(/:v$/, "");
    out.push(`${name}:${spec}`, args[i + 1]);
  }
  return out;
}

/**
 * Yerel kayıt farklı kalitede (bit hızı / yükseklik / kare hızı): görüntü
 * split ile ikiye ayrılır ve İKİ kodlayıcıyla kodlanır (tee çıkış başına
 * kodlama değiştiremez). Tek tee korunur (slave sırası [rtmp?, local, segment]
 * aynı kalır; motor düşen çıkışı buradan tanır); her slave "select" ile kendi
 * görüntü akışını alır: yayın + parça halkası v:0, yerel kayıt v:1; ses (a)
 * ortaktır (tek AAC kodlaması).
 * localEncode: { width, height, fps, videoBitrateKbps } (normalizeLocalQuality).
 * İşlemci: ikinci kodlama donanım kodlayıcıda ucuzdur; motor libx264'te bu
 * yolu yalnız açıkça izin verilirse kullanır (allowSoftware).
 */
function buildDualEncodeArgs({ url, relayUrl = null, width, height, fps, videoBitrateKbps, audioBitrateKbps, encoder, keyframeSec = null, segmentSeconds, segmentStart, listFile, inputFormat, fifo, localFile, localEncode, speedLevel, fpsMode, platform }) {
  const L = localEncode;
  const pf = encoderPixelFormat(encoder);
  const outputs = [];
  const sel = (spec) => `select=\\'${spec}\\'`;
  const net = networkSlave({ url, relayUrl, fifo, select: `:${sel("v:0,a")}` });
  if (net) outputs.push(net);
  outputs.push(`[f=matroska:onfail=ignore:${sel("v:1,a")}]${teeEscape(localFile, platform)}`);
  outputs.push(`[f=segment:segment_time=${segmentSeconds}:segment_time_delta=0.05:segment_format=mpegts:reset_timestamps=1:segment_start_number=${segmentStart}:segment_list=${listFile}:segment_list_type=csv:onfail=abort:${sel("v:0,a")}]${SEGMENT_PATTERN}`);
  const graph = [
    "[0:v:0]split=2[elv0][elv1]",
    `[elv0]scale=${width}:${height}:flags=bicubic,fps=${fps},format=${pf}[elvs]`,
    `[elv1]scale=${L.width}:${L.height}:flags=bicubic,fps=${L.fps},format=${pf}[elvl]`,
  ].join(";");
  const cfr = (spec, rate) => (fpsMode ? [`-fps_mode:${spec}`, "cfr", `-r:${spec}`, String(rate)] : [`-r:${spec}`, String(rate)]);
  return [
    "-hide_banner", "-nostdin", "-loglevel", streamLogLevel({ url, relayUrl, fifo }), "-nostats",
    "-progress", "pipe:1", "-stats_period", "1",
    "-fflags", "+genpts+discardcorrupt", "-thread_queue_size", "1024",
    "-probesize", "1000000", "-analyzeduration", "1000000",
    "-f", inputFormat, "-i", "pipe:0",
    "-filter_complex", graph,
    "-map", "[elvs]", "-map", "[elvl]", "-map", "0:a:0?",
    ...(fpsMode ? [] : ["-vsync", "cfr"]),
    ...cfr("v:0", fps),
    ...specifyStream(videoEncoderArgs(encoder, { videoBitrateKbps, fps, width, height, keyframeSeconds: forcedKeyframeSec(keyframeSec, segmentSeconds), speedLevel }), "v:0"),
    "-force_key_frames:v:0", `expr:gte(t,n_forced*${forcedKeyframeSec(keyframeSec, segmentSeconds)})`,
    ...cfr("v:1", L.fps),
    ...specifyStream(videoEncoderArgs(encoder, { videoBitrateKbps: L.videoBitrateKbps, fps: L.fps, width: L.width, height: L.height, keyframeSeconds: 2, speedLevel }), "v:1"),
    ...streamAudioArgs(audioBitrateKbps),
    "-flags", "+global_header",
    "-max_muxing_queue_size", "1024",
    "-f", "tee", outputs.join("|"),
  ];
}

/**
 * Yerel kayıt kalitesi: { videoBitrateKbps?, height?, fps? } → yayından farklıysa
 * { width, height, fps, videoBitrateKbps }, aynıysa / verilmediyse null.
 * Genişlik yayının en-boy oranından (çift sayı); yükseklik yayından büyük olabilir
 * (ör. yayın 720p, kayıt 1080p) ama 2160'ı geçmez.
 */
function normalizeLocalQuality(lr = {}, stream = {}) {
  if (!lr) return null;
  const has = (v) => v !== undefined && v !== null && v !== "" && Number.isFinite(Number(v));
  if (!has(lr.videoBitrateKbps) && !has(lr.height) && !has(lr.fps)) return null;
  const sw = Number(stream.width) || 1920;
  const sh = Number(stream.height) || 1080;
  const height = has(lr.height) ? even(clampInt(lr.height, 180, 2160, sh)) : sh;
  const width = height === sh ? sw : even(Math.min(3840, Math.round((height * sw) / sh)));
  const fps = has(lr.fps) ? clampInt(lr.fps, 15, 60, stream.fps || 30) : (stream.fps || 30);
  const videoBitrateKbps = has(lr.videoBitrateKbps) ? clampInt(lr.videoBitrateKbps, 300, 50000, stream.videoBitrateKbps || 4500) : (stream.videoBitrateKbps || 4500);
  if (width === sw && height === sh && fps === stream.fps && videoBitrateKbps === stream.videoBitrateKbps) return null;
  return { width, height, fps, videoBitrateKbps };
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
  STREAM_AUDIO_FILTER, streamAudioArgs,
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
  maskSecrets,
  teeEscape,
  fifoOptionString,
  streamSlaves,
  buildRelayArgs,
  RELAY_FIFO_OPTIONS,
  supportsFpsMode,
  RTMP_FIFO_OPTIONS,
  X264_PRESETS,
  MAX_SPEED_LEVEL,
  normalizeStreamOptions,
  videoEncoderArgs,
  buildStreamArgs,
  buildCopyStreamArgs,
  WEBCODECS_ENCODER,
  buildConcatArgs,
  concatLine,
  normalizeProgress,
  createProgressParser,
  mapFfmpegError,
  parseSlaveFailure,
  specifyStream,
  pickEncoderFor,
  forcedKeyframeSec,
  buildDualEncodeArgs,
  normalizeLocalQuality,
  segmentName,
  segmentIndex,
  SEGMENT_PATTERN,
  run,
};
