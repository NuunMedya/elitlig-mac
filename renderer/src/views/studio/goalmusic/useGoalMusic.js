// Gol müziği kancası: ayarlar (takım kimliğine göre, localStorage), gizli YouTube
// oynatıcısı, çal / sustur (≈1 sn ses azaltma), "Gol butonuna basınca otomatik çal".
//
//   const gm = useGoalMusic({ homeTeamId, awayTeamId, homeName, awayName, toast? });
//   gm.play("home" | "away")   işaretli saniyeden çalar (yalnız hoparlör, yayına gitmez)
//   gm.stop()                  sesi azaltarak durdurur
//   gm.onGoal(side)            otomatik çal açıksa çalar (GOL düğmeleri, G→H/A kısayolu)
//   gm.playing                 "home" | "away" | null
//   gm.config / gm.setConfig   tüm ayarlar (normalizeGoalMusic)
//   gm.volume / gm.setVolume   0…100 (çalarken anında)
//   gm.autoOnGoal / gm.setAutoOnGoal
//   gm.teams                   { home: { id, name, music }, away: { … } }
//   gm.updateTeam(side, fn) · gm.addLink(side, url) · gm.preview(side, trackId)
//   gm.status                  "idle" | "loading" | "playing" | "fading" ; gm.error
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { addTrack, fadeLevel, normalizeGoalMusic, pickTrack, playerArgs, readGoalMusic, teamKey, teamMusicOf, updateTeamMusic, writeGoalMusic } from "./goalMusic";
import { createHiddenPlayer, playerErrorText } from "./youtubePlayer";

const store = () => { try { return window.localStorage; } catch { return null; } };
const FADE_STEP_MS = 50;

export function useGoalMusic({ homeTeamId = null, awayTeamId = null, homeName = "Ev sahibi", awayName = "Deplasman", toast = null } = {}) {
  const [config, setConfigState] = useState(() => readGoalMusic(store()));
  const cfgRef = useRef(config);
  cfgRef.current = config;
  const setConfig = useCallback((fn) => setConfigState((c) => {
    const next = normalizeGoalMusic(typeof fn === "function" ? fn(c) : fn);
    writeGoalMusic(store(), next);
    return next;
  }), []);

  // Başka pencerede (ör. ikinci stüdyo) değişirse eşitle.
  useEffect(() => {
    const onStorage = (e) => { if (e.key && e.key.startsWith("studio.goalMusic")) setConfigState(readGoalMusic(store())); };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const ids = useMemo(() => ({ home: teamKey(homeTeamId), away: teamKey(awayTeamId) }), [homeTeamId, awayTeamId]);
  const idsRef = useRef(ids);
  idsRef.current = ids;
  const teams = useMemo(() => ({
    home: { side: "home", id: ids.home, name: homeName, music: teamMusicOf(config, ids.home) },
    away: { side: "away", id: ids.away, name: awayName, music: teamMusicOf(config, ids.away) },
  }), [config, ids, homeName, awayName]);

  const [playing, setPlaying] = useState(null);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState(null);
  const playingRef = useRef(null);
  const setPlay = (v) => { playingRef.current = v; setPlaying(v); };
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const say = (m, tone = "warn") => { setError(tone === "error" ? m : null); toastRef.current?.(m, { tone, timeout: 5000 }); };

  /* ───────── oynatıcı ───────── */
  const playerRef = useRef(null); // Promise<{ player, destroy }>
  const fadeRef = useRef(null);
  const clearFade = () => { if (fadeRef.current) { clearInterval(fadeRef.current); fadeRef.current = null; } };
  const ensurePlayer = useCallback(() => {
    if (!playerRef.current) {
      playerRef.current = createHiddenPlayer({
        onState: (st) => {
          // 1 çalıyor, 0 bitti, 2 duraklatıldı
          if (st === 1) setStatus((s) => (s === "fading" ? s : "playing"));
          if (st === 0) { clearFade(); setPlay(null); setStatus("idle"); }
        },
        onError: (code) => { clearFade(); setPlay(null); setStatus("idle"); say(playerErrorText(code), "error"); },
      }).catch((e) => { playerRef.current = null; throw e; });
    }
    return playerRef.current;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { clearFade(); Promise.resolve(playerRef.current).then((p) => p?.destroy()).catch(() => {}); }, []);

  // Bağlantı varsa oynatıcıyı önceden hazırla (ilk golde gecikme olmasın).
  const hasTracks = teams.home.music.tracks.length + teams.away.music.tracks.length > 0;
  useEffect(() => {
    if (!hasTracks) return undefined;
    const t = setTimeout(() => { ensurePlayer().catch(() => {}); }, 2500);
    return () => clearTimeout(t);
  }, [hasTracks, ensurePlayer]);

  const startTrack = useCallback(async (side, track) => {
    clearFade();
    setStatus("loading");
    setError(null);
    setPlay(side);
    try {
      const { player } = await ensurePlayer();
      if (playingRef.current !== side) return false; // bu arada susturuldu
      player.setVolume(cfgRef.current.volume);
      player.unMute?.();
      player.loadVideoById(playerArgs(track));
      return true;
    } catch (e) {
      setPlay(null);
      setStatus("idle");
      say(e?.message || "Gol müziği çalınamadı.", "error");
      return false;
    }
  }, [ensurePlayer]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Takımın gol müziğini çal. */
  const play = useCallback(async (side) => {
    const s = side === "away" ? "away" : "home";
    const id = idsRef.current[s];
    if (!id) { say("Önce maç seç: gol müziği takıma göre saklanır."); return false; }
    const pick = pickTrack(teamMusicOf(cfgRef.current, id));
    if (!pick) { say(`${s === "home" ? homeName : awayName} için gol müziği bağlantısı yok (Reji › Gol müziği).`); return false; }
    if (pick.next.mode === "rotate") setConfig((c) => updateTeamMusic(c, id, pick.next));
    return startTrack(s, pick.track);
  }, [homeName, awayName, setConfig, startTrack]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Belirli bir bağlantıyı dene (ayarlar ekranı). */
  const preview = useCallback((side, trackId) => {
    const s = side === "away" ? "away" : "home";
    const track = teamMusicOf(cfgRef.current, idsRef.current[s]).tracks.find((t) => t.id === trackId);
    return track ? startTrack(s, track) : Promise.resolve(false);
  }, [startTrack]);

  /** Sesi ~fadeMs içinde azaltıp durdur. */
  const stop = useCallback(async ({ fade = true } = {}) => {
    clearFade();
    const p = playerRef.current ? await playerRef.current.catch(() => null) : null;
    if (!p || !playingRef.current) { setPlay(null); setStatus("idle"); return; }
    const { player } = p;
    const vol = cfgRef.current.volume;
    const ms = fade ? cfgRef.current.fadeMs : 0;
    const finish = () => {
      clearFade();
      try { player.stopVideo(); } catch { /* yoksay */ }
      try { player.setVolume(vol); } catch { /* yoksay */ }
      setPlay(null);
      setStatus("idle");
    };
    if (!ms) { finish(); return; }
    setStatus("fading");
    const t0 = performance.now();
    fadeRef.current = setInterval(() => {
      const t = (performance.now() - t0) / ms;
      try { player.setVolume(fadeLevel(vol, t)); } catch { /* yoksay */ }
      if (t >= 1) finish();
    }, FADE_STEP_MS);
  }, []);

  /** GOL düğmesi / kısayolu: otomatik çal açıksa çalar. */
  const onGoal = useCallback((side) => {
    if (!cfgRef.current.autoOnGoal) return false;
    const id = idsRef.current[side === "away" ? "away" : "home"];
    if (!id || !teamMusicOf(cfgRef.current, id).tracks.length) return false;
    play(side);
    return true;
  }, [play]);

  const setVolume = useCallback((v) => {
    const vol = Math.round(Math.min(100, Math.max(0, Number(v) || 0)));
    setConfig((c) => ({ ...c, volume: vol }));
    if (playingRef.current && !fadeRef.current) Promise.resolve(playerRef.current).then((p) => p?.player?.setVolume(vol)).catch(() => {});
  }, [setConfig]);
  const setAutoOnGoal = useCallback((on) => setConfig((c) => ({ ...c, autoOnGoal: Boolean(on) })), [setConfig]);
  const updateTeam = useCallback((side, fn) => {
    const id = idsRef.current[side === "away" ? "away" : "home"];
    if (id) setConfig((c) => updateTeamMusic(c, id, fn));
  }, [setConfig]);
  const addLink = useCallback((side, url, extra = {}) => {
    const id = idsRef.current[side === "away" ? "away" : "home"];
    if (!id) return { ok: false, reason: "Önce maç seç." };
    const res = addTrack(cfgRef.current, id, { url, ...extra });
    if (!res.ok) return { ok: false, reason: "Geçerli bir YouTube bağlantısı yapıştır (watch?v=, youtu.be/, shorts/)." };
    setConfig(res.config);
    return { ok: true, track: res.track };
  }, [setConfig]);

  return {
    config, setConfig, teams,
    play, stop, preview, onGoal,
    playing, status, error,
    volume: config.volume, setVolume,
    autoOnGoal: config.autoOnGoal, setAutoOnGoal,
    updateTeam, addLink,
  };
}
