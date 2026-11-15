// Ekran Görüntüleri ve Pano — ana süreç kaydı.
//
//   Toplama   ekran görüntüsü klasörü (Mac: `defaults read com.apple.screencapture
//             location`, yoksa Masaüstü; Windows: Resimler\Ekran Görüntüleri), en çok
//             3 ek klasör, pano (görsel / metin / bağlantı ayrı ayrı; varsayılan:
//             metin ve bağlantı açık, görsel kapalı — gizli / parola içerikleri her
//             zaman atlanır; ilk açılışta kütüphanede seçim kartı gösterilir),
//             uygulama içi ekran yakalama (⌃⌥A).
//   Raflar    alt kenarda açılan pencere (#shelf): Görseller, Metinler, Bağlantılar.
//             ⌃⌥T göster/gizle, ⌃⌥S arama odaklı. Kısayollar Ayarlar'dan değişir.
//   Kütüphane ana penceredeki "Ekran Görüntüleri" görünümü (renderer/src/views/shelf).
//   Depo      userData/shelf (store.js). Hiçbir şey sunucuya gitmez; bağlantı
//             zenginleştirme (başlık / küçük resim) isteğe bağlıdır ve kapalı başlar.
//
// Başka modüller için: showShelf({ search }) ve "shelf:show" IPC kanalı
// (ör. masaüstü araç takımı paneli rafı buradan açar).
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { createShelfStore } = require("./store");
const { screenshotDir, watchFolders, listRecent, watchClipboard } = require("./watchers");
const rules = require("./rules");
const { createClipboardIo } = require("../clipboardIo");
const { serveFile } = require("../fileTools/protocol");

const DEFAULT_SHORTCUTS = Object.freeze({ toggle: "Control+Alt+T", search: "Control+Alt+S", capture: "Control+Alt+A" });
const PANEL_H = 400;

// Ayar sürümü 2: pano metinleri varsayılan açık. Sürüm 1'de metin toplama kapalı
// başlıyordu ve (Electron 44 pano API değişikliği yüzünden) pano izleme hiç
// çalışmadığı için kimse bu ayara dayanmadı; sürüm 1 ayar dosyalarında metin açılır.
const SETTINGS_VERSION = 2;
const DEFAULT_SETTINGS = Object.freeze({
  version: SETTINGS_VERSION,
  onboarded: false,
  sources: { screenshots: true, image: false, text: true, link: true },
  extraDirs: [],
  retention: { image: 30, text: 30, link: 30 },
  shortcuts: { ...DEFAULT_SHORTCUTS },
  enrichLinks: false,
  editAfterCapture: true,
  since: null,
});

/** Ayar yaması doğrulaması (saf). */
function mergeSettings(current, patch = {}) {
  const next = JSON.parse(JSON.stringify(current));
  if (patch.sources && typeof patch.sources === "object") for (const k of ["screenshots", "image", "text", "link"]) if (typeof patch.sources[k] === "boolean") next.sources[k] = patch.sources[k];
  if (patch.retention && typeof patch.retention === "object") for (const k of ["image", "text", "link"]) if (patch.retention[k] != null) next.retention[k] = rules.clampRetention(patch.retention[k]);
  if (Array.isArray(patch.extraDirs)) next.extraDirs = [...new Set(patch.extraDirs.map(String).filter((p) => path.isAbsolute(p)))].slice(0, 3);
  if (patch.shortcuts && typeof patch.shortcuts === "object") for (const k of Object.keys(DEFAULT_SHORTCUTS)) if (typeof patch.shortcuts[k] === "string") next.shortcuts[k] = patch.shortcuts[k].trim().slice(0, 60);
  if (typeof patch.enrichLinks === "boolean") next.enrichLinks = patch.enrichLinks;
  if (typeof patch.editAfterCapture === "boolean") next.editAfterCapture = patch.editAfterCapture;
  if (typeof patch.onboarded === "boolean") next.onboarded = patch.onboarded;
  return next;
}

/** Diskteki ayar dosyasını güncel sürüme taşır (saf). */
function migrateSettings(raw) {
  if (!raw || typeof raw !== "object") return {};
  const out = { ...raw };
  if (!(Number(raw.version) >= 2)) out.sources = { ...(raw.sources || {}), text: true };
  out.version = SETTINGS_VERSION;
  return out;
}

/** Arayüze giden öğe: dosya adları yerine elitlig-file adresleri. */
function publicItem(item, { exists = fs.existsSync } = {}) {
  if (!item) return null;
  const v = item.updatedAt || item.createdAt;
  const base = `elitlig-file://shelf/${item.id}`;
  const { file, edited, thumb, linkImage, hash, ...rest } = item;
  return {
    ...rest,
    edited: Boolean(edited),
    imageUrl: item.kind === "image" ? `${base}/image?v=${v}` : null,
    originalUrl: item.kind === "image" && edited ? `${base}/original?v=${v}` : null,
    thumbUrl: item.kind === "image" ? (thumb ? `${base}/thumb?v=${v}` : `${base}/image?v=${v}`) : null,
    linkImageUrl: linkImage ? `${base}/link?v=${v}` : null,
    origExists: item.origPath ? exists(item.origPath) : false,
  };
}

function registerShelf(deps) {
  const {
    ipcMain, app, BrowserWindow, dialog, shell, clipboard, nativeImage, screen, globalShortcut, desktopCapturer, systemPreferences, net,
    fileProtocol, preloadPath, loadRenderer, broadcast, isOwnUrl, guardWindow, showMain, userAgent = "ElitligAraclar", log = () => {},
  } = deps;
  const IS_MAC = process.platform === "darwin";
  // Electron 44: pano API'si eşzamansız (app/clipboardIo.js).
  const clipIo = createClipboardIo({ clipboard, ClipboardItem: deps.ClipboardItem || require("electron").ClipboardItem, nativeImage });
  const dir = path.join(app.getPath("userData"), "shelf");
  fs.mkdirSync(dir, { recursive: true });

  const makeThumb = (src, dest) => {
    const img = nativeImage.createFromPath(src);
    if (img.isEmpty()) return null;
    const size = img.getSize();
    const scaled = size.width > 520 ? img.resize({ width: 520, quality: "good" }) : img;
    fs.writeFileSync(dest, scaled.toJPEG(82));
    return size;
  };
  const store = createShelfStore({ dir, makeThumb });
  store.events.on("changed", (e) => broadcast("shelf:changed", e));

  /* -------------------------------- ayarlar -------------------------------- */

  const settingsFile = path.join(dir, "settings.json");
  let settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  try {
    const raw = migrateSettings(JSON.parse(fs.readFileSync(settingsFile, "utf8")));
    settings = mergeSettings(settings, raw);
    settings.since = raw.since || null;
  } catch { /* ilk açılış */ }
  if (!settings.since) settings.since = Date.now();
  const saveSettings = () => { try { fs.writeFileSync(settingsFile, JSON.stringify(settings)); } catch { /* yoksay */ } };
  saveSettings();

  /* ------------------------------- toplama ------------------------------- */

  let shotDir = null;
  let folderWatch = null;
  const ingestFile = (file, source) => {
    try {
      const ext = path.extname(file).slice(1).toLowerCase();
      const { item, duplicate } = store.addImage({ from: file, ext, source, origPath: file, name: path.basename(file) });
      if (!duplicate) log("shelf: yeni görsel", path.basename(file));
      return item;
    } catch (e) { log("shelf: eklenemedi", e?.message); return null; }
  };
  async function restartFolders() {
    folderWatch?.stop();
    folderWatch = null;
    shotDir = await screenshotDir({ picturesDir: app.getPath("pictures"), desktopDir: app.getPath("desktop") });
    const dirs = [];
    if (settings.sources.screenshots && shotDir?.path) dirs.push({ path: shotDir.path, screenshotsOnly: !shotDir.custom, source: "screenshot" });
    for (const d of settings.extraDirs) dirs.push({ path: d, screenshotsOnly: false, source: "folder" });
    if (dirs.length) folderWatch = watchFolders({ dirs, since: settings.since, onFile: (file, spec) => ingestFile(file, spec.source) });
  }

  const clip = watchClipboard({
    io: clipIo,
    sources: () => ({ image: settings.sources.image, text: settings.sources.text, link: settings.sources.link }),
    onCapture: ({ kind, text, png }) => {
      try {
        if (kind === "image") store.addImage({ buffer: png, ext: "png", source: "clipboard" });
        else {
          const { item, duplicate } = store.addText(text, { source: "clipboard", kind });
          if (kind === "link" && !duplicate && settings.enrichLinks) enrich(item.id).catch(() => {});
        }
      } catch (e) { log("shelf: pano", e?.message); }
    },
  });
  const restartClipboard = () => { if (settings.sources.image || settings.sources.text || settings.sources.link) clip.start(); else clip.stop(); };

  /* ------------------------- bağlantı zenginleştirme ------------------------- */

  async function fetchText(url, max = 600 * 1024) {
    const res = await net.fetch(url, { headers: { "User-Agent": userAgent, Accept: "text/html,application/json" }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.subarray(0, max).toString("utf8");
  }
  const decodeEntities = (s) => String(s || "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Number(n))).trim();
  const meta = (html, prop) => html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']+)["']`, "i"))?.[1]
    || html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${prop}["']`, "i"))?.[1] || null;
  async function enrich(id) {
    const item = store.get(id);
    if (!item || item.kind !== "link") return;
    let title = null;
    let site = null;
    let image = null;
    const host = rules.domainOf(item.url);
    if (/(^|\.)youtube\.com$|(^|\.)youtu\.be$/.test(host)) {
      const json = await fetchText(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(item.url)}`).catch(() => null);
      try { const o = JSON.parse(json); title = o.title; site = o.author_name ? `YouTube · ${o.author_name}` : "YouTube"; image = o.thumbnail_url; } catch { /* yoksay */ }
    } else {
      const html = await fetchText(item.url).catch(() => null);
      if (html) {
        title = decodeEntities(meta(html, "og:title") || html.match(/<title[^>]*>([^<]{1,300})<\/title>/i)?.[1] || "");
        site = decodeEntities(meta(html, "og:site_name") || "");
        image = meta(html, "og:image");
        if (image) try { image = new URL(decodeEntities(image), item.url).toString(); } catch { image = null; }
      }
    }
    let linkImage = null;
    if (image && /^https:\/\//i.test(image)) {
      try {
        const res = await net.fetch(image, { headers: { "User-Agent": userAgent }, signal: AbortSignal.timeout(8000) });
        const buf = Buffer.from(await res.arrayBuffer());
        if (res.ok && buf.length < 4 * 1024 * 1024) {
          const img = nativeImage.createFromBuffer(buf);
          if (!img.isEmpty()) {
            linkImage = `${item.id}-link.jpg`;
            fs.writeFileSync(path.join(store.dirs.thumbsDir, linkImage), (img.getSize().width > 480 ? img.resize({ width: 480 }) : img).toJPEG(80));
          }
        }
      } catch { linkImage = null; }
    }
    store.update(id, { link: { linkTitle: title ? title.slice(0, 300) : null, linkSite: site || null, linkImage } });
  }

  /* --------------------------------- raflar --------------------------------- */

  let panel = null;
  let wasActive = false;
  let holdOpenUntil = 0;
  let holdOpen = false;

  function createPanel() {
    panel = new BrowserWindow({
      width: 900, height: PANEL_H, show: false, frame: false, transparent: true, resizable: false, movable: false, minimizable: false, maximizable: false,
      fullscreenable: false, alwaysOnTop: true, skipTaskbar: true, hasShadow: true, roundedCorners: true, title: "Raflar",
      ...(IS_MAC ? { type: "panel", vibrancy: "hud", visualEffectState: "active" } : {}),
      webPreferences: { preload: preloadPath, contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: true },
    });
    panel.setAlwaysOnTop(true, "pop-up-menu");
    if (IS_MAC) panel.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    guardWindow?.(panel);
    panel.on("blur", () => {
      if (holdOpen || Date.now() < holdOpenUntil || panel.webContents.isDevToolsOpened()) return;
      hideShelf({ returnFocus: false });
    });
    panel.on("closed", () => { panel = null; });
    loadRenderer(panel, "shelf");
    return panel;
  }

  function placePanel() {
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const a = display.workArea;
    const margin = 10;
    const width = Math.min(a.width - margin * 2, 1600);
    panel.setBounds({ x: Math.round(a.x + (a.width - width) / 2), y: Math.round(a.y + a.height - PANEL_H - margin), width, height: PANEL_H });
  }

  function showShelf({ search = false, shelf = null } = {}) {
    if (!panel || panel.isDestroyed()) createPanel();
    const focused = BrowserWindow.getFocusedWindow();
    if (!panel.isVisible()) wasActive = Boolean(focused && focused !== panel);
    placePanel();
    const reveal = () => {
      panel.show();
      panel.focus();
      panel.webContents.send("shelf:open", { search: Boolean(search), shelf });
    };
    if (panel.webContents.isLoading()) panel.webContents.once("did-finish-load", reveal);
    else reveal();
    return true;
  }
  function hideShelf({ returnFocus = true } = {}) {
    if (!panel || panel.isDestroyed() || !panel.isVisible()) return;
    panel.hide();
    // Raflar başka bir uygulamanın üstünde açıldıysa odak o uygulamaya döner.
    if (IS_MAC && returnFocus && !wasActive) app.hide();
  }
  function toggleShelf(opts = {}) {
    if (panel && !panel.isDestroyed() && panel.isVisible() && panel.isFocused() && !opts.search) hideShelf();
    else showShelf(opts);
  }

  /* ----------------------------- ekran yakalama ----------------------------- */

  async function captureScreen() {
    if (IS_MAC && systemPreferences?.getMediaAccessStatus?.("screen") === "denied") {
      return { ok: false, error: { code: "SCREEN_PERMISSION", message: "Ekran kaydı izni yok: Sistem Ayarları → Gizlilik ve Güvenlik → Ekran ve Sistem Sesi Kaydı'ndan Elitlig Araçlar'a izin verin." } };
    }
    const wasShown = panel && !panel.isDestroyed() && panel.isVisible();
    if (wasShown) panel.hide();
    await new Promise((r) => setTimeout(r, wasShown ? 220 : 60));
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const scale = display.scaleFactor || 1;
    const size = { width: Math.round(display.size.width * scale), height: Math.round(display.size.height * scale) };
    let sources = [];
    try { sources = await desktopCapturer.getSources({ types: ["screen"], thumbnailSize: size }); } catch (e) { return { ok: false, error: { message: `Ekran yakalanamadı: ${e?.message || e}` } }; }
    const source = sources.find((s) => String(s.display_id) === String(display.id)) || sources[screen.getAllDisplays().findIndex((d) => d.id === display.id)] || sources[0];
    const image = source?.thumbnail;
    if (!image || image.isEmpty()) return { ok: false, error: { code: "SCREEN_PERMISSION", message: IS_MAC ? "Ekran görüntüsü alınamadı. Sistem Ayarları'ndan ekran kaydı izni verin, ardından uygulamayı yeniden açın." : "Ekran görüntüsü alınamadı." } };
    const { item } = store.addImage({ buffer: image.toPNG(), ext: "png", source: "capture", name: `Ekran yakalama ${new Date().toLocaleString("tr-TR")}.png` });
    if (settings.editAfterCapture) showMain?.(`shelf:crop-${item.id}`);
    else if (wasShown) showShelf();
    return { ok: true, item: publicItem(item) };
  }

  /* ------------------------------ kopyalama ------------------------------ */

  const imagePath = (item) => store.filePath(item, "image");
  async function copyItems(ids) {
    const items = (ids || []).map((id) => store.get(id)).filter((i) => i && !i.trashedAt);
    if (!items.length) return { ok: false, error: { message: "Kopyalanacak öğe yok." } };
    const images = items.filter((i) => i.kind === "image");
    const texts = items.filter((i) => i.kind !== "image");
    clip.markOwnWrite();
    let note = null;
    const joined = texts.map((i) => (i.kind === "link" ? i.url : i.text)).join("\n");
    if (images.length > 1 && !texts.length && IS_MAC) {
      // Birden çok görsel: Finder dosya listesi (hedef uygulama destekliyorsa hepsi yapıştırılır).
      const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const plist = `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><array>${images.map((i) => `<string>${esc(imagePath(i))}</string>`).join("")}</array></plist>`;
      await clipIo.writeRaw({ NSFilenamesPboardType: plist });
    } else if (images.length) {
      const img = nativeImage.createFromPath(imagePath(images[0]));
      if (img.isEmpty()) return { ok: false, error: { message: "Görsel okunamadı." } };
      await clipIo.writeImage(img.toPNG(), { text: texts.length ? joined : null });
      if (images.length > 1) note = "Birden çok görselden yalnız ilki kopyalandı.";
    } else if (texts.length === 1 && texts[0].kind === "link") {
      await clipIo.writeLink(texts[0].url, texts[0].linkTitle || texts[0].title || texts[0].url);
    } else {
      await clipIo.writeText(joined);
    }
    clip.markOwnWrite();
    store.markCopied(items.map((i) => i.id));
    return { ok: true, count: items.length, note };
  }

  /* --------------------------- dışa aktarma / sürükleme --------------------------- */

  const { uniquePath, sanitizeName } = require("../fileTools/paths");
  const itemBaseName = (item) => sanitizeName(item.title || (item.name ? item.name.replace(/\.[^.]+$/, "") : "") || (item.kind === "link" ? item.linkTitle || item.domain : "") || (item.kind === "text" ? String(item.text || "").trim().split(/\r?\n/)[0].slice(0, 60) : "") || `${{ image: "Görsel", text: "Metin", link: "Bağlantı" }[item.kind]} ${new Date(item.createdAt).toISOString().slice(0, 16).replace(/[T:]/g, "-")}`);
  /** Öğeyi verilen klasöre dosya olarak yazar (görsel / .txt / .webloc | .url). */
  function writeItemFile(item, outDir) {
    if (item.kind === "image") {
      const src = imagePath(item);
      const ext = item.edited ? "png" : path.extname(src).slice(1) || "png";
      const target = uniquePath(outDir, itemBaseName(item), ext);
      fs.copyFileSync(src, target, fs.constants.COPYFILE_EXCL);
      return target;
    }
    if (item.kind === "link") {
      const target = uniquePath(outDir, itemBaseName(item), IS_MAC ? "webloc" : "url");
      const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
      fs.writeFileSync(target, IS_MAC ? `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>URL</key><string>${esc(item.url)}</string></dict></plist>\n` : `[InternetShortcut]\r\nURL=${item.url}\r\n`, { flag: "wx" });
      return target;
    }
    const target = uniquePath(outDir, itemBaseName(item), "txt");
    fs.writeFileSync(target, item.text || "", { flag: "wx" });
    return target;
  }
  const dragDir = path.join(app.getPath("temp"), "Elitlig Raf");

  /* ----------------------------------- IPC ----------------------------------- */

  const ownSender = (event) => {
    const url = event?.senderFrame?.url || event?.sender?.getURL?.() || "";
    return !isOwnUrl || isOwnUrl(url);
  };
  const handle = (channel, fn) => ipcMain.handle(channel, async (event, ...args) => {
    if (!ownSender(event)) return { ok: false, error: { message: "İzin yok." } };
    try { return await fn(event, ...args); } catch (e) { return { ok: false, error: { message: String(e?.message || e || "İşlem yapılamadı.") } }; }
  });

  const shortcutState = {};
  function registerShortcuts() {
    for (const [key, accel] of Object.entries(shortcutState)) if (accel?.registered) { try { globalShortcut.unregister(accel.accelerator); } catch { /* yoksay */ } }
    const actions = { toggle: () => toggleShelf(), search: () => showShelf({ search: true }), capture: () => captureScreen().then((r) => { if (!r.ok) broadcast("shelf:notice", r.error); }) };
    for (const [key, run] of Object.entries(actions)) {
      const accelerator = settings.shortcuts[key];
      let registered = false;
      if (accelerator) { try { registered = globalShortcut.register(accelerator, run); } catch { registered = false; } }
      shortcutState[key] = { accelerator: accelerator || "", registered, conflict: Boolean(accelerator) && !registered };
    }
  }

  const status = () => ({
    screenshotDir: shotDir?.path || null,
    watching: Boolean(folderWatch),
    clipboard: clip.running(),
    shortcuts: shortcutState,
    canUndo: store.canUndo(),
    platform: process.platform,
    screenAccess: IS_MAC ? systemPreferences?.getMediaAccessStatus?.("screen") || "unknown" : "granted",
    ocr: false,
  });

  handle("shelf:list", (_e, filter = {}, page = {}) => {
    const res = store.list(filter || {}, page || {});
    return { ok: true, items: res.items.map((i) => publicItem(i)), total: res.total, counts: store.counts(), folders: store.folders(), canUndo: store.canUndo() };
  });
  handle("shelf:get", (_e, id) => ({ ok: true, item: publicItem(store.get(id)) }));
  handle("shelf:update", (_e, id, patch) => ({ ok: true, item: publicItem(store.update(id, patch || {})) }));
  handle("shelf:updateMany", (_e, ids, patch) => ({ ok: true, count: store.updateMany(ids, patch || {}).length }));
  handle("shelf:takeDown", (_e, ids) => ({ ok: true, count: store.takeDown(ids), canUndo: store.canUndo() }));
  handle("shelf:undo", () => ({ ok: true, ids: store.undoTakeDown(), canUndo: store.canUndo() }));
  handle("shelf:trash", (_e, ids) => ({ ok: true, count: store.trash(ids) }));
  handle("shelf:restore", (_e, ids) => ({ ok: true, count: store.restore(ids) }));
  handle("shelf:purge", (_e, ids) => ({ ok: true, count: store.purge(ids) }));
  handle("shelf:emptyTrash", () => ({ ok: true, count: store.emptyTrash() }));
  handle("shelf:copy", async (_e, ids, opts = {}) => {
    const res = await copyItems(ids);
    if (res.ok && opts?.close) hideShelf({ returnFocus: true });
    return res;
  });
  handle("shelf:addNote", (_e, { text, title } = {}) => ({ ok: true, item: publicItem(store.addText(String(text || ""), { source: "note", title }).item) }));
  handle("shelf:importFiles", (_e, paths) => {
    const items = (Array.isArray(paths) ? paths : []).slice(0, 100).map(String).filter((p) => path.isAbsolute(p) && rules.IMAGE_EXT.test(p)).map((p) => ingestFile(p, "import")).filter(Boolean);
    return { ok: true, count: items.length };
  });
  handle("shelf:importImage", (_e, bytes) => {
    const { item } = store.addImage({ buffer: Buffer.from(bytes || []), ext: "png", source: "import" });
    return { ok: true, item: publicItem(item) };
  });
  handle("shelf:saveEdit", (_e, id, bytes) => ({ ok: true, item: publicItem(store.saveEdit(id, bytes)) }));
  handle("shelf:revertEdit", (_e, id) => ({ ok: true, item: publicItem(store.revertEdit(id)) }));
  handle("shelf:export", async (event, ids) => {
    const items = (ids || []).map((id) => store.get(id)).filter(Boolean);
    if (!items.length) return { ok: false, error: { message: "Dışa aktarılacak öğe yok." } };
    const parent = BrowserWindow.fromWebContents(event.sender) || undefined;
    holdOpen = true;
    const res = await dialog.showOpenDialog(parent, { title: "Dışa aktar", buttonLabel: "Buraya aktar", defaultPath: app.getPath("downloads"), properties: ["openDirectory", "createDirectory"] }).finally(() => { holdOpen = false; });
    if (res.canceled || !res.filePaths[0]) return { ok: false, canceled: true };
    const written = items.map((i) => writeItemFile(i, res.filePaths[0]));
    if (written[0]) shell.showItemInFolder(written[0]);
    return { ok: true, count: written.length };
  });
  ipcMain.on("shelf:drag", (event, ids) => {
    if (!ownSender(event)) return;
    const items = (Array.isArray(ids) ? ids : []).map((id) => store.get(id)).filter(Boolean);
    if (!items.length) return;
    try {
      fs.mkdirSync(dragDir, { recursive: true });
      const files = items.map((i) => (i.kind === "image" ? imagePath(i) : writeItemFile(i, dragDir)));
      const first = items.find((i) => i.kind === "image");
      let icon = first ? nativeImage.createFromPath(store.filePath(first, "thumb") || imagePath(first)) : nativeImage.createFromPath(path.join(__dirname, "..", "assets", "icon.png"));
      if (!icon.isEmpty()) icon = icon.resize({ width: 64 });
      holdOpenUntil = Date.now() + 15000;
      event.sender.startDrag({ file: files[0], files, icon });
    } catch (e) { log("shelf: drag", e?.message); }
  });
  handle("shelf:capture", () => captureScreen());
  handle("shelf:show", (_e, opts) => ({ ok: showShelf(opts || {}) }));
  handle("shelf:hide", (_e, opts) => { hideShelf(opts || {}); return { ok: true }; });
  handle("shelf:hold", (_e, on) => { holdOpen = Boolean(on); return { ok: true }; });
  handle("shelf:openLibrary", (_e, arg) => { hideShelf({ returnFocus: false }); showMain?.(arg ? `shelf:${arg}` : "shelf"); return { ok: true }; });
  handle("shelf:openLink", (_e, id) => {
    const item = store.get(id);
    if (item?.kind !== "link" || !/^https?:\/\//i.test(item.url)) throw new Error("Bağlantı bulunamadı.");
    shell.openExternal(item.url);
    return { ok: true };
  });
  handle("shelf:reveal", (_e, id) => {
    const item = store.get(id);
    if (!item) throw new Error("Öğe bulunamadı.");
    const p = item.origPath && fs.existsSync(item.origPath) ? item.origPath : imagePath(item);
    if (p) shell.showItemInFolder(p);
    return { ok: true };
  });
  handle("shelf:enrich", async (_e, id) => { await enrich(id); return { ok: true, item: publicItem(store.get(id)) }; });
  handle("shelf:folderCreate", (_e, name, parentId) => ({ ok: true, folder: store.createFolder(name, parentId || null) }));
  handle("shelf:folderRename", (_e, id, name) => ({ ok: true, folder: store.renameFolder(id, name) }));
  handle("shelf:folderMove", (_e, id, parentId) => ({ ok: true, folder: store.moveFolder(id, parentId || null) }));
  handle("shelf:folderDelete", (_e, id) => ({ ok: store.deleteFolder(id) }));
  handle("shelf:settings", () => ({ ok: true, settings, status: status() }));
  handle("shelf:setSettings", async (_e, patch = {}) => {
    const before = JSON.stringify(settings);
    settings = { ...mergeSettings(settings, patch || {}), since: settings.since };
    saveSettings();
    if (JSON.stringify(settings) !== before) {
      await restartFolders();
      restartClipboard();
      registerShortcuts();
      store.runSweep(settings.retention);
    }
    return { ok: true, settings, status: status() };
  });
  handle("shelf:addDir", async (event) => {
    if (settings.extraDirs.length >= 3) throw new Error("En çok 3 ek klasör izlenebilir.");
    const parent = BrowserWindow.fromWebContents(event.sender) || undefined;
    const res = await dialog.showOpenDialog(parent, { title: "İzlenecek klasör", buttonLabel: "İzle", properties: ["openDirectory"] });
    if (res.canceled || !res.filePaths[0]) return { ok: false, canceled: true };
    settings = { ...mergeSettings(settings, { extraDirs: [...settings.extraDirs, res.filePaths[0]] }), since: settings.since };
    saveSettings();
    await restartFolders();
    return { ok: true, settings, status: status() };
  });
  handle("shelf:importRecent", (_e, days = 7) => {
    const dirs = [];
    if (shotDir?.path) dirs.push({ path: shotDir.path, screenshotsOnly: !shotDir.custom, source: "screenshot" });
    for (const d of settings.extraDirs) dirs.push({ path: d, screenshotsOnly: false, source: "folder" });
    let count = 0;
    for (const d of dirs) for (const f of listRecent(d.path, { days: Math.min(30, Math.max(1, Number(days) || 7)), screenshotsOnly: d.screenshotsOnly })) if (ingestFile(f.path, d.source)) count += 1;
    return { ok: true, count };
  });

  /* ---------------------------- elitlig-file:// ---------------------------- */

  fileProtocol.addRoute("shelf", (request, parts) => {
    const item = store.get(parts[0]);
    const which = ["image", "thumb", "original", "link"].includes(parts[1]) ? parts[1] : "image";
    const file = item && store.filePath(item, which);
    if (!file) return null;
    return serveFile(request, file, which === "thumb" || which === "link" ? "image/jpeg" : undefined);
  });

  /* --------------------------------- başlat --------------------------------- */

  restartFolders().catch((e) => log("shelf: klasör", e?.message));
  restartClipboard();
  registerShortcuts();
  store.runSweep(settings.retention);
  const sweepTimer = setInterval(() => store.runSweep(settings.retention), 3600000);
  sweepTimer.unref?.();

  return {
    showShelf,
    hideShelf,
    toggleShelf,
    captureScreen,
    store,
    shortcuts: () => ({ ...shortcutState }),
    dispose() {
      folderWatch?.stop();
      clip.stop();
      clearInterval(sweepTimer);
      store.flush();
    },
  };
}

module.exports = { registerShelf, mergeSettings, migrateSettings, publicItem, DEFAULT_SETTINGS, DEFAULT_SHORTCUTS, SETTINGS_VERSION };
