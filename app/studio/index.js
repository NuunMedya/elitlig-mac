// Yayın Stüdyosu — ana süreç kaydı (IPC, izinler, ekran seçimi, klip şeması).
//
// main.js yalnız registerStudio(...) çağırır ve STUDIO_SCHEME'i ayrıcalıklı
// şemalar listesine ekler. Ayrıntılar: engine.js (ffmpeg süreci), angles.js
// (çok açılı kayıt), replays.js (tekrarlar), clips.js (eski gol klipleri),
// render.js + highlights.js (öne çıkanlar), scheme.js (elitlig-studio://),
// ffmpeg.js / ffargs.js (ikili ve komutlar), h264level.js (H.264 düzeyi).
//
// 2.11: angles.js (H.264 kopya kipi), diag.js (tanılama günlüğü),
// localrecord.js (yerel tam kayıt), interview.js (röportaj), led.js (LED çıkışı).
//
// IPC (preload "studio"):
//   invoke: studio:info, studio:mediaAccess, studio:requestMediaAccess,
//           studio:listScreens, studio:selectScreen, studio:start, studio:stop,
//           studio:restartEncoder (reason, { videoCopy? }), studio:health, studio:network (RTMP aktarıcısı, relay.js),
//           studio:saveClip, studio:listClips, studio:deleteClip,
//           studio:uploadClip, studio:uploadThrottle (yayın öncelikli hız / duraklat / iptal), studio:revealClip,
//           studio:angles:start, studio:angles:stop, studio:angles:status,
//           studio:saveReplay, studio:listReplays, studio:getReplay,
//           studio:updateReplay, studio:deleteReplay, studio:revealReplay,
//           studio:render:start, studio:render:finish, studio:render:cancel,
//           studio:uploadHighlight, studio:deleteHighlight,
//           studio:diagnostics (→ { …, uploads: Yükleme günlüğü }), studio:clearUploadLog,
//           studio:revealDiagnostics,
//           studio:recordDir, studio:chooseRecordDir, studio:revealLocal,
//           studio:interview:start, studio:interview:stop, studio:interview:status,
//           studio:interview:list, studio:interview:delete, studio:interview:upload,
//           studio:interview:reveal,
//           studio:displays, studio:led:open, studio:led:close, studio:led:status,
//           studio:led:getState,
//           studio:media:allow (preload: webUtils yolu), studio:media:pick (dosya penceresi),
//           studio:media:check, studio:media:forget  (media.js — kalıcı yerel dosya kaynakları),
//           studio:live:* (live/index.js — telefon kamerası, RTMP / SRT girişi, ağ akışı, web sayfası)
//   send:   studio:chunk (program parçası), studio:reportStats (arayüz kodlama sayaçları), studio:angleChunk { id, data },
//           studio:renderChunk { id, data }, studio:led:sendState (yanıt yok)
//   olay:   studio:status, studio:restartRecorder, studio:angles:status,
//           studio:angles:restartRecorder, studio:render:progress,
//           studio:uploadProgress (kind: "highlight" | "interview"),
//           studio:localRecord, studio:interview:status, studio:displays:changed,
//           studio:led:status, studio:led:state (yalnız LED penceresine)
//
// Depolama (userData): clips/ (eski klipler, 24 sa), replays/<kimlik>/ (7 gün),
// highlights/ (7 gün), interviews/ (7 gün), logs/studio-*.log (son 20),
// studio-settings.json (son kayıt klasörü), studio-media.json (seçilen yerel dosyaların izin listesi). Geçici parça halkaları:
// <temp>/elitlig-studio/. Yerel tam kayıt: seçilen klasör (varsayılan
// ~/Movies/ElitLig, Windows: Videolar\ElitLig).
"use strict";

const path = require("node:path");
const fs = require("node:fs");
const { createStudioEngine } = require("./engine");
const { createClipStore, STUDIO_SCHEME, uploadGoalClip } = require("./clips");
const { createAngles } = require("./angles");
const { createReplayStore } = require("./replays");
const { createRenderer, pruneHighlights } = require("./render");
const { uploadHighlight, deleteHighlight, putFile } = require("./highlights");
const { createUploadGovernor } = require("./uploadgov");
const { createUploadLog, withUploadLog } = require("./uploadlog");
const { serveStudio, REPLAY_ID } = require("./scheme");
const { createDiagnostics } = require("./diag");
const { remuxParts, defaultRecordDir, createSettings } = require("./localrecord");
const { createInterviews } = require("./interview");
const { createLedManager } = require("./led");
const { createMediaLibrary, dialogFilters } = require("./media");
const ff = require("./ffmpeg");
const { registerLive } = require("./live");

const DAY_MS = 24 * 3600 * 1000;
const LIVE_UPLOAD_BYTES_PER_SEC = 250 * 1024; // ≈ 2 Mbit/sn: yayın sürerken gol klibi yüklemesi

/** Tekrarın program açısı → eski klip nesnesi (saveClip / listClips geriye uyumluluğu). */
function replayAsClip(replay) {
  const a = replay?.angles?.find((x) => x.angle === "program") || replay?.angles?.[0];
  if (!a) return null;
  return {
    path: a.path, url: a.url, name: replay.id, replayId: replay.id, angle: a.angle,
    durationMs: a.durationMs, width: a.width, height: a.height, sizeBytes: a.sizeBytes,
    createdAt: replay.createdAt, sessionId: replay.sessionId || null, uploaded: replay.uploaded || null,
    posterUrl: a.posterUrl || null, eventId: replay.eventId ?? null,
  };
}

/**
 * Chromium bayrakları (app hazır olmadan, main.js'in başında): pencere arkada,
 * örtülü ya da küçültülmüşken çizim / zamanlayıcı kısılmasın. Aksi halde
 * canvas.captureStream() kare üretmeyi bırakır, MediaRecorder parça yollamaz,
 * motor "takıldı" deyip ffmpeg'i yeniden başlatır ve YouTube yayını kopar.
 * Windows'ta örtülen pencerelerin çizimi ayrıca CalculateNativeWinOcclusion ile durur.
 */
const STUDIO_SWITCHES = Object.freeze(["disable-renderer-backgrounding", "disable-background-timer-throttling", "disable-backgrounding-occluded-windows"]);
const STUDIO_DISABLED_FEATURES = Object.freeze(["CalculateNativeWinOcclusion"]);
function applyStudioSwitches(app) {
  const cl = app?.commandLine;
  if (!cl) return;
  for (const sw of STUDIO_SWITCHES) cl.appendSwitch(sw);
  const existing = typeof cl.getSwitchValue === "function" ? cl.getSwitchValue("disable-features") : "";
  const features = [...new Set([...String(existing || "").split(",").filter(Boolean), ...STUDIO_DISABLED_FEATURES])];
  cl.appendSwitch("disable-features", features.join(","));
}

const MEDIA_STATES = new Set(["granted", "denied", "not-determined", "restricted"]);

function registerStudio({
  ipcMain, api, broadcast, app, electronSession, systemPreferences, desktopCapturer,
  powerSaveBlocker, protocol, shell, isOwnUrl, isSignedIn = () => true, log = () => {},
  dialog = null, screen = null, BrowserWindow = null, loadRenderer = null, preloadPath = null, powerMonitor = null,
  siteOrigin = "https://elitlig.com", apiOrigin = null, globalShortcut = null,
}) {
  const appRoot = path.join(__dirname, "..", "..");
  const tempRoot = path.join(app.getPath("temp"), "elitlig-studio");
  const clipsDir = path.join(app.getPath("userData"), "clips");
  const replaysDir = path.join(app.getPath("userData"), "replays");
  const highlightsDir = path.join(app.getPath("userData"), "highlights");
  const interviewsDir = path.join(app.getPath("userData"), "interviews");
  const logsDir = path.join(app.getPath("userData"), "logs");
  const settings = createSettings(path.join(app.getPath("userData"), "studio-settings.json"));
  const diagnostics = createDiagnostics({ dir: logsDir, header: { app: app.getVersion?.(), platform: process.platform, arch: process.arch } });
  // Yükleme günlüğü: her yükleme denemesi (uç, durum, sunucu hata kodu); userData/logs/uploads.json.
  // Açık bir tanılama günlüğü varsa oraya da satır düşer.
  const uploadLog = createUploadLog({
    file: path.join(logsDir, "uploads.json"),
    onRecord: (e) => {
      if (diagnostics.logPath()) diagnostics.write("yükleme", `${e.kind || "?"} ${e.method || ""} ${e.endpoint || ""} → ${e.ok ? "tamam" : "failed"}${e.status ? ` (HTTP ${e.status})` : ""}${e.code ? ` ${e.code}` : ""}`, e.ok ? undefined : { message: e.message });
    },
  });
  const uploadApi = withUploadLog(api, uploadLog);
  const loggedPut = withUploadLog.put(putFile, uploadLog);
  // [gol-klip] Yayın öncelikli yükleme: arayüz yayın sağlığına göre hız / duraklatma gönderir.
  const uploadGov = createUploadGovernor();
  /** Sunucuya hiç gitmeden düşen deneme (maç / olay yok, dosya yok, oturum kapalı …) da günlüğe. */
  const trackUpload = async (kind, endpoint, payload, fn) => {
    const before = uploadLog.size();
    let res;
    try { res = await fn(); } catch (e) { res = { ok: false, error: { code: "INTERNAL", message: e.message } }; }
    if (uploadLog.size() === before && !res?.ok) {
      uploadLog.record({ kind, method: "IPC", endpoint, ok: false, local: true, code: res?.error?.code || null, message: res?.error?.message || null, matchId: payload?.matchId, eventId: payload?.eventId });
    }
    return res;
  };
  const signedOut = () => ({ ok: false, error: { code: "SIGNED_OUT", message: "Oturum açık değil." } });

  // Önceki çalıştırmadan kalan parça klasörleri (çökme / zorla kapatma).
  try { fs.rmSync(tempRoot, { recursive: true, force: true }); } catch { /* yoksay */ }

  /* --------------------------------- ffmpeg --------------------------------- */

  let probePromise = null;
  const getFfmpeg = () => {
    if (!probePromise) {
      const candidate = ff.resolveFfmpeg({ appRoot, resourcesPath: app.isPackaged ? process.resourcesPath : null });
      probePromise = ff.probeFfmpeg(candidate).then((info) => {
        log("studio: ffmpeg", { path: info.path, source: info.source, version: info.version, encoders: info.encoders, available: info.available });
        if (!info.available) probePromise = null; // bir sonraki istekte yeniden aransın
        return info;
      });
    }
    return probePromise;
  };

  let lastFfmpegPath = null;
  const ffmpegPath = () => lastFfmpegPath || "ffmpeg";
  const engine = createStudioEngine({
    getFfmpeg, tempRoot: path.join(tempRoot, "program"), log, diag: diagnostics,
    qualityTuning: true,
    remuxLocal: ({ parts, outFile, ffmpegPath: bin }) => remuxParts({ parts, outFile, ffmpegPath: bin || ffmpegPath() }),
  });
  const angles = createAngles({ getFfmpeg, tempRoot: path.join(tempRoot, "angles"), log, diag: diagnostics });
  const interviews = createInterviews({ engine, interviewsDir, getFfmpegPath: ffmpegPath, log });
  // Yayın durunca süren röportajlar parça klasörü silinmeden önce bitirilir.
  engine.setBeforeCleanup(() => interviews.finalizeAll("SESSION_ENDED"));
  const clips = createClipStore({ clipsDir, getFfmpegPath: ffmpegPath });
  const replays = createReplayStore({ replaysDir, getFfmpegPath: ffmpegPath });
  const renderer = createRenderer({ getFfmpeg, highlightsDir, tempRoot: path.join(tempRoot, "render"), log });
  const anyActive = () => engine.active() || angles.active() || renderer.active() || interviews.status().length > 0;
  // Açılışta: eski klipler (24 sa), tekrarlar ve öne çıkanlar (7 gün). Oturum sürerken silinmez.
  try { clips.prune(); } catch { /* yoksay */ }
  try { replays.prune({ isActive: anyActive }); } catch { /* yoksay */ }
  try { pruneHighlights(highlightsDir, { isActive: anyActive }); } catch { /* yoksay */ }
  try { interviews.prune({ isActive: anyActive }); } catch { /* yoksay */ }
  const ensureFfmpegPath = async () => {
    if (lastFfmpegPath) return;
    const info = await getFfmpeg();
    lastFfmpegPath = info.path || lastFfmpegPath;
  };

  /* -------------------------- uyku engeli ve durum -------------------------- */

  // Oturum sürerken: uygulama askıya alınmaz (App Nap / sistem uykusu: zamanlayıcılar ve
  // ağ durmasın) ve — kapatılmadıysa (start({ keepDisplayAwake: false })) — ekran da uyumaz
  // (ekran uyuyunca bazı Mac'lerde tuval çizimi durur).
  const blockers = { app: null, display: null };
  let keepDisplayAwake = true;
  const blocker = (kind, type, on) => {
    if (on && blockers[kind] === null) {
      try { blockers[kind] = powerSaveBlocker.start(type); } catch { /* yoksay */ }
    }
    if (!on && blockers[kind] !== null) {
      try { powerSaveBlocker.stop(blockers[kind]); } catch { /* yoksay */ }
      blockers[kind] = null;
    }
  };
  const keepAwake = (on) => {
    blocker("app", "prevent-app-suspension", on);
    blocker("display", "prevent-display-sleep", on && keepDisplayAwake);
  };
  // Parçaları yalnız oturumu başlatan pencere gönderebilir: program, açılar ve
  // her öne çıkan oturumu için ayrı sahip. Pencere gizlenince (⌘W / arka plan)
  // Chromium çizimi ~1 fps'e düşürür; herhangi bir oturum sürerken kapatılır.
  const owners = { program: null, angles: null };
  const renderOwners = new Map(); // renderId → webContents
  let unthrottled = new Set();
  const applyOwners = () => {
    const now = new Set([owners.program, owners.angles, ...renderOwners.values()].filter((wc) => wc && !wc.isDestroyed()));
    // Kısma oturum bitince de geri AÇILMAZ: ana pencere zaten backgroundThrottling: false
    // ile açılır (main.js); yeniden açmak sonraki yayının ilk saniyelerinde çizimi kısabilir.
    for (const wc of now) if (!unthrottled.has(wc)) wc.setBackgroundThrottling(false);
    unthrottled = now;
    keepAwake(anyActive() || now.size > 0);
  };
  const setOwner = (kind, wc) => { owners[kind] = wc || null; applyOwners(); };
  const releaseOwner = (kind = "program") => setOwner(kind, null);
  const ownerOk = (wc, sender) => !wc || wc.isDestroyed() || wc.id === sender.id;

  engine.events.on("status", (st) => broadcast("studio:status", st));
  engine.events.on("restartRecorder", (payload) => broadcast("studio:restartRecorder", payload));
  engine.events.on("ended", () => releaseOwner("program"));
  const localFiles = new Set(); // revealLocal yalnız bu oturumda yazılan kayıtları gösterir
  engine.events.on("local", (job) => {
    for (const f of [job.path, job.mkvPath, job.mp4Path, ...(job.parts || [])]) if (f) localFiles.add(path.resolve(f));
    broadcast("studio:localRecord", { state: job.state, sessionId: job.sessionId, path: job.path, mp4Path: job.mp4Path, parts: job.parts, bytes: job.bytes, error: job.error || null });
  });
  interviews.events.on("status", (st) => broadcast("studio:interview:status", st));
  angles.events.on("status", (list) => {
    broadcast("studio:angles:status", list);
    if (!angles.active() && owners.angles) releaseOwner("angles");
  });
  angles.events.on("restartRecorder", (payload) => broadcast("studio:angles:restartRecorder", payload));
  renderer.events.on("progress", (p) => broadcast("studio:render:progress", p));

  /* ------------------------------ izinler (macOS) ------------------------------ */

  const ownContents = (wc) => {
    try { return Boolean(wc) && !wc.isDestroyed() && isOwnUrl(wc.getURL()); } catch { return false; }
  };
  const ses = electronSession.defaultSession;
  // Kendi arayüzümüz: önceki varsayılan davranış (izin ver) korunur; kamera /
  // mikrofon ("media") yalnız video+ses türleri için. Dış kaynaklara izin yok.
  ses.setPermissionRequestHandler((wc, permission, callback, details = {}) => {
    const own = isOwnUrl(details.requestingUrl || "") || ownContents(wc);
    if (!own) return callback(false);
    if (permission === "media") {
      const types = Array.isArray(details.mediaTypes) ? details.mediaTypes : [];
      return callback(types.every((t) => t === "video" || t === "audio"));
    }
    return callback(true);
  });
  ses.setPermissionCheckHandler((wc, permission, requestingOrigin, details = {}) => {
    const own = isOwnUrl(requestingOrigin || "") || isOwnUrl(details.requestingUrl || "") || ownContents(wc);
    if (!own) return false;
    if (permission === "media") return !details.mediaType || details.mediaType === "video" || details.mediaType === "audio" || details.mediaType === "unknown";
    return true;
  });

  // getDisplayMedia: arayüz kaynağı kendisi seçer (studio.selectScreen), sistem seçicisi açılmaz.
  let selectedSource = null;
  ses.setDisplayMediaRequestHandler((request, callback) => {
    const origin = request.securityOrigin || request.frame?.url || "";
    if (!isOwnUrl(origin) && !isOwnUrl(request.frame?.url || "")) { callback({}); return; }
    desktopCapturer.getSources({ types: ["screen", "window"], thumbnailSize: { width: 0, height: 0 } })
      .then((sources) => {
        const source = sources.find((s) => s.id === selectedSource) || sources.find((s) => s.id.startsWith("screen:")) || sources[0];
        // audio verilmez (sistem sesi istenmiyor); kaynak bir kez kullanılır.
        if (source) callback({ video: source }); else callback({});
      })
      .catch(() => callback({}));
  }, { useSystemPicker: false });

  // Sistem izin durumu yalnız macOS'ta sorulur. Windows'ta (ve Linux'ta) "granted"
  // döner: izin Chromium'un istemi ve Windows Gizlilik ayarlarıyla (Kamera /
  // Mikrofon → Masaüstü uygulamaları) yönetilir; getUserMedia hatası arayüzde gösterilir.
  const mediaStatus = (kind) => {
    if (process.platform !== "darwin") return "granted";
    try {
      const st = systemPreferences.getMediaAccessStatus(kind);
      return MEDIA_STATES.has(st) ? st : st === "unknown" ? "not-determined" : "granted";
    } catch {
      return "not-determined";
    }
  };

  /* ---------------------------------- şema ---------------------------------- */

  // Kullanıcının seçtiği yerel dosyalar (video / görsel / ses kaynakları): kalıcı izin listesi.
  const mediaLib = createMediaLibrary({ file: path.join(app.getPath("userData"), "studio-media.json"), scheme: STUDIO_SCHEME });
  protocol.handle(STUDIO_SCHEME, (request) => serveStudio({ clips: clipsDir, replays: replaysDir, highlights: highlightsDir, interviews: interviewsDir, media: mediaLib.resolve }, request));

  /* ----------------------------------- IPC ----------------------------------- */

  ipcMain.handle("studio:info", async () => {
    const info = await getFfmpeg();
    lastFfmpegPath = info.path || lastFfmpegPath;
    return {
      ffmpeg: { available: info.available, version: info.version, path: info.path, source: info.source, encoders: { ...info.encoders }, encoder: info.encoder || null, error: info.error || null },
      platform: process.platform,
      arch: process.arch,
      // Yerel kaydı yayından farklı kalitede (ikinci kodlayıcı) yazabilir mi: yalnız donanım kodlayıcıda.
      localQuality: { supported: Boolean(info.available && ff.isHardwareEncoder(info.encoder)), encoder: info.encoder || null },
      // Arayüzün özellik denetimi: yerel kaydın ayrı kalitesi (localRecord.videoBitrateKbps / height / fps),
      // kodlayıcı tercihi (encoderPreference), anahtar kare aralığı (keyframeSec), yükleme günlüğü.
      features: { localRecordQuality: true, localRecordQualityHardware: Boolean(info.available && ff.isHardwareEncoder(info.encoder)), encoderPreference: true, keyframeSec: true, audioBitrate: true, uploadLog: true, videoCopy: true, health: true },
    };
  });
  ipcMain.handle("studio:mediaAccess", () => ({ camera: mediaStatus("camera"), microphone: mediaStatus("microphone"), screen: mediaStatus("screen") }));
  ipcMain.handle("studio:requestMediaAccess", async (_e, kind) => {
    if (kind !== "camera" && kind !== "microphone") return false;
    if (process.platform !== "darwin") return mediaStatus(kind) === "granted";
    try { return await systemPreferences.askForMediaAccess(kind); } catch { return false; }
  });
  // opts.thumbnails === false: küçük resimsiz (açılışta pencereyi adıyla yeniden bulmak için, hızlı).
  ipcMain.handle("studio:listScreens", async (_e, opts) => {
    const thumbs = opts?.thumbnails !== false;
    const sources = await desktopCapturer.getSources({ types: ["screen", "window"], thumbnailSize: thumbs ? { width: 320, height: 180 } : { width: 0, height: 0 }, fetchWindowIcons: false });
    return sources.map((s) => {
      const thumbnail = thumbs && s.thumbnail && !s.thumbnail.isEmpty() ? s.thumbnail.toDataURL() : null;
      return { id: s.id, name: s.name, kind: s.id.startsWith("screen:") ? "screen" : "window", displayId: s.display_id || null, thumbnail, thumbnailDataUrl: thumbnail };
    });
  });
  ipcMain.handle("studio:selectScreen", (_e, id) => {
    selectedSource = id ? String(id) : null;
    return true;
  });

  const recordDir = () => settings.get("recordDir") || defaultRecordDir(app);

  ipcMain.handle("studio:start", async (event, opts = {}) => {
    const o = { ...(opts || {}) };
    if (o.localRecord?.enabled) {
      const dir = o.localRecord.dir ? String(o.localRecord.dir) : recordDir();
      const lr = o.localRecord;
      // Ayrı kalite (isteğe bağlı): { videoBitrateKbps?, height?, fps?, allowSoftware? } — engine.normalizeLocal.
      o.localRecord = {
        enabled: true, dir, name: lr.name ?? o.matchLabel ?? o.matchName ?? o.matchId ?? null,
        ...(lr.videoBitrateKbps != null ? { videoBitrateKbps: lr.videoBitrateKbps } : {}),
        ...(lr.height != null ? { height: lr.height } : {}),
        ...(lr.fps != null ? { fps: lr.fps } : {}),
        ...(lr.allowSoftware === true ? { allowSoftware: true } : {}),
      };
    } else {
      delete o.localRecord;
    }
    if (!engine.active()) diagnostics.begin({ recordOnly: !o.url, localRecord: Boolean(o.localRecord), matchId: o.matchId ?? null, backupUrl: Boolean(o.backupUrl) });
    // Ekran uykusu engeli (varsayılan açık); yedek giriş adresi (backupUrl) motora olduğu gibi gider.
    keepDisplayAwake = o.keepDisplayAwake !== false;
    delete o.keepDisplayAwake;
    const res = await engine.start(o);
    if (res.ok && o.localRecord) settings.set({ recordDir: o.localRecord.dir });
    if (res.ok) res.logPath = diagnostics.logPath();
    if (res.ok) {
      setOwner("program", event.sender);
      const info = await getFfmpeg();
      lastFfmpegPath = info.path || lastFfmpegPath;
    }
    return res;
  });
  ipcMain.on("studio:chunk", (event, data) => {
    if (!ownerOk(owners.program, event.sender)) return;
    engine.pushChunk(data);
  });
  ipcMain.handle("studio:stop", async () => {
    await ensureFfmpegPath();
    await engine.stop();
    releaseOwner("program");
    return true;
  });
  // Arayüz görüntü izinin takıldığını / kuyruğun şiştiğini gördü: kodlayıcı yeni
  // başlıkla yeniden başlar (restartRecorder olayı gelir), deneme sayılmaz.
  // options.videoCopy (boolean): kodlama yolu değişir (WebCodecs hatası → eski yol, yeniden kodlama).
  ipcMain.handle("studio:restartEncoder", (event, reason, options) => {
    if (!ownerOk(owners.program, event.sender)) return false;
    const o = options && typeof options.videoCopy === "boolean" ? { videoCopy: options.videoCopy } : null;
    return engine.restartEncoder(reason ? String(reason).slice(0, 60) : "RECORDER", o);
  });
  // Arayüzün kodlama sayaçları (5 sn'de bir; tanılama günlüğüne).
  ipcMain.on("studio:reportStats", (event, stats) => {
    if (!ownerOk(owners.program, event.sender)) return;
    engine.clientStats(stats);
  });
  // Yayın tanılama: ffmpeg + aktarıcı + arayüz sayaçları.
  ipcMain.handle("studio:health", () => engine.health());
  // RTMP aktarıcısının ayrıntılı durumu (status.network ile aynı) | null.
  ipcMain.handle("studio:network", () => engine.network());

  /* --------------------------------- açılar --------------------------------- */

  ipcMain.handle("studio:angles:start", async (event, opts = {}) => {
    const res = await angles.start(opts || {});
    if (angles.active()) setOwner("angles", event.sender);
    await ensureFfmpegPath();
    return res;
  });
  ipcMain.on("studio:angleChunk", (event, payload) => {
    if (!payload || !ownerOk(owners.angles, event.sender)) return;
    angles.pushChunk(payload.id, payload.data);
  });
  ipcMain.handle("studio:angles:stop", async (_e, id) => {
    await angles.stop(id === undefined || id === null ? undefined : String(id));
    if (!angles.active()) releaseOwner("angles");
    return true;
  });
  ipcMain.handle("studio:angles:status", () => angles.status());

  /* -------------------------------- tekrarlar -------------------------------- */

  /** angles: ["program", kaynakKimliği, …] ya da "all". */
  async function saveReplay(opts = {}) {
    await ensureFfmpegPath();
    const wanted = opts.angles === "all"
      ? ["program", ...angles.status().map((a) => a.id)]
      : (Array.isArray(opts.angles) && opts.angles.length ? opts.angles : ["program"]).map(String);
    const sources = [];
    const missing = [];
    for (const id of [...new Set(wanted)]) {
      if (id === "program") {
        const src = engine.clipSources();
        if (src) sources.push({ angle: "program", name: "Program", ...src });
        else missing.push({ angle: "program", reason: "NOT_RECORDING" });
      } else {
        const [src] = angles.clipSources([id]);
        if (src) sources.push(src);
        else missing.push({ angle: id, reason: "NOT_RECORDING" });
      }
    }
    if (!sources.length) return { ok: false, error: { code: "NOT_STREAMING", message: "Tekrar için yayın, kayıt ya da açı kaydı sürüyor olmalı." } };
    const res = await replays.save({ ...opts, sources, seconds: opts.seconds ?? 15, sessionId: engine.sessionId() });
    if (res.ok && missing.length) res.skipped = [...(res.skipped || []), ...missing];
    return res;
  }

  ipcMain.handle("studio:saveReplay", (_e, opts = {}) => saveReplay(opts || {}));
  ipcMain.handle("studio:listReplays", () => replays.list());
  ipcMain.handle("studio:getReplay", (_e, id) => replays.get(id));
  ipcMain.handle("studio:updateReplay", (_e, id, patch) => replays.update(id, patch || {}));
  ipcMain.handle("studio:deleteReplay", (_e, id) => replays.remove(id));
  ipcMain.handle("studio:revealReplay", (_e, id, angle = "program") => {
    const r = replays.get(id);
    const a = r?.angles.find((x) => x.angle === String(angle)) || r?.angles[0];
    if (!a?.path || !fs.existsSync(a.path)) return false;
    shell.showItemInFolder(a.path);
    return true;
  });

  /* ---------------------- klipler (geriye uyumlu: tekrar deposu) ---------------------- */

  ipcMain.handle("studio:saveClip", async (_e, { seconds } = {}) => {
    const res = await saveReplay({ seconds: seconds ?? 15, angles: ["program"], kind: "goal" });
    if (!res.ok) {
      if (res.error?.code === "NOT_STREAMING") return { ok: false, error: { code: "NOT_STREAMING", message: "Klip için yayın ya da kayıt sürüyor olmalı." } };
      return res;
    }
    return { ok: true, clip: replayAsClip(res.replay), replay: res.replay };
  });
  ipcMain.handle("studio:listClips", () => {
    const since = Date.now() - DAY_MS;
    const fromReplays = replays.list().filter((r) => Date.parse(r.createdAt) >= since).map(replayAsClip).filter(Boolean);
    return [...fromReplays, ...clips.list()].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  });
  ipcMain.handle("studio:deleteClip", (_e, name) => (REPLAY_ID.test(String(name || "")) ? replays.remove(name) : clips.remove(name)));
  ipcMain.handle("studio:uploadClip", async (_e, payload = {}) => {
    const p = payload || {};
    return trackUpload("clip", "studio:uploadClip", p, async () => {
      if (!isSignedIn()) return signedOut();
      await ensureFfmpegPath();
      // { matchId, eventId, replayId, angle = "program" } ya da eski { matchId, eventId, name }.
      // Ön imzalı yükleme (dosya doğrudan Spaces'e; Heroku'nun 30 sn sınırına takılmaz);
      // eski sunucuda çok parçalı yola düşer. Her adım yükleme günlüğüne yazılır.
      // [gol-klip] Canlı yayın sürerken klip ~2 Mbit/sn ile gönderilir: tam hızda PUT, yayınla
      // aynı yükleme hattını doldurup RTMP kuyruğunu taşırıyordu (gol anlarında kare atlama / kopma).
      // [yayın öncelikli] Hız her an değişebilir: arayüz (useReplays › uploadGuard) yayın
      // sağlığına göre studio:uploadThrottle ile sınır / duraklatma gönderir; arayüz sessizse
      // yayın sürerken güvenli sabit hız, yayın yoksa sınırsız.
      const onAirNow = () => engine.active() && engine.status()?.recordOnly === false;
      const putImpl = (url, o = {}) => loggedPut(url, { ...o, throttleStream: () => uploadGov.stream(() => (onAirNow() ? LIVE_UPLOAD_BYTES_PER_SEC : 0)) });
      return uploadGoalClip(uploadApi, p, {
        replays, clips, putImpl, isReplayId: (v) => REPLAY_ID.test(String(v || "")),
        emitProgress: (pr) => broadcast("studio:uploadProgress", pr),
      });
    });
  });
  /** [gol-klip] Yükleme hız sınırı: { kbps, paused } · { reset } · { cancel } · null → durum. */
  ipcMain.handle("studio:uploadThrottle", (_e, opts = null) => uploadGov.set(opts || null));
  ipcMain.handle("studio:revealClip", (_e, name) => {
    const file = REPLAY_ID.test(String(name || "")) ? replayAsClip(replays.get(name))?.path : clips.resolve(name);
    if (!file || !fs.existsSync(file)) return false;
    shell.showItemInFolder(file);
    return true;
  });

  /* ------------------------------- öne çıkanlar ------------------------------- */

  // Özet oluşturma hataları da günlüğe (kind "render"): "ilk denemede hata" nedeni görülsün.
  const logRender = (step, res, extra = {}) => {
    if (res?.ok) return;
    uploadLog.record({ kind: "render", method: "IPC", endpoint: `studio:render:${step}`, ok: false, local: true, code: res?.error?.code || null, message: res?.error?.message || null, ...extra });
  };
  ipcMain.handle("studio:render:start", async (event, opts = {}) => {
    let res;
    try { res = await renderer.start(opts || {}); } catch (e) { res = { ok: false, error: { code: "FAILED", message: e.message } }; }
    if (res.ok) { renderOwners.set(res.renderId, event.sender); applyOwners(); }
    logRender("start", res);
    return res;
  });
  ipcMain.on("studio:renderChunk", (event, payload) => {
    if (!payload) return;
    const wc = renderOwners.get(String(payload.id));
    if (!wc || !ownerOk(wc, event.sender)) return;
    renderer.pushChunk(payload.id, payload.data);
  });
  const endRender = (id) => { renderOwners.delete(String(id)); applyOwners(); };
  ipcMain.handle("studio:render:finish", async (_e, id) => {
    try {
      const res = await renderer.finish(id);
      logRender("finish", res);
      return res;
    } finally { endRender(id); }
  });
  ipcMain.handle("studio:render:cancel", (_e, id) => {
    renderer.cancel(id);
    endRender(id);
    return true;
  });
  ipcMain.handle("studio:uploadHighlight", async (_e, payload = {}) => trackUpload("highlight", "studio:uploadHighlight", payload, async () => {
    if (!isSignedIn()) return signedOut();
    return uploadHighlight(uploadApi, { ...(payload || {}), highlightsDir }, { putImpl: loggedPut, emitProgress: (p) => broadcast("studio:uploadProgress", p) });
  }));
  ipcMain.handle("studio:deleteHighlight", async (_e, payload = {}) => {
    if (!isSignedIn()) return signedOut();
    return deleteHighlight(uploadApi, payload || {});
  });

  /* --------------------------- tanılama ve yerel kayıt --------------------------- */

  ipcMain.handle("studio:diagnostics", () => {
    const snap = diagnostics.snapshot();
    // uploads: Yükleme günlüğü (en yeni önce) — { at, kind, method, endpoint, status, ok, code, message, durationMs, bytes, matchId, eventId, offline, local }
    return { logPath: snap.logPath, lastErrors: snap.lastErrors, ffmpegErrors: engine.lastErrors(), truncated: snap.truncated, uploads: uploadLog.list(), uploadLogPath: uploadLog.file };
  });
  ipcMain.handle("studio:clearUploadLog", () => { uploadLog.clear(); return true; });
  ipcMain.handle("studio:revealDiagnostics", () => {
    const file = diagnostics.logPath();
    if (file && fs.existsSync(file)) { shell.showItemInFolder(file); return true; }
    try { fs.mkdirSync(logsDir, { recursive: true }); shell.openPath(logsDir); return true; } catch { return false; }
  });
  ipcMain.handle("studio:recordDir", () => ({ dir: recordDir(), defaultDir: defaultRecordDir(app) }));
  ipcMain.handle("studio:chooseRecordDir", async (event) => {
    if (!dialog) return { ok: false, error: { code: "NO_DIALOG", message: "Klasör seçilemiyor." } };
    const current = recordDir();
    try { fs.mkdirSync(current, { recursive: true }); } catch { /* yoksay */ }
    const parent = BrowserWindow?.fromWebContents?.(event.sender) || undefined;
    const res = await dialog.showOpenDialog(parent, { title: "Yerel kayıt klasörü", defaultPath: current, buttonLabel: "Seç", properties: ["openDirectory", "createDirectory"] });
    if (res.canceled || !res.filePaths?.[0]) return { ok: false, canceled: true, dir: current };
    const dir = res.filePaths[0];
    try { fs.accessSync(dir, fs.constants.W_OK); } catch { return { ok: false, error: { code: "LOCAL_DIR", message: "Bu klasöre yazılamıyor. Başka bir klasör seçin." }, dir: current }; }
    settings.set({ recordDir: dir });
    return { ok: true, dir };
  });
  /* --------------------- kalıcı yerel dosyalar (media.js) --------------------- */
  const ownSender = (event) => {
    const url = event?.senderFrame?.url || event?.sender?.getURL?.() || "";
    return !isOwnUrl || isOwnUrl(url);
  };
  // Yol yalnız preload'daki webUtils.getPathForFile'dan gelir (kullanıcının seçtiği File).
  ipcMain.handle("studio:media:allow", (event, filePath) => (ownSender(event) ? mediaLib.allow(filePath) : null));
  ipcMain.handle("studio:media:pick", async (event, opts = {}) => {
    if (!dialog || !ownSender(event)) return { ok: false, error: { code: "NO_DIALOG", message: "Dosya seçilemiyor." } };
    const kind = ["video", "image", "audio"].includes(opts?.kind) ? opts.kind : null;
    const parent = BrowserWindow?.fromWebContents?.(event.sender) || undefined;
    const res = await dialog.showOpenDialog(parent, { title: "Dosya seç", buttonLabel: "Seç", filters: dialogFilters(kind), properties: opts?.multiple ? ["openFile", "multiSelections"] : ["openFile"] });
    if (res.canceled || !res.filePaths?.length) return { ok: false, canceled: true, files: [] };
    const files = res.filePaths.slice(0, 40).map((p) => mediaLib.allow(p)).filter(Boolean);
    return { ok: files.length > 0, files, ...(files.length ? {} : { error: { code: "MEDIA_TYPE", message: "Bu dosya türü desteklenmiyor." } }) };
  });
  ipcMain.handle("studio:media:check", (_e, ids) => mediaLib.check(ids));
  ipcMain.handle("studio:media:forget", (_e, id) => mediaLib.forget(String(id || "")));

  ipcMain.handle("studio:revealLocal", (_e, file) => {
    const target = file ? path.resolve(String(file)) : null;
    if (target && localFiles.has(target) && fs.existsSync(target)) { shell.showItemInFolder(target); return true; }
    const dir = recordDir();
    if (fs.existsSync(dir)) { shell.openPath(dir); return true; }
    return false;
  });

  /* -------------------------------- röportaj -------------------------------- */

  ipcMain.handle("studio:interview:start", (_e, opts = {}) => interviews.start(opts || {}));
  // id (start'ın döndürdüğü) ya da { id, matchId }; id yoksa tek süren röportaj bitirilir.
  ipcMain.handle("studio:interview:stop", async (_e, id) => {
    await ensureFfmpegPath();
    return interviews.stop(id);
  });
  ipcMain.handle("studio:interview:status", () => ({ active: interviews.status() }));
  ipcMain.handle("studio:interview:list", () => interviews.list());
  ipcMain.handle("studio:interview:delete", (_e, name) => interviews.remove(name));
  ipcMain.handle("studio:interview:reveal", (_e, name) => {
    const item = interviews.describe(name);
    if (!item?.path) return false;
    shell.showItemInFolder(item.path);
    return true;
  });
  ipcMain.handle("studio:interview:upload", async (_e, payload = {}) => trackUpload("interview", "studio:interview:upload", payload, async () => {
    if (!isSignedIn()) return signedOut();
    return interviews.upload(uploadApi, payload || {}, { putImpl: loggedPut, emitProgress: (p) => broadcast("studio:uploadProgress", p) });
  }));

  /* -------------------------------- LED çıkışı -------------------------------- */

  const led = screen && BrowserWindow ? createLedManager({ BrowserWindow, screen, loadRenderer, preloadPath, siteOrigin, apiOrigin, log, powerMonitor, globalShortcut }) : null;
  if (led) {
    led.events.on("status", (st) => broadcast("studio:led:status", st));
    led.events.on("displays", (list) => broadcast("studio:displays:changed", list));
  }
  const noLed = { ok: false, error: { code: "NO_LED", message: "LED çıkışı bu sürümde kullanılamıyor." } };
  ipcMain.handle("studio:displays", () => (led ? led.displays() : []));
  /**
   * LED'i aç. Seçilen ekran stüdyonun ekranıysa (ya da tek ekran) led.open önce
   * SHARED_DISPLAY döner: kullanıcıya ana süreçten, arayüzü bloklamadan (yayın
   * sürerken tuval çizimi durmasın) sorulur; onaylarsa normal pencere açılır.
   * → { ok, … } | { ok: false, canceled: true } | { ok: false, needsConfirm, error } (dialog yoksa)
   */
  let asking = null;
  ipcMain.handle("studio:led:open", async (event, opts = {}) => {
    if (!led) return noLed;
    const o = { ...(opts || {}) };
    const res = led.open(o);
    if (res.ok || !res.needsConfirm || !dialog?.showMessageBox) return res;
    if (asking) return { ok: false, canceled: true, error: { code: "BUSY", message: "LED sorusu zaten açık." } };
    const parent = BrowserWindow?.fromWebContents?.(event.sender) || undefined;
    asking = dialog.showMessageBox(parent, {
      type: "warning",
      buttons: ["Pencere olarak aç", "Vazgeç"],
      defaultId: 0,
      cancelId: 1,
      message: "LED çıkışı stüdyonun ekranında açılacak",
      detail: `${res.error.message}\n\nPencere Esc ya da ${process.platform === "darwin" ? "⌘⇧L" : "Ctrl+Shift+L"} ile kapanır; menüde "LED Çıkışını Kapat" da var.`,
    }).catch(() => ({ response: 1 }));
    let answer;
    try { answer = await asking; } finally { asking = null; }
    if (answer?.response !== 0) return { ok: false, canceled: true, error: { code: "CANCELED", message: "LED çıkışı açılmadı." } };
    return led.open({ ...o, confirmShared: true });
  });
  ipcMain.handle("studio:led:close", () => (led ? led.close("STUDIO") : false));
  ipcMain.handle("studio:led:status", () => (led ? led.status() : { open: false, displayId: null, mode: null, url: null }));
  ipcMain.handle("studio:led:getState", () => (led ? led.getState() : null));
  ipcMain.on("studio:led:sendState", (event, state) => {
    if (!led || !ownContents(event.sender)) return;
    led.sendState(state, event.sender);
  });

  // Canlı giriş kaynakları: telefon kamerası, RTMP / SRT girişi, ağ akışı, web sayfası (live/).
  const live = registerLive({ ipcMain, app, BrowserWindow, electronSession, getFfmpeg, ownContents, log });

  return {
    engine,
    live,
    angles,
    clips,
    replays,
    renderer,
    interviews,
    led,
    diagnostics,
    uploadLog,
    /** Uygulama kapanırken: ffmpeg süreçlerini öldür, parça klasörlerini sil. */
    dispose() {
      engine.dispose();
      live.dispose();
      angles.dispose();
      renderer.dispose();
      interviews.dispose();
      led?.dispose();
      uploadLog.flush();
      keepAwake(false);
      try { fs.rmSync(tempRoot, { recursive: true, force: true }); } catch { /* yoksay */ }
    },
  };
}

module.exports = { registerStudio, applyStudioSwitches, STUDIO_SWITCHES, STUDIO_SCHEME };
