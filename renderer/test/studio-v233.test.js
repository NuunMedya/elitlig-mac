// @vitest-environment jsdom
//
// 2.33 — Yayın Stüdyosu sadeleştirmesi:
//   tekrarı kaydedilecek sahneler · sade tekrar paneli · dar katman listesi · VAR paneli yok, VAR
//   önizlemenin üstünde · tam ekranda tekrar denetimleri · bölme en küçük boyu · araç satırı yalnız
//   Düzenle'de · ses kartları · Özet / Röportaj yan sütunları Kontrol merkezinde · LED (çubuk, tek
//   dokunuş) · sade Yayın paneli · düğme rengi düğme başına.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { createRoot } from "react-dom/client";
import { PROGRAM_ANGLE, anglesToRecord, captureAngles, replaySceneSet, sceneRecordsReplay, sceneSourceFilter, toggleReplayScene } from "../src/lib/studio/replays";
import { VAR_LAYOUTS, normalizeVarV2, varLayoutV2 } from "../src/lib/studio/var";
import { ledBackPatch, ledLiveOn, ledLivePatch } from "../src/views/studio/led/ledRouting";
import { LAYOUT_PANELS, LAYOUT_PRESETS, OPEN_TARGETS, applyGroupWStyle, bakeGroupStyles, isKnownPanelId, normalizeLayout, specToDock, dockPanelIds } from "../src/views/studio/layout/layoutModel";
import { DOCK_PANELS } from "../src/views/studio/dock/dockModel";
import { PANEL_BUTTONS } from "../src/views/studio/shortcuts/wPanels";
import { RAIL_WIDGETS } from "../src/views/studio/shortcuts/railModel";
import { normalizeSettings } from "../src/views/studio/settings/settings";
import ReplayPanel from "../src/views/studio/ReplayPanel";
import { LayersList } from "../src/views/studio/scenes/ScenesPanel";
import VarOverlay, { liveCameraSources, setVarFrame, varFrameRects, varFromReplay } from "../src/views/studio/modes/VarOverlay";
import ReplayPreviewOverlay from "../src/views/studio/modes/ReplayPreviewOverlay";
import FullscreenView from "../src/views/studio/scenes/FullscreenView";
import ModeTab, { ModeControl } from "../src/views/studio/modes/ModeTab";
import LedPanel, { ledNowText } from "../src/views/studio/led/LedPanel";
import { DEFAULT_VIEW } from "../src/views/studio/modes/replayView";

const { act } = React;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const h = React.createElement;
const STUDIO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src/views/studio");
const read = (p) => fs.readFileSync(path.join(STUDIO, p), "utf8");

function mount(el) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(el));
  return { host, root, rerender: (x) => act(() => root.render(x)), unmount: () => { act(() => root.unmount()); host.remove(); } };
}
afterEach(() => { try { localStorage.clear(); } catch { /* yoksay */ } });

/* ───────── 1 · hangi sahnelerin tekrarı kaydedilsin ───────── */
describe("tekrar: kaydedilecek sahneler", () => {
  const sources = [{ id: "c1", kind: "camera", name: "Ana" }, { id: "c2", kind: "camera", name: "Kale" }, { id: "c3", kind: "phone", name: "Tribün" }, { id: "img", kind: "image", name: "Logo" }];
  const scenes = [
    { id: "s1", name: "Geniş", layers: [{ sourceId: "c1" }, { sourceId: "img" }] },
    { id: "s2", name: "Kale", layers: [{ sourceId: "c2" }] },
    { id: "s3", name: "Devre arası", layers: [{ sourceId: "img" }] },
  ];
  it("seçim yoksa eski davranış (tüm kaynaklar, program)", () => {
    expect(replaySceneSet({ all: true })).toBe(null);
    expect(anglesToRecord({ program: true, all: true }, sources, scenes)).toEqual([PROGRAM_ANGLE, "c1", "c2", "c3"]);
    expect(sceneRecordsReplay({}, "s3", scenes)).toBe(true);
  });
  it("yalnız seçili sahnelerde geçen kaynakların açısı kaydedilir", () => {
    const pref = { program: true, all: true, scenes: ["s1"] };
    expect(anglesToRecord(pref, sources, scenes)).toEqual([PROGRAM_ANGLE, "c1"]);
    expect([...sceneSourceFilter(pref, scenes)].sort()).toEqual(["c1", "img"]);
    // sanal kaynak sahnesi (src:<kaynak>) seçilirse o kaynak da
    expect(anglesToRecord({ ...pref, scenes: ["s1", "src:c3"] }, sources, scenes)).toEqual([PROGRAM_ANGLE, "c1", "c3"]);
  });
  it("seçilmemiş sahne yayındayken ÖNEMLİ AN'da program açısı yazılmaz; GOL'de yazılır", () => {
    const pref = { program: true, all: true, scenes: ["s1", "s2"] };
    expect(sceneRecordsReplay(pref, "s3", scenes)).toBe(false);
    expect(sceneRecordsReplay(pref, "src:c2", scenes)).toBe(true);
    expect(sceneRecordsReplay(pref, "src:c3", scenes)).toBe(false);
    expect(captureAngles([PROGRAM_ANGLE, "c1"], pref, "s3", scenes, "moment")).toEqual(["c1"]);
    expect(captureAngles([PROGRAM_ANGLE, "c1"], pref, "s3", scenes, "goal")).toEqual([PROGRAM_ANGLE, "c1"]);
    expect(captureAngles([PROGRAM_ANGLE], pref, "s1", scenes, "moment")).toEqual([PROGRAM_ANGLE]);
  });
  it("seçim aç / kapat: hepsi seçilince null'a döner", () => {
    const ids = scenes.map((s) => s.id);
    let p = toggleReplayScene({ all: true }, "s3", ids);
    expect(p.scenes).toEqual(["s1", "s2"]);
    p = toggleReplayScene(p, "s3", ids);
    expect(p.scenes).toBe(null);
    expect(p.all).toBe(true);
  });
  it("Studio yakalamayı süzer; Ayarlar › Tekrar'da sahne listesi", () => {
    const src = read("Studio.jsx");
    expect(src).toMatch(/captureAngles\(opts\.angles, prefs\.angles, configRef\.current\.programSceneId/);
    expect(src).not.toMatch(/[^.]replays\.capture\(\{ kind/); // tüm yakalamalar süzgeçten geçer
    expect(read("settings/SettingsPage.jsx")).toMatch(/<RecordAngles /);
  });
});

/* ───────── 2 · sade tekrar paneli ───────── */
describe("sade tekrar paneli", () => {
  const sources = [{ id: "cam1", kind: "camera", name: "Kale arkası" }];
  const A = (angle) => ({ angle, url: "x.mp4", durationMs: 12000 });
  const replays = [
    { id: "r1", kind: "goal", createdAt: Date.now() - 1000, durationMs: 12000, playerName: "Can Aydın", angles: [A("program"), A("cam1")] },
    { id: "r2", kind: "moment", createdAt: Date.now() - 5000, durationMs: 12000, label: "Önemli an", angles: [A("program")] },
  ];
  const mk = (over = {}) => {
    const calls = [];
    const rm = { picks: { r1: ["cam1"] }, pick: { toggle: (...a) => calls.push(["toggle", ...a]), all: () => {}, clear: () => {} }, sendToPreview: (r) => { calls.push(["send", r.id]); return true; }, decks: null, previewPos: null, airPos: null, openSplit: null };
    const api = {
      rm, cfg: { between: { kind: "cut" }, transition: { kind: "cut" } }, setCfg: () => {}, sources: { list: sources }, matchId: null, airMode: null, previewMode: null, live: {},
      replays: { replays, pending: [], meta: {}, uploadOf: () => null, onMoment: () => calls.push(["moment"]), encoding: true }, openSettings: (s) => calls.push(["settings", s]), ...over,
    };
    return { api, calls };
  };
  it("kompakt satırlar: açı çipleri, ⋯ menü; deste çubuğu / açı sütunu / ikinci yayına al yok", () => {
    const { api, calls } = mk();
    const { host, unmount } = mount(h(ReplayPanel, { api }));
    const rows = host.querySelectorAll(".rpx-row");
    expect(rows).toHaveLength(2);
    expect(host.querySelector(".rpx-deck")).toBeNull();
    expect(host.querySelector(".rpx-grid")).toBeNull();
    expect(host.querySelector(".rpx-go2")).toBeNull();
    expect([...host.querySelectorAll("button")].some((b) => /ÖNİZLEMEYE GÖNDER|YAYINA AL|GEÇİŞ/.test(b.textContent))).toBe(false);
    expect(rows[0].querySelectorAll(".ang-row")).toHaveLength(2);
    expect(rows[0].querySelector(".ang-row.is-on .ang-row__box").textContent).toBe("1");
    expect(rows[0].querySelector(".rpx-row__menu")).not.toBeNull();
    // açıya tık: seç · satıra tık: önizlemeye
    act(() => rows[0].querySelectorAll(".ang-row")[0].click());
    expect(calls[0]).toEqual(["toggle", "r1", "program"]);
    act(() => rows[1].querySelector(".rpx-row__who").click());
    expect(calls[1]).toEqual(["send", "r2"]);
    // seyrek ayarlar Ayarlar › Tekrar'da
    act(() => host.querySelector(".rpx-bar .icon-btn").click());
    expect(calls.at(-1)).toEqual(["settings", "tekrar"]);
    unmount();
  });
  it("satır CSS'i ≈ 30 px (kompakt)", () => {
    const css = read("modes/replayEditor.css");
    const m = css.match(/\.rpx-row \{[^}]*min-height: (\d+)px/);
    expect(Number(m?.[1])).toBeLessThanOrEqual(32);
  });
});

/* ───────── 3 · sahne → dar katman listesi ───────── */
describe("sahneler: dar katman listesi", () => {
  it("ad, tür simgesi, görünürlük, sıra (↑ ↓); tuval yok", () => {
    const calls = [];
    const config = { sources: [{ id: "a", kind: "camera", name: "Kamera" }, { id: "b", kind: "image", name: "Logo" }], scenes: [] };
    const scene = { id: "s", name: "Sahne", layers: [{ id: "l1", sourceId: "a", visible: true }, { id: "l2", sourceId: "b", visible: false }] };
    const actions = { onSelectLayer: () => {}, onUpdateLayer: (...a) => calls.push(["upd", ...a]), onRemoveLayer: () => {}, onMoveLayer: (...a) => calls.push(["move", ...a]), onAddLayer: () => {}, onNewSource: () => {} };
    const { host, unmount } = mount(h(LayersList, { config, scene, actions, narrow: true, onClose: () => calls.push(["close"]) }));
    const rows = host.querySelectorAll(".st-lyr__row");
    expect(rows).toHaveLength(2);
    expect(host.querySelector("canvas")).toBeNull();
    expect(rows[0].textContent).toMatch(/Logo/); // üstteki katman önce
    expect(rows[0].querySelector(".st-lyr__ord")).not.toBeNull();
    act(() => rows[0].querySelector(".st-lyr__btn").click());
    expect(calls[0]).toEqual(["upd", "s", "l2", { visible: true }]);
    act(() => rows[0].querySelectorAll(".st-lyr__ord button")[1].click());
    expect(calls[1][0]).toBe("move");
    unmount();
    const css = read("scenes/scenes.css");
    expect(css).toMatch(/has-layers[^{]*\{ grid-template-columns: minmax\(0, 1fr\) clamp\(190px, 34%, 230px\)/);
    expect(read("scenes/ScenesPanel.jsx")).toMatch(/showLayers = Boolean\(scene\) && !showInline/);
  });
});

/* ───────── 4 · VAR paneli yok; VAR önizlemenin üstünde ───────── */
describe("VAR: panel yok, önizleme kaplaması", () => {
  it("VAR paneli / sekmesi / panel düğmesi kaldırıldı (VAR teması, kısayol ve çizim duruyor)", () => {
    expect(LAYOUT_PANELS.some((p) => p.key === "var")).toBe(false);
    expect(DOCK_PANELS.some((p) => p.key === "var")).toBe(false);
    expect(isKnownPanelId("var")).toBe(false);
    expect(PANEL_BUTTONS.openVar).toBeUndefined();
    expect(RAIL_WIDGETS.some((w) => w.type === "openVar")).toBe(false);
    expect(OPEN_TARGETS.some((t) => t.id === "var")).toBe(false);
    for (const p of LAYOUT_PRESETS) expect(dockPanelIds(specToDock(p.spec))).not.toContain("var");
    expect(RAIL_WIDGETS.some((w) => w.type === "var")).toBe(true); // V / VAR düğmesi kalır
    expect(read("layout/Workspace.jsx")).toMatch(/!isKnownPanelId\(p\.id\)/); // eski kayıttan atılır
  });
  it("çerçeve düzenleri: Tek, 50/50, Üst–alt, PiP, 1+2, 2×2; 4 çerçeve", () => {
    expect(VAR_LAYOUTS.map((l) => l.short)).toEqual(["Tek", "50/50", "1+2", "Üst–alt", "PiP", "2×2"]);
    expect(normalizeVarV2({}).slots).toHaveLength(4);
    expect(varLayoutV2("grid", 1920, 1080).panes).toHaveLength(4);
    const pip = varLayoutV2("pip", 1920, 1080).panes;
    expect(pip[1].inset).toBe(true);
    expect(pip[1].rect.w).toBeLessThan(pip[0].rect.w / 2);
  });
  it("tekrardan VAR: seçili açılar çerçevelere, düzen açı sayısına göre; çerçeveye canlı kamera", () => {
    let v = varFromReplay(null, "r1", ["program", "cam1", "cam2"]);
    expect(v.layout).toBe("three");
    expect(v.slots.slice(0, 3).map((s) => s.angle)).toEqual(["program", "cam1", "cam2"]);
    expect(varFromReplay(null, "r1", ["program"]).layout).toBe("single");
    expect(varFromReplay(null, "r1", ["a", "b"]).layout).toBe("two");
    expect(varFromReplay(null, "r1", ["a", "b", "c", "d", "e"]).layout).toBe("grid");
    v = setVarFrame(v, 1, { kind: "source", sourceId: "cam9" });
    expect(v.slots[1]).toEqual({ kind: "source", replayId: null, angle: "program", sourceId: "cam9" });
    expect(varFrameRects(v)).toHaveLength(3);
    for (const r of varFrameRects({ ...v, layout: "grid" })) { expect(r.x).toBeGreaterThanOrEqual(0); expect(r.x + r.w).toBeLessThanOrEqual(1); }
    expect(liveCameraSources([{ id: "a", kind: "camera" }, { id: "b", kind: "video" }, { id: "c", kind: "image" }]).map((s) => s.id)).toEqual(["a"]);
  });
  it("kaplama: düzen çipleri, çerçeveye tık → açılar + canlı kameralar, tek tıkla atama; durum", () => {
    let settings = varFromReplay(null, "r1", ["program", "cam1"]);
    const calls = [];
    const vr = { get settings() { return settings; }, set: (p) => { settings = normalizeVarV2({ ...settings, ...p }); calls.push(["set", p]); }, setSlot: (i, p) => { settings = setVarFrame(settings, i, p); calls.push(["slot", i, p.kind, p.sourceId || p.angle]); } };
    const replays = [{ id: "r1", kind: "goal", angles: [{ angle: "program", url: "a" }, { angle: "cam1", url: "b" }] }];
    const sources = [{ id: "cam1", kind: "camera", name: "Kale arkası" }, { id: "cam2", kind: "camera", name: "Tribün" }];
    let backs = 0;
    const el = () => h(VarOverlay, { vr, replays, sources, box: { w: 960, h: 540 }, onTake: () => calls.push(["take"]), onBack: () => { backs += 1; } });
    const { host, rerender, unmount } = mount(el());
    expect(host.querySelectorAll("[data-var-layout]")).toHaveLength(6);
    expect(host.querySelectorAll("[data-var-frame]")).toHaveLength(2);
    act(() => host.querySelector("[data-var-frame='1']").click());
    const pick = host.querySelector(".vo-pick");
    expect(pick.textContent).toMatch(/Canlı kameralar/);
    expect(pick.textContent).toMatch(/Tribün/);
    act(() => [...pick.querySelectorAll("button")].find((b) => b.textContent.includes("Tribün")).click());
    expect(calls.at(-1)).toEqual(["slot", 1, "source", "cam2"]);
    rerender(el());
    act(() => host.querySelector("[data-var-layout='grid']").click());
    rerender(el());
    expect(host.querySelectorAll("[data-var-frame]")).toHaveLength(4);
    act(() => [...host.querySelectorAll(".vo__states button")].find((b) => b.textContent === "KARAR").click());
    expect(settings.state).toBe("decision");
    act(() => host.querySelector(".vo__var").click());
    expect(backs).toBe(1);
    act(() => host.querySelector(".vo__btn.is-take").click());
    expect(calls.at(-1)).toEqual(["take"]);
    unmount();
  });
  it("tekrar kaplamasında sağ altta VAR düğmesi; Studio önizlemeye bağlar", () => {
    const deck = {
      target: "preview", active: true, replay: { id: "r1", angles: [] }, replayId: "r1", angle: "program", angles: [], view: DEFAULT_VIEW, setView: () => {}, rate: 1, setRate: () => {},
      inPoint: 0, outPoint: 0, setIn: () => {}, setOut: () => {}, loop: true, setLoop: () => {}, transport: { toggle() {}, step() {}, nudge() {}, reverse() {}, shuttle() {}, el: () => null },
      state: () => ({ time: 0, dur: 10, paused: true, reverse: 0, rate: 1 }), setAngle: () => {}, mix: false, setMix: () => {}, marks: [], addMark: () => {}, seq: [], index: 0, total: 1,
    };
    let v = 0;
    const { host, unmount } = mount(h(ReplayPreviewOverlay, { deck, sources: [], meta: {}, box: { w: 900, h: 506 }, onTake: () => {}, onVar: () => { v += 1; } }));
    const btn = host.querySelector("[data-var-toggle]");
    expect(btn.textContent).toBe("VAR");
    act(() => btn.click());
    expect(v).toBe(1);
    unmount();
    const src = read("Studio.jsx");
    expect(src).toMatch(/onVar=\{VR \? openVarFromReplay : null\}/);
    expect(src).toMatch(/varEditing && <VarOverlay/);
    expect(src).not.toMatch(/defPanel\("var"/);
  });
});

/* ───────── 5 · tam ekranda tekrar denetimleri ───────── */
describe("tam ekran: kaplama", () => {
  it("overlay(box) tam ekranda da çizilir; Esc tam ekranı kapatır, canlıya dönmez", () => {
    let box = null;
    const src = document.createElement("canvas");
    const { host, unmount } = mount(h(FullscreenView, { source: src, label: "ÖNİZLEME", tone: "pvw", onClose: () => {}, overlay: (b) => { box = b; return h("div", { className: "test-ov" }, "kaplama"); } }));
    expect(host.querySelector(".st-fs .st-screen-box .test-ov")).not.toBeNull();
    expect(box).toEqual(expect.objectContaining({ w: expect.any(Number) }));
    unmount();
    expect(read("modes/BroadcastModes.jsx")).toMatch(/e\.key === "Escape" && document\.querySelector\("\.st-fs"\)/);
    expect(read("Studio.jsx")).toMatch(/overlay=\{fullscreen === "preview" \? previewOverlay : programOverlay\}/);
  });
});

/* ───────── 6 · 7 · bölme boyu, araç satırı ───────── */
describe("yerleşim: daha küçük bölme, araç satırı yalnız Düzenle'de", () => {
  it("bölmeler 100 px'in altına küçülebilir", () => {
    const w = read("layout/Workspace.jsx");
    expect(w).toMatch(/const PANE_MIN_H0 = (\d+);/);
    expect(Number(w.match(/const PANE_MIN_H0 = (\d+);/)[1])).toBeLessThan(60);
    expect(w).not.toMatch(/minimumHeight: 100/);
    expect(w).toMatch(/setConstraints\(\{ minimumHeight: PANE_MIN_H\(\), minimumWidth: PANE_MIN_W\(\) \}\)/);
  });
  it("Sütun · Sık / Normal / Geniş satırı Düzenle kapalıyken gizli; ayarla hep gösterilebilir", () => {
    const css = read("dock/panelFrame.css");
    expect(css).toMatch(/\.studio:not\(\.is-ptools\) \.pf-tools \{ display: none; \}/);
    expect(css).toMatch(/\.studio:not\(\.is-ptools\) \.pf-ab :is\(\.pf-cols, \.pf-dens\) \{ display: none; \}/);
    expect(read("Studio.jsx")).toMatch(/lay\.edit \|\| settings\.view\.panelTools \? "is-ptools" : ""/);
    expect(normalizeSettings({}).view.panelTools).toBe(false);
    expect(normalizeSettings({ view: { panelTools: true } }).view.panelTools).toBe(true);
  });
});

/* ───────── 8 · ses kartları ───────── */
describe("ses kartları dar sütunda", () => {
  it("kartlar kanal şeridi eninden değil 250 px'ten dizilir; kap sorgusu, üç nokta", () => {
    const css = read("modes/modes.css");
    expect(css).toMatch(/\.pf\[data-pf="ses"\] \.mx-cards[^{]*\{ grid-template-columns: repeat\(auto-fill, minmax\(min\(250px, 100%\), 1fr\)\); \}/);
    expect(css).toMatch(/container-name: mxcard/);
    expect(css).toMatch(/\.mx-matrix table \{ table-layout: fixed; \}/);
  });
});

/* ───────── 9 · 10 · Özet / Röportaj yan sütunları Kontrol merkezinde ───────── */
describe("Özet / Röportaj: yan sütun yok, Kontrol merkezinde", () => {
  const api = (mode) => ({
    state: { air: null, preview: null, stage: "idle" }, cfg: { transition: { kind: "cut", ms: 0 }, between: { kind: "cut" }, layers: { [mode]: {} } }, setCfg: () => {},
    takeMode: () => {}, takeToAir: () => {}, endOnAir: () => {}, sources: { list: [] }, audio: null, airMode: null, previewMode: null,
    replays: { replays: [], meta: {} }, matchId: null, live: { score: { home: 0, away: 0 }, events: [] }, hm: { hl: { job: { phase: "idle" }, server: {}, available: true } },
    openControl: () => {}, g: null, im: { iv: {} },
  });
  it("Özet sekmesi: yalnız sıra (yan sütun yok); Kontrol bölümü yayın kartını taşır", () => {
    const { host, unmount } = mount(h(ModeTab, { api: api("ozet"), mode: "ozet" }));
    expect(host.querySelector(".md-side")).toBeNull();
    expect(host.querySelector(".md-air")).toBeNull();
    unmount();
    const c = mount(h(ModeControl, { api: api("roportaj"), mode: "roportaj" }));
    expect(c.host.querySelector(".md-air")).not.toBeNull();
    expect(c.host.querySelector(".md-layers")).not.toBeNull();
    c.unmount();
    const s = read("Studio.jsx");
    expect(s).toMatch(/key: "ozetKontrol"/);
    expect(s).toMatch(/key: "roportajKontrol"/);
    expect(read("HighlightsPanel.jsx")).toMatch(/view === "order" && \(busy/); // Özeti oluştur başlıkta tek tık
  });
});

/* ───────── 11 · LED ───────── */
describe("LED: tek dokunuşla yayını ver, sade panel", () => {
  it("yayını ver / önceki içeriğe dön (saf)", () => {
    const prefs = { web: true, route: "scene", sceneId: "s2", live: false };
    const p = ledLivePatch(prefs, { content: "scoreboard", freeze: true });
    expect(p).toMatchObject({ web: false, route: "program", live: true, back: { web: true, route: "scene", sceneId: "s2", content: "scoreboard" } });
    expect(p.fx).toMatchObject({ content: "scene", freeze: false, black: false });
    expect(ledLiveOn({ ...prefs, ...p })).toBe(true);
    // ikinci kez: önceki içerik korunur
    expect(ledLivePatch({ ...prefs, ...p }, p.fx).back).toEqual(p.back);
    const b = ledBackPatch({ ...prefs, ...p }, p.fx);
    expect(b).toMatchObject({ web: true, route: "scene", sceneId: "s2", live: false, back: null });
    expect(b.fx.content).toBe("scoreboard");
    expect(ledBackPatch({}, {})).toMatchObject({ web: false, route: "program", live: false });
  });
  it("panel: büyük YAYINI LED'E VER, LED sahnesi düğmeleri, ayarlar düğmesi; ekran seçimi panelde yok", () => {
    const calls = [];
    const led = {
      available: true, displays: [{ id: 2, label: "LED Duvar" }], status: { open: false }, prefs: { displayId: 2, route: "program", web: false }, fx: { content: "scene" }, live: false,
      toggleLive: () => calls.push("live"), show: (o) => calls.push(["show", o]), open: () => calls.push("open"), close: () => {},
    };
    const scenes = [{ id: "s1", name: "Geniş" }, { id: "s2", name: "Sponsor" }];
    const { host, unmount } = mount(h(LedPanel, { led, scenes, matchId: 7, onSettings: () => calls.push("settings") }));
    expect(host.querySelector(".led-live").textContent).toMatch(/YAYINI LED'E VER/);
    expect(host.querySelector("select")).toBeNull();
    expect(host.querySelectorAll(".led-scenes .led-chip")).toHaveLength(2);
    act(() => host.querySelector(".led-live").click());
    act(() => host.querySelectorAll(".led-scenes .led-chip")[1].click());
    act(() => host.querySelector(".led-status .icon-btn").click());
    expect(calls).toEqual(["live", ["show", { route: "scene", sceneId: "s2" }], "settings"]);
    unmount();
    expect(ledNowText({ status: { open: true }, prefs: {}, live: true, fx: {} }, [])).toBe("Yayın (Program)");
    expect(read("settings/SettingsPage.jsx")).toMatch(/LED çıkış penceresi/);
  });
});

/* ───────── 13 · düğme rengi düğme başına ───────── */
describe("düğme rengi düğme başına", () => {
  const board = (items) => ({ title: "P", cols: 2, rowH: 40, items });
  it("eski grup rengi düğmelere yazılır (ekrandaki renk aynı kalır), grup varsayılanı silinir", () => {
    const l = normalizeLayout({ boards: { rail: board([{ i: "a", t: "w:openSahne", x: 0, y: 0, w: 1, h: 2 }, { i: "b", t: "w:openTekrar", x: 1, y: 0, w: 1, h: 2, o: { wc: "#16a34a" } }, { i: "c", t: "w:mic", x: 0, y: 2, w: 1, h: 2 }]) }, wstyle: { panel: { c: "#e11d48", s: "fill" } } });
    const b = bakeGroupStyles(l);
    expect(b.wstyle).toEqual({});
    const [a, bb, c] = b.boards.rail.items;
    expect(a.o).toEqual({ wc: "#e11d48", ws: "fill" });
    expect(bb.o).toEqual({ wc: "#16a34a", ws: "fill" }); // kendi rengi korunur
    expect(c.o).toBeUndefined(); // başka grup
    expect(bakeGroupStyles(normalizeLayout({}))).toEqual(normalizeLayout({}));
  });
  it("öğe kimlikleri tüm panolarda tekil (aynı kimlikli iki düğme birlikte boyanmaz)", () => {
    const l = normalizeLayout({ boards: { rail: board([{ i: "w_x", t: "w:openSahne", x: 0, y: 0, w: 1, h: 2 }]), b2: board([{ i: "w_x", t: "w:openTekrar", x: 0, y: 0, w: 1, h: 2 }]) } });
    expect(l.boards.rail.items[0].i).toBe("w_x");
    expect(l.boards.b2.items[0].i).not.toBe("w_x");
  });
  it("'Hepsini boya' öğelere bir kez yazar; sonra tek düğme ayrı değişir", () => {
    let l = normalizeLayout({ boards: { rail: board([{ i: "a", t: "w:openSahne", x: 0, y: 0, w: 1, h: 2 }, { i: "b", t: "w:openTekrar", x: 1, y: 0, w: 1, h: 2 }]) } });
    l = applyGroupWStyle(l, "panel", { c: "#0284c7" });
    expect(l.boards.rail.items.map((x) => x.o?.wc)).toEqual(["#0284c7", "#0284c7"]);
    expect(l.wstyle || {}).toEqual({});
    l = { ...l, boards: { rail: { ...l.boards.rail, items: l.boards.rail.items.map((x) => (x.i === "a" ? { ...x, o: { ...x.o, wc: "#e11d48" } } : x)) } } };
    expect(l.boards.rail.items.map((x) => x.o.wc)).toEqual(["#e11d48", "#0284c7"]);
    expect(read("layout/useLayout.js")).toMatch(/bakeGroupStyles\(upgradeLayout/);
  });
});
