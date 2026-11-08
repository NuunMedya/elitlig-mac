// @vitest-environment jsdom
//
// Yayın Stüdyosu — arayüz duman testleri: YouTube başlatma penceresi (taslak ön dolumu,
// Enter ile başlat, ön ayarların yerel yedeği), program ses şeridi (tıkla: sessiz),
// ses sekmesi (sahne başına ses, tümünü kapat), tekrar düzenleyici, bölümler kartı.
import React from "react";
import { createRoot } from "react-dom/client";
import YoutubeStartDialog from "../src/views/studio/youtube/YoutubeStartDialog";
import ProgramAudioStrip from "../src/views/studio/audio/ProgramAudioStrip";
import AudioPanel from "../src/views/studio/AudioPanel";
import ReplayPreviewOverlay from "../src/views/studio/modes/ReplayPreviewOverlay";
import BroadcastPanel from "../src/views/studio/BroadcastPanel";
import { normalizeAudio, programAudioChannels, stripAirState, stripList, stripScenes } from "../src/lib/studio/audio";
import { DEFAULT_VIEW } from "../src/views/studio/modes/replayView";

const { act } = React;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const h = React.createElement;
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

function mount(el) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(el));
  return { host, root, unmount: () => { act(() => root.unmount()); host.remove(); } };
}

afterEach(() => { delete window.elitlig; try { localStorage.clear(); } catch { /* yoksay */ } });

describe("YouTube başlatma penceresi", () => {
  it("sunucu taslağıyla dolar, Enter ile başlatır; ön ayar uçları yoksa yerel yedek", async () => {
    const calls = [];
    window.elitlig = {
      request: async (o) => {
        calls.push(`${o.method || "GET"} ${o.path}`);
        if (o.path.endsWith("/youtube-draft")) return { ok: true, data: { title: "Ankara – Yıldız | Elit Lig", description: "Canlı", privacy: "unlisted", tags: ["elitlig"], latency: "low", dvr: true, made_for_kids: false } };
        if (o.path.endsWith("/youtube-presets")) return { ok: false, error: { status: 404, message: "Bulunamadı" } };
        return { ok: false, error: { status: 500 } };
      },
    };
    const started = [];
    const yt = { matchId: 7, privacy: "public", stream: null, loadDraft: async () => (await window.elitlig.request({ path: "/api/admin/live-streams/matches/7/youtube-draft" })).data };
    const { host, unmount } = mount(h(YoutubeStartDialog, { yt, match: { id: 7, first_team_name: "Ankara", second_team_name: "Yıldız" }, onStart: (s) => started.push(s), onClose: () => {} }));
    await flush();
    await flush();
    const title = host.ownerDocument.querySelector(".yt-form input");
    expect(title.value).toBe("Ankara – Yıldız | Elit Lig");
    expect(document.querySelector(".yt-local")).not.toBeNull();
    expect(calls).toContain("GET /api/admin/live-streams/youtube-presets");
    act(() => { title.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); });
    expect(started).toHaveLength(1);
    expect(started[0]).toMatchObject({ title: "Ankara – Yıldız | Elit Lig", privacy: "unlisted", latency: "low", tags: ["elitlig"] });
    unmount();
  });
});

const fakeMixer = (raw = {}, extra = {}) => {
  const settings = normalizeAudio(raw);
  const calls = [];
  const fn = (name) => (...args) => calls.push([name, ...args]);
  return {
    calls,
    available: true, settings, update: fn("update"), setStrip: fn("setStrip"), toggleMic: fn("toggleMic"), toggleStripMute: fn("toggleStripMute"),
    micStatus: { status: "live" }, inputStatus: {}, strips: stripList(settings), playback: "live", routing: settings.routing,
    routeNow: { live: true, media: true, music: true }, setRoute: fn("setRoute"), resetRoute: fn("resetRoute"), setMaster: fn("setMaster"), setMonitor: fn("setMonitor"),
    music: { playing: false, url: null, name: "", time: 0, duration: 0, loop: true, load: fn("load"), play: fn("play"), pause: fn("pause"), stop: fn("stop"), seek: fn("seek"), setLoop: fn("setLoop") },
    analyser: () => null, masterAnalyser: () => null,
    airOf: (id) => stripAirState(settings, id, { context: "live", programSceneId: "s1" }), scenesOf: (id) => stripScenes(settings, id),
    scenes: [{ id: "s1", name: "Kamera 1" }, { id: "s2", name: "Devre arası" }], programSceneId: "s1", setScene: fn("setScene"), setAllScenes: fn("setAllScenes"),
    killAll: settings.killAll, setKillAll: fn("setKillAll"), muteMicOnly: fn("muteMicOnly"),
    channels: programAudioChannels(settings, { context: "live", programSceneId: "s1" }),
    files: { state: {}, play: fn("filePlay"), pause: fn("filePause"), stop: fn("fileStop"), seek: fn("fileSeek") },
    ...extra,
  };
};

describe("program ses şeridi", () => {
  it("bu sahnedeki kanallar; tıklayınca sessiz; master: tümünü kapat", () => {
    const mixer = fakeMixer({ inputs: [{ id: "i1", deviceId: "d", name: "Yakalama kartı", scenes: ["s1"] }, { id: "i2", deviceId: "e", name: "Telsiz", scenes: ["s2"] }] });
    const { host, unmount } = mount(h(ProgramAudioStrip, { mixer, config: { programSceneId: "s1", sources: [] }, programIds: [] }));
    const chips = [...host.querySelectorAll(".pas-ch")];
    expect(chips.map((c) => c.textContent)).toEqual(["Mikrofon", "Yakalama kartı"]);
    act(() => chips[1].click());
    expect(mixer.calls).toContainEqual(["toggleStripMute", "i1"]);
    act(() => host.querySelector(".pas-master").click());
    expect(mixer.calls).toContainEqual(["setKillAll", true]);
    unmount();
  });
});

describe("ses sekmesi", () => {
  it("sahne başına ses tablosu, yayına giden rozetler, tümünü kapat", () => {
    const mixer = fakeMixer({ inputs: [{ id: "i1", deviceId: "d", name: "Kart", scenes: ["s2"] }] });
    const { host, unmount } = mount(h(AudioPanel, { audio: mixer, devices: { audio: [] } }));
    const table = host.querySelector(".au-scenes table");
    expect(table).not.toBeNull();
    const rows = [...table.querySelectorAll("tbody tr")];
    expect(rows.map((r) => r.querySelector("th").textContent.trim())).toEqual(["Mikrofon", "Kart"]);
    const boxes = rows[1].querySelectorAll("input[type=checkbox]");
    expect([...boxes].map((b) => b.checked)).toEqual([false, true]);
    act(() => boxes[0].click());
    expect(mixer.calls).toContainEqual(["setScene", "i1", "s1", true]);
    expect(host.querySelector(".au-onair").textContent).toMatch(/Mikrofon/);
    act(() => host.querySelector(".au-kill").click());
    expect(mixer.calls).toContainEqual(["setKillAll", true]);
    unmount();
  });
});

describe("tekrar destesi kaplaması (önizleme ve program monitörü)", () => {
  const mkDeck = (target, calls, extra = {}) => {
    const el = document.createElement("video");
    return {
      target, active: true, key: "r1|program", replayId: "r1", angle: "program",
      replay: { id: "r1", kind: "goal", angles: [{ angle: "program", url: "elitlig-studio://replays/r/program.mp4" }, { angle: "cam1", url: "elitlig-studio://replays/r/angle-1.mp4" }] },
      angles: [{ angle: "program", url: "elitlig-studio://replays/r/program.mp4" }, { angle: "cam1", url: "elitlig-studio://replays/r/angle-1.mp4" }],
      view: { zoom: 2, cx: 0.5, cy: 0.5 }, setView: (v) => calls.push(["view", typeof v === "function" ? v(DEFAULT_VIEW) : v]),
      rate: 1, setRate: (v) => calls.push(["rate", v]), loop: false, setLoop: () => calls.push(["loop"]),
      inPoint: 0, outPoint: 0, setIn: (s) => calls.push(["in", s]), setOut: (s) => calls.push(["out", s]),
      transport: {
        el: () => el, toggle: () => calls.push(["toggle"]), play: () => calls.push(["play"]), pause: () => calls.push(["pause"]), reverse: (v) => calls.push(["reverse", v]),
        seek: (s) => calls.push(["seek", s]), nudge: (s) => calls.push(["nudge", s]), step: (f) => calls.push(["step", f]), shuttle: (k) => calls.push(["shuttle", k]),
      },
      state: () => ({ time: 0, dur: 10, paused: true, reverse: 0, rate: 1 }),
      el: () => el, setAngle: (a) => calls.push(["angle", a]), mix: false, setMix: () => calls.push(["mix"]), marks: [], addMark: (s) => calls.push(["mark", s]),
      index: 0, total: 1, skip: () => calls.push(["skip"]),
      ...extra,
    };
  };
  const btnIn = (host) => (text) => [...host.querySelectorAll("button")].find((b) => b.textContent.includes(text) || b.getAttribute("aria-label") === text || b.title.startsWith(text));
  it("önizleme: taşıma, giriş / çıkış, yakınlaştırma, hız, açı, yayına al", () => {
    const calls = [];
    const deck = mkDeck("preview", calls);
    const { host, unmount } = mount(h(ReplayPreviewOverlay, { deck, target: "preview", sources: [{ id: "cam1", name: "Kale arkası" }], box: { w: 1000, h: 562 }, onTake: () => calls.push(["take"]) }));
    const btn = btnIn(host);
    expect(host.querySelector(".rpo__tag").textContent).toBe("ÖNİZLEMEDE");
    act(() => btn("−1 sn").click());
    act(() => btn("Oynat").click());
    act(() => btn("Tam kare").click());
    act(() => btn("Giriş").click());
    act(() => btn("Çıkış").click());
    act(() => btn("Hız 0,5×").click());
    act(() => btn("Hız 2×").click());
    act(() => host.querySelectorAll(".rdk-an button")[1].click());
    act(() => { host.querySelector(".rpo__surf").dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })); });
    act(() => btn("YAYINA AL").click());
    expect(calls).toEqual([["nudge", -1], ["toggle"], ["view", DEFAULT_VIEW], ["in", 0], ["out", 0], ["rate", 0.5], ["rate", 2], ["angle", "cam1"], ["step", 1], ["take"]]);
    expect(host.textContent).not.toMatch(/CANLIYA DÖN/);
    unmount();
  });
  it("program: YAYINDA etiketi, süre çubuğu, J / L, yakınlaştırma basamağı, kesme / karışım, canlıya dön (yayına al yok)", () => {
    const calls = [];
    const deck = mkDeck("program", calls, { view: { zoom: 1, cx: 0.5, cy: 0.5 }, total: 2 });
    const { host, unmount } = mount(h(ReplayPreviewOverlay, { deck, target: "program", sources: [], box: { w: 1000, h: 562 }, onLive: () => calls.push(["live"]) }));
    const btn = btnIn(host);
    expect(host.querySelector(".rpo__tag").textContent).toBe("● YAYINDA");
    expect(host.querySelector(".rpo").dataset.deck).toBe("program");
    expect(host.querySelector(".rdk-tl__bar")).not.toBeNull();
    expect(btn("YAYINA AL")).toBeUndefined();
    act(() => btn("Geri oynat").click());
    act(() => btn("İleri oynat").click());
    act(() => btn("Yakınlaştır 1,5×").click());
    act(() => btn("KESME").click());
    act(() => btn("Sıradaki").click());
    act(() => btn("CANLIYA DÖN").click());
    expect(calls[0]).toEqual(["shuttle", "j"]);
    expect(calls[1]).toEqual(["shuttle", "l"]);
    expect(calls[2]).toEqual(["view", { zoom: 1.5, cx: 0.5, cy: 0.5 }]);
    expect(calls.slice(3)).toEqual([["mix"], ["skip"], ["live"]]);
    unmount();
  });
});

describe("Yayın sekmesi: bölümler kartı ve YouTube ayarlarını düzenle", () => {
  it("durum, YouTube'a gönder, kurallar; açık yayında düzenle düğmesi", async () => {
    window.elitlig = { request: async () => ({ ok: false, error: { status: 404 } }) };
    const sent = [];
    const chapters = {
      chapters: [{ id: "a", atMs: 90000, stamp: "01:30", label: "Gol – Ali", kind: "goal" }],
      normalized: [{ at_ms: 0, label: "Başlangıç" }, { at_ms: 90000, label: "Gol – Ali" }], text: "00:00 Başlangıç\n01:30 Gol – Ali",
      rules: { ok: false, problems: ["En az 3 bölüm gerekir (şu an 2)."] },
      sync: { status: "pending", auto: true, lastAt: null, error: null, send: async () => { sent.push(1); return { ok: true }; } },
      onAdd: () => {}, onRemove: () => {}, onClear: () => {}, rename: () => {}, nudge: () => {}, setTime: () => {},
    };
    const yt = { config: { loading: false, configured: true, connected: true }, stream: { broadcast_id: "b1", title: "Maç", privacy: "public" }, privacy: "public", updateSettings: async () => ({}), loadDraft: async () => null };
    const engine = { available: true, info: null, active: false, mode: null, localRecord: null };
    const toasts = [];
    const { host, unmount } = mount(h(BroadcastPanel, { yt, engine, busy: false, matchId: 3, matchName: "A – B", match: { id: 3, first_team_name: "A", second_team_name: "B" }, encoding: { resolution: "720p", fps: 30, bitrateKbps: 2500 }, onEncoding: () => {}, toast: (m) => toasts.push(m), ask: async () => true, localRec: { enabled: false, dir: null }, onLocalRec: () => {}, chapters }));
    expect(host.textContent).toMatch(/Gönderilecek/);
    expect(host.textContent).toMatch(/En az 3 bölüm/);
    const btn = (text) => [...host.querySelectorAll("button")].find((b) => b.textContent.includes(text));
    await act(async () => { btn("YouTube'a gönder").click(); });
    expect(sent).toHaveLength(1);
    expect(toasts[0]).toMatch(/YouTube açıklamasına yazıldı/);
    act(() => btn("YouTube ayarlarını düzenle").click());
    await flush();
    expect(document.querySelector(".yt-dialog")).not.toBeNull();
    expect(document.querySelector(".yt-dialog input").value).toBe("Maç");
    unmount();
  });
});
