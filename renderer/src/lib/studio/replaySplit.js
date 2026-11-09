// Yayın Stüdyosu — YAN YANA TEKRAR (saf model): aynı pozisyonun 2–4 açısı aynı anda,
// zamanda eşli (aynı duvar saati anı), bölünmüş ekranda.
//
// Yerleşimler (SPLIT_LAYOUTS):
//   yan     50 / 50 yan yana (tam yükseklik, kırpılmış)
//   ustalt  üst–alt (iki 16:9 pencere üst üste)
//   pip     büyük + küçük (köşede küçük pencere)
//   uclu    1 büyük + 2 küçük (sağda üst üste)
//   grid    2 × 2
// Bölme: { layout, fit: "cover" | "contain", panes: [{ angle, offsetFrames, view }] }
//   panes[0] ANA açıdır: ortak taşıma (oynat / duraklat / sar / hız / kare kare) onu sürer,
//   öbür açılar ona eşlenir (paneTime) ve sapma düzeltmesiyle (driftAction) izler.
//
// ZAMAN EŞİ: açı kayıtları yakalama anında BİTER (süreleri farklı olabilir) → aynı an
// tB = tA + (süreB − süreA). Açıda başlangıç duvar saati (startWall, ms) varsa o kullanılır:
// tB = tA + (startWallA − startWallB) / 1000. Kameralar arası gecikme için pencere başına
// elle ±kare kayması (offsetFrames, 30 fps karesi).
//
// [gol-klip] Bölünmüş tekrar yayına verilince yükleme hattına (markAiredSelection) yine ANA
// açının (panes[0]) bölümü bildirilir: profile giden gol klibi bölünmüş görüntü DEĞİL, seçili
// ilk açının dizisidir (önceki davranış).

export const SPLIT_FPS = 30;
export const SPLIT_LAYOUTS = Object.freeze([
  { key: "yan", label: "Yan yana", short: "50/50", n: 2 },
  { key: "ustalt", label: "Üst–alt", short: "Üst–alt", n: 2 },
  { key: "pip", label: "Büyük + küçük", short: "PiP", n: 2 },
  { key: "uclu", label: "1 + 2", short: "1+2", n: 3 },
  { key: "grid", label: "2 × 2", short: "2×2", n: 4 },
]);
export const MAX_PANES = 4;
export const MAX_OFFSET_FRAMES = 90;

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export const layoutOf = (key) => SPLIT_LAYOUTS.find((l) => l.key === key) || SPLIT_LAYOUTS[0];

/** Açı sayısına uygun varsayılan yerleşim: 2 → yan yana, 3 → 1 + 2, 4 → 2 × 2. */
export const layoutFor = (n) => (n >= 4 ? "grid" : n === 3 ? "uclu" : "yan");

/** Yerleşimin gösterdiği pencere sayısı (açı sayısıyla sınırlı). */
export function paneCount(layout, n) {
  const l = layoutOf(layout);
  if (l.key === "grid") return clamp(num(n, 4), 2, 4);
  return Math.min(l.n, Math.max(1, num(n, l.n)));
}

/**
 * Pencere dikdörtgenleri (piksel). gap: bölücü kalınlığı (yoksa W / 640).
 * Dönüş: [{ x, y, w, h, main?, inset? }] (sıra = panes sırası).
 */
export function splitRects(layout, n, W, H, { gap } = {}) {
  const g = gap == null ? Math.max(2, Math.round(W / 640)) : gap;
  const k = paneCount(layout, n);
  const key = layoutOf(layout).key;
  if (key === "yan") {
    const w = (W - g) / 2;
    return [{ x: 0, y: 0, w, h: H, main: true }, { x: w + g, y: 0, w, h: H }].slice(0, k);
  }
  if (key === "ustalt") {
    const h = (H - g) / 2;
    const w = Math.min(W, h * (16 / 9));
    const x = (W - w) / 2;
    return [{ x, y: 0, w, h, main: true }, { x, y: h + g, w, h }].slice(0, k);
  }
  if (key === "pip") {
    const w = W * 0.34;
    const h = w * (H / W);
    const m = W * 0.025;
    return [{ x: 0, y: 0, w: W, h: H, main: true }, { x: W - w - m, y: H - h - m * 1.6, w, h, inset: true }].slice(0, k);
  }
  if (key === "uclu") {
    const lw = (W - g) * (2 / 3);
    const rw = W - lw - g;
    const rh = (H - g) / 2;
    return [{ x: 0, y: 0, w: lw, h: H, main: true }, { x: lw + g, y: 0, w: rw, h: rh }, { x: lw + g, y: rh + g, w: rw, h: rh }].slice(0, k);
  }
  // 2 × 2 (3 açıda son hücre boş kalır)
  const w = (W - g) / 2;
  const h = (H - g) / 2;
  return [{ x: 0, y: 0, w, h, main: true }, { x: w + g, y: 0, w, h }, { x: 0, y: h + g, w, h }, { x: w + g, y: h + g, w, h }].slice(0, k);
}

/** Nokta (piksel ya da 0…1 — rects ile aynı birimde) hangi pencerede? Üstteki (iç pencere) önce. */
export function hitPane(rects, x, y) {
  for (let i = (rects || []).length - 1; i >= 0; i -= 1) {
    const r = rects[i];
    if (r.inset && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return i;
  }
  for (let i = 0; i < (rects || []).length; i += 1) {
    const r = rects[i];
    if (!r.inset && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return i;
  }
  return -1;
}

/* ───────────────────────── zaman eşi ───────────────────────── */

/**
 * Ana açıdan (from) pencere açısına (to) zaman farkı (sn): tTo = tFrom + delta.
 * from / to: { durationMs, startWall? } (startWall: kaydın ilk karesinin duvar saati, ms).
 */
export function angleDelta(from, to) {
  const wa = num(from?.startWall, 0);
  const wb = num(to?.startWall, 0);
  if (wa > 0 && wb > 0) return (wa - wb) / 1000;
  const da = num(from?.durationMs, 0) / 1000;
  const db = num(to?.durationMs, 0) / 1000;
  return da && db ? db - da : 0;
}

/** Pencerenin hedef zamanı (sn): ana zaman + açı farkı + elle kare kayması (sınırlı). */
export function paneTime(masterT, delta, offsetFrames = 0, { dur = 0, fps = SPLIT_FPS } = {}) {
  const t = num(masterT, 0) + num(delta, 0) + num(offsetFrames, 0) / fps;
  const d = num(dur, 0);
  return d > 0 ? clamp(t, 0, Math.max(0, d - 0.02)) : Math.max(0, t);
}

/**
 * Sapma düzeltmesi: hedef (target) ile pencerenin gerçek zamanı (actual) arasındaki fark.
 *   duraklatılmışken: yarım kareden fazlaysa → seek
 *   oynarken: |fark| > seekAbove → seek (ileri atlama: kod çözme gecikmesi için küçük öncü);
 *             |fark| > nudgeAbove → hızı ±%8'e kadar ayarla (yumuşak yakalama);
 *             değilse ana hız.
 * Dönüş: { type: "seek", t } | { type: "rate", rate } | { type: "ok", rate }
 */
export function driftAction(target, actual, { paused = false, rate = 1, seekAbove = 0.25, nudgeAbove = 1 / 60, gain = 0.6, lead = 0.04 } = {}) {
  const d = num(target, 0) - num(actual, 0);
  const r = num(rate, 1) || 1;
  if (paused) return Math.abs(d) > 0.5 / SPLIT_FPS ? { type: "seek", t: num(target, 0) } : { type: "ok", rate: r };
  if (Math.abs(d) > seekAbove) return { type: "seek", t: num(target, 0) + (d > 0 ? lead * r : 0) };
  if (Math.abs(d) > nudgeAbove) return { type: "rate", rate: Math.round(r * (1 + clamp(d * gain, -0.08, 0.08)) * 1000) / 1000 };
  return { type: "ok", rate: r };
}

/**
 * Ana öğenin rVFC ile ölçülen zamanı (mediaTime) + o andan beri geçen süre × hız
 * (currentTime'dan daha kararlı; oynarken). sample: { mediaTime, at } | null.
 */
export function estimateMasterTime(sample, now, { rate = 1, paused = false, fallback = 0 } = {}) {
  if (!sample || !Number.isFinite(sample.mediaTime)) return num(fallback, 0);
  if (paused) return num(fallback, sample.mediaTime);
  const dt = Math.max(0, Math.min(0.25, (num(now, 0) - num(sample.at, 0)) / 1000));
  return sample.mediaTime + dt * (num(rate, 1) || 1);
}

/* ───────────────────────── bölme durumu ───────────────────────── */

const copyView = (v) => ({ zoom: Math.max(1, num(v?.zoom, 1)), cx: num(v?.cx, 0.5), cy: num(v?.cy, 0.5) });

/**
 * Bölmeyi tekrara göre düzelt: yalnız oynatılabilir açılar, 2…4 pencere, tekrarsız.
 * Dönüş: bölme ya da null (iki oynatılabilir açı yok).
 */
export function normalizeSplit(split, replay) {
  const have = (replay?.angles || []).filter((a) => a?.url).map((a) => String(a.angle));
  const seen = new Set();
  const panes = [];
  for (const p of split?.panes || []) {
    const a = String(p?.angle || "");
    if (!have.includes(a) || seen.has(a)) continue;
    seen.add(a);
    panes.push({ angle: a, offsetFrames: Math.round(clamp(num(p.offsetFrames, 0), -MAX_OFFSET_FRAMES, MAX_OFFSET_FRAMES)), view: copyView(p.view) });
    if (panes.length >= MAX_PANES) break;
  }
  if (panes.length < 2) return null;
  const layout = SPLIT_LAYOUTS.some((l) => l.key === split?.layout) ? split.layout : layoutFor(panes.length);
  const fit = split?.fit === "contain" ? "contain" : "cover";
  return { layout, fit, labels: split?.labels !== false, panes: panes.slice(0, layout === "grid" ? 4 : layoutOf(layout).n) };
}

/** Açılardan yeni bölme (sıra korunur; layout verilmezse açı sayısına göre). */
export function splitFromAngles(replay, angles, { layout = null, fit = "cover" } = {}) {
  return normalizeSplit({ layout, fit, panes: (angles || []).map((angle) => ({ angle })) }, replay);
}

/** Yerleşim değişince fazladan açılar korunur ama gösterilmez: açı listesi ayrıca tutulur. */
export function withLayout(split, layout, replay, angles = null) {
  if (!split) return null;
  const pool = [...split.panes];
  for (const a of angles || []) if (!pool.some((p) => p.angle === a)) pool.push({ angle: a });
  return normalizeSplit({ ...split, layout, panes: pool }, replay);
}

/** Pencerenin kare kayması (±1 ya da mutlak). */
export function setPaneOffset(split, i, frames, { relative = true } = {}) {
  if (!split?.panes?.[i]) return split;
  const panes = split.panes.map((p, k) => (k === i ? { ...p, offsetFrames: Math.round(clamp((relative ? p.offsetFrames : 0) + num(frames, 0), -MAX_OFFSET_FRAMES, MAX_OFFSET_FRAMES)) } : p));
  return { ...split, panes };
}

export const setPaneView = (split, i, view) => (split?.panes?.[i] ? { ...split, panes: split.panes.map((p, k) => (k === i ? { ...p, view: copyView(view) } : p)) } : split);

/** Pencereleri yer değiştir (ana açıyı değiştirmek için: i ↔ 0). */
export function swapPanes(split, i, j = 0) {
  if (!split?.panes?.[i] || !split.panes[j] || i === j) return split;
  const panes = [...split.panes];
  [panes[i], panes[j]] = [panes[j], panes[i]];
  return { ...split, panes };
}

/** İki bölme aynı mı (yük karşılaştırması). */
export function sameSplit(a, b) {
  if (!a || !b) return !a && !b;
  if (a.layout !== b.layout || a.fit !== b.fit || (a.labels !== false) !== (b.labels !== false) || a.panes.length !== b.panes.length) return false;
  return a.panes.every((p, i) => {
    const q = b.panes[i];
    return p.angle === q.angle && p.offsetFrames === q.offsetFrames && p.view.zoom === q.view.zoom && p.view.cx === q.view.cx && p.view.cy === q.view.cy;
  });
}

/**
 * Yüke (previewTake) eklenecek bölme: pencereler açının url / süresi ve ana açıya göre
 * zaman farkıyla (delta). Dönüş: { layout, fit, panes: [{ angle, url, durationMs, startWall, offsetFrames, view, delta }] } | null
 */
export function splitForPayload(split, replay) {
  const s = normalizeSplit(split, replay);
  if (!s) return null;
  const by = (id) => (replay.angles || []).find((a) => String(a.angle) === id) || {};
  const main = by(s.panes[0].angle);
  return {
    layout: s.layout,
    fit: s.fit,
    labels: s.labels,
    panes: s.panes.map((p) => {
      const a = by(p.angle);
      return { angle: p.angle, url: a.url, durationMs: num(a.durationMs, 0) || num(replay.durationMs, 0), startWall: num(a.startWall, 0) || null, offsetFrames: p.offsetFrames, view: { ...p.view }, delta: angleDelta(main, a) };
    }),
  };
}

/* ───────────────────────── çizim hesabı ───────────────────────── */

/**
 * Pencereye çizilecek kaynak bölgesi (piksel): "cover" pencerenin en-boy oranında kırpar,
 * "contain" tüm kareyi sığdırır; görünüm (zoom, cx, cy) bunun üstüne yakınlaştırır.
 * Dönüş: { sx, sy, sw, sh, dx, dy, dw, dh } (d*: pencere içinde hedef).
 */
export function paneSource(vw, vh, view, rect, fit = "cover") {
  const z = Math.max(1, num(view?.zoom, 1));
  const ra = rect.w / rect.h;
  const va = vw / vh;
  let bw = vw;
  let bh = vh;
  if (fit === "cover") { if (va > ra) bw = vh * ra; else bh = vw / ra; }
  const sw = bw / z;
  const sh = bh / z;
  const sx = clamp(num(view?.cx, 0.5) * vw - sw / 2, 0, vw - sw);
  const sy = clamp(num(view?.cy, 0.5) * vh - sh / 2, 0, vh - sh);
  if (fit === "cover") return { sx, sy, sw, sh, dx: rect.x, dy: rect.y, dw: rect.w, dh: rect.h };
  const k = Math.min(rect.w / sw, rect.h / sh);
  const dw = sw * k;
  const dh = sh * k;
  return { sx, sy, sw, sh, dx: rect.x + (rect.w - dw) / 2, dy: rect.y + (rect.h - dh) / 2, dw, dh };
}

/** Video noktası (0…1) → tuval pikseli, kaynak bölgesine göre (null: bölge dışında). */
export function videoToCanvas(src, vw, vh, u, v) {
  const px = u * vw;
  const py = v * vh;
  const x = src.dx + ((px - src.sx) / src.sw) * src.dw;
  const y = src.dy + ((py - src.sy) / src.sh) * src.dh;
  return { x, y, inside: px >= src.sx && px <= src.sx + src.sw && py >= src.sy && py <= src.sy + src.sh, scale: src.dh / src.sh };
}

/** Tuval pikseli → video noktası (0…1). */
export function canvasToVideo(src, vw, vh, x, y) {
  return { u: (src.sx + ((x - src.dx) / src.dw) * src.sw) / vw, v: (src.sy + ((y - src.dy) / src.dh) * src.sh) / vh };
}

/**
 * Bölücü çizgileri (piksel dikdörtgenler): yan yana pencerelerin arasındaki boşluk.
 * İç pencere (pip) kendi çerçevesini çizer.
 */
export function splitDividers(rects, W, H) {
  const out = [];
  const tiles = (rects || []).filter((r) => !r.inset);
  const eps = 0.5;
  for (const a of tiles) {
    for (const b of tiles) {
      if (a === b) continue;
      const gx = b.x - (a.x + a.w);
      if (gx > -eps && gx < W * 0.02 && b.y < a.y + a.h && a.y < b.y + b.h) {
        const y0 = Math.max(a.y, b.y);
        const y1 = Math.min(a.y + a.h, b.y + b.h);
        out.push({ x: a.x + a.w, y: y0, w: Math.max(1, gx), h: y1 - y0 });
      }
      const gy = b.y - (a.y + a.h);
      if (gy > -eps && gy < H * 0.03 && b.x < a.x + a.w && a.x < b.x + b.w) {
        const x0 = Math.max(a.x, b.x);
        const x1 = Math.min(a.x + a.w, b.x + b.w);
        out.push({ x: x0, y: a.y + a.h, w: x1 - x0, h: Math.max(1, gy) });
      }
    }
  }
  return out;
}

/** Normalize (0…1) pencere dikdörtgenleri: kaplama (DOM) isabet testi ve etiketler için. */
export function splitRectsNorm(layout, n, aspect = 16 / 9) {
  const W = 1600;
  const H = W / aspect;
  return splitRects(layout, n, W, H).map((r) => ({ ...r, x: r.x / W, y: r.y / H, w: r.w / W, h: r.h / H }));
}

/** Pencerede kaydırma / yakınlaştırma ölçeği: kırpılmış (cover) pencere kaynağın bir kesridir. */
export function paneScale(vw, vh, rect, fit = "cover") {
  if (fit !== "cover" || !vw || !vh || !rect?.w || !rect?.h) return { x: 1, y: 1 };
  const ra = rect.w / rect.h;
  const va = vw / vh;
  return va > ra ? { x: ra / va, y: 1 } : { x: 1, y: va / ra };
}

/** Pencere görünümünü sınırla: kırpılmış pencerede kaydırma kaynağın kesri kadar serbest (k: paneScale). */
export function clampPaneView(view, k = { x: 1, y: 1 }) {
  const zoom = clamp(num(view?.zoom, 1), 1, 6);
  const hx = (0.5 * num(k?.x, 1)) / zoom;
  const hy = (0.5 * num(k?.y, 1)) / zoom;
  return { zoom, cx: clamp(num(view?.cx, 0.5), hx, 1 - hx), cy: clamp(num(view?.cy, 0.5), hy, 1 - hy) };
}

/**
 * Pencerede imlecin altına yakınlaş. px / py: pencerede 0…1; k: paneScale (kırpılmış pencere).
 * Sınırlama setPaneView'da (clampPaneView) yapılır.
 */
export function paneZoomAt(view, px, py, factor, k = { x: 1, y: 1 }) {
  const z = Math.max(1, num(view?.zoom, 1));
  const z2 = clamp(z * num(factor, 1), 1, 6);
  const ax = (num(px, 0.5) - 0.5) * num(k?.x, 1);
  const ay = (num(py, 0.5) - 0.5) * num(k?.y, 1);
  const u = num(view?.cx, 0.5) + ax / z;
  const w = num(view?.cy, 0.5) + ay / z;
  return { zoom: z2, cx: u - ax / z2, cy: w - ay / z2 };
}

/** Pencerede sürükle (dx, dy: pencere oranı). */
export function panePanBy(view, dx, dy, k = { x: 1, y: 1 }) {
  const z = Math.max(1, num(view?.zoom, 1));
  return { zoom: z, cx: num(view?.cx, 0.5) - (num(dx, 0) * num(k?.x, 1)) / z, cy: num(view?.cy, 0.5) - (num(dy, 0) * num(k?.y, 1)) / z };
}

/** Tek görüntü (bölmesiz) için kaynak bölgesi: replayView.drawVideoView ile aynı (contain + zoomRect). */
export function singleSource(vw, vh, view, W, H) {
  return paneSource(vw, vh, view, { x: 0, y: 0, w: W, h: H }, "contain");
}
