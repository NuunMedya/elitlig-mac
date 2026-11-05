// Yayın Stüdyosu · Olay sekmesi: takım başına kart / penaltı / kafa / frikik /
// kendi kalesine düğmeleri ve son olaylar (silinebilir).
import React from "react";
import { Icon } from "../../components/ui";
import { QUICK_EVENTS, eventLabel, eventSide } from "../../lib/studio/match";

export default function EventsPanel({ live, onAsk, onRemove }) {
  const recent = [...live.timeline].reverse().slice(0, 10);
  return (
    <div className="st-stack">
      {["home", "away"].map((side) => {
        const name = side === "home" ? live.homeName : live.awayName;
        return (
          <section key={side} className="st-stack st-stack--tight">
            <h5 className={`st-group is-${side}`}>{name}</h5>
            <div className="st-quick">
              {QUICK_EVENTS.map((q) => (
                <button key={q.code} type="button" className={`st-quick__btn is-${q.tone}`} onClick={() => onAsk(side, q.code, `${name} — ${q.label}`)}>
                  <span className="st-quick__mark" />{q.label}
                </button>
              ))}
            </div>
          </section>
        );
      })}
      <h5 className="st-group">Son olaylar</h5>
      {recent.length ? (
        <ul className="st-events">
          {recent.map((ev) => {
            const side = eventSide(ev, live.homeTeamId, live.awayTeamId) || "home";
            const label = `${eventLabel(ev.olay_kodu)} ${ev.dakika ?? 0}'`;
            return (
              <li key={ev.id} className={`is-${side}`}>
                <span className="st-events__dot" />
                <span className="st-events__text"><strong>{label}</strong><small>{live.nameOf(ev.oyuncu_id ?? ev.oyuncu_giren_id) || (side === "home" ? live.homeName : live.awayName)}</small></span>
                <button type="button" className="icon-btn icon-btn--xs" title="Olayı sil" onClick={() => onRemove(ev, label)}><Icon name="trash" size={13} /></button>
              </li>
            );
          })}
        </ul>
      ) : <p className="st-hint">Henüz gol / kart girilmedi.</p>}
    </div>
  );
}
