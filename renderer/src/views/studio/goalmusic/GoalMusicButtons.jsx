// Gol müziği kısayol düğmeleri (takım başına çal / sustur). Reji panelinde ve
// stüdyonun kısayol alanında kullanılabilir.
//
//   <GoalMusicButtons gm={gm} />                 iki takım yan yana
//   <GoalMusicButtons gm={gm} sides={["home"]} compact />
//
// Müzik çalarken (hangi takımınki olursa olsun) bütün düğmeler tek bir büyük
// "MÜZİĞİ KES" düğmesine döner: kalan süre ve takım adıyla.
import React from "react";
import { Icon } from "../../../components/ui";
import { Bars } from "./GoalMusicPanel";
import { useMusicClock } from "./GoalMusicStopPill";
import "./goalmusic.css";

export default function GoalMusicButtons({ gm, sides = ["home", "away"], compact = false, className = "" }) {
  const clock = useMusicClock(gm);
  if (!gm) return null;
  if (gm.playing) {
    const team = gm.teams[gm.playing];
    return (
      <div className={`gm-btns${compact ? " is-compact" : ""} ${className}`} role="group" aria-label="Gol müziği">
        <button type="button" className={`gm-btn is-${gm.playing} is-on is-kill`} onClick={() => gm.stop()} title="Gol müziğini kes (sesi azaltarak durdurur)">
          <Bars /> <span>{gm.status === "fading" ? "Kısılıyor…" : compact ? "KES" : `MÜZİĞİ KES${team?.name ? ` · ${team.name}` : ""}`}</span>
          {clock.text && <small className="gm-btn__time">{clock.ratio != null ? "−" : ""}{clock.text}</small>}
        </button>
      </div>
    );
  }
  return (
    <div className={`gm-btns${compact ? " is-compact" : ""} ${className}`} role="group" aria-label="Gol müziği">
      {sides.map((side) => {
        const team = gm.teams[side];
        const empty = !team.music.tracks.length;
        return (
          <button key={side} type="button" className={`gm-btn is-${side}`} disabled={empty} onClick={() => gm.play(side)}
            title={empty ? `${team.name}: gol müziği bağlantısı yok (Reji › Gol müziği)` : `${team.name} gol müziğini çal (yalnız hoparlör)`}>
            <Icon name="music" size={compact ? 12 : 13} /> <span>{compact ? "Müzik" : `Gol müziği${sides.length > 1 ? ` · ${team.name}` : ""}`}</span>
          </button>
        );
      })}
    </div>
  );
}
