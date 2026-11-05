// YAYIN STÜDYOSU — OBS benzeri canlı yayın + reji (mobil /yonetim/canli-yayin/:id
// ile aynı sunucu ve aynı akışlar; masaüstünde birden çok kamera).
//
//   Üst çubuk   maç seçici, yayın durumu, skorbord türü, SES (M), ÖNEMLİ AN (B),
//               TEKRAR (R), yayını başlat / durdur
//   Ekranlar    ÖNİZLEME | geçiş (Boşluk / Enter, Kesme · Yumuşak · ElitLig logo) | PROGRAM
//               — tüm genişlik, kenar boşluğu yok
//   Çoklu görünüm  her kaynak (ve düzen) canlı bir kutu: tıkla → önizleme,
//               çift tıkla → yayına; 1–9 kısayol; sonda "+ Kaynak ekle"
//   Alt panel   Reji · Olaylar · Tekrar & Özet · Kaynaklar & Düzenler · Yayın · Ses ·
//               Maç yönetimi (yüksekliği sürüklenir, hatırlanır)
//
// Görüntü yolu: kaynaklar → PROGRAM tuvali (+ skorbord) → captureStream →
// MediaRecorder (+ WebAudio karışımı) → studio.pushChunk → ana süreç ffmpeg → RTMP.
// Her kaynak ayrıca kendi halka kaydına gider (açılar): GOL ya da ÖNEMLİ AN o
// anın son 10 saniyesini tüm seçili açılardan tekrar olarak yazar; tekrar
// kuyruğu ElitLig logo geçişiyle programda oynar, bitince canlıya döner.
//
// Stüdyo kökü saniyede birkaç kez çizilir (maç saati); kare başına değişen her
// şey (fps, seviye ölçerleri, küçük resimler) ref'lerde ve yaprak
// bileşenlerde durur, alt panellere kimliği sabit işlevler verilir — açık
// açılır menüler kapanmaz.
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon, Kbd, useConfirm, useToast } from "../../components/ui";
import { setLeaveGuard } from "../../lib/leaveGuard";
import { addLayoutScene, addSource, loadConfig, multiviewItems, removeScene, removeSource, renameScene, resolveScene, saveConfig, sourceUsage, updateLayer, updateLayoutPreset, updateSource, sourceSceneId } from "../../lib/studio/layouts";
import { encodingPreset, ingestUrl, keyAction, normalizeEncoding, reusableStream, statusPill } from "../../lib/studio/broadcast";
import { TRANSITIONS, transitionOf } from "../../lib/studio/compose";
import { SCOREBUG_VARIANTS, scorerLines } from "../../lib/studio/scorebug";
import { eventLabel, isGoalCode, timerNowMs } from "../../lib/studio/match";
import { PROGRAM_ANGLE, anglesToRecord, buildReplayQueue, defaultAngles, metaFor, replayBanner } from "../../lib/studio/replays";
import { useLiveMatch } from "./useLiveMatch";
import { useStudioSources } from "./useStudioSources";
import { useAudioMixer } from "./useAudioMixer";
import { bugVariantOf, useCanvasImage, useCompositor } from "./useCompositor";
import { useEngine } from "./useEngine";
import { useYoutube } from "./useYoutube";
import { useReplays } from "./useReplays";
import { useAngleRecorders } from "./useAngleRecorders";
import { useReplayPlayer } from "./useReplayPlayer";
import { useHighlights } from "./useHighlights";
import { useStable } from "./useStable";
import { errorText } from "./studioApi";
import MatchSelect from "./MatchSelect";
import Multiview from "./Multiview";
import Dock, { clampDock } from "./Dock";
import SourcesPanel, { SourceDialog } from "./SourcesPanel";
import MatchPanel from "./MatchPanel";
import EventsPanel from "./EventsPanel";
import ReplayPanel from "./ReplayPanel";
import HighlightsPanel from "./HighlightsPanel";
import BroadcastPanel from "./BroadcastPanel";
import AudioPanel, { LevelMeter } from "./AudioPanel";
import PlayerPicker from "./PlayerPicker";
import { ManageDock } from "./manage";
import logoInline from "../../assets/elitlig-beyaz.png?inline";
import "./studio.css";

const PREFS_KEY = "studio.prefs.v1";
const MATCH_KEY = "studio.match";
const OLD_TABS = { mac: "reji", olay: "olay", tekrar: "tekrar", yayin: "yayin", ses: "ses" };
const DEFAULT_PREFS = {
  encoding: { resolution: "720p", fps: 30, bitrateKbps: 2500 },
  transition: "fade",
  studioMode: true,
  slowMo: false,
  replayAudio: false,
  tab: "reji",
  replayView: "tekrar",
  dockH: 300,
  angles: { program: true, all: true, sources: [] },
  audio: { mic: { deviceId: null, muted: false, volume: 100, noiseSuppression: false }, inputs: [] },
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
      angles: { ...DEFAULT_PREFS.angles, ...(p.angles || {}) },
      audio: { mic: { ...DEFAULT_PREFS.audio.mic, ...(p.audio?.mic || {}) }, inputs: Array.isArray(p.audio?.inputs) ? p.audio.inputs : [] },
    };
  } catch { return DEFAULT_PREFS; }
};
const store = (() => { try { return window.localStorage; } catch { return null; } })();

/** DOM dışında kurulan tuvali kaba yerleştirir. */
const CanvasHost = memo(function CanvasHost({ canvas, className }) {
  const ref = useRef(null);
  useEffect(() => {
    const host = ref.current;
    if (!host) return undefined;
    host.appendChild(canvas);
    return () => { if (canvas.parentNode === host) host.removeChild(canvas); };
  }, [canvas]);
  return <div ref={ref} className={className} />;
});

/** Durum hapı: kendi saniyelik saatiyle (stüdyonun tamamı çizilmez). */
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

/** Kodlayıcı istatistiği + çizim fps'i (saniyede bir, yaprakta). */
function Stats({ status, getStats, onAir }) {
  const [, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick((n) => n + 1), 1000); return () => clearInterval(t); }, []);
  const drawFps = getStats().fps;
  if (!onAir) return <span className="st-stats" title="Program tuvalinin çizim hızı">çizim {drawFps} fps</span>;
  return (
    <span className="st-stats" title="Bit hızı · kare hızı · düşen kare">
      {Number.isFinite(status.bitrateKbps) ? `${Math.round(status.bitrateKbps)} kbps` : "— kbps"} · {Number.isFinite(status.fps) ? Math.round(status.fps) : drawFps} fps{Number(status.droppedFrames) > 0 ? ` · ${status.droppedFrames} düşen` : ""}
    </span>
  );
}

export default function Studio({ auth }) {
  const toast = useToast();
  const confirm = useConfirm();
  const ask = useCallback((opts) => (confirm ? confirm(opts) : Promise.resolve(window.confirm(opts.message))), [confirm]);

  /* ───────── yapılandırma ───────── */
  const [config, setConfig] = useState(() => loadConfig(store));
  const configRef = useRef(config);
  configRef.current = config;
  useEffect(() => { const t = setTimeout(() => saveConfig(store, config), 300); return () => clearTimeout(t); }, [config]);

  const [prefs, setPrefs] = useState(readPrefs);
  const setPref = useCallback((key, value) => setPrefs((p) => ({ ...p, [key]: typeof value === "function" ? value(p[key]) : value })), []);
  useEffect(() => { try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* yoksay */ } }, [prefs]);
  const preset = useMemo(() => encodingPreset(prefs.encoding), [prefs.encoding]);

  /* ───────── maç ───────── */
  const [matchId, setMatchId] = useState(() => { try { return Number(localStorage.getItem(MATCH_KEY)) || null; } catch { return null; } });
  useEffect(() => { try { if (matchId) localStorage.setItem(MATCH_KEY, String(matchId)); else localStorage.removeItem(MATCH_KEY); } catch { /* yoksay */ } }, [matchId]);
  const live = useLiveMatch(matchId, Number(auth?.user?.id) || null);

  /* ───────── kaynaklar, ses, karıştırıcı ───────── */
  const onResolve = useCallback((id, patch) => setConfig((c) => updateSource(c, id, patch)), []);
  const src = useStudioSources(config.sources, { onResolve });
  const replayEls = useMemo(() => [0, 1].map(() => {
    const v = document.createElement("video");
    v.playsInline = true;
    v.preload = "auto";
    return v;
  }), []);
  const mixer = useAudioMixer({ mic: prefs.audio.mic, inputs: prefs.audio.inputs, replayEls, replayAudio: prefs.replayAudio });
  const setAudio = useCallback((fn) => setPref("audio", fn), [setPref]);
  const muted = prefs.audio.mic.muted;
  const toggleMic = useCallback(() => setAudio((a) => ({ ...a, mic: { ...a.mic, muted: !a.mic.muted } })), [setAudio]);

  const bugRef = useRef(null);
  const imagesRef = useRef({});
  const replayRef = useRef({ active: false });
  const logo = useCanvasImage(logoInline, { inline: true });
  const homeLogo = useCanvasImage(live.logos.home);
  const awayLogo = useCanvasImage(live.logos.away);
  imagesRef.current = { logo, home: homeLogo, away: awayLogo };
  const timer = live.timer;
  const scorers = useMemo(() => scorerLines(live.events, { homeTeamId: live.homeTeamId, awayTeamId: live.awayTeamId, nameOf: live.nameOf }), [live.events, live.homeTeamId, live.awayTeamId, live.nameOf]);
  bugRef.current = live.match ? {
    homeName: live.homeName,
    awayName: live.awayName,
    homeScore: live.score.home,
    awayScore: live.score.away,
    clockAt: (now) => timerNowMs(timer, now),
    period: live.period,
    finished: live.phase === "finished",
    event: live.bannerEvent,
    scorers,
  } : null;

  const comp = useCompositor({ width: preset.width, height: preset.height, fps: preset.fps, configRef, runtimeRef: src.runtimeRef, bugRef, imagesRef, replayRef });

  /* ───────── kodlayıcı ve YouTube ───────── */
  const onEngineError = useCallback((m) => toast(m, { tone: "error", timeout: 6000 }), [toast]);
  const engine = useEngine({ getVideoTrack: comp.getVideoTrack, getAudioTrack: mixer.audioTrack, onError: onEngineError });
  const yt = useYoutube(matchId, { encodingLive: engine.mode === "live" && engine.active });
  const replays = useReplays(matchId);
  const hl = useHighlights(matchId);
  const [busy, setBusy] = useState(false);

  const begin = useCallback(async (url) => {
    mixer.resume();
    await engine.start({ url, preset });
  }, [engine, mixer, preset]);

  const startYoutube = async () => {
    if (!matchId) { toast("Önce üstten maç seç.", { tone: "warn" }); return; }
    setBusy(true);
    try {
      const open = reusableStream(yt.stream) ? yt.stream : await yt.open();
      const url = ingestUrl(open);
      if (!url) throw new Error("YouTube yayın adresi alınamadı.");
      await begin(url);
      toast("Görüntü YouTube'a gönderiliyor. Yayın birkaç saniye içinde canlıya geçer.", { tone: "success", timeout: 5000 });
    } catch (e) {
      toast(errorText(e, "YouTube yayını açılamadı."), { tone: "error", timeout: 6000 });
    } finally { setBusy(false); }
  };
  const startManual = async (url) => {
    setBusy(true);
    try { await begin(url); toast("Görüntü RTMP sunucusuna gönderiliyor.", { tone: "success" }); } catch (e) { toast(errorText(e, "Yayın başlatılamadı."), { tone: "error", timeout: 6000 }); } finally { setBusy(false); }
  };
  const startRehearsal = async () => {
    setBusy(true);
    try { await begin(null); toast("Prova kaydı başladı: görüntü hiçbir yere gönderilmiyor.", { tone: "info" }); } catch (e) { toast(errorText(e, "Prova başlatılamadı."), { tone: "error", timeout: 6000 }); } finally { setBusy(false); }
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
    toast(yt.config.configured ? "Önce üstten maç seç." : "YouTube bağlantısı yok: Yayın sekmesinden RTMP anahtarı gir ya da prova başlat.", { tone: "warn", timeout: 5000 });
  };

  // Yayın sürerken başka araca geçiş onaya bağlı; çıkışta kodlayıcı kapanır.
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
  // Kaydedilen açılar: program + açı kaydı gerçekten sürenler.
  const liveAngles = angleRec.available ? recordAngles : recordAngles.filter((a) => a === PROGRAM_ANGLE);
  const bannerOf = useCallback((item) => replayBanner(item.replay, metaFor(item.replay, replays.meta)), [replays.meta]);
  const onReplayError = useCallback((m) => toast(m, { tone: "error", timeout: 5000 }), [toast]);
  const player = useReplayPlayer({ els: replayEls, replayRef, playStinger: comp.playStinger, bannerOf, slowMo: prefs.slowMo, onError: onReplayError, onStart: mixer.resume });

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

  /* ───────── program / önizleme ───────── */
  const studioMode = prefs.studioMode;
  const transition = transitionOf(prefs.transition);
  const toProgram = useStable((id) => {
    const cfg = configRef.current;
    const target = id || cfg.previewSceneId;
    if (!target) return;
    if (player.playing) {
      // Tekrar yayındaysa: geçişle canlıya, hedef kaynakla.
      setConfig((c) => ({ ...c, programSceneId: target, previewSceneId: studioMode ? c.previewSceneId : target }));
      player.stop(true);
      return;
    }
    if (target === cfg.programSceneId) return;
    comp.startTransition(cfg.programSceneId, target, transition.key, transition.ms);
    setConfig((c) => ({ ...c, programSceneId: target, previewSceneId: studioMode ? c.previewSceneId : target }));
  });
  const toPreview = useStable((id) => {
    if (!studioMode) { toProgram(id); return; }
    setConfig((c) => ({ ...c, previewSceneId: id }));
  });
  const previewScene = resolveScene(config, studioMode ? config.previewSceneId : config.programSceneId);
  const programScene = resolveScene(config, config.programSceneId);
  const mvItems = useMemo(() => multiviewItems(config), [config]);

  /* ───────── kaynak / düzen işlemleri (kimliği sabit) ───────── */
  const [dialog, setDialog] = useState(null); // { initial }
  const closeDialog = useCallback(() => setDialog(null), []);
  const saveSource = useStable((draft) => {
    setDialog(null);
    if (draft.id) {
      setConfig((c) => updateSource(c, draft.id, { ...draft, nonce: draft.kind === "screen" ? Date.now() : draft.nonce }));
      return;
    }
    setConfig((c) => {
      const { config: next, source } = addSource(c, draft);
      // Yeni kaynak önizlemeye gelir (stüdyo modunda): hemen görülür.
      return studioMode ? { ...next, previewSceneId: sourceSceneId(source.id) } : next;
    });
  });
  const deleteSource = useStable(async (s) => {
    const used = sourceUsage(configRef.current, s.id);
    if (!(await ask({ title: "Kaynağı sil", message: used.length ? `“${s.name}” şu düzenlerden de çıkarılır: ${used.join(", ")}.` : `“${s.name}” silinsin mi?`, confirmLabel: "Sil", danger: true }))) return;
    if (s.url && String(s.url).startsWith("blob:")) URL.revokeObjectURL(s.url);
    setConfig((c) => removeSource(c, s.id));
  });
  const deleteScene = useStable(async (sc) => {
    if (!(await ask({ title: "Düzeni sil", message: `“${sc.name}” silinsin mi? Kaynaklar silinmez.`, confirmLabel: "Sil", danger: true }))) return;
    setConfig((c) => removeScene(c, sc.id));
  });
  const newSource = useCallback(() => setDialog({ initial: {} }), []);
  const editSource = useCallback((s) => setDialog({ initial: s }), []);
  const addLayout = useStable((kind) => {
    const ids = configRef.current.sources.map((s) => s.id);
    const image = configRef.current.sources.find((s) => s.kind === "image");
    const a = ids[0] || null;
    const b = kind === "full" ? image?.id || null : ids.find((id) => id !== a) || null;
    setConfig((c) => {
      const { config: next, scene } = addLayoutScene(c, { kind, a, b, ...(kind === "full" ? { size: 16, corner: "tr" } : {}) });
      return studioMode ? { ...next, previewSceneId: scene.id } : next;
    });
  });
  const sourceActions = useMemo(() => ({
    onNewSource: newSource,
    onEditSource: editSource,
    onRemoveSource: deleteSource,
    onReacquire: src.reacquire,
    onRequestAccess: src.requestAccess,
    onPreview: toPreview,
    onProgram: toProgram,
    onAddLayout: addLayout,
    onPreset: (id, patch) => setConfig((c) => updateLayoutPreset(c, id, patch)),
    onRenameScene: (id, name) => setConfig((c) => renameScene(c, id, name)),
    onRemoveScene: deleteScene,
    onUpdateLayer: (sceneId, layerId, patch) => setConfig((c) => updateLayer(c, sceneId, layerId, patch)),
  }), [newSource, editSource, deleteSource, src.reacquire, src.requestAccess, toPreview, toProgram, addLayout, deleteScene]);
  const setVariant = useCallback((variant) => setConfig((c) => ({ ...c, overlay: { ...c.overlay, variant, scorebug: variant !== "off" } })), []);

  /* ───────── olay girişi ───────── */
  const [picker, setPicker] = useState(null);
  const [saving, setSaving] = useState(false);
  const askEvent = useStable((side, code, title) => {
    if (live.status !== "canli") { toast("Maç canlı değil: olay girmek için önce Reji sekmesinden maçı başlat.", { tone: "warn", timeout: 4500 }); return; }
    // GOL: basış anında tüm seçili açıların son 10 saniyesi tekrar olarak yazılır.
    const clipKey = isGoalCode(code) && engine.active ? replays.capture({ kind: "goal", angles: liveAngles, meta: { side, code, minute: live.minute, period: live.period } }) : null;
    setPicker({ side, code, title, clipKey });
  });
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
    // Gol kaydedilmedi: tekrar yalnız bu bilgisayarda kalır.
    if (picker?.clipKey) replays.attach(picker.clipKey, { eventId: null });
    setPicker(null);
  });

  const runControl = useStable(async (action) => {
    setSaving(true);
    try { toast(await live.control(action), { tone: "success" }); } catch (e) { toast(errorText(e, "İşlem yapılamadı."), { tone: "error", timeout: 5000 }); } finally { setSaving(false); }
  });
  const askFinish = useStable(async () => {
    if (await ask({ title: "Maçı bitir", message: `Maç ${live.score.home} – ${live.score.away} bitsin mi? Skor tescil edilir.`, confirmLabel: "Bitir", danger: true })) runControl("finish");
  });
  const undoGoal = useStable(async (ev) => {
    if (!(await ask({ title: "Son golü sil", message: `${eventLabel(ev.olay_kodu)} (${ev.dakika ?? 0}') silinsin mi? Skor yeniden hesaplanır.`, confirmLabel: "Sil", danger: true }))) return;
    live.removeEvent(Number(ev.id)).then(() => toast("Gol silindi.", { tone: "success" }), (e) => toast(errorText(e, "Gol silinemedi."), { tone: "error" }));
  });
  const removeEvent = useStable(async (ev, label) => {
    if (!(await ask({ title: "Olayı sil", message: `${label} silinsin mi?`, confirmLabel: "Sil", danger: true }))) return;
    live.removeEvent(Number(ev.id)).then(() => toast("Olay silindi.", { tone: "success" }), (e) => toast(errorText(e, "Olay silinemedi."), { tone: "error" }));
  });
  const nudge = useStable((d) => live.nudgeClock(d).catch((e) => toast(errorText(e, "Saat düzeltilemedi."), { tone: "error" })));
  const removeReplay = useStable(async (r) => {
    if (!(await ask({ title: "Tekrarı sil", message: "Bu tekrar ve tüm açılarının dosyaları bu bilgisayardan silinsin mi? Profile yüklenen gol videosu kalır.", confirmLabel: "Sil", danger: true }))) return;
    replays.remove(r.id);
  });

  /* ───────── kısayollar ───────── */
  const [goalArmed, setGoalArmed] = useState(false);
  const keyRef = useRef(null);
  keyRef.current = (e) => {
    if (document.querySelector(".modal-backdrop")) return;
    const act = keyAction(e, { pendingGoal: goalArmed });
    if (!act) return;
    if (act.type === "goalCancel") { setGoalArmed(false); return; }
    e.preventDefault();
    if (act.type === "mic") toggleMic();
    else if (act.type === "replay") { if (player.playing) player.stop(true); else playLatest(); }
    else if (act.type === "moment") captureMoment();
    else if (act.type === "scene") { const it = mvItems[act.index]; if (it) toPreview(it.id); }
    else if (act.type === "transition") toProgram();
    else if (act.type === "goalArm") setGoalArmed(true);
    else if (act.type === "goal") { setGoalArmed(false); askGoal(act.side); }
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
  const matchName = live.match ? `${live.homeName} – ${live.awayName}` : "";
  const noMatch = <p className="st-hint st-pad">Maç seçilmedi: üstten maç seç (reji, olay ve skorbord için).</p>;

  const TABS = [
    { key: "reji", label: "Reji", icon: "ball" },
    { key: "olay", label: "Olaylar", icon: "flag" },
    { key: "tekrar", label: "Tekrar & Özet", icon: "repeat", count: replays.replays.length || null },
    { key: "kaynak", label: "Kaynaklar & Düzenler", icon: "layers", count: config.sources.length || null },
    { key: "yayin", label: "Yayın", icon: "broadcast" },
    { key: "ses", label: "Ses", icon: "mic" },
    { key: "yonetim", label: "Maç yönetimi", icon: "board" },
  ];

  return (
    <div className="studio" onPointerDown={mixer.resume}>
      <header className="st-top">
        <div className="st-top__title"><Icon name="broadcast" size={17} strokeWidth={2.2} /><strong>Yayın Stüdyosu</strong></div>
        <MatchSelect matchId={matchId} current={live.match} disabled={onAir} onChange={setMatchId} />
        {live.match && <span className="st-top__score" title={matchName}>{live.score.home}–{live.score.away}</span>}
        <StatusPill state={st.state} since={engine.since} />
        <Stats status={st} getStats={comp.getStats} onAir={onAir} />
        <span className="st-top__spacer" />
        <label className="st-top__field" title="Yayına gömülen skorbord">
          <span>Skorbord</span>
          <select className="select-sm" value={variant} onChange={(e) => setVariant(e.target.value)}>
            {SCOREBUG_VARIANTS.map((v) => <option key={v.key} value={v.key}>{v.label}</option>)}
          </select>
        </label>
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
      </header>

      <main className={`st-stage ${studioMode ? "is-dual" : "is-single"}`}>
        {studioMode && (
          <figure className="st-monitor">
            <figcaption><span className="st-tag">ÖNİZLEME</span><span className="st-monitor__name">{previewScene?.name || "—"}</span></figcaption>
            <CanvasHost canvas={comp.preview} className="st-monitor__screen" />
          </figure>
        )}
        <div className="st-transition">
          {studioMode && (
            <button type="button" className="btn btn--primary st-transition__go" onClick={() => toProgram()} disabled={config.previewSceneId === config.programSceneId && !player.playing} title="Önizlemeyi yayına geçir (Boşluk / Enter)">
              <Icon name="chevronRight" size={16} strokeWidth={2.4} /> Geçiş
            </button>
          )}
          <select className="select-sm" value={transition.key} onChange={(e) => setPref("transition", e.target.value)} aria-label="Geçiş türü" title="Geçiş türü">
            {TRANSITIONS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
          {studioMode && <small className="muted"><Kbd>Boşluk</Kbd></small>}
          <label className="toggle st-transition__mode" title="Kapalıyken kutuya tek tık doğrudan yayına verir"><input type="checkbox" checked={studioMode} onChange={(e) => setPref("studioMode", e.target.checked)} /> Önizleme</label>
        </div>
        <figure className={`st-monitor is-program ${st.state === "live" ? "is-live" : ""}`}>
          <figcaption>
            <span className={`st-tag ${onAir ? "is-live" : "is-pgm"}`}>PROGRAM</span>
            <span className="st-monitor__name">{player.playing ? "Tekrar" : programScene?.name || "—"}</span>
            {player.playing && <span className="st-tag is-live">TEKRAR YAYINDA {player.index + 1}/{player.total}</span>}
          </figcaption>
          <CanvasHost canvas={comp.program} className="st-monitor__screen" />
          {!live.match && (
            <div className="st-monitor__note"><Icon name="info" size={13} /> {matchId ? (live.error ? live.error.message || "Maç alınamadı." : "Maç yükleniyor…") : "Skorbord ve reji için üstten maç seç."}</div>
          )}
        </figure>
      </main>

      <Multiview items={mvItems} configRef={configRef} runtimeRef={src.runtimeRef} version={src.version} studioMode={studioMode}
        previewId={config.previewSceneId} programId={player.playing ? null : config.programSceneId}
        onPreview={toPreview} onProgram={toProgram} onAdd={newSource} onEdit={editSource} onReacquire={src.reacquire} onRemove={deleteSource} />

      <Dock tabs={TABS} tab={tab} onTab={setTab} height={prefs.dockH} onHeight={setDockH}>
        {tab === "reji" && (live.match
          ? <MatchPanel live={live} saving={saving} goalArmed={goalArmed} onGoal={askGoal} onControl={runControl} onFinish={askFinish} onUndo={undoGoal} onNudge={nudge} />
          : noMatch)}
        {tab === "olay" && (live.match ? <EventsPanel live={live} onAsk={askEvent} onRemove={removeEvent} /> : noMatch)}
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
                  player={player} slowMo={prefs.slowMo} onSlowMo={(v) => setPref("slowMo", v)} replayAudio={prefs.replayAudio} onReplayAudio={(v) => setPref("replayAudio", v)}
                  onMoment={captureMoment} onPlay={player.play} onStop={() => player.stop(true)} onSkip={player.skip} onUpdate={replays.update} onRemove={removeReplay}
                  onRetry={replays.retry} onDismiss={replays.dismissPending} uploadOf={replays.uploadOf} recordAngles={liveAngles} />}
          </div>
        )}
        {tab === "kaynak" && (
          <SourcesPanel sources={config.sources} scenes={config.scenes} runtimeRef={src.runtimeRef} version={src.version}
            previewId={config.previewSceneId} programId={config.programSceneId} actions={sourceActions} />
        )}
        {tab === "yayin" && (
          <BroadcastPanel yt={yt} engine={engine} busy={busy} matchId={matchId} matchName={matchName} encoding={prefs.encoding} onEncoding={setEncoding}
            onStartYoutube={startYoutube} onStartManual={startManual} onRehearsal={startRehearsal} onStop={() => stopEncoder({ askFirst: false })} onEndYoutube={endYoutube} toast={toast} />
        )}
        {tab === "ses" && (
          <AudioPanel audio={prefs.audio} setAudio={setAudio} mixer={mixer} devices={src.devices}
            onRequestMic={async () => { try { await window.elitlig?.studio?.requestMediaAccess?.("microphone"); } catch { /* yoksay */ } setAudio((a) => ({ ...a, mic: { ...a.mic, nonce: Date.now() } })); src.refreshDevices(); }} />
        )}
        {tab === "yonetim" && <ManageDock matchId={matchId} match={live.match} live={live} onOpenMatch={setMatchId} />}
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
    </div>
  );
}
