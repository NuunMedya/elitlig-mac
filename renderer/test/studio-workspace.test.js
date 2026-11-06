// @vitest-environment jsdom
import { DockviewComponent } from "dockview-core";
import {
  LAYOUT_COMPONENTS, LAYOUT_PANELS, LAYOUT_PRESETS, RAIL_COLS, addItem, applyGrid, defaultRailBoard, dockPanelIds, dockTree, loadLayout, migrateLayout,
  missingPanels, normalizeBoard, normalizeLayout, packItems, paramsOfId, presetOf, pushRemoved, railToBoardItems, saveLayout, setBoardCols, simplifySpec,
  specIds, specToDock, tilesToSpec, widgetSize,
} from "../src/views/studio/layout/layoutModel";
import { DEFAULT_RAIL, RAIL_WIDGETS } from "../src/views/studio/shortcuts/railModel";
import { STAGE_PRESETS } from "../src/lib/studio/stageGrid";
import { PROFILE_GROUPS } from "../src/views/studio/settings/profiles";

if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
}

const mem = () => {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
};

/** dockview-core ile gerçek yükleme: JSON geçerli mi, paneller yerinde mi. */
function roundTrip(json) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const made = [];
  const dv = new DockviewComponent(el, {
    createComponent: ({ id }) => {
      const element = document.createElement("div");
      made.push(id);
      return { element, init: () => {}, update: () => {}, dispose: () => {} };
    },
  });
  dv.fromJSON(json);
  const out = dv.toJSON();
  dv.dispose();
  el.remove();
  return { out, made };
}

describe("yerleşim: hazır düzenler → dockview", () => {
  it("her hazır düzen geçerli JSON üretir ve dockview yükler (boşluksuz döşeme)", () => {
    for (const p of LAYOUT_PRESETS) {
      const json = specToDock(p.spec);
      expect(json, p.key).toBeTruthy();
      const ids = specIds(simplifySpec(p.spec));
      expect(dockPanelIds(json).sort()).toEqual([...new Set(ids)].sort());
      const { out } = roundTrip(json);
      expect(Object.keys(out.panels).sort(), p.key).toEqual(Object.keys(json.panels).sort());
      expect(out.grid.orientation).toBe(json.grid.orientation);
    }
  });
  it("Klasik: solda kısayol panosu, üstte önizleme | program, geçiş sahne şeridinin solunda, altta işletim panelleri", () => {
    const t = dockTree(specToDock(presetOf("klasik").spec));
    expect(t.root.dir).toBe("row");
    expect(t.root.children[0].views.map((v) => v.id)).toEqual(["board~rail"]);
    const main = t.root.children[1];
    expect(main.dir).toBe("col");
    expect(main.children[0].children.map((g) => g.views[0].id)).toEqual(["pvw", "pgm"]);
    expect(main.children[1].children.map((g) => g.views[0].id)).toEqual(["gecis", "sahneSerit"]);
    expect(main.children[2].children[0].views.map((v) => v.id)).toEqual(["yonetim", "olaylar"]);
  });
  it("tek çocuklu dallar açılır, aynı yönlüler düzleşir, yinelenen / bilinmeyen paneller atılır", () => {
    const s = simplifySpec({ row: [{ col: [{ tabs: ["pvw", "yok"] }] }, { row: ["pgm", "pvw", { tabs: ["bilinmeyen"] }] }] });
    expect(s.row.map((x) => x.tabs)).toEqual([["pvw"], ["pgm"]]);
    const json = specToDock({ col: [{ col: ["pvw", "pgm"] }] });
    expect(json.grid.orientation).toBe("VERTICAL");
    expect(json.grid.root.data).toHaveLength(2);
    expect(specToDock({ row: [{ tabs: ["yok"] }] })).toBeNull();
  });
  it("panel parametreleri kimlikten çıkar", () => {
    expect(paramsOfId("board~rail")).toEqual({ kind: "board", opts: { board: "rail" } });
    expect(paramsOfId("sceneCell~2")).toEqual({ kind: "sceneCell", opts: { index: 2 } });
    expect(paramsOfId("tekrar")).toEqual({ kind: "tekrar", opts: {} });
  });
});

describe("yerleşim: eski düzenlerden göç", () => {
  it("sahne ızgarası hazır düzenleri giyotin kesimiyle bölme ağacına döner", () => {
    for (const p of STAGE_PRESETS) {
      const spec = tilesToSpec(p.tiles);
      const ids = specIds(spec);
      expect(ids.length, p.key).toBe(p.tiles.length);
      const { out } = roundTrip(specToDock(spec));
      expect(Object.keys(out.panels).length, p.key).toBe(p.tiles.length);
    }
    const big = dockTree(specToDock(tilesToSpec(STAGE_PRESETS.find((p) => p.key === "program").tiles)));
    expect(big.root.dir).toBe("row");
    expect(big.root.children[0].views[0].id).toBe("pgm");
    expect(big.root.children[1].children.map((g) => g.views[0].id)).toEqual(["pvw", "gecis", "sahneSerit"]);
  });
  it("şerit + sahne ızgarası + alt panel sütunları tek yerleşime göç eder; hiçbir panel kaybolmaz", () => {
    const rail = [{ id: "a", type: "golive", w: 2, h: 2 }, { id: "b", type: "mic", w: 1, h: 1 }, { id: "c", type: "var", w: 1, h: 1 }];
    const stage = { tiles: STAGE_PRESETS.find((p) => p.key === "pp4").tiles };
    const dock = { mode: "columns", columns: [{ id: "c1", panel: "tekrar", w: 1.4 }, { id: "c2", panel: "ses", w: 0.9 }], disabled: ["ozet"] };
    const l = migrateLayout({ rail, stage, dock, dockH: 320, viewportH: 1000 });
    const ids = dockPanelIds(l.dock);
    expect(ids).toEqual(expect.arrayContaining(["board~rail", "pvw", "pgm", "gecis", "sceneCell~0", "sceneCell~3", "tekrar", "ses", "yonetim", "sahne", "yayin"]));
    expect(ids).not.toContain("ozet");
    expect(l.boards.rail.items.map((x) => [x.t, x.x, x.y, x.w, x.h])).toEqual([["w:golive", 0, 0, 2, 4], ["w:mic", 0, 4, 1, 2], ["w:var", 1, 4, 1, 2]]);
    roundTrip(l.dock);
  });
  it("tek sekme kipindeki alt panel tek sekme grubuna döner; kayıt yoksa varsayılan düzen", () => {
    const l = migrateLayout({ dock: { mode: "tabs", order: ["ses", "tekrar", "yonetim"], tab: "tekrar", disabled: [] } });
    const kids = dockTree(l.dock).root.children[1].children;
    const g = kids[kids.length - 1];
    expect(g.views.map((v) => v.id)).toEqual(["ses", "tekrar", "yonetim"]);
    expect(g.active).toBe("tekrar");
    const d = migrateLayout({});
    expect(dockPanelIds(d.dock)).toEqual(expect.arrayContaining(["board~rail", "pvw", "pgm", "ses"]));
    expect(d.boards.rail.items).toHaveLength(DEFAULT_RAIL.length);
  });
});

describe("yerleşim: panolar", () => {
  it("şerit öğeleri iki sütunlu panoya sırayla yerleşir", () => {
    const items = railToBoardItems(DEFAULT_RAIL);
    expect(items.every((x) => x.x + x.w <= RAIL_COLS)).toBe(true);
    const b = defaultRailBoard();
    expect(b.cols).toBe(RAIL_COLS);
    expect(b.items[0]).toMatchObject({ t: "w:golive", x: 0, y: 0, w: 2, h: 4 });
  });
  it("her şerit parçacığı pano bileşenidir; boyutlar dikey ve yatay", () => {
    for (const w of RAIL_WIDGETS) expect(LAYOUT_COMPONENTS.some((c) => c.key === `w:${w.type}`)).toBe(true);
    expect(widgetSize("2x1")).toEqual([2, 2]);
    expect(widgetSize("1x2")).toEqual([1, 4]);
    expect(LAYOUT_COMPONENTS.filter((c) => c.group === "ses").map((c) => c.key)).toEqual(expect.arrayContaining(["ses.strip", "ses.master", "ses.killall", "ses.mutemic"]));
    expect(LAYOUT_COMPONENTS.filter((c) => c.group === "tekrar").map((c) => c.key)).toEqual(expect.arrayContaining(["part:tekrar:list", "tekrar.angles", "part:tekrar:rate", "part:tekrar:route", "part:tekrar:angles"]));
  });
  it("ekle / ızgaradan güncelle / sütun sayısı / bozuk kayıt ayıklama", () => {
    let b = normalizeBoard({ title: "Benim", cols: 12, items: [] });
    b = addItem(b, "ses.strip", { o: { strip: "mic" } });
    b = addItem(b, "ses.killall");
    expect(b.items.map((x) => x.t)).toEqual(["ses.strip", "ses.killall"]);
    expect(b.items[1]).toMatchObject({ x: b.items[0].w, y: 0 }); // boşluk bırakmadan yanına
    const moved = applyGrid(b, [{ i: b.items[1].i, x: 4, y: 0, w: 3, h: 2 }]);
    expect(moved.items[1]).toMatchObject({ x: 4, y: 0 });
    expect(applyGrid(moved, moved.items)).toBe(moved);
    const narrow = setBoardCols(moved, 2);
    expect(narrow.items.every((x) => x.x + x.w <= 2)).toBe(true);
    expect(addItem(b, "yok").items).toHaveLength(2);
    const n = normalizeBoard({ cols: 4, items: [{ t: "yok" }, { t: "ses.master", w: 99, x: 9 }, null] });
    expect(n.items).toHaveLength(1);
    expect(n.items[0].w).toBe(4);
    expect(n.items[0].x).toBe(0);
    expect(packItems([{ i: "a", w: 2, h: 2 }, { i: "b", w: 1, h: 1 }, { i: "c", w: 1, h: 1 }], 2).map((x) => [x.x, x.y])).toEqual([[0, 0], [0, 2], [1, 2]]);
  });
});

describe("yerleşim: kayıt, kaldırılanlar, şablon", () => {
  it("normalize + sakla / yükle; kaldırılanlar en yeni başta, tekil", () => {
    const s = mem();
    const l = migrateLayout({});
    saveLayout(s, l);
    const back = loadLayout(s);
    expect(dockPanelIds(back.dock)).toEqual(dockPanelIds(l.dock));
    let r = pushRemoved(back, { kind: "panel", id: "ses", label: "Ses" });
    r = pushRemoved(r, { kind: "panel", id: "tekrar", label: "Tekrar" });
    r = pushRemoved(r, { kind: "panel", id: "ses", label: "Ses" });
    expect(r.removed.map((x) => x.id)).toEqual(["ses", "tekrar"]);
    expect(normalizeLayout({ boards: { "kötü id!": {} }, removed: [{ kind: "x" }], mins: { g1: "h", g2: 3 } })).toMatchObject({ boards: {}, removed: [], mins: { g1: "h" } });
    expect(loadLayout(mem())).toBeNull();
  });
  it("düzende olmayan paneller ve panolar listelenir", () => {
    const l = { ...migrateLayout({}), boards: { rail: defaultRailBoard(), b1: normalizeBoard({ title: "Ses masası" }) } };
    const miss = missingPanels(l);
    expect(miss.map((x) => x.id)).toEqual(expect.arrayContaining(["ledPvw", "board~b1"]));
    expect(miss.map((x) => x.id)).not.toContain("pvw");
    expect(miss.some((x) => LAYOUT_PANELS.find((p) => p.key === x.kind)?.multi && x.kind !== "board")).toBe(false);
  });
  it("ayar şablonları yerleşimi de taşır", () => {
    const g = PROFILE_GROUPS.find((x) => x.key === "layout");
    expect(g).toBeTruthy();
    expect(g.match("studio.layout.v1")).toBe(true);
    expect(g.match("studio.stage.v1")).toBe(true);
  });
});
