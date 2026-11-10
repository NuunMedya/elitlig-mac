"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const L = require("../windowLayouts");

const display = (id, x, y, w, h, { menu = 0, dock = 0, scale = 1 } = {}) => ({
  id, scaleFactor: scale, bounds: { x, y, width: w, height: h }, workArea: { x, y: y + menu, width: w, height: h - menu - dock },
});
// MacBook (Retina, 1512×982 nokta; menü çubuğu 33, Dock 70) — birincil.
const MBP = display(1, 0, 0, 1512, 982, { menu: 33, dock: 70, scale: 2 });
// Solunda 1920×1080 ikinci ekran (negatif x), üst kenarı yukarıda (negatif y).
const LEFT = display(2, -1920, -98, 1920, 1080, { menu: 25 });
const win = { x: 100, y: 120, width: 800, height: 600 };

test("yarımlar çalışma alanını menü çubuğu ve Dock hariç böler", () => {
  const left = L.computeLayout("leftHalf", win, [MBP]).rect;
  const right = L.computeLayout("rightHalf", win, [MBP]).rect;
  assert.deepEqual(left, { x: 0, y: 33, width: 756, height: 879 });
  assert.deepEqual(right, { x: 756, y: 33, width: 756, height: 879 });
  const top = L.computeLayout("topHalf", win, [MBP]).rect;
  const bottom = L.computeLayout("bottomHalf", win, [MBP]).rect;
  assert.equal(top.y + top.height, bottom.y, "üst ve alt yarı aralıksız birleşir");
  assert.equal(bottom.y + bottom.height, 33 + 879);
  assert.deepEqual(L.computeLayout("maximize", win, [MBP]).rect, MBP.workArea);
});

test("tek sayılı genişlikte üçte birler ve üçte ikiler aralıksız ve taşmasız", () => {
  const odd = display(1, 0, 0, 1001, 777);
  const d = [odd];
  const l = L.computeLayout("leftThird", win, d).rect;
  const c = L.computeLayout("centerThird", win, d).rect;
  const r = L.computeLayout("rightThird", win, d).rect;
  assert.equal(l.x, 0);
  assert.equal(l.x + l.width, c.x);
  assert.equal(c.x + c.width, r.x);
  assert.equal(r.x + r.width, 1001);
  for (const x of [l, c, r]) assert.ok(Number.isInteger(x.x) && Number.isInteger(x.width));
  const l2 = L.computeLayout("leftTwoThirds", win, d).rect;
  const r2 = L.computeLayout("rightTwoThirds", win, d).rect;
  assert.equal(l2.x + l2.width, r.x, "sol üçte iki, sağ üçte birle birleşir");
  assert.equal(r2.x, c.x, "sağ üçte iki, orta üçte birden başlar");
  assert.equal(r2.x + r2.width, 1001);
  // Tek sayılı genişlikte yarımlar: 500 + 501
  const lh = L.computeLayout("leftHalf", win, d).rect;
  const rh = L.computeLayout("rightHalf", win, d).rect;
  assert.equal(lh.width + rh.width, 1001);
  assert.equal(lh.x + lh.width, rh.x);
});

test("çeyrekler dört köşeyi kaplar", () => {
  const q = ["topLeft", "topRight", "bottomLeft", "bottomRight"].map((k) => L.computeLayout(k, win, [MBP]).rect);
  const total = q.reduce((s, r) => s + r.width * r.height, 0);
  assert.equal(total, MBP.workArea.width * MBP.workArea.height);
  assert.equal(q[0].x + q[0].width, q[1].x);
  assert.equal(q[0].y + q[0].height, q[2].y);
});

test("negatif koordinatlı ikinci ekranda düzen o ekranın çalışma alanına göre", () => {
  const onLeft = { x: -1500, y: 100, width: 700, height: 500 };
  const res = L.computeLayout("rightHalf", onLeft, [MBP, LEFT]);
  assert.equal(res.display.id, 2);
  assert.deepEqual(res.rect, { x: -960, y: -73, width: 960, height: 1055 });
  const q = L.computeLayout("topLeft", onLeft, [MBP, LEFT]).rect;
  assert.deepEqual(q, { x: -1920, y: -73, width: 960, height: 528 });
});

test("pencere iki ekran arasındaysa en çok örtüşen ekran seçilir; hiçbirinde değilse en yakın", () => {
  const straddle = { x: -300, y: 100, width: 1000, height: 400 }; // 700 px birincilde
  assert.equal(L.displayForRect([MBP, LEFT], straddle).id, 1);
  const lost = { x: 5000, y: 5000, width: 100, height: 100 };
  assert.equal(L.displayForRect([LEFT, MBP], lost).id, 1);
});

test("ortala: boyut korunur, büyükse sığdırılır", () => {
  assert.deepEqual(L.computeLayout("center", win, [MBP]).rect, { x: 356, y: 173, width: 800, height: 600 });
  const huge = { x: 0, y: 0, width: 3000, height: 2000 };
  assert.deepEqual(L.computeLayout("center", huge, [MBP]).rect, MBP.workArea);
  assert.ok(L.computeLayout("center", null, [MBP]).error);
});

test("sonraki / önceki ekran: göreli konum korunur, ekranlar soldan sağa döner", () => {
  const leftHalfMbp = L.computeLayout("leftHalf", win, [MBP]).rect;
  const moved = L.computeLayout("nextDisplay", leftHalfMbp, [MBP, LEFT]);
  // Sıra: LEFT (-1920), MBP (0) → MBP'den sonra başa (LEFT) döner.
  assert.equal(moved.display.id, 2);
  assert.deepEqual(moved.rect, { x: -1920, y: -73, width: 960, height: 1055 });
  const back = L.computeLayout("prevDisplay", moved.rect, [MBP, LEFT]);
  assert.equal(back.display.id, 1);
  assert.deepEqual(back.rect, leftHalfMbp);
  assert.ok(L.computeLayout("nextDisplay", win, [MBP]).error, "tek ekranda hata");
});

test("Retina ölçeği nokta koordinatlarını değiştirmez; sonuçlar tam sayı", () => {
  const retina = display(1, 0, 0, 1440, 900, { menu: 25, scale: 2 });
  const plain = display(1, 0, 0, 1440, 900, { menu: 25, scale: 1 });
  for (const l of L.LAYOUTS.filter((x) => x.rect)) {
    const a = L.computeLayout(l.key, win, [retina]).rect;
    assert.deepEqual(a, L.computeLayout(l.key, win, [plain]).rect);
    assert.ok(Object.values(a).every(Number.isInteger), l.key);
  }
});

test("boşluk (gap): kenarda tam, iki pencere arasında toplam bir boşluk", () => {
  const d = [display(1, 0, 0, 1000, 800)];
  const l = L.computeLayout("leftHalf", win, d, { gap: 10 }).rect;
  const r = L.computeLayout("rightHalf", win, d, { gap: 10 }).rect;
  assert.equal(l.x, 10);
  assert.equal(r.x - (l.x + l.width), 10);
  assert.equal(1000 - (r.x + r.width), 10);
});

test("geri al kaydı: art arda düzenlerde ilk konum korunur, sonra geri dönülür", () => {
  let h = {};
  const a = L.computeLayout("leftHalf", win, [MBP]).rect;
  h = L.rememberBefore(h, "w1", win, a, 1);
  const b = L.computeLayout("rightHalf", a, [MBP]).rect;
  h = L.rememberBefore(h, "w1", a, b, 2);
  assert.deepEqual(h.w1.original, win, "ikinci düzende ilk konum kalır");
  const back = L.computeLayout("restore", b, [MBP], { previous: h.w1.original });
  assert.deepEqual(back.rect, win);
  // Kullanıcı pencereyi elle taşıdıysa yeni konum "önceki" olur.
  const manual = { x: 300, y: 300, width: 500, height: 400 };
  h = L.rememberBefore(h, "w1", manual, a, 3);
  assert.deepEqual(h.w1.original, manual);
  assert.ok(L.computeLayout("restore", a, [MBP]).error);
  // Sınır: en eski kayıtlar atılır.
  let many = {};
  for (let i = 0; i < 60; i += 1) many = L.rememberBefore(many, `w${i}`, win, a, i, 50);
  assert.equal(Object.keys(many).length, 50);
  assert.ok(!many.w0 && many.w59);
});

test("Windows görünmez kenar payı ve DIP / fiziksel dönüşüm", () => {
  const outer = { x: 93, y: 0, width: 974, height: 727 };
  const frame = { x: 100, y: 0, width: 960, height: 720 };
  const b = L.invisibleBorders(outer, frame);
  assert.deepEqual(b, { left: 7, top: 0, right: 7, bottom: 7 });
  assert.deepEqual(L.expandByBorders({ x: 0, y: 0, width: 960, height: 1040 }, b), { x: -7, y: 0, width: 974, height: 1047 });
  const d150 = display(1, 0, 0, 2560, 1440, { scale: 1.5 });
  const phys = L.dipToPhysical({ x: 100, y: 50, width: 853, height: 480 }, d150);
  assert.deepEqual(phys, { x: 150, y: 75, width: 1280, height: 720 });
  assert.deepEqual(L.physicalToDip(phys, d150), { x: 100, y: 50, width: 853, height: 480 });
});

test("kısayol doğrulama, varsayılanlar ve çakışmalar", () => {
  assert.ok(L.isValidAccelerator("Control+Alt+Left"));
  assert.ok(L.isValidAccelerator("Control+Alt+Return"));
  assert.ok(L.isValidAccelerator("F13"));
  assert.ok(L.isValidAccelerator("MediaPlayPause"));
  assert.ok(!L.isValidAccelerator("A"), "değiştiricisiz harf olmaz");
  assert.ok(!L.isValidAccelerator("Control+Control+A"));
  assert.ok(!L.isValidAccelerator("Control+Alt+"));
  assert.ok(!L.isValidAccelerator("Control+Alt+Left; rm -rf"));
  const mac = L.defaultShortcuts("darwin");
  const winD = L.defaultShortcuts("win32");
  assert.equal(mac.nextDisplay, "Control+Alt+Command+Right");
  assert.equal(winD.nextDisplay, "Control+Alt+Shift+Right");
  assert.ok(!Object.values(mac).includes("Control+Alt+T"), "⌃⌥T başka araca ayrıldı");
  assert.ok(!Object.values(mac).includes("Control+Alt+S") && !Object.values(mac).includes("Control+Alt+A"));
  const s = L.normalizeSettings({ layouts: { shortcuts: { leftHalf: "", rightHalf: "çöp", topHalf: "Control+Alt+Left" }, gap: 999 }, toolkit: { shortcut: "Control+Alt+Space" }, music: { studioRule: "x" } }, "darwin");
  assert.equal(s.layouts.shortcuts.leftHalf, "", "boş = kapalı");
  assert.equal(s.layouts.shortcuts.rightHalf, "Control+Alt+Right", "geçersiz → varsayılan");
  assert.equal(s.layouts.gap, 40);
  assert.equal(s.music.studioRule, "pause");
  assert.equal(s.music.mediaKeys, true);
  const conflicts = L.findConflicts(L.normalizeSettings(null, "darwin"));
  assert.deepEqual(conflicts, {});
  const c2 = L.findConflicts(L.normalizeSettings({ layouts: { shortcuts: { topHalf: "Control+Alt+Right" } } }, "darwin"));
  assert.deepEqual(Object.values(c2)[0].sort(), ["rightHalf", "topHalf"]);
  const all = Object.values(L.defaultShortcuts("darwin"));
  assert.equal(new Set(all).size, all.length, "varsayılanlar birbirine çakışmaz");
  assert.ok(!all.includes("Control+Alt+Space") && !all.includes("Control+Alt+N"));
});

test("kısayol etiketleri", () => {
  assert.equal(L.acceleratorLabel("Control+Alt+Left", "darwin"), "⌃⌥←");
  assert.equal(L.acceleratorLabel("Control+Alt+Return", "darwin"), "⌃⌥↩");
  assert.equal(L.acceleratorLabel("Control+Alt+Backspace", "win32"), "Ctrl+Alt+Backspace");
  assert.equal(L.acceleratorLabel("Control+Alt+Command+Right", "darwin"), "⌃⌥⌘→");
  assert.equal(L.acceleratorLabel("", "darwin"), "");
});
