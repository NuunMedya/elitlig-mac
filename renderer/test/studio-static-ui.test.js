// @vitest-environment jsdom
//
// Yayın Stüdyosu 2.25.0 — akıcılık: video yalnız ÖNİZLEME ve PROGRAM ekranlarında döner.
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

describe("tekrar açı listesi (isimle, alt alta)", () => {
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
    const files = ["ReplayPanel.jsx", "shortcuts/wTekrar.jsx", "shortcuts/ReplayPicker.jsx", "shortcuts/widgetsMore.jsx", "stage/StageTiles.jsx"];
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
