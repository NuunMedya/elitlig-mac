// Yayın Stüdyosu — katman GÖSTER / GİZLE geçişi (OBS "Show / Hide Transition").
//
// Katmanın isteğe bağlı `showFx`'i: { kind: fade | slideL | slideR | slideU | slideD | zoom, ms }.
// Görünürlük değiştirildiğinde (updateLayer) `visibleAt` (Date.now) yazılır; çizim
// o andan bu yana geçen süreyle ilerlemeyi hesaplar (gizlenen katman geçiş bitene
// dek çizilir). visibleAt kayda kalıcı yazılmaz: yeniden açılışta geçiş oynamaz.

export const SHOW_FX = [
  { key: "none", label: "Yok (anında)" },
  { key: "fade", label: "Solarak" },
  { key: "slideL", label: "Soldan kayarak" },
  { key: "slideR", label: "Sağdan kayarak" },
  { key: "slideU", label: "Alttan yukarı" },
  { key: "slideD", label: "Üstten aşağı" },
  { key: "zoom", label: "Büyüyerek" },
];
const KEYS = new Set(SHOW_FX.map((f) => f.key));

/** Katman alanı: geçersizse null (kayda yazılmaz). */
export function normalizeShowFx(v) {
  if (!v || typeof v !== "object" || !KEYS.has(v.kind) || v.kind === "none") return null;
  const ms = Math.round(Math.min(3000, Math.max(50, Number(v.ms) || 400)));
  return { kind: v.kind, ms };
}

const ease = (p) => (p < 0.5 ? 2 * p * p : 1 - ((-2 * p + 2) ** 2) / 2);

/**
 * Katmanın o anki görünümü. → null (çizilmez) | { alpha, dx, dy, scale } (dx / dy kutu oranı).
 * now: Date.now().
 */
export function layerVisibility(layer, now = Date.now()) {
  const fx = layer?.showFx;
  const at = Number(layer?.visibleAt) || 0;
  const visible = layer?.visible !== false;
  if (!fx || !at || now - at >= fx.ms || now < at) return visible ? FULL : null;
  const p = ease(Math.min(1, Math.max(0, (now - at) / fx.ms)));
  const k = visible ? p : 1 - p; // 1 = tam görünür
  if (k <= 0.001) return null;
  switch (fx.kind) {
    case "fade": return { alpha: k, dx: 0, dy: 0, scale: 1 };
    case "slideL": return { alpha: 1, dx: -(1 - k) * 1.05, dy: 0, scale: 1, clip: true };
    case "slideR": return { alpha: 1, dx: (1 - k) * 1.05, dy: 0, scale: 1, clip: true };
    case "slideU": return { alpha: 1, dx: 0, dy: (1 - k) * 1.05, scale: 1, clip: true };
    case "slideD": return { alpha: 1, dx: 0, dy: -(1 - k) * 1.05, scale: 1, clip: true };
    case "zoom": return { alpha: k, dx: 0, dy: 0, scale: 0.6 + 0.4 * k };
    default: return visible ? FULL : null;
  }
}
const FULL = Object.freeze({ alpha: 1, dx: 0, dy: 0, scale: 1 });
export const isFullVisibility = (v) => v === FULL;
