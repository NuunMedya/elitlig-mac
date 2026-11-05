// Maç yönetimi · Reji sol sütunu: skor kartları (+GOL), son golü geri al,
// büyük saat + devre + düzeltme, aşama düğmesi (başlat / devre arası / bitir…).
import React from "react";
import { Icon } from "../../../components/ui";
import { HALF_MS, PHASE_LABEL, eventLabel, isGoalCode, primaryControl } from "../../../lib/studio/match";
import { clockText } from "../../../lib/studio/scorebug";

const NUDGES = [-60_000, -10_000, 10_000, 60_000];

export default function RejiControls({ live, busy, onGoal, onControl, onFinish, onUndo, onNudge }) {
  const primary = primaryControl(live.phase);
  const lastGoal = [...(live.timeline || [])].reverse().find((e) => isGoalCode(e.olay_kodu));
  const notLive = live.status !== "canli";
  return (
    <div className="mg-stack rj-controls">
      <div className="rj-scores">
        {["home", "away"].map((side) => (
          <div key={side} className={`rj-score is-${side}`}>
            <span className="rj-score__name" title={side === "home" ? live.homeName : live.awayName}>{side === "home" ? live.homeName : live.awayName}</span>
            <strong className="rj-score__value">{side === "home" ? live.score.home : live.score.away}</strong>
            <button type="button" className="btn btn--sm rj-goal" onClick={() => onGoal(side)} disabled={busy || live.manual} title="Gol: tekrar kaydı başlar, ardından golcü seçilir">
              <Icon name="plus" size={13} strokeWidth={2.6} /> GOL
            </button>
          </div>
        ))}
      </div>
      {live.manual && <p className="mg-note">Skor elle / hükmen tescil edildi; goller skoru değiştirmez.</p>}
      {lastGoal && (
        <button type="button" className="rj-undo" onClick={() => onUndo(lastGoal)} disabled={busy}>
          <Icon name="undo" size={12} />
          <span>Son gol: {live.nameOf(lastGoal.oyuncu_id) || "oyuncusuz"} · {eventLabel(lastGoal.olay_kodu)} {lastGoal.dakika ?? 0}' — geri al</span>
        </button>
      )}

      <div className="rj-clock">
        <strong>{clockText(live.clockMs)}</strong>
        <span>{PHASE_LABEL[live.phase]} · {live.period >= 3 ? "Uzatma" : `${live.period}. devre`}</span>
        <div className="rj-clock__nudges">
          {NUDGES.map((d) => (
            <button key={d} type="button" className="btn btn--xs" disabled={busy || notLive} onClick={() => onNudge(d)} title={`Saati ${d > 0 ? "ileri" : "geri"} al`}>
              {d > 0 ? "+" : "−"}{Math.abs(d) >= 60_000 ? "1 dk" : "10 sn"}
            </button>
          ))}
        </div>
      </div>

      <button type="button" className={`btn btn--block ${primary.finish ? "btn--red" : "btn--green"}`} disabled={busy || !live.match}
        onClick={() => (primary.finish ? onFinish() : onControl(primary.action))}>
        <Icon name={primary.icon} size={14} /> {primary.label}
      </button>
      <div className="mg-inline mg-wrap">
        {live.running && <button type="button" className="btn btn--sm mg-grow" disabled={busy} onClick={() => onControl("pause")}><Icon name="pause" size={13} /> Saati durdur</button>}
        {live.phase === "second" && live.clockMs >= HALF_MS * 2 && <button type="button" className="btn btn--sm mg-grow" disabled={busy} onClick={() => onControl("extra")}><Icon name="clock" size={13} /> Uzatmaya geç</button>}
        {live.phase === "paused" && live.period >= 2 && <button type="button" className="btn btn--sm btn--danger-ghost mg-grow" disabled={busy} onClick={onFinish}><Icon name="flag" size={13} /> Maçı bitir</button>}
      </div>
      {notLive && live.phase !== "finished" && <p className="mg-muted mg-small">Maç başlamadı: olaylar yine girilebilir, saat maç başlayınca çalışır.</p>}
    </div>
  );
}
