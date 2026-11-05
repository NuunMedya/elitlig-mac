// Yayın Stüdyosu · ekran kutusu: DOM dışında kurulan tuvali 16:9 kutuya
// yerleştirir (kutu boyutu ResizeObserver'la hesaplanır), üstüne katman
// düzenleyicisi gibi kaplamalar konur (children, kutuyla aynı boyutta).
import React, { memo, useEffect, useLayoutEffect, useRef, useState } from "react";

function Monitor({ canvas, className = "", children, onBox }) {
  const outer = useRef(null);
  const inner = useRef(null);
  const [box, setBox] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const host = inner.current;
    if (!host || !canvas) return undefined;
    host.insertBefore(canvas, host.firstChild);
    return () => { if (canvas.parentNode === host) host.removeChild(canvas); };
  }, [canvas]);

  useLayoutEffect(() => {
    const el = outer.current;
    if (!el) return undefined;
    const measure = () => {
      const cw = el.clientWidth;
      const ch = el.clientHeight;
      let w = cw;
      let h = (w * 9) / 16;
      if (h > ch) { h = ch; w = (h * 16) / 9; }
      w = Math.floor(w); h = Math.floor(h);
      setBox((b) => (b.w === w && b.h === h ? b : { w, h }));
    };
    measure();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, []);

  useEffect(() => { onBox?.(box); }, [box, onBox]);

  return (
    <div ref={outer} className={`st-screen-wrap ${className}`}>
      <div ref={inner} className="st-screen-box" style={{ width: box.w, height: box.h }}>
        {children}
      </div>
    </div>
  );
}

export default memo(Monitor);
