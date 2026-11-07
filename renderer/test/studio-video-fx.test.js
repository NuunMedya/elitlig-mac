import { describe, expect, it } from "vitest";
import {
  FX_DEFAULTS, FX_PRESETS, addCustomPreset, applyFxPixel, applyPreset, cbcr, compactFx, cssFilterOf, effectiveFx,
  fxActive, fxKey, fxOrientOnly, fxOutputSize, fxUniforms, hueMatrix, loadCustomPresets, mapUv, migrateSourceFx,
  normalizeCustomPresets, normalizeLayerFx, presetMatches, removeCustomPreset, resetFx, resolveFx, saturationMatrix, saveCustomPresets,
} from "../src/lib/studio/videoFx";
import { normalizeScenesConfig, normalizeLayer, updateLayer, updateSourceFx, sourceDefaults } from "../src/lib/studio/scenes";

const close = (a, b, eps = 1e-3) => a.forEach((x, i) => expect(x).toBeCloseTo(b[i], -Math.log10(eps)));

describe("görüntü ayarı modeli", () => {
  it("varsayılan: etkisiz, kayda yazılmaz", () => {
    expect(fxActive(null)).toBe(false);
    expect(fxActive({})).toBe(false);
    expect(compactFx({})).toBeNull();
    expect(compactFx(FX_DEFAULTS)).toBeNull();
    expect(resolveFx(undefined)).toEqual(resolveFx({}));
  });

  it("sınırlar ve bozuk değerler temizlenir", () => {
    const f = resolveFx({ brightness: 500, contrast: "abc", hue: -999, gamma: 0, rotate: 95, mono: "xx", chroma: { on: 1, color: "red", similarity: 0 } });
    expect(f.brightness).toBe(100);
    expect(f.contrast).toBe(0);
    expect(f.hue).toBe(-180);
    expect(f.gamma).toBe(0.3);
    expect(f.rotate).toBe(90);
    expect(f.mono).toBe("none");
    expect(f.chroma.on).toBe(false);
    expect(f.chroma.color).toBe("#00ff00");
    expect(f.chroma.similarity).toBe(1);
  });

  it("compactFx yalnız farklı alanları tutar; kapalı kroma ayarı korunur", () => {
    expect(compactFx({ brightness: 10, contrast: 0, flipH: true })).toEqual({ brightness: 10, flipH: true });
    const c = compactFx({ chroma: { on: false, color: "#0000FF" } });
    expect(c.chroma).toMatchObject({ on: false, color: "#0000ff" });
    expect(fxActive(c)).toBe(false);
    expect(fxActive({ chroma: { on: true } })).toBe(true);
  });

  it("yalnız çevirme: 2D dönüşüm yolu", () => {
    expect(fxOrientOnly({ flipH: true })).toEqual({ flipH: true, flipV: false });
    expect(fxOrientOnly({ flipH: true, brightness: 3 })).toBeNull();
    expect(fxOrientOnly({ rotate: 90 })).toBeNull();
    expect(fxOrientOnly({})).toBeNull();
  });

  it("fxKey kararlı ve alan sırasından bağımsız", () => {
    expect(fxKey({ a: 1, brightness: 5, contrast: 2 })).toBe(fxKey({ contrast: 2, brightness: 5 }));
    expect(fxKey({ brightness: 5 })).not.toBe(fxKey({ brightness: 6 }));
  });
});

describe("renk matematiği", () => {
  it("varsayılan ayar pikseli değiştirmez", () => {
    close(applyFxPixel({}, [0.2, 0.5, 0.8]).slice(0, 3), [0.2, 0.5, 0.8]);
    expect(applyFxPixel({}, [0.2, 0.5, 0.8])[3]).toBe(1);
  });

  it("doygunluk −100 gri, ton döndürme griyi değiştirmez", () => {
    const [r, g, b] = applyFxPixel({ saturation: -100 }, [0.9, 0.2, 0.1]);
    expect(Math.abs(r - g)).toBeLessThan(1e-6);
    expect(Math.abs(g - b)).toBeLessThan(1e-6);
    close(applyFxPixel({ hue: 120 }, [0.4, 0.4, 0.4]).slice(0, 3), [0.4, 0.4, 0.4]);
    close(saturationMatrix(1), [1, 0, 0, 0, 1, 0, 0, 0, 1]);
    close(hueMatrix(0), [1, 0, 0, 0, 1, 0, 0, 0, 1]);
  });

  it("parlaklık / pozlama / gama aydınlatır, kontrast orta griyi korur", () => {
    const base = [0.3, 0.3, 0.3];
    expect(applyFxPixel({ brightness: 50 }, base)[0]).toBeGreaterThan(0.3);
    expect(applyFxPixel({ exposure: 1 }, base)[0]).toBeCloseTo(0.6, 5);
    expect(applyFxPixel({ gamma: 2 }, base)[0]).toBeCloseTo(Math.sqrt(0.3), 5);
    close(applyFxPixel({ contrast: 60 }, [0.5, 0.5, 0.5]).slice(0, 3), [0.5, 0.5, 0.5]);
    expect(applyFxPixel({ contrast: 60 }, [0.7, 0.7, 0.7])[0]).toBeGreaterThan(0.7);
  });

  it("sıcaklık kırmızıyı artırır maviyi azaltır; renk tonu yeşili", () => {
    const [r, , b] = applyFxPixel({ temperature: 100 }, [0.5, 0.5, 0.5]);
    expect(r).toBeGreaterThan(0.5);
    expect(b).toBeLessThan(0.5);
    const cool = applyFxPixel({ temperature: -100 }, [0.5, 0.5, 0.5]);
    expect(cool[2]).toBeGreaterThan(cool[0]);
    expect(applyFxPixel({ tint: 100 }, [0.5, 0.5, 0.5])[1]).toBeLessThan(0.5);
  });

  it("siyah-beyaz / sepya / negatif", () => {
    const bw = applyFxPixel({ mono: "bw" }, [1, 0, 0]);
    expect(bw[0]).toBeCloseTo(0.2126, 4);
    expect(bw[1]).toBeCloseTo(bw[2], 6);
    const sp = applyFxPixel({ mono: "sepia" }, [0.5, 0.5, 0.5]);
    expect(sp[0]).toBeGreaterThan(sp[2]);
    close(applyFxPixel({ invert: true }, [0.2, 0.5, 0.9]).slice(0, 3), [0.8, 0.5, 0.1]);
  });

  it("kenar karartma: merkez aynı, köşe karanlık", () => {
    expect(applyFxPixel({ vignette: 100 }, [1, 1, 1], [0.5, 0.5])[0]).toBeCloseTo(1, 5);
    expect(applyFxPixel({ vignette: 100 }, [1, 1, 1], [0, 0])[0]).toBeLessThan(0.15);
  });

  it("yeşil perde: yeşil saydam, ten rengi kalır, taşma azalır", () => {
    const fx = { chroma: { on: true, color: "#00ff00", similarity: 40, smoothness: 8, spill: 10 } };
    expect(applyFxPixel(fx, [0.05, 0.85, 0.1])[3]).toBe(0);
    expect(applyFxPixel(fx, [0.85, 0.6, 0.45])[3]).toBe(1);
    // yeşilimsi kenar: kısmen saydam ve doygunluğu düşer
    const edge = applyFxPixel({ chroma: { on: true, similarity: 50, smoothness: 40, spill: 60 } }, [0.4, 0.75, 0.4]);
    expect(edge[3]).toBeGreaterThan(0);
    expect(edge[3]).toBeLessThan(1);
    expect(edge[1] - edge[0]).toBeLessThan(0.35);
    const [cb, cr] = cbcr([0.5, 0.5, 0.5]);
    expect(cb).toBeCloseTo(0.5, 4);
    expect(cr).toBeCloseTo(0.5, 4);
  });

  it("fxUniforms: kroma kapalıysa null, keskinlik ölçeklenir", () => {
    expect(fxUniforms({}).chroma).toBeNull();
    expect(fxUniforms({ sharpen: 100 }).sharpen).toBeCloseTo(1.6, 6);
    expect(fxUniforms({ gamma: 2 }).invGamma).toBe(0.5);
  });

  it("yön: uv eşleme ve çıkış boyutu", () => {
    expect(mapUv([0, 0], { rotate: 90 })).toEqual([0, 1]);
    expect(mapUv([1, 0], { rotate: 90 })).toEqual([0, 0]);
    expect(mapUv([0.25, 0.5], { flipH: true })).toEqual([0.75, 0.5]);
    expect(mapUv([0.25, 0.1], { rotate: 180 })).toEqual([0.75, 0.9]);
    expect(fxOutputSize(1920, 1080, 0)).toEqual({ w: 1920, h: 1080 });
    expect(fxOutputSize(1920, 1080, 90)).toEqual({ w: 1080, h: 1920 });
    expect(fxOutputSize(3840, 2160, 0)).toEqual({ w: 1920, h: 1080 });
    expect(fxOutputSize(1280, 720, 270)).toEqual({ w: 720, h: 1280 });
  });

  it("2D yedek yol filtre dizgisi", () => {
    expect(cssFilterOf({})).toBe("none");
    const s = cssFilterOf({ contrast: 50, saturation: -100, hue: 30, mono: "sepia", invert: true, blur: 4 });
    expect(s).toContain("contrast(1.600)");
    expect(s).toContain("saturate(0.000)");
    expect(s).toContain("hue-rotate(30deg)");
    expect(s).toContain("sepia(1)");
    expect(s).toContain("invert(1)");
    expect(s).toContain("blur(4.0px)");
  });
});

describe("hazır ayarlar", () => {
  it("istenen hazır ayarlar var", () => {
    const names = FX_PRESETS.map((p) => p.name);
    for (const n of ["Doğal", "Canlı", "Sinematik", "Sıcak", "Soğuk", "Gece sahası (aydınlat)", "Siyah-beyaz", "Yüksek kontrast"]) expect(names).toContain(n);
  });

  it("hazır ayar görünümü değiştirir, yön ve kromayı korur", () => {
    const cur = { brightness: 40, flipH: true, rotate: 90, chroma: { on: true, color: "#00ff00" } };
    const out = applyPreset(cur, FX_PRESETS.find((p) => p.id === "warm"));
    expect(out.brightness).toBeUndefined();
    expect(out.temperature).toBe(38);
    expect(out.flipH).toBe(true);
    expect(out.rotate).toBe(90);
    expect(out.chroma.on).toBe(true);
    expect(presetMatches(out, FX_PRESETS.find((p) => p.id === "warm"))).toBe(true);
    expect(presetMatches(out, FX_PRESETS.find((p) => p.id === "cool"))).toBe(false);
    expect(applyPreset({ brightness: 5 }, FX_PRESETS[0])).toBeNull();
  });

  it("sıfırla: görünüm ve kroma kapanır, yön kalır", () => {
    const r = resetFx({ contrast: 20, flipV: true, chroma: { on: true, color: "#0000ff" } });
    expect(r.contrast).toBeUndefined();
    expect(r.flipV).toBe(true);
    expect(r.chroma.on).toBe(false);
    expect(r.chroma.color).toBe("#0000ff");
    expect(resetFx({ contrast: 1 }, { keepOrientation: false })).toBeNull();
  });

  it("özel hazır ayar: ekle, aynı adın üzerine yaz, sil, sakla", () => {
    let list = addCustomPreset([], "Akşam", { contrast: 10, flipH: true, chroma: { on: true } });
    expect(list).toHaveLength(1);
    expect(list[0].fx).toEqual({ contrast: 10 });
    list = addCustomPreset(list, "akşam", { contrast: 20 });
    expect(list).toHaveLength(1);
    expect(list[0].fx.contrast).toBe(20);
    expect(addCustomPreset(list, "  ", { contrast: 1 })).toBe(list);
    const mem = new Map();
    const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
    saveCustomPresets(storage, list);
    expect(loadCustomPresets(storage)).toEqual(list);
    expect(removeCustomPreset(list, list[0].id)).toEqual([]);
    expect(normalizeCustomPresets([{ id: 1 }, null, { id: "x", name: "", fx: {} }, { id: "y", name: "Ok", fx: { hue: 999 } }])).toEqual([{ id: "y", name: "Ok", fx: { hue: 180 }, custom: true }]);
    expect(loadCustomPresets({ getItem: () => "{bozuk" })).toEqual([]);
  });
});

describe("kayıt göçü ve katman", () => {
  it("eski kameranın ayna alanı fx.flipH'ye taşınır", () => {
    expect(migrateSourceFx({ id: "a", kind: "camera", mirror: true })).toEqual({ id: "a", kind: "camera", fx: { flipH: true } });
    expect(migrateSourceFx({ id: "a", kind: "camera", mirror: false })).toEqual({ id: "a", kind: "camera" });
    expect(migrateSourceFx({ id: "a", kind: "camera", fx: { brightness: 0 } })).toEqual({ id: "a", kind: "camera" });
    expect(sourceDefaults("camera").mirror).toBeUndefined();
  });

  it("sürüm 3 kaydı: kaynak fx temizlenir, katman fx korunur", () => {
    const cfg = normalizeScenesConfig({
      version: 3,
      sources: [{ id: "c1", kind: "camera", name: "K1", mirror: true, fx: { contrast: 30, junk: 1 } }],
      scenes: [{ id: "s1", name: "S", layers: [{ id: "l1", sourceId: "c1", fx: { saturation: -100 } }, { id: "l2", sourceId: "c1" }] }],
      previewSceneId: "s1", programSceneId: "s1",
    });
    expect(cfg.sources[0].fx).toEqual({ contrast: 30, flipH: true });
    expect(cfg.sources[0].mirror).toBeUndefined();
    expect(cfg.scenes[0].layers[0].fx).toEqual({ saturation: -100 });
    expect(cfg.scenes[0].layers[1].fx).toBeUndefined();
  });

  it("sürüm 2 (studio.v1) kaydı da göç eder", () => {
    const cfg = normalizeScenesConfig({ version: 2, sources: [{ id: "c1", kind: "camera", name: "K", mirror: true, deviceIndex: 0 }], scenes: [], previewSceneId: "src:c1", programSceneId: "src:c1" });
    expect(cfg.sources[0].fx).toEqual({ flipH: true });
  });

  it("katmana özel ayar: boş nesne bile kaynağın efektini kapatır; null kaldırır", () => {
    expect(normalizeLayerFx({})).toEqual({});
    expect(normalizeLayerFx(null)).toBeNull();
    expect(normalizeLayer({ sourceId: "c1", fx: {} }, "camera").fx).toEqual({});
    const src = { id: "c1", fx: { contrast: 30 } };
    expect(effectiveFx(src, { fx: {} })).toBeNull();
    expect(effectiveFx(src, {})).toBe(src.fx);
    expect(effectiveFx(src, { fx: { hue: 10 } })).toEqual({ hue: 10 });
    expect(effectiveFx({ id: "x", mirror: true }, null)).toMatchObject({ flipH: true });
    expect(effectiveFx({ id: "x", mirror: true, fx: { flipH: true } }, null)).toBeNull();
  });

  it("updateLayer / updateSourceFx", () => {
    let cfg = normalizeScenesConfig({ version: 3, sources: [{ id: "c1", kind: "camera", name: "K", mirror: true }], scenes: [{ id: "s1", name: "S", layers: [{ id: "l1", sourceId: "c1" }] }], previewSceneId: "s1", programSceneId: "s1" });
    cfg = updateLayer(cfg, "s1", "l1", { fx: { brightness: 20, contrast: 0 } });
    expect(cfg.scenes[0].layers[0].fx).toEqual({ brightness: 20 });
    cfg = updateLayer(cfg, "s1", "l1", { fx: null });
    expect("fx" in cfg.scenes[0].layers[0]).toBe(false);
    cfg = updateSourceFx(cfg, "c1", { brightness: 0 });
    expect(cfg.sources[0].fx).toBeUndefined();
    cfg = updateSourceFx(cfg, "c1", { saturation: 25 });
    expect(cfg.sources[0].fx).toEqual({ saturation: 25 });
  });
});
