// Yayın Stüdyosu · ÇOKLU GÖRÜNÜM (OBS "multiview").
//
// Kutular SAHNELERDİR (ve "Önizlemede göster" ile seçilen kaynaklar): tıkla →
// ÖNİZLEME (yeşil), çift tıkla → doğrudan PROGRAM (kırmızı). Numara = 1–9 kısayolu.
// Hangi sahne / kaynakların görüneceği şeridin sağındaki menüden seçilir
// ("sadece istediğim kaynakları önizlemede görüntüleyebileyim").
//
// Küçük resimler TEK zamanlayıcıyla (saniyede ~6 kare) doğrudan tuvallere
// çizilir; görünmeyen kutu ve gizli pencere atlanır. React durumu kare başına
// değişmez — program tuvalinin kare hızını bozmaz.
import React, { memo, useCallback, useEffect, useRef, useState } from "react";
import { Icon, MenuButton } from "../../components/ui";
import { isShownInMultiview, resolveScene, sourceKindIcon, sourceSceneId } from "../../lib/studio/scenes";
import { drawScene } from "./draw";
import { BAD, STATUS_TEXT } from "./SourcesPanel";

const TILE_W = 256;
const TILE_H = 144;
const TILE_MS = 166;

/** Tüm kutu tuvallerini çizen tek zamanlayıcı. register(id, canvas | null). */
export function useTileRenderer(configRef, runtimeRef, { ms = TILE_MS } = {}) {
  const canvases = useRef(new Map()); // canvas → id
  useEffect(() => {
    const draw = () => {
      if (document.hidden) return;
      const cfg = configRef.current;
      if (!cfg) return;
      const now = performance.now();
      for (const [c, id] of canvases.current) {
        if (!c.isConnected || c.offsetParent === null) continue;
        const ctx = c.getContext("2d", { alpha: false });
        drawScene(ctx, resolveScene(cfg, id), cfg.sources, runtimeRef.current, c.width, c.height, { placeholders: true, now });
      }
    };
    draw();
    const t = setInterval(draw, ms);
    return () => clearInterval(t);
  }, [configRef, runtimeRef, ms]);
  return useCallback((id, canvas, prev) => {
    if (prev && prev !== canvas) canvases.current.delete(prev);
    if (canvas) canvases.current.set(canvas, id);
  }, []);
}

/** Tek kutu (şerit ve ızgara ortak). */
export const Tile = memo(function Tile({ tile, register, onAir, inPreview, bad, studioMode, onPreview, onProgram, menu, large = false }) {
  const ref = useRef(null);
  const setRef = useCallback((el) => {
    register(tile.id, el, ref.current);
    ref.current = el;
  }, [register, tile.id]);
  useEffect(() => () => { if (ref.current) register(tile.id, null, ref.current); }, [register, tile.id]);
  return (
    <div className={`st-tile ${large ? "is-large" : ""} ${onAir ? "is-program" : ""} ${inPreview ? "is-preview" : ""} ${tile.kind === "source" ? "is-source" : ""} ${bad ? "is-bad" : ""}`}>
      <button type="button" className="st-tile__hit" onClick={() => onPreview(tile.id)} onDoubleClick={() => onProgram(tile.id)}
        title={studioMode ? "Tık: önizlemeye al · Çift tık: yayına ver" : "Tık: yayına ver"}>
        <canvas ref={setRef} width={large ? TILE_W * 2 : TILE_W} height={large ? TILE_H * 2 : TILE_H} />
        {onAir && <span className="st-tile__badge is-live">YAYINDA</span>}
        {inPreview && <span className="st-tile__badge">ÖNİZLEME</span>}
        {bad && <span className="st-tile__warn">{bad}</span>}
      </button>
      <div className="st-tile__bar">
        {tile.hotkey && <b className="st-tile__no">{tile.hotkey}</b>}
        <Icon name={tile.kind === "source" ? sourceKindIcon(tile.sourceKind) : "layers"} size={12} />
        <span className="st-tile__name" title={tile.name}>{tile.name}</span>
        {tile.kind === "source" && <span className="st-tile__kind">KAYNAK</span>}
        {menu && <MenuButton label="Kutu" size={13} items={menu} />}
      </div>
    </div>
  );
});

/** "Önizlemede göster": hangi sahne ve kaynaklar kutu olarak görünsün. */
function ShowPicker({ config, onToggle, onReset }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [open]);
  const custom = Boolean(config.multiview?.show);
  return (
    <div className="st-showpick" ref={ref}>
      <button type="button" className={`st-mv__tool ${custom ? "is-on" : ""}`} onClick={() => setOpen((v) => !v)} title="Önizlemede göster: şeritte hangi sahne / kaynaklar görünsün" aria-expanded={open}>
        <Icon name="filter" size={13} /><span>Göster</span>
      </button>
      {open && (
        <div className="st-showpick__pop" role="dialog" aria-label="Önizlemede göster">
          <header><strong>Önizlemede göster</strong>{custom && <button type="button" className="btn btn--xs btn--ghost" onClick={onReset}>Tüm sahneler</button>}</header>
          <h5>Sahneler</h5>
          {(config.scenes || []).map((sc) => (
            <label key={sc.id} className="toggle"><input type="checkbox" checked={isShownInMultiview(config, sc.id)} onChange={() => onToggle(sc.id)} /> {sc.name}</label>
          ))}
          <h5>Kaynaklar (tek başına)</h5>
          {(config.sources || []).map((s) => (
            <label key={s.id} className="toggle"><input type="checkbox" checked={isShownInMultiview(config, sourceSceneId(s.id))} onChange={() => onToggle(sourceSceneId(s.id))} /> <Icon name={sourceKindIcon(s.kind)} size={11} /> {s.name}</label>
          ))}
        </div>
      )}
    </div>
  );
}

/** Kutunun uyarı metni (kaynak kutusunda ya da sahnedeki bozuk kaynakta). */
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

function Multiview({ tiles = [], config, runtimeRef, register, previewId, programId, studioMode, version, onPreview, onProgram, onAddScene, onAddSource, onToggleShow, onResetShow, tileMenu }) {
  void version;
  return (
    <section className="st-mv" aria-label="Sahneler">
      <div className="st-mv__scroll">
        {(tiles || []).map((t) => (
          <Tile key={t.id} tile={t} register={register} studioMode={studioMode}
            onAir={t.id === programId} inPreview={studioMode && t.id === previewId && t.id !== programId}
            bad={tileWarning(config, runtimeRef.current, t)} onPreview={onPreview} onProgram={onProgram} menu={tileMenu(t)} />
        ))}
        {!(tiles || []).length && <p className="st-hint st-pad">Şeritte gösterilecek sahne seçilmedi — sağdaki “Göster” menüsünden seç.</p>}
      </div>
      <div className="st-mv__tools">
        <ShowPicker config={config} onToggle={onToggleShow} onReset={onResetShow} />
        <button type="button" className="st-mv__tool" onClick={onAddScene} title="Yeni boş sahne"><Icon name="plus" size={13} /><span>Sahne</span></button>
        <button type="button" className="st-mv__tool" onClick={onAddSource} title="Kamera, ekran, pencere, görsel, video, metin, saat …"><Icon name="video" size={13} /><span>Kaynak</span></button>
      </div>
    </section>
  );
}

export default memo(Multiview);
