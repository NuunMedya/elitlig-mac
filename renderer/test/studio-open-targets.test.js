// Panel açma HEDEFLERİ (layoutModel.OPEN_TARGETS → wPanels "go:<id>" düğmeleri):
// her panel, her panel parçası, her Kontrol merkezi ve Ayarlar bölümü kapsanır.
import { describe, expect, it } from "vitest";
import {
  CONTROL_SECTIONS, LAYOUT_COMPONENTS, LAYOUT_PANELS, OPEN_GROUPS, OPEN_TARGETS, SETTINGS_TARGETS, compPanelId, componentOf, isKnownPanelId,
  openTargetOf, openTargetPanelId, openWheres, partParent, panelMeta,
} from "../src/views/studio/layout/layoutModel";
import { RAIL_GROUPS, RAIL_WIDGETS, widgetOf } from "../src/views/studio/shortcuts/railModel";
import { WIDGET_IMPL } from "../src/views/studio/shortcuts/widgets";
import { SETTINGS_SECTIONS } from "../src/views/studio/settings/SettingsPage";

describe("panel açma hedefleri", () => {
  it("her işletim / ekran paneli (çoklu ve pano hariç) bir hedef", () => {
    for (const p of LAYOUT_PANELS) {
      if (p.multi || p.key === "board" || p.key === "comp") continue;
      expect(openTargetOf(p.key), p.key).toBeTruthy();
    }
    for (const k of ["yonetimKadro", "yonetimMaclar", "yonetimMacsonu", "yonetimTakimlar", "yonetimReji", "bolumler"]) expect(openTargetOf(k)?.kind).toBe("panel");
  });

  it("her panel parçası (tek başına panel olabilen) bir hedef; ana paneli bilinir", () => {
    const parts = LAYOUT_COMPONENTS.filter((c) => !c.widget && !c.multi && !panelMeta(c.key) && isKnownPanelId(compPanelId(c.key)));
    expect(parts.length).toBeGreaterThan(50);
    for (const c of parts) {
      const t = openTargetOf(c.key);
      expect(t, c.key).toBeTruthy();
      expect(t.kind).toBe("part");
      expect(openTargetPanelId(t)).toBe(`comp~${c.key}`);
    }
    // örnekler: Tekrar › liste, Yayın › bölümler / kayıt, Reji › skor ve saat, Kadro › ev sahibi
    expect(partParent("part:tekrar:list")).toBe("tekrar");
    expect(partParent("part:yayin:chapters")).toBe("yayin");
    expect(partParent("reji.center")).toBe("yonetimReji");
    expect(partParent("mg.kadro.home")).toBe("yonetimKadro");
    expect(openTargetOf("part:yayin:localrec").group).toBe("yayin");
    expect(openTargetOf("ses.master").group).toBe("ses");
  });

  it("Ayarlar sayfasının her bölümü ve Grafik ayarları hedef", () => {
    const keys = new Set(SETTINGS_TARGETS.map((s) => s.key));
    for (const s of SETTINGS_SECTIONS) expect(keys.has(s.key), s.key).toBe(true);
    for (const k of ["skorbord", "altyazi", "marka", "sponsor"]) expect(openTargetOf(`ayar:${k}`).group).toBe("grafik");
  });

  it("Kontrol merkezi bölümleri hedef; kaynaklar dahil", () => {
    for (const s of CONTROL_SECTIONS) expect(openTargetOf(`cc:${s.key}`), s.key).toBeTruthy();
    expect(openTargetOf("cc:kaynaklar").kind).toBe("cc");
    expect(openWheres(openTargetOf("cc:kaynaklar")).map(([k]) => k)).toEqual(["kontrol"]);
  });

  it("nerede açılsın: panel / parça → yerinde · Kontrol merkezi · yüzen; ayar → Ayarlar (+ Kontrol merkezi)", () => {
    expect(openWheres(openTargetOf("yonetimKadro")).map(([k]) => k)).toEqual(["layout", "kontrol", "float"]);
    expect(openWheres(openTargetOf("part:tekrar:list")).map(([k]) => k)).toEqual(["layout", "kontrol", "float"]);
    expect(openWheres(openTargetOf("ayar:skorbord")).map(([k]) => k)).toEqual(["ayarlar", "kontrol"]);
    expect(openWheres(openTargetOf("ayar:gorunum")).map(([k]) => k)).toEqual(["ayarlar"]);
  });

  it("her hedef bir parçacık: katalogda gruplu, uygulaması var, kimlikler tekil", () => {
    const ids = OPEN_TARGETS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    const groups = new Set(OPEN_GROUPS.map((g) => g.key));
    for (const t of OPEN_TARGETS) {
      expect(groups.has(t.group), t.id).toBe(true);
      const w = widgetOf(`go:${t.id}`);
      expect(w, t.id).toBeTruthy();
      expect(RAIL_GROUPS.some((g) => g.key === w.group)).toBe(true);
      expect(WIDGET_IMPL[`go:${t.id}`], t.id).toBeTruthy();
      expect(componentOf(`w:go:${t.id}`)?.group).toBe(`w-go-${t.group}`);
    }
    for (const g of OPEN_GROUPS) expect(OPEN_TARGETS.filter((t) => t.group === g.key).length, g.key).toBeGreaterThanOrEqual(4);
    expect(RAIL_WIDGETS.filter((w) => w.family === "openTarget").length).toBe(OPEN_TARGETS.length);
  });
});
