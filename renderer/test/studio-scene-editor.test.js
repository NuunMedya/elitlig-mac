import { describe, expect, it } from "vitest";
import {
  defaultScenesConfig, duplicateLayer, layerStyle, normalizeScenesConfig, replaceScene, sceneTransitionOf, updateLayer, updateScene,
} from "../src/lib/studio/scenes";
import { alignLayer, moveLayer, snapLines } from "../src/lib/studio/scenesTransform";

describe("sahne düzenleyici · katman görünümü", () => {
  it("varsayılan alanlar kayda yazılmaz, sınırlar uygulanır", () => {
    expect(layerStyle({})).toEqual({});
    expect(layerStyle({ opacity: 1, radius: 0, border: { width: 0 }, shadow: { blur: 0 } })).toEqual({});
    expect(layerStyle({ opacity: 2, radius: 3, border: { width: 99, color: "bozuk" }, shadow: { blur: 10, color: "#123456" }, muted: true, name: "  Ana  " }))
      .toEqual({ radius: 0.5, border: { width: 40, color: "#ffffff" }, shadow: { blur: 10, color: "#123456" }, muted: true, name: "Ana" });
  });
  it("updateLayer görünüm alanlarını normalize eder; sıfırlanan alan silinir", () => {
    const c = defaultScenesConfig();
    const sc = c.scenes[0];
    const id = sc.layers[0].id;
    const c1 = updateLayer(c, sc.id, id, { opacity: 0.5, border: { width: 4, color: "#ff0000" } });
    const l1 = c1.scenes[0].layers[0];
    expect(l1.opacity).toBe(0.5);
    expect(l1.border).toEqual({ width: 4, color: "#ff0000" });
    const c2 = updateLayer(c1, sc.id, id, { opacity: 1, border: null });
    expect("opacity" in c2.scenes[0].layers[0]).toBe(false);
    expect("border" in c2.scenes[0].layers[0]).toBe(false);
  });
  it("normalizeScenesConfig görünüm ve sahne alanlarını korur", () => {
    const c = defaultScenesConfig();
    c.scenes[0].bg = "#112233";
    c.scenes[0].transition = { kind: "wipe", ms: 900 };
    c.scenes[0].layers[0].opacity = 0.4;
    const n = normalizeScenesConfig(JSON.parse(JSON.stringify(c)));
    expect(n.scenes[0].bg).toBe("#112233");
    expect(n.scenes[0].transition).toEqual({ kind: "wipe", ms: 900 });
    expect(n.scenes[0].layers[0].opacity).toBe(0.4);
  });
  it("katmanı çoğaltır (hemen üstüne, kilitsiz)", () => {
    const c = defaultScenesConfig();
    const sc = c.scenes.find((s) => s.id === "sc_pip");
    const { config, layer } = duplicateLayer(c, sc.id, "ly_p2");
    const after = config.scenes.find((s) => s.id === sc.id).layers;
    expect(after).toHaveLength(3);
    expect(after[2].id).toBe(layer.id);
    expect(layer.sourceId).toBe(sc.layers[1].sourceId);
    expect(layer.x).toBeGreaterThan(sc.layers[1].x);
  });
});

describe("sahne düzenleyici · sahne ayarları", () => {
  it("zemin, geçiş, ad; null kaldırır; replaceScene geri koyar", () => {
    const c = defaultScenesConfig();
    const id = c.scenes[0].id;
    const c1 = updateScene(c, id, { bg: "#ff00aa", transition: { kind: "fade", ms: 300 }, name: "Yeni" });
    expect(c1.scenes[0]).toMatchObject({ bg: "#ff00aa", transition: { kind: "fade", ms: 300 }, name: "Yeni" });
    expect(sceneTransitionOf(c1, id)).toEqual({ kind: "fade", ms: 300 });
    const c2 = updateScene(c1, id, { bg: null, transition: null });
    expect(c2.scenes[0].bg).toBeUndefined();
    expect(sceneTransitionOf(c2, id)).toBeNull();
    const c3 = replaceScene(c2, id, c.scenes[0]);
    expect(c3.scenes[0]).toEqual(c.scenes[0]);
  });
});

describe("sahne düzenleyici · hizala ve yapış", () => {
  it("hizalama ekrana göre", () => {
    const t = { x: 0.3, y: 0.3, w: 0.2, h: 0.4 };
    expect(alignLayer(t, "left")).toEqual({ x: 0 });
    expect(alignLayer(t, "right").x).toBeCloseTo(0.8);
    expect(alignLayer(t, "vcenter").y).toBeCloseTo(0.3);
    expect(alignLayer(t, "x")).toBeNull();
  });
  it("öbür katmanın kenarına yapışır", () => {
    const layers = [{ id: "a", x: 0.62, y: 0.2, w: 0.2, h: 0.2, visible: true }, { id: "b", x: 0.1, y: 0.7, w: 0.1, h: 0.1, visible: true }];
    const lines = snapLines(layers, "b");
    const m = moveLayer({ x: 0.1, y: 0.7, w: 0.1, h: 0.1 }, 0.417, -0.29, { ...lines });
    expect(m.x).toBeCloseTo(0.52); // sağ kenar 0.62 çizgisine
    expect(m.guides.some((g) => g.axis === "x" && Math.abs(g.at - 0.62) < 1e-9)).toBe(true);
    const free = moveLayer({ x: 0.1, y: 0.7, w: 0.1, h: 0.1 }, 0.395, -0.29, { snap: false });
    expect(free.x).toBeCloseTo(0.495);
  });
});
