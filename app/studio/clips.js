// Yayın Stüdyosu — gol klipleri.
//
// Klip, yayına giden görüntünün son ~10 sn'sidir: motorun 2 sn'lik MPEG-TS
// parçalarından en yeni tamamlanmışlar (ve 0,5 sn'den uzunsa yazılmakta olanın
// kopyası) seçilir, ffmpeg concat demuxer ile yeniden kodlamadan MP4'e
// birleştirilir (userData/clips/clip-<zaman>.mp4, yanında .json bilgi dosyası).
// Klip parça sınırında başladığı için istenenden en çok ~2 sn uzun olabilir.
// 24 saatten eski klipler açılışta silinir.
//
// 2.10'dan beri studio.saveClip tekrar deposuna (replays.js) yazar; bu depo
// eski klipleri listelemek / yüklemek için ve testlerde kalır. Birleştirme
// H.264 düzeyini düzeltir (h264level.js) ve +faststart yazar.
//
// Arayüz klibi elitlig-studio://clips/<ad> adresinden oynatır (Range destekli).
// Sunucuya yükleme (2.12.1+): ÖN İMZALI akış — uploadClipPresigned:
//   POST /api/admin/live-streams/matches/:id/clips/upload-url { event_id, size_bytes, content_type, … }
//   PUT dosya (+ kapak) doğrudan Spaces'e (dönen başlıklar aynen; jeton yok)
//   POST /api/admin/live-streams/matches/:id/clips (JSON) { key, event_id, poster_key, … }
// Dosya Heroku'dan geçmez: canlı yayın sırasında yükleme hattı yayınla dolu
// olduğunda çok parçalı yükleme Heroku'nun 30 sn sınırına takılıp 503 (H12)
// alıyordu. Sunucuda uç yoksa (eski sunucu: kodsuz 404) eski çok parçalı yola düşülür:
// POST /api/admin/live-streams/matches/:id/clips?event_id=…
// (alanlar dosyadan ÖNCE: event_id, duration_ms, width, height, file).
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { Readable } = require("node:stream");
const ff = require("./ffmpeg");
const ffargs = require("./ffargs");
const { computeH264Level } = require("./h264level");
// highlights.js → render.js → scheme.js bu dosyayı içe aktarır: döngü olmasın diye geç yüklenir.
const presignedFlow = () => require("./highlights");

const STUDIO_SCHEME = "elitlig-studio";
const CLIP_NAME = /^clip-[\w-]{1,80}\.mp4$/;
const MAX_AGE_MS = 24 * 3600 * 1000;
const UPLOAD_LIMIT = 40 * 1024 * 1024; // sunucu sınırı (413 VIDEO_TOO_LARGE)
const UPLOAD_TIMEOUT_MS = 180000;
const RETRY_STATUS = new Set([502, 503, 504]);

const ERR = {
  NOT_STREAMING: "Klip için yayın ya da kayıt sürüyor olmalı.",
  NO_BUFFER: "Klip için yeterli görüntü yok (en az 1 sn). Birkaç saniye sonra yeniden deneyin.",
  CLIP_WRITE_FAILED: "Klip yazılamadı.",
  NOT_FOUND: "Klip bulunamadı.",
  TOO_LARGE: "Klip 40 MB'tan büyük; yüklenemez.",
  BAD_REQUEST: "Maç ya da gol olayı seçilmedi.",
};
const error = (code, message = ERR[code]) => ({ ok: false, error: { code, message } });

/* ----------------------------- parça seçimi ----------------------------- */

/**
 * En yeni parçalardan geriye doğru toplam ≥ seconds olana kadar seçer.
 * Yazılmakta olan parça 0,5 sn'den uzunsa dahil edilir (kopyalanarak).
 * Kodlayıcı değişmişse (VideoToolbox → x264) eski parçalara geçilmez.
 * → { items: [...kronolojik], durationSec, includesGrowing }
 */
function selectSegments({ complete = [], growing = null, seconds = 10, minGrowingSec = 0.5 }) {
  const picked = [];
  let total = 0;
  let encoder = null;
  if (growing && growing.durationSec > minGrowingSec) {
    picked.push({ ...growing, growing: true });
    total += growing.durationSec;
    encoder = growing.encoder || null;
  }
  const sorted = [...complete].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  for (let i = sorted.length - 1; i >= 0 && total < seconds; i -= 1) {
    const seg = sorted[i];
    if (encoder && seg.encoder && seg.encoder !== encoder) break;
    encoder = encoder || seg.encoder || null;
    const d = Number(seg.durationSec ?? (seg.end - seg.start));
    if (!(d > 0)) continue;
    picked.push(seg);
    total += d;
  }
  return { items: picked.reverse(), durationSec: total, includesGrowing: picked.some((p) => p.growing) };
}

/* ------------------------------ ad / yol güvenliği ------------------------------ */

/** Klip adını klasör içinde güvenli bir yola çevirir; olmazsa null. */
function safeClipPath(clipsDir, name) {
  const base = String(name || "");
  if (!CLIP_NAME.test(base) || base !== path.basename(base)) return null;
  const root = path.resolve(clipsDir);
  const full = path.resolve(root, base);
  if (path.dirname(full) !== root) return null;
  return full;
}

const clipUrl = (name) => `${STUDIO_SCHEME}://clips/${encodeURIComponent(name)}`;

/** elitlig-studio://clips/<ad> → ad (yalnız "clips" konağı). */
function nameFromUrl(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== `${STUDIO_SCHEME}:` || u.hostname !== "clips") return null;
    const name = decodeURIComponent(u.pathname.replace(/^\/+/, ""));
    return CLIP_NAME.test(name) ? name : null;
  } catch {
    return null;
  }
}

/**
 * HTTP Range başlığı → { start, end } (dahil), tüm dosya için null,
 * karşılanamazsa { invalid: true }. Yalnız tek aralık desteklenir.
 */
function parseRange(header, size) {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(header).trim());
  if (!m || (m[1] === "" && m[2] === "")) return { invalid: true };
  let start;
  let end;
  if (m[1] === "") {
    const suffix = Number(m[2]);
    if (!(suffix > 0)) return { invalid: true };
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (start >= size || end < start) return { invalid: true };
  return { start, end };
}

/** Şema isteğine yanıt (Range destekli). Klasör dışı / geçersiz ad → 404. */
function serveClip(clipsDir, request) {
  const name = nameFromUrl(request.url);
  const file = name && safeClipPath(clipsDir, name);
  const cors = { "Access-Control-Allow-Origin": "*", "Cross-Origin-Resource-Policy": "cross-origin" };
  if (!file) return new Response("", { status: 404, headers: cors });
  let size;
  try { size = fs.statSync(file).size; } catch { return new Response("", { status: 404, headers: cors }); }
  const header = typeof request.headers?.get === "function" ? request.headers.get("range") : request.headers?.range;
  const range = parseRange(header, size);
  const base = { ...cors, "Content-Type": "video/mp4", "Accept-Ranges": "bytes", "Cache-Control": "no-cache" };
  if (range?.invalid) return new Response("", { status: 416, headers: { ...base, "Content-Range": `bytes */${size}` } });
  const method = String(request.method || "GET").toUpperCase();
  const { start, end } = range || { start: 0, end: size - 1 };
  const headers = { ...base, "Content-Length": String(size ? end - start + 1 : 0) };
  if (range) headers["Content-Range"] = `bytes ${start}-${end}/${size}`;
  const body = method === "HEAD" || !size ? null : Readable.toWeb(fs.createReadStream(file, { start, end }));
  return new Response(body, { status: range ? 206 : 200, headers });
}

/* ------------------------------ çok parçalı gövde ------------------------------ */

/**
 * Alanlar dosyadan önce: sunucu nesne anahtarına olay kimliğini yazar.
 * extraFiles: dosyadan sonra eklenen isteğe bağlı dosyalar ([{ field, name, mime, data }], ör. kapak).
 */
function buildClipMultipart({ fields, file, extraFiles = [], boundary = `----elitligclip${Date.now().toString(16)}${Math.random().toString(16).slice(2)}` }) {
  const parts = [];
  for (const [key, value] of Object.entries(fields)) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`, "utf8"));
  }
  const safe = String(file.name || "klip.mp4").replace(/["\r\n]/g, "_");
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${safe}"\r\nContent-Type: ${file.mime || "video/mp4"}\r\n\r\n`, "utf8"));
  parts.push(Buffer.from(file.data));
  for (const extra of extraFiles) {
    const field = String(extra.field || "file2").replace(/["\r\n]/g, "_");
    const fname = String(extra.name || field).replace(/["\r\n]/g, "_");
    parts.push(Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="${field}"; filename="${fname}"\r\nContent-Type: ${extra.mime || "application/octet-stream"}\r\n\r\n`, "utf8"));
    parts.push(Buffer.from(extra.data));
  }
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`, "utf8"));
  return { body: Buffer.concat(parts), contentType: `multipart/form-data; boundary=${boundary}` };
}

/* ------------------------------ web kopyası ------------------------------ */

// Sitede siyah görüntü: klip, yayın parçalarının yeniden kodlanmamış (concat
// kopyası) birleşimidir; kaynak kodlayıcıya göre (VideoToolbox gerçek zamanlı,
// donanım kodlayıcıları, açı kaydedicisinin kopyalanan H.264'ü) akış tarayıcıda
// çözülemeyebiliyor ya da ilk kareler (anahtar kareye kadar) siyah kalıyordu;
// ayrıca kapak hiç yoksa sitede videonun siyah ilk karesi görünüyordu.
// Yüklenen dosya artık her zaman tarayıcı dostu bir kopyadır:
//   H.264 High, yuv420p, sabit kare hızı, düzey çözünürlüğe göre, AAC 48 kHz
//   stereo (kaynakta ses varsa), moov başta (+faststart), en çok 1920×1080.
// Kapak bu kopyanın ~1. saniyesinden alınır (ilk kare çoğu zaman siyah/geçiş).
// Kodlama başarısız olursa özgün dosya yüklenir (yükleme hiç engellenmez).

const WEB_MAX_W = 1920;
const WEB_MAX_H = 1080;

/** Kaynak boyutu en çok 1920×1080 kutusuna (çift sayılarla) sığdırılır. */
function webClipSize(width, height) {
  let w = Number(width) > 0 ? Number(width) : 1280;
  let h = Number(height) > 0 ? Number(height) : 720;
  const scale = Math.min(1, WEB_MAX_W / w, WEB_MAX_H / h);
  const even = (n) => Math.max(2, n - (n % 2));
  w = even(Math.round(w * scale));
  h = even(Math.round(h * scale));
  return { width: w, height: h };
}

/** Klip → tarayıcı dostu MP4 (libx264 High yuv420p + AAC + faststart). */
function buildWebClipArgs(input, outFile, { width, height, fps, hasAudio = true } = {}) {
  const size = webClipSize(width, height);
  const rate = Math.min(60, Math.max(15, Math.round(Number(fps) > 0 ? Number(fps) : 30)));
  return [
    "-hide_banner", "-nostdin", "-loglevel", "error", "-y",
    "-fflags", "+genpts", "-i", input,
    "-map", "0:v:0", ...(hasAudio ? ["-map", "0:a:0?"] : []),
    "-vf", `scale=${size.width}:${size.height}:flags=bicubic,fps=${rate},format=yuv420p`,
    "-c:v", "libx264", "-preset", "veryfast", "-profile:v", "high", "-level", computeH264Level(size.width, size.height, rate),
    "-pix_fmt", "yuv420p", "-crf", "21", "-maxrate", "8M", "-bufsize", "16M",
    "-g", String(rate * 2), "-bf", "2", "-threads", "2",
    ...(hasAudio ? ["-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-ac", "2"] : ["-an"]),
    "-movflags", "+faststart", "-f", "mp4",
    outFile,
  ];
}

/** Kapak: ~1. saniyedeki kare (kısa klipte ortası), 1280 px, JPEG. */
function buildWebPosterArgs(videoFile, posterFile, { durationMs = null, width = 1280 } = {}) {
  const dur = Number(durationMs) > 0 ? Number(durationMs) / 1000 : null;
  const at = dur == null ? 1 : Math.min(1, dur / 2);
  return [
    "-hide_banner", "-nostdin", "-loglevel", "error", "-y",
    "-ss", at.toFixed(3), "-i", videoFile,
    "-frames:v", "1", "-vf", `scale='min(${width},iw)':-2`, "-q:v", "3", "-update", "1",
    posterFile,
  ];
}

const webPaths = (input) => {
  const base = String(input).replace(/\.mp4$/i, "");
  return { video: `${base}.web.mp4`, poster: `${base}.web.jpg` };
};

/**
 * Yüklenecek web kopyasını hazırlar (varsa ve kaynaktan yeniyse yeniden
 * kullanır). → { path, sizeBytes, posterPath, durationMs, width, height } | null
 */
async function prepareWebClip({ input, ffmpegPath, runImpl = ff.run } = {}) {
  if (!input || !ffmpegPath || !fs.existsSync(input)) return null;
  const out = webPaths(input);
  const probe = async (file) => ffargs.parseVideoInfo((await runImpl(ffmpegPath, ["-hide_banner", "-nostdin", "-i", file], { timeout: 15000 })).stderr);
  try {
    const fresh = fs.existsSync(out.video) && fs.statSync(out.video).size > 0 && fs.statSync(out.video).mtimeMs >= fs.statSync(input).mtimeMs;
    if (!fresh) {
      const src = await probe(input);
      if (!src.width || !src.height) return null; // video akışı okunamadı
      try { fs.unlinkSync(out.video); } catch { /* yok */ }
      const res = await runImpl(ffmpegPath, buildWebClipArgs(input, out.video, src), { timeout: 120000 });
      if (!res.ok || !fs.existsSync(out.video) || fs.statSync(out.video).size === 0) {
        try { fs.unlinkSync(out.video); } catch { /* yok */ }
        return null;
      }
    }
    const meta = await probe(out.video);
    if (!fs.existsSync(out.poster) || fs.statSync(out.poster).mtimeMs < fs.statSync(out.video).mtimeMs) {
      await runImpl(ffmpegPath, buildWebPosterArgs(out.video, out.poster, { durationMs: meta.durationMs }), { timeout: 20000 });
    }
    const posterOk = fs.existsSync(out.poster) && fs.statSync(out.poster).size > 0;
    return {
      path: out.video,
      sizeBytes: fs.statSync(out.video).size,
      posterPath: posterOk ? out.poster : null,
      durationMs: meta.durationMs ?? null,
      width: meta.width ?? null,
      height: meta.height ?? null,
    };
  } catch {
    return null;
  }
}

/* ------------------------------ ön imzalı yükleme ------------------------------ */

const CLIP_ERR = {
  BAD_REQUEST: ERR.BAD_REQUEST,
  NOT_FOUND: ERR.NOT_FOUND,
  TOO_LARGE: ERR.TOO_LARGE,
  NETWORK: "Bağlantı yok: gol klibi yüklenemedi. İnternet bağlantınızı kontrol edin.",
  UPLOAD_URL: "Gol klibi yükleme adresi alınamadı.",
  PUT_FAILED: "Gol klibi depolama alanına yüklenemedi.",
  FINALIZE: "Gol klibi yüklendi ama gole bağlanamadı.",
  SERVER_PENDING: "Sunucu güncellemesi bekleniyor: gol klibi doğrudan yükleme ucu henüz yayında değil.",
};

/**
 * Gol klibini ön imzalı akışla yükler.
 *   file: { path, sizeBytes, posterPath? } (poster isteğe bağlı JPEG)
 *   legacy: sunucuda uç yoksa çağrılan eski çok parçalı yükleme (() => Promise<api sonucu>)
 * → { ok, data: klip, via: "presigned" | "multipart", posterError? } | { ok:false, error, via }
 */
async function uploadClipPresigned(api, { matchId, eventId, file, durationMs, width, height } = {}, { putImpl = null, emitProgress = () => {}, sleep, legacy = null } = {}) {
  const { uploadPresigned, putFile } = presignedFlow();
  const mid = Number(matchId);
  const eid = Number(eventId);
  if (!Number.isInteger(mid) || mid <= 0 || !Number.isInteger(eid) || eid <= 0) return { ...error("BAD_REQUEST"), via: "presigned" };
  if (!file?.path || !fs.existsSync(file.path)) return { ...error("NOT_FOUND"), via: "presigned" };
  const sizeBytes = Number(file.sizeBytes) || fs.statSync(file.path).size;
  if (!(sizeBytes > 0)) return { ...error("NOT_FOUND", "Klip dosyası boş."), via: "presigned" };
  if (sizeBytes > UPLOAD_LIMIT) return { ...error("TOO_LARGE"), via: "presigned" };
  const posterPath = file.posterPath && fs.existsSync(file.posterPath) ? file.posterPath : null;
  const meta = {
    event_id: eid,
    duration_ms: Math.round(Number(durationMs) || 0),
    width: Math.round(Number(width) || 0),
    height: Math.round(Number(height) || 0),
  };
  const base = `/api/admin/live-streams/matches/${mid}/clips`;
  const res = await uploadPresigned(api, { kind: "clip", matchId: mid, base, file: { path: file.path, sizeBytes, posterPath }, meta, errors: CLIP_ERR }, { putImpl: putImpl || putFile, emitProgress, ...(sleep ? { sleep } : {}) });
  if (res.ok) return { ok: true, data: res.result, via: "presigned", key: res.key, posterKey: res.posterKey, ...(res.posterError ? { posterError: res.posterError } : {}) };
  if (res.error?.code === "SERVER_PENDING" && typeof legacy === "function") {
    const old = await legacy();
    return { ...old, via: "multipart" };
  }
  return { ...res, via: "presigned" };
}

/**
 * studio:uploadClip — tekrar deposundaki açı ({ replayId, angle }) ya da eski
 * klip ({ name }) için ön imzalı yükleme; eski sunucuda çok parçalı yola düşer.
 * Başarıda yerel bilgi dosyasına "yüklendi" işlenir.
 *   stores: { replays, clips } (createReplayStore / createClipStore)
 */
async function uploadGoalClip(api, payload = {}, { replays, clips, putImpl, emitProgress, sleep, now = () => Date.now(), isReplayId = (v) => /^r\d{14}-[0-9a-f]{6}$/.test(String(v || "")) } = {}) {
  const p = payload || {};
  const mid = Number(p.matchId);
  const fromReplay = Boolean(p.replayId) || isReplayId(p.name);
  if (fromReplay) {
    const replayId = p.replayId || p.name;
    const replay = replays?.get?.(replayId);
    const angle = p.angle || "program";
    const a = replay?.angles?.find((x) => x.angle === String(angle));
    const eid = Number(p.eventId ?? replay?.eventId);
    const legacy = () => replays.upload(api, { ...p, replayId });
    // Dosya / açı yoksa eski yol aynı Türkçe hatayı (NOT_FOUND / BAD_ANGLE) verir.
    if (!replay || !a?.path) return legacy();
    // Tarayıcı dostu kopya (H.264 yuv420p + AAC + faststart, ~1 sn kapağı); olmazsa özgün dosya.
    const web = typeof replays.webCopy === "function" ? await replays.webCopy(replay.id, a.angle).catch(() => null) : null;
    const res = await uploadClipPresigned(api, {
      matchId: mid, eventId: eid,
      file: web ? { path: web.path, sizeBytes: web.sizeBytes, posterPath: web.posterPath || a.posterPath || null } : { path: a.path, sizeBytes: a.sizeBytes, posterPath: a.posterPath || null },
      durationMs: p.durationMs ?? web?.durationMs ?? a.durationMs, width: p.width ?? web?.width ?? a.width, height: p.height ?? web?.height ?? a.height,
    }, { putImpl, emitProgress, sleep, legacy });
    if (res.ok && res.via === "presigned") {
      try {
        replays.update(replay.id, {
          ...(replay.eventId ? {} : { eventId: eid }),
          uploaded: { matchId: mid, eventId: eid, angle: a.angle, clipId: res.data?.id ?? null, url: res.data?.url ?? null, at: new Date(now()).toISOString(), via: "presigned" },
        });
      } catch { /* bilgi dosyası isteğe bağlı */ }
    }
    return res;
  }
  const clip = clips?.describe?.(p.name);
  const legacy = () => clips.upload(api, p);
  if (!clip) return legacy();
  const web = typeof clips.webCopy === "function" ? await clips.webCopy(p.name).catch(() => null) : null;
  const res = await uploadClipPresigned(api, {
    matchId: mid, eventId: Number(p.eventId),
    file: web ? { path: web.path, sizeBytes: web.sizeBytes, posterPath: web.posterPath } : { path: clip.path, sizeBytes: clip.sizeBytes },
    durationMs: p.durationMs ?? web?.durationMs ?? clip.durationMs, width: p.width ?? web?.width ?? clip.width, height: p.height ?? web?.height ?? clip.height,
  }, { putImpl, emitProgress, sleep, legacy });
  if (res.ok && res.via === "presigned") {
    try {
      const file = clip.path.replace(/\.mp4$/, ".json");
      let meta = {};
      try { meta = JSON.parse(fs.readFileSync(file, "utf8")); } catch { /* bilgi dosyası yok */ }
      fs.writeFileSync(file, JSON.stringify({ ...meta, uploaded: { matchId: mid, eventId: Number(p.eventId), clipId: res.data?.id ?? null, url: res.data?.url ?? null, at: new Date(now()).toISOString(), via: "presigned" } }));
    } catch { /* yoksay */ }
  }
  return res;
}

/* --------------------------------- depo --------------------------------- */

function createClipStore({ clipsDir, getFfmpegPath, runImpl = ff.run, now = () => Date.now(), maxAgeMs = MAX_AGE_MS, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  const ensureDir = () => fs.mkdirSync(clipsDir, { recursive: true });
  const metaPath = (file) => file.replace(/\.mp4$/, ".json");

  const describe = (name) => {
    const file = safeClipPath(clipsDir, name);
    if (!file) return null;
    let stat;
    try { stat = fs.statSync(file); } catch { return null; }
    let meta = {};
    try { meta = JSON.parse(fs.readFileSync(metaPath(file), "utf8")); } catch { /* bilgi dosyası yok */ }
    return {
      path: file,
      url: clipUrl(name),
      name,
      durationMs: meta.durationMs ?? null,
      width: meta.width ?? null,
      height: meta.height ?? null,
      sizeBytes: stat.size,
      createdAt: meta.createdAt || new Date(stat.mtimeMs).toISOString(),
      sessionId: meta.sessionId || null,
      uploaded: meta.uploaded || null,
    };
  };

  /** 24 saatten eski klipleri (ve yetim .json / iş klasörlerini) siler. */
  function prune() {
    let removed = 0;
    let names = [];
    try { names = fs.readdirSync(clipsDir); } catch { return 0; }
    for (const name of names) {
      const full = path.join(clipsDir, name);
      let stat;
      try { stat = fs.statSync(full); } catch { continue; }
      const old = now() - stat.mtimeMs > maxAgeMs;
      if (stat.isDirectory() && name.startsWith(".work-")) { fs.rmSync(full, { recursive: true, force: true }); continue; }
      if (old && (CLIP_NAME.test(name) || /^clip-.*\.(json|web\.mp4|web\.jpg)$/.test(name))) {
        try { fs.unlinkSync(full); removed += name.endsWith(".mp4") ? 1 : 0; } catch { /* yoksay */ }
      }
    }
    return removed;
  }

  function list() {
    let names = [];
    try { names = fs.readdirSync(clipsDir).filter((n) => CLIP_NAME.test(n)); } catch { return []; }
    return names.map(describe).filter((c) => c && now() - Date.parse(c.createdAt) <= maxAgeMs)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.name.localeCompare(a.name));
  }

  function remove(name) {
    const file = safeClipPath(clipsDir, name);
    if (!file) return false;
    const web = webPaths(file);
    for (const f of [file, metaPath(file), web.video, web.poster]) {
      try { fs.unlinkSync(f); } catch { /* yoksay */ }
    }
    return true;
  }

  /** Yükleme için tarayıcı dostu kopya (bkz. prepareWebClip); olmazsa null. */
  async function webCopy(name) {
    const file = safeClipPath(clipsDir, name);
    if (!file || !fs.existsSync(file)) return null;
    return prepareWebClip({ input: file, ffmpegPath: getFfmpegPath(), runImpl });
  }

  async function probe(file) {
    const res = await runImpl(getFfmpegPath(), ["-hide_banner", "-nostdin", "-i", file], { timeout: 15000 });
    return ff.parseProbe(res.stderr);
  }

  /**
   * sources: motorun clipSources() çıktısı. → { ok, clip } | { ok:false, error }
   */
  async function save({ sources, seconds = 10, sessionId = null }) {
    if (!sources) return error("NOT_STREAMING");
    const want = Math.min(30, Math.max(1, Number(seconds) || 10));
    const pick = selectSegments({ complete: sources.complete, growing: sources.growing, seconds: want });
    if (pick.durationSec < 1) return error("NO_BUFFER");
    ensureDir();
    const stamp = new Date(now()).toISOString().replace(/[-:]/g, "").replace("T", "-").replace(/\..*$/, "");
    let name = `clip-${stamp}-${String(now() % 1000).padStart(3, "0")}.mp4`;
    for (let n = 2; fs.existsSync(path.join(clipsDir, name)); n += 1) name = name.replace(/(-\d+)?\.mp4$/, `-${n}.mp4`);
    const out = path.join(clipsDir, name);
    const work = fs.mkdtempSync(path.join(clipsDir, ".work-"));
    try {
      const files = pick.items.map((item, i) => {
        // Kopyala: parça halkası klip yazılırken silinebilir / büyümeye devam eder.
        const copy = path.join(work, `${String(i).padStart(3, "0")}.ts`);
        fs.copyFileSync(item.path, copy);
        return copy;
      });
      const listFile = path.join(work, "list.txt");
      fs.writeFileSync(listFile, `${files.map(ff.concatLine).join("\n")}\n`);
      // H.264 düzeyi kaynak boyutu / kare hızına göre düzeltilir (sitede siyah görüntü hatası).
      const src = ffargs.parseVideoInfo((await runImpl(getFfmpegPath(), ["-hide_banner", "-nostdin", "-i", files[0]], { timeout: 15000 })).stderr);
      const res = await runImpl(getFfmpegPath(), ffargs.buildConcatLevelArgs(listFile, out, src), { timeout: 60000 });
      if (!res.ok || !fs.existsSync(out) || fs.statSync(out).size === 0) {
        try { fs.unlinkSync(out); } catch { /* yoksay */ }
        return error("CLIP_WRITE_FAILED", `${ERR.CLIP_WRITE_FAILED} ${String(res.stderr || "").trim().split("\n").pop() || ""}`.trim());
      }
      const meta = await probe(out);
      const info = {
        durationMs: meta.durationMs ?? Math.round(pick.durationSec * 1000),
        width: meta.width,
        height: meta.height,
        createdAt: new Date(now()).toISOString(),
        sessionId,
        segments: pick.items.length,
      };
      fs.writeFileSync(metaPath(out), JSON.stringify(info));
      return { ok: true, clip: describe(name) };
    } catch (e) {
      try { fs.unlinkSync(out); } catch { /* yoksay */ }
      return error("CLIP_WRITE_FAILED", `${ERR.CLIP_WRITE_FAILED} ${e.message}`);
    } finally {
      fs.rmSync(work, { recursive: true, force: true });
    }
  }

  /**
   * Klibi sunucuya yükler (api.upload: jetonlu, 180 sn). Ağ hatasında bir kez yeniden dener.
   * → api sonucu { ok, data | error }
   */
  async function upload(api, { matchId, eventId, name, durationMs, width, height } = {}) {
    const mid = Number(matchId);
    const eid = Number(eventId);
    if (!Number.isInteger(mid) || mid <= 0 || !Number.isInteger(eid) || eid <= 0) return error("BAD_REQUEST");
    const clip = describe(name);
    if (!clip) return error("NOT_FOUND");
    const web = await webCopy(name).catch(() => null);
    const src = web || clip;
    if (src.sizeBytes > UPLOAD_LIMIT) return error("TOO_LARGE");
    const data = fs.readFileSync(src.path);
    const fields = {
      event_id: String(eid),
      duration_ms: String(Math.round(Number(durationMs ?? src.durationMs) || 0)),
      width: String(Math.round(Number(width ?? src.width) || 0)),
      height: String(Math.round(Number(height ?? src.height) || 0)),
    };
    const extraFiles = web?.posterPath ? [{ field: "poster", name: `gol-${mid}-${eid}.jpg`, mime: "image/jpeg", data: fs.readFileSync(web.posterPath) }] : [];
    const pathname = `/api/admin/live-streams/matches/${mid}/clips?event_id=${eid}`;
    const send = () => api.upload(pathname, buildClipMultipart({ fields, file: { name: `gol-${mid}-${eid}.mp4`, mime: "video/mp4", data }, extraFiles }), { timeout: UPLOAD_TIMEOUT_MS });
    let res = await send();
    // Ağ hatası ya da geçici sunucu hatası (Heroku 503 H12 zaman aşımı / 502 / 504): bir kez daha dene.
    // Sunucu aynı gol için yeniden yüklemeyi öncekinin yerine yazar (çift kayıt olmaz).
    if (!res.ok && !res.timeout && (res.offline || RETRY_STATUS.has(Number(res.error?.status)))) {
      await sleep(res.offline ? 2000 : 3000);
      res = await send();
    }
    if (res.ok) {
      try {
        const file = metaPath(clip.path);
        const meta = JSON.parse(fs.readFileSync(file, "utf8"));
        fs.writeFileSync(file, JSON.stringify({ ...meta, uploaded: { matchId: mid, eventId: eid, clipId: res.data?.id ?? null, url: res.data?.url ?? null, at: new Date(now()).toISOString() } }));
      } catch { /* bilgi dosyası yok */ }
    }
    return res;
  }

  return { save, list, remove, prune, describe, upload, webCopy, resolve: (name) => safeClipPath(clipsDir, name), dir: clipsDir };
}

module.exports = {
  STUDIO_SCHEME,
  CLIP_NAME,
  selectSegments,
  safeClipPath,
  clipUrl,
  nameFromUrl,
  parseRange,
  serveClip,
  buildClipMultipart,
  createClipStore,
  uploadClipPresigned,
  uploadGoalClip,
  CLIP_ERR,
  UPLOAD_LIMIT,
  webClipSize,
  buildWebClipArgs,
  buildWebPosterArgs,
  prepareWebClip,
};
