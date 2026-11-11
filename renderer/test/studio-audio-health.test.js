// Ses sağlığı (2.30.1): program sesi aynı bağlamdan alınır; sağlık özeti kullanıcıya doğru notu verir.
import { describe, expect, it } from "vitest";
import { audioHealthSummary, encoderAudioHealth, programTapFor, registerProgramTap, reportEncoderAudio } from "../src/views/studio/audio/programTap";
import { healthReport } from "../src/views/studio/audio/AudioHealth";

const okMixer = { sampleRate: 48000, state: "running", baseLatencyMs: 10, outputLatencyMs: 20, clipEvents: 0, clipping: false, limiter: true };

describe("program sesi: karıştırıcı bağlamından doğrudan alma", () => {
  it("kayıtlı iz → aynı bağlam ve düğüm; worklet modülü bağlama bir kez eklenir; kapalı bağlam → yok", async () => {
    let adds = 0;
    const ctx = { state: "running", audioWorklet: { addModule: () => { adds += 1; return Promise.resolve(); } } };
    const node = {};
    const track = {};
    registerProgramTap(track, { ctx, node });
    const tap = programTapFor(track);
    expect(tap.ctx).toBe(ctx);
    expect(tap.node).toBe(node);
    await tap.addModule("x.js");
    await programTapFor(track).addModule("x.js");
    expect(adds).toBe(1);
    expect(programTapFor({})).toBe(null);
    ctx.state = "closed";
    expect(programTapFor(track)).toBe(null);
  });
});

describe("ses sağlığı özeti", () => {
  it("sorunsuz → İyi", () => {
    expect(audioHealthSummary(okMixer, { path: "worker", gaps: 0, gapMs: 0, dropped: 0, resyncs: 0 })).toEqual({ level: "ok", notes: ["Sorun görünmüyor."] });
  });
  it("tavana dayanma → Sorun; boşluk / yeniden eşleme / eski yol → Dikkat; olağan dışı hız → 48 kHz önerisi", () => {
    expect(audioHealthSummary({ ...okMixer, clipping: true }, null).level).toBe("bad");
    const w = audioHealthSummary({ ...okMixer, sampleRate: 96000 }, { path: "track", gaps: 2, gapMs: 80, dropped: 0, resyncs: 1 });
    expect(w.level).toBe("warn");
    expect(w.notes.join(" ")).toMatch(/48 kHz/);
    expect(w.notes.join(" ")).toMatch(/2 boşluk \(80 ms\)/);
    expect(w.notes.join(" ")).toMatch(/eski yoldan/);
    expect(audioHealthSummary(okMixer, { path: "worker", gaps: 0, gapMs: 0, dropped: 3, resyncs: 0 }).level).toBe("bad");
  });
  it("kopyalanabilir rapor: hız, kodlama yolu ve sayaçlar", () => {
    reportEncoderAudio({ path: "worker", sameContext: true, sampleRate: 44100, blocks: 500, gaps: 0, gapMs: 0, dropped: 0, queueMax: 2, resyncs: 0, slewMs: 1.5, errMs: 0.2 });
    const r = healthReport(okMixer, encoderAudioHealth());
    expect(r.text).toMatch(/Ses motoru: 48 kHz · running/);
    expect(r.text).toMatch(/ses işçisi · aynı bağlam · 44.1 kHz/);
    expect(r.text).toMatch(/düzeltme 1.5 ms/);
  });
});
