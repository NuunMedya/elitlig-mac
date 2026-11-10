// Bugün panosu: boyut → kademe, kalıcılık / göç, şablon varsayılanları, kütüphane bütünlüğü.
import { describe, expect, it } from "vitest";
import {
  COLS, TEMPLATES, addItem, addPage, applyGrid, colsForWidth, compactFor, defaultState, duplicateItem, effectiveTier, findSpot,
  loadState, migrateState, normalizeItem, patchItem, removePage, renamePage, replacePage, saveState, setTier, sizeForTier, sizeLimits, storageKey, tierOf,
} from "../src/views/today/dashModel";
import { CATEGORIES, OPTION_TYPES, REGISTRY, ROUTE_CHOICES, ACTION_CHOICES, TIERS, defaultOptions, isAllowed, metaOf, searchRegistry, widgetSizeFor, WIDGET_SIZES } from "../src/views/today/registry";

const memStore = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), raw: m }; };

describe("boyut → kademe", () => {
  it("1×1 / 2×1 / 1×2 düğme, şeritler, alanlar", () => {
    expect(tierOf(1, 1)).toBe("xs");
    expect(tierOf(2, 1)).toBe("xs");
    expect(tierOf(1, 2)).toBe("xs");
    expect(tierOf(3, 1)).toBe("s");
    expect(tierOf(6, 1)).toBe("m");
    expect(tierOf(1, 4)).toBe("s");
    expect(tierOf(3, 2)).toBe("s");
    expect(tierOf(4, 3)).toBe("m");
    expect(tierOf(4, 4)).toBe("m");
    expect(tierOf(6, 4)).toBe("l");
    expect(tierOf(6, 6)).toBe("l");
    expect(tierOf(8, 6)).toBe("xl");
    expect(tierOf(12, 6)).toBe("xl");
    expect(tierOf(0, -3)).toBe("xs");
  });
  it("kademe büyüdükçe artar (monoton) — her en için", () => {
    for (let w = 1; w <= COLS; w += 1) {
      let prev = -1;
      for (let h = 2; h <= 12; h += 1) {
        const k = TIERS.indexOf(tierOf(w, h));
        expect(k).toBeGreaterThanOrEqual(prev);
        prev = k;
      }
    }
  });
  it("desteklenmeyen kademe en yakın küçüğe iner, yoksa en küçük desteklenene çıkar", () => {
    const week = metaOf("week"); // m, l, xl
    expect(effectiveTier(week, 1, 1)).toBe("m");
    expect(effectiveTier(week, 12, 8)).toBe("xl");
    const rates = metaOf("rates"); // xs, s, m
    expect(effectiveTier(rates, 8, 6)).toBe("m");
    expect(effectiveTier(rates, 1, 1)).toBe("xs");
  });
  it("kademe boyutu bileşen sınırlarına sıkışır ve istenen kademeyi verir", () => {
    for (const m of REGISTRY) {
      for (const t of m.tiers) {
        const [w, h] = sizeForTier(m, t);
        const { min, max } = sizeLimits(m);
        expect(w).toBeGreaterThanOrEqual(min[0]);
        expect(h).toBeGreaterThanOrEqual(min[1]);
        expect(w).toBeLessThanOrEqual(Math.min(max[0], COLS));
        expect(effectiveTier(m, w, h)).toBe(t);
      }
    }
  });
});

describe("öğe işlemleri", () => {
  it("bilinmeyen bileşen atılır, taşan öğe sığdırılır, renk ve başlık temizlenir", () => {
    expect(normalizeItem({ t: "yok", w: 2, h: 2 })).toBeNull();
    const it = normalizeItem({ i: "a", t: "balance", x: 11, y: -4, w: 20, h: 99, accent: "#ABCDEF", title: "  Kasa  ", o: { fn: () => 1, n: 3 } });
    expect(it.w).toBe(12);
    expect(it.x).toBe(0);
    expect(it.y).toBe(0);
    expect(it.h).toBeLessThanOrEqual(16);
    expect(it.accent).toBe("#abcdef");
    expect(it.title).toBe("Kasa");
    expect(it.o).toEqual({ n: 3 });
    expect(normalizeItem({ t: "balance", accent: "red" }).accent).toBeUndefined();
  });
  it("ekle: ilk boş yere, varsayılan seçeneklerle; kopyala sağına; kademe değiştir", () => {
    let items = addItem([], "route");
    expect(items[0]).toMatchObject({ t: "route", x: 0, y: 0, w: 1, h: 1, o: { route: "agenda" } });
    items = addItem(items, "route", { o: { route: "ledger" } });
    expect(items[1]).toMatchObject({ x: 1, y: 0, o: { route: "ledger" } });
    items = duplicateItem(items, items[1].i);
    expect(items[2]).toMatchObject({ x: 2, y: 0, o: { route: "ledger" } });
    expect(items[2].i).not.toBe(items[1].i);
    const big = setTier(addItem([], "stages"), addItem([], "stages")[0]?.i);
    expect(big).toHaveLength(1);
    let s = addItem([], "stages", { i: "st" });
    s = setTier(s, "st", "xs");
    expect(tierOf(s[0].w, s[0].h)).toBe("xs");
    s = setTier(s, "st", "xl");
    expect(tierOf(s[0].w, s[0].h)).toBe("xl");
  });
  it("findSpot çakışmasız yer bulur", () => {
    const items = [{ i: "a", x: 0, y: 0, w: 12, h: 2 }, { i: "b", x: 0, y: 2, w: 6, h: 2 }];
    expect(findSpot(items, 6, 2)).toEqual({ x: 6, y: 2 });
    expect(findSpot(items, 7, 1)).toEqual({ x: 0, y: 4 });
  });
  it("patch: başlık / renk silinir, seçenekler birleşir; applyGrid yalnız değişeni yazar", () => {
    let items = addItem([], "messages", { i: "m", title: "Ekip", accent: "#112233", o: { to: 5 } });
    items = patchItem(items, "m", { title: "", accent: null, o: { source: "personal" } });
    expect(items[0].title).toBeUndefined();
    expect(items[0].accent).toBeUndefined();
    expect(items[0].o).toMatchObject({ to: 5, source: "personal" });
    expect(applyGrid(items, [{ i: "m", x: items[0].x, y: items[0].y, w: items[0].w, h: items[0].h }])).toBe(items);
    const moved = applyGrid(items, [{ i: "m", x: 2, y: 3, w: 4, h: 4 }]);
    expect(moved[0]).toMatchObject({ x: 2, y: 3, w: 4, h: 4 });
  });
  it("dar pencere: daha az sütuna çakışmasız dizilir", () => {
    const page = defaultState().pages[0];
    for (const cols of [6, 4]) {
      const g = compactFor(page.items, cols);
      expect(g).toHaveLength(page.items.length);
      for (const a of g) {
        expect(a.x + a.w).toBeLessThanOrEqual(cols);
        for (const b of g) if (a !== b) expect(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h).toBe(false);
      }
    }
    expect(colsForWidth(1200)).toBe(12);
    expect(colsForWidth(600)).toBe(6);
    expect(colsForWidth(400)).toBe(4);
  });
});

describe("şablonlar ve varsayılan", () => {
  it("varsayılan: Genel (eski Bugün içeriği) + Maç günü + Muhasebe", () => {
    const s = defaultState();
    expect(s.pages.map((p) => p.title)).toEqual(["Genel", "Maç günü", "Muhasebe"]);
    expect(s.active).toBe("genel");
    const types = s.pages[0].items.map((i) => i.t);
    // Eski Bugün ekranındaki bölümlerin hepsi Genel sayfasında.
    for (const t of ["hero", "launcher", "toolkit", "quicktodo", "todos", "requests", "followups", "equipment", "upcoming", "balance", "notes", "focus", "counts"]) expect(types).toContain(t);
  });
  it("her şablon öğesi kayıtlı bileşen, ızgaraya sığar, çakışmaz, desteklenen kademede", () => {
    for (const [key, tpl] of Object.entries(TEMPLATES)) {
      for (const it of tpl.items) {
        const m = metaOf(it.t);
        expect(m, `${key}: ${it.t}`).toBeTruthy();
        expect(it.x + it.w).toBeLessThanOrEqual(COLS);
        expect(m.tiers, `${key}: ${it.t} ${it.w}×${it.h}`).toContain(effectiveTier(m, it.w, it.h));
        expect(m.tiers, `${key}: ${it.t} ${it.w}×${it.h} doğrudan`).toContain(tierOf(it.w, it.h));
        const { min } = sizeLimits(m);
        expect(it.w >= min[0] && it.h >= min[1], `${key}: ${it.t} en küçük boyut`).toBe(true);
      }
      const a = tpl.items;
      for (let p = 0; p < a.length; p += 1) for (let q = p + 1; q < a.length; q += 1) {
        const x = a[p], y = a[q];
        expect(x.x < y.x + y.w && y.x < x.x + x.w && x.y < y.y + y.h && y.y < x.y + x.h, `${key}: ${x.t} ↔ ${y.t}`).toBe(false);
      }
    }
  });
  it("sayfa ekle / yeniden adlandır / değiştir / sil", () => {
    let s = defaultState();
    s = addPage(s, "projeler");
    expect(s.pages).toHaveLength(4);
    expect(s.active).toBe(s.pages[3].id);
    expect(s.pages[3].items.some((i) => i.t === "stages")).toBe(true);
    s = renamePage(s, s.active, "Organizasyon");
    expect(s.pages[3].title).toBe("Organizasyon");
    s = replacePage(s, s.active, "bos");
    expect(s.pages[3].items).toHaveLength(0);
    expect(s.pages[3].title).toBe("Organizasyon");
    s = removePage(s, s.active);
    expect(s.pages).toHaveLength(3);
    expect(s.active).toBe("muhasebe");
    let one = { ...s, pages: [s.pages[0]], active: s.pages[0].id };
    one = removePage(one, one.active);
    expect(one.pages).toHaveLength(1);
  });
});

describe("kalıcılık ve göç", () => {
  it("kayıt yoksa / bozuksa varsayılan", () => {
    const st = memStore();
    expect(loadState(st, "k").pages).toHaveLength(3);
    st.setItem("k", "{bozuk");
    expect(loadState(st, "k").pages[0].id).toBe("genel");
    expect(loadState(null, "k").pages).toHaveLength(3);
  });
  it("kaydet → yükle aynı durumu verir; kullanıcıya göre anahtar", () => {
    const st = memStore();
    let s = addPage(defaultState(), "iletisim");
    expect(saveState(st, storageKey(7), s)).toBe(true);
    expect(st.raw.has("today.dashboard.v1:7")).toBe(true);
    const back = loadState(st, storageKey(7));
    expect(back).toEqual(JSON.parse(JSON.stringify(s)));
    expect(loadState(st, storageKey(8)).pages).toHaveLength(3);
    s = { ...s, active: "yok" };
    expect(migrateState(JSON.parse(JSON.stringify(s))).active).toBe(s.pages[0].id);
  });
  it("v0 (tek sayfa / dizi) → Genel sayfası; bilinmeyen bileşen ve yinelenen kimlik onarılır", () => {
    const v0 = { items: [{ i: "x", t: "balance", x: 0, y: 0, w: 4, h: 4 }, { i: "x", t: "todos", x: 4, y: 0, w: 4, h: 4 }, { i: "z", t: "eski-bilesen", x: 0, y: 0, w: 1, h: 1 }] };
    const s = migrateState(v0);
    expect(s.v).toBe(1);
    expect(s.pages).toHaveLength(1);
    expect(s.pages[0].items.map((i) => i.t)).toEqual(["balance", "todos"]);
    expect(new Set(s.pages[0].items.map((i) => i.i)).size).toBe(2);
    expect(migrateState([{ t: "route", w: 1, h: 1 }]).pages[0].items[0].t).toBe("route");
    expect(migrateState({ v: 1, pages: [] }).pages).toHaveLength(3);
    expect(migrateState({ v: 9, pages: [{ id: "a", title: "", items: [] }] }).pages[0]).toMatchObject({ id: "a", title: "Sayfa" });
    expect(migrateState("metin").pages).toHaveLength(3);
  });
});

describe("kütüphane bütünlüğü", () => {
  it("40'tan çok bileşen, benzersiz kimlik, geçerli kategori / kademe / boyut / seçenek", () => {
    expect(REGISTRY.length).toBeGreaterThanOrEqual(40);
    const ids = REGISTRY.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    const cats = new Set(CATEGORIES.map((c) => c.key));
    for (const m of REGISTRY) {
      expect(cats.has(m.cat), m.id).toBe(true);
      expect(m.label && m.hint && m.icon, m.id).toBeTruthy();
      expect(m.tiers.length, m.id).toBeGreaterThan(0);
      expect(m.tiers.every((t) => TIERS.includes(t)), m.id).toBe(true);
      expect([...m.tiers].sort((a, b) => TIERS.indexOf(a) - TIERS.indexOf(b)), m.id).toEqual(m.tiers);
      expect(m.tiers, `${m.id} varsayılan boyutu`).toContain(tierOf(m.size[0], m.size[1]));
      expect(m.size[0]).toBeLessThanOrEqual(COLS);
      for (const o of m.options || []) {
        expect(OPTION_TYPES, `${m.id}.${o.key}`).toContain(o.type);
        if (o.type === "select") expect(o.choices.some(([v]) => v === o.def), `${m.id}.${o.key}`).toBe(true);
      }
      if (m.route) expect(ROUTE_CHOICES.some(([k]) => k === m.route) || /^[a-z]+(:[\w-]+)?$/.test(m.route), m.id).toBe(true);
      if (m.embed) expect(m.wsizes.every((w) => WIDGET_SIZES.includes(w)), m.id).toBe(true);
    }
    for (const c of CATEGORIES) expect(REGISTRY.some((m) => m.cat === c.key), c.key).toBe(true);
  });
  it("her kademe ailesi: en az iki kademe (boyutla işlev değişir) ya da tek dokunuş düğmesi", () => {
    for (const m of REGISTRY) expect(m.tiers.length >= 2 || m.tiers[0] === "xs", m.id).toBe(true);
    expect(REGISTRY.filter((m) => m.tiers.includes("xs")).length).toBeGreaterThan(30);
  });
  it("arama: Türkçe büyük / küçük harf ve aksan duyarsız; kategori ve yetki süzgeci", () => {
    expect(searchRegistry("MESAJ").map((m) => m.id)).toContain("messages");
    expect(searchRegistry("indir").map((m) => m.id)).toContain("download");
    expect(searchRegistry("etap").map((m) => m.id)).toContain("stages");
    expect(searchRegistry("fatura").map((m) => m.id)).toContain("receivables");
    expect(searchRegistry("", { cat: "money" }).every((m) => m.cat === "money")).toBe(true);
    expect(searchRegistry("talep", { access: { requests: false } }).map((m) => m.id)).not.toContain("requests");
    expect(isAllowed(metaOf("studio"), { requests: true })).toBe(true);
    expect(isAllowed(metaOf("studio"), { live: false })).toBe(false);
    expect(defaultOptions(metaOf("download"))).toEqual({ mode: "video", quality: "best" });
    expect(widgetSizeFor(metaOf("standings"), "s")).toBe("medium");
    expect(widgetSizeFor(metaOf("standings"), "xl")).toBe("large");
    expect(widgetSizeFor(metaOf("week"), "xl")).toBe("xlarge");
    expect(widgetSizeFor(metaOf("weather"), "m")).toBe("medium");
    expect(ACTION_CHOICES.map(([id]) => id)).toContain("new-task");
  });
});

describe("bileşen uygulamaları", () => {
  it("kütüphanedeki her bileşenin çizimi var", async () => {
    const { IMPLS } = await import("../src/views/today/tiles/index.jsx");
    for (const m of REGISTRY) expect(typeof IMPLS[m.id], m.id).toBe("function");
  });
});

describe("proje etapları", () => {
  it("aşama ilerlemesi, geçerli aşama ve gecikmeler", async () => {
    const { stageView, periodBars } = await import("../src/views/today/stagesModel.js");
    const now = new Date(2026, 10, 10, 12);
    const detail = {
      phases: [{ id: 2, name: "Hazırlık", position: 1 }, { id: 1, name: "Konsept", position: 0 }, { id: 3, name: "Kapanış", position: 2 }],
      steps: [
        { id: 1, phase_id: 1, status: "done" }, { id: 2, phase_id: 1, status: "skipped" },
        { id: 3, phase_id: 2, status: "doing", due_date: "2026-11-01" }, { id: 4, phase_id: 2, status: "done" }, { id: 5, phase_id: 2, status: "todo", due_date: "2026-11-20" },
        { id: 6, phase_id: null, status: "todo", due_date: "2026-11-02" },
      ],
    };
    const v = stageView(detail, now);
    expect(v.phases.map((p) => p.name)).toEqual(["Konsept", "Hazırlık", "Kapanış"]);
    expect(v.phases[0].progress).toBe(100);
    expect(v.current.name).toBe("Hazırlık");
    expect(v.index).toBe(2);
    expect(v.phases[1]).toMatchObject({ total: 3, done: 1, open: 2, overdue: 1, progress: 33 });
    expect(v.overdue).toBe(2);
    expect(v.next.id).toBe(3);
    expect(v.progress).toBe(40);
    expect(stageView({ phases: [{ id: 1, name: "A" }], steps: [{ id: 1, phase_id: 1, status: "done" }] }).current.name).toBe("A");
    expect(stageView(null)).toMatchObject({ phases: [], current: null, total: 0 });
    const bars = periodBars([{ id: 1, start_date: "2026-11-01", end_date: "2026-11-30" }, { id: 2, start_date: "2025-01-01", end_date: "2025-02-01" }], "2026-11-01", "2026-11-30");
    expect(bars).toHaveLength(1);
    expect(bars[0].left).toBe(0);
    expect(Math.round(bars[0].width)).toBe(100);
  });
});
