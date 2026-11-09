"use strict";
// Müzik çalar "Yayına da ver": gizli müzik penceresi, komut kuyruğu, olay iletimi,
// sekme sesi / sistem sesi yakalamasının kurulması (bir kez, süreli) ve YouTube oEmbed.
const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { createMusicHost, ARM_TTL_MS } = require("../studio/musichost");

function fake() {
  const windows = [];
  class FakeWindow extends EventEmitter {
    constructor(opts) {
      super();
      this.opts = opts;
      this.destroyed = false;
      const wc = new EventEmitter();
      wc.sent = [];
      wc.send = (ch, msg) => wc.sent.push([ch, msg]);
      wc.isDestroyed = () => this.destroyed;
      wc.setWindowOpenHandler = () => {};
      wc.mainFrame = { id: "frame-1" };
      this.webContents = wc;
      windows.push(this);
    }
    loadFile(file) { this.file = file; return Promise.resolve(); }
    isDestroyed() { return this.destroyed; }
    destroy() { this.destroyed = true; this.emit("closed"); }
  }
  FakeWindow.fromWebContents = () => null;
  const handlers = new Map();
  const listeners = new Map();
  const ipcMain = { handle: (ch, fn) => handlers.set(ch, fn), on: (ch, fn) => listeners.set(ch, fn) };
  return { FakeWindow, windows, handlers, listeners, ipcMain };
}

test("komutlar gizli pencereye gider; pencere olayları arayüze iletilir", async () => {
  const f = fake();
  const host = createMusicHost({ BrowserWindow: f.FakeWindow, ipcMain: f.ipcMain, platform: "darwin" });
  host.register();
  const ui = { sent: [], send(ch, m) { this.sent.push([ch, m]); }, isDestroyed: () => false };
  const r = await f.handlers.get("studio:music:host")({ sender: ui }, { op: "cmd", deck: "b", cmd: "load", args: { videoId: "dQw4w9WgXcQ" } });
  assert.deepEqual(r, { ok: true });
  assert.equal(f.windows.length, 1);
  const w = f.windows[0];
  assert.match(w.file, /musichost\.html$/);
  assert.equal(w.opts.show, false);
  assert.equal(w.opts.webPreferences.backgroundThrottling, false);
  assert.equal(w.opts.webPreferences.sandbox, true);
  assert.deepEqual(w.webContents.sent, [["musichost:cmd", { deck: "b", cmd: "load", args: { videoId: "dQw4w9WgXcQ" } }]]);
  // olay: yalnız gizli pencereden gelen iletilir
  f.listeners.get("musichost:event")({ sender: w.webContents }, { deck: "a", type: "state", state: 1 });
  f.listeners.get("musichost:event")({ sender: { other: true } }, { deck: "a", type: "state", state: 0 });
  assert.deepEqual(ui.sent, [["studio:music:hostEvent", { deck: "a", type: "state", state: 1 }]]);
  // kapat
  await f.handlers.get("studio:music:host")({ sender: ui }, { op: "close" });
  assert.equal(w.destroyed, true);
});

test("yakalama: sekme sesi bir kez ve süreli; sistem sesi yalnız Windows'ta", async () => {
  let now = 1000;
  const f = fake();
  const mac = createMusicHost({ BrowserWindow: f.FakeWindow, ipcMain: null, platform: "darwin", now: () => now });
  assert.equal(mac.takeCapture(), null);
  assert.deepEqual(await mac.arm("frame"), { ok: true, mode: "frame" });
  const cap = mac.takeCapture();
  assert.equal(cap.mode, "frame");
  assert.equal(cap.frame.id, "frame-1");
  assert.equal(mac.takeCapture(), null, "bir kez kullanılır");
  await mac.arm("frame");
  now += ARM_TTL_MS + 1;
  assert.equal(mac.takeCapture(), null, "süresi geçmiş kurulum kullanılmaz");
  assert.equal((await mac.arm("loopback")).ok, false);
  assert.deepEqual(mac.capability(), { platform: "darwin", frameAudio: true, loopback: false });
  const win = createMusicHost({ BrowserWindow: f.FakeWindow, ipcMain: null, platform: "win32", now: () => now });
  assert.deepEqual(await win.arm("loopback"), { ok: true, mode: "loopback" });
  assert.deepEqual(win.takeCapture(), { mode: "loopback" });
  assert.equal(win.capability().loopback, true);
});

test("oEmbed: yalnız YouTube adresleri, başlık ve yazar", async () => {
  const urls = [];
  const host = createMusicHost({ BrowserWindow: null, fetchImpl: async (u) => { urls.push(u); return { ok: true, json: async () => ({ title: "Gol Marşı", author_name: "Kanal" }) }; } });
  assert.deepEqual(await host.oembed("https://youtu.be/dQw4w9WgXcQ"), { ok: true, title: "Gol Marşı", author: "Kanal" });
  assert.deepEqual(await host.oembed("dQw4w9WgXcQ"), { ok: true, title: "Gol Marşı", author: "Kanal" });
  assert.match(urls[1], /watch%3Fv%3DdQw4w9WgXcQ/);
  assert.deepEqual(await host.oembed("https://example.com/x"), { ok: false });
  assert.equal(urls.length, 2);
  const bad = createMusicHost({ fetchImpl: async () => { throw new Error("ağ"); } });
  assert.deepEqual(await bad.oembed("https://youtu.be/dQw4w9WgXcQ"), { ok: false });
});
