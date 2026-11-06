// Maç sonu · OYUNCU MAÇ İSTATİSTİĞİ (web Enter_Stats / mobil StatsEditor):
//   GET   /oyuncu-istatistikleri/mac/:id            (404 → boş)
//   POST  /oyuncu-istatistikleri/                   yeni satır
//   PATCH /oyuncu-istatistikleri/playerStat/:id     güncelle
//   DELETE /oyuncu-istatistikleri/:id
// Boş oyuncu için taslak olaylardan (gol dakikaları, kartlar) doldurulur.
import React, { useMemo, useState } from "react";
import { Icon, Modal, useConfirm } from "../../../components/ui";
import { EMPTY_STAT, playerStatBody, statDraftFromEvents, statsByPlayer } from "../../../lib/studio/manage";
import { POSITIONS } from "../../../lib/studio/manageMatches";
import * as api from "./manageApi";
import { useLoad, useRun } from "./useManage";

const COUNTERS = [
  { key: "number_of_goals", label: "Gol", max: 20 },
  { key: "yellow_card", label: "Sarı", max: 2 },
  { key: "red_card", label: "Kırmızı", max: 1 },
  { key: "goal_to_himself", label: "K.K.", max: 10 },
  { key: "points", label: "Puan", max: 10 },
];

function StatEditor({ target, matchId, live, onClose, onSaved }) {
  const { run, busy } = useRun();
  const [draft, setDraft] = useState(() => (target.row ? { ...EMPTY_STAT, ...target.row, goals_minutes: target.row.goals_minutes || "", goal_to_himself_minutes: target.row.goal_to_himself_minutes || "" } : { ...statDraftFromEvents(target.player.id, live?.events), player_position: target.player.position || "" }));
  const set = (k, v) => setDraft((d) => ({ ...d, [k]: v }));
  const teamId = target.side === "home" ? live?.homeTeamId : live?.awayTeamId;
  const opp = target.side === "home" ? live?.awayTeamId : live?.homeTeamId;
  const save = async () => {
    const body = playerStatBody(draft, { matchId, playerId: target.player.id, teamId, opponentTeamId: opp, position: target.player.position });
    const ok = await run(() => (target.row ? api.updatePlayerStat(target.row.id, body) : api.createPlayerStat(body)), { ok: "İstatistik kaydedildi.", fail: "İstatistik kaydedilemedi." });
    if (ok) { onSaved(); onClose(); }
  };
  return (
    <Modal title={`İstatistik · ${target.player.name}`} onClose={() => !busy && onClose()} width={560} className="st-modal mg-modal"
      footer={<><button type="button" className="btn" onClick={onClose} disabled={busy}>Vazgeç</button><button type="button" className="btn btn--primary" onClick={save} disabled={busy}>Kaydet</button></>}>
      <div className="mg-stack">
        <div className="pt-counters">
          {COUNTERS.map((c) => (
            <label key={c.key} className="mg-field"><span>{c.label}</span>
              <input type="number" min="0" max={c.max} step={c.key === "points" ? 0.5 : 1} value={draft[c.key]} onChange={(e) => set(c.key, e.target.value)} />
            </label>
          ))}
        </div>
        <div className="mg-grid2">
          <label className="mg-field"><span>Gol dakikaları</span><input value={draft.goals_minutes || ""} placeholder="12,34" onChange={(e) => set("goals_minutes", e.target.value)} /></label>
          <label className="mg-field"><span>Kendi kalesine dakikaları</span><input value={draft.goal_to_himself_minutes || ""} placeholder="—" onChange={(e) => set("goal_to_himself_minutes", e.target.value)} /></label>
        </div>
        <label className="mg-field"><span>Mevki</span>
          <select value={draft.player_position || ""} onChange={(e) => set("player_position", e.target.value)}>
            <option value="">—</option>
            {POSITIONS.map((p) => <option key={p.code} value={p.label}>{p.label}</option>)}
          </select>
        </label>
      </div>
    </Modal>
  );
}

export default function StatsPanel({ matchId, live }) {
  const confirm = useConfirm();
  const { run } = useRun();
  const stats = useLoad(async () => {
    const res = await api.getMatchStats(matchId);
    return !res.ok && Number(res.error?.status) === 404 ? { ok: true, data: [] } : res;
  }, [matchId], { fallback: "İstatistikler alınamadı." });
  const byPlayer = useMemo(() => statsByPlayer(stats.data), [stats.data]);
  const [target, setTarget] = useState(null);

  const remove = async (row, player) => {
    if (!(await confirm({ title: "İstatistik silinsin mi?", message: `${player.name} için maç istatistiği silinir.`, danger: true, confirmLabel: "Sil" }))) return;
    if (await run(() => api.deletePlayerStat(row.id), { ok: "İstatistik silindi.", fail: "İstatistik silinemedi." })) stats.reload({ quiet: true });
  };

  return (
    <div className="mg-stack">
      {stats.error && <p className="mg-error">{stats.error}</p>}
      <div className="mg-grid2">
        {["home", "away"].map((side) => (
          <fieldset key={side} className="mg-box">
            <legend>{side === "home" ? live?.homeName : live?.awayName}</legend>
            {(live?.squads?.[side] || []).length ? (
              <ul className="mg-rows">
                {live.squads[side].map((p) => {
                  const row = byPlayer[p.id];
                  return (
                    <li key={p.id} className="mg-row">
                      <span className="pt-rate__no">{p.number || "–"}</span>
                      <span className="mg-row__main">
                        <strong>{p.name}</strong>
                        <small>{row ? [`${row.number_of_goals} gol`, row.yellow_card ? `${row.yellow_card} sarı` : null, row.red_card ? "kırmızı" : null, `${row.points} puan`].filter(Boolean).join(" · ") : "İstatistik yok"}</small>
                      </span>
                      <button type="button" className="btn btn--xs" onClick={() => setTarget({ side, player: p, row })}>{row ? "Düzenle" : "Ekle"}</button>
                      {row && <button type="button" className="icon-btn icon-btn--xs" title="Sil" onClick={() => remove(row, p)}><Icon name="trash" size={12} /></button>}
                    </li>
                  );
                })}
              </ul>
            ) : <p className="mg-muted">Kadro girilmemiş.</p>}
          </fieldset>
        ))}
      </div>
      {target && <StatEditor target={target} matchId={matchId} live={live} onClose={() => setTarget(null)} onSaved={() => stats.reload({ quiet: true })} />}
    </div>
  );
}
