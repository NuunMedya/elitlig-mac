// Yayın Stüdyosu — öne çıkanlar (highlight) oluşturma oturumları.
//
// Arayüz öne çıkanlar videosunu ekran dışı bir <canvas>'ta gerçek zamanlı
// oluşturur ve MediaRecorder parçalarını "studio:renderChunk" ile yollar.
// Ana süreç her parçayı:
//   1. ffmpeg'in stdin'ine yazar (gerçek zamanlı kodlama: H.264 High, yuv420p,
//      uygun düzey, AAC, +faststart MP4 → userData/highlights/highlight-<zaman>.mp4),
//   2. ham kopyasını geçici klasöre yazar (render-<kimlik>.webm).
// finish(): stdin kapanır, ffmpeg biter. Gerçek zamanlı kodlama başarısız olduysa
// (kodlayıcı açılamadı, yetişemedi) ham kopyadan x264 ile yeniden kodlanır.
// Ardından kapak (JPEG, ~%40) ve bilgi dosyası (highlight-….json) yazılır.
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { EventEmitter } = require("node:events");
const ff = require("./ffmpeg");
const ffargs = require("./ffargs");
const { computeH264Level } = require("./h264level");
const { isContainerHeader } = require("./engine");
const { killProcess } = require("./proc");
const { safeHighlightPath, highlightUrl } = require("./scheme");

const MAX_LIVE_PENDING = 64 * 1024 * 1024; // gerçek zamanlı kodlama bundan çok geride kalırsa bırakılır
const MAX_SESSIONS = 2;

const ERR = {
  NO_FFMPEG: "ffmpeg bulunamadı; öne çıkanlar videosu oluşturulamaz.",
  NO_ENCODER: "Bu bilgisayarda H.264 video kodlayıcı açılamadı.",
  NOT_FOUND: "Öne çıkanlar oturumu bulunamadı (iptal edilmiş ya da bitmiş olabilir).",
  EMPTY: "Öne çıkanlar videosu için görüntü gelmedi.",
  NO_HEADER: "Öne çıkanlar kaydedicisinin başlığı gelmedi (parçalar kayıt başlamadan önceki bir kaydediciden). Yeniden deneyin.",
  BUSY: "Aynı anda en çok iki öne çıkanlar videosu oluşturulabilir.",
  FAILED: "Öne çıkanlar videosu oluşturulamadı.",
};
const error = (code, message = ERR[code]) => ({ ok: false, error: { code, message } });

const clampInt = (value, min, max, fallback) => {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
const even = (n) => n - (n % 2);

function normalizeRenderOptions(o = {}) {
  return {
    width: even(clampInt(o.width, 320, 3840, 1920)),
    height: even(clampInt(o.height, 180, 2160, 1080)),
    fps: clampInt(o.fps, 15, 60, 30),
    videoBitrateKbps: clampInt(o.videoBitrateKbps, 500, 40000, 8000),
    audioBitrateKbps: clampInt(o.audioBitrateKbps, 64, 320, 160),
    mimeType: String(o.mimeType || ""),
  };
}

const EBML = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]);
/** Parçadaki EBML (Matroska / WebM) başlığının konumu; yoksa -1. */
const headerOffset = (buf) => buf.indexOf(EBML);

const toBuffer = (data) => (Buffer.isBuffer(data) ? data : ArrayBuffer.isView(data) ? Buffer.from(data.buffer, data.byteOffset, data.byteLength) : data instanceof ArrayBuffer ? Buffer.from(data) : null);

function createRenderer({
  getFfmpeg, highlightsDir, tempRoot, spawnImpl = spawn, runImpl = ff.run, now = () => Date.now(),
  timers = { setTimeout, clearTimeout }, finishTimeoutMs = 10 * 60 * 1000, platform = process.platform, log = () => {},
} = {}) {
  const events = new EventEmitter();
  const sessions = new Map();
  const kill = (child) => killProcess(child, { platform, spawnImpl });

  /** ffmpeg'i başlatır; ilerleme olayları ve çıkış sözü bağlanır. */
  function spawnEncoder(s, { input, inputFormat, encoder, progressOffsetMs = 0 }) {
    const args = ffargs.buildRenderArgs({ ...s.opts, input, inputFormat, outFile: s.out, encoder });
    const child = spawnImpl(s.ffmpegPath, args, { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    const tail = [];
    const parser = ff.createProgressParser((p) => {
      if (p.outTimeMs !== null) events.emit("progress", { renderId: s.id, outTimeMs: p.outTimeMs + progressOffsetMs, speed: p.speed, phase: input === "pipe:0" ? "live" : "transcode" });
    });
    child.stdout?.setEncoding?.("utf8");
    child.stdout?.on("data", (d) => parser.feed(d));
    child.stderr?.setEncoding?.("utf8");
    child.stderr?.on("data", (d) => {
      for (const line of String(d).split(/[\r\n]+/)) if (line.trim()) { tail.push(line.trim()); if (tail.length > 30) tail.shift(); }
    });
    child.stdin?.on?.("error", () => { /* EPIPE: süreç kapandı */ });
    const exited = new Promise((resolve) => {
      let done = false;
      const end = (code, signal, err) => { if (!done) { done = true; resolve({ code, signal, error: err || null, tail }); } };
      child.on("error", (e) => end(-1, null, e));
      child.on("exit", (code, signal) => end(code, signal));
    });
    return { child, exited, tail };
  }

  async function start(raw = {}) {
    if (sessions.size >= MAX_SESSIONS) return error("BUSY");
    let info = await getFfmpeg();
    // İlk yoklama başarısızsa (ilk açılışta ffmpeg'in ilk çalışması / kodlayıcı denemesi
    // zaman aşımına uğrayabilir; index.js başarısız yoklamayı önbelleğe almaz) bir kez daha yokla.
    if (!info?.available || !info.path) info = await getFfmpeg();
    if (!info?.available || !info.path) return error("NO_FFMPEG", info?.error || ERR.NO_FFMPEG);
    const encoder = ff.pickEncoder(info.encoders);
    if (!encoder) return error("NO_ENCODER");
    const opts = normalizeRenderOptions(raw);
    const id = `h${new Date(now()).toISOString().replace(/[-:T]/g, "").slice(0, 14)}-${crypto.randomBytes(3).toString("hex")}`;
    fs.mkdirSync(highlightsDir, { recursive: true });
    fs.mkdirSync(tempRoot, { recursive: true });
    const stamp = new Date(now()).toISOString().replace(/[-:]/g, "").replace("T", "-").replace(/\..*$/, "");
    let name = `highlight-${stamp}.mp4`;
    for (let n = 2; fs.existsSync(path.join(highlightsDir, name)) || [...sessions.values()].some((x) => x.name === name); n += 1) name = `highlight-${stamp}-${n}.mp4`;
    const inputFormat = ffargs.inputFormatFor(opts.mimeType);
    const s = {
      id, opts, name, out: path.join(highlightsDir, name), rawFile: path.join(tempRoot, `render-${id}.${inputFormat === "mp4" ? "mp4" : "webm"}`),
      inputFormat, encoder, encoders: { ...info.encoders }, ffmpegPath: info.path,
      waitingHeader: inputFormat === "matroska", bytes: 0, dropped: 0, live: null, liveBroken: false, finishing: null, cancelled: false,
    };
    s.rawStream = fs.createWriteStream(s.rawFile);
    s.rawStream.on("error", (e) => { s.rawError = e; });
    try {
      s.live = spawnEncoder(s, { input: "pipe:0", inputFormat, encoder });
    } catch (e) {
      log("studio: öne çıkan kodlayıcı başlatılamadı", e.message);
      s.liveBroken = true;
    }
    sessions.set(id, s);
    log("studio: öne çıkan başladı", { id, encoder, ...opts });
    return { ok: true, renderId: id, encoder };
  }

  function pushChunk(renderId, data) {
    const s = sessions.get(String(renderId));
    if (!s || s.finishing || s.cancelled) return false;
    let buf = toBuffer(data);
    if (!buf || !buf.length) return false;
    if (s.waitingHeader) {
      if (!isContainerHeader(buf)) {
        // Başlık parçanın içinde olabilir (önünde önceki kaydedicinin artığı): oradan kes.
        const at = headerOffset(buf);
        if (at < 0) { s.dropped += 1; return false; }
        buf = buf.subarray(at);
      }
      s.waitingHeader = false;
    }
    s.bytes += buf.length;
    s.rawStream.write(buf);
    const stdin = s.live?.child?.stdin;
    if (!s.liveBroken && stdin && !stdin.destroyed && stdin.writable) {
      stdin.write(buf);
      // Kodlama gerçek zamanı yakalayamıyor: bırakılır, bitişte ham kopyadan kodlanır.
      if (stdin.writableLength > MAX_LIVE_PENDING) {
        s.liveBroken = true;
        try { stdin.destroy(); } catch { /* yoksay */ }
        kill(s.live.child);
      }
    }
    return true;
  }

  const closeRaw = (s) => new Promise((resolve) => {
    if (s.rawStream.closed || s.rawStream.destroyed) { resolve(); return; }
    s.rawStream.end(() => resolve());
  });

  const waitExit = (s, run) => new Promise((resolve) => {
    const timer = timers.setTimeout(() => { kill(run.child); }, finishTimeoutMs);
    run.exited.then((r) => { timers.clearTimeout(timer); resolve(r); });
  });

  const outputOk = (file) => {
    try { return fs.statSync(file).size > 0; } catch { return false; }
  };

  async function finalize(s) {
    await closeRaw(s);
    if (!s.bytes) {
      if (s.dropped) log("studio: öne çıkan başlıksız parçalar", { id: s.id, dropped: s.dropped });
      // Hiç veri gelmedi: stdin'i bekleyen gerçek zamanlı kodlayıcı kapatılır (yoksa süreç asılı kalır).
      if (s.live?.child) {
        try { s.live.child.stdin?.end(); } catch { /* yoksay */ }
        kill(s.live.child);
        await s.live.exited;
      }
      // Kod "EMPTY" kalır (arayüz bu kodda sıradaki MIME türüyle yeniden dener); neden ayrıca.
      if (s.dropped) return { ok: false, error: { code: "EMPTY", reason: "NO_HEADER", message: ERR.NO_HEADER, droppedChunks: s.dropped } };
      return error("EMPTY");
    }
    let ok = false;
    if (s.live && !s.liveBroken) {
      try { s.live.child.stdin.end(); } catch { /* yoksay */ }
      const r = await waitExit(s, s.live);
      ok = r.code === 0 && outputOk(s.out);
      if (!ok) log("studio: öne çıkan gerçek zamanlı kodlama başarısız", { code: r.code, tail: r.tail.slice(-5) });
    } else if (s.live) {
      await waitExit(s, s.live);
    }
    if (s.cancelled) return error("NOT_FOUND");
    if (!ok) {
      // Ham kopyadan yeniden kodla (x264 tercih: donanım kodlayıcı az önce başarısız olmuş olabilir).
      try { fs.unlinkSync(s.out); } catch { /* yoksay */ }
      const encoder = s.encoders.libx264 ? ff.ENCODERS.libx264 : s.encoder;
      try {
        s.live = spawnEncoder(s, { input: s.rawFile, inputFormat: s.inputFormat, encoder });
        try { s.live.child.stdin.end(); } catch { /* yoksay */ }
        const r = await waitExit(s, s.live);
        ok = r.code === 0 && outputOk(s.out);
        if (!ok) return error("FAILED", `${ERR.FAILED} ${ff.mapFfmpegError(r.tail.join("\n")).message}`);
        s.encoder = encoder;
      } catch (e) {
        return error("FAILED", `${ERR.FAILED} ${e.message}`);
      }
    }
    if (s.cancelled) return error("NOT_FOUND");
    const probe = ffargs.parseVideoInfo((await runImpl(s.ffmpegPath, ["-hide_banner", "-nostdin", "-i", s.out], { timeout: 20000 })).stderr);
    const durationMs = probe.durationMs ?? null;
    const posterName = s.name.replace(/\.mp4$/, ".jpg");
    const posterFile = path.join(highlightsDir, posterName);
    const pres = await runImpl(s.ffmpegPath, ffargs.buildPosterArgs(s.out, posterFile, { durationMs }), { timeout: 20000 });
    const hasPoster = pres.ok && outputOk(posterFile);
    const width = probe.width ?? s.opts.width;
    const height = probe.height ?? s.opts.height;
    const meta = {
      name: s.name, createdAt: new Date(now()).toISOString(), durationMs, width, height, fps: s.opts.fps,
      level: computeH264Level(width, height, s.opts.fps), encoder: s.encoder, poster: hasPoster ? posterName : null, uploaded: null,
    };
    fs.writeFileSync(s.out.replace(/\.mp4$/, ".json"), JSON.stringify(meta));
    return { ok: true, file: describeHighlight(highlightsDir, s.name) };
  }

  /** → { ok, file: { name, path, url, durationMs, width, height, sizeBytes, posterUrl } } */
  function finish(renderId) {
    const s = sessions.get(String(renderId));
    if (!s) return Promise.resolve(error("NOT_FOUND"));
    if (!s.finishing) {
      s.finishing = finalize(s)
        .catch((e) => error("FAILED", `${ERR.FAILED} ${e.message}`))
        .then((res) => {
          sessions.delete(s.id);
          try { fs.unlinkSync(s.rawFile); } catch { /* yoksay */ }
          if (!res.ok) {
            try { fs.unlinkSync(s.out); } catch { /* yoksay */ }
          }
          return res;
        });
    }
    return s.finishing;
  }

  function cancel(renderId) {
    const s = sessions.get(String(renderId));
    if (!s) return true;
    s.cancelled = true;
    sessions.delete(s.id);
    try { s.live?.child?.stdin?.destroy(); } catch { /* yoksay */ }
    if (s.live?.child) kill(s.live.child);
    const cleanup = () => {
      for (const f of [s.out, s.rawFile, s.out.replace(/\.mp4$/, ".jpg")]) { try { fs.unlinkSync(f); } catch { /* yoksay */ } }
    };
    try { s.rawStream.destroy(); } catch { /* yoksay */ }
    if (s.live?.exited) s.live.exited.then(cleanup); else cleanup();
    return true;
  }

  function dispose() {
    for (const id of [...sessions.keys()]) cancel(id);
  }

  return { start, pushChunk, finish, cancel, dispose, active: () => sessions.size > 0, events };
}

/* ------------------------------ öne çıkan dosyaları ------------------------------ */

function readHighlightMeta(highlightsDir, name) {
  const file = safeHighlightPath(highlightsDir, name);
  if (!file || !/\.mp4$/.test(file)) return null;
  try { return JSON.parse(fs.readFileSync(file.replace(/\.mp4$/, ".json"), "utf8")); } catch { return {}; }
}

/** highlight-….mp4 → arayüz nesnesi (ya da null). */
function describeHighlight(highlightsDir, name) {
  const file = safeHighlightPath(highlightsDir, name);
  if (!file || !/\.mp4$/.test(file)) return null;
  let stat;
  try { stat = fs.statSync(file); } catch { return null; }
  const meta = readHighlightMeta(highlightsDir, name) || {};
  const posterName = name.replace(/\.mp4$/, ".jpg");
  const posterPath = safeHighlightPath(highlightsDir, posterName);
  const hasPoster = Boolean(posterPath && fs.existsSync(posterPath));
  return {
    name,
    path: file,
    url: highlightUrl(name),
    durationMs: meta.durationMs ?? null,
    width: meta.width ?? null,
    height: meta.height ?? null,
    fps: meta.fps ?? null,
    level: meta.level ?? null,
    sizeBytes: stat.size,
    createdAt: meta.createdAt || new Date(stat.mtimeMs).toISOString(),
    posterUrl: hasPoster ? highlightUrl(posterName) : null,
    posterPath: hasPoster ? posterPath : null,
    uploaded: meta.uploaded || null,
  };
}

/** 7 günden eski öne çıkanları siler (oturum sürerken hiçbir şey). */
function pruneHighlights(highlightsDir, { now = Date.now(), maxAgeMs = 7 * 24 * 3600 * 1000, isActive = () => false } = {}) {
  if (isActive()) return 0;
  let names = [];
  try { names = fs.readdirSync(highlightsDir); } catch { return 0; }
  let removed = 0;
  for (const name of names) {
    if (!/^highlight-[\w-]{1,80}\.(mp4|jpg|json)$/.test(name)) continue;
    const full = path.join(highlightsDir, name);
    try {
      if (now - fs.statSync(full).mtimeMs > maxAgeMs) { fs.unlinkSync(full); if (name.endsWith(".mp4")) removed += 1; }
    } catch { /* yoksay */ }
  }
  return removed;
}

module.exports = { createRenderer, headerOffset, normalizeRenderOptions, describeHighlight, readHighlightMeta, pruneHighlights, ERR };
