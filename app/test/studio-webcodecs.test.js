"use strict";
// Tek kodlama (WebCodecs) yolu — motor: kopya komutu, kodlama yolu değişimi, geri düşüş,
// bölünmüş başlık, tanılama sayaçları; aktarıcı: bit hızına göre atlama eşiği.
// Gerçek ffmpeg ile uçtan uca: renderer/test/studio-webcodecs.test.js (mkvmux → kopya → tee).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { EventEmitter } = require("node:events");
const { createStudioEngine } = require("../studio/engine");
const { createRelay } = require("../studio/relay");

const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));
const at = (args, flag) => args[args.indexOf(flag) + 1];
const HEADER = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3]);
const tick = () => new Promise((r) => setImmediate(r));
const progress = (child, ms) => child.stdout.emit("data", `frame=1\nfps=30\nout_time_us=${ms * 1000}\nspeed=1.0x\ndrop_frames=0\nprogress=continue\n`);
const stderr = (child, text) => child.stderr.emit("data", `${text}\n`);

function fakeSpawn() {
  const children = [];
  const spawnImpl = (file, args) => {
    const child = new EventEmitter();
    child.args = args;
    child.written = [];
    child.stdout = Object.assign(new EventEmitter(), { setEncoding() {} });
    child.stderr = Object.assign(new EventEmitter(), { setEncoding() {} });
    child.stdin = Object.assign(new EventEmitter(), {
      writable: true, destroyed: false, writableLength: 0,
      write(buf) { child.written.push(buf); return true; },
      end() { this.ended = true; setImmediate(() => child.emit("exit", 0, null)); },
      destroy() { this.destroyed = true; },
    });
    child.kill = (signal) => { child.killed = signal; setImmediate(() => child.emit("exit", null, signal)); };
    children.push(child);
    return child;
  };
  return { children, spawnImpl };
}
function fakeTimers() {
  const pending = new Map();
  let id = 0;
  return {
    pending,
    setTimeout: (fn, ms) => { id += 1; pending.set(id, { fn, ms }); return id; },
    clearTimeout: (t) => pending.delete(t),
    runNext(ms) {
      const entry = [...pending.entries()].find(([, v]) => ms === undefined || v.ms === ms);
      if (!entry) return false;
      pending.delete(entry[0]);
      entry[1].fn();
      return true;
    },
  };
}
function setup(extra = {}) {
  const { children, spawnImpl } = fakeSpawn();
  const timers = fakeTimers();
  const clock = { t: 1_000_000 };
  const statuses = [];
  const restarts = [];
  const notes = [];
  const engine = createStudioEngine({
    getFfmpeg: async () => ({ available: true, path: "/bin/ffmpeg", version: "7.1.1", encoders: { libx264: true }, muxers: { tee: true, segment: true, flv: true, fifo: true, matroska: true } }),
    tempRoot: tmp("studio-wc-"), spawnImpl, timers, relay: false, now: () => clock.t,
    diag: { write: (scope, message, data) => notes.push({ scope, message, data }) },
    ...extra,
  });
  engine.events.on("status", (s) => statuses.push(s));
  engine.events.on("restartRecorder", (r) => restarts.push(r));
  return { engine, children, timers, clock, statuses, restarts, notes };
}

test("başlık bölünmüş gelirse (MediaRecorder ilk parçası 1 bayt) birleştirilir; kaydedici kabul edilir", async () => {
  const { engine, children } = setup();
  await engine.start({ url: null });
  assert.equal(engine.pushChunk(Buffer.from([0x1a])), true);
  assert.equal(engine.pushChunk(Buffer.from([0x45, 0xdf, 0xa3, 9, 9])), true);
  assert.deepEqual([...Buffer.concat(children[0].written)], [0x1a, 0x45, 0xdf, 0xa3, 9, 9]);
  assert.equal(engine.pushChunk(Buffer.from([7])), true);
  await engine.stop();
  const b = setup();
  await b.engine.start({ url: null });
  assert.equal(b.engine.pushChunk(Buffer.from([0x00])), false, "başlık öneki olmayan kısa parça atılır");
  assert.equal(b.children[0].written.length, 0);
  await b.engine.stop();
});

test("videoCopy: ffmpeg görüntüyü kopyalar (kodlayıcı / fps süzgeci yok), durum 'webcodecs'; yerel kayıt ayrı kalitede kodlanmaz", async () => {
  const dir = tmp("studio-wc-local-");
  const { engine, children, statuses } = setup();
  const res = await engine.start({ url: "rtmp://h/live/k", videoCopy: true, videoEncoderLabel: "WebCodecs donanım · avc1.640029 · CBR", localRecord: { enabled: true, dir, videoBitrateKbps: 12000 } });
  assert.equal(res.ok, true);
  const args = children[0].args;
  assert.equal(at(args, "-c:v"), "copy");
  assert.equal(at(args, "-bsf:v"), "h264_mp4toannexb");
  assert.equal(args.includes("-vf"), false);
  assert.equal(args.includes("-force_key_frames"), false);
  assert.match(at(args, "-af"), /^aresample=min_comp=0\.05:max_soft_comp=0\.002:min_hard_comp=0\.25,/);
  engine.pushChunk(HEADER);
  progress(children[0], 1000);
  const s = statuses.at(-1);
  assert.equal(s.encoder, "webcodecs");
  assert.equal(s.pipeline, "webcodecs");
  assert.match(s.encoderLabel, /CBR/);
  assert.equal(s.localQuality.separate, false);
  assert.equal(s.localQuality.reason, "VIDEO_COPY");
  await engine.stop();
});

test("videoCopy: arayüz eski yola geçerse (restartEncoder videoCopy:false) sonraki çalıştırma yeniden kodlar; restartRecorder videoCopy:false taşır", async () => {
  const { engine, children, restarts } = setup();
  await engine.start({ url: null, videoCopy: true });
  engine.pushChunk(HEADER);
  progress(children[0], 1000);
  assert.equal(engine.restartEncoder("WEBCODECS_VIDEO_ENCODER", { videoCopy: false }), true);
  await tick();
  assert.equal(children.length, 2);
  assert.equal(at(children[1].args, "-c:v"), "libx264");
  assert.equal(restarts.at(-1).videoCopy, false);
  await engine.stop();
});

test("videoCopy: ffmpeg akışı iki kez açamazsa kendiliğinden yeniden kodlamaya geçer", async () => {
  const { engine, children, restarts, timers, notes } = setup();
  await engine.start({ url: null, videoCopy: true });
  for (let i = 0; i < 2; i += 1) {
    const c = children.at(-1);
    engine.pushChunk(HEADER);
    stderr(c, "[matroska,webm @ 0x1] [error] Invalid data found when processing input");
    c.emit("exit", 1, null);
    await tick();
    if (children.at(-1) === c) timers.runNext(2000);
  }
  assert.equal(at(children.at(-1).args, "-c:v"), "libx264");
  assert.equal(restarts.at(-1).videoCopy, false);
  assert.ok(notes.some((n) => /tek kodlama akışı açılamadı/.test(n.message)));
  await engine.stop();
});

test("tanılama: arayüz sayaçları sağlık kaydına girer; atlanan kare artınca hemen günlüğe yazılır", async () => {
  const { engine, children, clock, notes } = setup();
  await engine.start({ url: null, videoCopy: true });
  engine.pushChunk(HEADER);
  assert.equal(engine.clientStats({ pipeline: "webcodecs", encodeDropped: 0, gaps: 0, queue: 1, audio: { resyncs: 0 }, junk: [1, 2] }), true);
  assert.equal(engine.clientStats({ pipeline: "webcodecs", encodeDropped: 4, gaps: 1, queue: 5 }), true);
  assert.ok(notes.some((n) => /kare atladı/.test(n.message) && n.data.deltaDropped === 4));
  progress(children[0], 1000);
  clock.t += 31000;
  progress(children[0], 30000);
  const h = notes.filter((n) => n.message === "yayın sağlığı").at(-1);
  assert.equal(h.data.client.encodeDropped, 4);
  assert.equal(h.data.pipeline, "webcodecs");
  assert.equal(engine.health().client.queue, 5);
  await engine.stop();
});

test("aktarıcı: atlama eşiği bit hızına göre (~8 sn'lik veri, 4–24 MB); durum tampon baytlarını verir", async () => {
  const { spawnImpl } = fakeSpawn();
  const clock = { t: 0 };
  const relay = createRelay({ ffmpegPath: "/bin/ffmpeg", primaryUrl: "rtmp://h/live/k", spawnImpl, timers: fakeTimers(), now: () => clock.t });
  assert.equal(relay.status().highWaterBytes, 4 * 1024 * 1024);
  // 1,5 MB/sn (12 Mbps) gelen veri → 12 MB eşik.
  const pkt = Buffer.alloc(188 * 1000, 0); for (let i = 0; i < 1000; i += 1) { pkt[i * 188] = 0x47; pkt[i * 188 + 1] = 0x1f; pkt[i * 188 + 2] = 0xff; }
  for (let s = 0; s <= 8; s += 1) { for (let k = 0; k < 8; k += 1) relay.write(pkt); clock.t += 1000; }
  const hw = relay.status().highWaterBytes;
  assert.ok(hw > 10 * 1024 * 1024 && hw <= 24 * 1024 * 1024, String(hw));
  assert.equal(typeof relay.status().pendingBytes, "number");
  relay.dispose();
});
