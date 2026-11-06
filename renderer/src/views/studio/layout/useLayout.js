// Yerleşim kancası: yükle (ilk açılışta eski şerit / sahne ızgarası / alt panelden göç),
// kaydet (300 ms gecikmeli), Workspace denetleyicisi (ctrlRef) ve düzenleme kipi.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DOCK_KEY } from "../dock/dockModel";
import { RAIL_KEY } from "../shortcuts/railModel";
import { STAGE_KEY } from "../../../lib/studio/stageGrid";
import { LAYOUT_KEY, dockPanelIds, loadLayout, migrateLayout, normalizeLayout, saveLayout, upgradeLayout } from "./layoutModel";

const store = () => { try { return window.localStorage; } catch { return null; } };
const readJSON = (s, k) => { try { return JSON.parse(s?.getItem(k) || "null"); } catch { return null; } };

/** Eski kayıtlardan ilk yerleşim (göç). */
export function initialLayout(storage = store(), { dockH = 300 } = {}) {
  const saved = upgradeLayout(loadLayout(storage));
  if (saved?.dock) return saved;
  const railRaw = readJSON(storage, RAIL_KEY);
  const rail = Array.isArray(railRaw) ? railRaw : Array.isArray(railRaw?.items) ? railRaw.items : null;
  return migrateLayout({
    rail, stage: readJSON(storage, STAGE_KEY), dock: readJSON(storage, DOCK_KEY), dockH,
    viewportH: typeof window !== "undefined" ? window.innerHeight : 900,
  });
}

export function useLayout({ dockH = 300 } = {}) {
  const [layout, setRaw] = useState(() => initialLayout(store(), { dockH }));
  const [edit, setEdit] = useState(false);
  const ctrlRef = useRef(null);
  useEffect(() => { const t = setTimeout(() => saveLayout(store(), layout), 300); return () => clearTimeout(t); }, [layout]);
  const setLayout = useCallback((fn) => setRaw((cur) => normalizeLayout(typeof fn === "function" ? fn(cur) : fn)), []);
  /** Depodan yeniden oku (ayar şablonu uygulanınca) ve ekrana uygula. */
  const reload = useCallback(() => {
    const next = initialLayout(store(), { dockH });
    setRaw(next);
    ctrlRef.current?.load?.(next);
  }, [dockH]);
  const ids = useMemo(() => new Set(dockPanelIds(layout.dock)), [layout.dock]);
  return { layout, setLayout, edit, setEdit, ctrlRef, reload, has: (id) => ids.has(id), key: LAYOUT_KEY };
}
