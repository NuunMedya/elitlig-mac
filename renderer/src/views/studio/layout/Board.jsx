// Yayın Stüdyosu · PANO: serbest bileşen tuvali (react-grid-layout).
//
//   Bileşenler (ses kanal şeridi, tümünü kapat, tekrar listesi, reji sütunları, kısayol
//   parçacıkları…) ızgaraya yerleşir; dikey sıkıştırma boşlukları kapatır. Düzenle
//   kipinde: tutamaçtan sürükle (taşı), köşeden / kenardan boyutla (en ve boy), ⇄
//   tutamacını başka bir panoya sürükle (taşı), ⋯ menüsü: boyut, başka panoya taşı,
//   ayrı panele çıkar, kaldır. Katalogdaki kartlar da panoya sürüklenebilir.
//   Parçacık açılır panelleri (skorbord çeşitleri, tekrar açıları, olay girişi…)
//   parçacığın yanında, ekrana sabitlenmiş olarak açılır.
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import GridLayout, { WidthProvider } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { Icon, MenuButton } from "../../../components/ui";
import { addItem, applyGrid, boardPanelId, componentOf, dropRemoved, normalizeItem, pushRemoved, removeItem, resizeItem, setBoardCols } from "./layoutModel";
import { useLayoutCtx } from "./ctx";
import { itemLabel } from "./components";
import { WIDGET_IMPL } from "../shortcuts/widgets";
import { clearIntent, intentOf, openPop } from "../shortcuts/wkit";

const Grid = WidthProvider(GridLayout);

/** Panolar arası / katalogdan sürükleme (HTML5): sürüklenen öğe. */
export const dragState = { cur: null };
export function startDrag(e, payload) {
  dragState.cur = payload;
  try { e.dataTransfer.setData("text/plain", "studio-layout"); e.dataTransfer.effectAllowed = "copyMove"; } catch { /* yoksay */ }
}
export const endDrag = () => { dragState.cur = null; };

/** Ekrana sabit açılır panel (bölme kenarında kırpılmaz). */
function FloatPop({ anchor, title, wide, zoom = 1, onClose, children }) {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useLayoutEffect(() => {
    const a = anchor?.getBoundingClientRect?.();
    const box = ref.current?.getBoundingClientRect?.();
    if (!a) return;
    const z = zoom || 1;
    const W = window.innerWidth, H = window.innerHeight;
    const bw = box?.width || 340, bh = box?.height || 300;
    let left = a.right + 8;
    if (left + bw > W - 8) left = Math.max(8, a.left - bw - 8);
    let top = a.top;
    if (top + bh > H - 8) top = Math.max(8, H - bh - 8);
    setPos({ left: left / z, top: top / z });
  }, [anchor, zoom, children]);
  useEffect(() => {
    const onDown = (e) => {
      if (ref.current?.contains(e.target) || anchor?.contains?.(e.target)) return;
      if (e.target?.closest?.(".menu__list, .modal-backdrop")) return;
      closeRef.current?.();
    };
    const onKey = (e) => { if (e.key === "Escape" && !document.querySelector(".menu__list")) { e.stopPropagation(); closeRef.current?.(); } };
    window.addEventListener("mousedown", onDown, true);
    window.addEventListener("keydown", onKey, true);
    return () => { window.removeEventListener("mousedown", onDown, true); window.removeEventListener("keydown", onKey, true); };
  }, [anchor]);
  const host = anchor?.closest?.(".studio") || document.body;
  return createPortal(
    <div ref={ref} className={`st-pop lw-pop ${wide ? "is-wide" : ""}`} style={{ position: "fixed", left: pos?.left ?? -9999, top: pos?.top ?? 0 }} role="dialog" aria-label={title}>
      {title && <header className="st-pop__head"><strong>{title}</strong><button type="button" className="st-pop__x" onClick={onClose} aria-label="Kapat">×</button></header>}
      <div className="st-pop__body">{children}</div>
    </div>,
    host,
  );
}

const SIZE_PRESETS = [[1, 2, "1×1"], [2, 2, "2×1"], [1, 4, "1×2"], [2, 4, "2×2"], [3, 2, "3×1"], [4, 4, "4×2"], [6, 4, "6×2"], [4, 8, "4×4"], [6, 8, "6×4"], [12, 4, "tam en"]];

function BoardItem({ item, boardId, boards, edit, ctx, pop, setPop, onRemove, onResize, onMoveTo, onExtract }) {
  const ref = useRef(null);
  const meta = componentOf(item.t);
  const label = itemLabel(item, ctx);
  const popOpen = pop?.i === item.i;
  // Seçenek alanı olmayan parçacıkta "seçenekler" niyeti → yalnız renk ve biçim paneli (style).
  const togglePop = useCallback(() => {
    const impl = WIDGET_IMPL[meta?.widget];
    const style = Boolean(impl) && intentOf(item.i)?.mode === "options" && !impl.options;
    if (style) clearIntent(item.i);
    setPop((p) => (p?.i === item.i ? null : { i: item.i, anchor: ref.current, wide: false, style }));
  }, [item.i, meta?.widget, setPop]);
  // Sağ tık (parçacık kendisi işlemediyse): renk ve biçim / seçenekler.
  const onContextMenu = meta?.widget && !edit ? (e) => { e.preventDefault(); openPop({ id: item.i }, togglePop, { mode: "options" }); } : undefined;
  const others = boards.filter((b) => b.id !== boardId);
  const menu = [
    ...SIZE_PRESETS.map(([w, h, l]) => ({ label: `Boyut ${l}`, icon: "grid", onClick: () => onResize(item.i, w, h) })),
    "-",
    ...others.map((b) => ({ label: `Taşı → ${b.title}`, icon: "chevronRight", onClick: () => onMoveTo(item, b.id) })),
    { label: "Yeni sekmeye taşı", icon: "plus", onClick: () => onMoveTo(item, null) },
    { label: "Ayrı panele çıkar (sağa)", icon: "external", onClick: () => onExtract(item) },
    "-",
    { label: "Kaldır", icon: "trash", danger: true, onClick: () => onRemove(item) },
  ];
  let body = null;
  try { body = ctx.renderComponent(item, { boardId, popOpen, togglePop, setPopWide: (v) => setPop((p) => (p ? { ...p, wide: v } : p)) }); } catch (e) { body = <p className="st-hint st-pad">{label}: çizilemedi ({String(e?.message || e)})</p>; }
  return (
    <div ref={ref} className={`lw-item ${edit ? "is-edit" : ""}`} data-t={item.t} data-i={item.i} data-type={meta?.widget || undefined} onContextMenu={onContextMenu}
      onPointerDownCapture={() => { if (meta?.panel) ctx.onActivate?.(meta.panel); }}>
      <div className="lw-item__body">{body}</div>
      {edit && (
        <div className="lw-item__bar" title={`${label} — sürükle: taşı · sağ alt köşe / kenar: boyutla`}>
          <span className="lw-drag" aria-label="Taşı"><Icon name="grip" size={13} /></span>
          <span className="lw-item__name">{label}</span>
          <span className="lw-item__wh">{item.w}×{item.h}</span>
          <span className="lw-xdrag" draggable onDragStart={(e) => startDrag(e, { from: boardId, item })} onDragEnd={endDrag} title="Başka bir panoya sürükle"><Icon name="swap" size={12} /></span>
          <MenuButton items={menu} label="Bileşen seçenekleri" size={13} align="end" className="lw-item__menu" />
          <button type="button" className="lw-item__x" onClick={() => onRemove(item)} title="Kaldır (Kutu ekle'den geri gelir)"><Icon name="x" size={12} /></button>
        </div>
      )}
    </div>
  );
}

export default function Board({ boardId, panelId }) {
  const ctx = useLayoutCtx();
  const { layout, setLayout, edit } = ctx;
  const board = layout.boards?.[boardId];
  const [pop, setPop] = useState(null);
  const [over, setOver] = useState(false);
  const hostRef = useRef(null);
  const boards = useMemo(() => Object.entries(layout.boards || {}).map(([id, b]) => ({ id, title: b.title })), [layout.boards]);
  useEffect(() => { if (edit) setPop(null); }, [edit]);

  const setBoard = useCallback((fn) => setLayout((l) => (l.boards[boardId] ? { ...l, boards: { ...l.boards, [boardId]: fn(l.boards[boardId]) } } : l)), [boardId, setLayout]);

  // Kısayol tuşları (ör. Olay gir) bu panodaki parçacığın açılır panelini açabilir.
  useEffect(() => {
    const reg = ctx.popOpeners;
    if (!reg) return undefined;
    const open = (type) => {
      const it = board?.items.find((x) => componentOf(x.t)?.widget === type);
      if (!it) return false;
      const el = hostRef.current?.querySelector(`[data-t="w:${type}"]`);
      if (!el) return false;
      setPop({ i: it.i, anchor: el, wide: false });
      return true;
    };
    reg.add(open);
    return () => reg.delete(open);
  }, [ctx.popOpeners, board?.items]);

  if (!board) {
    return (
      <div className="lw-empty">
        <Icon name="grid" size={22} />
        <p>Bu pano bulunamadı.</p>
        <button type="button" className="btn btn--sm" onClick={() => setLayout((l) => ({ ...l, boards: { ...l.boards, [boardId]: { title: "Pano", cols: 12, rowH: 40, items: [] } } }))}>Boş pano oluştur</button>
      </div>
    );
  }

  const grid = board.items.map((it) => {
    const m = componentOf(it.t);
    return { i: it.i, x: it.x, y: it.y, w: it.w, h: it.h, minW: Math.min(board.cols, m?.min?.[0] || 1), minH: m?.min?.[1] || 1 };
  });
  const commit = (g) => setBoard((b) => applyGrid(b, g));
  const remove = (item) => {
    setLayout((l) => {
      const b = l.boards[boardId];
      if (!b) return l;
      return pushRemoved({ ...l, boards: { ...l.boards, [boardId]: removeItem(b, item.i) } }, { kind: "item", id: item.i, t: item.t, o: item.o, board: boardId, w: item.w, h: item.h, label: itemLabel(item, ctx) });
    });
  };
  const moveTo = (item, toId) => {
    if (!toId) {
      ctx.ctrl().newBoard({ panel: panelId, direction: "within" }, { title: itemLabel(item, ctx), items: [{ ...item, x: 0, y: 0 }] });
      setBoard((b) => removeItem(b, item.i));
      return;
    }
    setLayout((l) => {
      const from = l.boards[boardId], to = l.boards[toId];
      if (!from || !to) return l;
      return { ...l, boards: { ...l.boards, [boardId]: removeItem(from, item.i), [toId]: addItem(to, item.t, { o: item.o, w: Math.min(item.w, to.cols), h: item.h, i: item.i }) } };
    });
    const target = ctx.ctrl().api()?.getPanel(boardPanelId(toId));
    target?.api.setActive();
  };
  const extract = (item) => {
    ctx.ctrl().newBoard({ panel: panelId, direction: "right" }, { title: itemLabel(item, ctx), items: [{ ...item, x: 0, y: 0, w: Math.min(item.w, 12) }] });
    setBoard((b) => removeItem(b, item.i));
  };
  const onDrop = (gridNow, dropped) => {
    setOver(false);
    const d = dragState.cur;
    endDrag();
    if (!d || !dropped) return;
    const x = dropped.x, y = dropped.y;
    if (d.item) {
      // panolar arası taşıma (ya da aynı panoda yer değiştirme)
      setLayout((l) => {
        const from = l.boards[d.from], to = l.boards[boardId];
        if (!to) return l;
        const boardsNext = { ...l.boards };
        if (from && d.from !== boardId) boardsNext[d.from] = removeItem(from, d.item.i);
        const base = d.from === boardId ? removeItem(to, d.item.i) : to;
        boardsNext[boardId] = addItem(base, d.item.t, { o: d.item.o, w: Math.min(d.item.w, to.cols), h: d.item.h, x, y, i: d.item.i });
        return { ...l, boards: boardsNext };
      });
      return;
    }
    if (d.t) {
      setLayout((l) => {
        const to = l.boards[boardId];
        if (!to) return l;
        const next = { ...l, boards: { ...l.boards, [boardId]: addItem(to, d.t, { o: d.o || null, x, y, ...(d.w ? { w: d.w, h: d.h } : {}) }) } };
        return d.removedId ? dropRemoved(next, "item", d.removedId) : next;
      });
    }
  };
  const dropSize = () => {
    const d = dragState.cur;
    const m = componentOf(d?.item?.t || d?.t);
    if (!m) return false;
    return { w: Math.min(board.cols, d.item?.w || d.w || m.size[0]), h: d.item?.h || d.h || m.size[1] };
  };
  const popItem = pop ? board.items.find((x) => x.i === pop.i) : null;
  const popper = popItem ? ctx.widgetPopover?.(popItem, { onClose: () => setPop(null), setWide: (v) => setPop((p) => (p ? { ...p, wide: v } : p)), styleOnly: Boolean(pop.style) }) : null;
  const colsMenu = [1, 2, 3, 4, 6, 8, 12, 16, 24].map((n) => ({ label: `${n} sütun${n === board.cols ? " ✓" : ""}`, icon: "grid", onClick: () => setBoard((b) => setBoardCols(b, n)) }));

  return (
    <div ref={hostRef} className={`lw-board ${edit ? "is-edit" : ""} ${over ? "is-over" : ""} ${boardId === "rail" ? "is-rail" : ""}`} data-board={boardId} style={{ "--lw-cols": board.cols }}
      onDragEnter={() => { if (edit && dragState.cur) setOver(true); }} onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOver(false); }}>
      {edit && (
        <div className="lw-board__bar">
          <button type="button" className="btn btn--xs" onClick={() => ctx.openCatalog({ board: boardId })}><Icon name="plus" size={11} /> Bileşen ekle</button>
          <MenuButton items={colsMenu} text={`${board.cols} sütun`} label="Pano sütun sayısı" className="lw-board__cols" />
        </div>
      )}
      {!board.items.length && (
        <div className="lw-empty is-board">
          <Icon name="grid" size={20} />
          <p>{edit ? "Boş pano: “Bileşen ekle” ya da katalogdan buraya sürükle." : "Boş pano. Üstteki “Düzenle” ile bileşen ekle."}</p>
          {!edit && <button type="button" className="btn btn--sm" onClick={() => { ctx.setEdit?.(true); ctx.openCatalog({ board: boardId }); }}><Icon name="plus" size={13} /> Bileşen ekle</button>}
        </div>
      )}
      <Grid
        className="lw-grid"
        layout={grid}
        cols={board.cols}
        rowHeight={board.rowH || 40}
        margin={[6, 6]}
        containerPadding={[6, 6]}
        compactType="vertical"
        isDraggable={edit}
        isResizable={edit}
        isDroppable={edit}
        resizeHandles={["se", "e", "s"]}
        draggableCancel=".lw-item__menu, .lw-item__x, .lw-xdrag, input, select, button"
        onDragStop={commit}
        onResizeStop={commit}
        onDrop={onDrop}
        onDropDragOver={dropSize}
        droppingItem={{ i: "__drop__", w: 2, h: 2 }}
        transformScale={ctx.zoom || 1}
        useCSSTransforms
      >
        {board.items.map((it) => (
          <div key={it.i} className="lw-cell">
            <BoardItem item={it} boardId={boardId} boards={boards} edit={edit} ctx={ctx} pop={pop} setPop={setPop}
              onRemove={remove} onResize={(i, w, h) => setBoard((b) => resizeItem(b, i, w, h))} onMoveTo={moveTo} onExtract={extract} />
          </div>
        ))}
      </Grid>
      {popItem && popper && (
        <FloatPop anchor={pop.anchor} title={popper.title} wide={pop.wide} zoom={ctx.zoom} onClose={() => setPop(null)}>{popper.body}</FloatPop>
      )}
    </div>
  );
}
export { normalizeItem };
