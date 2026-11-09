// Yayın Stüdyosu — MÜZİK ÇALAR "YAYINA DA VER" (ana süreç).
//
// Sorun: YouTube IFrame oynatıcısı başka kökenden (youtube.com) gelir; sesi stüdyo
// penceresinin WebAudio karışımına (createMediaElementSource) BAĞLANAMAZ, doğrudan
// hoparlöre gider. Çözüm: müzik ayrı, GİZLİ bir pencerede (musichost.html) çalar ve o
// pencerenin SESİ Chromium'un sekme sesi yakalamasıyla alınır:
//   arayüz  studio:music:armCapture("frame")  →  getDisplayMedia({ video, audio })
//   ana süreç setDisplayMediaRequestHandler → { video: hostFrame, audio: hostFrame, enableLocalEcho: true }
// Gelen ses izi ("Tab audio") karıştırıcının "music" şeridine bağlanır (yayına gider);
// enableLocalEcho: hoparlörden de duyulmaya devam eder. Bu yol Chromium'un kendi sekme
// yakalamasıdır (işletim sistemi "loopback"i değil): Windows ve macOS'ta aynı çalışır,
// ekran kaydı izni istemez, yalnız müzik penceresinin sesini alır (başka ses karışmaz).
// "loopback" (yalnız Windows): bütün sistem sesi — yedek yol (yankı riski, arayüz uyarır).
//
// IPC
//   invoke studio:music:host { op: "cmd", deck, cmd, args } | { op: "close" }  → { ok }
//   invoke studio:music:armCapture (mode)   → { ok, mode } (sonraki getDisplayMedia bu kaynağı alır)
//   invoke studio:music:capability          → { platform, frameAudio, loopback }
//   invoke studio:music:oembed (url)        → { ok, title, author } (YouTube oEmbed; CSP arayüzde engeller)
//   invoke studio:music:playlist (listId)   → { ok, title, items: [{ videoId, title, durationSec }], more, source } (./ytplaylist)
//   olay   studio:music:hostEvent           (gizli pencereden: { deck, type: state|tick|error|ready, … })
const path = require("node:path");
const { createPlaylistFetcher } = require("./ytplaylist");

const HOST_FILE = path.join(__dirname, "musichost.html");
const HOST_PRELOAD = path.join(__dirname, "musichost-preload.js");
const ARM_TTL_MS = 15_000;
const YT_URL_RE = /^https?:\/\/(?:www\.|m\.|music\.)?(?:youtube\.com|youtu\.be|youtube-nocookie\.com)\//i;
const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

/** Sınanabilir: BrowserWindow / ipcMain / fetch dışarıdan. */
function createMusicHost({ BrowserWindow, ipcMain, fetchImpl = globalThis.fetch, platform = process.platform, now = () => Date.now(), log = () => {} } = {}) {
  let win = null;
  let loaded = null; // Promise<void>
  let target = null; // olayların gideceği arayüz webContents
  let armed = null; // { mode, at }
  const queue = [];

  const alive = () => Boolean(win) && !(win.isDestroyed?.());
  const forward = (msg) => {
    try { if (target && !target.isDestroyed?.()) target.send("studio:music:hostEvent", msg); } catch { /* yoksay */ }
  };

  function ensure(parent = null) {
    if (alive()) return loaded;
    if (!BrowserWindow) return Promise.reject(new Error("Müzik penceresi açılamıyor."));
    win = new BrowserWindow({
      show: false, width: 480, height: 270, skipTaskbar: true, focusable: false, title: "Elitlig müzik",
      ...(parent && !parent.isDestroyed?.() ? { parent } : {}),
      webPreferences: { preload: HOST_PRELOAD, contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: false, autoplayPolicy: "no-user-gesture-required" },
    });
    const wc = win.webContents;
    try {
      wc.setWindowOpenHandler?.(() => ({ action: "deny" }));
      wc.on?.("will-navigate", (e) => e.preventDefault());
      wc.setAudioMuted?.(false);
    } catch { /* yoksay */ }
    win.on?.("closed", () => { win = null; loaded = null; armed = null; forward({ type: "closed" }); });
    loaded = Promise.resolve(win.loadFile(HOST_FILE)).then(() => {
      while (queue.length && alive()) wc.send("musichost:cmd", queue.shift());
    });
    loaded.catch((e) => log("müzik penceresi", e?.message || String(e)));
    return loaded;
  }

  function send(msg, parent) {
    if (alive() && loaded) {
      loaded.then(() => { if (alive()) win.webContents.send("musichost:cmd", msg); }).catch(() => {});
      return Promise.resolve(loaded).then(() => ({ ok: true }));
    }
    queue.push(msg);
    return ensure(parent).then(() => ({ ok: true }));
  }

  function close() {
    queue.length = 0;
    armed = null;
    if (alive()) { try { win.destroy(); } catch { /* yoksay */ } }
    win = null;
    loaded = null;
  }

  /** setDisplayMediaRequestHandler'dan: kurulmuş bir müzik yakalaması varsa onu döndürür (bir kez). */
  function takeCapture() {
    const a = armed;
    armed = null;
    if (!a || now() - a.at > ARM_TTL_MS) return null;
    if (a.mode === "frame") return alive() ? { mode: "frame", frame: win.webContents.mainFrame } : null;
    if (a.mode === "loopback") return platform === "win32" ? { mode: "loopback" } : null;
    return null;
  }

  async function arm(mode, parent) {
    const m = mode === "loopback" ? "loopback" : "frame";
    if (m === "loopback" && platform !== "win32") return { ok: false, mode: m, error: "Sistem sesi yakalama yalnız Windows'ta." };
    if (m === "frame") { try { await ensure(parent); } catch (e) { return { ok: false, mode: m, error: e?.message || "Müzik penceresi açılamadı." }; } }
    armed = { mode: m, at: now() };
    return { ok: true, mode: m };
  }

  async function oembed(url) {
    const u = String(url || "").trim();
    const full = VIDEO_ID_RE.test(u) ? `https://www.youtube.com/watch?v=${u}` : u;
    if (!YT_URL_RE.test(full) || typeof fetchImpl !== "function") return { ok: false };
    try {
      const signal = typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(6000) : undefined;
      const res = await fetchImpl(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(full)}`, { signal });
      if (!res?.ok) return { ok: false, status: res?.status || 0 };
      const j = await res.json();
      return { ok: true, title: String(j?.title || "").slice(0, 120), author: String(j?.author_name || "").slice(0, 80) };
    } catch {
      return { ok: false };
    }
  }

  const playlist = createPlaylistFetcher({ fetchImpl });

  const capability = () => ({ platform, frameAudio: Boolean(BrowserWindow), loopback: platform === "win32" });

  function register() {
    if (!ipcMain) return;
    const parentOf = (event) => { try { return BrowserWindow?.fromWebContents?.(event.sender) || null; } catch { return null; } };
    ipcMain.handle("studio:music:host", (event, msg = {}) => {
      target = event.sender;
      if (msg?.op === "close") { close(); return { ok: true }; }
      if (msg?.op !== "cmd") return { ok: false };
      const cmd = { deck: msg.deck === "b" ? "b" : "a", cmd: String(msg.cmd || ""), args: msg.args && typeof msg.args === "object" ? msg.args : {} };
      return send(cmd, parentOf(event)).catch((e) => ({ ok: false, error: e?.message || "Müzik penceresi açılamadı." }));
    });
    ipcMain.handle("studio:music:armCapture", (event, mode) => { target = event.sender; return arm(mode, parentOf(event)); });
    ipcMain.handle("studio:music:capability", () => capability());
    ipcMain.handle("studio:music:oembed", (_e, url) => oembed(url));
    ipcMain.handle("studio:music:playlist", (_e, listId) => playlist(listId).catch((e) => ({ ok: false, error: e?.message || "Liste okunamadı." })));
    ipcMain.on("musichost:event", (event, msg) => {
      if (!alive() || event.sender !== win.webContents) return;
      if (msg && typeof msg === "object") forward(msg);
    });
  }

  return { register, ensure, send, close, arm, takeCapture, oembed, playlist, capability, get window() { return win; } };
}

module.exports = { createMusicHost, HOST_FILE, ARM_TTL_MS };
