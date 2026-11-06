// Yayın Stüdyosu — YAYIN MODLARI: TEKRAR · VAR · RÖPORTAJ · ÖZET (sözleşme: ./index.js).
//
// Her mod kendi dok sekmesinde kurulur; sekme açıkken mod ÖNİZLEME'ye çizilir
// (previewOverride). "Yayına al" seçilen geçişle PROGRAM'a verir
// (programOverride: geçişi, ek katmanları ve grafikleri kendisi çizer),
// "Canlıya dön" sahneye geri geçer. Karıştırıcı yalnız şunu yapar:
//   önizleme: previewOverride ? previewOverride.draw(pctx, { width, height, now }) : sahne
//   program:  programOverride ? programOverride.draw(ctx, { width, height, now, drawBase }) : sahne + grafikler
// drawBase(ctx): program SAHNESİNİ grafiksiz çizer (geçişin öbür ucu);
// verilmezse engine.drawScene, o da yoksa yayına alma anındaki kare dondurulur.
import React, { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import { MODES, MODE_IDLE, isOnAirState, modeOf, modeReducer, modeTransitionAt, normalizeModeSettings } from "../../../lib/studio/modes";
import { DEFAULT_BRANDING } from "../../../lib/studio/stinger";
import { drawReplayBadge } from "../../../lib/studio/scorebug";
import { useCanvasImage } from "../useCompositor";
import { drawGraphicsSafe } from "../scenes/graphicsBridge";
import { useVar } from "../var/useVar";
import { drawExtras, drawModeGraphics, makeScratch, paintTransition } from "./drawModes";
import { useReplayMode } from "./useReplayMode";
import { useInterviewMode } from "./useInterviewMode";
import { useHighlightMode } from "./useHighlightMode";
import ModeTab from "./ModeTab";
import logoInline from "../../../assets/elitlig-beyaz.png?inline";
import "./modes.css";

const NOOP = () => {};
const passiveApi = (api) => ({ ...api, setPreview: NOOP, clearPreview: NOOP });
const asSources = (s) => (Array.isArray(s) ? { list: s, runtimeRef: null } : { list: s?.list || [], runtimeRef: s?.runtimeRef || null, programIds: s?.programIds || null });

export function useBroadcastModes({ engine, live, g, sources, scenes, settings, audio, replays, toast, ask, matchId: matchIdProp, imagesRef: imagesRefProp } = {}) {
  const matchId = matchIdProp ?? live?.match?.id ?? null;
  const src = asSources(sources);
  const cfg = useMemo(() => normalizeModeSettings(settings?.value), [settings?.value]);
  const onChangeRef = useRef(settings?.onChange);
  onChangeRef.current = settings?.onChange;
  const setCfg = useCallback((fn) => onChangeRef.current?.((prev) => {
    const cur = normalizeModeSettings(prev);
    return typeof fn === "function" ? fn(cur) : { ...cur, ...fn };
  }), []);
  const [state, dispatch] = useReducer(modeReducer, MODE_IDLE);
  const stateRef = useRef(state);
  stateRef.current = state;
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const say = useCallback((m, o) => toastRef.current?.(m, o || { tone: "warn" }), []);

  /* ───────── marka, görseller, grafikler ───────── */
  const branding = g?.branding || DEFAULT_BRANDING;
  const defaultLogo = useCanvasImage(logoInline, { inline: true });
  const brandLogo = useCanvasImage(g?.branding?.logoUrl || null);
  const homeLogo = useCanvasImage(live?.logos?.home || null);
  const awayLogo = useCanvasImage(live?.logos?.away || null);
  const logo = brandLogo || defaultLogo;
  const brandRef = useRef(null);
  brandRef.current = { logo, branding };
  const ownImages = useRef({});
  ownImages.current = { logo, home: homeLogo, away: awayLogo, branding };
  const imagesRef = imagesRefProp || ownImages;
  const gRef = useRef(g);
  gRef.current = g;
  const snapshotOf = () => gRef.current?.snapshotRef?.current || gRef.current?.snapshot || null;

  const airMode = isOnAirState(state) ? state.air : null;
  const previewMode = state.preview;

  /* ───────── mod denetleyicileri ───────── */
  const endRef = useRef(() => {});
  const rm = useReplayMode({
    replays, rate: cfg.rate, audio, between: cfg.between, brandRef,
    onFinished: () => endRef.current(), onError: (m) => say(m, { tone: "error", timeout: 5000 }), previewing: previewMode === "tekrar",
  });
  const setVarSettings = useCallback((fn) => setCfg((c) => ({ ...c, var: typeof fn === "function" ? fn(c.var) : fn })), [setCfg]);
  const vr = useVar({
    settings: cfg.var, onSettings: setVarSettings, replays: replays?.replays || [], sources: src.list, runtimeRef: src.runtimeRef, audio,
    onAir: airMode === "var", previewing: previewMode === "var", brandRef, onError: (m) => say(m),
  });
  const im = useInterviewMode({ matchId, g, encoding: Boolean(engine?.active), toast, scene: cfg.interview, sources: src.list, runtimeRef: src.runtimeRef, brandRef, drawProgram: engine?.drawScene || null });
  const hm = useHighlightMode({ matchId, live, audio, imagesRef, onAir: airMode === "ozet", previewing: previewMode === "ozet", onFinished: () => endRef.current() });

  // Ses bağlamı: yayındaki moda göre yönlendirme.
  const setAirMode = audio?.setAirMode;
  useEffect(() => { setAirMode?.(airMode); }, [airMode, setAirMode]);

  /* ───────── çizim ───────── */
  const ctrl = useRef(null);
  ctrl.current = { rm, vr, im, hm, cfg, src };
  const drawFull = useCallback((mode, ctx, W, H, now, target) => {
    const { rm: R, vr: V, im: I, hm: Hm, cfg: C, src: S } = ctrl.current;
    const layers = C.layers[mode];
    if (mode === "tekrar") (target === "program" ? R.drawProgram : R.drawPreview)(ctx, W, H, now);
    else if (mode === "var") V.draw(ctx, W, H, now);
    else if (mode === "roportaj") I.draw(ctx, W, H, now);
    else if (mode === "ozet") Hm.draw(ctx, W, H, now);
    drawExtras(ctx, W, H, layers, mode, S.list, S.runtimeRef?.current, now);
    const ev = mode === "tekrar" ? R.event(target) : null;
    drawModeGraphics(ctx, W, H, snapshotOf(), layers, mode, drawGraphicsSafe, ev ? { replayEvent: ev } : null);
    if (mode === "tekrar") { if (target === "program") R.drawProgramTop(ctx, W, H, now); else drawReplayBadge(ctx, W); }
  }, []);

  const scratch = useMemo(makeScratch, []);
  const frozenRef = useRef(null);
  const engineRef = useRef(engine);
  engineRef.current = engine;
  const drawBase = useCallback((ctx, W, H, now, info) => {
    if (info?.drawBase) info.drawBase(ctx);
    else if (engineRef.current?.drawScene) engineRef.current.drawScene(ctx, W, H, now);
    else if (frozenRef.current) ctx.drawImage(frozenRef.current, 0, 0, W, H);
    else { ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H); }
    const snap = snapshotOf();
    if ((info?.drawBase || engineRef.current?.drawScene) && drawGraphicsSafe && snap) {
      try { drawGraphicsSafe(ctx, { width: W, height: H, now: Date.now() }, snap); } catch { /* yoksay */ }
    }
  }, []);

  const previewOverride = useMemo(() => (previewMode ? {
    id: `mode:${previewMode}`, label: modeOf(previewMode).label, mode: previewMode, graphics: false,
    draw: (ctx, { width, height, now = performance.now() }) => drawFull(previewMode, ctx, width, height, now, "preview"),
  } : null), [previewMode, drawFull]);

  const air = state.air && state.stage !== "idle" ? state.air : null;
  const programOverride = useMemo(() => (air ? {
    id: `mode:${air}`, label: modeOf(air).label, mode: air, graphics: false,
    draw: (ctx, info = {}) => {
      const W = info.width || ctx.canvas.width;
      const H = info.height || ctx.canvas.height;
      const now = info.now ?? performance.now();
      const s = stateRef.current;
      if (!s.air) { drawBase(ctx, W, H, now, info); return; }
      const at = modeTransitionAt(s, now);
      const toMode = (c) => drawFull(s.air, c, W, H, now, "program");
      if (!at) { toMode(ctx); return; }
      const base = (c) => drawBase(c, W, H, now, info);
      if (at.dir === "in") paintTransition(ctx, W, H, at, s.from ? (c) => drawFull(s.from, c, W, H, now, "program") : base, toMode, scratch, brandRef.current);
      else paintTransition(ctx, W, H, at, toMode, base, scratch, brandRef.current);
    },
  } : null), [air, drawBase, drawFull, scratch]);

  /* ───────── yayına al / canlıya dön ───────── */
  // Geçiş bitince durum ilerler.
  useEffect(() => {
    const tr = state.transition;
    if (!tr) return undefined;
    const t = setTimeout(() => dispatch({ type: "tick", now: performance.now() }), Math.max(0, tr.startedAt + tr.ms - performance.now()) + 16);
    return () => clearTimeout(t);
  }, [state.transition]);

  // Yayından çıkan modun temizliği (geçiş bittikten sonra).
  const lastAir = useRef(null);
  useEffect(() => {
    const cleanup = (prev) => {
      const { rm: R, im: I, hm: Hm } = ctrl.current;
      if (prev === "tekrar") R.stop(false);
      // Röportaj bandı burada kapatılmaz: bant yalnız Röportaj sekmesindeki anahtarla açılır / kapanır.
      if (prev === "roportaj" && I.scene.autoRecord && I.iv.recording) I.iv.stop();
      if (prev === "ozet") { try { Hm.el.pause(); } catch { /* yoksay */ } }
    };
    if (state.stage === "onair") {
      if (lastAir.current && lastAir.current !== state.air) cleanup(lastAir.current);
      lastAir.current = state.air;
    } else if (state.stage === "idle") {
      if (lastAir.current) cleanup(lastAir.current);
      lastAir.current = null;
    }
  }, [state.stage, state.air]);

  const freeze = useCallback(() => {
    const p = engineRef.current?.program;
    if (engineRef.current?.drawScene || !p?.width) return;
    const c = frozenRef.current || document.createElement("canvas");
    c.width = p.width; c.height = p.height;
    try { c.getContext("2d").drawImage(p, 0, 0); frozenRef.current = c; } catch { frozenRef.current = null; }
  }, []);

  const takeToAir = useCallback(async (transition, modeArg) => {
    const s = stateRef.current;
    const mode = modeArg || s.preview;
    if (!mode) { say("Önce bir modu (Tekrar / VAR / Röportaj / Özet) önizlemeye al."); return false; }
    const { rm: R, vr: V, im: I, hm: Hm, cfg: C } = ctrl.current;
    if (s.air === mode && s.stage === "onair") {
      if (mode === "tekrar") return R.start(); // yayındayken: seçilenleri hemen oynat
      return true;
    }
    if (mode === "tekrar") { const ok = await R.start(); if (!ok) return false; }
    if (mode === "var") V.onStart();
    if (mode === "ozet" && !Hm.ready) { say("Önce özeti oluştur (Özet sekmesi)."); return false; }
    if (mode === "roportaj") {
      if (!I.ready) { say("Ayrı röportaj sahnesi kurulmadı: bandı yayındaki sahnenin üstüne Röportaj sekmesindeki “Bant” anahtarıyla aç."); return false; }
      if (I.scene.autoRecord && !I.iv.recording && engineRef.current?.active) I.iv.start(I.scene.label, { band: false });
    }
    if (!s.air) freeze();
    dispatch({ type: "take", mode, transition: transition || C.transition, now: performance.now() });
    return true;
  }, [freeze, say]);

  const endOnAir = useCallback((transition) => {
    const s = stateRef.current;
    if (!s.air || s.stage === "leaving") return;
    dispatch({ type: "end", transition: transition || ctrl.current.cfg.transition, now: performance.now() });
  }, []);
  endRef.current = () => endOnAir();

  const setPreview = useCallback((mode) => dispatch({ type: "preview", mode }), []);
  const clearPreview = useCallback((mode) => dispatch({ type: "clearPreview", mode }), []);

  /* ───────── kısayollar / dış işlevler ───────── */
  const playLatest = useCallback(async () => {
    const q = ctrl.current.rm.latestQueue();
    if (!q.length) { say("Henüz tekrar yok: GOL'e bas ya da ÖNEMLİ AN (B) ile kaydet."); return false; }
    const s = stateRef.current;
    if (s.air === "tekrar" && s.stage === "onair") return ctrl.current.rm.start(q);
    const ok = await ctrl.current.rm.start(q);
    if (!ok) return false;
    if (!s.air) freeze();
    dispatch({ type: "take", mode: "tekrar", transition: ctrl.current.cfg.transition, now: performance.now() });
    return true;
  }, [freeze, say]);
  /** Verilen kuyruğu (buildReplayQueue biçimi) yayına ver — kısayol şeridindeki "Tekrar kuyruğu". */
  const playQueue = useCallback(async (q) => {
    if (!q?.length) return false;
    const s = stateRef.current;
    if (s.air === "tekrar" && s.stage === "onair") return ctrl.current.rm.start(q);
    const ok = await ctrl.current.rm.start(q);
    if (!ok) return false;
    if (!s.air) freeze();
    dispatch({ type: "take", mode: "tekrar", transition: ctrl.current.cfg.transition, now: performance.now() });
    return true;
  }, [freeze]);
  const toggleVar = useCallback(() => {
    const s = stateRef.current;
    if (s.air === "var" && s.stage !== "leaving") endOnAir();
    else takeToAir(null, "var");
  }, [endOnAir, takeToAir]);
  const openReplay = useCallback((replay) => { ctrl.current.rm.open(replay); setPreview("tekrar"); }, [setPreview]);

  /* ───────── sekmeler ───────── */
  const api = {
    state, cfg, setCfg, takeToAir, endOnAir, setPreview, clearPreview, airMode, previewMode,
    rm, vr, im, hm, replays, sources: src, scenes, live, g, audio, engine, toast, ask, matchId, imagesRef, brandRef,
  };
  const apiRef = useRef(api);
  apiRef.current = api;
  const tabs = MODES.map((m) => ({
    key: m.key,
    label: m.label,
    icon: m.icon,
    count: airMode === m.key ? "●" : m.key === "tekrar" ? (replays?.replays?.length || null) : null,
    // passive: çok sütunlu alt panel — sütun kendiliğinden önizlemeyi kipe almaz
    // (Studio sütuna dokununca setPreview çağırır); tek sekmede eski davranış.
    render: (opts) => <ModeTab key={m.key} mode={m.key} api={opts?.passive ? passiveApi(apiRef.current) : apiRef.current} />,
  }));

  return {
    tabs,
    previewOverride,
    programOverride,
    takeToAir,
    endOnAir,
    isOnAir: Boolean(airMode),
    airMode,
    previewMode,
    stage: state.stage,
    setPreview,
    clearPreview,
    openReplay,
    replay: { playLatest, playQueue, stop: () => endOnAir(), playing: airMode === "tekrar", index: rm.player.index, total: rm.player.total, item: rm.player.item },
    // Önizleme ekranındaki tekrar düzenleyicisi (modes/ReplayPreviewOverlay): yakınlaştır / kaydır,
    // zaman çizelgesi, giriş–çıkış noktası, hız. rate: ağır çekim (yayında anında uygulanır).
    replayEditor: { rm, rate: cfg.rate, setRate: (v) => setCfg((c) => ({ ...c, rate: Math.min(1, Math.max(0.25, Number(v) || 1)) })), sources: src.list, previewing: previewMode === "tekrar", onAir: airMode === "tekrar" },
    var: { toggle: toggleVar, active: airMode === "var" },
    interview: im.iv,
    highlights: hm.hl,
    micWarning: airMode === "var" && audio ? !audio.micMuted && !audio.killAll : false,
    settings: cfg,
  };
}
