// Yayın Stüdyosu · SOL KISAYOL ŞERİDİ: yukarıdan aşağı iki sütunlu ızgara.
//
//   - Her öğe işlevsel bir parçacıktır (./widgets.jsx): 1×1 ya da 2×2.
//   - "+" katalogdan ekler; sağ tık menüsü: büyüt / küçült, kaldır, düzenle.
//   - Düzenle kipinde sürükle-bırak ile sıralanır (HTML5), köşedeki düğmelerle
//     boyutlanır / kaldırılır. Düzen localStorage "studio.rail.v1"de saklanır.
//   - Açılır paneller (skorbord çeşitleri, tekrar açıları, olay girişi…)
//     parçacığın sağında açılır (RailPopover).
//
// Studio şunları verir: items / setItems (useRail), ctx (parçacıkların okuduğu
// durum ve eylemler — sözleşme Studio.jsx'teki railCtx), zoom (arayüz ölçeği).
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Icon, Modal } from "../../../components/ui";
import { RAIL_GROUPS, RAIL_WIDGETS, addWidget, canAdd, loadRail, moveWidget, normalizeRail, removeWidget, saveRail, toggleWidgetSize, widgetOf } from "./railModel";
import { WIDGET_IMPL } from "./widgets";
import RailPopover from "./RailPopover";
import "./shortcuts.css";

const store = () => { try { return window.localStorage; } catch { return null; } };

/** Şerit düzeni kancası (Ayarlar sayfası da aynısını kullanır). */
export function useRail() {
  const [items, setItemsRaw] = useState(() => loadRail(store()));
  useEffect(() => { saveRail(store(), items); }, [items]);
  const setItems = useCallback((fn) => setItemsRaw((cur) => normalizeRail(typeof fn === "function" ? fn(cur) : fn)), []);
  const reset = useCallback(() => setItemsRaw(normalizeRail(null)), []);
  return { items, setItems, reset };
}

/** Katalog: gruplar hâlinde parçacıklar; "Ekle" (1×1 / 2×2). Sahneler ayrı listelenir. */
export function RailCatalog({ items, onAdd, scenes = [], compact = false }) {
  return (
    <div className={`st-cat ${compact ? "is-compact" : ""}`}>
      {RAIL_GROUPS.map((grp) => (
        <section key={grp.key} className="st-cat__group">
          <h6>{grp.label}</h6>
          <div className="st-cat__grid">
            {RAIL_WIDGETS.filter((w) => w.group === grp.key && !w.multi).map((w) => {
              const ok = canAdd(items, w.type);
              return (
                <div key={w.type} className={`st-cat__item ${ok ? "" : "is-added"}`}>
                  <span className="st-cat__icon"><Icon name={w.icon} size={18} /></span>
                  <span className="st-cat__text"><strong>{w.label}</strong><small>{w.hint}</small></span>
                  {ok ? (
                    <span className="st-cat__add">
                      <button type="button" className="btn btn--xs" onClick={() => onAdd(w.type, 1)} title="1 hücre">+ 1×1</button>
                      <button type="button" className="btn btn--xs" onClick={() => onAdd(w.type, 2)} title="4 hücre">+ 2×2</button>
                    </span>
                  ) : <em className="st-cat__done"><Icon name="check" size={12} /> şeritte</em>}
                </div>
              );
            })}
          </div>
          {grp.key === "diger" && (
            <div className="st-cat__scenes">
              <small>Sahne kısayolu (canlı küçük resim, tık: önizleme, çift tık: yayın)</small>
              <div className="st-chips">
                {scenes.map((s) => {
                  const has = items.some((x) => x.type === "scene" && x.opts?.sceneId === s.id);
                  return <button key={s.id} type="button" className={`st-chip ${has ? "is-on" : ""}`} disabled={has} onClick={() => onAdd("scene", 1, { sceneId: s.id })}>{has ? "✓ " : "+ "}{s.name}</button>;
                })}
                {!scenes.length && <span className="st-hint">Sahne yok.</span>}
              </div>
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

function RailItem({ item, ctx, editing, dragOver, popOpen, onTogglePop, onContext, onDragStart, onDragOver, onDrop, onDragEnd, onResize, onRemove, setAnchor }) {
  const impl = WIDGET_IMPL[item.type];
  const meta = widgetOf(item.type);
  const ref = useRef(null);
  const big = item.size === 2;
  useEffect(() => { if (popOpen) setAnchor(ref.current); }, [popOpen, setAnchor]);
  if (!impl) return null;
  let body = null;
  try { body = impl.render({ ctx, item, big, togglePop: () => onTogglePop(item.id, ref.current), popOpen }); } catch { body = <div className="st-w is-plain"><span className="st-w__label">{meta?.label}</span><span className="st-w__sub">kullanılamıyor</span></div>; }
  return (
    <div ref={ref} className={`st-ri ${big ? "is-2" : "is-1"} ${editing ? "is-editing" : ""} ${dragOver ? "is-over" : ""}`} data-type={item.type}
      draggable={editing} onDragStart={(e) => onDragStart(e, item.id)} onDragOver={(e) => onDragOver(e, item.id)} onDrop={(e) => onDrop(e, item.id)} onDragEnd={onDragEnd}
      onContextMenu={(e) => onContext(e, item)}>
      {body}
      {editing && (
        <div className="st-ri__edit" title={`${meta?.label || ""} — sürükle: taşı`}>
          <Icon name="grip" size={16} />
          <span className="st-ri__name">{meta?.label}</span>
          <button type="button" className="st-ri__btn" onClick={() => onResize(item.id)} title={big ? "Küçült (1×1)" : "Büyüt (2×2)"}>{big ? "1×1" : "2×2"}</button>
          <button type="button" className="st-ri__btn is-x" onClick={() => onRemove(item.id)} title="Şeritten kaldır"><Icon name="x" size={12} /></button>
        </div>
      )}
    </div>
  );
}

export default function ShortcutRail({ items, setItems, reset, ctx, zoom = 1, onOpenSettings }) {
  const hostRef = useRef(null);
  const [editing, setEditing] = useState(false);
  const [catalog, setCatalog] = useState(false);
  const [pop, setPop] = useState(null); // { id }
  const [anchor, setAnchor] = useState(null);
  const [wide, setWide] = useState(false);
  const [menu, setMenu] = useState(null); // { x, y, item }
  const [over, setOver] = useState(null);
  const dragId = useRef(null);

  const togglePop = useCallback((id, el) => { setWide(false); setAnchor(el); setPop((p) => (p?.id === id ? null : { id })); }, []);
  const closePop = useCallback(() => setPop(null), []);
  useEffect(() => { if (editing) setPop(null); }, [editing]);
  // Dışarıdan aç (ör. kısayol tuşu: Olay gir): ctx.railPopRef.current = (type) => …
  useEffect(() => {
    if (!ctx.railPopRef) return undefined;
    ctx.railPopRef.current = (type) => {
      const it = items.find((x) => x.type === type);
      if (!it) return false;
      const el = hostRef.current?.querySelector(`[data-type="${type}"]`);
      togglePop(it.id, el);
      return true;
    };
    return () => { ctx.railPopRef.current = null; };
  }, [ctx.railPopRef, items, togglePop]);

  const onContext = (e, item) => {
    e.preventDefault();
    e.stopPropagation();
    const h = hostRef.current.getBoundingClientRect();
    setMenu({ x: (e.clientX - h.left) / zoom, y: (e.clientY - h.top) / zoom, item });
  };
  useEffect(() => {
    if (!menu) return undefined;
    const close = (e) => { if (!e.target?.closest?.(".st-rmenu")) setMenu(null); };
    const key = (e) => { if (e.key === "Escape") setMenu(null); };
    window.addEventListener("mousedown", close, true);
    window.addEventListener("keydown", key, true);
    return () => { window.removeEventListener("mousedown", close, true); window.removeEventListener("keydown", key, true); };
  }, [menu]);

  const onDragStart = (e, id) => { if (!editing) { e.preventDefault(); return; } dragId.current = id; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/st-rail", id); };
  const onDragOver = (e, id) => { if (!dragId.current) return; e.preventDefault(); e.stopPropagation(); setOver(id); };
  const onDrop = (e, id) => {
    e.preventDefault(); e.stopPropagation();
    const from = dragId.current;
    dragId.current = null; setOver(null);
    if (from && from !== id) setItems((cur) => moveWidget(cur, from, id));
  };
  const onDragEnd = () => { dragId.current = null; setOver(null); };

  const add = (type, size, opts) => setItems((cur) => addWidget(cur, type, { size, opts }));
  const popItem = pop ? items.find((x) => x.id === pop.id) : null;
  const popImpl = popItem ? WIDGET_IMPL[popItem.type] : null;

  return (
    <aside ref={hostRef} className={`st-railwrap ${editing ? "is-editing" : ""}`} aria-label="Kısayollar" onContextMenu={(e) => { e.preventDefault(); const h = hostRef.current.getBoundingClientRect(); setMenu({ x: (e.clientX - h.left) / zoom, y: (e.clientY - h.top) / zoom, item: null }); }}>
      <div className="st-sr" onDragOver={(e) => { if (dragId.current) e.preventDefault(); }}
        onDrop={(e) => { e.preventDefault(); const from = dragId.current; dragId.current = null; setOver(null); if (from) setItems((cur) => moveWidget(cur, from, null)); }}>
        {items.map((it) => (
          <RailItem key={it.id} item={it} ctx={ctx} editing={editing} dragOver={over === it.id} popOpen={pop?.id === it.id}
            onTogglePop={togglePop} onContext={onContext} onDragStart={onDragStart} onDragOver={onDragOver} onDrop={onDrop} onDragEnd={onDragEnd}
            onResize={(id) => setItems((cur) => toggleWidgetSize(cur, id))} onRemove={(id) => setItems((cur) => removeWidget(cur, id))} setAnchor={setAnchor} />
        ))}
        <button type="button" className="st-sr__add" onClick={() => setCatalog(true)} title="Kısayol ekle"><Icon name="plus" size={18} /><span>Ekle</span></button>
      </div>
      <footer className="st-sr__foot">
        <button type="button" className={`st-sr__tool ${editing ? "is-on" : ""}`} onClick={() => setEditing((v) => !v)} title={editing ? "Düzenlemeyi bitir" : "Kısayolları düzenle: sürükle, boyutla, kaldır"}>
          <Icon name={editing ? "check" : "pencil"} size={13} /> {editing ? "Bitti" : "Düzenle"}
        </button>
        <button type="button" className="st-sr__tool" onClick={() => setCatalog(true)} title="Kısayol ekle"><Icon name="plus" size={13} /></button>
      </footer>

      {popItem && popImpl?.popover && (
        <RailPopover anchor={anchor} host={hostRef.current} zoom={zoom} wide={wide} title={popImpl.popTitle || widgetOf(popItem.type)?.label} onClose={closePop}>
          {popImpl.popover({ ctx, item: popItem, onClose: closePop, setWide })}
        </RailPopover>
      )}

      {menu && (
        <div className="st-rmenu" style={{ left: menu.x, top: menu.y }} role="menu">
          {menu.item && (
            <>
              <span className="st-rmenu__title">{widgetOf(menu.item.type)?.label}</span>
              <button type="button" role="menuitem" onClick={() => { setItems((cur) => toggleWidgetSize(cur, menu.item.id)); setMenu(null); }}><Icon name="grid" size={13} /> {menu.item.size === 2 ? "Küçült (1×1)" : "Büyüt (2×2)"}</button>
              <button type="button" role="menuitem" className="is-danger" onClick={() => { setItems((cur) => removeWidget(cur, menu.item.id)); setMenu(null); }}><Icon name="trash" size={13} /> Şeritten kaldır</button>
              <hr />
            </>
          )}
          <button type="button" role="menuitem" onClick={() => { setCatalog(true); setMenu(null); }}><Icon name="plus" size={13} /> Kısayol ekle…</button>
          <button type="button" role="menuitem" onClick={() => { setEditing((v) => !v); setMenu(null); }}><Icon name="pencil" size={13} /> {editing ? "Düzenlemeyi bitir" : "Düzenle (sürükle, boyutla)"}</button>
          {onOpenSettings && <button type="button" role="menuitem" onClick={() => { onOpenSettings(); setMenu(null); }}><Icon name="sliders" size={13} /> Kısayol ayarları</button>}
          <button type="button" role="menuitem" onClick={() => { reset(); setMenu(null); }}><Icon name="undo" size={13} /> Varsayılan düzene dön</button>
        </div>
      )}

      {catalog && (
        <Modal title="Kısayol ekle" onClose={() => setCatalog(false)} width={760} className="st-modal"
          footer={<><span className="st-hint">Şeritte sağ tık: büyüt / küçült / kaldır · “Düzenle” ile sürükleyerek sırala.</span><button type="button" className="btn btn--primary" onClick={() => setCatalog(false)}>Bitti</button></>}>
          <RailCatalog items={items} onAdd={add} scenes={ctx.scenes} />
        </Modal>
      )}
    </aside>
  );
}
