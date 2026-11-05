// Yayın Stüdyosu — karıştırıcı: PROGRAM ve ÖNİZLEME tuvalleri.
//
// PROGRAM tuvali (çıkış boyutunda, ör. 1920×1080) yayına giden görüntüdür;
// captureStream(fps) ile kaydediciye verilir. Her karede: program hedefinin
// (kaynak ya da düzen) katmanları ya da tekrar videosu; geçişte iki hedefin
// karışımı (yumuşak) ya da ElitLig logo geçişi (stinger, değişim tam ortada);
// en üstte skorbord (küçük sol üst / orta-alt büyük / gizli) ve tekrar rozeti.
// ÖNİZLEME tuvali düzenlenen hedefi daha düşük çözünürlükte gösterir.
//
// Zamanlama: requestAnimationFrame + yedek setInterval. Pencere gizlenince /
// örtülünce rAF durur; yedek zamanlayıcı kareyi sürdürür (ana süreçte
// webPreferences.backgroundThrottling = false gerekir).
//
// Bu kanca React durumunu kare başına GÜNCELLEMEZ: fps ölçümü ref'te durur
// (getStats); arayüzün saniyede onlarca kez yeniden çizilmesi açık açılır
// menüleri kapatıyordu.
//
// Tuval asla "kirletilmez" (taint): uzak görseller yalnız CORS'la yüklenir.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { bugPlacement, drawBottomBoard, drawReplayBadge, drawScoreBug } from "../../lib/studio/scorebug";
import { fallbackDue, previewSize, transitionProgress } from "../../lib/studio/compose";
import { drawStinger, STINGER_MS } from "../../lib/studio/stinger";
import { resolveScene } from "../../lib/studio/layouts";
import { drawScene, drawVideoFull } from "./draw";

/** Skorbord türü: overlay.variant, eski kayıtta overlay.scorebug. */
export const bugVariantOf = (cfg) => cfg?.overlay?.variant || (cfg?.overlay?.scorebug === false ? "off" : "small");

/** Skorbordu türüne göre çizer (program, önizleme ve özet aynı işlevi kullanır). */
export function drawBug(ctx, variant, state, W, H, images) {
  if (!state || variant === "off") return;
  if (variant === "bottom") drawBottomBoard(ctx, state, { outW: W, outH: H, images });
  else drawScoreBug(ctx, state, { ...bugPlacement(W), images });
}

export function useCompositor({ width, height, fps, configRef, runtimeRef, bugRef, imagesRef, replayRef }) {
  const program = useMemo(() => document.createElement("canvas"), []);
  const preview = useMemo(() => document.createElement("canvas"), []);
  const scratch = useMemo(() => document.createElement("canvas"), []);
  const transitionRef = useRef(null); // { kind: "fade" | "stinger", fromId, toId, startedAt, ms }
  const stingerRef = useRef(null); // { startedAt, ms, onMid, onEnd, midFired } — tekrar giriş / çıkışı
  const statsRef = useRef({ fps: 0 });
  const trackRef = useRef(null);

  useEffect(() => {
    program.width = width; program.height = height;
    scratch.width = width; scratch.height = height;
    const p = previewSize(width, height);
    preview.width = p.width; preview.height = p.height;
  }, [width, height, program, preview, scratch]);

  useEffect(() => {
    let stream = null;
    try { stream = program.captureStream(fps); } catch { stream = null; }
    trackRef.current = stream?.getVideoTracks()[0] || null;
    return () => { stream?.getTracks().forEach((t) => t.stop()); trackRef.current = null; };
  }, [program, fps]);

  const frame = useRef({ last: 0, count: 0, statAt: 0, previewSkip: 0 });

  const draw = useCallback((now) => {
    const cfg = configRef.current;
    const runtime = runtimeRef.current;
    if (!cfg) return;
    const W = program.width;
    const H = program.height;
    const ctx = program.getContext("2d", { alpha: false });
    const sceneOf = (id) => resolveScene(cfg, id);
    const replay = replayRef.current;
    const bug = bugRef.current;
    const images = imagesRef.current || {};
    const variant = bugVariantOf(cfg);

    // PROGRAM
    const tr = transitionRef.current;
    let stingerP = null;
    if (replay?.active && replay.el) {
      drawVideoFull(ctx, replay.el, W, H);
    } else if (tr) {
      const p = transitionProgress(tr, now);
      if (tr.kind === "stinger") {
        drawScene(ctx, sceneOf(p < 0.5 ? tr.fromId : tr.toId), cfg.sources, runtime, W, H);
        stingerP = p;
      } else {
        drawScene(ctx, sceneOf(tr.fromId), cfg.sources, runtime, W, H);
        if (p > 0) {
          const sctx = scratch.getContext("2d", { alpha: false });
          drawScene(sctx, sceneOf(tr.toId), cfg.sources, runtime, W, H);
          ctx.globalAlpha = p;
          ctx.drawImage(scratch, 0, 0);
          ctx.globalAlpha = 1;
        }
      }
      if (p >= 1) transitionRef.current = null;
    } else {
      drawScene(ctx, sceneOf(cfg.programSceneId), cfg.sources, runtime, W, H);
    }
    if (bug) {
      const state = { ...bug, clockMs: bug.clockAt ? bug.clockAt(Date.now()) : bug.clockMs, event: replay?.active ? replay.event : bug.event };
      drawBug(ctx, variant, state, W, H, images);
    }
    if (replay?.active) drawReplayBadge(ctx, W);

    // Logo geçişi en üstte (skorbordu da örter).
    if (stingerP != null && stingerP < 1) drawStinger(ctx, W, H, stingerP, images.logo);
    const sg = stingerRef.current;
    if (sg) {
      const p = Math.min(1, (now - sg.startedAt) / sg.ms);
      if (p >= 0.5 && !sg.midFired) {
        sg.midFired = true;
        try { sg.onMid?.(); } catch { /* yoksay */ }
      }
      if (p < 1) drawStinger(ctx, W, H, p, images.logo);
      else {
        stingerRef.current = null;
        try { sg.onEnd?.(); } catch { /* yoksay */ }
      }
    }

    // ÖNİZLEME (her iki karede bir; yayına gitmez)
    frame.current.previewSkip = (frame.current.previewSkip + 1) % 2;
    if (frame.current.previewSkip === 0) {
      const pw = preview.width;
      const ph = preview.height;
      const pctx = preview.getContext("2d", { alpha: false });
      drawScene(pctx, sceneOf(cfg.previewSceneId), cfg.sources, runtime, pw, ph, { placeholders: true });
      if (bug) drawBug(pctx, variant, { ...bug, clockMs: bug.clockAt ? bug.clockAt(Date.now()) : bug.clockMs }, pw, ph, images);
    }

    const f = frame.current;
    f.count += 1;
    if (now - f.statAt >= 1000) {
      statsRef.current = { fps: Math.round((f.count * 1000) / (now - f.statAt || 1)) };
      f.count = 0;
      f.statAt = now;
    }
  }, [bugRef, configRef, imagesRef, preview, program, replayRef, runtimeRef, scratch]);

  useEffect(() => {
    let raf = 0;
    let alive = true;
    const interval = 1000 / Math.max(1, fps);
    const tick = (now) => {
      const f = frame.current;
      if (now - f.last >= interval - 2) {
        f.last = now;
        draw(now);
      }
    };
    const loop = () => {
      if (!alive) return;
      tick(performance.now());
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const timer = setInterval(() => {
      const now = performance.now();
      if (fallbackDue(frame.current.last, now, fps)) { frame.current.last = now; draw(now); }
    }, Math.max(8, Math.floor(interval / 2)));
    return () => { alive = false; cancelAnimationFrame(raf); clearInterval(timer); };
  }, [draw, fps]);

  /** Önizlemedeki hedefi programa al. kind: "cut" | "fade" | "stinger". */
  const startTransition = useCallback((fromId, toId, kind, ms) => {
    if (!ms || kind === "cut" || fromId === toId) { transitionRef.current = null; return; }
    transitionRef.current = { kind, fromId, toId, startedAt: performance.now(), ms };
  }, []);

  /**
   * Bağımsız logo geçişi (tekrara giriş / tekrardan çıkış / tekrar arası):
   * onMid ekran tam örtülüyken çağrılır — görüntü orada değiştirilir.
   * Çizim döngüsü durmuşsa (pencere kapalı) yedek zamanlayıcı onMid'i yine çağırır.
   */
  const playStinger = useCallback(({ onMid, onEnd, ms = STINGER_MS } = {}) => {
    const prev = stingerRef.current;
    if (prev && !prev.midFired) { try { prev.onMid?.(); } catch { /* yoksay */ } }
    if (prev) { try { prev.onEnd?.(); } catch { /* yoksay */ } }
    const sg = { startedAt: performance.now(), ms, onMid, onEnd, midFired: false };
    stingerRef.current = sg;
    setTimeout(() => {
      if (stingerRef.current !== sg) return;
      if (!sg.midFired) { sg.midFired = true; try { sg.onMid?.(); } catch { /* yoksay */ } }
    }, ms * 0.5 + 250);
  }, []);

  const getVideoTrack = useCallback(() => trackRef.current, []);
  const getStats = useCallback(() => statsRef.current, []);
  const busy = useCallback(() => Boolean(transitionRef.current || stingerRef.current), []);

  return { program, preview, getStats, startTransition, playStinger, getVideoTrack, busy };
}

/**
 * Tuvale çizilebilir görsel: önce ana süreçteki önbellekli protokol
 * (elitlig-media://, CORS başlığı gerekir), olmazsa doğrudan https (CORS'lu).
 * İkisi de olmazsa null — tuval kirletilmez.
 */
export function useCanvasImage(url, { inline = false } = {}) {
  const [img, setImg] = useState(null);
  useEffect(() => {
    setImg(null);
    if (!url) return undefined;
    let cancelled = false;
    const candidates = inline || /^(data|blob):/i.test(url)
      ? [url]
      : /^https?:\/\//i.test(url) ? [`elitlig-media://m/${encodeURIComponent(url)}`, url] : [url];
    const tryAt = (i) => {
      if (cancelled || i >= candidates.length) return;
      const el = new Image();
      if (!/^(data|blob):/i.test(candidates[i])) el.crossOrigin = "anonymous";
      el.decoding = "async";
      el.onload = () => {
        if (cancelled) return;
        try {
          const c = document.createElement("canvas");
          c.width = 2; c.height = 2;
          const cx = c.getContext("2d");
          cx.drawImage(el, 0, 0, 2, 2);
          cx.getImageData(0, 0, 1, 1);
          setImg(el);
        } catch { tryAt(i + 1); }
      };
      el.onerror = () => tryAt(i + 1);
      el.src = candidates[i];
    };
    tryAt(0);
    return () => { cancelled = true; };
  }, [url, inline]);
  return img;
}
