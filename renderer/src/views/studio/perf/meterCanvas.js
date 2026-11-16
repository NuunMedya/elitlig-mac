// Yayın Stüdyosu · ÖLÇER TUVALİ (2.35.0).
//
// Ses ölçerleri artık DOM öğesi (genişlik / clip-path / transform) değil, küçük <canvas>
// üstüne çizilir. Ölçüm (Chromium izleme, tam stüdyo): DOM ölçerleri saniyede 15 kez
// güncellenince her güncellemede bütün belgenin katman listesi yeniden kuruluyordu
// (PaintArtifactCompositor::Update + Paint + Layerize ≈ ana iş parçacığının %10–15'i;
// transform ile de katman güncellemesi sürüyordu). Tuval içeriği değişince yalnız o tuvalin
// dokusu yenilenir: belge yeniden boyanmaz, katmanlar yeniden kurulmaz.
//
// Kullanım: <canvas className="meter-cv" /> öğesini kapsayıcıya koy, döngüde
// drawMeterBar(canvas, level, peak, { vertical, muted }) çağır (0..1). Değer değişmediyse
// çizim atlanır; boyut ResizeObserver ile izlenir (her karede düzen okunmaz).

let ro = null;
const sizeOf = new WeakMap(); // canvas → { w, h } (CSS px)

function observe(c) {
  if (sizeOf.has(c)) return;
  sizeOf.set(c, null);
  if (typeof ResizeObserver !== "function") return;
  if (!ro) {
    ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const r = e.contentRect;
        sizeOf.set(e.target, { w: r.width, h: r.height });
        e.target._mv = null; // yeniden çizilsin
      }
    });
  }
  try { ro.observe(c); } catch { /* yoksay */ }
}

/** Tuvali CSS boyutuna (aygıt pikseliyle) uydurur; boyut değiştiyse true. */
function fit(c) {
  observe(c);
  let s = sizeOf.get(c);
  if (!s) { s = { w: c.clientWidth, h: c.clientHeight }; sizeOf.set(c, s); }
  const dpr = Math.min(2, (typeof window !== "undefined" && window.devicePixelRatio) || 1);
  const w = Math.max(1, Math.round(s.w * dpr));
  const h = Math.max(1, Math.round(s.h * dpr));
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; return true; }
  return false;
}

const V_STOPS = [[0, "#16c784"], [0.55, "#22c55e"], [0.72, "#facc15"], [0.82, "#f59e0b"], [0.92, "#ff2d55"]];
const H_STOPS = [[0, "#22c55e"], [0.65, "#22c55e"], [0.82, "#facc15"], [0.96, "#ef4444"]];

function gradient(ctx, c, vertical) {
  const key = `${vertical ? "v" : "h"}${c.width}x${c.height}`;
  if (c._gk === key && c._g) return c._g;
  const g = vertical ? ctx.createLinearGradient(0, c.height, 0, 0) : ctx.createLinearGradient(0, 0, c.width, 0);
  for (const [at, col] of vertical ? V_STOPS : H_STOPS) g.addColorStop(at, col);
  c._gk = key;
  c._g = g;
  return g;
}

/**
 * Tek çubuk: level / peak 0..1. opts.vertical (aşağıdan yukarı), opts.muted (gri dolgu),
 * opts.peakColor. Değer (%0,5 adım) ve boyut aynıysa çizmez.
 */
export function drawMeterBar(c, level, peak = null, { vertical = true, muted = false, peakAlpha = 0.9 } = {}) {
  if (!c || !c.getContext) return false;
  const l = Math.round(Math.min(1, Math.max(0, Number(level) || 0)) * 200);
  const p = peak == null ? -1 : Math.round(Math.min(1, Math.max(0, Number(peak) || 0)) * 200);
  const resized = fit(c);
  const mv = `${l}|${p}|${muted ? 1 : 0}`;
  if (!resized && c._mv === mv) return false;
  c._mv = mv;
  const ctx = c.getContext("2d");
  if (!ctx) return false;
  const W = c.width;
  const H = c.height;
  ctx.clearRect(0, 0, W, H);
  const f = l / 200;
  if (f > 0) {
    ctx.fillStyle = muted ? "rgba(148, 163, 184, 0.45)" : gradient(ctx, c, vertical);
    if (vertical) { const h = Math.max(1, Math.round(f * H)); ctx.fillRect(0, H - h, W, h); }
    else { const w = Math.max(1, Math.round(f * W)); ctx.fillRect(0, 0, w, H); }
  }
  if (p >= 0) {
    const pf = p / 200;
    ctx.fillStyle = `rgba(255, 255, 255, ${peakAlpha})`;
    const t = Math.max(1, Math.min(4, Math.round(2 * Math.min(2, (typeof window !== "undefined" && window.devicePixelRatio) || 1))));
    if (vertical) ctx.fillRect(0, Math.min(H - t, Math.max(0, Math.round(H - pf * H - t / 2))), W, t);
    else ctx.fillRect(Math.min(W - t, Math.max(0, Math.round(pf * W - t / 2))), 0, t, H);
  }
  return true;
}
