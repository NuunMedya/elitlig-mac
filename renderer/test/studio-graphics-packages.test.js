// Yayın grafikleri · HAZIR GRAFİK PAKETLERİ (uygula / birleştir / dışa–içe aktar,
// lig varsayılanı, anlık görüntüye uygulama, takım renklerinden) ve YAYIN BAĞLANTILARI
// (YouTube izleme / Studio, elitlig.com maç sayfası, programda QR kartı).
import {
  BUILTIN_PACKAGES, DEFAULT_PACKAGE_ID, MAX_CUSTOM_PACKAGES, PACKAGE_STORE_KEY, allPackages, applyPackageToSnapshot, autoPackageFor, builtinPackage,
  duplicatePackage, exportPackages, exportPackagesJson, findPackage, hueGap, leagueKeyOf, lightPalette, luminance, materializePackage, mergePackage,
  normalizePackage, normalizePackageStore, packageResolvedBranding, packageServerBranding, packageSummary, packageSwatches, parsePackagesImport,
  removePackage, teamPackageColors, uniqueName, upsertPackage, validatePackageName, withActive, withLeagueDefault,
} from "../src/lib/studio/graphics/packages";
import { DEFAULT_BRANDING, normalizeBranding, resolveBranding } from "../src/lib/studio/graphics/branding";
import { buildGraphicsSnapshot } from "../src/lib/studio/graphics/snapshot";
import { drawGraphics } from "../src/lib/studio/graphics/draw";
import { qrCardBox, qrFor, shortUrl } from "../src/lib/studio/graphics/drawQr";
import { stingerPalette } from "../src/lib/studio/stinger";
import { TRANSITION_KINDS } from "../src/lib/studio/transitions";
import { VAR_THEME_KEYS } from "../src/lib/studio/varThemes";
import { COVER_TEMPLATES } from "../src/lib/studio/cover/model";
import { PACKAGE_COVER_TEMPLATES, PACKAGE_TRANSITIONS, PACKAGE_VAR_THEMES } from "../src/lib/studio/graphics/packages";
import { PROFILE_GROUPS, collectProfile } from "../src/views/studio/settings/profiles";
import { broadcastLinks, citySlug, linkOf, matchPageUrl, qrOverlay, qrVisible, youtubeStudioUrl, youtubeVideoId, youtubeWatchUrl } from "../src/lib/studio/links";
import { RAIL_WIDGETS } from "../src/views/studio/shortcuts/railModel";
import { CONTROL_SECTIONS, SETTINGS_TARGETS } from "../src/views/studio/layout/layoutModel";

const now = 1_700_000_000_000;
const pxOf = (font) => Number(String(font).match(/([\d.]+)px/)?.[1]) || 10;
function fakeCtx() {
  const calls = { fillText: 0, fillRect: 0, alphas: [] };
  const state = { font: "10px Test", globalAlpha: 1 };
  return new Proxy({}, {
    get(t, prop) {
      if (prop === "measureText") return (s) => ({ width: String(s).length * pxOf(state.font) * 0.5 });
      if (prop === "createLinearGradient" || prop === "createRadialGradient") return () => ({ addColorStop() {} });
      if (prop === "fillText") return () => { calls.fillText += 1; calls.alphas.push(state.globalAlpha); };
      if (prop === "fillRect") return () => { calls.fillRect += 1; };
      if (prop === "save") return () => { (state.stack ||= []).push(state.globalAlpha); };
      if (prop === "restore") return () => { if (state.stack?.length) state.globalAlpha = state.stack.pop(); };
      if (prop === "calls") return calls;
      if (prop in state) return state[prop];
      return () => {};
    },
    set(t, prop, value) { state[prop] = value; return true; },
    has(t, prop) { return prop !== "letterSpacing"; },
  });
}
const live = {
  match: { id: 42, first_team_name: "Ankara Gençlikspor", second_team_name: "Kartallar FK", league_id: 7, league_name: "CCL Cup", city_id: 6, city: "Ankara" },
  status: "canli", running: true, period: 1, homeName: "Ankara Gençlikspor", awayName: "Kartallar FK",
  timer: { base_ms: 600_000, base_at: new Date(now - 5000).toISOString(), running: true }, score: { home: 1, away: 0 },
  logos: { home: null, away: null }, events: [], squads: { home: [], away: [] },
};
const baseSnap = (over = {}) => buildGraphicsSnapshot(live, { branding: DEFAULT_BRANDING, variant: "scoreboard", now, subtitle: { onAir: true, settings: { customHeadlines: [{ tag: "T", text: "Satır" }] }, epoch: now }, ...over });

describe("grafik paketleri · hazır paketler", () => {
  it("6–8 hazır paket, benzersiz kimlik / ad; her alan kayıtlı anahtarlarla", () => {
    expect(BUILTIN_PACKAGES.length).toBeGreaterThanOrEqual(7);
    expect(BUILTIN_PACKAGES.length).toBeLessThanOrEqual(9);
    expect(new Set(BUILTIN_PACKAGES.map((p) => p.id)).size).toBe(BUILTIN_PACKAGES.length);
    expect(new Set(BUILTIN_PACKAGES.map((p) => p.name)).size).toBe(BUILTIN_PACKAGES.length);
    expect(BUILTIN_PACKAGES.map((p) => p.name)).toEqual(expect.arrayContaining(["Elitlig Klasik", "Turnuva Altın", "Gece Neon", "Minimal Beyaz", "Stadyum TV", "Retro", "Kurumsal Mavi"]));
    expect(BUILTIN_PACKAGES.some((p) => p.auto === "teams")).toBe(true);
    expect(builtinPackage(DEFAULT_PACKAGE_ID)?.name).toBe("Elitlig Klasik");
    for (const p of BUILTIN_PACKAGES) {
      expect(p.builtin).toBe(true);
      expect(TRANSITION_KINDS.some((t) => t.key === p.transition.kind)).toBe(true);
      expect(VAR_THEME_KEYS).toContain(p.var.theme);
      expect(COVER_TEMPLATES.some((t) => t.key === p.cover.template)).toBe(true);
      expect(packageSummary(p)).toHaveLength(8);
      expect(packageSwatches(p)).toHaveLength(5);
    }
  });
  it("paketteki anahtar listeleri kayıtlarla eşleşir (geçiş, VAR, kapak)", () => {
    expect([...PACKAGE_TRANSITIONS].sort()).toEqual(TRANSITION_KINDS.map((t) => t.key).sort());
    expect([...PACKAGE_VAR_THEMES].sort()).toEqual([...VAR_THEME_KEYS].sort());
    expect([...PACKAGE_COVER_TEMPLATES].sort()).toEqual(COVER_TEMPLATES.map((t) => t.key).sort());
  });
  it("normalize: bilinmeyen anahtar / bozuk renk varsayılana; kimlik ya da ad yoksa null", () => {
    expect(normalizePackage({ name: "X" })).toBeNull();
    expect(normalizePackage({ id: "x" })).toBeNull();
    const p = normalizePackage({ id: "a b!", name: "  Deneme  ", colors: { base: "nope", accent: "#ABCDEF" }, font: "comic", radius: 9, fontScale: 20, scorebug: { variant: "lineups" }, transition: { kind: "boom" }, var: { theme: "x" }, overrides: { scorebug: { base: "#112233" }, bogus: { base: "#000000" } } });
    expect(p.id).toBe("ab");
    expect(p.name).toBe("Deneme");
    expect(p.colors.base).toBe("#300030");
    expect(p.colors.accent).toBe("#abcdef");
    expect(p.font).toBe("inter");
    expect(p.radius).toBe(2);
    expect(p.fontScale).toBe(80);
    expect(p.scorebug.variant).toBe("scoreboard");
    expect(p.transition.kind).toBe("stinger");
    expect(p.var.theme).toBe("kirmizi");
    expect(Object.keys(p.overrides)).toEqual(["scorebug"]);
  });
});

describe("grafik paketleri · uygula", () => {
  it("marka kaydı: özel tema, web yazı tipi, ekler; logo ve marka adı korunur", () => {
    const cur = normalizeBranding({ ...DEFAULT_BRANDING, logoUrl: "https://x/l.png", brandName: "CCL CUP", scoreboard: { logoScale: 130 } });
    const b = packageServerBranding(builtinPackage("turnuva-altin"), cur);
    expect(b.logoUrl).toBe("https://x/l.png");
    expect(b.brandName).toBe("CCL CUP");
    expect(b.scoreboard).toMatchObject({ theme: "custom", baseColor: "#1a1407", accentColor: "#d4a017", font: "oswald", logoScale: 130 });
    expect(b.led.baseColor).toBe("#1a1407");
    expect(b.extras).toMatchObject({ textColor: "#fff8e6", fontScale: 106, homeColor: "#e8c45a", awayColor: "#9fb3c8" });
    // Açık pakette web kaplaması koyu kalır: yazı beyaz.
    expect(packageServerBranding(builtinPackage("minimal-beyaz"), cur).extras.textColor).toBe("#ffffff");
  });
  it("anlık görüntü: gömülü yazı tipi, köşe, stinger renkleri, öğe başına marka, sponsor rengi", () => {
    const sponsorSnap = baseSnap({ sponsors: [{ id: 3, name: "S", brandColor: "#00ff00", images: {} }], subtitle: { onAir: true, settings: { sponsorId: 3 }, epoch: now } });
    const s = applyPackageToSnapshot(sponsorSnap, builtinPackage("minimal-beyaz"));
    expect(s.package).toEqual({ id: "minimal-beyaz", name: "Minimal Beyaz" });
    expect(s.branding.fontFamily).toMatch(/^"Inter"/);
    expect(s.branding.light).toBe(true);
    expect(s.branding.palette.barTop).toBe("#ffffff");
    expect(s.branding.palette.radiusK).toBe(0.6);
    // Alt bant ve röportaj ayrı (koyu) renkte; skorbord ve ekranlar genel (açık).
    expect(s.brandingFor.scorebug).toBe(s.branding);
    expect(s.brandingFor.screens).toBe(s.branding);
    expect(s.brandingFor.lowerThird.light).toBe(false);
    expect(s.brandingFor.lowerThird.text).toBe("#ffffff");
    expect(s.brandingFor.lowerThird.key).not.toBe(s.branding.key);
    expect(s.subtitle.sponsor.brandColor).toBe(s.brandingFor.lowerThird.palette.v400);
    // Kaynak anlık görüntü değişmez; paket yoksa aynen döner.
    expect(sponsorSnap.subtitle.sponsor.brandColor).toBe("#00ff00");
    expect(applyPackageToSnapshot(sponsorSnap, null)).toBe(sponsorSnap);
    const neon = packageResolvedBranding(resolveBranding(DEFAULT_BRANDING), builtinPackage("gece-neon"));
    const sp = stingerPalette(neon);
    expect(sp.stops[1][1]).toBe("#1e0b4b");
    expect(sp.stops[3][1]).toBe("#22d3ee");
    expect(neon.palette.homeBright).toBe("#22d3ee");
  });
  it("paketli anlık görüntü yapılandırılmış kopyalanabilir (program işçisine gider) ve hatasız çizilir", () => {
    for (const p of BUILTIN_PACKAGES) {
      const s = applyPackageToSnapshot(baseSnap({ interview: { onAir: true, people: [{ name: "Ali", side: "home" }] } }), materializePackage(p, { teams: { home: "#d00000", away: "#0033aa" } }));
      const clone = structuredClone(s);
      expect(clone.brandingFor.lowerThird.palette).toEqual(s.brandingFor.lowerThird.palette);
      for (const variant of ["scoreboard", "scoreboardv2", "bottomboard", "halftime", "pre_match", "post_match"]) {
        const ctx = fakeCtx();
        expect(() => drawGraphics(ctx, { width: 1920, height: 1080, now }, { ...clone, variant })).not.toThrow();
        expect(ctx.calls.fillText).toBeGreaterThan(3);
      }
    }
  });
  it("paket değişiminde yumuşak geçiş: eski ve yeni görünüm karışır, süre bitince yalnız yenisi", () => {
    const old = applyPackageToSnapshot(baseSnap(), builtinPackage("retro"));
    const next = applyPackageToSnapshot(baseSnap(), builtinPackage("kurumsal-mavi"));
    const snap = { ...next, fade: { branding: old.branding, brandingFor: old.brandingFor, at: now, ms: 700 } };
    const mid = fakeCtx();
    drawGraphics(mid, { width: 1920, height: 1080, now: now + 350 }, snap);
    const after = fakeCtx();
    drawGraphics(after, { width: 1920, height: 1080, now: now + 900 }, snap);
    expect(mid.calls.fillText).toBe(after.calls.fillText * 2);
    const partial = (c) => c.calls.alphas.filter((a) => a > 0.05 && a < 0.95).length;
    expect(partial(mid)).toBeGreaterThan(partial(after));
  });
});

describe("grafik paketleri · takım renklerinden", () => {
  it("ev sahibi renginden koyu zemin + aksan; yakın renkler ayrıştırılır", () => {
    const c = teamPackageColors({ home: "#c8102e", away: "#ffcc00" });
    expect(luminance(c.base)).toBeLessThan(0.03);
    expect(c.accent).toBe(c.home);
    expect(hueGap(c.home, "#c8102e")).toBeLessThan(5);
    const same = teamPackageColors({ home: "#c8102e", away: "#d01030" });
    expect(hueGap(same.home, same.away) >= 26 || Math.abs(luminance(same.home) - luminance(same.away)) >= 0.25).toBe(true);
    const grey = teamPackageColors({ home: "#ffffff", away: "#1d4ed8" });
    expect(grey.accent).toBe(grey.away);
    expect(teamPackageColors({}).home).toMatch(/^#[0-9a-f]{6}$/);
  });
  it("materialize: yalnız auto paket değişir; geçiş renkleri takımlardan", () => {
    const auto = builtinPackage("takim-renkleri");
    const m = materializePackage(auto, { teams: { home: "#0057b8", away: "#ffd700" } });
    expect(m.colors.home).not.toBe(auto.colors.home);
    expect(m.transition.secondary).toBe(m.colors.home);
    expect(m.transition.accent).toBe(m.colors.away);
    expect(materializePackage(builtinPackage("retro"), { teams: { home: "#000000" } })).toEqual(builtinPackage("retro"));
  });
});

describe("grafik paketleri · birleştir / çoğalt / doğrula", () => {
  it("mergePackage alan alan birleştirir, overrides öğe öğe; null öğe geçersiz kılmayı siler; kimlik değişmez", () => {
    const base = builtinPackage("minimal-beyaz");
    const m = mergePackage(base, { id: "hack", name: "Yeni", colors: { accent: "#00aa55" }, overrides: { lowerThird: { accent: "#ff0000" }, interview: null, screens: { base: "#101010" } } });
    expect(m.id).toBe("minimal-beyaz");
    expect(m.name).toBe("Yeni");
    expect(m.colors).toMatchObject({ accent: "#00aa55", base: base.colors.base, light: true });
    expect(m.overrides.lowerThird).toMatchObject({ base: "#16181d", accent: "#ff0000" });
    expect(m.overrides.interview).toBeUndefined();
    expect(m.overrides.screens.base).toBe("#101010");
    expect(base.overrides.interview).toBeTruthy(); // kaynak değişmez
  });
  it("çoğalt: yeni kimlik, düzenlenebilir, benzersiz ad", () => {
    const list = allPackages({});
    const a = duplicatePackage(builtinPackage("gece-neon"), list, { now });
    expect(a.builtin).toBe(false);
    expect(a.id).not.toBe("gece-neon");
    expect(a.name).toBe("Gece Neon (kopya)");
    const b = duplicatePackage(a, [...list, a], { now });
    expect(b.name).toBe("Gece Neon (kopya 2)");
    expect(uniqueName("Retro", list)).toBe("Retro (kopya)");
    expect(uniqueName("Yepyeni", list)).toBe("Yepyeni");
    expect(validatePackageName("", list)).toBeTruthy();
    expect(validatePackageName("retro", list)).toMatch(/zaten/);
    expect(validatePackageName("Retro", list, "retro")).toBe("");
  });
});

describe("grafik paketleri · dışa / içe aktarma", () => {
  it("dışa aktarılan dosya içe aktarılınca aynı paketler (builtin bayrağı düşer)", () => {
    const mine = duplicatePackage(builtinPackage("stadyum-tv"), allPackages({}), { name: "Benim Stadyum", now });
    const file = exportPackages([mine], { now });
    expect(file).toMatchObject({ app: "elitlig-studio", kind: "graphics-packages", v: 1 });
    expect(file.packages[0].builtin).toBeUndefined();
    const r = parsePackagesImport(exportPackagesJson([mine]), allPackages({}));
    expect(r.ok).toBe(true);
    expect(r.packages[0]).toEqual({ ...mine, builtin: false });
  });
  it("çakışan kimlik / ad yeniden adlandırılır; tek paket ve dizi kabul; bozuk dosya reddedilir", () => {
    const list = allPackages({});
    const r = parsePackagesImport({ kind: "graphics-packages", packages: [builtinPackage("retro"), { name: "Bozuk" }, { id: "z", name: "Z", colors: { base: "#000000" } }] }, list, { now });
    expect(r.ok).toBe(true);
    expect(r.packages).toHaveLength(3);
    expect(r.packages[0].id).not.toBe("retro");
    expect(r.packages[0].name).toBe("Retro (kopya)");
    expect(r.packages.every((p) => !p.builtin)).toBe(true);
    expect(parsePackagesImport({ id: "tek", name: "Tek", colors: { accent: "#ff0000" } }, list).packages[0].id).toBe("tek");
    expect(parsePackagesImport("{ bozuk", list)).toMatchObject({ ok: false, error: "Dosya JSON değil." });
    expect(parsePackagesImport({ app: "baska", kind: "graphics-packages", packages: [] }, list).ok).toBe(false);
    expect(parsePackagesImport({ kind: "graphics-packages", v: 9, packages: [] }, list).error).toMatch(/sürüm/);
    expect(parsePackagesImport({ foo: 1 }, list).ok).toBe(false);
  });
});

describe("grafik paketleri · depo, lig varsayılanı, ayar şablonu", () => {
  it("upsert / remove / etkin paket / lig varsayılanı; hazır paket kimliği özel listeye girmez", () => {
    let s = normalizePackageStore(null);
    expect(s).toMatchObject({ custom: [], applyMode: "fade", writeWeb: true });
    const mine = duplicatePackage(builtinPackage("retro"), allPackages(s), { now });
    s = upsertPackage(s, mine);
    s = upsertPackage(s, { ...builtinPackage("retro") });
    expect(s.custom.map((p) => p.id)).toEqual([mine.id]);
    s = upsertPackage(s, { ...mine, name: "Retro 2" });
    expect(findPackage(s, mine.id).name).toBe("Retro 2");
    const league = leagueKeyOf(live.match);
    expect(league).toEqual({ key: "id:7", label: "CCL Cup" });
    expect(leagueKeyOf({ league_name: " Elit  Lig " })).toEqual({ key: "ad:elit lig", label: "Elit Lig" });
    expect(leagueKeyOf({})).toBeNull();
    s = withLeagueDefault(s, league, mine.id);
    expect(autoPackageFor(s, 42, live.match)).toBe(mine.id);
    s = withActive(s, 42, "gece-neon", { teams: { home: "#ff0000", away: "#0000ff" }, now });
    expect(s.active["42"]).toMatchObject({ id: "gece-neon", teams: { home: "#ff0000", away: "#0000ff" } });
    expect(autoPackageFor(s, 42, live.match)).toBeNull(); // maçta paket seçildi: lig varsayılanı ezmez
    expect(autoPackageFor(s, 43, { ...live.match, id: 43 })).toBe(mine.id);
    s = removePackage(s, mine.id);
    expect(s.custom).toHaveLength(0);
    expect(s.leagueDefaults[league.key]).toBeUndefined();
    s = withActive(s, 42, null);
    expect(s.active["42"]).toBeUndefined();
  });
  it("etkin paket kayıtları en çok 80 maç; özel paketler en çok sınır kadar", () => {
    let s = {};
    for (let i = 1; i <= 90; i += 1) s = withActive(s, i, "retro", { now: now + i });
    expect(Object.keys(s.active)).toHaveLength(80);
    expect(s.active["90"]).toBeTruthy();
    expect(s.active["1"]).toBeUndefined();
    const many = { custom: Array.from({ length: MAX_CUSTOM_PACKAGES + 5 }, (_, i) => ({ id: `p${i}`, name: `P${i}` })) };
    expect(normalizePackageStore(many).custom).toHaveLength(MAX_CUSTOM_PACKAGES);
  });
  it("ayar şablonlarında 'Grafik paketleri' grubu", () => {
    const g = PROFILE_GROUPS.find((x) => x.key === "packages");
    expect(g?.match(PACKAGE_STORE_KEY)).toBe(true);
    const store = new Map([[PACKAGE_STORE_KEY, JSON.stringify({ custom: [] })], ["other", "1"]]);
    const storage = { get length() { return store.size; }, key: (i) => [...store.keys()][i], getItem: (k) => store.get(k) ?? null };
    expect(collectProfile(storage, { groups: ["packages"] }).groups.packages).toEqual({ [PACKAGE_STORE_KEY]: JSON.stringify({ custom: [] }) });
  });
  it("açık palet tüm adlı renkleri içerir", () => {
    const p = lightPalette("#e5242f");
    for (const k of ["ink", "p900", "p200", "v400", "lilac", "barTop", "surfaceTop", "hair", "homeBright", "awayBright"]) expect(p[k]).toBeTruthy();
  });
});

describe("grafik paketi ve bağlantı parçacıkları · katalog", () => {
  it("parçacıklar katalogda; Ayarlar / Kontrol merkezi hedefi", () => {
    for (const t of ["gfxPackage", "gfxPackageNext", "linkYoutube", "linkYtStudio", "linkMatch", "linksBoard"]) expect(RAIL_WIDGETS.some((w) => w.type === t)).toBe(true);
    expect(CONTROL_SECTIONS.some((s) => s.key === "ayar:paketler")).toBe(true);
    expect(SETTINGS_TARGETS.some((s) => s.key === "paketler" && s.grafik)).toBe(true);
  });
});

describe("yayın bağlantıları · adres kurucular", () => {
  it("YouTube izleme ve Studio adresleri", () => {
    expect(youtubeVideoId("dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(youtubeVideoId("https://youtu.be/dQw4w9WgXcQ?t=3")).toBe("dQw4w9WgXcQ");
    expect(youtubeVideoId("https://www.youtube.com/live/abcDEF12345")).toBe("abcDEF12345");
    expect(youtubeVideoId("https://www.youtube.com/watch?v=abcDEF12345&x=1")).toBe("abcDEF12345");
    expect(youtubeVideoId("javascript:alert(1)")).toBeNull();
    expect(youtubeVideoId("bad id!")).toBeNull();
    expect(youtubeWatchUrl({ broadcast_id: "abcDEF12345" })).toBe("https://www.youtube.com/watch?v=abcDEF12345");
    expect(youtubeWatchUrl({ broadcast_id: "abcDEF12345", watch_url: "https://youtu.be/abcDEF12345" })).toBe("https://youtu.be/abcDEF12345");
    expect(youtubeWatchUrl({ watch_url: "https://evil.example/x" })).toBeNull();
    expect(youtubeWatchUrl(null)).toBeNull();
    expect(youtubeStudioUrl({ broadcast_id: "abcDEF12345" })).toBe("https://studio.youtube.com/video/abcDEF12345/livestreaming");
    expect(youtubeStudioUrl({ watch_url: "https://youtu.be/abcDEF12345" })).toBeNull(); // kimlik bilinmiyor
  });
  it("maç sayfası: /sehir/:il/mac/:id (web MatchPage), il kimliği yoksa il adından eski rota", () => {
    expect(matchPageUrl({ id: 42, city_id: 6, city: "Ankara" })).toBe("https://elitlig.com/sehir/6/mac/42");
    expect(matchPageUrl({ id: 42, city: "İstanbul Anadolu" })).toBe("https://elitlig.com/istanbul-anadolu/mac/42");
    expect(matchPageUrl({ id: 42, city_id: 6 }, "https://test.elitlig.com/")).toBe("https://test.elitlig.com/sehir/6/mac/42");
    expect(matchPageUrl({ id: 42 })).toBeNull();
    expect(matchPageUrl(null)).toBeNull();
    expect(citySlug("Şanlıurfa")).toBe("sanliurfa");
    expect(citySlug("")).toBe("turkiye");
  });
  it("broadcastLinks: adres yoksa devre dışı nedeni", () => {
    const off = broadcastLinks({});
    expect(off.map((l) => l.key)).toEqual(["youtube", "studio", "match"]);
    expect(off.every((l) => !l.url && l.reason)).toBe(true);
    expect(linkOf(off, "match").reason).toMatch(/maç seç/);
    const on = broadcastLinks({ stream: { broadcast_id: "abcDEF12345" }, match: { id: 42, city_id: 6 } });
    expect(on.every((l) => l.url && !l.reason)).toBe(true);
    expect(linkOf(broadcastLinks({ match: { id: 42 } }), "match").reason).toMatch(/il bilgisi/);
  });
  it("QR kartı: süreli / süresiz görünürlük, kutu sahnede, kod okunur boyutta", () => {
    const q = qrOverlay("https://elitlig.com/sehir/6/mac/42", { label: "MAÇ SAYFASI", seconds: 20, now });
    expect(qrVisible(q, now + 19_000)).toBe(true);
    expect(qrVisible(q, now + 21_000)).toBe(false);
    expect(qrVisible(qrOverlay("x", { seconds: 0, now }), now + 1e9)).toBe(true);
    expect(qrOverlay("")).toBeNull();
    const qr = qrFor(q.text);
    expect(qr.size).toBeGreaterThanOrEqual(21);
    expect(196 / (qr.size + 4)).toBeGreaterThanOrEqual(4); // modül en az 4 sahne pikseli
    const box = qrCardBox(1920, 1080, "br", 108);
    expect(box.x + box.w).toBeLessThanOrEqual(1920);
    expect(box.y + box.h).toBeLessThanOrEqual(1080 - 108);
    expect(shortUrl(q.text)).toBe("elitlig.com/sehir/6/mac/42");
    // Anlık görüntüde QR: grafik katmanı kapalıyken de çizilir.
    const ctx = fakeCtx();
    drawGraphics(ctx, { width: 1920, height: 1080, now: now + 1000 }, { ...baseSnap({ variant: "off", subtitle: { onAir: false } }), qr: q });
    expect(ctx.calls.fillRect).toBeGreaterThan(20);
    expect(ctx.calls.fillText).toBeGreaterThan(0);
    const none = fakeCtx();
    drawGraphics(none, { width: 1920, height: 1080, now: now + 30_000 }, { ...baseSnap({ variant: "off", subtitle: { onAir: false } }), qr: q });
    expect(none.calls.fillText + none.calls.fillRect).toBe(0); // süre doldu
  });
});
