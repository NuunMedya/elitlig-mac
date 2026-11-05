"use strict";
// Gerçek ffmpeg ile uçtan uca: MediaRecorder benzeri Matroska akışı → motor →
// yeniden kodlama → tee [FLV dosyası | TS halkası] → saveClip (concat MP4).
// ffmpeg yoksa (ya da libx264/aac/tee/segment eksikse) atlanır.
//
//   ELITLIG_FFMPEG=/yol/ffmpeg          kullanılacak ikili (CI: paketli uygulamadaki)
//   ELITLIG_STUDIO_ENCODER=h264_videotoolbox | h264_nvenc | h264_qsv | h264_amf | h264_mf | libx264   kodlayıcıyı zorla
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const ff = require("../studio/ffmpeg");
const { createStudioEngine } = require("../studio/engine");
const { createClipStore } = require("../studio/clips");

const candidate = ff.resolveFfmpeg({ resourcesPath: null });
let infoPromise = null;
const getInfo = () => (infoPromise ||= ff.probeFfmpeg(candidate));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Sentetik "MediaRecorder" çıktısı: H.264 + Opus Matroska (tarayıcının avc1,opus kaydı gibi). */
function makeInput(ffmpegPath, seconds) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const p = spawn(ffmpegPath, [
      "-hide_banner", "-nostdin", "-loglevel", "error",
      "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=30", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000",
      "-t", String(seconds), "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-g", "30",
      "-c:a", "libopus", "-b:a", "96k", "-f", "matroska", "-live", "1", "pipe:1",
    ]);
    p.stdout.on("data", (d) => chunks.push(d));
    let err = "";
    p.stderr.on("data", (d) => { err += d; });
    p.on("exit", (code) => (code === 0 ? resolve(Buffer.concat(chunks)) : reject(new Error(err || `ffmpeg ${code}`))));
  });
}

/** Girişi gerçek zamanlı, 250 ms'lik parçalar halinde yollar (ilk parça başlıktır). */
async function feed(engine, input, seconds, { from = 0 } = {}) {
  const steps = Math.ceil((seconds * 1000) / 250);
  const size = Math.ceil(input.length / steps);
  for (let i = 0; i < steps; i += 1) {
    if (i >= from) engine.pushChunk(input.subarray(i * size, (i + 1) * size));
    await sleep(250);
  }
}

const skipReason = async () => {
  if (!candidate) return "ffmpeg yok";
  const info = await getInfo();
  if (!info.available) return `ffmpeg eksik: ${info.error}`;
  const enc = ff.parseCodecList((await ff.run(candidate.path, ["-hide_banner", "-encoders"])).stdout);
  if (!enc.has("libopus")) return "libopus yok (sentetik giriş üretilemez)";
  return null;
};

const forcedEncoders = (info) => {
  const want = process.env.ELITLIG_STUDIO_ENCODER;
  if (!want) return info.encoders;
  return Object.fromEntries(Object.entries(ff.ENCODERS).map(([key, name]) => [key, want === name]));
};

test("uçtan uca: akış → tee [flv | ts halkası] → 10 sn'lik gol klibi (MP4)", { timeout: 90000 }, async (t) => {
  const why = await skipReason();
  if (why) { t.skip(why); return; }
  const info = await getInfo();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "studio-int-"));
  const flv = path.join(root, "yayin.flv");
  const engine = createStudioEngine({
    getFfmpeg: async () => ({ ...info, encoders: forcedEncoders(info) }),
    tempRoot: path.join(root, "seg"),
    validateUrl: () => true, // RTMP yerine yerel FLV dosyası
  });
  const statuses = [];
  engine.events.on("status", (s) => statuses.push(s));
  const seconds = 14;
  const input = await makeInput(info.path, seconds);
  // tee hedefi olarak dosya: url doğrulaması test için kapalı.
  const res = await engine.start({ url: flv, width: 640, height: 360, fps: 30, videoBitrateKbps: 1500, audioBitrateKbps: 160 });
  assert.equal(res.ok, true, JSON.stringify(res));
  await feed(engine, input, seconds);
  const live = statuses.filter((s) => s.state === "live");
  assert.ok(live.length > 3, `durumlar: ${statuses.map((s) => s.state).join(",")}`);
  assert.ok(live.at(-1).outTimeMs > 8000);
  assert.ok(live.at(-1).bitrateKbps > 300, `bit hızı ${live.at(-1).bitrateKbps}`);

  const store = createClipStore({ clipsDir: path.join(root, "clips"), getFfmpegPath: () => info.path });
  const saved = await store.save({ sources: engine.clipSources(), seconds: 10, sessionId: res.sessionId });
  assert.equal(saved.ok, true, JSON.stringify(saved));
  const clip = saved.clip;
  assert.equal(clip.width, 640);
  assert.equal(clip.height, 360);
  assert.ok(clip.durationMs >= 9000 && clip.durationMs <= 13500, `süre ${clip.durationMs}`);
  assert.ok(clip.sizeBytes > 100000);
  assert.match(clip.url, /^elitlig-studio:\/\/clips\/clip-.*\.mp4$/);
  const probe = await ff.run(info.path, ["-hide_banner", "-i", clip.path]);
  assert.match(probe.stderr, /Video: h264/);
  assert.match(probe.stderr, /Audio: aac/);
  // faststart: moov, mdat'tan önce.
  const head = fs.readFileSync(clip.path).subarray(0, 64 * 1024).toString("latin1");
  assert.ok(head.indexOf("moov") >= 0 && (head.indexOf("mdat") < 0 || head.indexOf("moov") < head.indexOf("mdat")));
  assert.deepEqual(store.list().map((c) => c.name), [clip.name]);
  t.diagnostic(`ffmpeg ${info.version} (${info.source}) · kodlayıcı ${res.encoder} · klip ${clip.durationMs} ms ${clip.width}x${clip.height} ${clip.sizeBytes} B · bit hızı ${live.at(-1).bitrateKbps} kbps`);

  await engine.stop();
  assert.equal(statuses.at(-1).state, "stopped");
  assert.equal(fs.readdirSync(path.join(root, "seg")).length, 0);
  const out = await ff.run(info.path, ["-hide_banner", "-i", flv]);
  assert.match(out.stderr, /Video: h264/);
  assert.match(out.stderr, /Audio: aac.*48000 Hz, stereo/);
  fs.rmSync(root, { recursive: true, force: true });
});

test("uçtan uca (fifo yok): RTMP bağlanamazsa 'reconnecting' + kaydedici yeniden başlatma; sonra 'failed'", { timeout: 60000 }, async (t) => {
  const why = await skipReason();
  if (why) { t.skip(why); return; }
  const info = await getInfo();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "studio-int-"));
  // Eski davranış (fifo'suz ffmpeg): RTMP düşünce süreç yeniden başlar.
  const engine = createStudioEngine({ getFfmpeg: async () => ({ ...info, muxers: { ...info.muxers, fifo: false }, encoders: forcedEncoders(info) }), tempRoot: root, backoffMs: [300, 300] });
  const statuses = [];
  const restarts = [];
  engine.events.on("status", (s) => statuses.push(s));
  const input = await makeInput(info.path, 3);
  engine.events.on("restartRecorder", () => { restarts.push(Date.now()); feed(engine, input, 3); });
  const res = await engine.start({ url: "rtmp://127.0.0.1:9/live2/anahtar", width: 640, height: 360, fps: 30, videoBitrateKbps: 1000 });
  assert.equal(res.ok, true);
  try {
    await feed(engine, input, 3);
    for (let i = 0; i < 40 && statuses.at(-1).state !== "failed"; i += 1) await sleep(250);
    const states = statuses.map((s) => s.state);
    assert.ok(states.includes("connecting"));
    assert.ok(states.includes("reconnecting"), states.join(","));
    const rec = statuses.find((s) => s.state === "reconnecting");
    assert.equal(rec.code, "CONNECTION_REFUSED");
    assert.match(rec.message, /^\(1\/2\) .*reddetti/);
    assert.equal(restarts.length, 2);
    assert.equal(statuses.at(-1).state, "failed");
  } finally {
    await engine.stop();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

/** Yerel RTMP sunucusu (ffmpeg -listen 1): gelen akışı okur, kare sayısını döndürür. */
function rtmpListener(ffmpegPath, url, seconds) {
  const p = spawn(ffmpegPath, ["-hide_banner", "-nostdin", "-loglevel", "info", "-listen", "1", "-timeout", String(seconds), "-i", url, "-t", String(seconds), "-c", "copy", "-f", "null", "-"]);
  let err = "";
  p.stderr.on("data", (d) => { err += d; });
  const done = new Promise((resolve) => p.on("exit", () => resolve(err)));
  return { done, kill: () => { try { p.kill("SIGKILL"); } catch { /* yoksay */ } } };
}

test("uçtan uca (fifo): RTMP kopunca süreç YENİDEN BAŞLAMADAN yeniden bağlanır; halka sürer", { timeout: 90000 }, async (t) => {
  const why = await skipReason();
  if (why) { t.skip(why); return; }
  const info = await getInfo();
  if (!info.muxers.fifo) { t.skip("ffmpeg'de fifo yok"); return; }
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "studio-int-"));
  const port = 19000 + Math.floor(Math.random() * 900);
  const url = `rtmp://127.0.0.1:${port}/live2/anahtar`;
  const engine = createStudioEngine({ getFfmpeg: async () => ({ ...info, encoders: forcedEncoders(info) }), tempRoot: root });
  const statuses = [];
  const restarts = [];
  engine.events.on("status", (s) => statuses.push(s));
  engine.events.on("restartRecorder", () => restarts.push(Date.now()));
  const seconds = 16;
  const input = await makeInput(info.path, seconds);
  const res = await engine.start({ url, width: 640, height: 360, fps: 30, videoBitrateKbps: 1000 });
  assert.equal(res.ok, true);
  let listener = null;
  try {
    const feeding = feed(engine, input, seconds);
    // İlk 5 sn sunucu yok (bağlantı reddedilir), sonra sunucu açılır.
    await sleep(5000);
    const down = statuses.filter((s) => s.state === "reconnecting");
    assert.ok(down.length > 0, statuses.map((s) => s.state).join(","));
    assert.equal(down[0].code, "CONNECTION_REFUSED");
    assert.match(down[0].message, /yeniden bağlanılıyor \(kayıt sürüyor\)/);
    listener = rtmpListener(info.path, url, 8);
    await feeding;
    const got = await listener.done;
    assert.match(got, /Input #0, flv/);
    const tm = [...got.matchAll(/time=(\d+):(\d+):([\d.]+)/g)].at(-1);
    const received = tm ? Number(tm[1]) * 3600 + Number(tm[2]) * 60 + Number(tm[3]) : 0;
    assert.ok(received > 3, `sunucuya ulaşan süre: ${received} sn`);
    assert.ok(statuses.some((s, i) => s.state === "live" && i > statuses.indexOf(down[0])), "yeniden 'live' olmalı");
    assert.equal(restarts.length, 0, "kaydedici yeniden başlatılmamalı");
    assert.ok(engine.bufferedMs() > 8000, `halka ${engine.bufferedMs()} ms`);
    t.diagnostic(`sunucuya ulaşan süre ${received} sn, durumlar ${[...new Set(statuses.map((s) => s.state))].join(",")}`);
  } finally {
    listener?.kill();
    await engine.stop();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
