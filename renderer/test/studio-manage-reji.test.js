import {
  ALL_EVENT_CODES, EMPTY_STAT, POST_HIGHLIGHT_FIELDS, RATING_STEPS, SERVER_EVENT_CODES, buildPostPayload, eventInput, eventSideFor, eventTally,
  highlightSuggestions, isRatingInvalid, normalizeRating, playerStatBody, postSummary, quickEventCatalog, ratingsPayload, ratingsSummary,
  readPostContent, readSavedRatings, rejiEventRows, statDraftFromEvents, statsByPlayer, stepRating,
} from "../src/lib/studio/manage";
import { liveFirst, liveStripRows } from "../src/lib/studio/manageMatches";
import { staffPeople } from "../src/lib/studio/manageBroadcast";
import { TIMELINE_CODES, scoreFromEvents, toSquad } from "../src/lib/studio/match";

const ctx = { homeTeamId: 10, awayTeamId: 20 };
const events = [
  { id: 1, olay_kodu: "GOAL_RIGHT_FOOT", takim_id: 10, oyuncu_id: 7, dakika: 3, devre: 1 },
  { id: 2, olay_kodu: "YELLOW_CARD", takim_id: 20, oyuncu_id: 8, dakika: 12, devre: 1 },
  { id: 3, olay_kodu: "SAVE", takim_id: 20, oyuncu_id: 9, dakika: 14, devre: 1 },
  { id: 4, olay_kodu: "SUBSTITUTION", takim_id: 10, oyuncu_cikan_id: 7, oyuncu_giren_id: 11, dakika: 5, devre: 2 },
  { id: 5, olay_kodu: "GOAL_OWN", takim_id: 20, oyuncu_id: 8, dakika: 20, devre: 2 },
];
const nameOf = (id) => ({ 7: "Ali", 8: "Veli", 9: "Kaleci", 11: "Yedek" })[String(id)] || null;

describe("reji · olay kataloğu", () => {
  it("yalnız sunucunun tanıdığı kodlar; her biri giriş türüyle", () => {
    const cat = quickEventCatalog();
    const codes = cat.flatMap((g) => g.items.map((i) => i.code));
    codes.forEach((c) => expect(SERVER_EVENT_CODES.has(c)).toBe(true));
    expect(codes).toEqual(ALL_EVENT_CODES.filter((c) => SERVER_EVENT_CODES.has(c)));
    expect(codes).toEqual(expect.arrayContaining(["SUBSTITUTION", "RED_CARD", "FOUL", "INJURY", "SAVE", "CHANCE_CREATED", "GOAL_OWN", "DUEL_WON", "AERIAL_WON", "CRITICAL_BLOCK"]));
    expect(eventInput("SUBSTITUTION")).toBe("sub");
    expect(eventInput("GOAL_HEADER")).toBe("goal");
    expect(eventInput("ASSIST")).toBe("player");
    expect(cat.find((g) => g.key === "discipline").items.find((i) => i.code === "YELLOW_CARD").tone).toBe("yellow");
  });
  it("kendi kalesine: skor kartından girilirse olay rakibe yazılır, skor doğru hanede", () => {
    expect(eventSideFor("home", "GOAL_OWN", { fromScore: true })).toBe("away");
    expect(eventSideFor("home", "GOAL_OWN")).toBe("home");
    expect(eventSideFor("away", "GOAL_HEADER", { fromScore: true })).toBe("away");
    // ev sahibi yararına kendi kalesine: olay deplasmana yazılır → ev +1
    const side = eventSideFor("home", "GOAL_OWN", { fromScore: true });
    expect(scoreFromEvents([{ olay_kodu: "GOAL_OWN", takim_id: side === "home" ? 10 : 20 }], 10, 20)).toEqual({ home: 1, away: 0 });
  });
});

describe("reji · olay listesi", () => {
  it("en yeni üstte; takım ve tür süzgeçleri", () => {
    const all = rejiEventRows(events, { ...ctx, nameOf, timelineCodes: TIMELINE_CODES });
    expect(all.map((r) => r.ev.id)).toEqual([5, 4, 3, 2, 1]);
    expect(all.find((r) => r.ev.id === 4).who).toBe("Ali → Yedek");
    expect(rejiEventRows(events, { ...ctx, filter: "home" }).map((r) => r.ev.id)).toEqual([4, 1]);
    expect(rejiEventRows(events, { ...ctx, filter: "away" }).map((r) => r.ev.id)).toEqual([5, 3, 2]);
    expect(rejiEventRows(events, { ...ctx, filter: "stats", timelineCodes: TIMELINE_CODES }).map((r) => r.ev.id)).toEqual([3]);
    expect(rejiEventRows(events, { ...ctx, filter: "timeline", timelineCodes: TIMELINE_CODES })).toHaveLength(4);
  });
  it("takım sayaçları", () => {
    expect(eventTally(events, 10, 20)).toEqual({ home: { goals: 1, cards: 0, subs: 1, total: 2 }, away: { goals: 1, cards: 1, subs: 0, total: 3 } });
  });
});

describe("maç sonu · puanlar", () => {
  it("normalize (0–10, tek ondalık) ve yarım adım", () => {
    expect(normalizeRating("7,25")).toBe(7.3);
    expect(normalizeRating("12")).toBe(10);
    expect(normalizeRating("")).toBeNull();
    expect(isRatingInvalid("11")).toBe(true);
    expect(isRatingInvalid("abc")).toBe(true);
    expect(isRatingInvalid("")).toBe(false);
    expect(stepRating("7", 1)).toBe("7.5");
    expect(stepRating("10", 1)).toBe("10");
    expect(stepRating("1", -1)).toBe("1");
    expect(stepRating("", 1)).toBe("6");
    expect(stepRating("6.3", 1)).toBe("7");
    expect(RATING_STEPS[0]).toBe(1);
    expect(RATING_STEPS.at(-1)).toBe(10);
  });
  it("gövde: yalnız geçerli puanlar; boşsa null", () => {
    const players = [{ id: "7" }, { id: "8" }, { id: "9" }];
    expect(ratingsPayload(players, { 7: "8,5", 8: "", 9: "x" })).toEqual({ ratings: [{ playerId: 7, oyuncu_id: 7, puan: 8.5 }] });
    expect(ratingsPayload(players, {})).toBeNull();
    expect(ratingsSummary(players, { 7: "8", 9: "11" }, { 7: "8" })).toEqual({ filled: 1, invalid: 1, dirty: true, total: 3 });
    expect(readSavedRatings({ home: [{ playerId: 7, puan: 7.5 }, { playerId: 9, puan: null }], away: [{ oyuncu_id: 8, puan: 6 }] })).toEqual({ 7: "7.5", 8: "6" });
    expect(toSquad([{ playerId: 7, playerName: "Ali", puan: 7.5, playerImg: "https://x/7.png", role: "starter" }])[0]).toMatchObject({ rating: 7.5, image: "https://x/7.png" });
  });
  it("enler önerisi: en yüksek puan, mevki, tek golcü", () => {
    const players = [{ id: "7", position: "Forvet" }, { id: "9", position: "Kaleci" }, { id: "8", position: "Stoper" }];
    const s = highlightSuggestions(players, { 7: "8", 9: "9", 8: "6" }, events);
    expect(s.best_player.id).toBe("9");
    expect(s.best_goalkeeper.id).toBe("9");
    expect(s.best_defender.id).toBe("8");
    expect(s.best_forward.id).toBe("7");
    expect(s.best_goal.id).toBe("7");
  });
  it("içerik oku / yaz (mobil buildPostPayload ile aynı alanlar)", () => {
    const content = readPostContent({ match_title: "Başlık", post_rapor: "Rapor", match_picture: "null", match_video: "https://v" });
    expect(content).toEqual({ title: "Başlık", report: "Rapor", coverImage: "", liveLink: "https://v", interview: "", photos: "" });
    const body = buildPostPayload(content, { best_player: "7" }, nameOf);
    expect(body).toMatchObject({ match_title: "Başlık", post_manset: "Başlık", match_comment: "Rapor", post_rapor: "Rapor", match_mvp: 7 });
    const award = JSON.parse(body.post_macin_enleri);
    expect(award).toMatchObject({ best_player_id: "7", best_player_name: "Ali", best_player: "Ali", best_save_id: "" });
    expect(Object.keys(award)).toHaveLength(POST_HIGHLIGHT_FIELDS.length * 3);
    expect(buildPostPayload(content, {}, nameOf).match_mvp).toBeNull();
  });
  it("özet: kendi kalesine golü rakip hanesine", () => {
    const s = postSummary(events, { ...ctx, nameOf });
    expect(s.goals.home.map((g) => g.name)).toEqual(["Ali", "Veli"]);
    expect(s.goals.home[1].own).toBe(true);
    expect(s.cards.away).toEqual([{ name: "Veli", minute: 12, red: false }]);
    expect(s.subs).toBe(1);
  });
});

describe("maç sonu · oyuncu istatistiği", () => {
  it("olaylardan taslak ve gövde", () => {
    const d = statDraftFromEvents("7", [...events, { olay_kodu: "GOAL_HEADER", oyuncu_id: 7, dakika: 30 }, { olay_kodu: "RED_CARD", oyuncu_id: 7 }]);
    expect(d).toMatchObject({ number_of_goals: 2, goals_minutes: "3,30", red_card: 1, goal_to_himself: 0 });
    const body = playerStatBody({ ...EMPTY_STAT, number_of_goals: "25", goals_minutes: "3, 30'", points: "7.5", yellow_card: 5 }, { matchId: 9, playerId: "7", teamId: 10, opponentTeamId: 20, position: "Forvet" });
    expect(body).toEqual({ player_id: 7, match_id: 9, team_id: 10, opponent_team_id: 20, number_of_goals: 20, goals_minutes: "3,30", yellow_card: 2, red_card: 0, points: 7.5, goal_to_himself: 0, goal_to_himself_minutes: null, player_position: "Forvet" });
    expect(statsByPlayer([{ id: 1, player_id: 7 }, null])).toEqual({ 7: { id: 1, player_id: 7 } });
  });
});

describe("maç seçimi ve röportaj görevlileri", () => {
  it("canlı maçlar en üstte; canlı şerit yalnız canlılar", () => {
    expect(liveFirst([{ id: 1, status: "zamanlanmis" }, { id: 2, status: "canli" }]).map((m) => m.id)).toEqual([2, 1]);
    const strip = liveStripRows([{ id: 3, mac_durumu: "canli", match_time: "21:00", first_team_name: "A", second_team_name: "B", city: "Ankara" }, { id: 4, mac_durumu: "yayinlanmis" }, { id: 5, mac_durumu: "canli", match_time: "19:00", city: "İzmir" }], { city: "ankara" });
    expect(strip.map((m) => m.id)).toEqual([3]);
  });
  it("görevliler → röportaj konuğu", () => {
    expect(staffPeople({ assignments: { spiker: { staffId: 3, fullName: "Ayşe K", dutyLabel: "Spiker" }, hakem: { staffId: 4, fullName: null } } })).toEqual([{ id: "3", name: "Ayşe K", role: "Spiker" }]);
    expect(staffPeople(null)).toEqual([]);
  });
});
