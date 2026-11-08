// VAR teması — MİNİMAL PRO: grafit zemin, yalnız ince çizgiler, beyaz vurgu,
// çerçeveli (dolgusuz) rozet. En sakin tema.
import { makeTheme } from "./engine";

export const { spec, background, panePath, pane, chrome } = makeTheme({
  bg: ["#131416", "#0b0c0d"],
  texture: "dots",
  textureAlpha: 0.03,
  vignette: 0.3,
  accent: "#f5f6f7",
  accentInk: "#0b0c0d",
  ok: "#4ade80",
  no: "#f87171",
  line: "rgba(255,255,255,0.12)",
  paneLine: "rgba(255,255,255,0.16)",
  badge: "outline",
  ticks: false,
  paneRadius: 6,
  flash: 0.06,
});
