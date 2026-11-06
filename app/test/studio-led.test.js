"use strict";
// LED çıkışı: stüdyonun ekranında (birincil / tek ekran) kilitlenme düzeltmesi —
// önce uyarı, onayla normal pencere; tek / çift Esc; genel kısayol; odak çalmama.
const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { createLedManager, windowedBounds, CLOSE_ACCELERATOR } = require("../studio/led");

function fakeElectron({ displays = 2, hostOn = 1 } = {}) {
  const windows = [];
  class FakeWindow extends EventEmitter {
    constructor(opts) {
      super();
      this.opts = opts;
      this.destroyed = false;
      this.shown = null;
      this.focused = 0;
      const wc = new EventEmitter();
      wc.id = 100 + windows.length;
      wc.sent = [];
      wc.send = (ch, payload) => wc.sent.push({ ch, payload });
      wc.setWindowOpenHandler = () => {};
      this.webContents = wc;
      windows.push(this);
    }
    isDestroyed() { return this.destroyed; }
    destroy() { this.destroyed = true; this.emit("closed"); }
    show() { this.shown = "show"; }
    showInactive() { this.shown = "inactive"; }
    setBounds(b) { this.bounds = b; }
    setFullScreen(v) { this.full = v; }
    setSimpleFullScreen(v) { this.simpleFull = v; }
    isSimpleFullScreen() { return Boolean(this.simpleFull); }
    removeMenu() {}
    setMenuBarVisibility() {}
    loadURL() { return Promise.resolve(); }
  }
  const screen = new EventEmitter();
  screen.list = [
    { id: 1, label: "Yerleşik", bounds: { x: 0, y: 0, width: 1512, height: 982 }, workArea: { x: 0, y: 25, width: 1512, height: 957 } },
    { id: 2, label: "LED", bounds: { x: 1512, y: 0, width: 1920, height: 1080 } },
  ].slice(0, displays);
  screen.getAllDisplays = () => screen.list;
  screen.getPrimaryDisplay = () => screen.list[0];
  screen.getDisplayMatching = (b) => screen.list.find((d) => b.x >= d.bounds.x && b.x < d.bounds.x + d.bounds.width) || screen.list[0];
  // Stüdyo (ana pencere).
  const hostDisplay = screen.list.find((d) => d.id === hostOn) || screen.list[0];
  const host = {
    focused: 0,
    isDestroyed: () => false,
    isVisible: () => true,
    isMinimized: () => false,
    getBounds: () => ({ x: hostDisplay.bounds.x + 10, y: 10, width: 1200, height: 800 }),
    focus() { this.focused += 1; },
  };
  const shortcuts = new Map();
  const globalShortcut = {
    register: (acc, fn) => { shortcuts.set(acc, fn); return true; },
    unregister: (acc) => { shortcuts.delete(acc); },
  };
  return { FakeWindow, windows, screen, host, globalShortcut, shortcuts };
}

function setup(opts = {}, extra = {}) {
  const e = fakeElectron(opts);
  let t = 0;
  const statuses = [];
  const led = createLedManager({
    BrowserWindow: e.FakeWindow, screen: e.screen, loadRenderer: () => Promise.resolve(), preloadPath: "/p.js",
    platform: "darwin", now: () => t, globalShortcut: e.globalShortcut, getHostWindows: () => [e.host],
    timers: { setTimeout: () => null, clearTimeout: () => {} },
    ...extra,
  });
  led.events.on("status", (s) => statuses.push(s));
  return { ...e, led, statuses, advance: (ms) => { t += ms; } };
}
const esc = (w) => w.webContents.emit("before-input-event", { preventDefault() {} }, { type: "keyDown", key: "Escape" });

test("LED stüdyonun ekranında: önce uyarı (pencere açılmaz); onayla normal, çerçeveli, boyutlanabilir pencere — tam ekran / kiosk / üstte değil", () => {
  const { led, windows, host, shortcuts, statuses } = setup({ hostOn: 1 });
  assert.equal(led.displays()[0].hostsStudio, true);
  assert.equal(led.displays()[1].hostsStudio, false);
  assert.equal(led.isSharedDisplay(1), true);
  assert.equal(led.isSharedDisplay(2), false);
  const res = led.open({ displayId: 1, mode: "studio" });
  assert.equal(res.ok, false);
  assert.equal(res.needsConfirm, true);
  assert.equal(res.error.code, "SHARED_DISPLAY");
  assert.match(res.error.message, /stüdyo/);
  assert.equal(windows.length, 0, "onaysız pencere açılmamalı");
  const ok = led.open({ displayId: 1, mode: "studio", confirmShared: true });
  assert.equal(ok.ok, true);
  assert.equal(ok.windowed, true);
  const w = windows[0];
  assert.equal(w.opts.frame, true);
  assert.equal(w.opts.resizable, true);
  assert.equal(w.opts.fullscreen, false);
  assert.equal(w.opts.fullscreenable, true);
  assert.equal(w.opts.kiosk, false);
  assert.equal(w.opts.alwaysOnTop, false);
  assert.ok(w.opts.width < 1512 && w.opts.height < 982, "ekranın tamamını kaplamaz");
  w.emit("ready-to-show");
  assert.equal(w.shown, "inactive", "odak çalmaz");
  assert.equal(w.simpleFull, undefined);
  assert.equal(w.full, undefined);
  assert.equal(host.focused, 0, "pencere kipinde stüdyo öne alınmaz (LED arkada kalmasın); odak zaten stüdyoda");
  assert.equal(shortcuts.has(CLOSE_ACCELERATOR), true);
  // Pencere kipinde tek Esc kapatır.
  esc(w);
  assert.equal(w.destroyed, true);
  assert.equal(statuses.at(-1).open, false);
  assert.equal(statuses.at(-1).reason, "ESC");
  assert.equal(shortcuts.size, 0, "kısayollar bırakılır");
});

test("LED tek ekranda: stüdyo penceresi bilinmese de ortak sayılır; pencere kipinde açılır", () => {
  const { led, windows } = setup({ displays: 1 }, { getHostWindows: () => [] });
  const res = led.open({ mode: "studio" });
  assert.equal(res.error.code, "SHARED_DISPLAY");
  assert.match(res.error.message, /Yalnız bir ekran/);
  assert.equal(led.open({ mode: "studio", confirmShared: true }).ok, true);
  assert.equal(windows[0].opts.frame, true);
  assert.deepEqual(windows[0].opts.width, windowedBounds({ workArea: { x: 0, y: 25, width: 1512, height: 957 } }).width);
  led.close();
});

test("LED ayrı ekranda: çerçevesiz tam ekran, odak çalmaz, alwaysOnTop yok; çift Esc, genel kısayol ve odaktayken Esc kapatır", () => {
  const { led, windows, host, shortcuts, statuses, advance } = setup({ hostOn: 1 });
  const res = led.open({ displayId: 2, mode: "studio" });
  assert.equal(res.ok, true);
  assert.equal(res.windowed, false);
  const w = windows[0];
  assert.equal(w.opts.frame, false);
  assert.equal(w.opts.alwaysOnTop, false);
  assert.equal(w.opts.kiosk, false);
  w.emit("ready-to-show");
  assert.equal(w.shown, "inactive");
  assert.equal(w.simpleFull, true, "ikincil ekranda basit tam ekran");
  assert.ok(host.focused >= 1);
  // Tek Esc kapatmaz (seyirci önünde yanlışlıkla kapanmasın), ipucu yayılır; ikincisi kapatır.
  esc(w);
  assert.equal(w.destroyed, false);
  assert.equal(statuses.at(-1).hint, "ESC_AGAIN");
  advance(500);
  esc(w);
  assert.equal(w.destroyed, true);
  // Genel kısayol (LED stüdyoyu örtse de).
  led.open({ displayId: 2, mode: "studio" });
  shortcuts.get(CLOSE_ACCELERATOR)();
  assert.equal(windows[1].destroyed, true);
  assert.equal(statuses.at(-1).reason, "SHORTCUT");
  // LED odaktayken Esc genel kısayol olarak da kayıtlı; odak gidince bırakılır.
  led.open({ displayId: 2, mode: "studio" });
  const w3 = windows[2];
  w3.emit("focus");
  assert.equal(shortcuts.has("Escape"), true);
  w3.emit("blur");
  assert.equal(shortcuts.has("Escape"), false);
  w3.emit("focus");
  advance(5000);
  shortcuts.get("Escape")();
  advance(100);
  shortcuts.get("Escape")();
  assert.equal(w3.destroyed, true);
  assert.equal(shortcuts.size, 0);
  // Kullanıcı pencereyi kendisi kapatırsa da kısayollar bırakılır.
  led.open({ displayId: 2, mode: "studio" });
  windows[3].destroy();
  assert.equal(led.status().open, false);
  assert.equal(shortcuts.size, 0);
});

test("LED birincil ekranda ama stüdyo ikinci ekrandaysa: tam ekran, ama basit tam ekran DEĞİL (macOS'un kendi tam ekranı)", () => {
  const { led, windows } = setup({ hostOn: 2 });
  assert.equal(led.isSharedDisplay(1), false);
  assert.equal(led.isSharedDisplay(2), true);
  assert.equal(led.open({ displayId: 2, mode: "studio" }).error.code, "SHARED_DISPLAY");
  const res = led.open({ displayId: 1, mode: "studio" });
  assert.equal(res.ok, true);
  const w = windows[0];
  w.emit("ready-to-show");
  assert.equal(w.simpleFull, undefined);
  assert.equal(w.full, true);
  led.close("STUDIO");
  assert.equal(w.destroyed, true);
});

test("LED durumu: hızlı akış birleştirilir, son durum kaybolmaz (ana süreç taşmaz)", () => {
  const pending = [];
  const { led, windows } = setup({}, { timers: { setTimeout: (fn, ms) => { pending.push({ fn, ms }); return pending.length; }, clearTimeout: () => {} }, stateMinIntervalMs: 33 });
  led.open({ displayId: 2, mode: "studio" });
  const w = windows[0];
  for (let i = 0; i < 100; i += 1) led.sendState({ i });
  const sent = w.webContents.sent.filter((m) => m.ch === "studio:led:state");
  assert.equal(sent.length, 1, "aynı anda gelen 100 durumdan yalnız ilki hemen");
  const timer = pending.find((p) => p.ms <= 33);
  timer.fn();
  const after = w.webContents.sent.filter((m) => m.ch === "studio:led:state");
  assert.equal(after.length, 2);
  assert.deepEqual(after.at(-1).payload, { i: 99 });
  led.close();
});
