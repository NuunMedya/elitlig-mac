// Yayın Stüdyosu — oyuncu takibi izlerinin kalıcı deposu (tekrar + açı başına).
//
// localStorage "studio.replay.tracks.v1": { "replayId|açı": [iz] }. Tekrar yeniden açılınca,
// yayında ve MAÇ ÖZETİ çiziminde (renderHighlight) aynı izler kullanılır. En çok MAX_KEYS
// tekrar+açı tutulur (en eski güncellenen atılır). Depo yoksa (test / gizli pencere) bellekte.
import { normalizeTrack, trackKey } from "./playerTrack";

export const TRACKS_KEY = "studio.replay.tracks.v1";
const MAX_KEYS = 120;

let cache = null;
let order = [];
const listeners = new Set();

function storage() {
  try { return typeof localStorage !== "undefined" ? localStorage : null; } catch { return null; }
}

function load() {
  if (cache) return cache;
  cache = new Map();
  try {
    const raw = storage()?.getItem(TRACKS_KEY);
    const obj = raw ? JSON.parse(raw) : {};
    for (const [k, list] of Object.entries(obj || {})) {
      const l = (Array.isArray(list) ? list : []).map(normalizeTrack).filter(Boolean);
      if (l.length) { cache.set(k, l); order.push(k); }
    }
  } catch { /* bozuk kayıt: boş başla */ }
  return cache;
}

function save() {
  try {
    const obj = {};
    for (const [k, l] of cache) obj[k] = l;
    storage()?.setItem(TRACKS_KEY, JSON.stringify(obj));
  } catch { /* dolu / kapalı depo: bellekte kalır */ }
}

/** Tekrar + açının izleri. */
export function tracksOf(replayId, angle) {
  return load().get(trackKey(replayId, angle)) || [];
}

/** İzleri yaz (boş → silinir). */
export function setTracks(replayId, angle, list) {
  const m = load();
  const k = trackKey(replayId, angle);
  const l = (list || []).map(normalizeTrack).filter(Boolean);
  order = order.filter((x) => x !== k);
  if (l.length) { m.set(k, l); order.push(k); } else m.delete(k);
  while (order.length > MAX_KEYS) m.delete(order.shift());
  save();
  for (const fn of listeners) { try { fn(k); } catch { /* yoksay */ } }
  return l;
}

/** Tekrarın tüm açılarının izleri silinir (tekrar silinince). */
export function clearReplayTracks(replayId) {
  const m = load();
  for (const k of [...m.keys()]) if (k.startsWith(`${replayId}|`)) setTracks(k.split("|")[0], k.slice(k.indexOf("|") + 1), []);
}

export function onTracks(fn) { listeners.add(fn); return () => listeners.delete(fn); }

/** Test: önbelleği sıfırla. */
export function _resetTrackStore() { cache = null; order = []; }
