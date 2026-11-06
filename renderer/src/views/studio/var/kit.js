// Yayın Stüdyosu — VAR çizim takımı: temaların ortak tuval yardımcıları.
//
// Renk (rgba), yuvarlak / eğik dikdörtgen, köşe ayraçları, sekme, ✓ / ✕ simgesi,
// harf aralığı, yumuşatma eğrileri ve önbellekli doku desenleri (karbon, dama).

export const FONT = "\"Archivo\", -apple-system, \"Helvetica Neue\", Arial, sans-serif";
export const MONO = "\"SF Mono\", \"JetBrains Mono\", Menlo, Consolas, monospace";

export const rgba = (hex, a) => {
  const h = String(hex || "#ffffff").replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((x) => x + x).join("") : h, 16) || 0;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

export function rr(ctx, x, y, w, h, r) {
  const q = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + q, y);
  ctx.arcTo(x + w, y, x + w, y + h, q);
  ctx.arcTo(x + w, y + h, x, y + h, q);
  ctx.arcTo(x, y + h, x, y, q);
  ctx.arcTo(x, y, x + w, y, q);
  ctx.closePath();
}

/** Paralelkenar (eğik bant): sk = yatay kayma (px, sağa yatık). */
export function skew(ctx, x, y, w, h, sk) {
  ctx.beginPath();
  ctx.moveTo(x + sk, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w - sk, y + h);
  ctx.lineTo(x, y + h);
  ctx.closePath();
}

/** Köşesi kesik dikdörtgen (sağ üst ve sol alt). */
export function chamfer(ctx, x, y, w, h, c) {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w - c, y);
  ctx.lineTo(x + w, y + c);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x + c, y + h);
  ctx.lineTo(x, y + h - c);
  ctx.closePath();
}

export const clamp01 = (t) => Math.min(1, Math.max(0, t));
export const easeOut = (t) => 1 - (1 - clamp01(t)) ** 3;
export const easeInOut = (t) => { const x = clamp01(t); return x < 0.5 ? 4 * x * x * x : 1 - ((-2 * x + 2) ** 3) / 2; };
export const easeBack = (t) => { const x = clamp01(t); const c = 1.70158; return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2; };
export const spaced = (ctx, px) => { try { ctx.letterSpacing = `${px}px`; } catch { /* eski tarayıcı */ } };
export const upper = (t) => String(t ?? "").toLocaleUpperCase("tr-TR");

/** Köşe ayraçları (out: dışa taşma px). */
export function brackets(ctx, r, len, lw, color, out = 0, cap = "square") {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.lineCap = cap;
  ctx.beginPath();
  const x0 = r.x - out; const y0 = r.y - out; const x1 = r.x + r.w + out; const y1 = r.y + r.h + out;
  for (const [x, y, dx, dy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]]) {
    ctx.moveTo(x, y + dy * len); ctx.lineTo(x, y); ctx.lineTo(x + dx * len, y);
  }
  ctx.stroke();
  ctx.restore();
}

/** Düz sekme (x, y sol üst; align "right" → x sağ kenar). → genişlik. */
export function tab(ctx, x, y, text, fs, bg, fg = "#fff", align = "left", { font = FONT, weight = 900, pad = 0.62, hmul = 1.85, sp = 0.06 } = {}) {
  ctx.font = `${weight} ${fs}px ${font}`;
  spaced(ctx, fs * sp);
  const w = ctx.measureText(text).width + fs * pad * 2.1;
  const h = fs * hmul;
  const x0 = align === "right" ? x - w : x;
  if (bg) { ctx.fillStyle = bg; ctx.fillRect(x0, y, w, h); }
  ctx.fillStyle = fg;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x0 + fs * pad, y + h * 0.54);
  spaced(ctx, 0);
  return w;
}

/** Metin genişliği (harf aralığıyla). */
export function textW(ctx, text, font, sp = 0) {
  ctx.font = font;
  spaced(ctx, sp);
  const w = ctx.measureText(text).width;
  spaced(ctx, 0);
  return w;
}

/** ✓ / ✕ (daire içinde). */
export function verdictIcon(ctx, x, y, r, positive, { bg = positive ? "#12a150" : "#c1121f", fg = "#fff", ring = null } = {}) {
  ctx.save();
  if (bg) { ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
  if (ring) { ctx.strokeStyle = ring; ctx.lineWidth = Math.max(1, r * 0.1); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke(); }
  ctx.strokeStyle = fg;
  ctx.lineWidth = Math.max(2, r * 0.24);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  if (positive) { ctx.moveTo(x - r * 0.45, y + r * 0.02); ctx.lineTo(x - r * 0.1, y + r * 0.36); ctx.lineTo(x + r * 0.48, y - r * 0.34); }
  else { ctx.moveTo(x - r * 0.38, y - r * 0.38); ctx.lineTo(x + r * 0.38, y + r * 0.38); ctx.moveTo(x + r * 0.38, y - r * 0.38); ctx.lineTo(x - r * 0.38, y + r * 0.38); }
  ctx.stroke();
  ctx.restore();
}

/* ─────────────── doku desenleri (önbellekli küçük tuvaller) ─────────────── */

const tiles = new Map();
function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  if (typeof document !== "undefined") { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; }
  return null;
}
function tile(key, w, h, paint) {
  if (tiles.has(key)) return tiles.get(key);
  const c = makeCanvas(w, h);
  if (!c) { tiles.set(key, null); return null; }
  const x = c.getContext("2d");
  if (x) paint(x, w, h);
  tiles.set(key, c);
  return c;
}

/** Karbon fiber deseni (cell px). */
export function carbonPattern(ctx, cell = 6) {
  const n = Math.max(3, Math.round(cell));
  const c = tile(`carbon:${n}`, n * 2, n * 2, (x, w, h) => {
    x.fillStyle = "#0b0e14";
    x.fillRect(0, 0, w, h);
    const paintCell = (cx, cy, vertical) => {
      const g = vertical ? x.createLinearGradient(cx, cy, cx + n, cy) : x.createLinearGradient(cx, cy, cx, cy + n);
      g.addColorStop(0, "#1b2230");
      g.addColorStop(0.5, "#2a3344");
      g.addColorStop(1, "#11151d");
      x.fillStyle = g;
      x.fillRect(cx + 0.5, cy + 0.5, n - 1, n - 1);
    };
    paintCell(0, 0, false); paintCell(n, 0, true); paintCell(0, n, true); paintCell(n, n, false);
  });
  try { return c ? ctx.createPattern(c, "repeat") : null; } catch { return null; }
}

/** Dama deseni (iki renk, cell px). */
export function checkerPattern(ctx, cell = 10, a = "#ffffff", b = "#111111") {
  const n = Math.max(2, Math.round(cell));
  const c = tile(`checker:${n}:${a}:${b}`, n * 2, n * 2, (x) => {
    x.fillStyle = a; x.fillRect(0, 0, n * 2, n * 2);
    x.fillStyle = b; x.fillRect(n, 0, n, n); x.fillRect(0, n, n, n);
  });
  try { return c ? ctx.createPattern(c, "repeat") : null; } catch { return null; }
}

/** Dama şeridi (desen yoksa elle). */
export function checkerStrip(ctx, x, y, w, h, cell, a = "#fff", b = "#111", off = 0) {
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.fillStyle = a;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = b;
  const rows = Math.ceil(h / cell);
  const start = -((off % (cell * 2)) + cell * 2);
  for (let r = 0; r < rows; r += 1) {
    for (let cx = start + (r % 2) * cell; cx < w; cx += cell * 2) ctx.fillRect(x + cx, y + r * cell, cell, cell);
  }
  ctx.restore();
}

/** Ekran simgeli "VAR" logosu: gövde rengi ve yazı rengi temaya göre. → genişlik. */
export function varMonitorBadge(ctx, x, y, h, { fill = "#ff3552", fill2 = "#b00020", ink = "#fff", stroke = "rgba(255,255,255,0.9)", radius = 0.16, s = 1 } = {}) {
  const w = h * 2.15;
  rr(ctx, x, y, w, h, h * radius);
  if (fill2) {
    const g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, fill);
    g.addColorStop(1, fill2);
    ctx.fillStyle = g;
  } else ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = Math.max(1.5, 2.5 * s); ctx.stroke(); }
  const sx = x + h * 0.14; const sy = y + h * 0.14; const sw = w - h * 0.28; const sh = h * 0.58;
  rr(ctx, sx, sy, sw, sh, h * 0.07);
  ctx.lineWidth = Math.max(2, h * 0.055);
  ctx.strokeStyle = ink;
  ctx.stroke();
  ctx.fillStyle = ink;
  ctx.fillRect(x + w / 2 - h * 0.05, sy + sh, h * 0.1, h * 0.09);
  ctx.fillRect(x + w / 2 - h * 0.22, sy + sh + h * 0.08, h * 0.44, h * 0.055);
  ctx.font = `900 ${h * 0.4}px ${FONT}`;
  spaced(ctx, h * 0.03);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("VAR", sx + sw / 2, sy + sh * 0.55);
  spaced(ctx, 0);
  return w;
}

/** Marka logosu (sağ kenara hizalı). → kullanılan genişlik (0 = yok). */
export function drawLogoRight(ctx, logo, right, cy, h, maxW) {
  if (!logo?.naturalWidth) return 0;
  const lw = Math.min(maxW, (logo.naturalWidth / logo.naturalHeight) * h);
  try { ctx.drawImage(logo, right - lw, cy - h / 2, lw, h); } catch { return 0; }
  return lw;
}

/** Açı penceresi bilgisinin sağ etiketi: "CANLI" / "0,5× AĞIR ÇEKİM" / null. */
export function paneTag(info) {
  if (info?.live) return { live: true, text: "CANLI" };
  if (info?.rate && info.rate < 1) return { live: false, text: `${String(info.rate).replace(".", ",")}× AĞIR ÇEKİM` };
  return null;
}
