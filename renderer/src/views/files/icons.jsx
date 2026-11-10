// Dosya Araçları ve raflar için ek simgeler (ortak ui.jsx'teki Icon ile aynı çizgi
// stili). Burada olmayan adlar ortak simge kümesinden gelir.
import React from "react";
import { Icon } from "../../components/ui";

const EXTRA = {
  maximize: "M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3",
  minimize: "M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3",
  crop: "M6 2v14a2 2 0 0 0 2 2h14M18 22V8a2 2 0 0 0-2-2H2",
  frame: "M3 3h18v18H3zM7 7h10v10H7z",
  eyeOff: "M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19M14.12 14.12a3 3 0 1 1-4.24-4.24M1 1l22 22",
  qr: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h3v3h-3zM20 14v.01M14 20h.01M17 17h4v4h-4M6 6h1v1H6zM17 6h1v1h-1zM6 17h1v1H6z",
  scissors: "M6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM20 4 8.12 15.88M14.47 14.48 20 20M8.12 8.12 12 12",
  fast: "M13 19l9-7-9-7v14zM2 19l9-7-9-7v14z",
  merge: "M8 6l4-4 4 4M12 2v10.3a4 4 0 0 1-1.17 2.87L4 22M20 22l-5-5",
  split: "M16 3h5v5M8 3H3v5M12 22v-8.3a4 4 0 0 0-1.17-2.87L3 3M21 3l-7.83 7.83A4 4 0 0 0 12 13.7",
  film: "M2 2h20v20H2zM7 2v20M17 2v20M2 12h20M2 7h5M2 17h5M17 17h5M17 7h5",
  type: "M4 7V4h16v3M9 20h6M12 4v16",
  archive: "M21 8v13H3V8M1 3h22v5H1zM10 12h4",
  shelf: "M3 5h18M3 12h18M3 19h18M6 5v-2M10 12v-2M16 19v-2",
  highlighter: "M9 11l-6 6v3h9l3-3M22 12l-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4",
  square: "M4 4h16v16H4z",
  ellipse: "M12 19c5 0 9-3.13 9-7s-4-7-9-7-9 3.13-9 7 4 7 9 7z",
  arrowUpRight: "M7 17L17 7M8 7h9v9",
  line: "M5 19L19 5",
  cursor: "M4 4l7.07 17 2.51-7.39L21 11.07z",
  droplet: "M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z",
  zoomIn: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35M11 8v6M8 11h6",
  zoomOut: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35M8 11h6",
  flipH: "M12 3v18M16 7l4 5-4 5V7zM8 7 4 12l4 5V7z",
  flipV: "M3 12h18M7 8l5-4 5 4H7zM7 16l5 4 5-4H7z",
  rotateCw: "M23 4v6h-6M20.49 15a9 9 0 1 1-2.12-9.36L23 10",
  screenshot: "M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M8 8h8v8H8z",
  wand: "M15 4V2M15 16v-2M8 9h2M20 9h2M17.8 11.8 19 13M15 9h.01M17.8 6.2 19 5M3 21l9-9M12.2 6.2 11 5",
  wheel: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v6M12 16v6M2 12h6M16 12h6",
  clipboard: "M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 2h6v4H9z",
  hash: "M4 9h16M4 15h16M10 3 8 21M16 3l-2 18",
};

/** Simge: önce ek küme, yoksa ortak Icon. */
export function FIcon({ name, size = 16, className = "", strokeWidth = 1.8, title }) {
  const d = EXTRA[name];
  if (!d) return <Icon name={name} size={size} className={className} strokeWidth={strokeWidth} title={title} />;
  return (
    <svg className={`ic ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden={title ? undefined : true} role={title ? "img" : undefined}>
      {title && <title>{title}</title>}
      <path d={d} />
    </svg>
  );
}

export const hasExtraIcon = (name) => Boolean(EXTRA[name]);
