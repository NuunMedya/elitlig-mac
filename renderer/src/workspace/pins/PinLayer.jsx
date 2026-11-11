// Sabit katman: kullanıcının tanımladığı düğme ve bileşenler — hangi sekme / bölme açık olursa
// olsun pencerede aynı yerde durur. Kenar çubukları (üst / alt / sol / sağ) çalışma alanından yer
// ayırır; yüzen kutular serbestçe taşınır, boyutlanır, saydamlaşır, daraltılır.
//
// Bileşenler Bugün panosunun kütüphanesinden gelir (./todayApi → views/today/*): aynı Tile,
// aynı ayarlar penceresi, aynı kütüphane paneli. Gömülü tarayıcı görünümü her zaman DOM'un üstüne
// çizdiğinden yüzen kutu tarayıcının üstüne gelirse gizlenir (kenar çubukları hiç çakışmaz).
import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon, useResult, useToast } from "../../components/ui";
import { PaneCtx, OwnerScope } from "../gate";
import { loadPins, savePins } from "../store";
import { EDGES, EDGE_LABELS, PAD, addPin, dockThickness, duplicatePin, findPin, hasPins, hiddenUnderNative, movePin, patchPin, placeFloat, pxH, pxW, removePin, UNIT_W, UNIT_H, GAP } from "./pinModel";
import { Library, TileSettings, Tile, defaultOptions, isAllowed, libDrag, metaOf, sizeForTier } from "./todayApi";
import "../../views/today/today.css";

const PIN_CTX = { tabId: "pins", paneId: null };
const TARGETS = ["top", "bottom", "left", "right", "float"];

function useViewport() {
  const [v, setV] = useState({ width: window.innerWidth, height: window.innerHeight });
  useEffect(() => {
    const on = () => setV({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return v;
}

/** Kademe → kutu boyutu (sabit katmanda en çok 8 × 8). Kenar çubuğuna eklenen bileşen varsayılan olarak düğmedir. */
function sizeFor(meta, tier, where) {
  const t = tier || (where !== "float" && meta.tiers.includes("xs") ? "xs" : null);
  const [w, h] = t ? sizeForTier(meta, t) : meta.size;
  return [Math.min(8, w), Math.min(where === "top" || where === "bottom" ? 4 : 8, h)];
}

export default function PinLayer({ auth, go, uid, edit, setEdit, hidden, nativeRects, currentRoute, routeLabel, children }) {
  const toast = useToast();
  const result = useResult();
  const view = useViewport();
  const known = useCallback((t) => Boolean(metaOf(t)), []);
  const [pins, setPins] = useState(() => loadPins(uid, known));
  const [target, setTarget] = useState("top");
  const [lib, setLib] = useState(false);
  const [settingsId, setSettingsId] = useState(null);
  const [drag, setDrag] = useState(null); // { i, x, y, dx, dy, over }
  const access = auth?.access || {};
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return undefined; }
    const t = setTimeout(() => savePins(uid, pins), 200);
    return () => clearTimeout(t);
  }, [pins, uid]);
  useEffect(() => { if (!edit) { setLib(false); } }, [edit]);
  useEffect(() => {
    if (!edit) return undefined;
    const onKey = (e) => { if (e.key === "Escape" && !document.querySelector(".modal-backdrop, .menu__list, .dt-lib")) setEdit(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [edit, setEdit]);

  const ctx = useMemo(() => ({ go, auth, result, toast }), [go, auth, result, toast]);
  const add = (t, tier = null, where = target, pos = null) => {
    const meta = metaOf(t);
    if (!meta) return;
    const [w, h] = sizeFor(meta, tier, where);
    let id = null;
    setPins((s) => { const r = addPin(s, { t, w, h, o: defaultOptions(meta) }, where, pos || { x: Math.round(view.width / 2 - pxW(w) / 2), y: Math.round(view.height / 3) }); id = r.id; return r.state; });
    toast(`${meta.label} sabitlendi (${EDGE_LABELS[where]}).`, { tone: "success", timeout: 2500 });
    return id;
  };
  const pinRoute = () => {
    if (!currentRoute) return;
    setPins((s) => addPin(s, { t: "route", w: 1, h: 1, o: { route: currentRoute } }, target === "float" ? "top" : target).state);
    toast(`${routeLabel || currentRoute} düğmesi sabitlendi.`, { tone: "success", timeout: 2500 });
  };
  const handlers = {
    onPatch: (i, patch) => setPins((s) => patchPin(s, i, patch)),
    onRemove: (i) => { const prev = pins; setPins((s) => removePin(s, i)); toast("Sabit öğe kaldırıldı.", { tone: "info", timeout: 6000, action: { label: "Geri al", run: () => setPins(prev) } }); },
    onDuplicate: (i) => setPins((s) => duplicatePin(s, i)),
    onResize: (i, w, h) => setPins((s) => patchPin(s, i, { w, h })),
    onTier: (i, tier) => setPins((s) => { const at = findPin(s, i); if (!at) return s; const [w, h] = sizeFor(metaOf(at.item.t), tier, at.where); return patchPin(s, i, { w, h }); }),
    onSettings: (i) => setSettingsId(i),
  };

  /* ───────────── sürükleme (düzenleme kipinde; yüzen kutular her zaman tutamaçtan) ───────────── */
  const overDock = (x, y) => {
    const el = document.elementFromPoint(x, y)?.closest?.("[data-ws-dock]");
    if (!el) return null;
    const edge = el.getAttribute("data-ws-dock");
    const horiz = edge === "top" || edge === "bottom";
    const kids = [...el.querySelectorAll(":scope > [data-pin]")];
    let index = kids.length;
    for (let k = 0; k < kids.length; k++) { const r = kids[k].getBoundingClientRect(); if ((horiz ? x < r.left + r.width / 2 : y < r.top + r.height / 2)) { index = k; break; } }
    return { edge, index };
  };
  const startDrag = (e, i, { onlyFloat = false } = {}) => {
    if (e.button !== 0) return;
    if (!onlyFloat && e.target.closest("button, input, select, textarea, a, .menu, .ws-pin__rz, .dt-tile__tiers")) return;
    const at = findPin(pins, i);
    if (!at) return;
    const r = e.currentTarget.closest("[data-pin]").getBoundingClientRect();
    const dx = e.clientX - r.left, dy = e.clientY - r.top;
    const sx = e.clientX, sy = e.clientY;
    let started = false;
    e.preventDefault();
    const move = (ev) => {
      if (!started && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 5) return;
      started = true;
      setDrag({ i, x: ev.clientX, y: ev.clientY, dx, dy, w: r.width, h: r.height, over: onlyFloat ? null : overDock(ev.clientX, ev.clientY) });
    };
    const up = (ev) => {
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", up, true);
      setDrag(null);
      if (!started) return;
      const over = onlyFloat ? null : overDock(ev.clientX, ev.clientY);
      if (over) setPins((s) => movePin(s, i, over.edge, { index: over.index }));
      else setPins((s) => {
        const moved = at.where === "float" ? patchPin(s, i, { x: ev.clientX - dx, y: ev.clientY - dy }) : movePin(s, i, "float", { x: ev.clientX - dx, y: ev.clientY - dy });
        return { ...moved, floats: moved.floats.map((f) => (f.i === i ? placeFloat(f, view, { snap: !ev.altKey }) : f)) };
      });
    };
    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerup", up, true);
  };
  const startResize = (e, i) => {
    e.preventDefault(); e.stopPropagation();
    const at = findPin(pins, i);
    if (!at) return;
    const sx = e.clientX, sy = e.clientY, w0 = at.item.w, h0 = at.item.h;
    const move = (ev) => setPins((s) => patchPin(s, i, { w: w0 + Math.round((ev.clientX - sx) / (UNIT_W + GAP)), h: h0 + Math.round((ev.clientY - sy) / (UNIT_H + GAP)) }));
    const up = () => { window.removeEventListener("pointermove", move, true); window.removeEventListener("pointerup", up, true); };
    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerup", up, true);
  };
  // Kütüphaneden sürükle-bırak (HTML5): kenar çubuğuna ya da serbest alana.
  const onDragOver = (e) => { if (libDrag.cur?.t) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; } };
  const onDrop = (e) => {
    const t = libDrag.cur?.t;
    libDrag.cur = null;
    if (!t) return;
    e.preventDefault();
    const over = overDock(e.clientX, e.clientY);
    if (over) add(t, null, over.edge);
    else add(t, null, "float", { x: e.clientX - 40, y: e.clientY - 20 });
  };

  const show = (it) => { const m = metaOf(it.t); return m && isAllowed(m, access); };
  const hiddenIds = useMemo(() => (edit ? new Set() : hiddenUnderNative(pins.floats, nativeRects || [], view)), [pins.floats, nativeRects, view, edit]);

  const renderPin = (it, where) => {
    const meta = metaOf(it.t);
    const isFloat = where === "float";
    const box = { width: pxW(it.w), height: pxH(it.h) };
    if (isFloat && it.collapsed && !edit) {
      const p = placeFloat(it, view, { snap: false });
      return (
        <button key={it.i} type="button" className="ws-pin is-float is-collapsed" data-pin={it.i} style={{ left: p.x, top: p.y, opacity: it.opacity }}
          onClick={() => handlers.onPatch(it.i, { collapsed: false })} onPointerDown={(e) => startDrag(e, it.i, { onlyFloat: true })} title={`${it.title || meta.label}: aç`}>
          <Icon name={meta.icon} size={13} /> <span>{it.title || meta.label}</span>
        </button>
      );
    }
    const style = isFloat ? { ...box, ...(() => { const p = placeFloat(it, view, { snap: false }); return { left: p.x, top: p.y }; })(), opacity: it.opacity ?? 1 } : box;
    if (isFloat && hiddenIds.has(it.i)) return null;
    return (
      <div key={it.i} className={`ws-pin${isFloat ? " is-float" : ""}${edit ? " is-edit" : ""}${drag?.i === it.i ? " is-dragging" : ""}`} data-pin={it.i} style={style}
        onPointerDown={edit ? (e) => startDrag(e, it.i) : undefined}>
        <Tile item={it} meta={meta} edit={edit} ctx={ctx} eager {...handlers} />
        {isFloat && !edit && (
          <div className="ws-pin__float">
            <span className="ws-pin__grip" onPointerDown={(e) => startDrag(e, it.i, { onlyFloat: true })} title="Sürükle: taşı"><Icon name="grip" size={11} /></span>
            <button type="button" onClick={() => handlers.onPatch(it.i, { collapsed: true })} title="Daralt" aria-label="Daralt"><Icon name="chevronUp" size={11} /></button>
          </div>
        )}
        {isFloat && edit && (
          <div className="ws-pin__opts" onPointerDown={(e) => e.stopPropagation()}>
            <label title="Saydamlık"><Icon name="eye" size={11} /><input type="range" min="0.25" max="1" step="0.05" value={it.opacity ?? 1} onChange={(e) => handlers.onPatch(it.i, { opacity: Number(e.target.value) })} aria-label="Saydamlık" /></label>
            <button type="button" onClick={() => handlers.onPatch(it.i, { collapsed: !it.collapsed })} title={it.collapsed ? "Açık başlasın" : "Daraltılmış başlasın"} aria-pressed={Boolean(it.collapsed)}><Icon name={it.collapsed ? "chevronDown" : "chevronUp"} size={11} /></button>
          </div>
        )}
        {edit && <span className="ws-pin__rz" onPointerDown={(e) => startResize(e, it.i)} title="Boyutla" />}
      </div>
    );
  };

  const docks = {};
  for (const e of EDGES) {
    const items = pins.docks[e].filter(show);
    const thick = hidden ? 0 : items.length ? dockThickness(items, e) : edit ? 34 : 0;
    docks[e] = { items, thick };
  }
  const dock = (e) => {
    const { items, thick } = docks[e];
    if (!thick) return null;
    return (
      <div key={`dock-${e}`} className={`ws-dock is-${e}${edit ? " is-edit" : ""}${drag?.over?.edge === e ? " is-over" : ""}`} data-ws-dock={e} style={{ gridArea: e, padding: PAD }}
        onDragOver={edit ? onDragOver : undefined} onDrop={edit ? onDrop : undefined} aria-label={EDGE_LABELS[e]}>
        <PaneCtx.Provider value={PIN_CTX}><OwnerScope owner="pins">{items.map((it) => renderPin(it, e))}</OwnerScope></PaneCtx.Provider>
        {edit && !items.length && <span className="ws-dock__hint">{EDGE_LABELS[e]}: buraya sürükleyin</span>}
      </div>
    );
  };

  const settingsItem = settingsId ? findPin(pins, settingsId)?.item : null;
  const hiddenCount = hasPins(pins) ? pins.floats.filter((f) => hiddenUnderNative([f], nativeRects || [], view).size).length : 0;

  return (
    <>
      <div className={`ws-pins-frame${edit ? " is-edit" : ""}`} style={{ gridTemplateRows: `${docks.top.thick}px minmax(0, 1fr) ${docks.bottom.thick}px`, gridTemplateColumns: `${docks.left.thick}px minmax(0, 1fr) ${docks.right.thick}px` }}>
        {dock("top")}
        {dock("left")}
        <div key="center" className="ws-pins-center" style={{ gridArea: "center" }}>
          {children}
          {edit && <div className="ws-pins-catch" onDragOver={onDragOver} onDrop={onDrop}><span>Düzenleme kipi · bileşenleri kenar çubuklarına ya da serbest alana sürükleyin</span></div>}
        </div>
        {dock("right")}
        {dock("bottom")}
      </div>
      {!hidden && (
        <PaneCtx.Provider value={PIN_CTX}>
          <Suspense fallback={null}>
            <OwnerScope owner="pins">
              <div className="ws-pin-floats">{pins.floats.filter(show).map((it) => renderPin(it, "float"))}</div>
            </OwnerScope>
          </Suspense>
        </PaneCtx.Provider>
      )}
      {drag && <div className={`ws-pin-ghost${drag.over ? " is-dock" : ""}`} style={{ left: drag.x - drag.dx, top: drag.y - drag.dy, width: drag.w, height: drag.h }} />}
      {edit && !hidden && (
        <div className="ws-pinbar" role="toolbar" aria-label="Sabit bileşenler" data-browser-cover data-admin-cover>
          <Icon name="pin" size={14} /><b>Sabit bileşenler</b>
          <span className="ws-pinbar__sep" />
          <span className="muted small">Ekleme yeri</span>
          <div className="ws-pinbar__targets" role="radiogroup" aria-label="Ekleme yeri">
            {TARGETS.map((t) => <button key={t} type="button" role="radio" aria-checked={target === t} className={target === t ? "is-on" : ""} onClick={() => setTarget(t)}>{EDGE_LABELS[t].replace(" çubuk", "")}</button>)}
          </div>
          <button type="button" className={`btn btn--sm${lib ? " is-on" : ""}`} onClick={() => setLib((v) => !v)} aria-pressed={lib}><Icon name="grid" size={13} /> Kütüphane</button>
          {currentRoute && <button type="button" className="btn btn--sm" onClick={pinRoute} title="Açık bölüme giden düğme"><Icon name="external" size={13} /> “{routeLabel}” düğmesi</button>}
          {hiddenCount > 0 && <span className="pill pill--amber" title="Gömülü tarayıcı her zaman en üstte çizer; bu kutular tarayıcı açıkken gizlenir">{hiddenCount} kutu tarayıcının altında kalıyor</span>}
          <button type="button" className="btn btn--sm btn--primary" onClick={() => setEdit(false)} data-testid="pins-done"><Icon name="check" size={13} /> Bitti</button>
        </div>
      )}
      {lib && edit && (
        <div data-browser-cover data-admin-cover>
          <Library onAdd={(t, tier) => add(t, tier)} onClose={() => setLib(false)} ctx={ctx} access={access} />
        </div>
      )}
      {settingsItem && <TileSettings item={settingsItem} meta={metaOf(settingsItem.t)} onClose={() => setSettingsId(null)} {...handlers} />}
    </>
  );
}
