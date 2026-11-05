// Yayın Stüdyosu — ana süreç kaydı (IPC, izinler, ekran seçimi, klip şeması).
//
// main.js yalnız registerStudio(...) çağırır ve STUDIO_SCHEME'i ayrıcalıklı
// şemalar listesine ekler. Ayrıntılar: engine.js (ffmpeg süreci), clips.js
// (gol klipleri), ffmpeg.js (ikili ve komutlar).
//
// IPC (preload "studio"):
//   invoke: studio:info, studio:mediaAccess, studio:requestMediaAccess,
//           studio:listScreens, studio:selectScreen, studio:start, studio:stop,
//           studio:saveClip, studio:listClips, studio:deleteClip,
//           studio:uploadClip, studio:revealClip
//   send:   studio:chunk (MediaRecorder parçası, yanıt yok)
//   olay:   studio:status, studio:restartRecorder
"use strict";

const path = require("node:path");
const fs = require("node:fs");
const { createStudioEngine } = require("./engine");
const { createClipStore, serveClip, STUDIO_SCHEME } = require("./clips");
const ff = require("./ffmpeg");

const MEDIA_STATES = new Set(["granted", "denied", "not-determined", "restricted"]);

function registerStudio({
  ipcMain, api, broadcast, app, electronSession, systemPreferences, desktopCapturer,
  powerSaveBlocker, protocol, shell, isOwnUrl, isSignedIn = () => true, log = () => {},
}) {
  const appRoot = path.join(__dirname, "..", "..");
  const tempRoot = path.join(app.getPath("temp"), "elitlig-studio");
  const clipsDir = path.join(app.getPath("userData"), "clips");

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

  const engine = createStudioEngine({ getFfmpeg, tempRoot, log });
  let lastFfmpegPath = null;
  const clips = createClipStore({ clipsDir, getFfmpegPath: () => lastFfmpegPath || "ffmpeg" });
  try { clips.prune(); } catch { /* yoksay */ }

  /* -------------------------- uyku engeli ve durum -------------------------- */

  let blockerId = null;
  const keepAwake = (on) => {
    if (on && blockerId === null) blockerId = powerSaveBlocker.start("prevent-display-sleep");
    if (!on && blockerId !== null) {
      try { powerSaveBlocker.stop(blockerId); } catch { /* yoksay */ }
      blockerId = null;
    }
  };
  let ownerId = null; // parçaları yalnız yayını başlatan pencere gönderebilir
  let owner = null;
  // Pencere gizlenince (⌘W / arka plan) Chromium çizimi ~1 fps'e düşürür; yayın sürerken kapatılır.
  const setOwner = (wc) => {
    if (owner && owner !== wc && !owner.isDestroyed()) owner.setBackgroundThrottling(true);
    owner = wc;
    ownerId = wc ? wc.id : null;
    if (wc && !wc.isDestroyed()) wc.setBackgroundThrottling(false);
  };
  const releaseOwner = () => {
    if (owner && !owner.isDestroyed()) owner.setBackgroundThrottling(true);
    owner = null;
    ownerId = null;
  };
  engine.events.on("status", (st) => broadcast("studio:status", st));
  engine.events.on("restartRecorder", (payload) => broadcast("studio:restartRecorder", payload));
  engine.events.on("ended", () => { keepAwake(false); releaseOwner(); });

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

  const mediaStatus = (kind) => {
    if (process.platform !== "darwin" && process.platform !== "win32") return "granted";
    try {
      const st = systemPreferences.getMediaAccessStatus(kind);
      return MEDIA_STATES.has(st) ? st : st === "unknown" ? "not-determined" : "granted";
    } catch {
      return "not-determined";
    }
  };

  /* ---------------------------------- şema ---------------------------------- */

  protocol.handle(STUDIO_SCHEME, (request) => serveClip(clipsDir, request));

  /* ----------------------------------- IPC ----------------------------------- */

  ipcMain.handle("studio:info", async () => {
    const info = await getFfmpeg();
    lastFfmpegPath = info.path || lastFfmpegPath;
    return {
      ffmpeg: { available: info.available, version: info.version, path: info.path, source: info.source, encoders: { ...info.encoders }, error: info.error || null },
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
      setOwner(event.sender);
      keepAwake(true);
      const info = await getFfmpeg();
      lastFfmpegPath = info.path;
    }
    return res;
  });
  ipcMain.on("studio:chunk", (event, data) => {
    if (ownerId !== null && event.sender.id !== ownerId) return;
    engine.pushChunk(data);
  });
  ipcMain.handle("studio:stop", async () => {
    await engine.stop();
    keepAwake(false);
    releaseOwner();
    return true;
  });

  ipcMain.handle("studio:saveClip", async (_e, { seconds } = {}) => {
    const sources = engine.clipSources();
    if (!sources) return { ok: false, error: { code: "NOT_STREAMING", message: "Klip için yayın ya da kayıt sürüyor olmalı." } };
    return clips.save({ sources, seconds: seconds ?? 10, sessionId: engine.sessionId() });
  });
  ipcMain.handle("studio:listClips", () => clips.list());
  ipcMain.handle("studio:deleteClip", (_e, name) => clips.remove(name));
  ipcMain.handle("studio:uploadClip", async (_e, payload = {}) => {
    if (!isSignedIn()) return { ok: false, error: { message: "Oturum açık değil." } };
    return clips.upload(api, payload || {});
  });
  ipcMain.handle("studio:revealClip", (_e, name) => {
    const file = clips.resolve(name);
    if (!file || !fs.existsSync(file)) return false;
    shell.showItemInFolder(file);
    return true;
  });

  return {
    engine,
    clips,
    /** Uygulama kapanırken: ffmpeg'i öldür, parça klasörünü sil. */
    dispose() {
      engine.dispose();
      keepAwake(false);
      try { fs.rmSync(tempRoot, { recursive: true, force: true }); } catch { /* yoksay */ }
    },
  };
}

module.exports = { registerStudio, STUDIO_SCHEME };
