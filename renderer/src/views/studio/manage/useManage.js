// Maç yönetimi — ortak kancalar: oturumdaki kullanıcı, veri yükleme ve
// "yaz → bildir" akışı (başarıda sunucunun Türkçe iletisi, hatada okunur
// hata metni; 403 için dostça yetki uyarısı).
import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "../../../components/ui";
import { friendlyError } from "../../../lib/studio/manage";

/** Oturumdaki kullanıcı (il kapsamı, olay yazarı). */
export function useAuthUser() {
  const [user, setUser] = useState(null);
  useEffect(() => {
    let alive = true;
    window.elitlig?.auth?.state?.().then((s) => { if (alive) setUser(s?.user || null); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  return user;
}

/**
 * Bir isteği yükler. fn: () => Promise<{ok,data,error}>; deps değişince yeniden.
 * Dönen: { data, loading, error (metin), reload, setData }.
 */
export function useLoad(fn, deps, { enabled = true, fallback = "Veri alınamadı." } = {}) {
  const [state, setState] = useState({ data: null, loading: Boolean(enabled), error: "" });
  const seq = useRef(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!enabled) { setState({ data: null, loading: false, error: "" }); return null; }
    const id = ++seq.current;
    if (!quiet) setState((s) => ({ ...s, loading: true }));
    const res = await fnRef.current();
    if (id !== seq.current) return null;
    setState((s) => ({ data: res?.ok ? res.data : s.data, loading: false, error: res?.ok ? "" : friendlyError(res, fallback) }));
    return res;
  }, [enabled, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);
  const setData = useCallback((updater) => setState((s) => ({ ...s, data: typeof updater === "function" ? updater(s.data) : updater })), []);
  return { ...state, reload: load, setData };
}

/** Yazma işlemi: bekleme durumu + bildirim. run(() => api.x(), { ok, fail }) → data | null */
export function useRun() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const run = useCallback(async (fn, { ok, fail = "İşlem yapılamadı.", quiet = false } = {}) => {
    setBusy(true);
    try {
      const res = await fn();
      if (!res?.ok) {
        toast(friendlyError(res, fail), { tone: "error", timeout: 6000 });
        return null;
      }
      if (!quiet) {
        const message = typeof ok === "function" ? ok(res.data) : ok || res.data?.message;
        if (message) toast(message, { tone: "success" });
      }
      return res.data ?? {};
    } catch (error) {
      toast(error?.message || fail, { tone: "error", timeout: 6000 });
      return null;
    } finally {
      setBusy(false);
    }
  }, [toast]);
  return { run, busy, toast };
}

/** Panoya kopyala. */
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(String(text));
    return true;
  } catch {
    return false;
  }
}
