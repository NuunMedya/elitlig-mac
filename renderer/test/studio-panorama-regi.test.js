// Yayın Stüdyosu · PANORAMA REJİSİ (tur 5): zengin tema modeli (doğrulama, göç, her hazır temanın
// bütün öğeleri çizmesi, dışa / içe aktarma), yazı bantları (alt yazı, tam ekran, bant kuyruğu),
// medya kutusu (tam ekran / PiP / yuva → sahne yapılandırması), reji durumu (geçiş planı, sahne
// ayarı, kısayollar, butonlar), hazır ayarın bütün gösteriyi taşıması.
import { describe, expect, it } from "vitest";
import { BUILTIN_BRANDS, THEMES, brandTokens, contrast, copyBrand, exportBrands, findBrand, normalizeBrand, parseBrandFile } from "../src/lib/studio/panorama/brands";
import { EDITOR_SECTIONS, FRAME_STYLES, LOWER_STYLES, MOTIONS, STYLE_DEFAULTS, TEXTURES, TICKER_STYLES, ease } from "../src/lib/studio/panorama/themeSchema";
import { THEME_GROUPS } from "../src/lib/studio/panorama/themeCatalog";
import { countdownText, drawAmbient, drawFrames, drawLiveBug, drawLower, drawTickerThemed, drawTitleCard, graphicPhase, paintBackground } from "../src/lib/studio/panorama/drawTheme";
import { buildPanoramaScenes, buildPanoramaSnapshot, makeCard, normalizeAngle, normalizePanoramaState, panoramaImageUrls, savePanoramaState, sceneBoxes } from "../src/lib/studio/panorama/model";
import { drawPanorama, tickerShift } from "../src/lib/studio/panorama/draw";
import {
  MEDIA_BLACK_ID, activeMediaIds, addItems, hideOverlay, inOutStep, isMediaScene, itemOfScene, kindFromUrl, mediaSceneId, mediaSourceId, normalizeMediaItem, normalizeMediaState, removeItem,
  setSlot, showOverlay, tickMedia,
} from "../src/lib/studio/panorama/mediaBin";
import { defaultGfx, gfxSnapshot, hideLower, lowerFromContent, manualTickerTexts, nextLower, normalizeGfx, playLowers, showLower, showTitle, tickGfx, toggleLower } from "../src/lib/studio/panorama/gfx";
import { HOTKEY_ACTIONS, actionForKey, afterTake, defaultButtons, hotkeyConflicts, keyName, normalizeRegi, planTake, sceneForKey, setSceneSetting } from "../src/lib/studio/panorama/regi";
import { applyPreset, presetDirty, presetFromState } from "../src/lib/studio/panorama/presets";
import { BUNDLED_FONT_NAMES, STUDIO_FONT_FACES, parseFontFile } from "../src/lib/studio/fonts";

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m }; };
function fakeCtx() {
  const calls = { fillText: [], drawImage: 0, fill: 0, stroke: 0, clip: [] };
  const state = { font: "10px X", globalAlpha: 1 };
  return new Proxy(state, {
    get(t, p) {
      if (p === "calls") return calls;
      if (p === "measureText") return (s) => ({ width: String(s).length * 10 });
      if (p === "createLinearGradient" || p === "createRadialGradient") return () => ({ addColorStop() {} });
      if (p === "fillText") return (s) => calls.fillText.push(String(s));
      if (p === "drawImage") return () => { calls.drawImage += 1; };
      if (p === "fill") return () => { calls.fill += 1; };
      if (p === "stroke") return () => { calls.stroke += 1; };
      if (p === "clip") return (r) => calls.clip.push(r || "nonzero");
      if (p in t) return t[p];
      return () => {};
    },
    set(t, p, v) { t[p] = v; return true; },
  });
}
const sources = [{ id: "c1", kind: "camera", name: "Sunucu Ahmet" }, { id: "c2", kind: "camera", name: "Konuk Mehmet" }];
const angles = [normalizeAngle({ id: "a1", layout: "duoCard", slots: ["c1", "c2"] }), normalizeAngle({ id: "a2", layout: "grid4", slots: ["c1", "c2", null, null] }), normalizeAngle({ id: "a3", layout: "solo", slots: ["c1"] })];
const data = { scope: { city: { label: "Ankara" } }, standings: { rows: [{ rank: 1, teamId: 1, teamName: "CAPITAL FC", played: 1, wins: 1, draws: 0, losses: 0, goalDiff: 3, points: 3, last5: "W" }] }, results: [{ id: 1, homeName: "A", awayName: "B", homeScore: 1, awayScore: 0, date: "2026-11-08", played: true }], live: [], fixtures: [], news: [], sponsors: [] };
const E0 = (T, extra = {}) => ({ T, M: (s) => String(s).length * 10, now: 5000, H: 1080, ...extra });

describe("panorama rejisi · tema modeli", () => {
  it("15+ yeni tasarlanmış tema (toplam 30); her tema okunur belirteçler ve bütün bölümleri üretir", () => {
    expect(THEMES.length).toBeGreaterThanOrEqual(30);
    const labels = THEMES.map((t) => t.label);
    expect(labels).toEqual(expect.arrayContaining(["Broadcast Classic", "Neon Gece", "Minimal Beyaz", "Spor kanalı", "Glass", "Retro", "Altın Lig", "Kırmızı Arena", "Siyah-Beyaz Editoryal", "Pastel", "Kurumsal Mavi", "Stadyum Işıkları", "Gradient Wave", "Dergi", "Teknoloji"]));
    expect(new Set(THEMES.map((t) => t.key)).size).toBe(THEMES.length);
    for (const t of THEMES) expect(THEME_GROUPS.map(([k]) => k)).toContain(t.group);
    for (const b of BUILTIN_BRANDS) {
      for (const k of Object.keys(STYLE_DEFAULTS)) expect(b[k], `${b.id}.${k}`).toBeTruthy();
      const T = brandTokens(b);
      expect(contrast(T.headText, T.head)).toBeGreaterThanOrEqual(3);
      expect(contrast(T.accentText, T.accent)).toBeGreaterThanOrEqual(3);
      expect(contrast(T.liveText, T.live)).toBeGreaterThanOrEqual(3);
      expect(T.frame.stroke).toMatch(/^#[0-9a-f]{6}$/);
      expect(T.tickerCfg.height).toBeGreaterThanOrEqual(40);
    }
    // Temalar birbirinden farklı: zemin / çerçeve / alt yazı / yazı tipi bileşimi.
    const sig = new Set(BUILTIN_BRANDS.map((b) => [b.bg.kind, b.bg.texture, b.bg.motion, b.frame.style, b.lower.style, b.ticker.style, b.fonts.display].join("|")));
    expect(sig.size).toBeGreaterThanOrEqual(26);
    // Tema seçenekleri gerçekten kullanılıyor (çeşitlilik).
    for (const [list, key] of [[FRAME_STYLES, (b) => b.frame.style], [LOWER_STYLES, (b) => b.lower.style], [TICKER_STYLES, (b) => b.ticker.style], [MOTIONS, (b) => b.bg.motion]]) {
      const used = new Set(BUILTIN_BRANDS.map(key));
      expect(used.size).toBeGreaterThanOrEqual(Math.min(list.length - 1, 7));
    }
  });
  it("tema yazı tipleri uygulamayla gelir (çevrimdışı): her temanın başlık yazı tipi gömülü ya da yaygın", () => {
    expect(BUNDLED_FONT_NAMES).toEqual(expect.arrayContaining(["Inter", "Barlow Condensed", "Oswald", "Bebas Neue", "Anton", "Montserrat", "Playfair Display", "Space Grotesk", "Exo 2", "Archivo Black", "Poppins", "Righteous", "DM Serif Display", "Teko", "Rajdhani"]));
    expect(parseFontFile("assets/fonts/dm-serif-display-latin-ext-400-normal.woff2")).toMatchObject({ family: "DM Serif Display", subset: "latin-ext", weight: "400" });
    expect(parseFontFile("x/bilinmeyen-latin-400-normal.woff2")).toBe(null);
    const fams = new Set(STUDIO_FONT_FACES.map((f) => f.family));
    for (const b of BUILTIN_BRANDS) if (b.fonts.display) expect(fams.has(b.fonts.display), b.fonts.display).toBe(true);
    // Türkçe harfler: her gömülü ailenin latin-ext yüzü var.
    for (const f of fams) expect(STUDIO_FONT_FACES.some((x) => x.family === f && /0100-02AF/.test(x.unicodeRange))).toBe(true);
  });
  it("doğrulama: bilinmeyen değer varsayılana / temaya düşer, sınırlar uygulanır", () => {
    const b = normalizeBrand({ theme: "neongece", bg: { kind: "lava", angle: 725, texture: "dots", textureOpacity: 9, motion: "beams" }, frame: { style: "kalp", width: 99, color: "mor", radius: 3 }, lower: { style: "hud", width: 2, y: -5, align: "yan" }, ticker: { style: "neon", position: "orta", height: 500, sep: "x", label: "X".repeat(40) }, live: { on: 1, text: "" }, watermark: { pos: "zz", anim: "spin" }, fonts: { weight: 450, tracking: 99 }, anim: { easing: "uçan", ms: 1 } });
    expect(b.bg).toEqual({ kind: "radial", angle: 5, texture: "dots", textureOpacity: 0.6, vignette: 0.6, motion: "beams", motionOpacity: 0.45 });
    expect(b.frame).toMatchObject({ style: "neon", width: 16, color: "accent", radius: 0.25 });
    expect(b.lower).toMatchObject({ style: "hud", width: 0.92, y: 30, align: "left" });
    expect(b.ticker).toMatchObject({ style: "neon", position: "bottom", height: 96, sep: "diamond" });
    expect(b.ticker.label).toHaveLength(24);
    expect(b.live).toMatchObject({ on: true, text: "CANLI" });
    expect(b.watermark).toMatchObject({ pos: "off", anim: "spin" });
    expect(b.fonts).toMatchObject({ weight: 800, tracking: 10, display: "Exo 2" });
    expect(b.anim).toMatchObject({ easing: "expo", ms: 150 });
  });
  it("göç: tur 3 profili (yeni bölümler yok, boş yazı tipi) temanın yeni stilleriyle tamamlanır; kimlik korunur", () => {
    const old = { id: "br_eski", name: "Kupa Gecesi", theme: "spor", title: "KUPA", colors: { primary: "#123456", accent: "#ff0000" }, fonts: { display: "", body: "" }, card: { radius: 9, opacity: 1, shadow: 10, glass: false, border: 0 }, header: { style: "bar", tagline: "" }, names: { style: "accent" }, ticker: { style: "split", label: "" }, clock: { style: "box" }, anim: { in: "wipe", out: "fade", ms: 500 }, watermark: { pos: "br", size: 120, opacity: 0.8, which: "logo" }, logo: { data: "data:image/png;base64,QQ==" } };
    const n = normalizeBrand(old);
    expect(n).toMatchObject({ id: "br_eski", name: "Kupa Gecesi", title: "KUPA", theme: "spor" });
    expect(n.colors).toMatchObject({ primary: "#123456", accent: "#ff0000", accent2: "#fafafa" });
    expect(n.card).toMatchObject({ radius: 9, head: "solid" });
    expect(n.fonts.display).toBe("Oswald"); // boş yazı tipi → temanınki
    expect(n.frame.style).toBe("bevel");
    expect(n.lower.style).toBe("sport");
    expect(n.watermark).toMatchObject({ pos: "br", size: 120, anim: "none" });
    expect(n.ticker).toMatchObject({ style: "split", position: "bottom" });
    expect(normalizeBrand(n)).toEqual(n); // kararlı
    // Kayıtlı hazır ayardaki eski tema anahtarı da çalışır.
    expect(findBrand([], "th_gece").name).toBe("Gece & altın");
  });
  it("dışa / içe aktarma (JSON) yeni bölümleri taşır; kopya / çoğalt bağımsız kimlik alır", () => {
    const b = copyBrand(findBrand([], "th_altinlig"), "Gala");
    const edited = normalizeBrand({ ...b, frame: { ...b.frame, style: "corners", width: 6 }, lower: { ...b.lower, style: "neon", align: "right" }, bg: { ...b.bg, motion: "bokeh" }, live: { on: true, style: "tag", pos: "tr", text: "YAYINDA" } });
    const file = JSON.parse(JSON.stringify(exportBrands([edited])));
    const r = parseBrandFile(JSON.stringify(file), []);
    expect(r.errors).toEqual([]);
    const back = r.brands[0];
    for (const k of ["frame", "lower", "bg", "live", "ticker", "clock", "fonts", "anim", "card", "titleCard", "watermark", "colors"]) expect(back[k], k).toEqual(edited[k]);
    // aynı kimlik varsa ezilmez
    const r2 = parseBrandFile(JSON.stringify(file), [edited]);
    expect(r2.brands[0].id).not.toBe(edited.id);
    expect(copyBrand(edited).id).not.toBe(edited.id);
  });
  it("yumuşatma eğrileri: uçlarda 0 ve 1; geri sekme / esnek 1'i aşar", () => {
    for (const k of ["smooth", "snappy", "expo", "bounce", "elastic", "linear"]) { expect(ease(k, 0)).toBeCloseTo(0, 5); expect(ease(k, 1)).toBeCloseTo(1, 3); }
    expect(Math.max(...[0.5, 0.6, 0.7, 0.8].map((p) => ease("bounce", p)))).toBeGreaterThan(1);
    expect(ease("linear", 0.3)).toBeCloseTo(0.3, 5);
    expect(graphicPhase(1000, 1000, null, 500).k).toBeCloseTo(0, 5);
    expect(graphicPhase(2000, 1000, null, 500).k).toBe(1);
    expect(graphicPhase(2100, 1000, 2000, 500).out).toBe(true);
    expect(graphicPhase(2600, 1000, 2000, 500)).toBe(null);
  });
  it("düzenleyici tablosu: her alan şemadaki bir bölüme ve geçerli seçeneklere bağlı", () => {
    for (const s of EDITOR_SECTIONS) {
      expect(STYLE_DEFAULTS[s.key], s.key).toBeTruthy();
      for (const [field, , type, opts] of s.fields) {
        expect(field in STYLE_DEFAULTS[s.key] || s.key === "card", `${s.key}.${field}`).toBe(true);
        if (type === "select") expect(opts.length).toBeGreaterThan(1);
      }
    }
  });
});

describe("panorama rejisi · her hazır tema bütün öğeleri çizer", () => {
  const gfx = normalizeGfx({ lowers: [{ id: "l1", kind: "name", title: "Ahmet Yılmaz", subtitle: "Teknik direktör", kicker: "KONUK", number: "10" }], titles: [{ id: "t1", kind: "countdown", title: "FİNAL", target: "2030-01-01T20:00" }], lowerOn: { id: "l1", at: 1000 }, titleOn: null, live: true, tickerItems: [{ text: "Elle yazılan bant öğesi" }] });
  it("zemin + hareket + çerçeve + künye + kart + bant + saat + rozet + alt yazı (30 tema × 3 açı)", () => {
    for (const b of BUILTIN_BRANDS) {
      const snap = buildPanoramaSnapshot({ brand: { ...b, title: "PANORAMA GECESİ", logo: { data: "data:image/png;base64,QQ==" } }, angles, sources, card: makeCard("standings", { id: "k" }), cardSince: 1, data, ticker: { on: true, sources: ["results"] }, gfx });
      expect(snap.panorama.lower.item.title).toBe("Ahmet Yılmaz");
      expect(snap.panorama.ticker.items[0]).toBe("Elle yazılan bant öğesi");
      expect(snap.panorama.live).toBe(true);
      for (const sid of ["a1", "a2", "a3"]) {
        const ctx = fakeCtx();
        expect(() => drawPanorama(ctx, { width: 1920, height: 1080, now: 9000, sceneId: sid }, snap), `${b.id}/${sid}`).not.toThrow();
        const txt = ctx.calls.fillText.join(" | ");
        expect(ctx.calls.fillText.join(""), `${b.id}/${sid} alt yazı`).toMatch(/AHMET YILMAZ|Ahmet Yılmaz/);
        expect(ctx.calls.fillText.join(""), `${b.id}/${sid} rozet`).toContain(b.live.text); // harf aralıklı: harf harf
        if (b.header.style !== "off") expect(txt).toContain("PANORAMA GECESİ");
        if (sid !== "a3") expect(txt).toContain("Elle yazılan bant öğesi");
      }
      const bg = fakeCtx();
      expect(() => paintBackground(bg, brandTokens(b), 1920, 1080)).not.toThrow();
    }
  });
  it("her alt yazı biçimi × hizalama, her bant biçimi × üst / alt, her çerçeve, her hareket, her doku hatasız", () => {
    const base = findBrand([], "th_broadcast");
    for (const style of LOWER_STYLES.map(([k]) => k)) for (const align of ["left", "center", "right"]) {
      const T = brandTokens(normalizeBrand({ ...base, lower: { ...base.lower, style, align } }));
      const ctx = fakeCtx();
      drawLower(ctx, { item: { kind: "name", title: "Ayşe Demir", subtitle: "Sunucu", kicker: "SUNUCU", number: "7", color: "#22c55e" }, at: 1, hideAt: null }, E0(T));
      expect(ctx.calls.fillText.join(""), `${style}/${align}`).toMatch(/AYŞE DEMİR|Ayşe Demir/);
    }
    for (const style of TICKER_STYLES.map(([k]) => k)) for (const position of ["top", "bottom"]) {
      const T = brandTokens(normalizeBrand({ ...base, ticker: { ...base.ticker, style, position, label: "SON DAKİKA" } }));
      const ctx = fakeCtx();
      drawTickerThemed(ctx, { items: ["Bir", "İki"], label: "SON DAKİKA", speed: 100 }, E0(T), tickerShift);
      expect(ctx.calls.fillText.join("|")).toContain("Bir");
    }
    const slots = [{ x: 100, y: 100, w: 600, h: 340 }, { x: 800, y: 100, w: 300, h: 300, mask: "circle" }];
    for (const style of FRAME_STYLES.map(([k]) => k)) {
      const T = brandTokens(normalizeBrand({ ...base, frame: { ...base.frame, style } }));
      const ctx = fakeCtx();
      drawFrames(ctx, T, E0(T), slots);
      if (style !== "none") expect(ctx.calls.stroke + ctx.calls.fill, style).toBeGreaterThan(0);
    }
    for (const motion of MOTIONS.map(([k]) => k)) for (const texture of TEXTURES.map(([k]) => k)) {
      const T = brandTokens(normalizeBrand({ ...base, bg: { ...base.bg, motion, texture, motionOpacity: 0.5 } }));
      const ctx = fakeCtx();
      drawAmbient(ctx, T, E0(T), slots);
      if (motion !== "none") expect(ctx.calls.clip).toContain("evenodd"); // kamera kutuları delik
      expect(() => paintBackground(fakeCtx(), T, 320, 180)).not.toThrow();
    }
  });
  it("tam ekran kartlar: başlık, geri sayım, ara, sosyal medya × 5 biçim; CANLI rozeti 5 biçim", () => {
    const T0 = brandTokens(findBrand([], "th_neongece"));
    for (const style of ["center", "left", "split", "poster", "minimal"]) for (const kind of ["title", "countdown", "break", "social"]) {
      const ctx = fakeCtx();
      drawTitleCard(ctx, { item: { kind, title: "BAŞLIYORUZ", subtitle: "Az sonra", target: new Date(Date.now() + 3723000).toISOString(), handles: [{ platform: "instagram", handle: "@elitlig" }], style }, at: 1 }, E0(T0));
      const t = ctx.calls.fillText.join("");
      expect(t, `${style}/${kind}`).toContain("BAŞLIYORUZ");
      if (kind === "social") expect(t).toContain("@elitlig");
      if (kind === "countdown") expect(t).toMatch(/01:02:0\d/);
    }
    expect(countdownText("2026-01-02T00:00:00Z", Date.parse("2026-01-01T00:00:00Z"))).toBe("1g 00:00:00");
    for (const style of ["box", "dot", "pill", "tag", "blink"]) for (const pos of ["tl", "tr", "bl", "br"]) {
      const T = brandTokens(normalizeBrand({ ...findBrand([], "th_broadcast"), live: { on: true, style, pos, text: "YAYINDA" } }));
      const ctx = fakeCtx();
      drawLiveBug(ctx, T, E0(T), true);
      expect(ctx.calls.fillText.join("")).toContain("YAYINDA");
    }
  });
});

describe("panorama rejisi · yazı bantları", () => {
  it("alt yazı: göster / değiştir / gizle (çıkış hareketi), otomatik gizle, sıradaki, oynatma listesi", () => {
    let g = defaultGfx();
    expect(g.lowers.length).toBeGreaterThanOrEqual(4);
    expect(g.lowers.map((x) => x.key)).toEqual(["Q", "W", "E", "R"]);
    g = showLower(g, "lt_host", 1000);
    expect(gfxSnapshot(g).lower.item.id).toBe("lt_host");
    g = toggleLower(g, "lt_guest", 1100);
    expect(g.lowerOn).toMatchObject({ id: "lt_guest", at: 1100, hideAt: null });
    g = toggleLower(g, "lt_guest", 1200);
    expect(g.lowerOn.hideAt).toBe(1200);
    g = tickGfx(g, 1500, 600);
    expect(g.lowerOn).not.toBe(null); // çıkış sürüyor
    g = tickGfx(g, 1900, 600);
    expect(g.lowerOn).toBe(null);
    // otomatik gizle (sn)
    g = { ...g, lowers: g.lowers.map((x) => (x.id === "lt_info" ? { ...x, sec: 3 } : x)) };
    g = showLower(g, "lt_info", 10_000);
    expect(tickGfx(g, 12_000).lowerOn.hideAt).toBe(null);
    expect(tickGfx(g, 13_000).lowerOn.hideAt).toBe(13_000);
    expect(nextLower(g, 20_000).lowerOn.id).toBe("lt_social");
    // oynatma listesi: süre dolunca gizler, aradan sonra sıradakini gösterir
    let p = playLowers({ ...g, lowers: g.lowers.map((x) => ({ ...x, sec: 2 })), auto: { ...g.auto, gap: 1 } }, true, 0);
    expect(p.lowerOn.id).toBe("lt_host");
    p = tickGfx(p, 2000); p = tickGfx(p, 2700); expect(p.lowerOn).toBe(null);
    p = tickGfx(p, 3800); expect(p.lowerOn.id).toBe("lt_guest");
    expect(hideLower(p, 4000).auto.on).toBe(false);
  });
  it("tam ekran kart, bant kuyruğu, CANLI; içerikten alt yazı; kalıcı kayda geçici durum yazılmaz", () => {
    let g = normalizeGfx({ tickerItems: [{ text: "Bir" }, { text: "İki", on: false }, { text: "  " }] });
    expect(manualTickerTexts(g)).toEqual(["Bir"]);
    g = showTitle(g, "tc_break", 50);
    expect(gfxSnapshot(g).title.item.kind).toBe("break");
    expect(lowerFromContent("match", { homeName: "A", awayName: "B", homeScore: 2, awayScore: 1, played: true })).toMatchObject({ kind: "info", kicker: "SONUÇ", title: "A 2-1 B" });
    expect(lowerFromContent("player", { name: "Doğukan", teamName: "X", goals: 9 }).subtitle).toBe("X · 9 gol");
    const st = mem();
    savePanoramaState(st, normalizePanoramaState({ angles, sources, gfx: { ...g, live: true }, media: { items: [{ id: "m1", kind: "image", url: "elitlig-studio://media/a.png" }], overlay: { id: "m1", at: 5 } }, programId: "md_m1" }));
    const saved = JSON.parse(st.getItem("studio.panorama.v1"));
    expect(saved.gfx.titleOn).toBe(null);
    expect(saved.media.overlay).toBe(null);
    expect(saved.programId).toBe(null);
    expect(saved.media.items).toHaveLength(1);
  });
});

describe("panorama rejisi · medya kutusu", () => {
  const items = [
    { id: "img1", kind: "image", name: "Afiş", url: "elitlig-studio://media/x/afis.png" },
    { id: "vid1", kind: "video", name: "Tanıtım", url: "elitlig-studio://media/x/tanitim.mp4", inSec: 2, outSec: 9, volume: 0.6 },
    { id: "web1", url: "https://example.com/klip.webm" },
    { id: "blob", kind: "video", url: "blob:abc" },
  ];
  it("öğeler süzülür (kalıcı adres; tür adresten), giriş / çıkış noktası", () => {
    const s = addItems({}, items);
    expect(s.items.map((x) => x.id)).toEqual(["img1", "vid1", "web1"]);
    expect(s.items[2]).toMatchObject({ kind: "video", name: "klip.webm", loop: true });
    expect(kindFromUrl("https://x/y.JPG?v=1")).toBe("image");
    expect(normalizeMediaItem({ url: "https://x/y", kind: "?" })).toBe(null);
    const v = s.items[1];
    expect(inOutStep(v, 0)).toEqual({ seek: 2, stop: false });
    expect(inOutStep(v, 5)).toEqual({ seek: null, stop: false });
    expect(inOutStep(v, 9.1)).toEqual({ seek: 2, stop: false }); // döngü
    expect(inOutStep({ ...v, loop: false }, 9.1)).toEqual({ seek: null, stop: true });
  });
  it("tam ekran: önizleme / programdaki öğenin sahnesi + kaynağı; yalnız kullanılan öğeler açılır", () => {
    const M = addItems({}, items);
    const cfg = buildPanoramaScenes({ sources, angles, programId: "a1", previewId: mediaSceneId("vid1"), mediaBin: M });
    expect(cfg.previewSceneId).toBe("md_vid1");
    const sc = cfg.scenes.find((x) => x.id === "md_vid1");
    expect(sc.layers.map((l) => l.sourceId)).toEqual([MEDIA_BLACK_ID, mediaSourceId("vid1")]);
    expect(cfg.sources.map((x) => x.id)).toEqual(expect.arrayContaining([MEDIA_BLACK_ID, "pano_md_vid1"]));
    expect(cfg.sources.some((x) => x.id === "pano_md_img1")).toBe(false);
    expect(isMediaScene("md_x")).toBe(true);
    expect(itemOfScene(M, "md_vid1").name).toBe("Tanıtım");
    expect([...activeMediaIds(M, { programId: "md_img1" })]).toEqual(["img1"]);
    // sıcak öğe: yayından çıksa da kaynağı açık kalır (yeniden yayına soğuk açılmaz); bilinmeyen atlanır
    expect([...activeMediaIds(M, { warm: ["vid1", "yok"] })]).toEqual(["vid1"]);
    expect(buildPanoramaScenes({ sources, angles, mediaBin: M, mediaWarm: ["vid1"] }).sources.some((x) => x.id === "pano_md_vid1")).toBe(true);
  });
  it("PiP / üst katman bütün açıların üstünde (giriş-çıkış geçişiyle); yuva kameranın yerine", () => {
    let M = addItems({}, items);
    M = showOverlay(M, "img1", { mode: "pip", pip: "tr", fx: "zoom", ms: 300 }, 1000);
    let cfg = buildPanoramaScenes({ sources, angles, programId: "a1", mediaBin: M });
    for (const sc of cfg.scenes) expect(sc.layers.at(-1)).toMatchObject({ sourceId: "pano_md_img1", showFx: { kind: "zoom", ms: 300 }, visible: true, visibleAt: 1000, x: 0.64, y: 0.12 });
    M = hideOverlay(M, 2000);
    cfg = buildPanoramaScenes({ sources, angles, programId: "a1", mediaBin: M });
    expect(cfg.scenes[0].layers.at(-1)).toMatchObject({ visible: false, visibleAt: 2000 });
    expect(tickMedia(M, 2100).overlay).not.toBe(null);
    expect(tickMedia(M, 2400).overlay).toBe(null);
    M = setSlot(tickMedia(M, 2400), "a1", 1, "vid1");
    cfg = buildPanoramaScenes({ sources, angles, programId: "a1", mediaBin: M });
    expect(cfg.scenes[0].layers.map((l) => l.sourceId)).toEqual(["pano_bg", "c1", "pano_md_vid1"]);
    expect(sceneBoxes(angles, sources).a1.slots).toHaveLength(2);
    M = removeItem(M, "vid1");
    expect(M.slots).toEqual({});
    expect(normalizeMediaState({ items: M.items, overlay: { id: "yok" } }).overlay).toBe(null);
  });
  it("tema çerçevesi sahne katmanına: 'ince çizgi' kenarlık, diğer biçimler grafik katmanında; zemin görseli", () => {
    const T = brandTokens(findBrand([], "th_neongece"));
    const cfg = buildPanoramaScenes({ sources, angles, theme: T, bgImage: "data:image/jpeg;base64,AAAA" });
    expect(cfg.sources[0]).toMatchObject({ id: "pano_bg", kind: "image", url: "data:image/jpeg;base64,AAAA" });
    expect(cfg.scenes[0].layers[1].border).toBeUndefined();
    expect(cfg.scenes[0].layers[1].radius).toBeCloseTo(0.03, 4);
    const L = brandTokens(findBrand([], "th_broadcast"));
    const cfg2 = buildPanoramaScenes({ sources, angles, theme: L });
    expect(cfg2.scenes[0].layers[1].border).toEqual({ width: 3, color: "#ffffff" });
    const snap = buildPanoramaSnapshot({ brand: findBrand([], "th_neongece"), angles, sources, card: null, data, gfx: normalizeGfx({ lowers: [{ id: "x", title: "T", logo: "https://x/l.png" }], lowerOn: { id: "x", at: 1 } }) });
    expect(panoramaImageUrls(snap.panorama)).toContain("https://x/l.png");
  });
});

describe("panorama rejisi · sahne / geçiş durumu, kısayollar, butonlar", () => {
  it("GEÇİŞ planı: seçili tür, sahneye özel geçiş, KES zorlaması; sonra değiş tokuş", () => {
    const msOf = (k) => ({ fade: 400, wipe: 650 }[k] || 500);
    expect(planTake({ programId: "a", previewId: "a" }, { kind: "fade", msOf })).toBe(null);
    expect(planTake({ programId: "a", previewId: "b" }, { kind: "fade", msOf })).toEqual({ from: "a", to: "b", kind: "fade", ms: 400 });
    let regi = setSceneSetting(normalizeRegi({}), "b", { transition: { kind: "wipe", ms: 1200 }, lower: "lt_host", key: "F2" });
    expect(planTake({ programId: "a", previewId: "b" }, { kind: "fade", msOf, sceneSettings: regi.scenes })).toEqual({ from: "a", to: "b", kind: "wipe", ms: 1200 });
    expect(planTake({ programId: "a", previewId: "b" }, { kind: "fade", msOf, sceneSettings: regi.scenes, force: "cut" })).toMatchObject({ kind: "cut", ms: 0 });
    const plan = planTake({ programId: "a", previewId: "b" }, { kind: "fade", msOf });
    expect(afterTake({ programId: "a", previewId: "b" }, plan)).toEqual({ programId: "b", previewId: "a" });
    expect(sceneForKey(regi, "F2")).toBe("b");
    regi = setSceneSetting(regi, "b", { transition: null, lower: "", key: "" });
    expect(regi.scenes.b).toBeUndefined();
    expect(setSceneSetting(normalizeRegi({}), "c", { key: "5" }).scenes.c).toBeUndefined(); // rakamlar açılara ayrılmış
  });
  it("kısayollar: varsayılanlar, yeniden eşleme, çakışma uyarısı, tuş adı", () => {
    expect(HOTKEY_ACTIONS.length).toBeGreaterThanOrEqual(12);
    expect(actionForKey("Space")).toBe("take");
    expect(actionForKey("Enter")).toBe("take");
    expect(actionForKey("C")).toBe("cut");
    expect(actionForKey("C", { cut: "X" })).toBe(null);
    expect(actionForKey("X", { cut: "X" })).toBe("cut");
    const c = hotkeyConflicts({ ticker: "Q" }, [{ key: "Q", label: "Alt yazı: Sunucu" }, { key: "1", label: "Sahne" }]);
    expect(c.map((x) => x.key).sort()).toEqual(["1", "Q"]);
    expect(keyName({ key: " ", code: "Space" })).toBe("Space");
    expect(keyName({ key: "ş", code: "KeyS" })).toBe("S");
    expect(keyName({ key: "F5", code: "F5" })).toBe("F5");
    const r = normalizeRegi({ hotkeys: { take: "Enter", cut: "??" }, safe: { on: 1, bogus: true }, buttonCols: 99 });
    expect(r.hotkeys).toEqual({ take: "Enter", cut: "" });
    expect(r.safe).toMatchObject({ on: true, action: true });
    expect(r.safe.bogus).toBeUndefined();
    expect(r.buttonCols).toBe(8);
  });
  it("buton ızgarası: varsayılan durumdan; geçersiz tür atılır", () => {
    const btns = defaultButtons({ angles, lowers: defaultGfx().lowers, titles: defaultGfx().titles });
    expect(btns.filter((b) => b.type === "scene")).toHaveLength(3);
    expect(btns.filter((b) => b.type === "lower")).toHaveLength(4);
    expect(btns[0]).toMatchObject({ type: "take" });
    expect(normalizeRegi({ buttons: [{ type: "uçur" }, { type: "media", ref: "m1", label: "Afiş", color: "#e11d48" }] }).buttons).toEqual([expect.objectContaining({ type: "media", ref: "m1", label: "Afiş", color: "#e11d48" })]);
  });
  it("hazır ayar (gösteri) bütün yapılandırmayı taşır: tema, açılar, yazı bantları, medya, reji; eski hazır ayar değişmiş sayılmaz", () => {
    const st = normalizePanoramaState({ angles, sources, brandId: "th_pastel", gfx: { lowers: [{ id: "x", title: "Özel" }], lowerOn: { id: "x", at: 9 } }, media: { items: [items0()] }, regi: { buttons: [{ type: "take" }], scenes: { a1: { key: "F1" } } } });
    const pr = presetFromState("Cuma gecesi", st);
    expect(pr.gfx.lowerOn).toBe(null);
    expect(pr.media.items).toHaveLength(1);
    expect(pr.regi.scenes.a1.key).toBe("F1");
    const other = normalizePanoramaState({ angles, sources });
    const applied = applyPreset(other, pr, { now: 1 });
    expect(applied.brandId).toBe("th_pastel");
    expect(applied.gfx.lowers[0].title).toBe("Özel");
    expect(applied.media.items[0].name).toBe("Afiş");
    expect(applied.regi.buttons).toHaveLength(1);
    expect(presetDirty(applied, pr)).toBe(false);
    expect(presetDirty({ ...applied, gfx: { ...applied.gfx, lowers: [] } }, pr)).toBe(true);
    const old = { ...pr }; delete old.gfx; delete old.media; delete old.regi;
    expect(presetDirty(applyPreset(other, old, { now: 1 }), old)).toBe(false);
  });
});
function items0() { return { id: "img1", kind: "image", name: "Afiş", url: "elitlig-studio://media/x/afis.png" }; }
