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
//                  Durum hızla gelse de (ör. 60 Hz) pencereye en çok ~30 Hz gider:
//                  araya düşenler birleştirilir, SON durum her zaman iletilir
//                  (≥ 10 Hz akış gecikmesiz geçer; kuyruk birikmez, zamanlayıcı tektir).
//                  view: "program" | "preview" | "scene" (+ sceneId) arayüzün durumundadır;
//                  open({ view, sceneId }) ilk görünümü status'a yazar.
// Kapatma: Esc'ye 1,5 sn içinde iki kez basmak, led.close() ya da ekranın
// çıkarılması (durum yayılır). Tek LED penceresi vardır; yeniden open() eskisini kapatır.
// Uyku / uyanma: ekran uykuda çıkarılıp geri gelirse (macOS harici ekranı uykuda
// "kaldırır", kimliği değişebilir) pencere displayGraceMs (2 dk) boyunca gizli
// bekler; ekran (aynı kimlik ya da aynı ad + boyut) dönünce yeniden o ekrana
// yerleşip tam ekran olur. Uyanınca (powerMonitor resume / unlock-screen) ve
// ekran ölçüleri değişince de yeniden yerleştirilir.
"use strict";

const { EventEmitter } = require("node:events");

const ESC_WINDOW_MS = 1500;
const STATE_MIN_INTERVAL_MS = 33; // ~30 Hz üst sınır
const DISPLAY_GRACE_MS = 120000;
const VIEWS = new Set(["program", "preview", "scene"]);
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
  powerMonitor = null, timers = { setTimeout, clearTimeout }, stateMinIntervalMs = STATE_MIN_INTERVAL_MS, displayGraceMs = DISPLAY_GRACE_MS,
} = {}) {
  const events = new EventEmitter();
  const origins = [siteOrigin, apiOrigin].filter(Boolean);
  let win = null;
  let current = null; // { displayId, mode, url }
  let lastState = null;
  let lastEsc = -Infinity;
  let lastSentAt = -Infinity;
  let stateTimer = null;
  let graceTimer = null;
  const clearStateTimer = () => { if (stateTimer) { timers.clearTimeout(stateTimer); stateTimer = null; } };
  const clearGrace = () => { if (graceTimer) { timers.clearTimeout(graceTimer); graceTimer = null; } };

  const displays = () => {
    let primaryId = null;
    try { primaryId = screen.getPrimaryDisplay()?.id ?? null; } catch { /* yoksay */ }
    return (screen.getAllDisplays() || []).map((d, i) => describeDisplay(d, primaryId, i));
  };

  const status = () => {
    if (!(win && current)) return { open: false, displayId: null, mode: null, url: null };
    const st = { open: true, displayId: current.displayId, mode: current.mode, url: current.mode === "web" ? current.url : null };
    if (current.view) { st.view = current.view; if (current.sceneId) st.sceneId = current.sceneId; }
    if (current.waitingDisplay) st.waitingDisplay = true;
    return st;
  };
  const emitStatus = (extra = {}) => events.emit("status", { ...status(), ...extra });

  function close(reason = null) {
    const w = win;
    win = null;
    current = null;
    clearStateTimer();
    clearGrace();
    if (w && !w.isDestroyed()) {
      try { w.destroy(); } catch { /* yoksay */ }
    }
    if (w) emitStatus(reason ? { reason } : {});
    return true;
  }

  function open({ displayId, mode = "studio", url = null, matchId = null, view = null, sceneId = null } = {}) {
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
    current = { displayId: display.id, mode, url: target, label: display.label || null, size: sizeOf(display), view: VIEWS.has(view) ? view : null, sceneId: view === "scene" && sceneId != null ? String(sceneId).slice(0, 100) : null };
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
      place(w, b);
    });
    w.on("closed", () => { if (win === w) { win = null; current = null; emitStatus(); } });
    if (mode === "web") w.loadURL(target).catch(() => {});
    else Promise.resolve(loadRenderer(w, "led-output")).catch(() => {});
    log("studio: LED açıldı", { displayId: display.id, mode });
    emitStatus();
    return { ok: true, ...status() };
  }

  /** Pencereyi ekran sınırlarına koyar, gösterir, tam ekran yapar (macOS: basit tam ekran). */
  function place(w, b) {
    try {
      if (platform === "darwin" && w.isSimpleFullScreen?.()) w.setSimpleFullScreen(false);
      w.setBounds?.(b);
      w.show();
      if (platform === "darwin") w.setSimpleFullScreen ? w.setSimpleFullScreen(true) : w.setFullScreen(true);
      else w.setFullScreen?.(true);
    } catch { /* pencere kapanıyor */ }
  }

  const pushState = () => {
    stateTimer = null;
    if (!win || win.isDestroyed() || current?.mode !== "studio") return;
    lastSentAt = now();
    try { win.webContents.send("studio:led:state", lastState); } catch { /* pencere kapanıyor */ }
  };

  /** Arayüzden gelen durum → LED penceresi (yalnız studio kipi). Hızlı akış birleştirilir (son durum kaybolmaz). */
  function sendState(state, sender = null) {
    if (sender && win && !win.isDestroyed() && sender.id === win.webContents.id) return false; // LED kendine yollamaz
    lastState = state === undefined ? null : state;
    if (!win || win.isDestroyed() || current?.mode !== "studio") return false;
    if (state && typeof state === "object") {
      if (VIEWS.has(state.view)) current.view = state.view;
      if (state.view === "scene" && state.sceneId != null) current.sceneId = String(state.sceneId).slice(0, 100);
    }
    const wait = lastSentAt + stateMinIntervalMs - now();
    if (wait <= 0 && !stateTimer) { pushState(); return true; }
    if (!stateTimer) {
      stateTimer = timers.setTimeout(pushState, Math.max(0, wait));
      stateTimer?.unref?.();
    }
    return true;
  }

  const sizeOf = (d) => `${d?.bounds?.width ?? 0}x${d?.bounds?.height ?? 0}`;
  /** Seçili ekran: aynı kimlik, yoksa aynı ad + boyut (uyanınca kimlik değişebilir). */
  function findCurrentDisplay() {
    if (!current) return null;
    const list = screen.getAllDisplays() || [];
    return list.find((d) => String(d.id) === String(current.displayId))
      || (current.label ? list.find((d) => d.label === current.label && sizeOf(d) === current.size) : null)
      || null;
  }

  /** Pencereyi seçili ekrana yeniden yerleştirir (uyanma, ekran geri geldi, çözünürlük değişti). */
  function reposition(reason = null) {
    if (!win || win.isDestroyed() || !current) return false;
    const d = findCurrentDisplay();
    if (!d) return false;
    const wasWaiting = Boolean(current.waitingDisplay);
    current.displayId = d.id;
    current.size = sizeOf(d);
    current.waitingDisplay = false;
    clearGrace();
    place(win, d.bounds);
    if (wasWaiting || reason) { log("studio: LED yeniden yerleşti", { displayId: d.id, reason }); emitStatus(reason ? { reason } : {}); }
    return true;
  }

  const onDisplayRemoved = (_e, display) => {
    if (current && display && String(display.id) === String(current.displayId) && !findCurrentDisplay()) {
      if (!(displayGraceMs > 0)) close("DISPLAY_REMOVED");
      else if (!current.waitingDisplay) {
        // Uyku / kablo anlık çıktı: pencere gizlenir, ekran dönerse yerine konur.
        current.waitingDisplay = true;
        try { win?.hide?.(); } catch { /* yoksay */ }
        clearGrace();
        graceTimer = timers.setTimeout(() => { graceTimer = null; if (current?.waitingDisplay) close("DISPLAY_REMOVED"); }, displayGraceMs);
        graceTimer?.unref?.();
        emitStatus({ reason: "DISPLAY_WAIT" });
      }
    }
    events.emit("displays", displays());
  };
  const onDisplayAdded = () => {
    if (current?.waitingDisplay) reposition("DISPLAY_RESTORED");
    events.emit("displays", displays());
  };
  const onDisplayChanged = (_e, display) => {
    if (current && display && String(display.id) === String(current.displayId)) reposition();
    events.emit("displays", displays());
  };
  const onResume = () => {
    // Uyanınca ekran listesi birkaç yüz ms gecikebilir: hemen ve kısa süre sonra yeniden yerleş.
    if (!current) return;
    reposition("RESUME");
    const t = timers.setTimeout(() => reposition(), 1500);
    t?.unref?.();
  };
  screen.on?.("display-removed", onDisplayRemoved);
  screen.on?.("display-added", onDisplayAdded);
  screen.on?.("display-metrics-changed", onDisplayChanged);
  powerMonitor?.on?.("resume", onResume);
  powerMonitor?.on?.("unlock-screen", onResume);

  return {
    displays,
    open,
    close: () => close(),
    status,
    sendState,
    getState: () => lastState,
    reposition: () => reposition("MANUAL"),
    isLedContents: (wc) => Boolean(win && !win.isDestroyed() && wc && win.webContents.id === wc.id),
    dispose() {
      screen.removeListener?.("display-removed", onDisplayRemoved);
      screen.removeListener?.("display-added", onDisplayAdded);
      screen.removeListener?.("display-metrics-changed", onDisplayChanged);
      powerMonitor?.removeListener?.("resume", onResume);
      powerMonitor?.removeListener?.("unlock-screen", onResume);
      close();
    },
    events,
  };
}

module.exports = { createLedManager, isAllowedLedUrl, describeDisplay, ESC_WINDOW_MS, STATE_MIN_INTERVAL_MS, DISPLAY_GRACE_MS };
