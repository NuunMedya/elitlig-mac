// Yayın Stüdyosu — tuvale sahne / katman çizimi (program, önizleme, çoklu
// görünüm, küçük resimler ve LED çıkışı aynı işlevleri kullanır).
//
// Katman: kutu (0…1) → piksel; kırpma kaynağın kenarlarından; kutu içinde
// sığdırma (uzat / sığdır / doldur); ayna; döndürme kutu merkezinde.
// Yapay kaynaklar (renk / gradyan, metin, saat, slayt) burada boyanır.
import { fitRect } from "../../lib/studio/layouts";
import { clockText, slideIndex } from "../../lib/studio/scenes";

const PLACEHOLDER = {
  waiting: "Açılıyor…",
  missing: "Kaynak yok",
  denied: "İzin yok",
  ended: "Bağlantı koptu",
  busy: "Başka uygulama kullanıyor",
  error: "Açılamadı",
  file: "Dosyayı yeniden seç",
  empty: "Tekrar yok",
};

/** Kaynağın çizilebilir öğesi ve doğal boyutu; hazır değilse null. */
export function drawableOf(rt, now = 0) {
  if (!rt || rt.status !== "live") return null;
  if (rt.images) {
    const list = rt.images.filter((im) => im.complete && im.naturalWidth);
    if (!list.length) return null;
    const im = list[slideIndex(list.length, rt.intervalMs, now)];
    return { el: im, w: im.naturalWidth, h: im.naturalHeight };
  }
  const el = rt.el;
  if (!el) return null;
  if (el instanceof HTMLVideoElement) {
    if (el.readyState < 2 || !el.videoWidth) return null;
    return { el, w: el.videoWidth, h: el.videoHeight };
  }
  if (el instanceof HTMLImageElement) {
    if (!el.complete || !el.naturalWidth) return null;
    return { el, w: el.naturalWidth, h: el.naturalHeight };
  }
  if (el instanceof HTMLCanvasElement) return el.width ? { el, w: el.width, h: el.height } : null;
  return null;
}

/** Kaynağın doğal boyutu (oranı korumak için); bilinmiyorsa null. */
export function naturalSize(source, rt) {
  const d = drawableOf(rt, Date.now());
  if (d) return { w: d.w, h: d.h };
  return null;
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

/**
 * Bir katmanı çizer. opts: { placeholders, now, matchClockMs, override }
 * override: sürükleme sırasında yapılandırmaya yazılmamış kutu ({ x, y, w, h, crop, rot }).
 */
export function drawLayer(ctx, layer, source, rt, W, H, opts = {}) {
  if (!source || !layer.visible) return;
  const L = opts.override && opts.override.layerId === layer.id ? { ...layer, ...opts.override.patch } : layer;
  const bw = L.w * W;
  const bh = L.h * H;
  if (bw < 1 || bh < 1) return;
  ctx.save();
  ctx.translate(L.x * W + bw / 2, L.y * H + bh / 2);
  if (L.rot) ctx.rotate((L.rot * Math.PI) / 180);
  ctx.translate(-bw / 2, -bh / 2);
  try {
    const kind = source.kind;
    if (kind === "color") drawColor(ctx, bw, bh, source, H);
    else if (kind === "text") drawText(ctx, bw, bh, source, source.text, H);
    else if (kind === "clock") drawText(ctx, bw, bh, source, clockText(source, Date.now(), { matchClockMs: opts.matchClockMs }), H);
    else {
      const d = drawableOf(rt, opts.now ?? performance.now());
      if (!d) { if (opts.placeholders) drawPlaceholder(ctx, bw, bh, source, rt || (kind === "replay" ? { status: "empty" } : null)); }
      else {
        const c = L.crop || { l: 0, t: 0, r: 0, b: 0 };
        const cw = d.w * (1 - c.l - c.r);
        const ch = d.h * (1 - c.t - c.b);
        const f = fitRect(cw, ch, { x: 0, y: 0, w: bw, h: bh }, L.fit || "cover");
        if (f) {
          if (L.fit === "cover") { ctx.beginPath(); ctx.rect(0, 0, bw, bh); ctx.clip(); }
          if (source.mirror) { ctx.translate(f.dx * 2 + f.dw, 0); ctx.scale(-1, 1); }
          ctx.drawImage(d.el, d.w * c.l + f.sx, d.h * c.t + f.sy, f.sw, f.sh, f.dx, f.dy, f.dw, f.dh);
        }
      }
    }
  } catch { /* kare hazır değil */ }
  ctx.restore();
}

/** Sahneyi (katmanlar alttan üste) çizer. opts.transparent: zemini boyama. */
export function drawScene(ctx, scene, sources, runtime, W, H, opts = {}) {
  if (!opts.transparent) { ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H); }
  if (!scene) return;
  const byId = sourcesById(sources);
  for (const layer of scene.layers) {
    if (!layer.visible) continue;
    drawLayer(ctx, layer, byId.get(layer.sourceId), runtime.get(layer.sourceId), W, H, opts);
  }
}

/** Tek kaynağı kutuya çizer (küçük resim). */
export function drawSource(ctx, source, rt, box, fit = "cover", opts = {}) {
  if (!source) return;
  ctx.save();
  ctx.translate(box.x, box.y);
  drawLayer(ctx, { id: "_thumb", visible: true, x: 0, y: 0, w: 1, h: 1, rot: 0, crop: null, fit }, source, rt, box.w, box.h, { ...opts, placeholders: opts.placeholders ?? true });
  ctx.restore();
}

/** Video: kutuya oranı korunarak (tekrar, VAR). */
export function drawVideoIn(ctx, video, box, fit = "contain") {
  if (!video || video.readyState < 2 || !video.videoWidth) return false;
  const f = fitRect(video.videoWidth, video.videoHeight, box, fit);
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
