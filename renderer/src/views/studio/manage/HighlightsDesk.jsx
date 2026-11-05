// Maç yönetimi · Maçın enleri — LED "Maçın enleri", "Maçın oyuncusu" ve
// "Kare as" ekranları bu kayıttan okur. Yalnız ödül alanları yazılır:
//   PATCH /maclar/:id { post_macin_enleri, post_enler, match_mvp }
import React, { useEffect, useMemo, useState } from "react";
import { Icon } from "../../../components/ui";
import { HIGHLIGHT_FIELDS, highlightsPayload, readHighlights } from "../../../lib/studio/manageBroadcast";
import * as api from "./manageApi";
import { PlayerSelect } from "./pickers";
import { useRun } from "./useManage";

export default function HighlightsDesk({ matchId, match, live }) {
  const { run, busy } = useRun();
  const players = useMemo(() => [...(live?.squads?.home || []), ...(live?.squads?.away || [])], [live?.squads]);
  const saved = useMemo(() => readHighlights(match, players), [match, players]);
  const [form, setForm] = useState(saved);
  const [dirty, setDirty] = useState(false);
  useEffect(() => { if (!dirty) setForm(saved); }, [saved]); // eslint-disable-line react-hooks/exhaustive-deps

  const groups = [
    { label: live?.homeName || "Ev sahibi", players: live?.squads?.home || [] },
    { label: live?.awayName || "Deplasman", players: live?.squads?.away || [] },
  ];
  const save = async () => {
    const ok = await run(() => api.updateMatch(matchId, highlightsPayload(form, (id) => live?.nameOf?.(id) || "")), { ok: "Maçın enleri kaydedildi; LED ekranı en geç birkaç saniyede güncellenir.", fail: "Maçın enleri kaydedilemedi." });
    if (ok) { setDirty(false); live?.refresh?.(); }
  };
  return (
    <fieldset className="mg-box">
      <legend>Maçın enleri <small>LED: enler, MVP, kare as</small></legend>
      <div className="mg-grid-auto">
        {HIGHLIGHT_FIELDS.map((f) => (
          <PlayerSelect key={f.key} label={f.label} value={form[f.key]} groups={groups} emptyLabel="Seçilmedi" onChange={(v) => { setDirty(true); setForm((s) => ({ ...s, [f.key]: v })); }} />
        ))}
      </div>
      <div className="mg-inline mg-end">
        <button type="button" className="btn btn--sm btn--primary" disabled={busy || !dirty} onClick={save}><Icon name="award" size={13} /> Enleri kaydet</button>
      </div>
    </fieldset>
  );
}
