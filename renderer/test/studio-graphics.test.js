import {
  DEFAULT_BRANDING, SAMPLE_CCL_CUP, brandColorMap, mergePreset, normalizeBranding, normalizeExtras, normalizePresetList, presetBody,
  rgbToHsl, parseHex, resolveBranding, resolvePalette, sameBranding, serverBrandingBody, validatePresetName,
} from "../src/lib/studio/graphics/branding";
import { SCOREBOARD_VARIANTS, isFullPanel, isWebVariant, normalizeLedMode, normalizeVariant, usesBottom } from "../src/lib/studio/graphics/variants";
import { TICKER_SPEED_PX, buildTickerBlocks, rotationPhase, tickerDuration, tickerOffset, tickerRowLayout } from "../src/lib/studio/graphics/ticker";
import { buildGraphicsSnapshot, formationOf, interviewStatusText, lineGroup, lineupRows, snapshotClockMs, snapshotImageUrls, timelineRows } from "../src/lib/studio/graphics/snapshot";
import { interviewLayout, normalizeInterviewStyle } from "../src/lib/studio/graphics/drawInterview";
import { lineupV2Slides, lineupV3Side, slideAt, summaryScroll } from "../src/lib/studio/graphics/drawPanels";
import { miniLayout } from "../src/lib/studio/graphics/drawBugs";
import { createLayerCache, createMeasure, enter, fitText, shortenName, wrapLines } from "../src/lib/studio/graphics/canvas";
import { drawGraphics } from "../src/lib/studio/graphics/draw";
import { OVERLAY_MODES } from "../src/lib/studio/manageBroadcast";

/* Sahte ölçü: px × harf × 0,5 (yazı tipi dizgesindeki px okunur). */
const pxOf = (font) => Number(String(font).match(/([\d.]+)px/)?.[1]) || 10;
const measure = (text, font, spacing = 0) => String(text ?? "").length * pxOf(font) * 0.5 + (spacing ? spacing * Math.max(0, String(text).length - 1) : 0);
const F = (px, w = 800) => `${w} ${px}px Test`;

/** Her çağrıyı yutan sahte 2D bağlam. */
function fakeCtx() {
  const calls = { fillText: 0, drawImage: 0 };
  const state = { font: "10px Test" };
  const handler = {
    get(target, prop) {
      if (prop === "measureText") return (t) => ({ width: String(t).length * pxOf(state.font) * 0.5 });
      if (prop === "createLinearGradient" || prop === "createRadialGradient") return () => ({ addColorStop() {} });
      if (prop === "fillText") return () => { calls.fillText += 1; };
      if (prop === "drawImage") return () => { calls.drawImage += 1; };
      if (prop === "calls") return calls;
      if (prop in state) return state[prop];
      return () => {};
    },
    set(target, prop, value) { state[prop] = value; return true; },
    has(target, prop) { return prop !== "letterSpacing"; },
  };
  return new Proxy({}, handler);
}

const now = 1_700_000_000_000;
const liveFixture = (over = {}) => ({
  match: { id: 9, first_team_name: "Ankara Gençlikspor", second_team_name: "Kartallar FK", league_name: "CCL Cup", season_name: "2026", match_field: "Saha 1", date: "2026-11-05", match_time: "21:00:00" },
  status: "canli", running: true, period: 2,
  timer: { base_ms: 600_000, base_at: new Date(now - 5000).toISOString(), running: true },
  homeTeamId: 10, awayTeamId: 20, homeName: "Ankara Gençlikspor", awayName: "Kartallar FK",
  logos: { home: "https://x/h.png", away: "https://x/a.png" },
  score: { home: 2, away: 1 },
  events: [
    { id: 1, olay_kodu: "GOAL_PENALTY", takim_id: 10, oyuncu_id: 1, dakika: 5, devre: 1 },
    { id: 2, olay_kodu: "YELLOW_CARD", takim_id: 20, oyuncu_id: 3, dakika: 9, devre: 1 },
    { id: 3, olay_kodu: "SUBSTITUTION", takim_id: 10, oyuncu_cikan_id: 2, oyuncu_giren_id: 4, dakika: 30, devre: 2 },
    { id: 4, olay_kodu: "SAVE", takim_id: 20, oyuncu_id: 3, dakika: 31, devre: 2 },
  ],
  squads: {
    home: [{ id: "1", name: "Ali Veli Kaya", number: "9", position: "Forvet", role: "starter", image: "https://x/1.png" }, { id: "2", name: "Can", number: "1", position: "Kaleci", role: "starter" }, { id: "4", name: "Deniz", number: "14", position: "Defans", role: "bench" }],
    away: [{ id: "3", name: "Emre", number: "5", position: "Stoper", role: "starter" }],
  },
  nameOf: (id) => ({ 1: "Ali Veli Kaya", 2: "Can", 3: "Emre", 4: "Deniz" })[String(id)] || null,
  bannerEvent: { kind: "goal", label: "GOL", player: "ALİ" },
  ...over,
});

describe("yayın grafikleri · marka", () => {
  it("normalize: geçersiz alanlar atılır, varsayılan Elitlig", () => {
    const b = normalizeBranding({ logoUrl: "javascript:alert(1)", brandName: "  CCL\u0007 CUP  ", scoreboard: { theme: "yok", font: "comic", logoScale: 999 }, extras: { fontScale: 10, logoPosition: "x", textColor: "abc" } });
    expect(b.logoUrl).toBeNull();
    expect(b.brandName).toBe("CCL CUP");
    expect(b.scoreboard).toEqual({ theme: "elitlig", baseColor: null, accentColor: null, font: "archivo", logoScale: 200 });
    expect(b.extras).toMatchObject({ fontScale: 80, logoPosition: "medal", textColor: "#ffffff" });
    expect(normalizeBranding(null)).toEqual(normalizeBranding(DEFAULT_BRANDING));
  });
  it("kısmi yama: gönderilmeyen alan fallback'ten (sunucu kuralı)", () => {
    const cur = normalizeBranding(SAMPLE_CCL_CUP);
    const next = normalizeBranding({ scoreboard: { logoScale: 150 } }, cur);
    expect(next.scoreboard).toMatchObject({ theme: "custom", baseColor: "#0b1f4b", accentColor: "#f2b705", logoScale: 150 });
    expect(next.brandName).toBe("CCL CUP");
    expect(next.led.theme).toBe("custom");
  });
  it("ön ayar birleşimi ve sunucu gövdesi (extras gönderilmez)", () => {
    const cur = normalizeBranding({ logoUrl: "https://x/logo.png", extras: { fontScale: 110 } });
    const merged = mergePreset(cur, { id: 1, name: "CCL", branding: { brandName: "CCL CUP", scoreboard: { theme: "gece" } } });
    expect(merged.logoUrl).toBe("https://x/logo.png");
    expect(merged.brandName).toBe("CCL CUP");
    expect(merged.scoreboard.theme).toBe("gece");
    expect(merged.extras.fontScale).toBe(110);
    const body = serverBrandingBody(merged);
    expect(Object.keys(body).sort()).toEqual(["brandName", "led", "logoUrl", "scoreboard"]);
    expect(sameBranding(merged, mergePreset(cur, { branding: { brandName: "CCL CUP", scoreboard: { theme: "gece" } } }))).toBe(true);
  });
  it("tema: varsayılanda renkler aynı, CCL CUP'ta lacivert / altın kayar, açıklık korunur", () => {
    const def = brandColorMap(DEFAULT_BRANDING.scoreboard);
    expect(def["1a001a"]).toBe("#1a001a");
    const ccl = resolvePalette(SAMPLE_CCL_CUP.scoreboard);
    const hueBase = rgbToHsl(parseHex(ccl.p900))[0];
    const hueAcc = rgbToHsl(parseHex(ccl.v400))[0];
    expect(hueBase).toBeGreaterThan(200); expect(hueBase).toBeLessThan(240);
    expect(hueAcc).toBeGreaterThan(30); expect(hueAcc).toBeLessThan(60);
    expect(Math.abs(rgbToHsl(parseHex(ccl.p900))[2] - rgbToHsl(parseHex("#1a001a"))[2])).toBeLessThan(0.01);
    const r = resolveBranding(SAMPLE_CCL_CUP, { defaultLogo: "data:x" });
    expect(r).toMatchObject({ primary: "#0b1f4b", accent: "#f2b705", text: "#ffffff", brandName: "CCL CUP", logoUrl: "data:x", logoScale: 1.1 });
    expect(r.fontFamily).toMatch(/Inter/);
    expect(resolveBranding({ extras: { homeColor: "#ff0000" } }).palette.homeBright).toBe("#ff0000");
  });
  it("ön ayar listesi, ad doğrulama, gövde", () => {
    const list = normalizePresetList({ presets: [{ id: 2, name: "B", branding: "{\"brandName\":\"X\"}" }, { id: 1, name: "A", is_default: 1 }, { id: 3, name: "" }] });
    expect(list.map((p) => p.id)).toEqual(["1", "2"]);
    expect(list[1].branding.brandName).toBe("X");
    expect(validatePresetName("a", list)).toMatch(/zaten/);
    expect(validatePresetName("A", list, "1")).toBe("");
    expect(validatePresetName(" ", list)).toMatch(/gir/);
    expect(presetBody("  CCL CUP ", SAMPLE_CCL_CUP).name).toBe("CCL CUP");
    expect(normalizeExtras({ homeColor: "#ABCDEF" }).homeColor).toBe("#abcdef");
  });
});

describe("yayın grafikleri · çeşitler", () => {
  it("web modlarının hepsi + Gizli", () => {
    const keys = SCOREBOARD_VARIANTS.map((v) => v.key);
    OVERLAY_MODES.forEach((m) => expect(keys).toContain(m.key));
    expect(keys).toContain("off");
    expect(isWebVariant("off")).toBe(false);
    expect(isWebVariant("lineupsv3")).toBe(true);
  });
  it("eski anahtarlar ve sınıflar", () => {
    expect(normalizeVariant("small")).toBe("scoreboard");
    expect(normalizeVariant("bottom")).toBe("bottomboard");
    expect(normalizeVariant("standings")).toBe("scoreboard");
    expect(normalizeVariant("???", "off")).toBe("off");
    expect(isFullPanel("pre_match")).toBe(true);
    expect(isFullPanel("scoreboard")).toBe(false);
    expect(usesBottom("bottomboard")).toBe(true);
    expect(normalizeLedMode("MVP")).toBe("mvp");
    expect(normalizeLedMode("x")).toBe("scoreboard");
  });
});

describe("yayın grafikleri · altyazı şeridi", () => {
  const subtitle = { message: "Duyuru", sections: { custom: true, ai: false, headlines: true, scorers: true }, customHeadlines: [{ tag: "TRANSFER", text: "A" }, { text: " " }], aiHeadlines: [{ text: "AI" }] };
  it("bloklar: duyuru, manşet, skor, golcüler; kapalı bölüm yok", () => {
    const blocks = buildTickerBlocks({ subtitle, match: { homeCode: "ANG", awayCode: "KAR", homeScore: 2, awayScore: 1, live: true, statusText: "2. YARI · 10:05" }, scorers: { home: [{ name: "Ali", minutes: [5, 9] }], away: [] } });
    expect(blocks.map((b) => b.type === "cat" ? `#${b.label}` : b.text)).toEqual(["#DUYURU", "Duyuru", "#MANŞET", "A", "#SKOR", "ANG 2 – 1 KAR · 2. YARI · 10:05", "#GOLLER", "Ali 5', 9'"]);
    expect(blocks.find((b) => b.key === "score").tag).toBe("CANLI");
    expect(buildTickerBlocks({ subtitle: { sections: { custom: false } , customHeadlines: [{ text: "x" }] } })).toEqual([]);
  });
  it("kayma: hıza göre ilerler, kopya genişliğinde başa sarar", () => {
    expect(tickerOffset({ copyWidth: 1000, speed: "normal", now: 5000, epoch: 0 })).toBe(500);
    expect(tickerOffset({ copyWidth: 1000, speed: "fast", now: 10_000, epoch: 0 })).toBe((10 * TICKER_SPEED_PX.fast) % 1000);
    expect(tickerOffset({ copyWidth: 0, now: 99 })).toBe(0);
    expect(tickerDuration(1400, "slow")).toBe(20);
  });
  it("sponsor dönüşümü: dakikalarca şerit, saniyelerce sponsor", () => {
    const base = { rotate: true, hasSponsor: true, everyMin: 5, seconds: 10, epoch: 0 };
    expect(rotationPhase({ ...base, now: 60_000 }).onSponsor).toBe(false);
    expect(rotationPhase({ ...base, now: 5 * 60_000 + 3000 }).onSponsor).toBe(true);
    expect(rotationPhase({ ...base, now: 5 * 60_000 + 11_000 }).onSponsor).toBe(false);
    expect(rotationPhase({ ...base, now: 0, mode: "sponsor" }).onSponsor).toBe(true);
    expect(rotationPhase({ ...base, hasSponsor: false, now: 5 * 60_000 + 3000 }).onSponsor).toBe(false);
    expect(rotationPhase({ ...base, everyMin: 99, now: 15 * 60_000 + 1 }).onSponsor).toBe(true); // geçersiz → 15 dk
  });
  it("satır yerleşimi: öğeler soldan sağa, genişlik toplanır", () => {
    const fonts = { cat: F(11), tag: F(11), text: F(19), message: F(19) };
    const row = tickerRowLayout([{ type: "cat", label: "SKOR" }, { type: "headline", tag: "CANLI", text: "A 1 – 0 B" }, { type: "message", text: "Merhaba" }], measure, fonts);
    expect(row.items).toHaveLength(3);
    expect(row.items[1].x).toBeGreaterThan(row.items[0].x + row.items[0].w);
    expect(row.width).toBeGreaterThan(row.items[2].x + row.items[2].w);
    expect(row.items[1].tagW).toBeGreaterThan(0);
  });
});

describe("yayın grafikleri · snapshot", () => {
  it("skor, kodlar, saat, golcüler, kadro hatları, olay bandı", () => {
    const snap = buildGraphicsSnapshot(liveFixture(), { branding: SAMPLE_CCL_CUP, variant: "small", now, interview: { onAir: true, people: [{ name: "Ali", side: "home" }, { name: "Hoca", side: "other", teamName: "Kulüp", role: "TD" }] } });
    expect(snap.variant).toBe("scoreboard");
    expect(snap.match).toMatchObject({ homeCode: "ANG", awayCode: "KAR", homeScore: 2, awayScore: 1, leagueLine: "CCL Cup · 2026", time: "21:00", field: "Saha 1" });
    expect(snapshotClockMs(snap.match.clock, now)).toBe(605_000);
    expect(snap.scorers.home[0]).toEqual({ name: "Ali Veli Kaya", minutes: [5] });
    expect(snap.lineups.home.map((r) => r.group)).toEqual(["fwd", "gk", "def"]);
    expect(snap.timeline.map((r) => r.kind)).toEqual(["goal", "yellow", "sub"]);
    expect(snap.timeline[0].type).toBe("GOL · PENALTI");
    expect(snap.timeline[2].who).toBe("▲ Deniz  ▼ Can");
    expect(snap.event.label).toBe("GOL");
    expect(snap.interview.people[0].team).toBe("Ankara Gençlikspor");
    expect(snap.interview.people[1]).toMatchObject({ team: "Kulüp", role: "TD", side: "other" });
    expect(snap.branding.brandName).toBe("CCL CUP");
    expect(snapshotImageUrls(snap)).toEqual(expect.arrayContaining(["https://x/h.png", "https://x/a.png"]));
    expect(snapshotImageUrls({ ...snap, variant: "lineups" })).toContain("https://x/1.png");
  });
  it("durum metni ve diziliş", () => {
    expect(interviewStatusText({ finished: true })).toBe("MAÇ SONU");
    expect(interviewStatusText({ running: false, period: 1, clockMs: 0 })).toBe("MAÇ ÖNCESİ");
    expect(interviewStatusText({ running: false, period: 1, clockMs: 1_500_000 })).toBe("DEVRE ARASI");
    expect(interviewStatusText({ running: true, period: 2, clockMs: 65_000 })).toBe("2. YARI · 01:05");
    expect(lineGroup("Sağ Bek")).toBe("def");
    expect(lineGroup("")).toBe("mid");
    expect(formationOf(lineupRows([{ id: 1, position: "Stoper", role: "starter" }, { id: 2, position: "Stoper", role: "starter" }, { id: 3, position: "Forvet", role: "starter" }, { id: 4, position: "Forvet", role: "bench" }]))).toBe("2-1");
    expect(timelineRows([{ olay_kodu: "FOUL", takim_id: 1 }])).toEqual([]);
  });
});

describe("yayın grafikleri · yerleşimler", () => {
  const m = { homeCode: "ANG", awayCode: "KAR", homeName: "A", awayName: "B", homeScore: 1, awayScore: 0, leagueLine: "Lig · 2026", statusText: "MAÇ SONU" };
  it("röportaj klasik: bant 1080–1680, ortalı, skor kartı üstünde; kişi sayısı yazıyı küçültür", () => {
    const one = interviewLayout({ style: "classic", people: [{ name: "Ali", team: "A", role: "Kaptan", side: "home" }] }, m, { measure, F });
    expect(one.band.w).toBeGreaterThanOrEqual(1080);
    expect(one.band.w).toBeLessThanOrEqual(1680);
    expect(one.band.x).toBeCloseTo((1920 - one.band.w) / 2);
    expect(one.band.y + one.band.h).toBe(1080 - 72);
    expect(one.score.y + one.score.h).toBe(one.band.y);
    const four = interviewLayout({ style: "classic", people: Array.from({ length: 6 }, (_, i) => ({ name: `Kişi ${i}` })) }, m, { measure, F });
    expect(four.rows).toHaveLength(4);
    expect(four.nameSize).toBeLessThan(one.nameSize);
    const lifted = interviewLayout({ style: "classic", people: [] }, m, { measure, F, lift: 108 });
    expect(lifted.band.y).toBe(one.band.y - 108);
    expect(lifted.rows[0].empty).toBe(true);
  });
  it("röportaj diğer görünümler: ince bant, yan panel, vitrin, dikey", () => {
    const people = [{ name: "Ali", side: "home", team: "A" }, { name: "Veli", side: "away", team: "B", role: "TD" }];
    const slim = interviewLayout({ style: "slim", people }, m, { measure, F });
    expect(slim.box.h).toBe(64);
    expect(slim.box.w).toBeLessThanOrEqual(1720);
    expect(slim.box.y + slim.box.h).toBe(1080 - 56);
    const side = interviewLayout({ style: "side", people, sponsor: { name: "S" } }, m, { measure, F });
    expect(side.box).toMatchObject({ x: 64, w: 520 });
    expect(side.footH).toBeGreaterThan(0);
    const stack = interviewLayout({ style: "stack", people }, m, { measure, F });
    expect(stack.box.w).toBeGreaterThanOrEqual(760);
    expect(stack.pill.y).toBeLessThan(stack.box.y);
    const vert = interviewLayout({ style: "vertical", people }, m, { measure, F });
    expect(vert.box).toMatchObject({ x: 690, w: 540 });
    expect(normalizeInterviewStyle("x")).toBe("classic");
  });
  it("skorboard V2 kutuları ve olay bandı", () => {
    const L = miniLayout({ homeName: "Çok Uzun Bir Takım Adı Spor Kulübü", awayName: "B", homeScore: 10, awayScore: 0, clockMs: 61_000, period: 2, event: { label: "GOL", player: "ALİ", kind: "goal" } }, measure, F);
    expect(L.box).toMatchObject({ x: 64, y: 54, w: 372, h: 58 * 2 + 42 });
    expect(L.rows[0].name.text.endsWith("…")).toBe(true);
    expect(L.foot.clock).toBe("01:01");
    expect(L.foot.period).toBe("2. YARI");
    expect(L.lower.y).toBe(54 + 58 * 2 + 42 + 4);
    expect(miniLayout({ homeName: "A", awayName: "B", finished: true }, measure, F).foot).toMatchObject({ clock: "MAÇ SONU", period: null });
  });
  it("kadro slaytları, taraf dönüşü, özet kayması", () => {
    const lineups = { home: lineupRows([{ id: 1, name: "K1", position: "Kaleci", role: "starter" }, { id: 2, name: "D1", position: "Defans", role: "starter" }, { id: 3, name: "D2", position: "Defans", role: "starter" }]), away: lineupRows([{ id: 9, name: "K2", position: "Kaleci", role: "starter" }]) };
    const slides = lineupV2Slides(lineups);
    expect(slides.map((s) => s.id)).toEqual(["gk-0", "def-0", "def-1"]);
    expect(slides[1]).toMatchObject({ current: 1, total: 2, away: null });
    expect(slideAt(3, 7000, 0)).toBe(2);
    expect(slideAt(0, 7000, 0)).toBe(0);
    expect(lineupV3Side(1000, 0)).toBe("home");
    expect(lineupV3Side(10_000, 0)).toBe("away");
    expect(summaryScroll(3, 0, 0).animated).toBe(false);
    const sc = summaryScroll(20, 31_000, 0);
    expect(sc.animated).toBe(true);
    expect(sc.offset).toBeGreaterThan(0);
  });
});

describe("yayın grafikleri · tuval yardımcıları", () => {
  it("sığdırma, satır kırma, kısaltma, giriş", () => {
    expect(fitText("ABCDEFGHIJ", 30, F(10), measure)).toBe("ABCDE…");
    expect(wrapLines("Ahmet Ali Şahin", 60, F(10), measure, 2)).toEqual(["Ahmet Ali", "Şahin"]);
    expect(wrapLines("Uzunisimtekkelime", 40, F(10), measure, 2)[0].endsWith("…")).toBe(true);
    expect(shortenName("Ahmet Ali Şahin")).toBe("Ahmet A. Şahin");
    expect(enter(1000, 1000)).toBe(0);
    expect(enter(2000, 1000)).toBe(1);
    expect(enter(5, 0)).toBe(1);
  });
  it("ölçü önbelleği aynı metni bir kez ölçer; harf aralığı eklenir", () => {
    let n = 0;
    const ctx = { font: "", measureText: (t) => { n += 1; return { width: t.length * 10 }; } };
    const M = createMeasure(ctx);
    expect(M("abc", F(10))).toBe(30);
    expect(M("abc", F(10))).toBe(30);
    expect(n).toBe(1);
    expect(M("ab", F(10), 2)).toBe(22);
  });
  it("katman önbelleği tuval yokken null (doğrudan çizim)", () => {
    const cache = createLayerCache();
    expect(cache.get("k", 10, 10, () => {})).toBeNull();
  });
});

describe("yayın grafikleri · drawGraphics", () => {
  it("tüm çeşitler + altyazı + röportaj görünümleri hatasız çizilir", () => {
    const ctx = fakeCtx();
    const live = liveFixture();
    for (const v of SCOREBOARD_VARIANTS) {
      for (const style of ["classic", "slim", "side", "stack", "vertical"]) {
        const snap = buildGraphicsSnapshot(live, {
          branding: SAMPLE_CCL_CUP, variant: v.key, variantSince: now - 2000, now,
          subtitle: { onAir: true, settings: { message: "Merhaba", customHeadlines: [{ tag: "T", text: "Satır" }], sponsorId: 1, rotateSponsor: true }, epoch: now - 1000 },
          sponsors: [{ id: 1, name: "Sponsor", images: {} }],
          interview: { onAir: true, style, people: [{ name: "Ali", side: "home" }], sponsorId: 1 },
        });
        expect(() => drawGraphics(ctx, { width: 1920, height: 1080, now }, snap)).not.toThrow();
      }
    }
    expect(ctx.calls.fillText).toBeGreaterThan(100);
  });
  it("Gizli çeşit ve kapalı katmanlar hiçbir şey çizmez; snapshot yoksa sessiz", () => {
    const ctx = fakeCtx();
    const snap = buildGraphicsSnapshot(liveFixture(), { variant: "off", now });
    drawGraphics(ctx, { width: 1280, height: 720, now }, snap);
    expect(ctx.calls.fillText).toBe(0);
    expect(() => drawGraphics(ctx, { width: 1280, height: 720, now }, null)).not.toThrow();
  });
});
