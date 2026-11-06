// Maç sonu · maçın golü / kurtarışı (olay + tekrar klibi) ve Reji olay grupları.
import { POST_HIGHLIGHT_FIELDS, SERVER_EVENT_CODES, buildPostPayload, quickEventCatalog, rejiEventGroups } from "../src/lib/studio/manage";
import {
  awardsJson, highlightsPayload, momentCandidates, momentFromCandidate, readHighlights, readMoments,
} from "../src/lib/studio/manageBroadcast";

const names = { 7: "Ali", 8: "Veli", 9: "Kaleci Can" };
const nameOf = (id) => names[id] || "";
const events = [
  { id: 11, olay_kodu: "GOAL_HEADER", takim_id: 10, oyuncu_id: 7, dakika: 23, devre: 1 },
  { id: 12, olay_kodu: "GOAL_OWN", takim_id: 20, oyuncu_id: 8, dakika: 30, devre: 1 },
  { id: 13, olay_kodu: "SAVE", takim_id: 20, oyuncu_id: 9, dakika: 41, devre: 2 },
  { id: 14, olay_kodu: "GOAL_PENALTY", takim_id: 20, oyuncu_id: 8, dakika: 5, devre: 2 },
  { id: 15, olay_kodu: "YELLOW_CARD", takim_id: 10, oyuncu_id: 7, dakika: 2, devre: 1 },
];
const replays = [{ id: "rp1", eventId: 11, kind: "goal", angles: [{ angle: "program", url: "file:///clips/a.mp4", posterUrl: "file:///clips/a.jpg" }] }];
const clips = [{ id: 3, event_id: 14, player_id: 8, minute: 5, url: "https://cdn/x.mp4", poster_url: "https://cdn/x.jpg" }];

describe("maçın golü / kurtarışı · adaylar", () => {
  it("goller (kendi kalesine hariç) kronolojik; tekrar ve sunucu klibi eşleşir", () => {
    const list = momentCandidates(events, { kind: "goal", homeTeamId: 10, awayTeamId: 20, nameOf, replays, clips });
    expect(list.map((c) => c.eventId)).toEqual([11, 14]);
    expect(list[0]).toMatchObject({ side: "home", playerName: "Ali", minute: 23, playUrl: "file:///clips/a.mp4", posterUrl: "file:///clips/a.jpg", clipUrl: null, hasClip: true });
    expect(list[1]).toMatchObject({ side: "away", playerName: "Veli", clipUrl: "https://cdn/x.mp4", posterSaveUrl: "https://cdn/x.jpg" });
  });
  it("kurtarışlar yalnız SAVE olaylarından", () => {
    const list = momentCandidates(events, { kind: "save", homeTeamId: 10, awayTeamId: 20, nameOf });
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ eventId: 13, playerId: "9", hasClip: false, posterUrl: null });
  });
  it("aday → an: yerel (file://) adresler sunucuya yazılmaz", () => {
    const [local, server] = momentCandidates(events, { kind: "goal", homeTeamId: 10, awayTeamId: 20, nameOf, replays, clips });
    expect(momentFromCandidate(local)).toEqual({ event_id: 11, minute: 23, period: 1, team_id: 10, code: "GOAL_HEADER", clip_url: null, poster_url: null, player_id: 7 });
    expect(momentFromCandidate(server)).toMatchObject({ event_id: 14, clip_url: "https://cdn/x.mp4", poster_url: "https://cdn/x.jpg" });
  });
});

describe("post_macin_enleri · geriye uyumlu biçim", () => {
  const moment = { event_id: 14, minute: 5, period: 2, team_id: 20, code: "GOAL_PENALTY", clip_url: "https://cdn/x.mp4", poster_url: "https://cdn/x.jpg", player_id: 8 };
  it("an seçilince best_goal nesne, düz _id / _name alanları korunur", () => {
    const body = buildPostPayload({}, { best_player: "7", best_goal: "8" }, nameOf, { best_goal: moment });
    const award = JSON.parse(body.post_macin_enleri);
    expect(body.post_enler).toBe(body.post_macin_enleri);
    expect(Object.keys(award)).toHaveLength(POST_HIGHLIGHT_FIELDS.length * 3); // anahtar sayısı değişmez
    expect(award.best_goal_id).toBe("8");
    expect(award.best_goal_name).toBe("Veli");
    expect(award.best_goal).toEqual({ ...moment, id: "8", name: "Veli", player_id: 8, player_name: "Veli" });
    expect(award.best_player).toBe("Ali"); // diğer ödüller eskisi gibi dizgi
    expect(award.best_save).toBe("");
  });
  it("an seçilmezse eski biçim (dizgi) aynen", () => {
    const award = JSON.parse(buildPostPayload({}, { best_goal: "7" }, nameOf).post_macin_enleri);
    expect(award).toMatchObject({ best_goal_id: "7", best_goal_name: "Ali", best_goal: "Ali" });
  });
  it("oyuncusuz an: ad boş kalmaz (web düz addan okur)", () => {
    const award = awardsJson({ best_save: "" }, nameOf, { best_save: { event_id: 13, minute: 41 } });
    expect(award.best_save_name).toBe("41' kurtarış");
    expect(award.best_save).toMatchObject({ event_id: 13, name: "41' kurtarış", player_id: null });
  });
  it("ödül başka oyuncuya verildiyse eski an atılır", () => {
    const award = awardsJson({ best_goal: "7" }, nameOf, { best_goal: moment });
    expect(award.best_goal).toBe("Ali");
  });
  it("okuma: nesne biçimi ve eski biçim birlikte; anlar ayrıca okunur", () => {
    const json = JSON.stringify(awardsJson({ best_goal: "8", best_player: "7" }, nameOf, { best_goal: moment }));
    const players = [{ id: "7", name: "Ali" }, { id: "8", name: "Veli" }];
    expect(readHighlights({ post_macin_enleri: json }, players)).toMatchObject({ best_goal: "8", best_player: "7", best_save: "" });
    expect(readMoments({ post_macin_enleri: json })).toEqual({ best_goal: moment, best_save: null });
    // yalnız nesne (düz alan yok) → kimlik nesneden
    expect(readHighlights({ post_enler: JSON.stringify({ best_goal: { id: 8, name: "Veli", event_id: 14 } }) }, players).best_goal).toBe("8");
    // eski kayıt: yalnız ad
    expect(readHighlights({ post_macin_enleri: JSON.stringify({ best_goal: "Veli" }) }, players).best_goal).toBe("8");
    expect(readMoments({ post_macin_enleri: JSON.stringify({ best_goal: "Veli" }) }).best_goal).toBeNull();
  });
  it("LED masası (highlightsPayload) kayıtlı anı korur", () => {
    const saved = { post_macin_enleri: JSON.stringify(awardsJson({ best_goal: "8" }, nameOf, { best_goal: moment })) };
    const body = highlightsPayload({ best_goal: "8", best_player: "9" }, nameOf, readMoments(saved));
    const award = JSON.parse(body.post_macin_enleri);
    expect(award.best_goal.event_id).toBe(14);
    expect(award.best_player).toBe("Kaleci Can");
    expect(body.match_mvp).toBe(9);
  });
});

describe("Reji · olay grupları", () => {
  it("Goller, Kartlar, Değişiklik, Diğer; sunucunun tanıdığı her kod bir kez", () => {
    const groups = rejiEventGroups();
    expect(groups.map((g) => g.title)).toEqual(["Goller", "Kartlar", "Değişiklik", "Diğer"]);
    const codes = groups.flatMap((g) => g.items.map((i) => i.code));
    const catalog = quickEventCatalog().flatMap((g) => g.items.map((i) => i.code));
    expect(new Set(codes).size).toBe(codes.length);
    expect([...codes].sort()).toEqual([...catalog].sort());
    expect(codes.every((c) => SERVER_EVENT_CODES.has(c))).toBe(true);
    expect(groups[1].items.map((i) => i.code)).toEqual(["YELLOW_CARD", "RED_CARD"]);
    expect(groups[0].items.find((i) => i.code === "GOAL_HEADER")).toMatchObject({ input: "goal", short: "Kafa" });
    expect(groups[2].items[0]).toMatchObject({ code: "SUBSTITUTION", input: "sub" });
  });
});
