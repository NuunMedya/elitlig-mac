import { describe, expect, it } from "vitest";
import {
  LAYOUT_COMPONENTS, LAYOUT_PANELS, PANEL_GROUPS, TAB_SPLITS, compPanelId, componentOf, defaultTitle, isKnownPanelId, missingPanels, paramsOfId, specToDock,
} from "../src/views/studio/layout/layoutModel";
import { getShared, resetShared, setShared } from "../src/views/studio/manage/manageStore";

describe("maç yönetimi · sekmelere ayrılan paneller", () => {
  it("her sekme kendi paneli, başlıkları 'Maç yönetimi › …'", () => {
    for (const id of TAB_SPLITS.yonetim) {
      expect(isKnownPanelId(id)).toBe(true);
      expect(defaultTitle(id)).toMatch(/^Maç yönetimi › /);
      expect(LAYOUT_PANELS.find((p) => p.key === id).group).toBe("yonetim");
    }
    expect(PANEL_GROUPS.some((g) => g.key === "yonetim")).toBe(true);
    expect(TAB_SPLITS.yonetim.map(defaultTitle)).toEqual(["Maç yönetimi › Maçlar", "Maç yönetimi › Reji", "Maç yönetimi › Kadro", "Maç yönetimi › Maç sonu", "Maç yönetimi › Takımlar"]);
    // birleşik panel de kalır
    expect(isKnownPanelId("yonetim")).toBe(true);
  });
  it("ayrılmış sekmeler hazır düzen ağacına konabilir", () => {
    const dock = specToDock({ row: [{ tabs: [...TAB_SPLITS.yonetim, "yonetim"] }, "pvw"] });
    expect(Object.keys(dock.panels)).toEqual(expect.arrayContaining(TAB_SPLITS.yonetim));
  });
  it("bölümler pano bileşeni: Reji, Maçlar, Kadro, Maç sonu", () => {
    const keys = LAYOUT_COMPONENTS.map((c) => c.key);
    expect(keys).toEqual(expect.arrayContaining([
      "reji.center", "reji.home", "reji.away", "reji.events", "reji.any",
      "mg.maclar.live", "mg.maclar.filters", "mg.maclar.list",
      "mg.kadro.home", "mg.kadro.away",
      "mg.macsonu.goal", "mg.macsonu.ratings", "mg.macsonu.awards",
    ]));
  });
  it("comp~<bileşen>: tek bileşen panel olarak (parçacık ve çoklu bileşen olmaz)", () => {
    expect(isKnownPanelId(compPanelId("part:yayin:youtube"))).toBe(true);
    expect(paramsOfId("comp~part:yayin:youtube")).toEqual({ kind: "comp", opts: { t: "part:yayin:youtube" } });
    expect(defaultTitle("comp~reji.events")).toBe(componentOf("reji.events").label);
    expect(isKnownPanelId("comp~ses.strip")).toBe(false);
    expect(isKnownPanelId("comp~yok")).toBe(false);
    const w = LAYOUT_COMPONENTS.find((c) => c.widget);
    if (w) expect(isKnownPanelId(compPanelId(w.key))).toBe(false);
  });
  it("kaldırılan paneller listesinde 'comp' görünmez", () => {
    expect(missingPanels({ dock: null, boards: {} }).some((x) => x.kind === "comp")).toBe(false);
  });
});

describe("maç yönetimi · ortak durum", () => {
  it("anahtar başına tek değer, işlevle güncellenir", () => {
    resetShared();
    expect(getShared("t.a", 1)).toBe(1);
    expect(getShared("t.a", 5)).toBe(1); // ilk değer kalır
    setShared("t.a", (v) => v + 1);
    expect(getShared("t.a")).toBe(2);
    resetShared();
    expect(getShared("t.a", () => 9)).toBe(9);
  });
});
