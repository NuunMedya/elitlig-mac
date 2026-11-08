// Yayın Stüdyosu — yayın motoru (ana süreç).
//
// Arayüz programı <canvas>'ta oluşturur, MediaRecorder ile kaydeder ve 250 ms'lik
// parçaları "studio:chunk" ile buraya yollar. Motor bunları ffmpeg'in stdin'ine
// yazar; ffmpeg yeniden kodlayıp RTMP(S)'ye ve klip halkasına (2 sn'lik TS
// parçaları) yazar. Electron'a bağlı değildir: süreç başlatma, saat ve dosya
// işlemleri dışarıdan verilebilir (testler).
//
// Kurallar:
//   - Her ffmpeg süreci yeni bir kapsayıcı başlığı ister. Motor, süreç
//     başladıktan sonra EBML başlığıyla (1A 45 DF A3) başlamayan parçaları atar;
//     yeniden başlatmada arayüze "restartRecorder" gönderilir, arayüz yeni bir
//     MediaRecorder açar ve ilk parçası (başlık) yeni sürece gider.
//   - stdin yavaşlarsa (ffmpeg / ağ yetişemiyor) Node tamponu büyür: 8 MB'ta
//     "slow" uyarısı, 32 MB'ta süreç yeniden başlatılır.
//   - RTMP AKTARICISI (relay.js, varsayılan): RTMP bağlantısı kodlayıcıdan
//     ayrı, gözetimli bir ffmpeg sürecidir. Kodlayıcı MPEG-TS'yi yerel TCP ile
//     aktarıcıya verir; RTMP koparsa YALNIZ aktarıcı 1, 2, 4, 8, 10 … sn arayla
//     (kullanıcı durdurana kadar) yeniden bağlanır, son anahtar kareden devam
//     eder; 3 hatadan sonra yedek giriş adresine (backupUrl) geçer. Kodlayıcı,
//     MediaRecorder, tekrar halkası ve yerel kayıt kesilmez. Durum: "live" ⇄
//     "reconnecting" (message: "Yeniden bağlanıyor… (3. deneme) …"), ayrıntı
//     status.network. Aktarıcıda kodlayıcı hataları da geri çekilmeyle sonsuz
//     denenir (yalnız ffmpeg / kodlayıcı hiç açılamazsa "failed").
//   - Aktarıcı kapalıysa (relay: false ya da yerel soket açılamadı) eski yol:
//     RTMP koparsa (tee "Slave muxer failed" ya da süreç hatayla biterse)
//     2, 4, 8, 16, 16 sn arayla 5 kez yeniden denenir; sonra "failed".
//   - fifo (ffmpeg.js RTMP_FIFO_OPTIONS) varsa RTMP kopması süreci yeniden
//     BAŞLATMAZ: ffmpeg kendi içinde 2 sn arayla yeniden bağlanır, durum
//     "reconnecting" olur, "Recovery successful" ile "live"a döner. Deneme hakkı
//     bitince (tee "Slave muxer #0 failed") yukarıdaki geri çekilmeyle süreç
//     yeniden başlar. RTMP kuyruğu 30 sn boyunca sürekli doluysa (bağlantı
//     askıda) süreç yeniden başlar.
//   - Takılma: ilerleme stallTimeoutMs (15 sn) kesildiğinde süreç YALNIZ arayüzden
//     de parça gelmiyorsa yeniden başlar (kaydedici durmuş). Parçalar gelmeye
//     devam ediyorsa beklenir (geri basınç 32 MB'ta, kesin takılma 60 sn'de ele
//     alınır). Her karar tanılama günlüğüne nedeniyle yazılır.
//   - Hız: ffmpeg speed < 0.95 10 sn sürerse "slow" uyarısı; sonraki yeniden
//     başlatmada daha hızlı ön ayar (x264 veryfast → superfast → ultrafast).
//   - VideoToolbox açılamazsa (ilk saniyelerde kodlayıcı hatası) libx264'e geçilir.
//   - Yerel tam kayıt (localRecord): tee'ye üçüncü çıkış (Matroska). Her
//     yeniden başlatma yeni bir parça dosyası açar (…-2.mkv); durdurunca
//     remuxLocal ile (arka planda) tek +faststart MP4'e birleştirilir.
//     Yerel çıkış düşerse (disk dolu) yayın sürer, yalnız uyarı verilir.
//   - Sabitleme (pin): röportaj kaydı için o andan itibaren parçalar halkadan
//     silinmez (unpin'e kadar).
//
// Aynı motor açılar (angles.js) için de kullanılır (createSegmentRecorder):
// buildArgs / normalizeOptions / segmentSeconds verilerek RTMP'siz, 1 sn'lik
// parça halkası yazan hafif bir kaydedici olur.
//
// Duvar saati: her çalıştırmada ilerleme örneklerinden "çıktı zamanı 0'ın duvar
// saati" (origin = min(şimdi − outTimeMs)) tahmin edilir. Parçalar bununla
// duvar saatine eşlenir (wallStart / wallEnd, ms); tekrarlar farklı açıları aynı
// zaman penceresinden keser (replays.js).
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { EventEmitter } = require("node:events");
const ff = require("./ffmpeg");
const { killProcess } = require("./proc");
const { createRelay } = require("./relay");

const EBML_MAGIC = [0x1a, 0x45, 0xdf, 0xa3];
const isContainerHeader = (buf) => Boolean(buf) && buf.length >= 4 && EBML_MAGIC.every((b, i) => buf[i] === b);

const SLOW_BYTES = 8 * 1024 * 1024;
const MAX_BYTES = 32 * 1024 * 1024;
const BACKOFF_MS = [2000, 4000, 8000, 16000, 16000];
const KEEP_SEGMENTS = 32; // ≈ 64 sn (gol tekrarı: 30 sn öncesi + 15 sn sonrası + kayıt payı)
const SLOW_SPEED = 0.95;
const SLOW_SPEED_MS = 10000;
const SPEED_GRACE_MS = 5000; // sürecin ilk saniyeleri (yoklama / tampon) sayılmaz
const QUEUE_FULL_RESTART_MS = 30000;
const SPEED_BACKLOG_BYTES = 1024 * 1024; // hız düşükken stdin'de bu kadar birikme: darboğaz ffmpeg
const HEALTH_NOTE_MS = 30000;
const FIFO_AUTH_LIMIT = 3;

const MESSAGES = {
  failed: "Yayın yeniden bağlanamadı. İnternet bağlantınızı ve yayın anahtarını kontrol edip yeniden başlatın.",
  slow: "Bilgisayar ya da bağlantı yayına yetişemiyor; görüntü gecikebilir. Kaliteyi (bit hızı / çözünürlük) düşürmeyi deneyin.",
  tooSlow: "Yayın verisi birikti (bağlantı ya da kodlayıcı yetişemiyor); kodlayıcı yeniden başlatılıyor.",
  connectTimeout: "Yayın sunucusuna bağlanılamadı (zaman aşımı).",
  stalled: "Yayın görüntüsü gelmiyor (kaydedici durdu); yeniden başlatılıyor.",
  noFfmpeg: "ffmpeg bulunamadı; Yayın Stüdyosu bu kurulumda çalışamaz.",
  noEncoder: "Bu bilgisayarda H.264 video kodlayıcı açılamadı.",
  badUrl: "Yayın adresi geçersiz. rtmp:// ya da rtmps:// ile başlayan tam adresi (yayın anahtarıyla) girin.",
  busy: "Yayın zaten sürüyor.",
  encoderFallback: "Donanım kodlayıcı açılamadı; yazılım kodlayıcıya (x264) geçildi.",
  rtmpRecovering: "Yayın bağlantısı koptu; yeniden bağlanılıyor (kayıt sürüyor).",
  rtmpBlocked: "Yayın sunucusuna veri gönderilemiyor (bağlantı askıda); kodlayıcı yeniden başlatılıyor.",
  rtmpQueueFull: "Bağlantı yayına yetişemiyor; bazı kareler atlandı. Bit hızını düşürmeyi deneyin.",
  speedSlow: "Kodlayıcı gerçek zamana yetişemiyor (hız < 0,95). Bir sonraki yeniden başlatmada daha hızlı ayar kullanılacak; çözünürlük / bit hızını düşürmeyi ya da açıları kapatmayı deneyin.",
  localFailed: "Yerel kayıt yazılamıyor (disk dolu ya da klasöre erişilemiyor); yayın sürüyor.",
  localQualitySoftware: "Donanım kodlayıcı yok: yerel kayıt yayınla aynı kalitede yazılıyor (ikinci kodlama işlemciyi yayını düşürecek kadar yükler).",
  recorderRestart: "Görüntü kaydedici yeniden başlatılıyor.",
};

const FIFO_DOWN = /\[fifo @[^\]]*\].*(Error opening|Error writing|Recovery failed|Maximal number of)/i;
const FIFO_UP = /\[fifo @[^\]]*\].*Recovery successful/i;
const FIFO_QUEUE_FULL = /FIFO queue full/i;
/** "[segment @ 0x…] [info] Opening …" → "info"; düzey öneki yoksa null. */
const lineLevel = (line) => /\[(trace|debug|verbose|info|warning|error|fatal|panic)\]/.exec(line)?.[1] || null;
const QUIET_INFO = /Opening '.*' for writing/;

const TR = { ç: "c", ğ: "g", ı: "i", İ: "I", ö: "o", ş: "s", ü: "u", Ç: "C", Ğ: "G", Ö: "O", Ş: "S", Ü: "U" };
/** Dosya adı için güvenli kısa parça: "Galatasaray – Fenerbahçe" → "Galatasaray-Fenerbahce". */
const slug = (v, max = 60) => String(v ?? "").replace(/[çğıİöşüÇĞÖŞÜ]/g, (c) => TR[c]).normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, max).replace(/-+$/, "");
/** Yerel kayıt dosya adı (uzantısız): ElitLig-<maç>-<YYYYMMDD-HHMMSS> (yerel saat). */
function localBaseName(match, t = Date.now()) {
  const d = new Date(t);
  const p = (n) => String(n).padStart(2, "0");
  const ts = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  return `ElitLig-${slug(match) || "kayit"}-${ts}`;
}

/** Açılamayan donanım kodlayıcının yerine geçecek kodlayıcı (ffmpeg.js sırası; yoksa x264). */
function fallbackEncoder(current, encoders = {}) {
  if (!current || current === ff.ENCODERS.libx264) return null;
  if (typeof ff.nextEncoder === "function") return ff.nextEncoder(current, encoders) || null;
  return encoders.libx264 ? ff.ENCODERS.libx264 : null;
}

/** CSV parça listesi: "seg00003.ts,6.000000,8.000000" → [{ file, index, start, end }] */
function parseSegmentList(text) {
  const out = [];
  for (const line of String(text || "").split(/\r?\n/)) {
    const [file, start, end] = line.trim().split(",");
    const index = ff.segmentIndex(file);
    if (index === null) continue;
    const s = Number(start);
    const e = Number(end);
    if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) continue;
    out.push({ file, index, start: s, end: e });
  }
  return out;
}

function createStudioEngine({
  getFfmpeg, // async () => probeFfmpeg sonucu ({ available, path, encoders })
  tempRoot,
  spawnImpl = spawn,
  timers = { setTimeout, clearTimeout },
  now = () => Date.now(),
  validateUrl = ff.isValidStreamUrl,
  backoffMs = BACKOFF_MS,
  connectTimeoutMs = 25000,
  stableMs = 30000,
  stopTimeoutMs = 5000,
  stallTimeoutMs = 15000,
  keepSegments = KEEP_SEGMENTS,
  segmentSeconds = 2,
  buildArgs = ff.buildStreamArgs,
  normalizeOptions = ff.normalizeStreamOptions,
  messages = {},
  platform = process.platform,
  killImpl = (child) => killProcess(child, { platform, spawnImpl }),
  log = () => {},
  diag = null, // { write(scope, message, data) } — tanılama günlüğü (diag.js)
  diagScope = "program",
  hardStallMs = 60000,
  niceness = 0, // açılar: 10 (program kodlayıcısına öncelik)
  adjustAfterFailure = null, // (opts, reason) => yeni seçenekler | null (ilk ilerlemeden önce; açılar: kopya → kodlama)
  remuxLocal = null, // async ({ parts, outFile, ffmpegPath }) => { ok, path }
  beforeCleanup = null, // async (session) => {} — parça klasörü silinmeden önce (röportajlar)
  // Program kodlayıcısı: işlemci payı varsa daha kaliteli ön ayarla başla (ff.initialSpeedLevel;
  // libx264 medium / faster, NVENC p5). Açılarda kapalı (birden çok kodlayıcı aynı anda çalışır).
  qualityTuning = false,
  cpuCount = () => (typeof os.availableParallelism === "function" ? os.availableParallelism() : os.cpus().length),
  relay: useRelay = true, // RTMP'yi ayrı aktarıcı süreçle gönder (relay.js); false: eski tee/fifo yolu
  relayFactory = createRelay,
  relayOptions = {}, // createRelay'e ek seçenekler (testler: backoffMs, stallMs …)
} = {}) {
  const MSG = { ...MESSAGES, ...messages };
  const events = new EventEmitter();
  let session = null;
  let status = { state: "idle" };
  const hooks = { beforeCleanup };
  const note = (message, data) => {
    try { diag?.write(diagScope, message, data); } catch { /* yoksay */ }
  };

  const emitStatus = (patch) => {
    status = { ...patch };
    events.emit("status", status);
  };

  const sessionStatus = (state, extra = {}) => {
    const p = session?.progress || {};
    emitStatus({
      state,
      sessionId: session?.id || null,
      recordOnly: session ? !session.opts.url : undefined,
      encoder: session ? encoderOf(session) : undefined,
      pipeline: session ? (session.opts.videoCopy ? "webcodecs" : "legacy") : undefined,
      ...(session?.opts.videoCopy && session.opts.videoEncoderLabel ? { encoderLabel: session.opts.videoEncoderLabel } : {}),
      bitrateKbps: session ? session.bitrateKbps ?? null : undefined,
      fps: p.fps ?? null,
      speed: p.speed ?? null,
      droppedFrames: p.droppedFrames ?? 0,
      outTimeMs: session ? session.totalOutMs + (p.outTimeMs || 0) : 0,
      attempt: session?.attempts || 0,
      warning: session?.warning || null,
      rtmp: session?.opts.url ? (rtmpUp(session) ? "up" : "down") : undefined,
      speedLevel: session?.speedLevel || 0,
      ...(session?.relay ? networkFields(session) : {}),
      ...(session?.local ? { localPath: session.local.current || null, localBytes: localBytes(session), localFailed: session.local.failed || false, ...(session.local.qualityState ? { localQuality: session.local.qualityState } : {}) } : {}),
      ...extra,
    });
  };

  const rtmpUp = (s) => (s.relay ? s.relay.status().state === "up" : !s.rtmpDown);
  /** Görüntüyü kim kodluyor: tek kodlamada arayüz ("webcodecs"), aksi halde ffmpeg kodlayıcısı. */
  const encoderOf = (s) => (s.opts?.videoCopy ? ff.WEBCODECS_ENCODER : s.encoder || undefined);
  /** Başlangıç hız düzeyi: qualityTuning açıksa işlemci payına göre (negatif = daha kaliteli ön ayar). */
  const startSpeedLevel = (encoder, o = {}) => {
    if (!qualityTuning || typeof ff.initialSpeedLevel !== "function") return 0;
    let cores = 0;
    try { cores = Number(cpuCount()) || 0; } catch { cores = 0; }
    return ff.initialSpeedLevel(encoder, { width: o.width, height: o.height, fps: o.fps, cores });
  };

  /** Aktarıcı ayrıntıları (arayüz: ağ sağlığı). */
  function networkFields(s) {
    const n = s.relay.status();
    return {
      network: n,
      reconnects: n.reconnects,
      ingest: n.target, // "primary" | "backup"
      sentKbps: n.sentKbps,
      lastError: n.lastError?.message || null,
    };
  }

  /** Yayının kullanıcıya görünen durumu (ilerleme geldikten sonra). */
  function liveState(s) {
    if (!s.opts.url) return "recording";
    if (s.relay) {
      const n = s.relay.status();
      if (n.state === "up") return "live";
      return n.attempt > 0 || n.everUp ? "reconnecting" : "connecting";
    }
    return s.rtmpDown ? "reconnecting" : "live";
  }

  function relayExtra(s) {
    const n = s.relay?.status();
    if (!n?.message) return {};
    return { message: n.message, ...(n.state !== "up" && n.lastError ? { code: n.lastError.code } : {}) };
  }

  function localBytes(s) {
    if (!s?.local) return 0;
    let total = 0;
    for (const part of s.local.parts) {
      try { total += fs.statSync(part).size; } catch { /* henüz yok */ }
    }
    return total;
  }

  const clearTimer = (name) => {
    if (session?.[name]) { timers.clearTimeout(session[name]); session[name] = null; }
  };

  /* ------------------------------- parçalar ------------------------------- */

  /** Bu çalıştırmanın CSV listesini okuyup yeni biten parçaları ekler, eskileri siler. */
  function syncSegments() {
    if (!session) return;
    const runInfo = session.runInfo;
    if (runInfo) {
      let text = "";
      try { text = fs.readFileSync(path.join(session.dir, runInfo.listFile), "utf8"); } catch { /* henüz yok */ }
      for (const entry of parseSegmentList(text)) {
        if (entry.index <= runInfo.lastIndex) continue;
        let size = 0;
        try { size = fs.statSync(path.join(session.dir, entry.file)).size; } catch { continue; }
        session.segments.push({ ...entry, run: runInfo.run, encoder: runInfo.encoder, size, at: now() });
        runInfo.lastIndex = entry.index;
        runInfo.lastEnd = entry.end;
        session.nextSegment = Math.max(session.nextSegment, entry.index + 1);
      }
    }
    while (session.segments.length > keepSegments) {
      const old = session.segments.shift();
      // Sabitlenmiş (röportaj) parçalar halkadan çıkar ama silinmez.
      if (isPinned(session, old.index)) session.retained.push(old);
      else {
        try { fs.unlinkSync(path.join(session.dir, old.file)); } catch { /* yoksay */ }
      }
    }
    // Son parçalardan gerçek bit hızı (tee toplam boyut vermez).
    const recent = session.segments.slice(-3);
    const dur = recent.reduce((s, x) => s + (x.end - x.start), 0);
    if (dur > 0) session.bitrateKbps = Math.round(recent.reduce((s, x) => s + x.size, 0) * 8 / dur / 1000);
  }

  const wallOf = (run, sec) => {
    const origin = session?.runs.get(run)?.origin;
    return origin === null || origin === undefined ? null : Math.round(origin + sec * 1000);
  };
  const describeSegment = (s) => ({ ...s, path: path.join(session.dir, s.file), durationSec: s.end - s.start, wallStart: wallOf(s.run, s.start), wallEnd: wallOf(s.run, s.end) });

  /** Yazılmakta olan parça (varsa). */
  function growingSegment() {
    const runInfo = session.runInfo;
    if (!session.child || !runInfo || !session.progress?.outTimeMs) return null;
    const index = runInfo.lastIndex >= 0 ? runInfo.lastIndex + 1 : runInfo.startIndex;
    const file = ff.segmentName(index);
    const full = path.join(session.dir, file);
    const lastEnd = runInfo.lastEnd ?? 0;
    let durationSec = Math.max(0, session.progress.outTimeMs / 1000 - lastEnd);
    let size = -1;
    try { size = fs.statSync(full).size; } catch { /* henüz açılmadı */ }
    // ffmpeg dosyaya tamponla yazar: diskteki kısım, ilerlemenin gösterdiğinden geride
    // kalabilir. Süre, son parçaların bayt/sn oranıyla sınırlanır (klip kısa kalmasın).
    const recent = session.segments.filter((x) => x.run === runInfo.run).slice(-3);
    const rate = recent.reduce((t, x) => t + x.size, 0) / Math.max(1e-6, recent.reduce((t, x) => t + (x.end - x.start), 0));
    if (recent.length && rate > 0 && size >= 0) durationSec = Math.min(durationSec, size / rate);
    if (size <= 0) return null;
    const wallStart = wallOf(runInfo.run, lastEnd);
    return { file, index, path: full, durationSec, sizeBytes: size, run: runInfo.run, encoder: runInfo.encoder, wallStart, wallEnd: wallStart === null ? null : Math.round(wallStart + durationSec * 1000) };
  }

  /**
   * Klip için kaynak: tamamlanmış parçalar ve (varsa) yazılmakta olan parça.
   * → { dir, complete: [{ file, path, start, end, durationSec, run, encoder }], growing: { file, path, durationSec, run, encoder } | null }
   */
  function clipSources() {
    if (!session) return null;
    syncSegments();
    return { dir: session.dir, complete: session.segments.map(describeSegment), growing: growingSegment(), segmentSeconds };
  }

  /* ------------------------------ sabitleme ------------------------------ */

  function isPinned(s, index) {
    for (const pin of s.pins.values()) if (index >= pin.from) return true;
    return false;
  }

  /** O andan itibaren (yazılmakta olan parça dahil) parçaları halkadan silinmeye karşı sabitler. → pinId | null */
  function pin() {
    const s = session;
    if (!s || s.stopping || s.failed) return null;
    syncSegments();
    const runInfo = s.runInfo;
    const from = runInfo && s.child ? (runInfo.lastIndex >= 0 ? runInfo.lastIndex + 1 : runInfo.startIndex) : s.nextSegment;
    const id = `p${(s.pinSeq += 1)}`;
    s.pins.set(id, { from, at: now() });
    note("parçalar sabitlendi", { pin: id, from });
    return id;
  }

  /** Sabitlenmiş parçalar (kronolojik) ve yazılmakta olan. → { dir, complete, growing } | null */
  function pinnedSources(pinId) {
    const s = session;
    const p = s?.pins.get(String(pinId));
    if (!p) return null;
    syncSegments();
    const complete = [...s.retained, ...s.segments].filter((x) => x.index >= p.from).sort((a, b) => a.index - b.index).map(describeSegment);
    const growing = growingSegment();
    return { dir: s.dir, complete, growing: growing && growing.index >= p.from ? growing : null, segmentSeconds };
  }

  /** Sabitlemeyi kaldırır; artık hiçbir sabitlemenin tutmadığı halka dışı parçalar silinir. */
  function unpin(pinId) {
    const s = session;
    if (!s || !s.pins.delete(String(pinId))) return false;
    s.retained = s.retained.filter((x) => {
      if (isPinned(s, x.index)) return true;
      try { fs.unlinkSync(path.join(s.dir, x.file)); } catch { /* yoksay */ }
      return false;
    });
    return true;
  }

  /* -------------------------------- süreç -------------------------------- */

  function spawnRun() {
    const s = session;
    if (!s || s.stopping) return;
    s.run += 1;
    const runInfo = { run: s.run, encoder: encoderOf(s), videoCopy: Boolean(s.opts.videoCopy), listFile: `list-${s.run}.csv`, startIndex: s.nextSegment, lastIndex: -1, lastEnd: null, startedAt: now(), gotProgress: false, failReason: null, origin: null };
    s.runInfo = runInfo;
    s.runs.set(s.run, runInfo);
    s.totalOutMs += s.progress?.outTimeMs || 0;
    s.progress = null;
    s.warning = null;
    s.stderrTail = [];
    s.waitingHeader = true;
    s.headerCarry = null;
    s.slowWarned = false;
    s.rtmpDown = false;
    s.fifoAuth = 0;
    s.queueFull = null;
    s.slowSince = null;
    s.lastProgressAt = null;
    s.lastChunkAt = null;
    let localFile = null;
    if (s.local && !s.local.disabled) {
      const n = s.local.parts.length + 1;
      localFile = path.join(s.local.dir, `${s.local.base}${n > 1 ? `-${n}` : ""}.mkv`);
      s.local.parts.push(localFile);
      s.local.current = localFile;
    }
    runInfo.slaves = ff.streamSlaves({ url: s.opts.url, localFile });
    const localEncode = localFile ? localEncodeFor(s) : null;
    // Aktarıcı: RTMP yerine yerel TCP'ye MPEG-TS (bağlantıyı aktarıcı süreç kurar).
    const net = s.relay ? { url: null, relayUrl: s.relay.url() } : {};
    if (s.relay) s.relay.arm();
    const args = buildArgs({ ...s.opts, ...net, encoder: s.encoder, audioEncoder: s.audioEncoder || "aac", segmentSeconds, segmentStart: s.nextSegment, listFile: runInfo.listFile, fifo: s.fifo, localFile, ...(localEncode ? { localEncode } : {}), speedLevel: s.speedLevel, fpsMode: s.fpsMode, platform });
    log("studio: ffmpeg başlıyor", { run: s.run, encoder: encoderOf(s), url: ff.maskUrl(s.opts.url) });
    note(`ffmpeg başlıyor (çalıştırma ${s.run})`, { encoder: encoderOf(s), pipeline: s.opts.videoCopy ? "webcodecs" : "legacy", speedLevel: s.speedLevel, fifo: s.fifo, relay: Boolean(s.relay), args: ff.maskSecrets(args.join(" ")) });
    let child;
    try {
      child = spawnImpl(s.ffmpegPath, args, { cwd: s.dir, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    } catch (error) {
      onExit(runInfo, -1, null, error);
      return;
    }
    s.child = child;
    if (niceness && child.pid) {
      try { os.setPriority(child.pid, niceness); } catch { /* yoksay */ }
    }
    const parser = ff.createProgressParser((p) => onProgress(runInfo, p));
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (d) => parser.feed(d));
    let errBuf = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (d) => {
      errBuf += d;
      let i;
      while ((i = errBuf.search(/[\r\n]/)) >= 0) {
        const line = errBuf.slice(0, i).trim();
        errBuf = errBuf.slice(i + 1);
        if (line) onStderrLine(runInfo, line);
      }
    });
    child.stdin.on("error", () => { /* EPIPE: süreç kapanıyor, exit olayı ele alır */ });
    child.on("error", (error) => { if (s.child === child) onExit(runInfo, -1, null, error); });
    child.on("exit", (code, signal) => { if (s.child === child || s.exitingChild === child) onExit(runInfo, code, signal); });

    sessionStatus(s.opts.url ? (s.attempts ? "reconnecting" : "connecting") : "starting", s.attempts ? { message: s.lastMessage } : {});
    clearTimer("connectTimer");
    s.connectTimer = timers.setTimeout(() => {
      if (session !== s || s.runInfo !== runInfo || runInfo.gotProgress) return;
      runInfo.failReason = { code: "TIMEOUT", message: MSG.connectTimeout };
      note("yeniden başlatma: ilk ilerleme gelmedi", { afterMs: connectTimeoutMs, chunks: s.chunkCount });
      killChild(s);
    }, connectTimeoutMs);
    if (s.run > 1) events.emit("restartRecorder", { sessionId: s.id, run: s.run, reason: s.lastCode || null, videoCopy: Boolean(s.opts.videoCopy) });
  }

  function killChild(s) {
    const child = s.child;
    if (!child) return;
    s.exitingChild = child;
    try { child.stdin.destroy(); } catch { /* yoksay */ }
    killImpl(child);
  }

  function onStderrLine(runInfo, line) {
    const s = session;
    if (!s || s.runInfo !== runInfo) return;
    const level = lineLevel(line);
    const info = level === "info" || level === "verbose" || level === "debug" || level === "trace";
    if (!info || !QUIET_INFO.test(line)) note(`ffmpeg: ${line}`);
    if (!info) {
      s.stderrTail.push(line);
      if (s.stderrTail.length > 40) s.stderrTail.shift();
      s.lastErrors.push({ at: now(), line: ff.maskSecrets(line) });
      if (s.lastErrors.length > 20) s.lastErrors.shift();
    }
    if (s.stopping) return;
    // fifo: RTMP süreç içinde yeniden bağlanıyor (aktarıcısız eski yol).
    if (s.relay) {
      if (FIFO_QUEUE_FULL.test(line) && !s.relayQueueNoted) { s.relayQueueNoted = true; note("aktarıcı soketi yetişemiyor (yerel fifo doldu, paket atılıyor)"); }
    } else if (s.opts.url && FIFO_UP.test(line)) {
      s.rtmpDown = false;
      s.fifoAuth = 0;
      note("RTMP yeniden bağlandı (fifo)");
      if (runInfo.gotProgress) sessionStatus("live");
      return;
    }
    if (!s.relay && s.opts.url && FIFO_DOWN.test(line)) {
      const reason = ff.mapFfmpegError(`${s.stderrTail.slice(-3).join("\n")}\n${line}`);
      if (!s.rtmpDown) note("RTMP koptu; fifo yeniden bağlanıyor", { reason: reason.code });
      s.rtmpDown = true;
      s.rtmpReason = reason;
      if (reason.code === "AUTH") s.fifoAuth += 1;
      if (s.fifoAuth >= FIFO_AUTH_LIMIT) {
        // Anahtar reddediliyor: süreç içinde denemeye devam etmenin anlamı yok.
        runInfo.failReason = reason;
        note("yeniden başlatma: yayın anahtarı reddedildi", { count: s.fifoAuth });
        killChild(s);
        return;
      }
      if (runInfo.gotProgress) sessionStatus("reconnecting", rtmpDownExtra(s));
      return;
    }
    if (!s.relay && s.opts.url && FIFO_QUEUE_FULL.test(line)) {
      const t = now();
      if (!s.queueFull || t - s.queueFull.last > 5000) s.queueFull = { first: t, last: t };
      else s.queueFull.last = t;
      if (s.warning !== "network") {
        s.warning = "network";
        note("RTMP kuyruğu doldu (ağ yetişemiyor)");
        sessionStatus(status.state, { message: MSG.rtmpQueueFull });
      }
      if (t - s.queueFull.first >= QUEUE_FULL_RESTART_MS) {
        runInfo.failReason = { code: "IO", message: MSG.rtmpBlocked };
        note("yeniden başlatma: RTMP kuyruğu 30 sn dolu (bağlantı askıda)");
        killChild(s);
      }
      return;
    }
    const slave = ff.parseSlaveFailure(line);
    if (slave) {
      const kind = runInfo.slaves?.[slave.index] || null;
      if (kind === "local") {
        // Yerel kayıt düştü (disk dolu vb.): yayın ve halka sürer.
        if (s.local) { s.local.failed = true; s.local.disabled = true; }
        s.warning = "local";
        note("yerel kayıt çıkışı düştü", { reason: slave.reason });
        sessionStatus(status.state, { message: MSG.localFailed });
        return;
      }
      if (kind === "rtmp" && s.opts.url) {
        // RTMP çıkışı düştü (fifo yok ya da deneme hakkı bitti); ffmpeg yalnız diğer çıkışlara yazar. Yeniden bağlanmak için süreç yeniden başlar.
        runInfo.failReason = ff.mapFfmpegError(`${s.stderrTail.join("\n")}\n${slave.reason}`);
        if (runInfo.failReason.code === "UNKNOWN" || runInfo.failReason.code === "INPUT" || runInfo.failReason.code === "ENCODER") runInfo.failReason = ff.mapFfmpegError(`Input/output error ${slave.reason}`);
        log("studio: RTMP çıkışı düştü", slave.reason);
        note("yeniden başlatma: RTMP çıkışı düştü", { reason: slave.reason, code: runInfo.failReason.code });
        killChild(s);
      }
    }
  }

  function onProgress(runInfo, p) {
    const s = session;
    if (!s || s.runInfo !== runInfo) return;
    s.progress = p;
    if (p.outTimeMs > 0) {
      const origin = now() - p.outTimeMs;
      if (runInfo.origin === null || origin < runInfo.origin) runInfo.origin = origin;
    }
    syncSegments();
    if (!runInfo.gotProgress && p.outTimeMs > 0) {
      runInfo.gotProgress = true;
      clearTimer("connectTimer");
      clearTimer("stableTimer");
      s.stableTimer = timers.setTimeout(() => { if (session === s && s.runInfo === runInfo) s.attempts = 0; }, stableMs);
    }
    if (!runInfo.gotProgress) return;
    s.lastProgressAt = now();
    // İlerleme kesilirse takılma denetimi (scheduleStallCheck).
    scheduleStallCheck(s, runInfo, stallTimeoutMs);
    checkSpeed(s, runInfo, p);
    if (s.child?.stdin && s.child.stdin.writableLength < SLOW_BYTES / 2 && s.warning === "slow" && !s.speedSlow) s.warning = null;
    if (s.warning === "network" && s.queueFull && now() - s.queueFull.last > 10000) { s.warning = null; s.queueFull = null; }
    const state = liveState(s);
    const extra = s.notice ? { message: s.notice } : s.relay && relayExtra(s).message ? relayExtra(s) : !s.relay && s.rtmpDown ? rtmpDownExtra(s) : s.speedSlow ? { message: MSG.speedSlow } : {};
    sessionStatus(state, extra);
    s.notice = null;
    // Yarım dakikada bir yayın sağlığı tanılama günlüğüne (uzun yayınlarda kopma / donmaların izi):
    // ffmpeg (kodlama / kopya), aktarıcı (ağ) ve arayüzün kodlama sayaçları (reportStats) birlikte.
    if (s.healthAt === undefined || now() - s.healthAt >= HEALTH_NOTE_MS) {
      s.healthAt = now();
      note("yayın sağlığı", healthSnapshot(s, state));
    }
  }

  /** Tanılama özeti: ffmpeg + aktarıcı + arayüz (kodlama yolu) sayaçları. */
  function healthSnapshot(s, state = status.state) {
    const p = s.progress || {};
    const n = s.relay?.status();
    const c = s.clientStats || null;
    return {
      state, pipeline: s.opts.videoCopy ? "webcodecs" : "legacy", encoder: encoderOf(s),
      fps: p.fps ?? null, speed: p.speed ?? null, droppedFrames: p.droppedFrames ?? 0, dupFrames: p.dupFrames ?? 0,
      encodedKbps: s.bitrateKbps ?? null, pendingBytes: s.child?.stdin?.writableLength ?? 0,
      ...(n ? { rtmp: n.state, sentKbps: n.sentKbps, reconnects: n.reconnects, attempt: n.attempt, ingest: n.target, droppedBytes: n.droppedBytes, dropEvents: n.dropEvents, relayPendingBytes: n.pendingBytes ?? null, lastError: n.lastError?.code || null } : {}),
      ...(c ? { client: c } : {}),
    };
  }

  /**
   * Arayüzün kodlama sayaçları (5 sn'de bir): çizilen / kodlanan kare, kodlama
   * kuyruğu, atlanan kareler. Atlama ya da boşluk artarsa hemen günlüğe yazılır
   * (en çok 10 sn'de bir) — sahadaki donmanın hangi aşamada olduğu görülsün.
   */
  function clientStats(stats) {
    const s = session;
    if (!s || !stats || typeof stats !== "object") return false;
    const pick = {};
    for (const [k, v] of Object.entries(stats)) {
      if (typeof v === "number" || typeof v === "boolean" || (typeof v === "string" && v.length <= 120) || v === null) pick[k] = v;
      else if (v && typeof v === "object" && !Array.isArray(v)) pick[k] = Object.fromEntries(Object.entries(v).filter(([, x]) => typeof x === "number" || typeof x === "string").slice(0, 12));
    }
    const prev = s.clientStats;
    s.clientStats = pick;
    const grew = (k) => prev && Number(pick[k]) > Number(prev[k] || 0);
    if ((grew("encodeDropped") || grew("gaps") || grew("stalls")) && (!s.clientNoteAt || now() - s.clientNoteAt >= 10000)) {
      s.clientNoteAt = now();
      note("arayüz kodlaması kare atladı / takıldı", { ...pick, deltaDropped: (pick.encodeDropped || 0) - (prev.encodeDropped || 0), deltaGaps: (pick.gaps || 0) - (prev.gaps || 0) });
    }
    return true;
  }

  function rtmpDownExtra(s) {
    const r = s.rtmpReason || { code: "IO", message: "" };
    return { message: `${MSG.rtmpRecovering} ${r.code !== "UNKNOWN" ? r.message : ""}`.trim(), code: r.code };
  }

  /**
   * Takılma: ilerleme yoksa VE arayüzden parça da gelmiyorsa yeniden başlat.
   * Parçalar geliyorsa bekle (ffmpeg / ağ geç kalıyor olabilir; geri basınç
   * 32 MB'ta yeniden başlatır); yine de hardStallMs boyunca hiç ilerleme
   * olmazsa süreç kesin takılmıştır.
   */
  function scheduleStallCheck(s, runInfo, delay) {
    clearTimer("stallTimer");
    s.stallTimer = timers.setTimeout(() => {
      if (session !== s || s.runInfo !== runInfo || s.stopping) return;
      s.stallTimer = null;
      const t = now();
      const sinceProgress = t - (s.lastProgressAt ?? t);
      const sinceChunk = s.lastChunkAt === null ? Infinity : t - s.lastChunkAt;
      if (sinceChunk < stallTimeoutMs && sinceProgress < hardStallMs) {
        if (!s.stallNoted) note("ilerleme yok ama parçalar geliyor; yeniden başlatılmıyor", { sinceProgressMs: sinceProgress, sinceChunkMs: sinceChunk, pendingBytes: s.child?.stdin?.writableLength ?? 0 });
        s.stallNoted = true;
        scheduleStallCheck(s, runInfo, Math.max(1000, Math.min(stallTimeoutMs, hardStallMs - sinceProgress)));
        return;
      }
      s.stallNoted = false;
      const hard = sinceChunk < stallTimeoutMs;
      runInfo.failReason = { code: "STALLED", message: MSG.stalled };
      note(hard ? "yeniden başlatma: ffmpeg takıldı (parçalar gelirken ilerleme yok)" : "yeniden başlatma: kaydedici durdu (parça ve ilerleme yok)", { sinceProgressMs: sinceProgress, sinceChunkMs: Number.isFinite(sinceChunk) ? sinceChunk : null });
      killChild(s);
    }, delay);
  }

  /** speed < 0.95 10 sn sürerse "slow"; sonraki çalıştırmada daha hızlı ön ayar. */
  function checkSpeed(s, runInfo, p) {
    if (p.speed === null || p.speed === undefined) return;
    const t = now();
    if (t - runInfo.startedAt < SPEED_GRACE_MS) return;
    if (p.speed >= SLOW_SPEED) {
      s.slowSince = null;
      if (s.speedSlow) { s.speedSlow = false; if (s.warning === "slow") s.warning = null; note("kodlayıcı hızı düzeldi", { speed: p.speed }); }
      return;
    }
    if (s.slowSince === null) { s.slowSince = t; return; }
    if (!s.speedSlow && t - s.slowSince >= SLOW_SPEED_MS) {
      s.speedSlow = true;
      s.warning = "slow";
      // Daha hızlı (daha kötü görüntülü) ön ayara yalnız darboğaz gerçekten ffmpeg ise geçilir:
      // stdin'de veri birikiyor (ffmpeg okuyamıyor). Giriş geç geliyorsa (arayüz takıldı,
      // kaydedici yavaş) speed yine < 1 görünür ama ön ayarı düşürmek yalnız kaliteyi bozar.
      const backlog = s.child?.stdin?.writableLength ?? 0;
      const matters = typeof ff.speedLevelMatters === "function" ? ff.speedLevelMatters(s.encoder) : (s.encoder === ff.ENCODERS.libx264 || s.encoder === ff.ENCODERS.nvenc);
      const canLower = !s.opts.videoCopy && matters && backlog >= SPEED_BACKLOG_BYTES;
      if (canLower && s.speedLevel < ff.MAX_SPEED_LEVEL) s.pendingSpeedLevel = s.speedLevel + 1;
      note("kodlayıcı yetişemiyor", { speed: p.speed, forMs: t - s.slowSince, encoder: encoderOf(s), pendingBytes: backlog, inputLimited: backlog < SPEED_BACKLOG_BYTES, nextSpeedLevel: s.pendingSpeedLevel ?? s.speedLevel });
      events.emit("slow", { sessionId: s.id, speed: p.speed });
    }
  }

  function onExit(runInfo, code, signal, error) {
    const s = session;
    if (!s || s.runInfo !== runInfo || runInfo.exited) return;
    runInfo.exited = true;
    s.child = null;
    s.exitingChild = null;
    clearTimer("connectTimer");
    clearTimer("stableTimer");
    clearTimer("stallTimer");
    syncSegments();
    if (s.stopping) { s.onStopped?.(); return; }
    const tail = s.stderrTail.join("\n");
    const reason = runInfo.failReason || (error ? { code: "SPAWN", message: MSG.noFfmpeg } : ff.mapFfmpegError(tail));
    log("studio: ffmpeg durdu", { code, signal, reason: reason.code, tail: s.stderrTail.slice(-5) });
    note("ffmpeg durdu", { code, signal, reason: reason.code, message: reason.message, gotProgress: runInfo.gotProgress, tail: s.stderrTail.slice(-8).map(ff.maskSecrets) });
    if (s.pendingSpeedLevel !== undefined && s.pendingSpeedLevel !== null) {
      s.speedLevel = s.pendingSpeedLevel;
      s.pendingSpeedLevel = null;
      s.speedSlow = false;
      note("daha hızlı kodlayıcı ön ayarı", { speedLevel: s.speedLevel });
    }
    // Tek kodlama (WebCodecs) akışı ffmpeg'de açılamadı: iki kez üst üste ilerlemesiz biterse eski
    // yola (yeniden kodlama) geçilir; arayüz restartRecorder { videoCopy: false } ile MediaRecorder'a döner.
    if (s.opts.videoCopy && !runInfo.gotProgress && !["SPAWN", "TIMEOUT", "STALLED", "SLOW", "RECORDER"].includes(reason.code)) {
      s.copyFailures = (s.copyFailures || 0) + 1;
      if (s.copyFailures >= 2) {
        s.opts = { ...s.opts, videoCopy: false, pipeline: "legacy" };
        s.notice = "Tek kodlama akışı açılamadı; eski kodlama yoluna geçildi.";
        s.lastCode = reason.code;
        note("tek kodlama akışı açılamadı; yeniden kodlamaya geçiliyor", { reason: reason.code });
        spawnRun();
        return;
      }
    }
    if (runInfo.gotProgress) s.copyFailures = 0;
    // Çağıranın geri düşüşü (açılar: H.264 kopyası açılamadı → yeniden kodlama). Deneme sayılmaz.
    // Zaman aşımı / takılma / birikme kaydedici kaynaklıdır, biçim sorunu değil: geri düşüş yok.
    if (!runInfo.gotProgress && typeof adjustAfterFailure === "function" && !["SPAWN", "TIMEOUT", "STALLED", "SLOW", "RECORDER"].includes(reason.code)) {
      const adjusted = adjustAfterFailure(s.opts, reason);
      if (adjusted) {
        s.opts = adjusted;
        s.notice = adjusted.notice || null;
        s.lastCode = reason.code;
        note("seçenekler değiştirildi, yeniden deneniyor", { reason: reason.code });
        spawnRun();
        return;
      }
    }
    // Donanım kodlayıcı açılamadı: hemen sıradakiyle (sonunda x264) yeniden dene (deneme sayılmaz).
    const next = reason.code === "ENCODER" && !runInfo.gotProgress ? fallbackEncoder(s.encoder, s.encoders) : null;
    if (next) {
      s.encoder = next;
      s.speedLevel = startSpeedLevel(next, s.opts);
      s.pendingSpeedLevel = null;
      s.notice = next === ff.ENCODERS.libx264 ? MSG.encoderFallback : `Donanım kodlayıcı açılamadı; ${next} deneniyor.`;
      s.lastCode = reason.code;
      spawnRun();
      return;
    }
    if (reason.code === "SPAWN" || (reason.code === "ENCODER" && !runInfo.gotProgress)) {
      fail(reason.code === "SPAWN" ? MSG.noFfmpeg : MSG.noEncoder, reason.code);
      return;
    }
    // Arayüz kaydediciyi yeniden kurmak istedi (görüntü izi takıldı): deneme sayılmaz.
    if (reason.code === "RECORDER") {
      s.lastCode = reason.code;
      spawnRun();
      return;
    }
    s.attempts += 1;
    s.lastCode = reason.code;
    // Aktarıcıyla (canlı yayın) kodlayıcı da kullanıcı durdurana kadar denenir; son bekleme tavandır.
    const unlimited = Boolean(s.relay);
    if (!unlimited && s.attempts > backoffMs.length) {
      fail(`${reason.message} ${MSG.failed}`, reason.code);
      return;
    }
    s.lastMessage = unlimited ? `(${s.attempts}. deneme) ${reason.message}` : `(${s.attempts}/${backoffMs.length}) ${reason.message}`;
    sessionStatus(s.opts.url ? "reconnecting" : "starting", { message: s.lastMessage, code: reason.code });
    clearTimer("retryTimer");
    s.retryTimer = timers.setTimeout(() => { if (session === s) { s.retryTimer = null; spawnRun(); } }, backoffMs[Math.min(s.attempts, backoffMs.length) - 1]);
  }

  function fail(message, code) {
    const s = session;
    if (!s) return;
    s.failed = true;
    clearTimer("retryTimer");
    try { s.relay?.dispose(); } catch { /* yoksay */ }
    sessionStatus("failed", { message, code: code || "FAILED" });
    events.emit("ended", { sessionId: s.id, failed: true });
  }

  /* --------------------------------- API --------------------------------- */

  /** localRecord: { enabled, dir, name? } → { dir, base } | null | { error } */
  function normalizeLocal(lr, raw = {}) {
    if (!lr || !lr.enabled) return null;
    const dir = lr.dir ? path.resolve(String(lr.dir)) : null;
    if (!dir) return { error: { code: "LOCAL_DIR", message: "Yerel kayıt klasörü seçilmedi." } };
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.accessSync(dir, fs.constants.W_OK);
    } catch {
      return { error: { code: "LOCAL_DIR", message: "Yerel kayıt klasörüne yazılamıyor. Başka bir klasör seçin." } };
    }
    // Ayrı kalite (bit hızı / yükseklik / kare hızı): yayından farklıysa ikinci kodlayıcı.
    const quality = ff.normalizeLocalQuality(lr, normalizeOptions(raw));
    return { dir, base: localBaseName(lr.name ?? raw.matchLabel ?? raw.matchId, now()), quality, allowSoftware: lr.allowSoftware === true };
  }

  /**
   * Bu çalıştırmada yerel kayıt ayrı kodlanacak mı. İkinci kodlama yalnız donanım
   * kodlayıcıda (VideoToolbox / NVENC / QSV / AMF / MF) ya da açık izinle (allowSoftware)
   * yapılır; libx264'te iki kodlama işlemciyi yayını düşürecek kadar yükler →
   * yerel kayıt yayın kalitesinde yazılır ve uyarı verilir (localQuality.reason).
   */
  function localEncodeFor(s) {
    const q = s.local?.quality;
    if (!q) return null;
    if (s.opts.videoCopy) {
      // Tek kodlama: ffmpeg görüntüyü kodlamıyor; ayrı kalite ikinci (yazılım) kodlama ister → yayın kalitesinde yazılır.
      if (!s.local.qualityState || s.local.qualityState.separate !== false) note("yerel kayıt yayın kalitesinde (tek kodlama yolu)", { wanted: q });
      s.local.qualityState = { separate: false, reason: "VIDEO_COPY", message: "Tek kodlama (WebCodecs) yolunda yerel kayıt yayınla aynı kalitede yazılır.", wanted: q };
      return null;
    }
    if (ff.isHardwareEncoder(s.encoder) || s.local.allowSoftware) {
      s.local.qualityState = { separate: true, ...q, encoder: s.encoder };
      return q;
    }
    if (!s.local.qualityState || s.local.qualityState.separate !== false) note("yerel kayıt ayrı kalitede kodlanmıyor: donanım kodlayıcı yok", { encoder: s.encoder, wanted: q });
    s.local.qualityState = { separate: false, reason: "NO_HW_ENCODER", message: MSG.localQualitySoftware, wanted: q };
    return null;
  }

  async function start(rawOpts = {}) {
    if (session && !session.failed) return { ok: false, error: { code: "BUSY", message: MSG.busy } };
    if (session?.failed) await stop();
    const opts = normalizeOptions(rawOpts);
    if (opts.url && !validateUrl(opts.url)) return { ok: false, error: { code: "BAD_URL", message: MSG.badUrl } };
    // Yedek giriş adresi (YouTube backup ingest): geçersizse yok sayılır (ana adresle sürer).
    const rawBackup = rawOpts.backupUrl ? String(rawOpts.backupUrl).trim() : null;
    const backupUrl = opts.url && rawBackup && rawBackup !== opts.url && validateUrl(rawBackup) ? rawBackup : null;
    const local = normalizeLocal(rawOpts.localRecord, rawOpts);
    if (local?.error) return { ok: false, error: local.error };
    const info = await getFfmpeg();
    if (!info?.available || !info.path) return { ok: false, error: { code: "NO_FFMPEG", message: info?.error || MSG.noFfmpeg } };
    // Arayüz tercihi (encoderPreference: "software" → libx264); normalizeOptions bunu taşımazsa ham seçenekten.
    const encoder = ff.pickEncoderFor(info.encoders, opts.encoderPreference ?? rawOpts.encoderPreference);
    if (!encoder) return { ok: false, error: { code: "NO_ENCODER", message: MSG.noEncoder } };
    if (local && info.muxers && info.muxers.matroska === false) return { ok: false, error: { code: "NO_MATROSKA", message: "Bu ffmpeg yerel kayıt (Matroska) yazamıyor." } };
    if (session) return { ok: false, error: { code: "BUSY", message: MSG.busy } };
    const id = `${new Date(now()).toISOString().replace(/[-:T]/g, "").slice(0, 14)}-${crypto.randomBytes(3).toString("hex")}`;
    const dir = path.join(tempRoot, id);
    fs.mkdirSync(dir, { recursive: true });
    session = {
      id, dir, opts, encoder, encoders: { ...info.encoders }, ffmpegPath: info.path,
      run: 0, attempts: 0, nextSegment: 0, segments: [], runs: new Map(), totalOutMs: 0, progress: null,
      child: null, runInfo: null, stopping: false, failed: false, startedAt: now(),
      fifo: Boolean(info.muxers?.fifo), fpsMode: ff.supportsFpsMode(info.version), speedLevel: startSpeedLevel(encoder, opts), pendingSpeedLevel: null,
      audioEncoder: info.audioEncoder || "aac",
      pins: new Map(), pinSeq: 0, retained: [], lastErrors: [], chunkCount: 0, lastChunkAt: null,
      local: local ? { ...local, parts: [], current: null, failed: false } : null,
    };
    const s0 = session;
    if (opts.url && useRelay) {
      const relay = relayFactory({
        ffmpegPath: info.path, primaryUrl: opts.url, backupUrl, spawnImpl, timers, now, platform, killImpl, log,
        note: (message, data) => note(message, data),
        // Yayın gecikmesi: yalnız RTMP bacağı (kayıt / tekrar halkası anlık kalır).
        delayMs: Math.round(Math.min(120, Math.max(0, Number(rawOpts.streamDelaySec) || 0)) * 1000),
        ...relayOptions,
      });
      try {
        await relay.listen();
        s0.relay = relay;
        relay.events.on("status", () => onRelayStatus(s0));
      } catch (e) {
        note("aktarıcı açılamadı; RTMP doğrudan kodlayıcıdan gönderilecek", { error: e.message });
        try { relay.dispose(); } catch { /* yoksay */ }
      }
      if (session !== s0) { s0.relay?.dispose(); return { ok: false, error: { code: "STOPPED", message: "Yayın başlatılırken durduruldu." } }; }
    }
    note("oturum başladı", { sessionId: id, url: ff.maskUrl(opts.url), backupUrl: backupUrl ? ff.maskUrl(backupUrl) : null, relay: Boolean(s0.relay), width: opts.width, height: opts.height, fps: opts.fps, videoBitrateKbps: opts.videoBitrateKbps, audioBitrateKbps: opts.audioBitrateKbps, encoder, ffmpeg: info.version, fifo: session.fifo, local: local ? local.dir : null });
    sessionStatus("starting");
    spawnRun();
    if (!session) return { ok: false, error: { code: "NO_FFMPEG", message: MSG.noFfmpeg } };
    return { ok: true, sessionId: id, encoder: session.encoder, relay: Boolean(session.relay), backupUrl: Boolean(backupUrl), ...(session.local?.qualityState ? { localQuality: session.local.qualityState } : {}) };
  }

  /** Aktarıcı durumu değişti: arayüze yay (kodlayıcı ilerlemesini beklemeden). */
  function onRelayStatus(s) {
    if (session !== s || s.stopping || s.failed) return;
    const n = s.relay.status();
    const key = `${n.state}|${n.attempt}|${n.target}|${n.dropping}|${n.reconnects}`;
    if (key === s.relayKey) return; // ilerleme her saniye zaten yayılır
    s.relayKey = key;
    if (!s.runInfo?.gotProgress) { sessionStatus(status.state === "starting" ? "starting" : "connecting", relayExtra(s)); return; }
    sessionStatus(liveState(s), relayExtra(s));
  }

  /**
   * Arayüz kaydediciyi yeniden kurmak istiyor (görüntü izi takıldı / kuyruk
   * şişti): kodlayıcı yeni başlıkla yeniden başlar, deneme sayılmaz.
   */
  function restartEncoder(reason = "RECORDER", options = null) {
    const s = session;
    if (!s || !s.child || s.stopping || s.failed) return false;
    // Arayüz kodlama yolunu değiştiriyor (WebCodecs hatası → eski yol): sonraki çalıştırma yeniden kodlar.
    if (options && typeof options.videoCopy === "boolean" && options.videoCopy !== Boolean(s.opts.videoCopy)) {
      s.opts = { ...s.opts, videoCopy: options.videoCopy, pipeline: options.videoCopy ? "webcodecs" : "legacy", videoEncoderLabel: options.videoCopy ? s.opts.videoEncoderLabel : null };
      note("kodlama yolu değişti", { pipeline: s.opts.pipeline, reason: String(reason).slice(0, 60) });
    }
    if (s.runInfo?.failReason) return true;
    s.runInfo.failReason = { code: "RECORDER", message: MSG.recorderRestart };
    note("yeniden başlatma: arayüz istedi", { reason: String(reason).slice(0, 60) });
    killChild(s);
    return true;
  }

  /** MediaRecorder parçası. Hiç fırlatmaz; uygun değilse atar. */
  function pushChunk(data) {
    const s = session;
    if (!s || !s.child || s.stopping) return false;
    let buf = Buffer.isBuffer(data) ? data : ArrayBuffer.isView(data) ? Buffer.from(data.buffer, data.byteOffset, data.byteLength) : data instanceof ArrayBuffer ? Buffer.from(data) : null;
    if (!buf || !buf.length) return false;
    if (s.waitingHeader) {
      // Chromium MediaRecorder ilk parçayı bazen 1 baytlık (0x1A) verir: başlık
      // birkaç parçaya bölünmüşse birleştirilir (yoksa kaydedici hiç kabul edilmez,
      // 25 sn'de bir yeniden başlatma döngüsü).
      const head = s.headerCarry ? Buffer.concat([s.headerCarry, buf]) : buf;
      if (head.length < EBML_MAGIC.length) {
        s.headerCarry = EBML_MAGIC.slice(0, head.length).every((b, i) => head[i] === b) ? Buffer.from(head) : null;
        return Boolean(s.headerCarry);
      }
      s.headerCarry = null;
      if (!isContainerHeader(head)) return false; // eski kaydedicinin kalan parçası
      s.waitingHeader = false;
      buf = head;
    }
    const stdin = s.child.stdin;
    if (!stdin || stdin.destroyed || !stdin.writable) return false;
    stdin.write(buf);
    s.lastChunkAt = now();
    s.chunkCount += 1;
    const pending = stdin.writableLength;
    if (pending > MAX_BYTES) {
      if (!s.runInfo.failReason) {
        s.runInfo.failReason = { code: "SLOW", message: MSG.tooSlow };
        note("yeniden başlatma: stdin birikti (32 MB)", { pendingBytes: pending, speed: s.progress?.speed ?? null });
        killChild(s);
      }
    } else if (pending > SLOW_BYTES && s.warning !== "slow") {
      s.warning = "slow";
      note("stdin birikiyor (8 MB)", { pendingBytes: pending, speed: s.progress?.speed ?? null });
      sessionStatus(status.state, { message: MSG.slow });
    }
    return true;
  }

  function removeDir(dir) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* yoksay */ }
  }

  /** Yerel kayıt parçalarını (arka planda) MP4'e birleştirir; durum ve "local" olayı yayılır. */
  function finishLocal(s) {
    if (!s.local || !s.local.parts.length) return null;
    const parts = s.local.parts.filter((f) => { try { return fs.statSync(f).size > 0; } catch { return false; } });
    if (!parts.length) return null;
    const outFile = path.join(s.local.dir, `${s.local.base}.mp4`);
    const info = { sessionId: s.id, parts, mkvPath: parts[0], mp4Path: outFile, bytes: localBytes(s) };
    if (typeof remuxLocal !== "function") return { ...info, state: "done", path: parts[0] };
    const job = { ...info, state: "remuxing", path: parts[0] };
    events.emit("local", job);
    note("yerel kayıt MP4'e dönüştürülüyor", { parts: parts.length, outFile });
    Promise.resolve()
      .then(() => remuxLocal({ parts, outFile, ffmpegPath: s.ffmpegPath }))
      .then((r) => (r?.ok ? { ...info, state: "done", path: r.path || outFile } : { ...info, state: "failed", path: parts[0], error: r?.error || null }))
      .catch((e) => ({ ...info, state: "failed", path: parts[0], error: e.message }))
      .then((done) => {
        note(done.state === "done" ? "yerel kayıt hazır" : "yerel kayıt MP4'e dönüştürülemedi (MKV korunuyor)", { path: done.path, error: done.error || null });
        events.emit("local", done);
        if (!session && status.sessionId === s.id && status.state === "stopped") {
          emitStatus({ ...status, localPath: done.path, localRemux: done.state, localBytes: (() => { try { return fs.statSync(done.path).size; } catch { return info.bytes; } })() });
        }
      });
    return job;
  }

  /** Nazik durdurma: stdin kapanır, ffmpeg kuyruğu boşaltır; 5 sn içinde bitmezse öldürülür (proc.js). */
  function stop() {
    const s = session;
    if (!s) return Promise.resolve(true);
    if (s.stopPromise) return s.stopPromise;
    s.stopping = true;
    for (const t of ["retryTimer", "connectTimer", "stableTimer", "stallTimer"]) clearTimer(t);
    note("durduruluyor");
    s.stopPromise = new Promise((resolve) => {
      const finish = async () => {
        if (s.killTimer) timers.clearTimeout(s.killTimer);
        // Sabitlenmiş parçalar (röportaj) klasör silinmeden önce işlenir.
        if (typeof hooks.beforeCleanup === "function" && s.pins.size) {
          try { await hooks.beforeCleanup({ sessionId: s.id, dir: s.dir }); } catch (e) { note("temizlik öncesi hata", { error: e.message }); }
        }
        try { await s.relay?.stop(); } catch { /* yoksay */ }
        removeDir(s.dir);
        if (session === s) session = null;
        const local = finishLocal(s);
        note("oturum bitti", { sessionId: s.id });
        emitStatus({ state: "stopped", sessionId: s.id, ...(local ? { localPath: local.path, localBytes: local.bytes, localRemux: local.state } : {}) });
        events.emit("ended", { sessionId: s.id, failed: false });
        resolve(true);
      };
      if (!s.child) { finish(); return; }
      s.onStopped = finish;
      try { s.child.stdin.end(); } catch { /* yoksay */ }
      s.killTimer = timers.setTimeout(() => killChild(s), stopTimeoutMs);
    });
    return s.stopPromise;
  }

  /** Uygulama kapanırken: eşzamanlı öldür ve temizle. */
  function dispose() {
    const s = session;
    if (!s) return;
    s.stopping = true;
    for (const t of ["retryTimer", "connectTimer", "stableTimer", "stallTimer", "killTimer"]) clearTimer(t);
    killChild(s);
    try { s.relay?.dispose(); } catch { /* yoksay */ }
    removeDir(s.dir);
    session = null;
  }

  return {
    start,
    pushChunk,
    stop,
    dispose,
    clipSources,
    /** Halkadaki görüntü süresi (ms): tamamlanmış parçalar + yazılmakta olan. */
    bufferedMs() {
      const src = clipSources();
      if (!src) return 0;
      return Math.round((src.complete.reduce((t, x) => t + x.durationSec, 0) + (src.growing?.durationSec || 0)) * 1000);
    },
    encoder: () => session?.encoder || null,
    status: () => status,
    pin,
    unpin,
    pinnedSources,
    restartEncoder,
    clientStats,
    /** Tanılama özeti (Yayın tanılama penceresi). */
    health: () => (session ? healthSnapshot(session) : null),
    /** RTMP aktarıcısının durumu (yoksa null). */
    network: () => session?.relay?.status() || null,
    /** Son ffmpeg uyarı / hata satırları (anahtar gizli). */
    lastErrors: () => (session ? [...session.lastErrors] : []),
    setBeforeCleanup: (fn) => { hooks.beforeCleanup = fn; },
    active: () => Boolean(session && !session.failed),
    sessionId: () => session?.id || null,
    events,
  };
}

/** Genel adı: parça halkası kaydedici (yayın motoru ve açılar). */
const createSegmentRecorder = createStudioEngine;

module.exports = { createStudioEngine, createSegmentRecorder, fallbackEncoder, parseSegmentList, isContainerHeader, localBaseName, slug, BACKOFF_MS, MESSAGES };
