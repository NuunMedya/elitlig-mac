// Maç yönetimi · Takımlar & Oyuncular — il kapsamında takım listesi, takım
// oluşturma / düzenleme (ad, lig, sezon, renkler, logo adresi, aktiflik),
// takımın kadrosu, oyuncu oluşturma / düzenleme ve takıma oyuncu bağlama.
//   GET   /takimlar | /takimlar/by-city/:il      POST /takimlar/add      PATCH /takimlar/:id
//   GET   /oyuncu-takimlari/:teamId              POST /oyuncu-takimlari/add   DELETE /oyuncu-takimlari/:playerId/:teamId
//   POST  /oyuncular/add                         PATCH /oyuncular/:id     GET /oyuncular/:id
import React, { useEffect, useMemo, useState } from "react";
import { Icon, Modal, Spinner, useConfirm } from "../../../components/ui";
import {
  DEFAULT_TEAM_LOGO, POSITIONS, asArray, filterTeams, isNationwide, playerCreatePayload, playerExtraPayload, playerUpdatePayload,
  teamCreatePayload, teamUpdatePayload, validatePlayer, validateTeam,
} from "../../../lib/studio/manageMatches";
import * as api from "./manageApi";
import { PlayerSearch } from "./pickers";
import { useLoad, useRun } from "./useManage";

/* ------------------------------ takım formu ------------------------------ */

function TeamModal({ team, city, onClose, onSaved }) {
  const { run, busy, toast } = useRun();
  const isNew = !team;
  const initialLogo = team?.logo && team.logo !== DEFAULT_TEAM_LOGO && !String(team.logo).includes("elitlig_logo.png") ? team.logo : "";
  const [form, setForm] = useState(() => ({
    team_name: team?.team_name || "",
    current_league: team?.current_league && team.current_league !== "0" ? team.current_league : "",
    current_season: team?.current_season && team.current_season !== "0" ? team.current_season : "",
    colors: team?.colors || "",
    founded_at: team?.founded_at ? String(team.founded_at).slice(0, 10) : "",
    logo: initialLogo,
    active: team ? team.active !== false && team.active !== 0 : true,
  }));
  const set = (p) => setForm((f) => ({ ...f, ...p }));
  const problem = validateTeam(form);
  const original = team ? { ...team, logo: initialLogo } : {};

  const submit = async () => {
    if (problem) return;
    if (isNew) {
      const data = await run(() => api.createTeam({ ...teamCreatePayload(form), city }), { quiet: true, fail: "Takım oluşturulamadı." });
      if (!data) return;
      const id = Number(data.id || data.team?.id);
      // Sunucu aynı adlı takımda 200 + "zaten var" iletisi döndürür; kayıt oluşmamıştır.
      if (!id) { toast(data.message || "Takım oluşturulamadı.", { tone: "error", timeout: 6000 }); return; }
      const extra = teamUpdatePayload({ colors: form.colors, founded_at: form.founded_at, logo: form.logo }, {});
      if (Object.keys(extra).length) await run(() => api.updateTeam(id, extra), { quiet: true, fail: "Takım oluşturuldu ama renk / logo yazılamadı." });
      toast(`${form.team_name.trim()} oluşturuldu.`, { tone: "success" });
      onSaved?.(id);
    } else {
      const body = teamUpdatePayload(form, original);
      if (body.logo === null) body.logo = DEFAULT_TEAM_LOGO; // logo silindi → varsayılan arma
      if (!Object.keys(body).length) { onClose(); return; }
      const data = await run(() => api.updateTeam(team.id, body), { ok: (d) => (d?.change ? d.message : "Takım bilgileri kaydedildi."), fail: "Takım kaydedilemedi." });
      if (data) onSaved?.(team.id);
    }
  };

  return (
    <Modal title={isNew ? "Yeni takım" : `Takımı düzenle · ${team.team_name}`} onClose={() => !busy && onClose()} width={560} className="st-modal mg-modal"
      footer={<>
        {problem && <span className="mg-error">{problem}</span>}
        <button type="button" className="btn" onClick={onClose} disabled={busy}>Vazgeç</button>
        <button type="button" className="btn btn--primary" onClick={submit} disabled={busy || Boolean(problem)}>{isNew ? "Takımı oluştur" : "Kaydet"}</button>
      </>}>
      <div className="mg-stack">
        <label className="mg-field"><span>Takım adı</span><input value={form.team_name} maxLength={120} onChange={(e) => set({ team_name: e.target.value })} /></label>
        <div className="mg-grid2">
          <label className="mg-field"><span>Lig</span><input value={form.current_league} onChange={(e) => set({ current_league: e.target.value })} placeholder="Ör. Süper Lig" /></label>
          <label className="mg-field"><span>Sezon</span><input value={form.current_season} onChange={(e) => set({ current_season: e.target.value })} placeholder="Ör. 2026 Güz" /></label>
          <label className="mg-field"><span>Renkler</span><input value={form.colors} onChange={(e) => set({ colors: e.target.value })} placeholder="Ör. Sarı-Lacivert" /></label>
          <label className="mg-field"><span>Kuruluş</span><input type="date" value={form.founded_at} onChange={(e) => set({ founded_at: e.target.value })} /></label>
        </div>
        <label className="mg-field"><span>Logo adresi (URL)</span><input value={form.logo} onChange={(e) => set({ logo: e.target.value })} placeholder="https://…/logo.png — dosya yükleme web panelinden" /></label>
        {form.logo && <img className="mg-logo-preview" src={form.logo} alt="" />}
        {!isNew && <label className="mg-check"><input type="checkbox" checked={form.active} onChange={(e) => set({ active: e.target.checked })} /><span><b>Aktif</b><small>Pasif takım maç oluşturmada listelenmez</small></span></label>}
        <p className="mg-muted">İl: {city || team?.city || "—"}. Takım başkanı gibi doğrudan yetkisi olmayan hesaplarda değişiklik onaya düşer.</p>
      </div>
    </Modal>
  );
}

/* ------------------------------ oyuncu formu ------------------------------ */

function PlayerModal({ playerId, team, city, onClose, onSaved }) {
  const { run, busy, toast } = useRun();
  const isNew = !playerId;
  const rec = useLoad(() => api.getPlayer(playerId), [playerId], { enabled: !isNew, fallback: "Oyuncu okunamadı." });
  const player = Array.isArray(rec.data) ? rec.data[0] : rec.data?.player || rec.data;
  const [form, setForm] = useState(null);
  useEffect(() => {
    if (isNew) setForm({ player_name: "", player_position: "", birth_date: "", nationality: "", player_img: "", team_id: team?.id, active: true });
    else if (player && !form) setForm({ player_name: player.player_name || "", player_position: player.player_position || "", birth_date: player.birth_date ? String(player.birth_date).slice(0, 10) : "", nationality: player.nationality || "", player_img: player.player_img && !String(player.player_img).includes("default_player") ? player.player_img : "", active: player.active !== false && player.active !== 0 });
  }, [isNew, player]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (p) => setForm((f) => ({ ...f, ...p }));
  const problem = form ? validatePlayer(form, { needsTeam: isNew }) : "";

  const submit = async () => {
    if (problem) return;
    if (isNew) {
      const data = await run(() => api.createPlayer({ ...playerCreatePayload(form), city: city || team?.city || undefined }), { quiet: true, fail: "Oyuncu eklenemedi." });
      const id = Number(data?.player?.id);
      if (!data) return;
      const extra = playerExtraPayload(form);
      if (id && Object.keys(extra).length) await run(() => api.updatePlayer(id, extra), { quiet: true, fail: "Oyuncu eklendi ama ek bilgiler yazılamadı." });
      toast(data?.message || "Oyuncu eklendi.", { tone: "success" });
      onSaved?.();
    } else {
      const original = { ...player, player_img: player.player_img && !String(player.player_img).includes("default_player") ? player.player_img : "" };
      const body = playerUpdatePayload(form, original);
      if (!Object.keys(body).length) { onClose(); return; }
      if (await run(() => api.updatePlayer(playerId, body), { ok: "Oyuncu bilgileri kaydedildi.", fail: "Oyuncu kaydedilemedi." })) onSaved?.();
    }
  };

  return (
    <Modal title={isNew ? `Yeni oyuncu · ${team?.team_name || ""}` : `Oyuncuyu düzenle${player?.player_name ? ` · ${player.player_name}` : ""}`} onClose={() => !busy && onClose()} width={560} className="st-modal mg-modal"
      footer={<>
        {problem && <span className="mg-error">{problem}</span>}
        <button type="button" className="btn" onClick={onClose} disabled={busy}>Vazgeç</button>
        <button type="button" className="btn btn--primary" onClick={submit} disabled={busy || !form || Boolean(problem)}>{isNew ? "Oyuncuyu ekle" : "Kaydet"}</button>
      </>}>
      {rec.error && !player ? <p className="mg-error">{rec.error}</p> : !form ? <Spinner /> : (
        <div className="mg-stack">
          <label className="mg-field"><span>Ad soyad</span><input value={form.player_name} maxLength={80} onChange={(e) => set({ player_name: e.target.value })} /></label>
          <div className="mg-grid2">
            <label className="mg-field"><span>Mevki</span>
              <select value={form.player_position} onChange={(e) => set({ player_position: e.target.value })}>
                <option value="">Seçilmedi</option>
                {form.player_position && !POSITIONS.some((p) => p.label === form.player_position) && <option value={form.player_position}>{form.player_position}</option>}
                {POSITIONS.map((p) => <option key={p.code} value={p.label}>{p.label}</option>)}
              </select>
            </label>
            <label className="mg-field"><span>Doğum tarihi</span><input type="date" value={form.birth_date} onChange={(e) => set({ birth_date: e.target.value })} /></label>
            <label className="mg-field"><span>Uyruk</span><input value={form.nationality} onChange={(e) => set({ nationality: e.target.value })} placeholder="Ör. Türkiye" /></label>
            <label className="mg-field"><span>Fotoğraf adresi (URL)</span><input value={form.player_img} onChange={(e) => set({ player_img: e.target.value })} placeholder="https://…" /></label>
          </div>
          {!isNew && <label className="mg-check"><input type="checkbox" checked={form.active} onChange={(e) => set({ active: e.target.checked })} /><span><b>Aktif</b><small>Pasif oyuncu listelerde gizlenir</small></span></label>}
          {isNew && <p className="mg-muted">Oyuncu {team?.team_name} takımına bağlanır.</p>}
        </div>
      )}
    </Modal>
  );
}

/* ------------------------------ sekme ------------------------------ */

export default function TeamsTab({ user, match }) {
  const { run, busy } = useRun();
  const confirm = useConfirm();
  const nationwide = isNationwide(user);
  const [city, setCity] = useState(nationwide ? "" : user?.city || "");
  const cities = useLoad(() => api.getCities(), [], { enabled: nationwide });
  const teams = useLoad(() => api.getTeams(city || null), [city], { fallback: "Takımlar alınamadı." });
  const [q, setQ] = useState("");
  const [teamId, setTeamId] = useState(null);
  const [modal, setModal] = useState(null); // { kind: "team"|"player", ... }
  const [adding, setAdding] = useState(false);
  const [rq, setRq] = useState("");

  useEffect(() => { if (!nationwide && user?.city && !city) setCity(user.city); }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const list = useMemo(() => filterTeams(teams.data, q), [teams.data, q]);
  const team = useMemo(() => asArray(teams.data, "teams").find((t) => Number(t.id) === Number(teamId)) || null, [teams.data, teamId]);
  const roster = useLoad(() => api.getTeamRoster(teamId), [teamId], { enabled: Boolean(teamId), fallback: "Kadro alınamadı." });
  const players = useMemo(() => {
    const needle = rq.trim().toLocaleLowerCase("tr-TR");
    return asArray(roster.data).filter((p) => !needle || String(p.player_name || "").toLocaleLowerCase("tr-TR").includes(needle)).sort((a, b) => String(a.player_name || "").localeCompare(String(b.player_name || ""), "tr"));
  }, [roster.data, rq]);
  const matchTeams = match ? [{ id: Number(match.home_team_id), name: match.first_team_name }, { id: Number(match.away_team_id), name: match.second_team_name }].filter((t) => t.id) : [];

  const unlink = async (p) => {
    const pid = Number(p.player_id ?? p.id);
    if (!(await confirm({ title: "Kadrodan çıkarılsın mı?", message: `${p.player_name}, ${team?.team_name} kadrosundan çıkarılır. Oyuncu kaydı ve geçmişi silinmez.`, danger: true, confirmLabel: "Çıkar" }))) return;
    if (await run(() => api.removePlayerFromTeam(pid, teamId), { ok: "Oyuncu kadrodan çıkarıldı.", fail: "Oyuncu kadrodan çıkarılamadı." })) roster.reload({ quiet: true });
  };
  const link = async (p) => {
    if (await run(() => api.addPlayerToTeam({ playerId: Number(p.id), playerName: p.player_name, teamId: Number(teamId), teamName: team?.team_name }), { ok: `${p.player_name} ${team?.team_name} kadrosuna eklendi.`, fail: "Oyuncu takıma eklenemedi." })) roster.reload({ quiet: true });
  };
  const inRoster = (p) => asArray(roster.data).some((r) => Number(r.player_id ?? r.id) === Number(p.id));

  return (
    <div className="mg-split mg-split--teams">
      <section className="mg-card">
        <header className="mg-card__head">
          <h5><Icon name="shield" size={13} /> Takımlar <small>{list.length}</small></h5>
          <button type="button" className="btn btn--xs btn--primary" onClick={() => setModal({ kind: "team" })} disabled={!city}><Icon name="plus" size={12} /> Yeni takım</button>
        </header>
        <div className="mg-inline">
          {nationwide ? (
            <select value={city} onChange={(e) => { setCity(e.target.value); setTeamId(null); }} aria-label="İl">
              <option value="">Tüm iller</option>
              {(cities.data?.cities || []).map((c) => <option key={c.id} value={c.label}>{c.label}</option>)}
            </select>
          ) : <span className="pill pill--tool">{city || "İl yok"}</span>}
          <div className="mg-search mg-grow"><Icon name="search" size={13} /><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Takım ara…" /></div>
        </div>
        {matchTeams.length > 0 && (
          <div className="mg-inline mg-wrap">
            <span className="mg-muted">Bu maç:</span>
            {matchTeams.map((t) => <button key={t.id} type="button" className={`btn btn--xs${Number(teamId) === t.id ? " btn--soft" : ""}`} onClick={() => setTeamId(t.id)}>{t.name}</button>)}
          </div>
        )}
        {teams.error && <p className="mg-error">{teams.error}</p>}
        {teams.loading && !teams.data ? <Spinner /> : (
          <ul className="mg-rows mg-rows--scroll">
            {list.slice(0, 300).map((t) => (
              <li key={t.id} className={`mg-row is-click${Number(teamId) === Number(t.id) ? " is-current" : ""}`} onClick={() => setTeamId(Number(t.id))}>
                {t.logo ? <img className="mg-logo" src={t.logo} alt="" /> : <span className="mg-logo" />}
                <span className="mg-row__main"><strong>{t.team_name}</strong><small>{[t.current_league !== "0" && t.current_league, nationwide && !city ? t.city : null, t.active === false || t.active === 0 ? "pasif" : null].filter(Boolean).join(" · ") || `#${t.id}`}</small></span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mg-card">
        {!team && !teamId ? <div className="mg-empty"><Icon name="users" size={22} /><p>Kadrosunu görmek için bir takım seç.</p></div> : (
          <>
            <header className="mg-card__head">
              <h5>{team?.logo && <img className="mg-logo" src={team.logo} alt="" />} {team?.team_name || `Takım #${teamId}`} <small>{players.length} oyuncu</small></h5>
              <span className="mg-inline">
                {team && <button type="button" className="btn btn--xs" onClick={() => setModal({ kind: "team", team })}><Icon name="pencil" size={12} /> Takımı düzenle</button>}
                <button type="button" className={`btn btn--xs${adding ? " btn--soft" : ""}`} onClick={() => setAdding((v) => !v)}><Icon name="search" size={12} /> Var olan oyuncu</button>
                <button type="button" className="btn btn--xs btn--primary" onClick={() => setModal({ kind: "player", team: team || { id: teamId } })}><Icon name="userPlus" size={12} /> Yeni oyuncu</button>
              </span>
            </header>
            {adding && <PlayerSearch scopeCity={nationwide ? undefined : user?.city} onPick={link} isPicked={inRoster} actionLabel="Takıma ekle" />}
            <div className="mg-search"><Icon name="search" size={13} /><input type="search" value={rq} onChange={(e) => setRq(e.target.value)} placeholder="Kadroda ara…" /></div>
            {roster.error && <p className="mg-error">{roster.error}</p>}
            {roster.loading && !roster.data ? <Spinner /> : players.length ? (
              <ul className="mg-rows mg-rows--scroll">
                {players.map((p) => (
                  <li key={p.id} className="mg-row">
                    <span className="mg-num-badge">{p.jersey_number || p.player_number || "–"}</span>
                    <span className="mg-row__main"><strong>{p.player_name}</strong><small>{[p.team_position || p.player_position, `#${p.player_id ?? p.id}`].filter(Boolean).join(" · ")}</small></span>
                    <button type="button" className="icon-btn icon-btn--xs" title="Oyuncuyu düzenle" onClick={() => setModal({ kind: "player", playerId: Number(p.player_id ?? p.id), team })}><Icon name="pencil" size={12} /></button>
                    <button type="button" className="icon-btn icon-btn--xs" title="Kadrodan çıkar" disabled={busy} onClick={() => unlink(p)}><Icon name="x" size={12} /></button>
                  </li>
                ))}
              </ul>
            ) : <p className="mg-muted">{rq ? "Eşleşen oyuncu yok." : "Bu takımın kadrosunda oyuncu yok."}</p>}
          </>
        )}
      </section>

      {modal?.kind === "team" && <TeamModal team={modal.team} city={modal.team?.city || city} onClose={() => setModal(null)} onSaved={(id) => { setModal(null); teams.reload({ quiet: true }); if (id) setTeamId(Number(id)); }} />}
      {modal?.kind === "player" && <PlayerModal playerId={modal.playerId} team={modal.team} city={city} onClose={() => setModal(null)} onSaved={() => { setModal(null); roster.reload({ quiet: true }); }} />}
    </div>
  );
}
