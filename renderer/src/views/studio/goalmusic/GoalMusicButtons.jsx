// Gol müziği kısayol düğmeleri (takım başına çal / sustur). Reji panelinde ve
// stüdyonun kısayol alanında kullanılabilir.
//
//   <GoalMusicButtons gm={gm} />                 iki takım yan yana
//   <GoalMusicButtons gm={gm} sides={["home"]} compact />
import React from "react";
import { Icon } from "../../../components/ui";
import { Bars } from "./GoalMusicPanel";
import "./goalmusic.css";

export default function GoalMusicButtons({ gm, sides = ["home", "away"], compact = false, className = "" }) {
  if (!gm) return null;
  return (
    <div className={`gm-btns${compact ? " is-compact" : ""} ${className}`} role="group" aria-label="Gol müziği">
      {sides.map((side) => {
        const team = gm.teams[side];
        const on = gm.playing === side;
        const empty = !team.music.tracks.length;
        return on ? (
          <button key={side} type="button" className={`gm-btn is-${side} is-on`} onClick={() => gm.stop()} title="Sesi azaltarak durdur">
            <Bars /> <span>Sustur</span>
          </button>
        ) : (
          <button key={side} type="button" className={`gm-btn is-${side}`} disabled={empty} onClick={() => gm.play(side)}
            title={empty ? `${team.name}: gol müziği bağlantısı yok (Reji › Gol müziği)` : `${team.name} gol müziğini çal (yalnız hoparlör)`}>
            <Icon name="music" size={compact ? 12 : 13} /> <span>{compact ? "Müzik" : `Gol müziği${sides.length > 1 ? ` · ${team.name}` : ""}`}</span>
          </button>
        );
      })}
    </div>
  );
}
