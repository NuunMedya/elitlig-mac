// Yayın Stüdyosu — GEÇİŞLER (saf zaman çizelgeleri).
//
// transitionFrame(kind, p) geçişin p (0…1) anındaki iki görüntüsünü tarif eder:
//   from / to: { alpha, dx, dy, scale, blur }   dx/dy ekran oranı, blur 0…1
//   wipe: soldan sağa açılan sınır (0…1) ya da null
//   order: "to-over" (yeni üstte) | "from-over"
//   switched: görüntü değişti mi (logo geçişinde tam ortada)
// Karıştırıcı bu değerleri tuvale uygular (useCompositor). Her geçişin süresi
// ayrı ayarlanır (prefs.transitionMs).
import { STINGER_MS, STINGER_STYLES, drawStingerKind, easeInOut } from "./stinger";

export const TRANSITION_KINDS = [
  { key: "cut", label: "Kesme", ms: 0, min: 0, max: 0 },
  { key: "fade", label: "Yumuşak geçiş", ms: 400, min: 100, max: 3000 },
  { key: "slideLeft", label: "Kaydırma ← (sola)", ms: 600, min: 200, max: 3000 },
  { key: "slideRight", label: "Kaydırma → (sağa)", ms: 600, min: 200, max: 3000 },
  { key: "slideUp", label: "Kaydırma ↑ (yukarı)", ms: 600, min: 200, max: 3000 },
  { key: "zoom", label: "Yakınlaştırma", ms: 550, min: 200, max: 3000 },
  { key: "wipe", label: "Silme (wipe)", ms: 650, min: 200, max: 3000 },
  { key: "blur", label: "Luma / bulanıklık", ms: 800, min: 300, max: 3000 },
  { key: "stinger", label: "Marka logosu (stinger)", ms: STINGER_MS, min: 600, max: 2500, stinger: true },
  // Yeni logo geçişleri (stinger.js): marka renkleri + logo, tam ortada örtülü.
  ...STINGER_STYLES.filter((x) => x.key !== "stinger").map((x) => ({ key: x.key, label: x.label, ms: x.ms, min: 700, max: 3000, stinger: true })),
];

/** A1 (Studio / karıştırıcı) ve modlar aynı listeyi kullanır. */
export const TRANSITIONS = TRANSITION_KINDS;

/** Logo geçişi mi (ekranı örter, görüntü tam ortada değişir; drawTransitionStinger ile çizilir). */
export const isStingerKind = (key) => Boolean(TRANSITION_KINDS.find((t) => t.key === key)?.stinger);

/**
 * Logo geçişinin üst katmanı (sahnenin ÜSTÜNE, grafiklerin de üstüne çizilir).
 * Karıştırıcı: if (isStingerKind(tr.kind)) drawTransitionStinger(ctx, W, H, tr.kind, p, logo, branding).
 */
export const drawTransitionStinger = (ctx, W, H, kind, p, logo, branding) => drawStingerKind(ctx, W, H, kind, p, logo, branding);

export const transitionKind = (key) => TRANSITION_KINDS.find((t) => t.key === key) || TRANSITION_KINDS[1];

/** Kullanıcının süresi (sınırlar içinde), yoksa varsayılan. */
export function transitionMs(key, overrides) {
  const t = transitionKind(key);
  if (t.key === "cut") return 0;
  const v = Number(overrides?.[t.key]);
  return Number.isFinite(v) && v > 0 ? Math.round(Math.min(t.max, Math.max(t.min, v))) : t.ms;
}

const clamp01 = (v) => (v <= 0 ? 0 : v >= 1 ? 1 : v);
const IDLE = Object.freeze({ alpha: 1, dx: 0, dy: 0, scale: 1, blur: 0 });
const view = (patch) => ({ ...IDLE, ...patch });

export function transitionFrame(kind, p) {
  const t = clamp01(Number(p) || 0);
  const e = easeInOut(t);
  switch (kind) {
    case "cut":
      return { from: view({ alpha: t >= 1 ? 0 : 1 }), to: view({ alpha: t >= 1 ? 1 : 0 }), wipe: null, order: "to-over", switched: t >= 1 };
    case "slideLeft":
      return { from: view({ dx: -e }), to: view({ dx: 1 - e }), wipe: null, order: "to-over", switched: t >= 0.5 };
    case "slideRight":
      return { from: view({ dx: e }), to: view({ dx: -1 + e }), wipe: null, order: "to-over", switched: t >= 0.5 };
    case "slideUp":
      return { from: view({ dy: -e }), to: view({ dy: 1 - e }), wipe: null, order: "to-over", switched: t >= 0.5 };
    case "zoom":
      return { from: view({ scale: 1 + 0.25 * e, alpha: 1 }), to: view({ scale: 0.8 + 0.2 * e, alpha: e }), wipe: null, order: "to-over", switched: t >= 0.5 };
    case "wipe":
      return { from: view({}), to: view({}), wipe: e, order: "to-over", switched: t >= 0.5 };
    case "blur": {
      // İlk yarı: eski görüntü bulanıklaşır; ortada çapraz geçiş; ikinci yarı: yeni netleşir.
      const blurOut = clamp01(t / 0.5);
      const blurIn = clamp01((1 - t) / 0.5);
      const mix = clamp01((t - 0.35) / 0.3);
      return { from: view({ blur: easeInOut(blurOut) }), to: view({ blur: easeInOut(blurIn), alpha: easeInOut(mix) }), wipe: null, order: "to-over", switched: t >= 0.5 };
    }
    case "stinger":
    case "sweep":
    case "panels":
    case "iris":
    case "shards":
      // Logo şeridi üstte örter; alttaki görüntü tam ortada değişir.
      return { from: view({ alpha: t < 0.5 ? 1 : 0 }), to: view({ alpha: t < 0.5 ? 0 : 1 }), wipe: null, order: "to-over", switched: t >= 0.5, stinger: true };
    case "fade":
    default:
      return { from: view({}), to: view({ alpha: e }), wipe: null, order: "to-over", switched: t >= 0.5 };
  }
}

/** Geçişin ilerleyişi 0…1. */
export function progressAt(tr, now) {
  if (!tr) return 1;
  const ms = Number(tr.ms) || 0;
  if (ms <= 0) return 1;
  return clamp01((now - tr.startedAt) / ms);
}
