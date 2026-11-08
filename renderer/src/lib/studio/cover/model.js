// YouTube yayın kapağı · saf model: şablon listesi, ayarlar, kapak verisi,
// takım rengi (armadan baskın renk), JPEG boyut bütçesi.
//
// Kapak 1280×720 (YouTube önerisi); JPEG en çok 2 MB (YouTube sınırı). Çizim
// lib/studio/cover/draw.js, görsel yükleme + kodlama render.js içindedir.

import { normalizeColor, parseHex, rgbToHsl, hslToRgb, toHex } from "../graphics/branding";

export const COVER_W = 1280;
export const COVER_H = 720;
export const COVER_MAX_BYTES = 2 * 1024 * 1024;
/** Kodlanan JPEG bu bütçenin altında tutulur (base64 + ağ payı). */
export const COVER_TARGET_BYTES = Math.floor(1.9 * 1024 * 1024);
export const JPEG_QUALITIES = [0.92, 0.88, 0.82, 0.75, 0.66, 0.56, 0.45];

export const COVER_TEMPLATES = Object.freeze([
  { key: "klasik", label: "Klasik VS", hint: "Koyu zemin, takım renginde yan ışıklar, halkalı armalar ve ortada VS" },
  { key: "stadyum", label: "Stadyum ışıkları", hint: "Gece maçı: projektör konileri, tribün silueti ve çim" },
  { key: "capraz", label: "Çapraz renkler", hint: "Takım renkleriyle çapraz bölünmüş zemin, beyaz arma tabakları" },
  { key: "minimal", label: "Minimal", hint: "Açık zemin, büyük dar yazı, sade üç sütunlu bilgi satırı" },
  { key: "neon", label: "Neon", hint: "Gece moru, perspektif ızgara ve neon halkalı armalar" },
  { key: "poster", label: "Poster", hint: "Kâğıt dokusu, manşet tipografisi ve CANLI damgası" },
  { key: "macgunu", label: "Maç günü", hint: "Dev saat, eğik takım renkleri ve sol sütunda takımlar" },
  { key: "bolme", label: "İkiye bölünmüş", hint: "Ekran ikiye bölünür: her yarı takım renginde, dev arma filigranı" },
  { key: "sinema", label: "Sinematik", hint: "Sinema bantları, altın ince çizgiler, sakin ve şık" },
]);
const TEMPLATE_KEYS = new Set(COVER_TEMPLATES.map((t) => t.key));

export const ACCENT_MODES = Object.freeze([
  { key: "team", label: "Takım renkleri", hint: "Armalardaki baskın renk (yoksa marka rengi)" },
  { key: "brand", label: "Marka teması", hint: "Yayın grafiklerinin marka renkleri" },
  { key: "custom", label: "Özel renk", hint: "Tek bir aksan rengi" },
]);
const ACCENT_KEYS = new Set(ACCENT_MODES.map((m) => m.key));

/** Gösterilip gizlenebilen alanlar. */
export const COVER_FIELDS = Object.freeze([
  { key: "league", label: "Lig" },
  { key: "season", label: "Sezon" },
  { key: "date", label: "Tarih" },
  { key: "time", label: "Saat" },
  { key: "venue", label: "Saha" },
  { key: "city", label: "Şehir" },
  { key: "live", label: "CANLI rozeti" },
  { key: "brand", label: "ElitLig logosu" },
]);

export const DEFAULT_COVER_SETTINGS = Object.freeze({
  template: "klasik",
  accentMode: "team",
  customColor: "#a855f7",
  background: null, // data: / https: adres (isteğe bağlı zemin fotoğrafı)
  backgroundDim: 60, // zemin fotoğrafının üstündeki şablon katmanı (%)
  show: Object.freeze(Object.fromEntries(COVER_FIELDS.map((f) => [f.key, true]))),
  liveLabel: "CANLI",
  auto: true, // "Yayın başlarken kapağı otomatik ayarla"
  siteCover: true, // maçın sitedeki kapağı boşsa bu görsel kullanılsın
});

const clampInt = (v, min, max, fb) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fb;
};

const cleanUrl = (v) => {
  const s = String(v ?? "").trim();
  if (!s) return null;
  if (/^data:image\/(png|jpe?g|webp);base64,/i.test(s)) return s;
  if (/^https?:\/\/\S+$/i.test(s)) return s.slice(0, 2000);
  return null;
};

export function normalizeCoverSettings(input) {
  const src = input && typeof input === "object" ? input : {};
  const d = DEFAULT_COVER_SETTINGS;
  const show = {};
  for (const f of COVER_FIELDS) show[f.key] = src.show && typeof src.show[f.key] === "boolean" ? src.show[f.key] : d.show[f.key];
  const label = String(src.liveLabel ?? d.liveLabel).trim().slice(0, 16);
  return {
    template: TEMPLATE_KEYS.has(src.template) ? src.template : d.template,
    accentMode: ACCENT_KEYS.has(src.accentMode) ? src.accentMode : d.accentMode,
    customColor: normalizeColor(src.customColor) || d.customColor,
    background: src.background === undefined ? d.background : cleanUrl(src.background),
    backgroundDim: clampInt(src.backgroundDim, 0, 95, d.backgroundDim),
    show,
    liveLabel: label || d.liveLabel,
    auto: typeof src.auto === "boolean" ? src.auto : d.auto,
    siteCover: typeof src.siteCover === "boolean" ? src.siteCover : d.siteCover,
  };
}

export const templateOf = (key) => COVER_TEMPLATES.find((t) => t.key === key) || COVER_TEMPLATES[0];

/* ------------------------------ metin ------------------------------ */

const clean = (v) => {
  const s = String(v ?? "").trim().replace(/\s+/g, " ");
  return s && !["none", "null", "undefined"].includes(s.toLowerCase()) ? s : "";
};

export const upperTr = (s) => String(s ?? "").toLocaleUpperCase("tr-TR");

const STOP = new Set(["SK", "FK", "SPOR", "KULÜBÜ", "KULUBU", "SPOR KULÜBÜ", "GSK", "BSK", "BELEDİYESPOR"]);

/** Arma yoksa rozet: "Şahinler SK" → "ŞAH", "Kartal Gücü" → "KG", "Ankara Gençlikspor" → "AG". */
export function initialsOf(name) {
  const words = upperTr(clean(name)).replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);
  const core = words.filter((w) => !STOP.has(w));
  const list = core.length ? core : words;
  if (!list.length) return "?";
  if (list.length === 1) return Array.from(list[0]).slice(0, 3).join("");
  return list.slice(0, 3).map((w) => Array.from(w)[0]).join("");
}

const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const DAYS = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];

/** "2026-11-20" / ISO → { text: "20 Kasım 2026", day: "Cuma" } (saat diliminden bağımsız). */
export function trDateParts(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v ?? ""));
  if (!m) return { text: clean(v), day: "" };
  const y = Number(m[1]); const mo = Number(m[2]); const d = Number(m[3]);
  const month = MONTHS[mo - 1];
  if (!month) return { text: clean(v), day: "" };
  const day = DAYS[new Date(Date.UTC(y, mo - 1, d)).getUTCDay()] || "";
  return { text: `${d} ${month} ${y}`, day };
}

/* ------------------------------ renk ------------------------------ */

/**
 * Armanın baskın rengi: RGBA piksel dizisinden (getImageData) doygun,
 * ne çok açık ne çok koyu piksellerin 24 tonluk histogramı. Renk yoksa null.
 */
export function dominantColor(data) {
  if (!data || data.length < 4) return null;
  const bins = Array.from({ length: 24 }, () => ({ w: 0, r: 0, g: 0, b: 0 }));
  let total = 0;
  for (let i = 0; i + 3 < data.length; i += 4) {
    const a = data[i + 3];
    if (a < 160) continue;
    const r = data[i]; const g = data[i + 1]; const b = data[i + 2];
    const [h, s, l] = rgbToHsl([r, g, b]);
    if (s < 0.28 || l < 0.12 || l > 0.9) continue;
    const w = s * (1 - Math.abs(l - 0.5));
    const bin = bins[Math.floor(h / 15) % 24];
    bin.w += w; bin.r += r * w; bin.g += g * w; bin.b += b * w;
    total += w;
  }
  if (total <= 0) return null;
  let best = bins[0];
  for (const b of bins) if (b.w > best.w) best = b;
  if (best.w / total < 0.12 && total < 4) return null;
  return toHex([best.r / best.w, best.g / best.w, best.b / best.w].map((v) => Math.max(0, Math.min(255, Math.round(v)))));
}

/** Rengi kapakta okunur kılar: açıklık 0.38–0.62, doygunluk ≥ 0.45. */
export function vivid(hex, { minL = 0.38, maxL = 0.62, minS = 0.45 } = {}) {
  const rgb = parseHex(hex);
  if (!rgb) return null;
  const [h, s, l] = rgbToHsl(rgb);
  return toHex(hslToRgb([h, Math.max(minS, s), Math.min(maxL, Math.max(minL, l))]).map((v) => Math.round(v)));
}

export const hueOf = (hex) => { const rgb = parseHex(hex); return rgb ? rgbToHsl(rgb)[0] : 0; };
const hueGap = (a, b) => { const d = Math.abs(hueOf(a) - hueOf(b)) % 360; return d > 180 ? 360 - d : d; };

/** Rengin tonunu kaydırır (derece). */
export function shiftHue(hex, deg) {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  const [h, s, l] = rgbToHsl(rgb);
  return toHex(hslToRgb([h + deg, s, l]).map((v) => Math.round(v)));
}

/** Rengi koyulaştırır / açar (0–1 açıklık farkı). */
export function shade(hex, dl) {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  const [h, s, l] = rgbToHsl(rgb);
  return toHex(hslToRgb([h, s, Math.min(1, Math.max(0, l + dl))]).map((v) => Math.round(v)));
}

const BRAND_HOME = "#8a3fe0";
const BRAND_AWAY = "#f06c8a";

/**
 * Kapak renkleri: { home, away, accent }.
 * team: armadan baskın renk → marka ekleri (homeColor / awayColor) → marka varsayılanı;
 * brand: marka aksanı + tamamlayıcı; custom: tek renk + ton kaydırması.
 * İki takım rengi çok yakınsa deplasman tonu kaydırılır (çapraz şablon ayırt edilsin).
 */
export function resolveCoverColors(data, settings) {
  const s = normalizeCoverSettings(settings);
  const brandAccent = normalizeColor(data?.brand?.accent) || "#a855f7";
  let home;
  let away;
  let accent;
  if (s.accentMode === "custom") {
    accent = vivid(s.customColor) || s.customColor;
    home = accent;
    away = shiftHue(accent, 150);
  } else if (s.accentMode === "brand") {
    accent = vivid(brandAccent) || brandAccent;
    home = accent;
    away = vivid(normalizeColor(data?.brand?.awayColor) || BRAND_AWAY);
  } else {
    home = vivid(data?.home?.color || data?.home?.fallbackColor || BRAND_HOME);
    away = vivid(data?.away?.color || data?.away?.fallbackColor || BRAND_AWAY);
    accent = vivid(brandAccent) || brandAccent;
  }
  if (hueGap(home, away) < 28) away = shiftHue(away, 160);
  return { home, away, accent };
}

/* ------------------------------ kapak verisi ------------------------------ */

/**
 * Maç kaydı + takımlar + marka → çizim verisi.
 * @param {{ match?: object, homeName?: string, awayName?: string, logos?: { home?: string, away?: string },
 *           colors?: { home?: string, away?: string }, branding?: object, brandLogo?: string }} input
 */
export function buildCoverData(input = {}) {
  const m = input.match || {};
  const home = clean(input.homeName) || clean(m.first_team_name) || "Ev sahibi";
  const away = clean(input.awayName) || clean(m.second_team_name) || "Deplasman";
  const date = trDateParts(m.date ?? m.match_date);
  const b = input.branding || {};
  const extras = b.extras || {};
  const design = b.scoreboard || {};
  return {
    matchId: m.id ?? input.matchId ?? null,
    home: { name: home, initials: initialsOf(home), logo: input.logos?.home || null, color: normalizeColor(input.colors?.home) || null, fallbackColor: normalizeColor(extras.homeColor) || null },
    away: { name: away, initials: initialsOf(away), logo: input.logos?.away || null, color: normalizeColor(input.colors?.away) || null, fallbackColor: normalizeColor(extras.awayColor) || null },
    league: clean(m.league_name ?? m.league),
    season: clean(m.match_season ?? m.season),
    date: date.text,
    day: date.day,
    time: clean(m.time ?? m.match_time).slice(0, 5),
    venue: clean(m.match_field ?? m.venue),
    city: clean(m.city),
    brand: {
      name: clean(b.brandName) || "ELİT LİG",
      logo: input.brandLogo || b.logoUrl || null,
      accent: normalizeColor(design.accentColor) || input.brandAccent || null,
      awayColor: normalizeColor(extras.awayColor) || null,
    },
  };
}

/** Önizleme / ayarlar için örnek maç (arma yok: baş harf rozetleri). */
export const SAMPLE_COVER_DATA = Object.freeze(buildCoverData({
  match: { id: 0, first_team_name: "Şahinler SK", second_team_name: "Kartal Gücü", league_name: "Süper Lig", match_season: "2026 Güz", date: "2026-11-20", time: "21:00:00", match_field: "Arena Halı Saha", city: "Ankara" },
  colors: { home: "#1d6fe0", away: "#e0302b" },
}));

/** Lig + sezon tek satır (sezon lig adını içeriyorsa tekrar etmez). */
export function competitionLine(data, show = DEFAULT_COVER_SETTINGS.show) {
  const league = show.league ? data.league : "";
  let season = show.season ? data.season : "";
  if (league && season && season.toLocaleLowerCase("tr-TR").includes(league.toLocaleLowerCase("tr-TR"))) return season;
  return [league, season].filter(Boolean).join(" · ");
}

/** Tarih / saat satırı: "20 Kasım 2026 Cuma · 21:00". */
export function whenLine(data, show = DEFAULT_COVER_SETTINGS.show) {
  const date = show.date ? [data.date, data.day].filter(Boolean).join(" ") : "";
  const time = show.time ? data.time : "";
  return [date, time].filter(Boolean).join(" · ");
}

/** Saha / şehir satırı: "Arena Halı Saha, Ankara". */
export function whereLine(data, show = DEFAULT_COVER_SETTINGS.show) {
  return [show.venue ? data.venue : "", show.city ? data.city : ""].filter(Boolean).join(", ");
}

/* ------------------------------ JPEG bütçesi ------------------------------ */

/** data: adresinin çözülmüş bayt sayısı. */
export function dataUrlBytes(dataUrl) {
  const s = String(dataUrl || "");
  const i = s.indexOf(",");
  const b64 = i >= 0 ? s.slice(i + 1) : s;
  const pad = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((b64.length * 3) / 4) - pad);
}

/**
 * Bütçenin altına inen ilk kaliteyi seçer. encode(q) → data: adresi.
 * @returns {{ dataUrl: string, bytes: number, quality: number }}
 */
export function encodeUnderBudget(encode, { maxBytes = COVER_TARGET_BYTES, qualities = JPEG_QUALITIES } = {}) {
  let last = null;
  for (const q of qualities) {
    const dataUrl = encode(q);
    const bytes = dataUrlBytes(dataUrl);
    last = { dataUrl, bytes, quality: q };
    if (bytes <= maxBytes) return last;
  }
  const err = new Error("Kapak 2 MB'ın altına sıkıştırılamadı. Zemin fotoğrafını kaldırıp tekrar deneyin.");
  err.code = "COVER_TOO_LARGE";
  err.result = last;
  throw err;
}

/** Sunucu hata kodu → kısa yol gösterici (bildirimin altında). */
export function coverErrorHint(code) {
  switch (code) {
    case "LIVE_STREAM_NOT_FOUND": return "Önce YouTube yayınını açın.";
    case "YOUTUBE_SCOPE_MISSING": return "Yayın sekmesinde kanalı yeniden bağlayın.";
    case "YOUTUBE_THUMBNAIL_NOT_ALLOWED": return "Kanalı youtube.com/verify adresinden telefonla doğrulayın.";
    case "YOUTUBE_NOT_CONFIGURED": return "Yayın sekmesinden YouTube kanalını bağlayın.";
    default: return "";
  }
}
