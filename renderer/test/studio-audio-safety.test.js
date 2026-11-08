// Ses patlaması: program çıkış zinciri (pay, sınırlayıcı, güvenlik kırpıcısı), "Sesi düzelt",
// çift aygıt; özet / tekrar klip sesi (kamera açısında program açısının sesi).
import {
  HEADROOM_DB, LIMITER, SAFETY_CEILING_DB, applyCurve, compressorMakeupGain, createProgramChain, dbToGain, duplicateAudioInputs,
  gainToDb, normalizeAudio, patchStrip, safeAudioLevels, softClipCurve,
} from "../src/lib/studio/audio";
import { buildHighlightPlan, clipAudio, musicBedDb, normalizeHighlightMusic } from "../src/lib/studio/highlights";
import { PROGRAM_ANGLE, buildReplayQueue } from "../src/lib/studio/replays";
import { AUDIO_KBPS_CHOICES, HOTKEY_ACTIONS } from "../src/views/studio/settings/settings";

/** Bağlantıları kaydeden sahte AudioContext. */
function fakeCtx() {
  const nodes = [];
  const mk = (type, extra = {}) => {
    const n = { type, out: [], connect(t) { this.out.push(t); return t; }, ...extra };
    nodes.push(n);
    return n;
  };
  const param = (v) => ({ value: v });
  return {
    nodes,
    createGain: () => mk("gain", { gain: param(1) }),
    createDynamicsCompressor: () => mk("comp", { threshold: param(-24), knee: param(30), ratio: param(12), attack: param(0.003), release: param(0.25) }),
    createWaveShaper: () => mk("shaper", { curve: null, oversample: "none" }),
  };
}

/** a'dan b'ye giden tüm yollar (düğüm listeleri). */
function paths(a, b, seen = []) {
  if (a === b) return [[...seen, a]];
  return a.out.flatMap((n) => (seen.includes(n) ? [] : paths(n, b, [...seen, a])));
}

describe("ses: program çıkış zinciri (patlama önlemi)", () => {
  it("sınırlayıcı: eşik −6 dB, diz 0, 20:1, atak 1–3 ms, bırakma 0,1–0,25 sn", () => {
    expect(LIMITER.threshold).toBe(-6);
    expect(LIMITER.knee).toBe(0);
    expect(LIMITER.ratio).toBe(20);
    expect(LIMITER.attack).toBeGreaterThanOrEqual(0.001);
    expect(LIMITER.attack).toBeLessThanOrEqual(0.003);
    expect(LIMITER.release).toBeGreaterThanOrEqual(0.1);
    expect(LIMITER.release).toBeLessThanOrEqual(0.25);
    expect(HEADROOM_DB).toBe(-3);
    expect(SAFETY_CEILING_DB).toBe(-1);
  });
  it("makyaj kazancı (Chromium formülü) telafi edilir: −6 dB / 20:1 → +3,42 dB", () => {
    const m = compressorMakeupGain(LIMITER);
    expect(gainToDb(m)).toBeCloseTo(3.42, 1);
    // 0 dBFS (pay sonrası −3 dBFS) sürekli giriş: sınırlayıcı çıkışı ≈ −5,85 dBFS (makyaj yok).
    const inDb = HEADROOM_DB;
    const compOutDb = LIMITER.threshold + (inDb - LIMITER.threshold) / LIMITER.ratio + gainToDb(m);
    expect(compOutDb - gainToDb(m)).toBeCloseTo(-5.85, 2);
    expect(compressorMakeupGain({ threshold: 0, ratio: 20 })).toBeCloseTo(1, 6);
  });
  it("yumuşak kırpıcı: tavanı asla aşmaz, dizin altında şeffaf, tekdüze, 0 → 0", () => {
    const c = softClipCurve();
    const ceil = dbToGain(SAFETY_CEILING_DB);
    expect(c.length % 2).toBe(1);
    expect(c[(c.length - 1) / 2]).toBe(0);
    for (let i = 1; i < c.length; i += 1) expect(c[i]).toBeGreaterThanOrEqual(c[i - 1]);
    expect(Math.max(...c.map(Math.abs))).toBeLessThan(ceil);
    for (const x of [0.01, 0.1, 0.25, 0.5]) expect(applyCurve(c, x)).toBeCloseTo(x, 3);
    // Eğri dışı (+20 dB'ye kadar) giriş de tavanın altında kalır.
    for (const x of [1, 2, 10, -10]) expect(Math.abs(applyCurve(c, x))).toBeLessThan(ceil);
  });
  it("zincir: pay → (sınırlayıcı → makyaj telafisi | kuru) → GÜVENLİK, her iki yolda da kırpıcı var", () => {
    for (const on of [true, false]) {
      const ctx = fakeCtx();
      const ch = createProgramChain(ctx, { limiter: on });
      expect(ch.headroom.gain.value).toBeCloseTo(dbToGain(-3), 6);
      expect(ch.makeup.gain.value).toBeCloseTo(1 / compressorMakeupGain(LIMITER), 6);
      expect(ch.limiter.threshold.value).toBe(-6);
      expect(ch.limiter.ratio.value).toBe(20);
      expect(ch.limiter.knee.value).toBe(0);
      expect(ch.output).toBe(ch.safety);
      expect(ch.safety.curve).toBeInstanceOf(Float32Array);
      expect(ch.safety.oversample).toBe("4x");
      expect([ch.wet.gain.value, ch.dry.gain.value]).toEqual(on ? [1, 0] : [0, 1]);
      const ps = paths(ch.input, ch.output);
      expect(ps.length).toBe(2); // ıslak + kuru
      for (const p of ps) { expect(p).toContain(ch.headroom); expect(p[p.length - 1]).toBe(ch.safety); }
      expect(ps.some((p) => p.includes(ch.limiter) && p.includes(ch.makeup))).toBe(true);
    }
  });
  it("en kötü kazanç zinciri (+18 kazanç, +10 fader, +10 master, iki aynı aygıt) bile −1 dBFS'i aşmaz (sınırlayıcı kapalı)", () => {
    const c = softClipCurve();
    const worst = dbToGain(18 + 10 + 10) * 2 * dbToGain(HEADROOM_DB);
    expect(Math.abs(applyCurve(c, worst))).toBeLessThan(dbToGain(-1));
  });
});

describe("ses: Sesi düzelt ve çift aygıt", () => {
  const devices = [
    { deviceId: "default", groupId: "g1", label: "Varsayılan - MacBook Mikrofonu" },
    { deviceId: "mac", groupId: "g1", label: "MacBook Mikrofonu" },
    { deviceId: "iph", groupId: "g2", label: "iPhone Mikrofonu" },
    { deviceId: "usb", groupId: "g3", label: "USB" },
  ];
  const base = {
    mic: { deviceId: null, muted: true },
    inputs: [
      { id: "a1", deviceId: "mac", name: "Mac mik" }, // sistem varsayılanıyla aynı fiziksel aygıt
      { id: "a2", deviceId: "iph", name: "iPhone" },
      { id: "a3", deviceId: "iph", name: "iPhone 2" }, // ikinci kez
      { id: "f1", kind: "file", name: "Müzik", url: "elitlig-studio://media/x.mp3" },
    ],
    strips: { mic: { trim: 12, fader: 6 }, a2: { trim: -3, fader: 8, solo: true }, music: { fader: 10 } },
    master: { fader: 6, limiter: false },
    monitor: { program: true, volume: 70 },
    killAll: false,
  };
  it("çift aygıtları bulur (deviceId ya da groupId)", () => {
    const d = duplicateAudioInputs(base, devices);
    expect(d.map((x) => x.id)).toEqual(["a1", "a3"]);
    expect(d[0].reason).toMatch(/Mikrofon/);
    expect(duplicateAudioInputs({ mic: { deviceId: "usb" }, inputs: [{ id: "x", deviceId: "usb" }] }, [])[0].id).toBe("x");
    expect(duplicateAudioInputs({ mic: { deviceId: "usb" }, inputs: [{ id: "x", deviceId: "iph" }] }, devices)).toEqual([]);
  });
  it("güvenli seviyeler: kazanç / fader 0, master −3, sınırlayıcı açık, dinleme kapalı, çiftler kaldırılır; sessiz korunur", () => {
    const { audio, removed, changed } = safeAudioLevels(base, devices);
    expect(changed).toBe(true);
    expect(removed.map((r) => r.id)).toEqual(["a1", "a3"]);
    const n = normalizeAudio(audio);
    expect(n.inputs.map((i) => i.id)).toEqual(["a2", "f1"]);
    for (const st of Object.values(n.strips)) { expect(st.trim).toBe(0); expect(st.fader).toBe(0); expect(st.solo).toBe(false); }
    expect(n.master).toEqual({ fader: -3, limiter: true, loudness: false });
    expect(n.monitor.program).toBe(false);
    expect(n.mic.muted).toBe(true);
    expect(n.strips.mic.mute).toBe(true);
    expect(safeAudioLevels(audio, devices).changed).toBe(false);
  });
  it("varsayılan ayarlar zaten güvenli: sınırlayıcı açık, program dinleme kapalı (geri besleme yok)", () => {
    const n = normalizeAudio(null);
    expect(n.master.limiter).toBe(true);
    expect(n.monitor.program).toBe(false);
    expect(normalizeAudio(patchStrip(n, "mic", { trim: 30 })).strips.mic.trim).toBe(18);
  });
});

describe("özet / tekrar: klip sesi", () => {
  const replay = {
    id: "r1", kind: "goal", createdAt: 1, durationMs: 15000,
    angles: [
      { angle: PROGRAM_ANGLE, url: "elitlig-studio://replay/r1-program.mp4", durationMs: 15000 },
      { angle: "cam2", url: "elitlig-studio://replay/r1-cam2.mp4", durationMs: 14000 },
    ],
  };
  it("program açısı kendi sesiyle; kamera açısı program açısının aynı anının sesiyle (süre farkı kadar ileri)", () => {
    expect(clipAudio(replay, replay.angles[0])).toEqual({});
    expect(clipAudio(replay, replay.angles[1])).toEqual({ audioUrl: replay.angles[0].url, audioOffsetMs: 1000 });
    expect(clipAudio({ angles: [replay.angles[1]] }, replay.angles[1])).toEqual({});
  });
  it("özet planı ve tekrar kuyruğu ses adresini taşır", () => {
    const plan = buildHighlightPlan({ items: [{ replayId: "r1", angles: [PROGRAM_ANGLE, "cam2"] }], replays: [replay] });
    const clips = plan.segments.filter((s) => s.type === "clip");
    expect(clips[0].audioUrl).toBeUndefined();
    expect(clips[1].audioUrl).toBe(replay.angles[0].url);
    const q = buildReplayQueue([replay], { r1: ["cam2"] });
    expect(q[0]).toMatchObject({ angle: "cam2", audioUrl: replay.angles[0].url, audioOffsetMs: 1000 });
  });
  it("müzik yatağı: kartlarda tam seviye, kliplerde kısılır", () => {
    const m = normalizeHighlightMusic({ url: "elitlig-studio://media/m.mp3", volumeDb: -10, duckDb: -15 });
    expect(musicBedDb(m, "intro")).toBe(-10);
    expect(musicBedDb(m, "clip")).toBe(-25);
    expect(normalizeHighlightMusic({ url: "javascript:x" }).url).toBe(null);
    expect(normalizeHighlightMusic({ volumeDb: 99 }).volumeDb).toBe(0);
  });
});

describe("yayın ayarları", () => {
  it("ses bit hızı en az 128 kbps; 'Yayını kapat' kısayolu atanabilir", () => {
    expect(Math.min(...AUDIO_KBPS_CHOICES)).toBe(128);
    expect(HOTKEY_ACTIONS.some((a) => a.key === "closeBroadcast")).toBe(true);
  });
});
