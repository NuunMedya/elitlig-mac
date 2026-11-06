import { GOAL_CHAPTER_AFTER_MS, GOAL_CHAPTER_BEFORE_MS, RESUME_LABEL, buildChapters, chapterRules, chapterSegments, goalChapterLabel, goalScoreAfter, normalizeChapters, scoreLabel } from "../src/views/studio/youtube/chapters";
import { createGoalTaps } from "../src/views/studio/youtube/goalTaps";
import { DEFAULT_SETTINGS, loadSettings, normalizeSettings, patchSettings } from "../src/views/studio/settings/settings";
import { REPLAY_SECONDS } from "../src/lib/studio/replays";

describe("tekrar varsayılan süresi 15 sn", () => {
  it("yeni kurulum 15 sn; eski (v1) varsayılan 10 → 15; başka süre ve v2'de bilerek seçilen 10 korunur", () => {
    expect(REPLAY_SECONDS).toBe(15);
    expect(DEFAULT_SETTINGS.replay.seconds).toBe(15);
    expect(normalizeSettings(null).replay.seconds).toBe(15);
    expect(normalizeSettings({ v: 1, replay: { seconds: 10 } }).replay.seconds).toBe(15);
    expect(normalizeSettings({ replay: { seconds: 10 } }).replay.seconds).toBe(15); // sürümsüz = v1
    expect(normalizeSettings({ v: 1, replay: { seconds: 20 } }).replay.seconds).toBe(20);
    const s = patchSettings(normalizeSettings(null), "replay", { seconds: 10 });
    expect(s.v).toBe(2);
    expect(s.replay.seconds).toBe(10);
    expect(normalizeSettings(JSON.parse(JSON.stringify(s))).replay.seconds).toBe(10);
    const store = { getItem: () => JSON.stringify({ v: 1, replay: { seconds: 10 } }) };
    expect(loadSettings(store).replay.seconds).toBe(15);
  });
});

const G = (scorer, homeScore, awayScore, extra = {}) => ({ home: "Yazici FK", away: "Yazici Team", homeScore, awayScore, scorer, ...extra });
const goal = (atMs, g, extra = {}) => ({ atMs, kind: "goal", label: goalChapterLabel(g), goal: g, ...extra });
const MIN = 60_000;

describe("YouTube bölümleri: gol adı ve skor", () => {
  it("ad biçimi: '<Ev> 1 - 0 <Dep> | Gol: <Golcü>'; kendi kalesine '(k.k.)'", () => {
    expect(goalChapterLabel(G("Civan Ünver", 1, 0))).toBe("Yazici FK 1 - 0 Yazici Team | Gol: Civan Ünver");
    expect(goalChapterLabel(G("Ali Kaya", 1, 1, { own: true }))).toBe("Yazici FK 1 - 1 Yazici Team | Gol: Ali Kaya (k.k.)");
    expect(goalChapterLabel(G(null, 2, 0))).toBe("Yazici FK 2 - 0 Yazici Team | Gol");
    expect(scoreLabel(G("x", 2, 1))).toBe("Yazici FK 2 - 1 Yazici Team");
    expect(scoreLabel(null)).toBe(RESUME_LABEL);
  });

  it("uzun takım adlarında golcü korunur, ad 80 karakteri geçmez", () => {
    const l = goalChapterLabel({ home: "Çok Uzun Adlı Amatör Spor Kulübü Futbol Takımı", away: "Bir Başka Çok Uzun Adlı Gençlik ve Spor Kulübü", homeScore: 3, awayScore: 2, scorer: "Abdurrahman Yıldırımoğlu" });
    expect(l.length).toBeLessThanOrEqual(80);
    expect(l.endsWith("| Gol: Abdurrahman Yıldırımoğlu")).toBe(true);
  });

  it("golden SONRAKİ skor: olaylardan yeniden sayılır (kendi kalesine rakibe), yoksa önceki skora eklenir", () => {
    const events = [{ id: 1, olay_kodu: "GOAL_RIGHT_FOOT", takim_id: 10 }];
    const created = { id: 2, olay_kodu: "GOAL_HEADER", takim_id: 20 };
    expect(goalScoreAfter({ events, created, homeTeamId: 10, awayTeamId: 20 })).toEqual({ home: 1, away: 1 });
    // olay listesi yeni golü zaten içeriyorsa iki kez sayılmaz
    expect(goalScoreAfter({ events: [...events, created], created, homeTeamId: 10, awayTeamId: 20 })).toEqual({ home: 1, away: 1 });
    // kendi kalesine (ev sahibi oyuncusu) → deplasmana
    expect(goalScoreAfter({ events, created: { id: 3, olay_kodu: "GOAL_OWN", takim_id: 10 }, homeTeamId: 10, awayTeamId: 20 })).toEqual({ home: 1, away: 1 });
    // elle skor / olay yok: önceki skora +1
    expect(goalScoreAfter({ manual: true, score: { home: 2, away: 0 }, side: "away", code: "GOAL_RIGHT_FOOT" })).toEqual({ home: 2, away: 1 });
    expect(goalScoreAfter({ score: { home: 0, away: 0 }, side: "home", code: "GOAL_OWN" })).toEqual({ home: 0, away: 1 });
  });
});

describe("YouTube bölümleri: 45 sn'lik gol penceresi", () => {
  it("gol bölümü basıştan 15 sn önce başlar, 30 sn sonra maç devam eder", () => {
    expect(GOAL_CHAPTER_BEFORE_MS).toBe(15_000);
    expect(GOAL_CHAPTER_AFTER_MS).toBe(30_000);
    const list = buildChapters([goal(10 * MIN, G("Civan Ünver", 1, 0))]);
    expect(list).toEqual([
      { at_ms: 0, label: "Başlangıç" },
      { at_ms: 10 * MIN - 15_000, label: "Yazici FK 1 - 0 Yazici Team | Gol: Civan Ünver" },
      { at_ms: 10 * MIN + 30_000, label: "Yazici FK 1 - 0 Yazici Team" },
    ]);
    expect(list[2].at_ms - list[1].at_ms).toBe(45_000);
    expect(chapterRules(list).ok).toBe(true);
  });

  it("araya başka bölüm girerse devam bölümü konmaz; o bölüm gol bölümünü keser", () => {
    const list = buildChapters([goal(10 * MIN, G("A", 1, 0)), { atMs: 10 * MIN + 20_000, label: "Devre arası", kind: "mark" }]);
    expect(list.map((c) => c.label)).toEqual(["Başlangıç", "Yazici FK 1 - 0 Yazici Team | Gol: A", "Devre arası"]);
    expect(list[2].at_ms).toBe(10 * MIN + 20_000);
  });

  it("iki gol 45 sn içinde: ilki ikincinin başlangıcına kadar sürer, devam bölümü yalnız sonda", () => {
    const list = buildChapters([goal(10 * MIN, G("A", 1, 0)), goal(10 * MIN + 25_000, G("B", 2, 0))]);
    expect(list).toEqual([
      { at_ms: 0, label: "Başlangıç" },
      { at_ms: 10 * MIN - 15_000, label: "Yazici FK 1 - 0 Yazici Team | Gol: A" },
      { at_ms: 10 * MIN + 10_000, label: "Yazici FK 2 - 0 Yazici Team | Gol: B" },
      { at_ms: 10 * MIN + 55_000, label: "Yazici FK 2 - 0 Yazici Team" },
    ]);
    expect(chapterRules(list).ok).toBe(true);
  });

  it("10 sn'den yakın iki gol tek bölümde birleşir: son skor, golcüler sırayla", () => {
    const list = buildChapters([goal(20 * MIN, G("Civan Ünver", 1, 0)), goal(20 * MIN + 6_000, G("Ali Kaya", 1, 1, { own: true }))]);
    expect(list).toEqual([
      { at_ms: 0, label: "Başlangıç" },
      { at_ms: 20 * MIN - 15_000, label: "Yazici FK 1 - 1 Yazici Team | Gol: Civan Ünver, Ali Kaya (k.k.)" },
      { at_ms: 20 * MIN + 36_000, label: "Yazici FK 1 - 1 Yazici Team" },
    ]);
  });

  it("devam bölümünden hemen sonra (10 sn içinde) başlayan bölüm devamın yerini alır", () => {
    // Gol 1: 10:00 → devam 10:30; gol 2'ye 10:52'de basıldı → 10:37'de başlar (devamdan 7 sn sonra).
    const list = buildChapters([goal(10 * MIN, G("A", 1, 0)), goal(10 * MIN + 52_000, G("B", 1, 1))]);
    expect(list.map((c) => c.at_ms)).toEqual([0, 10 * MIN - 15_000, 10 * MIN + 37_000, 10 * MIN + 82_000]);
    expect(list.map((c) => c.label)).not.toContain("Yazici FK 1 - 0 Yazici Team");
    expect(chapterRules(list).ok).toBe(true);
  });

  it("gol ile yakın işaret: gol kalır (işaret adı düşer); ilk 15 sn'deki gol 0:00'dan başlar", () => {
    const list = buildChapters([{ atMs: 5 * MIN - 12_000, label: "Tekrar", kind: "mark" }, goal(5 * MIN, G("A", 1, 0))]);
    expect(list[1]).toEqual({ at_ms: 5 * MIN - 15_000, label: "Yazici FK 1 - 0 Yazici Team | Gol: A" });
    expect(list.map((c) => c.label)).not.toContain("Tekrar");
    const early = buildChapters([goal(8_000, G("Erken", 1, 0))]);
    expect(early[0]).toEqual({ at_ms: 0, label: "Yazici FK 1 - 0 Yazici Team | Gol: Erken" });
    expect(early[1]).toEqual({ at_ms: 38_000, label: "Yazici FK 1 - 0 Yazici Team" });
  });

  it("elle yeniden adlandırılan gol kayıtlı adını korur", () => {
    const list = buildChapters([goal(10 * MIN, G("A", 1, 0), { label: "Muhteşem frikik golü", custom: true })]);
    expect(list[1]).toEqual({ at_ms: 10 * MIN - 15_000, label: "Muhteşem frikik golü" });
  });

  it("segmentler sıralı; işaret ve eski biçim (tür yok) eskisi gibi birleşir", () => {
    const segs = chapterSegments([goal(3 * MIN, G("A", 1, 0)), { atMs: MIN, label: "İlk yarı" }]);
    expect(segs.map((x) => x.kind)).toEqual(["mark", "goal", "resume"]);
    expect(normalizeChapters([{ atMs: 1000, label: "A" }, { atMs: 4000, label: "B" }])).toEqual([{ at_ms: 0, label: "A · B" }]);
  });
});

describe("GOL'e basılan anlar", () => {
  it("olay kaydedilince aynı taraftaki en eski basış, yoksa tarafsız / en eski; vazgeçilen düşer; 3 dk sonra silinir", () => {
    let t = 1_000;
    const taps = createGoalTaps({ now: () => t });
    taps.tap("home");
    t = 2_000; taps.tap("away");
    t = 3_000; taps.tap(null);
    expect(taps.take("away")).toBe(2_000);
    expect(taps.take("away")).toBe(3_000); // tarafsız (olay girişi)
    expect(taps.take("away")).toBe(1_000); // kendi kalesine: farklı taraf
    expect(taps.take("home")).toBe(null);
    taps.tap("home");
    expect(taps.drop("home")).toBe(true);
    expect(taps.size()).toBe(0);
    taps.tap("home");
    t += 181_000;
    expect(taps.take("home")).toBe(null);
  });
});
