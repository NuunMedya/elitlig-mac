// Yayın Stüdyosu · SAHNE ŞERİDİ ve sahne kutuları (OBS / vMix "multiview").
//
// Kutular YALNIZ SAHNELERDİR (kaynaklar Kaynaklar sekmesinde). Kutu:
//   tık → ÖNİZLEME (yeşil çerçeve), çift tık → doğrudan PROGRAM (kırmızı, YAYINDA).
//   Üstünde hızlı düğmeler: "Yayına al" ve "LED'e ver"; ⋯ menüsünde Düzenle, Çoğalt…
//   Numara = 1–9 kısayolu. LED'de görünen sahnede mavi "LED" rozeti.
//
// Küçük resimler TEK zamanlayıcıyla (saniyede ~6 kare) doğrudan tuvallere
// çizilir; görünmeyen kutu ve gizli pencere atlanır. React durumu kare başına
// değişmez — program tuvalinin kare hızını bozmaz.
import React, { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { canvasLoop, onScreen } from "./perf/renderLoad";
import { SECONDARY_FPS } from "../../lib/studio/renderBudget";
import { createPortal } from "react-dom";
import { Icon, MenuButton } from "../../components/ui";
import { resolveScene } from "../../lib/studio/scenes";
import { drawScene } from "./draw";
import { BAD, STATUS_TEXT } from "./SourcesPanel";

const TILE_W = 256;
const TILE_H = 144;
const TILE_MS = 1000 / SECONDARY_FPS.sceneThumb; // ~6 fps

/** Tüm kutu tuvallerini çizen tek zamanlayıcı. register(id, canvas | null). */
export function useTileRenderer(configRef, runtimeRef, { ms = TILE_MS } = {}) {
  const canvases = useRef(new Map()); // canvas → id
  useEffect(() => {
    const draw = () => {
      const cfg = configRef.current;
      if (!cfg) return;
      const now = performance.now();
      for (const [c, id] of canvases.current) {
        if (!c.isConnected || c.offsetParent === null || !onScreen(c)) continue;
        const ctx = c.getContext("2d", { alpha: false });
        // noFx: küçük resimde WebGL görüntü ayarı yapılmaz (yalnız çevirme).
        drawScene(ctx, resolveScene(cfg, id), cfg.sources, runtimeRef.current, c.width, c.height, { placeholders: true, now, noFx: true });
      }
    };
    return canvasLoop("Sahne kutuları (küçük resim)", { fps: 1000 / ms }, draw);
  }, [configRef, runtimeRef, ms]);
  return useCallback((id, canvas, prev) => {
    if (prev && prev !== canvas) canvases.current.delete(prev);
    if (canvas) canvases.current.set(canvas, id);
  }, []);
}

/** Kutunun uyarı metni (sahnedeki bozuk kaynak). */
export function tileWarning(config, runtime, tile) {
  const scene = config && runtime ? resolveScene(config, tile.id) : null;
  if (!scene) return null;
  for (const l of scene.layers) {
    if (!l.visible) continue;
    const rt = runtime.get(l.sourceId);
    if (rt && BAD.includes(rt.status)) return STATUS_TEXT[rt.status];
  }
  return null;
}

/**
 * Sağ tık menüsü (imleç konumunda; MenuButton ile aynı görünüm ve öğe biçimi).
 * items: [{ label, icon, onClick, danger, disabled } | "-"].
 */
export function ContextMenu({ at, items, onClose, label = "Menü" }) {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);
  useLayoutEffect(() => {
    const m = ref.current?.getBoundingClientRect();
    if (!m) return;
    const x = Math.max(4, Math.min(at.x, window.innerWidth - m.width - 4));
    const y = at.y + m.height > window.innerHeight - 4 ? Math.max(4, at.y - m.height) : at.y;
    setPos({ x, y });
  }, [at.x, at.y]);
  useEffect(() => {
    const down = (e) => { if (!ref.current?.contains(e.target)) onClose(); };
    const key = (e) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    window.addEventListener("mousedown", down, true);
    window.addEventListener("keydown", key, true);
    window.addEventListener("blur", onClose);
    window.addEventListener("resize", onClose);
    return () => { window.removeEventListener("mousedown", down, true); window.removeEventListener("keydown", key, true); window.removeEventListener("blur", onClose); window.removeEventListener("resize", onClose); };
  }, [onClose]);
  useEffect(() => { if (pos) ref.current?.querySelector("button:not(:disabled)")?.focus({ preventScroll: true }); }, [pos]);
  const list = (items || []).filter(Boolean);
  return createPortal(
    <div ref={ref} className="menu__list vfx-ctx" role="menu" aria-label={label} style={pos ? { top: pos.y, left: pos.x } : { top: at.y, left: at.x, visibility: "hidden" }}
      onContextMenu={(e) => e.preventDefault()}>
      {list.map((item, i) => (item === "-" ? <hr key={`hr${i}`} /> : (
        <button key={`${item.label}${i}`} type="button" role="menuitem" disabled={item.disabled} title={item.hint} className={item.danger ? "is-danger" : ""} onClick={() => { onClose(); item.onClick?.(); }}>
          {item.icon && <Icon name={item.icon} size={14} />}<span>{item.label}</span>
        </button>
      )))}
    </div>,
    document.body,
  );
}

/** Tek sahne kutusu (şerit, ızgara, dikey liste ortak). size: "strip" | "grid" | "row". Sağ tık: menü. */
export const Tile = memo(function Tile({ tile, register, onAir, inPreview, onLed = false, bad, studioMode, onPreview, onProgram, onToLed, onEdit, menu, size = "strip", large = false }) {
  const ref = useRef(null);
  const [ctx, setCtx] = useState(null);
  const closeCtx = useCallback(() => setCtx(null), []);
  const setRef = useCallback((el) => {
    register(tile.id, el, ref.current);
    ref.current = el;
  }, [register, tile.id]);
  useEffect(() => () => { if (ref.current) register(tile.id, null, ref.current); }, [register, tile.id]);
  const cls = `st-tile is-${size} ${onAir ? "is-program" : ""} ${inPreview ? "is-preview" : ""} ${bad ? "is-bad" : ""} ${onLed ? "is-led" : ""}`;
  return (
    <div className={cls} onContextMenu={menu ? (e) => { e.preventDefault(); e.stopPropagation(); setCtx({ x: e.clientX, y: e.clientY }); } : undefined}>
      {ctx && menu && <ContextMenu at={ctx} items={menu} onClose={closeCtx} label={`Sahne: ${tile.name}`} />}
      <button type="button" className="st-tile__hit" onClick={() => onPreview(tile.id)} onDoubleClick={() => onProgram(tile.id)}
        title={studioMode ? `${tile.name} — tık: önizlemeye al · çift tık: yayına al` : `${tile.name} — tık: yayına al`}>
        <canvas ref={setRef} width={large ? TILE_W * 2 : size === "row" ? 160 : TILE_W} height={large ? TILE_H * 2 : size === "row" ? 90 : TILE_H} />
        {tile.hotkey && <b className="st-tile__no">{tile.hotkey}</b>}
        <span className="st-tile__tally">
          {onAir && <span className="st-tile__badge is-live">YAYINDA</span>}
          {inPreview && <span className="st-tile__badge">ÖNİZLEME</span>}
          {onLed && <span className="st-tile__badge is-led">LED</span>}
        </span>
        {bad && <span className="st-tile__warn"><Icon name="alert" size={10} /> {bad}</span>}
      </button>
      <div className="st-tile__quick">
        {!onAir && <button type="button" className="st-tile__qbtn is-air" onClick={() => onProgram(tile.id)} title="Bu sahneyi hemen yayına al (geçişle)"><Icon name="play" size={10} /> Yayına al</button>}
        {onToLed && <button type="button" className={`st-tile__qbtn is-led ${onLed ? "is-on" : ""}`} onClick={() => onToLed(tile.id)} title={onLed ? "LED bu sahneyi gösteriyor — tık: LED yayını izlesin" : "Bu sahneyi LED ekrana ver"}><Icon name="overview" size={10} /> LED'e ver</button>}
      </div>
      <div className="st-tile__bar">
        <span className="st-tile__name" title={tile.name}>{tile.name}</span>
        {onEdit && <button type="button" className="st-tile__edit" onClick={() => onEdit(tile.id)} title="Sahneyi düzenle (katmanlar, konum, boyut)"><Icon name="pencil" size={11} /></button>}
        {menu && <MenuButton label="Sahne" size={13} items={menu} />}
      </div>
    </div>
  );
});

/** Altta sahne şeridi: yalnız sahneler + "Sahne ekle" kutusu. */
function Multiview({ tiles = [], config, runtimeRef, register, previewId, programId, ledId, studioMode, version, onPreview, onProgram, onToLed, onEdit, tileMenu, addMenu, compact = false }) {
  void version;
  return (
    <section className={`st-mv ${compact ? "is-compact" : ""}`} aria-label="Sahneler">
      <div className="st-mv__scroll">
        {tiles.map((t) => (
          <Tile key={t.id} tile={t} register={register} studioMode={studioMode}
            onAir={t.id === programId} inPreview={studioMode && t.id === previewId && t.id !== programId} onLed={t.id === ledId}
            bad={tileWarning(config, runtimeRef.current, t)} onPreview={onPreview} onProgram={onProgram} onToLed={onToLed} onEdit={onEdit} menu={tileMenu(t)} />
        ))}
        <div className="st-tile st-tile--add">
          <MenuButton label="Sahne ekle" icon="plus" text="Sahne ekle" size={14} align="start" items={addMenu} />
        </div>
      </div>
    </section>
  );
}

export default memo(Multiview);
