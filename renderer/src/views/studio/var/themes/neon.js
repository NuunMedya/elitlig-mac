// VAR teması — NEON ARENA: koyu mor zemin, camgöbeği ince çizgiler ve hafif
// parıltı, silik ızgara. Gösterişsiz neon.
import { makeTheme } from "./engine";

export const { spec, background, panePath, pane, chrome } = makeTheme({
  bg: ["#0a0716", "#04030a"],
  pools: [{ x: 0.15, y: 0.1, r: 0.5, color: "#7c3aed", a: 0.18 }, { x: 0.9, y: 0.95, r: 0.5, color: "#3ee6ff", a: 0.1 }],
  texture: "grid",
  textureAlpha: 0.05,
  ink: "#eef7ff",
  muted: "rgba(238,247,255,0.6)",
  faint: "rgba(238,247,255,0.28)",
  line: "rgba(62,230,255,0.2)",
  accent: "#3ee6ff",
  accentInk: "#04030a",
  ok: "#4dffa8",
  no: "#ff4f8b",
  panel: "rgba(8,6,20,0.8)",
  paneFill: "#07051a",
  badge: "outline",
  glow: 0.8,
  frame: { color: "#3ee6ff", alpha: 0.25, pulse: false, brackets: true },
  paneRadius: 4,
});
