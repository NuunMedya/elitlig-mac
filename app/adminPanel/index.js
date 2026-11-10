// Yönetim — elitlig.com yönetim panelinin TAMAMI uygulama içinde (ana süreç).
//
// Web yönetim paneli yüzlerce ekrandır (maçlar, oyuncular, takımlar, ligler,
// sezonlar, disiplin, içerik, üyeler, yetkiler…). Masaüstü bunları yeniden
// yazmak yerine paneli ana pencerenin içine gömer (WebContentsView) ve masaüstü
// oturumunu ona aktarır (tek oturum):
//
//   - Ayrı oturum bölmesi (persist:elitlig-admin): uygulamanın kendi arayüzünden
//     yalıtılmış; nodeIntegration kapalı, contextIsolation + sandbox açık.
//   - Jeton, sayfa betiklerinden önce ön yükleme betiğinde (preload.js) web'in
//     localStorage "accessToken" anahtarına yazılır — URL'ye hiç konmaz; yalnız
//     SITE_ORIGIN'deki ana çerçeve alır. Jeton yenilenince / oturum kapanınca
//     panel eşitlenir (oturum kapanınca bölmenin tüm verisi silinir).
//   - Yalnız SITE_ORIGIN ve API_ORIGIN'de gezinilir; dış bağlantılar sistem
//     tarayıcısında açılır. Site içi açılır pencereler (window.open) uygulama
//     içinde aynı oturumla açılır.
//   - İndirmeler kaydet diyaloğuyla, ilerlemesi araç çubuğunda; yazdır / PDF,
//     sayfada bul, bildirim izni (yalnız site), dosya yükleme (input type=file).
//   - Web'in kişisel araç sayfaları (Ajanda, Not Defteri, Mesajlar…) ayar
//     açıkken masaüstünün yerel aracında açılır.
//   - Web, görünen menüyü köprüden bildirir: kenar çubuğundaki Yönetim listesi,
//     komut paleti ve menü çubuğundaki Yönetim menüsü web'in yetki kurallarıyla aynı.
"use strict";

const path = require("node:path");
const fs = require("node:fs");
const navModel = require("./nav");

const PARTITION = "persist:elitlig-admin";
const PROD_API_ORIGIN = "https://elitlig-api-88a866b7a4da.herokuapp.com";
// Ana çerçeve yüklenemediğinde "bağlantı yok" sayılan Chromium hata kodları.
const OFFLINE_CODES = new Set([-21, -100, -101, -102, -104, -105, -106, -109, -118, -130, -137, -138]);

const originOf = (url) => { try { return new URL(url).origin; } catch { return ""; } };

function registerAdminPanel(deps) {
  const {
    app, ipcMain, BrowserWindow, WebContentsView, electronSession, shell, dialog, Menu, net, clipboard,
    sessionStore, siteOrigin, apiOrigin, getMainWindow, showMain, broadcast, logout, verifySession,
    secureWebPreferences, rebuildMenu, log = () => {},
  } = deps;
  const SITE = originOf(siteOrigin);
  const API = originOf(apiOrigin);
  const allowedOrigin = (url) => {
    const o = originOf(url);
    return Boolean(o) && (o === SITE || o === API);
  };
  const isSiteUrl = (url) => originOf(url) === SITE;
  const prefsFile = () => path.join(app.getPath("userData"), "admin-panel.json");
  const navFile = () => path.join(app.getPath("userData"), "admin-nav.json");
  const readJson = (file, fallback) => { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; } };
  const writeJson = (file, value) => { try { fs.writeFileSync(file, JSON.stringify(value)); } catch { /* yoksay */ } };

  let prefs = { nativeTools: true, lastPath: null, ...readJson(prefsFile(), {}) };
  let published = readJson(navFile(), null);
  let view = null;
  let host = null; // görünümün eklendiği pencere
  let attached = false;
  let visible = true;
  let lastBounds = null;
  let state = { url: null, path: null, title: "", canGoBack: false, canGoForward: false, loading: false, error: null, find: null };
  const downloads = [];
  const extraWindows = new Set();

  const currentSession = () => sessionStore.load();
  const sessionPayload = () => {
    const s = currentSession();
    return s?.token ? { token: s.token, user: s.user || null } : null;
  };
  const signedIn = () => Boolean(sessionPayload());

  /* ------------------------------ oturum bölmesi ------------------------------ */

  const ses = electronSession.fromPartition(PARTITION);
  // Electron ve uygulama adı imleri (ör. "ElitligAraçlar/2.26.0": ASCII dışı harf) çıkarılır.
  const baseUA = ses.getUserAgent().replace(/\s*Electron\/\S+/, "").replace(/\s*Elitlig\S*\/\S+/gi, "").replace(/\s*elitlig-araclar\/\S+/i, "");
  // "ElitligDesktopPanel/" imi bilerek "ElitligDesktop/" ile başlamaz: web'in eski
  // sürümü gömülü paneli kısıtlı (yalnız Araçlarım) moda sokmasın.
  ses.setUserAgent(`${baseUA} ElitligAraclar/${app.getVersion()} ElitligDesktopPanel/${app.getVersion()}`);
  // Açılır pencerelerde Chromium varsayılan UA'yı kullanabiliyor: istek başlığı her zaman
  // panel imini taşır (sayfanın kendisi köprü nesnesinden de tanır).
  const PANEL_UA = ses.getUserAgent();
  ses.webRequest.onBeforeSendHeaders((details, callback) => {
    const headers = details.requestHeaders;
    if (headers["User-Agent"] !== PANEL_UA) headers["User-Agent"] = PANEL_UA;
    callback({ requestHeaders: headers });
  });
  const PERMISSIONS = new Set(["notifications", "clipboard-sanitized-write", "clipboard-read", "fullscreen", "media", "pointerLock"]);
  ses.setPermissionRequestHandler((_wc, permission, callback, details) => callback(PERMISSIONS.has(permission) && isSiteUrl(details?.requestingUrl || details?.securityOrigin || "")));
  ses.setPermissionCheckHandler((_wc, permission, requestingOrigin) => PERMISSIONS.has(permission) && originOf(requestingOrigin) === SITE);

  // Geliştirme / test: API başka bir sunucuya yönlendirildiyse (ELITLIG_API_ORIGIN),
  // web'in eski sayfalarındaki sabit üretim API adresi de oraya gider. Üretimde kapalı.
  if (process.env.ELITLIG_PANEL_API_REWRITE === "1" && API && API !== PROD_API_ORIGIN) {
    ses.protocol.handle("https", (request) => {
      if (originOf(request.url) === PROD_API_ORIGIN) {
        const target = API + request.url.slice(PROD_API_ORIGIN.length);
        return net.fetch(target, { method: request.method, headers: request.headers, body: request.body, duplex: "half", bypassCustomProtocolHandlers: true });
      }
      return net.fetch(request, { bypassCustomProtocolHandlers: true });
    });
  }

  /* -------------------------------- indirmeler -------------------------------- */

  const publicDownloads = () => downloads.slice(-30).map(({ item, ...rest }) => rest);
  const sendDownloads = () => broadcast("admin:downloads", publicDownloads());
  ses.on("will-download", (_event, item) => {
    const name = item.getFilename() || "indirilen-dosya";
    const testDir = process.env.ELITLIG_TEST_DOWNLOAD_DIR;
    if (testDir && !app.isPackaged) item.setSavePath(path.join(testDir, name));
    else item.setSaveDialogOptions({ title: "İndirilen dosyayı kaydet", defaultPath: path.join(app.getPath("downloads"), name), buttonLabel: "Kaydet" });
    const entry = { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, name, url: item.getURL(), path: null, received: 0, total: item.getTotalBytes(), state: "progressing", startedAt: Date.now(), item };
    downloads.push(entry);
    if (downloads.length > 60) downloads.splice(0, downloads.length - 60);
    item.on("updated", (_e, st) => {
      entry.state = st === "interrupted" ? "interrupted" : item.isPaused() ? "paused" : "progressing";
      entry.received = item.getReceivedBytes();
      entry.total = item.getTotalBytes();
      entry.path = item.getSavePath() || entry.path;
      if (entry.path) entry.name = path.basename(entry.path);
      sendDownloads();
    });
    item.once("done", (_e, st) => {
      entry.state = st; // completed | cancelled | interrupted
      entry.received = item.getReceivedBytes();
      entry.path = item.getSavePath() || null;
      if (entry.path) entry.name = path.basename(entry.path);
      entry.item = null;
      sendDownloads();
    });
    sendDownloads();
  });

  /* ------------------------------ gezinme koruması ------------------------------ */

  const openExternal = (url) => {
    if (/^(https?|mailto|tel|sms|whatsapp):/i.test(String(url))) shell.openExternal(String(url)).catch(() => {});
  };

  function popupOptions() {
    return {
      width: 1180, height: 820, minWidth: 640, minHeight: 480, autoHideMenuBar: true, title: "Elitlig Yönetim",
      webPreferences: panelWebPreferences(),
    };
  }

  function guardContents(wc, { main = false } = {}) {
    wc.setWindowOpenHandler(({ url }) => {
      if (isSiteUrl(url) || url === "about:blank" || url.startsWith(`blob:${SITE}`)) {
        // Site içi açılır pencere uygulama içinde, aynı oturum bölmesi ve aynı UA imiyle açılır
        // (window.opener korunur: ör. yazdırma önizlemesi, yeni sekmede rapor).
        return {
          action: "allow",
          overrideBrowserWindowOptions: popupOptions(),
          createWindow: (options) => {
            const child = new BrowserWindow({ ...options, ...popupOptions(), webPreferences: { ...(options.webPreferences || {}), ...panelWebPreferences() } });
            child.webContents.setUserAgent(ses.getUserAgent());
            return child.webContents;
          },
        };
      }
      openExternal(url);
      return { action: "deny" };
    });
    wc.on("did-create-window", (child) => {
      extraWindows.add(child);
      child.on("closed", () => extraWindows.delete(child));
      guardContents(child.webContents);
    });
    const onNavigate = (event, url) => {
      if (allowedOrigin(url) || url.startsWith("about:") || url.startsWith(`blob:${SITE}`)) return;
      event.preventDefault();
      openExternal(url);
    };
    // Yalnız sayfanın başlattığı gezinme denetlenir; sunucu yönlendirmeleri (ör. API'den
    // depolamadaki dosyaya indirme) engellenmez.
    wc.on("will-navigate", onNavigate);
    wc.on("will-attach-webview", (event) => event.preventDefault());
    wc.on("context-menu", (_e, params) => contextMenu(wc, params));
    wc.on("found-in-page", (_e, result) => {
      if (!main) return;
      state = { ...state, find: { active: result.activeMatchOrdinal, matches: result.matches } };
      sendState();
    });
  }

  function contextMenu(wc, params) {
    const items = [];
    if (params.misspelledWord && params.dictionarySuggestions?.length) {
      items.push(...params.dictionarySuggestions.slice(0, 4).map((word) => ({ label: word, click: () => wc.replaceMisspelling(word) })), { type: "separator" });
    }
    if (params.linkURL) {
      const internal = isSiteUrl(params.linkURL);
      items.push(
        ...(internal ? [{ label: "Bağlantıyı yeni pencerede aç", click: () => openWindow(params.linkURL) }] : []),
        { label: "Bağlantıyı tarayıcıda aç", click: () => openExternal(params.linkURL) },
        { label: "Bağlantıyı kopyala", click: () => clipboard.writeText(params.linkURL) },
        { type: "separator" },
      );
    }
    if (params.mediaType === "image" && params.srcURL) {
      items.push({ label: "Görseli kaydet…", click: () => wc.downloadURL(params.srcURL) }, { label: "Görseli kopyala", click: () => wc.copyImageAt(params.x, params.y) }, { type: "separator" });
    }
    if (params.isEditable) items.push({ role: "cut", label: "Kes" }, { role: "copy", label: "Kopyala" }, { role: "paste", label: "Yapıştır" }, { role: "selectAll", label: "Tümünü seç" }, { type: "separator" });
    else if (params.selectionText) items.push({ role: "copy", label: "Kopyala" }, { type: "separator" });
    const hist = wc.navigationHistory;
    items.push(
      { label: "Geri", enabled: hist.canGoBack(), click: () => hist.goBack() },
      { label: "İleri", enabled: hist.canGoForward(), click: () => hist.goForward() },
      { label: "Yeniden yükle", click: () => wc.reload() },
      { type: "separator" },
      { label: "Sayfa adresini kopyala", click: () => clipboard.writeText(wc.getURL()) },
      { label: "Yazdır…", click: () => wc.print({ printBackground: true }) },
    );
    if (!app.isPackaged) items.push({ type: "separator" }, { label: "Öğeyi incele", click: () => wc.inspectElement(params.x, params.y) });
    Menu.buildFromTemplate(items).popup();
  }

  function panelWebPreferences() {
    return {
      ...(secureWebPreferences ? secureWebPreferences() : {}),
      preload: path.join(__dirname, "preload.js"),
      partition: PARTITION,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      nodeIntegrationInSubFrames: false,
      webviewTag: false,
      spellcheck: true,
    };
  }

  /* -------------------------------- görünüm -------------------------------- */

  const urlFor = (p) => new URL(navModel.safeSitePath(p) || navModel.DASHBOARD_PATH, SITE).toString();
  const pathOf = (url) => { try { const u = new URL(url); return u.origin === SITE ? `${u.pathname}${u.search}${u.hash}` : url; } catch { return null; } };

  const sendState = () => broadcast("admin:state", publicState());
  const publicState = () => ({ ...state, attached, created: Boolean(view), nativeTools: prefs.nativeTools, online: net.isOnline() });

  const refreshNavState = () => {
    if (!view) return;
    const wc = view.webContents;
    const url = wc.getURL();
    state = {
      ...state,
      url,
      path: pathOf(url),
      title: wc.getTitle(),
      canGoBack: wc.navigationHistory.canGoBack(),
      canGoForward: wc.navigationHistory.canGoForward(),
      loading: wc.isLoading(),
    };
    if (state.path && isSiteUrl(url) && !state.error) { prefs.lastPath = state.path; writeJson(prefsFile(), prefs); }
    sendState();
  };

  function ensureView() {
    if (view && !view.webContents.isDestroyed()) return view;
    view = new WebContentsView({ webPreferences: panelWebPreferences() });
    view.setBackgroundColor("#00000000");
    const wc = view.webContents;
    guardContents(wc, { main: true });
    wc.on("did-start-loading", () => { state = { ...state, loading: true }; sendState(); });
    wc.on("did-stop-loading", refreshNavState);
    wc.on("did-navigate", () => { state = { ...state, error: null }; refreshNavState(); });
    wc.on("did-navigate-in-page", (_e, url, isMainFrame) => {
      if (!isMainFrame) return;
      refreshNavState();
      // Web'in kişisel araçları yerel araçta açılır (ayar: nativeTools).
      const route = prefs.nativeTools ? navModel.nativeRouteFor(url, SITE) : null;
      if (route) {
        if (wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack();
        else wc.loadURL(urlFor(navModel.DASHBOARD_PATH));
        showMain(route);
      }
    });
    wc.on("page-title-updated", refreshNavState);
    wc.on("did-fail-load", (_e, code, description, url, isMainFrame) => {
      if (!isMainFrame || code === -3) return; // -3: iptal (yeni gezinme başladı)
      state = { ...state, loading: false, error: { code, description, url, offline: OFFLINE_CODES.has(code) || !net.isOnline() } };
      applyBounds();
      sendState();
    });
    wc.on("render-process-gone", (_e, details) => {
      state = { ...state, loading: false, error: { code: "crashed", description: details?.reason || "çöktü", offline: false } };
      applyBounds();
      sendState();
    });
    wc.on("focus", () => broadcast("admin:focus", true));
    const start = prefs.lastPath && navModel.safeSitePath(prefs.lastPath) ? prefs.lastPath : navModel.DASHBOARD_PATH;
    state = { ...state, error: null };
    wc.loadURL(urlFor(start)).catch(() => {});
    rebuildMenu?.(); // Yönetim menüsündeki geri / ileri / yeni pencere etkinleşir
    return view;
  }

  function applyBounds() {
    if (!view || !attached || !lastBounds) return;
    const show = visible && !state.error;
    view.setVisible(show);
    if (show) view.setBounds(lastBounds);
  }

  function attach(win, bounds) {
    if (!signedIn() || !win || win.isDestroyed()) return publicState();
    ensureView();
    if (host && host !== win && !host.isDestroyed()) host.contentView.removeChildView(view);
    if (!attached || host !== win) win.contentView.addChildView(view);
    host = win;
    attached = true;
    setBounds(bounds);
    return publicState();
  }

  function setBounds(bounds) {
    if (!bounds || !host || host.isDestroyed()) return;
    const zoom = host.webContents.getZoomFactor() || 1;
    const r = (n) => Math.max(0, Math.round(Number(n || 0) * zoom));
    lastBounds = { x: r(bounds.x), y: r(bounds.y), width: r(bounds.width), height: r(bounds.height) };
    if (typeof bounds.visible === "boolean") visible = bounds.visible;
    applyBounds();
  }

  function detach() {
    if (view && host && !host.isDestroyed()) {
      try { host.contentView.removeChildView(view); } catch { /* zaten yok */ }
    }
    attached = false;
    sendState();
  }

  /** Oturum kapandı: görünüm, açılır pencereler ve bölmenin tüm verisi silinir. */
  async function reset() {
    detach();
    for (const w of extraWindows) { try { w.destroy(); } catch { /* yoksay */ } }
    extraWindows.clear();
    if (view) { try { view.webContents.close(); } catch { /* yoksay */ } }
    view = null;
    host = null;
    published = null;
    try { fs.unlinkSync(navFile()); } catch { /* yok */ }
    prefs = { ...prefs, lastPath: null };
    writeJson(prefsFile(), prefs);
    state = { url: null, path: null, title: "", canGoBack: false, canGoForward: false, loading: false, error: null, find: null };
    await ses.clearStorageData().catch(() => {});
    await ses.clearCache().catch(() => {});
    broadcast("admin:nav", nav());
    sendState();
  }

  /** Masaüstü oturumu değişti (giriş, jeton yenileme, kullanıcı bilgisi): panel eşitlenir. */
  function pushSession() {
    const payload = sessionPayload();
    const all = [view?.webContents, ...[...extraWindows].map((w) => w.webContents)].filter((wc) => wc && !wc.isDestroyed());
    for (const wc of all) wc.send("admin-panel:session", payload);
  }

  // Oturum deposu sarılır: kaydet / sil çağrıları (giriş, yenileme, çıkış) panele yansır.
  const origSave = sessionStore.save.bind(sessionStore);
  const origClear = sessionStore.clear.bind(sessionStore);
  let lastUser = navModel.userKey(currentSession()?.user);
  sessionStore.save = (session) => {
    const prevToken = currentSession()?.token;
    const result = origSave(session);
    const key = navModel.userKey(session?.user);
    if (prevToken !== session?.token || key !== lastUser) pushSession();
    if (key !== lastUser) { lastUser = key; broadcast("admin:nav", nav()); rebuildMenu?.(); }
    return result;
  };
  sessionStore.clear = () => {
    const had = Boolean(currentSession()?.token);
    const result = origClear();
    lastUser = "";
    if (had || view) reset().finally(() => rebuildMenu?.());
    return result;
  };

  /* ---------------------------------- menü ---------------------------------- */

  function nav() {
    const user = currentSession()?.user || null;
    if (!user) return { source: "none", groups: [], actions: [] };
    return navModel.navFor(user, published);
  }

  function go(p) {
    const target = navModel.safeSitePath(p) || navModel.DASHBOARD_PATH;
    showMain("admin");
    if (!signedIn()) return false; // giriş ekranı açılır; panel oturumdan sonra yüklenir
    const v = ensureView();
    state = { ...state, error: null };
    // SPA içinde yeniden yüklemeden gezinme: web'in yönlendiricisine popstate ile bildirilir.
    const wc = v.webContents;
    if (!wc.isLoading() && isSiteUrl(wc.getURL()) && !state.error) {
      wc.executeJavaScript(`(()=>{try{const p=${JSON.stringify(target)};if(location.pathname+location.search===p)return true;history.pushState({},"",p);dispatchEvent(new PopStateEvent("popstate",{state:{}}));return true}catch(e){return false}})()`, true)
        .then((ok) => { if (!ok) wc.loadURL(urlFor(target)); })
        .catch(() => wc.loadURL(urlFor(target)));
    } else {
      wc.loadURL(urlFor(target)).catch(() => {});
    }
    return true;
  }

  function openWindow(url) {
    const target = url && isSiteUrl(url) ? url : view ? view.webContents.getURL() : urlFor(navModel.DASHBOARD_PATH);
    if (!isSiteUrl(target)) return false;
    const win = new BrowserWindow(popupOptions());
    win.webContents.setUserAgent(ses.getUserAgent());
    extraWindows.add(win);
    win.on("closed", () => extraWindows.delete(win));
    guardContents(win.webContents);
    win.loadURL(target).catch(() => {});
    return true;
  }

  function command(name, arg) {
    const wc = view?.webContents;
    switch (name) {
      case "back": if (wc?.navigationHistory.canGoBack()) wc.navigationHistory.goBack(); return true;
      case "forward": if (wc?.navigationHistory.canGoForward()) wc.navigationHistory.goForward(); return true;
      case "reload":
        if (!wc) return false;
        state = { ...state, error: null };
        if (state.url && isSiteUrl(state.url)) wc.reload(); else wc.loadURL(urlFor(prefs.lastPath || navModel.DASHBOARD_PATH));
        applyBounds();
        return true;
      case "stop": wc?.stop(); return true;
      case "home": return go(navModel.DASHBOARD_PATH);
      case "go": return go(arg);
      case "print": wc?.print({ printBackground: true }); return Boolean(wc);
      case "openWindow": return openWindow(arg);
      case "openExternal": {
        const url = arg ? urlFor(arg) : state.url;
        if (url && allowedOrigin(url)) shell.openExternal(url).catch(() => {});
        return true;
      }
      case "copyLink": if (state.url) clipboard.writeText(state.url); return true;
      case "focus": wc?.focus(); return true;
      case "find": {
        const text = String(arg?.text || "");
        if (!wc) return false;
        if (!text) { wc.stopFindInPage("clearSelection"); state = { ...state, find: null }; sendState(); return true; }
        wc.findInPage(text, { forward: arg?.forward !== false, findNext: Boolean(arg?.next) });
        return true;
      }
      case "zoom": {
        if (!wc) return false;
        const z = arg === "in" ? wc.getZoomLevel() + 0.5 : arg === "out" ? wc.getZoomLevel() - 0.5 : 0;
        wc.setZoomLevel(Math.max(-3, Math.min(4, z)));
        return true;
      }
      default: return false;
    }
  }

  async function printToPdf(event) {
    const wc = view?.webContents;
    if (!wc) return { ok: false };
    const name = `${(state.title || "Elitlig Yönetim").replace(/[\\/:*?"<>|]+/g, " ").trim().slice(0, 80) || "Elitlig"}.pdf`;
    let filePath = null;
    const testDir = process.env.ELITLIG_TEST_DOWNLOAD_DIR;
    if (testDir && !app.isPackaged) filePath = path.join(testDir, name);
    else {
      const parent = BrowserWindow.fromWebContents(event.sender);
      const res = await dialog.showSaveDialog(parent, { defaultPath: path.join(app.getPath("downloads"), name), filters: [{ name: "PDF", extensions: ["pdf"] }] });
      if (res.canceled || !res.filePath) return { ok: false };
      filePath = res.filePath;
    }
    fs.writeFileSync(filePath, await wc.printToPDF({ printBackground: true, pageSize: "A4" }));
    return { ok: true, path: filePath };
  }

  async function confirmSignOut() {
    const parent = getMainWindow();
    const { response } = await dialog.showMessageBox(parent, {
      type: "question", buttons: ["Oturumu kapat", "Vazgeç"], defaultId: 1, cancelId: 1,
      message: "Oturumu kapatmak istiyor musunuz?",
      detail: "Yönetim paneli ve uygulamanın oturumu birlikte kapanır; bu bilgisayardaki çevrimdışı veriler silinir.",
    });
    if (response === 0) await logout();
  }

  function menuTemplate() {
    const { groups } = nav();
    const sections = groups.filter((g) => !g.top && !g.tools);
    const top = groups.filter((g) => g.top && !g.workflow && g.key !== "is-akisi").flatMap((g) => g.items);
    return {
      label: "Yönetim",
      submenu: [
        { label: "Yönetim Paneli", accelerator: "CmdOrCtrl+Shift+L", click: () => { showMain("admin"); } },
        ...top.filter((i) => i.path !== navModel.DASHBOARD_PATH).map((i) => ({ label: i.name, click: () => go(i.path) })),
        { label: "Panel Ana Sayfası", click: () => go(navModel.DASHBOARD_PATH), enabled: signedIn() },
        { type: "separator" },
        ...(sections.length
          ? sections.map((g) => ({ label: g.label, submenu: g.items.map((i) => ({ label: i.name, click: () => go(i.path) })) }))
          : [{ label: signedIn() ? "Bölümler panel açılınca yüklenir" : "Oturum açın", enabled: false }]),
        { type: "separator" },
        { label: "Geri", accelerator: "CmdOrCtrl+[", enabled: Boolean(view), click: () => command("back") },
        { label: "İleri", accelerator: "CmdOrCtrl+]", enabled: Boolean(view), click: () => command("forward") },
        { label: "Paneli Yeniden Yükle", enabled: Boolean(view), click: () => command("reload") },
        { type: "separator" },
        { label: "Yeni Pencerede Aç", enabled: Boolean(view), click: () => openWindow() },
        { label: "Tarayıcıda Aç", enabled: Boolean(view), click: () => command("openExternal") },
        { label: "Sayfa Adresini Kopyala", enabled: Boolean(view), click: () => command("copyLink") },
        { type: "separator" },
        { label: "Kişisel Araçları Yerel Uygulamada Aç", type: "checkbox", checked: prefs.nativeTools, click: (item) => { prefs.nativeTools = item.checked; writeJson(prefsFile(), prefs); sendState(); } },
      ],
    };
  }

  /* ----------------------------------- IPC ----------------------------------- */

  // Ön yükleme: yalnız panel bölmesindeki, SITE_ORIGIN'de duran ana çerçeve jeton alır.
  ipcMain.on("admin-panel:bootstrap", (event) => {
    const frameUrl = event.senderFrame?.url || "";
    const ok = event.sender.session === ses && isSiteUrl(frameUrl) && (!event.senderFrame?.parent);
    event.returnValue = ok ? { allowed: true, version: app.getVersion(), session: sessionPayload() } : { allowed: false };
  });
  const fromPanel = (event) => event.sender.session === ses && isSiteUrl(event.senderFrame?.url || "");
  ipcMain.on("admin-panel:signOut", (event) => { if (fromPanel(event)) confirmSignOut(); });
  ipcMain.on("admin-panel:sessionExpired", async (event) => {
    if (!fromPanel(event)) return;
    const ok = await verifySession().catch(() => false);
    // Jeton geçerliyse panel yeniden eşitlenir; değilse ana süreç oturumu kapatır (giriş ekranı).
    if (ok) { pushSession(); event.sender.reload(); }
  });
  ipcMain.on("admin-panel:nav", (event, groups) => {
    if (!fromPanel(event)) return;
    const clean = navModel.sanitizePublished(groups);
    const user = currentSession()?.user;
    if (!clean || !user) return;
    const next = { userKey: navModel.userKey(user), at: Date.now(), groups: clean };
    if (published && published.userKey === next.userKey && JSON.stringify(published.groups) === JSON.stringify(clean)) return;
    published = next;
    writeJson(navFile(), published);
    broadcast("admin:nav", nav());
    rebuildMenu?.();
  });

  ipcMain.handle("admin:nav", () => nav());
  ipcMain.handle("admin:state", () => publicState());
  ipcMain.handle("admin:attach", (event, bounds) => attach(BrowserWindow.fromWebContents(event.sender), bounds));
  ipcMain.handle("admin:bounds", (_e, bounds) => { setBounds(bounds); return true; });
  ipcMain.handle("admin:detach", () => { detach(); return true; });
  ipcMain.handle("admin:cover", async (_e, on) => {
    // Arayüzün kendi katmanları (komut paleti, pencereler) gömülü görünümün altında
    // kalırdı: kaplama açılınca görünümün anlık görüntüsü verilir, görünüm gizlenir.
    if (!view || !attached) return null;
    if (on) {
      let image = null;
      try { if (visible && !state.error) image = (await view.webContents.capturePage()).toDataURL(); } catch { image = null; }
      visible = false;
      applyBounds();
      return image;
    }
    visible = true;
    applyBounds();
    return null;
  });
  ipcMain.handle("admin:go", (_e, p) => go(p));
  ipcMain.handle("admin:command", (_e, name, arg) => command(String(name || ""), arg));
  ipcMain.handle("admin:pdf", (event) => printToPdf(event));
  ipcMain.handle("admin:downloads", () => publicDownloads());
  ipcMain.handle("admin:download", (_e, { id, action } = {}) => {
    const entry = downloads.find((d) => d.id === id);
    if (!entry) return false;
    if (action === "cancel") entry.item?.cancel();
    else if (action === "pause") entry.item?.pause();
    else if (action === "resume") entry.item?.resume();
    else if (action === "reveal" && entry.path) shell.showItemInFolder(entry.path);
    else if (action === "open" && entry.path) shell.openPath(entry.path);
    else if (action === "forget") downloads.splice(downloads.indexOf(entry), 1);
    sendDownloads();
    return true;
  });
  ipcMain.handle("admin:prefs", (_e, patch) => {
    if (patch && typeof patch.nativeTools === "boolean") { prefs.nativeTools = patch.nativeTools; writeJson(prefsFile(), prefs); rebuildMenu?.(); }
    sendState();
    return { nativeTools: prefs.nativeTools };
  });

  log("[yönetim] panel hazır:", SITE);

  return {
    menuTemplate,
    go,
    nav,
    command,
    reset,
    session: ses,
    dispose: () => { for (const w of extraWindows) { try { w.destroy(); } catch { /* yoksay */ } } },
  };
}

module.exports = { registerAdminPanel, PARTITION };
