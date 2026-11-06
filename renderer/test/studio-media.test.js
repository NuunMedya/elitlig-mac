// Yayın Stüdyosu: YouTube bölümleri, ön ayar şablonları, sahne başına ses,
// kaynak kalıcılığı göçü, tekrar yakınlaştırma görünümü.
import { CHAPTER_MIN_GAP_MS, chapterRules, chapterSignature, chaptersText, nextChapterStart, normalizeChapters, parseStamp } from "../src/views/studio/youtube/chapters";
import {
  markDefault, normalizePresets, normalizeSettings, parseTags, presetFromSettings, renderTemplate, settingsFromPreset, startBody, templateVars, trDate, validateSettings,
} from "../src/views/studio/youtube/templates";
import { resolveForm } from "../src/views/studio/youtube/YoutubeStartDialog";
import { presetBody } from "../src/views/studio/youtube/useYoutubePresets";
import {
  audioInputFromDraft, liveInScene, normalizeAudio, programAudioChannels, sceneGain, scenesText, setStripAllScenes, setStripScene, stripAirState, stripList, stripScenes,
} from "../src/lib/studio/audio";
import { addSource, defaultScenesConfig, loadScenesConfig, normalizeScenesConfig, persistentUrl, saveScenesConfig, sourceNeedsFile } from "../src/lib/studio/scenes";
import { matchScreen } from "../src/views/studio/useStudioSources";
import { DEFAULT_VIEW, MAX_ZOOM, clampView, clipTime, panBy, setZoom, viewKey, zoomAt, zoomRect } from "../src/views/studio/modes/replayView";

const memStore = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }; };

describe("YouTube bölümleri: normalleştirme ve kurallar", () => {
  it("ilk bölüm 0:00, sıralı, yakınlar birleşir, ilk 10 sn'deki işaret 0:00'ın adı olur", () => {
    const list = normalizeChapters([
      { atMs: 751000, label: "Gol – Ali" }, { atMs: 3000, label: "Başlama düdüğü" }, { atMs: 120000, label: "İlk yarı" }, { atMs: 755000, label: "Tekrar" },
    ]);
    expect(list).toEqual([
      { at_ms: 0, label: "Başlama düdüğü" },
      { at_ms: 120000, label: "İlk yarı" },
      { at_ms: 751000, label: "Gol – Ali · Tekrar" },
    ]);
    expect(chaptersText(list)).toBe("00:00 Başlama düdüğü\n02:00 İlk yarı\n12:31 Gol – Ali · Tekrar");
    expect(chapterRules(list)).toEqual({ ok: true, problems: [] });
  });
  it("boş / bozuk girdiler, ad temizliği, sunucu biçimi (at_ms) girdi olarak", () => {
    expect(normalizeChapters()).toEqual([{ at_ms: 0, label: "Başlangıç" }]);
    const l = normalizeChapters([{ at_ms: 60000, label: "  <b>Gol</b>\n " }, { atMs: "x" }, { atMs: -5, label: "" }]);
    expect(l[0]).toEqual({ at_ms: 0, label: "Bölüm" });
    expect(l[1]).toEqual({ at_ms: 60000, label: "b Gol /b" });
    expect(normalizeChapters([{ atMs: 1000, label: "A" }, { atMs: 4000, label: "B" }])).toEqual([{ at_ms: 0, label: "A · B" }]);
  });
  it("kurallar: 0:00, en az 3, en az 10 sn", () => {
    expect(chapterRules([{ at_ms: 0, label: "a" }, { at_ms: 60000, label: "b" }]).problems).toHaveLength(1);
    expect(chapterRules([{ at_ms: 5, label: "a" }, { at_ms: 60000, label: "b" }, { at_ms: 90000, label: "c" }]).ok).toBe(false);
    expect(chapterRules([{ at_ms: 0, label: "a" }, { at_ms: 5000, label: "b" }, { at_ms: 90000, label: "c" }]).problems[0]).toMatch(/10 sn/);
    expect(CHAPTER_MIN_GAP_MS).toBe(10000);
    expect(chapterSignature([{ at_ms: 0, label: "a" }])).toBe("0:a");
  });
  it("başlangıç: yeniden bağlanmada korunur, provayı ilk gerçek yayın geçersiz kılar", () => {
    let e = nextChapterStart(null, { since: 1000, mode: "rehearsal" });
    expect(e).toMatchObject({ startAt: 1000, startKind: "rehearsal" });
    e = { ...e, items: [{ id: "a", at: 1500 }, { id: "b", at: 9000 }] };
    e = nextChapterStart(e, { since: 5000, mode: "live" });
    expect(e).toMatchObject({ startAt: 5000, startKind: "live" });
    expect(e.items.map((x) => x.id)).toEqual(["b"]);
    // Kopma + yeniden bağlanma: since değişir, başlangıç değişmez.
    expect(nextChapterStart(e, { since: 99000, mode: "live" }).startAt).toBe(5000);
    expect(nextChapterStart(e, { since: null, mode: "live" })).toBe(e);
  });
  it("zaman metni → ms", () => {
    expect(parseStamp("12:31")).toBe(751000);
    expect(parseStamp("1:02:09")).toBe(3729000);
    expect(parseStamp("45")).toBe(45000);
    expect(parseStamp("1:xx")).toBeNull();
    expect(parseStamp("")).toBeNull();
  });
});

describe("YouTube ön ayarları: şablonlar", () => {
  const match = { id: 42, first_team_name: "Ankara Gücü", second_team_name: "Yıldızspor", date: "2026-11-06", time: "20:30:00", league_name: "Elit Lig", match_season: "2026-27", match_field: "none", city: "Ankara" };
  const vars = templateVars(match);
  it("maç verisi → değişkenler", () => {
    expect(vars).toEqual({ home: "Ankara Gücü", away: "Yıldızspor", date: "6 Kasım 2026", time: "20:30", league: "Elit Lig", season: "2026-27", venue: "", city: "Ankara", link: "https://elitlig.com/maclar/42" });
    expect(templateVars(match, { homeName: "AG", link: "https://x.y/z" })).toMatchObject({ home: "AG", link: "https://x.y/z" });
    expect(trDate("2026-01-31T10:00:00Z")).toBe("31 Ocak 2026");
  });
  it("şablon doldurma: boş değerin ayraçları temizlenir, bilinmeyen yer tutucu kalır", () => {
    expect(renderTemplate("{home} – {away} | {league}", vars)).toBe("Ankara Gücü – Yıldızspor | Elit Lig");
    expect(renderTemplate("{date} {time} · {venue} · {city}", vars)).toBe("6 Kasım 2026 20:30 · Ankara");
    expect(renderTemplate("{venue} · {home}\n{link} {nope}", vars)).toBe("Ankara Gücü\nhttps://elitlig.com/maclar/42 {nope}");
    expect(renderTemplate("Sezon {season}", vars)).toBe("Sezon 2026-27");
  });
  it("ön ayar ↔ form: maç adları yer tutucuya geri çevrilir", () => {
    const p = presetFromSettings("Lig maçı", { title: "Ankara Gücü – Yıldızspor | Elit Lig", description: "Canlı: Ankara", tags: ["elitlig", "Ankara Gücü"], privacy: "unlisted", latency: "low" }, vars);
    expect(p).toMatchObject({ name: "Lig maçı", title_template: "{home} – {away} | {league}", description_template: "Canlı: {city}", tags: ["elitlig", "{home}"], privacy: "unlisted", latency: "low", dvr: true, made_for_kids: false });
    const other = templateVars({ first_team_name: "Kartal", second_team_name: "Şahin", league_name: "Elit Lig" });
    expect(settingsFromPreset(p, other)).toMatchObject({ title: "Kartal – Şahin | Elit Lig", tags: ["elitlig", "Kartal"], privacy: "unlisted" });
    expect(presetBody({ ...p, id: "x", local: true, updated_at: "t", is_default: true })).toEqual({ ...p, is_default: true });
  });
  it("form ayarları, etiketler, başlatma gövdesi, doğrulama", () => {
    expect(parseTags("elitlig, #Futbol,, futbol , Elit Lig")).toEqual(["elitlig", "Futbol", "Elit Lig"]);
    expect(parseTags(Array.from({ length: 200 }, (_, i) => `etiket${i}`)).join(",").length).toBeLessThanOrEqual(500);
    expect(normalizeSettings({ privacy: "x", latency: "y", dvr: undefined })).toMatchObject({ privacy: "public", latency: "normal", dvr: true, made_for_kids: false, tags: [] });
    expect(startBody({ title: "  ", privacy: "private", latency: "ultraLow", dvr: true })).toEqual({ description: "", privacy: "private", tags: [], latency: "ultraLow", dvr: false, made_for_kids: false });
    expect(startBody({ title: "T", latency: "low" }, { edit: true })).toEqual({ title: "T", description: "", privacy: "public", tags: [] });
    expect(validateSettings({ title: "a<b" })).toHaveLength(1);
    expect(validateSettings({ title: "" })[0]).toMatch(/Başlık boş/);
    expect(resolveForm({ title: "{home} canlı", description: "{league}", tagsText: "{away}, x", privacy: "public" }, vars)).toMatchObject({ title: "Ankara Gücü canlı", description: "Elit Lig", tags: ["Yıldızspor", "x"] });
  });
  it("yerel ön ayarlar: varsayılan tek", () => {
    const list = markDefault([{ id: "a", name: "A", is_default: true }, { id: "b", name: "B" }, { name: "kimliksiz" }], "b");
    expect(list.map((p) => [p.id, p.is_default])).toEqual([["a", false], ["b", true]]);
    expect(normalizePresets(null)).toEqual([]);
  });
});

describe("ses: ek kaynaklar ve sahne başına yönlendirme", () => {
  const scenes = ["s1", "s2", "s3"];
  it("eski girişler aygıt olur; dosya girişlerinde blob: adresi 'yeniden seç' olur", () => {
    const a = normalizeAudio({ inputs: [{ id: "i1", deviceId: "d1", name: "Kart" }, { id: "f1", kind: "file", url: "blob:x", fileName: "jingle.mp3" }, { id: "f2", kind: "file", url: "elitlig-studio://media/abc/m.mp3" }] });
    expect(a.inputs[0]).toMatchObject({ kind: "device", deviceId: "d1", scenes: null });
    expect(a.inputs[1]).toMatchObject({ kind: "file", url: null, fileMissing: true, loop: true, autoPlay: true });
    expect(a.inputs[2]).toMatchObject({ kind: "file", url: "elitlig-studio://media/abc/m.mp3", fileMissing: false });
    expect(stripList(a).map((s) => [s.id, s.group])).toEqual([["mic", "live"], ["i1", "live"], ["f1", "music"], ["f2", "music"], ["media", "media"], ["highlight", "media"], ["music", "music"]]);
    expect(a.killAll).toBe(false);
  });
  it("kaynak penceresi taslağı → giriş", () => {
    expect(audioInputFromDraft({ deviceId: "d9", name: "Telsiz" }, "x")).toMatchObject({ id: "x", kind: "device", deviceId: "d9", name: "Telsiz", volume: 100, muted: false });
    expect(audioInputFromDraft({ audioMode: "file", url: "elitlig-studio://media/aa/b.mp3", fileName: "b.mp3", filePath: "/m/b.mp3" }, "y")).toMatchObject({ id: "y", kind: "file", name: "b.mp3", filePath: "/m/b.mp3" });
  });
  it("Bu sahnede yayına ver: tümü → liste → tümü", () => {
    let a = normalizeAudio({ inputs: [{ id: "i1", deviceId: "d" }] });
    expect(stripScenes(a, "i1")).toBeNull();
    expect(liveInScene(null, "s2")).toBe(true);
    a = setStripScene(a, "i1", "s2", false, scenes);
    expect(stripScenes(a, "i1")).toEqual(["s1", "s3"]);
    expect(sceneGain(a, "i1", "s2")).toBe(0);
    expect(sceneGain(a, "i1", "s1")).toBe(1);
    expect(sceneGain(a, "i1", null)).toBe(0);
    a = setStripScene(a, "i1", "s2", true, scenes);
    expect(stripScenes(a, "i1")).toBeNull();
    a = setStripAllScenes(a, "mic", false);
    expect(stripScenes(a, "mic")).toEqual([]);
    a = setStripScene(a, "mic", "s3", true, scenes);
    expect(stripScenes(a, "mic")).toEqual(["s3"]);
    expect(scenesText(stripScenes(a, "mic"), [{ id: "s3", name: "Devre arası" }])).toBe("Devre arası");
    expect(scenesText(null)).toBe("Tüm sahneler");
    expect(scenesText([])).toBe("Hiçbir sahne");
    // Sabit şeritlerin sahne listesi yok (her sahnede).
    expect(sceneGain(a, "media", "s1")).toBe(1);
  });
  it("yayın durumu: sessiz, sahnede yok, yönlendirme, tümünü kapat", () => {
    let a = normalizeAudio({ mic: { muted: false }, inputs: [{ id: "i1", deviceId: "d", scenes: ["s1"] }] });
    expect(stripAirState(a, "mic", { context: "live", programSceneId: "s2" })).toMatchObject({ onAir: true, reason: "Yayında" });
    expect(stripAirState(a, "i1", { context: "live", programSceneId: "s2" })).toMatchObject({ onAir: false, inScene: false, reason: "Bu sahnede kapalı" });
    expect(stripAirState(a, "media", { context: "replay" }).reason).toMatch(/Yönlendirme kapalı/);
    a = { ...a, mic: { ...a.mic, muted: true } };
    expect(stripAirState(a, "mic", { context: "live" })).toMatchObject({ onAir: false, muted: true, reason: "Sessiz" });
    a = { ...a, killAll: true };
    expect(stripAirState(a, "i1", { context: "live", programSceneId: "s1" })).toMatchObject({ onAir: false, killed: true, reason: "Tüm sesler kapalı" });
  });
  it("program ses şeridi: bu sahnede yönlendirilen kanallar (sessizler de görünür)", () => {
    const a = normalizeAudio({ mic: { muted: true }, inputs: [{ id: "i1", deviceId: "d", name: "Kart", scenes: ["s1"] }, { id: "f1", kind: "file", name: "Jingle", url: "elitlig-studio://media/aa/j.mp3" }] });
    const sources = [{ id: "v1", kind: "video", name: "Reklam" }, { id: "c1", kind: "camera", name: "Kamera" }];
    const ch = programAudioChannels(a, { context: "live", programSceneId: "s1", programIds: ["v1", "c1"], sources, filePlaying: { f1: true }, musicPlaying: false });
    expect(ch.map((c) => [c.key, c.stripId, c.onAir, c.muted])).toEqual([["mic", "mic", false, true], ["i1", "i1", true, false], ["f1", "f1", true, false], ["video:v1", "media", true, false]]);
    // Başka sahne: Kart düşer; dosya çalmıyorsa görünmez.
    expect(programAudioChannels(a, { context: "live", programSceneId: "s2", sources }).map((c) => c.key)).toEqual(["mic"]);
    // Tekrar yayında: yalnız canlı mikrofon barası (varsayılan), tekrar sesi yönlendirilmemiş.
    expect(programAudioChannels(a, { context: "replay", programSceneId: "s1" }).map((c) => c.key)).toEqual(["mic", "i1"]);
    expect(programAudioChannels({ ...a, routing: { replay: { media: true } } }, { context: "replay", programSceneId: "s1" }).map((c) => c.key)).toContain("media");
  });
});

describe("kaynak kalıcılığı: göç ve yeniden bulma", () => {
  it("blob: adresli eski kaynaklar 'dosya bulunamadı' olur, kalıcı adresler korunur", () => {
    const c = normalizeScenesConfig({
      version: 3,
      sources: [
        { id: "v", kind: "video", name: "Tanıtım", url: "blob:file:///abc", fileName: "tanitim.mp4" },
        { id: "w", kind: "video", name: "Reklam", url: "elitlig-studio://media/0123456789abcdef01234567/reklam.mp4", filePath: "/Users/x/reklam.mp4" },
        { id: "i", kind: "image", name: "Logo", url: "data:image/png;base64,AAA" },
        { id: "j", kind: "image", name: "Afiş", url: "blob:xyz" },
        { id: "s", kind: "slideshow", name: "Slayt", images: ["blob:1", "elitlig-studio://media/aa/1.jpg", "data:image/png;base64,B"] },
      ],
      scenes: [{ id: "sc", name: "S", layers: [{ id: "l", sourceId: "v" }] }],
      programSceneId: "sc", previewSceneId: "sc",
    });
    const by = Object.fromEntries(c.sources.map((s) => [s.id, s]));
    expect(by.v).toMatchObject({ url: null, fileMissing: true, fileName: "tanitim.mp4" });
    expect(by.w.url).toMatch(/^elitlig-studio:\/\/media\//);
    expect(by.w.fileMissing).toBeUndefined();
    expect(by.i.url).toMatch(/^data:/);
    expect(by.j).toMatchObject({ url: null, fileMissing: true });
    expect(by.s.images).toEqual(["elitlig-studio://media/aa/1.jpg", "data:image/png;base64,B"]);
    expect(by.s.missingImages).toBe(1);
    expect(sourceNeedsFile(by.v)).toBe(true);
    expect(sourceNeedsFile(by.w)).toBe(false);
    expect(persistentUrl("blob:x")).toBe(false);
    expect(persistentUrl("elitlig-studio://media/a/b")).toBe(true);
  });
  it("kaydet → yeniden aç: kalıcı dosya kaynağı aynı adresle gelir", () => {
    const store = memStore();
    const { config } = addSource(defaultScenesConfig(), { kind: "video", name: "Jenerik", url: "elitlig-studio://media/0123456789abcdef01234567/j.mp4", filePath: "/Users/x/j.mp4", fileName: "j.mp4", loop: true });
    expect(saveScenesConfig(store, config)).toBe(true);
    const back = loadScenesConfig(store).sources.find((s) => s.name === "Jenerik");
    expect(back).toMatchObject({ url: "elitlig-studio://media/0123456789abcdef01234567/j.mp4", filePath: "/Users/x/j.mp4" });
  });
  it("ekran / pencere: kimlik değişince adıyla bulunur", () => {
    const list = [{ id: "screen:1:0", name: "Ekran 1", kind: "screen" }, { id: "window:77:0", name: "Skorbord — Chrome", kind: "window" }, { id: "window:78:0", name: "Notlar", kind: "window" }];
    expect(matchScreen({ kind: "window", screenId: "window:77:0", screenName: "x" }, list)).toBe("window:77:0");
    expect(matchScreen({ kind: "window", screenId: "window:12:0", screenName: "Skorbord — Chrome" }, list)).toBe("window:77:0");
    expect(matchScreen({ kind: "window", screenId: "window:12:0", screenName: "Skorbord — Chrome (2)" }, list)).toBe("window:77:0");
    expect(matchScreen({ kind: "window", screenId: "window:12:0", screenName: "Yok" }, list)).toBeNull();
    expect(matchScreen({ kind: "screen", screenId: "screen:9:0", screenName: "Eski ekran" }, list)).toBe("screen:1:0");
    expect(matchScreen({ kind: "screen", screenId: "screen:9:0" }, null)).toBe("screen:9:0");
  });
});

describe("tekrar düzenleyici: yakınlaştırma görünümü", () => {
  it("sınırlar, imleç altında yakınlaştırma, kaydırma", () => {
    expect(clampView({ zoom: 99, cx: -1, cy: 2 })).toEqual({ zoom: MAX_ZOOM, cx: 0.5 / MAX_ZOOM, cy: 1 - 0.5 / MAX_ZOOM });
    expect(clampView(null)).toEqual(DEFAULT_VIEW);
    const v = zoomAt(DEFAULT_VIEW, 1, 1, 2); // sağ alt köşeye 2×
    expect(v).toEqual({ zoom: 2, cx: 0.75, cy: 0.75 });
    // İmlecin altındaki nokta yerinde kalır.
    const p = { x: 0.3, y: 0.6 };
    const before = { u: 0.5 + (p.x - 0.5) / 1, w: 0.5 + (p.y - 0.5) / 1 };
    const z = zoomAt(DEFAULT_VIEW, p.x, p.y, 1.5);
    expect(z.cx + (p.x - 0.5) / z.zoom).toBeCloseTo(before.u, 9);
    expect(z.cy + (p.y - 0.5) / z.zoom).toBeCloseTo(before.w, 9);
    expect(zoomAt(v, 0.5, 0.5, 0.1).zoom).toBe(1);
    expect(panBy({ zoom: 2, cx: 0.5, cy: 0.5 }, 0.1, 0)).toEqual({ zoom: 2, cx: 0.45, cy: 0.5 });
    expect(panBy(DEFAULT_VIEW, 0.3, 0.3)).toEqual(DEFAULT_VIEW);
    expect(setZoom({ zoom: 2, cx: 0.75, cy: 0.75 }, 1.5).cx).toBeCloseTo(2 / 3, 9);
  });
  it("kaynak dikdörtgeni (yayına çizilen bölge)", () => {
    expect(zoomRect(1920, 1080, DEFAULT_VIEW)).toEqual({ sx: 0, sy: 0, sw: 1920, sh: 1080 });
    expect(zoomRect(1920, 1080, { zoom: 2, cx: 0.75, cy: 0.25 })).toEqual({ sx: 960, sy: 0, sw: 960, sh: 540 });
    expect(viewKey("r1", "program")).toBe("r1|program");
    expect(clipTime(67.45)).toBe("1:07,5");
  });
});

describe("modül yükleme", () => {
  it("ProgramAudioStrip ve YouTube penceresi yüklenir", async () => {
    const strip = await import("../src/views/studio/audio/ProgramAudioStrip.jsx");
    expect(typeof strip.default).toBe("function");
    const dlg = await import("../src/views/studio/youtube/YoutubeStartDialog.jsx");
    expect(typeof dlg.default).toBe("function");
    expect(typeof dlg.useYoutubeStart).toBe("function");
    const ed = await import("../src/views/studio/modes/ReplayPreviewOverlay.jsx");
    expect(ed.default).toBeTruthy(); // memo bileşeni
  });
});
