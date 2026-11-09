import {
  DENSITY_KEY, PANEL_CARDS, SPLITS, densityVars, normalizeDensity, panelDensity, presetCard, resetPanel, setBarPos, setCardWidth, setDensityMode, setSplit,
} from "../src/views/studio/dock/density";
import { PROFILE_GROUPS, collectProfile } from "../src/views/studio/settings/profiles";

describe("panel yoğunluğu (dock/density)", () => {
  it("varsayılan Sık: panelin temel kart genişliği, çubuk üstte", () => {
    const pd = panelDensity(normalizeDensity(null), "sahne");
    expect(pd).toEqual({ d: "sik", card: PANEL_CARDS.sahne.base, splits: {}, bar: "top" });
  });
  it("Normal / Geniş daha büyük kart önerir ve sınırlar içinde kalır", () => {
    for (const k of Object.keys(PANEL_CARDS)) {
      const c = PANEL_CARDS[k];
      expect(presetCard(k, "normal")).toBeGreaterThan(presetCard(k, "sik"));
      expect(presetCard(k, "genis")).toBeGreaterThanOrEqual(presetCard(k, "normal"));
      expect(presetCard(k, "genis")).toBeLessThanOrEqual(c.max);
    }
  });
  it("düzey değişince kart önerisine döner; kaydırıcı sınırlanır", () => {
    let s = setCardWidth(normalizeDensity(null), "tekrar", 9999);
    expect(panelDensity(s, "tekrar").card).toBe(PANEL_CARDS.tekrar.max);
    s = setDensityMode(s, "tekrar", "normal");
    expect(panelDensity(s, "tekrar")).toMatchObject({ d: "normal", card: presetCard("tekrar", "normal") });
    s = setDensityMode(s, "tekrar", "yok");
    expect(panelDensity(s, "tekrar").d).toBe("normal");
  });
  it("ayraçlar: sınırlanır, null ile silinir; bilinmeyen ayraç atılır", () => {
    let s = setSplit(normalizeDensity(null), "sahne", "sahne:edit", 10);
    expect(panelDensity(s, "sahne").splits["sahne:edit"]).toBe(SPLITS["sahne:edit"].min);
    s = setSplit(s, "sahne", "sahne:edit", null);
    expect(panelDensity(s, "sahne").splits).toEqual({});
    const n = normalizeDensity({ panels: { sahne: { splits: { yok: 300, "sahne:edit": 500 } }, bilinmeyen: { d: "genis" } } });
    expect(n.panels.sahne.splits).toEqual({ "sahne:edit": 500 });
    expect(n.panels.bilinmeyen).toBeUndefined();
  });
  it("CSS değişkenleri: kart, boşluk, ayraç", () => {
    let s = setSplit(normalizeDensity(null), "tekrar", "tekrar:side", 400);
    s = setBarPos(s, "tekrar", "bottom");
    const pd = panelDensity(s, "tekrar");
    expect(pd.bar).toBe("bottom");
    const v = densityVars("tekrar", pd);
    expect(v["--card-w"]).toBe(`${PANEL_CARDS.tekrar.base}px`);
    expect(v["--split-tekrar-side"]).toBe("400px");
    expect(v["--dens-gap"]).toBe("6px");
    expect(panelDensity(resetPanel(s, "tekrar"), "tekrar").bar).toBe("top");
  });
  it("bozuk JSON güvenle boş duruma döner", () => {
    expect(normalizeDensity("{bozuk")).toEqual({ v: 1, panels: {} });
  });
  it("ayar şablonlarına girer (density grubu)", () => {
    const g = PROFILE_GROUPS.find((x) => x.key === "density");
    expect(g && g.match(DENSITY_KEY)).toBe(true);
    const mem = new Map([[DENSITY_KEY, JSON.stringify({ v: 1, panels: { sahne: { d: "genis" } } })]]);
    const storage = { get length() { return mem.size; }, key: (i) => [...mem.keys()][i], getItem: (k) => mem.get(k) ?? null };
    expect(collectProfile(storage, { groups: ["density"] }).groups.density[DENSITY_KEY]).toContain("genis");
  });
});
