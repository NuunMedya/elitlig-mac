// @vitest-environment jsdom
// Dışarı giden tüm sesleri kapat: durum deposu, ana süreç köprüsü, makro adımı, kısayol, parçacıklar.
import { describe, expect, it, vi } from "vitest";
import { getOutMute, normalizeOutMute, outMuteLabel, setOutMute, toggleOutMute } from "../src/views/studio/audio/outMute";
import { normalizeStep, runStep } from "../src/views/studio/shortcuts/macros";
import { HOTKEY_ACTIONS } from "../src/views/studio/settings/settings";
import { SES_WIDGETS } from "../src/views/studio/shortcuts/wSes";
import { RAIL_WIDGETS } from "../src/views/studio/shortcuts/railModel";

describe("dış ses", () => {
  it("aç / kapat / kapsam; ana sürece iletilir; etiket", async () => {
    const set = vi.fn(async () => ({ ok: true }));
    window.elitlig = { studio: { outMute: { set } } };
    expect(normalizeOutMute({ on: 1, scope: "x" })).toEqual({ on: true, scope: "local" });
    expect(getOutMute().on).toBe(false);
    setOutMute(true);
    expect(getOutMute()).toEqual({ on: true, scope: "local" });
    expect(set).toHaveBeenLastCalledWith(true);
    expect(outMuteLabel(getOutMute())).toBe("DIŞ SES KAPALI");
    setOutMute(true, { scope: "all" });
    expect(outMuteLabel(getOutMute())).toBe("TÜM SES KAPALI");
    toggleOutMute();
    expect(getOutMute().on).toBe(false);
    expect(set).toHaveBeenLastCalledWith(false);
    setOutMute(false, { scope: "local" });
    delete window.elitlig;
  });
  it("kısayol atanabilir, parçacıklar ve katalog", () => {
    expect(HOTKEY_ACTIONS.some((a) => a.key === "outMute")).toBe(true);
    for (const t of ["outMute", "outMuteMeter"]) {
      expect(SES_WIDGETS[t]?.render).toBeTypeOf("function");
      expect(RAIL_WIDGETS.some((w) => w.type === t)).toBe(true);
    }
  });
  it("makro adımı: kapat (yayın dahil) / aç", async () => {
    const calls = [];
    const C = { outMute: { on: false, scope: "local", set: (on, o) => calls.push([on, o.scope]) } };
    const step = normalizeStep({ type: "outMute", action: "on", all: true });
    expect(step).toEqual({ type: "outMute", action: "on", all: true });
    {
      await runStep(step, C);
      await runStep(normalizeStep({ type: "outMute", action: "off" }), C);
      expect(calls).toEqual([[true, "all"], [false, "local"]]);
    }
  });
});
