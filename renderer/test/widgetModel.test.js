// Masaüstü widget'ları (renderer/src/widgets/widgetModel.js) ve hızlı geçiş eşleştirmesi (launcher/launcherModel.js).
import { activeProjects, chatUnread, durationLabel, filterTodos, launcherTools, monthGrid, projectDigest, quickRecord, recentChats, studioLabel, todoCounts, upcomingPayments, weekColumns } from "../src/widgets/widgetModel";
import { rankTools, toolScore } from "../src/launcher/launcherModel";
import { loadSearchSources, searchSources } from "../src/lib/paletteSearch";

const NOW = new Date(2026, 10, 10, 12, 0); // 10 Kasım 2026 Salı 12:00
const at = (d, h = 12) => new Date(2026, 10, d, h, 0).toISOString();

describe("yapılacaklar süzgeci", () => {
  const items = [
    { id: 1, title: "geciken", status: "open", dueAt: at(8) },
    { id: 2, title: "bugün", status: "open", dueAt: at(10, 18), project: { id: 7, name: "Kış" } },
    { id: 3, title: "yarın", status: "open", dueAt: at(11) },
    { id: 4, title: "tarihsiz", status: "open", dueAt: null, project: { id: 7 } },
    { id: 5, title: "bitti", status: "done", dueAt: at(10) },
  ];
  it("bugün = geciken + bugün; geciken; yaklaşan; tümü", () => {
    expect(filterTodos(items, { filter: "today" }, NOW).map((t) => t.id)).toEqual([1, 2]);
    expect(filterTodos(items, { filter: "today" }, NOW)[0].late).toBe(true);
    expect(filterTodos(items, { filter: "overdue" }, NOW).map((t) => t.id)).toEqual([1]);
    expect(filterTodos(items, { filter: "upcoming" }, NOW).map((t) => t.id)).toEqual([3]);
    expect(filterTodos(items, { filter: "all" }, NOW).map((t) => t.id)).toEqual([1, 2, 3, 4]);
  });
  it("proje süzgeci ve sayılar", () => {
    expect(filterTodos(items, { filter: "all", project: 7 }, NOW).map((t) => t.id)).toEqual([2, 4]);
    expect(todoCounts(items, null, NOW)).toEqual({ today: 2, overdue: 1, upcoming: 1, all: 4 });
    expect(todoCounts(items, 7, NOW).all).toBe(2);
  });
});

describe("projeler", () => {
  const detail = {
    phases: [{ id: 2, name: "İletişim", position: 1 }, { id: 1, name: "Hazırlık", position: 0, color: "#7c3aed" }],
    steps: [
      { id: 10, phase_id: 1, title: "a", status: "done" },
      { id: 11, phase_id: 1, title: "Aday listesi", status: "doing", due_date: "2026-11-12" },
      { id: 12, phase_id: 2, title: "Arama", status: "todo", due_date: "2026-11-09" },
      { id: 13, phase_id: 2, title: "Gerek yok", status: "skipped", due_date: "2026-11-01" },
    ],
  };
  it("evre = ilk bitmemiş adımı olan aşama; yaklaşan adımlar tarih sırasıyla, gecikmiş işaretli", () => {
    const d = projectDigest(detail, NOW);
    expect(d.phase).toMatchObject({ id: 1, name: "Hazırlık", index: 1, total: 2, done: 1, steps: 2 });
    expect(d.upcoming.map((u) => [u.id, u.overdue])).toEqual([[12, true], [11, false]]);
    expect(d.doing).toEqual({ id: 11, title: "Aday listesi" });
    expect(d.overdue).toBe(1);
  });
  it("hepsi bitti → son aşama; boş ayrıntı", () => {
    const done = { phases: detail.phases, steps: detail.steps.map((s) => ({ ...s, status: "done" })) };
    expect(projectDigest(done, NOW).phase.id).toBe(2);
    expect(projectDigest(null, NOW)).toMatchObject({ phase: null, upcoming: [], overdue: 0 });
  });
  it("aktif projeler: arşiv / tamamlanan / iptal çıkar, en yakın son tarih önde, beklemede sonda", () => {
    const list = activeProjects([
      { id: 1, status: "active", stats: { next_due: { due_date: "2026-11-20" } } },
      { id: 2, status: "done" }, { id: 3, status: "active", archived: true },
      { id: 4, status: "planning", stats: { next_due: { due_date: "2026-11-12" } } },
      { id: 5, status: "on_hold", stats: { next_due: { due_date: "2026-11-11" } } }, { id: 6, status: "cancelled" },
    ]);
    expect(list.map((p) => p.id)).toEqual([4, 1, 5]);
  });
});

describe("muhasebe: yaklaşan düzenli ödemeler", () => {
  const rec = {
    overdue: [{ key: "3:2026-11-01", name: "Elektrik", amount: 900, status: "late", late: true, due_date: "2026-11-01", type: "expense" }],
    occurrences: [
      { key: "3:2026-11-01", name: "Elektrik", amount: 900, status: "late", late: true, due_date: "2026-11-01" },
      { key: "2:2026-11-01", name: "Kira", amount: 12000, status: "untracked", due_date: "2026-11-01" },
      { key: "1:2026-11-21", name: "İnternet", amount: 650, status: "upcoming", due_date: "2026-11-21" },
      { key: "4:2026-11-15", name: "Maaş", amount: 5000, status: "paid", due_date: "2026-11-15" },
      { key: "5:2027-01-01", name: "Uzak", amount: 1, status: "upcoming", due_date: "2027-01-01" },
    ],
  };
  it("ödenen / atlanan / izlenmeyen ve aralık dışı çıkar; yinelenen bir kez; geciken önde", () => {
    const p = upcomingPayments(rec, { days: 30 }, NOW);
    expect(p.map((x) => [x.name, x.late])).toEqual([["Elektrik", true], ["İnternet", false]]);
    expect(upcomingPayments(rec, { days: 3 }, NOW).map((x) => x.name)).toEqual(["Elektrik"]);
    expect(upcomingPayments(null)).toEqual([]);
  });
});

describe("mesajlar", () => {
  const personal = [
    { id: 1, title: "Elif", unread: 0, last_message: { created_at: "2026-11-10T09:00:00Z" } },
    { id: 2, title: "Mehmet", unread: 2, last_message: { created_at: "2026-11-10T08:00:00Z" } },
    { id: 9, title: "Boş", unread: 0, last_message: null },
  ];
  const inbox = [{ id: 3, title: "Can", unread: 1, _inbox: true, last_message: { created_at: "2026-11-10T10:00:00Z" } }, { id: 1, title: "aynı", _inbox: true, last_message: { created_at: "2026-11-10T11:00:00Z" } }];
  it("birleşik liste: okunmamış önde, sonra en yeni; mesajsız sohbet çıkar; aynı kimlik kişisel kalır", () => {
    expect(recentChats(personal, inbox, "all").map((c) => c.id)).toEqual([3, 2, 1]);
    expect(recentChats(personal, inbox, "personal").map((c) => c.id)).toEqual([2, 1]);
    expect(recentChats(personal, inbox, "inbox").map((c) => c.id)).toEqual([3, 1]);
  });
  it("okunmamış toplamı kaynağa göre", () => {
    expect(chatUnread(personal, inbox, "all")).toBe(3);
    expect(chatUnread(personal, inbox, "personal")).toBe(2);
    expect(chatUnread(personal, inbox, "inbox")).toBe(1);
  });
});

describe("takvim", () => {
  it("ay ızgarası Pazartesi başlar, 42 gün, bugün ve etkinlik sayısı", () => {
    const g = monthGrid(2026, 10, [{ occurrence_start: at(10, 15) }, { start_at: at(10, 9) }, { occurrence_start: at(12) }], NOW);
    expect(g).toHaveLength(42);
    expect(g[0].day).toBe("2026-10-26"); // 1 Kasım 2026 Pazar → ızgara 26 Ekim Pazartesi
    expect(g.find((d) => d.today).day).toBe("2026-11-10");
    expect(g.find((d) => d.day === "2026-11-10").count).toBe(2);
    expect(g.find((d) => d.day === "2026-11-12").count).toBe(1);
    expect(g.filter((d) => d.inMonth)).toHaveLength(30);
  });
  it("hafta sütunları: Pzt–Paz, gün boyu önce, sonra saate göre; önceki / sonraki hafta", () => {
    const ev = [{ id: 1, occurrence_start: at(10, 15) }, { id: 2, all_day: true, occurrence_start: at(10, 0) }, { id: 3, occurrence_start: at(10, 9) }, { id: 4, occurrence_start: at(16, 9) }];
    const w = weekColumns(ev, NOW);
    expect(w.map((c) => c.day)).toEqual(["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15"]);
    expect(w[1].today).toBe(true);
    expect(w[1].items.map((e) => e.id)).toEqual([2, 3, 1]);
    expect(weekColumns(ev, NOW, 1)[0].items.map((e) => e.id)).toEqual([4]);
  });
});

describe("hızlı kayıt", () => {
  it("gider: tutar başta ya da sonda; tutarsız hata", () => {
    expect(quickRecord("expense", "1.250 hakem ücreti", NOW).body).toMatchObject({ type: "expense", amount: 1250, description: "hakem ücreti", entry_date: "2026-11-10", status: "paid" });
    expect(quickRecord("expense", "kırtasiye 250 tl", NOW).body).toMatchObject({ amount: 250, description: "kırtasiye" });
    expect(quickRecord("expense", "kırtasiye", NOW).error).toBeTruthy();
    expect(quickRecord("expense", "", NOW).error).toBeTruthy();
  });
  it("görev: doğal dil tarihi, not: ilk satır başlık", () => {
    const t = quickRecord("task", "yarın 14:00 sahayı ara !", NOW);
    expect(t.path).toBe("/api/todos");
    expect(t.body.title).toBe("sahayı ara");
    expect(t.body.priority).toBe("high");
    expect(new Date(t.body.due_at).getDate()).toBe(11);
    expect(quickRecord("note", "Başlık\ngövde", NOW)).toMatchObject({ path: "/api/tools/notes", body: { title: "Başlık", body: "gövde" } });
  });
});

describe("başlatıcı ve stüdyo", () => {
  const visible = [{ key: "projects" }, { key: "todos" }, { key: "messages" }];
  it("seçilen araçlar görünürlerle kesişir; seçim yoksa varsayılan", () => {
    expect(launcherTools(visible, ["todos", "admin", "projects"]).map((t) => t.key)).toEqual(["todos", "projects"]);
    expect(launcherTools(visible, null).map((t) => t.key)).toEqual(["projects", "todos", "messages"]);
  });
  it("stüdyo etiketi ve süre", () => {
    expect(studioLabel({ available: false }).text).toBe("Stüdyo kapalı");
    expect(studioLabel({ available: true, active: false }).text).toBe("Yayında değil");
    expect(studioLabel({ available: true, active: true, state: "live", recordOnly: false })).toEqual({ text: "YAYINDA", tone: "red" });
    expect(studioLabel({ available: true, active: true, state: "live", recordOnly: true }).text).toBe("Kayıt alınıyor");
    expect(durationLabel(65000)).toBe("1:05");
    expect(durationLabel(3723000)).toBe("1:02:03");
  });
});

describe("hızlı geçiş: araç eşleştirme", () => {
  const tools = [
    { key: "projects", label: "Projeler", keywords: "proje süreç" },
    { key: "ledger", label: "Muhasebe", keywords: "gelir gider ödeme" },
    { key: "studio", label: "Yayın Stüdyosu", keywords: "canlı yayın" },
    { key: "todos", label: "Yapılacaklar", keywords: "görev iş" },
  ];
  it("ad başı > kelime başı > anahtar sözcük > baş harfler; Türkçe harf duyarsız", () => {
    expect(rankTools(tools, "pro").map((t) => t.key)).toEqual(["projects"]);
    expect(rankTools(tools, "gider").map((t) => t.key)).toEqual(["ledger"]);
    expect(rankTools(tools, "stud").map((t) => t.key)).toEqual(["studio"]);
    expect(rankTools(tools, "ys").map((t) => t.key)).toEqual(["studio"]);
    expect(rankTools(tools, "YAPILACAK").map((t) => t.key)).toEqual(["todos"]);
    expect(rankTools(tools, "").length).toBe(4);
    expect(toolScore(tools[0], "zzz")).toBe(0);
  });
  it("içerik araması paletle aynı kaynaklar (paylaşılan modül)", async () => {
    const data = {
      "/api/todos": { items: [{ id: 5, title: "Saha kirası", status: "open" }] },
      "/api/tools/notes": { items: [{ id: 2, title: "Sponsor fikirleri", body: "" }], notebooks: [] },
      "/api/tools/contacts": { items: [{ id: 3, name: "Zeynep Sponsor", phone: "0533" }] },
      "/api/tools/projects": { items: [{ id: 1, name: "Sponsorluk Kampanyası", stats: { steps: { progress: 25 } } }] },
      "/api/chat/conversations": { conversations: [] },
    };
    const get = async (path) => (data[path] ? { ok: true, data: data[path] } : { ok: false });
    const s = await loadSearchSources(get);
    const r = searchSources(s, "sponsor");
    expect(r.map((x) => x.route)).toEqual(["notes:2", "contacts:3", "projects"]);
    expect(r[2].arg).toEqual({ id: 1 });
    expect(searchSources(s, "s")).toEqual([]);
    expect(searchSources(s, "saha")[0]).toMatchObject({ route: "todos:5", icon: "checkSquare" });
  });
});
