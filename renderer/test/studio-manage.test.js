import {
  ALL_EVENT_CODES, EVENT_GROUPS, addLineupPick, buildLineupPayload, buildLineupSide, eventSummary, eventToForm, eventUpdateBody,
  friendlyError, fullEventBody, lineupCounts, lineupWarnings, manageEventLabel, pitchState, sortLineup, substitutionBody,
  updateLineupPick, validateEvent,
} from "../src/lib/studio/manage";
import {
  asArray, filterMatches, filterTeams, fixtureCreatePayload, isNationwide, matchDay, matchListQuery, matchToForm, matchUpdatePayload,
  playerCreatePayload, playerExtraPayload, playerUpdatePayload, rangePreset, readAssignments, statusLabel, teamCreatePayload,
  teamUpdatePayload, validateFixture, validatePlayer, validateTeam,
} from "../src/lib/studio/manageMatches";
import {
  LED_MODES, OVERLAY_MODES, addHeadlinePatch, aiHeadlinesPatch, currentLedMode, currentOverlayMode, formatLeft, highlightsPayload,
  interviewPatch, interviewPerson, ledModeBody, moveItem, normalizeDesk, onAirPatch, overlayLinks, overlayModeBody, readHighlights,
} from "../src/lib/studio/manageBroadcast";

const ctx = { homeTeamId: 10, awayTeamId: 20 };

describe("maç yönetimi · hatalar", () => {
  it("403 dostça yetki iletisi, sunucu iletisi korunur", () => {
    expect(friendlyError({ ok: false, error: { status: 403, code: "PERMISSION_DENIED", message: "Bu işlem için yetkiniz yok." } })).toMatch(/yetkin yok/);
    expect(friendlyError({ ok: false, error: { status: 403, message: "Takımın ilini yalnızca Türkiye geneli yetkili bir hesap değiştirebilir." } })).toMatch(/Türkiye geneli/);
    expect(friendlyError({ ok: false, error: { status: 400, message: "Sunucu hatası (400)." } }, "Olay kaydedilemedi.")).toBe("Olay kaydedilemedi. Gönderilen bilgiler geçersiz.");
    expect(friendlyError({ ok: false, error: { status: 409, message: "Bu maç zaten var." } })).toBe("Bu maç zaten var.");
    expect(friendlyError({ ok: false, offline: true })).toMatch(/Bağlantı yok/);
    expect(friendlyError({ ok: false, error: { status: 401 } })).toMatch(/giriş/);
  });
});

describe("maç yönetimi · olaylar", () => {
  it("tüm reji kodları ve etiketleri", () => {
    expect(EVENT_GROUPS.map((g) => g.key)).toEqual(["goals", "discipline", "other"]);
    expect(ALL_EVENT_CODES).toHaveLength(19);
    expect(ALL_EVENT_CODES).toEqual(expect.arrayContaining(["GOAL_OWN", "ASSIST", "FOUL", "INJURY", "SUBSTITUTION", "DUEL_WON", "AERIAL_WON", "CRITICAL_BLOCK"]));
    expect(manageEventLabel("critical_block")).toBe("Kritik müdahale");
  });

  it("değişiklik gövdesi: oyuncu_id boş, çıkan / giren dolu", () => {
    const body = substitutionBody({ side: "away", outId: "7", inId: "12", minute: "33", period: 2, ...ctx, userId: 5 });
    expect(body).toMatchObject({ takim_id: 20, olay_kodu: "SUBSTITUTION", dakika: 33, devre: 2, oyuncu_id: null, oyuncu_cikan_id: 7, oyuncu_giren_id: 12, olusturan_kullanici_id: 5, side: "away" });
    expect(body.client_event_id).toMatch(/^d-/);
  });

  it("olay gövdesi: oyuncusuz ve açıklamalı", () => {
    const body = fullEventBody({ side: "home", code: "foul", playerId: "", minute: "", period: 0, note: "  sert  ", ...ctx });
    expect(body).toMatchObject({ takim_id: 10, olay_kodu: "FOUL", dakika: 0, devre: 1, oyuncu_id: null, oyuncu_cikan_id: null, oyuncu_giren_id: null, aciklama: "sert" });
  });

  it("doğrulama", () => {
    expect(validateEvent({ side: "home", code: "" })).toBe("Olay türünü seç.");
    expect(validateEvent({ side: "home", code: "SUBSTITUTION", outId: "3" })).toBe("Giren oyuncuyu seç.");
    expect(validateEvent({ side: "home", code: "SUBSTITUTION", outId: "3", inId: "3" })).toMatch(/aynı/);
    expect(validateEvent({ side: "away", code: "SAVE" })).toBe("");
  });

  it("düzenleme: formdan PUT gövdesi, client_event_id yok", () => {
    const ev = { id: 9, takim_id: 20, olay_kodu: "SUBSTITUTION", oyuncu_cikan_id: 4, oyuncu_giren_id: 8, dakika: 41, devre: 2, aciklama: "none" };
    const form = eventToForm(ev, 10, 20);
    expect(form).toMatchObject({ side: "away", code: "SUBSTITUTION", outId: "4", inId: "8", minute: "41", period: 2, note: "" });
    const body = eventUpdateBody({ ...form, code: "YELLOW_CARD", playerId: "4" }, ctx);
    expect(body).toMatchObject({ olay_kodu: "YELLOW_CARD", oyuncu_id: 4, oyuncu_cikan_id: null, oyuncu_giren_id: null, takim_id: 20 });
    expect(body.client_event_id).toBeUndefined();
  });

  it("sahadakiler değişikliklerle güncellenir", () => {
    const squad = [
      { id: "1", name: "A", role: "starter" }, { id: "2", name: "B", role: "starter" },
      { id: "3", name: "C", role: "bench" }, { id: "4", name: "D", role: "bench" },
    ];
    const events = [{ id: 1, takim_id: 10, olay_kodu: "SUBSTITUTION", oyuncu_cikan_id: 2, oyuncu_giren_id: 3, devre: 1, dakika: 10 }];
    const st = pitchState(squad, events, 10);
    expect(st.onPitch.map((p) => p.id)).toEqual(["1", "3"]);
    expect(st.available.map((p) => p.id)).toEqual(["2", "4"]);
    expect(pitchState(squad, events, 10, { exceptEventId: 1 }).onPitch.map((p) => p.id)).toEqual(["1", "2"]);
    expect(pitchState(squad, events, 20).onPitch.map((p) => p.id)).toEqual(["1", "2"]);
    expect(eventSummary(events[0], (id) => ({ 2: "B", 3: "C" }[id]))).toBe("B → C");
  });
});

describe("maç yönetimi · kadro", () => {
  const roster = [{ id: 501, player_id: 1, player_name: "Ali", team_id: 10, jersey_number: 9 }, { player_id: 2, player_name: "Veli", team_id: 10 }];
  const saved = [{ playerId: 1, playerName: "Ali", role: "starter", number: 10, position: "Forvet", captain: true }, { playerId: 77, guestName: "Misafir", isGuest: true, role: "bench", number: "" }];

  it("kalıcı kadro + kayıtlı maç kadrosu birleşir", () => {
    const side = buildLineupSide(roster, saved, 10);
    expect(side["1"]).toMatchObject({ role: "starter", number: "10", position: "Forvet", captain: true, extra: false });
    expect(side["2"]).toMatchObject({ role: "", name: "Veli" });
    expect(side["77"]).toMatchObject({ role: "bench", guest: true, extra: true, teamId: null });
    expect(sortLineup(side).map((p) => p.id)).toEqual(["1", "77", "2"]);
    expect(lineupCounts(side)).toEqual({ starters: 1, bench: 1 });
  });

  it("tek kaptan, kadrodan çıkan kaptanlığı bırakır", () => {
    let side = buildLineupSide(roster, saved, 10);
    side = updateLineupPick(side, "2", { role: "starter", captain: true });
    expect(side["1"].captain).toBe(false);
    expect(side["2"].captain).toBe(true);
    side = updateLineupPick(side, "2", { role: "" });
    expect(side["2"].captain).toBe(false);
  });

  it("kayıt gövdesi: yalnız ilk 11 / yedek, misafir adı", () => {
    let side = buildLineupSide(roster, saved, 10);
    side = addLineupPick(side, { id: 300, player_name: "Başka Takım", team_id: null }, { teamId: 10, guest: true });
    const rows = buildLineupPayload(side, 10);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({ playerId: 1, oyuncu_id: 1, role: "starter", position: "Forvet", number: 10, captain: true, isGuest: false });
    expect(rows.find((r) => r.playerId === 77)).toMatchObject({ isGuest: true, guestName: "Misafir", number: "" });
    expect(rows.find((r) => r.playerId === 300)).toMatchObject({ role: "bench", isGuest: true, guestName: "Başka Takım" });
  });

  it("uyarılar: ilk 11 yok, aynı forma", () => {
    const side = { a: { id: "a", role: "bench", number: "5" }, b: { id: "b", role: "bench", number: "5" } };
    expect(lineupWarnings(side, "Ev")).toEqual(["Ev: ilk 11 seçilmedi.", "Ev: aynı forma numarası (5)."]);
  });
});

describe("maç yönetimi · maçlar", () => {
  const f = { city: "Ankara", leagueId: 3, leagueLabel: "Süper Lig", seasonId: 8, seasonLabel: "2026 Güz", groupId: 2, home: { id: 1, name: "Kartal" }, away: { id: 2, name: "Şahin" }, date: "2026-11-05", time: "20:00", venue: " Ostim " };

  it("fikstür gövdesi (POST /maclar/add-fikstur)", () => {
    expect(fixtureCreatePayload(f, { hasGroups: true })).toEqual({
      first_team_name: "Kartal", second_team_name: "Şahin", date: "2026-11-05", time: "20:00", match_field: "Ostim",
      league_name: "Süper Lig", match_season: "2026 Güz", match_title: "Kartal vs Şahin", city: "Ankara", is_it_fixture: true,
      home_team_id: 1, away_team_id: 2, league_id: 3, season_id: 8, group_id: 2,
    });
    expect(fixtureCreatePayload(f, { hasGroups: false }).group_id).toBeNull();
  });

  it("fikstür doğrulama", () => {
    expect(validateFixture(f, { hasGroups: true })).toBe("");
    expect(validateFixture({ ...f, away: f.home })).toMatch(/iki kez/);
    expect(validateFixture({ ...f, groupId: null }, { hasGroups: true })).toMatch(/grubu/);
    expect(validateFixture({ ...f, city: "" })).toBe("İl seçilmeli.");
  });

  it("düzenleme: yalnız değişen alanlar", () => {
    const m = { date: "2026-11-05T00:00:00.000Z", time: "20:00:00", match_field: "Ostim", mac_durumu: "zamanlandi", match_video: "none", match_title: "none" };
    const form = matchToForm(m);
    expect(form).toMatchObject({ date: "2026-11-05", time: "20:00", status: "zamanlanmis", video: "" });
    expect(matchUpdatePayload(form, m)).toEqual({});
    expect(matchUpdatePayload({ ...form, time: "21:00", video: "https://youtu.be/x" }, m)).toEqual({ time: "21:00", match_video: "https://youtu.be/x" });
  });

  it("liste süzgeci ve sorgusu", () => {
    const rows = [
      { id: 1, date: "2026-11-05", time: "21:00:00", first_team_name: "Kartal", second_team_name: "Şahin", mac_durumu: "canli" },
      { id: 2, date: "2026-11-05", time: "19:00:00", first_team_name: "Doğan", second_team_name: "Atmaca", mac_durumu: "taslak" },
      { id: 3, date: "2026-11-07", time: "19:00", first_team_name: "Kartal", second_team_name: "Doğan", mac_durumu: "zamanlanmis" },
    ];
    expect(filterMatches(rows, { from: "2026-11-05", to: "2026-11-05" }).map((m) => m.id)).toEqual([2, 1]);
    expect(filterMatches(rows, { q: "kartal" }).map((m) => m.id)).toEqual([1, 3]);
    expect(filterMatches(rows, { status: "taslak" }).map((m) => m.id)).toEqual([2]);
    expect(matchListQuery({ from: "2026-11-05", status: "canli", city: "Ankara" })).toMatchObject({ includeDraft: 1, date_from: "2026-11-05", date_to: "2026-11-05", mac_durumu: "canli", city: "Ankara" });
    expect(rangePreset("week", "2026-11-05")).toEqual({ from: "2026-11-04", to: "2026-11-11" });
    expect(matchDay("2026-11-05")).toBe("2026-11-05");
    expect(statusLabel("zamanlandi")).toBe("Zamanlandı");
    expect(readAssignments({ assignments: { hakem: { staffId: 4 }, spiker: null } })).toEqual({ hakem: "4", spiker: "" });
  });

  it("il kapsamı", () => {
    expect(isNationwide({ role: "admin", city: "Türkiye" })).toBe(true);
    expect(isNationwide({ role: "admin", city: "Ankara" })).toBe(false);
    expect(isNationwide({ role: "editor", city: "Türkiye" })).toBe(false);
  });
});

describe("maç yönetimi · takım ve oyuncu", () => {
  it("takım gövdeleri", () => {
    expect(validateTeam({ team_name: " " })).toMatch(/zorunlu/);
    expect(validateTeam({ team_name: "X", logo: "ftp://a" })).toMatch(/http/);
    expect(teamCreatePayload({ team_name: " Kartal ", current_league: "Lig", city: "Ankara" })).toEqual({ team_name: "Kartal", current_league: "Lig", current_season: "", city: "Ankara", team_points: 0 });
    expect(teamUpdatePayload({ team_name: "Kartal SK", current_league: "Lig", active: false }, { team_name: "Kartal", current_league: "Lig", active: true })).toEqual({ team_name: "Kartal SK", active: false });
    expect(filterTeams({ teams: [{ id: 2, team_name: "Şahin" }, { id: 1, team_name: "Ağaç" }] }, "").map((t) => t.id)).toEqual([1, 2]);
    expect(asArray({ items: [1] })).toEqual([1]);
  });

  it("oyuncu gövdeleri", () => {
    expect(validatePlayer({ player_name: "Ali" })).toBe("Takım seç.");
    expect(validatePlayer({ player_name: "Ali" }, { needsTeam: false })).toBe("");
    expect(playerCreatePayload({ player_name: " Ali ", team_id: "4", player_position: "Forvet" }, "2026-11-05")).toEqual({ player_name: "Ali", team_id: 4, player_position: "Forvet", attendence_date: "2026-11-05", city: undefined });
    expect(playerExtraPayload({ birth_date: "2000-01-02", nationality: " TR ", player_img: "" })).toEqual({ birth_date: "2000-01-02", nationality: "TR" });
    expect(playerUpdatePayload({ player_name: "Ali", birth_date: "2000-01-02", player_position: "" }, { player_name: "Ali", birth_date: "2000-01-02T00:00:00.000Z", player_position: "Kaleci" })).toEqual({ player_position: null });
  });
});

describe("maç yönetimi · yayın grafikleri", () => {
  it("skorboard ve LED modları sunucu listesiyle birebir", () => {
    expect(OVERLAY_MODES.map((m) => m.key)).toEqual(["scoreboard", "scoreboardv2", "bottomboard", "pre_match", "prematchv2", "lineups", "lineupsv2", "lineupsv3", "halftime", "post_match", "interview"]);
    expect(LED_MODES.map((m) => m.key)).toEqual(["scoreboard", "scoreboardv2", "pre_match", "players", "lineup_home", "lineup_away", "highlights", "mvp", "kare_as", "interview", "var", "var_check", "halftime", "post_match", "sponsor"]);
    expect(overlayModeBody("bottomboard")).toEqual({ status: "bottomboard" });
    expect(ledModeBody("var_check")).toEqual({ status: "var_check" });
    expect(() => overlayModeBody("matchstats")).toThrow();
    expect(currentOverlayMode({ overlay_status: "standings" })).toBe("scoreboard");
    expect(currentOverlayMode({ overlay_status: "lineupsv3" })).toBe("lineupsv3");
    expect(currentLedMode({ led_overlay_status: "mvp" })).toBe("mvp");
    expect(currentLedMode({})).toBe("scoreboard");
  });

  it("önizleme bağlantıları", () => {
    const links = overlayLinks(42);
    expect(links.map((l) => l.url)).toEqual(["https://elitlig.com/skorboard/canli/42", "https://elitlig.com/skoroverlay?match=42", "https://elitlig.com/led/42", "https://elitlig.com/altyazi/42"]);
    expect(overlayLinks(null)).toEqual([]);
  });

  it("yayın durumu: varsayılanlar ve sponsor yayını", () => {
    const desk = normalizeDesk({ state: { seq: 3, subtitle: { speed: "fast", sections: { news: false } }, onAir: { sponsorId: 5, slot: "halftime", durationSec: 15 } }, onAirRemainingMs: 9000, sponsors: [{ id: 5 }] }, 1000);
    expect(desk.state.subtitle).toMatchObject({ speed: "fast", mode: "ticker", showClock: true });
    expect(desk.state.subtitle.sections).toMatchObject({ news: false, custom: true, assists: false });
    expect(desk.onAirEndsAt).toBe(10000);
    expect(normalizeDesk({ state: { onAir: { sponsorId: 5, durationSec: 0 } } }).onAirEndsAt).toBeNull();
    expect(onAirPatch({ id: 5, displaySeconds: 20 }, "lower_third")).toEqual({ onAir: { sponsorId: 5, slot: "lower_third", durationSec: 20 } });
    expect(onAirPatch({ id: 5 }, "fullscreen", "0")).toEqual({ onAir: { sponsorId: 5, slot: "fullscreen", durationSec: 0 } });
  });

  it("altyazı manşetleri", () => {
    expect(addHeadlinePatch({ customHeadlines: [] }, "son dakika", "  Gol yağmuru ")).toEqual({ subtitle: { customHeadlines: [{ tag: "SON DAKİKA", text: "Gol yağmuru" }], sections: { custom: true } } });
    expect(addHeadlinePatch({ customHeadlines: [] }, "", " ")).toBeNull();
    expect(aiHeadlinesPatch([{ text: "a" }], [{ text: "b" }, { text: "" }], "append").subtitle.aiHeadlines).toEqual([{ text: "a" }, { text: "b" }]);
    expect(moveItem([1, 2, 3], 0, 1)).toEqual([2, 1, 3]);
    expect(moveItem([1, 2, 3], 0, -1)).toEqual([1, 2, 3]);
  });

  it("röportaj bandı", () => {
    const p = interviewPerson({ playerId: "7", name: " Ali ", side: "home", teamName: "Kartal" });
    expect(p).toEqual({ playerId: 7, name: "Ali", side: "home", teamName: "Kartal", role: "", image: "" });
    expect(interviewPerson({ name: "" })).toBeNull();
    const patch = interviewPatch({ title: "", variant: "nope", sponsorId: "", people: [p, p, p, p, p] });
    expect(patch.interview).toMatchObject({ title: "RÖPORTAJ", variant: "classic", sponsorId: null });
    expect(patch.interview.people).toHaveLength(4);
  });

  it("maçın enleri", () => {
    const players = [{ id: "7", name: "Ali" }, { id: "9", name: "Veli" }];
    expect(readHighlights({ post_macin_enleri: JSON.stringify({ best_player_id: "7", best_goalkeeper_name: "Veli" }) }, players)).toMatchObject({ best_player: "7", best_goalkeeper: "9", best_save: "" });
    const body = highlightsPayload({ best_player: "7" }, (id) => ({ 7: "Ali" }[id]));
    expect(body.match_mvp).toBe(7);
    expect(JSON.parse(body.post_macin_enleri)).toMatchObject({ best_player_id: "7", best_player_name: "Ali", best_player: "Ali", best_goal_id: "" });
    expect(body.post_enler).toBe(body.post_macin_enleri);
    expect(formatLeft(75000)).toBe("1:15");
    expect(formatLeft(9000)).toBe("9 sn");
  });
});
