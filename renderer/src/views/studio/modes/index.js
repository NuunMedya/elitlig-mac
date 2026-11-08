// Yayın Stüdyosu — YAYIN MODLARI + SES sözleşmesi (Studio.jsx bunu kullanır).
//
//   const audio = useStudioAudio({
//     sources:  { list: config.sources, runtimeRef: src.runtimeRef, programIds },   // programIds: program sahnesindeki kaynak kimlikleri
//     settings: { value: prefs.audio, onChange: setAudio },                         // setAudio(fn | value); M kısayolu → audio.toggleMic()
//   });
//   engine.getAudioTrack = audio.audioTrack; mixer.resume → audio.resume
//   <StudioAudioPanel audio={audio} devices={src.devices} onRequestMic={…} />      // "Ses" sekmesi
//
//   const modes = useBroadcastModes({
//     engine:   { active: engine.active, program: comp.program, drawScene? },     // drawScene(ctx, W, H, now): program sahnesi (grafiksiz)
//     live, g, matchId,
//     sources:  { list: config.sources, runtimeRef: src.runtimeRef },
//     scenes:   config.scenes,
//     settings: { value: prefs.modes, onChange: (fn) => setPref("modes", fn) },
//     audio,
//     replays:  { ...useReplays(matchId), recordAngles: liveAngles, anglePref: prefs.angles, onAnglePref, angleStatus: angleRec.status,
//                 angleAvailable: angleRec.available, encoding: engine.active, onMoment: captureMoment, onRemove: removeReplay },
//     toast, ask,
//   });
//   → {
//     tabs: [{ key: "tekrar"|"var"|"roportaj"|"ozet", label, icon, count, render: () => JSX }],
//     previewOverride: null | { id, label, mode, graphics: false, draw(ctx, { width, height, now }) },
//     programOverride: null | { id, label, mode, graphics: false, draw(ctx, { width, height, now, drawBase? }) },
//     takeToAir(transition?: { kind, ms } | kind, mode?, payload?): Promise<bool>,  endOnAir(transition?): void,
//     isOnAir, airMode, previewMode, stage ("idle"|"entering"|"onair"|"leaving"),
//     setPreview(mode), clearPreview(mode?), openReplay(replay) = loadReplay(replay, { angles?, angle? }),  // önizlemeye yükler
//     loadLatest(), sendToPreview(r, { rate }), loadQueue(list) (yalnız ilk pozisyon), previewNow(), airNow(), // [önizleme-geçiş] yükleyiciler + eşzamanlı durum (Studio › take)
//     replay: { loadLatest(), loadQueue(list), stop(), playing, index, total, item },  // R: önizlemeye (yayına GEÇİŞ)
//     var: { toggle(), active },                                            // V kısayolu
//     interview,                                                            // useInterview (üst çubuk RÖPORTAJ düğmesi bunu kullanır)
//     highlights,                                                           // useHighlights (Studio kendi useHighlights'ını kaldırır)
//     micWarning,                                                           // VAR yayında + mikrofon açık (operatör uyarısı)
//   }
// Karıştırıcı: programOverride varsa sahne + grafik yerine onun draw'ı çağrılır
// (graphics: false → karıştırıcı grafik ÇİZMEZ; mod kendi katman bayraklarıyla
// çizer). Logo geçişlerinin üstündeki karıştırıcı geçişleri (sahne → sahne) için:
// isStingerKind(kind) ? drawTransitionStinger(ctx, W, H, kind, p, logo, branding) (lib/studio/transitions).
export { useBroadcastModes } from "./BroadcastModes";
export { useStudioAudio } from "../useAudioMixer";
export { default as StudioAudioPanel, LevelMeter } from "../AudioPanel";
export { TRANSITIONS, isStingerKind, drawTransitionStinger } from "../../../lib/studio/transitions";
export { sceneHasVideo } from "../../../lib/studio/audio";
