// Float rafı penceresi (#float): küçük, her zaman üstte duran dosya yığını.
// Üzerine gelince (200 ms) ya da tıklayınca dikey rafa açılır; ayrılınca 650 ms
// sonra katlanır. Ataştan sürükleyince pencere taşınır (kenara yapışır); yığından
// ya da satırdan sürükleyince dosyalar başka uygulamalara bırakılır.
// ⌘A tümü · ⌘C yolları kopyala · Boşluk önizle · ↩ aç · ⌫ kaldır · Esc katla.
// Kaldırmak yalnız referansı siler; orijinal dosya yerinde kalır.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { FIcon } from "./icons";
import { formatBytes } from "../../lib/files/catalog";
import "./files.css";

const IMG = new Set(["jpg", "jpeg", "png", "webp", "gif", "bmp", "avif"]);

export default function Float() {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(new Set());
  const [over, setOver] = useState(false);
  const [menu, setMenu] = useState(false);
  const hoverTimer = useRef(null);
  const leaveTimer = useRef(null);
  const dragging = useRef(false);

  useEffect(() => {
    document.documentElement.dataset.window = "float";
    window.elitlig.float.list().then((r) => r.ok && setItems(r.items));
    return window.elitlig.float.onChange((list) => setItems(list || []));
  }, []);

  const expand = useCallback((on) => {
    setOpen(on);
    window.elitlig.float.expand(on);
    if (!on) { setMenu(false); }
  }, []);
  const onEnter = () => { clearTimeout(leaveTimer.current); if (!open) hoverTimer.current = setTimeout(() => expand(true), 200); };
  const onLeave = () => {
    clearTimeout(hoverTimer.current);
    if (!open || dragging.current || menu) return;
    leaveTimer.current = setTimeout(() => expand(false), 650);
  };

  const live = items.filter((i) => !i.missing);
  const chosen = sel.size ? live.filter((i) => sel.has(i.path)) : live;
  const startDrag = (e, paths) => {
    e.preventDefault();
    if (!paths.length) return;
    dragging.current = true;
    window.elitlig.fileTools.startDrag(paths);
    setTimeout(() => { dragging.current = false; }, 1500);
  };
  const onDrop = async (e) => {
    e.preventDefault();
    setOver(false);
    const res = await window.elitlig.fileTools.addFiles(e.dataTransfer.files);
    if (res.ok) await window.elitlig.float.add(res.files.map((f) => f.path));
  };
  const remove = (paths) => { window.elitlig.float.remove(paths); setSel(new Set()); };
  const toggle = (item, e) => setSel((s) => {
    const next = new Set(e.metaKey || e.ctrlKey ? s : []);
    if ((e.metaKey || e.ctrlKey) && s.has(item.path)) next.delete(item.path); else next.add(item.path);
    return next;
  });

  useEffect(() => {
    const onKey = (e) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "a") { e.preventDefault(); expand(true); setSel(new Set(live.map((i) => i.path))); }
      else if (mod && e.key.toLowerCase() === "c") { e.preventDefault(); window.elitlig.fileTools.copyPaths(chosen.map((i) => i.path)); }
      else if (mod && e.key.toLowerCase() === "v") { e.preventDefault(); window.elitlig.fileTools.paste().then((r) => r.ok && r.files.length && window.elitlig.float.add(r.files.map((f) => f.path))); }
      else if (mod && e.key.toLowerCase() === "r") { e.preventDefault(); if (chosen[0]) window.elitlig.fileTools.reveal(chosen[0].path); }
      else if (e.key === " ") { e.preventDefault(); if (chosen[0]) window.elitlig.fileTools.preview(chosen[0].path); }
      else if (e.key === "Enter" || (mod && e.key.toLowerCase() === "o")) { e.preventDefault(); chosen.forEach((i) => window.elitlig.fileTools.openPath(i.path)); }
      else if ((e.key === "Backspace" || e.key === "Delete") && sel.size) { e.preventDefault(); remove([...sel]); }
      else if (e.key === "Escape") { e.preventDefault(); if (sel.size) setSel(new Set()); else expand(false); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const hideBroken = (e) => { e.currentTarget.style.visibility = "hidden"; };
  const thumb = (i, size = 40) => (i.url && IMG.has(i.ext) ? <img src={i.url} alt="" width={size} height={size} onError={hideBroken} /> : i.icon ? <img src={i.icon} alt="" width={size} height={size} className="is-icon" onError={hideBroken} /> : <FIcon name="file" size={size * 0.6} />);

  return (
    <div className={`float ${open ? "is-open" : ""} ${over ? "is-over" : ""}`} onMouseEnter={onEnter} onMouseLeave={onLeave}
      onDragOver={(e) => { e.preventDefault(); setOver(true); if (!open) expand(true); }} onDragLeave={() => setOver(false)} onDrop={onDrop}>
      <div className="float__clip" title="Taşımak için sürükleyin" aria-hidden="true"><FIcon name="paperclip" size={16} /></div>
      {!open ? (
        <button type="button" className="float__stack" onClick={() => expand(true)} draggable={live.length > 0} onDragStart={(e) => startDrag(e, live.map((i) => i.path))}
          aria-label={`Float rafı: ${items.length} dosya. Açmak için tıklayın, dosyaları taşımak için sürükleyin.`}>
          {items.length ? items.slice(0, 3).map((i, n) => <span key={i.path} className={`float__card float__card--${n}`}>{thumb(i, 44)}</span>) : <span className="float__empty"><FIcon name="plus" size={18} /></span>}
          <span className="float__count">{items.length}</span>
        </button>
      ) : (
        <div className="float__shelf">
          <header className="float__head" draggable={live.length > 0} onDragStart={(e) => startDrag(e, chosen.map((i) => i.path))}>
            <strong>Float</strong><span className="muted">{items.length}</span>
            <span className="spacer" />
            <button type="button" className="icon-btn icon-btn--xs" onClick={() => setMenu((m) => !m)} aria-label="Seçenekler" aria-expanded={menu}><FIcon name="more" size={14} /></button>
            <button type="button" className="icon-btn icon-btn--xs" onClick={() => expand(false)} aria-label="Katla"><FIcon name="chevronDown" size={14} /></button>
          </header>
          {menu && (
            <div className="float__menu" role="menu">
              <button type="button" role="menuitem" onClick={() => { setMenu(false); window.elitlig.fileTools.pick().then((r) => r.ok && window.elitlig.float.add(r.files.map((f) => f.path))); }}><FIcon name="plus" size={13} /> Dosya ekle…</button>
              <button type="button" role="menuitem" disabled={!chosen.length} onClick={() => { setMenu(false); window.elitlig.float.openMain(chosen.map((i) => i.id).filter(Boolean)); }}><FIcon name="wheel" size={13} /> Dosya Araçları'nda aç</button>
              <button type="button" role="menuitem" disabled={!chosen.length} onClick={() => { setMenu(false); window.elitlig.fileTools.copyPaths(chosen.map((i) => i.path)); }}><FIcon name="copy" size={13} /> Yolları kopyala</button>
              <button type="button" role="menuitem" disabled={!items.length} onClick={() => { setMenu(false); window.elitlig.float.clear(); }}><FIcon name="trash" size={13} /> Rafı temizle</button>
              <button type="button" role="menuitem" onClick={() => window.elitlig.float.hide()}><FIcon name="x" size={13} /> Float'ı kapat</button>
            </div>
          )}
          {!items.length ? <p className="float__hint">Dosyaları buraya bırakın.</p> : (
            <ul className="float__list" role="listbox" aria-multiselectable="true" aria-label="Raftaki dosyalar">
              {items.map((i) => (
                <li key={i.path} role="option" aria-selected={sel.has(i.path)} className={`float__item ${sel.has(i.path) ? "is-selected" : ""} ${i.missing ? "is-missing" : ""}`}
                  onClick={(e) => toggle(i, e)} onDoubleClick={() => !i.missing && window.elitlig.fileTools.openPath(i.path)}
                  draggable={!i.missing} onDragStart={(e) => startDrag(e, sel.has(i.path) ? chosen.map((x) => x.path) : [i.path])} title={i.path}>
                  <span className="float__thumb">{thumb(i)}</span>
                  <span className="float__text"><strong>{i.name}</strong><small>{i.missing ? "Bulunamadı" : formatBytes(i.size)}</small></span>
                  <span className="float__acts">
                    <button type="button" className="icon-btn icon-btn--xs" disabled={i.missing} onClick={(e) => { e.stopPropagation(); window.elitlig.fileTools.preview(i.path); }} aria-label="Önizle"><FIcon name="eye" size={12} /></button>
                    <button type="button" className="icon-btn icon-btn--xs" disabled={i.missing} onClick={(e) => { e.stopPropagation(); window.elitlig.fileTools.reveal(i.path); }} aria-label="Klasörde göster"><FIcon name="folder" size={12} /></button>
                    <button type="button" className="icon-btn icon-btn--xs" onClick={(e) => { e.stopPropagation(); remove([i.path]); }} aria-label="Raftan kaldır (dosya silinmez)"><FIcon name="x" size={12} /></button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
