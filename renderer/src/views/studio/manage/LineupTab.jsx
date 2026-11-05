// Maç yönetimi · Kadro — iki takımın maç kadrosu (ilk 11 / yedek, forma no,
// mevki, kaptan). Takımın kalıcı kadrosu + kayıtlı maç kadrosu birleşir
// (mobil LineupStep ile aynı); kadroda olmayan oyuncu aranıp eklenebilir ya
// da yeni oyuncu açılıp takımın kadrosuna bağlanır.
//
//   GET  /api/maclar/:id/kadro                 kayıtlı maç kadrosu
//   GET  /oyuncu-takimlari/:teamId             takımın kalıcı kadrosu
//   GET  /api/players/admin-list?q=            oyuncu araması
//   POST /maclar/:id/guest-players             { playerName, teamId, side, position } → yeni oyuncu
//   POST /api/maclar/:id/kadro                 { home: [...], away: [...] } (buildLineupPayload)
import React, { useEffect, useMemo, useState } from "react";
import { Icon, Spinner, useConfirm } from "../../../components/ui";
import { addLineupPick, buildLineupPayload, buildLineupSide, lineupCounts, lineupWarnings, sortLineup, updateLineupPick } from "../../../lib/studio/manage";
import { POSITIONS, asArray, isNationwide } from "../../../lib/studio/manageMatches";
import * as api from "./manageApi";
import { PlayerSearch } from "./pickers";
import { useLoad, useRun } from "./useManage";

const ROLES = [
  { value: "starter", label: "İlk 11" },
  { value: "bench", label: "Yedek" },
  { value: "", label: "—" },
];

export default function LineupTab({ matchId, match, live, user }) {
  const { run, busy, toast } = useRun();
  const confirm = useConfirm();
  const homeTeamId = Number(match?.home_team_id) || live?.homeTeamId || null;
  const awayTeamId = Number(match?.away_team_id) || live?.awayTeamId || null;
  const names = { home: match?.first_team_name || live?.homeName || "Ev sahibi", away: match?.second_team_name || live?.awayName || "Deplasman" };

  const lineup = useLoad(() => api.getLineup(matchId), [matchId], { fallback: "Kadro okunamadı." });
  const homeRoster = useLoad(() => api.getTeamRoster(homeTeamId), [homeTeamId], { enabled: Boolean(homeTeamId) });
  const awayRoster = useLoad(() => api.getTeamRoster(awayTeamId), [awayTeamId], { enabled: Boolean(awayTeamId) });

  const [state, setState] = useState({ home: {}, away: {} });
  const [dirty, setDirty] = useState(false);
  const [side, setSide] = useState("home");
  const [q, setQ] = useState("");
  const [onlyPicked, setOnlyPicked] = useState(false);
  const [adding, setAdding] = useState(null); // "search" | "new"
  const [draft, setDraft] = useState({ name: "", position: "" });

  const ready = lineup.data && !homeRoster.loading && !awayRoster.loading;
  useEffect(() => {
    if (!ready || dirty) return;
    setState({
      home: buildLineupSide(asArray(homeRoster.data), lineup.data.home, homeTeamId),
      away: buildLineupSide(asArray(awayRoster.data), lineup.data.away, awayTeamId),
    });
  }, [ready, lineup.data, homeRoster.data, awayRoster.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const patch = (id, p) => { setDirty(true); setState((s) => ({ ...s, [side]: updateLineupPick(s[side], id, p) })); };
  const teamId = side === "home" ? homeTeamId : awayTeamId;
  const counts = { home: lineupCounts(state.home), away: lineupCounts(state.away) };
  const rows = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase("tr-TR");
    return sortLineup(state[side])
      .filter((p) => (onlyPicked ? p.role : true))
      .filter((p) => !needle || `${p.name} ${p.number}`.toLocaleLowerCase("tr-TR").includes(needle));
  }, [state, side, q, onlyPicked]);

  const reload = async () => {
    if (dirty && !(await confirm({ title: "Değişiklikler silinsin mi?", message: "Kaydedilmemiş kadro değişiklikleri kaybolacak.", danger: true, confirmLabel: "Yenile" }))) return;
    setDirty(false);
    lineup.reload(); homeRoster.reload(); awayRoster.reload();
  };

  const save = async () => {
    const warnings = [...lineupWarnings(state.home, names.home), ...lineupWarnings(state.away, names.away)];
    if (warnings.length && !(await confirm({ title: "Kadro yine de kaydedilsin mi?", message: warnings.join(" "), confirmLabel: "Kaydet" }))) return;
    const body = { home: buildLineupPayload(state.home, homeTeamId), away: buildLineupPayload(state.away, awayTeamId) };
    const ok = await run(() => api.saveLineup(matchId, body), { ok: (d) => (d?.count != null ? `Kadro kaydedildi (${d.count} oyuncu).` : "Kadro kaydedildi."), fail: "Kadro kaydedilemedi." });
    if (ok) { setDirty(false); lineup.reload({ quiet: true }); live?.refresh?.(); }
  };

  const addExisting = (p) => {
    setDirty(true);
    const guest = Number(p.team_id) !== Number(teamId);
    setState((s) => ({ ...s, [side]: addLineupPick(s[side], { ...p, player_id: p.id, team_id: guest ? null : teamId }, { teamId, guest }) }));
    toast(`${p.player_name} ${names[side]} kadrosuna yedek olarak eklendi${guest ? " (misafir)" : ""}.`, { tone: "success" });
  };

  const createNew = async () => {
    const name = draft.name.trim();
    if (!name || !teamId) return;
    const data = await run(() => api.createRosterPlayer(matchId, { playerName: name, teamId, side, position: draft.position || undefined }), { ok: (d) => d?.message || "Oyuncu oluşturuldu ve takım kadrosuna bağlandı.", fail: "Oyuncu oluşturulamadı." });
    const player = data?.player;
    if (!player?.id) return;
    setDirty(true);
    setState((s) => ({ ...s, [side]: addLineupPick(s[side], { ...player, player_id: player.id, player_name: player.player_name || name, team_id: teamId, player_position: player.player_position || draft.position }, { teamId }) }));
    setDraft({ name: "", position: "" });
  };

  if (!homeTeamId || !awayTeamId) return <p className="mg-note">Maçın takım kimlikleri boş; kadro girmeden önce maç bilgilerinde iki takımı seç.</p>;
  if (lineup.error && !lineup.data) return <p className="mg-error">{lineup.error} <button type="button" className="btn btn--xs" onClick={() => lineup.reload()}>Yeniden dene</button></p>;
  if (!ready) return <Spinner label="Kadro yükleniyor…" />;

  return (
    <div className="mg-stack">
      <div className="mg-toolbar">
        <div className="mg-sides" role="tablist">
          {["home", "away"].map((s) => (
            <button key={s} type="button" role="tab" aria-selected={side === s} className={`mg-side is-${s}${side === s ? " is-on" : ""}`} onClick={() => setSide(s)}>
              {names[s]} <small>{counts[s].starters} + {counts[s].bench}</small>
            </button>
          ))}
        </div>
        <div className="mg-search"><Icon name="search" size={13} /><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Kadroda ara…" /></div>
        <label className="toggle"><input type="checkbox" checked={onlyPicked} onChange={(e) => setOnlyPicked(e.target.checked)} /> Yalnız seçilenler</label>
        <span className="mg-grow" />
        <button type="button" className={`btn btn--sm${adding === "search" ? " btn--soft" : ""}`} onClick={() => setAdding(adding === "search" ? null : "search")}><Icon name="search" size={13} /> Oyuncu ekle</button>
        <button type="button" className={`btn btn--sm${adding === "new" ? " btn--soft" : ""}`} onClick={() => setAdding(adding === "new" ? null : "new")}><Icon name="userPlus" size={13} /> Yeni oyuncu</button>
        <button type="button" className="icon-btn" title="Sunucudan yenile" onClick={reload} disabled={busy}><Icon name="refresh" size={14} /></button>
        <button type="button" className="btn btn--sm btn--primary" onClick={save} disabled={busy || !dirty}><Icon name="check" size={13} /> {dirty ? "Kadroyu kaydet" : "Kaydedildi"}</button>
      </div>

      {adding === "search" && (
        <div className="mg-card mg-card--inset">
          <p className="mg-muted">Kayıtlı oyunculardan ara; {names[side]} kadrosunda olmayan oyuncu misafir olarak yazılır.</p>
          <PlayerSearch scopeCity={isNationwide(user) ? undefined : user?.city} onPick={addExisting} isPicked={(p) => Boolean(state[side][String(p.id)]?.role)} />
        </div>
      )}
      {adding === "new" && (
        <div className="mg-card mg-card--inset mg-inline">
          <label className="mg-field mg-grow"><span>Ad soyad</span><input value={draft.name} maxLength={80} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} placeholder={`${names[side]} için yeni oyuncu`} onKeyDown={(e) => { if (e.key === "Enter") createNew(); }} /></label>
          <label className="mg-field"><span>Mevki</span>
            <select value={draft.position} onChange={(e) => setDraft((d) => ({ ...d, position: e.target.value }))}>
              <option value="">Seçilmedi</option>
              {POSITIONS.map((p) => <option key={p.code} value={p.label}>{p.label}</option>)}
            </select>
          </label>
          <button type="button" className="btn btn--sm btn--primary" disabled={busy || !draft.name.trim()} onClick={createNew}><Icon name="plus" size={13} /> Oluştur ve ekle</button>
        </div>
      )}

      {rows.length ? (
        <div className="mg-table-wrap">
          <table className="mg-table">
            <thead><tr><th>Oyuncu</th><th>Durum</th><th>No</th><th>Mevki</th><th title="Kaptan">K</th></tr></thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className={p.role ? `is-${p.role}` : "is-out"}>
                  <td className="mg-table__name">{p.name}{(p.extra || p.guest) && <span className="pill pill--xs pill--amber">{p.guest ? "misafir" : "ek"}</span>}</td>
                  <td>
                    <div className="seg seg--sm mg-roleseg">
                      {ROLES.map((r) => <button key={r.value || "none"} type="button" className={p.role === r.value ? "is-active" : ""} onClick={() => patch(p.id, { role: r.value })}>{r.label}</button>)}
                    </div>
                  </td>
                  <td><input className="mg-num" inputMode="numeric" value={p.number} maxLength={3} onChange={(e) => patch(p.id, { number: e.target.value.replace(/\D/g, "") })} /></td>
                  <td>
                    <select className="mg-pos" value={p.position} onChange={(e) => patch(p.id, { position: e.target.value })}>
                      <option value="">—</option>
                      {p.position && !POSITIONS.some((x) => x.label === p.position || x.code === p.position) && <option value={p.position}>{p.position}</option>}
                      {POSITIONS.map((x) => <option key={x.code} value={x.label}>{x.label}</option>)}
                    </select>
                  </td>
                  <td><input type="checkbox" checked={p.captain} disabled={!p.role} onChange={(e) => patch(p.id, { captain: e.target.checked })} aria-label="Kaptan" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="mg-muted">{q || onlyPicked ? "Eşleşen oyuncu yok." : `${names[side]} kadrosunda oyuncu yok. “Oyuncu ekle” ya da “Yeni oyuncu” ile ekle.`}</p>}
    </div>
  );
}
