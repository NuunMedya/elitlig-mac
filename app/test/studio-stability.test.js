"use strict";
// 2.11: yayın kararlılığı (fifo / takılma / hız), açıların kopya kipi, yerel
// tam kayıt, röportaj, LED çıkışı, yükleme geri düşüşleri, tanılama günlüğü.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { EventEmitter } = require("node:events");
const ff = require("../studio/ffmpeg");
const ffargs = require("../studio/ffargs");
const { createStudioEngine, localBaseName, slug } = require("../studio/engine");
const { createAngles, angleFallback } = require("../studio/angles");
const { createDiagnostics } = require("../studio/diag");
const { buildRemuxArgs, remuxParts, createSettings } = require("../studio/localrecord");
const { createInterviews, selectPinned } = require("../studio/interview");
const { uploadHighlight } = require("../studio/highlights");
const { createReplayStore, isUnexpectedFieldError } = require("../studio/replays");
const { createLedManager, isAllowedLedUrl, describeDisplay } = require("../studio/led");
const { applyStudioSwitches } = require("../studio/index");
const { isAllowedExternal } = require("../links");

const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));
const HARD_KILL = process.platform === "win32" ? undefined : "SIGKILL";
const at = (args, flag) => args[args.indexOf(flag) + 1];

/* ------------------------------ komut kurucuları ------------------------------ */

test("yayın komutu (fifo): RTMP ayrı iş parçacığında, süreç içinde yeniden bağlanır; flvflags; CBR; CFR; 48 kHz", () => {
  const opts = ff.normalizeStreamOptions({ url: "rtmp://a.rtmp.youtube.com/live2/abcd-efgh", width: 1920, height: 1080, fps: 30, videoBitrateKbps: 6000 });
  const args = ff.buildStreamArgs({ ...opts, encoder: "libx264", fifo: true, speedLevel: 0 });
  const tee = args.at(-1);
  const [rtmp, seg] = tee.split("|");
  assert.match(rtmp, /^\[f=flv:onfail=ignore:flvflags=no_duration_filesize:use_fifo=1:fifo_options=attempt_recovery=1\\\\\\:recover_any_error=1\\\\\\:recovery_wait_time=2\\\\\\:max_recovery_attempts=20\\\\\\:drop_pkts_on_overflow=1\\\\\\:restart_with_keyframe=1\\\\\\:queue_size=900\]rtmp:\/\/a\.rtmp\.youtube\.com\/live2\/abcd-efgh$/);
  assert.match(seg, /^\[f=segment:segment_time=2:/);
  assert.equal(at(args, "-loglevel"), "level+info"); // fifo "Recovery successful" info düzeyinde
  assert.equal(at(args, "-b:v"), "6000k");
  assert.equal(at(args, "-maxrate"), "6000k");
  assert.equal(at(args, "-bufsize"), "6000k");
  assert.equal(at(args, "-fps_mode"), "cfr");
  assert.equal(at(args, "-r"), "30");
  assert.equal(at(args, "-ar"), "48000");
  assert.equal(at(args, "-af"), ff.STREAM_AUDIO_FILTER);
  assert.match(at(args, "-af"), /^aresample=async=1000,alimiter=limit=0\.891:.*level=0/);
  assert.equal(at(args, "-profile:a"), "aac_low");
  assert.equal(at(args, "-fflags"), "+genpts+discardcorrupt");
  assert.equal(args.includes("-use_wallclock_as_timestamps"), false);
  assert.equal(at(args, "-x264-params"), "nal-hrd=cbr:force-cfr=1");
  // fifo'suz: düz tee (eski davranış), uyarı düzeyi.
  const plain = ff.buildStreamArgs({ ...opts, encoder: "libx264" });
  assert.equal(plain.at(-1).split("|")[0], "[f=flv:onfail=ignore:flvflags=no_duration_filesize]rtmp://a.rtmp.youtube.com/live2/abcd-efgh");
  assert.equal(at(plain, "-loglevel"), "level+warning");
  // Eski ffmpeg (< 5.1): -vsync cfr.
  const old = ff.buildStreamArgs({ ...opts, encoder: "libx264", fpsMode: false });
  assert.equal(at(old, "-vsync"), "cfr");
  assert.equal(ff.supportsFpsMode("7.1.1"), true);
  assert.equal(ff.supportsFpsMode("6.1.1-3ubuntu5"), true);
  assert.equal(ff.supportsFpsMode("n5.1.2"), true);
  assert.equal(ff.supportsFpsMode("5.0.1"), false);
  assert.equal(ff.supportsFpsMode("4.4.2"), false);
  assert.equal(ff.supportsFpsMode("N-112233-gabcdef"), true);
});

test("yerel kayıt: tee'ye Matroska çıkışı (onfail=ignore), yol kaçışı; çıkış sırası", () => {
  const opts = ff.normalizeStreamOptions({ url: "rtmp://h/live/k", width: 1280, height: 720 });
  const args = ff.buildStreamArgs({ ...opts, encoder: "h264_videotoolbox", localFile: "/Users/a/Movies/ElitLig/Maç 'A'|B.mkv", platform: "darwin" });
  const outs = args.at(-1).split(/(?<!\\)\|/);
  assert.equal(outs.length, 3);
  assert.equal(outs[1], "[f=matroska:onfail=ignore]/Users/a/Movies/ElitLig/Maç \\'A\\'\\|B.mkv");
  assert.deepEqual(ff.streamSlaves({ url: "rtmp://x/y", localFile: "/a.mkv" }), ["rtmp", "local", "segment"]);
  assert.deepEqual(ff.streamSlaves({ url: null, localFile: "/a.mkv" }), ["local", "segment"]);
  assert.deepEqual(ff.streamSlaves({}), ["segment"]);
  assert.equal(ff.teeEscape("C:\\Users\\Ali\\Videos\\ElitLig\\a.mkv", "win32"), "C:/Users/Ali/Videos/ElitLig/a.mkv");
  // Yalnız kayıt + yerel: rtmp yok.
  const rec = ff.buildStreamArgs({ ...opts, url: null, encoder: "libx264", localFile: "/r/a.mkv" });
  assert.match(rec.at(-1), /^\[f=matroska:onfail=ignore\]\/r\/a\.mkv\|\[f=segment:/);
});

test("hız düzeyi: x264 veryfast → superfast → ultrafast, NVENC p4 → p2 → p1; diğerleri değişmez", () => {
  const o = { videoBitrateKbps: 4500, fps: 30 };
  assert.deepEqual([0, 1, 2, 5].map((l) => at(ff.videoEncoderArgs("libx264", { ...o, speedLevel: l }), "-preset")), ["veryfast", "superfast", "ultrafast", "ultrafast"]);
  assert.deepEqual([0, 1, 2].map((l) => at(ff.videoEncoderArgs("h264_nvenc", { ...o, speedLevel: l }), "-preset")), ["p4", "p2", "p1"]);
  assert.deepEqual(ff.videoEncoderArgs("h264_videotoolbox", { ...o, speedLevel: 2 }), ff.videoEncoderArgs("h264_videotoolbox", o));
});

test("anahtar gizleme: metindeki tüm RTMP adresleri (tee, ffmpeg satırları)", () => {
  const s = ff.maskSecrets("[info] Output #0, tee, to '[f=flv]rtmps://a.rtmps.youtube.com:443/live2/abcd-efgh-ijkl|[f=matroska]/Users/x/a.mkv' ve rtmp://h/app/KEY1234 ");
  assert.equal(s.includes("abcd-efgh"), false);
  assert.equal(s.includes("KEY1"), false);
  assert.match(s, /live2\/••••ijkl\|\[f=matroska\]\/Users\/x\/a\.mkv/);
  assert.match(s, /rtmp:\/\/h\/app\/••••1234 /);
});

test("açı komutu (kopya kipi): H.264 kaydedici → -c:v copy, Annex B, 1 sn parça anahtar karede; ses AAC", () => {
  const o = ffargs.angleOptions({ width: 1920, height: 1080, fps: 30, mimeType: "video/x-matroska;codecs=avc1,opus" });
  assert.equal(o.copy, true);
  const args = ffargs.buildAngleArgs({ ...o, encoder: "libx264", segmentStart: 7, listFile: "list-2.csv" });
  assert.equal(at(args, "-c:v"), "copy");
  assert.equal(at(args, "-bsf:v"), "h264_mp4toannexb");
  assert.equal(args.includes("-vf"), false);
  assert.equal(args.includes("libx264"), false);
  assert.equal(args.includes("-force_key_frames"), false);
  assert.equal(at(args, "-c:a"), "aac");
  assert.equal(at(args, "-segment_time"), "1");
  assert.equal(at(args, "-break_non_keyframes"), "0");
  assert.equal(at(args, "-segment_start_number"), "7");
  assert.equal(at(args, "-segment_list"), "list-2.csv");
  assert.equal(args.at(-1), "seg%05d.ts");
  // VP8 / bilinmeyen: yeniden kodlama.
  for (const m of ["video/webm;codecs=vp8,opus", "video/webm;codecs=vp9", "", undefined]) {
    const e = ffargs.angleOptions({ width: 1280, height: 720, mimeType: m });
    assert.equal(e.copy, false, String(m));
    const ea = ffargs.buildAngleArgs({ ...e, encoder: "libx264" });
    assert.equal(at(ea, "-c:v"), "libx264");
    assert.equal(at(ea, "-g"), "30");
  }
  assert.equal(ffargs.isH264Mime("video/webm;codecs=h264"), true);
  assert.equal(ffargs.isH264Mime("video/mp4;codecs=avc1.640028"), true);
  // Kopya düşerse kodlamaya geç; kodlama düşerse geri düşüş yok.
  assert.deepEqual({ ...angleFallback({ copy: true, width: 1 }), notice: undefined }, { copy: false, width: 1, notice: undefined });
  assert.equal(angleFallback({ copy: false }), null);
});

/* ----------------------------------- motor ----------------------------------- */

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
    count: (ms) => [...pending.values()].filter((v) => v.ms === ms).length,
  };
}

const HEADER = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3]);
const tick = () => new Promise((r) => setImmediate(r));
const progress = (child, ms, speed = "1.0x") => child.stdout.emit("data", `frame=1\nfps=30\nout_time_us=${ms * 1000}\nspeed=${speed}\ndrop_frames=0\nprogress=continue\n`);
const stderr = (child, text) => child.stderr.emit("data", `${text}\n`);

function setup(extra = {}, info = {}) {
  const { children, spawnImpl } = fakeSpawn();
  const timers = fakeTimers();
  const clock = { t: 1_000_000 };
  const statuses = [];
  const restarts = [];
  const notes = [];
  const engine = createStudioEngine({
    getFfmpeg: async () => ({ available: true, path: "/bin/ffmpeg", version: "7.1.1", encoders: { libx264: true }, muxers: { tee: true, segment: true, flv: true, fifo: true, matroska: true }, ...info }),
    tempRoot: tmp("studio-stab-"),
    spawnImpl,
    timers,
    relay: false, // eski tee/fifo yolu (aktarıcı: studio-relay.test.js)
    now: () => clock.t,
    diag: { write: (scope, message, data) => notes.push({ scope, message, data }) },
    ...extra,
  });
  engine.events.on("status", (s) => statuses.push(s));
  engine.events.on("restartRecorder", (r) => restarts.push(r));
  return { engine, children, timers, clock, statuses, restarts, notes };
}

test("takılma: parçalar gelmeye devam ederken ilerleme kesilse de yeniden başlatılmaz; 60 sn'de kesin takılma", async () => {
  const { engine, children, timers, clock, notes } = setup();
  await engine.start({ url: "rtmp://h/live/k" });
  engine.pushChunk(HEADER);
  progress(children[0], 1000);
  for (let i = 0; i < 3; i += 1) {
    clock.t += 5000;
    engine.pushChunk(Buffer.from([1, 2])); // arayüz yollamayı sürdürüyor
  }
  timers.runNext(15000);
  assert.equal(children[0].killed, undefined, "parçalar gelirken öldürülmemeli");
  assert.ok(notes.some((n) => /parçalar geliyor; yeniden başlatılmıyor/.test(n.message)));
  // Parçalar sürer, ilerleme 60 sn boyunca hiç gelmez → kesin takılma.
  while (clock.t - 1_000_000 < 61000) {
    clock.t += 5000;
    engine.pushChunk(Buffer.from([3]));
    const pend = [...timers.pending.values()].filter((t) => t.ms <= 15000 && t.ms >= 1000);
    if (pend.length) timers.runNext(pend[0].ms);
    if (children[0].killed) break;
  }
  assert.equal(children[0].killed, HARD_KILL);
  assert.ok(notes.some((n) => /ffmpeg takıldı/.test(n.message)));
  await tick();
  await engine.stop();
});

test("takılma: ilerleme ilerlediği sürece zamanlayıcı yenilenir; parça ve ilerleme yoksa yeniden başlar (neden günlükte)", async () => {
  const { engine, children, timers, clock, statuses, notes, restarts } = setup();
  await engine.start({ url: "rtmp://h/live/k" });
  engine.pushChunk(HEADER);
  progress(children[0], 1000);
  clock.t += 1000;
  progress(children[0], 2000);
  assert.equal(timers.count(15000), 1);
  clock.t += 16000; // ne parça ne ilerleme
  timers.runNext(15000);
  assert.equal(children[0].killed, HARD_KILL);
  assert.ok(notes.some((n) => /kaydedici durdu \(parça ve ilerleme yok\)/.test(n.message)));
  await tick();
  assert.equal(statuses.at(-1).code, "STALLED");
  timers.runNext(2000);
  assert.equal(restarts.length, 1);
  await engine.stop();
});

test("fifo: RTMP kopması süreci yeniden başlatmaz → 'reconnecting'; 'Recovery successful' → 'live'", async () => {
  const { engine, children, statuses, restarts } = setup();
  await engine.start({ url: "rtmp://a.rtmp.youtube.com/live2/gizli-anahtar" });
  assert.equal(at(children[0].args, "-loglevel"), "level+info");
  assert.match(children[0].args.at(-1), /use_fifo=1/);
  engine.pushChunk(HEADER);
  progress(children[0], 1000);
  assert.equal(statuses.at(-1).state, "live");
  assert.equal(statuses.at(-1).rtmp, "up");
  stderr(children[0], "[tcp @ 0x1] [error] Connection to tcp://a.rtmp.youtube.com:1935 failed: Connection refused");
  stderr(children[0], "[fifo @ 0x2] [error] Error opening rtmp://a.rtmp.youtube.com/live2/gizli-anahtar: Connection refused");
  assert.equal(statuses.at(-1).state, "reconnecting");
  assert.equal(statuses.at(-1).code, "CONNECTION_REFUSED");
  assert.match(statuses.at(-1).message, /kayıt sürüyor/);
  progress(children[0], 2000);
  assert.equal(statuses.at(-1).state, "reconnecting");
  assert.equal(statuses.at(-1).rtmp, "down");
  assert.equal(children[0].killed, undefined);
  stderr(children[0], "[fifo @ 0x2] [info] Recovery successful");
  assert.equal(statuses.at(-1).state, "live");
  progress(children[0], 3000);
  assert.equal(statuses.at(-1).rtmp, "up");
  assert.equal(children.length, 1);
  assert.equal(restarts.length, 0);
  // info satırları hata kuyruğuna girmez; hatalar anahtarsız.
  assert.ok(engine.lastErrors().every((e) => !e.line.includes("gizli-anahtar")));
  assert.equal(engine.lastErrors().some((e) => /Recovery successful/.test(e.line)), false);
  await engine.stop();
});

test("fifo: yayın anahtarı 3 kez reddedilirse süreç yeniden başlar (AUTH); deneme hakkı bitince eski yol", async () => {
  const { engine, children, statuses } = setup();
  await engine.start({ url: "rtmp://h/live/k" });
  engine.pushChunk(HEADER);
  progress(children[0], 1000);
  for (let i = 0; i < 3; i += 1) stderr(children[0], "[rtmp @ 0x1] [error] Server error: NetStream.Publish.BadName\n[fifo @ 0x2] [error] Recovery failed: Operation not permitted");
  assert.equal(children[0].killed, HARD_KILL);
  await tick();
  assert.equal(statuses.at(-1).code, "AUTH");
  assert.equal(statuses.at(-1).state, "reconnecting");
  await engine.stop();
});

test("fifo: RTMP kuyruğu 30 sn dolu kalırsa (bağlantı askıda) süreç yeniden başlar; kısa dolma yalnız uyarı", async () => {
  const { engine, children, clock, statuses } = setup();
  await engine.start({ url: "rtmp://h/live/k" });
  engine.pushChunk(HEADER);
  progress(children[0], 1000);
  stderr(children[0], "[fifo @ 0x2] [warning] FIFO queue full");
  assert.equal(statuses.at(-1).warning, "network");
  assert.equal(children[0].killed, undefined);
  for (let i = 0; i < 8; i += 1) {
    clock.t += 4000;
    stderr(children[0], "[fifo @ 0x2] [warning] FIFO queue full");
  }
  assert.equal(children[0].killed, HARD_KILL);
  await tick();
  assert.equal(statuses.at(-1).code, "IO");
  await engine.stop();
});

test("tee: yerel kayıt çıkışı düşerse yayın sürer (uyarı); RTMP çıkışı düşerse süreç yeniden başlar", async () => {
  const dir = tmp("studio-local-");
  const { engine, children, statuses } = setup({}, { muxers: { tee: true, segment: true, flv: true, fifo: false, matroska: true } });
  await engine.start({ url: "rtmp://h/live/k", localRecord: { enabled: true, dir }, matchLabel: "Galatasaray – Fenerbahçe" });
  engine.pushChunk(HEADER);
  progress(children[0], 1000);
  stderr(children[0], "[tee @ 0x1] [warning] Slave muxer #1 failed: No space left on device, continuing with 2/3 slaves.");
  assert.equal(children[0].killed, undefined);
  assert.equal(statuses.at(-1).warning, "local");
  assert.equal(statuses.at(-1).localFailed, true);
  stderr(children[0], "[tee @ 0x1] [warning] Slave muxer #0 failed: Broken pipe, continuing with 1/3 slaves.");
  assert.equal(children[0].killed, HARD_KILL);
  await tick();
  assert.equal(statuses.at(-1).code, "IO");
  await engine.stop();
});

test("hız: giriş geç geliyorsa (stdin boş) speed < 0.95 ön ayarı DÜŞÜRMEZ (yalnız uyarı)", async () => {
  const { engine, children, clock, statuses, timers, notes } = setup();
  await engine.start({ url: null });
  engine.pushChunk(HEADER);
  let out = 0;
  for (let i = 0; i < 20; i += 1) {
    clock.t += 1000;
    out += 800;
    progress(children[0], out, "0.80x");
  }
  assert.equal(statuses.at(-1).warning, "slow");
  assert.ok(notes.some((n) => n.message === "kodlayıcı yetişemiyor" && n.data.inputLimited === true && n.data.nextSpeedLevel === 0));
  children[0].emit("exit", 1, null);
  await tick();
  timers.runNext(2000);
  assert.equal(at(children[1].args, "-preset"), "veryfast");
  await engine.stop();
});

test("hız: speed < 0.95 10 sn sürerse 'slow' uyarısı; stdin birikiyorsa sonraki yeniden başlatmada x264 superfast", async () => {
  const { engine, children, clock, statuses, timers, notes } = setup();
  await engine.start({ url: null });
  assert.equal(at(children[0].args, "-preset"), "veryfast");
  engine.pushChunk(HEADER);
  children[0].stdin.writableLength = 2 * 1024 * 1024; // ffmpeg okuyamıyor: darboğaz kodlayıcı
  let out = 0;
  for (let i = 0; i < 20; i += 1) {
    clock.t += 1000;
    out += 800;
    progress(children[0], out, "0.80x");
  }
  assert.equal(statuses.at(-1).warning, "slow");
  assert.match(statuses.at(-1).message, /gerçek zamana yetişemiyor/);
  assert.ok(notes.some((n) => n.message === "kodlayıcı yetişemiyor" && n.data.nextSpeedLevel === 1));
  assert.equal(children[0].killed, undefined, "yalnız uyarı; yeniden başlatma zorlanmaz");
  // Başka bir nedenle yeniden başlayınca daha hızlı ön ayar.
  children[0].emit("exit", 1, null);
  await tick();
  timers.runNext(2000);
  assert.equal(at(children[1].args, "-preset"), "superfast");
  engine.pushChunk(HEADER);
  clock.t += 1000;
  progress(children[1], 500);
  assert.equal(statuses.at(-1).speedLevel, 1);
  await engine.stop();
});

test("yerel kayıt: her çalıştırmada yeni parça (.mkv, -2.mkv); durum localPath/localBytes; durdurunca MP4'e birleştirme", async () => {
  const dir = tmp("studio-local-");
  const remuxCalls = [];
  const { engine, children, statuses, timers } = setup({
    remuxLocal: async ({ parts, outFile }) => { remuxCalls.push({ parts, outFile }); fs.writeFileSync(outFile, "mp4"); return { ok: true, path: outFile }; },
  });
  const locals = [];
  engine.events.on("local", (j) => locals.push(j));
  const res = await engine.start({ url: "rtmp://h/live/k", localRecord: { enabled: true, dir, name: "Maç 12" } });
  assert.equal(res.ok, true);
  const tee1 = children[0].args.at(-1).split(/(?<!\\)\|/);
  assert.equal(tee1.length, 3);
  // tee çıkışında yol "/" ile yazılır (Windows'ta da); karşılaştırmalar yerel biçimde.
  const file1 = path.normalize(tee1[1].replace("[f=matroska:onfail=ignore]", ""));
  assert.match(path.basename(file1), /^ElitLig-Mac-12-\d{8}-\d{6}\.mkv$/);
  fs.writeFileSync(file1, Buffer.alloc(1234));
  engine.pushChunk(HEADER);
  progress(children[0], 1000);
  assert.equal(path.normalize(statuses.at(-1).localPath), file1);
  assert.equal(statuses.at(-1).localBytes, 1234);
  // Yeniden başlatma → ikinci parça.
  children[0].emit("exit", 1, null);
  await tick();
  timers.runNext(2000);
  const file2 = path.normalize(children[1].args.at(-1).split(/(?<!\\)\|/)[1].replace("[f=matroska:onfail=ignore]", ""));
  assert.equal(file2, file1.replace(/\.mkv$/, "-2.mkv"));
  fs.writeFileSync(file2, Buffer.alloc(100));
  engine.pushChunk(HEADER);
  progress(children[1], 1000);
  assert.equal(statuses.at(-1).localBytes, 1334);
  await engine.stop();
  assert.equal(statuses.at(-1).state, "stopped");
  assert.equal(statuses.at(-1).localRemux, "remuxing");
  await tick(); await tick(); await tick();
  assert.deepEqual(remuxCalls[0].parts.map((x) => path.normalize(x)), [file1, file2]);
  assert.equal(path.normalize(remuxCalls[0].outFile), file1.replace(/\.mkv$/, ".mp4"));
  assert.equal(locals.at(-1).state, "done");
  assert.equal(statuses.at(-1).localRemux, "done");
  assert.equal(path.normalize(statuses.at(-1).localPath), file1.replace(/\.mkv$/, ".mp4"));
});

test("yerel kayıt: klasöre yazılamazsa başlamaz; dosya adı Türkçe karakterden arınır", async () => {
  const { engine } = setup();
  const file = path.join(tmp("studio-local-"), "dosya");
  fs.writeFileSync(file, "x");
  const res = await engine.start({ url: null, localRecord: { enabled: true, dir: path.join(file, "alt") } });
  assert.equal(res.ok, false);
  assert.equal(res.error.code, "LOCAL_DIR");
  assert.equal(slug("Galatasaray – Fenerbahçe (Şampiyonluk)"), "Galatasaray-Fenerbahce-Sampiyonluk");
  assert.match(localBaseName(null, Date.UTC(2026, 10, 5, 12)), /^ElitLig-kayit-20261105-\d{6}$/);
  assert.deepEqual(buildRemuxArgs(["/a.mkv"], "/a.mp4").slice(-6), ["-map", "0:a:0?", "-c", "copy", "-movflags", "+faststart", "/a.mp4"].slice(-6));
  assert.ok(buildRemuxArgs(["/a.mkv", "/b.mkv"], "/a.mp4", "/l.txt").join(" ").includes("-f concat -safe 0 -i /l.txt"));
});

test("yerel kayıt birleştirme: başarıda parçalar silinir; başarısızsa MKV korunur", async () => {
  const dir = tmp("studio-remux-");
  const a = path.join(dir, "a.mkv");
  const b = path.join(dir, "a-2.mkv");
  fs.writeFileSync(a, "1");
  fs.writeFileSync(b, "2");
  let seen = null;
  const ok = await remuxParts({ parts: [a, b], outFile: path.join(dir, "a.mp4"), ffmpegPath: "ff", runImpl: async (_f, args) => { seen = args; fs.writeFileSync(args.at(-1), "mp4"); return { ok: true }; } });
  assert.equal(ok.ok, true);
  assert.equal(fs.existsSync(a) || fs.existsSync(b), false);
  assert.equal(fs.readFileSync(path.join(dir, "a.mp4"), "utf8"), "mp4");
  assert.ok(seen.includes("concat"));
  fs.writeFileSync(a, "1");
  const bad = await remuxParts({ parts: [a], outFile: path.join(dir, "b.mp4"), ffmpegPath: "ff", runImpl: async () => ({ ok: false, stderr: "hata" }) });
  assert.equal(bad.ok, false);
  assert.equal(fs.existsSync(a), true);
  assert.equal(fs.existsSync(path.join(dir, "b.mp4")), false);
});

test("sabitleme: sabitlenen parçalar halkadan silinmez; unpin'de silinir", async () => {
  const { engine, children } = setup({ keepSegments: 2 });
  await engine.start({ url: null });
  const child = children[0];
  const dir = child.options.cwd;
  engine.pushChunk(HEADER);
  const list = [];
  const addSeg = (i) => {
    fs.writeFileSync(path.join(dir, ff.segmentName(i)), Buffer.alloc(100));
    list.push(`${ff.segmentName(i)},${i * 2}.000000,${i * 2 + 2}.000000`);
    fs.writeFileSync(path.join(dir, "list-1.csv"), `${list.join("\n")}\n`);
  };
  addSeg(0); addSeg(1);
  fs.writeFileSync(path.join(dir, ff.segmentName(2)), Buffer.alloc(10)); // yazılmakta
  progress(child, 4500);
  const pinId = engine.pin();
  assert.ok(pinId);
  for (let i = 2; i < 8; i += 1) { addSeg(i); progress(child, i * 2000 + 2500); }
  const exists = (i) => fs.existsSync(path.join(dir, ff.segmentName(i)));
  assert.equal(exists(0), false, "sabitlenmeden önceki parça silinir");
  assert.equal(exists(1), false);
  for (let i = 2; i < 8; i += 1) assert.equal(exists(i), true, `sabit parça ${i}`);
  const src = engine.pinnedSources(pinId);
  assert.deepEqual(src.complete.map((x) => x.index), [2, 3, 4, 5, 6, 7]);
  assert.equal(engine.clipSources().complete.length, 2);
  assert.equal(engine.unpin(pinId), true);
  assert.equal(exists(2), false);
  assert.equal(exists(7), true); // halkada
  assert.equal(engine.pinnedSources(pinId), null);
  await engine.stop();
});

test("açılar: kopya kipi düşerse (ilk ilerlemeden önce) yeniden kodlamaya geçer; açı programı etkilemez; düşük öncelik", async () => {
  const { children, spawnImpl } = fakeSpawn();
  const timers = fakeTimers();
  const angles = createAngles({
    getFfmpeg: async () => ({ available: true, path: "/bin/ffmpeg", encoders: { libx264: true } }),
    tempRoot: tmp("studio-angles-"), spawnImpl, timers,
  });
  const res = await angles.start({ sources: [{ id: "cam1", name: "Kamera 1", width: 1280, height: 720, mimeType: "video/x-matroska;codecs=avc1" }] });
  assert.equal(res.ok, true);
  assert.equal(at(children[0].args, "-c:v"), "copy");
  assert.equal(angles.status()[0].mode, "copy");
  angles.pushChunk("cam1", HEADER);
  stderr(children[0], "[mpegts @ 0x1] [error] H.264 bitstream malformed, no startcode found");
  children[0].emit("exit", 1, null);
  await tick();
  assert.equal(children.length, 2, "yeniden kodlamayla hemen yeniden");
  assert.equal(at(children[1].args, "-c:v"), "libx264");
  assert.equal(angles.status()[0].mode, "encode");
  await angles.stop();
  // Üst düzey mimeType (arayüz: angles.start({ sources, mimeType })) tüm kaynaklara uygulanır.
  await angles.start({ sources: [{ id: "cam2" }], mimeType: "video/webm;codecs=h264" });
  assert.equal(at(children.at(-1).args, "-c:v"), "copy");
  await angles.stop();
});

test("açı takılması yalnız o açıyı yeniden başlatır, program sürecine dokunmaz", async () => {
  const program = setup();
  await program.engine.start({ url: "rtmp://h/live/k" });
  program.engine.pushChunk(HEADER);
  progress(program.children[0], 1000);
  const { children, spawnImpl } = fakeSpawn();
  const timers = fakeTimers();
  let t = 5_000_000;
  const angles = createAngles({ getFfmpeg: async () => ({ available: true, path: "/bin/ffmpeg", encoders: { libx264: true } }), tempRoot: tmp("studio-angles-"), spawnImpl, timers, now: () => t });
  const angleRestarts = [];
  angles.events.on("restartRecorder", (p) => angleRestarts.push(p));
  await angles.start({ sources: [{ id: "cam1", mimeType: "video/x-matroska;codecs=avc1" }] });
  angles.pushChunk("cam1", HEADER);
  progress(children[0], 1000);
  t += 20000;
  timers.runNext(15000);
  assert.equal(children[0].killed, HARD_KILL);
  await tick();
  timers.runNext(2000);
  assert.equal(angleRestarts.length, 1);
  assert.equal(angleRestarts[0].sourceId, "cam1");
  assert.equal(program.children.length, 1);
  assert.equal(program.children[0].killed, undefined);
  assert.equal(program.restarts.length, 0);
  await angles.stop();
  await program.engine.stop();
});

/* --------------------------------- tanılama --------------------------------- */

test("tanılama günlüğü: oturum başına dosya, anahtar gizli, son hatalar; en yeni 20 dosya", () => {
  const dir = tmp("studio-logs-");
  for (let i = 0; i < 25; i += 1) fs.writeFileSync(path.join(dir, `studio-202601${String(i % 28 + 1).padStart(2, "0")}-000000.log`), "x");
  let t = Date.UTC(2026, 10, 5, 10, 0, 0);
  const d = createDiagnostics({ dir, now: () => t, maxBytes: 4000 });
  const file = d.begin({ url: "rtmp://h/live2/abcdefgh" });
  assert.match(path.basename(file), /^studio-\d{8}-\d{6}\.log$/);
  d.write("program", "ffmpeg başlıyor", { args: "-f tee [f=flv]rtmp://a.rtmp.youtube.com/live2/SECRETKEY99|seg%05d.ts" });
  t += 1000;
  d.write("program", "yeniden başlatma: RTMP çıkışı düştü", { code: "IO" });
  d.write("açı Kamera", "ffmpeg: [error] bozuk");
  const text = fs.readFileSync(file, "utf8");
  assert.equal(text.includes("SECRETKEY"), false);
  assert.equal(text.includes("abcdefgh"), false);
  assert.match(text, /\[program\] yeniden başlatma: RTMP çıkışı düştü \{"code":"IO"\}/);
  const snap = d.snapshot();
  assert.equal(snap.logPath, file);
  assert.deepEqual(snap.lastErrors.map((e) => e.message), ["yeniden başlatma: RTMP çıkışı düştü", "ffmpeg: [error] bozuk"]);
  assert.ok(fs.readdirSync(dir).length <= 20);
  for (let i = 0; i < 100; i += 1) d.write("program", `satır ${i} ${"x".repeat(50)}`);
  assert.ok(fs.statSync(file).size < 4300);
  assert.match(fs.readFileSync(file, "utf8"), /sınırına ulaştı/);
});

/* --------------------------------- röportaj --------------------------------- */

function fakeEngine() {
  const pins = new Map();
  let seq = 0;
  let cleanup = null;
  return {
    pins,
    activeFlag: true,
    active() { return this.activeFlag; },
    sessionId: () => "20261105-abc",
    pin() { seq += 1; pins.set(`p${seq}`, true); return `p${seq}`; },
    unpin: (id) => pins.delete(id),
    sources: null,
    pinnedSources(id) { return pins.has(id) ? this.sources : null; },
    setBeforeCleanup: (fn) => { cleanup = fn; },
    runCleanup: () => cleanup?.(),
  };
}

function fakeRun({ width = 1920, height = 1080, fps = 30, durationMs = 65000 } = {}) {
  const calls = [];
  const runImpl = async (_file, args) => {
    calls.push(args);
    if (args.length === 4 && args[2] === "-i") return { ok: true, stderr: `Duration: 00:01:05.00, start: 0\n  Stream #0:0: Video: h264 (High), yuv420p, ${width}x${height}, ${fps} fps\n  Stream #0:1: Audio: aac` };
    const out = args.at(-1);
    fs.writeFileSync(out, out.endsWith(".jpg") ? "jpeg" : Buffer.alloc(5000));
    return { ok: true, stderr: "", durationMs };
  };
  return { calls, runImpl };
}

test("röportaj: sabitle → durdur → concat (kopya + düzey + faststart) + kapak; liste / sil; yalnız kayıtta da", async () => {
  const dir = tmp("studio-int-dir-");
  const segDir = tmp("studio-int-seg-");
  const engine = fakeEngine();
  const { calls, runImpl } = fakeRun();
  const iv = createInterviews({ engine, interviewsDir: dir, getFfmpegPath: () => "ff", runImpl, timers: fakeTimers() });
  const statuses = [];
  iv.events.on("status", (s) => statuses.push(s));
  engine.activeFlag = false;
  assert.equal(iv.start({ matchId: 12 }).error.code, "NOT_RECORDING");
  engine.activeFlag = true;
  const r = iv.start({ matchId: 12, label: "Maç sonu röportajı" });
  assert.equal(r.ok, true);
  assert.equal(iv.start({ matchId: 12 }).error.code, "BUSY");
  assert.equal(iv.status().length, 1);
  const segs = [3, 4, 5].map((i) => {
    const p = path.join(segDir, ff.segmentName(i));
    fs.writeFileSync(p, "ts");
    return { index: i, path: p, durationSec: 2 };
  });
  const growingPath = path.join(segDir, ff.segmentName(6));
  fs.writeFileSync(growingPath, "ts");
  engine.sources = { complete: [segs[2], segs[0], segs[1]], growing: { index: 6, path: growingPath, durationSec: 1.2 } };
  const done = await iv.stop(r.interview.id);
  assert.equal(done.ok, true, JSON.stringify(done));
  const out = done.interview;
  assert.match(out.name, /^interview-12-\d{8}-\d{6}\.mp4$/);
  assert.equal(out.matchId, 12);
  assert.equal(out.label, "Maç sonu röportajı");
  assert.equal(out.width, 1920);
  assert.equal(out.level, "4.1");
  assert.match(out.url, /^elitlig-studio:\/\/interviews\/interview-12-/);
  assert.ok(out.posterPath && out.posterUrl);
  const concat = calls.find((a) => a.includes("concat"));
  assert.ok(concat.includes("+faststart"));
  assert.ok(concat.join(" ").includes("h264_metadata=level=4.1"));
  assert.equal(concat.includes("-t"), false);
  assert.equal(engine.pins.size, 0, "sabitleme kaldırılır");
  assert.deepEqual(iv.list().map((x) => x.name), [out.name]);
  assert.equal(iv.remove(out.name), true);
  assert.deepEqual(iv.list(), []);
  assert.equal(statuses.at(-1).active.length, 0);
  // Parça seçimi: kronolojik, büyüyen 0,3 sn'den uzunsa.
  assert.deepEqual(selectPinned({ complete: [{ index: 2, path: "b", durationSec: 2 }, { index: 1, path: "a", durationSec: 2 }], growing: { path: "g", durationSec: 0.2 } }).map((x) => x.path), ["a", "b"]);
});

test("röportaj: yayın durunca süren röportaj kendiliğinden yazılır; görüntü yoksa EMPTY", async () => {
  const dir = tmp("studio-int-dir-");
  const engine = fakeEngine();
  const { runImpl } = fakeRun();
  const iv = createInterviews({ engine, interviewsDir: dir, getFfmpegPath: () => "ff", runImpl, timers: fakeTimers() });
  const r = iv.start({ matchId: 5 });
  engine.sources = { complete: [], growing: null };
  const [res] = await iv.finalizeAll("SESSION_ENDED");
  assert.equal(res.ok, false);
  assert.equal(res.error.code, "EMPTY");
  assert.equal(iv.status().length, 0);
  assert.equal(engine.pins.size, 0);
  // Kendiliğinden bitmiş röportajı durdurmak aynı sonucu döner (arayüz "bulunamadı" görmez).
  assert.equal((await iv.stop(r.interview.id)).error.code, "EMPTY");
  assert.equal((await iv.stop("i-yok")).error.code, "NOT_FOUND");
});

function fakeApi(handler) {
  const calls = [];
  return { calls, request: async (req) => { calls.push(req); return handler(req); } };
}

test("röportaj yükleme: imzalı adres → PUT (+kapak) → bağla; ilerleme kind=interview; 404 → sunucu güncellemesi bekleniyor", async () => {
  const dir = tmp("studio-int-dir-");
  const name = "interview-12-20261105-101010.mp4";
  fs.writeFileSync(path.join(dir, name), Buffer.alloc(3000));
  fs.writeFileSync(path.join(dir, name.replace(".mp4", ".jpg")), Buffer.alloc(200));
  fs.writeFileSync(path.join(dir, name.replace(".mp4", ".json")), JSON.stringify({ matchId: 12, durationMs: 61000, width: 1280, height: 720, poster: name.replace(".mp4", ".jpg"), createdAt: "2026-11-05T10:10:10.000Z" }));
  const iv = createInterviews({ engine: fakeEngine(), interviewsDir: dir, getFfmpegPath: () => "ff" });
  const api = fakeApi((req) => {
    if (req.path.endsWith("/upload-url")) return { ok: true, data: { upload_url: "https://s3/x", key: "interviews/12.mp4", headers: { "Content-Type": "video/mp4" }, poster_upload_url: "https://s3/p", poster_key: "interviews/12.jpg" } };
    return { ok: true, data: { data: { interview: { url: "https://cdn/12.mp4" } } } };
  });
  const puts = [];
  const progress = [];
  const res = await iv.upload(api, { matchId: 12, name }, { putImpl: async (url, o) => { puts.push({ url, size: o.size, type: o.contentType }); o.onProgress(o.size); return { ok: true, status: 200 }; }, emitProgress: (p) => progress.push(p) });
  assert.equal(res.ok, true, JSON.stringify(res));
  assert.equal(api.calls[0].path, "/api/admin/live-streams/matches/12/interview/upload-url");
  assert.deepEqual(api.calls[0].body, { size_bytes: 3000, content_type: "video/mp4", duration_ms: 61000, width: 1280, height: 720 });
  assert.equal(api.calls[1].path, "/api/admin/live-streams/matches/12/interview");
  assert.deepEqual(api.calls[1].body, { key: "interviews/12.mp4", poster_key: "interviews/12.jpg", duration_ms: 61000, width: 1280, height: 720, size_bytes: 3000 });
  assert.deepEqual(puts.map((p) => p.type), ["video/mp4", "image/jpeg"]);
  assert.ok(progress.every((p) => p.kind === "interview" && p.matchId === 12));
  assert.equal(progress.at(-1).loaded, 3200);
  assert.equal(res.interview.uploaded.url, "https://cdn/12.mp4");
  const api404 = fakeApi(() => ({ ok: false, error: { status: 404, message: "Not found" } }));
  const r404 = await iv.upload(api404, { matchId: 12, name });
  assert.equal(r404.error.code, "SERVER_PENDING");
  assert.equal(r404.error.message, "Sunucu güncellemesi bekleniyor: röportaj yükleme ucu henüz yayında değil.");
  assert.equal((await iv.upload(api404, { matchId: 12, name: "../x.mp4" })).error.code, "NOT_FOUND");
});

/* ------------------------------ yükleme geri düşüşü ------------------------------ */

test("öne çıkan yükleme: upload-url 404 → 'Sunucu güncellemesi bekleniyor' (Türkçe, açık)", async () => {
  const dir = tmp("studio-hl-");
  const name = "highlight-20261105-101010.mp4";
  fs.writeFileSync(path.join(dir, name), Buffer.alloc(100));
  const res = await uploadHighlight(fakeApi(() => ({ ok: false, error: { status: 404, message: "Cannot POST" } })), { highlightsDir: dir, matchId: 3, name });
  assert.equal(res.ok, false);
  assert.equal(res.error.code, "SERVER_PENDING");
  assert.equal(res.error.message, "Sunucu güncellemesi bekleniyor: maç özeti yükleme ucu henüz yayında değil.");
  const r500 = await uploadHighlight(fakeApi(() => ({ ok: false, error: { status: 500, message: "boom" } })), { highlightsDir: dir, matchId: 3, name });
  assert.equal(r500.error.code, "UPLOAD_URL");
});

test("klip yükleme: eski sunucu 'poster' alanını reddederse (Unexpected field) kapaksız bir kez yeniden dener", async () => {
  const dir = tmp("studio-rp-");
  const id = "r20261105101010-abcdef";
  fs.mkdirSync(path.join(dir, id));
  fs.writeFileSync(path.join(dir, id, "program.mp4"), Buffer.alloc(500));
  fs.writeFileSync(path.join(dir, id, "program.jpg"), Buffer.alloc(50));
  fs.writeFileSync(path.join(dir, id, "replay.json"), JSON.stringify({ id, createdAt: "2026-11-05T10:10:10.000Z", kind: "goal", eventId: 9, angles: [{ angle: "program", file: "program.mp4", poster: "program.jpg", durationMs: 10000, width: 1280, height: 720, sizeBytes: 500 }] }));
  const store = createReplayStore({ replaysDir: dir, getFfmpegPath: () => "ff", sleep: async () => {} });
  for (const failure of [
    { status: 400, message: "Unexpected field" },
    { status: 500, message: "MulterError: Unexpected field" },
    { status: 400, message: "Yükleme başarısız", code: "LIMIT_UNEXPECTED_FILE" },
    { status: 400, message: "x", code: "UNEXPECTED_FIELD" },
  ]) {
    const bodies = [];
    const api = { upload: async (_p, { body }) => { bodies.push(body.toString("latin1")); return bodies.length === 1 ? { ok: false, error: failure } : { ok: true, data: { id: 1, url: "u" } }; } };
    const res = await store.upload(api, { matchId: 4, eventId: 9, replayId: id });
    assert.equal(res.ok, true, JSON.stringify(failure));
    assert.equal(res.posterSkipped, true);
    assert.equal(bodies.length, 2);
    assert.match(bodies[0], /name="poster"/);
    assert.doesNotMatch(bodies[1], /name="poster"/);
  }
  // Başka hata: yeniden denenmez.
  const bodies = [];
  const api = { upload: async (_p, { body }) => { bodies.push(body); return { ok: false, error: { status: 400, message: "Geçersiz olay" } }; } };
  assert.equal((await store.upload(api, { matchId: 4, eventId: 9, replayId: id })).ok, false);
  assert.equal(bodies.length, 1);
  assert.equal(isUnexpectedFieldError({ status: 413, message: "Unexpected field" }), false);
});

/* ---------------------------------- LED çıkışı ---------------------------------- */

function fakeElectron() {
  const windows = [];
  class FakeWindow extends EventEmitter {
    constructor(opts) {
      super();
      this.opts = opts;
      this.destroyed = false;
      this.shown = false;
      this.loaded = null;
      const wc = new EventEmitter();
      wc.id = 100 + windows.length;
      wc.sent = [];
      wc.send = (ch, payload) => wc.sent.push({ ch, payload });
      wc.setWindowOpenHandler = (fn) => { wc.openHandler = fn; };
      this.webContents = wc;
      windows.push(this);
    }
    isDestroyed() { return this.destroyed; }
    destroy() { this.destroyed = true; this.emit("closed"); }
    show() { this.shown = true; }
    setBounds(b) { this.bounds = b; }
    setFullScreen(v) { this.full = v; }
    setSimpleFullScreen(v) { this.simpleFull = v; }
    removeMenu() { this.menuRemoved = true; }
    setMenuBarVisibility() {}
    loadURL(url) { this.loaded = url; return Promise.resolve(); }
  }
  const screen = new EventEmitter();
  screen.list = [
    { id: 1, label: "Yerleşik Retina", bounds: { x: 0, y: 0, width: 1512, height: 982 }, scaleFactor: 2 },
    { id: 2, label: "", bounds: { x: 1512, y: 0, width: 1920, height: 1080 }, scaleFactor: 1 },
  ];
  screen.getAllDisplays = () => screen.list;
  screen.getPrimaryDisplay = () => screen.list[0];
  return { FakeWindow, windows, screen };
}

test("LED: ekranlar; web kipi (yalnız elitlig.com / API), çerçevesiz tam ekran siyah pencere, dış gezinme engelli", () => {
  const { FakeWindow, windows, screen } = fakeElectron();
  const led = createLedManager({ BrowserWindow: FakeWindow, screen, loadRenderer: () => {}, preloadPath: "/p.js", siteOrigin: "https://elitlig.com", apiOrigin: "https://api.example.com", platform: "win32" });
  const statuses = [];
  led.events.on("status", (s) => statuses.push(s));
  assert.deepEqual(led.displays(), [
    { id: 1, label: "Yerleşik Retina", bounds: { x: 0, y: 0, width: 1512, height: 982 }, primary: true, scaleFactor: 2, hostsStudio: false },
    { id: 2, label: "Ekran 2 (1920×1080)", bounds: { x: 1512, y: 0, width: 1920, height: 1080 }, primary: false, scaleFactor: 1, hostsStudio: false },
  ]);
  assert.equal(led.open({ displayId: 2, mode: "web", url: "https://evil.example/led" }).error.code, "BAD_URL");
  assert.equal(led.open({ displayId: 9, mode: "web", matchId: 5 }).error.code, "NO_DISPLAY");
  assert.equal(led.open({ displayId: 2, mode: "web" }).error.code, "BAD_REQUEST");
  const res = led.open({ displayId: 2, mode: "web", matchId: 77 });
  assert.equal(res.ok, true);
  const w = windows.at(-1);
  assert.equal(w.loaded, "https://elitlig.com/led/77");
  assert.equal(w.opts.frame, false);
  assert.equal(w.opts.fullscreen, true);
  assert.equal(w.opts.backgroundColor, "#000000");
  assert.equal(w.opts.x, 1512);
  assert.equal(w.opts.webPreferences.preload, undefined);
  assert.equal(w.opts.webPreferences.sandbox, true);
  assert.equal(w.menuRemoved, true);
  assert.deepEqual(w.webContents.openHandler({ url: "https://elitlig.com/x" }), { action: "deny" });
  let prevented = false;
  w.webContents.emit("will-navigate", { preventDefault: () => { prevented = true; } }, "https://google.com");
  assert.equal(prevented, true);
  prevented = false;
  w.webContents.emit("will-navigate", { preventDefault: () => { prevented = true; } }, "https://api.example.com/led/77");
  assert.equal(prevented, false);
  w.emit("ready-to-show");
  assert.equal(w.shown, true);
  assert.deepEqual(led.status(), { open: true, displayId: 2, mode: "web", url: "https://elitlig.com/led/77", windowed: false, closeShortcut: "CommandOrControl+Shift+L" });
  assert.equal(statuses.at(-1).open, true);
  assert.equal(isAllowedLedUrl("http://elitlig.com/led/1", ["https://elitlig.com"]), false);
  assert.equal(describeDisplay({ id: 3, bounds: {} }, 1, 2).label, "Ekran 3");
  led.dispose();
});

test("LED: studio kipi #led-output + aynı preload; durum aktarımı; Esc iki kez kapatır; ekran çıkarılınca kapanır", () => {
  const { FakeWindow, windows, screen } = fakeElectron();
  const loads = [];
  let t = 0;
  const led = createLedManager({ BrowserWindow: FakeWindow, screen, loadRenderer: (win, hash) => { loads.push(hash); return Promise.resolve(); }, preloadPath: "/p.js", platform: "darwin", now: () => t, displayGraceMs: 0 });
  const statuses = [];
  const displaysEv = [];
  led.events.on("status", (s) => statuses.push(s));
  led.events.on("displays", (d) => displaysEv.push(d));
  assert.equal(led.sendState({ score: "0-0" }), false); // pencere yok: yalnız saklanır
  const res = led.open({ mode: "studio" }); // ekran verilmezse birincil olmayan
  assert.equal(res.ok, true);
  assert.equal(res.displayId, 2);
  const w = windows.at(-1);
  assert.deepEqual(loads, ["led-output"]);
  assert.equal(w.opts.webPreferences.preload, "/p.js");
  assert.equal(w.opts.fullscreen, false); // macOS: ready-to-show'da basit tam ekran
  w.emit("ready-to-show");
  assert.equal(w.simpleFull, true);
  w.webContents.emit("did-finish-load");
  assert.deepEqual(w.webContents.sent.at(-1), { ch: "studio:led:state", payload: { score: "0-0" } });
  assert.equal(led.sendState({ score: "1-0" }), true);
  assert.deepEqual(w.webContents.sent.at(-1).payload, { score: "1-0" });
  assert.equal(led.sendState({ x: 1 }, w.webContents), false, "LED kendine yollamaz");
  assert.deepEqual(led.getState(), { score: "1-0" });
  // Esc: tek basış kapatmaz, 1,5 sn içinde ikinci kapatır.
  const esc = () => w.webContents.emit("before-input-event", { preventDefault() {} }, { type: "keyDown", key: "Escape" });
  esc(); t += 2000; esc();
  assert.equal(w.destroyed, false);
  t += 500; esc();
  assert.equal(w.destroyed, true);
  assert.equal(statuses.at(-1).open, false);
  assert.equal(statuses.at(-1).reason, "ESC");
  // Ekran çıkarılması.
  led.open({ displayId: 2, mode: "studio" });
  const w2 = windows.at(-1);
  screen.list = screen.list.slice(0, 1);
  screen.emit("display-removed", {}, { id: 2 });
  assert.equal(w2.destroyed, true);
  assert.equal(statuses.at(-1).reason, "DISPLAY_REMOVED");
  assert.equal(led.status().open, false);
  assert.equal(displaysEv.at(-1).length, 1);
  // Yeniden açmak eskisini kapatır.
  screen.list.push({ id: 3, bounds: { x: 0, y: 0, width: 800, height: 600 } });
  assert.equal(led.open({ displayId: 1, mode: "studio" }).error.code, "SHARED_DISPLAY");
  led.open({ displayId: 1, mode: "studio", confirmShared: true });
  const a = windows.at(-1);
  led.open({ displayId: 3, mode: "studio" });
  assert.equal(a.destroyed, true);
  assert.equal(led.close(), true);
  assert.equal(led.status().open, false);
  assert.equal(led.open({ mode: "bad" }).error.code, "BAD_MODE");
});

/* -------------------------------- diğer -------------------------------- */

test("dış bağlantılar: accounts.google.com ve API adresleri açılır; file/javascript açılmaz", () => {
  for (const ok of ["https://accounts.google.com/o/oauth2/v2/auth?x=1", "https://elitlig-api-88a866b7a4da.herokuapp.com/api/youtube/connect", "https://studio.youtube.com", "mailto:a@b.c", "tel:+90"]) assert.equal(isAllowedExternal(ok), true, ok);
  for (const bad of ["file:///etc/passwd", "javascript:alert(1)", "data:text/html,x", "elitlig-studio://x", "", null, "https://"]) assert.equal(isAllowedExternal(bad), false, String(bad));
});

test("Chromium bayrakları: arka plan / örtülü pencere kısıtlaması kapalı; var olan disable-features korunur", () => {
  const switches = new Map([["disable-features", "Foo"]]);
  const app = { commandLine: { appendSwitch: (k, v = "") => switches.set(k, v), getSwitchValue: (k) => switches.get(k) || "" } };
  applyStudioSwitches(app);
  assert.equal(switches.has("disable-renderer-backgrounding"), true);
  assert.equal(switches.has("disable-background-timer-throttling"), true);
  assert.equal(switches.has("disable-backgrounding-occluded-windows"), true);
  assert.equal(switches.get("disable-features"), "Foo,CalculateNativeWinOcclusion");
});

test("ayarlar: son kayıt klasörü hatırlanır", () => {
  const file = path.join(tmp("studio-set-"), "studio-settings.json");
  const s = createSettings(file);
  assert.equal(s.get("recordDir"), undefined);
  s.set({ recordDir: "/Users/a/Movies/ElitLig" });
  assert.equal(createSettings(file).get("recordDir"), "/Users/a/Movies/ElitLig");
});
