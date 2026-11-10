// Yayın Stüdyosu · PANORAMA (tur 3): marka profilleri ve temalar, logodan palet, dışa / içe aktarma,
// 40+ kamera düzeni (ayna, boşluk, maske, ince ayar, kendi düzenin), web Panorama sahneleri (katalog,
// sorgu, 24 içerik türünün tuval çizimi), yeni yerel kartlar, hazır ayarlar (kaydet / uygula / açılış),
// web yayınından içe aktarma.
import { describe, expect, it } from "vitest";
import {
  BUILTIN_BRANDS, THEMES, applyThemeToBrand, brandFromWebBroadcast, brandTokens, contrast, copyBrand, exportBrands, findBrand, loadBrands,
  normalizeBrand, paletteFromPixels, parseBrandFile, saveBrands,
} from "../src/lib/studio/panorama/brands";
import { BUILTIN_LAYOUTS, angleGeometry, layoutFromAngle, layoutOf, normalizeCustomLayout, setCustomLayouts } from "../src/lib/studio/panorama/layouts";
import {
  CARD_KINDS, CARD_MEDIA_ID, buildPanoramaScenes, buildPanoramaSnapshot, cardBodyBox, cardPayload, currentMedia, makeCard, normalizeAngle, normalizeCard,
  normalizePanoramaState, panoramaImageUrls, sceneBoxes, defaultPanoramaState, webCardKey,
} from "../src/lib/studio/panorama/model";
import { WEB_SCENES, fetchWebScene, missingParams, normalizeCatalog, paramFields, pickMatchOfWeek, sceneQuery } from "../src/lib/studio/panorama/webScenes";
import { WEB_KINDS, drawWebBody, money, webPayloadImages } from "../src/lib/studio/panorama/drawWeb";
import { LOCAL_CARD_BODIES, countdownParts, slideIndex, weatherText } from "../src/lib/studio/panorama/drawCards";
import { cardMotion, drawPanorama } from "../src/lib/studio/panorama/draw";
import { applyPreset, bootState, loadPresets, presetDirty, presetFromState, presetFromWebBroadcast, savePresets } from "../src/lib/studio/panorama/presets";
import { LAYER_MASKS, normalizeLayer } from "../src/lib/studio/scenes";
import { maskPath } from "../src/views/studio/draw";

const mem = (init = {}) => { const m = new Map(Object.entries(init)); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m }; };
function fakeCtx() {
  const calls = { fillText: [], drawImage: 0, paths: [] };
  const state = { font: "10px X", globalAlpha: 1 };
  return new Proxy(state, {
    get(t, p) {
      if (p === "calls") return calls;
      if (p === "measureText") return (s) => ({ width: String(s).length * 10 });
      if (p === "createLinearGradient") return () => ({ addColorStop() {} });
      if (p === "fillText") return (s) => calls.fillText.push(String(s));
      if (p === "drawImage") return () => { calls.drawImage += 1; };
      if (["arc", "ellipse", "lineTo", "moveTo", "rect"].includes(p)) return (...a) => calls.paths.push([p, ...a]);
      if (p in t) return t[p];
      return () => {};
    },
    set(t, p, v) { t[p] = v; return true; },
  });
}

describe("panorama · marka profilleri ve temalar", () => {
  it("16 hazır tema; her biri okunur belirteçler üretir (başlık / vurgu üstünde metin kontrastı)", () => {
    expect(THEMES.length).toBeGreaterThanOrEqual(12);
    expect(THEMES.map((t) => t.label)).toEqual(expect.arrayContaining(["Elitlig klasik", "Gece & altın", "Gündüz", "Spor kanalı", "Minimal", "Neon", "Retro", "Kurumsal", "Şampiyonlar", "Sahil", "Kış"]));
    for (const b of BUILTIN_BRANDS) {
      const T = brandTokens(b);
      expect(contrast(T.headText, T.head)).toBeGreaterThanOrEqual(3);
      expect(contrast(T.accentText, T.accent)).toBeGreaterThanOrEqual(3);
      expect(T.bg).toHaveLength(2);
      expect(T.fonts.sans).toContain("Inter");
    }
    expect(brandTokens(findBrand([], "th_gece")).bg[0]).toBe("#050b1f");
  });
  it("profil: bilinmeyen alan atılır, sınırlar uygulanır, tema değişince kimlik (ad, logo, yazı tipi) korunur", () => {
    const b = normalizeBrand({ name: "Kupa", theme: "neon", colors: { primary: "#123", accent: "zzz" }, card: { radius: 999, opacity: 0.1 }, header: { style: "yok" }, anim: { in: "zoom", ms: 10 }, logo: { data: "data:image/png;base64,AAAA", name: "l.png" }, fonts: { display: "Oswald" }, evil: 1 });
    expect(b.colors.primary).toBe("#112233");
    expect(b.colors.accent).toBe(THEMES.find((t) => t.key === "neon").palette.accent);
    expect(b.card).toMatchObject({ radius: 60, opacity: 0.3, glass: true });
    expect(b.header.style).toBe("pill");
    expect(b.anim).toMatchObject({ in: "zoom", ms: 150 });
    expect(b.evil).toBeUndefined();
    const t = applyThemeToBrand(b, "retro");
    expect(t).toMatchObject({ id: b.id, name: "Kupa", theme: "retro", fonts: { display: "Oswald", body: "" } });
    expect(t.logo.name).toBe("l.png");
    expect(t.colors.accent).toBe(THEMES.find((x) => x.key === "retro").palette.accent);
    expect(normalizeBrand({ logo: { data: "javascript:alert(1)" } }).logo).toBe(null);
    const c = copyBrand(BUILTIN_BRANDS[3]);
    expect(c.builtin).toBeUndefined();
    expect(c.id).not.toBe(BUILTIN_BRANDS[3].id);
  });
  it("kart başına stil geçersiz kılma belirteçlere işler", () => {
    const T = brandTokens(BUILTIN_BRANDS[0], { accent: "#ff0000", radius: 4, opacity: 0.6 });
    expect(T.accent).toBe("#ff0000");
    expect(T.card).toMatchObject({ radius: 4, opacity: 0.6 });
  });
  it("logodan palet: baskın doygun renk ana, tonu uzak renk vurgu; renksiz logoda güvenli palet", () => {
    const px = [];
    const push = (r, g, b, n, a = 255) => { for (let i = 0; i < n; i += 1) px.push(r, g, b, a); };
    push(20, 60, 200, 300); push(250, 200, 20, 80); push(255, 255, 255, 200); push(0, 0, 0, 100, 0);
    const p = paletteFromPixels(px);
    expect(p.source).toBe("logo");
    const [r, , b] = [parseInt(p.primary.slice(1, 3), 16), 0, parseInt(p.primary.slice(5, 7), 16)];
    expect(b).toBeGreaterThan(r);
    expect(parseInt(p.accent.slice(1, 3), 16)).toBeGreaterThan(150);
    const gray = []; for (let i = 0; i < 100; i += 1) gray.push(30, 30, 30, 255);
    expect(paletteFromPixels(gray).source).toBe("neutral");
  });
  it("dışa / içe aktarma: logolar gömülü, yerel izin adresi dosyaya yazılmaz, aynı kimlik ezilmez, hazır ayar bağlantısı taşınır", () => {
    const a = normalizeBrand({ id: "br_a", name: "A Marka", theme: "spor", logo: { data: "data:image/webp;base64,UklGRg==", url: "elitlig-studio://media/x/logo.png", name: "logo.png" }, logo2: { url: "https://cdn.example/s.png" } });
    const file = exportBrands([a, BUILTIN_BRANDS[0]], { presets: [{ id: "pp1", name: "P", brandId: "br_a", angles: [{ layout: "host" }] }] });
    expect(file.format).toBe("elitlig-panorama-brands");
    expect(file.brands).toHaveLength(1);
    expect(file.brands[0].logo).toEqual({ data: "data:image/webp;base64,UklGRg==", url: null, name: "logo.png" });
    expect(file.brands[0].logo2.url).toBe("https://cdn.example/s.png");
    const back = parseBrandFile(JSON.stringify(file), [a]);
    expect(back.errors).toEqual([]);
    expect(back.brands[0].id).not.toBe("br_a");
    expect(back.presets[0].brandId).toBe(back.brands[0].id);
    expect(parseBrandFile("{x", []).errors[0]).toMatch(/JSON/);
    expect(parseBrandFile(JSON.stringify({ format: "baska" }), []).errors[0]).toMatch(/Elitlig/);
    const st = mem();
    saveBrands(st, [a, BUILTIN_BRANDS[1]]);
    expect(loadBrands(st).map((b) => b.id)).toEqual(["br_a"]);
  });
  it("web Panorama yayınının program kimliği marka profiline çevrilir", () => {
    const b = brandFromWebBroadcast({ name: "CCL PANORAMA", theme: "lacivert", brandTitle: "PANORAMA", brandLogoUrl: "https://x/ccl.png", brandStyle: { primary: "#123a8c", accent: "#2fb4ff", background: "#06122e", surface: "light", displayFont: "bebas", corners: "sharp", tagline: "CCL CUP" } });
    expect(b).toMatchObject({ name: "PANORAMA", theme: "lacivert", title: "PANORAMA", fonts: { display: "Bebas Neue" }, header: { tagline: "CCL CUP" } });
    expect(b.colors).toMatchObject({ primary: "#123a8c", accent: "#2fb4ff", background: "#06122e", panel: "#ffffff" });
    expect(b.card.radius).toBe(2);
    expect(b.logo.url).toBe("https://x/ccl.png");
  });
});

describe("panorama · kamera düzenleri ve açı geometrisi", () => {
  it("40+ hazır düzen: resim içinde resim, 60/40, 70/30, dikey bölme, 3×3, 1+5, 2+4, haber masası, röportaj, ekran duvarı, çapraz, şekilli", () => {
    expect(BUILTIN_LAYOUTS.length).toBeGreaterThanOrEqual(40);
    const keys = BUILTIN_LAYOUTS.map((l) => l.key);
    expect(keys).toEqual(expect.arrayContaining(["pip", "pipCircle", "side6040", "side7030", "vsplit", "grid9", "onePlus5", "twoPlus4", "newsDesk", "interview", "wall", "contentCam", "camTicker", "diagonal", "circles2", "hexDuo"]));
    expect(layoutOf("grid9").slots).toHaveLength(9);
    expect(layoutOf("onePlus5").slots).toHaveLength(6);
    expect(layoutOf("twoPlus4").slots).toHaveLength(6);
    expect(layoutOf("wall").slots).toHaveLength(12);
    expect(layoutOf("side6040").slots[0].w / layoutOf("side6040").slots[1].w).toBeCloseTo(0.575 / 0.375, 2);
    for (const l of BUILTIN_LAYOUTS) for (const b of [...l.slots, l.card].filter(Boolean)) {
      expect(b.x).toBeGreaterThanOrEqual(-0.001); expect(b.y).toBeGreaterThanOrEqual(-0.001);
      expect(b.x + b.w).toBeLessThanOrEqual(1.001); expect(b.y + b.h).toBeLessThanOrEqual(1.001);
    }
  });
  it("ayna (köşe seçimi), boşluk, maske ve yuva başına ince ayar (konum + kırpma)", () => {
    const pip = layoutOf("pip").slots[1];
    const g = angleGeometry({ layout: "pip", mirror: true, flip: true });
    expect(g.slots[1].x).toBeCloseTo(1 - pip.x - pip.w, 4);
    expect(g.slots[1].y).toBeCloseTo(1 - pip.y - pip.h, 4);
    expect(angleGeometry({ layout: "diagonal", mirror: true }).slots[0].mask).toBe("diagR");
    const gap = angleGeometry({ layout: "grid4", style: { gap: 0.02 } }).slots[0];
    expect(gap.w).toBeCloseTo(layoutOf("grid4").slots[0].w - 0.02, 4);
    const a = normalizeAngle({ layout: "duo", boxes: { 1: { x: 0.6, y: 0.2, w: 0.3, h: 0.5, crop: { l: 0.1, r: 0.05 }, mask: "circle" } }, style: { mask: "cut", border: 6, shadow: 0, radius: 0.1 } });
    const gg = angleGeometry(a);
    expect(gg.slots[1]).toMatchObject({ x: 0.6, y: 0.2, w: 0.3, h: 0.5, mask: "circle", crop: { l: 0.1, t: 0, r: 0.05, b: 0 } });
    expect(gg.slots[0].mask).toBe("cut");
  });
  it("açı → sahne katmanları: maske, kırpma, kenarlık, gölge, çizim sırası (z) ve kart videosu katmanı", () => {
    const sources = [{ id: "c1", kind: "camera", name: "Sunucu" }, { id: "c2", kind: "camera", name: "Konuk" }];
    const angles = [normalizeAngle({ id: "p", layout: "pipCircle", slots: ["c1", "c2"] }), normalizeAngle({ id: "d", layout: "duo", slots: ["c1", "c2"], boxes: { 0: { crop: { l: 0.2 } } }, style: { border: 0, shadow: 0 } }), normalizeAngle({ id: "h", layout: "host", slots: ["c1"] })];
    const cfg = buildPanoramaScenes({ sources, angles, theme: brandTokens(BUILTIN_BRANDS[0]), cardMedia: { kind: "video", src: "elitlig-studio://media/a/v.mp4" } });
    const pip = cfg.scenes[0].layers;
    expect(pip.map((l) => l.sourceId)).toEqual(["c1", "c2"]);
    expect(pip[1]).toMatchObject({ mask: "circle", border: { width: 3 } });
    expect(pip[0].mask).toBeUndefined();
    const duo = cfg.scenes[1].layers;
    expect(duo[1].crop.l).toBeCloseTo(0.2, 4);
    expect(duo[1].border).toBeUndefined();
    expect(duo[1].shadow).toBeUndefined();
    const host = cfg.scenes[2].layers;
    expect(host.at(-1)).toMatchObject({ sourceId: CARD_MEDIA_ID });
    expect(host.at(-1).x).toBeCloseTo(cardBodyBox(layoutOf("host").card).x, 4);
    expect(cfg.sources.find((s) => s.id === CARD_MEDIA_ID)).toMatchObject({ kind: "video", url: "elitlig-studio://media/a/v.mp4" });
    expect(normalizeLayer({ sourceId: "x", mask: "hex" }, "camera").mask).toBe("hex");
    expect(normalizeLayer({ sourceId: "x", mask: "kalp" }, "camera").mask).toBeUndefined();
    expect(LAYER_MASKS).toContain("diagL");
  });
  it("maske yolları tuvalde çizilir (daire, elips, çapraz, altıgen…)", () => {
    for (const m of LAYER_MASKS) { const c = fakeCtx(); maskPath(c, m, 400, 200); expect(c.calls.paths.length).toBeGreaterThan(0); }
    const c = fakeCtx(); maskPath(c, "circle", 400, 200);
    expect(c.calls.paths[0]).toEqual(["arc", 200, 100, 100, 0, Math.PI * 2]);
  });
  it("kendi düzenin: kaydedilir, açılarda kullanılır, açının ince ayarından düzen üretilir", () => {
    const l = normalizeCustomLayout({ label: "Benim", slots: [{ x: 0.1, y: 0.1, w: 0.3, h: 0.3, mask: "circle" }, { x: 0.5, y: 0.1, w: 0.3, h: 0.3 }], card: { x: 0.1, y: 0.5, w: 0.8, h: 0.4 } });
    expect(l.key).toMatch(/^u_/);
    setCustomLayouts([l]);
    const a = normalizeAngle({ layout: l.key, slots: ["c1", "c2"] });
    expect(a.layout).toBe(l.key);
    expect(a.slots).toHaveLength(2);
    const st = normalizePanoramaState({ ...defaultPanoramaState(), customLayouts: [l], angles: [a] });
    expect(st.customLayouts[0].key).toBe(l.key);
    expect(st.angles[0].layout).toBe(l.key);
    const from = layoutFromAngle(normalizeAngle({ layout: "duo", boxes: { 0: { x: 0.05 } } }), "X");
    expect(from.slots[0].x).toBe(0.05);
    setCustomLayouts([]);
  });
});

describe("panorama · web Panorama sahneleri", () => {
  it("gömülü katalog web rejisinin bütün sahnelerini içerir; sunucu kataloğu süzülür", () => {
    expect(WEB_SCENES.length).toBeGreaterThanOrEqual(50);
    expect(WEB_SCENES.map((s) => s.key)).toEqual(expect.arrayContaining(["mac_ozeti", "oyuncu_karsilastirma", "fair_play", "kart_kralligi", "en_golcu_takimlar", "sezon_ozeti", "cezalilar", "oyuncu_gol_turleri"]));
    expect(normalizeCatalog({ scenes: [{ key: "bos" }, { key: "x", label: "X", params: ["scope", 3], required: [] }] })).toEqual([{ key: "x", label: "X", group: "Diğer", hint: "", params: ["scope"], required: [] }]);
    expect(normalizeCatalog(null)).toBe(WEB_SCENES);
  });
  it("sorgu: kartın seçimleri + yayının kapsamı; eksik zorunlu seçimler", () => {
    const sc = WEB_SCENES.find((s) => s.key === "oyuncu_karsilastirma");
    expect(paramFields(sc)).toEqual(["playerId", "playerId2", "leagueId", "seasonId", "date"]);
    expect(missingParams(sc, { playerId: 5 }, { cityId: 1 })).toEqual(["playerId2"]);
    expect(sceneQuery("puan_tablosu", { from: 1, to: 10, junk: "x" }, { cityId: 1, leagueId: 1, seasonId: 160 })).toEqual({ type: "puan_tablosu", cityId: 1, from: 1, to: 10, leagueId: 1, seasonId: 160 });
    expect(webCardKey(makeCard("web", { opts: { scene: "fair_play" } }), { cityId: 1 })).toContain("fair_play");
  });
  it("çekme: eski sunucuda (404) hata yayına çıkmaz, 'desteklenmiyor' döner", async () => {
    const seen = [];
    const ok = async (o) => { seen.push(o); return { ok: true, data: { payload: { kind: "standings", rows: [] }, missing: [] } }; };
    expect((await fetchWebScene(ok, "puan_tablosu", {}, { cityId: 1, leagueId: 1, seasonId: 160 })).payload.kind).toBe("standings");
    expect(seen[0]).toMatchObject({ path: "/api/broadcast/panorama/scene", query: { type: "puan_tablosu", cityId: 1 } });
    const old = await fetchWebScene(async () => ({ ok: false, error: { status: 404 } }), "puan_tablosu", {}, { cityId: 1 });
    expect(old).toMatchObject({ payload: null, unsupported: true });
    expect((await fetchWebScene(ok, "x", {}, {})).error).toMatch(/il/);
  });
  it("haftanın maçı: en üst sıraların yaklaşan maçı", () => {
    const fx = [{ id: 1, homeId: 10, awayId: 11, date: "2026-11-12" }, { id: 2, homeId: 1, awayId: 2, date: "2026-11-13" }];
    expect(pickMatchOfWeek(fx, [{ teamId: 1, rank: 1 }, { teamId: 2, rank: 2 }, { teamId: 10, rank: 9 }]).id).toBe(2);
    expect(pickMatchOfWeek([], [])).toBe(null);
  });
});

const M = (id, h, a, hs, as, extra = {}) => ({ id, homeName: h, awayName: a, homeId: id * 10, awayId: id * 10 + 1, homeLogo: "https://x/h.png", awayLogo: null, homeScore: hs, awayScore: as, date: "2026-11-08T00:00:00.000Z", time: "20:00:00", field: "OSTİM", status: "yayinlanmis", ...extra });
const P = (i, name) => ({ rank: i + 1, playerId: i + 1, playerName: name, playerImage: "https://x/p.jpg", teamName: "CAPITAL FC", teamLogo: "https://x/t.png", value: 30 - i, matches: 10, goals: 30 - i });
export const PAYLOADS = {
  notice: { kind: "notice", title: "Duyuru", text: "KRAL KUPASI KAYITLARI AÇILDI" },
  standings: { kind: "standings", title: "Puan Tablosu", rows: [{ rank: 1, teamId: 610, teamName: "CAPITAL FC", played: 33, wins: 28, draws: 3, losses: 2, goalsFor: 252, goalsAgainst: 110, goalDiff: 142, points: 94, last5: "wwdlw" }] },
  matchList: { kind: "matchList", showScore: true, matches: [M(1, "VADİNİN ASLANLARI", "CAPITAL FC", 2, 5)] },
  matchDetail: { kind: "matchDetail", match: { ...M(1, "EV FC", "DEP FC", 3, 1), statusLabel: "Maç Sonucu" }, scorers: { home: [{ name: "Ali Golcü", minutes: ["12'", "40'"] }], away: [] }, mvp: { name: "Ali Golcü", image: null }, events: [{ id: 1, minute: 12, side: "home", group: "goal", playerName: "Ali Golcü" }, { id: 2, minute: 33, side: "away", group: "yellow", playerName: "Veli Sert" }, { id: 3, minute: 50, side: "away", group: "sub", incomingName: "Giren", outgoingName: "Çıkan" }] },
  lineups: { kind: "lineups", match: M(1, "EV FC", "DEP FC", 1, 0), home: { starters: [{ id: 1, name: "Kaleci Kemal", shirt: 1, position: "K" }], bench: [{ name: "Yedek Yusuf" }] }, away: { starters: [], bench: [] } },
  playerProfile: { kind: "playerProfile", player: { name: "Tolga Arslan", teamName: "SANAYİ FC", position: "Forvet" }, totals: { matches: 20, goals: 31, assists: 7, goalsPerMatch: "1,55", yellow: 1, red: 0 }, marketValue: { current: 1250000, cityRank: 3 } },
  teamProfile: { kind: "teamProfile", team: { name: "CAPITAL FC", league: "FREELİG", squadCount: 18 }, totals: { rank: 1, played: 33, wins: 28, draws: 3, losses: 2, points: 94, goalsFor: 252, goalsAgainst: 110, last5: "WWWWW" }, lastMatches: [M(2, "CAPITAL FC", "NO MERCY", 8, 2)] },
  playerRanking: { kind: "playerRanking", metricLabel: "Gol", rows: [P(0, "Berke Yazıcı"), P(1, "Can Kaya")] },
  valueRanking: { kind: "valueRanking", rows: [{ ...P(0, "Değerli Oyuncu"), value: 2500000, changePercentage: 12.5 }] },
  marketValue: { kind: "marketValue", player: { name: "Tolga Arslan" }, current: 1250000, previous: 1000000, changePercentage: 25, cityRank: 3, history: [{ value: 1250000 }, { value: 1100000 }, { value: 1000000 }] },
  weeklyAwards: { kind: "weeklyAwards", items: [{ awardType: "WEEKLY_PLAYER", awardLabel: "Haftanın Oyuncusu", lead: true, playerName: "Haftanın Yıldızı", stats: { matches: 2, goals: 4, assists: 1 } }, { awardLabel: "Haftanın Golü", playerName: "Golcü" }] },
  penaltyList: { kind: "penaltyList", rows: [{ playerName: "Cezalı Cem", teamName: "X FC", decision: "2 maç men", remaining: 2 }] },
  matchPreview: { kind: "matchPreview", match: M(3, "LİDER FC", "İKİNCİ SK", null, null), home: { rank: 1, points: 40, wins: 13, draws: 1, losses: 0, last5: "WWWWW" }, away: { rank: 2, points: 35, wins: 11, draws: 2, losses: 1, last5: "WDWWL" }, h2h: { aWins: 3, draws: 1, bWins: 2 }, keyPlayers: { home: [{ name: "Yıldız Golcü", goals: 20, assists: 5 }], away: [] } },
  headToHead: { kind: "headToHead", teamA: { name: "A FC" }, teamB: { name: "B SK" }, summary: { aWins: 2, draws: 1, bWins: 0, aGoals: 9, bGoals: 4 }, matches: [M(4, "A FC", "B SK", 3, 1)] },
  squad: { kind: "squad", rows: [{ playerName: "Kadro Oyuncusu", position: "Defans", value: 500000 }] },
  playerForm: { kind: "playerForm", player: { name: "Formda Ferhat" }, rows: [{ matchId: 1, date: "2026-11-01", opponent: "RAKİP FC", venue: "İç saha", score: "3-1", result: "W", goals: 2, assists: 1, yellow: 1, red: 0, points: 8.5 }] },
  comparison: { kind: "comparison", left: { name: "Oyuncu A", image: null, teamName: "X" }, right: { name: "Oyuncu B", image: null }, rows: [{ label: "Gol", left: 10, right: 7 }, { label: "Sarı Kart", left: 1, right: 3, lowerIsBetter: true }], footer: { label: "Piyasa Değeri", left: 100000, right: 200000, money: true } },
  teamValueRanking: { kind: "teamValueRanking", rows: [{ rank: 1, teamName: "ZENGİN FC", value: 9000000, squadSize: 20, average: 450000 }] },
  goalList: { kind: "goalList", match: M(5, "GOL FC", "AĞ SK", 2, 1), goals: [{ minute: 10, side: "home", playerName: "Golcü Gürkan", assistName: "Asistçi", score: "1-0" }] },
  matchRatings: { kind: "matchRatings", match: M(6, "PUAN FC", "NOT SK", 1, 1), mvp: { id: 7 }, home: [{ playerId: 7, name: "En İyi", rating: 9.1, goals: 1, assists: 0 }], away: [{ playerId: 8, name: "Fena Değil", rating: 6.5, yellow: 1 }] },
  matchSummary: { kind: "matchSummary", match: M(7, "ÖZET FC", "RAPOR SK", 4, 2), headline: "Gol yağmuru", notes: ["ÖZET FC 2 farkla kazandı."], mvp: { name: "Maçın Adamı" }, tiles: [{ label: "Gol", value: 6, accent: true }], awards: [{ awardLabel: "Maçın Golü", playerName: "Füze" }] },
  summary: { kind: "summary", tiles: [{ label: "Maç", value: 120 }, { label: "Gol", value: 900, accent: true }], highlights: [{ label: "En Farklı Skor", match: M(8, "FARK FC", "YENİK SK", 12, 0) }], leaders: [{ label: "Gol", rows: [{ playerName: "Gol Kralı", value: 40 }] }] },
  teamRanking: { kind: "teamRanking", valueLabel: "Gol", rows: [{ rank: 1, teamName: "GOLCÜ TAKIM", value: 252, sub: "7,6 / maç", form: "WWDLW" }] },
  breakdown: { kind: "breakdown", player: { name: "Gol Ustası" }, total: 30, items: [{ label: "Sağ ayak", value: 18 }, { label: "Kafa", value: 12 }], facts: [{ label: "Maç", value: 20 }] },
};

describe("panorama · web sahnelerinin tuval çizimi (24 içerik türü)", () => {
  const T = brandTokens(BUILTIN_BRANDS[0]);
  const E = { T, M: (s, f) => String(s).length * 10, now: 10_000, card: { since: 1, sec: 20 } };
  const LOCAL = { standings: (c, b, d) => c.fillText(`STANDINGS:${d.rows[0].teamName}:${d.rows[0].last5}`), weekly: (c, b, d) => c.fillText(`WEEKLY:${d.weekly.items[0].name}`) };
  it("her web içerik türünün çizicisi var ve hatasız çizer", () => {
    expect(Object.keys(WEB_KINDS).sort()).toEqual(Object.keys(PAYLOADS).sort());
    const expectText = { notice: "KRAL KUPASI", matchList: "VADİNİN ASLANLARI", matchDetail: "ALİ GOLCÜ", playerProfile: "ARSLAN", teamProfile: "CAPITAL FC", playerRanking: "BERKE YAZICI", valueRanking: "2,5 M ETL", marketValue: "1,25 M ETL", penaltyList: "CEZALI CEM", matchPreview: "LİDER FC", headToHead: "9 - 4", squad: "KADRO OYUNCUSU", playerForm: "RAKİP FC (İç)", comparison: "OYUNCU A", teamValueRanking: "ZENGİN FC", goalList: "GOLCÜ GÜRKAN", matchRatings: "En İyi  ★ MVP", matchSummary: "GOL YAĞMURU", summary: "GOL KRALI", teamRanking: "GOLCÜ TAKIM", breakdown: "SAĞ AYAK", lineups: "Kaleci Kemal" };
    for (const [kind, payload] of Object.entries(PAYLOADS)) {
      const ctx = fakeCtx();
      expect(() => drawWebBody(ctx, { x: 0, y: 0, w: 1600, h: 800 }, { payload }, E, LOCAL)).not.toThrow();
      const all = ctx.calls.fillText.join(" | ");
      if (expectText[kind]) expect(all, kind).toContain(expectText[kind]);
    }
    const st = fakeCtx(); drawWebBody(st, { x: 0, y: 0, w: 800, h: 600 }, { payload: PAYLOADS.standings }, E, LOCAL);
    expect(st.calls.fillText[0]).toBe("STANDINGS:CAPITAL FC:WWDLW");
  });
  it("eksik seçim / hata / bilinmeyen tür yayına anlaşılır yazıyla çıkar", () => {
    const t = (d) => { const c = fakeCtx(); drawWebBody(c, { x: 0, y: 0, w: 800, h: 600 }, d, E, LOCAL); return c.calls.fillText.join(" | "); };
    expect(t({ payload: null, missing: ["playerId"] })).toContain("seçim eksik");
    expect(t({ payload: null, error: "Bağlantı yok." })).toContain("Bağlantı yok.");
    expect(t({ payload: { kind: "yeniTur" } })).toContain("çizilemiyor");
    expect(money(1250000)).toBe("1,25 M ETL");
    expect(webPayloadImages(PAYLOADS.matchList)).toEqual(["https://x/h.png"]);
  });
});

describe("panorama · yeni yerel kartlar", () => {
  const T = brandTokens(BUILTIN_BRANDS[5]);
  const E = { T, M: (s) => String(s).length * 10, now: 50_000, card: { since: 1, sec: 20 } };
  const draw = (kind, d) => { const c = fakeCtx(); LOCAL_CARD_BODIES[kind](c, { x: 0, y: 0, w: 1400, h: 700 }, d, E); return c.calls.fillText.join(" | "); };
  it("kart türleri: web panoramasının tümü + haftanın maçı, geri sayım, hava, anket, sponsor, slayt, sosyal, skor bandı, çoklu il, özel metin", () => {
    expect(CARD_KINDS.map((k) => k.key)).toEqual(expect.arrayContaining(["web", "motw", "countdown", "weather", "poll", "promo", "slides", "social", "scoreboard", "cities", "text"]));
    expect(CARD_KINDS.length).toBeGreaterThanOrEqual(27);
  });
  it("geri sayım, slayt sırası, hava kodu", () => {
    expect(countdownParts(90_061_000, 0)).toEqual({ done: false, d: 1, h: 1, m: 1, s: 1 });
    expect(countdownParts(5, 10).done).toBe(true);
    expect(slideIndex(3, 13_000, 1000, 6)).toBe(2);
    expect(slideIndex(3, 19_000, 1000, 6)).toBe(0);
    expect(weatherText(63).label).toBe("Yağmurlu");
    expect(weatherText(2).icon).toBe("sunCloud");
    const cm = makeCard("slides", { opts: { items: [{ src: "elitlig-studio://media/1/a.png", kind: "image" }, { src: "elitlig-studio://media/2/b.mp4", kind: "video" }], perSec: 5 } });
    expect(currentMedia(normalizeCard(cm), 7000, 1000)).toMatchObject({ kind: "video", index: 1 });
  });
  it("kart çizimleri gerçek metinle", () => {
    expect(draw("poll", { question: "Maçın adamı kim?", options: [{ label: "Ali", votes: 3 }, { label: "Veli", votes: 1 }], url: "https://elitlig.com/anket" })).toContain("MAÇIN ADAMI KİM?");
    expect(draw("weather", { weather: { place: "Ankara", temp: 12.4, wind: 8, code: 3, days: [{ date: "2026-11-10", code: 3, max: 14, min: 4 }] } })).toContain("12°");
    expect(draw("social", { url: "https://x.com/elitlig/status/1", title: "Final heyecanı", site: "X" })).toContain("Final heyecanı");
    expect(draw("cities", { cities: [{ city: { label: "Ankara" }, tiles: [{ label: "Gol", value: 900 }], leader: { teamName: "CAPITAL FC", points: 94 } }, { city: { label: "İzmir" }, tiles: [] }] })).toContain("ANKARA");
    expect(draw("motw", { match: { homeName: "LİDER", awayName: "İKİNCİ", date: "2026-11-12", time: "21:30" } })).toContain("HAFTANIN MAÇI");
    expect(draw("text", { text: "Satır bir\nSatır iki", upper: true, size: 50 })).toContain("SATIR İKİ");
    expect(draw("scoreboard", { matches: [M(1, "A", "B", 1, 0), M(2, "C", "D", null, null, { live: true })] })).toContain("1 - 0");
    expect(draw("countdown", { target: new Date(Date.now() + 3_600_000).toISOString(), title: "Maça kalan" })).toContain("MAÇA KALAN");
  });
  it("kart seçenekleri: diziler süzülür (anket, medya, iller), stil geçersiz kılma", () => {
    const c = normalizeCard({ kind: "poll", opts: { options: [{ label: "A", votes: -3 }, { label: "B", votes: "7" }], question: "S" }, style: { accent: "#FF0000", radius: 99, anim: "zoom", bad: 1 } });
    expect(c.opts.options).toEqual([{ label: "A", votes: 0 }, { label: "B", votes: 7 }]);
    expect(c.style).toEqual({ accent: "#ff0000", radius: 60, anim: "zoom" });
    expect(normalizeCard({ kind: "slides", opts: { items: [{ src: "javascript:x" }, { src: "elitlig-studio://media/1/a.png", kind: "image" }] } }).opts.items).toHaveLength(1);
    expect(normalizeCard({ kind: "cities", opts: { cityIds: [1, "2", 2, -1, 3, 4, 5, 6, 7] } }).opts.cityIds).toEqual([1, 2, 3, 4, 5, 6]);
  });
  it("kart verisi: web sahnesi, haftanın maçı önizlemesi, hava, iller, skor bandı", () => {
    const data = { scope: { city: { label: "Ankara" } }, standings: { rows: [{ teamId: 1, rank: 1 }, { teamId: 2, rank: 2 }] }, fixtures: [{ id: 9, homeId: 1, awayId: 2, homeName: "A", awayName: "B" }], live: [M(1, "L", "M", 1, 1)], results: [M(2, "R", "S", 3, 0)] };
    const scope = { cityId: 1, leagueId: 1, seasonId: 160 };
    const web = new Map();
    const card = makeCard("web", { opts: { scene: "fair_play" } });
    web.set(webCardKey(card, scope), { payload: { kind: "teamRanking", title: "Fair Play Tablosu", subtitle: "FREELİG", rows: [] }, missing: [] });
    expect(cardPayload(card, data, { web, scope })).toMatchObject({ scene: "fair_play", payload: { kind: "teamRanking" }, loading: false });
    expect(cardPayload(makeCard("web", { opts: { scene: "x" } }), data, { web, scope }).loading).toBe(true);
    expect(cardPayload(makeCard("motw"), data, { web, scope }).match.id).toBe(9);
    const weather = new Map([["ankara", { weather: { temp: 3 } }]]);
    expect(cardPayload(makeCard("weather"), data, { weather }).weather.temp).toBe(3);
    expect(cardPayload(makeCard("scoreboard"), data).matches.map((m) => m.id)).toEqual([1, 2, 9]);
    const snap = buildPanoramaSnapshot({ brand: BUILTIN_BRANDS[4], angles: [normalizeAngle({ id: "t", layout: "camTicker", slots: ["c1"] })], sources: [], card, cardSince: 1, data, ticker: { on: true, sources: ["results"] }, scope, web });
    expect(snap.panorama.card).toMatchObject({ title: "Fair Play Tablosu", subtitle: "FREELİG" });
    expect(snap.panorama.tokens.key).toBe(BUILTIN_BRANDS[4].id);
    expect(snap.panorama.scores).toHaveLength(3);
    expect(sceneBoxes([normalizeAngle({ id: "t", layout: "camTicker" })]).t.band).toBe("scores");
  });
});

describe("panorama · marka ile program çizimi", () => {
  const data = { scope: { city: { label: "Ankara" }, league: { label: "FREELİG" } }, standings: { rows: [{ rank: 1, teamId: 1, teamName: "CAPITAL FC", played: 1, wins: 1, draws: 0, losses: 0, goalDiff: 3, points: 3, last5: "W" }] }, results: [M(1, "A", "B", 1, 0)], live: [], fixtures: [], news: [], sponsors: [] };
  const angles = [normalizeAngle({ id: "h", layout: "host", slots: ["c1"] }), normalizeAngle({ id: "t", layout: "camTicker", slots: ["c1"] }), normalizeAngle({ id: "i", layout: "interview", slots: ["c1", "c2"] })];
  const sources = [{ id: "c1", kind: "camera", name: "Sunucu Ahmet" }, { id: "c2", kind: "camera", name: "Konuk Mehmet" }];
  it("her hazır tema ve stil (künye, isim bandı, bant, saat, filigran) hatasız çizer; marka başlığı künyede", () => {
    for (const b of BUILTIN_BRANDS) {
      const brand = { ...b, title: "KUPA GECESİ", watermark: { ...b.watermark, pos: "br" }, logo: { data: "data:image/png;base64,AAAA" } };
      const snap = buildPanoramaSnapshot({ brand, angles, sources, card: makeCard("standings", { id: "k" }), cardSince: 1, data, ticker: { on: true, sources: ["results"] } });
      for (const sid of ["h", "t", "i"]) {
        const ctx = fakeCtx();
        expect(() => drawPanorama(ctx, { width: 1920, height: 1080, now: 9000, sceneId: sid }, snap)).not.toThrow();
        const txt = ctx.calls.fillText.join(" | ");
        if (b.header.style !== "off") expect(txt, `${b.id}/${sid}`).toContain("KUPA GECESİ");
        if (sid === "i" && b.names.style !== "off") expect(txt).toContain("KONUK MEHMET");
      }
    }
  });
  it("giriş / çıkış hareketleri; önceki kart çıkarken yeni kart bekler", () => {
    expect(cardMotion("fade", 0.5, 800, 600)).toMatchObject({ alpha: 0.5, dx: 0 });
    expect(cardMotion("wipe", 0.25, 800, 600).clip).toBe(0.25);
    expect(cardMotion("zoom", 0, 800, 600).scale).toBeCloseTo(0.86, 5);
    expect(cardMotion("slide", 1, 800, 600)).toMatchObject({ alpha: 1, dx: 0 });
    const prevCard = makeCard("results", { id: "eski" });
    const snap = buildPanoramaSnapshot({ brand: BUILTIN_BRANDS[0], angles, sources, card: makeCard("standings", { id: "yeni" }), cardSince: 1000, prev: { card: prevCard, since: 1, at: 1000 }, data, ticker: { on: false } });
    expect(snap.panorama.prev.card.id).toBe("eski");
    const ctx = fakeCtx();
    drawPanorama(ctx, { width: 1920, height: 1080, now: 1200, sceneId: "h" }, snap);
    expect(ctx.calls.fillText.join(" | ")).toContain("SON SONUÇLAR");
    const ctx2 = fakeCtx();
    drawPanorama(ctx2, { width: 1920, height: 1080, now: 5000, sceneId: "h" }, snap);
    expect(ctx2.calls.fillText.join(" | ")).toContain("PUAN DURUMU");
  });
  it("görsel adresleri: marka logoları, web yükü, slayt görselleri", () => {
    const brand = { ...BUILTIN_BRANDS[0], logo: { data: "data:image/png;base64,QQ==" }, logo2: { url: "https://x/sponsor.png" } };
    const card = makeCard("slides", { opts: { items: [{ src: "elitlig-studio://media/1/a.png", kind: "image" }] } });
    const snap = buildPanoramaSnapshot({ brand, angles, sources, card, cardSince: 1, data, ticker: { on: false } });
    expect(panoramaImageUrls(snap.panorama)).toEqual(expect.arrayContaining(["data:image/png;base64,QQ==", "https://x/sponsor.png", "elitlig-studio://media/1/a.png"]));
  });
});

describe("panorama · hazır ayarlar", () => {
  const base = () => normalizePanoramaState({ ...defaultPanoramaState(), brandId: "br_k", scope: { cityId: 1, leagueId: 1, seasonId: 160 } });
  it("kaydet → uygula: marka, açılar, kartlar, kapsam; kaynakların yerel aygıt seçimi korunur; değişiklik izlenir", () => {
    const st = base();
    const pr = presetFromState("Kupa yayını", st);
    expect(pr).toMatchObject({ name: "Kupa yayını", brandId: "br_k", scope: { cityId: 1, seasonId: 160 } });
    expect(presetDirty(st, pr)).toBe(false);
    const changed = { ...st, brandId: "th_neon" };
    expect(presetDirty(changed, pr)).toBe(true);
    const other = normalizePanoramaState({ ...st, brandId: "th_mor", angles: [normalizeAngle({ layout: "content" })], sources: st.sources.map((s) => ({ ...s, deviceId: "bu-bilgisayar" })) });
    const back = applyPreset(other, pr, { now: 5 });
    expect(back.brandId).toBe("br_k");
    expect(back.presetId).toBe(pr.id);
    expect(back.angles.map((a) => a.layout)).toEqual(pr.angles.map((a) => a.layout));
    expect(back.playlist.startedAt).toBe(5);
    expect(back.sources[0].deviceId).toBe("bu-bilgisayar");
    expect(back.programId).toBe(back.angles[0].id);
  });
  it("kalıcılık: son kullanılan; kayıtlı durum yoksa açılışta hazır ayardan kurulur", () => {
    const st = base();
    const pr = presetFromState("Son", st);
    const store = mem();
    savePresets(store, { list: [pr], lastId: pr.id });
    const loaded = loadPresets(store);
    expect(loaded.lastId).toBe(pr.id);
    const boot = bootState(null, loaded, normalizePanoramaState(defaultPanoramaState()));
    expect(boot.presetId).toBe(pr.id);
    expect(boot.brandId).toBe("br_k");
    expect(bootState(st, loaded, null)).toBe(st);
    expect(loadPresets(mem({ "studio.panorama.presets.v1": "{bozuk" }))).toEqual({ list: [], lastId: null });
  });
  it("web Panorama yayınından hazır ayar: konuk adları kameralara, sahne ilk karta, alt bant, kapsam", () => {
    const sources = [{ id: "c1", kind: "camera", name: "Kamera 1" }, { id: "c2", kind: "camera", name: "Kamera 2" }];
    const bc = { id: 1, name: "Panorama", episodeTitle: "1. Bölüm", layout: "duo", cityId: 1, leagueId: 100, seasonId: 193, guests: [{ name: "Civan", role: "Sunucu" }, { name: "Mehmet" }], scene: { type: "gol_kralligi", params: { leagueId: 100, seasonId: 193, from: 1, to: 10 } }, tickerText: "Kayıtlar açık", tickerVisible: true, brandTitle: "PANORAMA" };
    const { preset, sources: s2 } = presetFromWebBroadcast(bc, { brandId: "br_web", sources });
    expect(s2.map((s) => s.name)).toEqual(["Civan · Sunucu", "Mehmet"]);
    expect(preset).toMatchObject({ name: "Web: Panorama · 1. Bölüm", brandId: "br_web", title: "PANORAMA", scope: { cityId: 1, leagueId: 100, seasonId: 193 } });
    expect(preset.angles[0].layout).toBe("duoCard");
    expect(preset.angles[0].slots).toEqual(["c1", "c2"]);
    expect(preset.playlist.items[0]).toMatchObject({ kind: "web", opts: { scene: "gol_kralligi", from: 1, to: 10 } });
    expect(preset.ticker).toMatchObject({ on: true, text: "Kayıtlar açık" });
  });
});
