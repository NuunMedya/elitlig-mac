// Yayın grafikleri · tuval yardımcıları: ölçü önbelleği, yazı tipi, kutular,
// görsel sığdırma ve katman önbelleği (durağan paneller her karede yeniden
// çizilmez; yalnız içerik değişince bir kez boyanır, sonra drawImage).

/** Kalın yazı tipi dizgesi; px sahne pikseli. */
export const fontOf = (px, weight = 800, family = "Archivo, sans-serif") => `${weight} ${Math.max(1, px).toFixed(1)}px ${family}`;

/**
 * Ölçü önbelleği: aynı (yazı tipi, metin) bir kez ölçülür. Harf aralıklı
 * metin harf harf ölçülür (ctx.letterSpacing kullanılmaz: Chromium'da sıfıra
 * dönüşü güvenilir değil, sonraki yazılara sızıyor).
 * Dönen işlev measure(text, font, spacing = 0) → px.
 */
export function createMeasure(ctx, { limit = 4000 } = {}) {
  const cache = new Map();
  const raw = (t, font) => {
    const key = `${font}|${t}`;
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    ctx.font = font;
    const w = ctx.measureText(t).width;
    if (cache.size > limit) cache.clear();
    cache.set(key, w);
    return w;
  };
  const measure = (text, font, spacing = 0) => {
    const t = String(text ?? "");
    if (!t) return 0;
    if (!spacing) return raw(t, font);
    let w = 0;
    for (const ch of t) w += raw(ch, font);
    return w + spacing * (Array.from(t).length - 1);
  };
  measure.cache = cache;
  return measure;
}

/** Metni en çok maxW genişliğe sığdırır ("…" ile). */
export function fitText(text, maxW, font, measure, spacing = 0) {
  const t = String(text ?? "");
  if (measure(t, font, spacing) <= maxW) return t;
  let lo = 0;
  let hi = t.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (measure(`${t.slice(0, mid).trimEnd()}…`, font, spacing) <= maxW) lo = mid; else hi = mid - 1;
  }
  return lo > 0 ? `${t.slice(0, lo).trimEnd()}…` : "…";
}

/** Metni en çok maxLines satıra böler (kelime sınırından); son satır "…" ile sığar. */
export function wrapLines(text, maxW, font, measure, maxLines = 2, spacing = 0) {
  const words = String(text ?? "").trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = "";
  for (let i = 0; i < words.length; i += 1) {
    const next = cur ? `${cur} ${words[i]}` : words[i];
    if (measure(next, font, spacing) <= maxW || !cur) { cur = next; continue; }
    lines.push(cur);
    cur = words[i];
    if (lines.length === maxLines - 1) { cur = words.slice(i).join(" "); break; }
  }
  if (cur) lines.push(cur);
  return lines.slice(0, maxLines).map((l) => fitText(l, maxW, font, measure, spacing));
}

/** Yazıyı (isteğe bağlı harf aralığıyla, harf harf) çizer. */
export function drawText(ctx, text, x, y, { font, color, align = "left", spacing = 0, baseline = "middle", alpha = 1 } = {}) {
  const t = String(text ?? "");
  if (!t) return;
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textBaseline = baseline;
  const a0 = ctx.globalAlpha;
  if (alpha !== 1) ctx.globalAlpha = a0 * alpha;
  if (spacing) {
    const chars = Array.from(t);
    const widths = chars.map((ch) => ctx.measureText(ch).width);
    const w = widths.reduce((s, v) => s + v, 0) + spacing * (chars.length - 1);
    let cx = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
    ctx.textAlign = "left";
    chars.forEach((ch, i) => { ctx.fillText(ch, cx, y); cx += widths[i] + spacing; });
  } else {
    ctx.textAlign = align;
    ctx.fillText(t, x, y);
  }
  ctx.globalAlpha = a0;
  ctx.textAlign = "left";
}

export function roundRect(ctx, x, y, w, h, r) {
  const rr = Array.isArray(r) ? r : [r, r, r, r];
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") ctx.roundRect(x, y, Math.max(0, w), Math.max(0, h), rr);
  else ctx.rect(x, y, w, h);
}

export function fillRound(ctx, x, y, w, h, r, fill) {
  roundRect(ctx, x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
}

export const vGrad = (ctx, y0, y1, stops) => {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  stops.forEach(([at, c]) => g.addColorStop(at, c));
  return g;
};
export const hGrad = (ctx, x0, x1, stops) => {
  const g = ctx.createLinearGradient(x0, 0, x1, 0);
  stops.forEach(([at, c]) => g.addColorStop(at, c));
  return g;
};

export const imgReady = (img) => Boolean(img && (img.complete === undefined || img.complete) && (img.naturalWidth || img.videoWidth || img.width));

export function drawContain(ctx, img, x, y, w, h) {
  if (!imgReady(img)) return false;
  const iw = img.naturalWidth || img.videoWidth || img.width;
  const ih = img.naturalHeight || img.videoHeight || img.height;
  const k = Math.min(w / iw, h / ih);
  ctx.drawImage(img, x + (w - iw * k) / 2, y + (h - ih * k) / 2, iw * k, ih * k);
  return true;
}

/** Kapla (object-fit: cover; üstten hizalı) — oyuncu fotoğrafları. */
export function drawCover(ctx, img, x, y, w, h, { top = true } = {}) {
  if (!imgReady(img)) return false;
  const iw = img.naturalWidth || img.videoWidth || img.width;
  const ih = img.naturalHeight || img.videoHeight || img.height;
  const k = Math.max(w / iw, h / ih);
  const sw = w / k;
  const sh = h / k;
  const sx = (iw - sw) / 2;
  const sy = top ? 0 : (ih - sh) / 2;
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  return true;
}

/** Yuvarlak avatar: fotoğraf, yoksa arma, yoksa baş harfler. */
export function drawAvatar(ctx, { x, y, d, photo, crest, initials, bg, ring, ringW = 2, textColor = "#fff", family }) {
  const r = d / 2;
  ctx.save();
  ctx.beginPath();
  ctx.arc(x + r, y + r, r, 0, Math.PI * 2);
  ctx.fillStyle = bg;
  ctx.fill();
  if (ring) { ctx.lineWidth = ringW; ctx.strokeStyle = ring; ctx.stroke(); }
  ctx.clip();
  if (!drawCover(ctx, photo, x, y, d, d)) {
    if (!drawContain(ctx, crest, x + d * 0.17, y + d * 0.17, d * 0.66, d * 0.66) && initials) {
      drawText(ctx, initials, x + r, y + r + 1, { font: fontOf(d * 0.34, 800, family), color: textColor, align: "center" });
    }
  }
  ctx.restore();
}

/** "Ahmet Yılmaz" → "AY". */
export const initialsOf = (name = "") => String(name).split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p.charAt(0)).join("").toLocaleUpperCase("tr-TR");

/** Web shortenName: göbek adları baş harfe iner. */
export function shortenName(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 2) return parts.join(" ");
  const middles = parts.slice(1, -1).map((w) => `${w[0].toLocaleUpperCase("tr-TR")}.`).join(" ");
  return `${parts[0]} ${middles} ${parts[parts.length - 1]}`;
}

export const upper = (v) => String(v ?? "").toLocaleUpperCase("tr-TR");

/* ------------------------------ katman önbelleği ------------------------------ */

function makeCanvas(w, h) {
  if (typeof document !== "undefined" && document.createElement) {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    return c;
  }
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  return null;
}

/**
 * Durağan katmanlar: get(key, w, h, paint) → tuval (paint(ctx) yalnız anahtar
 * değişince). Tuval oluşturulamıyorsa (test ortamı) null; çağıran doğrudan çizer.
 */
export function createLayerCache({ max = 10 } = {}) {
  const map = new Map();
  return {
    get(key, w, h, paint) {
      const W = Math.max(1, Math.ceil(w));
      const H = Math.max(1, Math.ceil(h));
      const k = `${W}x${H}|${key}`;
      const hit = map.get(k);
      if (hit) { map.delete(k); map.set(k, hit); return hit; }
      const c = makeCanvas(W, H);
      if (!c) return null;
      const cx = c.getContext("2d");
      paint(cx);
      map.set(k, c);
      while (map.size > max) map.delete(map.keys().next().value);
      return c;
    },
    clear() { map.clear(); },
    get size() { return map.size; },
  };
}

/** Giriş hareketi: 0 → 1 (ease-out), süre ms. */
export function enter(now, since, ms = 460) {
  if (!since) return 1;
  const t = Math.min(1, Math.max(0, (now - since) / ms));
  return 1 - (1 - t) ** 3;
}
