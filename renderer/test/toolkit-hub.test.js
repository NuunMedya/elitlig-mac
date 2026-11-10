// Birleşik Araç Takımı: eski rotalar ilgili bölümü açar, kenar çubuğunda tek giriş, katalog ve arama.
import { ALL_TOOLS, CATEGORIES, SECTIONS, entryOf, paletteEntries, pushRecent, resolveHub, routeOf, searchEntries, togglePin } from "../src/views/toolkit/hub/catalog";
import { TOOLS } from "../src/views/toolkit/toolRegistry";

test("eski rotalar birleşik menünün bölümüne çözülür (kısayollar kaybolmaz)", () => {
  expect(resolveHub("files", "paste")).toEqual({ view: "section", key: "files", arg: "paste" });
  expect(resolveHub("shelf", "settings")).toMatchObject({ view: "section", key: "shelf", arg: "settings" });
  expect(resolveHub("calc", null)).toMatchObject({ view: "section", key: "calculators" });
  expect(resolveHub("focus")).toMatchObject({ view: "section", key: "focus" });
  expect(resolveHub("music")).toMatchObject({ view: "section", key: "music" });
  expect(resolveHub("desk", "permission")).toMatchObject({ view: "section", key: "settings", arg: "permission" });
  expect(resolveHub("toolkit", "widgets")).toMatchObject({ view: "section", key: "widgets" });
  expect(resolveHub("toolkit", "json")).toEqual({ view: "tool", key: "json" });
  expect(resolveHub("toolkit", "fixture")).toEqual({ view: "tool", key: "fixture" });
  expect(resolveHub("toolkit", "kat-lig")).toEqual({ view: "category", key: "lig" });
  expect(resolveHub("toolkit", null)).toEqual({ view: "home" });
  expect(resolveHub("toolkit", "bilinmeyen")).toEqual({ view: "home" });
});

test("katalog: anahtarlar tekil, panelin eski araçlarının hepsi var, her araç bir kategoride ve bileşenli", () => {
  const keys = ALL_TOOLS.map((t) => t.key);
  expect(new Set(keys).size).toBe(keys.length);
  for (const t of TOOLS) expect(keys).toContain(t.key);
  const cats = new Set(CATEGORIES.map((c) => c.key));
  for (const t of ALL_TOOLS) { expect(cats.has(t.cat)).toBe(true); if (t.key !== "layout") expect(t.component).toBeTruthy(); }
  expect(ALL_TOOLS.length).toBeGreaterThanOrEqual(45);
  for (const k of ["files", "shelf", "calculators", "focus", "music", "widgets", "settings"]) expect(SECTIONS.some((s) => s.key === k)).toBe(true);
  expect(routeOf(entryOf("section:calculators"))).toBe("calc");
  expect(routeOf(entryOf("tool:iban"))).toBe("toolkit:iban");
});

test("arama: Türkçe karakterden bağımsız, başlık eşleşmesi önde", () => {
  expect(searchEntries("fikstur")[0].key).toBe("fixture");
  expect(searchEntries("ekran görüntüsü")[0].key).toBe("shelf");
  expect(searchEntries("maas")[0].key).toBe("salary");
  expect(searchEntries("pomodoro").map((e) => e.key)).toContain("focus");
  expect(searchEntries("iban")[0].key).toBe("iban");
  expect(searchEntries("")).toEqual([]);
});

test("sabitle / son kullanılan ve komut paleti girdileri", () => {
  expect(togglePin(["a"], "b")).toEqual(["a", "b"]);
  expect(togglePin(["a", "b"], "a")).toEqual(["b"]);
  expect(pushRecent(["x", "y"], "y")).toEqual(["y", "x"]);
  const p = paletteEntries();
  expect(p.find((e) => e.route === "toolkit:standings").label).toBe("Puan durumu hesaplayıcı");
});

test("kenar çubuğu: Araç Takımı tek giriş; eski bölümler gizli ama rotaları ve kısayolları duruyor", async () => {
  const { ROUTES } = await import("../src/App");
  const side = ROUTES.filter((r) => !r.hub).map((r) => r.key);
  for (const k of ["calc", "focus", "music", "desk", "files", "shelf"]) {
    expect(side).not.toContain(k);
    const r = ROUTES.find((x) => x.key === k);
    expect(r.hub).toBe(true);
    expect(r.view).toBe(ROUTES.find((x) => x.key === "toolkit").view);
  }
  expect(side).toContain("toolkit");
  expect(ROUTES.map((r) => r.shortcut)).toEqual(expect.arrayContaining(["⇧⌘D", "⇧⌘P", "⌘8", "⌘9", "⇧⌘J", "⌘,", "⇧⌘A"]));
});
