// Masaüstü widget'ları (ana süreç): kullanıcının masaüstüne yerleştirdiği küçük, çerçevesiz,
// sürüklenebilir pencereler — saat, ajanda (gün / hafta / ay), yapılacaklar, karalama, sabit notlar,
// müzik, pano, sayaç, odak, sistem, hava, maçlar, canlı maç, puan durumu, döviz, mesajlar, talepler,
// projeler, muhasebe, ekipman, bugün özeti, rehber, hızlı kayıt, Yayın Stüdyosu, başlatıcı ve araç
// çubuğu (katalog: ./catalog.js). Konumlar ve seçenekler userData/widgets.json'da; açılışta geri yüklenir.
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
//      widgets:rates · widgets:open · widgets:match · widgets:leagues · widgets:standings · widgets:studio
// Olaylar: widgets:changed (tüm pencereler) · widget:config (ilgili widget) · widget:settings
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const C = require("./catalog");
const L = require("./layer");
const { createFeeds } = require("./feeds");
const { createSystemStats } = require("./system");

const LOGIN_ARG = "--elitlig-login";

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
  const glassOf = new Map(); // id → cam malzeme kullanılıyor mu
  let editing = false; // "Widget'ları düzenle" kipi (kaydedilmez)
  const byWebContents = (wc) => { for (const [id, w] of windows) if (!w.isDestroyed() && w.webContents.id === wc.id) return id; return null; };
  const itemOf = (id) => store.items.find((i) => i.id === id) || null;
  const canEmbed = platform === "darwin"; // macOS: masaüstü arka plan düzeyi (etkileşimsiz)
  const levelOf = (it) => L.effectiveLevel(it.level, platform);
  const displays = () => screen.getAllDisplays();

  // Windows: masaüstü katmanındaki widget'ları Z sırasının en altına gönder (SetWindowPos HWND_BOTTOM).
  const winBottom = platform === "win32" && deps.spawn !== null
    ? L.createWinBottom({ spawn: deps.spawn || require("node:child_process").spawn, fs, path, tmpDir: path.join(app.getPath("temp"), "elitlig-araclar"), log })
    : null;
  const sendToBottom = (ids) => {
    if (!winBottom) return;
    const hwnds = [];
    for (const id of ids) {
      const it = itemOf(id);
      const w = windows.get(id);
      if (!it || !w || w.isDestroyed() || levelOf(it) !== "desktop") continue;
      try { const h = L.hwndOf(w.getNativeWindowHandle()); if (h) hwnds.push(h); } catch { /* yoksay */ }
    }
    winBottom.send(hwnds);
  };

  const sizeInfo = (c) => {
    const keys = C.SIZE_KEYS.filter((k) => c.sizes[k]);
    return { sizes: c.sizes, sizeKeys: c.bar ? Object.keys(c.sizes) : keys, defaultSize: Object.keys(c.sizes)[0], bar: Boolean(c.bar) };
  };
  const state = () => ({
    visible: store.visible,
    theme: store.theme,
    grid: store.grid,
    dim: store.dim,
    material: store.material,
    atLogin: store.atLogin,
    loginSupported: Boolean(app.isPackaged && app.setLoginItemSettings),
    editing,
    items: store.items,
    catalog: C.CATALOG.map(({ type, category, label, icon, hint, session, net: needsNet, interactive, settings, ...c }) => ({ type, category, label, icon, hint, session: Boolean(session), net: Boolean(needsNet), interactive: Boolean(interactive), settings: Boolean(settings), ...sizeInfo(c) })),
    categories: C.CATEGORIES,
    sizeLabels: C.SIZE_LABELS,
    canDesktop: canEmbed,
    canEmbed,
    platform,
    shortcut: deskkit?.settings().widgets?.shortcut || "",
  });
  const changed = () => {
    broadcast("widgets:changed", state());
    deps.refreshTray?.();
    deps.rebuildMenu?.();
  };
  const configOf = (it) => ({ item: it, theme: store.theme, editing, dim: store.dim, glass: Boolean(glassOf.get(it.id)), level: levelOf(it), grid: store.grid });
  const sendConfig = (it) => {
    const w = windows.get(it.id);
    if (w && !w.isDestroyed()) w.webContents.send("widget:config", configOf(it));
  };
  const sendAll = () => { for (const it of store.items) sendConfig(it); };

  /** Diğer widget'ların dikdörtgenleri (çakışma denetimi). */
  const othersOf = (id) => store.items.filter((i) => i.id !== id && windows.get(i.id) && !windows.get(i.id).isDestroyed()).map((i) => ({ x: i.x, y: i.y, ...C.sizeOf(i) }));
  /** Konumu kaydet (mutlak + ekran içi oransal). */
  const remember = (it, pos) => {
    const size = C.sizeOf(it);
    it.x = pos.x;
    it.y = pos.y;
    const d = C.displayOf({ ...pos, ...size }, displays());
    it.disp = d ? C.relativePos({ ...pos, ...size }, d) : null;
  };

  /* ------------------------------ pencereler ------------------------------ */

  function createWindow(it) {
    const size = C.sizeOf(it);
    const pos = it.disp ? C.resolvePosition(it, size, displays(), { grid: store.grid }) : C.clampToDisplays({ x: it.x, y: it.y, ...size }, displays());
    if (pos.x !== it.x || pos.y !== it.y || !it.disp) { remember(it, pos); save(); }
    const { options, glass, level } = L.windowOptions({ level: it.level, material: store.material, platform, locked: it.locked && !editing });
    glassOf.set(it.id, glass);
    const win = new BrowserWindow({
      x: it.x, y: it.y, width: size.width, height: size.height,
      ...options,
      title: `Widget · ${C.catalogOf(it.type)?.label || it.type}`,
      webPreferences: webPreferences(),
    });
    guardNavigation(win);
    if (isMac) {
      // Tüm Spaces'te; tam ekran uygulamaların üstüne çıkmaz; Mission Control'de gizli.
      try { win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false, skipTransformProcessType: true }); } catch { /* yoksay */ }
      try { win.setHiddenInMissionControl?.(true); } catch { /* yoksay */ }
    }
    if (level === "top") { try { win.setAlwaysOnTop(true, "floating"); } catch { /* yoksay */ } }
    // Taşıma bitince: ızgaraya hizala, çakışmayı çöz, konumu (ekranla birlikte) kaydet.
    let moveTimer = null;
    const settle = () => {
      clearTimeout(moveTimer);
      moveTimer = setTimeout(() => {
        if (win.isDestroyed()) return;
        const cur = itemOf(it.id);
        if (!cur) return;
        const b = win.getBounds();
        const next = C.arrange(b, othersOf(cur.id), displays(), { grid: store.grid });
        if (next.x !== b.x || next.y !== b.y) { try { win.setBounds({ ...next, width: b.width, height: b.height }, isMac); } catch { win.setBounds({ ...next, width: b.width, height: b.height }); } }
        remember(cur, next);
        save();
      }, platform === "linux" ? 350 : 120);
    };
    win.on("moved", settle);
    if (platform === "linux") win.on("move", settle); // Linux'ta yalnız "move" gelir
    // Masaüstü katmanı: yazı alanı için geçici odak bitince eski hâle dön ve (Windows) en alta in.
    let hadFocus = false;
    win.on("focus", () => { hadFocus = true; });
    win.on("blur", () => {
      // Yalnız gerçekten odak almışsa (yazı alanı) geri al; başarısız odak denemesi sayılmaz.
      if (!hadFocus) return;
      hadFocus = false;
      const cur = itemOf(it.id);
      if (!cur || win.isDestroyed() || levelOf(cur) !== "desktop") return;
      try { win.setFocusable(false); } catch { /* yoksay */ }
      sendToBottom([cur.id]);
    });
    win.on("closed", () => { if (windows.get(it.id) === win) windows.delete(it.id); });
    win.webContents.on("did-finish-load", () => sendConfig(itemOf(it.id) || it));
    loadRenderer(win, `widget=${it.type}&id=${it.id}`);
    win.once("ready-to-show", () => {
      if (store.visible && !win.isDestroyed()) { win.showInactive(); sendToBottom([it.id]); }
    });
    windows.set(it.id, win);
    return win;
  }

  const destroyWindow = (id) => {
    const w = windows.get(id);
    windows.delete(id);
    if (w && !w.isDestroyed()) w.destroy();
  };
  const rebuild = (it) => { destroyWindow(it.id); createWindow(it); };

  /** Kayıttaki değişikliği açık pencereye uygula (gerekirse yeniden oluştur). */
  function applyToWindow(it, prev) {
    const w = windows.get(it.id);
    if (!w || w.isDestroyed()) { createWindow(it); return; }
    // Katman pencere türü / odaklanabilirlik / malzemeyle kurulur: değişince pencere yeniden kurulur.
    if (levelOf(prev) !== levelOf(it)) { rebuild(it); return; }
    if (prev.size !== it.size) {
      const s = C.sizeOf(it);
      const b = w.getBounds();
      // Büyüyen widget ekrandan taşmasın, başkasının üstüne binmesin (ızgara).
      const pos = C.arrange({ x: b.x, y: b.y, ...s }, othersOf(it.id), displays(), { grid: store.grid });
      remember(it, pos);
      save();
      w.setBounds({ x: pos.x, y: pos.y, width: s.width, height: s.height });
    }
    if (prev.locked !== it.locked) w.setMovable(editing || !it.locked);
    sendConfig(it);
  }

  /* ------------------------------ işlemler ------------------------------ */

  function add(type, options = {}, sizeKey) {
    if (!C.TYPES.has(type)) return { ok: false, error: "Bilinmeyen widget türü." };
    if (store.items.length >= 24) return { ok: false, error: "En çok 24 widget eklenebilir." };
    // Boyut baştan verilirse (galeri önizlemesinde seçilen) yer o boyuta göre aranır.
    const draft = C.normalizeItem({ id: C.newId(), type, size: C.sizeKeyOf(type, sizeKey), options });
    const size = C.sizeOf(draft);
    const primary = screen.getPrimaryDisplay();
    const existing = store.items.map((i) => ({ x: i.x, y: i.y, ...C.sizeOf(i) }));
    const pos = store.grid ? C.placeOnGrid(size, existing, primary.workArea) : C.placeNew(size, existing, primary.workArea);
    const it = { ...draft };
    remember(it, pos);
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
    // Etkileşimli widget etkileşimsiz katmana konamaz.
    if (next.level === "embed" && (C.catalogOf(cur.type)?.interactive || !canEmbed)) next.level = cur.level === "embed" ? "desktop" : cur.level;
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
    glassOf.delete(id);
    if (store.items.length !== before) { saveNow(); changed(); }
    if (!store.items.length && editing) setEditing(false);
    return { ok: true };
  }

  function setVisible(on) {
    store.visible = Boolean(on);
    for (const it of store.items) {
      const w = windows.get(it.id);
      if (store.visible) { if (!w || w.isDestroyed()) createWindow(it); else w.showInactive(); } else if (w && !w.isDestroyed()) w.hide();
    }
    if (store.visible) sendToBottom(store.items.map((i) => i.id));
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
    sendAll();
    changed();
    return { ok: true, theme };
  }

  /** "Widget'ları düzenle" (macOS'taki gibi): tüm widget'lar çerçeveli, sabitli olanlar da taşınır, kaldır / boyut düğmeleri. */
  function setEditing(on) {
    editing = Boolean(on);
    for (const it of store.items) {
      const w = windows.get(it.id);
      if (!w || w.isDestroyed()) continue;
      w.setMovable(editing || !it.locked);
      if (editing && !w.isVisible() && store.visible) w.showInactive();
    }
    if (editing && !store.visible) setVisible(true);
    sendAll();
    changed();
    return { ok: true, editing };
  }

  /** Giriş sırasında başlat (macOS / Windows; yalnız paketli uygulamada sisteme yazılır). */
  function applyLogin() {
    if (!app.isPackaged || !app.setLoginItemSettings) return false;
    try {
      app.setLoginItemSettings({ openAtLogin: store.atLogin, openAsHidden: true, args: [LOGIN_ARG] });
      return true;
    } catch (e) { log("[widget] giriş öğesi", e); return false; }
  }

  /** Genel ayarlar: ızgara, soluk görünüm, malzeme, girişte başlat. */
  function setSettings(patch) {
    const p = patch && typeof patch === "object" ? patch : {};
    const prevMaterial = store.material;
    if (p.grid != null) store.grid = Boolean(p.grid);
    if (p.dim != null) store.dim = Boolean(p.dim);
    if (p.material && C.MATERIALS.includes(p.material)) store.material = p.material;
    if (p.atLogin != null) { store.atLogin = Boolean(p.atLogin); applyLogin(); }
    saveNow();
    if (prevMaterial !== store.material) { for (const it of store.items) if (windows.get(it.id)) rebuild(it); } else sendAll();
    if (p.grid) relayout();
    changed();
    return { ok: true, ...state() };
  }

  /** Ekran eklendi / çıkarıldı / çözünürlük değişti: her widget kendi ekranında oransal yerine. */
  function relayout() {
    const all = displays();
    for (const it of store.items) {
      const w = windows.get(it.id);
      if (!w || w.isDestroyed()) continue;
      const size = C.sizeOf(it);
      const pos = C.resolvePosition(it, size, all, { grid: store.grid });
      const b = w.getBounds();
      if (pos.x !== b.x || pos.y !== b.y) w.setBounds({ ...pos, ...size });
      // Ekran çıkarıldıysa oransal kayıt korunur (geri takılınca eski yerine döner); mutlak konum güncellenir.
      it.x = pos.x;
      it.y = pos.y;
    }
    save();
  }

  /** Uyku dönüşü / oturum açılışı: pencereler yerinde ve görünür mü? */
  function revalidate() {
    for (const it of store.items) {
      const w = windows.get(it.id);
      if (!w || w.isDestroyed()) { if (store.visible) createWindow(it); continue; }
      if (store.visible && !w.isVisible()) w.showInactive();
    }
    relayout();
    sendToBottom(store.items.map((i) => i.id));
  }

  /** Widget'ın sağ tık / ⋯ menüsü (yerel menü: pencere küçük olsa da taşmaz). */
  function popupMenu(id, win) {
    const it = itemOf(id);
    if (!it) return;
    const c = C.catalogOf(it.type);
    const radio = (label, checked, click, extra = {}) => ({ label, type: "radio", checked, click, ...extra });
    const sizeKeys = c.bar ? Object.keys(c.sizes) : C.SIZE_KEYS.filter((k) => c.sizes[k]);
    const lv = levelOf(it);
    const template = [
      { label: c?.label || "Widget", enabled: false },
      ...(C.WITH_SETTINGS.has(it.type) ? [{ label: "Ayarlar…", click: () => win.webContents.send("widget:settings", { open: true }) }] : []),
      { type: "separator" },
      ...(sizeKeys.length > 1 ? [{ label: "Boyut", submenu: sizeKeys.map((k) => radio(c.bar ? (k === "small" ? "Kısa" : "Uzun") : `${C.SIZE_LABELS[k]} (${c.sizes[k].join("×")})`, it.size === k, () => update(id, { size: k }))) }] : []),
      { label: "Masaüstüne sabitle (sürüklenmez)", type: "checkbox", checked: it.locked, click: (m) => update(id, { locked: m.checked }) },
      { label: "Katman", submenu: [
        radio("Masaüstü (diğer pencerelerin altında, önerilen)", lv === "desktop", () => update(id, { level: "desktop" })),
        radio("Normal pencere", lv === "normal", () => update(id, { level: "normal" })),
        radio("Üstte sabit", lv === "top", () => update(id, { level: "top" })),
        ...(canEmbed ? [radio("Masaüstüne göm (etkileşimsiz)", lv === "embed", () => update(id, { level: "embed" }), { enabled: !c?.interactive || it.level === "embed" })] : []),
      ] },
      { label: "Arka plan saydamlığı", submenu: [100, 90, 80, 65, 50].map((v) => radio(`%${v} opak`, it.opacity === v, () => update(id, { opacity: v }))) },
      { label: "Tema", submenu: [["auto", "Sisteme uy"], ["light", "Açık"], ["dark", "Koyu"]].map(([v, l]) => radio(l, store.theme === v, () => setTheme(v))) },
      { type: "separator" },
      { label: editing ? "Düzenlemeyi bitir" : "Widget'ları düzenle", click: () => setEditing(!editing) },
      { label: "Izgaraya hizala", type: "checkbox", checked: store.grid, click: (m) => setSettings({ grid: m.checked }) },
      { label: "Widget galerisi…", click: () => showMain("toolkit:widgets") },
      { label: "Tüm widget'ları gizle", click: () => setVisible(false) },
      { label: "Bu widget'ı kaldır", click: () => remove(id) },
    ];
    Menu.buildFromTemplate(template).popup({ window: win });
  }

  /* ------------------------------ IPC ------------------------------ */

  const senderWin = (event) => BrowserWindow.fromWebContents(event.sender);
  ipcMain.handle("widgets:state", () => state());
  ipcMain.handle("widgets:add", (_e, type, options, size) => add(String(type || ""), options && typeof options === "object" ? options : {}, typeof size === "string" ? size : undefined));
  ipcMain.handle("widgets:update", (_e, id, patch) => update(String(id || ""), patch));
  ipcMain.handle("widgets:remove", (_e, id) => remove(String(id || "")));
  ipcMain.handle("widgets:visible", (_e, on) => setVisible(Boolean(on)));
  ipcMain.handle("widgets:toggle", () => toggleAll());
  ipcMain.handle("widgets:theme", (_e, theme) => setTheme(String(theme || "")));
  ipcMain.handle("widgets:edit", (_e, on) => setEditing(on == null ? !editing : Boolean(on)));
  ipcMain.handle("widgets:settings", (_e, patch) => setSettings(patch));
  ipcMain.handle("widgets:self", (event) => {
    const id = byWebContents(event.sender);
    const it = id ? itemOf(id) : null;
    return it ? { ok: true, ...configOf(it), canDesktop: canEmbed } : { ok: false };
  });
  // Masaüstü katmanında yazı alanı: pencere geçici olarak odaklanabilir olur (blur'da geri alınır).
  ipcMain.handle("widgets:focus", (event) => {
    const id = byWebContents(event.sender);
    const it = id ? itemOf(id) : null;
    const win = senderWin(event);
    if (!it || !win || levelOf(it) !== "desktop") return { ok: false };
    if (win.isFocused?.() && win.isFocusable?.()) return { ok: true, already: true };
    try { win.setFocusable(true); win.focus(); } catch { /* yoksay */ }
    return { ok: true };
  });
  // Fare yazı alanının üzerine gelince pencere odaklanabilir olur (tıklama klavye odağını doğrudan alır);
  // ayrılınca (odak almadıysa) yine odaklanamaz. Odak çalınmaz, pencere öne getirilmez.
  ipcMain.handle("widgets:focusable", (event, on) => {
    const id = byWebContents(event.sender);
    const it = id ? itemOf(id) : null;
    const win = senderWin(event);
    if (!it || !win || levelOf(it) !== "desktop") return { ok: false };
    try { if (on) win.setFocusable(true); else if (!win.isFocused?.()) win.setFocusable(false); } catch { /* yoksay */ }
    return { ok: true, focusable: win.isFocusable?.() };
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
  ipcMain.handle("widgets:match", (_e, id) => feeds.match(Number(id) || 0));
  ipcMain.handle("widgets:leagues", () => feeds.leagues());
  ipcMain.handle("widgets:standings", (_e, opts) => feeds.standings({ leagueId: Number(opts?.leagueId) || 0, seasonId: Number(opts?.seasonId) || 0 }));
  // Yayın Stüdyosu durumu: yayın motoru ana süreçte (app/studio/engine.js); arayüz "studio:status" olayını da dinler.
  ipcMain.handle("widgets:studio", () => studioStatus(deps.studio?.() || null));

  // Müzik widget'ları: çalar durumu ana pencereden gelir (app/toolkit.js) ve buraya aktarılır.
  deskkit?.onMusicState((s) => {
    for (const it of store.items) {
      if (it.type !== "music") continue;
      const w = windows.get(it.id);
      if (w && !w.isDestroyed()) w.webContents.send("music:state", s);
    }
  });
  nativeTheme?.on?.("updated", () => sendAll());
  // Çoklu ekran: ekran eklenince / çıkarılınca / çözünürlük değişince yerleşim yenilenir.
  let relayoutTimer = null;
  const relayoutSoon = () => { clearTimeout(relayoutTimer); relayoutTimer = setTimeout(relayout, 400); };
  for (const ev of ["display-added", "display-removed", "display-metrics-changed"]) screen.on?.(ev, relayoutSoon);

  /** Açılışta kayıtlı widget'ları geri yükle. */
  function restore() {
    for (const it of store.items) { try { createWindow(it); } catch (e) { log("[widget]", e); } }
    applyLogin();
  }
  /** Uygulama giriş öğesiyle mi açıldı (o zaman ana pencere gizli başlar, yalnız widget'lar)? */
  const openedAtLogin = () => {
    try { if (app.getLoginItemSettings?.().wasOpenedAtLogin) return true; } catch { /* yoksay */ }
    return process.argv.includes(LOGIN_ARG);
  };
  app.on("before-quit", () => { if (saveTimer) saveNow(); winBottom?.dispose(); });

  return {
    restore, revalidate, relayout, add, update, remove, setVisible, toggleAll, setTheme, setEditing, setSettings, openedAtLogin,
    list: () => store.items,
    visible: () => store.visible && store.items.length > 0,
    editing: () => editing,
    catalog: () => C.CATALOG,
    state,
    _windows: windows,
  };
}

/** Yayın motorunun durumu → widget özeti (saf; widgets.test.js). */
function studioStatus(studio) {
  if (!studio?.engine) return { ok: true, available: false };
  const st = studio.engine.status?.() || {};
  const active = Boolean(studio.engine.active?.());
  const state = active ? st.state || "starting" : "idle";
  return {
    ok: true, available: true, active, state,
    onAir: active && st.recordOnly === false && ["live", "reconnecting"].includes(state),
    recordOnly: Boolean(st.recordOnly),
    durationMs: Number(st.outTimeMs) || 0,
    bitrateKbps: Number.isFinite(Number(st.bitrateKbps)) && st.bitrateKbps !== null ? Number(st.bitrateKbps) : null,
    fps: Number.isFinite(Number(st.fps)) && st.fps !== null ? Number(st.fps) : null,
    droppedFrames: Number(st.droppedFrames) || 0,
    rtmp: st.rtmp || null,
    warning: st.warning || null,
    led: Boolean(studio.led?.status?.().open),
  };
}

module.exports = { registerWidgets, studioStatus, LOGIN_ARG };
