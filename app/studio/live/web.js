// Yayın Stüdyosu — WEB SAYFASI kaynağı (OBS "tarayıcı kaynağı").
//
// <webview> / iframe içeriği tuvale çizilemez; bu yüzden sayfa ana süreçte
// GÖRÜNMEZ, ekran dışı (offscreen) bir pencerede açılır. Electron her değişen
// kareyi "paint" olayıyla verir; değişen dikdörtgen (dirty) ham BGRA olarak
// arayüze gönderilir, arayüz kendi tuvaline yapıştırır (yalnız değişen bölge:
// durağan skor sayfası neredeyse hiç veri taşımaz).
//
//   - Saydam zemin: sayfa arka planı saydam (alfa korunur; overlay / alt bant için).
//   - Boyut, kare hızı (1–60), özel CSS (yüklenince eklenir), yakınlaştırma, yenile.
//   - Ayrı oturum bölümü (persist:studio-web): çerez / giriş uygulamanınkinden ayrı;
//     kamera / mikrofon / bildirim gibi izinler reddedilir, yeni pencere açılmaz.
//   - Sayfanın sesi kapalıdır (yayına gitmez).
"use strict";

const ALLOWED = /^https?:\/\//i;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const int = (v, d) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : d);

function normalizeWebSpec(s = {}) {
  const url = String(s.url || "").trim();
  if (!ALLOWED.test(url)) return { error: { code: "BAD_URL", message: "Adres http:// ya da https:// ile başlamalı." } };
  try { new URL(url); } catch { return { error: { code: "BAD_URL", message: "Adres geçersiz." } }; }
  return {
    url,
    width: clamp(int(s.width, 1920), 160, 3840),
    height: clamp(int(s.height, 1080), 90, 2160),
    fps: clamp(int(s.fps, 30), 1, 60),
    css: String(s.css || "").slice(0, 20000),
    transparent: s.transparent !== false,
    zoom: clamp(Number(s.zoom) || 1, 0.25, 4),
  };
}

const TRANSPARENT_CSS = "html, body { background: transparent !important; background-color: transparent !important; }";

/**
 * createWebSources({ BrowserWindow, session, send(id, frame), onStatus(id, st), log })
 *   frame: { id, gen, x, y, w, h, width, height, data: Buffer (BGRA, w*h*4) }
 */
function createWebSources({ BrowserWindow, session = null, send = () => {}, onStatus = () => {}, log = () => {} } = {}) {
  const pages = new Map(); // id → { win, spec, gen, key }
  let gen = 0;
  let partitionReady = false;

  function preparePartition() {
    if (partitionReady || !session?.fromPartition) return;
    partitionReady = true;
    try {
      const ses = session.fromPartition("persist:studio-web");
      ses.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
      ses.setPermissionCheckHandler?.(() => false);
    } catch { /* yoksay */ }
  }

  function open(id, raw) {
    if (!BrowserWindow) return { ok: false, error: { code: "NO_WINDOW", message: "Web sayfası kaynağı bu ortamda yok." } };
    const spec = normalizeWebSpec(raw);
    if (spec.error) return { ok: false, error: spec.error };
    const key = JSON.stringify(spec);
    const cur = pages.get(String(id));
    if (cur && cur.key === key && cur.win && !cur.win.isDestroyed()) return { ok: true, gen: cur.gen };
    if (cur && cur.win && !cur.win.isDestroyed() && cur.spec.width === spec.width && cur.spec.height === spec.height && cur.spec.fps === spec.fps && cur.spec.transparent === spec.transparent) {
      // Yalnız adres / CSS / yakınlaştırma değişti: aynı pencerede yükle.
      cur.spec = spec;
      cur.key = key;
      load(cur);
      return { ok: true, gen: cur.gen };
    }
    if (cur) close(id);
    preparePartition();
    const win = new BrowserWindow({
      show: false,
      width: spec.width,
      height: spec.height,
      useContentSize: true,
      frame: false,
      transparent: spec.transparent,
      backgroundColor: spec.transparent ? "#00000000" : "#ffffff",
      webPreferences: {
        offscreen: true,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false,
        partition: "persist:studio-web",
        spellcheck: false,
      },
    });
    const page = { id: String(id), win, spec, key, gen: ++gen, frames: 0, lastPaintAt: 0 };
    pages.set(page.id, page);
    const wc = win.webContents;
    try { wc.setAudioMuted(true); } catch { /* yoksay */ }
    try { wc.setFrameRate(spec.fps); } catch { /* yoksay */ }
    wc.setWindowOpenHandler(() => ({ action: "deny" }));
    wc.on("will-navigate", (e, url) => { if (!ALLOWED.test(url)) e.preventDefault(); });
    wc.on("paint", (_e, dirty, image) => {
      if (pages.get(page.id) !== page) return;
      try {
        const size = image.getSize();
        if (!size.width || !size.height) return;
        // İlk kare ya da boyut değişti: tam kare; sonra yalnız değişen bölge.
        const full = !page.frames || page.width !== size.width || page.height !== size.height;
        page.width = size.width; page.height = size.height;
        const r = full ? { x: 0, y: 0, width: size.width, height: size.height } : {
          x: clamp(Math.floor(dirty.x), 0, size.width - 1),
          y: clamp(Math.floor(dirty.y), 0, size.height - 1),
          width: 0, height: 0,
        };
        if (!full) {
          r.width = clamp(Math.ceil(dirty.width), 1, size.width - r.x);
          r.height = clamp(Math.ceil(dirty.height), 1, size.height - r.y);
        }
        const part = full ? image : image.crop(r);
        const data = part.toBitmap();
        page.frames += 1;
        page.lastPaintAt = Date.now();
        send(page.id, { id: page.id, gen: page.gen, x: r.x, y: r.y, w: r.width, h: r.height, width: size.width, height: size.height, data });
      } catch (e) { log("web kaynağı: kare alınamadı", { error: e.message }); }
    });
    wc.on("did-start-loading", () => onStatus(page.id, { state: "loading", message: "Yükleniyor…", url: page.spec.url }));
    wc.on("dom-ready", () => {
      if (page.spec.transparent) wc.insertCSS(TRANSPARENT_CSS).catch(() => {});
      if (page.spec.css) wc.insertCSS(page.spec.css).catch(() => {});
      try { wc.setZoomFactor(page.spec.zoom); } catch { /* yoksay */ }
    });
    wc.on("did-finish-load", () => { onStatus(page.id, { state: "live", message: null, title: wc.getTitle?.() || "", url: page.spec.url }); wc.invalidate?.(); });
    wc.on("did-fail-load", (_e, code, desc, url, isMain) => { if (isMain !== false && code !== -3) onStatus(page.id, { state: "error", message: `Sayfa açılamadı: ${desc || code}`, url }); });
    wc.on("render-process-gone", (_e, d) => { onStatus(page.id, { state: "error", message: `Sayfa çöktü (${d?.reason || "?"}); yenileyin.` }); });
    load(page);
    return { ok: true, gen: page.gen };
  }

  function load(page) {
    page.frames = 0;
    page.gen = ++gen;
    page.win.webContents.loadURL(page.spec.url).catch(() => { /* did-fail-load bildirir */ });
  }

  function reload(id) {
    const p = pages.get(String(id));
    if (!p || p.win.isDestroyed()) return false;
    p.frames = 0;
    p.gen = ++gen;
    p.win.webContents.reloadIgnoringCache();
    return true;
  }

  function close(id) {
    const p = pages.get(String(id));
    if (!p) return false;
    pages.delete(p.id);
    try { if (!p.win.isDestroyed()) p.win.destroy(); } catch { /* yoksay */ }
    return true;
  }

  /** Arayüz yeni açıldı (ya da kare kaçırdı): tam kare iste. */
  function refresh(id) {
    const p = pages.get(String(id));
    if (!p || p.win.isDestroyed()) return false;
    p.frames = 0;
    try { p.win.webContents.invalidate(); } catch { /* yoksay */ }
    return true;
  }

  const list = () => [...pages.values()].map((p) => ({ id: p.id, url: p.spec.url, width: p.spec.width, height: p.spec.height, frames: p.frames }));
  const dispose = () => { for (const id of [...pages.keys()]) close(id); };
  return { open, close, reload, refresh, list, dispose };
}

module.exports = { createWebSources, normalizeWebSpec };
