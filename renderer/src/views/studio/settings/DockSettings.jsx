// Ayarlar › ALT PANEL: düzen (sütunlar / tek sekme, sütun sayısı ve içerikleri),
// panelleri aç / kapat ve sırala, her panelin parçalarını göster / gizle; panelin
// tamamı burada da açılıp ayarlanabilir ("Paneli burada aç").
import React, { useState } from "react";
import { Icon } from "../../../components/ui";
import {
  MAX_COLS, MIN_COLS, enabledPanels, equalizeColumns, isEnabled, moveColumn, movePanel, panelOf, resetParts, setColumnCount, setColumnPanel,
  setMode, setPanelEnabled, setPartVisible, togglePin,
} from "../dock/dockModel";
import { PanelScope, allPartsOf } from "../dock/parts";

export default function DockSettings({ Section, Choice, dock, setDock, resetDock, defs = {}, partsOnly = false }) {
  const available = Object.keys(defs);
  const options = enabledPanels(dock, available);
  const [open, setOpen] = useState(null); // parçaları açık panel
  const [liveKey, setLiveKey] = useState(null); // burada açılan panel
  const cols = dock.mode === "tabs";
  return (
    <>
      {!partsOnly && <Section title="Düzen" sub="Çok sütunlu çalışma alanında paneller yan yana, hepsi aynı anda açıktır. Ayraçları sürükleyerek genişlikleri değiştirebilirsin.">
        <div className="st-choices">
          <Choice on={!cols} title="Sütunlar (önerilen)" text="3–4 panel yan yana: ör. Reji | Sahneler | Tekrar | Ses" onClick={() => setDock((d) => setMode(d, "columns"))} />
          <Choice on={cols} title="Tek sekme" text="Eski düzen: sekmeler ve tek panel" onClick={() => setDock((d) => setMode(d, "tabs"))} />
        </div>
        {!cols && (
          <>
            <div className="st-row">
              <span className="st-dset__mini">Sütun sayısı</span>
              <div className="st-seg">
                {Array.from({ length: MAX_COLS - MIN_COLS + 1 }, (_, i) => i + MIN_COLS).map((n) => (
                  <button key={n} type="button" className={dock.columns.length === n ? "is-on" : ""} onClick={() => setDock((d) => setColumnCount(d, n, available))}>{n}</button>
                ))}
              </div>
              <span className="st-top__spacer" />
              <button type="button" className="btn btn--xs btn--ghost" onClick={() => setDock((d) => equalizeColumns(d))}><Icon name="arrows" size={12} /> Eşit genişlik</button>
            </div>
            <div className="st-dset__cols">
              {dock.columns.map((c, i) => (
                <div key={c.id} className={`st-dset__col ${c.pinned ? "is-pinned" : ""}`} style={{ flex: `${c.w} 1 0` }}>
                  <header>{i + 1}. sütun {c.pinned && <><Icon name="pin" size={10} /> sabit</>}</header>
                  <select value={c.panel} disabled={c.pinned} onChange={(e) => setDock((d) => setColumnPanel(d, c.id, e.target.value))} aria-label={`${i + 1}. sütun paneli`}>
                    {options.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                    {!options.some((p) => p.key === c.panel) && <option value={c.panel}>{panelOf(c.panel)?.label}</option>}
                  </select>
                  <div className="st-dset__acts">
                    <button type="button" className="icon-btn icon-btn--xs" disabled={i === 0} onClick={() => setDock((d) => moveColumn(d, c.id, -1))} title="Sola"><Icon name="chevronLeft" size={12} /></button>
                    <button type="button" className={`icon-btn icon-btn--xs ${c.pinned ? "is-on" : ""}`} onClick={() => setDock((d) => togglePin(d, c.id))} title={c.pinned ? "Sabitlemeyi kaldır" : "Sabitle"}><Icon name="pin" size={12} /></button>
                    <button type="button" className="icon-btn icon-btn--xs" disabled={i === dock.columns.length - 1} onClick={() => setDock((d) => moveColumn(d, c.id, 1))} title="Sağa"><Icon name="chevronRight" size={12} /></button>
                  </div>
                </div>
              ))}
            </div>
            <p className="st-hint">Sabit sütunun içeriği değişmez ve kaldırılamaz; başka yerden bir panele gidildiğinde (ör. üst çubuktaki maç) sabit olmayan sütun o panele döner.</p>
          </>
        )}
        <button type="button" className="btn btn--sm btn--ghost" onClick={resetDock}><Icon name="undo" size={13} /> Varsayılan düzene dön (Reji | Sahneler | Tekrar | Ses)</button>
      </Section>}

      <Section title="Paneller ve parçaları" sub="Alt panelde hangi paneller olsun, hangi sırayla; her panelin içinde hangi ayrıntılar görünsün. Gizlenen parçalar buradan (ya da sütun başlığındaki ⋯ menüsünden) geri açılır.">
        <ul className="st-dset__list">
          {dock.order.filter((k) => available.includes(k)).map((k, i, arr) => {
            const p = panelOf(k);
            const on = isEnabled(dock, k);
            const parts = allPartsOf(k);
            const hidden = dock.parts?.[k] || [];
            const expanded = open === k;
            return (
              <li key={k}>
                <div className={`st-dset__row ${on ? "" : "is-off"}`}>
                  <Icon name={p.icon} size={15} />
                  <span className="st-dset__name"><strong>{p.label}</strong><small>{p.hint}{hidden.length ? ` · ${hidden.length} parça gizli` : ""}</small></span>
                  <input type="checkbox" className="st-switch" checked={on} onChange={(e) => setDock((d) => setPanelEnabled(d, k, e.target.checked))} aria-label={`${p.label} açık`} />
                  <button type="button" className="icon-btn icon-btn--xs" disabled={i === 0} onClick={() => setDock((d) => movePanel(d, k, -1))} title="Yukarı"><Icon name="chevronUp" size={13} /></button>
                  <button type="button" className="icon-btn icon-btn--xs" disabled={i === arr.length - 1} onClick={() => setDock((d) => movePanel(d, k, 1))} title="Aşağı"><Icon name="chevronDown" size={13} /></button>
                  <button type="button" className={`btn btn--xs ${expanded ? "is-on" : ""}`} onClick={() => setOpen(expanded ? null : k)} aria-expanded={expanded}>
                    <Icon name="eye" size={11} /> Parçalar{parts.length ? ` (${parts.length - hidden.length}/${parts.length})` : ""}
                  </button>
                </div>
                {expanded && (
                  <div className="st-dset__parts">
                    {!parts.length && <p className="st-hint">Bu panelde ayrı gizlenebilen parça yok.</p>}
                    {parts.map((part) => {
                      const vis = !hidden.includes(part.id);
                      return (
                        <label key={part.id} className={`st-dset__part ${vis ? "is-on" : ""}`}>
                          <input type="checkbox" checked={vis} onChange={(e) => setDock((d) => setPartVisible(d, k, part.id, e.target.checked))} />
                          {part.label}
                        </label>
                      );
                    })}
                    <div className="st-row">
                      {hidden.length > 0 && <button type="button" className="btn btn--xs btn--ghost" onClick={() => setDock((d) => resetParts(d, k))}><Icon name="eye" size={11} /> Hepsini göster</button>}
                      {defs[k] && <button type="button" className={`btn btn--xs ${liveKey === k ? "is-on" : ""}`} onClick={() => setLiveKey(liveKey === k ? null : k)}><Icon name="sliders" size={11} /> {liveKey === k ? "Paneli kapat" : "Paneli burada aç (tüm ayrıntılarıyla)"}</button>}
                    </div>
                    {liveKey === k && defs[k] && (
                      <div className="st-dset__live" data-settings-panel={k}>
                        <PanelScope panel={k} showAll>{defs[k].render({ passive: true, column: true, settings: true })}</PanelScope>
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </Section>
    </>
  );
}
