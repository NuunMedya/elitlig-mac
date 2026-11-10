// Bugün panosu — paylaşılan veri katmanı. Aynı uç (ör. /api/tools/overview) birden çok bileşende
// kullanılır: istek bir kez gider, sonuç kısa süre (ttl) paylaşılır. Uygulama genelindeki "Yenile",
// eşitleme sonu ve başka pencerenin yazması (data:changed) tüm aboneleri sessizce tazeler.
// Bağlantı yokken ana süreç önbellekteki son veriyi döndürür (offline, savedAt).
import { useCallback, useEffect, useRef, useState } from "react";
import { REFRESH_EVENT, get, onSyncDone } from "../../api";

const entries = new Map(); // anahtar → { state, at, promise, subs:Set, path, query }
const keyOf = (path, query) => `${path}|${JSON.stringify(query || {})}`;
const EMPTY = { data: null, error: null, loading: true, offline: false, savedAt: null };

function entry(key, path, query) {
  let e = entries.get(key);
  if (!e) { e = { state: EMPTY, at: 0, promise: null, subs: new Set(), path, query }; entries.set(key, e); }
  return e;
}
const notify = (e) => { for (const fn of [...e.subs]) fn(e.state); };

async function fetchEntry(e, { quiet = false } = {}) {
  if (e.promise) return e.promise;
  if (!quiet && !e.state.data) { e.state = { ...e.state, loading: true }; notify(e); }
  e.promise = (async () => {
    let res;
    try { res = await get(e.path, e.query); } catch (err) { res = { ok: false, error: { message: String(err?.message || err) } }; }
    e.at = Date.now();
    e.state = {
      data: res?.ok ? res.data : e.state.data,
      error: res?.ok ? null : (res?.error || { message: "Veri alınamadı." }),
      status: res?.status || null,
      loading: false,
      offline: Boolean(res?.offline),
      savedAt: res?.savedAt || null,
    };
    e.promise = null;
    notify(e);
    return res;
  })();
  return e.promise;
}

/** Bütün girdileri (ya da yolu eşleşenleri) sessizce yeniden oku. */
export function refreshData(match = null) {
  for (const e of entries.values()) {
    if (!e.subs.size) { e.at = 0; continue; }
    if (!match || String(e.path).includes(match)) fetchEntry(e, { quiet: true });
  }
}

let bound = false;
function bindGlobal() {
  if (bound || typeof window === "undefined") return;
  bound = true;
  window.addEventListener(REFRESH_EVENT, () => refreshData());
  try { onSyncDone(() => refreshData()); } catch { /* köprü yok (test) */ }
  try {
    window.elitlig?.onDataChanged?.((p) => {
      const path = String(p?.path || "");
      const root = path.split("/").slice(0, 4).join("/");
      if (root) refreshData(root);
    });
  } catch { /* yoksay */ }
}

/**
 * Bir uçtan veri (paylaşılan önbellek). enabled=false iken istek yapılmaz.
 * Dönen: { data, error, loading, offline, savedAt, reload, setData }.
 */
export function useData(path, query, { enabled = true, ttl = 20000, poll = 0 } = {}) {
  bindGlobal();
  const key = keyOf(path, query);
  const [state, setState] = useState(() => (enabled && path ? entry(key, path, query).state : { ...EMPTY, loading: false }));
  const keyRef = useRef(key);
  keyRef.current = key;
  useEffect(() => {
    if (!enabled || !path) { setState({ ...EMPTY, loading: false }); return undefined; }
    const e = entry(key, path, query);
    const sub = (s) => setState(s);
    e.subs.add(sub);
    setState(e.state);
    if (!e.at || Date.now() - e.at > ttl) fetchEntry(e, { quiet: Boolean(e.state.data) });
    const t = poll ? setInterval(() => fetchEntry(e, { quiet: true }), poll) : null;
    return () => { e.subs.delete(sub); if (t) clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, ttl, poll]);
  const reload = useCallback((opts) => {
    const e = entries.get(keyRef.current);
    return e ? fetchEntry(e, { quiet: true, ...(opts || {}) }) : Promise.resolve(null);
  }, []);
  const setData = useCallback((updater) => {
    const e = entries.get(keyRef.current);
    if (!e) return;
    e.state = { ...e.state, data: typeof updater === "function" ? updater(e.state.data) : updater };
    notify(e);
  }, []);
  return { ...state, reload, setData };
}

/** Bir köprü olayına abone olup değeri tutar: useBridge(() => api.state(), (cb) => api.onState(cb)). */
export function useBridge(read, subscribe, deps = []) {
  const [value, setValue] = useState(null);
  useEffect(() => {
    let alive = true;
    try { Promise.resolve(read?.()).then((v) => alive && v !== undefined && setValue(v)).catch(() => {}); } catch { /* yoksay */ }
    let off = null;
    try { off = subscribe?.((v) => alive && setValue(v)); } catch { /* yoksay */ }
    return () => { alive = false; if (typeof off === "function") off(); };
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  return [value, setValue];
}

/** Hata metni (404: bu sunucuda yok; 403: yetki). */
export function errorText(err, status) {
  if (!err) return "";
  const code = status || err.status;
  if (code === 404) return "Bu özellik bağlı sunucuda yok (404).";
  if (code === 403 || err.code === "PERMISSION_DENIED") return err.message || "Bu bölüme yetkiniz yok.";
  return err.message || "Veri alınamadı.";
}

// Test / tanılama için.
export const __entries = entries;
