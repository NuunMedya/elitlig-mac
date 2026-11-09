// Yayın Stüdyosu — karıştırıcı: PROGRAM ve ÖNİZLEME tuvalleri.
//
// İKİ ÇİZİM MOTORU (Ayarlar › Yayın › Çizim motoru; stüdyo açılırken seçilir):
//
//  • AYRI İŞ PARÇACIĞI (varsayılan, destekleniyorsa): program karesi compositor/program.worker.js
//    içinde OffscreenCanvas'ta, kendi sabit kare ızgarasında çizilir ve aynı işçide
//    VideoEncoder'a verilir. Kaynak kareleri ana iş parçacığına uğramadan işçiye akar
//    (compositor/workerHost.js). Arayüz (dock, panolar, küçük resimler, ölçerler) ne kadar
//    meşgul olursa olsun yayın fps'i düşmez. Program ekranı işçinin küçültülmüş aynasıdır.
//    Kip tabanı (tekrar / VAR / röportaj / özet; React durumuna bağlı çizimler) ana iş
//    parçacığında çizilir, VideoFrame olarak işçiye gider; grafik / rozet / geçiş / FTB ve
//    kodlama yine işçide. Önizleme ana iş parçacığında ≤20 fps (görünürken).
//  • ANA İŞ PARÇACIĞI (eski yol / yedek): her şey burada, rAF + yedek setInterval.
//    İşçi çökerse ya da kare vermezse oturum boyunca buna dönülür.
//
// PROGRAM katmanları (compositor/composeProgram.js, iki motorda aynı kod):
//   0. anlık durum (siyah / bekleme kartı / dondur) · 1. taban: VAR | özel kip | tekrar |
//   geçiş | program sahnesi · 2. yayın grafikleri · 3. tekrar rozeti · 4. logo geçişleri ·
//   5. SİYAHA GEÇ (FTB).
// Tuval asla "kirletilmez" (taint): uzak görseller yalnız CORS'la yüklenir.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { bugPlacement, drawBottomBoard, drawScoreBug } from "../../lib/studio/scorebug";
import { fallbackDue, previewSize } from "../../lib/studio/compose";
import { STINGER_MS } from "../../lib/studio/stinger";
import { progressAt } from "../../lib/studio/transitions";
import { resolveScene } from "../../lib/studio/scenes";
import { SECONDARY_FPS, chooseCompositorEngine } from "../../lib/studio/renderBudget";
import { drawScene } from "./draw";
import { drawVar } from "./var/drawVar";
import { MODE_TARGET, composeBase, composeTop, drawFtb, drawProgramFx, ftbLevel, needsMainBase, transitionTouchesMode } from "./compositor/composeProgram";
import { createWorkerCompositor, softwareGpu, workerCompositorSupported } from "./compositor/workerHost";
import { canvasLoop, startRenderLoadMonitor, trackDraw } from "./perf/renderLoad";

export { MODE_TARGET, ftbLevel, drawSlate } from "./compositor/composeProgram";

/** Skorbord türü (grafik modülü yokken yedek). */
export const bugVariantOf = (cfg) => cfg?.overlay?.variant || (cfg?.overlay?.scorebug === false ? "off" : "small");

/** Yedek skorbord çizimi (grafik modülü yoksa; özet de kullanır). */
export function drawBug(ctx, variant, state, W, H, images) {
  if (!state || variant === "off") return;
  if (variant === "bottom") drawBottomBoard(ctx, state, { outW: W, outH: H, images });
  else drawScoreBug(ctx, state, { ...bugPlacement(W), images });
}

const WATCHDOG_MS = 4000; // işçiden bu kadar süre sayaç / kare gelmezse ana iş parçacığına dön

export function useCompositor({ width, height, fps, configRef, runtimeRef, overlayRef, replayRef, varRef, brandRef, overrideRef, previewGraphicsRef, matchClockRef, modesRef, pgmFxRef = null, engine: engineSetting = "auto", snapshotRef = null, timerRef = null, workerGraphics = true }) {
  const program = useMemo(() => document.createElement("canvas"), []);
  const mirror = useMemo(() => document.createElement("canvas"), []);
  const preview = useMemo(() => document.createElement("canvas"), []);
  const scratchA = useMemo(() => document.createElement("canvas"), []);
  const scratchB = useMemo(() => document.createElement("canvas"), []);
  const blurC = useMemo(() => document.createElement("canvas"), []);
  const transitionRef = useRef(null); // { kind, fromId, toId, startedAt, ms }
  const stingerRef = useRef(null); // { startedAt, ms, onMid, onEnd, midFired }
  const statsRef = useRef({ fps: 0, drawMs: 0, stalls: 0, totalStalls: 0, engine: "main" });
  const trackRef = useRef(null);
  // Kare aboneleri (ana motorda WebCodecs kodlayıcısı): program karesi çizildikten hemen sonra çağrılır.
  const frameSubsRef = useRef(new Set());
  const ftbRef = useRef({ on: false, at: 0, ms: 600, from: 0 }); // from: geçişin başladığı siyahlık
  const hostRef = useRef(null);
  // Motor stüdyo açılırken seçilir (yayın sırasında değişmez); işçi çökerse ana yola dönülür.
  const [failed, setFailed] = useState(false);
  const [setting] = useState(engineSetting);
  const engine = useMemo(() => chooseCompositorEngine(setting, { supported: workerGraphics && workerCompositorSupported(), failed, software: setting === "auto" && softwareGpu() }), [setting, workerGraphics, failed]);
  const engineRef = useRef(engine);
  engineRef.current = engine;

  useEffect(() => { startRenderLoadMonitor(); }, []);

  useEffect(() => {
    program.width = width; program.height = height;
    scratchA.width = width; scratchA.height = height;
    scratchB.width = width; scratchB.height = height;
    blurC.width = Math.max(16, Math.round(width / 28)); blurC.height = Math.max(9, Math.round(height / 28));
    const p = previewSize(width, height);
    preview.width = p.width; preview.height = p.height;
  }, [width, height, program, preview, scratchA, scratchB, blurC]);

  // Ana motorda kaydedici izi: tuvalin captureStream'i (işçi motorunda getVideoTrack işçi karelerini verir).
  useEffect(() => {
    if (engine !== "main") return undefined;
    let stream = null;
    try { stream = program.captureStream(fps); } catch { stream = null; }
    trackRef.current = stream?.getVideoTracks()[0] || null;
    return () => { stream?.getTracks().forEach((t) => t.stop()); trackRef.current = null; };
  }, [program, fps, engine]);

  const frame = useRef({ last: 0, count: 0, statAt: 0, previewSkip: 0, drawMax: 0, drawSum: 0, stalls: 0, total: 0 });

  /** Kip / VAR / tekrar ortamı (yalnız ana iş parçacığı). */
  const baseEnv = useCallback((now, W, H, tr) => {
    const cfg = configRef.current;
    const modes = modesRef?.current || null;
    const vr = varRef?.current;
    const brand = brandRef?.current || {};
    const clock = matchClockRef?.current?.() ?? null;
    return {
      W, H, now, cfg, runtime: runtimeRef.current, tr,
      opts: { now, matchClockMs: clock, override: overrideRef?.current || null },
      scratch: { a: scratchA, b: scratchB, blur: blurC },
      vr, pgmOv: modes?.programOverride || null, pvwOv: modes?.previewOverride || null, replay: replayRef.current, brand,
      modeDraw: {
        varDraw: (ctx, w, h, t) => {
          const vsrc = vr.sourceId ? cfg.sources.find((x) => x.id === vr.sourceId) : null;
          drawVar(ctx, w, h, t, { ...vr, source: vsrc, sourceRt: vsrc ? runtimeRef.current.get(vsrc.id) : null }, brand);
        },
      },
    };
  }, [blurC, brandRef, configRef, matchClockRef, modesRef, overrideRef, replayRef, runtimeRef, scratchA, scratchB, varRef]);

  const endStinger = useCallback((sg) => {
    if (stingerRef.current !== sg) return;
    stingerRef.current = null;
    try { sg.onEnd?.(); } catch { /* yoksay */ }
  }, []);

  /** ÖNİZLEME (yayına gitmez). */
  const drawPreview = useCallback((now) => {
    const cfg = configRef.current;
    if (!cfg) return;
    const modes = modesRef?.current || null;
    const pvwOv = modes?.previewOverride || null;
    const pw = preview.width;
    const ph = preview.height;
    const pctx = preview.getContext("2d", { alpha: false });
    const opts = { now, matchClockMs: matchClockRef?.current?.() ?? null, override: overrideRef?.current || null, placeholders: true };
    if (pvwOv) {
      pctx.fillStyle = "#000"; pctx.fillRect(0, 0, pw, ph);
      try { pvwOv.draw(pctx, { width: pw, height: ph, now }); } catch { /* yoksay */ }
    } else drawScene(pctx, resolveScene(cfg, cfg.previewSceneId), cfg.sources, runtimeRef.current, pw, ph, opts);
    if (previewGraphicsRef?.current && (!pvwOv || pvwOv.graphics === true)) {
      pctx.save();
      pctx.globalAlpha = 0.55;
      try { overlayRef.current?.(pctx, { width: pw, height: ph, now, target: "preview", sceneId: pvwOv ? pvwOv.id || null : cfg.previewSceneId }); } catch { /* yoksay */ }
      pctx.restore();
    }
  }, [configRef, matchClockRef, modesRef, overlayRef, overrideRef, preview, previewGraphicsRef, runtimeRef]);

  /** Ana motor: tam program karesi (+ 2/3 karede bir önizleme). */
  const draw = useCallback((now) => {
    const cfg = configRef.current;
    if (!cfg) return;
    const t0 = performance.now();
    const W = program.width;
    const H = program.height;
    const ctx = program.getContext("2d", { alpha: false });
    // Kaynaklar program boyutuna ölçeklenirken yüksek kaliteli süzme (bağlam sıfırlanınca yeniden).
    if (ctx.imageSmoothingQuality !== "high") { ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high"; }
    const brand = brandRef?.current || {};
    const fxr = drawProgramFx(ctx, W, H, pgmFxRef?.current || null, brand);
    if (!fxr) {
      const env = baseEnv(now, W, H, transitionRef.current);
      const base = composeBase(ctx, env);
      if (base.done) transitionRef.current = null;
      const sg = stingerRef.current;
      const top = composeTop(ctx, { W, H, now, overlay: overlayRef.current, replay: env.replay, vr: env.vr, brand, stinger: sg, onStingerMid: (s) => s.onMid?.() }, base);
      if (top.stingerDone && sg) endStinger(sg);
    }
    drawFtb(ctx, W, H, ftbRef.current, now);
    const f = frame.current;
    f.previewSkip = (f.previewSkip + 1) % (fps > 40 ? 3 : 2);
    if (f.previewSkip === 0) drawPreview(now);
    const dt = performance.now() - t0;
    if (dt > f.drawMax) f.drawMax = dt;
    f.drawSum += dt;
    f.count += 1;
    if (now - f.statAt >= 1000) {
      statsRef.current = { fps: Math.round((f.count * 1000) / (now - f.statAt || 1)), drawMs: Math.round(f.drawMax * 10) / 10, avgMs: Math.round((f.drawSum / Math.max(1, f.count)) * 10) / 10, stalls: f.stalls, totalStalls: f.total, engine: "main" };
      f.count = 0; f.statAt = now; f.drawMax = 0; f.drawSum = 0; f.stalls = 0;
    }
  }, [baseEnv, brandRef, configRef, drawPreview, endStinger, fps, overlayRef, pgmFxRef, program]);

  // ── ANA MOTOR döngüsü ──
  useEffect(() => {
    if (engine !== "main") return undefined;
    let raf = 0;
    let alive = true;
    const interval = 1000 / Math.max(1, fps);
    const run = (now) => {
      const f = frame.current;
      // Takılma: iki kare süresinden uzun boşluk (ana iş parçacığı meşgul).
      if (f.last && now - f.last > interval * 2.5) { f.stalls += 1; f.total += 1; }
      f.last = now;
      const t0 = performance.now();
      draw(now);
      for (const fn of frameSubsRef.current) { try { fn(now); } catch { /* kodlayıcı hatası çizimi durdurmasın */ } }
      trackDraw("Program (ana iş parçacığı)", performance.now() - t0);
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
  }, [draw, fps, engine]);

  // ── İŞÇİ MOTORU ──
  useEffect(() => {
    if (engine !== "worker") return undefined;
    let host;
    try {
      host = createWorkerCompositor({ width, height, fps, mirrorCanvas: mirror, onFail: () => setFailed(true) });
    } catch {
      setFailed(true);
      return undefined;
    }
    hostRef.current = host;
    const startedAt = performance.now();
    const replayMemo = { active: false, event: null, obj: null };
    const replayState = () => {
      const r = replayRef.current;
      const active = Boolean(r?.active);
      const event = active ? r.event || null : null;
      if (active !== replayMemo.active || event !== replayMemo.event) { replayMemo.active = active; replayMemo.event = event; replayMemo.obj = active ? { active: true, event } : null; }
      return replayMemo.obj;
    };
    // Durum eşleme (20 Hz; yalnız değişen alan gönderilir) + kaynak beslemesi + gözcü.
    const sync = () => {
      const cfg = configRef.current;
      if (!cfg || !host.alive()) return;
      const now = performance.now();
      let tr = transitionRef.current;
      if (tr && !transitionTouchesMode(tr) && progressAt(tr, now) >= 1) { transitionRef.current = null; tr = null; }
      host.setState({
        cfg,
        snapshot: snapshotRef?.current ?? null,
        pgmFx: pgmFxRef?.current || null,
        override: overrideRef?.current || null,
        timer: timerRef?.current ?? null,
        replay: replayState(),
        ftb: ftbRef.current,
        tr: tr && !transitionTouchesMode(tr) ? tr : null,
        stinger: stingerRef.current,
      });
      host.setBrand(brandRef?.current || null);
      host.syncImages(snapshotRef?.current ?? null);
      host.syncSources(cfg, runtimeRef.current, tr ? [tr.fromId, tr.toId] : []);
      const s = host.stats();
      if (now - startedAt > WATCHDOG_MS + 2000 && (s.ageMs == null || s.ageMs > WATCHDOG_MS)) {
        console.warn("çizim işçisi yanıt vermiyor: ana iş parçacığına dönülüyor");
        setFailed(true);
      }
    };
    sync();
    const syncTimer = setInterval(sync, 50);
    hostRef.current.sync = sync;

    // Kip tabanı: tekrar / VAR / röportaj / özet ana iş parçacığında çizilir (React durumuna bağlı).
    let raf = 0;
    let alive = true;
    const interval = 1000 / Math.max(1, fps);
    const base = { last: 0, on: false, oc: null };
    const runBase = (now) => {
      const modes = modesRef?.current || null;
      const tr = transitionRef.current;
      const want = needsMainBase({ vr: varRef?.current, pgmOv: modes?.programOverride || null, replay: replayRef.current, tr });
      if (!want) { if (base.on) { base.on = false; host.baseOff(); } return; }
      base.on = true;
      base.last = now;
      const t0 = performance.now();
      const W = program.width; const H = program.height;
      // Kip tabanı ekran dışı tuvale çizilir; transferToImageBitmap kopyasız aktarır (VideoFrame
      // okuması gibi ana iş parçacığını bekletmez; işçide de ana iş parçacığına bağlı değildir).
      if (!base.oc || base.oc.width !== W || base.oc.height !== H) base.oc = typeof OffscreenCanvas === "function" ? new OffscreenCanvas(W, H) : null;
      const ctx = (base.oc || program).getContext("2d", { alpha: false });
      if (ctx.imageSmoothingQuality !== "high") { ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high"; }
      const out = composeBase(ctx, baseEnv(now, W, H, tr));
      if (out.done) { transitionRef.current = null; sync(); }
      host.pushBase(base.oc || program, { graphics: out.graphics, gSceneId: out.gSceneId, stingerP: out.stingerP, stingerKind: out.stingerKind }, now);
      trackDraw("Kip tabanı (ana iş parçacığı)", performance.now() - t0);
    };
    const loop = () => {
      if (!alive) return;
      const now = performance.now();
      if (now - base.last >= interval - 2) runBase(now);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const baseTimer = setInterval(() => { const now = performance.now(); if (fallbackDue(base.last, now, fps)) runBase(now); }, Math.max(8, Math.floor(interval / 2)));
    const stopPreview = canvasLoop("Önizleme ekranı", { fps: SECONDARY_FPS.preview, el: preview }, drawPreview);
    const statTimer = setInterval(() => {
      const s = host.stats();
      statsRef.current = { fps: s.fps || 0, drawMs: s.drawMs || 0, avgMs: s.avgMs || 0, stalls: s.late || 0, totalStalls: (statsRef.current.totalStalls || 0) + (s.late || 0), engine: "worker", unique: s.unique, mainBase: s.mainBase, basesIn: s.basesIn, baseMs: s.baseMs, gfxMs: s.gfxMs, encSubmitMs: s.encSubmitMs, srcFps: s.srcFps, sources: s.sources, mirrorAgeMs: s.mirrorAgeMs };
    }, 1000);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      clearInterval(baseTimer); clearInterval(syncTimer); clearInterval(statTimer);
      stopPreview();
      host.stop();
      if (hostRef.current === host) hostRef.current = null;
      trackRef.current = null;
    };
  }, [engine, width, height, fps, mirror, program, preview, drawPreview, baseEnv, brandRef, configRef, modesRef, overrideRef, pgmFxRef, replayRef, runtimeRef, snapshotRef, timerRef, varRef]);

  const syncNow = () => { try { hostRef.current?.sync?.(); } catch { /* yoksay */ } };
  // Her stüdyo çiziminden sonra (yapılandırma / kesme anında değişir): işçi 50 ms beklemeden güncellenir.
  useEffect(() => { syncNow(); });

  /** Önizlemedeki sahneyi programa al. kind: transitions.js türü. */
  const startTransition = useCallback((fromId, toId, kind, ms) => {
    if (!ms || kind === "cut" || fromId === toId) { transitionRef.current = null; syncNow(); return; }
    transitionRef.current = { kind, fromId, toId, startedAt: performance.now(), ms };
    syncNow();
  }, []);

  /**
   * Bağımsız logo geçişi (tekrar / VAR giriş-çıkışı): onMid ekran tam örtülüyken çağrılır.
   * Ana motorda çizim döngüsü çağırır (durmuşsa yedek zamanlayıcı); işçi motorunda zamanlayıcı.
   */
  const playStinger = useCallback(({ onMid, onEnd, ms = STINGER_MS } = {}) => {
    const prev = stingerRef.current;
    if (prev && !prev.midFired) { prev.midFired = true; try { prev.onMid?.(); } catch { /* yoksay */ } }
    if (prev) { stingerRef.current = null; try { prev.onEnd?.(); } catch { /* yoksay */ } }
    const sg = { startedAt: performance.now(), ms, onMid, onEnd, midFired: false };
    stingerRef.current = sg;
    syncNow();
    const worker = engineRef.current === "worker";
    setTimeout(() => {
      if (stingerRef.current !== sg) return;
      if (!sg.midFired) { sg.midFired = true; try { sg.onMid?.(); } catch { /* yoksay */ } }
    }, worker ? ms * 0.5 : ms * 0.5 + 250);
    if (worker) setTimeout(() => { endStinger(sg); syncNow(); }, ms);
  }, [endStinger]);

  const getVideoTrack = useCallback(() => {
    if (engineRef.current === "worker") return hostRef.current?.videoTrack() || null;
    return trackRef.current;
  }, []);
  const getStats = useCallback(() => statsRef.current, []);
  const getCanvas = useCallback(() => program, [program]);
  /** İşçi motorunda görüntü işçide kodlanır (webcodecs.js remoteEncoder); ana motorda null. */
  const getRemoteEncoder = useCallback(() => (engineRef.current === "worker" && hostRef.current?.alive() ? hostRef.current.encoder : null), []);
  /** fn(now) her program karesinden sonra (yalnız ana motor); dönüş: aboneliği kaldır. */
  const subscribeFrames = useCallback((fn) => { frameSubsRef.current.add(fn); return () => frameSubsRef.current.delete(fn); }, []);
  const busy = useCallback(() => {
    const tr = transitionRef.current;
    if (tr && engineRef.current === "worker" && !transitionTouchesMode(tr) && progressAt(tr, performance.now()) >= 1) transitionRef.current = null;
    return Boolean(transitionRef.current || stingerRef.current);
  }, []);
  /** Siyaha geç / geri aç (on: true | false | undefined = değiştir). */
  const setFtb = useCallback((on, ms = 600) => {
    const cur = ftbRef.current;
    const want = typeof on === "boolean" ? on : !cur.on;
    if (want === cur.on) return want;
    const now = performance.now();
    ftbRef.current = { on: want, at: now, ms: Math.max(0, ms), from: ftbLevel(cur, now) };
    syncNow();
    return want;
  }, []);
  const programFx = useCallback(() => ({ ftb: ftbRef.current.on }), []);
  const transitionNow = useCallback(() => { busy(); return transitionRef.current; }, [busy]);

  // Ekranda gösterilen program tuvali: işçi motorunda ayna.
  const shown = engine === "worker" ? mirror : program;
  return { program: shown, preview, engine, getStats, startTransition, playStinger, getVideoTrack, getCanvas, getRemoteEncoder, subscribeFrames, busy, transitionNow, setFtb, programFx };
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
