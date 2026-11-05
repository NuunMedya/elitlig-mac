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
//   - İlerleme 15 sn kesilirse (arayüz parça yollamıyor) süreç yeniden başlar.
//   - VideoToolbox açılamazsa (ilk saniyelerde kodlayıcı hatası) libx264'e geçilir.
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
};

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
} = {}) {
  const MSG = { ...MESSAGES, ...messages };
  const events = new EventEmitter();
  let session = null;
  let status = { state: "idle" };

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
      ...extra,
    });
  };

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
      try { fs.unlinkSync(path.join(session.dir, old.file)); } catch { /* yoksay */ }
    }
    // Son parçalardan gerçek bit hızı (tee toplam boyut vermez).
    const recent = session.segments.slice(-3);
    const dur = recent.reduce((s, x) => s + (x.end - x.start), 0);
    if (dur > 0) session.bitrateKbps = Math.round(recent.reduce((s, x) => s + x.size, 0) * 8 / dur / 1000);
  }

  /**
   * Klip için kaynak: tamamlanmış parçalar ve (varsa) yazılmakta olan parça.
   * → { dir, complete: [{ file, path, start, end, durationSec, run, encoder }], growing: { file, path, durationSec, run, encoder } | null }
   */
  function clipSources() {
    if (!session) return null;
    syncSegments();
    const wall = (run, sec) => {
      const origin = session.runs.get(run)?.origin;
      return origin === null || origin === undefined ? null : Math.round(origin + sec * 1000);
    };
    const complete = session.segments.map((s) => ({ ...s, path: path.join(session.dir, s.file), durationSec: s.end - s.start, wallStart: wall(s.run, s.start), wallEnd: wall(s.run, s.end) }));
    let growing = null;
    const runInfo = session.runInfo;
    if (session.child && runInfo && session.progress?.outTimeMs) {
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
      if (size > 0) {
        const wallStart = wall(runInfo.run, lastEnd);
        growing = { file, path: full, durationSec, sizeBytes: size, run: runInfo.run, encoder: runInfo.encoder, wallStart, wallEnd: wallStart === null ? null : Math.round(wallStart + durationSec * 1000) };
      }
    }
    return { dir: session.dir, complete, growing, segmentSeconds };
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
    const args = buildArgs({ ...s.opts, encoder: s.encoder, segmentSeconds, segmentStart: s.nextSegment, listFile: runInfo.listFile });
    log("studio: ffmpeg başlıyor", { run: s.run, encoder: s.encoder, url: ff.maskUrl(s.opts.url) });
    let child;
    try {
      child = spawnImpl(s.ffmpegPath, args, { cwd: s.dir, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    } catch (error) {
      onExit(runInfo, -1, null, error);
      return;
    }
    s.child = child;
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
    s.stderrTail.push(line);
    if (s.stderrTail.length > 40) s.stderrTail.shift();
    const slave = ff.parseSlaveFailure(line);
    if (slave && s.opts.url && !s.stopping) {
      // RTMP çıkışı düştü; ffmpeg yalnız parçalara yazmaya devam eder. Yeniden bağlanmak için süreç yeniden başlar.
      runInfo.failReason = ff.mapFfmpegError(`${s.stderrTail.join("\n")}\n${slave.reason}`);
      if (runInfo.failReason.code === "UNKNOWN" || runInfo.failReason.code === "INPUT" || runInfo.failReason.code === "ENCODER") runInfo.failReason = ff.mapFfmpegError(`Input/output error ${slave.reason}`);
      log("studio: RTMP çıkışı düştü", slave.reason);
      killChild(s);
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
    // İlerleme kesilirse (arayüz parça göndermiyor / ffmpeg takıldı) süreç yeniden başlatılır.
    clearTimer("stallTimer");
    s.stallTimer = timers.setTimeout(() => {
      if (session !== s || s.runInfo !== runInfo || s.stopping) return;
      runInfo.failReason = { code: "STALLED", message: MSG.stalled };
      killChild(s);
    }, stallTimeoutMs);
    if (s.child?.stdin && s.child.stdin.writableLength < SLOW_BYTES / 2 && s.warning === "slow") s.warning = null;
    sessionStatus(s.opts.url ? "live" : "recording", s.notice ? { message: s.notice } : {});
    s.notice = null;
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

  async function start(rawOpts = {}) {
    if (session && !session.failed) return { ok: false, error: { code: "BUSY", message: MSG.busy } };
    if (session?.failed) await stop();
    const opts = normalizeOptions(rawOpts);
    if (opts.url && !validateUrl(opts.url)) return { ok: false, error: { code: "BAD_URL", message: MSG.badUrl } };
    const info = await getFfmpeg();
    if (!info?.available || !info.path) return { ok: false, error: { code: "NO_FFMPEG", message: info?.error || MSG.noFfmpeg } };
    const encoder = ff.pickEncoder(info.encoders);
    if (!encoder) return { ok: false, error: { code: "NO_ENCODER", message: MSG.noEncoder } };
    if (session) return { ok: false, error: { code: "BUSY", message: MSG.busy } };
    const id = `${new Date(now()).toISOString().replace(/[-:T]/g, "").slice(0, 14)}-${crypto.randomBytes(3).toString("hex")}`;
    const dir = path.join(tempRoot, id);
    fs.mkdirSync(dir, { recursive: true });
    session = {
      id, dir, opts, encoder, encoders: { ...info.encoders }, ffmpegPath: info.path,
      run: 0, attempts: 0, nextSegment: 0, segments: [], runs: new Map(), totalOutMs: 0, progress: null,
      child: null, runInfo: null, stopping: false, failed: false, startedAt: now(),
    };
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
    const pending = stdin.writableLength;
    if (pending > MAX_BYTES) {
      s.runInfo.failReason = { code: "SLOW", message: MSG.tooSlow };
      killChild(s);
    } else if (pending > SLOW_BYTES && s.warning !== "slow") {
      s.warning = "slow";
      sessionStatus(status.state, { message: MSG.slow });
    }
    return true;
  }

  function removeDir(dir) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* yoksay */ }
  }

  /** Nazik durdurma: stdin kapanır, ffmpeg kuyruğu boşaltır; 5 sn içinde bitmezse öldürülür (proc.js). */
  function stop() {
    const s = session;
    if (!s) return Promise.resolve(true);
    if (s.stopPromise) return s.stopPromise;
    s.stopping = true;
    for (const t of ["retryTimer", "connectTimer", "stableTimer", "stallTimer"]) clearTimer(t);
    s.stopPromise = new Promise((resolve) => {
      const finish = () => {
        if (s.killTimer) timers.clearTimeout(s.killTimer);
        removeDir(s.dir);
        if (session === s) session = null;
        emitStatus({ state: "stopped", sessionId: s.id });
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
    active: () => Boolean(session && !session.failed),
    sessionId: () => session?.id || null,
    events,
  };
}

/** Genel adı: parça halkası kaydedici (yayın motoru ve açılar). */
const createSegmentRecorder = createStudioEngine;

module.exports = { createStudioEngine, createSegmentRecorder, fallbackEncoder, parseSegmentList, isContainerHeader, BACKOFF_MS, MESSAGES };
