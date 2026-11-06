// Alt panel düzeni kancası: yükle (eski tercihten göç), kaydet (250 ms gecikmeli).
import { useCallback, useEffect, useState } from "react";
import { DOCK_KEY, loadDock, normalizeDock, saveDock } from "./dockModel";

const store = () => { try { return window.localStorage; } catch { return null; } };

export function useDock(legacyTab = null) {
  const [dock, setRaw] = useState(() => loadDock(store(), { legacyTab }));
  useEffect(() => { const t = setTimeout(() => saveDock(store(), dock), 250); return () => clearTimeout(t); }, [dock]);
  const setDock = useCallback((fn) => setRaw((cur) => normalizeDock(typeof fn === "function" ? fn(cur) : fn)), []);
  const reset = useCallback(() => {
    try { store()?.removeItem(DOCK_KEY); } catch { /* yoksay */ }
    setRaw(normalizeDock(null));
  }, []);
  return { dock, setDock, reset };
}
