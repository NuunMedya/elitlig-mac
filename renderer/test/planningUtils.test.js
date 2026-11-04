import {
  boardTotals, buildInbox, buildWeekGrid, callCreatePayload, callEditPayload, callError, canSelectCell, cardIndexOf, cellIndex, cellKey, cellView, contactOf, dateLabel, dayAcross,
  dayBulkSets, dayLabel, dayStats, deskKpis, dueInfo, filterInbox, filterTeamRows, groupInbox, groupOptions, heatText, initials, isPastWithDetail, mostMatches, normalizePhone,
  opponentSuggestions, optionAvailability, optionChips, optionKey, optionWeeks, outcomeMeta, poolIndexOf, registeredText, requestGrid, scopeOptions, scopeParams, slotState,
  slotSummary, sortInbox, sortTeamRows, sourceOf, suggestionToTask, summarizeOptions, summarizeSelection, teamCitiesOf, teamListRows, teamProfile, timeAgo, timeLabel,
  topSeasonText, wantOf, weekRangeLabel, weekStartOf, weekSummary, whatsappHref,
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
  it("havuz satırı → talep kartı", () => {
    const cardOf = cardIndexOf(cards);
    expect(cardOf({ entry_id: "e1" }).task_id).toBe("a");
    expect(cardOf({ request_id: 7 }).task_id).toBe("d");
    expect(cardOf({ entry_id: "zz" })).toBe(null);
  });
  it("vade, rakip önerisi, öneri → kart", () => {
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
    expect(mostMatches(all)[0].metric).toBe("son 6 ayda 9");
    const withTotal = [{ ...all[0], total_matches: 40 }, { ...all[1], total_matches: 12 }];
    expect(mostMatches(withTotal).map((r) => r.team_id)).toEqual([1, 2]);
    expect(mostMatches(withTotal)[0].metric).toBe("Toplam 40 maç · son 6 ayda 4");
    expect(sortTeamRows(withTotal, "total")[0].team_id).toBe(1);
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

describe("görüşme kaydı ve düzenleme", () => {
  it("etiketler sunucuyla aynı; yeni etiketler", () => {
    expect(outcomeMeta("will_return").label).toBe("Geri dönecek");
    expect(outcomeMeta("thinking").label).toBe("Düşünüp haber verecek");
    expect(outcomeMeta("other_slot").label).toBe("Başka gün / saat istiyor");
    expect(outcomeMeta("callback").date).toBe("required");
    expect(outcomeMeta("bilinmeyen").label).toBe("bilinmeyen");
  });
  it("eksik alanlar", () => {
    expect(callError({})).toBe("Görüşme etiketini seçin.");
    expect(callError({ outcome: "callback" })).toBe("Tekrar arama zamanını seçin.");
    expect(callError({ outcome: "note", note: "  " })).toBe("Not yazın.");
    expect(callError({ outcome: "will_return" })).toBe("");
  });
  it("kayıt gövdesi: zaman yalnız tarihli etiketlerde, saat bağlanabilir", () => {
    const at = "2026-11-05T19:00";
    expect(callCreatePayload(11, { outcome: "callback", note: " akşam ", at }, { venueId: "v1", date: "2026-11-06", hour: "21", minute: 0 }))
      .toEqual({ teamId: 11, outcome: "callback", note: "akşam", callbackAt: new Date(at).toISOString(), venueId: "v1", date: "2026-11-06", hour: 21, minute: 0 });
    expect(callCreatePayload("12", { outcome: "interested", at })).toEqual({ teamId: 12, outcome: "interested" });
  });
  it("düzenleme gövdesi yalnız değişenleri gönderir", () => {
    const call = { call_id: "c1", outcome: "will_return", note: "Akşam dönecek", callback_at: null };
    expect(callEditPayload(call, { outcome: "will_return", note: "Akşam dönecek", at: "" })).toBe(null);
    expect(callEditPayload(call, { outcome: "other_slot", note: "Pazar 21:00 istiyor", at: "" })).toEqual({ outcome: "other_slot", note: "Pazar 21:00 istiyor" });
    expect(callEditPayload(call, { outcome: "callback", note: "Akşam dönecek", at: "" })).toEqual({ error: "Tekrar arama zamanını seçin." });
    const at = "2026-11-07T11:00";
    expect(callEditPayload(call, { outcome: "callback", note: "Akşam dönecek", at })).toEqual({ outcome: "callback", callback_at: new Date(at).toISOString() });
    const withDue = { ...call, outcome: "callback", callback_at: new Date(at).toISOString() };
    expect(callEditPayload(withDue, { outcome: "interested", note: "Akşam dönecek", at })).toEqual({ outcome: "interested", callback_at: null });
  });
});

describe("Talepler: kaynak, gruplar, çipler", () => {
  const now = new Date("2026-11-04T12:00:00");
  const opt = (o) => ({ venue_public_id: "v1", venue_name: "Yıldız", status: "waiting", is_past: false, slot_status: "open", minute: 0, ...o });
  const cards = [
    { task_id: "app", kind: "match_request", stage: "open", status: "open", source: "request", from_app: true, team_id: 20, team_name: "Sincan", note: "Cuma olur", created_at: "2026-11-04T09:00:00Z",
      options: [opt({ date: "2026-11-06", day: 5, hour: 21 }), opt({ date: "2026-11-07", day: 6, hour: 22 })] },
    { task_id: "tel", kind: "match_request", stage: "open", status: "open", source: "manual", team_id: 13, team_name: "Yıldızspor", created_at: "2026-11-03T09:00:00Z",
      options: [opt({ date: "2026-11-09", day: 1, hour: 22, slot_status: "awaiting" }), opt({ venue_public_id: "v2", venue_name: "Merkez", date: "2026-11-10", day: 2, hour: 0, minute: 30 })] },
    { task_id: "cb", kind: "contact", stage: "waiting_us", status: "open", source: "callback", team_id: 15, team_name: "Çankaya", due_at: "2026-11-04T17:00:00", created_at: "2026-11-02T09:00:00Z", options: [] },
    { task_id: "talk", kind: "contact", stage: "waiting_them", status: "open", source: "manual", team_id: 14, team_name: "Atletik", created_at: "2026-11-01T09:00:00Z", options: [] },
    { task_id: "won", kind: "match_request", stage: "matched", status: "done", source: "pool", team_id: 12, team_name: "Şimşekler", opponent_team_id: 16, opponent_name: "Batıkent", created_at: "2026-10-30T09:00:00Z", options: [opt({ date: "2026-11-06", day: 5, hour: 22, status: "matched", slot_status: "booked" })] },
  ];
  const waiting = [
    { entry_id: "e9", team_id: 19, team_name: "Gölbaşı", venue_public_id: "v1", venue_name: "Yıldız", date: "2026-11-06", day: 5, hour: 21, minute: 0, source: "admin", slot_status: "open", created_at: "2026-11-04T08:00:00Z" },
  ];
  const calls = [{ call_id: "k1", team_id: 13, outcome: "interested", outcome_label: "Oynamak istiyor", note: "Pazartesi 22:00", created_at: "2026-11-03T12:00:00Z" }];
  const rows = buildInbox({ cards, waiting, calls, teamCities: { 20: "Ankara", 19: "Ankara" }, now });
  const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));
  it("kaynak ve ne istediği", () => {
    expect(sourceOf(cards[0])).toBe("app");
    expect(sourceOf(cards[1])).toBe("phone");
    expect(sourceOf(cards[2])).toBe("callback");
    expect(sourceOf({ kind: "personal", source: "manual" })).toBe("manual");
    expect(wantOf(cards[4]).key).toBe("specific");
    expect(wantOf(cards[2])).toEqual({ key: "contact", label: "Aranmayı bekliyor" });
    expect(byKey["p-e9"]).toMatchObject({ type: "pool", source: "pool", team_name: "Gölbaşı", city: "Ankara" });
  });
  it("uygunluk: rakip bekliyor, aday var, boş, dolu", () => {
    const idx = poolIndexOf(waiting);
    expect(optionAvailability(cards[0].options[0], idx, 20)).toMatchObject({ avail: "candidates", others: [{ team_id: 19, team_name: "Gölbaşı" }] });
    expect(optionAvailability(cards[0].options[0], idx, 19).avail).toBe("free");
    expect(optionAvailability(cards[1].options[0], idx, 13).avail).toBe("opponent");
    expect(optionAvailability({ ...cards[1].options[1], slot_status: "closed" }, idx, 13).avail).toBe("taken");
    expect(optionAvailability({ ...cards[1].options[1], is_past: true }, idx, 13).avail).toBe("past");
  });
  it("gün / saat / saha çipleri gece yarısını sona koyar", () => {
    expect(optionChips(cards[1].options)).toEqual({ days: [1, 2], times: ["22:00", "00:30"], venues: ["Yıldız", "Merkez"], dates: ["2026-11-09", "2026-11-10"] });
    expect(byKey["c-app"].chips).toMatchObject({ days: [5, 6], times: ["21:00", "22:00"] });
  });
  it("durum grupları", () => {
    expect(byKey["c-app"].group).toBe("ready"); // aynı saatte Gölbaşı bekliyor
    expect(byKey["c-tel"].group).toBe("ready"); // rakip bekleyen saat
    expect(byKey["c-cb"].group).toBe("followup");
    expect(byKey["c-cb"].due).toMatchObject({ label: "Bugün 17:00", group: "today" });
    expect(byKey["c-talk"].group).toBe("talking");
    expect(byKey["c-won"].group).toBe("done");
    expect(byKey["p-e9"].group).toBe("ready");
    const lone = buildInbox({ cards: [{ ...cards[3], task_id: "n", stage: "open" }], now });
    expect(lone[0].group).toBe("new");
    expect(groupInbox(rows).map((g) => [g.key, g.items.length])).toEqual([["new", 0], ["talking", 1], ["followup", 1], ["ready", 3], ["done", 1]]);
  });
  it("son görüşme talepten sonraysa satıra düşer", () => {
    expect(byKey["c-tel"].lastCall.note).toBe("Pazartesi 22:00");
    expect(byKey["c-app"].lastCall).toBe(null);
  });
  it("süzgeç ve sıra", () => {
    expect(filterInbox(rows, { source: "app" }).map((r) => r.key)).toEqual(["c-app"]);
    expect(filterInbox(rows, { venue: "Merkez" }).map((r) => r.key)).toEqual(["c-tel"]);
    expect(filterInbox(rows, { day: 6 }).map((r) => r.key)).toEqual(["c-app"]);
    expect(filterInbox(rows, { hourFrom: 23, hourTo: 1 }).map((r) => r.key)).toEqual(["c-tel"]);
    expect(filterInbox(rows, { group: "ready", q: "ankara" }).map((r) => r.key).sort()).toEqual(["c-app", "p-e9"]);
    expect(filterInbox(rows, { kind: "contact" }).map((r) => r.key)).toEqual(["c-cb", "c-talk"]);
    expect(sortInbox(rows, "newest")[0].key).toBe("c-app");
    expect(sortInbox(rows, "oldest")[0].key).toBe("c-won");
    expect(sortInbox(rows, "due")[0].key).toBe("c-cb");
  });
  it("özet şeridi", () => {
    const board = { week_start: "2026-11-02", venue: { grid: { days: [{ date: "2026-11-06", day: 5, is_past: false, is_bookable: true }], times: [{ hour: 20, minute: 0 }, { hour: 21, minute: 0 }, { hour: 23, minute: 0 }] } },
      cells: [{ date: "2026-11-06", hour: 20, minute: 0, status: "booked", home: { team_id: 1 }, away: { team_id: 2 }, is_bookable: true }, { date: "2026-11-06", hour: 21, minute: 0, status: "open", pool_count: 2, pool: [{}, {}], is_bookable: true }] };
    expect(deskKpis({ rows, waiting, boards: [board], now })).toMatchObject({ fresh: 0, due: 1, candidates: 1, free: 2, freePrime: 2, matches: 1, ready: 3 });
  });
});

describe("Program: hafta panosu hücreleri", () => {
  it("hücre görünümü", () => {
    expect(cellView({ date: "2026-11-09", hour: 20, status: "booked", home: { team_name: "Kartallar FK" }, away: { team_name: "Şimşekler" }, is_bookable: true })).toMatchObject({ state: "booked", main: "Kartallar FK", sub: "Şimşekler" });
    const pooled = cellView({ date: "2026-11-09", hour: 21, status: "open", pool_count: 4, pool: [{ team_name: "Kartallar FK" }, { team_name: "Batıkent Spor" }, { team_name: "Şimşekler" }, { team_name: "Atletik Gençlik" }], is_bookable: true });
    expect(pooled).toMatchObject({ state: "pooled", count: 4, main: "4 aday", chips: ["KA", "BA", "Şİ"] });
    expect(cellView({ date: "2026-11-09", hour: 22, status: "awaiting", home: { team_name: "Yıldızspor" }, pool: [{ team_name: "X" }], is_bookable: true })).toMatchObject({ state: "awaiting", main: "Yıldızspor", sub: "rakip aranıyor · 1 aday" });
    expect(cellView({ date: "2026-11-09", hour: 19, status: "closed", note: "Okul turnuvası", is_bookable: true })).toMatchObject({ state: "closed", main: "Dolu", sub: "Okul turnuvası" });
    expect(cellView({ date: "2026-11-09", hour: 19, status: "open", external_match: { id: 5, home_name: "A", away_name: "B" }, is_bookable: true })).toMatchObject({ state: "external", main: "A", sub: "B" });
    expect(cellView({ date: "2026-11-01", hour: 19, is_past: true, fixture: { home_name: "A", away_name: "B", home_score: 3, away_score: 2, status: "yayinlanmis" } })).toMatchObject({ state: "played", score: "3-2" });
    expect(cellView({ date: "2026-11-09", hour: 19, status: "open", is_bookable: true })).toMatchObject({ state: "open", main: "Boş" });
    expect(cellView({ date: "2026-11-09", hour: 19, status: "booked", pool_stranded: true, pool_count: 2, home: { team_name: "A" }, away: { team_name: "B" }, is_bookable: true })).toMatchObject({ state: "stranded", count: 2 });
    expect(initials("Kartallar FK")).toBe("KA");
    expect(initials("Batıkent Spor")).toBe("BA");
  });
  it("haftalık özet ve doluluk", () => {
    const s = weekSummary(board);
    expect(s).toMatchObject({ matches: 1, free: 2, freePrime: 2, candidates: 1, occupancy: 50 });
    expect(weekSummary(null)).toMatchObject({ matches: 0, occupancy: 0 });
  });
  it("tüm sahalar tek gün", () => {
    const other = { venue: { public_id: "v2", grid: { days: [{ date: "2026-11-09", day: 1 }], times: [{ hour: 19, minute: 0 }, { hour: 0, minute: 0 }] } }, cells: [] };
    const d = dayAcross([board, other], "2026-11-09");
    expect(d.times.map((t) => t.label)).toEqual(["19:00", "20:00", "21:30", "00:00"]);
    expect(d.cols).toHaveLength(2);
    expect(d.cols[0].cells.get("20:00").status).toBe("booked");
    expect(d.cols[1].cells.get("20:00")).toBe(undefined);
  });
});

describe("talep ayrıntısı: mini hafta tablosu", () => {
  it("istenen hücreleri işaretler, tablo dışı saati satır yapar", () => {
    const venue = { public_id: "v1", active_days: [1, 2], grid: { times: [{ hour: 20, minute: 0 }, { hour: 21, minute: 0 }] } };
    const options = [{ venue_public_id: "v1", date: "2026-11-09", day: 1, hour: 21, minute: 0, avail: "free" }, { venue_public_id: "v1", date: "2026-11-10", day: 2, hour: 23, minute: 0, avail: "candidates" }, { venue_public_id: "v1", date: "2026-11-17", hour: 21 }];
    expect(optionWeeks(options)).toEqual(["2026-11-09", "2026-11-16"]);
    const g = requestGrid({ venue, options, weekStart: "2026-11-09", today: "2026-11-04" });
    expect(g.days.map((d) => d.date)).toEqual(["2026-11-09", "2026-11-10"]);
    expect(g.rows.map((r) => r.time.hour)).toEqual([20, 21, 23]);
    expect(g.rows[1].cells[0].option.hour).toBe(21);
    expect(g.rows[2].cells[1].option.avail).toBe("candidates");
    expect(g.rows[0].cells[0]).toMatchObject({ option: null, state: "open" });
    expect(g.requested).toBe(2);
    const withBoard = requestGrid({ venue, board: { ...board, week_start: "2026-11-09" }, options, weekStart: "2026-11-09", today: "2026-11-04" });
    expect(withBoard.rows.find((r) => r.time.hour === 20).cells[0].state).toBe("booked");
  });
});

describe("takım profili", () => {
  const row = { team_id: 9, team_name: "Kartallar", city: "İzmir", total_matches: 42, season_count: 3, top_season: { season_id: 5, name: "2026 Güz", league: "Ankara Süper Lig", played: 14 }, days_since: 25, created_at: "2026-10-30T10:00:00Z" };
  it("en çok oynadığı sezon ve özet", () => {
    expect(topSeasonText(row.top_season)).toBe("2026 Güz · Ankara Süper Lig · 14 maç");
    expect(topSeasonText(null)).toBe("");
    expect(teamProfile(row)).toMatchObject({ city: "İzmir", total: 42, totalText: "42 maç", seasonsText: "3 sezon", topShort: "2026 Güz · Ankara Süper Lig", lastMatch: "Son maç 25 gün önce", idle: true });
    expect(teamProfile({ total_matches: 0 })).toMatchObject({ totalText: "Maç yok", top: "", lastMatch: "Son 6 ayda maç yok" });
  });
  it("yeni kayıtta kayıt ili", () => {
    expect(registeredText({ ...row, registered_city: "Bursa" }, new Date("2026-11-04T12:00:00"))).toBe("Bursa · 5 gün önce kayıt oldu");
    expect(registeredText({ created_at: new Date().toISOString() })).toBe("İl bilinmiyor · bugün kayıt oldu");
  });
  it("il süzgeci ve il listesi", () => {
    const rows = [row, { team_id: 2, team_name: "Ayva", city: "Ankara" }, { team_id: 3, team_name: "Çınar", registered_city: "Bursa" }];
    expect(teamCitiesOf(rows)).toEqual(["Ankara", "Bursa", "İzmir"]);
    expect(filterTeamRows(rows, { city: "Bursa" }).map((r) => r.team_id)).toEqual([3]);
    expect(filterTeamRows(rows, { q: "süper lig" }).map((r) => r.team_id)).toEqual([9]);
  });
});
