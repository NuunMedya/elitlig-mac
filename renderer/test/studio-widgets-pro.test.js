// Çok işlevli düğmeler: akış mantığı (gol, kart, değişiklik, penaltı, olay), ses ön ayarı,
// kısma, kuyruk / açı dizisi, sahne adımı, katalog kayıtları ve pano boyutları.
import { describe, expect, it } from "vitest";
import {
  CARD_REASONS, GOAL_KINDS, PENALTY_RESULTS, STAT_CODES, applyMixerSnapshot, cardBack, cardForm, cardPickColor, cardPickPlayer, cardPickReason, cardPickTeam, cardStart,
  duckedDb, dumpLeft, evBack, evForm, evPickPlayer, evPickTeam, evPickType, evStart, filterPlayers, goalAsksAssist, goalBack, goalEventSide, goalForms, goalPickAssist,
  goalPickKind, goalPickScorer, goalReplays, goalStart, hasCode, jogTo, mixerSnapshot, penForm, penPickPlayer, penPickResult, penPickTeam, penPlayerSide, penStart,
  pickStrips, ringDash, sceneStep, seqMove, seqToggle, shapeOf, subBack, subForm, subPickIn, subPickOut, subPickTeam, subStart, teamStats,
} from "../src/views/studio/shortcuts/flowLogic";
import { normalizeAudio, patchStrip } from "../src/lib/studio/audio";
import { PRESET_RAILS, DEFAULT_RAIL, RAIL_GROUPS, RAIL_WIDGETS, boardWidgetSize, widgetOf } from "../src/views/studio/shortcuts/railModel";
import { LAYOUT_COMPONENTS, widgetSize } from "../src/views/studio/layout/layoutModel";
import { WIDGET_IMPL } from "../src/views/studio/shortcuts/widgets";

describe("gol akışı", () => {
  it("tür → golcü → asist → iki form", () => {
    let st = goalStart("home");
    expect(st.step).toBe("kind");
    st = goalPickKind(st, "GOAL_HEADER");
    expect(st.step).toBe("scorer");
    st = goalPickScorer(st, 10);
    expect(st.step).toBe("assist");
    expect(goalBack(st).step).toBe("scorer");
    st = goalPickAssist(st, 7);
    expect(st.step).toBe("done");
    expect(goalForms(st)).toEqual([
      { side: "home", code: "GOAL_HEADER", playerId: "10", note: "" },
      { side: "home", code: "ASSIST", playerId: "7", note: "" },
    ]);
  });
  it("asist atlanır, golcü = asist olamaz; penaltı ve kendi kalesine asist sormaz", () => {
    let st = goalPickScorer(goalPickKind(goalStart("away"), "GOAL_LEFT_FOOT"), "5");
    st = goalPickAssist(st, "5");
    expect(goalForms(st)).toHaveLength(1);
    expect(goalAsksAssist("GOAL_PENALTY")).toBe(false);
    expect(goalPickScorer(goalPickKind(goalStart("home"), "GOAL_PENALTY"), 3).step).toBe("done");
  });
  it("kendi kalesine: olay rakip oyuncunun, yararlanan basılan takım", () => {
    expect(goalEventSide("home", "GOAL_OWN")).toBe("away");
    const st = goalPickScorer(goalPickKind(goalStart("home"), "GOAL_OWN"), 22);
    expect(st.step).toBe("done");
    expect(goalForms(st)).toEqual([{ side: "away", code: "GOAL_OWN", playerId: "22", note: "" }]);
  });
  it("tür hazırsa golcüden başlar; golcüsüz kayıt", () => {
    const st = goalPickScorer(goalStart("home", "GOAL_FREEKICK"), null);
    expect(st.step).toBe("done");
    expect(goalForms(st)[0]).toMatchObject({ code: "GOAL_FREEKICK", playerId: "" });
  });
  it("tür çipleri yalnız sunucunun tanıdığı kodlar, kendi kalesine sonda", () => {
    expect(GOAL_KINDS.every((k) => hasCode(k.code))).toBe(true);
    expect(GOAL_KINDS.at(-1).code).toBe("GOAL_OWN");
    expect(GOAL_KINDS.map((k) => k.code)).toEqual(expect.arrayContaining(["GOAL_RIGHT_FOOT", "GOAL_LEFT_FOOT", "GOAL_HEADER", "GOAL_PENALTY", "GOAL_FREEKICK"]));
  });
});

describe("kart, değişiklik, penaltı, olay akışları", () => {
  it("kart: renk → takım → oyuncu → neden", () => {
    let st = cardStart();
    expect(st.step).toBe("color");
    st = cardPickTeam(cardPickColor(st, "red"), "away");
    st = cardPickReason(cardPickPlayer(st, 9), "İtiraz");
    expect(cardForm(st)).toEqual({ side: "away", code: "RED_CARD", playerId: "9", note: "İtiraz" });
    expect(cardStart({ color: "yellow", side: "home" }).step).toBe("player");
    expect(cardBack(cardStart({ color: "yellow" })).step).toBe("color");
    expect(CARD_REASONS.length).toBeGreaterThan(3);
  });
  it("değişiklik: çıkan → giren (aynı oyuncu olamaz)", () => {
    let st = subPickOut(subPickTeam(subStart(), "home"), 4);
    expect(subPickIn(st, 4)).toBe(st);
    expect(subBack(st).step).toBe("out");
    st = subPickIn(st, 12);
    expect(subForm(st)).toEqual({ side: "home", code: "SUBSTITUTION", outId: "4", inId: "12", playerId: "" });
  });
  it("penaltı: gol / kaçtı / kurtarıldı (kurtarışta rakip kaleci)", () => {
    const base = penPickTeam(penStart(), "home");
    expect(penForm(penPickPlayer(penPickResult(base, "goal"), 10))).toMatchObject({ side: "home", code: "GOAL_PENALTY", playerId: "10" });
    expect(penForm(penPickPlayer(penPickResult(base, "miss"), 10))).toMatchObject({ side: "home", code: "CHANCE_CREATED", note: "Penaltı kaçtı" });
    const saved = penPickResult(base, "saved");
    expect(penPlayerSide(saved)).toBe("away");
    expect(penForm(penPickPlayer(saved, 1))).toMatchObject({ side: "away", code: "SAVE", playerId: "1" });
    expect(PENALTY_RESULTS.map((r) => r.key)).toEqual(["goal", "miss", "saved"]);
  });
  it("evrensel olay: tür → takım → oyuncu; korner sunucuda yok", () => {
    let st = evPickType(evStart(), "FOUL", "player");
    expect(evBack(st).step).toBe("type");
    st = evPickPlayer(evPickTeam(st, "away"), 8);
    expect(evForm(st)).toEqual({ side: "away", code: "FOUL", playerId: "8", note: "" });
    expect(STAT_CODES.some((s) => s.code === "CORNER")).toBe(false);
    expect(STAT_CODES.some((s) => s.code === "FOUL")).toBe(true);
  });
  it("takım istatistiği: kendi kalesine rakibe gol", () => {
    const ev = (t, c) => ({ takim_id: t, olay_kodu: c });
    const s = teamStats([ev(3, "GOAL_HEADER"), ev(8, "GOAL_OWN"), ev(8, "YELLOW_CARD"), ev(3, "FOUL"), ev(3, "SUBSTITUTION")], 3, 8);
    expect(s.home).toMatchObject({ goals: 2, fouls: 1, subs: 1 });
    expect(s.away).toMatchObject({ goals: 0, yellow: 1 });
  });
  it("oyuncu ızgarası: no / ad araması, ilk 11 önce, tercih edilenler önde", () => {
    const list = [{ id: "1", name: "Ali", number: "9", role: "bench" }, { id: "2", name: "Veli", number: "10", role: "starter" }];
    expect(filterPlayers(list).map((p) => p.id)).toEqual(["2", "1"]);
    expect(filterPlayers(list, "9").map((p) => p.id)).toEqual(["1"]);
    expect(filterPlayers(list, "", { exclude: ["2"] }).map((p) => p.id)).toEqual(["1"]);
    expect(filterPlayers(list, "", { prefer: [{ id: "1" }] }).map((p) => p.id)).toEqual(["1", "2"]);
  });
});

describe("ses: ön ayar, kısma, sessize al", () => {
  it("anlık görüntü kaydedilir ve geri çağrılır (mikrofon sessizi kendi alanına)", () => {
    let a = normalizeAudio({});
    a = patchStrip(a, "mic", { fader: -6, mute: true });
    a = patchStrip(a, "music", { fader: -20 });
    const snap = mixerSnapshot({ ...a, master: { fader: -3 } }, { name: "Röportaj" });
    expect(snap.name).toBe("Röportaj");
    let b = patchStrip(patchStrip(normalizeAudio({}), "mic", { fader: 0, mute: false }), "music", { fader: 0 });
    b = applyMixerSnapshot(b, snap, patchStrip);
    expect(b.strips.mic).toMatchObject({ fader: -6, mute: true });
    expect(b.mic.muted).toBe(true);
    expect(b.strips.music.fader).toBe(-20);
    expect(b.master.fader).toBe(-3);
  });
  it("kısma, kanal seçimi, sessize al geri sayımı", () => {
    expect(duckedDb(0, 12)).toBe(-12);
    expect(duckedDb(-55, 12)).toBe(-60);
    const strips = [{ id: "mic" }, { id: "media" }, { id: "music" }];
    expect(pickStrips(strips, ["music", "x", "mic"], 4).map((s) => s.id)).toEqual(["music", "mic"]);
    expect(pickStrips(strips, null, 2).map((s) => s.id)).toEqual(["mic", "media"]);
    expect(dumpLeft(10_000, 5000, 7500)).toEqual({ left: 2500, frac: 0.5, active: true });
    expect(dumpLeft(null, 5000).active).toBe(false);
  });
});

describe("tekrar ve sahne yardımcıları", () => {
  it("açı dizisi / kuyruk: ekle, çıkar, öne al", () => {
    let q = seqToggle([], "a");
    q = seqToggle(q, "b");
    q = seqToggle(q, "c");
    expect(seqMove(q, 2, -1)).toEqual(["a", "c", "b"]);
    expect(seqMove(q, 0, -1)).toBe(q);
    expect(seqToggle(q, "b")).toEqual(["a", "c"]);
  });
  it("son goller, jog sınırları, sahne adımı, halka, biçim", () => {
    const r = (id, kind, url = "u") => ({ id, kind, angles: [{ angle: "program", url }] });
    expect(goalReplays([r(1, "goal"), r(2, "moment"), r(3, "goal", null), r(4, "goal")], 5).map((x) => x.id)).toEqual([1, 4]);
    expect(jogTo(0.5, -1, 10)).toBe(0);
    expect(jogTo(9.5, 1, 10)).toBeCloseTo(9.99);
    const sc = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(sceneStep(sc, "a", 1)).toBe("b");
    expect(sceneStep(sc, "a", -1)).toBe("c");
    expect(sceneStep(sc, null, 1)).toBe("a");
    expect(ringDash(0.5, 10).dash.split(" ")[0]).toBe((Math.PI * 10).toFixed(2));
    expect([shapeOf(1, 1), shapeOf(1, 2), shapeOf(2, 1), shapeOf(2, 2), shapeOf(4, 2)]).toEqual(["small", "tall", "wide", "big", "huge"]);
  });
});

describe("katalog ve pano boyutları", () => {
  it("her çeşidin parçacığı ve kategorisi var; dokuz kategori", () => {
    expect(RAIL_GROUPS.map((g) => g.key)).toEqual(["reji", "ses", "tekrar", "grafik", "sahne", "yayin", "var", "roportaj", "muzik", "led", "ozet", "mac", "genel"]);
    const groups = new Set(RAIL_GROUPS.map((g) => g.key));
    for (const w of RAIL_WIDGETS) {
      expect(WIDGET_IMPL[w.type], w.type).toBeTruthy();
      expect(groups.has(w.group), w.type).toBe(true);
      expect(w.sizes.includes(w.size), w.type).toBe(true);
      expect(LAYOUT_COMPONENTS.some((c) => c.key === `w:${w.type}`)).toBe(true);
    }
    for (const g of RAIL_GROUPS) expect(RAIL_WIDGETS.filter((w) => w.group === g.key).length, g.key).toBeGreaterThanOrEqual(2);
    expect(RAIL_WIDGETS.length).toBeGreaterThanOrEqual(80);
  });
  it("3×2 / 4×2 yalnız izin verenlerde; ötekiler 2 en'e iner", () => {
    expect(boardWidgetSize("goalProBoth", 4, 4)).toBe("4x2");
    expect(boardWidgetSize("goalProBoth", 3, 4)).toBe("3x2");
    expect(boardWidgetSize("mic", 4, 4)).toBe("2x2");
    expect(boardWidgetSize("angleSeq", 1, 2)).toBe("2x2");
    expect(widgetSize("4x2")).toEqual([4, 4]);
  });
  it("varsayılan ve hazır düzen şeritleri iki sütuna sığar, bilinen türler", () => {
    for (const list of [DEFAULT_RAIL, ...Object.values(PRESET_RAILS)]) {
      for (const it of list) {
        expect(widgetOf(it.type), it.type).toBeTruthy();
        expect(it.w).toBeLessThanOrEqual(2);
        expect(widgetOf(it.type).sizes).toContain(`${it.w}x${it.h}`);
      }
    }
    expect(Object.keys(PRESET_RAILS)).toEqual(["reji", "ses", "tekrar"]);
  });
});
