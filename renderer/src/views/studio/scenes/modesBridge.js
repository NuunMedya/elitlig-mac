// Yayın Stüdyosu — ÖZEL KİPLER köprüsü ("../modes", tekrar / VAR / röportaj / özet ekibi).
//
// Sözleşme:
//   const modes = useBroadcastModes({ engine, live, g, sources, scenes, settings, audio, replays, toast, ask, … })
//   → { tabs: [{ key, label, icon, render: () => JSX }],
//       previewOverride: null | { id, label, draw(ctx, { width, height, now }), graphics? },
//       programOverride: null | { … aynı },
//       takeToAir(transition?): void, isOnAir: bool, onTransitionTake?: fn }
// Karıştırıcı: previewOverride varsa ÖNİZLEME onu çizer; programOverride varsa
// PROGRAM onu çizer (grafikler yalnız override.graphics === true ise üstüne).
// Geçiş düğmesi: önizleme kipteyse modes.takeToAir(geçiş) çağrılır.
// Modül paralel geliştirildiği için isteğe bağlı yüklenir (yoksa boş kanca).
const first = (mods) => Object.values(mods)[0] || null;
const mod = first(import.meta.glob(["../modes/index.js", "../modes/index.jsx"], { eager: true }));

const NO_MODES = Object.freeze({ tabs: [], previewOverride: null, programOverride: null, takeToAir: () => {}, isOnAir: false, onTransitionTake: null });
const useNoModes = () => NO_MODES;

export const hasModes = typeof mod?.useBroadcastModes === "function";
export const useBroadcastModesSafe = hasModes ? mod.useBroadcastModes : useNoModes;

// Yeni ses karıştırıcısı (aynı modülden): useStudioAudio({ sources, settings }) ve "Ses" paneli.
export const useStudioAudioMod = typeof mod?.useStudioAudio === "function" ? mod.useStudioAudio : null;
export const StudioAudioPanel = mod?.StudioAudioPanel || null;
