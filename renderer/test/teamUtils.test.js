import { cityCounts, groupByTeam, matchLine, matchResult, memberTeam, phonesText, pushRecent, recordText, teamContacts, teamCsv, teamGroupUserIds, teamInitials, teamMeta, teamVCards, waLinks, winRate } from "../src/lib/teamUtils";

const detail = {
  team: { team_id: 1, team_name: "Kartallar FK", city: "Ankara", league: "Süper Lig", season: "2026 Güz", record: { wins: 18, draws: 4, losses: 8 } },
  captains: [{ id: 10, name: "Murat Başkan", phone: "05320000001", email: "murat@x.test", city: "Ankara" }],
  players: [
    { player_id: 100, name: "Ali Kaya", position: "Forvet", account: { id: 11, name: "Ali Kaya", phone: "0532 000 00 02", city: "Ankara" } },
    { player_id: 101, name: "Murat B.", account: { id: 10, name: "Murat Başkan", phone: "05320000001" } },
    { player_id: 102, name: "Hasan Öz", account: null },
  ],
};

test("rekor, oran, üst bilgi, baş harfler", () => {
  expect(recordText(detail.team.record)).toBe("18G 4B 8M");
  expect(recordText({})).toBe("");
  expect(winRate(detail.team.record)).toBe(60);
  expect(winRate({})).toBe(null);
  expect(teamMeta(detail.team)).toBe("Ankara · Süper Lig · 2026 Güz");
  expect(teamInitials("Kartallar FK")).toBe("KF");
  expect(teamInitials("İzmir")).toBe("İ");
});

test("takım iletişim listesi: başkanlar önce, tekrarsız, hesabı olmayan oyuncu yok", () => {
  const list = teamContacts(detail);
  expect(list.map((c) => [c.name, c.role])).toEqual([["Murat Başkan", "Takım başkanı"], ["Ali Kaya", "Oyuncu"]]);
  expect(teamGroupUserIds(detail, [10])).toEqual([11]);
  expect(phonesText(list)).toBe("Murat Başkan (Takım başkanı): 0532 000 00 01\nAli Kaya (Oyuncu): 0532 000 00 02");
  expect(waLinks(list)[1].url).toBe("https://wa.me/905320000002");
  expect(teamCsv(detail).split("\r\n")).toEqual([
    "Takım,Ad soyad,Rol,Mevki,Telefon,E-posta,İl",
    "Kartallar FK,Murat Başkan,Takım başkanı,,05320000001,murat@x.test,Ankara",
    "Kartallar FK,Ali Kaya,Oyuncu,Forvet,0532 000 00 02,,Ankara",
  ]);
  expect(teamVCards(detail)).toContain("ORG:Kartallar FK");
});

test("maç satırı ve sonuç", () => {
  expect(matchLine({ home: "A", away: "B", home_score: 3, away_score: 1 })).toBe("A 3–1 B");
  expect(matchLine({ home: "A", away: "B" })).toBe("A – B");
  expect(matchResult({ home_score: 1, away_score: 2, is_home: false })).toBe("G");
  expect(matchResult({ home_score: 1, away_score: 1, is_home: true })).toBe("B");
  expect(matchResult({ home_score: null, away_score: 1 })).toBe(null);
});

test("üye listesi takıma göre gruplanır; il sayıları; son bakılanlar", () => {
  expect(memberTeam({ player: { team: "Ege" } })).toBe("Ege");
  expect(memberTeam({ team: { name: "Kartallar FK" }, player: { team: "Ege" } })).toBe("Kartallar FK");
  const groups = groupByTeam([{ n: 1, team: "Zafer" }, { n: 2 }, { n: 3, team: "Ankara FK" }, { n: 4, team: "Zafer" }]);
  expect(groups.map(([k, l]) => [k, l.length])).toEqual([["Ankara FK", 1], ["Zafer", 2], ["Takımsız", 1]]);
  expect(cityCounts([{ city: "İzmir" }, { city: "Ankara" }, { city: "Ankara" }, {}])).toEqual([{ city: "Ankara", count: 2 }, { city: "İzmir", count: 1 }]);
  expect(pushRecent([{ team_id: 1 }, { team_id: 2 }], { team_id: 2, x: 1 }, 2)).toEqual([{ team_id: 2, x: 1 }, { team_id: 1 }]);
});
