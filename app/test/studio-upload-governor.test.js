// [gol-klip] Yayın öncelikli yükleme: ana süreç hız yöneticisi (app/studio/uploadgov.js) —
// değişken hız, duraklatma (bağlantıyı canlı tutan küçük dilimler), bayatlama, iptal, ölçüm.
const test = require("node:test");
const assert = require("node:assert/strict");
const { createUploadGovernor, KEEPALIVE_MS } = require("../studio/uploadgov");

function clock() {
  let t = 0;
  // sahte saat: bekleme bir makro görev verir (mikro görev döngüsünde takılmasın)
  return { now: () => t, sleep: (ms) => new Promise((r) => setImmediate(() => { t += Math.max(1, ms); r(); })), advance: (ms) => { t += ms; } };
}

/** Akışa veri yaz, çıkan dilimleri topla. */
function run(stream, bytes) {
  return new Promise((resolve, reject) => {
    const out = [];
    stream.on("data", (d) => out.push(d.length));
    stream.on("end", () => resolve(out));
    stream.on("error", reject);
    stream.end(Buffer.alloc(bytes));
  });
}

test("arayüz sessizken varsayılan (yayında güvenli hız, değilse sınırsız)", () => {
  const c = clock();
  const g = createUploadGovernor(c);
  assert.deepEqual(g.effective(0), { bytesPerSec: 0, paused: false });
  assert.deepEqual(g.effective(250 * 1024), { bytesPerSec: 250 * 1024, paused: false });
  g.set({ kbps: 512 });
  assert.deepEqual(g.effective(250 * 1024), { bytesPerSec: 64000, paused: false });
  c.advance(16_000); // 15 sn haber yok → varsayılana dön
  assert.deepEqual(g.effective(250 * 1024), { bytesPerSec: 250 * 1024, paused: false });
  g.set({ kbps: 512 });
  g.set({ reset: true });
  assert.equal(g.state().explicit, false);
});

test("hız sınırı: 128 KB 64 KB/sn ile ≈ 2 sn sürer", async () => {
  const c = clock();
  const g = createUploadGovernor(c);
  g.set({ bytesPerSec: 64 * 1024 });
  const t0 = c.now();
  const parts = await run(g.stream(() => 0), 128 * 1024);
  assert.equal(parts.reduce((a, b) => a + b, 0), 128 * 1024);
  const took = c.now() - t0;
  assert.ok(took >= 1400 && took <= 2600, `süre ${took}`);
});

test("duraklatılınca yalnız canlı tutma dilimleri gider; devam edince kalan akar", async () => {
  const c = clock();
  const g = createUploadGovernor(c);
  g.set({ kbps: 0, paused: true });
  const s = g.stream(() => 0);
  const got = [];
  s.on("data", (d) => got.push({ at: c.now(), n: d.length }));
  const done = new Promise((r) => s.on("end", r));
  s.end(Buffer.alloc(64 * 1024));
  // duraklatma sürerken: arayüz her saniye durumu yeniler (bayatlamasın)
  while (c.now() < 20_000) { await new Promise((r) => setImmediate(r)); g.set({ kbps: 0, paused: true }); }
  const during = got.reduce((a, b) => a + b.n, 0);
  assert.ok(during > 0 && during <= 4 * 512, `duraklatmada ${during} bayt`);
  assert.ok(got.every((x, i) => i === 0 || x.at - got[i - 1].at >= KEEPALIVE_MS - 1));
  g.set({ kbps: 0, paused: false });
  await done;
  assert.equal(got.reduce((a, b) => a + b.n, 0), 64 * 1024);
});

test("iptal: sürmekte olan ve kısa süre yeni akışlar hata ile kesilir", async () => {
  const c = clock();
  const g = createUploadGovernor(c);
  g.set({ kbps: 0, paused: true });
  const s = g.stream(() => 0);
  const err = new Promise((r) => s.on("error", r));
  s.on("data", () => {});
  s.write(Buffer.alloc(32 * 1024));
  await new Promise((r) => setImmediate(r));
  g.set({ cancel: true });
  c.advance(1000);
  assert.match((await err).message, /iptal/);
  const s2 = g.stream(() => 0);
  const err2 = new Promise((r) => s2.on("error", r));
  s2.end(Buffer.alloc(10));
  assert.match((await err2).message, /iptal/);
  assert.equal(g.state().cancelled, true);
  g.set({ reset: true });
  assert.equal(g.state().cancelled, false);
});

test("ölçülen hız (son 5 sn) arayüze döner", async () => {
  const c = clock();
  const g = createUploadGovernor(c);
  g.set({ bytesPerSec: 125_000 }); // 1000 kbit/sn
  await run(g.stream(() => 0), 250_000);
  const k = g.state().measuredKbps;
  assert.ok(k > 600 && k < 1400, `ölçüm ${k}`);
});
