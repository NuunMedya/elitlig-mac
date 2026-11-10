// Masaüstü widget'ları (ana süreç): kullanıcının masaüstüne yerleştirdiği küçük, çerçevesiz,
// sürüklenebilir pencereler — saat, ajanda, yapılacaklar, not, müzik, pano, sayaç, sistem,
// hava durumu, maçlar, döviz. Konumlar ve seçenekler userData/widgets.json'da; açılışta geri yüklenir.
//
// Pencere davranışı:
//   • çerçevesiz, şeffaf, köşeleri yuvarlak; Dock / görev çubuğunda görünmez (skipTaskbar)
//   • macOS: tüm masaüstlerinde (Spaces) görünür; Mission Control'de gizli
//   • katman: "normal" (diğer pencerelerin altında kalır), "top" (üstte sabit) ya da yalnız
//     macOS'ta "desktop" (masaüstü düzeyine gömülü, tıklanmaz — salt görüntü widget'ları için)
//   • kilitliyken sürüklenmez; sağ tık / ⋯ menüsü: boyut, saydamlık, katman, kilit, kaldır
//
// Arayüz: renderer/src/widgets (#widget=<tür>&id=<kimlik>). Kısayol (göster/gizle) app/toolkit.js'te
// kaydedilir (varsayılan ⌃⌥W).
//
// IPC: widgets:state · widgets:add · widgets:update · widgets:remove · widgets:visible · widgets:toggle
//      widgets:theme · widgets:self · widgets:menu · widgets:system · widgets:weather · widgets:matches
//      widgets:rates · widgets:open
// Olaylar: widgets:changed (tüm pencereler) · widget:config (ilgili widget) · widget:settings
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const C = require("./catalog");
const { createFeeds } = require("./feeds");
const { createSystemStats } = require("./system");

function registerWidgets(deps) {
  const {
    app, ipcMain, BrowserWindow, Menu, screen, net, nativeTheme,
    loadRenderer, webPreferences, guardNavigation, showMain, broadcast,
    deskkit = null, publicOrigin, isMac = process.platform === "darwin", log = () => {},
  } = deps;
  const platform = deps.platform || process.platform;
  const FILE = path.join(app.getPath("userData"), "widgets.json");
  let store = C.normalizeStore(null);
  try { store = C.normalizeStore(JSON.parse(fs.readFileSync(FILE, "utf8"))); } catch { /* ilk açılış */ }
  let saveTimer = null;
  const saveNow = () => { clearTimeout(saveTimer); saveTimer = null; try { fs.writeFileSync(FILE, JSON.stringify(store, null, 2)); } catch { /* yoksay */ } };
  const save = () => { clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 400); };

  const feeds = createFeeds({ net, publicOrigin });
  const systemStats = createSystemStats();
  const windows = new Map(); // id → BrowserWindow
  const byWebContents = (wc) => { for (const [id, w] of windows) if (!w.isDestroyed() && w.webContents.id === wc.id) return id; return null; };
  const itemOf = (id) => store.items.find((i) => i.id === id) || null;
  const canDesktop = isMac; // macOS: masaüstü düzeyi (etkileşimsiz)
  const levelOf = (it) => (it.level === "desktop" && !canDesktop ? "normal" : it.level);

  const state = () => ({
    visible: store.visible,
    theme: store.theme,
    items: store.items,
    catalog: C.CATALOG.map(({ type, label, icon, hint, session, net: needsNet, interactive, sizes }) => ({ type, label, icon, hint, session: Boolean(session), net: Boolean(needsNet), interactive: Boolean(interactive), sizes })),
    canDesktop,
    platform,
    shortcut: deskkit?.settings().widgets?.shortcut || "",
  });
  const changed = () => {
    broadcast("widgets:changed", state());
    deps.refreshTray?.();
    deps.rebuildMenu?.();
  };
  const sendConfig = (it) => {
    const w = windows.get(it.id);
    if (w && !w.isDestroyed()) w.webContents.send("widget:config", { item: it, theme: store.theme });
  };

  /* ------------------------------ pencereler ------------------------------ */

  function createWindow(it) {
    const size = C.sizeOf(it);
    const pos = C.clampToDisplays({ x: it.x, y: it.y, ...size }, screen.getAllDisplays());
    if (pos.x !== it.x || pos.y !== it.y) { it.x = pos.x; it.y = pos.y; save(); }
    const level = levelOf(it);
    const win = new BrowserWindow({
      x: it.x, y: it.y, width: size.width, height: size.height,
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: "#00000000",
      hasShadow: level !== "desktop",
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      movable: !it.locked,
      roundedCorners: true,
      alwaysOnTop: level === "top",
      title: `Widget · ${C.catalogOf(it.type)?.label || it.type}`,
      ...(level === "desktop" ? { type: "desktop", focusable: false } : {}),
      webPreferences: webPreferences(),
    });
    guardNavigation(win);
    if (isMac) {
      try { win.setVisibleOnAllWorkspaces(true, { skipTransformProcessType: true }); } catch { /* yoksay */ }
      try { win.setHiddenInMissionControl?.(true); } catch { /* yoksay */ }
    }
    if (level === "top") { try { win.setAlwaysOnTop(true, "floating"); } catch { /* yoksay */ } }
    let moveTimer = null;
    win.on("moved", () => {
      clearTimeout(moveTimer);
      moveTimer = setTimeout(() => {
        if (win.isDestroyed()) return;
        const cur = itemOf(it.id);
        if (!cur) return;
        const b = win.getBounds();
        cur.x = b.x;
        cur.y = b.y;
        save();
      }, 150);
    });
    win.on("closed", () => { if (windows.get(it.id) === win) windows.delete(it.id); });
    win.webContents.on("did-finish-load", () => sendConfig(itemOf(it.id) || it));
    loadRenderer(win, `widget=${it.type}&id=${it.id}`);
    win.once("ready-to-show", () => { if (store.visible && !win.isDestroyed()) win.showInactive(); });
    windows.set(it.id, win);
    return win;
  }

  const destroyWindow = (id) => {
    const w = windows.get(id);
    windows.delete(id);
    if (w && !w.isDestroyed()) w.destroy();
  };

  /** Kayıttaki değişikliği açık pencereye uygula (gerekirse yeniden oluştur). */
  function applyToWindow(it, prev) {
    const w = windows.get(it.id);
    if (!w || w.isDestroyed()) { createWindow(it); return; }
    // Masaüstü düzeyi pencere türüyle belirlenir: değişince pencere yeniden kurulur.
    if ((levelOf(prev) === "desktop") !== (levelOf(it) === "desktop")) { destroyWindow(it.id); createWindow(it); return; }
    if (prev.size !== it.size) {
      const s = C.sizeOf(it);
      const b = w.getBounds();
      w.setBounds({ x: b.x, y: b.y, width: s.width, height: s.height });
    }
    if (prev.locked !== it.locked) w.setMovable(!it.locked);
    if (prev.level !== it.level) {
      if (levelOf(it) === "top") w.setAlwaysOnTop(true, "floating");
      else w.setAlwaysOnTop(false);
    }
    sendConfig(it);
  }

  /* ------------------------------ işlemler ------------------------------ */

  function add(type, options = {}) {
    if (!C.TYPES.has(type)) return { ok: false, error: "Bilinmeyen widget türü." };
    if (store.items.length >= 24) return { ok: false, error: "En çok 24 widget eklenebilir." };
    const draft = C.normalizeItem({ id: C.newId(), type, size: "small", options });
    const size = C.sizeOf(draft);
    const primary = screen.getPrimaryDisplay();
    const existing = store.items.map((i) => ({ x: i.x, y: i.y, ...C.sizeOf(i) }));
    const pos = C.placeNew(size, existing, primary.workArea);
    const it = { ...draft, x: pos.x, y: pos.y };
    store.items.push(it);
    if (!store.visible) { store.visible = true; for (const w of windows.values()) if (!w.isDestroyed()) w.showInactive(); }
    saveNow();
    createWindow(it);
    changed();
    return { ok: true, item: it };
  }

  function update(id, patch) {
    const cur = itemOf(id);
    if (!cur) return { ok: false, error: "Widget bulunamadı." };
    const p = patch && typeof patch === "object" ? patch : {};
    const next = C.normalizeItem({
      ...cur,
      ...(p.size ? { size: p.size } : {}),
      ...(p.opacity != null ? { opacity: p.opacity } : {}),
      ...(p.locked != null ? { locked: p.locked } : {}),
      ...(p.level ? { level: p.level } : {}),
      ...(p.options ? { options: { ...cur.options, ...p.options } } : {}),
    });
    if (!next) return { ok: false, error: "Geçersiz değer." };
    const prev = { ...cur };
    Object.assign(cur, next);
    saveNow();
    applyToWindow(cur, prev);
    changed();
    return { ok: true, item: cur };
  }

  function remove(id) {
    const before = store.items.length;
    store.items = store.items.filter((i) => i.id !== id);
    destroyWindow(id);
    if (store.items.length !== before) { saveNow(); changed(); }
    return { ok: true };
  }

  function setVisible(on) {
    store.visible = Boolean(on);
    for (const it of store.items) {
      const w = windows.get(it.id);
      if (store.visible) { if (!w || w.isDestroyed()) createWindow(it); else w.showInactive(); } else if (w && !w.isDestroyed()) w.hide();
    }
    saveNow();
    changed();
    return { ok: true, visible: store.visible };
  }
  const toggleAll = () => {
    if (!store.items.length) { showMain("toolkit:widgets"); return { ok: true, visible: false }; }
    return setVisible(!store.visible);
  };

  function setTheme(theme) {
    if (!C.THEMES.includes(theme)) return { ok: false };
    store.theme = theme;
    saveNow();
    for (const it of store.items) sendConfig(it);
    changed();
    return { ok: true, theme };
  }

  /** Widget'ın sağ tık / ⋯ menüsü (yerel menü: pencere küçük olsa da taşmaz). */
  function popupMenu(id, win) {
    const it = itemOf(id);
    if (!it) return;
    const c = C.catalogOf(it.type);
    const radio = (label, checked, click, extra = {}) => ({ label, type: "radio", checked, click, ...extra });
    const hasSettings = ["clock", "weather", "rates", "matches"].includes(it.type);
    const template = [
      { label: c?.label || "Widget", enabled: false },
      ...(hasSettings ? [{ label: "Ayarlar…", click: () => win.webContents.send("widget:settings", { open: true }) }] : []),
      { type: "separator" },
      { label: "Boyut", submenu: [radio("Küçük", it.size === "small", () => update(id, { size: "small" })), radio("Orta", it.size === "medium", () => update(id, { size: "medium" }))] },
      { label: "Arka plan saydamlığı", submenu: [100, 90, 80, 65, 50].map((v) => radio(`%${v} opak`, it.opacity === v, () => update(id, { opacity: v }))) },
      { label: "Katman", submenu: [
        radio("Normal (diğer pencerelerin altında)", levelOf(it) === "normal", () => update(id, { level: "normal" })),
        radio("Üstte sabitle", levelOf(it) === "top", () => update(id, { level: "top" })),
        ...(canDesktop ? [radio("Masaüstüne göm (tıklanmaz)", levelOf(it) === "desktop", () => update(id, { level: "desktop" }), { enabled: !c?.interactive || it.level === "desktop" })] : []),
      ] },
      { label: "Kilitle (sürüklenmez)", type: "checkbox", checked: it.locked, click: (m) => update(id, { locked: m.checked }) },
      { label: "Tema", submenu: [["auto", "Sisteme uy"], ["light", "Açık"], ["dark", "Koyu"]].map(([v, l]) => radio(l, store.theme === v, () => setTheme(v))) },
      { type: "separator" },
      { label: "Widget galerisi…", click: () => showMain("toolkit:widgets") },
      { label: "Tüm widget'ları gizle", click: () => setVisible(false) },
      { label: "Bu widget'ı kaldır", click: () => remove(id) },
    ];
    Menu.buildFromTemplate(template).popup({ window: win });
  }

  /* ------------------------------ IPC ------------------------------ */

  const senderWin = (event) => BrowserWindow.fromWebContents(event.sender);
  ipcMain.handle("widgets:state", () => state());
  ipcMain.handle("widgets:add", (_e, type, options) => add(String(type || ""), options && typeof options === "object" ? options : {}));
  ipcMain.handle("widgets:update", (_e, id, patch) => update(String(id || ""), patch));
  ipcMain.handle("widgets:remove", (_e, id) => remove(String(id || "")));
  ipcMain.handle("widgets:visible", (_e, on) => setVisible(Boolean(on)));
  ipcMain.handle("widgets:toggle", () => toggleAll());
  ipcMain.handle("widgets:theme", (_e, theme) => setTheme(String(theme || "")));
  ipcMain.handle("widgets:self", (event) => {
    const id = byWebContents(event.sender);
    const it = id ? itemOf(id) : null;
    return it ? { ok: true, item: it, theme: store.theme, canDesktop } : { ok: false };
  });
  ipcMain.handle("widgets:menu", (event) => {
    const id = byWebContents(event.sender);
    const win = senderWin(event);
    if (id && win) popupMenu(id, win);
    return { ok: Boolean(id) };
  });
  ipcMain.handle("widgets:system", () => systemStats());
  ipcMain.handle("widgets:weather", (_e, city) => feeds.weather(String(city || "")));
  ipcMain.handle("widgets:matches", (_e, opts) => feeds.matches({ city: String(opts?.city || "").slice(0, 40) }));
  ipcMain.handle("widgets:rates", (_e, force) => (deskkit ? deskkit.getRates({ force: Boolean(force) }) : { ok: false, error: "Kur servisi yok." }));
  ipcMain.handle("widgets:open", (_e, route) => { showMain(typeof route === "string" ? route.slice(0, 60) : undefined); return { ok: true }; });

  // Müzik widget'ları: çalar durumu ana pencereden gelir (app/toolkit.js) ve buraya aktarılır.
  deskkit?.onMusicState((s) => {
    for (const it of store.items) {
      if (it.type !== "music") continue;
      const w = windows.get(it.id);
      if (w && !w.isDestroyed()) w.webContents.send("music:state", s);
    }
  });
  nativeTheme?.on?.("updated", () => { for (const it of store.items) sendConfig(it); });

  /** Açılışta kayıtlı widget'ları geri yükle. */
  function restore() {
    for (const it of store.items) { try { createWindow(it); } catch (e) { log("[widget]", e); } }
  }
  app.on("before-quit", () => { if (saveTimer) saveNow(); });

  return {
    restore, add, update, remove, setVisible, toggleAll, setTheme,
    list: () => store.items,
    visible: () => store.visible && store.items.length > 0,
    catalog: () => C.CATALOG,
    state,
    _windows: windows,
  };
}

module.exports = { registerWidgets };
