// Yayın Stüdyosu 2.35.0 — güçlü makinede (Windows oyun bilgisayarı) arayüz ve yayın takılması:
//   - kök yeniden çizim fırtınası: maç saati (1 sn), kodlayıcı durumu (1 sn), açı durumu (2 sn),
//     müzik konumu (250 ms), LED / YouTube / maç yoklamaları her seferinde YENİ nesne → bütün
//     stüdyo ağacı. Artık saat dakikada bir, sayaçlar yalnız gösteren bileşende.
//   - sürekli CSS animasyonları (box-shadow / yükseklik / outline) ve DOM ölçerleri her karede
//     ana iş parçacığında boyama + katman yeniden kurulumu yaptırıyordu.
//   - Performans raporu (Yayın tanılama).
import fs from "node:fs";
import path from "node:path";
import { keepIfSame, sameJson } from "../src/lib/perf/same";
import { STATUS_REFRESH_MS, statusKeyOf } from "../src/views/studio/useEngine";
import { angleStatusKey } from "../src/views/studio/useAngleRecorders";
import { withFreshClock } from "../src/lib/studio/graphics/draw";
import { buildGraphicsSnapshot } from "../src/lib/studio/graphics/snapshot";
import { drawMeterBar } from "../src/views/studio/perf/meterCanvas";
import { frameStats, reportText } from "../src/views/studio/perf/perfReport";
import { BLINK_SELECTOR } from "../src/views/studio/perf/blink";

const SRC = path.join(__dirname, "../src");

describe("kök durum: aynı veri yeni nesne üretmez", () => {
  it("keepIfSame: içerik aynıysa önceki nesne döner (setState yeniden çizmez)", () => {
    const prev = { a: 1, b: [1, 2] };
    expect(keepIfSame({ a: 1, b: [1, 2] })(prev)).toBe(prev);
    const next = { a: 2 };
    expect(keepIfSame(next)(prev)).toBe(next);
    expect(sameJson(null, null)).toBe(true);
  });

  it("kodlayıcı durumu: yalnız sayaçlar değişince anahtar aynı (kök yeniden çizilmez)", () => {
    const a = { state: "live", fps: 29.8, bitrateKbps: 2480, speed: 1.0, droppedFrames: 0, outTimeMs: 1000, network: { state: "up", sentKbps: 2500, pendingBytes: 10 } };
    const b = { ...a, fps: 30.1, bitrateKbps: 2511, speed: 0.99, outTimeMs: 2000, network: { state: "up", sentKbps: 2600, pendingBytes: 4000 } };
    expect(statusKeyOf(b)).toBe(statusKeyOf(a));
    expect(statusKeyOf({ ...a, state: "reconnecting" })).not.toBe(statusKeyOf(a));
    expect(statusKeyOf({ ...a, warning: "slow" })).not.toBe(statusKeyOf(a));
    expect(statusKeyOf({ ...a, network: { ...a.network, state: "down" } })).not.toBe(statusKeyOf(a));
    expect(STATUS_REFRESH_MS).toBeGreaterThanOrEqual(3000);
  });

  it("açı durumu: saniyeye yuvarlanmış ara bellek aynıysa anahtar aynı", () => {
    const a = [{ id: "c1", state: "recording", bufferedMs: 38000 }];
    expect(angleStatusKey([{ id: "c1", state: "recording", bufferedMs: 38200 }])).toBe(angleStatusKey(a));
    expect(angleStatusKey([{ id: "c1", state: "recording", bufferedMs: 39600 }])).not.toBe(angleStatusKey(a));
  });

  it("useLiveMatch saniyede bir setInterval ile kök durumu değiştirmiyor", () => {
    const s = fs.readFileSync(path.join(SRC, "views/studio/useLiveMatch.js"), "utf8");
    expect(s).not.toMatch(/setInterval\(\(\) => setNow\(Date\.now\(\)\), 1000\)/);
    expect(s).toMatch(/60_000 - \(ms % 60_000\)/); // dakika sınırında uyanır
  });
});

describe("grafik: maç saati yazısı çizim anında güncel", () => {
  const T0 = 1_700_000_000_000;
  const live = { match: { id: 7, first_team_name: "Ev", second_team_name: "Dep" }, status: "canli", running: true, period: 2, timer: { running: true, base_ms: 33 * 60000, base_at: new Date(T0).toISOString(), period: 2 }, score: { home: 2, away: 1 }, events: [] };
  it("anlık görüntü dakikalık olsa da yazı saniyeye göre yenilenir; aynı saniyede aynı nesne", () => {
    const snap = buildGraphicsSnapshot(live, { now: T0, subtitle: { onAir: true, settings: { sections: { headlines: true } } } });
    const t1 = withFreshClock(snap, T0 + 5_000);
    expect(t1.match.statusText).toMatch(/33:05/);
    expect(withFreshClock(snap, T0 + 5_400)).toBe(t1);
    const t2 = withFreshClock(snap, T0 + 6_000);
    expect(t2.match.statusText).toMatch(/33:06/);
    const score = (t2.subtitle?.blocks || []).find((b) => b.key === "score");
    if (score) expect(score.text).toMatch(/33:06$/);
  });
  it("saat durmuşsa anlık görüntü aynen kullanılır", () => {
    const snap = buildGraphicsSnapshot({ ...live, running: false, timer: { ...live.timer, running: false } }, { now: T0 });
    expect(withFreshClock(snap, T0 + 99_000)).toBe(snap);
  });
});

describe("ölçer tuvali", () => {
  const fakeCanvas = () => {
    const calls = [];
    const ctx = { clearRect: () => calls.push("clear"), fillRect: (...a) => calls.push(["fill", ...a]), createLinearGradient: () => ({ addColorStop() {} }), set fillStyle(v) { calls.push(["style", typeof v === "string" ? v : "grad"]); } };
    return { calls, clientWidth: 10, clientHeight: 100, width: 0, height: 0, getContext: () => ctx };
  };
  it("değer değişmediyse çizmez; değişince yeniden çizer", () => {
    const c = fakeCanvas();
    expect(drawMeterBar(c, 0.5, 0.8)).toBe(true);
    const n = c.calls.length;
    expect(drawMeterBar(c, 0.501, 0.8)).toBe(false); // %0,5 adım içinde
    expect(c.calls.length).toBe(n);
    expect(drawMeterBar(c, 0.7, 0.8)).toBe(true);
  });
  it("dikey çubuk alttan dolar", () => {
    const c = fakeCanvas();
    drawMeterBar(c, 0.25, null);
    const fill = c.calls.find((x) => Array.isArray(x) && x[0] === "fill");
    expect(fill[2] + fill[4]).toBe(c.height); // y + h = tuval yüksekliği
  });
});

describe("CSS: sürekli animasyonlar karede boyama yaptırmaz", () => {
  // Bileşik (compositor) olmayan özellik: her karede ana iş parçacığında stil + boyama.
  const PAINT_PROPS = /\b(box-shadow|height|width|outline|outline-color|top|left|bottom|right|margin|padding|background|border|filter)\s*:/;
  const files = [];
  const walk = (d) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (f.endsWith(".css")) files.push(p); } };
  walk(path.join(SRC, "views/studio"));
  walk(path.join(SRC, "music"));
  const css = files.map((f) => fs.readFileSync(f, "utf8")).join("\n");
  const keyframes = {};
  for (const m of css.matchAll(/@keyframes\s+([\w-]+)\s*\{([\s\S]*?\})\s*\}/g)) keyframes[m[1]] = m[2];
  const infinite = new Set([...css.matchAll(/animation:\s*([\w-]+)[^;]*infinite/g)].map((m) => m[1]));
  it("stüdyo / müzik: infinite animasyonların hepsi yalnız opacity / transform", () => {
    const bad = [...infinite].filter((k) => keyframes[k] && PAINT_PROPS.test(keyframes[k]));
    // fx-ants: yalnız düzenleyicide işaretlerken (kısa süreli), stüdyo dışında
    expect(bad.filter((k) => !["fx-ants", "shimmer", "plShimmer", "sl-shimmer"].includes(k))).toEqual([]);
  });
  it("ortak yanıp sönme: canlı noktaları tek zamanlayıcıya bağlı", () => {
    const blink = fs.readFileSync(path.join(SRC, "views/studio/perf/blink.css"), "utf8");
    for (const sel of [".st-pill.is-live i", ".mg-live__dot", ".au-dot::after", ".wx-outmute.is-on::after"]) expect(blink).toContain(sel);
    expect(BLINK_SELECTOR).toContain(".st-pill.is-live i");
  });
  it("ölçerler DOM özelliği değil tuval (CSS değişkeni / clip-path ile güncellenmiyor)", () => {
    const ap = fs.readFileSync(path.join(SRC, "views/studio/AudioPanel.jsx"), "utf8");
    expect(ap).not.toMatch(/setProperty\(`--l\$\{i\}`/);
    expect(ap).toMatch(/drawMeterBar/);
  });
});

describe("Performans raporu", () => {
  it("kare istatistiği: p95, uzun kareler, yenileme tahmini", () => {
    const ts = []; let t = 0;
    for (let i = 0; i < 120; i += 1) { ts.push(t); t += i % 30 === 29 ? 50 : 1000 / 144; }
    const f = frameStats(ts);
    expect(f.refreshHzGuess).toBe(144);
    expect(f.over33).toBe(3);
    expect(f.p50).toBeLessThan(8);
  });
  it("metin özeti: motor, donanım hızlandırma, React ve süreçler", () => {
    const text = reportText({
      at: "2026-11-16T20:00:00Z", app: { version: "2.35.0", electron: "44", chrome: "150" },
      system: { os: { platform: "win32", release: "10.0.26100", arch: "x64" }, cpu: { model: "AMD Ryzen 7", cores: 16 }, memory: { totalMB: 16000, freeMB: 6000 } },
      gpu: { webgl: "ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11 vs_5_0 ps_5_0, D3D11)", devices: [{ active: true, vendor: "NVIDIA", device: "RTX 4070", driver: "566.36" }], verdict: { ok: true, text: "Donanım hızlandırma açık." }, featureStatus: { gpu_compositing: "enabled" } },
      engine: { engine: "worker", why: "ayrı iş parçacığı", setting: "auto", softwareGpu: false },
      output: { targetFps: 30, drawFps: 30, uniqueFps: 29.8, encoding: true },
      mainThread: { busyPct: 18, longMsPerSec: 0, longMaxMs: 0, offenders: [] },
      frames: { fps: 143.9, p50: 6.9, p95: 7.2, p99: 8, max: 12, over33: 0, over50: 0 },
      react: { commitsPerSec: 1.2, componentRendersPerSec: 9, bigCommits: 0, panels: [{ panel: "ses", rendersPerSec: 2 }], topComponents: [] },
      runtime: { intervals: 40, mediaRecorders: 3, canvasLoops: 4, dom: { canvases: 12, bigCanvases: ["960x540"], videos: 3, videosPlaying: 3, runningAnimations: 0, elements: 4000 } },
      processes: { byType: { GPU: { count: 1, cpuPct: 12, memMB: 400 } } },
    });
    for (const s of ["2.35.0", "RTX 4070", "AYRI İŞ PARÇACIĞI", "Donanım hızlandırma açık", "1.2 commit/sn", "MediaRecorder 3", "GPU×1"]) expect(text).toContain(s);
  });
});
