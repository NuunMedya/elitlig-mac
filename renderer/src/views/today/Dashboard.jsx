// Bugün panosu: sayfalar (Genel, Maç günü, Muhasebe…), 12 sütunlu tuval (react-grid-layout), Düzenle
// kipi (sürükle, boyutla, kaldır, kopyala, ayarlar), bileşen kütüphanesi, hazır şablonlar.
// Düzen localStorage'da kullanıcı başına saklanır (dashModel). Dar pencerede sütunlar azalır, düzenleme kapanır.
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import GridLayout from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { Icon, MenuButton, Modal, useConfirm, useResult, useToast } from "../../components/ui";
import {
  COLS, TEMPLATES, activePage, addItem, addPage, applyGrid, colsForWidth, compactFor, defaultState, duplicateItem, loadState, movePage,
  patchItem, removeItem, removePage, renamePage, replacePage, resizeItem, saveState, setActive, setTier, sizeForTier, sizeLimits, storageKey, updateItems,
} from "./dashModel";
import { isAllowed, metaOf } from "./registry";
import Tile from "./Tile";
import Library, { libDrag } from "./Library";
import TileSettings from "./TileSettings";
import "./today.css";

const store = () => { try { return window.localStorage; } catch { return null; } };

function useWidth(ref) {
  const [width, setWidth] = useState(1100);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const measure = () => setWidth(Math.max(280, Math.floor(el.clientWidth)));
    measure();
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return width;
}

function TemplatesModal({ onClose, onNewPage, onReplace, pageTitle }) {
  return (
    <Modal title="Hazır şablonlar" onClose={onClose} width={720} className="dt-templates">
      <div className="dt-tpl-grid">
        {Object.entries(TEMPLATES).map(([key, t]) => (
          <article key={key} className="dt-tpl" data-template={key}>
            <header><Icon name={t.icon} size={16} /><b>{t.title}</b><small>{t.items.length} bileşen</small></header>
            <p>{t.hint}</p>
            <div className="dt-tpl__mini" aria-hidden="true">
              {t.items.map((it, n) => <i key={n} style={{ gridColumn: `${it.x + 1} / span ${it.w}`, gridRow: `${it.y + 1} / span ${it.h}`, background: metaOf(it.t)?.tint }} />)}
            </div>
            <footer>
              <button type="button" className="btn btn--xs btn--primary" onClick={() => onNewPage(key)}><Icon name="plus" size={11} /> Yeni sayfa</button>
              <button type="button" className="btn btn--xs" onClick={() => onReplace(key)} title={`“${pageTitle}” sayfasının içeriğini bu şablonla değiştir`}>Bu sayfaya uygula</button>
            </footer>
          </article>
        ))}
      </div>
    </Modal>
  );
}

export default function Dashboard({ go, auth }) {
  const toast = useToast();
  const result = useResult();
  const confirm = useConfirm();
  const key = storageKey(auth?.user?.id);
  const [state, setState] = useState(() => loadState(store(), key));
  const [edit, setEdit] = useState(false);
  const [lib, setLib] = useState(false);
  const [templates, setTemplates] = useState(false);
  const [settingsId, setSettingsId] = useState(null);
  const [renaming, setRenaming] = useState(null);
  const hostRef = useRef(null);
  const width = useWidth(hostRef);
  const access = auth?.access || {};

  // Kayıt: değişiklikten kısa süre sonra (sürüklerken her karede yazılmasın).
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return undefined; }
    const t = setTimeout(() => saveState(store(), key, state), 250);
    return () => clearTimeout(t);
  }, [state, key]);
  // Başka pencerede (ör. ikinci ana pencere) değişirse.
  useEffect(() => {
    const onStorage = (e) => { if (e.key === key && e.newValue) setState(loadState(store(), key)); };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [key]);
  useEffect(() => {
    if (!edit) return undefined;
    const onKey = (e) => { if (e.key === "Escape" && !document.querySelector(".modal-backdrop, .menu__list, .dt-lib")) setEdit(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [edit]);

  const page = activePage(state);
  const items = useMemo(() => page.items.filter((it) => isAllowed(metaOf(it.t), access)), [page.items, access]);
  const setItems = useCallback((fn) => setState((s) => updateItems(s, activePage(s).id, fn)), []);

  const cols = colsForWidth(width);
  const narrow = cols < COLS;
  const margin = width < 640 ? 8 : 12;
  const colW = (width - margin * (cols + 1)) / cols;
  const rowH = Math.round(Math.min(78, Math.max(54, colW * (narrow ? 0.5 : 0.66))));
  const grid = useMemo(() => {
    const base = narrow ? compactFor(items, cols) : items.map(({ i, x, y, w, h }) => ({ i, x, y, w, h }));
    return base.map((g) => {
      const m = metaOf(items.find((it) => it.i === g.i)?.t);
      const { min, max } = sizeLimits(m);
      return { ...g, minW: Math.min(cols, min[0]), minH: min[1], maxW: Math.min(cols, max[0]), maxH: max[1] };
    });
  }, [items, cols, narrow]);
  const canEdit = edit && !narrow;

  const add = (t, tier = null, pos = null) => {
    const meta = metaOf(t);
    if (!meta) return;
    const [w, h] = tier ? sizeForTier(meta, tier) : meta.size;
    let added = null;
    setItems((list) => { const next = addItem(list, t, { w, h, ...(pos || {}) }); added = next[next.length - 1]; return next; });
    if (!edit) setEdit(true);
    toast(`${meta.label} eklendi.`, { tone: "success", timeout: 2500 });
    setTimeout(() => { const el = added && hostRef.current?.querySelector(`[data-i="${added.i}"]`); el?.scrollIntoView?.({ block: "nearest", behavior: "smooth" }); }, 120);
  };
  const remove = (i) => {
    const before = page.items;
    const it = before.find((x) => x.i === i);
    setItems((list) => removeItem(list, i));
    toast(`${it?.title || metaOf(it?.t)?.label || "Bileşen"} kaldırıldı.`, { tone: "info", timeout: 6000, action: { label: "Geri al", run: () => setItems(() => before) } });
  };
  const handlers = {
    onPatch: (i, patch) => setItems((list) => patchItem(list, i, patch)),
    onRemove: remove,
    onDuplicate: (i) => setItems((list) => duplicateItem(list, i)),
    onResize: (i, w, h) => setItems((list) => resizeItem(list, i, w, h)),
    onTier: (i, tier) => setItems((list) => setTier(list, i, tier)),
    onSettings: (i) => setSettingsId(i),
  };
  const commit = (g) => { if (!narrow) setItems((list) => applyGrid(list, g)); };
  const onDrop = (_layout, dropped) => {
    const d = libDrag.cur;
    libDrag.cur = null;
    if (d?.t && dropped) add(d.t, null, { x: dropped.x, y: dropped.y });
  };
  const dropSize = () => {
    const m = metaOf(libDrag.cur?.t);
    return m ? { w: Math.min(cols, m.size[0]), h: m.size[1] } : false;
  };

  const resetAll = async () => {
    if (!(await confirm({ title: "Varsayılana dön", message: "Tüm Bugün sayfaları (Genel, Maç günü, Muhasebe) ilk hâline döner; eklediğiniz sayfa ve bileşenler silinir.", confirmLabel: "Varsayılana dön", danger: true }))) return;
    const prev = state;
    setState(defaultState());
    toast("Bugün varsayılan düzene döndü.", { tone: "success", timeout: 7000, action: { label: "Geri al", run: () => setState(prev) } });
  };
  const deletePage = async (p) => {
    if (state.pages.length <= 1) return;
    if (p.items.length && !(await confirm({ title: "Sayfayı sil", message: `“${p.title}” sayfası ve ${p.items.length} bileşeni silinsin mi?`, confirmLabel: "Sil", danger: true }))) return;
    const prev = state;
    setState((s) => removePage(s, p.id));
    toast(`“${p.title}” silindi.`, { tone: "info", timeout: 6000, action: { label: "Geri al", run: () => setState(prev) } });
  };
  const pageMenu = [
    { label: "Yeni boş sayfa", icon: "plus", onClick: () => setState((s) => addPage(s, "bos", `Sayfa ${s.pages.length + 1}`)) },
    { label: "Hazır şablonlar…", icon: "layout", onClick: () => setTemplates(true) },
    "-",
    { label: "Sayfayı yeniden adlandır", icon: "pencil", onClick: () => setRenaming(page.id) },
    { label: "Sola taşı", icon: "chevronLeft", disabled: state.pages[0].id === page.id, onClick: () => setState((s) => movePage(s, page.id, -1)) },
    { label: "Sağa taşı", icon: "chevronRight", disabled: state.pages.at(-1).id === page.id, onClick: () => setState((s) => movePage(s, page.id, 1)) },
    { label: "Sayfayı sil", icon: "trash", danger: true, disabled: state.pages.length <= 1, onClick: () => deletePage(page) },
    "-",
    { label: "Varsayılana dön", icon: "rotate", danger: true, onClick: resetAll },
  ];
  const settingsItem = settingsId ? page.items.find((x) => x.i === settingsId) : null;
  const ctx = useMemo(() => ({ go, auth, result, toast }), [go, auth, result, toast]);

  return (
    <div className={`dt${edit ? " is-edit" : ""}${lib ? " has-lib" : ""}`}>
      <div className="dt-toolbar" role="toolbar" aria-label="Bugün düzeni">
        <div className="dt-pages" role="tablist" aria-label="Bugün sayfaları">
          {state.pages.map((p) => (renaming === p.id ? (
            <input key={p.id} className="dt-pages__rename" defaultValue={p.title} autoFocus aria-label="Sayfa adı"
              onBlur={(e) => { setState((s) => renamePage(s, p.id, e.target.value)); setRenaming(null); }}
              onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") setRenaming(null); }} />
          ) : (
            <button key={p.id} type="button" role="tab" aria-selected={p.id === page.id} className={p.id === page.id ? "is-on" : ""} data-page={p.id}
              onClick={() => setState((s) => setActive(s, p.id))} onDoubleClick={() => edit && setRenaming(p.id)} title={edit ? "Çift tık: yeniden adlandır" : undefined}>
              {p.title}{edit && state.pages.length > 1 && <span className="dt-pages__x" role="button" tabIndex={-1} aria-label={`${p.title} sayfasını sil`} onClick={(e) => { e.stopPropagation(); deletePage(p); }}><Icon name="x" size={10} /></span>}
            </button>
          )))}
          <button type="button" className="dt-pages__add" onClick={() => setTemplates(true)} aria-label="Sayfa ekle" title="Sayfa ekle (şablondan ya da boş)"><Icon name="plus" size={13} /></button>
        </div>
        <span className="dt-grow" />
        {edit && narrow && <span className="pill pill--amber">Düzenlemek için pencereyi genişletin</span>}
        <button type="button" className={`btn btn--sm${lib ? " is-on" : ""}`} onClick={() => { setLib((v) => !v); if (!edit) setEdit(true); }} aria-pressed={lib}><Icon name="grid" size={14} /> Bileşen kütüphanesi</button>
        <button type="button" className={`btn btn--sm${edit ? " btn--primary" : ""}`} onClick={() => { setEdit((v) => !v); if (edit) setLib(false); }} aria-pressed={edit} data-testid="dash-edit">
          <Icon name={edit ? "check" : "pencil"} size={14} /> {edit ? "Bitti" : "Düzenle"}
        </button>
        <MenuButton items={pageMenu} label="Sayfa ve düzen" />
      </div>

      <div className="dt-canvas" ref={hostRef}>
        {!items.length && (
          <div className="dt-blank">
            <Icon name="grid" size={26} />
            <p><b>{page.title}</b> boş. Kütüphaneden düğme ve bileşen ekleyin ya da hazır bir şablon uygulayın.</p>
            <div className="dt-actions">
              <button type="button" className="btn btn--primary" onClick={() => { setEdit(true); setLib(true); }}><Icon name="plus" size={14} /> Bileşen ekle</button>
              <button type="button" className="btn" onClick={() => setTemplates(true)}><Icon name="layout" size={14} /> Şablonlar</button>
            </div>
          </div>
        )}
        <GridLayout
          className="dt-grid"
          width={width}
          cols={cols}
          layout={grid}
          rowHeight={rowH}
          margin={[margin, margin]}
          containerPadding={[0, 4]}
          compactType="vertical"
          isDraggable={canEdit}
          isResizable={canEdit}
          isDroppable={canEdit}
          resizeHandles={["se", "e", "s", "w"]}
          draggableCancel="button, input, select, textarea, a, .menu, .dt-tile__tiers, .react-resizable-handle"
          onDragStop={commit}
          onResizeStop={commit}
          onDrop={onDrop}
          onDropDragOver={dropSize}
          droppingItem={{ i: "__drop__", w: 3, h: 2 }}
          useCSSTransforms
        >
          {items.map((it) => (
            <div key={it.i} className="dt-cell">
              <Tile item={it} meta={metaOf(it.t)} edit={edit} ctx={ctx} eager={it.y < 12} {...handlers} />
            </div>
          ))}
        </GridLayout>
      </div>

      {lib && <Library onAdd={add} onClose={() => setLib(false)} ctx={ctx} access={access} />}
      {templates && (
        <TemplatesModal pageTitle={page.title} onClose={() => setTemplates(false)}
          onNewPage={(k) => { setState((s) => addPage(s, k)); setTemplates(false); }}
          onReplace={async (k) => {
            if (page.items.length && !(await confirm({ title: "Şablonu uygula", message: `“${page.title}” sayfasındaki ${page.items.length} bileşen “${TEMPLATES[k].title}” şablonuyla değiştirilsin mi?`, confirmLabel: "Uygula" }))) return;
            const prev = state;
            setState((s) => replacePage(s, page.id, k));
            setTemplates(false);
            toast(`“${TEMPLATES[k].title}” uygulandı.`, { tone: "success", timeout: 6000, action: { label: "Geri al", run: () => setState(prev) } });
          }} />
      )}
      {settingsItem && <TileSettings item={settingsItem} meta={metaOf(settingsItem.t)} onClose={() => setSettingsId(null)} {...handlers} />}
    </div>
  );
}
