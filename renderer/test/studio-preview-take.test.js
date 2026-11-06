// [önizleme-geçiş] Önizleme → program durum makinesi (lib/studio/previewTake.js).
import { describe, expect, it } from "vitest";
import {
  baseSceneOf, kindOfMode, modeOfKind, payloadSummary, planTake, playerQueueOf, previewStateOf, programAfterModeEnd,
  programStateOf, replayPayload, samePayload, takeAfterLoad, takeLabel,
} from "../src/lib/studio/previewTake";
import { modeReducer, MODE_IDLE } from "../src/lib/studio/modes";

const R1 = { id: "r1", createdAt: 100, durationMs: 15000, angles: [{ angle: "program", url: "u/r1/p.mp4" }, { angle: "cam1", url: "u/r1/c1.mp4" }, { angle: "cam2", url: "u/r1/c2.mp4" }] };
const R2 = { id: "r2", createdAt: 200, durationMs: 12000, angles: [{ angle: "program", url: "u/r2/p.mp4" }, { angle: "cam1", url: null }] };
const LIST = [R2, R1];
const key = (r, a) => `${r}|${a}`;
const maps = (o = {}) => ({
  inOf: (k) => o.in?.[k] || 0,
  outOf: (k) => o.out?.[k] || 0,
  viewOf: (k) => o.view?.[k] || { zoom: 1, cx: 0.5, cy: 0.5 },
  keyOf: key,
});

describe("önizleme yükü (replayPayload)", () => {
  it("önizlenen açı yayına giden İLK klip; açı seçimde değilse yalnız o açı", () => {
    // Kullanıcının sık yaşadığı hata: seçimde [program, cam1] varken önizlemede cam2 görünüyordu,
    // yayına program açısı gidiyordu. Artık yayına önizlenen açı gider.
    const p = replayPayload({ list: LIST, selection: { r1: ["program", "cam1"] }, cursor: { replayId: "r1", angle: "cam2" }, ...maps() });
    expect(p.items.map((x) => x.angle)).toEqual(["cam2"]);
    expect(p).toMatchObject({ kind: "replay", replayId: "r1", angle: "cam2", angles: ["cam2"] });
  });
  it("imleç seçili kuyruktaysa o klipten başlayıp kuyruğun kalanı sırayla", () => {
    const sel = { r1: ["program", "cam1", "cam2"], r2: ["program"] };
    const a = replayPayload({ list: LIST, selection: sel, cursor: { replayId: "r1", angle: "program" }, ...maps() });
    expect(a.items.map((x) => x.key)).toEqual(["r1/program", "r1/cam1", "r1/cam2", "r2/program"]);
    const b = replayPayload({ list: LIST, selection: sel, cursor: { replayId: "r1", angle: "cam1" }, ...maps() });
    expect(b.items.map((x) => x.key)).toEqual(["r1/cam1", "r1/cam2", "r2/program"]);
    expect(b.angles).toEqual(["cam1", "cam2"]);
  });
  it("imleç yoksa kuyruğun ilk klibi; hiçbir şey yoksa null", () => {
    expect(replayPayload({ list: LIST, selection: { r2: ["program"] }, cursor: null, ...maps() }).items[0].key).toBe("r2/program");
    expect(replayPayload({ list: LIST, selection: {}, cursor: null, ...maps() })).toBeNull();
    expect(replayPayload({ list: [], selection: {}, cursor: { replayId: "x", angle: "program" }, ...maps() })).toBeNull();
  });
  it("kuyruk sırası (order) verilirse o sırayla", () => {
    const p = replayPayload({ list: LIST, selection: { r1: ["program"], r2: ["program"] }, order: ["r2", "r1"], cursor: { replayId: "r2", angle: "program" }, ...maps() });
    expect(p.items.map((x) => x.replayId)).toEqual(["r2", "r1"]);
  });
  it("giriş / çıkış, yakınlaştırma ve hız yüke donar", () => {
    const view = { "r1|cam1": { zoom: 2.5, cx: 0.3, cy: 0.6 } };
    const p = replayPayload({ list: LIST, selection: {}, cursor: { replayId: "r1", angle: "cam1" }, rate: 0.5, ...maps({ in: { "r1|cam1": 3.2 }, out: { "r1|cam1": 9 }, view }) });
    expect(p.items[0]).toMatchObject({ startSec: 3.2, endSec: 9, view: { zoom: 2.5, cx: 0.3, cy: 0.6 } });
    expect(p).toMatchObject({ inSec: 3.2, outSec: 9, rate: 0.5, zoom: 2.5 });
    // görünüm kopyalanır: önizlemede sonradan yakınlaştırmak yayındaki yükü değiştirmez
    view["r1|cam1"].zoom = 4;
    expect(p.view.zoom).toBe(2.5);
  });
  it("çıkış girişten en az 0,2 sn sonra değilse yok sayılır; hız sınırlanır", () => {
    const p = replayPayload({ list: LIST, selection: {}, cursor: { replayId: "r1", angle: "program" }, rate: 3, ...maps({ in: { "r1|program": 5 }, out: { "r1|program": 5.1 } }) });
    expect(p.items[0].endSec).toBeNull();
    expect(p.rate).toBe(1);
    expect(replayPayload({ list: LIST, selection: {}, cursor: { replayId: "r1", angle: "program" }, rate: 0.1, ...maps() }).rate).toBe(0.25);
  });
  it("oynatıcı kuyruğu: her öğe donmuş hız ve görünümle", () => {
    const p = replayPayload({ list: LIST, selection: { r1: ["program", "cam1"] }, cursor: { replayId: "r1", angle: "program" }, rate: 0.75, ...maps() });
    const q = playerQueueOf(p);
    expect(q).toHaveLength(2);
    expect(q.every((x) => x.rate === 0.75 && x.url && x.view)).toBe(true);
    expect(playerQueueOf(null)).toEqual([]);
  });
  it("samePayload / özet", () => {
    const a = replayPayload({ list: LIST, selection: {}, cursor: { replayId: "r1", angle: "program" }, ...maps() });
    const b = replayPayload({ list: LIST, selection: {}, cursor: { replayId: "r1", angle: "program" }, ...maps() });
    const c = replayPayload({ list: LIST, selection: {}, cursor: { replayId: "r1", angle: "program" }, rate: 0.5, ...maps() });
    expect(samePayload(a, b)).toBe(true);
    expect(samePayload(a, c)).toBe(false);
    expect(payloadSummary(c)).toContain("0,5×");
    expect(payloadSummary(a)).toBe("");
  });
});

describe("önizleme / program durumu", () => {
  it("kip önizlemedeyse kip, değilse sahne", () => {
    expect(previewStateOf({ previewSceneId: "s2" })).toEqual({ kind: "scene", sceneId: "s2" });
    expect(previewStateOf({ previewSceneId: "s2", previewMode: "var" })).toMatchObject({ kind: "var", mode: "var" });
    expect(previewStateOf({ previewSceneId: "s2", previewMode: "tekrar", payload: null })).toMatchObject({ kind: "replay", empty: true });
    expect(previewStateOf({})).toEqual({ kind: "none" });
    expect(kindOfMode("roportaj")).toBe("interview");
    expect(modeOfKind("highlight")).toBe("ozet");
  });
  it("program: kip yayındaysa (giriş geçişi dahil) kip + altındaki sahne; çıkış geçişinde sahne", () => {
    expect(programStateOf({ programSceneId: "s1" })).toEqual({ kind: "scene", sceneId: "s1" });
    expect(programStateOf({ programSceneId: "s1", airMode: "tekrar", airStage: "entering" })).toMatchObject({ kind: "replay", returnSceneId: "s1" });
    expect(programStateOf({ programSceneId: "s1", airMode: "tekrar", airStage: "leaving" })).toEqual({ kind: "scene", sceneId: "s1" });
    expect(baseSceneOf({ kind: "var", mode: "var", returnSceneId: "s3" })).toBe("s3");
  });
});

describe("GEÇİŞ planı (planTake)", () => {
  const pvReplay = () => previewStateOf({ previewMode: "tekrar", payload: replayPayload({ list: LIST, selection: {}, cursor: { replayId: "r1", angle: "cam1" }, ...maps() }) });

  it("sahne → sahne: önizleme yayına, yayından düşen önizlemeye", () => {
    const plan = planTake({ preview: { kind: "scene", sceneId: "s2" }, program: { kind: "scene", sceneId: "s1" } });
    expect(plan).toMatchObject({ type: "scene", to: "s2", from: "s1", endMode: false, nextPreviewSceneId: "s1" });
    expect(planTake({ preview: { kind: "scene", sceneId: "s1" }, program: { kind: "scene", sceneId: "s1" } }).type).toBe("none");
  });
  it("tekrar önizlemede → yayına AYNEN o yük; önizlemeye alttaki sahne gelir", () => {
    const pv = pvReplay();
    const plan = planTake({ preview: pv, program: { kind: "scene", sceneId: "s1" } });
    expect(plan).toMatchObject({ type: "mode", mode: "tekrar", replace: false, returnSceneId: "s1", nextPreviewSceneId: "s1", clearPreviewMode: true });
    expect(plan.payload).toBe(pv);
    expect(plan.payload.items[0]).toMatchObject({ replayId: "r1", angle: "cam1" });
  });
  it("tekrar yayındayken önizlemedeki tekrar değişti → GEÇİŞ yayındakinin yerine koyar", () => {
    const air = replayPayload({ list: LIST, selection: {}, cursor: { replayId: "r2", angle: "program" }, ...maps() });
    const program = programStateOf({ programSceneId: "s1", airMode: "tekrar", airStage: "onair", airPayload: air });
    const plan = planTake({ preview: pvReplay(), program });
    expect(plan).toMatchObject({ type: "mode", mode: "tekrar", replace: true, restart: false, returnSceneId: "s1" });
    // aynı yük yeniden alınırsa baştan oynar
    const again = planTake({ preview: previewStateOf({ previewMode: "tekrar", payload: air }), program });
    expect(again).toMatchObject({ type: "mode", replace: true, restart: true });
  });
  it("tekrar yayındayken sahne alınırsa tekrar geçişle biter; önizlemeye kipten önceki sahne", () => {
    const program = programStateOf({ programSceneId: "s1", airMode: "tekrar", airStage: "onair" });
    const plan = planTake({ preview: { kind: "scene", sceneId: "s2" }, program });
    expect(plan).toMatchObject({ type: "scene", to: "s2", endMode: true, from: "tekrar", nextPreviewSceneId: "s1" });
    // önizlemede alttaki sahnenin kendisi varsa: tekrar biter, o sahneye dönülür
    expect(planTake({ preview: { kind: "scene", sceneId: "s1" }, program })).toMatchObject({ type: "scene", to: "s1", endMode: true });
  });
  it("VAR yayındayken önizlemede tekrar → kipten kipe; altındaki sahne korunur", () => {
    const program = programStateOf({ programSceneId: "s1", airMode: "var", airStage: "onair" });
    expect(planTake({ preview: pvReplay(), program })).toMatchObject({ type: "mode", mode: "tekrar", replace: false, returnSceneId: "s1" });
    expect(planTake({ preview: previewStateOf({ previewMode: "var" }), program }).type).toBe("none");
  });
  it("boş önizleme / boş tekrar önizlemesi alınmaz", () => {
    expect(planTake({ preview: { kind: "none" }, program: { kind: "scene", sceneId: "s1" } }).type).toBe("none");
    expect(planTake({ preview: previewStateOf({ previewMode: "tekrar" }), program: { kind: "scene", sceneId: "s1" } }).type).toBe("none");
  });
  it("stüdyo modu kapalı: önizleme yayındakini izler", () => {
    const plan = planTake({ preview: { kind: "scene", sceneId: "s2" }, program: { kind: "scene", sceneId: "s1" }, studioMode: false });
    expect(plan.nextPreviewSceneId).toBe("s2");
  });
  it("tekrar bitince program kipten önceki sahneye döner", () => {
    expect(programAfterModeEnd({ kind: "replay", mode: "tekrar", returnSceneId: "s1" })).toEqual({ kind: "scene", sceneId: "s1" });
    expect(programAfterModeEnd({ kind: "scene", sceneId: "s4" })).toEqual({ kind: "scene", sceneId: "s4" });
  });
  it("yükle-ve-al kararı ve düğme metni", () => {
    expect(takeAfterLoad({ studioMode: true })).toBe(false);
    expect(takeAfterLoad({ studioMode: true, direct: true })).toBe(true);
    expect(takeAfterLoad({ studioMode: false })).toBe(true);
    expect(takeLabel({ kind: "scene", sceneId: "s1" })).toBe("GEÇİŞ");
    expect(takeLabel(pvReplay())).toBe("YAYINA AL");
  });
});

describe("uçtan uca: kip durum makinesiyle birlikte", () => {
  // Studio'daki sırayı taklit eder: önizleme (kip + sahne), program (sahne + kip durumu), take.
  const apply = (st, plan) => {
    let { cfg, modes } = st;
    if (plan.type === "mode") {
      modes = modeReducer(modes, { type: "take", mode: plan.mode, transition: { kind: "cut" }, now: 0 });
      modes = modeReducer(modes, { type: "clearPreview", mode: plan.mode });
      cfg = { ...cfg, previewSceneId: plan.nextPreviewSceneId };
      return { cfg, modes, air: plan.payload };
    }
    if (plan.type === "scene") {
      if (plan.endMode) modes = modeReducer(modes, { type: "end", transition: { kind: "cut" }, now: 0 });
      cfg = { ...cfg, programSceneId: plan.to, previewSceneId: plan.nextPreviewSceneId };
      return { cfg, modes, air: plan.endMode ? null : st.air };
    }
    return st;
  };
  const view = (st, payload) => ({
    preview: previewStateOf({ previewSceneId: st.cfg.previewSceneId, previewMode: st.modes.preview, payload }),
    program: programStateOf({ programSceneId: st.cfg.programSceneId, airMode: st.modes.air, airStage: st.modes.stage, airPayload: st.air }),
  });

  it("tekrar → yayın → ikinci GEÇİŞ sahneye geri döner", () => {
    let st = { cfg: { programSceneId: "s1", previewSceneId: "s2" }, modes: MODE_IDLE, air: null };
    const payload = replayPayload({ list: LIST, selection: { r1: ["cam1"] }, cursor: { replayId: "r1", angle: "cam1" }, ...maps() });
    st = { ...st, modes: modeReducer(st.modes, { type: "preview", mode: "tekrar" }) };
    st = apply(st, planTake(view(st, payload)));
    expect(st.modes).toMatchObject({ air: "tekrar", stage: "onair", preview: null });
    expect(st.air.items[0].angle).toBe("cam1");
    expect(st.cfg).toEqual({ programSceneId: "s1", previewSceneId: "s1" }); // önizlemede alttaki sahne
    st = apply(st, planTake(view(st, null)));
    expect(st.modes).toMatchObject({ air: null, stage: "idle" });
    expect(st.cfg.programSceneId).toBe("s1");
  });
});
