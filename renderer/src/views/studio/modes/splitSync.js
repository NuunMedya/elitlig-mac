// YAN YANA TEKRAR — pencere öğeleri, zaman eşi (sapma düzeltmeli) ve bölünmüş çizim.
// Saf hesap: lib/studio/replaySplit.js. Oyuncu takibi vurguları her pencereye kendi açısının
// zamanıyla çizilir (lib/studio/trackFx.js).
//
//   makePaneGroup(n)  ana öğenin yanında n ek <video> (pencere 1…n). sync(master, panes)
//                     her karede: hedef zaman = ana zaman (rVFC ölçümü) + açı farkı + ±kare
//                     kayması; fark büyükse seek, küçükse hız ±%8 (yumuşak yakalama),
//                     oynat / duraklat ana öğeyi izler. Seek'ler pencere başına sınırlı (300 ms).
//   drawSplitFrame    pencereler + bölücü + açı etiketleri + takip vurguları.
import { driftAction, estimateMasterTime, paneSource, paneTime, splitDividers, splitRects, videoToCanvas } from "../../../lib/studio/replaySplit";
import { freezeAt, pointAt } from "../../../lib/studio/playerTrack";
import { drawTrackFx, drawTrackKeys } from "../../../lib/studio/trackFx";
import { prepare } from "../useReplayPlayer";

const FONT = "\"Archivo\", -apple-system, \"Helvetica Neue\", sans-serif";
const mkVideo = () => {
  const v = document.createElement("video");
  v.playsInline = true;
  v.preload = "auto";
  v.muted = true;
  return v;
};

export function makePaneGroup(n = 3) {
  const els = Array.from({ length: n }, mkVideo);
  const st = els.map(() => ({ url: null, ready: false, lastSeek: 0, token: 0 }));
  let master = null;
  let sample = null;
  let rvfc = 0;
  const watch = (el) => {
    if (el === master) return;
    if (master && rvfc && master.cancelVideoFrameCallback) { try { master.cancelVideoFrameCallback(rvfc); } catch { /* yoksay */ } }
    master = el;
    sample = null;
    if (el?.requestVideoFrameCallback) {
      const on = (now, meta) => {
        if (master !== el) return;
        sample = { mediaTime: meta?.mediaTime ?? el.currentTime, at: now };
        rvfc = el.requestVideoFrameCallback(on);
      };
      rvfc = el.requestVideoFrameCallback(on);
    }
  };
  return {
    els,
    /** Pencere öğesine klip yükle (aynıysa dokunma). → Promise<bool> */
    load(i, url) {
      const s = st[i];
      if (!s) return Promise.resolve(false);
      if (s.url === url) return Promise.resolve(s.ready);
      s.url = url; s.ready = false; s.token += 1;
      const tk = s.token;
      if (!url) { try { els[i].pause(); } catch { /* yoksay */ } return Promise.resolve(false); }
      return prepare(els[i], url).then(() => { if (s.token === tk) s.ready = true; return s.ready; }, () => false);
    },
    ready: (i) => Boolean(st[i]?.ready),
    readyAll: (k) => st.slice(0, k).every((s) => s.ready),
    /**
     * Eşle. master: ana <video>; panes: [{ delta, offsetFrames, dur }] (pencere 1…: panes[1..]).
     * opts: { reverse: geri oynatmada ana duraklatılmış görünür → pencereler de seek ile izler }
     */
    sync(masterEl, panes, now = performance.now()) {
      if (!masterEl) return;
      watch(masterEl);
      const paused = masterEl.paused || masterEl.seeking;
      const rate = masterEl.playbackRate || 1;
      const mt = estimateMasterTime(paused ? null : sample, now, { rate, paused, fallback: masterEl.currentTime || 0 });
      for (let i = 1; i < panes.length; i += 1) {
        const el = els[i - 1];
        const s = st[i - 1];
        if (!el || !s?.ready) continue;
        const p = panes[i];
        const dur = Number.isFinite(el.duration) ? el.duration : (Number(p.dur) || 0);
        const target = paneTime(mt, p.delta, p.offsetFrames, { dur });
        const ended = dur && target >= dur - 0.03;
        const act = driftAction(target, el.currentTime || 0, { paused: paused || ended, rate });
        if (act.type === "seek") {
          if (!el.seeking && (paused || now - s.lastSeek > 300)) { try { el.currentTime = act.t; } catch { /* yoksay */ } s.lastSeek = now; }
          el.playbackRate = rate;
        } else el.playbackRate = Math.max(0.0625, Math.min(16, act.rate));
        if (paused || ended) { if (!el.paused) { try { el.pause(); } catch { /* yoksay */ } } } else if (el.paused) el.play().catch(() => {});
      }
    },
    pause() { els.forEach((el) => { try { el.pause(); } catch { /* yoksay */ } }); },
    reset() { st.forEach((s, i) => { s.url = null; s.ready = false; s.token += 1; try { els[i].pause(); } catch { /* yoksay */ } }); },
  };
}

/** Pencerenin üstündeki açı etiketi. */
function paneLabel(ctx, r, text, H) {
  if (!text) return;
  const fs = Math.max(10, Math.min(r.h * 0.06, H * 0.03));
  ctx.save();
  ctx.font = `800 ${fs}px ${FONT}`;
  const t = String(text).toLocaleUpperCase("tr-TR");
  const w = ctx.measureText(t).width + fs * 1.1;
  const x = r.x + fs * 0.6;
  const y = r.y + fs * 0.6;
  ctx.fillStyle = "rgba(8,8,12,0.72)"; // sabit-renk
  ctx.fillRect(x, y, w, fs * 1.6);
  ctx.fillStyle = "#e11d48"; // sabit-renk
  ctx.fillRect(x, y, Math.max(2, fs * 0.2), fs * 1.6);
  ctx.fillStyle = "#ffffff"; // sabit-renk
  ctx.textBaseline = "middle";
  ctx.fillText(t, x + fs * 0.55, y + fs * 0.82);
  ctx.restore();
}

/**
 * İzleri bir görüntüye çiz. src: paneSource / singleSource sonucu, el: video,
 * tracks: [iz], t: açının zamanı, opts: { now, clip, intro(track) → 0…1, keys: operatör işaretleri }.
 */
export function drawTracksOn(ctx, el, src, tracks, t, { now = 0, clip = null, intro = null, keys = false, W = 0, H = 0 } = {}) {
  const vw = el?.videoWidth || el?.width;
  const vh = el?.videoHeight || el?.height;
  if (!vw || !vh || !tracks?.length) return;
  for (const tr of tracks) {
    // "Dondur ve göster": vurgu donma anından ÖNCE görünmez (donunca belirir, sonra izler).
    const fz = tr.freeze?.on ? freezeAt(tr) : null;
    const p = fz != null && t < fz - 0.02 ? null : pointAt(tr, t);
    if (p) {
      const c = videoToCanvas(src, vw, vh, p.x, p.y);
      const h = (tr.size || 0.14) * vh * c.scale;
      drawTrackFx(ctx, tr, c, h, { now, alpha: p.alpha, intro: intro ? intro(tr) : 1, clip, W, H });
    }
    if (keys && tr.keys?.length) {
      drawTrackKeys(ctx, tr.keys.map((k) => { const c = videoToCanvas(src, vw, vh, k.x, k.y); return { x: c.x, y: c.y, current: Math.abs(k.t - t) < 0.05 }; }).filter((q) => q.x >= (clip?.x ?? 0) && q.y >= (clip?.y ?? 0)), tr.color);
    }
  }
}

/**
 * Bölünmüş kare. panes: [{ el, view, label, tracks }], split: { layout, fit }.
 * opts: { now, intro, keys (operatör işaretleri), labels }.
 */
export function drawSplitFrame(ctx, W, H, split, panes, { now = 0, intro = null, keys = false, labels = true } = {}) {
  ctx.fillStyle = "#000"; // sabit-renk
  ctx.fillRect(0, 0, W, H);
  const rects = splitRects(split.layout, panes.length, W, H);
  rects.forEach((r, i) => {
    const p = panes[i];
    const el = p?.el;
    const vw = el?.videoWidth;
    const vh = el?.videoHeight;
    if (r.inset) {
      const b = Math.max(2, W / 480);
      ctx.fillStyle = "rgba(0,0,0,0.45)"; // sabit-renk
      ctx.fillRect(r.x + b * 2, r.y + b * 2, r.w, r.h);
      ctx.fillStyle = "#000"; // sabit-renk
      ctx.fillRect(r.x, r.y, r.w, r.h);
    }
    if (!el || !vw || !vh || el.readyState < 2) return;
    const src = paneSource(vw, vh, p.view, r, split.fit);
    ctx.save();
    ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
    try { ctx.drawImage(el, src.sx, src.sy, src.sw, src.sh, src.dx, src.dy, src.dw, src.dh); } catch { /* yoksay */ }
    ctx.restore();
    drawTracksOn(ctx, el, src, p.tracks, el.currentTime || 0, { now, clip: r, intro, keys, W, H });
    if (r.inset) {
      const b = Math.max(2, W / 480);
      ctx.strokeStyle = "rgba(255,255,255,0.92)"; // sabit-renk
      ctx.lineWidth = b;
      ctx.strokeRect(r.x + b / 2, r.y + b / 2, r.w - b, r.h - b);
    }
    if (labels) paneLabel(ctx, r, p.label, H);
  });
  ctx.fillStyle = "rgba(255,255,255,0.88)"; // sabit-renk
  for (const d of splitDividers(rects, W, H)) ctx.fillRect(d.x, d.y, d.w, d.h);
  return rects;
}
