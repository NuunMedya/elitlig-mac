// Panorama yayını · WEB SİTESİ VERİSİ (kartların içeriği).
//
// Birincil kaynak: sunucunun toplu ucu
//   GET /api/broadcast/panorama?cityId=&leagueId=&seasonId=&groupId=   (elitlig-server
//   routes/broadcastPanorama.js; herkese açık, 30 sn önbellekli, tek istek)
// Uç sunucuda yoksa (404 / 405 / 501 — eski sunucu) aynı biçim web sitesinin kullandığı
// herkese açık uçlardan kurulur (sitedeki gibi):
//   /api/meta/cities · /api/meta/leagues · /api/meta/seasons · /api/meta/default-scope · /api/meta/groups
//   /api/standings · /maclar?league_id&season_id · /api/players/statistics (topScorers, mostAssists,
//   mostValuable) · /api/weekly-awards/public · /api/news · /public/sponsors
//
// Çıktı (sürüm 1; sunucu ucuyla birebir): { version, source, generatedAt, today, scope: { city, league,
// season, groupId }, options: { cities, leagues, seasons, groups? }, standings: { type, rows }, fixtures,
// results, live, scorers, assists, mvp, weekly, news, sponsors, errors }
// normalizePanoramaData her iki kaynağı da süzer (eksik alan → boş liste; yayına bozuk veri gitmez).

const toInt = (v) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
};
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const numOrNull = (v) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const str = (v, max = 200) => (v == null ? null : String(v).slice(0, max));
const arr = (v) => (Array.isArray(v) ? v : []);
const url = (v) => (typeof v === "string" && /^(https?:|data:|blob:|elitlig-)/i.test(v) ? v : null);

export const PANORAMA_DATA_VERSION = 1;
export const EMPTY_PANORAMA_DATA = Object.freeze({
  version: PANORAMA_DATA_VERSION, source: "none", generatedAt: null, today: null,
  scope: { city: null, league: null, season: null, groupId: null }, options: { cities: [], leagues: [], seasons: [], groups: [] },
  standings: { type: "standart", rows: [] }, fixtures: [], results: [], live: [], scorers: [], assists: [], mvp: [], weekly: null, news: [], sponsors: [], errors: [],
});

/** "2026-11-12T00:00:00.000Z" → "2026-11-12". */
export function dayOf(v) {
  if (!v) return null;
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(v));
  return m ? m[1] : null;
}
export const timeOf = (v) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(v || ""));
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : null;
};

/** İstanbul saatiyle bugün (YYYY-MM-DD). */
export function istanbulToday(now = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
    const get = (t) => parts.find((p) => p.type === t)?.value;
    return `${get("year")}-${get("month")}-${get("day")}`;
  } catch { return new Date(now).toISOString().slice(0, 10); }
}

const option = (o) => (o && toInt(o.id) ? { id: toInt(o.id), label: str(o.label ?? o.name, 80) || `#${o.id}` } : null);
const options = (list) => arr(list).map(option).filter(Boolean);

export const normalizeMatch = (m) => ({
  id: toInt(m?.id),
  homeName: str(m?.homeName, 80) || "",
  awayName: str(m?.awayName, 80) || "",
  homeId: toInt(m?.homeId),
  awayId: toInt(m?.awayId),
  homeLogo: url(m?.homeLogo),
  awayLogo: url(m?.awayLogo),
  homeScore: numOrNull(m?.homeScore),
  awayScore: numOrNull(m?.awayScore),
  date: dayOf(m?.date),
  time: timeOf(m?.time),
  field: str(m?.field, 80),
  status: str(m?.status, 20),
});

export const normalizeStanding = (r, i) => ({
  rank: num(r?.rank) || i + 1,
  teamId: toInt(r?.teamId),
  teamName: str(r?.teamName, 80) || "",
  teamLogo: url(r?.teamLogo),
  played: num(r?.played), wins: num(r?.wins), draws: num(r?.draws), losses: num(r?.losses),
  goalsFor: num(r?.goalsFor), goalsAgainst: num(r?.goalsAgainst), goalDiff: num(r?.goalDiff), points: num(r?.points),
  last5: String(r?.last5 || "").replace(/[^WDL]/gi, "").toUpperCase().slice(-5),
});

export const normalizePlayer = (p, i) => ({
  rank: num(p?.rank) || i + 1,
  playerId: toInt(p?.playerId),
  name: str(p?.name, 80) || "",
  image: url(p?.image),
  teamId: toInt(p?.teamId),
  teamName: str(p?.teamName, 80),
  teamLogo: url(p?.teamLogo),
  position: str(p?.position, 40),
  matches: num(p?.matches), goals: num(p?.goals), assists: num(p?.assists), points: num(p?.points),
  average: numOrNull(p?.average),
});

function normalizeWeekly(w) {
  if (!w || !Array.isArray(w.items) || !w.items.length) return null;
  return {
    title: str(w.title, 80) || "Haftanın Enleri",
    subtitle: str(w.subtitle, 80),
    formation: str(w.formation, 20),
    items: w.items.slice(0, 16).map((it) => ({
      awardType: str(it?.awardType, 40), awardLabel: str(it?.awardLabel, 40), lead: Boolean(it?.lead), isTeam: Boolean(it?.isTeam),
      name: str(it?.name, 80) || "", image: url(it?.image), position: str(it?.position, 40), teamName: str(it?.teamName, 80), teamLogo: url(it?.teamLogo),
      stats: it?.stats ? { matches: num(it.stats.matches), goals: num(it.stats.goals), assists: num(it.stats.assists), rating: num(it.stats.rating) } : null,
    })),
  };
}

const normalizeNews = (n) => ({ id: str(n?.id, 64), title: str(n?.title, 160) || "", summary: str(n?.summary, 280), image: url(n?.image), category: str(n?.category, 40), publishedAt: str(n?.publishedAt, 40) });
const normalizeSponsor = (s) => ({ id: toInt(s?.id), name: str(s?.name, 80) || "", tagline: str(s?.tagline, 120), linkUrl: str(s?.linkUrl, 300), brandColor: str(s?.brandColor, 20), logo: url(s?.logo), banner: url(s?.banner) });

/** Her iki kaynağın (sunucu / herkese açık uçlar) çıktısını süzer. */
export function normalizePanoramaData(raw) {
  if (!raw || typeof raw !== "object") return EMPTY_PANORAMA_DATA;
  const sc = raw.scope || {};
  return {
    version: PANORAMA_DATA_VERSION,
    source: str(raw.source, 20) || "server",
    generatedAt: str(raw.generatedAt, 40),
    today: dayOf(raw.today),
    scope: { city: option(sc.city), league: option(sc.league), season: option(sc.season), groupId: toInt(sc.groupId) },
    options: { cities: options(raw.options?.cities), leagues: options(raw.options?.leagues), seasons: options(raw.options?.seasons), groups: options(raw.options?.groups) },
    standings: { type: str(raw.standings?.type, 20) || "standart", rows: arr(raw.standings?.rows).slice(0, 40).map(normalizeStanding) },
    fixtures: arr(raw.fixtures).slice(0, 30).map(normalizeMatch),
    results: arr(raw.results).slice(0, 30).map(normalizeMatch),
    live: arr(raw.live).slice(0, 20).map(normalizeMatch),
    scorers: arr(raw.scorers).slice(0, 20).map(normalizePlayer),
    assists: arr(raw.assists).slice(0, 20).map(normalizePlayer),
    mvp: arr(raw.mvp).slice(0, 20).map(normalizePlayer),
    weekly: normalizeWeekly(raw.weekly),
    news: arr(raw.news).slice(0, 20).map(normalizeNews).filter((n) => n.title),
    sponsors: arr(raw.sponsors).slice(0, 30).map(normalizeSponsor).filter((s) => s.name || s.logo),
    errors: arr(raw.errors).map((e) => String(e)).slice(0, 20),
  };
}

/* ───────────────────── herkese açık uçlardan kurma (eski sunucu) ───────────────────── */

const LIVE = new Set(["canli", "live", "inplay"]);
const SCHEDULED = new Set(["zamanlanmis", "zamanlandi"]);
const PUBLISHED = new Set(["yayinlanmis", "bitti"]);

/** /maclar satırı → maç (armalar takım haritasından). */
export function matchFromLegacy(m, crests = new Map()) {
  return normalizeMatch({
    id: m.id, homeName: m.first_team_name, awayName: m.second_team_name, homeId: m.home_team_id, awayId: m.away_team_id,
    homeLogo: crests.get(Number(m.home_team_id)) || null, awayLogo: crests.get(Number(m.away_team_id)) || null,
    homeScore: m.first_team_score, awayScore: m.second_team_score, date: m.date, time: m.time, field: m.match_field, status: m.mac_durumu,
  });
}
const stamp = (m) => `${m.date || "0000-00-00"} ${m.time || "00:00"}`;

/** /maclar listesi → { fixtures, results, live } (bugün ve sonrası fikstür; en yeni sonuçlar). */
export function splitMatches(rows, { today, crests = new Map(), limits = { fixtures: 12, results: 12, live: 12 } } = {}) {
  const all = arr(rows).filter((m) => m && m.mac_durumu !== "taslak").map((m) => ({ raw: m, m: matchFromLegacy(m, crests) }));
  const live = all.filter(({ raw }) => LIVE.has(String(raw.mac_durumu || "").toLowerCase())).map(({ m }) => m);
  const fixtures = all.filter(({ raw, m }) => SCHEDULED.has(String(raw.mac_durumu || "").toLowerCase()) && (!today || !m.date || m.date >= today)).map(({ m }) => m)
    .sort((a, b) => stamp(a).localeCompare(stamp(b))).slice(0, limits.fixtures);
  const results = all.filter(({ raw }) => PUBLISHED.has(String(raw.mac_durumu || "").toLowerCase())).map(({ m }) => m)
    .sort((a, b) => stamp(b).localeCompare(stamp(a))).slice(0, limits.results);
  return { fixtures, results, live: live.slice(0, limits.live) };
}

/** /api/standings ham satırı → puan satırı. */
export const standingFromLegacy = (r, i) => normalizeStanding({
  rank: i + 1, teamId: r.team_id, teamName: r.team_name || r.team?.team_name, teamLogo: r.logo || r.team?.logo,
  played: r.played, wins: r.wins, draws: r.draws, losses: r.losses, goalsFor: r.goals_for, goalsAgainst: r.goals_against, goalDiff: r.goal_diff,
  points: r.display_points ?? r.balance_total_points ?? r.total_points, last5: r.last5,
}, i);

/** /api/players/statistics satırı → oyuncu. */
export const playerFromStats = (p, i) => normalizePlayer({
  rank: i + 1, playerId: p.playerId, name: p.playerName, image: p.playerImage, teamId: p.teamId, teamName: p.teamName, teamLogo: p.teamLogo,
  position: p.position, matches: p.matchesPlayed, goals: p.totalGoals, assists: p.assists, points: p.totalPoints, average: p.averagePoints,
}, i);

const WEEKLY_LABELS = { WEEKLY_PLAYER: "Haftanın Oyuncusu", WEEKLY_GOALKEEPER: "Kaleci", WEEKLY_DEFENDER: "Defans", WEEKLY_MIDFIELDER: "Orta Saha", WEEKLY_FORWARD: "Forvet", WEEKLY_FAIR_PLAY: "Haftanın Centilmeni", WEEKLY_TEAM: "Haftanın Takımı" };
const prettyDay = (d) => (dayOf(d) ? dayOf(d).split("-").reverse().join(".") : null);

/** /api/weekly-awards/public seti → haftanın enleri. */
export function weeklyFromPublic(set) {
  if (!set || !Array.isArray(set.items) || !set.items.length) return null;
  const items = [...set.items].sort((a, b) => (a.award_type === "WEEKLY_PLAYER" ? 0 : 1) - (b.award_type === "WEEKLY_PLAYER" ? 0 : 1) || (num(a.sort_order) - num(b.sort_order)));
  const from = prettyDay(set.start_date);
  const to = prettyDay(set.end_date);
  return normalizeWeekly({
    title: set.title ? String(set.title).replace(/^./, (c) => c.toLocaleUpperCase("tr-TR")) : "Haftanın Enleri",
    subtitle: from && to && from !== to ? `${from} — ${to}` : from || to,
    formation: set.formation,
    items: items.map((it) => {
      const isTeam = !it.player_id && it.team_id;
      return {
        awardType: it.award_type, awardLabel: WEEKLY_LABELS[it.award_type] || null, lead: it.award_type === "WEEKLY_PLAYER", isTeam: Boolean(isTeam),
        name: isTeam ? it.team_name : it.player_name, image: isTeam ? null : it.player_img, position: it.player_position,
        teamName: isTeam ? null : it.player_team_name || it.team_name, teamLogo: isTeam ? it.team_logo : it.player_team_logo || it.team_logo, stats: it.stats,
      };
    }),
  });
}

/** Haber: kapak, yoksa içerikteki ilk görsel; gövde taşınmaz. */
export function newsFromPublic(n) {
  const img = n?.cover_image_url || (/<img[^>]+src=["']([^"']+)["']/i.exec(String(n?.content || "")) || [])[1] || null;
  return normalizeNews({ id: n?.id, title: n?.title, summary: n?.summary, image: img, category: n?.category_label || n?.category, publishedAt: n?.published_at });
}

export function sponsorFromPublic(s) {
  const images = s?.images && typeof s.images === "object" ? s.images : {};
  const logo = images.logo || images.banner || images.square || Object.values(images).find((v) => typeof v === "string") || null;
  return normalizeSponsor({ id: s?.id, name: s?.name, tagline: s?.tagline, linkUrl: s?.linkUrl, brandColor: s?.brandColor, logo, banner: images.banner || images.wide || null });
}

/** Takım kimliği → arma (puan tablosundan; /maclar satırlarında arma yok). */
export function crestsOf(standingsRaw) {
  const map = new Map();
  for (const r of arr(standingsRaw)) { const id = Number(r.team_id); const logo = r.logo || r.team?.logo; if (id && logo) map.set(id, logo); }
  return map;
}

/**
 * Herkese açık uç yanıtlarından toplu veri. parts: { cities, leagues, seasons, groups, scope: { cityId, leagueId, seasonId, groupId },
 * standings (ham /api/standings), matches (/maclar), scorers, assists, mvp (/api/players/statistics), weekly (set), news (öğeler), sponsors }
 */
export function buildFromPublic(parts, { now = new Date() } = {}) {
  const today = istanbulToday(now);
  const sc = parts.scope || {};
  const pick = (list, id) => options(list).find((o) => o.id === toInt(id)) || null;
  const standingsRaw = arr(parts.standings?.standings);
  const crests = crestsOf(standingsRaw);
  const split = splitMatches(parts.matches, { today, crests });
  return normalizePanoramaData({
    version: PANORAMA_DATA_VERSION,
    source: "public",
    generatedAt: new Date(now).toISOString(),
    today,
    scope: { city: pick(parts.cities, sc.cityId), league: pick(parts.leagues, sc.leagueId), season: pick(parts.seasons, sc.seasonId), groupId: sc.groupId || null },
    options: { cities: parts.cities, leagues: parts.leagues, seasons: parts.seasons, groups: parts.groups },
    standings: { type: parts.standings?.standings_type || "standart", rows: standingsRaw.slice(0, 30).map(standingFromLegacy) },
    ...split,
    scorers: arr(parts.scorers).slice(0, 10).map(playerFromStats),
    assists: arr(parts.assists).slice(0, 10).map(playerFromStats),
    mvp: arr(parts.mvp).slice(0, 10).map(playerFromStats),
    weekly: weeklyFromPublic(parts.weekly),
    news: arr(parts.news).slice(0, 8).map(newsFromPublic),
    sponsors: arr(parts.sponsors).map(sponsorFromPublic),
    errors: arr(parts.errors),
  });
}

/* ─────────────────────────────── çekme ─────────────────────────────── */

const notSupported = (res) => Boolean(res && !res.ok && !res.offline && [404, 405, 501].includes(Number(res.error?.status)));

/**
 * Toplu veriyi çeker. request: api.js request({ path, query, cache }).
 * scope: { cityId, leagueId?, seasonId?, groupId? }. Dönüş: normalizePanoramaData çıktısı (+ offline).
 * İlk denemede toplu uç yoksa (eski sunucu) bu oturumda bir daha denenmez (state.legacy).
 */
export async function fetchPanoramaData(request, scope, state = {}) {
  const cityId = toInt(scope?.cityId);
  if (!cityId) throw new Error("Önce şehir seç.");
  const q = { cityId, leagueId: toInt(scope.leagueId) || undefined, seasonId: toInt(scope.seasonId) || undefined, groupId: toInt(scope.groupId) || undefined };
  if (!state.legacy) {
    const res = await request({ path: "/api/broadcast/panorama", query: q, cache: true });
    if (res?.ok && res.data) return { ...normalizePanoramaData(res.data), offline: Boolean(res.offline) };
    if (!notSupported(res)) throw new Error(res?.offline ? "Bağlantı yok: panorama verisi alınamadı." : res?.error?.message || "Panorama verisi alınamadı.");
    state.legacy = true;
  }
  return fetchFromPublic(request, q);
}

/** Herkese açık uçlardan (sırayla değil: bağımsızlar aynı anda). */
export async function fetchFromPublic(request, q) {
  const errors = [];
  const get = async (name, path, query) => {
    const res = await request({ path, query, cache: true });
    if (res?.ok) return res.data;
    errors.push(name);
    return null;
  };
  const cities = (await get("cities", "/api/meta/cities"))?.cities || [];
  let { leagueId, seasonId } = q;
  if (!leagueId || !seasonId) {
    const d = await get("scope", "/api/meta/default-scope", { cityId: q.cityId });
    leagueId = leagueId || d?.leagueId;
    if (!seasonId && d?.leagueId === leagueId) seasonId = d?.seasonId;
  }
  const leagues = (await get("leagues", "/api/meta/leagues", { cityId: q.cityId }))?.leagues || [];
  if (!leagueId) leagueId = leagues[0]?.id;
  const seasons = leagueId ? (await get("seasons", "/api/meta/seasons", { cityId: q.cityId, leagueId }))?.seasons || [] : [];
  if (!seasonId) seasonId = seasons[0]?.id;
  const scopeQ = { cityId: q.cityId, leagueId, seasonId, ...(q.groupId ? { groupId: q.groupId } : {}) };
  const stats = (sort) => get(sort, "/api/players/statistics", { ...scopeQ, sort, limit: 10, offset: 0 }).then((d) => d?.players || []);
  const [groups, standings, matches, scorers, assists, mvp, weekly, news, sponsors] = await Promise.all([
    seasonId ? get("groups", "/api/meta/groups", { seasonId }).then((d) => d?.groups || []) : [],
    seasonId ? get("standings", "/api/standings", scopeQ) : null,
    seasonId ? get("matches", "/maclar", { league_id: leagueId, season_id: seasonId }).then((d) => (Array.isArray(d) ? d : d?.matches || [])) : [],
    seasonId ? stats("topScorers") : [],
    seasonId ? stats("mostAssists") : [],
    seasonId ? stats("mostValuable") : [],
    get("weekly", "/api/weekly-awards/public", { cityId: q.cityId, ...(seasonId ? { seasonId } : {}), limit: 1 }).then((d) => d?.items?.[0] || null),
    get("news", "/api/news", { cityId: q.cityId, limit: 8 }).then((d) => d?.items || []),
    get("sponsors", "/public/sponsors", { cityId: q.cityId }).then((d) => d?.sponsors || []),
  ]);
  return buildFromPublic({ cities, leagues, seasons, groups, scope: { cityId: q.cityId, leagueId, seasonId, groupId: q.groupId }, standings, matches, scorers, assists, mvp, weekly, news, sponsors, errors });
}

/** Kartlarda kullanılan bütün görsel adresleri (önceden yükleme / çizim işçisine aktarma). */
export function dataImageUrls(d) {
  if (!d) return [];
  const out = [];
  for (const r of d.standings?.rows || []) out.push(r.teamLogo);
  for (const m of [...(d.fixtures || []), ...(d.results || []), ...(d.live || [])]) out.push(m.homeLogo, m.awayLogo);
  for (const p of [...(d.scorers || []), ...(d.assists || []), ...(d.mvp || [])]) out.push(p.image, p.teamLogo);
  for (const it of d.weekly?.items || []) out.push(it.image, it.teamLogo);
  for (const n of d.news || []) out.push(n.image);
  for (const s of d.sponsors || []) out.push(s.logo);
  return [...new Set(out.filter((u) => typeof u === "string" && u))];
}
