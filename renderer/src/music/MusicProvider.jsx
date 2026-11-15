// Uygulama geneli müzik çalar: kabuğun (App › Shell) kökünde yaşar, görünüm değişince
// çalmaya devam eder. Stüdyonun oynatıcı motorunu kullanır (views/studio/music/useMusicPlayer),
// listesi ayrı anahtarda ("app.music.v1"). Ses yalnız hoparlörden çıkar, yayına gitmez.
//
//   <MusicProvider route={route}>…</MusicProvider>  ·  const mp = useAppMusic();
//
// Menü çubuğu, araç takımı paneli ve medya tuşları ana süreç üzerinden komut yollar
// (window.elitlig.music.onCommand); çalar durumunu ana sürece yayınlar (publish).
import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { useToast } from "../components/ui";
import { useMusicPlayer } from "../views/studio/music/useMusicPlayer";
import { APP_MUSIC_KEY, EMPTY_HINT, publishPayload, shouldPublish, studioTransition } from "./musicApp";

const MusicContext = createContext(null);
export const useAppMusic = () => useContext(MusicContext);
const bridge = () => { try { return window.elitlig?.music || null; } catch { return null; } };

export default function MusicProvider({ route, children }) {
  const toast = useToast();
  const mp = useMusicPlayer({ toast, storageKey: APP_MUSIC_KEY, emptyHint: EMPTY_HINT });
  const mpRef = useRef(mp);
  mpRef.current = mp;

  // Ayar: stüdyo kuralı (Masaüstü araçları › Müzik).
  const [rule, setRule] = useState("pause");
  useEffect(() => {
    const dk = window.elitlig?.deskkit;
    if (!dk) return undefined;
    dk.settings().then((v) => v?.settings && setRule(v.settings.music.studioRule)).catch(() => {});
    return dk.onSettings((v) => v?.settings && setRule(v.settings.music.studioRule));
  }, []);

  // Stüdyo kuralı: stüdyoya girince duraklat, çıkınca (biz duraklattıysak) sürdür.
  const prevRoute = useRef(route);
  const [pausedByStudio, setPausedByStudio] = useState(false);
  const pbsRef = useRef(false);
  useEffect(() => {
    const t = studioTransition({ prevRoute: prevRoute.current, route, rule, status: mpRef.current.now.status, pausedByStudio: pbsRef.current });
    prevRoute.current = route;
    if (t.action === "pause") { mpRef.current.pause(); toast("Genel müzik duraklatıldı: stüdyoda yayın sesini stüdyonun müzik çaları yönetir.", { tone: "info", timeout: 5000 }); }
    if (t.action === "resume") mpRef.current.resume();
    pbsRef.current = t.pausedByStudio;
    setPausedByStudio(t.pausedByStudio);
  }, [route, rule, toast]);
  // Kullanıcı stüdyodayken elle çalarsa kural bırakılır (çıkışta yeniden başlatma yok).
  useEffect(() => { if (pbsRef.current && mp.now.status !== "paused") { pbsRef.current = false; setPausedByStudio(false); } }, [mp.now.status]);

  // Durum → ana süreç (menü çubuğu, panel, medya tuşları).
  const last = useRef({ payload: null, at: 0 });
  useEffect(() => {
    const b = bridge();
    if (!b?.publish) return;
    const payload = publishPayload(mp, { pausedByStudio });
    const now = Date.now();
    if (!shouldPublish(last.current.payload, payload, now, last.current.at)) return;
    last.current = { payload, at: now };
    b.publish(payload);
  }, [mp, pausedByStudio]);

  // Komutlar (menü çubuğu, panel, medya tuşları).
  useEffect(() => {
    const b = bridge();
    if (!b?.onCommand) return undefined;
    return b.onCommand((msg) => {
      const m = mpRef.current;
      const a = msg?.args || {};
      switch (msg?.name) {
        case "toggle": m.toggle(); break;
        case "play": if (m.now.status === "paused") m.resume(); else if (m.now.status === "idle") m.play(); break;
        case "pause": m.pause(); break;
        case "next": m.next(); break;
        case "prev": m.prev(); break;
        case "stop": m.stop(); break;
        case "volume": if (Number.isFinite(Number(a.value))) m.setVolume(Math.min(100, Math.max(0, Number(a.value)))); break;
        case "shuffle": m.setShuffle(!m.config.shuffle); break;
        case "repeat": m.setRepeat(m.config.repeat === "all" ? "one" : m.config.repeat === "one" ? "off" : "all"); break;
        default: break;
      }
    });
  }, []);

  return <MusicContext.Provider value={mp}>{children}</MusicContext.Provider>;
}
