// GOL düğmeleri: asist sorulmadan (Hızlı gol), yalnız tür + "Golcü sonra" (bekleyen gol), seçenek / ayar.
import { describe, expect, it, beforeEach } from "vitest";
import { assistWanted, goalForms, goalHasAssistStep, goalPickKind, goalPickScorer, goalStart } from "../src/views/studio/shortcuts/flowLogic";
import { addPending, clearPending, listPending, needsPlayerError, pendingForm, resolvePending } from "../src/views/studio/shortcuts/goalPending";
import { DEFAULT_OPS, normalizeOps } from "../src/views/studio/settings/opsDefaults";
import { REJI_WIDGETS } from "../src/views/studio/shortcuts/wReji";
import { RAIL_WIDGETS as WIDGET_TYPES } from "../src/views/studio/shortcuts/railModel";

describe("asist sorusu", () => {
  it("varsayılan: sorulmaz (Ayarlar › Reji / Maç kapalı); düğme seçeneği ezer", () => {
    expect(DEFAULT_OPS.mac.askAssist).toBe(false);
    expect(normalizeOps({}).mac.askAssist).toBe(false);
    expect(normalizeOps({ mac: { askAssist: true } }).mac.askAssist).toBe(true);
    expect(assistWanted("default", false)).toBe(false);
    expect(assistWanted(undefined, true)).toBe(true);
    expect(assistWanted("ask", false)).toBe(true);
    expect(assistWanted("skip", true)).toBe(false);
  });
  it("asist kapalı: tür → golcü → hemen kayıt, tek form", () => {
    let st = goalStart("home", null, { askAssist: false });
    st = goalPickScorer(goalPickKind(st, "GOAL_HEADER"), 10);
    expect(st.step).toBe("done");
    expect(goalHasAssistStep(st)).toBe(false);
    expect(goalForms(st)).toEqual([{ side: "home", code: "GOAL_HEADER", playerId: "10", note: "" }]);
  });
});

describe("golcü sonra: bekleyen gol", () => {
  beforeEach(() => clearPending());
  it("gol bekletilir, golcü sonra seçilince golün dakikasıyla form", () => {
    const p = addPending({ matchId: 7, side: "home", code: "GOAL_OWN", minute: 23, period: 1, clipKey: "c1" });
    expect(listPending(7)).toHaveLength(1);
    expect(listPending(8)).toHaveLength(0);
    expect(pendingForm(p, 201, "away")).toEqual({ side: "away", code: "GOAL_OWN", playerId: "201", note: "", minute: 23, period: 1 });
    resolvePending(p.id);
    expect(listPending()).toHaveLength(0);
    expect(needsPlayerError({ code: "OYUNCU_ID_REQUIRED" })).toBe(true);
  });
});

describe("yeni gol düğmeleri", () => {
  it("Hızlı gol ve Yalnız tür düğmeleri katalogda ve uygulamada", () => {
    for (const t of ["goalQuickHome", "goalQuickAway", "goalQuickBoth", "goalKindHome", "goalKindAway", "goalKindBoth"]) {
      expect(REJI_WIDGETS[t]?.render, t).toBeTypeOf("function");
      expect(REJI_WIDGETS[t]?.popover, t).toBeTypeOf("function");
      expect(WIDGET_TYPES.some((w) => w.type === t), t).toBe(true);
    }
    expect(REJI_WIDGETS.goalProHome.options.map((f) => f.key)).toContain("assist");
  });
});
