// Birleşik Araç Takımı: uygulama menüsündeki "Araç Takımı" menüsü eski bölümleri ESKİ kısayollarıyla
// açar (⇧⌘D ⇧⌘P ⌘8 ⌘9 ⇧⌘J ⌘,); Görünüm menüsünden taşındılar, kaybolmadılar.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { EventEmitter } = require("node:events");
const { registerDeskkit } = require("../toolkit");

test("Araç Takımı menüsü: bölümler eski kısayollarla, doğru rotalara", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hubmenu-"));
  const shown = [];
  const ipcMain = { handle() {}, on() {} };
  const app = Object.assign(new EventEmitter(), { getPath: () => dir, isPackaged: false, getVersion: () => "0" });
  const dk = registerDeskkit({
    app, ipcMain, BrowserWindow: { getAllWindows: () => [] }, globalShortcut: { register: () => true, unregister() {}, isRegistered: () => false, unregisterAll() {} },
    screen: { getPrimaryDisplay: () => ({ workArea: { x: 0, y: 0, width: 1000, height: 800 } }), getCursorScreenPoint: () => ({ x: 0, y: 0 }), getDisplayNearestPoint: () => ({ workArea: { x: 0, y: 0, width: 1000, height: 800 } }) },
    systemPreferences: {}, shell: {}, powerSaveBlocker: { start: () => 1, stop() {}, isStarted: () => false }, net: {},
    loadRenderer() {}, webPreferences: () => ({}), guardNavigation() {}, showMain: (r) => shown.push(r), showQuick() {}, broadcast() {},
    getMainWindow: () => null, refreshTray() {}, rebuildMenu() {}, isMac: true, log() {},
  });
  const items = dk.menuTemplate().submenu;
  const want = { "Dosya Araçları": ["CmdOrCtrl+Shift+D", "files"], "Ekran Görüntüleri ve Pano": ["CmdOrCtrl+Shift+P", "shelf"], "Hesap Araçları": ["CmdOrCtrl+8", "calc"], "Odak Sayacı": ["CmdOrCtrl+9", "focus"], "Müzik Görünümü": ["CmdOrCtrl+Shift+J", "music"], "Masaüstü Araçları Ayarları…": ["CmdOrCtrl+,", "desk"] };
  for (const [label, [acc, route]] of Object.entries(want)) {
    const it = items.find((i) => i.label === label);
    assert.ok(it, `${label} menüde yok`);
    assert.equal(it.accelerator, acc);
    it.click();
    assert.equal(shown.at(-1), route);
  }
  const accs = items.map((i) => i.accelerator).filter(Boolean);
  assert.equal(new Set(accs).size, accs.length, "menüde yinelenen kısayol");
});

test("main.js: Görünüm menüsü hub bölümlerini Araç Takımı menüsü varken yinelemez", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "main.js"), "utf8");
  for (const r of ["calc", "focus", "files", "shelf"]) assert.match(src, new RegExp(`\\["${r}", "[^"]+", "[^"]+", "hub"\\]`));
  assert.match(src, /ROUTES\.filter\(\(r\) => !\(deskkit && r\[3\] === "hub"\)\)/);
});
