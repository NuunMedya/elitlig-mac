// Yayın kalitesi — GERÇEK ffmpeg ile: renk dönüşümü / etiketleri (yeniden kodlama ve
// kopya kipi) ve ses bit hızının bant genişliğine etkisi. ffmpeg / libx264 yoksa atlanır.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const ff = require("../studio/ffmpeg");

const candidate = ff.resolveFfmpeg({ resourcesPath: null });
const FF = candidate?.path;
const run = (args) => spawnSync(FF, ["-hide_banner", "-nostdin", ...args], { encoding: "utf8", timeout: 60000 });
const has = (() => {
  if (!FF) return null;
  const enc = run(["-encoders"]).stdout || "";
  const fil = run(["-filters"]).stdout || "";
  return { x264: /\blibx264\b/.test(enc), aac: /\baac\b/.test(enc), psnr: /\bpsnr\b/.test(fil), meta: /h264_metadata/.test(run(["-bsfs"]).stdout || "") };
})();
const skip = !has || !has.x264 || !has.aac || !has.psnr || !has.meta ? "ffmpeg / libx264 / psnr / h264_metadata yok" : false;
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "elitlig-quality-"));

/** Dosyanın görüntü satırı ("yuv420p(tv, bt709, progressive)" …). */
const videoLine = (file) => (run(["-i", file]).stderr.split(/\r?\n/).find((l) => /Video:/.test(l)) || "");
/** RGB kaynağa göre PSNR (oynatıcı gibi: BT.709 sınırlı aralıkla çözülür). */
function rgbPsnr(file, ref) {
  const r = run(["-i", file, "-i", ref, "-lavfi", "[0:v]scale=in_color_matrix=bt709:in_range=tv,format=rgb24[a];[1:v]format=rgb24[b];[a][b]psnr", "-f", "null", "-"]);
  return Number(/average:([\d.]+)/.exec(r.stderr)?.[1]);
}

test("renk: BT.601 etiketsiz giriş (Chrome tuvali) yayında BT.709'a çevrilip etiketlenir — renk tonu kaymaz", { skip }, () => {
  const dir = tmp();
  try {
    const rgb = path.join(dir, "rgb.mkv");
    const src = path.join(dir, "src601.mkv");
    // Renkli kaynak (SMPTE çubukları), RGB; tarayıcı gibi BT.601 sınırlı aralıkla YUV'a, etiketsiz.
    assert.equal(run(["-loglevel", "error", "-y", "-f", "lavfi", "-i", "smptehdbars=s=320x180:r=30:d=0.5", "-vf", "format=rgb24", "-c:v", "ffv1", rgb]).status, 0);
    assert.equal(run(["-loglevel", "error", "-y", "-i", rgb, "-vf", "scale=out_color_matrix=bt601:out_range=tv,format=yuv420p,setparams=colorspace=unknown:color_primaries=unknown:color_trc=unknown", "-c:v", "ffv1", src]).status, 0);
    const enc = ff.videoEncoderArgs("libx264", { videoBitrateKbps: 3000, fps: 30, width: 320, height: 180 });
    const oldOut = path.join(dir, "old.mp4");
    const newOut = path.join(dir, "new.mp4");
    // Eski süzgeç (dönüşüm yok, etiket yok) / yeni süzgeç (ffmpeg.scaleFilter + COLOR_ARGS).
    const oldEnc = enc.filter((_, i) => !["-colorspace", "-color_primaries", "-color_trc", "-color_range"].includes(enc[i]) && !["-colorspace", "-color_primaries", "-color_trc", "-color_range"].includes(enc[i - 1]));
    assert.equal(run(["-loglevel", "error", "-y", "-i", src, "-vf", "scale=320:180:flags=bicubic,format=yuv420p", ...oldEnc, oldOut]).status, 0);
    assert.equal(run(["-loglevel", "error", "-y", "-i", src, "-vf", `${ff.scaleFilter(320, 180)},format=yuv420p`, ...enc, newOut]).status, 0);
    assert.match(videoLine(newOut), /yuv420p\(tv, bt709/);
    const before = rgbPsnr(oldOut, rgb);
    const after = rgbPsnr(newOut, rgb);
    assert.ok(after > before + 3, `RGB PSNR eski ${before} dB → yeni ${after} dB`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("renk: kopya kipinde kodlayıcının bildirdiği renk uzayı SPS'e yazılır (yeniden kodlamadan)", { skip }, () => {
  const dir = tmp();
  try {
    const raw = path.join(dir, "raw.mkv");
    assert.equal(run(["-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc2=s=320x180:r=30:d=0.5", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", raw]).status, 0);
    assert.doesNotMatch(videoLine(raw), /bt709/);
    const out = path.join(dir, "out.ts");
    const args = ff.buildCopyStreamArgs({ audioBitrateKbps: 192, videoColorSpace: { matrix: "bt709", primaries: "bt709", transfer: "bt709", fullRange: false } });
    const bsf = args[args.indexOf("-bsf:v") + 1];
    assert.equal(run(["-loglevel", "error", "-y", "-i", raw, "-c:v", "copy", "-bsf:v", bsf, "-f", "mpegts", out]).status, 0);
    assert.match(videoLine(out), /yuv420p\(tv, bt709/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("ses: 192 kbps AAC, 128 kbps'ye göre 16 kHz üstünü daha az keser (bant genişliği)", { skip }, () => {
  const dir = tmp();
  try {
    const src = path.join(dir, "src.wav");
    assert.equal(run(["-loglevel", "error", "-y", "-f", "lavfi", "-i", "anoisesrc=color=pink:amplitude=0.25:sample_rate=48000:duration=4", "-ac", "2", "-c:a", "pcm_s16le", src]).status, 0);
    const hf = (file) => {
      const r = run(["-i", file, "-af", "highpass=f=16000:poles=2,highpass=f=16000:poles=2,astats=measure_overall=RMS_level:measure_perchannel=none", "-f", "null", "-"]);
      return Number(/RMS level dB:\s*(-?[\d.]+)/.exec(r.stderr)?.[1]);
    };
    const enc = (kbps) => {
      const out = path.join(dir, `a${kbps}.m4a`);
      const a = ff.streamAudioArgs(kbps).filter((_, i, l) => l[i] !== "-af" && l[i - 1] !== "-af");
      assert.equal(run(["-loglevel", "error", "-y", "-i", src, ...a, out]).status, 0);
      return hf(out);
    };
    const ref = hf(src);
    const k128 = enc(128);
    const k192 = enc(192);
    assert.ok(Number.isFinite(ref) && Number.isFinite(k128) && Number.isFinite(k192));
    assert.ok(k192 > k128 + 1.5, `16 kHz üstü: kaynak ${ref} dB, 128k ${k128} dB, 192k ${k192} dB`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
