// Tablolar arayüzü: küçük yapı taşları — simgeler, açılır pencere (popover),
// renk seçici, bağlam menüsü.
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/* ---------------------------------- simgeler ---------------------------------- */

const P = {
  paste: "M9 4h6v3H9zM8 5H6a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-2M9 12h6M9 16h4",
  cut: "M6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM20 4 8.12 15.88M14.47 14.48 20 20M8.12 8.12 12 12",
  copy: "M9 9h11v11H9zM5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1",
  painter: "M4 3h13v5H4zM17 5h3v6h-8v3M11 14h2v7h-2z",
  bold: "M7 4h6a4 4 0 0 1 0 8H7zM7 12h7a4 4 0 0 1 0 8H7z",
  italic: "M10 4h8M6 20h8M14 4 10 20",
  underline: "M6 4v7a6 6 0 0 0 12 0V4M5 21h14",
  strike: "M5 12h14M16 6.5C15 5 13.6 4.5 12 4.5c-2.5 0-4.2 1.3-4.2 3.2 0 1.4.9 2.4 3 3.1M8 17.5c1 1.4 2.4 2 4.2 2 2.6 0 4.3-1.3 4.3-3.3 0-.9-.3-1.6-.9-2.2",
  textColor: "M6 16 11 4h2l5 12M8 12h8",
  fillColor: "m19 11-8-8-8.5 8.5a1.5 1.5 0 0 0 0 2.1l5.9 5.9a1.5 1.5 0 0 0 2.1 0zM5 2l5 5M2.5 12h16M21 15s1.5 2 1.5 3a1.5 1.5 0 0 1-3 0c0-1 1.5-3 1.5-3z",
  borderAll: "M3 3h18v18H3zM3 12h18M12 3v18",
  borderOuter: "M3 3h18v18H3z",
  borderNone: "M3 3h2M8 3h2M14 3h2M19 3h2M3 21h2M8 21h2M14 21h2M19 21h2M3 8v2M3 14v2M21 8v2M21 14v2M12 8v2M12 14v2M8 12h2M14 12h2",
  borderBottom: "M3 21h18M3 3h2M8 3h2M14 3h2M19 3h2M3 8v2M3 14v2M21 8v2M21 14v2",
  borderTop: "M3 3h18M3 21h2M8 21h2M14 21h2M19 21h2M3 8v2M3 14v2M21 8v2M21 14v2",
  borderLeft: "M3 3v18M19 3h2M8 3h2M14 3h2M19 21h2M8 21h2M14 21h2M21 8v2M21 14v2",
  borderRight: "M21 3v18M3 3h2M8 3h2M14 3h2M3 21h2M8 21h2M14 21h2M3 8v2M3 14v2",
  borderInner: "M3 12h18M12 3v18M3 3h2M19 3h2M3 21h2M19 21h2",
  alignLeft: "M4 6h16M4 10h10M4 14h16M4 18h10",
  alignCenter: "M4 6h16M7 10h10M4 14h16M7 18h10",
  alignRight: "M4 6h16M10 10h10M4 14h16M10 18h10",
  alignTop: "M4 3h16M12 7v14M8 11l4-4 4 4",
  alignMiddle: "M4 12h16M12 3v6M12 15v6M9 6l3 3 3-3M9 18l3-3 3 3",
  alignBottom: "M4 21h16M12 3v14M8 13l4 4 4-4",
  wrap: "M3 6h18M3 12h15a3 3 0 0 1 0 6h-4M16 16l-2 2 2 2M3 18h6",
  merge: "M3 5h18v14H3zM7 12h10M9 10l-2 2 2 2M15 10l2 2-2 2",
  rotate: "M5 19 19 5M10 5h9v9",
  indentMore: "M4 5h16M10 10h10M10 14h10M4 19h16M4 9l3 3-3 3",
  indentLess: "M4 5h16M10 10h10M10 14h10M4 19h16M7 9l-3 3 3 3",
  percent: "M19 5 5 19M7 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
  sum: "M18 6V4H6l6 8-6 8h12v-2",
  sortAsc: "M4 6h7M4 12h5M4 18h3M17 4v16M13 16l4 4 4-4",
  sortDesc: "M4 6h3M4 12h5M4 18h7M17 4v16M13 16l4 4 4-4",
  filter: "M3 4h18l-7 9v6l-4 2v-8z",
  freeze: "M3 3h18v18H3zM3 9h18M9 3v18",
  zoomIn: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-4.3-4.3M8 11h6M11 8v6",
  zoomOut: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-4.3-4.3M8 11h6",
  insertRow: "M3 9h18v6H3zM12 2v5M9.5 4.5h5",
  deleteRow: "M3 9h18v6H3zM9 3.5l6 3M15 3.5l-6 3",
  insertCol: "M9 3h6v18H9zM2 12h5M4.5 9.5v5",
  deleteCol: "M9 3h6v18H9zM3 9l3 6M6 9l-3 6",
  find: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-4.3-4.3",
  eraser: "m7 21-4.3-4.3a1 1 0 0 1 0-1.4L13 5a1 1 0 0 1 1.4 0l5.6 5.6a1 1 0 0 1 0 1.4L11 21zM22 21H7M5 11l9 9",
  cond: "M3 3h8v8H3zM13 3h8v8h-8zM3 13h8v8H3zM15 15l4 4M19 15l-4 4",
  validate: "M4 4h16v6H4zM8 7h6M16 13l2 2 4-4M4 14h8M4 18h8",
  grid: "M3 3h18v18H3zM3 9h18M3 15h18M9 3v18M15 3v18",
  fx: "M10 4c-2 0-3 1-3 3v10c0 2-1 3-3 3M4 10h7M14 9l6 8M20 9l-6 8",
  decInc: "M3 17h1M7 7v10M7 7a3 3 0 0 1 3 3v4a3 3 0 0 1-6 0v-4a3 3 0 0 1 3-3zM15 9h6M18 6v6M13 17h1",
  decDec: "M3 17h1M8 7a3 3 0 0 1 3 3v4a3 3 0 0 1-6 0v-4a3 3 0 0 1 3-3zM15 12h6",
  thousands: "M3 16v1M7 8v9M11 8v9M15 8v9M19 8v9",
  chevronDown: "m6 9 6 6 6-6",
  chevronLeft: "m15 18-6-6 6-6",
  chevronRight: "m9 18 6-6-6-6",
  chevronFirst: "m17 18-6-6 6-6M7 6v12",
  chevronLast: "m7 18 6-6-6-6M17 6v12",
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  x: "M18 6 6 18M6 6l12 12",
  check: "M20 6 9 17l-5-5",
  eye: "M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  eyeOff: "M3 3l18 18M10.6 10.6A2 2 0 0 0 12 14a2 2 0 0 0 1.4-.6M9.9 4.2A10.6 10.6 0 0 1 12 4c6.4 0 10 8 10 8a17 17 0 0 1-2.8 3.8M6.6 6.6C3.9 8.4 2 12 2 12s3.6 8 10 8a9.9 9.9 0 0 0 5.4-1.6",
  rowHeight: "M12 3v18M8 7l4-4 4 4M8 17l4 4 4-4M3 3h18M3 21h18",
  colWidth: "M3 12h18M7 8l-4 4 4 4M17 8l4 4-4 4M3 3v18M21 3v18",
  sheet: "M4 3h16v18H4zM4 9h16M4 15h16M10 3v18",
  duplicate: "M8 8h12v12H8zM4 16V4h12",
  trash: "M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6",
  pencil: "M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z",
  arrowLeft: "M19 12H5M12 19l-7-7 7-7",
  arrowRight: "M5 12h14M12 5l7 7-7 7",
  tag: "M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8zM7 7h.01",
  clear: "M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3",
  undo: "M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3",
  redo: "m15 14 5-5-5-5M20 9H9a5 5 0 0 0 0 10h3",
  print: "M6 9V3h12v6M6 18H4v-7h16v7h-2M6 14h12v7H6z",
  upload: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12",
  download: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3",
  hash: "M4 9h16M4 15h16M10 3 8 21M16 3l-2 18",
  calendar: "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z",
  money: "M3 6h18v12H3zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 9v.01M18 15v.01",
  scale: "M3 3h6v18H3zM9 3h6v18H9zM15 3h6v18h-6z",
};

export function SIcon({ name, size = 16, className = "", strokeWidth = 1.8 }) {
  return (
    <svg className={`ic ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={P[name] || P.grid} />
    </svg>
  );
}

/* ---------------------------------- popover ---------------------------------- */

/**
 * Bir tetikleyiciye ya da noktaya bağlı açılır katman. anchor: DOMRect benzeri
 * { left, top, right, bottom } (istemci koordinatları). Dışarı tıklanınca ya
 * da Esc ile kapanır.
 */
export function Popover({ anchor, onClose, children, className = "", align = "start", width }) {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !anchor) return;
    const m = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = align === "end" ? anchor.right - m.width : anchor.left;
    left = Math.max(8, Math.min(left, vw - m.width - 8));
    let top = anchor.bottom + 4;
    if (top + m.height > vh - 8) top = anchor.top - m.height - 4 >= 8 ? anchor.top - m.height - 4 : Math.max(8, vh - m.height - 8);
    setPos({ left, top });
  }, [anchor?.left, anchor?.top, anchor?.right, anchor?.bottom, align]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    const t = setTimeout(() => window.addEventListener("pointerdown", onDown, true), 0);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", onClose);
    return () => { clearTimeout(t); window.removeEventListener("pointerdown", onDown, true); window.removeEventListener("keydown", onKey, true); window.removeEventListener("resize", onClose); };
  }, [onClose]);
  return createPortal(
    <div ref={ref} className={`sx-pop ${className}`} style={{ ...(pos || { left: -9999, top: 0 }), ...(width ? { width } : {}) }} onMouseDown={(e) => e.stopPropagation()}>
      {children}
    </div>,
    document.body,
  );
}

/** Menü öğeleri: { label, icon, hint, onClick, disabled, danger, checked } | "-" | { heading } */
export function MenuList({ items, onClose }) {
  const ref = useRef(null);
  useEffect(() => { ref.current?.querySelector("button:not(:disabled)")?.focus({ preventScroll: true }); }, []);
  const onKey = (e) => {
    const buttons = [...ref.current.querySelectorAll("button:not(:disabled)")];
    const i = buttons.indexOf(document.activeElement);
    if (e.key === "ArrowDown") { e.preventDefault(); buttons[(i + 1) % buttons.length]?.focus(); }
    if (e.key === "ArrowUp") { e.preventDefault(); buttons[(i - 1 + buttons.length) % buttons.length]?.focus(); }
  };
  return (
    <div className="sx-menu" role="menu" ref={ref} onKeyDown={onKey}>
      {items.filter(Boolean).map((it, i) => {
        if (it === "-") return <hr key={`h${i}`} />;
        if (it.heading) return <div key={`t${i}`} className="sx-menu__head">{it.heading}</div>;
        return (
          <button key={`${it.label}${i}`} type="button" role="menuitem" disabled={it.disabled} className={`${it.danger ? "is-danger" : ""} ${it.checked ? "is-checked" : ""}`}
            onClick={() => { onClose?.(); it.onClick?.(); }}>
            <span className="sx-menu__ic">{it.icon ? <SIcon name={it.icon} size={15} /> : it.checked ? <SIcon name="check" size={14} /> : null}</span>
            <span className="sx-menu__label">{it.label}</span>
            {it.hint && <kbd>{it.hint}</kbd>}
          </button>
        );
      })}
    </div>
  );
}

/** Tetikleyici düğme + açılır içerik. */
export function Drop({ label, icon, title, children, className = "", buttonClass = "", disabled, wide, menu, split, onMain, caret = true, active, mainStyle }) {
  const [anchor, setAnchor] = useState(null);
  const btn = useRef(null);
  const open = () => { const r = (split ? btn.current.parentElement : btn.current).getBoundingClientRect(); setAnchor({ left: r.left, top: r.top, right: r.right, bottom: r.bottom }); };
  const close = () => setAnchor(null);
  return (
    <span className={`sx-drop ${split ? "sx-drop--split" : ""} ${className}`}>
      {split && <button type="button" className={`sx-btn ${active ? "is-on" : ""} ${buttonClass}`} style={mainStyle} title={title} aria-label={title} disabled={disabled} onClick={onMain}>{icon && <SIcon name={icon} />}{label && <span>{label}</span>}</button>}
      <button ref={btn} type="button" className={`sx-btn ${split ? "sx-btn--caret" : ""} ${!split && active ? "is-on" : ""} ${buttonClass}`} title={title} disabled={disabled} aria-haspopup="menu" aria-expanded={Boolean(anchor)}
        onClick={() => (anchor ? close() : open())}>
        {!split && icon && <SIcon name={icon} />}{!split && label && <span>{label}</span>}{caret && <SIcon name="chevronDown" size={11} className="sx-caret" />}
      </button>
      {anchor && (
        <Popover anchor={anchor} onClose={close} className={wide ? "sx-pop--wide" : ""}>
          {menu ? <MenuList items={menu} onClose={close} /> : typeof children === "function" ? children(close) : children}
        </Popover>
      )}
    </span>
  );
}

/* -------------------------------- renk seçici -------------------------------- */

// Excel'in tema renkleri (üst satır) ve açık/koyu tonları, ardından standart renkler.
const THEME = ["#ffffff", "#000000", "#e7e6e6", "#44546a", "#4472c4", "#ed7d31", "#a5a5a5", "#ffc000", "#5b9bd5", "#70ad47"];
const TINTS = [0.8, 0.6, 0.4, -0.25, -0.5];
const STANDARD = ["#c00000", "#ff0000", "#ffc000", "#ffff00", "#92d050", "#00b050", "#00b0f0", "#0070c0", "#002060", "#7030a0"];
const tint = (hex, t) => {
  const n = parseInt(hex.slice(1), 16);
  return `#${[16, 8, 0].map((s) => { const v = (n >> s) & 255; return Math.round(t > 0 ? v + (255 - v) * t : v * (1 + t)).toString(16).padStart(2, "0"); }).join("")}`;
};
const RECENT_KEY = "sheets.recentColors";
const readRecent = () => { try { return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]").slice(0, 10); } catch { return []; } };

export function ColorGrid({ value, onPick, noneLabel = "Otomatik", onClose }) {
  const [recent, setRecent] = useState(readRecent);
  const pick = (c) => {
    if (c) {
      const next = [c, ...recent.filter((x) => x !== c)].slice(0, 10);
      setRecent(next);
      try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* yoksay */ }
    }
    onPick(c);
    onClose?.();
  };
  const sw = (c, key) => <button key={key || c} type="button" className={`sx-sw ${value === c ? "is-on" : ""}`} style={{ background: c }} title={c} onClick={() => pick(c)} />;
  return (
    <div className="sx-colors">
      <button type="button" className="sx-colors__none" onClick={() => pick(null)}><span className="sx-sw sx-sw--none" />{noneLabel}</button>
      <div className="sx-colors__label">Tema renkleri</div>
      <div className="sx-colors__row">{THEME.map((c) => sw(c))}</div>
      {TINTS.map((t) => <div key={t} className="sx-colors__row sx-colors__row--tight">{THEME.map((c) => sw(tint(c, t), `${c}${t}`))}</div>)}
      <div className="sx-colors__label">Standart renkler</div>
      <div className="sx-colors__row">{STANDARD.map((c) => sw(c))}</div>
      {recent.length > 0 && <><div className="sx-colors__label">Son kullanılanlar</div><div className="sx-colors__row">{recent.map((c) => sw(c, `r${c}`))}</div></>}
      <label className="sx-colors__custom">
        <input type="color" defaultValue={value || "#000000"} onChange={(e) => pick(e.target.value)} />
        Diğer renkler…
      </label>
    </div>
  );
}

/** Rengi gösteren bölünmüş düğme (yazı / dolgu rengi). */
export function ColorButton({ icon, title, color, lastColor, onApply, noneLabel, disabled }) {
  return (
    <Drop split onMain={() => onApply(lastColor)} icon={icon} title={title} disabled={disabled} className="sx-colorbtn" buttonClass="sx-colorbtn__main" mainStyle={{ "--sw": lastColor || "transparent" }}>
      {(close) => <ColorGrid value={color} onPick={onApply} noneLabel={noneLabel} onClose={close} />}
    </Drop>
  );
}
