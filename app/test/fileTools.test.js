"use strict";
// Dosya Araçları: çıktı adları, ffmpeg argüman kurucuları, metin işleri, iş kuyruğu,
// PDF (pdf-lib yüklüyse) ve gerçek ffmpeg ile küçük bir dönüştürme (ffmpeg yoksa atlanır).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
// Yol beklentileri işletim sisteminin ayırıcısıyla (Windows CI'da "\\").
const N = (p) => path.normalize(p);

const paths = require("../fileTools/paths");
const ffargs = require("../fileTools/ffargs");
const text = require("../fileTools/text");
const formats = require("../fileTools/formats");
const native = require("../fileTools/native");
const { createJobs, cleanError } = require("../fileTools/jobs");
const { snapToEdge, expandedBounds } = require("../fileTools/float");
const ff = require("../studio/ffmpeg");

const tmp = (p = "ft-") => fs.mkdtempSync(path.join(os.tmpdir(), p));

/* --------------------------------- adlar --------------------------------- */

test("sanitizeName: geçersiz karakterler, ayrılmış Windows adları, boş ad", () => {
  assert.equal(paths.sanitizeName('a/b\\c:d*e?"f<g>h|i'), "a-b-c-d-e--f-g-h-i");
  assert.equal(paths.sanitizeName("  ..gizli.  "), "gizli");
  assert.equal(paths.sanitizeName("CON"), "CON-");
  assert.equal(paths.sanitizeName(""), "dosya");
  assert.equal(paths.sanitizeName("x".repeat(300)).length, 160);
  assert.equal(paths.sanitizeName("Ekran Resmi 2026-11-10 14.22.01"), "Ekran Resmi 2026-11-10 14.22.01");
});

test("uniquePath: çakışmada (2), (3)…; aynı iş içindeki ayrılmış adlar da sayılır", () => {
  const existing = new Set([N("/o/foto.jpg"), N("/o/foto (2).jpg")]);
  const exists = (p) => existing.has(p);
  assert.equal(paths.uniquePath("/o", "foto", "jpg", { exists }), N("/o/foto (3).jpg"));
  const taken = new Set();
  assert.equal(paths.uniquePath("/o", "yeni", "png", { exists, taken }), N("/o/yeni.png"));
  assert.equal(paths.uniquePath("/o", "yeni", "png", { exists, taken }), N("/o/yeni (2).png"));
  assert.equal(paths.uniquePath("/o", "klasor", "", { exists }), N("/o/klasor"));
});

test("outputPathFor: ek ve uzantı; orijinalin üstüne yazılmaz", () => {
  const exists = (p) => p === N("/d/video.mp4");
  assert.equal(paths.outputPathFor({ input: "/d/video.mp4", suffix: "kirpildi", exists }), N("/d/video-kirpildi.mp4"));
  assert.equal(paths.outputPathFor({ input: "/d/video.mp4", exists }), N("/d/video (2).mp4"));
  assert.equal(paths.outputPathFor({ input: "/d/foto.heic", dir: "/out", ext: "jpg", exists }), N("/out/foto.jpg"));
});

test("validateOutput: göreli yol, girdiyle aynı yol (büyük/küçük harf), var olan dosya", () => {
  assert.match(paths.validateOutput("rel/out.mp4", { exists: () => false }), /Geçersiz/);
  assert.match(paths.validateOutput("/a/B.MP4", { inputs: ["/a/b.mp4"], exists: () => false, platform: "darwin" }), /orijinal/);
  assert.equal(paths.validateOutput("/a/B.MP4", { inputs: ["/a/b.mp4"], exists: () => false, platform: "linux" }), null);
  assert.match(paths.validateOutput("/a/c.mp4", { exists: () => true }), /zaten var/);
  assert.equal(paths.validateOutput("/a/c.mp4", { inputs: ["/a/b.mp4"], exists: () => false }), null);
});

/* ------------------------------ ffmpeg argümanları ------------------------------ */

const probeV = { durationMs: 10000, width: 1920, height: 1080, hasAudio: true };

test("argümanlar her zaman dizi; kabuk yok; -n (üstüne yazmaz) ve -progress", () => {
  const input = "/tmp/a b'$(rm -rf).mov";
  const { args, expectedMs } = ffargs.buildMediaArgs({ op: "convert", input, output: "/o/x.mp4", kind: "video", probe: probeV, outExt: "mp4", encoders: { libx264: true } });
  assert.ok(Array.isArray(args));
  assert.equal(args[args.indexOf("-i") + 1], input, "yol tek argüman olarak geçer");
  assert.ok(args.includes("-n"));
  assert.deepEqual(args.slice(args.indexOf("-progress"), args.indexOf("-progress") + 2), ["-progress", "pipe:1"]);
  assert.ok(args.includes("libx264") && args.includes("+faststart"));
  assert.equal(args[args.length - 1], "/o/x.mp4");
  assert.equal(expectedMs, 10000);
});

test("video → ses dönüştürme: -vn ve doğru kodlayıcı; webm VP9 + Opus", () => {
  const mp3 = ffargs.buildMediaArgs({ op: "convert", input: "/i.mp4", output: "/o.mp3", probe: probeV, outExt: "mp3" }).args;
  assert.ok(mp3.includes("-vn") && mp3.includes("libmp3lame"));
  const webm = ffargs.buildMediaArgs({ op: "convert", input: "/i.mp4", output: "/o.webm", probe: probeV, outExt: "webm" }).args;
  assert.ok(webm.includes("libvpx-vp9") && webm.includes("libopus"));
  assert.throws(() => ffargs.buildMediaArgs({ op: "convert", kind: "audio", input: "/i.mp3", output: "/o.mp4", probe: {}, outExt: "mp4" }), /videoya/);
});

test("libx264 yoksa platform donanım kodlayıcısı (bit hızıyla)", () => {
  assert.equal(ffargs.pickVideoEncoder({ h264_videotoolbox: true }, "darwin"), "h264_videotoolbox");
  assert.equal(ffargs.pickVideoEncoder({ h264_mf: true }, "win32"), "h264_mf");
  assert.equal(ffargs.pickVideoEncoder({ libx264: true, h264_videotoolbox: true }, "darwin"), "libx264");
  const a = ffargs.videoCodecArgs("h264_videotoolbox", { crf: 23, height: 1080 });
  assert.deepEqual(a.slice(0, 4), ["-c:v", "h264_videotoolbox", "-b:v", "6000k"]);
});

test("kırpma: -ss / -to ve beklenen süre; hızlı kesim -c copy", () => {
  const r = ffargs.buildMediaArgs({ op: "trim", input: "/i.mp4", output: "/o.mp4", probe: probeV, outExt: "mp4", options: { startMs: 1500, endMs: 4250 } });
  assert.deepEqual(r.args.slice(r.args.indexOf("-ss"), r.args.indexOf("-ss") + 4), ["-ss", "1.500", "-to", "4.250"]);
  assert.equal(r.expectedMs, 2750);
  const c = ffargs.buildMediaArgs({ op: "trim", input: "/i.mp4", output: "/o.mp4", probe: probeV, outExt: "mp4", options: { startMs: 0, endMs: 2000, copy: true } });
  assert.ok(c.args.includes("copy") && !c.args.includes("libx264"));
});

test("sıkıştırma: hedef boyuttan bit hızı; ön ayarda yükseklik sınırı", () => {
  const r = ffargs.buildMediaArgs({ op: "compress", input: "/i.mp4", output: "/o.mp4", probe: { ...probeV, durationMs: 60000 }, outExt: "mp4", options: { targetMB: 10 }, encoders: { libx264: true } });
  const bv = r.args[r.args.indexOf("-b:v") + 1];
  // 10 MB / 60 sn ≈ 1398 kbps toplam; ses 128 → video ≈ 1214k
  assert.match(bv, /^1[12]\d\dk$/);
  const p = ffargs.buildMediaArgs({ op: "compress", input: "/i.mp4", output: "/o.mp4", probe: probeV, outExt: "mp4", options: { preset: "small" }, encoders: { libx264: true } });
  assert.ok(p.args.includes("-vf") && p.args[p.args.indexOf("-vf") + 1].includes("720"));
  assert.ok(p.args.includes("30"));
});

test("hız: atempo zinciri 0,5–2 aralığında; video setpts", () => {
  assert.equal(ffargs.atempoChain(2), "atempo=2");
  assert.equal(ffargs.atempoChain(4), "atempo=2,atempo=2");
  assert.equal(ffargs.atempoChain(0.25), "atempo=0.5,atempo=0.5");
  assert.equal(ffargs.atempoChain(3), "atempo=2,atempo=1.5");
  const r = ffargs.buildMediaArgs({ op: "speed", input: "/i.mp4", output: "/o.mp4", probe: probeV, outExt: "mp4", options: { factor: 2 } });
  assert.ok(r.args.includes("setpts=PTS/2"));
  assert.equal(r.expectedMs, 5000);
});

test("sessiz, ses ayıkla, normalize, döndür, oran kırpma, GIF, kare, bölme", () => {
  const b = (op, options = {}, outExt = "mp4", kind = "video") => ffargs.buildMediaArgs({ op, input: "/i.mp4", output: "/o", probe: probeV, outExt, options, kind }).args;
  assert.ok(b("mute").includes("-an"));
  assert.ok(b("extractAudio", {}, "m4a").includes("-vn"));
  assert.ok(b("normalize").join(" ").includes("loudnorm"));
  assert.ok(b("rotate", { direction: "ccw" }).includes("transpose=2"));
  assert.match(b("cropAspect", { aspect: "9:16" }).join(" "), /crop=trunc\(min\(iw\\,ih\*0\.5625/);
  assert.match(b("gif", { startMs: 1000, endMs: 3000, fps: 10, width: 400 }, "gif").join(" "), /fps=10,scale=400:-2.*palettegen.*paletteuse/);
  const snap = b("snapshot", { timeMs: 2500 }, "png");
  assert.equal(snap[snap.indexOf("-ss") + 1], "2.500");
  assert.ok(snap.includes("-frames:v"));
  assert.ok(b("snapshot", { everySec: 2 }, "png").includes("fps=1/2"));
  const split = b("split", { everySec: 30 });
  assert.ok(split.includes("segment") && split.includes("30") && split.includes("copy"));
  assert.throws(() => ffargs.buildMediaArgs({ op: "nope", input: "/i", output: "/o" }), /Bilinmeyen/);
});

test("birleştirme: farklı boyutlar ilk videoya sığdırılır; sessiz parçaya sessizlik eklenir", () => {
  const { args, expectedMs } = ffargs.buildJoinArgs({
    inputs: ["/a.mp4", "/b.mov"], output: "/o.mp4",
    probes: [{ width: 1280, height: 720, hasAudio: true, durationMs: 3000 }, { width: 1920, height: 1080, hasAudio: false, durationMs: 2000 }],
    encoders: { libx264: true },
  });
  const graph = args[args.indexOf("-filter_complex") + 1];
  assert.match(graph, /scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720/);
  assert.match(graph, /anullsrc=r=48000:cl=stereo,atrim=duration=2\.000\[a1\]/);
  assert.match(graph, /concat=n=2:v=1:a=1\[vout\]\[aout\]/);
  assert.equal(expectedMs, 5000);
  const audio = ffargs.buildJoinArgs({ inputs: ["/a.mp3", "/b.wav"], output: "/o.m4a", kind: "audio", outExt: "m4a" });
  assert.match(audio.args.join(" "), /concat=n=2:v=0:a=1/);
  assert.throws(() => ffargs.buildJoinArgs({ inputs: ["/a"], output: "/o" }), /en az iki/);
});

test("-progress çıktısı ve -encoders listesi okunur", () => {
  assert.deepEqual(ffargs.parseProgress("frame=10\nout_time_us=2500000\nprogress=continue\n"), { outMs: 2500, done: false });
  assert.deepEqual(ffargs.parseProgress("out_time_ms=1000000\nprogress=end"), { outMs: 1000, done: true });
  const enc = ffargs.parseEncoders(" V....D libx264              libx264 H.264\n A....D aac                  AAC\n V....D h264_videotoolbox    VideoToolbox\n");
  assert.equal(enc.libx264, true);
  assert.equal(enc.aac, true);
  assert.equal(enc.h264_videotoolbox, true);
});

test("cleanError: bilinen ffmpeg hataları Türkçe", () => {
  assert.match(cleanError("[mov] moov atom not found\nInvalid data found when processing input"), /bozuk/);
  assert.match(cleanError("Unknown encoder 'libx264'"), /kodlayıcı/);
});

/* --------------------------------- metin --------------------------------- */

test("altyazı: SRT → VTT → SRT gidiş-dönüş, ayarlar korunur", () => {
  const srt = "1\n00:00:01,000 --> 00:00:02,500\nMerhaba\nDünya\n\n2\n00:01:00,250 --> 00:01:03,000\nİkinci\n";
  const vtt = text.convertSubtitles(srt, "vtt");
  assert.match(vtt, /^WEBVTT\n\n00:00:01\.000 --> 00:00:02\.500\nMerhaba\nDünya/);
  assert.equal(text.convertSubtitles(vtt, "srt"), srt.replace(/\n$/, "") + "\n");
  const withCue = "WEBVTT\n\nNOTE x\n\n00:05.000 --> 00:06.000 align:start\nKısa\n";
  assert.match(text.convertSubtitles(withCue, "srt"), /00:00:05,000 --> 00:00:06,000\nKısa/);
  assert.throws(() => text.convertSubtitles("boş", "srt"), /bulunamadı/);
});

test("metin kodlaması: algılama ve Windows-1254 gidiş-dönüş (Türkçe karakterler)", () => {
  const s = "Şişli’de ığdır, ÇĞÖÜİ ç ğ ö ü";
  const enc = text.encodeText(s.replace("’", "'"), "windows-1254");
  assert.equal(enc.lost, 0);
  assert.equal(text.detectEncoding(enc.bytes), "windows-1254");
  assert.equal(text.decodeText(enc.bytes), s.replace("’", "'"));
  assert.equal(text.detectEncoding(Buffer.from(s, "utf8")), "utf-8");
  assert.equal(text.detectEncoding(text.encodeText(s, "utf-8-bom").bytes), "utf-8-bom");
  assert.equal(text.encodeText("€ ✓", "iso-8859-9").lost, 2);
  assert.equal(text.withLineEndings("a\nb\r\nc", "crlf"), "a\r\nb\r\nc");
});

test("yeniden adlandırma şablonu ve sayfa aralıkları", () => {
  const f = { name: "IMG_001.jpg", ext: "jpg", mtimeMs: new Date(2026, 10, 10, 9, 5).getTime(), folder: "Tatil" };
  assert.equal(text.applyRenameTemplate("{klasor}-{n:3}-{tarih}", f, 4, { start: 1 }), "Tatil-005-2026-11-10");
  assert.equal(text.applyRenameTemplate("{ad}_{saat}", f, 0), "IMG_001_09-05");
  assert.equal(text.applyRenameTemplate("{ad}-{n}", f, 9, { start: 1, pad: 2 }), "IMG_001-10");
  assert.deepEqual(text.parsePageRanges("1-3, 5, 8-", 10), [[1, 2, 3], [5], [8, 9, 10]]);
  assert.equal(text.parsePageRanges("0-2", 10), null);
  assert.equal(text.parsePageRanges("4-2", 10), null);
  assert.equal(text.parsePageRanges("12", 10), null);
});

test("biçim kataloğu: tür ve hedefler", () => {
  assert.equal(formats.kindOf("/x/Foto.HEIC"), "image");
  assert.equal(formats.kindOf("a.mkv"), "video");
  assert.equal(formats.kindOf("a.srt"), "subtitle");
  assert.equal(formats.kindOf("a.xyz"), "other");
  assert.ok(formats.TARGETS.video.includes("gif"));
});

/* ------------------------------ yerel araçlar ------------------------------ */

test("sips / ZIP / Ghostscript argümanları (kabuksuz; PowerShell yolları ortamda JSON)", () => {
  assert.deepEqual(native.sipsArgs("/a.heic", "/b.jpg", "jpg", { quality: 85 }), ["-s", "format", "jpeg", "-s", "formatOptions", "85", "/a.heic", "--out", "/b.jpg"]);
  assert.throws(() => native.sipsArgs("/a", "/b", "webp"), /yazamaz/);
  const mac = native.zipCommand({ inputs: ["/x"], output: "/o.zip", workDir: "/w", platform: "darwin" });
  assert.deepEqual(mac.args, ["-c", "-k", "--sequesterRsrc", N("/w/zip-staging"), "/o.zip"]);
  const win = native.zipCommand({ inputs: ["C:\\a b\\c'd.txt"], output: "C:\\o.zip", workDir: "C:\\w", platform: "win32", env: { SystemRoot: "C:\\Windows" } });
  assert.ok(!win.args.join(" ").includes("c'd.txt"), "yol komut metnine girmez");
  assert.deepEqual(JSON.parse(win.env.ELITLIG_ARGS), { src: ["C:\\a b\\c'd.txt"], dest: "C:\\o.zip" });
  assert.deepEqual(native.unzipCommand({ input: "/a.zip", dest: "/d", platform: "darwin" }).args, ["-x", "-k", "/a.zip", "/d"]);
  assert.ok(native.gsCompressArgs("/i.pdf", "/o.pdf", "screen").includes("-dPDFSETTINGS=/screen"));
  assert.ok(native.gsCompressArgs("/i.pdf", "/o.pdf", "; rm").includes("-dPDFSETTINGS=/ebook"));
});

test("bgraToRgba ve isteğe bağlı kütüphane yokken anlaşılır hata", () => {
  assert.deepEqual([...native.bgraToRgba(Buffer.from([1, 2, 3, 4]))], [3, 2, 1, 4]);
  assert.equal(native.loadOptional("bu-paket-yok-123"), null);
});

test("Float: kenara yapışma ve sağ kenarda sola doğru açılma", () => {
  const area = { x: 0, y: 25, width: 1440, height: 875 };
  assert.deepEqual(snapToEdge({ x: 1320, y: 300, width: 104, height: 128 }, area), { x: 1336, y: 300, edge: "right" });
  assert.deepEqual(snapToEdge({ x: 30, y: 40, width: 104, height: 128 }, area), { x: 0, y: 25, edge: "left" });
  assert.equal(snapToEdge({ x: 600, y: 300, width: 104, height: 128 }, area).edge, null);
  const b = expandedBounds({ x: 1336, y: 300, width: 104, height: 128 }, area, true, 5);
  assert.equal(b.x + b.width, 1440);
  assert.equal(b.width, 260);
});

/* --------------------------------- iş kuyruğu --------------------------------- */

test("iş kuyruğu: çıktı çakışmasız taşınır, çalışma klasörü silinir, kütüphanede kalır", async () => {
  const dir = tmp();
  const out = tmp("ft-out-");
  const input = path.join(out, "kaynak.txt");
  fs.writeFileSync(input, "orijinal");
  fs.writeFileSync(path.join(out, "kaynak-kopya.txt"), "eski");
  const jobs = createJobs({ dir });
  const events = [];
  jobs.events.on("job", (j) => events.push(j.status));
  const done = new Promise((resolve) => jobs.events.on("job", (j) => { if (j.status === "done" || j.status === "error") resolve(j); }));
  jobs.enqueue({
    op: "test", label: "Deneme", inputs: [input], outDir: out,
    run: async (ctx) => {
      const t = path.join(ctx.workDir, "x.txt");
      fs.writeFileSync(t, "yeni");
      ctx.setProgress(0.5);
      ctx.output(t, { name: "kaynak-kopya", ext: "txt" });
    },
  });
  const job = await done;
  assert.equal(job.status, "done");
  assert.equal(job.outputs[0].name, "kaynak-kopya (2).txt");
  assert.equal(fs.readFileSync(input, "utf8"), "orijinal", "orijinal değişmez");
  assert.equal(fs.readFileSync(path.join(out, "kaynak-kopya.txt"), "utf8"), "eski", "var olan dosyanın üstüne yazılmaz");
  assert.ok(!fs.readdirSync(out).some((n) => n.startsWith(".elitlig-")), "çalışma klasörü temizlendi");
  assert.ok(events.includes("running"));
  jobs.flush();
  const again = createJobs({ dir });
  assert.equal(again.list()[0].label, "Deneme");
  assert.equal(again.list()[0].outputs[0].missing, false);
});

test("iş kuyruğu: hata ve iptal; çıktı yoksa hata; arayüz işi orijinalin üstüne yazamaz", async () => {
  const dir = tmp();
  const out = tmp("ft-out-");
  const jobs = createJobs({ dir });
  const finished = (id) => new Promise((resolve) => jobs.events.on("job", (j) => { if (j.id === id && ["done", "error", "canceled"].includes(j.status)) resolve(j); }));
  const a = jobs.enqueue({ op: "t", outDir: out, run: async () => { throw new Error("Bozuk dosya"); } });
  assert.equal((await finished(a.id)).error, "Bozuk dosya");
  const b = jobs.enqueue({ op: "t", outDir: out, run: async () => {} });
  assert.equal((await finished(b.id)).error, "Çıktı oluşmadı.");
  const c = jobs.enqueue({ op: "t", outDir: out, run: (ctx) => ctx.spawn(process.execPath, ["-e", "setTimeout(() => {}, 20000)"]) });
  setTimeout(() => jobs.cancel(c.id), 150);
  assert.equal((await finished(c.id)).status, "canceled");

  const src = path.join(out, "a.png");
  fs.writeFileSync(src, "x");
  const cj = jobs.startClient({ op: "imgEdit", inputs: [src], outDir: out });
  const p = jobs.clientFile(cj.id, { name: "a", ext: "png", bytes: new Uint8Array([1, 2, 3]) });
  assert.equal(path.basename(p), "a (2).png");
  assert.equal(fs.readFileSync(src, "utf8"), "x");
  assert.equal(jobs.clientDone(cj.id).status, "done");
  assert.throws(() => jobs.clientFile(cj.id, { name: "b", ext: "png", bytes: [1] }), /bitti/);
  jobs.dispose();
});

/* ------------------------------ PDF (pdf-lib) ------------------------------ */

const pdfLib = native.loadOptional("pdf-lib");
test("PDF: birleştir, böl, sırala/döndür/sil (pdf-lib yüklü değilse güncelleme ister)", { skip: false }, async () => {
  const dir = tmp("ft-pdf-");
  if (!pdfLib) {
    await assert.rejects(() => native.pdfInfo(path.join(dir, "yok.pdf")), /güncellemesi gerekiyor/);
    return;
  }
  const make = async (name, n) => {
    const doc = await pdfLib.PDFDocument.create();
    for (let i = 0; i < n; i += 1) doc.addPage([200 + i, 300]);
    const p = path.join(dir, name);
    fs.writeFileSync(p, await doc.save());
    return p;
  };
  const a = await make("a.pdf", 2);
  const b = await make("b.pdf", 3);
  const merged = path.join(dir, "m.pdf");
  assert.equal(await native.pdfMerge([a, b], merged), 5);
  assert.equal((await native.pdfInfo(merged)).pages, 5);
  const parts = await native.pdfSplit(merged, text.parsePageRanges("1-2, 5", 5), (g) => path.join(dir, `p${g}.pdf`));
  assert.equal(parts.length, 2);
  assert.equal((await native.pdfInfo(parts[0])).pages, 2);
  const org = path.join(dir, "o.pdf");
  assert.equal(await native.pdfOrganize(merged, [{ index: 4, rotate: 90 }, { index: 0, rotate: 0 }, { index: 0, rotate: 180 }], org), 3);
  const info = await native.pdfInfo(org);
  assert.deepEqual(info.sizes.map((s) => s.rotate), [90, 0, 180]);
  assert.equal(info.sizes[0].width, 202);
  await assert.rejects(() => native.pdfOrganize(merged, [], org), /En az bir sayfa/);
  fs.writeFileSync(path.join(dir, "bozuk.pdf"), "değil");
  await assert.rejects(() => native.pdfInfo(path.join(dir, "bozuk.pdf")), /okunamadı/);
});

/* ------------------------- gerçek ffmpeg (varsa) ------------------------- */

const ffmpeg = ff.resolveFfmpeg({ appRoot: path.join(__dirname, "..", ".."), resourcesPath: null });
test("ffmpeg: üretilen kısa videodan MP4 dönüştürme + ses ayıklama + GIF (iş kuyruğu ile, gerçek ilerleme)", { skip: ffmpeg ? false : "ffmpeg bulunamadı", timeout: 120000 }, async () => {
  const dir = tmp("ft-ff-");
  const src = path.join(dir, "kaynak video.mkv");
  execFileSync(ffmpeg.path, ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc=size=320x240:rate=25:duration=2", "-f", "lavfi", "-i", "sine=frequency=440:duration=2", "-shortest", "-c:v", "mpeg4", "-c:a", "aac", src]);
  const enc = ffargs.parseEncoders(execFileSync(ffmpeg.path, ["-hide_banner", "-encoders"]).toString());
  const jobs = createJobs({ dir: tmp() });
  const progress = [];
  jobs.events.on("job", (j) => { if (j.status === "running") progress.push(j.progress); });
  const run = (op, outExt, options = {}) => new Promise((resolve) => {
    const job = jobs.enqueue({
      op, inputs: [src], outDir: dir,
      run: async (ctx) => {
        const tmpOut = path.join(ctx.workDir, `out.${outExt}`);
        const { args, expectedMs } = ffargs.buildMediaArgs({ op, input: src, output: tmpOut, kind: "video", probe: { durationMs: 2000, width: 320, height: 240, hasAudio: true }, outExt, options, encoders: enc });
        await ctx.spawn(ffmpeg.path, args, { expectedMs });
        ctx.output(tmpOut, { name: "kaynak video", ext: outExt });
      },
    });
    jobs.events.on("job", (j) => { if (j.id === job.id && ["done", "error"].includes(j.status)) resolve(j); });
  });
  const mp4 = await run("convert", "mp4", { format: "mp4" });
  assert.equal(mp4.status, "done", mp4.error);
  const out = mp4.outputs[0].path;
  assert.equal(path.basename(out), "kaynak video.mp4");
  const probe = ff.parseProbe(require("node:child_process").spawnSync(ffmpeg.path, ["-hide_banner", "-i", out]).stderr.toString());
  assert.equal(probe.width, 320);
  assert.ok(Math.abs(probe.durationMs - 2000) < 300);
  assert.ok(progress.some((p) => p > 0), "ilerleme bildirildi");
  const m4a = await run("extractAudio", "m4a");
  assert.equal(m4a.status, "done", m4a.error);
  const gif = await run("gif", "gif", { startMs: 0, endMs: 1000, fps: 8, width: 160 });
  assert.equal(gif.status, "done", gif.error);
  assert.ok(fs.statSync(gif.outputs[0].path).size > 1000);
  assert.ok(fs.existsSync(src), "kaynak yerinde");
  jobs.dispose();
});

test("Windows HEIC yedeği: WIC (PowerShell) komutu yolları ortam değişkeniyle geçirir", () => {
  const cmd = native.wicDecodeCommand({ input: "C:\\Foto lar\\IMG 1'.HEIC", output: "C:\\t\\o.png", env: { SystemRoot: "C:\\Windows" } });
  if (cmd.file) assert.match(cmd.file, /powershell(\.exe)?$/i); // Windows dışında bulunamaz (null)
  assert.ok(cmd.args.includes("-NoProfile") && cmd.args.includes("-NonInteractive"));
  const script = cmd.args[cmd.args.indexOf("-Command") + 1];
  assert.match(script, /BitmapDecoder\]::Create/);
  assert.match(script, /PngBitmapEncoder/);
  assert.ok(!script.includes("IMG 1"), "yol betiğe gömülmez");
  assert.deepEqual(JSON.parse(cmd.env.ELITLIG_ARGS), { src: "C:\\Foto lar\\IMG 1'.HEIC", dest: "C:\\t\\o.png" });
});

test("kare hızı bilinmeyen video (MediaRecorder WEBM, '1000 fps') zaman damgalarıyla kodlanır", () => {
  const base = { op: "convert", input: "/a/kayit.webm", output: "/o/kayit.mp4", kind: "video", outExt: "mp4", options: { format: "mp4" }, encoders: { libx264: true }, platform: "linux" };
  const rec = ffargs.buildMediaArgs({ ...base, probe: { durationMs: null, width: 1600, height: 1000, fps: null, hasAudio: false } }).args;
  assert.equal(rec[rec.indexOf("-fps_mode") + 1], "vfr");
  const normal = ffargs.buildMediaArgs({ ...base, input: "/a/klip.mp4", probe: { durationMs: 4000, width: 640, height: 360, fps: 25, hasAudio: true } }).args;
  assert.ok(!normal.includes("-fps_mode"), "kare hızı bilinen videoda değişiklik yok");
});
