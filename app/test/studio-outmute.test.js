// Dışarı giden tüm sesleri kapat: bütün pencerelerin hoparlör çıkışı (webContents.setAudioMuted);
// ekran dışı web kaynakları dokunulmaz, sonradan açılan pencere de sessiz başlar.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { createOutMute } = require("../studio/outmute");

function fakeWin(offscreen = false) {
  const wc = { muted: false, setAudioMuted(v) { this.muted = v; }, isOffscreen: () => offscreen, isDestroyed: () => false };
  return { webContents: wc, isDestroyed: () => false };
}

test("outMute: aç / kapat bütün pencerelere, offscreen hariç, yeni pencere sessiz", async () => {
  const wins = [fakeWin(), fakeWin(), fakeWin(true)];
  const handlers = {};
  const ipcMain = { handle: (ch, fn) => { handlers[ch] = fn; } };
  const app = new EventEmitter();
  const om = createOutMute({ BrowserWindow: { getAllWindows: () => wins }, ipcMain, app });
  om.register();
  const r = await handlers["studio:outMute:set"]({}, true);
  assert.deepEqual(r, { ok: true, on: true, windows: 2 });
  assert.deepEqual(wins.map((w) => w.webContents.muted), [true, true, false]);
  const late = fakeWin();
  app.emit("browser-window-created", {}, late);
  assert.equal(late.webContents.muted, true);
  assert.deepEqual(await handlers["studio:outMute:get"](), { on: true });
  await handlers["studio:outMute:set"]({}, false);
  assert.deepEqual(wins.map((w) => w.webContents.muted), [false, false, false]);
  const later = fakeWin();
  app.emit("browser-window-created", {}, later);
  assert.equal(later.webContents.muted, false);
});
