import { BUG, bugLayout, bugPlacement, clockText, drawReplayBadge, drawScoreBug, lowerColor, periodLabel, replayBadgeLayout, teamShortCode } from "../src/lib/studio/scorebug";
import { addLayer, addScene, addSource, defaultConfig, duplicateScene, fitRect, layerRect, loadConfig, moveLayer, moveScene, normalizeConfig, removeScene, removeSource, renameScene, resolveCameraDevice, saveConfig, sourceUsage, STORAGE_KEY, updateLayer } from "../src/lib/studio/layouts";
import { HALF_MS, buildMatchOptions, normalizeListMatch, bugEventOf, controlSteps, eventBody, eventSide, isGoalCode, livePhase, matchOptionLabel, normalizeMatchStatus, primaryControl, scoreFromEvents, shiftDay, sortEvents, timerNowMs, toSquad } from "../src/lib/studio/match";
import { clipPlayable, clipStatusLabel, elapsedText, ingestUrl, isEncoding, isRtmpUrl, joinRtmp, keyAction, pickMimeType, presetOf, recorderBitsPerSecond, replayEvent, reusableStream, statusPill, streamStatusLabel } from "../src/lib/studio/broadcast";
import { fallbackDue, gainValue, levelFromSamples, previewSize, transitionProgress } from "../src/lib/studio/compose";

// Sahte ölçü: her karakter yazı boyunun 0,6'sı.
const measure = (text, font) => String(text).length * parseFloat(font.match(/(\d+(?:\.\d+)?)px/)[1]) * 0.6;

describe("skorbord", () => {
  it("teamShortCode web ile aynı kısaltır", () => {
    expect(teamShortCode("Ankara Gençlikspor")).toBe("ANG");
    expect(teamShortCode("Kartallar FK")).toBe("KAR");
    expect(teamShortCode("Yıldız Spor Kulübü")).toBe("YIL");
    expect(teamShortCode("Ege Mavi Ay")).toBe("EMA");
    expect(teamShortCode("")).toBe("TAK");
    expect(teamShortCode("1907 Ünye")).toBe("ÜNY");
  });

  it("saat ve devre metinleri", () => {
    expect(clockText(0)).toBe("00:00");
    expect(clockText(25 * 60 * 1000 + 3000)).toBe("25:03");
    expect(clockText(-5)).toBe("00:00");
    expect(periodLabel(1)).toBe("1. YARI");
    expect(periodLabel(2)).toBe("2. YARI");
    expect(periodLabel(3)).toBe("UZATMA");
    expect(periodLabel(null)).toBe("1. YARI");
  });

  it("sahnede sol 56 / üst 48 (1920'ye göre ölçekli)", () => {
    expect(bugPlacement(1920)).toEqual({ x: 56, y: 48, scale: 1 });
    const p = bugPlacement(1280);
    expect(p.scale).toBeCloseTo(2 / 3);
    expect(p.x).toBeCloseTo(56 * (2 / 3));
    expect(p.y).toBeCloseTo(32);
  });

  it("çubuk bölümleri web ölçüleriyle sıralanır", () => {
    const L = bugLayout({ homeName: "Ankara Gençlikspor", awayName: "Kartallar FK", homeScore: 2, awayScore: 1, clockMs: 754000, period: 1 }, 1, measure);
    expect(L.row.h).toBe(44);
    expect(L.home.w).toBe(106);
    expect(L.homeScore.x).toBe(106);
    expect(L.homeScore.w).toBe(38);
    expect(L.medal.x).toBe(144);
    expect(L.medal.w).toBe(62);
    expect(L.awayScore.x).toBe(206);
    expect(L.away.x).toBe(244);
    expect(L.clock.x).toBe(350);
    // ev kodu sağa yaslı (sağ boşluk 10), arma kodun 8 px solunda
    expect(L.home.code.x + L.home.code.w).toBeCloseTo(96);
    expect(L.home.crest.x + L.home.crest.w).toBeCloseTo(L.home.code.x - 8);
    // deplasman kodu sol 10'da, arma 8 px sağında
    expect(L.away.code.x).toBe(254);
    expect(L.away.crest.x).toBeCloseTo(254 + L.away.code.w + 8);
    expect(L.clock.text.text).toBe("12:34");
    expect(L.clock.period.text).toBe("1. YARI");
    expect(L.width).toBeCloseTo(L.clock.x + L.clock.w);
    // madalya satırdan taşar (60 > 44)
    expect(L.medal.logoY).toBe(-8);
    expect(L.top).toBe(-8);
    expect(L.lower).toBeNull();
    expect(L.height).toBe(44);
  });

  it("maç sonunda saat yerine MAÇ SONU, nokta ve devre yok", () => {
    const L = bugLayout({ homeName: "A", awayName: "B", finished: true }, 1, measure);
    expect(L.clock.text.text).toBe("MAÇ SONU");
    expect(L.clock.dot).toBeNull();
    expect(L.clock.period).toBeNull();
  });

  it("olay bandı: GOL · OYUNCU, renkler türe göre", () => {
    const L = bugLayout({ homeName: "A", awayName: "B", event: { kind: "goal", label: "GOL", player: "MEHMET YILMAZ" } }, 0.5, measure);
    expect(L.lower.y).toBe(24);
    expect(L.lower.h).toBe(13);
    expect(L.lower.tag.color).toBe(BUG.colors.lowerGoal);
    expect(L.lower.name.x).toBe(L.lower.tag.w);
    expect(L.height).toBe(37);
    expect(lowerColor("red")).toBe(BUG.colors.lowerRed);
    expect(lowerColor("yellow")).toBe(BUG.colors.lowerCard);
    expect(lowerColor("other")).toBe(BUG.colors.v700);
    const noPlayer = bugLayout({ homeName: "A", awayName: "B", event: { kind: "yellow", label: "SARI KART" } }, 1, measure);
    expect(noPlayer.lower.name).toBeNull();
  });

  it("çizim sahte tuvalde hata vermeden çalışır", () => {
    const calls = [];
    const grad = { addColorStop: () => {} };
    const ctx = new Proxy({ measureText: (t) => ({ width: String(t).length * 10 }), createLinearGradient: () => grad }, {
      get(target, key) { if (key in target) return target[key]; return (...args) => { calls.push(key); return undefined; }; },
      set(target, key, value) { target[key] = value; return true; },
    });
    const box = drawScoreBug(ctx, { homeName: "Ankara Gençlikspor", awayName: "Kartallar", homeScore: 1, awayScore: 0, clockMs: 61000, period: 2, event: { kind: "goal", label: "GOL", player: "ALİ" } }, { x: 56, y: 48, scale: 1, images: {} });
    expect(box.x).toBe(56);
    expect(box.y).toBe(40);
    expect(calls).toContain("fillText");
    const b = replayBadgeLayout(1920, measure);
    expect(b.x + b.w).toBeCloseTo(1920 - 56);
    expect(b.y).toBe(48);
    expect(drawReplayBadge(ctx, 1920).text).toBe("TEKRAR");
  });
});

describe("sahne yerleşimi", () => {
  it("katman kutuları", () => {
    expect(layerRect({ type: "full" }, 1920, 1080)).toEqual({ x: 0, y: 0, w: 1920, h: 1080 });
    expect(layerRect({ type: "left" }, 1920, 1080)).toEqual({ x: 0, y: 0, w: 960, h: 1080 });
    expect(layerRect({ type: "right" }, 1920, 1080)).toEqual({ x: 960, y: 0, w: 960, h: 1080 });
    const pip = layerRect({ type: "pip", corner: "br", size: 30 }, 1920, 1080);
    expect(pip.w).toBeCloseTo(576);
    expect(pip.h).toBeCloseTo(324);
    expect(pip.x + pip.w).toBeCloseTo(1920 - 48);
    expect(pip.y + pip.h).toBeCloseTo(1080 - 48);
    const tl = layerRect({ type: "pip", corner: "tl", size: 100 }, 1000, 1000);
    expect(tl.w).toBe(600); // en çok %60
    expect(tl.x).toBe(25);
    expect(tl.y).toBe(25);
    expect(layerRect({ type: "rect", x: 50, y: 50, w: 80, h: 80 }, 100, 100)).toEqual({ x: 50, y: 50, w: 50, h: 50 });
  });

  it("cover kırpar, contain boşluk bırakır", () => {
    const cover = fitRect(1920, 1080, { x: 0, y: 0, w: 960, h: 1080 }, "cover");
    expect(cover.sw).toBeCloseTo(960);
    expect(cover.sx).toBeCloseTo(480);
    expect(cover.dw).toBe(960);
    const contain = fitRect(1920, 1080, { x: 960, y: 0, w: 960, h: 1080 }, "contain");
    expect(contain.dw).toBe(960);
    expect(contain.dh).toBeCloseTo(540);
    expect(contain.dy).toBeCloseTo(270);
    expect(contain.dx).toBe(960);
    const tall = fitRect(1080, 1920, { x: 0, y: 0, w: 1920, h: 1080 }, "contain");
    expect(tall.dh).toBe(1080);
    expect(tall.dx).toBeCloseTo((1920 - 607.5) / 2);
    expect(fitRect(0, 0, { x: 0, y: 0, w: 1, h: 1 })).toBeNull();
    expect(fitRect(10, 10, { x: 0, y: 0, w: 20, h: 40 }, "stretch")).toMatchObject({ dw: 20, dh: 40 });
  });

  it("varsayılan sahneler", () => {
    const c = defaultConfig();
    expect(c.scenes.map((s) => s.name)).toEqual(["Kamera 1", "Kamera 2", "Resim içinde resim", "Yan yana"]);
    expect(c.sources.map((s) => s.deviceIndex)).toEqual([0, 1]);
    expect(c.scenes[2].layers[1].layout).toEqual({ type: "pip", corner: "br", size: 30 });
    expect(c.scenes[3].layers.map((l) => l.fit)).toEqual(["contain", "contain"]);
    expect(c.overlay.scorebug).toBe(true);
  });

  it("sahne işlemleri", () => {
    let c = defaultConfig();
    const added = addScene(c, "Devre arası");
    c = added.config;
    expect(c.scenes).toHaveLength(5);
    c = renameScene(c, added.scene.id, "  Mola  ");
    expect(c.scenes[4].name).toBe("Mola");
    c = moveScene(c, added.scene.id, -1);
    expect(c.scenes[3].id).toBe(added.scene.id);
    c = moveScene(c, c.scenes[0].id, -1);
    expect(c.scenes[0].id).toBe("sc_cam1");
    const dup = duplicateScene(c, "sc_pip");
    expect(dup.config.scenes[3].name).toBe("Resim içinde resim (kopya)");
    expect(dup.config.scenes[3].layers[0].id).not.toBe(dup.config.scenes[2].layers[0].id);
    c = { ...c, programSceneId: "sc_cam2", previewSceneId: "sc_cam2" };
    c = removeScene(c, "sc_cam2");
    expect(c.programSceneId).toBe("sc_cam1");
    expect(c.previewSceneId).toBe("sc_cam1");
    const one = { ...c, scenes: [c.scenes[0]] };
    expect(removeScene(one, one.scenes[0].id)).toBe(one);
  });

  it("katman ve kaynak işlemleri", () => {
    let c = defaultConfig();
    const { config, source } = addSource(c, { kind: "image", url: "data:image/png;base64,AAA", name: "Sponsor" });
    c = addLayer(config, "sc_cam1", source.id, { type: "pip", corner: "tr", size: 20 });
    const scene = () => c.scenes.find((s) => s.id === "sc_cam1");
    expect(scene().layers.map((l) => l.sourceId)).toEqual(["src_cam1", source.id]);
    const lid = scene().layers[1].id;
    c = moveLayer(c, "sc_cam1", lid, -1);
    expect(scene().layers[0].id).toBe(lid);
    c = updateLayer(c, "sc_cam1", lid, { visible: false });
    expect(scene().layers[0].visible).toBe(false);
    expect(sourceUsage(c, "src_cam1")).toEqual(["Kamera 1", "Resim içinde resim", "Yan yana"]);
    c = removeSource(c, "src_cam1");
    expect(c.sources.some((s) => s.id === "src_cam1")).toBe(false);
    expect(c.scenes.every((s) => s.layers.every((l) => l.sourceId !== "src_cam1"))).toBe(true);
  });

  it("kayıt okunur, bozuksa varsayılana döner; nesne adresleri atılır", () => {
    const mem = new Map();
    const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
    expect(loadConfig(storage).scenes).toHaveLength(4);
    const c = addSource(defaultConfig(), { kind: "video", url: "blob:file:///x", name: "Tanıtım" }).config;
    expect(saveConfig(storage, c)).toBe(true);
    const back = loadConfig(storage);
    expect(back.sources.find((s) => s.kind === "video").url).toBeNull();
    mem.set(STORAGE_KEY, "{bozuk");
    expect(loadConfig(storage).scenes).toHaveLength(4);
    expect(normalizeConfig({ scenes: [], sources: [] }).scenes).toHaveLength(4);
    const n = normalizeConfig({ sources: [{ id: "a", kind: "camera" }, { id: "b", kind: "laser" }], scenes: [{ id: "s", name: "S", layers: [{ sourceId: "a", layout: { type: "nope" } }, { sourceId: "b" }] }], previewSceneId: "zz" });
    expect(n.sources).toHaveLength(1);
    expect(n.scenes[0].layers).toHaveLength(1);
    expect(n.scenes[0].layers[0].layout).toEqual({ type: "full" });
    expect(n.previewSceneId).toBe("s");
    expect(saveConfig({ setItem: () => { throw new Error("dolu"); } }, c)).toBe(false);
    expect(loadConfig({ getItem: () => { throw new Error("yok"); } }).scenes).toHaveLength(4);
  });

  it("kamera aygıtı: kimlik, etiket, sıra", () => {
    const devs = [{ kind: "audioinput", deviceId: "m" }, { kind: "videoinput", deviceId: "a", label: "FaceTime HD" }, { kind: "videoinput", deviceId: "b", label: "Cam Link 4K" }];
    expect(resolveCameraDevice({ deviceIndex: 1 }, devs).deviceId).toBe("b");
    expect(resolveCameraDevice({ deviceIndex: 5 }, devs)).toBeNull();
    expect(resolveCameraDevice({ deviceId: "a" }, devs).label).toBe("FaceTime HD");
    expect(resolveCameraDevice({ deviceId: "zz", deviceLabel: "Cam Link 4K" }, devs).deviceId).toBe("b");
    expect(resolveCameraDevice({ deviceId: "zz" }, devs)).toBeNull();
    expect(resolveCameraDevice({ deviceIndex: 0 }, [])).toBeNull();
  });
});

describe("maç kuralları", () => {
  const events = [
    { id: 3, takim_id: 10, olay_kodu: "GOAL_HEADER", dakika: 30, devre: 1 },
    { id: 1, takim_id: 20, olay_kodu: "GOAL_OWN", dakika: 5, devre: 1 },
    { id: 2, takim_id: 20, olay_kodu: "YELLOW_CARD", dakika: 12, devre: 1 },
    { id: 4, takim_id: 20, olay_kodu: "goal_penalty", dakika: 2, devre: 2 },
    { id: 5, takim_id: 99, olay_kodu: "GOAL_RIGHT_FOOT", dakika: 3, devre: 2 },
  ];
  it("skor olaylardan; kendi kalesine rakibe yazılır", () => {
    expect(scoreFromEvents(events, 10, 20)).toEqual({ home: 2, away: 1 });
    expect(scoreFromEvents([], 1, 2)).toEqual({ home: 0, away: 0 });
    expect(isGoalCode("goal_own")).toBe(true);
    expect(isGoalCode("ASSIST")).toBe(false);
  });
  it("olay sırası devre, dakika, kimlik", () => {
    expect([...events].sort(sortEvents).map((e) => e.id)).toEqual([1, 2, 3, 4, 5]);
  });
  it("durum yazımları", () => {
    expect(normalizeMatchStatus("zamanlandi")).toBe("zamanlanmis");
    expect(normalizeMatchStatus("canli")).toBe("canli");
    expect(normalizeMatchStatus("yayinlanmis")).toBe("yayinlanmis");
    expect(normalizeMatchStatus("")).toBeNull();
  });
  it("sayaç", () => {
    const at = "2026-11-05T18:00:00.000Z";
    const now = Date.parse(at) + 65_000;
    expect(timerNowMs({ running: true, base_ms: 1000, base_at: at }, now)).toBe(66_000);
    expect(timerNowMs({ running: false, base_ms: 1000, base_at: at }, now)).toBe(1000);
    expect(timerNowMs(null)).toBe(0);
  });
  it("aşamalar ve ana düğme", () => {
    expect(livePhase({ status: "zamanlanmis" })).toBe("notStarted");
    expect(livePhase({ status: "canli", period: 1, running: false, clockMs: 0 })).toBe("kickoff");
    expect(livePhase({ status: "canli", period: 1, running: true, clockMs: 100 })).toBe("first");
    expect(livePhase({ status: "canli", period: 1, running: false, clockMs: HALF_MS })).toBe("halftime");
    expect(livePhase({ status: "canli", period: 1, running: false, clockMs: 1000 })).toBe("paused");
    expect(livePhase({ status: "canli", period: 2, running: true, clockMs: HALF_MS + 1 })).toBe("second");
    expect(livePhase({ status: "canli", period: 3, running: true })).toBe("extra");
    expect(livePhase({ status: "yayinlanmis" })).toBe("finished");
    expect(primaryControl("notStarted").action).toBe("start");
    expect(primaryControl("first").label).toBe("Devre arası");
    expect(primaryControl("halftime").action).toBe("second");
    expect(primaryControl("paused").label).toBe("Saati sürdür");
    expect(primaryControl("second").finish).toBe(true);
  });
  it("eylem adımları mobil rejiyle aynı sırada", () => {
    expect(controlSteps("start", { clockMs: 0 }).steps).toEqual([{ kind: "match", body: { mac_durumu: "canli" } }, { kind: "timer", running: true, baseMs: 0 }, { kind: "period", period: 1 }]);
    expect(controlSteps("halftime").steps).toEqual([{ kind: "timer", running: false, baseMs: HALF_MS }]);
    expect(controlSteps("second").steps.map((s) => s.kind)).toEqual(["timer", "period"]);
    expect(controlSteps("finish", { clockMs: 3000, score: { home: 2, away: 1 } }).steps[0].body).toEqual({ mac_durumu: "yayinlanmis", first_team_score: 2, second_team_score: 1 });
    expect(controlSteps("finish", { manual: true }).steps[0].body).toEqual({ mac_durumu: "yayinlanmis" });
    expect(controlSteps("nope").steps).toEqual([]);
  });
  it("olay gövdesi ve taraf", () => {
    const body = eventBody({ side: "away", code: "GOAL_HEADER", playerId: "77", minute: 41, period: 2, homeTeamId: 10, awayTeamId: 20, userId: 5 });
    expect(body).toMatchObject({ takim_id: 20, olay_kodu: "GOAL_HEADER", dakika: 41, devre: 2, oyuncu_id: 77, olusturan_kullanici_id: 5 });
    expect(body.client_event_id).toMatch(/^d-/);
    expect(eventBody({ side: "home", code: "X", playerId: null, homeTeamId: 1 }).oyuncu_id).toBeNull();
    expect(eventSide({ takim_id: 10 }, 10, 20)).toBe("home");
    expect(eventSide({ takim_id: 3 }, 10, 20)).toBeNull();
  });
  it("skorbord bandı olayları", () => {
    expect(bugEventOf({ olay_kodu: "GOAL_OWN" })).toEqual({ kind: "goal", label: "KENDİ KALESİNE" });
    expect(bugEventOf({ olay_kodu: "GOAL_PENALTY" }).label).toBe("PENALTI GOLÜ");
    expect(bugEventOf({ olay_kodu: "RED_CARD" }).kind).toBe("red");
    expect(bugEventOf({ olay_kodu: "FOUL" })).toBeNull();
  });
  it("kadro: önce ilk 11, tekrarlar atılır", () => {
    const squad = toSquad([
      { playerId: 2, playerName: "Yedek", role: "bench", number: 12 },
      { playerId: 1, playerName: "Kaleci", role: "starter", number: 1, captain: true },
      { playerId: 1, playerName: "Kaleci", role: "starter" },
      { playerId: 3, guestName: "Misafir", isGuest: true, role: "starter" },
    ]);
    expect(squad.map((p) => p.id)).toEqual(["1", "3", "2"]);
    expect(squad[0]).toMatchObject({ name: "Kaleci", number: "1", captain: true });
    expect(squad[1].guest).toBe(true);
  });
  it("maç seçici etiketi ve gün kaydırma", () => {
    expect(matchOptionLabel({ home: "Ankara Gençlikspor", away: "Kartallar FK", time: "21:00:00" })).toBe("ANG – KAR · 21:00");
    expect(matchOptionLabel({ home: "A Takımı", away: "B" })).toBe("A – B");
    expect(shiftDay("2026-12-31", 1)).toBe("2027-01-01");
    expect(shiftDay("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("yayın yardımcıları", () => {
  it("MediaRecorder biçimi: H.264 önce", () => {
    expect(pickMimeType((t) => t.includes("matroska"))).toBe("video/x-matroska;codecs=avc1,opus");
    expect(pickMimeType((t) => t === "video/webm;codecs=h264,opus" || t.includes("vp8"))).toBe("video/webm;codecs=h264,opus");
    expect(pickMimeType((t) => t.includes("vp8"))).toBe("video/webm;codecs=vp8,opus");
    expect(pickMimeType(() => { throw new Error("x"); })).toBe("");
    expect(recorderBitsPerSecond(2500)).toBe(5_000_000);
  });
  it("kalite seçenekleri", () => {
    expect(presetOf("1080p60")).toMatchObject({ width: 1920, height: 1080, fps: 60, videoBitrateKbps: 6000 });
    expect(presetOf("zz").key).toBe("720p30");
  });
  it("RTMP adresi", () => {
    expect(joinRtmp("rtmp://a.rtmp.youtube.com/live2/", "abcd-1234")).toBe("rtmp://a.rtmp.youtube.com/live2/abcd-1234");
    expect(joinRtmp("", "k")).toBeNull();
    expect(ingestUrl({ rtmp_publish_url: "rtmp://x/y/z" })).toBe("rtmp://x/y/z");
    expect(ingestUrl({ rtmp_url: "rtmp://x/live2", stream_key: "k" })).toBe("rtmp://x/live2/k");
    expect(ingestUrl(null)).toBeNull();
    expect(isRtmpUrl("rtmps://x.com/live2/key")).toBe(true);
    expect(isRtmpUrl("http://x.com/a")).toBe(false);
    expect(reusableStream({ rtmp_url: "rtmp://x/l", stream_key: "k", status: "ready" })).toBe(true);
    expect(reusableStream({ rtmp_url: "rtmp://x/l", stream_key: "k", status: "complete" })).toBe(false);
    expect(reusableStream({ rtmp_url: "rtmp://x/l", stream_key: "k", active: false })).toBe(false);
    expect(streamStatusLabel("live")).toBe("YouTube'da yayında");
  });
  it("durum hapı", () => {
    expect(statusPill("idle")).toEqual({ label: "YAYIN KAPALI", tone: "off" });
    expect(statusPill("connecting").label).toBe("BAĞLANIYOR");
    expect(statusPill("live", 1000, 1000 + 3_725_000).label).toBe("CANLI 1:02:05");
    expect(statusPill("reconnecting").label).toBe("YENİDEN BAĞLANIYOR");
    expect(statusPill("recording", 0, 5000).label).toBe("PROVA KAYDI 00:00");
    expect(elapsedText(65_000)).toBe("01:05");
    expect(isEncoding("recording")).toBe(true);
    expect(isEncoding("failed")).toBe(false);
  });
  it("klip durumları", () => {
    expect(clipStatusLabel({ status: "ready", settled: false })).toBe("Golcü bekleniyor");
    expect(clipStatusLabel({ status: "uploaded" })).toBe("Profilde");
    expect(clipStatusLabel({ status: "local" })).toBe("Yalnız bu bilgisayarda");
    expect(clipStatusLabel({ status: "error", error: "ffmpeg yok" })).toBe("ffmpeg yok");
    expect(clipPlayable({ url: "elitlig-studio://clips/a.mp4", status: "failed" })).toBe(true);
    expect(clipPlayable({ url: "x", status: "saving" })).toBe(false);
    expect(replayEvent({ code: "GOAL_OWN", scorer: "ali" })).toEqual({ kind: "goal", label: "KENDİ KALESİNE", player: "ALİ" });
    expect(replayEvent({ code: "GOAL_HEADER" }).player).toBeNull();
  });
  it("kısayollar: yazı alanında ve ⌘ ile çalışmaz", () => {
    const k = (key, extra = {}) => keyAction({ key, target: { tagName: "DIV" }, ...extra });
    expect(k("m")).toEqual({ type: "mic" });
    expect(k("M")).toEqual({ type: "mic" });
    expect(k("r")).toEqual({ type: "replay" });
    expect(k("3")).toEqual({ type: "scene", index: 2 });
    expect(k("0")).toBeNull();
    expect(k(" ")).toEqual({ type: "transition" });
    expect(k("Enter")).toEqual({ type: "transition" });
    expect(keyAction({ key: " ", target: { tagName: "BUTTON" } })).toBeNull();
    expect(k("m", { metaKey: true })).toBeNull();
    expect(k("m", { repeat: true })).toBeNull();
    expect(keyAction({ key: "m", target: { tagName: "INPUT" } })).toBeNull();
    expect(keyAction({ key: "m", target: { tagName: "DIV", isContentEditable: true } })).toBeNull();
    expect(k("g")).toEqual({ type: "goalArm" });
    expect(keyAction({ key: "h", target: {} }, { pendingGoal: true })).toEqual({ type: "goal", side: "home" });
    expect(keyAction({ key: "a", target: {} }, { pendingGoal: true })).toEqual({ type: "goal", side: "away" });
    expect(keyAction({ key: "x", target: {} }, { pendingGoal: true })).toEqual({ type: "goalCancel" });
  });
});

describe("karıştırıcı yardımcıları", () => {
  it("geçiş ilerleyişi", () => {
    expect(transitionProgress(null, 5)).toBe(1);
    expect(transitionProgress({ startedAt: 0, ms: 0 }, 0)).toBe(1);
    expect(transitionProgress({ startedAt: 100, ms: 300 }, 250)).toBeCloseTo(0.5);
    expect(transitionProgress({ startedAt: 100, ms: 300 }, 50)).toBe(0);
    expect(transitionProgress({ startedAt: 100, ms: 300 }, 999)).toBe(1);
  });
  it("yedek zamanlayıcı yalnız rAF gecikince çizer", () => {
    expect(fallbackDue(0, 30, 30)).toBe(false);
    expect(fallbackDue(0, 51, 30)).toBe(true);
    expect(previewSize(1920, 1080)).toEqual({ width: 960, height: 540 });
    expect(previewSize(640, 360)).toEqual({ width: 640, height: 360 });
  });
  it("ses seviyesi ve kazanç", () => {
    expect(levelFromSamples(new Float32Array(16)).pct).toBe(0);
    const full = levelFromSamples(new Float32Array(16).fill(1));
    expect(full.pct).toBe(100);
    expect(full.db).toBeCloseTo(0);
    const half = levelFromSamples(new Float32Array(16).fill(0.1));
    expect(half.db).toBeCloseTo(-20);
    expect(half.pct).toBeCloseTo(66.67, 1);
    expect(gainValue(100, false)).toBe(1);
    expect(gainValue(100, true)).toBe(0);
    expect(gainValue(400, false)).toBe(1.5);
  });
});

describe("maç seçici", () => {
  const day = "2026-11-05";
  it("canlı maçlar gün ne olursa olsun en üstte, günün maçları saate göre", () => {
    const { live, ofDay } = buildMatchOptions({
      day,
      dayItems: [
        { id: 2, date: day, time: "21:00", home: "Ankara Gençlikspor", away: "Karadeniz FK" },
        { id: 1, date: day, time: "19:00", home: "A", away: "B" },
      ],
      listItems: [
        { id: 9, date: "2026-11-04", match_time: "22:00:00", first_team_name: "X", second_team_name: "Y", mac_durumu: "canli" },
        { id: 2, date: day, mac_durumu: "canli" },
        { id: 5, date: "2026-11-03", mac_durumu: "yayinlanmis" },
      ],
    });
    expect(live.map((m) => m.id)).toEqual([2, 9]);
    expect(live[0].home).toBe("Ankara Gençlikspor");
    expect(ofDay.map((m) => m.id)).toEqual([1]);
  });
  it("günün maçları ucu boşken genel listeden o gün süzülür", () => {
    const { live, ofDay } = buildMatchOptions({
      day,
      dayItems: [],
      listItems: [
        { id: 3, date: `${day}T00:00:00.000Z`, match_time: "20:30:00", first_team_name: "C", second_team_name: "D", mac_durumu: "zamanlanmis" },
        { id: 4, date: "2026-11-06", first_team_name: "E", second_team_name: "F" },
      ],
    });
    expect(live).toEqual([]);
    expect(ofDay.map((m) => m.id)).toEqual([3]);
    expect(matchOptionLabel(ofDay[0])).toBe("C – D · 20:30");
  });
  it("geçersiz satır atlanır", () => {
    expect(normalizeListMatch(null)).toBeNull();
    expect(normalizeListMatch({})).toBeNull();
  });
});
