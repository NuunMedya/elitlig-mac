import { DEFAULT_RAIL, RAIL_KEY, RAIL_WIDGETS, addWidget, canAdd, loadRail, moveWidget, normalizeRail, removeWidget, saveRail, toggleWidgetSize } from "../src/views/studio/shortcuts/railModel";
import { HOTKEY_ACTIONS, normalizeSettings } from "../src/views/studio/settings/settings";
import { keyAction } from "../src/lib/studio/broadcast";

const mem = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };

describe("kısayol şeridi modeli", () => {
  it("kayıt yoksa varsayılan; bozuk / bilinmeyen öğeler ayıklanır, kopyalar atılır", () => {
    expect(loadRail(mem()).map((x) => x.type)).toEqual(DEFAULT_RAIL.map((x) => x.type));
    const n = normalizeRail([{ id: "a", type: "mic", size: 2 }, { id: "b", type: "yok" }, { id: "c", type: "mic" }, { type: "scene", opts: { sceneId: "s1" } }, { type: "scene", opts: { sceneId: "s1" } }, { type: "scene", opts: { sceneId: "s2" } }]);
    expect(n.map((x) => x.type)).toEqual(["mic", "scene", "scene"]);
    expect(n[0]).toMatchObject({ id: "a", size: 2 });
    expect(n.every((x) => x.id)).toBe(true);
  });
  it("ekle / kaldır / boyutla / taşı", () => {
    let l = normalizeRail([{ id: "a", type: "mic" }, { id: "b", type: "var" }, { id: "c", type: "moment" }]);
    expect(canAdd(l, "mic")).toBe(false);
    expect(addWidget(l, "mic")).toBe(l);
    l = addWidget(l, "replay");
    expect(l.at(-1)).toMatchObject({ type: "replay", size: 2 });
    l = addWidget(l, "scene", { opts: { sceneId: "s1" } });
    expect(addWidget(l, "scene", { opts: { sceneId: "s1" } })).toBe(l);
    expect(canAdd(l, "scene")).toBe(true);
    l = toggleWidgetSize(l, "a");
    expect(l[0].size).toBe(2);
    expect(moveWidget(l, "c", "a").slice(0, 3).map((x) => x.id)).toEqual(["c", "a", "b"]);
    expect(moveWidget(l, "a", "c").slice(0, 3).map((x) => x.id)).toEqual(["b", "c", "a"]);
    expect(moveWidget(l, "a", null).at(-1).id).toBe("a");
    expect(removeWidget(l, "b").some((x) => x.id === "b")).toBe(false);
  });
  it("kaydet / yükle", () => {
    const s = mem();
    saveRail(s, [{ id: "x", type: "led", size: 2 }]);
    expect(JSON.parse(s.getItem(RAIL_KEY)).items).toHaveLength(1);
    expect(loadRail(s)).toEqual([{ id: "x", type: "led", size: 2 }]);
  });
  it("parçacıkların tuş eylemleri Ayarlar › Klavye kısayollarında atanabilir", () => {
    const keys = new Set(HOTKEY_ACTIONS.map((a) => a.key));
    for (const w of RAIL_WIDGETS) if (w.hotkey) expect(keys.has(w.hotkey)).toBe(true);
    const s = normalizeSettings({ hotkeys: { event: ["o"], goalHome: ["j"] } });
    expect(s.hotkeys.event).toEqual(["o"]);
    expect(s.hotkeys.fullscreen).toEqual([]);
    const ev = (key) => ({ key, target: { tagName: "DIV" } });
    expect(keyAction(ev("o"), { hotkeys: s.hotkeys })).toEqual({ type: "event" });
    expect(keyAction(ev("j"), { hotkeys: s.hotkeys })).toEqual({ type: "goalHome" });
  });
});
