import {
  dueLabel, filterLeads, leadStats, stepStats, filterSteps, groupFollowups, groupStepsByPhase, leadColumns, leadDueState, leadsToRows, mapColumns, moveStep, outcomePreview,
  parseDay, parseLeadRows, parsePriority, parseStepRows, progressOf, resolveLink, rolesOf, rowsToBook, sheetToRows, shiftPhase, slugKey, stepsToRows, waLink, telLink, mailLink,
} from "../src/lib/projectUtils";

const today = "2026-11-04";
const now = new Date(2026, 10, 4, 12, 0);
const step = (id, extra = {}) => ({ id, title: `Adım ${id}`, status: "todo", position: 0, phase_id: 1, responsible: [], ...extra });
const SETTINGS = {
  lead_stages: [
    { key: "yeni", label: "Yeni / aranacak" }, { key: "geri_donecek", label: "Geri dönecek" }, { key: "tekrar_aranacak", label: "Tekrar aranacak" },
    { key: "gorusuldu", label: "Görüşüldü" }, { key: "kazanildi", label: "Kazanıldı", won: true }, { key: "kaybedildi", label: "Kaybedildi", lost: true },
  ],
  outcomes: [
    { key: "ulasilamadi", label: "Ulaşılamadı", stage: "tekrar_aranacak", next_days: 1 },
    { key: "geri_donecek", label: "Geri dönecek", stage: "geri_donecek", next_days: 2 },
    { key: "ulasildi", label: "Ulaşıldı, görüşüldü", stage: "gorusuldu" },
    { key: "olumsuz", label: "İlgilenmiyor", stage: "kaybedildi" },
  ],
  roles: [{ name: "MÜDÜR", user_id: 1 }, { name: "PAZARLAMA SORUMLUSU", person: "Can" }],
};

test("ilerleme: gerek yok adımları paydadan düşer, gecikenler sayılır", () => {
  const s = [step(1, { status: "done" }), step(2, { status: "skipped" }), step(3, { due_date: "2026-11-01" }), step(4, { status: "done", due_date: "2026-10-01" })];
  expect(progressOf(s, today)).toEqual({ total: 4, done: 2, skipped: 1, overdue: 1, open: 1, progress: 67 });
  expect(progressOf([], today).progress).toBe(0);
});

test("süreç süzgeci: durum, rol, atanan, arama, tamamlananları gizle", () => {
  const s = [
    step(1, { status: "done", responsible: ["MÜDÜR"] }),
    step(2, { responsible: ["PAZARLAMA SORUMLUSU"], assignee_id: 7, due_date: "2026-11-01" }),
    step(3, { status: "waiting", title: "Sponsor teklifi", result: "Cevap bekleniyor" }),
  ];
  expect(filterSteps(s, { status: "open" }, { today }).map((x) => x.id)).toEqual([2, 3]);
  expect(filterSteps(s, { status: "overdue" }, { today }).map((x) => x.id)).toEqual([2]);
  expect(filterSteps(s, { status: "waiting" }).map((x) => x.id)).toEqual([3]);
  expect(filterSteps(s, { role: "müdür" }).map((x) => x.id)).toEqual([1]);
  expect(filterSteps(s, { assignee: "me" }, { meId: 7 }).map((x) => x.id)).toEqual([2]);
  expect(filterSteps(s, { assignee: "none" }).map((x) => x.id)).toEqual([1, 3]);
  expect(filterSteps(s, { q: "CEVAP" }).map((x) => x.id)).toEqual([3]);
  expect(filterSteps(s, { hideDone: true }).map((x) => x.id)).toEqual([2, 3]);
});

test("aşamalara göre gruplar: sıra, ilerleme, aşamasızlar sonda", () => {
  const phases = [{ id: 2, name: "B", position: 1 }, { id: 1, name: "A", position: 0 }];
  const steps = [step(1, { phase_id: 2, position: 1 }), step(2, { phase_id: 2, position: 0, status: "done" }), step(3, { phase_id: null }), step(4, { phase_id: 1 })];
  const g = groupStepsByPhase(phases, steps, { today });
  expect(g.map((x) => x.key)).toEqual(["1", "2", "none"]);
  expect(g[1].steps.map((x) => x.id)).toEqual([2, 1]);
  expect(g[1].stats.progress).toBe(50);
  // süzgeçte ilerleme tüm adımlardan
  const f = groupStepsByPhase(phases, [steps[0]], { allSteps: steps, today, keepEmpty: false });
  expect(f.map((x) => x.key)).toEqual(["2"]);
  expect(f[0].stats.total).toBe(2);
  expect(groupStepsByPhase([], []).map((x) => x.key)).toEqual(["none"]);
});

test("sürükle-bırak: aşama içinde ve aşamalar arası taşıma, yalnız etkilenen aşamalar gönderilir", () => {
  const steps = [step(1, { phase_id: 1, position: 0 }), step(2, { phase_id: 1, position: 1 }), step(3, { phase_id: 1, position: 2 }), step(4, { phase_id: 2, position: 0 }), step(5, { phase_id: 3, position: 0 })];
  const inside = moveStep(steps, 3, 1, 1);
  expect(inside.payload).toEqual({ steps: [{ id: 3, phase_id: 1 }, { id: 1, phase_id: 1 }, { id: 2, phase_id: 1 }] });
  expect(inside.steps.find((s) => s.id === 3).position).toBe(0);
  const across = moveStep(steps, 2, 2, null);
  expect(across.payload.steps).toEqual([{ id: 4, phase_id: 2 }, { id: 2, phase_id: 2 }, { id: 1, phase_id: 1 }, { id: 3, phase_id: 1 }]);
  expect(across.steps.find((s) => s.id === 3).position).toBe(1);
  expect(moveStep(steps, 1, 1, 2).payload).toBeNull();
  expect(moveStep(steps, 5, "none", null).payload).toEqual({ steps: [{ id: 5, phase_id: null }] });
  expect(shiftPhase([{ id: 1, position: 0 }, { id: 2, position: 1 }], 2, -1)).toEqual([2, 1]);
  expect(shiftPhase([{ id: 1, position: 0 }], 1, -1)).toBeNull();
});

test("roller: ayarlardakiler + adımlarda geçen sorumlular", () => {
  expect(rolesOf(SETTINGS, [step(1, { responsible: ["MÜDÜR", "EDİTÖR"] })])).toEqual(["MÜDÜR", "PAZARLAMA SORUMLUSU", "EDİTÖR"]);
});

test("kişiler: aksiyon zamanı, süzgeç ve kanban sütunları", () => {
  const leads = [
    { id: 1, name: "Mehmet Kaya", stage: "yeni", next_action_at: new Date(2026, 10, 3, 10).toISOString(), owner_id: 7, source: "Telefon", value: 1000 },
    { id: 2, name: "Ayşe Spor", company: "Ayşe Spor Kulübü", stage: "geri_donecek", next_action_at: new Date(2026, 10, 4, 18).toISOString(), owner_id: 8 },
    { id: 3, name: "Kazanan", stage: "kazanildi", value: 5000 },
    { id: 4, name: "Bilinmeyen aşama", stage: "yok" },
  ];
  expect(leadDueState(leads[0], now)).toBe("overdue");
  expect(leadDueState(leads[1], now)).toBe("today");
  expect(leadDueState({ next_action_at: new Date(2026, 10, 5, 9).toISOString() }, now)).toBe("upcoming");
  expect(leadDueState(leads[2], now)).toBeNull();
  expect(filterLeads(leads, { due: "due" }, { now }).map((l) => l.id)).toEqual([1, 2]);
  expect(filterLeads(leads, { due: "today" }, { now }).map((l) => l.id)).toEqual([2]);
  expect(filterLeads(leads, { owner: "me" }, { meId: 7 }).map((l) => l.id)).toEqual([1]);
  expect(filterLeads(leads, { q: "kulüb" }).map((l) => l.id)).toEqual([2]);
  expect(filterLeads(leads, { source: "Telefon" }).map((l) => l.id)).toEqual([1]);
  expect(filterLeads(leads, { due: "none" }, { settings: SETTINGS }).map((l) => l.id)).toEqual([4]);
  const cols = leadColumns(SETTINGS, leads);
  expect(cols[0].items.map((l) => l.id)).toEqual([1, 4]);
  expect(cols.find((c) => c.stage.key === "kazanildi").value).toBe(5000);
});

test("görüşme sonucu → aşama ve sonraki aksiyon ön izlemesi (sunucuyla aynı kurallar)", () => {
  const lead = { id: 1, stage: "yeni", contact_count: 2, next_action: null };
  const a = outcomePreview(lead, SETTINGS, { outcome: "geri_donecek" }, now);
  expect(a.patch.stage).toBe("geri_donecek");
  expect(a.patch.contact_count).toBe(3);
  expect(new Date(a.patch.next_action_at)).toEqual(new Date(2026, 10, 6, 10, 0));
  expect(a.patch.next_action).toBe("Geri dönecek");
  // açık tarih ve metin verilirse onlar kullanılır
  const b = outcomePreview(lead, SETTINGS, { outcome: "ulasilamadi", next_action_at: new Date(2026, 11, 1, 14, 30).toISOString(), next_action: "Öğleden sonra ara" }, now);
  expect(b.patch.stage).toBe("tekrar_aranacak");
  expect(b.patch.next_action).toBe("Öğleden sonra ara");
  // gün tanımsız sonuç tarihi değiştirmez
  expect(outcomePreview(lead, SETTINGS, { outcome: "ulasildi" }, now).patch).not.toHaveProperty("next_action_at");
  // kaybedildi: aksiyon temizlenir
  const c = outcomePreview({ ...lead, next_action_at: "2026-11-10T07:00:00.000Z" }, SETTINGS, { outcome: "olumsuz" }, now);
  expect(c.patch).toMatchObject({ stage: "kaybedildi", next_action_at: null, next_action: null });
  // kazanılmış kişinin aşaması sonuçla geri düşmez
  expect(outcomePreview({ ...lead, stage: "kazanildi" }, SETTINGS, { outcome: "ulasilamadi" }, now).patch.stage).toBeUndefined();
  // not iletişim sayılmaz
  expect(outcomePreview(lead, SETTINGS, { type: "note" }, now).patch).toEqual({});
});

test("takip listesi bölümleri", () => {
  const g = groupFollowups({ leads: [{ next_action_at: new Date(2026, 10, 1).toISOString() }, { next_action_at: new Date(2026, 10, 4, 15).toISOString() }], steps: [{ status: "todo", due_date: "2026-11-01" }, { status: "todo", due_date: "2026-11-06" }], questions: [{ id: 1 }] }, now);
  expect([g.overdueLeads.length, g.todayLeads.length, g.upcomingLeads.length, g.overdueSteps.length, g.steps.length, g.questions.length]).toEqual([1, 1, 0, 1, 1, 1]);
});

test("WhatsApp, telefon ve e-posta bağlantıları", () => {
  expect(waLink("0532 111 22 33")).toBe("https://wa.me/905321112233");
  expect(waLink("+90 (532) 111-22-33")).toBe("https://wa.me/905321112233");
  expect(waLink("5321112233")).toBe("https://wa.me/905321112233");
  expect(waLink("0090 532 111 22 33")).toBe("https://wa.me/905321112233");
  expect(waLink("12")).toBeNull();
  expect(telLink("0532 111 22 33")).toBe("tel:05321112233");
  expect(mailLink(" a@b.com ")).toBe("mailto:a@b.com");
  expect(mailLink("geçersiz")).toBeNull();
});

test("adım bağlantıları: göreli site yolu site adresiyle açılır", () => {
  expect(resolveLink("/editor/maclar", "https://elitlig.com")).toEqual({ href: "https://elitlig.com/editor/maclar", site: true, path: "/editor/maclar" });
  expect(resolveLink("https://maps.google.com").site).toBe(false);
  expect(resolveLink("tel:05321112233").href).toBe("tel:05321112233");
  expect(resolveLink("javascript:alert(1)")).toBeNull();
});

test("aşama/sonuç anahtarı Türkçe karakterden arınır, çakışmaz", () => {
  expect(slugKey("Sözleşme imzalandı")).toBe("sozlesme_imzalandi");
  expect(slugKey("Geri dönecek", ["geri_donecek"])).toBe("geri_donecek_2");
  expect(slugKey("!!!")).toBe("asama");
  expect(slugKey("Çok uzun bir aşama adı burada yazıyor")).toMatch(/^[a-z0-9_]{1,24}$/);
});

test("Excel adım aktarımı: kullanıcının tablosu (Görev / İş Kalemi, Ana Sorumlu Personel, Aşama)", () => {
  const rows = [
    ["ORGANİZASYON İŞ AKIŞI"],
    ["No", "Aşama", "Görev / İş Kalemi", "Ana Sorumlu Personel", "Son tarih", "Öncelik"],
    ["1", "1. Konsept ve Bütçe", "Organizasyon konseptinin belirlenmesi", "MÜDÜR", "15.11.2026", "Yüksek"],
    ["2", "", "Tahmini gider bütçesinin hazırlanması", "MÜDÜR & PAZARLAMA SORUMLUSU", "46000", ""],
    ["", "", "", "", "", ""],
    ["3", "Satış ve Müşteri İlişkileri", "Potansiyel müşterilerin aranması", "PAZARLAMA SORUMLUSU", "", "acil"],
    ["4", "", "", "MÜDÜR", "", ""],
  ];
  const { items, phases, skipped, map } = parseStepRows(rows);
  expect(map).toMatchObject({ phase: 1, title: 2, responsible: 3, due_date: 4, priority: 5 });
  expect(phases).toEqual(["Konsept ve Bütçe", "Satış ve Müşteri İlişkileri"]);
  expect(items).toEqual([
    { title: "Organizasyon konseptinin belirlenmesi", responsible: "MÜDÜR", phase: "Konsept ve Bütçe", due_date: "2026-11-15", priority: "high" },
    { title: "Tahmini gider bütçesinin hazırlanması", responsible: "MÜDÜR & PAZARLAMA SORUMLUSU", phase: "Konsept ve Bütçe", due_date: "2025-12-09" },
    { title: "Potansiyel müşterilerin aranması", responsible: "PAZARLAMA SORUMLUSU", phase: "Satış ve Müşteri İlişkileri", priority: "urgent" },
  ]);
  expect(skipped).toBe(1);
});

test("Excel adım aktarımı: aşama sütunu yoksa BÜYÜK HARF başlık satırları aşama olur", () => {
  const rows = [
    ["Görev / İş Kalemi", "Ana Sorumlu Personel"],
    ["KONSEPT VE BÜTÇE", ""],
    ["Hedef kitlenin belirlenmesi", "MÜDÜR"],
    ["TARİH VE TESİS", ""],
    ["Tesis araştırması", "SAHA SORUMLUSU"],
    ["Bütçe onayı", ""],
  ];
  const { items, phases } = parseStepRows(rows);
  expect(phases).toEqual(["Konsept Ve Bütçe", "Tarih Ve Tesis"]);
  expect(items.map((i) => [i.title, i.phase, i.responsible])).toEqual([
    ["Hedef kitlenin belirlenmesi", "Konsept Ve Bütçe", "MÜDÜR"],
    ["Tesis araştırması", "Tarih Ve Tesis", "SAHA SORUMLUSU"],
    ["Bütçe onayı", "Tarih Ve Tesis", undefined],
  ]);
  expect(parseStepRows([["Ad", "Soyad"], ["a", "b"]]).error).toMatch(/Görev/);
});

test("sütun eşleme, tarih ve öncelik ayrıştırma", () => {
  expect(mapColumns([["Görev", "Sorumlu", "Açıklama"]]).map).toEqual({ title: 0, responsible: 1, description: 2 });
  expect(parseDay("2026-12-31T00:00:00")).toBe("2026-12-31");
  expect(parseDay("1/2/27")).toBe("2027-02-01");
  expect(parseDay("yarın")).toBeNull();
  expect(parsePriority("Düşük")).toBe("low");
  expect(parsePriority("?")).toBeNull();
});

test("Excel kişi aktarımı: ad yoksa firma, aşama etiketle eşlenir", () => {
  const rows = [["Ad Soyad", "Firma", "Cep Telefonu", "E-posta", "Durum", "Tutar"], ["Mehmet Kaya", "Kaya Spor", "0532 111 22 33", "m@k.com", "Geri dönecek", "15.000"], ["", "Yıldız FK", "", "", "", ""], ["", "", "", "", "", ""]];
  const { items, skipped } = parseLeadRows(rows, SETTINGS);
  expect(items).toEqual([
    { name: "Mehmet Kaya", company: "Kaya Spor", phone: "0532 111 22 33", email: "m@k.com", value: "15.000", stage: "geri_donecek" },
    { name: "Yıldız FK", company: "Yıldız FK" },
  ]);
  expect(skipped).toBe(0);
});

test("çalışma kitabı sayfası → satırlar", () => {
  const rows = sheetToRows({ cells: { A1: { v: "Görev" }, C1: { v: "Sorumlu" }, A3: { v: "'=x" }, AA2: { v: "z" } } });
  expect(rows.length).toBe(3);
  expect(rows[0]).toEqual(["Görev", "", "Sorumlu"]);
  expect(rows[1][26]).toBe("z");
  expect(rows[2][0]).toBe("=x");
});

test("dışa aktarma: adımlar yeniden içe aktarılabilir başlıklarla, kişiler aşama adlarıyla", () => {
  const rows = stepsToRows({
    phases: [{ id: 1, name: "Satış", position: 0 }], steps: [step(1, { responsible: ["MÜDÜR", "EDİTÖR"], status: "done", checklist: [{ done: true }, { done: false }], assignee_id: 3 })],
    people: { 3: { name: "Deniz" } }, meta: { step_statuses: [{ key: "done", label: "Tamamlandı" }], priorities: [], tools: [] },
  });
  expect(rows[1].slice(0, 5)).toEqual(["Satış", "Adım 1", "MÜDÜR & EDİTÖR", "Deniz", "Tamamlandı"]);
  expect(rows[1][10]).toBe("1/2");
  expect(parseStepRows(rows).items[0]).toMatchObject({ title: "Adım 1", phase: "Satış", responsible: "MÜDÜR & EDİTÖR" });
  const lr = leadsToRows({ leads: [{ name: "A", stage: "geri_donecek", value: 100, contact_count: 2 }], settings: SETTINGS });
  expect(lr[1][7]).toBe("Geri dönecek");
  const book = rowsToBook([["Başlık"], ["=SUM(1)"]], "Adımlar");
  expect(book.sheets[0].cells.A2.v).toBe("'=SUM(1)");
  expect(book.sheets[0].cells.A1.s.b).toBe(true);
});

test("son tarih metni", () => {
  expect(dueLabel("2026-11-04", now)).toBe("Bugün");
  expect(dueLabel("2026-11-05", now)).toBe("Yarın");
  expect(dueLabel("2026-11-01", now)).toBe("3 gün gecikti");
});

test("kişi ve adım istatistikleri", () => {
  const ls = leadStats([{ stage: "yeni", value: 100, next_action_at: new Date(2026, 10, 4, 9).toISOString() }, { stage: "kazanildi", value: 500 }, { stage: "kaybedildi", value: 50 }], SETTINGS, now);
  expect(ls).toMatchObject({ total: 3, won: 1, lost: 1, open: 1, due: 1, won_value: 500, pipeline_value: 100 });
  expect(ls.by_stage.yeni).toBe(1);
  const ss = stepStats([step(1, { status: "done" }), step(2, { status: "doing" })], [{ key: "done" }, { key: "doing" }, { key: "todo" }], today);
  expect(ss).toMatchObject({ progress: 50, by_status: { done: 1, doing: 1, todo: 0 } });
});
