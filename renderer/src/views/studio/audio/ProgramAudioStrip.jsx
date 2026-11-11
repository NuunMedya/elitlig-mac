// Yayın Stüdyosu — PROGRAM SES ŞERİDİ (Program ekranının altında).
//
// O an yayına giden (ya da sessizi açılınca gidecek) ses kanalları tek sırada:
// mikrofon, bu sahnedeki ek kaynaklar, programdaki videoların sesi, tekrar / VAR /
// özet sesi, müzik. Her kanalda canlı dalga / seviye çizgisi; tıklayınca ANINDA
// sessiz / açık. Sağda PROGRAM (master) ölçeri ve "Tüm sesleri kapat".
//
// Ölçerler tek requestAnimationFrame döngüsünde, ~30 kare/sn, küçük tuvallere
// doğrudan çizilir (React yeniden çizimi yok). Aynı şeridi paylaşan kanallar
// (ör. iki video kaynağı → "media") karede bir kez okunur.
//
// Props: { mixer, config, programIds } — mixer: useStudioAudio sonucu.
import React, { useEffect, useMemo, useRef } from "react";
import { canvasLoop } from "../perf/renderLoad";
import { Icon } from "../../../components/ui";
import { meterFraction, programAudioChannels, samplesLevel } from "../../../lib/studio/audio";
import AudioHealth from "./AudioHealth";
import "./audio.css";

const HISTORY = 40;
const FRAME_MS = 66; // ~15 fps (ölçer)

/** Tek döngü: kayıtlı tuvallere seviye geçmişi (ayna dalga) çizer. */
function useWaveBank() {
  const items = useRef(new Map()); // key → { canvas, get, muted, hist, i }
  useEffect(() => {
    let buf = null;
    let fadeAt = 0;
    let faint = null;
    const loop = (now) => {
      const cache = new Map();
      for (const it of items.current.values()) {
        const c = it.canvas;
        if (!c || !c.isConnected) continue;
        const tap = it.get?.();
        let lvl = 0;
        if (tap) {
          if (cache.has(tap)) lvl = cache.get(tap);
          else {
            let db = -Infinity;
            for (const a of [tap.L, tap.R]) {
              if (!a) continue;
              if (!buf || buf.length !== a.fftSize) buf = new Float32Array(a.fftSize);
              a.getFloatTimeDomainData(buf);
              db = Math.max(db, samplesLevel(buf).peakDb);
            }
            lvl = meterFraction(db);
            cache.set(tap, lvl);
          }
        }
        it.hist[it.i] = lvl;
        it.i = (it.i + 1) % HISTORY;
        const ctx = c.getContext("2d");
        if (!ctx) continue;
        const W = c.width;
        const H = c.height;
        ctx.clearRect(0, 0, W, H);
        const bw = W / HISTORY;
        const mid = H / 2;
        // Sessiz dalga: tema belirteci (açık temada koyu mürekkep; sabit beyaz açık zeminde kaybolur).
        // getComputedStyle her karede stil hesabı yaptırır: 2 sn'de bir okunur.
        if (it.muted && (!faint || now - fadeAt > 2000)) { fadeAt = now; faint = getComputedStyle(c).getPropertyValue("--faint").trim() || "rgba(255,255,255,0.22)"; }
        const mutedFill = it.muted ? faint : null;
        for (let k = 0; k < HISTORY; k += 1) {
          const v = it.hist[(it.i + k) % HISTORY];
          if (v <= 0.01) continue;
          const h = Math.max(1, v * (H - 2));
          ctx.fillStyle = it.muted ? mutedFill : v > 0.93 ? "#ff3b5c" : v > 0.75 ? "#fbbf24" : "#34d399";
          ctx.fillRect(k * bw, mid - h / 2, Math.max(1, bw - 1), h);
        }
        if (it.muted) {
          ctx.strokeStyle = "rgba(255,59,92,0.85)";
          ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(2, H - 2); ctx.lineTo(W - 2, 2); ctx.stroke();
        }
      }
    };
    return canvasLoop("Program ses şeridi", { fps: 1000 / FRAME_MS }, loop);
  }, []);
  return (key, get, muted) => (canvas) => {
    const prev = items.current.get(key);
    if (!canvas) { if (prev) prev.canvas = null; return; }
    items.current.set(key, { canvas, get, muted, hist: prev?.hist || new Float32Array(HISTORY), i: prev?.i || 0 });
  };
}

function Channel({ ch, bind, mixer }) {
  const get = () => mixer.analyser?.(ch.stripId) || null;
  const toggle = () => (mixer.toggleStripMute ? mixer.toggleStripMute(ch.stripId) : mixer.setStrip?.(ch.stripId, { mute: !ch.muted }));
  const killed = Boolean(mixer.killAll);
  const air = ch.onAir && !killed;
  return (
    <button type="button" className={`pas-ch ${air ? "is-air" : ""} ${ch.muted ? "is-muted" : ""}`} onClick={toggle}
      title={`${ch.label}: ${ch.muted ? "SESSİZ — tıkla: aç" : air ? "YAYINDA — tıkla: sessize al" : ch.reason}`} aria-pressed={!ch.muted}>
      <span className="pas-ch__head">
        <Icon name={ch.muted ? "micOff" : ch.icon} size={11} />
        <span className="pas-ch__name">{ch.label}</span>
        {air ? <i className="au-dot" /> : ch.muted ? <b className="pas-ch__mute">SESSİZ</b> : null}
      </span>
      <canvas ref={bind(ch.key, get, ch.muted || killed)} width={84} height={18} className="pas-ch__wave" />
    </button>
  );
}

export default function ProgramAudioStrip({ mixer, config, programIds }) {
  const bind = useWaveBank();
  const fileState = mixer?.files?.state;
  const filePlaying = useMemo(() => Object.fromEntries(Object.entries(fileState || {}).map(([k, v]) => [k, Boolean(v?.playing)])), [fileState]);
  const channels = useMemo(() => {
    if (!mixer?.settings) return [];
    return programAudioChannels(mixer.settings, {
      context: mixer.playback || "live",
      programSceneId: config?.programSceneId ?? mixer.programSceneId ?? null,
      programIds: programIds || [],
      sources: config?.sources || [],
      musicPlaying: Boolean(mixer.music?.playing),
      filePlaying,
    });
  }, [mixer?.settings, mixer?.playback, mixer?.programSceneId, mixer?.music?.playing, config?.programSceneId, config?.sources, programIds, filePlaying]);
  if (!mixer?.settings || !mixer.available) return null;
  const killed = Boolean(mixer.killAll);
  const live = channels.filter((c) => c.onAir).length;
  return (
    <div className={`pas ${killed ? "is-killed" : ""}`} role="group" aria-label="Yayına giden ses">
      <span className="pas__label" title="Yayına giden ses kanalları — tıkla: sessiz / açık">
        <Icon name="music" size={12} /> SES
        <small>{killed ? "KAPALI" : live ? `${live} kanal` : "yok"}</small>
      </span>
      <div className="pas__list">
        {channels.map((ch) => <Channel key={ch.key} ch={ch} bind={bind} mixer={mixer} />)}
        {!channels.length && <span className="pas__empty">Bu sahnede yayına giden ses yok</span>}
      </div>
      <button type="button" className={`pas-master ${killed ? "is-killed" : ""}`} onClick={() => mixer.setKillAll?.(!killed)}
        title={killed ? "TÜM SESLER KAPALI — tıkla: yayına sesi aç" : "PROGRAM sesi — tıkla: tüm sesleri kapat"}>
        <span className="pas-ch__head"><Icon name={killed ? "micOff" : "broadcast"} size={11} /> <span className="pas-ch__name">{killed ? "TÜMÜ KAPALI" : "PROGRAM"}</span></span>
        <canvas ref={bind("__master", () => mixer.masterAnalyser?.() || null, killed)} width={96} height={18} className="pas-ch__wave" />
      </button>
      <AudioHealth mixer={mixer} />
    </div>
  );
}
