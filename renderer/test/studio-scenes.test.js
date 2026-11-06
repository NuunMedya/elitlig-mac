import {
  SCENES_KEY, addLayer, addScene, addSource, sceneFromSource, clockText, defaultScenesConfig, duplicateScene, layersTopFirst,
  loadScenesConfig, migrateV2, moveLayerTo, moveSceneTo, multiviewTiles, normalizeScenesConfig, pipBox, removeScene, removeSource, renameScene,
  resolveScene, sceneAtHotkey, sceneHotkey, slideIndex, sourceDefaults, sourceSceneId, uiIndexToArray, updateLayer,
} from "../src/lib/studio/scenes";
import {
  centerLayer, cropLayer, fitToScreen, fromPixels, handleAt, hitTest, moveLayer, normAspect, nudge, resizeLayer, rotationFromPoint, stretchToScreen, toPixels, unrotatePoint, MIN_SIZE,
} from "../src/lib/studio/scenesTransform";
import { TRANSITION_KINDS, progressAt, transitionFrame, transitionKind, transitionMs } from "../src/lib/studio/transitions";
import { VAR_MODES, fit169, micWarning, normalizeVar, varLayout, varPulse } from "../src/lib/studio/var";
import { WORKSPACES, gridCells, previewVisible, workspaceOf } from "../src/lib/studio/scenesWorkspace";
import { DEFAULT_BRANDING, darken, stingerPalette } from "../src/lib/studio/stinger";
import { keyAction, streamHealth } from "../src/lib/studio/broadcast";
import { STORAGE_KEY } from "../src/lib/studio/layouts";

const close = (a, b, eps = 1e-9) => expect(Math.abs(a - b)).toBeLessThan(eps);
const memStore = (init = {}) => { const m = new Map(Object.entries(init)); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m }; };

const v2 = {
  version: 2,
  sources: [
    { id: "a", kind: "camera", name: "Kale arkası" },
    { id: "b", kind: "color", name: "Tribün", color: "#222" },
    { id: "v", kind: "video", name: "Reklam", url: "blob:xyz" },
  ],
  scenes: [
    { id: "sc_pip", name: "PiP", layers: [{ id: "l1", sourceId: "a", layout: { type: "full" }, fit: "cover", visible: true }, { id: "l2", sourceId: "b", layout: { type: "pip", corner: "br", size: 30 }, fit: "cover", visible: true }] },
    { id: "sc_sbs", name: "Yan yana", layers: [{ id: "l3", sourceId: "a", layout: { type: "left" }, fit: "contain", visible: true }, { id: "l4", sourceId: "b", layout: { type: "right" }, fit: "contain", visible: false }] },
  ],
  overlay: { variant: "bottom" },
  previewSceneId: "src:b",
  programSceneId: "sc_pip",
};

describe("sahne modeli: sürüm 2 → 3 göçü", () => {
  it("her görsel kaynak kendi sahnesi olur, düzenler serbest kutuya çevrilir", () => {
    const c = migrateV2(v2);
    expect(c.version).toBe(3);
    expect(c.scenes.map((s) => s.id)).toEqual(["sc_src_a", "sc_src_b", "sc_src_v", "sc_pip", "sc_sbs"]);
    expect(c.previewSceneId).toBe("sc_src_b");
    expect(c.programSceneId).toBe("sc_pip");
    expect(c.overlay.variant).toBe("bottom");
    const pip = c.scenes.find((s) => s.id === "sc_pip");
    expect(pip.layers[0]).toMatchObject({ x: 0, y: 0, w: 1, h: 1, fit: "cover", visible: true, locked: false, rot: 0 });
    close(pip.layers[1].w, 0.3);
    close(pip.layers[1].x, 1 - 0.025 - 0.3);
    const sbs = c.scenes.find((s) => s.id === "sc_sbs");
    expect(sbs.layers[0]).toMatchObject({ x: 0, w: 0.5, h: 1, fit: "contain" });
    expect(sbs.layers[1]).toMatchObject({ x: 0.5, visible: false });
    // Oturum adresi saklanmaz.
    expect(c.sources.find((s) => s.id === "v").url).toBeNull();
  });
  it("load: önce studio.v3, yoksa eski studio.v1 göç ettirilir; bozuk kayıt varsayılana döner", () => {
    expect(loadScenesConfig(memStore({ [STORAGE_KEY]: JSON.stringify(v2) })).scenes).toHaveLength(5);
    const v3 = defaultScenesConfig();
    expect(loadScenesConfig(memStore({ [SCENES_KEY]: JSON.stringify(v3), [STORAGE_KEY]: JSON.stringify(v2) })).scenes.map((s) => s.id)).toEqual(v3.scenes.map((s) => s.id));
    expect(loadScenesConfig(memStore({ [SCENES_KEY]: "{bozuk" })).version).toBe(3);
    expect(loadScenesConfig(null).scenes.length).toBeGreaterThan(0);
  });
  it("normalize: bilinmeyen kaynak / katman atılır, değerler sınırlanır, eksik kimlik düzeltilir", () => {
    const c = normalizeScenesConfig({
      version: 3,
      sources: [{ id: "a", kind: "camera" }, { id: "z", kind: "uzay" }],
      scenes: [{ id: "s1", name: "S", layers: [{ sourceId: "a", x: 9, w: -1, rot: -90, crop: { l: 0.8, r: 0.8 }, fit: "x" }, { sourceId: "z" }] }],
      previewSceneId: "yok", programSceneId: "s1", multiview: { show: ["s1", "yok"] },
    });
    expect(c.sources.map((s) => s.id)).toEqual(["a"]);
    const l = c.scenes[0].layers;
    expect(l).toHaveLength(1);
    expect(l[0].x).toBe(3);
    expect(l[0].w).toBe(0.01);
    expect(l[0].rot).toBe(270);
    expect(l[0].crop.l + l[0].crop.r).toBeLessThanOrEqual(0.95 + 1e-9);
    expect(l[0].fit).toBe("cover");
    expect(typeof l[0].id).toBe("string");
    expect(c.previewSceneId).toBe("s1");
    expect(c.multiview.show).toBeNull(); // "Önizlemede göster" kaldırıldı: şeritte tüm sahneler
  });
});

describe("sahne / katman / kaynak işlemleri", () => {
  it("sahne ekle, çoğalt, yeniden adlandır, taşı, sil (en az bir sahne kalır)", () => {
    let c = defaultScenesConfig();
    const { config: c1, scene } = addScene(c, "  ");
    expect(scene.name).toBe(`Sahne ${c.scenes.length + 1}`);
    const { config: c2, scene: dup } = duplicateScene(c1, "sc_pip");
    expect(dup.name).toBe("Resim içinde resim (kopya)");
    expect(dup.layers[0].id).not.toBe(c1.scenes.find((s) => s.id === "sc_pip").layers[0].id);
    expect(c2.scenes.findIndex((s) => s.id === dup.id)).toBe(c2.scenes.findIndex((s) => s.id === "sc_pip") + 1);
    c = renameScene(c2, "sc_pip", "PiP");
    expect(c.scenes.find((s) => s.id === "sc_pip").name).toBe("PiP");
    c = moveSceneTo(c, "sc_pip", 0);
    expect(c.scenes[0].id).toBe("sc_pip");
    expect(sceneHotkey(c, "sc_pip")).toBe(1);
    expect(sceneAtHotkey(c, 0)).toBe("sc_pip");
    c = removeScene(c, "sc_cam1");
    expect(c.programSceneId).not.toBe("sc_cam1");
    let one = { ...c, scenes: [c.scenes[0]] };
    one = removeScene(one, one.scenes[0].id);
    expect(one.scenes).toHaveLength(1);
  });
  it("katman: ekle (kaynağa göre sığdırma), güncelle, sırala (dizi sonu üstte), kaynak silinince çıkar", () => {
    let c = defaultScenesConfig();
    const { config: c1, source } = addSource(c, sourceDefaults("text"));
    const { config: c2, layer } = addLayer(c1, "sc_cam1", source.id);
    expect(layer.fit).toBe("stretch");
    c = updateLayer(c2, "sc_cam1", layer.id, { x: 0.25, crop: { l: 0.1 } });
    const sc = c.scenes.find((s) => s.id === "sc_cam1");
    expect(sc.layers.at(-1)).toMatchObject({ x: 0.25 });
    expect(sc.layers.at(-1).crop.l).toBe(0.1);
    expect(layersTopFirst(sc)[0].id).toBe(layer.id);
    c = moveLayerTo(c, "sc_cam1", layer.id, uiIndexToArray(2, 1));
    expect(c.scenes.find((s) => s.id === "sc_cam1").layers[0].id).toBe(layer.id);
    c = removeSource(c, source.id);
    expect(c.scenes.find((s) => s.id === "sc_cam1").layers.some((l) => l.sourceId === source.id)).toBe(false);
  });
  it("kaynak eklemek sahne oluşturmaz; 'Bu kaynaktan sahne oluştur' açık eylem; sanal sahne çözülür", () => {
    const base = defaultScenesConfig();
    const { config, source } = addSource(base, sourceDefaults("image"));
    expect(config.scenes).toHaveLength(base.scenes.length);
    const { config: c2, scene } = sceneFromSource(config, source.id);
    expect(c2.scenes).toHaveLength(base.scenes.length + 1);
    expect(scene.layers[0]).toMatchObject({ sourceId: source.id, fit: "contain", w: 1, h: 1 });
    const v = resolveScene(config, sourceSceneId(source.id));
    expect(v.virtual).toBe(true);
  });
  it("çoklu görünüm yalnız sahneleri gösterir (kaynak kutusu yok)", () => {
    const c = defaultScenesConfig();
    const tiles = multiviewTiles(c);
    expect(tiles.map((t) => t.id)).toEqual(c.scenes.map((s) => s.id));
    expect(tiles.every((t) => t.kind === "scene")).toBe(true);
  });
  it("saat metni ve slayt sırası", () => {
    const at = new Date(2026, 10, 5, 21, 7, 9).getTime();
    expect(clockText({ mode: "clock" }, at)).toBe("21:07");
    expect(clockText({ mode: "clock", seconds: true }, at)).toBe("21:07:09");
    expect(clockText({ mode: "countdown", targetAt: at + 125_000 }, at)).toBe("02:05");
    expect(clockText({ mode: "countdown", targetAt: at - 5 }, at)).toBe("00:00");
    expect(clockText({ mode: "countup", startedAt: at - 3_661_000 }, at)).toBe("1:01:01");
    expect(clockText({ mode: "match" }, at, { matchClockMs: 33 * 60000 })).toBe("33:00");
    expect(slideIndex(3, 1000, 4500)).toBe(1);
    expect(slideIndex(0, 1000, 10)).toBe(-1);
  });
  it("pipBox: 16:9 kutu, köşede eşit piksel boşluğu", () => {
    const b = pipBox("tl", 0.3);
    close(b.x * 1920, 0.025 * 1920);
    close(b.y * 1080, 0.025 * 1920);
    expect(b.w).toBe(b.h);
  });
});

describe("dönüşüm hesabı", () => {
  const L = (p) => ({ id: "l", visible: true, locked: false, x: 0.1, y: 0.1, w: 0.4, h: 0.4, rot: 0, crop: { l: 0, t: 0, r: 0, b: 0 }, ...p });
  it("isabet testi: en üstteki görünür + kilitsiz; kilitli yalnız seçimde", () => {
    const layers = [L({ id: "alt", x: 0, y: 0, w: 1, h: 1 }), L({ id: "ust" }), L({ id: "gizli", visible: false }), L({ id: "kilit", x: 0.6, y: 0.6, w: 0.3, h: 0.3, locked: true })];
    expect(hitTest(layers, 300, 200, 1000, 1000)).toBe("ust");
    expect(hitTest(layers, 900, 50, 1000, 1000)).toBe("alt");
    expect(hitTest(layers, 700, 700, 1000, 1000)).toBe("alt");
    expect(hitTest(layers, 700, 700, 1000, 1000, { includeLocked: true })).toBe("kilit");
    expect(hitTest([layers[1]], 950, 950, 1000, 1000)).toBeNull();
  });
  it("döndürülmüş katmanda nokta ters döndürülür", () => {
    const box = { x: 0, y: 0, w: 100, h: 20 };
    const p = unrotatePoint(50, 50, box, 90); // merkez (50,10); 90° dönmüş kutunun alt ucu
    close(p.x, 90, 1e-6);
    close(p.y, 10, 1e-6);
    expect(hitTest([L({ x: 0, y: 0, w: 0.1, h: 0.02, rot: 90 })], 50, 50, 1000, 1000)).toBe("l");
  });
  it("tutamak bulma", () => {
    const box = { x: 100, y: 100, w: 200, h: 100 };
    expect(handleAt(box, 101, 99, 8)).toBe("nw");
    expect(handleAt(box, 300, 150, 8)).toBe("e");
    expect(handleAt(box, 200, 200, 8)).toBe("s");
    expect(handleAt(box, 200, 150, 8)).toBeNull();
  });
  it("taşıma kenara ve merkeze yapışır", () => {
    const m = moveLayer({ x: 0.1, y: 0.1, w: 0.4, h: 0.4 }, -0.095, 0.192);
    expect(m.x).toBe(0);
    close(m.y, 0.3); // merkez 0,492 → 0,5 çizgisine yapışır
    expect(m.guides.map((g) => g.axis).sort()).toEqual(["x", "y"]);
    const free = moveLayer({ x: 0.1, y: 0.1, w: 0.4, h: 0.4 }, 0.2, 0.2, { snap: false });
    close(free.x, 0.3); close(free.y, 0.3);
    expect(free.guides).toEqual([]);
  });
  it("boyutlama: köşe, kenar, oranı koru, ters dönmez", () => {
    const t = { x: 0.1, y: 0.1, w: 0.4, h: 0.2 };
    const se = resizeLayer(t, "se", 0.1, 0.05);
    close(se.w, 0.5); close(se.h, 0.25); close(se.x, 0.1);
    const nw = resizeLayer(t, "nw", 0.1, 0.05);
    close(nw.x, 0.2); close(nw.w, 0.3); close(nw.y, 0.15); close(nw.h, 0.15);
    const keep = resizeLayer(t, "se", 0.2, 0, { keepAspect: true });
    close(keep.w / keep.h, 2);
    const keepNw = resizeLayer(t, "nw", -0.2, 0, { keepAspect: true });
    close(keepNw.x + keepNw.w, 0.5); close(keepNw.y + keepNw.h, 0.3); close(keepNw.w / keepNw.h, 2);
    const edge = resizeLayer(t, "e", 0.2, 0, { keepAspect: true });
    close(edge.h, 0.3); close(edge.y + edge.h / 2, 0.2);
    const flip = resizeLayer(t, "w", 0.9, 0);
    close(flip.w, MIN_SIZE);
    close(flip.x + flip.w, 0.5);
  });
  it("kırpma: kutu küçülür, görüntü yerinde kalır; dışa çekmek geri açar", () => {
    const t = { x: 0, y: 0, w: 1, h: 1 };
    const c = cropLayer(t, { l: 0, t: 0, r: 0, b: 0 }, "w", 0.25, 0);
    close(c.x, 0.25); close(c.w, 0.75); close(c.crop.l, 0.25);
    const back = cropLayer(c, c.crop, "w", -0.5, 0);
    close(back.crop.l, 0); close(back.x, 0); close(back.w, 1);
    const half = cropLayer({ x: 0, y: 0, w: 0.5, h: 0.5 }, { l: 0, t: 0, r: 0, b: 0 }, "se", -0.1, -0.1);
    close(half.crop.r, 0.2); close(half.crop.b, 0.2); close(half.w, 0.4);
  });
  it("döndürme açısı, sığdır / uzat / ortala, piksel çevirisi, ok tuşu", () => {
    const box = { x: 0, y: 0, w: 100, h: 100 };
    expect(Math.round(rotationFromPoint(box, 50, -10))).toBe(0);
    expect(Math.round(rotationFromPoint(box, 110, 50))).toBe(90);
    expect(rotationFromPoint(box, 110, 53, { step: 15 })).toBe(90);
    // 4:3 kamera 16:9 ekranda: yükseklik dolu, genişlik 0,75.
    const a = normAspect(640, 480, null, 1920, 1080);
    close(a, 0.75);
    expect(fitToScreen(a)).toEqual({ x: 0.125, y: 0, w: 0.75, h: 1 });
    expect(fitToScreen(2)).toEqual({ x: 0, y: 0.25, w: 1, h: 0.5 });
    expect(stretchToScreen()).toEqual({ x: 0, y: 0, w: 1, h: 1 });
    expect(centerLayer({ w: 0.5, h: 0.2 })).toEqual({ x: 0.25, y: 0.4 });
    expect(toPixels({ x: 0.5, y: 0.25, w: 0.5, h: 0.5 }, 1920, 1080)).toEqual({ x: 960, y: 270, w: 960, h: 540 });
    expect(fromPixels({ x: 960, h: 0 }, 1920, 1080)).toEqual({ x: 0.5, h: MIN_SIZE });
    close(nudge({ x: 0.5, y: 0.5 }, "ArrowRight", true, 1000, 1000).x, 0.51);
    expect(nudge({ x: 0, y: 0 }, "a", false, 10, 10)).toBeNull();
  });
});

describe("geçişler", () => {
  it("tüm türler 0 ve 1'de doğru uçta", () => {
    for (const t of TRANSITION_KINDS) {
      const a = transitionFrame(t.key, 0);
      const b = transitionFrame(t.key, 1);
      if (t.key === "wipe") { expect(a.wipe).toBe(0); expect(b.wipe).toBe(1); continue; }
      if (t.key === "cut") { expect(b.to.alpha).toBe(1); continue; }
      expect(b.to.alpha).toBeCloseTo(1, 6);
      expect(b.to.dx).toBeCloseTo(0, 6); expect(b.to.dy).toBeCloseTo(0, 6);
      expect(b.to.scale).toBeCloseTo(1, 6); expect(b.to.blur).toBeCloseTo(0, 6);
      expect(a.from.alpha).toBe(1);
      expect(b.switched).toBe(true);
    }
  });
  it("kaydırma / yakınlaştırma / bulanıklık ara kareleri", () => {
    const s = transitionFrame("slideLeft", 0.5);
    close(s.from.dx, -0.5); close(s.to.dx, 0.5);
    expect(transitionFrame("slideRight", 0.25).to.dx).toBeLessThan(0);
    expect(transitionFrame("slideUp", 0.25).to.dy).toBeGreaterThan(0);
    expect(transitionFrame("zoom", 0.5).from.scale).toBeGreaterThan(1);
    const bl = transitionFrame("blur", 0.5);
    expect(bl.from.blur).toBeCloseTo(1, 6);
    expect(bl.to.blur).toBeCloseTo(1, 6);
    expect(transitionFrame("stinger", 0.49).to.alpha).toBe(0);
    expect(transitionFrame("stinger", 0.5).to.alpha).toBe(1);
  });
  it("süre: tür sınırları içinde, kesme 0; ilerleyiş", () => {
    expect(transitionMs("cut", { cut: 500 })).toBe(0);
    expect(transitionMs("fade", {})).toBe(400);
    expect(transitionMs("fade", { fade: 50 })).toBe(100);
    expect(transitionMs("stinger", { stinger: 1500 })).toBe(1500);
    expect(transitionMs("wipe", { wipe: 99999 })).toBe(3000);
    expect(transitionKind("yok").key).toBe("fade");
    expect(progressAt({ startedAt: 100, ms: 200 }, 200)).toBe(0.5);
    expect(progressAt({ startedAt: 100, ms: 0 }, 100)).toBe(1);
    expect(progressAt(null, 0)).toBe(1);
  });
});

describe("VAR", () => {
  it("türler ve yerleşim", () => {
    expect(VAR_MODES.map((m) => m.key)).toEqual(["bg", "replay", "source", "both"]);
    expect(varLayout("bg", 1920, 1080).panes).toEqual([]);
    const one = varLayout("replay", 1920, 1080);
    expect(one.panes).toHaveLength(1);
    close(one.panes[0].rect.w / one.panes[0].rect.h, 16 / 9, 1e-6);
    const both = varLayout("both", 1920, 1080);
    expect(both.panes.map((p) => p.role)).toEqual(["source", "replay"]);
    const [l, r] = both.panes.map((p) => p.rect);
    expect(l.x + l.w).toBeLessThan(r.x);
    for (const p of both.panes) {
      expect(p.rect.x).toBeGreaterThanOrEqual(both.frame.x);
      expect(p.rect.x + p.rect.w).toBeLessThanOrEqual(both.frame.x + both.frame.w);
      expect(p.rect.y).toBeGreaterThanOrEqual(both.header.h);
    }
    expect(varLayout("uzay", 100, 100).mode).toBe("bg");
  });
  it("fit169, nabız, ayar sınırları, mikrofon uyarısı", () => {
    expect(fit169({ x: 0, y: 0, w: 1600, h: 400 })).toEqual({ x: (1600 - 400 * 16 / 9) / 2, y: 0, w: 400 * 16 / 9, h: 400 });
    expect(varPulse(0)).toBeCloseTo(0, 6);
    expect(varPulse(600, 1200)).toBeCloseTo(1, 6);
    expect(normalizeVar({ rate: 0.12 }).rate).toBe(0.25);
    expect(normalizeVar({ rate: 0.63 }).rate).toBe(0.65);
    expect(normalizeVar({ mode: "x" }).mode).toBe("bg");
    expect(micWarning({ varActive: true, micMuted: false })).toBe(true);
    expect(micWarning({ varActive: true, micMuted: true })).toBe(false);
    expect(micWarning({ varActive: false, micMuted: false })).toBe(false);
  });
});

describe("çalışma alanları", () => {
  it("5 düzen; eski anahtarlar göç eder; bilinmeyen → klasik", () => {
    expect(WORKSPACES.map((w) => w.key)).toEqual(["classic", "program", "grid4", "grid9", "compact"]);
    expect(workspaceOf("yok").key).toBe("classic");
    expect(workspaceOf("studio").key).toBe("classic");
    expect(workspaceOf("mv9").key).toBe("grid9");
    expect(workspaceOf("vertical").key).toBe("program");
    expect(previewVisible(workspaceOf("program"), true)).toBe(true);
    expect(previewVisible(workspaceOf("classic"), false)).toBe(false);
  });
  it("ızgara: yalnız sahne kutuları, eksikler boş, fazlası kesilir", () => {
    const tiles = [1, 2, 3, 4, 5].map((i) => ({ id: `t${i}` }));
    const c4 = gridCells(workspaceOf("grid4"), tiles);
    expect(c4.map((c) => c.type)).toEqual(["tile", "tile", "tile", "tile"]);
    const c9 = gridCells("grid9", tiles);
    expect(c9).toHaveLength(9);
    expect(c9.filter((c) => c.type === "empty")).toHaveLength(4);
    expect(gridCells("classic", tiles)).toEqual([]);
  });
});

describe("marka logo geçişi ve yayın sağlığı", () => {
  it("stinger paleti markadan; geçersiz renk varsayılana", () => {
    const p = stingerPalette({ primary: "#0a7", secondary: "#123456", accent: "zzz", logoScale: 5, name: "CCL CUP" });
    expect(p.stops[1][1]).toBe("#00aa77");
    expect(p.stops[3][1]).toBe("#123456");
    expect(p.logoScale).toBe(2);
    expect(p.name).toBe("CCL CUP");
    expect(stingerPalette(null).stops[1][1]).toBe(DEFAULT_BRANDING.primary);
    expect(darken("#ffffff", 0.5)).toBe("#808080");
  });
  it("sağlık: speed < 0,95 uyarı, < 0,85 kötü; takılma ve yeniden bağlanma", () => {
    expect(streamHealth({ encoding: false, draw: { fps: 30 } }).tone).toBe("idle");
    expect(streamHealth({ encoding: true, status: { fps: 30, speed: 1.0, bitrateKbps: 2500 }, draw: { fps: 30 } }).tone).toBe("ok");
    const w = streamHealth({ encoding: true, status: { speed: 0.93 }, draw: { fps: 30 } });
    expect(w.tone).toBe("warn");
    expect(w.warnings[0]).toMatch(/0\.93/);
    expect(streamHealth({ encoding: true, status: { speed: 0.8 }, draw: { fps: 30 } }).tone).toBe("bad");
    expect(streamHealth({ encoding: true, status: {}, draw: { fps: 30, stalls: 2 } }).tone).toBe("warn");
    expect(streamHealth({ encoding: true, status: { state: "reconnecting" }, draw: { fps: 30 } }).tone).toBe("bad");
  });
  it("kısayollar: V = VAR, ? = yardım", () => {
    expect(keyAction({ key: "v", target: {} })).toEqual({ type: "var" });
    expect(keyAction({ key: "?", target: {} })).toEqual({ type: "help" });
  });
});
