// Geçiş paneli: bölmenin biçimine göre yatay (geniş) ya da dikey (dar-uzun) düzen.
import React, { useLayoutEffect, useRef, useState } from "react";

export default function AutoTransition({ render }) {
  const ref = useRef(null);
  const [row, setRow] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const measure = () => setRow(el.clientWidth > el.clientHeight * 1.2);
    measure();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, []);
  return <div ref={ref} className="lw-autotr">{render(row ? "row" : "column")}</div>;
}
