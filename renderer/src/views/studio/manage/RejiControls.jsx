// Maç yönetimi · Reji ORTA sütunu üstü: skor tablosu, büyük saat (devre, düzeltme)
// ve maç akışı düğmeleri — hepsi her an görünür, aşamaya göre etkin:
//   Başlat / Sürdür · Durdur · Devre arası · 2. yarı · Uzatma · Bitir (onaylı)
// Sıradaki önerilen adım (primaryControl) vurgulanır.
import React from "react";
import { Icon } from "../../../components/ui";
import { PHASE_LABEL } from "../../../lib/studio/match";
import { clockText } from "../../../lib/studio/scorebug";
import { flowButtons } from "./rejiLogic";

const NUDGES = [-60_000, -10_000, 10_000, 60_000];

export default function RejiControls({ live, busy, onControl, onFinish, onNudge }) {
  const notLive = live.status !== "canli";
  const finished = live.phase === "finished";
  const buttons = flowButtons(live.phase, { period: live.period, running: live.running });
  return (
    <div className="rj-controls">
      <div className="rj-score" aria-label="Skor">
        <span className="rj-score__team is-home" title={live.homeName}>{live.homeName}</span>
        <strong className="rj-score__num">{live.score.home}</strong>
        <span className="rj-score__sep">–</span>
        <strong className="rj-score__num">{live.score.away}</strong>
        <span className="rj-score__team is-away" title={live.awayName}>{live.awayName}</span>
      </div>
      {live.manual && <p className="mg-note">Skor elle / hükmen tescil edildi; goller skoru değiştirmez.</p>}

      <div className={`rj-clock${live.running ? " is-running" : ""}`}>
        <span className="rj-clock__phase">{live.running && <span className="mg-live__dot" />}{PHASE_LABEL[live.phase]}{["first", "second", "extra", "notStarted", "finished"].includes(live.phase) ? "" : ` · ${live.period >= 3 ? "uzatma" : `${live.period}. devre`}`}</span>
        <strong>{clockText(live.clockMs)}</strong>
        <div className="rj-clock__nudges" role="group" aria-label="Saati düzelt">
          {NUDGES.map((d) => (
            <button key={d} type="button" className="rj-nudge" disabled={busy || notLive} onClick={() => onNudge(d)} title={`Saati ${d > 0 ? "ileri" : "geri"} al`}>
              {d > 0 ? "+" : "−"}{Math.abs(d) >= 60_000 ? "1 dk" : "10 sn"}
            </button>
          ))}
        </div>
      </div>

      {finished ? (
        <button type="button" className="btn btn--block rj-flow__reopen" disabled={busy || !live.match} onClick={() => onControl("reopen")}><Icon name="refresh" size={14} /> Tekrar canlıya al</button>
      ) : (
        <div className="rj-flow" role="group" aria-label="Maç akışı">
          {buttons.map((b) => (
            <button key={b.key} type="button" className={`rj-flow__btn is-${b.key}${b.next ? " is-next" : ""}`} disabled={busy || !live.match || !b.enabled}
              onClick={() => (b.finish ? onFinish() : onControl(b.action))} title={b.next ? "Sıradaki adım" : undefined}>
              <Icon name={b.icon} size={14} /> <span>{b.label}</span>
            </button>
          ))}
        </div>
      )}
      {notLive && !finished && <p className="mg-muted mg-small">Maç başlamadı: olaylar yine girilebilir, saat maç başlayınca çalışır.</p>}
    </div>
  );
}
