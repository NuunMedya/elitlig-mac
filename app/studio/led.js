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
// ORTAK EKRAN (kilitlenme düzeltmesi): seçilen ekran stüdyo penceresinin
// bulunduğu ekransa (ya da tek ekran varsa) çerçevesiz tam ekran pencere
// stüdyoyu tamamen örtüyor, imleç gizli ve tek Esc LED'e ulaşmadığı için
// uygulamadan çıkılamıyordu. Artık:
//   - open() önce { ok: false, needsConfirm: true, error.code: "SHARED_DISPLAY" }
//     döner (index.js kullanıcıya sorar); onaylanırsa (confirmShared: true)
//     NORMAL, çerçeveli, boyutlanabilir bir pencere açılır (tam ekran yapılabilir
//     ama kendiliğinden yapılmaz; kiosk / basit tam ekran / alwaysOnTop YOK).
//   - Birincil ekranda hiçbir zaman basit tam ekran (simpleFullScreen) ya da
//     kiosk kullanılmaz (yalnız macOS'un kendi tam ekranı).
//   - Pencere odağı çalmaz (showInactive); açılınca stüdyo penceresi yeniden odaklanır.
// Kapatma: ortak ekranda / pencere kipinde tek Esc; ayrı ekranda 1,5 sn içinde
// iki Esc; her yerden ⌘⇧L / Ctrl+Shift+L (globalShortcut, LED açıkken);
// LED penceresindeki "Kapat" düğmesi; stüdyonun LED sekmesi; uygulama menüsü
// ve menü çubuğu simgesi (main.js); led.close() ya da ekranın çıkarılması
// (durum yayılır). Tek LED penceresi vardır; yeniden open() eskisini kapatır.
// Uyku / uyanma: ekran uykuda çıkarılıp geri gelirse (macOS harici ekranı uykuda
// "kaldırır", kimliği değişebilir) pencere displayGraceMs (2 dk) boyunca gizli
// bekler; ekran (aynı kimlik ya da aynı ad + boyut) dönünce yeniden o ekrana
// yerleşip tam ekran olur. Uyanınca (powerMonitor resume / unlock-screen) ve
// ekran ölçüleri değişince de yeniden yerleştirilir.
"use strict";

const { EventEmitter } = require("node:events");

const ESC_WINDOW_MS = 1500;
const CLOSE_ACCELERATOR = "CommandOrControl+Shift+L";
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
function describeDisplay(d, primaryId, index = 0, hostIds = null) {
  const b = d.bounds || {};
  const size = b.width && b.height ? `${b.width}×${b.height}` : "";
  const label = (typeof d.label === "string" && d.label.trim()) || `Ekran ${index + 1}${size ? ` (${size})` : ""}`;
  const out = {
    id: d.id,
    label,
    bounds: { x: b.x ?? 0, y: b.y ?? 0, width: b.width ?? 0, height: b.height ?? 0 },
    primary: d.id === primaryId,
    scaleFactor: d.scaleFactor ?? 1,
  };
  // Stüdyo (uygulama) penceresi bu ekranda mı: LED burada tam ekran açılmaz.
  if (hostIds) out.hostsStudio = hostIds.some((id) => String(id) === String(d.id));
  return out;
}

/** Ekranın çalışma alanında ortalanmış, 16:9'a yakın normal pencere (ortak ekran kipi). */
function windowedBounds(display) {
  const a = display.workArea || display.bounds || { x: 0, y: 0, width: 1280, height: 720 };
  const width = Math.max(480, Math.round(a.width * 0.6));
  const height = Math.max(270, Math.min(Math.round(a.height * 0.8), Math.round((width * 9) / 16)));
  return { x: Math.round(a.x + (a.width - width) / 2), y: Math.round(a.y + (a.height - height) / 2), width, height };
}

function createLedManager({
  BrowserWindow, screen, loadRenderer, preloadPath, siteOrigin = "https://elitlig.com", apiOrigin = null,
  platform = process.platform, now = () => Date.now(), log = () => {},
  powerMonitor = null, timers = { setTimeout, clearTimeout }, stateMinIntervalMs = STATE_MIN_INTERVAL_MS, displayGraceMs = DISPLAY_GRACE_MS,
  globalShortcut = null, // LED açıkken ⌘⇧L kapatır; LED odaktayken Esc
  getHostWindows = null, // () => [BrowserWindow] — stüdyo / uygulama pencereleri (varsayılan: görünür tüm pencereler)
  closeAccelerator = CLOSE_ACCELERATOR,
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

  const primaryId = () => {
    try { return screen.getPrimaryDisplay()?.id ?? null; } catch { return null; }
  };

  /** Stüdyo / uygulama pencereleri (LED hariç). */
  function hostWindows() {
    let list = [];
    try { list = typeof getHostWindows === "function" ? getHostWindows() || [] : BrowserWindow.getAllWindows?.() || []; } catch { list = []; }
    return list.filter((w) => w && w !== win && !w.isDestroyed?.() && w.isVisible?.() !== false);
  }

  /** Stüdyo penceresinin bulunduğu ekranlar. */
  function hostDisplayIds() {
    const ids = [];
    for (const w of hostWindows()) {
      try {
        const b = w.getBounds?.();
        const d = b && screen.getDisplayMatching ? screen.getDisplayMatching(b) : null;
        if (d && !ids.some((id) => String(id) === String(d.id))) ids.push(d.id);
      } catch { /* yoksay */ }
    }
    return ids;
  }

  /** LED bu ekranda stüdyoyu örter mi: tek ekran ya da stüdyo penceresi orada (bilinmiyorsa birincil). */
  function isSharedDisplay(display, list = screen.getAllDisplays() || []) {
    if (list.length <= 1) return true;
    const hosts = hostDisplayIds();
    if (hosts.length) return hosts.some((id) => String(id) === String(display.id));
    return String(display.id) === String(primaryId());
  }

  const displays = () => {
    const hosts = hostDisplayIds();
    const pid = primaryId();
    return (screen.getAllDisplays() || []).map((d, i) => describeDisplay(d, pid, i, hosts));
  };

  const status = () => {
    if (!(win && current)) return { open: false, displayId: null, mode: null, url: null };
    const st = { open: true, displayId: current.displayId, mode: current.mode, url: current.mode === "web" ? current.url : null, windowed: Boolean(current.windowed), closeShortcut: closeAccelerator };
    if (current.view) { st.view = current.view; if (current.sceneId) st.sceneId = current.sceneId; }
    if (current.waitingDisplay) st.waitingDisplay = true;
    return st;
  };

  /* ------------------------------ kısayollar ------------------------------ */

  const registered = new Set();
  function registerShortcut(acc, fn) {
    if (!globalShortcut || registered.has(acc)) return;
    try { if (globalShortcut.register(acc, fn) !== false) registered.add(acc); } catch { /* başka uygulama tutuyor */ }
  }
  function unregisterShortcut(acc) {
    if (!registered.has(acc)) return;
    registered.delete(acc);
    try { globalShortcut.unregister(acc); } catch { /* yoksay */ }
  }
  const unregisterAll = () => { for (const acc of [...registered]) unregisterShortcut(acc); };

  /** Esc: pencere kipinde (ortak ekran) tek basış, ayrı LED ekranında 1,5 sn içinde iki basış kapatır. */
  function onEsc() {
    if (!win || !current) return;
    if (current.windowed) { close("ESC"); return; }
    const t = now();
    if (t - lastEsc <= ESC_WINDOW_MS) { lastEsc = -Infinity; close("ESC"); return; }
    lastEsc = t;
    emitStatus({ hint: "ESC_AGAIN" });
  }

  /** Stüdyo penceresine odağı geri ver (LED odağı kalıcı çalmasın). */
  function focusHost() {
    const host = hostWindows()[0];
    try { if (host) { if (host.isMinimized?.()) host.restore?.(); host.focus?.(); } } catch { /* yoksay */ }
  }
  const emitStatus = (extra = {}) => events.emit("status", { ...status(), ...extra });

  function close(reason = null) {
    const w = win;
    win = null;
    current = null;
    clearStateTimer();
    clearGrace();
    unregisterAll();
    if (w && !w.isDestroyed()) {
      try { w.destroy(); } catch { /* yoksay */ }
    }
    if (w) emitStatus(reason ? { reason } : {});
    // Kullanıcı kapattı (Esc / kısayol / menü / düğme): stüdyo penceresi öne gelsin.
    if (w && reason && reason !== "DISPLAY_REMOVED") focusHost();
    return true;
  }

  function open({ displayId, mode = "studio", url = null, matchId = null, view = null, sceneId = null, confirmShared = false, windowed: wantWindowed = false } = {}) {
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
    // Stüdyonun ekranı (ya da tek ekran): önce sor; onaylanırsa normal pencere.
    const shared = isSharedDisplay(display, list);
    if (shared && !confirmShared && !wantWindowed) {
      return {
        ok: false,
        needsConfirm: true,
        displayId: display.id,
        error: {
          code: "SHARED_DISPLAY",
          message: list.length <= 1
            ? "Yalnız bir ekran var: LED çıkışı tam ekran açılırsa stüdyoyu örter. LED çıkışı normal bir pencere olarak açılabilir (Esc ya da ⌘⇧L ile kapanır)."
            : "Seçilen ekranda stüdyo penceresi de açık: LED çıkışı tam ekran açılırsa stüdyoyu örter. LED'i ikinci ekrana (LED / projektör) verin ya da normal pencere olarak açın.",
        },
      };
    }
    const windowed = shared || Boolean(wantWindowed);
    close();
    const b = display.bounds;
    const wb = windowed ? windowedBounds(display) : b;
    const w = new BrowserWindow({
      x: wb.x, y: wb.y, width: wb.width, height: wb.height,
      ...(windowed
        // Normal pencere: çerçeve + kapat düğmesi, boyutlanabilir, istenirse tam ekran yapılabilir.
        ? { frame: true, resizable: true, minimizable: true, maximizable: true, fullscreenable: true, fullscreen: false, minWidth: 320, minHeight: 180 }
        // Ayrı LED ekranı: çerçevesiz tam ekran (macOS: önce ekrana yerleş, sonra tam ekran).
        : { frame: false, fullscreen: platform !== "darwin", fullscreenable: true }),
      kiosk: false,
      alwaysOnTop: false,
      autoHideMenuBar: true,
      backgroundColor: "#000000",
      show: false,
      skipTaskbar: false,
      title: windowed ? "Elitlig LED (pencere · Esc ile kapanır)" : "Elitlig LED",
      webPreferences: mode === "studio"
        ? { preload: preloadPath, contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: false, spellcheck: false }
        : { contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: false, spellcheck: false, autoplayPolicy: "no-user-gesture-required" },
    });
    win = w;
    current = { displayId: display.id, mode, url: target, label: display.label || null, size: sizeOf(display), windowed, primary: String(display.id) === String(primaryId()), view: VIEWS.has(view) ? view : null, sceneId: view === "scene" && sceneId != null ? String(sceneId).slice(0, 100) : null };
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
    // Esc: pencere kipinde tek, ayrı ekranda iki basış (onEsc). Ana süreçte yakalanır:
    // LED arayüzü takılsa da çalışır.
    wc.on("before-input-event", (event, input) => {
      if (input.type !== "keyDown" || input.key !== "Escape") return;
      event.preventDefault?.();
      onEsc();
    });
    // LED odaktayken Esc ayrıca genel kısayol (ön yüz hiç yanıt vermese de kapanır).
    w.on?.("focus", () => { if (win === w) registerShortcut("Escape", onEsc); });
    w.on?.("blur", () => unregisterShortcut("Escape"));
    registerShortcut(closeAccelerator, () => close("SHORTCUT"));
    wc.on("did-finish-load", () => {
      if (mode === "studio" && lastState !== null && win === w && !w.isDestroyed()) wc.send("studio:led:state", lastState);
    });
    w.once("ready-to-show", () => {
      if (win !== w || w.isDestroyed()) return;
      place(w, b, display);
    });
    w.on("closed", () => { if (win === w) { win = null; current = null; clearStateTimer(); clearGrace(); unregisterAll(); emitStatus(); } });
    if (mode === "web") w.loadURL(target).catch(() => {});
    else Promise.resolve(loadRenderer(w, "led-output")).catch(() => {});
    log("studio: LED açıldı", { displayId: display.id, mode, windowed });
    emitStatus();
    return { ok: true, ...status() };
  }

  /**
   * Pencereyi yerleştirir ve odak çalmadan gösterir (showInactive). Pencere
   * kipinde (ortak ekran) tam ekran YAPILMAZ. Ayrı ekranda tam ekran: macOS'ta
   * ikincil ekranda basit tam ekran (Space değiştirmez), birincil ekranda yalnız
   * macOS'un kendi tam ekranı (menü / Dock / ⌘Tab erişilebilir kalır).
   */
  function place(w, b, display = null) {
    try {
      if (platform === "darwin" && w.isSimpleFullScreen?.()) w.setSimpleFullScreen(false);
      if (current?.windowed) {
        w.setBounds?.(display ? windowedBounds(display) : b);
        if (w.showInactive) w.showInactive(); else w.show();
      } else {
        w.setBounds?.(b);
        if (w.showInactive) w.showInactive(); else w.show();
        if (platform === "darwin" && !current?.primary && w.setSimpleFullScreen) w.setSimpleFullScreen(true);
        else w.setFullScreen?.(true);
      }
    } catch { /* pencere kapanıyor */ }
    // Tam ekrana geçiş odağı alabilir: stüdyo penceresine geri ver. Pencere kipinde
    // showInactive zaten odak almaz (stüdyoyu öne almak LED penceresini arkada bırakırdı).
    if (current?.windowed) return;
    focusHost();
    const t = timers.setTimeout(() => { if (win === w) focusHost(); }, 300);
    t?.unref?.();
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
    place(win, d.bounds, d);
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
    close: (reason) => close(reason || null),
    isSharedDisplay: (displayId) => {
      const list = screen.getAllDisplays() || [];
      const d = list.find((x) => String(x.id) === String(displayId));
      return d ? isSharedDisplay(d, list) : false;
    },
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

module.exports = { createLedManager, isAllowedLedUrl, describeDisplay, windowedBounds, ESC_WINDOW_MS, STATE_MIN_INTERVAL_MS, DISPLAY_GRACE_MS, CLOSE_ACCELERATOR };
