// Proje adımı kartının etap etiketi (lib/projectPhases.js): kartta çip,
// ayrıntıda seçici (projenin etapları renkli, Askıda, yeni etap).
import React, { useState } from "react";
import { Icon } from "../../components/ui";
import { UNLABELED_LONG, phaseChipOf, phasesOf } from "../../lib/projectPhases";

export function PhaseChip({ task, compact = false }) {
  const chip = phaseChipOf(task);
  if (!chip) return null;
  return (
    <span className={`phase-chip ${chip.unlabeled ? "is-unlabeled" : ""} ${compact ? "phase-chip--sm" : ""}`} style={{ "--c": chip.color }} title={chip.unlabeled ? UNLABELED_LONG : `Etap: ${chip.text}`}>
      <Icon name="layers" size={10} />{chip.text}
    </span>
  );
}

export function PhaseSection({ task, projects = [], onUpdate, onPhasesChanged }) {
  const [name, setName] = useState("");
  if (!task.project || !task.isProjectStep) return null;
  const editable = Boolean(task.permissions?.canSetPhase);
  const phases = phasesOf(projects, task.project.id);
  const current = task.project.phase?.id ?? null;
  const pick = (payload) => onUpdate(task, payload);
  return (
    <section className="drawer__section">
      <h4>Etap <span className="muted small">(projedeki aşama)</span></h4>
      <div className="labels" role="radiogroup" aria-label="Etap etiketi">
        {phases.map((p) => (
          <button key={p.id} type="button" role="radio" aria-checked={current === p.id} disabled={!editable} className={`phase-chip phase-chip--pick ${current === p.id ? "is-on" : ""}`} style={{ "--c": p.color || "#7c3aed" }} onClick={() => current !== p.id && pick({ phase_id: p.id })}>{p.name}</button>
        ))}
        {task.project.phase && !phases.some((p) => p.id === current) && (
          <button type="button" role="radio" aria-checked="true" disabled className="phase-chip phase-chip--pick is-on" style={{ "--c": task.project.phase.color }}>{task.project.phase.name}</button>
        )}
        <button type="button" role="radio" aria-checked={current == null} disabled={!editable} className={`phase-chip phase-chip--pick is-unlabeled ${current == null ? "is-on" : ""}`} onClick={() => current != null && pick({ phase_id: null })}>{UNLABELED_LONG}</button>
      </div>
      {editable ? (
        <form className="inline-add" onSubmit={async (e) => { e.preventDefault(); if (!name.trim()) return; const ok = await onUpdate(task, { phase_name: name.trim() }); if (ok) { setName(""); onPhasesChanged?.(); } }}>
          <input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder="Yeni etap (projede aşama açılır)" aria-label="Yeni etap" />
          <button type="submit" className="btn btn--xs" disabled={!name.trim()}>Etap ekle</button>
        </form>
      ) : <p className="muted small">Etabı projede düzenleme yetkisi olanlar değiştirir.</p>}
    </section>
  );
}
