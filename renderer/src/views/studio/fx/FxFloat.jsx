// Yayın Stüdyosu · canlı "GÖRÜNTÜ AYARLARI" paneli (yüzen, sürüklenebilir).
//
// Sahne kutusuna sağ tık → "Görüntü ayarları…", kaynak kartı menüsü ya da sahne
// düzenleyicisinden açılır. Değişiklik ANINDA kaynağa yazılır (yayında canlı görünür;
// kaynağın kullanıldığı tüm sahneler, önizleme, küçük resimler, LED ve açı kaydı).
// "Geri al" paneli açtığın andaki ayara döndürür. Esc ya da × kapatır.
import React, { useEffect, useRef, useState } from "react";
import { Icon } from "../../../components/ui";
import { compactFx, fxActive } from "../../../lib/studio/videoFx";
import { sourceKindIcon } from "../../../lib/studio/scenes";
import FxEditor from "./FxEditor";

const POS_KEY = "studio.fxFloat.pos";
const readPos = () => { try { const v = JSON.parse(localStorage.getItem(POS_KEY) || "null"); return v && Number.isFinite(v.x) ? v : null; } catch { return null; } };

export default function FxFloat({ source, runtimeRef, onChange, onClose, onAir = false, sources = [], onSwitch = null }) {
  const [pos, setPos] = useState(() => readPos() || { x: Math.max(16, window.innerWidth - 420), y: 80 });
  const initial = useRef({ id: source?.id, fx: source?.fx || null });
  if (initial.current.id !== source?.id) initial.current = { id: source?.id, fx: source?.fx || null };
  const drag = useRef(null);
  useEffect(() => {
    const key = (e) => { if (e.key === "Escape" && !e.target?.closest?.("input, textarea, select")) { e.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [onClose]);
  useEffect(() => { try { localStorage.setItem(POS_KEY, JSON.stringify(pos)); } catch { /* yoksay */ } }, [pos]);
  if (!source) return null;
  const clampPos = (x, y) => ({ x: Math.max(0, Math.min(window.innerWidth - 120, x)), y: Math.max(0, Math.min(window.innerHeight - 60, y)) });
  const changed = JSON.stringify(compactFx(source.fx)) !== JSON.stringify(compactFx(initial.current.fx));
  return (
    <div className={`vfx-float ${onAir ? "is-live" : ""}`} style={{ left: pos.x, top: pos.y }} role="dialog" aria-label={`Görüntü ayarları: ${source.name}`}
      onKeyDown={(e) => e.stopPropagation()}>
      <header className="vfx-float__head"
        onPointerDown={(e) => { if (e.button !== 0 || e.target.closest("button, select")) return; drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y }; e.currentTarget.setPointerCapture?.(e.pointerId); }}
        onPointerMove={(e) => { if (drag.current) setPos(clampPos(e.clientX - drag.current.dx, e.clientY - drag.current.dy)); }}
        onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
        <Icon name="sliders" size={14} />
        <strong>Görüntü ayarları</strong>
        {sources.length > 1 && onSwitch ? (
          <select value={source.id} onChange={(e) => onSwitch(e.target.value)} aria-label="Kaynak">
            {sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        ) : <span className="vfx-float__name"><Icon name={sourceKindIcon(source.kind)} size={12} /> {source.name}</span>}
        {onAir && <span className="st-tag is-live" title="Kaynak yayındaki sahnede: değişiklik anında yayına gider">YAYINDA</span>}
        <span className="vfx__sp" />
        <button type="button" className="icon-btn icon-btn--xs" disabled={!changed} onClick={() => onChange(initial.current.fx)} title="Panel açıldığındaki ayara dön" aria-label="Geri al"><Icon name="undo" size={13} /></button>
        <button type="button" className="icon-btn icon-btn--xs" onClick={onClose} title="Kapat (Esc) — ayarlar kaydedildi" aria-label="Kapat"><Icon name="x" size={14} /></button>
      </header>
      <div className="vfx-float__body">
        <FxEditor fx={source.fx || null} onChange={onChange} source={source} runtimeRef={runtimeRef} compact />
      </div>
      <footer className="vfx-float__foot">
        <small>{fxActive(source.fx) ? "Ayarlar canlı uygulanıyor · kaynağın tüm sahnelerinde" : "Ayar yok (özgün görüntü)"}</small>
      </footer>
    </div>
  );
}
