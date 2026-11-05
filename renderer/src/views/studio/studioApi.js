// Yayın Stüdyosu — sunucu uçları. Tüm istekler window.elitlig.request üzerinden
// (api.js) gider; canlı veride önbellek ve çevrimdışı kuyruk kapalıdır: reji
// yazımı ya hemen olur ya da hata gösterilir.
import { request } from "../../api";

const live = (method, path, body, query) => request({ method, path, body, query, cache: false, queue: false });

/** { ok, data } değilse Error fırlatır (sunucunun Türkçe iletisiyle). */
export async function must(promise, fallback = "İşlem yapılamadı.") {
  const res = await promise;
  if (res?.ok) return res.data;
  const err = new Error(res?.offline ? "Bağlantı yok: işlem için internet gerekir." : res?.error?.message || fallback);
  err.code = res?.error?.code;
  throw err;
}

export const errorText = (error, fallback) => (error instanceof Error && error.message ? error.message : fallback);

// Maç
export const getDayMatches = (date) => request({ path: "/api/chat/content/matches", query: { date }, cache: true });
export const getMatch = (id) => live("GET", `/api/maclar/${id}`);
export const getEvents = (id) => live("GET", `/api/maclar/${id}/olaylar`);
export const getLineup = (id) => live("GET", `/api/maclar/${id}/kadro`);
export const getTimer = (id) => live("GET", `/api/maclar/${id}/timer`);
export const getSnapshot = (id) => request({ path: `/api/live-matches/${id}/snapshot`, cache: true });
export const updateMatch = (id, body) => live("PATCH", `/maclar/${id}`, body);
export const createEvent = (id, body) => live("POST", `/api/maclar/${id}/olaylar`, body);
export const deleteEvent = (id, eventId) => live("DELETE", `/api/maclar/${id}/olaylar/${eventId}`);
export const putTimer = (id, running, baseMs) => live("PUT", `/api/maclar/${id}/timer`, { running, base_ms: Math.max(0, Math.floor(baseMs)) });
export const setTimerPeriod = (id, period) => live("POST", `/api/maclar/${id}/timer/period`, { period });

// YouTube (routes/liveStreams.js, yetki matches.live)
const YT = "/api/admin/live-streams";
export const getLiveConfig = () => live("GET", `${YT}/config`);
export const getMatchStream = (id) => live("GET", `${YT}/matches/${id}`);
export const createMatchStream = (id, body) => live("POST", `${YT}/matches/${id}`, body);
export const endMatchStream = (id) => live("POST", `${YT}/matches/${id}/end`, {});
