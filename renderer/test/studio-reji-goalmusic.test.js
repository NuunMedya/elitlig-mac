import { describe, expect, it } from "vitest";
import {
  GOAL_MUSIC_KEY, MAX_TRACKS, addTrack, fadeLevel, formatTime, normalizeGoalMusic, normalizeTrack, parseTime, parseYoutubeUrl,
  pickTrack, playerArgs, readGoalMusic, teamMusicOf, updateTeamMusic, writeGoalMusic,
} from "../src/views/studio/goalmusic/goalMusic";
import { VAR_DECISIONS, VAR_LAYOUTS, varDecisionPositive, varLayoutV2, varStatus, varSteps } from "../src/lib/studio/var";
import { GOAL_KIND_CODES, PENALTY_MISS, dualPlayerLists, flowButtons, goalBeneficiary, teamActions } from "../src/views/studio/manage/rejiLogic";
import { SERVER_EVENT_CODES } from "../src/lib/studio/manage";
import { bandPreviewSnapshot } from "../src/views/studio/modes/useInterviewMode";

const ID = "dQw4w9WgXcQ";

describe("gol müziği · YouTube bağlantısı", () => {
  it("bilinen biçimler", () => {
    expect(parseYoutubeUrl(`https://www.youtube.com/watch?v=${ID}`)).toEqual({ videoId: ID, start: null });
    expect(parseYoutubeUrl(`https://youtu.be/${ID}?t=83`)).toEqual({ videoId: ID, start: 83 });
    expect(parseYoutubeUrl(`https://youtube.com/shorts/${ID}`)).toEqual({ videoId: ID, start: null });
    expect(parseYoutubeUrl(`https://m.youtube.com/watch?feature=share&v=${ID}&t=1m23s`)).toEqual({ videoId: ID, start: 83 });
    expect(parseYoutubeUrl(`https://music.youtube.com/watch?v=${ID}&list=RD`)).toMatchObject({ videoId: ID });
    expect(parseYoutubeUrl(`https://www.youtube-nocookie.com/embed/${ID}?start=12`)).toEqual({ videoId: ID, start: 12 });
    expect(parseYoutubeUrl(`www.youtube.com/live/${ID}`)).toMatchObject({ videoId: ID });
    expect(parseYoutubeUrl(`youtu.be/${ID}#t=2m`)).toEqual({ videoId: ID, start: 120 });
    expect(parseYoutubeUrl(ID)).toEqual({ videoId: ID, start: null });
    expect(parseYoutubeUrl(`https://www.youtube.com/watch?v=${ID}&t=1:05`)).toEqual({ videoId: ID, start: 65 });
  });
  it("geçersizler", () => {
    expect(parseYoutubeUrl("")).toBeNull();
    expect(parseYoutubeUrl("https://vimeo.com/123")).toBeNull();
    expect(parseYoutubeUrl("https://www.youtube.com/watch?v=kisa")).toBeNull();
    expect(parseYoutubeUrl("https://evil.com/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(parseYoutubeUrl("not a url")).toBeNull();
  });
});

describe("gol müziği · zaman", () => {
  it("parseTime", () => {
    expect(parseTime("83")).toBe(83);
    expect(parseTime("1:23")).toBe(83);
    expect(parseTime("01:02:03")).toBe(3723);
    expect(parseTime("1m23s")).toBe(83);
    expect(parseTime("2h1m")).toBe(7260);
    expect(parseTime("90s")).toBe(90);
    expect(parseTime("1,5")).toBe(1.5);
    expect(parseTime(" 0:07 ")).toBe(7);
    expect(parseTime(42)).toBe(42);
    expect(parseTime("")).toBeNull();
    expect(parseTime("1:75")).toBeNull();
    expect(parseTime("abc")).toBeNull();
    expect(parseTime(-3)).toBeNull();
  });
  it("formatTime", () => {
    expect(formatTime(83)).toBe("1:23");
    expect(formatTime(7)).toBe("0:07");
    expect(formatTime(3723)).toBe("1:02:03");
    expect(formatTime(1.5)).toBe("0:01.5");
    expect(formatTime(null)).toBe("");
    expect(parseTime(formatTime(125.5))).toBe(125.5);
  });
});

describe("gol müziği · ayarlar", () => {
  it("bağlantı normalize: start bağlantıdan, end > start", () => {
    const t = normalizeTrack({ url: `https://youtu.be/${ID}?t=30`, end: "0:20" });
    expect(t).toMatchObject({ videoId: ID, start: 30, end: null });
    expect(normalizeTrack({ url: ID, start: "1:00", end: "1:30" })).toMatchObject({ start: 60, end: 90 });
    expect(normalizeTrack({ url: "x" })).toBeNull();
    expect(playerArgs({ videoId: ID, start: 60, end: 90 })).toEqual({ videoId: ID, startSeconds: 60, endSeconds: 90 });
    expect(playerArgs({ videoId: ID, start: 0, end: null })).toEqual({ videoId: ID, startSeconds: 0 });
  });
  it("takım kimliğine göre saklanır; boş takım düşer; ses sınırlanır", () => {
    let c = normalizeGoalMusic(null);
    expect(c).toMatchObject({ volume: 80, autoOnGoal: false, fadeMs: 1000, teams: {} });
    const r1 = addTrack(c, 12, `https://youtu.be/${ID}?t=1m23s`);
    expect(r1.ok).toBe(true);
    c = r1.config;
    expect(teamMusicOf(c, 12).tracks[0]).toMatchObject({ videoId: ID, start: 83 });
    expect(teamMusicOf(c, 12).activeId).toBe(r1.track.id);
    expect(addTrack(c, 12, "geçersiz").ok).toBe(false);
    expect(addTrack(c, null, ID).ok).toBe(false);
    c = updateTeamMusic(c, 12, (t) => ({ ...t, tracks: [] }));
    expect(c.teams["12"]).toBeUndefined();
    expect(normalizeGoalMusic({ volume: 140, autoOnGoal: 1 })).toMatchObject({ volume: 100, autoOnGoal: true });
    expect(normalizeGoalMusic({ teams: { undefined: { tracks: [ID] }, 5: { tracks: [ID, "bozuk"] } } }).teams).toEqual({ 5: expect.objectContaining({ tracks: [expect.objectContaining({ videoId: ID })] }) });
  });
  it("en çok MAX_TRACKS bağlantı", () => {
    let c = normalizeGoalMusic(null);
    for (let i = 0; i < MAX_TRACKS + 2; i += 1) c = addTrack(c, 1, ID).config;
    expect(teamMusicOf(c, 1).tracks).toHaveLength(MAX_TRACKS);
  });
  it("seçim: etkin / rastgele / sırayla", () => {
    let c = normalizeGoalMusic(null);
    const ids = ["aaaaaaaaaaa", "bbbbbbbbbbb", "ccccccccccc"];
    ids.forEach((v) => { c = addTrack(c, 7, v).config; });
    const team = teamMusicOf(c, 7);
    expect(pickTrack(team).track.videoId).toBe("aaaaaaaaaaa");
    expect(pickTrack({ ...team, activeId: team.tracks[2].id }).track.videoId).toBe("ccccccccccc");
    expect(pickTrack({ ...team, mode: "random" }, () => 0.5).track.videoId).toBe("bbbbbbbbbbb");
    expect(pickTrack({ ...team, mode: "random" }, () => 0.9999).track.videoId).toBe("ccccccccccc");
    let rot = { ...team, mode: "rotate", rotate: 0 };
    const seen = [];
    for (let i = 0; i < 4; i += 1) { const p = pickTrack(rot); seen.push(p.track.videoId[0]); rot = p.next; }
    expect(seen.join("")).toBe("abca");
    expect(pickTrack({ tracks: [] })).toBeNull();
  });
  it("ses azaltma eğrisi 1 sn'de sıfıra iner", () => {
    expect(fadeLevel(80, 0)).toBe(80);
    expect(fadeLevel(80, 0.5)).toBe(20);
    expect(fadeLevel(80, 1)).toBe(0);
    expect(fadeLevel(80, 3)).toBe(0);
  });
  it("localStorage'a yazılır / okunur", () => {
    const mem = new Map();
    const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
    const c = addTrack(normalizeGoalMusic({ volume: 55, autoOnGoal: true }), 3, ID).config;
    expect(writeGoalMusic(storage, c)).toBe(true);
    expect(mem.has(GOAL_MUSIC_KEY)).toBe(true);
    expect(readGoalMusic(storage)).toEqual(c);
    expect(readGoalMusic({ getItem: () => "{bozuk" })).toEqual(normalizeGoalMusic(null));
  });
});

describe("VAR · kırmızı çerçeve yerleşimi", () => {
  const W = 1920; const H = 1080;
  const inside = (a, b) => a.x >= b.x - 0.5 && a.y >= b.y - 0.5 && a.x + a.w <= b.x + b.w + 0.5 && a.y + a.h <= b.y + b.h + 0.5;
  const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  it("çerçeve ekranı sarar; raylar, üst / alt bant ve pencereler çakışmaz", () => {
    for (const l of VAR_LAYOUTS) {
      const L = varLayoutV2(l.key, W, H);
      expect(L.frame.x).toBeGreaterThan(0);
      expect(L.frame.x + L.frame.w).toBeLessThan(W);
      expect(inside(L.header, L.frame)).toBe(true);
      expect(inside(L.footer, L.frame)).toBe(true);
      expect(L.rails).toHaveLength(2);
      for (const r of L.rails) {
        expect(overlap(r, L.header)).toBe(false);
        expect(overlap(r, L.footer)).toBe(false);
        expect(overlap(r, L.stage)).toBe(false);
      }
      expect(L.footer.w).toBe(L.header.w); // alt bant raydan raya
      for (const p of L.panes) {
        expect(inside(p.rect, L.stage)).toBe(true);
        expect(overlap(p.rect, L.header)).toBe(false);
        expect(overlap(p.rect, L.footer)).toBe(false);
        L.rails.forEach((r) => expect(overlap(p.rect, r)).toBe(false));
      }
    }
  });
  it("küçük çıkışta da (640×360) aynı oranlar", () => {
    const a = varLayoutV2("two", 640, 360);
    const b = varLayoutV2("two", 1920, 1080);
    expect(a.panes[0].rect.w / 640).toBeCloseTo(b.panes[0].rect.w / 1920, 1);
  });
  it("durum adımları ve karar simgesi", () => {
    expect(varSteps("review").map((s) => [s.label, s.on, s.done])).toEqual([["İNCELEME", true, false], ["KONTROL", false, false], ["KARAR", false, false]]);
    expect(varSteps("decision").filter((s) => s.done)).toHaveLength(2);
    expect(VAR_DECISIONS.map((d) => d.label)).toEqual(expect.arrayContaining(["GOL", "GOL İPTAL", "PENALTI", "KIRMIZI KART", "DEVAM"]));
    expect(varDecisionPositive("goalOn")).toBe(true);
    expect(varDecisionPositive("goalOff")).toBe(false);
    expect(varStatus({ state: "decision", decision: "red" }).text).toBe("KIRMIZI KART");
  });
});

describe("reji · ayna sütunlar", () => {
  it("takım eylemleri sunucunun tanıdığı kodlar; penaltı kaçtı açıklamalı", () => {
    const a = teamActions();
    expect(a.goal.code).toBe("GOAL_RIGHT_FOOT");
    const keys = a.main.map((x) => x.key);
    expect(keys).toEqual(["own", "assist", "yellow", "red", "penGoal", "penMiss", "sub", "foul"]);
    [...a.main, ...a.rest].forEach((x) => expect(SERVER_EVENT_CODES.has(x.code)).toBe(true));
    expect(a.main.find((x) => x.key === "penMiss")).toMatchObject({ code: PENALTY_MISS.code, note: "Penaltı kaçtı" });
    expect(a.rest.some((x) => x.code === "SAVE")).toBe(true);
    expect(a.rest.some((x) => x.code.startsWith("GOAL_"))).toBe(false);
    expect(GOAL_KIND_CODES).not.toContain("GOAL_OWN");
  });
  it("golden yararlanan: kendi kalesine rakibe", () => {
    expect(goalBeneficiary("home", "GOAL_HEADER")).toBe("home");
    expect(goalBeneficiary("home", "GOAL_OWN")).toBe("away");
    expect(goalBeneficiary("away", "goal_own")).toBe("home");
  });
  it("maç akışı düğmeleri aşamaya göre", () => {
    const on = (phase, o) => flowButtons(phase, o).filter((b) => b.enabled).map((b) => b.key);
    const next = (phase, o) => flowButtons(phase, o).find((b) => b.next)?.key;
    expect(on("notStarted")).toEqual(["start"]);
    expect(flowButtons("notStarted")[0].label).toBe("Maçı başlat");
    expect(on("first", { period: 1, running: true })).toEqual(["pause", "halftime", "finish"]);
    expect(next("first", { period: 1, running: true })).toBe("halftime");
    expect(on("halftime", { period: 1 })).toEqual(["second", "finish"]);
    expect(next("halftime", { period: 1 })).toBe("second");
    expect(on("second", { period: 2, running: true })).toEqual(["pause", "extra", "finish"]);
    expect(next("second", { period: 2, running: true })).toBe("finish");
    expect(on("paused", { period: 2 })).toEqual(["start", "extra", "finish"]);
    expect(flowButtons("paused", { period: 2 })[0].label).toBe("Sürdür");
    expect(on("finished")).toEqual([]);
  });
  it("takım seçmeden: iki takım, ilk 11 önce, arama", () => {
    const squads = { home: [{ id: 1, name: "Ali", number: "9", role: "bench" }, { id: 2, name: "Can", number: "1", role: "starter" }], away: [{ id: 3, name: "Veli", number: "10", role: "starter" }] };
    const all = dualPlayerLists(squads);
    expect(all.home.map((p) => p.id)).toEqual([2, 1]);
    expect(all.away.map((p) => p.id)).toEqual([3]);
    expect(dualPlayerLists(squads, "10")).toEqual({ home: [], away: [squads.away[0]] });
    expect(dualPlayerLists(squads, "al").home.map((p) => p.id)).toEqual([1]);
  });
});

describe("röportaj · bant önizlemesi", () => {
  it("yalnız bant (skorbord / altyazı kapalı, görünürlük süzgeci yok)", () => {
    const snap = { variant: "scoreboard", visibility: { interview: ["s1"] }, subtitle: { onAir: true }, interview: { onAir: false, people: [{ name: "A" }] } };
    const pv = bandPreviewSnapshot(snap);
    expect(pv).toMatchObject({ variant: "off", hideScorebug: true, hideSubtitle: true, hideInterview: false, visibility: null });
    expect(pv.subtitle.onAir).toBe(false);
    expect(pv.interview.onAir).toBe(true);
    expect(snap.interview.onAir).toBe(false); // değiştirilmez
    expect(bandPreviewSnapshot(null)).toBeNull();
  });
});
