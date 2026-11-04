// Maç masası (maç görevi kartı): aşamalar, takım iletişimi, kadro talebi
// (WhatsApp), gol müziği, maç görevlileri.
import React, { useEffect, useState } from "react";
import { Field, Icon, Modal, Spinner, useResult, useToast } from "../../components/ui";
import { get, patch, post, put, useResource } from "../../api";
import { formatDate, formatTime, prettyPhone } from "../../lib/helpers";
import { buildLineupMessage, whatsappNumber, whatsappUrl } from "./todoUtils";

const GROUPS = [["hazirlik", "Hazırlık"], ["yayin", "Yayın"], ["mac_sonu", "Maç sonu"]];
const openWeb = (path) => path && window.elitlig.app.openWeb(path);
const openUrl = (url) => window.elitlig.app.openExternal(url);

export default function MatchDesk({ task, onChanged }) {
  const res = useResource(`/api/todos/${task.id}/desk`);
  const desk = res.data?.desk;
  const result = useResult();
  const [lineupFor, setLineupFor] = useState(null);
  const owner = task.permissions?.isOwner;
  const reload = () => { res.reload({ quiet: true }); onChanged?.(); };

  if (res.loading && !desk) return <Spinner label="Maç masası açılıyor…" />;
  if (!desk) return <p className="muted small">{res.error?.message || "Maç masası yüklenemedi."}</p>;
  const pct = desk.total ? Math.round((desk.done / desk.total) * 100) : 0;

  return (
    <div className="desk">
      <div className="desk__head">
        <div><strong>{desk.done}/{desk.total} aşama</strong><span className="muted small"> · %{pct}</span></div>
        {desk.match?.score && <span className="pill pill--tool">Skor {desk.match.score}</span>}
        {desk.match?.streamUrl && <button type="button" className="btn btn--xs btn--soft" onClick={() => openUrl(desk.match.streamUrl)}><Icon name="video" size={12} /> Canlı yayın</button>}
      </div>
      <div className="progress"><span style={{ width: `${pct}%` }} /></div>
      {desk.lockReason && <div className="notice notice--warn"><Icon name="lock" size={14} /> {desk.lockReason} <button type="button" className="link-btn" onClick={() => openWeb(desk.links?.lineup)}>Kadroyu gir</button></div>}

      <div className="stages">
        {GROUPS.map(([key, label]) => {
          const list = (desk.stages || []).filter((s) => s.group === key);
          if (!list.length) return null;
          return (
            <section key={key}>
              <h5>{label}</h5>
              {list.map((s) => (
                <div key={s.key} className={`stage ${s.done ? "is-done" : ""} ${s.locked ? "is-locked" : ""}`}>
                  <span className="stage__mark">{s.done ? <Icon name="check" size={12} strokeWidth={3} /> : s.locked ? <Icon name="lock" size={11} /> : null}</span>
                  <span className="stage__label">{s.done ? s.label : s.pendingLabel || s.label}</span>
                  {s.link && !s.done && <button type="button" className="link-btn small" onClick={() => openWeb(s.link)}>Git →</button>}
                </div>
              ))}
            </section>
          );
        })}
      </div>

      <div className="desk__links">
        <button type="button" className="btn btn--sm" onClick={() => openWeb(desk.links?.lineup)}><Icon name="team" size={13} /> Kadro girişi</button>
        <button type="button" className="btn btn--sm" disabled={!desk.links?.live} onClick={() => openWeb(desk.links?.live)}><Icon name="play2" size={13} /> Canlı akış / reji</button>
        <button type="button" className="btn btn--sm" disabled={!desk.links?.post} onClick={() => openWeb(desk.links?.post)}><Icon name="award" size={13} /> Maç sonu</button>
        <button type="button" className="btn btn--sm" onClick={() => openWeb(desk.links?.edit)}><Icon name="external" size={13} /> Maç bilgileri</button>
      </div>

      {(desk.teams || []).map((team) => <TeamPanel key={team.side} team={team} task={task} owner={owner} onLineup={() => setLineupFor(team)} reload={reload} result={result} />)}

      <CrewPanel matchId={desk.match?.id} crew={desk.crew} canAssign={desk.canAssignCrew} onSaved={reload} />

      {lineupFor && <LineupDialog team={lineupFor} task={task} matchId={desk.match?.id} onClose={() => setLineupFor(null)} onSent={() => { setLineupFor(null); reload(); }} />}
    </div>
  );
}

function TeamPanel({ team, task, owner, onLineup, reload, result }) {
  const [music, setMusic] = useState("");
  const c = team.contact;
  const wa = c?.whatsapp || c?.phone;
  return (
    <section className="team-panel">
      <header>
        {team.logo ? <img src={team.logo} alt="" /> : <span className="avatar">{(team.name || "?")[0]}</span>}
        <div><strong>{team.name}</strong><small className="muted">{team.side === "home" ? "Ev sahibi" : "Deplasman"}</small></div>
      </header>
      {c ? (
        <div className="team-panel__contact">
          <span><Icon name="user" size={12} /> {c.name}{c.source === "yonetim" ? <small className="muted"> (yönetimin girdiği)</small> : null}</span>
          <div className="row-gap">
            {c.phone && <button type="button" className="btn btn--xs" onClick={() => openUrl(`tel:${c.phone.replace(/\s/g, "")}`)}><Icon name="phone" size={11} /> {prettyPhone(c.phone)}</button>}
            {c.phone2 && <button type="button" className="btn btn--xs" onClick={() => openUrl(`tel:${c.phone2.replace(/\s/g, "")}`)}><Icon name="phone" size={11} /> {prettyPhone(c.phone2)}</button>}
            {wa && <button type="button" className="btn btn--xs btn--green" onClick={() => openUrl(`https://wa.me/${whatsappNumber(wa)}`)}><Icon name="message" size={11} /> WhatsApp</button>}
            {c.email && <button type="button" className="btn btn--xs" onClick={() => openUrl(`mailto:${c.email}`)}><Icon name="mail" size={11} /></button>}
          </div>
        </div>
      ) : <p className="muted small">İletişim bilgisi yok.</p>}
      <div className="team-panel__row">
        <span><strong>Kadro:</strong> {team.rosterCount ? `${team.rosterCount} oyuncu girildi${team.rosterReportedAt ? " · takım bildirdi" : ""}` : "Kadro girilmedi"}</span>
        {team.lineupRequest && <small className="muted">Son talep {formatDate(team.lineupRequest.at, { day: "numeric", month: "short" })} {formatTime(team.lineupRequest.at)}</small>}
        {owner && team.teamId && <button type="button" className="btn btn--xs btn--soft" onClick={onLineup}>{team.hasManagerAccount ? "Takımdan kadro talep et" : "Yetkiliyi üyeliğe davet et"}</button>}
      </div>
      <div className="team-panel__row">
        <span><Icon name="music" size={12} /> <strong>Gol müziği:</strong> {team.goalMusic ? <button type="button" className="link-btn" onClick={() => openUrl(team.goalMusic.url)}>▶ {team.goalMusic.label || "Dinle"}</button> : <>Henüz girilmedi{team.goalMusicRequestedAt ? ` · ${formatDate(team.goalMusicRequestedAt, { day: "numeric", month: "short" })} tarihinde istendi` : ""}</>}</span>
        {owner && team.teamId && <button type="button" className="btn btn--xs" disabled={!team.hasManagerAccount} title={team.hasManagerAccount ? "" : "Takımın panel hesabı yok"} onClick={async () => { if (result(await post(`/api/todos/${task.id}/goal-music-request`, { team_id: team.teamId }, { queue: false }), "Gol müziği istendi.")) reload(); }}>{team.goalMusicRequestedAt ? "Tekrar iste" : "Gol müziği iste"}</button>}
      </div>
      {owner && team.teamId && (
        <form className="inline-add" onSubmit={async (e) => { e.preventDefault(); if (result(await patch(`/api/todos/${task.id}`, { goal_music: { team_id: team.teamId, url: music.trim() } }), music.trim() ? "Gol müziği kaydedildi." : "Gol müziği kaldırıldı.")) { setMusic(""); reload(); } }}>
          <input value={music} onChange={(e) => setMusic(e.target.value)} placeholder="Gol müziği bağlantısı (YouTube, Spotify…)" />
          <button type="submit" className="btn btn--xs">Kaydet</button>
        </form>
      )}
    </section>
  );
}

function LineupDialog({ team, task, matchId, onClose, onSent }) {
  const toast = useToast();
  const member = Boolean(team.hasManagerAccount);
  const built = buildLineupMessage({ member, team, match: { ...task.match, id: matchId || task.match?.id } });
  const [phone, setPhone] = useState(team.contact?.whatsapp || team.contact?.phone || "");
  const [text, setText] = useState(built.text);
  const send = async () => {
    openUrl(whatsappUrl(phone, text));
    const res = await post(`/api/todos/${task.id}/lineup-request`, { team_id: team.teamId }, { queue: false });
    if (!res.ok) toast("WhatsApp açıldı ama talep karta kaydedilemedi.", { tone: "warn" });
    else toast(res.data?.message || "Kadro talebi kaydedildi.", { tone: "success" });
    onSent();
  };
  return (
    <Modal title={member ? `${team.name}: kadro talebi` : `${team.name}: üyelik daveti`} onClose={onClose} width={560} footer={<>
      <button type="button" className="btn" onClick={() => { navigator.clipboard.writeText(built.link); toast("Bağlantı kopyalandı.", { tone: "success" }); }}><Icon name="link" /> Bağlantıyı kopyala</button>
      <span className="spacer" />
      <button type="button" className="btn" onClick={onClose}>Vazgeç</button>
      <button type="button" className="btn btn--green" onClick={send}><Icon name="message" /> WhatsApp'ta gönder</button>
    </>}>
      {team.lineupRequest && <p className="muted small">Son talep: {formatDate(team.lineupRequest.at)} {formatTime(team.lineupRequest.at)}</p>}
      <Field label="WhatsApp numarası" hint="Boş bırakılırsa WhatsApp kişi seçmenizi ister."><input value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
      <Field label="Mesaj"><textarea rows={8} value={text} onChange={(e) => setText(e.target.value)} /></Field>
    </Modal>
  );
}

const DUTIES = [["spiker", "Spiker"], ["reji", "Reji"], ["hakem", "Hakem"], ["fotografci", "Fotoğrafçı"], ["saglikci", "Sağlıkçı"]];

export function CrewPanel({ matchId, crew = [], canAssign, onSaved }) {
  const result = useResult();
  const [editing, setEditing] = useState(false);
  const [staff, setStaff] = useState([]);
  const [values, setValues] = useState({});
  useEffect(() => {
    if (!editing || !matchId) return;
    get("/api/staff", { status: "active" }).then((res) => res.ok && setStaff(res.data?.items || res.data || []));
    get(`/api/staff/matches/${matchId}`).then((res) => {
      if (res.ok) setValues(Object.fromEntries(Object.entries(res.data?.assignments || {}).map(([k, v]) => [k, v?.staffId ? String(v.staffId) : ""])));
    });
  }, [editing, matchId]);
  const save = async () => {
    const body = Object.fromEntries(DUTIES.map(([k]) => [k, values[k] ? Number(values[k]) : null]));
    if (result(await put(`/api/staff/matches/${matchId}`, body), "Görevliler kaydedildi.")) { setEditing(false); onSaved?.(); }
  };
  return (
    <section className="crew">
      <header><h5>Maç görevlileri</h5>{canAssign && !editing && <button type="button" className="btn btn--xs" onClick={() => setEditing(true)}>Düzenle</button>}</header>
      {!editing ? (
        <div className="crew__list">{(crew.length ? crew : DUTIES.map(([duty, dutyLabel]) => ({ duty, dutyLabel }))).map((c) => <span key={c.duty} className={`pill ${c.name ? "pill--tool" : ""}`}>{c.dutyLabel}: {c.name || "—"}</span>)}</div>
      ) : (
        <div className="form-grid">
          {DUTIES.map(([k, label]) => (
            <Field key={k} label={label}><select value={values[k] || ""} onChange={(e) => setValues({ ...values, [k]: e.target.value })}><option value="">—</option>{staff.filter((p) => !p.duties || p.duties.includes(k)).map((p) => <option key={p.id} value={p.id}>{p.fullName || p.full_name || p.name}</option>)}</select></Field>
          ))}
          <div className="row-gap span2"><button type="button" className="btn btn--sm" onClick={() => setEditing(false)}>Vazgeç</button><button type="button" className="btn btn--sm btn--primary" onClick={save}>Kaydet</button></div>
        </div>
      )}
    </section>
  );
}
