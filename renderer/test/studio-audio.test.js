import {
  DEFAULT_ROUTING, busGains, dbText, dbToFader, dbToGain, faderToDb, gainToDb, isDefaultRoute, meterFraction, monitorSet, normalizeAudio,
  normalizeRouting, patchStrip, peakHold, playbackContext, resetRoute, routingFor, sceneHasVideo, stripGain, stripList, toggleRoute, volumeToDb, samplesLevel, meterBallistics,
} from "../src/lib/studio/audio";

describe("ses: yönlendirme varsayılanları ve matris", () => {
  it("varsayılanlar: tekrar → yalnız mikrofon; video / özet → yalnız kendi sesi; canlı → hepsi", () => {
    expect(busGains("replay")).toEqual({ live: 1, media: 0, music: 0 });
    expect(busGains("video")).toEqual({ live: 0, media: 1, music: 0 });
    expect(busGains("highlight")).toEqual({ live: 0, media: 1, music: 0 });
    expect(busGains("live")).toEqual({ live: 1, media: 1, music: 1 });
    expect(busGains("yok")).toEqual(busGains("live"));
  });
  it("bağlam: yayındaki moda göre", () => {
    expect(playbackContext({ airMode: "tekrar" })).toBe("replay");
    expect(playbackContext({ airMode: "var" })).toBe("replay");
    expect(playbackContext({ airMode: "ozet" })).toBe("highlight");
    expect(playbackContext({ airMode: "roportaj", programHasVideo: true })).toBe("live");
    expect(playbackContext({ airMode: null, programHasVideo: true })).toBe("video");
    expect(playbackContext({})).toBe("live");
  });
  it("matris: birden çok ya da hiç; sıfırla", () => {
    let r = toggleRoute(undefined, "replay", "media", true);
    expect(routingFor("replay", r)).toEqual({ live: true, media: true, music: false });
    r = toggleRoute(r, "replay", "live", false);
    r = toggleRoute(r, "replay", "media", false);
    expect(busGains("replay", r)).toEqual({ live: 0, media: 0, music: 0 });
    expect(isDefaultRoute(r, "replay")).toBe(false);
    expect(routingFor("video", r)).toEqual(DEFAULT_ROUTING.video);
    r = resetRoute(r, "replay");
    expect(isDefaultRoute(r, "replay")).toBe(true);
    expect(normalizeRouting({ replay: { media: "x" } }).replay.media).toBe(false);
    expect(toggleRoute(undefined, "highlight", "music").highlight.music).toBe(true);
  });
  it("programda video kaynağı", () => {
    const sources = [{ id: "a", kind: "camera" }, { id: "v", kind: "video" }];
    expect(sceneHasVideo({ layers: [{ sourceId: "a" }] }, sources)).toBe(false);
    expect(sceneHasVideo({ layers: [{ sourceId: "v", visible: true }] }, sources)).toBe(true);
    expect(sceneHasVideo({ layers: [{ sourceId: "v", visible: false }] }, sources)).toBe(false);
  });
});

describe("ses: fader, dB, ölçer", () => {
  it("fader eğrisi: 0,75 = 0 dB, uçlar, ters dönüşüm", () => {
    expect(faderToDb(0.75)).toBeCloseTo(0, 6);
    expect(faderToDb(1)).toBe(10);
    expect(faderToDb(0)).toBe(-Infinity);
    expect(faderToDb(0.5)).toBeCloseTo(-10, 6);
    for (const db of [-70, -60, -30, -12, -3, 0, 4, 10]) expect(faderToDb(dbToFader(db))).toBeCloseTo(db, 5);
    expect(dbToFader(-Infinity)).toBe(0);
    for (let p = 0.01; p < 1; p += 0.07) expect(faderToDb(p + 0.01)).toBeGreaterThan(faderToDb(p));
  });
  it("kazanç dönüşümleri ve metin", () => {
    expect(dbToGain(0)).toBe(1);
    expect(dbToGain(-6)).toBeCloseTo(0.501, 3);
    expect(dbToGain(-Infinity)).toBe(0);
    expect(gainToDb(1)).toBe(0);
    expect(gainToDb(0)).toBe(-Infinity);
    expect(dbText(-6)).toBe("−6,0");
    expect(dbText(3.25)).toBe("+3,3");
    expect(dbText(-Infinity)).toBe("−∞");
    expect(volumeToDb(100)).toBe(0);
    expect(volumeToDb(0)).toBe(-Infinity);
    expect(volumeToDb(150)).toBeCloseTo(3.5, 1);
  });
  it("ölçer sapması (IEC benzeri), tepe tutma, balistik", () => {
    expect(meterFraction(0)).toBe(1);
    expect(meterFraction(-20)).toBeCloseTo(0.5, 6);
    expect(meterFraction(-80)).toBe(0);
    expect(meterFraction(-6)).toBeGreaterThan(meterFraction(-12));
    let st = peakHold(null, -10, 0);
    expect(st.db).toBe(-10);
    st = peakHold(st, -30, 1000);
    expect(st.db).toBe(-10); // tutuluyor
    st = peakHold(st, -30, 2500, { holdMs: 1500, decayDbPerSec: 20 });
    expect(st.db).toBeCloseTo(-30, 6); // 1 sn düşüş: -10 → -30
    expect(peakHold({ db: -10, at: 0 }, -40, 2000, { holdMs: 1500, decayDbPerSec: 20 }).db).toBeCloseTo(-20, 6);
    expect(meterBallistics(-10, -40, 500, 30)).toBeCloseTo(-25, 6);
    expect(meterBallistics(-10, -5, 16)).toBe(-5);
    const lv = samplesLevel(new Float32Array([0.5, -0.5, 0.5, -0.5]));
    expect(lv.peakDb).toBeCloseTo(-6.02, 1);
    expect(lv.rmsDb).toBeCloseTo(-6.02, 1);
  });
});

describe("ses: ayarlar ve şeritler", () => {
  it("eski biçimden göç (mic.volume → fader dB), sessiz tek yerde", () => {
    const a = normalizeAudio({ mic: { muted: true, volume: 50 }, inputs: [{ id: "i1", name: "Kamera sesi", volume: 100 }] });
    expect(a.strips.mic.fader).toBeCloseTo(-6, 0);
    expect(a.strips.mic.mute).toBe(true);
    expect(a.strips.i1.fader).toBe(0);
    expect(Object.keys(a.strips)).toEqual(["mic", "i1", "media", "highlight", "music"]);
    expect(a.master.limiter).toBe(true);
    expect(stripList(a).map((s) => s.group)).toEqual(["live", "live", "media", "media", "music"]);
  });
  it("patchStrip: mikrofon sessizi mic.muted'a yazılır (M kısayolu)", () => {
    let a = patchStrip(undefined, "mic", { mute: true });
    expect(a.mic.muted).toBe(true);
    a = patchStrip(a, "media", { fader: -12, trim: 30 });
    expect(a.strips.media.fader).toBe(-12);
    expect(a.strips.media.trim).toBe(18);
    expect(stripGain(a.strips.mic)).toBe(0);
    expect(stripGain({ fader: -6, trim: 6 })).toBeCloseTo(1, 6);
    a = patchStrip(a, "music", { solo: true });
    expect(monitorSet(a)).toEqual({ program: false, strips: ["music"] });
  });
});
