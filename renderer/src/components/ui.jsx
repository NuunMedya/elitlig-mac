// Ortak arayüz parçaları: simgeler, pencere (modal), bildirim balonu, boş durum,
// onay kutusu, sekmeli seçici.
import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cleanMenuItems, menuPosition } from "../lib/menuUtils";

/* ------------------------------ platform / tuşlar ------------------------------ */
/** Mac mi? (önizlemede/testte köprü yoksa Mac sayılır.) */
export const isMac = () => {
  try { return (window.elitlig?.platform || "darwin") === "darwin"; } catch { return true; }
};
const MOD_NAMES = { "⌃": "Ctrl", "⌘": "Ctrl", "⌥": "Alt", "⇧": "Shift" };
const MOD_ORDER = ["Ctrl", "Alt", "Shift"];
/**
 * Kısayol metnini platforma çevirir: Mac'te olduğu gibi (⇧⌘M), Windows/Linux'ta
 * "Ctrl+Shift+M". Metnin geri kalanı (açıklamalar) değişmez.
 */
export function keyLabel(text, mac = isMac()) {
  if (mac || typeof text !== "string") return text;
  return text.replace(/[⌃⌘⌥⇧]+/g, (run) => {
    const mods = new Set([...run].map((c) => MOD_NAMES[c]));
    return `${MOD_ORDER.filter((m) => mods.has(m)).join("+")}+`;
  }).replace(/\+↩/g, "+Enter");
}

/* --------------------------------- simgeler --------------------------------- */
// 24×24, çizgi simgeler (lucide benzeri, elle çizildi).
const PATHS = {
  sun: "M12 4V2M12 22v-2M4.93 4.93 3.51 3.51M20.49 20.49l-1.42-1.42M4 12H2M22 12h-2M4.93 19.07l-1.42 1.42M20.49 3.51l-1.42 1.42M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z",
  check: "M20 6 9 17l-5-5",
  checkSquare: "M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11",
  calendar: "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z",
  note: "M15.5 3H5a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h14a2 2 0 0 0 2-2V8.5L15.5 3zM15 3v6h6",
  receipt: "M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1zM8 8h8M8 12h8M8 16h5",
  grid: "M3 3h18v18H3zM3 9h18M3 15h18M9 3v18M15 3v18",
  users: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  calculator: "M6 2h12a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM8 6h8v4H8zM8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01",
  timer: "M10 2h4M12 14l3-3M12 22a8 8 0 1 0 0-16 8 8 0 0 0 0 16z",
  plus: "M12 5v14M5 12h14",
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35",
  x: "M18 6 6 18M6 6l12 12",
  trash: "M3 6h18M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2",
  pin: "M12 17v5M9 10.76V6h6v4.76l2 3.24H7l2-3.24zM8 2h8",
  archive: "M21 8v13H3V8M1 3h22v5H1zM10 12h4",
  chevronLeft: "M15 18l-6-6 6-6",
  chevronRight: "M9 18l6-6-6-6",
  chevronDown: "M6 9l6 6 6-6",
  chevronUp: "M18 15l-6-6-6 6",
  more: "M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM19 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM5 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z",
  download: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3",
  upload: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12",
  printer: "M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z",
  phone: "M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z",
  mail: "M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM22 6l-10 7L2 6",
  message: "M21 11.5a8.4 8.4 0 0 1-9 8.4 8.6 8.6 0 0 1-3.8-.9L3 21l1.9-5.7A8.4 8.4 0 0 1 12.5 3a8.5 8.5 0 0 1 8.5 8.5z",
  star: "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z",
  refresh: "M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15",
  cloudOff: "M22.61 16.95A5 5 0 0 0 18 10h-1.26a8 8 0 0 0-7.05-6M5 5a8 8 0 0 0 4 15h9a5 5 0 0 0 1.7-.3M1 1l22 22",
  cloud: "M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z",
  play: "M6 3l14 9-14 9V3z",
  pause: "M6 4h4v16H6zM14 4h4v16h-4z",
  skip: "M5 4l10 8-10 8V4zM19 5v14",
  rotate: "M1 4v6h6M3.51 15a9 9 0 1 0 2.13-9.36L1 10",
  flag: "M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7",
  link: "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71",
  external: "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3",
  user: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  logout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
  board: "M3 3h7v18H3zM14 3h7v11h-7z",
  list: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  tag: "M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82zM7 7h.01",
  palette: "M12 22a10 10 0 1 1 10-10c0 2.76-2.24 4-5 4h-1.5a1.5 1.5 0 0 0-1 2.6A1.5 1.5 0 0 1 12 22zM7.5 10.5h.01M10.5 7.5h.01M15.5 7.5h.01M17.5 11.5h.01",
  map: "M12 22s7-6.1 7-12a7 7 0 1 0-14 0c0 5.9 7 12 7 12zM12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
  clock: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2",
  bold: "M6 4h8a4 4 0 0 1 0 8H6zM6 12h9a4 4 0 0 1 0 8H6z",
  italic: "M19 4h-9M14 20H5M15 4 9 20",
  underline: "M6 3v7a6 6 0 0 0 12 0V3M4 21h16",
  alignLeft: "M17 10H3M21 6H3M21 14H3M17 18H3",
  alignCenter: "M18 10H6M21 6H3M21 14H3M18 18H6",
  alignRight: "M21 10H7M21 6H3M21 14H3M21 18H7",
  share: "M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98",
  copy: "M20 9h-9a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2zM5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1",
  undo: "M3 7v6h6M21 17a9 9 0 0 0-15-6.7L3 13",
  redo: "M21 7v6h-6M3 17a9 9 0 0 1 15-6.7L21 13",
  filter: "M22 3H2l8 9.46V19l4 2v-8.54L22 3z",
  zap: "M13 2L3 14h9l-1 8 10-12h-9l1-8z",
  lock: "M5 11h14v11H5zM7 11V7a5 5 0 0 1 10 0v4",
  sliders: "M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6",
  trend: "M23 6l-9.5 9.5-5-5L1 18M17 6h6v6",
  wallet: "M21 12V7H5a2 2 0 0 1 0-4h14v4M3 5v14a2 2 0 0 0 2 2h16v-5M18 12a2 2 0 0 0 0 4h4v-4z",
  ball: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 7l4.5 3.3-1.7 5.2H9.2l-1.7-5.2L12 7z",
  bank: "M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11M8 14v3M12 14v3M16 14v3",
  arrows: "M7 16V4M3 8l4-4 4 4M17 8v12M21 16l-4 4-4-4",
  swap: "M16 3l4 4-4 4M20 7H4M8 21l-4-4 4-4M4 17h16",
  globe: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z",
  layers: "M12 2 2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5",
  inbox: "M22 12h-6l-2 3h-4l-2-3H2M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z",
  eye: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  music: "M9 18V5l12-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM21 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z",
  video: "M23 7l-7 5 7 5V7zM1 5h15v14H1z",
  award: "M12 15a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM8.21 13.89 7 23l5-3 5 3-1.21-9.12",
  shirt: "M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z",
  team: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  percent: "M19 5 5 19M6.5 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM17.5 20a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  target: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
  bell: "M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0",
  play2: "M5 3l14 9-14 9V3z",
  sparkles: "M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4L12 3zM19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15z",
  folder: "M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z",
  trophy: "M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22M18 2H6v7a6 6 0 0 0 12 0V2z",
  handshake: "M11 17l2 2a1 1 0 1 0 3-3M14 14l2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4M21 3l1 11h-2M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3M3 4h8",
  grip: "M9 6h.01M9 12h.01M9 18h.01M15 6h.01M15 12h.01M15 18h.01",
  help: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01",
  briefcase: "M20 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2zM16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16",
  activity: "M22 12h-4l-3 9L9 3l-3 9H2",
  circle: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z",
  alert: "M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01",
  overview: "M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z",
  command: "M18 3a3 3 0 0 0-3 3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 0 0 0-6z",
  // Mesajlar
  send: "M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z",
  mic: "M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3zM19 10v2a7 7 0 0 1-14 0v-2M12 19v3M8 22h8",
  paperclip: "M21.44 11.05 12.25 20.24a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48",
  smile: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01",
  image: "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM21 15l-5-5L5 21",
  file: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8",
  reply: "M9 17 4 12l5-5M20 18v-2a4 4 0 0 0-4-4H4",
  forward: "M15 17l5-5-5-5M4 18v-2a4 4 0 0 1 4-4h12",
  checks: "M1.5 12.5l4.5 4.5L16 7M10 16.5l.5.5L22.5 5",
  bellOff: "M13.73 21a2 2 0 0 1-3.46 0M18.63 13A17.9 17.9 0 0 1 18 8M6.26 6.26A5.9 5.9 0 0 0 6 8c0 7-3 9-3 9h14M18 8a6 6 0 0 0-9.33-5M1 1l22 22",
  ban: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM4.93 4.93l14.14 14.14",
  info: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01",
  pencil: "M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z",
  userPlus: "M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M8.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM20 8v6M23 11h-6",
  poll: "M3 3v18h18M7 16v-4M12 16V8M17 16v-7",
  arrowDown: "M12 5v14M19 12l-7 7-7-7",
  camera: "M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  stop: "M6 6h12v12H6z",
  shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
  // Yayın Stüdyosu
  broadcast: "M4.93 19.07a10 10 0 0 1 0-14.14M19.07 4.93a10 10 0 0 1 0 14.14M7.76 16.24a6 6 0 0 1 0-8.48M16.24 7.76a6 6 0 0 1 0 8.48M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
  micOff: "M1 1l22 22M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V5a3 3 0 0 0-5.94-.6M17 16.95A7 7 0 0 1 5 12v-2M19 10v2a7 7 0 0 1-.11 1.23M12 19v3M8 22h8",
  volume: "M11 5L6 9H2v6h4l5 4V5zM15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14",
  volumeX: "M11 5L6 9H2v6h4l5 4V5zM23 9l-6 6M17 9l6 6",
  repeat: "M17 1l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3",
  // Ekipman
  box: "M21 8 12 3 3 8v8l9 5 9-5V8zM3 8l9 5 9-5M12 13v8",
  wrench: "M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z",
  barcode: "M3 5v14M7 5v14M10 5v14M14 5v14M17 5v14M21 5v14",
};

// Sunucudaki şablonların (web) simge adları.
const ALIASES = { futbol: "ball", "futbol-ball": "ball", soccer: "ball" };
export function Icon({ name, size = 16, className = "", strokeWidth = 1.8, title }) {
  const d = PATHS[name] || PATHS[ALIASES[name]] || PATHS.more;
  return (
    <svg className={`ic ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden={title ? undefined : true} role={title ? "img" : undefined}>
      {title && <title>{title}</title>}
      <path d={d} />
    </svg>
  );
}

/* ------------------------------ bildirim balonu ------------------------------ */
const ToastContext = createContext(() => {});
const TOAST_ICONS = { success: "check", error: "alert", warn: "alert", info: "info" };
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((message, { tone = "info", action, timeout = 3500 } = {}) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((list) => [...list.slice(-3), { id, message, tone, action }]);
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), timeout);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast--${t.tone}`} role={t.tone === "error" ? "alert" : undefined}>
            {TOAST_ICONS[t.tone] && <Icon name={TOAST_ICONS[t.tone]} size={15} className="toast__icon" />}
            <span>{t.message}</span>
            {t.action && <button type="button" className="toast__action" onClick={() => { t.action.run(); setToasts((l) => l.filter((x) => x.id !== t.id)); }}>{t.action.label}</button>}
            <button type="button" className="toast__close" aria-label="Bildirimi kapat" onClick={() => setToasts((l) => l.filter((x) => x.id !== t.id))}><Icon name="x" size={13} /></button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/** İstek sonucunu kullanıcıya bildirir; başarıda true döner. */
export function useResult() {
  const toast = useToast();
  return useCallback((res, okMessage) => {
    if (!res?.ok) {
      toast(res?.error?.message || "İşlem yapılamadı.", { tone: "error", timeout: 5000 });
      return false;
    }
    if (res.queued) toast("Çevrimdışısınız: değişiklik bağlantı gelince eşitlenecek.", { tone: "warn" });
    else if (okMessage) toast(okMessage, { tone: "success" });
    return true;
  }, [toast]);
}

/* ---------------------------------- modal ---------------------------------- */
// Açık pencerelerin sırası: Escape yalnız en üsttekini kapatır (iç içe pencereler).
const modalStack = [];
/** Açık pencere sayısı: üstüne açılan katmanlar (yan panel) z-index'i buna göre seçer. */
export const openModalCount = () => modalStack.length;
const FOCUSABLE = 'a[href], button:not(:disabled), input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';
let modalSeq = 0;
export function Modal({ title, onClose, children, footer, width = 560, className = "" }) {
  const ref = useRef(null);
  const idRef = useRef(null);
  if (!idRef.current) idRef.current = Symbol("modal");
  const [titleId] = useState(() => `modal-title-${++modalSeq}`);
  // onClose her çizimde yeni bir işlev olabilir: etkiler ona bağlanmaz (aksi hâlde
  // üst bileşen her yeniden çizildiğinde odak ilk alana zıplar, açık <select> kapanır).
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  // İç içe pencereler (ve aradaki yan paneller) sırayla üst üste çizilir.
  const [depth] = useState(() => modalStack.length);
  useEffect(() => {
    const id = idRef.current;
    modalStack.push(id);
    return () => { const i = modalStack.lastIndexOf(id); if (i >= 0) modalStack.splice(i, 1); };
  }, []);
  // Yalnız açılışta: ilk alana odaklan; kapanınca odağı açan öğeye geri ver.
  useEffect(() => {
    const opener = document.activeElement;
    const box = ref.current;
    if (box && !box.contains(document.activeElement)) {
      const first = box.querySelector('.modal__body input:not(:disabled):not([type="hidden"]), .modal__body textarea:not(:disabled), .modal__body select:not(:disabled), button.btn--primary:not(:disabled)');
      (first || box).focus({ preventScroll: true });
    }
    return () => {
      if (opener && opener !== document.body && opener.isConnected && typeof opener.focus === "function") opener.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    const onKey = (e) => {
      const top = modalStack[modalStack.length - 1] === idRef.current;
      if (e.key === "Escape") {
        // Açık bir menü varsa Escape önce menüyü kapatır; iç içe pencerede yalnız üstteki kapanır.
        if (document.querySelector(".menu__list") || !top) return;
        e.stopPropagation();
        onCloseRef.current?.();
        return;
      }
      // Tab pencerenin içinde döner (arkadaki sayfaya kaçmaz).
      if (e.key === "Tab" && top && ref.current) {
        const items = [...ref.current.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null || el === document.activeElement);
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        const inside = ref.current.contains(document.activeElement);
        if (e.shiftKey && (document.activeElement === first || !inside)) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && (document.activeElement === last || !inside)) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);
  return (
    <div className="modal-backdrop" style={depth ? { zIndex: 50 + depth * 2 } : undefined} onMouseDown={(e) => { if (e.target === e.currentTarget) onCloseRef.current?.(); }}>
      <div className={`modal ${className}`} style={{ width }} ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <header className="modal__head">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="icon-btn" onClick={() => onCloseRef.current?.()} aria-label="Kapat" title="Kapat (esc)"><Icon name="x" /></button>
        </header>
        <div className="modal__body">{children}</div>
        {footer && <footer className="modal__foot">{footer}</footer>}
      </div>
    </div>
  );
}

/** Onay penceresi: confirm({ title, message, danger }) → Promise<boolean> */
const ConfirmContext = createContext(null);
export function ConfirmProvider({ children }) {
  const [ask, setAsk] = useState(null);
  const confirm = useCallback((opts) => new Promise((resolve) => setAsk({ ...opts, resolve })), []);
  const close = (value) => { ask?.resolve(value); setAsk(null); };
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {ask && (
        <Modal title={ask.title || "Emin misiniz?"} onClose={() => close(false)} width={420}
          footer={<>
            <button type="button" className="btn" onClick={() => close(false)}>Vazgeç</button>
            <button type="button" className={`btn btn--primary ${ask.danger ? "btn--danger" : ""}`} onClick={() => close(true)}>{ask.confirmLabel || "Tamam"}</button>
          </>}>
          <p className="muted">{ask.message}</p>
        </Modal>
      )}
    </ConfirmContext.Provider>
  );
}
export const useConfirm = () => useContext(ConfirmContext);

/* ------------------------------- küçük parçalar ------------------------------- */
export const Empty = ({ icon = "note", title, text, action }) => (
  <div className="empty">
    <span className="empty__icon"><Icon name={icon} size={28} /></span>
    <strong>{title}</strong>
    {text && <p>{keyLabel(text)}</p>}
    {action}
  </div>
);

export const Spinner = ({ label = "Yükleniyor…" }) => <div className="spinner" role="status"><span className="spinner__dot" />{label}</div>;

export function Segmented({ value, onChange, options, size = "md", ariaLabel }) {
  return (
    <div className={`seg seg--${size}`} role="tablist" aria-label={ariaLabel}>
      {options.map((opt) => (
        <button key={opt.value} type="button" role="tab" aria-selected={value === opt.value} className={value === opt.value ? "is-active" : ""} onClick={() => onChange(opt.value)} title={opt.title}>
          {opt.icon && <Icon name={opt.icon} size={14} />}{opt.label}
          {opt.count != null && <span className="seg__count">{opt.count}</span>}
        </button>
      ))}
    </div>
  );
}

export const Field = ({ label, children, hint, className = "" }) => (
  <label className={`field ${className}`}>
    <span className="field__label">{label}</span>
    {children}
    {hint && <span className="field__hint">{hint}</span>}
  </label>
);

export const OfflineNote = ({ offline, savedAt }) => (offline ? (
  <div className="offline-note"><Icon name="cloudOff" size={14} /> Çevrimdışı · {savedAt ? `son eşitleme ${new Date(savedAt).toLocaleString("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : "önbellekteki veri"}</div>
) : null);

export const ErrorNote = ({ error, onRetry }) => (error ? (
  <div className="error-note">
    <span>{error.message || "Veri alınamadı."}</span>
    {onRetry && <button type="button" className="btn btn--sm" onClick={() => onRetry()}>Yeniden dene</button>}
  </div>
) : null);

/** Görünüm başlığı: büyük başlık + sağda araçlar. */
export const ViewHeader = ({ title, subtitle, icon, children }) => (
  <header className="view-head">
    {icon && <span className="view-head__badge"><Icon name={icon} size={22} strokeWidth={2} /></span>}
    <div className="view-head__text">
      <h1>{title}</h1>
      {subtitle && <p>{subtitle}</p>}
    </div>
    <div className="view-head__tools">{children}</div>
  </header>
);

/**
 * Açılır menü (… düğmesi). items: [{ label, icon, onClick, danger, disabled, hint }] | "-" | falsy
 *
 * Liste document.body'ye (portal) sabit konumla çizilir: kartların ve
 * tabloların overflow:hidden kenarlarında kesilmez. Ekranın altına / sağına
 * sığmazsa yukarı / sola açılır. Dışarı tıklama, Escape, kaydırma ve pencere
 * boyutu değişince kapanır; ↑ ↓ Home End ile gezilir.
 */
export function MenuButton({ items, label = "Diğer", icon = "more", text, className = "", align = "end", size = 16 }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);
  const listRef = useRef(null);
  const list = cleanMenuItems(items);

  const close = useCallback((refocus = false) => {
    setOpen(false);
    setPos(null);
    if (refocus) btnRef.current?.focus();
  }, []);

  // Açılınca önce görünmez çizilir, ölçülür ve konumlanır (titreme olmaz).
  useLayoutEffect(() => {
    if (!open || !btnRef.current || !listRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const m = listRef.current.getBoundingClientRect();
    const next = menuPosition({ top: r.top, left: r.left, right: r.right, bottom: r.bottom }, { width: m.width, height: m.height }, { width: window.innerWidth, height: window.innerHeight }, { align });
    const cs = getComputedStyle(btnRef.current);
    setPos({ ...next, tool: cs.getPropertyValue("--tool").trim(), tool2: cs.getPropertyValue("--tool-2").trim() });
  }, [open, align, list.length]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (!listRef.current?.contains(e.target) && !btnRef.current?.contains(e.target)) close(); };
    // Açılışın kendisinin tetiklediği kaydırmalar (odak, düzen) menüyü kapatmasın.
    const openedAt = Date.now();
    const onScroll = (e) => { if (Date.now() - openedAt > 150 && !listRef.current?.contains(e.target)) close(); };
    const onKey = (e) => {
      if (e.key === "Escape") { e.stopPropagation(); e.preventDefault(); close(true); return; }
      if (e.key === "Tab") { close(); return; }
      const buttons = [...(listRef.current?.querySelectorAll("button:not(:disabled)") || [])];
      if (!buttons.length) return;
      const i = buttons.indexOf(document.activeElement);
      let next = null;
      if (e.key === "ArrowDown") next = buttons[(i + 1) % buttons.length];
      else if (e.key === "ArrowUp") next = buttons[(i - 1 + buttons.length) % buttons.length];
      else if (e.key === "Home") next = buttons[0];
      else if (e.key === "End") next = buttons[buttons.length - 1];
      if (next) { e.preventDefault(); next.focus(); }
    };
    const onResize = () => close();
    window.addEventListener("mousedown", onDown, true);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", onResize);
    window.addEventListener("blur", onResize);
    return () => {
      window.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("blur", onResize);
    };
  }, [open, close]);

  useEffect(() => { if (open && pos) listRef.current?.querySelector("button:not(:disabled)")?.focus({ preventScroll: true }); }, [open, pos]);

  const toggle = (e) => { e.stopPropagation(); if (open) close(); else setOpen(true); };
  const onTriggerKey = (e) => { if (e.key === "ArrowDown" && !open) { e.preventDefault(); setOpen(true); } };

  return (
    <span className={`menu ${className}`} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <button ref={btnRef} type="button" className={text ? "btn btn--sm menu__trigger" : "icon-btn"} aria-label={label} title={label} aria-haspopup="menu" aria-expanded={open} onClick={toggle} onKeyDown={onTriggerKey}>
        <Icon name={icon} size={size} />{text && <span>{text}</span>}{text && <Icon name="chevronDown" size={12} />}
      </button>
      {open && createPortal(
        <div ref={listRef} className={`menu__list ${pos?.placement === "top" ? "is-up" : ""}`} role="menu" aria-label={label}
          style={pos ? { top: pos.top, left: pos.left, maxHeight: pos.maxHeight, ...(pos.tool ? { "--tool": pos.tool, "--tool-2": pos.tool2 } : {}) } : { top: 0, left: 0, visibility: "hidden" }}
          onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
          {list.map((item, i) => (item === "-" ? <hr key={`hr${i}`} /> : (
            <button key={`${item.label}${i}`} type="button" role="menuitem" disabled={item.disabled} title={item.hint} className={item.danger ? "is-danger" : ""} onClick={() => { close(true); item.onClick?.(); }}>
              {item.icon && <Icon name={item.icon} size={14} />}<span>{item.label}</span>
            </button>
          )))}
        </div>,
        document.body,
      )}
    </span>
  );
}

export const Kbd = ({ children }) => <kbd className="kbd">{keyLabel(children)}</kbd>;
