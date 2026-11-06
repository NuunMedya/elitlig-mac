// Röportaj bandı · konuklar ve başlık (web BroadcastDesk InterviewDialog ile aynı
// kayıt). Konuklar kadrodan / maç görevlilerinden seçilir ya da elle girilir (en
// çok 4). Her değişiklik kendiliğinden kaydedilir (kısa gecikmeyle) — bandın
// açılıp kapanması burada DEĞİL, Röportaj sekmesindeki tek "Bant" anahtarında.
//   PUT /api/maclar/:id/broadcast-state { interview: { title, variant, sponsorId, people } }
//
//   <InterviewDesk desk={desk} live={live} matchId={id} flushRef? />
//   flushRef.current() → Promise<bool>: bekleyen değişikliği hemen kaydeder (bant açılmadan önce).
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../../../components/ui";
import { INTERVIEW_TITLES, MAX_INTERVIEW_PEOPLE, editAt, interviewPatch, interviewPerson, moveItem, removeAt, sponsorHas, staffPeople } from "../../../lib/studio/manageBroadcast";
import * as api from "./manageApi";
import { useLoad } from "./useManage";

const SIDE_LABEL = { home: "Ev sahibi", away: "Deplasman", other: "Diğer" };
const SAVE_DELAY = 700;

export default function InterviewDesk({ desk, live, matchId, flushRef = null }) {
  const current = desk.state.interview;
  const [title, setTitle] = useState(current.title);
  const [sponsorId, setSponsorId] = useState(current.sponsorId || "");
  const [people, setPeople] = useState(current.people);
  const [q, setQ] = useState("");
  const [manual, setManual] = useState({ name: "", side: "home", teamName: "", role: "" });
  const [saveState, setSaveState] = useState("idle"); // idle | pending | saving | saved | error
  const sponsors = desk.sponsors.filter((s) => sponsorHas(s, "interview"));
  const staffRes = useLoad(() => api.getMatchAssignments(matchId), [matchId], { enabled: Boolean(matchId), fallback: "" });
  const staff = staffPeople(staffRes.data);

  // Yerel düzenleme sürerken sunucudan gelen tazeleme formu ezmez.
  const dirtyRef = useRef(false);
  useEffect(() => {
    if (dirtyRef.current) return;
    setTitle(current.title); setSponsorId(current.sponsorId || ""); setPeople(current.people);
  }, [desk.state.seq]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ───────── kendiliğinden kaydet ───────── */
  const draftRef = useRef(null);
  draftRef.current = { title, sponsorId, people };
  const variantRef = useRef(current.variant);
  variantRef.current = current.variant;
  const timerRef = useRef(null);
  const saveNow = useCallback(async () => {
    clearTimeout(timerRef.current);
    timerRef.current = null;
    if (!dirtyRef.current) return true;
    const d = draftRef.current;
    setSaveState("saving");
    const ok = await desk.save(interviewPatch({ title: d.title, variant: variantRef.current, sponsorId: d.sponsorId, people: d.people }), null);
    // Kayıt sırasında yeni düzenleme olduysa kirli kalır (bir sonraki zamanlayıcı kaydeder).
    if (ok && draftRef.current === d) dirtyRef.current = false;
    setSaveState(ok ? (dirtyRef.current ? "pending" : "saved") : "error");
    return ok;
  }, [desk]);
  const touch = () => {
    dirtyRef.current = true;
    setSaveState("pending");
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { saveNow(); }, SAVE_DELAY);
  };
  useEffect(() => () => { if (dirtyRef.current) saveNow(); clearTimeout(timerRef.current); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (flushRef) flushRef.current = saveNow;
  const edit = (setter) => (v) => { setter(v); touch(); };
  const setPeopleE = edit(setPeople);

  const teams = useMemo(() => ["home", "away"].map((side) => ({
    side,
    name: side === "home" ? live?.homeName : live?.awayName,
    players: (live?.squads?.[side] || []).filter((p) => !q.trim() || `${p.name} ${p.number}`.toLocaleLowerCase("tr-TR").includes(q.trim().toLocaleLowerCase("tr-TR"))),
  })), [live, q]);

  const full = people.length >= MAX_INTERVIEW_PEOPLE;
  const picked = (side, id) => people.some((p) => p.playerId && String(p.playerId) === String(id) && p.side === side);
  const toggle = (team, player) => {
    if (picked(team.side, player.id)) { setPeopleE(people.filter((p) => !(String(p.playerId) === String(player.id) && p.side === team.side))); return; }
    if (full) return;
    const person = interviewPerson({ playerId: player.id, name: player.name, side: team.side, teamName: team.name, image: player.image || "" });
    if (person) setPeopleE([...people, person]);
  };
  const addStaff = (st) => {
    if (full || people.some((p) => p.name === st.name)) return;
    const person = interviewPerson({ name: st.name, side: "other", teamName: "", role: st.role });
    if (person) setPeopleE([...people, person]);
  };
  const addManual = (e) => {
    e.preventDefault();
    if (full) return;
    const teamName = manual.side === "other" ? manual.teamName : manual.side === "home" ? live?.homeName : live?.awayName;
    const person = interviewPerson({ ...manual, teamName });
    if (!person) return;
    setPeopleE([...people, person]);
    setManual((m) => ({ ...m, name: "", role: "" }));
  };

  const SAVE_TEXT = { pending: "Kaydedilecek…", saving: "Kaydediliyor…", saved: "Kaydedildi", error: "Kaydedilemedi" };
  return (
    <div className="mg-grid2 iv-desk">
      <fieldset className="mg-box">
        <legend>Bantta kim var <small>{people.length}/{MAX_INTERVIEW_PEOPLE}</small>
          {saveState !== "idle" && <span className={`iv-save is-${saveState}`}>{SAVE_TEXT[saveState]}</span>}
        </legend>
        {people.length ? (
          <ul className="mg-rows">
            {people.map((p, i) => (
              <li key={`${p.side}-${p.playerId || p.name}-${i}`} className={`mg-row iv-person is-${p.side}`}>
                <span className="mg-row__main">
                  <input value={p.name} maxLength={80} onChange={(e) => setPeopleE(editAt(people, i, { name: e.target.value }))} aria-label="Ad soyad" />
                  <small>{p.teamName || SIDE_LABEL[p.side]}</small>
                </span>
                <input className="mg-role" value={p.role || ""} maxLength={60} placeholder="Unvan (ör. Teknik direktör)" onChange={(e) => setPeopleE(editAt(people, i, { role: e.target.value }))} aria-label="Unvan" />
                <input className="mg-role" value={p.image || ""} placeholder="Fotoğraf adresi (isteğe bağlı)" onChange={(e) => setPeopleE(editAt(people, i, { image: e.target.value.trim() }))} aria-label="Fotoğraf adresi" />
                <button type="button" className="icon-btn icon-btn--xs" title="Yukarı" onClick={() => setPeopleE(moveItem(people, i, -1))} disabled={i === 0}><Icon name="chevronUp" size={12} /></button>
                <button type="button" className="icon-btn icon-btn--xs" title="Aşağı" onClick={() => setPeopleE(moveItem(people, i, 1))} disabled={i === people.length - 1}><Icon name="chevronDown" size={12} /></button>
                <button type="button" className="icon-btn icon-btn--xs" title="Bandtan çıkar" onClick={() => setPeopleE(removeAt(people, i))}><Icon name="x" size={12} /></button>
              </li>
            ))}
          </ul>
        ) : <p className="mg-muted">Henüz kimse yok: sağdan kadrodan seç ya da adı elle yaz.</p>}
        <div className="mg-inline mg-wrap">
          <label className="mg-field mg-grow"><span>Bant başlığı</span>
            <input list="mg-interview-titles" value={title} maxLength={40} onChange={(e) => edit(setTitle)(e.target.value.toLocaleUpperCase("tr-TR"))} />
            <datalist id="mg-interview-titles">{INTERVIEW_TITLES.map((t) => <option key={t} value={t} />)}</datalist>
          </label>
          {sponsors.length > 0 && (
            <label className="mg-field"><span>Sponsor</span>
              <select value={sponsorId} onChange={(e) => edit(setSponsorId)(e.target.value)}>
                <option value="">Yok</option>
                {sponsors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
          )}
        </div>
        <form className="mg-inline mg-wrap" onSubmit={addManual}>
          <input className="mg-grow" value={manual.name} maxLength={80} placeholder="Elle: ad soyad" onChange={(e) => setManual((m) => ({ ...m, name: e.target.value }))} aria-label="Ad soyad" />
          <input value={manual.role} maxLength={60} placeholder="Unvan" onChange={(e) => setManual((m) => ({ ...m, role: e.target.value }))} aria-label="Unvan" />
          <select value={manual.side} onChange={(e) => setManual((m) => ({ ...m, side: e.target.value }))} aria-label="Takım">
            <option value="home">{live?.homeName || "Ev sahibi"}</option>
            <option value="away">{live?.awayName || "Deplasman"}</option>
            <option value="other">Diğer takım / kurum</option>
          </select>
          {manual.side === "other" && <input value={manual.teamName} maxLength={80} placeholder="Takım / kurum" onChange={(e) => setManual((m) => ({ ...m, teamName: e.target.value }))} />}
          <button type="submit" className="btn btn--sm" disabled={!manual.name.trim() || full}><Icon name="plus" size={13} /> Ekle</button>
        </form>
      </fieldset>

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
      </fieldset>
    </div>
  );
}
