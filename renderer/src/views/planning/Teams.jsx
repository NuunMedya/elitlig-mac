// Takımlar / rehber: hazır takım listeleri (tüm takımlar, son görüşülenler,
// yeni kayıtlar, çok maç alanlar, azalanlar, günlere göre, esnek, uzun süredir
// yok) ve takım kartı (iletişim, notlar, görüşme kaydı, alışkanlık, önerilen
// saatler, açık kartlar, havuz, talepler, maçlar, müsaitlik).
import React, { useEffect, useMemo, useState } from "react";
import { Icon } from "../../components/ui";
import { request } from "../../api";
import {
  CARD_KINDS, DAY_LABELS, DAY_SHORT, MATCH_REQUEST_STATUSES, TEAM_LISTS, TEAM_SORTS, contactOf, dayLabel, daysBetween, dueInfo, matchesQuery, scopeOptions, scopeParams,
  sortTeamRows, teamListRows, timeAgo, timeLabel, whenLabel,
} from "../../lib/planningUtils";
import { A, CallOutcome, ContactLinks, MoveTargetPicker, Tag, TeamContactForm, TeamNotesPanel, TeamPicker, openExternal, openSite } from "./shared";

const PAGE = 100;

/** Takım + iletişimi → proje kişisi (Projeler → Kişiler, kaynak "Takım rehberi"). */
export const teamToLead = (row, teams) => {
  const c = contactOf(teams, row.team_id);
  return { kind: "customer", name: c.name || row.team_name, company: row.team_name, phone: c.phone || c.whatsapp || null, email: c.email || null, source: "Takım rehberi", note: [row.metric, row.summary].filter(Boolean).join(" · ") || null };
};

export function TeamLists({ refreshKey, leagues, seasons, defaultScope = "", onOpenTeam, onNewCard, onAddLeads, notify }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [list, setList] = useState("all");
  const [day, setDay] = useState(() => { const d = new Date().getDay(); return d === 0 ? 7 : d; });
  const [q, setQ] = useState("");
  const [scope, setScope] = useState(defaultScope);
  const [sort, setSort] = useState("default");
  const [limit, setLimit] = useState(PAGE);
  const [editing, setEditing] = useState(null);
  const [reload, setReload] = useState(0);
  const [picked, setPicked] = useState(() => new Set());
  const scopes = useMemo(() => scopeOptions(leagues, seasons), [leagues, seasons]);
  useEffect(() => {
    let off = false;
    setLoading(true);
    request({ path: `${A}/planning/team-lists`, query: scopeParams(scope) }).then((r) => {
      if (off) return;
      setLoading(false);
      if (r.ok) setData(r.data); else { setData(null); notify?.(r.error?.message || "Takım listeleri alınamadı."); }
    });
    return () => { off = true; };
  }, [refreshKey, reload, scope]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setLimit(PAGE); setPicked(new Set()); }, [list, day, q, scope, sort]);
  const lists = data?.lists || {};
  const meta = TEAM_LISTS.find((l) => l.key === list) || TEAM_LISTS[0];
  const visible = sortTeamRows(teamListRows(lists, list, day).filter((r) => matchesQuery(q, r.team_name, r.metric, r.summary)), sort);
  const shown = visible.slice(0, limit);
  const togglePick = (id) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const addPicked = async (rows) => { if (await onAddLeads(rows.map((r) => teamToLead(r, data?.teams)))) setPicked(new Set()); };
  return (
    <section className="pl-teamlists">
      <div className="filters">
        <div className="pl-listtabs" role="tablist" aria-label="Liste">
          {TEAM_LISTS.map((l) => <button key={l.key} type="button" role="tab" aria-selected={list === l.key} className={list === l.key ? "is-active" : ""} onClick={() => setList(l.key)}><Icon name={l.icon} size={12} /> {l.label} <b>{data ? teamListRows(lists, l.key, day).length : "–"}</b></button>)}
        </div>
      </div>
      <div className="filters">
        <p className="muted small spacer">{meta.hint}</p>
        <select className="select-sm" value={scope} onChange={(e) => setScope(e.target.value)} aria-label="Lig / sezon">{scopes.map((s) => <option key={s.value} value={s.value}>{s.indent ? "  " : ""}{s.label}</option>)}</select>
        <select className="select-sm" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sırala">{TEAM_SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select>
        <div className="search-box"><Icon name="search" size={13} /><input value={q} placeholder="Listede ara" onChange={(e) => setQ(e.target.value)} aria-label="Listede ara" /></div>
      </div>
      {list === "by_day" && <div className="seg seg--sm">{[1, 2, 3, 4, 5, 6, 7].map((d) => <button key={d} type="button" className={day === d ? "is-active" : ""} title={DAY_LABELS[d]} onClick={() => setDay(d)}>{DAY_SHORT[d]} <small>{(lists.by_day?.[d] || []).length}</small></button>)}</div>}
      {onAddLeads && visible.length > 0 && (
        <div className="row-gap pl-leadbar">
          <Icon name="users" size={13} /><span className="small spacer">{picked.size ? `${picked.size} takım seçildi` : "Takımları işaretleyip projenin arama listesine (Kişiler) ekleyin."}</span>
          {picked.size > 0 && <button type="button" className="btn btn--xs btn--primary" onClick={() => addPicked(visible.filter((r) => picked.has(r.team_id)))}><Icon name="plus" size={11} /> Seçilenleri arama listesine ekle</button>}
          <button type="button" className="btn btn--xs" onClick={() => addPicked(shown)}><Icon name="plus" size={11} /> Bu listeyi ekle ({shown.length})</button>
        </div>
      )}
      {loading && !data ? <p className="muted">Listeler hazırlanıyor…</p> : visible.length === 0 ? <p className="muted pl-empty">{q ? "Aramaya uyan takım yok." : scope ? "Seçilen lig / sezonda bu listeye giren takım yok." : "Bu listede takım yok."}</p> : (
        <div className="table-wrap">
          <table className="table pl-teamtable">
            <thead><tr>{onAddLeads && <th />}<th>Takım</th><th>{list === "all" ? "Durum" : list === "recent_contacts" ? "Son görüşme sonucu" : "Neden listede"}</th><th>Oynama alışkanlığı</th><th>Son görüşme</th><th>İletişim</th><th /></tr></thead>
            <tbody>
              {shown.map((r) => (
                <React.Fragment key={r.team_id}>
                  <tr className={r.inactive ? "is-muted" : ""}>
                    {onAddLeads && <td><input type="checkbox" checked={picked.has(r.team_id)} onChange={() => togglePick(r.team_id)} aria-label={`${r.team_name} seç`} /></td>}
                    <td><button type="button" className="link-btn pl-teamcell" onClick={() => onOpenTeam(r.team_id)}><Icon name="team" size={12} /> {r.team_name}</button>{r.inactive && <span className="pill pill--xs">Pasif</span>}</td>
                    <td><span className="pl-metric">{r.metric}</span></td>
                    <td className="muted small">{r.summary}</td>
                    <td>{r.last_contact_at ? <span title={new Date(r.last_contact_at).toLocaleString("tr-TR")}><strong className="small">{timeAgo(r.last_contact_at)}</strong>{r.last_contact_label && <small className="muted"> · {r.last_contact_label}</small>}</span> : <span className="muted small">Görüşülmedi</span>}</td>
                    <td><span className="row-gap"><ContactLinks teams={data?.teams} teamId={r.team_id} compact /><button type="button" className={`icon-btn icon-btn--xs ${editing === r.team_id ? "is-on" : ""}`} title="İletişim bilgisini düzenle" onClick={() => setEditing(editing === r.team_id ? null : r.team_id)}><Icon name="user" size={11} /></button></span></td>
                    <td className="pl-rowactions">
                      <button type="button" className="btn btn--xs btn--soft" onClick={() => onNewCard({ kind: "match_request", teamId: r.team_id })}><Icon name="calendar" size={10} /> Maç talebi</button>
                      <button type="button" className="btn btn--xs btn--ghost" onClick={() => onNewCard({ kind: "contact", teamId: r.team_id })}><Icon name="phone" size={10} /> Görüşme</button>
                    </td>
                  </tr>
                  {editing === r.team_id && <tr className="pl-editrow"><td colSpan={onAddLeads ? 7 : 6}><TeamContactForm teamId={r.team_id} teamName={r.team_name} manager={data?.teams?.[r.team_id]?.account_manager || null} onCancel={() => setEditing(null)} onSaved={() => setReload((x) => x + 1)} /></td></tr>}
                </React.Fragment>
              ))}
            </tbody>
          </table>
          {visible.length > shown.length ? (
            <div className="row-gap pl-more"><span className="muted small">{shown.length} / {visible.length} takım gösteriliyor</span><button type="button" className="btn btn--xs" onClick={() => setLimit(limit + PAGE)}>{Math.min(PAGE, visible.length - shown.length)} takım daha</button><button type="button" className="btn btn--xs btn--ghost" onClick={() => setLimit(visible.length)}>Tümünü göster</button></div>
          ) : <p className="muted small pl-more">{visible.length} takım</p>}
        </div>
      )}
    </section>
  );
}

const PREFERENCE = { yes: "Bu sahada oynarız", maybe: "Zorda kalırsak", no: "Bize uymaz" };
const OUTCOME_ICONS = { interested: "check", declined: "x", no_answer: "phone", callback: "clock", messaged: "message", note: "note" };

export function TeamLookup({ allTeams, venues, bookingWindow, busy, teamId, onTeamChange, onAddToPool, onOpenCell, onLogCall, onNewCard, onOpenCard, onAddLeads, refreshKey, notify }) {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editContact, setEditContact] = useState(false);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!teamId) { setSummary(null); return undefined; }
    let off = false;
    setLoading(true);
    request({ path: `${A}/teams/${teamId}/summary` }).then((r) => {
      if (off) return;
      setLoading(false);
      if (r.ok) setSummary(r.data); else { setSummary(null); notify?.(r.error?.message || "Takım kartı alınamadı."); }
    });
    return () => { off = true; };
  }, [teamId, refreshKey, version]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setEditContact(false); setAdding(false); }, [teamId]);
  const team = summary?.team;
  const contacts = team ? { [team.team_id]: team } : {};
  const contact = team ? contactOf(contacts, team.team_id) : null;
  const timeline = useMemo(() => {
    if (!summary) return [];
    return [...(summary.calls || []).map((c) => ({ kind: "call", at: c.created_at, item: c })), ...(summary.tasks || []).map((t) => ({ kind: "task", at: t.completed_at || t.created_at, item: t }))].sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0)).slice(0, 30);
  }, [summary]);
  const openTasks = (summary?.tasks || []).filter((t) => t.status === "open");
  return (
    <section className="pl-teamview">
      <div className="pl-teamview__search"><TeamPicker teams={allTeams} value={teamId} onChange={onTeamChange} placeholder="Telefondaki takımı bulun…" /></div>
      {loading && !summary ? <p className="muted">Takım kartı yükleniyor…</p> : !summary ? <p className="muted pl-empty">Bir takım seçin. Telefondaki takımı yukarıdan bulun.</p> : (
        <>
          <div className="card pl-profile">
            <span className="pl-profile__logo">{team.team_logo ? <img src={team.team_logo} alt="" /> : <Icon name="team" size={24} />}</span>
            <div className="pl-profile__info">
              <h2>{team.team_name}</h2>
              <p className="muted small">{team.city || "İl belirtilmedi"}{contact?.name ? ` · Yetkili: ${contact.name}` : ""}</p>
              <ContactLinks teams={contacts} teamId={team.team_id} />
              {team.instagram && <button type="button" className="link-btn small" onClick={() => openExternal(team.instagram)}>Instagram</button>}
            </div>
            <div className="pl-profile__actions">
              {contact?.tel && <button type="button" className="btn btn--sm btn--primary" onClick={() => openExternal(contact.tel)}><Icon name="phone" size={12} /> Ara</button>}
              <button type="button" className="btn btn--sm btn--soft" onClick={() => onNewCard({ kind: "match_request", teamId: team.team_id })}><Icon name="calendar" size={12} /> Maç talebi</button>
              <button type="button" className="btn btn--sm" onClick={() => onNewCard({ kind: "contact", teamId: team.team_id })}><Icon name="phone" size={12} /> Görüşme notu</button>
              <button type="button" className="btn btn--sm" onClick={() => onNewCard({ kind: "personal", teamId: team.team_id })}><Icon name="note" size={12} /> Kişisel not</button>
              <button type="button" className="btn btn--sm btn--ghost" disabled={busy} onClick={() => setAdding(!adding)}><Icon name="plus" size={12} /> Tek saate ekle</button>
              <button type="button" className={`btn btn--sm ${editContact ? "btn--soft" : "btn--ghost"}`} onClick={() => setEditContact(!editContact)}><Icon name="user" size={12} /> {contact?.hasAny ? "İletişimi düzenle" : "İletişim bilgisi gir"}</button>
              {onAddLeads && <button type="button" className="btn btn--sm btn--ghost" onClick={() => onAddLeads([teamToLead({ team_id: team.team_id, team_name: team.team_name, summary: summary.habits?.summary }, contacts)])}><Icon name="users" size={12} /> Projenin arama listesine ekle</button>}
            </div>
          </div>
          {editContact ? <div className="card"><h3 className="card__title"><Icon name="phone" /> İletişim bilgisi</h3><TeamContactForm key={team.team_id} teamId={team.team_id} teamName={team.team_name} manager={team.account_manager} onCancel={() => setEditContact(false)} onSaved={() => setVersion((v) => v + 1)} /></div>
            : contact && !contact.hasAny ? <button type="button" className="notice notice--warn pl-banner" onClick={() => setEditContact(true)}><Icon name="phone" size={13} /><span><strong>Bu takımın kayıtlı telefonu yok.</strong> İletişim bilgisini buradan girin; çağrı merkezinin her ekranında görünür.</span></button> : null}
          {adding && <div className="card"><MoveTargetPicker venues={venues} bookingWindow={bookingWindow} busy={busy} confirmLabel="Havuza ekle" onCancel={() => setAdding(false)} onConfirm={async (t) => { await onAddToPool(team.team_id, t); setAdding(false); }} /></div>}
          <div className="pl-teamview__grid">
            <div className="pl-teamview__col">
              <div className="card"><h3 className="card__title"><Icon name="phone" /> Görüşme kaydet / not düş</h3><CallOutcome teamName={team.team_name} busy={busy} onSave={(v) => onLogCall(team.team_id, v, null)} /></div>
              <div className="card">
                <h3 className="card__title"><Icon name="clock" /> Geçmiş</h3>
                {timeline.length === 0 ? <p className="muted small">Bu takımla kayıtlı görüşme ya da iş yok.</p> : (
                  <ol className="pl-timeline">
                    {timeline.map((e) => (e.kind === "call" ? (
                      <li key={`c${e.item.call_id}`} className={`is-call-${e.item.outcome}`}><span className="tl-icon"><Icon name={OUTCOME_ICONS[e.item.outcome] || "phone"} size={11} /></span><div><strong>{e.item.outcome_label}</strong>{e.item.note && <p>{e.item.note}</p>}<small className="muted">{timeAgo(e.item.created_at)}{e.item.slot_label ? ` · ${e.item.venue_name ? `${e.item.venue_name} ` : ""}${e.item.slot_label}` : ""}</small></div></li>
                    ) : (
                      <li key={`t${e.item.task_id}`} className={e.item.status === "done" ? "is-done" : ""}><span className="tl-icon"><Icon name={CARD_KINDS[e.item.kind]?.icon || "checkSquare"} size={11} /></span><div><button type="button" className="link-btn" onClick={() => onOpenCard(e.item)}>{e.item.title}</button>{e.item.note && <p>{e.item.note}</p>}<small className="muted">{CARD_KINDS[e.item.kind]?.single || "Kart"} · {e.item.stage_label} · {timeAgo(e.item.updated_at || e.item.created_at)}</small></div></li>
                    )))}
                  </ol>
                )}
              </div>
            </div>
            <div className="pl-teamview__col">
              <TeamNotesPanel teamId={team.team_id} teamName={team.team_name} manager={team.account_manager} onChanged={() => setVersion((v) => v + 1)} />
              <Habit habits={summary.habits} />
              {summary.recommended_slots?.length > 0 && (
                <div className="card">
                  <h3 className="card__title"><Icon name="sparkles" /> Bu takıma önerilen saatler</h3>
                  <ul className="pl-slotlist">
                    {summary.recommended_slots.map((s) => (
                      <li key={`${s.venue_public_id}-${s.date}-${s.hour}-${s.minute}`}>
                        <div><strong>{whenLabel(daysBetween(summary.today, s.date))} · {s.label}</strong> <span className="muted small">{s.venue_name}</span>{s.opponent && <Tag tone="green">Rakip hazır: {s.opponent.team_name}</Tag>}{s.reasons?.length > 0 && <small className="muted"> {s.reasons.slice(0, 3).join(" · ")}</small>}{s.warnings?.length > 0 && <small className="text-amber"> {s.warnings.join(" · ")}</small>}</div>
                        <div className="row-gap"><button type="button" className="btn btn--xs btn--primary" disabled={busy} onClick={() => onAddToPool(team.team_id, { venueId: s.venue_public_id, date: s.date, hour: s.hour, minute: s.minute })}><Icon name="plus" size={10} /> Havuza ekle</button><button type="button" className="btn btn--xs btn--ghost" onClick={() => onOpenCell(s)}>Saati aç</button></div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {openTasks.length > 0 && (
                <div className="card"><h3 className="card__title"><Icon name="checkSquare" /> Açık kartlar ({openTasks.length})</h3>
                  <ul className="pl-facts">{openTasks.map((t) => { const d = dueInfo(t.due_at); return <li key={t.task_id}><Tag>{CARD_KINDS[t.kind]?.single || "Kart"}</Tag> <button type="button" className="link-btn" onClick={() => onOpenCard(t)}>{t.title}</button> <small className="muted">{t.stage_label}{d.label ? ` · ${d.label}` : ""}</small></li>; })}</ul>
                </div>
              )}
              <div className="card pl-factcard">
                <Fact icon="layers" title={`Havuzda beklediği saatler (${summary.pool?.length || 0})`} empty="Havuzda kaydı yok." items={(summary.pool || []).map((e) => ({ key: e.entry_id, content: <><button type="button" className="link-btn" onClick={() => onOpenCell(e)}>{e.venue_name} · {dayLabel(e.date)} {timeLabel(e.hour, e.minute)}</button>{e.note && <em> — {e.note}</em>}</> }))} />
                <Fact icon="inbox" title={`Talepleri (${summary.requests?.length || 0})`} empty="Bekleyen ya da onaylı talebi yok." items={(summary.requests || []).map((r) => ({ key: r.public_id, content: <><Tag>{MATCH_REQUEST_STATUSES[r.status] || r.status}</Tag> <strong>{r.venue_name}</strong> · {(r.slots || []).map((s) => s.label).join(" · ")}{r.note && <em> — “{r.note}”</em>}</> }))} />
                <Fact icon="calendar" title={`Önümüzdeki maçları (${summary.upcoming_matches?.length || 0})`} empty="Planlanmış maçı yok." items={(summary.upcoming_matches || []).map((m) => ({ key: m.id, content: <><button type="button" className="link-btn" onClick={() => openSite(`/editor/maclar/${m.id}/oncesi`)}>{dayLabel(m.date)} {m.time}</button> · {m.home} – {m.away}{m.venue ? ` · ${m.venue}` : ""}</> }))} />
                <Fact icon="grid" title="Müsaitlik bildirimi" empty="Takım müsaitlik tablosu göndermemiş." items={(summary.availability || []).map((a) => ({ key: a.venue_id, content: <><strong>{a.venue_name}</strong> · {PREFERENCE[a.preference] || "Tercih yok"}{a.slot_count ? ` · ${a.slot_count} saat işaretli` : ""}</> }))} />
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

const Fact = ({ icon, title, empty, items }) => (
  <div className="pl-fact"><h4><Icon name={icon} size={12} /> {title}</h4>{items.length === 0 ? <p className="muted small">{empty}</p> : <ul>{items.map((i) => <li key={i.key}>{i.content}</li>)}</ul>}</div>
);

function Habit({ habits }) {
  if (!habits) return null;
  if (!habits.played) return <div className="card"><h3 className="card__title"><Icon name="trend" /> Oynama alışkanlığı</h3><p className="muted small">Son 6 ayda kayıtlı maçı yok; öneriler müsaitlik tablosuna göre yapılır.</p></div>;
  const bars = (title, rows) => (rows?.length ? <div className="pl-bars"><small className="muted">{title}</small>{rows.map((r) => <div key={r.key} className="pl-bars__row"><span>{r.label}</span><span className="pl-bars__track"><span style={{ width: `${Math.max(4, r.share)}%` }} /></span><b>%{r.share}</b></div>)}</div> : null);
  return (
    <div className="card">
      <h3 className="card__title"><Icon name="trend" /> Oynama alışkanlığı</h3>
      <p className="small">{habits.summary}</p>
      <div className="pl-stats">
        <div><small>Son 6 ay</small><strong>{habits.played} maç</strong></div>
        <div><small>Sıklık</small><strong>{habits.per_month >= 1 ? `ayda ~${Math.round(habits.per_month)}` : "ayda 1'den az"}</strong></div>
        <div className={habits.days_since >= 14 ? "is-warn" : ""}><small>Son maç</small><strong>{habits.days_since == null ? "—" : habits.days_since === 0 ? "bugün" : `${habits.days_since} gün önce`}</strong></div>
        <div><small>Sıradaki maç</small><strong>{habits.next_date ? dayLabel(habits.next_date) : "yok"}</strong></div>
      </div>
      <div className="pl-bars-grid">{bars("Günler", (habits.top_days || []).map((d) => ({ key: d.day, label: d.label, share: d.share })))}{bars("Saatler", (habits.top_times || []).map((t) => ({ key: t.label, label: t.label, share: t.share })))}</div>
      {habits.top_venues?.length > 0 && <p className="muted small"><Icon name="map" size={11} /> Sahaları: {habits.top_venues.map((v) => `${v.venue_name} (${v.count})`).join(" · ")}</p>}
      {habits.top_opponents?.length > 0 && <p className="muted small"><Icon name="users" size={11} /> Sık rakipleri: {habits.top_opponents.map((o) => `${o.team_name} (${o.count})`).join(" · ")}</p>}
    </div>
  );
}
