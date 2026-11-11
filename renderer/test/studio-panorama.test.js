// Yayın Stüdyosu · PANORAMA kipi: veri (toplu uç + herkese açık uçlardan kurma), model (düzenler,
// açılar → sahneler, kart döngüsü, şablonlar, alt bant), çizim (program tuvaline grafik katmanı
// olarak; drawGraphics yönlendirmesi), yayın türü seçimi.
import {
  EMPTY_PANORAMA_DATA, buildFromPublic, dataImageUrls, fetchPanoramaData, istanbulToday, normalizePanoramaData, splitMatches, weeklyFromPublic,
} from "../src/lib/studio/panorama/data";
import {
  BUILTIN_TEMPLATES, CARD_KINDS, PANORAMA_LAYOUTS, applyTemplate, buildPanoramaScenes, buildPanoramaSnapshot, cardPayload, currentCard, defaultPanoramaState,
  fillSlots, loadPanoramaState, makeCard, normalizeAngle, normalizePanoramaState, normalizePlaylist, panoramaImageUrls, pinCard, remainingSec,
  savePanoramaState, sceneBoxes, stepCard, templateFromState, tickPlaylist, tickerItems,
} from "../src/lib/studio/panorama/model";
import { cardLayerKey, drawPanorama, pageOf, tickerShift } from "../src/lib/studio/panorama/draw";
import { drawGraphics } from "../src/lib/studio/graphics/draw";
import { snapshotImageUrls } from "../src/lib/studio/graphics/snapshot";
import { readStudioMode } from "../src/views/studio/panorama/ModeGate";
import { ingestOf } from "../src/views/studio/panorama/PanoramaStudio";

const mem = (init = {}) => { const m = new Map(Object.entries(init)); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };

/* Ham /maclar ve /api/standings satırları (üretimden kısaltılmış). */
const LEGACY = [
  { id: 11032, first_team_name: "VADİNİN ASLANLARI", second_team_name: "CAPITAL FC", first_team_score: 0, second_team_score: 0, date: "2026-11-12T00:00:00.000Z", time: "21:30:00", match_field: "OSTİM 1", home_team_id: 476, away_team_id: 610, mac_durumu: "zamanlandi" },
  { id: 11001, first_team_name: "ESKİ", second_team_name: "FİKSTÜR", date: "2026-10-01T00:00:00.000Z", time: "20:00:00", mac_durumu: "zamanlanmis" },
  { id: 10990, first_team_name: "CAPITAL FC", second_team_name: "NO MERCY", first_team_score: 8, second_team_score: 2, date: "2026-11-08T00:00:00.000Z", time: "20:00:00", home_team_id: 610, away_team_id: 7, mac_durumu: "yayinlanmis" },
  { id: 10995, first_team_name: "A", second_team_name: "B", first_team_score: 1, second_team_score: 1, date: "2026-11-09T00:00:00.000Z", time: "19:00:00", mac_durumu: "bitti" },
  { id: 11050, first_team_name: "CANLI A", second_team_name: "CANLI B", first_team_score: 2, second_team_score: 1, date: "2026-11-10T00:00:00.000Z", time: "21:00:00", mac_durumu: "canli" },
  { id: 11060, first_team_name: "TASLAK", second_team_name: "X", mac_durumu: "taslak" },
];
const STANDINGS = { standings_type: "gucdengesi", standings: [{ team_id: 610, team_name: "CAPITAL FC", logo: "https://x/610.png", played: 33, wins: 28, draws: 3, losses: 2, goals_for: 252, goals_against: 110, goal_diff: 142, total_points: 87, display_points: 94, last5: "WWWWW" }, { team_id: 476, team_name: "VADİNİN ASLANLARI", logo: "https://x/476.png", played: 10, wins: 2, draws: 1, losses: 7, goals_for: 30, goals_against: 60, goal_diff: -30, display_points: 7, last5: "LLWDL" }] };

describe("panorama · veri", () => {
  it("İstanbul günü", () => {
    expect(istanbulToday(new Date("2026-11-09T22:30:00Z"))).toBe("2026-11-10");
  });
  it("maçlar: bugünden itibaren fikstür, en yeni sonuçlar, canlılar; taslak yok; armalar puan tablosundan", () => {
    const crests = new Map([[610, "https://x/610.png"]]);
    const s = splitMatches(LEGACY, { today: "2026-11-10", crests });
    expect(s.fixtures.map((m) => m.id)).toEqual([11032]);
    expect(s.fixtures[0]).toMatchObject({ date: "2026-11-12", time: "21:30", awayLogo: "https://x/610.png", homeLogo: null });
    expect(s.results.map((m) => m.id)).toEqual([10995, 10990]);
    expect(s.live.map((m) => m.id)).toEqual([11050]);
  });
  it("herkese açık uçlardan toplu veri (sunucu ucuyla aynı biçim)", () => {
    const d = buildFromPublic({
      cities: [{ id: 1, label: "Ankara" }], leagues: [{ id: 1, label: "FREELİG" }], seasons: [{ id: 160, label: "15. SEZON" }],
      scope: { cityId: 1, leagueId: 1, seasonId: 160 }, standings: STANDINGS, matches: LEGACY,
      scorers: [{ playerId: 5307, playerName: "Doğukan YILDIRIM", playerImage: "https://x/d.jpg", teamName: "CAPITAL FC", totalGoals: 99, assists: 4, matchesPlayed: 29, totalPoints: 140 }],
      weekly: { title: "haftanın Enleri", start_date: "2026-10-08", end_date: "2026-10-14", items: [{ award_type: "WEEKLY_DEFENDER", player_name: "D", sort_order: 0 }, { award_type: "WEEKLY_PLAYER", player_name: "Alperen", player_img: "https://x/a.jpg", player_team_name: "NO MERCY", sort_order: 5, stats: { goals: 1 } }] },
      news: [{ id: "n1", title: "KRAL KUPASI", summary: "64 takım", content: "<p><img src=\"https://x/k.png\"></p>", category_label: "Duyuru", published_at: "2026-08-12T10:00:00Z" }],
      sponsors: [{ id: 3, name: "S", images: { logo: "https://x/s.png" } }],
    }, { now: new Date("2026-11-10T10:00:00Z") });
    expect(d.source).toBe("public");
    expect(d.scope.season).toEqual({ id: 160, label: "15. SEZON" });
    expect(d.standings.type).toBe("gucdengesi");
    expect(d.standings.rows[0]).toMatchObject({ rank: 1, teamName: "CAPITAL FC", points: 94, last5: "WWWWW" });
    expect(d.scorers[0]).toMatchObject({ name: "Doğukan YILDIRIM", goals: 99, matches: 29 });
    expect(d.weekly.title).toBe("Haftanın Enleri");
    expect(d.weekly.items[0]).toMatchObject({ lead: true, name: "Alperen", awardLabel: "Haftanın Oyuncusu" });
    expect(d.weekly.subtitle).toBe("08.10.2026 — 14.10.2026");
    expect(d.news[0]).toMatchObject({ image: "https://x/k.png", category: "Duyuru" });
    expect(d.news[0].content).toBeUndefined();
    expect(d.sponsors[0].logo).toBe("https://x/s.png");
    expect(dataImageUrls(d)).toEqual(expect.arrayContaining(["https://x/610.png", "https://x/d.jpg", "https://x/a.jpg", "https://x/k.png", "https://x/s.png"]));
  });
  it("normalize: bozuk / eksik veri boş listelere düşer; güvensiz adres atılır", () => {
    expect(normalizePanoramaData(null)).toBe(EMPTY_PANORAMA_DATA);
    const d = normalizePanoramaData({ standings: { rows: [{ teamName: "X", teamLogo: "javascript:alert(1)", last5: "w-l" }] }, fixtures: "x", news: [{ title: "" }, { title: "T" }] });
    expect(d.standings.rows[0]).toMatchObject({ teamLogo: null, last5: "WL", rank: 1 });
    expect(d.fixtures).toEqual([]);
    expect(d.news.map((n) => n.title)).toEqual(["T"]);
    expect(weeklyFromPublic({ items: [] })).toBe(null);
  });
  it("çekme: toplu uç varsa tek istek; 404 → herkese açık uçlar (oturumda bir daha denenmez)", async () => {
    const calls = [];
    const server = async ({ path }) => { calls.push(path); return { ok: true, data: { source: "server", scope: { city: { id: 1, label: "Ankara" } }, standings: { rows: [{ teamName: "A" }] } } }; };
    const d = await fetchPanoramaData(server, { cityId: 1 });
    expect(calls).toEqual(["/api/broadcast/panorama"]);
    expect(d.standings.rows[0].teamName).toBe("A");

    const seen = [];
    const old = async ({ path, query }) => {
      seen.push(path);
      if (path === "/api/broadcast/panorama") return { ok: false, error: { status: 404 } };
      if (path === "/api/meta/cities") return { ok: true, data: { cities: [{ id: 1, label: "Ankara" }] } };
      if (path === "/api/meta/default-scope") return { ok: true, data: { cityId: 1, leagueId: 1, seasonId: 160 } };
      if (path === "/api/meta/leagues") return { ok: true, data: { leagues: [{ id: 1, label: "FREELİG" }] } };
      if (path === "/api/meta/seasons") return { ok: true, data: { seasons: [{ id: 160, label: "15. SEZON" }] } };
      if (path === "/api/standings") { expect(query).toMatchObject({ cityId: 1, leagueId: 1, seasonId: 160 }); return { ok: true, data: STANDINGS }; }
      if (path === "/maclar") return { ok: true, data: LEGACY };
      if (path === "/api/news") return { ok: false, error: { status: 500 } };
      return { ok: true, data: {} };
    };
    const state = {};
    const p = await fetchPanoramaData(old, { cityId: 1 }, state);
    expect(state.legacy).toBe(true);
    expect(p.source).toBe("public");
    expect(p.scope.league.label).toBe("FREELİG");
    expect(p.standings.rows).toHaveLength(2);
    expect(p.errors).toContain("news");
    seen.length = 0;
    await fetchPanoramaData(old, { cityId: 1, leagueId: 1, seasonId: 160 }, state);
    expect(seen).not.toContain("/api/broadcast/panorama");
    // Sunucu hatası (500): sessizce eski yola düşülmez, hata gösterilir.
    await expect(fetchPanoramaData(async () => ({ ok: false, error: { status: 500, message: "Sunucu hatası" } }), { cityId: 1 }, {})).rejects.toThrow("Sunucu hatası");
    await expect(fetchPanoramaData(server, {})).rejects.toThrow(/şehir/);
  });
});

describe("panorama · model", () => {
  const sources = [{ id: "c1", kind: "camera", name: "Sunucu" }, { id: "c2", kind: "camera", name: "Konuk" }, { id: "v1", kind: "video", name: "Saha" }, { id: "a1", kind: "audio", name: "Mik" }];
  it("düzenler: 4-5 kameralı ızgara / 2+3 / büyük+küçükler / şerit; kutular çıkış içinde", () => {
    const keys = PANORAMA_LAYOUTS.map((l) => l.key);
    expect(keys).toEqual(expect.arrayContaining(["grid4", "twoThree", "bigSmall", "strip5", "host", "duo", "content"]));
    expect(PANORAMA_LAYOUTS.find((l) => l.key === "twoThree").slots).toHaveLength(5);
    expect(PANORAMA_LAYOUTS.find((l) => l.key === "strip5").slots).toHaveLength(5);
    for (const l of PANORAMA_LAYOUTS) for (const b of [...l.slots, l.card].filter(Boolean)) {
      expect(b.x).toBeGreaterThanOrEqual(0); expect(b.y).toBeGreaterThanOrEqual(0);
      expect(b.x + b.w).toBeLessThanOrEqual(1.0001); expect(b.y + b.h).toBeLessThanOrEqual(1.0001);
    }
  });
  it("yuvalar önce kameralarla, ses kaynağı hariç dolar", () => {
    expect(fillSlots("twoThree", sources)).toEqual(["c1", "c2", "v1", "c1", "c2"]);
    expect(fillSlots("grid4", [])).toEqual([null, null, null, null]);
  });
  it("açılar → stüdyo sahneleri (zemin + çerçeveli kamera katmanları); kart kutuları sahne başına", () => {
    const angles = [normalizeAngle({ id: "a", layout: "host", slots: ["c1"] }), normalizeAngle({ id: "b", layout: "solo", slots: ["v1"] }), normalizeAngle({ id: "c", layout: "grid4", slots: ["c1", "zzz", "v1", null] })];
    const cfg = buildPanoramaScenes({ sources, angles, theme: "gece", programId: "b" });
    expect(cfg.programSceneId).toBe("b");
    expect(cfg.previewSceneId).toBe("b");
    expect(cfg.sources[0]).toMatchObject({ id: "pano_bg", kind: "color", color: "#050b1f" });
    expect(cfg.scenes[0].layers.map((l) => l.sourceId)).toEqual(["pano_bg", "c1"]);
    expect(cfg.scenes[0].layers[1]).toMatchObject({ radius: 0.035, fit: "cover" });
    expect(cfg.scenes[1].layers.map((l) => l.sourceId)).toEqual(["v1"]); // tam ekran: zemin yok
    expect(cfg.scenes[2].layers.map((l) => l.sourceId)).toEqual(["pano_bg", "c1", "v1"]); // bilinmeyen kaynak atlanır
    const boxes = sceneBoxes(angles, sources);
    expect(boxes.a.card).toEqual(PANORAMA_LAYOUTS.find((l) => l.key === "host").card);
    expect(boxes.b.card).toBe(null);
    expect(boxes.c.names.map((n) => n.text)).toEqual(["Sunucu", "Saha"]);
  });
  it("kart döngüsü: süre dolunca sıradaki (kapalılar atlanır), sabitleme durdurur, elle ileri / geri", () => {
    let pl = normalizePlaylist({ items: [makeCard("standings", { id: "s", sec: 10 }), makeCard("news", { id: "n", sec: 5, off: true }), makeCard("scorers", { id: "g", sec: 5 })] });
    expect(currentCard(pl).id).toBe("s");
    pl = tickPlaylist(pl, 1000);
    expect(pl.startedAt).toBe(1000);
    expect(tickPlaylist(pl, 10_999)).toBe(pl);
    pl = tickPlaylist(pl, 11_000);
    expect(currentCard(pl).id).toBe("g");
    expect(remainingSec(pl, 12_000)).toBe(4);
    pl = tickPlaylist(pl, 16_000);
    expect(currentCard(pl).id).toBe("s");
    pl = pinCard(pl, "g", 17_000);
    expect(currentCard(pl).id).toBe("g");
    expect(tickPlaylist(pl, 999_000)).toBe(pl);
    expect(remainingSec(pl, 18_000)).toBe(null);
    pl = pinCard(pl, "g", 18_000);
    expect(pl.pinnedId).toBe(null);
    expect(currentCard(stepCard(pl, 1, 19_000)).id).toBe("s");
    expect(currentCard(stepCard(pl, -1, 19_000)).id).toBe("s");
    expect(normalizePlaylist({ items: [{ kind: "yok" }, { kind: "clock", sec: 1 }, { kind: "notice", sec: 9999, opts: { title: "T", bad: { x: 1 } } }] }).items.map((c) => [c.kind, c.sec, c.opts?.bad])).toEqual([["clock", 4, undefined], ["notice", 600, undefined]]);
  });
  it("kart verisi: dilim, takım kartı / karşılaştırma / il özeti hesapları", () => {
    const d = buildFromPublic({ scope: { cityId: 1 }, cities: [{ id: 1, label: "Ankara" }], standings: STANDINGS, matches: LEGACY, scorers: [{ playerName: "P", teamId: 610, totalGoals: 3 }] }, { now: new Date("2026-11-10T10:00:00Z") });
    expect(cardPayload(makeCard("standings"), d).rows).toHaveLength(2);
    const team = cardPayload(makeCard("team", { opts: { teamId: 610 } }), d);
    expect(team.team.teamName).toBe("CAPITAL FC");
    expect(team.results.map((m) => m.id)).toEqual([10990]);
    expect(team.players.map((p) => p.name)).toEqual(["P"]);
    const cmp = cardPayload(makeCard("compare"), d);
    expect([cmp.a.teamName, cmp.b.teamName]).toEqual(["CAPITAL FC", "VADİNİN ASLANLARI"]);
    const city = cardPayload(makeCard("city"), d);
    expect(city).toMatchObject({ city: "Ankara", teams: 2, goals: 282, played: 22, live: 1 });
    expect(cardPayload(makeCard("qr"), d, { siteUrl: "https://elitlig.com/ankara" }).url).toBe("https://elitlig.com/ankara");
    expect(CARD_KINDS.length).toBeGreaterThanOrEqual(15);
  });
  it("alt bant: canlı skorlar, sonuçlar, haberler, serbest metin", () => {
    const d = { live: [{ homeName: "A", awayName: "B", homeScore: 1, awayScore: 0 }], results: [{ homeName: "C", awayName: "D", homeScore: null, awayScore: null }], news: [{ title: "?? KRAL KUPASI" }] };
    expect(tickerItems(d, { sources: ["live", "results", "news", "custom"], text: "satır 1\n\nsatır 2" })).toEqual(["CANLI · A 1-0 B", "C – D", "KRAL KUPASI", "satır 1", "satır 2"]);
  });
  it("şablonlar: sekiz hazır şablon; uygula / kaydet / geri yükle", () => {
    expect(BUILTIN_TEMPLATES.map((t) => t.name)).toEqual(["Hafta değerlendirmesi", "Canlı skor masası", "Puan durumu özel", "Haber bülteni", "Haber masası", "Röportaj / konuk", "Tartışma programı", "Sponsor & etkileşim"]);
    const r = applyTemplate(BUILTIN_TEMPLATES[1], sources);
    expect(r.theme).toBe("gece");
    expect(r.angles[0].layout).toBe("grid4Card");
    expect(r.angles[0].slots.every((s) => ["c1", "c2", "v1"].includes(s))).toBe(true);
    expect(r.playlist.items[0].kind).toBe("live");
    const st = normalizePanoramaState({ sources, ...r });
    const t = templateFromState("Benim", st);
    expect(t).toMatchObject({ name: "Benim", builtin: false, theme: "gece" });
    const again = applyTemplate(t, sources);
    expect(again.angles.map((a) => a.slots)).toEqual(st.angles.map((a) => a.slots));
    expect(again.playlist.items.map((c) => [c.kind, c.sec])).toEqual(st.playlist.items.map((c) => [c.kind, c.sec]));
  });
  it("durum: ilk açılış varsayılanı; kayıt / yükleme; blob adresi kalıcı değil", () => {
    const def = defaultPanoramaState();
    expect(def.angles.length).toBeGreaterThanOrEqual(4);
    expect(def.templateKey).toBe("hafta");
    const store = mem();
    savePanoramaState(store, { ...def, sources: [...def.sources, { id: "v9", kind: "video", name: "V", url: "blob:x" }] });
    const back = loadPanoramaState(store);
    expect(back.sources.find((s) => s.id === "v9")).toMatchObject({ url: null, fileMissing: true });
    expect(back.angles.map((a) => a.id)).toEqual(def.angles.map((a) => a.id));
    expect(loadPanoramaState(mem({ "studio.panorama.v1": "{bozuk" })).angles.length).toBeGreaterThan(0);
  });
});

/** Her çağrıyı sayan sahte 2D bağlam. */
function fakeCtx() {
  const calls = { fillText: [], drawImage: 0 };
  const state = { font: "10px X", globalAlpha: 1 };
  return new Proxy(state, {
    get(t, p) {
      if (p === "calls") return calls;
      if (p === "measureText") return (s) => ({ width: String(s).length * 10 });
      if (p === "createLinearGradient" || p === "createRadialGradient") return () => ({ addColorStop() {} });
      if (p === "fillText") return (s) => calls.fillText.push(String(s));
      if (p === "drawImage") return () => { calls.drawImage += 1; };
      if (p in t) return t[p];
      return () => {};
    },
    set(t, p, v) { t[p] = v; return true; },
  });
}

describe("panorama · çizim (program tuvaline)", () => {
  const d = buildFromPublic({ scope: { cityId: 1, leagueId: 1, seasonId: 160 }, cities: [{ id: 1, label: "Ankara" }], leagues: [{ id: 1, label: "FREELİG" }], seasons: [{ id: 160, label: "15. SEZON" }], standings: STANDINGS, matches: LEGACY }, { now: new Date("2026-11-10T10:00:00Z") });
  const angles = [normalizeAngle({ id: "a", layout: "host", slots: ["c1"] }), normalizeAngle({ id: "b", layout: "solo", slots: ["c1"], ticker: false, header: false })];
  const snap = buildPanoramaSnapshot({ branding: { key: "x" }, theme: "mor", angles, sources: [{ id: "c1", kind: "camera", name: "Sunucu" }], card: makeCard("standings", { id: "k1" }), cardSince: 1, data: d, ticker: { on: true, sources: ["results"] }, title: "ELİTLİG PANORAMA" });
  it("anlık görüntü: kapsam başlığı, kart verisi, bant öğeleri, görseller", () => {
    expect(snap.panorama.subtitle).toBe("Ankara · FREELİG · 15. SEZON");
    expect(snap.panorama.card).toMatchObject({ kind: "standings", title: "Puan durumu" });
    expect(snap.panorama.ticker.items[0]).toBe("A 1-1 B");
    expect(snapshotImageUrls(snap)).toEqual(panoramaImageUrls(snap.panorama));
    expect(snapshotImageUrls(snap)).toContain("https://x/610.png");
  });
  it("drawGraphics panorama anlık görüntüsünü panorama çizimine yönlendirir (işçi ve ana motor aynı yol)", () => {
    const ctx = fakeCtx();
    drawGraphics(ctx, { width: 1920, height: 1080, now: 5000, sceneId: "a" }, snap);
    const texts = ctx.calls.fillText.join(" | ");
    expect(texts).toContain("ELİTLİG PANORAMA");
    expect(texts).toContain("CAPITAL FC");
    expect(texts).toContain("94");
    expect(texts).toContain("A 1-1 B");
  });
  it("tam ekran kamera açısında künye / bant kapalıysa kart da çizilmez", () => {
    const ctx = fakeCtx();
    drawPanorama(ctx, { width: 1280, height: 720, now: 5000, sceneId: "b" }, snap);
    expect(ctx.calls.fillText).toEqual([]);
  });
  it("sayfalama, kayan yazı, katman anahtarı", () => {
    expect(pageOf(25, 10, 0, 0, 30)).toMatchObject({ page: 0, pages: 3 });
    expect(pageOf(25, 10, 10_000, 0, 30).page).toBe(1);
    expect(pageOf(25, 10, 31_000, 0, 30).page).toBe(0);
    expect(pageOf(5, 10, 99_999, 0, 30)).toMatchObject({ page: 0, pages: 1 });
    expect(pageOf(30, 10, 5_100, 0, 9).page).toBe(1); // en az 5 sn sayfa
    expect(tickerShift(2000, 100, 150)).toBe(50);
    const c = { id: "k", since: 1000, kind: "standings" };
    expect(cardLayerKey(c, "mor", 800, 600, 1, 3, 1500)).toBe(cardLayerKey(c, "mor", 800, 600, 1, 3, 1900));
    expect(cardLayerKey(c, "mor", 800, 600, 1, 3, 1500)).not.toBe(cardLayerKey(c, "mor", 800, 600, 1, 4, 1500));
  });
});

describe("panorama · yayın türü ve yayın adresi", () => {
  it("tür: kayıtlıysa o; eski maç kullanıcısı doğrudan maç yayını; ilk kez gelen seçim ekranı", () => {
    expect(readStudioMode(mem({ "studio.mode": "panorama" }))).toBe("panorama");
    expect(readStudioMode(mem({ "studio.match": "7" }))).toBe("match");
    expect(readStudioMode(mem({ "studio.prefs.v1": "{}" }))).toBe("match");
    expect(readStudioMode(mem())).toBe(null);
  });
  it("YouTube anahtarı ya da RTMP sunucu + anahtar", () => {
    expect(ingestOf({ target: "youtube", ytKey: " abcd " })).toBe("rtmp://a.rtmp.youtube.com/live2/abcd");
    expect(ingestOf({ target: "youtube", ytKey: "" })).toBe(null);
    expect(ingestOf({ target: "rtmp", rtmpServer: "rtmps://x.example/app/", rtmpKey: "k" })).toBe("rtmps://x.example/app/k");
    expect(ingestOf({ target: "rtmp", rtmpServer: "http://x", rtmpKey: "k" })).toBe(null);
  });
});
