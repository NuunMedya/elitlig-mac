// Yayın Stüdyosu · "GOLCÜ SONRA" — golcüsü henüz seçilmemiş goller.
//
// Sunucu (POST /api/maclar/:id/olaylar) gol olayında oyuncu_id ister (OYUNCU_ID_REQUIRED). "Gol (yalnız
// tür)" düğmesinde operatör türü seçip "Golcü sonra" derse: gol müziği ve tekrar klibi GOL'e basıldığı
// an başlamıştır (flow.begin); önce golcüsüz kayıt denenir (sunucu izin verirse biter), olmazsa gol
// burada BEKLER (dakika / devre / klip anahtarı saklı). Düğmedeki "Golcü bekliyor" rozeti golcü
// seçtirir ve olay o anki değil, golün dakikasıyla yazılır.
//
//   addPending({ side, code, minute, period, clipKey }) → kayıt
//   resolvePending(id) / listPending() / subscribePending(fn) / usePendingGoals()
import { useSyncExternalStore } from "react";

const KEY = "studio.goalPending.v1";
const store = () => { try { return typeof sessionStorage !== "undefined" ? sessionStorage : null; } catch { return null; } };
let list = null;
const listeners = new Set();
const read = () => {
  if (list) return list;
  try { const v = JSON.parse(store()?.getItem(KEY) || "[]"); list = Array.isArray(v) ? v.filter((x) => x && x.id && x.code) : []; } catch { list = []; }
  return list;
};
const write = (next) => {
  list = next;
  try { store()?.setItem(KEY, JSON.stringify(next)); } catch { /* yoksay */ }
  for (const l of [...listeners]) l();
};

export const listPending = (matchId = null) => read().filter((p) => matchId == null || p.matchId == null || String(p.matchId) === String(matchId));
export function addPending({ matchId = null, side, code, minute = null, period = null, clipKey = null }) {
  const item = { id: `gp_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, matchId, side: side === "away" ? "away" : "home", code: String(code || "").toUpperCase(), minute, period, clipKey, at: Date.now() };
  write([...read(), item]);
  return item;
}
export const resolvePending = (id) => write(read().filter((p) => p.id !== id));
export const clearPending = () => write([]);
export function subscribePending(fn) { listeners.add(fn); return () => listeners.delete(fn); }
/** Bekleyen goller (canlı). */
export const usePendingGoals = () => useSyncExternalStore(subscribePending, read, read);

/** Bekleyen gol + seçilen golcü → kaydedilecek form (golün kendi dakikası / devresi). */
export function pendingForm(p, playerId, eventSide) {
  if (!p) return null;
  return { side: eventSide, code: p.code, playerId: playerId ? String(playerId) : "", note: "", ...(p.minute != null ? { minute: p.minute } : {}), ...(p.period != null ? { period: p.period } : {}) };
}
/** Sunucu golcüsüz golü reddetti mi (oyuncu zorunlu). */
export const needsPlayerError = (e) => /OYUNCU_ID_REQUIRED|oyuncu_id zorunlu|PLAYER_REQUIRED/i.test(`${e?.code || ""} ${e?.errorCode || ""} ${e?.message || ""} ${e?.detail || ""}`);
