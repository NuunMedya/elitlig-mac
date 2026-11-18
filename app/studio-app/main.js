// ELİTLİG STÜDYO — bağımsız yayın uygulaması (ana süreç). 2.36.0.
//
// Elitlig Araçlar ile AYNI depodan, aynı sürümle derlenir (build/studio-builder.json). Yalnız
// Yayın Stüdyosu'nun ihtiyacı olanı açar:
//   oturum (aynı sunucu, aynı giriş; "Elitlig Araçlar ile giriş" devri: app/studioLink.js),
//   API köprüsü (maç / canlı veri, YouTube, yüklemeler), Yayın Stüdyosu IPC'si (app/studio:
//   ffmpeg, motor, açılar, tekrarlar, öne çıkanlar, röportaj, LED çıkışı, canlı girişler, müzik
//   penceresi, panorama ağı), elitlig-media:// (armalar, logolar), görsel yükleme.
// AÇMAZ: araç takımı, yapılacaklar, ajanda, tablolar, tarayıcı, yönetim paneli, hızlı geçiş, raflar,
//   masaüstü widget'ları, hatırlatıcılar, menü çubuğu simgesi, sohbet bağlantısı (socket).
//
// Arayüz: renderer/dist/studio.html (renderer/src/studio-main.jsx — yalnız stüdyo ve ayarları).
// userData: <appData>/Elitlig Studyo (Elitlig Araçlar'dan ayrı; tek örnek kilidi de ayrı).
// İlk açılışta Elitlig Araçlar'ın stüdyo ayarları içe aktarılır (studioApp:importState).
"use strict";

const path = require("node:path");
const fs = require("node:fs");
const {
  app, BrowserWindow, Menu, shell, ipcMain, dialog, net, globalShortcut, safeStorage, powerMonitor, nativeTheme, screen, protocol,
  session: electronSession, systemPreferences, desktopCapturer, powerSaveBlocker,
} = require("electron");
const config = require("../config");
const { createSessionStore, sessionStatus, sessionEndsAt } = require("../session");
const { createApi } = require("../api");
const { accessFromUser } = require("../access");
const { buildMultipart, mimeOf } = require("../chat");
const { isAllowedExternal } = require("../links");
const { applyTestSession } = require("../testSession");
const { applyStudioSwitches, STUDIO_SCHEME } = require("../studio/switches");
const { installMediaPermissions } = require("../studio/permissions");
const { applyLaunchFlags, registerPerfIpc } = require("../perfFlags");
const { createCrashMonitor } = require("../crashMonitor");
const { MEDIA_PRIVILEGES, createMediaProxy } = require("../mediaProxy");
const studioLink = require("../studioLink");

const APP_NAME = "Elitlig Stüdyo";
const APP_ID = "com.elitlig.studyo";
const IS_MAC = process.platform === "darwin";

protocol.registerSchemesAsPrivileged([
  MEDIA_PRIVILEGES,
  { scheme: STUDIO_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true, bypassCSP: true } },
]);

app.setName(APP_NAME);
// Kendi veri klasörü: Elitlig Araçlar'ınkiyle karışmaz (oturum, tekrarlar, günlükler, localStorage).
app.setPath("userData", process.env.ELITLIG_USER_DATA || path.join(app.getPath("appData"), "Elitlig Studyo"));
const { store: perfFlags, launch: perfLaunch } = applyLaunchFlags(app, { dir: app.getPath("userData"), applySwitches: applyStudioSwitches });
if (process.platform === "win32") app.setAppUserModelId(APP_ID);

const RENDERER = path.join(__dirname, "..", "..", "renderer", "dist", "studio.html");
const DEV_URL = process.env.ELITLIG_STUDIO_RENDERER_URL || (process.env.ELITLIG_RENDERER_URL ? process.env.ELITLIG_RENDERER_URL.replace(/\/(index\.html)?$/, "/studio.html") : null);
const dataDir = () => app.getPath("userData");
const userAgent = () => `ElitligStudyo/${app.getVersion()} (${IS_MAC ? "Macintosh" : "Windows"}) ${config.USER_AGENT_MARK}/${app.getVersion()}`;

let mainWindow = null;
let quitting = false;
let sessionStore;
let api;
let studio = null;
let crashes = null;
let pendingHandoff = studioLink.handoffKeyFromArgv(process.argv);

const broadcast = (channel, payload) => {
  for (const win of BrowserWindow.getAllWindows()) if (!win.isDestroyed()) win.webContents.send(channel, payload);
};

/* --------------------------------- oturum --------------------------------- */

function authState() {
  const session = sessionStore.load();
  const status = sessionStatus(session, { days: config.SESSION_DAYS });
  if (status === "none" || status === "expired") return { signedIn: false, expired: status === "expired" };
  return { signedIn: true, user: session.user, access: accessFromUser(session.user, null), loginAt: session.loginAt, endsAt: sessionEndsAt(session, { days: config.SESSION_DAYS }), app: "studio" };
}

function signOutLocal(reason) {
  sessionStore.clear();
  api.clearCache();
  api.clearOutbox();
  broadcast("auth:changed", { signedIn: false, reason: reason || null });
}

async function login({ username, password }) {
  const result = await api.request({ method: "POST", path: "/api/users/login", body: { username: String(username || "").trim(), password, scope: "management", client: "desktop" }, cache: false, queue: false });
  if (!result.ok) return { ok: false, error: result.offline ? "İnternet bağlantısı yok. Giriş için bağlantı gerekir." : result.error?.message || "Giriş yapılamadı." };
  const { token, user } = result.data || {};
  if (!token || !user) return { ok: false, error: "Sunucu oturum bilgisi döndürmedi." };
  if (user.isManagement === false) return { ok: false, error: "Elitlig Stüdyo yönetim hesaplarına açıktır." };
  sessionStore.save({ token, user, loginAt: Date.now() });
  broadcast("auth:changed", { signedIn: true });
  return { ok: true, state: authState() };
}

async function logout() {
  await api.request({ method: "POST", path: "/api/users/logout", cache: false, queue: false }).catch(() => {});
  signOutLocal("logout");
}

async function keepSessionFresh() {
  const session = sessionStore.load();
  const status = sessionStatus(session, { days: config.SESSION_DAYS });
  if (status === "expired" && session) return signOutLocal("expired");
  if (status !== "refresh") return;
  const result = await api.request({ method: "POST", path: "/api/users/session/refresh", body: { client: "desktop" }, cache: false, queue: false });
  if (result.ok && result.data?.token) sessionStore.save({ ...session, token: result.data.token, user: result.data.user || session.user });
}

/** "Elitlig Araçlar ile giriş": Araçlar'ın yazdığı şifreli devri al (anahtar bağlantıda). */
function acceptHandoff(key) {
  if (!key || !sessionStore) return false;
  const s = studioLink.consumeHandoff({ dir: studioLink.sharedDir(app), keyHex: key });
  if (!s) return false;
  const cur = sessionStore.load();
  // Zaten geçerli bir oturum varsa ve aynı kullanıcıysa dokunulmaz.
  if (authState().signedIn && cur?.user?.id && cur.user.id === s.user?.id) return true;
  sessionStore.save(s);
  broadcast("auth:changed", { signedIn: true });
  return true;
}

function handleLink(url) {
  const key = studioLink.handoffKeyFromArgv([url]);
  if (key) { if (sessionStore) acceptHandoff(key); else pendingHandoff = key; }
  showMain();
}

/* -------------------------------- pencere -------------------------------- */

const isOwnUrl = (url) => {
  const s = String(url || "");
  if (s.startsWith("file:")) return true;
  if (!DEV_URL) return false;
  try { return new URL(s).origin === new URL(DEV_URL).origin; } catch { return false; }
};

const loadRenderer = (win, hash = "") => {
  if (DEV_URL) return win.loadURL(`${DEV_URL}${hash ? `#${hash}` : ""}`);
  return win.loadFile(RENDERER, hash ? { hash } : undefined);
};

const secureWebPreferences = () => ({ preload: path.join(__dirname, "..", "preload.js"), contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false });

function allowYoutubeEmbeds(ses) {
  ses.webRequest.onBeforeSendHeaders({ urls: ["https://www.youtube.com/embed/*", "https://www.youtube-nocookie.com/embed/*"] }, (details, callback) => {
    const headers = { ...details.requestHeaders };
    if (!headers.Referer && !headers.referer) headers.Referer = `${config.SITE_ORIGIN}/`;
    callback({ requestHeaders: headers });
  });
}

function guardNavigation(win) {
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^(https?|mailto|tel):/i.test(url)) shell.openExternal(url).catch(() => {});
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    if (url.startsWith("file:") || (DEV_URL && url.startsWith(DEV_URL))) return;
    event.preventDefault();
    if (/^(https?|mailto|tel):/i.test(url)) shell.openExternal(url).catch(() => {});
  });
  win.webContents.on("context-menu", (_event, params) => {
    if (!params.isEditable && !params.selectionText) return;
    const items = params.isEditable
      ? [{ role: "cut", label: "Kes" }, { role: "copy", label: "Kopyala" }, { role: "paste", label: "Yapıştır" }, { type: "separator" }, { role: "selectAll", label: "Tümünü seç" }]
      : [{ role: "copy", label: "Kopyala" }];
    Menu.buildFromTemplate(items).popup({ window: win });
  });
}

const STATE_FILE = () => path.join(dataDir(), "window-state.json");
const readWinState = () => { try { return JSON.parse(fs.readFileSync(STATE_FILE(), "utf8")); } catch { return {}; } };
const writeWinState = (patch) => { try { fs.writeFileSync(STATE_FILE(), JSON.stringify({ ...readWinState(), ...patch })); } catch { /* yoksay */ } };

function createMainWindow() {
  const saved = readWinState().bounds || {};
  const win = new BrowserWindow({
    title: APP_NAME,
    width: saved.width || 1440, height: saved.height || 900, x: saved.x, y: saved.y, minWidth: 1100, minHeight: 680, show: false,
    ...(IS_MAC ? { titleBarStyle: "hiddenInset", trafficLightPosition: { x: 14, y: 14 }, backgroundColor: "#0b0b10" } : { autoHideMenuBar: true, backgroundColor: "#0b0b10" }),
    icon: studioIconPath(),
    // Gizli / küçültülmüş / örtülüyken de program tuvali çizilsin (yayın kopmasın).
    webPreferences: { ...secureWebPreferences(), backgroundThrottling: false, autoplayPolicy: "no-user-gesture-required" },
  });
  mainWindow = win;
  guardNavigation(win);
  win.once("ready-to-show", () => { if (readWinState().maximized) win.maximize(); win.show(); });
  const saveBounds = () => { if (!win.isDestroyed()) writeWinState({ bounds: win.isMaximized() ? readWinState().bounds : win.getBounds(), maximized: win.isMaximized() }); };
  win.on("resized", saveBounds);
  win.on("moved", saveBounds);
  // Yayın / kayıt sürerken kapatma onaylı (yayın kopar).
  win.on("close", (event) => {
    saveBounds();
    if (quitting || !studio?.engine?.active?.()) return;
    event.preventDefault();
    confirmQuit();
  });
  win.on("closed", () => { if (mainWindow === win) mainWindow = null; });
  win.webContents.on("render-process-gone", (_e, d) => { if (d?.reason !== "clean-exit" && d?.reason !== "killed") setTimeout(() => { if (!win.isDestroyed()) win.reload(); }, 1000); });
  loadRenderer(win);
  return win;
}

let asking = false;
/** Yayın sürerken çıkış: sor; onaylanırsa çık. */
function confirmQuit() {
  if (asking) return;
  asking = true;
  dialog.showMessageBox(mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined, { type: "warning", buttons: ["Yayını bitir ve kapat", "Vazgeç"], defaultId: 1, cancelId: 1, message: "Yayın / kayıt sürüyor", detail: "Kapatırsanız yayın kopar ve kayıt durur." })
    .then(({ response }) => { asking = false; if (response === 0) { quitting = true; app.quit(); } })
    .catch(() => { asking = false; });
}

function showMain() {
  if (!app.isReady()) return;
  if (!mainWindow) createMainWindow();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function studioIconPath() {
  const candidates = app.isPackaged
    ? [path.join(process.resourcesPath, IS_MAC ? "icon.icns" : "studio-icon.ico"), path.join(process.resourcesPath, "studio-icon.png")]
    : [path.join(__dirname, "..", "..", "build", "studio-icon.png"), path.join(__dirname, "..", "..", "build", "icon.png")];
  return candidates.find((p) => { try { return fs.existsSync(p); } catch { return false; } }) || undefined;
}

/* ---------------------------------- menü ---------------------------------- */

async function reimportFromAraclar() {
  const parent = mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined;
  if (studio?.engine?.active?.()) { dialog.showMessageBox(parent, { type: "info", message: "Önce yayını / kaydı bitirin.", buttons: ["Tamam"] }).catch(() => {}); return; }
  if (!studioLink.readStudioExport(studioLink.sharedDir(app))) {
    dialog.showMessageBox(parent, { type: "info", message: "Elitlig Araçlar'dan dışa aktarılmış stüdyo ayarı bulunamadı.", detail: "Elitlig Araçlar'ı (2.36 ya da yenisi) bir kez açın; stüdyo ayarları ortak klasöre yazılır.", buttons: ["Tamam"] }).catch(() => {});
    return;
  }
  const { response } = await dialog.showMessageBox(parent, {
    type: "question", buttons: ["İçe aktar", "Vazgeç"], defaultId: 0, cancelId: 1,
    message: "Elitlig Araçlar'daki stüdyo ayarları içe aktarılsın mı?",
    detail: "Sahneler, yerleşim, kısayollar, makrolar ve ön ayarlar Elitlig Araçlar'dakilerle DEĞİŞTİRİLİR. Stüdyo yeniden yüklenir.",
  }).catch(() => ({ response: 1 }));
  if (response !== 0) return;
  broadcast("studioApp:reimport", { force: true });
}

function buildMenu() {
  const template = [
    {
      label: APP_NAME,
      submenu: [
        { role: "about", label: `${APP_NAME} Hakkında` },
        { type: "separator" },
        { label: "Oturumu Kapat…", click: async () => {
          const { response } = await dialog.showMessageBox(mainWindow, { type: "question", buttons: ["Oturumu kapat", "Vazgeç"], defaultId: 1, cancelId: 1, message: "Oturumu kapatmak istiyor musunuz?" });
          if (response === 0) await logout();
        } },
        { type: "separator" },
        ...(IS_MAC ? [{ role: "hide", label: `${APP_NAME}'yu Gizle` }, { role: "hideOthers", label: "Diğerlerini Gizle" }, { role: "unhide", label: "Tümünü Göster" }, { type: "separator" }] : []),
        { label: `${APP_NAME}'dan Çık`, accelerator: IS_MAC ? "Cmd+Q" : "Ctrl+Q", click: () => app.quit() },
      ],
    },
    { label: "Düzen", submenu: [{ role: "undo", label: "Geri Al" }, { role: "redo", label: "Yinele" }, { type: "separator" }, { role: "cut", label: "Kes" }, { role: "copy", label: "Kopyala" }, { role: "paste", label: "Yapıştır" }, { role: "selectAll", label: "Tümünü Seç" }] },
    { label: "Görünüm", submenu: [
      { role: "resetZoom", label: "Gerçek Boyut" }, { role: "zoomIn", label: "Yakınlaştır" }, { role: "zoomOut", label: "Uzaklaştır" }, { type: "separator" }, { role: "togglefullscreen", label: "Tam Ekran" },
      ...(app.isPackaged ? [] : [{ role: "toggleDevTools", label: "Geliştirici Araçları" }]),
    ] },
    { label: "Pencere", role: "window", submenu: [
      { role: "minimize", label: "Küçült" },
      { type: "separator" },
      { label: "LED Çıkışını Kapat", accelerator: "CommandOrControl+Shift+L", registerAccelerator: false, click: () => { studio?.led?.close("MENU"); showMain(); } },
    ] },
    { label: "Yardım", role: "help", submenu: [
      { label: "Elitlig Araçlar'dan stüdyo ayarlarını içe aktar…", click: () => reimportFromAraclar() },
      { label: "Elitlig Araçlar'ı aç", click: () => shell.openExternal(`${studioLink.ARACLAR_PROTOCOL}://open`).catch(() => {}) },
      { type: "separator" },
      perfLaunch.safeMode
        ? { label: "Normal modda yeniden başlat", click: () => { perfFlags.set({ safeMode: false }); app.relaunch({ args: process.argv.slice(1).filter((a) => !["--safe-mode", "--guvenli-mod"].includes(a)) }); app.quit(); } }
        : { label: "Güvenli modda yeniden başlat", click: () => { app.relaunch({ args: [...process.argv.slice(1), "--safe-mode"] }); app.quit(); } },
      { label: "Çökme günlüğünü göster", click: () => crashes?.reveal() },
      { type: "separator" },
      { label: "elitlig.com'u Aç", click: () => shell.openExternal(config.SITE_ORIGIN) },
    ] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/* ----------------------------------- IPC ----------------------------------- */

function registerIpc() {
  ipcMain.handle("auth:state", () => authState());
  ipcMain.handle("auth:login", (_e, creds) => login(creds || {}));
  ipcMain.handle("auth:logout", () => logout());
  ipcMain.handle("api:request", async (_e, opts) => {
    if (!authState().signedIn) return { ok: false, error: { status: 401, message: "Oturum açık değil.", code: "AUTH_REQUIRED" } };
    const result = await api.request(opts || {});
    if (result.ok && opts?.method && opts.method !== "GET") broadcast("data:changed", { path: opts.path });
    return result;
  });
  ipcMain.handle("sync:status", () => ({ online: api.isOnline(), pending: api.pending() }));
  ipcMain.handle("sync:flush", () => api.flush());
  // Görsel yükleme (grafikler: logo / sponsor görseli) sohbet yükleme ucu üzerinden.
  ipcMain.handle("chat:upload", async (_e, { kind, name, mime, data } = {}) => {
    if (!authState().signedIn) return { ok: false, error: { message: "Oturum açık değil." } };
    const field = kind === "audio" ? "audio" : "file";
    const bytes = Buffer.from(data || []);
    if (!bytes.length) return { ok: false, error: { message: "Dosya boş." } };
    if (bytes.length > 25 * 1024 * 1024) return { ok: false, error: { message: "Dosya 25 MB'tan büyük olamaz." } };
    return api.upload(`/api/chat/uploads/${field}`, buildMultipart(field, name || "dosya", mime || mimeOf(name), bytes));
  });
  ipcMain.handle("chat:pick", async (event, { images = false } = {}) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const { canceled, filePaths } = await dialog.showOpenDialog(win, { properties: ["openFile"], filters: images ? [{ name: "Görseller", extensions: ["jpg", "jpeg", "png", "gif", "webp"] }] : [{ name: "Tüm dosyalar", extensions: ["*"] }] });
    if (canceled) return [];
    return filePaths.slice(0, 1).map((file) => {
      const size = fs.statSync(file).size;
      if (size > 25 * 1024 * 1024) return { name: path.basename(file), size, tooLarge: true };
      const buf = fs.readFileSync(file);
      return { name: path.basename(file), mime: mimeOf(file), size, data: new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength) };
    });
  });
  ipcMain.handle("file:save", async (event, { name, data, filters }) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const { canceled, filePath } = await dialog.showSaveDialog(win, { defaultPath: path.join(app.getPath("downloads"), name), filters });
    if (canceled || !filePath) return { ok: false };
    fs.writeFileSync(filePath, typeof data === "string" ? data : Buffer.from(data));
    return { ok: true, path: filePath };
  });
  ipcMain.handle("file:open", async (event, { filters }) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const { canceled, filePaths } = await dialog.showOpenDialog(win, { properties: ["openFile"], filters });
    if (canceled || !filePaths[0]) return { ok: false };
    const buf = fs.readFileSync(filePaths[0]);
    return { ok: true, name: path.basename(filePaths[0]), data: new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength) };
  });
  ipcMain.handle("file:reveal", (_e, filePath) => shell.showItemInFolder(filePath));
  ipcMain.handle("app:info", () => ({ version: app.getVersion(), app: "studio", siteOrigin: config.SITE_ORIGIN, sessionDays: config.SESSION_DAYS, safeMode: perfLaunch.safeMode }));
  ipcMain.handle("app:openExternal", (_e, url) => (isAllowedExternal(url) ? shell.openExternal(String(url).trim()) : null));
  ipcMain.handle("app:openWeb", (_e, pathname) => shell.openExternal(new URL(String(pathname || "/"), config.SITE_ORIGIN).toString()));
  ipcMain.handle("app:notify", (_e, { title, body }) => { const { Notification } = require("electron"); if (Notification.isSupported()) new Notification({ title, body }).show(); });
  ipcMain.handle("app:focused", () => Boolean(mainWindow && !mainWindow.isDestroyed() && mainWindow.isFocused()));
  ipcMain.handle("app:showMain", () => showMain());
  ipcMain.handle("studio:ensure", () => true);
  // Elitlig Araçlar'dan içe aktarma: arayüz localStorage'a yazar, sonra importDone.
  ipcMain.handle("studioApp:importState", (_e, opts = {}) => {
    try { return studioLink.prepareImport({ dir: studioLink.sharedDir(app), userDataDir: dataDir(), force: Boolean(opts?.force) }); } catch { return null; }
  });
  ipcMain.handle("studioApp:importDone", (_e, info = {}) => studioLink.markImported(dataDir(), { keys: Number(info?.keys) || 0, skipped: Boolean(info?.skipped), from: info?.from || null }));
  // "Programdan çık" (arayüz yayın sürüyorsa zaten sordu): uygulamayı kapat.
  ipcMain.handle("studioApp:quit", () => { quitting = true; setTimeout(() => app.quit(), 30); return true; });
  ipcMain.handle("studioApp:openAraclar", () => shell.openExternal(`${studioLink.ARACLAR_PROTOCOL}://open`).catch(() => false));
}

/* ------------------------------ yaşam döngüsü ------------------------------ */

app.on("open-url", (event, url) => { event.preventDefault(); handleLink(url); });

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", (_e, argv) => {
    const key = studioLink.handoffKeyFromArgv(argv);
    if (key) acceptHandoff(key);
    showMain();
  });

  app.whenReady().then(() => {
    crashes = createCrashMonitor({
      app, dir: path.join(dataDir(), "logs"), flags: perfFlags, launch: perfLaunch, shell,
      notify: (e) => broadcast("app:processGone", e),
      onRepeatedGpuCrash: ({ count }) => {
        if (studio?.engine?.active?.()) { broadcast("app:safeModeSuggested", { count }); return; }
        dialog.showMessageBox(mainWindow || undefined, {
          type: "warning", buttons: ["Güvenli modda yeniden başlat", "Şimdi değil"], defaultId: 0, cancelId: 1,
          message: "Ekran kartı süreci art arda çöktü",
          detail: `Son 10 dakikada ${count} kez. Bu çoğunlukla ekran kartı sürücüsünden kaynaklanır. Güvenli modda donanım hızlandırma kapalı açılır. Sürücüyü güncellemeniz önerilir.`,
        }).then(({ response }) => { if (response === 0) { perfFlags.set({ safeModeOnce: true }); app.relaunch(); app.quit(); } }).catch(() => {});
      },
    }).install();
    registerPerfIpc({ ipcMain, app, store: perfFlags, launch: perfLaunch, crashes });

    sessionStore = createSessionStore({ dir: dataDir(), safeStorage });
    applyTestSession(sessionStore, app);
    api = createApi({
      origin: config.API_ORIGIN, dataDir: dataDir(), fetchImpl: (url, init) => net.fetch(url, init), sessionStore,
      userAgent: userAgent(), timeoutMs: config.REQUEST_TIMEOUT_MS, onUnauthorized: () => signOutLocal("expired"),
    });
    if (pendingHandoff) { acceptHandoff(pendingHandoff); pendingHandoff = null; }
    api.events.on("online", (online) => { broadcast("sync:status", { online, pending: api.pending() }); if (online) api.flush(); });

    const media = createMediaProxy({ dataDir, fetch: (url, init) => net.fetch(url, init), userAgent });
    media.register(protocol);
    installMediaPermissions(electronSession.defaultSession, { isOwnUrl });
    allowYoutubeEmbeds(electronSession.defaultSession);
    const { registerStudio } = require("../studio");
    studio = registerStudio({
      ipcMain, api, broadcast, app, electronSession, systemPreferences, desktopCapturer, powerSaveBlocker, protocol, shell,
      isOwnUrl, isSignedIn: () => authState().signedIn,
      dialog, screen, BrowserWindow, loadRenderer, powerMonitor, globalShortcut,
      preloadPath: path.join(__dirname, "..", "preload.js"),
      siteOrigin: config.SITE_ORIGIN, apiOrigin: config.API_ORIGIN,
      tempDirName: "elitlig-studyo",
      ffmpegPriority: () => (perfLaunch.safeMode || !perfFlags.get().ffmpegAboveNormal ? null : "above-normal"),
      log: (...args) => { if (!app.isPackaged || process.env.ELITLIG_STUDIO_DEBUG) console.log(...args); },
    });
    crashes.setDiagWriter((message, data) => { if (studio?.diagnostics?.logPath?.()) studio.diagnostics.write("program", message, data); });

    registerIpc();
    buildMenu();
    createMainWindow();
    if (app.isPackaged) { try { app.setAsDefaultProtocolClient(studioLink.STUDIO_PROTOCOL); } catch { /* yoksay */ } }
    setInterval(() => { keepSessionFresh(); if (api.pending()) api.flush(); }, 5 * 60000);
    setTimeout(() => { keepSessionFresh(); api.flush(); }, 2000);
    powerMonitor.on("resume", () => setTimeout(() => { keepSessionFresh(); api.flush(); }, 3000));
    nativeTheme.on("updated", () => broadcast("theme", nativeTheme.shouldUseDarkColors ? "dark" : "light"));
    app.setAboutPanelOptions({ applicationName: APP_NAME, applicationVersion: app.getVersion(), copyright: "© Elitlig", credits: "Yayın Stüdyosu: canlı yayın, reji, tekrar, VAR, röportaj, LED çıkışı" });
    app.on("activate", () => showMain());
  });

  // ⌘Q / menüden çıkış da yayın sürerken onaylı.
  app.on("before-quit", (event) => {
    if (!quitting && studio?.engine?.active?.()) { event.preventDefault(); confirmQuit(); return; }
    quitting = true;
  });
  app.on("will-quit", () => { crashes?.markCleanExit(); globalShortcut.unregisterAll(); studio?.dispose(); });
  app.on("window-all-closed", () => app.quit());
  app.on("web-contents-created", (_e, contents) => contents.on("will-attach-webview", (event) => event.preventDefault()));
}
