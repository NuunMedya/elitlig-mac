// Yayın Stüdyosu — VAR KONTROLÜ modu: durum, tekrar videosu, giriş / çıkış.
//
// VAR açıkken karıştırıcı programa sahne yerine VAR çerçevesini çizer
// (varRef). Program sahnesi değişmez: "VAR'dan çık" tek tıkla önceki
// programa döner. Giriş / çıkış markalı logo geçişiyle (stinger) olur.
// Tekrar videosu her zaman SESSİZ (canlı mikrofon sürer).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { normalizeVar } from "../../../lib/studio/var";

function canvasSafe(el) {
  try {
    const c = document.createElement("canvas");
    c.width = 2; c.height = 2;
    const x = c.getContext("2d");
    x.drawImage(el, 0, 0, 2, 2);
    x.getImageData(0, 0, 1, 1);
    return true;
  } catch { return false; }
}

function angleUrl(replays, replayId, angle) {
  const r = (replays || []).find((x) => x.id === replayId) || null;
  if (!r) return null;
  const a = r.angles?.find((x) => x.angle === angle && x.url) || r.angles?.find((x) => x.url);
  return a?.url || null;
}

/** varRef: karıştırıcının kare başına okuduğu ref (Studio kurar). */
export function useVar({ varRef, settings, onSettings, replays, playStinger, onError }) {
  const v = useMemo(() => normalizeVar(settings), [settings]);
  const [active, setActive] = useState(false);
  const activeRef = useRef(false);
  const video = useMemo(() => {
    const el = document.createElement("video");
    el.muted = true;
    el.playsInline = true;
    el.preload = "auto";
    return el;
  }, []);
  const errRef = useRef(onError);
  errRef.current = onError;

  const needsReplay = v.mode === "replay" || v.mode === "both";
  const url = needsReplay ? angleUrl(replays, v.replayId, v.angle) : null;

  // Tekrar klibi: seçilince yüklenir (önce CORS'lu, olmazsa düz); tuvali
  // kirletecekse çizilmez. VAR açıkken oynar (döngü, hız anında).
  const [safe, setSafe] = useState(false);
  useEffect(() => {
    setSafe(false);
    if (!url) { try { video.pause(); } catch { /* yoksay */ } video.removeAttribute("src"); video.load?.(); return undefined; }
    let triedPlain = false;
    const onData = () => setSafe(canvasSafe(video));
    const onErr = () => {
      if (triedPlain) return;
      triedPlain = true;
      video.removeAttribute("crossorigin");
      video.src = url;
      video.load();
    };
    video.addEventListener("loadeddata", onData);
    video.addEventListener("error", onErr);
    if (/^(blob|data):/i.test(url)) video.removeAttribute("crossorigin"); else video.crossOrigin = "anonymous";
    video.src = url;
    video.load();
    return () => { video.removeEventListener("loadeddata", onData); video.removeEventListener("error", onErr); };
  }, [url, video]);
  useEffect(() => { video.loop = v.loop; video.playbackRate = v.rate; }, [v.loop, v.rate, video]);
  useEffect(() => {
    if (active && url) { video.currentTime = video.currentTime || 0; video.play().catch(() => {}); } else { try { video.pause(); } catch { /* yoksay */ } }
  }, [active, url, video]);

  // Kare başına okunan durum (karıştırıcı).
  varRef.current = { active, mode: v.mode, title: v.title, subtitle: v.subtitle, sourceId: v.mode === "source" || v.mode === "both" ? v.sourceId : null, video: url && safe ? video : null, rate: v.rate };

  const enter = useCallback(() => {
    if (activeRef.current) return;
    if (needsReplay && !url) errRef.current?.("VAR için tekrar seçilmedi: yalnız arka plan gösteriliyor.");
    activeRef.current = true;
    playStinger({ onMid: () => { video.currentTime = 0; setActive(true); } });
  }, [needsReplay, playStinger, url, video]);

  const exit = useCallback(() => {
    if (!activeRef.current) return;
    activeRef.current = false;
    playStinger({ onMid: () => setActive(false) });
  }, [playStinger]);

  const toggle = useCallback(() => (activeRef.current ? exit() : enter()), [enter, exit]);
  const set = useCallback((patch) => onSettings((s) => normalizeVar({ ...(s || {}), ...patch })), [onSettings]);
  const restart = useCallback(() => { video.currentTime = 0; if (activeRef.current) video.play().catch(() => {}); }, [video]);

  return { settings: v, active, varRef, enter, exit, toggle, set, restart, replayUrl: url, video };
}
