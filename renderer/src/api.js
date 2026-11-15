// Arayüzün veri katmanı. Ağ isteği ana süreçte yapılır (window.elitlig.request);
// burada yalnız React kancaları ve kısa yollar var.
import { useCallback, useEffect, useRef, useState } from "react";
// Çalışma alanı: komut yalnız odaktaki bölmenin etkin sekmesine gider (workspace/gate.js).
import { useCommandGate } from "./workspace/gate";

const bridge = () => window.elitlig;

export const REFRESH_EVENT = "elitlig:refresh";
export const refreshAll = () => window.dispatchEvent(new Event(REFRESH_EVENT));

export const request = (opts) => bridge().request(opts);
export const get = (path, query) => request({ path, query });
export const post = (path, body, extra = {}) => request({ method: "POST", path, body, ...extra });
export const patch = (path, body) => request({ method: "PATCH", path, body });
export const put = (path, body) => request({ method: "PUT", path, body });
export const del = (path) => request({ method: "DELETE", path });

// Eşitleme bitti olayı: her useResource ayrı IPC dinleyicisi eklemesin (bir
// görünümde 10'dan çok kaynak MaxListenersExceededWarning veriyordu); tek
// dinleyici kurulur, kancalar buradan beslenir.
const syncDoneListeners = new Set();
let syncDoneBound = false;
export function onSyncDone(fn) {
  syncDoneListeners.add(fn);
  if (!syncDoneBound) {
    syncDoneBound = true;
    bridge().sync.onDone((r) => { for (const cb of [...syncDoneListeners]) cb(r); });
  }
  return () => { syncDoneListeners.delete(fn); };
}

export const tempId = () => `tmp_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/**
 * Bir uçtan veri okur. Bağlantı yokken önbellekteki son veri gelir
 * (offline, savedAt). Uygulama genelindeki "Yenile" ve eşitleme sonrası
 * kendiliğinden yeniden okunur.
 */
export function useResource(path, query, { enabled = true } = {}) {
  const [state, setState] = useState({ data: null, loading: Boolean(enabled && path), error: null, offline: false, savedAt: null });
  const key = `${path}|${JSON.stringify(query || {})}`;
  const seq = useRef(0);

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!enabled || !path) return null;
    const id = ++seq.current;
    if (!quiet) setState((s) => ({ ...s, loading: true }));
    const res = await get(path, query);
    if (id !== seq.current) return null;
    setState((s) => ({
      data: res.ok ? res.data : s.data,
      loading: false,
      error: res.ok ? null : res.error,
      offline: Boolean(res.offline),
      savedAt: res.savedAt || null,
    }));
    return res;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const quietReload = () => load({ quiet: true });
    window.addEventListener(REFRESH_EVENT, quietReload);
    const off = onSyncDone(quietReload);
    return () => { window.removeEventListener(REFRESH_EVENT, quietReload); off(); };
  }, [load]);

  const setData = useCallback((updater) => setState((s) => ({ ...s, data: typeof updater === "function" ? updater(s.data) : updater })), []);
  return { ...state, reload: load, setData };
}

// Menü komutları: tek IPC dinleyicisi (çalışma alanında birçok görünüm aynı anda bağlı kalır;
// her useCommand ayrı dinleyici eklerse MaxListenersExceededWarning verir).
const commandListeners = new Set();
let commandBound = false;
function onAppCommand(fn) {
  commandListeners.add(fn);
  if (!commandBound) {
    commandBound = true;
    bridge().onCommand((cmd) => { for (const cb of [...commandListeners]) cb(cmd); });
  }
  return () => { commandListeners.delete(fn); };
}

/** Uygulama komutlarını (menü/kısayol) dinler: new, export, print, find, refresh, undo, redo. Yalnız odaktaki bölmede. */
export function useCommand(name, handler) {
  const ref = useRef(handler);
  ref.current = handler;
  const gate = useCommandGate();
  useEffect(() => onAppCommand((cmd) => { if (cmd === name && gate()) ref.current?.(); }), [name, gate]);
}

/** Basit gecikmeli değer (arama kutuları için). */
export function useDebounced(value, ms = 300) {
  const [out, setOut] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setOut(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return out;
}

/** Kaydedilen dosya için ortak yardımcı. */
export async function saveFile(name, data, filters) {
  return bridge().files.save(name, data, filters);
}
