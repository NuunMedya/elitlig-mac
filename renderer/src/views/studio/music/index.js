// Yayın Stüdyosu — MÜZİK ÇALAR modülü (gol müziğinin oynatıcı motorunu paylaşır).
//
//   import { useMusicPlayer, MusicPanel, NowPlaying } from "./music";
//   const mp = useMusicPlayer({ mixer, toast });   → bkz. useMusicPlayer.js
//   <MusicPanel mp={mp} />   Reji › Müzik çalar (liste, şimdi çalıyor, geçiş, yayına da ver)
// Varsayılan: yalnız hoparlör. "Yayına da ver": app/studio/musichost.js (sekme sesi yakalama).
export { useMusicPlayer } from "./useMusicPlayer";
export { default as MusicPanel, NowPlaying } from "./MusicPanel";
export * from "./musicModel";
