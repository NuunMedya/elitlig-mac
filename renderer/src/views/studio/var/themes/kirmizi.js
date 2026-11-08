// VAR teması — KIRMIZI ALARM: grafit zemin, ince kırmızı ekran çerçevesi ve
// yavaş nabız; dolu kırmızı VAR rozeti. Dikkat çekici ama sade.
import { makeTheme } from "./engine";
import { varMonitorBadge } from "../kit";

export const VAR_RED = "#ff2d3d";

/** Ekran simgeli kırmızı VAR rozeti (eski çizim yolu drawVarBadge için). */
export const badge = (ctx, x, y, h, s = 1) => varMonitorBadge(ctx, x, y, h, { fill: "#ff3552", fill2: "#b00020", s });

export const { spec, background, panePath, pane, chrome } = makeTheme({
  bg: ["#0e0d0f", "#060607"],
  pools: [{ x: 0.5, y: 0.0, r: 0.6, color: VAR_RED, a: 0.1 }],
  texture: "lines",
  textureAlpha: 0.018,
  accent: VAR_RED,
  frame: { color: VAR_RED, alpha: 0.45, pulse: true, brackets: true },
  badge: "solid",
});
