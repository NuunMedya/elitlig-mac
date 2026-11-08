// VAR teması — STADYUM: lacivert yayın görünümü, altın vurgu, dolu üst bant,
// ince çizgiler. Ciddi TV-spor karakteri, süssüz.
import { makeTheme } from "./engine";

export const { spec, background, panePath, pane, chrome } = makeTheme({
  bg: ["#0b1527", "#050a14"],
  pools: [{ x: 0.2, y: 0.15, r: 0.55, color: "#2b5aa8", a: 0.16 }, { x: 0.85, y: 0.9, r: 0.5, color: "#e3b65c", a: 0.06 }],
  texture: "dots",
  textureAlpha: 0.035,
  ink: "#f4f1ea",
  muted: "rgba(244,241,234,0.62)",
  faint: "rgba(244,241,234,0.3)",
  line: "rgba(227,182,92,0.22)",
  accent: "#e3b65c",
  accentInk: "#0b1527",
  ok: "#3fd08a",
  no: "#ff5468",
  panel: "rgba(8,16,30,0.82)",
  paneFill: "#08111f",
  paneLine: "rgba(227,182,92,0.35)",
  headerFill: { fill: "rgba(255,255,255,0.045)", border: "rgba(227,182,92,0.28)" },
  card: "rgba(9,18,34,0.94)",
  paneRadius: 3,
});
