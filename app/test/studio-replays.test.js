"use strict";
// Yayın Stüdyosu: H.264 düzeyi, çok açılı tekrar penceresi, açılar, öne çıkanlar
// oturumu (sahte ffmpeg), öne çıkan yükleme (sahte api + yerel PUT sunucusu),
// elitlig-studio:// yol güvenliği ve silme kuralları.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { EventEmitter } = require("node:events");
const { computeH264Level, levelIdc } = require("../studio/h264level");
const ffargs = require("../studio/ffargs");
const { planReplay, usableItems, createReplayStore } = require("../studio/replays");
const { createAngles } = require("../studio/angles");
const { createRenderer, describeHighlight, pruneHighlights } = require("../studio/render");
const { uploadHighlight, deleteHighlight, putFile } = require("../studio/highlights");
const scheme = require("../studio/scheme");
const { killProcess } = require("../studio/proc");
const { fallbackEncoder } = require("../studio/engine");

const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));
const tick = () => new Promise((r) => setImmediate(r));

/* -------------------------------- h264level -------------------------------- */

test("H.264 düzeyi: 1080p30 → 4.1, 1080p60 → 4.2, üstü ≥ 5.1; taban 4.1", () => {
  assert.equal(computeH264Level(1920, 1080, 30), "4.1");
  assert.equal(computeH264Level(1920, 1080, 60), "4.2");
  assert.equal(computeH264Level(1920, 1080, 59.94), "4.2");
  assert.equal(computeH264Level(1920, 1080, 50), "4.2");
  assert.equal(computeH264Level(1280, 720, 30), "4.1");
  assert.equal(computeH264Level(1280, 720, 60), "4.1");
  assert.equal(computeH264Level(640, 360, 30), "4.1");
  assert.equal(computeH264Level(2560, 1440, 30), "5.1");
  assert.equal(computeH264Level(2560, 1440, 60), "5.1");
  assert.equal(computeH264Level(3840, 2160, 30), "5.1");
  assert.equal(computeH264Level(3840, 2160, 60), "5.2");
  // Bilinmeyen kare hızı → 60 varsayılır (güvenli taraf).
  assert.equal(computeH264Level(1920, 1080, null), "4.2");
  assert.equal(levelIdc("4.2"), 42);
  assert.equal(levelIdc("5.1"), 51);
});

test("concat / kapak / öne çıkan komutları: düzey bsf ve +faststart", () => {
  const c = ffargs.buildConcatLevelArgs("/w/l.txt", "/o/p.mp4", { width: 1920, height: 1080, fps: 60, durationSec: 10.04 });
  assert.equal(c[c.indexOf("-bsf:v") + 1], "h264_metadata=level=4.2");
  assert.equal(c[c.indexOf("-c") + 1], "copy");
  assert.equal(c[c.indexOf("-t") + 1], "10.040");
  assert.equal(c[c.indexOf("-movflags") + 1], "+faststart");
  assert.equal(c.at(-1), "/o/p.mp4");
  const p = ffargs.buildPosterArgs("/o/p.mp4", "/o/p.jpg", { durationMs: 10000 });
  assert.equal(p[p.indexOf("-ss") + 1], "4.000");
  assert.equal(p[p.indexOf("-frames:v") + 1], "1");
  assert.match(p[p.indexOf("-vf") + 1], /^scale=640:-2/);
  const r = ffargs.buildRenderArgs({ outFile: "/h/x.mp4", width: 1920, height: 1080, fps: 60, videoBitrateKbps: 8000, encoder: "libx264" });
  assert.equal(r[r.indexOf("-profile:v") + 1], "high");
  assert.equal(r[r.lastIndexOf("-bsf:v") + 1], "h264_metadata=level=4.2");
  assert.match(r[r.indexOf("-vf") + 1], /format=yuv420p$/);
  assert.equal(r[r.indexOf("-c:a") + 1], "aac");
  assert.equal(r[r.indexOf("-movflags") + 1], "+faststart");
  assert.equal(ffargs.inputFormatFor("video/webm;codecs=vp9,opus"), "matroska");
  assert.equal(ffargs.inputFormatFor("video/mp4;codecs=avc1"), "mp4");
});

test("açı komutu: RTMP yok, 1 sn parça + 1 sn anahtar kare, boyut 1080p ile sınırlı", () => {
  const o = ffargs.angleOptions({ width: 3840, height: 2160 });
  assert.deepEqual([o.width, o.height, o.fps], [1920, 1080, 30]);
  assert.deepEqual([ffargs.angleOptions({}).width, ffargs.angleOptions({}).height, ffargs.angleOptions({}).videoBitrateKbps], [1280, 720, 3000]);
  assert.deepEqual([ffargs.angleOptions({ width: 1080, height: 1920 }).width, ffargs.angleOptions({ width: 1080, height: 1920 }).height], [608, 1080]);
  const args = ffargs.buildAngleArgs({ ...ffargs.angleOptions({ width: 1280, height: 720 }), encoder: "libx264", segmentStart: 7, listFile: "list-2.csv" });
  const at = (f) => args[args.indexOf(f) + 1];
  assert.equal(at("-i"), "pipe:0");
  assert.equal(at("-segment_time"), "1");
  assert.equal(at("-force_key_frames"), "expr:gte(t,n_forced*1)");
  assert.equal(at("-g"), "30");
  assert.equal(args.filter((a) => a === "-g").length, 1);
  assert.equal(at("-segment_start_number"), "7");
  assert.equal(at("-segment_list"), "list-2.csv");
  assert.equal(at("-b:v"), "3000k");
  assert.equal(args.includes("tee"), false);
  assert.equal(args.some((a) => /rtmp/.test(a)), false);
  assert.equal(args.at(-1), "seg%05d.ts");
});

test("video bilgisi: kare hızı ffmpeg -i çıktısından", () => {
  const info = ffargs.parseVideoInfo("  Duration: 00:00:10.04, start: 1.4\n  Stream #0:0[0x100]: Video: h264 (High), yuv420p(progressive), 1280x720 [SAR 1:1 DAR 16:9], 30 fps, 30 tbr, 90k tbn\n  Stream #0:1: Audio: aac");
  assert.deepEqual([info.durationMs, info.width, info.height, info.fps, info.hasAudio], [10040, 1280, 720, 30, true]);
});

test("donanım kodlayıcı açılamazsa sıradaki; x264'ün yedeği yok", () => {
  assert.equal(fallbackEncoder("h264_videotoolbox", { videotoolbox: true, libx264: true }), "libx264");
  assert.equal(fallbackEncoder("libx264", { libx264: true }), null);
  assert.equal(fallbackEncoder(null, {}), null);
});

/* ------------------------------ tekrar penceresi ------------------------------ */

/** Duvar saatli parça listesi: başlangıç (ms), parça süresi (ms), adet. */
const segs = (startMs, durMs, count, extra = {}) => Array.from({ length: count }, (_, i) => ({
  index: i, file: `seg${String(i).padStart(5, "0")}.ts`, path: `/s/${i}.ts`, wallStart: startMs + i * durMs, wallEnd: startMs + (i + 1) * durMs, durationSec: durMs / 1000, encoder: "libx264", ...extra,
}));

test("tekrar penceresi: tüm açılar aynı duvar saati penceresi; program (2 sn) çapa, açılar (1 sn) ±0,5 sn", () => {
  const T0 = 1_000_000;
  const program = { angle: "program", name: "Program", complete: segs(T0, 2000, 10), growing: { path: "/s/g.ts", durationSec: 1.2, wallStart: T0 + 20000, wallEnd: T0 + 21200, encoder: "libx264" } };
  // Açı 1: 0,3 sn kaymış 1 sn'lik parçalar; açı 2: 0,7 sn kaymış.
  const cam1 = { angle: "cam1", name: "Kale arkası", complete: segs(T0 + 300, 1000, 20), growing: { path: "/c1/g.ts", durationSec: 0.6, wallStart: T0 + 20300, wallEnd: T0 + 20900, encoder: "libx264" } };
  const cam2 = { angle: "cam2", name: "Tribün", complete: segs(T0 + 700, 1000, 20), growing: null };
  const plan = planReplay({ sources: [cam1, program, cam2], seconds: 10 });
  assert.deepEqual(plan.plans.map((p) => p.angle), ["program", "cam1", "cam2"]);
  // Bitiş: canlı uçların en gerisi (cam2: T0+20700).
  assert.equal(plan.endWall, T0 + 20700);
  for (const p of plan.plans) assert.equal(p.endWall, T0 + 20700);
  // Program: hedef T0+10700 → [10000,12000) parçasının ilk yarısı → 10000 sınırı.
  const [pp, c1, c2] = plan.plans;
  assert.equal(pp.startWall, T0 + 10000);
  assert.equal(plan.startWall, T0 + 10000);
  assert.ok(Math.abs(c1.startWall - pp.startWall) <= 500, `cam1 ${c1.startWall - T0}`);
  assert.ok(Math.abs(c2.startWall - pp.startWall) <= 500, `cam2 ${c2.startWall - T0}`);
  const durations = plan.plans.map((p) => p.durationMs);
  assert.ok(Math.max(...durations) - Math.min(...durations) <= 1000, durations.join(","));
  assert.ok(durations.every((d) => d >= 9500 && d <= 11000), durations.join(","));
  // Büyüyen parça programda dahil, kronolojik.
  assert.equal(pp.items.at(-1).growing, true);
  assert.deepEqual(pp.items.map((i) => i.wallStart), [...pp.items.map((i) => i.wallStart)].sort((a, b) => a - b));
});

test("tekrar penceresi: takılmış açı pencereyi geri çekmez; verisi yoksa atlanır", () => {
  const T0 = 5_000_000;
  const program = { angle: "program", complete: segs(T0, 2000, 15) }; // uç T0+30000
  const stuck = { angle: "camX", complete: segs(T0, 1000, 12) }; // uç T0+12000 (18 sn geride)
  const empty = { angle: "camY", complete: [], growing: null };
  const plan = planReplay({ sources: [program, stuck, empty], seconds: 10 });
  assert.equal(plan.endWall, T0 + 30000);
  assert.deepEqual(plan.plans.map((p) => p.angle), ["program"]);
  assert.deepEqual(plan.skipped.map((s) => s.angle).sort(), ["camX", "camY"]);
  // Duvar saati yoksa (ilerleme gelmemiş) parça kullanılmaz.
  assert.equal(usableItems({ complete: [{ wallStart: null, wallEnd: null }] }).length, 0);
});

test("tekrar penceresi: kodlayıcı değişiminden öncesine geçilmez; tampon kısaysa ne varsa", () => {
  const T0 = 0;
  const complete = [...segs(T0, 2000, 3, { encoder: "h264_videotoolbox" }), ...segs(T0 + 6000, 2000, 2)];
  const items = usableItems({ complete });
  assert.equal(items.length, 2);
  assert.ok(items.every((i) => i.encoder === "libx264"));
  const plan = planReplay({ sources: [{ angle: "program", complete }], seconds: 10 });
  assert.equal(plan.plans[0].durationMs, 4000);
  assert.equal(planReplay({ sources: [{ angle: "program", complete: segs(0, 500, 1) }], seconds: 10 }).plans.length, 0);
});

/* ------------------------------- tekrar deposu ------------------------------- */

/** Sahte ffmpeg.run: concat / kapak çıktısını diske yazar, -i yoklamasına bilgi döner. */
function fakeRun({ width = 1280, height = 720, fps = 30, durationMs = 10000, failConcatFor = null } = {}) {
  const calls = [];
  const runImpl = async (_bin, args) => {
    calls.push(args);
    const out = args.at(-1);
    if (args.includes("concat")) {
      const list = fs.readFileSync(args[args.indexOf("-i") + 1], "utf8");
      if (failConcatFor && list.includes(failConcatFor)) return { ok: false, stderr: "concat hatası" };
      fs.writeFileSync(out, Buffer.alloc(5000, 1));
      return { ok: true, stderr: "" };
    }
    if (args.includes("-frames:v")) { fs.writeFileSync(out, Buffer.from([0xff, 0xd8, 0xff])); return { ok: true, stderr: "" }; }
    const d = new Date(durationMs).toISOString().slice(11, 22);
    return { ok: false, stderr: `  Duration: ${d}, start: 0\n  Stream #0:0: Video: h264 (High), yuv420p, ${width}x${height}, ${fps} fps, ${fps} tbr\n` };
  };
  return { calls, runImpl };
}

function sourcesOnDisk(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const mk = (angle, durMs, count, offset = 0) => {
    const complete = segs(1000 + offset, durMs, count).map((s) => {
      const file = path.join(dir, `${angle}-${s.index}.ts`);
      fs.writeFileSync(file, Buffer.alloc(100, s.index));
      return { ...s, path: file };
    });
    return { angle, name: angle === "program" ? "Program" : `Kamera ${angle}`, complete, growing: null };
  };
  return [mk("program", 2000, 8), mk("cam-1", 1000, 16, 200), mk("cam-2", 1000, 16, 600)];
}

test("tekrar kaydı: açı başına MP4 + kapak, replay.json; güncelle / listele / sil", async () => {
  const root = tmp("studio-replays-");
  const { calls, runImpl } = fakeRun({ width: 1920, height: 1080, fps: 60 });
  let t = Date.parse("2026-11-05T12:00:00Z");
  const store = createReplayStore({ replaysDir: path.join(root, "replays"), getFfmpegPath: () => "ffmpeg", runImpl, now: () => t });
  assert.equal((await store.save({ sources: [] })).error.code, "NOT_STREAMING");
  const res = await store.save({ sources: sourcesOnDisk(path.join(root, "seg")), seconds: 10, kind: "goal", eventId: "55", playerName: "Ali Yılmaz", minute: 37 });
  assert.equal(res.ok, true, JSON.stringify(res));
  const r = res.replay;
  assert.match(r.id, /^r20261105120000-[0-9a-f]{6}$/);
  assert.equal(r.kind, "goal");
  assert.equal(r.inSummary, true);
  assert.equal(r.eventId, 55);
  assert.equal(r.minute, 37);
  assert.equal(r.label, "Gol · Ali Yılmaz · 37'");
  assert.equal(r.uploaded, null);
  assert.deepEqual(r.angles.map((a) => [a.angle, a.file]), [["program", "program.mp4"], ["cam-1", "angle-1.mp4"], ["cam-2", "angle-2.mp4"]]);
  for (const a of r.angles) {
    assert.equal(fs.existsSync(a.path), true);
    assert.equal(a.url, `elitlig-studio://replays/${r.id}/${a.file}`);
    assert.equal(a.posterUrl, `elitlig-studio://replays/${r.id}/${a.file.replace(".mp4", ".jpg")}`);
    assert.deepEqual([a.width, a.height, a.durationMs, a.sizeBytes, a.level], [1920, 1080, 10000, 5000, "4.2"]);
  }
  // Tüm açılar aynı pencereden: -t süreleri birbirine yakın, düzey bsf'si var.
  const concats = calls.filter((c) => c.includes("concat"));
  assert.equal(concats.length, 3);
  const durs = concats.map((c) => Number(c[c.indexOf("-t") + 1]));
  assert.ok(Math.max(...durs) - Math.min(...durs) <= 1, durs.join(","));
  assert.ok(concats.every((c) => c.includes("h264_metadata=level=4.2") && c.includes("+faststart")));
  // Moment varsayılanı: özete girmez.
  t += 1000;
  const m = await store.save({ sources: sourcesOnDisk(path.join(root, "seg2")).slice(0, 1), kind: "moment", label: "Kurtarış" });
  assert.equal(m.replay.inSummary, false);
  assert.equal(m.replay.label, "Kurtarış");
  assert.deepEqual(store.list().map((x) => x.id), [m.replay.id, r.id]);
  const up = store.update(r.id, { label: "Harika gol", inSummary: false, minute: "38", playerName: "", uploaded: { clipId: 9 }, id: "hack", angles: [] });
  assert.equal(up.ok, true);
  assert.deepEqual([up.replay.label, up.replay.inSummary, up.replay.minute, up.replay.playerName, up.replay.uploaded.clipId, up.replay.id, up.replay.angles.length], ["Harika gol", false, 38, null, 9, r.id, 3]);
  assert.equal(store.get(r.id).label, "Harika gol");
  assert.equal(store.update("r00000000000000-000000", {}).error.code, "NOT_FOUND");
  assert.equal(store.update("../x", {}).error.code, "NOT_FOUND");
  assert.equal(store.remove("../../etc"), false);
  assert.equal(store.remove(m.replay.id), true);
  assert.deepEqual(store.list().map((x) => x.id), [r.id]);
  assert.deepEqual(fs.readdirSync(path.join(root, "replays")), [r.id]); // .work-* temizlendi
});

test("tekrar kaydı: bir açı yazılamazsa diğerleri kaydedilir (skipped)", async () => {
  const root = tmp("studio-replays-");
  const { runImpl } = fakeRun({ failConcatFor: "angle-1" });
  const store = createReplayStore({ replaysDir: path.join(root, "replays"), getFfmpegPath: () => "ffmpeg", runImpl });
  const res = await store.save({ sources: sourcesOnDisk(path.join(root, "seg")), seconds: 6 });
  assert.equal(res.ok, true);
  assert.deepEqual(res.replay.angles.map((a) => a.angle), ["program", "cam-2"]);
  assert.deepEqual(res.skipped.map((s) => [s.angle, s.reason]), [["cam-1", "WRITE_FAILED"]]);
});

test("tekrar silme: 7 günden eskiler açılışta; oturum sürerken hiçbiri", () => {
  const dir = tmp("studio-prune-r-");
  const t = Date.parse("2026-11-05T12:00:00Z");
  const store = createReplayStore({ replaysDir: dir, getFfmpegPath: () => "ffmpeg", now: () => t });
  const mk = (id, ageH) => {
    fs.mkdirSync(path.join(dir, id));
    fs.writeFileSync(path.join(dir, id, "replay.json"), JSON.stringify({ id, createdAt: new Date(t - ageH * 3600000).toISOString(), kind: "goal", angles: [] }));
  };
  mk("r20261020120000-aaaaaa", 24 * 8); // 8 gün
  mk("r20261101120000-bbbbbb", 24 * 4); // 4 gün: kalır (24 saat değil)
  mk("r20261105110000-cccccc", 1);
  fs.mkdirSync(path.join(dir, ".work-x"));
  fs.mkdirSync(path.join(dir, "baska-klasor"));
  assert.equal(store.prune({ isActive: () => true }), 0);
  assert.equal(fs.readdirSync(dir).length, 5);
  assert.equal(store.prune({ isActive: () => false }), 1);
  assert.deepEqual(fs.readdirSync(dir).sort(), ["baska-klasor", "r20261101120000-bbbbbb", "r20261105110000-cccccc"]);
  // Öne çıkanlar da 7 gün.
  const hd = tmp("studio-prune-h-");
  const write = (name, ageD) => { const f = path.join(hd, name); fs.writeFileSync(f, "x"); const w = new Date(t - ageD * 86400000); fs.utimesSync(f, w, w); };
  write("highlight-old.mp4", 8);
  write("highlight-old.jpg", 8);
  write("highlight-new.mp4", 2);
  write("diger.mp4", 30);
  assert.equal(pruneHighlights(hd, { now: t, isActive: () => true }), 0);
  assert.equal(pruneHighlights(hd, { now: t }), 1);
  assert.deepEqual(fs.readdirSync(hd).sort(), ["diger.mp4", "highlight-new.mp4"]);
});

test("tekrar yükleme: açı dosyası + 'poster' alanı (image/jpeg); eski { name } klipleri ayrı", async () => {
  const root = tmp("studio-replays-up-");
  const { runImpl } = fakeRun();
  const store = createReplayStore({ replaysDir: path.join(root, "replays"), getFfmpegPath: () => "ffmpeg", runImpl, sleep: async () => {} });
  const { replay } = await store.save({ sources: sourcesOnDisk(path.join(root, "seg")), seconds: 6, eventId: 100 });
  const calls = [];
  const api = { upload: async (pathname, mp, opts) => { calls.push({ pathname, mp, opts }); return calls.length === 1 ? { ok: false, offline: true } : { ok: true, data: { id: 5, url: "https://cdn/x.mp4" } }; } };
  const res = await store.upload(api, { matchId: 7, replayId: replay.id, angle: "cam-2" });
  assert.equal(res.ok, true);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].pathname, "/api/admin/live-streams/matches/7/clips?event_id=100");
  const body = calls[1].mp.body.toString("latin1");
  const order = ["event_id", "duration_ms", "width", "height", "file", "poster"].map((f) => body.indexOf(`name="${f}"`));
  assert.ok(order.every((i) => i >= 0));
  assert.deepEqual([...order].sort((a, b) => a - b), order);
  assert.match(body, /name="poster"; filename="gol-7-100\.jpg"\r\nContent-Type: image\/jpeg\r\n\r\n\xff\xd8\xff\r\n/);
  assert.match(body, /name="width"\r\n\r\n1280\r\n/);
  assert.deepEqual([store.get(replay.id).uploaded.angle, store.get(replay.id).uploaded.clipId], ["cam-2", 5]);
  assert.equal((await store.upload(api, { matchId: 7, replayId: replay.id, angle: "yok" })).error.code, "BAD_ANGLE");
  assert.equal((await store.upload(api, { matchId: 0, replayId: replay.id })).error.code, "BAD_REQUEST");
  assert.equal((await store.upload(api, { matchId: 7, eventId: 1, replayId: "r20200101000000-abcdef" })).error.code, "NOT_FOUND");
});

/* -------------------------------- şema yolları -------------------------------- */

test("elitlig-studio:// : tekrar / öne çıkan / klip dışına çıkılamaz", async () => {
  const root = tmp("studio-scheme-");
  const roots = { clips: path.join(root, "clips"), replays: path.join(root, "replays"), highlights: path.join(root, "highlights") };
  const id = "r20261105120000-abcdef";
  fs.mkdirSync(path.join(roots.replays, id), { recursive: true });
  fs.mkdirSync(roots.highlights, { recursive: true });
  fs.mkdirSync(roots.clips, { recursive: true });
  fs.writeFileSync(path.join(roots.replays, id, "program.mp4"), Buffer.alloc(100, 7));
  fs.writeFileSync(path.join(roots.replays, id, "program.jpg"), Buffer.from([0xff, 0xd8]));
  fs.writeFileSync(path.join(roots.replays, id, "replay.json"), "{}");
  fs.writeFileSync(path.join(roots.highlights, "highlight-20261105-1.mp4"), Buffer.alloc(10));
  fs.writeFileSync(path.join(root, "secret.mp4"), "gizli");
  const R = (u) => scheme.resolveStudioUrl(roots, u);
  assert.equal(R(`elitlig-studio://replays/${id}/program.mp4`), path.join(roots.replays, id, "program.mp4"));
  assert.equal(R(`elitlig-studio://highlights/highlight-20261105-1.mp4`), path.join(roots.highlights, "highlight-20261105-1.mp4"));
  for (const bad of [
    `elitlig-studio://replays/${id}/replay.json`,
    `elitlig-studio://replays/${id}/..%2F..%2Fsecret.mp4`,
    `elitlig-studio://replays/..%2F${id}/program.mp4`,
    "elitlig-studio://replays/../secret.mp4",
    `elitlig-studio://replays/${id}/%2e%2e/program.mp4`,
    `elitlig-studio://replays/${id}`,
    `elitlig-studio://replays/${id}/program.mp4/x`,
    "elitlig-studio://highlights/..%2Fsecret.mp4",
    "elitlig-studio://highlights/highlight-..%5C..%5Csecret.mp4",
    "elitlig-studio://highlights/secret.mp4",
    "elitlig-studio://other/highlight-1.mp4",
    "elitlig-media://highlights/highlight-20261105-1.mp4",
    "elitlig-studio://replays/r20261105120000-ABCDEF/program.mp4",
  ]) assert.equal(R(bad), null, bad);
  assert.equal(scheme.safeReplayPath(roots.replays, id, "angle-1.mp4"), path.join(roots.replays, id, "angle-1.mp4"));
  assert.equal(scheme.safeJoin(roots.replays, ".."), null);
  const req = (url, range) => ({ url, method: "GET", headers: new Headers(range ? { Range: range } : {}) });
  const ok = scheme.serveStudio(roots, req(`elitlig-studio://replays/${id}/program.mp4`, "bytes=10-19"));
  assert.equal(ok.status, 206);
  assert.equal(ok.headers.get("content-type"), "video/mp4");
  assert.equal((await ok.arrayBuffer()).byteLength, 10);
  assert.equal(scheme.serveStudio(roots, req(`elitlig-studio://replays/${id}/program.jpg`)).headers.get("content-type"), "image/jpeg");
  assert.equal(scheme.serveStudio(roots, req(`elitlig-studio://replays/${id}/replay.json`)).status, 404);
  assert.equal(scheme.serveStudio(roots, req("elitlig-studio://highlights/..%2Fsecret.mp4")).status, 404);
});

/* ---------------------------------- açılar ---------------------------------- */

/** Sahte kaydedici: motorun açılar için kullandığı arayüz. */
function fakeRecorderFactory() {
  const made = [];
  const factory = (opts) => {
    const events = new EventEmitter();
    let st = { state: "idle" };
    let active = false;
    const rec = {
      opts, events, chunks: [], startedWith: null,
      async start(o) { rec.startedWith = o; active = true; st = { state: "starting", encoder: "libx264" }; events.emit("status", st); return { ok: !opts.failStart, sessionId: "s", encoder: "libx264", error: opts.failStart ? { code: "NO_FFMPEG", message: "yok" } : undefined }; },
      pushChunk(d) { rec.chunks.push(d); return active; },
      async stop() { active = false; st = { state: "stopped" }; events.emit("status", st); return true; },
      dispose() { active = false; },
      status: () => st,
      active: () => active,
      bufferedMs: () => 4000,
      encoder: () => (active ? "libx264" : null),
      clipSources: () => (active ? { complete: [], growing: null, segmentSeconds: 1 } : null),
      fail() { active = false; st = { state: "failed", message: "x" }; events.emit("status", st); },
    };
    made.push(rec);
    return rec;
  };
  return { made, factory };
}

test("açılar: eşitleme (ekle / koru / durdur), parça yönlendirme, durum ve restartRecorder", async () => {
  const { made, factory } = fakeRecorderFactory();
  const angles = createAngles({ getFfmpeg: async () => ({}), tempRoot: tmp("studio-angles-"), recorderFactory: factory });
  const statuses = [];
  const restarts = [];
  angles.events.on("status", (s) => statuses.push(s));
  angles.events.on("restartRecorder", (p) => restarts.push(p));
  const a = await angles.start({ sources: [{ id: "cam-1", name: "Kale arkası", width: 1920, height: 1080 }, { id: "cam-2", name: "Tribün" }, { id: "../bad" }, { id: "program" }] });
  assert.deepEqual(a, { ok: true, started: ["cam-1", "cam-2"] });
  assert.equal(made.length, 2);
  assert.equal(made[0].opts.segmentSeconds, 1);
  assert.equal(made[0].opts.keepSegments, 64);
  assert.equal(made[0].opts.buildArgs, ffargs.buildAngleArgs);
  assert.equal(made[0].opts.normalizeOptions({ url: "rtmp://x", width: 5 }).url, null);
  assert.deepEqual([made[0].startedWith.width, made[0].startedWith.height], [1920, 1080]);
  assert.match(made[0].opts.tempRoot, /a-[0-9a-f]{12}$/);
  assert.equal(angles.pushChunk("cam-2", Buffer.from([1])), true);
  assert.equal(angles.pushChunk("yok", Buffer.from([1])), false);
  assert.equal(made[1].chunks.length, 1);
  await tick();
  assert.deepEqual(statuses.at(-1).map((s) => [s.id, s.name, s.state, s.bufferedMs, s.encoder]), [["cam-1", "Kale arkası", "starting", 4000, "libx264"], ["cam-2", "Tribün", "starting", 4000, "libx264"]]);
  made[0].events.emit("restartRecorder", { sessionId: "s", run: 2, reason: "STALLED" });
  assert.deepEqual(restarts, [{ sourceId: "cam-1", reason: "STALLED" }]);
  // İdempotent: cam-1 korunur, cam-2 durur, cam-3 eklenir.
  const b = await angles.start({ sources: [{ id: "cam-1" }, { id: "cam-3", name: "Yan" }] });
  assert.deepEqual(b.started, ["cam-1", "cam-3"]);
  assert.equal(made.length, 3);
  assert.equal(made[1].active(), false);
  assert.deepEqual(angles.status().map((s) => s.id), ["cam-1", "cam-3"]);
  assert.equal(angles.status()[0].name, "Kale arkası");
  // Başarısız açı yeniden başlatılır.
  made[0].fail();
  await angles.start({ sources: [{ id: "cam-1" }, { id: "cam-3" }] });
  assert.equal(made.length, 4);
  assert.deepEqual(angles.clipSources().map((s) => s.angle), ["cam-3", "cam-1"]);
  await angles.stop("cam-3");
  assert.deepEqual(angles.status().map((s) => s.id), ["cam-1"]);
  await angles.stop();
  assert.deepEqual(angles.status(), []);
  assert.equal(angles.active(), false);
});

test("açılar gerçek motorla (sahte spawn): kayıt yalnız, 1 sn parça; başlık kapısı", async () => {
  const children = [];
  const spawnImpl = (file, args, options) => {
    const child = new EventEmitter();
    Object.assign(child, { args, options, written: [] });
    child.stdout = Object.assign(new EventEmitter(), { setEncoding() {} });
    child.stderr = Object.assign(new EventEmitter(), { setEncoding() {} });
    child.stdin = Object.assign(new EventEmitter(), { writable: true, destroyed: false, writableLength: 0, write(b) { child.written.push(b); return true; }, end() { setImmediate(() => child.emit("exit", 0, null)); }, destroy() {} });
    child.kill = () => setImmediate(() => child.emit("exit", null, "SIGKILL"));
    children.push(child);
    return child;
  };
  const angles = createAngles({ getFfmpeg: async () => ({ available: true, path: "/bin/ffmpeg", encoders: { libx264: true } }), tempRoot: tmp("studio-angles-real-"), spawnImpl });
  const res = await angles.start({ sources: [{ id: "cam-1", name: "Kamera" }] });
  assert.equal(res.ok, true);
  assert.equal(children.length, 1);
  const args = children[0].args;
  assert.equal(args[args.indexOf("-segment_time") + 1], "1");
  assert.equal(args.includes("tee"), false);
  assert.equal(angles.pushChunk("cam-1", Buffer.from([1, 2, 3, 4])), false);
  assert.equal(angles.pushChunk("cam-1", Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 1])), true);
  children[0].stdout.emit("data", "out_time_us=1500000\nprogress=continue\n");
  await tick();
  assert.equal(angles.status()[0].state, "recording");
  await angles.stop();
  assert.equal(angles.active(), false);
});

/* ------------------------------ öne çıkanlar oturumu ------------------------------ */

function fakeFfmpegSpawn({ failLive = false } = {}) {
  const children = [];
  const spawnImpl = (file, args) => {
    const child = new EventEmitter();
    Object.assign(child, { args, written: [], pid: 4242 });
    child.stdout = Object.assign(new EventEmitter(), { setEncoding() {} });
    child.stderr = Object.assign(new EventEmitter(), { setEncoding() {} });
    const out = args.at(-1);
    const live = args[args.indexOf("-i") + 1] === "pipe:0";
    child.stdin = Object.assign(new EventEmitter(), {
      writable: true, destroyed: false, writableLength: 0,
      write(b) { child.written.push(b); return true; },
      end() {
        setImmediate(() => {
          if (live && failLive) { child.stderr.emit("data", "Error while opening encoder\n"); child.emit("exit", 1, null); return; }
          child.stdout.emit("data", "out_time_us=3000000\nspeed=1.0x\nprogress=end\n");
          fs.writeFileSync(out, Buffer.alloc(2048, 3));
          child.emit("exit", 0, null);
        });
      },
      destroy() { this.destroyed = true; },
    });
    child.kill = () => { child.killed = true; setImmediate(() => child.emit("exit", null, "SIGKILL")); };
    children.push(child);
    return child;
  };
  return { children, spawnImpl };
}

const HEADER = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 9, 9]);

function setupRenderer(opts = {}) {
  const root = tmp("studio-render-");
  const { children, spawnImpl } = fakeFfmpegSpawn(opts);
  const { runImpl } = fakeRun({ width: 1920, height: 1080, fps: 30, durationMs: 3000 });
  const renderer = createRenderer({
    getFfmpeg: async () => ({ available: true, path: "/bin/ffmpeg", encoders: { videotoolbox: true, libx264: true } }),
    highlightsDir: path.join(root, "highlights"), tempRoot: path.join(root, "tmp"), spawnImpl, runImpl, platform: "darwin",
  });
  const progress = [];
  renderer.events.on("progress", (p) => progress.push(p));
  return { root, renderer, children, progress };
}

test("öne çıkan oturumu: başlık kapısı, gerçek zamanlı kodlama, bitiş → MP4 + kapak + bilgi", async () => {
  const { root, renderer, children, progress } = setupRenderer();
  const s = await renderer.start({ width: 1920, height: 1080, fps: 30, videoBitrateKbps: 8000, mimeType: "video/webm;codecs=vp9,opus" });
  assert.equal(s.ok, true);
  assert.match(s.renderId, /^h\d{14}-[0-9a-f]{6}$/);
  assert.equal(renderer.active(), true);
  const args = children[0].args;
  assert.equal(args[args.indexOf("-i") + 1], "pipe:0");
  assert.equal(args[args.indexOf("-f") + 1], "matroska");
  assert.equal(args[args.indexOf("-c:v") + 1], "h264_videotoolbox");
  assert.ok(args.includes("h264_metadata=level=4.1"));
  assert.equal(renderer.pushChunk(s.renderId, Buffer.from([1, 2])), false);
  assert.equal(renderer.pushChunk(s.renderId, HEADER), true);
  assert.equal(renderer.pushChunk(s.renderId, new Uint8Array([5, 6, 7])), true);
  assert.equal(renderer.pushChunk("yok", HEADER), false);
  assert.equal(children[0].written.length, 2);
  const res = await renderer.finish(s.renderId);
  assert.equal(res.ok, true, JSON.stringify(res));
  const f = res.file;
  assert.match(f.name, /^highlight-\d{8}-\d{6}\.mp4$/);
  assert.equal(f.url, `elitlig-studio://highlights/${f.name}`);
  assert.equal(f.posterUrl, `elitlig-studio://highlights/${f.name.replace(".mp4", ".jpg")}`);
  assert.deepEqual([f.durationMs, f.width, f.height, f.sizeBytes, f.level], [3000, 1920, 1080, 2048, "4.1"]);
  assert.equal(children.length, 1);
  assert.deepEqual(progress.at(-1), { renderId: s.renderId, outTimeMs: 3000, speed: 1, phase: "live" });
  assert.equal(renderer.active(), false);
  assert.deepEqual(fs.readdirSync(path.join(root, "tmp")), []); // ham kopya silindi
  assert.equal((await renderer.finish(s.renderId)).error.code, "NOT_FOUND");
  assert.deepEqual(describeHighlight(path.join(root, "highlights"), f.name).name, f.name);
});

test("öne çıkan oturumu: gerçek zamanlı kodlama başarısızsa ham kopyadan x264 ile", async () => {
  const { renderer, children, progress } = setupRenderer({ failLive: true });
  const s = await renderer.start({ width: 1280, height: 720, fps: 30, mimeType: "video/webm" });
  renderer.pushChunk(s.renderId, HEADER);
  const res = await renderer.finish(s.renderId);
  assert.equal(res.ok, true, JSON.stringify(res));
  assert.equal(children.length, 2);
  const args = children[1].args;
  assert.match(args[args.indexOf("-i") + 1], /render-h.*\.webm$/);
  assert.equal(args[args.indexOf("-c:v") + 1], "libx264");
  assert.equal(progress.at(-1).phase, "transcode");
});

test("öne çıkan oturumu: iptal süreci öldürür, dosyaları siler; boş oturum hata", async () => {
  const { root, renderer, children } = setupRenderer();
  const s = await renderer.start({});
  renderer.pushChunk(s.renderId, HEADER);
  assert.equal(renderer.cancel(s.renderId), true);
  assert.equal(children[0].killed, true);
  // Ham dosya akışının açılışı / kapanışı eşzamansız: temizlik bitene kadar bekle (en çok 2 sn).
  for (let i = 0; i < 100 && fs.readdirSync(path.join(root, "tmp")).length; i += 1) await new Promise((r) => setTimeout(r, 20));
  assert.equal(renderer.active(), false);
  assert.deepEqual(fs.readdirSync(path.join(root, "tmp")), []);
  assert.deepEqual(fs.readdirSync(path.join(root, "highlights")), []);
  const e = await renderer.start({});
  assert.equal((await renderer.finish(e.renderId)).error.code, "EMPTY");
  const none = createRenderer({ getFfmpeg: async () => ({ available: false }), highlightsDir: root, tempRoot: root });
  assert.equal((await none.start({})).error.code, "NO_FFMPEG");
});

/* ------------------------------- öne çıkan yükleme ------------------------------- */

function putServer(handler) {
  return new Promise((resolve) => {
    const received = [];
    const server = http.createServer((req, res) => {
      const chunks = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        received.push({ method: req.method, url: req.url, headers: req.headers, body: Buffer.concat(chunks) });
        handler(req, res);
      });
    });
    server.listen(0, "127.0.0.1", () => resolve({ server, received, base: `http://127.0.0.1:${server.address().port}` }));
  });
}

function highlightOnDisk() {
  const dir = tmp("studio-hl-");
  fs.writeFileSync(path.join(dir, "highlight-20261105-120000.mp4"), Buffer.alloc(300000, 4));
  fs.writeFileSync(path.join(dir, "highlight-20261105-120000.jpg"), Buffer.from([0xff, 0xd8, 0xff, 0xe0]));
  fs.writeFileSync(path.join(dir, "highlight-20261105-120000.json"), JSON.stringify({ durationMs: 45000, width: 1920, height: 1080 }));
  return dir;
}

test("öne çıkan yükleme: imzalı adres → PUT (akış, yalnız dönen başlıklar) → kapak → bağla", async () => {
  const { server, received, base } = await putServer((_req, res) => { res.writeHead(200); res.end(); });
  const dir = highlightOnDisk();
  const requests = [];
  const api = {
    request: async (r) => {
      requests.push(r);
      if (r.path.endsWith("/upload-url")) return { ok: true, data: { upload_url: `${base}/spaces/v.mp4?X-Amz-Signature=abc`, headers: { "Content-Type": "video/mp4", "x-amz-acl": "public-read" }, key: "highlights/7/v.mp4", poster_upload_url: `${base}/spaces/p.jpg?sig=1`, poster_key: "highlights/7/p.jpg" } };
      return { ok: true, data: { highlight: { id: 3, url: "https://cdn/v.mp4" } } };
    },
  };
  const events = [];
  try {
    const res = await uploadHighlight(api, { highlightsDir: dir, matchId: 7, name: "highlight-20261105-120000.mp4" }, { emitProgress: (p) => events.push(p) });
    assert.equal(res.ok, true, JSON.stringify(res));
    assert.deepEqual(res.highlight, { id: 3, url: "https://cdn/v.mp4" });
    assert.deepEqual(requests[0], { method: "POST", path: "/api/admin/live-streams/matches/7/highlight/upload-url", body: { size_bytes: 300000, content_type: "video/mp4", duration_ms: 45000, width: 1920, height: 1080 }, cache: false, queue: false });
    assert.deepEqual(requests[1].body, { key: "highlights/7/v.mp4", poster_key: "highlights/7/p.jpg", duration_ms: 45000, width: 1920, height: 1080, size_bytes: 300000 });
    assert.equal(requests[1].path, "/api/admin/live-streams/matches/7/highlight");
    assert.equal(received.length, 2);
    const [v, p] = received;
    assert.equal(v.method, "PUT");
    assert.equal(v.url, "/spaces/v.mp4?X-Amz-Signature=abc");
    assert.equal(v.headers["content-length"], "300000");
    assert.equal(v.headers["content-type"], "video/mp4");
    assert.equal(v.headers["x-amz-acl"], "public-read");
    assert.equal(v.headers.authorization, undefined);
    assert.equal(v.body.length, 300000);
    assert.equal(p.headers["content-type"], "image/jpeg");
    assert.equal(p.body.length, 4);
    assert.ok(events.length >= 3);
    assert.deepEqual(events[0], { kind: "highlight", matchId: 7, loaded: 0, total: 300004 });
    assert.deepEqual(events.at(-1), { kind: "highlight", matchId: 7, loaded: 300004, total: 300004 });
    assert.ok(events.every((e, i) => i === 0 || e.loaded >= events[i - 1].loaded));
    assert.equal(describeHighlight(dir, "highlight-20261105-120000.mp4").uploaded.id, 3);
  } finally {
    server.close();
  }
});

test("öne çıkan yükleme: hatalar Türkçe; PUT 403 → PUT_FAILED; ağ hatası bir kez yeniden denenir", async () => {
  const { server, base } = await putServer((_req, res) => { res.writeHead(403); res.end("<Error>SignatureDoesNotMatch</Error>"); });
  const dir = highlightOnDisk();
  const okUrl = { ok: true, data: { data: { upload_url: `${base}/v`, key: "k" } } };
  try {
    const api = { request: async () => okUrl };
    const r403 = await uploadHighlight(api, { highlightsDir: dir, matchId: 7, name: "highlight-20261105-120000.mp4" });
    assert.equal(r403.error.code, "PUT_FAILED");
    assert.match(r403.error.message, /yüklenemedi.*403/);
    let puts = 0;
    const rNet = await uploadHighlight(api, { highlightsDir: dir, matchId: 7, name: "highlight-20261105-120000.mp4" }, { putImpl: async () => { puts += 1; return { ok: false, network: true }; }, sleep: async () => {} });
    assert.equal(puts, 2);
    assert.equal(rNet.error.code, "NETWORK");
    assert.match(rNet.error.message, /Bağlantı yok/);
    assert.equal((await uploadHighlight({ request: async () => ({ ok: false, error: { status: 403, message: "Yetkiniz yok." } }) }, { highlightsDir: dir, matchId: 7, name: "highlight-20261105-120000.mp4" })).error.message, "Yükleme adresi alınamadı. Yetkiniz yok.");
    assert.equal((await uploadHighlight(api, { highlightsDir: dir, matchId: "x", name: "highlight-20261105-120000.mp4" })).error.code, "BAD_REQUEST");
    assert.equal((await uploadHighlight(api, { highlightsDir: dir, matchId: 7, name: "../highlight-x.mp4" })).error.code, "NOT_FOUND");
    let seen = null;
    const del = await deleteHighlight({ request: async (r) => { seen = r; return { ok: true, data: { ok: true } }; } }, { matchId: 7 });
    assert.equal(del.ok, true);
    assert.deepEqual([seen.method, seen.path], ["DELETE", "/api/admin/live-streams/matches/7/highlight"]);
    assert.match((await deleteHighlight({ request: async () => ({ ok: false, offline: true }) }, { matchId: 7 })).error.message, /Bağlantı yok/);
  } finally {
    server.close();
  }
  // Sunucu kapalı: ağ hatası.
  const r = await putFile(`${base}/v`, { file: path.join(dir, "highlight-20261105-120000.jpg"), size: 4 });
  assert.equal(r.network, true);
});

/* ---------------------------------- süreçler ---------------------------------- */

test("süreç sonlandırma: macOS SIGKILL, Windows kill() + taskkill /T /F", () => {
  const killed = [];
  const spawned = [];
  const child = { pid: 99, kill: (sig) => killed.push(sig ?? "default") };
  killProcess(child, { platform: "darwin", spawnImpl: () => { throw new Error("çağrılmamalı"); } });
  assert.deepEqual(killed, ["SIGKILL"]);
  killProcess(child, { platform: "win32", spawnImpl: (file, args, opts) => { spawned.push([file, args, opts.windowsHide]); return new EventEmitter(); } });
  assert.deepEqual(killed, ["SIGKILL", "default"]);
  assert.deepEqual(spawned, [["taskkill", ["/pid", "99", "/T", "/F"], true]]);
});
