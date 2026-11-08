"use strict";
// [gol-klip] Seçilen / yayına verilen açıların kurgusu (replays.composeSelection) ve gecikmeli
// gol yüklemesinin ana süreç tarafı: bölüm doğrulama, komut kurulumu, gerçek ffmpeg ile
// birleştirme (H.264 High yuv420p + AAC + faststart, süre = bölümler toplamı), uploadGoalClip'in
// kurguyu yüklemesi, canlı yayında hız sınırlı PUT ve ana süreci dondurmayan parça kopyası.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { createReplayStore, normalizeSegments, normalizeSelection, buildSelectionArgs, planReplay, MAX_SECONDS } = require("../studio/replays");
const { uploadGoalClip } = require("../studio/clips");
const { throttle } = require("../studio/highlights");

const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));
const hasFfmpeg = (() => {
  try { execFileSync("ffmpeg", ["-hide_banner", "-version"], { stdio: "ignore" }); return true; } catch { return false; }
})();
const ID = "r20261107120000-abc123";

const META = {
  id: ID, createdAt: "2026-11-07T12:00:00.000Z", label: "Gol", kind: "goal", eventId: 9,
  angles: [
    { angle: "program", name: "Program", file: "program.mp4", durationMs: 6000, width: 320, height: 180, fps: 30, startWall: 10_000, endWall: 16_000 },
    { angle: "cam-1", name: "Kale arkası", file: "angle-1.mp4", durationMs: 5000, width: 256, height: 192, fps: 30, startWall: 11_000, endWall: 16_000 },
  ],
};

test("bölümler: bilinmeyen açı atlanır, giriş / çıkış açının süresine sığar, çıkışsız = sona kadar", () => {
  const segs = normalizeSegments([
    { angle: "cam-1", inSec: 1, outSec: 3 },
    { angle: "yok", inSec: 0, outSec: 2 },
    { angle: "program", inSec: 4, outSec: 99 },
    { angle: "program", inSec: 2 }, // çıkış yok → 6 sn
    { angle: "cam-1", inSec: 4.9, outSec: 5 }, // çok kısa
  ], META);
  assert.deepEqual(segs, [
    { angle: "cam-1", inSec: 1, outSec: 3 },
    { angle: "program", inSec: 4, outSec: 6 },
    { angle: "program", inSec: 2, outSec: 6 },
  ]);
  assert.equal(normalizeSelection({ angles: ["cam-1", "yok", "cam-1"], segments: [] }, META).angles.join(), "cam-1");
  assert.equal(normalizeSelection({ angles: [], segments: [] }, META), null);
});

test("kurgu komutu: her bölüm ayrı giriş, ses programın aynı anından (açı 1 sn geç başladı → +1 sn)", () => {
  const args = buildSelectionArgs({
    out: "o.mp4", size: { width: 320, height: 180 }, fps: 30,
    segments: [
      { path: "a.mp4", inSec: 1, durationSec: 2, audio: { path: "p.mp4", startSec: 2, leadSec: 0 } },
      { path: "b.mp4", inSec: 0, durationSec: 1, audio: null },
    ],
  });
  const fc = args[args.indexOf("-filter_complex") + 1];
  assert.match(fc, /\[0:v:0\]scale=320:180:force_original_aspect_ratio=decrease/);
  assert.match(fc, /\[2:a:0\]aresample=48000/);
  assert.match(fc, /anullsrc=r=48000:cl=stereo,atrim=end=1\.000/);
  assert.match(fc, /\[v0\]\[a0\]\[v1\]\[a1\]concat=n=2:v=1:a=1\[v\]\[a\]/);
  assert.equal(args[args.indexOf("-c:v") + 1], "libx264");
  assert.equal(args[args.indexOf("-pix_fmt") + 1], "yuv420p");
  assert.equal(args[args.indexOf("-c:a") + 1], "aac");
  assert.equal(args[args.indexOf("-movflags") + 1], "+faststart");
  // a.mp4 -ss 1 -t 2, p.mp4 -ss 2
  assert.deepEqual(args.slice(args.indexOf("a.mp4") - 5, args.indexOf("a.mp4") + 1), ["-ss", "1.000", "-t", "2.000", "-i", "a.mp4"]);
  assert.equal(args[args.indexOf("p.mp4") - 4], "2.000");
});

test("tekrar penceresi 30 sn'yi aşabilir (öncesi + butondan sonrası), en çok 60 sn", () => {
  assert.equal(MAX_SECONDS, 60);
  const complete = Array.from({ length: 30 }, (_, i) => ({ index: i, path: `s${i}`, wallStart: i * 2000, wallEnd: (i + 1) * 2000 }));
  const plan = planReplay({ sources: [{ angle: "program", complete, growing: null }], seconds: 45 });
  assert.equal(plan.plans[0].durationMs, 46000); // 2 sn parça sınırına yuvarlanır
});

function makeClip(file, { size, seconds, audio }) {
  execFileSync("ffmpeg", [
    "-hide_banner", "-nostdin", "-loglevel", "error", "-y",
    "-f", "lavfi", "-i", `testsrc2=size=${size}:rate=30`,
    ...(audio ? ["-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000"] : []),
    "-t", String(seconds), "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
    ...(audio ? ["-c:a", "aac"] : ["-an"]), "-shortest", file,
  ]);
}

test("gerçek ffmpeg: iki açının bölümleri sırayla tek web klibi (H.264 High yuv420p + AAC + faststart)", { timeout: 60000, skip: !hasFfmpeg && "ffmpeg yok" }, async () => {
  const root = tmp("rep-sel-");
  const dir = path.join(root, ID);
  fs.mkdirSync(dir);
  makeClip(path.join(dir, "program.mp4"), { size: "320x180", seconds: 6, audio: true });
  makeClip(path.join(dir, "angle-1.mp4"), { size: "256x192", seconds: 5, audio: false });
  fs.writeFileSync(path.join(dir, "replay.json"), JSON.stringify(META));
  const store = createReplayStore({ replaysDir: root, getFfmpegPath: () => "ffmpeg" });
  const out = await store.composeSelection(ID, [{ angle: "cam-1", inSec: 1, outSec: 3 }, { angle: "program", inSec: 3.5, outSec: 5.5 }]);
  assert.ok(out, "kurgu üretilmedi");
  assert.equal(out.width, 320);
  assert.equal(out.height, 180);
  assert.ok(out.durationMs >= 3700 && out.durationMs <= 4400, `süre ${out.durationMs}`);
  let probe = "";
  try { execFileSync("ffmpeg", ["-hide_banner", "-i", out.path], { stdio: ["ignore", "pipe", "pipe"] }); } catch (e) { probe = String(e.stderr); }
  assert.match(probe, /Video: h264 \(High\).*yuv420p/);
  assert.match(probe, /Audio: aac.*48000 Hz, stereo/);
  const head = fs.readFileSync(out.path).subarray(0, 64 * 1024).toString("latin1");
  assert.ok(head.indexOf("moov") >= 0 && (head.indexOf("mdat") < 0 || head.indexOf("moov") < head.indexOf("mdat")), "faststart");
  assert.ok(out.posterPath && fs.statSync(out.posterPath).size > 500, "kapak");
  // Aynı bölümler: önbellekten (yeniden kodlanmaz).
  const mtime = fs.statSync(out.path).mtimeMs;
  const again = await store.composeSelection(ID, [{ angle: "cam-1", inSec: 1, outSec: 3 }, { angle: "program", inSec: 3.5, outSec: 5.5 }]);
  assert.equal(fs.statSync(again.path).mtimeMs, mtime);
  // Seçim replay.json'a yazılır ve okunur.
  const up = store.update(ID, { selection: { angles: ["cam-1", "program"], segments: out.segments, aired: true } });
  assert.equal(up.replay.selection.aired, true);
  assert.deepEqual(up.replay.selection.segments, out.segments);
  // Program açısına bile düşük öncelik: arka plan işleri niceness ile çalışır.
  const seen = [];
  const spy = createReplayStore({ replaysDir: root, getFfmpegPath: () => "ffmpeg", runImpl: async (f, a, o) => { seen.push(o); return { ok: false, stderr: "" }; } });
  await spy.composeSelection(ID, [{ angle: "program", inSec: 0, outSec: 1 }]);
  assert.ok(seen.some((o) => o?.niceness === 10), JSON.stringify(seen));
  fs.rmSync(root, { recursive: true, force: true });
});

test("uploadGoalClip: bölüm seçildiyse KURGU yüklenir (süre / boyut kurgudan), olmazsa program web kopyası", async () => {
  const dir = tmp("rep-sel-up-");
  const prog = path.join(dir, "program.mp4");
  const sel = path.join(dir, "selection.web.mp4");
  const web = path.join(dir, "program.web.mp4");
  fs.writeFileSync(prog, Buffer.alloc(100, 1));
  fs.writeFileSync(sel, Buffer.alloc(300, 2));
  fs.writeFileSync(web, Buffer.alloc(200, 3));
  const updates = [];
  let composeOk = true;
  const replays = {
    get: () => ({ id: ID, eventId: 9, angles: [{ angle: "program", path: prog, sizeBytes: 100, durationMs: 6000, width: 1920, height: 1080 }] }),
    composeSelection: async (id, segs) => (composeOk ? { path: sel, sizeBytes: 300, posterPath: null, durationMs: 4000, width: 1280, height: 720, segments: segs } : null),
    webCopy: async () => ({ path: web, sizeBytes: 200, posterPath: null, durationMs: 6000, width: 1920, height: 1080 }),
    update: (id, patch) => updates.push(patch),
  };
  const bodies = [];
  const api = {
    request: async (o) => {
      bodies.push(o);
      if (o.path.endsWith("/upload-url")) return { ok: true, data: { upload_url: "https://s/x", key: "k" } };
      return { ok: true, data: { id: 77, url: "https://cdn/x.mp4" } };
    },
  };
  const puts = [];
  const putImpl = async (url, o) => { puts.push(o.file); return { ok: true, status: 200 }; };
  const segments = [{ angle: "cam-1", inSec: 1, outSec: 3 }, { angle: "program", inSec: 3, outSec: 5 }];
  const res = await uploadGoalClip(api, { matchId: 5, eventId: 9, replayId: ID, angle: "program", durationMs: 6000, segments }, { replays, putImpl });
  assert.equal(res.ok, true, JSON.stringify(res));
  assert.deepEqual(res.composed, segments);
  assert.equal(puts[0], sel);
  assert.equal(bodies[0].body.duration_ms, 4000);
  assert.equal(bodies[0].body.width, 1280);
  assert.deepEqual(updates[0].uploaded.segments, segments);
  composeOk = false;
  puts.length = 0;
  const res2 = await uploadGoalClip(api, { matchId: 5, eventId: 9, replayId: ID, angle: "program", segments }, { replays, putImpl });
  assert.equal(res2.ok, true);
  assert.equal(puts[0], web);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("canlı yayında yükleme hız sınırlı: 256 KB, 128 KB/sn → ≥ 2 sn sürer, veri aynen geçer", async () => {
  let clock = 0;
  const waits = [];
  const t = throttle(128 * 1024, { now: () => clock, sleep: async (ms) => { waits.push(ms); clock += ms; } });
  const out = [];
  t.on("data", (d) => out.push(d));
  const done = new Promise((r) => t.on("end", r));
  const data = Buffer.alloc(256 * 1024, 7);
  t.end(data);
  await done;
  assert.equal(Buffer.concat(out).equals(data), true);
  assert.ok(clock >= 2000 - 1, `süre ${clock}`);
  assert.ok(waits.length >= 3);
});

test("tekrar kaydı parçaları EŞZAMANSIZ kopyalar (ana süreç, yani yayın parçalarının ffmpeg'e yazımı, donmaz)", () => {
  const src = fs.readFileSync(path.join(__dirname, "../studio/replays.js"), "utf8");
  const save = src.slice(src.indexOf("async function copyItems"), src.indexOf("async function save("));
  assert.doesNotMatch(save, /copyFileSync/);
  assert.match(save, /fs\.promises\.copyFile/);
});
