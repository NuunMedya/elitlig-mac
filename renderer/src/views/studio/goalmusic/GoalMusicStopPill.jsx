// Gol müziği çalarken sahnenin üstünde, ortada BÜYÜK "MÜZİĞİ KES" hapı: takım adı,
// kalan süre (ya da süresizse geçen süre) ve ilerleme çubuğu. Tık ya da kısayol
// (Ayarlar › Kısayollar › "Gol müziğini KES", varsayılan K) sesi azaltarak durdurur.
// Belgenin gövdesine çizilir (portal): sahne / alt panel düzeninden bağımsız.
//
//   <GoalMusicStopPill gm={useGoalMusic(…)} hotkey="K" />
import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../../../components/ui";
import { formatTime, musicProgress } from "./goalMusic";
import { Bars } from "./GoalMusicPanel";
import "./goalmusic.css";

/** Çalan müziğin saati (saniyede birkaç kez yenilenir): { text, ratio, remainingSec, elapsedSec }. */
export function useMusicClock(gm) {
  const ses = gm?.playing ? gm.session : null;
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    if (!ses) return undefined;
    const t = setInterval(() => setNow(performance.now()), 200);
    return () => clearInterval(t);
  }, [ses]);
  if (!ses) return { text: "", ratio: null, remainingSec: null, elapsedSec: 0 };
  if (ses.startedAt == null) return { text: "yükleniyor…", ratio: null, remainingSec: null, elapsedSec: 0 };
  const pr = musicProgress(ses.plan, now - ses.startedAt);
  const text = pr.remainingSec != null ? formatTime(Math.ceil(pr.remainingSec)) : formatTime(Math.floor(pr.elapsedSec));
  return { text, ratio: pr.ratio, remainingSec: pr.remainingSec, elapsedSec: pr.elapsedSec };
}

export default function GoalMusicStopPill({ gm, hotkey = null }) {
  const clock = useMusicClock(gm);
  if (!gm?.playing || typeof document === "undefined") return null;
  const side = gm.playing;
  const team = gm.teams?.[side];
  const fading = gm.status === "fading";
  const timed = clock.ratio != null;
  return createPortal(
    <div className={`gm-pill is-${side}${fading ? " is-fading" : ""}`} role="region" aria-label="Gol müziği çalıyor">
      <button type="button" className="gm-pill__btn" onClick={() => gm.stop()} title={`Gol müziğini kes${hotkey ? ` (${hotkey})` : ""} — sesi azaltarak durdurur`}>
        <span className="gm-pill__icon"><Icon name="stop" size={22} strokeWidth={2.6} /></span>
        <span className="gm-pill__text">
          <strong>{fading ? "KISILIYOR…" : "MÜZİĞİ KES"}</strong>
          <small><Bars /> {team?.name || "Gol müziği"} · {gm.session?.startedAt == null ? "yükleniyor…" : timed ? `${clock.text} kaldı` : `süresiz · ${clock.text}`}</small>
        </span>
        {hotkey && <kbd className="gm-pill__kbd">{hotkey}</kbd>}
      </button>
      <span className="gm-pill__bar" aria-hidden="true"><i style={{ width: timed ? `${Math.round(clock.ratio * 1000) / 10}%` : "100%" }} className={timed ? "" : "is-open"} /></span>
    </div>,
    document.body,
  );
}
