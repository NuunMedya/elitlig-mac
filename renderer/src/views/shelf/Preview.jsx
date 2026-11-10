// Raf / kütüphane önizlemesi: görselde yakınlaştırma (sığdır → %400; tekerlek,
// sıkıştırma, sürükleyerek kaydırma, çift tık sıfırlar), metinde düzenleme
// (E; ⌘↩ ya da Esc kaydeder), bağlantıda kart ve tarayıcıda aç (⌘O).
import React, { useEffect, useRef, useState } from "react";
import { Kbd, isMac } from "../../components/ui";
import { FIcon } from "../files/icons";
import { itemTitle, relativeTime, SOURCE_LABELS } from "../../lib/shelf/shelfUtils";

export default function Preview({ item, onClose, onPrev, onNext, onCopy, onEdit, onPin, onSaveText, compact = false, position = null }) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(item?.text || "");
  const dragRef = useRef(null);
  const boxRef = useRef(null);

  useEffect(() => { setZoom(1); setPan({ x: 0, y: 0 }); setEditing(false); setText(item?.text || ""); }, [item?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const finishEdit = () => { if (editing && text !== item.text) onSaveText?.(text); setEditing(false); };

  useEffect(() => {
    const onKey = (e) => {
      const mod = isMac() ? e.metaKey : e.ctrlKey;
      if (editing) {
        if (e.key === "Escape" || (mod && e.key === "Enter")) { e.preventDefault(); e.stopPropagation(); finishEdit(); }
        return;
      }
      if (e.key === "Escape" || e.key === " ") { e.preventDefault(); e.stopPropagation(); onClose(); return; }
      if (e.key === "ArrowLeft" && onPrev) { e.preventDefault(); e.stopPropagation(); onPrev(); return; }
      if (e.key === "ArrowRight" && onNext) { e.preventDefault(); e.stopPropagation(); onNext(); return; }
      if ((e.key === "e" || e.key === "E") && item.kind === "text" && onSaveText && !mod) { e.preventDefault(); e.stopPropagation(); setEditing(true); return; }
      if (mod && e.key.toLowerCase() === "o" && item.kind === "link") { e.preventDefault(); window.elitlig.shelf.openLink(item.id); return; }
      if (e.key === "Enter" && onCopy) { e.preventDefault(); e.stopPropagation(); onCopy(); return; }
      if (mod && e.key.toLowerCase() === "c" && onCopy) { e.preventDefault(); e.stopPropagation(); onCopy(false); return; }
      if (mod || e.altKey || e.shiftKey) return;
      if ((e.key === "p" || e.key === "P") && onPin) { e.preventDefault(); e.stopPropagation(); onPin(); return; }
      if ((e.key === "m" || e.key === "M") && item.kind === "image" && onEdit) { e.preventDefault(); e.stopPropagation(); onEdit("markup"); return; }
      if ((e.key === "c" || e.key === "C") && item.kind === "image" && onEdit) { e.preventDefault(); e.stopPropagation(); onEdit("crop"); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  if (!item) return null;
  const onWheel = (e) => {
    if (item.kind !== "image") return;
    if (e.shiftKey && zoom > 1) { setPan((p) => ({ x: p.x - e.deltaY, y: p.y })); return; }
    const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0025));
    setZoom((z) => {
      const next = Math.min(4, Math.max(1, z * factor));
      if (next === 1) setPan({ x: 0, y: 0 });
      return next;
    });
  };
  const onDown = (e) => { if (zoom > 1) { dragRef.current = { x: e.clientX, y: e.clientY, pan }; e.currentTarget.setPointerCapture(e.pointerId); } };
  const onMove = (e) => { const d = dragRef.current; if (d) setPan({ x: d.pan.x + e.clientX - d.x, y: d.pan.y + e.clientY - d.y }); };
  const onUp = () => { dragRef.current = null; };

  return (
    <div className={`sp ${compact ? "sp--compact" : ""}`} role="dialog" aria-modal="true" aria-label={`Önizleme: ${itemTitle(item)}`} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sp__box" ref={boxRef}>
        <header className="sp__head">
          <strong className="sp__title">{itemTitle(item)}</strong>
          <span className="muted">{SOURCE_LABELS[item.source] || ""} · {relativeTime(item.copiedAt || item.createdAt)}{item.kind === "image" && item.width ? ` · ${item.width}×${item.height}` : ""}{position ? ` · ${position}` : ""}</span>
          <span className="spacer" />
          {item.kind === "image" && <span className="sp__zoom">%{Math.round(zoom * 100)}</span>}
          {onPin && <button type="button" className={`icon-btn ${item.pinned ? "is-on" : ""}`} onClick={onPin} aria-label={item.pinned ? "Sabitlemeyi kaldır (P)" : "Sabitle (P)"} title="Sabitle (P)"><FIcon name="pin" /></button>}
          {item.kind === "image" && onEdit && <button type="button" className="icon-btn" onClick={() => onEdit("markup")} aria-label="İşaretle (M)" title="İşaretle (M)"><FIcon name="pencil" /></button>}
          {item.kind === "image" && onEdit && <button type="button" className="icon-btn" onClick={() => onEdit("crop")} aria-label="Kırp (C)" title="Kırp (C)"><FIcon name="crop" /></button>}
          {item.kind === "text" && onSaveText && <button type="button" className={`icon-btn ${editing ? "is-on" : ""}`} onClick={() => (editing ? finishEdit() : setEditing(true))} aria-label="Düzenle (E)" title="Düzenle (E)"><FIcon name="pencil" /></button>}
          {item.kind === "link" && <button type="button" className="icon-btn" onClick={() => window.elitlig.shelf.openLink(item.id)} aria-label="Tarayıcıda aç (⌘O)" title="Tarayıcıda aç (⌘O)"><FIcon name="external" /></button>}
          {onCopy && <button type="button" className="btn btn--sm btn--primary" onClick={onCopy}><FIcon name="copy" size={14} /> Kopyala</button>}
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Kapat"><FIcon name="x" /></button>
        </header>
        <div className="sp__body" onWheel={onWheel}>
          {onPrev && <button type="button" className="sp__nav sp__nav--prev" onClick={onPrev} aria-label="Önceki (←)"><FIcon name="chevronLeft" /></button>}
          {onNext && <button type="button" className="sp__nav sp__nav--next" onClick={onNext} aria-label="Sonraki (→)"><FIcon name="chevronRight" /></button>}
          {item.kind === "image" && (
            <div className={`sp__img ${zoom > 1 ? "is-zoomed" : ""}`} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onDoubleClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}>
              <img src={item.imageUrl} alt={itemTitle(item)} draggable={false} style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }} />
            </div>
          )}
          {item.kind === "text" && (editing
            ? <textarea className="sp__text" value={text} autoFocus onChange={(e) => setText(e.target.value)} onBlur={finishEdit} aria-label="Metni düzenle" />
            : <pre className="sp__text selectable" onDoubleClick={() => onSaveText && setEditing(true)}>{item.text}</pre>)}
          {item.kind === "link" && (
            <div className="sp__link">
              {item.linkImageUrl ? <img src={item.linkImageUrl} alt="" /> : <span className="sp__link-icon"><FIcon name="globe" size={40} /></span>}
              <strong>{item.linkTitle || item.domain}</strong>
              {item.linkSite && <span className="muted">{item.linkSite}</span>}
              <code className="selectable">{item.url}</code>
            </div>
          )}
        </div>
        {(item.note || (item.tags || []).length) && !compact ? (
          <footer className="sp__foot">{item.note && <span>{item.note}</span>}{(item.tags || []).map((t) => <span key={t} className="chip">#{t}</span>)}</footer>
        ) : null}
        <div className="sp__keys" aria-hidden="true"><Kbd>←</Kbd><Kbd>→</Kbd> gez · <Kbd>↩</Kbd> kopyala · <Kbd>Boşluk</Kbd> kapat{item.kind === "image" ? " · tekerlek: yakınlaştır" : item.kind === "text" ? " · E düzenle" : " · ⌘O aç"}</div>
      </div>
    </div>
  );
}
