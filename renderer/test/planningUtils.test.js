import {
  boardTotals, buildWeekGrid, canSelectCell, cardInVenues, cardIndexOf, cardKpis, cellIndex, cellKey, contactOf, dateLabel, dayBulkSets, dayLabel, dayStats, dueInfo,
  feePreview, feeTotals, filterCards, filterMatches, groupMatchesByWeek, groupOptions, heatText, isPastWithDetail, matchChecklist, mostMatches, nextStep, normalizePhone,
  opponentSuggestions, optionKey, scopeOptions, scopeParams, slotState, slotSummary, sortTeamRows, suggestionToTask, summarizeOptions, summarizeSelection, teamListRows,
  timeAgo, timeLabel, weekRangeLabel, weekStartOf, whatsappHref, deskViewForStep,
} from "../src/lib/planningUtils";

const board = {
  venue: {
    public_id: "v1",
    grid: {
      days: [
        { date: "2026-11-09", day: 1, label: "Pazartesi", date_label: "09.11", is_past: false, is_bookable: true },
        { date: "2026-11-10", day: 2, label: "Salı", date_label: "10.11", is_past: false, is_bookable: true },
      ],
      times: [{ hour: 20, minute: 0, label: "20:00" }, { hour: 21, minute: 30, label: "21:30" }],
    },
  },
  cells: [
    { date: "2026-11-09", day: 1, hour: 20, minute: 0, status: "booked", home: { team_id: 1, team_name: "A" }, away: { team_id: 2, team_name: "B" }, is_bookable: true },
    { date: "2026-11-10", day: 2, hour: 21, minute: 30, status: "open", pool: [{ team_id: 3, team_name: "C" }], pool_count: 1, is_bookable: true },
    { date: "2026-11-10", day: 2, hour: 20, minute: 0, status: "closed", note: "turnuva", is_bookable: true },
  ],
};

describe("saat anahtarları ve tarih", () => {
  it("hücre ve seçenek anahtarı dakikayı sayıya çevirir", () => {
    expect(cellKey("2026-11-09", "20", undefined)).toBe("2026-11-09-20-0");
    expect(cellKey("2026-11-09", 21, 30)).toBe("2026-11-09-21-30");
    expect(optionKey({ venueId: "v1", date: "2026-11-09", hour: "20" })).toBe("v1|2026-11-09|20|0");
    expect(cellIndex(board.cells).get("2026-11-10-21-30").pool_count).toBe(1);
  });
  it("hafta başı, etiketler", () => {
    expect(weekStartOf("2026-11-04")).toBe("2026-11-02");
    expect(weekStartOf("2026-11-08")).toBe("2026-11-02");
    expect(weekStartOf("2026-11-09")).toBe("2026-11-09");
    expect(weekStartOf("x")).toBe("");
    expect(dateLabel("2026-08-18")).toBe("18.08");
    expect(dayLabel("2026-11-10")).toBe("Salı 10.11");
    expect(timeLabel(9, 5)).toBe("09:05");
    expect(weekRangeLabel("2026-11-02")).toBe("2 – 8 Kas");
    expect(weekRangeLabel("2026-10-26")).toBe("26 Eki – 1 Kas");
  });
});

describe("hafta tablosu", () => {
  it("gün × saat ızgarası boş hücreleri doldurur", () => {
    const g = buildWeekGrid(board);
    expect(g.rows).toHaveLength(2);
    expect(g.rows[0].cells.map((c) => c.status)).toEqual(["booked", "closed"]);
    expect(g.rows[1].cells[0]).toMatchObject({ date: "2026-11-09", hour: 21, minute: 30, status: "open", pool_count: 0 });
    expect(g.rows[1].cells[1].pool_count).toBe(1);
    expect(buildWeekGrid(null).rows).toEqual([]);
  });
  it("hücre durumu ve özet", () => {
    const g = buildWeekGrid(board);
    expect(g.rows.flatMap((r) => r.cells).map(slotState)).toEqual(["booked", "closed", "open", "pooled"]);
    expect(slotState({ status: "open", external_match: { id: 1 } })).toBe("external");
    expect(slotState({ status: "booked", pool_stranded: true })).toBe("stranded");
    expect(slotState({ is_past: true, fixture: { id: 3 } })).toBe("played");
    expect(slotState({ is_past: true })).toBe("past");
    expect(slotState({ status: "awaiting", home: { team_name: "A" } })).toBe("awaiting");
    expect(slotState({ status: "open", available: [{ team_id: 4 }] })).toBe("suggested");
    expect(slotSummary(board.cells[0])).toBe("A – B");
    expect(slotSummary(board.cells[2])).toBe("Dolu · turnuva");
    expect(slotSummary({ is_past: true, fixture: { home_name: "A", away_name: "B", home_score: 2, away_score: 1, status: "tamamlandi" } })).toBe("A 2-1 B");
    expect(heatText(board.cells[1])).toBe("1 aday");
    expect(isPastWithDetail({ is_past: true, home: { team_id: 1 } })).toBe(true);
    expect(isPastWithDetail({ is_past: true })).toBe(false);
  });
  it("gün özeti, toplu işlem listeleri ve tablo sayaçları", () => {
    const g = buildWeekGrid(board);
    const tue = dayStats(g, g.days[1]);
    expect(tue).toMatchObject({ closed: 1, pooled: 1, total: 2 });
    const sets = dayBulkSets(g.times.map((t) => g.cellAt(g.days[1], t)));
    expect(sets.free.map((c) => c.hour)).toEqual([21]);
    expect(sets.closed).toHaveLength(1);
    expect(canSelectCell(board.cells[0])).toBe(false);
    expect(boardTotals(board)).toMatchObject({ pool: 1, booked: 1, closed: 1, open: 1 });
  });
});

describe("iletişim", () => {
  it("telefonu ülke koduna çevirir", () => {
    expect(normalizePhone("0532 111 22 33")).toBe("905321112233");
    expect(normalizePhone("5321112233")).toBe("905321112233");
    expect(whatsappHref("+90 532 111 22 33")).toBe("https://wa.me/905321112233");
    const c = contactOf({ 5: { manager: { name: "Ali", phone: "05321112233" }, admin_contact: { phone2: "05000000000" } } }, "5");
    expect(c).toMatchObject({ name: "Ali", tel: "tel:+905321112233", tel2: "tel:+905000000000", hasAny: true, missingManager: false });
    expect(contactOf({}, 9)).toMatchObject({ hasAny: false, missingManager: true });
  });
});

describe("kartlar", () => {
  const now = new Date("2026-11-04T12:00:00");
  const cards = [
    { task_id: "a", kind: "match_request", stage: "open", status: "open", title: "Kartallar maç talebi", team_id: 11, team_name: "Kartallar", created_at: "2026-11-03T10:00:00Z", request_date: "2026-11-10", venue_id: null,
      options: [{ venue_id: 3, venue_public_id: "v3", venue_name: "Yıldız", date: "2026-11-10", day: 2, hour: 21, minute: 0, status: "waiting", entry_id: "e1" }, { venue_id: 3, venue_public_id: "v3", venue_name: "Yıldız", date: "2026-11-09", day: 1, hour: 23, minute: 0, status: "waiting" }, { venue_id: 3, venue_public_id: "v3", venue_name: "Yıldız", date: "2026-11-11", day: 3, hour: 0, minute: 30, status: "waiting" }] },
    { task_id: "b", kind: "contact", stage: "waiting_them", status: "open", title: "Şimşekler ara", team_id: 12, team_name: "Şimşekler", created_at: "2026-11-01T10:00:00Z", due_at: "2026-11-03T10:00:00Z", venue_id: 4, options: [] },
    { task_id: "c", kind: "personal", stage: "resolved", status: "done", title: "Fatura", created_at: "2026-10-01T10:00:00Z", options: [] },
    { task_id: "d", kind: "match_request", stage: "open", status: "open", title: "Atletik", team_id: 14, team_name: "Atletik", request_ids: [7], options: [{ venue_public_id: "v3", date: "2026-11-10", hour: 21, minute: 0, status: "waiting" }] },
  ];
  it("seçenek özeti gece yarısını sona koyar ve gruplar", () => {
    expect(summarizeOptions(cards[0].options)).toBe("3 seçenek · Yıldız · Pzt, Sal, Çar · 21:00–00:30");
    const groups = groupOptions(cards[0].options);
    expect(groups.map((g) => g.date)).toEqual(["2026-11-09", "2026-11-10", "2026-11-11"]);
    expect(groups[0].venues[0][0]).toBe("Yıldız");
    const sel = summarizeSelection([{ venueId: "v3", date: "2026-11-10", hour: 22 }, { venueId: "v3", date: "2026-11-10", hour: 20 }], [{ public_id: "v3", name: "Yıldız" }]);
    expect(sel[0].name).toBe("Yıldız");
    expect(sel[0].days[0].items.map((o) => o.hour)).toEqual([20, 22]);
  });
  it("süzgeç, sıra, özet kutucukları, saha kapsamı", () => {
    expect(filterCards(cards, { kind: "match_request" }).map((c) => c.task_id)).toEqual(["a", "d"]);
    expect(filterCards(cards, { q: "şimşek" }).map((c) => c.task_id)).toEqual(["b"]);
    expect(filterCards(cards, { order: "asc" }).map((c) => c.task_id)).toEqual(["c", "b", "a", "d"]);
    expect(filterCards(cards, { basis: "request", from: "2026-11-10", to: "2026-11-10" }).map((c) => c.task_id)).toEqual(["a"]);
    expect(filterCards(cards, { focus: "waiting_them" })).toHaveLength(1);
    expect(cardKpis(cards)).toMatchObject({ match_request: 2, contact: 0, waiting_them: 1 });
    expect(cardInVenues(cards[0], [3])).toBe(true);
    expect(cardInVenues(cards[1], [3])).toBe(false);
    expect(cardInVenues(cards[1], null)).toBe(true);
    const cardOf = cardIndexOf(cards);
    expect(cardOf({ entry_id: "e1" }).task_id).toBe("a");
    expect(cardOf({ request_id: 7 }).task_id).toBe("d");
    expect(cardOf({ entry_id: "zz" })).toBe(null);
  });
  it("sonraki adım, vade, rakip önerisi, öneri → kart", () => {
    expect(nextStep(cards[0])).toEqual({ stage: "waiting_them" });
    expect(nextStep(cards[1])).toEqual({ focus: "result" });
    expect(nextStep({ kind: "personal", stage: "waiting_us" })).toEqual({ stage: "resolved" });
    expect(nextStep(cards[2])).toEqual({ stage: "open" });
    expect(dueInfo("2026-11-03T10:00:00", now)).toMatchObject({ label: "Dün 10:00", late: true, group: "overdue" });
    expect(dueInfo("2026-11-05T11:00:00", now)).toMatchObject({ label: "Yarın 11:00", group: "tomorrow" });
    expect(timeAgo("2026-11-04T11:50:00", now)).toBe("10 dk önce");
    const opp = opponentSuggestions(cards, { venueId: "v3", date: "2026-11-10", hour: 21, minute: 0 }, { homeId: 11, excludeTaskId: "a" });
    expect(opp).toEqual([{ team_id: 14, team_name: "Atletik", exact: true }]);
    expect(suggestionToTask({ id: "s1", type: "awaiting", title: "Rakip", holder: { team_id: 5 }, venue_public_id: "v1", venue_name: "Yıldız", label: "Pzt 20:00", date: "2026-11-09", hour: 20 }))
      .toMatchObject({ kind: "match_request", teamId: 5, priority: "high", options: [{ venueId: "v1", date: "2026-11-09", hour: 20, minute: 0 }] });
    expect(suggestionToTask({ id: "s2", type: "idle_team", title: "Uzun", team_id: 6 }).kind).toBe("contact");
    expect(suggestionToTask({ id: "s3", type: "stranded", title: "Taşı" }).kind).toBe("personal");
  });
});

describe("takım listeleri", () => {
  const all = [
    { team_id: 1, team_name: "Zeytin", played: 4, created_at: "2026-10-01", last_contact_at: "2026-11-01T10:00:00Z" },
    { team_id: 2, team_name: "Ayva", played: 9, created_at: "2026-11-01" },
    { team_id: 3, team_name: "Çınar", played: 0 },
    { team_id: 4, team_name: "Pasif", played: 20, inactive: true },
  ];
  it("çok maç alanlar ve sıralama", () => {
    expect(mostMatches(all).map((r) => r.team_id)).toEqual([2, 1]);
    expect(mostMatches(all)[0].metric).toBe("Son 6 ayda 9 maç");
    expect(teamListRows({ all, by_day: { 3: [all[0]] } }, "by_day", 3)).toHaveLength(1);
    expect(teamListRows({ all }, "most_matches", 1)).toHaveLength(2);
    expect(teamListRows({}, "new_teams", 1)).toEqual([]);
    expect(sortTeamRows(all, "name").map((r) => r.team_name)).toEqual(["Ayva", "Çınar", "Pasif", "Zeytin"]);
    expect(sortTeamRows(all, "stale")[3].team_id).toBe(1);
    expect(sortTeamRows(all, "played")[0].team_id).toBe(4);
  });
  it("lig / sezon kapsamı", () => {
    const opts = scopeOptions([{ id: 3, name: "Süper Lig" }], [{ id: 31, name: "2026 Güz", league_id: 3 }, { id: 41, name: "Bahar", league_id: 9, league_name: "İzmir" }]);
    expect(opts.map((o) => o.value)).toEqual(["", "l:3", "s:31", "s:41"]);
    expect(opts[3].label).toBe("İzmir · Bahar");
    expect(scopeParams("l:3")).toEqual({ leagueId: "3" });
    expect(scopeParams("s:31")).toEqual({ seasonId: "31" });
    expect(scopeParams("")).toEqual({});
  });
});

describe("proje maçları", () => {
  const items = [
    { id: 1, date: "2026-11-05", time: "20:00", home: "A", away: "B", field: "Yıldız", stage: "planlandi", fees_at: null },
    { id: 2, date: "2026-11-03", time: "21:00", home: "C", away: "D", field: "Merkez", stage: "oynandi", fees_at: "2026-11-03T22:00:00Z" },
    { id: 3, date: "2026-11-12", time: "19:00", home: "E", away: "F", field: "Yıldız", stage: "teyit_edildi" },
    { id: 4, date: "2026-11-05", time: "19:00", home: "G", away: "H", field: "yıldız", stage: "ertelendi" },
    { id: 5, date: "2026-10-28", time: "20:00", home: "I", away: "J", field: "Merkez", stage: "oynandi" },
  ];
  it("haftalara ve günlere gruplar", () => {
    const g = groupMatchesByWeek(items, "2026-11-04");
    expect(g.map((w) => w.key)).toEqual(["2026-10-26", "2026-11-02", "2026-11-09"]);
    expect(g[0]).toMatchObject({ past: true, label: "Geçen hafta · 26 Eki – 1 Kas", count: 1 });
    expect(g[1]).toMatchObject({ current: true, label: "Bu hafta · 2 – 8 Kas", count: 3 });
    expect(g[1].days.map((d) => d.date)).toEqual(["2026-11-03", "2026-11-05"]);
    expect(g[1].days[1].items.map((m) => m.id)).toEqual([4, 1]);
    expect(g[2].label).toBe("Gelecek hafta · 9 – 15 Kas");
    expect(groupMatchesByWeek([{ id: 9, date: null }], "2026-11-04")[0].label).toBe("Tarihsiz");
  });
  it("süzgeç ve kontrol listesi", () => {
    expect(filterMatches(items, { venue: "Yıldız" }, "2026-11-04").map((m) => m.id)).toEqual([1, 3, 4]);
    expect(filterMatches(items, { when: "past" }, "2026-11-04").map((m) => m.id)).toEqual([2, 5]);
    expect(filterMatches(items, { fees: "missing" }, "2026-11-04").map((m) => m.id)).toEqual([1, 3, 5]);
    expect(filterMatches(items, { stage: "oynandi", q: "c" }, "2026-11-04").map((m) => m.id)).toEqual([2]);
    expect(filterMatches(items, { stage: "unconfirmed", when: "upcoming" }, "2026-11-04").map((m) => m.id)).toEqual([1]);
    expect(matchChecklist({ checklist: null }, { checklist: ["Saha"] })).toEqual([{ text: "Saha", done: false }]);
    expect(matchChecklist({ checklist: [{ text: "X", done: true }] }, { checklist: ["Saha"] })).toEqual([{ text: "X", done: true }]);
  });
  it("ücret önizlemesi: maç / ev / deplasman / iki takım", () => {
    const m = { home: "Kartallar", away: "Şimşekler", date: "2026-11-20", field: "Yıldız Halı Saha" };
    const lines = feePreview(m, [
      { key: "t", label: "Takım ücreti", type: "income", amount: 1500, per: "team" },
      { key: "e", label: "Ev ücreti", type: "income", amount: 200, per: "home" },
      { key: "d", label: "Dep ücreti", type: "income", amount: 300, per: "away" },
      { key: "s", label: "Saha", type: "expense", amount: 1200, per: "match" },
      { key: "y", label: "Yayın", type: "income", amount: 50, per: "match" },
      { key: "z", label: "Boş", type: "expense", amount: 0, per: "match" },
    ]);
    expect(lines.map((l) => [l.label, l.party, l.amount])).toEqual([
      ["Takım ücreti", "Kartallar", 1500], ["Takım ücreti", "Şimşekler", 1500], ["Ev ücreti", "Kartallar", 200], ["Dep ücreti", "Şimşekler", 300], ["Saha", "Yıldız Halı Saha", 1200], ["Yayın", null, 50],
    ]);
    expect(lines[0].description).toBe("Takım ücreti — Kartallar – Şimşekler (2026-11-20)");
    expect(feeTotals(lines)).toEqual({ income: 3550, expense: 1200, net: 2350 });
    expect(feePreview(m, [])).toEqual([]);
  });
});

describe("adım aracı", () => {
  it("adım adından masanın görünümü", () => {
    expect(deskViewForStep("Proje sahalarının ve çalışma saatlerinin belirlenmesi")).toBe("schedule");
    expect(deskViewForStep("Saat havuzlarından eşleştirme ve maç oluşturma")).toBe("schedule");
    expect(deskViewForStep("Gelen maç taleplerinin değerlendirilmesi")).toBe("tasks");
    expect(deskViewForStep("Yeni kayıt olan takımların aranması")).toBe("team");
    expect(deskViewForStep("Takımlarla görüşme")).toBe("tasks");
    expect(deskViewForStep("Takım rehberinin güncellenmesi")).toBe("team");
    expect(deskViewForStep("Takım teyitlerinin alınması")).toBe("matches");
    expect(deskViewForStep("Maç günü kontrolü")).toBe("matches");
  });
});
