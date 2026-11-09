"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { EventEmitter } = require("node:events");
const ff = require("../studio/ffmpeg");
const { createStudioEngine, parseSegmentList, isContainerHeader } = require("../studio/engine");
const clips = require("../studio/clips");
const { accessFromUser, sameAccess } = require("../access");

const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));

/* --------------------------------- ffmpeg.js --------------------------------- */

// Sert sonlandırma: macOS/Linux SIGKILL; Windows'ta sinyalsiz child.kill() (+ taskkill).
const HARD_KILL = process.platform === "win32" ? undefined : "SIGKILL";

test("yayın komutu: tee ile RTMP (onfail=ignore) + 2 sn'lik TS halkası, 2 sn anahtar kare", () => {
  const opts = ff.normalizeStreamOptions({ url: "rtmps://a.rtmps.youtube.com:443/live2/abcd-efgh", width: 1280, height: 720, fps: 30, videoBitrateKbps: 4500, audioBitrateKbps: 160 });
  const args = ff.buildStreamArgs({ ...opts, encoder: "h264_videotoolbox", segmentStart: 12, listFile: "list-3.csv" });
  const at = (flag) => args[args.indexOf(flag) + 1];
  assert.equal(at("-i"), "pipe:0");
  assert.equal(at("-f"), "matroska");
  assert.equal(at("-progress"), "pipe:1");
  assert.equal(at("-c:v"), "h264_videotoolbox");
  assert.equal(at("-allow_sw"), "0"); // yazılım H.264'e sessizce düşmez (donanım yoksa x264)
  assert.equal(at("-level"), "4.1");
  assert.equal(at("-g"), "60");
  assert.equal(at("-b:v"), "4500k");
  assert.equal(at("-maxrate"), "4500k");
  assert.equal(at("-bufsize"), "4500k");
  assert.equal(at("-force_key_frames"), "expr:gte(t,n_forced*2)");
  assert.equal(at("-c:a"), "aac");
  assert.equal(at("-b:a"), "160k");
  assert.equal(at("-ar"), "48000");
  assert.equal(at("-fps_mode"), "cfr");
  assert.equal(at("-r"), "30");
  assert.equal(at("-loglevel"), "level+warning");
  assert.equal(at("-ac"), "2");
  assert.equal(at("-flags"), "+global_header");
  assert.match(at("-vf"), /^scale=1280:720.*fps=30/);
  const tee = args[args.length - 1];
  assert.equal(args[args.length - 2], "tee");
  const [rtmp, seg] = tee.split("|");
  assert.equal(rtmp, "[f=flv:onfail=ignore:flvflags=no_duration_filesize]rtmps://a.rtmps.youtube.com:443/live2/abcd-efgh");
  assert.match(seg, /^\[f=segment:segment_time=2:.*segment_format=mpegts:reset_timestamps=1:segment_start_number=12:segment_list=list-3\.csv:segment_list_type=csv.*\]seg%05d\.ts$/);
});

test("yalnız kayıt (url yok): tek çıkış parça halkası; libx264 ayarları", () => {
  const args = ff.buildStreamArgs({ ...ff.normalizeStreamOptions({ fps: 25, videoBitrateKbps: 3000 }), encoder: "libx264" });
  const tee = args[args.length - 1];
  assert.equal(tee.includes("|"), false);
  assert.match(tee, /^\[f=segment:/);
  assert.equal(args[args.indexOf("-preset") + 1], "veryfast");
  assert.equal(args[args.indexOf("-g") + 1], "50");
  assert.equal(args[args.indexOf("-sc_threshold") + 1], "0");
  assert.equal(args[args.indexOf("-level") + 1], "4.1");
});

test("seçenekler sınırlanır, boyutlar çift sayıya yuvarlanır", () => {
  const o = ff.normalizeStreamOptions({ width: 1279, height: 9999, fps: 240, videoBitrateKbps: 10, audioBitrateKbps: "abc" });
  assert.deepEqual([o.width, o.height, o.fps, o.videoBitrateKbps, o.audioBitrateKbps], [1278, 2160, 60, 300, 192]);
});

test("RTMP adresi doğrulama ve anahtar gizleme", () => {
  assert.equal(ff.isValidStreamUrl("rtmp://a.rtmp.youtube.com/live2/xxxx-yyyy-zzzz"), true);
  assert.equal(ff.isValidStreamUrl("rtmps://a.rtmps.youtube.com:443/live2/k"), true);
  assert.equal(ff.isValidStreamUrl("https://youtube.com/live2/k"), false);
  assert.equal(ff.isValidStreamUrl("rtmp://h/live/a|[f=mp4]/tmp/x.mp4"), false);
  assert.equal(ff.isValidStreamUrl("rtmp://h/live/a b"), false);
  assert.equal(ff.isValidStreamUrl(null), false);
  assert.equal(ff.maskUrl("rtmp://a.rtmp.youtube.com/live2/abcd-efgh-ijkl"), "rtmp://a.rtmp.youtube.com/live2/••••ijkl");
});

test("ilerleme çıktısı parça parça gelse de bloklara ayrılır", () => {
  const blocks = [];
  const parser = ff.createProgressParser((b) => blocks.push(b));
  parser.feed("frame=30\nfps=29.97\nbitrate=N/A\ntotal_size=N/A\nout_time_us=1001000\nout_ti");
  parser.feed("me=00:00:01.001000\ndup_frames=0\ndrop_frames=2\nspeed=1.01x\nprogress=continue\n");
  parser.feed("frame=60\nbitrate=2510.4kbits/s\nout_time_ms=2002000\nspeed=N/A\nprogress=end\n");
  assert.equal(blocks.length, 2);
  assert.deepEqual(blocks[0], { frame: 30, fps: 29.97, bitrateKbps: null, totalSize: null, outTimeMs: 1001, speed: 1.01, droppedFrames: 2, dupFrames: 0, done: false });
  assert.equal(blocks[1].bitrateKbps, 2510.4);
  assert.equal(blocks[1].outTimeMs, 2002);
  assert.equal(blocks[1].speed, null);
  assert.equal(blocks[1].done, true);
});

test("ffmpeg hataları Türkçe iletiye eşlenir", () => {
  const code = (t) => ff.mapFfmpegError(t).code;
  assert.equal(code("[tcp @ 0x1] Connection to tcp://1.2.3.4:1935 failed: Connection refused"), "CONNECTION_REFUSED");
  assert.equal(code("Connection to tcp://a:1935 failed: Operation timed out"), "TIMEOUT");
  assert.equal(code("av_interleaved_write_frame(): Input/output error"), "IO");
  assert.equal(code("Server error: NetStream.Publish.BadName"), "AUTH");
  assert.equal(code("[h264_videotoolbox @ 0x1] Error: cannot create compression session: -12902\nError while opening encoder"), "ENCODER");
  assert.equal(code("[matroska,webm @ 0x1] EBML header parsing failed"), "INPUT");
  assert.equal(code("Failed to resolve hostname a.rtmp.youtube.com: nodename nor servname provided"), "DNS");
  assert.equal(code("bilinmeyen"), "UNKNOWN");
  assert.match(ff.mapFfmpegError("Connection refused").message, /reddetti/);
});

test("tee yan çıkış hatası tanınır", () => {
  assert.deepEqual(ff.parseSlaveFailure("[tee @ 0x55] Slave muxer #0 failed: Connection refused, continuing with 1/2 slaves."), { index: 0, reason: "Connection refused" });
  assert.equal(ff.parseSlaveFailure("frame=1"), null);
});

test("kodlayıcı / biçim listesi, sürüm ve klip yoklaması ayrıştırılır", () => {
  const enc = ff.parseCodecList("Encoders:\n V..... = Video\n ------\n V....D libx264              libx264 H.264\n V....D h264_videotoolbox    VideoToolbox H.264 Encoder\n A....D aac                  AAC\n");
  assert.equal(enc.has("libx264") && enc.has("h264_videotoolbox") && enc.has("aac"), true);
  assert.equal(enc.has("="), false);
  const mux = ff.parseCodecList("File formats:\n D. = Demuxing supported\n .E = Muxing supported\n --\n  E tee             Multiple muxer tee\n DE  flv             FLV\n  E  stream_segment,ssegment streaming segment muxer\n");
  assert.deepEqual([...mux], ["tee", "flv", "stream_segment", "ssegment"]);
  assert.equal(ff.parseVersion("ffmpeg version 7.1.1-https://www.martin-riedl.de Copyright"), "7.1.1-https://www.martin-riedl.de");
  const p = ff.parseProbe("Input #0, mov,mp4\n  Duration: 00:00:10.07, start: 0.000000, bitrate: 4300 kb/s\n  Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p(progressive), 1920x1080 [SAR 1:1 DAR 16:9], 30 fps\n  Stream #0:1[0x2](und): Audio: aac (LC), 44100 Hz, stereo\n");
  assert.deepEqual(p, { durationMs: 10070, width: 1920, height: 1080, hasAudio: true });
});

test("ffmpeg araması: ortam > paketli > geliştirme (yalnız mac) > sistem", () => {
  const list = ff.ffmpegCandidates({ env: { ELITLIG_FFMPEG: "/x/ffmpeg", PATH: "/usr/bin:/bin" }, platform: "darwin", arch: "arm64", resourcesPath: "/App/Contents/Resources", appRoot: "/proj" });
  assert.deepEqual(list.slice(0, 4).map((c) => c.source), ["env", "bundled", "dev", "system"]);
  assert.equal(list[1].path, "/App/Contents/Resources/ffmpeg/ffmpeg");
  assert.equal(list[2].path, "/proj/build/ffmpeg/arm64/ffmpeg");
  const linux = ff.ffmpegCandidates({ env: { PATH: "/usr/bin" }, platform: "linux", arch: "x64", resourcesPath: null, appRoot: "/proj" });
  assert.deepEqual(linux.map((c) => c.path), ["/usr/bin/ffmpeg"]);
  assert.equal(ff.resolveFfmpeg({ env: { PATH: "/a:/b" }, platform: "linux", resourcesPath: null }, (p) => p === "/b/ffmpeg").path, "/b/ffmpeg");
});

test("yoklama: VideoToolbox listede ama açılamıyorsa kullanılmaz", async () => {
  const runImpl = async (_file, args) => {
    if (args.includes("-version")) return { ok: true, stdout: "ffmpeg version 7.1.1 Copyright" };
    if (args.includes("-encoders")) return { ok: true, stdout: " V....D libx264  x\n V....D h264_videotoolbox  x\n A....D aac  x\n" };
    if (args.includes("-muxers")) return { ok: true, stdout: "  E tee  x\n  E segment  x\n DE flv  x\n" };
    return { ok: !args.includes("h264_videotoolbox"), stdout: "", stderr: "" };
  };
  const info = await ff.probeFfmpeg({ path: "/f", source: "env" }, { runImpl, platform: "darwin" });
  assert.equal(info.available, true);
  assert.deepEqual(info.encoders, { videotoolbox: false, nvenc: false, qsv: false, amf: false, mf: false, libx264: true });
  assert.equal(info.encoder, "libx264");
  assert.equal(ff.pickEncoder(info.encoders), "libx264");
  assert.equal(ff.pickEncoder({ videotoolbox: true, libx264: true }), "h264_videotoolbox");
  assert.equal((await ff.probeFfmpeg(null)).available, false);
});

/* --------------------------------- clips.js --------------------------------- */

const seg = (index, start, end, encoder = "x") => ({ file: ff.segmentName(index), index, start, end, durationSec: end - start, encoder, path: `/s/${ff.segmentName(index)}` });

test("klip parça seçimi: en yeniden geriye ≥ istenen süre, büyüyen parça 0,5 sn'den uzunsa dahil", () => {
  const complete = [seg(1, 0, 2), seg(2, 2, 4), seg(3, 4, 6), seg(4, 6, 8), seg(5, 8, 10), seg(6, 10, 12)];
  const a = clips.selectSegments({ complete, growing: { file: "seg00007.ts", path: "/s/g", durationSec: 1.2, encoder: "x" }, seconds: 10 });
  assert.deepEqual(a.items.map((i) => i.index ?? "g"), [2, 3, 4, 5, 6, "g"]);
  assert.equal(a.includesGrowing, true);
  assert.ok(a.durationSec >= 10);
  const b = clips.selectSegments({ complete, growing: { durationSec: 0.3, path: "/s/g" }, seconds: 10 });
  assert.deepEqual(b.items.map((i) => i.index), [2, 3, 4, 5, 6]);
  assert.equal(b.includesGrowing, false);
  // Sıra karışık gelse de kronolojik döner.
  const c = clips.selectSegments({ complete: [seg(9, 4, 6), seg(8, 2, 4)], seconds: 3 });
  assert.deepEqual(c.items.map((i) => i.index), [8, 9]);
  // Yetersiz tampon: ne varsa.
  assert.equal(clips.selectSegments({ complete: [], growing: null, seconds: 10 }).durationSec, 0);
});

test("klip parça seçimi kodlayıcı değişiminde (yeniden bağlanma) durur", () => {
  const complete = [seg(1, 0, 2, "h264_videotoolbox"), seg(2, 2, 4, "h264_videotoolbox"), seg(3, 0, 2, "libx264"), seg(4, 2, 4, "libx264")];
  const r = clips.selectSegments({ complete, seconds: 10 });
  assert.deepEqual(r.items.map((i) => i.index), [3, 4]);
});

test("CSV parça listesi ayrıştırılır, bozuk satırlar atlanır", () => {
  assert.deepEqual(parseSegmentList("seg00000.ts,0.000000,2.066667\nseg00001.ts,2.066667,4.066667\nbozuk\nx.ts,1,2\nseg00002.ts,5,4\n"), [
    { file: "seg00000.ts", index: 0, start: 0, end: 2.066667 },
    { file: "seg00001.ts", index: 1, start: 2.066667, end: 4.066667 },
  ]);
});

test("klip adı / yolu: klasör dışına çıkılamaz", () => {
  const dir = path.resolve("/data/clips");
  assert.equal(clips.safeClipPath(dir, "clip-20261105-101010-123.mp4"), path.join(dir, "clip-20261105-101010-123.mp4"));
  for (const bad of ["../clip-a.mp4", "clip-a.mp4/../../etc/passwd", "/etc/clip-a.mp4", "clip-..mp4.txt", "seg00001.ts", "", null, "clip-a.mp4\0", "clip-a/../b.mp4", "..\\clip-a.mp4"]) {
    assert.equal(clips.safeClipPath(dir, bad), null, String(bad));
  }
  assert.equal(clips.nameFromUrl("elitlig-studio://clips/clip-1.mp4"), "clip-1.mp4");
  assert.equal(clips.nameFromUrl("elitlig-studio://clips/..%2F..%2Fsecret.mp4"), null);
  assert.equal(clips.nameFromUrl("elitlig-studio://other/clip-1.mp4"), null);
  assert.equal(clips.nameFromUrl("elitlig-media://clips/clip-1.mp4"), null);
  assert.equal(clips.clipUrl("clip-1.mp4"), "elitlig-studio://clips/clip-1.mp4");
});

test("Range başlığı ayrıştırılır", () => {
  assert.equal(clips.parseRange(null, 100), null);
  assert.deepEqual(clips.parseRange("bytes=0-", 100), { start: 0, end: 99 });
  assert.deepEqual(clips.parseRange("bytes=10-19", 100), { start: 10, end: 19 });
  assert.deepEqual(clips.parseRange("bytes=90-500", 100), { start: 90, end: 99 });
  assert.deepEqual(clips.parseRange("bytes=-10", 100), { start: 90, end: 99 });
  assert.deepEqual(clips.parseRange("bytes=100-", 100), { invalid: true });
  assert.deepEqual(clips.parseRange("bytes=5-1", 100), { invalid: true });
  assert.deepEqual(clips.parseRange("bytes=0-1,5-6", 100), { invalid: true });
});

test("klip şeması: 200 / 206 / 416 / 404", async () => {
  const dir = tmp("studio-clips-");
  const data = Buffer.from(Array.from({ length: 1000 }, (_, i) => i % 256));
  fs.writeFileSync(path.join(dir, "clip-a.mp4"), data);
  fs.writeFileSync(path.join(path.dirname(dir), "clip-out.mp4"), "gizli");
  const req = (url, range) => ({ url, method: "GET", headers: new Headers(range ? { Range: range } : {}) });
  const full = clips.serveClip(dir, req("elitlig-studio://clips/clip-a.mp4"));
  assert.equal(full.status, 200);
  assert.equal(full.headers.get("content-length"), "1000");
  assert.equal(full.headers.get("accept-ranges"), "bytes");
  assert.equal(full.headers.get("access-control-allow-origin"), "*");
  assert.equal(Buffer.from(await full.arrayBuffer()).equals(data), true);
  const part = clips.serveClip(dir, req("elitlig-studio://clips/clip-a.mp4", "bytes=100-199"));
  assert.equal(part.status, 206);
  assert.equal(part.headers.get("content-range"), "bytes 100-199/1000");
  assert.equal(Buffer.from(await part.arrayBuffer()).equals(data.subarray(100, 200)), true);
  assert.equal(clips.serveClip(dir, req("elitlig-studio://clips/clip-a.mp4", "bytes=5000-")).status, 416);
  assert.equal(clips.serveClip(dir, req("elitlig-studio://clips/..%2Fclip-out.mp4")).status, 404);
  assert.equal(clips.serveClip(dir, req("elitlig-studio://clips/clip-none.mp4")).status, 404);
});

test("klip yükleme: alanlar dosyadan önce, event_id sorguda; ağ hatasında bir kez yeniden dener", async () => {
  const dir = tmp("studio-up-");
  const store = clips.createClipStore({ clipsDir: dir, getFfmpegPath: () => "ffmpeg", sleep: async () => {} });
  fs.writeFileSync(path.join(dir, "clip-x.mp4"), Buffer.from("MP4DATA"));
  fs.writeFileSync(path.join(dir, "clip-x.json"), JSON.stringify({ durationMs: 10040, width: 1920, height: 1080, createdAt: new Date().toISOString() }));
  const calls = [];
  const api = { upload: async (pathname, mp, opts) => { calls.push({ pathname, mp, opts }); return calls.length === 1 ? { ok: false, offline: true, error: { message: "Bağlantı yok" } } : { ok: true, data: { id: 5, url: "https://cdn/x.mp4" } }; } };
  const res = await store.upload(api, { matchId: 7, eventId: 100, name: "clip-x.mp4" });
  assert.equal(res.ok, true);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].pathname, "/api/admin/live-streams/matches/7/clips?event_id=100");
  assert.equal(calls[0].opts.timeout, 180000);
  const body = calls[1].mp.body.toString("latin1");
  const order = ["event_id", "duration_ms", "width", "height", "file"].map((f) => body.indexOf(`name="${f}"`));
  assert.deepEqual([...order].sort((a, b) => a - b), order);
  assert.ok(order[0] >= 0);
  assert.match(body, /name="duration_ms"\r\n\r\n10040\r\n/);
  assert.match(body, /filename="gol-7-100\.mp4"\r\nContent-Type: video\/mp4\r\n\r\nMP4DATA\r\n/);
  assert.match(calls[1].mp.contentType, /^multipart\/form-data; boundary=/);
  assert.equal(store.describe("clip-x.mp4").uploaded.clipId, 5);
  assert.equal((await store.upload(api, { matchId: 7, eventId: 0, name: "clip-x.mp4" })).error.code, "BAD_REQUEST");
  assert.equal((await store.upload(api, { matchId: 7, eventId: 1, name: "../x.mp4" })).error.code, "NOT_FOUND");
});

test("klip deposu: 24 saatten eskiler silinir, liste yeniden eskiye", () => {
  const dir = tmp("studio-prune-");
  let t = Date.parse("2026-11-05T12:00:00Z");
  const store = clips.createClipStore({ clipsDir: dir, getFfmpegPath: () => "ffmpeg", now: () => t });
  const write = (name, ageH) => {
    const f = path.join(dir, name);
    fs.writeFileSync(f, "x");
    const when = new Date(t - ageH * 3600000);
    fs.utimesSync(f, when, when);
  };
  write("clip-old.mp4", 30);
  write("clip-old.json", 30);
  write("clip-new.mp4", 1);
  write("clip-newer.mp4", 0.5);
  write("other.txt", 40);
  fs.mkdirSync(path.join(dir, ".work-abc"));
  assert.equal(store.prune(), 1);
  assert.deepEqual(fs.readdirSync(dir).sort(), ["clip-new.mp4", "clip-newer.mp4", "other.txt"]);
  assert.deepEqual(store.list().map((c) => c.name), ["clip-newer.mp4", "clip-new.mp4"]);
  assert.equal(store.list()[0].url, "elitlig-studio://clips/clip-newer.mp4");
  assert.equal(store.remove("clip-new.mp4"), true);
  assert.equal(store.remove("../other.txt"), false);
  assert.deepEqual(store.list().map((c) => c.name), ["clip-newer.mp4"]);
});

test("klip kaydı: yayın yokken / tampon yetersizken hata kodu", async () => {
  const store = clips.createClipStore({ clipsDir: tmp("studio-save-"), getFfmpegPath: () => "ffmpeg" });
  assert.equal((await store.save({ sources: null })).error.code, "NOT_STREAMING");
  assert.equal((await store.save({ sources: { complete: [], growing: { durationSec: 0.4, path: "/x" } } })).error.code, "NO_BUFFER");
});

/* --------------------------------- engine.js --------------------------------- */

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

const HEADER = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3]);
const tick = () => new Promise((r) => setImmediate(r));
const progress = (child, ms) => child.stdout.emit("data", `frame=1\nfps=30\nout_time_us=${ms * 1000}\nspeed=1.0x\ndrop_frames=0\nprogress=continue\n`);

function setupEngine(extra = {}) {
  const { children, spawnImpl } = fakeSpawn();
  const timers = fakeTimers();
  const statuses = [];
  const restarts = [];
  const engine = createStudioEngine({
    getFfmpeg: async () => ({ available: true, path: "/bin/ffmpeg", encoders: { videotoolbox: true, libx264: true } }),
    tempRoot: tmp("studio-engine-"),
    spawnImpl,
    timers,
    relay: false, // eski tee/fifo yolu (aktarıcı: studio-relay.test.js)
    ...extra,
  });
  engine.events.on("status", (s) => statuses.push(s));
  engine.events.on("restartRecorder", (r) => restarts.push(r));
  return { engine, children, timers, statuses, restarts };
}

test("motor: kapsayıcı başlığı gelene kadar parçalar atılır; ilk ilerlemede 'live'", async () => {
  const { engine, children, statuses } = setupEngine();
  const res = await engine.start({ url: "rtmp://a.rtmp.youtube.com/live2/key", width: 1280, height: 720 });
  assert.equal(res.ok, true);
  assert.match(res.sessionId, /^\d{14}-[0-9a-f]{6}$/);
  assert.equal(children.length, 1);
  assert.equal(children[0].options.cwd.includes(res.sessionId), true);
  assert.equal(engine.pushChunk(Buffer.from([1, 2, 3, 4])), false);
  assert.equal(engine.pushChunk(HEADER), true);
  assert.equal(engine.pushChunk(new Uint8Array([9, 9])), true);
  assert.equal(children[0].written.length, 2);
  assert.equal(isContainerHeader(HEADER), true);
  assert.equal(statuses.at(-1).state, "connecting");
  progress(children[0], 1500);
  assert.equal(statuses.at(-1).state, "live");
  assert.equal(statuses.at(-1).outTimeMs, 1500);
  assert.equal((await engine.start({})).error.code, "BUSY");
  assert.equal(await engine.stop(), true);
  assert.equal(children[0].stdin.ended, true);
  assert.equal(statuses.at(-1).state, "stopped");
  assert.equal(engine.pushChunk(HEADER), false);
});

test("motor: yalnız kayıt modunda durum 'recording'; geçersiz adres reddedilir", async () => {
  const { engine, children, statuses } = setupEngine();
  assert.equal((await engine.start({ url: "http://x/y" })).error.code, "BAD_URL");
  await engine.start({ url: null });
  progress(children[0], 500);
  assert.equal(statuses.at(-1).state, "recording");
  assert.equal(statuses.at(-1).recordOnly, true);
  await engine.stop();
});

test("motor: RTMP koparsa 2,4,8,16,16 sn arayla 5 deneme, her denemede kaydedici yeniden başlatılır, sonra 'failed'", async () => {
  const { engine, children, timers, statuses, restarts } = setupEngine();
  await engine.start({ url: "rtmp://h/live/k" });
  engine.pushChunk(HEADER);
  progress(children[0], 2000);
  children[0].stderr.emit("data", "[tcp @ 0x1] Connection to tcp://h:1935 failed: Connection refused\n[tee @ 0x2] Slave muxer #0 failed: Connection refused, continuing with 1/2 slaves.\n");
  assert.equal(children[0].killed, HARD_KILL);
  await tick();
  const delays = [];
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const st = statuses.at(-1);
    assert.equal(st.state, "reconnecting");
    assert.equal(st.code, attempt === 1 ? "CONNECTION_REFUSED" : "IO");
    assert.match(st.message, new RegExp(`^\\(${attempt}/5\\)`));
    const retry = [...timers.pending.values()].find((t) => t.ms >= 2000 && t.ms <= 16000);
    delays.push(retry.ms);
    timers.runNext(retry.ms);
    assert.equal(children.length, attempt + 1);
    const child = children.at(-1);
    assert.equal(restarts.length, attempt);
    // Yeni süreç yeni başlık bekler; numaralandırma sürer.
    assert.equal(engine.pushChunk(Buffer.from([7])), false);
    assert.equal(engine.pushChunk(HEADER), true);
    child.stderr.emit("data", "av_interleaved_write_frame(): Input/output error\n");
    child.emit("exit", 1, null);
    await tick();
  }
  assert.deepEqual(delays, [2000, 4000, 8000, 16000, 16000]);
  assert.equal(statuses.at(-1).state, "failed");
  assert.match(statuses.at(-1).message, /yeniden bağlanamadı/);
  assert.equal(engine.active(), false);
  // Başarısız oturum yeni başlatmayı engellemez.
  assert.equal((await engine.start({ url: null })).ok, true);
  await engine.stop();
});

test("motor: bağlantı sağlam kalınca deneme sayacı sıfırlanır", async () => {
  const { engine, children, timers, statuses } = setupEngine({ stableMs: 30000 });
  await engine.start({ url: "rtmp://h/live/k" });
  engine.pushChunk(HEADER);
  children[0].emit("exit", 1, null);
  await tick();
  timers.runNext(2000);
  engine.pushChunk(HEADER);
  progress(children[1], 1000);
  assert.equal(statuses.at(-1).state, "live");
  assert.equal(statuses.at(-1).attempt, 1);
  timers.runNext(30000);
  progress(children[1], 2000);
  assert.equal(statuses.at(-1).attempt, 0);
  await engine.stop();
});

test("motor: VideoToolbox açılamazsa deneme harcamadan libx264'e geçer", async () => {
  const { engine, children, statuses, restarts } = setupEngine();
  const res = await engine.start({ url: "rtmp://h/live/k" });
  assert.equal(res.encoder, "h264_videotoolbox");
  assert.equal(children[0].args.includes("h264_videotoolbox"), true);
  children[0].stderr.emit("data", "[h264_videotoolbox @ 0x1] Error: cannot create compression session: -12908\nError while opening encoder for output stream #0:0\n");
  children[0].emit("exit", 1, null);
  await tick();
  assert.equal(children.length, 2);
  assert.equal(children[1].args.includes("libx264"), true);
  assert.equal(restarts.length, 1);
  engine.pushChunk(HEADER);
  progress(children[1], 1000);
  assert.equal(statuses.at(-1).encoder, "libx264");
  assert.equal(statuses.at(-1).attempt, 0);
  assert.match(statuses.at(-1).message, /x264/);
  await engine.stop();
});

test("motor: bağlantı zaman aşımı yeniden denemeye düşer", async () => {
  const { engine, children, timers, statuses } = setupEngine({ connectTimeoutMs: 25000 });
  await engine.start({ url: "rtmp://h/live/k" });
  timers.runNext(25000);
  assert.equal(children[0].killed, HARD_KILL);
  await tick();
  assert.equal(statuses.at(-1).state, "reconnecting");
  assert.equal(statuses.at(-1).code, "TIMEOUT");
  await engine.stop();
});

test("motor: ilerleme ve parçalar 15 sn kesilirse yeniden başlatılır", async () => {
  let t = 1_000_000;
  const { engine, children, timers, statuses, restarts } = setupEngine({ now: () => t });
  await engine.start({ url: "rtmp://h/live/k" });
  engine.pushChunk(HEADER);
  progress(children[0], 1000);
  progress(children[0], 2000);
  assert.equal([...timers.pending.values()].filter((x) => x.ms === 15000).length, 1);
  t += 15000;
  timers.runNext(15000);
  assert.equal(children[0].killed, HARD_KILL);
  await tick();
  assert.equal(statuses.at(-1).code, "STALLED");
  timers.runNext(2000);
  assert.equal(restarts.length, 1);
  await engine.stop();
});

test("motor: stdin 32 MB'ı aşarsa süreç yeniden başlar, 8 MB'ta 'slow' uyarısı", async () => {
  const { engine, children, statuses } = setupEngine();
  await engine.start({ url: null });
  const child = children[0];
  engine.pushChunk(HEADER);
  child.stdin.writableLength = 9 * 1024 * 1024;
  engine.pushChunk(Buffer.from([1]));
  assert.equal(statuses.at(-1).warning, "slow");
  child.stdin.writableLength = 33 * 1024 * 1024;
  engine.pushChunk(Buffer.from([1]));
  assert.equal(child.killed, HARD_KILL);
  await tick();
  assert.equal(statuses.at(-1).code, "SLOW");
  await engine.stop();
});

test("motor: durdurma 5 sn içinde bitmezse SIGKILL; parça klasörü silinir", async () => {
  const { engine, children, timers } = setupEngine();
  const res = await engine.start({ url: null });
  const child = children[0];
  const dir = child.options.cwd;
  child.stdin.end = function end() { this.ended = true; }; // ffmpeg kapanmıyor
  const stopping = engine.stop();
  assert.equal(fs.existsSync(dir), true);
  timers.runNext(5000);
  assert.equal(child.killed, HARD_KILL);
  assert.equal(await stopping, true);
  assert.equal(fs.existsSync(dir), false);
  assert.ok(res.ok);
});

test("motor: klip kaynakları CSV listesinden; eski parçalar halkadan silinir", async () => {
  const { engine, children } = setupEngine({ keepSegments: 3 });
  await engine.start({ url: null });
  const dir = children[0].options.cwd;
  const lines = [];
  for (let i = 0; i < 5; i += 1) {
    fs.writeFileSync(path.join(dir, ff.segmentName(i)), Buffer.alloc(250000));
    lines.push(`${ff.segmentName(i)},${i * 2}.000000,${i * 2 + 2}.000000`);
  }
  fs.writeFileSync(path.join(dir, ff.segmentName(5)), Buffer.alloc(250000));
  fs.writeFileSync(path.join(dir, "list-1.csv"), `${lines.join("\n")}\n`);
  engine.pushChunk(HEADER);
  progress(children[0], 11200);
  const src = engine.clipSources();
  assert.deepEqual(src.complete.map((s) => s.index), [2, 3, 4]);
  assert.equal(fs.existsSync(path.join(dir, ff.segmentName(0))), false);
  assert.equal(src.growing.file, ff.segmentName(5));
  assert.ok(Math.abs(src.growing.durationSec - 1.2) < 1e-9);
  // Diskte tamponda kalan kısım: süre bayt oranıyla sınırlanır (125 kB/sn → 62,5 kB = 0,5 sn).
  fs.writeFileSync(path.join(dir, ff.segmentName(5)), Buffer.alloc(62500));
  assert.ok(Math.abs(engine.clipSources().growing.durationSec - 0.5) < 1e-9);
  assert.equal(engine.status().bitrateKbps, 1000);
  await engine.stop();
});

/* --------------------------------- access.js --------------------------------- */

test("yetki: Yayın Stüdyosu matches.live ister; liste yoksa yönetim hesabına açılır", () => {
  assert.equal(accessFromUser({ permissions: ["matches.live"] }).live, true);
  assert.equal(accessFromUser({ permissions: ["*"] }).live, true);
  assert.equal(accessFromUser({ permissions: ["messages.view"] }).live, false);
  assert.equal(accessFromUser({ isManagement: true }).live, true);
  assert.equal(accessFromUser({ isManagement: false }).live, false);
  assert.equal(accessFromUser(null).live, false);
  assert.equal(sameAccess({ live: true }, { live: false }), false);
  assert.equal(sameAccess({ live: true }, { live: true }), true);
});
