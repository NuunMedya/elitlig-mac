// Maç yönetimi · oyuncu değişikliği penceresi: çıkan (sahadakiler önce) ve
// giren (yedekler / sahada olmayanlar önce) seçilir; dakika boşsa maç saati.
import React, { useMemo, useState } from "react";
import { Modal } from "../../../components/ui";
import { pitchState, validateEvent } from "../../../lib/studio/manage";
import { PlayerSelect } from "./pickers";

export default function SubModal({ side, live, busy, onSave, onClose }) {
  const [outId, setOutId] = useState("");
  const [inId, setInId] = useState("");
  const [minute, setMinute] = useState("");
  const squad = live?.squads?.[side] || [];
  const teamId = side === "home" ? live?.homeTeamId : live?.awayTeamId;
  const pitch = useMemo(() => pitchState(squad, live?.events || [], teamId), [squad, live?.events, teamId]);
  const problem = validateEvent({ side, code: "SUBSTITUTION", outId, inId });
  const name = side === "home" ? live?.homeName : live?.awayName;
  return (
    <Modal title={`Oyuncu değişikliği · ${name}`} onClose={() => !busy && onClose()} width={560} className="st-modal mg-modal"
      footer={<>
        {problem && (outId || inId) ? <span className="mg-error">{problem}</span> : <span />}
        <button type="button" className="btn" onClick={onClose} disabled={busy}>Vazgeç</button>
        <button type="button" className="btn btn--primary" disabled={busy || Boolean(problem)} onClick={() => onSave({ side, code: "SUBSTITUTION", outId, inId, minute })}>Değişikliği kaydet</button>
      </>}>
      <div className="mg-stack">
        <div className="mg-grid2">
          <PlayerSelect label="Çıkan oyuncu" value={outId} onChange={(v) => { setOutId(v); if (v === inId) setInId(""); }}
            groups={[{ label: "Sahada", players: pitch.onPitch }, { label: "Diğer", players: squad.filter((p) => !pitch.onPitch.includes(p)) }]} />
          <PlayerSelect label="Giren oyuncu" value={inId} onChange={setInId} disabled={!outId}
            groups={[{ label: "Yedekler (sahada değil)", players: pitch.available.filter((p) => p.id !== outId) }, { label: "Diğer", players: squad.filter((p) => !pitch.available.includes(p) && p.id !== outId) }]} />
        </div>
        <label className="mg-field mg-field--xs"><span>Dakika</span>
          <input type="number" min="0" max="200" value={minute} placeholder={String(live?.minute ?? 0)} onChange={(e) => setMinute(e.target.value)} />
        </label>
        {!squad.length && <p className="mg-muted">Bu takımın kadrosu girilmemiş; önce “Kadro” sekmesinden kadroyu gir.</p>}
      </div>
    </Modal>
  );
}
