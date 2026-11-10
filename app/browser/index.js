// Tarayıcı — uygulamanın kendi tam özellikli tarayıcısı (ana süreç).
//
// Sekmeler ana süreçteki WebContentsView'lardır; arayüz (renderer/src/views/browser)
// yalnız sekme şeridini, adres çubuğunu ve panelleri çizer ve sayfa alanının
// konumunu bildirir (main / side: bölünmüş görünüm / dock: yana sabitlenen video).
//
//   • Profiller: her biri ayrı, kalıcı oturum bölmesi (persist:elitlig-browser-<kimlik>):
//     çerezler, girişler, önbellek yalıtılmış — iki Google hesabı yan yana. Gizli profil
//     yalnız bellekte. Sekme başına profil ("kapsayıcı") seçilir.
//   • Kullanıcı aracısı sıradan Chrome (Electron imi yok): Google girişi çalışır.
//   • Güvenlik: contextIsolation + sandbox, nodeIntegration yok, web sayfalarına ön yükleme
//     YOK (medya bulma / okuma kipi / sabitleme betikleri yalıtılmış dünyada çalışır).
//     window.open yeni sekme olur (boyutlu açılır pencere — ör. "Google ile giriş" — aynı
//     oturumla küçük pencerede); sayfanın başlattığı file:// / javascript: gezinmesi engellenir.
//   • Sabitle: sekmenin görünümü her zaman üstte duran yüzen pencereye (pip.js) ya da
//     tarayıcının yan paneline taşınır; video çalmayı sürdürür, diğer sekmelerde / başka
//     araçlarda gezinilir.
//   • İndirmeler (DownloadItem), medya paneli (görsel / video özgün kalitede), yt-dlp ile
//     yüksek kalitede indirme (Dosya Araçları köprüsü, profilin çerezleriyle), reklam /
//     izleyici engelleyici, okuma kipi, karanlık kip, çeviri, ekran görüntüsü (raf / pano),
//     site izinleri (kamera, mikrofon, bildirim…), geçmiş, yer imleri.
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const model = require("./model");
const media = require("./media");
const inject = require("./inject");
const { createBlocker, DEFAULT_BLOCKLIST } = require("./blocklist");
const { createPip, BAR_H } = require("./pip");
const { createClipboardIo } = require("../clipboardIo");
const native = require("../fileTools/native");

const { NEW_TAB_URL, PRIVATE_ID } = model;
const OFFLINE_CODES = new Set([-21, -100, -101, -102, -104, -105, -106, -109, -118, -130, -137, -138]);

function registerBrowser(deps) {
  const {
    app, ipcMain, BrowserWindow, WebContentsView, electronSession, shell, dialog, Menu, clipboard, nativeImage, screen,
    getMainWindow, showMain, broadcast, loadRenderer, secureWebPreferences, isOwnUrl, isMac = process.platform === "darwin",
    fileTools = () => null, shelf = () => null, log = () => {},
  } = deps;

  const dir = path.join(app.getPath("userData"), "browser");
  fs.mkdirSync(dir, { recursive: true });
  const store = model.createJsonStore(path.join(dir, "state.json"), { delayMs: 700 });
  const historyStore = model.createJsonStore(path.join(dir, "history.json"), { delayMs: 1500 });
  const clipIo = createClipboardIo({ clipboard, ClipboardItem: deps.ClipboardItem || require("electron").ClipboardItem, nativeImage });

  const saved = model.normalizeState(store.read(null));
  const state = {
    ...saved,
    profiles: [...saved.profiles, model.privateProfile()],
    tabs: saved.tabs.map((t) => ({ ...t, view: null, loading: false, canGoBack: false, canGoForward: false, audible: false, blocked: 0, error: null, find: null, cssKeys: {} })),
    split: null, // { leftId, rightId }
    pip: null, // { tabId, mode: "float" | "dock", fill, cssKey }
    fullscreenId: null,
  };
  let history = Array.isArray(historyStore.read([])) ? historyStore.read([]) : [];
  const downloads = [];
  const prompts = new Map(); // izin istekleri
  const sessions = new Map(); // profileId → Session
  const blocker = createBlocker([...DEFAULT_BLOCKLIST, ...state.settings.customBlock]);

  let host = null;
  let attached = false;
  let visible = true;
  let rects = { main: null, side: null, dock: null };
  const shown = new Set(); // host'ta görünen görünümler

  const save = () => store.write(() => model.serializeState(state));
  const saveHistory = () => historyStore.write(() => history);
  const tabById = (id) => state.tabs.find((t) => t.id === id) || null;
  const tabByWc = (wc) => state.tabs.find((t) => t.view && !t.view.webContents.isDestroyed() && t.view.webContents.id === (wc?.id ?? wc)) || null;
  const profileById = (id) => state.profiles.find((p) => p.id === id) || null;
  const activeTab = () => tabById(state.activeId);
  const realProfileId = (id) => (profileById(id) ? id : state.defaultProfileId);

  /* --------------------------------- yayın --------------------------------- */

  let stateTimer = null;
  const publicTab = (t) => ({
    id: t.id, profileId: t.profileId, url: t.url, title: t.title, favicon: t.favicon, pinned: t.pinned, muted: Boolean(t.muted), audible: t.audible,
    loading: t.loading, canGoBack: t.canGoBack, canGoForward: t.canGoForward, zoom: t.zoom || 0, blocked: t.blocked, error: t.error, find: t.find,
    created: Boolean(t.view), dark: isDarkSite(t.url), crashed: Boolean(t.error?.code === "crashed"),
  });
  const publicState = () => ({
    tabs: state.tabs.map(publicTab),
    activeId: state.activeId,
    split: state.split,
    pip: state.pip ? { tabId: state.pip.tabId, mode: state.pip.mode, fill: state.pip.fill, opacity: state.settings.pipOpacity } : null,
    profiles: state.profiles.map(({ permissions, ...p }) => ({ ...p, sites: Object.keys(permissions || {}).length })),
    defaultProfileId: state.defaultProfileId,
    bookmarks: state.bookmarks,
    closedCount: state.closed.length,
    settings: { ...state.settings, pipBounds: undefined },
    engines: Object.fromEntries(Object.entries(model.SEARCH_ENGINES).map(([k, v]) => [k, v.label])),
    prompts: [...prompts.values()].map(({ callback, timer, ...p }) => p),
    fullscreenId: state.fullscreenId,
    attached,
  });
  const sendState = () => {
    if (stateTimer) return;
    stateTimer = setTimeout(() => { stateTimer = null; broadcast("browser:state", publicState()); }, 30);
  };
  const changed = () => { save(); sendState(); };

  /* ------------------------------- oturumlar ------------------------------- */

  const isDarkSite = (url) => {
    const h = model.hostOf(url);
    return Boolean(h) && state.settings.darkSites.some((s) => h === s || h.endsWith(`.${s}`));
  };
  const isMutedSite = (url) => {
    const h = model.hostOf(url);
    return Boolean(h) && state.settings.mutedSites.some((s) => h === s || h.endsWith(`.${s}`));
  };

  function sessionFor(profileId) {
    const id = realProfileId(profileId);
    if (sessions.has(id)) return sessions.get(id);
    const ses = electronSession.fromPartition(model.partitionFor(id), { cache: id !== PRIVATE_ID });
    sessions.set(id, ses);
    ses.setUserAgent(model.cleanUserAgent(ses.getUserAgent()), "tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7");
    try { ses.setSpellCheckerLanguages(["tr", "en-US"]); } catch { /* sözlük yok */ }

    // Reklam / izleyici engelleyici (alt kaynaklar; ana çerçeve hiç engellenmez).
    ses.webRequest.onBeforeRequest({ urls: ["<all_urls>"] }, (details, callback) => {
      let pageUrl = "";
      try { pageUrl = details.webContents && !details.webContents.isDestroyed() ? details.webContents.getURL() : ""; } catch { pageUrl = ""; }
      const block = blocker.shouldBlock({ url: details.url, resourceType: details.resourceType, pageUrl, enabled: state.settings.adblock, allow: state.settings.adblockAllow });
      if (block) {
        const tab = details.webContents ? tabByWc(details.webContents) : null;
        if (tab) { tab.blocked += 1; sendState(); }
      }
      callback({ cancel: block });
    });

    // Site izinleri: kalıcı karar yoksa arayüzde sorulur (profil başına hatırlanır).
    ses.setPermissionRequestHandler((wc, permission, callback, details) => {
      const origin = model.originOf(details?.requestingUrl || wc?.getURL?.() || "");
      const profile = profileById(id);
      const decision = model.permissionDecision(profile, origin, permission, details);
      if (decision !== "ask" || !origin) { callback(decision === "allow"); return; }
      if (!model.PERMISSION_KINDS[permission]) { callback(false); return; }
      const key = model.permissionKey(permission, details);
      const tab = tabByWc(wc);
      const reqId = model.uid("p");
      const timer = setTimeout(() => answerPrompt({ reqId, decision: "deny", remember: false }), 120000);
      prompts.set(reqId, { reqId, callback, timer, origin, permission, key, label: key === "camera" ? "Kamera" : key === "microphone" ? "Mikrofon" : model.PERMISSION_KINDS[permission], profileId: id, tabId: tab?.id || null, at: Date.now() });
      sendState();
    });
    ses.setPermissionCheckHandler((_wc, permission, requestingOrigin, details) => {
      if (model.AUTO_ALLOW.has(permission)) return true;
      const origin = model.originOf(requestingOrigin || details?.requestingUrl || "");
      return model.permissionDecision(profileById(id), origin, permission, details || {}) === "allow";
    });

    ses.on("will-download", (_event, item, wc) => onDownload(item, wc, id));
    return ses;
  }

  function answerPrompt({ reqId, decision, remember = true }) {
    const p = prompts.get(String(reqId || ""));
    if (!p) return false;
    clearTimeout(p.timer);
    prompts.delete(p.reqId);
    const allow = decision === "allow";
    if (remember) {
      state.profiles = state.profiles.map((pr) => (pr.id === p.profileId ? model.setPermission(pr, p.origin, p.key, allow ? "allow" : "deny") : pr));
      save();
    }
    try { p.callback(allow); } catch { /* yoksay */ }
    sendState();
    return true;
  }

  /* -------------------------------- indirmeler -------------------------------- */

  const saveAsNext = new Set(); // "Farklı kaydet" istenen adresler
  const downloadDir = () => {
    const testDir = process.env.ELITLIG_TEST_DOWNLOAD_DIR;
    if (testDir && !app.isPackaged) return testDir;
    return state.settings.downloadDir || path.join(app.getPath("downloads"), "Elitlig Tarayıcı");
  };
  const uniquePath = (folder, name) => {
    const clean = String(name || "indirilen-dosya").replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "-").slice(0, 180) || "indirilen-dosya";
    const ext = path.extname(clean);
    const stem = clean.slice(0, clean.length - ext.length);
    let p = path.join(folder, clean);
    for (let n = 2; fs.existsSync(p) && n < 1000; n += 1) p = path.join(folder, `${stem} (${n})${ext}`);
    return p;
  };
  let dlTimer = null;
  const publicDownloads = () => downloads.slice(-80).map(({ item, lastBytes, lastAt, ...rest }) => rest);
  const sendDownloads = () => {
    if (dlTimer) return;
    dlTimer = setTimeout(() => { dlTimer = null; broadcast("browser:downloads", publicDownloads()); }, 120);
  };

  function onDownload(item, wc, profileId) {
    const url = item.getURL();
    const name = item.getFilename() || "indirilen-dosya";
    const folder = downloadDir();
    const testDir = process.env.ELITLIG_TEST_DOWNLOAD_DIR && !app.isPackaged;
    if (saveAsNext.has(url) && !testDir) {
      saveAsNext.delete(url);
      item.setSaveDialogOptions({ title: "Farklı kaydet", defaultPath: path.join(folder, name), buttonLabel: "Kaydet" });
    } else {
      saveAsNext.delete(url);
      try { fs.mkdirSync(folder, { recursive: true }); } catch { /* yoksay */ }
      item.setSavePath(uniquePath(folder, name));
    }
    const tab = wc ? tabByWc(wc) : null;
    const entry = { id: model.uid("d"), name, url: url.startsWith("data:") ? "data:" : url, path: item.getSavePath() || null, received: 0, total: item.getTotalBytes(), state: "progressing", mime: item.getMimeType(), startedAt: Date.now(), profileId, tabId: tab?.id || null, speed: 0, item, lastBytes: 0, lastAt: Date.now() };
    downloads.push(entry);
    if (downloads.length > 120) downloads.splice(0, downloads.length - 120);
    item.on("updated", (_e, st) => {
      entry.state = st === "interrupted" ? "interrupted" : item.isPaused() ? "paused" : "progressing";
      entry.received = item.getReceivedBytes();
      entry.total = item.getTotalBytes();
      const now = Date.now();
      if (now - entry.lastAt >= 500) { entry.speed = Math.round(((entry.received - entry.lastBytes) * 1000) / (now - entry.lastAt)); entry.lastBytes = entry.received; entry.lastAt = now; }
      entry.path = item.getSavePath() || entry.path;
      if (entry.path) entry.name = path.basename(entry.path);
      sendDownloads();
    });
    item.once("done", (_e, st) => {
      entry.state = st;
      entry.received = item.getReceivedBytes();
      entry.total = entry.total || entry.received;
      entry.path = item.getSavePath() || entry.path;
      if (entry.path) entry.name = path.basename(entry.path);
      entry.item = null;
      entry.speed = 0;
      entry.doneAt = Date.now();
      sendDownloads();
      if (st === "completed") broadcast("browser:downloaded", { id: entry.id, name: entry.name, path: entry.path });
    });
    sendDownloads();
  }

  /* --------------------------------- görünümler --------------------------------- */

  const guestPrefs = (profileId) => ({
    partition: model.partitionFor(realProfileId(profileId)),
    contextIsolation: true,
    sandbox: true,
    nodeIntegration: false,
    nodeIntegrationInSubFrames: false,
    nodeIntegrationInWorker: false,
    webviewTag: false,
    spellcheck: true,
    safeDialogs: true,
    navigateOnDragDrop: false,
    autoplayPolicy: "document-user-activation-required",
  });

  function createView(tab) {
    sessionFor(tab.profileId);
    const view = new WebContentsView({ webPreferences: guestPrefs(tab.profileId) });
    view.setBackgroundColor("#ffffffff");
    tab.view = view;
    const wc = view.webContents;
    wc.setAudioMuted(Boolean(tab.muted) || isMutedSite(tab.url));
    const sync = () => {
      if (wc.isDestroyed()) return;
      const url = wc.getURL();
      if (url) tab.url = url;
      tab.title = wc.getTitle() || tab.title;
      tab.canGoBack = wc.navigationHistory.canGoBack();
      tab.canGoForward = wc.navigationHistory.canGoForward();
      tab.loading = wc.isLoading();
      changed();
    };
    wc.on("did-start-loading", () => { tab.loading = true; sendState(); });
    wc.on("did-stop-loading", sync);
    wc.on("did-navigate", (_e, url) => {
      tab.error = null;
      tab.blocked = 0;
      tab.url = url;
      wc.setAudioMuted(Boolean(tab.muted) || isMutedSite(url));
      history = model.addHistory(history, { url, title: wc.getTitle(), profileId: tab.profileId });
      saveHistory();
      sync();
      layout();
    });
    wc.on("did-navigate-in-page", (_e, url, isMainFrame) => {
      if (!isMainFrame) return;
      tab.url = url;
      history = model.addHistory(history, { url, title: wc.getTitle(), profileId: tab.profileId });
      saveHistory();
      sync();
      if (state.pip?.tabId === tab.id && state.pip.fill) setTimeout(() => applyPipFill(tab, true), 800);
    });
    wc.on("dom-ready", () => {
      applyDark(tab);
      if (state.pip?.tabId === tab.id && state.pip.fill) applyPipFill(tab, true);
    });
    wc.on("page-title-updated", (_e, title) => {
      tab.title = title;
      const last = history[history.length - 1];
      if (last && last.url === wc.getURL() && last.profileId === tab.profileId) { last.title = title; saveHistory(); }
      changed();
    });
    wc.on("page-favicon-updated", (_e, favicons) => { tab.favicon = (favicons || []).find((f) => /^https:\/\//.test(f)) || (favicons || [])[0] || null; changed(); });
    wc.on("audio-state-changed", (e) => { tab.audible = Boolean(e?.audible ?? wc.isCurrentlyAudible()); sendState(); });
    wc.on("did-fail-load", (_e, code, description, url, isMainFrame) => {
      if (!isMainFrame || code === -3) return;
      tab.loading = false;
      tab.error = { code, description, url, offline: OFFLINE_CODES.has(code) };
      layout();
      sendState();
    });
    wc.on("render-process-gone", (_e, details) => {
      tab.loading = false;
      tab.error = { code: "crashed", description: details?.reason || "çöktü", url: tab.url };
      layout();
      sendState();
    });
    wc.on("found-in-page", (_e, r) => { tab.find = { active: r.activeMatchOrdinal, matches: r.matches }; sendState(); });
    wc.on("enter-html-full-screen", () => {
      if (state.pip?.tabId === tab.id) return;
      state.fullscreenId = tab.id;
      const win = host && !host.isDestroyed() ? host : null;
      if (win && !win.isFullScreen()) { win.setFullScreen(true); win.__browserFs = true; }
      layout();
      sendState();
    });
    wc.on("leave-html-full-screen", () => {
      if (state.fullscreenId === tab.id) state.fullscreenId = null;
      const win = host && !host.isDestroyed() ? host : null;
      if (win?.__browserFs) { win.__browserFs = false; win.setFullScreen(false); }
      setTimeout(layout, 120);
      sendState();
    });
    wc.on("before-input-event", (event, input) => {
      const action = model.shortcutAction(input, isMac);
      if (!action) return;
      event.preventDefault();
      runShortcut(action, tab.id);
    });
    wc.on("context-menu", (_e, params) => contextMenu(tab, params));
    wc.on("will-attach-webview", (e) => e.preventDefault());
    const guardNav = (event, url) => {
      const verdict = model.navigationVerdict(url, { explicit: false });
      if (verdict === "allow") return;
      event.preventDefault();
      if (verdict === "external") shell.openExternal(url).catch(() => {});
    };
    wc.on("will-navigate", guardNav);
    wc.on("will-redirect", (event, url) => { if (/^file:/i.test(url)) event.preventDefault(); });
    wc.setWindowOpenHandler(({ url, disposition, features }) => {
      const verdict = model.navigationVerdict(url, { explicit: false });
      if (verdict === "external") { shell.openExternal(url).catch(() => {}); return { action: "deny" }; }
      if (verdict !== "allow" && url !== "about:blank") return { action: "deny" };
      // Boyutlu açılır pencere ("Google ile giriş", ödeme 3D Secure…): aynı oturumla küçük pencere,
      // window.opener korunur. Diğer her şey yeni sekme.
      const popup = disposition === "new-window" && /width|height|popup/i.test(String(features || ""));
      if (popup) {
        return {
          action: "allow",
          overrideBrowserWindowOptions: { width: 520, height: 680, autoHideMenuBar: true, title: "Açılır pencere", webPreferences: guestPrefs(tab.profileId) },
        };
      }
      if (url && url !== "about:blank") newTab({ url, profileId: tab.profileId, background: disposition === "background-tab", afterId: tab.id });
      return { action: "deny" };
    });
    wc.on("did-create-window", (child) => {
      child.webContents.on("will-navigate", guardNav);
      child.webContents.setWindowOpenHandler(({ url }) => {
        if (model.navigationVerdict(url) === "allow") newTab({ url, profileId: tab.profileId, afterId: tab.id });
        return { action: "deny" };
      });
      child.webContents.on("context-menu", (_e, params) => contextMenu(tab, params, child.webContents));
    });
    if (tab.zoom) wc.once("did-finish-load", () => { try { wc.setZoomLevel(tab.zoom); } catch { /* yoksay */ } });
    if (host && !host.isDestroyed()) { host.contentView.addChildView(view); view.setVisible(false); }
    return view;
  }

  function loadInTab(tab, url, { explicit = false } = {}) {
    if (url === NEW_TAB_URL) {
      tab.url = NEW_TAB_URL;
      tab.title = "Yeni sekme";
      tab.favicon = null;
      tab.error = null;
      if (tab.view) tab.view.webContents.loadURL("about:blank").catch(() => {});
      layout();
      changed();
      return;
    }
    const verdict = model.navigationVerdict(url, { explicit });
    if (verdict === "external") { shell.openExternal(url).catch(() => {}); return; }
    if (verdict !== "allow") return;
    if (!tab.view) createView(tab);
    tab.error = null;
    tab.url = url;
    tab.loading = true;
    tab.view.webContents.loadURL(url).catch(() => {});
    layout();
    changed();
  }

  /** Sekmenin görünümü yoksa (geri yüklenmiş / tembel sekme) oluşturulup kayıtlı adres yüklenir. */
  function wake(tab) {
    if (tab.view || tab.url === NEW_TAB_URL) return;
    createView(tab);
    tab.view.webContents.loadURL(tab.url).catch(() => {});
  }

  function destroyView(tab) {
    const v = tab.view;
    if (!v) return;
    tab.view = null;
    try { if (host && !host.isDestroyed()) host.contentView.removeChildView(v); } catch { /* yok */ }
    shown.delete(v);
    try { if (!v.webContents.isDestroyed()) v.webContents.close(); } catch { /* yoksay */ }
  }

  /* ---------------------------------- yerleşim ---------------------------------- */

  const scale = (r) => {
    if (!r || !host || host.isDestroyed()) return null;
    const z = host.webContents.getZoomFactor() || 1;
    const n = (v) => Math.max(0, Math.round(Number(v || 0) * z));
    return { x: n(r.x), y: n(r.y), width: n(r.width), height: n(r.height) };
  };

  function layout() {
    if (!host || host.isDestroyed()) return;
    const want = new Map(); // view → bounds
    if (attached && visible) {
      const full = state.fullscreenId ? tabById(state.fullscreenId) : null;
      if (full?.view && state.pip?.tabId !== full.id) {
        const [w, h] = host.getContentSize();
        want.set(full.view, { x: 0, y: 0, width: w, height: h });
      } else {
        const place = (tab, rect) => {
          if (!tab || !rect || tab.url === NEW_TAB_URL || tab.error || state.pip?.tabId === tab.id) return;
          wake(tab);
          if (tab.view) want.set(tab.view, scale(rect));
        };
        const split = state.split && tabById(state.split.leftId) && tabById(state.split.rightId) ? state.split : null;
        if (split) { place(tabById(split.leftId), rects.main); place(tabById(split.rightId), rects.side); } else place(activeTab(), rects.main);
        if (state.pip?.mode === "dock" && rects.dock) {
          const t = tabById(state.pip.tabId);
          if (t?.view) want.set(t.view, scale(rects.dock));
        }
      }
    }
    for (const t of state.tabs) {
      const v = t.view;
      if (!v || (state.pip?.mode === "float" && state.pip.tabId === t.id)) continue;
      const b = want.get(v);
      if (b && b.width > 0 && b.height > 0) {
        v.setBounds(b);
        v.setVisible(true);
        shown.add(v);
      } else if (shown.has(v) || b) {
        v.setVisible(false);
        shown.delete(v);
      }
    }
  }

  function onHostInput(event, input) {
    if (!attached) return;
    const action = model.shortcutAction(input, isMac);
    if (!action) return;
    event.preventDefault();
    runShortcut(action, state.activeId);
  }

  function attach(win, nextRects) {
    if (!win || win.isDestroyed()) return publicState();
    if (host !== win) {
      if (host && !host.isDestroyed()) {
        for (const t of state.tabs) if (t.view && !(state.pip?.mode === "float" && state.pip.tabId === t.id)) { try { host.contentView.removeChildView(t.view); } catch { /* yok */ } }
        host.webContents.removeListener("before-input-event", onHostInput);
      }
      host = win;
      host.webContents.on("before-input-event", onHostInput);
      for (const t of state.tabs) if (t.view && !(state.pip?.mode === "float" && state.pip.tabId === t.id)) { host.contentView.addChildView(t.view); t.view.setVisible(false); }
      shown.clear();
      win.once("closed", () => { if (host === win) { host = null; attached = false; } });
    }
    attached = true;
    visible = true;
    if (!state.tabs.length) newTab({ url: NEW_TAB_URL, quiet: true });
    setRects(nextRects);
    sendState();
    return publicState();
  }

  function setRects(next) {
    if (!next || typeof next !== "object") return;
    const pick = (r) => (r && Number.isFinite(r.width) && Number.isFinite(r.height) ? { x: Number(r.x) || 0, y: Number(r.y) || 0, width: r.width, height: r.height } : null);
    rects = { main: pick(next.main), side: pick(next.side), dock: pick(next.dock) };
    if (typeof next.visible === "boolean") visible = next.visible;
    layout();
  }

  function detach() {
    attached = false;
    layout();
    // Yana sabitlenmiş video tarayıcıdan çıkınca yüzen pencereye geçer (ayar).
    if (state.pip?.mode === "dock" && state.settings.popOutOnLeave) pin(state.pip.tabId, "float");
    sendState();
  }

  /* ----------------------------------- sekmeler ----------------------------------- */

  function newTab({ url = NEW_TAB_URL, profileId = null, background = false, afterId = null, explicit = false, quiet = false } = {}) {
    if (state.tabs.length >= model.MAX_TABS) return null;
    const pid = realProfileId(profileId || activeTab()?.profileId || state.defaultProfileId);
    const tab = { id: model.uid("t"), profileId: pid, url: NEW_TAB_URL, title: "Yeni sekme", favicon: null, pinned: false, muted: false, zoom: 0, view: null, loading: false, canGoBack: false, canGoForward: false, audible: false, blocked: 0, error: null, find: null, cssKeys: {} };
    const at = afterId ? state.tabs.findIndex((t) => t.id === afterId) : -1;
    if (at >= 0) state.tabs.splice(at + 1, 0, tab); else state.tabs.push(tab);
    state.tabs = model.orderTabs(state.tabs);
    if (!background) { state.activeId = tab.id; if (state.split && ![state.split.leftId, state.split.rightId].includes(tab.id)) state.split = null; }
    if (url && url !== NEW_TAB_URL) loadInTab(tab, url, { explicit });
    layout();
    changed();
    if (!quiet && !background && url === NEW_TAB_URL) broadcast("browser:key", "focusOmnibox");
    return tab.id;
  }

  function closeTab(id) {
    const tab = tabById(id);
    if (!tab) return false;
    if (state.pip?.tabId === id) unpin();
    if (state.fullscreenId === id) state.fullscreenId = null;
    for (const [reqId, p] of prompts) if (p.tabId === id) answerPrompt({ reqId, decision: "deny", remember: false });
    state.activeId = model.nextActiveAfterClose(state.tabs, id, state.activeId);
    if (tab.profileId !== PRIVATE_ID && (tab.url !== NEW_TAB_URL)) {
      state.closed.push({ id: tab.id, profileId: tab.profileId, url: tab.url, title: tab.title, favicon: tab.favicon, pinned: tab.pinned, muted: tab.muted, zoom: tab.zoom });
      if (state.closed.length > model.MAX_CLOSED) state.closed.splice(0, state.closed.length - model.MAX_CLOSED);
    }
    destroyView(tab);
    state.tabs = state.tabs.filter((t) => t.id !== id);
    if (state.split && (state.split.leftId === id || state.split.rightId === id)) state.split = null;
    if (!state.tabs.length && attached) newTab({ quiet: true });
    layout();
    changed();
    return true;
  }

  function restoreTab() {
    const t = state.closed.pop();
    if (!t) return null;
    const id = newTab({ url: t.url, profileId: profileById(t.profileId) ? t.profileId : null, explicit: /^file:/i.test(t.url) });
    const tab = tabById(id);
    if (tab) { tab.title = t.title; tab.favicon = t.favicon; if (t.pinned) setPinned(id, true); }
    changed();
    return id;
  }

  function activate(id) {
    const tab = tabById(id);
    if (!tab) return false;
    state.activeId = id;
    if (state.split && ![state.split.leftId, state.split.rightId].includes(id)) state.split = null;
    layout();
    sendState();
    try { tab.view?.webContents.focus(); } catch { /* yoksay */ }
    return true;
  }

  function cycle(dir) {
    if (!state.tabs.length) return;
    const i = state.tabs.findIndex((t) => t.id === state.activeId);
    const next = state.tabs[(i + dir + state.tabs.length) % state.tabs.length];
    activate(next.id);
  }

  function setPinned(id, on) {
    const tab = tabById(id);
    if (!tab) return false;
    tab.pinned = Boolean(on);
    state.tabs = model.orderTabs(state.tabs);
    changed();
    return true;
  }

  function setMuted(id, on) {
    const tab = tabById(id);
    if (!tab) return false;
    tab.muted = on == null ? !tab.muted : Boolean(on);
    tab.view?.webContents.setAudioMuted(tab.muted || isMutedSite(tab.url));
    changed();
    return true;
  }

  function toggleSiteList(listName, url) {
    const h = model.hostOf(url);
    if (!h) return false;
    const base = h.replace(/^www\./, "");
    const list = state.settings[listName];
    const on = !list.some((s) => h === s || h.endsWith(`.${s}`));
    state.settings[listName] = on ? [...list, base] : list.filter((s) => !(h === s || h.endsWith(`.${s}`)));
    changed();
    return on;
  }

  function switchProfile(id, profileId) {
    const tab = tabById(id);
    if (!tab || !profileById(profileId) || tab.profileId === profileId) return false;
    const url = tab.url;
    if (state.pip?.tabId === id) unpin();
    destroyView(tab);
    tab.profileId = profileId;
    tab.error = null;
    if (url !== NEW_TAB_URL) loadInTab(tab, url, { explicit: /^file:/i.test(url) });
    layout();
    changed();
    return true;
  }

  /* --------------------------------- sabitleme --------------------------------- */

  const pipWindow = createPip({
    BrowserWindow, screen, loadRenderer, isMac,
    webPreferences: secureWebPreferences,
    guard: deps.guardNavigation,
    onBounds: (b) => { state.settings.pipBounds = b; save(); },
    onClosed: () => {
      // Kullanıcı yüzen pencereyi kapattı: sekme yerine döner.
      if (state.pip?.mode === "float") unpin({ fromClose: true });
    },
  });

  async function applyPipFill(tab, on) {
    const wc = tab?.view?.webContents;
    if (!wc || wc.isDestroyed()) return null;
    try {
      if (on) {
        if (!tab.cssKeys.pip) tab.cssKeys.pip = await wc.insertCSS(inject.PIP_CSS, { cssOrigin: "user" });
        return await wc.executeJavaScriptInIsolatedWorld(inject.ISOLATED_WORLD, [{ code: inject.PIP_ON }]);
      }
      if (tab.cssKeys.pip) { await wc.removeInsertedCSS(tab.cssKeys.pip).catch(() => {}); tab.cssKeys.pip = null; }
      return await wc.executeJavaScriptInIsolatedWorld(inject.ISOLATED_WORLD, [{ code: inject.PIP_OFF }]);
    } catch (e) { log("[tarayıcı] sabitleme betiği:", e?.message); return null; }
  }

  async function pin(id = state.activeId, mode = "float") {
    const tab = tabById(id);
    if (!tab || tab.url === NEW_TAB_URL) return { ok: false };
    if (state.pip && state.pip.tabId !== id) unpin();
    wake(tab);
    const fill = state.pip?.fill ?? state.settings.pipFill;
    const prevMode = state.pip?.mode;
    state.pip = { tabId: id, mode, fill };
    if (state.fullscreenId === id) { state.fullscreenId = null; tab.view.webContents.executeJavaScript("document.fullscreenElement && document.exitFullscreen()", true).catch(() => {}); }
    if (mode === "float") {
      if (host && !host.isDestroyed()) { try { host.contentView.removeChildView(tab.view); } catch { /* yok */ } }
      shown.delete(tab.view);
      pipWindow.show(tab.view, { bounds: state.settings.pipBounds, opacity: state.settings.pipOpacity });
    } else {
      if (prevMode === "float") pipWindow.release();
      if (host && !host.isDestroyed()) host.contentView.addChildView(tab.view);
    }
    // Sabitlenen sekme etkin sekmeyse başka bir sekmeye geçilir (sayfa alanı boşalmasın).
    if (state.activeId === id && state.tabs.length > 1 && mode === "float") {
      const other = state.tabs.find((t) => t.id !== id && t.url !== NEW_TAB_URL) || state.tabs.find((t) => t.id !== id);
      if (other) state.activeId = other.id;
    }
    if (state.split && (state.split.leftId === id || state.split.rightId === id)) state.split = null;
    const res = fill ? await applyPipFill(tab, true) : null;
    layout();
    sendState();
    return { ok: true, mode, fill: res };
  }

  function unpin({ fromClose = false } = {}) {
    const p = state.pip;
    if (!p) return false;
    const tab = tabById(p.tabId);
    state.pip = null;
    if (p.mode === "float" && !fromClose) pipWindow.release();
    if (tab?.view && host && !host.isDestroyed()) {
      try { host.contentView.addChildView(tab.view); } catch { /* yoksay */ }
      tab.view.setVisible(false);
      shown.delete(tab.view);
    }
    if (tab) applyPipFill(tab, false);
    layout();
    sendState();
    return true;
  }

  async function pipCommand(action, arg) {
    const tab = state.pip ? tabById(state.pip.tabId) : null;
    switch (action) {
      case "corner": return pipWindow.corner(String(arg || "br"));
      case "size": return pipWindow.resizePreset(String(arg || "m"));
      case "opacity": state.settings.pipOpacity = Math.max(0.3, Math.min(1, Number(arg) || 1)); pipWindow.setOpacity(state.settings.pipOpacity); changed(); return true;
      case "fill": if (!state.pip || !tab) return false; state.pip.fill = arg == null ? !state.pip.fill : Boolean(arg); state.settings.pipFill = state.pip.fill; changed(); return applyPipFill(tab, state.pip.fill);
      case "media": return tab?.view ? tab.view.webContents.executeJavaScriptInIsolatedWorld(inject.ISOLATED_WORLD, [{ code: inject.mediaControlScript(arg) }], true).catch(() => null) : null;
      case "dock": return state.pip ? pin(state.pip.tabId, "dock") : false;
      case "float": return state.pip ? pin(state.pip.tabId, "float") : false;
      case "back": {
        // Sekmeye dön: sabitleme kalkar, uygulama tarayıcıda o sekmeyle öne gelir.
        const id = state.pip?.tabId;
        unpin();
        if (id) { showMain("browser"); activate(id); }
        return true;
      }
      case "close": return unpin();
      default: return false;
    }
  }

  /* ---------------------------------- split ---------------------------------- */

  function splitWith(id = state.activeId, otherId = null) {
    const tab = tabById(id);
    if (!tab) return false;
    let other = otherId ? tabById(otherId) : null;
    if (!other || other.id === id) {
      const i = state.tabs.indexOf(tab);
      other = state.tabs[i + 1] || state.tabs[i - 1] || null;
      if (!other || state.pip?.tabId === other.id) { const nid = newTab({ background: true, afterId: id, quiet: true }); other = tabById(nid); }
    }
    if (state.pip?.tabId === id || state.pip?.tabId === other.id) unpin();
    state.split = { leftId: id, rightId: other.id };
    state.activeId = id;
    layout();
    sendState();
    return true;
  }

  /* --------------------------------- bağlam menüsü --------------------------------- */

  function contextMenu(tab, params, wcOverride = null) {
    const wc = wcOverride || tab.view?.webContents;
    if (!wc) return;
    const items = [];
    const others = state.profiles.filter((p) => p.id !== tab.profileId);
    if (params.misspelledWord && params.dictionarySuggestions?.length) {
      items.push(...params.dictionarySuggestions.slice(0, 4).map((word) => ({ label: word, click: () => wc.replaceMisspelling(word) })), { type: "separator" });
    }
    if (params.linkURL && /^https?:/i.test(params.linkURL)) {
      items.push(
        { label: "Bağlantıyı yeni sekmede aç", click: () => newTab({ url: params.linkURL, profileId: tab.profileId, background: true, afterId: tab.id }) },
        { label: "Bağlantıyı başka profilde aç", submenu: others.map((p) => ({ label: `${p.avatar} ${p.name}`, click: () => newTab({ url: params.linkURL, profileId: p.id, afterId: tab.id }) })) },
        { label: "Bağlantıyı yan yana aç", click: () => { const nid = newTab({ url: params.linkURL, profileId: tab.profileId, background: true, afterId: tab.id }); splitWith(tab.id, nid); } },
        { label: "Bağlantıyı sistem tarayıcısında aç", click: () => shell.openExternal(params.linkURL).catch(() => {}) },
        { label: "Bağlantıyı kopyala", click: () => clipIo.writeText(params.linkURL) },
        { label: "Bağlantıyı farklı kaydet…", click: () => { saveAsNext.add(params.linkURL); wc.downloadURL(params.linkURL); } },
        { label: "Bağlantıdan yüksek kalitede indir (yt-dlp)…", click: () => { activate(tab.id); broadcast("browser:key", { action: "ytdlp", url: params.linkURL }); } },
        { type: "separator" },
      );
    }
    if (params.mediaType === "image" && params.srcURL) {
      const best = media.upgradeImageUrl(params.srcURL);
      items.push(
        { label: "Görseli farklı kaydet…", click: () => { saveAsNext.add(best); wc.downloadURL(best, refOpts(wc, best)); } },
        { label: "Görseli İndirilenler'e kaydet", click: () => wc.downloadURL(best, refOpts(wc, best)) },
        { label: "Görseli kopyala", click: () => wc.copyImageAt(params.x, params.y) },
        { label: "Görsel adresini kopyala", click: () => clipIo.writeText(best) },
        { label: "Görseli yeni sekmede aç", click: () => newTab({ url: best, profileId: tab.profileId, afterId: tab.id, background: true }) },
        { type: "separator" },
      );
    }
    if (params.mediaType === "video" || params.mediaType === "audio") {
      const direct = /^https?:/i.test(params.srcURL || "");
      items.push(
        ...(direct ? [{ label: params.mediaType === "video" ? "Videoyu indir" : "Sesi indir", click: () => wc.downloadURL(params.srcURL, refOpts(wc, params.srcURL)) }] : []),
        { label: "Yüksek kalitede indir (yt-dlp)…", click: () => { activate(tab.id); broadcast("browser:key", { action: "ytdlp", url: wc.getURL() }); } },
        { label: "Videoyu sabitle (yüzen pencere)", click: () => pin(tab.id, "float") },
        { label: "Resim içinde resim (yerel)", click: () => nativePip(tab.id) },
        { type: "separator" },
      );
    }
    if (params.isEditable) items.push({ role: "undo", label: "Geri al" }, { role: "cut", label: "Kes" }, { role: "copy", label: "Kopyala" }, { role: "paste", label: "Yapıştır" }, { role: "selectAll", label: "Tümünü seç" }, { type: "separator" });
    else if (params.selectionText) {
      const q = params.selectionText.trim().slice(0, 200);
      items.push(
        { role: "copy", label: "Kopyala" },
        { label: `“${q.length > 28 ? `${q.slice(0, 28)}…` : q}” için ara`, click: () => newTab({ url: model.searchUrl(state.settings.engine, q), profileId: tab.profileId, afterId: tab.id }) },
        { label: "Seçimi çevir", click: () => newTab({ url: `https://translate.google.com/?sl=auto&tl=${state.settings.translateTo}&text=${encodeURIComponent(q)}&op=translate`, profileId: tab.profileId, afterId: tab.id }) },
        { type: "separator" },
      );
    }
    const hist = wc.navigationHistory;
    items.push(
      { label: "Geri", enabled: hist.canGoBack(), click: () => hist.goBack() },
      { label: "İleri", enabled: hist.canGoForward(), click: () => hist.goForward() },
      { label: "Yeniden yükle", click: () => wc.reload() },
      { type: "separator" },
      { label: "Bu sayfadaki görselleri ve videoları göster", click: () => { activate(tab.id); broadcast("browser:key", { action: "mediaPanel" }); } },
      { label: "Sekmeyi sabitle (video, her zaman üstte)", click: () => pin(tab.id, "float") },
      { label: "Okuma kipi", click: () => { activate(tab.id); broadcast("browser:key", { action: "reader" }); } },
      { label: "Sayfayı çevir", click: () => translate(tab.id) },
      { label: "Ekran görüntüsü (Raf'a)", click: () => screenshot({ id: tab.id, target: "shelf" }) },
      { label: "Sayfa adresini kopyala", click: () => clipIo.writeText(wc.getURL()) },
      { label: "Yazdır…", click: () => wc.print({ printBackground: true }) },
      { type: "separator" },
      { label: "Öğeyi incele", click: () => { wc.inspectElement(params.x, params.y); } },
    );
    Menu.buildFromTemplate(items).popup({ window: BrowserWindow.fromWebContents(wc) || host || undefined });
  }

  function tabMenu(id) {
    const tab = tabById(id);
    if (!tab) return false;
    const others = state.profiles.filter((p) => p.id !== tab.profileId);
    const items = [
      { label: "Yeni sekme (sağda)", click: () => newTab({ profileId: tab.profileId, afterId: id }) },
      { label: "Yeniden yükle", enabled: Boolean(tab.view), click: () => tab.view?.webContents.reload() },
      { label: "Çoğalt", click: () => duplicate(id) },
      { label: tab.pinned ? "Sabitlemeyi kaldır (sekme)" : "Sekmeyi başa iğnele", click: () => setPinned(id, !tab.pinned) },
      { label: tab.muted ? "Sesi aç" : "Sesi kapat", click: () => setMuted(id) },
      { label: isMutedSite(tab.url) ? "Sitenin sesini aç" : "Bu sitenin sesini hep kapat", enabled: /^https?:/.test(tab.url), click: () => { toggleSiteList("mutedSites", tab.url); tab.view?.webContents.setAudioMuted(Boolean(tab.muted) || isMutedSite(tab.url)); sendState(); } },
      { type: "separator" },
      { label: "Videoyu sabitle (yüzen pencere)", enabled: tab.url !== NEW_TAB_URL, click: () => pin(id, "float") },
      { label: "Yan panele sabitle", enabled: tab.url !== NEW_TAB_URL, click: () => pin(id, "dock") },
      { label: "Yan yana görüntüle", click: () => splitWith(id) },
      { label: "Başka profilde aç", submenu: others.map((p) => ({ label: `${p.avatar} ${p.name}`, click: () => newTab({ url: tab.url === NEW_TAB_URL ? NEW_TAB_URL : tab.url, profileId: p.id, afterId: id }) })) },
      { label: "Profile taşı", submenu: others.map((p) => ({ label: `${p.avatar} ${p.name}`, click: () => switchProfile(id, p.id) })) },
      { type: "separator" },
      { label: "Sekmeyi kapat", accelerator: "CmdOrCtrl+W", registerAccelerator: false, click: () => closeTab(id) },
      { label: "Diğer sekmeleri kapat", enabled: state.tabs.length > 1, click: () => { for (const t of [...state.tabs]) if (t.id !== id && !t.pinned) closeTab(t.id); } },
      { label: "Sağdaki sekmeleri kapat", click: () => { const i = state.tabs.findIndex((t) => t.id === id); for (const t of state.tabs.slice(i + 1)) if (!t.pinned) closeTab(t.id); } },
      { label: "Kapatılan sekmeyi geri aç", accelerator: "CmdOrCtrl+Shift+T", registerAccelerator: false, enabled: state.closed.length > 0, click: () => restoreTab() },
    ];
    Menu.buildFromTemplate(items).popup({ window: host || getMainWindow() || undefined });
    return true;
  }

  function newTabMenu() {
    const items = [
      ...state.profiles.filter((p) => !p.private).map((p) => ({ label: `${p.avatar}  ${p.name}${p.id === state.defaultProfileId ? " (varsayılan)" : ""}`, click: () => newTab({ profileId: p.id }) })),
      { type: "separator" },
      { label: "🕶  Gizli sekme", accelerator: "CmdOrCtrl+Shift+N", registerAccelerator: false, click: () => newTab({ profileId: PRIVATE_ID }) },
      { type: "separator" },
      { label: "Profilleri yönet…", click: () => broadcast("browser:key", { action: "profilesPanel" }) },
    ];
    Menu.buildFromTemplate(items).popup({ window: host || getMainWindow() || undefined });
    return true;
  }

  function duplicate(id) {
    const tab = tabById(id);
    if (!tab) return null;
    return newTab({ url: tab.url, profileId: tab.profileId, afterId: id, explicit: /^file:/i.test(tab.url) });
  }

  /* ------------------------------ sayfa eylemleri ------------------------------ */

  // Chromium tam sayfa adresini başka kökene Referer olarak göndermeyi reddeder: yalnız köken.
  const refererOf = (url) => { const o = model.originOf(url); return o ? `${o}/` : null; };
  const refOpts = (wc, url = "") => { const r = refererOf(wc.getURL()); return r && !/^data:/i.test(url) ? { headers: { Referer: r } } : undefined; };
  const wcOf = (id) => { const t = tabById(id || state.activeId); return t?.view && !t.view.webContents.isDestroyed() ? t.view.webContents : null; };

  async function applyDark(tab) {
    const wc = tab?.view?.webContents;
    if (!wc || wc.isDestroyed()) return;
    const want = isDarkSite(tab.url);
    try {
      if (want && !tab.cssKeys.dark) tab.cssKeys.dark = await wc.insertCSS(inject.DARK_CSS, { cssOrigin: "user" });
      if (!want && tab.cssKeys.dark) { await wc.removeInsertedCSS(tab.cssKeys.dark); tab.cssKeys.dark = null; }
    } catch { /* yoksay */ }
  }

  function translate(id) {
    const tab = tabById(id || state.activeId);
    if (!tab || !/^https?:/.test(tab.url)) return false;
    newTab({ url: `https://translate.google.com/translate?sl=auto&tl=${state.settings.translateTo}&u=${encodeURIComponent(tab.url)}`, profileId: tab.profileId, afterId: tab.id });
    return true;
  }

  async function nativePip(id) {
    const wc = wcOf(id);
    if (!wc) return { ok: false };
    try { return await wc.executeJavaScriptInIsolatedWorld(inject.ISOLATED_WORLD, [{ code: inject.NATIVE_PIP }], true); } catch (e) { return { ok: false, reason: e?.message }; }
  }

  async function capture(wc, full) {
    if (!full) return (await wc.capturePage()).toPNG();
    const dbg = wc.debugger;
    let attachedHere = false;
    try {
      if (!dbg.isAttached()) { dbg.attach("1.3"); attachedHere = true; }
      const m = await dbg.sendCommand("Page.getLayoutMetrics");
      const size = m.cssContentSize || m.contentSize;
      const width = Math.ceil(Math.min(size.width, 4000));
      const height = Math.ceil(Math.min(size.height, 16000));
      const shot = await dbg.sendCommand("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { x: 0, y: 0, width, height, scale: 1 } });
      return Buffer.from(shot.data, "base64");
    } finally {
      if (attachedHere) { try { dbg.detach(); } catch { /* yoksay */ } }
    }
  }

  async function screenshot({ id, full = false, target = "shelf" } = {}) {
    const tab = tabById(id || state.activeId);
    const wc = wcOf(tab?.id);
    if (!wc) return { ok: false, error: "Sayfa açık değil." };
    const png = await capture(wc, full);
    const name = `${(tab.title || model.hostOf(tab.url) || "Sayfa").replace(/[\\/:*?"<>|]+/g, " ").trim().slice(0, 80)}${full ? " (tam sayfa)" : ""}.png`;
    if (target === "clipboard") { await clipIo.writeImage(png); return { ok: true, target }; }
    if (target === "shelf" && shelf()?.store) {
      const { item } = shelf().store.addImage({ buffer: png, ext: "png", source: "capture", name });
      return { ok: true, target, id: item?.id || null };
    }
    const folder = downloadDir();
    fs.mkdirSync(folder, { recursive: true });
    const p = uniquePath(folder, name);
    fs.writeFileSync(p, png);
    return { ok: true, target: "file", path: p };
  }

  async function readerOf(id) {
    const wc = wcOf(id);
    if (!wc) return null;
    try { return await wc.executeJavaScriptInIsolatedWorld(inject.ISOLATED_WORLD, [{ code: inject.READER }]); } catch { return null; }
  }

  async function savePdf(id) {
    const tab = tabById(id || state.activeId);
    const wc = wcOf(tab?.id);
    if (!wc) return { ok: false };
    const folder = downloadDir();
    fs.mkdirSync(folder, { recursive: true });
    const p = uniquePath(folder, `${(tab.title || "Sayfa").replace(/[\\/:*?"<>|]+/g, " ").trim().slice(0, 80)}.pdf`);
    fs.writeFileSync(p, await wc.printToPDF({ printBackground: true }));
    return { ok: true, path: p };
  }

  /* ------------------------------------ medya ------------------------------------ */

  async function headInfo(ses, url, referer) {
    if (!/^https?:/i.test(url)) return {};
    try {
      const ref = refererOf(referer);
      const res = await ses.fetch(url, { method: "HEAD", headers: ref ? { Referer: ref } : {}, signal: AbortSignal.timeout(4000), bypassCustomProtocolHandlers: true });
      const len = Number(res.headers.get("content-length")) || null;
      return { bytes: len, type: res.headers.get("content-type") || null };
    } catch { return {}; }
  }

  async function collectMedia(id) {
    const tab = tabById(id || state.activeId);
    const wc = wcOf(tab?.id);
    if (!wc) return { ok: false, error: "Sayfa açık değil.", items: [] };
    let raw;
    try { raw = await wc.executeJavaScriptInIsolatedWorld(inject.ISOLATED_WORLD, [{ code: media.COLLECT_SCRIPT }]); } catch (e) { return { ok: false, error: e?.message || "Sayfa okunamadı.", items: [] }; }
    const result = media.normalizeMedia(raw, wc.getURL());
    const ses = sessionFor(tab.profileId);
    const head = result.items.slice(0, 80);
    let i = 0;
    const worker = async () => {
      while (i < head.length) {
        const m = head[i++];
        const info = await headInfo(ses, m.url, result.pageUrl);
        if (info.bytes) m.bytes = info.bytes;
        if (info.type) m.type = info.type;
      }
    };
    await Promise.race([Promise.all(Array.from({ length: 6 }, worker)), new Promise((r) => setTimeout(r, 5000))]);
    // Görsel sanılan ama sayfa (HTML) dönen adresler elenir.
    result.items = result.items.filter((m) => !/^text\//i.test(m.type || ""));
    return { ok: true, tabId: tab.id, profileId: tab.profileId, ...result };
  }

  function saveMedia({ id, url, saveAs = false } = {}) {
    const wc = wcOf(id);
    const u = String(url || "");
    if (!wc || !/^(https?|data):/i.test(u)) return false;
    if (saveAs) saveAsNext.add(u);
    wc.downloadURL(u, refOpts(wc, u));
    return true;
  }

  async function copyImage({ id, url } = {}) {
    const tab = tabById(id || state.activeId);
    if (!tab) return false;
    try {
      const res = await sessionFor(tab.profileId).fetch(String(url), { signal: AbortSignal.timeout(15000) });
      const img = nativeImage.createFromBuffer(Buffer.from(await res.arrayBuffer()));
      if (img.isEmpty()) return false;
      await clipIo.writeImage(img.toPNG());
      return true;
    } catch { return false; }
  }

  // yt-dlp: profilin çerezleri (yalnız ilgili alan adları) geçici cookies.txt dosyasına yazılır.
  async function cookiesFileFor(profileId, url) {
    const ses = sessionFor(profileId);
    const host = model.hostOf(url);
    const cookies = await ses.cookies.get({});
    const text = media.netscapeCookies(cookies, host);
    if (text.split("\n").filter((l) => l && !l.startsWith("# ")).length <= 1) return null;
    const cdir = path.join(dir, "cookies");
    fs.mkdirSync(cdir, { recursive: true, mode: 0o700 });
    const file = path.join(cdir, `${model.partitionFor(realProfileId(profileId)).replace(/[^a-z0-9-]/gi, "_")}.txt`);
    fs.writeFileSync(file, text, { mode: 0o600 });
    return file;
  }

  async function ytFormats({ url, profileId } = {}) {
    const ft = fileTools();
    const tool = ft?.ytdlp?.resolve();
    if (!tool) return { ok: false, code: "NO_YTDLP", error: "yt-dlp bulunamadı. Araç Takımı › Dosya Araçları › Ayarlar'dan “yt-dlp'yi indir” ile kurun." };
    const cookies = await cookiesFileFor(profileId || activeTab()?.profileId, url).catch(() => null);
    const args = ["-J", "--no-playlist", "--no-warnings", "--ignore-config", "--js-runtimes", `node:${ft.ytdlp.jsRuntime()}`, ...(cookies ? ["--cookies", cookies] : []), "--", String(url)];
    const res = await native.run(tool.path, args, { timeout: 90000, env: ft.ytdlp.runEnv() });
    if (!res.ok) return { ok: false, error: String(res.stderr || res.error || "Biçimler okunamadı.").split("\n").filter(Boolean).slice(-1)[0] || "Biçimler okunamadı." };
    try { return { ok: true, ...media.formatsFromInfo(JSON.parse(res.stdout)) }; } catch { return { ok: false, error: "yt-dlp çıktısı okunamadı." }; }
  }

  async function ytDownload({ url, profileId, mode = "video", quality = "best", audioFormat = "mp3", playlist = false, withImages = false } = {}) {
    const ft = fileTools();
    if (!ft?.run) return { ok: false, error: "Dosya Araçları hazır değil." };
    const cookiesFile = await cookiesFileFor(profileId || activeTab()?.profileId, url).catch(() => null);
    try {
      const job = await ft.run({ op: "webDownload", options: { url, mode, quality, audioFormat, playlist, withImages } }, { cookiesFile });
      return { ok: true, job };
    } catch (e) { return { ok: false, code: e?.code || null, error: String(e?.message || e) }; }
  }

  /* --------------------------------- profiller --------------------------------- */

  function createProfile(input) {
    const p = model.makeProfile(input || {}, state.profiles);
    const priv = state.profiles.findIndex((x) => x.private);
    state.profiles.splice(priv >= 0 ? priv : state.profiles.length, 0, p);
    changed();
    return p;
  }

  async function deleteProfile(id) {
    const tabs = state.tabs.filter((t) => t.profileId === id);
    const next = model.removeProfile(state, id); // hata fırlatabilir (son profil)
    for (const t of tabs) { if (state.pip?.tabId === t.id) unpin(); destroyView(t); }
    Object.assign(state, { profiles: next.profiles, tabs: next.tabs, defaultProfileId: next.defaultProfileId, activeId: next.activeId });
    if (state.split && (!tabById(state.split.leftId) || !tabById(state.split.rightId))) state.split = null;
    history = history.filter((h) => h.profileId !== id);
    state.closed = state.closed.filter((t) => t.profileId !== id);
    state.bookmarks = state.bookmarks; // yer imleri ortak
    saveHistory();
    const ses = sessions.get(id) || electronSession.fromPartition(model.partitionFor(id));
    sessions.delete(id);
    await ses.clearStorageData().catch(() => {});
    await ses.clearCache().catch(() => {});
    await ses.clearAuthCache().catch(() => {});
    if (attached && !state.tabs.length) newTab({ quiet: true });
    layout();
    changed();
    return true;
  }

  async function clearData({ profileId, what = "all" } = {}) {
    const ses = sessionFor(profileId);
    if (what === "cache") await ses.clearCache();
    else if (what === "cookies") await ses.clearStorageData({ storages: ["cookies"] });
    else { await ses.clearStorageData(); await ses.clearCache(); history = history.filter((h) => h.profileId !== profileId); saveHistory(); }
    return true;
  }

  /* -------------------------------- yer imleri -------------------------------- */

  function toggleBookmark({ url, title } = {}) {
    const u = String(url || activeTab()?.url || "");
    if (!model.persistableUrl(u) || u === NEW_TAB_URL) return null;
    const i = state.bookmarks.findIndex((b) => b.url === u);
    if (i >= 0) { state.bookmarks.splice(i, 1); changed(); return false; }
    state.bookmarks.push({ id: model.uid("b"), url: u, title: String(title || activeTab()?.title || model.hostOf(u)).slice(0, 300), folder: "", at: Date.now() });
    changed();
    return true;
  }

  /* --------------------------------- kısayollar --------------------------------- */

  function runShortcut(action, tabId) {
    const id = tabId || state.activeId;
    const wc = wcOf(id);
    switch (action) {
      case "newTab": showMain("browser"); return newTab({});
      case "privateTab": showMain("browser"); return newTab({ profileId: PRIVATE_ID });
      case "closeTab": return closeTab(id);
      case "restoreTab": return restoreTab();
      case "nextTab": return cycle(1);
      case "prevTab": return cycle(-1);
      case "reload": if (wc) wc.reload(); return true;
      case "hardReload": if (wc) wc.reloadIgnoringCache(); return true;
      case "back": if (wc?.navigationHistory.canGoBack()) wc.navigationHistory.goBack(); return true;
      case "forward": if (wc?.navigationHistory.canGoForward()) wc.navigationHistory.goForward(); return true;
      case "zoomIn": return command("zoom", { id, dir: "in" });
      case "zoomOut": return command("zoom", { id, dir: "out" });
      case "print": if (wc) wc.print({ printBackground: true }); return true;
      case "devtools": if (wc) wc.openDevTools({ mode: "detach" }); return true;
      case "bookmark": return toggleBookmark({});
      case "togglePin": return state.pip ? unpin() : pin(id, "float");
      default:
        // Arayüzde yapılanlar: adres çubuğu, bul, sekme ara, paneller.
        host?.webContents.focus();
        broadcast("browser:key", action);
        return true;
    }
  }

  /* ----------------------------------- komutlar ----------------------------------- */

  async function command(name, arg) {
    const a = arg && typeof arg === "object" ? arg : {};
    const id = a.id || (typeof arg === "string" ? arg : null) || state.activeId;
    const tab = tabById(id);
    const wc = wcOf(id);
    switch (name) {
      case "newTab": return newTab({ url: a.url ? model.resolveInput(a.url, state.settings)?.url || NEW_TAB_URL : NEW_TAB_URL, profileId: a.profileId || null, background: Boolean(a.background), afterId: a.afterId || null, quiet: Boolean(a.quiet) });
      case "close": return closeTab(id);
      case "restore": return restoreTab();
      case "duplicate": return duplicate(id);
      case "activate": return activate(id);
      case "move": state.tabs = model.moveTab(state.tabs, a.id, a.index); changed(); return true;
      case "pinTab": return setPinned(id, a.on ?? !tab?.pinned);
      case "mute": return setMuted(id, a.on);
      case "muteSite": { const on = toggleSiteList("mutedSites", tab?.url); wc?.setAudioMuted(Boolean(tab?.muted) || isMutedSite(tab?.url)); return on; }
      case "profile": return switchProfile(id, a.profileId);
      case "navigate": {
        if (!tab) return false;
        const r = model.resolveInput(a.input, state.settings);
        if (!r) return false;
        loadInTab(tab, r.url, { explicit: true });
        try { tab.view?.webContents.focus(); } catch { /* yoksay */ }
        return r;
      }
      case "back": if (wc?.navigationHistory.canGoBack()) wc.navigationHistory.goBack(); return true;
      case "forward": if (wc?.navigationHistory.canGoForward()) wc.navigationHistory.goForward(); return true;
      case "reload":
        if (!tab) return false;
        if (tab.error) { const url = tab.error.url || tab.url; tab.error = null; loadInTab(tab, url, { explicit: true }); return true; }
        if (wc) { if (a.hard) wc.reloadIgnoringCache(); else wc.reload(); }
        return true;
      case "stop": wc?.stop(); return true;
      case "home": if (tab) loadInTab(tab, NEW_TAB_URL); return true;
      case "zoom": {
        if (!tab || !wc) return false;
        const z = a.dir === "in" ? wc.getZoomLevel() + 0.5 : a.dir === "out" ? wc.getZoomLevel() - 0.5 : 0;
        tab.zoom = Math.max(-3, Math.min(4, z));
        wc.setZoomLevel(tab.zoom);
        changed();
        return tab.zoom;
      }
      case "find": {
        if (!wc) return false;
        const text = String(a.text || "");
        if (!text) { wc.stopFindInPage("clearSelection"); if (tab) tab.find = null; sendState(); return true; }
        wc.findInPage(text, { forward: a.forward !== false, findNext: Boolean(a.next) });
        return true;
      }
      case "focus": try { wc?.focus(); } catch { /* yoksay */ } return true;
      case "print": wc?.print({ printBackground: true }); return Boolean(wc);
      case "pdf": return savePdf(id);
      case "devtools": wc?.openDevTools({ mode: "detach" }); return Boolean(wc);
      case "screenshot": return screenshot({ id, full: Boolean(a.full), target: a.target || "shelf" });
      case "reader": return readerOf(id);
      case "dark": { const on = toggleSiteList("darkSites", tab?.url); if (tab) await applyDark(tab); sendState(); return on; }
      case "translate": return translate(id);
      case "openExternal": if (tab && /^https?:/.test(tab.url)) shell.openExternal(tab.url).catch(() => {}); return true;
      case "copyUrl": if (tab) await clipIo.writeText(tab.url); return true;
      case "adblockSite": {
        const h = model.hostOf(tab?.url).replace(/^www\./, "");
        if (!h) return null;
        const allowed = state.settings.adblockAllow.includes(h);
        state.settings.adblockAllow = allowed ? state.settings.adblockAllow.filter((x) => x !== h) : [...state.settings.adblockAllow, h];
        changed();
        wc?.reload();
        return !allowed; // true: bu sitede engelleyici kapalı
      }
      case "tabMenu": return tabMenu(id);
      case "newTabMenu": return newTabMenu();
      case "split": return splitWith(a.id || state.activeId, a.otherId || null);
      case "unsplit": state.split = null; layout(); sendState(); return true;
      case "splitSwap": if (state.split) { state.split = { leftId: state.split.rightId, rightId: state.split.leftId }; layout(); sendState(); } return true;
      case "pin": return pin(id, a.mode === "dock" ? "dock" : "float");
      case "unpin": return unpin();
      case "pip": return pipCommand(a.action, a.value);
      case "nativePip": return nativePip(id);
      case "media": return collectMedia(id);
      case "saveMedia": return saveMedia({ id, url: a.url, saveAs: a.saveAs });
      case "copyImage": return copyImage({ id, url: a.url });
      case "ytFormats": return ytFormats({ url: a.url || tab?.url, profileId: a.profileId || tab?.profileId });
      case "ytDownload": return ytDownload({ ...a, url: a.url || tab?.url, profileId: a.profileId || tab?.profileId });
      case "bookmark": return toggleBookmark({ url: a.url || tab?.url, title: a.title || tab?.title });
      case "bookmarkUpdate": {
        const b = state.bookmarks.find((x) => x.id === a.bid);
        if (!b) return false;
        if (typeof a.title === "string") b.title = a.title.slice(0, 300);
        if (typeof a.url === "string") { const r = model.resolveInput(a.url, state.settings); if (r && r.kind === "url") b.url = r.url; }
        if (typeof a.folder === "string") b.folder = a.folder.slice(0, 60);
        changed();
        return true;
      }
      case "bookmarkRemove": state.bookmarks = state.bookmarks.filter((b) => b.id !== a.bid); changed(); return true;
      case "bookmarkMove": {
        const from = state.bookmarks.findIndex((b) => b.id === a.bid);
        if (from < 0) return false;
        const [b] = state.bookmarks.splice(from, 1);
        state.bookmarks.splice(Math.max(0, Math.min(state.bookmarks.length, Number(a.index) || 0)), 0, b);
        changed();
        return true;
      }
      case "history": return model.searchHistory(history, a.query, { limit: Math.min(1000, Number(a.limit) || 300), profileId: a.profileId || null });
      case "historyRemove": history = history.filter((h) => h.url !== a.url); saveHistory(); return true;
      case "historyClear": {
        const since = Number(a.since) || 0;
        history = history.filter((h) => (a.profileId && h.profileId !== a.profileId) || h.at < since);
        saveHistory();
        return true;
      }
      case "downloads": return publicDownloads();
      case "download": {
        const d = downloads.find((x) => x.id === a.did);
        if (!d) return false;
        if (a.action === "cancel") d.item?.cancel();
        else if (a.action === "pause") d.item?.pause();
        else if (a.action === "resume") d.item?.resume();
        else if (a.action === "reveal" && d.path) shell.showItemInFolder(d.path);
        else if (a.action === "open" && d.path) shell.openPath(d.path);
        else if (a.action === "forget") downloads.splice(downloads.indexOf(d), 1);
        else if (a.action === "retry" && d.url && d.url !== "data:") { const w = wcOf(d.tabId) || wcOf(state.activeId); w?.downloadURL(d.url); }
        sendDownloads();
        return true;
      }
      case "downloadsClear": for (let i = downloads.length - 1; i >= 0; i -= 1) if (downloads[i].state !== "progressing" && downloads[i].state !== "paused") downloads.splice(i, 1); sendDownloads(); return true;
      case "downloadDir": {
        const res = await dialog.showOpenDialog(host || undefined, { title: "İndirme klasörü", defaultPath: downloadDir(), properties: ["openDirectory", "createDirectory"] });
        if (res.canceled || !res.filePaths[0]) return null;
        state.settings.downloadDir = res.filePaths[0];
        changed();
        return state.settings.downloadDir;
      }
      case "profileCreate": return createProfile(a);
      case "profileUpdate": state.profiles = model.renameProfile(state.profiles, a.profileId, a); changed(); return true;
      case "profileDelete": return deleteProfile(a.profileId);
      case "profileDefault": if (profileById(a.profileId) && !profileById(a.profileId).private) { state.defaultProfileId = a.profileId; changed(); } return true;
      case "profileSites": return Object.entries(profileById(a.profileId)?.permissions || {}).map(([origin, perms]) => ({ origin, perms }));
      case "permissionSet": state.profiles = state.profiles.map((p) => (p.id === a.profileId ? model.setPermission(p, String(a.origin || ""), String(a.key || ""), a.value) : p)); changed(); return true;
      case "permission": return answerPrompt(a);
      case "clearData": return clearData(a);
      case "cookies": { const list = await sessionFor(a.profileId).cookies.get(a.url ? { url: a.url } : {}); return list.map((c) => ({ name: c.name, domain: c.domain, value: a.values ? c.value : undefined })); }
      case "settings": {
        const s = state.settings;
        if (model.SEARCH_ENGINES[a.engine]) s.engine = a.engine;
        if (typeof a.adblock === "boolean") s.adblock = a.adblock;
        if (typeof a.showBookmarks === "boolean") s.showBookmarks = a.showBookmarks;
        if (typeof a.popOutOnLeave === "boolean") s.popOutOnLeave = a.popOutOnLeave;
        if (Array.isArray(a.keywords)) s.keywords = model.normalizeKeywords(a.keywords);
        if (Array.isArray(a.customBlock)) { s.customBlock = model.hostList(a.customBlock); blocker.setDomains([...DEFAULT_BLOCKLIST, ...s.customBlock]); }
        if (Array.isArray(a.adblockAllow)) s.adblockAllow = model.hostList(a.adblockAllow);
        if (Number.isFinite(a.dockWidth)) s.dockWidth = Math.max(240, Math.min(900, a.dockWidth));
        if (Number.isFinite(a.splitRatio)) s.splitRatio = Math.max(0.2, Math.min(0.8, a.splitRatio));
        if (typeof a.translateTo === "string" && /^[a-z]{2}(-[A-Z]{2})?$/.test(a.translateTo)) s.translateTo = a.translateTo;
        if (a.downloadDir === null) s.downloadDir = null;
        changed();
        return publicState().settings;
      }
      case "blocklistInfo": return { builtIn: DEFAULT_BLOCKLIST.length, custom: state.settings.customBlock.length };
      case "shortcut": return runShortcut(String(a.action || ""), id);
      default: return null;
    }
  }

  /* ------------------------------------- IPC ------------------------------------- */

  const own = (event) => {
    const url = event?.senderFrame?.url || "";
    return !isOwnUrl || isOwnUrl(url);
  };
  const handle = (channel, fn) => ipcMain.handle(channel, async (event, ...args) => {
    if (!own(event)) return null;
    try { return await fn(event, ...args); } catch (e) { log("[tarayıcı]", channel, e?.message); return { ok: false, error: String(e?.message || e) }; }
  });
  handle("browser:state", () => publicState());
  handle("browser:attach", (event, r) => attach(BrowserWindow.fromWebContents(event.sender), r));
  handle("browser:bounds", (_e, r) => { setRects(r); return true; });
  handle("browser:detach", () => { detach(); return true; });
  handle("browser:cover", async (_e, on) => {
    // Uygulamanın kendi katmanları (palet, pencereler) gömülü görünümlerin altında kalırdı:
    // kaplama açılınca görünümlerin anlık görüntüsü verilir, görünümler gizlenir.
    if (!attached) return null;
    if (on) {
      const shots = {};
      const cap = async (slot, tab) => { try { if (tab?.view && shown.has(tab.view)) shots[slot] = (await tab.view.webContents.capturePage()).toDataURL(); } catch { /* yoksay */ } };
      if (state.split) { await cap("main", tabById(state.split.leftId)); await cap("side", tabById(state.split.rightId)); } else await cap("main", activeTab());
      if (state.pip?.mode === "dock") await cap("dock", tabById(state.pip.tabId));
      visible = false;
      layout();
      return shots;
    }
    visible = true;
    layout();
    return null;
  });
  handle("browser:cmd", (_e, name, arg) => command(String(name || ""), arg ?? null));
  handle("browser:downloads", () => publicDownloads());

  /** Uygulamanın başka yerinden adres açma (ör. palet, bağlantılar): tarayıcıda yeni sekme. */
  function open(url, { profileId = null } = {}) {
    showMain("browser");
    const r = model.resolveInput(url, state.settings);
    return newTab({ url: r?.url || NEW_TAB_URL, profileId });
  }

  log("[tarayıcı] hazır:", state.tabs.length, "sekme,", state.profiles.length - 1, "profil");

  return {
    open,
    command,
    publicState,
    sessionFor,
    menuTemplate: () => ({
      label: "Tarayıcı",
      submenu: [
        { label: "Tarayıcıyı aç", accelerator: "CmdOrCtrl+Shift+B", click: () => showMain("browser") },
        { label: "Yeni sekme", accelerator: "CmdOrCtrl+T", registerAccelerator: false, click: () => runShortcut("newTab") },
        { label: "Yeni gizli sekme", accelerator: "CmdOrCtrl+Shift+N", registerAccelerator: false, click: () => runShortcut("privateTab") },
        { label: "Kapatılan sekmeyi geri aç", accelerator: "CmdOrCtrl+Shift+T", registerAccelerator: false, click: () => { showMain("browser"); restoreTab(); } },
        { type: "separator" },
        { label: "Videoyu sabitle / bırak", accelerator: "CmdOrCtrl+Shift+S", registerAccelerator: false, click: () => runShortcut("togglePin") },
        { label: "Sekme ara", accelerator: "CmdOrCtrl+Shift+K", registerAccelerator: false, click: () => { showMain("browser"); setTimeout(() => broadcast("browser:key", "tabSearch"), 200); } },
      ],
    }),
    dispose() {
      store.write(() => model.serializeState(state));
      store.flush();
      historyStore.flush();
      pipWindow.release();
      try { fs.rmSync(path.join(dir, "cookies"), { recursive: true, force: true }); } catch { /* yoksay */ }
    },
    _state: state,
    _pip: pipWindow,
    _bar: BAR_H,
  };
}

module.exports = { registerBrowser };
