// VAR temalarının çizim kodu (anahtarlar lib/studio/varThemes.js ile aynı).
// Her tema: background(ctx, S) · panePath(ctx, S, pane) · pane(ctx, S, pane, info, i) · chrome(ctx, S).
// Temalar ortak motoru (./engine) kendi tarifleriyle kullanır.
import * as kirmizi from "./kirmizi";
import * as stadyum from "./stadyum";
import * as minimal from "./minimal";
import * as neon from "./neon";
import * as klasik from "./klasik";
import * as gece from "./gece";
import * as beyaz from "./beyaz";

export const VAR_THEME_DRAW = { kirmizi, stadyum, minimal, neon, klasik, gece, beyaz };
