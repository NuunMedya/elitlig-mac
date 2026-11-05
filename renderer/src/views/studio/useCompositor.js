// Yayın Stüdyosu — karıştırıcı: PROGRAM ve ÖNİZLEME tuvalleri.
//
// PROGRAM tuvali (çıkış boyutunda, ör. 1920×1080) yayına giden görüntüdür;
// captureStream(fps) ile kaydediciye verilir. Her karede: program sahnesinin
// katmanları (ya da tekrar videosu), geçişte iki sahnenin karışımı, en üstte
// skorbord ve tekrar rozeti. ÖNİZLEME tuvali düzenlenen sahneyi daha düşük
// çözünürlükte gösterir (yayına gitmez; hazır olmayan kaynak yazılı kutu).
//
// Zamanlama: requestAnimationFrame + yedek setInterval. Pencere gizlenince /
// örtülünce rAF durur; yedek zamanlayıcı kareyi sürdürür (ana süreçte
// webPreferences.backgroundThrottling = false gerekir, yoksa zamanlayıcı da
// saniyede bire düşer).
//
// Tuval asla "kirletilmez" (taint): uzak görseller yalnız CORS'la yüklenir;
// kirli tuvalde captureStream kare vermeyi keser.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { bugPlacement, drawReplayBadge, drawScoreBug } from "../../lib/studio/scorebug";
import { fallbackDue, previewSize, transitionProgress } from "../../lib/studio/compose";
import { drawScene, drawVideoFull } from "./draw";

export function useCompositor({ width, height, fps, configRef, runtimeRef, bugRef, imagesRef, replayRef }) {
  const program = useMemo(() => document.createElement("canvas"), []);
  const preview = useMemo(() => document.createElement("canvas"), []);
  const scratch = useMemo(() => document.createElement("canvas"), []);
  const transitionRef = useRef(null); // { fromId, toId, startedAt, ms }
  const [stats, setStats] = useState({ fps: 0 });
  const trackRef = useRef(null);

  // Boyutlar.
  useEffect(() => {
    program.width = width; program.height = height;
    scratch.width = width; scratch.height = height;
    const p = previewSize(width, height);
    preview.width = p.width; preview.height = p.height;
  }, [width, height, program, preview, scratch]);

  // Görüntü izi (fps değişince yenilenir; yayın sürerken kalite kilitlidir).
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
    const sceneOf = (id) => cfg.scenes.find((s) => s.id === id) || null;
    const replay = replayRef.current;
    const bug = bugRef.current;
    const images = imagesRef.current || {};

    // PROGRAM
    const tr = transitionRef.current;
    if (replay?.active && replay.el) {
      drawVideoFull(ctx, replay.el, W, H);
    } else if (tr) {
      const p = transitionProgress(tr, now);
      drawScene(ctx, sceneOf(tr.fromId), cfg.sources, runtime, W, H);
      if (p > 0) {
        const sctx = scratch.getContext("2d", { alpha: false });
        drawScene(sctx, sceneOf(tr.toId), cfg.sources, runtime, W, H);
        ctx.globalAlpha = p;
        ctx.drawImage(scratch, 0, 0);
        ctx.globalAlpha = 1;
      }
      if (p >= 1) transitionRef.current = null;
    } else {
      drawScene(ctx, sceneOf(cfg.programSceneId), cfg.sources, runtime, W, H);
    }
    if (cfg.overlay?.scorebug !== false && bug) {
      const place = bugPlacement(W);
      const state = { ...bug, clockMs: bug.clockAt ? bug.clockAt(Date.now()) : bug.clockMs, event: replay?.active ? replay.event : bug.event };
      drawScoreBug(ctx, state, { ...place, images });
    }
    if (replay?.active) drawReplayBadge(ctx, W);

    // ÖNİZLEME (her iki karede bir; yayına gitmez)
    frame.current.previewSkip = (frame.current.previewSkip + 1) % 2;
    if (frame.current.previewSkip === 0) {
      const pw = preview.width;
      const ph = preview.height;
      const pctx = preview.getContext("2d", { alpha: false });
      drawScene(pctx, sceneOf(cfg.previewSceneId), cfg.sources, runtime, pw, ph, { placeholders: true });
      if (cfg.overlay?.scorebug !== false && bug) {
        const place = bugPlacement(pw);
        drawScoreBug(pctx, { ...bug, clockMs: bug.clockAt ? bug.clockAt(Date.now()) : bug.clockMs }, { ...place, images });
      }
    }

    // fps ölçümü
    const f = frame.current;
    f.count += 1;
    if (now - f.statAt >= 1000) {
      setStats({ fps: Math.round((f.count * 1000) / (now - f.statAt || 1)) });
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
    // Yedek: pencere gizli / örtülüyken rAF çalışmaz.
    const timer = setInterval(() => {
      const now = performance.now();
      if (fallbackDue(frame.current.last, now, fps)) { frame.current.last = now; draw(now); }
    }, Math.max(8, Math.floor(interval / 2)));
    return () => { alive = false; cancelAnimationFrame(raf); clearInterval(timer); };
  }, [draw, fps]);

  /** Önizlemedeki sahneyi programa al (kesme ya da 300 ms geçiş). */
  const startTransition = useCallback((fromId, toId, ms) => {
    if (!ms || fromId === toId) { transitionRef.current = null; return; }
    transitionRef.current = { fromId, toId, startedAt: performance.now(), ms };
  }, []);

  const getVideoTrack = useCallback(() => trackRef.current, []);

  return { program, preview, stats, startTransition, getVideoTrack };
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
        // CORS'suz yanıt yüklense bile tuvali kirletebilir; küçük tuvalde dene.
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
