// Görsel işlemleri (canvas / OffscreenCanvas). Saf geometri işlevleri testlidir;
// çizim işlevleri tarayıcıda çalışır.
//
// Düzenleme durumu (editör ve toplu işlemler aynı biçimi kullanır):
//   { rotate: 0|90|180|270, flipH, flipV,
//     adjust: { brightness, contrast, saturation, grayscale, blur },   (100 = değişmez)
//     redactions: [{ x, y, w, h, style: "blur" | "pixelate" | "black" }],
//     shapes: [{ type: pen|marker|rect|ellipse|arrow|line|text, color, size, points | x1,y1,x2,y2, text }],
//     crop: { x, y, w, h } | null,                                  (döndürülmüş görsel koordinatı)
//     frame: { padding, color, radius, shadow } | null,
//     resize: { width, height } | null }
import { BROWSER_IMAGE, CANVAS_OUT, extOf } from "./catalog";

export const ASPECTS = Object.freeze([
  { key: "free", label: "Serbest", value: null },
  { key: "1:1", label: "1:1", value: 1 },
  { key: "4:3", label: "4:3", value: 4 / 3 },
  { key: "3:2", label: "3:2", value: 3 / 2 },
  { key: "16:9", label: "16:9", value: 16 / 9 },
  { key: "9:16", label: "9:16", value: 9 / 16 },
  { key: "4:5", label: "4:5", value: 4 / 5 },
  { key: "3:4", label: "3:4", value: 3 / 4 },
]);

export const blankEdit = () => ({
  rotate: 0, flipH: false, flipV: false,
  adjust: { brightness: 100, contrast: 100, saturation: 100, grayscale: 0, blur: 0 },
  redactions: [], shapes: [], crop: null, frame: null, resize: null,
});

/* ------------------------------- saf geometri ------------------------------- */

export const rotatedSize = (w, h, angle) => (((angle % 180) + 180) % 180 === 90 ? { width: h, height: w } : { width: w, height: h });

/**
 * Yeniden boyutlandırma. opts.mode:
 *   "percent" { percent }  "max" { maxW, maxH } (yalnız küçültür)  "exact" { width, height, keep }
 */
export function fitSize(w, h, opts = {}) {
  const W = Math.max(1, Number(w) || 1);
  const H = Math.max(1, Number(h) || 1);
  const round = (n) => Math.max(1, Math.round(n));
  if (opts.mode === "percent") {
    const p = Math.max(1, Math.min(1000, Number(opts.percent) || 100)) / 100;
    return { width: round(W * p), height: round(H * p) };
  }
  if (opts.mode === "exact") {
    const tw = Number(opts.width) || null;
    const th = Number(opts.height) || null;
    if (opts.keep !== false) {
      if (tw && th) { const s = Math.min(tw / W, th / H); return { width: round(W * s), height: round(H * s) }; }
      if (tw) return { width: round(tw), height: round((H * tw) / W) };
      if (th) return { width: round((W * th) / H), height: round(th) };
      return { width: W, height: H };
    }
    return { width: round(tw || W), height: round(th || H) };
  }
  const mw = Number(opts.maxW) || Infinity;
  const mh = Number(opts.maxH) || Infinity;
  const s = Math.min(1, mw / W, mh / H);
  return { width: round(W * s), height: round(H * s) };
}

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/** Sürükleme ile kırpma dikdörtgeni: aspect (sayı) ya da square (Shift, serbest kipte). */
export function rectFromDrag(start, end, { aspect = null, square = false, bounds } = {}) {
  let dx = end.x - start.x;
  let dy = end.y - start.y;
  const a = aspect || (square ? 1 : null);
  if (a) {
    const w = Math.max(Math.abs(dx), Math.abs(dy) * a);
    dx = Math.sign(dx || 1) * w;
    dy = Math.sign(dy || 1) * (w / a);
  }
  let x = Math.min(start.x, start.x + dx);
  let y = Math.min(start.y, start.y + dy);
  let w = Math.abs(dx);
  let h = Math.abs(dy);
  if (bounds) {
    // Sınır dışına taşarsa oran korunarak küçültülür.
    const sx = x < 0 ? -x : 0;
    const sy = y < 0 ? -y : 0;
    const ex = Math.max(0, x + w - bounds.width);
    const ey = Math.max(0, y + h - bounds.height);
    if (a && (sx || sy || ex || ey)) {
      const maxW = dx >= 0 ? bounds.width - start.x : start.x;
      const maxH = dy >= 0 ? bounds.height - start.y : start.y;
      const s = Math.min(1, maxW / w, maxH / h);
      w *= s; h *= s;
      x = dx >= 0 ? start.x : start.x - w;
      y = dy >= 0 ? start.y : start.y - h;
    } else {
      x = clamp(x, 0, bounds.width); y = clamp(y, 0, bounds.height);
      w = Math.min(w, bounds.width - x); h = Math.min(h, bounds.height - y);
    }
  }
  return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
}

/** Kırpma dikdörtgenini sınır içinde taşır. */
export const moveRect = (r, dx, dy, bounds) => ({ ...r, x: Math.round(clamp(r.x + dx, 0, bounds.width - r.w)), y: Math.round(clamp(r.y + dy, 0, bounds.height - r.h)) });

/** Ortalanmış, verilen oranda en büyük dikdörtgen. */
export function centeredAspect(bounds, aspect) {
  if (!aspect) return { x: 0, y: 0, w: bounds.width, h: bounds.height };
  let w = bounds.width;
  let h = w / aspect;
  if (h > bounds.height) { h = bounds.height; w = h * aspect; }
  return { x: Math.round((bounds.width - w) / 2), y: Math.round((bounds.height - h) / 2), w: Math.round(w), h: Math.round(h) };
}

/** Köşe tutamağından yeniden boyutlandırma (karşı köşe sabit). */
export function resizeFromHandle(rect, handle, point, { aspect = null, bounds, min = 8 } = {}) {
  const fixed = { x: handle.includes("w") ? rect.x + rect.w : rect.x, y: handle.includes("n") ? rect.y + rect.h : rect.y };
  const p = { x: clamp(point.x, 0, bounds.width), y: clamp(point.y, 0, bounds.height) };
  const r = rectFromDrag(fixed, p, { aspect, bounds });
  return r.w < min || r.h < min ? rect : r;
}

/**
 * Kolaj yerleşimi: hücreler eşit genişlikte; her satırın yüksekliği en uzun hücreye göre.
 * sizes: [{ width, height }] → { width, height, rects: [{ x, y, w, h }] }
 */
export function collageLayout(sizes, { cols = null, cell = 600, gap = 12, padding = null } = {}) {
  const n = sizes.length;
  const c = Math.max(1, Math.min(n, Number(cols) || Math.ceil(Math.sqrt(n))));
  const g = Math.max(0, Number(gap) || 0);
  const pad = padding == null ? g : Math.max(0, Number(padding) || 0);
  const cw = Math.max(40, Number(cell) || 600);
  const rows = Math.ceil(n / c);
  const rects = [];
  let y = pad;
  for (let r = 0; r < rows; r += 1) {
    const row = sizes.slice(r * c, r * c + c);
    const heights = row.map((s) => Math.round((cw * (s.height || 1)) / (s.width || 1)));
    const rh = Math.max(...heights);
    row.forEach((_s, i) => {
      const h = heights[i];
      rects.push({ x: pad + i * (cw + g), y: y + Math.round((rh - h) / 2), w: cw, h });
    });
    y += rh + (r < rows - 1 ? g : 0);
  }
  return { width: pad * 2 + c * cw + (c - 1) * g, height: y + pad, rects };
}

/** Ekran noktasını görsel koordinatına çevirir. view: { scale, offsetX, offsetY, originX, originY } */
export const toImage = (pt, view) => ({ x: (pt.x - view.offsetX) / view.scale + (view.originX || 0), y: (pt.y - view.offsetY) / view.scale + (view.originY || 0) });

/** Şeklin sınır kutusu (seçme / taşıma için). */
export function shapeBounds(s) {
  if (s.points?.length) {
    const xs = s.points.map((p) => p.x);
    const ys = s.points.map((p) => p.y);
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  }
  if (s.type === "text") {
    const fs = (s.size || 4) * 6;
    return { x: s.x1, y: s.y1 - fs, w: Math.max(fs, String(s.text || "").length * fs * 0.6), h: fs * 1.3 };
  }
  return { x: Math.min(s.x1, s.x2), y: Math.min(s.y1, s.y2), w: Math.abs(s.x2 - s.x1), h: Math.abs(s.y2 - s.y1) };
}

export function hitShape(shapes, pt, tolerance = 8) {
  for (let i = shapes.length - 1; i >= 0; i -= 1) {
    const b = shapeBounds(shapes[i]);
    if (pt.x >= b.x - tolerance && pt.x <= b.x + b.w + tolerance && pt.y >= b.y - tolerance && pt.y <= b.y + b.h + tolerance) return i;
  }
  return -1;
}

export function translateShape(s, dx, dy) {
  if (s.points) return { ...s, points: s.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) };
  return { ...s, x1: s.x1 + dx, y1: s.y1 + dy, x2: (s.x2 ?? s.x1) + dx, y2: (s.y2 ?? s.y1) + dy };
}

/** Shift ile 45° adımlarına kilitleme (ok / çizgi). */
export function snapAngle(x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  const ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
  return { x2: x1 + Math.cos(ang) * len, y2: y1 + Math.sin(ang) * len };
}

/** canvas filtresi. */
export function filterOf(adjust = {}) {
  const a = { brightness: 100, contrast: 100, saturation: 100, grayscale: 0, blur: 0, ...adjust };
  const parts = [];
  if (a.brightness !== 100) parts.push(`brightness(${a.brightness}%)`);
  if (a.contrast !== 100) parts.push(`contrast(${a.contrast}%)`);
  if (a.saturation !== 100) parts.push(`saturate(${a.saturation}%)`);
  if (a.grayscale) parts.push(`grayscale(${a.grayscale}%)`);
  if (a.blur) parts.push(`blur(${a.blur}px)`);
  return parts.join(" ") || "none";
}

/* --------------------------------- çizim --------------------------------- */

const makeCanvas = (w, h) => {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
};

/** Görseli yükler (HEIC / TIFF önce ana süreçte PNG'ye çevrilir). file: { id, url, ext, name } */
export async function loadBitmap(file) {
  let url = file.url;
  const ext = file.ext || extOf(file.name);
  if (!BROWSER_IMAGE.has(ext)) {
    const res = await window.elitlig.fileTools.decode(file.id);
    if (!res.ok) throw new Error(res.error?.message || "Görsel çözülemedi.");
    url = res.file.url;
  }
  const blob = await (await fetch(url)).blob();
  try {
    return await createImageBitmap(blob, { imageOrientation: "from-image" });
  } catch {
    throw new Error(`${file.name || "Görsel"} okunamadı.`);
  }
}

export function drawShape(ctx, s, scale = 1) {
  ctx.save();
  ctx.strokeStyle = s.color || "#ff3b30";
  ctx.fillStyle = s.color || "#ff3b30";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const lw = Math.max(1, (s.size || 4) * scale);
  ctx.lineWidth = lw;
  switch (s.type) {
    case "pen":
    case "marker": {
      if (s.type === "marker") { ctx.globalAlpha = 0.35; ctx.lineWidth = lw * 3.5; ctx.lineCap = "butt"; }
      const pts = s.points || [];
      if (pts.length === 1) { ctx.beginPath(); ctx.arc(pts[0].x, pts[0].y, ctx.lineWidth / 2, 0, Math.PI * 2); ctx.fill(); break; }
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.stroke();
      break;
    }
    case "rect":
      ctx.strokeRect(Math.min(s.x1, s.x2), Math.min(s.y1, s.y2), Math.abs(s.x2 - s.x1), Math.abs(s.y2 - s.y1));
      break;
    case "ellipse":
      ctx.beginPath();
      ctx.ellipse((s.x1 + s.x2) / 2, (s.y1 + s.y2) / 2, Math.abs(s.x2 - s.x1) / 2, Math.abs(s.y2 - s.y1) / 2, 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    case "line":
    case "arrow": {
      ctx.beginPath();
      ctx.moveTo(s.x1, s.y1);
      ctx.lineTo(s.x2, s.y2);
      ctx.stroke();
      if (s.type === "arrow") {
        const ang = Math.atan2(s.y2 - s.y1, s.x2 - s.x1);
        const head = Math.max(10 * scale, lw * 3.2);
        ctx.beginPath();
        ctx.moveTo(s.x2, s.y2);
        ctx.lineTo(s.x2 - head * Math.cos(ang - Math.PI / 7), s.y2 - head * Math.sin(ang - Math.PI / 7));
        ctx.lineTo(s.x2 - head * Math.cos(ang + Math.PI / 7), s.y2 - head * Math.sin(ang + Math.PI / 7));
        ctx.closePath();
        ctx.fill();
      }
      break;
    }
    case "text": {
      const size = Math.max(10, (s.size || 4) * 6 * scale);
      ctx.font = `600 ${size}px -apple-system, "Segoe UI", system-ui, sans-serif`;
      ctx.textBaseline = "alphabetic";
      // Okunurluk için ince kontur.
      ctx.lineWidth = Math.max(2, size / 8);
      ctx.strokeStyle = "rgba(255,255,255,0.85)";
      String(s.text || "").split("\n").forEach((line, i) => {
        ctx.strokeText(line, s.x1, s.y1 + i * size * 1.2);
        ctx.fillText(line, s.x1, s.y1 + i * size * 1.2);
      });
      break;
    }
    default:
  }
  ctx.restore();
}

function applyRedaction(ctx, source, r) {
  const x = Math.round(r.x);
  const y = Math.round(r.y);
  const w = Math.max(1, Math.round(r.w));
  const h = Math.max(1, Math.round(r.h));
  ctx.save();
  if (r.style === "black") {
    ctx.fillStyle = "#000";
    ctx.fillRect(x, y, w, h);
  } else if (r.style === "pixelate") {
    const block = Math.max(6, Math.round(Math.min(w, h) / 10));
    const small = makeCanvas(Math.max(1, w / block), Math.max(1, h / block));
    const sctx = small.getContext("2d");
    sctx.drawImage(source, x, y, w, h, 0, 0, small.width, small.height);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(small, 0, 0, small.width, small.height, x, y, w, h);
  } else {
    const radius = Math.max(8, Math.round(Math.min(w, h) / 6));
    const pad = radius * 2;
    const tmp = makeCanvas(w + pad * 2, h + pad * 2);
    const tctx = tmp.getContext("2d");
    tctx.filter = `blur(${radius}px)`;
    tctx.drawImage(source, x - pad, y - pad, w + pad * 2, h + pad * 2, 0, 0, w + pad * 2, h + pad * 2);
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.drawImage(tmp, pad, pad, w, h, x, y, w, h);
  }
  ctx.restore();
}

function roundedPath(ctx, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/**
 * Taban katman: döndürme + çevirme + ayarlar + sansür + şekiller (kırpmasız).
 * skipShapes: editörde çizilmekte olan şekil ayrı katmanda gösterilir.
 */
export function renderBase(bitmap, state, { skipShapes = false } = {}) {
  const st = { ...blankEdit(), ...state };
  const { width, height } = rotatedSize(bitmap.width, bitmap.height, st.rotate);
  const canvas = makeCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.rotate((st.rotate * Math.PI) / 180);
  ctx.scale(st.flipH ? -1 : 1, st.flipV ? -1 : 1);
  ctx.filter = filterOf(st.adjust);
  ctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
  ctx.restore();
  ctx.filter = "none";
  if (st.redactions.length) {
    const snapshot = makeCanvas(width, height);
    snapshot.getContext("2d").drawImage(canvas, 0, 0);
    for (const r of st.redactions) applyRedaction(ctx, snapshot, r);
  }
  if (!skipShapes) for (const s of st.shapes) drawShape(ctx, s);
  return canvas;
}

/** Tam çıktı: taban + kırpma + çerçeve + yeniden boyutlandırma. */
export function renderEdit(bitmap, state) {
  const st = { ...blankEdit(), ...state };
  let canvas = renderBase(bitmap, st);
  if (st.crop && st.crop.w > 0 && st.crop.h > 0) {
    const c = makeCanvas(st.crop.w, st.crop.h);
    c.getContext("2d").drawImage(canvas, -st.crop.x, -st.crop.y);
    canvas = c;
  }
  if (st.frame && (st.frame.padding > 0 || st.frame.radius > 0)) {
    const p = Math.max(0, Math.round(st.frame.padding || 0));
    const f = makeCanvas(canvas.width + p * 2, canvas.height + p * 2);
    const ctx = f.getContext("2d");
    if (st.frame.color && st.frame.color !== "transparent") {
      ctx.fillStyle = st.frame.color;
      ctx.fillRect(0, 0, f.width, f.height);
    }
    ctx.save();
    if (st.frame.shadow && p > 0) {
      ctx.shadowColor = "rgba(0,0,0,0.28)";
      ctx.shadowBlur = Math.round(p * 0.6);
      ctx.shadowOffsetY = Math.round(p * 0.15);
      roundedPath(ctx, p, p, canvas.width, canvas.height, st.frame.radius || 0);
      ctx.fillStyle = "#fff";
      ctx.fill();
    }
    ctx.restore();
    ctx.save();
    roundedPath(ctx, p, p, canvas.width, canvas.height, st.frame.radius || 0);
    ctx.clip();
    ctx.drawImage(canvas, p, p);
    ctx.restore();
    canvas = f;
  }
  if (st.resize && (st.resize.width !== canvas.width || st.resize.height !== canvas.height)) canvas = scaleCanvas(canvas, st.resize.width, st.resize.height);
  return canvas;
}

/** Kaliteli küçültme: yarıya yarıya (büyük oranlarda bulanıklık / basamak olmasın). */
export function scaleCanvas(source, width, height) {
  let src = source;
  let w = src.width;
  let h = src.height;
  while (w / 2 > width && h / 2 > height) {
    const half = makeCanvas(Math.round(w / 2), Math.round(h / 2));
    const hctx = half.getContext("2d");
    hctx.imageSmoothingQuality = "high";
    hctx.drawImage(src, 0, 0, half.width, half.height);
    src = half; w = half.width; h = half.height;
  }
  const out = makeCanvas(width, height);
  const ctx = out.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, width, height);
  return out;
}

/** Arka planı düz renk (JPG saydamlık taşımaz: beyaz). */
function flatten(canvas, color = "#ffffff") {
  const out = makeCanvas(canvas.width, canvas.height);
  const ctx = out.getContext("2d");
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(canvas, 0, 0);
  return out;
}

/** canvas → baytlar. fmt: jpg | png | webp, quality 0–1. */
export async function encodeCanvas(canvas, fmt = "png", quality = 0.92) {
  const type = CANVAS_OUT[fmt] || "image/png";
  const src = fmt === "jpg" ? flatten(canvas) : canvas;
  let blob;
  if (typeof src.convertToBlob === "function") blob = await src.convertToBlob({ type, quality });
  else blob = await new Promise((resolve) => src.toBlob(resolve, type, quality));
  if (!blob) throw new Error("Görsel kodlanamadı.");
  return new Uint8Array(await blob.arrayBuffer());
}

/** Çıktı biçimi: kaynak canvas'ın yazabildiği biçimse aynısı, değilse PNG. */
export const outputFormat = (ext, preferred = null) => {
  if (preferred && CANVAS_OUT[preferred]) return preferred;
  const e = ext === "jpeg" ? "jpg" : ext;
  return CANVAS_OUT[e] ? e : "png";
};

/** Kolaj çizer. bitmaps: ImageBitmap[] */
export function renderCollage(bitmaps, opts = {}) {
  const layout = collageLayout(bitmaps.map((b) => ({ width: b.width, height: b.height })), opts);
  const canvas = makeCanvas(layout.width, layout.height);
  const ctx = canvas.getContext("2d");
  if (opts.background && opts.background !== "transparent") {
    ctx.fillStyle = opts.background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.imageSmoothingQuality = "high";
  bitmaps.forEach((b, i) => {
    const r = layout.rects[i];
    ctx.save();
    if (opts.radius) { roundedPath(ctx, r.x, r.y, r.w, r.h, opts.radius); ctx.clip(); }
    ctx.drawImage(b, r.x, r.y, r.w, r.h);
    ctx.restore();
  });
  return canvas;
}
