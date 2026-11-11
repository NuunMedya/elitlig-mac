// Yayın sesi — GERÇEK ffmpeg ile: yayın komutunun ses süzgeci (patlama / tık / kırpılma)
// ve özet oluşturucunun (render.js) çıktısında klip sesinin bulunması.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const ff = require("../studio/ffmpeg");
const { createRenderer } = require("../studio/render");

const candidate = ff.resolveFfmpeg({ resourcesPath: null });
let infoPromise = null;
const getInfo = () => (infoPromise ||= ff.probeFfmpeg(candidate));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const skipReason = async () => {
  if (!candidate) return "ffmpeg yok";
  const info = await getInfo();
  if (!info.available) return `ffmpeg eksik: ${info.error}`;
  if (!info.encoders.libx264) return "libx264 yok";
  const enc = ff.parseCodecList((await ff.run(candidate.path, ["-hide_banner", "-encoders"])).stdout);
  if (!enc.has("libopus") || !enc.has("libvpx")) return "libopus / libvpx yok";
  const filters = (await ff.run(candidate.path, ["-hide_banner", "-filters"])).stdout;
  if (!/\balimiter\b/.test(filters)) return "alimiter süzgeci yok";
  return null;
};

/** MediaRecorder benzeri WebM (VP8 + Opus 48 kHz): amp genlikli 440 Hz sinüs; tsExpr: ses zaman damgası (setts). */
async function makeWebm(ffmpegPath, file, { seconds = 6, amp = 0.5, tsExpr = "PTS" } = {}) {
  const r = await ff.run(ffmpegPath, [
    "-hide_banner", "-nostdin", "-loglevel", "error", "-y",
    "-f", "lavfi", "-i", "testsrc2=s=320x180:r=30",
    "-f", "lavfi", "-i", `aevalsrc=${amp}*sin(2*PI*440*t):s=48000:c=stereo`,
    "-t", String(seconds),
    "-c:v", "libvpx", "-b:v", "300k", "-deadline", "realtime", "-cpu-used", "8",
    "-c:a", "libopus", "-b:a", "128k", "-bsf:a", `setts=ts=${tsExpr}`,
    "-f", "webm", file,
  ], { timeout: 60000 });
  assert.equal(r.ok !== false, true, r.stderr);
}

/** Yayın komutunu (url yok: yerel .mkv + parça halkası) dosyayı stdin'e vererek çalıştırır. */
function runStream(ffmpegPath, cwd, input) {
  const args = ff.buildStreamArgs({ url: null, width: 320, height: 180, fps: 30, videoBitrateKbps: 500, audioBitrateKbps: 160, encoder: "libx264", localFile: "out.mkv", platform: process.platform });
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpegPath, args, { cwd, stdio: ["pipe", "ignore", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => { err += d; });
    p.on("exit", (code) => (code === 0 ? resolve(path.join(cwd, "out.mkv")) : reject(new Error(err || `ffmpeg ${code}`))));
    fs.createReadStream(input).pipe(p.stdin);
  });
}

/** Sesin ilk kanalı, kayan nokta örnekler. */
async function decodeLeft(ffmpegPath, file) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const p = spawn(ffmpegPath, ["-hide_banner", "-loglevel", "error", "-i", file, "-map", "0:a:0", "-af", "pan=mono|c0=c0", "-ar", "48000", "-f", "f32le", "pipe:1"]);
    p.stdout.on("data", (d) => chunks.push(d));
    p.on("exit", (code) => {
      if (code !== 0) { reject(new Error(`decode ${code}`)); return; }
      const b = Buffer.concat(chunks);
      resolve(new Float32Array(b.buffer, b.byteOffset, Math.floor(b.length / 4)));
    });
  });
}

/** Tepe, 0 dBFS üstü örnek sayısı ve "tık" (sinüs eğiminin 2 katından büyük sıçrama) sayısı. */
function analyse(x, amp) {
  let peak = 0; let overs = 0; let clicks = 0; let sum = 0;
  const thr = Math.max(0.02, 2 * Math.PI * 440 / 48000 * amp * 2);
  const from = 4800; const to = x.length - 4800; // baştaki yumuşak açılış / sondaki kesik hariç
  for (let i = 0; i < x.length; i += 1) {
    const a = Math.abs(x[i]);
    if (a > peak) peak = a;
    if (a >= 0.999) overs += 1;
    sum += x[i] * x[i];
    if (i > from && i < to && Math.abs(x[i] - x[i - 1]) > thr) clicks += 1;
  }
  return { peak, overs, clicks, rmsDb: 20 * Math.log10(Math.sqrt(sum / Math.max(1, x.length)) || 1e-9) };
}

test("yayın sesi: 0 dBFS üstü giriş (+3 dB) çıkışta kırpılmaz (alimiter −1 dBFS)", { timeout: 120000 }, async (t) => {
  const why = await skipReason();
  if (why) { t.skip(why); return; }
  const info = await getInfo();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "studio-audio-over-"));
  try {
    const input = path.join(root, "in.webm");
    await makeWebm(info.path, input, { amp: 1.41 });
    const out = await runStream(info.path, root, input);
    const a = analyse(await decodeLeft(info.path, out), 0.89);
    t.diagnostic(`+3 dB giriş → tepe ${a.peak.toFixed(3)}, 0 dBFS üstü ${a.overs}`);
    assert.equal(a.overs, 0, "0 dBFS üstü örnek kalmamalı");
    assert.ok(a.peak < 0.97, `tepe ${a.peak}`);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("yayın sesi: ±5 ms zaman damgası titreşimi tık üretmez; −6 dBFS ses şeffaf geçer", { timeout: 120000 }, async (t) => {
  const why = await skipReason();
  if (why) { t.skip(why); return; }
  const info = await getInfo();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "studio-audio-jit-"));
  try {
    const input = path.join(root, "in.webm");
    await makeWebm(info.path, input, { amp: 0.5, tsExpr: "PTS+trunc((random(0)-0.5)*0.010/TB)" });
    const out = await runStream(info.path, root, input);
    const a = analyse(await decodeLeft(info.path, out), 0.5);
    t.diagnostic(`titreşimli giriş → tepe ${a.peak.toFixed(3)}, tık ${a.clicks}`);
    assert.equal(a.clicks, 0);
    assert.ok(a.peak > 0.45 && a.peak < 0.56, `şeffaflık: tepe ${a.peak}`);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

/**
 * Sinüs bütünlüğü: (1) tık — x[n+1] − 2cos(ω)x[n] + x[n−1] saf sinüste ≈ 0'dır (yavaş perde kayması
 * da ≈ 0 bırakır); faz / genlik sıçraması tepe yapar; (2) perde — 100 ms'lik pencerelerde sıfır
 * geçişlerinden frekans, ortancadan en büyük sapma (sent). from / to: baş / son atlanır.
 */
function sineIntegrity(x, freq, amp) {
  const w = (2 * Math.PI * freq) / 48000;
  const k = 2 * Math.cos(w);
  const from = 9600; const to = x.length - 9600;
  let clicks = 0; let lastClick = -1e9;
  for (let i = from; i < to; i += 1) {
    const e = Math.abs(x[i + 1] - k * x[i] + x[i - 1]);
    if (e > 0.03 * amp && i - lastClick > 480) { clicks += 1; lastClick = i; }
  }
  const freqs = [];
  for (let s0 = from; s0 + 4800 < to; s0 += 4800) {
    let first = null; let last = null; let n = 0;
    for (let i = s0 + 1; i < s0 + 4800; i += 1) {
      if (x[i - 1] < 0 && x[i] >= 0) { const t = i - 1 + (-x[i - 1]) / (x[i] - x[i - 1]); if (first === null) first = t; last = t; n += 1; }
    }
    if (n > 2) freqs.push(((n - 1) * 48000) / (last - first));
  }
  const sorted = [...freqs].sort((a, b) => a - b);
  const med = sorted[Math.floor(sorted.length / 2)] || freq;
  const cents = freqs.reduce((m, f) => Math.max(m, Math.abs(1200 * Math.log2(f / med))), 0);
  return { clicks, cents };
}

test("yayın sesi: ses işçisinin ofset basamakları (10 ms) + 5 ms titreşim → esneme / tık YOK (2.30.1 cızırtı regresyonu)", { timeout: 120000 }, async (t) => {
  const why = await skipReason();
  if (why) { t.skip(why); return; }
  const info = await getInfo();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "studio-audio-step-"));
  try {
    const input = path.join(root, "in.webm");
    // Paket başına 20 ms (Opus): her 1,5 sn'de bir +10 ms basamak (min-pencere ofseti) ve her 7. pakette +5 ms.
    await makeWebm(info.path, input, { seconds: 14, amp: 0.5, tsExpr: "PTS+if(lt(mod(N\\,150)\\,75)\\,0\\,0.010/TB)+if(eq(mod(N\\,7)\\,0)\\,0.005/TB\\,0)" });
    const out = await runStream(info.path, root, input);
    const r = sineIntegrity(await decodeLeft(info.path, out), 440, 0.5);
    t.diagnostic(`basamaklı zaman damgası → tık ${r.clicks}, en büyük perde kayması ${r.cents.toFixed(1)} sent`);
    assert.equal(r.clicks, 0, `tık ${r.clicks}`);
    assert.ok(r.cents < 3, `perde kayması ${r.cents.toFixed(1)} sent (async=1000 ≈ 15–40 sent)`);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("yayın sesi: 300 ms gerçek boşluk sessizlikle doldurulur (ses / görüntü eşi korunur)", { timeout: 120000 }, async (t) => {
  const why = await skipReason();
  if (why) { t.skip(why); return; }
  const info = await getInfo();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "studio-audio-gap-"));
  try {
    const input = path.join(root, "in.webm");
    await makeWebm(info.path, input, { seconds: 8, amp: 0.5, tsExpr: "PTS+if(gt(N\\,200)\\,0.300/TB\\,0)" });
    const out = await runStream(info.path, root, input);
    const x = await decodeLeft(info.path, out);
    const sec = x.length / 48000;
    t.diagnostic(`8 sn + 300 ms boşluk → çıkış ${sec.toFixed(3)} sn`);
    assert.ok(sec > 8.2, `boşluk doldurulmadı: ${sec} sn`);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("özet: oluşturulan MP4'te klip sesi var (AAC, sessiz değil)", { timeout: 60000 }, async (t) => {
  const why = await skipReason();
  if (why) { t.skip(why); return; }
  const info = await getInfo();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "studio-hl-audio-"));
  try {
    const src = path.join(root, "clip.webm");
    await makeWebm(info.path, src, { seconds: 3, amp: 0.3 });
    const input = fs.readFileSync(src);
    const renderer = createRenderer({ getFfmpeg: async () => ({ ...info, encoders: { libx264: true } }), highlightsDir: path.join(root, "highlights"), tempRoot: path.join(root, "tmp") });
    const s = await renderer.start({ width: 640, height: 360, fps: 30, videoBitrateKbps: 2000, mimeType: "video/webm;codecs=vp8,opus" });
    assert.equal(s.ok, true, JSON.stringify(s));
    const step = Math.ceil(input.length / 8);
    for (let i = 0; i < 8; i += 1) { renderer.pushChunk(s.renderId, input.subarray(i * step, (i + 1) * step)); await sleep(40); }
    const res = await renderer.finish(s.renderId);
    assert.equal(res.ok, true, JSON.stringify(res));
    const probe = await ff.run(info.path, ["-hide_banner", "-i", res.file.path]);
    assert.match(probe.stderr, /Audio: aac/);
    const a = analyse(await decodeLeft(info.path, res.file.path), 0.3);
    t.diagnostic(`özet sesi: tepe ${a.peak.toFixed(3)}, RMS ${a.rmsDb.toFixed(1)} dBFS`);
    assert.ok(a.rmsDb > -20, `özet sesi sessiz: RMS ${a.rmsDb}`);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

/* ───────── RTMP aktarıcısı: ağ yetişemezken ses ───────── */

const { EventEmitter } = require("node:events");
const { createRelay } = require("../studio/relay");

/** Yazılanları toplayan sahte aktarıcı süreci (stdin.writableLength elle: ağ tıkanıklığı). */
function collectingChild() {
  const child = new EventEmitter();
  child.written = [];
  child.stdout = Object.assign(new EventEmitter(), { setEncoding() {} });
  child.stderr = Object.assign(new EventEmitter(), { setEncoding() {} });
  child.stdin = Object.assign(new EventEmitter(), { writable: true, destroyed: false, writableLength: 0, write(b) { child.written.push(Buffer.from(b)); return true; }, end() {}, destroy() {} });
  child.kill = () => {};
  return child;
}

test("aktarıcı: ağ tıkanınca görüntü anahtar kareye dek atlanır, SES kesintisiz gider (RTMP'ye giden FLV'de boşluk / tık yok)", { timeout: 120000 }, async (t) => {
  const why = await skipReason();
  if (why) { t.skip(why); return; }
  const info = await getInfo();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "studio-relay-audio-"));
  try {
    const tsFile = path.join(root, "in.ts");
    // Kodlayıcı çıktısı gibi: H.264 (2 sn GOP) + AAC 48 kHz, global başlık, MPEG-TS.
    const mk = await ff.run(info.path, ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc2=s=320x180:r=30", "-f", "lavfi", "-i", "aevalsrc=0.5*sin(2*PI*440*t):s=48000:c=stereo", "-t", "12",
      "-c:v", "libx264", "-preset", "ultrafast", "-g", "60", "-keyint_min", "60", "-b:v", "1500k", "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-ac", "2", "-flags", "+global_header", "-f", "mpegts", tsFile], { timeout: 60000 });
    assert.notEqual(mk.ok, false, mk.stderr);
    const input = fs.readFileSync(tsFile);
    const child = collectingChild();
    const relay = createRelay({ ffmpegPath: info.path, primaryUrl: "rtmp://127.0.0.1/live2/x", spawnImpl: () => child, timers: { setTimeout: () => 0, clearTimeout: () => {} }, highWaterBytes: 100000, lowWaterBytes: 1000 });
    for (let i = 0; i < input.length; i += 4096) {
      const f = i / input.length;
      child.stdin.writableLength = f > 0.35 && f < 0.55 ? 200000 : 0; // ≈ 2,4 sn ağ tıkanıklığı
      relay.write(input.subarray(i, i + 4096));
    }
    assert.equal(relay.status().dropEvents, 1, "atlama olmalı");
    const outTs = path.join(root, "out.ts");
    fs.writeFileSync(outTs, Buffer.concat(child.written));
    // Aktarıcının gerçek komutu (TS → FLV, -c copy), RTMP yerine dosyaya.
    const flv = path.join(root, "relay.flv");
    const args = ff.buildRelayArgs({ url: flv }).filter((x, i, a) => !["-progress", "pipe:1", "-stats_period"].includes(x) && a[i - 1] !== "-stats_period");
    await new Promise((resolve, reject) => {
      const p = spawn(info.path, args, { stdio: ["pipe", "ignore", "pipe"] });
      let err = "";
      p.stderr.on("data", (d) => { err += d; });
      p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(err))));
      p.stdin.end(fs.readFileSync(outTs));
    });
    const probe = await ff.run(info.path, ["-hide_banner", "-i", flv]);
    assert.match(probe.stderr, /Audio: aac \(LC\).*48000 Hz, stereo/);
    const x = await decodeLeft(info.path, flv);
    const a = analyse(x, 0.5);
    const sec = x.length / 48000;
    t.diagnostic(`RTMP'ye giden ses ${sec.toFixed(2)} sn (giriş 12 sn), tık ${a.clicks}, tepe ${a.peak.toFixed(3)}`);
    assert.ok(sec > 11.5, `ses kesildi: ${sec} sn`);
    assert.equal(a.clicks, 0);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

/* ───────── uçtan uca: motor + aktarıcı → yerel RTMP sunucusu; yerel kayıtla aynı ses ───────── */

const { createStudioEngine } = require("../studio/engine");

test("uçtan uca RTMP: sunucuya ulaşan ses AAC-LC 48 kHz stereo, kesintisiz ve tıksız; yerel kayıtla aynı", { timeout: 120000 }, async (t) => {
  const why = await skipReason();
  if (why) { t.skip(why); return; }
  const info = await getInfo();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "studio-rtmp-audio-"));
  const seconds = 8;
  let listener = null;
  let engine = null;
  try {
    const src = path.join(root, "in.webm");
    await makeWebm(info.path, src, { seconds, amp: 0.5 });
    const input = fs.readFileSync(src);
    const port = 19000 + Math.floor(Math.random() * 900);
    const url = `rtmp://127.0.0.1:${port}/live2/anahtar`;
    const recv = path.join(root, "recv.flv");
    listener = spawn(info.path, ["-hide_banner", "-nostdin", "-loglevel", "error", "-listen", "1", "-timeout", "30", "-i", url, "-c", "copy", "-y", recv]);
    const ldone = new Promise((r) => listener.on("exit", r));
    await sleep(500);
    engine = createStudioEngine({ getFfmpeg: async () => ({ ...info, encoders: { libx264: true } }), tempRoot: path.join(root, "seg") });
    const res = await engine.start({ url, width: 320, height: 180, fps: 30, videoBitrateKbps: 600, audioBitrateKbps: 160, mimeType: "video/webm;codecs=vp8,opus", localRecord: { enabled: true, dir: path.join(root, "local") } });
    assert.equal(res.ok, true, JSON.stringify(res));
    assert.equal(res.relay, true);
    const steps = Math.ceil((seconds * 1000) / 250);
    const size = Math.ceil(input.length / steps);
    for (let i = 0; i < steps; i += 1) { engine.pushChunk(input.subarray(i * size, (i + 1) * size)); await sleep(250); }
    await sleep(1500);
    await engine.stop();
    engine = null;
    await sleep(800);
    try { listener.kill("SIGINT"); } catch { /* yoksay */ }
    await ldone;
    listener = null;
    const probe = await ff.run(info.path, ["-hide_banner", "-i", recv]);
    assert.match(probe.stderr, /Audio: aac \(LC\), 48000 Hz, stereo/);
    const x = await decodeLeft(info.path, recv);
    const a = analyse(x, 0.5);
    t.diagnostic(`RTMP sesi ${(x.length / 48000).toFixed(2)} sn, tık ${a.clicks}, tepe ${a.peak.toFixed(3)}`);
    assert.ok(x.length / 48000 > seconds - 1, "ses eksik");
    assert.equal(a.clicks, 0);
    assert.ok(a.peak > 0.45 && a.peak < 0.56, `seviye ${a.peak}`);
    const localDir = path.join(root, "local");
    const local = fs.readdirSync(localDir, { recursive: true }).find((f) => /\.(mkv|mp4)$/.test(String(f)));
    if (local) {
      const l = analyse(await decodeLeft(info.path, path.join(localDir, String(local))), 0.5);
      assert.equal(l.clicks, 0);
      assert.ok(Math.abs(l.peak - a.peak) < 0.03, `yerel ${l.peak} / RTMP ${a.peak}`);
    }
  } finally {
    try { listener?.kill("SIGKILL"); } catch { /* yoksay */ }
    if (engine) await engine.stop().catch(() => {});
    fs.rmSync(root, { recursive: true, force: true });
  }
});
