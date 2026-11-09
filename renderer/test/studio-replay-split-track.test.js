// Yan yana tekrar (zaman eşi, yerleşim, sapma düzeltmesi, yük) ve oyuncu takibi
// (anahtar ara değeri, parça birleştirme, NCC izleyici — sentetik hareketli leke).
import {
  SPLIT_LAYOUTS, angleDelta, canvasToVideo, driftAction, estimateMasterTime, hitPane, layoutFor, normalizeSplit, paneScale, paneSource,
  paneTime, sameSplit, setPaneOffset, splitDividers, splitForPayload, splitFromAngles, splitRects, swapPanes, videoToCanvas, withLayout,
} from "../src/lib/studio/replaySplit";
import {
  addKey, autoQuality, extractPatch, freezeDue, interpolate, makeTracker, mergeSegments, newTrack, normalizeTrack, pointAt, removeKeyNear,
  searchBest, segmentPlan, toChannels, trackSegment,
} from "../src/lib/studio/playerTrack";
import { replayPayload, samePayload, payloadSummary } from "../src/lib/studio/previewTake";
import { _resetTrackStore, setTracks, tracksOf } from "../src/lib/studio/trackStore";

const A = (angle, durationMs, extra = {}) => ({ angle, name: angle, url: `blob:${angle}`, durationMs, ...extra });
const replay = { id: "r1", durationMs: 8000, angles: [A("program", 8000), A("cam1", 6000), A("cam2", 7000), A("cam3", 5000), { angle: "dead", url: null, durationMs: 1 }] };

describe("yan yana: zaman eşi", () => {
  it("kayıtlar yakalama anında biter: tB = tA + (süreB − süreA)", () => {
    expect(angleDelta(replay.angles[0], replay.angles[1])).toBeCloseTo(-2);
    expect(paneTime(5, angleDelta(replay.angles[0], replay.angles[1]))).toBeCloseTo(3);
    // aynı an iki yönde tutarlı
    const d1 = angleDelta(replay.angles[1], replay.angles[2]);
    expect(paneTime(paneTime(4, d1), -d1)).toBeCloseTo(4);
  });
  it("startWall (duvar saati) varsa o kullanılır", () => {
    expect(angleDelta({ startWall: 10_000, durationMs: 8000 }, { startWall: 11_500, durationMs: 9000 })).toBeCloseTo(-1.5);
  });
  it("elle kare kayması (30 fps) ve süre sınırı", () => {
    expect(paneTime(2, 0, 3)).toBeCloseTo(2.1);
    expect(paneTime(2, 0, -90)).toBe(0);
    expect(paneTime(9, 0, 0, { dur: 6 })).toBeCloseTo(5.98);
  });
  it("sapma düzeltmesi: büyükte seek, küçükte hız, duraklatılmışta yarım kare", () => {
    expect(driftAction(5, 4.5, { rate: 1 })).toMatchObject({ type: "seek" });
    expect(driftAction(5, 4.5, { rate: 1 }).t).toBeGreaterThan(5);
    const behind = driftAction(5, 4.95, { rate: 1 });
    expect(behind.type).toBe("rate");
    expect(behind.rate).toBeGreaterThan(1);
    expect(behind.rate).toBeLessThanOrEqual(1.08);
    const ahead = driftAction(5, 5.05, { rate: 0.5 });
    expect(ahead.rate).toBeLessThan(0.5);
    expect(driftAction(5, 5.005, { rate: 0.5 })).toEqual({ type: "ok", rate: 0.5 });
    expect(driftAction(5, 5.01, { paused: true }).type).toBe("ok");
    expect(driftAction(5, 5.05, { paused: true })).toEqual({ type: "seek", t: 5 });
  });
  it("sapma döngüsü yakınsar (benzetim: pencere 0,12 sn geride başlar)", () => {
    let master = 0;
    let pane = -0.12;
    let rate = 1;
    for (let i = 0; i < 300; i += 1) {
      const dt = 1 / 60;
      master += dt;
      const act = driftAction(master, pane, { rate: 1 });
      if (act.type === "seek") pane = act.t; else rate = act.rate;
      pane += dt * rate;
    }
    expect(Math.abs(master - pane)).toBeLessThan(1 / 60);
  });
  it("rVFC ölçümünden ana zaman tahmini", () => {
    expect(estimateMasterTime({ mediaTime: 2, at: 1000 }, 1100, { rate: 0.5 })).toBeCloseTo(2.05);
    expect(estimateMasterTime(null, 0, { fallback: 3 })).toBe(3);
    expect(estimateMasterTime({ mediaTime: 2, at: 1000 }, 1100, { paused: true, fallback: 2.2 })).toBe(2.2);
  });
});

describe("yan yana: yerleşim ve bölme", () => {
  it("yerleşimler, pencere dikdörtgenleri, bölücü, isabet", () => {
    expect(SPLIT_LAYOUTS.map((l) => l.key)).toEqual(["yan", "ustalt", "pip", "uclu", "grid"]);
    expect(layoutFor(2)).toBe("yan"); expect(layoutFor(3)).toBe("uclu"); expect(layoutFor(4)).toBe("grid");
    const yan = splitRects("yan", 2, 1920, 1080);
    expect(yan).toHaveLength(2);
    expect(yan[0].w + yan[1].w + 3).toBeCloseTo(1920);
    expect(splitDividers(yan, 1920, 1080)).toEqual([{ x: yan[0].w, y: 0, w: 3, h: 1080 }]);
    const g = splitRects("grid", 4, 1920, 1080);
    expect(g[3].x).toBeGreaterThan(900); expect(g[3].y).toBeGreaterThan(500);
    expect(splitDividers(g, 1920, 1080).length).toBeGreaterThanOrEqual(4);
    const pip = splitRects("pip", 2, 1920, 1080);
    expect(pip[1].inset).toBe(true);
    expect(hitPane(pip, pip[1].x + 5, pip[1].y + 5)).toBe(1);
    expect(hitPane(pip, 10, 10)).toBe(0);
    const ua = splitRects("ustalt", 2, 1920, 1080);
    expect(ua[0].w / ua[0].h).toBeCloseTo(16 / 9, 1);
  });
  it("normalize: yalnız oynatılabilir, tekrarsız, 2…4; yerleşim değişimi ve kayma", () => {
    expect(normalizeSplit({ panes: [{ angle: "program" }] }, replay)).toBe(null);
    const s = splitFromAngles(replay, ["program", "cam1", "cam1", "dead", "cam2"]);
    expect(s.layout).toBe("uclu");
    expect(s.panes.map((p) => p.angle)).toEqual(["program", "cam1", "cam2"]);
    const two = withLayout(s, "yan", replay);
    expect(two.panes).toHaveLength(2);
    const back = withLayout(two, "grid", replay, ["program", "cam1", "cam2", "cam3"]);
    expect(back.panes.map((p) => p.angle)).toEqual(["program", "cam1", "cam2", "cam3"]);
    const o = setPaneOffset(two, 1, 2);
    expect(setPaneOffset(o, 1, -5).panes[1].offsetFrames).toBe(-3);
    expect(setPaneOffset(o, 1, 500, { relative: false }).panes[1].offsetFrames).toBe(90);
    expect(swapPanes(two, 1).panes[0].angle).toBe("cam1");
    expect(sameSplit(two, { ...two })).toBe(true);
    expect(sameSplit(two, o)).toBe(false);
  });
  it("yük: pencerelerin url / süre / açı farkı; önizleme → yayın bölmeyi taşır", () => {
    const s = splitFromAngles(replay, ["cam1", "program"]);
    const sp = splitForPayload(s, replay);
    expect(sp.panes[0]).toMatchObject({ angle: "cam1", url: "blob:cam1", delta: 0 });
    expect(sp.panes[1].delta).toBeCloseTo(2);
    const p = replayPayload({ list: [replay], playlist: [{ replayId: "r1", angle: "cam1" }], cursor: null, split: s });
    expect(p.split.layout).toBe("yan");
    expect(p.items.map((x) => x.angle)).toEqual(["cam1"]); // yükleme hattı ilk açıyı izler
    const q = replayPayload({ list: [replay], playlist: [{ replayId: "r1", angle: "cam1" }], cursor: null, split: setPaneOffset(s, 1, 1) });
    expect(samePayload(p, q)).toBe(false);
    expect(samePayload(p, replayPayload({ list: [replay], playlist: [{ replayId: "r1", angle: "cam1" }], cursor: null, split: s }))).toBe(true);
    expect(payloadSummary(p)).toMatch(/yan yana · 2 açı/);
    expect(replayPayload({ list: [replay], playlist: [{ replayId: "r1", angle: "cam1" }], cursor: null }).split).toBe(null);
  });
  it("kaynak bölgesi (cover / contain) ve koordinat dönüşümü gidiş-dönüş", () => {
    const r = { x: 960, y: 0, w: 960, h: 1080 };
    const c = paneSource(1280, 720, { zoom: 1, cx: 0.5, cy: 0.5 }, r, "cover");
    expect(c.sw / c.sh).toBeCloseTo(960 / 1080);
    expect(c.sx).toBeCloseTo((1280 - c.sw) / 2);
    const pt = videoToCanvas(c, 1280, 720, 0.5, 0.5);
    expect(pt.x).toBeCloseTo(960 + 480);
    const back = canvasToVideo(c, 1280, 720, pt.x, pt.y);
    expect(back.u).toBeCloseTo(0.5); expect(back.v).toBeCloseTo(0.5);
    const z = paneSource(1280, 720, { zoom: 2, cx: 0.2, cy: 0.8 }, { x: 0, y: 0, w: 1920, h: 1080 }, "contain");
    const q = canvasToVideo(z, 1280, 720, ...Object.values(videoToCanvas(z, 1280, 720, 0.3, 0.7)).slice(0, 2));
    expect(q.u).toBeCloseTo(0.3); expect(q.v).toBeCloseTo(0.7);
    expect(paneScale(1280, 720, r).x).toBeCloseTo((960 / 1080) / (16 / 9));
  });
});

describe("oyuncu takibi: anahtarlar ve ara değer", () => {
  it("anahtar ekle / değiştir / sil, donma anı ilk anahtar", () => {
    let t = newTrack({ replayId: "r1", angle: "program", label: "Mert" });
    t = addKey(t, { t: 1, x: 0.2, y: 0.5 });
    t = addKey(t, { t: 3, x: 0.6, y: 0.5 });
    t = addKey(t, { t: 1.005, x: 0.25, y: 0.5 });
    expect(t.keys.map((k) => k.x)).toEqual([0.25, 0.6]);
    expect(t.freeze.at).toBe(1);
    expect(removeKeyNear(t, 2.9).keys).toHaveLength(1);
    expect(removeKeyNear(t, 2).keys).toHaveLength(2);
  });
  it("doğrusal / Catmull-Rom ara değer, uçlarda kısa tutma", () => {
    const k = [{ t: 0, x: 0, y: 0 }, { t: 1, x: 0.5, y: 0.5 }, { t: 2, x: 1, y: 1 }];
    expect(interpolate(k, 0.5).x).toBeCloseTo(0.25);
    expect(interpolate(k, 1.5, { smooth: false }).x).toBeCloseTo(0.75);
    expect(interpolate(k, 2.2)).toMatchObject({ x: 1, edge: true });
    expect(interpolate(k, 3)).toBe(null);
    // eğri anahtarlardan geçer
    const c = [{ t: 0, x: 0.1, y: 0.5 }, { t: 1, x: 0.4, y: 0.2 }, { t: 2, x: 0.7, y: 0.6 }, { t: 3, x: 0.9, y: 0.3 }];
    for (const q of c) expect(interpolate(c, q.t).x).toBeCloseTo(q.x);
  });
  it("pointAt: anahtar → otomatik (güvenli) → ara değer; düşük güvende ara değere düşer", () => {
    let t = newTrack({});
    t = addKey(t, { t: 0, x: 0.1, y: 0.5 });
    t = addKey(t, { t: 2, x: 0.5, y: 0.5 });
    expect(pointAt(t, 0)).toMatchObject({ src: "key", x: 0.1 });
    expect(pointAt(t, 1)).toMatchObject({ src: "interp" });
    t.auto = [{ t: 0.9, x: 0.35, y: 0.4, c: 0.9 }, { t: 1.1, x: 0.37, y: 0.4, c: 0.9 }];
    expect(pointAt(t, 1)).toMatchObject({ src: "auto" });
    expect(pointAt(t, 1).x).toBeCloseTo(0.36);
    t.auto = t.auto.map((p) => ({ ...p, c: 0.2 }));
    expect(pointAt(t, 1).src).toBe("interp");
    expect(pointAt(t, 2.2).alpha).toBeLessThan(1);
    expect(pointAt(t, 9)).toBe(null);
  });
  it("parça planı ve birleştirme (ileri / geri ağırlıklı)", () => {
    const plan = segmentPlan([{ t: 1, x: 0, y: 0 }, { t: 3, x: 1, y: 1 }], 0, 4);
    expect(plan.map((p) => [p.from, p.to, p.dir])).toEqual([[1, 3, 1], [1, 0, -1], [3, 4, 1], [3, 1, -1]]);
    const m = mergeSegments([
      { from: 1, to: 3, dir: 1, samples: [{ t: 2, x: 0.4, y: 0.5, c: 1 }, { t: 2.5, x: 0.9, y: 0.5, c: 0.3 }] },
      { from: 3, to: 1, dir: -1, samples: [{ t: 2, x: 0.6, y: 0.5, c: 1 }] },
    ]);
    expect(m).toHaveLength(1); // düşük güvenli örnek atıldı
    expect(m[0].x).toBeCloseTo(0.5);
  });
  it("donma: aralıkta geçince bir kez", () => {
    const t = { ...addKey(newTrack({}), { t: 2, x: 0.5, y: 0.5 }), freeze: { on: true, at: null, hold: 2 } };
    expect(freezeDue(t, 1.9, 2.02)).toBe(true);
    expect(freezeDue(t, 2.02, 2.05)).toBe(false);
    expect(freezeDue(t, 3, 1)).toBe(false);
    expect(freezeDue({ ...t, freeze: { on: false } }, 1.9, 2.02)).toBe(false);
  });
  it("kalıcı depo: tekrar + açı başına", () => {
    _resetTrackStore();
    setTracks("r1", "cam1", [addKey(newTrack({ replayId: "r1", angle: "cam1" }), { t: 1, x: 0.3, y: 0.4 })]);
    expect(tracksOf("r1", "cam1")).toHaveLength(1);
    expect(tracksOf("r1", "program")).toHaveLength(0);
    expect(normalizeTrack(JSON.parse(JSON.stringify(tracksOf("r1", "cam1")[0]))).keys[0]).toEqual({ t: 1, x: 0.3, y: 0.4 });
    setTracks("r1", "cam1", []);
    expect(tracksOf("r1", "cam1")).toHaveLength(0);
  });
});

/* ───────── sentetik kareler: dokulu çim + hareketli "oyuncu" (gövde + şort) + rakip ───────── */
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function makeFrames({ n = 45, W = 320, H = 180, path, rival = null, occlude = null, seed = 7 }) {
  const rand = rng(seed);
  const bg = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const i = (y * W + x) * 4;
      const stripe = Math.floor(x / 40) % 2 ? 12 : 0;
      bg[i] = 40 + rand() * 30; bg[i + 1] = 110 + stripe + rand() * 30; bg[i + 2] = 40 + rand() * 25; bg[i + 3] = 255;
    }
  }
  const player = (d, cx, cy, top, bottom) => {
    for (let y = -13; y <= 13; y += 1) {
      for (let x = -5; x <= 5; x += 1) {
        const px = Math.round(cx + x); const py = Math.round(cy + y);
        if (px < 0 || py < 0 || px >= W || py >= H) continue;
        const i = (py * W + px) * 4;
        const c = y < -8 ? [230, 190, 160] : y < 3 ? top : bottom;
        d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2];
      }
    }
  };
  const out = [];
  for (let k = 0; k < n; k += 1) {
    const d = new Uint8ClampedArray(bg);
    for (let j = 0; j < d.length; j += 4) { const e = (rand() - 0.5) * 16; d[j] += e; d[j + 1] += e; d[j + 2] += e; }
    const p = path(k);
    if (rival) { const q = rival(k); player(d, q.x, q.y, [30, 60, 220], [240, 240, 240]); }
    player(d, p.x, p.y, [220, 30, 40], [20, 20, 20]);
    if (occlude && occlude(k)) { const o = occlude(k); for (let y = o.y; y < o.y + o.h; y += 1) for (let x = o.x; x < o.x + o.w; x += 1) { const i = (y * W + x) * 4; d[i] = 200; d[i + 1] = 200; d[i + 2] = 200; } }
    out.push({ t: k / 15, frame: toChannels(d, W, H), truth: p });
  }
  return out;
}
const errPx = (s, frames) => s.map((q, i) => Math.hypot(q.x * frames[i].frame.w - frames[i].truth.x, q.y * frames[i].frame.h - frames[i].truth.y));

describe("oyuncu takibi: NCC izleyici (sentetik)", () => {
  it("yama / arama: bilinen konumu tam bulur", () => {
    const f = makeFrames({ n: 2, path: (k) => ({ x: 100 + k * 6, y: 90 }) });
    const tr = makeTracker({ frameH: 180, size: 0.16 });
    expect(tr.init(f[0].frame, 100, 90)).toBe(true);
    const tpl = extractPatch(f[0].frame, 100, 90, tr.pw, tr.ph);
    const hit = searchBest(f[1].frame, tpl, 100, 90, 14);
    expect(Math.abs(hit.x - 106)).toBeLessThanOrEqual(1);
    expect(hit.score).toBeGreaterThan(0.8);
  });
  it("hareketli lekeyi izler (sinüs yol, ort. hata < 2 px, en çok < 4 px)", () => {
    const path = (k) => ({ x: 40 + k * 5.5, y: 95 + Math.sin(k / 6) * 25 });
    const frames = makeFrames({ n: 45, path });
    const s = trackSegment(frames, { x: path(0).x / 320, y: path(0).y / 180 }, { size: 0.16 });
    expect(s).toHaveLength(45);
    const e = errPx(s, frames);
    expect(e.reduce((a, b) => a + b, 0) / e.length).toBeLessThan(2);
    expect(Math.max(...e)).toBeLessThan(4);
    expect(s.every((q) => q.c > 0.55)).toBe(true);
  });
  it("yanından geçen rakip oyuncuya kaymaz (renk kanalları)", () => {
    const path = (k) => ({ x: 60 + k * 4, y: 100 });
    const rival = (k) => ({ x: 240 - k * 4, y: 104 });
    const frames = makeFrames({ n: 45, path, rival });
    const s = trackSegment(frames, { x: 60 / 320, y: 100 / 180 }, { size: 0.16 });
    const e = errPx(s, frames);
    expect(Math.max(...e.slice(-10))).toBeLessThan(5);
  });
  it("kısa örtülmede güven düşer, sonra yeniden yakalar; ileri + geri birleşmesi anahtarlar arasında doğru", () => {
    const path = (k) => ({ x: 50 + k * 5, y: 90 });
    const frames = makeFrames({ n: 45, path, occlude: (k) => (k >= 20 && k <= 22 ? { x: 140, y: 70, w: 30, h: 45 } : null) });
    const fwd = trackSegment(frames, { x: 50 / 320, y: 90 / 180 }, { size: 0.16 });
    expect(Math.min(...fwd.slice(20, 23).map((q) => q.c))).toBeLessThan(0.55);
    const eFwd = errPx(fwd, frames);
    expect(Math.max(...eFwd.slice(28))).toBeLessThan(4);
    const back = [...frames].reverse();
    const bwd = trackSegment(back, { x: path(44).x / 320, y: 90 / 180 }, { size: 0.16 });
    const merged = mergeSegments([{ from: 0, to: 44 / 15, dir: 1, samples: fwd }, { from: 44 / 15, to: 0, dir: -1, samples: bwd }], { step: 1 / 15 });
    let tr = newTrack({ size: 0.16 });
    tr = addKey(tr, { t: 0, x: 50 / 320, y: 0.5 });
    tr = addKey(tr, { t: 44 / 15, x: path(44).x / 320, y: 0.5 });
    tr.auto = merged;
    const errs = frames.map((f) => { const p = pointAt(tr, f.t); return Math.hypot(p.x * 320 - f.truth.x, p.y * 180 - f.truth.y); });
    expect(errs.reduce((a, b) => a + b, 0) / errs.length).toBeLessThan(2);
    expect(autoQuality(tr).ratio).toBeGreaterThan(0.8);
  });
});
