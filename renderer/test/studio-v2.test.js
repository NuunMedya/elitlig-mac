// Yayın Stüdyosu 2: çoklu görünüm, logo geçişi, kodlama, orta-alt skorbord,
// çok açılı tekrar kuyruğu, maç özeti planı.
import { BOARD, bottomBoardLayout, drawBottomBoard, fitText, scorerLines, SCOREBUG_VARIANTS } from "../src/lib/studio/scorebug";
import { STINGER_COVER, stingerBand, stingerState } from "../src/lib/studio/stinger";
import { TRANSITIONS, transitionOf } from "../src/lib/studio/compose";
import { BITRATE_MAX_KBPS, BITRATE_MIN_KBPS, bitrateAdvice, encodingPreset, keyAction, normalizeEncoding, recommendedBitrate, uploadNeedMbps, validateBitrate } from "../src/lib/studio/broadcast";
import { addLayoutScene, defaultConfig, multiviewItems, normalizeConfig, presetFromScene, presetLayers, resolveScene, sourceSceneId, updateLayoutPreset } from "../src/lib/studio/layouts";
import { PROGRAM_ANGLE, angleLabel, anglesToRecord, buildReplayQueue, defaultAngles, latestReplay, metaFor, normalizeReplay, normalizeReplays, replayBanner, replayFromClip, replayOfMatch, replayTitle, toggleIn } from "../src/lib/studio/replays";
import { INTRO_MS, OUTRO_MS, buildHighlightPlan, defaultHighlightItems, eventsUntil, mmss, moveItem, planAt, scoreAtMinute, scoreForReplay, scoreThroughEvent } from "../src/lib/studio/highlights";

const measure = (text, font) => String(text).length * (parseFloat(String(font).split(" ")[1]) || 10) * 0.6;

describe("logo geçişi (stinger)", () => {
  it("zaman çizelgesi: örter, ortada değişir, açar", () => {
    const a = stingerState(0);
    expect(a.lead).toBe(0);
    expect(a.cover).toBe(0);
    expect(a.logo.alpha).toBe(0);
    expect(a.switched).toBe(false);
    const mid = stingerState(0.5);
    expect(mid.lead).toBe(1);
    expect(mid.trail).toBe(0);
    expect(mid.cover).toBe(1);
    expect(mid.switched).toBe(true);
    expect(mid.logo.alpha).toBeGreaterThan(0.95);
    expect(mid.logo.scale).toBeCloseTo(1, 1);
    // Tam örtülü aralık değişimi kapsar.
    expect(stingerState(STINGER_COVER.inEnd).cover).toBe(1);
    expect(stingerState(STINGER_COVER.outStart).cover).toBe(1);
    expect(stingerState(0.49).switched).toBe(false);
    const end = stingerState(1);
    expect(end.trail).toBe(1);
    expect(end.cover).toBe(0);
    expect(end.done).toBe(true);
    expect(end.logo.alpha).toBe(0);
    expect(stingerState(-3).t).toBe(0);
    expect(stingerState(7).t).toBe(1);
  });
  it("örtü tekdüze artar, sonra azalır", () => {
    let prev = -1;
    for (let p = 0; p <= 0.5; p += 0.05) { const c = stingerState(p).cover; expect(c).toBeGreaterThanOrEqual(prev - 1e-9); prev = c; }
    prev = 2;
    for (let p = 0.5; p <= 1; p += 0.05) { const c = stingerState(p).cover; expect(c).toBeLessThanOrEqual(prev + 1e-9); prev = c; }
  });
  it("şerit çokgeni: ortada tüm ekranı örter, başta / sonda görünmez", () => {
    const W = 1920;
    const H = 1080;
    const full = stingerBand(stingerState(0.5), W, H);
    expect(Math.max(full[0][0], full[1][0])).toBeLessThanOrEqual(0);
    expect(Math.min(full[2][0], full[3][0])).toBeGreaterThanOrEqual(W);
    const start = stingerBand(stingerState(0), W, H);
    expect(Math.max(...start.map(([x]) => x))).toBeLessThanOrEqual(0);
    const end = stingerBand(stingerState(1), W, H);
    expect(Math.min(...end.map(([x]) => x))).toBeGreaterThanOrEqual(W);
  });
  it("geçiş seçici: Kesme / Yumuşak geçiş / ElitLig logo", () => {
    expect(TRANSITIONS.map((t) => t.label)).toEqual(["Kesme", "Yumuşak geçiş", "ElitLig logo"]);
    expect(transitionOf("stinger").ms).toBe(900);
    expect(transitionOf("zz").key).toBe("fade");
  });
});

describe("kodlama ayarı", () => {
  it("bit hızı doğrulama", () => {
    expect(validateBitrate("4500")).toEqual({ ok: true, value: 4500, message: null });
    expect(validateBitrate(" 6 000 ")).toMatchObject({ ok: true, value: 6000 });
    expect(validateBitrate("4500,4").value).toBe(4500);
    expect(validateBitrate("")).toMatchObject({ ok: false, value: null });
    expect(validateBitrate("abc")).toMatchObject({ ok: false, value: null });
    expect(validateBitrate(100)).toMatchObject({ ok: false, value: BITRATE_MIN_KBPS });
    expect(validateBitrate(99999)).toMatchObject({ ok: false, value: BITRATE_MAX_KBPS });
  });
  it("önerilen bit hızı, uyarı, gereken yükleme", () => {
    expect(recommendedBitrate("720p", 30)).toBe(3000);
    expect(recommendedBitrate("720p", 60)).toBe(4500);
    expect(recommendedBitrate("1080p", 30)).toBe(6000);
    expect(recommendedBitrate("1080p", 60)).toBe(9000);
    expect(bitrateAdvice({ resolution: "1080p", fps: 60, bitrateKbps: 2000 })).toMatch(/düşük/);
    expect(bitrateAdvice({ resolution: "720p", fps: 30, bitrateKbps: 2500 })).toBeNull();
    expect(bitrateAdvice({ resolution: "1080p", fps: 60, bitrateKbps: 15000 })).toMatch(/gereksiz/);
    expect(uploadNeedMbps(4500)).toBeCloseTo(7.0, 1); // (4500 + 192 ses) × 1,5
  });
  it("ayrı çözünürlük / fps / bit hızı; eski 'quality' tercihi okunur", () => {
    expect(normalizeEncoding({ resolution: "1080p", fps: 60, bitrateKbps: 7000 })).toEqual({ resolution: "1080p", fps: 60, bitrateKbps: 7000 });
    expect(normalizeEncoding(null, "1080p30")).toEqual({ resolution: "1080p", fps: 30, bitrateKbps: 4500 });
    expect(normalizeEncoding({ resolution: "4k", fps: 25 })).toEqual({ resolution: "720p", fps: 30, bitrateKbps: 3000 });
    expect(normalizeEncoding({ resolution: "720p", fps: 30, bitrateKbps: 50 }).bitrateKbps).toBe(BITRATE_MIN_KBPS);
    expect(encodingPreset({ resolution: "1080p", fps: 60, bitrateKbps: 8000 })).toEqual({ key: "1080p60", width: 1920, height: 1080, fps: 60, videoBitrateKbps: 8000 });
  });
  it("B: önemli an kısayolu", () => {
    expect(keyAction({ key: "b", target: { tagName: "DIV" } })).toEqual({ type: "moment" });
    expect(keyAction({ key: "B", target: { tagName: "INPUT" } })).toBeNull();
  });
});

describe("çoklu görünüm ve düzenler", () => {
  it("kaynak = sanal tam ekran sahne", () => {
    const c = defaultConfig();
    const sc = resolveScene(c, sourceSceneId("src_cam2"));
    expect(sc).toMatchObject({ id: "src:src_cam2", name: "Kamera 2", virtual: true });
    expect(sc.layers).toHaveLength(1);
    expect(sc.layers[0].layout).toEqual({ type: "full" });
    expect(resolveScene(c, "src:yok")).toBeNull();
    expect(resolveScene(c, "sc_pip").name).toBe("Resim içinde resim");
  });
  it("kutular: önce kaynaklar, sonra düzenler; 1–9 numara", () => {
    let c = defaultConfig();
    for (let i = 0; i < 8; i += 1) c = addLayoutScene(c, { kind: "sbs", a: "src_cam1", b: "src_cam2" }).config;
    const items = multiviewItems(c);
    expect(items.slice(0, 3).map((i) => [i.kind, i.name, i.number])).toEqual([["source", "Kamera 1", 1], ["source", "Kamera 2", 2], ["layout", "Resim içinde resim", 3]]);
    expect(items[8].number).toBe(9);
    expect(items[9].number).toBeNull();
  });
  it("hazır kalıp: PiP, yan yana, tek kaynak + logo", () => {
    expect(presetLayers({ kind: "pip", a: "x", b: "y", corner: "tl", size: 25 }).map((l) => l.layout)).toEqual([{ type: "full" }, { type: "pip", corner: "tl", size: 25 }]);
    expect(presetLayers({ kind: "sbs", a: "x", b: "y" }).map((l) => l.layout.type)).toEqual(["left", "right"]);
    expect(presetLayers({ kind: "full", a: "x", b: "logo" })[1]).toMatchObject({ fit: "contain", layout: { type: "pip", size: 16 } });
    expect(presetLayers({ kind: "pip", a: "x", b: null })).toHaveLength(1);
    let c = defaultConfig();
    c = updateLayoutPreset(c, "sc_pip", { b: null });
    expect(c.scenes[0].layers).toHaveLength(1);
    c = updateLayoutPreset(c, "sc_pip", { kind: "sbs", b: "src_cam2" });
    expect(c.scenes[0].layers.map((l) => l.layout.type)).toEqual(["left", "right"]);
    expect(presetFromScene({ layers: [{ sourceId: "a", layout: { type: "full" } }, { sourceId: "b", layout: { type: "pip", corner: "bl", size: 22 } }] })).toEqual({ kind: "pip", a: "a", b: "b", corner: "bl", size: 22 });
    expect(presetFromScene({ layers: [{ sourceId: "a", layout: { type: "rect" } }] })).toBeNull();
  });
  it("sürüm 1 kaydı: tek kaynaklı sahneler kaynağın kendisine dönüşür", () => {
    const v1 = {
      version: 1,
      sources: [{ id: "c1", kind: "camera", name: "Kamera 1" }, { id: "c2", kind: "camera", name: "Kamera 2" }],
      scenes: [
        { id: "s1", name: "Kamera 1", layers: [{ id: "l1", sourceId: "c1", layout: { type: "full" }, visible: true }] },
        { id: "s2", name: "PiP", layers: [{ id: "l2", sourceId: "c1", layout: { type: "full" } }, { id: "l3", sourceId: "c2", layout: { type: "pip", corner: "br", size: 30 } }] },
      ],
      overlay: { scorebug: false },
      previewSceneId: "s2",
      programSceneId: "s1",
    };
    const n = normalizeConfig(v1);
    expect(n.version).toBe(2);
    expect(n.scenes.map((s) => s.id)).toEqual(["s2"]);
    expect(n.programSceneId).toBe("src:c1");
    expect(n.previewSceneId).toBe("s2");
    expect(n.overlay).toEqual({ scorebug: false, variant: "off" });
  });
});

describe("orta-alt büyük skorbord", () => {
  const state = { homeName: "Ankara Gençlikspor", awayName: "Karadeniz FK", homeScore: 2, awayScore: 1, clockMs: 33 * 60000 + 12000, period: 2 };
  it("1920×1080'de web ölçüleri: ortada, alttan 64 px", () => {
    const L = bottomBoardLayout(state, 1920, 1080, measure);
    expect(L.w).toBe(BOARD.width);
    expect(L.x).toBe(460);
    expect(L.band.h).toBe(84);
    expect(L.clock.y + L.clock.h).toBe(1080 - 64);
    expect(L.band.y + L.band.h).toBe(L.clock.y);
    // Satır bant içinde ortalı: 356 + 82 + 74 + 82 + 356 = 950
    expect(L.home.x).toBe(460 + 25);
    expect(L.awayScore.x + L.awayScore.w + 356).toBe(460 + 25 + 950);
    expect(L.homeScore.text).toBe("2");
    expect(L.clock.text).toBe("2. YARI · 33:12");
    expect(L.clock.x + L.clock.w / 2).toBeCloseTo(960);
    expect(L.home.name.text).toBe("ANKARA GENÇLİKSPOR");
    // Ev adı sağa, deplasman adı sola yaslı; arma adın dışında.
    expect(L.home.name.x + L.home.name.w).toBeCloseTo(L.home.x + 356 - 24);
    expect(L.home.crest.x + L.home.crest.w).toBeLessThan(L.home.name.x);
    expect(L.away.name.x).toBe(L.away.x + 24);
    expect(L.scorers).toBeNull();
    expect(L.event).toBeNull();
  });
  it("720p'de ölçekli; maç sonu ve özel saat yazısı", () => {
    const L = bottomBoardLayout({ ...state, finished: true }, 1280, 720, measure);
    expect(L.s).toBeCloseTo(2 / 3);
    expect(L.w).toBeCloseTo(1000 * (2 / 3));
    expect(L.clock.text).toBe("MAÇ SONU");
    expect(bottomBoardLayout({ ...state, clockLabel: "MAÇ ÖZETİ" }, 1920, 1080, measure).clock.text).toBe("MAÇ ÖZETİ");
  });
  it("golcüler ve olay bandı üstte yığılır; uzun ad kısaltılır", () => {
    const L = bottomBoardLayout({ ...state, homeName: "Çok Uzun Adlı Bir Takım Spor Kulübü Derneği", scorers: { home: [{ name: "Can Aydın", minutes: [6, 31] }], away: [] }, event: { kind: "goal", label: "GOL", player: "CAN AYDIN" } }, 1920, 1080, measure);
    expect(L.home.name.text.endsWith("…")).toBe(true);
    expect(L.home.name.w).toBeLessThanOrEqual(232);
    expect(L.scorers.home.rows[0]).toMatchObject({ name: "Can Aydın", minutes: "6', 31'" });
    expect(L.scorers.away).toBeNull();
    expect(L.scorers.home.y + L.scorers.home.h).toBe(L.band.y - 6);
    expect(L.event.y + L.event.h).toBe(L.scorers.home.y - 10);
    expect(L.event.x + L.event.w / 2).toBeCloseTo(960);
    expect(L.top).toBe(L.event.y);
  });
  it("fitText", () => {
    expect(fitText("KISA", 1000, "800 10px x", measure)).toBe("KISA");
    expect(fitText("ABCDEFGHIJ", 30, "800 10px x", measure)).toBe("ABCD…");
    expect(fitText("ABC", 1, "800 10px x", measure)).toBe("…");
  });
  it("tuval çizimi hata vermez ve sınır döner", () => {
    const calls = [];
    const ctx = new Proxy({ canvas: { width: 1920, height: 1080 }, measureText: (t) => ({ width: String(t).length * 10 }) }, {
      get(target, k) { if (k in target) return target[k]; return (...a) => { calls.push(k); return k === "createLinearGradient" ? { addColorStop() {} } : undefined; }; },
      set(target, k, v) { target[k] = v; return true; },
    });
    const box = drawBottomBoard(ctx, { ...state, scorers: { home: [{ name: "A", minutes: [1] }], away: [{ name: "B", minutes: [2] }] }, event: { kind: "goal", label: "GOL" } }, { outW: 1920, outH: 1080 });
    expect(box.y + box.h).toBe(1080 - 64);
    expect(calls).toContain("fillText");
  });
  it("golcü satırları: kendi kalesine rakibe yazılır", () => {
    const ev = [
      { olay_kodu: "GOAL_RIGHT_FOOT", takim_id: 3, oyuncu_id: 1, dakika: 6 },
      { olay_kodu: "YELLOW_CARD", takim_id: 3, oyuncu_id: 1, dakika: 7 },
      { olay_kodu: "GOAL_HEADER", takim_id: 3, oyuncu_id: 1, dakika: 31 },
      { olay_kodu: "GOAL_OWN", takim_id: 3, oyuncu_id: 2, dakika: 40 },
    ];
    const names = { 1: "Can", 2: "Mert" };
    const s = scorerLines(ev, { homeTeamId: 3, awayTeamId: 8, nameOf: (id) => names[id] });
    expect(s.home).toEqual([{ name: "Can", minutes: [6, 31] }]);
    expect(s.away).toEqual([{ name: "Mert (k.k.)", minutes: [40] }]);
    expect(SCOREBUG_VARIANTS.map((v) => v.key)).toEqual(["small", "bottom", "off"]);
  });
});

const R = (id, createdAt, kind, angles, extra = {}) => normalizeReplay({ id, createdAt, kind, durationMs: 10000, angles: angles.map((a) => ({ angle: a, name: a, url: `elitlig-studio://replays/${id}/${a}.mp4`, durationMs: 10000 })), ...extra });

describe("çok açılı tekrar", () => {
  const sources = [{ id: "cam1", kind: "camera", name: "Kale arkası" }, { id: "cam2", kind: "camera", name: "Tribün" }, { id: "img", kind: "image", name: "Logo" }];
  it("kaydı normalleştirir, en yeni önce sıralar", () => {
    const list = normalizeReplays([
      { id: "a", createdAt: "2026-11-05T20:00:00Z", kind: "goal", angles: [{ angle: "program", url: "u" }, { angle: "x" }] },
      { id: "b", createdAt: "2026-11-05T20:05:00Z", kind: "weird", eventId: "0", angles: [] },
      null,
    ]);
    expect(list.map((r) => r.id)).toEqual(["b", "a"]);
    expect(list[1].angles).toHaveLength(1);
    expect(list[0].kind).toBe("moment");
    expect(list[0].eventId).toBeNull();
    const fromClip = replayFromClip({ name: "clip-1.mp4", url: "elitlig-studio://clips/clip-1.mp4", durationMs: 9000 }, { createdAt: 5 });
    expect(fromClip).toMatchObject({ id: "clip:clip-1.mp4", kind: "goal", durationMs: 9000 });
    expect(fromClip.angles[0].angle).toBe(PROGRAM_ANGLE);
  });
  it("kaydedilecek açılar: program + seçili / tüm kaynaklar (görsel hariç)", () => {
    expect(anglesToRecord({ program: true, all: true }, sources)).toEqual(["program", "cam1", "cam2"]);
    expect(anglesToRecord({ program: false, sources: ["cam2", "img", "yok"] }, sources)).toEqual(["cam2"]);
    expect(anglesToRecord(null, sources)).toEqual(["program"]);
    expect(toggleIn(["a"], "a")).toEqual([]);
    expect(toggleIn(undefined, "a")).toEqual(["a"]);
    expect(angleLabel("program", sources)).toBe("Program");
    expect(angleLabel({ angle: "cam1" }, sources)).toBe("Kale arkası");
    expect(angleLabel({ angle: "gone", name: "Eski" }, sources)).toBe("Eski");
  });
  it("varsayılan açılar ve son tekrar", () => {
    const r = R("r1", 1, "goal", ["program", "cam1"]);
    expect(defaultAngles(r, ["program", "cam1", "cam2"])).toEqual(["program", "cam1"]);
    expect(defaultAngles(r, ["cam9"])).toEqual(["program"]);
    expect(defaultAngles(R("r2", 1, "moment", ["cam2"]), ["program"])).toEqual(["cam2"]);
    expect(latestReplay([R("x", 1, "goal", ["program"]), R("y", 9, "goal", ["program"]), R("z", 20, "goal", [])]).id).toBe("y");
    expect(latestReplay([])).toBeNull();
  });
  it("kuyruk: tekrar1/açıA → tekrar1/açıB → tekrar2 (eskiden yeniye ya da verilen sıra)", () => {
    const r1 = R("r1", 100, "goal", ["program", "cam1", "cam2"]);
    const r2 = R("r2", 200, "moment", ["program", "cam1"]);
    const sel = { r2: ["cam1"], r1: ["cam2", "program"], r3: ["program"] };
    expect(buildReplayQueue([r2, r1], sel).map((q) => q.key)).toEqual(["r1/program", "r1/cam2", "r2/cam1"]);
    expect(buildReplayQueue([r1, r2], sel, { order: ["r2", "r1"] }).map((q) => q.key)).toEqual(["r2/cam1", "r1/program", "r1/cam2"]);
    expect(buildReplayQueue([r1], { r1: [] })).toEqual([]);
    expect(buildReplayQueue([r1], {})[0]).toBeUndefined();
  });
  it("alt bant, başlık, maç süzgeci", () => {
    const g = R("g", 1, "goal", ["program"], { playerName: "Can Aydın" });
    expect(replayBanner(g, {})).toEqual({ kind: "goal", label: "GOL", player: "CAN AYDIN" });
    expect(replayBanner(R("o", 1, "goal", ["program"]), { code: "GOAL_OWN" }).label).toBe("KENDİ KALESİNE");
    expect(replayBanner(R("m", 1, "moment", ["program"], { label: "Kaleci kurtarışı" }), {})).toEqual({ kind: "other", label: "ÖNEMLİ AN", player: "KALECİ KURTARIŞI" });
    expect(replayBanner(R("m", 1, "moment", ["program"], { label: "Önemli an" }), {}).player).toBeNull();
    expect(replayTitle(g, { minute: 12 })).toBe("12' GOL · Can Aydın");
    expect(replayTitle(R("m", 1, "moment", ["program"]), { minute: 3 })).toBe("3' Önemli an");
    expect(replayOfMatch(g, { matchId: 7 }, 7)).toBe(true);
    expect(replayOfMatch(g, { matchId: 8 }, 7)).toBe(false);
    expect(replayOfMatch(g, {}, 7)).toBe(true);
    expect(metaFor(R("k", 1, "goal", ["program"], { minute: 5 }), { k: { side: "home" } })).toEqual({ minute: 5, side: "home" });
  });
});

describe("maç özeti", () => {
  const H = 3;
  const A = 8;
  const events = [
    { id: 1, takim_id: H, olay_kodu: "GOAL_RIGHT_FOOT", dakika: 6, devre: 1 },
    { id: 2, takim_id: A, olay_kodu: "GOAL_HEADER", dakika: 14, devre: 1 },
    { id: 3, takim_id: A, olay_kodu: "YELLOW_CARD", dakika: 19, devre: 1 },
    { id: 5, takim_id: H, olay_kodu: "GOAL_OWN", dakika: 2, devre: 2 },
    { id: 4, takim_id: H, olay_kodu: "GOAL_PENALTY", dakika: 31, devre: 2 },
  ];
  it("o anın skoru: olay dahil / dakikaya kadar", () => {
    expect(scoreThroughEvent(events, 1, H, A)).toEqual({ home: 1, away: 0 });
    expect(scoreThroughEvent(events, 2, H, A)).toEqual({ home: 1, away: 1 });
    expect(scoreThroughEvent(events, 5, H, A)).toEqual({ home: 1, away: 2 });
    expect(scoreThroughEvent(events, 4, H, A)).toEqual({ home: 2, away: 2 });
    expect(scoreThroughEvent(events, 99, H, A)).toBeNull();
    expect(scoreAtMinute(events, { period: 1, minute: 10 }, H, A)).toEqual({ home: 1, away: 0 });
    expect(scoreAtMinute(events, { period: 2, minute: 0 }, H, A)).toEqual({ home: 1, away: 1 });
    expect(scoreAtMinute(events, { period: 2, minute: 40 }, H, A)).toEqual({ home: 2, away: 2 });
    const g = R("g", 1, "goal", ["program"], { eventId: 2 });
    expect(scoreForReplay(g, {}, { events, homeTeamId: H, awayTeamId: A })).toEqual({ home: 1, away: 1 });
    expect(scoreForReplay(R("m", 1, "moment", ["program"]), { minute: 20, period: 1 }, { events, homeTeamId: H, awayTeamId: A })).toEqual({ home: 1, away: 1 });
    expect(scoreForReplay(R("m", 1, "moment", ["program"]), {}, { events, homeTeamId: H, awayTeamId: A, fallback: { home: 9, away: 9 } })).toEqual({ home: 9, away: 9 });
    expect(eventsUntil(events, g, {}).map((e) => e.id)).toEqual([1, 2]);
    expect(eventsUntil(events, R("m", 1, "moment", ["program"]), { minute: 1, period: 2 }).map((e) => e.id)).toEqual([1, 2, 3]);
  });
  it("varsayılan liste: goller + özete eklenen anlar, eskiden yeniye", () => {
    const list = [
      R("m1", 300, "moment", ["program"], { inSummary: true }),
      R("g1", 100, "goal", ["program", "cam1"]),
      R("m2", 200, "moment", ["program"]),
      R("g2", 400, "goal", []),
    ];
    expect(defaultHighlightItems(list, { preferredAngles: ["cam1"] })).toEqual([{ replayId: "g1", angles: ["cam1"] }, { replayId: "m1", angles: ["program"] }]);
    expect(defaultHighlightItems(list, { include: (r) => r.id !== "g1" }).map((i) => i.replayId)).toEqual(["m1"]);
    expect(moveItem([1, 2, 3], 0, 2)).toEqual([2, 3, 1]);
    expect(moveItem([1, 2, 3], 2, 0)).toEqual([3, 1, 2]);
    expect(moveItem([1, 2, 3], 5, 0)).toEqual([1, 2, 3]);
  });
  it("plan: giriş · klipler (açı başına) · kapanış; geçiş sınırların ortasında", () => {
    const r1 = R("r1", 1, "goal", ["program", "cam1"], { durationMs: 8000 });
    r1.angles[0].durationMs = 8000;
    r1.angles[1].durationMs = 6000;
    const r2 = R("r2", 2, "moment", ["program"]);
    const plan = buildHighlightPlan({ items: [{ replayId: "r1", angles: ["program", "cam1"] }, { replayId: "r2", angles: ["program", "yok"] }, { replayId: "gone", angles: ["program"] }], replays: [r1, r2], scoreOf: (r) => (r.id === "r1" ? { home: 1, away: 0 } : null), stingerMs: 900 });
    expect(plan.segments.map((s) => s.type)).toEqual(["intro", "clip", "clip", "clip", "outro"]);
    expect(plan.clipCount).toBe(3);
    expect(plan.durationMs).toBe(INTRO_MS + 8000 + 6000 + 10000 + OUTRO_MS);
    expect(plan.segments[1]).toMatchObject({ start: INTRO_MS, end: INTRO_MS + 8000, angle: "program", score: { home: 1, away: 0 } });
    expect(plan.stingers).toHaveLength(4);
    expect(plan.stingers[0]).toEqual({ at: INTRO_MS, start: INTRO_MS - 450, end: INTRO_MS + 450 });
    // Geçişin ilk yarısı önceki, ikinci yarısı sonraki parçanın üstünde.
    const before = planAt(plan, INTRO_MS - 100);
    expect(before.segment.type).toBe("intro");
    expect(before.stinger).toBeCloseTo(350 / 900);
    const after = planAt(plan, INTRO_MS + 100);
    expect(after.segment.type).toBe("clip");
    expect(after.local).toBe(100);
    expect(after.stinger).toBeCloseTo(550 / 900);
    expect(planAt(plan, 1000).stinger).toBeNull();
    expect(planAt(plan, plan.durationMs).done).toBe(true);
    expect(planAt({ segments: [], stingers: [], durationMs: 0 }, 0).done).toBe(true);
    expect(mmss(84_000)).toBe("1:24");
  });
});
