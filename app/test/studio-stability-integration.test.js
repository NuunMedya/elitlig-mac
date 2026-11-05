"use strict";
// Gerçek ffmpeg ile (yoksa atlanır):
//   - açı kopya kipi: H.264 Matroska → -c:v copy 1 sn TS parçaları; yeniden
//     kodlamaya göre işlemci süresi (ffmpeg -benchmark utime) ölçülür,
//   - açılar gerçek motorla kopya kipinde: parçalar, tekrar için concat MP4,
//   - yerel tam kayıt: MKV kayıt sürerken büyür, durdurunca +faststart MP4,
//   - röportaj: halka küçükken bile sabitlenen parçalar MP4'e birleşir.
//   ELITLIG_FFMPEG=/yol/ffmpeg  kullanılacak ikili
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const ff = require("../studio/ffmpeg");
const ffargs = require("../studio/ffargs");
const { createStudioEngine } = require("../studio/engine");
const { createAngles } = require("../studio/angles");
const { remuxParts } = require("../studio/localrecord");
const { createInterviews } = require("../studio/interview");

const candidate = ff.resolveFfmpeg({ resourcesPath: null });
let infoPromise = null;
const getInfo = () => (infoPromise ||= ff.probeFfmpeg(candidate));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const skipReason = async () => {
  if (!candidate) return "ffmpeg yok";
  const info = await getInfo();
  if (!info.available) return `ffmpeg eksik: ${info.error}`;
  const enc = ff.parseCodecList((await ff.run(candidate.path, ["-hide_banner", "-encoders"])).stdout);
  if (!enc.has("libx264")) return "libx264 yok (sentetik H.264 giriş üretilemez)";
  if (!enc.has("libopus")) return "libopus yok";
  return null;
};

/** Sentetik MediaRecorder çıktısı: H.264 (1 sn'de bir anahtar kare) + Opus, Matroska. */
function makeInput(ffmpegPath, seconds, { size = "640x360", rate = 30 } = {}) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const p = spawn(ffmpegPath, [
      "-hide_banner", "-nostdin", "-loglevel", "error",
      "-f", "lavfi", "-i", `testsrc2=size=${size}:rate=${rate}`, "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000",
      "-t", String(seconds), "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-g", String(rate), "-keyint_min", String(rate),
      "-c:a", "libopus", "-b:a", "96k", "-f", "matroska", "-live", "1", "pipe:1",
    ]);
    p.stdout.on("data", (d) => chunks.push(d));
    let err = "";
    p.stderr.on("data", (d) => { err += d; });
    p.on("exit", (code) => (code === 0 ? resolve(Buffer.concat(chunks)) : reject(new Error(err || `ffmpeg ${code}`))));
  });
}

/** Girişi gerçek zamanlı, 250 ms'lik parçalar halinde yollar. */
async function feed(push, input, seconds, { from = 0, to = Infinity } = {}) {
  const steps = Math.ceil((seconds * 1000) / 250);
  const size = Math.ceil(input.length / steps);
  for (let i = from; i < Math.min(steps, to); i += 1) {
    push(input.subarray(i * size, (i + 1) * size));
    await sleep(250);
  }
}

/** Komutu stdin'e girişi vererek çalıştırır; ffmpeg -benchmark ile kullanıcı işlemci süresi (sn). */
function runBenchmark(ffmpegPath, args, input, cwd) {
  return new Promise((resolve, reject) => {
    const a = args.map((x) => (x === "level+warning" || x === "level+info" ? "info" : x));
    a.splice(1, 0, "-benchmark");
    const p = spawn(ffmpegPath, a, { cwd, stdio: ["pipe", "ignore", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => { err += d; });
    p.stdin.on("error", () => {});
    p.stdin.end(input);
    p.on("exit", (code) => {
      const m = /bench: utime=([\d.]+)s stime=([\d.]+)s/.exec(err);
      if (code !== 0 || !m) { reject(new Error(err.slice(-800) || `ffmpeg ${code}`)); return; }
      resolve({ cpuSec: Number(m[1]) + Number(m[2]), stderr: err });
    });
  });
}

const probe = async (info, file) => (await ff.run(info.path, ["-hide_banner", "-i", file])).stderr;

test("açı kopya kipi: yeniden kodlamaya göre işlemci süresi çok düşük; parçalar 1 sn, H.264 aynı boyut", { timeout: 120000 }, async (t) => {
  const why = await skipReason();
  if (why) { t.skip(why); return; }
  const info = await getInfo();
  const input = await makeInput(info.path, 10, { size: "1280x720" });
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "studio-cpu-"));
  const copyDir = path.join(root, "copy");
  const encDir = path.join(root, "enc");
  fs.mkdirSync(copyDir);
  fs.mkdirSync(encDir);
  const base = { ...ffargs.angleOptions({ width: 1280, height: 720, fps: 30 }), encoder: "libx264" };
  const copy = await runBenchmark(info.path, ffargs.buildAngleArgs({ ...base, copy: true }), input, copyDir);
  const enc = await runBenchmark(info.path, ffargs.buildAngleArgs({ ...base, copy: false }), input, encDir);
  t.diagnostic(`işlemci süresi (10 sn 720p): kopya ${copy.cpuSec.toFixed(2)} sn · yeniden kodlama ${enc.cpuSec.toFixed(2)} sn · oran ${(enc.cpuSec / Math.max(0.01, copy.cpuSec)).toFixed(1)}×`);
  assert.ok(copy.cpuSec * 4 < enc.cpuSec, `kopya ${copy.cpuSec} sn, kodlama ${enc.cpuSec} sn`);
  const segs = fs.readdirSync(copyDir).filter((n) => /^seg\d+\.ts$/.test(n)).sort();
  assert.ok(segs.length >= 9 && segs.length <= 11, `parça sayısı ${segs.length}`);
  const list = fs.readFileSync(path.join(copyDir, "list.csv"), "utf8").trim().split("\n").map((l) => l.split(","));
  for (const [, s, e] of list.slice(0, -1)) assert.ok(Math.abs(Number(e) - Number(s) - 1) < 0.1, `parça süresi ${Number(e) - Number(s)}`);
  const p = await probe(info, path.join(copyDir, segs[1]));
  assert.match(p, /Video: h264/);
  assert.match(p, /1280x720/);
  assert.match(p, /Audio: aac/);
  fs.rmSync(root, { recursive: true, force: true });
});

test("açılar (gerçek motor, kopya kipi): H.264 kaydedici → parça halkası → tekrar MP4'ü", { timeout: 90000 }, async (t) => {
  const why = await skipReason();
  if (why) { t.skip(why); return; }
  const info = await getInfo();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "studio-ang-"));
  const angles = createAngles({ getFfmpeg: async () => info, tempRoot: root });
  const seconds = 6;
  const input = await makeInput(info.path, seconds);
  const res = await angles.start({ sources: [{ id: "cam1", name: "Kamera 1", width: 640, height: 360, fps: 30, mimeType: "video/x-matroska;codecs=avc1,opus" }] });
  assert.equal(res.ok, true, JSON.stringify(res));
  try {
    await feed((b) => angles.pushChunk("cam1", b), input, seconds);
    await sleep(500);
    const [st] = angles.status();
    assert.equal(st.mode, "copy");
    assert.equal(st.state, "recording", JSON.stringify(st));
    const [src] = angles.clipSources(["cam1"]);
    assert.ok(src.complete.length >= 3, `parça ${src.complete.length}`);
    const work = path.join(root, "out");
    fs.mkdirSync(work);
    const listFile = path.join(work, "l.txt");
    fs.writeFileSync(listFile, `${src.complete.map((s) => ff.concatLine(s.path)).join("\n")}\n`);
    const out = path.join(work, "a.mp4");
    const r = await ff.run(info.path, ffargs.buildConcatLevelArgs(listFile, out, { width: 640, height: 360, fps: 30 }));
    assert.equal(r.ok, true, r.stderr);
    const p = await probe(info, out);
    assert.match(p, /Video: h264.*640x360/);
    t.diagnostic(`açı parçaları ${src.complete.length}, tampon ${st.bufferedMs} ms`);
  } finally {
    await angles.stop();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("yerel tam kayıt: MKV kayıt sürerken büyür (yol kaçışı), durdurunca +faststart MP4; MKV silinir", { timeout: 90000 }, async (t) => {
  const why = await skipReason();
  if (why) { t.skip(why); return; }
  const info = await getInfo();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "studio-loc-"));
  // tee kaçışı: ' ve | (Windows'ta | dosya adında olamaz).
  const recDir = path.join(root, process.platform === "win32" ? "Maç 'kayıt' klasör" : "Maç 'kayıt' | klasör");
  const engine = createStudioEngine({
    getFfmpeg: async () => info,
    tempRoot: path.join(root, "seg"),
    remuxLocal: ({ parts, outFile }) => remuxParts({ parts, outFile, ffmpegPath: info.path }),
  });
  const statuses = [];
  engine.events.on("status", (s) => statuses.push(s));
  const localDone = new Promise((resolve) => engine.events.on("local", (j) => { if (j.state !== "remuxing") resolve(j); }));
  const seconds = 8;
  const input = await makeInput(info.path, seconds);
  const res = await engine.start({ url: null, width: 640, height: 360, fps: 30, videoBitrateKbps: 1200, localRecord: { enabled: true, dir: recDir, name: "Test Maçı" } });
  assert.equal(res.ok, true, JSON.stringify(res));
  await feed((b) => engine.pushChunk(b), input, seconds);
  const sizes = statuses.filter((s) => s.state === "recording").map((s) => s.localBytes);
  assert.ok(sizes.length > 3);
  assert.ok(sizes.at(-1) > sizes[1] && sizes.at(-1) > 200000, `MKV boyutları ${sizes.join(",")}`);
  const mkv = statuses.at(-1).localPath;
  assert.match(path.basename(mkv), /^ElitLig-Test-Maci-\d{8}-\d{6}\.mkv$/);
  assert.equal(path.dirname(mkv), recDir);
  // Kayıt sürerken MKV açılabilir (çökmeye dayanıklı).
  assert.match(await probe(info, mkv), /Video: h264/);
  await engine.stop();
  const done = await localDone;
  assert.equal(done.state, "done", JSON.stringify(done));
  assert.equal(fs.existsSync(mkv), false);
  const mp4 = done.path;
  assert.match(mp4, /\.mp4$/);
  const p = await probe(info, mp4);
  assert.match(p, /Video: h264/);
  assert.match(p, /Audio: aac/);
  const dur = ff.parseProbe(p).durationMs;
  assert.ok(dur > 6000 && dur < 10000, `süre ${dur}`);
  const head = fs.readFileSync(mp4).subarray(0, 64 * 1024).toString("latin1");
  assert.ok(head.indexOf("moov") >= 0 && (head.indexOf("mdat") < 0 || head.indexOf("moov") < head.indexOf("mdat")), "faststart");
  assert.equal(statuses.at(-1).localRemux, "done");
  t.diagnostic(`MKV ${sizes.at(-1)} B → MP4 ${fs.statSync(mp4).size} B, ${dur} ms`);
  fs.rmSync(root, { recursive: true, force: true });
});

test("röportaj: halka 2 parça tutarken sabitlenen ~8 sn MP4'e birleşir (+kapak, düzey)", { timeout: 90000 }, async (t) => {
  const why = await skipReason();
  if (why) { t.skip(why); return; }
  const info = await getInfo();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "studio-iv-"));
  const engine = createStudioEngine({ getFfmpeg: async () => info, tempRoot: path.join(root, "seg"), keepSegments: 2 });
  const interviews = createInterviews({ engine, interviewsDir: path.join(root, "interviews"), getFfmpegPath: () => info.path });
  const seconds = 13;
  const input = await makeInput(info.path, seconds);
  const res = await engine.start({ url: null, width: 640, height: 360, fps: 30, videoBitrateKbps: 1200 });
  assert.equal(res.ok, true);
  try {
    const steps = Math.ceil((seconds * 1000) / 250);
    await feed((b) => engine.pushChunk(b), input, seconds, { to: 16 }); // ~4 sn
    const r = interviews.start({ matchId: 42, label: "Röportaj" });
    assert.equal(r.ok, true, JSON.stringify(r));
    await feed((b) => engine.pushChunk(b), input, seconds, { from: 16, to: steps }); // ~9 sn daha
    assert.ok(engine.clipSources().complete.length <= 2, "halka küçük");
    const done = await interviews.stop(r.interview.id);
    assert.equal(done.ok, true, JSON.stringify(done));
    const iv = done.interview;
    assert.ok(iv.durationMs >= 7000 && iv.durationMs <= 12500, `süre ${iv.durationMs}`);
    assert.equal(iv.width, 640);
    assert.ok(iv.posterPath && fs.existsSync(iv.posterPath));
    const p = await probe(info, iv.path);
    assert.match(p, /Video: h264/);
    assert.match(p, /Audio: aac/);
    t.diagnostic(`röportaj ${iv.durationMs} ms ${iv.sizeBytes} B (halka: ${engine.clipSources().complete.length} parça)`);
  } finally {
    await engine.stop();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
