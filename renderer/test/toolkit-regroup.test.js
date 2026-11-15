// Araç Takımı yeniden gruplama (tur 4): her öğe tam olarak bir kategoride, kimlikler kararlı, eski
// adresler çözülür, arama ve komut paleti girdileri yeni kategorilerle çalışır.
import {
  ACTIONS, ALL_TOOLS, CATEGORIES, CATEGORY_ALIASES, ITEMS, ITEM_BY_ID, LINKS, SECTIONS, categoryKey, entryOf, groupsOf,
  itemsIn, paletteEntries, resolveHub, routeOf, searchEntries, toolsIn,
} from "../src/views/toolkit/hub/catalog";
import { TOOLS } from "../src/views/toolkit/toolRegistry";

// Tur 3'te yayımlanan (sabitlenmiş / son kullanılan listelerde saklanan) kimlikler — DEĞİŞMEMELİ.
const STABLE_TOOL_KEYS = [
  "layout", "color", "calc", "text", "qr", "clock", "timer", "password", "percent", "dates", "chars", "lorem", "json", "encode", "uuid",
  "fixture", "bracket", "standings", "scoreboard", "draw", "teams", "split", "roster", "poll", "salary", "invoice", "loan", "diff", "markdown",
  "meeting", "csv", "regex", "hash", "iban", "tckn", "phone", "timezone", "stopwatch", "countdowns", "palette", "qrbatch", "barcode", "fonts",
  "social", "network", "sysinfo",
];
const STABLE_SECTION_KEYS = ["files", "shelf", "calculators", "focus", "music", "widgets", "settings"];

test("her kayıtlı öğe (araç, bölüm, kısayol, eylem) TAM OLARAK bir kategoride ve bir alt grupta", () => {
  const placed = CATEGORIES.flatMap((c) => c.groups.flatMap((g) => g.items));
  // Yerleşimde tekrar yok.
  expect(new Set(placed).size).toBe(placed.length);
  const registered = [
    ...ALL_TOOLS.map((t) => `tool:${t.key}`),
    ...SECTIONS.map((s) => `section:${s.key}`),
    ...LINKS.map((l) => `link:${l.key}`),
    ...ACTIONS.map((a) => `act:${a.key}`),
  ];
  // Kayıtlı her öğe yerleşmiş; yerleşimde kayıtsız öğe yok.
  expect([...placed].sort()).toEqual([...registered].sort());
  // Kategori sayısı az; her kategori dolu.
  expect(CATEGORIES.length).toBeLessThanOrEqual(8);
  for (const c of CATEGORIES) {
    expect(itemsIn(c.key).length).toBeGreaterThan(0);
    for (const g of groupsOf(c.key)) expect(g.items.length).toBeGreaterThan(0);
  }
  // Kategoriler toplamı = öğe sayısı (hiçbir öğe iki yerde değil).
  expect(CATEGORIES.reduce((n, c) => n + itemsIn(c.key).length, 0)).toBe(ITEMS.length);
  for (const it of ITEMS) {
    expect(CATEGORIES.some((c) => c.key === it.cat)).toBe(true);
    expect(it.group).toBeTruthy();
  }
});

test("kimlikler kararlı: tur 3 araç ve bölüm anahtarlarının hepsi duruyor; panel araçları kayıtlı", () => {
  const keys = ALL_TOOLS.map((t) => t.key);
  expect(new Set(keys).size).toBe(keys.length);
  for (const k of STABLE_TOOL_KEYS) expect(entryOf(`tool:${k}`)).toMatchObject({ kind: "tool", key: k });
  for (const k of STABLE_SECTION_KEYS) expect(entryOf(`section:${k}`)).toMatchObject({ kind: "section", key: k });
  for (const t of TOOLS) expect(keys).toContain(t.key);
  const ids = ITEMS.map((i) => i.id);
  expect(new Set(ids).size).toBe(ids.length);
  expect(entryOf("tool:yok")).toBeNull();
  expect(entryOf("")).toBeNull();
});

test("araçlar mantıklı kategorilerde (örnekler)", () => {
  const cat = (id) => ITEM_BY_ID.get(id).cat;
  expect(cat("section:files")).toBe("dosya");
  expect(cat("link:download")).toBe("dosya");
  expect(cat("section:shelf")).toBe("dosya");
  expect(cat("act:capture")).toBe("dosya");
  expect(cat("section:music")).toBe("dosya");
  expect(cat("tool:calc")).toBe("hesap");
  expect(cat("section:calculators")).toBe("hesap");
  expect(cat("tool:salary")).toBe("hesap");
  expect(cat("tool:fixture")).toBe("lig");
  expect(cat("tool:json")).toBe("metin");
  expect(cat("tool:iban")).toBe("metin");
  expect(cat("section:focus")).toBe("zaman");
  expect(cat("tool:clock")).toBe("zaman");
  expect(cat("tool:qr")).toBe("tasarim");
  expect(cat("section:widgets")).toBe("masaustu");
  expect(cat("tool:layout")).toBe("masaustu");
  expect(cat("tool:network")).toBe("masaustu");
  expect(toolsIn("lig").map((t) => t.key)).toEqual(expect.arrayContaining(["fixture", "bracket", "standings", "draw"]));
});

test("adresler: eski rotalar, kategori adları ve eski kategori adları çözülür", () => {
  expect(resolveHub("files", "download")).toEqual({ view: "section", key: "files", arg: "download" });
  expect(resolveHub("calc", null)).toMatchObject({ view: "section", key: "calculators" });
  expect(resolveHub("desk", null)).toMatchObject({ view: "section", key: "settings" });
  expect(resolveHub("toolkit", "widgets")).toMatchObject({ view: "section", key: "widgets" });
  for (const c of CATEGORIES) expect(resolveHub("toolkit", `kat-${c.key}`)).toEqual({ view: "category", key: c.key });
  // Tur 3 kategori adresleri (menü, eski sabitler) yeni kategoriye gider.
  expect(resolveHub("toolkit", "kat-veri")).toEqual({ view: "category", key: "metin" });
  expect(resolveHub("toolkit", "kat-kimlik")).toEqual({ view: "category", key: "metin" });
  expect(resolveHub("toolkit", "kat-sistem")).toEqual({ view: "category", key: "masaustu" });
  expect(resolveHub("toolkit", "kat-yok")).toEqual({ view: "home" });
  for (const [from, to] of Object.entries(CATEGORY_ALIASES)) expect(categoryKey(from)).toBe(to);
  for (const k of STABLE_TOOL_KEYS) expect(resolveHub("toolkit", k)).toEqual({ view: "tool", key: k });
  expect(routeOf(entryOf("link:download"))).toBe("files:download");
  expect(routeOf(entryOf("act:capture"))).toBeNull();
  expect(routeOf(entryOf("section:shelf"))).toBe("shelf");
});

test("arama: kısayollar ve eylemler de bulunur, kategori adıyla aranır", () => {
  expect(searchEntries("bağlantıdan indir")[0].id).toBe("link:download");
  expect(searchEntries("youtube indir").map((e) => e.id)).toContain("link:download");
  expect(searchEntries("ekran goruntusu al")[0].id).toBe("act:capture");
  expect(searchEntries("uyanık").map((e) => e.id)).toContain("act:awake");
  expect(searchEntries("fikstur")[0].key).toBe("fixture");
  expect(searchEntries("maas")[0].key).toBe("salary");
  // Kategori adı → o kategorinin öğeleri.
  const hits = searchEntries("organizasyon").map((e) => e.id);
  for (const it of itemsIn("lig")) expect(hits).toContain(it.id);
  expect(searchEntries("   ")).toEqual([]);
});

test("komut paleti: araçlar, kısayollar ve kategoriler; yollar katalogla çözülür", () => {
  const p = paletteEntries();
  expect(p.find((e) => e.route === "files:download")).toBeTruthy();
  for (const c of CATEGORIES) expect(p.find((e) => e.route === `toolkit:kat-${c.key}`)).toBeTruthy();
  expect(p.find((e) => e.route === "toolkit:iban").hint).toBe("Araç Takımı · Metin ve Veri");
  const routes = p.map((e) => e.route);
  expect(new Set(routes).size).toBe(routes.length);
});
