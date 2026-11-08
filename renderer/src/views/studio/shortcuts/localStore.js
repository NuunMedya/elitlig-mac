// Yayın Stüdyosu · düğmelerin PAYLAŞILAN YEREL DURUMU (aynı anahtarı kullanan tüm
// düğmeler aynı değeri görür; istenirse localStorage'da saklanır). Ör.: son konuklar,
// röportaj işaretleri, maç başına sayaçlar / topla oynama / hakem notları, istem kartları,
// kronometre, özet seçimi, otomatik kamera dönüşü.
import { useCallback, useSyncExternalStore } from "react";

const mem = new Map();   // anahtar → değer
const subs = new Map();  // anahtar → Set(fn)
const PREFIX = "studio.w.";
const ls = () => { try { return window.localStorage; } catch { return null; } };

function read(key, init, persist) {
  if (mem.has(key)) return mem.get(key);
  let v = typeof init === "function" ? init() : init;
  if (persist) {
    try { const raw = ls()?.getItem(PREFIX + key); if (raw != null) v = JSON.parse(raw); } catch { /* yoksay */ }
  }
  mem.set(key, v);
  return v;
}
export function getLocal(key, init = null, persist = true) { return read(key, init, persist); }
export function setLocal(key, fn, persist = true) {
  const cur = mem.has(key) ? mem.get(key) : read(key, null, persist);
  const next = typeof fn === "function" ? fn(cur) : fn;
  mem.set(key, next);
  if (persist) { try { ls()?.setItem(PREFIX + key, JSON.stringify(next)); } catch { /* yoksay */ } }
  (subs.get(key) || []).forEach((f) => f());
  return next;
}
/** [değer, ayarla] — anahtar paylaşılır; persist: localStorage'a yaz. */
export function useLocal(key, init = null, persist = true) {
  const sub = useCallback((f) => { if (!subs.has(key)) subs.set(key, new Set()); subs.get(key).add(f); return () => subs.get(key)?.delete(f); }, [key]);
  const get = useCallback(() => read(key, init, persist), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const v = useSyncExternalStore(sub, get, get);
  const set = useCallback((fn) => setLocal(key, fn, persist), [key, persist]);
  return [v, set];
}
/** Sınama için. */
export function __resetLocal() { mem.clear(); }
