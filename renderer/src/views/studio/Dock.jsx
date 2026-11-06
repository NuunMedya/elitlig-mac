// Yayın Stüdyosu · ALT PANEL: sekmeler (vurgulu Tekrar en başta, Maç yönetimi, Sahneler,
// Geçişler, grafik sekmeleri, özel kipler, Yayın, Ses, LED; sağda Ayarlar) ve sürüklenerek
// büyütülüp küçültülen yükseklik (tercihlerde saklanır).
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "../../components/ui";

export const DOCK_MIN = 150;
export const dockMax = () => Math.max(DOCK_MIN + 40, Math.round((typeof window !== "undefined" ? window.innerHeight : 900) * 0.62));
export const clampDock = (h) => Math.max(DOCK_MIN, Math.min(dockMax(), Math.round(Number(h) || 300)));

export default function Dock({ tabs, tab, onTab, height, onHeight, children, extra = null }) {
  const [drag, setDrag] = useState(null); // canlı yükseklik (sürüklerken)
  const start = useRef(null);
  const dragRef = useRef(null);
  dragRef.current = drag;
  const h = clampDock(drag ?? height);

  const onDown = useCallback((e) => {
    e.preventDefault();
    start.current = { y: e.clientY, h };
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setDrag(h);
  }, [h]);
  const onMove = useCallback((e) => {
    if (!start.current) return;
    setDrag(clampDock(start.current.h + (start.current.y - e.clientY)));
  }, []);
  const onUp = useCallback(() => {
    if (!start.current) return;
    start.current = null;
    if (dragRef.current != null) onHeight(dragRef.current);
    setDrag(null);
  }, [onHeight]);

  // Pencere küçülünce sınıra çek.
  useEffect(() => {
    const onResize = () => { if (height > dockMax()) onHeight(clampDock(height)); };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [height, onHeight]);

  return (
    <section className="st-dock" style={{ height: h }}>
      <div className={`st-dock__grip ${drag != null ? "is-drag" : ""}`} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
        onDoubleClick={() => onHeight(clampDock(height > 260 ? DOCK_MIN + 50 : 340))} role="separator" aria-orientation="horizontal" title="Sürükle: paneli büyüt / küçült · çift tıkla: aç / daralt">
        <i />
      </div>
      <nav className="st-dock__tabs" role="tablist">
        {tabs.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className={`${tab === t.key ? "is-on" : ""} ${t.accent ? "is-accent" : ""}`} onClick={() => onTab(t.key)} title={t.accent ? `${t.label}: en hızlı ulaşılan düzenleme alanı` : undefined}>
            <Icon name={t.icon} size={14} /><span>{t.label}</span>
            {t.count ? <b className="st-dock__count">{t.count}</b> : null}
          </button>
        ))}
        {extra && <span className="st-dock__extra">{extra}</span>}
      </nav>
      <div className="st-dock__body">{children}</div>
    </section>
  );
}
