// VAR temalarının çizim kodu (anahtarlar lib/studio/varThemes.js ile aynı).
// Her tema: background(ctx, S) · pane(ctx, S, pane, info, i) · chrome(ctx, S).
import * as kirmizi from "./kirmizi";
import * as stadyum from "./stadyum";
import * as minimal from "./minimal";
import * as neon from "./neon";
import * as klasik from "./klasik";

export const VAR_THEME_DRAW = { kirmizi, stadyum, minimal, neon, klasik };
