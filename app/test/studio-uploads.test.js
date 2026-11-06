"use strict";
// 2.11.1: yükleme günlüğü, röportaj durdurma (arayüz sözleşmesi), yükleme yeniden
// denemeleri, yerel kaydın ayrı kalitesi (ikinci kodlayıcı), LED durum aktarımı
// ve uyku / uyanma, IPC (registerStudio) üzerinden uçtan uca kablolama.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { EventEmitter } = require("node:events");
const ff = require("../studio/ffmpeg");
const { createStudioEngine } = require("../studio/engine");
const { createInterviews } = require("../studio/interview");
const { createReplayStore } = require("../studio/replays");
const { createUploadLog, withUploadLog, kindOfPath, safeEndpoint } = require("../studio/uploadlog");
const { s3Error, putFile } = require("../studio/highlights");
const { createLedManager } = require("../studio/led");
const { registerStudio } = require("../studio/index");

const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));
const tick = () => new Promise((r) => setImmediate(r));
const at = (args, flag) => args[args.indexOf(flag) + 1];

function fakeTimers() {
  const pending = new Map();
  let id = 0;
  return {
    pending,
    setTimeout: (fn, ms) => { id += 1; pending.set(id, { fn, ms }); return id; },
    clearTimeout: (t) => pending.delete(t),
    runAll() { for (const [k, v] of [...pending.entries()]) { pending.delete(k); v.fn(); } },
  };
}

/* ------------------------------- yükleme günlüğü ------------------------------- */

test("yükleme günlüğü: tür / uç / durum / kod; jeton ve imza yazılmaz; diske yazılır, sınırlı", async () => {
  const file = path.join(tmp("uplog-"), "logs", "uploads.json");
  const log = createUploadLog({ file, max: 5 });
  assert.equal(kindOfPath("/api/admin/live-streams/matches/7/clips?event_id=1"), "clip");
  assert.equal(kindOfPath("/api/admin/live-streams/matches/7/highlight/upload-url"), "highlight");
  assert.equal(kindOfPath("/api/admin/live-streams/matches/7/interview"), "interview");
  assert.equal(kindOfPath("/api/maclar/7/olaylar"), null);
  assert.equal(safeEndpoint("https://b.fra1.digitaloceanspaces.com/highlights/7/a.mp4?X-Amz-Signature=abc&X-Amz-Credential=k"), "https://b.fra1.digitaloceanspaces.com/highlights/7/a.mp4");

  const calls = [];
  const api = {
    request: async (o) => { calls.push(o.path); return o.path.endsWith("upload-url") ? { ok: false, error: { status: 404, message: "Endpoint not found", code: undefined } } : { ok: true, data: {} }; },
    upload: async (p) => { calls.push(p); return { ok: false, error: { status: 400, code: "EVENT_NOT_GOAL", message: "Klip yalnızca gol olaylarına eklenebilir. Bearer abc.def" } }; },
    other: 1,
  };
  const wrapped = withUploadLog(api, log);
  assert.equal(wrapped.other, 1);
  await wrapped.request({ method: "GET", path: "/api/maclar/7" }); // stüdyo yüklemesi değil: yazılmaz
  await wrapped.request({ method: "POST", path: "/api/admin/live-streams/matches/7/interview/upload-url", body: { size_bytes: 99 } });
  await wrapped.upload("/api/admin/live-streams/matches/7/clips?event_id=12", { body: Buffer.alloc(10) });
  const put = withUploadLog.put(async () => ({ ok: false, status: 403, code: "SignatureDoesNotMatch", message: "imza" }), log);
  await put("https://s/highlights/7/a.mp4?X-Amz-Signature=SECRET", { kind: "highlight", size: 5, matchId: 7 });
  const list = log.list();
  assert.equal(list.length, 3);
  assert.deepEqual(list.map((e) => [e.kind, e.method, e.status, e.code]), [["highlight", "PUT", 403, "SignatureDoesNotMatch"], ["clip", "POST", 400, "EVENT_NOT_GOAL"], ["interview", "POST", 404, null]]);
  assert.equal(list[1].endpoint, "/api/admin/live-streams/matches/7/clips");
  assert.equal(list[1].eventId, 12);
  assert.equal(list[1].matchId, 7);
  assert.equal(list[2].bytes, 99);
  assert.ok(!JSON.stringify(list).includes("SECRET"));
  assert.ok(!JSON.stringify(list).includes("abc.def"), "Bearer jetonu maskelenir");
  for (let i = 0; i < 10; i += 1) log.record({ kind: "clip", ok: true });
  assert.equal(log.list().length, 5);
  log.flush();
  assert.equal(JSON.parse(fs.readFileSync(file, "utf8")).length, 5);
  assert.equal(createUploadLog({ file }).list().length, 5);
  assert.equal(s3Error("<Error><Code>RequestTimeTooSkewed</Code><Message>saat</Message></Error>").code, "RequestTimeTooSkewed");
});

test("klip yüklemesi: geçici sunucu hatası (503 / H12) bir kez yeniden denenir; 400 ve zaman aşımı denenmez", async () => {
  const dir = tmp("rp-retry-");
  const id = "r20261105120000-abcdef";
  fs.mkdirSync(path.join(dir, id));
  fs.writeFileSync(path.join(dir, id, "program.mp4"), Buffer.alloc(100));
  fs.writeFileSync(path.join(dir, id, "replay.json"), JSON.stringify({ id, createdAt: new Date().toISOString(), kind: "goal", angles: [{ angle: "program", file: "program.mp4", durationMs: 10000, width: 1280, height: 720 }] }));
  const store = createReplayStore({ replaysDir: dir, getFfmpegPath: () => "ff", sleep: async () => {} });
  for (const [first, expected] of [[{ ok: false, error: { status: 503, code: "HTTP_503" } }, 2], [{ ok: false, error: { status: 400 } }, 1], [{ ok: false, offline: true, timeout: true, error: { status: 0, code: "TIMEOUT" } }, 1]]) {
    let n = 0;
    const api = { upload: async () => { n += 1; return n === 1 ? first : { ok: true, data: { id: 5, url: "u" } }; } };
    // eslint-disable-next-line no-await-in-loop
    await store.upload(api, { matchId: 7, eventId: 100, replayId: id });
    assert.equal(n, expected, JSON.stringify(first));
  }
});

/* --------------------------------- röportaj --------------------------------- */

function fakeEngine() {
  const pins = new Map();
  let seq = 0;
  return {
    pins, sources: null,
    active: () => true,
    sessionId: () => "20261105-abc",
    pin() { seq += 1; pins.set(`p${seq}`, true); return `p${seq}`; },
    unpin: (pid) => pins.delete(pid),
    pinnedSources(pid) { return pins.has(pid) ? this.sources : null; },
  };
}

function fakeRun() {
  return async (_file, args) => {
    if (args.length === 4 && args[2] === "-i") return { ok: true, stderr: "Duration: 00:00:30.00, start: 0\n  Stream #0:0: Video: h264 (High), yuv420p, 1280x720, 30 fps\n" };
    const out = args.at(-1);
    await new Promise((r) => setTimeout(r, 5));
    fs.writeFileSync(out, out.endsWith(".jpg") ? "jpeg" : Buffer.alloc(4000));
    return { ok: true, stderr: "" };
  };
}

test("röportaj: start → { id }; stop(id) → { file }; id kaybolsa da tek kayıt durur; çift stop aynı sonuç; upload → data.url", async () => {
  const dir = tmp("iv-");
  const segDir = tmp("iv-seg-");
  const engine = fakeEngine();
  const iv = createInterviews({ engine, interviewsDir: dir, getFfmpegPath: () => "ff", runImpl: fakeRun(), timers: fakeTimers() });
  const seg = path.join(segDir, ff.segmentName(1));
  fs.writeFileSync(seg, "ts");
  engine.sources = { complete: [{ index: 1, path: seg, durationSec: 2 }], growing: null };

  // Arayüz (useInterview) res.id'yi saklar ve stop(id) çağırır; sonuç res.file.
  const r = iv.start({ matchId: 12, label: "Röportaj" });
  assert.equal(r.ok, true);
  assert.match(r.id, /^i\d{8}-\d{6}-[0-9a-f]{6}$/);
  assert.equal(r.interview.id, r.id);
  const [a, b] = await Promise.all([iv.stop(r.id), iv.stop(r.id)]);
  assert.equal(a.ok, true, JSON.stringify(a));
  assert.equal(a, b, "eşzamanlı ikinci stop aynı sonucu alır");
  assert.equal(a.file.name, a.interview.name);
  assert.match(a.file.name, /^interview-12-/);
  assert.equal(engine.pins.size, 0);
  assert.equal((await iv.stop(r.id)).file.name, a.file.name, "bitmiş röportaj yeniden durdurulunca aynı dosya");

  // Eski arayüz: id tutulmadı (undefined) → süren tek röportaj durur.
  const r2 = iv.start({ matchId: 13 });
  assert.equal(r2.ok, true);
  const s2 = await iv.stop(undefined);
  assert.equal(s2.ok, true);
  assert.equal(s2.id, r2.id);
  // İki röportaj sürerken id'siz stop belirsiz: maça göre seçilir, yoksa NOT_FOUND.
  const x = iv.start({ matchId: 20 });
  const y = iv.start({ matchId: 21 });
  assert.equal((await iv.stop(null)).error.code, "NOT_FOUND");
  assert.equal((await iv.stop({ matchId: 21 })).id, y.id);
  assert.equal((await iv.stop("yanlis-id")).id, x.id, "bilinmeyen id + tek süren → o durur");

  // Yükleme: arayüz res.data.url okur.
  const api = {
    request: async (req) => (req.path.endsWith("/upload-url")
      ? { ok: true, data: { upload_url: "https://s3/x", key: "interviews/12/a.mp4", headers: {} } }
      : { ok: true, data: { interview: { url: "https://cdn/12.mp4" } } }),
  };
  const up = await iv.upload(api, { matchId: 12, name: a.file.name }, { putImpl: async () => ({ ok: true, status: 200 }) });
  assert.equal(up.ok, true, JSON.stringify(up));
  assert.equal(up.data.url, "https://cdn/12.mp4");
});

/* ----------------------------- yerel kayıt kalitesi ----------------------------- */

test("yerel kayıt kalitesi: farklıysa split + iki kodlayıcı (tee select v:0 / v:1), aynıysa tek kodlama", () => {
  const stream = { width: 1280, height: 720, fps: 30, videoBitrateKbps: 4500 };
  assert.equal(ff.normalizeLocalQuality({}, stream), null);
  assert.equal(ff.normalizeLocalQuality({ height: 720, fps: 30, videoBitrateKbps: 4500 }, stream), null);
  assert.deepEqual(ff.normalizeLocalQuality({ height: 1080, videoBitrateKbps: 12000 }, stream), { width: 1920, height: 1080, fps: 30, videoBitrateKbps: 12000 });
  assert.deepEqual(ff.normalizeLocalQuality({ fps: 60 }, stream), { width: 1280, height: 720, fps: 60, videoBitrateKbps: 4500 });
  assert.deepEqual(ff.specifyStream(["-c:v", "x", "-b:v", "1k", "-maxrate", "1k", "-profile:v", "high", "-bsf:v", "b"], "v:1"), ["-c:v:1", "x", "-b:v:1", "1k", "-maxrate:v:1", "1k", "-profile:v:1", "high", "-bsf:v:1", "b"]);
  const q = ff.normalizeLocalQuality({ height: 1080, videoBitrateKbps: 12000 }, stream);
  const args = ff.buildStreamArgs({ url: "rtmp://a/live2/KEY", ...stream, audioBitrateKbps: 160, encoder: ff.ENCODERS.videotoolbox, localFile: "/k/a.mkv", localEncode: q, fifo: true });
  assert.ok(at(args, "-filter_complex").startsWith("[0:v:0]split=2"));
  assert.equal(args.includes("-vf"), false);
  assert.equal(at(args, "-c:v:0"), "h264_videotoolbox");
  assert.equal(at(args, "-b:v:0"), "4500k");
  assert.equal(at(args, "-b:v:1"), "12000k");
  assert.equal(at(args, "-level:v:1"), "4.1");
  assert.equal(at(args, "-force_key_frames:v:0"), "expr:gte(t,n_forced*2)");
  const tee = args.at(-1).split("|");
  assert.equal(tee.length, 3);
  assert.match(tee[0], /^\[f=flv:.*select=\\'v:0,a\\'/);
  assert.match(tee[1], /^\[f=matroska:onfail=ignore:select=\\'v:1,a\\'\]\/k\/a\.mkv$/);
  assert.match(tee[2], /^\[f=segment:.*select=\\'v:0,a\\'\]seg%05d\.ts$/);
  assert.deepEqual(ff.streamSlaves({ url: "x", localFile: "y" }), ["rtmp", "local", "segment"], "slave sırası değişmez");
  // localEncode yoksa eski komut.
  const plain = ff.buildStreamArgs({ url: null, ...stream, audioBitrateKbps: 160, encoder: "libx264", localFile: "/k/a.mkv" });
  assert.equal(plain.includes("-filter_complex"), false);
});

function engineSetup(encoders) {
  const children = [];
  const spawnImpl = (file, args) => {
    const child = new EventEmitter();
    child.args = args;
    child.stdout = Object.assign(new EventEmitter(), { setEncoding() {} });
    child.stderr = Object.assign(new EventEmitter(), { setEncoding() {} });
    child.stdin = Object.assign(new EventEmitter(), { writable: true, destroyed: false, writableLength: 0, write() { return true; }, end() { setImmediate(() => child.emit("exit", 0, null)); }, destroy() {} });
    child.kill = (sig) => setImmediate(() => child.emit("exit", null, sig));
    children.push(child);
    return child;
  };
  const statuses = [];
  const engine = createStudioEngine({
    getFfmpeg: async () => ({ available: true, path: "/bin/ffmpeg", version: "7.1.1", encoders, muxers: { tee: true, segment: true, flv: true, fifo: true, matroska: true } }),
    tempRoot: tmp("eng-lq-"), spawnImpl, timers: fakeTimers(),
  });
  engine.events.on("status", (s) => statuses.push(s));
  return { engine, children, statuses };
}

test("motor: yerel kayıt ayrı kalitesi yalnız donanım kodlayıcıda; x264'te yayın kalitesi + uyarı (izinle ayrı)", async () => {
  const dir = tmp("lq-dir-");
  const opts = { url: null, width: 1280, height: 720, fps: 30, videoBitrateKbps: 4500, localRecord: { enabled: true, dir, height: 1080, videoBitrateKbps: 12000 } };
  let { engine, children, statuses } = engineSetup({ videotoolbox: true, libx264: true });
  let res = await engine.start(opts);
  assert.equal(res.ok, true);
  assert.deepEqual(res.localQuality, { separate: true, width: 1920, height: 1080, fps: 30, videoBitrateKbps: 12000, encoder: "h264_videotoolbox" });
  assert.ok(children[0].args.includes("-filter_complex"));
  assert.equal(statuses.at(-1).localQuality.separate, true);
  await engine.stop();

  ({ engine, children } = engineSetup({ libx264: true }));
  res = await engine.start(opts);
  assert.equal(res.localQuality.separate, false);
  assert.equal(res.localQuality.reason, "NO_HW_ENCODER");
  assert.equal(children[0].args.includes("-filter_complex"), false);
  await engine.stop();

  ({ engine, children } = engineSetup({ libx264: true }));
  res = await engine.start({ ...opts, localRecord: { ...opts.localRecord, allowSoftware: true } });
  assert.equal(res.localQuality.separate, true);
  await engine.stop();

  // Kalite verilmedi: localQuality yok, eski komut.
  ({ engine, children } = engineSetup({ videotoolbox: true }));
  res = await engine.start({ ...opts, localRecord: { enabled: true, dir } });
  assert.equal(res.localQuality, undefined);
  assert.equal(children[0].args.includes("-filter_complex"), false);
  await engine.stop();
});

const ffmpegBin = ff.resolveFfmpeg({ resourcesPath: null });
test("gerçek ffmpeg: yerel kayıt 960×540@25 2,5 Mb/sn, parça halkası 640×360@30 (tek süreç, iki kodlayıcı)", { skip: ffmpegBin ? false : "ffmpeg yok", timeout: 60000 }, async () => {
  const work = tmp("lq-real-");
  const input = await new Promise((resolve, reject) => {
    const chunks = [];
    const p = spawn(ffmpegBin.path, ["-hide_banner", "-nostdin", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=30", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000", "-t", "5", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-g", "30", "-c:a", "libopus", "-b:a", "96k", "-f", "matroska", "-live", "1", "pipe:1"]);
    p.stdout.on("data", (d) => chunks.push(d));
    p.on("exit", (code) => (code === 0 ? resolve(Buffer.concat(chunks)) : reject(new Error(`ffmpeg ${code}`))));
  });
  const stream = { width: 640, height: 360, fps: 30, videoBitrateKbps: 800 };
  const q = ff.normalizeLocalQuality({ height: 540, fps: 25, videoBitrateKbps: 2500 }, stream);
  const localFile = path.join(work, "yerel.mkv");
  const args = ff.buildStreamArgs({ url: null, ...stream, audioBitrateKbps: 128, encoder: "libx264", localFile, localEncode: q, speedLevel: 2, fpsMode: ff.supportsFpsMode((await ff.probeFfmpeg(ffmpegBin, { testEncoders: false })).version) });
  const code = await new Promise((resolve) => {
    const p = spawn(ffmpegBin.path, args, { cwd: work });
    let err = "";
    p.stderr.on("data", (d) => { err += d; });
    p.on("exit", (c) => { if (c !== 0) console.error(err); resolve(c); });
    p.stdin.end(input);
  });
  assert.equal(code, 0);
  const probe = async (file) => ff.parseProbe((await ff.run(ffmpegBin.path, ["-hide_banner", "-nostdin", "-i", file])).stderr);
  const local = await probe(localFile);
  assert.equal(local.width, 960);
  assert.equal(local.height, 540);
  const segs = fs.readdirSync(work).filter((n) => /^seg\d+\.ts$/.test(n));
  assert.ok(segs.length >= 2, segs.join(","));
  const seg = await probe(path.join(work, segs[0]));
  assert.equal(seg.width, 640);
  assert.equal(seg.height, 360);
});

/* ------------------------------------ LED ------------------------------------ */

function fakeElectron() {
  const windows = [];
  class FakeWindow extends EventEmitter {
    constructor(opts) {
      super();
      this.opts = opts;
      this.destroyed = false;
      this.shown = false;
      this.hidden = false;
      const wc = new EventEmitter();
      wc.id = 100 + windows.length;
      wc.sent = [];
      wc.send = (ch, payload) => wc.sent.push({ ch, payload });
      wc.setWindowOpenHandler = () => {};
      this.webContents = wc;
      windows.push(this);
    }
    isDestroyed() { return this.destroyed; }
    destroy() { this.destroyed = true; this.emit("closed"); }
    show() { this.shown = true; this.hidden = false; }
    hide() { this.hidden = true; }
    setBounds(b) { this.bounds = b; }
    setFullScreen(v) { this.full = v; }
    isSimpleFullScreen() { return Boolean(this.simpleFull); }
    setSimpleFullScreen(v) { this.simpleFull = v; this.simpleCalls = (this.simpleCalls || 0) + 1; }
    removeMenu() {}
    setMenuBarVisibility() {}
    loadURL() { return Promise.resolve(); }
  }
  const screen = new EventEmitter();
  screen.list = [
    { id: 1, label: "Yerleşik", bounds: { x: 0, y: 0, width: 1512, height: 982 } },
    { id: 2, label: "LG LED", bounds: { x: 1512, y: 0, width: 1920, height: 1080 } },
  ];
  screen.getAllDisplays = () => screen.list;
  screen.getPrimaryDisplay = () => screen.list[0];
  return { FakeWindow, windows, screen };
}

test("LED: 60 Hz durum akışı ~30 Hz'e birleşir, son durum kaybolmaz; 10 Hz akış birebir geçer; zamanlayıcı sızmaz", () => {
  const { FakeWindow, windows, screen } = fakeElectron();
  let t = 0;
  // Sahte saat: zamanlayıcı süresi dolunca (due ≤ t) çalışır.
  const pending = new Map();
  let seq = 0;
  const timers = {
    pending,
    setTimeout: (fn, ms) => { seq += 1; pending.set(seq, { fn, due: t + ms }); return seq; },
    clearTimeout: (k) => pending.delete(k),
    advance(to) { t = to; for (const [k, v] of [...pending.entries()]) if (v.due <= t) { pending.delete(k); v.fn(); } },
    runAll() { for (const [k, v] of [...pending.entries()]) { pending.delete(k); v.fn(); } },
  };
  const led = createLedManager({ BrowserWindow: FakeWindow, screen, loadRenderer: () => Promise.resolve(), platform: "darwin", now: () => t, timers });
  led.open({ displayId: 2, mode: "studio", view: "preview" });
  assert.equal(led.status().view, "preview");
  const w = windows.at(-1);
  const sent = () => w.webContents.sent.filter((x) => x.ch === "studio:led:state");
  // 60 Hz, 1 sn.
  for (let i = 0; i < 60; i += 1) {
    timers.advance(Math.round(i * (1000 / 60)));
    led.sendState({ view: "program", n: i });
  }
  timers.advance(t + 1000);
  assert.ok(sent().length <= 31, `gönderilen ${sent().length}`);
  assert.ok(sent().length >= 25, `gönderilen ${sent().length}`);
  assert.equal(sent().at(-1).payload.n, 59, "son durum iletilir");
  assert.equal(timers.pending.size, 0);
  assert.equal(led.status().view, "program");
  // 10 Hz: her biri gider.
  const before = sent().length;
  for (let i = 0; i < 10; i += 1) { timers.advance(t + 100); led.sendState({ view: "scene", sceneId: "s1", n: i }); }
  assert.equal(sent().length - before, 10);
  assert.equal(led.status().sceneId, "s1");
  // Kapatınca bekleyen zamanlayıcı kalmaz.
  led.sendState({ n: "x" });
  led.sendState({ n: "y" });
  led.close();
  assert.equal(timers.pending.size, 0);
  led.dispose();
});

test("LED: uykuda ekran çıkıp dönerse (kimliği değişse de) pencere aynı ekrana yeniden yerleşir; dönmezse kapanır; uyanınca yeniden tam ekran", () => {
  const { FakeWindow, windows, screen } = fakeElectron();
  const timers = fakeTimers();
  const power = new EventEmitter();
  const statuses = [];
  const led = createLedManager({ BrowserWindow: FakeWindow, screen, loadRenderer: () => Promise.resolve(), platform: "darwin", timers, powerMonitor: power, displayGraceMs: 120000 });
  led.events.on("status", (s) => statuses.push(s));
  led.open({ displayId: 2, mode: "studio" });
  const w = windows.at(-1);
  w.emit("ready-to-show");
  assert.equal(w.simpleFull, true);
  // Uyku: harici ekran kaldırıldı → gizli bekler.
  screen.list = [screen.list[0]];
  screen.emit("display-removed", {}, { id: 2 });
  assert.equal(w.destroyed, false);
  assert.equal(w.hidden, true);
  assert.equal(led.status().waitingDisplay, true);
  assert.equal(statuses.at(-1).reason, "DISPLAY_WAIT");
  // Uyanma: ekran YENİ kimlikle döndü (aynı ad + boyut) → yerine konur.
  screen.list = [screen.list[0], { id: 7, label: "LG LED", bounds: { x: 1512, y: 0, width: 1920, height: 1080 } }];
  screen.emit("display-added", {}, screen.list[1]);
  assert.equal(led.status().displayId, 7);
  assert.equal(led.status().waitingDisplay, undefined);
  assert.equal(w.shown, true);
  assert.deepEqual(w.bounds, { x: 1512, y: 0, width: 1920, height: 1080 });
  assert.equal(statuses.at(-1).reason, "DISPLAY_RESTORED");
  assert.equal([...timers.pending.values()].filter((x) => x.ms === 120000).length, 0, "bekleme zamanlayıcısı temizlendi");
  // Uyanınca (resume) macOS pencereyi birincil ekrana taşımış olabilir: yeniden yerleşir.
  w.bounds = { x: 0, y: 0, width: 800, height: 600 };
  power.emit("resume");
  assert.deepEqual(w.bounds, { x: 1512, y: 0, width: 1920, height: 1080 });
  assert.equal(w.simpleFull, true);
  timers.runAll(); // gecikmeli ikinci yerleşme
  // Çözünürlük değişti → yeni sınırlar.
  screen.list[1].bounds = { x: 1512, y: 0, width: 3840, height: 2160 };
  screen.emit("display-metrics-changed", {}, screen.list[1], ["bounds"]);
  assert.equal(w.bounds.width, 3840);
  // Ekran geri gelmezse süre dolunca kapanır.
  screen.list = [screen.list[0]];
  screen.emit("display-removed", {}, { id: 7 });
  timers.runAll();
  assert.equal(w.destroyed, true);
  assert.equal(statuses.at(-1).reason, "DISPLAY_REMOVED");
  led.dispose();
  assert.equal(power.listenerCount("resume"), 0);
  assert.equal(power.listenerCount("unlock-screen"), 0);
  assert.equal(screen.listenerCount("display-added"), 0);
});

/* ------------------------------ IPC (registerStudio) ------------------------------ */

function studioHarness({ signedIn = true, api = null } = {}) {
  const root = tmp("studio-ipc-");
  const handlers = new Map();
  const listeners = new Map();
  const broadcasts = [];
  const ipcMain = { handle: (ch, fn) => handlers.set(ch, fn), on: (ch, fn) => listeners.set(ch, fn) };
  const ses = { setPermissionRequestHandler() {}, setPermissionCheckHandler() {}, setDisplayMediaRequestHandler() {} };
  const app = { getPath: (k) => path.join(root, k), getVersion: () => "2.11.1", isPackaged: false, commandLine: null };
  const studio = registerStudio({
    ipcMain, api: api || { request: async () => ({ ok: true, data: {} }), upload: async () => ({ ok: true, data: {} }) },
    broadcast: (ch, p) => broadcasts.push({ ch, p }), app,
    electronSession: { defaultSession: ses }, systemPreferences: {}, desktopCapturer: { getSources: async () => [] },
    powerSaveBlocker: { start: () => 1, stop() {} }, protocol: { handle() {} }, shell: {}, isOwnUrl: () => true,
    isSignedIn: () => signedIn,
  });
  const invoke = (ch, ...args) => handlers.get(ch)({ sender: { id: 1, isDestroyed: () => false, setBackgroundThrottling() {} } }, ...args);
  return { studio, invoke, handlers, listeners, broadcasts, root };
}

test("IPC: yükleme denemeleri (yerel ret dahil) studio.diagnostics().uploads'ta; oturum kapalı → SIGNED_OUT", async (t) => {
  const h = studioHarness({ signedIn: false });
  t.after(() => h.studio.dispose());
  let res = await h.invoke("studio:uploadClip", { matchId: 7, eventId: 100, replayId: "r20261105120000-abcdef" });
  assert.equal(res.error.code, "SIGNED_OUT");
  res = await h.invoke("studio:uploadHighlight", { matchId: 7, name: "highlight-x.mp4" });
  assert.equal(res.error.code, "SIGNED_OUT");
  const diag = await h.invoke("studio:diagnostics");
  assert.ok(Array.isArray(diag.uploads));
  assert.deepEqual(diag.uploads.map((e) => [e.kind, e.code, e.local]), [["highlight", "SIGNED_OUT", true], ["clip", "SIGNED_OUT", true]]);
  assert.equal(diag.uploads[1].eventId, 100);
  assert.equal(await h.invoke("studio:clearUploadLog"), true);
  assert.deepEqual((await h.invoke("studio:diagnostics")).uploads, []);
});

test("IPC: olay seçilmeden klip yüklemesi BAD_REQUEST olarak günlüğe; sunucu yanıtı (uç, durum, kod) günlüğe", async (t) => {
  const api = {
    request: async () => ({ ok: true, data: {} }),
    upload: async () => ({ ok: false, error: { status: 404, code: "EVENT_NOT_FOUND", message: "Bu maçta böyle bir olay yok." } }),
  };
  const h = studioHarness({ api });
  t.after(() => h.studio.dispose());
  // Tekrar deposuna bir tekrar yaz.
  const dir = path.join(h.root, "userData", "replays", "r20261105120000-abcdef");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "program.mp4"), Buffer.alloc(100));
  fs.writeFileSync(path.join(dir, "replay.json"), JSON.stringify({ id: "r20261105120000-abcdef", createdAt: new Date().toISOString(), kind: "goal", angles: [{ angle: "program", file: "program.mp4" }] }));
  let res = await h.invoke("studio:uploadClip", { matchId: 7, replayId: "r20261105120000-abcdef" });
  assert.equal(res.error.code, "BAD_REQUEST");
  res = await h.invoke("studio:uploadClip", { matchId: 7, eventId: 999, replayId: "r20261105120000-abcdef" });
  assert.equal(res.error.code, "EVENT_NOT_FOUND");
  const [last, first] = (await h.invoke("studio:diagnostics")).uploads;
  assert.deepEqual([first.code, first.local, first.method], ["BAD_REQUEST", true, "IPC"]);
  assert.deepEqual([last.code, last.status, last.method, last.endpoint, last.eventId], ["EVENT_NOT_FOUND", 404, "POST", "/api/admin/live-streams/matches/7/clips", 999]);
});

test("IPC: studio:interview:stop — arayüz id'yi kaybetse de (undefined) süren röportaj durur", async (t) => {
  const h = studioHarness();
  t.after(() => h.studio.dispose());
  // Program motoru yokken: NOT_RECORDING; stop: NOT_FOUND (hata fırlatmaz).
  assert.equal((await h.invoke("studio:interview:start", { matchId: 3 })).error.code, "NOT_RECORDING");
  assert.equal((await h.invoke("studio:interview:stop", undefined)).error.code, "NOT_FOUND");
  assert.deepEqual(await h.invoke("studio:interview:status"), { active: [] });
});

test("putFile: imzalı başlıklar aynen, Content-Length tam, chunked yok; Spaces hatası kod olarak döner", async (t) => {
  const http = require("node:http");
  const seen = [];
  const server = http.createServer((req, res) => {
    let n = 0;
    req.on("data", (d) => { n += d.length; });
    req.on("end", () => {
      seen.push({ headers: req.headers, n });
      if (seen.length === 2) { res.writeHead(403); res.end("<Error><Code>AccessDenied</Code><Message>yok</Message></Error>"); return; }
      res.writeHead(200); res.end();
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  t.after(() => server.close());
  const file = path.join(tmp("put-"), "a.mp4");
  fs.writeFileSync(file, Buffer.alloc(70000, 3));
  const url = `http://127.0.0.1:${server.address().port}/b/k.mp4?X-Amz-Signature=x`;
  const headers = { "Content-Type": "video/mp4", "Cache-Control": "public, max-age=31536000, immutable", "x-amz-acl": "public-read", "Content-Length": "70000", Authorization: "Bearer gizli" };
  let r = await putFile(url, { file, size: 70000, headers });
  assert.equal(r.ok, true);
  assert.equal(seen[0].headers["content-length"], "70000");
  assert.equal(seen[0].headers["transfer-encoding"], undefined);
  assert.equal(seen[0].headers["x-amz-acl"], "public-read");
  assert.equal(seen[0].headers["cache-control"], "public, max-age=31536000, immutable");
  assert.equal(seen[0].headers.authorization, undefined, "jeton Spaces'e gitmez");
  assert.equal(seen[0].n, 70000);
  r = await putFile(url, { file, size: 70000, headers });
  assert.deepEqual([r.ok, r.status, r.code, r.message], [false, 403, "AccessDenied", "yok"]);
  await tick();
});

/* ------------------------- öne çıkan: ilk oluşturma ------------------------- */

const { createRenderer, headerOffset } = require("../studio/render");

test("öne çıkan ilk deneme: ilk yoklama başarısızsa yeniden yoklanır; başlık öncesi artık kesilir; başlıksız → EMPTY (NO_HEADER)", { skip: ffmpegBin ? false : "ffmpeg yok", timeout: 60000 }, async () => {
  const real = await ff.probeFfmpeg(ffmpegBin, { testEncoders: false });
  const root = tmp("render-first-");
  let calls = 0;
  // İlk açılış: yoklama zaman aşımına uğradı (available: false), ikincisi başarılı.
  const getFfmpeg = async () => { calls += 1; return calls === 1 ? { available: false, error: "ffmpeg çalıştırılamadı." } : { ...real, encoders: { libx264: true } }; };
  const renderer = createRenderer({ getFfmpeg, highlightsDir: path.join(root, "highlights"), tempRoot: path.join(root, "yok", "tmp") });
  const input = await new Promise((resolve, reject) => {
    const chunks = [];
    const p = spawn(ffmpegBin.path, ["-hide_banner", "-nostdin", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=30", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000", "-t", "2", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "libopus", "-f", "matroska", "-live", "1", "pipe:1"]);
    p.stdout.on("data", (d) => chunks.push(d));
    p.on("exit", (code) => (code === 0 ? resolve(Buffer.concat(chunks)) : reject(new Error(`ffmpeg ${code}`))));
  });
  const s = await renderer.start({ width: 640, height: 360, fps: 30, videoBitrateKbps: 1500, mimeType: "video/x-matroska;codecs=avc1,opus" });
  assert.equal(s.ok, true, JSON.stringify(s));
  assert.equal(calls, 2);
  // İlk parça: önceki kaydedicinin artığı + başlık (başlık kesilip alınır).
  const step = Math.ceil(input.length / 8);
  assert.equal(renderer.pushChunk(s.renderId, Buffer.concat([Buffer.from([9, 9, 9]), input.subarray(0, step)])), true);
  for (let i = 1; i < 8; i += 1) renderer.pushChunk(s.renderId, input.subarray(i * step, (i + 1) * step));
  const res = await renderer.finish(s.renderId);
  assert.equal(res.ok, true, JSON.stringify(res));
  assert.deepEqual([res.file.width, res.file.height], [640, 360]);

  // Başlık hiç gelmedi: neden açıkça bildirilir.
  const s2 = await renderer.start({ width: 640, height: 360, mimeType: "video/x-matroska;codecs=avc1,opus" });
  assert.equal(renderer.pushChunk(s2.renderId, input.subarray(step, 2 * step).map((b) => (b === 0x1a ? 0 : b))), false);
  const r2 = await renderer.finish(s2.renderId);
  assert.equal(r2.error.code, "EMPTY", "arayüzün yeniden deneme kodu korunur");
  assert.equal(r2.error.reason, "NO_HEADER");
  assert.equal(headerOffset(Buffer.from([1, 0x1a, 0x45, 0xdf, 0xa3])), 1);
});

test("yayın seçenekleri: keyframeSec (1–4, parça sınırını aşmaz), encoderPreference software → libx264, audioBitrateKbps", async () => {
  const o = ff.normalizeStreamOptions({ keyframeSec: 1, encoderPreference: "software", audioBitrateKbps: 192 });
  assert.deepEqual([o.keyframeSec, o.encoderPreference, o.audioBitrateKbps], [1, "software", 192]);
  assert.equal(ff.normalizeStreamOptions({}).keyframeSec, null);
  assert.equal(ff.normalizeStreamOptions({ keyframeSec: 9 }).keyframeSec, 4);
  const a1 = ff.buildStreamArgs({ ...ff.normalizeStreamOptions({ keyframeSec: 1, width: 1280, height: 720, fps: 30 }), encoder: "libx264" });
  assert.equal(at(a1, "-g"), "30");
  assert.equal(at(a1, "-force_key_frames"), "expr:gte(t,n_forced*1)");
  assert.equal(at(a1, "-b:a"), "160k");
  const a4 = ff.buildStreamArgs({ ...ff.normalizeStreamOptions({ keyframeSec: 4, fps: 30 }), encoder: "libx264" });
  assert.equal(at(a4, "-force_key_frames"), "expr:gte(t,n_forced*2)", "2 sn'lik parça halkası için");
  assert.equal(ff.pickEncoderFor({ videotoolbox: true, libx264: true }, "software"), "libx264");
  assert.equal(ff.pickEncoderFor({ videotoolbox: true, libx264: true }, "hardware", "darwin"), "h264_videotoolbox");
  const { engine, children } = engineSetup({ videotoolbox: true, libx264: true });
  const res = await engine.start({ url: null, encoderPreference: "software", audioBitrateKbps: 192, keyframeSec: 1 });
  assert.equal(res.encoder, "libx264");
  assert.equal(at(children[0].args, "-c:v"), "libx264");
  assert.equal(at(children[0].args, "-b:a"), "192k");
  assert.equal(at(children[0].args, "-force_key_frames"), "expr:gte(t,n_forced*1)");
  await engine.stop();
});

test("IPC: studio.info() → features.localRecordQuality", async (t) => {
  const h = studioHarness();
  t.after(() => h.studio.dispose());
  const info = await h.invoke("studio:info");
  assert.equal(info.features.localRecordQuality, true);
  assert.equal(typeof info.features.localRecordQualityHardware, "boolean");
});
