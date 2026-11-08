// İşletim düğmeleri: LED içerik / görüntü modeli, maç / röportaj / özet / sahne / araç yardımcıları,
// makrolar, işletim ayarları, hazır paneller ve onları birleştiren tam ekran düzenler.
import { describe, expect, it } from "vitest";
import { DEFAULT_LED_FX, LED_CONTENT_KEYS, countdownText, ledFxRect, ledPresetPatch, ledPresetSnapshot, normalizeLedFx, patchLedFx, sponsorIndex, tickerX } from "../src/views/studio/led/ledFx";
import { ledState } from "../src/views/studio/led/useLed";
import {
  bumpCounter, cardsSummary, isKeeper, lineupBody, nextInRotation, periodInfo, pipLayers, possessionPct, possessionSwitch, pushRecent, secondYellow, setCaptain, setKeeper,
  shortCode, stoppageLabel, swElapsed, swLap, swText, swToggle, swapLineup, toggleHighlight,
} from "../src/views/studio/shortcuts/opsLogic";
import { DEFAULT_MACROS, MACRO_STEPS, describeStep, normalizeMacro, normalizeMacros, normalizeStep, runMacro } from "../src/views/studio/shortcuts/macros";
import { DEFAULT_OPS, cardLengthOf, normalizeOps, patchOps } from "../src/views/studio/settings/opsDefaults";
import { normalizeSettings } from "../src/views/studio/settings/settings";
import { BOARD_TEMPLATES, boardFromTemplate, templateOf } from "../src/views/studio/layout/boardTemplates";
import { LAYOUT_PRESETS, componentOf, specIds, specToDock } from "../src/views/studio/layout/layoutModel";
import { RAIL_WIDGETS, widgetOf } from "../src/views/studio/shortcuts/railModel";
import { WIDGET_IMPL } from "../src/views/studio/shortcuts/widgets";
import { buildHighlightPlan } from "../src/lib/studio/highlights";

describe("LED içerik ve görüntü", () => {
  it("normalize: sınırlar, bilinmeyen içerik, iç içe kayan yazı yaması", () => {
    const fx = normalizeLedFx({ content: "yok", brightness: 400, scale: 10, offX: -90, ticker: { speed: 9999 } });
    expect(fx.content).toBe("scene");
    expect([fx.brightness, fx.scale, fx.offX]).toEqual([100, 50, -50]);
    expect(fx.ticker.speed).toBe(400);
    const p = patchLedFx(fx, { ticker: { on: true } });
    expect(p.ticker).toMatchObject({ on: true, speed: 400 });
    expect(LED_CONTENT_KEYS).toEqual(expect.arrayContaining(["scene", "mirror", "scoreboard", "sponsor", "text", "clock", "countdown"]));
    expect(normalizeLedFx(null)).toEqual(normalizeLedFx(DEFAULT_LED_FX));
  });
  it("kutu, kayan yazı, geri sayım, sponsor sırası", () => {
    expect(ledFxRect(1000, 500, { scale: 50, offX: 10, offY: 0 })).toEqual({ x: 350, y: 125, w: 500, h: 250 });
    expect(tickerX(0, 100, 1000, 100)).toBe(1000);
    expect(tickerX(1000, 100, 1000, 100)).toBe(900);
    expect(countdownText(65_000, 0)).toBe("01:05");
    expect(countdownText(null)).toBe("--:--");
    expect(sponsorIndex(17_000, 3, 8)).toBe(2);
    expect(sponsorIndex(1, 0, 8)).toBe(-1);
  });
  it("ön ayar: içerik + yönlendirme; dondur / karart sıfırlanır", () => {
    const snap = ledPresetSnapshot({ route: "scene", sceneId: "s1", fx: { content: "text", text: "GOL", brightness: 70, freeze: true } }, { name: "A" });
    const patch = ledPresetPatch({ fx: { black: true } }, snap);
    expect(patch).toMatchObject({ route: "scene", sceneId: "s1", web: false });
    expect(patch.fx).toMatchObject({ content: "text", text: "GOL", brightness: 70, freeze: false, black: false });
  });
  it("LED durumu: ayna karesi yalnız aynada ve donuk değilken", () => {
    const config = { scenes: [{ id: "a", name: "A", layers: [] }], sources: [] };
    expect(ledState({ config, sceneId: "a", fx: { content: "mirror" }, frame: "data:x" }).frame).toBe("data:x");
    expect(ledState({ config, sceneId: "a", fx: { content: "mirror", freeze: true }, frame: "data:x" }).frame).toBe(null);
    expect(ledState({ config, sceneId: "a", fx: { content: "scene" }, frame: "data:x" }).frame).toBe(null);
    expect(ledState({ config, sceneId: "a" }).fx.content).toBe("scene");
  });
});

describe("maç yönetimi yardımcıları", () => {
  const lineup = { home: [{ playerId: 1, role: "starter", number: 1, position: "Kaleci" }, { playerId: 2, role: "starter", captain: true, number: 9 }, { playerId: 3, role: "bench", number: 12 }], away: [{ playerId: 7, role: "starter", isGuest: true, playerName: "Misafir" }] };
  it("kadro yükü: yer değiştir, kaptan tek, kaleci tek", () => {
    const s = swapLineup(lineup, "home", 2, 3);
    expect(s.home.find((r) => r.playerId === 2)).toMatchObject({ role: "bench", captain: false });
    expect(s.home.find((r) => r.playerId === 3).role).toBe("starter");
    expect(s.away[0]).toMatchObject({ isGuest: true, guestName: "Misafir" });
    const c = setCaptain(lineup, "home", 3);
    expect(c.home.filter((r) => r.captain).map((r) => r.playerId)).toEqual([3]);
    const k = setKeeper(lineup, "home", 3);
    expect(k.home.filter(isKeeper).map((r) => r.playerId)).toEqual([3]);
    expect(lineupBody({ home: [{ playerId: 0 }] }).home).toEqual([]);
  });
  it("devre süresi, uzatma gösterimi", () => {
    expect(periodInfo({ clockMs: 20 * 60_000, period: 1, halfMin: 25 })).toMatchObject({ leftMs: 5 * 60_000, over: false });
    expect(periodInfo({ clockMs: 62 * 60_000, period: 2, halfMin: 30 })).toMatchObject({ over: true, overMs: 2 * 60_000 });
    expect(stoppageLabel({ clockMs: 47 * 60_000 + 1, period: 1, halfMin: 45 })).toBe("45+3");
    expect(stoppageLabel({ clockMs: 40 * 60_000, period: 1, halfMin: 45, added: 4 })).toBe("45+4");
    expect(stoppageLabel({ clockMs: 12 * 60_000, period: 1, halfMin: 45 })).toBe("12'");
  });
  it("kart özeti ve 2. sarı", () => {
    const ev = (t, c, o, dk) => ({ takim_id: t, olay_kodu: c, oyuncu_id: o, dakika: dk });
    const s = cardsSummary([ev(3, "YELLOW_CARD", 5, 10), ev(3, "YELLOW_CARD", 5, 40), ev(8, "RED_CARD", 9, 30), ev(3, "GOAL_HEADER", 5, 3)], { homeTeamId: 3, awayTeamId: 8, nameOf: (id) => `P${id}` });
    expect([s.home.yellow, s.home.red, s.away.red]).toEqual([2, 0, 1]);
    expect(secondYellow(s).map((p) => p.name)).toEqual(["P5"]);
  });
  it("topla oynama ve sayaçlar", () => {
    let p = possessionSwitch(null, "home", 0);
    p = possessionSwitch(p, "away", 6000);
    expect(possessionPct(p, 10_000)).toMatchObject({ home: 60, away: 40 });
    expect(possessionPct(null)).toMatchObject({ home: 50, away: 50 });
    expect(bumpCounter({}, "home", "shots", -1).home.shots).toBe(0);
    expect(bumpCounter(bumpCounter({}, "away", "corners"), "away", "corners").away.corners).toBe(2);
    expect(shortCode("gençlik spor!", 3)).toBe("GEN");
  });
});

describe("röportaj, özet, sahne, araçlar", () => {
  it("son konuklar eşsiz, yeni başa, sınırlı", () => {
    let r = pushRecent([], { name: "Ali", role: "TD" });
    r = pushRecent(r, { name: "Veli" });
    r = pushRecent(r, { name: "ali", role: "td" }, 2);
    expect(r.map((p) => p.name)).toEqual(["ali", "Veli"]);
  });
  it("özet seçimi aç / kapat; kartsız plan", () => {
    const rp = { id: "r1", angles: [{ angle: "program", url: "u" }], durationMs: 2000 };
    const a = toggleHighlight([], rp);
    expect(a).toEqual([{ replayId: "r1", angles: ["program"] }]);
    expect(toggleHighlight(a, rp)).toEqual([]);
    const plan = buildHighlightPlan({ items: a, replays: [rp], introMs: 0, outroMs: 0 });
    expect(plan.segments.map((s) => s.type)).toEqual(["clip"]);
    expect(cardLengthOf("short").introMs).toBe(2500);
  });
  it("otomatik dönüş sırası, PiP katmanları", () => {
    expect(nextInRotation(["a", "b", "c"], "c")).toBe("a");
    expect(nextInRotation(["a", "b"], "x")).toBe("a");
    expect(nextInRotation([], "a")).toBe(null);
    const sc = { layers: [{ id: "base", w: 1, h: 1, x: 0, y: 0 }, { id: "pip", w: 0.3, h: 0.3, x: 0.6, y: 0.6 }, { id: "full2", w: 1, h: 1, x: 0, y: 0 }] };
    expect(pipLayers(sc).map((l) => l.id)).toEqual(["pip"]);
  });
  it("kronometre", () => {
    let sw = swToggle(null, 1000);
    expect(swElapsed(sw, 3500)).toBe(2500);
    sw = swLap(sw, 4000);
    sw = swToggle(sw, 5000);
    expect([sw.running, sw.acc, sw.laps]).toEqual([false, 4000, [3000]]);
    expect(swText(65_300)).toBe("01:05.3");
    expect(swText(3_725_000)).toBe("1:02:05");
  });
});

describe("makrolar", () => {
  it("normalize: bilinmeyen adım atılır, bekleme varsayılanı, hazır makrolar", () => {
    const m = normalizeMacro({ name: "X", steps: [{ type: "nope" }, { type: "wait" }, { type: "subtitle", text: "Devre", secs: "5" }] });
    expect(m.steps).toEqual([{ type: "wait", ms: 1000 }, { type: "subtitle", text: "Devre", secs: 5 }]);
    expect(normalizeMacros(null).map((x) => x.name)).toEqual(DEFAULT_MACROS.map((x) => x.name));
    expect(normalizeMacros({ items: [{ id: "a" }, { id: "a" }] })).toHaveLength(1);
    for (const s of MACRO_STEPS) expect(normalizeStep({ type: s.type }).type).toBe(s.type);
    expect(describeStep({ type: "ready", key: "break", air: true })).toContain("Devre arası");
  });
  it("çalıştır: adımlar sırayla, yapılamayan atlanır", async () => {
    const log = [];
    const ctx = {
      ready: { go: (k, air) => log.push(`ready:${k}:${air}`) },
      g: { addLine: async () => true, setSubtitleOnAir: (v) => log.push(`sub:${v}`) },
      mixer: { music: { url: null } },
      led: { setFx: (p) => log.push(`led:${p.content}`) },
      live: { onAir: false },
    };
    const m = normalizeMacro({ id: "t", steps: [{ type: "ready", key: "break", air: true }, { type: "subtitle", text: "Ara" }, { type: "musicPlay" }, { type: "ledContent", content: "clock" }, { type: "chapter", label: "x" }] });
    const r = await runMacro(m, ctx, { delayMs: 0 });
    expect(log).toEqual(["ready:break:true", "sub:true", "led:clock"]);
    expect(r).toEqual({ ok: false, skipped: [2, 4] });
  });
});

describe("işletim ayarları", () => {
  it("normalize ve yama; ayarlarda ops", () => {
    const o = normalizeOps({ led: { brightness: 5 }, mac: { halfMin: 99, statKeys: ["shots", "x", "shots"] }, hl: { intro: "?" } });
    expect([o.led.brightness, o.mac.halfMin, o.mac.statKeys, o.hl.intro]).toEqual([10, 60, ["shots"], "long"]);
    expect(patchOps(o, "iv", { targetMin: 5 }).iv.targetMin).toBe(5);
    expect(normalizeSettings({}).ops).toEqual(normalizeOps(DEFAULT_OPS));
  });
});

describe("katalog, hazır paneller ve düzenler", () => {
  const NEW = ["led", "ozet", "mac", "genel"];
  it("yeni gruplarda yeterince düğme, her biri seçenek panelli", () => {
    for (const g of NEW) expect(RAIL_WIDGETS.filter((w) => w.group === g).length, g).toBeGreaterThanOrEqual(7);
    const ops = RAIL_WIDGETS.slice(RAIL_WIDGETS.findIndex((w) => w.type === "ledPower"));
    expect(ops.length).toBeGreaterThanOrEqual(50);
    for (const w of ops) {
      expect(WIDGET_IMPL[w.type]?.popover, w.type).toBeTruthy();
      expect(Array.isArray(WIDGET_IMPL[w.type].options), w.type).toBe(true);
    }
  });
  it("şablonların tüm parçaları bilinen bileşenler; panoya dönüşür", () => {
    expect(BOARD_TEMPLATES.length).toBeGreaterThanOrEqual(17);
    for (const t of BOARD_TEMPLATES) {
      for (const it of t.items) {
        expect(componentOf(it.t), `${t.key} ${it.t}`).toBeTruthy();
        if (it.t.startsWith("w:")) expect(widgetOf(it.t.slice(2)), it.t).toBeTruthy();
        expect(it.x + it.w, `${t.key} ${it.t}`).toBeLessThanOrEqual(t.cols);
      }
      expect(boardFromTemplate(t).items).toHaveLength(t.items.length);
      // parçalar üst üste binmez
      for (let i = 0; i < t.items.length; i += 1) for (let j = i + 1; j < t.items.length; j += 1) {
        const a = t.items[i], b = t.items[j];
        const hit = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        expect(hit, `${t.key}: ${a.t} × ${b.t}`).toBe(false);
      }
    }
    for (const k of ["reji-compact", "reji-mirror", "reji-grid", "reji-log", "reji-touch", "tekrar-operator", "tekrar-compact", "tekrar-evs", "sahne-grid", "sahne-list", "sahne-strip", "sahne-tally", "sahne-ab"]) expect(templateOf(k), k).toBeTruthy();
  });
  it("tam ekran düzenler kurdukları panoları kullanır ve dockview'a dönüşür", () => {
    const combos = LAYOUT_PRESETS.filter((p) => p.boards);
    expect(combos.length).toBeGreaterThanOrEqual(8);
    for (const p of combos) {
      const ids = specIds(p.spec).filter((id) => id.startsWith("board~tpl-")).map((id) => id.slice("board~tpl-".length));
      expect(ids.every((k) => p.boards.includes(k)), p.key).toBe(true);
      for (const k of p.boards) expect(templateOf(k), `${p.key} ${k}`).toBeTruthy();
      expect(specToDock(p.spec), p.key).toBeTruthy();
    }
  });
});
