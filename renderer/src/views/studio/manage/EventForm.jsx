// Maç yönetimi · olay formu — yeni olay ve olay düzenleme için ortak.
// Tüm EVENT_GROUPS kodları; değişiklikte çıkan (sahadakiler) ve giren
// (yedekler / sahada olmayanlar) ayrı seçilir.
import React, { useMemo } from "react";
import { EVENT_GROUPS, isSubstitution, pitchState } from "../../../lib/studio/manage";
import { PlayerSelect } from "./pickers";

const PERIODS = [
  { value: 1, label: "1. yarı" },
  { value: 2, label: "2. yarı" },
  { value: 3, label: "Uzatma" },
];

export default function EventForm({ form, onChange, live, events, exceptEventId, compact = false }) {
  const set = (patch) => onChange({ ...form, ...patch });
  const side = form.side === "away" ? "away" : "home";
  const squad = live?.squads?.[side] || [];
  const teamId = side === "home" ? live?.homeTeamId : live?.awayTeamId;
  const sub = isSubstitution(form.code);
  const pitch = useMemo(() => pitchState(squad, events, teamId, { exceptEventId }), [squad, events, teamId, exceptEventId]);
  const benchFirst = pitch.available;
  const restIn = squad.filter((p) => !benchFirst.includes(p) && p.id !== form.outId);

  return (
    <div className={`mg-evform${compact ? " is-compact" : ""}`}>
      <div className="mg-evform__row">
        <div className="mg-sides" role="radiogroup" aria-label="Takım">
          {["home", "away"].map((s) => (
            <button key={s} type="button" role="radio" aria-checked={side === s} className={`mg-side is-${s}${side === s ? " is-on" : ""}`} onClick={() => set({ side: s, playerId: "", outId: "", inId: "" })}>
              {s === "home" ? live?.homeName || "Ev sahibi" : live?.awayName || "Deplasman"}
            </button>
          ))}
        </div>
        <label className="mg-field mg-field--xs"><span>Dakika</span>
          <input type="number" min="0" max="200" value={form.minute} placeholder={String(live?.minute ?? 0)} onChange={(e) => set({ minute: e.target.value })} />
        </label>
        <label className="mg-field mg-field--sm"><span>Devre</span>
          <select value={form.period} onChange={(e) => set({ period: Number(e.target.value) })}>
            {PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </label>
      </div>

      <div className="mg-codes">
        {EVENT_GROUPS.map((g) => (
          <div key={g.key} className="mg-codes__group">
            <h6>{g.title}</h6>
            <div className="mg-codes__list">
              {g.items.map((it) => (
                <button key={it.code} type="button" className={`mg-code is-${g.tone}${it.code === "YELLOW_CARD" ? " is-yellow" : ""}${it.code === "RED_CARD" ? " is-red" : ""}${form.code === it.code ? " is-on" : ""}`} onClick={() => set({ code: it.code })}>
                  {it.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {sub ? (
        <div className="mg-evform__row">
          <PlayerSelect label="Çıkan oyuncu" value={form.outId} onChange={(v) => set({ outId: v, inId: form.inId === v ? "" : form.inId })}
            groups={[{ label: "Sahada", players: pitch.onPitch }, { label: "Diğer", players: squad.filter((p) => !pitch.onPitch.includes(p)) }]} />
          <PlayerSelect label="Giren oyuncu" value={form.inId} onChange={(v) => set({ inId: v })} disabled={!form.outId}
            groups={[{ label: "Yedekler (sahada değil)", players: benchFirst.filter((p) => p.id !== form.outId) }, { label: "Diğer", players: restIn }]} />
        </div>
      ) : (
        <div className="mg-evform__row">
          <PlayerSelect label="Oyuncu" value={form.playerId} onChange={(v) => set({ playerId: v })} emptyLabel="Oyuncusuz"
            groups={[{ label: "Sahada", players: pitch.onPitch }, { label: "Yedek / diğer", players: squad.filter((p) => !pitch.onPitch.includes(p)) }]} />
          <label className="mg-field mg-grow"><span>Açıklama (isteğe bağlı)</span>
            <input value={form.note} maxLength={255} onChange={(e) => set({ note: e.target.value })} placeholder="Ör. ceza sahası dışından" />
          </label>
        </div>
      )}
      {!squad.length && <p className="mg-muted">Bu takımın kadrosu girilmemiş. Olay oyuncusuz yazılabilir; kadroyu “Kadro” sekmesinden gir.</p>}
    </div>
  );
}
