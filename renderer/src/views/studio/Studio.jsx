// YAYIN STÜDYOSU — OBS benzeri canlı yayın + reji (mobil /yonetim/canli-yayin/:id
// ile aynı sunucu ve aynı akışlar; masaüstünde birden çok kamera).
//
//   Üst çubuk   skor + maç adı, yayın durumu, YAYIN SAĞLIĞI, çalışma alanı düzeni,
//               grafik araç çubuğu (skorbord türü + LED içeriği), RÖPORTAJ, VAR,
//               SES (M), ÖNEMLİ AN (B), TEKRAR (R), yayını başlat / durdur, kısayollar (?)
//   Ekranlar    çalışma alanına göre: ÖNİZLEME | geçiş | PROGRAM, yalnız program,
//               2×2 / 3×3 çoklu görünüm + program, dikey sahne listesi + program.
//               Önizleme üzerinde katmanlar doğrudan düzenlenir (taşı / boyutla / kırp).
//               Geçişte program önizlemeye düşer (OBS stüdyo modu değiş tokuşu).
//   Şerit       SAHNELER (ve "Göster" ile seçilen kaynaklar): tık → önizleme, çift tık → yayın
//   Alt panel   Maç yönetimi (ilk ve varsayılan; maç seçimi buradan) · Sahneler & Kaynaklar ·
//               Tekrar & Özet · VAR · Yayın · Ses · LED ekran
//
// Görüntü yolu: kaynaklar → PROGRAM tuvali (+ grafikler) → captureStream →
// MediaRecorder (+ WebAudio karışımı) → studio.pushChunk → ana süreç ffmpeg → RTMP
// (+ isteğe bağlı tam maç yerel kaydı). Her kaynak ayrıca kendi halka kaydına
// gider (açılar): GOL ya da ÖNEMLİ AN son 10 saniyeyi tüm açılardan tekrar yazar.
//
// Kare başına değişen her şey (fps, ölçerler, küçük resimler, sürüklenen kutu)
// ref'lerde ve yaprak bileşenlerde durur; alt panellere kimliği sabit işlevler
// verilir — açık açılır menüler kapanmaz, program tuvali sabit hızda çizilir.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon, Kbd, Modal, useConfirm, useToast } from "../../components/ui";
import { setLeaveGuard } from "../../lib/leaveGuard";
import {
  addLayer, addScene, addSource, addSourceWithScene, duplicateScene, isSourceSceneId, loadScenesConfig, makeLayer, moveLayerTo, moveSceneTo,
  multiviewTiles, normalizeLayer, removeLayer, removeScene, removeSource, renameScene, resetMultiview, resolveScene, saveScenesConfig,
  sceneAtHotkey, sourceSceneId, sourceUsage, toggleMultiview, updateLayer, updateSource, defaultFit,
} from "../../lib/studio/scenes";
import { encodingPreset, ingestUrl, keyAction, normalizeEncoding, reusableStream, statusPill } from "../../lib/studio/broadcast";
import { TRANSITION_KINDS, transitionKind, transitionMs } from "../../lib/studio/transitions";
import { DEFAULT_BRANDING } from "../../lib/studio/stinger";
import { micWarning } from "../../lib/studio/var";
import { SHORTCUTS, WORKSPACES, gridCells, previewVisible, workspaceOf } from "../../lib/studio/scenesWorkspace";
import { SCOREBUG_VARIANTS, scorerLines } from "../../lib/studio/scorebug";
import { eventLabel, isGoalCode, timerNowMs } from "../../lib/studio/match";
import { PROGRAM_ANGLE, anglesToRecord, buildReplayQueue, defaultAngles, metaFor, recordableSources, replayBanner } from "../../lib/studio/replays";
import { useLiveMatch } from "./useLiveMatch";
import { useStudioSources } from "./useStudioSources";
import { useAudioMixer } from "./useAudioMixer";
import { bugVariantOf, drawBug, useCanvasImage, useCompositor } from "./useCompositor";
import { useEngine } from "./useEngine";
import { useYoutube } from "./useYoutube";
import { useReplays } from "./useReplays";
import { useAngleRecorders } from "./useAngleRecorders";
import { useReplayPlayer } from "./useReplayPlayer";
import { useHighlights } from "./useHighlights";
import { useStable } from "./useStable";
import { errorText } from "./studioApi";
import Multiview, { Tile, tileWarning, useTileRenderer } from "./Multiview";
import Dock, { clampDock } from "./Dock";
import { SourceDialog } from "./SourcesPanel";
import ReplayPanel from "./ReplayPanel";
import HighlightsPanel from "./HighlightsPanel";
import BroadcastPanel from "./BroadcastPanel";
import AudioPanel, { LevelMeter } from "./AudioPanel";
import PlayerPicker from "./PlayerPicker";
import { ManageDock } from "./manage";
import Monitor from "./scenes/Monitor";
import SceneEditOverlay from "./scenes/SceneEditOverlay";
import ScenesPanel, { LayersList, ScenesList } from "./scenes/ScenesPanel";
import HealthChip from "./scenes/HealthChip";
import { interviewClock, useInterview } from "./scenes/useInterview";
import { GraphicsToolbar, drawGraphicsSafe, hasGraphics, useGraphicsSafe } from "./scenes/graphicsBridge";
import { useVar } from "./var/useVar";
import VarPanel from "./var/VarPanel";
import { useLed } from "./led/useLed";
import LedPanel from "./led/LedPanel";
import logoInline from "../../assets/elitlig-beyaz.png?inline";
import "./studio.css";

const PREFS_KEY = "studio.prefs.v1";
const MATCH_KEY = "studio.match";
const OLD_TABS = { mac: "yonetim", reji: "yonetim", olay: "yonetim", olaylar: "yonetim", tekrar: "tekrar", yayin: "yayin", ses: "ses", kaynak: "sahne" };
const DEFAULT_PREFS = {
  encoding: { resolution: "720p", fps: 30, bitrateKbps: 2500 },
  transition: "fade",
  transitionMs: {},
  studioMode: true,
  workspace: "studio",
  replayRate: 1,
  replayAudio: false,
  previewGraphics: false,
  tab: "yonetim",
  replayView: "tekrar",
  dockH: 300,
  angles: { program: true, all: true, sources: [] },
  audio: { mic: { deviceId: null, muted: false, volume: 100, noiseSuppression: false }, inputs: [] },
  localRec: { enabled: false, dir: null },
  var: null,
};
const readPrefs = () => {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) || "null");
    if (!p) return DEFAULT_PREFS;
    return {
      ...DEFAULT_PREFS,
      ...p,
      encoding: normalizeEncoding(p.encoding, p.encoding ? null : p.quality),
      tab: OLD_TABS[p.tab] || p.tab || DEFAULT_PREFS.tab,
      replayRate: Number(p.replayRate) || (p.slowMo ? 0.5 : 1),
      transition: TRANSITION_KINDS.some((t) => t.key === p.transition) ? p.transition : "fade",
      angles: { ...DEFAULT_PREFS.angles, ...(p.angles || {}) },
      localRec: { ...DEFAULT_PREFS.localRec, ...(p.localRec || {}) },
      audio: { mic: { ...DEFAULT_PREFS.audio.mic, ...(p.audio?.mic || {}) }, inputs: Array.isArray(p.audio?.inputs) ? p.audio.inputs : [] },
    };
  } catch { return DEFAULT_PREFS; }
};
const store = (() => { try { return window.localStorage; } catch { return null; } })();

/** Durum hapı: kendi saniyelik saatiyle. */
function StatusPill({ state, since }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!since) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [since]);
  const pill = statusPill(state, since, now);
  return <span className={`st-pill is-${pill.tone}`}><i />{pill.label}</span>;
}

/** Röportaj düğmesi: kendi saniyelik saatiyle. */
function InterviewButton({ iv, onAir }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!iv.recording) return undefined;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [iv.recording]);
  if (!iv.available) return null;
  if (iv.recording) return <button type="button" className="st-iv is-rec" onClick={iv.stop} title="Röportajı bitir: kayıt kapanır ve maç sayfasına yüklenir"><i /> RÖPORTAJ KAYDI {interviewClock(now - iv.startedAt)} <Icon name="stop" size={12} /></button>;
  if (iv.status === "stopping" || iv.status === "uploading") return <span className="st-iv is-busy"><span className="st-spin" /> {iv.status === "stopping" ? "Kapatılıyor…" : `Yükleniyor${iv.progress != null ? ` %${iv.progress}` : "…"}`}</span>;
  if (iv.status === "error" && iv.file) return <button type="button" className="st-iv is-err" onClick={iv.retry} title={iv.error}><Icon name="refresh" size={12} /> Röportajı yeniden yükle</button>;
  return <button type="button" className="st-iv" onClick={() => iv.start()} disabled={!onAir || iv.status === "starting"} title={onAir ? "Röportajı başlat: program kaydedilir, röportaj bandı yayına girer" : "Röportaj kaydı için yayın ya da prova açık olmalı"}><Icon name="mic" size={13} /> Röportajı başlat</button>;
}

function HelpModal({ onClose }) {
  return (
    <Modal title="Klavye kısayolları" onClose={onClose} width={520} className="st-modal">
      <dl className="st-keys">{SHORTCUTS.map(([k, v]) => <React.Fragment key={k}><dt><Kbd>{k}</Kbd></dt><dd>{v}</dd></React.Fragment>)}</dl>
    </Modal>
  );
}

export default function Studio({ auth }) {
  const toast = useToast();
  const confirm = useConfirm();
  const ask = useCallback((opts) => (confirm ? confirm(opts) : Promise.resolve(window.confirm(opts.message))), [confirm]);

  /* ───────── yapılandırma ───────── */
  const [config, setConfig] = useState(() => loadScenesConfig(store));
  const configRef = useRef(config);
  configRef.current = config;
  useEffect(() => { const t = setTimeout(() => saveScenesConfig(store, config), 300); return () => clearTimeout(t); }, [config]);

  const [prefs, setPrefs] = useState(readPrefs);
  const setPref = useCallback((key, value) => setPrefs((p) => ({ ...p, [key]: typeof value === "function" ? value(p[key]) : value })), []);
  useEffect(() => { try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* yoksay */ } }, [prefs]);
  const preset = useMemo(() => encodingPreset(prefs.encoding), [prefs.encoding]);

  /* ───────── maç (yalnız Maç yönetimi'nden seçilir) ───────── */
  const [matchId, setMatchId] = useState(() => { try { return Number(localStorage.getItem(MATCH_KEY)) || null; } catch { return null; } });
  useEffect(() => { try { if (matchId) localStorage.setItem(MATCH_KEY, String(matchId)); else localStorage.removeItem(MATCH_KEY); } catch { /* yoksay */ } }, [matchId]);
  const live = useLiveMatch(matchId, Number(auth?.user?.id) || null);

  /* ───────── yayın grafikleri (grafik modülü) ───────── */
  const g = useGraphicsSafe({ matchId, live });
  const gRef = useRef(g);
  gRef.current = g;
  const branding = g?.branding || DEFAULT_BRANDING;
  const brandingRef = useRef(branding);
  brandingRef.current = branding;

  /* ───────── tekrarlar (kaynaklardan önce: "Tekrar" kaynağı son tekrarı oynatır) ───────── */
  const replays = useReplays(matchId);
  const latest = replays.latest;
  const replayUrlOf = useCallback((source) => {
    if (!latest) return null;
    const a = latest.angles?.find((x) => x.angle === (source.angle || PROGRAM_ANGLE) && x.url) || latest.angles?.find((x) => x.url);
    return a?.url || null;
  }, [latest]);

  /* ───────── kaynaklar, ses, karıştırıcı ───────── */
  const onResolve = useCallback((id, patch) => setConfig((c) => updateSource(c, id, patch)), []);
  const src = useStudioSources(config.sources, { onResolve, replayUrlOf });
  const replayEls = useMemo(() => [0, 1].map(() => {
    const v = document.createElement("video");
    v.playsInline = true;
    v.preload = "auto";
    v.muted = true; // karıştırıcıya bağlanınca açılır; ses yalnız "Tekrarın sesi" açıksa yayına gider
    return v;
  }), []);
  const mixer = useAudioMixer({ mic: prefs.audio.mic, inputs: prefs.audio.inputs, replayEls, replayAudio: prefs.replayAudio });
  const setAudio = useCallback((fn) => setPref("audio", fn), [setPref]);
  const muted = prefs.audio.mic.muted;
  const toggleMic = useCallback(() => setAudio((a) => ({ ...a, mic: { ...a.mic, muted: !a.mic.muted } })), [setAudio]);

  const bugRef = useRef(null);
  const imagesRef = useRef({});
  const replayRef = useRef({ active: false });
  const varRef = useRef({ active: false });
  const overrideRef = useRef(null);
  const overlayRef = useRef(null);
  const previewGraphicsRef = useRef(prefs.previewGraphics);
  previewGraphicsRef.current = prefs.previewGraphics;
  const defaultLogo = useCanvasImage(logoInline, { inline: true });
  const brandLogoImg = useCanvasImage(g?.branding?.logoUrl || null);
  const homeLogo = useCanvasImage(live.logos.home);
  const awayLogo = useCanvasImage(live.logos.away);
  const brandLogo = brandLogoImg || defaultLogo;
  imagesRef.current = { logo: brandLogo, home: homeLogo, away: awayLogo, branding };
  const brandRef = useRef(null);
  brandRef.current = { logo: brandLogo, branding };
  const timer = live.timer;
  const matchClockRef = useRef(null);
  matchClockRef.current = () => (timer ? timerNowMs(timer, Date.now()) : null);
  const scorers = useMemo(() => scorerLines(live.events, { homeTeamId: live.homeTeamId, awayTeamId: live.awayTeamId, nameOf: live.nameOf }), [live.events, live.homeTeamId, live.awayTeamId, live.nameOf]);
  bugRef.current = live.match ? {
    homeName: live.homeName, awayName: live.awayName, homeScore: live.score.home, awayScore: live.score.away,
    clockAt: (now) => timerNowMs(timer, now), period: live.period, finished: live.phase === "finished", event: live.bannerEvent, scorers,
  } : null;
  // Yayın grafikleri: grafik modülü varsa onun çizimi, yoksa yedek skorbord.
  overlayRef.current = (ctx, info) => {
    const gr = gRef.current;
    if (drawGraphicsSafe && gr) {
      // Her karede güncel anlık görüntü (saat, skor): snapshotRef yoksa son render'ınki.
      const base = gr.snapshotRef?.current || gr.snapshot;
      const snap = info.event && base && typeof base === "object" ? { ...base, replayEvent: info.event } : base;
      drawGraphicsSafe(ctx, { width: info.width, height: info.height, now: Date.now() }, snap);
      return;
    }
    const bug = bugRef.current;
    if (!bug) return;
    drawBug(ctx, bugVariantOf(configRef.current), { ...bug, clockMs: bug.clockAt(Date.now()), event: info.event || bug.event }, info.width, info.height, imagesRef.current);
  };

  const comp = useCompositor({ width: preset.width, height: preset.height, fps: preset.fps, configRef, runtimeRef: src.runtimeRef, overlayRef, replayRef, varRef, brandRef, overrideRef, previewGraphicsRef, matchClockRef });

  /* ───────── kodlayıcı ve YouTube ───────── */
  const onEngineError = useCallback((m) => toast(m, { tone: "error", timeout: 6000 }), [toast]);
  const engine = useEngine({ getVideoTrack: comp.getVideoTrack, getAudioTrack: mixer.audioTrack, onError: onEngineError });
  const yt = useYoutube(matchId, { encodingLive: engine.mode === "live" && engine.active });
  const hl = useHighlights(matchId);
  const [busy, setBusy] = useState(false);
  const [startedVia, setStartedVia] = useState(null); // "youtube" | "manual" | "rehearsal"

  const begin = useCallback(async (url) => {
    mixer.resume();
    await engine.start({ url, preset, localRecord: prefs.localRec, matchId, matchName: live.match ? `${live.homeName} – ${live.awayName}` : null });
  }, [engine, mixer, preset, prefs.localRec, matchId, live.match, live.homeName, live.awayName]);

  const startYoutube = async () => {
    if (!matchId) { toast("Önce Maç yönetimi sekmesinden maç aç.", { tone: "warn" }); return; }
    setBusy(true);
    try {
      const open = reusableStream(yt.stream) ? yt.stream : await yt.open();
      const url = ingestUrl(open);
      if (!url) throw new Error("YouTube yayın adresi alınamadı.");
      await begin(url);
      setStartedVia("youtube");
      toast("Görüntü YouTube'a gönderiliyor. Yayın birkaç saniye içinde canlıya geçer.", { tone: "success", timeout: 5000 });
      setTimeout(() => live.refresh?.(), 8000); // match_video sunucuda yazılınca onay çipi görünür
    } catch (e) {
      toast(errorText(e, "YouTube yayını açılamadı."), { tone: "error", timeout: 6000 });
    } finally { setBusy(false); }
  };
  const startManual = async (url) => {
    setBusy(true);
    try { await begin(url); setStartedVia("manual"); toast("Görüntü RTMP sunucusuna gönderiliyor. İzleme linkini maç sayfasına ekleyebilirsin (Yayın sekmesi).", { tone: "success", timeout: 6000 }); } catch (e) { toast(errorText(e, "Yayın başlatılamadı."), { tone: "error", timeout: 6000 }); } finally { setBusy(false); }
  };
  const startRehearsal = async () => {
    setBusy(true);
    try { await begin(null); setStartedVia("rehearsal"); toast("Prova kaydı başladı: görüntü hiçbir yere gönderilmiyor.", { tone: "info" }); } catch (e) { toast(errorText(e, "Prova başlatılamadı."), { tone: "error", timeout: 6000 }); } finally { setBusy(false); }
  };
  const stopEncoder = async ({ askFirst = true } = {}) => {
    if (askFirst && engine.mode === "live" && !(await ask({ title: "Görüntüyü durdur", message: "Yayına görüntü gitmesi kesilir. YouTube yayını açık kalır; yeniden başlatıp devam edebilirsin.", confirmLabel: "Durdur", danger: true }))) return;
    setBusy(true);
    try { await engine.stop(); } finally { setBusy(false); }
  };
  const endYoutube = async () => {
    if (!(await ask({ title: "Yayını bitir", message: "Görüntü kesilir ve YouTube yayını kapatılır. Kayıt kanalda kalır.", confirmLabel: "Bitir", danger: true }))) return;
    setBusy(true);
    try {
      await engine.stop();
      if (yt.stream?.broadcast_id) await yt.end();
      toast("Yayın bitti.", { tone: "success" });
    } catch (e) { toast(errorText(e, "Yayın kapatılamadı."), { tone: "error" }); } finally { setBusy(false); }
  };
  const topStart = () => {
    if (engine.active) { stopEncoder(); return; }
    if (yt.config.configured && matchId) { startYoutube(); return; }
    setPref("tab", "yayin");
    toast(yt.config.configured ? "Önce Maç yönetimi sekmesinden maç aç." : "YouTube kanalı bağlı değil: Yayın sekmesinden kanalı bağla, RTMP anahtarı gir ya da prova başlat.", { tone: "warn", timeout: 5000 });
  };

  const activeRef = useRef(engine.active);
  activeRef.current = engine.active;
  useEffect(() => setLeaveGuard(async () => {
    if (!activeRef.current) return true;
    return ask({ title: "Yayın sürüyor", message: "Stüdyodan çıkarsan görüntü kesilir. YouTube yayını açık kalır; geri gelip devam edebilirsin.", confirmLabel: "Görüntüyü kes ve çık", danger: true });
  }), [ask]);

  /* ───────── açılar ve tekrarlar ───────── */
  const recordAngles = useMemo(() => {
    const list = anglesToRecord(prefs.angles, config.sources);
    return list.length ? list : [PROGRAM_ANGLE];
  }, [prefs.angles, config.sources]);
  const angleRec = useAngleRecorders({
    active: engine.active,
    sourceIds: recordAngles.filter((a) => a !== PROGRAM_ANGLE),
    sources: config.sources,
    runtimeRef: src.runtimeRef,
    version: src.version,
    onError: onEngineError,
  });
  const liveAngles = angleRec.available ? recordAngles : recordAngles.filter((a) => a === PROGRAM_ANGLE);
  const bannerOf = useCallback((item) => replayBanner(item.replay, metaFor(item.replay, replays.meta)), [replays.meta]);
  const onReplayError = useCallback((m) => toast(m, { tone: "error", timeout: 5000 }), [toast]);
  const player = useReplayPlayer({ els: replayEls, replayRef, playStinger: comp.playStinger, bannerOf, rate: prefs.replayRate, onError: onReplayError, onStart: mixer.resume });
  const setReplayRate = useCallback((v) => setPref("replayRate", Math.min(1, Math.max(0.25, Number(v) || 1))), [setPref]);

  const captureMoment = useStable(() => {
    if (!engine.active) { toast("Tekrar için yayın ya da prova açık olmalı (Yayın sekmesi).", { tone: "warn", timeout: 4000 }); return; }
    replays.capture({ kind: "moment", angles: liveAngles, label: "Önemli an", meta: { minute: live.match ? live.minute : null, period: live.period } });
    toast("Önemli an kaydedildi (son 10 sn).", { tone: "success", timeout: 2500 });
  });
  const playLatest = useStable(() => {
    const r = replays.latest;
    if (!r) { toast("Henüz tekrar yok: GOL'e bas ya da ÖNEMLİ AN (B) ile kaydet.", { tone: "warn" }); return; }
    player.play(buildReplayQueue([r], { [r.id]: defaultAngles(r, liveAngles) }));
  });

  /* ───────── VAR ───────── */
  const onVarError = useCallback((m) => toast(m, { tone: "warn", timeout: 4000 }), [toast]);
  const setVarPrefs = useCallback((fn) => setPref("var", fn), [setPref]);
  const vr = useVar({ varRef, settings: prefs.var, onSettings: setVarPrefs, replays: replays.replays, playStinger: comp.playStinger, onError: onVarError });
  const showMicWarning = micWarning({ varActive: vr.active, micMuted: muted });

  /* ───────── röportaj, LED ───────── */
  const iv = useInterview({ matchId, graphics: g, encoding: engine.active, toast });
  const programIdRef = useRef(config.programSceneId);
  programIdRef.current = config.programSceneId;
  const graphicsSnapRef = useRef(null);
  graphicsSnapRef.current = g?.snapshot ?? null;
  const led = useLed({ configRef, programIdRef, graphicsRef: graphicsSnapRef, brandingRef, matchId, ledMode: g?.ledMode });

  /* ───────── program / önizleme ───────── */
  const ws = workspaceOf(prefs.workspace);
  const studioMode = previewVisible(ws, prefs.studioMode);
  const tKind = transitionKind(prefs.transition);
  const tMs = transitionMs(tKind.key, prefs.transitionMs);

  const restartVideosIn = useCallback((sceneId) => {
    const sc = resolveScene(configRef.current, sceneId);
    for (const l of sc?.layers || []) {
      const s = configRef.current.sources.find((x) => x.id === l.sourceId);
      if (s?.kind !== "video" || s.restartOnShow === false) continue;
      const el = src.runtimeRef.current.get(s.id)?.el;
      if (el instanceof HTMLVideoElement) { try { el.currentTime = 0; el.play().catch(() => {}); } catch { /* yoksay */ } }
    }
  }, [src.runtimeRef]);

  const toProgram = useStable((id) => {
    const cfg = configRef.current;
    const target = id || cfg.previewSceneId;
    if (!target) return;
    const swap = (c) => ({ ...c, programSceneId: target, previewSceneId: studioMode ? (target === c.previewSceneId && !id ? c.programSceneId : c.previewSceneId) : target });
    if (vr.active) { vr.exit(); restartVideosIn(target); setConfig(swap); return; }
    if (player.playing) { restartVideosIn(target); setConfig(swap); player.stop(true); return; }
    if (target === cfg.programSceneId) return;
    restartVideosIn(target);
    comp.startTransition(cfg.programSceneId, target, tKind.key, tMs);
    setConfig(swap);
  });
  const toPreview = useStable((id) => {
    if (!studioMode) { toProgram(id); return; }
    setConfig((c) => ({ ...c, previewSceneId: id }));
  });
  const editId = studioMode ? config.previewSceneId : config.programSceneId;
  const editScene = resolveScene(config, editId);
  const programScene = resolveScene(config, config.programSceneId);
  const tiles = useMemo(() => multiviewTiles(config), [config]);
  const registerTile = useTileRenderer(configRef, src.runtimeRef);

  /* ───────── sahne / katman / kaynak işlemleri (kimliği sabit) ───────── */
  const [selectedLayerId, setSelectedLayerId] = useState(null);
  const selectedId = editScene?.layers.some((l) => l.id === selectedLayerId) ? selectedLayerId : null;
  const [dialog, setDialog] = useState(null); // { initial, toScene }
  const closeDialog = useCallback(() => setDialog(null), []);

  const saveSource = useStable((draft) => {
    const toScene = dialog?.toScene || null;
    setDialog(null);
    const { angleOptions, ...clean } = draft;
    void angleOptions;
    if (clean.kind === "audio") {
      setAudio((a) => ({ ...a, inputs: [...a.inputs, { id: `ain_${Date.now().toString(36)}`, deviceId: clean.deviceId || "", name: clean.name || "Ses girişi", volume: 100, muted: false }] }));
      setPref("tab", "ses");
      toast("Ses girişi Ses sekmesine eklendi.", { tone: "success" });
      return;
    }
    if (clean.id) {
      setConfig((c) => updateSource(c, clean.id, { ...clean, nonce: clean.kind === "screen" || clean.kind === "window" ? Date.now() : clean.nonce }));
      return;
    }
    setConfig((c) => {
      if (toScene) {
        const { config: c1, source } = addSource(c, clean);
        const { config: c2, layer } = addLayer(c1, toScene, source.id);
        setSelectedLayerId(layer.id);
        return c2;
      }
      const { config: next, scene } = addSourceWithScene(c, clean);
      return studioMode ? { ...next, previewSceneId: scene.id } : next;
    });
  });
  const deleteSource = useStable(async (s) => {
    const used = sourceUsage(configRef.current, s.id);
    if (!(await ask({ title: "Kaynağı sil", message: used.length ? `“${s.name}” kitaplıktan silinir ve şu sahnelerden çıkarılır: ${used.join(", ")}.` : `“${s.name}” silinsin mi?`, confirmLabel: "Sil", danger: true }))) return;
    if (s.url && String(s.url).startsWith("blob:")) URL.revokeObjectURL(s.url);
    setConfig((c) => removeSource(c, s.id));
  });
  const deleteScene = useStable(async (sc) => {
    if (configRef.current.scenes.length <= 1) return;
    if (!(await ask({ title: "Sahneyi sil", message: `“${sc.name}” silinsin mi? Kaynaklar kitaplıkta kalır.`, confirmLabel: "Sil", danger: true }))) return;
    setConfig((c) => removeScene(c, sc.id));
  });
  const recordable = useMemo(() => recordableSources(config.sources).map((s) => ({ id: s.id, name: s.name })), [config.sources]);
  const newSource = useStable((opts) => setDialog({ initial: { angleOptions: recordable }, toScene: opts?.toScene || null }));
  const editSource = useStable((s) => setDialog({ initial: { ...s, angleOptions: recordable } }));
  const addSceneNow = useStable((name) => setConfig((c) => {
    const { config: next, scene } = addScene(c, name);
    return studioMode ? { ...next, previewSceneId: scene.id } : next;
  }));

  const sceneActions = useMemo(() => ({
    onPreview: toPreview,
    onProgram: toProgram,
    onAddScene: addSceneNow,
    onRenameScene: (id, name) => setConfig((c) => renameScene(c, id, name)),
    onDuplicateScene: (id) => setConfig((c) => { const { config: next, scene } = duplicateScene(c, id); return scene && studioMode ? { ...next, previewSceneId: scene.id } : next; }),
    onRemoveScene: deleteScene,
    onMoveScene: (id, to) => setConfig((c) => moveSceneTo(c, id, to)),
    onSelectLayer: setSelectedLayerId,
    onUpdateLayer: (sceneId, layerId, patch) => setConfig((c) => updateLayer(c, sceneId, layerId, patch)),
    onRemoveLayer: (sceneId, layerId) => setConfig((c) => removeLayer(c, sceneId, layerId)),
    onMoveLayer: (sceneId, layerId, to) => setConfig((c) => moveLayerTo(c, sceneId, layerId, to)),
    onAddLayer: (sceneId, sourceId) => setConfig((c) => { const { config: next, layer } = addLayer(c, sceneId, sourceId); setSelectedLayerId(layer.id); return next; }),
    onNewSource: newSource,
    onEditSource: editSource,
    onSceneFromSource: (sourceId) => setConfig((c) => {
      const s = c.sources.find((x) => x.id === sourceId);
      if (!s) return c;
      const { config: next, scene } = addScene(c, s.name, [normalizeLayer(makeLayer(s.id, { fit: defaultFit(s.kind) }), s.kind)]);
      return { ...next, previewSceneId: scene.id };
    }),
  }), [addSceneNow, deleteScene, editSource, newSource, studioMode, toPreview, toProgram]);

  const libActions = useMemo(() => ({
    onNewSource: () => newSource(),
    onEditSource: editSource,
    onRemoveSource: deleteSource,
    onReacquire: src.reacquire,
    onRequestAccess: src.requestAccess,
    onPreviewSource: (s) => toPreview(sourceSceneId(s.id)),
    onAddToScene: (s) => {
      const id = configRef.current && (studioMode ? configRef.current.previewSceneId : configRef.current.programSceneId);
      if (!id || isSourceSceneId(id)) return;
      sceneActions.onAddLayer(id, s.id);
    },
  }), [deleteSource, editSource, newSource, sceneActions, src.reacquire, src.requestAccess, studioMode, toPreview]);

  const commitLayer = useCallback((layerId, patch) => { if (editScene && !isSourceSceneId(editScene.id)) setConfig((c) => updateLayer(c, editScene.id, layerId, patch)); }, [editScene]);
  const removeSelLayer = useCallback((layerId) => { if (editScene && !isSourceSceneId(editScene.id)) setConfig((c) => removeLayer(c, editScene.id, layerId)); }, [editScene]);
  const sourceName = useCallback((id) => configRef.current.sources.find((s) => s.id === id)?.name || "?", []);
  const onToggleShow = useCallback((id) => setConfig((c) => toggleMultiview(c, id)), []);
  const onResetShow = useCallback(() => setConfig((c) => resetMultiview(c)), []);
  const tileMenu = useCallback((t) => {
    const items = [
      { label: "Önizlemeye al", icon: "eye", onClick: () => toPreview(t.id) },
      { label: "Yayına ver", icon: "play", onClick: () => toProgram(t.id) },
      "-",
      { label: "Şeritten gizle", icon: "x", onClick: () => onToggleShow(t.id) },
    ];
    if (t.kind === "source") {
      const s = configRef.current.sources.find((x) => x.id === t.sourceId);
      if (s) items.push({ label: "Kaynak ayarları…", icon: "sliders", onClick: () => editSource(s) }, { label: "Yeniden bağlan", icon: "refresh", onClick: () => src.reacquire(s) });
    }
    return items;
  }, [editSource, onToggleShow, src, toPreview, toProgram]);
  const setVariant = useCallback((variant) => setConfig((c) => ({ ...c, overlay: { ...c.overlay, variant } })), []);

  /* ───────── olay girişi (G sonra H / A kısayolu) ───────── */
  const [picker, setPicker] = useState(null);
  const [saving, setSaving] = useState(false);
  const askEvent = useStable((side, code, title) => {
    if (live.status !== "canli") { toast("Maç canlı değil: önce Maç yönetimi › Reji'den maçı başlat.", { tone: "warn", timeout: 4500 }); return; }
    const clipKey = isGoalCode(code) && engine.active ? replays.capture({ kind: "goal", angles: liveAngles, meta: { side, code, minute: live.minute, period: live.period } }) : null;
    setPicker({ side, code, title, clipKey });
  });
  // Maç yönetimi › Reji'den girilen goller: GOL'e dokunulduğu AN tekrar kaydı başlar,
  // olay kaydedilince klip olaya ve golcüye bağlanır (yüklenir). Golcü seçimi
  // iptal edilirse 3 dk sonra klip yalnız bu bilgisayarda kalır.
  const dockGoalClipsRef = useRef([]);
  const onDockGoalTap = useStable(({ side, code } = {}) => {
    if (!engine.active || !isGoalCode(code)) return;
    const key = replays.capture({ kind: "goal", angles: liveAngles, meta: { side, code, minute: live.minute, period: live.period } });
    if (!key) return;
    const entry = { key, side, timer: null };
    entry.timer = setTimeout(() => {
      dockGoalClipsRef.current = dockGoalClipsRef.current.filter((x) => x !== entry);
      replays.attach(key, { eventId: null });
    }, 180_000);
    dockGoalClipsRef.current.push(entry);
  });
  const onDockEventCreated = useStable(({ event, playerName, side, code } = {}) => {
    if (!isGoalCode(code || event?.olay_kodu)) return;
    const list = dockGoalClipsRef.current;
    const i = list.findIndex((x) => !side || x.side === side);
    if (i < 0) return;
    const [entry] = list.splice(i, 1);
    clearTimeout(entry.timer);
    replays.attach(entry.key, { eventId: Number(event?.id) || null, scorer: playerName || live.nameOf(event?.oyuncu_id), side, code: code || event?.olay_kodu });
  });
  useEffect(() => () => dockGoalClipsRef.current.forEach((x) => clearTimeout(x.timer)), []);
  const askGoal = useStable((side) => askEvent(side, "GOAL_RIGHT_FOOT", `${side === "home" ? live.homeName : live.awayName} — golü atan`));
  const record = async (playerId) => {
    if (!picker) return;
    setSaving(true);
    try {
      const created = await live.addEvent({ side: picker.side, code: picker.code, playerId });
      if (picker.clipKey) replays.attach(picker.clipKey, { eventId: Number(created?.id) || null, scorer: live.nameOf(playerId), side: picker.side, code: picker.code });
      toast(`${eventLabel(picker.code)} kaydedildi (${live.minute}').`, { tone: "success" });
      setPicker(null);
    } catch (e) {
      toast(errorText(e, "Olay kaydedilemedi."), { tone: "error", timeout: 5000 });
    } finally { setSaving(false); }
  };
  const cancelPicker = useStable(() => {
    if (picker?.clipKey) replays.attach(picker.clipKey, { eventId: null });
    setPicker(null);
  });
  const removeReplay = useStable(async (r) => {
    if (!(await ask({ title: "Tekrarı sil", message: "Bu tekrar ve tüm açılarının dosyaları bu bilgisayardan silinsin mi? Profile yüklenen gol videosu kalır.", confirmLabel: "Sil", danger: true }))) return;
    replays.remove(r.id);
  });

  /* ───────── kısayollar ───────── */
  const [goalArmed, setGoalArmed] = useState(false);
  const [help, setHelp] = useState(false);
  const keyRef = useRef(null);
  keyRef.current = (e) => {
    if (document.querySelector(".modal-backdrop")) return;
    if (e.target?.closest?.(".st-edit") && /^Arrow|^Delete$|^Backspace$/.test(e.key)) return;
    const act = keyAction(e, { pendingGoal: goalArmed });
    if (!act) return;
    if (act.type === "goalCancel") { setGoalArmed(false); return; }
    e.preventDefault();
    if (act.type === "mic") toggleMic();
    else if (act.type === "replay") { if (player.playing) player.stop(true); else playLatest(); }
    else if (act.type === "moment") captureMoment();
    else if (act.type === "scene") { const id = sceneAtHotkey(configRef.current, act.index); if (id) toPreview(id); }
    else if (act.type === "transition") toProgram();
    else if (act.type === "goalArm") setGoalArmed(true);
    else if (act.type === "goal") { setGoalArmed(false); askGoal(act.side); }
    else if (act.type === "var") vr.toggle();
    else if (act.type === "help") setHelp((v) => !v);
  };
  useEffect(() => {
    const onKey = (e) => keyRef.current?.(e);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    if (!goalArmed) return undefined;
    const t = setTimeout(() => setGoalArmed(false), 2500);
    return () => clearTimeout(t);
  }, [goalArmed]);

  /* ───────── çizim ───────── */
  const st = engine.status;
  const tab = prefs.tab;
  const onAir = engine.active;
  const variant = bugVariantOf(config);
  const setTab = useCallback((t) => setPref("tab", t), [setPref]);
  const setDockH = useCallback((h) => setPref("dockH", clampDock(h)), [setPref]);
  const setAnglePref = useCallback((v) => setPref("angles", v), [setPref]);
  const setEncoding = useCallback((v) => setPref("encoding", normalizeEncoding(v)), [setPref]);
  const setLocalRec = useCallback((v) => setPref("localRec", v), [setPref]);
  const matchName = live.match ? `${live.homeName} – ${live.awayName}` : "";

  const TABS = [
    { key: "yonetim", label: "Maç yönetimi", icon: "board" },
    { key: "sahne", label: "Sahneler & Kaynaklar", icon: "layers", count: config.scenes.length || null },
    { key: "tekrar", label: "Tekrar & Özet", icon: "repeat", count: replays.replays.length || null },
    { key: "var", label: "VAR", icon: "target", count: vr.active ? "●" : null },
    { key: "yayin", label: "Yayın", icon: "broadcast" },
    { key: "ses", label: "Ses", icon: "mic" },
    { key: "led", label: "LED ekran", icon: "overview", count: led.status.open ? "●" : null },
  ];

  const editable = editScene && !isSourceSceneId(editScene.id);
  const overlay = editable ? (
    <SceneEditOverlay scene={editScene} selectedId={selectedId} onSelect={setSelectedLayerId} onCommit={commitLayer} onRemove={removeSelLayer}
      overrideRef={overrideRef} sourceName={sourceName} outW={preset.width} outH={preset.height} />
  ) : null;

  const previewMonitor = (
    <figure className="st-monitor">
      <figcaption>
        <span className="st-tag">ÖNİZLEME</span>
        <span className="st-monitor__name">{editScene?.name || "—"}</span>
        {editable && <small className="st-monitor__hint">tıkla: seç · sürükle: taşı · köşe: boyutla</small>}
        <span className="st-top__spacer" />
        <label className="toggle st-monitor__opt" title="Yayın grafiklerini önizlemede soluk göster"><input type="checkbox" checked={prefs.previewGraphics} onChange={(e) => setPref("previewGraphics", e.target.checked)} /> Grafikler</label>
      </figcaption>
      <Monitor canvas={comp.preview} className="st-monitor__screen">{overlay}</Monitor>
    </figure>
  );
  const programMonitor = (
    <figure className={`st-monitor is-program ${st.state === "live" ? "is-live" : ""} ${showMicWarning ? "is-micwarn" : ""}`}>
      <figcaption>
        <span className={`st-tag ${onAir ? "is-live" : "is-pgm"}`}>PROGRAM</span>
        <span className="st-monitor__name">{vr.active ? "VAR kontrolü" : player.playing ? "Tekrar" : programScene?.name || "—"}</span>
        {player.playing && <span className="st-tag is-live">TEKRAR {player.index + 1}/{player.total} · {String(prefs.replayRate).replace(".", ",")}×</span>}
        {vr.active && <button type="button" className="st-tag is-var" onClick={vr.exit} title="VAR'dan çık (V)">VAR · ÇIK</button>}
        {iv.recording && <span className="st-tag is-live">RÖPORTAJ</span>}
      </figcaption>
      <Monitor canvas={comp.program} className="st-monitor__screen">{!studioMode ? overlay : null}</Monitor>
      {showMicWarning && <div className="st-micwarn" role="alert"><Icon name="mic" size={22} /> MİKROFON AÇIK <button type="button" onClick={toggleMic}>Kapat (M)</button></div>}
      {!live.match && (
        <div className="st-monitor__note"><Icon name="info" size={13} /> {matchId ? (live.error ? live.error.message || "Maç alınamadı." : "Maç yükleniyor…") : "Skorbord ve reji için Maç yönetimi sekmesinden maç aç."}</div>
      )}
    </figure>
  );
  const transitionCol = (
    <div className="st-transition">
      {studioMode && (
        <button type="button" className="btn btn--primary st-transition__go" onClick={() => toProgram()} disabled={config.previewSceneId === config.programSceneId && !player.playing && !vr.active} title="Önizlemeyi yayına geçir; program önizlemeye düşer (Boşluk / Enter)">
          <Icon name="chevronRight" size={16} strokeWidth={2.4} /> Geçiş
        </button>
      )}
      <select className="select-sm" value={tKind.key} onChange={(e) => setPref("transition", e.target.value)} aria-label="Geçiş türü" title="Geçiş türü">
        {TRANSITION_KINDS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
      </select>
      {tKind.key !== "cut" && (
        <label className="st-transition__ms" title="Geçiş süresi (ms)">
          <input type="number" min={tKind.min} max={tKind.max} step={50} value={tMs} onChange={(e) => setPref("transitionMs", (m) => ({ ...(m || {}), [tKind.key]: Number(e.target.value) }))} />
          <span>ms</span>
        </label>
      )}
      {studioMode && <small className="muted"><Kbd>Boşluk</Kbd></small>}
      {ws.monitors !== "single" && <label className="toggle st-transition__mode" title="Kapalıyken kutuya tek tık doğrudan yayına verir"><input type="checkbox" checked={prefs.studioMode} onChange={(e) => setPref("studioMode", e.target.checked)} /> Önizleme</label>}
    </div>
  );

  let stage;
  if (ws.monitors === "grid") {
    const cells = gridCells(ws, tiles, { studioMode });
    stage = (
      <main className="st-stage is-grid">
        <div className={`st-grid is-${ws.grid}`}>
          {cells.map((c) => (c.type === "preview" ? <div key={c.key} className="st-grid__cell is-preview">{previewMonitor}</div>
            : c.type === "tile" ? (
              <div key={c.key} className="st-grid__cell">
                <Tile tile={c.tile} register={registerTile} studioMode={studioMode} large={ws.grid === 2} onAir={c.tile.id === config.programSceneId && !player.playing && !vr.active}
                  inPreview={studioMode && c.tile.id === config.previewSceneId} bad={tileWarning(config, src.runtimeRef.current, c.tile)} onPreview={toPreview} onProgram={toProgram} menu={tileMenu(c.tile)} />
              </div>
            ) : <div key={c.key} className="st-grid__cell is-empty" />))}
        </div>
        {transitionCol}
        {programMonitor}
      </main>
    );
  } else {
    stage = (
      <main className={`st-stage ${ws.sidebar ? "has-side" : ""} ${studioMode ? "is-dual" : "is-single"}`}>
        {ws.sidebar && (
          <aside className="st-side">
            <ScenesList config={config} actions={sceneActions} compact />
            <LayersList config={config} scene={editScene} selectedId={selectedId} actions={sceneActions} compact />
          </aside>
        )}
        {studioMode && previewMonitor}
        {transitionCol}
        {programMonitor}
      </main>
    );
  }

  return (
    <div className={`studio ${showMicWarning ? "is-micwarn" : ""}`} onPointerDown={mixer.resume}>
      <header className="st-top">
        <div className="st-top__title"><Icon name="broadcast" size={17} strokeWidth={2.2} /><strong>Yayın Stüdyosu</strong></div>
        {live.match
          ? <button type="button" className="st-top__match" onClick={() => setTab("yonetim")} title={`${matchName} — Maç yönetimi`}><b>{live.score.home}–{live.score.away}</b><span>{matchName}</span>{live.match && <small>{live.minute}'</small>}</button>
          : <button type="button" className="st-top__match is-empty" onClick={() => setTab("yonetim")} title="Maç seçmek için Maç yönetimi">Maç seçilmedi</button>}
        <StatusPill state={st.state} since={engine.since} />
        <HealthChip status={st} getStats={comp.getStats} targetFps={preset.fps} encoding={onAir} />
        <span className="st-top__spacer" />
        <label className="st-top__field" title="Çalışma alanı düzeni (hatırlanır)">
          <Icon name="grid" size={13} />
          <select className="select-sm" value={ws.key} onChange={(e) => setPref("workspace", e.target.value)} aria-label="Çalışma alanı">
            {WORKSPACES.map((w) => <option key={w.key} value={w.key}>{w.label}</option>)}
          </select>
        </label>
        {GraphicsToolbar && g ? <GraphicsToolbar g={g} compact /> : (
          <label className="st-top__field" title="Yayına gömülen skorbord (grafik modülü yüklenmedi: yedek skorbord)">
            <span>Skorbord</span>
            <select className="select-sm" value={variant} onChange={(e) => setVariant(e.target.value)}>
              {SCOREBUG_VARIANTS.map((v) => <option key={v.key} value={v.key}>{v.label}</option>)}
            </select>
          </label>
        )}
        <InterviewButton iv={iv} onAir={onAir} />
        <button type="button" className={`st-var-top ${vr.active ? "is-on" : ""}`} onClick={vr.toggle} title={vr.active ? "VAR'dan çık, önceki programa dön (V)" : "VAR kontrolünü yayına al (V)"}>
          <Icon name="target" size={14} /> VAR <Kbd>V</Kbd>
        </button>
        <button type="button" className={`st-mic ${muted ? "is-off" : ""}`} onClick={toggleMic} title="Mikrofonu aç / kapat (M)">
          <Icon name={muted ? "micOff" : "mic"} size={16} />
          <span>{muted ? "SES KAPALI" : "SES AÇIK"}</span>
          <LevelMeter getAnalyser={() => mixer.micAnalyser(true)} muted={muted} compact />
        </button>
        <button type="button" className="st-moment-top" onClick={captureMoment} disabled={!onAir} title={onAir ? "Son 10 saniyeyi tekrar olarak kaydet (B)" : "Tekrar için yayın ya da prova açık olmalı"}>
          <Icon name="star" size={14} /> ÖNEMLİ AN <Kbd>B</Kbd>
        </button>
        {player.playing
          ? <button type="button" className="st-replay is-on" onClick={() => player.stop(true)} title="Canlıya dön (R)"><Icon name="stop" size={14} /> CANLIYA DÖN</button>
          : <button type="button" className="st-replay" onClick={playLatest} disabled={!replays.latest} title={replays.latest ? "Son tekrarı yayına ver (R)" : "Henüz tekrar yok"}><Icon name="repeat" size={14} /> TEKRAR <Kbd>R</Kbd></button>}
        <button type="button" className={`btn ${onAir ? "" : "btn--red"} st-golive`} disabled={busy} onClick={topStart}>
          <Icon name={onAir ? "stop" : "broadcast"} size={14} /> {onAir ? (engine.mode === "rehearsal" ? "Provayı bitir" : "Yayını durdur") : "Yayını başlat"}
        </button>
        <button type="button" className="icon-btn st-help" onClick={() => setHelp(true)} title="Klavye kısayolları (?)"><Icon name="help" size={16} /></button>
      </header>

      {stage}

      {ws.strip && (
        <Multiview tiles={tiles} config={config} runtimeRef={src.runtimeRef} register={registerTile} version={src.version} studioMode={studioMode}
          previewId={config.previewSceneId} programId={player.playing || vr.active ? null : config.programSceneId}
          onPreview={toPreview} onProgram={toProgram} onAddScene={() => addSceneNow()} onAddSource={() => newSource()} onToggleShow={onToggleShow} onResetShow={onResetShow} tileMenu={tileMenu} />
      )}

      <Dock tabs={TABS} tab={tab} onTab={setTab} height={prefs.dockH} onHeight={setDockH}>
        {tab === "yonetim" && <ManageDock matchId={matchId} match={live.match} live={live} onOpenMatch={setMatchId} graphics={hasGraphics ? g : undefined} onGoalTap={onDockGoalTap} onEventCreated={onDockEventCreated} />}
        {tab === "sahne" && (
          <ScenesPanel config={config} editScene={editScene} selectedLayerId={selectedId} runtimeRef={src.runtimeRef} version={src.version}
            outW={preset.width} outH={preset.height} actions={sceneActions} libActions={libActions} />
        )}
        {tab === "tekrar" && (
          <div className="st-tekrar">
            <div className="st-seg st-seg--tabs">
              <button type="button" className={prefs.replayView !== "ozet" ? "is-on" : ""} onClick={() => setPref("replayView", "tekrar")}><Icon name="repeat" size={12} /> Tekrarlar</button>
              <button type="button" className={prefs.replayView === "ozet" ? "is-on" : ""} onClick={() => setPref("replayView", "ozet")}><Icon name="sparkles" size={12} /> Özet çıkar</button>
            </div>
            {prefs.replayView === "ozet"
              ? <HighlightsPanel replays={replays.replays} meta={replays.meta} sources={config.sources} matchId={matchId} live={live} recordAngles={liveAngles} hl={hl} imagesRef={imagesRef} ask={ask} toast={toast} />
              : <ReplayPanel replays={replays.replays} pending={replays.pending} meta={replays.meta} sources={config.sources} matchId={matchId}
                  anglePref={prefs.angles} onAnglePref={setAnglePref} angleStatus={angleRec.status} angleAvailable={angleRec.available} multiAngle={replays.multiAngle} encoding={onAir}
                  player={player} rate={prefs.replayRate} onRate={setReplayRate} replayAudio={prefs.replayAudio} onReplayAudio={(v) => setPref("replayAudio", v)}
                  onMoment={captureMoment} onPlay={player.play} onStop={() => player.stop(true)} onSkip={player.skip} onUpdate={replays.update} onRemove={removeReplay}
                  onRetry={replays.retry} onDismiss={replays.dismissPending} uploadOf={replays.uploadOf} recordAngles={liveAngles} />}
          </div>
        )}
        {tab === "var" && <VarPanel vr={vr} sources={config.sources} replays={replays.replays} meta={replays.meta} micMuted={muted} onToggleMic={toggleMic} />}
        {tab === "yayin" && (
          <BroadcastPanel yt={yt} engine={engine} busy={busy} matchId={matchId} matchName={matchName} match={live.match} startedVia={onAir ? startedVia : null} encoding={prefs.encoding} onEncoding={setEncoding}
            onStartYoutube={startYoutube} onStartManual={startManual} onRehearsal={startRehearsal} onStop={() => stopEncoder({ askFirst: false })} onEndYoutube={endYoutube} toast={toast} ask={ask}
            localRec={prefs.localRec} onLocalRec={setLocalRec} />
        )}
        {tab === "ses" && (
          <AudioPanel audio={prefs.audio} setAudio={setAudio} mixer={mixer} devices={src.devices}
            onRequestMic={async () => { try { await window.elitlig?.studio?.requestMediaAccess?.("microphone"); } catch { /* yoksay */ } setAudio((a) => ({ ...a, mic: { ...a.mic, nonce: Date.now() } })); src.refreshDevices(); }} />
        )}
        {tab === "led" && <LedPanel led={led} scenes={config.scenes} matchId={matchId} ledMode={g?.ledMode} />}
      </Dock>

      {picker && (
        <PlayerPicker title={picker.title} subtitle={`${eventLabel(picker.code)} · ${live.minute}'`} side={picker.side}
          players={picker.side === "home" ? live.squads.home : live.squads.away} busy={saving} clipKey={picker.clipKey}
          onPick={record} onClose={cancelPicker} />
      )}
      {dialog && (
        <SourceDialog initial={dialog.initial} cameraCount={config.sources.filter((s) => s.kind === "camera").length} devices={src.devices} access={src.access}
          onRequestAccess={src.requestAccess} onRefreshDevices={src.refreshDevices} onSave={saveSource} onClose={closeDialog} />
      )}
      {help && <HelpModal onClose={() => setHelp(false)} />}
      {!hasGraphics && null}
    </div>
  );
}
