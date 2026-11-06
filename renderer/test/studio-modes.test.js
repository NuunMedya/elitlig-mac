import { MODE_IDLE, addExtra, airButton, defaultLayers, extraRect, isOnAirState, modeReducer, modeTransitionAt, normalizeLayers, normalizeModeSettings, normalizeTransition, removeExtra, snapshotWithLayers, updateExtra } from "../src/lib/studio/modes";
import { VAR_LAYOUTS, activeSlots, normalizeVarV2, varLayoutV2, varScan, varStatus, varTimecode } from "../src/lib/studio/var";
import { STINGER_KEYS, irisState, panelsState, shardAt, shardGeometry, shardsState, stingerCoverage, sweepState } from "../src/lib/studio/stinger";
import { TRANSITIONS, isStingerKind, transitionFrame, transitionMs } from "../src/lib/studio/transitions";
import { INTRO_MS, OUTRO_MS, cardTimeline } from "../src/lib/studio/highlights";
import { interviewFileOf, interviewIdOf } from "../src/views/studio/scenes/useInterview";

describe("yayın modları: durum makinesi önizleme → yayın → canlı", () => {
  const T = { kind: "fade", ms: 400 };
  it("önizle, yayına al (geçişli), geçiş bitince yayında, canlıya dön", () => {
    let s = modeReducer(MODE_IDLE, { type: "preview", mode: "tekrar" });
    expect(s.preview).toBe("tekrar");
    expect(isOnAirState(s)).toBe(false);
    s = modeReducer(s, { type: "take", transition: T, now: 1000 });
    expect(s).toMatchObject({ air: "tekrar", stage: "entering", from: null });
    expect(s.transition).toMatchObject({ kind: "fade", ms: 400, startedAt: 1000, dir: "in" });
    expect(modeReducer(s, { type: "tick", now: 1200 }).stage).toBe("entering");
    const at = modeTransitionAt(s, 1200);
    expect(at.p).toBeCloseTo(0.5, 6);
    expect(at.dir).toBe("in");
    s = modeReducer(s, { type: "tick", now: 1400 });
    expect(s.stage).toBe("onair");
    expect(s.transition).toBeNull();
    expect(airButton(s, "tekrar").label).toBe("Canlıya dön");
    expect(modeReducer(s, { type: "take", transition: T, now: 1500 })).toBe(s); // zaten yayında
    s = modeReducer(s, { type: "end", transition: { kind: "stinger" }, now: 2000 });
    expect(s.stage).toBe("leaving");
    expect(modeTransitionAt(s, 2000 + s.transition.ms / 2).stinger).toBe(true);
    expect(modeReducer(s, { type: "end", transition: T, now: 2100 })).toBe(s);
    s = modeReducer(s, { type: "tick", now: 5000 });
    expect(s).toMatchObject({ air: null, stage: "idle", preview: "tekrar" });
  });
  it("kesme anında; mod yayındayken başka moda doğrudan geçiş (from)", () => {
    let s = modeReducer(MODE_IDLE, { type: "take", mode: "var", transition: { kind: "cut" }, now: 0 });
    expect(s).toMatchObject({ air: "var", stage: "onair" });
    s = modeReducer(s, { type: "take", mode: "tekrar", transition: T, now: 100 });
    expect(s).toMatchObject({ air: "tekrar", stage: "entering", from: "var" });
    s = modeReducer(s, { type: "end", transition: { kind: "cut" }, now: 200 });
    expect(s.stage).toBe("idle");
    expect(modeReducer(MODE_IDLE, { type: "take", transition: T, now: 0 })).toBe(MODE_IDLE); // önizleme yok
    expect(modeReducer(MODE_IDLE, { type: "preview", mode: "uzay" }).preview).toBeNull();
    const p = modeReducer(MODE_IDLE, { type: "preview", mode: "ozet" });
    expect(modeReducer(p, { type: "clearPreview", mode: "var" }).preview).toBe("ozet");
    expect(modeReducer(p, { type: "clearPreview", mode: "ozet" }).preview).toBeNull();
  });
  it("geçiş normalleştirme ve ayarlar", () => {
    expect(normalizeTransition("sweep")).toEqual({ kind: "sweep", ms: 1300 });
    expect(normalizeTransition({ kind: "fade", ms: 10 }).ms).toBe(100);
    expect(normalizeTransition({ kind: "yok" }).kind).toBe("fade");
    const c = normalizeModeSettings({ rate: 0.1 });
    expect(c.rate).toBe(0.25);
    expect(c.transition.kind).toBe("stinger");
    expect(c.layers.tekrar.scorebug).toBe(true);
    expect(c.layers.var.scorebug).toBe(false);
    expect(c.layers.roportaj.interview).toBe(true);
  });
});

describe("yayın modları: ek katmanlar", () => {
  it("ekle / güncelle / kaldır, kutular", () => {
    let l = defaultLayers("tekrar");
    l = addExtra(l, { kind: "pip", sourceId: "cam", corner: "tl", size: "l" }, "tekrar");
    l = addExtra(l, { kind: "band", sourceId: "img" }, "tekrar");
    l = addExtra(l, { kind: "pip" }, "tekrar"); // kaynak yok → eklenmez
    expect(l.extras).toHaveLength(2);
    const [pip, band] = l.extras;
    const r = extraRect(pip, 1920, 1080);
    expect(r.x).toBeLessThan(100);
    expect(r.w).toBe(Math.round(1920 * 0.38));
    expect(r.h).toBe(Math.round((r.w * 9) / 16));
    expect(extraRect({ ...pip, corner: "br" }, 1920, 1080).x + r.w).toBeLessThanOrEqual(1920);
    expect(extraRect(band, 1920, 1080)).toEqual({ x: 0, y: 1080 - Math.round(1080 * 0.14), w: 1920, h: Math.round(1080 * 0.14) });
    expect(extraRect({ kind: "layer", sourceId: "x" }, 100, 50)).toEqual({ x: 0, y: 0, w: 100, h: 50 });
    l = updateExtra(l, pip.id, { corner: "zz" }, "tekrar");
    expect(l.extras[0].corner).toBe("br");
    l = removeExtra(l, band.id, "tekrar");
    expect(l.extras.map((e) => e.id)).toEqual([pip.id]);
    expect(normalizeLayers(null, "ozet")).toEqual({ subtitle: false, scorebug: false, interview: false, extras: [] });
  });
  it("grafik anlık görüntüsüne bayraklar", () => {
    const snap = { variant: "scoreboard", subtitle: { onAir: true }, interview: { onAir: false, people: [{ name: "A" }] } };
    const a = snapshotWithLayers(snap, { subtitle: false, scorebug: true, interview: true }, "roportaj");
    expect(a).toMatchObject({ hideSubtitle: true, hideScorebug: false, hideInterview: false, variant: "scoreboard" });
    expect(a.subtitle.onAir).toBe(false);
    expect(a.interview.onAir).toBe(true);
    const b = snapshotWithLayers(snap, { subtitle: true, scorebug: false }, "tekrar");
    expect(b).toMatchObject({ hideScorebug: true, variant: "off", hideInterview: true });
    expect(b.subtitle.onAir).toBe(true);
    expect(b.interview.onAir).toBe(false);
    expect(snap.variant).toBe("scoreboard"); // değiştirilmez
  });
});

describe("VAR v2", () => {
  it("düzenler: tek / ikili / üçlü pencereler kesişmez, sahne içinde, 16:9", () => {
    expect(VAR_LAYOUTS.map((l) => l.key)).toEqual(["single", "two", "three"]);
    for (const l of VAR_LAYOUTS) {
      const L = varLayoutV2(l.key, 1920, 1080);
      expect(L.panes).toHaveLength(l.count);
      for (const p of L.panes) {
        expect(p.rect.w / p.rect.h).toBeCloseTo(16 / 9, 3);
        expect(p.rect.y).toBeGreaterThanOrEqual(L.header.y + L.header.h);
        expect(p.rect.x).toBeGreaterThanOrEqual(L.stage.x - 0.5);
        expect(p.rect.x + p.rect.w).toBeLessThanOrEqual(L.stage.x + L.stage.w + 0.5);
        expect(p.rect.y + p.rect.h).toBeLessThanOrEqual(L.footer.y + 1);
      }
      for (let i = 0; i < L.panes.length; i += 1) {
        for (let j = i + 1; j < L.panes.length; j += 1) {
          const a = L.panes[i].rect; const b = L.panes[j].rect;
          const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
          expect(overlap).toBe(false);
        }
      }
    }
    const three = varLayoutV2("three", 1920, 1080).panes;
    expect(three[0].big).toBe(true);
    expect(three[0].rect.w).toBeGreaterThan(three[1].rect.w * 1.5);
  });
  it("ayarlar: eski türden göç, durum / karar, zaman kodu, tarama", () => {
    const old = normalizeVarV2({ mode: "both", sourceId: "cam", replayId: "r1", angle: "program" });
    expect(old.layout).toBe("two");
    expect(old.slots.slice(0, 2)).toEqual([{ kind: "source", replayId: null, angle: "program", sourceId: "cam" }, { kind: "replay", replayId: "r1", angle: "program", sourceId: null }]);
    expect(activeSlots(old)).toHaveLength(2);
    expect(normalizeVarV2({}).slots).toHaveLength(3);
    expect(varStatus({ state: "review" })).toMatchObject({ label: "İNCELEME", tone: "amber" });
    expect(varStatus({ state: "check" })).toMatchObject({ label: "KONTROL", tone: "blue" });
    expect(varStatus({ state: "decision", decision: "goalOff" })).toMatchObject({ label: "KARAR", text: "GOL İPTAL", tone: "red" });
    expect(varStatus({ state: "decision", decision: "goalOn" }).tone).toBe("green");
    expect(normalizeVarV2({ state: "x", decision: "y" })).toMatchObject({ state: "review", decision: "goalOff" });
    expect(varTimecode(61_500)).toBe("00:01:01.15");
    expect(varTimecode(3_600_000 + 33)).toBe("01:00:00.00");
    expect(varScan(1300, 2600)).toBeCloseTo(0.5, 6);
    expect(varScan(-100, 1000)).toBeCloseTo(0.9, 6);
  });
});

describe("yeni logo geçişleri", () => {
  it("listede; ortada ekran tam örtülü, uçlarda boş; değişim ortada", () => {
    const keys = TRANSITIONS.filter((t) => t.stinger).map((t) => t.key);
    expect(keys).toEqual(STINGER_KEYS);
    expect(keys).toEqual(expect.arrayContaining(["sweep", "panels", "iris", "shards"]));
    for (const k of keys) {
      expect(isStingerKind(k)).toBe(true);
      expect(stingerCoverage(k, 0.5)).toBeCloseTo(1, 6);
      expect(stingerCoverage(k, 0.45)).toBeCloseTo(1, 6);
      expect(stingerCoverage(k, 0.55)).toBeCloseTo(1, 6);
      expect(stingerCoverage(k, 0)).toBe(0);
      expect(stingerCoverage(k, 1)).toBe(0);
      expect(transitionFrame(k, 0.49).to.alpha).toBe(0);
      expect(transitionFrame(k, 0.5).switched).toBe(true);
      expect(transitionMs(k, { [k]: 99999 })).toBe(k === "stinger" ? 2500 : 3000);
    }
    expect(isStingerKind("fade")).toBe(false);
  });
  it("zaman çizelgeleri: logo ortada görünür, sonra söner", () => {
    for (const st of [sweepState(0.5), panelsState(0.5), irisState(0.5), shardsState(0.5)]) {
      expect(st.logo.alpha).toBeGreaterThan(0.8);
      expect(st.switched).toBe(true);
    }
    for (const st of [sweepState(0.95), panelsState(0.95), irisState(0.95), shardsState(0.95)]) expect(st.logo.alpha).toBeLessThan(0.05);
    expect(sweepState(0.2).cover).toBeGreaterThan(0);
    expect(sweepState(0.2).cover).toBeLessThan(1);
    expect(panelsState(0.1).panels[0].lead).toBeGreaterThan(panelsState(0.1).panels[3].lead); // kademeli
    expect(irisState(0.8).hole).toBeGreaterThan(0);
  });
  it("kırıklar: önbellekli geometri, ortada hepsi yerinde, sonda uzakta", () => {
    const g = shardGeometry(1920, 1080);
    expect(g).toBe(shardGeometry(1920, 1080));
    expect(g.list.length).toBe(80);
    for (const s of g.list) {
      expect(shardAt(s, 0.5)).toMatchObject({ k: 0, landed: true });
      expect(shardAt(s, 0.999).k).toBeGreaterThan(0.5);
    }
  });
});

describe("özet: giriş / kapanış kartı zaman çizelgesi", () => {
  it("öğeler sırayla belirir, giriş süresi içinde tamamlanır", () => {
    const a = cardTimeline(0);
    expect(a.logo).toBe(0);
    expect(a.score).toBe(0);
    const mid = cardTimeline(1000);
    expect(mid.logo).toBeGreaterThan(0.9);
    expect(mid.score).toBe(0);
    const end = cardTimeline(INTRO_MS - 200);
    for (const k of ["bg", "logo", "title", "rule", "home", "away", "score", "meta"]) expect(end[k]).toBeCloseTo(1, 6);
    expect(cardTimeline(1000, "outro").score).toBeLessThanOrEqual(cardTimeline(1300, "outro").score);
    expect(OUTRO_MS).toBeGreaterThan(cardTimeline(0, "outro").bg * 0 + 2900 * 0.85);
  });
});

describe("röportaj: ana süreç yanıt biçimleri (durdurulamama hatası)", () => {
  it("kimlik ve dosya hem yeni ({ interview }) hem eski biçimden okunur", () => {
    expect(interviewIdOf({ ok: true, interview: { id: "i1" } })).toBe("i1");
    expect(interviewIdOf({ ok: true, id: "iv1" })).toBe("iv1");
    expect(interviewIdOf({ ok: true })).toBeNull();
    expect(interviewFileOf({ ok: true, interview: { name: "a.mp4" } })).toEqual({ name: "a.mp4" });
    expect(interviewFileOf({ ok: true, file: { name: "b.mp4" } })).toEqual({ name: "b.mp4" });
    expect(interviewFileOf({ ok: false })).toBeNull();
  });
});
