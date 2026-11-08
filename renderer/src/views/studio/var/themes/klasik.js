// VAR teması — KLASİK TV: siyah sahne, BEYAZ üst bant (koyu yazı), kırmızı
// aksan; beyaz karar kartı. Geleneksel yayın grafiği, sade çizgilerle.
import { makeTheme } from "./engine";

export const { spec, background, panePath, pane, chrome } = makeTheme({
  bg: ["#111111", "#080808"],
  vignette: 0.35,
  accent: "#e5242f",
  ok: "#1fb86a",
  no: "#e5242f",
  line: "rgba(255,255,255,0.16)",
  headerFill: { fill: "#f4f4f2", ink: "#111111", muted: "rgba(17,17,17,0.6)", faint: "rgba(17,17,17,0.3)", line: "rgba(17,17,17,0.18)", lightBg: true },
  card: "rgba(244,244,242,0.97)",
  cardInk: "#111111",
  cardMuted: "rgba(17,17,17,0.6)",
  cardLine: "rgba(17,17,17,0.18)",
  paneRadius: 0,
  ticks: false,
  paneLine: "rgba(255,255,255,0.5)",
});
