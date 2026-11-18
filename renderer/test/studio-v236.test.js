// 2.36.0 · Elitlig Stüdyo (bağımsız uygulama) arayüz parçaları ve stüdyo performansı:
// ayar aktarımı, kip tabanı video delikleri (işçide çizim), açı kaydı ayarları, gizli sekmeleri
// park etme, performans tercihleri, çökme bildirimi metni, rapor satırları, çok sayfalı paket.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { applyStudioEntries, collectStudioEntries, importFromAraclar, isStudioKey, SCENES_KEY } from "../src/lib/studioMigration";
import { createHoleCtx } from "../src/views/studio/compositor/videoHoles";
import { ANGLE_MAX_CHOICES, ANGLE_QUALITIES, DEFAULT_SETTINGS, angleKbps, limitAngleSources, normalizeSettings } from "../src/views/studio/settings/settings";
import { PERF_PREFS_KEY, readPerfPrefs, writePerfPrefs } from "../src/views/studio/perf/perfPrefs";
import { processGoneText } from "../src/studioApp/useProcessGoneToasts";
import { reportText } from "../src/views/studio/perf/perfReport";
import { angleStats, setAngleStats } from "../src/views/studio/perf/angleStats";

const SRC = path.join(__dirname, "..", "src");
const read = (p) => fs.readFileSync(path.join(SRC, p), "utf8");

function memStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return {
    get length() { return m.size; },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    dump: () => Object.fromEntries(m),
  };
}

describe("ayar aktarımı (Elitlig Araçlar → Elitlig Stüdyo)", () => {
  it("yalnız studio.* ve elitlig.studio.* anahtarları", () => {
    const st = memStorage({ "studio.v3": "a", "studio.layout.v1": "b", "elitlig.studio.youtubeCover.v1": "c", route: "today", "sidebar.collapsed": "1", "araclar.studioBuiltin": "1", "notes.v1": "x" });
    expect(Object.keys(collectStudioEntries(st)).sort()).toEqual(["elitlig.studio.youtubeCover.v1", "studio.layout.v1", "studio.v3"]);
    expect(isStudioKey("araclar.studioBuiltin")).toBe(false);
  });
  it("ilk açılış: stüdyo kurulmamışsa yazar ve işaretler; kuruluysa atlar; zorla: üzerine yazar", async () => {
    const calls = [];
    const bridge = { importState: async ({ force }) => ({ entries: { "studio.v3": "ARACLAR", "studio.rail.v1": "R", route: "x" }, version: "2.36.0", copied: ["studio-settings.json"], force }), importDone: async (i) => calls.push(i) };
    const fresh = memStorage();
    const r1 = await importFromAraclar(bridge, fresh);
    expect(r1.imported).toBe(2);
    expect(fresh.getItem("studio.v3")).toBe("ARACLAR");
    expect(fresh.getItem("route")).toBe(null);
    expect(calls[0].keys).toBe(2);
    const configured = memStorage({ [SCENES_KEY]: "KENDİ" });
    const r2 = await importFromAraclar(bridge, configured);
    expect(r2.skipped).toBe(true);
    expect(configured.getItem("studio.v3")).toBe("KENDİ");
    expect(calls[1].skipped).toBe(true);
    const r3 = await importFromAraclar(bridge, configured, { force: true });
    expect(r3.imported).toBe(2);
    expect(configured.getItem("studio.v3")).toBe("ARACLAR");
  });
  it("dışa aktarım yoksa / köprü yoksa null", async () => {
    expect(await importFromAraclar(null, memStorage())).toBe(null);
    expect(await importFromAraclar({ importState: async () => null, importDone: async () => {} }, memStorage())).toBe(null);
  });
  it("applyStudioEntries: force değilse var olana dokunmaz", () => {
    const st = memStorage({ "studio.a": "1" });
    expect(applyStudioEntries(st, { "studio.a": "2", "studio.b": "3" })).toBe(1);
    expect(st.getItem("studio.a")).toBe("1");
  });
});

/** Sahte 2B bağlam: çağrıları kaydeder. */
function fakeCtx() {
  const log = [];
  const ctx = {
    log, filter: "none", globalCompositeOperation: "source-over", globalAlpha: 1, fillStyle: "#fff",
    _m: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
    getTransform() { return { ...this._m }; },
    setTransform(a, b, c, d, e, f) { this._m = { a, b, c, d, e, f }; },
    _st: [],
    save() { log.push(["save"]); this._st.push([this.globalCompositeOperation, this.globalAlpha, this.fillStyle, this.filter]); },
    restore() { log.push(["restore"]); const p = this._st.pop(); if (p) [this.globalCompositeOperation, this.globalAlpha, this.fillStyle, this.filter] = p; },
    clip() { log.push(["clip"]); },
    drawImage(...a) { log.push(["drawImage", a[0]?.tag || "?", a.length - 1]); },
    fillRect(...a) { log.push(["fillRect", this.globalCompositeOperation, ...a]); },
    canvas: { width: 1920, height: 1080 },
  };
  return ctx;
}
class FakeVideo { constructor(tag) { this.tag = tag; this.readyState = 4; this.videoWidth = 1280; this.videoHeight = 720; } }

describe("kip tabanı: videolar işçide (video delikleri)", () => {
  const isVideo = (el) => el instanceof FakeVideo;
  it("hazır video: piksel çizilmez, yer bildirilir, bölge delinir", () => {
    const ctx = fakeCtx();
    const placements = [];
    const v = new FakeVideo("v1");
    const h = createHoleCtx(ctx, { placements, isVideo, feedFor: () => ({ id: "vid:1", ready: true }) });
    h.globalAlpha = 0.5;
    h.setTransform(2, 0, 0, 2, 10, 20);
    h.drawImage(v, 0, 0, 640, 360);
    expect(ctx.log.some((l) => l[0] === "drawImage")).toBe(false);
    expect(placements).toEqual([{ id: "vid:1", vw: 1280, vh: 720, s: [0, 0, 1280, 720], d: [0, 0, 640, 360], m: [2, 0, 0, 2, 10, 20], a: 0.5 }]);
    expect(ctx.log).toContainEqual(["fillRect", "destination-out", 0, 0, 640, 360]);
    expect(ctx.globalCompositeOperation).toBe("source-over");
  });
  it("9 bağımsız değişkenli kırpma (kaynak dikdörtgeni) ve 3'lü biçim", () => {
    const placements = [];
    const h = createHoleCtx(fakeCtx(), { placements, isVideo, feedFor: () => ({ id: "v", ready: true }) });
    h.drawImage(new FakeVideo("a"), 100, 50, 640, 360, 0, 0, 1920, 1080);
    h.drawImage(new FakeVideo("b"), 5, 6);
    expect(placements[0].s).toEqual([100, 50, 640, 360]);
    expect(placements[0].d).toEqual([0, 0, 1920, 1080]);
    expect(placements[1].d).toEqual([5, 6, 1280, 720]);
  });
  it("besleme hazır değil / kırpma yolu / süzgeç / başka kip / görsel → gerçek çizim", () => {
    const ctx = fakeCtx();
    const placements = [];
    let ready = false;
    const h = createHoleCtx(ctx, { placements, isVideo, feedFor: () => ({ id: "v", ready }) });
    h.drawImage(new FakeVideo("notready"), 0, 0, 10, 10);
    ready = true;
    h.save(); h.clip(); h.drawImage(new FakeVideo("clipped"), 0, 0, 10, 10); h.restore();
    h.filter = "blur(8px)"; h.drawImage(new FakeVideo("filtered"), 0, 0, 10, 10); h.filter = "none";
    h.globalCompositeOperation = "lighter"; h.drawImage(new FakeVideo("lighter"), 0, 0, 10, 10); h.globalCompositeOperation = "source-over";
    h.drawImage({ tag: "img" }, 0, 0, 10, 10);
    h.drawImage(new FakeVideo("ok"), 0, 0, 10, 10);
    const drawn = ctx.log.filter((l) => l[0] === "drawImage").map((l) => l[1]);
    expect(drawn).toEqual(["notready", "clipped", "filtered", "lighter", "img"]);
    expect(placements.length).toBe(1);
  });
  it("işçi tarafı: taban meta videoları önce, taban üstte çizilir (kaynak kodu)", () => {
    const w = read("views/studio/compositor/program.worker.js");
    expect(w).toMatch(/const vp = S\.baseMeta\?\.videos;/);
    expect(w.indexOf("const vp = S.baseMeta?.videos;")).toBeLessThan(w.indexOf("ctx.drawImage(S.base, 0, 0, W, H);"));
    expect(w).toMatch(/post\(\{ type: "srcFirst", id, gen \}\)/);
    const c = read("views/studio/useCompositor.js");
    expect(c).toMatch(/host\.holeCtx\(ctx, now, videos\)/);
    expect(c).toMatch(/readPerfPrefs\(\)\.baseVideoWorker !== false/);
  });
});

describe("kamera açısı kaydı ayarları", () => {
  it("varsayılan: açık, yüksek (6 Mbps), sınırsız; geçersiz değerler düzelir", () => {
    expect(DEFAULT_SETTINGS.replay.anglesOn).toBe(true);
    expect(angleKbps(DEFAULT_SETTINGS.replay.angleQuality)).toBe(6000);
    const n = normalizeSettings({ replay: { anglesOn: false, angleQuality: "light", angleMax: 4 } });
    expect(n.replay).toMatchObject({ anglesOn: false, angleQuality: "light", angleMax: 4 });
    const bad = normalizeSettings({ replay: { anglesOn: "x", angleQuality: "ultra", angleMax: 99 } });
    expect(bad.replay).toMatchObject({ anglesOn: true, angleQuality: "high", angleMax: 0 });
    expect(ANGLE_QUALITIES.map((q) => q.kbps)).toEqual([6000, 3500, 2000]);
    expect(ANGLE_MAX_CHOICES).toContain(0);
  });
  it("kapalı → hiç kaynak; sınır → ilk N", () => {
    expect(limitAngleSources(["a", "b", "c"], { anglesOn: false })).toEqual([]);
    expect(limitAngleSources(["a", "b", "c"], { anglesOn: true, angleMax: 2 })).toEqual(["a", "b"]);
    expect(limitAngleSources(["a", "b", "c"], { anglesOn: true, angleMax: 0 })).toEqual(["a", "b", "c"]);
  });
  it("Studio açı listesine ve kaydediciye uygulanır; sayaç rapora gider", () => {
    const s = read("views/studio/Studio.jsx");
    expect(s).toMatch(/limitAngleSources\(list\.filter/);
    expect(s).toMatch(/bitrateKbps: angleKbps\(settings\.replay\.angleQuality\)/);
    const r = read("views/studio/useAngleRecorders.js");
    expect(r).toMatch(/videoBitsPerSecond: kbps \* 1000/);
    setAngleStats({ active: 3, bitrateKbps: 3500, totalKbps: 10500 });
    expect(angleStats()).toMatchObject({ active: 3, totalKbps: 10500 });
  });
});

describe("gizli dock sekmeleri", () => {
  it("park edilebilir paneller: işletim panelleri evet; ekranlar / kip / müzik hayır", async () => {
    const { parkable, PARK_MS, UNMOUNT_SAFE } = await import("../src/views/studio/layout/Workspace.jsx");
    expect(PARK_MS).toBeGreaterThanOrEqual(5000);
    for (const k of ["ses", "sahne", "yonetimMaclar", "yayin", "board"]) expect(parkable(k), k).toBe(true);
    for (const k of ["pgm", "pvw", "ledPvw", "tekrar", "roportaj", "ozet", "muzikCalar", "golMuzigi", "led"]) expect(parkable(k), k).toBe(false);
    expect(UNMOUNT_SAFE.has("pgm")).toBe(false);
  });
  it("gizliyken dondurulur (Frozen), PARK_MS sonra kaldırılır", () => {
    const w = read("views/studio/layout/Workspace.jsx");
    expect(w).toMatch(/onDidVisibilityChange/);
    expect(w).toMatch(/if \(parked\) return <div className="lw-z" data-parked=\{kind\} \/>;/);
    expect(w).toMatch(/<Frozen frozen=\{frozen\}>/);
  });
});

describe("performans tercihleri", () => {
  it("varsayılan açık; yazılır / okunur", () => {
    const st = memStorage();
    expect(readPerfPrefs(st)).toEqual({ baseVideoWorker: true, parkHidden: true });
    writePerfPrefs({ parkHidden: false }, st);
    expect(readPerfPrefs(st)).toEqual({ baseVideoWorker: true, parkHidden: false });
    expect(JSON.parse(st.getItem(PERF_PREFS_KEY)).parkHidden).toBe(false);
  });
  it("çökme bildirimi metni", () => {
    expect(processGoneText({ type: "GPU", reason: "crashed", exitCode: -1 })).toMatch(/Ekran kartı \(grafik\) süreci çöktü \(kod -1\)/);
    expect(processGoneText({ kind: "unclean-exit" })).toMatch(/Önceki oturum/);
    expect(processGoneText({ type: "renderer", reason: "oom" })).toMatch(/Arayüz süreci bellek yetmedi/);
  });
  it("Performans raporu: açı kaydı, açılış (güvenli mod / bayraklar) ve son çökmeler satırları", () => {
    const text = reportText({ at: "x", app: {}, gpu: {}, output: {}, runtime: { angles: { active: 2, bitrateKbps: 3500, totalKbps: 7000, hardware: { powerEfficient: true } }, app: "studio" }, launch: { safeMode: true, reason: "komut satırı", hardwareAcceleration: false, highPerfGpu: false, ffmpegAboveNormal: false, crashes: [{ at: "t", type: "GPU", reason: "crashed", exitCode: 3 }], uncleanExit: { startedAt: "s" } } });
    expect(text).toMatch(/Kamera açısı kaydı: 2 MediaRecorder · kaynak başına 3500 kbps \(toplam 7000 kbps\) · donanım kodlama olası/);
    expect(text).toMatch(/Açılış: GÜVENLİ MOD \(komut satırı\) · donanım hızlandırma kapalı/);
    expect(text).toMatch(/uygulama studio/);
    expect(text).toMatch(/son çökmeler: t GPU crashed\/3/);
    expect(text).toMatch(/önceki oturum düzgün kapanmadı/);
  });
});

describe("çok sayfalı paket: Elitlig Stüdyo yalnız stüdyoyu yükler", () => {
  it("vite iki giriş; studio.html → studio-main.jsx", () => {
    const cfg = fs.readFileSync(path.join(__dirname, "..", "vite.config.mjs"), "utf8");
    expect(cfg).toMatch(/studio: fileURLToPath\(new URL\("\.\/studio\.html"/);
    const html = fs.readFileSync(path.join(__dirname, "..", "studio.html"), "utf8");
    expect(html).toMatch(/src="\.\/src\/studio-main\.jsx"/);
    expect(html).toMatch(/<title>Elitlig Stüdyo<\/title>/);
  });
  it("studio-main / StudioApp Araçlar kabuğunu, çalışma alanını, müzik çaları içe aktarmaz", () => {
    const files = ["studio-main.jsx", "studioApp/StudioApp.jsx"].map(read).join("\n");
    const imports = [...files.matchAll(/(?:import\s[^"]*from\s|import\()\s*"([^"]+)"/g)].map((m) => m[1]);
    expect(imports.filter((p) => /(^\.\/App$|\/App$|workspace|music\/|views\/(Today|messages|todos|toolkit|admin|browser))/.test(p))).toEqual([]);
    expect(imports).toContain("../views/studio/Studio");
  });
  it("Araçlar: Yayın Stüdyosu girişi StudioGate (Stüdyo'yu aç / indir / yerleşik); yerleşik stüdyo ensure ile", () => {
    const app = read("App.jsx");
    expect(app).toMatch(/import\("\.\/views\/studio\/StudioGate"\)/);
    const gate = read("views/studio/StudioGate.jsx");
    expect(gate).toMatch(/Elitlig Stüdyo'yu aç/);
    expect(gate).toMatch(/Elitlig Stüdyo'yu indir/);
    expect(gate).toMatch(/Bu sefer yerleşik stüdyoyu aç/);
    expect(gate).toMatch(/studio\?\.ensure\?\.\(\)/);
    expect(gate).toMatch(/exportStudioState\(\);\s*const res = await window\.elitlig\.studioLink\.open\(\)/);
  });
});
