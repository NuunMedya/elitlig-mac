// Yayın Stüdyosu — PANEL PARÇALARI: alt paneldeki her ayrıntı Ayarlar'dan gizlenebilir.
//
//   <PartsProvider dock setDock>      Studio (alt panel + Ayarlar aynı durumu okur)
//   <PanelScope panel="tekrar">       alt panel sütunu / sekmesi (Ayarlar'da showAll)
//   <Part id="angles" label="…">      bileşen içinde: gizliyse hiç çizilmez (kap öğesi eklemez)
//   usePanelParts("tekrar")           { visible(id), setVisible(id, v), toggle(id), parts }
//   <PanelScope panel only="list">    yerleşim bileşeni: panelin YALNIZ o parçası çizilir
//                                     (kullanıcının gizlediği parçalardan bağımsız)
//
// Parça kataloğu dockModel.PANEL_PARTS'tadır; kataloğa girmemiş bir <Part> ilk
// çizildiğinde kaydolur ve Ayarlar listesinde de görünür.
import React, { createContext, useCallback, useContext, useMemo } from "react";
import { hiddenParts, partsOf, setPartVisible } from "./dockModel";

const PartsCtx = createContext(null);
const PanelCtx = createContext(null);

const runtime = new Map(); // panel → Map(id → label)
export function registerPart(panel, id, label) {
  if (!panel || !id || partsOf(panel).some((p) => p.id === id)) return;
  if (!runtime.has(panel)) runtime.set(panel, new Map());
  const m = runtime.get(panel);
  if (!m.has(id)) m.set(id, label || id);
}
/** Katalog + çalışırken kaydolan parçalar. */
export function allPartsOf(panel) {
  const extra = [...(runtime.get(panel)?.entries() || [])].map(([id, label]) => ({ id, label }));
  return [...partsOf(panel), ...extra];
}

export function PartsProvider({ dock, setDock, children }) {
  const value = useMemo(() => ({ dock, setDock }), [dock, setDock]);
  return <PartsCtx.Provider value={value}>{children}</PartsCtx.Provider>;
}

export function PanelScope({ panel, showAll = false, only = null, children }) {
  const value = useMemo(() => ({ panel, showAll, only }), [panel, showAll, only]);
  return <PanelCtx.Provider value={value}>{children}</PanelCtx.Provider>;
}

export function usePanelParts(panelKey) {
  const ctx = useContext(PartsCtx);
  const scope = useContext(PanelCtx);
  const panel = panelKey || scope?.panel || null;
  const only = scope?.only && (!panelKey || panelKey === scope.panel) ? scope.only : null;
  const hidden = ctx && panel && !scope?.showAll && !only ? hiddenParts(ctx.dock, panel) : [];
  const setDock = ctx?.setDock;
  const setVisible = useCallback((id, v) => { if (setDock && panel) setDock((d) => setPartVisible(d, panel, id, v)); }, [setDock, panel]);
  return {
    panel,
    hidden,
    parts: panel ? allPartsOf(panel) : [],
    visible: (id) => (only ? id === only : !hidden.includes(id)),
    setVisible,
    toggle: (id) => setVisible(id, hidden.includes(id)),
  };
}

/** Gizlenebilir parça. Bağlam yoksa (ör. başka yerde kullanılan panel) her zaman görünür. */
export function Part({ id, panel, label, children }) {
  const scope = useContext(PanelCtx);
  const ctx = useContext(PartsCtx);
  const key = panel || scope?.panel;
  if (key) registerPart(key, id, label);
  if (scope?.only && key === scope.panel) return id === scope.only ? (children ?? null) : null;
  if (!ctx || !key || scope?.showAll) return children ?? null;
  return hiddenParts(ctx.dock, key).includes(id) ? null : (children ?? null);
}
