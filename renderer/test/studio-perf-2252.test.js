// Yayın Stüdyosu 2.25.2 — akıcılık gerilemesi (2.25.0–2.25.1, özellikle Windows):
//   - kamera VideoFrame'leri titreşim tamponunda AÇIK tutuluyordu: Chromium kamera izinden açık
//     tutulabilen kare sayısını sınırlar, kamera kare vermeyi bırakıyordu (kaynak 30 → ~5–12 fps).
//     Artık kare gelir gelmez ImageBitmap kopyası alınır, VideoFrame hemen kapanır.
//   - 4 ms'lik uyku dilimleri (saniyede ~200 uyanma) → kare başına 1–2 uyanma.
//   - önizleme / Program ekranı ≤ 30 fps + ana iş parçacığı zorlanınca kademeli düşüş.
import { vi } from "vitest";
import { COARSE_MARGIN_MS, PRECISE_SLEEP_MS, createMonitorGovernor, monitorSteps, nextSleepMs } from "../src/lib/studio/framePacing";
import { drawPerf } from "../src/views/studio/useEngine";

/** İşçi döngüsünün uyku kuralı, zamanlayıcı modeliyle: kare başına uyanma ve tik gecikmesi. */
function simulate(fps, { lowRes = false, renderMs = 5, secs = 20 } = {}) {
  const T = 15.625;
  const fire = (now, d) => {
    const due = now + Math.max(d > 0 ? 4 : 0, d);
    return lowRes && d >= 32 ? Math.ceil(due / T) * T : due;
  };
  const interval = 1000 / fps;
  let now = 0; let nextAt = 0; let wakes = 0; let ticks = 0; let maxLate = 0;
  while (now < secs * 1000) {
    wakes += 1;
    const wait = nextAt - now;
    if (wait > 1) { now = fire(now, nextSleepMs(wait)); continue; }
    ticks += 1;
    maxLate = Math.max(maxLate, now - nextAt);
    now += renderMs;
    nextAt += interval;
    now = fire(now, nextSleepMs(nextAt - now));
  }
  return { wakesPerFrame: wakes / ticks, fps: ticks / secs, maxLate };
}

describe("işçi zamanlayıcısı (2.25.2)", () => {
  it("bekleme ≤ 30 ms tek zamanlayıcı; uzunsa son tarihten 16 ms önce biten kaba uyku", () => {
    expect(PRECISE_SLEEP_MS).toBeLessThan(32);
    expect(nextSleepMs(29)).toBe(29);
    expect(nextSleepMs(45)).toBe(45 - COARSE_MARGIN_MS);
    expect(nextSleepMs(0)).toBe(0);
    expect(nextSleepMs(NaN)).toBe(0);
  });
  it("kare başına en çok 2 uyanma (2.25.1: ~7); tik hedef hızda", () => {
    for (const fps of [25, 30, 50, 60]) {
      const r = simulate(fps);
      expect(r.wakesPerFrame).toBeLessThanOrEqual(2.05);
      expect(Math.round(r.fps)).toBe(fps);
      expect(r.maxLate).toBeLessThan(1.5);
    }
  });
  it("Windows düşük çözünürlüklü zamanlayıcı (≥ 32 ms bekleme 15,6 ms adım): 25 fps'te bile tik geç kalmaz", () => {
    const r = simulate(25, { lowRes: true });
    expect(Math.round(r.fps)).toBe(25);
    expect(r.maxLate).toBeLessThan(1.5);
  });
});

describe("ekran hızı yöneticisi (önizleme + Program ekranı)", () => {
  it("kademeler: proje hızı (≤ 30) → 20 → 15 → 10", () => {
    expect(monitorSteps(60)).toEqual([30, 20, 15, 10]);
    expect(monitorSteps(30)).toEqual([30, 20, 15, 10]);
    expect(monitorSteps(25)).toEqual([25, 20, 15, 10]);
    expect(monitorSteps(12)).toEqual([12, 10]);
  });
  it("ana iş parçacığı 2 sn aşırı yüklü → bir kademe aşağı; bekleme süresiyle bir kademe daha", () => {
    const g = createMonitorGovernor(60);
    expect(g.fps()).toBe(30);
    expect(g.sample({ busyPct: 92 }).fps).toBe(30);
    const r = g.sample({ busyPct: 92 });
    expect(r).toMatchObject({ fps: 20, changed: true, limited: true });
    expect(r.reason).toMatch(/ana iş parçacığı %92/);
    // Bekleme (3 sn) dolmadan ikinci düşüş yok.
    expect(g.sample({ busyPct: 95 }).fps).toBe(20);
    expect(g.sample({ busyPct: 95 }).fps).toBe(20);
    expect(g.sample({ busyPct: 95 }).fps).toBe(15);
    for (let i = 0; i < 20; i += 1) g.sample({ busyPct: 95, blockingMs: 400 });
    expect(g.fps()).toBe(10); // en alt kademe
  });
  it("rahatlayınca (15 sn) kademe kademe geri çıkar", () => {
    const g = createMonitorGovernor(30);
    for (let i = 0; i < 2; i += 1) g.sample({ blockingMs: 300 });
    expect(g.fps()).toBe(20);
    for (let i = 0; i < 14; i += 1) g.sample({ busyPct: 30 });
    expect(g.fps()).toBe(20);
    const r = g.sample({ busyPct: 30 });
    expect(r).toMatchObject({ fps: 30, changed: true, limited: false, reason: "" });
  });
  it("orta yük (55–80) ne düşürür ne yükseltir; uzun tek görev ve yayın çizimi geride düşürür", () => {
    const g = createMonitorGovernor(30);
    for (let i = 0; i < 30; i += 1) g.sample({ busyPct: 70 });
    expect(g.fps()).toBe(30);
    g.sample({ longMaxMs: 250 }); g.sample({ longMaxMs: 250 });
    expect(g.fps()).toBe(20);
    const w = createMonitorGovernor(30);
    w.sample({ busyPct: 20, workerFps: 22 });
    expect(w.sample({ busyPct: 20, workerFps: 22 }).reason).toMatch(/yayın çizimi geride \(22 \/ 30 fps/);
  });
  it("yalnız geç tik (Windows 15,6 ms zamanlayıcısı) düşürmez: kare hızı hedefteyse yük sayılmaz", () => {
    const g = createMonitorGovernor(60);
    for (let i = 0; i < 10; i += 1) g.sample({ busyPct: 30, workerLate: 40, workerFps: 60 });
    expect(g.fps()).toBe(30);
  });
});

describe("tanılama günlüğü (yayın sağlığı › client)", () => {
  it("çizim / ekran yükü: kaynak fps, açık kare, uyanma, ekran hızı, sınırlayıcı", () => {
    const p = drawPerf({ engine: "worker", unique: 30, srcFps: 90, avgMs: 4.2, lateMaxMs: 3, wakes: 31, copyMs: 0.4, openFrames: 1, mirrorFps: 30, pvwFps: 20, mainBusy: 85, longMs: 120, longMaxMs: 90, limiter: "ekranlar 20 fps: ana iş parçacığı %85", topLoad: "Önizleme ekranı 40 ms/sn" });
    expect(p.perf).toEqual({ unique: 30, srcFps: 90, avgMs: 4.2, lateMaxMs: 3, wakes: 31, copyMs: 0.4, openFrames: 1, mirrorFps: 30, pvwFps: 20, mainBusy: 85, longMs: 120, longMaxMs: 90 });
    expect(Object.keys(p.perf).length).toBeLessThanOrEqual(12); // ana süreç iç nesnede en çok 12 alan tutar
    expect(p.limiter).toMatch(/ekranlar 20 fps/);
    expect(p.engineKind).toBe("worker");
    expect(drawPerf(null)).toEqual({});
  });
});

/* ───────────── çizim işçisi: kamera kareleri kapatılıyor mu ───────────── */

function fakeFrames(n, periodUs = 33333) {
  const frames = [];
  let i = 0;
  const readable = new ReadableStream({
    pull(ctrl) {
      if (i >= n) { ctrl.close(); return; }
      const f = { timestamp: i * periodUs, displayWidth: 1920, displayHeight: 1080, closed: false, close() { this.closed = true; } };
      frames.push(f);
      i += 1;
      ctrl.enqueue(f);
    },
  });
  return { readable, frames };
}

async function loadWorker({ copy = true, copyMs = 0 } = {}) {
  vi.resetModules();
  const canvases = [];
  globalThis.self = globalThis;
  globalThis.postMessage = () => {};
  globalThis.close = () => {};
  globalThis.OffscreenCanvas = class {
    constructor(w, h) { this.width = w; this.height = h; this.draws = 0; canvases.push(this); }
    getContext() { return copy ? { drawImage: (src) => { if (src.closed) throw new Error("kapalı kare"); this.draws += 1; const t = performance.now(); while (performance.now() - t < copyMs) { /* pahalı kopya */ } } } : null; }
  };
  await import("../src/views/studio/compositor/program.worker.js");
  const send = (m) => globalThis.onmessage({ data: m });
  return { send, canvases };
}
const settle = () => new Promise((r) => setTimeout(r, 20));

describe("çizim işçisi: kaynak kareleri (2.25.2)", () => {
  const saved = globalThis.OffscreenCanvas;
  afterEach(() => { delete globalThis.onmessage; globalThis.OffscreenCanvas = saved; });
  it("her kamera karesi kaynak tuvaline kopyalanınca hemen kapanır; tuval halkası sınırlı (her karede yeni tuval yok)", async () => {
    const { send, canvases } = await loadWorker();
    const { readable, frames } = fakeFrames(40);
    send({ type: "srcStream", id: "cam", gen: 1, readable });
    await settle();
    expect(frames.length).toBe(40);
    expect(frames.every((f) => f.closed)).toBe(true); // hiçbir VideoFrame açık kalmaz
    expect(canvases.reduce((a, c) => a + c.draws, 0)).toBe(40); // her kare bir kez kopyalandı
    expect(canvases.length).toBeLessThanOrEqual(5); // halka: 3 bekleyen + yazılan (+1 pay)
    send({ type: "srcOff", id: "cam" });
  });
  it("kopya pahalıysa (yazılım çizimi, ort. > 3 ms) kopya bırakılır: yalnız en son kare açık", async () => {
    const { send, canvases } = await loadWorker({ copyMs: 4 });
    const { readable, frames } = fakeFrames(90);
    send({ type: "srcStream", id: "cam", gen: 1, readable });
    await new Promise((r) => setTimeout(r, 600));
    expect(frames.length).toBe(90);
    const copied = canvases.reduce((a, c) => a + c.draws, 0);
    expect(copied).toBeGreaterThanOrEqual(60);
    expect(copied).toBeLessThan(90);
    expect(frames.filter((f) => !f.closed).length).toBe(1);
    send({ type: "srcOff", id: "cam" });
    expect(frames.every((f) => f.closed)).toBe(true);
  });
  it("kopya alınamazsa yalnız EN SON kare açık kalır (kamera durmaz)", async () => {
    const { send } = await loadWorker({ copy: false });
    const { readable, frames } = fakeFrames(20);
    send({ type: "srcStream", id: "cam", gen: 1, readable });
    await settle();
    expect(frames.filter((f) => !f.closed).length).toBe(1);
    expect(frames[frames.length - 1].closed).toBe(false);
    send({ type: "srcOff", id: "cam" });
    expect(frames.every((f) => f.closed)).toBe(true);
  });
});
