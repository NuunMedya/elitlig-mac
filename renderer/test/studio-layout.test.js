import {
  SCENE_TEMPLATES, addSource, defaultScenesConfig, normalizeScenesConfig, readySceneOf, sceneFromTemplate, sourceDefaults, sourceSceneId, startSceneCountdowns, templateSourceIds,
} from "../src/lib/studio/scenes";
import { chapterStamp, keyAction, youtubeChapters } from "../src/lib/studio/broadcast";
import {
  DEFAULT_HOTKEYS, SETTINGS_KEY, actionForKey, bindHotkey, formatSizeEstimate, isLowBitrate, loadSettings, localRecordOptions, normalizeSettings, patchSettings,
  recordBytes, recordEstimate, saveSettings, silenceStep,
} from "../src/views/studio/settings/settings";
import { ledRouteLabel, ledShowsScene, ledTargetScene, normalizeLedRoute, routeSceneToLed } from "../src/views/studio/led/ledRouting";

const memStore = (init = {}) => { const m = new Map(Object.entries(init)); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m }; };

describe("sahne göçü: önizleme / program yalnız sahne", () => {
  it("sanal kaynak sahnesi programdaysa var olan tek katmanlı sahneye çevrilir, yoksa oluşturulur; sahneler silinmez", () => {
    const base = defaultScenesConfig();
    const withVirtual = { ...base, programSceneId: sourceSceneId("src_cam1"), previewSceneId: sourceSceneId("src_cam2") };
    const c = normalizeScenesConfig(withVirtual);
    expect(c.programSceneId).toBe("sc_cam1");
    expect(c.previewSceneId).toBe("sc_cam2");
    expect(c.scenes).toHaveLength(base.scenes.length);
    // Kaynağın sahnesi yoksa oluşturulur.
    const { config: c1, source } = addSource(base, sourceDefaults("image"));
    const c2 = normalizeScenesConfig({ ...c1, programSceneId: sourceSceneId(source.id) });
    expect(c2.scenes).toHaveLength(base.scenes.length + 1);
    const pgm = c2.scenes.find((s) => s.id === c2.programSceneId);
    expect(pgm.layers[0].sourceId).toBe(source.id);
  });
});

describe("sahne şablonları", () => {
  it("Tek kaynak, Resim içinde resim, Yan yana, Üçlü: kaynaklar sırayla, kutular ekranda", () => {
    const base = defaultScenesConfig();
    expect(SCENE_TEMPLATES.map((t) => t.key)).toEqual(["empty", "single", "pip", "sbs", "triple", "start", "break", "end"]);
    expect(templateSourceIds(base, 3)).toEqual(["src_cam1", "src_cam2", "src_cam2"]);
    const pip = sceneFromTemplate(base, "pip").scene;
    expect(pip.layers.map((l) => l.sourceId)).toEqual(["src_cam1", "src_cam2"]);
    expect(pip.layers[1].w).toBeCloseTo(0.3);
    const sbs = sceneFromTemplate(base, "sbs", { sourceIds: ["src_cam2", "src_cam1"], name: "İkili" }).scene;
    expect(sbs.name).toBe("İkili");
    expect(sbs.layers[0].sourceId).toBe("src_cam2");
    expect(sbs.layers[0].x + sbs.layers[0].w).toBeLessThanOrEqual(sbs.layers[1].x);
    const tri = sceneFromTemplate(base, "triple").scene;
    expect(tri.layers).toHaveLength(3);
    for (const l of tri.layers) { expect(l.x + l.w).toBeLessThanOrEqual(1); expect(l.y + l.h).toBeLessThanOrEqual(1); }
    const one = sceneFromTemplate(base, "single").scene;
    expect(one.layers[0]).toMatchObject({ x: 0, y: 0, w: 1, h: 1 });
    const empty = sceneFromTemplate(base, "empty").scene;
    expect(empty.layers).toEqual([]);
  });
  it("hazır ekranlar: kendi kaynaklarıyla gelir, etiketlenir, geri sayım yayına alınınca başlar", () => {
    const base = defaultScenesConfig();
    const { config, scene } = sceneFromTemplate(base, "start", { minutes: 5 });
    expect(scene.template).toBe("start");
    expect(readySceneOf(config, "start").id).toBe(scene.id);
    expect(config.sources.length).toBe(base.sources.length + 3);
    const clock = config.sources.find((s) => s.kind === "clock");
    expect(clock).toMatchObject({ mode: "countdown", durationMs: 300000, startOnAir: true, targetAt: null });
    // Normalize etiketi korur.
    expect(normalizeScenesConfig(JSON.parse(JSON.stringify(config))).scenes.find((s) => s.id === scene.id).template).toBe("start");
    const aired = startSceneCountdowns(config, scene.id, 1000);
    expect(aired.sources.find((s) => s.id === clock.id).targetAt).toBe(301000);
    expect(startSceneCountdowns(config, "sc_cam1", 1000)).toBe(config);
    const end = sceneFromTemplate(base, "end").config;
    expect(end.sources.some((s) => s.kind === "clock")).toBe(false);
  });
});

describe("kayıt boyutu tahmini", () => {
  it("(görüntü + ses kbps) × 600 / 8", () => {
    expect(recordBytes(6000, 128, 600)).toBe(459_600_000);
    expect(formatSizeEstimate(459_600_000)).toBe("≈ 460 MB / 10 dk");
    expect(formatSizeEstimate(recordBytes(12000, 128))).toBe("≈ 910 MB / 10 dk");
    expect(formatSizeEstimate(recordBytes(20000, 128))).toBe("≈ 1,5 GB / 10 dk");
  });
  it("kalite seçimine göre; 'yayınla aynı' yayın bit hızını kullanır", () => {
    const s = normalizeSettings(null);
    expect(recordEstimate(s.record, { streamVideoKbps: 2500, audioKbps: 128 }).videoKbps).toBe(2500);
    const high = patchSettings(s, "record", { quality: "high" });
    expect(recordEstimate(high.record, { streamVideoKbps: 2500, audioKbps: 128 }).text).toBe(formatSizeEstimate(recordBytes(12000, 128)));
    const custom = patchSettings(s, "record", { quality: "custom", customKbps: 9000 });
    expect(recordEstimate(custom.record, { streamVideoKbps: 2500, audioKbps: 160 }).bytes10).toBe(recordBytes(9000, 160));
  });
  it("studio.start localRecord: kapalıyken null, ayrı kalitede bit hızı + yükseklik", () => {
    const s = normalizeSettings(null);
    expect(localRecordOptions(s.record, { streamVideoKbps: 2500 })).toBeNull();
    expect(localRecordOptions({ ...s.record, enabled: true, dir: "/x" }, { streamVideoKbps: 2500 })).toEqual({ enabled: true, dir: "/x" });
    expect(localRecordOptions({ ...s.record, enabled: true, quality: "low" }, { streamVideoKbps: 2500 })).toEqual({ enabled: true, videoBitrateKbps: 4000, height: 720 });
  });
});

describe("ayarlar kalıcılığı", () => {
  it("kaydet / yükle, bozuk kayıt varsayılana, eski tercihlerden göç", () => {
    const st = memStore();
    const s = patchSettings(normalizeSettings(null), "stream", { audioKbps: 192, encoder: "software" });
    expect(saveSettings(st, s)).toBe(true);
    expect(loadSettings(st).stream).toMatchObject({ audioKbps: 192, encoder: "software" });
    expect(loadSettings(memStore({ [SETTINGS_KEY]: "{bozuk" })).stream.audioKbps).toBe(128);
    expect(loadSettings(memStore(), { localRec: { enabled: true, dir: "/Movies" } }).record).toMatchObject({ enabled: true, dir: "/Movies", quality: "stream" });
    const n = normalizeSettings({ stream: { audioKbps: 999, keyframeSec: 7 }, replay: { seconds: 99 }, view: { scale: 300 }, notify: { silenceSec: 2 } });
    expect(n.stream).toMatchObject({ audioKbps: 128, keyframeSec: 2 });
    expect(n.replay.seconds).toBe(30);
    expect(n.view.scale).toBe(100);
    expect(n.notify.silenceSec).toBe(10);
    const throwing = { getItem: () => { throw new Error("x"); }, setItem: () => { throw new Error("x"); } };
    expect(loadSettings(throwing).v).toBe(1);
    expect(saveSettings(throwing, n)).toBe(false);
  });
  it("kısayollar: yeniden atama çakışanı kaldırır, ayrılmış tuşlar atanamaz, keyAction yeni tuşu kullanır", () => {
    let h = bindHotkey(DEFAULT_HOTKEYS, "chapter", "M");
    expect(h.chapter).toEqual(["m"]);
    expect(h.mic).toEqual([]);
    expect(actionForKey(h, "m")).toBe("chapter");
    expect(bindHotkey(h, "mic", "1")).toBe(h);
    h = bindHotkey(h, "mic", "k");
    const ev = (key) => ({ key, target: { tagName: "DIV" } });
    expect(keyAction(ev("k"), { hotkeys: h })).toEqual({ type: "mic" });
    expect(keyAction(ev("M"), { hotkeys: h })).toEqual({ type: "chapter" });
    expect(keyAction(ev(" "), { hotkeys: h })).toEqual({ type: "transition" });
    expect(keyAction(ev("3"), { hotkeys: h })).toEqual({ type: "scene", index: 2 });
    expect(keyAction(ev("l"))).toEqual({ type: "lastScene" });
    expect(keyAction({ key: " ", target: { tagName: "BUTTON" } })).toBeNull();
    // normalize yinelenen tuşu ikinci eylemden atar
    expect(normalizeSettings({ hotkeys: { mic: ["x"], replay: ["x"] } }).hotkeys.replay).toEqual([]);
  });
  it("uyarılar: düşük bit hızı ve sessizlik", () => {
    expect(isLowBitrate({ bitrateKbps: 1000 }, 2500)).toBe(true);
    expect(isLowBitrate({ bitrateKbps: 2000 }, 2500)).toBe(false);
    let st = silenceStep(null, { level: 0, now: 0, active: true, limitMs: 30000 });
    st = silenceStep(st, { level: 0.001, now: 29000, active: true, limitMs: 30000 });
    expect(st.warn).toBe(false);
    st = silenceStep(st, { level: 0, now: 30500, active: true, limitMs: 30000 });
    expect(st.warn).toBe(true);
    expect(silenceStep(st, { level: 0.2, now: 31000, active: true }).warn).toBe(false);
    expect(silenceStep(st, { level: 0, now: 99999, active: false }).silentForMs).toBe(0);
  });
});

describe("LED yönlendirme", () => {
  const ids = { programId: "pgm", previewId: "pvw", sceneIds: ["pgm", "pvw", "sp"] };
  it("varsayılan Program; önizleme, belirli sahne, kapalı; silinen sahne programa düşer", () => {
    expect(normalizeLedRoute(null)).toEqual({ route: "program", sceneId: null });
    expect(ledTargetScene(null, ids)).toBe("pgm");
    expect(ledTargetScene({ route: "preview" }, ids)).toBe("pvw");
    expect(ledTargetScene({ route: "scene", sceneId: "sp" }, ids)).toBe("sp");
    expect(ledTargetScene({ route: "scene", sceneId: "yok" }, ids)).toBe("pgm");
    expect(ledTargetScene({ route: "off" }, ids)).toBeNull();
    expect(normalizeLedRoute({ route: "scene" }).route).toBe("program");
  });
  it("program değişince LED de değişir (Program yönlendirmesi)", () => {
    expect(ledTargetScene({ route: "program" }, { ...ids, programId: "sp" })).toBe("sp");
  });
  it("kutudaki LED'e ver: sabitle / tekrar basınca Program'a dön; rozet", () => {
    const r1 = routeSceneToLed({ route: "program" }, "sp", ids);
    expect(r1).toEqual({ route: "scene", sceneId: "sp" });
    expect(routeSceneToLed(r1, "sp", ids).route).toBe("program");
    expect(routeSceneToLed({ route: "program" }, "pgm", ids).route).toBe("program");
    expect(ledShowsScene(r1, "sp", ids)).toBe(true);
    expect(ledShowsScene(r1, "sp", ids, false)).toBe(false);
    expect(ledRouteLabel(r1, () => "Sponsor")).toBe("Sahne: Sponsor");
  });
});

describe("YouTube bölümleri", () => {
  it("00:00 ile başlar, sıralı, 10 sn'den yakınlar birleşir", () => {
    expect(chapterStamp(751000)).toBe("12:31");
    expect(chapterStamp(3729000)).toBe("1:02:09");
    const text = youtubeChapters([{ atMs: 751000, label: "Gol – Ali" }, { atMs: 120000, label: "İlk yarı" }, { atMs: 755000, label: "Tekrar" }]);
    expect(text.split("\n")).toEqual(["00:00 Başlangıç", "02:00 İlk yarı", "12:31 Gol – Ali · Tekrar"]);
    expect(youtubeChapters([{ atMs: 3000, label: "Başlama düdüğü" }]).split("\n")[0]).toBe("00:00 Başlama düdüğü");
  });
});
