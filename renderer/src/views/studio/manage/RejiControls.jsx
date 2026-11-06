// Maç yönetimi · Reji sol sütunu: skor tablosu (iki takım, +GOL), büyük saat
// (devre, düzeltme), aşama düğmesi (başlat / devre arası / bitir…), son golü geri al.
import React from "react";
import { Icon } from "../../../components/ui";
import { HALF_MS, PHASE_LABEL, eventLabel, isGoalCode, primaryControl } from "../../../lib/studio/match";
import { clockText } from "../../../lib/studio/scorebug";

const NUDGES = [-60_000, -10_000, 10_000, 60_000];

export default function RejiControls({ live, busy, onGoal, onControl, onFinish, onUndo, onNudge }) {
  const primary = primaryControl(live.phase);
  const lastGoal = [...(live.timeline || [])].reverse().find((e) => isGoalCode(e.olay_kodu));
  const notLive = live.status !== "canli";
  const name = (side) => (side === "home" ? live.homeName : live.awayName);
  return (
    <div className="rj-controls">
      <div className="rj-board" aria-label="Skor">
        {["home", "away"].map((side) => (
          <div key={side} className={`rj-board__team is-${side}`}>
            <span className="rj-board__name" title={name(side)}>{name(side)}</span>
            <strong className="rj-board__score">{side === "home" ? live.score.home : live.score.away}</strong>
            <button type="button" className="rj-goal" onClick={() => onGoal(side)} disabled={busy || live.manual} title="Gol: tekrar kaydı başlar, ardından golcü seçilir">
              <Icon name="plus" size={14} strokeWidth={2.6} /> GOL
            </button>
          </div>
        ))}
      </div>
      {live.manual && <p className="mg-note">Skor elle / hükmen tescil edildi; goller skoru değiştirmez.</p>}

      <div className={`rj-clock${live.running ? " is-running" : ""}`}>
        <span className="rj-clock__phase">{live.running && <span className="mg-live__dot" />}{PHASE_LABEL[live.phase]}{["first", "second", "extra"].includes(live.phase) ? "" : ` · ${live.period >= 3 ? "uzatma" : `${live.period}. devre`}`}</span>
        <strong>{clockText(live.clockMs)}</strong>
        <div className="rj-clock__nudges" role="group" aria-label="Saati düzelt">
          {NUDGES.map((d) => (
            <button key={d} type="button" className="rj-nudge" disabled={busy || notLive} onClick={() => onNudge(d)} title={`Saati ${d > 0 ? "ileri" : "geri"} al`}>
              {d > 0 ? "+" : "−"}{Math.abs(d) >= 60_000 ? "1 dk" : "10 sn"}
            </button>
          ))}
        </div>
      </div>

      <button type="button" className={`btn btn--block rj-primary ${primary.finish ? "btn--red" : "btn--green"}`} disabled={busy || !live.match}
        onClick={() => (primary.finish ? onFinish() : onControl(primary.action))}>
        <Icon name={primary.icon} size={15} /> {primary.label}
      </button>
      {(live.running || (live.phase === "second" && live.clockMs >= HALF_MS * 2) || (live.phase === "paused" && live.period >= 2)) && (
        <div className="rj-secondary">
          {live.running && <button type="button" className="btn btn--sm" disabled={busy} onClick={() => onControl("pause")}><Icon name="pause" size={13} /> Saati durdur</button>}
          {live.phase === "second" && live.clockMs >= HALF_MS * 2 && <button type="button" className="btn btn--sm" disabled={busy} onClick={() => onControl("extra")}><Icon name="clock" size={13} /> Uzatmaya geç</button>}
          {live.phase === "paused" && live.period >= 2 && <button type="button" className="btn btn--sm btn--danger-ghost" disabled={busy} onClick={onFinish}><Icon name="flag" size={13} /> Maçı bitir</button>}
        </div>
      )}
      {lastGoal && (
        <button type="button" className="rj-undo" onClick={() => onUndo(lastGoal)} disabled={busy} title="Son golü sil">
          <Icon name="undo" size={12} />
          <span>Son gol: <b>{live.nameOf(lastGoal.oyuncu_id) || "oyuncusuz"}</b> · {eventLabel(lastGoal.olay_kodu)} {lastGoal.dakika ?? 0}'</span>
          <span className="rj-undo__act">Geri al</span>
        </button>
      )}
      {notLive && live.phase !== "finished" && <p className="mg-muted mg-small">Maç başlamadı: olaylar yine girilebilir, saat maç başlayınca çalışır.</p>}
    </div>
  );
}
