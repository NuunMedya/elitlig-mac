// Çark menüsü: seçili dosyalar için Dönüştür / Araçlar / Dosya işlemleri.
// Klavye: ← → (ya da ↑ ↓) seç, Enter çalıştır, Tab / 1–3 grup değiştir, Esc kapat.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { GROUPS } from "../../lib/files/catalog";
import { FIcon } from "./icons";
import { Kbd } from "../../components/ui";

const ITEM = 64;

export default function Wheel({ tools, group, onGroup, onPick, onClose, count }) {
  const items = tools[group] || [];
  const [index, setIndex] = useState(0);
  const ref = useRef(null);
  useEffect(() => setIndex(0), [group]);
  useEffect(() => { ref.current?.focus(); }, []);
  useEffect(() => {
    const opener = document.activeElement;
    return () => { if (opener?.isConnected) opener.focus?.({ preventScroll: true }); };
  }, []);

  const n = Math.max(1, items.length);
  // Halka çevresi öğe sayısına göre büyür (yazılar çakışmasın).
  const radius = Math.max(112, (n * (ITEM + 26)) / (2 * Math.PI));
  const size = Math.round(radius * 2 + ITEM + 56);
  const positions = useMemo(() => items.map((_, i) => {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    return { left: size / 2 + Math.cos(a) * radius - ITEM / 2, top: size / 2 + Math.sin(a) * radius - ITEM / 2 };
  }), [items, n, radius, size]);

  const groupIndex = GROUPS.findIndex((g) => g.key === group);
  const nextGroup = (dir) => {
    for (let s = 1; s <= GROUPS.length; s += 1) {
      const g = GROUPS[(groupIndex + dir * s + GROUPS.length * 3) % GROUPS.length];
      if ((tools[g.key] || []).length) { onGroup(g.key); return; }
    }
  };
  const onKey = (e) => {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); return; }
    if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); setIndex((i) => (i + 1) % n); }
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); setIndex((i) => (i - 1 + n) % n); }
    else if (e.key === "Tab") { e.preventDefault(); nextGroup(e.shiftKey ? -1 : 1); }
    else if (/^[1-3]$/.test(e.key)) { const g = GROUPS[Number(e.key) - 1]; if ((tools[g.key] || []).length) onGroup(g.key); }
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); const t = items[index]; if (t && !t.disabled) onPick(t); }
  };
  const current = items[index];

  return createPortal(
    <div className="ft-wheel-backdrop" data-tool="files" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ft-wheel-wrap">
        <div className="ft-wheel-tabs" role="tablist" aria-label="Çark grupları">
          {GROUPS.map((g, i) => (
            <button key={g.key} type="button" role="tab" aria-selected={g.key === group} className={g.key === group ? "is-active" : ""}
              disabled={!(tools[g.key] || []).length} onClick={() => onGroup(g.key)}>
              <FIcon name={g.icon} size={14} /> {g.label} <span className="ft-wheel-tabs__n">{(tools[g.key] || []).length}</span><Kbd>{String(i + 1)}</Kbd>
            </button>
          ))}
        </div>
        <div ref={ref} className="ft-wheel" style={{ width: size, height: size }} role="menu" aria-label={`${GROUPS[groupIndex]?.label} — ${count} dosya`} tabIndex={-1} onKeyDown={onKey}>
          <div className="ft-wheel__ring" style={{ inset: ITEM / 2 + 6 }} aria-hidden="true" />
          <div className="ft-wheel__center">
            <strong>{current ? current.label : GROUPS[groupIndex]?.label}</strong>
            <small>{current?.disabled ? current.reason : `${count} dosya · ${items.length} seçenek`}</small>
          </div>
          {items.map((t, i) => (
            <button key={t.id} type="button" role="menuitem" className={`ft-wheel__item ${i === index ? "is-active" : ""}`} disabled={t.disabled}
              style={{ left: positions[i].left, top: positions[i].top, width: ITEM, height: ITEM }} title={t.reason || t.label}
              onMouseEnter={() => setIndex(i)} onFocus={() => setIndex(i)} onClick={() => !t.disabled && onPick(t)}>
              <FIcon name={t.icon} size={22} />
              <span className="ft-wheel__label">{t.label}</span>
            </button>
          ))}
          {!items.length && <div className="ft-wheel__empty">Bu grupta seçime uyan işlem yok.</div>}
        </div>
        <div className="ft-wheel-hint" aria-hidden="true"><Kbd>←</Kbd><Kbd>→</Kbd> seç · <Kbd>↩</Kbd> çalıştır · <Kbd>⇥</Kbd> grup · <Kbd>esc</Kbd> kapat</div>
      </div>
    </div>,
    document.body,
  );
}
