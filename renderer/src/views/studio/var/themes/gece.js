// VAR teması — GECE MAVİSİ: derin lacivert, buz mavisi ince çizgiler, çerçeveli
// rozet; ekran kenarında silik ince çerçeve. Sakin, soğuk, net.
import { makeTheme } from "./engine";

export const { spec, background, panePath, pane, chrome } = makeTheme({
  bg: ["#0a1020", "#03060d"],
  pools: [{ x: 0.5, y: 0.0, r: 0.7, color: "#3b6fd8", a: 0.14 }],
  ink: "#eaf1ff",
  muted: "rgba(234,241,255,0.6)",
  faint: "rgba(234,241,255,0.28)",
  line: "rgba(138,180,255,0.18)",
  accent: "#8ab4ff",
  accentInk: "#03060d",
  ok: "#5eead4",
  no: "#fb7185",
  panel: "rgba(6,11,22,0.82)",
  paneFill: "#060b16",
  paneLine: "rgba(138,180,255,0.26)",
  badge: "outline",
  frame: { color: "#8ab4ff", alpha: 0.18, pulse: false, brackets: false },
  paneRadius: 4,
});
