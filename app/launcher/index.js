// Masaüstünden her araca erişim (ana süreç):
//   • Hızlı geçiş penceresi (#launcher, varsayılan ⌃⌥O): Spotlight benzeri; araç adı yaz → aç,
//     kayıt ara (görev, not, kişi, proje… — komut paletinin arama mantığı: renderer/src/lib/paletteSearch.js).
//     Hızlı kayıt penceresinden (⌃⌥N) ayrıdır.
//   • macOS Dock simgesi menüsü (app.dock.setMenu): tüm araçlar + yeni kayıt eylemleri
//   • Windows görev çubuğu atlama listesi (app.setJumpList; olmazsa setUserTasks): aynı içerik
//   • menü çubuğu (tepsi) "Araçlar" alt menüsü
//   • derin bağlantı elitlig-araclar://… — protokol kaydı (yalnız paketli uygulamada), macOS open-url,
//     ikinci örnekten (tek örnek kilidi) gelen bağlantı / atlama listesi bağımsız değişkeni
//
// Saf parçalar: ./tools.js. IPC: launcher:state · launcher:open · launcher:action · launcher:hide · launcher:show
"use strict";

const T = require("./tools");

const DEFAULT_SHORTCUT = "Control+Alt+O";
const WIDTH = 640;
const HEIGHT = 470;

// open-url (macOS) uygulama hazır olmadan da gelebilir: erken kurulur, bağlantılar kuyrukta bekler.
let early = { queue: [], handler: null };
function installEarly(app) {
  app.on("open-url", (event, url) => {
    event.preventDefault();
    if (early.handler) early.handler(url); else early.queue.push(url);
  });
  const fromArgv = T.linkFromArgv(process.argv);
  if (fromArgv) early.queue.push(fromArgv);
}

function registerLauncher(deps) {
  const {
    app, ipcMain, BrowserWindow, globalShortcut, screen, Menu,
    loadRenderer, webPreferences, guardNavigation, showMain, showQuick,
    access = () => ({}), widgets = () => null, isMac = process.platform === "darwin", log = () => {},
    quickShortcut = "Control+Alt+N",
  } = deps;
  const platform = deps.platform || process.platform;
  let win = null;
  let shortcut = "";

  /* ------------------------------ pencere ------------------------------ */

  function createWindow() {
    const w = new BrowserWindow({
      width: WIDTH, height: HEIGHT, show: false, frame: false, resizable: false, movable: true,
      minimizable: false, maximizable: false, fullscreenable: false, alwaysOnTop: true, skipTaskbar: true,
      transparent: true, backgroundColor: "#00000000", roundedCorners: true,
      ...(isMac ? { vibrancy: "hud", visualEffectState: "active" } : {}),
      title: "Hızlı geçiş",
      webPreferences: webPreferences(),
    });
    guardNavigation(w);
    w.on("blur", () => { if (!w.isDestroyed() && !w.webContents.isDevToolsOpened() && !process.env.ELITLIG_LAUNCHER_PIN) w.hide(); });
    w.on("closed", () => { if (win === w) win = null; });
    loadRenderer(w, "launcher");
    win = w;
    return w;
  }

  function show(query = "") {
    if (!win || win.isDestroyed()) createWindow();
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const { x, y, width } = display.workArea;
    win.setPosition(Math.round(x + (width - WIDTH) / 2), Math.round(y + 120));
    const reveal = () => {
      if (!win || win.isDestroyed()) return;
      win.show();
      win.focus();
      win.webContents.send("launcher:open", { query: String(query || "").slice(0, 80) });
    };
    if (win.webContents.isLoading()) win.webContents.once("did-finish-load", reveal); else reveal();
    return { ok: true };
  }
  const hide = () => { if (win && !win.isDestroyed()) win.hide(); return { ok: true }; };
  const toggle = () => (win && !win.isDestroyed() && win.isVisible() && win.isFocused() ? hide() : show());

  /* ------------------------------ eylemler ------------------------------ */

  /** Bir görünümü aç. arg: nesne bağımsız değişken (ör. { id: 3 }) — ana pencere "navigate" ile alır. */
  function open(route, arg = null) {
    const r = T.cleanRoute(route);
    if (!r) return { ok: false, error: "Bilinmeyen araç." };
    const tool = T.TOOLS.find((t) => t.key === r.split(":")[0]);
    if (tool && !T.visibleTools(access()).includes(tool)) return { ok: false, error: "Bu araç için yetkiniz yok." };
    hide();
    showMain(arg && typeof arg === "object" ? { route: r, arg: sanitizeArg(arg) } : r);
    return { ok: true, route: r };
  }

  function runAction(id) {
    const a = T.actionOf(String(id || ""));
    if (!a) return { ok: false, error: "Bilinmeyen eylem." };
    hide();
    if (a.quick && showQuick) showQuick(a.quick); else showMain(a.route);
    return { ok: true, action: a.id };
  }

  /** Derin bağlantıyı işle; işlenirse true. */
  function openUrl(url) {
    const p = T.parseDeepLink(url);
    if (!p) { log("[launcher] tanınmayan bağlantı", url); return false; }
    if (p.launcher) show();
    else if (p.widgets) { const w = widgets(); if (w) w.toggleAll(); else showMain("toolkit:widgets"); }
    else if (p.action) runAction(p.action);
    else open(p.route);
    return true;
  }
  const handleArgv = (argv) => { const link = T.linkFromArgv(argv); return link ? openUrl(link) : false; };

  /* ------------------------------ menüler ------------------------------ */

  const handlers = {
    open: (route) => open(route),
    action: (id) => runAction(id),
    launcher: () => show(),
    quick: () => showQuick?.(),
    widgets: () => { const w = widgets(); if (w) w.toggleAll(); else showMain("toolkit:widgets"); },
  };
  const shortcuts = () => ({ launcher: shortcut || undefined, quick: quickShortcut });

  const dockMenu = () => Menu.buildFromTemplate(T.dockMenuTemplate({ access: access(), handlers, shortcuts: shortcuts() }));
  const trayItem = () => T.trayToolsItem({ access: access(), handlers, shortcuts: shortcuts() });

  /** Dock menüsü (Mac) ve atlama listesi (Windows) — oturum / yetki değişince yeniden kurulur. */
  let osKey = null;
  function refreshOsMenus({ force = true } = {}) {
    const key = `${T.visibleTools(access()).map((t) => t.key).join(",")}|${shortcut}`;
    if (!force && key === osKey) return;
    osKey = key;
    if (isMac && app.dock) { try { app.dock.setMenu(dockMenu()); } catch (e) { log("[launcher] dock", e); } }
    if (platform === "win32") {
      const opts = { access: access(), program: process.execPath, appArgs: app.isPackaged ? [] : [app.getAppPath()] };
      let ok = false;
      try { ok = app.setJumpList(T.jumpList(opts)) === "ok"; } catch (e) { log("[launcher] jumplist", e); }
      if (!ok) { try { app.setUserTasks(T.userTasks(opts)); } catch (e) { log("[launcher] usertasks", e); } }
    }
  }

  /* ------------------------------ protokol ------------------------------ */

  // Paketlenmemiş (geliştirme / test) uygulamada sistemin varsayılan işleyicisi değiştirilmez.
  if (app.isPackaged) {
    try { app.setAsDefaultProtocolClient(T.SCHEME); } catch (e) { log("[launcher] protokol", e); }
  }
  early.handler = (url) => { if (app.isReady()) openUrl(url); else app.whenReady().then(() => openUrl(url)); };
  const pending = early.queue.splice(0);
  setTimeout(() => pending.forEach((u) => openUrl(u)), 600);

  /* ------------------------------ kısayol ------------------------------ */

  function registerShortcut(acc = DEFAULT_SHORTCUT) {
    if (shortcut) { try { globalShortcut.unregister(shortcut); } catch { /* yoksay */ } }
    shortcut = "";
    try { if (globalShortcut.register(acc, () => toggle())) shortcut = acc; } catch (e) { log("[launcher] kısayol", e); }
    if (!shortcut) log("[launcher] kısayol kaydedilemedi (başka uygulama kullanıyor olabilir)", acc);
    return shortcut;
  }
  registerShortcut(process.env.ELITLIG_LAUNCHER_SHORTCUT || DEFAULT_SHORTCUT);

  /* ------------------------------ IPC ------------------------------ */

  ipcMain.handle("launcher:state", () => ({
    tools: T.visibleTools(access()).map(({ key, label, icon, group, keywords }) => ({ key, label, icon, group, keywords })),
    actions: T.ACTIONS.map(({ id, label, icon }) => ({ id, label, icon })),
    shortcut, quickShortcut, platform,
  }));
  ipcMain.handle("launcher:open", (_e, route, arg) => open(String(route || ""), arg));
  ipcMain.handle("launcher:action", (_e, id) => runAction(String(id || "")));
  ipcMain.handle("launcher:hide", () => hide());
  ipcMain.handle("launcher:show", (_e, q) => show(typeof q === "string" ? q : ""));

  return { show, hide, toggle, open, runAction, openUrl, handleArgv, refreshOsMenus, dockMenu, trayItem, shortcut: () => shortcut, registerShortcut, _window: () => win };
}

/** Arayüze geri gönderilecek bağımsız değişken: yalnız düz sayı / kısa metin alanları. */
function sanitizeArg(arg) {
  const out = {};
  for (const [k, v] of Object.entries(arg || {}).slice(0, 8)) {
    if (!/^[A-Za-z_]{1,24}$/.test(k)) continue;
    if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    else if (typeof v === "string") out[k] = v.slice(0, 80);
    else if (typeof v === "boolean") out[k] = v;
  }
  return out;
}

module.exports = { registerLauncher, installEarly, sanitizeArg, DEFAULT_SHORTCUT };
