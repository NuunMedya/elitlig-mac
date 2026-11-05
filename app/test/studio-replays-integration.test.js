"use strict";
// Gerçek ffmpeg ile uçtan uca: program + 2 açı ~14 sn sentetik kayıt → 10 sn'lik
// tekrar (3 MP4, süreler ±1,2 sn, H.264 düzeyi doğru, kapaklar) ve kısa bir
// WebM'den öne çıkanlar oturumu → geçerli MP4. ffmpeg yoksa atlanır.
//   ELITLIG_FFMPEG=/yol/ffmpeg  kullanılacak ikili
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const ff = require("../studio/ffmpeg");
const { createStudioEngine } = require("../studio/engine");
const { createAngles } = require("../studio/angles");
const { createReplayStore } = require("../studio/replays");
const { createRenderer } = require("../studio/render");
const { computeH264Level, levelIdc } = require("../studio/h264level");

const candidate = ff.resolveFfmpeg({ resourcesPath: null });
let infoPromise = null;
const getInfo = () => (infoPromise ||= ff.probeFfmpeg(candidate));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// ffprobe varsa düzey doğrulanır (ffmpeg'in yanında ya da PATH'te).
const ffprobePath = () => {
  if (!candidate) return null;
  const exe = process.platform === "win32" ? "ffprobe.exe" : "ffprobe";
  const near = path.join(path.dirname(candidate.path), exe);
  return ff.isExecutable(near) ? near : null;
};

function makeInput(ffmpegPath, seconds, { size = "640x360", video = "h264", audio = true, rate = 30 } = {}) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const v = video === "h264" ? ["-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-g", String(rate)] : ["-c:v", "libvpx", "-deadline", "realtime", "-cpu-used", "8", "-b:v", "1M", "-g", String(rate)];
    const p = spawn(ffmpegPath, [
      "-hide_banner", "-nostdin", "-loglevel", "error",
      "-f", "lavfi", "-i", `testsrc2=size=${size}:rate=${rate}`,
      ...(audio ? ["-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000"] : []),
      "-t", String(seconds), ...v,
      ...(audio ? ["-c:a", "libopus", "-b:a", "96k"] : []),
      "-f", video === "h264" ? "matroska" : "webm", "-live", "1", "pipe:1",
    ]);
    p.stdout.on("data", (d) => chunks.push(d));
    let err = "";
    p.stderr.on("data", (d) => { err += d; });
    p.on("exit", (code) => (code === 0 ? resolve(Buffer.concat(chunks)) : reject(new Error(err || `ffmpeg ${code}`))));
  });
}

/** Girişleri gerçek zamanlı, 250 ms'lik parçalar halinde yollar (ilk parça başlıktır). */
async function feedAll(feeds, seconds) {
  const steps = Math.ceil((seconds * 1000) / 250);
  for (let i = 0; i < steps; i += 1) {
    for (const { input, push } of feeds) {
      const size = Math.ceil(input.length / steps);
      push(input.subarray(i * size, (i + 1) * size));
    }
    await sleep(250);
  }
}

const skipReason = async () => {
  if (!candidate) return "ffmpeg yok";
  const info = await getInfo();
  if (!info.available) return `ffmpeg eksik: ${info.error}`;
  if (!info.encoders.libx264) return "libx264 yok";
  const enc = ff.parseCodecList((await ff.run(candidate.path, ["-hide_banner", "-encoders"])).stdout);
  if (!enc.has("libopus") || !enc.has("libvpx")) return "libopus / libvpx yok (sentetik giriş üretilemez)";
  return null;
};

async function streamLevel(file) {
  const probe = ffprobePath();
  if (!probe) return null;
  const r = await ff.run(probe, ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=level,profile", "-of", "default=nw=1", file]);
  return { level: Number(r.stdout.match(/level=(\d+)/)?.[1]), profile: r.stdout.match(/profile=(.*)/)?.[1] };
}

test("uçtan uca: program + 2 açı → 10 sn'lik tekrar, 3 MP4 aynı süre ±1,2 sn, doğru düzey", { timeout: 120000 }, async (t) => {
  const why = await skipReason();
  if (why) { t.skip(why); return; }
  const info = await getInfo();
  // Bu testte x264 (CI'da VideoToolbox / donanım kodlayıcı olmayabilir).
  const getFfmpeg = async () => ({ ...info, encoders: { libx264: true } });
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "studio-rep-int-"));
  const seconds = 14;
  const [prog, cam1, cam2] = await Promise.all([
    makeInput(info.path, seconds),
    makeInput(info.path, seconds, { size: "1280x720", video: "vp8", audio: false }),
    makeInput(info.path, seconds, { size: "640x480", video: "vp8", audio: false }),
  ]);
  const engine = createStudioEngine({ getFfmpeg, tempRoot: path.join(root, "seg") });
  const angles = createAngles({ getFfmpeg, tempRoot: path.join(root, "angles") });
  const res = await engine.start({ url: null, width: 640, height: 360, fps: 30, videoBitrateKbps: 1200 });
  assert.equal(res.ok, true, JSON.stringify(res));
  const a = await angles.start({ sources: [{ id: "cam-1", name: "Kale arkası", width: 1280, height: 720 }, { id: "cam-2", name: "Tribün", width: 640, height: 480 }] });
  assert.deepEqual(a.started, ["cam-1", "cam-2"]);
  await feedAll([
    { input: prog, push: (c) => engine.pushChunk(c) },
    { input: cam1, push: (c) => angles.pushChunk("cam-1", c) },
    { input: cam2, push: (c) => angles.pushChunk("cam-2", c) },
  ], seconds);
  const st = angles.status();
  assert.deepEqual(st.map((s) => [s.id, s.state, s.encoder]), [["cam-1", "recording", "libx264"], ["cam-2", "recording", "libx264"]]);
  assert.ok(st.every((s) => s.bufferedMs > 8000), JSON.stringify(st));

  const store = createReplayStore({ replaysDir: path.join(root, "replays"), getFfmpegPath: () => info.path });
  const saved = await store.save({ sources: [{ angle: "program", name: "Program", ...engine.clipSources() }, ...angles.clipSources()], seconds: 10, kind: "goal", eventId: 5 });
  assert.equal(saved.ok, true, JSON.stringify(saved));
  const r = saved.replay;
  assert.deepEqual(r.angles.map((x) => x.angle), ["program", "cam-1", "cam-2"]);
  assert.deepEqual(r.angles.map((x) => [x.width, x.height]), [[640, 360], [1280, 720], [640, 480]]);
  const durations = r.angles.map((x) => x.durationMs);
  assert.ok(durations.every((d) => d >= 8000 && d <= 12500), durations.join(","));
  assert.ok(Math.max(...durations) - Math.min(...durations) <= 1200, `süreler ${durations.join(",")}`);
  for (const x of r.angles) {
    const probe = await ff.run(info.path, ["-hide_banner", "-i", x.path]);
    assert.match(probe.stderr, /Video: h264 \(High\)/);
    const head = fs.readFileSync(x.path).subarray(0, 64 * 1024).toString("latin1");
    assert.ok(head.indexOf("moov") >= 0 && (head.indexOf("mdat") < 0 || head.indexOf("moov") < head.indexOf("mdat")), "faststart");
    assert.ok(x.posterUrl && fs.statSync(x.path.replace(/\.mp4$/, ".jpg")).size > 1000, "kapak");
    const lv = await streamLevel(x.path);
    if (lv) assert.equal(lv.level, levelIdc(computeH264Level(x.width, x.height, 30)), `${x.angle} düzey ${lv.level}`);
  }
  assert.match(String((await ff.run(info.path, ["-hide_banner", "-i", r.angles[0].path])).stderr), /Audio: aac/);
  t.diagnostic(`tekrar ${r.id}: ${r.angles.map((x) => `${x.angle} ${x.durationMs} ms ${x.width}x${x.height} ${x.sizeBytes} B`).join(" · ")}`);
  await Promise.all([engine.stop(), angles.stop()]);
  assert.equal(angles.active(), false);
  fs.rmSync(root, { recursive: true, force: true });
});

test("uçtan uca: öne çıkanlar oturumu (WebM parçaları) → H.264 High + AAC MP4, kapak", { timeout: 60000 }, async (t) => {
  const why = await skipReason();
  if (why) { t.skip(why); return; }
  const info = await getInfo();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "studio-render-int-"));
  const input = await makeInput(info.path, 3, { size: "1280x720", video: "vp8", audio: true });
  const renderer = createRenderer({ getFfmpeg: async () => ({ ...info, encoders: { libx264: true } }), highlightsDir: path.join(root, "highlights"), tempRoot: path.join(root, "tmp") });
  const progress = [];
  renderer.events.on("progress", (p) => progress.push(p));
  const s = await renderer.start({ width: 1280, height: 720, fps: 30, videoBitrateKbps: 4000, mimeType: "video/webm;codecs=vp8,opus" });
  assert.equal(s.ok, true);
  const step = Math.ceil(input.length / 12);
  for (let i = 0; i < 12; i += 1) {
    renderer.pushChunk(s.renderId, input.subarray(i * step, (i + 1) * step));
    await sleep(50);
  }
  const res = await renderer.finish(s.renderId);
  assert.equal(res.ok, true, JSON.stringify(res));
  const f = res.file;
  assert.deepEqual([f.width, f.height], [1280, 720]);
  assert.ok(f.durationMs >= 2500 && f.durationMs <= 3600, `süre ${f.durationMs}`);
  assert.ok(f.posterUrl);
  const probe = await ff.run(info.path, ["-hide_banner", "-i", f.path]);
  assert.match(probe.stderr, /Video: h264 \(High\).*yuv420p/);
  assert.match(probe.stderr, /Audio: aac/);
  const head = fs.readFileSync(f.path).subarray(0, 64 * 1024).toString("latin1");
  assert.ok(head.indexOf("moov") >= 0 && (head.indexOf("mdat") < 0 || head.indexOf("moov") < head.indexOf("mdat")), "faststart");
  const lv = await streamLevel(f.path);
  if (lv) assert.equal(lv.level, 41);
  assert.ok(progress.length >= 1);
  assert.deepEqual(fs.readdirSync(path.join(root, "tmp")), []);
  t.diagnostic(`öne çıkan ${f.name}: ${f.durationMs} ms ${f.sizeBytes} B düzey ${lv?.level ?? "?"}`);
  fs.rmSync(root, { recursive: true, force: true });
});
