// Makro motoru (adımlar, beklemeler, koşullar, bloklar, hatalar) ve müzik çalar modeli (geçiş, başlangıç / bitiş).
import { beforeEach, describe, expect, it } from "vitest";
import {
  MACRO_STEPS, MACRO_TEMPLATES, __resetMacros, buildTree, evalCondition, exportMacros, fillTemplate, fireMacro, getMacroVars, importMacros,
  indentLevels, macroForCombo, macroFromTemplate, macroToggled, normalizeMacro, normalizeStep, runMacro, stopMacro,
} from "../src/views/studio/shortcuts/macros";
import {
  addMusicTrack, airSupport, crossfadeGains, deckVolume, fadeState, moveMusicTrack, nextIndex, normalizeMusic, normalizeMusicTrack, trackPlan, trackProgress, trackToAir,
} from "../src/views/studio/music/musicModel";

const mk = (steps, extra = {}) => normalizeMacro({ id: extra.id || `t${Math.random().toString(36).slice(2)}`, name: "T", steps, ...extra });
const run = (m, ctx, o = {}) => runMacro(m, ctx, { delayMs: 0, ...o });

beforeEach(() => { __resetMacros(); });

describe("makro motoru · adımlar", () => {
  it("adımlar sırayla çalışır, yapılamayan atlanır ve günlüğe yazılır", async () => {
    const log = [];
    const ctx = {
      sceneTile: { onPreview: (id) => log.push(`pvw:${id}`) },
      transition: { canTake: true, take: () => log.push("take"), ms: 0 },
      mic: { muted: false, toggle: () => log.push("mic") },
      led: { setFx: (p) => log.push(`led:${p.content}`) },
    };
    const m = mk([{ type: "scenePreview", sceneId: "s1" }, { type: "take" }, { type: "micMute" }, { type: "chapter", label: "x" }, { type: "ledContent", content: "clock" }]);
    const r = await run(m, ctx);
    expect(log).toEqual(["pvw:s1", "take", "mic", "led:clock"]);
    expect(r.ok).toBe(false);
    expect(r.skipped).toEqual([3]);
    expect(r.log.map((e) => e.ok)).toEqual([true, true, true, false, true]);
  });
  it("devre dışı adım çalışmaz ve 'yapılamadı' sayılmaz", async () => {
    const log = [];
    const m = mk([{ type: "note", text: "a" }, { type: "note", text: "b", off: true }, { type: "note", text: "c" }]);
    const r = await run(m, { toast: (t) => log.push(t) });
    expect(log).toEqual(["a", "c"]);
    expect(r.ok).toBe(true);
    expect(r.log[1]).toMatchObject({ ok: null, msg: "devre dışı" });
  });
  it("adım hata fırlatırsa makro sürer, hata iletisi günlükte", async () => {
    const log = [];
    const ctx = { live: { onAir: true }, chapter: { addLabel: () => { throw new Error("patladı"); } }, toast: (t) => log.push(t) };
    const r = await run(mk([{ type: "chapter", label: "x" }, { type: "note", text: "sonra" }]), ctx);
    expect(r.skipped).toEqual([0]);
    expect(r.log[0].msg).toBe("patladı");
    expect(log).toEqual(["sonra"]);
  });
  it("her adım güncel bağlamı okur (ctx.getCtx)", async () => {
    const state = { canTake: false };
    let taken = 0;
    const live = () => ({ transition: { canTake: state.canTake, take: () => { taken += 1; } } });
    const ctx = { getCtx: live };
    const m = mk([{ type: "setVar", name: "x", value: "1" }, { type: "take" }]);
    state.canTake = true; // makro başladıktan sonra değişen durum
    const r = await run(m, ctx);
    expect(r.ok).toBe(true);
    expect(taken).toBe(1);
  });
  it("katalogdaki her tür normalleşir; şablonlar ≥ 10 ve blok hatası yok", () => {
    for (const s of MACRO_STEPS) expect(normalizeStep({ type: s.type }).type).toBe(s.type);
    expect(MACRO_TEMPLATES.length).toBeGreaterThanOrEqual(10);
    for (const t of MACRO_TEMPLATES) {
      const m = macroFromTemplate(t);
      expect(m.steps.length).toBeGreaterThan(0);
      expect(buildTree(m.steps).errors).toEqual([]);
      expect(buildTree(m.offSteps).errors).toEqual([]);
    }
    const names = MACRO_TEMPLATES.map((t) => t.name);
    for (const n of ["Gol rutini", "Devre arası", "Maç sonu", "VAR akışı", "Sponsor arası", "Röportaj başlat", "Röportaj bitir"]) expect(names).toContain(n);
  });
});

describe("makro motoru · beklemeler", () => {
  it("wait gerçekten bekler", async () => {
    const t0 = Date.now();
    const r = await run(mk([{ type: "wait", ms: 60 }]), {});
    expect(r.ok).toBe(true);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(55);
  });
  it("waitUntil koşul olunca sürer; zaman aşımında adım yapılamadı", async () => {
    const ctx = { replay: { playing: true } };
    setTimeout(() => { ctx.replay.playing = false; }, 120);
    const t0 = Date.now();
    const r1 = await run(mk([{ type: "waitUntil", cond: "replayEnded", timeoutMs: 2000 }]), ctx);
    expect(r1.ok).toBe(true);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(100);
    const r2 = await run(mk([{ type: "waitUntil", cond: "musicPlaying", timeoutMs: 150 }]), { music: { playing: false } });
    expect(r2.skipped).toEqual([0]);
    expect(r2.log[0].msg).toBe("zaman aşımı");
  });
  it("stopMacro bekleyen makroyu durdurur", async () => {
    const log = [];
    const m = mk([{ type: "wait", ms: 5000 }, { type: "note", text: "x" }]);
    const p = run(m, { toast: (t) => log.push(t) });
    setTimeout(() => stopMacro(m.id), 50);
    const r = await p;
    expect(r.aborted).toBe(true);
    expect(log).toEqual([]);
  });
});

describe("makro motoru · koşullar, bloklar, değişkenler", () => {
  it("EĞER / DEĞİLSE / SON ve TEKRARLA", async () => {
    const out = [];
    const ctx = { live: { onAir: false }, toast: (t) => out.push(t) };
    const m = mk([
      { type: "if", cond: "onAir" }, { type: "note", text: "yayında" }, { type: "else" }, { type: "note", text: "kapalı" }, { type: "end" },
      { type: "repeat", count: 3 }, { type: "setVar", name: "n", op: "add", value: "2" }, { type: "end" },
      { type: "if", cond: "varEq", arg: "n", value: "6" }, { type: "note", text: "n={n}" }, { type: "end" },
      { type: "if", cond: "onAir", not: true }, { type: "note", text: "değil" }, { type: "end" },
    ]);
    expect(indentLevels(m.steps)).toEqual([0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]);
    const r = await run(m, ctx);
    expect(r.ok).toBe(true);
    expect(out).toEqual(["kapalı", "n=6", "değil"]);
    expect(getMacroVars().n).toBe(6);
  });
  it("blok hataları çalıştırmadan bildirilir", async () => {
    const out = [];
    expect(buildTree([{ type: "if", cond: "onAir" }]).errors[0].msg).toMatch(/kapanmamış/);
    expect(buildTree([{ type: "end" }]).errors[0].msg).toMatch(/SON/);
    expect(buildTree([{ type: "else" }]).errors[0].msg).toMatch(/DEĞİLSE/);
    const r = await run(mk([{ type: "note", text: "x" }, { type: "repeat", count: 2 }]), { toast: (t) => out.push(t) });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/TEKRARLA/);
    expect(out).toEqual([]);
  });
  it("koşullar: skor, sahne, mikrofon", () => {
    const ctx = { score: { home: 2, away: 1 }, sceneTile: { programId: "sc1" }, mic: { muted: true } };
    expect(evalCondition({ cond: "homeLeads" }, ctx)).toBe(true);
    expect(evalCondition({ cond: "draw" }, ctx)).toBe(false);
    expect(evalCondition({ cond: "sceneOnAir", arg: "sc1" }, ctx)).toBe(true);
    expect(evalCondition({ cond: "micMuted", not: true }, ctx)).toBe(false);
    expect(evalCondition({ cond: "varGt", arg: "k", value: "3" }, ctx, { vars: { k: 5 } })).toBe(true);
  });
  it("şablon metni: takım adları, skor, değişken ve seçilen adı", () => {
    const ctx = { event: { homeName: "Ankara", awayName: "Karadeniz", minute: 33 }, score: { home: 2, away: 1 } };
    expect(fillTemplate("GOL! {ev} {skor} {dep} · {dakika} · {oyuncu}", ctx, { oyuncu: "101", "oyuncu.ad": "Can Aydın" })).toBe("GOL! Ankara 2-1 Karadeniz · 33' · Can Aydın");
    expect(fillTemplate("{takım}", ctx, { takım: "home", "takım.ad": "Ankara" }, { label: false })).toBe("home");
  });
  it("soru: takım + oyuncu seçimi değişkene yazılır ve olay kaydedilir", async () => {
    const asked = [];
    const submitted = [];
    const ctx = {
      event: { homeName: "Ankara", awayName: "Karadeniz", squads: { home: [{ id: "101", name: "Can Aydın", number: 10 }], away: [] }, submit: async (f) => { submitted.push(f); return { id: 1 }; } },
      macroPrompt: async (spec) => { asked.push(spec.title); return spec.choices[0]; },
      g: { addLine: async () => true, setSubtitleOnAir: () => {} },
    };
    const m = mk([{ type: "prompt", ask: "team", title: "Hangi takım?", name: "takım" }, { type: "addEvent", side: "var", code: "YELLOW_CARD", player: "prompt" }, { type: "subtitle", text: "Sarı kart · {oyuncu}" }]);
    const r = await run(m, ctx);
    expect(r.ok).toBe(true);
    expect(asked).toEqual(["Hangi takım?", "Hangi oyuncu?"]);
    expect(submitted).toEqual([{ side: "home", code: "YELLOW_CARD", playerId: "101" }]);
  });
  it("onay 'hayır' ve soruda vazgeçme makroyu bitirir", async () => {
    const out = [];
    const r1 = await run(mk([{ type: "confirm", text: "Emin misin?" }, { type: "note", text: "x" }]), { ask: async () => false, toast: (t) => out.push(t) });
    expect(r1.cancelled).toBe(true);
    const r2 = await run(mk([{ type: "prompt", ask: "choice", choices: "a,b" }, { type: "note", text: "y" }]), { macroPrompt: async () => null, toast: (t) => out.push(t) });
    expect(r2.cancelled).toBe(true);
    expect(out).toEqual([]);
  });
  it("alt makro, makroyu bitir ve adım adım deneme", async () => {
    const out = [];
    const ctx = { toast: (t) => out.push(t) };
    const sub = mk([{ type: "note", text: "alt" }, { type: "stopMacro" }, { type: "note", text: "görünmez" }], { id: "sub" });
    const main = mk([{ type: "callMacro", macroId: "sub" }, { type: "note", text: "üst" }], { id: "main" });
    const r = await run(main, ctx, { macros: [sub, main] });
    expect(r.ok).toBe(true);
    expect(out).toEqual(["alt", "üst"]);
    const seen = [];
    const r2 = await run(mk([{ type: "note", text: "1" }, { type: "note", text: "2" }]), ctx, { stepper: async (i) => { seen.push(i); return i === 0; } });
    expect(seen).toEqual([0, 1]);
    expect(r2.aborted).toBe(true);
  });
  it("aç / kapa makrosu sırayla açılış ve kapanış adımlarını çalıştırır", async () => {
    const out = [];
    const ctx = { toast: (t) => out.push(t) };
    const m = mk([{ type: "note", text: "aç" }], { mode: "toggle", offSteps: [{ type: "note", text: "kapa" }] });
    await fireMacro(m, ctx, { delayMs: 0 });
    expect(macroToggled(m.id)).toBe(true);
    await fireMacro(m, ctx, { delayMs: 0 });
    expect(macroToggled(m.id)).toBe(false);
    expect(out).toEqual(["aç", "kapa"]);
  });
  it("müzik adımları: parça başlangıcından, geçiş, kısarak durdur", async () => {
    const calls = [];
    const music = { tracks: [{ id: "a" }, { id: "b" }], playing: true, volume: 50, play: async (id, o) => { calls.push(["play", id, o]); return true; }, crossfade: async (t, ms) => { calls.push(["xf", t, ms]); return true; }, stop: (o) => calls.push(["stop", o]), setVolume: (v) => { music.volume = v; } };
    const r = await run(mk([{ type: "musicTrack", trackId: "b", from: "1:05" }, { type: "musicCrossfade", ms: 4000 }, { type: "musicFadeOut", ms: 1500 }, { type: "musicVolume", level: 20, ms: 100 }]), { music });
    expect(r.ok).toBe(true);
    expect(calls).toEqual([["play", "b", { fromSec: 65 }], ["xf", null, 4000], ["stop", { fadeMs: 1500 }]]);
    expect(music.volume).toBe(20);
  });
});

describe("makro deposu yardımcıları", () => {
  it("kısayol, içe / dışa aktarım", () => {
    const a = normalizeMacro({ id: "a", name: "A", hotkey: "ctrl+shift+1", steps: [{ type: "take" }] });
    expect(a.hotkey).toBe("Ctrl+Shift+1");
    expect(normalizeMacro({ id: "b", hotkey: "x" }).hotkey).toBe("");
    expect(macroForCombo([a], "Ctrl+Shift+1")?.id).toBe("a");
    const json = exportMacros([a]);
    const r = importMacros(json, [a]);
    expect(r.added).toBe(1);
    expect(r.list).toHaveLength(2);
    expect(r.list[1].id).not.toBe("a");
    expect(importMacros("{bozuk", [a]).error).toMatch(/JSON/);
  });
});

describe("müzik çalar modeli", () => {
  it("geçiş eğrileri: uçlar ve eşit güç", () => {
    for (const c of ["equal", "linear", "scurve", "exp"]) {
      expect(crossfadeGains(0, c)).toMatchObject({ out: 1, in: 0 });
      const e = crossfadeGains(1, c);
      expect(e.out).toBeCloseTo(0, 5);
      expect(e.in).toBeCloseTo(1, 5);
    }
    const h = crossfadeGains(0.5, "equal");
    expect(h.out ** 2 + h.in ** 2).toBeCloseTo(1, 5);
    const l = crossfadeGains(0.3, "linear");
    expect(l.out + l.in).toBeCloseTo(1, 5);
  });
  it("çalma planı: başlangıç / bitiş, süreyle sınır, geçiş zamanı", () => {
    const t = normalizeMusicTrack({ url: "https://youtu.be/dQw4w9WgXcQ?t=1m5s", end: "2:05" });
    expect([t.videoId, t.start, t.end]).toEqual(["dQw4w9WgXcQ", 65, 125]);
    const p = trackPlan(t, 300, 4000);
    expect(p).toMatchObject({ startSec: 65, endSec: 125, lengthSec: 60, xfadeSec: 4, xfadeAtSec: 121 });
    expect(trackPlan({ start: 10 }, 100, 3000)).toMatchObject({ endSec: 100, lengthSec: 90, xfadeAtSec: 97 });
    expect(trackPlan({ start: 0, end: 500 }, 200, 0)).toMatchObject({ endSec: 200 });
    expect(trackPlan({ start: 0, end: 4 }, null, 10_000).xfadeSec).toBe(2); // uzunluğun yarısını geçmez
    expect(trackPlan({ start: 0 }, null, 3000)).toMatchObject({ endSec: null, xfadeAtSec: null });
    expect(normalizeMusicTrack({ url: "dQw4w9WgXcQ", start: 30, end: 20 }).end).toBe(null);
  });
  it("ilerleme: geçiş anı ve bitiş", () => {
    const p = trackPlan({ start: 65, end: 125 }, null, 4000);
    expect(trackProgress(p, 95)).toMatchObject({ elapsedSec: 30, ratio: 0.5, remainingSec: 30, xfadeDue: false, ended: false });
    expect(trackProgress(p, 121).xfadeDue).toBe(true);
    expect(trackProgress(p, 125).ended).toBe(true);
    expect(trackProgress(trackPlan({ start: 0 }, null), 12)).toMatchObject({ ratio: null, remainingSec: null });
  });
  it("geçiş zamanlaması (fadeState)", () => {
    expect(fadeState(1000, 1000, 2000, "linear")).toMatchObject({ t: 0, out: 1, in: 0, done: false });
    const mid = fadeState(1000, 2000, 2000, "linear");
    expect([mid.t, mid.out, mid.in]).toEqual([0.5, 0.5, 0.5]);
    expect(fadeState(1000, 3500, 2000).done).toBe(true);
    expect(fadeState(0, 0, 0).done).toBe(true); // 0 ms: kesme
  });
  it("sıradaki parça: döngüler, karışık, önceki", () => {
    const c = normalizeMusic({ tracks: ["dQw4w9WgXcQ", "aaaaaaaaaaa", "bbbbbbbbbbb"].map((u) => ({ url: u })) });
    expect(nextIndex(c, 0, 1)).toBe(1);
    expect(nextIndex(c, 2, 1)).toBe(0);
    expect(nextIndex(c, 0, -1)).toBe(2);
    expect(nextIndex({ ...c, repeat: "off" }, 2, 1, { auto: true })).toBe(-1);
    expect(nextIndex({ ...c, repeat: "one" }, 1, 1, { auto: true })).toBe(1);
    for (const r of [0, 0.4, 0.99]) expect(nextIndex({ ...c, shuffle: true }, 1, 1, { rand: () => r })).not.toBe(1);
    expect(nextIndex(c, null, 1)).toBe(0);
    expect(moveMusicTrack(c, c.tracks[2].id, 0).tracks[0].id).toBe(c.tracks[2].id);
  });
  it("ses düzeyi ve yayına verme", () => {
    expect(deckVolume(80, 50, 0.5)).toBe(20);
    expect(deckVolume(80, 100, 1, 0)).toBe(0);
    const yt = normalizeMusicTrack({ url: "dQw4w9WgXcQ" });
    const file = normalizeMusicTrack({ kind: "file", fileUrl: "elitlig-studio://media/x/a.mp3", name: "Marş.mp3" });
    expect(file.title).toBe("Marş");
    expect(trackToAir({ toAir: false }, yt)).toBe(false);
    expect(trackToAir({ toAir: false }, { ...yt, air: "on" })).toBe(true);
    expect(trackToAir({ toAir: true }, { ...yt, air: "off" })).toBe(false);
    expect(airSupport(file, null).ok).toBe(true);
    expect(airSupport(yt, null)).toMatchObject({ ok: false });
    expect(airSupport(yt, { frameAudio: true, loopback: false }, "loopback").how).toBe("frame");
    expect(airSupport(yt, { frameAudio: true, loopback: true }, "loopback").how).toBe("loopback");
    expect(addMusicTrack(normalizeMusic(null), "geçersiz").ok).toBe(false);
    expect(normalizeMusic({ crossfadeMs: 99_999, curve: "?" })).toMatchObject({ crossfadeMs: 10_000, curve: "equal", toAir: false });
  });
});
