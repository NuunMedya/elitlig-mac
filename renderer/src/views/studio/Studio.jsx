// YAYIN STÜDYOSU — OBS benzeri canlı yayın + reji (mobil /yonetim/canli-yayin/:id
// ile aynı sunucu ve aynı akışlar; masaüstünde birden çok kamera ve sahne).
//
//   Üst çubuk  maç seçici, yayın durumu, bit hızı / fps / düşen kare, MİKROFON (M),
//              TEKRAR (R), yayını başlat / durdur
//   Sol        sahneler (1–9, çift tık yayına), sahnedeki katmanlar, kaynaklar
//   Orta       ÖNİZLEME | geçiş (Boşluk / Enter) | PROGRAM (yayına giden)
//   Sağ        Maç · Olay · Tekrar · Yayın · Ses sekmeleri
//
// Görüntü yolu: kaynaklar → PROGRAM tuvali (+ skorbord) → captureStream →
// MediaRecorder (+ WebAudio karışımı) → studio.pushChunk → ana süreç ffmpeg → RTMP.
// GOL'e basıldığı an son 10 sn klip olarak kaydedilir, golcü seçilince
// oyuncunun profiline yüklenir; TEKRAR klibi programda oynatır, bitince
// kameralara döner.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon, Kbd, useConfirm, useToast } from "../../components/ui";
import { setLeaveGuard } from "../../lib/leaveGuard";
import { addLayer, addScene, addSource, duplicateScene, loadConfig, moveLayer, moveScene, removeLayer, removeScene, removeSource, renameScene, saveConfig, sourceUsage, updateLayer, updateSource } from "../../lib/studio/layouts";
import { ingestUrl, keyAction, presetOf, replayEvent, reusableStream, statusPill } from "../../lib/studio/broadcast";
import { TRANSITIONS } from "../../lib/studio/compose";
import { eventLabel, isGoalCode, timerNowMs } from "../../lib/studio/match";
import { useLiveMatch } from "./useLiveMatch";
import { useStudioSources } from "./useStudioSources";
import { useAudioMixer } from "./useAudioMixer";
import { useCanvasImage, useCompositor } from "./useCompositor";
import { useEngine } from "./useEngine";
import { useYoutube } from "./useYoutube";
import { useGoalClips } from "./useGoalClips";
import { errorText } from "./studioApi";
import MatchSelect from "./MatchSelect";
import ScenesPanel from "./ScenesPanel";
import SourcesPanel, { SourceDialog } from "./SourcesPanel";
import MatchPanel from "./MatchPanel";
import EventsPanel from "./EventsPanel";
import ReplayPanel from "./ReplayPanel";
import BroadcastPanel from "./BroadcastPanel";
import AudioPanel, { LevelMeter } from "./AudioPanel";
import PlayerPicker from "./PlayerPicker";
import logoInline from "../../assets/elitlig-beyaz.png?inline";
import "./studio.css";

const PREFS_KEY = "studio.prefs.v1";
const MATCH_KEY = "studio.match";
const DEFAULT_PREFS = {
  quality: "720p30",
  transition: "fade",
  studioMode: true,
  slowMo: false,
  replayAudio: false,
  tab: "mac",
  audio: { mic: { deviceId: null, muted: false, volume: 100, noiseSuppression: false }, inputs: [] },
};
const readPrefs = () => {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) || "null");
    return p ? { ...DEFAULT_PREFS, ...p, audio: { mic: { ...DEFAULT_PREFS.audio.mic, ...(p.audio?.mic || {}) }, inputs: Array.isArray(p.audio?.inputs) ? p.audio.inputs : [] } } : DEFAULT_PREFS;
  } catch { return DEFAULT_PREFS; }
};
const store = (() => { try { return window.localStorage; } catch { return null; } })();

const TABS = [
  { key: "mac", label: "Maç", icon: "ball" },
  { key: "olay", label: "Olay", icon: "flag" },
  { key: "tekrar", label: "Tekrar", icon: "repeat" },
  { key: "yayin", label: "Yayın", icon: "broadcast" },
  { key: "ses", label: "Ses", icon: "mic" },
];

/** DOM dışında kurulan tuvali kaba yerleştirir. */
function CanvasHost({ canvas, className }) {
  const ref = useRef(null);
  useEffect(() => {
    const host = ref.current;
    if (!host) return undefined;
    host.appendChild(canvas);
    return () => { if (canvas.parentNode === host) host.removeChild(canvas); };
  }, [canvas]);
  return <div ref={ref} className={className} />;
}

/** Tekrar videosunun tuvali kirletip kirletmediği (kirliyse yayına çizilmez). */
function canvasSafe(video) {
  try {
    const c = document.createElement("canvas");
    c.width = 2; c.height = 2;
    const ctx = c.getContext("2d");
    ctx.drawImage(video, 0, 0, 2, 2);
    ctx.getImageData(0, 0, 1, 1);
    return true;
  } catch { return false; }
}

function loadVideo(el, url, cors) {
  return new Promise((resolve, reject) => {
    const done = (ok) => { el.removeEventListener("loadeddata", onOk); el.removeEventListener("error", onErr); ok ? resolve() : reject(new Error("Klip açılamadı.")); };
    const onOk = () => done(true);
    const onErr = () => done(false);
    el.addEventListener("loadeddata", onOk);
    el.addEventListener("error", onErr);
    if (cors) el.crossOrigin = "anonymous"; else el.removeAttribute("crossorigin");
    el.src = url;
    el.load();
  });
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
  const preset = presetOf(prefs.quality);

  /* ───────── maç ───────── */
  const [matchId, setMatchId] = useState(() => { try { return Number(localStorage.getItem(MATCH_KEY)) || null; } catch { return null; } });
  useEffect(() => { try { if (matchId) localStorage.setItem(MATCH_KEY, String(matchId)); else localStorage.removeItem(MATCH_KEY); } catch { /* yoksay */ } }, [matchId]);
  const live = useLiveMatch(matchId, Number(auth?.user?.id) || null);

  /* ───────── kaynaklar, ses, karıştırıcı ───────── */
  const onResolve = useCallback((id, patch) => setConfig((c) => updateSource(c, id, patch)), []);
  const src = useStudioSources(config.sources, { onResolve });
  const replayEl = useMemo(() => {
    const v = document.createElement("video");
    v.playsInline = true;
    v.preload = "auto";
    return v;
  }, []);
  const mixer = useAudioMixer({ mic: prefs.audio.mic, inputs: prefs.audio.inputs, replayEl, replayAudio: prefs.replayAudio });
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
  bugRef.current = live.match ? {
    homeName: live.homeName,
    awayName: live.awayName,
    homeScore: live.score.home,
    awayScore: live.score.away,
    clockAt: (now) => timerNowMs(timer, now),
    period: live.period,
    finished: live.phase === "finished",
    event: live.bannerEvent,
  } : null;

  const comp = useCompositor({ width: preset.width, height: preset.height, fps: preset.fps, configRef, runtimeRef: src.runtimeRef, bugRef, imagesRef, replayRef });

  /* ───────── kodlayıcı ve YouTube ───────── */
  const onEngineError = useCallback((m) => toast(m, { tone: "error", timeout: 6000 }), [toast]);
  const engine = useEngine({ getVideoTrack: comp.getVideoTrack, getAudioTrack: mixer.audioTrack, onError: onEngineError });
  const yt = useYoutube(matchId, { encodingLive: engine.mode === "live" && engine.active });
  const clips = useGoalClips(matchId);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

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

  /* ───────── sahneler ───────── */
  const studioMode = prefs.studioMode;
  const transitionMs = TRANSITIONS.find((t) => t.key === prefs.transition)?.ms ?? 300;
  const toProgram = useCallback((sceneId) => {
    const cfg = configRef.current;
    const target = sceneId || cfg.previewSceneId;
    if (!target || target === cfg.programSceneId) return;
    comp.startTransition(cfg.programSceneId, target, transitionMs);
    setConfig((c) => ({ ...c, programSceneId: target, previewSceneId: studioMode ? c.previewSceneId : target }));
  }, [comp, transitionMs, studioMode]);
  const toPreview = useCallback((sceneId) => {
    if (!studioMode) { toProgram(sceneId); return; }
    setConfig((c) => ({ ...c, previewSceneId: sceneId }));
  }, [studioMode, toProgram]);
  const previewScene = config.scenes.find((s) => s.id === (studioMode ? config.previewSceneId : config.programSceneId)) || config.scenes[0];
  const programScene = config.scenes.find((s) => s.id === config.programSceneId) || config.scenes[0];

  const [dialog, setDialog] = useState(null); // { initial, addToScene }
  const saveSource = (draft) => {
    const addTo = dialog?.addToScene;
    setDialog(null);
    if (draft.id) {
      setConfig((c) => updateSource(c, draft.id, { ...draft, nonce: draft.kind === "screen" ? Date.now() : draft.nonce }));
      return;
    }
    setConfig((c) => {
      const { config: next, source } = addSource(c, draft);
      return addTo ? addLayer(next, previewScene.id, source.id, { type: "full" }) : next;
    });
  };
  const deleteSource = async (s) => {
    const used = sourceUsage(config, s.id);
    if (!(await ask({ title: "Kaynağı sil", message: used.length ? `“${s.name}” şu sahnelerden de çıkarılır: ${used.join(", ")}.` : `“${s.name}” silinsin mi?`, confirmLabel: "Sil", danger: true }))) return;
    if (s.url && String(s.url).startsWith("blob:")) URL.revokeObjectURL(s.url);
    setConfig((c) => removeSource(c, s.id));
  };
  const deleteScene = async (sc) => {
    if (!(await ask({ title: "Sahneyi sil", message: `“${sc.name}” silinsin mi? Kaynaklar silinmez.`, confirmLabel: "Sil", danger: true }))) return;
    setConfig((c) => removeScene(c, sc.id));
  };

  /* ───────── olay girişi ───────── */
  const [picker, setPicker] = useState(null);
  const [saving, setSaving] = useState(false);
  const askEvent = useCallback((side, code, title) => {
    if (live.status !== "canli") { toast("Maç canlı değil: olay girmek için önce Maç sekmesinden maçı başlat.", { tone: "warn", timeout: 4500 }); return; }
    // GOL: basış anında yayının son 10 saniyesi klip olarak yazılır.
    const clipKey = isGoalCode(code) && engine.active ? clips.capture({ side, code, minute: live.minute }) : null;
    setPicker({ side, code, title, clipKey });
  }, [clips, engine.active, live.minute, live.status, toast]);
  const askGoal = useCallback((side) => askEvent(side, "GOAL_RIGHT_FOOT", `${side === "home" ? live.homeName : live.awayName} — golü atan`), [askEvent, live.awayName, live.homeName]);

  const record = async (playerId) => {
    if (!picker) return;
    setSaving(true);
    try {
      const created = await live.addEvent({ side: picker.side, code: picker.code, playerId });
      if (picker.clipKey) clips.attach(picker.clipKey, Number(created?.id) || null, live.nameOf(playerId), picker.side, picker.code);
      toast(`${eventLabel(picker.code)} kaydedildi (${live.minute}').`, { tone: "success" });
      setPicker(null);
    } catch (e) {
      toast(errorText(e, "Olay kaydedilemedi."), { tone: "error", timeout: 5000 });
    } finally { setSaving(false); }
  };
  const cancelPicker = () => {
    // Gol kaydedilmedi: klip yalnız bu bilgisayarda (tekrar için) kalır.
    if (picker?.clipKey) clips.attach(picker.clipKey, null, null);
    setPicker(null);
  };

  const runControl = async (action) => {
    setSaving(true);
    try { toast(await live.control(action), { tone: "success" }); } catch (e) { toast(errorText(e, "İşlem yapılamadı."), { tone: "error", timeout: 5000 }); } finally { setSaving(false); }
  };
  const askFinish = async () => {
    if (await ask({ title: "Maçı bitir", message: `Maç ${live.score.home} – ${live.score.away} bitsin mi? Skor tescil edilir.`, confirmLabel: "Bitir", danger: true })) runControl("finish");
  };
  const undoGoal = async (ev) => {
    if (!(await ask({ title: "Son golü sil", message: `${eventLabel(ev.olay_kodu)} (${ev.dakika ?? 0}') silinsin mi? Skor yeniden hesaplanır.`, confirmLabel: "Sil", danger: true }))) return;
    live.removeEvent(Number(ev.id)).then(() => toast("Gol silindi.", { tone: "success" }), (e) => toast(errorText(e, "Gol silinemedi."), { tone: "error" }));
  };
  const removeEvent = async (ev, label) => {
    if (!(await ask({ title: "Olayı sil", message: `${label} silinsin mi?`, confirmLabel: "Sil", danger: true }))) return;
    live.removeEvent(Number(ev.id)).then(() => toast("Olay silindi.", { tone: "success" }), (e) => toast(errorText(e, "Olay silinemedi."), { tone: "error" }));
  };
  const nudge = (d) => live.nudgeClock(d).catch((e) => toast(errorText(e, "Saat düzeltilemedi."), { tone: "error" }));

  /* ───────── tekrar ───────── */
  const [replaying, setReplaying] = useState(null);
  const endReplay = useCallback(() => {
    replayRef.current = { active: false };
    try { replayEl.pause(); } catch { /* yoksay */ }
    setReplaying(null);
  }, [replayEl]);
  useEffect(() => {
    replayEl.onended = endReplay;
    return () => { replayEl.onended = null; try { replayEl.pause(); } catch { /* yoksay */ } };
  }, [replayEl, endReplay]);
  const startReplay = useCallback(async (clip) => {
    if (!clip?.url) { toast("Tekrar için henüz kayıtlı gol klibi yok.", { tone: "warn" }); return; }
    mixer.resume();
    try {
      try { await loadVideo(replayEl, clip.url, true); } catch { await loadVideo(replayEl, clip.url, false); }
      if (!canvasSafe(replayEl)) throw new Error("Klip yayına çizilemiyor (güvenlik / CORS). Uygulamayı güncelleyin.");
      replayEl.currentTime = 0;
      replayEl.playbackRate = prefs.slowMo ? 0.5 : 1;
      replayRef.current = { active: true, el: replayEl, event: replayEvent(clip) };
      setReplaying(clip);
      await replayEl.play();
    } catch (e) {
      endReplay();
      toast(errorText(e, "Tekrar oynatılamadı."), { tone: "error", timeout: 5000 });
    }
  }, [endReplay, mixer, prefs.slowMo, replayEl, toast]);
  useEffect(() => { replayEl.playbackRate = prefs.slowMo ? 0.5 : 1; }, [prefs.slowMo, replayEl]);

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
    else if (act.type === "replay") { if (replaying) endReplay(); else startReplay(clips.latest); }
    else if (act.type === "scene") { const sc = configRef.current.scenes[act.index]; if (sc) toPreview(sc.id); }
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
  const pill = statusPill(engine.status.state, engine.since, now);
  const st = engine.status;
  const tab = prefs.tab;
  const setTab = (t) => setPref("tab", t);
  const onAir = engine.active;
  const latestClip = clips.latest;

  return (
    <div className="studio" onPointerDown={mixer.resume}>
      <header className="st-top">
        <div className="st-top__title"><Icon name="broadcast" size={17} strokeWidth={2.2} /><strong>Yayın Stüdyosu</strong></div>
        <MatchSelect matchId={matchId} current={live.match} disabled={onAir} onChange={setMatchId} />
        {live.match && <span className="st-top__score" title={`${live.homeName} – ${live.awayName}`}>{live.score.home}–{live.score.away}</span>}
        <span className={`st-pill is-${pill.tone}`}><i />{pill.label}</span>
        {onAir && (
          <span className="st-stats" title="Bit hızı · kare hızı · düşen kare">
            {Number.isFinite(st.bitrateKbps) ? `${Math.round(st.bitrateKbps)} kbps` : "— kbps"} · {Number.isFinite(st.fps) ? Math.round(st.fps) : comp.stats.fps} fps{Number(st.droppedFrames) > 0 ? ` · ${st.droppedFrames} düşen` : ""}
          </span>
        )}
        <span className="st-top__spacer" />
        <button type="button" className={`st-mic ${muted ? "is-off" : ""}`} onClick={toggleMic} title="Mikrofonu aç / kapat (M)">
          <Icon name={muted ? "micOff" : "mic"} size={16} />
          <span>{muted ? "SES KAPALI" : "SES AÇIK"}</span>
          <LevelMeter getAnalyser={() => mixer.micAnalyser(true)} muted={muted} compact />
        </button>
        {replaying
          ? <button type="button" className="st-replay is-on" onClick={endReplay} title="Canlıya dön (R)"><Icon name="stop" size={14} /> CANLIYA DÖN</button>
          : <button type="button" className="st-replay" onClick={() => startReplay(latestClip)} disabled={!latestClip} title={latestClip ? "Son golün tekrarını yayına ver (R)" : "Henüz gol klibi yok"}><Icon name="repeat" size={14} /> TEKRAR <Kbd>R</Kbd></button>}
        <button type="button" className={`btn ${onAir ? "" : "btn--red"} st-golive`} disabled={busy} onClick={topStart}>
          <Icon name={onAir ? "stop" : "broadcast"} size={14} /> {onAir ? (engine.mode === "rehearsal" ? "Provayı bitir" : "Yayını durdur") : "Yayını başlat"}
        </button>
      </header>

      <div className="st-body">
        <aside className="st-left">
          <ScenesPanel scenes={config.scenes} previewId={studioMode ? config.previewSceneId : null} programId={config.programSceneId}
            onPreview={toPreview} onProgram={toProgram}
            onAdd={() => setConfig((c) => addScene(c).config)}
            onRename={(id, name) => setConfig((c) => renameScene(c, id, name))}
            onDuplicate={(id) => setConfig((c) => duplicateScene(c, id).config)}
            onMove={(id, d) => setConfig((c) => moveScene(c, id, d))}
            onRemove={deleteScene} />
          <SourcesPanel scene={previewScene} sources={config.sources} runtimeRef={src.runtimeRef} version={src.version}
            onAddLayer={(sourceId) => setConfig((c) => addLayer(c, previewScene.id, sourceId))}
            onUpdateLayer={(layerId, patch) => setConfig((c) => updateLayer(c, previewScene.id, layerId, patch))}
            onMoveLayer={(layerId, d) => setConfig((c) => moveLayer(c, previewScene.id, layerId, d))}
            onRemoveLayer={(layerId) => setConfig((c) => removeLayer(c, previewScene.id, layerId))}
            onNewSource={(addToScene) => setDialog({ initial: {}, addToScene })}
            onEditSource={(s) => setDialog({ initial: s })}
            onRemoveSource={deleteSource}
            onReacquire={src.reacquire}
            onRequestAccess={src.requestAccess} />
        </aside>

        <main className="st-center">
          <div className="st-center__bar">
            <label className="toggle"><input type="checkbox" checked={studioMode} onChange={(e) => setPref("studioMode", e.target.checked)} /> Stüdyo modu (önizleme + program)</label>
            <span className="st-top__spacer" />
            <label className="toggle"><input type="checkbox" checked={config.overlay.scorebug} onChange={(e) => setConfig((c) => ({ ...c, overlay: { ...c.overlay, scorebug: e.target.checked } }))} /> Skorbord</label>
            <span className="muted small">{preset.width}×{preset.height} · {preset.fps} fps · çizim {comp.stats.fps} fps</span>
          </div>
          <div className={`st-monitors ${studioMode ? "is-dual" : "is-single"}`}>
            {studioMode && (
              <figure className="st-monitor">
                <figcaption><span className="st-tag">ÖNİZLEME</span> {previewScene?.name}</figcaption>
                <CanvasHost canvas={comp.preview} className="st-monitor__screen" />
              </figure>
            )}
            {studioMode && (
              <div className="st-transition">
                <button type="button" className="btn btn--primary st-transition__go" onClick={() => toProgram()} disabled={config.previewSceneId === config.programSceneId} title="Önizlemeyi yayına geçir (Boşluk / Enter)">
                  <Icon name="chevronRight" size={16} strokeWidth={2.4} /> Geçiş
                </button>
                <select className="select-sm" value={prefs.transition} onChange={(e) => setPref("transition", e.target.value)} aria-label="Geçiş türü">
                  {TRANSITIONS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                </select>
                <small className="muted"><Kbd>Boşluk</Kbd></small>
              </div>
            )}
            <figure className={`st-monitor is-program ${engine.status.state === "live" ? "is-live" : ""}`}>
              <figcaption><span className={`st-tag ${onAir ? "is-live" : ""}`}>PROGRAM</span> {replaying ? "Tekrar" : programScene?.name}{replaying && <span className="st-tag is-live">TEKRAR YAYINDA</span>}</figcaption>
              <CanvasHost canvas={comp.program} className="st-monitor__screen" />
            </figure>
          </div>
          {!live.match && (
            <div className="st-note st-center__note"><Icon name="info" size={14} /> {matchId ? (live.error ? live.error.message || "Maç alınamadı." : "Maç yükleniyor…") : "Skorbord ve reji için üstten maç seç. Kaynakları ve sahneleri maç seçmeden de hazırlayabilirsin."}</div>
          )}
        </main>

        <aside className="st-right">
          <nav className="st-tabs" role="tablist">
            {TABS.map((t) => (
              <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className={tab === t.key ? "is-on" : ""} onClick={() => setTab(t.key)}>
                <Icon name={t.icon} size={14} /><span>{t.label}</span>
                {t.key === "tekrar" && clips.clips.length > 0 && <b className="st-tabs__count">{clips.clips.length}</b>}
              </button>
            ))}
          </nav>
          <div className="st-right__body">
            {tab === "mac" && (live.match
              ? <MatchPanel live={live} saving={saving} goalArmed={goalArmed} onGoal={askGoal} onControl={runControl} onFinish={askFinish} onUndo={undoGoal} onNudge={nudge} />
              : <p className="st-hint">Maç seçilmedi.</p>)}
            {tab === "olay" && (live.match ? <EventsPanel live={live} onAsk={askEvent} onRemove={removeEvent} /> : <p className="st-hint">Maç seçilmedi.</p>)}
            {tab === "tekrar" && (
              <ReplayPanel clips={clips.clips} older={clips.older} replayingKey={replaying?.key ?? null} encoding={engine.active}
                slowMo={prefs.slowMo} onSlowMo={(v) => setPref("slowMo", v)} replayAudio={prefs.replayAudio} onReplayAudio={(v) => setPref("replayAudio", v)}
                homeName={live.homeName} awayName={live.awayName}
                onPlay={startReplay} onStop={endReplay} onRetry={clips.retry} onRemove={clips.remove} onReveal={clips.reveal} onDeleteFile={clips.deleteFile} />
            )}
            {tab === "yayin" && (
              <BroadcastPanel yt={yt} engine={engine} busy={busy} matchId={matchId} quality={prefs.quality} onQuality={(q) => setPref("quality", q)}
                onStartYoutube={startYoutube} onStartManual={startManual} onRehearsal={startRehearsal} onStop={() => stopEncoder({ askFirst: false })} onEndYoutube={endYoutube} toast={toast} />
            )}
            {tab === "ses" && (
              <AudioPanel audio={prefs.audio} setAudio={setAudio} mixer={mixer} devices={src.devices}
                onRequestMic={async () => { try { await window.elitlig?.studio?.requestMediaAccess?.("microphone"); } catch { /* yoksay */ } setAudio((a) => ({ ...a, mic: { ...a.mic, nonce: Date.now() } })); src.refreshDevices(); }} />
            )}
          </div>
        </aside>
      </div>

      {picker && (
        <PlayerPicker title={picker.title} subtitle={`${eventLabel(picker.code)} · ${live.minute}'`} side={picker.side}
          players={picker.side === "home" ? live.squads.home : live.squads.away} busy={saving} clipKey={picker.clipKey}
          onPick={record} onClose={cancelPicker} />
      )}
      {dialog && (
        <SourceDialog initial={dialog.initial} cameraCount={config.sources.filter((s) => s.kind === "camera").length} devices={src.devices} access={src.access}
          onRequestAccess={src.requestAccess} onRefreshDevices={src.refreshDevices} onSave={saveSource} onClose={() => setDialog(null)} />
      )}
    </div>
  );
}
