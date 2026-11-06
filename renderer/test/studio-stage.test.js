// Sahne alanı ızgarası (lib/studio/stageGrid.js) ve yeni sahne şablonları.
import {
  STAGE_COLS, STAGE_PRESETS, STAGE_ROWS, addStageTile, compactTiles, findSpot, inBounds, loadStage, normalizeStage, overlaps, placeTile,
  presetForWorkspace, presetTiles, saveStage, stageHasPreview, stripGrid,
} from "../src/lib/studio/stageGrid";
import { WORKSPACES } from "../src/lib/studio/scenesWorkspace";
import { SCENE_TEMPLATES, TEMPLATE_CATEGORIES, defaultScenesConfig, readySceneOf, sceneFromTemplate, templatePreview, templateSourceIds, addSource, sourceDefaults } from "../src/lib/studio/scenes";
import { DEFAULT_SETTINGS, normalizeSettings } from "../src/views/studio/settings/settings";
import { REPLAY_SECONDS } from "../src/lib/studio/replays";

const memStore = (init = {}) => { const m = { ...init }; return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); } }; };
const noOverlap = (tiles) => tiles.every((a, i) => tiles.every((b, j) => i === j || !overlaps(a, b)));

describe("sahne alanı ızgarası", () => {
  it("hazır düzenler: sınırlar içinde, çakışmasız, tekil monitörler", () => {
    expect(STAGE_PRESETS.map((p) => p.key)).toEqual(["classic", "program", "single", "pp4", "grid4", "grid9", "led", "replay"]);
    for (const p of STAGE_PRESETS) {
      expect(p.tiles.every((t) => inBounds(t))).toBe(true);
      expect(noOverlap(p.tiles)).toBe(true);
      for (const type of ["program", "preview", "led", "transition", "scenes"]) expect(p.tiles.filter((t) => t.type === type).length).toBeLessThanOrEqual(1);
    }
    expect(stageHasPreview(presetTiles("single"))).toBe(false);
    expect(stageHasPreview(presetTiles("classic"))).toBe(true);
  });
  it("eski çalışma alanı anahtarları hazır düzenlere eşlenir", () => {
    for (const w of WORKSPACES) expect(presetForWorkspace(w.key)).toBe(w.key);
    expect(presetForWorkspace("mv9")).toBe("grid9");
    expect(presetForWorkspace("vertical")).toBe("program");
    expect(presetForWorkspace("yok")).toBe("classic");
    expect(normalizeStage(null, "grid4").preset).toBe("grid4");
  });
  it("taşı: çakışan kutu en yakın boş yere kayar; yer yoksa null", () => {
    const tiles = [{ id: "a", type: "program", x: 0, y: 0, w: 4, h: 4 }, { id: "b", type: "clock", x: 4, y: 0, w: 2, h: 2 }];
    const next = placeTile(tiles, "a", { x: 3, y: 0 });
    expect(next.find((t) => t.id === "a")).toMatchObject({ x: 3, y: 0 });
    expect(noOverlap(next)).toBe(true);
    const full = [{ id: "a", type: "program", x: 0, y: 0, w: 12, h: 4 }, { id: "b", type: "preview", x: 0, y: 4, w: 12, h: 4 }];
    expect(placeTile(full, "a", { x: 0, y: 0, w: 12, h: 5 })).toBeNull();
  });
  it("boyutla: en küçük boy korunur; 1×1…5×5 ve dikdörtgen", () => {
    const tiles = [{ id: "c", type: "clock", x: 0, y: 0, w: 2, h: 1 }];
    expect(placeTile(tiles, "c", { w: 5, h: 5 })[0]).toMatchObject({ w: 5, h: 5 });
    expect(placeTile(tiles, "c", { w: 3, h: 2 })[0]).toMatchObject({ w: 3, h: 2 });
    const p = [{ id: "p", type: "program", x: 0, y: 0, w: 4, h: 4 }];
    expect(placeTile(p, "p", { w: 1, h: 1 })[0]).toMatchObject({ w: 2, h: 2 }); // monitör en az 2×2
  });
  it("ekle / sıkıştır / boş yer", () => {
    let tiles = presetTiles("classic");
    expect(addStageTile(tiles, "program")).toBeNull(); // tekil
    expect(findSpot(tiles, 1, 1)).toBeNull(); // klasik düzen dolu
    tiles = tiles.filter((t) => t.type !== "transition");
    const added = addStageTile(tiles, "led");
    expect(added.find((t) => t.type === "led")).toBeTruthy();
    expect(noOverlap(added)).toBe(true);
    const gap = compactTiles([{ id: "x", type: "clock", x: 3, y: 5, w: 2, h: 1 }]);
    expect(gap[0]).toMatchObject({ x: 0, y: 0 });
  });
  it("kayıt: bozuk kutular süzülür, çakışan kayar, sınır dışı kırpılır", () => {
    const st = memStore();
    expect(saveStage(st, normalizeStage({ preset: "led", custom: true, tiles: presetTiles("led") }))).toBe(true);
    expect(loadStage(st, "classic")).toMatchObject({ preset: "led", custom: true });
    const n = normalizeStage({ tiles: [{ type: "program", x: 10, y: 7, w: 6, h: 6 }, { type: "program", x: 0, y: 0, w: 2, h: 2 }, { type: "?" }, { type: "clock", x: 6, y: 2, w: 2, h: 1 }] });
    expect(n.tiles.map((t) => t.type)).toEqual(["program", "clock"]);
    expect(n.tiles.every((t) => inBounds(t, STAGE_COLS, STAGE_ROWS))).toBe(true);
    expect(noOverlap(n.tiles)).toBe(true);
    expect(loadStage(memStore({ "studio.stage.v1": "{bozuk" }), "program").preset).toBe("program");
  });
  it("sahne şeridi iç yerleşimi kutunun biçimine uyar", () => {
    expect(stripGrid(6, 1400, 160).rows).toBe(1);
    expect(stripGrid(9, 600, 600).cols).toBe(3);
    expect(stripGrid(12, 150, 900).scroll).toBe("y");
  });
});

describe("yeni sahne şablonları", () => {
  it("kategoriler ve çok sayıda hazır düzen", () => {
    expect(SCENE_TEMPLATES.length).toBeGreaterThanOrEqual(28);
    for (const t of SCENE_TEMPLATES) expect(TEMPLATE_CATEGORIES.some((c) => c.key === t.cat)).toBe(true);
    for (const key of ["pip_bl", "pip_tr", "pip_tl", "sbsFull", "sbs7030", "quad", "main3", "screencam", "interview", "scoreboard", "stats", "sponsor", "breaking", "goal", "ledLogo", "second", "tech"]) {
      expect(SCENE_TEMPLATES.some((t) => t.key === key)).toBe(true);
    }
    expect(templatePreview(SCENE_TEMPLATES.find((t) => t.key === "quad")).filter((b) => b.kind === "slot")).toHaveLength(4);
  });
  it("dörtlü 2×2 ve ana + 3: yuvalar sırayla, kutular ekranda", () => {
    const base = defaultScenesConfig();
    const q = sceneFromTemplate(base, "quad").scene;
    expect(q.layers).toHaveLength(4);
    expect(q.layers.every((l) => l.x >= 0 && l.y >= 0 && l.x + l.w <= 1.001 && l.y + l.h <= 1.001)).toBe(true);
  });
  it("ekran + kamera: ekran kaynağı ilk yuvaya tercih edilir", () => {
    const { config } = addSource(defaultScenesConfig(), { ...sourceDefaults("screen"), id: "src_scr" });
    expect(templateSourceIds(config, 2, [["screen", "window"], ["camera"]])).toEqual(["src_scr", "src_cam1"]);
  });
  it("parçalı şablonlar kendi kaynaklarını oluşturur; başlık / geri sayım düzenlenir", () => {
    const base = defaultScenesConfig();
    const g = sceneFromTemplate(base, "goal", { title: "GOL!" });
    expect(g.scene.template).toBe("goal");
    const texts = g.config.sources.filter((s) => s.kind === "text").map((s) => s.text);
    expect(texts).toContain("GOL!");
    expect(g.scene.layers[0].sourceId).toBe("src_cam1"); // görüntü altta, bant ve yazı üstte
    const second = sceneFromTemplate(base, "second", { minutes: 0 });
    expect(second.config.sources.some((s) => s.kind === "clock")).toBe(false);
    const sb = sceneFromTemplate(base, "scoreboard");
    expect(sb.config.sources.find((s) => s.kind === "clock")?.mode).toBe("match");
    const logo = sceneFromTemplate(base, "ledLogo", { logoUrl: "data:image/png;base64,AAAA" });
    expect(logo.config.sources.some((s) => s.kind === "image" && s.url.startsWith("data:"))).toBe(true);
    expect(readySceneOf(sceneFromTemplate(base, "start").config, "start")).toBeTruthy();
  });
});

describe("sahne alanı: yer değiştirme", () => {
  it("dolu ızgarada çakışan kutu taşınanın eski yerine geçer", () => {
    const tiles = [{ id: "a", type: "program", x: 0, y: 0, w: 6, h: 8 }, { id: "b", type: "preview", x: 6, y: 0, w: 6, h: 8 }];
    const next = placeTile(tiles, "a", { x: 6, y: 0 });
    expect(next.find((t) => t.id === "a")).toMatchObject({ x: 6 });
    expect(next.find((t) => t.id === "b")).toMatchObject({ x: 0 });
  });
});

describe("tekrar süresi", () => {
  it("varsayılan 15 sn", () => {
    expect(REPLAY_SECONDS).toBe(15);
    expect(DEFAULT_SETTINGS.replay.seconds).toBe(15);
    expect(normalizeSettings(null).replay.seconds).toBe(15);
  });
});
