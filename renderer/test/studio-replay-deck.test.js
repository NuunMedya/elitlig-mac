// Anlık tekrar destesi (lib/studio/replayDeck.js): durumlar SEÇİLİ → ÖNİZLEMEDE → YAYINDA,
// oynatma listesi, yayında denetim modeli (hız, J / K / L, döngü, görünüm), açılar arası
// zaman eşlemesi, ilerleme, hareket çubuğu, yayınlanan seçim ve tuşlar; önizleme → program
// kopyası (previewTake) ile birlikte.
import { describe, expect, it } from "vitest";
import {
  DECK_RATES, MAX_RATE, MIN_RATE, STAGE, STAGE_LABEL, ZOOM_PRESETS, activityFromFrames, airedOut, airedStart, airedSwitch, angleStep, clampRate, deckFromPayload,
  deckKeyAction, deckReducer, jog, mapAngleTime, movePlaylist, playlistFromSelection, progressOf, rateStep, rateText, remainingOf, selectionOf,
  sequenceOf, setPlaylistAngle, stageOf, timeAt, togglePlaylist, zoomStep,
} from "../src/lib/studio/replayDeck";
import { planTake, playerQueueOf, replayPayload, samePayload } from "../src/lib/studio/previewTake";
import { normalizeModeSettings } from "../src/lib/studio/modes";

const R1 = { id: "r1", createdAt: 100, durationMs: 15000, angles: [{ angle: "program", url: "u/r1/p.mp4", durationMs: 15000 }, { angle: "cam1", url: "u/r1/c1.mp4", durationMs: 14000 }, { angle: "cam2", url: "u/r1/c2.mp4", durationMs: 15000 }] };
const R2 = { id: "r2", createdAt: 200, durationMs: 12000, angles: [{ angle: "program", url: "u/r2/p.mp4" }, { angle: "cam1", url: null }] };
const LIST = [R2, R1];
const key = (r, a) => `${r}|${a}`;
const maps = (o = {}) => ({ inOf: (k) => o.in?.[k] || 0, outOf: (k) => o.out?.[k] || 0, viewOf: (k) => o.view?.[k] || { zoom: 1, cx: 0.5, cy: 0.5 }, rateOf: (k) => o.rate?.[k] || 0, keyOf: key });
const ev = (k, o = {}) => ({ key: k, shiftKey: false, metaKey: false, ctrlKey: false, altKey: false, target: { tagName: "DIV" }, ...o });

describe("hız ve yakınlaştırma basamakları", () => {
  it("hızlar 0,25…2; sınırlanır, 0,05 adım; merdiven", () => {
    expect(DECK_RATES).toEqual([0.25, 0.5, 0.75, 1, 1.5, 2]);
    expect(clampRate(5)).toBe(MAX_RATE);
    expect(clampRate(0.01)).toBe(MIN_RATE);
    expect(clampRate(0.62)).toBe(0.6);
    expect(clampRate("x")).toBe(1);
    expect(rateStep(1, 1)).toBe(1.5);
    expect(rateStep(2, 1)).toBe(2);
    expect(rateStep(0.6, -1)).toBe(0.5);
    expect(rateStep(0.25, -1)).toBe(0.25);
    expect(rateText(0.75)).toBe("0,75×");
  });
  it("yakınlaştırma 1 → 1,5 → 2 → 3 → (×1,25) ve geri", () => {
    expect(ZOOM_PRESETS).toEqual([1, 1.5, 2, 3]);
    expect(zoomStep(1, 1)).toBe(1.5);
    expect(zoomStep(1.7, 1)).toBe(2);
    expect(zoomStep(3, 1)).toBe(3.75);
    expect(zoomStep(3.75, -1)).toBe(3);
    expect(zoomStep(2, -1)).toBe(1.5);
    expect(zoomStep(1, -1)).toBe(1);
    expect(zoomStep(6, 1)).toBe(6);
  });
  it("açılar döngüsel (A / S)", () => {
    expect(angleStep(R1.angles, "program", 1)).toBe("cam1");
    expect(angleStep(R1.angles, "program", -1)).toBe("cam2");
    expect(angleStep(["a"], "x", 1)).toBe("a");
    expect(angleStep([], "x", 1)).toBeNull();
  });
  it("mod ayarlarında hız 2×'e kadar saklanır", () => {
    expect(normalizeModeSettings({ rate: 1.5 }).rate).toBe(1.5);
    expect(normalizeModeSettings({ rate: 9 }).rate).toBe(2);
  });
});

describe("durumlar: SEÇİLİ → ÖNİZLEMEDE → YAYINDA", () => {
  const playlist = [{ replayId: "r1", angle: "program" }, { replayId: "r1", angle: "cam1" }];
  it("yayın > önizleme > seçili > boşta", () => {
    expect(stageOf({ replayId: "r2", playlist })).toBe(STAGE.idle);
    expect(stageOf({ replayId: "r1", playlist })).toBe(STAGE.selected);
    expect(stageOf({ replayId: "r1", playlist, cursor: { replayId: "r1", angle: "cam1" } })).toBe(STAGE.preview);
    expect(stageOf({ replayId: "r1", playlist, cursor: { replayId: "r1", angle: "cam1" }, air: { replayId: "r1", angle: "program" } })).toBe(STAGE.air);
    // açı düzeyinde
    expect(stageOf({ replayId: "r1", angle: "cam2", playlist, cursor: { replayId: "r1", angle: "cam1" } })).toBe(STAGE.idle);
    expect(stageOf({ replayId: "r1", angle: "cam1", playlist, air: { replayId: "r1", angle: "program" } })).toBe(STAGE.selected);
    expect(STAGE_LABEL.air).toBe("YAYINDA");
  });
});

describe("oynatma listesi", () => {
  it("seçimden liste: önceki sıra korunur, yeni girişler sona, url'siz açı atılır", () => {
    const pl = playlistFromSelection(LIST, { r1: ["cam2", "program"], r2: ["program", "cam1"] });
    expect(pl).toEqual([{ replayId: "r1", angle: "cam2" }, { replayId: "r1", angle: "program" }, { replayId: "r2", angle: "program" }]);
    const moved = movePlaylist(pl, 2, 0);
    const again = playlistFromSelection(LIST, { r1: ["cam2"], r2: ["program"] }, { prev: moved });
    expect(again).toEqual([{ replayId: "r2", angle: "program" }, { replayId: "r1", angle: "cam2" }]);
    expect(selectionOf(moved)).toEqual({ r2: ["program"], r1: ["cam2", "program"] });
  });
  it("ekle / çıkar, açı değiştir (yineleme yok), sıra numaraları", () => {
    let pl = togglePlaylist([], { replayId: "r1", angle: "cam1" });
    pl = togglePlaylist(pl, { replayId: "r1", angle: "program" });
    expect(sequenceOf(pl, "r1")).toEqual({ cam1: 1, program: 2 });
    pl = togglePlaylist(pl, { replayId: "r1", angle: "cam1" });
    expect(pl).toEqual([{ replayId: "r1", angle: "program" }]);
    pl = [{ replayId: "r1", angle: "program" }, { replayId: "r1", angle: "cam1" }];
    expect(setPlaylistAngle(pl, 0, "cam2")).toEqual([{ replayId: "r1", angle: "cam2" }, { replayId: "r1", angle: "cam1" }]);
    expect(setPlaylistAngle(pl, 0, "cam1")).toEqual([{ replayId: "r1", angle: "cam1" }]);
    expect(movePlaylist(pl, 0, 9)).toEqual([{ replayId: "r1", angle: "cam1" }, { replayId: "r1", angle: "program" }]);
  });
  it("yük listenin AÇIK sırasını izler (tekrarlar arası karışık sıra), öğeye özel hız", () => {
    const playlist = [{ replayId: "r2", angle: "program" }, { replayId: "r1", angle: "cam1" }, { replayId: "r1", angle: "program" }];
    const p = replayPayload({ list: LIST, playlist, cursor: { replayId: "r2", angle: "program" }, rate: 0.5, ...maps({ rate: { "r1|cam1": 0.25 } }) });
    expect(p.items.map((x) => x.key)).toEqual(["r2/program", "r1/cam1", "r1/program"]);
    const q = playerQueueOf(p);
    expect(q.map((x) => x.rate)).toEqual([0.5, 0.25, 0.5]);
    // öğe hızı değişince yük farklı (yeniden yayına alınır)
    const p2 = replayPayload({ list: LIST, playlist, cursor: { replayId: "r2", angle: "program" }, rate: 0.5, ...maps() });
    expect(samePayload(p, p2)).toBe(false);
  });
});

describe("program destesi: yayına alınca önizlemeden kopya, sonra yalnız program", () => {
  it("yayına alma yükü dondurur; programda yapılan değişiklik önizleme yükünü değiştirmez", () => {
    const view = { "r1|cam1": { zoom: 2, cx: 0.4, cy: 0.5 } };
    const p = replayPayload({ list: LIST, playlist: [{ replayId: "r1", angle: "cam1" }], cursor: { replayId: "r1", angle: "cam1" }, rate: 0.5, ...maps({ view }) });
    const plan = planTake({ preview: p, program: { kind: "scene", sceneId: "s1" } });
    expect(plan).toMatchObject({ type: "mode", mode: "tekrar", replace: false });
    let deck = deckFromPayload(plan.payload);
    expect(deck).toMatchObject({ rate: 0.5, paused: false, loop: false, shuttle: 0, views: {} });
    deck = deckReducer(deck, { type: "rate", rate: 2 });
    deck = deckReducer(deck, { type: "view", key: "r1|cam1", view: { zoom: 3, cx: 0.5, cy: 0.5 } });
    expect(deck.rate).toBe(2);
    // önizlemenin yükü (ve yayına alınan kopya) değişmedi
    expect(plan.payload.rate).toBe(0.5);
    expect(plan.payload.items[0].view).toEqual({ zoom: 2, cx: 0.4, cy: 0.5 });
    // aynı yük yeniden alınırsa baştan oynatılır, farklıysa yerine geçer
    const pg = { kind: "replay", mode: "tekrar", payload: plan.payload, returnSceneId: "s1" };
    expect(planTake({ preview: p, program: pg })).toMatchObject({ type: "mode", replace: true, restart: true });
  });
  it("J / K / L: K durdurur, L oynatır ve hızlandırır, J duraklatır sonra geri oynatır", () => {
    let d = deckFromPayload({ rate: 0.5 });
    d = deckReducer(d, { type: "shuttle", key: "l" });
    expect(d).toMatchObject({ rate: 0.75, paused: false, shuttle: 0 });
    d = deckReducer(d, { type: "shuttle", key: "k" });
    expect(d).toMatchObject({ paused: true, shuttle: 0 });
    d = deckReducer(d, { type: "shuttle", key: "l" });
    expect(d).toMatchObject({ paused: false, rate: 0.75 });
    d = deckReducer(d, { type: "shuttle", key: "j" });
    expect(d).toMatchObject({ paused: true, shuttle: 0 });
    d = deckReducer(d, { type: "shuttle", key: "j" });
    expect(d).toMatchObject({ paused: false, shuttle: -0.5 });
    d = deckReducer(d, { type: "shuttle", key: "j" });
    d = deckReducer(d, { type: "shuttle", key: "j" });
    d = deckReducer(d, { type: "shuttle", key: "j" });
    expect(d.shuttle).toBe(-2);
    d = deckReducer(d, { type: "shuttle", key: "l" });
    expect(d).toMatchObject({ paused: false, shuttle: 0 });
    d = deckReducer(d, { type: "toggle" });
    expect(d.paused).toBe(true);
  });
  it("döngü, kesme / karışım, hız adımı", () => {
    let d = deckFromPayload({ rate: 1 });
    d = deckReducer(d, { type: "loop" });
    expect(d.loop).toBe(true);
    d = deckReducer(d, { type: "loop", on: false });
    expect(d.loop).toBe(false);
    d = deckReducer(d, { type: "mix" });
    expect(d.mix).toBe(true);
    d = deckReducer(d, { type: "rateStep", dir: 1 });
    expect(d.rate).toBe(1.5);
    expect(deckReducer(d, { type: "bilinmeyen" })).toBe(d);
  });
});

describe("zaman: açı eşlemesi, çubuk, ilerleme, adım", () => {
  it("açılar yakalama anında biter: aynı an = t − (süreA − süreB)", () => {
    expect(mapAngleTime(10, 15, 14)).toBe(9);
    expect(mapAngleTime(9, 14, 15)).toBe(10);
    expect(mapAngleTime(0.5, 15, 14)).toBe(0);
    expect(mapAngleTime(14.9, 14, 15)).toBeCloseTo(14.98, 5);
    expect(mapAngleTime(3, 0, 0)).toBe(3);
  });
  it("çubuk konumu, ilerleme ve kalan süre (hızla)", () => {
    expect(timeAt(0.5, 12)).toBe(6);
    expect(timeAt(2, 12)).toBe(12);
    expect(progressOf(6, { inSec: 2, outSec: 10, dur: 15 })).toBe(0.5);
    expect(progressOf(1, { inSec: 2, dur: 15 })).toBe(0);
    expect(progressOf(15, { dur: 15 })).toBe(1);
    expect(remainingOf(6, { outSec: 10, rate: 0.5 })).toBe(8);
    expect(remainingOf(6, { dur: 12, rate: 2 })).toBe(3);
  });
  it("kare / saniye adımı sınırlar içinde", () => {
    expect(jog(1, 1)).toBeCloseTo(1 + 1 / 30, 6);
    expect(jog(1, -1, { shift: true })).toBe(0);
    expect(jog(9.5, 1, { shift: true, dur: 10 })).toBe(9.99);
  });
  it("hareket çubuğu: kare farkları 0…1", () => {
    const f = (v) => new Float32Array([v, v, v, v]);
    expect(activityFromFrames([f(0), f(0), f(10), f(10), f(40)])).toEqual([0, 0, 0.333, 0, 1]);
    expect(activityFromFrames([f(1), f(1)])).toEqual([0, 0]);
    expect(activityFromFrames([])).toEqual([]);
  });
});

describe("yayınlanan seçim (markAiredSelection)", () => {
  it("yayına alınca açılar ve bölümler; yayında açı değişince bölüm kapanır", () => {
    const items = playerQueueOf(replayPayload({ list: LIST, playlist: [{ replayId: "r1", angle: "program" }, { replayId: "r2", angle: "program" }], cursor: { replayId: "r1", angle: "program" }, ...maps({ in: { "r1|program": 2 }, out: { "r1|program": 9 } }) }));
    const log = airedStart(items);
    expect(log.r1).toEqual({ angles: ["program"], segments: [{ angle: "program", inSec: 2, outSec: 9 }] });
    expect(log.r2).toEqual({ angles: ["program"], segments: [{ angle: "program", inSec: 0, outSec: null }] });
    const sw = airedSwitch(log.r1, { fromAt: 5, angle: "cam1", toAt: 4, outSec: 8 });
    expect(sw).toEqual({ angles: ["program", "cam1"], segments: [{ angle: "program", inSec: 2, outSec: 5 }, { angle: "cam1", inSec: 4, outSec: 8 }] });
    expect(log.r1.segments[0].outSec).toBe(9); // değişmez (kopya)
    expect(airedOut(sw, 0).segments[1].outSec).toBeNull();
    expect(airedOut(sw, 6.5).segments).toEqual([{ angle: "program", inSec: 2, outSec: 5 }, { angle: "cam1", inSec: 4, outSec: 6.5 }]);
  });
});

describe("tuşlar (vMix / EVS düzeni)", () => {
  it("J K L, ←/→, ⇧ ±1 sn, + / −, 1–6, A / S, I / O, Enter, Esc", () => {
    expect(deckKeyAction(ev("j"))).toEqual({ type: "shuttle", key: "j" });
    expect(deckKeyAction(ev("L"))).toEqual({ type: "shuttle", key: "l" });
    expect(deckKeyAction(ev("ArrowLeft"))).toEqual({ type: "step", dir: -1 });
    expect(deckKeyAction(ev("ArrowRight", { shiftKey: true }))).toEqual({ type: "nudge", dir: 1 });
    expect(deckKeyAction(ev("+"))).toEqual({ type: "zoom", dir: 1 });
    expect(deckKeyAction(ev("-"))).toEqual({ type: "zoom", dir: -1 });
    expect(deckKeyAction(ev("1"))).toEqual({ type: "rate", rate: 0.25 });
    expect(deckKeyAction(ev("6"))).toEqual({ type: "rate", rate: 2 });
    expect(deckKeyAction(ev("7"))).toBeNull();
    expect(deckKeyAction(ev("a"))).toEqual({ type: "angle", dir: -1 });
    expect(deckKeyAction(ev("s"))).toEqual({ type: "angle", dir: 1 });
    expect(deckKeyAction(ev("i"))).toEqual({ type: "in" });
    expect(deckKeyAction(ev("Enter"))).toEqual({ type: "take" });
    expect(deckKeyAction(ev("Escape"))).toEqual({ type: "live" });
  });
  it("Boşluk / 0 yalnız deste odaktayken; yazı alanında ve ⌘ ile yok", () => {
    expect(deckKeyAction(ev(" "))).toBeNull();
    expect(deckKeyAction(ev(" "), { focused: true })).toEqual({ type: "toggle" });
    expect(deckKeyAction(ev("0"), { focused: true })).toEqual({ type: "zoomReset" });
    expect(deckKeyAction(ev("j", { target: { tagName: "INPUT", type: "text" } }))).toBeNull();
    expect(deckKeyAction(ev("j", { target: { tagName: "INPUT", type: "range" } }))).toEqual({ type: "shuttle", key: "j" });
    expect(deckKeyAction(ev("j", { metaKey: true }))).toBeNull();
  });
});
