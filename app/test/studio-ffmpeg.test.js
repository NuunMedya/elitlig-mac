// Yayın Stüdyosu — ffmpeg.js: Windows ikili araması, kodlayıcı yoklaması /
// sırası, kodlayıcı seçenekleri ve H.264 seviyesi (spawn taklit edilir).
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const ff = require("../studio/ffmpeg");

const at = (args, flag) => args[args.indexOf(flag) + 1];

/* ------------------------------- ikili araması ------------------------------- */

test("Windows: ortam > paketli resources\\ffmpeg\\ffmpeg.exe > geliştirme win-x64 > PATH", () => {
  const list = ff.ffmpegCandidates({
    env: { ELITLIG_FFMPEG: "D:\\ff\\ffmpeg.exe", Path: "C:\\Windows\\System32;\"C:\\Tools\\ffmpeg\\bin\"" },
    platform: "win32", arch: "x64",
    resourcesPath: "C:\\Users\\a\\AppData\\Local\\Programs\\Elitlig Araclar\\resources",
    appRoot: "C:\\src\\elitlig",
  });
  assert.deepEqual(list.map((c) => c.source), ["env", "bundled", "dev", "system", "system"]);
  assert.deepEqual(list.map((c) => c.path), [
    "D:\\ff\\ffmpeg.exe",
    "C:\\Users\\a\\AppData\\Local\\Programs\\Elitlig Araclar\\resources\\ffmpeg\\ffmpeg.exe",
    "C:\\src\\elitlig\\build\\ffmpeg\\win-x64\\ffmpeg.exe",
    "C:\\Windows\\System32\\ffmpeg.exe",
    "C:\\Tools\\ffmpeg\\bin\\ffmpeg.exe",
  ]);
  // Homebrew yolları Windows'ta aranmaz.
  assert.equal(list.some((c) => c.path.includes("homebrew")), false);
});

test("Mac araması değişmedi (paketli, mimariye göre geliştirme, Homebrew)", () => {
  const list = ff.ffmpegCandidates({ env: { PATH: "/usr/bin" }, platform: "darwin", arch: "x64", resourcesPath: "/A/Contents/Resources", appRoot: "/p" });
  assert.deepEqual(list.map((c) => c.path), ["/A/Contents/Resources/ffmpeg/ffmpeg", "/p/build/ffmpeg/x64/ffmpeg", "/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg", "/usr/bin/ffmpeg"]);
});

test("Windows: paketli ffmpeg.exe bulunursa o seçilir", () => {
  const c = ff.resolveFfmpeg({ env: { Path: "C:\\x" }, platform: "win32", resourcesPath: "C:\\App\\resources", appRoot: "C:\\src" }, (p) => p.endsWith("ffmpeg.exe") && p.startsWith("C:\\App"));
  assert.deepEqual(c, { path: "C:\\App\\resources\\ffmpeg\\ffmpeg.exe", source: "bundled" });
});

/* -------------------------------- yoklama -------------------------------- */

const ENC_LIST = [" V....D libx264  x", " V....D h264_videotoolbox  x", " V....D h264_nvenc  x", " V....D h264_qsv  x", " V....D h264_amf  x", " V....D h264_mf  x", " A....D aac  x"].join("\n");
const MUX_LIST = "  E tee  x\n  E segment  x\n DE flv  x\n";

/** Taklit ffmpeg: works = açılabilen kodlayıcılar; tested = denenenler (sırasıyla). */
function fakeRun(works) {
  const tested = [];
  const runImpl = async (_file, args) => {
    if (args.includes("-version")) return { ok: true, stdout: "ffmpeg version 7.1.1-essentials_build-www.gyan.dev Copyright" };
    if (args.includes("-encoders")) return { ok: true, stdout: ENC_LIST };
    if (args.includes("-muxers")) return { ok: true, stdout: MUX_LIST };
    const enc = at(args, "-c:v");
    tested.push({ enc, args });
    return { ok: works.includes(enc), stdout: "", stderr: works.includes(enc) ? "" : "Cannot load nvcuda.dll" };
  };
  return { runImpl, tested };
}

test("Windows yoklaması: NVENC → QSV → AMF → MF → libx264 sırasıyla denenir, VideoToolbox denenmez", async () => {
  const { runImpl, tested } = fakeRun(["h264_qsv", "h264_mf", "libx264"]);
  const info = await ff.probeFfmpeg({ path: "C:\\ff.exe", source: "bundled" }, { runImpl, platform: "win32" });
  assert.deepEqual(tested.map((t) => t.enc), ["h264_nvenc", "h264_qsv", "h264_amf", "h264_mf", "libx264"]);
  assert.deepEqual(info.encoders, { videotoolbox: false, nvenc: false, qsv: true, amf: false, mf: true, libx264: true });
  assert.equal(info.available, true);
  assert.equal(info.encoder, "h264_qsv");
  assert.equal(ff.pickEncoder(info.encoders, "win32"), "h264_qsv");
  assert.equal(ff.pickEncoder(info.encoders), "h264_qsv");
  // Deneme kodlaması: yayındaki gibi global başlık + FLV, QSV için NV12.
  const qsv = tested.find((t) => t.enc === "h264_qsv").args;
  assert.equal(at(qsv, "-frames:v"), "10");
  assert.equal(at(qsv, "-vf"), "format=nv12");
  assert.equal(at(qsv, "-flags"), "+global_header");
  assert.equal(qsv[qsv.length - 2], "flv");
});

test("Windows yoklaması: donanım yoksa libx264; hiçbiri yoksa kullanılamaz", async () => {
  const a = await ff.probeFfmpeg({ path: "f", source: "env" }, { runImpl: fakeRun(["libx264"]).runImpl, platform: "win32" });
  assert.equal(a.encoder, "libx264");
  assert.equal(a.available, true);
  const b = await ff.probeFfmpeg({ path: "f", source: "env" }, { runImpl: fakeRun([]).runImpl, platform: "win32" });
  assert.equal(b.available, false);
  assert.equal(b.encoder, null);
  assert.match(b.error, /kodlayıcı/);
});

test("Mac yoklaması: yalnız VideoToolbox ve libx264 denenir", async () => {
  const { runImpl, tested } = fakeRun(["h264_videotoolbox", "libx264", "h264_nvenc"]);
  const info = await ff.probeFfmpeg({ path: "/f", source: "bundled" }, { runImpl, platform: "darwin" });
  assert.deepEqual(tested.map((t) => t.enc), ["h264_videotoolbox", "libx264"]);
  assert.equal(info.encoders.nvenc, false);
  assert.equal(info.encoder, "h264_videotoolbox");
});

test("testEncoders=false: liste yeterli, deneme kodlaması yapılmaz", async () => {
  const { runImpl, tested } = fakeRun([]);
  const info = await ff.probeFfmpeg({ path: "f", source: "env" }, { runImpl, platform: "win32", testEncoders: false });
  assert.equal(tested.length, 0);
  assert.equal(info.encoder, "h264_nvenc");
});

test("çalışma anı geri düşüşü: sıradaki açık kodlayıcı", () => {
  const enc = { videotoolbox: false, nvenc: true, qsv: false, amf: true, mf: false, libx264: true };
  assert.equal(ff.nextEncoder("h264_nvenc", enc, "win32"), "h264_amf");
  assert.equal(ff.nextEncoder("h264_amf", enc, "win32"), "libx264");
  assert.equal(ff.nextEncoder("libx264", enc, "win32"), null);
  assert.equal(ff.nextEncoder("h264_videotoolbox", { videotoolbox: true, libx264: true }, "darwin"), "libx264");
  assert.equal(ff.nextEncoder("h264_nvenc", enc), "h264_amf");
  assert.equal(ff.isHardwareEncoder("h264_mf"), true);
  assert.equal(ff.isHardwareEncoder("libx264"), false);
  assert.equal(ff.encoderKey("h264_qsv"), "qsv");
  assert.deepEqual(ff.encoderOrder("linux"), ["libx264"]);
});

/* ------------------------------ H.264 seviyesi ------------------------------ */

test("H.264 seviyesi çözünürlük ve kare hızına göre (h264level.js ile aynı)", () => {
  const L = (width, height, fps) => ff.computeH264Level({ width, height, fps });
  assert.equal(L(640, 360, 30), "4.1");
  assert.equal(L(1280, 720, 30), "4.1");
  assert.equal(L(1280, 720, 60), "4.1");
  assert.equal(L(1920, 1080, 25), "4.1");
  assert.equal(L(1920, 1080, 30), "4.1");
  assert.equal(L(1920, 1080, 50), "4.2");
  assert.equal(L(1920, 1080, 60), "4.2"); // gerçek sorun: 1080p60 akış 4.0 yazılıyordu → siyah ekran
  assert.equal(L(1080, 1920, 60), "4.2"); // dikey yayın
  assert.equal(L(2560, 1440, 30), "5.1");
  assert.equal(L(2560, 1440, 60), "5.1");
  assert.equal(L(3840, 2160, 30), "5.1");
  assert.equal(L(3840, 2160, 60), "5.2");
  assert.equal(L(1920, 1080, 60), require("../studio/h264level").computeH264Level(1920, 1080, 60));
});

/* ---------------------------- kodlayıcı seçenekleri ---------------------------- */

const opts = { videoBitrateKbps: 6000, fps: 60, width: 1920, height: 1080 };

test("tüm kodlayıcılar: CBR, 2 sn GOP, High profil, açık seviye", () => {
  for (const enc of Object.values(ff.ENCODERS)) {
    const a = ff.videoEncoderArgs(enc, opts);
    assert.equal(at(a, "-c:v"), enc);
    assert.equal(at(a, "-b:v"), "6000k", enc);
    assert.equal(at(a, "-maxrate"), "6000k", enc);
    assert.equal(at(a, "-bufsize"), "6000k", enc);
    assert.equal(at(a, "-g"), "120", enc);
    assert.ok(["high", "100"].includes(at(a, "-profile:v")), enc);
    const level = a.includes("-level") ? at(a, "-level") : at(a, "-bsf:v");
    assert.ok(["4.2", "42", "h264_metadata=level=4.2"].includes(level), `${enc}: ${level}`);
  }
});

test("NVENC: p4 + hq + cbr + 2 B-kare (OBS gibi), IDR anahtar kareler", () => {
  const a = ff.videoEncoderArgs("h264_nvenc", opts);
  assert.equal(at(a, "-preset"), "p4");
  assert.equal(at(a, "-tune"), "hq");
  assert.equal(at(a, "-bf"), "2");
  assert.equal(at(a, "-rc"), "cbr");
  assert.equal(at(a, "-level"), "4.2");
  assert.equal(at(a, "-forced-idr"), "1");
});

test("QSV: veryfast, look_ahead 0, seviye 42, NV12", () => {
  const a = ff.videoEncoderArgs("h264_qsv", opts);
  assert.equal(at(a, "-preset"), "veryfast");
  assert.equal(at(a, "-look_ahead"), "0");
  assert.equal(at(a, "-level"), "42");
  assert.equal(at(a, "-forced_idr"), "1");
  assert.equal(ff.encoderPixelFormat("h264_qsv"), "nv12");
});

test("AMF: lowlatency + cbr", () => {
  const a = ff.videoEncoderArgs("h264_amf", opts);
  assert.equal(at(a, "-usage"), "lowlatency");
  assert.equal(at(a, "-rc"), "cbr");
  assert.equal(at(a, "-level"), "4.2");
  assert.equal(ff.encoderPixelFormat("h264_amf"), "nv12");
});

test("Media Foundation: donanım, cbr, live_streaming, seviye h264_metadata ile", () => {
  const a = ff.videoEncoderArgs("h264_mf", { ...opts, fps: 30 });
  assert.equal(at(a, "-hw_encoding"), "1");
  assert.equal(at(a, "-rate_control"), "cbr");
  assert.equal(at(a, "-scenario"), "live_streaming");
  assert.equal(at(a, "-bsf:v"), "h264_metadata=level=4.1");
  assert.equal(a.includes("-level"), false);
});

test("libx264 ve VideoToolbox: önceki ayarlar korunur, seviye eklenir", () => {
  const x = ff.videoEncoderArgs("libx264", opts);
  assert.deepEqual([at(x, "-preset"), at(x, "-sc_threshold"), at(x, "-x264-params"), at(x, "-level")], ["veryfast", "0", "nal-hrd=cbr:force-cfr=1", "4.2"]);
  const v = ff.videoEncoderArgs("h264_videotoolbox", { ...opts, width: 1280, height: 720 });
  assert.deepEqual([at(v, "-allow_sw"), at(v, "-realtime"), at(v, "-level")], ["0", "1", "4.1"]);
  assert.equal(at(x, "-bf"), "2");
});

test("yayın komutu: kodlayıcıya göre piksel biçimi ve seviye", () => {
  const base = ff.normalizeStreamOptions({ width: 1920, height: 1080, fps: 60, videoBitrateKbps: 6000 });
  const nv = ff.buildStreamArgs({ ...base, encoder: "h264_nvenc" });
  assert.match(at(nv, "-vf"), /^scale=1920:1080:flags=bicubic,fps=60,format=yuv420p$/);
  assert.equal(at(nv, "-level"), "4.2");
  const amf = ff.buildStreamArgs({ ...base, encoder: "h264_amf" });
  assert.match(at(amf, "-vf"), /format=nv12$/);
  const mf = ff.buildStreamArgs({ ...base, encoder: "h264_mf" });
  assert.equal(at(mf, "-bsf:v"), "h264_metadata=level=4.2");
  assert.equal(mf[mf.length - 2], "tee");
});

test("Windows donanım kodlayıcı hataları ENCODER olarak eşlenir (geri düşüş tetiklenir)", () => {
  for (const line of [
    "[h264_nvenc @ 0000] Cannot load nvcuda.dll",
    "[h264_nvenc @ 0000] OpenEncodeSessionEx failed: unsupported device (2): (no details)",
    "[h264_qsv @ 0000] Error initializing an internal MFX session: unsupported (-3)",
    "[h264_amf @ 0000] DLL amfrt64.dll failed to open",
    "[h264_mf @ 0000] could not find any MFT for the given media type",
    "[vost#0:0/h264_nvenc @ 0000] Error while opening encoder - maybe incorrect parameters such as bit_rate, rate, width or height.",
  ]) assert.equal(ff.mapFfmpegError(line).code, "ENCODER", line);
  assert.equal(ff.mapFfmpegError("Connection refused").code, "CONNECTION_REFUSED");
});
