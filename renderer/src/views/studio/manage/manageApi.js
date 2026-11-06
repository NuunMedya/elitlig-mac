// Yayın Stüdyosu · Maç yönetimi — sunucu uçları. studioApi.js ile aynı kural:
// yazmalar önbelleksiz ve kuyruksuz (ya hemen olur ya da hata gösterilir);
// seçici listeleri (il, lig, sezon, takım, saha) kısa önbellekli okunur.
// Her işlev { ok, data, error } döndürür (api.js → window.elitlig.request).
import { request } from "../../../api";

const live = (method, path, body, query) => request({ method, path, body, query, cache: false, queue: false });
const read = (path, query) => request({ path, query, cache: true });

/* ------------------------------- maç ------------------------------- */
export const getAdminMatch = (id) => live("GET", `/api/maclar/${id}`);
/** Herkese açık liste (her il). Yalnız eski sunucuda yedek olarak kullanılır. */
export const listMatches = (query) => live("GET", "/maclar", undefined, query);
/** İl kapsamlı liste (matches.live): { items, scope: { nationwide, city_id, city } }; kapsam sunucuda uygulanır. */
export const listScopedMatches = (query) => live("GET", "/api/admin/live-streams/matches", undefined, query);
export const createFixture = (body) => live("POST", "/maclar/add-fikstur", body);
export const updateMatch = (id, body) => live("PATCH", `/maclar/${id}`, body);
export const deleteMatch = (id) => live("DELETE", `/maclar/${id}`);

/* ------------------------------ olaylar ------------------------------ */
export const getEvents = (id) => live("GET", `/api/maclar/${id}/olaylar`);
export const createEvent = (id, body) => live("POST", `/api/maclar/${id}/olaylar`, body);
export const updateEvent = (id, eventId, body) => live("PUT", `/api/maclar/${id}/olaylar/${eventId}`, body);
export const deleteEvent = (id, eventId) => live("DELETE", `/api/maclar/${id}/olaylar/${eventId}`);

/* ------------------------------- kadro ------------------------------- */
export const getLineup = (id) => live("GET", `/api/maclar/${id}/kadro`);
export const saveLineup = (id, body) => live("POST", `/api/maclar/${id}/kadro`, body);
/** Oyuncu oluşturup takımın kalıcı kadrosuna bağlar: { playerName, teamId, side, position }. */
export const createRosterPlayer = (id, body) => live("POST", `/maclar/${id}/guest-players`, body);
export const getTeamRoster = (teamId) => live("GET", `/oyuncu-takimlari/${teamId}`);
export const searchPlayers = ({ q, scopeCity, teamId, pageSize = 25, page = 1 }) =>
  live("GET", "/api/players/admin-list", undefined, { q: q?.trim() || undefined, scopeCity: scopeCity || undefined, teamId: teamId || undefined, page, pageSize, sort: q ? "name" : "recent" });

/* --------------------------- yayın grafikleri --------------------------- */
export const setOverlayStatus = (id, body) => live("PUT", `/api/maclar/${id}/overlay-status`, body);
export const setLedStatus = (id, body) => live("PUT", `/api/maclar/${id}/led-status`, body);
export const getBroadcastState = (id) => live("GET", `/api/maclar/${id}/broadcast-state`);
export const saveBroadcastState = (id, patch) => live("PUT", `/api/maclar/${id}/broadcast-state`, patch);
export const generateAiHeadlines = (id, body) => live("POST", `/api/maclar/${id}/broadcast-state/ai-headlines`, body);

/* ----------------------------- kapsam / seçici ----------------------------- */
export const getCities = () => read("/api/meta/cities");
export const getLeagues = (cityId) => read("/api/meta/leagues", { cityId });
export const getSeasons = (cityId, leagueId) => read("/api/meta/seasons", { cityId, leagueId });
export const getSeasonGroups = (seasonId) => read(`/api/season-groups/season/${seasonId}`);
export const getVenues = () => read("/api/match-requests/venues");
/** Takımlar: il verilirse /takimlar/by-city/:il (önbelleksiz: yeni takım hemen görünsün). */
export const getTeams = (city) => live("GET", city ? `/takimlar/by-city/${encodeURIComponent(city)}` : "/takimlar");

/* ------------------------------ görevlendirme ------------------------------ */
export const getStaffOptions = (query) => live("GET", "/api/staff", undefined, { status: "active", ...query });
export const getMatchAssignments = (id) => live("GET", `/api/staff/matches/${id}`);
export const saveMatchAssignments = (id, body) => live("PUT", `/api/staff/matches/${id}`, body);

/* --------------------------- takım ve oyuncu --------------------------- */
export const createTeam = (body) => live("POST", "/takimlar/add", body);
export const updateTeam = (id, body) => live("PATCH", `/takimlar/${id}`, body);
export const createPlayer = (body) => live("POST", "/oyuncular/add", body);
export const updatePlayer = (id, body) => live("PATCH", `/oyuncular/${id}`, body);
export const getPlayer = (id) => live("GET", `/oyuncular/${id}`);
export const addPlayerToTeam = ({ playerId, playerName, teamId, teamName }) =>
  live("POST", "/oyuncu-takimlari/add", { player_id: playerId, player_name: playerName, team_id: teamId, team_name: teamName });
export const removePlayerFromTeam = (playerId, teamId) => live("DELETE", `/oyuncu-takimlari/${playerId}/${teamId}`);

/* ------------------------------ maç sonu ------------------------------ */
/** PATCH /api/maclar/:id/kadro/puan — { ratings: [{ playerId, oyuncu_id, puan }] } (matches.stats). */
export const saveRatings = (id, body) => live("PATCH", `/api/maclar/${id}/kadro/puan`, body);
/** PATCH /maclar/:id/status — durum değişimi (matches.publish). */
export const setMatchStatus = (id, status) => live("PATCH", `/maclar/${id}/status`, { mac_durumu: status });
/** GET /oyuncu-istatistikleri/mac/:id — kayıt yoksa 404 (boş liste sayılır). */
export const getMatchStats = (id) => live("GET", `/oyuncu-istatistikleri/mac/${id}`, undefined, { _t: Date.now() });
export const createPlayerStat = (body) => live("POST", "/oyuncu-istatistikleri/", body);
export const updatePlayerStat = (statId, body) => live("PATCH", `/oyuncu-istatistikleri/playerStat/${statId}`, body);
export const deletePlayerStat = (statId) => live("DELETE", `/oyuncu-istatistikleri/${statId}`);

/* ------------------------------ gol klipleri ------------------------------ */
/** GET /api/goal-clips?match_id= → { items: [{ id, event_id, player_id, team_id, minute, url, poster_url, … }] } (herkese açık). */
export const getGoalClips = (matchId) => live("GET", "/api/goal-clips", undefined, { match_id: matchId });
