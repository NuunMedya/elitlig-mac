// VAR teması — STÜDYO BEYAZ: açık gri zemin, siyah tipografi, kırmızı aksan,
// gölgeli pencereler. Gündüz yayınları ve açık renk grafiklerle uyumlu.
import { makeTheme } from "./engine";

export const { spec, background, panePath, pane, chrome } = makeTheme({
  bg: ["#f1f2f4", "#dfe2e7"],
  texture: "dots",
  textureAlpha: 0.05,
  vignette: 0,
  light: true,
  shadow: true,
  ink: "#0e1013",
  muted: "rgba(14,16,19,0.6)",
  faint: "rgba(14,16,19,0.3)",
  line: "rgba(14,16,19,0.14)",
  accent: "#e5242f",
  ok: "#119c5b",
  no: "#e5242f",
  panel: "rgba(255,255,255,0.9)",
  paneFill: "#e7e9ed",
  paneLine: "rgba(14,16,19,0.18)",
  card: "rgba(255,255,255,0.97)",
  paneRadius: 6,
  ticks: false,
  flash: 0,
});
