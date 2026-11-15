// PDF sayfaları: sırala (sürükle ya da ← →), döndür, çoğalt, sil. Kaydedince
// yeni bir PDF yazılır (pdf-lib, ana süreç); özgün dosya değişmez.
import React, { useEffect, useRef, useState } from "react";
import { Kbd, Spinner } from "../../components/ui";
import { FIcon } from "./icons";
import { useEditorClose } from "./editorGuard";

export default function PdfPages({ file, onRun, onClose }) {
  const [pages, setPages] = useState(null); // [{ key, index, rotate, width, height }]
  const [sel, setSel] = useState(new Set());
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [dragKey, setDragKey] = useState(null);
  const rootRef = useRef(null);

  useEffect(() => {
    window.elitlig.fileTools.pdfInfo(file.id).then((res) => {
      if (!res.ok) { setError(res.error?.message || "PDF okunamadı."); return; }
      setPages(Array.from({ length: res.pages }, (_, i) => ({ key: `p${i}`, index: i, rotate: 0, base: res.sizes[i]?.rotate || 0, width: res.sizes[i]?.width || 595, height: res.sizes[i]?.height || 842 })));
    });
  }, [file.id]);

  const selected = (p) => sel.has(p.key);
  const targets = () => (sel.size ? pages.filter(selected) : []);
  const toggle = (p, e) => {
    setSel((s) => {
      const next = new Set(e?.metaKey || e?.ctrlKey || e?.shiftKey ? s : []);
      if (next.has(p.key) && (e?.metaKey || e?.ctrlKey)) next.delete(p.key); else next.add(p.key);
      return next;
    });
  };
  const rotate = (deg) => setPages((ps) => ps.map((p) => (sel.has(p.key) || !sel.size ? { ...p, rotate: (p.rotate + deg + 360) % 360 } : p)));
  const remove = () => {
    if (!sel.size) return;
    setPages((ps) => ps.filter((p) => !sel.has(p.key)));
    setSel(new Set());
  };
  const duplicate = () => setPages((ps) => ps.flatMap((p) => (sel.has(p.key) ? [p, { ...p, key: `${p.key}-${Math.random().toString(36).slice(2, 6)}` }] : [p])));
  const move = (dir) => setPages((ps) => {
    const list = [...ps];
    const idx = list.map((p, i) => (sel.has(p.key) ? i : -1)).filter((i) => i >= 0);
    const order = dir < 0 ? idx : idx.reverse();
    for (const i of order) {
      const j = i + dir;
      if (j < 0 || j >= list.length || sel.has(list[j].key)) continue;
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  });
  const dropOn = (target) => {
    if (!dragKey || dragKey === target.key) return;
    setPages((ps) => {
      const list = ps.filter((p) => p.key !== dragKey);
      const moving = ps.find((p) => p.key === dragKey);
      const at = list.findIndex((p) => p.key === target.key);
      list.splice(at, 0, moving);
      return list;
    });
    setDragKey(null);
  };

  const changed = pages && (pages.length !== pages.filter((p, i) => p.index === i).length || pages.some((p) => p.rotate) || pages.length !== new Set(pages.map((p) => p.index)).size);
  // Sıralama / döndürme yapıldıysa Vazgeç, ✕, Esc ve dışarı tıklama önce sorar.
  const { requestClose, ask, askNode } = useEditorClose({ dirty: Boolean(changed) && !busy, onClose, rootRef, message: "Sayfa düzenlemeleri kaydedilmeden kapatılsın mı?" });
  const save = async () => {
    if (!pages?.length || busy) return;
    setBusy(true);
    let res;
    try { res = await onRun({ op: "pdfOrganize", options: { pages: pages.map((p) => ({ index: p.index, rotate: p.rotate })) } }); } catch (e) { res = { ok: false, error: { message: e?.message } }; }
    setBusy(false);
    if (res?.ok) onClose(); else setError(res?.error?.message || "Kaydedilemedi.");
  };

  useEffect(() => {
    const onKey = (e) => {
      if (ask) return;
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); requestClose(); return; }
      if (!pages) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a") { e.preventDefault(); setSel(new Set(pages.map((p) => p.key))); return; }
      if (e.key === "Backspace" || e.key === "Delete") { e.preventDefault(); remove(); return; }
      if (e.key === "ArrowLeft" && e.altKey) { e.preventDefault(); move(-1); return; }
      if (e.key === "ArrowRight" && e.altKey) { e.preventDefault(); move(1); return; }
      if (e.key === "r" || e.key === "R") { e.preventDefault(); rotate(e.shiftKey ? -90 : 90); return; }
      if (e.key === "Enter") { e.preventDefault(); save(); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  return (
    <div className="ie" ref={rootRef} role="dialog" aria-modal="true" aria-label={`Sayfalar: ${file.name}`}>
      <header className="ie__head">
        <strong className="ie__title">{file.name}</strong>
        <span className="muted">{pages ? `${pages.length} sayfa${sel.size ? ` · ${sel.size} seçili` : ""}` : ""}</span>
        <span className="spacer" />
        <button type="button" className="icon-btn" onClick={requestClose} aria-label="Kapat" title="Kapat (esc)"><FIcon name="x" /></button>
      </header>
      <div className="ie__bar" role="toolbar" aria-label="Sayfa işlemleri">
        <button type="button" className="btn btn--sm" onClick={() => rotate(-90)}><FIcon name="rotate" size={14} /> Sola döndür</button>
        <button type="button" className="btn btn--sm" onClick={() => rotate(90)}><FIcon name="rotateCw" size={14} /> Sağa döndür</button>
        <button type="button" className="btn btn--sm" onClick={() => move(-1)} disabled={!sel.size}><FIcon name="chevronLeft" size={14} /> Öne al</button>
        <button type="button" className="btn btn--sm" onClick={() => move(1)} disabled={!sel.size}>Sona al <FIcon name="chevronRight" size={14} /></button>
        <button type="button" className="btn btn--sm" onClick={duplicate} disabled={!sel.size}><FIcon name="copy" size={14} /> Çoğalt</button>
        <button type="button" className="btn btn--sm btn--danger-ghost" onClick={remove} disabled={!sel.size || sel.size >= (pages?.length || 0)}><FIcon name="trash" size={14} /> Sil</button>
        <span className="ie__hint">{sel.size ? "" : "Seçim yoksa döndürme tüm sayfalara uygulanır."} Sürükleyerek sıralayın.</span>
      </div>
      <div className="pdfp">
        {error ? <div className="error-note"><span>{error}</span></div> : !pages ? <Spinner label="PDF okunuyor…" /> : (
          <ol className="pdfp__grid" aria-label="Sayfalar">
            {pages.map((p, i) => {
              const r = (p.base + p.rotate) % 180 === 90;
              const ratio = r ? p.height / p.width : p.width / p.height;
              return (
                <li key={p.key} className={`pdfp__page ${selected(p) ? "is-selected" : ""} ${dragKey === p.key ? "is-dragging" : ""}`} draggable
                  onDragStart={(e) => { setDragKey(p.key); e.dataTransfer.effectAllowed = "move"; }} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); dropOn(p); }} onDragEnd={() => setDragKey(null)}
                  onClick={(e) => toggle(p, e)} aria-selected={selected(p)} tabIndex={0} onKeyDown={(e) => { if (e.key === " ") { e.preventDefault(); toggle(p, { metaKey: true }); } }}>
                  <div className="pdfp__sheet" style={{ aspectRatio: String(ratio) }}>
                    <span className="pdfp__num">{p.index + 1}</span>
                    {p.rotate ? <span className="pdfp__rot">{p.rotate}°</span> : null}
                  </div>
                  <small>{i + 1}. sıra{p.index !== i ? ` · s.${p.index + 1}` : ""}</small>
                </li>
              );
            })}
          </ol>
        )}
      </div>
      <footer className="ie__foot">
        <span className="muted"><Kbd>⌘A</Kbd> tümü · <Kbd>R</Kbd> döndür · <Kbd>⌥←</Kbd><Kbd>⌥→</Kbd> taşı · <Kbd>⌫</Kbd> sil</span>
        <span className="spacer" />
        <button type="button" className="btn" onClick={requestClose}>Vazgeç</button>
        <button type="button" className="btn btn--primary" onClick={save} disabled={!changed || busy}>Yeni PDF olarak kaydet <Kbd>↩</Kbd></button>
      </footer>
      {askNode}
    </div>
  );
}
