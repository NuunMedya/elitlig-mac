"use strict";
// Ekran Görüntüleri ve Pano rafı: pano kabul kuralları, saklama / çöp, arama,
// depo (ekleme, yinelenen, raftan kaldır + geri al, klasörler), klasör izleme, ayar doğrulama.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const rules = require("../shelf/rules");
const { createShelfStore } = require("../shelf/store");
const { watchFolders, listRecent, watchClipboard, screenshotDir } = require("../shelf/watchers");
const { mergeSettings, migrateSettings, publicItem, DEFAULT_SETTINGS } = require("../shelf");

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "shelf-"));
const DAY = 86400000;
const ALL = { image: true, text: true, link: true };

test("pano: parola yöneticisi (gizli) içerik ve Finder dosyaları alınmaz", () => {
  assert.deepEqual(rules.classifyClipboard({ formats: ["text/plain", "org.nspasteboard.ConcealedType"], text: "s3cr3t" }, ALL), { skip: "concealed" });
  assert.deepEqual(rules.classifyClipboard({ formats: ["text/plain", "ExcludeClipboardContentFromMonitorProcessing"], text: "x" }, ALL), { skip: "concealed" });
  assert.deepEqual(rules.classifyClipboard({ formats: ["public.file-url", "image/png"], text: "", hasImage: true }, ALL), { skip: "files" });
});

test("pano: tek başına adres bağlantıdır, paragraf metindir; kaynaklar ayrı ayrı açılır", () => {
  const defaults = { image: false, text: false, link: true };
  assert.deepEqual(rules.classifyClipboard({ formats: ["text/plain"], text: "  https://elitlig.com/maclar?id=3 " }, defaults), { kind: "link", text: "https://elitlig.com/maclar?id=3" });
  assert.deepEqual(rules.classifyClipboard({ formats: ["text/plain"], text: "Şuraya bak: https://elitlig.com" }, defaults), { skip: "disabled" });
  assert.equal(rules.classifyClipboard({ formats: ["text/plain"], text: "Şuraya bak: https://elitlig.com" }, ALL).kind, "text");
  assert.deepEqual(rules.classifyClipboard({ formats: ["image/png"], text: "", hasImage: true }, defaults), { skip: "disabled" });
  assert.equal(rules.classifyClipboard({ formats: ["image/png"], text: "", hasImage: true }, ALL).kind, "image");
  assert.deepEqual(rules.classifyClipboard({ formats: [], text: "   " }, ALL), { skip: "empty" });
  assert.equal(rules.isStandaloneUrl("ftp://x.com"), false);
  assert.equal(rules.isStandaloneUrl("https://localhost"), true);
  assert.equal(rules.isStandaloneUrl("https://a b.com"), false);
});

test("saklama: süre türe göre; sabit / klasörlü / etiketli kalır; çöp 30 günde silinir", () => {
  const now = 100 * DAY;
  const items = [
    { id: "a", kind: "image", createdAt: now - 8 * DAY },
    { id: "b", kind: "image", createdAt: now - 8 * DAY, pinned: true },
    { id: "c", kind: "text", createdAt: now - 8 * DAY, folderId: "f" },
    { id: "d", kind: "link", createdAt: now - 8 * DAY, tags: ["iş"] },
    { id: "e", kind: "text", createdAt: now - 2 * DAY },
    { id: "f", kind: "link", createdAt: now - 40 * DAY, copiedAt: now - DAY },
    { id: "g", kind: "text", createdAt: now - 60 * DAY, trashedAt: now - 31 * DAY },
    { id: "h", kind: "text", createdAt: now - 60 * DAY, trashedAt: now - 3 * DAY },
  ];
  assert.deepEqual(rules.sweep(items, { image: 7, text: 1, link: 30 }, now), { expire: ["a", "e"], purge: ["g"] });
  assert.equal(rules.clampRetention(5), 30);
});

test("arama: Türkçe büyük/küçük harf ve aksan duyarsız; #etiket; tüm sözcükler", () => {
  const item = { kind: "text", text: "İSTANBUL saha kirası", title: "Ödeme", tags: ["Muhasebe"], note: "Kasım" };
  assert.equal(rules.matches(item, "istanbul"), true);
  assert.equal(rules.matches(item, "odeme kasim"), true);
  assert.equal(rules.matches(item, "#muhasebe"), true);
  assert.equal(rules.matches(item, "#muh"), true);
  assert.equal(rules.matches(item, "istanbul ankara"), false);
  assert.equal(rules.matches({ kind: "link", url: "https://www.youtube.com/watch?v=1", linkTitle: "Maç özeti" }, "youtube ozet"), true);
});

test("süzgeç: raf / kütüphane / çöp; sabitlenenler kütüphanede başta", () => {
  const items = [
    { id: "1", kind: "image", onShelf: true, createdAt: 3 },
    { id: "2", kind: "image", onShelf: false, pinned: true, createdAt: 1 },
    { id: "3", kind: "text", onShelf: true, createdAt: 2, folderId: "f1" },
    { id: "4", kind: "text", onShelf: false, trashedAt: 9, createdAt: 4 },
  ];
  assert.deepEqual(rules.filterItems(items, { scope: "shelf" }).map((i) => i.id), ["1", "3"]);
  assert.deepEqual(rules.filterItems(items, { scope: "library" }).map((i) => i.id), ["2", "1", "3"]);
  assert.deepEqual(rules.filterItems(items, { scope: "trash" }).map((i) => i.id), ["4"]);
  assert.deepEqual(rules.filterItems(items, { folderId: "none" }).map((i) => i.id), ["2", "1"]);
  assert.deepEqual(rules.filterItems(items, { kind: "image", pinned: true }).map((i) => i.id), ["2"]);
  assert.equal(rules.nextSelection(items, ["1"], 0), "2");
  assert.equal(rules.nextSelection(items.slice(0, 2), ["2"], 1), "1");
  assert.equal(rules.wouldCycle([{ id: "a", parentId: null }, { id: "b", parentId: "a" }], "a", "b"), true);
});

test("ekran görüntüsü dosya adları (Mac / Windows dilleri)", () => {
  assert.equal(rules.isScreenshotFile("Ekran Resmi 2026-11-10 14.22.01.png"), true);
  assert.equal(rules.isScreenshotFile("Screenshot 2026-11-10 at 14.22.01.png"), true);
  assert.equal(rules.isScreenshotFile(".Screenshot 2026.png"), false, "gizli geçici ad");
  assert.equal(rules.isScreenshotFile("tatil.png"), false);
  assert.equal(rules.isScreenshotFile("tatil.png", { screenshotsOnly: false }), true);
  assert.equal(rules.isScreenshotFile("Screenshot.txt"), false);
});

/* ---------------------------------- depo ---------------------------------- */

const fakeThumb = (src, dest) => { fs.copyFileSync(src, dest); return { width: 10, height: 8 }; };

test("depo: görsel kopyalanır (özgün dosyaya dokunulmaz), yinelenen tek kayıt olur", () => {
  const dir = tmp();
  const src = path.join(tmp(), "Ekran Resmi 1.png");
  fs.writeFileSync(src, "PNGDATA");
  let t = 1000;
  const store = createShelfStore({ dir, makeThumb: fakeThumb, now: () => t });
  const { item } = store.addImage({ from: src, ext: "png", source: "screenshot", origPath: src });
  assert.equal(item.width, 10);
  assert.ok(fs.existsSync(store.filePath(item)));
  assert.notEqual(store.filePath(item), src);
  t = 2000;
  const again = store.addImage({ from: src, ext: "png", source: "screenshot", origPath: src });
  assert.equal(again.duplicate, true);
  assert.equal(again.item.copiedAt, 2000);
  const pub = publicItem(store.get(item.id), { exists: () => true });
  assert.match(pub.imageUrl, /^elitlig-file:\/\/shelf\/[0-9a-z]+\/image\?v=/);
  assert.equal(pub.file, undefined, "iç dosya adları arayüze gitmez");
  store.purge([item.id]);
  assert.ok(fs.existsSync(src), "kalıcı silmede ekran görüntüsünün özgün dosyası kalır");
});

test("depo: metin yinelenmez; raftan kaldır → kaydedilen kütüphanede kalır, geçici çöpe; ⌫ geri alır", () => {
  const store = createShelfStore({ dir: tmp(), makeThumb: fakeThumb });
  const a = store.addText("merhaba dünya").item;
  assert.equal(store.addText("merhaba dünya\r\n").duplicate, true);
  const l = store.addText("https://elitlig.com").item;
  assert.equal(l.kind, "link");
  assert.equal(l.domain, "elitlig.com");
  store.update(l.id, { pinned: true });
  assert.equal(store.takeDown([a.id, l.id]), 2);
  assert.ok(store.get(a.id).trashedAt, "geçici öğe çöpe");
  assert.equal(store.get(l.id).trashedAt, null, "sabit öğe kütüphanede");
  assert.equal(store.get(l.id).onShelf, false);
  assert.deepEqual(store.undoTakeDown().sort(), [a.id, l.id].sort());
  assert.equal(store.get(a.id).trashedAt, null);
  assert.equal(store.get(a.id).onShelf, true);
  assert.equal(store.canUndo(), false);
  const note = store.addText("not metni", { source: "note", title: "Toplantı" }).item;
  assert.equal(note.onShelf, false, "notlar raflara düşmez");
});

test("depo: klasörler (sanal), etiketler, toplu güncelleme, sayaçlar, kalıcılık", () => {
  const dir = tmp();
  const store = createShelfStore({ dir, makeThumb: fakeThumb });
  const f = store.createFolder("Maçlar");
  const sub = store.createFolder("2026", f.id);
  const a = store.addText("bir").item;
  const b = store.addText("iki").item;
  store.updateMany([a.id, b.id], { folderId: sub.id, addTags: ["#önemli", "önemli", "  "] });
  assert.deepEqual(store.get(a.id).tags, ["önemli"]);
  assert.throws(() => store.moveFolder(f.id, sub.id), /kendi içine/);
  const c = store.counts();
  assert.equal(c.folders[sub.id], 2);
  assert.equal(c.tags["önemli"], 2);
  store.deleteFolder(f.id);
  assert.equal(store.folders().find((x) => x.id === sub.id).parentId, null, "alt klasör üste çıkar");
  store.deleteFolder(sub.id);
  assert.equal(store.get(a.id).folderId, null, "öğeler silinmez");
  assert.throws(() => store.update(a.id, { folderId: "yok" }), /bulunamadı/);
  store.flush();
  const reopened = createShelfStore({ dir, makeThumb: fakeThumb });
  assert.equal(reopened.list({ scope: "library" }).total, 2);
});

test("depo: saklama taraması çöpe taşır ve eskiyi siler; sayfalama", () => {
  let t = 0;
  const store = createShelfStore({ dir: tmp(), makeThumb: fakeThumb, now: () => t });
  for (let i = 0; i < 5; i += 1) store.addText(`metin ${i}`);
  const keep = store.addText("kalsın").item;
  store.update(keep.id, { tags: ["arşiv"] });
  t = 8 * DAY;
  assert.deepEqual(store.runSweep({ text: 7 }), { expired: 5, purged: 0 });
  assert.equal(store.list({ scope: "library" }).total, 1);
  t = 40 * DAY;
  assert.deepEqual(store.runSweep({ text: 7 }), { expired: 0, purged: 5 });
  const page = store.list({ scope: "library" }, { offset: 0, limit: 1 });
  assert.equal(page.items.length, 1);
});

test("depo: düzenlenmiş görsel ayrı dosya; özgüne dönülebilir", () => {
  const store = createShelfStore({ dir: tmp(), makeThumb: fakeThumb });
  const { item } = store.addImage({ buffer: Buffer.from("ORIG"), ext: "png" });
  store.saveEdit(item.id, Buffer.from("EDIT"));
  assert.equal(fs.readFileSync(store.filePath(store.get(item.id)), "utf8"), "EDIT");
  assert.equal(fs.readFileSync(store.filePath(store.get(item.id), "original"), "utf8"), "ORIG");
  store.revertEdit(item.id);
  assert.equal(fs.readFileSync(store.filePath(store.get(item.id)), "utf8"), "ORIG");
});

/* -------------------------------- izleyiciler -------------------------------- */

test("klasör izleme: yeni ekran görüntüsü alınır, eski / gizli / ekran görüntüsü olmayan alınmaz", async () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, "Screenshot eski.png"), "x");
  const old = new Date(Date.now() - 3 * DAY);
  fs.utimesSync(path.join(dir, "Screenshot eski.png"), old, old);
  const got = [];
  const w = watchFolders({ dirs: [{ path: dir, screenshotsOnly: true }], onFile: (p) => got.push(path.basename(p)), since: Date.now() - 1000, settleMs: 50, scanEveryMs: 200 });
  fs.writeFileSync(path.join(dir, ".Screenshot gizli.png"), "x");
  fs.writeFileSync(path.join(dir, "tatil.png"), "x");
  fs.writeFileSync(path.join(dir, "Ekran Resmi 2026-11-10.png"), "PNG");
  await new Promise((r) => setTimeout(r, 900));
  w.stop();
  assert.deepEqual(got, ["Ekran Resmi 2026-11-10.png"]);
  assert.deepEqual(listRecent(dir, { days: 1 }).map((f) => path.basename(f.path)), ["Ekran Resmi 2026-11-10.png"]);
  assert.equal(listRecent(dir, { days: 7 }).length, 2);
});

// Electron 44 pano API'sini (eşzamansız, W3C ClipboardItem) taklit eden sahte pano.
function fakeAsyncClipboard() {
  const state = { types: ["text/plain"], text: "başlangıç", png: null, raw: {}, reads: 0, writes: [] };
  const item = () => ({
    types: [...state.types, ...Object.keys(state.raw).map((k) => `electron application/osclipboard;format="${k}"`)],
    getType: async (t) => {
      if (t === "text/plain") { state.reads += 1; return new Blob([state.text]); }
      if (t === "image/png") { state.reads += 1; return new Blob([state.png]); }
      const m = t.match(/format="(.*)"/);
      if (m && state.raw[m[1]] != null) return new Blob([state.raw[m[1]]]);
      throw new Error("yok");
    },
  });
  const clipboard = {
    read: async () => [item()],
    readText: async () => state.text,
    writeText: async (t) => { state.writes.push({ "text/plain": t }); },
    write: async (items) => { state.writes.push(items[0].data); },
  };
  class ClipboardItem { constructor(data) { this.data = data; } }
  return { state, clipboard, ClipboardItem };
}

test("pano yoklayıcısı (Electron 44 eşzamansız API): metin / bağlantı / görsel alınır; açılıştaki içerik ve kendi kopyamız alınmaz; gizli içerik okunmaz", async () => {
  const { state, clipboard, ClipboardItem } = fakeAsyncClipboard();
  assert.equal(typeof clipboard.availableFormats, "undefined", "yeni API'de eşzamanlı availableFormats yok");
  const got = [];
  const src = { text: true, link: true, image: true };
  const w = watchClipboard({ clipboard, ClipboardItem, sources: () => src, onCapture: (c) => got.push(c) });
  await w.tick();
  assert.equal(got.length, 0, "açılıştaki içerik alınmaz");
  state.text = "Toplantı notu: Cumartesi 10:00";
  await w.tick();
  assert.deepEqual(got, [{ kind: "text", text: "Toplantı notu: Cumartesi 10:00" }]);
  state.text = "https://elitlig.com";
  await w.tick();
  assert.deepEqual(got[1], { kind: "link", text: "https://elitlig.com" });
  state.types = ["image/png"];
  state.text = "";
  state.png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
  await w.tick();
  assert.equal(got[2].kind, "image");
  assert.ok(Buffer.isBuffer(got[2].png) && got[2].png.length === 7);
  state.png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 9, 9, 9]);
  await w.tick();
  assert.equal(got.length, 4, "aynı biçimde ikinci (farklı) görsel de alınır");
  w.markOwnWrite();
  state.types = ["text/plain"];
  state.text = "kendi kopyamız";
  await w.tick();
  assert.equal(got.length, 4);
  const before = state.reads;
  state.raw = { "org.nspasteboard.ConcealedType": "" };
  state.text = "parola";
  await w.tick();
  assert.equal(state.reads, before, "gizli içerik okunmaz");
  assert.equal(got.length, 4);
  // Üst üste binen yoklamalar tek okumaya iner.
  const a = w.tick();
  const b = w.tick();
  assert.equal(a, b);
  await a;
});

test("pano yoklayıcısı: eski (eşzamanlı) Electron API'si de desteklenir", async () => {
  let formats = ["text/plain"];
  let txt = "başlangıç";
  let reads = 0;
  const clipboard = { availableFormats: () => formats, readText: () => { reads += 1; return txt; }, readImage: () => ({ isEmpty: () => true }) };
  const got = [];
  const w = watchClipboard({ clipboard, sources: () => ({ text: true, link: true, image: false }), onCapture: (c) => got.push(c) });
  await w.tick();
  assert.equal(got.length, 0);
  txt = "https://elitlig.com";
  await w.tick();
  assert.deepEqual(got, [{ kind: "link", text: "https://elitlig.com" }]);
  const before = reads;
  formats = ["text/plain", "org.nspasteboard.ConcealedType"];
  txt = "parola";
  await w.tick();
  assert.equal(reads, before, "gizli içerik okunmaz");
  assert.equal(got.length, 1);
});

test("clipboardIo: ham biçimler sadeleşir; yazma ClipboardItem ile (metin, görsel, bağlantı, ham)", async () => {
  const { createClipboardIo, normalizeTypes } = require("../clipboardIo");
  assert.deepEqual(normalizeTypes(["text/plain", 'electron application/osclipboard;format="NSFilenamesPboardType"', "text/plain"]), ["text/plain", "NSFilenamesPboardType"]);
  const { state, clipboard, ClipboardItem } = fakeAsyncClipboard();
  const io = createClipboardIo({ clipboard, ClipboardItem });
  assert.equal(io.legacy, false);
  state.raw = { "FileNameW": Buffer.from("C:\\a.png\0", "utf16le") };
  assert.ok((await io.formats()).includes("FileNameW"));
  assert.equal((await io.readRaw("FileNameW")).toString("utf16le").replace(/\0+$/, ""), "C:\\a.png");
  assert.equal(await io.readImagePng(), null);
  await io.writeText("merhaba");
  await io.writeImage(Buffer.from([1, 2]), { text: "alt" });
  await io.writeLink("https://elitlig.com", "Elitlig");
  await io.writeRaw({ NSFilenamesPboardType: "<plist/>" });
  assert.deepEqual(state.writes[0], { "text/plain": "merhaba" });
  assert.equal(state.writes[1]["text/plain"], "alt");
  assert.ok(state.writes[1]["image/png"] instanceof Blob);
  assert.deepEqual(state.writes[2]["electron application/bookmark"], { title: "Elitlig", url: "https://elitlig.com" });
  assert.equal(state.writes[3]['electron application/osclipboard;format="NSFilenamesPboardType"'], "<plist/>");
});

test("ekran görüntüsü klasörü: Mac'te özel konum, yoksa Masaüstü; Windows'ta Resimler\\Screenshots", async () => {
  const custom = tmp();
  const mac = await screenshotDir({ platform: "darwin", desktopDir: "/D", execImpl: (_f, _a, _o, cb) => cb(null, `${custom}\n`) });
  assert.deepEqual(mac, { path: custom, custom: true });
  const fallback = await screenshotDir({ platform: "darwin", desktopDir: "/D", execImpl: (_f, _a, _o, cb) => cb(new Error("yok")) });
  assert.deepEqual(fallback, { path: "/D", custom: false });
  const win = await screenshotDir({ platform: "win32", picturesDir: "/P" });
  assert.equal(win.path, path.join("/P", "Screenshots"));
});

test("ayarlar: kaynak / saklama / klasör / kısayol doğrulaması", () => {
  const s = mergeSettings(DEFAULT_SETTINGS, { sources: { text: true, image: "evet" }, retention: { image: 7, text: 99 }, extraDirs: ["/a", "rel", "/b", "/c", "/d", "/a"], shortcuts: { toggle: "Control+Alt+K" }, enrichLinks: true });
  assert.equal(s.sources.text, true);
  assert.equal(s.sources.image, false);
  assert.equal(s.sources.link, true, "varsayılan: bağlantılar açık");
  assert.deepEqual(s.retention, { image: 7, text: 30, link: 30 });
  assert.deepEqual(s.extraDirs, ["/a", "/b", "/c"]);
  assert.equal(s.shortcuts.toggle, "Control+Alt+K");
  assert.equal(s.shortcuts.search, "Control+Alt+S");
  assert.equal(DEFAULT_SETTINGS.sources.text, true, "varsayılan: kopyalanan metinler tutulur");
  assert.equal(DEFAULT_SETTINGS.sources.image, false, "varsayılan: kopyalanan görseller kapalı (ilk açılış kartında sorulur)");
  assert.equal(DEFAULT_SETTINGS.onboarded, false);
  assert.equal(mergeSettings(DEFAULT_SETTINGS, { onboarded: true }).onboarded, true);
});

test("ayar göçü: sürüm 1 dosyasında metin toplama açılır; sürüm 2'de kullanıcı seçimi korunur", () => {
  const v1 = migrateSettings({ sources: { screenshots: true, image: false, text: false, link: true }, since: 5 });
  assert.equal(v1.sources.text, true);
  assert.equal(v1.version, 2);
  assert.equal(v1.since, 5);
  const v2 = migrateSettings({ version: 2, sources: { text: false } });
  assert.equal(v2.sources.text, false, "sürüm 2'de kapatılan metin toplama kapalı kalır");
  assert.deepEqual(migrateSettings(null), {});
});
