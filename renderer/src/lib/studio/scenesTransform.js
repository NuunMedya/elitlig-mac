// Yayın Stüdyosu — katman DÖNÜŞÜM hesabı (saf): taşıma, köşeden boyutlama
// (Shift = oranı koru), kırpma (Alt + tutamak), döndürme, isabet testi,
// "Ekrana sığdır / Uzat / Ortala" ve sayısal alanlar için piksel çevirisi.
//
// Katman kutusu çıkışa göre 0…1 (x, y, w, h). Sürükleme farkları da aynı
// birimdedir (piksel farkı / tuval boyutu). Döndürülmüş katmanda kutu
// döndürmeden önceki eksen hizalı kutudur; isabet testi noktayı ters döndürür.

export const HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
export const MIN_SIZE = 0.02;
export const SNAP = 0.012;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Katman kutusu piksel olarak. */
export const layerBox = (layer, W, H) => ({ x: layer.x * W, y: layer.y * H, w: layer.w * W, h: layer.h * H });

/** Noktayı (px) kutu merkezinde −rot kadar döndürür (döndürülmüş katmanda isabet için). */
export function unrotatePoint(px, py, box, rotDeg) {
  if (!rotDeg) return { x: px, y: py };
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const a = (-rotDeg * Math.PI) / 180;
  const dx = px - cx;
  const dy = py - cy;
  return { x: cx + dx * Math.cos(a) - dy * Math.sin(a), y: cy + dx * Math.sin(a) + dy * Math.cos(a) };
}

export const pointInBox = (p, b) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;

/**
 * En üstteki (dizi sonu) görünür ve kilitsiz katman; yoksa null.
 * opts.includeLocked: kilitliyi de seç (yalnız seçim için, taşınmaz).
 */
export function hitTest(layers, px, py, W, H, { includeLocked = false } = {}) {
  for (let i = layers.length - 1; i >= 0; i -= 1) {
    const l = layers[i];
    if (!l.visible || (l.locked && !includeLocked)) continue;
    const box = layerBox(l, W, H);
    if (pointInBox(unrotatePoint(px, py, box, l.rot), box)) return l.id;
  }
  return null;
}

/** Tutamağın merkezi (px). */
export function handlePoint(box, handle) {
  const x = handle.includes("w") ? box.x : handle.includes("e") ? box.x + box.w : box.x + box.w / 2;
  const y = handle.includes("n") ? box.y : handle.includes("s") ? box.y + box.h : box.y + box.h / 2;
  return { x, y };
}

/** Noktaya en yakın tutamak (tol px içinde), yoksa null. */
export function handleAt(box, px, py, tol = 8, rotDeg = 0) {
  const p = unrotatePoint(px, py, box, rotDeg);
  for (const h of HANDLES) {
    const c = handlePoint(box, h);
    if (Math.abs(c.x - p.x) <= tol && Math.abs(c.y - p.y) <= tol) return h;
  }
  return null;
}

/**
 * Taşıma: kenar ve merkez çizgilerine yapışır (SNAP). Dönüş { x, y, guides }:
 * guides yapışılan çizgiler ({ axis: "x"|"y", at }) — kılavuz olarak çizilir.
 */
export function moveLayer(t, dx, dy, { snap = true, snapAt = SNAP, xs = [], ys = [] } = {}) {
  let x = t.x + dx;
  let y = t.y + dy;
  const guides = [];
  if (snap) {
    const sx = snapAxis(x, t.w, snapAt, xs);
    const sy = snapAxis(y, t.h, snapAt, ys);
    if (sx) { x = sx.value; guides.push({ axis: "x", at: sx.at }); }
    if (sy) { y = sy.value; guides.push({ axis: "y", at: sy.at }); }
  }
  return { x, y, guides };
}

/** Öbür katmanların kenar / orta çizgileri (yapışma hedefleri). */
export function snapLines(layers, exceptId) {
  const xs = [];
  const ys = [];
  for (const l of layers || []) {
    if (!l || l.id === exceptId || l.visible === false || l.rot) continue;
    xs.push(l.x, l.x + l.w, l.x + l.w / 2);
    ys.push(l.y, l.y + l.h, l.y + l.h / 2);
  }
  return { xs, ys };
}

function snapAxis(start, size, tol, lines = []) {
  const end = start + size;
  const mid = start + size / 2;
  const cands = [
    [start, 0, 0], [end, 1, 1 - size], [mid, 0.5, 0.5 - size / 2],
    [start, 0.5, 0.5], [end, 0.5, 0.5 - size],
  ];
  for (const at of lines) {
    if (!Number.isFinite(at)) continue;
    cands.push([start, at, at], [end, at, at - size], [mid, at, at - size / 2]);
  }
  let best = null;
  for (const [edge, at, value] of cands) {
    const d = Math.abs(edge - at);
    if (d <= tol && (!best || d < best.d)) best = { d, at, value };
  }
  return best;
}

/**
 * Köşe / kenar tutamağıyla boyutlama. aspect: korunacak w/h (normalize
 * birimde; 16:9 çıkışta 16:9 kaynak için 1). keepAspect köşelerde oranı korur
 * (kenar tutamağında diğer eksen oranla büyür, merkez sabit kalır).
 * Kutu ters dönmez; en küçük boyut MIN_SIZE.
 */
export function resizeLayer(t, handle, dx, dy, { keepAspect = false, aspect = null } = {}) {
  let { x, y, w, h } = t;
  const left = handle.includes("w");
  const right = handle.includes("e");
  const top = handle.includes("n");
  const bottom = handle.includes("s");
  if (left) { const nx = Math.min(x + dx, x + w - MIN_SIZE); w = x + w - nx; x = nx; }
  if (right) w = Math.max(MIN_SIZE, w + dx);
  if (top) { const ny = Math.min(y + dy, y + h - MIN_SIZE); h = y + h - ny; y = ny; }
  if (bottom) h = Math.max(MIN_SIZE, h + dy);
  if (keepAspect) {
    const a = aspect || (t.h ? t.w / t.h : 1);
    const corner = (left || right) && (top || bottom);
    if (corner) {
      // Büyük olan eksen belirler; karşı köşe sabit.
      if (w / a > h) { const nh = w / a; if (top) y -= nh - h; h = nh; } else { const nw = h * a; if (left) x -= nw - w; w = nw; }
    } else if (left || right) {
      const nh = w / a; y -= (nh - h) / 2; h = nh;
    } else if (top || bottom) {
      const nw = h * a; x -= (nw - w) / 2; w = nw;
    }
  }
  return { x, y, w, h };
}

/**
 * Kırpma (Alt + tutamak): kutu kenarı içe çekilir, görüntü yerinde kalır —
 * kırpma oranı kutunun gösterdiği kaynak payıyla orantılı artar.
 * Dışa çekmek kırpmayı geri açar (en fazla 0).
 */
export function cropLayer(t, crop, handle, dx, dy) {
  let { x, y, w, h } = t;
  const c = { ...crop };
  const visW = 1 - c.l - c.r;
  const visH = 1 - c.t - c.b;
  const perW = w > 0 ? visW / w : 0; // kaynak oranı / normalize birim
  const perH = h > 0 ? visH / h : 0;
  if (handle.includes("w")) {
    const d = clamp(dx, -c.l / (perW || 1), w - MIN_SIZE);
    c.l = clamp(c.l + d * perW, 0, 0.9); x += d; w -= d;
  }
  if (handle.includes("e")) {
    const d = clamp(-dx, -c.r / (perW || 1), w - MIN_SIZE);
    c.r = clamp(c.r + d * perW, 0, 0.9); w -= d;
  }
  if (handle.includes("n")) {
    const d = clamp(dy, -c.t / (perH || 1), h - MIN_SIZE);
    c.t = clamp(c.t + d * perH, 0, 0.9); y += d; h -= d;
  }
  if (handle.includes("s")) {
    const d = clamp(-dy, -c.b / (perH || 1), h - MIN_SIZE);
    c.b = clamp(c.b + d * perH, 0, 0.9); h -= d;
  }
  return { x, y, w, h, crop: c };
}

/** Merkezden fare açısına göre döndürme (derece, Shift = 15° adım). */
export function rotationFromPoint(box, px, py, { step = 0 } = {}) {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  let deg = (Math.atan2(py - cy, px - cx) * 180) / Math.PI + 90;
  if (step) deg = Math.round(deg / step) * step;
  return ((deg % 360) + 360) % 360;
}

/**
 * Kaynağın görünen oranı (normalize birimde, 16:9 çıkış): kaynak w/h,
 * kırpma dahil, çıkış oranına bölünür.
 */
export function normAspect(srcW, srcH, crop, outW = 16, outH = 9) {
  if (!srcW || !srcH) return 1;
  const c = crop || { l: 0, t: 0, r: 0, b: 0 };
  const w = srcW * (1 - c.l - c.r);
  const h = srcH * (1 - c.t - c.b);
  return (w / h) / (outW / outH);
}

/** "Ekrana sığdır": kaynağın oranıyla ekranın içine sığan en büyük kutu, ortada. */
export function fitToScreen(aspect = 1) {
  const a = aspect > 0 ? aspect : 1;
  if (a >= 1) { const h = 1 / a; return { x: 0, y: (1 - h) / 2, w: 1, h }; }
  const w = a;
  return { x: (1 - w) / 2, y: 0, w, h: 1 };
}
/** "Uzat": tam ekran. */
export const stretchToScreen = () => ({ x: 0, y: 0, w: 1, h: 1 });
/** "Ortala": boyut aynı, ekranın ortası. */
export const centerLayer = (t) => ({ x: (1 - t.w) / 2, y: (1 - t.h) / 2 });

/** Sayısal alanlar: normalize ↔ çıkış pikseli (tamsayı). */
export const toPixels = (t, W, H) => ({ x: Math.round(t.x * W), y: Math.round(t.y * H), w: Math.round(t.w * W), h: Math.round(t.h * H) });
export function fromPixels(px, W, H) {
  const out = {};
  if (px.x != null) out.x = Number(px.x) / W;
  if (px.y != null) out.y = Number(px.y) / H;
  if (px.w != null) out.w = Math.max(MIN_SIZE, Number(px.w) / W);
  if (px.h != null) out.h = Math.max(MIN_SIZE, Number(px.h) / H);
  return out;
}

/** Ok tuşlarıyla kaydırma: 1 px, Shift ile 10 px. */
export function nudge(t, key, shift, W, H) {
  const s = shift ? 10 : 1;
  if (key === "ArrowLeft") return { x: t.x - s / W };
  if (key === "ArrowRight") return { x: t.x + s / W };
  if (key === "ArrowUp") return { y: t.y - s / H };
  if (key === "ArrowDown") return { y: t.y + s / H };
  return null;
}

/** Tutamağın imleci. */
export const handleCursor = (h) => ({ nw: "nwse-resize", se: "nwse-resize", ne: "nesw-resize", sw: "nesw-resize", n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize" }[h] || "move");

/**
 * Hizala: "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom" (ekrana göre).
 * Dönüş: { x } ya da { y } yaması.
 */
export function alignLayer(t, how) {
  switch (how) {
    case "left": return { x: 0 };
    case "hcenter": return { x: (1 - t.w) / 2 };
    case "right": return { x: 1 - t.w };
    case "top": return { y: 0 };
    case "vcenter": return { y: (1 - t.h) / 2 };
    case "bottom": return { y: 1 - t.h };
    default: return null;
  }
}
