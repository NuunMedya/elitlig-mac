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
//   - RTMP koparsa (tee "Slave muxer failed" ya da süreç hatayla biterse)
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

const EBML_MAGIC = [0x1a, 0x45, 0xdf, 0xa3];
const isContainerHeader = (buf) => Boolean(buf) && buf.length >= 4 && EBML_MAGIC.every((b, i) => buf[i] === b);

const SLOW_BYTES = 8 * 1024 * 1024;
const MAX_BYTES = 32 * 1024 * 1024;
const BACKOFF_MS = [2000, 4000, 8000, 16000, 16000];
const KEEP_SEGMENTS = 20; // ≈ 40 sn
const SLOW_SPEED = 0.95;
const SLOW_SPEED_MS = 10000;
const SPEED_GRACE_MS = 5000; // sürecin ilk saniyeleri (yoklama / tampon) sayılmaz
const QUEUE_FULL_RESTART_MS = 30000;
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
      encoder: session?.encoder || undefined,
      bitrateKbps: session ? session.bitrateKbps ?? null : undefined,
      fps: p.fps ?? null,
      speed: p.speed ?? null,
      droppedFrames: p.droppedFrames ?? 0,
      outTimeMs: session ? session.totalOutMs + (p.outTimeMs || 0) : 0,
      attempt: session?.attempts || 0,
      warning: session?.warning || null,
      rtmp: session?.opts.url ? (session.rtmpDown ? "down" : "up") : undefined,
      speedLevel: session?.speedLevel || 0,
      ...(session?.local ? { localPath: session.local.current || null, localBytes: localBytes(session), localFailed: session.local.failed || false } : {}),
      ...extra,
    });
  };

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
    const runInfo = { run: s.run, encoder: s.encoder, listFile: `list-${s.run}.csv`, startIndex: s.nextSegment, lastIndex: -1, lastEnd: null, startedAt: now(), gotProgress: false, failReason: null, origin: null };
    s.runInfo = runInfo;
    s.runs.set(s.run, runInfo);
    s.totalOutMs += s.progress?.outTimeMs || 0;
    s.progress = null;
    s.warning = null;
    s.stderrTail = [];
    s.waitingHeader = true;
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
    const args = buildArgs({ ...s.opts, encoder: s.encoder, segmentSeconds, segmentStart: s.nextSegment, listFile: runInfo.listFile, fifo: s.fifo, localFile, speedLevel: s.speedLevel, fpsMode: s.fpsMode, platform });
    log("studio: ffmpeg başlıyor", { run: s.run, encoder: s.encoder, url: ff.maskUrl(s.opts.url) });
    note(`ffmpeg başlıyor (çalıştırma ${s.run})`, { encoder: s.encoder, speedLevel: s.speedLevel, fifo: s.fifo, args: ff.maskSecrets(args.join(" ")) });
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
    if (s.run > 1) events.emit("restartRecorder", { sessionId: s.id, run: s.run, reason: s.lastCode || null });
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
    // fifo: RTMP süreç içinde yeniden bağlanıyor.
    if (s.opts.url && FIFO_UP.test(line)) {
      s.rtmpDown = false;
      s.fifoAuth = 0;
      note("RTMP yeniden bağlandı (fifo)");
      if (runInfo.gotProgress) sessionStatus("live");
      return;
    }
    if (s.opts.url && FIFO_DOWN.test(line)) {
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
    if (s.opts.url && FIFO_QUEUE_FULL.test(line)) {
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
    const state = s.opts.url ? (s.rtmpDown ? "reconnecting" : "live") : "recording";
    const extra = s.notice ? { message: s.notice } : s.rtmpDown ? rtmpDownExtra(s) : s.speedSlow ? { message: MSG.speedSlow } : {};
    sessionStatus(state, extra);
    s.notice = null;
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
      const canLower = s.encoder === ff.ENCODERS.libx264 || s.encoder === ff.ENCODERS.nvenc;
      if (canLower && s.speedLevel < ff.MAX_SPEED_LEVEL) s.pendingSpeedLevel = s.speedLevel + 1;
      note("kodlayıcı yetişemiyor", { speed: p.speed, forMs: t - s.slowSince, encoder: s.encoder, nextSpeedLevel: s.pendingSpeedLevel ?? s.speedLevel });
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
    // Çağıranın geri düşüşü (açılar: H.264 kopyası açılamadı → yeniden kodlama). Deneme sayılmaz.
    // Zaman aşımı / takılma / birikme kaydedici kaynaklıdır, biçim sorunu değil: geri düşüş yok.
    if (!runInfo.gotProgress && typeof adjustAfterFailure === "function" && !["SPAWN", "TIMEOUT", "STALLED", "SLOW"].includes(reason.code)) {
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
      s.notice = next === ff.ENCODERS.libx264 ? MSG.encoderFallback : `Donanım kodlayıcı açılamadı; ${next} deneniyor.`;
      s.lastCode = reason.code;
      spawnRun();
      return;
    }
    if (reason.code === "SPAWN" || (reason.code === "ENCODER" && !runInfo.gotProgress)) {
      fail(reason.code === "SPAWN" ? MSG.noFfmpeg : MSG.noEncoder, reason.code);
      return;
    }
    s.attempts += 1;
    s.lastCode = reason.code;
    if (s.attempts > backoffMs.length) {
      fail(`${reason.message} ${MSG.failed}`, reason.code);
      return;
    }
    s.lastMessage = `(${s.attempts}/${backoffMs.length}) ${reason.message}`;
    sessionStatus(s.opts.url ? "reconnecting" : "starting", { message: s.lastMessage, code: reason.code });
    clearTimer("retryTimer");
    s.retryTimer = timers.setTimeout(() => { if (session === s) { s.retryTimer = null; spawnRun(); } }, backoffMs[s.attempts - 1]);
  }

  function fail(message, code) {
    const s = session;
    if (!s) return;
    s.failed = true;
    clearTimer("retryTimer");
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
    return { dir, base: localBaseName(lr.name ?? raw.matchLabel ?? raw.matchId, now()) };
  }

  async function start(rawOpts = {}) {
    if (session && !session.failed) return { ok: false, error: { code: "BUSY", message: MSG.busy } };
    if (session?.failed) await stop();
    const opts = normalizeOptions(rawOpts);
    if (opts.url && !validateUrl(opts.url)) return { ok: false, error: { code: "BAD_URL", message: MSG.badUrl } };
    const local = normalizeLocal(rawOpts.localRecord, rawOpts);
    if (local?.error) return { ok: false, error: local.error };
    const info = await getFfmpeg();
    if (!info?.available || !info.path) return { ok: false, error: { code: "NO_FFMPEG", message: info?.error || MSG.noFfmpeg } };
    const encoder = ff.pickEncoder(info.encoders);
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
      fifo: Boolean(info.muxers?.fifo), fpsMode: ff.supportsFpsMode(info.version), speedLevel: 0, pendingSpeedLevel: null,
      pins: new Map(), pinSeq: 0, retained: [], lastErrors: [], chunkCount: 0, lastChunkAt: null,
      local: local ? { ...local, parts: [], current: null, failed: false } : null,
    };
    note("oturum başladı", { sessionId: id, url: ff.maskUrl(opts.url), width: opts.width, height: opts.height, fps: opts.fps, videoBitrateKbps: opts.videoBitrateKbps, encoder, ffmpeg: info.version, fifo: session.fifo, local: local ? local.dir : null });
    sessionStatus("starting");
    spawnRun();
    if (!session) return { ok: false, error: { code: "NO_FFMPEG", message: MSG.noFfmpeg } };
    return { ok: true, sessionId: id, encoder: session.encoder };
  }

  /** MediaRecorder parçası. Hiç fırlatmaz; uygun değilse atar. */
  function pushChunk(data) {
    const s = session;
    if (!s || !s.child || s.stopping) return false;
    const buf = Buffer.isBuffer(data) ? data : ArrayBuffer.isView(data) ? Buffer.from(data.buffer, data.byteOffset, data.byteLength) : data instanceof ArrayBuffer ? Buffer.from(data) : null;
    if (!buf || !buf.length) return false;
    if (s.waitingHeader) {
      if (!isContainerHeader(buf)) return false; // eski kaydedicinin kalan parçası
      s.waitingHeader = false;
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
