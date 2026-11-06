// Yayın Stüdyosu · Maç yönetimi — maç listesi, maç oluşturma / düzenleme,
// takım ve oyuncu formları (saf işlevler).
//
//   GET  /api/admin/live-streams/matches?date_from&date_to&mac_durumu&league_id&season_id&city_id&city
//        il kapsamlı liste → { items, scope: { nationwide, city_id, city } } (kapsam SUNUCUDA)
//   GET  /maclar?includeDraft=1&date_from&date_to&mac_durumu&league_id&season_id&city   eski sunucu yedeği
//   İstemci ayrıca kapsam dışı satırları süzer (scopeRows): yalnız yetkili ilin maçları görünür.
//   POST /maclar/add-fikstur        yeni maç (daima taslak açılır; durum ardından PATCH)
//   PATCH /maclar/:id               maç bilgileri (MATCH_UPDATE_FIELDS)
//   POST /takimlar/add              { team_name, current_league, current_season, city, team_points }
//   PATCH /takimlar/:id             TEAM_EDITABLE_FIELDS (team_name, logo, current_league, current_season, active, city, founded_at, colors)
//   POST /oyuncular/add             { player_name, team_id, player_position, attendence_date, city }
//   PATCH /oyuncular/:id            PLAYER_EDITABLE_FIELDS (player_name, player_img, team_id, player_position, birth_date, nationality, active, city …)
//
// Sunucu add uçları multer (multipart) kullanır ama JSON gövdeyi de kabul eder
// (express.json önce çalışır); dosya yükleme masaüstü köprüsünde olmadığı için
// logo / fotoğraf adres (URL) olarak PATCH ile yazılır.

import { isoDay, normalizeMatchStatus } from "./match";

export const MATCH_STATUS_OPTIONS = [
  { value: "taslak", label: "Taslak", hint: "Sitede görünmez" },
  { value: "zamanlanmis", label: "Zamanlandı", hint: "Fikstürde yayınlanır" },
  { value: "canli", label: "Canlı", hint: "Maç oynanıyor" },
  { value: "yayinlanmis", label: "Tamamlandı", hint: "Skor tescil, puan durumu hesaplanır" },
];
export const statusLabel = (raw) => MATCH_STATUS_OPTIONS.find((o) => o.value === normalizeMatchStatus(raw))?.label || "Durum yok";

/** Eski kayıtlarda boş metin alanları "none" ile dolu gelir. */
export const cleanText = (value) => {
  const text = value == null ? "" : String(value).trim();
  return text.toLocaleLowerCase("tr-TR") === "none" ? "" : text;
};

const fold = (value) => String(value ?? "").trim().toLocaleLowerCase("tr-TR").normalize("NFD").replace(/[̀-ͯ]/g, "");
export const foldText = fold;

/** utils/cityScope.isTurkeyAdminScope ile aynı: admin rolü + il "Türkiye". */
export const isNationwide = (user) => Boolean(user && user.role === "admin" && ["turkiye", "turkey"].includes(fold(user.city)));

/** Maç tarihinin yerel günü: "2026-11-04T21:00:00.000Z" gibi değerlerde saat dilimi hesaba katılır. */
export function matchDay(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  if (/^\d{4}-\d{2}-\d{2}[ T]00:00:00(\.0+)?$/.test(text)) return text.slice(0, 10);
  const d = new Date(text);
  return Number.isNaN(d.getTime()) ? text.slice(0, 10) || null : isoDay(d);
}

/** GET /maclar satırı → liste satırı. */
export function toListMatch(m) {
  if (!m || m.id == null) return null;
  const status = normalizeMatchStatus(m.mac_durumu ?? m.status);
  return {
    id: Number(m.id),
    date: matchDay(m.date ?? m.match_date),
    time: String(m.time ?? m.match_time ?? "").slice(0, 5),
    home: m.first_team_name || m.home || "Ev sahibi",
    away: m.second_team_name || m.away || "Deplasman",
    homeScore: m.first_team_score ?? null,
    awayScore: m.second_team_score ?? null,
    field: cleanText(m.match_field),
    league: m.league_name || "",
    season: m.match_season || "",
    city: m.city || "",
    cityId: m.city_id == null || m.city_id === "" ? null : Number(m.city_id),
    status,
  };
}

/* ------------------------------ il kapsamı ------------------------------ */

/**
 * Listenin kapsamı: sunucunun döndürdüğü { nationwide, city_id, city } esastır;
 * yoksa (eski sunucu) kullanıcıdan çıkarılır. Kullanıcı da bilinmiyorsa null:
 * yetki anlaşılana kadar hiçbir maç gösterilmez.
 * → { nationwide, cityId, city, source: "server" | "user" } | null
 */
export function matchScopeOf(user, serverScope) {
  if (serverScope && typeof serverScope === "object" && "nationwide" in serverScope) {
    return { nationwide: Boolean(serverScope.nationwide), cityId: serverScope.city_id == null ? null : Number(serverScope.city_id), city: serverScope.city || "", source: "server" };
  }
  if (!user) return null;
  return { nationwide: isNationwide(user), cityId: null, city: user.city || "", source: "user" };
}

/** Satır kapsam içinde mi? (city_id varsa kimlikle, yoksa il adıyla; ilsiz satır il kısıtlıya kapalı.) */
export function inScope(m, scope) {
  if (!scope) return false;
  if (scope.nationwide) return true;
  if (scope.cityId != null && m?.cityId != null) return Number(m.cityId) === Number(scope.cityId);
  return Boolean(scope.city && m?.city && fold(m.city) === fold(scope.city));
}

/** Liste satırlarından (toListMatch çıktısı) kapsam dışındakileri atar. */
export const scopeRows = (rows, scope) => (rows || []).filter((m) => inScope(m, scope));

/** Sunucunun bilinmeyen uç yanıtı (eski sunucu: 404, kod yok) — yedek uca düşülür. */
export const isMissingRoute = (res) => Boolean(res && !res.ok && !res.offline && Number(res.error?.status) === 404 && !res.error?.code);

/** Kapsamlı liste yanıtı → { rows, scope } (düz dizi de kabul edilir). */
export function readScopedList(data) {
  if (Array.isArray(data)) return { rows: data, scope: null };
  return { rows: asArray(data, "matches"), scope: data && typeof data === "object" && data.scope && typeof data.scope === "object" ? data.scope : null };
}

/** Süzgeç gövdesi: aralık sunucuya, kesin gün ve arama istemcide. */
export function matchListQuery({ from, to, status, leagueId, seasonId, city } = {}) {
  return {
    includeDraft: 1,
    limit: 500,
    date_from: from || undefined,
    date_to: to || from || undefined,
    mac_durumu: status || undefined,
    league_id: leagueId || undefined,
    season_id: seasonId || undefined,
    city: city || undefined,
  };
}

export function filterMatches(rows, { from, to, q, status } = {}) {
  const needle = fold(q);
  return (rows || [])
    .map(toListMatch)
    .filter(Boolean)
    .filter((m) => (!from || (m.date && m.date >= from)) && (!to || (m.date && m.date <= to)))
    .filter((m) => !status || m.status === status)
    .filter((m) => !needle || fold(`${m.home} ${m.away} ${m.field} ${m.league} ${m.id}`).includes(needle))
    .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")) || String(a.time || "99").localeCompare(String(b.time || "99")) || a.id - b.id);
}

/** Tarih aralığı kısayolları. */
export function rangePreset(key, today = isoDay()) {
  const [y, m, d] = today.split("-").map(Number);
  const at = (n) => isoDay(new Date(y, m - 1, d + n));
  switch (key) {
    case "today": return { from: today, to: today };
    case "tomorrow": return { from: at(1), to: at(1) };
    case "yesterday": return { from: at(-1), to: at(-1) };
    case "week": return { from: at(-1), to: at(6) };
    case "past": return { from: at(-14), to: at(-1) };
    default: return { from: today, to: today };
  }
}

/* ------------------------------ maç oluştur ------------------------------ */

/** Formun eksikleri (mobil mac-olustur ile aynı sıra). */
export function validateFixture(f, { hasGroups = false } = {}) {
  if (!f?.city) return "İl seçilmeli.";
  if (!f.leagueId || !f.seasonId) return "Lig ve sezon seçimi zorunludur.";
  if (hasGroups && !f.groupId) return "Bu sezon gruplara ayrılmış; grubu seç.";
  if (!f.home?.id || !f.away?.id) return "İki takımı da seç.";
  if (Number(f.home.id) === Number(f.away.id)) return "Aynı takımı iki kez seçemezsin.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(f.date || ""))) return "Tarih seçmelisin.";
  if (!/^\d{1,2}:\d{2}$/.test(String(f.time || ""))) return "Saat seçmelisin.";
  return "";
}

/** POST /maclar/add-fikstur gövdesi. */
export function fixtureCreatePayload(f, { hasGroups = false } = {}) {
  const home = String(f.home?.name || "").trim();
  const away = String(f.away?.name || "").trim();
  return {
    first_team_name: home,
    second_team_name: away,
    date: f.date,
    time: f.time,
    match_field: String(f.venue || "").trim(),
    league_name: f.leagueLabel || "",
    match_season: f.seasonLabel || "",
    match_title: `${home} vs ${away}`,
    city: f.city,
    is_it_fixture: true,
    home_team_id: Number(f.home?.id) || null,
    away_team_id: Number(f.away?.id) || null,
    league_id: Number(f.leagueId) || null,
    season_id: Number(f.seasonId) || null,
    group_id: hasGroups && f.groupId ? Number(f.groupId) : null,
  };
}

/* ------------------------------ maç düzenle ------------------------------ */

/** GET /api/maclar/:id kaydı → düzenleme formu. */
export function matchToForm(m) {
  return {
    date: matchDay(m?.date) || "",
    time: String(m?.time || "").slice(0, 5),
    venue: cleanText(m?.match_field),
    status: normalizeMatchStatus(m?.mac_durumu) || "taslak",
    video: cleanText(m?.match_video),
    title: cleanText(m?.match_title),
    homeName: m?.first_team_name || "",
    awayName: m?.second_team_name || "",
  };
}

/** PATCH /maclar/:id — yalnız değişen alanlar (skor ve takım kimliklerine dokunmaz). */
export function matchUpdatePayload(form, original) {
  const before = matchToForm(original || {});
  const out = {};
  if (form.date !== before.date) out.date = form.date || null;
  if (form.time !== before.time) out.time = form.time || null;
  if (form.venue !== before.venue) out.match_field = String(form.venue || "").trim();
  if (form.status !== before.status) out.mac_durumu = form.status || "taslak";
  if (form.video !== before.video) out.match_video = String(form.video || "").trim();
  if (form.title !== before.title) out.match_title = String(form.title || "").trim();
  return out;
}

export const isHttpUrl = (text) => /^https?:\/\/\S+$/i.test(String(text || "").trim());

/* ------------------------------ görevlendirme ------------------------------ */

export const FALLBACK_DUTIES = [
  { key: "spiker", label: "Spiker" },
  { key: "reji", label: "Reji" },
  { key: "hakem", label: "Hakem" },
  { key: "fotografci", label: "Fotoğrafçı" },
  { key: "saglikci", label: "Sağlıkçı" },
];

/** GET /api/staff/matches/:id → { görev: "personelId" } */
export function readAssignments(data) {
  const out = {};
  for (const [key, value] of Object.entries(data?.assignments || {})) out[key] = value?.staffId ? String(value.staffId) : "";
  return out;
}

/* --------------------------- takım ve oyuncu --------------------------- */

/** constants/positions.js — Players.player_position okunur ETİKET saklar. */
export const POSITIONS = [
  { code: "KL", label: "Kaleci" },
  { code: "STP", label: "Stoper" },
  { code: "SLB", label: "Sol Bek" },
  { code: "SGB", label: "Sağ Bek" },
  { code: "DOS", label: "Defansif Orta Saha" },
  { code: "MOS", label: "Merkez Orta Saha" },
  { code: "OOS", label: "Ofansif Orta Saha" },
  { code: "SLK", label: "Sol Kanat" },
  { code: "SGK", label: "Sağ Kanat" },
  { code: "FOR", label: "Forvet" },
  { code: "SNT", label: "Santrafor" },
];

export const DEFAULT_TEAM_LOGO = "https://elitlig-space.fra1.digitaloceanspaces.com/teamLogos/default_team.png";

/** Sunucu bazen düz dizi, bazen { data | items | teams } döndürür. */
export function asArray(payload, ...keys) {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object") {
    for (const key of ["data", "items", ...keys]) if (Array.isArray(payload[key])) return payload[key];
  }
  return [];
}

export function filterTeams(list, q) {
  const needle = fold(q);
  return asArray(list, "teams")
    .filter((t) => !needle || fold(`${t.team_name} ${t.current_league || ""} ${t.id}`).includes(needle))
    .sort((a, b) => String(a.team_name || "").localeCompare(String(b.team_name || ""), "tr"));
}

export function validateTeam(f) {
  if (!String(f?.team_name || "").trim()) return "Takım adı zorunlu.";
  if (f.logo && !isHttpUrl(f.logo)) return "Logo adresi http:// ya da https:// ile başlamalı.";
  return "";
}

/** POST /takimlar/add gövdesi. */
export const teamCreatePayload = (f) => ({
  team_name: String(f.team_name || "").trim(),
  current_league: String(f.current_league || "").trim(),
  current_season: String(f.current_season || "").trim(),
  city: f.city || undefined,
  team_points: 0,
});

/** PATCH /takimlar/:id — yalnız değişenler. */
export function teamUpdatePayload(f, original = {}) {
  const out = {};
  for (const key of ["team_name", "current_league", "current_season", "colors", "founded_at", "logo"]) {
    const next = String(f[key] ?? "").trim();
    const prev = String(original[key] ?? "").trim();
    if (next !== prev) out[key] = next || null;
  }
  if (out.team_name === null) delete out.team_name;
  if (f.active !== undefined && Boolean(f.active) !== Boolean(original.active ?? true)) out.active = Boolean(f.active);
  return out;
}

export function validatePlayer(f, { needsTeam = true } = {}) {
  if (!String(f?.player_name || "").trim()) return "Oyuncu adı zorunlu.";
  if (needsTeam && !Number(f.team_id)) return "Takım seç.";
  if (f.birth_date && !/^\d{4}-\d{2}-\d{2}$/.test(f.birth_date)) return "Doğum tarihi geçersiz.";
  if (f.player_img && !isHttpUrl(f.player_img)) return "Fotoğraf adresi http:// ya da https:// ile başlamalı.";
  return "";
}

/** POST /oyuncular/add gövdesi; doğum tarihi / uyruk ardından PATCH ile yazılır. */
export const playerCreatePayload = (f, today = isoDay()) => ({
  player_name: String(f.player_name || "").trim(),
  team_id: Number(f.team_id),
  player_position: f.player_position || null,
  attendence_date: today,
  city: f.city || undefined,
});

/** PATCH /oyuncular/:id — yalnız değişenler. */
export function playerUpdatePayload(f, original = {}) {
  const out = {};
  for (const key of ["player_name", "player_position", "birth_date", "nationality", "player_img"]) {
    const next = String(f[key] ?? "").trim();
    const prev = String(key === "birth_date" ? String(original[key] ?? "").slice(0, 10) : original[key] ?? "").trim();
    if (next !== prev) out[key] = next || null;
  }
  if (out.player_name === null) delete out.player_name;
  if (f.active !== undefined && Boolean(f.active) !== Boolean(original.active ?? true)) out.active = Boolean(f.active);
  return out;
}

/** Oluşturma sonrası ek alanlar (createPlayerWithDetails). */
export function playerExtraPayload(f) {
  const out = {};
  if (f.birth_date) out.birth_date = f.birth_date;
  if (f.nationality) out.nationality = String(f.nationality).trim();
  if (f.player_img) out.player_img = String(f.player_img).trim();
  return out;
}

/** Maç seçimi: canlı maçlar en üstte, sonra liste sırası (gün / saat). */
export function liveFirst(rows) {
  const list = rows || [];
  return [...list.filter((m) => m.status === "canli"), ...list.filter((m) => m.status !== "canli")];
}

/**
 * Canlı maç şeridi: canlı satırlar (tarih süzgeci yok), saate göre.
 * scope verilirse kapsam dışı (başka ilin) maçlar atılır; city yalnız seçili il süzgecidir.
 */
export function liveStripRows(rows, { city, scope } = {}) {
  return (rows || [])
    .map(toListMatch)
    .filter((m) => m && m.status === "canli" && (!city || fold(m.city) === fold(city)) && (scope === undefined || inScope(m, scope)))
    .sort((a, b) => String(a.time || "99").localeCompare(String(b.time || "99")) || a.id - b.id)
    .slice(0, 12);
}
