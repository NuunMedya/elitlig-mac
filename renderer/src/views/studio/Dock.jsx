// Yayın Stüdyosu · ALT PANEL: ÇOK SÜTUNLU ÇALIŞMA ALANI (./dock/dockModel.js).
//
//   Sütunlar  3–4 panel yan yana, hepsi aynı anda açık (1–5). Varsayılan:
//             Maç yönetimi | Sahneler | Tekrar | Ses (Tekrar ve Ses sağda sabit).
//             Başlıktaki açılır menü sütunun panelini değiştirir; raptiye sabitler
//             (sabit sütun değişmez / kaldırılamaz); ⋯ menüsü: sola / sağa taşı,
//             parçaları göster / gizle, kaldır. Sütun aralarındaki ayraç sürüklenerek
//             genişlikler değişir (çift tık: eşitle). Sağdaki şeritten sütun ekle,
//             tek sekme kipine geç, Ayarlar.
//   Tek sekme eski düzen (sekmeler + tek panel); Ayarlar › Alt panel'den de seçilir.
//   Yükseklik üst kenardaki tutamaçla değişir (tercihlerde saklanır).
//
// Studio şunları verir: dock / setDock (useDock), defs ({ [panel]: { label, icon,
// count, accent, mode, render({ passive }) } } — yalnız kullanılabilen paneller),
// previewMode (önizlemedeki özel kip), onActivate(panelKey) (sütuna dokununca:
// özel kip panelleri önizlemeyi o kipe alır), onDeactivate(panelKey).
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Icon, MenuButton } from "../../components/ui";
import {
  MAX_COLS, MIN_COLS, addColumn, enabledPanels, equalizeColumns, moveColumn, panelOf, partsCss, removeColumn, resizeColumns,
  setColumnPanel, setMode, setPartVisible, setTab, togglePin,
} from "./dock/dockModel";
import { PanelScope, allPartsOf } from "./dock/parts";
import "./dock/dock.css";

export const DOCK_MIN = 150;
export const dockMax = () => Math.max(DOCK_MIN + 40, Math.round((typeof window !== "undefined" ? window.innerHeight : 900) * 0.62));
export const clampDock = (h) => Math.max(DOCK_MIN, Math.min(dockMax(), Math.round(Number(h) || 300)));

/** Üst kenar tutamacı: yükseklik. */
function useHeightGrip(height, onHeight) {
  const [drag, setDrag] = useState(null);
  const start = useRef(null);
  const dragRef = useRef(null);
  dragRef.current = drag;
  const h = clampDock(drag ?? height);
  const onDown = useCallback((e) => {
    e.preventDefault();
    start.current = { y: e.clientY, h };
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setDrag(h);
  }, [h]);
  const onMove = useCallback((e) => { if (start.current) setDrag(clampDock(start.current.h + (start.current.y - e.clientY))); }, []);
  const onUp = useCallback(() => {
    if (!start.current) return;
    start.current = null;
    if (dragRef.current != null) onHeight(dragRef.current);
    setDrag(null);
  }, [onHeight]);
  useEffect(() => {
    const onResize = () => { if (height > dockMax()) onHeight(clampDock(height)); };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [height, onHeight]);
  const grip = (
    <div className={`st-dock__grip ${drag != null ? "is-drag" : ""}`} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
      onDoubleClick={() => onHeight(clampDock(height > 260 ? DOCK_MIN + 50 : 340))} role="separator" aria-orientation="horizontal" title="Sürükle: paneli büyüt / küçült · çift tıkla: aç / daralt">
      <i />
    </div>
  );
  return { h, grip };
}

/** Panel gövdesi: hata olursa yalnız o sütun düşer. */
class PanelBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidUpdate(prev) { if (prev.panel !== this.props.panel && this.state.error) this.setState({ error: null }); }
  render() {
    if (this.state.error) return <p className="st-hint st-pad"><Icon name="alert" size={13} /> Bu panel çizilemedi: {String(this.state.error?.message || this.state.error)}</p>;
    return this.props.children;
  }
}

/** Sütunun panel seçicisi (başlıktaki açılır liste). */
function PanelPicker({ col, options, defs, onPick }) {
  const cur = defs[col.panel] || panelOf(col.panel);
  return (
    <label className={`st-dcol__pick ${col.pinned ? "is-locked" : ""}`} title={col.pinned ? "Sabit sütun: içeriği değiştirmek için raptiyeyi kaldır" : "Bu sütunda gösterilecek panel"}>
      <Icon name={cur?.icon || "grid"} size={13} />
      <span>{cur?.label || col.panel}</span>
      {!col.pinned && <Icon name="chevronDown" size={12} />}
      <select value={col.panel} disabled={col.pinned} onChange={(e) => onPick(e.target.value)} aria-label="Sütun paneli">
        {options.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
        {!options.some((p) => p.key === col.panel) && <option value={col.panel}>{cur?.label || col.panel}</option>}
      </select>
    </label>
  );
}

function DockColumn({ col, index, count, dock, setDock, defs, options, flash, previewMode, onActivate, onDeactivate, style }) {
  const def = defs[col.panel];
  const meta = panelOf(col.panel);
  const disabled = dock.disabled.includes(col.panel);
  const parts = allPartsOf(col.panel);
  const hidden = dock.parts?.[col.panel] || [];
  const inPreview = Boolean(meta?.mode) && previewMode === meta.mode;
  // Sütundaki özel kip paneli kaldırılınca / değişince önizlemesi bırakılır.
  useEffect(() => {
    const key = col.panel;
    return () => onDeactivate?.(key);
  }, [col.panel, onDeactivate]);
  const menu = [
    { label: "Sola taşı", icon: "chevronLeft", disabled: index === 0, onClick: () => setDock((d) => moveColumn(d, col.id, -1)) },
    { label: "Sağa taşı", icon: "chevronRight", disabled: index === count - 1, onClick: () => setDock((d) => moveColumn(d, col.id, 1)) },
    { label: col.pinned ? "Sabitlemeyi kaldır" : "Sabitle (içerik değişmez)", icon: "pin", onClick: () => setDock((d) => togglePin(d, col.id)) },
    ...(parts.length ? ["-", ...parts.map((p) => ({ label: `${hidden.includes(p.id) ? "Göster" : "Gizle"}: ${p.label}`, icon: hidden.includes(p.id) ? "eye" : "x", onClick: () => setDock((d) => setPartVisible(d, col.panel, p.id, hidden.includes(p.id))) }))] : []),
    "-",
    { label: "Sütunu kaldır", icon: "trash", danger: true, disabled: col.pinned || count <= MIN_COLS, hint: col.pinned ? "Önce sabitlemeyi kaldır" : undefined, onClick: () => setDock((d) => removeColumn(d, col.id)) },
  ];
  return (
    <section className={`st-dcol ${col.pinned ? "is-pinned" : ""} ${flash ? "is-flash" : ""} ${meta?.accent ? "is-accent" : ""} ${inPreview ? "is-pvw" : ""}`} style={style}
      data-dock-panel={col.panel} onPointerDownCapture={() => onActivate?.(col.panel)} aria-label={def?.label || meta?.label}>
      <header className="st-dcol__head">
        <PanelPicker col={col} options={options} defs={defs} onPick={(k) => setDock((d) => setColumnPanel(d, col.id, k))} />
        {def?.count ? <b className="st-dock__count">{def.count}</b> : null}
        {inPreview && <span className="st-dcol__pvw" title="Bu kip önizlemede: Geçiş yayına alır">ÖNİZLEMEDE</span>}
        {hidden.length > 0 && <span className="st-dcol__hidden" title={`${hidden.length} parça gizli (⋯ menüsü ya da Ayarlar › Alt panel)`}><Icon name="eye" size={11} /> {hidden.length}</span>}
        <span className="st-top__spacer" />
        <button type="button" className={`st-dcol__pin ${col.pinned ? "is-on" : ""}`} onClick={() => setDock((d) => togglePin(d, col.id))} title={col.pinned ? "Sabit: içerik değişmez · tıkla: sabitlemeyi kaldır" : "Sabitle"} aria-pressed={col.pinned}><Icon name="pin" size={12} /></button>
        <MenuButton items={menu} label="Sütun seçenekleri" size={14} align="end" className="st-dcol__menu" />
      </header>
      <div className="st-dcol__body">
        {disabled
          ? <p className="st-hint st-pad">Bu panel Ayarlar › Alt panel'de kapalı. Üstteki listeden başka panel seç.</p>
          : def
            ? <PanelScope panel={col.panel}><PanelBoundary panel={col.panel}>{def.render({ passive: true, column: true })}</PanelBoundary></PanelScope>
            : <p className="st-hint st-pad">Bu panel bu sürümde yok.</p>}
      </div>
    </section>
  );
}

export default function Dock({ dock, setDock, defs, height, onHeight, extra = null, flashId = null, previewMode = null, onActivate, onDeactivate, onOpenSettings }) {
  const { h, grip } = useHeightGrip(height, onHeight);
  const available = Object.keys(defs);
  const options = enabledPanels(dock, available);
  const rowRef = useRef(null);
  const drag = useRef(null);
  const [live, setLive] = useState(null); // sürüklerken yerel sütun düzeni (Studio her harekette yeniden çizilmesin)
  const liveRef = useRef(null);
  liveRef.current = live;
  const css = partsCss(dock);
  const view = live || dock;

  const onSplitDown = (i) => (e) => {
    e.preventDefault();
    const row = rowRef.current;
    if (!row) return;
    const cols = [...row.querySelectorAll(":scope > .st-dcol")];
    const total = cols.reduce((t, el) => t + el.getBoundingClientRect().width, 0);
    drag.current = { i, x: e.clientX, total, base: dock };
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setLive(dock);
  };
  const onSplitMove = (e) => {
    const d = drag.current;
    if (!d) return;
    setLive(resizeColumns(d.base, d.i, e.clientX - d.x, d.total));
  };
  const onSplitUp = () => {
    if (!drag.current) return;
    drag.current = null;
    const final = liveRef.current;
    setLive(null);
    if (final) setDock((d) => ({ ...d, columns: d.columns.map((c) => ({ ...c, w: final.columns.find((x) => x.id === c.id)?.w ?? c.w })) }));
  };

  const tabsMode = dock.mode === "tabs";
  const tab = options.some((p) => p.key === dock.tab) ? dock.tab : options[0]?.key;
  const tabDef = tab ? defs[tab] : null;

  return (
    <section className={`st-dock ${tabsMode ? "is-tabs" : "is-cols"} ${live ? "is-resizing" : ""}`} style={{ height: h }}>
      {grip}
      {css && <style>{css}</style>}
      {tabsMode ? (
        <>
          <nav className="st-dock__tabs" role="tablist">
            {options.map((p) => {
              const d = defs[p.key];
              return (
                <button key={p.key} type="button" role="tab" aria-selected={tab === p.key} className={`${tab === p.key ? "is-on" : ""} ${p.accent ? "is-accent" : ""}`} onClick={() => setDock((x) => setTab(x, p.key))}>
                  <Icon name={d?.icon || p.icon} size={14} /><span>{d?.label || p.label}</span>
                  {d?.count ? <b className="st-dock__count">{d.count}</b> : null}
                </button>
              );
            })}
            <span className="st-dock__extra">
              <button type="button" className="st-dock__settings" onClick={() => setDock((d) => setMode(d, "columns"))} title="Çok sütunlu çalışma alanına geç"><Icon name="grid" size={13} /> Sütunlar</button>
              {extra}
            </span>
          </nav>
          <div className="st-dock__body" data-dock-panel={tab}>
            {tabDef && <PanelScope panel={tab}><PanelBoundary panel={tab}>{tabDef.render({ passive: false, column: false })}</PanelBoundary></PanelScope>}
          </div>
        </>
      ) : (
        <div className="st-dcols-wrap">
          <div ref={rowRef} className="st-dcols">
            {view.columns.map((c, i) => (
              <React.Fragment key={c.id}>
                <DockColumn col={c} index={i} count={dock.columns.length} dock={dock} setDock={setDock} defs={defs} options={options} flash={flashId === c.id}
                  previewMode={previewMode} onActivate={onActivate} onDeactivate={onDeactivate} style={{ flex: `${c.w} 1 0` }} />
                {i < view.columns.length - 1 && (
                  <div className="st-dsplit" role="separator" aria-orientation="vertical" title="Sürükle: sütun genişliği · çift tık: eşitle"
                    onPointerDown={onSplitDown(i)} onPointerMove={onSplitMove} onPointerUp={onSplitUp} onPointerCancel={onSplitUp}
                    onDoubleClick={() => setDock((d) => equalizeColumns(d))}><i /></div>
                )}
              </React.Fragment>
            ))}
          </div>
          <nav className="st-dtools" aria-label="Alt panel araçları">
            <button type="button" onClick={() => setDock((d) => addColumn(d, null, available))} disabled={dock.columns.length >= MAX_COLS} title={dock.columns.length >= MAX_COLS ? `En çok ${MAX_COLS} sütun` : "Sütun ekle"}><Icon name="plus" size={15} /></button>
            <button type="button" onClick={() => setDock((d) => equalizeColumns(d))} title="Sütun genişliklerini eşitle"><Icon name="arrows" size={14} /></button>
            <button type="button" onClick={() => setDock((d) => setMode(d, "tabs"))} title="Tek sekme kipine geç (eski düzen)"><Icon name="list" size={14} /></button>
            <span className="st-top__spacer" />
            {onOpenSettings && <button type="button" onClick={onOpenSettings} title="Alt panel ayarları: paneller, sıra, parçalar"><Icon name="sliders" size={14} /></button>}
          </nav>
        </div>
      )}
    </section>
  );
}
