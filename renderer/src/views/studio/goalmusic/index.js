// Yayın Stüdyosu — GOL MÜZİĞİ modülü.
//
//   import { useGoalMusic, GoalMusicPanel, GoalMusicButtons } from "./goalmusic";
//   const gm = useGoalMusic({ homeTeamId, awayTeamId, homeName, awayName, toast? });
//   → { config, setConfig, play(side), stop(), playing: "home"|"away"|null, volume, setVolume,
//       autoOnGoal, setAutoOnGoal, onGoal(side), teams, updateTeam, addLink, preview, status, error }
//   <GoalMusicPanel gm={gm} />      ayarlar (Reji › Gol müziği)
//   <GoalMusicButtons gm={gm} />    takım başına çal / sustur (kısayol alanı)
// Ses yalnız hoparlöre gider (gizli YouTube iframe'i), yayın karışımına girmez.
export { useGoalMusic } from "./useGoalMusic";
export { default as GoalMusicPanel } from "./GoalMusicPanel";
export { default as GoalMusicButtons } from "./GoalMusicButtons";
export { parseYoutubeUrl, parseTime, formatTime, normalizeGoalMusic, pickTrack } from "./goalMusic";
