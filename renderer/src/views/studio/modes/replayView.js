// TEKRAR düzenleyici — yakınlaştırma / kaydırma görünümü (saf hesap + çizim).
//
// Görünüm: { zoom: 1…MAX_ZOOM, cx, cy } — (cx, cy) görünen bölgenin merkezi,
// videonun normalize koordinatlarında (0…1). Görünen bölge 1/zoom genişliğinde.
// Aynı görünüm hem önizlemede hem yayında (programda) uygulanır: yayına alınan
// tekrar, operatörün yakınlaştırdığı bölgeyi gösterir. Görünüm klip + açı başına
// tutulur (kuyruktaki her açının kendi kırpması).

export const MAX_ZOOM = 6;
export const DEFAULT_VIEW = Object.freeze({ zoom: 1, cx: 0.5, cy: 0.5 });
export const FRAME_SEC = 1 / 30;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const num = (v, fb) => (Number.isFinite(Number(v)) ? Number(v) : fb);

/** Görünümü sınırlar içine alır (bölge kare dışına taşmaz). */
export function clampView(v) {
  const zoom = clamp(num(v?.zoom, 1), 1, MAX_ZOOM);
  const half = 0.5 / zoom;
  return { zoom, cx: clamp(num(v?.cx, 0.5), half, 1 - half), cy: clamp(num(v?.cy, 0.5), half, 1 - half) };
}

export const isZoomed = (v) => num(v?.zoom, 1) > 1.001;

/**
 * Bir noktanın (px, py: görüntüde 0…1) altında kalarak yakınlaştır.
 * factor > 1 yaklaştırır, < 1 uzaklaştırır.
 */
export function zoomAt(view, px, py, factor) {
  const v = clampView(view);
  const z2 = clamp(v.zoom * factor, 1, MAX_ZOOM);
  const u = v.cx + (px - 0.5) / v.zoom;
  const w = v.cy + (py - 0.5) / v.zoom;
  return clampView({ zoom: z2, cx: u - (px - 0.5) / z2, cy: w - (py - 0.5) / z2 });
}

/** Sürükle: görüntüde (dx, dy) kadar (0…1) kaydır. */
export function panBy(view, dx, dy) {
  const v = clampView(view);
  return clampView({ ...v, cx: v.cx - dx / v.zoom, cy: v.cy - dy / v.zoom });
}

/** Yakınlaştırma düzeyini merkez korunarak değiştir (kaydırıcı). */
export const setZoom = (view, zoom) => clampView({ ...clampView(view), zoom });

/** Videonun kaynak dikdörtgeni (piksel): drawImage(el, sx, sy, sw, sh, …). */
export function zoomRect(vw, vh, view) {
  const v = clampView(view);
  const sw = vw / v.zoom;
  const sh = vh / v.zoom;
  return { sx: clamp(v.cx * vw - sw / 2, 0, vw - sw), sy: clamp(v.cy * vh - sh / 2, 0, vh - sh), sw, sh };
}

/** Görünüm anahtarı: klip + açı. */
export const viewKey = (replayId, angle) => `${replayId || ""}|${angle || ""}`;

/** Zaman damgası "0:07.4" (tekrar düzenleyicisi). */
export function clipTime(sec) {
  const s = Math.max(0, num(sec, 0));
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${m}:${r < 10 ? "0" : ""}${r.toFixed(1).replace(".", ",")}`;
}

/**
 * Videoyu görünümle (kırpılmış bölge) tam kareye "contain" çizer. false: kare hazır değil.
 * Yayın tuvali ve düzenleyici aynı işlevi kullanır.
 */
export function drawVideoView(ctx, video, W, H, view) {
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);
  const vw = video?.videoWidth;
  const vh = video?.videoHeight;
  if (!vw || !vh || (video.readyState ?? 0) < 2) return false;
  const r = zoomRect(vw, vh, view);
  const scale = Math.min(W / r.sw, H / r.sh);
  const dw = r.sw * scale;
  const dh = r.sh * scale;
  try { ctx.drawImage(video, r.sx, r.sy, r.sw, r.sh, (W - dw) / 2, (H - dh) / 2, dw, dh); } catch { return false; }
  return true;
}
