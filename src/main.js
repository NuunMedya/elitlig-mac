// Elitlig Araçlar — Mac masaüstü uygulaması (ana süreç).
//
// Uygulama elitlig.com'un Araçlar bölümünü (Araçlar Merkezi, Yapılacaklar,
// Ajanda, Not Defteri, Ön Muhasebe, Tablolar, Rehber, Hesap Araçları, Odak
// Sayacı) kendi penceresinde açar. Böylece sitedeki tüm özellikler ve
// araçların bağlı olduğu tüm veriler (görevler, maç görevleri, üye rehberi,
// paylaşılan tablolar…) her zaman güncel haliyle masaüstünde kullanılır.
//
// Oturum: uygulama kendini User-Agent'taki "ElitligDesktop/<sürüm>" imiyle
// tanıtır; sunucu bu girişlere 90 günlük oturum verir. Çerez ve yerel depolama
// kalıcı "persist:elitlig" bölümünde saklandığı için bir kez giriş yaptıktan
// sonra 3 ay boyunca uygulama yeniden giriş istemeden açılır.
"use strict";

const path = require("node:path");
const fs = require("node:fs");
const {
  app, BrowserWindow, Menu, shell, session, dialog, ipcMain, nativeTheme,
} = require("electron");
const {
  SITE_ORIGIN, API_ORIGIN, ALLOWED_ORIGINS, TOOLS_PATH, LOGIN_PATH, TOOLS, SESSION_PARTITION, USER_AGENT_MARK,
} = require("./config");

const APP_NAME = "Elitlig Araçlar";
app.setName(APP_NAME);

const OFFLINE_PAGE = path.join(__dirname, "offline.html");
const STATE_FILE = () => path.join(app.getPath("userData"), "window-state.json");

let mainWindow = null;
let lastOnlineUrl = null; // bağlantı kopunca geri dönülecek adres
let quitting = false;

/* ---------- yardımcılar ---------- */

const originOf = (url) => {
  try { return new URL(url).origin; } catch { return null; }
};
const isSiteUrl = (url) => ALLOWED_ORIGINS.has(originOf(url));
const siteUrl = (pathname) => new URL(pathname, SITE_ORIGIN).toString();

const readState = () => {
  try { return JSON.parse(fs.readFileSync(STATE_FILE(), "utf8")); } catch { return {}; }
};
const writeState = (patch) => {
  try { fs.writeFileSync(STATE_FILE(), JSON.stringify({ ...readState(), ...patch })); } catch { /* yoksay */ }
};

// Açılışta en son bakılan araç sayfası açılır; yoksa Araçlar Merkezi.
const startUrl = () => {
  const last = readState().lastUrl;
  if (last && isSiteUrl(last) && !new URL(last).pathname.startsWith(LOGIN_PATH)) return last;
  return siteUrl(TOOLS_PATH);
};

// Oturum çerezi (90 gün) yoksa ya da süresi dolduysa doğrudan giriş sayfası
// açılır; aksi halde site korumalı sayfada önce "Oturumunuz sona erdi"
// uyarısı gösterip sonra girişe yönlendiriyordu.
const hasSession = async () => {
  try {
    const cookies = await session.fromPartition(SESSION_PARTITION).cookies.get({ url: API_ORIGIN, name: "authToken" });
    const now = Date.now() / 1000;
    return cookies.some((cookie) => !cookie.expirationDate || cookie.expirationDate > now);
  } catch {
    return false;
  }
};
const launchUrl = async () => ((await hasSession()) ? startUrl() : siteUrl(LOGIN_PATH));

const openExternal = (url) => {
  if (/^(https?|mailto|tel|sms|whatsapp|facetime|maps):/i.test(url)) shell.openExternal(url).catch(() => {});
};

const go = (pathname) => {
  if (!mainWindow) return createWindow(siteUrl(pathname));
  mainWindow.show();
  mainWindow.loadURL(siteUrl(pathname));
};

/* ---------- oturum ---------- */

const configureSession = () => {
  const ses = session.fromPartition(SESSION_PARTITION);
  // Varsayılan UA uygulama adını ("ElitligAraçlar/1.0.0") taşır; ASCII dışı
  // karakterli başlık bazı sunucu/vekillerde sorun çıkarabildiği için atılır.
  const baseUserAgent = ses.getUserAgent().split(" ").filter((token) => /^[\x21-\x7e]+$/.test(token)).join(" ");
  ses.setUserAgent(`${baseUserAgent} ${USER_AGENT_MARK}/${app.getVersion()}`);

  // Bildirimler (ajanda/odak sayacı), pano, tam ekran ve sesli arama için
  // mikrofon yalnız elitlig.com'a verilir.
  const ALLOWED_PERMISSIONS = new Set(["notifications", "clipboard-read", "clipboard-sanitized-write", "fullscreen", "media", "fileSystem"]);
  ses.setPermissionRequestHandler((wc, permission, callback, details) => {
    callback(ALLOWED_PERMISSIONS.has(permission) && isSiteUrl(details?.requestingUrl || wc.getURL()));
  });
  ses.setPermissionCheckHandler((wc, permission, requestingOrigin) =>
    ALLOWED_PERMISSIONS.has(permission) && ALLOWED_ORIGINS.has(requestingOrigin));

  // İndirilen dosyalar (Excel dışa aktarma, yazdırma çıktıları) İndirilenler'e.
  ses.on("will-download", (_event, item) => {
    const target = path.join(app.getPath("downloads"), item.getFilename());
    item.setSaveDialogOptions({ defaultPath: target });
    item.once("done", (_e, state) => {
      if (state === "completed") app.dock?.downloadFinished(item.getSavePath());
    });
  });
  return ses;
};

const signOut = async () => {
  const { response } = await dialog.showMessageBox(mainWindow, {
    type: "question",
    buttons: ["Çıkış yap", "Vazgeç"],
    defaultId: 1,
    cancelId: 1,
    message: "Oturumu kapatmak istiyor musunuz?",
    detail: "Bu Mac'teki Elitlig oturumu kapatılır. Araçları yeniden kullanmak için giriş yapmanız gerekir.",
  });
  if (response !== 0) return;
  const ses = session.fromPartition(SESSION_PARTITION);
  // Sunucudaki çerezi de kapat; ağ yoksa yerel temizlik yine yapılır.
  try {
    if (isSiteUrl(mainWindow.webContents.getURL())) {
      await mainWindow.webContents.executeJavaScript(
        `(() => { const t = localStorage.getItem("accessToken");
          return fetch(${JSON.stringify(`${API_ORIGIN}/api/users/logout`)}, { method: "POST", credentials: "include",
            headers: t ? { Authorization: "Bearer " + t } : {} }).catch(() => {}); })()`,
        true
      );
    }
  } catch { /* yoksay */ }
  await ses.clearStorageData();
  await ses.clearCache();
  writeState({ lastUrl: null });
  mainWindow.loadURL(siteUrl(LOGIN_PATH));
};

/* ---------- pencere ---------- */

const attachGuards = (win) => {
  const wc = win.webContents;

  // Site dışındaki adresler pencerede açılmaz; Mac'in varsayılan uygulamasına gider.
  wc.on("will-navigate", (event, url) => {
    if (isSiteUrl(url) || url.startsWith("file:")) return;
    event.preventDefault();
    openExternal(url);
  });

  // Yeni pencere: site içi sayfalar ve yazdırma pencereleri (about:blank)
  // uygulamada açılır; geri kalan her şey tarayıcıda.
  wc.setWindowOpenHandler(({ url }) => {
    if (url === "about:blank" || url === "" || isSiteUrl(url)) {
      return {
        action: "allow",
        overrideBrowserWindowOptions: {
          width: 1100, height: 800, parent: undefined,
          webPreferences: { partition: SESSION_PARTITION, preload: path.join(__dirname, "preload.js"), contextIsolation: true, sandbox: true },
        },
      };
    }
    openExternal(url);
    return { action: "deny" };
  });
  wc.on("did-create-window", (child) => attachGuards(child));

  // Kopya/yapıştır sağ tık menüsü (Tablolar, Not Defteri vb. için).
  wc.on("context-menu", (_event, params) => {
    const items = [];
    if (params.linkURL) {
      items.push({ label: "Bağlantıyı tarayıcıda aç", click: () => openExternal(params.linkURL) });
      items.push({ label: "Bağlantıyı kopyala", click: () => require("electron").clipboard.writeText(params.linkURL) });
      items.push({ type: "separator" });
    }
    if (params.isEditable) {
      items.push(
        { role: "undo", label: "Geri al", enabled: params.editFlags.canUndo },
        { role: "redo", label: "Yinele", enabled: params.editFlags.canRedo },
        { type: "separator" },
        { role: "cut", label: "Kes", enabled: params.editFlags.canCut },
        { role: "copy", label: "Kopyala", enabled: params.editFlags.canCopy },
        { role: "paste", label: "Yapıştır", enabled: params.editFlags.canPaste },
        { role: "selectAll", label: "Tümünü seç" },
      );
    } else if (params.selectionText) {
      items.push({ role: "copy", label: "Kopyala" });
    }
    if (params.misspelledWord && params.dictionarySuggestions.length) {
      items.unshift(...params.dictionarySuggestions.slice(0, 4).map((word) => ({ label: word, click: () => wc.replaceMisspelling(word) })), { type: "separator" });
    }
    if (items.length) Menu.buildFromTemplate(items).popup({ window: win });
  });
};

const createWindow = (url) => {
  const saved = readState().bounds || {};
  const win = new BrowserWindow({
    title: APP_NAME,
    width: saved.width || 1360,
    height: saved.height || 880,
    x: saved.x,
    y: saved.y,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#14101c" : "#f4f5fa",
    webPreferences: {
      partition: SESSION_PARTITION,
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: true,
    },
  });
  mainWindow = win;
  if (saved.maximized) win.maximize();

  attachGuards(win);
  const wc = win.webContents;

  win.once("ready-to-show", () => win.show());

  // Son bakılan sayfa saklanır; bağlantı kopunca çevrimdışı sayfası gösterilir.
  const remember = (_e, navUrl) => {
    if (!isSiteUrl(navUrl)) return;
    lastOnlineUrl = navUrl;
    writeState({ lastUrl: navUrl });
  };
  wc.on("did-navigate", remember);
  wc.on("did-navigate-in-page", (e, navUrl, isMainFrame) => { if (isMainFrame) remember(e, navUrl); });
  wc.on("did-fail-load", (_e, code, _desc, failedUrl, isMainFrame) => {
    // -3: kullanıcı/yönlendirme iptali; hata sayılmaz.
    if (!isMainFrame || code === -3 || !isSiteUrl(failedUrl)) return;
    lastOnlineUrl = failedUrl;
    win.loadFile(OFFLINE_PAGE);
  });
  wc.on("page-title-updated", (event, title) => {
    event.preventDefault();
    win.setTitle(title && !/^elitlig$/i.test(title.trim()) ? `${title} — ${APP_NAME}` : APP_NAME);
  });

  const saveBounds = () => {
    if (win.isDestroyed()) return;
    writeState({ bounds: win.isMaximized() ? readState().bounds : win.getBounds(), maximized: win.isMaximized() });
  };
  win.on("resized", saveBounds);
  win.on("moved", saveBounds);

  // Mac alışkanlığı: kırmızı düğme pencereyi gizler, uygulama Dock'ta kalır.
  win.on("close", (event) => {
    saveBounds();
    if (!quitting && process.platform === "darwin") {
      event.preventDefault();
      if (win.isFullScreen()) {
        win.once("leave-full-screen", () => win.hide());
        win.setFullScreen(false);
      } else {
        win.hide();
      }
    }
  });
  win.on("closed", () => { if (mainWindow === win) mainWindow = null; });

  Promise.resolve(url || launchUrl()).then((target) => win.loadURL(target));
  return win;
};

/* ---------- menü ---------- */

const buildMenu = () => {
  const toolItems = TOOLS.map((tool) => ({ label: tool.name, accelerator: tool.accelerator, click: () => go(tool.path) }));
  const template = [
    {
      label: APP_NAME,
      submenu: [
        { role: "about", label: `${APP_NAME} Hakkında` },
        { type: "separator" },
        { label: "Hesabım", click: () => go("/yonetim/hesabim") },
        { label: "Oturumu Kapat…", click: () => signOut() },
        { type: "separator" },
        { role: "services", label: "Servisler" },
        { type: "separator" },
        { role: "hide", label: `${APP_NAME}'ı Gizle` },
        { role: "hideOthers", label: "Diğerlerini Gizle" },
        { role: "unhide", label: "Tümünü Göster" },
        { type: "separator" },
        { role: "quit", label: `${APP_NAME}'tan Çık` },
      ],
    },
    {
      label: "Düzen",
      submenu: [
        { role: "undo", label: "Geri Al" },
        { role: "redo", label: "Yinele" },
        { type: "separator" },
        { role: "cut", label: "Kes" },
        { role: "copy", label: "Kopyala" },
        { role: "paste", label: "Yapıştır" },
        { role: "pasteAndMatchStyle", label: "Biçimi Eşleyerek Yapıştır" },
        { role: "delete", label: "Sil" },
        { role: "selectAll", label: "Tümünü Seç" },
      ],
    },
    { label: "Araçlar", submenu: toolItems },
    {
      label: "Git",
      submenu: [
        { label: "Geri", accelerator: "CmdOrCtrl+[", click: () => mainWindow?.webContents.navigationHistory.goBack() },
        { label: "İleri", accelerator: "CmdOrCtrl+]", click: () => mainWindow?.webContents.navigationHistory.goForward() },
        { type: "separator" },
        { label: "Sayfayı Tarayıcıda Aç", accelerator: "CmdOrCtrl+Shift+O", click: () => { const url = mainWindow?.webContents.getURL(); if (url && isSiteUrl(url)) shell.openExternal(url); } },
        { label: "Bağlantıyı Kopyala", accelerator: "CmdOrCtrl+Shift+C", click: () => { const url = mainWindow?.webContents.getURL(); if (url && isSiteUrl(url)) require("electron").clipboard.writeText(url); } },
      ],
    },
    {
      label: "Görünüm",
      submenu: [
        { role: "reload", label: "Yenile" },
        { role: "forceReload", label: "Önbelleği Atlayarak Yenile" },
        { type: "separator" },
        { role: "resetZoom", label: "Gerçek Boyut" },
        { role: "zoomIn", label: "Yakınlaştır" },
        { role: "zoomOut", label: "Uzaklaştır" },
        { type: "separator" },
        { role: "togglefullscreen", label: "Tam Ekran" },
        ...(app.isPackaged ? [] : [{ role: "toggleDevTools", label: "Geliştirici Araçları" }]),
      ],
    },
    {
      label: "Pencere",
      role: "window",
      submenu: [
        { role: "minimize", label: "Küçült" },
        { role: "zoom", label: "Büyüt" },
        { type: "separator" },
        { role: "front", label: "Tümünü Öne Getir" },
      ],
    },
    {
      label: "Yardım",
      role: "help",
      submenu: [{ label: "elitlig.com'u Aç", click: () => shell.openExternal(SITE_ORIGIN) }],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  app.dock?.setMenu(Menu.buildFromTemplate(toolItems));
};

/* ---------- uygulama yaşam döngüsü ---------- */

ipcMain.on("elitlig:version", (event) => { event.returnValue = app.getVersion(); });
ipcMain.on("elitlig:retry", () => {
  if (!mainWindow) return;
  mainWindow.loadURL(lastOnlineUrl && isSiteUrl(lastOnlineUrl) ? lastOnlineUrl : startUrl());
});

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return createWindow();
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  app.whenReady().then(() => {
    app.setAboutPanelOptions({
      applicationName: APP_NAME,
      applicationVersion: app.getVersion(),
      copyright: "© Elitlig",
      credits: "Elitlig Araçlar: Yapılacaklar, Ajanda, Not Defteri, Ön Muhasebe, Tablolar, Rehber, Hesap Araçları ve Odak Sayacı.",
    });
    configureSession();
    buildMenu();
    createWindow();

    app.on("activate", () => {
      if (mainWindow) mainWindow.show();
      else createWindow();
    });
  });

  app.on("before-quit", () => { quitting = true; });
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  // Uygulama içinden açılan hiçbir web görünümü Node'a erişemez.
  app.on("web-contents-created", (_event, contents) => {
    contents.on("will-attach-webview", (event) => event.preventDefault());
  });
}
