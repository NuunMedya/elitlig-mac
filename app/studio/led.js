// Yayın Stüdyosu — LED ekran çıkışı (ikinci ekran / projeksiyon / saha LED'i).
//
// displays(): bağlı ekranlar { id, label, bounds, primary, scaleFactor }.
// open({ displayId, mode, url?, matchId? }): o ekranda çerçevesiz, tam ekran,
// menüsüz, siyah arka planlı bir pencere (kiosk benzeri; Mac ve Windows):
//   mode "web":    url ya da https://elitlig.com/led/<matchId>. Yalnız site
//                  (SITE_ORIGIN) ve API kökenine izin verilir; başka adrese
//                  gezinme ve yeni pencere engellenir. Ön yükleme (preload) YOK.
//   mode "studio": uygulamanın kendi arayüzü #led-output ile (aynı preload).
//                  Arayüz durumu led.sendState(state) ile yollar; ana süreç
//                  LED penceresine "studio:led:state" ile iletir (son durum
//                  saklanır: pencere yeniden yüklenince led.getState()).
// Kapatma: Esc'ye 1,5 sn içinde iki kez basmak, led.close() ya da ekranın
// çıkarılması (durum yayılır). Tek LED penceresi vardır; yeniden open() eskisini kapatır.
"use strict";

const { EventEmitter } = require("node:events");

const ESC_WINDOW_MS = 1500;
const MATCH_ID = /^\d{1,12}$/;

/** Adres izinli kökenlerden birinde ve https mi? */
function isAllowedLedUrl(url, origins = []) {
  let u;
  try { u = new URL(String(url)); } catch { return false; }
  if (u.protocol !== "https:") return false;
  return origins.some((o) => {
    try { return new URL(o).origin === u.origin; } catch { return false; }
  });
}

/** Electron Display → arayüz nesnesi. */
function describeDisplay(d, primaryId, index = 0) {
  const b = d.bounds || {};
  const size = b.width && b.height ? `${b.width}×${b.height}` : "";
  const label = (typeof d.label === "string" && d.label.trim()) || `Ekran ${index + 1}${size ? ` (${size})` : ""}`;
  return {
    id: d.id,
    label,
    bounds: { x: b.x ?? 0, y: b.y ?? 0, width: b.width ?? 0, height: b.height ?? 0 },
    primary: d.id === primaryId,
    scaleFactor: d.scaleFactor ?? 1,
  };
}

function createLedManager({
  BrowserWindow, screen, loadRenderer, preloadPath, siteOrigin = "https://elitlig.com", apiOrigin = null,
  platform = process.platform, now = () => Date.now(), log = () => {},
} = {}) {
  const events = new EventEmitter();
  const origins = [siteOrigin, apiOrigin].filter(Boolean);
  let win = null;
  let current = null; // { displayId, mode, url }
  let lastState = null;
  let lastEsc = -Infinity;

  const displays = () => {
    let primaryId = null;
    try { primaryId = screen.getPrimaryDisplay()?.id ?? null; } catch { /* yoksay */ }
    return (screen.getAllDisplays() || []).map((d, i) => describeDisplay(d, primaryId, i));
  };

  const status = () => (win && current ? { open: true, displayId: current.displayId, mode: current.mode, url: current.mode === "web" ? current.url : null } : { open: false, displayId: null, mode: null, url: null });
  const emitStatus = (extra = {}) => events.emit("status", { ...status(), ...extra });

  function close(reason = null) {
    const w = win;
    win = null;
    current = null;
    if (w && !w.isDestroyed()) {
      try { w.destroy(); } catch { /* yoksay */ }
    }
    if (w) emitStatus(reason ? { reason } : {});
    return true;
  }

  function open({ displayId, mode = "studio", url = null, matchId = null } = {}) {
    if (mode !== "web" && mode !== "studio") return { ok: false, error: { code: "BAD_MODE", message: "LED kipi \"web\" ya da \"studio\" olmalı." } };
    const list = screen.getAllDisplays() || [];
    const display = displayId === undefined || displayId === null
      ? list.find((d) => d.id !== screen.getPrimaryDisplay()?.id) || list[0]
      : list.find((d) => String(d.id) === String(displayId));
    if (!display) return { ok: false, error: { code: "NO_DISPLAY", message: "Seçilen ekran bulunamadı (bağlantısı kesilmiş olabilir)." } };
    let target = null;
    if (mode === "web") {
      if (url) target = String(url);
      else if (matchId !== null && matchId !== undefined && MATCH_ID.test(String(matchId))) target = `${siteOrigin.replace(/\/+$/, "")}/led/${String(matchId)}`;
      else return { ok: false, error: { code: "BAD_REQUEST", message: "LED sayfası için maç ya da adres seçilmedi." } };
      if (!isAllowedLedUrl(target, origins)) return { ok: false, error: { code: "BAD_URL", message: "LED sayfası yalnız elitlig.com adresinden açılabilir." } };
    }
    close();
    const b = display.bounds;
    const w = new BrowserWindow({
      x: b.x, y: b.y, width: b.width, height: b.height,
      frame: false,
      fullscreen: platform !== "darwin", // macOS: önce ekrana yerleş, sonra tam ekran (doğru ekranda açılsın)
      kiosk: false,
      autoHideMenuBar: true,
      backgroundColor: "#000000",
      show: false,
      skipTaskbar: false,
      title: "Elitlig LED",
      webPreferences: mode === "studio"
        ? { preload: preloadPath, contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: false, spellcheck: false }
        : { contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: false, spellcheck: false, autoplayPolicy: "no-user-gesture-required" },
    });
    win = w;
    current = { displayId: display.id, mode, url: target };
    try { w.removeMenu?.(); } catch { /* yoksay */ }
    try { w.setMenuBarVisibility?.(false); } catch { /* yoksay */ }
    const wc = w.webContents;
    wc.setWindowOpenHandler?.(() => ({ action: "deny" }));
    wc.on("will-navigate", (event, next) => {
      const ok = mode === "web" ? isAllowedLedUrl(next, origins) : String(next).startsWith("file:") || (process.env.ELITLIG_RENDERER_URL && String(next).startsWith(process.env.ELITLIG_RENDERER_URL));
      if (!ok) event.preventDefault();
    });
    wc.on("will-redirect", (event, next) => {
      if (mode === "web" && !isAllowedLedUrl(next, origins)) event.preventDefault();
    });
    // Esc iki kez (1,5 sn içinde) → kapat.
    wc.on("before-input-event", (event, input) => {
      if (input.type !== "keyDown" || input.key !== "Escape") return;
      event.preventDefault?.();
      const t = now();
      if (t - lastEsc <= ESC_WINDOW_MS) { lastEsc = -Infinity; close("ESC"); return; }
      lastEsc = t;
    });
    wc.on("did-finish-load", () => {
      if (mode === "studio" && lastState !== null && win === w && !w.isDestroyed()) wc.send("studio:led:state", lastState);
    });
    w.once("ready-to-show", () => {
      if (win !== w || w.isDestroyed()) return;
      w.setBounds?.(b);
      w.show();
      if (platform === "darwin") w.setSimpleFullScreen ? w.setSimpleFullScreen(true) : w.setFullScreen(true);
    });
    w.on("closed", () => { if (win === w) { win = null; current = null; emitStatus(); } });
    if (mode === "web") w.loadURL(target).catch(() => {});
    else Promise.resolve(loadRenderer(w, "led-output")).catch(() => {});
    log("studio: LED açıldı", { displayId: display.id, mode });
    emitStatus();
    return { ok: true, ...status() };
  }

  /** Arayüzden gelen durum → LED penceresi (yalnız studio kipi). */
  function sendState(state, sender = null) {
    if (sender && win && !win.isDestroyed() && sender.id === win.webContents.id) return false; // LED kendine yollamaz
    lastState = state === undefined ? null : state;
    if (!win || win.isDestroyed() || current?.mode !== "studio") return false;
    try { win.webContents.send("studio:led:state", lastState); } catch { return false; }
    return true;
  }

  const onDisplayRemoved = (_e, display) => {
    if (current && display && String(display.id) === String(current.displayId)) close("DISPLAY_REMOVED");
    events.emit("displays", displays());
  };
  const onDisplayAdded = () => events.emit("displays", displays());
  const onDisplayChanged = () => events.emit("displays", displays());
  screen.on?.("display-removed", onDisplayRemoved);
  screen.on?.("display-added", onDisplayAdded);
  screen.on?.("display-metrics-changed", onDisplayChanged);

  return {
    displays,
    open,
    close: () => close(),
    status,
    sendState,
    getState: () => lastState,
    isLedContents: (wc) => Boolean(win && !win.isDestroyed() && wc && win.webContents.id === wc.id),
    dispose() {
      screen.removeListener?.("display-removed", onDisplayRemoved);
      screen.removeListener?.("display-added", onDisplayAdded);
      screen.removeListener?.("display-metrics-changed", onDisplayChanged);
      close();
    },
    events,
  };
}

module.exports = { createLedManager, isAllowedLedUrl, describeDisplay, ESC_WINDOW_MS };
