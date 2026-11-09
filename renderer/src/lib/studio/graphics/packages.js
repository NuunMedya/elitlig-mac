// Yayın grafikleri · HAZIR GRAFİK PAKETLERİ (saf işlevler).
//
// Paket = yayının bütün görünümü tek adla: renkler / palet, yazı tipi, skorbord
// çeşidi + köşe yuvarlaklığı, alt bant (altyazı + sponsor şeridi), röportaj
// bandı, maç öncesi / ara / maç sonu ekranları, logo geçişi (stinger) türü ve
// renkleri, VAR teması, YouTube kapak şablonu + rengi, LED ekran tasarımı.
//
// Uygulama iki katmanlıdır:
//   1. packageServerBranding(pkg, current) → maçın marka kaydı (web kaplamaları
//      da aynı rengi / yazı tipini görür; PUT /api/maclar/:id/overlay-branding)
//   2. applyPackageToSnapshot(snap, pkg) → yalnız masaüstü çizimine özgü ekler:
//      gömülü yazı tipi (Inter / Barlow Condensed), açık (beyaz) palet, köşe
//      yuvarlaklığı, öğe başına renk (skorbord / alt bant / röportaj / ekranlar),
//      logo geçişi renkleri, sponsor şeridi rengi. Program işçisi aynı anlık
//      görüntüyü çizdiği için paket ana çizimde ve işçide aynı görünür.
//
// "Takım renklerinden" paketi (auto: "teams") iki takımın renginden (armadan
// baskın renk ya da elle seçilen renk) uygulama anında üretilir.
import { DEFAULT_BRANDING, OVERLAY_FONTS, normalizeBranding, normalizeColor, parseHex, resolvePalette, rgbToHsl, rgba, hslToRgb, toHex } from "./branding";
import { normalizeInterviewStyle } from "./drawInterview";

export const PACKAGE_APP = "elitlig-studio";
export const PACKAGE_KIND = "graphics-packages";
export const PACKAGE_V = 1;
export const MAX_CUSTOM_PACKAGES = 40;

/** Paket yazı tipleri: ilk ikisi uygulamayla gelir (ağsız, işçide de yüklü). server: web kaplamasının yazı tipi. */
export const PACKAGE_FONTS = Object.freeze([
  { key: "barlow", label: "Barlow Condensed (gömülü)", family: "Barlow Condensed", server: "oswald", bundled: true },
  { key: "inter", label: "Inter (gömülü)", family: "Inter", server: "inter", bundled: true },
  ...OVERLAY_FONTS.filter((f) => f.key !== "inter").map((f) => ({ key: f.key, label: f.label, family: f.family, server: f.key, bundled: false })),
]);
const FONT_KEYS = new Set(PACKAGE_FONTS.map((f) => f.key));
export const packageFontOf = (key) => PACKAGE_FONTS.find((f) => f.key === key) || PACKAGE_FONTS[1];

export const SCOREBUG_STYLES = Object.freeze([
  { key: "scoreboard", label: "Premier (yatay çubuk)" },
  { key: "scoreboardv2", label: "Kompakt (dikey istif)" },
  { key: "bottomboard", label: "Alt orta (golcülerle)" },
]);
const SCOREBUG_KEYS = new Set(SCOREBUG_STYLES.map((s) => s.key));
export const isScoreVariant = (key) => SCOREBUG_KEYS.has(key);

/** Öğe başına renk değiştirilebilen parçalar. */
export const PACKAGE_ELEMENTS = Object.freeze([
  { key: "scorebug", label: "Skorbord" },
  { key: "lowerThird", label: "Alt bant · altyazı ve sponsor şeridi" },
  { key: "interview", label: "Röportaj bandı" },
  { key: "screens", label: "Maç öncesi · ara · maç sonu ekranları" },
]);
const ELEMENT_KEYS = PACKAGE_ELEMENTS.map((e) => e.key);

export const SPONSOR_TONES = Object.freeze([
  { key: "sponsor", label: "Sponsorun kendi rengi" },
  { key: "brand", label: "Paketin aksan rengi" },
]);

// Bağımlılık döngüsü olmasın diye geçiş / VAR / kapak anahtarları burada (kayıtlar: transitions.js, varThemes.js, cover/model.js).
export const PACKAGE_TRANSITIONS = Object.freeze(["cut", "fade", "slideLeft", "slideRight", "slideUp", "zoom", "wipe", "blur", "stinger", "sweep", "panels", "iris", "shards"]);
export const PACKAGE_VAR_THEMES = Object.freeze(["kirmizi", "stadyum", "minimal", "neon", "klasik", "gece", "beyaz"]);
export const PACKAGE_COVER_TEMPLATES = Object.freeze(["klasik", "stadyum", "capraz", "minimal", "neon", "poster", "macgunu", "bolme", "sinema"]);
const COVER_ACCENTS = ["team", "brand", "custom"];

const clamp = (v, min, max, fb) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fb; };
const pickKey = (v, list, fb) => (list.includes(v) ? v : fb);
const obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
const cleanText = (v, max) => String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max); // eslint-disable-line no-control-regex

/* ------------------------------ renk yardımcıları ------------------------------ */

export function shadeColor(hex, dl) {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  const [h, s, l] = rgbToHsl(rgb);
  return toHex(hslToRgb([h, s, Math.min(1, Math.max(0, l + dl))]));
}
export function withLightness(hex, l, sMin = 0) {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  const [h, s] = rgbToHsl(rgb);
  return toHex(hslToRgb([h, Math.max(sMin, s), Math.min(1, Math.max(0, l))]));
}
/** Rengi yayında okunur yapar (açıklık 0,42–0,6; doygunluk ≥ 0,5). */
export function vividColor(hex) {
  const rgb = parseHex(hex);
  if (!rgb) return null;
  const [h, s, l] = rgbToHsl(rgb);
  if (s < 0.12) return toHex(hslToRgb([h, s, Math.min(0.92, Math.max(0.3, l))])); // gri / beyaz / siyah korunur
  return toHex(hslToRgb([h, Math.max(0.5, s), Math.min(0.6, Math.max(0.42, l))]));
}
const hueOf = (hex) => { const rgb = parseHex(hex); return rgb ? rgbToHsl(rgb)[0] : 0; };
const satOf = (hex) => { const rgb = parseHex(hex); return rgb ? rgbToHsl(rgb)[1] : 0; };
export const hueGap = (a, b) => { const d = Math.abs(hueOf(a) - hueOf(b)) % 360; return d > 180 ? 360 - d : d; };
/** WCAG göreli parlaklık. */
export function luminance(hex) {
  const rgb = parseHex(hex) || [0, 0, 0];
  const lin = (c) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
}
export const readableOn = (hex) => (luminance(hex) > 0.42 ? "#0f172a" : "#ffffff");

/* ------------------------------ normalize ------------------------------ */

function normalizeColors(src, fb = {}) {
  const s = obj(src);
  const pick = (k) => (s[k] === undefined ? fb[k] : s[k]);
  return {
    base: normalizeColor(pick("base")) || normalizeColor(fb.base) || "#300030",
    accent: normalizeColor(pick("accent")) || normalizeColor(fb.accent) || "#54009c",
    text: normalizeColor(pick("text")) || normalizeColor(fb.text) || "#ffffff",
    home: normalizeColor(pick("home")),
    away: normalizeColor(pick("away")),
    light: Boolean(pick("light")),
  };
}

function normalizeOverride(src) {
  if (!src || typeof src !== "object") return null;
  const base = normalizeColor(src.base);
  const accent = normalizeColor(src.accent);
  const text = normalizeColor(src.text);
  if (!base && !accent && !text && src.light === undefined) return null;
  return { base, accent, text, light: src.light === undefined ? null : Boolean(src.light) };
}

/**
 * Tam, güvenli paket. Eksik alanlar varsayılandan (Elitlig Klasik) gelir;
 * bilinmeyen anahtarlar atılır.
 */
export function normalizePackage(raw, { builtin = false } = {}) {
  const src = obj(raw);
  const id = cleanText(src.id, 64).replace(/[^\w.-]/g, "") || null;
  const name = cleanText(src.name, 60);
  if (!id || !name) return null;
  const colors = normalizeColors(src.colors);
  const sb = obj(src.scorebug);
  const tr = obj(src.transition);
  const cover = obj(src.cover);
  const led = obj(src.led);
  const ov = obj(src.overrides);
  const overrides = {};
  for (const k of ELEMENT_KEYS) { const o = normalizeOverride(ov[k]); if (o) overrides[k] = o; }
  return {
    v: PACKAGE_V,
    id,
    name,
    desc: cleanText(src.desc, 160),
    builtin: Boolean(builtin || src.builtin),
    auto: src.auto === "teams" ? "teams" : null,
    colors,
    font: FONT_KEYS.has(src.font) ? src.font : "inter",
    fontScale: Math.round(clamp(src.fontScale, 80, 130, 100)),
    radius: Math.round(clamp(src.radius, 0, 2, 1) * 100) / 100,
    logoPosition: pickKey(src.logoPosition, ["medal", "left", "off"], "medal"),
    scorebug: { variant: SCOREBUG_KEYS.has(sb.variant) ? sb.variant : "scoreboard" },
    interview: { style: normalizeInterviewStyle(obj(src.interview).style) },
    sponsor: { tone: pickKey(obj(src.sponsor).tone, ["sponsor", "brand"], "sponsor") },
    transition: {
      kind: pickKey(tr.kind, PACKAGE_TRANSITIONS, "stinger"),
      primary: normalizeColor(tr.primary),
      secondary: normalizeColor(tr.secondary),
      accent: normalizeColor(tr.accent),
    },
    var: { theme: pickKey(obj(src.var).theme, PACKAGE_VAR_THEMES, "kirmizi") },
    cover: {
      template: pickKey(cover.template, PACKAGE_COVER_TEMPLATES, "klasik"),
      accentMode: pickKey(cover.accentMode, COVER_ACCENTS, "team"),
      color: normalizeColor(cover.color),
    },
    led: { base: normalizeColor(led.base), accent: normalizeColor(led.accent), font: FONT_KEYS.has(led.font) ? led.font : null },
    overrides,
  };
}

/* ------------------------------ hazır paketler ------------------------------ */

const P = (x) => normalizePackage(x, { builtin: true });

export const BUILTIN_PACKAGES = Object.freeze([
  P({
    id: "elitlig-klasik", name: "Elitlig Klasik", desc: "Elitlig moru, Premier skorbord, klasik logo geçişi",
    colors: { base: "#300030", accent: "#54009c", text: "#ffffff" }, font: "inter", radius: 1,
    scorebug: { variant: "scoreboard" }, interview: { style: "classic" }, sponsor: { tone: "sponsor" },
    transition: { kind: "stinger" }, var: { theme: "kirmizi" }, cover: { template: "klasik", accentMode: "team" },
  }),
  P({
    id: "turnuva-altin", name: "Turnuva Altın", desc: "Gece siyahı ve altın: kupa finalleri, sinematik kapak",
    colors: { base: "#1a1407", accent: "#d4a017", text: "#fff8e6", home: "#e8c45a", away: "#9fb3c8" }, font: "barlow", fontScale: 106, radius: 0.5,
    scorebug: { variant: "scoreboard" }, interview: { style: "stack" }, sponsor: { tone: "brand" },
    transition: { kind: "sweep", primary: "#3a2a06", secondary: "#d4a017", accent: "#ffe08a" }, var: { theme: "stadyum" },
    cover: { template: "sinema", accentMode: "custom", color: "#d4a017" },
  }),
  P({
    id: "gece-neon", name: "Gece Neon", desc: "Koyu mor zemin, camgöbeği neon, parçacıklı geçiş",
    colors: { base: "#14072e", accent: "#22d3ee", text: "#ffffff", home: "#22d3ee", away: "#f472b6" }, font: "inter", radius: 1.4,
    scorebug: { variant: "scoreboardv2" }, interview: { style: "slim" }, sponsor: { tone: "brand" },
    transition: { kind: "shards", primary: "#1e0b4b", secondary: "#7c3aed", accent: "#22d3ee" }, var: { theme: "neon" },
    cover: { template: "neon", accentMode: "custom", color: "#22d3ee" },
  }),
  P({
    id: "minimal-beyaz", name: "Minimal Beyaz", desc: "Beyaz skorbord ve ekranlar, grafit alt bant, kırmızı vurgu",
    colors: { base: "#2b2f36", accent: "#e5242f", text: "#111827", home: "#e5242f", away: "#1f2937", light: true }, font: "inter", radius: 0.6,
    scorebug: { variant: "scoreboardv2" }, interview: { style: "slim" }, sponsor: { tone: "brand" },
    transition: { kind: "fade", primary: "#f4f5f7", secondary: "#d1d5db", accent: "#e5242f" }, var: { theme: "beyaz" },
    cover: { template: "minimal", accentMode: "custom", color: "#e5242f" },
    overrides: { lowerThird: { base: "#16181d", accent: "#e5242f", text: "#ffffff", light: false }, interview: { base: "#16181d", accent: "#e5242f", text: "#ffffff", light: false } },
  }),
  P({
    id: "stadyum-tv", name: "Stadyum TV", desc: "Lacivert televizyon görünümü, alt orta skorbord, panel geçişi",
    colors: { base: "#0b1527", accent: "#e11d48", text: "#ffffff", home: "#3b82f6", away: "#e11d48" }, font: "barlow", fontScale: 108, radius: 0.35,
    scorebug: { variant: "bottomboard" }, interview: { style: "classic" }, sponsor: { tone: "sponsor" },
    transition: { kind: "panels", primary: "#0b1527", secondary: "#1d4ed8", accent: "#e11d48" }, var: { theme: "stadyum" },
    cover: { template: "stadyum", accentMode: "team" },
  }),
  P({
    id: "retro", name: "Retro", desc: "Kahve, turuncu ve krem: 80'ler televizyonu, köşeli çizgiler",
    colors: { base: "#2b1709", accent: "#f97316", text: "#fff4e0", home: "#fbbf24", away: "#38bdf8" }, font: "barlow", fontScale: 110, radius: 0.15,
    scorebug: { variant: "scoreboard" }, interview: { style: "side" }, sponsor: { tone: "brand" },
    transition: { kind: "iris", primary: "#2b1709", secondary: "#c2410c", accent: "#fbbf24" }, var: { theme: "klasik" },
    cover: { template: "poster", accentMode: "custom", color: "#f97316" },
  }),
  P({
    id: "kurumsal-mavi", name: "Kurumsal Mavi", desc: "Gece mavisi ve canlı mavi, yuvarlak köşeler, sade silme geçişi",
    colors: { base: "#001a3d", accent: "#0a6cff", text: "#ffffff", home: "#38bdf8", away: "#f59e0b" }, font: "inter", radius: 1.6,
    scorebug: { variant: "scoreboardv2" }, interview: { style: "classic" }, sponsor: { tone: "sponsor" },
    transition: { kind: "wipe", primary: "#001a3d", secondary: "#0a6cff", accent: "#7dd3fc" }, var: { theme: "gece" },
    cover: { template: "capraz", accentMode: "brand" },
  }),
  P({
    id: "takim-renkleri", name: "Takımın renklerinden", auto: "teams", desc: "İki takımın renginden (armadan) otomatik üretilir",
    colors: { base: "#1b1b2f", accent: "#8a3fe0", text: "#ffffff" }, font: "barlow", fontScale: 104, radius: 0.8,
    scorebug: { variant: "scoreboard" }, interview: { style: "classic" }, sponsor: { tone: "brand" },
    transition: { kind: "stinger" }, var: { theme: "minimal" }, cover: { template: "bolme", accentMode: "team" },
  }),
]);
export const DEFAULT_PACKAGE_ID = "elitlig-klasik";
export const builtinPackage = (id) => BUILTIN_PACKAGES.find((p) => p.id === id) || null;

/* ------------------------------ takım renklerinden ------------------------------ */

/**
 * İki takım renginden paket renkleri: zemin ev sahibi renginin çok koyusu,
 * aksan ev sahibi rengi, deplasman rengi ayrışmıyorsa tonu kaydırılır.
 */
export function teamPackageColors({ home, away } = {}) {
  const h0 = normalizeColor(home);
  const a0 = normalizeColor(away);
  const homeC = vividColor(h0 || "#8a3fe0");
  let awayC = vividColor(a0 || "#f06c8a");
  if (hueGap(homeC, awayC) < 26 && Math.abs(luminance(homeC) - luminance(awayC)) < 0.25) {
    awayC = luminance(homeC) > 0.3 ? "#1f2937" : "#f8fafc";
  }
  const grey = satOf(homeC) < 0.12;
  const base = grey ? (luminance(homeC) > 0.5 ? "#1c1f26" : "#0d0f14") : withLightness(homeC, 0.11, 0.35);
  const accent = grey ? awayC : homeC;
  return { base, accent, text: "#ffffff", home: homeC, away: awayC, light: false };
}

/**
 * Pakete maça özgü değerleri yerleştirir (takım renkleri). Diğer paketler
 * olduğu gibi döner. teams: { home, away } (armadan ya da elle).
 */
export function materializePackage(pkg, { teams = null } = {}) {
  const p = normalizePackage(pkg);
  if (!p || p.auto !== "teams") return p;
  const c = teamPackageColors(teams || {});
  return normalizePackage({
    ...p,
    colors: { ...c, text: p.colors.text || c.text },
    transition: { ...p.transition, primary: p.transition.primary || withLightness(c.home, 0.16, 0.3), secondary: p.transition.secondary || c.home, accent: p.transition.accent || c.away },
  });
}

/* ------------------------------ birleştirme / çoğaltma ------------------------------ */

/** Paketi yamayla birleştirir (iç içe nesneler alan alan; overrides öğe öğe; null öğe geçersiz kılmayı siler). */
export function mergePackage(base, patch) {
  const b = normalizePackage(base);
  if (!b) return null;
  const p = obj(patch);
  const out = { ...b };
  for (const [k, v] of Object.entries(p)) {
    if (["id", "builtin", "v"].includes(k)) continue;
    if (k === "overrides") {
      const ov = { ...b.overrides };
      for (const [ek, ev] of Object.entries(obj(v))) {
        if (ev === null) delete ov[ek];
        else ov[ek] = { ...(ov[ek] || {}), ...obj(ev) };
      }
      out.overrides = ov;
    } else if (v && typeof v === "object" && !Array.isArray(v) && b[k] && typeof b[k] === "object") out[k] = { ...b[k], ...v };
    else out[k] = v;
  }
  const n = normalizePackage(out);
  return n ? { ...n, builtin: b.builtin } : b;
}

export function validatePackageName(name, list = [], exceptId = null) {
  const n = String(name || "").trim();
  if (!n) return "Paket adı gir.";
  if (n.length > 60) return "Ad en çok 60 karakter.";
  const lower = n.toLocaleLowerCase("tr-TR");
  if (list.some((p) => p.id !== exceptId && String(p.name).toLocaleLowerCase("tr-TR") === lower)) return "Bu adla bir paket zaten var.";
  return "";
}

/** Listede olmayan ad: "Gece Neon (kopya)", "Gece Neon (kopya 2)"… */
export function uniqueName(name, list = []) {
  const taken = new Set(list.map((p) => String(p.name).toLocaleLowerCase("tr-TR")));
  const base = String(name || "Paket").trim().slice(0, 50) || "Paket";
  if (!taken.has(base.toLocaleLowerCase("tr-TR"))) return base;
  for (let i = 1; i < 200; i += 1) {
    const n = i === 1 ? `${base} (kopya)` : `${base} (kopya ${i})`;
    if (!taken.has(n.toLocaleLowerCase("tr-TR"))) return n;
  }
  return `${base} ${Date.now().toString(36)}`;
}

let seq = 0;
export const newPackageId = (now = Date.now()) => `pkg-${now.toString(36)}${(seq++).toString(36)}`;

/** Çoğalt: yeni kimlik, düzenlenebilir (builtin değil), benzersiz ad. */
export function duplicatePackage(pkg, list = [], { name = null, now = Date.now() } = {}) {
  const p = normalizePackage(pkg);
  if (!p) return null;
  const base = p.name.replace(/ \(kopya( \d+)?\)$/, "");
  return normalizePackage({ ...p, id: newPackageId(now), name: name ? String(name).trim().slice(0, 60) : uniqueName(base, [...list, p, { name: base }]), builtin: false });
}

/* ------------------------------ dışa / içe aktarma ------------------------------ */

export function exportPackages(list, { now = Date.now() } = {}) {
  const packages = (list || []).map((p) => normalizePackage(p)).filter(Boolean).map((p) => { const { builtin, ...rest } = p; return rest; }); // eslint-disable-line no-unused-vars
  return { app: PACKAGE_APP, kind: PACKAGE_KIND, v: PACKAGE_V, exportedAt: new Date(now).toISOString(), packages };
}
export const exportPackagesJson = (list, opts) => JSON.stringify(exportPackages(list, opts), null, 2);

/**
 * İçe aktarma: dosya metni ya da nesne → { ok, packages?, error?, skipped }.
 * Tek paket nesnesi de kabul edilir. Var olan kimlik / ad çakışırsa yeni kimlik + "(kopya)" adı verilir.
 */
export function parsePackagesImport(raw, existing = [], { now = Date.now() } = {}) {
  let data = raw;
  if (typeof raw === "string") { try { data = JSON.parse(raw); } catch { return { ok: false, error: "Dosya JSON değil." }; } }
  if (!data || typeof data !== "object") return { ok: false, error: "Dosya boş ya da bozuk." };
  let rows;
  if (Array.isArray(data)) rows = data;
  else if (data.kind === PACKAGE_KIND || Array.isArray(data.packages)) {
    if (data.app && data.app !== PACKAGE_APP) return { ok: false, error: "Bu dosya bir Yayın Stüdyosu grafik paketi değil." };
    if (data.v != null && Number(data.v) > PACKAGE_V) return { ok: false, error: `Desteklenmeyen paket sürümü (${data.v}).` };
    rows = data.packages || [];
  } else if (data.colors && data.name) rows = [data];
  else return { ok: false, error: "Bu dosya bir Yayın Stüdyosu grafik paketi değil." };
  const out = [];
  let skipped = 0;
  const pool = [...existing];
  for (const r of rows) {
    const p = normalizePackage({ ...obj(r), id: obj(r).id || newPackageId(now) });
    if (!p) { skipped += 1; continue; }
    const clashId = pool.some((x) => x.id === p.id);
    const clashName = Boolean(validatePackageName(p.name, pool));
    const next = { ...p, builtin: false, id: clashId ? newPackageId(now) : p.id, name: clashName ? uniqueName(p.name, pool) : p.name };
    out.push(next);
    pool.push(next);
  }
  if (!out.length) return { ok: false, error: "Dosyada geçerli paket bulunamadı.", skipped };
  return { ok: true, packages: out.slice(0, MAX_CUSTOM_PACKAGES), skipped };
}

/* ------------------------------ paket deposu (saf) ------------------------------ */
// localStorage "studio.gfxPackages.v1" (ayar şablonlarına "Grafik paketleri" grubuyla girer):
//   { custom: [paket], leagueDefaults: { [ligAnahtarı]: { id, label } },
//     active: { [maçId]: { id, teams?, at } }, applyMode: "fade" | "next", writeWeb: bool }

export const PACKAGE_STORE_KEY = "studio.gfxPackages.v1";
export const APPLY_MODES = Object.freeze([
  { key: "fade", label: "Hemen (yumuşak geçişle)", hint: "Grafikler 0,7 sn'de yeni görünüme karışır" },
  { key: "next", label: "Sonraki geçişte", hint: "Bir sonraki GEÇİŞ / sahne değişiminde uygulanır" },
]);
const MAX_ACTIVE = 80;

export function normalizePackageStore(raw) {
  const s = obj(raw);
  const custom = (Array.isArray(s.custom) ? s.custom : []).map((p) => normalizePackage({ ...obj(p), builtin: false })).filter(Boolean)
    .filter((p, i, arr) => !builtinPackage(p.id) && arr.findIndex((x) => x.id === p.id) === i).slice(0, MAX_CUSTOM_PACKAGES);
  const leagueDefaults = {};
  for (const [k, v] of Object.entries(obj(s.leagueDefaults))) {
    const id = typeof v === "string" ? v : obj(v).id;
    if (k && id) leagueDefaults[String(k).slice(0, 120)] = { id: String(id), label: cleanText(obj(v).label || "", 80) };
  }
  const active = {};
  const rows = Object.entries(obj(s.active)).map(([k, v]) => [k, typeof v === "string" ? { id: v } : obj(v)]).filter(([, v]) => v.id);
  rows.sort((a, b) => (Number(b[1].at) || 0) - (Number(a[1].at) || 0));
  for (const [k, v] of rows.slice(0, MAX_ACTIVE)) {
    const teams = v.teams ? { home: normalizeColor(v.teams.home), away: normalizeColor(v.teams.away) } : null;
    active[String(k)] = { id: String(v.id), ...(teams ? { teams } : {}), at: Number(v.at) || 0 };
  }
  return { custom, leagueDefaults, active, applyMode: s.applyMode === "next" ? "next" : "fade", writeWeb: s.writeWeb !== false };
}

export const allPackages = (store) => [...BUILTIN_PACKAGES, ...normalizePackageStore(store).custom];
export const findPackage = (store, id) => (id ? allPackages(store).find((p) => p.id === String(id)) || null : null);
export const activeKey = (matchId) => String(Number(matchId) > 0 ? Number(matchId) : 0);
export const activeRecord = (store, matchId) => normalizePackageStore(store).active[activeKey(matchId)] || null;

export function withActive(store, matchId, id, { teams = null, now = Date.now() } = {}) {
  const s = normalizePackageStore(store);
  const active = { ...s.active };
  if (id) active[activeKey(matchId)] = { id: String(id), ...(teams ? { teams } : {}), at: now };
  else delete active[activeKey(matchId)];
  return normalizePackageStore({ ...s, active });
}

export function upsertPackage(store, pkg) {
  const s = normalizePackageStore(store);
  const p = normalizePackage({ ...pkg, builtin: false });
  if (!p || builtinPackage(p.id)) return s;
  const i = s.custom.findIndex((x) => x.id === p.id);
  const custom = i >= 0 ? s.custom.map((x) => (x.id === p.id ? p : x)) : [...s.custom, p];
  return normalizePackageStore({ ...s, custom });
}

/** Paketi siler; ona bağlı lig varsayılanları da kalkar (maçların etkin kaydı korunur, çizim varsayılana döner). */
export function removePackage(store, id) {
  const s = normalizePackageStore(store);
  const leagueDefaults = Object.fromEntries(Object.entries(s.leagueDefaults).filter(([, v]) => v.id !== id));
  return normalizePackageStore({ ...s, custom: s.custom.filter((p) => p.id !== id), leagueDefaults });
}

/* ------------------------------ lig / turnuva varsayılanı ------------------------------ */

const fold = (v) => String(v ?? "").trim().toLocaleLowerCase("tr-TR").replace(/\s+/g, " ");

/** Maçın lig anahtarı: { key: "id:12" | "ad:elit lig", label } ya da null. */
export function leagueKeyOf(match) {
  if (!match || typeof match !== "object") return null;
  const id = Number(match.league_id ?? match.lig_id ?? match.league?.id);
  const name = cleanText(match.league_name ?? match.lig_adi ?? match.league?.name ?? match.leagueName ?? "", 80);
  if (id > 0) return { key: `id:${id}`, label: name || `Lig #${id}` };
  if (name) return { key: `ad:${fold(name)}`, label: name };
  return null;
}

export function withLeagueDefault(store, league, id) {
  const s = normalizePackageStore(store);
  if (!league?.key) return s;
  const leagueDefaults = { ...s.leagueDefaults };
  if (id) leagueDefaults[league.key] = { id: String(id), label: league.label || "" };
  else delete leagueDefaults[league.key];
  return normalizePackageStore({ ...s, leagueDefaults });
}

/** Maç açılınca kendiliğinden uygulanacak paket kimliği (maçta henüz paket seçilmediyse). */
export function autoPackageFor(store, matchId, match) {
  const s = normalizePackageStore(store);
  if (!Number(matchId) || s.active[activeKey(matchId)]) return null;
  const lk = leagueKeyOf(match);
  const id = lk ? s.leagueDefaults[lk.key]?.id : null;
  return id && findPackage(s, id) ? id : null;
}

/* ------------------------------ uygulama: marka kaydı ------------------------------ */

/**
 * Paketin marka kaydı (web kaplamaları dahil): renkler özel tema, yazı tipi
 * web karşılığı, ekler (yazı rengi / boyu, logo yeri, takım renkleri). Logo ve
 * marka adı korunur.
 */
export function packageServerBranding(pkg, current = DEFAULT_BRANDING) {
  const p = normalizePackage(pkg);
  const cur = normalizeBranding(current);
  if (!p) return cur;
  const c = p.colors;
  const font = packageFontOf(p.font).server;
  const ledFont = packageFontOf(p.led.font || p.font).server;
  // Açık pakette web kaplaması koyu kalır (web açık paleti tanımaz): grafitle aynı ton.
  const design = (base, accent, f, logoScale) => ({ theme: "custom", baseColor: base, accentColor: accent, font: f, logoScale });
  return normalizeBranding({
    ...cur,
    scoreboard: design(c.base, c.accent, font, cur.scoreboard.logoScale),
    led: design(p.led.base || c.base, p.led.accent || c.accent, ledFont, cur.led.logoScale),
    extras: {
      ...cur.extras,
      textColor: c.light ? "#ffffff" : c.text,
      fontScale: p.fontScale,
      logoPosition: p.logoPosition,
      homeColor: c.home,
      awayColor: c.away,
    },
  });
}

/* ------------------------------ uygulama: masaüstü çizimi ------------------------------ */

/** Açık (beyaz) palet: resolvePalette ile aynı adlar. */
export function lightPalette(accent = "#e5242f", text = "#111827") {
  const a = normalizeColor(accent) || "#e5242f";
  const ink = normalizeColor(text) || "#111827";
  return {
    ink: "#f3f5f8", deep: "#ffffff",
    p900: "#e8ecf1", p800: "#f2f4f7", p700: "#ffffff", p600: "#e2e6ec", p500: "#d3d9e1",
    p400: "#9aa4b2", p300: "#6b7584", p200: "#596273", p100: shadeColor(ink, 0.18),
    v800: shadeColor(a, -0.12), v700: a, v600: a, v500: a, v400: a, v300: shadeColor(a, 0.08),
    lilac: shadeColor(a, -0.05),
    barTop: "#ffffff", barBottom: "#eef1f5",
    surfaceTop: "#ffffff", surfaceMid: "#f7f8fa", surfaceEnd: "#eceff3",
    hair: "rgba(15, 23, 42, 0.12)", hairSoft: "rgba(15, 23, 42, 0.06)",
    live: "#e5242f", amber: "#d97706", red: "#dc2626", green: "#16a34a",
    homeBright: a, awayBright: "#1f2937",
  };
}

/** Bir öğenin renkleri: paket renkleri + o öğenin geçersiz kılması. */
export function elementColors(pkg, element) {
  const p = normalizePackage(pkg);
  if (!p) return null;
  const o = element ? p.overrides[element] : null;
  if (!o) return p.colors;
  const light = o.light === null ? p.colors.light : o.light;
  return {
    ...p.colors,
    base: o.base || p.colors.base,
    accent: o.accent || p.colors.accent,
    text: o.text || (light !== p.colors.light ? (light ? "#111827" : "#ffffff") : p.colors.text),
    light,
  };
}

const FONT_FALLBACK = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", Arial, sans-serif';

/**
 * Çözülmüş markaya (resolveBranding çıktısı) paketin masaüstü eklerini uygular.
 * element: null (genel) | "scorebug" | "lowerThird" | "interview" | "screens".
 */
export function packageResolvedBranding(B, pkg, element = null) {
  const p = normalizePackage(pkg);
  if (!B || !p) return B;
  const c = elementColors(p, element);
  const palette = c.light
    ? lightPalette(c.accent, c.text)
    : resolvePalette({ theme: "custom", baseColor: c.base, accentColor: c.accent });
  palette.homeBright = c.home || (c.light ? palette.homeBright : B.palette.homeBright);
  palette.awayBright = c.away || (c.light ? palette.awayBright : B.palette.awayBright);
  palette.radiusK = p.radius;
  const font = packageFontOf(p.font);
  const tr = p.transition;
  return {
    ...B,
    key: JSON.stringify([B.key, p.id, element, c, p.font, p.radius, p.fontScale]),
    fontKey: font.key,
    fontFamily: `"${font.family}", ${FONT_FALLBACK}`,
    fontScale: p.fontScale / 100,
    logoPosition: p.logoPosition,
    text: c.text,
    light: c.light,
    palette,
    // Logo geçişi (stinger) renkleri: stingerPalette primary / secondary / accent okur.
    primary: tr.primary || (c.light ? "#f3f5f8" : c.base),
    secondary: tr.secondary || (c.light ? "#d1d5db" : palette.v600),
    accent: tr.accent || c.accent,
    sponsorTone: p.sponsor.tone,
    packageId: p.id,
  };
}

/**
 * Anlık görüntüye paketi uygular: branding (genel) + brandingFor (öğe başına) +
 * sponsor şeridi rengi. pkg null ise anlık görüntü olduğu gibi döner.
 */
export function applyPackageToSnapshot(snap, pkg) {
  const p = pkg ? normalizePackage(pkg) : null;
  if (!snap || !p || !snap.branding) return snap;
  const base = snap.branding;
  const branding = packageResolvedBranding(base, p, null);
  const brandingFor = {};
  for (const k of ELEMENT_KEYS) brandingFor[k] = p.overrides[k] ? packageResolvedBranding(base, p, k) : branding;
  const sub = snap.subtitle || {};
  const sponsor = sub.sponsor && p.sponsor.tone === "brand" ? { ...sub.sponsor, brandColor: brandingFor.lowerThird.palette.v400 } : sub.sponsor;
  return { ...snap, branding, brandingFor, subtitle: { ...sub, sponsor }, package: { id: p.id, name: p.name } };
}

/* ------------------------------ özet ------------------------------ */

const TR_LABEL = { cut: "Kesme", fade: "Yumuşak geçiş", slideLeft: "Kaydırma ←", slideRight: "Kaydırma →", slideUp: "Kaydırma ↑", zoom: "Yakınlaştırma", wipe: "Silme", blur: "Luma", stinger: "Marka logosu", sweep: "Işık süpürmesi", panels: "Panel kayması", iris: "Halka", shards: "Parçacık" };
const VAR_LABEL = { kirmizi: "Kırmızı Alarm", stadyum: "Stadyum", minimal: "Minimal Pro", neon: "Neon Arena", klasik: "Klasik TV", gece: "Gece Mavisi", beyaz: "Stüdyo Beyaz" };
const COVER_LABEL = { klasik: "Klasik VS", stadyum: "Stadyum ışıkları", capraz: "Çapraz renkler", minimal: "Minimal", neon: "Neon", poster: "Poster", macgunu: "Maç günü", bolme: "İkiye bölünmüş", sinema: "Sinematik" };
const IV_LABEL = { classic: "Klasik", slim: "İnce bant", side: "Yan panel", stack: "Merkez vitrin", vertical: "Dikey güvenli" };

/** Paketin uyguladıkları (önizleme kartı / onay metni). */
export function packageSummary(pkg) {
  const p = normalizePackage(pkg);
  if (!p) return [];
  return [
    { key: "colors", label: "Renkler", value: p.auto === "teams" ? "Takım renklerinden" : `${p.colors.light ? "Açık" : "Koyu"} · ${p.colors.accent}` },
    { key: "font", label: "Yazı tipi", value: packageFontOf(p.font).label.replace(" (gömülü)", "") },
    { key: "scorebug", label: "Skorbord", value: SCOREBUG_STYLES.find((s) => s.key === p.scorebug.variant)?.label || p.scorebug.variant },
    { key: "interview", label: "Röportaj bandı", value: IV_LABEL[p.interview.style] || p.interview.style },
    { key: "transition", label: "Geçiş", value: TR_LABEL[p.transition.kind] || p.transition.kind },
    { key: "var", label: "VAR teması", value: VAR_LABEL[p.var.theme] || p.var.theme },
    { key: "cover", label: "YouTube kapağı", value: COVER_LABEL[p.cover.template] || p.cover.template },
    { key: "led", label: "LED ekran", value: p.led.base ? "Özel renk" : "Paket renkleri" },
  ];
}

/** Kart kutucukları: zemin, yüzey, aksan, ev, deplasman. */
export function packageSwatches(pkg) {
  const p = normalizePackage(pkg);
  if (!p) return [];
  const c = p.colors;
  if (c.light) return ["#ffffff", "#e8ecf1", c.accent, c.home || c.accent, c.away || "#1f2937"];
  const pal = resolvePalette({ theme: "custom", baseColor: c.base, accentColor: c.accent });
  return [pal.p900, pal.p600, pal.v400, c.home || pal.homeBright, c.away || pal.awayBright];
}

export const swatchCss = (hex, a = 1) => (a >= 1 ? hex : rgba(hex, a));
