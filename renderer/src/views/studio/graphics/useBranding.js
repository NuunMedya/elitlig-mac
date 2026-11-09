// Yayın grafikleri · marka (logo + tema) ve ön ayarlar.
//
// Taslak (draft) anında stüdyo programına yansır; "Kaydet" PUT
// /api/maclar/:id/overlay-branding ile web kaplamalarına (OBS) da düşer.
// Masaüstü ekleri (yazı rengi, yazı boyutu, logo yeri) maç başına yerelde
// ve ön ayarın içinde saklanır.
//
// Ön ayarlar sunucuda (SUNUCU ajanının /api/overlay-branding/presets uçları);
// uç yoksa (404) bu bilgisayarda localStorage'da tutulur. Ön ayarlar yalnız
// ŞABLONDUR: "Uygula" yalnız şu anki maça yazar (PUT overlay-branding);
// hiçbir ön ayar kendiliğinden uygulanmaz ya da varsayılan yapılmaz, genel
// (tüm maçları etkileyen) ayar yazılmaz.
import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "../../../components/ui";
import { friendlyError } from "../../../lib/studio/manage";
import {
  DEFAULT_BRANDING, mergePreset, normalizeBranding, normalizeExtras, normalizePreset, normalizePresetList, presetBody,
  sameBranding, serverBrandingBody, validatePresetName,
} from "../../../lib/studio/graphics/branding";
import * as api from "./graphicsApi";

const EXTRAS_KEY = (id) => `elitlig.studio.brandingExtras.${id}`;
const LOCAL_PRESETS = "elitlig.studio.brandingPresets";

const readJson = (key, fallback) => { try { const v = JSON.parse(localStorage.getItem(key) || "null"); return v ?? fallback; } catch { return fallback; } };
const writeJson = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* yoksay */ } };

function readLocalPresets() {
  const rows = readJson(LOCAL_PRESETS, []);
  return normalizePresetList((Array.isArray(rows) ? rows : []).map((r) => ({ ...r, local: true, is_default: false })));
}
const writeLocalPresets = (list) => writeJson(LOCAL_PRESETS, list.map((p) => ({ id: p.id, name: p.name, branding: p.branding, updated_at: p.updatedAt || new Date().toISOString() })));

export function useBranding(matchId) {
  const toast = useToast();
  const id = Number(matchId) > 0 ? Number(matchId) : null;
  const [saved, setSaved] = useState(() => normalizeBranding(DEFAULT_BRANDING));
  const [draft, setDraft] = useState(() => normalizeBranding(DEFAULT_BRANDING));
  const [source, setSource] = useState("default");
  const [loading, setLoading] = useState(Boolean(id));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [presets, setPresets] = useState([]);
  const [presetsRemote, setPresetsRemote] = useState(true);
  const [presetsLoading, setPresetsLoading] = useState(true);
  const idRef = useRef(id);
  idRef.current = id;
  // Taslak hangi maçın: maç değişip yeni marka gelmeden "Kaydet" eski taslağı yeni maça yazmasın.
  const [draftFor, setDraftFor] = useState(null);

  /* ------------------------------ maçın markası ------------------------------ */
  const load = useCallback(async () => {
    if (!id) { setLoading(false); return null; }
    setLoading(true);
    const res = await api.getBranding(id);
    if (idRef.current !== id) return null;
    setLoading(false);
    if (!res.ok) { setError(friendlyError(res, "Yayın görünümü okunamadı.")); return null; }
    const extras = normalizeExtras(readJson(EXTRAS_KEY(id), null));
    const next = normalizeBranding({ ...(res.data?.branding || {}), extras });
    setSaved(next); setDraft(next); setDraftFor(id); setSource(res.data?.source || "default"); setError("");
    return res.data;
  }, [id]);

  useEffect(() => {
    const fresh = normalizeBranding(DEFAULT_BRANDING);
    setSaved(fresh); setDraft(fresh); setDraftFor(null); setSource("default");
    load();
  }, [load]);

  const update = useCallback((patch) => {
    setDraft((cur) => {
      const p = typeof patch === "function" ? patch(cur) : patch;
      return normalizeBranding({ ...p, scoreboard: p.scoreboard ? { ...cur.scoreboard, ...p.scoreboard } : undefined, led: p.led ? { ...cur.led, ...p.led } : undefined, extras: p.extras ? { ...cur.extras, ...p.extras } : undefined }, cur);
    });
  }, []);

  /** Taslağı YALNIZ bu maça kaydeder (PUT /api/maclar/:id/overlay-branding; web kaplamaları dahil). */
  const save = useCallback(async (value, { quiet = false } = {}) => {
    if (!id) return false;
    if (value == null && draftFor !== id) { toast("Maçın görünümü henüz yüklenmedi; birazdan yeniden dene.", { tone: "warn" }); return false; }
    const target = normalizeBranding(value ?? draft);
    setSaving(true);
    writeJson(EXTRAS_KEY(id), target.extras);
    const res = await api.saveBranding(id, serverBrandingBody(target));
    setSaving(false);
    if (!res.ok) { toast(friendlyError(res, "Yayın görünümü kaydedilemedi."), { tone: "error", timeout: 6000 }); return false; }
    const next = normalizeBranding({ ...(res.data?.branding || serverBrandingBody(target)), extras: target.extras });
    if (idRef.current === id) { setSaved(next); setDraft(next); setDraftFor(id); setSource(res.data?.source || `match:${id}`); }
    if (!quiet) toast("Bu maçın görünümü kaydedildi; web kaplamaları birkaç saniyede güncellenir.", { tone: "success" });
    return true;
  }, [draft, draftFor, id, toast]);

  const revert = useCallback(() => setDraft(saved), [saved]);
  const dirty = !sameBranding(draft, saved);

  /* --------------------------------- ön ayarlar --------------------------------- */
  const loadPresets = useCallback(async () => {
    setPresetsLoading(true);
    const res = await api.listPresets();
    setPresetsLoading(false);
    if (res.ok) { setPresets(normalizePresetList(res.data)); setPresetsRemote(true); return; }
    if (api.isMissing(res)) { setPresets(readLocalPresets()); setPresetsRemote(false); return; }
    setPresets(readLocalPresets());
    setPresetsRemote(false);
  }, []);
  useEffect(() => { loadPresets(); }, [loadPresets]);

  /**
   * Ön ayarı YALNIZ şu anki maça uygular: şablon taslakla birleşir ve maçın
   * kendi kaydına yazılır (PUT /api/maclar/:id/overlay-branding). Ön ayarın
   * kendisi, diğer maçlar ve genel ayarlar değişmez.
   */
  const applyPreset = useCallback(async (presetId, { quiet = false } = {}) => {
    const preset = presets.find((p) => p.id === String(presetId));
    if (!preset || !id) return false;
    if (draftFor !== id) { toast("Maçın görünümü henüz yüklenmedi; birazdan yeniden dene.", { tone: "warn" }); return false; }
    const merged = mergePreset(draft, preset);
    const ok = await save(merged);
    if (ok && !quiet) toast(`“${preset.name}” yalnız bu maça uygulandı.`, { tone: "success" });
    return ok;
  }, [draft, draftFor, id, presets, save, toast]);

  const savePreset = useCallback(async (name, value) => {
    const problem = validatePresetName(name, presets);
    if (problem) { toast(problem, { tone: "warn" }); return null; }
    const body = presetBody(name, value ?? draft);
    if (presetsRemote) {
      const res = await api.createPreset(body);
      if (res.ok) {
        const row = normalizePreset(res.data?.preset || res.data) || normalizePreset({ id: `tmp-${Date.now()}`, ...body });
        setPresets((list) => normalizePresetList([...list.filter((p) => p.id !== row.id), row]));
        toast(`“${body.name}” ön ayarı kaydedildi.`, { tone: "success" });
        return row;
      }
      if (!api.isMissing(res)) { toast(friendlyError(res, "Ön ayar kaydedilemedi."), { tone: "error", timeout: 6000 }); return null; }
      setPresetsRemote(false);
    }
    const row = normalizePreset({ id: `local-${Date.now().toString(36)}`, ...body, local: true });
    const list = normalizePresetList([...readLocalPresets(), row]);
    writeLocalPresets(list);
    setPresets(list);
    toast(`“${body.name}” bu bilgisayarda kaydedildi (sunucuda ön ayar ucu yok).`, { tone: "success" });
    return row;
  }, [draft, presets, presetsRemote, toast]);

  const patchPreset = useCallback(async (presetId, patch, okText) => {
    const preset = presets.find((p) => p.id === String(presetId));
    if (!preset) return false;
    if (presetsRemote && !preset.local) {
      const body = { ...(patch.name != null ? { name: patch.name } : {}), ...(patch.branding ? { branding: normalizeBranding(patch.branding) } : {}) };
      const res = await api.updatePreset(preset.id, body);
      if (!res.ok) { toast(friendlyError(res, "Ön ayar güncellenemedi."), { tone: "error", timeout: 6000 }); return false; }
      await loadPresets();
    } else {
      let list = readLocalPresets().map((p) => (p.id === preset.id ? { ...p, ...(patch.name != null ? { name: patch.name } : {}), ...(patch.branding ? { branding: normalizeBranding(patch.branding) } : {}) } : p));
      writeLocalPresets(list);
      list = readLocalPresets();
      setPresets(list);
    }
    if (okText) toast(okText, { tone: "success" });
    return true;
  }, [loadPresets, presets, presetsRemote, toast]);

  const renamePreset = useCallback((presetId, name) => {
    const problem = validatePresetName(name, presets, String(presetId));
    if (problem) { toast(problem, { tone: "warn" }); return Promise.resolve(false); }
    return patchPreset(presetId, { name: String(name).trim() }, "Ön ayarın adı değişti.");
  }, [patchPreset, presets, toast]);
  const overwritePreset = useCallback((presetId) => patchPreset(presetId, { branding: draft }, "Ön ayar şimdiki görünümle güncellendi."), [draft, patchPreset]);

  const deletePreset = useCallback(async (presetId) => {
    const preset = presets.find((p) => p.id === String(presetId));
    if (!preset) return false;
    if (presetsRemote && !preset.local) {
      const res = await api.deletePreset(preset.id);
      if (!res.ok) { toast(friendlyError(res, "Ön ayar silinemedi."), { tone: "error", timeout: 6000 }); return false; }
      setPresets((list) => list.filter((p) => p.id !== preset.id));
    } else {
      const list = readLocalPresets().filter((p) => p.id !== preset.id);
      writeLocalPresets(list);
      setPresets(list);
    }
    toast(`“${preset.name}” silindi.`, { tone: "success" });
    return true;
  }, [presets, presetsRemote, toast]);

  return {
    branding: draft, saved, source, dirty, loading, saving, error,
    update, setBranding: setDraft, save, revert, reload: load,
    presets, presetsRemote, presetsLoading, reloadPresets: loadPresets,
    applyPreset, savePreset, renamePreset, overwritePreset, deletePreset,
  };
}
