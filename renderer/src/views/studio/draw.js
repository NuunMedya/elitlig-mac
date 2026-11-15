// Yayın Stüdyosu — tuvale sahne / katman çizimi (program, önizleme, çoklu
// görünüm, küçük resimler ve LED çıkışı aynı işlevleri kullanır).
//
// Katman: kutu (0…1) → piksel; kırpma kaynağın kenarlarından; kutu içinde
// sığdırma (uzat / sığdır / doldur); ayna; döndürme kutu merkezinde.
// Yapay kaynaklar (renk / gradyan, metin, saat, slayt) burada boyanır.
import { fitRect } from "../../lib/studio/layouts";
import { clockText, slideIndex } from "../../lib/studio/scenes";
import { effectiveFx, fxActive, fxOrientOnly } from "../../lib/studio/videoFx";
import { processFrame } from "./fx/fxProcessor";
import { MAX_VIDEO_DELAY_MS, pickDelayed, regionPixels, tickerOffset } from "../../lib/studio/liveSources";
import { isFullVisibility, layerVisibility } from "../../lib/studio/layerAnim";

// Ana iş parçacığında da ayrı çizim işçisinde de (compositor/program.worker.js) çalışır:
// DOM sınıfları yoksa (işçi) VideoFrame / ImageBitmap / OffscreenCanvas kullanılır.
const HAS = (name) => typeof globalThis[name] === "function";
const isVideoEl = (el) => HAS("HTMLVideoElement") && el instanceof HTMLVideoElement;
const isImageEl = (el) => HAS("HTMLImageElement") && el instanceof HTMLImageElement;
const isCanvasEl = (el) => (HAS("HTMLCanvasElement") && el instanceof HTMLCanvasElement) || (HAS("OffscreenCanvas") && el instanceof OffscreenCanvas);
const isFrame = (el) => HAS("VideoFrame") && el instanceof VideoFrame;
const isBitmap = (el) => HAS("ImageBitmap") && el instanceof ImageBitmap;
/** Ekran dışı tuval (işçide OffscreenCanvas). */
export function makeCanvas(w = 2, h = 2) {
  if (typeof document !== "undefined" && document.createElement) { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; }
  return new OffscreenCanvas(w, h);
}

const PLACEHOLDER = {
  waiting: "Açılıyor…",
  missing: "Kaynak yok",
  denied: "İzin yok",
  ended: "Bağlantı koptu",
  busy: "Başka uygulama kullanıyor",
  error: "Açılamadı",
  file: "Dosyayı yeniden seç",
  empty: "Tekrar yok",
  standby: "Cihaz bekleniyor",
  live: "Görüntü bekleniyor",
};

/**
 * Ekran bölgesi: ekran görüntüsünün seçilen dikdörtgeni kendi tuvaline (kare başına
 * bir kez; program / önizleme / küçük resim aynı kopyayı kullanır).
 */
function regionDrawable(rt, d, source, now) {
  const { sx, sy, sw, sh } = regionPixels(source.region, d.w, d.h);
  let c = rt.regionCanvas;
  if (!c) { c = makeCanvas(); rt.regionCanvas = c; }
  if (c.width !== sw || c.height !== sh) { c.width = sw; c.height = sh; rt.regionAt = -1; }
  if (now - (rt.regionAt ?? -1) >= 8 || now < rt.regionAt) {
    rt.regionAt = now;
    try { c.getContext("2d").drawImage(d.el, sx, sy, sw, sh, 0, 0, sw, sh); } catch { /* kare hazır değil */ }
  }
  return { el: c, w: sw, h: sh };
}

/**
 * Görüntü gecikmesi (ses / görüntü eşleme, 0–500 ms): her yeni karede halkaya kopya,
 * `delayMs` önceki kare çizilir. Kopyalar en çok 1920 px genişlikte tutulur.
 */
function delayedDrawable(rt, d, delayMs, now) {
  let ring = rt.delayRing;
  if (!ring) { ring = { frames: [], spare: [] }; rt.delayRing = ring; }
  const last = ring.frames[ring.frames.length - 1];
  if (!last || now - last.t >= 12 || now < last.t) {
    const k = Math.min(1, 1920 / d.w);
    const w = Math.max(2, Math.round(d.w * k));
    const h = Math.max(2, Math.round(d.h * k));
    // Gerekenden eski kareler geri dönüşüme (tuval yeniden kullanılır).
    while (ring.frames.length > 1 && ring.frames[1].t <= now - delayMs - 40) ring.spare.push(ring.frames.shift().c);
    if (ring.frames.length > 90) ring.spare.push(ring.frames.shift().c);
    const c = ring.spare.pop() || makeCanvas();
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    try { c.getContext("2d").drawImage(d.el, 0, 0, w, h); ring.frames.push({ t: now, c }); } catch { ring.spare.push(c); }
    if (ring.spare.length > 4) ring.spare.length = 4;
  }
  const i = pickDelayed(ring.frames, now, delayMs);
  if (i < 0) return d;
  const c = ring.frames[i].c;
  return { el: c, w: c.width, h: c.height };
}

/** Kaynağın çizilebilir öğesi ve doğal boyutu; hazır değilse null. source: bölge / gecikme için. */
export function drawableOf(rt, now = 0, source = null) {
  const d = baseDrawable(rt, now);
  if (!d || !source) return d;
  let out = d;
  if (source.kind === "region" && source.region) out = regionDrawable(rt, out, source, now);
  const delay = Math.min(MAX_VIDEO_DELAY_MS, Number(source.videoDelayMs) || 0);
  if (delay > 0 && (isVideoEl(out.el) || isCanvasEl(out.el) || isFrame(out.el))) out = delayedDrawable(rt, out, delay, now);
  else if (rt.delayRing) rt.delayRing = null;
  return out;
}

function baseDrawable(rt, now = 0) {
  if (!rt || rt.status !== "live") return null;
  if (rt.images) {
    const list = rt.images.filter((im) => (isBitmap(im) ? im.width : im.complete && im.naturalWidth));
    if (!list.length) return null;
    const im = list[slideIndex(list.length, rt.intervalMs, now)];
    return isBitmap(im) ? { el: im, w: im.width, h: im.height } : { el: im, w: im.naturalWidth, h: im.naturalHeight };
  }
  const el = rt.el;
  if (!el) return null;
  if (isFrame(el)) return el.displayWidth ? { el, w: el.displayWidth, h: el.displayHeight } : null;
  if (isVideoEl(el)) {
    if (el.readyState < 2 || !el.videoWidth) return null;
    return { el, w: el.videoWidth, h: el.videoHeight };
  }
  if (isImageEl(el)) {
    if (!el.complete || !el.naturalWidth) return null;
    return { el, w: el.naturalWidth, h: el.naturalHeight };
  }
  if (isCanvasEl(el) || isBitmap(el)) return el.width ? { el, w: el.width, h: el.height } : null;
  return null;
}

/** Kaynağın doğal boyutu (oranı korumak için); bilinmiyorsa null. */
export function naturalSize(source, rt) {
  const d = drawableOf(rt, performance.now(), source);
  if (!d) return null;
  const r = effectiveFx(source, null)?.rotate;
  return r === 90 || r === 270 ? { w: d.h, h: d.w } : { w: d.w, h: d.h };
}

const byIdCache = new WeakMap();
/** Kaynak dizisi → kimlik haritası (dizi değişmedikçe önbellekte). */
export function sourcesById(sources) {
  if (sources instanceof Map) return sources;
  let m = byIdCache.get(sources);
  if (!m) { m = new Map(sources.map((s) => [s.id, s])); byIdCache.set(sources, m); }
  return m;
}

function drawPlaceholder(ctx, w, h, source, rt) {
  ctx.fillStyle = "#120a1c";
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "rgba(216,191,255,0.18)";
  ctx.lineWidth = Math.max(1, w / 400);
  ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
  const size = Math.max(9, Math.min(h * 0.09, w * 0.05));
  ctx.fillStyle = "rgba(255,255,255,0.72)";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `700 ${size}px -apple-system, "Helvetica Neue", sans-serif`;
  ctx.fillText(source?.name || "Kaynak", w / 2, h / 2 - size * 0.7, w * 0.92);
  ctx.font = `500 ${size * 0.8}px -apple-system, "Helvetica Neue", sans-serif`;
  ctx.fillStyle = "rgba(255,255,255,0.48)";
  ctx.fillText(PLACEHOLDER[rt?.status] || PLACEHOLDER.missing, w / 2, h / 2 + size * 0.7, w * 0.92);
}

function drawColor(ctx, w, h, s, H) {
  if (s.gradient && s.color2) {
    const a = ((Number(s.gradientAngle) || 135) * Math.PI) / 180;
    const cx = w / 2; const cy = h / 2;
    const r = Math.hypot(w, h) / 2;
    const g = ctx.createLinearGradient(cx - Math.cos(a) * r, cy - Math.sin(a) * r, cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    g.addColorStop(0, s.color || "#54009c");
    g.addColorStop(1, s.color2);
    ctx.fillStyle = g;
  } else ctx.fillStyle = s.color || "#54009c";
  ctx.fillRect(0, 0, w, h);
  if (s.text) {
    const size = Math.max(8, Math.min(h * 0.16, (H || h) * 0.09));
    ctx.fillStyle = s.textColor || "#ffffff";
    ctx.font = `800 ${size}px "Archivo", -apple-system, "Helvetica Neue", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const lines = String(s.text).split("\n").slice(0, 4);
    lines.forEach((line, i) => ctx.fillText(line, w / 2, h / 2 + (i - (lines.length - 1) / 2) * size * 1.2, w * 0.92));
  }
}

/** Metin / saat: boyut 1080p'ye göre px, çıkış yüksekliğiyle ölçeklenir. */
function drawText(ctx, w, h, s, text, H) {
  if (s.background) { ctx.fillStyle = s.bgColor || "#54009c"; ctx.fillRect(0, 0, w, h); }
  const k = (H || 1080) / 1080;
  const size = Math.max(6, (Number(s.size) || 64) * k);
  const fam = s.font && s.font !== "-apple-system" ? `"${s.font}", -apple-system, sans-serif` : "-apple-system, \"Helvetica Neue\", sans-serif";
  ctx.font = `${s.bold === false ? 500 : 800} ${size}px ${fam}`;
  ctx.textBaseline = "middle";
  const align = s.align || "center";
  ctx.textAlign = align;
  const x = align === "left" ? size * 0.3 : align === "right" ? w - size * 0.3 : w / 2;
  const lines = String(text ?? "").split("\n").slice(0, 8);
  ctx.lineJoin = "round";
  lines.forEach((line, i) => {
    const y = h / 2 + (i - (lines.length - 1) / 2) * size * 1.18;
    if (s.outline && Number(s.outlineWidth) > 0) {
      ctx.strokeStyle = s.outlineColor || "#000";
      ctx.lineWidth = Number(s.outlineWidth) * k * 2;
      ctx.strokeText(line, x, y, w * 0.98);
    }
    ctx.fillStyle = s.color || "#fff";
    ctx.fillText(line, x, y, w * 0.98);
  });
}

/** Kayan yazı: kutu içinde sağdan sola akan tek satır (kesintisiz döngü). */
function drawTicker(ctx, w, h, s, H) {
  if (s.background !== false) { ctx.fillStyle = s.bgColor || "#54009c"; ctx.fillRect(0, 0, w, h); }
  const k = (H || 1080) / 1080;
  const size = Math.max(6, Math.min(h * 0.8, (Number(s.size) || 44) * k));
  const fam = s.font && s.font !== "-apple-system" ? `"${s.font}", -apple-system, sans-serif` : "-apple-system, \"Helvetica Neue\", sans-serif";
  ctx.font = `${s.bold === false ? 500 : 800} ${size}px ${fam}`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  const text = `${String(s.text || "").replace(/\s*\n\s*/g, " ")}${s.separator ?? "  •  "}`;
  const tw = Math.max(1, ctx.measureText(text).width);
  const off = tickerOffset(performance.now(), s.speed, tw, k);
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip();
  ctx.fillStyle = s.color || "#fff";
  const rtl = s.direction === "right";
  const start = rtl ? off - tw : -off;
  for (let x = start; x < w; x += tw) ctx.fillText(text, x, h / 2);
  ctx.restore();
}

/** Şekilli maske yolu (0,0)-(w,h) kutusunda (katman maskesi; lib/studio/scenes.js LAYER_MASKS). */
export function maskPath(ctx, mask, w, h) {
  const m = Math.min(w, h);
  const poly = (pts) => { pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); };
  switch (mask) {
    case "circle": ctx.arc(w / 2, h / 2, m / 2, 0, Math.PI * 2); break;
    case "ellipse": ctx.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); break;
    case "diagL": poly([[0, 0], [w, 0], [w * 0.78, h], [0, h]]); break; // sağ kenarı çapraz (çapraz bölmenin sol yarısı)
    case "diagR": poly([[w * 0.22, 0], [w, 0], [w, h], [0, h]]); break; // sol kenarı çapraz (sağ yarı)
    case "cut": { const c = m * 0.14; poly([[c, 0], [w - c, 0], [w, c], [w, h - c], [w - c, h], [c, h], [0, h - c], [0, c]]); break; }
    case "hex": { const c = Math.min(w * 0.25, h * 0.5); poly([[c, 0], [w - c, 0], [w, h / 2], [w - c, h], [c, h], [0, h / 2]]); break; }
    case "slantL": { const c = w * 0.1; poly([[c, 0], [w, 0], [w - c, h], [0, h]]); break; }
    case "slantR": { const c = w * 0.1; poly([[0, 0], [w - c, 0], [w, h], [c, h]]); break; }
    default: ctx.rect(0, 0, w, h);
  }
}

/**
 * Bir katmanı çizer. opts: { placeholders, now, matchClockMs, override }
 * override: sürükleme sırasında yapılandırmaya yazılmamış kutu ({ x, y, w, h, crop, rot }).
 */
export function drawLayer(ctx, layer, source, rt, W, H, opts = {}) {
  if (!source) return;
  // Göster / gizle geçişi (katmanın showFx'i): gizlenen katman geçiş bitene dek çizilir.
  const vis = layer.showFx ? layerVisibility(layer, Date.now()) : layer.visible ? null : false;
  if (vis === false || (layer.showFx && !vis)) return;
  const L = opts.override && opts.override.layerId === layer.id ? { ...layer, ...opts.override.patch } : layer;
  const bw = L.w * W;
  const bh = L.h * H;
  if (bw < 1 || bh < 1) return;
  ctx.save();
  ctx.translate(L.x * W + bw / 2, L.y * H + bh / 2);
  if (L.rot) ctx.rotate((L.rot * Math.PI) / 180);
  if (vis && !isFullVisibility(vis)) {
    if (vis.clip) { ctx.beginPath(); ctx.rect(-bw / 2, -bh / 2, bw, bh); ctx.clip(); }
    ctx.globalAlpha *= vis.alpha;
    ctx.translate(vis.dx * bw, vis.dy * bh);
    if (vis.scale !== 1) ctx.scale(vis.scale, vis.scale);
  }
  ctx.translate(-bw / 2, -bh / 2);
  // İsteğe bağlı görünüm: saydamlık, gölge, köşe yuvarlama (kırpma), çerçeve. Ölçüler
  // çıkış pikseli (1920 genişlik) üzerinden; küçük tuvallerde orantılı.
  const k = W / 1920;
  if (L.opacity != null && L.opacity < 1) ctx.globalAlpha *= Math.max(0, L.opacity);
  const rad = L.radius > 0 ? Math.min(bw, bh) * Math.min(0.5, L.radius) : 0;
  const masked = Boolean(L.mask && L.mask !== "rect");
  const shape = () => { ctx.beginPath(); if (masked) maskPath(ctx, L.mask, bw, bh); else if (rad && ctx.roundRect) ctx.roundRect(0, 0, bw, bh, rad); else ctx.rect(0, 0, bw, bh); };
  if (L.shadow?.blur > 0) {
    ctx.save();
    ctx.shadowColor = L.shadow.color || "#000";
    ctx.shadowBlur = L.shadow.blur * k;
    ctx.shadowOffsetY = L.shadow.blur * k * 0.25;
    ctx.fillStyle = "#000";
    shape();
    ctx.fill();
    ctx.restore();
  }
  if (rad || masked) { shape(); ctx.clip(); }
  try {
    const kind = source.kind;
    if (kind === "color") drawColor(ctx, bw, bh, source, H);
    else if (kind === "text") drawText(ctx, bw, bh, source, source.text, H);
    else if (kind === "clock") drawText(ctx, bw, bh, source, clockText(source, Date.now(), { matchClockMs: opts.matchClockMs }), H);
    else if (kind === "ticker") drawTicker(ctx, bw, bh, source, H);
    else {
      let d = drawableOf(rt, opts.now ?? performance.now(), source);
      // Görüntü ayarı (kaynağın ya da katmana özel): yalnız çevirme ise 2D dönüşüm,
      // değilse paylaşılan WebGL işlemcisi (aynı kare tüm çıkışlarda bir kez işlenir).
      // opts.fx: önizleme penceresi için açık ayar (false = ayarsız "önce" görüntüsü).
      let flip = null;
      if (d) {
        const fx = opts.fx !== undefined ? (opts.fx && fxActive(opts.fx) ? opts.fx : null) : effectiveFx(source, L);
        if (fx) {
          flip = fxOrientOnly(fx);
          // opts.noFx (küçük resim, çoklu görünüm): WebGL işlemesi yok — yalnız çevirme uygulanır.
          if (!flip && !opts.noFx) {
            const key = opts.fx !== undefined ? `${source.id}|ui` : layer.fx ? `${source.id}|${layer.id}` : source.id;
            const p = processFrame(key, d, fx, { now: performance.now(), maxAge: opts.fxMaxAge ?? 12 });
            if (p) d = p;
          }
        }
      }
      if (!d) { if (opts.placeholders) drawPlaceholder(ctx, bw, bh, source, rt || (kind === "replay" ? { status: "empty" } : null)); }
      else {
        const c = L.crop || { l: 0, t: 0, r: 0, b: 0 };
        const cw = d.w * (1 - c.l - c.r);
        const ch = d.h * (1 - c.t - c.b);
        const f = fitRect(cw, ch, { x: 0, y: 0, w: bw, h: bh }, L.fit || "cover");
        if (f) {
          if (L.fit === "cover") { ctx.beginPath(); ctx.rect(0, 0, bw, bh); ctx.clip(); }
          if (flip?.flipH) { ctx.translate(f.dx * 2 + f.dw, 0); ctx.scale(-1, 1); }
          if (flip?.flipV) { ctx.translate(0, f.dy * 2 + f.dh); ctx.scale(1, -1); }
          ctx.drawImage(d.el, d.w * c.l + f.sx, d.h * c.t + f.sy, f.sw, f.sh, f.dx, f.dy, f.dw, f.dh);
        }
      }
    }
  } catch { /* kare hazır değil */ }
  if (L.border?.width > 0) {
    const lw = Math.max(1, L.border.width * k);
    ctx.lineWidth = rad || masked ? lw * 2 : lw; // kırpılmış şekilde çizginin yarısı dışarıda kalır
    ctx.strokeStyle = L.border.color || "#fff";
    if (rad || masked) { shape(); ctx.stroke(); } else ctx.strokeRect(lw / 2, lw / 2, bw - lw, bh - lw);
  }
  ctx.restore();
}

/** Sahneyi (katmanlar alttan üste) çizer. opts.transparent: zemini boyama. */
export function drawScene(ctx, scene, sources, runtime, W, H, opts = {}) {
  if (!opts.transparent) { ctx.fillStyle = scene?.bg || "#000"; ctx.fillRect(0, 0, W, H); }
  if (!scene) return;
  const byId = sourcesById(sources);
  for (const layer of scene.layers) {
    if (!layer.visible && !layer.showFx) continue;
    drawLayer(ctx, layer, byId.get(layer.sourceId), runtime.get(layer.sourceId), W, H, opts);
  }
}

/** Tek kaynağı kutuya çizer (küçük resim). Görüntü ayarı sonucu daha toleranslı paylaşılır. */
export function drawSource(ctx, source, rt, box, fit = "cover", opts = {}) {
  if (!source) return;
  ctx.save();
  ctx.translate(box.x, box.y);
  drawLayer(ctx, { id: "_thumb", visible: true, x: 0, y: 0, w: 1, h: 1, rot: 0, crop: null, fit }, source, rt, box.w, box.h, { fxMaxAge: 60, ...opts, placeholders: opts.placeholders ?? true });
  ctx.restore();
}

/** Video: kutuya oranı korunarak (tekrar, VAR). */
export function drawVideoIn(ctx, video, box, fit = "contain") {
  if (!video) return false;
  const frame = isFrame(video);
  const vw = frame ? video.displayWidth : video.videoWidth;
  const vh = frame ? video.displayHeight : video.videoHeight;
  if ((!frame && video.readyState < 2) || !vw) return false;
  const f = fitRect(vw, vh, box, fit);
  if (!f) return false;
  try { ctx.drawImage(video, f.sx, f.sy, f.sw, f.sh, f.dx, f.dy, f.dw, f.dh); } catch { return false; }
  return true;
}

/** Tekrar videosu: tam kare, oranı korunarak. */
export function drawVideoFull(ctx, video, W, H) {
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);
  return drawVideoIn(ctx, video, { x: 0, y: 0, w: W, h: H }, "contain");
}
