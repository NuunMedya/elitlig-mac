// Maç yönetimi · Röportaj isim bandı — skorboard "Röportaj" modunun içeriği
// (web BroadcastDesk InterviewDialog). Konuklar kadrodan seçilir ya da elle
// girilir (en çok 4). "Kaydet ve yayına al" ayrıca skorboardu röportaj moduna alır.
//   PUT /api/maclar/:id/broadcast-state { interview: { title, variant, sponsorId, people } }
import React, { useEffect, useMemo, useState } from "react";
import { Icon } from "../../../components/ui";
import { INTERVIEW_TITLES, INTERVIEW_VARIANTS, MAX_INTERVIEW_PEOPLE, editAt, interviewPatch, interviewPerson, moveItem, removeAt, sponsorHas, staffPeople } from "../../../lib/studio/manageBroadcast";
import * as api from "./manageApi";
import { useLoad } from "./useManage";

const SIDE_LABEL = { home: "Ev sahibi", away: "Deplasman", other: "Diğer" };

export default function InterviewDesk({ desk, live, onGoLive, onTakeOff, isLive, matchId }) {
  const current = desk.state.interview;
  const [title, setTitle] = useState(current.title);
  const [variant, setVariant] = useState(current.variant);
  const [sponsorId, setSponsorId] = useState(current.sponsorId || "");
  const [people, setPeople] = useState(current.people);
  const [q, setQ] = useState("");
  const [manual, setManual] = useState({ name: "", side: "home", teamName: "", role: "" });
  const sponsors = desk.sponsors.filter((s) => sponsorHas(s, "interview"));
  const staffRes = useLoad(() => api.getMatchAssignments(matchId), [matchId], { enabled: Boolean(matchId), fallback: "" });
  const staff = staffPeople(staffRes.data);

  // Sunucudaki kayıt değişince (başka reji) formu tazele.
  useEffect(() => {
    setTitle(current.title); setVariant(current.variant); setSponsorId(current.sponsorId || ""); setPeople(current.people);
  }, [desk.state.seq]); // eslint-disable-line react-hooks/exhaustive-deps

  const teams = useMemo(() => ["home", "away"].map((side) => ({
    side,
    name: side === "home" ? live?.homeName : live?.awayName,
    players: (live?.squads?.[side] || []).filter((p) => !q.trim() || `${p.name} ${p.number}`.toLocaleLowerCase("tr-TR").includes(q.trim().toLocaleLowerCase("tr-TR"))),
  })), [live, q]);

  const full = people.length >= MAX_INTERVIEW_PEOPLE;
  const picked = (side, id) => people.some((p) => p.playerId && String(p.playerId) === String(id) && p.side === side);
  const toggle = (team, player) => {
    if (picked(team.side, player.id)) { setPeople((list) => list.filter((p) => !(String(p.playerId) === String(player.id) && p.side === team.side))); return; }
    if (full) return;
    const person = interviewPerson({ playerId: player.id, name: player.name, side: team.side, teamName: team.name, image: player.image || "" });
    if (person) setPeople((list) => [...list, person]);
  };
  const addStaff = (st) => {
    if (full || people.some((p) => p.name === st.name)) return;
    const person = interviewPerson({ name: st.name, side: "other", teamName: "", role: st.role });
    if (person) setPeople((list) => [...list, person]);
  };
  const addManual = (e) => {
    e.preventDefault();
    if (full) return;
    const teamName = manual.side === "other" ? manual.teamName : manual.side === "home" ? live?.homeName : live?.awayName;
    const person = interviewPerson({ ...manual, teamName });
    if (!person) return;
    setPeople((list) => [...list, person]);
    setManual((m) => ({ ...m, name: "", role: "" }));
  };

  const save = async (goLive) => {
    const ok = await desk.save(interviewPatch({ title, variant, sponsorId, people }), goLive ? null : "Röportaj bandı kaydedildi.");
    if (ok && goLive) await onGoLive?.();
  };

  return (
    <div className="mg-grid2">
      <fieldset className="mg-box">
        <legend>Kadrodan seç</legend>
        <div className="mg-search"><Icon name="search" size={13} /><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Kadroda oyuncu ara…" /></div>
        <div className="mg-grid2 mg-grid2--tight">
          {teams.map((team) => (
            <div key={team.side}>
              <h6 className={`mg-sidehead is-${team.side}`}>{team.name || SIDE_LABEL[team.side]}</h6>
              {team.players.length ? (
                <ul className="mg-chips">
                  {team.players.map((p) => (
                    <li key={p.id}>
                      <button type="button" className={`mg-chip${picked(team.side, p.id) ? " is-on" : ""}`} disabled={!picked(team.side, p.id) && full} onClick={() => toggle(team, p)}>
                        <b>{p.number || "–"}</b> {p.name}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : <p className="mg-muted">{q ? "Eşleşen yok." : "Kadro girilmemiş."}</p>}
            </div>
          ))}
        </div>
        {staff.length > 0 && (
          <>
            <h6 className="mg-sidehead">Maç görevlileri</h6>
            <ul className="mg-chips">
              {staff.map((st) => (
                <li key={st.id}><button type="button" className="mg-chip" disabled={full} onClick={() => addStaff(st)}>{st.name} <small>{st.role}</small></button></li>
              ))}
            </ul>
          </>
        )}
        <form className="mg-inline mg-wrap" onSubmit={addManual}>
          <input className="mg-grow" value={manual.name} maxLength={80} placeholder="Elle: ad soyad (antrenör, yönetici…)" onChange={(e) => setManual((m) => ({ ...m, name: e.target.value }))} />
          <select value={manual.side} onChange={(e) => setManual((m) => ({ ...m, side: e.target.value }))} aria-label="Takım">
            <option value="home">{live?.homeName || "Ev sahibi"}</option>
            <option value="away">{live?.awayName || "Deplasman"}</option>
            <option value="other">Diğer takım / kurum</option>
          </select>
          {manual.side === "other" && <input value={manual.teamName} maxLength={80} placeholder="Takım / kurum" onChange={(e) => setManual((m) => ({ ...m, teamName: e.target.value }))} />}
          <input value={manual.role} maxLength={60} placeholder="Unvan" onChange={(e) => setManual((m) => ({ ...m, role: e.target.value }))} />
          <button type="submit" className="btn btn--sm" disabled={!manual.name.trim() || full}><Icon name="plus" size={13} /> Ekle</button>
        </form>
      </fieldset>

      <fieldset className="mg-box">
        <legend>Röportaj bandı {isLive && <span className="pill pill--xs pill--red">YAYINDA</span>}</legend>
        <div className="mg-inline mg-wrap">
          <label className="mg-field mg-grow"><span>Başlık</span>
            <input list="mg-interview-titles" value={title} maxLength={40} onChange={(e) => setTitle(e.target.value.toLocaleUpperCase("tr-TR"))} />
            <datalist id="mg-interview-titles">{INTERVIEW_TITLES.map((t) => <option key={t} value={t} />)}</datalist>
          </label>
          <label className="mg-field"><span>Görünüm</span>
            <select value={variant} onChange={(e) => setVariant(e.target.value)}>
              {INTERVIEW_VARIANTS.map((v) => <option key={v.key} value={v.key} title={v.hint}>{v.label}</option>)}
            </select>
          </label>
          {sponsors.length > 0 && (
            <label className="mg-field"><span>Sponsor</span>
              <select value={sponsorId} onChange={(e) => setSponsorId(e.target.value)}>
                <option value="">Yok</option>
                {sponsors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
          )}
        </div>
        <h6 className="mg-sidehead">Yayına çıkacaklar <small>{people.length}/{MAX_INTERVIEW_PEOPLE}</small></h6>
        {people.length ? (
          <ul className="mg-rows">
            {people.map((p, i) => (
              <li key={`${p.side}-${p.playerId || p.name}-${i}`} className="mg-row">
                <span className="mg-row__main">
                  <input value={p.name} maxLength={80} onChange={(e) => setPeople((list) => editAt(list, i, { name: e.target.value }))} aria-label="Ad" />
                  <small>{p.teamName || SIDE_LABEL[p.side]}</small>
                </span>
                <input className="mg-role" value={p.role || ""} maxLength={60} placeholder="Unvan" onChange={(e) => setPeople((list) => editAt(list, i, { role: e.target.value }))} />
                <input className="mg-role" value={p.image || ""} placeholder="Fotoğraf adresi (isteğe bağlı)" onChange={(e) => setPeople((list) => editAt(list, i, { image: e.target.value.trim() }))} />
                <button type="button" className="icon-btn icon-btn--xs" onClick={() => setPeople((list) => moveItem(list, i, -1))} disabled={i === 0}><Icon name="chevronUp" size={12} /></button>
                <button type="button" className="icon-btn icon-btn--xs" onClick={() => setPeople((list) => moveItem(list, i, 1))} disabled={i === people.length - 1}><Icon name="chevronDown" size={12} /></button>
                <button type="button" className="icon-btn icon-btn--xs" onClick={() => setPeople((list) => removeAt(list, i))}><Icon name="x" size={12} /></button>
              </li>
            ))}
          </ul>
        ) : <p className="mg-muted">Henüz kimse seçilmedi.</p>}
        <div className="mg-inline mg-end">
          <button type="button" className="btn btn--sm" onClick={() => save(false)} disabled={desk.saving}>Kaydet</button>
          {isLive && onTakeOff
            ? <button type="button" className="btn btn--sm btn--danger-ghost" onClick={() => onTakeOff()} disabled={desk.saving}><Icon name="micOff" size={13} /> Bandı yayından kaldır</button>
            : null}
          <button type="button" className="btn btn--sm btn--primary" onClick={() => save(true)} disabled={desk.saving}><Icon name="mic" size={13} /> {isLive ? "Kaydet (yayında)" : "Kaydet ve bandı yayına al"}</button>
        </div>
      </fieldset>
    </div>
  );
}
