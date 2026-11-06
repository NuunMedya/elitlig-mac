// Yayın Stüdyosu · SAHNE ALANI IZGARASI (lib/studio/stageGrid.js) — monitörler ve
// araç kutuları hücre ızgarasında. Düzenleme kipinde (üst çubuktaki "Düzen ▾ ›
// Kutuları düzenle"): kutuyu başlığından sürükle → taşı; sağ alt köşe / kenarlar →
// boyutla (G×Y hücre); başlıktaki boy menüsü 1×1 … 5×5 ve dikdörtgenler; × kaldır.
// Çakışan kutu en yakın boş yere kayar; yer yoksa işlem geri alınır (kırmızı gölge).
// Kutunun içeriğini Studio verir: render(tile) — monitörler aynı tuvalleri kullanır.
import React, { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Icon, MenuButton } from "../../../components/ui";
import {
  STAGE_COLS, STAGE_PRESETS, STAGE_ROWS, STAGE_SIZES, addStageTile, addableTiles, compactTiles, placeTile, presetTiles, removeStageTile, stageTileOf,
} from "../../../lib/studio/stageGrid";
import "./stage.css";

const sizeText = (w, h) => `${w}×${h}`;

/** Düzenin küçük çizimi (hazır düzen seçicisi). */
export function StagePic({ tiles, className = "" }) {
  return (
    <span className={`stg-pic ${className}`} aria-hidden="true">
      {tiles.map((t) => (
        <i key={t.id} className={`is-${t.type}`} style={{ left: `${(t.x / STAGE_COLS) * 100}%`, top: `${(t.y / STAGE_ROWS) * 100}%`, width: `${(t.w / STAGE_COLS) * 100}%`, height: `${(t.h / STAGE_ROWS) * 100}%` }} />
      ))}
    </span>
  );
}

/** Üst çubukta "Düzen ▾": hazır düzenler (tek tık) + kutuları düzenle. */
export function StagePresetPicker({ stage, onPreset, edit, onEdit }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const down = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const key = (e) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); } };
    window.addEventListener("mousedown", down, true);
    window.addEventListener("keydown", key, true);
    return () => { window.removeEventListener("mousedown", down, true); window.removeEventListener("keydown", key, true); };
  }, [open]);
  const cur = STAGE_PRESETS.find((p) => p.key === stage.preset);
  return (
    <div className="stg-picker" ref={ref}>
      <button type="button" className={`stg-picker__btn ${open ? "is-open" : ""} ${edit ? "is-edit" : ""}`} onClick={() => setOpen((v) => !v)} title="Ekran düzeni: hazır düzenler ve kutuları düzenleme" aria-expanded={open}>
        <StagePic tiles={stage.tiles} />
        <span className="stg-picker__name">{stage.custom ? "Özel düzen" : cur?.label || "Düzen"}</span>
        <Icon name="chevronDown" size={12} />
      </button>
      {open && (
        <div className="stg-picker__pop" role="dialog" aria-label="Ekran düzeni">
          <header><strong>Ekran düzeni</strong><span>tek tıkla uygula · sonra istersen kutuları taşı</span></header>
          <div className="stg-picker__grid">
            {STAGE_PRESETS.map((p) => (
              <button key={p.key} type="button" className={`stg-preset ${stage.preset === p.key && !stage.custom ? "is-on" : ""}`} onClick={() => { onPreset(p.key); setOpen(false); }} title={p.hint}>
                <StagePic tiles={p.tiles} className="is-lg" />
                <b>{p.label}</b>
                <small>{p.hint}</small>
              </button>
            ))}
          </div>
          <footer>
            <button type="button" className={`btn btn--sm ${edit ? "btn--primary" : ""}`} onClick={() => { onEdit(!edit); setOpen(false); }}>
              <Icon name={edit ? "check" : "grid"} size={13} /> {edit ? "Düzenlemeyi bitir" : "Kutuları düzenle (taşı, boyutla, ekle)"}
            </button>
          </footer>
        </div>
      )}
    </div>
  );
}

/** Düzenleme kipindeki kutu kaplaması: başlık (sürükle), boy menüsü, kaldır, boyut tutamakları. */
function EditFrame({ tile, onStart, onSize, onRemove, extra }) {
  const def = stageTileOf(tile.type);
  const sizes = STAGE_SIZES.filter(([w, h]) => w >= def.min[0] && h >= def.min[1]);
  return (
    <div className="stg-edit" onPointerDown={(e) => { if (!e.target.closest("button, select, .menu, input")) onStart(e, "move"); }}>
      <div className="stg-edit__head">
        <Icon name="grip" size={13} />
        <Icon name={def.icon} size={12} />
        <b>{def.label}</b>
        <span className="stg-edit__size">{sizeText(tile.w, tile.h)}</span>
        {extra}
        <span className="st-top__spacer" />
        <MenuButton label="Boyut" icon="grid" size={12} items={sizes.map(([w, h]) => ({ label: `${sizeText(w, h)}${w === h ? "" : " (dikdörtgen)"}`, onClick: () => onSize(w, h) }))} />
        <button type="button" className="stg-edit__x" onClick={onRemove} title="Kutuyu kaldır" aria-label="Kutuyu kaldır"><Icon name="x" size={12} /></button>
      </div>
      <p className="stg-edit__hint">{def.hint}</p>
      <span className="stg-edit__h is-e" onPointerDown={(e) => onStart(e, "e")} />
      <span className="stg-edit__h is-s" onPointerDown={(e) => onStart(e, "s")} />
      <span className="stg-edit__h is-se" onPointerDown={(e) => onStart(e, "se")} title="Boyutla"><Icon name="arrows" size={11} /></span>
    </div>
  );
}

function StageGrid({ stage, onChange, edit, onEdit, render, editExtra }) {
  const ref = useRef(null);
  const [drag, setDrag] = useState(null); // { id, mode, sx, sy, cw, ch, orig, rect, ok }
  const dragRef = useRef(null);
  dragRef.current = drag;
  const tiles = stage.tiles;
  const setTiles = useCallback((next, custom = true) => { if (next) onChange({ ...stage, tiles: next, custom }); }, [onChange, stage]);

  const start = (tile) => (e, mode) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const r = ref.current.getBoundingClientRect();
    const cs = getComputedStyle(ref.current);
    const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    // Ölçek (zoom) farkı: oranlar aynı uzayda kalır.
    const sx = r.width / (ref.current.offsetWidth || r.width);
    const cw = ((ref.current.clientWidth - padX) * sx) / STAGE_COLS;
    const ch = ((ref.current.clientHeight - padY) * sx) / STAGE_ROWS;
    setDrag({ id: tile.id, mode, sx: e.clientX, sy: e.clientY, cw, ch, orig: tile, rect: { x: tile.x, y: tile.y, w: tile.w, h: tile.h }, ok: true });
  };

  const dragging = Boolean(drag);
  useEffect(() => {
    if (!dragging) return undefined;
    const move = (e) => {
      setDrag((d) => {
        if (!d) return d;
        const dx = Math.round((e.clientX - d.sx) / d.cw);
        const dy = Math.round((e.clientY - d.sy) / d.ch);
        const o = d.orig;
        const def = stageTileOf(o.type);
        let rect;
        if (d.mode === "move") rect = { x: Math.max(0, Math.min(STAGE_COLS - o.w, o.x + dx)), y: Math.max(0, Math.min(STAGE_ROWS - o.h, o.y + dy)), w: o.w, h: o.h };
        else {
          const w = d.mode === "s" ? o.w : Math.max(def.min[0], Math.min(STAGE_COLS - o.x, o.w + dx));
          const h = d.mode === "e" ? o.h : Math.max(def.min[1], Math.min(STAGE_ROWS - o.y, o.h + dy));
          rect = { x: o.x, y: o.y, w, h };
        }
        if (rect.x === d.rect.x && rect.y === d.rect.y && rect.w === d.rect.w && rect.h === d.rect.h) return d;
        return { ...d, rect, ok: Boolean(placeTile(tiles, d.id, rect)) };
      });
    };
    const up = () => {
      const d = dragRef.current;
      setDrag(null);
      if (!d) return;
      const same = d.rect.x === d.orig.x && d.rect.y === d.orig.y && d.rect.w === d.orig.w && d.rect.h === d.orig.h;
      const next = same ? null : placeTile(tiles, d.id, d.rect);
      if (next) setTiles(next);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", up); };
  }, [dragging, setTiles, tiles]);

  // Esc: düzenlemeyi bitir.
  useEffect(() => {
    if (!edit) return undefined;
    const key = (e) => { if (e.key === "Escape" && !document.querySelector(".menu__list, .modal-backdrop")) { e.stopPropagation(); onEdit(false); } };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [edit, onEdit]);

  const [msg, setMsg] = useState(null);
  useLayoutEffect(() => { if (!msg) return undefined; const t = setTimeout(() => setMsg(null), 2600); return () => clearTimeout(t); }, [msg]);
  const add = (type) => { const next = addStageTile(tiles, type); if (next) setTiles(next); else setMsg("Boş yer yok: önce bir kutuyu küçült ya da kaldır."); };
  const resizeTo = (tile, w, h) => { const next = placeTile(tiles, tile.id, { x: Math.min(tile.x, STAGE_COLS - w), y: Math.min(tile.y, STAGE_ROWS - h), w, h }); if (next) setTiles(next); else setMsg(`${sizeText(w, h)} sığmıyor: başka kutuları küçült ya da kaldır.`); };

  return (
    <main ref={ref} className={`st-stage stg ${edit ? "is-edit" : ""} ${drag ? "is-dragging" : ""}`} style={{ "--stg-cols": STAGE_COLS, "--stg-rows": STAGE_ROWS }}>
      {tiles.map((t) => (
        <section key={t.id} className={`stg-tile is-${t.type} ${drag?.id === t.id ? "is-src" : ""}`} data-size={sizeText(t.w, t.h)}
          style={{ gridColumn: `${t.x + 1} / span ${t.w}`, gridRow: `${t.y + 1} / span ${t.h}` }}>
          {render(t)}
          {edit && <EditFrame tile={t} onStart={start(t)} onSize={(w, h) => resizeTo(t, w, h)} onRemove={() => setTiles(removeStageTile(tiles, t.id))} extra={editExtra?.(t)} />}
        </section>
      ))}
      {drag && (
        <div className={`stg-ghost ${drag.ok ? "" : "is-bad"}`} style={{ gridColumn: `${drag.rect.x + 1} / span ${drag.rect.w}`, gridRow: `${drag.rect.y + 1} / span ${drag.rect.h}` }}>
          <b>{sizeText(drag.rect.w, drag.rect.h)}</b>
        </div>
      )}
      {edit && (
        <div className="stg-bar" role="toolbar" aria-label="Ekran düzeni">
          <Icon name="grid" size={14} />
          <strong>Kutuları düzenle</strong>
          <MenuButton label="Kutu ekle" icon="plus" text="Kutu ekle" size={12} align="start" items={addableTiles(tiles).map((d) => ({ label: d.label, icon: d.icon, hint: d.hint, onClick: () => add(d.type) }))} />
          <button type="button" className="btn btn--sm" onClick={() => setTiles(compactTiles(tiles))} title="Boşlukları kapat: kutular yukarı ve sola kayar"><Icon name="arrows" size={12} /> Sıkıştır</button>
          <MenuButton label="Hazır düzen" icon="overview" text="Hazır düzen" size={12} align="start" items={STAGE_PRESETS.map((p) => ({ label: p.label, hint: p.hint, onClick: () => onChange({ ...stage, preset: p.key, custom: false, tiles: presetTiles(p.key) }) }))} />
          {msg && <span className="stg-bar__msg" role="status">{msg}</span>}
          <span className="st-top__spacer" />
          <span className="stg-bar__hint">başlıktan sürükle: taşı · köşe: boyutla · Esc: bitir</span>
          <button type="button" className="btn btn--sm btn--primary" onClick={() => onEdit(false)}><Icon name="check" size={12} /> Bitti</button>
        </div>
      )}
    </main>
  );
}

export default memo(StageGrid);
