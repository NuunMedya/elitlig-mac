// Windows uygulama simgesi: build/icon.ico çok boyutlu (16–256, 256 PNG sıkıştırmalı), electron-builder
// win.icon + NSIS kurulum / kaldırma / başlık simgeleri, paketli resources/icon.ico ve pencere simgesi yolu.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

function readIco(file) {
  const b = fs.readFileSync(file);
  assert.equal(b.readUInt16LE(0), 0);
  assert.equal(b.readUInt16LE(2), 1, "tür: simge");
  const n = b.readUInt16LE(4);
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const o = 6 + i * 16;
    const w = b[o] || 256;
    const h = b[o + 1] || 256;
    const size = b.readUInt32LE(o + 8);
    const off = b.readUInt32LE(o + 12);
    assert.ok(off + size <= b.length, "girdi dosya sınırında");
    out.push({ w, h, bpp: b.readUInt16LE(o + 6), png: b.subarray(off, off + 4).equals(PNG_SIG) });
  }
  return out;
}

for (const rel of ["build/icon.ico", "app/assets/icon.ico"]) {
  test(`${rel}: 16–256 tüm boyutlar, 256 PNG`, () => {
    const icons = readIco(path.join(ROOT, rel));
    const sizes = icons.map((i) => i.w);
    for (const s of [16, 24, 32, 48, 64, 128, 256]) assert.ok(sizes.includes(s), `${s}px yok`);
    for (const i of icons) { assert.equal(i.w, i.h); assert.equal(i.bpp, 32); }
    assert.ok(icons.find((i) => i.w === 256).png, "256px PNG sıkıştırmalı olmalı");
  });
}

test("electron-builder: win.icon, NSIS simgeleri, resources/icon.ico", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  const b = pkg.build;
  assert.equal(b.win.icon, "build/icon.ico");
  assert.notEqual(b.win.signAndEditExecutable, false, "exe kaynakları (simge) düzenlenmeli");
  for (const k of ["installerIcon", "uninstallerIcon", "installerHeaderIcon"]) assert.equal(b.nsis[k], "build/icon.ico", k);
  assert.ok(b.win.extraResources.some((r) => r.from === "build/icon.ico" && r.to === "icon.ico"));
  assert.equal(b.appId, "com.elitlig.araclar");
});

test("pencere simgesi: Windows'ta .ico, diğerlerinde png; AppUserModelId appId ile aynı", () => {
  const { appIconPath } = require("../appIcon");
  assert.match(appIconPath("win32", "/yok"), /icon\.ico$/);
  assert.match(appIconPath("darwin"), /icon\.png$/);
  const main = fs.readFileSync(path.join(ROOT, "app", "main.js"), "utf8");
  assert.match(main, /setAppUserModelId\("com\.elitlig\.araclar"\)/);
  assert.match(main, /icon: appIconPath\(\)/);
});
