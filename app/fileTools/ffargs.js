// Dosya Araçları — ffmpeg komut satırı kurucuları (saf işlevler).
//
// Her kurucu bir argüman DİZİSİ döner; kabuk hiç kullanılmaz (dosya adındaki
// boşluk, tırnak, $ vb. olduğu gibi tek argümandır). Çıktı her zaman işin geçici
// çalışma klasörüne yazılır, iş bitince çakışmasız asıl ada taşınır (jobs.js).
//
// İlerleme: "-progress pipe:1" ile stdout'a anahtar=değer satırları gelir
// (out_time_us, progress=end); beklenen süre expectedMs ile birlikte döner.
"use strict";

const BASE = ["-hide_banner", "-nostdin", "-n", "-loglevel", "error", "-progress", "pipe:1", "-nostats"];

/** Kodlayıcı seçimi: ffmpeg derlemesindeki kodlayıcılara göre ({ libx264: true, … }). */
function pickVideoEncoder(encoders = {}, platform = process.platform) {
  if (encoders.libx264) return "libx264";
  if (platform === "darwin" && encoders.h264_videotoolbox) return "h264_videotoolbox";
  if (platform === "win32" && encoders.h264_mf) return "h264_mf";
  if (encoders.h264_videotoolbox) return "h264_videotoolbox";
  if (encoders.mpeg4) return "mpeg4";
  return "libx264";
}

/** Yükseklik / kaliteye göre yaklaşık bit hızı (donanım kodlayıcıları CRF almaz). */
function bitrateFor(height, quality = "medium") {
  const h = Number(height) || 1080;
  const base = h >= 2000 ? 16000 : h >= 1400 ? 10000 : h >= 1000 ? 6000 : h >= 700 ? 3500 : 1800;
  const mul = { small: 0.5, medium: 1, high: 1.6 }[quality] || 1;
  return Math.round(base * mul);
}

function videoCodecArgs(encoder, { crf = 23, bitrateKbps = null, height = null } = {}) {
  if (encoder === "libx264") {
    const rate = bitrateKbps ? ["-b:v", `${bitrateKbps}k`, "-maxrate", `${Math.round(bitrateKbps * 1.5)}k`, "-bufsize", `${bitrateKbps * 2}k`] : ["-crf", String(crf)];
    return ["-c:v", "libx264", "-preset", "veryfast", ...rate, "-pix_fmt", "yuv420p"];
  }
  const kbps = bitrateKbps || bitrateFor(height, crf >= 28 ? "small" : crf <= 21 ? "high" : "medium");
  if (encoder === "mpeg4") return ["-c:v", "mpeg4", "-b:v", `${kbps}k`];
  return ["-c:v", encoder, "-b:v", `${kbps}k`, "-pix_fmt", "yuv420p"];
}

/** Ses kodlayıcısı (hedef uzantıya göre). */
function audioCodecArgs(ext, { kbps = null, encoders = {} } = {}) {
  switch (ext) {
    case "mp3": return kbps ? ["-c:a", "libmp3lame", "-b:a", `${kbps}k`] : ["-c:a", "libmp3lame", "-q:a", "2"];
    case "wav": return ["-c:a", "pcm_s16le"];
    case "flac": return ["-c:a", "flac"];
    case "ogg": case "oga":
      return encoders.libvorbis === false && encoders.libopus ? ["-c:a", "libopus", "-b:a", `${kbps || 128}k`] : ["-c:a", "libvorbis", "-q:a", kbps ? String(Math.max(1, Math.min(8, Math.round(kbps / 32)))) : "5"];
    case "opus": case "webm": return ["-c:a", "libopus", "-b:a", `${kbps || 128}k`];
    case "aiff": case "aif": return ["-c:a", "pcm_s16be"];
    default: return ["-c:a", "aac", "-b:a", `${kbps || 192}k`];
  }
}

const VIDEO_TARGETS = new Set(["mp4", "mov", "m4v", "webm", "mkv"]);
const AUDIO_TARGETS = new Set(["mp3", "m4a", "wav", "ogg", "flac", "aac", "opus"]);

/** Kapsayıcıya uygun video + ses kodlama argümanları. */
function videoTargetArgs(ext, { encoder = "libx264", crf = 23, bitrateKbps = null, height = null, audioKbps = 160 } = {}) {
  if (ext === "webm") {
    const rate = bitrateKbps ? ["-b:v", `${bitrateKbps}k`] : ["-b:v", "0", "-crf", String(Math.round(crf + 10))];
    return ["-c:v", "libvpx-vp9", ...rate, "-row-mt", "1", "-deadline", "good", "-cpu-used", "4", "-pix_fmt", "yuv420p", "-c:a", "libopus", "-b:a", `${audioKbps}k`];
  }
  const out = [...videoCodecArgs(encoder, { crf, bitrateKbps, height }), "-c:a", "aac", "-b:a", `${audioKbps}k`];
  if (ext === "mp4" || ext === "mov" || ext === "m4v") out.push("-movflags", "+faststart");
  return out;
}

/** Yalnız sesi yeniden kodlarken kapsayıcıya uygun ses kodlayıcısı (görüntü kopyalanır). */
const audioForContainer = (ext) => (ext === "webm" ? ["-c:a", "libopus", "-b:a", "160k"] : ext === "avi" ? ["-c:a", "libmp3lame", "-b:a", "192k"] : ["-c:a", "aac", "-b:a", "192k"]);

/** atempo 0.5–2 arasında çalışır: daha büyük / küçük katsayılar zincirlenir. */
function atempoChain(factor) {
  let f = Number(factor);
  if (!(f > 0)) throw new Error("Geçersiz hız.");
  f = Math.min(8, Math.max(0.125, f));
  const parts = [];
  while (f > 2) { parts.push(2); f /= 2; }
  while (f < 0.5) { parts.push(0.5); f /= 0.5; }
  parts.push(Math.round(f * 10000) / 10000);
  return parts.map((p) => `atempo=${p}`).join(",");
}

const sec = (ms) => (Math.max(0, Number(ms) || 0) / 1000).toFixed(3);
const even = (n) => Math.max(2, Math.round(Number(n) / 2) * 2);

/** "16:9" → 1.7778 (geçersizse null). */
function parseAspect(text) {
  const m = String(text || "").match(/^(\d+(?:\.\d+)?)[:/x](\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const a = Number(m[1]) / Number(m[2]);
  return a > 0 && Number.isFinite(a) ? a : null;
}

/** Ortalanmış en-boy kırpması (çift boyutlu). */
function cropAspectFilter(aspect) {
  const a = typeof aspect === "number" ? aspect : parseAspect(aspect);
  if (!a) throw new Error("Geçersiz en-boy oranı.");
  const A = a.toFixed(6);
  return `crop=trunc(min(iw\\,ih*${A})/2)*2:trunc(min(ih\\,iw/${A})/2)*2`;
}

const ROTATE_FILTERS = { cw: "transpose=1", ccw: "transpose=2", "180": "hflip,vflip", hflip: "hflip", vflip: "vflip" };

function gifFilter({ fps = 12, width = 480 } = {}) {
  const f = Math.min(30, Math.max(1, Math.round(Number(fps) || 12)));
  const w = Math.min(1920, Math.max(64, Math.round(Number(width) || 480)));
  return `fps=${f},scale=${w}:-2:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4`;
}

/**
 * Tek girdili medya işlemi.
 *   op: convert | trim | compress | speed | mute | extractAudio | normalize | resize | cropAspect | rotate | gif | snapshot | split
 *   input / output: tam yollar (output; split / snapshot-every için %03d kalıbı)
 *   kind: "video" | "audio"   probe: { durationMs, width, height, hasAudio }
 *   outExt: çıktı uzantısı   options: işleme özgü
 * → { args, expectedMs }
 */
function buildMediaArgs({ op, input, output, kind = "video", probe = {}, outExt, options = {}, encoders = {}, platform = process.platform }) {
  const o = options || {};
  const dur = Number(probe.durationMs) || null;
  const encoder = pickVideoEncoder(encoders, platform);
  const isVideo = kind === "video";
  const hasAudio = probe.hasAudio !== false;
  const map = isVideo ? ["-map", "0:v:0?", ...(hasAudio ? ["-map", "0:a:0?"] : [])] : ["-map", "0:a:0?"];
  const enc = (ext, extra = {}) => (AUDIO_TARGETS.has(ext) ? ["-vn", ...audioCodecArgs(ext, { encoders, kbps: extra.audioKbps })] : videoTargetArgs(ext, { encoder, height: probe.height, ...extra }));
  const audioOnlyEnc = (ext) => audioCodecArgs(ext, { encoders });
  const range = () => {
    const start = Math.max(0, Number(o.startMs) || 0);
    const end = Number(o.endMs) > start ? Number(o.endMs) : null;
    return { start, end, args: [...(start ? ["-ss", sec(start)] : []), ...(end ? ["-to", sec(end)] : [])], ms: end ? end - start : dur ? dur - start : null };
  };

  switch (op) {
    case "convert": {
      if (outExt === "gif") return { args: [...BASE, "-i", input, "-vf", gifFilter(o), "-loop", "0", "-an", output], expectedMs: dur };
      if (!VIDEO_TARGETS.has(outExt) && !AUDIO_TARGETS.has(outExt)) throw new Error("Desteklenmeyen hedef biçim.");
      if (!isVideo && VIDEO_TARGETS.has(outExt)) throw new Error("Ses dosyası videoya dönüştürülemez.");
      return { args: [...BASE, "-i", input, ...(AUDIO_TARGETS.has(outExt) ? ["-map", "0:a:0?"] : map), ...enc(outExt), output], expectedMs: dur };
    }
    case "trim": {
      const r = range();
      // Hızlı kesim: yeniden kodlamadan (anahtar karelere yaslanır); varsayılan: kare doğruluğunda yeniden kodlama.
      const codec = o.copy ? ["-c", "copy", "-avoid_negative_ts", "make_zero"] : isVideo ? enc(outExt) : audioOnlyEnc(outExt);
      return { args: [...BASE, "-i", input, ...r.args, ...map, ...codec, output], expectedMs: r.ms };
    }
    case "compress": {
      if (!isVideo) {
        const kbps = { small: 96, medium: 128, high: 192 }[o.preset] || 128;
        return { args: [...BASE, "-i", input, "-map", "0:a:0?", ...audioCodecArgs(outExt, { kbps, encoders }), output], expectedMs: dur };
      }
      const preset = { small: { crf: 30, maxH: 720 }, medium: { crf: 26, maxH: 1080 }, high: { crf: 22, maxH: null } }[o.preset] || { crf: 26, maxH: 1080 };
      const maxH = o.maxHeight != null ? Number(o.maxHeight) || null : preset.maxH;
      let bitrateKbps = null;
      let audioKbps = 128;
      if (Number(o.targetMB) > 0 && dur) {
        const totalKbps = (Number(o.targetMB) * 8 * 1024 * 1024) / (dur / 1000) / 1000;
        audioKbps = totalKbps < 600 ? 64 : 128;
        bitrateKbps = Math.max(120, Math.floor(totalKbps * 0.96 - audioKbps));
      }
      const vf = maxH ? ["-vf", `scale=-2:'min(${even(maxH)},ih)':flags=bicubic`] : [];
      return { args: [...BASE, "-i", input, ...map, ...vf, ...videoTargetArgs(outExt, { encoder, crf: preset.crf, bitrateKbps, height: maxH || probe.height, audioKbps }), output], expectedMs: dur };
    }
    case "speed": {
      const f = Math.min(4, Math.max(0.25, Number(o.factor) || 1));
      const expectedMs = dur ? dur / f : null;
      if (!isVideo) return { args: [...BASE, "-i", input, "-map", "0:a:0?", "-filter:a", atempoChain(f), ...audioOnlyEnc(outExt), output], expectedMs };
      const audio = hasAudio && !o.mute ? ["-filter:a", atempoChain(f)] : ["-an"];
      return { args: [...BASE, "-i", input, ...map, "-filter:v", `setpts=PTS/${f}`, ...audio, ...videoTargetArgs(outExt, { encoder, height: probe.height }), output], expectedMs };
    }
    case "mute":
      return { args: [...BASE, "-i", input, "-map", "0:v:0?", "-c:v", "copy", "-an", output], expectedMs: dur };
    case "extractAudio":
      return { args: [...BASE, "-i", input, "-map", "0:a:0", "-vn", ...audioCodecArgs(outExt, { encoders }), output], expectedMs: dur };
    case "normalize": {
      const af = ["-af", "loudnorm=I=-16:TP=-1.5:LRA=11"];
      if (!isVideo) return { args: [...BASE, "-i", input, "-map", "0:a:0?", ...af, ...audioOnlyEnc(outExt), output], expectedMs: dur };
      return { args: [...BASE, "-i", input, ...map, "-c:v", "copy", ...af, ...audioForContainer(outExt), output], expectedMs: dur };
    }
    case "resize": {
      const h = even(o.height || 720);
      return { args: [...BASE, "-i", input, ...map, "-vf", `scale=-2:${h}:flags=bicubic`, ...videoTargetArgs(outExt, { encoder, height: h }), output], expectedMs: dur };
    }
    case "cropAspect":
      return { args: [...BASE, "-i", input, ...map, "-vf", cropAspectFilter(o.aspect || "1:1"), ...videoTargetArgs(outExt, { encoder, height: probe.height }), output], expectedMs: dur };
    case "rotate": {
      const vf = ROTATE_FILTERS[o.direction] || ROTATE_FILTERS.cw;
      return { args: [...BASE, "-i", input, ...map, "-vf", vf, ...videoCodecArgs(encoder, { height: probe.height }), ...(hasAudio ? ["-c:a", "copy"] : []), ...(outExt === "mp4" || outExt === "mov" ? ["-movflags", "+faststart"] : []), output], expectedMs: dur };
    }
    case "gif": {
      const r = range();
      return { args: [...BASE, ...(r.start ? ["-ss", sec(r.start)] : []), ...(r.end ? ["-t", sec(r.end - r.start)] : []), "-i", input, "-vf", gifFilter(o), "-loop", "0", "-an", output], expectedMs: r.ms };
    }
    case "snapshot": {
      if (Number(o.everySec) > 0) {
        const every = Math.max(0.2, Number(o.everySec));
        return { args: [...BASE, "-i", input, "-map", "0:v:0", "-vf", `fps=1/${every}`, "-q:v", "2", output], expectedMs: dur };
      }
      return { args: [...BASE, "-ss", sec(o.timeMs || 0), "-i", input, "-map", "0:v:0", "-frames:v", "1", "-q:v", "2", output], expectedMs: null };
    }
    case "split": {
      const every = Math.max(1, Number(o.everySec) || 60);
      return { args: [...BASE, "-i", input, "-map", "0:v?", "-map", "0:a?", "-c", "copy", "-f", "segment", "-segment_time", String(every), "-reset_timestamps", "1", output], expectedMs: dur };
    }
    default:
      throw new Error(`Bilinmeyen işlem: ${op}`);
  }
}

/**
 * Birleştirme: farklı boyut / kare hızı / ses düzeni olan dosyalar tek akışa
 * getirilir (ilk videonun boyutuna sığdırma + kenar boşluğu, 30 kare, 48 kHz
 * stereo). Sesi olmayan parçaya sessizlik eklenir.
 * probes: [{ durationMs, width, height, hasAudio }]
 */
function buildJoinArgs({ inputs, probes = [], output, kind = "video", outExt = "mp4", encoders = {}, platform = process.platform }) {
  if (!Array.isArray(inputs) || inputs.length < 2) throw new Error("Birleştirmek için en az iki dosya seçin.");
  const n = inputs.length;
  const ins = inputs.flatMap((p) => ["-i", p]);
  const total = probes.reduce((s, p) => s + (Number(p?.durationMs) || 0), 0) || null;
  if (kind === "audio") {
    const chains = inputs.map((_, i) => `[${i}:a:0]aresample=48000,aformat=channel_layouts=stereo[a${i}]`);
    const graph = `${chains.join(";")};${inputs.map((_, i) => `[a${i}]`).join("")}concat=n=${n}:v=0:a=1[aout]`;
    return { args: [...BASE, ...ins, "-filter_complex", graph, "-map", "[aout]", ...audioCodecArgs(outExt, { encoders }), output], expectedMs: total };
  }
  const first = probes.find((p) => p?.width && p?.height) || { width: 1280, height: 720 };
  const W = even(first.width);
  const H = even(first.height);
  const parts = [];
  inputs.forEach((_, i) => {
    parts.push(`[${i}:v:0]scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p[v${i}]`);
    const p = probes[i] || {};
    if (p.hasAudio === false) parts.push(`anullsrc=r=48000:cl=stereo,atrim=duration=${sec(p.durationMs || 1000)}[a${i}]`);
    else parts.push(`[${i}:a:0]aresample=48000,aformat=channel_layouts=stereo[a${i}]`);
  });
  const graph = `${parts.join(";")};${inputs.map((_, i) => `[v${i}][a${i}]`).join("")}concat=n=${n}:v=1:a=1[vout][aout]`;
  return { args: [...BASE, ...ins, "-filter_complex", graph, "-map", "[vout]", "-map", "[aout]", ...videoTargetArgs(outExt, { encoder: pickVideoEncoder(encoders, platform), height: H }), output], expectedMs: total };
}

/** Görsel biçim dönüştürme (tarayıcının çözemediği / yazamadığı biçimler: TIFF, BMP, GIF, HEIC girdisi). */
function buildImageConvertArgs({ input, output, outExt }) {
  const extra = outExt === "jpg" || outExt === "jpeg" ? ["-q:v", "2"] : outExt === "webp" ? ["-quality", "90"] : [];
  return { args: [...BASE, "-i", input, "-frames:v", "1", ...extra, output], expectedMs: null };
}

/** -progress çıktısını okur: { outMs, done } (bilinmeyen satırlar yok sayılır). */
function parseProgress(text) {
  let outMs = null;
  let done = false;
  for (const line of String(text || "").split(/\r?\n/)) {
    const i = line.indexOf("=");
    if (i < 0) continue;
    const key = line.slice(0, i).trim();
    const value = line.slice(i + 1).trim();
    if ((key === "out_time_us" || key === "out_time_ms") && /^\d+$/.test(value)) outMs = Math.round(Number(value) / 1000);
    else if (key === "progress" && value === "end") done = true;
  }
  return { outMs, done };
}

/** ffmpeg -encoders çıktısından kodlayıcı adları. */
function parseEncoders(text) {
  const out = {};
  for (const line of String(text || "").split(/\r?\n/)) {
    const m = line.match(/^\s*[VAS][F.][S.][X.][B.][D.]\s+(\S+)/);
    if (m) out[m[1]] = true;
  }
  return out;
}

module.exports = {
  BASE, pickVideoEncoder, bitrateFor, videoCodecArgs, audioCodecArgs, videoTargetArgs, audioForContainer, atempoChain,
  parseAspect, cropAspectFilter, gifFilter, buildMediaArgs, buildJoinArgs, buildImageConvertArgs, parseProgress, parseEncoders, VIDEO_TARGETS, AUDIO_TARGETS,
};
