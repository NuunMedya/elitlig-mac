// Masaüstü araç takımı (ana süreç): pencere yerleştirme kısayolları, araç takımı paneli
// (⌃⌥Boşluk; çerçevesiz, odak kaybedince gizlenir), ekranı uyanık tut, döviz kuru
// önbelleği ve uygulama geneli müzik çaların menü çubuğu / medya tuşu denetimi.
//
// main.js yalnız registerDeskkit(...) çağırır; tepsi ve menü öğelerini buradan alır.
// Ayarlar userData/deskkit.json'da (app/windowLayouts.js normalizeSettings).
//
// IPC kanalları (preload: window.elitlig.deskkit / window.elitlig.music):
//   deskkit:settings · deskkit:settings:set · deskkit:layout · deskkit:permission[:request|:open]
//   deskkit:panel:show · deskkit:panel:hide · deskkit:panel:pin · deskkit:shortcuts:suspend
//   deskkit:awake · deskkit:awake:set · deskkit:rates
//   music:publish (ana pencere → ana süreç) · music:command · music:state
//   Olaylar: deskkit:settings · deskkit:awake · music:state · music:command (ana pencereye)
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { execFile, spawn } = require("node:child_process");
const L = require("./windowLayouts");
const { createWindowManager } = require("./windowManager");

const PANEL_W = 440;
const PANEL_H = 600;
const MEDIA_KEYS = { MediaPlayPause: "toggle", MediaNextTrack: "next", MediaPreviousTrack: "prev", MediaStop: "stop" };
const RATES_TTL = 6 * 3600000;

/* ------------------------------ döviz kuru ------------------------------ */

const CODE = /^[A-Z]{3}$/;
/**
 * Kur yanıtını ortak biçime çevir: { base: "EUR", date, rates: { USD: 1.08, TRY: 37.1, EUR: 1 } } | null.
 * Desteklenen: frankfurter.app ({ base, date, rates }) ve open.er-api.com ({ result, base_code, time_last_update_unix, rates }).
 */
function parseRates(json) {
  if (!json || typeof json !== "object" || !json.rates || typeof json.rates !== "object") return null;
  if (json.result && json.result !== "success") return null;
  const base = String(json.base || json.base_code || "").toUpperCase();
  if (!CODE.test(base)) return null;
  const rates = { [base]: 1 };
  for (const [k, v] of Object.entries(json.rates)) {
    const n = Number(v);
    if (CODE.test(k) && Number.isFinite(n) && n > 0) rates[k] = n;
  }
  if (Object.keys(rates).length < 3) return null;
  const date = typeof json.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(json.date)
    ? json.date
    : json.time_last_update_unix ? new Date(Number(json.time_last_update_unix) * 1000).toISOString().slice(0, 10) : null;
  return { base, date, rates };
}

const RATE_SOURCES = [
  { name: "Avrupa Merkez Bankası (frankfurter.app)", url: "https://api.frankfurter.app/latest?from=EUR" },
  { name: "open.er-api.com", url: "https://open.er-api.com/v6/latest/EUR" },
];

/* ------------------------------ müzik durumu ------------------------------ */

const STATUSES = new Set(["idle", "loading", "playing", "paused", "fading", "xfade", "fadein"]);
/** Arayüzden gelen çalar durumunu süz (yalnız bilinen alanlar, sınırlı uzunluk). */
function sanitizeMusicState(s) {
  const x = s && typeof s === "object" ? s : {};
  const num = (v, d = null) => (Number.isFinite(Number(v)) ? Number(v) : d);
  return {
    status: STATUSES.has(x.status) ? x.status : "idle",
    title: String(x.title || "").slice(0, 140),
    listTitle: String(x.listTitle || "").slice(0, 140),
    nextTitle: String(x.nextTitle || "").slice(0, 140),
    elapsedSec: Math.max(0, num(x.elapsedSec, 0)),
    lengthSec: num(x.lengthSec),
    volume: Math.round(Math.min(100, Math.max(0, num(x.volume, 70)))),
    shuffle: Boolean(x.shuffle),
    repeat: ["all", "one", "off"].includes(x.repeat) ? x.repeat : "all",
    trackCount: Math.max(0, Math.round(num(x.trackCount, 0))),
    pausedByStudio: Boolean(x.pausedByStudio),
  };
}
const musicActive = (s) => s.status !== "idle";
const musicPlaying = (s) => ["playing", "loading", "fadein", "xfade"].includes(s.status);

function registerDeskkit(deps) {
  const {
    app, ipcMain, BrowserWindow, globalShortcut, screen, systemPreferences, shell, powerSaveBlocker, net,
    loadRenderer, webPreferences, guardNavigation, showMain, showQuick, getMainWindow, broadcast,
    refreshTray = () => {}, rebuildMenu = () => {}, isMac = process.platform === "darwin", log = () => {},
  } = deps;
  const platform = deps.platform || process.platform; // sınamada değiştirilebilir
  const dataDir = app.getPath("userData");
  const SETTINGS_FILE = path.join(dataDir, "deskkit.json");
  const RATES_FILE = path.join(dataDir, "deskkit-rates.json");

  let settings = L.normalizeSettings(null, platform);
  try { settings = L.normalizeSettings(JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8")), platform); } catch { /* ilk açılış */ }
  const save = () => { try { fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2)); } catch { /* yoksay */ } };

  let panel = null;
  let pinned = false;
  let target = null;
  const isPanel = (w) => Boolean(panel && w && !panel.isDestroyed() && w.id === panel.id);

  const wm = createWindowManager({
    platform, screen, BrowserWindow, systemPreferences, shell, execFile, spawn,
    tmpDir: path.join(app.getPath("temp"), "elitlig-araclar"),
    getGap: () => settings.layouts.gap,
    isOwnPanel: isPanel,
    log,
  });

  /* ------------------------------ kısayollar ------------------------------ */

  const registered = new Map(); // hızlandırıcı → anahtar
  const failed = {}; // anahtar → true (başka uygulama kullanıyor)
  let suspended = false;

  const unregisterOurs = () => {
    for (const acc of registered.keys()) { try { globalShortcut.unregister(acc); } catch { /* yoksay */ } }
    registered.clear();
  };
  const tryRegister = (acc, key, fn) => {
    if (!acc) return;
    if (registered.has(acc)) { failed[key] = true; return; }
    let ok = false;
    try { ok = globalShortcut.register(acc, fn) !== false && globalShortcut.isRegistered(acc); } catch { ok = false; }
    if (ok) registered.set(acc, key); else failed[key] = true;
  };
  const applyShortcuts = () => {
    unregisterOurs();
    for (const k of Object.keys(failed)) delete failed[k];
    if (suspended) return;
    tryRegister(settings.toolkit.shortcut, "toolkit", () => togglePanel());
    if (settings.layouts.enabled && wm.supported) {
      for (const [key, acc] of Object.entries(settings.layouts.shortcuts)) {
        tryRegister(acc, key, () => runLayout(key, { source: "shortcut" }));
      }
    }
    syncMediaKeys(true);
  };

  /* ------------------------------ pencere düzeni ------------------------------ */

  let lastNotice = 0;
  async function runLayout(key, { source = "shortcut" } = {}) {
    const fromPanel = source === "panel";
    const res = await wm.apply(key, { target: fromPanel ? target : null, front: fromPanel });
    if (!res.ok && res.needsPermission && Date.now() - lastNotice > 4000) {
      lastNotice = Date.now();
      // İzin uyarısı Ayarlar'da (Masaüstü araçları) düğmesiyle gösterilir.
      showMain("desk:permission");
    }
    if (!res.ok) log("[pencere]", key, res.code, res.error);
    return res;
  }

  /* ------------------------------ panel ------------------------------ */

  function createPanel() {
    const win = new BrowserWindow({
      width: PANEL_W,
      height: PANEL_H,
      show: false,
      frame: false,
      resizable: false,
      movable: true,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      transparent: true,
      vibrancy: "hud",
      visualEffectState: "active",
      roundedCorners: true,
      webPreferences: webPreferences(),
    });
    guardNavigation(win);
    win.on("blur", () => { if (settings.toolkit.hideOnBlur && !pinned && !win.webContents.isDevToolsOpened()) win.hide(); });
    loadRenderer(win, "toolkit");
    panel = win;
    return win;
  }

  async function showPanel(tab = null) {
    if (!panel || panel.isDestroyed()) createPanel();
    // Hedef pencere panel odak almadan önce belirlenir (en çok 400 ms beklenir).
    target = await Promise.race([wm.captureTarget().catch(() => null), new Promise((r) => setTimeout(() => r(null), 400))]);
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const wa = display.workArea;
    const x = Math.round(wa.x + wa.width - PANEL_W - 12);
    const y = Math.round(isMac ? wa.y + 8 : wa.y + wa.height - PANEL_H - 12);
    panel.setPosition(x, y);
    const reveal = () => {
      panel.show();
      panel.focus();
      panel.webContents.send("deskkit:panel:open", { tab, target: target ? target.kind : null });
      panel.webContents.send("music:state", musicState);
    };
    if (panel.webContents.isLoading()) panel.webContents.once("did-finish-load", reveal);
    else reveal();
  }
  const hidePanel = () => { if (panel && !panel.isDestroyed()) panel.hide(); };
  function togglePanel() {
    if (panel && !panel.isDestroyed() && panel.isVisible() && panel.isFocused()) hidePanel();
    else showPanel();
  }

  /* ------------------------------ ekranı uyanık tut ------------------------------ */

  let awake = { id: null, until: null, timer: null };
  const awakeState = () => ({ on: awake.id != null && powerSaveBlocker.isStarted(awake.id), until: awake.until });
  function setAwake({ on, minutes = null } = {}) {
    if (awake.id != null) { try { powerSaveBlocker.stop(awake.id); } catch { /* yoksay */ } }
    clearTimeout(awake.timer);
    awake = { id: null, until: null, timer: null };
    if (on) {
      awake.id = powerSaveBlocker.start("prevent-display-sleep");
      const m = Number(minutes);
      if (m > 0 && m <= 24 * 60) {
        awake.until = Date.now() + m * 60000;
        awake.timer = setTimeout(() => setAwake({ on: false }), m * 60000);
      }
    }
    const st = awakeState();
    broadcast("deskkit:awake", st);
    refreshTray();
    rebuildMenu();
    return st;
  }

  /* ------------------------------ döviz ------------------------------ */

  let ratesCache = null;
  try { ratesCache = JSON.parse(fs.readFileSync(RATES_FILE, "utf8")); } catch { /* yok */ }
  async function getRates({ force = false } = {}) {
    if (!force && ratesCache && Date.now() - ratesCache.fetchedAt < RATES_TTL) return { ok: true, ...ratesCache, stale: false };
    for (const src of RATE_SOURCES) {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 8000);
      try {
        const res = await net.fetch(src.url, { signal: ctrl.signal, headers: { Accept: "application/json" } });
        if (!res.ok) continue;
        const parsed = parseRates(await res.json());
        if (!parsed) continue;
        ratesCache = { ...parsed, source: src.name, fetchedAt: Date.now() };
        try { fs.writeFileSync(RATES_FILE, JSON.stringify(ratesCache)); } catch { /* yoksay */ }
        return { ok: true, ...ratesCache, stale: false };
      } catch { /* sıradaki kaynak */ } finally { clearTimeout(t); }
    }
    if (ratesCache) return { ok: true, ...ratesCache, stale: true };
    return { ok: false, error: "Döviz kuru alınamadı (bağlantı yok ve önbellek boş)." };
  }

  /* ------------------------------ müzik ------------------------------ */

  let musicState = sanitizeMusicState(null);
  let mediaOn = false;
  function syncMediaKeys(force = false) {
    // macOS medya tuşlarını yalnız Erişilebilirlik izni olan uygulamaya verir (izin yoksa denenmez).
    const trusted = platform !== "darwin" || Boolean(systemPreferences?.isTrustedAccessibilityClient?.(false));
    const want = settings.music.mediaKeys && musicActive(musicState) && !suspended && trusted;
    if (want === mediaOn && !force) return;
    for (const acc of Object.keys(MEDIA_KEYS)) { try { if (globalShortcut.isRegistered(acc) && mediaOn) globalShortcut.unregister(acc); } catch { /* yoksay */ } }
    mediaOn = false;
    if (!want) return;
    for (const [acc, cmd] of Object.entries(MEDIA_KEYS)) {
      try { if (globalShortcut.register(acc, () => musicCommand(cmd))) mediaOn = true; } catch { /* sistem izin vermedi */ }
    }
  }
  function musicCommand(name, args = {}) {
    if (name === "show") { showMain("music"); return { ok: true }; }
    const main = getMainWindow();
    if (!main || main.isDestroyed()) return { ok: false, error: "Ana pencere kapalı." };
    main.webContents.send("music:command", { name: String(name), args: args && typeof args === "object" ? args : {} });
    return { ok: true };
  }
  function onMusicPublish(state) {
    const prev = musicState;
    musicState = sanitizeMusicState(state);
    if (panel && !panel.isDestroyed()) panel.webContents.send("music:state", musicState);
    if (prev.status !== musicState.status || prev.title !== musicState.title || prev.trackCount !== musicState.trackCount) {
      refreshTray();
      syncMediaKeys();
    }
  }

  /* ------------------------------ IPC ------------------------------ */

  const view = () => ({
    settings,
    defaults: L.normalizeSettings(null, platform),
    failed: { ...failed },
    conflicts: L.findConflicts(settings),
    permission: wm.permission(),
    supported: wm.supported,
    platform,
    layouts: L.LAYOUTS.map(({ key, label, group, rect }) => ({ key, label, group, rect })),
    mediaKeys: mediaOn,
  });
  const changed = () => { broadcast("deskkit:settings", view()); rebuildMenu(); refreshTray(); };

  ipcMain.handle("deskkit:settings", () => view());
  ipcMain.handle("deskkit:settings:set", (_e, patch) => {
    const p = patch && typeof patch === "object" ? patch : {};
    if (p.reset) settings = L.normalizeSettings(null, platform);
    else {
      settings = L.normalizeSettings({
        layouts: { ...settings.layouts, ...(p.layouts || {}), shortcuts: { ...settings.layouts.shortcuts, ...(p.layouts?.shortcuts || {}) } },
        toolkit: { ...settings.toolkit, ...(p.toolkit || {}) },
        music: { ...settings.music, ...(p.music || {}) },
      }, platform);
    }
    save();
    applyShortcuts();
    changed();
    return view();
  });
  ipcMain.handle("deskkit:layout", async (event, key) => {
    const fromPanel = isPanel(BrowserWindow.fromWebContents(event.sender));
    if (fromPanel) { pinned = false; hidePanel(); }
    return runLayout(String(key || ""), { source: fromPanel ? "panel" : "app" });
  });
  ipcMain.handle("deskkit:permission", () => wm.permission());
  ipcMain.handle("deskkit:permission:request", () => wm.requestPermission());
  ipcMain.handle("deskkit:permission:open", (_e, kind) => wm.openPermissionSettings(kind === "automation" ? "automation" : "accessibility"));
  ipcMain.handle("deskkit:panel:show", (_e, tab) => showPanel(typeof tab === "string" ? tab : null));
  ipcMain.handle("deskkit:panel:hide", () => { pinned = false; hidePanel(); });
  ipcMain.handle("deskkit:panel:pin", (_e, on) => { pinned = Boolean(on); return pinned; });
  ipcMain.handle("deskkit:shortcuts:suspend", (_e, on) => { suspended = Boolean(on); applyShortcuts(); return !suspended; });
  ipcMain.handle("deskkit:awake", () => awakeState());
  ipcMain.handle("deskkit:awake:set", (_e, opts) => setAwake(opts && typeof opts === "object" ? opts : {}));
  ipcMain.handle("deskkit:rates", (_e, force) => getRates({ force: Boolean(force) }));
  ipcMain.on("music:publish", (_e, state) => onMusicPublish(state));
  ipcMain.handle("music:command", (_e, name, args) => musicCommand(name, args));
  ipcMain.handle("music:state", () => musicState);

  applyShortcuts();
  // Windows: PowerShell yardımcısı açılışta ısıtılır (ilk kısayolda Add-Type beklenmesin).
  if (platform === "win32" && settings.layouts.enabled) setTimeout(() => wm.warm().catch(() => {}), 8000).unref?.();
  app.on("will-quit", () => { unregisterOurs(); wm.dispose(); if (awake.id != null) { try { powerSaveBlocker.stop(awake.id); } catch { /* yoksay */ } } });

  /* ------------------------------ menüler ------------------------------ */

  const acc = (key) => settings.layouts.shortcuts[key] || undefined;
  const layoutItems = (withAccel) => {
    const items = [];
    let group = null;
    for (const l of L.LAYOUTS) {
      if (group && l.group !== group) items.push({ type: "separator" });
      group = l.group;
      items.push({
        label: l.label,
        ...(withAccel && acc(l.key) ? { accelerator: acc(l.key), registerAccelerator: false } : {}),
        enabled: settings.layouts.enabled && wm.supported,
        click: () => runLayout(l.key, { source: "menu" }),
      });
    }
    return items;
  };
  const musicItems = () => {
    const s = musicState;
    const has = s.trackCount > 0 || musicActive(s);
    const items = [];
    if (musicActive(s) && s.title) items.push({ label: `♪ ${s.title}`.slice(0, 60), enabled: false });
    items.push(
      { label: musicPlaying(s) ? "Duraklat" : "Çal", enabled: has, click: () => musicCommand("toggle") },
      { label: "Sonraki parça", enabled: has, click: () => musicCommand("next") },
      { label: "Önceki parça", enabled: has, click: () => musicCommand("prev") },
      { type: "separator" },
      { label: "Müzik görünümü…", click: () => musicCommand("show") },
    );
    return items;
  };
  const awakeItem = () => ({ label: "Ekranı uyanık tut", type: "checkbox", checked: awakeState().on, click: (item) => setAwake({ on: item.checked }) });

  /** Menü çubuğu simgesinin menüsüne eklenecek öğeler. */
  function trayItems() {
    const s = musicState;
    return [
      { label: "Araç takımı…", ...(settings.toolkit.shortcut ? { accelerator: settings.toolkit.shortcut, registerAccelerator: false } : {}), click: () => showPanel() },
      { label: "Pencere düzeni", enabled: wm.supported, submenu: layoutItems(true) },
      { label: musicActive(s) && s.title ? `Müzik · ${s.title}`.slice(0, 48) : "Müzik", submenu: musicItems() },
      awakeItem(),
      { type: "separator" },
    ];
  }

  /** Uygulama menüsüne eklenecek üst düzey "Araç Takımı" menüsü. */
  function menuTemplate() {
    return {
      label: "Araç Takımı",
      submenu: [
        { label: "Araç Takımı Paneli", ...(settings.toolkit.shortcut ? { accelerator: settings.toolkit.shortcut, registerAccelerator: false } : {}), click: () => showPanel() },
        { type: "separator" },
        { label: "Pencere Düzeni", enabled: wm.supported, submenu: layoutItems(true) },
        { label: "Müzik", submenu: musicItems() },
        awakeItem(),
        { type: "separator" },
        { label: "Müzik Görünümü", accelerator: "CmdOrCtrl+Shift+J", click: () => showMain("music") },
        { label: "Hızlı Not…", click: () => showQuick("note") },
        { label: "Masaüstü Araçları Ayarları…", accelerator: "CmdOrCtrl+,", click: () => showMain("desk") },
      ],
    };
  }

  return { trayItems, menuTemplate, showPanel, hidePanel, runLayout, settings: () => settings, musicState: () => musicState };
}

module.exports = { registerDeskkit, parseRates, sanitizeMusicState, RATE_SOURCES };
