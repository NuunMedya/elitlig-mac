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
//   YERLEŞİM    (./layout) ekranın tamamı yapboz gibi döşenir (dockview): bölmeler, sekme
//               grupları, panolar (react-grid-layout). Üst çubukta DÜZENLE: sürükle, böl,
//               birleştir, büyüt / küçült, yüzen pencere, kaldır; "Kutu ekle" (kaldırılanlar
//               en üstte), "Yeni sekme" (kendi panon), "Hazır düzen". Ayarlar › Yerleşim'de ağaç.
//               Eski sol şerit / sahne ızgarası / alt panel ilk açılışta buraya göç eder.
//   Sol şerit   KISAYOL ŞERİDİ (./shortcuts) artık "Kısayollar" panosu: iki sütunlu; işlevsel
//               parçacıklar (Yayın, Mikrofon, VAR, Tekrar [açı seçimi], Önemli an, Olay gir,
//               takım GOL'leri, Skorbord çeşidi, Altyazı, Röportaj, Bölüm, LED, sahneler,
//               gol müziği…). 1×1 / 2×2, sürükle-bırak, sağ tık, "+" katalog; Ayarlar'da da.
//   Ekranlar    çalışma alanına göre (lib/studio/scenesWorkspace.js): Klasik, Büyük
//               program, Tek program, Çoklu görünüm 2×2 / 3×3. Sahne kutularında tally
//               (kırmızı YAYINDA / yeşil ÖNİZLEME / mavi LED). Monitöre sağ tık → Tam ekran.
//               Program monitörünün hemen altında program ses şeridi yuvası (audio/).
//   Geçiş       GEÇİŞ (Boşluk), hızlı tür, Son sahneye dön (L). Ayrıntı: Geçişler sekmesi.
//   Alt panel   ÇOK SÜTUNLU çalışma alanı (./Dock.jsx, ./dock/): varsayılan Maç yönetimi |
//               Sahneler | Tekrar | Ses (Tekrar ve Ses sabit); sütun ekle / kaldır / sabitle /
//               değiştir / genişlik; tek sekme kipi. Yalnız işletim panelleri (Reji, Sahneler,
//               Tekrar, Ses, VAR, Röportaj, Özet, Yayın, LED, Olay gir); her panelin parçaları
//               Ayarlar › Alt panel'den gizlenir. Skorbord, Altyazı, Marka & ön ayarlar,
//               Sponsor & linkler ve Geçişler Ayarlar sayfasında.
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
  addLayer, addScene, addSource, duplicateLayer, duplicateScene, duplicateSource, loadScenesConfig, moveLayerTo, moveSceneTo, multiviewTiles, readySceneOf,
  removeLayer, removeScene, removeSource, renameScene, replaceScene, resolveScene, saveScenesConfig, sceneAtHotkey, sceneFromSource, sceneFromTemplate,
  sceneTransitionOf, sourceUsage, startSceneCountdowns, updateLayer, updateScene, updateSource, updateSourceFx,
} from "../../lib/studio/scenes";
import { comboOf, hotkeyTarget, toggleSourceInScene } from "../../lib/studio/hotkeys";
import { useLiveTally } from "./live/useLiveTally";
import CollectionsDialog from "./live/CollectionsDialog";
import FxFloat from "./fx/FxFloat";
import { backupIngestUrl, encodingPreset, ingestUrl, keyAction, normalizeEncoding, reusableStream, statusPill } from "../../lib/studio/broadcast";
import { TRANSITION_KINDS, transitionKind, transitionMs } from "../../lib/studio/transitions";
import { DEFAULT_BRANDING } from "../../lib/studio/stinger";
import { micWarning } from "../../lib/studio/var";
import { FIXED_SHORTCUTS, workspaceOf } from "../../lib/studio/scenesWorkspace";
import { loadStage, presetForWorkspace, presetTiles, saveStage } from "../../lib/studio/stageGrid";
import { scorerLines } from "../../lib/studio/scorebug";
import { eventLabel, isGoalCode, timerNowMs } from "../../lib/studio/match";
import { manageEventLabel } from "../../lib/studio/manage"; // [düğmeler] akış bildirimi
import { normalizeVarV2 } from "../../lib/studio/var"; // [düğmeler] VAR durum / karar
import { PROGRAM_ANGLE, angleLabel, anglesOf, anglesToRecord, buildReplayQueue, defaultAngles, metaFor, recordableSources, replayBanner, replayTitle } from "../../lib/studio/replays";
import { pickDockClip, selectionFromPayload } from "../../lib/studio/goalClips"; // [gol-klip]
import { payloadSummary, planTake, previewStateOf, programStateOf, samePayload, takeAfterLoad, takeLabel } from "../../lib/studio/previewTake"; // [önizleme-geçiş]
import { useLiveMatch } from "./useLiveMatch";
import { useStudioSources } from "./useStudioSources";
import { useAudioMixer } from "./useAudioMixer";
import { MusicPanel, useMusicPlayer } from "./music";
import { MacroPromptHost, requestMacroPrompt } from "./shortcuts/MacroEditor";
import { getMacros, macroForCombo } from "./shortcuts/macros";
import { fireMacroButton } from "./shortcuts/wGenel";
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
import { clampDock } from "./Dock";
import { FX_KINDS, SourceDialog } from "./SourcesPanel";
import ReplayPanel from "./ReplayPanel";
import HighlightsPanel from "./HighlightsPanel";
import BroadcastPanel from "./BroadcastPanel";
import AudioPanel from "./AudioPanel";
import PlayerPicker from "./PlayerPicker";
import { ManageDock } from "./manage";
import { setShared } from "./manage/manageStore";
import Monitor from "./scenes/Monitor";
import { ScenesTab, TemplateDialog, TemplateGallery } from "./scenes/ScenesPanel";
import SceneEditorModal from "./scenes/SceneEditorModal";
import { AnglesTile, ClockTile, LedMonitor, MetersTile, SceneCell, SceneCellPicker, ScenesStrip } from "./stage/StageTiles";
import ReplayPreviewOverlay from "./modes/ReplayPreviewOverlay";
import TransitionPanel from "./scenes/TransitionPanel";
import FullscreenView from "./scenes/FullscreenView";
import { useRail } from "./shortcuts/ShortcutRail";
import EventEntry from "./shortcuts/EventEntry";
import HealthChip from "./scenes/HealthChip";
import { useGoalStress } from "./useGoalStress";
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
import ControlCenter, { controlLastSection, controlPinned } from "./control/ControlCenter";
import { SourceLibrary } from "./SourcesPanel";
import { COVER_SECTION } from "./youtube/cover/CoverSection";
import { VAR_THEME_SECTION } from "./settings/VarThemeSection";
import { useStudioSettings } from "./settings/useStudioSettings";
import { patchOps } from "./settings/opsDefaults";
import { HOTKEY_ACTIONS, keyText, localRecordOptions, recordEstimate, recordQualityOf, stepScale } from "./settings/settings";
// ── alt panel çalışma alanı (sütunlar, parçalar) + ayar şablonları ──
import { useDock } from "./dock/useDock";
import { panelOf } from "./dock/dockModel";
import { PanelFrame } from "./dock/PanelFrame";
import { reloadDensity } from "./dock/density";
// ── ekran yerleşimi (./layout): dockview bölmeleri + panolar ──
import Workspace from "./layout/Workspace";
import LayoutToolbar from "./layout/LayoutToolbar";
import LayoutSettings, { BoardEditor } from "./layout/LayoutSettings";
import { useLayout } from "./layout/useLayout";
import { boardPanelId, componentOf, dockPanelIds, openTargetOf, openTargetPanelId, panelMeta } from "./layout/layoutModel";
import { PanelScope, PartsProvider } from "./dock/parts";
import AutoTransition from "./layout/AutoTransition";
import { normalizeModeSettings } from "../../lib/studio/modes";
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
const GoalMusicPanel = goalMusicMod?.GoalMusicPanel || null;
// Yükleme günlüğü (modes/UploadLog) ayrı panel olarak da eklenebilir.
const UploadLogPanel = firstMod(import.meta.glob("./modes/UploadLog.jsx", { eager: true }))?.default || null;
const GoalMusicStopPill = goalMusicMod?.GoalMusicStopPill || null; // [gol-müziği] çalarken sahnenin üstünde "MÜZİĞİ KES"
const useNoGoalMusic = () => null;
const useGoalMusicSafe = useGoalMusicMod || useNoGoalMusic;
// "Yayına giden ses" seçicisi (modes/ModeTab) — Ayarlar › Tekrar'da da (modül yoksa gösterilmez).
const RoutePicker = firstMod(import.meta.glob("./modes/ModeTab.jsx", { eager: true }))?.RoutePicker || null;
// Eski sekme anahtarları → Ayarlar bölümleri (yapılandırma sekmeleri alt panelden Ayarlar'a taşındı).
const SETTINGS_TABS = { gecis: "gecis", marka: "marka", skorbord: "skorbord", altyazi: "altyazi", sponsor: "sponsor" };

const PREFS_KEY = "studio.prefs.v1";
// [gol-klip] Reji GOL dokunuşunun olay girilmesini bekleme süresi; ÖNEMLİ AN bildirimi.
const DOCK_CLIP_WAIT_MS = 10 * 60_000;
const momentToast = (pre, post) => (Number(post) > 0 ? `Önemli an kaydediliyor (${pre} sn öncesi + ${post} sn sonrası).` : `Önemli an kaydedildi (son ${pre} sn).`);
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
  sceneInline: false, // "Sahne katmanlarını yanda göster": kalem büyük pencere yerine Sahneler panelinde yanda açar
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
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  useEffect(() => { try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* yoksay */ } }, [prefs]);
  const preset = useMemo(() => encodingPreset(prefs.encoding), [prefs.encoding]);
  const setAnglePref = useCallback((v) => setPref("angles", v), [setPref]);
  const { settings, set: setSetting, reset: resetSettings, reload: reloadSettings } = useStudioSettings(prefs);

  /* ───────── alt panel düzeni (./dock): sütunlar, panel sırası, gizli parçalar ───────── */
  const { dock, setDock, reset: resetDock } = useDock(prefs.tab);
  const dockRef = useRef(dock);
  dockRef.current = dock;
  const dockPanelsRef = useRef([]); // o an kullanılabilen paneller (aşağıda dolar)
  const [dockFlash, setDockFlash] = useState(null);
  /* ───────── ekran yerleşimi (./layout): bölmeler, sekme grupları, panolar ───────── */
  const lay = useLayout({ dockH: prefs.dockH });
  /** Panele git (üst çubuk, kısayollar, bağlantılar): ekrandaysa öne gelir, değilse eklenir. Yapılandırma sekmeleri Ayarlar'da açılır. */
  // where: "layout" (varsayılan: yerleşimde yerine koy / öne getir) · "kontrol" (Kontrol merkezinde aç)
  const openPanel = useStable((t, { where = "layout" } = {}) => {
    const key = String(t || "").replace(/^mode:/, "");
    if (key === "kontrol") { controlRef.current?.open?.(null); return; }
    if (SETTINGS_TABS[key]) { setSettingsSection(SETTINGS_TABS[key]); return; }
    if (!panelMeta(key)) return;
    if (where === "kontrol") { controlRef.current?.open?.(key); return; }
    const c = lay.ctrlRef.current;
    if (!c) return;
    const flash = (k) => { setDockFlash(k); setTimeout(() => setDockFlash((f) => (f === k ? null : f)), 1200); };
    // Maç yönetimi sekmelerine ayrılmışsa birleşik panel geri eklenmez: ayrılmış sekme öne gelir.
    if (where === "float") { floatPanel(key); return; }
    if (key === "yonetim" && !c.has(key)) {
      const part = ["yonetimReji", "yonetimMaclar", "yonetimKadro", "yonetimMacsonu", "yonetimTakimlar"].find((k) => c.has(k));
      if (part) { c.activate(part); flash(part); return; }
    }
    // Ayrı sekme (ör. Reji) ekranda yok ama birleşik Maç yönetimi var: onun o sekmesi öne gelir.
    const subTab = panelMeta(key)?.tab;
    if (subTab && !c.has(key) && c.has("yonetim")) { setShared("manage.tab", subTab); c.activate("yonetim"); flash("yonetim"); return; }
    const had = c.has(key);
    c.add(key);
    setDockFlash(key);
    setTimeout(() => setDockFlash((f) => (f === key ? null : f)), 1200);
    if (!had) toast(`“${panelMeta(key).label}” ekrana eklendi (Düzenle ile yerini değiştirebilirsin).`, { tone: "info", timeout: 2600 });
  });

  /** Paneli yüzen pencerede aç: yoksa yüzen olarak eklenir; varsa (ızgaradaysa) yüzen pencereye taşınır. */
  const floatPanel = useStable((id) => {
    const c = lay.ctrlRef.current;
    const a = c?.api?.();
    if (!c || !a) return;
    const p = a.getPanel(id);
    if (!p) { c.add(id, { float: true }); toast(`“${panelMeta(id)?.label || componentOf(String(id).replace(/^comp~/, ""))?.label || id}” yüzen pencerede açıldı.`, { tone: "info", timeout: 2200 }); return; }
    if (p.group?.api?.location?.type === "floating") { p.api.setActive(); return; }
    const z = (Number(settings.view.scale) || 100) / 100; // yüzen kutu boyu ölçekli (dockview kökü ölçeksiz)
    try { a.addFloatingGroup(p, { x: Math.round(120 * z), y: Math.round(90 * z), width: Math.round(560 * z), height: Math.round(380 * z) }); } catch { p.api.setActive(); }
  });
  /**
   * Panel açma HEDEFİ (wPanels "go:<id>"; layoutModel.OPEN_TARGETS): panel, panel parçası,
   * Kontrol merkezi bölümü ya da Ayarlar bölümü. where: layout | kontrol | float | ayarlar.
   */
  const openTarget = useStable((id, where) => {
    const t = openTargetOf(id);
    if (!t) return;
    if (t.kind === "cc") { controlRef.current?.openSection?.(t.section); return; }
    if (t.kind === "ayar") {
      if (where === "kontrol" && t.cc) controlRef.current?.openSection?.(`ayar:${t.section}`);
      else setSettingsSection(t.section);
      return;
    }
    if (t.kind === "panel") { openPanel(t.panel, { where: where || "layout" }); return; }
    // Parça: kendi paneli ("comp~<parça>") olarak ana panelinin yanına (sekme) ya da yüzen pencerede.
    if (where === "kontrol") { controlRef.current?.open?.(t.parent || null); return; }
    const pid = openTargetPanelId(t);
    if (where === "float") { floatPanel(pid); return; }
    const c = lay.ctrlRef.current;
    if (!c) return;
    const had = c.has(pid);
    const parentId = t.parent && (c.has(t.parent) ? t.parent : t.parent.startsWith("yonetim") && c.has("yonetim") ? "yonetim" : null);
    c.add(pid, !had && parentId ? { panel: parentId, direction: "within" } : {});
    setDockFlash(pid);
    setTimeout(() => setDockFlash((f) => (f === pid ? null : f)), 1200);
    if (!had) toast(`“${t.label}” ekrana eklendi (Düzenle ile yerini değiştirebilirsin).`, { tone: "info", timeout: 2600 });
  });

  /* ───────── sahne alanı ızgarası (stage/StageGrid, lib/studio/stageGrid.js) ───────── */
  // Monitörler ve araç kutuları hücre ızgarasında; hazır düzenler eski çalışma alanı anahtarlarına eşlenir.
  const [stage, setStage] = useState(() => loadStage(store, prefs.workspace));
  useEffect(() => { saveStage(store, stage); }, [stage]);
  const wsSeenRef = useRef(prefs.workspace);
  useEffect(() => {
    // Ayarlar'dan (ya da eski kayıttan) çalışma alanı değişirse eşlenen hazır düzen uygulanır.
    if (wsSeenRef.current === prefs.workspace) return;
    wsSeenRef.current = prefs.workspace;
    const key = presetForWorkspace(prefs.workspace);
    setStage((st) => (st.preset === key && !st.custom ? st : { ...st, preset: key, custom: false, tiles: presetTiles(key) }));
    lay.ctrlRef.current?.applyStageTiles?.(presetTiles(key)); // yerleşimde ekran bölgesi yeniden kurulur
  }, [prefs.workspace]); // eslint-disable-line react-hooks/exhaustive-deps

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
  // [gol-klip] butondan sonraki süre ve gecikmeli yükleme (Ayarlar › Tekrar)
  // [yayın öncelikli] gol klibi yüklemesi motor durumuna (aktarıcı kuyruğu, gönderim hızı,
  // kopmalar) bakarak ertelenir / kısılır; motor aşağıda kurulur, durum ref'ten okunur.
  const engineStatusRef = useRef(null);
  const goalMarkRef = useRef(null); // [gol anı yükü] GOL'de tanılama ölçümü (useGoalStress)
  const replays = useReplays(matchId, { postSeconds: settings.replay.postSeconds, uploadDelaySec: settings.replay.uploadDelaySec, getStatus: () => engineStatusRef.current, onCapture: (kind) => { if (kind === "goal") goalMarkRef.current?.(); } });
  /** [gol-klip] Yayına verilen tekrar yükü → tekrar başına açılar / bölümler (gecikmeli yükleme, özet). */
  const noteAired = useStable((payload) => {
    if (payload?.kind !== "replay") return;
    for (const [id, sel] of Object.entries(selectionFromPayload(payload))) replays.markAiredSelection(id, sel);
  });
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
  const programIds = useMemo(() => (config.scenes.find((s) => s.id === config.programSceneId)?.layers || []).filter((l) => !l.muted).map((l) => l.sourceId), [config.scenes, config.programSceneId]);
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
  const [programFx, setProgramFx] = useState({ ftb: false }); // siyaha geç (solarak) düğme durumu
  const [collectionsOpen, setCollectionsOpen] = useState(false);
  // [işletim] programın anlık durumu: siyah / dondur / bekleme kartı (Sahne düğmeleri, makrolar).
  const [pgmFx, setPgmFxState] = useState(null);
  const pgmFxRef = useRef(null);
  const setPgmFx = useCallback((kind, opts = {}) => {
    const v = kind ? { kind, text: opts.text || "", at: Date.now() } : null;
    pgmFxRef.current = v;
    setPgmFxState(v);
  }, []);
  const comp = useCompositor({ width: preset.width, height: preset.height, fps: preset.fps, configRef, runtimeRef: src.runtimeRef, overlayRef, replayRef, varRef, brandRef, overrideRef, previewGraphicsRef, matchClockRef, modesRef, pgmFxRef });
  /** LED aynası için programın küçük JPEG karesi. */
  const ledFrameRef = useRef(null);
  ledFrameRef.current = () => {
    const c = ledFrameRef.canvas || (ledFrameRef.canvas = document.createElement("canvas"));
    if (c.width !== 960) { c.width = 960; c.height = 540; }
    c.getContext("2d", { alpha: false }).drawImage(comp.program, 0, 0, 960, 540);
    return c.toDataURL("image/jpeg", 0.72);
  };

  /* ───────── kodlayıcı ve YouTube ───────── */
  const onEngineError = useCallback((m) => toast(m, { tone: "error", timeout: 6000 }), [toast]);
  const engine = useEngine({ getVideoTrack: comp.getVideoTrack, getAudioTrack: mixer.audioTrack, getCanvas: comp.getCanvas, subscribeFrames: comp.subscribeFrames, getDrawStats: comp.getStats, onError: onEngineError });
  engineStatusRef.current = engine.status;
  const goalStress = useGoalStress({ active: engine.active, getDrawStats: comp.getStats, getEncodeStats: engine.getEncodeStats, getStatus: () => engineStatusRef.current });
  goalMarkRef.current = goalStress.mark;
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
  // YouTube'a (OAuth ile açılan yayın) mı gidiyor: elle RTMP / prova değil ve açık yayın var.
  const youtubeOpen = startedVia !== "manual" && startedVia !== "rehearsal" && engine.mode !== "rehearsal" && Boolean(yt.stream?.broadcast_id);
  /**
   * "YAYINI KAPAT" (üst çubuk, kısayol şeridi parçacıkları, kısayol tuşu): yayını TAMAMEN
   * kapatır — bölümler gönderilir, kodlayıcı durur, YouTube yayını bitirilir (tek onay).
   * Elle RTMP'de yalnız görüntü kesilir (onaylı), provada doğrudan biter. "Görüntüyü
   * durdur (YouTube açık kalır)" yalnız Yayın panelinde (stopEncoder).
   */
  const closeBroadcast = async ({ askFirst = true } = {}) => {
    const yt0 = youtubeOpen;
    if (!engine.active && !yt0) return;
    if (askFirst) {
      if (yt0 && !(await ask({ title: "Yayını kapat", message: "Yayın tamamen kapatılsın mı? YouTube yayını bitirilir.", confirmLabel: "Yayını kapat", danger: true }))) return;
      if (!yt0 && engine.mode === "live" && !(await ask({ title: "Yayını kapat", message: "Yayın kapatılsın mı? Sunucuya görüntü gitmesi kesilir.", confirmLabel: "Yayını kapat", danger: true }))) return;
    }
    setBusy(true);
    try {
      await chapters.sync.flush?.(); // [bölüm] son bölümler YouTube yayını kapanmadan gider
      if (engine.active) await engine.stop();
      if (yt0) { await yt.end(); toast("Yayın bitti: YouTube yayını kapatıldı.", { tone: "success" }); }
    } catch (e) { toast(errorText(e, "Yayın kapatılamadı."), { tone: "error" }); } finally { setBusy(false); }
  };
  const endYoutube = () => closeBroadcast();
  const topStart = () => {
    if (engine.active) { closeBroadcast(); return; }
    if (yt.config.configured && matchId) { startYoutube(); return; }
    openPanel("yayin");
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
  const setReplayRate = useCallback((v) => setPref("replayRate", Math.min(2, Math.max(0.25, Number(v) || 1))), [setPref]);

  const captureMoment = useStable(() => {
    if (!engine.active) { toast("Tekrar için yayın ya da prova açık olmalı (Yayın sekmesi).", { tone: "warn", timeout: 4000 }); return; }
    replays.capture({ kind: "moment", angles: liveAngles, label: "Önemli an", seconds: settings.replay.seconds, meta: { minute: live.match ? live.minute : null, period: live.period } });
    toast(momentToast(settings.replay.seconds, settings.replay.postSeconds), { tone: "success", timeout: 2500 }); // [gol-klip]
  });
  /** [düğmeler] Önemli an, seçilen saniyeyle (Önemli an · saniye düğmesi). */
  const captureMomentFor = useStable((sec) => {
    if (!engine.active) { toast("Tekrar için yayın ya da prova açık olmalı (Yayın sekmesi).", { tone: "warn", timeout: 4000 }); return; }
    const seconds = Math.round(Math.min(120, Math.max(5, Number(sec) || settings.replay.seconds)));
    replays.capture({ kind: "moment", angles: liveAngles, label: "Önemli an", seconds, meta: { minute: live.match ? live.minute : null, period: live.period } });
    toast(momentToast(seconds, settings.replay.postSeconds), { tone: "success", timeout: 2500 }); // [gol-klip]
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
  const led = useLed({ configRef, programIdRef, previewIdRef, graphicsRef: graphicsSnapRef, brandingRef, matchId, ledMode: g?.ledMode, programId: config.programSceneId, previewId: config.previewSceneId, frameRef: ledFrameRef });
  const ledId = led.status.open && led.studioMode ? led.targetId : null;

  const removeReplay = useStable(async (r) => {
    if (!(await ask({ title: "Tekrarı sil", message: "Bu tekrar ve tüm açılarının dosyaları bu bilgisayardan silinsin mi? Profile yüklenen gol videosu kalır.", confirmLabel: "Sil", danger: true }))) return;
    replays.remove(r.id);
  });
  /** Maç yönetiminden bir tekrar: ÖNİZLEME'ye yüklenir (yayına GEÇİŞ ile) [önizleme-geçiş]. */
  const playReplay = useStable((r) => {
    if (!r) return;
    if (hasModes && modes.loadReplay) { loadReplayAny(r); openPanel("tekrar"); return; }
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
  const studioMode = Boolean(prefs.studioMode) && lay.has("pvw");
  // Canlı kaynaklar: telefonlarda "yayında" ışığı, oynatma listesi "yayına gelince baştan".
  useLiveTally(config, src.runtimeRef, src.version, studioMode);
  const tKind = transitionKind(prefs.transition);
  const tMs = transitionMs(tKind.key, prefs.transitionMs);

  /* ───────── özel kipler (tekrar / VAR / röportaj / özet — ../modes) ───────── */
  const sceneList = useMemo(() => config.scenes.map((s) => ({ id: s.id, name: s.name })), [config.scenes]);
  const drawProgramScene = useCallback((ctx, W, H, now) => {
    const cfg = configRef.current;
    drawScene(ctx, resolveScene(cfg, cfg.programSceneId), cfg.sources, src.runtimeRef.current, W, H, { now, matchClockMs: matchClockRef.current?.() ?? null });
  }, [src.runtimeRef]);
  const setModesPref = useCallback((fn) => setPref("modes", fn), [setPref]);
  const takeRef = useRef(null); // [önizleme-geçiş] tek GEÇİŞ işlevi (aşağıda take) — kip sekmelerindeki "Yayına al" da bunu çağırır
  const modes = useBroadcastModesSafe({
    takeRef,
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
  // [önizleme-geçiş] V: VAR yayındaysa canlıya döner, değilse önizlemeye (stüdyo modu kapalıysa aynı GEÇİŞ yoluyla yayına).
  const toggleVar = useStable(() => {
    if (!V) { vr.toggle(); return; }
    if (V.toggle() === "preview" && takeAfterLoad({ studioMode })) takeRef.current?.();
  });
  const interview = hasModes && modes.interview ? modes.interview : iv;
  const showMicWarning = settings.notify.micOpen && (hasModes ? Boolean(modes.micWarning) || legacyMicWarning : legacyMicWarning);
  const stopReplay = useStable(() => { if (R) R.stop(); else player.stop(true); });
  // [önizleme-geçiş] R / "Son tekrar" düğmeleri: son tekrar ÖNİZLEME'ye; "R = doğrudan yayına" açıksa
  // (ya da stüdyo modu kapalıysa) hemen aynı GEÇİŞ yoluyla yayına — önizlemede görünen aynen gider.
  const playLatestAny = useStable(() => {
    if (!R || !modes.loadLatest) { playLatest(); return; }
    if (modes.loadLatest() && takeAfterLoad({ studioMode, direct: settings.replay.directTake })) takeRef.current?.();
  });
  /** Tekrarı (seçilen açılarla) önizlemeye yükle; take: yükleyip aynı GEÇİŞ yoluyla yayına al. */
  const loadReplayAny = useStable((r, { angles, angle, take: andTake = false } = {}) => {
    if (!r) return false;
    if (!modes.loadReplay) {
      const item = replays.replays.find((x) => x.id === r.id) || r;
      player.play(buildReplayQueue([item], { [item.id]: angles?.length ? angles : defaultAngles(item, liveAngles) }));
      return true;
    }
    if (!modes.loadReplay(r, { angles, angle })) return false;
    if (andTake || takeAfterLoad({ studioMode })) takeRef.current?.();
    return true;
  });
  modesRef.current = { previewOverride: modes.previewOverride || null, programOverride: modes.programOverride || null };

  /* ───────── gol müziği (isteğe bağlı modül: ./goalmusic) ───────── */
  const goalMusic = useGoalMusicSafe({ homeTeamId: live.homeTeamId, awayTeamId: live.awayTeamId, homeName: live.homeName, awayName: live.awayName, matchId, live, toast });
  // Müzik çalar (./music): liste, geçiş; varsayılan yalnız hoparlör, "Yayına da ver" müzik penceresinden yakalar.
  const music = useMusicPlayer({ mixer: mixer?.attachStream ? mixer : null, toast });
  const goalPlaying = Boolean(goalMusic?.playing);
  useEffect(() => { music.duck(goalPlaying); }, [goalPlaying]); // eslint-disable-line react-hooks/exhaustive-deps

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

  /* ───────── [önizleme-geçiş] ÖNİZLEME → PROGRAM: tek doğruluk kaynağı + tek GEÇİŞ ─────────
     Önizleme durumu = önizlemedeki kip (tekrarda yüküyle: klip, açı, giriş / çıkış, görünüm, hız)
     ya da önizleme sahnesi (lib/studio/previewTake › previewStateOf). take() planTake'in planını
     uygular: önizlemede ne varsa AYNEN programa; sonra yayından düşen sahne önizlemeye gelir.
     Durum eşzamanlı okunur (configRef + modes.previewNow / airNow): yükleyip hemen almak güvenli. */
  const previewStateNow = () => {
    const pm = modes.previewNow ? modes.previewNow() : modes.previewMode ? { mode: modes.previewMode, payload: null } : null;
    return previewStateOf({ previewSceneId: configRef.current.previewSceneId, previewMode: pm?.mode || null, payload: pm?.payload || null });
  };
  const programStateNow = () => {
    const air = modes.airNow ? modes.airNow() : modes.airMode ? { mode: modes.airMode, stage: modes.stage, payload: null } : null;
    return programStateOf({ programSceneId: configRef.current.programSceneId, airMode: air?.mode || null, airStage: air?.stage || "idle", airPayload: air?.payload || null });
  };
  /** Yapılandırmayı hem ref'te (eşzamanlı okuma) hem durumda güncelle. */
  const applyConfig = (fn) => { configRef.current = fn(configRef.current); setConfig(fn); };
  const takingRef = useRef(false); // kip yayına alınırken (klip yükleniyor) ikinci GEÇİŞ yok sayılır
  const take = useStable(async () => {
    if (takingRef.current) return false;
    const cfg = configRef.current;
    const plan = planTake({ preview: previewStateNow(), program: programStateNow(), studioMode });
    const tr = { kind: tKind.key, ms: tMs };
    if (plan.type === "none") {
      // Eski yol (yayın modları modülü yokken): VAR / tekrar yayındaysa önizleme sahnesine dön.
      const target = cfg.previewSceneId || cfg.programSceneId;
      if (!target || (!vr.active && !player.playing)) return false;
      if (vr.active) vr.exit(); else player.stop(true);
      restartVideosIn(target); pushHistory(cfg.programSceneId, target);
      applyConfig((c) => startSceneCountdowns({ ...c, programSceneId: target, previewSceneId: studioMode ? c.programSceneId : target }, target));
      return true;
    }
    if (plan.type === "mode") {
      takingRef.current = true;
      let ok = false;
      // Geçiş: Ayarlar › Tekrar "Yayına alma geçişi" (kip ayarı), yoksa seçili geçiş.
      const modeTr = modes.settings?.transition || tr;
      try { ok = Boolean(await modes.takeToAir?.(modeTr, plan.mode, plan.payload)); } catch { ok = false; } finally { takingRef.current = false; }
      if (!ok) return false;
      noteAired(plan.payload); // [gol-klip] yayına verilen açılar / bölümler → gecikmeli yükleme + özet
      // Önizleme tutarlı: kip yayına gitti → önizlemeye kipten önceki (alttaki) sahne gelir; ikinci GEÇİŞ geri döner.
      // Bu arada önizlemeye başka içerik yüklendiyse ona dokunulmaz.
      const pvAfter = modes.previewNow?.();
      if (pvAfter?.mode === plan.mode && (plan.mode !== "tekrar" || samePayload(pvAfter.payload, plan.payload))) {
        modes.clearPreview?.(plan.mode);
        if (plan.nextPreviewSceneId && studioMode) applyConfig((c) => ({ ...c, previewSceneId: plan.nextPreviewSceneId }));
      }
      return true;
    }
    // Sahne: yayındaki kip (tekrar / VAR / röportaj / özet) çıkış geçişiyle biter; öbür ucu yeni program sahnesi.
    const target = plan.to;
    const swap = (c) => startSceneCountdowns({ ...c, programSceneId: target, previewSceneId: plan.nextPreviewSceneId || target }, target);
    if (plan.endMode) {
      try { if (modes.endOnAir) modes.endOnAir(tr); else modes.onTransitionTake?.(target); } catch { /* yoksay */ }
      restartVideosIn(target); pushHistory(cfg.programSceneId, target); applyConfig(swap); return true;
    }
    if (vr.active) { vr.exit(); restartVideosIn(target); pushHistory(cfg.programSceneId, target); applyConfig(swap); return true; }
    if (player.playing) { restartVideosIn(target); pushHistory(cfg.programSceneId, target); applyConfig(swap); player.stop(true); return true; }
    restartVideosIn(target);
    // Sahnenin kendi geçişi (Sahne düzenle › Sahne › "Yayına alınırken geçiş") varsa o kullanılır.
    const own = sceneTransitionOf(cfg, target);
    const ownKind = own ? transitionKind(own.kind) : null;
    if (ownKind && ownKind.key === own.kind) comp.startTransition(cfg.programSceneId, target, ownKind.key, own.ms ?? transitionMs(ownKind.key, prefs.transitionMs));
    else comp.startTransition(cfg.programSceneId, target, tKind.key, tMs);
    pushHistory(cfg.programSceneId, target);
    applyConfig(swap);
    return true;
  });
  takeRef.current = () => { take(); };
  /** Sahneyi önizlemeye yükle (önizlemedeki kip bırakılır: önizlemede artık bu sahne var). */
  const loadSceneToPreview = (id) => {
    if (!id) return;
    modes.clearPreview?.();
    applyConfig((c) => (c.previewSceneId === id ? c : { ...c, previewSceneId: id }));
  };
  /** GEÇİŞ (id yok) ya da "bu sahneyi yayına" (id): önce önizlemeye yüklenir, sonra aynı take. */
  const toProgram = useStable((id) => {
    if (id) loadSceneToPreview(id);
    return take();
  });
  const toPreview = useStable((id) => {
    loadSceneToPreview(id);
    if (!studioMode) take();
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
  const [editSceneId, setEditSceneId] = useState(null); // sahne düzenleyici penceresi (./scenes/SceneEditorModal)
  const [inlineSceneId, setInlineSceneId] = useState(null); // Sahneler panelinde seçili sahne (isteğe bağlı: katmanlar yanda)
  const [gallery, setGallery] = useState(null); // "Yeni sahne ekle" penceresi { anchor }
  const [tplKey, setTplKey] = useState(null);
  const [dialog, setDialog] = useState(null); // { initial, toScene }
  const [settingsSection, setSettingsSection] = useState(null); // açıkken bölüm anahtarı
  // Kontrol merkezi: açıkken bölüm anahtarı; iğneliyse yerleşimin sağında çekmece (yeniden açılışta da iğneli açılır).
  const [ccSection, setCcSection] = useState(() => (controlPinned() ? controlLastSection() || "yayin" : null));
  const [ccPinned, setCcPinned] = useState(() => controlPinned());
  const controlRef = useRef(null);
  const closeDialog = useCallback(() => setDialog(null), []);
  // [görüntü] canlı "Görüntü ayarları" paneli: { sourceId, sceneId? } (./fx/FxFloat)
  const [fxPanel, setFxPanel] = useState(null);
  const closeFx = useCallback(() => setFxPanel(null), []);
  const setSourceFx = useCallback((id, fx) => setConfig((c) => updateSourceFx(c, id, fx)), []);
  const closeEditor = useCallback(() => { setEditSceneId(null); setSelectedLayerId(null); overrideRef.current = null; }, []);

  const saveSource = useStable((draft) => {
    const toScene = dialog?.toScene || null;
    setDialog(null);
    const { angleOptions, ...clean } = draft;
    void angleOptions;
    if (clean.kind === "audio") {
      setAudio((a) => ({ ...a, inputs: [...(a.inputs || []), audioInputFromDraft(clean)] })); // [medya] aygıt ya da ses / video dosyası
      openPanel("ses");
      toast("Ses girişi Ses sekmesine eklendi.", { tone: "success" });
      return;
    }
    if (clean.id) {
      setConfig((c) => updateSource(c, clean.id, { ...clean, nonce: clean.kind === "screen" || clean.kind === "window" || clean.kind === "region" ? Date.now() : clean.nonce }));
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
    // Telefon / RTMP girişi: eklenir eklenmez bağlantı bilgisi (QR, adres, anahtar) açılır.
    if (source.kind === "phone" || source.kind === "ingest") setTimeout(() => setDialog({ initial: { ...source, angleOptions: recordable } }), 0);
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
    // Yeni sahne seçilir; boş sahne doğrudan düzenleyicide açılır (ayar açıksa Sahneler panelinde yanda).
    setTimeout(() => { setInlineSceneId(scene.id); setSelectedLayerId(null); if (edit) { if (prefsRef.current.sceneInline) openPanel("sahne"); else setEditSceneId(scene.id); } }, 0);
    return studioMode ? { ...next, previewSceneId: scene.id } : next;
  };
  const createFromTemplate = useStable((key, opts) => {
    setTplKey(null);
    setConfig((c) => { const { config: next, scene } = sceneFromTemplate(c, key, opts); return placeNewScene(next, scene); });
    toast("Sahne oluşturuldu ve önizlemeye alındı. Katmanlarını sahne kutusundaki kalemle düzenleyebilirsin.", { tone: "success", timeout: 4000 });
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
    onFx: (sourceId, sceneId = null) => setFxPanel({ sourceId, sceneId }),
    onSourceFx: setSourceFx,
    onPreview: toPreview,
    onProgram: toProgram,
    onToLed: (id) => { led.toScene(id); },
    // Düzenle: büyük düzenleyici penceresi. "Sahne katmanlarını yanda göster" açıksa Sahneler panelinde yanda.
    onEdit: (id) => {
      setSelectedLayerId(null); setInlineSceneId(id);
      if (prefsRef.current.sceneInline) openPanel("sahne"); else setEditSceneId(id);
    },
    onEditFull: (id) => { setInlineSceneId(id); setEditSceneId(id); },
    onEditInline: (id) => { setSelectedLayerId(null); setInlineSceneId(id); if (!prefsRef.current.sceneInline) setPref("sceneInline", true); openPanel("sahne"); },
    onUpdateScene: (id, patch) => setConfig((c) => updateScene(c, id, patch)),
    onCollections: () => setCollectionsOpen(true),
    onReplaceScene: (id, scene) => setConfig((c) => replaceScene(c, id, scene)),
    onDuplicateLayer: (sceneId, layerId) => setConfig((c) => { const { config: next, layer } = duplicateLayer(c, sceneId, layerId); if (layer) setSelectedLayerId(layer.id); return next; }),
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
    // [görüntü] sahnedeki görüntü kaynakları (kamera, ekran, video…): canlı görüntü ayarı.
    const sc = configRef.current.scenes.find((s) => s.id === t.id);
    const fxSrcs = [...new Set((sc?.layers || []).map((l) => l.sourceId))].map((id) => configRef.current.sources.find((s) => s.id === id)).filter((s) => s && FX_KINDS.has(s.kind));
    const fxItems = fxSrcs.length === 1 ? [{ label: "Görüntü ayarları…", icon: "sliders", onClick: () => setFxPanel({ sourceId: fxSrcs[0].id, sceneId: t.id }) }]
      : fxSrcs.slice(0, 6).map((s) => ({ label: `Görüntü ayarları · ${s.name}…`, icon: "sliders", onClick: () => setFxPanel({ sourceId: s.id, sceneId: t.id }) }));
    return [
      { label: "Düzenle…", icon: "pencil", onClick: () => sceneActions.onEditFull(t.id) },
      ...fxItems,
      { label: "Katmanları yanda göster (Sahneler)", icon: "layers", onClick: () => sceneActions.onEditInline(t.id) },
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
    onFx: (sourceId) => setFxPanel({ sourceId }),
    onDuplicateSource: (sourceId) => setConfig((c) => duplicateSource(c, sourceId).config),
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
    // [gol-klip] 10 dk içinde olay girilmezse klip yalnız bu bilgisayarda kalır (anahtar
    // tüketilmez: geç girilen olay yine bağlanabilir — useReplays.attach).
    entry.timer = setTimeout(() => {
      dockGoalClipsRef.current = dockGoalClipsRef.current.filter((x) => x !== entry);
      replays.attach(key, { eventId: null });
    }, DOCK_CLIP_WAIT_MS);
    dockGoalClipsRef.current.push(entry);
  });
  const onDockEventCreated = useStable(({ event, playerName, side, code } = {}) => {
    if (!isGoalCode(code || event?.olay_kodu)) return;
    addGoalChapter({ side, code: code || event?.olay_kodu, playerName, created: event }); // [bölüm]
    const list = dockGoalClipsRef.current;
    // [gol-klip] Kendi kalesine golde olayın tarafı GOL'e basılan taraftan farklı olabilir:
    // aynı tarafın EN YENİ klibi, yoksa en yeni (eskiden en eskisi: iptal edilmiş eski bir
    // dokunuşun klibi — başka bir anın görüntüsü — golün videosu oluyordu).
    const i = pickDockClip(list, side);
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
  const railCtxRef = useRef(null);
  keyRef.current = (e) => {
    if (document.querySelector(".modal-backdrop, .st-pop")) return;
    if (settingsSection) return; // Ayarlar açıkken (tuş atama) stüdyo kısayolları çalışmaz
    if (e.target?.closest?.(".st-edit") && /^Arrow|^Delete$|^Backspace$/.test(e.key)) return;
    // Sahne / kaynak kısayolları (F1–F12 ya da değiştiricili; kaynak ve sahne ayarlarında atanır).
    const combo = !e.target?.closest?.("input, textarea, select, [contenteditable]") ? comboOf(e) : null;
    const hk = combo ? hotkeyTarget(configRef.current, combo) : null;
    if (hk && !editSceneId) {
      e.preventDefault();
      if (hk.type === "scene") toPreview(hk.id);
      else {
        const r = toggleSourceInScene(configRef.current, hk.id);
        if (r.sceneId) { applyConfig(() => r.config); toast(`${configRef.current.sources.find((x) => x.id === hk.id)?.name || "Kaynak"} ${r.visible ? "gösterildi" : "gizlendi"}.`, { timeout: 1500 }); }
        else toast("Bu kaynak programdaki / önizlemedeki sahnede yok.", { tone: "warn", timeout: 2500 });
      }
      return;
    }
    // [makro] makroya atanmış kısayol (F1–F12 ya da değiştiricili; Ayarlar › Makrolar).
    const mk = combo && !editSceneId ? macroForCombo(getMacros(), combo) : null;
    if (mk && railCtxRef.current) { e.preventDefault(); fireMacroButton(railCtxRef.current, mk); return; }
    const act = keyAction(e, { pendingGoal: goalArmed, hotkeys: settings.hotkeys });
    if (!act) return;
    if (act.type === "goalCancel") { setGoalArmed(false); return; }
    if (editSceneId && act.type !== "mic" && act.type !== "goalMusicStop") return; // düzenleyicide yalnız mikrofon ve müziği kes
    e.preventDefault();
    if (act.type === "mic") toggleMic();
    else if (act.type === "replay") playLatestAny(); // [önizleme-geçiş] son tekrar önizlemeye (yayındaysa GEÇİŞ yerine koyar)
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
    else if (act.type === "goalMusicStop") { if (goalMusic?.playing) goalMusic.stop?.(); } // [gol-müziği] K: müziği kes
    else if (act.type === "subtitle") { if (g?.matchId) g.setSubtitleOnAir?.(!g.subtitle?.onAir); }
    else if (act.type === "interviewBand") { if (g?.matchId) g.setInterviewOnAir?.(!g.interview?.onAir); }
    else if (act.type === "interview") { if (interview?.recording) interview.stop(); else if (interview?.available && engine.active) interview.start(); }
    else if (act.type === "fullscreen") setFullscreen((f) => (f ? null : "program"));
    else if (act.type === "closeBroadcast") { if (engine.active || youtubeOpen) closeBroadcast(); }
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
  const setTab = openPanel;
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
  const replayTabKey = "tekrar";

  const programTitle = modes.programOverride ? modes.programOverride.label || "Özel kip" : vr.active ? "VAR kontrolü" : player.playing ? "Tekrar" : programScene?.name || "—";
  // [önizleme-geçiş] Önizleme başlığı / GEÇİŞ düğmesi, take() ile aynı durumdan (previewStateNow) okunur.
  const pvState = previewStateNow();
  const pvPayload = pvState.kind === "replay" && !pvState.empty ? pvState : null;
  const pvFirst = pvPayload?.items?.[0] || null;
  const previewTitle = pvFirst
    ? [`Tekrar · ${replayTitle(pvFirst.replay, metaFor(pvFirst.replay, replays.meta))}`, angleLabel(pvFirst.angle, config.sources), payloadSummary(pvPayload)].filter(Boolean).join(" · ")
    : modes.previewOverride ? modes.previewOverride.label || "Özel kip" : previewScene?.name || "—";
  const programIdForTally = player.playing || vr.active || modes.programOverride ? null : config.programSceneId;
  const canTake = planTake({ preview: pvState, program: programStateNow(), studioMode }).type !== "none" || player.playing || vr.active;  const hints = settings.view.hints;
  const zoom = settings.view.scale / 100;
  // Renk teması (Ayarlar › Görünüm): <html data-st-theme> — gövdeye taşınan pencereler de alır.
  useEffect(() => {
    const el = document.documentElement;
    if (settings.view.theme && settings.view.theme !== "gece") el.dataset.stTheme = settings.view.theme; else delete el.dataset.stTheme;
    return () => { delete el.dataset.stTheme; };
  }, [settings.view.theme]);
  // ⌘ + / ⌘ − / ⌘ 0 (Windows'ta Ctrl): arayüz ölçeği %70…%125 (uygulama menüsünün yakınlaştırması yerine).
  const scaleRef = useRef(settings.view.scale);
  scaleRef.current = settings.view.scale;
  useEffect(() => {
    const onKey = (e) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
      const dir = e.key === "+" || e.key === "=" || e.code === "NumpadAdd" ? 1 : e.key === "-" || e.code === "NumpadSubtract" ? -1 : (e.key === "0" || e.code === "Numpad0") && !e.shiftKey ? 0 : null;
      if (dir == null) return;
      e.preventDefault();
      e.stopPropagation();
      const next = stepScale(scaleRef.current, dir);
      if (next !== scaleRef.current) setSetting("view", { scale: next });
      toast(`Arayüz ölçeği %${next}`, { timeout: 1200 });
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [setSetting, toast]);

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
  const hasMetersTile = lay.has("olcer");

  /* ───────── önizlemede tekrar düzenleme (modes/ReplayPreviewOverlay) ───────── */
  // Tekrar kipi önizlemedeyken önizleme monitörü düzenleyiciye döner: yakınlaştır / kaydır,
  // zaman çizelgesi, giriş–çıkış, hız; "Yayına al" seçilen bölümü yayına verir.
  const RE = hasModes && modes.replayEditor ? modes.replayEditor : null;
  // [gol-klip] Pozisyon başına seçili açılar useReplays'te (setPicks) saklanır ve gecikmeli gol
  // yüklemesi onları izler (yayına verilen bölümlerin giriş / çıkışı korunur).
  const replayEditing = Boolean(RE && RE.previewing && RE.rm?.transport);
  const [pvwBox, setPvwBox] = useState({ w: 0, h: 0 });
  const [pgmBox, setPgmBox] = useState({ w: 0, h: 0 });
  // Yayındaki tekrarın denetimi PROGRAM monitörünün üstünde (yalnız operatör görür, yayına çizilmez).
  const replayAir = Boolean(RE?.decks?.program?.active);
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
        {!modes.previewOverride && previewScene && <button type="button" className="st-monitor__btn" onClick={() => sceneActions.onEdit(previewScene.id)} title="Önizlemedeki sahneyi düzenle: katmanlar, konum, boyut, görünüm"><Icon name="pencil" size={11} /> Düzenle</button>}
      </figcaption>
      <Monitor canvas={comp.preview} className="st-monitor__screen" onBox={setPvwBox}>
        {replayEditing && (
          <ReplayPreviewOverlay deck={RE.decks?.preview} rm={RE.rm} rate={RE.rate} onRate={RE.setRate} sources={RE.sources || config.sources} meta={replays.meta} box={pvwBox}
            onTake={() => toProgram()} canTake={canTake} onFocus={RE.setFocus} keysOn={RE.keysOn} onKeys={RE.setKeysOn} />
        )}
      </Monitor>
    </figure>
  );
  const programMonitor = (
    <figure className={`st-monitor is-program ${st.state === "live" ? "is-live" : ""} ${showMicWarning ? "is-micwarn" : ""} ${replayAir ? "is-replayair" : ""}`} onContextMenu={onMonitorMenu("program")}>
      <figcaption>
        <span className={`st-tag ${onAir ? "is-live" : "is-pgm"}`}>{onAir ? "● YAYINDA" : "PROGRAM"}</span>
        <span className="st-monitor__name">{programTitle}</span>
        {player.playing && <span className="st-tag is-live">TEKRAR {player.index + 1}/{player.total} · {String(prefs.replayRate).replace(".", ",")}×</span>}
        {vr.active && <button type="button" className="st-tag is-var" onClick={vr.exit} title="VAR'dan çık (V)">VAR · ÇIK</button>}
        {interview?.recording && <span className="st-tag is-live">RÖPORTAJ</span>}
        <span className="st-top__spacer" />
        {ledId && ledId === programIdForTally && <span className="st-tag is-led" title="LED ekran bu sahneyi gösteriyor">LED</span>}
      </figcaption>
      <Monitor canvas={comp.program} className="st-monitor__screen" onBox={setPgmBox}>
        {replayAir && (
          <ReplayPreviewOverlay deck={RE.decks.program} target="program" sources={RE.sources || config.sources} meta={replays.meta} box={pgmBox}
            onLive={RE.live} onFocus={RE.setFocus} keysOn={RE.keysOn} onKeys={RE.setKeysOn} />
        )}
      </Monitor>
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
      tKind={tKind} tMs={tMs} onKind={(k) => setPref("transition", k)} onMore={() => setTab("gecis")} hints={hints}
      programFx={programFx} onFtb={() => { comp.setFtb(undefined, 700); setProgramFx(comp.programFx()); }} />
  );
  const tileProps = (t) => ({
    tile: t, register: registerTile, studioMode, onAir: t.id === programIdForTally, inPreview: studioMode && !modes.previewOverride && t.id === config.previewSceneId && t.id !== programIdForTally,
    onLed: t.id === ledId, bad: tileWarning(config, src.runtimeRef.current, t), onPreview: toPreview, onProgram: toProgram, onToLed: sceneActions.onToLed, onEdit: sceneActions.onEdit, menu: tileMenu(t),
  });

  /** Izgara kutusunun içeriği (tür başına). Monitörler tek tuvali paylaşır: düzende tekildirler. */
  const renderStageTile = (t) => {
    switch (t.type) {
      case "preview": return studioMode || lay.edit ? previewMonitor : <div className="stg-box"><p className="st-hint" style={{ margin: "auto" }}>Stüdyo modu kapalı: sahneye tık doğrudan yayına.</p></div>;
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
  /** Sahne hücresi paneli: düzenle kipinde numara seçici (panel kimliği "sceneCell~n" değişir). */
  const sceneCellPanel = (index, panelId) => {
    const t = { id: panelId, type: "scene", x: 0, y: 0, w: 3, h: 3, opts: { index } };
    return (
      <>
        {renderStageTile(t)}
        {lay.edit && <div className="lw-cellpick"><SceneCellPicker tile={t} tiles={tiles} onPick={(i) => { const c = lay.ctrlRef.current; if (!c || c.has(`sceneCell~${i}`)) return; c.add(`sceneCell~${i}`, { panel: panelId }); c.remove(panelId); }} /></div>}
      </>
    );
  };

  /* ───────── kısayol şeridi bağlamı (parçacıkların okuduğu durum + eylemler) ───────── */
  // Tekrar hızı: yayın modları varsa kip ayarı (prefs.modes.rate), yoksa eski tercih.
  const replayRateNow = hasModes ? normalizeModeSettings(prefs.modes).rate : prefs.replayRate;
  const setReplayRateAny = useStable((v) => {
    const r = Math.round(Math.min(2, Math.max(0.25, Number(v) || 1)) * 20) / 20;
    if (hasModes) setPref("modes", (m) => ({ ...normalizeModeSettings(m), rate: r })); else setReplayRate(r);
  });
  /** Seçilen tekrarlar sırayla (her biri varsayılan açılarıyla) ÖNİZLEME'ye; yayına GEÇİŞ ile [önizleme-geçiş]. */
  const playReplayQueue = useStable(async (list, { take: andTake = false } = {}) => {
    const ids = (list || []).map((r) => r.id);
    const items = ids.map((id) => replays.replays.find((r) => r.id === id)).filter(Boolean);
    if (hasModes && modes.loadQueue) {
      if (!modes.loadQueue(items)) return false;
      if (andTake || takeAfterLoad({ studioMode })) takeRef.current?.();
      return true;
    }
    const q = buildReplayQueue(items, Object.fromEntries(items.map((r) => [r.id, defaultAngles(r, liveAngles)])), { order: ids });
    if (!q.length) { toast("Kuyrukta oynatılabilir açı yok.", { tone: "warn" }); return false; }
    player.play(q);
    return true;
  });
  /** Skor −: o takımın (yararına yazılan) son golünü sil (onaylı). */
  const goalUndo = useStable(async (side) => {
    const sideOf = (ev) => {
      const s = Number(ev.takim_id) === Number(live.homeTeamId) ? "home" : Number(ev.takim_id) === Number(live.awayTeamId) ? "away" : null;
      if (!s) return null;
      return String(ev.olay_kodu || "").toUpperCase() === "GOAL_OWN" ? (s === "home" ? "away" : "home") : s;
    };
    const goals = (live.events || []).filter((ev) => isGoalCode(ev.olay_kodu) && sideOf(ev) === side);
    const last = goals.sort((a, b) => (Number(b.devre) - Number(a.devre)) || (Number(b.dakika) - Number(a.dakika)) || (Number(b.id) - Number(a.id)))[0];
    const name = side === "home" ? live.homeName : live.awayName;
    if (!last) { toast(`${name}: geri alınacak gol yok.`, { tone: "info" }); return; }
    if (!(await ask({ title: "Golü geri al", message: `${name} golü (${last.dakika ?? 0}') silinsin mi? Skor olaylardan yeniden hesaplanır.`, confirmLabel: "Sil", danger: true }))) return;
    try { await live.removeEvent(Number(last.id)); toast("Gol silindi.", { tone: "success" }); } catch (e) { toast(errorText(e, "Gol silinemedi."), { tone: "error" }); }
  });
  /* ───────── [düğmeler] çok işlevli düğmelerin akış eylemleri (./shortcuts/wReji vb.) ─────────
     GOL'e basıldığı AN: basış kaydı (bölüm), tekrar klibi, gol müziği (otomatik açıksa).
     Kayıt: live.addFullEvent (Reji ile aynı yol) → klip olaya bağlanır, gol bölümü, "Geri al"lı bildirim. */
  const flowBegin = useStable((side) => {
    if (live.status !== "canli") return null;
    const s = side === "away" ? "away" : "home";
    goalTapsRef.current.tap(s); // [bölüm]
    try { goalMusic?.onGoal?.(s); } catch { /* yoksay */ }
    return engine.active ? replays.capture({ kind: "goal", angles: liveAngles, seconds: settings.replay.seconds, meta: { side: s, code: "GOAL_RIGHT_FOOT", minute: live.minute, period: live.period } }) || null : null;
  });
  // [gol-klip] Kayıt sürerken akış kapanırsa (açılır panel kapandı / yeniden çizildi) iptal
  // yok sayılır: eskiden klip "yalnız yerel"e bağlanıp anahtarı tüketiyor, ardından gelen
  // olay bağlanamıyor, gol videosu hiç yüklenmiyordu.
  const submittingRef = useRef(new Set());
  const flowCancel = useStable((clipKey, side) => {
    if (clipKey && submittingRef.current.has(clipKey)) return;
    if (side) goalTapsRef.current.drop(side); // [bölüm]
    if (clipKey) replays.attach(clipKey, { eventId: null });
  });
  const flowSubmit = useStable(async (forms, { clipKey = null } = {}) => {
    const list = (forms || []).filter(Boolean);
    if (!list.length) return [];
    const created = [];
    if (clipKey) submittingRef.current.add(clipKey); // [gol-klip]
    try {
      for (const f of list) created.push(await live.addFullEvent(f));
    } catch (e) {
      toast(errorText(e, "Olay kaydedilemedi."), { tone: "error", timeout: 5000 });
      if (!created.length) { if (clipKey) { submittingRef.current.delete(clipKey); replays.attach(clipKey, { eventId: null }); } throw e; }
    }
    const gi = list.findIndex((f) => isGoalCode(f.code));
    if (gi >= 0 && created[gi]) {
      const f = list[gi];
      if (clipKey) replays.attach(clipKey, { eventId: Number(created[gi]?.id) || null, scorer: live.nameOf(f.playerId) || null, side: f.side, code: f.code });
      addGoalChapter({ side: f.side, code: f.code, playerId: f.playerId, created: created[gi] }); // [bölüm]
    } else if (clipKey) replays.attach(clipKey, { eventId: null });
    const f0 = list[0];
    const who = f0.code === "SUBSTITUTION" ? `${live.nameOf(f0.outId) || "?"} → ${live.nameOf(f0.inId) || "?"}` : live.nameOf(f0.playerId);
    const more = created.length > 1 ? ` + ${manageEventLabel(list[1].code).toLocaleLowerCase("tr-TR")} (${live.nameOf(list[1].playerId) || "?"})` : "";
    const undo = async () => {
      try { for (const c of [...created].reverse()) if (c?.id) await live.removeEvent(Number(c.id)); toast("Geri alındı.", { tone: "info", timeout: 2200 }); } catch (e) { toast(errorText(e, "Geri alınamadı."), { tone: "error" }); }
    };
    toast(`${manageEventLabel(f0.code)}${who ? ` · ${who}` : ""}${more} kaydedildi (${created[0]?.dakika ?? live.minute}').`, { tone: "success", timeout: 7000, action: { label: "Geri al", run: undo } });
    if (clipKey) submittingRef.current.delete(clipKey); // [gol-klip]
    return created;
  });
  // VAR durum / karar (İNCELEME · KONTROL · KARAR + GOL / İPTAL…): kip ayarına yazılır, yayında anında değişir.
  const varNow = normalizeVarV2(hasModes ? normalizeModeSettings(prefs.modes).var : prefs.var);
  const setVarAny = useStable((patch) => {
    if (hasModes) setPref("modes", (m) => ({ ...(m || {}), var: normalizeVarV2({ ...normalizeVarV2(normalizeModeSettings(m).var), ...patch }) }));
    else vr.set?.(patch);
  });
  /** Son tekrarı VAR penceresine koy ve VAR'ı önizlemeye al (yayına GEÇİŞ ile). */
  const varWithReplay = useStable((r) => {
    if (!r) return;
    const angle = defaultAngles(r, liveAngles)[0] || PROGRAM_ANGLE;
    setVarAny({ slots: [{ kind: "replay", replayId: r.id, angle }, ...varNow.slots.slice(1)], state: "review" });
    if (V?.preview) { V.preview(); if (takeAfterLoad({ studioMode })) takeRef.current?.(); } else if (!vr.active) vr.toggle();
  });
  // Hazır ekranların geri sayım dakikası (sahnedeki geri sayım saati kaynağı).
  const readyClockOf = (cfg, key) => {
    const sc = readySceneOf(cfg, key);
    if (!sc) return null;
    const ids = new Set(sc.layers.map((l) => l.sourceId));
    return cfg.sources.find((x) => ids.has(x.id) && x.kind === "clock" && x.mode === "countdown") || null;
  };
  const setReadyMinutes = useStable((key, minutes) => {
    const c = readyClockOf(configRef.current, key);
    if (!c) { toast("Bu hazır ekranda geri sayım yok: önce ekranı bir kez aç (şablondan oluşur).", { tone: "info", timeout: 3500 }); return; }
    applyConfig((cfg) => updateSource(cfg, c.id, { durationMs: Math.max(1, Number(minutes) || 1) * 60_000, targetAt: null }));
  });
  /** Pano öğesinin seçeneklerini (kanal, süre…) kaydet: item.i ile tüm panolarda aranır. */
  const setItemOpts = useStable((id, patch) => {
    lay.setLayout((l) => {
      let hit = false;
      const boards = Object.fromEntries(Object.entries(l.boards || {}).map(([bid, b]) => [bid, b.items.some((x) => x.i === id) ? (hit = true, { ...b, items: b.items.map((x) => (x.i === id ? { ...x, o: { ...(x.o || {}), ...patch } } : x)) }) : b]));
      return hit ? { ...l, boards } : l;
    });
  });
  const latestReplay = replays.latest;
  /* ───────── [işletim] LED, röportaj, özet, maç, sahne, araçlar düğmelerinin eylemleri ───────── */
  const setOps = useStable((sub, patch) => setSetting("ops", (o) => patchOps(o, sub, patch)));
  const markMoment = useStable((label, sec) => {
    if (!engine.active) { toast("An için yayın ya da prova açık olmalı.", { tone: "warn", timeout: 3500 }); return; }
    const seconds = Math.round(Math.min(120, Math.max(5, Number(sec) || settings.replay.seconds)));
    replays.capture({ kind: "moment", angles: liveAngles, label: String(label || "Önemli an").slice(0, 40), seconds, meta: { minute: live.match ? live.minute : null, period: live.period } });
    toast(`${label || "Önemli an"} kaydedildi (son ${seconds} sn).`, { tone: "success", timeout: 2200 });
  });
  /** Programın / önizlemenin ekran görüntüsü (PNG, Kaydet penceresi). Dönüş: dosya adı | null. */
  const screenshot = useStable(async (target = "program") => {
    const c = target === "preview" ? comp.preview : comp.program;
    const blob = await new Promise((r) => { try { c.toBlob(r, "image/png"); } catch { r(null); } });
    if (!blob) { toast("Ekran görüntüsü alınamadı.", { tone: "error" }); return null; }
    const d = new Date();
    const p2 = (n) => String(n).padStart(2, "0");
    const name = `elitlig-${target === "preview" ? "onizleme" : "program"}-${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}.png`;
    const data = new Uint8Array(await blob.arrayBuffer());
    const res = await window.elitlig?.files?.save?.(name, data, [{ name: "PNG", extensions: ["png"] }]);
    if (res && res.ok === false) return null;
    toast(`Ekran görüntüsü: ${name}`, { tone: "success", timeout: 2500 });
    return name;
  });
  // [işletim] Ayarlar › LED: tekrar / VAR yayındayken LED kendiliğinden program aynasına geçer, bitince döner.
  const autoMirrorRef = useRef(null);
  const replayAiring = Boolean(replayPlaying || varActive);
  useEffect(() => {
    if (!settings.ops.led.mirrorOnReplay || !led.status.open) return;
    if (replayAiring && led.fx.content !== "mirror") { autoMirrorRef.current = led.fx.content; led.setFx({ content: "mirror" }); }
    else if (!replayAiring && autoMirrorRef.current != null) { led.setFx({ content: autoMirrorRef.current }); autoMirrorRef.current = null; }
  }, [replayAiring, settings.ops.led.mirrorOnReplay, led.status.open]); // eslint-disable-line react-hooks/exhaustive-deps
  const takeModeAny = useStable((mode) => {
    if (!hasModes) return;
    if (modes.previewMode !== mode) { modes.setPreview?.(mode); return; }
    takeRef.current?.();
  });
  const railCtx = {
    hints, hotkeys: settings.hotkeys, railPopRef, scenes: sceneList, score: live.match ? live.score : null, momentSeconds: settings.replay.seconds,
    live: {
      onAir, mode: engine.mode, since: engine.since, busy, start: topStart, stop: () => closeBroadcast(), youtube: youtubeOpen, openTab: () => setTab("yayin"),
      status: engine.status, rehearsal: startRehearsal, localRec: { enabled: Boolean(settings.record.enabled), set: (on) => setLocalRec({ ...localRec, enabled: Boolean(on) }) },
    },
    // [düğmeler] çok işlevli düğmeler: maç (olaylar, saat, kadro), akış kaydı, onay, öğe seçenekleri
    match: live.match ? live : null, ask, setItemOpts,
    flow: { begin: flowBegin, cancel: flowCancel, submit: flowSubmit, remove: (id) => live.removeEvent(id), update: (id, form) => live.updateEvent(id, form) },
    mic: { muted, toggle: toggleMic, analyser: () => mixer.micAnalyser(true) },
    mixer: mixer?.setStrip ? mixer : null, // çok kanallı karıştırıcı parçacığı
    clock: { live },                        // maç saati parçacığı
    toast,
    goalUndo: live.match ? goalUndo : null,
    transition: {
      canTake, take: () => toProgram(), label: takeLabel(pvState), kind: tKind, onKind: (k) => setPref("transition", k), lastSceneName: lastSceneId ? resolveScene(config, lastSceneId)?.name : null, lastScene: backToLastScene,
      ms: tMs, onMs: (ms) => setPref("transitionMs", (m) => ({ ...(m || {}), [tKind.key]: ms })),
    },
    chapter: {
      add: addChapter, count: chapters.chapters.length, items: chapters.chapters, startAt: chapters.startAt,
      addLabel: (label) => { if (!engine.active) { toast("Bölüm işareti için yayın ya da prova açık olmalı.", { tone: "warn" }); return; } chapters.add(String(label || "Bölüm").slice(0, 60)); toast(`Bölüm: “${label}”.`, { tone: "success", timeout: 2000 }); },
    },
    fullscreen: (target) => setFullscreen(target),
    replay: {
      list: replays.replays, meta: replays.meta, sources: config.sources, recordAngles: liveAngles, playing: replayPlaying,
      previewing: hasModes && modes.previewMode === "tekrar",
      latestInfo: latestReplay ? { title: replayTitle(latestReplay, metaFor(latestReplay, replays.meta)), angles: anglesOf(latestReplay).length } : null,
      // [önizleme-geçiş] preview: önizlemeye yükle · take: önizlemeye yükle + aynı GEÇİŞ (bekleme / zamanlayıcı yok:
      // durum eşzamanlı okunur, önizlemede görünen aynen yayına gider) · playLatest: R ile aynı.
      preview: (r, angles) => loadReplayAny(r, { angles }),
      take: async (r, angles) => { loadReplayAny(r, { angles, take: true }); },
      // POZİSYON BAŞINA SEÇİM: picks { replayId: [açı] } · pick.toggle / all / clear ·
      // send(r, { rate, take }): seçili açıları (yoksa program) önizlemeye, take: GEÇİŞ ile yayına.
      picks: RE?.rm?.picks || replays.picks || {},
      pick: RE?.rm?.pick || null,
      send: (r, { rate, take: andTake = false } = {}) => {
        if (!r) return false;
        if (!modes.sendToPreview) return loadReplayAny(r, { take: andTake });
        if (!modes.sendToPreview(r, { rate })) return false;
        if (andTake || takeAfterLoad({ studioMode })) takeRef.current?.();
        return true;
      },
      previewPos: RE?.rm?.previewPos || null, airPos: RE?.rm?.airPos || null,
      uploadOf: replays.uploadOf, uploadNow: replays.uploadNow, cancelUpload: replays.cancelUpload, reschedule: replays.reschedule, health: replays.health, now: replays.now,
      direct: Boolean(settings.replay.directTake) || !studioMode,
      stop: stopReplay, playLatest: playLatestAny, loadLatest: playLatestAny, openTab: () => setTab(replayTabKey),
      rate: replayRateNow, setRate: setReplayRateAny, playQueue: playReplayQueue, momentFor: captureMomentFor,
      // önizlemedeki tekrarın düzenleyicisi (giriş / çıkış, kare kare)
      editor: RE ? {
        previewing: Boolean(RE.previewing), transport: RE.rm.transport, cursorKey: RE.rm.cursorKey, cursorAngle: RE.rm.cursor?.angle || null,
        inOf: RE.rm.inPointOf, outOf: RE.rm.outPointOf, setIn: RE.rm.setInPoint, setOut: RE.rm.setOutPoint,
        // desteler: program yayındayken parçacıklar yayındaki tekrarı anında denetler
        decks: RE.decks || null, focus: RE.focus || null,
      } : null,
    },
    moment: captureMoment,
    var: { active: varActive, previewing: hasModes && modes.previewMode === "var", toggle: toggleVar, state: varNow, set: setVarAny, withReplay: varWithReplay },
    event: { live: live.status === "canli", minute: live.match ? live.minute : null, homeName: live.homeName, awayName: live.awayName, squads: live.squads, begin: beginEvent, submit: submitEvent, cancel: cancelEvent },
    goal: (side) => askGoal(side),
    goalMusic, GoalMusicButtons, music,
    g, variant, setVariant,
    interview,
    led, openLedTab: () => setTab("led"),
    // Panel açma düğmeleri (wPanels): yerleşimde yerine koy ya da Kontrol merkezinde aç; hasPanel: ekranda mı
    openPanel: (key, where) => openPanel(key, { where }), hasPanel: (key) => lay.has(key), controlOpen: Boolean(ccSection),
    // Hedef düğmeleri (her panel / parça / Kontrol merkezi ve Ayarlar bölümü): wPanels TARGET_WIDGETS
    openTarget, controlSection: ccSection, settingsSection,
    ready: {
      ids: readyIds, go: onReady, setMinutes: setReadyMinutes,
      minutesOf: (key) => { const c = readyClockOf(config, key); return c ? Math.round((Number(c.durationMs) || 0) / 60_000) : null; },
    },
    // Ayarlar › Kısayollar panosu kataloğu: düğmeyi panoya ekle.
    addToRail: (type, size, opts) => {
      const sz = String(size || "1x1").split("x").map((n) => Number(n) || 1);
      lay.setLayout((l) => {
        const b = l.boards.rail;
        if (!b) return l;
        const m = componentOf(`w:${type}`);
        if (!m) return l;
        const bottom = b.items.reduce((mx, it) => Math.max(mx, it.y + it.h), 0);
        return { ...l, boards: { ...l.boards, rail: { ...b, items: [...b.items, { i: `i${Date.now().toString(36)}`, t: m.key, x: 0, y: bottom, w: Math.min(b.cols, sz[0] >= 2 ? 2 : 1), h: (sz[1] >= 2 ? 2 : 1) * 2, ...(opts ? { o: opts } : {}) }] } } };
      });
    },
    sceneTile: { register: registerTile, programId: programIdForTally, previewId: studioMode && !modes.previewOverride ? config.previewSceneId : null, onPreview: toPreview, onProgram: toProgram },
    // [işletim] işletim düğmeleri (./shortcuts/wLed, wRoportaj, wOzet, wMac, wSahne, wGenel)
    ops: settings.ops, setOps, markMoment, screenshot,
    matchId, openMatch: setMatchId,
    ozet: { hl: hasModes ? modes.highlights || hl : hl, imagesRef, matchId, stingerKind: hasModes ? (normalizeModeSettings(prefs.modes).between.kind === "cut" ? "stinger" : normalizeModeSettings(prefs.modes).between.kind) : "stinger" },
    modes: hasModes ? { setPreview: modes.setPreview, clearPreview: modes.clearPreview, endOnAir: () => modes.endOnAir?.(), takeMode: takeModeAny, previewMode: modes.previewMode, airMode: modes.airMode } : null,
    sceneOps: { list: config.scenes, sources: config.sources, setLayerVisible: (sceneId, layerId, visible) => setConfig((c) => updateLayer(c, sceneId, layerId, { visible: Boolean(visible) })) },
    pgmFx: { kind: pgmFx?.kind || null, set: setPgmFx },
    encoding: { value: prefs.encoding, set: (patch) => setEncoding({ ...prefs.encoding, ...patch }), pipeline: settings.stream.pipeline },
    pipeline: { value: settings.stream.pipeline, set: (k) => setSetting("stream", { pipeline: k }), active: engine.status?.pipeline || null },
    // [makro] uzun makrolar her adımda GÜNCEL bağlamı okur; çalışırken soru; YouTube başlığı.
    getCtx: () => railCtxRef.current,
    macroPrompt: requestMacroPrompt,
    platform: window.elitlig?.platform || "darwin",
    youtubeTitle: async (title) => {
      if (!yt.stream?.broadcast_id) { toast("YouTube başlığı için önce YouTube yayınını aç.", { tone: "warn" }); return false; }
      try { const d = await yt.loadDraft(); await yt.updateSettings({ ...(d || {}), title }); toast(`YouTube başlığı: “${title}”.`, { tone: "success", timeout: 2500 }); return true; } catch (e) { toast(errorText(e, "YouTube başlığı değiştirilemedi."), { tone: "error" }); return false; }
    },
  };
  railCtxRef.current = railCtx;
  // Ekrandaki panolarda "Yayın" parçacığı varsa üst çubuktaki düğme gizlenir.
  const railHasGoLive = Object.entries(lay.layout.boards).some(([id, b]) => lay.has(boardPanelId(id)) && b.items.some((x) => x.t === "w:golive" || x.t === "w:goLivePro"));

  /* ───────── alt panel panelleri (yalnız işletim; yapılandırma Ayarlar'da) ─────────
     render({ passive }): passive = çok sütunlu kip (özel kip sütunu önizlemeyi kendiliğinden almaz). */
  const requestMic = async () => { try { await window.elitlig?.studio?.requestMediaAccess?.("microphone"); } catch { /* yoksay */ } setAudio((a) => ({ ...a, mic: { ...a.mic, nonce: Date.now() } })); src.refreshDevices(); };
  const audioPanel = () => (StudioAudioPanel && useStudioAudioMod
    ? <StudioAudioPanel audio={mixer} mixer={mixer} setAudio={setAudio} devices={src.devices} onRequestMic={requestMic} />
    : <AudioPanel audio={prefs.audio} setAudio={setAudio} mixer={mixer} devices={src.devices} onRequestMic={requestMic} />);
  const modeTabOf = (key) => (hasModes ? (modes.tabs || []).find((t) => t.key === key) : null);
  const modeRender = (key) => {
    const t = modeTabOf(key);
    return t ? (o) => <div className={`st-modewrap is-${key}`}>{t.render(o)}</div> : null;
  };
  const legacyTekrar = () => (
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
  );
  /* ───────── [yoğunluk + eylem çubuğu] panel çerçevesi (./dock/PanelFrame) ─────────
     Yayına içerik veren panellerde yapışkan YAYIN çubuğu: ÖNİZLEMEYE GÖNDER · YAYINA AL / GEÇİŞ ·
     CANLIYA DÖN (kip yayındayken). Hepsi tek önizleme → program yolunu kullanır (toPreview /
     modes.setPreview → take). Diğer işletim panellerinde yalnız yoğunluk denetimi. */
  const hkText = (k) => { const v = settings.hotkeys?.[k]?.[0]; return v ? keyText(v) : null; };
  const modeName = (m) => panelOf(m)?.label || m;
  const pvMode = hasModes ? modes.previewMode || null : null;
  const airM = hasModes ? modes.airMode || null : null;
  const pvwName = pvMode ? modeName(pvMode) : studioMode ? previewScene?.name || null : null;
  const takeSpec = (mine) => ({
    label: mine ? "YAYINA AL" : "GEÇİŞ",
    sub: pvwName ? `Önizlemede: ${pvwName}` : "Önizleme boş",
    k: hkText("transition"),
    disabled: !canTake,
    onClick: () => { toProgram(); },
  });
  const backSpec = () => (airM ? {
    label: "CANLIYA DÖN", sub: `${modeName(airM)} yayında · önceki sahneye`,
    k: airM === "var" ? hkText("var") : airM === "tekrar" ? "Esc" : null,
    onClick: () => modes.endOnAir?.(),
  } : null);
  const modePvwSpec = (m) => {
    const inPv = pvMode === m;
    const list = replays.replays || [];
    const send = () => {
      if (m === "tekrar") {
        const picks = modes.replayEditor?.rm?.picks || {};
        const r = list.find((x) => (picks[x.id] || []).length);
        if (r && modes.sendToPreview) modes.sendToPreview(r); else modes.loadLatest?.();
        return;
      }
      if (m === "var" && modes.var?.preview) { modes.var.preview(); return; }
      modes.setPreview?.(m);
    };
    return {
      label: "ÖNİZLEMEYE GÖNDER",
      sub: inPv ? `${modeName(m)} önizlemede ✓` : m === "tekrar" ? (list.length ? "Seçili pozisyon / son tekrar" : "Henüz tekrar yok") : modeName(m),
      k: m === "tekrar" ? hkText("replay") : m === "var" ? hkText("var") : null,
      active: inPv,
      disabled: m === "tekrar" && !list.length,
      onClick: send,
    };
  };
  const airBarFor = (key) => {
    if (key === "sahne") {
      const sel = (inlineSceneId && config.scenes.find((x) => x.id === inlineSceneId)) || null;
      const inPv = Boolean(sel) && !pvMode && config.previewSceneId === sel.id;
      return {
        pvw: {
          label: "ÖNİZLEMEYE GÖNDER", sub: sel ? (inPv ? `${sel.name} önizlemede ✓` : sel.name) : "Önce bir sahne seç", k: "1–9",
          active: inPv, disabled: !sel || inPv || !studioMode, onClick: () => sel && toPreview(sel.id),
        },
        take: takeSpec(!pvMode && Boolean(previewScene) && config.previewSceneId !== config.programSceneId),
        back: backSpec(),
      };
    }
    if (hasModes && (key === "tekrar" || key === "var" || key === "roportaj" || key === "ozet")) {
      return { pvw: modePvwSpec(key), take: takeSpec(pvMode === key), back: backSpec() };
    }
    if (key === "led") {
      const lp = led.prefs || {};
      const route = lp.web ? "web" : lp.route || "program";
      return {
        pvw: { label: "LED'E ÖNİZLEME", sub: route === "preview" ? "LED önizlemeyi gösteriyor ✓" : "LED önizlemedekini göstersin", active: route === "preview", disabled: Boolean(lp.web), onClick: () => led.setRoute({ route: "preview" }) },
        take: takeSpec(false),
        back: backSpec() || (!lp.web && route !== "program" ? { label: "LED CANLIYA DÖN", sub: "LED yayını (programı) izlesin", onClick: () => led.setRoute({ route: "program" }) } : null),
      };
    }
    return null;
  };
  const FRAMED = ["sahne", "tekrar", "var", "roportaj", "ozet", "led", "yonetim", "yonetimReji", "ses", "yayin"];
  const dockDefs = {};
  const defPanel = (key, render, extra = {}) => {
    if (!render) return;
    const framed = FRAMED.includes(key) ? (o) => <PanelFrame panel={key} bar={airBarFor(key)}>{render(o)}</PanelFrame> : render;
    dockDefs[key] = { ...panelOf(key), ...extra, render: framed, raw: render };
  };
  // Maç yönetimi: birleşik panel + ayrılmış sekmeler ("Maç yönetimi › Reji" …) + pano bölümleri
  // (layout/components ManagePart). Seçili maç burada; süzgeç / taslaklar manage/manageStore'da ortak.
  const manageProps = { matchId, match: live.match, live, onOpenMatch: setMatchId, replays: replays.replays, onPlayReplay: playReplay, onGoalTap: onDockGoalTap, onEventCreated: onDockEventCreated, goalMusic: goalMusic || undefined };
  const liveCount = live.status === "canli" ? "●" : null;
  defPanel("yonetim", (o) => <ManageDock {...manageProps} graphics={hasGraphics ? g : undefined} scenes={sceneList} onSplit={o?.onSplit} />, { count: liveCount });
  for (const [key, tab] of [["yonetimMaclar", "maclar"], ["yonetimReji", "reji"], ["yonetimKadro", "kadro"], ["yonetimMacsonu", "macsonu"], ["yonetimTakimlar", "takimlar"]]) {
    defPanel(key, () => <ManageDock {...manageProps} only={tab} />, { count: tab === "reji" ? liveCount : null, icon: panelMeta(key)?.icon });
  }
  defPanel("sahne", () => (
    <ScenesTab config={config} configRef={configRef} runtimeRef={src.runtimeRef} register={registerTile} version={src.version} studioMode={studioMode} ledId={ledId} actions={{ ...sceneActions, tileMenu }} libActions={libActions}
      selectedSceneId={inlineSceneId} onSelectScene={setInlineSceneId} selectedLayerId={selectedLayerId} onSelectLayer={setSelectedLayerId}
      inline={Boolean(prefs.sceneInline)} onInline={(v) => setPref("sceneInline", v)}
      outW={preset.width} outH={preset.height} overrideRef={overrideRef} matchClockRef={matchClockRef} onAddScene={openGallery} />
  ),
    { count: config.scenes.length || null });
  defPanel("tekrar", hasModes ? modeRender("tekrar") : legacyTekrar, { count: replays.replays.length || null, ...(hasModes ? {} : { label: "Tekrar & Özet" }) });
  defPanel("ses", audioPanel, { count: muted ? null : "●" });
  defPanel("var", hasModes ? modeRender("var") : () => <VarPanel vr={vr} sources={config.sources} replays={replays.replays} meta={replays.meta} micMuted={muted} onToggleMic={toggleMic} />,
    { count: varActive ? "●" : null });
  defPanel("roportaj", modeRender("roportaj"), { count: modeTabOf("roportaj")?.count ?? null });
  defPanel("ozet", modeRender("ozet"), { count: modeTabOf("ozet")?.count ?? null });
  defPanel("yayin", () => (
    <div className="st-bcastwrap">
      <BroadcastPanel yt={yt} engine={engine} busy={busy} matchId={matchId} matchName={matchName} match={live.match} startedVia={onAir ? startedVia : null} encoding={prefs.encoding} onEncoding={setEncoding}
        onStartYoutube={startYoutube} onStartManual={startManual} onRehearsal={startRehearsal} onStop={() => stopEncoder({ askFirst: false })} onEndYoutube={endYoutube} toast={toast} ask={ask}
        localRec={localRec} onLocalRec={setLocalRec} recordInfo={recordInfo} onOpenSettings={() => openSettings("kayit")}
        chapters={{ ...chapters, onAdd: addChapter, onRemove: chapters.remove, onClear: chapters.clear }} />
    </div>
  ), { count: onAir ? "●" : null });
  defPanel("led", () => <LedPanel led={led} scenes={config.scenes} matchId={matchId} ledMode={g?.ledMode} g={hasGraphics ? g : null} live={live} />, { count: led.status.open ? "●" : null });
  defPanel("olaylar", () => <div className="st-dock-events"><EventEntry ctx={railCtx} onClose={() => {}} /></div>);
  dockPanelsRef.current = Object.keys(dockDefs);
  defPanel("bolumler", () => <PanelScope panel="yayin" only="chapters"><div className="st-bcastwrap lw-solo" data-solo-panel="yayin" data-solo-part="chapters">{(dockDefs.yayin.raw || dockDefs.yayin.render)({ passive: true })}</div></PanelScope>, { count: chapters.chapters.length || null });
  defPanel("muzikCalar", () => <div className="lw-pad"><MusicPanel mp={music} /></div>, { count: music.playing ? "●" : null });
  if (GoalMusicPanel) defPanel("golMuzigi", () => (goalMusic ? <div className="lw-pad"><GoalMusicPanel gm={goalMusic} /></div> : <p className="st-hint st-pad">Gol müziği için maç aç (takımların müzikleri).</p>), { count: goalMusic?.playing ? "●" : null });
  if (UploadLogPanel) defPanel("yukleme", () => <div className="lw-pad"><UploadLogPanel defaultOpen /></div>);

  /* ───────── ekran yerleşimi: panel / bileşen sözleşmesi (./layout) ───────── */
  const STAGE_KIND = { pvw: "preview", pgm: "program", gecis: "transition", sahneSerit: "scenes", ledPvw: "led", acilar: "angles", olcer: "meters", saat: "clock" };
  const renderLayoutPanel = (kind, opts, panelId) => {
    if (kind === "sceneCell") return sceneCellPanel(Number(opts?.index) || 0, panelId);
    if (kind === "gecis") return <AutoTransition render={transition} />;
    if (STAGE_KIND[kind]) return renderStageTile({ id: panelId, type: STAGE_KIND[kind], x: 0, y: 0, w: 4, h: 4 });
    const d = dockDefs[kind];
    if (kind === "yonetim") return d ? d.render({ passive: true, column: true, onSplit: () => lay.ctrlRef.current?.splitTabs(panelId) }) : null;
    return d ? d.render({ passive: true, column: true }) : null;
  };
  const layoutValue = {
    renderPanel: renderLayoutPanel,
    panelBody: (kind) => dockDefs[kind]?.render({ passive: true, column: true }) ?? null,
    panelInfo: (kind, opts) => {
      if (kind === "comp") return { icon: componentOf(opts?.t)?.icon || "grid" };
      const m = panelMeta(kind);
      const d = dockDefs[kind];
      return { icon: d?.icon || m?.icon, count: d?.count || null, accent: Boolean(m?.mode), pvw: hasModes && Boolean(m?.mode) && modes.previewMode === m.mode, flash: dockFlash === kind };
    },
    onActivate: (k) => onDockActivate(k), onDeactivate: (k) => onDockDeactivate(k),
    railCtx, mixer: mixer?.setStrip ? mixer : null, zoom, setEdit: lay.setEdit,
    transition,
    clock: { minute: live.match ? live.minute : null, period: live.match ? live.period : null },
    meters: { strip: programAudio, mixer, muted },
    angles: { replays: replays.replays, meta: replays.meta, sources: config.sources, cursor: RE?.previewing ? RE.rm.cursor : null, onPick: pickAngle },
    reji: { matchId, live, ready: Boolean(live.match && Number(live.match.id) === Number(matchId)), onGoalTap: onDockGoalTap, onEventCreated: onDockEventCreated, goalMusic },
    manage: manageProps,
    GoalMusicPanel, GoalMusicButtons, EventEntry,
  };
  // Kısayol tuşu (Olay gir): panolardaki parçacığın açılır paneli.
  railPopRef.current = (type) => Boolean(lay.ctrlRef.current?.openWidgetPop?.(type));
  // [önizleme-geçiş] Sütuna / sekmeye dokunmak ya da sütunu kaldırmak önizlemeyi DEĞİŞTİRMEZ:
  // önizleme yalnız içerik seçilince (sahne, tekrar / açı, "Önizlemeye al", R / V) değişir.
  const onDockActivate = useStable(() => {});
  const onDockDeactivate = useStable(() => {});
  // Önizlemeye bir sahne gelince (ör. yeni sahne oluşturuldu) önizlemedeki kip bırakılır: önizlemede o sahne görünür.
  const lastPvwRef = useRef(config.previewSceneId);
  useEffect(() => {
    if (lastPvwRef.current === config.previewSceneId) return;
    lastPvwRef.current = config.previewSceneId;
    if (hasModes && modes.previewMode && !takingRef.current) modes.clearPreview?.(modes.previewMode);
  }, [config.previewSceneId]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ───────── Ayarlar: alt panelden taşınan yapılandırma bölümleri ───────── */
  const settingsExtra = [
    ...(ScoreboardTab && g ? [{ key: "skorbord", label: "Skorbord", icon: "trophy", group: "grafik", render: () => <ScoreboardTab {...gfxProps} /> }] : []),
    ...(SubtitlePanel && g ? [{ key: "altyazi", label: "Altyazı", icon: "list", group: "grafik", render: () => <SubtitlePanel {...gfxProps} /> }] : []),
    ...((BrandTab || PresetsTab) && g ? [{ key: "marka", label: "Marka & ön ayarlar", icon: "palette", group: "grafik", render: () => <div className="st-gfxpair is-brand">{BrandTab && <BrandTab {...gfxProps} />}{PresetsTab && <PresetsTab {...gfxProps} />}</div> }] : []),
    ...((SponsorPanel || LinksPanel) && g ? [{ key: "sponsor", label: "Sponsor & linkler", icon: "handshake", group: "grafik", render: () => <div className="st-gfxpair">{SponsorPanel && <SponsorPanel {...gfxProps} />}{LinksPanel && <LinksPanel {...gfxProps} />}</div> }] : []),
    { key: "ses", label: "Ses", icon: "mic", group: "panel", render: audioPanel },
    { key: "yerlesim", label: "Ekran yerleşimi", icon: "board", group: "yerlesim", render: ({ Section }) => <LayoutSettings Section={Section} layout={lay.layout} setLayout={lay.setLayout} ctrl={() => lay.ctrlRef.current} ctxLabel={layoutValue} onAsk={ask} /> },
  ];
  const railBoardEditor = (Section) => (lay.layout.boards.rail
    ? (
      <Section title="Kısayollar panosu" sub="Eski sol şerit artık bir pano: düğmeleri burada ya da stüdyoda Düzenle kipinde sürükleyerek taşı, köşeden boyutla; başka panolara / sekmelere de taşıyabilirsin.">
        <BoardEditor id="rail" board={lay.layout.boards.rail} layout={lay.layout} setLayout={lay.setLayout} c={lay.ctrlRef.current} ctxLabel={layoutValue} />
        {!lay.has(boardPanelId("rail")) && <button type="button" className="btn btn--sm" onClick={() => lay.ctrlRef.current?.add(boardPanelId("rail"), { direction: "left" })}><Icon name="plus" size={13} /> Kısayollar panosunu ekrana geri koy</button>}
      </Section>
    ) : null);
  /** Ayar şablonu uygulandı: canlı uygulanabilenleri hemen yeniden oku. Dönüş: yeniden yükleme gerekiyor mu. */
  const onProfileApplied = useStable((groups) => {
    if (groups.includes("prefs")) setPrefs(readPrefs());
    if (groups.includes("settings")) reloadSettings();
    if (groups.includes("rail")) rail.reload?.();
    if (groups.includes("dock")) { try { setDock(JSON.parse(localStorage.getItem("studio.dock.v1") || "null")); } catch { /* yoksay */ } }
    if (groups.includes("layout")) lay.reload();
    if (groups.includes("density")) reloadDensity();
    if (groups.includes("led")) { try { const v = JSON.parse(localStorage.getItem("studio.led.v2") || "null"); if (v && led.setPref) led.setPref(v); } catch { /* yoksay */ } }
    return groups.some((k) => !["prefs", "settings", "rail", "dock", "led", "layout", "density"].includes(k));
  });

  /* ───────── Ayarlar sayfası özellikleri (Ayarlar ve Kontrol merkezi gömülü bölümleri ortak) ───────── */
  const settingsProps = {
    settings, set: setSetting, prefs, setPref, led, scenes: sceneList, engine, toast, rail, railCtx, hasModes, brandRef,
    extraSections: settingsExtra, dock, setDock, resetDock, dockDefs, renderRail: railBoardEditor,
    onProfileApplied, canReload: !onAir, RoutePicker, audio: mixer,
    onReset: async () => { if (await ask({ title: "Stüdyo ayarlarını sıfırla", message: "Kodlayıcı, kayıt kalitesi, kısayollar, uyarılar ve görünüm ayarları varsayılana döner. Sahneler ve kaynaklar silinmez.", confirmLabel: "Sıfırla", danger: true })) { resetSettings(); toast("Stüdyo ayarları sıfırlandı.", { tone: "success" }); } },
  };

  /* ───────── KONTROL MERKEZİ: tüm paneller tam hâlleriyle (yerleşimden bağımsız telafi menüsü) ───────── */
  const ccPanel = (key, group, extra = {}) => {
    const d = dockDefs[key];
    if (!d) return null;
    const m = panelMeta(key);
    return { key, panel: key, layoutId: key, group, label: extra.label || d.label || m?.label || key, icon: d.icon || m?.icon, hint: m?.hint, count: d.count || null, kw: extra.kw, render: () => d.render({ passive: true, column: true }) };
  };
  const ccSettings = (sec, group, label, icon, kw) => ({ key: `ayar:${sec}`, group, label, icon, kw: ["ayar", ...(kw || [])], hint: "Ayarlar sayfasındaki bölümün aynısı", render: () => <SettingsPage {...settingsProps} embedded section={sec} onSection={() => {}} onClose={() => {}} /> });
  const ccExtra = (key, group, kw) => {
    const x = settingsExtra.find((e) => e.key === key);
    return x ? { key: `ayar:${key}`, group, label: x.label, icon: x.icon, kw, render: () => <div className="st-set__embed">{x.render()}</div> } : null;
  };
  const ccSections = [
    ccPanel("yayin", "yayin", { kw: ["youtube", "rtmp", "prova", "kayıt", "kalite", "bit hızı", "kodlayıcı", "başlat"] }),
    ccPanel("bolumler", "yayin", { kw: ["youtube", "bölüm", "işaret"] }),
    ccSettings("yayin", "yayin", "Yayın ayarları · kodlama", "sliders", ["çözünürlük", "fps", "kodlayıcı", "anahtar kare"]),
    ccSettings("kayit", "yayin", "Kayıt ayarları", "download", ["yerel kayıt", "kalite", "klasör"]),
    ccSettings(COVER_SECTION.key, "yayin", COVER_SECTION.label, COVER_SECTION.icon, ["kapak", "küçük resim"]),
    ccPanel("sahne", "sahne", { kw: ["sahne", "katman", "şablon", "kaynak"] }),
    { key: "kaynaklar", group: "sahne", label: "Kaynaklar", icon: "camera", kw: ["kamera", "ekran", "telefon", "rtmp", "görsel", "video", "kaynak ekle"], hint: "Kamera, ekran, telefon, görsel, video, metin…",
      render: () => <SourceLibrary config={config} runtimeRef={src.runtimeRef} version={src.version} actions={libActions} /> },
    ccSettings("gecis", "sahne", "Geçişler", "swap", ["geçiş", "stinger", "süre"]),
    ccPanel("tekrar", "tekrar", { kw: ["tekrar", "açı", "kuyruk", "ağır çekim", "önemli an", "yükleme"] }),
    ccSettings("tekrar", "tekrar", "Tekrar ayarları", "repeat", ["süre", "saniye", "doğrudan"]),
    ccPanel("yonetim", "mac", { label: "Maç yönetimi (tümü)", kw: ["reji", "maç", "gol", "kart", "değişiklik"] }),
    ccPanel("yonetimMaclar", "mac", { label: "Maçlar", kw: ["maç seç", "canlı", "yeni maç"] }),
    ccPanel("yonetimReji", "mac", { label: "Reji", kw: ["gol", "kart", "değişiklik", "skor", "saat", "devre"] }),
    ccPanel("yonetimKadro", "mac", { label: "Kadro", kw: ["oyuncu", "kadro", "forma"] }),
    ccPanel("yonetimMacsonu", "mac", { label: "Maç sonu", kw: ["mvp", "puan", "maçın golü", "yayınla"] }),
    ccPanel("yonetimTakimlar", "mac", { label: "Takımlar & oyuncular", kw: ["takım", "oyuncu"] }),
    ccPanel("olaylar", "mac", { kw: ["olay", "gol", "kart"] }),
    ccSettings("mac", "mac", "Reji / Maç ayarları", "board", ["reji"]),
    ccPanel("ses", "ses", { kw: ["mikrofon", "karıştırıcı", "kanal", "fader", "müzik", "yönlendirme"] }),
    ccPanel("golMuzigi", "ses", { kw: ["müzik", "gol"] }),
    ccPanel("muzikCalar", "ses", { kw: ["müzik", "liste", "çalar", "geçiş", "youtube"] }),
    ccExtra("skorbord", "grafik", ["skor", "skorbord", "çeşit"]),
    ccExtra("altyazi", "grafik", ["altyazı", "metin", "bant"]),
    ccExtra("marka", "grafik", ["marka", "logo", "ön ayar", "renk"]),
    ccExtra("sponsor", "grafik", ["sponsor", "link", "bağlantı"]),
    ccSettings(VAR_THEME_SECTION.key, "grafik", VAR_THEME_SECTION.label, VAR_THEME_SECTION.icon, ["var", "tema"]),
    ccPanel("var", "kip", { kw: ["var", "inceleme", "karar"] }),
    ccPanel("roportaj", "kip", { kw: ["röportaj", "konuk", "bant", "kayıt"] }),
    ccSettings("roportaj", "kip", "Röportaj ayarları", "users"),
    ccPanel("ozet", "kip", { kw: ["özet", "highlight", "oluştur", "yükle"] }),
    ccSettings("ozet", "kip", "Özet ayarları", "sparkles"),
    ccPanel("led", "led", { kw: ["led", "ekran", "çıkış", "kayan yazı"] }),
    ccSettings("led", "led", "LED ayarları", "overview"),
    ccPanel("yukleme", "arac", { kw: ["yükleme", "gol klibi", "bağlantı"] }),
    ccSettings("makro", "arac", "Makrolar", "zap", ["makro", "otomasyon"]),
    ccSettings("serit", "arac", "Kısayollar panosu", "zap", ["düğme", "parçacık", "kısayol"]),
    ccSettings("kisayol", "arac", "Klavye kısayolları", "command", ["tuş", "kısayol"]),
  ].filter(Boolean);
  const openControl = useCallback((key) => setCcSection((cur) => key || cur || controlLastSection() || "yayin"), []);
  const ccSectionOf = (panelKey) => (ccSections.some((s) => s.key === panelKey) ? panelKey : "yayin");
  controlRef.current = {
    open: (panelKey) => openControl(panelKey ? ccSectionOf(panelKey) : null),
    // Bölüm anahtarıyla (ör. "kaynaklar", "ayar:skorbord"); yoksa bölümün paneli, o da yoksa ilk bölüm.
    openSection: (key) => openControl(ccSections.some((s) => s.key === key) ? key : ccSectionOf(String(key || "").replace(/^ayar:/, ""))),
  };

  return (
    <PartsProvider dock={dock} setDock={setDock}>
    <div ref={rootRef} className={`studio ws-${ws.key} ${hints ? "" : "no-hints"} ${showMicWarning ? "is-micwarn" : ""}`} style={settings.view.scale !== 100 ? { zoom } : undefined} onPointerDown={mixer.resume}>
      <header className="st-top">
        <div className="st-top__title"><Icon name="broadcast" size={17} strokeWidth={2.2} /><strong>Yayın Stüdyosu</strong></div>
        {live.match
          ? <button type="button" className="st-top__match" onClick={() => setTab("yonetim")} title={`${matchName} — Maç yönetimi`}><b>{live.score.home}–{live.score.away}</b><span>{matchName}</span>{live.match && <small>{live.minute}'</small>}</button>
          : <button type="button" className="st-top__match is-empty" onClick={() => setTab("yonetim")} title="Maç seçmek için Maç yönetimi">Maç seçilmedi</button>}
        <StatusPill state={st.state} since={engine.since} />
        <HealthChip status={st} getStats={comp.getStats} getEncodeStats={engine.getEncodeStats} targetFps={preset.fps} encoding={onAir} goalStress={goalStress.last} goalMeasuring={goalStress.measuring} />
        <span className="st-top__spacer" />
        <LayoutToolbar edit={lay.edit} setEdit={lay.setEdit} ctrlRef={lay.ctrlRef} preset={lay.layout.preset} onSettings={() => openSettings("yerlesim")} />
        {!railHasGoLive && (
          <button type="button" className={`btn ${onAir ? "" : "btn--red"} st-golive`} disabled={busy} onClick={topStart}>
            <Icon name={onAir ? "stop" : "broadcast"} size={14} /> {onAir ? (engine.mode === "rehearsal" ? "Provayı bitir" : "Yayını kapat") : "Yayını başlat"}
          </button>
        )}
        <span className="st-top__sep" />
        <button type="button" className="icon-btn st-help" onClick={() => setHelp(true)} title="Klavye kısayolları (?)"><Icon name="help" size={16} /></button>
        <button type="button" className={`st-ccbtn ${ccSection ? "is-on" : ""}`} onClick={() => (ccSection ? (setCcSection(null), setCcPinned(false)) : openControl())} title="Kontrol merkezi: tüm paneller ve yayın düzenlemeleri tek yerde (paneller ekrandan kaldırılsa da)" aria-pressed={Boolean(ccSection)}><Icon name="command" size={14} /> <span>Kontrol merkezi</span></button>
        <button type="button" className={`icon-btn st-gear ${settingsSection ? "is-on" : ""}`} onClick={() => (settingsSection ? setSettingsSection(null) : openSettings())} title="Stüdyo ayarları"><Icon name="sliders" size={16} /></button>
        <button type="button" className="st-exit" onClick={exitStudio} title="Yayın Stüdyosu'ndan çık (yayın sürüyorsa onay sorulur)"><Icon name="logout" size={14} /> Programdan çık</button>
      </header>

      <div className="st-shell">
        <div className="st-body">
          {/* ── ekran yerleşimi: bölmeler, sekme grupları, panolar (./layout) ── */}
          <Workspace layout={lay.layout} setLayout={lay.setLayout} edit={lay.edit} ctrlRef={lay.ctrlRef} value={layoutValue} />

          {editSceneId && (
            <SceneEditorModal config={config} configRef={configRef} runtimeRef={src.runtimeRef} sceneId={editSceneId} selectedLayerId={selectedLayerId} onSelectLayer={setSelectedLayerId}
              outW={preset.width} outH={preset.height} overrideRef={overrideRef} matchClockRef={matchClockRef}
              isProgram={editSceneId === config.programSceneId} isPreview={studioMode && editSceneId === config.previewSceneId} actions={sceneActions} libActions={libActions}
              graphics={hasGraphics && g?.setVisibility ? g : null} audio={mixer?.setScene ? mixer : null} overlayRef={overlayRef} onClose={closeEditor} />
          )}
        </div>

        {ccSection && (
          <ControlCenter sections={ccSections} section={ccSection} onSection={setCcSection} pinned={ccPinned} onPin={setCcPinned}
            onClose={() => { setCcSection(null); setCcPinned(false); }}
            onOpenInLayout={(id) => { if (!ccPinned) setCcSection(null); openPanel(id); }} />
        )}
        {settingsSection && (
          <SettingsPage {...settingsProps} section={settingsSection} onSection={setSettingsSection} onClose={() => setSettingsSection(null)} />
        )}
      </div>

      {monMenu && (
        <div className="st-rmenu is-monitor" style={{ left: monMenu.x, top: monMenu.y }} role="menu">
          <span className="st-rmenu__title">{monMenu.target === "program" ? "Program" : "Önizleme"}</span>
          <button type="button" role="menuitem" onClick={() => { setFullscreen(monMenu.target); setMonMenu(null); }}><Icon name="overview" size={13} /> Tam ekran göster</button>
          {monMenu.target === "preview" && <button type="button" role="menuitem" disabled={!canTake} onClick={() => { toProgram(); setMonMenu(null); }}><Icon name="chevronRight" size={13} /> Yayına al (Geçiş)</button>}
          {monMenu.target === "preview" && !modes.previewOverride && previewScene && <button type="button" role="menuitem" onClick={() => { sceneActions.onEditFull(previewScene.id); setMonMenu(null); }}><Icon name="pencil" size={13} /> Sahneyi düzenle…</button>}
          {monMenu.target === "preview" && !modes.previewOverride && previewScene && <button type="button" role="menuitem" onClick={() => { sceneActions.onEditInline(previewScene.id); setMonMenu(null); }}><Icon name="layers" size={13} /> Katmanları yanda göster</button>}
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
          onRequestAccess={src.requestAccess} onRefreshDevices={src.refreshDevices} onSave={saveSource} onClose={closeDialog} runtimeRef={src.runtimeRef}
          config={config} onPatchSource={onResolve} />
      )}
      {collectionsOpen && <CollectionsDialog config={config} onAir={engine.active} ask={ask} onClose={() => setCollectionsOpen(false)}
        onLoad={(cfg) => { const next = loadScenesConfig({ getItem: () => JSON.stringify(cfg) }); applyConfig(() => next); toast("Koleksiyon yüklendi.", { tone: "success", timeout: 2500 }); }} />}
      {fxPanel && (() => {
        const fxSource = config.sources.find((s) => s.id === fxPanel.sourceId);
        if (!fxSource) return null;
        const scFx = fxPanel.sceneId ? config.scenes.find((s) => s.id === fxPanel.sceneId) : null;
        const choices = scFx ? [...new Set(scFx.layers.map((l) => l.sourceId))].map((id) => config.sources.find((s) => s.id === id)).filter((s) => s && FX_KINDS.has(s.kind)) : [];
        return <FxFloat source={fxSource} runtimeRef={src.runtimeRef} onChange={(fx) => setSourceFx(fxSource.id, fx)} onClose={closeFx}
          onAir={programIds.includes(fxSource.id) || (config.scenes.find((s) => s.id === config.programSceneId)?.layers || []).some((l) => l.sourceId === fxSource.id)}
          sources={choices} onSwitch={(id) => setFxPanel((p) => ({ ...p, sourceId: id }))} />;
      })()}
      {gallery && <TemplateGallery anchor={gallery.anchor} onTemplate={onTemplate} onClose={() => setGallery(null)} />}
      {tplKey && <TemplateDialog tplKey={tplKey} config={config} onCreate={createFromTemplate} onClose={() => setTplKey(null)} />}
      {help && <HelpModal hotkeys={settings.hotkeys} onClose={() => setHelp(false)} />}
      {/* ── röportaj: kayıt bitince inceleme (izle → web sitesine yükle / sil) ── */}
      <InterviewReviewHost iv={interview} />
      {/* [gol-müziği] çalarken büyük "MÜZİĞİ KES" hapı (portal: düzenden bağımsız, sahnenin üstünde ortada) */}
      <MacroPromptHost />
      {GoalMusicStopPill && goalMusic && <GoalMusicStopPill gm={goalMusic} hotkey={settings.hotkeys.goalMusicStop?.[0] ? keyText(settings.hotkeys.goalMusicStop[0]) : null} />}
      {ytStart.dialog /* [medya] YouTube başlatma penceresi */}
    </div>
    </PartsProvider>
  );
}
