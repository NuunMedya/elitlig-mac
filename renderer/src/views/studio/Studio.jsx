// YAYIN STÜDYOSU — OBS / vMix benzeri canlı yayın + reji (mobil /yonetim/canli-yayin/:id
// ile aynı sunucu ve aynı akışlar; masaüstünde birden çok kamera).
//
// BASİT MANTIK
//   KAYNAKLAR  girişler (kamera, ekran, pencere, görsel, video, metin, saat…) —
//              Kaynaklar sekmesi. Kaynak eklemek sahne OLUŞTURMAZ.
//   SAHNELER   yayına giden görüntüler: sıralı kaynak katmanları. Ekranlarda ve
//              şeritte YALNIZ sahneler görünür. Şablonlar (Tek kaynak, Resim içinde
//              resim, Yan yana, Üçlü, Başlıyor / Devre arası / Bitti) ve "Bu kaynaktan
//              sahne oluştur". Düzenleyici yalnız "Düzenle" ile açılır.
//
//   Üst çubuk   yalın: skor + maç, yayın durumu, YAYIN SAĞLIĞI, çalışma alanı,
//               kısayollar (?), AYARLAR (dişli), PROGRAMDAN ÇIK (yayın sürerken onaylı)
//   Sol şerit   KISAYOL ŞERİDİ (./shortcuts): düzenlenebilir iki sütunlu ızgara; işlevsel
//               parçacıklar (Yayın, Mikrofon, VAR, Tekrar [açı seçimi], Önemli an, Olay gir,
//               takım GOL'leri, Skorbord çeşidi, Altyazı, Röportaj, Bölüm, LED, sahneler,
//               gol müziği…). 1×1 / 2×2, sürükle-bırak, sağ tık, "+" katalog; Ayarlar'da da.
//   Ekranlar    çalışma alanına göre (lib/studio/scenesWorkspace.js): Klasik, Büyük
//               program, Tek program, Çoklu görünüm 2×2 / 3×3. Sahne kutularında tally
//               (kırmızı YAYINDA / yeşil ÖNİZLEME / mavi LED). Monitöre sağ tık → Tam ekran.
//               Program monitörünün hemen altında program ses şeridi yuvası (audio/).
//   Geçiş       GEÇİŞ (Boşluk), hızlı tür, Son sahneye dön (L). Ayrıntı: Geçişler sekmesi.
//   Alt panel   TEKRAR (vurgulu, ilk) · Maç yönetimi · Sahneler (kaynaklar sahnelerin
//               içinden) · Geçişler · Marka & ön ayarlar · Skorbord · Altyazı · Sponsor ·
//               VAR · Röportaj · Özet · Yayın · Ses · LED ekran
//   Ayarlar     dişli → tam sayfa (settings/): yayın, kayıt kalitesi (+10 dk boyut tahmini),
//               tekrar, geçiş, LED, görünüm, kısayol düğmeleri, klavye kısayolları, bildirimler
//
// Görüntü yolu: kaynaklar → PROGRAM tuvali (+ grafikler, sahneye göre süzülür) →
// captureStream → MediaRecorder (+ WebAudio karışımı) → studio.pushChunk → ana süreç
// ffmpeg → RTMP (+ isteğe bağlı tam maç yerel kaydı, ayrı kalitede). Özel kipler
// (tekrar / VAR / röportaj) önce ÖNİZLEME'de, Geçiş'le PROGRAM'a (modesRef).
//
// Kare başına değişen her şey (fps, ölçerler, küçük resimler, sürüklenen kutu)
// ref'lerde ve yaprak bileşenlerde durur; alt panellere kimliği sabit işlevler
// verilir — açık açılır menüler kapanmaz, program tuvali sabit hızda çizilir.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon, Kbd, Modal, useConfirm, useToast } from "../../components/ui";
import { setLeaveGuard } from "../../lib/leaveGuard";
import {
  addLayer, addScene, addSource, duplicateScene, loadScenesConfig, moveLayerTo, moveSceneTo, multiviewTiles, readySceneOf,
  removeLayer, removeScene, removeSource, renameScene, resolveScene, saveScenesConfig, sceneAtHotkey, sceneFromSource, sceneFromTemplate,
  sourceUsage, startSceneCountdowns, updateLayer, updateSource,
} from "../../lib/studio/scenes";
import { backupIngestUrl, encodingPreset, ingestUrl, keyAction, normalizeEncoding, reusableStream, statusPill } from "../../lib/studio/broadcast";
import { TRANSITION_KINDS, transitionKind, transitionMs } from "../../lib/studio/transitions";
import { DEFAULT_BRANDING } from "../../lib/studio/stinger";
import { micWarning } from "../../lib/studio/var";
import { FIXED_SHORTCUTS, WORKSPACES, workspaceOf } from "../../lib/studio/scenesWorkspace";
import { loadStage, presetForWorkspace, presetTiles, saveStage, setTileOpts, stageHasPreview } from "../../lib/studio/stageGrid";
import { scorerLines } from "../../lib/studio/scorebug";
import { eventLabel, isGoalCode, timerNowMs } from "../../lib/studio/match";
import { PROGRAM_ANGLE, anglesOf, anglesToRecord, buildReplayQueue, defaultAngles, metaFor, recordableSources, replayBanner, replayTitle } from "../../lib/studio/replays";
import { useLiveMatch } from "./useLiveMatch";
import { useStudioSources } from "./useStudioSources";
import { useAudioMixer } from "./useAudioMixer";
import { bugVariantOf, drawBug, useCanvasImage, useCompositor } from "./useCompositor";
import { drawScene } from "./draw";
import { useEngine } from "./useEngine";
import { useYoutube } from "./useYoutube";
import { useReplays } from "./useReplays";
import { useAngleRecorders } from "./useAngleRecorders";
import { useReplayPlayer } from "./useReplayPlayer";
import { useHighlights } from "./useHighlights";
import { useStable } from "./useStable";
import { errorText } from "./studioApi";
import { tileWarning, useTileRenderer } from "./Multiview";
import Dock, { clampDock } from "./Dock";
import { SourceDialog } from "./SourcesPanel";
import ReplayPanel from "./ReplayPanel";
import HighlightsPanel from "./HighlightsPanel";
import BroadcastPanel from "./BroadcastPanel";
import AudioPanel from "./AudioPanel";
import PlayerPicker from "./PlayerPicker";
import { ManageDock } from "./manage";
import Monitor from "./scenes/Monitor";
import { SceneEditor, ScenesTab, TemplateDialog, TemplateGallery } from "./scenes/ScenesPanel";
import StageGrid, { StagePresetPicker } from "./stage/StageGrid";
import { AnglesTile, ClockTile, LedMonitor, MetersTile, SceneCell, SceneCellPicker, ScenesStrip } from "./stage/StageTiles";
import ReplayPreviewOverlay from "./modes/ReplayPreviewOverlay";
import TransitionPanel from "./scenes/TransitionPanel";
import TransitionsTab from "./scenes/TransitionsTab";
import FullscreenView from "./scenes/FullscreenView";
import ShortcutRail, { useRail } from "./shortcuts/ShortcutRail";
import EventEntry from "./shortcuts/EventEntry";
import HealthChip from "./scenes/HealthChip";
import { useChapters, useLowBitrate, useSilenceWatch } from "./scenes/useOperatorAlerts";
import { goalScoreAfter, isOwnGoalCode } from "./youtube/chapters"; // [bölüm] gol bölümü: skor + golcü
import { createGoalTaps } from "./youtube/goalTaps"; // [bölüm] GOL'e basılan anlar
import { useYoutubeStart } from "./youtube/YoutubeStartDialog"; // [medya] YouTube başlatma penceresi
import { audioInputFromDraft } from "../../lib/studio/audio"; // [medya] ek ses kaynağı (aygıt / dosya)
import { interviewClock, useInterview } from "./scenes/useInterview";
import { BrandTab, LinksPanel, PresetsTab, ScoreboardTab, SponsorPanel, SubtitlePanel, drawGraphicsSafe, hasGraphics, useGraphicsSafe } from "./scenes/graphicsBridge";
import { StudioAudioPanel, hasModes, useBroadcastModesSafe, useStudioAudioMod } from "./scenes/modesBridge";
import { useVar } from "./var/useVar";
import VarPanel from "./var/VarPanel";
// ── gol müziği + röportaj inceleme penceresi (reji ekibi) ──
import { InterviewReviewHost } from "./modes/InterviewPanel";
import { useLed } from "./led/useLed";
import LedPanel from "./led/LedPanel";
import SettingsPage from "./settings/SettingsPage";
import { useStudioSettings } from "./settings/useStudioSettings";
import { HOTKEY_ACTIONS, keyText, localRecordOptions, recordEstimate, recordQualityOf } from "./settings/settings";
import logoInline from "../../assets/elitlig-beyaz.png?inline";
import "./studio.css";

// Paralel geliştirilen isteğe bağlı modüller (yoksa yapı bozulmaz, yuva boş kalır):
//   ./audio/ProgramAudioStrip.jsx  <ProgramAudioStrip mixer config programIds />  (program monitörünün altı)
//   ./goalmusic/index.js           useGoalMusic(opts) → { play(side?), stop(), playing, … } · <GoalMusicButtons goalMusic compact />
const firstMod = (mods) => Object.values(mods)[0] || null;
const audioStripMod = firstMod(import.meta.glob("./audio/ProgramAudioStrip.jsx", { eager: true }));
const ProgramAudioStrip = audioStripMod?.default || audioStripMod?.ProgramAudioStrip || null;
const goalMusicMod = firstMod(import.meta.glob(["./goalmusic/index.js", "./goalmusic/index.jsx"], { eager: true }));
const useGoalMusicMod = typeof goalMusicMod?.useGoalMusic === "function" ? goalMusicMod.useGoalMusic : null;
const GoalMusicButtons = goalMusicMod?.GoalMusicButtons || null;
const useNoGoalMusic = () => null;
const useGoalMusicSafe = useGoalMusicMod || useNoGoalMusic;

const PREFS_KEY = "studio.prefs.v1";
const MATCH_KEY = "studio.match";
const OLD_TABS = { mac: "yonetim", reji: "yonetim", olay: "yonetim", olaylar: "yonetim", tekrar: "tekrar", yayin: "yayin", ses: "ses", onayar: "marka", kaynak: "sahne" };
const DEFAULT_PREFS = {
  encoding: { resolution: "720p", fps: 30, bitrateKbps: 2500 },
  transition: "fade",
  transitionMs: {},
  studioMode: true,
  workspace: "classic",
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
      workspace: workspaceOf(p.workspace).key,
      replayRate: Number(p.replayRate) || (p.slowMo ? 0.5 : 1),
      transition: TRANSITION_KINDS.some((t) => t.key === p.transition) ? p.transition : "fade",
      angles: { ...DEFAULT_PREFS.angles, ...(p.angles || {}) },
      localRec: { ...DEFAULT_PREFS.localRec, ...(p.localRec || {}) },
      // [medya] karıştırıcının tüm ayarları (şeritler, yönlendirme, sahne başına ses, tümünü kapat) kalıcı
      audio: { ...(p.audio && typeof p.audio === "object" ? p.audio : {}), mic: { ...DEFAULT_PREFS.audio.mic, ...(p.audio?.mic || {}) }, inputs: Array.isArray(p.audio?.inputs) ? p.audio.inputs : [] },
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

/** Kısayol yardımı: Ayarlar › Kısayollar'daki güncel tuşlar + sabit tuşlar. */
function HelpModal({ hotkeys, onClose }) {
  return (
    <Modal title="Klavye kısayolları" onClose={onClose} width={560} className="st-modal">
      <dl className="st-keys">
        {HOTKEY_ACTIONS.filter((a) => (hotkeys[a.key] || []).length).map((a) => <React.Fragment key={a.key}><dt>{(hotkeys[a.key] || []).map((k) => <Kbd key={k}>{keyText(k)}</Kbd>)}</dt><dd>{a.label}</dd></React.Fragment>)}
        {FIXED_SHORTCUTS.map(([k, v]) => <React.Fragment key={k}><dt><Kbd>{k}</Kbd></dt><dd>{v}</dd></React.Fragment>)}
      </dl>
      <p className="st-hint">Tuşları Ayarlar › Kısayollar'dan değiştirebilirsin.</p>
    </Modal>
  );
}

export default function Studio({ auth, go }) {
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
  const setAnglePref = useCallback((v) => setPref("angles", v), [setPref]);
  const { settings, set: setSetting, reset: resetSettings } = useStudioSettings(prefs);

  /* ───────── sahne alanı ızgarası (stage/StageGrid, lib/studio/stageGrid.js) ───────── */
  // Monitörler ve araç kutuları hücre ızgarasında; hazır düzenler eski çalışma alanı anahtarlarına eşlenir.
  const [stage, setStage] = useState(() => loadStage(store, prefs.workspace));
  const [stageEdit, setStageEdit] = useState(false);
  useEffect(() => { saveStage(store, stage); }, [stage]);
  const wsSeenRef = useRef(prefs.workspace);
  useEffect(() => {
    // Ayarlar'dan (ya da eski kayıttan) çalışma alanı değişirse eşlenen hazır düzen uygulanır.
    if (wsSeenRef.current === prefs.workspace) return;
    wsSeenRef.current = prefs.workspace;
    const key = presetForWorkspace(prefs.workspace);
    setStage((st) => (st.preset === key && !st.custom ? st : { ...st, preset: key, custom: false, tiles: presetTiles(key) }));
  }, [prefs.workspace]);
  const applyPreset = useCallback((key) => {
    setStage((st) => ({ ...st, preset: key, custom: false, tiles: presetTiles(key) }));
    if (WORKSPACES.some((w) => w.key === key)) { wsSeenRef.current = key; setPref("workspace", key); }
  }, [setPref]);

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
  const setAudio = useCallback((fn) => setPref("audio", fn), [setPref]);
  // Ses: özel kip modülü yeni karıştırıcıyı getiriyorsa o (modül sabiti: kanca sırası değişmez), yoksa eskisi.
  const programIds = useMemo(() => (config.scenes.find((s) => s.id === config.programSceneId)?.layers || []).map((l) => l.sourceId), [config.scenes, config.programSceneId]);
  const mixer = useStudioAudioMod
    ? useStudioAudioMod({ sources: { list: config.sources, runtimeRef: src.runtimeRef, programIds, programSceneId: config.programSceneId, scenes: config.scenes }, settings: { value: prefs.audio, onChange: setAudio } }) // eslint-disable-line react-hooks/rules-of-hooks
    : useAudioMixer({ mic: prefs.audio.mic, inputs: prefs.audio.inputs, replayEls, replayAudio: prefs.replayAudio }); // eslint-disable-line react-hooks/rules-of-hooks
  const muted = typeof mixer.micMuted === "boolean" ? mixer.micMuted : Boolean(prefs.audio.mic?.muted);
  const legacyToggleMic = useCallback(() => setAudio((a) => ({ ...a, mic: { ...a.mic, muted: !a.mic.muted } })), [setAudio]);
  const toggleMic = mixer.toggleMic || legacyToggleMic;

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
  // ── gol müziği (goalmusic/): yalnız hoparlör, yayına gitmez; ayarlar Reji'de ──
  // ── /gol müziği ──
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
      drawGraphicsSafe(ctx, { width: info.width, height: info.height, now: Date.now(), sceneId: info.sceneId ?? null }, snap);
      return;
    }
    const bug = bugRef.current;
    if (!bug) return;
    drawBug(ctx, bugVariantOf(configRef.current), { ...bug, clockMs: bug.clockAt(Date.now()), event: info.event || bug.event }, info.width, info.height, imagesRef.current);
  };

  const modesRef = useRef({ previewOverride: null, programOverride: null });
  const comp = useCompositor({ width: preset.width, height: preset.height, fps: preset.fps, configRef, runtimeRef: src.runtimeRef, overlayRef, replayRef, varRef, brandRef, overrideRef, previewGraphicsRef, matchClockRef, modesRef });

  /* ───────── kodlayıcı ve YouTube ───────── */
  const onEngineError = useCallback((m) => toast(m, { tone: "error", timeout: 6000 }), [toast]);
  const engine = useEngine({ getVideoTrack: comp.getVideoTrack, getAudioTrack: mixer.audioTrack, onError: onEngineError });
  const yt = useYoutube(matchId, { encodingLive: engine.mode === "live" && engine.active });
  const hl = useHighlights(matchId);
  const [busy, setBusy] = useState(false);
  const [startedVia, setStartedVia] = useState(null); // "youtube" | "manual" | "rehearsal"

  const begin = useCallback(async (url, backupUrl = null) => {
    mixer.resume();
    const localRecord = localRecordOptions(settings.record, { streamVideoKbps: preset.videoBitrateKbps, streamHeight: preset.height });
    await engine.start({ url, backupUrl, preset, localRecord, stream: settings.stream, matchId, matchName: live.match ? `${live.homeName} – ${live.awayName}` : null });
  }, [engine, mixer, preset, settings.record, settings.stream, matchId, live.match, live.homeName, live.awayName]);

  // [medya] "Yayını başlat" → YouTube ayarları penceresi (youtube/) → startYoutubeWith(ayarlar).
  const startYoutubeWith = async (ytSettings) => {
    if (!matchId) { toast("Önce Maç yönetimi sekmesinden maç aç.", { tone: "warn" }); return; }
    setBusy(true);
    try {
      const open = reusableStream(yt.stream) ? yt.stream : await yt.open(ytSettings || undefined);
      const url = ingestUrl(open);
      if (!url) throw new Error("YouTube yayın adresi alınamadı.");
      await begin(url, backupIngestUrl(open));
      setStartedVia("youtube");
      toast("Görüntü YouTube'a gönderiliyor. Yayın birkaç saniye içinde canlıya geçer.", { tone: "success", timeout: 5000 });
      setTimeout(() => live.refresh?.(), 8000); // match_video sunucuda yazılınca onay çipi görünür
    } catch (e) {
      toast(errorText(e, "YouTube yayını açılamadı."), { tone: "error", timeout: 6000 });
    } finally { setBusy(false); }
  };
  const ytStart = useYoutubeStart({ yt, matchId, match: live.match, homeName: live.homeName, awayName: live.awayName, toast, canResume: reusableStream(yt.stream), onStart: startYoutubeWith });
  const startYoutube = ytStart.request;
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
    try { await chapters.sync.flush?.(); /* [bölüm] son durum YouTube'a */ await engine.stop(); } finally { setBusy(false); }
  };
  const endYoutube = async () => {
    if (!(await ask({ title: "Yayını bitir", message: "Görüntü kesilir ve YouTube yayını kapatılır. Kayıt kanalda kalır.", confirmLabel: "Bitir", danger: true }))) return;
    setBusy(true);
    try {
      await chapters.sync.flush?.(); // [bölüm] son bölümler YouTube yayını kapanmadan gider
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
    return ask({ title: "Programdan çık", message: "Yayın/kayıt sürüyor. Çıkarsanız yayın kopabilir. Emin misiniz?", confirmLabel: "Evet, çık", danger: true });
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
    replays.capture({ kind: "moment", angles: liveAngles, label: "Önemli an", seconds: settings.replay.seconds, meta: { minute: live.match ? live.minute : null, period: live.period } });
    toast(`Önemli an kaydedildi (son ${settings.replay.seconds} sn).`, { tone: "success", timeout: 2500 });
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
  const legacyMicWarning = micWarning({ varActive: vr.active, micMuted: muted });

  /* ───────── röportaj, LED ───────── */
  const iv = useInterview({ matchId, graphics: g, encoding: engine.active, toast });
  const programIdRef = useRef(config.programSceneId);
  programIdRef.current = config.programSceneId;
  const graphicsSnapRef = useRef(null);
  graphicsSnapRef.current = g?.snapshot ?? null;
  const previewIdRef = useRef(config.previewSceneId);
  previewIdRef.current = config.previewSceneId;
  const led = useLed({ configRef, programIdRef, previewIdRef, graphicsRef: graphicsSnapRef, brandingRef, matchId, ledMode: g?.ledMode, programId: config.programSceneId, previewId: config.previewSceneId });
  const ledId = led.status.open && led.studioMode ? led.targetId : null;

  const removeReplay = useStable(async (r) => {
    if (!(await ask({ title: "Tekrarı sil", message: "Bu tekrar ve tüm açılarının dosyaları bu bilgisayardan silinsin mi? Profile yüklenen gol videosu kalır.", confirmLabel: "Sil", danger: true }))) return;
    replays.remove(r.id);
  });
  /** Maç yönetiminden bir tekrarı oynat (seçili açılarla, yayına). */
  const playReplay = useStable((r) => {
    if (!r) return;
    if (hasModes && modes.openReplay) { modes.openReplay(r); setPref("tab", "mode:tekrar"); return; }
    const item = replays.replays.find((x) => x.id === r.id) || r;
    player.play(buildReplayQueue([item], { [item.id]: defaultAngles(item, liveAngles) }));
  });

  /* ───────── uyarılar, bölümler ───────── */
  const chapters = useChapters(matchId, engine.since, { mode: engine.mode, active: engine.active, broadcastId: yt.stream?.broadcast_id || null }); // [medya] YouTube'a kendiliğinden gönderim
  const silentMs = useSilenceWatch({ getAnalyser: () => mixer.micAnalyser(true), active: engine.active && engine.mode === "live", enabled: settings.notify.silence, limitSec: settings.notify.silenceSec });
  useLowBitrate({ status: engine.status, targetKbps: preset.videoBitrateKbps, active: engine.active, enabled: settings.notify.lowBitrate, toast });
  const addChapter = useStable(() => {
    if (!engine.active) { toast("Bölüm işareti için yayın ya da prova açık olmalı.", { tone: "warn" }); return; }
    const sc = resolveScene(configRef.current, configRef.current.programSceneId);
    chapters.add(sc?.name ? sc.name : "Bölüm");
    toast("Bölüm işareti eklendi (Yayın sekmesi › YouTube bölümleri).", { tone: "success", timeout: 2200 });
  });

  /* ───────── program / önizleme ───────── */
  const ws = workspaceOf(prefs.workspace);
  const studioMode = Boolean(prefs.studioMode) && stageHasPreview(stage.tiles);
  const tKind = transitionKind(prefs.transition);
  const tMs = transitionMs(tKind.key, prefs.transitionMs);

  /* ───────── özel kipler (tekrar / VAR / röportaj / özet — ../modes) ───────── */
  const sceneList = useMemo(() => config.scenes.map((s) => ({ id: s.id, name: s.name })), [config.scenes]);
  const drawProgramScene = useCallback((ctx, W, H, now) => {
    const cfg = configRef.current;
    drawScene(ctx, resolveScene(cfg, cfg.programSceneId), cfg.sources, src.runtimeRef.current, W, H, { now, matchClockMs: matchClockRef.current?.() ?? null });
  }, [src.runtimeRef]);
  const setModesPref = useCallback((fn) => setPref("modes", fn), [setPref]);
  const modes = useBroadcastModesSafe({
    engine: { active: engine.active, mode: engine.mode, program: comp.program, drawScene: drawProgramScene },
    live, g, matchId, imagesRef, toast, ask,
    sources: { list: config.sources, runtimeRef: src.runtimeRef, programIds },
    scenes: config.scenes,
    settings: { value: prefs.modes, onChange: setModesPref },
    studioSettings: settings,
    audio: mixer,
    replays: { ...replays, recordAngles: liveAngles, anglePref: prefs.angles, onAnglePref: setAnglePref, angleStatus: angleRec.status, angleAvailable: angleRec.available, encoding: engine.active, onMoment: captureMoment, onRemove: removeReplay, seconds: settings.replay.seconds },
  });
  // Üst çubuk / kısayollar: modül varsa tekrar, VAR ve röportaj onun.
  const R = hasModes && modes.replay ? modes.replay : null;
  const V = hasModes && modes.var ? modes.var : null;
  const replayPlaying = R ? Boolean(R.playing) : player.playing;
  const varActive = V ? Boolean(V.active) : vr.active;
  const toggleVar = V ? V.toggle : vr.toggle;
  const interview = hasModes && modes.interview ? modes.interview : iv;
  const showMicWarning = settings.notify.micOpen && (hasModes ? Boolean(modes.micWarning) || legacyMicWarning : legacyMicWarning);
  const stopReplay = useStable(() => { if (R) R.stop(); else player.stop(true); });
  const playLatestAny = useStable(() => { if (R) R.playLatest(); else playLatest(); });
  modesRef.current = { previewOverride: modes.previewOverride || null, programOverride: modes.programOverride || null };

  /* ───────── gol müziği (isteğe bağlı modül: ./goalmusic) ───────── */
  const goalMusic = useGoalMusicSafe({ homeTeamId: live.homeTeamId, awayTeamId: live.awayTeamId, homeName: live.homeName, awayName: live.awayName, matchId, live, toast });

  const restartVideosIn = useCallback((sceneId) => {
    const sc = resolveScene(configRef.current, sceneId);
    for (const l of sc?.layers || []) {
      const s = configRef.current.sources.find((x) => x.id === l.sourceId);
      if (s?.kind !== "video" || s.restartOnShow === false) continue;
      const el = src.runtimeRef.current.get(s.id)?.el;
      if (el instanceof HTMLVideoElement) { try { el.currentTime = 0; el.play().catch(() => {}); } catch { /* yoksay */ } }
    }
  }, [src.runtimeRef]);

  // "Son sahneye dön": yayından düşen sahneler (en yeni başta).
  const historyRef = useRef([]);
  const [lastSceneId, setLastSceneId] = useState(null);
  const pushHistory = (fromId, toId) => {
    if (!fromId || fromId === toId) return;
    historyRef.current = [fromId, ...historyRef.current.filter((x) => x !== fromId && x !== toId)].slice(0, 10);
    setLastSceneId(historyRef.current[0] || null);
  };

  /** Özel kip önizlemedeyse Geçiş onu yayına alır (karıştırıcı geçişi yapar). */
  // Kip geçişi kendisi çizer (programOverride.draw + drawBase); karıştırıcı yalnız çağırır.
  const takeMode = useStable(() => {
    if (!modes.previewOverride) return false;
    try { Promise.resolve(modes.takeToAir?.({ kind: tKind.key, ms: tMs })).catch(() => {}); } catch { /* yoksay */ }
    return true;
  });

  const toProgram = useStable((id) => {
    const cfg = configRef.current;
    if (!id && modes.previewOverride && takeMode()) return;
    const target = id || cfg.previewSceneId;
    if (!target) return;
    const swap = (c) => startSceneCountdowns({ ...c, programSceneId: target, previewSceneId: studioMode ? (target === c.previewSceneId && !id ? c.programSceneId : c.previewSceneId) : target }, target);
    if (modes.isOnAir || modes.programOverride) {
      // Özel kipten sahneye dön: kip çıkış geçişini kendisi çizer (öbür ucu drawBase = yeni program sahnesi).
      try { if (modes.endOnAir) modes.endOnAir({ kind: tKind.key, ms: tMs }); else modes.onTransitionTake?.(target); } catch { /* yoksay */ }
      restartVideosIn(target); pushHistory(cfg.programSceneId, target); setConfig(swap); return;
    }
    if (vr.active) { vr.exit(); restartVideosIn(target); pushHistory(cfg.programSceneId, target); setConfig(swap); return; }
    if (player.playing) { restartVideosIn(target); pushHistory(cfg.programSceneId, target); setConfig(swap); player.stop(true); return; }
    if (target === cfg.programSceneId) return;
    restartVideosIn(target);
    comp.startTransition(cfg.programSceneId, target, tKind.key, tMs);
    pushHistory(cfg.programSceneId, target);
    setConfig(swap);
  });
  const toPreview = useStable((id) => {
    if (!studioMode) { toProgram(id); return; }
    setConfig((c) => ({ ...c, previewSceneId: id }));
  });
  const backToLastScene = useStable(() => {
    const id = historyRef.current.find((x) => configRef.current.scenes.some((s) => s.id === x));
    if (id) toProgram(id);
  });
  const previewScene = resolveScene(config, config.previewSceneId);
  const programScene = resolveScene(config, config.programSceneId);
  const tiles = useMemo(() => multiviewTiles(config), [config]);
  const registerTile = useTileRenderer(configRef, src.runtimeRef);

  /* ───────── sahne / katman / kaynak işlemleri (kimliği sabit) ───────── */
  const [selectedLayerId, setSelectedLayerId] = useState(null);
  const [editSceneId, setEditSceneId] = useState(null); // isteğe bağlı TAM EKRAN düzenleyici
  const [inlineSceneId, setInlineSceneId] = useState(null); // Sahneler sekmesinde yanda katman paneli
  const [gallery, setGallery] = useState(null); // "Yeni sahne ekle" penceresi { anchor }
  const [tplKey, setTplKey] = useState(null);
  const [dialog, setDialog] = useState(null); // { initial, toScene }
  const [settingsSection, setSettingsSection] = useState(null); // açıkken bölüm anahtarı
  const closeDialog = useCallback(() => setDialog(null), []);
  const closeEditor = useCallback(() => { setEditSceneId(null); setSelectedLayerId(null); overrideRef.current = null; }, []);

  const saveSource = useStable((draft) => {
    const toScene = dialog?.toScene || null;
    setDialog(null);
    const { angleOptions, ...clean } = draft;
    void angleOptions;
    if (clean.kind === "audio") {
      setAudio((a) => ({ ...a, inputs: [...(a.inputs || []), audioInputFromDraft(clean)] })); // [medya] aygıt ya da ses / video dosyası
      setPref("tab", "ses");
      toast("Ses girişi Ses sekmesine eklendi.", { tone: "success" });
      return;
    }
    if (clean.id) {
      setConfig((c) => updateSource(c, clean.id, { ...clean, nonce: clean.kind === "screen" || clean.kind === "window" ? Date.now() : clean.nonce }));
      return;
    }
    // Kaynak eklemek sahne OLUŞTURMAZ: kitaplığa girer (düzenleyiciden açıldıysa o sahneye katman olur).
    const { config: c1, source } = addSource(configRef.current, clean);
    if (toScene) {
      const { config: c2, layer } = addLayer(c1, toScene, source.id);
      setSelectedLayerId(layer.id);
      setConfig(c2);
      return;
    }
    setConfig(c1);
    toast(`“${source.name}” kaynaklara eklendi. Yayına vermek için bir sahneye ekle.`, { tone: "success", timeout: 6000, action: { label: "Bu kaynaktan sahne oluştur", run: () => sceneActions.onSceneFromSource(source.id) } });
  });
  const deleteSource = useStable(async (s) => {
    const used = sourceUsage(configRef.current, s.id);
    if (!(await ask({ title: "Kaynağı sil", message: used.length ? `“${s.name}” kaynaklardan silinir ve şu sahnelerden çıkarılır: ${used.join(", ")}.` : `“${s.name}” silinsin mi?`, confirmLabel: "Sil", danger: true }))) return;
    if (s.url && String(s.url).startsWith("blob:")) URL.revokeObjectURL(s.url);
    setConfig((c) => removeSource(c, s.id));
  });
  const deleteScene = useStable(async (sc) => {
    if (configRef.current.scenes.length <= 1) return;
    if (sc.id === configRef.current.programSceneId && engine.active) { toast("Yayındaki sahne silinemez: önce başka bir sahneyi yayına al.", { tone: "warn" }); return; }
    if (!(await ask({ title: "Sahneyi sil", message: `“${sc.name}” silinsin mi? Kaynaklar silinmez.`, confirmLabel: "Sil", danger: true }))) return;
    if (editSceneId === sc.id) closeEditor();
    if (inlineSceneId === sc.id) setInlineSceneId(null);
    setConfig((c) => removeScene(c, sc.id));
  });
  const recordable = useMemo(() => recordableSources(config.sources).map((s) => ({ id: s.id, name: s.name })), [config.sources]);
  const newSource = useStable((opts) => setDialog({ initial: { angleOptions: recordable }, toScene: opts?.toScene || null }));
  const editSource = useStable((s) => setDialog({ initial: { ...s, angleOptions: recordable } }));
  const placeNewScene = (next, scene, { edit = false } = {}) => {
    if (!scene) return next;
    // Yeni sahne seçilir: katmanları Sahneler sekmesinde yandaki panelde (açılır pencere yok).
    setTimeout(() => { setInlineSceneId(scene.id); setSelectedLayerId(null); if (edit) setPref("tab", "sahne"); }, 0);
    return studioMode ? { ...next, previewSceneId: scene.id } : next;
  };
  const createFromTemplate = useStable((key, opts) => {
    setTplKey(null);
    setConfig((c) => { const { config: next, scene } = sceneFromTemplate(c, key, opts); return placeNewScene(next, scene); });
    toast("Sahne oluşturuldu ve önizlemeye alındı. Katmanları Sahneler sekmesinde yandaki panelden değiştirebilirsin.", { tone: "success", timeout: 4000 });
  });
  const onTemplate = useStable((key) => {
    if (key === "empty") { setConfig((c) => { const { config: next, scene } = addScene(c); return placeNewScene(next, scene, { edit: true }); }); return; }
    setTplKey(key);
  });
  const openGallery = useCallback((anchor) => setGallery({ anchor: anchor || null }), []);
  // Hazır ekranlar: varsa önizlemeye (ya da yayına), yoksa şablondan oluşturulur.
  const onReady = useStable((key, air = false) => {
    let id = readySceneOf(configRef.current, key)?.id || null;
    if (!id) {
      const { config: next, scene } = sceneFromTemplate(configRef.current, key);
      if (!scene) return;
      id = scene.id;
      configRef.current = next;
      setConfig(next);
      toast(`“${scene.name}” ekranı oluşturuldu. Görünümünü Sahneler › Düzenle'den değiştirebilirsin.`, { tone: "info", timeout: 4000 });
    }
    if (air || !studioMode) toProgram(id); else toPreview(id);
  });
  const readyIds = useMemo(() => ({ start: readySceneOf(config, "start")?.id, break: readySceneOf(config, "break")?.id, end: readySceneOf(config, "end")?.id }), [config]);

  const sceneActions = useMemo(() => ({
    onPreview: toPreview,
    onProgram: toProgram,
    onToLed: (id) => { led.toScene(id); },
    // Düzenle: Sahneler sekmesinde seç, katmanlar yanda (açılır pencere yok). Tam ekran isteğe bağlı.
    onEdit: (id) => { setSelectedLayerId(null); setInlineSceneId(id); setPref("tab", "sahne"); },
    onEditFull: (id) => { setInlineSceneId(id); setEditSceneId(id); },
    onTemplate,
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
    onSceneFromSource: (sourceId) => {
      setConfig((c) => { const { config: next, scene } = sceneFromSource(c, sourceId); return placeNewScene(next, scene); });
      toast("Kaynaktan sahne oluşturuldu ve önizlemeye alındı.", { tone: "success", timeout: 3000 });
    },
  }), [deleteScene, editSource, led, newSource, onTemplate, studioMode, toPreview, toProgram]); // eslint-disable-line react-hooks/exhaustive-deps

  const tileMenu = useCallback((t) => {
    const i = configRef.current.scenes.findIndex((s) => s.id === t.id);
    const n = configRef.current.scenes.length;
    return [
      { label: "Düzenle (katmanlar yanda)", icon: "pencil", onClick: () => sceneActions.onEdit(t.id) },
      { label: "Tam ekran düzenle…", icon: "overview", onClick: () => sceneActions.onEditFull(t.id) },
      { label: "Önizlemeye al", icon: "eye", onClick: () => toPreview(t.id) },
      { label: "Yayına al", icon: "play", onClick: () => toProgram(t.id) },
      { label: "LED'e ver", icon: "overview", onClick: () => sceneActions.onToLed(t.id) },
      "-",
      { label: "Çoğalt", icon: "copy", onClick: () => sceneActions.onDuplicateScene(t.id) },
      { label: "Sola / yukarı taşı", icon: "chevronLeft", disabled: i <= 0, onClick: () => sceneActions.onMoveScene(t.id, i - 1) },
      { label: "Sağa / aşağı taşı", icon: "chevronRight", disabled: i >= n - 1, onClick: () => sceneActions.onMoveScene(t.id, i + 1) },
      "-",
      { label: "Sahneyi sil", icon: "trash", danger: true, disabled: n <= 1, onClick: () => { const sc = configRef.current.scenes.find((s) => s.id === t.id); if (sc) deleteScene(sc); } },
    ];
  }, [deleteScene, sceneActions, toPreview, toProgram]);

  const libActions = useMemo(() => ({
    onNewSource: () => newSource(),
    onEditSource: editSource,
    onRemoveSource: deleteSource,
    onReacquire: src.reacquire,
    onRequestAccess: src.requestAccess,
    onSceneFromSource: sceneActions.onSceneFromSource,
    onAddToScene: (s, sceneId) => { sceneActions.onAddLayer(sceneId, s.id); toast(`“${s.name}” sahneye eklendi.`, { tone: "success", timeout: 2500, action: { label: "Düzenle", run: () => sceneActions.onEdit(sceneId) } }); },
  }), [deleteSource, editSource, newSource, sceneActions, src.reacquire, src.requestAccess, toast]);
  const setVariant = useCallback((variant) => setConfig((c) => ({ ...c, overlay: { ...c.overlay, variant } })), []);

  /* ───────── olay girişi (G sonra H / A kısayolu) ───────── */
  const [picker, setPicker] = useState(null);
  const [saving, setSaving] = useState(false);
  // [bölüm] GOL'e basılan anlar → gol bölümü (basıştan 15 sn önce başlar, 45 sn).
  const goalTapsRef = useRef(null);
  if (!goalTapsRef.current) goalTapsRef.current = createGoalTaps();
  const addGoalChapter = useStable(({ side, code, playerId, playerName, created } = {}) => {
    if (!engine.active) return;
    const at = goalTapsRef.current.take(side) ?? Date.now();
    const sc = goalScoreAfter({ events: live.events, created, homeTeamId: live.homeTeamId, awayTeamId: live.awayTeamId, manual: live.manual, score: live.score, side, code: code || created?.olay_kodu });
    const scorer = playerName || live.nameOf(playerId ?? created?.oyuncu_id) || null;
    chapters.addGoal({ at, goal: { home: live.homeName, away: live.awayName, homeScore: sc.home, awayScore: sc.away, scorer, own: isOwnGoalCode(code || created?.olay_kodu) } });
  });
  const askEvent = useStable((side, code, title) => {
    if (live.status !== "canli") { toast("Maç canlı değil: önce Maç yönetimi › Reji'den maçı başlat.", { tone: "warn", timeout: 4500 }); return; }
    if (isGoalCode(code)) goalTapsRef.current.tap(side); // [bölüm]
    const clipKey = isGoalCode(code) && engine.active ? replays.capture({ kind: "goal", angles: liveAngles, seconds: settings.replay.seconds, meta: { side, code, minute: live.minute, period: live.period } }) : null;
    setPicker({ side, code, title, clipKey });
  });
  // Maç yönetimi › Reji'den girilen goller: GOL'e dokunulduğu AN tekrar kaydı başlar,
  // olay kaydedilince klip olaya ve golcüye bağlanır (yüklenir). Golcü seçimi
  // iptal edilirse 3 dk sonra klip yalnız bu bilgisayarda kalır.
  const dockGoalClipsRef = useRef([]);
  const onDockGoalTap = useStable(({ side, code } = {}) => {
    if (!engine.active || !isGoalCode(code)) return;
    goalTapsRef.current.tap(side); // [bölüm]
    const key = replays.capture({ kind: "goal", angles: liveAngles, seconds: settings.replay.seconds, meta: { side, code, minute: live.minute, period: live.period } });
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
    addGoalChapter({ side, code: code || event?.olay_kodu, playerName, created: event }); // [bölüm]
    const list = dockGoalClipsRef.current;
    // Kendi kalesine golde olayın tarafı GOL'e basılan taraftan farklı olabilir:
    // önce aynı taraf, yoksa bekleyen en eski klip.
    let i = list.findIndex((x) => !side || x.side === side);
    if (i < 0) i = list.length ? 0 : -1;
    if (i < 0) return;
    const [entry] = list.splice(i, 1);
    clearTimeout(entry.timer);
    replays.attach(entry.key, { eventId: Number(event?.id) || null, scorer: playerName || live.nameOf(event?.oyuncu_id), side, code: code || event?.olay_kodu });
  });
  useEffect(() => () => dockGoalClipsRef.current.forEach((x) => clearTimeout(x.timer)), []);
  const askGoal = useStable((side) => {
    if (live.status === "canli") goalMusic?.onGoal?.(side); // ── gol müziği: otomatik çal açıksa ──
    askEvent(side, "GOAL_RIGHT_FOOT", `${side === "home" ? live.homeName : live.awayName} — golü atan`);
  });
  const record = async (playerId) => {
    if (!picker) return;
    setSaving(true);
    try {
      const created = await live.addEvent({ side: picker.side, code: picker.code, playerId });
      if (picker.clipKey) replays.attach(picker.clipKey, { eventId: Number(created?.id) || null, scorer: live.nameOf(playerId), side: picker.side, code: picker.code });
      if (isGoalCode(picker.code)) addGoalChapter({ side: picker.side, code: picker.code, playerId, created }); // [bölüm]
      toast(`${eventLabel(picker.code)} kaydedildi (${live.minute}').`, { tone: "success" });
      setPicker(null);
    } catch (e) {
      toast(errorText(e, "Olay kaydedilemedi."), { tone: "error", timeout: 5000 });
    } finally { setSaving(false); }
  };
  const cancelPicker = useStable(() => {
    if (picker && isGoalCode(picker.code)) goalTapsRef.current.drop(picker.side); // [bölüm]
    if (picker?.clipKey) replays.attach(picker.clipKey, { eventId: null });
    setPicker(null);
  });
  /* "Olay gir" kısayolu (tür → iki takımın oyuncuları): gol türü seçildiği AN klip kaydı başlar. */
  const beginEvent = useStable((code) => {
    if (!isGoalCode(code) || !engine.active) return null;
    goalTapsRef.current.tap(null); // [bölüm]
    return replays.capture({ kind: "goal", angles: liveAngles, seconds: settings.replay.seconds, meta: { code, minute: live.minute, period: live.period } }) || null;
  });
  const submitEvent = useStable(async ({ side, code, playerId, clipKey }) => {
    try {
      const created = await live.addEvent({ side, code, playerId });
      if (clipKey) replays.attach(clipKey, { eventId: Number(created?.id) || null, scorer: live.nameOf(playerId), side, code });
      if (isGoalCode(code)) addGoalChapter({ side, code, playerId, created }); // [bölüm]
      toast(`${eventLabel(code)} kaydedildi (${live.minute}').`, { tone: "success" });
      return created;
    } catch (e) {
      toast(errorText(e, "Olay kaydedilemedi."), { tone: "error", timeout: 5000 });
      throw e;
    }
  });
  const cancelEvent = useStable((clipKey) => { if (clipKey) replays.attach(clipKey, { eventId: null }); });
  const [eventModal, setEventModal] = useState(false);

  /* ───────── kısayollar ───────── */
  const [goalArmed, setGoalArmed] = useState(false);
  const [help, setHelp] = useState(false);
  const [fullscreen, setFullscreen] = useState(null); // "program" | "preview"
  const [monMenu, setMonMenu] = useState(null); // { x, y, target }
  const railPopRef = useRef(null);
  const rail = useRail();
  const keyRef = useRef(null);
  keyRef.current = (e) => {
    if (document.querySelector(".modal-backdrop, .st-pop")) return;
    if (settingsSection) return; // Ayarlar açıkken (tuş atama) stüdyo kısayolları çalışmaz
    if (e.target?.closest?.(".st-edit") && /^Arrow|^Delete$|^Backspace$/.test(e.key)) return;
    const act = keyAction(e, { pendingGoal: goalArmed, hotkeys: settings.hotkeys });
    if (!act) return;
    if (act.type === "goalCancel") { setGoalArmed(false); return; }
    if (editSceneId && act.type !== "mic") return; // düzenleyicide yalnız mikrofon kısayolu
    e.preventDefault();
    if (act.type === "mic") toggleMic();
    else if (act.type === "replay") { if (replayPlaying) stopReplay(); else playLatestAny(); }
    else if (act.type === "moment") captureMoment();
    else if (act.type === "scene") { const id = sceneAtHotkey(configRef.current, act.index); if (id) toPreview(id); }
    else if (act.type === "transition") toProgram();
    else if (act.type === "lastScene") backToLastScene();
    else if (act.type === "chapter") addChapter();
    else if (act.type === "goalArm") setGoalArmed(true);
    else if (act.type === "goal") { setGoalArmed(false); askGoal(act.side); }
    else if (act.type === "var") toggleVar();
    else if (act.type === "help") setHelp((v) => !v);
    else if (act.type === "event") { if (!railPopRef.current?.("event")) setEventModal(true); }
    else if (act.type === "goalHome") askGoal("home");
    else if (act.type === "goalAway") askGoal("away");
    else if (act.type === "goalMusic") { if (goalMusic?.playing) goalMusic.stop?.(); else goalMusic?.play?.(); }
    else if (act.type === "subtitle") { if (g?.matchId) g.setSubtitleOnAir?.(!g.subtitle?.onAir); }
    else if (act.type === "interviewBand") { if (g?.matchId) g.setInterviewOnAir?.(!g.interview?.onAir); }
    else if (act.type === "interview") { if (interview?.recording) interview.stop(); else if (interview?.available && engine.active) interview.start(); }
    else if (act.type === "fullscreen") setFullscreen((f) => (f ? null : "program"));
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

  // Görünüm › açıklama balonları kapalıysa: stüdyo içindeki title balonları gösterilmez.
  const rootRef = useRef(null);
  useEffect(() => {
    const root = rootRef.current;
    if (!root || settings.view.tooltips) return undefined;
    const hide = (e) => {
      const el = e.target?.closest?.("[title]");
      if (el && root.contains(el)) { el.dataset.stTitle = el.getAttribute("title"); el.removeAttribute("title"); }
    };
    root.addEventListener("pointerover", hide, true);
    return () => {
      root.removeEventListener("pointerover", hide, true);
      root.querySelectorAll("[data-st-title]").forEach((el) => { el.setAttribute("title", el.dataset.stTitle); delete el.dataset.stTitle; });
    };
  }, [settings.view.tooltips]);

  /* ───────── çizim ───────── */
  const st = engine.status;
  const onAir = engine.active;
  const variant = bugVariantOf(config);
  const setTab = useCallback((t) => setPref("tab", t), [setPref]);
  const setDockH = useCallback((h) => setPref("dockH", clampDock(h)), [setPref]);
  const setEncoding = useCallback((v) => setPref("encoding", normalizeEncoding(v)), [setPref]);
  const localRec = useMemo(() => ({ enabled: settings.record.enabled, dir: settings.record.dir }), [settings.record.enabled, settings.record.dir]);
  const setLocalRec = useCallback((v) => setSetting("record", { enabled: Boolean(v.enabled), dir: v.dir || null }), [setSetting]);
  const recordInfo = useMemo(() => {
    const e = recordEstimate(settings.record, { streamVideoKbps: preset.videoBitrateKbps, audioKbps: settings.stream.audioKbps });
    return { label: recordQualityOf(settings.record.quality).label, estimate: e.text };
  }, [preset.videoBitrateKbps, settings.record, settings.stream.audioKbps]);
  const openSettings = useCallback((section = "yayin") => setSettingsSection(section), []);
  const matchName = live.match ? `${live.homeName} – ${live.awayName}` : "";
  const exitStudio = useCallback(() => { go?.("today"); }, [go]);

  const gfxProps = { g, matchId, live, scenes: sceneList };
  const modeTabs = hasModes ? (modes.tabs || []).map((t) => ({ key: `mode:${t.key}`, label: t.label, icon: t.icon || "sparkles", count: t.count ?? null, mode: t.key })) : [];
  // TEKRAR en başta ve vurgulu: en sık açılan, en hızlı ulaşılması gereken düzenleme alanı.
  const replayTab = hasModes
    ? { ...(modeTabs.find((t) => t.mode === "tekrar") || { key: "mode:tekrar", label: "Tekrar", icon: "repeat" }), accent: true, count: replays.replays.length || null }
    : { key: "tekrar", label: "Tekrar & Özet", icon: "repeat", count: replays.replays.length || null, accent: true };
  const TABS = [
    replayTab,
    { key: "yonetim", label: "Maç yönetimi", icon: "board" },
    { key: "sahne", label: "Sahneler", icon: "layers", count: config.scenes.length || null },
    { key: "gecis", label: "Geçişler", icon: "swap" },
    ...((BrandTab || PresetsTab) && g ? [{ key: "marka", label: "Marka & ön ayarlar", icon: "palette" }] : []),
    ...(ScoreboardTab && g ? [{ key: "skorbord", label: "Skorbord", icon: "trophy" }] : []),
    ...(SubtitlePanel && g ? [{ key: "altyazi", label: "Altyazı", icon: "list" }] : []),
    ...((SponsorPanel || LinksPanel) && g ? [{ key: "sponsor", label: "Sponsor & linkler", icon: "handshake" }] : []),
    ...(hasModes ? modeTabs.filter((t) => t.mode !== "tekrar") : [{ key: "var", label: "VAR", icon: "target", count: vr.active ? "●" : null }]),
    { key: "yayin", label: "Yayın", icon: "broadcast", count: onAir ? "●" : null },
    { key: "ses", label: "Ses", icon: "mic" },
    { key: "led", label: "LED ekran", icon: "overview", count: led.status.open ? "●" : null },
  ];
  const tab = TABS.some((t) => t.key === prefs.tab) ? prefs.tab : "yonetim";
  const modeTab = tab.startsWith("mode:") ? (modes.tabs || []).find((t) => `mode:${t.key}` === tab) : null;
  const replayTabKey = replayTab.key;

  const programTitle = modes.programOverride ? modes.programOverride.label || "Özel kip" : vr.active ? "VAR kontrolü" : player.playing ? "Tekrar" : programScene?.name || "—";
  const previewTitle = modes.previewOverride ? modes.previewOverride.label || "Özel kip" : previewScene?.name || "—";
  const programIdForTally = player.playing || vr.active || modes.programOverride ? null : config.programSceneId;
  const canTake = Boolean(modes.previewOverride) || config.previewSceneId !== config.programSceneId || player.playing || vr.active || Boolean(modes.programOverride);
  const hints = settings.view.hints;
  const zoom = settings.view.scale / 100;

  /* ───────── monitör sağ tık menüsü ve tam ekran ───────── */
  const onMonitorMenu = (target) => (e) => {
    e.preventDefault();
    const r = rootRef.current?.getBoundingClientRect();
    setMonMenu({ x: (e.clientX - (r?.left || 0)) / zoom, y: (e.clientY - (r?.top || 0)) / zoom, target });
  };
  useEffect(() => {
    if (!monMenu) return undefined;
    const close = (e) => { if (!e.target?.closest?.(".st-rmenu")) setMonMenu(null); };
    const key = (e) => { if (e.key === "Escape") setMonMenu(null); };
    window.addEventListener("mousedown", close, true);
    window.addEventListener("keydown", key, true);
    return () => { window.removeEventListener("mousedown", close, true); window.removeEventListener("keydown", key, true); };
  }, [monMenu]);

  /* ───────── program ses şeridi yuvası (audio/ProgramAudioStrip, başka modül) ───────── */
  const programAudio = ProgramAudioStrip ? <ProgramAudioStrip mixer={mixer} config={config} programIds={programIds} /> : null;
  const hasMetersTile = stage.tiles.some((t) => t.type === "meters");

  /* ───────── önizlemede tekrar düzenleme (modes/ReplayPreviewOverlay) ───────── */
  // Tekrar kipi önizlemedeyken önizleme monitörü düzenleyiciye döner: yakınlaştır / kaydır,
  // zaman çizelgesi, giriş–çıkış, hız; "Yayına al" seçilen bölümü yayına verir.
  const RE = hasModes && modes.replayEditor ? modes.replayEditor : null;
  const replayEditing = Boolean(RE && RE.previewing && RE.rm?.transport);
  const [pvwBox, setPvwBox] = useState({ w: 0, h: 0 });
  const pickAngle = useStable((r, angle) => {
    if (!r) return;
    if (!RE || !modes.openReplay) { toast("Tekrar düzenleme için yayın modları modülü gerekli.", { tone: "info" }); return; }
    if (!RE.previewing || RE.rm.cursor?.replayId !== r.id) modes.openReplay(r);
    RE.rm.setCursor({ replayId: r.id, angle });
  });

  const previewMonitor = (
    <figure className={`st-monitor is-preview ${modes.previewOverride ? "is-mode" : ""} ${replayEditing ? "is-replayedit" : ""}`} onContextMenu={onMonitorMenu("preview")}>
      <figcaption>
        <span className="st-tag is-pvw">ÖNİZLEME</span>
        <span className="st-monitor__name">{previewTitle}</span>
        {replayEditing && <span className="st-monitor__hint">tekerlek: yakınlaştır · sürükle: kaydır · I / O: giriş / çıkış</span>}
        <span className="st-top__spacer" />
        {!modes.previewOverride && previewScene && <button type="button" className="st-monitor__btn" onClick={() => sceneActions.onEdit(previewScene.id)} title="Önizlemedeki sahnenin katmanları (Sahneler sekmesinde, yanda)"><Icon name="pencil" size={11} /> Düzenle</button>}
      </figcaption>
      <Monitor canvas={comp.preview} className="st-monitor__screen" onBox={setPvwBox}>
        {replayEditing && (
          <ReplayPreviewOverlay rm={RE.rm} rate={RE.rate} onRate={RE.setRate} sources={RE.sources || config.sources} box={pvwBox}
            onTake={() => toProgram()} canTake={canTake} />
        )}
      </Monitor>
    </figure>
  );
  const programMonitor = (
    <figure className={`st-monitor is-program ${st.state === "live" ? "is-live" : ""} ${showMicWarning ? "is-micwarn" : ""}`} onContextMenu={onMonitorMenu("program")}>
      <figcaption>
        <span className={`st-tag ${onAir ? "is-live" : "is-pgm"}`}>{onAir ? "● YAYINDA" : "PROGRAM"}</span>
        <span className="st-monitor__name">{programTitle}</span>
        {player.playing && <span className="st-tag is-live">TEKRAR {player.index + 1}/{player.total} · {String(prefs.replayRate).replace(".", ",")}×</span>}
        {vr.active && <button type="button" className="st-tag is-var" onClick={vr.exit} title="VAR'dan çık (V)">VAR · ÇIK</button>}
        {interview?.recording && <span className="st-tag is-live">RÖPORTAJ</span>}
        <span className="st-top__spacer" />
        {ledId && ledId === programIdForTally && <span className="st-tag is-led" title="LED ekran bu sahneyi gösteriyor">LED</span>}
      </figcaption>
      <Monitor canvas={comp.program} className="st-monitor__screen" />
      {/* Program ses şeridi yuvası: ./audio/ProgramAudioStrip.jsx varsa burada (düzende "Ses ölçerleri" kutusu yoksa). */}
      {programAudio && !hasMetersTile && <div className="st-pgmaudio">{programAudio}</div>}
      {showMicWarning && <div className="st-micwarn" role="alert"><Icon name="mic" size={22} /> MİKROFON AÇIK <button type="button" onClick={toggleMic}>Kapat (M)</button></div>}
      {silentMs > 0 && !showMicWarning && (
        <div className="st-silence" role="alert"><Icon name="micOff" size={15} /> Sessiz yayın: {Math.round(silentMs / 1000)} sn'dir ses yok {muted ? <button type="button" onClick={toggleMic}>Mikrofonu aç (M)</button> : <span>— mikrofonu kontrol et</span>}</div>
      )}
      {!live.match && (
        <div className="st-monitor__note"><Icon name="info" size={13} /> {matchId ? (live.error ? live.error.message || "Maç alınamadı." : "Maç yükleniyor…") : "Skorbord ve reji için Maç yönetimi sekmesinden maç aç."}</div>
      )}
    </figure>
  );
  const transition = (layout) => (
    <TransitionPanel layout={layout} studioMode={studioMode} canTake={canTake} takeLabel={modes.previewOverride ? "YAYINA AL" : "GEÇİŞ"} onTake={() => toProgram()}
      lastSceneName={lastSceneId ? resolveScene(config, lastSceneId)?.name : null} onLastScene={backToLastScene}
      tKind={tKind} tMs={tMs} onKind={(k) => setPref("transition", k)} onMore={() => setTab("gecis")} hints={hints} />
  );
  const tileProps = (t) => ({
    tile: t, register: registerTile, studioMode, onAir: t.id === programIdForTally, inPreview: studioMode && !modes.previewOverride && t.id === config.previewSceneId && t.id !== programIdForTally,
    onLed: t.id === ledId, bad: tileWarning(config, src.runtimeRef.current, t), onPreview: toPreview, onProgram: toProgram, onToLed: sceneActions.onToLed, onEdit: sceneActions.onEdit, menu: tileMenu(t),
  });

  /** Izgara kutusunun içeriği (tür başına). Monitörler tek tuvali paylaşır: düzende tekildirler. */
  const renderStageTile = (t) => {
    switch (t.type) {
      case "preview": return studioMode || stageEdit ? previewMonitor : <div className="stg-box"><p className="st-hint" style={{ margin: "auto" }}>Stüdyo modu kapalı: sahneye tık doğrudan yayına.</p></div>;
      case "program": return programMonitor;
      case "transition": return transition(t.w > t.h * 1.2 ? "row" : "column");
      case "scenes": return <ScenesStrip tiles={tiles} tileProps={tileProps} onAddScene={openGallery} version={src.version} />;
      case "scene": return <SceneCell tile={t} tiles={tiles} tileProps={tileProps} onAddScene={openGallery} version={src.version} />;
      case "led": return <LedMonitor led={led} configRef={configRef} runtimeRef={src.runtimeRef} graphicsRef={graphicsSnapRef} matchClockRef={matchClockRef} matchId={matchId} scenes={sceneList} programId={config.programSceneId} previewId={config.previewSceneId} onOpenTab={() => setTab("led")} />;
      case "angles": return <AnglesTile replays={replays.replays} meta={replays.meta} sources={config.sources} cursor={RE?.previewing ? RE.rm.cursor : null} onPick={pickAngle} />;
      case "meters": return <MetersTile strip={programAudio} mixer={mixer} muted={muted} />;
      case "clock": return <ClockTile minute={live.match ? live.minute : null} period={live.match ? live.period : null} />;
      default: return null;
    }
  };
  const stageEditExtra = (t) => (t.type === "scene" ? <SceneCellPicker tile={t} tiles={tiles} onPick={(i) => setStage((s) => ({ ...s, custom: true, tiles: setTileOpts(s.tiles, t.id, { index: i }) }))} /> : null);
  const stageView = <StageGrid stage={stage} onChange={setStage} edit={stageEdit} onEdit={setStageEdit} render={renderStageTile} editExtra={stageEditExtra} />;

  /* ───────── kısayol şeridi bağlamı (parçacıkların okuduğu durum + eylemler) ───────── */
  const latestReplay = replays.latest;
  const pickAngles = (r, angles) => ({ ...r, angles: (r.angles || []).filter((a) => angles.includes(a.angle)) });
  const railCtx = {
    hints, hotkeys: settings.hotkeys, railPopRef, scenes: sceneList, score: live.match ? live.score : null, momentSeconds: settings.replay.seconds,
    live: { onAir, mode: engine.mode, since: engine.since, busy, start: topStart, stop: () => stopEncoder(), openTab: () => setTab("yayin") },
    mic: { muted, toggle: toggleMic, analyser: () => mixer.micAnalyser(true) },
    transition: { canTake, take: () => toProgram(), label: modes.previewOverride ? "YAYINA AL" : "GEÇİŞ", kind: tKind, onKind: (k) => setPref("transition", k), lastSceneName: lastSceneId ? resolveScene(config, lastSceneId)?.name : null, lastScene: backToLastScene },
    chapter: { add: addChapter, count: chapters.chapters.length },
    fullscreen: (target) => setFullscreen(target),
    replay: {
      list: replays.replays, meta: replays.meta, sources: config.sources, recordAngles: liveAngles, playing: replayPlaying,
      previewing: hasModes && modes.previewMode === "tekrar",
      latestInfo: latestReplay ? { title: replayTitle(latestReplay, metaFor(latestReplay, replays.meta)), angles: anglesOf(latestReplay).length } : null,
      preview: (r, angles) => {
        if (hasModes && modes.openReplay) { modes.openReplay(pickAngles(r, angles), { angles }); return; }
        toast("Önizleme için özel kip modülü yok: tekrar doğrudan yayına verilir.", { tone: "info" });
      },
      take: async (r, angles) => {
        if (hasModes && modes.openReplay && modes.takeToAir) {
          modes.openReplay(pickAngles(r, angles), { angles });
          await new Promise((res) => setTimeout(res, 220)); // seçim önizlemeye işlensin
          await modes.takeToAir(null, "tekrar");
          return;
        }
        player.play(buildReplayQueue([r], { [r.id]: angles }));
      },
      stop: stopReplay, playLatest: playLatestAny, openTab: () => setTab(replayTabKey),
    },
    moment: captureMoment,
    var: { active: varActive, toggle: toggleVar },
    event: { live: live.status === "canli", minute: live.match ? live.minute : null, homeName: live.homeName, awayName: live.awayName, squads: live.squads, begin: beginEvent, submit: submitEvent, cancel: cancelEvent },
    goal: (side) => askGoal(side),
    goalMusic, GoalMusicButtons,
    g, variant, setVariant,
    interview,
    led, openLedTab: () => setTab("led"),
    ready: { ids: readyIds, go: onReady },
    sceneTile: { register: registerTile, programId: programIdForTally, previewId: studioMode && !modes.previewOverride ? config.previewSceneId : null, onPreview: toPreview, onProgram: toProgram },
  };
  const railHasGoLive = rail.items.some((x) => x.type === "golive");

  return (
    <div ref={rootRef} className={`studio ws-${ws.key} ${hints ? "" : "no-hints"} ${showMicWarning ? "is-micwarn" : ""}`} style={settings.view.scale !== 100 ? { zoom } : undefined} onPointerDown={mixer.resume}>
      <header className="st-top">
        <div className="st-top__title"><Icon name="broadcast" size={17} strokeWidth={2.2} /><strong>Yayın Stüdyosu</strong></div>
        {live.match
          ? <button type="button" className="st-top__match" onClick={() => setTab("yonetim")} title={`${matchName} — Maç yönetimi`}><b>{live.score.home}–{live.score.away}</b><span>{matchName}</span>{live.match && <small>{live.minute}'</small>}</button>
          : <button type="button" className="st-top__match is-empty" onClick={() => setTab("yonetim")} title="Maç seçmek için Maç yönetimi">Maç seçilmedi</button>}
        <StatusPill state={st.state} since={engine.since} />
        <HealthChip status={st} getStats={comp.getStats} targetFps={preset.fps} encoding={onAir} />
        <span className="st-top__spacer" />
        <StagePresetPicker stage={stage} onPreset={applyPreset} edit={stageEdit} onEdit={setStageEdit} />
        {!railHasGoLive && (
          <button type="button" className={`btn ${onAir ? "" : "btn--red"} st-golive`} disabled={busy} onClick={topStart}>
            <Icon name={onAir ? "stop" : "broadcast"} size={14} /> {onAir ? (engine.mode === "rehearsal" ? "Provayı bitir" : "Yayını durdur") : "Yayını başlat"}
          </button>
        )}
        <span className="st-top__sep" />
        <button type="button" className="icon-btn st-help" onClick={() => setHelp(true)} title="Klavye kısayolları (?)"><Icon name="help" size={16} /></button>
        <button type="button" className={`icon-btn st-gear ${settingsSection ? "is-on" : ""}`} onClick={() => (settingsSection ? setSettingsSection(null) : openSettings())} title="Stüdyo ayarları"><Icon name="sliders" size={16} /></button>
        <button type="button" className="st-exit" onClick={exitStudio} title="Yayın Stüdyosu'ndan çık (yayın sürüyorsa onay sorulur)"><Icon name="logout" size={14} /> Programdan çık</button>
      </header>

      <div className="st-shell">
        <ShortcutRail items={rail.items} setItems={rail.setItems} reset={rail.reset} ctx={railCtx} zoom={zoom} onOpenSettings={() => openSettings("serit")} />

        <div className="st-body">
          {stageView}

          <Dock tabs={TABS} tab={tab} onTab={setTab} height={prefs.dockH} onHeight={setDockH} extra={<button type="button" className="st-dock__settings" onClick={() => openSettings()}><Icon name="sliders" size={13} /> Ayarlar</button>}>
            {tab === "yonetim" && <ManageDock matchId={matchId} match={live.match} live={live} onOpenMatch={setMatchId} graphics={hasGraphics ? g : undefined} scenes={sceneList} replays={replays.replays} onPlayReplay={playReplay} onGoalTap={onDockGoalTap} onEventCreated={onDockEventCreated} goalMusic={goalMusic || undefined} />}
            {tab === "marka" && (
              <div className="st-gfxpair is-brand">
                {BrandTab && <BrandTab {...gfxProps} />}
                {PresetsTab && <PresetsTab {...gfxProps} />}
              </div>
            )}
            {tab === "skorbord" && ScoreboardTab && <ScoreboardTab {...gfxProps} />}
            {tab === "altyazi" && SubtitlePanel && <SubtitlePanel {...gfxProps} />}
            {tab === "sponsor" && <div className="st-gfxpair">{SponsorPanel && <SponsorPanel {...gfxProps} />}{LinksPanel && <LinksPanel {...gfxProps} />}</div>}
            {tab === "sahne" && (
              <ScenesTab config={config} configRef={configRef} runtimeRef={src.runtimeRef} register={registerTile} version={src.version} studioMode={studioMode} ledId={ledId} actions={{ ...sceneActions, tileMenu }} libActions={libActions}
                selectedSceneId={inlineSceneId} onSelectScene={setInlineSceneId} selectedLayerId={selectedLayerId} onSelectLayer={setSelectedLayerId}
                outW={preset.width} outH={preset.height} overrideRef={overrideRef} matchClockRef={matchClockRef} onAddScene={openGallery} />
            )}
            {tab === "gecis" && <TransitionsTab prefs={prefs} setPref={setPref} hasModes={hasModes} brandRef={brandRef} onOpenBrand={g ? () => setTab("marka") : null} />}
            {modeTab && <div className={`st-modewrap is-${modeTab.key}`}>{modeTab.render?.()}</div>}
            {!hasModes && tab === "tekrar" && (
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
            {!hasModes && tab === "var" && <VarPanel vr={vr} sources={config.sources} replays={replays.replays} meta={replays.meta} micMuted={muted} onToggleMic={toggleMic} />}
            {tab === "yayin" && (
              <div className="st-bcastwrap">
                <BroadcastPanel yt={yt} engine={engine} busy={busy} matchId={matchId} matchName={matchName} match={live.match} startedVia={onAir ? startedVia : null} encoding={prefs.encoding} onEncoding={setEncoding}
                  onStartYoutube={startYoutube} onStartManual={startManual} onRehearsal={startRehearsal} onStop={() => stopEncoder({ askFirst: false })} onEndYoutube={endYoutube} toast={toast} ask={ask}
                  localRec={localRec} onLocalRec={setLocalRec} recordInfo={recordInfo} onOpenSettings={() => openSettings("kayit")}
                  chapters={{ ...chapters, onAdd: addChapter, onRemove: chapters.remove, onClear: chapters.clear }} />
              </div>
            )}
            {tab === "ses" && StudioAudioPanel && useStudioAudioMod && (
              <StudioAudioPanel audio={mixer} mixer={mixer} setAudio={setAudio} devices={src.devices}
                onRequestMic={async () => { try { await window.elitlig?.studio?.requestMediaAccess?.("microphone"); } catch { /* yoksay */ } setAudio((a) => ({ ...a, mic: { ...a.mic, nonce: Date.now() } })); src.refreshDevices(); }} />
            )}
            {tab === "ses" && !(StudioAudioPanel && useStudioAudioMod) && (
              <AudioPanel audio={prefs.audio} setAudio={setAudio} mixer={mixer} devices={src.devices}
                onRequestMic={async () => { try { await window.elitlig?.studio?.requestMediaAccess?.("microphone"); } catch { /* yoksay */ } setAudio((a) => ({ ...a, mic: { ...a.mic, nonce: Date.now() } })); src.refreshDevices(); }} />
            )}
            {tab === "led" && <LedPanel led={led} scenes={config.scenes} matchId={matchId} ledMode={g?.ledMode} g={hasGraphics ? g : null} live={live} />}
          </Dock>

          {editSceneId && (
            <SceneEditor config={config} configRef={configRef} runtimeRef={src.runtimeRef} sceneId={editSceneId} selectedLayerId={selectedLayerId} onSelectLayer={setSelectedLayerId}
              outW={preset.width} outH={preset.height} overrideRef={overrideRef} matchClockRef={matchClockRef}
              isProgram={editSceneId === config.programSceneId} isPreview={studioMode && editSceneId === config.previewSceneId} actions={sceneActions} libActions={libActions} onClose={closeEditor} />
          )}
        </div>

        {settingsSection && (
          <SettingsPage section={settingsSection} onSection={setSettingsSection} settings={settings} set={setSetting} prefs={prefs} setPref={setPref} led={led} scenes={sceneList} engine={engine} toast={toast}
            rail={rail} hasModes={hasModes} brandRef={brandRef}
            onClose={() => setSettingsSection(null)}
            onReset={async () => { if (await ask({ title: "Stüdyo ayarlarını sıfırla", message: "Kodlayıcı, kayıt kalitesi, kısayollar, uyarılar ve görünüm ayarları varsayılana döner. Sahneler ve kaynaklar silinmez.", confirmLabel: "Sıfırla", danger: true })) { resetSettings(); toast("Stüdyo ayarları sıfırlandı.", { tone: "success" }); } }} />
        )}
      </div>

      {monMenu && (
        <div className="st-rmenu is-monitor" style={{ left: monMenu.x, top: monMenu.y }} role="menu">
          <span className="st-rmenu__title">{monMenu.target === "program" ? "Program" : "Önizleme"}</span>
          <button type="button" role="menuitem" onClick={() => { setFullscreen(monMenu.target); setMonMenu(null); }}><Icon name="overview" size={13} /> Tam ekran göster</button>
          {monMenu.target === "preview" && <button type="button" role="menuitem" disabled={!canTake} onClick={() => { toProgram(); setMonMenu(null); }}><Icon name="chevronRight" size={13} /> Yayına al (Geçiş)</button>}
          {monMenu.target === "preview" && !modes.previewOverride && previewScene && <button type="button" role="menuitem" onClick={() => { sceneActions.onEdit(previewScene.id); setMonMenu(null); }}><Icon name="pencil" size={13} /> Sahneyi düzenle (katmanlar)</button>}
          {monMenu.target === "preview" && !modes.previewOverride && previewScene && <button type="button" role="menuitem" onClick={() => { sceneActions.onEditFull(previewScene.id); setMonMenu(null); }}><Icon name="overview" size={13} /> Tam ekran düzenle</button>}
          {monMenu.target === "program" && lastSceneId && <button type="button" role="menuitem" onClick={() => { backToLastScene(); setMonMenu(null); }}><Icon name="undo" size={13} /> Son sahneye dön</button>}
        </div>
      )}
      {fullscreen && <FullscreenView source={fullscreen === "preview" ? comp.preview : comp.program} label={fullscreen === "preview" ? `ÖNİZLEME · ${previewTitle}` : `${onAir ? "● YAYINDA" : "PROGRAM"} · ${programTitle}`} tone={fullscreen === "preview" ? "pvw" : "pgm"} onClose={() => setFullscreen(null)} />}
      {picker && (
        <PlayerPicker title={picker.title} subtitle={`${eventLabel(picker.code)} · ${live.minute}'`} side={picker.side}
          players={picker.side === "home" ? live.squads.home : live.squads.away} busy={saving} clipKey={picker.clipKey}
          onPick={record} onClose={cancelPicker} />
      )}
      {eventModal && (
        <Modal title="Olay gir" onClose={() => setEventModal(false)} width={720} className="st-modal">
          <EventEntry ctx={railCtx} onClose={() => setEventModal(false)} />
        </Modal>
      )}
      {dialog && (
        <SourceDialog initial={dialog.initial} cameraCount={config.sources.filter((s) => s.kind === "camera").length} devices={src.devices} access={src.access}
          onRequestAccess={src.requestAccess} onRefreshDevices={src.refreshDevices} onSave={saveSource} onClose={closeDialog} />
      )}
      {gallery && <TemplateGallery anchor={gallery.anchor} onTemplate={onTemplate} onClose={() => setGallery(null)} />}
      {tplKey && <TemplateDialog tplKey={tplKey} config={config} onCreate={createFromTemplate} onClose={() => setTplKey(null)} />}
      {help && <HelpModal hotkeys={settings.hotkeys} onClose={() => setHelp(false)} />}
      {/* ── röportaj: kayıt bitince inceleme (izle → web sitesine yükle / sil) ── */}
      <InterviewReviewHost iv={interview} />
      {ytStart.dialog /* [medya] YouTube başlatma penceresi */}
    </div>
  );
}
