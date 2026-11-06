// Maç sonu · "Maçın golü" / "Maçın kurtarışı" seçici: olaylardan (GOAL_* ya da
// SAVE) aday kartları — dakika, oyuncu, takım ve varsa tekrar / gol klibi
// kapağı + oynat düğmesi. Seçim olayı, dakikayı, takımı ve klibi saklar.
import React from "react";
import { Icon } from "../../../components/ui";
import { manageEventLabel } from "../../../lib/studio/manage";

export default function MomentPicker({ title, icon = "award", kind = "goal", candidates = [], selectedEventId = null, onSelect, onPlay, teamName, playerSlot }) {
  const empty = kind === "save"
    ? "Bu maçta kurtarış olayı yok. Reji › Diğer › Kurtarış ile girilen anlar burada listelenir; aşağıdan yalnız oyuncu da seçebilirsin."
    : "Bu maçta gol olayı yok. Goller Reji'den girilince (tekrar klibiyle) burada listelenir; aşağıdan yalnız oyuncu da seçebilirsin.";
  return (
    <section className="pt-moment" aria-label={title}>
      <header className="pt-moment__head">
        <h6><Icon name={icon} size={14} /> {title}</h6>
        <small>{candidates.length ? `${candidates.length} aday · olaydan ya da tekrardan seç` : "aday yok"}</small>
        <span className="mg-grow" />
        {selectedEventId != null && <button type="button" className="btn btn--xs btn--ghost" onClick={() => onSelect(null)}><Icon name="x" size={11} /> Seçimi kaldır</button>}
      </header>
      {candidates.length ? (
        <div className="pt-moment__list" role="radiogroup" aria-label={title}>
          {candidates.map((c) => {
            const on = Number(selectedEventId) === c.eventId;
            return (
              <div key={c.eventId} className={`pt-cand is-${c.side || "none"}${on ? " is-on" : ""}`}>
                <button type="button" className="pt-cand__thumb" onClick={() => (c.hasClip ? onPlay?.(c) : onSelect(c))} title={c.hasClip ? "Klibi izle" : "Klip yok"} aria-label={c.hasClip ? "Klibi izle" : "Klip yok"}>
                  {c.posterUrl ? <img src={c.posterUrl} alt="" loading="lazy" /> : <span className="pt-cand__ph"><Icon name={kind === "save" ? "shield" : "ball"} size={20} /></span>}
                  {c.hasClip ? <span className="pt-cand__play"><Icon name="play" size={14} /></span> : <span className="pt-cand__noclip">Klip yok</span>}
                  <span className="pt-cand__min">{c.minute}'</span>
                </button>
                <button type="button" role="radio" aria-checked={on} className="pt-cand__body" onClick={() => onSelect(on ? null : c)}>
                  <strong>{c.playerName || "Oyuncusuz"}</strong>
                  <small>{teamName?.(c.side) || "—"} · {manageEventLabel(c.code)}{c.period >= 3 ? " · uzatma" : ` · ${c.period}. yarı`}</small>
                  <span className={`pt-cand__pick${on ? " is-on" : ""}`}>{on ? <><Icon name="check" size={12} /> Seçildi</> : "Seç"}</span>
                </button>
              </div>
            );
          })}
        </div>
      ) : <p className="mg-muted">{empty}</p>}
      {playerSlot}
    </section>
  );
}
