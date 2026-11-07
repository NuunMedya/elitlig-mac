// @vitest-environment jsdom
//
// [gol-klip] "Canlı yayın sırasında tüm goller kaybolmuş" — gerileme testleri ve yeni akış:
//   1. Eski yoklama yeni golü siliyordu (useLiveMatch: olaydan önce başlayan GET sonra dönünce).
//   2. Akış kapanırken (kayıt sürerken) iptal anahtarı tüketiyor, gol klibi olaya hiç bağlanmıyor /
//      yüklenmiyordu (useReplays.attach).
//   3. Reji GOL dokunuşları: olay EN ESKİ bekleyen klibe bağlanıyordu (başka bir anın görüntüsü).
//   4. Butondan sonrası (post-roll), gecikmeli yükleme, markAiredSelection, özet varsayılanı.
import React from "react";
import { createRoot } from "react-dom/client";
import { captureWindow, countdownText, defaultSummaryItems, mergeEvents, normalizeAired, pickDockClip, scheduledText, selectionFromPayload, uploadPlanOf } from "../src/lib/studio/goalClips";
import { buildHighlightPlan } from "../src/lib/studio/highlights";
import { normalizeReplay } from "../src/lib/studio/replays";
import { normalizeSettings } from "../src/views/studio/settings/settings";
import { pendingText } from "../src/views/studio/replayUploadUi";
import { useReplays } from "../src/views/studio/useReplays";
import { useLiveMatch } from "../src/views/studio/useLiveMatch";

const { act } = React;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const h = React.createElement;

function mountHook(useHook) {
  const out = { current: null };
  function Probe() { out.current = useHook(); return null; }
  const host = document.createElement("div");
  const root = createRoot(host);
  act(() => root.render(h(Probe)));
  return { out, unmount: () => act(() => root.unmount()) };
}
const tick = (ms) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

const R = (id, createdAt, kind, angles, extra = {}) => normalizeReplay({ id, createdAt, kind, durationMs: 10000, angles: angles.map((a) => ({ angle: a, name: a, url: `elitlig-studio://replays/${id}/${a}.mp4`, durationMs: 10000 })), ...extra });

afterEach(() => { vi.useRealTimers(); delete window.elitlig; try { localStorage.clear(); } catch { /* yoksay */ } });

describe("saf mantık", () => {
  it("pencere: öncesi + butondan sonrası, kayıt sonrası süre dolunca", () => {
    expect(captureWindow(15, 4)).toEqual({ pre: 15, post: 4, seconds: 19, saveDelayMs: 4000 });
    expect(captureWindow(30, 99)).toMatchObject({ post: 15, seconds: 45 });
    expect(captureWindow(15, 0)).toMatchObject({ seconds: 15, saveDelayMs: 0 });
    expect(countdownText(42000)).toBe("0:42");
    expect(countdownText(125000)).toBe("2:05");
  });

  it("ayarlar: butondan sonrası 0–15 (vars. 4), yükleme gecikmesi (vars. 60)", () => {
    expect(normalizeSettings(null).replay).toMatchObject({ seconds: 15, postSeconds: 4, uploadDelaySec: 60 });
    expect(normalizeSettings({ replay: { postSeconds: 40, uploadDelaySec: -5 } }).replay).toMatchObject({ postSeconds: 15, uploadDelaySec: 0 });
  });

  it("yayın yükünden tekrar başına açılar ve bölümler", () => {
    const payload = { kind: "replay", items: [
      { replayId: "r1", angle: "cam-1", startSec: 2.5, endSec: 6 },
      { replayId: "r1", angle: "program", startSec: 0, endSec: null },
      { replayId: "r2", angle: "program", startSec: 1, endSec: 1.1 },
    ] };
    expect(selectionFromPayload(payload)).toEqual({
      r1: { angles: ["cam-1", "program"], segments: [{ angle: "cam-1", inSec: 2.5, outSec: 6 }, { angle: "program", inSec: 0, outSec: null }] },
      r2: { angles: ["program"], segments: [{ angle: "program", inSec: 1, outSec: null }] },
    });
  });

  it("yükleme planı: bölüm / seçilen açılar → kurgu, seçim yok ya da yalnız program → program", () => {
    const r = R("r1", 1, "goal", ["program", "cam-1", "cam-2"]);
    expect(uploadPlanOf(r, null)).toEqual({ mode: "program", count: 0 });
    expect(uploadPlanOf(r, { angles: ["program"] })).toEqual({ mode: "program", count: 0 });
    expect(uploadPlanOf(r, { angles: ["cam-2", "program"] })).toEqual({ mode: "angles", count: 2, segments: [{ angle: "cam-2", inSec: 0, outSec: null }, { angle: "program", inSec: 0, outSec: null }] });
    expect(uploadPlanOf(r, { segments: [{ angle: "cam-1", inSec: 1, outSec: 4 }, { angle: "yok", inSec: 0 }] })).toMatchObject({ mode: "angles", count: 1, segments: [{ angle: "cam-1", inSec: 1, outSec: 4 }] });
    expect(scheduledText(42_000, { mode: "angles", count: 2 }, 0)).toBe("Yükleme 0:42 sonra · 2 açı seçili");
    expect(normalizeAired({ angles: ["x"] }, r)).toBe(null);
  });

  it("GERİLEME: Reji GOL dokunuşu olayı EN YENİ aynı taraf klibine bağlar (eskiden en eskisine)", () => {
    const list = [{ key: "eski-iptal", side: "home" }, { key: "dep", side: "away" }, { key: "yeni", side: "home" }];
    expect(list[pickDockClip(list, "home")].key).toBe("yeni");
    expect(list[pickDockClip(list, "away")].key).toBe("dep");
    expect(pickDockClip([], "home")).toBe(-1);
  });

  it("özet varsayılanı: goller + işaretli + yayına verilen konumlar, aynı bölümlerle, kronolojik", () => {
    const g1 = R("g1", 100, "goal", ["program", "cam-1"]);
    const m1 = R("m1", 50, "moment", ["program", "cam-1"]);
    const m2 = R("m2", 200, "moment", ["program"]);
    const sel = { g1: { angles: ["cam-1", "program"], segments: [{ angle: "cam-1", inSec: 2, outSec: 6 }, { angle: "program", inSec: 5, outSec: null }], aired: true }, m1: { angles: ["cam-1"], segments: [], aired: false } };
    const items = defaultSummaryItems([m2, g1, m1], { selectionOf: (id) => sel[id] || null });
    expect(items).toEqual([
      { replayId: "m1", angles: ["cam-1"] },
      { replayId: "g1", angles: ["cam-1", "program"], segments: [{ angle: "cam-1", inSec: 2, outSec: 6 }, { angle: "program", inSec: 5, outSec: null }] },
    ]);
    const plan = buildHighlightPlan({ items, replays: [g1, m1] });
    const clips = plan.segments.filter((s) => s.type === "clip");
    expect(clips.map((c) => [c.replayId, c.angle, c.startSec, c.ms])).toEqual([["m1", "cam-1", 0, 10000], ["g1", "cam-1", 2, 4000], ["g1", "program", 5, 5000]]);
    // Kırpma (bölümsüz öğe)
    const trimmed = buildHighlightPlan({ items: [{ replayId: "m1", angles: ["program"], trim: { inSec: 3, outSec: 8 } }], replays: [m1] });
    expect(trimmed.segments.find((s) => s.type === "clip")).toMatchObject({ startSec: 3, ms: 5000 });
  });

  it("GERİLEME: eski yoklama yeni golü silmez, silinen olayı geri getirmez (mergeEvents)", () => {
    const local = { created: new Map([[11, { ev: { id: 11, olay_kodu: "GOAL_RIGHT_FOOT" }, at: 1000 }]]), removed: new Map([[5, 1000]]) };
    const stale = [{ id: 5 }, { id: 7 }];
    expect(mergeEvents(stale, local, 2000, { issuedAt: 900 }).map((e) => e.id)).toEqual([7, 11]);
    expect(local.created.size).toBe(1); // değişiklikten önce gönderilmiş yanıt yerel kaydı düşürmez
    // Sunucu yetişti: yerel kayıtlar düşer.
    expect(mergeEvents([{ id: 7 }, { id: 11 }], local, 3000).map((e) => e.id)).toEqual([7, 11]);
    expect(local.created.size).toBe(0);
    expect(local.removed.size).toBe(0);
  });
});

describe("useReplays (jsdom)", () => {
  function studioMock() {
    const calls = { save: [], upload: [], update: [] };
    let n = 0;
    window.elitlig = {
      studio: {
        listReplays: async () => [],
        saveReplay: async (o) => {
          calls.save.push({ ...o, at: Date.now() });
          n += 1;
          return { ok: true, replay: { id: `r2026110712000${n}-abcdef`, createdAt: new Date().toISOString(), kind: o.kind, durationMs: 19000, angles: [{ angle: "program", url: "x://p.mp4", durationMs: 19000, width: 1920, height: 1080 }, { angle: "cam-1", url: "x://c.mp4", durationMs: 18000 }] } };
        },
        updateReplay: async (id, patch) => { calls.update.push([id, patch]); return { ok: true }; },
        uploadClip: async (p) => { calls.upload.push({ ...p, at: Date.now() }); return { ok: true, data: { url: "https://x" } }; },
      },
    };
    return calls;
  }

  it("butondan sonrası: kayıt 4 sn sonra, pencere 15 + 4 sn; listede geri sayım", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "setInterval", "Date"] });
    const calls = studioMock();
    const { out, unmount } = mountHook(() => useReplays(7, { postSeconds: 4, uploadDelaySec: 60 }));
    let key;
    act(() => { key = out.current.capture({ kind: "goal", angles: ["program"], seconds: 15, meta: { minute: 12 } }); });
    expect(key).toBeTruthy();
    expect(out.current.pending[0].status).toBe("waiting");
    expect(pendingText(out.current.pending[0], Date.now())).toBe("Butondan sonrası kaydediliyor · 0:04");
    await tick(3000);
    expect(calls.save.length).toBe(0);
    await tick(1500);
    expect(calls.save.length).toBe(1);
    expect(calls.save[0].seconds).toBe(19);
    expect(out.current.pending.length).toBe(0);
    expect(out.current.replays.length).toBe(1);
    unmount();
  });

  it("GERİLEME: akış iptali (eventId null) anahtarı tüketmez — sonra gelen olay bağlanır ve yüklenir", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "setInterval", "Date"] });
    const calls = studioMock();
    const { out, unmount } = mountHook(() => useReplays(7, { postSeconds: 0, uploadDelaySec: 0 }));
    let key;
    act(() => { key = out.current.capture({ kind: "goal", angles: ["program"], seconds: 15 }); });
    // GoalFlow kapanırken (kayıt sürerken) iptal, ardından kayıt sonucu bağlama:
    await act(async () => { await out.current.attach(key, { eventId: null }); });
    await act(async () => { await out.current.attach(key, { eventId: 501, scorer: "Can" }); });
    await tick(10);
    expect(calls.upload.length).toBe(1);
    expect(calls.upload[0]).toMatchObject({ matchId: 7, eventId: 501, angle: "program" });
    expect(calls.update.some(([, p]) => p.eventId === 501)).toBe(true);
    // Bağlıyı "yalnız yerel"e düşürmez; aynı olaya ikinci bağlama yok sayılır.
    await act(async () => { await out.current.attach(key, { eventId: null }); await out.current.attach(key, { eventId: 501 }); });
    await tick(10);
    expect(calls.upload.length).toBe(1);
    unmount();
  });

  it("gecikmeli yükleme: 60 sn bekler, yayına verilen açı bölümleri yüklemeye girer; Şimdi yükle / İptal", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "setInterval", "Date"] });
    const calls = studioMock();
    const { out, unmount } = mountHook(() => useReplays(7, { postSeconds: 0, uploadDelaySec: 60 }));
    let key;
    act(() => { key = out.current.capture({ kind: "goal", angles: ["program", "cam-1"], seconds: 15 }); });
    await act(async () => { await out.current.attach(key, { eventId: 9 }); });
    const id = out.current.replays[0].id;
    expect(out.current.uploadOf(id)).toMatchObject({ status: "scheduled" });
    await tick(20_000);
    expect(calls.upload.length).toBe(0);
    // Tekrar arayüzü yayına verdi: kamera 2–6 sn, sonra program.
    act(() => { expect(out.current.markAiredSelection(id, { angles: ["cam-1", "program"], segments: [{ angle: "cam-1", inSec: 2, outSec: 6 }, { angle: "program", inSec: 4, outSec: null }] })).toBe(true); });
    await tick(1000);
    expect(out.current.uploadOf(id).plan).toMatchObject({ mode: "angles", count: 2 });
    expect(calls.update.some(([rid, p]) => rid === id && p.selection?.aired)).toBe(true);
    await tick(40_000);
    expect(calls.upload.length).toBe(1);
    expect(calls.upload[0].segments).toEqual([{ angle: "cam-1", inSec: 2, outSec: 6 }, { angle: "program", inSec: 4, outSec: null }]);
    expect(calls.upload[0].at - calls.save[0].at).toBeGreaterThanOrEqual(59_000);

    // İkinci gol: İptal → yüklenmez; Şimdi yükle → hemen.
    let k2;
    act(() => { k2 = out.current.capture({ kind: "goal", angles: ["program"], seconds: 15 }); });
    await act(async () => { await out.current.attach(k2, { eventId: 10 }); });
    const id2 = out.current.replays[0].id;
    act(() => out.current.cancelUpload(id2));
    await tick(70_000);
    expect(calls.upload.length).toBe(1);
    expect(out.current.uploadOf(id2)).toMatchObject({ status: "cancelled" });
    act(() => out.current.uploadNow(id2));
    await tick(10);
    expect(calls.upload.length).toBe(2);
    expect(calls.upload[1].segments).toBeUndefined();
    unmount();
  });
});

describe("useLiveMatch (jsdom)", () => {
  it("GERİLEME: olaydan önce başlayan yoklama sonra dönünce yeni gol listeden / skordan kaybolmaz; eski skor yazılmaz", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "setInterval", "Date"] });
    let serverEvents = [{ id: 1, takim_id: 10, olay_kodu: "GOAL_RIGHT_FOOT", dakika: 3, devre: 1 }];
    const patches = [];
    let holdGet = null; // bir GET'i (eski liste) bekletmek için
    window.elitlig = {
      request: async (o) => {
        const p = o.path;
        if (p.endsWith("/olaylar") && (o.method || "GET") === "GET") {
          const snapshot = serverEvents.map((e) => ({ ...e }));
          if (holdGet) { const gate = holdGet; holdGet = null; await gate; }
          return { ok: true, data: snapshot };
        }
        if (p.endsWith("/olaylar") && o.method === "POST") {
          const ev = { id: 2, takim_id: 10, olay_kodu: o.body.olay_kodu, dakika: 5, devre: 1 };
          serverEvents = [...serverEvents, ev];
          return { ok: true, data: ev };
        }
        if (o.method === "PATCH") { patches.push(o.body); return { ok: true, data: {} }; }
        if (p.endsWith("/timer")) return { ok: true, data: { running: true, base_ms: 0, period: 1 } };
        if (p.endsWith("/kadro")) return { ok: true, data: { home: [], away: [] } };
        if (p.includes("/snapshot")) return { ok: true, data: {} };
        return { ok: true, data: { id: 7, home_team_id: 10, away_team_id: 20, mac_durumu: "canli", first_team_score: 1, second_team_score: 0 } };
      },
    };
    const { out, unmount } = mountHook(() => useLiveMatch(7, 1));
    await tick(50);
    expect(out.current.score).toEqual({ home: 1, away: 0 });
    // Yoklama başlar (eski liste alınır) ve takılır; bu sırada gol yazılır.
    let release;
    holdGet = new Promise((r) => { release = r; });
    await tick(6000); // usePoll(loadEvents, 6 sn) → bekletilen GET
    await act(async () => { await out.current.addEvent({ side: "home", code: "GOAL_RIGHT_FOOT", playerId: null }); });
    expect(out.current.score).toEqual({ home: 2, away: 0 });
    // Eski GET şimdi döner (yalnız 1 gol): eskiden gol listeden ve skordan kayboluyordu.
    await act(async () => { release(); await vi.advanceTimersByTimeAsync(10); });
    expect(out.current.events.map((e) => e.id)).toEqual([1, 2]);
    expect(out.current.score).toEqual({ home: 2, away: 0 });
    expect(patches.every((b) => b.first_team_score !== 1)).toBe(true);
    unmount();
  });
});
