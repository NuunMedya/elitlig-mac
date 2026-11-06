// YouTube ön ayarları: sunucuda (ortak — başka maçlarda ve başka bilgisayarlarda da
// kullanılır). Sunucu uçları yoksa (404 / 405 / 501) bu bilgisayarda localStorage'da.
import { useCallback, useEffect, useRef, useState } from "react";
import * as api from "../studioApi";
import { LOCAL_PRESETS_KEY, markDefault, normalizePreset, normalizePresets } from "./templates";

const readLocal = () => { try { return normalizePresets(JSON.parse(localStorage.getItem(LOCAL_PRESETS_KEY) || "[]")).map((p) => ({ ...p, local: true })); } catch { return []; } };
const writeLocal = (list) => { try { localStorage.setItem(LOCAL_PRESETS_KEY, JSON.stringify(list)); } catch { /* yoksay */ } };
const FIELDS = ["name", "title_template", "description_template", "privacy", "tags", "latency", "dvr", "made_for_kids", "is_default"];
/** Sunucuya giden gövde: yalnız sözleşmedeki alanlar. */
export const presetBody = (p) => Object.fromEntries(FIELDS.filter((k) => p?.[k] !== undefined).map((k) => [k, p[k]]));
const itemsOf = (data) => (Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : []);

export function useYoutubePresets() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [local, setLocal] = useState(false); // sunucu uçları yok → yerel yedek
  const [error, setError] = useState(null);
  const localRef = useRef(false);
  localRef.current = local;
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await api.listYoutubePresets();
    if (!mounted.current) return;
    if (r.ok) { setItems(normalizePresets(itemsOf(r.data))); setLocal(false); setError(null); }
    else if (api.notSupported(r)) { setItems(readLocal()); setLocal(true); setError(null); }
    else { setItems(readLocal()); setLocal(true); setError(r.offline ? "Bağlantı yok: ön ayarlar bu bilgisayardan." : r.error?.message || "Ön ayarlar alınamadı."); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const saveLocal = (fn) => setItems((cur) => { const next = fn(cur); writeLocal(next); return next; });

  /** Yeni ön ayar (gövde: templates.presetFromSettings). */
  const create = useCallback(async (body) => {
    if (!localRef.current) {
      const r = await api.createYoutubePreset(presetBody(body));
      if (r.ok) { await load(); return normalizePreset(r.data?.item || r.data) || null; }
      if (!api.notSupported(r)) throw new Error(r.error?.message || "Ön ayar kaydedilemedi.");
      setLocal(true);
    }
    const item = normalizePreset({ ...body, id: `yl_${Date.now().toString(36)}`, updated_at: new Date().toISOString(), local: true });
    saveLocal((cur) => (body.is_default ? markDefault([...cur, item], item.id) : [...cur, item]).map((p) => ({ ...p, local: true })));
    return item;
  }, [load]);

  const update = useCallback(async (id, body) => {
    if (!localRef.current && !String(id).startsWith("yl_")) {
      const r = await api.updateYoutubePreset(id, presetBody(body));
      if (r.ok) { await load(); return true; }
      if (!api.notSupported(r)) throw new Error(r.error?.message || "Ön ayar güncellenemedi.");
    }
    saveLocal((cur) => {
      const next = cur.map((p) => (p.id === String(id) ? normalizePreset({ ...p, ...body, id: p.id, updated_at: new Date().toISOString() }) : p));
      return (body.is_default ? markDefault(next, id) : next).map((p) => ({ ...p, local: true }));
    });
    return true;
  }, [load]);

  const remove = useCallback(async (id) => {
    if (!localRef.current && !String(id).startsWith("yl_")) {
      const r = await api.deleteYoutubePreset(id);
      if (r.ok) { await load(); return true; }
      if (!api.notSupported(r)) throw new Error(r.error?.message || "Ön ayar silinemedi.");
    }
    saveLocal((cur) => cur.filter((p) => p.id !== String(id)));
    return true;
  }, [load]);

  /** Varsayılan yap (yeni maçlarda pencere bununla dolar); id null → varsayılanı kaldır. */
  const setDefault = useCallback(async (id) => {
    const cur = items.find((p) => p.is_default);
    if (id == null) { if (cur) await update(cur.id, { ...cur, is_default: false }); return; }
    const p = items.find((x) => x.id === String(id));
    if (p) await update(p.id, { ...p, is_default: true });
  }, [items, update]);

  return { items, loading, local, error, reload: load, create, update, remove, setDefault };
}
