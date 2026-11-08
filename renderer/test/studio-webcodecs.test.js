// Tek kodlama (WebCodecs) yolu: Matroska yazıcısı, kare ızgarası, kalite önerisi
// ve GERÇEK ffmpeg ile uçtan uca: H.264 (avcC) + Opus paketleri → mkvmux →
// ffmpeg kopya komutu (ffmpeg.js buildCopyStreamArgs) → tee [aktarıcı TS | halka | yerel MKV].
// ffmpeg / libx264 / libopus yoksa uçtan uca test atlanır.
import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createMkvMuxer, opusHead, vint, avcCInfo, sameBytes } from "../src/lib/studio/mkvmux";
import { audioCaptureMs, audioGapMs, avcCodecString, avcLevelIdc, choosePipeline, createAudioClock, createAudioTimeline, createCaptureClock, createFrameClock, createKeyframePlanner, normalizePipeline, videoEncoderCandidates } from "../src/lib/studio/encodepath";
import { STREAM_QUALITY_PRESETS, qualityPresetKey, recommendQuality } from "../src/lib/studio/broadcast";
import { normalizeSettings } from "../src/views/studio/settings/settings";

const require = createRequire(import.meta.url);

describe("mkvmux: EBML", () => {
  it("vint en kısa biçim; tümü-bir değer kaçınılır", () => {
    expect([...vint(1)]).toEqual([0x81]);
    expect([...vint(126)]).toEqual([0xfe]);
    expect([...vint(127)]).toEqual([0x40, 0x7f]); // 0xFF "bilinmiyor" olurdu
    expect([...vint(300)]).toEqual([0x41, 0x2c]);
  });
  it("OpusHead 19 bayt, sürüm 1, kanal, örnekleme hızı (LE)", () => {
    const h = opusHead({ channels: 2, inputSampleRate: 44100, preSkip: 312 });
    expect(new TextDecoder().decode(h.subarray(0, 8))).toBe("OpusHead");
    expect(h[8]).toBe(1);
    expect(h[9]).toBe(2);
    expect(new DataView(h.buffer).getUint16(10, true)).toBe(312);
    expect(new DataView(h.buffer).getUint32(12, true)).toBe(44100);
  });
  it("başlık EBML ile başlar (motorun başlık denetimi); anahtar karede yeni küme; ses negatif göreli zamanla aynı kümede", () => {
    const m = createMkvMuxer({ video: { width: 1280, height: 720, codecPrivate: Uint8Array.of(1, 0x64, 0, 0x29, 0xff, 0xe0, 0) }, audio: { sampleRate: 48000, channels: 2 } });
    const head = m.header();
    expect([...head.subarray(0, 4)]).toEqual([0x1a, 0x45, 0xdf, 0xa3]);
    const k = m.block(1, 1000, true, Uint8Array.of(0, 0, 0, 1, 0x65));
    expect([...k.subarray(0, 4)]).toEqual([0x1f, 0x43, 0xb6, 0x75]); // Cluster
    expect(m.clusterStart()).toBe(1000);
    const a = m.block(2, 990, true, Uint8Array.of(1, 2, 3));
    expect([...a.subarray(0, 1)]).toEqual([0xa3]); // yeni küme yok
    expect(new DataView(a.buffer, a.byteOffset).getInt16(3)).toBe(-10);
    const p = m.block(1, 1033, false, Uint8Array.of(0, 0, 0, 1, 0x41));
    expect(p[0]).toBe(0xa3);
    expect(m.block(1, 1066, true, Uint8Array.of(0, 0, 0, 1, 0x65))[0]).toBe(0x1f);
    expect(m.block(2, 7000, true, Uint8Array.of(1))[0]).toBe(0x1f); // 5 sn'den uzun küme bölünür
  });
  it("avcC bilgisi ve karşılaştırma", () => {
    expect(avcCInfo(Uint8Array.of(1, 0x64, 0, 0x2a, 0xff))).toEqual({ profile: 0x64, compat: 0, level: 0x2a });
    expect(avcCInfo(Uint8Array.of(0, 1))).toBeNull();
    expect(sameBytes(Uint8Array.of(1, 2), Uint8Array.of(1, 2))).toBe(true);
    expect(sameBytes(Uint8Array.of(1, 2), Uint8Array.of(1, 3))).toBe(false);
  });
});

describe("kodlama yolu yardımcıları", () => {
  it("H.264 kodek dizesi: High profil, düzey çözünürlük / fps'e göre (en az 4.1)", () => {
    expect(avcCodecString(1920, 1080, 30)).toBe("avc1.640029");
    expect(avcCodecString(1920, 1080, 60)).toBe("avc1.64002A");
    expect(avcCodecString(1280, 720, 60)).toBe("avc1.640029");
    expect(avcCodecString(1280, 720, 30, "baseline")).toBe("avc1.42e029");
    expect(avcLevelIdc(2560, 1440, 30)).toBe(51);
  });
  it("yapılandırma adayları: önce donanım + CBR + quality; yazılım yalnız izinle", () => {
    const hw = videoEncoderCandidates({ width: 1920, height: 1080, fps: 30, videoBitrateKbps: 6000 });
    expect(hw[0]).toMatchObject({ hardwareAcceleration: "prefer-hardware", bitrateMode: "constant", latencyMode: "quality", bitrate: 6_000_000, framerate: 30, avc: { format: "avc" } });
    expect(hw.every((c) => c.hardwareAcceleration === "prefer-hardware")).toBe(true);
    const sw = videoEncoderCandidates({ width: 1280, height: 720, fps: 30, videoBitrateKbps: 3000, allowSoftware: true });
    expect(sw.some((c) => c.hardwareAcceleration === "no-preference")).toBe(true);
  });
  it("seçim: otomatik yalnız donanımda tek kodlama; açık seçim yazılımı da kullanır; destek yoksa eski", () => {
    expect(choosePipeline("auto", { webcodecs: true, hardware: true })).toBe("webcodecs");
    expect(choosePipeline("auto", { webcodecs: true, hardware: false })).toBe("legacy");
    expect(choosePipeline("webcodecs", { webcodecs: true, hardware: false })).toBe("webcodecs");
    expect(choosePipeline("webcodecs", { webcodecs: false })).toBe("legacy");
    expect(choosePipeline("legacy", { webcodecs: true, hardware: true })).toBe("legacy");
    expect(normalizePipeline("x")).toBe("auto");
  });
  it("ayarlar: kodlama yolu varsayılan otomatik, bilinmeyen değer otomatiğe döner", () => {
    expect(normalizeSettings({}).stream.pipeline).toBe("auto");
    expect(normalizeSettings({ stream: { pipeline: "legacy" } }).stream.pipeline).toBe("legacy");
    expect(normalizeSettings({ stream: { pipeline: "nope" } }).stream.pipeline).toBe("auto");
  });
  it("kare ızgarası: titreşimde ardışık, hızlı çizimde atlar, takılmada boşluk; zaman damgası tam CFR", () => {
    const c = createFrameClock(30, 0);
    const out = [];
    for (const t of [0, 34, 66, 101, 133, 145, 166, 200]) out.push(c.next(t)?.idx ?? null);
    expect(out).toEqual([0, 1, 2, 3, 4, null, 5, 6]);
    const late = c.next(500); // ~15. kare: 300 ms takılma
    expect(late.idx).toBe(15);
    expect(late.tsUs).toBe(500000);
    expect(c.stats().gaps).toBe(8);
    // 60 Hz çizim, 30 fps çıkış: her ikinci kare.
    const d = createFrameClock(30, 0);
    const got = [];
    for (let i = 0; i < 12; i += 1) { const r = d.next(i * 16.67); if (r) got.push(r.idx); }
    expect(got).toEqual([0, 1, 2, 3, 4, 5, 6]); // 0–183 ms: 6,5 kare süresi
  });
  it("anahtar kare: 2 sn'de bir; atlanan anahtar kare sonraki kareye kalır", () => {
    const k = createKeyframePlanner(30, 2);
    expect(k.due(0)).toBe(true);
    expect(k.due(1)).toBe(false);
    expect(k.due(59)).toBe(false);
    expect(k.due(60)).toBe(true);
    expect(k.due(61)).toBe(false);
    k.force();
    expect(k.due(62)).toBe(true);
    expect(k.due(125)).toBe(true); // 120 atlandı
  });
  it("ses saati: örnek sayısından; duvar saatinden 80 ms'den çok kayarsa yeniden hizalanır", () => {
    const a = createAudioClock(48000);
    expect(a.push(480, 100)).toBe(100);
    expect(a.push(480, 110)).toBeCloseTo(110, 5);
    let ts = 0;
    for (let i = 0; i < 200; i += 1) ts = a.push(480, 120 + i * 10 + 300); // duvar saati 300 ms ileride
    expect(a.stats().resyncs).toBeGreaterThan(0);
    expect(Math.abs(ts - (120 + 199 * 10 + 300))).toBeLessThan(100);
  });
});

describe("yayın kalitesi", () => {
  it("hızlı ayarlar: Akıcı 720p60, Dengeli 1080p30, Yüksek 1080p60", () => {
    expect(STREAM_QUALITY_PRESETS.map((p) => `${p.key}:${p.resolution}${p.fps}@${p.bitrateKbps}`)).toEqual(["smooth:720p60@4500", "balanced:1080p30@6000", "high:1080p60@9000", "ultra:1080p60@12000", "qhd:1440p60@18000"]);
    expect(qualityPresetKey({ resolution: "1080p", fps: 30, bitrateKbps: 6000 })).toBe("balanced");
    expect(qualityPresetKey({ resolution: "1080p", fps: 30, bitrateKbps: 5000 })).toBeNull();
  });
  it("ağ önerisi: sorun yoksa yok; atlama / düşük gönderimde bağlantıya sığan ayar", () => {
    expect(recommendQuality({ network: { state: "up", sentKbps: 9100, dropEvents: 0 }, targetKbps: 9000 })).toBeNull();
    expect(recommendQuality({ network: null, targetKbps: 9000 })).toBeNull();
    const r = recommendQuality({ network: { state: "up", sentKbps: 8500, dropEvents: 2 }, targetKbps: 9000 });
    expect(r.key).toBe("balanced"); // (6000+128)×1,3 ≈ 7966 ≤ 8500
    const low = recommendQuality({ network: { state: "up", sentKbps: 3000, dropping: true }, targetKbps: 6000 });
    expect(low.key).toBe("smooth");
    expect(low.bitrateKbps).toBeLessThan(2300);
    expect(low.reason).toMatch(/yetişemiyor/);
    const behind = recommendQuality({ network: { state: "up", sentKbps: 4000, dropEvents: 0 }, targetKbps: 6000 });
    expect(behind.reason).toMatch(/hedefin altında/);
  });
});

/* -------------------------- gerçek ffmpeg: uçtan uca -------------------------- */

const ff = require("../../app/studio/ffmpeg.js");
const FFMPEG = process.env.ELITLIG_FFMPEG || "ffmpeg";
const FFPROBE = process.env.ELITLIG_FFPROBE || "ffprobe";
const hasTool = (bin, args, want) => { try { const r = spawnSync(bin, args, { encoding: "utf8" }); return r.status === 0 && (!want || want.test(r.stdout)); } catch { return false; } };
const canRun = hasTool(FFMPEG, ["-hide_banner", "-encoders"], /libx264[\s\S]*|libopus/) && hasTool(FFMPEG, ["-hide_banner", "-encoders"], /libopus/) && hasTool(FFPROBE, ["-version"]);

/** Annex B → erişim birimleri (AUD ile ayrılmış): [{ nals: [Uint8Array], key }]. */
function annexbAccessUnits(buf) {
  const nals = [];
  let i = 0;
  const starts = [];
  while (i + 3 < buf.length) {
    if (buf[i] === 0 && buf[i + 1] === 0 && (buf[i + 2] === 1 || (buf[i + 2] === 0 && buf[i + 3] === 1))) {
      const len = buf[i + 2] === 1 ? 3 : 4;
      starts.push([i, i + len]);
      i += len;
    } else i += 1;
  }
  for (let s = 0; s < starts.length; s += 1) nals.push(buf.subarray(starts[s][1], s + 1 < starts.length ? starts[s + 1][0] : buf.length));
  const aus = [];
  let sps = null;
  let pps = null;
  let cur = null;
  for (const n of nals) {
    const type = n[0] & 0x1f;
    if (type === 9) { cur = { nals: [], key: false }; aus.push(cur); continue; }
    if (type === 7) { sps ||= n; continue; }
    if (type === 8) { pps ||= n; continue; }
    if (!cur) { cur = { nals: [], key: false }; aus.push(cur); }
    if (type === 5) cur.key = true;
    cur.nals.push(n);
  }
  return { aus: aus.filter((a) => a.nals.length), sps, pps };
}
const avcCOf = (sps, pps) => Uint8Array.from([1, sps[1], sps[2], sps[3], 0xff, 0xe1, sps.length >> 8, sps.length & 0xff, ...sps, 1, pps.length >> 8, pps.length & 0xff, ...pps]);
const lengthPrefixed = (nals) => {
  const out = new Uint8Array(nals.reduce((t, n) => t + 4 + n.length, 0));
  let o = 0;
  for (const n of nals) { new DataView(out.buffer).setUint32(o, n.length); out.set(n, o + 4); o += 4 + n.length; }
  return out;
};
/** Ogg Opus → paketler (OpusHead, OpusTags, ses …). */
function oggPackets(buf) {
  const packets = [];
  let acc = [];
  let o = 0;
  while (o + 27 <= buf.length && buf.toString("latin1", o, o + 4) === "OggS") {
    const segs = buf[o + 26];
    const table = buf.subarray(o + 27, o + 27 + segs);
    let p = o + 27 + segs;
    for (const len of table) {
      acc.push(buf.subarray(p, p + len));
      p += len;
      if (len < 255) { packets.push(Buffer.concat(acc)); acc = []; }
    }
    o = p;
  }
  return packets;
}

describe.skipIf(!canRun)("uçtan uca (gerçek ffmpeg): mkvmux → ffmpeg -c:v copy → tee", () => {
  it("görüntü yeniden kodlanmaz (paket boyutları aynı), CFR zaman damgaları korunur, ses AAC; aktarıcı TS / halka / yerel MKV çözülür", { timeout: 60000 }, () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "studio-wc-"));
    const fps = 30;
    const seconds = 6;
    const h264 = spawnSync(FFMPEG, ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", `testsrc2=size=640x360:rate=${fps}`, "-t", String(seconds), "-c:v", "libx264", "-preset", "veryfast", "-profile:v", "high", "-bf", "0", "-g", String(fps * 2), "-keyint_min", String(fps * 2), "-x264-params", "aud=1", "-pix_fmt", "yuv420p", "-f", "h264", "pipe:1"], { maxBuffer: 64 << 20 });
    expect(h264.status).toBe(0);
    const opus = spawnSync(FFMPEG, ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000", "-ac", "2", "-t", String(seconds), "-c:a", "libopus", "-b:a", "128k", "-frame_duration", "20", "-f", "ogg", "pipe:1"], { maxBuffer: 64 << 20 });
    expect(opus.status).toBe(0);
    const { aus, sps, pps } = annexbAccessUnits(h264.stdout);
    const apk = oggPackets(opus.stdout);
    expect(aus.length).toBe(fps * seconds);
    expect(new TextDecoder().decode(apk[0].subarray(0, 8))).toBe("OpusHead");
    const audio = apk.slice(2);

    // Tarayıcıdaki gibi: video ve ses paketleri zaman sırasıyla, 50 ms'lik demetler.
    const m = createMkvMuxer({ video: { width: 640, height: 360, codecPrivate: avcCOf(sps, pps), fps }, audio: { sampleRate: 48000, channels: 2, codecPrivate: apk[0] } });
    const parts = [m.header()];
    const events = [
      ...aus.map((a, i) => ({ t: (i * 1000) / fps, kind: "v", a })),
      ...audio.map((p, i) => ({ t: i * 20, kind: "a", p })),
    ].sort((x, y) => x.t - y.t || (x.kind === "v" ? -1 : 1));
    const sizes = [];
    for (const e of events) {
      if (e.kind === "v") {
        const data = lengthPrefixed(e.a.nals);
        sizes.push(e.a.nals.reduce((t, n) => t + n.length, 0));
        parts.push(m.block(1, e.t, e.a.key, data));
      } else parts.push(m.block(2, e.t, true, e.p));
    }
    const mkv = Buffer.concat(parts.map((p) => Buffer.from(p.buffer, p.byteOffset, p.byteLength)));
    expect([...mkv.subarray(0, 4)]).toEqual([0x1a, 0x45, 0xdf, 0xa3]);

    // ffmpeg: motorun kopya komutu; aktarıcı yerine dosyaya MPEG-TS.
    const relayFile = path.join(dir, "relay.ts");
    const localFile = path.join(dir, "local.mkv");
    const args = ff.buildStreamArgs({ url: null, relayUrl: relayFile, width: 640, height: 360, fps, videoBitrateKbps: 1000, audioBitrateKbps: 128, encoder: "libx264", videoCopy: true, localFile, listFile: "list.csv", segmentSeconds: 2 });
    expect(args).toContain("copy");
    expect(args.join(" ")).not.toMatch(/libx264|-vf /);
    const run = spawnSync(FFMPEG, args, { cwd: dir, input: mkv, maxBuffer: 64 << 20, encoding: "buffer" });
    expect(run.status, String(run.stderr)).toBe(0);

    const probe = (file, extra) => JSON.parse(spawnSync(FFPROBE, ["-v", "error", "-of", "json", ...extra, file], { encoding: "utf8", maxBuffer: 64 << 20 }).stdout);
    const vpk = probe(relayFile, ["-select_streams", "v:0", "-show_entries", "packet=pts_time,size,flags"]).packets;
    expect(vpk.length).toBe(fps * seconds);
    // Kopya: H.264 yük boyutu aynı (Annex B'ye çevrilince her NAL'a başlangıç kodu eklenir; boyut ±başlık).
    const extra = vpk.map((p, i) => Number(p.size) - sizes[i]);
    expect(extra.every((x) => x >= 0 && x <= 128)).toBe(true);
    // CFR: ardışık PTS farkı 33–34 ms (ms ölçeği), boşluk yok.
    const pts = vpk.map((p) => Number(p.pts_time));
    const deltas = pts.slice(1).map((t, i) => Math.round((t - pts[i]) * 1000));
    expect(Math.min(...deltas)).toBeGreaterThanOrEqual(33);
    expect(Math.max(...deltas)).toBeLessThanOrEqual(34);
    expect(vpk.filter((p) => String(p.flags).startsWith("K")).length).toBe(seconds / 2);
    const streams = probe(relayFile, ["-show_entries", "stream=codec_name,profile,width,height"]).streams;
    expect(streams.map((s) => s.codec_name).sort()).toEqual(["aac", "h264"]);
    expect(streams.find((s) => s.codec_name === "h264").profile).toBe("High");
    // Halka: 2 sn'lik parçalar anahtar karede; yerel MKV ve TS hatasız çözülür.
    const list = fs.readFileSync(path.join(dir, "list.csv"), "utf8").trim().split("\n");
    expect(list.length).toBe(3);
    for (const f of [relayFile, localFile, path.join(dir, "seg00001.ts")]) {
      const dec = spawnSync(FFMPEG, ["-v", "error", "-i", f, "-f", "null", "-"], { encoding: "utf8" });
      expect(dec.status, f).toBe(0);
      expect(dec.stderr.trim(), f).toBe("");
    }
    // FLV (RTMP aktarıcısının yaptığı -c copy) hatasız.
    const flv = path.join(dir, "out.flv");
    const remux = spawnSync(FFMPEG, ff.buildRelayArgs({ url: flv }).map((a) => (a === "pipe:0" ? relayFile : a)), { encoding: "utf8" });
    expect(remux.status, remux.stderr).toBe(0);
    expect(probe(flv, ["-show_entries", "stream=codec_name"]).streams.map((s) => s.codec_name).sort()).toEqual(["aac", "h264"]);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});


/* ---- 2.20.1: gol anında ses blokları atılınca yayın çıkışının durması (ölçüldü; bkz. encodepath) ---- */

/**
 * Chromium AudioEncoder (Opus) gibi: 10 ms'lik giriş blokları (bazıları atılmış), çıkış 20 ms'lik
 * paketler; çıkış zaman damgası ilk girişten bu yana kodlanan ÖRNEK SAYISIDIR (boşlukları bilmez).
 * dropped(t): t ms'deki blok atıldı mı. → { oldTs: [], newTs: [] } (ms; eski eşleme / yeni zaman çizelgesi)
 */
function simulateAudioDrops({ seconds, dropped }) {
  const timeline = createAudioTimeline();
  let encodedUs = 0;
  for (let t = 0; t < seconds * 1000; t += 10) {
    if (dropped(t)) continue;
    timeline.input(10_000, t);
    encodedUs += 10_000;
  }
  const n = Math.floor(encodedUs / 20_000);
  const oldTs = [];
  const newTs = [];
  for (let i = 0; i < n; i += 1) {
    oldTs.push(i * 20); // eski: chunk.timestamp (örnek sayısı) + sabit ofset
    newTs.push(timeline.output(20_000));
  }
  return { oldTs, newTs };
}
const goalDrop = (t) => t >= 3000 && t < 6000 && (t / 10) % 5 !== 0; // 3–6 sn: blokların %80'i atılır (GOL akışında ölçülen oran)

describe("ses zaman çizelgesi (2.20.1)", () => {
  it("atılan bloklar ses zamanını GERİDE BIRAKMAZ: her paket kendi giriş bloğunun zamanını alır (eski eşleme atılan süre kadar geride kalıyordu)", () => {
    const { oldTs, newTs } = simulateAudioDrops({ seconds: 10, dropped: goalDrop });
    expect(newTs.at(-1)).toBeGreaterThan(9900); // son paket ≈ 9,98 sn
    expect(oldTs.at(-1)).toBeLessThan(7700); // eski: ~2,4 sn geride
    for (let i = 1; i < newTs.length; i += 1) expect(newTs[i]).toBeGreaterThan(newTs[i - 1]);
    const gaps = newTs.slice(1).map((t, i) => t - newTs[i]).filter((d) => d > 25);
    expect(gaps.length).toBeGreaterThan(0); // boşluk yalnız atılan bölgede (ffmpeg aresample doldurur)
    expect(newTs.filter((t) => t < 2990 || t >= 6000).every((t) => Math.abs(t - Math.round(t / 10) * 10) < 0.01)).toBe(true);
  });
  it("yakalama zamanı: AudioData.timestamp performance.now() tabanındaysa o kullanılır (okuma gecikmesi saati itmez); değilse okuma anı − blok süresi", () => {
    expect(audioCaptureMs({ dataTsUs: 105_000_000, nowMs: 107_500, t0Ms: 100_000, durMs: 10 })).toBe(5000); // 2,5 sn geç okundu
    expect(audioCaptureMs({ dataTsUs: 5_000, nowMs: 107_500, t0Ms: 100_000, durMs: 10 })).toBe(7490);
    expect(audioGapMs(null, 100)).toBe(0);
    expect(audioGapMs(100, 110)).toBe(0);
    expect(audioGapMs(100, 400)).toBe(300);
  });
  it("ses saati ofseti: ulaşma gecikmesinin titreşimi süzülür (en küçük), saat durup sürerse (aygıt) yeni ofsete geçilir", () => {
    const c = createCaptureClock({ windowMs: 2000, jumpMs: 250, holdMs: 500 });
    let off = 0;
    for (let i = 0; i < 100; i += 1) off = c.push(i * 20, 1000 + i * 20 + (i % 7) * 3); // 0–18 ms titreşim
    expect(off).toBe(1000);
    for (let i = 100; i < 160; i += 1) off = c.push(i * 20, 4000 + i * 20); // bağlam 3 sn durdu
    expect(off).toBe(4000);
  });
});

describe.skipIf(!canRun)("uçtan uca (gerçek ffmpeg): GOL anında ses atılınca çıkış", () => {
  it("eski eşlemede ffmpeg çıkışında ses görüntünün ~2,4 sn gerisinde kalır (harmanlama canlı yayını bu kadar bekletir); zaman çizelgesiyle hizalı", { timeout: 60000 }, () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "studio-wc-drop-"));
    const fps = 30;
    const seconds = 10;
    const h264 = spawnSync(FFMPEG, ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", `testsrc2=size=320x180:rate=${fps}`, "-t", String(seconds), "-c:v", "libx264", "-preset", "ultrafast", "-profile:v", "high", "-bf", "0", "-g", String(fps * 2), "-keyint_min", String(fps * 2), "-x264-params", "aud=1", "-pix_fmt", "yuv420p", "-f", "h264", "pipe:1"], { maxBuffer: 64 << 20 });
    expect(h264.status).toBe(0);
    const opus = spawnSync(FFMPEG, ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000", "-ac", "2", "-t", String(seconds), "-c:a", "libopus", "-b:a", "96k", "-frame_duration", "20", "-f", "ogg", "pipe:1"], { maxBuffer: 64 << 20 });
    expect(opus.status).toBe(0);
    const { aus, sps, pps } = annexbAccessUnits(h264.stdout);
    const apk = oggPackets(opus.stdout);
    const sim = simulateAudioDrops({ seconds, dropped: goalDrop });
    const run = (audioTs, name) => {
      const m = createMkvMuxer({ video: { width: 320, height: 180, codecPrivate: avcCOf(sps, pps), fps }, audio: { sampleRate: 48000, channels: 2, codecPrivate: apk[0] } });
      const parts = [m.header()];
      // Varış sırası: paket kodlandığı (yakalandığı) anda yazılır; iki durumda da aynı, yalnız zaman damgası farklı.
      const events = [
        ...aus.map((a, i) => ({ at: (i * 1000) / fps, kind: "v", a, ts: (i * 1000) / fps })),
        ...audioTs.map((ts, i) => ({ at: sim.newTs[i], kind: "a", p: apk[2 + (i % (apk.length - 2))], ts })),
      ].sort((x, y) => x.at - y.at || (x.kind === "v" ? -1 : 1));
      for (const e of events) parts.push(e.kind === "v" ? m.block(1, e.ts, e.a.key, lengthPrefixed(e.a.nals)) : m.block(2, e.ts, true, e.p));
      const mkv = Buffer.concat(parts.map((p) => Buffer.from(p.buffer, p.byteOffset, p.byteLength)));
      const relayFile = path.join(dir, `${name}.ts`);
      const args = ff.buildStreamArgs({ url: null, relayUrl: relayFile, width: 320, height: 180, fps, videoBitrateKbps: 800, audioBitrateKbps: 128, encoder: "libx264", videoCopy: true, listFile: `${name}.csv`, segmentSeconds: 2 });
      const r = spawnSync(FFMPEG, args, { cwd: dir, input: mkv, maxBuffer: 64 << 20, encoding: "buffer" });
      expect(r.status, String(r.stderr)).toBe(0);
      const pk = JSON.parse(spawnSync(FFPROBE, ["-v", "error", "-of", "json", "-show_entries", "packet=stream_index,pts_time", relayFile], { encoding: "utf8", maxBuffer: 64 << 20 }).stdout).packets;
      const last = (idx) => Math.max(...pk.filter((p) => p.stream_index === idx).map((p) => Number(p.pts_time)).filter(Number.isFinite));
      return { lastV: last(0), lastA: last(1) };
    };
    const before = run(sim.oldTs, "old");
    const after = run(sim.newTs, "new");
    expect(before.lastV - before.lastA).toBeGreaterThan(1.5);
    expect(Math.abs(after.lastV - after.lastA)).toBeLessThan(0.3);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
