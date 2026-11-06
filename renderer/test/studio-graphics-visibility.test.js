// Yayın grafikleri · sahne bazlı görünürlük, mod gizlemeleri ve maç başına yerel durum.
import { buildGraphicsSnapshot } from "../src/lib/studio/graphics/snapshot";
import { drawGraphics, graphicsLayers } from "../src/lib/studio/graphics/draw";
import {
  graphicsStoreKey, isVisibleIn, normalizeVisibility, patchMatchGraphics, readMatchGraphics, toggleSceneVisibility, visibilitySummary,
} from "../src/lib/studio/graphics/visibility";

const now = 1_700_000_000_000;
const pxOf = (font) => Number(String(font).match(/([\d.]+)px/)?.[1]) || 10;
function fakeCtx() {
  const calls = { fillText: 0, drawImage: 0, fillRect: 0 };
  const state = { font: "10px Test" };
  return new Proxy({}, {
    get(t, prop) {
      if (prop === "measureText") return (s) => ({ width: String(s).length * pxOf(state.font) * 0.5 });
      if (prop === "createLinearGradient" || prop === "createRadialGradient") return () => ({ addColorStop() {} });
      if (prop === "fillText" || prop === "drawImage" || prop === "fillRect") return () => { calls[prop] += 1; };
      if (prop === "calls") return calls;
      if (prop in state) return state[prop];
      return () => {};
    },
    set(t, prop, v) { state[prop] = v; return true; },
    has(t, prop) { return prop !== "letterSpacing"; },
  });
}
const live = {
  match: { id: 9, first_team_name: "Ev", second_team_name: "Dep" },
  status: "canli", running: true, period: 1, homeTeamId: 10, awayTeamId: 20, homeName: "Ev", awayName: "Dep",
  timer: { base_ms: 60_000, base_at: new Date(now).toISOString(), running: true },
  score: { home: 1, away: 0 }, events: [], squads: { home: [], away: [] }, nameOf: () => null, logos: {},
};
const snapWith = (opts) => buildGraphicsSnapshot(live, { now, variant: "scoreboard", subtitle: { onAir: true, settings: { customHeadlines: [{ text: "Merhaba" }] } }, interview: { onAir: true, people: [{ name: "Ali", side: "home" }] }, ...opts });

describe("sahne görünürlüğü · saf işlevler", () => {
  it("normalize: eksik / bozuk alanlar 'all', diziler tekilleşir", () => {
    expect(normalizeVisibility(null)).toEqual({ scorebug: "all", subtitle: "all", interview: "all" });
    expect(normalizeVisibility({ scorebug: ["a", "a", " ", 3], subtitle: "x", interview: [] })).toEqual({ scorebug: ["a", "3"], subtitle: "all", interview: [] });
  });
  it("isVisibleIn: sahne yoksa hep görünür; dizi süzer; boş dizi hiçbir yerde", () => {
    const vis = { scorebug: ["s1", "s2"], subtitle: [], interview: "all" };
    expect(isVisibleIn(vis, "scorebug", undefined)).toBe(true);
    expect(isVisibleIn(vis, "scorebug", "s2")).toBe(true);
    expect(isVisibleIn(vis, "scorebug", "s3")).toBe(false);
    expect(isVisibleIn(vis, "subtitle", "s1")).toBe(false);
    expect(isVisibleIn(vis, "interview", "s9")).toBe(true);
    expect(isVisibleIn(null, "scorebug", "s1")).toBe(true);
  });
  it("toggle: 'all'dan bir sahne çıkarılır, hepsi seçilince yeniden 'all'", () => {
    const all = ["s1", "s2", "s3"];
    const a = toggleSceneVisibility("all", "s2", all);
    expect(a).toEqual(["s1", "s3"]);
    expect(toggleSceneVisibility(a, "s1", all)).toEqual(["s3"]);
    expect(toggleSceneVisibility(a, "s2", all)).toBe("all");
    expect(toggleSceneVisibility(["s3"], "s3", all)).toEqual([]);
    expect(visibilitySummary(["s1"], [{ id: "s1", name: "Kamera 1" }])).toBe("1 sahne: Kamera 1");
    expect(visibilitySummary("all")).toBe("Tüm sahneler");
  });
});

describe("drawGraphics · sahne süzgeci ve mod gizlemeleri", () => {
  it("katmanlar: sahneye göre skorbord / altyazı / röportaj bandı", () => {
    const snap = snapWith({ visibility: { scorebug: ["cam"], subtitle: ["cam", "wide"], interview: ["iv"] } });
    expect(snap.visibility).toEqual({ scorebug: ["cam"], subtitle: ["cam", "wide"], interview: ["iv"] });
    expect(graphicsLayers(snap)).toEqual({ variant: true, subtitle: true, interviewBand: true }); // sahne yok → hepsi
    expect(graphicsLayers(snap, "cam")).toEqual({ variant: true, subtitle: true, interviewBand: false });
    expect(graphicsLayers(snap, "wide")).toEqual({ variant: false, subtitle: true, interviewBand: false });
    expect(graphicsLayers(snap, "iv")).toEqual({ variant: false, subtitle: false, interviewBand: true });
  });
  it("gizli sahnede hiçbir şey çizilmez; görünür sahnede çizilir", () => {
    const snap = snapWith({ visibility: { scorebug: ["cam"], subtitle: ["cam"], interview: ["cam"] } });
    const hidden = fakeCtx();
    drawGraphics(hidden, { width: 1280, height: 720, now, sceneId: "other" }, snap);
    expect(hidden.calls.fillText + hidden.calls.drawImage + hidden.calls.fillRect).toBe(0);
    const shown = fakeCtx();
    drawGraphics(shown, { width: 1280, height: 720, now, sceneId: "cam" }, snap);
    expect(shown.calls.fillText).toBeGreaterThan(0);
    const noScene = fakeCtx();
    drawGraphics(noScene, { width: 1280, height: 720, now }, snap);
    expect(noScene.calls.fillText).toBeGreaterThan(0);
  });
  it("snapshot.hideScorebug / hideSubtitle / hideInterview her sahnede uyulur", () => {
    const snap = snapWith({});
    expect(graphicsLayers({ ...snap, hideScorebug: true }, "x")).toEqual({ variant: false, subtitle: true, interviewBand: true });
    expect(graphicsLayers({ ...snap, hideSubtitle: true })).toEqual({ variant: true, subtitle: false, interviewBand: true });
    expect(graphicsLayers({ ...snap, hideInterview: true })).toEqual({ variant: true, subtitle: true, interviewBand: false });
    const ctx = fakeCtx();
    drawGraphics(ctx, { width: 1280, height: 720, now }, { ...snap, hideScorebug: true, hideSubtitle: true, hideInterview: true });
    expect(ctx.calls.fillText).toBe(0);
  });
  it("tam ekran röportaj çeşidi röportaj görünürlüğüne bağlı; orta-alt skorbord bantla çakışmaz", () => {
    const iv = snapWith({ variant: "interview", visibility: { scorebug: [], interview: ["iv"] } });
    expect(graphicsLayers(iv, "iv").variant).toBe(true);
    expect(graphicsLayers(iv, "cam").variant).toBe(false);
    expect(graphicsLayers({ ...iv, hideInterview: true }, "iv").variant).toBe(false);
    const bottom = snapWith({ variant: "bottomboard" });
    expect(graphicsLayers(bottom)).toMatchObject({ variant: false, interviewBand: true });
    expect(graphicsLayers({ ...bottom, hideInterview: true })).toMatchObject({ variant: true, interviewBand: false });
  });
});

describe("maç başına yerel durum (izolasyon)", () => {
  const memory = () => {
    const m = new Map();
    return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), map: m };
  };
  it("yama yalnız o maçın anahtarına yazar; diğer maç değişmez", () => {
    const s = memory();
    patchMatchGraphics(9, { variant: "bottomboard", visibility: { scorebug: ["a"] } }, { storage: s });
    patchMatchGraphics(10, { subtitleOnAir: true }, { storage: s });
    expect(readMatchGraphics(9, s)).toEqual({ variant: "bottomboard", visibility: { scorebug: ["a"] } });
    expect(readMatchGraphics(10, s)).toEqual({ subtitleOnAir: true });
    expect([...s.map.keys()].sort()).toEqual([graphicsStoreKey(10), graphicsStoreKey(9)].sort());
  });
  it("taban verilmezse kayıttan okunur (başka maçın bellek durumu taşınmaz)", () => {
    const s = memory();
    patchMatchGraphics(9, { variant: "lineups" }, { storage: s });
    const next = patchMatchGraphics(10, { syncWeb: false }, { storage: s });
    expect(next).toEqual({ syncWeb: false });
    expect(readMatchGraphics(10, s).variant).toBeUndefined();
  });
  it("maç yoksa yazmaz; bozuk kayıt {} okunur", () => {
    const s = memory();
    patchMatchGraphics(null, { variant: "off" }, { storage: s });
    expect(s.map.size).toBe(0);
    s.setItem(graphicsStoreKey(5), "{bozuk");
    expect(readMatchGraphics(5, s)).toEqual({});
  });
});
