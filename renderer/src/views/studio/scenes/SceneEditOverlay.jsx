// Yayın Stüdyosu · ÖNİZLEME üzerinde katman düzenleyicisi (OBS seçim kutusu).
//
//   Tık          en üstteki katmanı seçer (kilitli de seçilir, taşınmaz)
//   Sürükle      taşır (kenar / merkez çizgilerine yapışır; Ctrl/⌘ yapışmayı kapatır)
//   Köşe/kenar   boyutlar (Shift = oranı koru)
//   Alt + tutamak kırpar
//   Üstteki yuvarlak tutamak döndürür (Shift = 15° adım)
//   Ok tuşları   1 px (Shift 10 px) · Delete: sahneden çıkar · Esc: seçimi bırak
//
// Sürükleme sırasında yapılandırma DEĞİŞMEZ: kutu overrideRef'e yazılır,
// karıştırıcı onu anında çizer; bırakınca tek seferde kaydedilir (onCommit).
import React, { memo, useCallback, useEffect, useRef, useState } from "react";
import { HANDLES, cropLayer, handleCursor, hitTest, moveLayer, nudge, resizeLayer, rotationFromPoint, snapLines } from "../../../lib/studio/scenesTransform";

function SceneEditOverlay({ scene, selectedId, onSelect, onCommit, onRemove, overrideRef, sourceName, outW, outH, snap = true, layerName = null }) {
  const ref = useRef(null);
  const drag = useRef(null);
  const [draft, setDraft] = useState(null); // { layerId, patch, guides }
  const layers = scene?.layers || [];
  const selected = layers.find((l) => l.id === selectedId) || null;

  useEffect(() => () => { if (overrideRef) overrideRef.current = null; }, [overrideRef]);

  const rect = () => ref.current.getBoundingClientRect();

  const onPointerDown = useCallback((e) => {
    if (e.button !== 0 || !scene) return;
    const r = rect();
    const px = e.clientX - r.left;
    const py = e.clientY - r.top;
    const handle = e.target.dataset?.handle || null;
    ref.current.focus({ preventScroll: true });
    let layer = handle ? selected : null;
    if (!layer) {
      const id = hitTest(layers, px, py, r.width, r.height, { includeLocked: true });
      layer = layers.find((l) => l.id === id) || null;
      onSelect(layer?.id || null);
    }
    if (!layer || layer.locked) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = {
      layerId: layer.id,
      start: { x: e.clientX, y: e.clientY },
      base: { x: layer.x, y: layer.y, w: layer.w, h: layer.h, rot: layer.rot || 0, crop: { ...(layer.crop || { l: 0, t: 0, r: 0, b: 0 }) } },
      mode: handle === "rot" ? "rotate" : handle ? (e.altKey ? "crop" : "resize") : "move",
      handle,
      size: { w: r.width, h: r.height, left: r.left, top: r.top },
      lines: snapLines(layers, layer.id),
      moved: false,
    };
  }, [layers, onSelect, scene, selected]);

  const onPointerMove = useCallback((e) => {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.start.x) / d.size.w;
    const dy = (e.clientY - d.start.y) / d.size.h;
    if (!d.moved && Math.abs(e.clientX - d.start.x) + Math.abs(e.clientY - d.start.y) < 2) return;
    d.moved = true;
    let patch;
    let guides = [];
    if (d.mode === "move") {
      const m = moveLayer(d.base, dx, dy, { snap: snap && !(e.ctrlKey || e.metaKey), ...(snap ? d.lines : {}) });
      patch = { x: m.x, y: m.y };
      guides = m.guides;
    } else if (d.mode === "resize") {
      patch = resizeLayer(d.base, d.handle, dx, dy, { keepAspect: e.shiftKey, aspect: d.base.h ? d.base.w / d.base.h : 1 });
    } else if (d.mode === "crop") {
      patch = cropLayer(d.base, d.base.crop, d.handle, dx, dy);
    } else {
      const b = d.base;
      const box = { x: b.x * d.size.w, y: b.y * d.size.h, w: b.w * d.size.w, h: b.h * d.size.h };
      patch = { rot: rotationFromPoint(box, e.clientX - d.size.left, e.clientY - d.size.top, { step: e.shiftKey ? 15 : 0 }) };
    }
    d.patch = patch;
    if (overrideRef) overrideRef.current = { layerId: d.layerId, patch };
    setDraft({ layerId: d.layerId, patch, guides });
  }, [overrideRef, snap]);

  const finish = useCallback(() => {
    const d = drag.current;
    drag.current = null;
    if (d?.moved && d.patch) onCommit(d.layerId, d.patch);
    // Kayıt çizilene dek eski kutu görünmesin: bir kare sonra bırak.
    requestAnimationFrame(() => { if (!drag.current && overrideRef) overrideRef.current = null; });
    setDraft(null);
  }, [onCommit, overrideRef]);

  const onKeyDown = useCallback((e) => {
    if (!selected) return;
    if (e.key === "Escape") { onSelect(null); return; }
    if ((e.key === "Delete" || e.key === "Backspace") && !selected.locked) { e.preventDefault(); e.stopPropagation(); onRemove(selected.id); return; }
    if (selected.locked) return;
    const p = nudge(selected, e.key, e.shiftKey, outW, outH);
    if (p) { e.preventDefault(); e.stopPropagation(); onCommit(selected.id, p); }
  }, [onCommit, onRemove, onSelect, outH, outW, selected]);

  if (!scene) return null;
  const view = (l) => (draft && draft.layerId === l.id ? { ...l, ...draft.patch } : l);
  const pct = (v) => `${v * 100}%`;

  return (
    <div ref={ref} className={`st-edit ${draft ? "is-dragging" : ""}`} tabIndex={0} role="application" aria-label="Sahne düzenleyicisi: katman seç, taşı, boyutla"
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={finish} onPointerCancel={finish} onKeyDown={onKeyDown}>
      {layers.map((l0) => {
        if (!l0.visible) return null;
        const l = view(l0);
        const on = l.id === selectedId;
        return (
          <div key={l.id} className={`st-edit__box ${on ? "is-on" : ""} ${l.locked ? "is-locked" : ""}`}
            style={{ left: pct(l.x), top: pct(l.y), width: pct(l.w), height: pct(l.h), transform: l.rot ? `rotate(${l.rot}deg)` : undefined }}>
            {on && (
              <>
                <span className="st-edit__label">{(layerName && layerName(l)) || sourceName(l.sourceId)}{l.locked ? " · kilitli" : ""} · {Math.round(l.w * outW)}×{Math.round(l.h * outH)}</span>
                {!l.locked && HANDLES.map((h) => <i key={h} data-handle={h} className={`st-edit__h is-${h}`} style={{ cursor: handleCursor(h) }} title="Sürükle: boyutla · Shift: oranı koru · Alt: kırp" />)}
                {!l.locked && <i data-handle="rot" className="st-edit__rot" title="Döndür (Shift: 15°)" />}
              </>
            )}
          </div>
        );
      })}
      {draft?.guides?.map((g, i) => <span key={i} className={`st-edit__guide is-${g.axis}`} style={g.axis === "x" ? { left: pct(g.at) } : { top: pct(g.at) }} />)}
    </div>
  );
}

export default memo(SceneEditOverlay);
