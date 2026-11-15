// @vitest-environment jsdom
//
// Yayın Stüdyosu 2.25.0 / 2.25.1 — akıcılık: video yalnız ÖNİZLEME ve PROGRAM ekranlarında döner.
//   2.25.1: küçük resimler DURAĞAN KARE olabilir (kaynak fotoğrafı, kısayol sahne kutusu):
//   30 sn'de bir, kademeli, görünürken; rAF / kısa aralıklı döngü ve ikincil <video> yok.
//   - sahne kutuları / kartları: canlı video çizmez, döngü kurmaz (sabit şema, değişince bir kez)
//   - tekrar açıları: alt alta İSİM listesi (video / görsel / tuval yok), seçim sırası korunur
//   - kare zamanlaması: titreşim tamponu, biriken son tarih, kısa uyku dilimi
//   - YouTube kanal bağlantısı: kanalı değiştir, sunucu ayarındaki jeton, yetki iletisi
import React from "react";
import { createRoot } from "react-dom/client";
import { vi } from "vitest";
import { AngleList, AngleRow } from "../src/views/studio/replayAngleList";
import { Tile, useTileRenderer } from "../src/views/studio/Multiview";
import { sceneSchematic, paintSchematic } from "../src/lib/studio/sceneSchematic";
import { cadenceStats, createFrameGate, createTimestampSync, monitorFps, pickDue, sleepSlice } from "../src/lib/studio/framePacing";
import { SNAPSHOT_INTERVAL_MS, createSnapshotScheduler } from "../src/lib/studio/snapshotScheduler";
import { sceneDisplayFields, sceneDisplayOf } from "../src/views/studio/shortcuts/sceneDisplay";
import { SourceThumb } from "../src/views/studio/SourcesPanel";
import { connectDone, disconnectResult, normalizeYoutubeConfig, youtubeConnectView, youtubeErrorText } from "../src/lib/studio/youtubeConnect";

const { act } = React;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const h = React.createElement;

function mount() {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  return { host, root, unmount: () => { act(() => root.unmount()); host.remove(); } };
}

/** Tuval bağlamı sahtesi: çağrıları sayar. */
function fakeCtx() {
  const calls = { fillRect: 0, drawImage: 0, fillText: 0 };
  const ctx = new Proxy({ calls, measureText: (t) => ({ width: String(t).length * 6 }) }, {
    get(t, k) { if (k in t) return t[k]; return (...a) => { if (k in calls) calls[k] += 1; void a; }; },
    set(t, k, v) { t[k] = v; return true; },
  });
  return ctx;
}

describe("tekrar açı listesi (isimle, yan yana çipler)", () => {
  it("video / görsel / tuval yok; sıra numarası, durum ve tık / çift tık çalışır", () => {
    const { host, root, unmount } = mount();
    const onClick = vi.fn();
    const onDbl = vi.fn();
    act(() => root.render(h(AngleList, { label: "Açılar" },
      h(AngleRow, { name: "Program", order: 2, stage: "preview", meta: "12 sn", onClick, onDoubleClick: onDbl }),
      h(AngleRow, { name: "Kale arkası", order: 1, stage: "air" }),
      h(AngleRow, { name: "Tribün", order: null }),
    )));
    expect(host.querySelectorAll("video, img, canvas").length).toBe(0);
    const rows = [...host.querySelectorAll(".ang-row")];
    expect(rows.map((r) => r.querySelector(".ang-row__name").textContent)).toEqual(["Program", "Kale arkası", "Tribün"]);
    expect(rows.map((r) => r.getAttribute("aria-checked"))).toEqual(["true", "true", "false"]);
    expect(rows[0].querySelector(".ang-row__box").textContent).toBe("2");
    expect(rows[0].textContent).toContain("ÖNİZLEMEDE");
    expect(rows[1].textContent).toContain("YAYINDA");
    act(() => rows[0].click());
    act(() => rows[0].dispatchEvent(new MouseEvent("dblclick", { bubbles: true })));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onDbl).toHaveBeenCalledTimes(1);
    unmount();
  });
  it("tekrar panelleri ve kısayollarda açı küçük resmi (<video>) kalmadı", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const files = ["ReplayPanel.jsx", "shortcuts/wTekrar.jsx", "shortcuts/ReplayPicker.jsx", "shortcuts/widgetsMore.jsx", "stage/StageTiles.jsx",
      "SourcesPanel.jsx", "scenes/ScenesPanel.jsx", "shortcuts/widgets.jsx", "shortcuts/wSahne.jsx", "shortcuts/wYayin.jsx", "shortcuts/sceneDisplay.jsx", "useSnapshot.js"];
    for (const f of files) {
      const src = fs.readFileSync(path.join(__dirname, "..", "src", "views", "studio", f), "utf8");
      expect(src, f).not.toMatch(/<video\b/);
    }
  });
});

describe("sahne kutuları: canlı video / döngü yok", () => {
  const cfg = {
    sources: [{ id: "cam", kind: "camera", name: "Kamera 1" }, { id: "logo", kind: "image", name: "Logo" }, { id: "mic", kind: "audio", name: "Mik" }],
    scenes: [{ id: "s1", name: "Geniş", layers: [
      { id: "l1", sourceId: "cam", visible: true, x: 0, y: 0, w: 1, h: 1 },
      { id: "l2", sourceId: "logo", visible: true, x: 0.8, y: 0.05, w: 0.15, h: 0.15 },
      { id: "l3", sourceId: "logo", visible: false, x: 0, y: 0, w: 0.1, h: 0.1 },
      { id: "l4", sourceId: "mic", visible: true, x: 0, y: 0, w: 1, h: 1 },
    ] }],
  };
  it("şema: görünür görüntü katmanları (ses / gizli yok), kaynak adlarıyla", () => {
    const boxes = sceneSchematic(cfg.scenes[0], cfg.sources);
    expect(boxes.map((b) => b.name)).toEqual(["Kamera 1", "Logo"]);
    const ctx = fakeCtx();
    paintSchematic(ctx, cfg.scenes[0], cfg.sources, 256, 144);
    expect(ctx.calls.drawImage).toBe(0); // video karesi çizilmez
    expect(ctx.calls.fillText).toBeGreaterThan(0);
  });
  it("kutu tuvali kayıtta ve yapılandırma değişince BİR KEZ boyanır; rAF / zamanlayıcı kurulmaz", () => {
    const raf = vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation(() => 1);
    const si = vi.spyOn(globalThis, "setInterval");
    const ctx = fakeCtx();
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => ctx);
    const configRef = { current: cfg };
    let register = null;
    function Host({ config }) {
      register = useTileRenderer(configRef, { current: new Map() }, { config });
      return h(Tile, { tile: { id: "s1", name: "Geniş", hotkey: 1 }, register, onPreview: () => {}, onProgram: () => {} });
    }
    const { host, root, unmount } = mount();
    act(() => root.render(h(Host, { config: cfg })));
    expect(host.querySelectorAll("video").length).toBe(0);
    const painted = ctx.calls.fillRect;
    expect(painted).toBeGreaterThan(0);
    // Zaman geçse de yeniden çizilmez (döngü yok).
    expect(raf).not.toHaveBeenCalled();
    expect(si).not.toHaveBeenCalled();
    const before = ctx.calls.fillRect;
    const cfg2 = { ...cfg, scenes: [{ ...cfg.scenes[0], name: "Geniş 2" }] };
    configRef.current = cfg2;
    act(() => root.render(h(Host, { config: cfg2 })));
    expect(ctx.calls.fillRect).toBeGreaterThan(before);
    unmount();
    raf.mockRestore(); si.mockRestore(); getContext.mockRestore();
  });
});

describe("kare zamanlaması", () => {
  it("titreşim tamponu: düzenli damga + titreşimli varış → her tik tam bir kare", () => {
    const sync = createTimestampSync();
    const q = [];
    const shown = [];
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    let k = 0;
    // 30 fps kaynak (damga i × 33,3 ms), varış +0…6 ms titreşimli; çıkış ızgarası kaynakla AYNI evrede.
    for (let tick = 1; tick <= 300; tick += 1) {
      const t = tick * (1000 / 30);
      while (k * (1000 / 30) + 6 <= t) { const ts = k * (1000 / 30); const at = ts + rnd() * 6; if (at <= t) { sync.observe(ts, at); q.push({ ts, k }); k += 1; } else break; }
      const idx = pickDue(q, t, sync);
      q.splice(0, idx);
      if (q[0]) shown.push(q[0].k);
    }
    const c = cadenceStats(shown.slice(20), 1);
    expect(c.dup + c.skip).toBe(0);
  });
  it("son tarih kapısı: 144 Hz ekranda 60 fps, 75 Hz ekranda 30 fps ortalaması korunur", () => {
    const run = (hz, fps) => { const g = createFrameGate(fps); let n = 0; for (let i = 0; i < hz * 10; i += 1) if (g.due(i * (1000 / hz))) n += 1; return n / 10; };
    expect(Math.round(run(144, 60))).toBe(60);
    expect(Math.round(run(75, 30))).toBe(30);
    expect(Math.round(run(60, 30))).toBe(30);
  });
  it("uyku dilimi kısa (düşük çözünürlüklü zamanlayıcıdan kaçınır); ekran hızı proje hızı (≤ 60)", () => {
    expect(sleepSlice(33)).toBeLessThanOrEqual(4);
    expect(sleepSlice(-1)).toBe(0);
    expect(monitorFps(30)).toBe(30);
    expect(monitorFps(120)).toBe(60);
  });
  it("damga geri giderse eşleme sıfırlanır", () => {
    const s = createTimestampSync();
    s.observe(1000, 1005); s.observe(1033, 1040);
    s.observe(10, 1075);
    expect(s.stats().resets).toBe(1);
  });
});

describe("YouTube kanal bağlantısı", () => {
  it("sunucu ayarındaki jeton: ayrı görünüm + açıklama; bağlı kanal: 'connected'", () => {
    const env = normalizeYoutubeConfig({ configured: true, connected: false, token_source: "env", env_note: "Sunucu ayarındaki kanal" });
    expect(youtubeConnectView(env)).toBe("env");
    expect(env.envNote).toBe("Sunucu ayarındaki kanal");
    expect(youtubeConnectView(normalizeYoutubeConfig({ configured: true, connected: true, channel: { id: "UC1" } }))).toBe("connected");
    expect(youtubeConnectView(normalizeYoutubeConfig({ configured: false, oauth_ready: false }))).toBe("setup");
  });
  it("kanalı değiştir: kanal değişene dek bağlantı bitmiş sayılmaz", () => {
    const a = normalizeYoutubeConfig({ configured: true, connected: true, channel: { id: "UC1", title: "A" } });
    const b = normalizeYoutubeConfig({ configured: true, connected: true, channel: { id: "UC2", title: "B" } });
    expect(connectDone(a, { switching: true, prevChannel: a.channel })).toBe(false);
    expect(connectDone(b, { switching: true, prevChannel: a.channel })).toBe(true);
    expect(connectDone(a)).toBe(true);
  });
  it("bağlantıyı kes: env_fallback'te açıklama; yetki hatasında gereken izin", () => {
    expect(disconnectResult({ disconnected: true, env_fallback: true }, "NOT").text).toContain("NOT");
    expect(disconnectResult({ disconnected: true }).tone).toBe("success");
    const err = Object.assign(new Error("Bu işlem için yetkiniz yok."), { code: "PERMISSION_DENIED" });
    expect(youtubeErrorText(err, "Bağlantı kesilemedi.")).toMatch(/integrations\.manage/);
    expect(youtubeErrorText(new Error("Sunucu hatası"), "x")).toBe("Sunucu hatası");
  });
});

const studioFile = async (f) => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  return fs.readFileSync(path.join(__dirname, "..", "src", "views", "studio", f), "utf8");
};

describe("2.25.1 · yan yana açılar, isim listesi sahneler", () => {
  it("açı listesi tek satırda kayan çip dizisi (alt alta değil)", async () => {
    const css = await studioFile("replayAngleList.css");
    expect(css).toMatch(/\.ang-list \{[^}]*flex-flow: row wrap/);
    expect(await studioFile("shortcuts/wTekrar.css")).toMatch(/\.wx-ap__g\.is-list[^{]*\{[^}]*flex-flow: row wrap/);
  });
  it("Sahneler sekmesi: küçük resim / şema tuvali yok, isim satırları", async () => {
    const src = await studioFile("scenes/ScenesPanel.jsx");
    const card = src.slice(src.indexOf("const SceneCard = memo"), src.indexOf("function ScenesTabInner"));
    expect(card).not.toMatch(/<canvas/);
    expect(card).toMatch(/scn-card__name/);
    expect(src).toMatch(/scn-grid is-list is-names/);
  });
});

describe("durağan küçük resim zamanlayıcısı (30 sn)", () => {
  function clock() {
    let t = 1_000_000;
    const timers = new Map();
    let id = 0;
    const api = {
      now: () => t,
      setTimer: (fn, ms) => { id += 1; timers.set(id, { at: t + ms, fn, ms }); return id; },
      clearTimer: (k) => timers.delete(k),
      delays: [],
      advance(ms) {
        const end = t + ms;
        for (;;) {
          let next = null;
          for (const [k, v] of timers) if (v.at <= end && (!next || v.at < next[1].at)) next = [k, v];
          if (!next) break;
          timers.delete(next[0]);
          t = next[1].at;
          next[1].fn();
        }
        t = end;
      },
      get pending() { return timers.size; },
    };
    const orig = api.setTimer;
    api.setTimer = (fn, ms) => { api.delays.push(ms); return orig(fn, ms); };
    return api;
  }
  it("en kısa aralık 30 sn; daha kısası istenemez", () => {
    expect(SNAPSHOT_INTERVAL_MS).toBe(30_000);
    expect(createSnapshotScheduler({ intervalMs: 1000 }).intervalMs).toBe(30_000);
  });
  it("her kayıt 30 sn'de bir çizilir; ilk çizimler kademeli (aynı anda değil)", () => {
    const c = clock();
    const s = createSnapshotScheduler({ now: c.now, setTimer: c.setTimer, clearTimer: c.clearTimer, isHidden: () => false, staggerMs: 200 });
    const at = [[], [], []];
    [0, 1, 2].forEach((i) => s.add(() => { at[i].push(c.now()); }));
    c.advance(95_000);
    for (const a of at) {
      expect(a.length).toBe(4); // 0, 30, 60, 90 sn
      for (let k = 1; k < a.length; k += 1) expect(a[k] - a[k - 1]).toBeGreaterThanOrEqual(30_000);
    }
    const firsts = at.map((a) => a[0]).sort((x, y) => x - y);
    expect(firsts[1] - firsts[0]).toBeGreaterThanOrEqual(200);
    expect(firsts[2] - firsts[1]).toBeGreaterThanOrEqual(200);
    expect(c.pending).toBeLessThanOrEqual(1); // tek zamanlayıcı
  });
  it("görünmeyen kayıt çizilmez; görünür olunca eskimişse hemen yenilenir", () => {
    const c = clock();
    const s = createSnapshotScheduler({ now: c.now, setTimer: c.setTimer, clearTimer: c.clearTimer, isHidden: () => false });
    let n = 0;
    const h1 = s.add(() => { n += 1; });
    c.advance(1000);
    expect(n).toBe(1);
    h1.setVisible(false);
    c.advance(120_000);
    expect(n).toBe(1);
    expect(c.pending).toBe(0);
    h1.setVisible(true);
    c.advance(1000);
    expect(n).toBe(2);
  });
  it("sekme gizliyken zamanlayıcı kurulmaz; uyanınca eskimişler yenilenir", () => {
    const c = clock();
    let hidden = false;
    const s = createSnapshotScheduler({ now: c.now, setTimer: c.setTimer, clearTimer: c.clearTimer, isHidden: () => hidden });
    let n = 0;
    s.add(() => { n += 1; });
    c.advance(1000);
    hidden = true;
    c.advance(100_000);
    expect(n).toBe(1);
    hidden = false;
    s.wake();
    c.advance(1000);
    expect(n).toBe(2);
  });
  it("refresh: kaynak / sahne değişince sıradaki kademede; kare yoksa sınırlı erken deneme", () => {
    const c = clock();
    const s = createSnapshotScheduler({ now: c.now, setTimer: c.setTimer, clearTimer: c.clearTimer, isHidden: () => false });
    let n = 0;
    const h1 = s.add(() => { n += 1; });
    c.advance(1000);
    h1.refresh();
    c.advance(1000);
    expect(n).toBe(2);
    let tries = 0;
    s.add(() => { tries += 1; return false; });
    c.advance(60_000);
    expect(tries).toBeLessThanOrEqual(5); // 0, 3, 11, 26 sn, sonra 30 sn aralık
    expect(tries).toBeGreaterThanOrEqual(4);
  });
  it("kaynak kartı fotoğrafı: <video> / rAF / setInterval yok; tek setTimeout ile, yer tutucu hemen", () => {
    const raf = vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation(() => 1);
    const si = vi.spyOn(globalThis, "setInterval");
    const ctx = fakeCtx();
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => ctx);
    const { host, root, unmount } = mount();
    const src = { id: "cam", kind: "camera", name: "Kamera" };
    act(() => root.render(h(SourceThumb, { source: src, runtimeRef: { current: new Map() }, width: 96 })));
    expect(host.querySelectorAll("video").length).toBe(0);
    expect(host.querySelectorAll("canvas").length).toBe(1);
    expect(ctx.calls.fillText).toBeGreaterThan(0); // renk kutusu + ad
    expect(raf).not.toHaveBeenCalled();
    expect(si).not.toHaveBeenCalled();
    unmount();
    raf.mockRestore(); si.mockRestore(); getContext.mockRestore();
  });
  it("küçük resim dosyalarında rAF / kısa setInterval döngüsü yok", async () => {
    for (const f of ["useSnapshot.js", "shortcuts/sceneDisplay.jsx", "SourcesPanel.jsx", "scenes/ScenesPanel.jsx", "../../lib/studio/snapshotScheduler.js"]) {
      const src = await studioFile(f);
      expect(src, f).not.toMatch(/requestAnimationFrame/);
      for (const m of src.matchAll(/setInterval\([^,]+,\s*(\d[\d_]*)/g)) expect(Number(m[1].replace(/_/g, "")), f).toBeGreaterThanOrEqual(15000);
    }
  });
});

describe("kısayol sahne kutuları: görünüm seçeneği", () => {
  it("varsayılan liste (dikey); yatay ve küçük resim seçilebilir; eski ızgara görünümü küçük resim sayılır", () => {
    expect(sceneDisplayOf({})).toEqual({ display: "list", layout: "v" });
    expect(sceneDisplayOf(undefined)).toEqual({ display: "list", layout: "v" });
    expect(sceneDisplayOf({ layout: "h" })).toEqual({ display: "list", layout: "h" });
    expect(sceneDisplayOf({ display: "thumb" }).display).toBe("thumb");
    expect(sceneDisplayOf({ view: "grid" }).display).toBe("thumb");
    expect(sceneDisplayOf({ view: "grid", display: "list" }).display).toBe("list");
  });
  it("seçenek alanları (wOptions şeması): Liste / Küçük resim, Dikey / Yatay yalnız listede", () => {
    const f = sceneDisplayFields();
    expect(f.map((x) => x.key)).toEqual(["display", "layout"]);
    expect(f[0].def).toBe("list");
    expect(f[0].choices.map((c) => c[1])).toEqual(["Liste", "Küçük resim"]);
    expect(f[1].choices.map((c) => c[1])).toEqual(["Dikey", "Yatay"]);
    expect(f[1].when({ display: "list" })).toBe(true);
    expect(f[1].when({ display: "thumb" })).toBe(false);
    expect(sceneDisplayFields({ layout: false }).map((x) => x.key)).toEqual(["display"]);
  });
  it("sahne kısayol düğmeleri seçeneği kaydeder (withOptions) ve liste görünümünde tuval çizmez", async () => {
    const { WIDGET_IMPL } = await import("../src/views/studio/shortcuts/widgets.jsx");
    for (const t of ["scene", "sceneGridPro", "sceneBank", "sceneGrid"]) {
      expect(WIDGET_IMPL[t].options.some((o) => o.key === "display"), t).toBe(true);
    }
    const ctx = { sceneTile: { programId: "a", previewId: "b", onPreview: vi.fn(), onProgram: vi.fn(), paintStill: vi.fn(() => true) }, scenes: [{ id: "a", name: "Geniş" }, { id: "b", name: "Kale" }], sceneOps: { list: [] }, setItemOpts: vi.fn() };
    const { host, root, unmount } = mount();
    act(() => root.render(h("div", null,
      WIDGET_IMPL.scene.render({ ctx, item: { id: "i1", opts: { sceneId: "a" } }, big: false, w: 1, h: 1, togglePop: () => {} }),
      WIDGET_IMPL.sceneGridPro.render({ ctx, item: { id: "i2", opts: { layout: "h" } }, w: 2, h: 2, togglePop: () => {} }),
    )));
    expect(host.querySelectorAll("canvas, video").length).toBe(0);
    expect(host.querySelector(".wsn.is-h")).toBeTruthy();
    expect(host.textContent).toContain("Geniş");
    act(() => host.querySelector(".wsn__r").click());
    expect(ctx.sceneTile.onPreview).toHaveBeenCalledWith("a");
    unmount();
  });
});
