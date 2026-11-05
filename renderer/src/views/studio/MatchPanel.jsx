// Yayın Stüdyosu · Maç sekmesi: skor kartları (GOL), son golü geri al,
// büyük saat + devre, aşama düğmesi ve saat düzeltme.
import React from "react";
import { Icon, Kbd } from "../../components/ui";
import { HALF_MS, PHASE_LABEL, eventLabel, isGoalCode, primaryControl } from "../../lib/studio/match";
import { clockText } from "../../lib/studio/scorebug";

const NUDGES = [-60_000, -10_000, 10_000, 60_000];

export default function MatchPanel({ live, saving, goalArmed, onGoal, onControl, onFinish, onUndo, onNudge }) {
  const primary = primaryControl(live.phase);
  const lastGoal = [...live.timeline].reverse().find((e) => isGoalCode(e.olay_kodu));
  const notLive = live.status !== "canli";

  return (
    <div className="st-stack">
      <div className="st-scores">
        {["home", "away"].map((side) => (
          <div key={side} className={`st-score is-${side}`}>
            <span className="st-score__name" title={side === "home" ? live.homeName : live.awayName}>{side === "home" ? live.homeName : live.awayName}</span>
            <strong className="st-score__value">{side === "home" ? live.score.home : live.score.away}</strong>
            <button type="button" className="btn st-goal-btn" onClick={() => onGoal(side)} disabled={saving || live.manual} title={`Gol (G sonra ${side === "home" ? "H" : "A"})`}>
              <Icon name="plus" size={14} strokeWidth={2.6} /> GOL
            </button>
          </div>
        ))}
      </div>
      {goalArmed && <p className="st-hint is-armed">Gol: ev sahibi için <Kbd>H</Kbd>, deplasman için <Kbd>A</Kbd>; vazgeçmek için başka bir tuş.</p>}
      {live.manual && <p className="st-hint">Skor elle / hükmen tescil edildi; goller skoru değiştirmez.</p>}
      {notLive && live.phase !== "finished" && <p className="st-hint">Olay girmek için önce maçı başlat.</p>}
      {lastGoal && (
        <button type="button" className="st-undo" onClick={() => onUndo(lastGoal)} disabled={saving}>
          <Icon name="undo" size={13} />
          <span>Son gol: {live.nameOf(lastGoal.oyuncu_id) || "oyuncusuz"} · {eventLabel(lastGoal.olay_kodu)} {lastGoal.dakika ?? 0}' — geri al</span>
        </button>
      )}

      <div className="st-clock">
        <strong>{clockText(live.clockMs)}</strong>
        <span>{PHASE_LABEL[live.phase]} · {live.period >= 3 ? "Uzatma" : `${live.period}. devre`}</span>
        <div className="st-clock__nudges">
          {NUDGES.map((d) => (
            <button key={d} type="button" className="btn btn--sm" disabled={saving || notLive} onClick={() => onNudge(d)} title={`Saati ${d > 0 ? "ileri" : "geri"} al`}>
              {d > 0 ? "+" : "−"}{Math.abs(d) >= 60_000 ? "1 dk" : "10 sn"}
            </button>
          ))}
        </div>
      </div>

      <button type="button" className={`btn btn--lg btn--block ${primary.finish ? "btn--red" : "btn--green"}`} disabled={saving || !live.match}
        onClick={() => (primary.finish ? onFinish() : onControl(primary.action))}>
        <Icon name={primary.icon} size={15} /> {primary.label}
      </button>
      <div className="st-row">
        {live.running && <button type="button" className="btn btn--block" disabled={saving} onClick={() => onControl("pause")}><Icon name="pause" size={13} /> Saati durdur</button>}
        {live.phase === "second" && live.clockMs >= HALF_MS * 2 && <button type="button" className="btn btn--block" disabled={saving} onClick={() => onControl("extra")}><Icon name="clock" size={13} /> Uzatmaya geç</button>}
        {live.phase === "paused" && live.period >= 2 && <button type="button" className="btn btn--block btn--danger-ghost" disabled={saving} onClick={onFinish}><Icon name="flag" size={13} /> Maçı bitir</button>}
      </div>
    </div>
  );
}
