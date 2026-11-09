// YouTube yayın ayarları — saf yardımcılar: ön ayar şablonları, taslak, doğrulama.
//
// Şablon yer tutucuları: {home} {away} {date} {time} {league} {season} {round} {stage} {venue} {city} {link}
// Varsayılan başlık (DEFAULT_TITLE_TEMPLATE): "<LİG / TURNUVA> <SEZON> <TUR / AŞAMA> · ELİTLİG", tamamı
// Türkçe büyük harf (toLocaleUpperCase("tr-TR"); "Başlığı büyük harf yap", varsayılan açık).
// Sunucu şablonu kendisi de işler; burada yalnız pencere içinde CANLI ÖNİZLEME için
// maçın verisiyle doldurulur (bilinmeyen yer tutucu olduğu gibi kalır).

export const PRIVACY_OPTIONS = [
  { key: "public", label: "Herkese açık", hint: "Kanalda ve aramalarda görünür" },
  { key: "unlisted", label: "Liste dışı", hint: "Yalnız bağlantıyı bilenler izler" },
  { key: "private", label: "Özel", hint: "Yalnız sen ve izin verdiklerin" },
];
export const LATENCY_OPTIONS = [
  { key: "normal", label: "Normal", hint: "En iyi kalite, ~15–30 sn gecikme" },
  { key: "low", label: "Düşük", hint: "~5–10 sn gecikme" },
  { key: "ultraLow", label: "Çok düşük", hint: "~2–5 sn; DVR ve 1440p+ kapalı" },
];
export const PLACEHOLDERS = [
  { key: "home", label: "Ev sahibi" },
  { key: "away", label: "Deplasman" },
  { key: "date", label: "Tarih" },
  { key: "time", label: "Saat" },
  { key: "league", label: "Lig" },
  { key: "season", label: "Sezon" },
  { key: "round", label: "Tur / aşama" },
  { key: "venue", label: "Saha" },
  { key: "city", label: "Şehir" },
  { key: "link", label: "Maç sayfası" },
];
export const TITLE_MAX = 100;
export const DESCRIPTION_MAX = 5000;
export const TAGS_MAX_CHARS = 500;

const PRIVACY_KEYS = new Set(PRIVACY_OPTIONS.map((p) => p.key));
const LATENCY_KEYS = new Set(LATENCY_OPTIONS.map((p) => p.key));
const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const clean = (v) => {
  const s = String(v ?? "").trim();
  return s && s.toLowerCase() !== "none" && s.toLowerCase() !== "null" ? s : "";
};

/** "2026-11-06" / ISO → "6 Kasım 2026" (yerel saat diliminden bağımsız). */
export function trDate(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || ""));
  if (!m) return clean(v);
  const month = MONTHS[Number(m[2]) - 1];
  return month ? `${Number(m[3])} ${month} ${m[1]}` : clean(v);
}

/** Tur / aşama adı: maç kaydının olası alanları (sunucu sürümüne göre değişir). "none" boş sayılır. */
export function roundOf(m = {}) {
  const g = m.group && typeof m.group === "object" ? m.group : null;
  const sg = m.season_group && typeof m.season_group === "object" ? m.season_group : null;
  for (const v of [m.round_name, m.round_label, m.round, m.stage_name, m.stage, m.tur, m.asama, m.group_name, m.season_group_name, g?.group_name, g?.name, sg?.group_name, sg?.name, typeof m.group === "string" ? m.group : null]) {
    const s = clean(v);
    if (s && !/^\d+$/.test(s)) return s;
  }
  return "";
}

/**
 * Maç kaydı (GET /api/maclar/:id) → şablon değişkenleri.
 * extra: { homeName, awayName, link } (canlı maç kancasından gelen adlar önceliklidir).
 */
export function templateVars(match, extra = {}) {
  const m = match || {};
  const id = m.id ?? extra.matchId ?? null;
  const season = clean(m.match_season ?? m.season);
  // Sunucu taslağıyla aynı: sezon adı lig / tur adını zaten içeriyorsa ("Süper Lig 2026 Güz") tekrar etmez.
  const has = (part) => Boolean(part && season && season.toLocaleLowerCase("tr-TR").includes(part.toLocaleLowerCase("tr-TR")));
  let league = clean(m.league_name ?? m.league);
  let round = roundOf(m);
  if (has(league)) league = "";
  if (has(round)) round = "";
  return {
    home: clean(extra.homeName) || clean(m.first_team_name) || clean(m.home) || "Ev sahibi",
    away: clean(extra.awayName) || clean(m.second_team_name) || clean(m.away) || "Deplasman",
    date: trDate(m.date ?? m.match_date),
    time: clean(m.time ?? m.match_time).slice(0, 5),
    league,
    season,
    round,
    stage: round,
    venue: clean(m.match_field ?? m.venue),
    city: clean(m.city),
    link: clean(extra.link) || clean(m.match_link) || (id ? `https://elitlig.com/maclar/${id}` : ""),
  };
}

/**
 * Şablonu doldurur: {anahtar} → değer. Boş değerin çevresindeki ayraçlar
 * (" · ", " - ", " | ") temizlenir; bilinmeyen yer tutucu olduğu gibi kalır.
 */
export function renderTemplate(tpl, vars = {}) {
  const out = String(tpl ?? "").replace(/\{(\w+)\}/g, (all, k) => (Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k] ?? "") : all));
  return out.split("\n").map(tidyLine).join("\n").trim();
}

/** Boş kalan parçaların ayraçlarını atar: "A ·  · B" → "A · B", " – B" → "B". */
function tidyLine(line) {
  const parts = line.trim().split(/(\s*[·|–—]\s*|\s+-\s+|\s+-$|^-\s+)/);
  if (parts.length === 1) return line.replace(/ {2,}/g, " ").trimEnd();
  const kept = [];
  for (let i = 0; i < parts.length; i += 2) {
    const text = parts[i];
    if (!text.trim()) continue;
    if (kept.length) kept.push(` ${parts[i - 1].trim()} `);
    kept.push(text);
  }
  return kept.join("").replace(/ {2,}/g, " ").trim();
}

/** Varsayılan YouTube başlığı: "OSTİM FUTBOL TURNUVASI 1. SEZON SON 16 TURU · ELİTLİG". */
export const DEFAULT_TITLE_TEMPLATE = "{league} {season} {round} · ELİTLİG";
/** Lig / sezon / tur bilinmiyorsa (sunucu taslağıyla aynı). */
export const FALLBACK_TITLE_TEMPLATE = "{home} - {away} · ELİTLİG";
export const TITLE_UPPER_KEY = "studio.ytTitleUpper.v1";
/** Türkçe büyük harf (i → İ, ı → I). */
export const upperTr = (s) => String(s ?? "").toLocaleUpperCase("tr-TR");
/** Maç verisiyle varsayılan başlık; lig / sezon / tur bilinmiyorsa takım adları. */
export function defaultTitle(vars = {}, { upper = true } = {}) {
  const t = vars.league || vars.season || vars.round ? renderTemplate(DEFAULT_TITLE_TEMPLATE, vars) : renderTemplate(FALLBACK_TITLE_TEMPLATE, vars);
  return smartTrim(upper ? upperTr(t) : t);
}
/**
 * Akıllı kısaltma (YouTube ≤ 100): " · ELİTLİG" gibi son ek korunur, baştaki kısım sözcük sınırında
 * kesilip "…" eklenir.
 */
export function smartTrim(title, max = TITLE_MAX) {
  const s = String(title ?? "").replace(/\s+/g, " ").trim();
  if (s.length <= max) return s;
  const m = /^(.*?)(\s[·|]\s[^·|]{1,30})$/.exec(s);
  const suffix = m ? m[2] : "";
  const head = m ? m[1] : s;
  const room = max - suffix.length - 1;
  let cut = head.slice(0, room);
  const sp = cut.lastIndexOf(" ");
  if (sp > room * 0.6) cut = cut.slice(0, sp);
  return `${cut.replace(/[\s·|,–-]+$/, "")}…${suffix}`.slice(0, max);
}
/** "Başlığı büyük harf yap" tercihi (bu bilgisayarda; varsayılan açık). */
export function readTitleUpper() {
  try { return localStorage.getItem(TITLE_UPPER_KEY) !== "0"; } catch { return true; }
}
export function writeTitleUpper(on) {
  try { localStorage.setItem(TITLE_UPPER_KEY, on ? "1" : "0"); } catch { /* yoksay */ }
}

/** Etiketler: "a, b, #c" / dizi → tekil dizi (YouTube toplamı ≤ 500 karakter). */
export function parseTags(v) {
  const list = Array.isArray(v) ? v : String(v ?? "").split(/[,\n]/);
  const out = [];
  let total = 0;
  for (const raw of list) {
    const t = String(raw ?? "").trim().replace(/^#/, "").replace(/[<>]/g, "").trim().slice(0, 100);
    if (!t || out.some((x) => x.toLocaleLowerCase("tr-TR") === t.toLocaleLowerCase("tr-TR"))) continue;
    if (total + t.length > TAGS_MAX_CHARS) break;
    out.push(t);
    total += t.length + 1;
  }
  return out;
}
export const tagsText = (tags) => (Array.isArray(tags) ? tags.join(", ") : String(tags || ""));

/** Sunucu taslağı / ön ayar → pencere formu (eksikler varsayılanla). */
export function normalizeSettings(x = {}) {
  const v = x || {};
  return {
    title: smartTrim(String(v.title ?? "").replace(/[<>]/g, "")),
    description: String(v.description ?? "").replace(/[<>]/g, "").slice(0, DESCRIPTION_MAX),
    privacy: PRIVACY_KEYS.has(v.privacy) ? v.privacy : "public",
    tags: parseTags(v.tags),
    latency: LATENCY_KEYS.has(v.latency) ? v.latency : "normal",
    dvr: v.dvr !== false,
    made_for_kids: Boolean(v.made_for_kids),
    // Başlık Türkçe büyük harfe çevrilsin mi (ön ayarın "uppercase" alanı; varsayılan açık).
    uppercase: v.uppercase !== false,
  };
}

/** Ön ayar (şablonlu) → bu maçın formu. */
export function settingsFromPreset(preset, vars) {
  const p = preset || {};
  const title = renderTemplate(p.title_template ?? p.title ?? "", vars);
  return normalizeSettings({
    uppercase: p.uppercase,
    title: p.uppercase !== false ? upperTr(title) : title,
    description: renderTemplate(p.description_template ?? p.description ?? "", vars),
    privacy: p.privacy, tags: (Array.isArray(p.tags) ? p.tags : parseTags(p.tags)).map((t) => renderTemplate(t, vars)), latency: p.latency, dvr: p.dvr, made_for_kids: p.made_for_kids,
  });
}

/**
 * Form → ön ayar gövdesi (POST / PUT /youtube-presets). Maçın kendi adları
 * şablona geri çevrilir ("Ankara Gücü – Yıldız" → "{home} – {away}") ki ön ayar
 * başka maçlarda da kullanılabilsin.
 */
export function presetFromSettings(name, settings, vars = {}) {
  const s = normalizeSettings(settings);
  const back = (text) => {
    let out = String(text || "");
    for (const k of ["home", "away", "league", "season", "round", "venue", "city", "date", "time", "link"]) {
      const val = vars[k];
      if (val && String(val).length >= 3) out = out.split(String(val)).join(`{${k}}`).split(upperTr(val)).join(`{${k}}`);
    }
    return out;
  };
  return {
    name: String(name || "").trim().slice(0, 60) || "Ön ayar",
    title_template: back(s.title),
    description_template: back(s.description),
    privacy: s.privacy,
    tags: s.tags.map(back),
    latency: s.latency,
    dvr: s.dvr,
    made_for_kids: s.made_for_kids,
    uppercase: s.uppercase,
  };
}

/** Başlatma / düzenleme gövdesi (POST /matches/:id, PATCH /matches/:id/youtube). */
export function startBody(settings, { edit = false } = {}) {
  const s = normalizeSettings(settings);
  const body = { title: s.title.trim(), description: s.description, privacy: s.privacy, tags: s.tags };
  if (!body.title) delete body.title;
  if (edit) return body;
  return { ...body, latency: s.latency, dvr: s.latency === "ultraLow" ? false : s.dvr, made_for_kids: s.made_for_kids };
}

/** Form denetimi → hata iletileri (boşsa geçerli). */
export function validateSettings(settings) {
  const s = settings || {};
  const out = [];
  const title = String(s.title || "").trim();
  if (!title) out.push("Başlık boş: sunucu maç adını kullanır.");
  if (title.length > TITLE_MAX) out.push(`Başlık en çok ${TITLE_MAX} karakter.`);
  if (/[<>]/.test(`${s.title || ""}${s.description || ""}`)) out.push("YouTube “<” ve “>” karakterlerini kabul etmez.");
  if (String(s.description || "").length > DESCRIPTION_MAX) out.push(`Açıklama en çok ${DESCRIPTION_MAX} karakter.`);
  return out;
}

/* ───────── ön ayarlar: yerel yedek (sunucu uçları yoksa) ───────── */

export const LOCAL_PRESETS_KEY = "studio.ytPresets.v1";

export function normalizePreset(p) {
  if (!p || typeof p !== "object") return null;
  const id = p.id != null ? String(p.id) : null;
  if (!id) return null;
  const s = normalizeSettings({ ...p, title: p.title_template ?? "", description: p.description_template ?? "" });
  return {
    id, name: String(p.name || "Ön ayar").slice(0, 60),
    title_template: String(p.title_template ?? "").slice(0, 300), description_template: String(p.description_template ?? "").slice(0, DESCRIPTION_MAX),
    privacy: s.privacy, tags: Array.isArray(p.tags) ? p.tags.map(String) : s.tags, latency: s.latency, dvr: s.dvr, made_for_kids: s.made_for_kids, uppercase: s.uppercase,
    is_default: Boolean(p.is_default), updated_at: p.updated_at || null, local: Boolean(p.local),
  };
}
export const normalizePresets = (list) => (Array.isArray(list) ? list.map(normalizePreset).filter(Boolean) : []);
export const defaultPreset = (list) => normalizePresets(list).find((p) => p.is_default) || null;
/** Varsayılanı tek yap (saf). */
export const markDefault = (list, id) => normalizePresets(list).map((p) => ({ ...p, is_default: id != null && p.id === String(id) }));
