// Yayın kalitesi: kalite hızlı ayarları (1080p60 12 Mbps, 1440p60), ses bit hızı varsayılanı
// ve göçü, ara Opus yapılandırması, WebCodecs renk uzayı, düşük kesme süzgeci, −14 LUFS dengeleyici.
import { describe, expect, it } from "vitest";
import {
  AUDIO_BITRATE_KBPS, RESOLUTION_CHOICES, STREAM_QUALITY_PRESETS, bitrateAdvice, encodingPreset, heavyPresetWarning,
  maxUsefulBitrate, normalizeEncoding, qualityPresetKey, recommendQuality, recommendedBitrate,
} from "../src/lib/studio/broadcast";
import { encodedColorSpace, intermediateAudioKbps, opusEncoderConfig, videoEncoderCandidates } from "../src/lib/studio/encodepath";
import { normalizeSettings, migrateAudioKbps } from "../src/views/studio/settings/settings";
import { FILTER_PRESETS, HPF_DEFAULT, applyPreset, compactFilters, filtersSummary, resolveFilters } from "../src/lib/studio/audioFilters";
import { HEADROOM_DB, LEVELER, levelerStep, lufsOf, meanSquare, normalizeAudio } from "../src/lib/studio/audio";

describe("kalite hızlı ayarları", () => {
  it("Çok yüksek (1080p60 12 Mbps) ve 1440p60 (18 Mbps) ayarları; 1440p çözünürlüğü", () => {
    const ultra = STREAM_QUALITY_PRESETS.find((p) => p.key === "ultra");
    const qhd = STREAM_QUALITY_PRESETS.find((p) => p.key === "qhd");
    expect(ultra).toMatchObject({ resolution: "1080p", fps: 60, bitrateKbps: 12000, heavy: true });
    expect(qhd).toMatchObject({ resolution: "1440p", fps: 60, bitrateKbps: 18000, heavy: true });
    expect(RESOLUTION_CHOICES.find((r) => r.key === "1440p")).toMatchObject({ width: 2560, height: 1440 });
    expect(encodingPreset({ resolution: "1440p", fps: 60, bitrateKbps: 18000 })).toMatchObject({ width: 2560, height: 1440, fps: 60, videoBitrateKbps: 18000 });
    expect(normalizeEncoding({ resolution: "1440p", fps: 60, bitrateKbps: 18000 }).resolution).toBe("1440p");
    expect(qualityPresetKey({ resolution: "1080p", fps: 60, bitrateKbps: 12000 })).toBe("ultra");
    expect([recommendedBitrate("1440p", 60), recommendedBitrate("1440p", 30), recommendedBitrate("1080p", 60)]).toEqual([18000, 12000, 9000]);
  });

  it("ağır ayarda yükleme uyarısı; gereksiz yüksek bit hızı uyarısı çözünürlüğe göre", () => {
    expect(heavyPresetWarning({ resolution: "1080p", fps: 60, bitrateKbps: 9000 })).toBe(null);
    expect(heavyPresetWarning({ resolution: "1080p", fps: 60, bitrateKbps: 12000 })).toMatch(/≈ 18,3 Mbps kararlı yükleme/);
    expect(heavyPresetWarning({ resolution: "1440p", fps: 60, bitrateKbps: 18000 })).toMatch(/≈ 27,3 Mbps/);
    expect(maxUsefulBitrate("1440p")).toBe(20000);
    expect(bitrateAdvice({ resolution: "1440p", fps: 60, bitrateKbps: 18000 })).toBe(null);
    expect(bitrateAdvice({ resolution: "1080p", fps: 60, bitrateKbps: 15000 })).toBe("YouTube 1080p için 12 Mbps'ın üstü gereksiz; bağlantı zorlanabilir.");
    expect(bitrateAdvice({ resolution: "720p", fps: 60, bitrateKbps: 9000 })).toBe("YouTube 720p için 7,5 Mbps'ın üstü gereksiz; bağlantı zorlanabilir.");
  });

  it("ağ önerisi yalnız bağlantı gerçekten yetmezse (atlama / hedefin altında gönderim)", () => {
    expect(recommendQuality({ network: { state: "up", sentKbps: 12300, dropEvents: 0 }, targetKbps: 12000 })).toBe(null);
    const r = recommendQuality({ network: { state: "up", sentKbps: 9000, dropEvents: 3 }, targetKbps: 18000 });
    expect(r.key).toBe("balanced");
  });
});

describe("ses bit hızı", () => {
  it("varsayılan 192 kbps; eski kayıtlardaki 128 (değiştirilmemiş varsayılan) 192'ye taşınır", () => {
    expect(AUDIO_BITRATE_KBPS).toBe(192);
    expect(normalizeSettings(null).stream.audioKbps).toBe(192);
    expect(normalizeSettings({ v: 2, stream: { audioKbps: 128 } }).stream.audioKbps).toBe(192);
    expect(normalizeSettings({ v: 2, stream: { audioKbps: 160 } }).stream.audioKbps).toBe(160);
    expect(normalizeSettings({ v: 3, stream: { audioKbps: 128 } }).stream.audioKbps).toBe(128);
    expect(normalizeSettings({}).v).toBe(3);
    expect(migrateAudioKbps({})).toBe(undefined);
  });

  it("ara Opus: AAC hedefinin ≈ 1,5 katı (192–384), karmaşıklık 10, müzik kipi", () => {
    expect([128, 160, 192, 256, 320].map(intermediateAudioKbps)).toEqual([192, 256, 288, 384, 384]);
    const c = opusEncoderConfig({ sampleRate: 48000, numberOfChannels: 2, aacKbps: 192 });
    expect(c).toMatchObject({ codec: "opus", sampleRate: 48000, numberOfChannels: 2, bitrate: 288000, opus: { complexity: 10, application: "audio", signal: "music" } });
  });
});

describe("WebCodecs görüntü yapılandırması", () => {
  it("tek katman, contentHint motion; 1440p60 → düzey 5.1", () => {
    const c = videoEncoderCandidates({ width: 2560, height: 1440, fps: 60, videoBitrateKbps: 18000 });
    expect(c[0]).toMatchObject({ contentHint: "motion", bitrate: 18000000, codec: "avc1.640033", bitrateMode: "constant", latencyMode: "quality" });
    expect(c.every((x) => !("scalabilityMode" in x))).toBe(true);
  });

  it("kodlayıcının bildirdiği renk uzayı: yalnız YUV matrisli SDR değerler", () => {
    expect(encodedColorSpace({ primaries: "bt709", transfer: "bt709", matrix: "bt709", fullRange: false })).toEqual({ primaries: "bt709", transfer: "bt709", matrix: "bt709", fullRange: false });
    expect(encodedColorSpace({ primaries: "bt709", transfer: "iec61966-2-1", matrix: "rgb", fullRange: true })).toBe(null);
    expect(encodedColorSpace({ matrix: "smpte170m", transfer: "iec61966-2-1" })).toEqual({ matrix: "smpte170m" });
    expect(encodedColorSpace(null)).toBe(null);
  });
});

describe("düşük kesme süzgeci (yüksek geçiren)", () => {
  it("varsayılan kapalı 80 Hz; spiker ve telefon hazır ayarlarında açık", () => {
    expect(resolveFilters(null).hpf).toEqual({ ...HPF_DEFAULT });
    expect(compactFilters({ hpf: { on: false, freq: 80 } })).toBe(null);
    expect(compactFilters({ hpf: { on: true } })).toEqual({ hpf: { on: true, freq: 80 } });
    expect(resolveFilters({ hpf: { on: true, freq: 5000 } }).hpf.freq).toBe(300);
    expect(resolveFilters(applyPreset(null, "voice")).hpf).toEqual({ on: true, freq: 80 });
    expect(resolveFilters(applyPreset(null, "phone")).hpf).toEqual({ on: true, freq: 100 });
    expect(resolveFilters(applyPreset({ hpf: { on: true, freq: 120 } }, "music")).hpf.on).toBe(false);
    expect(filtersSummary({ hpf: { on: true, freq: 80 }, gate: { on: true } })).toBe("80 Hz kesme · Kapı");
    expect(FILTER_PRESETS.find((p) => p.key === "voice").filters.hpf.on).toBe(true);
  });
});

describe("ses seviyesi dengeleyici (−14 LUFS)", () => {
  const msOf = (lufs) => 10 ** ((lufs + 0.691) / 10) / 2; // iki kanal eşit
  const run = (lufs, seconds, state = null) => {
    let st = state;
    for (let i = 0; i < seconds * 10; i += 1) st = levelerStep(st, [msOf(lufs), msOf(lufs)], 100);
    return st;
  };

  it("BS.1770 toplamı: 0 dBFS tam ölçekli sinüs (ms 0,5) tek kanalda −3,7 LUFS", () => {
    expect(lufsOf([0.5])).toBeCloseTo(-3.70, 1);
    expect(meanSquare(new Float32Array([1, -1, 1, -1]))).toBe(1);
    expect(lufsOf([0, 0])).toBe(-Infinity);
  });

  it("varsayılan kapalı; açılınca normalizeAudio korur", () => {
    expect(normalizeAudio({}).master.loudness).toBe(false);
    expect(normalizeAudio({ master: { loudness: true } }).master.loudness).toBe(true);
  });

  it("alçak program yavaşça yükseltilir (≤ 0,5 dB/sn, en çok +6 dB); çıkış hedefe yaklaşır", () => {
    const one = run(-20, 1);
    expect(one.gainDb).toBeGreaterThan(0);
    expect(one.gainDb).toBeLessThanOrEqual(0.51);
    const st = run(-20, 30);
    // −20 + kazanç + pay (−3) = −14 → kazanç +9 isterdi; sınır +6.
    expect(st.gainDb).toBeCloseTo(LEVELER.maxBoostDb, 5);
    const near = run(-15, 30);
    expect(near.lufs + near.gainDb + HEADROOM_DB).toBeCloseTo(-14, 1);
  });

  it("yüksek program daha hızlı kısılır (≤ 2 dB/sn, en çok −8 dB)", () => {
    const one = run(-2, 1);
    expect(one.gainDb).toBeLessThan(-1);
    expect(one.gainDb).toBeGreaterThanOrEqual(-2.01);
    expect(run(-2, 30).gainDb).toBeCloseTo(-8, 5);
  });

  it("sessizlikte (−45 LUFS altı) kazanç donar: boşlukta uğultu yükseltilmez (pompalama yok)", () => {
    const st = run(-18, 20);
    const g0 = st.gainDb;
    const quiet = run(-60, 20, st);
    expect(quiet.gated).toBe(true);
    expect(quiet.gainDb).toBeCloseTo(g0, 5);
  });
});
