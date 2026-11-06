import {
  DEFAULT_COLUMNS, DOCK_KEY, MAX_COLS, PANEL_PARTS, addColumn, enabledPanels, focusPanel, loadDock, movePanel, normalizeDock, partsCss, removeColumn,
  resizeColumns, saveDock, setColumnCount, setColumnPanel, setPanelEnabled, setPartVisible, togglePin,
} from "../src/views/studio/dock/dockModel";
import { RAIL_SIZES, RAIL_WIDGETS, addWidget, cycleWidgetSize, fitSize, normalizeRail, resizeWidget, sizeKey } from "../src/views/studio/shortcuts/railModel";
import { WIDGET_IMPL } from "../src/views/studio/shortcuts/widgets";
import { DEFAULT_GROUPS, applyProfile, collectProfile, diffProfile, profileFileName, validateProfile } from "../src/views/studio/settings/profiles";

const mem = (init = {}) => {
  const m = new Map(Object.entries(init));
  return {
    getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k),
    get length() { return m.size; }, key: (i) => [...m.keys()][i] ?? null, dump: () => Object.fromEntries(m),
  };
};

describe("alt panel düzeni", () => {
  it("varsayılan: Reji | Sahneler | Tekrar | Ses, Tekrar ve Ses sabit; eski sekme taşınır", () => {
    const d = normalizeDock(null, { legacyTab: "mode:var" });
    expect(d.mode).toBe("columns");
    expect(d.columns.map((c) => c.panel)).toEqual(["yonetim", "sahne", "tekrar", "ses"]);
    expect(d.columns.filter((c) => c.pinned).map((c) => c.panel)).toEqual(["tekrar", "ses"]);
    expect(d.tab).toBe("var");
  });
  it("bozuk kayıt ayıklanır; kaydet / yükle", () => {
    const d = normalizeDock({ mode: "tabs", columns: [{ id: "x", panel: "yok" }, { id: "y", panel: "led", w: 99 }], order: ["ses", "yok"], parts: { tekrar: ["angles", "angles", 3], yok: ["a"] } });
    expect(d.columns).toEqual([{ id: "y", panel: "led", pinned: false, w: 4 }]);
    expect(d.order[0]).toBe("ses");
    expect(d.parts).toEqual({ tekrar: ["angles"] });
    const s = mem();
    saveDock(s, d);
    expect(JSON.parse(s.getItem(DOCK_KEY)).mode).toBe("tabs");
    expect(loadDock(s)).toEqual(d);
  });
  it("sütun ekle (sabitlerin soluna), kaldır, sabit sütun değişmez", () => {
    let d = normalizeDock(null);
    d = addColumn(d, "var");
    expect(d.columns.map((c) => c.panel)).toEqual(["yonetim", "sahne", "var", "tekrar", "ses"]);
    expect(addColumn(d, "led")).toBe(d); // en çok 5
    expect(d.columns.length).toBe(MAX_COLS);
    const ses = d.columns.find((c) => c.panel === "ses");
    expect(removeColumn(d, ses.id)).toBe(d);
    expect(setColumnPanel(d, ses.id, "led").columns.find((c) => c.id === ses.id).panel).toBe("ses");
    d = togglePin(d, ses.id);
    expect(setColumnPanel(d, ses.id, "led").columns.find((c) => c.id === ses.id).panel).toBe("led");
    expect(setColumnCount(d, 2).columns.length).toBe(2);
  });
  it("ayraç sürükleme payları toplamı korur", () => {
    const d = normalizeDock(null);
    const r = resizeColumns(d, 0, 100, 1000);
    const sum = (x) => x.columns.reduce((t, c) => t + c.w, 0);
    expect(r.columns[0].w).toBeGreaterThan(d.columns[0].w);
    expect(Math.abs(sum(r) - sum(d))).toBeLessThan(0.02);
  });
  it("panele git: açıksa vurgula, değilse sabit olmayan sütunu çevir; tek sekmede sekme", () => {
    const d = normalizeDock(null);
    expect(focusPanel(d, "ses").colId).toBe("c_ses");
    const r = focusPanel(d, "yayin");
    expect(r.dock.columns[0].panel).toBe("yayin");
    expect(r.colId).toBe(DEFAULT_COLUMNS[0].id);
    expect(focusPanel({ ...d, mode: "tabs" }, "led").dock.tab).toBe("led");
  });
  it("paneller: kapat / sırala; parçalar ve kap düzeyi CSS", () => {
    let d = normalizeDock(null);
    d = setPanelEnabled(d, "led", false);
    expect(enabledPanels(d).some((p) => p.key === "led")).toBe(false);
    d = movePanel(d, "sahne", -1);
    expect(d.order.slice(0, 2)).toEqual(["sahne", "yonetim"]);
    d = setPartVisible(d, "tekrar", "route", false);
    d = setPartVisible(d, "tekrar", "angles", false);
    expect(d.parts.tekrar).toEqual(["route", "angles"]);
    expect(partsCss(d)).toContain('[data-dock-panel="tekrar"] .md-route');
    expect(partsCss(d)).not.toContain("angles");
    expect(setPartVisible(d, "tekrar", "route", true).parts.tekrar).toEqual(["angles"]);
    for (const k of ["tekrar", "ses", "yayin", "yonetim", "led"]) expect(PANEL_PARTS[k].length).toBeGreaterThan(2);
  });
});

describe("kısayol şeridi boyutları ve çeşitleri", () => {
  it("1×1 · 1×2 · 2×1 · 2×2; eski kayıt göç eder, izinsiz boyut en yakına", () => {
    expect(Object.keys(RAIL_SIZES)).toEqual(["1x1", "1x2", "2x1", "2x2"]);
    const n = normalizeRail([{ id: "a", type: "replayGo", size: 2 }, { id: "b", type: "goalBoth", size: 1 }, { id: "c", type: "mic", w: 1, h: 2 }]);
    expect(n.map(sizeKey)).toEqual(["2x2", "2x1", "1x2"]);
    expect(fitSize("goalBoth", "1x1")).toMatchObject({ w: 2, h: 1 });
    let l = addWidget([], "replaySlow");
    expect(sizeKey(l[0])).toBe("2x1");
    l = resizeWidget(l, l[0].id, "2x2");
    expect(sizeKey(l[0])).toBe("2x2");
    l = cycleWidgetSize(l, l[0].id);
    expect(sizeKey(l[0])).toBe("2x1");
  });
  it("her katalog çeşidinin bir parçacığı var; tekrar 5+, mikrofon 3 çeşit", () => {
    for (const w of RAIL_WIDGETS) {
      expect(WIDGET_IMPL[w.type], w.type).toBeTruthy();
      expect(w.sizes.includes(w.size), w.type).toBe(true);
    }
    expect(RAIL_WIDGETS.filter((w) => w.family === "replay").length).toBeGreaterThanOrEqual(5);
    expect(RAIL_WIDGETS.filter((w) => w.family === "mic").length).toBe(3);
  });
});

describe("ayar şablonları", () => {
  const base = () => mem({
    "studio.prefs.v1": JSON.stringify({ workspace: "classic", tab: "sahne" }),
    "studio.rail.v1": JSON.stringify({ v: 2, items: [] }),
    "studio.dock.v1": JSON.stringify({ mode: "columns" }),
    "elitlig.studio.graphics.7": JSON.stringify({ variant: "x" }),
    "studio.goalMusic.v1": JSON.stringify({ teams: {} }),
    "studio.v3": JSON.stringify({ scenes: [] }),
    "studio.match": "7",
    "studio.replayMeta.v1": "{}",
  });
  it("topla: seçilen gruplar; maça özgü veriler ve isteğe bağlı sahneler girmez", () => {
    const p = collectProfile(base(), { name: "Hafta sonu" });
    expect(Object.keys(p.groups).sort()).toEqual(["dock", "goalMusic", "graphics", "prefs", "rail"]);
    expect(JSON.stringify(p)).not.toContain("studio.match");
    expect(DEFAULT_GROUPS.includes("scenes")).toBe(false);
    expect(collectProfile(base(), { groups: ["scenes"] }).groups.scenes).toBeTruthy();
  });
  it("doğrula: yabancı dosya, bilinmeyen anahtar, bozuk JSON", () => {
    expect(validateProfile("{x").ok).toBe(false);
    expect(validateProfile({ app: "baska" }).ok).toBe(false);
    const v = validateProfile({ app: "elitlig-studio", kind: "studio-settings", v: 1, name: "A", groups: { prefs: { "studio.prefs.v1": "{\"a\":1}", "kotu.anahtar": "{}" }, yok: { a: "1" }, rail: { "studio.rail.v1": "{bozuk" } } });
    expect(v.ok).toBe(true);
    expect(v.profile.groups).toEqual({ prefs: { "studio.prefs.v1": "{\"a\":1}" } });
  });
  it("fark ve uygula: başka bilgisayara taşınır", () => {
    const src = base();
    const file = JSON.stringify(collectProfile(src, { name: "Tek kamera" }));
    const dst = mem({ "studio.prefs.v1": JSON.stringify({ workspace: "grid4" }), "elitlig.studio.graphics.9": "{}" });
    const { profile } = validateProfile(file);
    const rows = diffProfile(dst, profile);
    expect(rows.find((r) => r.key === "prefs")).toMatchObject({ changed: 1, added: 0 });
    expect(rows.find((r) => r.key === "prefs").fields).toContain("workspace");
    expect(rows.find((r) => r.key === "rail")).toMatchObject({ added: 1 });
    const res = applyProfile(dst, profile, { groups: ["prefs", "graphics"], replaceGroup: true });
    expect(res.applied).toEqual(["prefs", "graphics"]);
    expect(JSON.parse(dst.getItem("studio.prefs.v1")).workspace).toBe("classic");
    expect(dst.getItem("elitlig.studio.graphics.9")).toBe(null);
    expect(dst.getItem("studio.rail.v1")).toBe(null);
    expect(profileFileName("Hafta sonu maçı")).toBe("elitlig-studyo-hafta-sonu-maci.json");
  });
});
