// 2.35.0: yoklama / olay sonuçları aynı veriyi getirdiyse eski nesne korunur (setState bail-out):
// stüdyo kökündeki kancalarda her yeni nesne BÜTÜN stüdyo ağacını yeniden çizdiriyordu.
export function sameJson(a, b) {
  if (a === b) return true;
  try { return JSON.stringify(a) === JSON.stringify(b); } catch { return false; }
}
/** setX(keepIfSame(next)): değer aynıysa önceki nesne döner (React yeniden çizmez). */
export const keepIfSame = (next) => (prev) => (sameJson(prev, next) ? prev : next);
