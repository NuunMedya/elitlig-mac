// Elitlig Araçlar — Mac masaüstü uygulaması (ana süreç).
//
// Bağımsız bir uygulamadır: kendi arayüzü (renderer/) vardır ve Elitlig
// sunucusunun API'siyle doğrudan konuşur. Web sitesini açmaz.
//
// Masaüstüne özgü:
//   - Oturum 90 gün açık kalır; jeton Anahtar Zinciri ile şifrelenir.
//   - Çevrimdışı çalışma: son veriler diskte, yazmalar kuyrukta.
//   - Menü çubuğu simgesi: odak sayacı, yaklaşan etkinlikler, açık işler.
//   - Her yerden hızlı kayıt penceresi (⌃⌥N): not, görev, etkinlik, gider.
//   - Ajanda/görev hatırlatmaları macOS bildirimi olarak, pencere kapalıyken de.
//   - Dock rozeti: bugün ve gecikmiş iş sayısı.
//   - Projeler (⌘0): süreç, kişiler/CRM, soru-cevap ve portföy.
//   - Mesajlar (⇧⌘M): gerçek-zaman bağlantısı ana süreçte (app/chat.js),
//     yeni mesaj bildirimi, okunmamış sayısı kenar çubuğunda, Dock'ta ve
//     menü çubuğunda; ekler (fotoğraf, belge, ses) ana süreçten yüklenir,
//     sohbet medyası diskte önbelleklenir (elitlig-media://).
//   - Üye mesajları (2.7): messages.view yetkisi olan yönetici için üyelerin
//     "ElitLig Yönetimi" sohbetleri Mesajlar'da ortak gelen kutusu olarak;
//     okunmamışları rozete eklenir, yeni üye mesajı bildirim olarak gelir.
//   - Talepler (⇧⌘T): onay bekleyen talepler (/api/admin/requests); toplam
//     kenar çubuğunda, Dock'ta ve menü çubuğunda; yeni talep socket'ten
//     ("admin:requests") gelir, pencere arka plandayken bildirim olur.
//   - Yayın Stüdyosu (2.9; 2.11: fifo ile kopmadan yeniden bağlanma, açı kopya kipi,
//     yerel tam kayıt, röportaj, LED çıkışı, tanılama günlüğü): arayüzün <canvas> programı MediaRecorder ile buraya
//     akar; ffmpeg (uygulamayla gelir) yeniden kodlayıp RTMP(S)'ye (YouTube)
//     ve 2 sn'lik klip halkasına yazar; gol klipleri MP4 olarak kaydedilip
//     sunucuya yüklenir (app/studio/). Kamera / mikrofon / ekran izinleri.
"use strict";

const path = require("node:path");
const fs = require("node:fs");
const {
  app, BrowserWindow, Menu, Tray, Notification, shell, ipcMain, dialog, nativeImage, net,
  globalShortcut, safeStorage, powerMonitor, nativeTheme, screen, protocol,
  session: electronSession, systemPreferences, desktopCapturer, powerSaveBlocker, clipboard,
} = require("electron");
const crypto = require("node:crypto");
const { io: socketIo } = require("socket.io-client");
const config = require("./config");
const { createSessionStore, sessionStatus, sessionEndsAt } = require("./session");
const { createApi } = require("./api");
const { createFocus, trayTitle } = require("./focus");
const { createReminders } = require("./reminders");
const { createEquipmentFeed } = require("./equipmentFeed");
const { createChatLink, buildMultipart, mimeOf } = require("./chat");
const { accessFromUser, probeAccess, sameAccess } = require("./access");
const { registerStudio, applyStudioSwitches, STUDIO_SCHEME } = require("./studio");
const { isAllowedExternal } = require("./links");
// Masaüstü araç takımı: pencere yerleştirme, araç takımı paneli, uyanık tut, müzik denetimi.
const { registerDeskkit } = require("./toolkit");
// Masaüstü widget'ları (saat, ajanda, yapılacaklar, sistem, hava, maçlar…): app/widgets.
const { registerWidgets } = require("./widgets");
// Dosya Araçları (Float rafı dahil) ve Ekran Görüntüleri / Pano rafı: app/fileTools, app/shelf.
const { registerFileTools } = require("./fileTools");
const { registerShelf } = require("./shelf");
const { createFileProtocol, SCHEME_PRIVILEGES: FILE_SCHEME_PRIVILEGES } = require("./fileTools/protocol");
// Yönetim: elitlig.com yönetim panelinin tamamı uygulama içinde, masaüstü oturumuyla (app/adminPanel).
const { WebContentsView } = require("electron");
const { registerAdminPanel } = require("./adminPanel");
const { applyTestSession } = require("./testSession");

// Sohbet medyası (fotoğraf, ses, belge) bu şemayla ana süreç üzerinden açılır:
// diskte önbelleklenir, çevrimdışı da görünür; arayüzün güvenlik politikası
// dış adreslerden ses/video çalmaya izin vermediği için de gereklidir.
const MEDIA_SCHEME = "elitlig-media";
// Yayın Stüdyosu klipleri, tekrarları ve öne çıkanları (userData/clips, replays,
// highlights) elitlig-studio://clips/<ad>, replays/<kimlik>/<dosya>, highlights/<ad> ile,
// Range destekli oynatılır; yalnız bu klasörlerdeki beyaz listedeki adlar sunulur.
protocol.registerSchemesAsPrivileged([
  { scheme: MEDIA_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } },
  { scheme: STUDIO_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true, bypassCSP: true } },
  FILE_SCHEME_PRIVILEGES,
]);

app.setName(config.APP_NAME);
// Yayın Stüdyosu: pencere arkada / örtülü / küçültülmüşken Chromium çizimi ve
// zamanlayıcıları kısmasın (canvas → MediaRecorder akışı durup yayın kopmasın).
applyStudioSwitches(app);
if (process.env.ELITLIG_USER_DATA) app.setPath("userData", process.env.ELITLIG_USER_DATA);

const RENDERER = path.join(__dirname, "..", "renderer", "dist", "index.html");
const DEV_URL = process.env.ELITLIG_RENDERER_URL || null;
const ASSETS = path.join(__dirname, "assets");
// Windows: pencere çerçevesi / tepsi / menü ve bildirimler için platform ayrımı.
const IS_MAC = process.platform === "darwin";
// Windows bildirimleri uygulama kimliği ister (NSIS kısayolu da appId'yi taşır).
if (process.platform === "win32") app.setAppUserModelId("com.elitlig.araclar");
const { appIconPath } = require("./appIcon");

let mainWindow = null;
let quickWindow = null;
let tray = null;
let quitting = false;
let trayInfo = { upcoming: [], summary: null };

const dataDir = () => app.getPath("userData");
const userAgent = () => `ElitligAraclar/${app.getVersion()} (Macintosh) ${config.USER_AGENT_MARK}/${app.getVersion()}`;

/* ------------------------------ servisler ------------------------------ */

let sessionStore;
let api;
let focus;
let reminders;
let chatLink;
let studio;
let deskkit = null;
let widgets = null;
let fileTools;
let shelf;
let adminPanel = null;
let chatNotes = new Map();
let probedAccess = null;
let requestsInfo = { total: 0, categories: [] };
const notifiedRequests = new Set();

const broadcast = (channel, payload) => {
  for (const win of BrowserWindow.getAllWindows()) if (!win.isDestroyed()) win.webContents.send(channel, payload);
};

function authState() {
  const session = sessionStore.load();
  const status = sessionStatus(session, { days: config.SESSION_DAYS });
  if (status === "none" || status === "expired") return { signedIn: false, expired: status === "expired" };
  return {
    signedIn: true,
    user: session.user,
    access: accessFromUser(session.user, probedAccess),
    loginAt: session.loginAt,
    endsAt: sessionEndsAt(session, { days: config.SESSION_DAYS }),
  };
}

const currentAccess = () => authState().access || accessFromUser(null);

/**
 * Oturumdaki kullanıcıyı (yetkiler dahil) sunucudan tazeler: yetki sitede
 * değişince uygulama yeniden giriş istemeden uyar. Liste gelmezse uçlar
 * yoklanır (403 = erişim yok).
 */
async function refreshUser() {
  const session = sessionStore.load();
  if (!session || !authState().signedIn) return;
  const before = currentAccess();
  const res = await api.request({ path: "/api/users/verify", cache: false, queue: false });
  if (res.ok && res.data?.user) sessionStore.save({ ...sessionStore.load(), user: { ...session.user, ...res.data.user } });
  if (!Array.isArray(sessionStore.load()?.user?.permissions)) {
    const probe = await probeAccess(api.request);
    if (probe) probedAccess = probe;
  }
  const after = currentAccess();
  if (!sameAccess(before, after) || (res.ok && JSON.stringify(res.data?.user?.permissions || null) !== JSON.stringify(session.user?.permissions || null))) {
    broadcast("auth:changed", { signedIn: true, access: after });
  }
  chatLink?.refreshInbox({ detect: false });
}

/* ------------------------------- Talepler ------------------------------- */

/** Talep özeti: kategori başına açık talep (kenar çubuğu, Dock, menü çubuğu, Bugün). */
async function refreshRequests() {
  if (!authState().signedIn || !currentAccess().requests) return requestsInfo;
  const res = await api.request({ path: "/api/admin/requests/summary", cache: true });
  if (res.ok && res.data) {
    requestsInfo = { total: Number(res.data.total) || 0, categories: Array.isArray(res.data.categories) ? res.data.categories : [] };
  } else if (res.error?.status === 403) requestsInfo = { total: 0, categories: [], denied: true };
  broadcast("requests:summary", requestsInfo);
  updateBadge();
  refreshTray();
  return requestsInfo;
}
let requestsTimer = null;
const refreshRequestsSoon = (ms = 600) => { clearTimeout(requestsTimer); requestsTimer = setTimeout(refreshRequests, ms); };

/** Socket "admin:requests": yeni ({ id, category, type }) ya da sonuçlanan ({ resolved }) talep. */
async function onRequestsEvent(payload = {}) {
  broadcast("requests:changed", payload);
  refreshRequestsSoon(400);
  const id = Number(payload.id);
  if (!id || notifiedRequests.has(id)) return;
  notifiedRequests.add(id);
  if (notifiedRequests.size > 300) notifiedRequests.delete(notifiedRequests.values().next().value);
  if (!Notification.isSupported()) return;
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isFocused() && mainWindow.isVisible()) return;
  const res = await api.request({ path: "/api/admin/requests", query: { status: "all", category: payload.category || undefined, limit: 20 }, cache: false, queue: false });
  const item = res.ok ? (res.data?.items || []).find((r) => Number(r.id) === id) : null;
  const category = (requestsInfo.categories || []).find((c) => c.key === (item?.category || payload.category));
  const n = new Notification({
    title: `Yeni talep${category?.label ? ` · ${category.label}` : ""}`,
    subtitle: item?.actor?.name || undefined,
    body: String(item ? [item.title, item.description].filter(Boolean).join(" — ") : "Talepler'de onay bekleyen yeni bir kayıt var.").slice(0, 180),
    silent: false,
  });
  n.on("click", () => showMain(`requests:${item?.category || payload.category || ""}`));
  n.show();
}

function signOutLocal(reason) {
  chatLink?.disconnect();
  probedAccess = null;
  requestsInfo = { total: 0, categories: [] };
  sessionStore.clear();
  api.clearCache();
  api.clearOutbox();
  app.dock?.setBadge("");
  trayInfo = { upcoming: [], summary: null };
  billsCache = { at: 0, items: [] };
  refreshTray();
  broadcast("auth:changed", { signedIn: false, reason: reason || null });
}

async function login({ username, password }) {
  const result = await api.request({
    method: "POST",
    path: "/api/users/login",
    body: { username: String(username || "").trim(), password, scope: "management", client: "desktop" },
    cache: false,
    queue: false,
  });
  if (!result.ok) {
    return { ok: false, error: result.offline ? "İnternet bağlantısı yok. Giriş için bağlantı gerekir." : result.error?.message || "Giriş yapılamadı." };
  }
  const { token, user } = result.data || {};
  if (!token || !user) return { ok: false, error: "Sunucu oturum bilgisi döndürmedi." };
  if (user.isManagement === false) return { ok: false, error: "Araçlar yönetim hesaplarına açıktır." };
  sessionStore.save({ token, user, loginAt: Date.now() });
  broadcast("auth:changed", { signedIn: true });
  setTimeout(() => { refreshSummary(); reminders.check(); refreshUser().finally(() => { chatLink.connect(); refreshRequests(); }); }, 1500);
  return { ok: true, state: authState() };
}

async function logout() {
  await api.request({ method: "POST", path: "/api/users/logout", cache: false, queue: false }).catch(() => {});
  signOutLocal("logout");
}

/** Jeton ömrünün yarısı geçince yenilenir (90 günlük sınırı aşmadan). */
async function keepSessionFresh() {
  const session = sessionStore.load();
  const status = sessionStatus(session, { days: config.SESSION_DAYS });
  if (status === "expired" && session) return signOutLocal("expired");
  if (status !== "refresh") return;
  const result = await api.request({ method: "POST", path: "/api/users/session/refresh", body: { client: "desktop" }, cache: false, queue: false });
  if (result.ok && result.data?.token) {
    sessionStore.save({ ...session, token: result.data.token, user: result.data.user || session.user });
  }
}

/* ---------------------------- düzenli ödemeler ---------------------------- */

// Hatırlatıcı her dakika çalışır; düzenli ödemeler 30 dakikada bir okunur
// (dönemler gün bazındadır). Tepsi menüsü de buradan beslenir.
const BILLS_TTL = 30 * 60000;
let billsCache = { at: 0, items: [] };
async function loadBills(now = Date.now(), { force = false } = {}) {
  if (!force && now - billsCache.at < BILLS_TTL) return billsCache.items;
  const res = await api.request({ path: "/api/tools/recurring" });
  if (res.ok && res.data) {
    billsCache = { at: now, items: [...(res.data.overdue || []), ...(res.data.occurrences || [])] };
    trayInfo.bills = res.data.summary || null;
  } else if (res.error?.status === 404) {
    billsCache = { at: now, items: [] }; // sunucu henüz güncellenmedi
  }
  return billsCache.items;
}

// Ekipman: benim zimmetlerim ve bakımı gelenler (bildirim için, 20 dk önbellek).
const equipmentFeed = createEquipmentFeed({ request: (opts) => api.request(opts) });

/* ---------------------------- rozet ve tepsi ---------------------------- */

async function refreshSummary() {
  if (!authState().signedIn) return;
  const [summary, overview] = await Promise.all([
    api.request({ path: "/api/todos/summary" }),
    api.request({ path: "/api/tools/overview" }),
  ]);
  if (summary.ok) {
    trayInfo.summary = summary.data;
    updateBadge();
  }
  // Yaklaşan: etkinlikler + önümüzdeki 7 günün proje öğeleri (adım, son tarih, görüşme).
  if (overview.ok) trayInfo.upcoming = [...(overview.data?.upcoming || []), ...(overview.data?.upcoming_projects || [])].sort((a, b) => String(a.occurrence_start).localeCompare(String(b.occurrence_start)));
  refreshTray();
}

/** Dock rozeti: bugün + gecikmiş işler, okunmamış mesajlar (üye mesajları dahil) ve bekleyen talepler. */
function updateBadge() {
  if (!authState().signedIn) { app.dock?.setBadge(""); return; }
  const s = trayInfo.summary;
  const total = (s ? (s.overdue || 0) + (s.today || 0) : 0) + (chatLink?.unread() || 0) + (requestsInfo.total || 0);
  app.dock?.setBadge(total ? String(total) : "");
}

function refreshTray() {
  if (!tray) return;
  const state = focus.snapshot();
  tray.setTitle(trayTitle(state), { fontType: "monospacedDigit" });
  const signedIn = authState().signedIn;
  const s = trayInfo.summary;
  const upcoming = (trayInfo.upcoming || []).slice(0, 4).map((item) => {
    const d = new Date(item.occurrence_start);
    const when = item.all_day ? d.toLocaleDateString("tr-TR", { day: "numeric", month: "short" }) : d.toLocaleString("tr-TR", { weekday: "short", hour: "2-digit", minute: "2-digit" });
    return { label: `${when}  ${item.title}`.slice(0, 60), click: () => showMain("agenda") };
  });
  const focusLabel = state.running ? "Odak sayacını duraklat" : state.mode === "stopwatch" ? "Kronometreyi başlat" : "Odak sayacını başlat";
  const template = [
    { label: config.APP_NAME, enabled: false },
    { label: "Uygulamayı aç", click: () => showMain() },
    { label: "Hızlı kayıt…", accelerator: config.QUICK_SHORTCUT, click: () => showQuick() },
    { type: "separator" },
    // Araç Takımı ve masaüstü widget'ları menünün üstünde (app/toolkit.js trayTopItems).
    ...(deskkit ? deskkit.trayTopItems() : []),
  ];
  if (signedIn) {
    const unread = chatLink?.unread() || 0;
    template.push({ label: unread ? `${unread} okunmamış mesaj` : "Mesajlar", click: () => showMain("messages") });
    if (currentAccess().requests) template.push({ label: requestsInfo.total ? `${requestsInfo.total} bekleyen talep` : "Talepler", click: () => showMain("requests") });
    template.push({ label: s ? `${s.open || 0} açık iş${s.overdue ? ` · ${s.overdue} gecikmiş` : ""}${s.today ? ` · ${s.today} bugün` : ""}` : "Yapılacaklar", click: () => showMain("todos") });
    const bills = trayInfo.bills;
    if (bills?.active_count) {
      template.push({ label: bills.overdue_count ? `${bills.overdue_count} geciken düzenli ödeme` : `Bu ay kalan ödeme: ${Math.round(bills.remaining_expense || 0).toLocaleString("tr-TR")} ₺`, click: () => showMain("ledger:duzenli") });
    }
    template.push({ label: "Yaklaşan", enabled: false }, ...(upcoming.length ? upcoming : [{ label: "Önümüzdeki 7 gün boş", enabled: false }]));
    template.push({ type: "separator" });
  }
  // Dosya Araçları ve raflar (kısayollar her yerden çalışır: ⌃⌥T, ⌃⌥S, ⌃⌥A).
  template.push(
    { label: "Raflar (Ekran görüntüleri, pano)", accelerator: "Control+Alt+T", registerAccelerator: false, click: () => shelf?.showShelf() },
    { label: "Ekranı yakala", accelerator: "Control+Alt+A", registerAccelerator: false, click: () => shelf?.captureScreen() },
    { label: "Dosya Araçları", click: () => showMain("files") },
    { label: "Float rafı", click: () => fileTools?.float.show() },
    { type: "separator" },
  );
  // LED çıkışı açıksa her zaman buradan kapatılabilir (LED ekranı stüdyoyu örtse bile).
  if (studio?.led?.status?.().open) template.push({ label: "LED çıkışını kapat", click: () => studio?.led?.close("MENU") }, { type: "separator" });
  // Masaüstü araç takımı: panel, pencere düzeni, müzik, ekranı uyanık tut (app/toolkit.js).
  if (deskkit) template.push(...deskkit.trayItems());
  template.push(
    { label: focusLabel, click: () => focus.command("toggle") },
    ...(state.running || state.remainingMs !== state.totalMs ? [{ label: "Sayacı sıfırla", click: () => focus.command("reset") }] : []),
    { type: "separator" },
    { label: `${config.APP_NAME}'tan çık`, click: () => { quitting = true; app.quit(); } },
  );
  tray.setContextMenu(Menu.buildFromTemplate(template));
}

function createTray() {
  // Mac: tek renkli şablon simge; Windows: renkli uygulama simgesi (şablon koyu görev çubuğunda görünmez).
  const image = IS_MAC
    ? nativeImage.createFromPath(path.join(ASSETS, "trayTemplate.png"))
    : nativeImage.createFromPath(appIconPath()).resize({ width: 32, height: 32, quality: "best" });
  if (IS_MAC) image.setTemplateImage(true);
  tray = new Tray(image);
  if (!IS_MAC) tray.on("click", () => showMain());
  tray.on("mouse-enter", () => tray.setToolTip(chatLink?.unread() ? `${config.APP_NAME} · ${chatLink.unread()} okunmamış mesaj` : config.APP_NAME));
  tray.setToolTip(config.APP_NAME);
  refreshTray();
}

/* ------------------------------- pencereler ------------------------------- */

const STATE_FILE = () => path.join(dataDir(), "window-state.json");
const readWinState = () => { try { return JSON.parse(fs.readFileSync(STATE_FILE(), "utf8")); } catch { return {}; } };
const writeWinState = (patch) => { try { fs.writeFileSync(STATE_FILE(), JSON.stringify({ ...readWinState(), ...patch })); } catch { /* yoksay */ } };

/** Adres uygulamanın kendi arayüzü mü (paketli: file://, geliştirme: ELITLIG_RENDERER_URL)? */
const isOwnUrl = (url) => {
  const s = String(url || "");
  if (s.startsWith("file:")) return true;
  if (!DEV_URL) return false;
  try { return new URL(s).origin === new URL(DEV_URL).origin; } catch { return false; }
};

const loadRenderer = (win, hash = "") => {
  if (DEV_URL) return win.loadURL(`${DEV_URL}${hash ? `#${hash}` : ""}`);
  return win.loadFile(RENDERER, hash ? { hash } : undefined);
};

const secureWebPreferences = () => ({
  preload: path.join(__dirname, "preload.js"),
  contextIsolation: true,
  sandbox: true,
  nodeIntegration: false,
  spellcheck: true,
});

// Yayın Stüdyosu · gol müziği: gizli YouTube oynatıcısı file:// sayfadan gömülür;
// YouTube yerleştiren kimliği (Referer) olmayan gömmeyi "Hata 153" ile reddeder.
// YALNIZ YouTube gömme sayfası isteklerine (Referer yoksa) site adresi eklenir.
function allowYoutubeEmbeds(ses) {
  ses.webRequest.onBeforeSendHeaders({ urls: ["https://www.youtube.com/embed/*", "https://www.youtube-nocookie.com/embed/*"] }, (details, callback) => {
    const headers = { ...details.requestHeaders };
    if (!headers.Referer && !headers.referer) headers.Referer = `${config.SITE_ORIGIN}/`;
    callback({ requestHeaders: headers });
  });
}

function guardNavigation(win) {
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^(https?|mailto|tel|sms|whatsapp|facetime):/i.test(url)) shell.openExternal(url).catch(() => {});
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    if (url.startsWith("file:") || (DEV_URL && url.startsWith(DEV_URL))) return;
    event.preventDefault();
    if (/^(https?|mailto|tel):/i.test(url)) shell.openExternal(url).catch(() => {});
  });
  win.webContents.on("context-menu", (_event, params) => {
    const items = [];
    if (params.misspelledWord && params.dictionarySuggestions.length) {
      items.push(...params.dictionarySuggestions.slice(0, 4).map((word) => ({ label: word, click: () => win.webContents.replaceMisspelling(word) })), { type: "separator" });
    }
    if (params.isEditable) {
      items.push({ role: "cut", label: "Kes" }, { role: "copy", label: "Kopyala" }, { role: "paste", label: "Yapıştır" }, { type: "separator" }, { role: "selectAll", label: "Tümünü seç" });
    } else if (params.selectionText) {
      items.push({ role: "copy", label: "Kopyala" });
    }
    if (items.length) Menu.buildFromTemplate(items).popup({ window: win });
  });
}

function createMainWindow() {
  const saved = readWinState().bounds || {};
  const win = new BrowserWindow({
    title: config.APP_NAME,
    width: saved.width || 1320,
    height: saved.height || 860,
    x: saved.x,
    y: saved.y,
    minWidth: 980,
    minHeight: 620,
    show: false,
    // hiddenInset Windows'ta çerçevesiz (düğmesiz) pencere açar; vibrancy yalnız Mac'te.
    ...(IS_MAC
      ? { titleBarStyle: "hiddenInset", trafficLightPosition: { x: 18, y: 18 }, vibrancy: "sidebar", visualEffectState: "followWindow", backgroundColor: "#00000000" }
      : { autoHideMenuBar: true, backgroundColor: nativeTheme.shouldUseDarkColors ? "#1e1e1e" : "#ffffff" }),
    icon: appIconPath(),
    // Yayın Stüdyosu bu pencerede: gizli / küçültülmüş / örtülüyken de program tuvali
    // çizilsin ve MediaRecorder parça üretsin (yayın sürerken studio/index.js ayrıca açar).
    // autoplayPolicy: müzik çaların gizli YouTube oynatıcısı tıklamadan sonra eşzamansız (oynatıcı
    // hazır olunca) çalar; Electron varsayılanı da budur, açıkça yazılır (bkz. music/useMusicPlayer).
    webPreferences: { ...secureWebPreferences(), backgroundThrottling: false, autoplayPolicy: "no-user-gesture-required" },
  });
  mainWindow = win;
  guardNavigation(win);
  win.once("ready-to-show", () => {
    if (readWinState().maximized) win.maximize();
    win.show();
  });
  const saveBounds = () => { if (!win.isDestroyed()) writeWinState({ bounds: win.isMaximized() ? readWinState().bounds : win.getBounds(), maximized: win.isMaximized() }); };
  win.on("resized", saveBounds);
  win.on("moved", saveBounds);
  win.on("close", (event) => {
    saveBounds();
    if (!quitting && process.platform === "darwin") {
      event.preventDefault();
      if (win.isFullScreen()) { win.once("leave-full-screen", () => win.hide()); win.setFullScreen(false); } else win.hide();
    }
  });
  win.on("closed", () => { if (mainWindow === win) mainWindow = null; });
  win.on("focus", () => { refreshSummary(); });
  loadRenderer(win);
  return win;
}

function showMain(route) {
  if (!mainWindow) createMainWindow();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  if (route) {
    const send = () => mainWindow.webContents.send("navigate", route);
    if (mainWindow.webContents.isLoading()) mainWindow.webContents.once("did-finish-load", send);
    else send();
  }
}

function createQuickWindow() {
  const win = new BrowserWindow({
    width: 620,
    height: 210,
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
    webPreferences: secureWebPreferences(),
  });
  guardNavigation(win);
  win.on("blur", () => { if (!win.webContents.isDevToolsOpened()) win.hide(); });
  loadRenderer(win, "quick");
  quickWindow = win;
  return win;
}

function showQuick(kind) {
  if (!quickWindow || quickWindow.isDestroyed()) createQuickWindow();
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const { x, y, width } = display.workArea;
  quickWindow.setPosition(Math.round(x + (width - 620) / 2), Math.round(y + 140));
  const reveal = () => {
    quickWindow.show();
    quickWindow.focus();
    quickWindow.webContents.send("quick:open", { kind: kind || null });
  };
  if (quickWindow.webContents.isLoading()) quickWindow.webContents.once("did-finish-load", reveal);
  else reveal();
}

/* --------------------------------- menü --------------------------------- */

const ROUTES = [
  ["today", "Bugün", "CmdOrCtrl+1"],
  ["toolkit", "Araç Takımı", "CmdOrCtrl+Shift+A"],
  ["messages", "Mesajlar", "CmdOrCtrl+Shift+M"],
  ["requests", "Talepler", "CmdOrCtrl+Shift+T"],
  ["todos", "Yapılacaklar", "CmdOrCtrl+2"],
  ["agenda", "Ajanda", "CmdOrCtrl+3"],
  ["notes", "Not Defteri", "CmdOrCtrl+4"],
  ["projects", "Projeler", "CmdOrCtrl+0"],
  ["planning", "Saha ve Maç Planlama", "CmdOrCtrl+Shift+0"],
  ["ledger", "Ön Muhasebe", "CmdOrCtrl+5"],
  ["sheets", "Tablolar", "CmdOrCtrl+6"],
  ["contacts", "Rehber", "CmdOrCtrl+7"],
  ["calc", "Hesap Araçları", "CmdOrCtrl+8"],
  ["focus", "Odak Sayacı", "CmdOrCtrl+9"],
  ["equipment", "Ekipman", "CmdOrCtrl+Shift+E"],
  ["files", "Dosya Araçları", "CmdOrCtrl+Shift+D"],
  ["shelf", "Ekran Görüntüleri ve Pano", "CmdOrCtrl+Shift+P"],
];

const sendCommand = (name) => {
  const win = BrowserWindow.getFocusedWindow() || mainWindow;
  win?.webContents.send("command", name);
};

function buildMenu() {
  const template = [
    {
      label: config.APP_NAME,
      submenu: [
        { role: "about", label: `${config.APP_NAME} Hakkında` },
        { type: "separator" },
        { label: "Oturum Bilgisi…", click: () => showMain("account") },
        { label: "Oturumu Kapat…", click: async () => {
          const { response } = await dialog.showMessageBox(mainWindow, {
            type: "question", buttons: ["Oturumu kapat", "Vazgeç"], defaultId: 1, cancelId: 1,
            message: "Oturumu kapatmak istiyor musunuz?",
            detail: "Bu Mac'teki oturum ve çevrimdışı veriler silinir. Eşitlenmemiş değişiklikler kaybolur.",
          });
          if (response === 0) await logout();
        } },
        { type: "separator" },
        ...(IS_MAC ? [
          { role: "services", label: "Servisler" },
          { type: "separator" },
          { role: "hide", label: `${config.APP_NAME}'ı Gizle` },
          { role: "hideOthers", label: "Diğerlerini Gizle" },
          { role: "unhide", label: "Tümünü Göster" },
          { type: "separator" },
        ] : []),
        { label: `${config.APP_NAME}'tan Çık`, accelerator: IS_MAC ? "Cmd+Q" : "Ctrl+Q", click: () => { quitting = true; app.quit(); } },
      ],
    },
    {
      label: "Dosya",
      submenu: [
        { label: "Yeni", accelerator: "CmdOrCtrl+N", click: () => sendCommand("new") },
        { label: "Yeni Grup (Mesajlar)", accelerator: "Shift+CmdOrCtrl+N", click: () => { showMain("messages"); setTimeout(() => sendCommand("newGroup"), 150); } },
        { label: "Hızlı Kayıt…", accelerator: config.QUICK_SHORTCUT, click: () => showQuick() },
        { type: "separator" },
        { label: "Dışa Aktar…", accelerator: "CmdOrCtrl+E", click: () => sendCommand("export") },
        { label: "Yazdır…", accelerator: "CmdOrCtrl+P", click: () => sendCommand("print") },
        { type: "separator" },
        { role: "close", label: "Pencereyi Kapat" },
      ],
    },
    {
      label: "Düzen",
      submenu: [
        { label: "Geri Al", accelerator: "CmdOrCtrl+Z", click: () => sendCommand("undo") },
        { label: "Yinele", accelerator: "Shift+CmdOrCtrl+Z", click: () => sendCommand("redo") },
        { type: "separator" },
        { role: "cut", label: "Kes" },
        { role: "copy", label: "Kopyala" },
        { role: "paste", label: "Yapıştır" },
        { role: "selectAll", label: "Tümünü Seç" },
        { type: "separator" },
        { label: "Bul…", accelerator: "CmdOrCtrl+F", click: () => sendCommand("find") },
        { label: "Komut Paleti…", accelerator: "CmdOrCtrl+K", click: () => sendCommand("palette") },
      ],
    },
    {
      label: "Görünüm",
      submenu: [
        ...ROUTES.map(([route, label, accelerator]) => ({ label, accelerator, click: () => showMain(route) })),
        { type: "separator" },
        { label: "Yenile", accelerator: "CmdOrCtrl+R", click: () => sendCommand("refresh") },
        { label: "Kenar Çubuğunu Gizle/Göster", accelerator: "CmdOrCtrl+Alt+S", click: () => sendCommand("sidebar") },
        { type: "separator" },
        { role: "resetZoom", label: "Gerçek Boyut", accelerator: "CmdOrCtrl+Shift+0" },
        { role: "zoomIn", label: "Yakınlaştır" },
        { role: "zoomOut", label: "Uzaklaştır" },
        { role: "togglefullscreen", label: "Tam Ekran" },
        ...(app.isPackaged ? [] : [{ role: "toggleDevTools", label: "Geliştirici Araçları" }]),
      ],
    },
    ...(deskkit ? [deskkit.menuTemplate()] : []),
    ...(adminPanel ? [adminPanel.menuTemplate()] : []),
    { label: "Pencere", role: "window", submenu: [
      { role: "minimize", label: "Küçült" },
      ...(IS_MAC ? [{ role: "zoom", label: "Büyüt" }, { type: "separator" }, { role: "front", label: "Tümünü Öne Getir" }] : []),
      { type: "separator" },
      // Kısayol LED açıkken genel kısayol olarak kaydedilir (studio/led.js); burada yalnız gösterilir.
      { label: "LED Çıkışını Kapat", accelerator: "CommandOrControl+Shift+L", registerAccelerator: false, click: () => { studio?.led?.close("MENU"); showMain(); } },
    ] },
    { label: "Yardım", role: "help", submenu: [
      { label: "Klavye Kısayolları", accelerator: "CmdOrCtrl+/", click: () => sendCommand("shortcuts") },
      { label: "elitlig.com'u Aç", click: () => shell.openExternal(config.SITE_ORIGIN) },
    ] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  app.dock?.setMenu(Menu.buildFromTemplate([
    { label: "Hızlı Kayıt…", click: () => showQuick() },
    { type: "separator" },
    ...ROUTES.map(([route, label]) => ({ label, click: () => showMain(route) })),
  ]));
}

/* ---------------------------------- IPC ---------------------------------- */

function registerIpc() {
  ipcMain.handle("auth:state", () => authState());
  ipcMain.handle("auth:login", (_e, creds) => login(creds || {}));
  ipcMain.handle("auth:logout", () => logout());

  ipcMain.handle("api:request", async (_e, opts) => {
    if (!authState().signedIn) return { ok: false, error: { status: 401, message: "Oturum açık değil.", code: "AUTH_REQUIRED" } };
    const result = await api.request(opts || {});
    if (result.ok && opts?.method && opts.method !== "GET") {
      broadcast("data:changed", { path: opts.path });
      const p = String(opts.path || "");
      if (p.startsWith("/api/chat/")) chatLink.refreshSoon(800);
      else if (p.startsWith("/api/admin/chat/")) chatLink.refreshInboxSoon(600, false);
      else {
        if (/^\/api\/tools\/(recurring|ledger)/.test(p)) billsCache.at = 0;
        if (p.startsWith("/api/tools/equipment/")) equipmentFeed.invalidate();
        setTimeout(refreshSummary, 500);
        // Onay / ret uçları talebi kendiliğinden kapatır; özet tazelenir.
        refreshRequestsSoon(700);
      }
    }
    return result;
  });

  /* ------------------------------ Mesajlar ------------------------------ */
  ipcMain.handle("chat:status", () => chatLink.status());
  ipcMain.handle("requests:summary", () => requestsInfo);
  ipcMain.handle("requests:refresh", () => refreshRequests());
  ipcMain.handle("chat:emit", (_e, { name, payload } = {}) => chatLink.emit(name, payload));
  ipcMain.handle("chat:active", (_e, id) => {
    chatLink.setActive(id);
    // Açılan sohbetin bildirimleri Bildirim Merkezi'nden kalkar.
    if (id && chatNotes.has(Number(id))) { chatNotes.get(Number(id)).forEach((n) => { try { n.close(); } catch { /* yoksay */ } }); chatNotes.delete(Number(id)); }
  });
  ipcMain.handle("chat:refresh", () => chatLink.refresh({ detect: false }).then(() => chatLink.status()));
  ipcMain.handle("chat:pending", () => api.outbox()
    .filter((i) => i.method === "POST" && /^\/api\/chat\/conversations\/\d+\/messages$/.test(i.path))
    .map((i) => ({ conversation_id: Number(i.path.split("/")[4]), client_id: i.body?.client_id, body: i.body?.body, reply_to_id: i.body?.reply_to_id || null, mentions: i.body?.mentions || [], at: i.at })));
  ipcMain.handle("chat:upload", async (_e, { kind, name, mime, data } = {}) => {
    if (!authState().signedIn) return { ok: false, error: { message: "Oturum açık değil." } };
    const field = kind === "audio" ? "audio" : "file";
    const bytes = Buffer.from(data || []);
    if (!bytes.length) return { ok: false, error: { message: "Dosya boş." } };
    if (bytes.length > 25 * 1024 * 1024) return { ok: false, error: { message: "Dosya 25 MB'tan büyük olamaz." } };
    return api.upload(`/api/chat/uploads/${field}`, buildMultipart(field, name || (field === "audio" ? "ses.webm" : "dosya"), mime || mimeOf(name), bytes));
  });
  ipcMain.handle("chat:pick", async (event, { images = false } = {}) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      properties: ["openFile", "multiSelections"],
      filters: images ? [{ name: "Fotoğraflar", extensions: ["jpg", "jpeg", "png", "gif", "webp", "heic"] }] : [{ name: "Tüm dosyalar", extensions: ["*"] }],
    });
    if (canceled) return [];
    return filePaths.slice(0, 10).map((file) => {
      const size = fs.statSync(file).size;
      if (size > 25 * 1024 * 1024) return { name: path.basename(file), size, tooLarge: true };
      const buf = fs.readFileSync(file);
      return { name: path.basename(file), mime: mimeOf(file), size, data: new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength) };
    });
  });
  ipcMain.handle("chat:download", async (event, { url, name } = {}) => {
    const media = await fetchMedia(String(url || ""));
    if (!media) return { ok: false, error: { message: "Dosya indirilemedi." } };
    const win = BrowserWindow.fromWebContents(event.sender);
    const { canceled, filePath } = await dialog.showSaveDialog(win, { defaultPath: path.join(app.getPath("downloads"), String(name || "dosya").replace(/[/\\]/g, "_")) });
    if (canceled || !filePath) return { ok: false };
    fs.writeFileSync(filePath, media.body);
    return { ok: true, path: filePath };
  });
  ipcMain.handle("chat:openFile", async (_e, { url, name } = {}) => {
    const media = await fetchMedia(String(url || ""));
    if (!media) return { ok: false };
    const dir = path.join(app.getPath("temp"), "Elitlig Mesajlar");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, String(name || "dosya").replace(/[/\\]/g, "_"));
    fs.writeFileSync(file, media.body);
    const error = await shell.openPath(file);
    return { ok: !error, error: error || null };
  });
  ipcMain.handle("sync:status", () => ({ online: api.isOnline(), pending: api.pending() }));
  ipcMain.handle("sync:flush", () => api.flush());

  ipcMain.handle("focus:command", (_e, name, args) => focus.command(name, args));
  ipcMain.handle("focus:state", () => focus.snapshot());

  ipcMain.handle("file:save", async (event, { name, data, filters }) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const { canceled, filePath } = await dialog.showSaveDialog(win, { defaultPath: path.join(app.getPath("downloads"), name), filters });
    if (canceled || !filePath) return { ok: false };
    fs.writeFileSync(filePath, typeof data === "string" ? data : Buffer.from(data));
    return { ok: true, path: filePath };
  });
  ipcMain.handle("file:open", async (event, { filters }) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const { canceled, filePaths } = await dialog.showOpenDialog(win, { properties: ["openFile"], filters });
    if (canceled || !filePaths[0]) return { ok: false };
    const buf = fs.readFileSync(filePaths[0]);
    return { ok: true, name: path.basename(filePaths[0]), data: new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength) };
  });
  ipcMain.handle("file:reveal", (_e, filePath) => shell.showItemInFolder(filePath));

  // Yazdırma ve PDF: arayüzün hazırladığı HTML gizli pencerede basılır.
  ipcMain.handle("print:html", async (event, { html, title, pdf }) => {
    const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, javascript: false } });
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    try {
      if (pdf) {
        const parent = BrowserWindow.fromWebContents(event.sender);
        const { canceled, filePath } = await dialog.showSaveDialog(parent, { defaultPath: path.join(app.getPath("downloads"), `${title || "Elitlig"}.pdf`), filters: [{ name: "PDF", extensions: ["pdf"] }] });
        if (canceled || !filePath) return { ok: false };
        fs.writeFileSync(filePath, await win.webContents.printToPDF({ printBackground: true, pageSize: pdf.pageSize === "A3" ? "A3" : "A4", landscape: Boolean(pdf.landscape) }));
        return { ok: true, path: filePath };
      }
      return await new Promise((resolve) => win.webContents.print({ printBackground: true }, (ok, reason) => resolve({ ok, reason })));
    } finally {
      win.destroy();
    }
  });

  ipcMain.handle("app:info", () => ({ version: app.getVersion(), shortcut: config.QUICK_SHORTCUT, siteOrigin: config.SITE_ORIGIN, sessionDays: config.SESSION_DAYS }));
  // https://accounts.google.com (YouTube bağlama) ve API sunucusu adresleri dahil tüm https.
  ipcMain.handle("app:openExternal", (_e, url) => {
    if (isAllowedExternal(url)) return shell.openExternal(String(url).trim());
    return null;
  });
  ipcMain.handle("app:openWeb", (_e, pathname) => shell.openExternal(new URL(String(pathname || "/"), config.SITE_ORIGIN).toString()));
  ipcMain.handle("app:notify", (_e, { title, body }) => { if (Notification.isSupported()) new Notification({ title, body }).show(); });
  ipcMain.handle("app:focused", () => Boolean(mainWindow && !mainWindow.isDestroyed() && mainWindow.isFocused()));
  ipcMain.handle("app:showMain", (_e, route) => showMain(route));
  ipcMain.handle("quick:hide", () => quickWindow?.hide());
  ipcMain.handle("quick:show", (_e, kind) => showQuick(kind));
}

/* ------------------------------ sohbet medyası ------------------------------ */

const mediaDir = () => path.join(dataDir(), "media");
const MEDIA_CACHE_MAX = 40 * 1024 * 1024;

/** Sohbet ekini getirir: önce disk önbelleği, sonra ağ (yalnız http/https). */
async function fetchMedia(url) {
  if (!/^https?:\/\//i.test(url)) return null;
  const key = crypto.createHash("sha1").update(url).digest("hex");
  const file = path.join(mediaDir(), key);
  try {
    const meta = JSON.parse(fs.readFileSync(`${file}.json`, "utf8"));
    return { body: fs.readFileSync(file), type: meta.type || "application/octet-stream" };
  } catch { /* önbellekte yok */ }
  try {
    const res = await net.fetch(url, { headers: { "User-Agent": userAgent() } });
    if (!res.ok) return null;
    const body = Buffer.from(await res.arrayBuffer());
    const type = res.headers.get("content-type") || mimeOf(url.split("?")[0]);
    if (body.length <= MEDIA_CACHE_MAX) {
      fs.mkdirSync(mediaDir(), { recursive: true });
      fs.writeFileSync(file, body);
      fs.writeFileSync(`${file}.json`, JSON.stringify({ url, type, at: Date.now() }));
    }
    return { body, type };
  } catch {
    return null;
  }
}

function registerMediaProtocol() {
  protocol.handle(MEDIA_SCHEME, async (request) => {
    const u = new URL(request.url);
    const target = decodeURIComponent(u.pathname.replace(/^\//, ""));
    const media = await fetchMedia(target);
    if (!media) return new Response("", { status: 404 });
    return new Response(media.body, { status: 200, headers: { "Content-Type": media.type, "Content-Length": String(media.body.length), "Cache-Control": "max-age=31536000" } });
  });
}

/** Yeni mesaj bildirimi: pencere odakta değilse, sohbet sessizde değilse. */
function notifyChat({ conversation, message, muted, inbox = false }) {
  if (muted || !Notification.isSupported()) return;
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isFocused() && mainWindow.isVisible()) return;
  const id = Number(conversation?.id || message.conversation_id);
  if (inbox) {
    // Üye mesajı (ortak gelen kutusu): başlık üye / takım, alt başlık türü.
    const kindLabel = { team: "Takım", player: "Oyuncu", member: "Üye" }[conversation?.entity?.kind] || "Üye";
    const kindText2 = { image: "📷 Fotoğraf", audio: "🎤 Sesli mesaj", file: `📎 ${message.meta?.file?.name || "Belge"}`, location: "📍 Konum" }[message.kind];
    const n = new Notification({ title: conversation?.title || message.sender?.name || "Üye mesajı", subtitle: `Üye mesajları · ${kindLabel}`, body: String(kindText2 || message.body || "").slice(0, 180), silent: false });
    n.on("click", () => showMain(`messages:${id}`));
    n.show();
    const list = chatNotes.get(id) || [];
    list.push(n);
    chatNotes.set(id, list.slice(-5));
    return;
  }
  const isGroup = ["group", "team"].includes(conversation?.type);
  const kindText = { image: "📷 Fotoğraf", audio: "🎤 Sesli mesaj", file: `📎 ${message.meta?.file?.name || "Belge"}`, poll: `📊 ${message.meta?.poll?.question || "Anket"}`, location: "📍 Konum" }[message.kind];
  const text = message.kind === "image" && message.meta?.caption ? `📷 ${message.meta.caption}` : kindText || message.body || "";
  const n = new Notification({
    title: isGroup ? conversation.title : message.sender?.name || conversation?.title || "Yeni mesaj",
    subtitle: isGroup ? message.sender?.name : undefined,
    body: String(text).slice(0, 180),
    silent: false,
  });
  n.on("click", () => showMain(`messages:${id}`));
  n.show();
  const list = chatNotes.get(id) || [];
  list.push(n);
  chatNotes.set(id, list.slice(-5));
}

/* ----------------------------- yaşam döngüsü ----------------------------- */

function notify({ title, body, route }) {
  if (!Notification.isSupported()) return;
  const n = new Notification({ title, body, silent: false });
  n.on("click", () => showMain(route));
  n.show();
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => showMain());

  app.whenReady().then(() => {
    sessionStore = createSessionStore({ dir: dataDir(), safeStorage });
    applyTestSession(sessionStore, app);
    api = createApi({
      origin: config.API_ORIGIN,
      dataDir: dataDir(),
      fetchImpl: (url, init) => net.fetch(url, init),
      sessionStore,
      userAgent: userAgent(),
      timeoutMs: config.REQUEST_TIMEOUT_MS,
      onUnauthorized: () => signOutLocal("expired"),
    });
    chatLink = createChatLink({
      origin: config.API_ORIGIN,
      getToken: () => sessionStore.load()?.token || null,
      ioFactory: (url, opts) => socketIo(url, opts),
      api,
      userAgent: userAgent(),
      isSignedIn: () => authState().signedIn,
      inboxEnabled: () => currentAccess().inbox,
    });
    chatLink.events.on("event", (e) => broadcast("chat:event", e));
    chatLink.events.on("status", (st) => broadcast("chat:status", st));
    chatLink.events.on("unread", (n) => { broadcast("chat:unread", n); updateBadge(); refreshTray(); });
    chatLink.events.on("incoming", notifyChat);
    chatLink.events.on("requests", onRequestsEvent);
    // Socket bağlanınca (ve yeniden bağlanınca) talep özeti tazelenir.
    chatLink.events.on("status", (st) => { if (st.state === "connected") refreshRequestsSoon(300); });
    registerMediaProtocol();
    allowYoutubeEmbeds(electronSession.defaultSession);
    studio = registerStudio({
      ipcMain, api, broadcast, app, electronSession, systemPreferences, desktopCapturer, powerSaveBlocker, protocol, shell,
      isOwnUrl,
      isSignedIn: () => authState().signedIn,
      dialog, screen, BrowserWindow, loadRenderer, powerMonitor, globalShortcut,
      preloadPath: path.join(__dirname, "preload.js"),
      siteOrigin: config.SITE_ORIGIN,
      apiOrigin: config.API_ORIGIN,
      log: (...args) => { if (!app.isPackaged || process.env.ELITLIG_STUDIO_DEBUG) console.log(...args); },
    });
    // Dosya Araçları + Ekran Görüntüleri rafı: ortak elitlig-file:// şeması.
    const fileProtocol = createFileProtocol();
    const localDeps = {
      ipcMain, app, BrowserWindow, dialog, shell, clipboard, nativeImage, screen, electronSession, globalShortcut, desktopCapturer, systemPreferences, net,
      fileProtocol, preloadPath: path.join(__dirname, "preload.js"), loadRenderer, broadcast, isOwnUrl, guardWindow: guardNavigation, showMain,
      appRoot: path.join(__dirname, ".."), userAgent: userAgent(),
      log: (...args) => { if (!app.isPackaged) console.log(...args); },
    };
    fileTools = registerFileTools(localDeps);
    shelf = registerShelf(localDeps);
    fileProtocol.register(protocol);
    // LED açılıp kapanınca menü çubuğu simgesindeki "LED çıkışını kapat" güncellenir.
    studio.led?.events.on("status", () => refreshTray());
    focus = createFocus({ dataDir: dataDir() });
    reminders = createReminders({
      dataDir: dataDir(),
      notify,
      load: async () => {
        if (!authState().signedIn) return { events: [], todos: [] };
        const now = Date.now();
        const [events, todos, bills, equipment] = await Promise.all([
          api.request({ path: "/api/tools/events", query: { from: new Date(now - 86400000).toISOString(), to: new Date(now + 2 * 86400000).toISOString(), todos: "0", projects: "0" } }),
          api.request({ path: "/api/todos", query: { view: "mine", status: "active" } }),
          loadBills(now),
          equipmentFeed.load(now).catch(() => null),
        ]);
        return { events: events.ok ? events.data?.items || [] : [], todos: todos.ok ? todos.data?.items || [] : [], bills, equipment };
      },
    });

    api.events.on("online", (online) => {
      broadcast("sync:status", { online, pending: api.pending() });
      if (online) { api.flush(); chatLink?.kick(); }
    });
    api.events.on("outbox", (pending) => broadcast("sync:status", { online: api.isOnline(), pending }));
    api.events.on("synced", (result) => {
      broadcast("sync:done", result);
      if (result.failed.length) notify({ title: "Bazı değişiklikler eşitlenemedi", body: result.failed.map((f) => f.error).slice(0, 2).join(" · "), route: null });
    });

    focus.events.on("state", (state) => { broadcast("focus:state", state); if (tray) tray.setTitle(trayTitle(state), { fontType: "monospacedDigit" }); });
    focus.events.on("finished", ({ phase, next, label }) => {
      const title = phase === "focus" ? "Odak turu bitti" : phase === "timer" ? "Süre doldu" : "Mola bitti";
      const body = phase === "focus" ? `${label ? `${label} · ` : ""}${next === "long" ? "Uzun" : "Kısa"} molanın zamanı.` : phase === "timer" ? "Geri sayım tamamlandı." : "Yeni odak turuna hazır mısınız?";
      notify({ title, body, route: "focus" });
      shell.beep();
      refreshTray();
    });

    deskkit = registerDeskkit({
      app, ipcMain, BrowserWindow, globalShortcut, screen, systemPreferences, shell, powerSaveBlocker, net,
      loadRenderer, webPreferences: secureWebPreferences, guardNavigation, showMain, showQuick, broadcast,
      getMainWindow: () => mainWindow, refreshTray: () => refreshTray(), rebuildMenu: () => buildMenu(), isMac: IS_MAC,
      log: (...args) => { if (!app.isPackaged) console.log(...args); },
    });
    adminPanel = registerAdminPanel({
      app, ipcMain, BrowserWindow, WebContentsView, electronSession, shell, dialog, Menu, net, clipboard,
      sessionStore, siteOrigin: config.SITE_ORIGIN, apiOrigin: config.API_ORIGIN,
      getMainWindow: () => mainWindow, showMain, broadcast, logout, secureWebPreferences, rebuildMenu: () => buildMenu(),
      verifySession: async () => (await api.request({ path: "/api/users/verify", cache: false, queue: false })).ok,
      log: (...args) => { if (!app.isPackaged) console.log(...args); },
    });
    widgets = registerWidgets({
      app, ipcMain, BrowserWindow, Menu, screen, net, nativeTheme,
      loadRenderer, webPreferences: secureWebPreferences, guardNavigation, showMain, broadcast, deskkit, isMac: IS_MAC,
      publicOrigin: process.env.ELITLIG_PUBLIC_API_ORIGIN || config.API_ORIGIN,
      refreshTray: () => refreshTray(), rebuildMenu: () => buildMenu(),
      log: (...args) => { if (!app.isPackaged) console.log(...args); },
    });
    deskkit.attachWidgets(widgets);
    registerIpc();
    buildMenu();
    createTray();
    createMainWindow();
    createQuickWindow();
    globalShortcut.register(config.QUICK_SHORTCUT, () => showQuick());
    widgets.restore();

    setInterval(() => focus.tick(), 1000);
    setInterval(() => reminders.check(), 60000);
    setInterval(() => { keepSessionFresh(); refreshSummary(); refreshRequests(); if (api.pending()) api.flush(); }, 5 * 60000);
    // Socket yokken talep özeti dakikada bir yoklanır.
    setInterval(() => { if (authState().signedIn && chatLink.status().state !== "connected") refreshRequests(); }, 60000);
    setInterval(() => refreshUser().catch(() => {}), 6 * 3600000);
    setTimeout(() => { keepSessionFresh(); refreshSummary(); reminders.check(); api.flush(); refreshRequests(); }, 2000);
    if (authState().signedIn) refreshUser().catch(() => {}).finally(() => chatLink.connect());

    powerMonitor.on("resume", () => { setTimeout(() => { keepSessionFresh(); api.flush(); reminders.check(); refreshSummary(); refreshRequests(); chatLink.kick(); }, 3000); });
    nativeTheme.on("updated", () => broadcast("theme", nativeTheme.shouldUseDarkColors ? "dark" : "light"));

    app.setAboutPanelOptions({
      applicationName: config.APP_NAME,
      applicationVersion: app.getVersion(),
      copyright: "© Elitlig",
      credits: "Mesajlar · Talepler · Yapılacaklar · Ajanda · Not Defteri · Projeler · Ön Muhasebe · Tablolar · Rehber · Hesap Araçları · Odak Sayacı",
    });

    app.on("activate", () => showMain());
  });

  app.on("before-quit", () => { quitting = true; });
  app.on("will-quit", () => { globalShortcut.unregisterAll(); studio?.dispose(); fileTools?.dispose(); shelf?.dispose(); adminPanel?.dispose(); });
  app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
  app.on("web-contents-created", (_e, contents) => contents.on("will-attach-webview", (event) => event.preventDefault()));
}
