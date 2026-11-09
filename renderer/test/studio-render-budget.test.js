// Çizim motoru (ayrı iş parçacığı / ana iş parçacığı), "fps'i ne sınırlıyor" kararı,
// ikincil çizim yükü özeti, işçi kaynak beslemesi ve uzak (işçi) kodlayıcılı WebCodecs yolu.
import { afterEach, describe, expect, it } from "vitest";
import { COMPOSITOR_ENGINES, SECONDARY_FPS, chooseCompositorEngine, limitingStage, normalizeCompositorEngine, topOffenders } from "../src/lib/studio/renderBudget";
import { normalizeSettings, DEFAULT_SETTINGS } from "../src/views/studio/settings/settings";
import { MODE_TARGET, drawProgramFx, ftbLevel, needsMainBase, transitionTouchesMode } from "../src/views/studio/compositor/composeProgram";
import { feedKeyOf, neededSourceIds } from "../src/views/studio/compositor/workerHost";
import { drawableOf } from "../src/views/studio/draw";
import { createWebCodecsPipeline } from "../src/views/studio/webcodecs";

describe("çizim motoru seçimi", () => {
  it("varsayılan otomatik; destek yoksa / işçi çöktüyse ana iş parçacığı", () => {
    expect(COMPOSITOR_ENGINES.map((e) => e.key)).toEqual(["auto", "worker", "main"]);
    expect(normalizeCompositorEngine("x")).toBe("auto");
    expect(chooseCompositorEngine("auto", { supported: true })).toBe("worker");
    expect(chooseCompositorEngine("worker", { supported: true })).toBe("worker");
    expect(chooseCompositorEngine("auto", { supported: false })).toBe("main");
    expect(chooseCompositorEngine("worker", { supported: true, failed: true })).toBe("main");
    expect(chooseCompositorEngine("main", { supported: true })).toBe("main");
    expect(chooseCompositorEngine("auto", { supported: true, software: true })).toBe("main");
    expect(chooseCompositorEngine("worker", { supported: true, software: true })).toBe("worker");
  });
  it("ayar normalize edilir (stream.compositor)", () => {
    expect(DEFAULT_SETTINGS.stream.compositor).toBe("auto");
    expect(normalizeSettings(null).stream.compositor).toBe("auto");
    expect(normalizeSettings({ v: 3, stream: { compositor: "main" } }).stream.compositor).toBe("main");
    expect(normalizeSettings({ v: 3, stream: { compositor: "gpu" } }).stream.compositor).toBe("auto");
  });
  it("ikincil çizim sınırları: küçük resimler 5–10 fps, ölçerler 15–20 fps", () => {
    for (const k of ["sceneThumb", "multiview", "ledPreview", "replayThumb"]) expect(SECONDARY_FPS[k]).toBeGreaterThanOrEqual(5), expect(SECONDARY_FPS[k]).toBeLessThanOrEqual(10);
    expect(SECONDARY_FPS.meter).toBeGreaterThanOrEqual(15);
    expect(SECONDARY_FPS.meter).toBeLessThanOrEqual(20);
  });
});

describe("sınırlayan aşama (Yayın tanılama)", () => {
  it("hedefte: yerinde", () => {
    expect(limitingStage({ targetFps: 30, draw: { fps: 30, engine: "worker", avgMs: 6 }, enc: { encodedFps: 30, queue: 0 } }).stage).toBe("ok");
  });
  it("ana iş parçacığı motoru + meşgul arayüz → arayüz yükü", () => {
    const r = limitingStage({ targetFps: 30, draw: { fps: 14, engine: "main", avgMs: 9 }, enc: { encodedFps: 14 }, load: { busyPct: 96, long: { msPerSec: 600 } } });
    expect(r.stage).toBe("arayuz");
    expect(r.label).toBe("Arayüz yükü");
  });
  it("kare çizimi bütçeyi aşıyor → çizim", () => {
    expect(limitingStage({ targetFps: 60, draw: { fps: 40, engine: "worker", avgMs: 22 }, enc: { encodedFps: 40 } }).stage).toBe("cizim");
  });
  it("çizim tam, kodlanan düşük ya da kuyruk dolu → kodlama", () => {
    expect(limitingStage({ targetFps: 30, draw: { fps: 30, engine: "worker", avgMs: 5 }, enc: { encodedFps: 20, queue: 1 } }).stage).toBe("kodlama");
    expect(limitingStage({ targetFps: 30, draw: { fps: 30, engine: "worker", avgMs: 5 }, enc: { encodedFps: 30, queue: 5 } }).stage).toBe("kodlama");
  });
  it("işçide kip tabanı ana iş parçacığından yavaş geliyor → arayüz yükü", () => {
    expect(limitingStage({ targetFps: 30, draw: { fps: 20, engine: "worker", mainBase: true, basesIn: 12, avgMs: 4 }, load: { busyPct: 90, long: { msPerSec: 400 } } }).stage).toBe("arayuz");
  });
  it("en çok yük bindirenler: ms/sn'ye göre, önemsizler atlanır", () => {
    const top = topOffenders({ loops: [{ name: "LED önizleme", msPerSec: 12, fps: 8 }, { name: "ölçer", msPerSec: 0.1 }], scripts: [{ name: "FrameRequestCallback", msPerSec: 40 }] });
    expect(top.map((t) => t.name)).toEqual(["FrameRequestCallback", "LED önizleme"]);
    expect(top[1].kind).toBe("döngü");
  });
});

describe("program karesi (ortak çizim)", () => {
  it("FTB solma düzeyi", () => {
    expect(ftbLevel({ on: true, at: 0, ms: 100, from: 0 }, 50)).toBeCloseTo(0.5);
    expect(ftbLevel({ on: false, at: 0, ms: 100, from: 1 }, 100)).toBe(0);
  });
  it("kip tabanı ana iş parçacığında: VAR, özel kip, eski tekrar, kipe / kipten geçiş", () => {
    expect(needsMainBase({})).toBe(false);
    expect(needsMainBase({ vr: { active: true } })).toBe(true);
    expect(needsMainBase({ pgmOv: { draw() {} } })).toBe(true);
    expect(needsMainBase({ replay: { active: true, el: {} } })).toBe(true);
    expect(needsMainBase({ tr: { fromId: "a", toId: MODE_TARGET } })).toBe(true);
    expect(transitionTouchesMode({ fromId: "a", toId: "b" })).toBe(false);
  });
  it("anlık durum: siyah / bekleme kartı çizer, dondur çizmez", () => {
    const calls = [];
    const ctx = new Proxy({}, { get: (_t, k) => (k === "createLinearGradient" ? () => ({ addColorStop() {} }) : (...a) => calls.push([k, ...a])), set: () => true });
    expect(drawProgramFx(ctx, 10, 10, null, {})).toBe(false);
    expect(drawProgramFx(ctx, 10, 10, { kind: "black" }, {})).toBe(true);
    expect(drawProgramFx(ctx, 10, 10, { kind: "freeze" }, {})).toBe("freeze");
    expect(calls.some((c) => c[0] === "fillRect")).toBe(true);
  });
});

describe("işçi kaynak beslemesi", () => {
  afterEach(() => { delete globalThis.VideoFrame; });
  it("program + önizleme + geçiş sahnelerinin kaynakları", () => {
    const cfg = { programSceneId: "s1", previewSceneId: "s2", sources: [{ id: "a" }, { id: "b" }, { id: "c" }], scenes: [{ id: "s1", layers: [{ sourceId: "a" }] }, { id: "s2", layers: [{ sourceId: "b" }] }, { id: "s3", layers: [{ sourceId: "c" }] }] };
    expect([...neededSourceIds(cfg)].sort()).toEqual(["a", "b"]);
    expect([...neededSourceIds(cfg, ["s3"])].sort()).toEqual(["a", "b", "c"]);
  });
  it("besleme anahtarı: canlı olmayan kapalı; slayt hazır görsel sayısıyla", () => {
    expect(feedKeyOf(null)).toBe("off");
    expect(feedKeyOf({ status: "missing" })).toBe("off");
    expect(feedKeyOf({ status: "live", images: [{ complete: true, naturalWidth: 4 }, { complete: false }], intervalMs: 5000 })).toBe("slides:1:5000");
  });
  it("işçide VideoFrame / ImageBitmap çizilebilir kaynak", () => {
    globalThis.VideoFrame = class { constructor(w, h) { this.displayWidth = w; this.displayHeight = h; } };
    const f = new globalThis.VideoFrame(1280, 720);
    expect(drawableOf({ status: "live", el: f })).toEqual({ el: f, w: 1280, h: 720 });
    expect(drawableOf({ status: "waiting", el: f })).toBe(null);
  });
});

describe("WebCodecs: uzak (işçi) kodlayıcı", () => {
  it("işçiden gelen parçalar mkv'ye yazılır; anahtar kare isteği ve sayaçlar işçiye / işçiden", () => {
    let handlers = null;
    const forced = [];
    let closed = false;
    const remoteEncoder = {
      open(opts, h) {
        handlers = h;
        expect(opts.config.codec).toBe("avc1.640028");
        return { id: 1, forceKey: () => forced.push(1), close: () => { closed = true; }, stats: () => ({ id: 1, queue: 2, framesIn: 10, encodeDropped: 1, maxQueue: 3, latencyMs: 7, maxLatencyMs: 9, frames: 10, gaps: 0, skipped: 0 }) };
      },
    };
    const out = [];
    const p = createWebCodecsPipeline({ canvas: null, audioTrack: null, fps: 30, width: 1920, height: 1080, videoConfig: { codec: "avc1.640028", hardwareAcceleration: "prefer-hardware", bitrateMode: "constant" }, onData: (b) => out.push(b), onFatal: () => {}, remoteEncoder });
    expect(handlers).toBeTruthy();
    handlers.onClock(performance.now());
    const avcC = new Uint8Array([1, 0x64, 0, 0x28, 0xff, 0xe1, 0, 4, 0x67, 0x64, 0, 0x28, 1, 0, 4, 0x68, 0xee, 0x3c, 0x80]);
    handlers.onChunk({ tsUs: 0, key: true, data: new Uint8Array([0, 0, 0, 1, 0x65]).buffer, desc: avcC.buffer.slice(0), colorSpace: { primaries: "bt709" } });
    handlers.onChunk({ tsUs: 33333, key: false, data: new Uint8Array([0, 0, 0, 1, 0x41]).buffer, desc: null });
    p.restart(); // ffmpeg yeniden başladı: işçiden anahtar kare istenir, yeni başlık beklenir
    expect(forced.length).toBe(1);
    handlers.onChunk({ tsUs: 66666, key: true, data: new Uint8Array([0, 0, 0, 1, 0x65]).buffer, desc: null });
    const s = p.stats();
    expect(s.encodeIn).toBe("worker");
    expect(s.queue).toBe(2);
    expect(s.encodeDropped).toBe(1);
    expect(s.framesEncoded).toBe(3);
    p.stop();
    expect(closed).toBe(true);
    const bytes = out.reduce((a, b) => a + b.byteLength, 0);
    expect(bytes).toBeGreaterThan(20);
    expect(new Uint8Array(out[0])[0]).toBe(0x1a); // EBML başlığı
  });
  it("işçi hatası: yol düşer (onFatal)", () => {
    let handlers = null;
    const reasons = [];
    const p = createWebCodecsPipeline({ canvas: null, audioTrack: null, fps: 30, width: 1280, height: 720, videoConfig: { codec: "avc1.64001f" }, onData: () => {}, onFatal: (r) => reasons.push(r), remoteEncoder: { open: (_o, h) => { handlers = h; return { forceKey() {}, close() {}, stats: () => null }; } } });
    handlers.onError("WORKER", "çöktü");
    expect(reasons).toEqual(["WORKER"]);
    expect(p.alive()).toBe(false);
    p.stop();
  });
});
