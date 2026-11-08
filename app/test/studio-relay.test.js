"use strict";
// RTMP aktarıcısı (relay.js): MPEG-TS GOP tamponu, gözetimli aktarıcı süreç
// (sonsuz geri çekilme, yedek adres, askı / zaman aşımı, geri basınç), motorla
// birlikte çalışma ve YouTube'a uygun komut satırları.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");
const { EventEmitter } = require("node:events");
const ff = require("../studio/ffmpeg");
const { createRelay, createTsGopBuffer, backoffFor, RELAY_BACKOFF_MS } = require("../studio/relay");
const { createStudioEngine } = require("../studio/engine");

const at = (args, flag) => args[args.indexOf(flag) + 1];
const tick = () => new Promise((r) => setImmediate(r));
const HARD_KILL = process.platform === "win32" ? undefined : "SIGKILL";

/* ------------------------------ sentetik MPEG-TS ------------------------------ */

const PMT_PID = 0x1000;
const VIDEO_PID = 0x100;
const AUDIO_PID = 0x101;

function packet(pid, { pusi = false, rai = false, payload = [], fill = 0xff } = {}) {
  const p = Buffer.alloc(188, fill);
  p[0] = 0x47;
  p[1] = (pusi ? 0x40 : 0) | ((pid >> 8) & 0x1f);
  p[2] = pid & 0xff;
  if (rai) {
    p[3] = 0x30; // uyarlama + yük
    p[4] = 1;
    p[5] = 0x40; // random_access_indicator
    Buffer.from(payload).copy(p, 6);
  } else {
    p[3] = 0x10;
    Buffer.from(payload).copy(p, 4);
  }
  return p;
}
const pat = () => packet(0, { pusi: true, payload: [0x00, 0x00, 0xb0, 0x0d, 0x00, 0x01, 0xc1, 0x00, 0x00, 0x00, 0x01, 0xe0 | (PMT_PID >> 8), PMT_PID & 0xff, 0, 0, 0, 0] });
const pmt = () => packet(PMT_PID, { pusi: true, payload: [0x00, 0x02, 0xb0, 0x17, 0x00, 0x01, 0xc1, 0x00, 0x00, 0xe1, 0x00, 0xf0, 0x00, 0x1b, 0xe1, 0x00, 0xf0, 0x00, 0x0f, 0xe1, 0x01, 0xf0, 0x00, 0, 0, 0, 0] });
const key = (tag = 0) => packet(VIDEO_PID, { pusi: true, rai: true, payload: [0, 0, 1, 0xe0, tag] });
const vid = (tag = 0) => packet(VIDEO_PID, { payload: [tag] });
const aud = () => packet(AUDIO_PID, { pusi: true, rai: true, payload: [0, 0, 1, 0xc0] }); // ses her pakette RAI taşır
/** Bir GOP: PAT, PMT, anahtar kare, n kare + ses. */
const gop = (tag, n = 3) => Buffer.concat([pat(), pmt(), key(tag), ...Array.from({ length: n }, () => [vid(tag), aud()]).flat()]);

test("TS GOP tamponu: parça sınırlarından bağımsız hizalar; son anahtar karenin önündeki PAT'tan başlar; ses RAI'si anahtar sayılmaz", () => {
  const buf = createTsGopBuffer();
  const stream = Buffer.concat([aud(), aud(), gop(1), gop(2, 5)]);
  let keys = 0;
  // 100 baytlık (hizasız) parçalar.
  for (let i = 0; i < stream.length; i += 100) {
    const r = buf.feed(stream.subarray(i, i + 100));
    if (r.keyframe) keys += 1;
    if (r.data) assert.equal(r.data.length % 188, 0);
  }
  assert.equal(keys, 2);
  assert.equal(buf.videoPid(), VIDEO_PID);
  const snap = buf.snapshot();
  assert.equal(snap.length, gop(2, 5).length);
  assert.equal(snap[1] & 0x1f, 0); // PAT ile başlar
  assert.equal(snap.subarray(2 * 188, 3 * 188)[10], 2); // anahtar kare GOP 2'nin
  // Senkron kaybı: çöp baytlardan sonra yeniden hizalanır.
  buf.reset();
  assert.equal(buf.hasKey(), false);
  buf.feed(Buffer.concat([Buffer.from([1, 2, 3]), gop(3)]));
  assert.equal(buf.hasKey(), true);
  assert.equal(buf.snapshot().length, gop(3).length);
  // Anahtar kare öncesi PAT önceki parçadaysa oradan alınır.
  buf.reset();
  buf.feed(Buffer.concat([pat(), pmt()]));
  buf.feed(Buffer.concat([key(4), vid(4)]));
  assert.equal(buf.snapshot().length, 4 * 188);
});

test("geri çekilme: 1, 2, 4, 8, 10 sn; sonra hep 10 sn (tavan)", () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 50].map((n) => backoffFor(n)), [1000, 2000, 4000, 8000, 10000, 10000, 10000]);
  assert.deepEqual(RELAY_BACKOFF_MS, [1000, 2000, 4000, 8000, 10000]);
});

/* ------------------------------ sahte süreçler ------------------------------ */

function fakeSpawn() {
  const children = [];
  const spawnImpl = (file, args, options) => {
    const child = new EventEmitter();
    child.args = args;
    child.options = options;
    child.written = [];
    child.stdout = Object.assign(new EventEmitter(), { setEncoding() {} });
    child.stderr = Object.assign(new EventEmitter(), { setEncoding() {} });
    child.stdin = Object.assign(new EventEmitter(), {
      writable: true, destroyed: false, writableLength: 0,
      write(buf) { child.written.push(Buffer.from(buf)); return true; },
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
    has: (ms) => [...pending.values()].some((v) => v.ms === ms),
  };
}

const sent = (child, totalSize) => child.stdout.emit("data", `total_size=${totalSize}\nout_time_us=1000000\nbitrate=1000.0kbits/s\nprogress=continue\n`);

function setupRelay(extra = {}) {
  const { children, spawnImpl } = fakeSpawn();
  const timers = fakeTimers();
  const clock = { t: 1_000_000 };
  const statuses = [];
  const notes = [];
  const relay = createRelay({
    ffmpegPath: "/bin/ffmpeg", primaryUrl: "rtmp://a.rtmp.youtube.com/live2/ANA-ANAHTAR", spawnImpl, timers, now: () => clock.t,
    note: (m, d) => notes.push({ m, d }), ...extra,
  });
  relay.events.on("status", (s) => statuses.push(s));
  return { relay, children, timers, clock, statuses, notes };
}

test("aktarıcı: anahtar kare gelince başlar ve son GOP'la beslenir; gönderilen bayt artınca 'up'", async () => {
  const { relay, children, statuses } = setupRelay();
  relay.write(Buffer.concat([vid(0), aud()])); // anahtar kare yok
  assert.equal(children.length, 0);
  relay.write(gop(1));
  assert.equal(children.length, 1);
  const args = children[0].args;
  assert.equal(at(args, "-f"), "mpegts");
  assert.equal(at(args, "-c"), "copy");
  assert.equal(args.at(-1), "rtmp://a.rtmp.youtube.com/live2/ANA-ANAHTAR");
  assert.equal(Buffer.concat(children[0].written).length, gop(1).length);
  assert.equal(statuses.at(-1).state, "connecting");
  relay.write(Buffer.concat([vid(1), aud()]));
  assert.equal(Buffer.concat(children[0].written).length, gop(1).length + 2 * 188);
  sent(children[0], 5000);
  assert.equal(statuses.at(-1).state, "up");
  assert.equal(relay.status().reconnects, 0);
  await relay.stop();
  assert.equal(children[0].stdin.ended, true);
  assert.equal(relay.status().state, "stopped");
});

test("aktarıcı: koparsa yalnız aktarıcı 1,2,4,8,10,10… sn arayla SONSUZ yeniden başlar; yeniden bağlanma sayılır", async () => {
  const { relay, children, timers, statuses } = setupRelay();
  relay.write(gop(1));
  sent(children[0], 1000);
  const delays = [];
  for (let i = 1; i <= 8; i += 1) {
    const child = children.at(-1);
    child.stderr.emit("data", "[tcp @ 0x1] Connection to tcp://a.rtmp.youtube.com:1935 failed: Connection refused\n");
    child.emit("exit", 1, null);
    const st = statuses.at(-1);
    assert.equal(st.state, "down");
    assert.equal(st.attempt, i);
    assert.equal(st.lastError.code, "CONNECTION_REFUSED");
    assert.match(st.message, new RegExp(`^Yeniden bağlanıyor… \\(${i}\\. deneme\\)`));
    const retry = [...timers.pending.values()].find((t) => t.ms >= 1000 && t.ms <= 10000 && t.ms !== 3000);
    delays.push(retry.ms);
    timers.runNext(retry.ms);
    assert.equal(children.length, i + 1);
    // Yeni aktarıcı son anahtar kareden beslenir.
    assert.equal(Buffer.concat(children.at(-1).written).subarray(0, 188).equals(pat()), true);
  }
  assert.deepEqual(delays, [1000, 2000, 4000, 8000, 10000, 10000, 10000, 10000]);
  sent(children.at(-1), 500);
  assert.equal(statuses.at(-1).state, "up");
  assert.equal(statuses.at(-1).reconnects, 1);
  assert.equal(statuses.at(-1).message, null);
  // 30 sn sağlam → deneme sayacı sıfırlanır.
  timers.runNext(30000);
  assert.equal(relay.status().attempt, 0);
  await relay.stop();
});

test("aktarıcı: 3 hatadan sonra yedek adrese, 3 hata daha olursa ana adrese döner", async () => {
  const { relay, children, timers, notes } = setupRelay({ backupUrl: "rtmp://b.rtmp.youtube.com/live2?backup=1/YEDEK-ANAHTAR" });
  relay.write(gop(1));
  const urls = [children[0].args.at(-1)];
  for (let i = 0; i < 6; i += 1) {
    children.at(-1).emit("exit", 1, null);
    const retry = [...timers.pending.values()].find((t) => t.ms >= 1000 && t.ms <= 10000 && t.ms !== 3000);
    timers.runNext(retry.ms);
    urls.push(children.at(-1).args.at(-1));
  }
  const kind = urls.map((u) => (u.includes("YEDEK") ? "b" : "a")).join("");
  assert.equal(kind, "aaabbba");
  assert.equal(relay.status().target, "primary");
  assert.equal(relay.status().backupAvailable, true);
  assert.ok(notes.some((n) => /yedek adrese geçiliyor/.test(n.m)));
  assert.ok(notes.every((n) => !JSON.stringify(n.d || {}).includes("YEDEK-ANAHTAR")), "anahtar günlükte gizli");
  await relay.stop();
});

test("aktarıcı: bağlantı askıda (bayt artmıyor) ya da hiç kurulamazsa öldürülür", async () => {
  const { relay, children, timers, clock, statuses } = setupRelay({ stallMs: 15000, connectTimeoutMs: 20000 });
  relay.write(gop(1));
  // Hiç bağlanmadı: 20 sn sonra zaman aşımı.
  for (let i = 0; i < 21 && !children[0].killed; i += 1) { clock.t += 1000; timers.runNext(1000); }
  assert.equal(children[0].killed, HARD_KILL);
  await tick();
  assert.equal(statuses.at(-1).lastError.code, "TIMEOUT");
  timers.runNext(1000);
  sent(children[1], 1000);
  assert.equal(statuses.at(-1).state, "up");
  // Bağlı ama bayt artmıyor: 15 sn'de askı.
  for (let i = 0; i < 16 && !children[1].killed; i += 1) { clock.t += 1000; sent(children[1], 1000); timers.runNext(1000); }
  assert.equal(children[1].killed, HARD_KILL);
  await tick();
  assert.equal(statuses.at(-1).lastError.code, "STALLED");
  assert.match(statuses.at(-1).message, /askıda/);
  await relay.stop();
});

test("aktarıcı: ağ yetişemezse kuyruk büyümez, sonraki anahtar kareye kadar GÖRÜNTÜ atlanır; SES sürer", async () => {
  const { relay, children, statuses } = setupRelay({ highWaterBytes: 10000, lowWaterBytes: 1000 });
  relay.write(gop(1));
  sent(children[0], 100);
  const child = children[0];
  const before = child.written.length;
  child.stdin.writableLength = 20000;
  relay.write(Buffer.concat([vid(1), aud()]));
  relay.write(Buffer.concat([vid(1), aud()]));
  // Yalnız ses paketleri yazılır (sesde boşluk = izleyicide patlama).
  assert.equal(child.written.length, before + 2);
  assert.ok(child.written.slice(before).every((b) => b.equals(aud())), "yalnız ses");
  assert.equal(statuses.at(-1).dropping, true);
  assert.match(statuses.at(-1).message, /kareler atlandı \(ses sürüyor\)/);
  // Kuyruk boşaldı ama anahtar kare yok: görüntü hâlâ atlanır, ses gider.
  child.stdin.writableLength = 0;
  relay.write(Buffer.concat([vid(1), aud()]));
  assert.equal(child.written.length, before + 3);
  assert.equal(child.written.at(-1).equals(aud()), true);
  // Anahtar kare: GOP'un başından (PAT) tamamı sürer.
  relay.write(gop(2));
  assert.equal(child.written.length, before + 4);
  assert.equal(child.written.at(-1).subarray(0, 188).equals(pat()), true);
  assert.equal(child.written.at(-1).length, gop(2).length);
  assert.equal(relay.status().droppedBytes, 3 * 188);
  assert.equal(relay.status().dropEvents, 1);
  sent(child, 5000);
  assert.equal(relay.status().dropping, false);
  // Ağ tamamen tıkalı (hardWater = 4 × highWater): ses de atılır.
  child.stdin.writableLength = 50000;
  relay.write(Buffer.concat([vid(2), aud()]));
  assert.equal(child.written.length, before + 4);
  assert.equal(relay.status().droppedBytes, 5 * 188);
  await relay.stop();
});

test("aktarıcı (2.20.1): KISA yığılma görüntü attırmaz (gecikme büyüyüp erir); yalnız SÜREN darlık attırır, kuyruk yarıya inince ilk anahtar karede sürer", async () => {
  const { relay, children, clock } = setupRelay({ highWaterBytes: 10000, lowWaterBytes: 1000, sustainMs: 4000 });
  relay.write(gop(1));
  sent(children[0], 100);
  const child = children[0];
  const before = child.written.length;
  // Yerel takılma sonrası toplu gelen veri: kuyruk highWater'ı (ama 2 × highWater'ı değil) 2 sn aşar.
  for (let i = 0; i < 4; i += 1) {
    child.stdin.writableLength = 15000;
    clock.t += 500;
    relay.write(Buffer.concat([vid(1), aud()]));
  }
  assert.equal(relay.status().dropEvents, 0, "kısa yığılmada atlama olmamalı");
  assert.equal(child.written.length, before + 4, "görüntü de gitmeli");
  // Kuyruk eridi: süre sayacı sıfırlanır.
  child.stdin.writableLength = 2000;
  clock.t += 500;
  relay.write(Buffer.concat([vid(1), aud()]));
  // Süren darlık: 4 sn boyunca yarının üstünde, sonra highWater'ı aşıyor → atlama.
  for (let i = 0; i < 9; i += 1) {
    child.stdin.writableLength = i < 8 ? 7000 : 12000;
    clock.t += 500;
    relay.write(Buffer.concat([vid(1), aud()]));
  }
  assert.equal(relay.status().dropEvents, 1);
  assert.equal(relay.status().dropping, true);
  // Kuyruk highWater / 2'ye (5000) indi — lowWater'a (1000) inmesi BEKLENMEZ: ilk anahtar karede sürer.
  child.stdin.writableLength = 4500;
  const n = child.written.length;
  relay.write(gop(2));
  assert.equal(child.written.length, n + 1);
  assert.equal(child.written.at(-1).length, gop(2).length, "anahtar kareden tüm GOP");
  // 2 × highWater: beklemeden atlanır (bellek / gecikme sınırı).
  child.stdin.writableLength = 20000;
  relay.write(Buffer.concat([vid(2), aud()]));
  assert.equal(relay.status().dropEvents, 2);
  await relay.stop();
});

test("aktarıcı: kodlayıcı yeniden başlarsa (yeni akış) aktarıcı geri çekilmeden, hata saymadan yeniden kurulur", async () => {
  const { relay, children, timers } = setupRelay();
  relay.write(gop(1));
  sent(children[0], 100);
  relay.newStream(); // ilk akış: değişiklik yok
  assert.equal(children[0].stdin.ended, undefined);
  relay.newStream();
  assert.equal(children[0].stdin.ended, true);
  await tick();
  assert.equal(children.length, 1, "yeni akışın anahtar karesi beklenir");
  relay.write(gop(5));
  assert.equal(children.length, 2);
  assert.equal(relay.status().attempt, 0);
  assert.equal([...timers.pending.values()].some((t) => t.ms === 1000 && t !== null), true); // yalnız gözcü
  await relay.stop();
});

test("aktarıcı TCP: yalnız beklenen (arm) bağlantı kabul edilir; gelen veri aktarıcıya gider", async () => {
  const { relay, children } = setupRelay();
  const url = await relay.listen();
  assert.match(url, /^tcp:\/\/127\.0\.0\.1:\d+$/);
  const port = Number(url.split(":").at(-1));
  const connect = () => new Promise((resolve) => { const s = net.connect(port, "127.0.0.1", () => resolve(s)); s.on("error", () => {}); });
  const intruder = await connect();
  await new Promise((r) => intruder.on("close", r)); // arm yok: kapatılır
  relay.arm();
  const enc = await connect();
  enc.write(gop(1));
  for (let i = 0; i < 50 && !children.length; i += 1) await new Promise((r) => setTimeout(r, 10));
  assert.equal(children.length, 1);
  enc.destroy();
  await relay.stop();
});

/* ------------------------------ komut satırları ------------------------------ */

test("aktarıcı komutu: -c copy FLV, no_duration_filesize, rw_timeout + tcp_nodelay (yalnız RTMP)", () => {
  const a = ff.buildRelayArgs({ url: "rtmps://a.rtmps.youtube.com:443/live2/k" });
  assert.equal(at(a, "-f"), "mpegts");
  assert.equal(at(a, "-i"), "pipe:0");
  assert.equal(at(a, "-c"), "copy");
  assert.equal(at(a, "-flvflags"), "no_duration_filesize");
  assert.equal(at(a, "-bsf:a"), "aac_adtstoasc");
  assert.equal(at(a, "-rw_timeout"), "10000000");
  assert.equal(at(a, "-tcp_nodelay"), "1");
  assert.equal(at(a, "-progress"), "pipe:1");
  assert.equal(a.includes("-nostdin"), true);
  assert.equal(a.at(-1), "rtmps://a.rtmps.youtube.com:443/live2/k");
  const file = ff.buildRelayArgs({ url: "/tmp/x.flv" });
  assert.equal(file.includes("-rw_timeout"), false);
  assert.equal(file.includes("-tcp_nodelay"), false);
});

test("yayın komutu (aktarıcı): RTMP yerine yerel TCP'ye MPEG-TS (fifo, taşmada atar); YouTube CBR, 2 sn GOP, CFR, AAC 48 kHz stereo", () => {
  const opts = ff.normalizeStreamOptions({ url: "rtmp://a.rtmp.youtube.com/live2/k", width: 1920, height: 1080, fps: 30, videoBitrateKbps: 4500, audioBitrateKbps: 128 });
  const args = ff.buildStreamArgs({ ...opts, url: null, relayUrl: "tcp://127.0.0.1:5555", encoder: "libx264", fifo: true });
  const [relaySlave, seg] = args.at(-1).split("|");
  assert.equal(relaySlave, "[f=mpegts:onfail=ignore:use_fifo=1:fifo_options=drop_pkts_on_overflow=1\\\\\\:restart_with_keyframe=1\\\\\\:queue_size=600]tcp://127.0.0.1:5555");
  assert.match(seg, /^\[f=segment:/);
  assert.equal(args.join(" ").includes("rtmp://"), false);
  assert.equal(at(args, "-loglevel"), "level+warning");
  for (const flag of ["-b:v", "-minrate", "-maxrate", "-bufsize"]) assert.equal(at(args, flag), "4500k", flag);
  assert.equal(at(args, "-g"), "60");
  assert.equal(at(args, "-keyint_min"), "60");
  assert.equal(at(args, "-sc_threshold"), "0");
  assert.equal(at(args, "-force_key_frames"), "expr:gte(t,n_forced*2)");
  assert.equal(at(args, "-profile:v"), "high");
  assert.equal(at(args, "-level"), "4.1");
  assert.equal(at(args, "-fps_mode"), "cfr");
  assert.equal(at(args, "-r"), "30");
  assert.equal(at(args, "-c:a"), "aac");
  assert.equal(at(args, "-b:a"), "128k");
  assert.equal(at(args, "-ar"), "48000");
  assert.equal(at(args, "-ac"), "2");
  assert.deepEqual(ff.streamSlaves({ relayUrl: "tcp://x", localFile: "/a.mkv" }), ["rtmp", "local", "segment"]);
  // 60 fps: GOP 120 (2 sn), düzey 4.2.
  const a60 = ff.buildStreamArgs({ ...opts, fps: 60, url: null, relayUrl: "tcp://127.0.0.1:5555", encoder: "libx264" });
  assert.equal(at(a60, "-g"), "120");
  assert.equal(at(a60, "-level"), "4.2");
  // İki kodlama (yerel kayıt farklı kalitede): aktarıcı çıkışı yayın görüntüsünü seçer.
  const dual = ff.buildStreamArgs({ ...opts, url: null, relayUrl: "tcp://127.0.0.1:5555", encoder: "h264_videotoolbox", localFile: "/k/a.mkv", localEncode: { width: 1280, height: 720, fps: 30, videoBitrateKbps: 3000 } });
  assert.match(dual.at(-1).split(/(?<!\\)\|/)[0], /^\[f=mpegts:onfail=ignore:select=\\'v:0,a\\'\]tcp:\/\/127\.0\.0\.1:5555$/);
});

/* ------------------------------- motor + aktarıcı ------------------------------- */

const HEADER = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3]);
const progress = (child, ms) => child.stdout.emit("data", `frame=1\nfps=30\nout_time_us=${ms * 1000}\nspeed=1.0x\ndrop_frames=0\nprogress=continue\n`);

function setupEngine(extra = {}) {
  const { children, spawnImpl } = fakeSpawn();
  const timers = fakeTimers();
  const statuses = [];
  const restarts = [];
  const relays = [];
  const engine = createStudioEngine({
    getFfmpeg: async () => ({ available: true, path: "/bin/ffmpeg", version: "7.1.1", encoders: { libx264: true }, muxers: { tee: true, segment: true, flv: true, fifo: true, matroska: true } }),
    tempRoot: fs.mkdtempSync(path.join(os.tmpdir(), "studio-relay-")),
    spawnImpl,
    timers,
    relayFactory: (o) => { const r = createRelay(o); relays.push({ relay: r, opts: o }); return r; },
    ...extra,
  });
  engine.events.on("status", (s) => statuses.push(s));
  engine.events.on("restartRecorder", (r) => restarts.push(r));
  return { engine, children, timers, statuses, restarts, relays };
}

test("motor (aktarıcı): RTMP kopması kodlayıcıyı / kaydediciyi yeniden başlatmaz; 'reconnecting' → 'live'; ağ sağlığı durumda", async () => {
  const { engine, children, timers, statuses, restarts, relays } = setupEngine();
  const res = await engine.start({ url: "rtmp://a.rtmp.youtube.com/live2/ANAHTAR", backupUrl: "rtmp://b.rtmp.youtube.com/live2?backup=1/ANAHTAR" });
  assert.equal(res.ok, true);
  assert.equal(res.relay, true);
  assert.equal(res.backupUrl, true);
  assert.equal(relays[0].opts.backupUrl, "rtmp://b.rtmp.youtube.com/live2?backup=1/ANAHTAR");
  const enc = children[0];
  assert.match(enc.args.at(-1), /^\[f=mpegts:onfail=ignore.*\]tcp:\/\/127\.0\.0\.1:\d+\|/);
  assert.equal(enc.args.join(" ").includes("ANAHTAR"), false, "kodlayıcı RTMP'ye bağlanmaz");
  engine.pushChunk(HEADER);
  progress(enc, 1000);
  assert.equal(statuses.at(-1).state, "connecting", "aktarıcı bağlanana kadar");
  assert.equal(statuses.at(-1).rtmp, "down");
  const relay = relays[0].relay;
  relay.write(gop(1));
  const pusher = children[1];
  assert.equal(pusher.args.at(-1), "rtmp://a.rtmp.youtube.com/live2/ANAHTAR");
  sent(pusher, 4000);
  assert.equal(statuses.at(-1).state, "live");
  assert.equal(statuses.at(-1).rtmp, "up");
  assert.equal(statuses.at(-1).ingest, "primary");
  // Kopma: yalnız aktarıcı.
  pusher.stderr.emit("data", "[rtmp @ 0x1] [error] RTMP_ReadPacket, Connection reset by peer\n");
  pusher.emit("exit", 1, null);
  let st = statuses.at(-1);
  assert.equal(st.state, "reconnecting");
  assert.match(st.message, /^Yeniden bağlanıyor… \(1\. deneme\)/);
  assert.equal(st.network.state, "down");
  assert.equal(st.lastError, st.network.lastError.message);
  progress(enc, 2000);
  assert.equal(statuses.at(-1).state, "reconnecting", "kodlayıcı ilerlemesi durumu 'live' yapmaz");
  assert.equal(enc.killed, undefined);
  timers.runNext(1000);
  sent(children[2], 3000);
  st = statuses.at(-1);
  assert.equal(st.state, "live");
  assert.equal(st.reconnects, 1);
  assert.equal(restarts.length, 0);
  assert.equal(children.filter((c) => c.args.includes("tee") || c.args.includes("-f") && at(c.args, "-f") === "matroska").length, 1, "tek kodlayıcı");
  assert.equal(engine.network().reconnects, 1);
  await engine.stop();
  assert.equal(statuses.at(-1).state, "stopped");
  assert.equal(children[2].stdin.ended, true);
});

test("motor (aktarıcı): kodlayıcı hataları kullanıcı durdurana kadar denenir (5'ten fazla); kaydedici isteğiyle yeniden başlatma deneme sayılmaz", async () => {
  const { engine, children, timers, statuses, restarts } = setupEngine();
  await engine.start({ url: "rtmp://h/live/k", backupUrl: "geçersiz adres" });
  for (let i = 1; i <= 7; i += 1) {
    const child = children.at(-1);
    engine.pushChunk(HEADER);
    child.stderr.emit("data", "av_interleaved_write_frame(): Input/output error\n");
    child.emit("exit", 1, null);
    await tick();
    assert.equal(statuses.at(-1).state, "reconnecting");
    assert.match(statuses.at(-1).message, new RegExp(`^\\(${i}\\. deneme\\)`));
    const retry = [...timers.pending.values()].find((t) => t.ms >= 2000 && t.ms <= 16000);
    timers.runNext(retry.ms);
  }
  assert.equal(engine.active(), true);
  assert.equal(restarts.length, 7);
  // Arayüz kaydediciyi yeniden kurmak istedi.
  const child = children.at(-1);
  engine.pushChunk(HEADER);
  progress(child, 1000);
  const attempts = statuses.at(-1).attempt;
  assert.equal(engine.restartEncoder("track-ended"), true);
  assert.equal(child.killed, HARD_KILL);
  await tick();
  assert.equal(restarts.length, 8);
  assert.equal(statuses.at(-1).attempt, attempts);
  await engine.stop();
});
