// Yayın Stüdyosu — ana süreç kaydı (IPC, izinler, ekran seçimi, klip şeması).
//
// main.js yalnız registerStudio(...) çağırır ve STUDIO_SCHEME'i ayrıcalıklı
// şemalar listesine ekler. Ayrıntılar: engine.js (ffmpeg süreci), angles.js
// (çok açılı kayıt), replays.js (tekrarlar), clips.js (eski gol klipleri),
// render.js + highlights.js (öne çıkanlar), scheme.js (elitlig-studio://),
// ffmpeg.js / ffargs.js (ikili ve komutlar), h264level.js (H.264 düzeyi).
//
// IPC (preload "studio"):
//   invoke: studio:info, studio:mediaAccess, studio:requestMediaAccess,
//           studio:listScreens, studio:selectScreen, studio:start, studio:stop,
//           studio:saveClip, studio:listClips, studio:deleteClip,
//           studio:uploadClip, studio:revealClip,
//           studio:angles:start, studio:angles:stop, studio:angles:status,
//           studio:saveReplay, studio:listReplays, studio:getReplay,
//           studio:updateReplay, studio:deleteReplay, studio:revealReplay,
//           studio:render:start, studio:render:finish, studio:render:cancel,
//           studio:uploadHighlight, studio:deleteHighlight
//   send:   studio:chunk (program parçası), studio:angleChunk { id, data },
//           studio:renderChunk { id, data } (yanıt yok)
//   olay:   studio:status, studio:restartRecorder, studio:angles:status,
//           studio:angles:restartRecorder, studio:render:progress,
//           studio:uploadProgress
//
// Depolama (userData): clips/ (eski klipler, 24 sa), replays/<kimlik>/ (7 gün),
// highlights/ (7 gün). Geçici parça halkaları: <temp>/elitlig-studio/.
"use strict";

const path = require("node:path");
const fs = require("node:fs");
const { createStudioEngine } = require("./engine");
const { createClipStore, STUDIO_SCHEME } = require("./clips");
const { createAngles } = require("./angles");
const { createReplayStore } = require("./replays");
const { createRenderer, pruneHighlights } = require("./render");
const { uploadHighlight, deleteHighlight } = require("./highlights");
const { serveStudio, REPLAY_ID } = require("./scheme");
const ff = require("./ffmpeg");

const DAY_MS = 24 * 3600 * 1000;

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

const MEDIA_STATES = new Set(["granted", "denied", "not-determined", "restricted"]);

function registerStudio({
  ipcMain, api, broadcast, app, electronSession, systemPreferences, desktopCapturer,
  powerSaveBlocker, protocol, shell, isOwnUrl, isSignedIn = () => true, log = () => {},
}) {
  const appRoot = path.join(__dirname, "..", "..");
  const tempRoot = path.join(app.getPath("temp"), "elitlig-studio");
  const clipsDir = path.join(app.getPath("userData"), "clips");
  const replaysDir = path.join(app.getPath("userData"), "replays");
  const highlightsDir = path.join(app.getPath("userData"), "highlights");

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

  const engine = createStudioEngine({ getFfmpeg, tempRoot: path.join(tempRoot, "program"), log });
  const angles = createAngles({ getFfmpeg, tempRoot: path.join(tempRoot, "angles"), log });
  let lastFfmpegPath = null;
  const ffmpegPath = () => lastFfmpegPath || "ffmpeg";
  const clips = createClipStore({ clipsDir, getFfmpegPath: ffmpegPath });
  const replays = createReplayStore({ replaysDir, getFfmpegPath: ffmpegPath });
  const renderer = createRenderer({ getFfmpeg, highlightsDir, tempRoot: path.join(tempRoot, "render"), log });
  const anyActive = () => engine.active() || angles.active() || renderer.active();
  // Açılışta: eski klipler (24 sa), tekrarlar ve öne çıkanlar (7 gün). Oturum sürerken silinmez.
  try { clips.prune(); } catch { /* yoksay */ }
  try { replays.prune({ isActive: anyActive }); } catch { /* yoksay */ }
  try { pruneHighlights(highlightsDir, { isActive: anyActive }); } catch { /* yoksay */ }
  const ensureFfmpegPath = async () => {
    if (lastFfmpegPath) return;
    const info = await getFfmpeg();
    lastFfmpegPath = info.path || lastFfmpegPath;
  };

  /* -------------------------- uyku engeli ve durum -------------------------- */

  let blockerId = null;
  const keepAwake = (on) => {
    if (on && blockerId === null) blockerId = powerSaveBlocker.start("prevent-display-sleep");
    if (!on && blockerId !== null) {
      try { powerSaveBlocker.stop(blockerId); } catch { /* yoksay */ }
      blockerId = null;
    }
  };
  // Parçaları yalnız oturumu başlatan pencere gönderebilir: program, açılar ve
  // her öne çıkan oturumu için ayrı sahip. Pencere gizlenince (⌘W / arka plan)
  // Chromium çizimi ~1 fps'e düşürür; herhangi bir oturum sürerken kapatılır.
  const owners = { program: null, angles: null };
  const renderOwners = new Map(); // renderId → webContents
  let unthrottled = new Set();
  const applyOwners = () => {
    const now = new Set([owners.program, owners.angles, ...renderOwners.values()].filter((wc) => wc && !wc.isDestroyed()));
    for (const wc of unthrottled) if (!now.has(wc) && !wc.isDestroyed()) wc.setBackgroundThrottling(true);
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

  protocol.handle(STUDIO_SCHEME, (request) => serveStudio({ clips: clipsDir, replays: replaysDir, highlights: highlightsDir }, request));

  /* ----------------------------------- IPC ----------------------------------- */

  ipcMain.handle("studio:info", async () => {
    const info = await getFfmpeg();
    lastFfmpegPath = info.path || lastFfmpegPath;
    return {
      ffmpeg: { available: info.available, version: info.version, path: info.path, source: info.source, encoders: { ...info.encoders }, encoder: info.encoder || null, error: info.error || null },
      platform: process.platform,
      arch: process.arch,
    };
  });
  ipcMain.handle("studio:mediaAccess", () => ({ camera: mediaStatus("camera"), microphone: mediaStatus("microphone"), screen: mediaStatus("screen") }));
  ipcMain.handle("studio:requestMediaAccess", async (_e, kind) => {
    if (kind !== "camera" && kind !== "microphone") return false;
    if (process.platform !== "darwin") return mediaStatus(kind) === "granted";
    try { return await systemPreferences.askForMediaAccess(kind); } catch { return false; }
  });
  ipcMain.handle("studio:listScreens", async () => {
    const sources = await desktopCapturer.getSources({ types: ["screen", "window"], thumbnailSize: { width: 320, height: 180 }, fetchWindowIcons: false });
    return sources.map((s) => {
      const thumbnail = s.thumbnail && !s.thumbnail.isEmpty() ? s.thumbnail.toDataURL() : null;
      return { id: s.id, name: s.name, kind: s.id.startsWith("screen:") ? "screen" : "window", displayId: s.display_id || null, thumbnail, thumbnailDataUrl: thumbnail };
    });
  });
  ipcMain.handle("studio:selectScreen", (_e, id) => {
    selectedSource = id ? String(id) : null;
    return true;
  });

  ipcMain.handle("studio:start", async (event, opts = {}) => {
    const res = await engine.start(opts || {});
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
    await engine.stop();
    releaseOwner("program");
    return true;
  });

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
    const res = await replays.save({ ...opts, sources, seconds: opts.seconds ?? 10, sessionId: engine.sessionId() });
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
    const res = await saveReplay({ seconds: seconds ?? 10, angles: ["program"], kind: "goal" });
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
    if (!isSignedIn()) return { ok: false, error: { message: "Oturum açık değil." } };
    const p = payload || {};
    await ensureFfmpegPath();
    // { matchId, eventId, replayId, angle = "program" } ya da eski { matchId, eventId, name }.
    if (p.replayId || REPLAY_ID.test(String(p.name || ""))) return replays.upload(api, { ...p, replayId: p.replayId || p.name });
    return clips.upload(api, p);
  });
  ipcMain.handle("studio:revealClip", (_e, name) => {
    const file = REPLAY_ID.test(String(name || "")) ? replayAsClip(replays.get(name))?.path : clips.resolve(name);
    if (!file || !fs.existsSync(file)) return false;
    shell.showItemInFolder(file);
    return true;
  });

  /* ------------------------------- öne çıkanlar ------------------------------- */

  ipcMain.handle("studio:render:start", async (event, opts = {}) => {
    const res = await renderer.start(opts || {});
    if (res.ok) { renderOwners.set(res.renderId, event.sender); applyOwners(); }
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
    try { return await renderer.finish(id); } finally { endRender(id); }
  });
  ipcMain.handle("studio:render:cancel", (_e, id) => {
    renderer.cancel(id);
    endRender(id);
    return true;
  });
  ipcMain.handle("studio:uploadHighlight", async (_e, payload = {}) => {
    if (!isSignedIn()) return { ok: false, error: { message: "Oturum açık değil." } };
    return uploadHighlight(api, { ...(payload || {}), highlightsDir }, { emitProgress: (p) => broadcast("studio:uploadProgress", p) });
  });
  ipcMain.handle("studio:deleteHighlight", async (_e, payload = {}) => {
    if (!isSignedIn()) return { ok: false, error: { message: "Oturum açık değil." } };
    return deleteHighlight(api, payload || {});
  });

  return {
    engine,
    angles,
    clips,
    replays,
    renderer,
    /** Uygulama kapanırken: ffmpeg süreçlerini öldür, parça klasörlerini sil. */
    dispose() {
      engine.dispose();
      angles.dispose();
      renderer.dispose();
      keepAwake(false);
      try { fs.rmSync(tempRoot, { recursive: true, force: true }); } catch { /* yoksay */ }
    },
  };
}

module.exports = { registerStudio, STUDIO_SCHEME };
