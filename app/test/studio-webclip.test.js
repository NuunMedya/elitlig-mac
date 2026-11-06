"use strict";
// Yayın Stüdyosu: siteye yüklenen gol klibinin web kopyası (sitede siyah
// görüntü hatası). Komut kurulumu saf; uçtan uca kısım sistemdeki ffmpeg ile
// (yoksa atlanır) tarayıcının çözemeyeceği bir kaynağı (High 4:4:4, moov
// sonda) kopyaya çevirip sonucu doğrular.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { buildWebClipArgs, buildWebPosterArgs, webClipSize, prepareWebClip, createClipStore, uploadGoalClip } = require("../studio/clips");
const { createReplayStore } = require("../studio/replays");

const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));
const hasFfmpeg = (() => {
  try { execFileSync("ffmpeg", ["-hide_banner", "-version"], { stdio: "ignore" }); return true; } catch { return false; }
})();
const hasFfprobe = (() => {
  try { execFileSync("ffprobe", ["-hide_banner", "-version"], { stdio: "ignore" }); return true; } catch { return false; }
})();
const opt = (args, name) => args[args.indexOf(name) + 1];

test("web kopyası komutu: H.264 High yuv420p + AAC + faststart, 1080p kutusu, düzey", () => {
  const args = buildWebClipArgs("in.mp4", "out.mp4", { width: 1920, height: 1080, fps: 59.94, hasAudio: true });
  assert.equal(opt(args, "-c:v"), "libx264");
  assert.equal(opt(args, "-profile:v"), "high");
  assert.equal(opt(args, "-pix_fmt"), "yuv420p");
  assert.match(opt(args, "-vf"), /format=yuv420p$/);
  assert.match(opt(args, "-vf"), /fps=60/);
  assert.equal(opt(args, "-level"), "4.2");
  assert.equal(opt(args, "-c:a"), "aac");
  assert.equal(opt(args, "-movflags"), "+faststart");
  assert.equal(args.at(-1), "out.mp4");
  const silent = buildWebClipArgs("in.mp4", "out.mp4", { width: 3840, height: 2160, fps: 30, hasAudio: false });
  assert.ok(silent.includes("-an"));
  assert.match(opt(silent, "-vf"), /^scale=1920:1080:/);
  assert.deepEqual(webClipSize(1081, 721), { width: 1080, height: 720 });
  assert.deepEqual(webClipSize(null, null), { width: 1280, height: 720 });
});

test("web kapağı ~1. saniyeden (kısa klipte ortadan)", () => {
  assert.equal(opt(buildWebPosterArgs("v.mp4", "p.jpg", { durationMs: 10000 }), "-ss"), "1.000");
  assert.equal(opt(buildWebPosterArgs("v.mp4", "p.jpg", { durationMs: 1200 }), "-ss"), "0.600");
  assert.equal(opt(buildWebPosterArgs("v.mp4", "p.jpg"), "-ss"), "1.000");
});

test("web kopyası olmazsa null (bozuk / sahte dosya): yükleme özgün dosyaya düşer", async () => {
  const dir = tmp("webclip-bad");
  const file = path.join(dir, "program.mp4");
  fs.writeFileSync(file, Buffer.alloc(1000, 1));
  const runImpl = async () => ({ ok: false, stderr: "Invalid data found when processing input" });
  assert.equal(await prepareWebClip({ input: file, ffmpegPath: "ffmpeg", runImpl }), null);
  assert.equal(await prepareWebClip({ input: path.join(dir, "yok.mp4"), ffmpegPath: "ffmpeg", runImpl }), null);
  // uploadGoalClip: webCopy null → özgün açı yüklenir.
  const calls = [];
  const replays = {
    get: () => ({ id: "r20261105120000-abcdef", eventId: 100, angles: [{ angle: "program", path: file, sizeBytes: 1000, posterPath: null, durationMs: 10000, width: 1920, height: 1080 }] }),
    webCopy: async () => null,
    update: () => {},
    upload: async () => ({ ok: false }),
  };
  const api = {
    request: async (o) => { calls.push(o); return o.path.endsWith("/upload-url") ? { ok: true, data: { upload_url: "https://s/x", headers: {}, key: "goal-clips/7/100-1.mp4" } } : { ok: true, data: { id: 1 } }; },
  };
  const res = await uploadGoalClip(api, { matchId: 7, eventId: 100, replayId: "r20261105120000-abcdef" }, { replays, clips: {}, putImpl: async () => ({ ok: true, status: 200 }) });
  assert.equal(res.ok, true, JSON.stringify(res.error));
  assert.equal(calls[0].body.size_bytes, 1000);
});

test("uçtan uca (ffmpeg): High 4:4:4 + moov sonda kaynak → tarayıcı dostu kopya + kapak; yüklenen dosya kopyadır", { skip: !(hasFfmpeg && hasFfprobe), timeout: 120000 }, async () => {
  const dir = tmp("webclip");
  const src = path.join(dir, "program.mp4");
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y",
    "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=30:duration=3",
    "-f", "lavfi", "-i", "sine=frequency=440:duration=3",
    "-c:v", "libx264", "-pix_fmt", "yuv444p", "-profile:v", "high444", "-c:a", "aac", "-shortest", src]);
  const web = await prepareWebClip({ input: src, ffmpegPath: "ffmpeg" });
  assert.ok(web, "web kopyası üretildi");
  assert.equal(web.path, path.join(dir, "program.web.mp4"));
  assert.equal(web.posterPath, path.join(dir, "program.web.jpg"));
  assert.ok(fs.statSync(web.posterPath).size > 0);
  assert.equal(web.width, 640);
  assert.equal(web.height, 360);
  const info = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_streams", "-of", "json", web.path]).toString());
  const v = info.streams.find((s) => s.codec_type === "video");
  const a = info.streams.find((s) => s.codec_type === "audio");
  assert.equal(v.codec_name, "h264");
  assert.equal(v.profile, "High");
  assert.equal(v.pix_fmt, "yuv420p");
  assert.equal(a.codec_name, "aac");
  // +faststart: moov, mdat'tan önce.
  const head = fs.readFileSync(web.path);
  assert.ok(head.indexOf("moov") > 0 && head.indexOf("moov") < head.indexOf("mdat"), "moov başta");

  // İkinci çağrı kopyayı yeniden kullanır (yeniden kodlamaz).
  const mtime = fs.statSync(web.path).mtimeMs;
  const again = await prepareWebClip({ input: src, ffmpegPath: "ffmpeg" });
  assert.equal(fs.statSync(again.path).mtimeMs, mtime);

  // Tekrar deposu: webCopy + eski çok parçalı yükleme kopyayı ve kapağı gönderir.
  const replaysDir = tmp("webclip-replays");
  const id = "r20261105120000-abcdef";
  fs.mkdirSync(path.join(replaysDir, id));
  fs.copyFileSync(src, path.join(replaysDir, id, "program.mp4"));
  fs.writeFileSync(path.join(replaysDir, id, "replay.json"), JSON.stringify({ id, createdAt: new Date().toISOString(), kind: "goal", eventId: 100, angles: [{ angle: "program", name: "Program", file: "program.mp4", durationMs: 3000, width: 640, height: 360 }] }));
  const replays = createReplayStore({ replaysDir, getFfmpegPath: () => "ffmpeg", sleep: async () => {} });
  const uploads = [];
  const api = { upload: async (p, body) => { uploads.push(body); return { ok: true, data: { id: 5, url: "https://cdn/x.mp4" } }; } };
  const res = await replays.upload(api, { matchId: 7, eventId: 100, replayId: id });
  assert.equal(res.ok, true);
  const body = uploads[0].body.toString("latin1");
  assert.match(body, /name="poster"; filename="gol-7-100\.jpg"/);
  assert.match(body, /name="width"\r\n\r\n640\r\n/);
  assert.equal(fs.existsSync(path.join(replaysDir, id, "program.web.mp4")), true);

  // Eski klip deposu: kopya listede klip olarak görünmez, silinince o da gider.
  const clipsDir = tmp("webclip-clips");
  const name = "clip-20261105-120000-001.mp4";
  fs.copyFileSync(src, path.join(clipsDir, name));
  const clips = createClipStore({ clipsDir, getFfmpegPath: () => "ffmpeg" });
  const cw = await clips.webCopy(name);
  assert.ok(cw?.posterPath);
  assert.deepEqual(clips.list().map((c) => c.name), [name]);
  clips.remove(name);
  assert.deepEqual(fs.readdirSync(clipsDir), []);
});
