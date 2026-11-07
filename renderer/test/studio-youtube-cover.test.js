// @vitest-environment jsdom
//
// YouTube kapağı: şablonlar ve ayarlar, kapak verisi (maç + armalar + marka),
// takım rengi (arma baskın rengi), JPEG bütçesi (< 2 MB), altı şablonun çizimi
// (sahte tuvalle: hata yok, armalar / logo / zemin çizilir, yazılar Türkçe büyük
// harf), yükleme gövdesi, otomatik yükleme (yayın başına bir kez) ve
// Ayarlar › YouTube kapağı bölümü.
import React from "react";
import { createRoot } from "react-dom/client";
import {
  COVER_FIELDS, COVER_TEMPLATES, DEFAULT_COVER_SETTINGS, SAMPLE_COVER_DATA, buildCoverData, competitionLine, coverErrorHint,
  dataUrlBytes, dominantColor, encodeUnderBudget, initialsOf, normalizeCoverSettings, resolveCoverColors, trDateParts, whenLine, whereLine,
} from "../src/lib/studio/cover/model";
import { TEMPLATE_DRAWERS, drawCover } from "../src/lib/studio/cover/draw";
import { SETTINGS_SECTIONS } from "../src/views/studio/settings/SettingsPage";

vi.mock("../src/lib/studio/cover/render", async (importOriginal) => ({
  ...(await importOriginal()),
  // jsdom'da tuval yok: JPEG üretimi sahte (yükleme akışı sınanır).
  renderCoverJpeg: vi.fn(async () => ({ dataUrl: "data:image/jpeg;base64,/9j/AAAA", bytes: 6, quality: 0.92, width: 1280, height: 720 })),
}));

const { act } = React;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const h = React.createElement;
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

/** Çağrıları kaydeden sahte 2B bağlam. */
function fakeCtx() {
  const calls = [];
  const texts = [];
  const images = [];
  const gradient = () => ({ addColorStop: () => {} });
  const state = { font: "10px sans-serif" };
  const ctx = new Proxy(state, {
    get(target, key) {
      if (key in target) return target[key];
      if (key === "measureText") return (t) => { const px = Number(/(\d+(?:\.\d+)?)px/.exec(target.font)?.[1] || 10); return { width: String(t).length * px * 0.56 }; };
      if (key === "createLinearGradient" || key === "createRadialGradient") return gradient;
      if (key === "fillText" || key === "strokeText") return (t) => { texts.push(String(t)); calls.push(key); };
      if (key === "drawImage") return (img) => { images.push(img); calls.push(key); };
      return (...args) => { calls.push(String(key)); return args.length ? undefined : undefined; };
    },
    set(target, key, value) { target[key] = value; return true; },
  });
  return { ctx, calls, texts, images };
}
const img = (name, w = 200, h = 200) => ({ name, naturalWidth: w, naturalHeight: h, width: w, height: h });
const joined = (texts) => texts.join("");

const MATCH = { id: 7, first_team_name: "Şahinler SK", second_team_name: "Kurtlar", league_name: "Süper Lig", match_season: "2026 Güz", date: "2026-11-20", time: "21:00:00", match_field: "Arena Halı Saha", city: "Ankara" };

describe("kapak modeli", () => {
  it("altı şablon, varsayılanlar ve ayar doğrulama", () => {
    expect(COVER_TEMPLATES.map((t) => t.key)).toEqual(["klasik", "stadyum", "capraz", "minimal", "neon", "poster"]);
    expect(Object.keys(TEMPLATE_DRAWERS).sort()).toEqual(COVER_TEMPLATES.map((t) => t.key).sort());
    expect(DEFAULT_COVER_SETTINGS.auto).toBe(true);
    const s = normalizeCoverSettings({ template: "yok", accentMode: "x", customColor: "zz", backgroundDim: 400, show: { venue: false, foo: true }, liveLabel: "   ", background: "javascript:alert(1)" });
    expect(s.template).toBe("klasik");
    expect(s.accentMode).toBe("team");
    expect(s.customColor).toBe("#a855f7");
    expect(s.backgroundDim).toBe(95);
    expect(s.show.venue).toBe(false);
    expect(s.show.league).toBe(true);
    expect(Object.keys(s.show)).toEqual(COVER_FIELDS.map((f) => f.key));
    expect(s.liveLabel).toBe("CANLI");
    expect(s.background).toBe(null);
    expect(normalizeCoverSettings({ background: "https://cdn.x/a.jpg" }).background).toBe("https://cdn.x/a.jpg");
    expect(normalizeCoverSettings({ auto: false }).auto).toBe(false);
  });

  it("kapak verisi: adlar, baş harfler, tarih (gün adıyla), lig · sezon, saha", () => {
    const d = buildCoverData({ match: MATCH, logos: { home: "https://cdn/a.png" }, branding: { brandName: "CCL CUP", logoUrl: "https://cdn/l.png", extras: { awayColor: "#00ff00" } } });
    expect(d.home).toMatchObject({ name: "Şahinler SK", initials: "ŞAH", logo: "https://cdn/a.png" });
    expect(d.away).toMatchObject({ name: "Kurtlar", initials: "KUR", logo: null, fallbackColor: "#00ff00" });
    expect(d.date).toBe("20 Kasım 2026");
    expect(d.day).toBe("Cuma");
    expect(d.time).toBe("21:00");
    expect(d.brand).toMatchObject({ name: "CCL CUP", logo: "https://cdn/l.png" });
    expect(competitionLine(d)).toBe("Süper Lig · 2026 Güz");
    expect(competitionLine({ ...d, season: "Süper Lig 2026 Güz" })).toBe("Süper Lig 2026 Güz");
    expect(competitionLine(d, { ...DEFAULT_COVER_SETTINGS.show, season: false })).toBe("Süper Lig");
    expect(whenLine(d)).toBe("20 Kasım 2026 Cuma · 21:00");
    expect(whenLine(d, { ...DEFAULT_COVER_SETTINGS.show, date: false })).toBe("21:00");
    expect(whereLine(d)).toBe("Arena Halı Saha, Ankara");
    expect(whereLine(d, { ...DEFAULT_COVER_SETTINGS.show, city: false })).toBe("Arena Halı Saha");
    expect(initialsOf("Ankara Gençlikspor")).toBe("AG");
    expect(initialsOf("ılgaz spor kulübü")).toBe("ILG");
    expect(initialsOf("")).toBe("?");
    expect(trDateParts("2026-02-29").text).toBe("29 Şubat 2026");
    const empty = buildCoverData({ match: { first_team_name: "none", date: null } });
    expect(empty.home.name).toBe("Ev sahibi");
    expect(empty.date).toBe("");
  });

  it("arma baskın rengi ve kapak renkleri (yakın takım renkleri ayrıştırılır)", () => {
    // 8 kırmızı, 3 beyaz, 2 saydam piksel → kırmızı.
    const px = [];
    for (let i = 0; i < 8; i += 1) px.push(220, 20, 30, 255);
    for (let i = 0; i < 3; i += 1) px.push(255, 255, 255, 255);
    for (let i = 0; i < 2; i += 1) px.push(0, 0, 255, 0);
    const c = dominantColor(new Uint8ClampedArray(px));
    expect(c).toMatch(/^#[0-9a-f]{6}$/);
    expect(parseInt(c.slice(1, 3), 16)).toBeGreaterThan(180);
    expect(dominantColor(new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255]))).toBe(null);

    const d = buildCoverData({ match: MATCH, colors: { home: "#d01020", away: "#c01828" } });
    const col = resolveCoverColors(d, { accentMode: "team" });
    expect(col.home).not.toBe(col.away);
    const custom = resolveCoverColors(d, { accentMode: "custom", customColor: "#00a86b" });
    expect(custom.accent).toMatch(/^#/);
    expect(custom.home).toBe(custom.accent);
    expect(resolveCoverColors(SAMPLE_COVER_DATA, { accentMode: "brand" }).accent).toMatch(/^#/);
  });

  it("JPEG bütçesi: 2 MB altına inen ilk kalite; inemezse anlamlı hata", () => {
    const sizes = { 0.92: 2_500_000, 0.88: 2_100_000, 0.82: 1_500_000 };
    const fake = (q) => `data:image/jpeg;base64,${"A".repeat(Math.ceil(((sizes[q] ?? 900_000) * 4) / 3))}`;
    const out = encodeUnderBudget(fake);
    expect(out.quality).toBe(0.82);
    expect(out.bytes).toBeLessThan(2 * 1024 * 1024);
    expect(dataUrlBytes("data:image/jpeg;base64,QUJD")).toBe(3);
    expect(() => encodeUnderBudget(() => `data:x;base64,${"A".repeat(4_000_000)}`)).toThrow(/2 MB/);
    expect(coverErrorHint("YOUTUBE_THUMBNAIL_NOT_ALLOWED")).toMatch(/youtube\.com\/verify/);
    expect(coverErrorHint("YOUTUBE_SCOPE_MISSING")).toMatch(/yeniden bağlayın/);
  });
});

describe("kapak çizimi", () => {
  const data = buildCoverData({ match: MATCH, brandLogo: "x" });
  for (const t of COVER_TEMPLATES) {
    it(`${t.label}: armalar, marka logosu, adlar, lig, saat ve CANLI çizilir`, () => {
      const { ctx, texts, images } = fakeCtx();
      const home = img("home"); const away = img("away"); const brand = img("brand", 240, 240);
      drawCover(ctx, data, { template: t.key }, { home, away, brand });
      const all = joined(texts);
      expect(images).toContain(home);
      expect(images).toContain(away);
      expect(images).toContain(brand);
      expect(all).toMatch(/Şahinler|ŞAHİNLER/);
      expect(all).toMatch(/Kurtlar|KURTLAR/);
      expect(all).toMatch(/S[ÜU]PER L[İI]G|Süper Lig/i);
      expect(all).toMatch(/2026 GÜZ|2026 Güz/);
      expect(all).toContain("21:00");
      expect(all).toContain("CANLI");
    });
  }

  it("arma yoksa baş harf rozeti; gizlenen alanlar ve marka çizilmez; zemin fotoğrafı kullanılır", () => {
    const { ctx, texts, images } = fakeCtx();
    const bg = img("bg", 1920, 1080);
    const show = Object.fromEntries(COVER_FIELDS.map((f) => [f.key, !["live", "brand", "venue"].includes(f.key)]));
    drawCover(ctx, data, { template: "klasik", show, background: "https://cdn/bg.jpg" }, { bg, brand: img("brand") });
    const all = joined(texts);
    expect(all).toContain("ŞAH");
    expect(all).toContain("KUR");
    expect(all).not.toContain("CANLI");
    expect(all).not.toContain("Arena");
    expect(images.map((i) => i.name)).toEqual(["bg"]);
  });

  it("marka logosu yüklenemezse marka adı yazılır; uzun takım adı sığdırılır", () => {
    const { ctx, texts } = fakeCtx();
    const long = buildCoverData({ match: { ...MATCH, first_team_name: "Çok Uzun Adlı Büyükşehir Belediyesi Gençlik ve Spor Kulübü" }, branding: { brandName: "CCL CUP" } });
    drawCover(ctx, long, { template: "neon" }, {});
    expect(joined(texts)).toContain("CCL CUP");
    expect(texts.some((t) => t.endsWith("…") || /BELED/.test(t))).toBe(true);
  });
});

/* ------------------------------ arayüz ------------------------------ */

function mount(el) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(el));
  return { host, root, unmount: () => { act(() => root.unmount()); host.remove(); } };
}

describe("kapak arayüzü", () => {
  afterEach(() => { delete window.elitlig; try { localStorage.clear(); } catch { /* yoksay */ } });

  it("Ayarlar › Genel'de YouTube kapağı bölümü; şablon seçimi kalıcı", async () => {
    expect(SETTINGS_SECTIONS.find((s) => s.key === "kapak")).toMatchObject({ label: "YouTube kapağı", group: "genel" });
    const { default: CoverSection } = await import("../src/views/studio/youtube/cover/CoverSection");
    const { getCoverSettings } = await import("../src/views/studio/youtube/cover/coverStore");
    const { host, unmount } = mount(h(CoverSection, { toast: () => {} }));
    await flush();
    const tiles = [...host.querySelectorAll(".yc-tpl")];
    expect(tiles.map((b) => b.textContent.trim())).toEqual(COVER_TEMPLATES.map((t) => t.label));
    act(() => tiles[4].click());
    expect(getCoverSettings().template).toBe("neon");
    expect(JSON.parse(localStorage.getItem("elitlig.studio.youtubeCover.v1")).template).toBe("neon");
    expect(host.textContent).toContain("Yayın başlarken kapağı otomatik ayarla");
    const auto = [...host.querySelectorAll(".st-switchrow")].find((l) => l.textContent.includes("otomatik")).querySelector("input");
    expect(auto.checked).toBe(true);
    act(() => auto.click());
    expect(getCoverSettings().auto).toBe(false);
    unmount();
  });

  it("otomatik kapak: yayın açılınca bir kez üretilir ve yüklenir; hata bildiriminde 'Tekrar dene'", async () => {
    const store = await import("../src/views/studio/youtube/cover/coverStore");
    store.setCoverSettings({ auto: true, siteCover: false, template: "poster" });
    const posts = [];
    let fail = true;
    window.elitlig = {
      request: async (o) => {
        if (o.method === "POST" && /\/thumbnail$/.test(o.path)) {
          posts.push(o);
          if (fail) return { ok: false, error: { status: 409, code: "YOUTUBE_THUMBNAIL_NOT_ALLOWED", message: "Kanal doğrulanmamış." } };
          return { ok: true, data: { ok: true, cover: { stored: false } } };
        }
        if (/\/snapshot$/.test(o.path)) return { ok: true, data: { teams: { home: { name: "A", logo: null }, away: { name: "B", logo: null } } } };
        if (/overlay-branding$/.test(o.path)) return { ok: true, data: { branding: { brandName: "ELİT LİG" } } };
        return { ok: true, data: { id: 3, first_team_name: "A", second_team_name: "B" } };
      },
    };
    const { useAutoCover } = await import("../src/views/studio/youtube/cover/useCoverUpload");
    const toasts = [];
    let api = null;
    const yt = { stream: { broadcast_id: "bc1" } };
    function Probe() { api = useAutoCover({ yt, matchId: 3, match: { id: 3, first_team_name: "A", second_team_name: "B" }, toast: (m, o) => toasts.push({ m, o }) }); return null; }
    const { unmount } = mount(h(Probe));
    await act(async () => { api.afterStart(); });
    await flush(); await flush();
    expect(posts).toHaveLength(1);
    expect(posts[0].path).toBe("/api/admin/live-streams/matches/3/thumbnail");
    expect(posts[0].body).toEqual({ image: "data:image/jpeg;base64,/9j/AAAA", set_match_picture: false });
    const err = toasts.find((t) => t.o?.tone === "error");
    expect(err.m).toMatch(/Kapak yüklenemedi: Kanal doğrulanmamış/);
    expect(err.o.action.label).toBe("Tekrar dene");
    // Aynı yayın için ikinci kez otomatik yüklenmez.
    await act(async () => { api.afterStart(); });
    await flush();
    expect(posts).toHaveLength(1);
    // Tekrar dene → başarı bildirimi.
    fail = false;
    await act(async () => { err.o.action.run(); });
    await flush(); await flush();
    expect(posts).toHaveLength(2);
    expect(toasts.some((t) => t.o?.tone === "success" && /YouTube kapağı ayarlandı/.test(t.m))).toBe(true);
    // Otomatik kapalıyken yeni yayında yüklenmez.
    store.setCoverSettings({ auto: false });
    yt.stream = { broadcast_id: "bc2" };
    await act(async () => { api.afterStart(); });
    await flush();
    expect(posts).toHaveLength(2);
    unmount();
  });
});
