// Yayın grafikleri · RÖPORTAJ BANDI paneli (A2'nin Röportaj sekmesine gömülür):
//   yayına al / kaldır, bant görünümü (stiller), "hangi sahnelerde görünsün",
//   konuklar (kadro, görevliler, elle) ve başlık / sponsor (InterviewDesk).
//
//   <InterviewGraphicsPanel g={g} live={live} scenes={[{ id, name }]} embedded? />
// Konuklar maçın yayın masasında (broadcast-state.interview) — web ile ortak.
import React from "react";
import { INTERVIEW_STYLES } from "../../../lib/studio/graphics";
import InterviewDesk from "../manage/InterviewDesk";
import GraphicsPreview from "./GraphicsPreview";
import { DeskError, GraphicsTabShell, GxCard, OnAirButton, useDeskPolling } from "./parts";
import SceneVisibility from "./SceneVisibility";

function InterviewBody({ g, live, scenes }) {
  const desk = g.desk;
  return (
    <div className="gx-split">
      <div className="gx-split__main mg-stack">
        <DeskError desk={desk} />
        <GxCard title="Bant görünümü" icon="layers">
          <div className="gx-tiles gx-tiles--sm">
            {INTERVIEW_STYLES.map((s, i) => (
              <button key={s.key} type="button" className={`gx-tile${g.interview.style === s.key ? " is-on" : ""}`} onClick={() => g.setInterviewStyle(s.key)} title={s.hint} disabled={desk.saving} aria-pressed={g.interview.style === s.key}>
                <GraphicsPreview snapshot={{ ...g.snapshot, interview: { ...g.snapshot.interview, style: s.key, onAir: true }, subtitle: { ...g.snapshot.subtitle, onAir: false } }} variant="scoreboard" width={200} fps={1} delay={i * 90} />
                <span className="gx-tile__label"><b>{s.label}</b><small>{s.hint}</small></span>
              </button>
            ))}
          </div>
        </GxCard>
        {desk.loading ? <p className="mg-muted">Röportaj bilgisi yükleniyor…</p> : (
          <InterviewDesk desk={desk} live={live} matchId={g.matchId} isLive={g.interview.onAir} onGoLive={() => g.setInterviewOnAir(true)} onTakeOff={() => g.setInterviewOnAir(false)} />
        )}
      </div>
      <aside className="gx-split__side">
        <GxCard title="Durum" icon="broadcast">
          <OnAirButton on={g.interview.onAir} onChange={(on) => g.setInterviewOnAir(on)} labelOn="Bandı yayından kaldır" labelOff="Bandı yayına al" disabled={!g.interview.onAir && !g.interview.people.length} />
          {!g.interview.people.length && <p className="mg-muted mg-small">Önce konuk seç ve kaydet.</p>}
        </GxCard>
        <SceneVisibility g={g} kind="interview" scenes={scenes} title="Röportaj bandı hangi sahnelerde görünsün" />
      </aside>
    </div>
  );
}

export default function InterviewGraphicsPanel({ g, live, scenes = [], embedded = false }) {
  useDeskPolling(g);
  if (embedded) return g?.matchId ? <InterviewBody g={g} live={live} scenes={scenes} /> : null;
  return (
    <GraphicsTabShell g={g} title="Röportaj bandı" icon="mic">
      {g?.matchId && <InterviewBody g={g} live={live} scenes={scenes} />}
    </GraphicsTabShell>
  );
}
