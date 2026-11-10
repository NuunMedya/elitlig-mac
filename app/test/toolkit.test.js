"use strict";
// Masaüstü araç takımı (app/toolkit.js) — sahte Electron ile: kısayol kaydı, ayarlar, medya tuşları,
// müzik komut aktarımı, uyanık tut, menü öğeleri.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { EventEmitter } = require("node:events");
const { registerDeskkit } = require("../toolkit");

function harness({ taken = [], trusted = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "deskkit-"));
  const handlers = new Map();
  const listeners = new Map();
  const ipcMain = { handle: (ch, fn) => handlers.set(ch, fn), on: (ch, fn) => listeners.set(ch, fn) };
  const shortcuts = new Map();
  const globalShortcut = {
    register: (acc, fn) => { if (taken.includes(acc) || shortcuts.has(acc)) return false; shortcuts.set(acc, fn); return true; },
    isRegistered: (acc) => shortcuts.has(acc),
    unregister: (acc) => shortcuts.delete(acc),
  };
  const app = new EventEmitter();
  app.getPath = (k) => (k === "temp" ? os.tmpdir() : dir);
  const sent = [];
  const mainWindow = { isDestroyed: () => false, webContents: { send: (ch, p) => sent.push({ ch, p }) } };
  const blockers = new Set();
  let blockId = 0;
  const powerSaveBlocker = { start: () => { blockId += 1; blockers.add(blockId); return blockId; }, stop: (id) => blockers.delete(id), isStarted: (id) => blockers.has(id) };
  const shown = [];
  const broadcasts = [];
  let menuBuilds = 0;
  const dk = registerDeskkit({
    app, ipcMain, globalShortcut, powerSaveBlocker,
    BrowserWindow: { getFocusedWindow: () => null, getAllWindows: () => [], fromWebContents: () => null, fromId: () => null },
    screen: { getAllDisplays: () => [{ id: 1, bounds: { x: 0, y: 0, width: 1440, height: 900 }, workArea: { x: 0, y: 25, width: 1440, height: 875 }, scaleFactor: 2 }], getCursorScreenPoint: () => ({ x: 0, y: 0 }), getDisplayNearestPoint: () => ({ workArea: { x: 0, y: 25, width: 1440, height: 875 } }) },
    systemPreferences: { isTrustedAccessibilityClient: () => trusted }, shell: { openExternal: async () => {} },
    net: { fetch: async () => { throw new Error("çevrimdışı"); } },
    loadRenderer: () => {}, webPreferences: () => ({}), guardNavigation: () => {},
    showMain: (r) => shown.push(r), showQuick: () => {}, getMainWindow: () => mainWindow,
    broadcast: (ch, p) => broadcasts.push({ ch, p }), rebuildMenu: () => { menuBuilds += 1; }, isMac: true, platform: "darwin",
  });
  const invoke = (ch, ...args) => handlers.get(ch)({ sender: {} }, ...args);
  return { dk, dir, handlers, listeners, shortcuts, sent, blockers, shown, broadcasts, invoke, app, menuBuilds: () => menuBuilds };
}

test("varsayılan kısayollar kaydedilir; başkasının tuttuğu kısayol 'kullanımda' görünür", async () => {
  const h = harness({ taken: ["Control+Alt+C"] });
  assert.ok(h.shortcuts.has("Control+Alt+Space"), "araç takımı");
  assert.ok(h.shortcuts.has("Control+Alt+Left"));
  assert.ok(!h.shortcuts.has("Control+Alt+T"), "⌃⌥T başka araca ayrıldı");
  const v = await h.invoke("deskkit:settings");
  assert.equal(v.failed.center, true);
  assert.equal(v.layouts.length, 18);
  assert.equal(v.supported, true);
  assert.deepEqual(v.permission, { platform: "darwin", needed: true, granted: false });
});

test("ayar değişince kısayollar yeniden kaydedilir ve dosyaya yazılır", async () => {
  const h = harness();
  const v = await h.invoke("deskkit:settings:set", { layouts: { shortcuts: { leftHalf: "Control+Alt+Shift+L", rightHalf: "" } }, toolkit: { shortcut: "Control+Alt+Shift+Space" } });
  assert.equal(v.settings.layouts.shortcuts.leftHalf, "Control+Alt+Shift+L");
  assert.ok(h.shortcuts.has("Control+Alt+Shift+L"));
  assert.ok(!h.shortcuts.has("Control+Alt+Left"));
  assert.ok(!h.shortcuts.has("Control+Alt+Right"), "boş = kapalı");
  assert.ok(h.shortcuts.has("Control+Alt+Shift+Space"));
  const saved = JSON.parse(fs.readFileSync(path.join(h.dir, "deskkit.json"), "utf8"));
  assert.equal(saved.layouts.shortcuts.rightHalf, "");
  assert.ok(h.broadcasts.some((b) => b.ch === "deskkit:settings"));
  // Kısayol kaydederken geçici olarak hepsi bırakılır.
  await h.invoke("deskkit:shortcuts:suspend", true);
  assert.equal(h.shortcuts.size, 0);
  await h.invoke("deskkit:shortcuts:suspend", false);
  assert.ok(h.shortcuts.has("Control+Alt+Shift+L"));
  // Pencere kısayolları kapatılınca yalnız panel kısayolu kalır.
  await h.invoke("deskkit:settings:set", { layouts: { enabled: false } });
  assert.deepEqual([...h.shortcuts.keys()], ["Control+Alt+Shift+Space"]);
  const reset = await h.invoke("deskkit:settings:set", { reset: true });
  assert.equal(reset.settings.layouts.shortcuts.leftHalf, "Control+Alt+Left");
});

test("medya tuşları yalnız müzik etkinken tutulur; komutlar ana pencereye gider", async () => {
  const untrusted = harness();
  untrusted.listeners.get("music:publish")({}, { status: "playing", title: "Parça", trackCount: 1 });
  assert.ok(!untrusted.shortcuts.has("MediaPlayPause"), "Mac'te izin yokken denenmez");
  const h = harness({ trusted: true });
  assert.ok(!h.shortcuts.has("MediaPlayPause"), "çalmıyorken diğer uygulamalara kalır");
  h.listeners.get("music:publish")({}, { status: "playing", title: "Parça", trackCount: 3, volume: 50 });
  assert.ok(h.shortcuts.has("MediaPlayPause") && h.shortcuts.has("MediaNextTrack"));
  h.shortcuts.get("MediaNextTrack")();
  assert.deepEqual(h.sent.at(-1), { ch: "music:command", p: { name: "next", args: {} } });
  assert.equal((await h.invoke("music:state")).title, "Parça");
  await h.invoke("music:command", "volume", { value: 30 });
  assert.deepEqual(h.sent.at(-1).p, { name: "volume", args: { value: 30 } });
  await h.invoke("music:command", "show");
  assert.equal(h.shown.at(-1), "music");
  // Tepsi menüsü: çalan parça ve denetimler.
  const tray = h.dk.trayItems();
  const musicMenu = tray.find((i) => String(i.label).startsWith("Müzik"));
  assert.match(musicMenu.label, /Parça/);
  assert.equal(musicMenu.submenu.find((i) => i.label === "Duraklat").enabled, true);
  h.listeners.get("music:publish")({}, { status: "idle", trackCount: 3 });
  assert.ok(!h.shortcuts.has("MediaPlayPause"), "durunca bırakılır");
  await h.invoke("deskkit:settings:set", { music: { mediaKeys: false } });
  h.listeners.get("music:publish")({}, { status: "playing", title: "x", trackCount: 1 });
  assert.ok(!h.shortcuts.has("MediaPlayPause"), "ayar kapalı");
});

test("ekranı uyanık tut: süreli / süresiz, kapatma", async () => {
  const h = harness();
  const on = await h.invoke("deskkit:awake:set", { on: true, minutes: 30 });
  assert.equal(on.on, true);
  assert.ok(on.until > Date.now());
  assert.equal(h.blockers.size, 1);
  const off = await h.invoke("deskkit:awake:set", { on: false });
  assert.equal(off.on, false);
  assert.equal(h.blockers.size, 0);
  assert.ok(h.broadcasts.some((b) => b.ch === "deskkit:awake"));
  await h.invoke("deskkit:awake:set", { on: true });
  h.app.emit("will-quit");
  assert.equal(h.blockers.size, 0, "çıkışta bırakılır");
});

test("döviz: ağ yoksa ve önbellek boşsa açıklayıcı hata; önbellek varsa eski kur", async () => {
  const h = harness();
  const r = await h.invoke("deskkit:rates", false);
  assert.equal(r.ok, false);
  // Önbellek açılışta okunur: önce dosya yazılır, sonra aynı klasörle yeni kayıt yapılır.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "deskkit-"));
  fs.writeFileSync(path.join(dir, "deskkit-rates.json"), JSON.stringify({ base: "EUR", date: "2026-11-01", rates: { EUR: 1, USD: 1.1, TRY: 37 }, source: "test", fetchedAt: 1 }));
  const handlers = new Map();
  registerDeskkit({
    app: Object.assign(new EventEmitter(), { getPath: (k) => (k === "temp" ? os.tmpdir() : dir) }),
    ipcMain: { handle: (c, f) => handlers.set(c, f), on: () => {} },
    globalShortcut: { register: () => true, isRegistered: () => false, unregister: () => {} },
    powerSaveBlocker: { start: () => 1, stop: () => {}, isStarted: () => false },
    BrowserWindow: { getFocusedWindow: () => null }, screen: { getAllDisplays: () => [] }, systemPreferences: {}, shell: {},
    net: { fetch: async () => { throw new Error("çevrimdışı"); } },
    loadRenderer: () => {}, webPreferences: () => ({}), guardNavigation: () => {}, showMain: () => {}, showQuick: () => {}, getMainWindow: () => null, broadcast: () => {},
    // Platform sabitlenir: Windows CI'da gerçek PowerShell yardımcısı açılıp testi asılı bırakmasın.
    isMac: true, platform: "darwin",
  });
  const cached = await handlers.get("deskkit:rates")({}, false);
  assert.equal(cached.ok, true);
  assert.equal(cached.stale, true);
  assert.equal(cached.rates.TRY, 37);
});

test("menü: Araç Takımı menüsü düzenleri, müziği ve ayarları içerir", () => {
  const h = harness();
  const m = h.dk.menuTemplate();
  assert.equal(m.label, "Araç Takımı");
  const layout = m.submenu.find((i) => i.label === "Pencere Düzeni");
  const left = layout.submenu.find((i) => i.label === "Sol yarı");
  assert.equal(left.accelerator, "Control+Alt+Left");
  assert.equal(left.registerAccelerator, false, "genel kısayol zaten kayıtlı; menü yalnız gösterir");
  assert.ok(m.submenu.some((i) => i.label === "Masaüstü Araçları Ayarları…" && i.accelerator === "CmdOrCtrl+,"));
  assert.ok(m.submenu.some((i) => i.type === "checkbox" && i.label === "Ekranı uyanık tut"));
});
