"use strict";
// Yayın Stüdyosu: kalıcı yerel dosya kaynakları (media.js izin listesi) ve
// elitlig-studio://media/<kimlik>/<ad> sunumu (Range, izin listesi dışı → 404).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createMediaLibrary, mediaIdOf, dialogFilters } = require("../studio/media");
const scheme = require("../studio/scheme");

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "elitlig-media-"));
const req = (url, range) => ({ url, method: "GET", headers: { get: (k) => (k === "range" ? range || null : null) } });

test("medya: izin listesi kalıcıdır; yalnız gerçek ve bilinen türde dosyalar girer", () => {
  const dir = tmp();
  const store = path.join(dir, "studio-media.json");
  const video = path.join(dir, "Tanıtım filmi.mp4");
  fs.writeFileSync(video, Buffer.alloc(100, 7));
  fs.writeFileSync(path.join(dir, "notlar.txt"), "x");
  const lib = createMediaLibrary({ file: store });
  const e = lib.allow(video);
  assert.equal(e.id, mediaIdOf(video));
  assert.equal(e.type, "video/mp4");
  assert.match(e.url, /^elitlig-studio:\/\/media\/[0-9a-f]{24}\/Tan%C4%B1t%C4%B1m%20filmi\.mp4$/);
  assert.equal(lib.allow(path.join(dir, "notlar.txt")), null, "bilinmeyen tür");
  assert.equal(lib.allow("göreli/yol.mp4"), null, "göreli yol");
  assert.equal(lib.allow(path.join(dir, "yok.mp4")), null, "olmayan dosya");
  assert.equal(lib.allow(dir), null, "klasör");
  // Yeniden açılış: aynı dosyadan okunur.
  const again = createMediaLibrary({ file: store });
  assert.equal(again.resolve(e.id), video);
  assert.deepEqual(again.check([e.id, "0".repeat(24), "../x"]), { [e.id]: true, ["0".repeat(24)]: false, "../x": false });
  // Dosya silinirse çözülmez (arayüz "dosya bulunamadı" der).
  fs.rmSync(video);
  assert.equal(again.resolve(e.id), null);
  assert.equal(again.forget(e.id), true);
  assert.deepEqual(dialogFilters("image")[0].extensions.includes("png"), true);
});

test("medya: şema yalnız listedeki dosyayı Range ile sunar", async () => {
  const dir = tmp();
  const file = path.join(dir, "muzik.MP3");
  fs.writeFileSync(file, Buffer.from("0123456789abcdefghij"));
  const lib = createMediaLibrary({ file: path.join(dir, "m.json") });
  const e = lib.allow(file);
  const roots = { clips: dir, replays: dir, highlights: dir, media: lib.resolve };
  const full = scheme.serveStudio(roots, req(e.url));
  assert.equal(full.status, 200);
  assert.equal(full.headers.get("content-type"), "audio/mpeg");
  assert.equal(full.headers.get("access-control-allow-origin"), "*");
  const part = scheme.serveStudio(roots, req(e.url, "bytes=10-14"));
  assert.equal(part.status, 206);
  assert.equal(part.headers.get("content-range"), "bytes 10-14/20");
  assert.equal(Buffer.from(await part.arrayBuffer()).toString(), "abcde");
  assert.equal(scheme.serveStudio(roots, req(`elitlig-studio://media/${"a".repeat(24)}/x.mp3`)).status, 404, "listede yok");
  assert.equal(scheme.serveStudio(roots, req("elitlig-studio://media/..%2F..%2Fetc/passwd")).status, 404);
  assert.equal(scheme.serveStudio({ clips: dir, replays: dir, highlights: dir }, req(e.url)).status, 404, "kütüphane yoksa");
});

test("IPC: studio:media:allow / check / forget ve küçük resimsiz ekran listesi", async (t) => {
  const { registerStudio } = require("../studio");
  const root = tmp();
  const handlers = new Map();
  const ipcMain = { handle: (ch, fn) => handlers.set(ch, fn), on() {} };
  const ses = { setPermissionRequestHandler() {}, setPermissionCheckHandler() {}, setDisplayMediaRequestHandler() {} };
  const app = { getPath: (k) => path.join(root, k), getVersion: () => "2.12.0", isPackaged: false, commandLine: null };
  let thumbSize = null;
  let handled = null;
  const studio = registerStudio({
    ipcMain, api: { request: async () => ({ ok: true, data: {} }), upload: async () => ({ ok: true, data: {} }) }, broadcast() {}, app,
    electronSession: { defaultSession: ses }, systemPreferences: {},
    desktopCapturer: { getSources: async (o) => { thumbSize = o.thumbnailSize; return [{ id: "window:5:0", name: "Skorbord", thumbnail: { isEmpty: () => false, toDataURL: () => "data:x" } }]; } },
    powerSaveBlocker: { start: () => 1, stop() {} }, protocol: { handle: (_s, fn) => { handled = fn; } }, shell: {}, isOwnUrl: (u) => !u || u.startsWith("file:"),
  });
  t.after(() => studio.dispose());
  const ev = { sender: { id: 1, isDestroyed: () => false, getURL: () => "file:///app/index.html" }, senderFrame: { url: "file:///app/index.html" } };
  const file = path.join(root, "klip.webm");
  fs.writeFileSync(file, Buffer.alloc(64, 1));
  const e = await handlers.get("studio:media:allow")(ev, file);
  assert.match(e.url, /^elitlig-studio:\/\/media\/[0-9a-f]{24}\/klip\.webm$/);
  assert.equal(await handlers.get("studio:media:allow")({ ...ev, senderFrame: { url: "https://kotu.example/" } }, file), null, "yabancı çerçeve");
  assert.deepEqual(await handlers.get("studio:media:check")(ev, [e.id]), { [e.id]: true });
  const res = handled({ url: e.url, method: "GET", headers: { get: () => null } });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "video/webm");
  assert.equal(await handlers.get("studio:media:forget")(ev, e.id), true);
  assert.equal(handled({ url: e.url, method: "GET", headers: { get: () => null } }).status, 404);
  const quick = await handlers.get("studio:listScreens")(ev, { thumbnails: false });
  assert.deepEqual(thumbSize, { width: 0, height: 0 });
  assert.equal(quick[0].thumbnail, null);
  await handlers.get("studio:listScreens")(ev);
  assert.deepEqual(thumbSize, { width: 320, height: 180 });
});
