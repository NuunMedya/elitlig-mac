// Yayın Stüdyosu · kısayol şeridi AÇILIR PANELİ: parçacığın sağında açılır
// (şeridin dışına taşar, kaydırılan listede kırpılmaz). Dışarı tık ya da Esc kapatır.
// Konum şerit kabına göre hesaplanır; arayüz ölçeği (zoom) hesaba katılır.
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";

export default function RailPopover({ anchor, host, zoom = 1, wide = false, title, onClose, children }) {
  const ref = useRef(null);
  const [top, setTop] = useState(0);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useLayoutEffect(() => {
    const a = anchor?.getBoundingClientRect?.();
    const h = host?.getBoundingClientRect?.();
    const box = ref.current?.getBoundingClientRect?.();
    if (!a || !h) return;
    const z = zoom || 1;
    let t = (a.top - h.top) / z;
    const hostH = h.height / z;
    const boxH = (box?.height || 0) / z;
    if (t + boxH > hostH - 8) t = Math.max(8, hostH - boxH - 8);
    setTop(Math.round(t));
  }, [anchor, host, zoom, children]);

  useEffect(() => {
    const onDown = (e) => {
      if (ref.current?.contains(e.target) || anchor?.contains?.(e.target)) return;
      if (e.target?.closest?.(".menu__list, .modal-backdrop")) return;
      closeRef.current?.();
    };
    const onKey = (e) => { if (e.key === "Escape" && !document.querySelector(".menu__list")) { e.stopPropagation(); closeRef.current?.(); } };
    window.addEventListener("mousedown", onDown, true);
    window.addEventListener("keydown", onKey, true);
    return () => { window.removeEventListener("mousedown", onDown, true); window.removeEventListener("keydown", onKey, true); };
  }, [anchor]);

  return (
    <div ref={ref} className={`st-pop ${wide ? "is-wide" : ""}`} style={{ top }} role="dialog" aria-label={title}>
      {title && <header className="st-pop__head"><strong>{title}</strong><button type="button" className="st-pop__x" onClick={onClose} aria-label="Kapat">×</button></header>}
      <div className="st-pop__body">{children}</div>
    </div>
  );
}
