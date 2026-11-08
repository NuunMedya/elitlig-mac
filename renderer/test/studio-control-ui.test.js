// Kontrol merkezi araması, panel "son yerine" geri koyma, sekme şeridi biçimi, arayüz ölçeği / tema, yön.
import { UI_SCALES, UI_THEMES, normalizeSettings, stepScale } from "../src/views/studio/settings/settings";
import {
  DEFAULT_TAB_STYLE, normalizeLayout, neighborOf, normalizeTabStyle, presetTarget, setTabStyle, specToDock, tabStyleOf,
} from "../src/views/studio/layout/layoutModel";
import { searchSections } from "../src/views/studio/control/ControlCenter";
import { PANEL_BUTTONS, PANEL_WIDGETS } from "../src/views/studio/shortcuts/wPanels";
import { RAIL_WIDGETS } from "../src/views/studio/shortcuts/railModel";
import { orientOf } from "../src/views/studio/shortcuts/wkit";

describe("arayüz ölçeği ve tema", () => {
  it("%70–%125 ölçekler; ⌘ + / − / 0 adımları", () => {
    expect(UI_SCALES).toEqual([70, 75, 80, 85, 90, 100, 110, 125]);
    expect(normalizeSettings({ view: { scale: 70 } }).view.scale).toBe(70);
    expect(normalizeSettings({ view: { scale: 65 } }).view.scale).toBe(100);
    expect(stepScale(100, -1)).toBe(90);
    expect(stepScale(70, -1)).toBe(70);
    expect(stepScale(125, 1)).toBe(125);
    expect(stepScale(85, 1)).toBe(90);
    expect(stepScale(75, 0)).toBe(100);
    expect(stepScale(77, 1)).toBe(110); // bilinmeyen: %100'den adım
  });
  it("tema anahtarı korunur, bilinmeyen → Gece mavisi", () => {
    expect(UI_THEMES.length).toBeGreaterThanOrEqual(4);
    expect(normalizeSettings({ view: { theme: "okyanus" } }).view.theme).toBe("okyanus");
    expect(normalizeSettings({ view: { theme: "pembe" } }).view.theme).toBe("gece");
    expect(normalizeSettings({}).view.theme).toBe("gece");
  });
});

describe("panel son yerine / hazır düzendeki yerine", () => {
  const dock = specToDock({ row: [{ tabs: ["board~rail"], size: 12 }, { size: 88, col: [{ row: [{ tabs: ["pvw"] }, { tabs: ["pgm"] }] }, { row: [{ tabs: ["yonetim", "olaylar"] }, { tabs: ["ses"] }] }] }] });
  it("aynı gruptaki sekme → within; tek başına grup → komşunun sağı / altı", () => {
    expect(neighborOf(dock, "yonetim")).toEqual({ panel: "olaylar", direction: "within" });
    expect(neighborOf(dock, "ses")).toEqual({ panel: "yonetim", direction: "right" });
    expect(neighborOf(dock, "pvw")).toEqual({ panel: "pgm", direction: "left" });
    expect(neighborOf(dock, "board~rail")).toEqual({ panel: "pvw", direction: "left" });
    expect(neighborOf(dock, "yok")).toBe(null);
  });
  it("hazır düzen: ekrandaki sekme arkadaşının yanına, yoksa komşusuna", () => {
    const have = (id) => ["pvw", "pgm", "yonetim", "ses", "board~rail", "gecis", "sahneSerit"].includes(id);
    expect(presetTarget("klasik", "olaylar", have)).toEqual({ panel: "yonetim", direction: "within" });
    expect(presetTarget("klasik", "tekrar", have)).toEqual({ panel: "yonetim", direction: "right" }); // Sahneler grubu ekranda yok: önceki komşu
    expect(presetTarget("klasik", "golMuzigi", have)).toBe(null); // klasik düzende yok
  });
});

describe("sekme şeridi biçimi", () => {
  it("geçersizler atılır; grup ayarı varsayılanın üstüne", () => {
    expect(normalizeTabStyle({ pos: "çapraz", size: "l", weight: "850", accent: "#ABCDEF", bg: "kırmızı", icons: false })).toEqual({ size: "l", weight: 850, accent: "#abcdef", icons: false });
    let l = normalizeLayout({});
    expect(tabStyleOf(l, "g1")).toEqual({ ...DEFAULT_TAB_STYLE });
    l = setTabStyle(l, null, { size: "s" });
    l = setTabStyle(l, "g1", { pos: "left", accent: "#22c55e" });
    expect(tabStyleOf(l, "g1")).toMatchObject({ pos: "left", size: "s", accent: "#22c55e" });
    expect(tabStyleOf(l, "g2")).toMatchObject({ pos: "top", size: "s" });
    // kaydet / yükle
    const back = normalizeLayout(JSON.parse(JSON.stringify(l)));
    expect(back.tabs.g1).toEqual({ pos: "left", accent: "#22c55e" });
    expect(back.tabDefault).toEqual({ size: "s" });
    // null: alan varsayılana döner; boş grup silinir
    l = setTabStyle(l, "g1", { pos: null, accent: null });
    expect(l.tabs.g1).toBeUndefined();
  });
  it("genel varsayılan solda iken grup açıkça üstte kalabilir", () => {
    let l = setTabStyle(normalizeLayout({}), null, { pos: "left" });
    l = setTabStyle(l, "g3", { pos: "top" });
    expect(tabStyleOf(normalizeLayout(JSON.parse(JSON.stringify(l))), "g3").pos).toBe("top");
  });
});

describe("kontrol merkezi araması", () => {
  const S = [
    { key: "tekrar", label: "Tekrar", group: "tekrar", kw: ["ağır çekim"], parts: ["Oynatma listesi", "Yakınlaştırma"] },
    { key: "ses", label: "Ses", group: "ses", parts: ["Mikrofon ve ek kaynaklar"] },
    { key: "yonetimReji", label: "Reji", group: "mac", kw: ["gol", "kart"] },
  ];
  it("ad, grup, anahtar sözcük ve parça adıyla bulur (Türkçe harf duyarsız)", () => {
    expect(searchSections(S, "").length).toBe(3);
    expect(searchSections(S, "agir").map((x) => x.s.key)).toEqual(["tekrar"]);
    expect(searchSections(S, "YAKINLAŞ")[0]).toMatchObject({ hit: "Yakınlaştırma" });
    expect(searchSections(S, "mac yonetimi").map((x) => x.s.key)).toEqual(["yonetimReji"]);
    expect(searchSections(S, "mikrofon")[0].s.key).toBe("ses");
    expect(searchSections(S, "zzz")).toEqual([]);
  });
});

describe("panel açma düğmeleri ve yön", () => {
  it("her düğmenin kataloğu ve seçenek paneli var", () => {
    for (const type of [...Object.keys(PANEL_BUTTONS), "openPanel"]) {
      expect(RAIL_WIDGETS.some((w) => w.type === type && w.group === "panel"), type).toBe(true);
      expect(PANEL_WIDGETS[type]?.render, type).toBeTruthy();
      expect(PANEL_WIDGETS[type]?.popover, type).toBeTruthy();
    }
  });
  it("hücre oranından yön", () => {
    expect(orientOf(80, 260)).toBe("tall");
    expect(orientOf(380, 80)).toBe("wide");
    expect(orientOf(180, 170)).toBe("square");
    expect(orientOf(0, 10)).toBe(null);
  });
});
