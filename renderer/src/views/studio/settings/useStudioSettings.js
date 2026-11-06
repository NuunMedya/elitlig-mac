// Yayın Stüdyosu — ayarlar kancası: yükle (eski tercihlerden göç), kaydet (300 ms gecikmeli).
import { useCallback, useEffect, useState } from "react";
import { DEFAULT_SETTINGS, SETTINGS_KEY, loadSettings, normalizeSettings, patchSettings, saveSettings } from "./settings";

const store = () => { try { return window.localStorage; } catch { return null; } };

export function useStudioSettings(legacyPrefs) {
  const [settings, setSettings] = useState(() => loadSettings(store(), legacyPrefs));
  useEffect(() => { const t = setTimeout(() => saveSettings(store(), settings), 300); return () => clearTimeout(t); }, [settings]);
  /** set("record", { quality: "high" }) ya da set("hotkeys", nesne). */
  const set = useCallback((section, patch) => setSettings((s) => (typeof patch === "function" ? normalizeSettings({ ...s, [section]: patch(s[section]) }) : patchSettings(s, section, patch))), []);
  const reset = useCallback(() => {
    try { store()?.removeItem(SETTINGS_KEY); } catch { /* yoksay */ }
    setSettings(normalizeSettings(DEFAULT_SETTINGS));
  }, []);
  /** Depodan yeniden oku (ayar şablonu uygulanınca). */
  const reload = useCallback(() => setSettings(loadSettings(store())), []);
  return { settings, set, reset, reload };
}
