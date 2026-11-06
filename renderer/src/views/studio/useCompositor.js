// Yayın Stüdyosu — karıştırıcı: PROGRAM ve ÖNİZLEME tuvalleri.
//
// PROGRAM tuvali (çıkış boyutunda, ör. 1920×1080) yayına giden görüntüdür;
// captureStream(fps) ile kaydediciye verilir. Her karede sırayla:
//   1. taban: VAR çerçevesi | özel kip (modesRef.programOverride: tekrar / VAR /
//      röportaj / özet kipleri) | tekrar videosu | geçiş | program sahnesi
//   2. yayın grafikleri (grafik modülü; sceneId ile sahneye göre süzülür —
//      özel kipte yalnız override.graphics === true ise)
//   3. tekrar rozeti
//   4. marka logo geçişi (stinger) en üstte
// ÖNİZLEME tuvali önizlemedeki sahneyi (ya da modesRef.previewOverride'ı) daha
// düşük çözünürlükte gösterir (grafikler isteğe bağlı, soluk); düzenleyicide
// sürüklenen kutu yapılandırmaya yazılmadan (overrideRef) anında çizilir.
//
// Sabit kare hızı: rAF + yedek setInterval; React durumu kare başına
// GÜNCELLENMEZ (istatistik ref'te), önizleme 2–3 karede bir çizilir, geçiş
// dışında ara tuval kullanılmaz. Uzun kareler (takılma) sayılır: Yayın sağlığı.
//
// Tuval asla "kirletilmez" (taint): uzak görseller yalnız CORS'la yüklenir.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { bugPlacement, drawBottomBoard, drawReplayBadge, drawScoreBug } from "../../lib/studio/scorebug";
import { fallbackDue, previewSize } from "../../lib/studio/compose";
import { drawStinger, STINGER_MS } from "../../lib/studio/stinger";
import { drawTransitionStinger, isStingerKind, progressAt, transitionFrame } from "../../lib/studio/transitions";
import { resolveScene } from "../../lib/studio/scenes";
import { drawScene, drawVideoFull } from "./draw";
import { drawVar } from "./var/drawVar";

/** Skorbord türü (grafik modülü yokken yedek). */
export const bugVariantOf = (cfg) => cfg?.overlay?.variant || (cfg?.overlay?.scorebug === false ? "off" : "small");

/** Yedek skorbord çizimi (grafik modülü yoksa; özet de kullanır). */
export function drawBug(ctx, variant, state, W, H, images) {
  if (!state || variant === "off") return;
  if (variant === "bottom") drawBottomBoard(ctx, state, { outW: W, outH: H, images });
  else drawScoreBug(ctx, state, { ...bugPlacement(W), images });
}

/** Bir görünümü (from / to) dönüşümüyle hedef tuvale basar. */
function blit(ctx, src, v, W, H, blurCanvas) {
  if (v.alpha <= 0.001) return;
  ctx.save();
  ctx.globalAlpha = Math.min(1, v.alpha);
  if (v.scale !== 1 || v.dx || v.dy) {
    ctx.translate(W / 2 + v.dx * W, H / 2 + v.dy * H);
    ctx.scale(v.scale, v.scale);
    ctx.translate(-W / 2, -H / 2);
  }
  ctx.drawImage(src, 0, 0, W, H);
  if (v.blur > 0.01 && blurCanvas) {
    // Ucuz bulanıklık: küçült-büyüt (filter: blur 1080p'de pahalı).
    const b = blurCanvas.getContext("2d");
    b.imageSmoothingEnabled = true;
    b.drawImage(src, 0, 0, blurCanvas.width, blurCanvas.height);
    ctx.globalAlpha = Math.min(1, v.alpha) * Math.min(1, v.blur * 1.15);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(blurCanvas, 0, 0, W, H);
  }
  ctx.restore();
}

/** Geçişte "özel kip" hedefi (sahne kimliği yerine). */
export const MODE_TARGET = "mode:program";

export function useCompositor({ width, height, fps, configRef, runtimeRef, overlayRef, replayRef, varRef, brandRef, overrideRef, previewGraphicsRef, matchClockRef, modesRef }) {
  const program = useMemo(() => document.createElement("canvas"), []);
  const preview = useMemo(() => document.createElement("canvas"), []);
  const scratchA = useMemo(() => document.createElement("canvas"), []);
  const scratchB = useMemo(() => document.createElement("canvas"), []);
  const blurC = useMemo(() => document.createElement("canvas"), []);
  const transitionRef = useRef(null); // { kind, fromId, toId, startedAt, ms }
  const stingerRef = useRef(null); // { startedAt, ms, onMid, onEnd, midFired }
  const statsRef = useRef({ fps: 0, drawMs: 0, stalls: 0, totalStalls: 0 });
  const trackRef = useRef(null);

  useEffect(() => {
    program.width = width; program.height = height;
    scratchA.width = width; scratchA.height = height;
    scratchB.width = width; scratchB.height = height;
    blurC.width = Math.max(16, Math.round(width / 28)); blurC.height = Math.max(9, Math.round(height / 28));
    const p = previewSize(width, height);
    preview.width = p.width; preview.height = p.height;
  }, [width, height, program, preview, scratchA, scratchB, blurC]);

  useEffect(() => {
    let stream = null;
    try { stream = program.captureStream(fps); } catch { stream = null; }
    trackRef.current = stream?.getVideoTracks()[0] || null;
    return () => { stream?.getTracks().forEach((t) => t.stop()); trackRef.current = null; };
  }, [program, fps]);

  const frame = useRef({ last: 0, count: 0, statAt: 0, previewSkip: 0, drawMax: 0, stalls: 0, total: 0 });

  const draw = useCallback((now) => {
    const cfg = configRef.current;
    const runtime = runtimeRef.current;
    if (!cfg) return;
    const t0 = performance.now();
    const W = program.width;
    const H = program.height;
    const ctx = program.getContext("2d", { alpha: false });
    const sceneOf = (id) => resolveScene(cfg, id);
    const modes = modesRef?.current || null;
    const pgmOv = modes?.programOverride || null;
    const pvwOv = modes?.previewOverride || null;
    const replay = replayRef.current;
    const vr = varRef?.current;
    const brand = brandRef?.current || {};
    const clock = matchClockRef?.current?.() ?? null;
    // Düzenleyicide sürüklenen kutu (stüdyo modu kapalıyken program da düzenlenir).
    const opts = { now, matchClockMs: clock, override: overrideRef?.current || null };
    // Sahne ya da özel kip (geçişte MODE_TARGET): hedef tuvale çizer.
    const drawTarget = (c, id, w, h) => {
      if (id === MODE_TARGET) {
        const ov = pgmOv || pvwOv;
        c.fillStyle = "#000"; c.fillRect(0, 0, w, h);
        if (ov) { try { ov.draw(c, { width: w, height: h, now }); } catch { /* kip hatası yayını durdurmasın */ } }
        return;
      }
      drawScene(c, sceneOf(id), cfg.sources, runtime, w, h, opts);
    };

    // 1. taban
    const tr = transitionRef.current;
    let stingerP = null;
    let stingerKind = "stinger";
    let graphics = true;
    let gSceneId = cfg.programSceneId;
    if (vr?.active) {
      const vsrc = vr.sourceId ? cfg.sources.find((x) => x.id === vr.sourceId) : null;
      drawVar(ctx, W, H, now, { ...vr, source: vsrc, sourceRt: vsrc ? runtime.get(vsrc.id) : null }, brand);
    } else if (pgmOv && !(tr && (tr.toId === MODE_TARGET || tr.fromId === MODE_TARGET))) {
      ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
      // drawBase: program SAHNESİ grafiksiz (kipin giriş / çıkış geçişinin öbür ucu).
      try { pgmOv.draw(ctx, { width: W, height: H, now, drawBase: (c) => drawScene(c, sceneOf(cfg.programSceneId), cfg.sources, runtime, W, H, opts) }); } catch { /* yoksay */ }
      graphics = pgmOv.graphics === true;
      gSceneId = pgmOv.id || null;
    } else if (replay?.active && replay.el) {
      drawVideoFull(ctx, replay.el, W, H);
    } else if (tr) {
      const p = progressAt(tr, now);
      const f = transitionFrame(tr.kind, p);
      if (isStingerKind(tr.kind)) {
        drawTarget(ctx, f.switched ? tr.toId : tr.fromId, W, H);
        stingerP = p;
        stingerKind = tr.kind;
      } else if (tr.kind === "fade") {
        drawTarget(ctx, tr.fromId, W, H);
        const b = scratchB.getContext("2d", { alpha: false });
        drawTarget(b, tr.toId, W, H);
        blit(ctx, scratchB, f.to, W, H, null);
      } else {
        const a = scratchA.getContext("2d", { alpha: false });
        const b = scratchB.getContext("2d", { alpha: false });
        drawTarget(a, tr.fromId, W, H);
        drawTarget(b, tr.toId, W, H);
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, W, H);
        blit(ctx, scratchA, f.from, W, H, blurC);
        if (f.wipe != null) {
          // Silme: yumuşak kenarlı, soldan sağa açılır.
          const edge = f.wipe * (W * 1.1) - W * 0.05;
          ctx.save();
          ctx.beginPath();
          ctx.rect(0, 0, Math.max(0, edge), H);
          ctx.clip();
          ctx.drawImage(scratchB, 0, 0, W, H);
          ctx.restore();
          ctx.fillStyle = "rgba(255,255,255,0.85)";
          ctx.fillRect(edge - Math.max(2, W / 480), 0, Math.max(2, W / 240), H);
        } else blit(ctx, scratchB, f.to, W, H, blurC);
      }
      const toMode = tr.toId === MODE_TARGET;
      if (toMode) { graphics = (pgmOv || pvwOv)?.graphics === true || p < 0.5; gSceneId = p < 0.5 ? tr.fromId : (pgmOv || pvwOv)?.id || null; }
      else if (tr.fromId === MODE_TARGET) { gSceneId = tr.toId; graphics = p >= 0.5 || (pgmOv || pvwOv)?.graphics === true; }
      else gSceneId = p < 0.5 ? tr.fromId : tr.toId;
      if (p >= 1) transitionRef.current = null;
    } else {
      drawScene(ctx, sceneOf(cfg.programSceneId), cfg.sources, runtime, W, H, opts);
    }

    // 2. yayın grafikleri (sahneye göre süzülür)
    if (graphics) {
      try { overlayRef.current?.(ctx, { width: W, height: H, now, target: "program", sceneId: gSceneId, replay: Boolean(replay?.active), event: replay?.active ? replay.event : null }); } catch { /* grafik hatası yayını durdurmasın */ }
    }
    // 3. tekrar rozeti
    if (replay?.active && !vr?.active) drawReplayBadge(ctx, W);
    // 4. logo geçişi
    if (stingerP != null && stingerP < 1) drawTransitionStinger(ctx, W, H, stingerKind, stingerP, brand.logo, brand.branding);
    const sg = stingerRef.current;
    if (sg) {
      const p = Math.min(1, (now - sg.startedAt) / sg.ms);
      if (p >= 0.5 && !sg.midFired) {
        sg.midFired = true;
        try { sg.onMid?.(); } catch { /* yoksay */ }
      }
      if (p < 1) drawStinger(ctx, W, H, p, brand.logo, brand.branding);
      else {
        stingerRef.current = null;
        try { sg.onEnd?.(); } catch { /* yoksay */ }
      }
    }

    // ÖNİZLEME (2 / 3 karede bir; yayına gitmez)
    const f = frame.current;
    f.previewSkip = (f.previewSkip + 1) % (fps > 40 ? 3 : 2);
    if (f.previewSkip === 0) {
      const pw = preview.width;
      const ph = preview.height;
      const pctx = preview.getContext("2d", { alpha: false });
      if (pvwOv) {
        pctx.fillStyle = "#000"; pctx.fillRect(0, 0, pw, ph);
        try { pvwOv.draw(pctx, { width: pw, height: ph, now }); } catch { /* yoksay */ }
      } else drawScene(pctx, sceneOf(cfg.previewSceneId), cfg.sources, runtime, pw, ph, { ...opts, placeholders: true });
      if (previewGraphicsRef?.current && (!pvwOv || pvwOv.graphics === true)) {
        pctx.save();
        pctx.globalAlpha = 0.55;
        try { overlayRef.current?.(pctx, { width: pw, height: ph, now, target: "preview", sceneId: pvwOv ? pvwOv.id || null : cfg.previewSceneId }); } catch { /* yoksay */ }
        pctx.restore();
      }
    }

    const dt = performance.now() - t0;
    if (dt > f.drawMax) f.drawMax = dt;
    f.count += 1;
    if (now - f.statAt >= 1000) {
      statsRef.current = { fps: Math.round((f.count * 1000) / (now - f.statAt || 1)), drawMs: Math.round(f.drawMax * 10) / 10, stalls: f.stalls, totalStalls: f.total };
      f.count = 0;
      f.statAt = now;
      f.drawMax = 0;
      f.stalls = 0;
    }
  }, [blurC, brandRef, configRef, fps, matchClockRef, modesRef, overlayRef, overrideRef, preview, previewGraphicsRef, program, replayRef, runtimeRef, scratchA, scratchB, varRef]);

  useEffect(() => {
    let raf = 0;
    let alive = true;
    const interval = 1000 / Math.max(1, fps);
    const run = (now) => {
      const f = frame.current;
      // Takılma: iki kare süresinden uzun boşluk (ana iş parçacığı meşgul).
      if (f.last && now - f.last > interval * 2.5) { f.stalls += 1; f.total += 1; }
      f.last = now;
      draw(now);
    };
    const loop = () => {
      if (!alive) return;
      const now = performance.now();
      if (now - frame.current.last >= interval - 2) run(now);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const timer = setInterval(() => {
      const now = performance.now();
      if (fallbackDue(frame.current.last, now, fps)) run(now);
    }, Math.max(8, Math.floor(interval / 2)));
    return () => { alive = false; cancelAnimationFrame(raf); clearInterval(timer); };
  }, [draw, fps]);

  /** Önizlemedeki sahneyi programa al. kind: transitions.js türü. */
  const startTransition = useCallback((fromId, toId, kind, ms) => {
    if (!ms || kind === "cut" || fromId === toId) { transitionRef.current = null; return; }
    transitionRef.current = { kind, fromId, toId, startedAt: performance.now(), ms };
  }, []);

  /**
   * Bağımsız logo geçişi (tekrar / VAR giriş-çıkışı): onMid ekran tam
   * örtülüyken çağrılır. Çizim döngüsü durmuşsa yedek zamanlayıcı onMid'i yine çağırır.
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
  const transitionNow = useCallback(() => transitionRef.current, []);

  return { program, preview, getStats, startTransition, playStinger, getVideoTrack, busy, transitionNow };
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
