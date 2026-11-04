// Takımlar: hazır listeler sekmeler hâlinde (tüm takımlar, yeni kayıtlar, son
// görüşülenler, çok maç alanlar, azalanlar, güne göre, esnek, uzun süredir
// yok). Her satır ilk bakışta logo, ad, İL, toplam maç, EN ÇOK OYNADIĞI SEZON,
// son maç, oynama alışkanlığı, son görüşme ve iletişimi gösterir; yeni
// kayıtlarda kayıt ili öne çıkar. Takım kartı (yan panel): profil, iletişim,
// alışkanlık, önerilen saatler, açık talepler, görüşmeler (düzenlenebilir),
// notlar, maçlar, müsaitlik.
import React, { useEffect, useMemo, useState } from "react";
import { Icon } from "../../components/ui";
import { request } from "../../api";
import {
  CARD_KINDS, DAY_LABELS, DAY_SHORT, MATCH_REQUEST_STATUSES, TEAM_LISTS, TEAM_SORTS, contactOf, dayLabel, daysBetween, dueInfo, filterTeamRows, registeredText, scopeOptions, scopeParams,
  sortTeamRows, teamCitiesOf, teamListRows, teamProfile, timeAgo, timeLabel, topSeasonText, whenLabel,
} from "../../lib/planningUtils";
import { A, MoveTargetPicker, OutcomeTag, SidePanel, Tag, TeamAvatar, TeamContactForm, TeamNotesPanel, openExternal, openSite } from "./shared";
import { Conversation } from "./Conversation";

const PAGE = 60;

export function TeamsView({ refreshKey, leagues, seasons, onOpenTeam, onNewCard, notify }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [list, setList] = useState(() => { try { return localStorage.getItem("planning:teamlist") || "all"; } catch { return "all"; } });
  const [day, setDay] = useState(() => { const d = new Date().getDay(); return d === 0 ? 7 : d; });
  const [q, setQ] = useState("");
  const [city, setCity] = useState("");
  const [scope, setScope] = useState("");
  const [sort, setSort] = useState("default");
  const [limit, setLimit] = useState(PAGE);
  const [editing, setEditing] = useState(null);
  const [reload, setReload] = useState(0);
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
  useEffect(() => { setLimit(PAGE); }, [list, day, q, scope, sort, city]);
  const pickList = (k) => { setList(k); try { localStorage.setItem("planning:teamlist", k); } catch { /* yoksay */ } };
  const lists = data?.lists || {};
  const meta = TEAM_LISTS.find((l) => l.key === list) || TEAM_LISTS[0];
  const base = teamListRows(lists, list, day);
  const cities = useMemo(() => teamCitiesOf(lists.all || []), [lists.all]);
  const visible = sortTeamRows(filterTeamRows(base, { city, q }), sort);
  const shown = visible.slice(0, limit);
  const isNew = list === "new_teams";

  return (
    <section className="pl-teams">
      <div className="pl-listtabs" role="tablist" aria-label="Takım listesi">
        {TEAM_LISTS.map((l) => (
          <button key={l.key} type="button" role="tab" aria-selected={list === l.key} className={list === l.key ? "is-active" : ""} onClick={() => pickList(l.key)} title={l.hint}>
            <Icon name={l.icon} size={13} /> {l.label} <b>{data ? teamListRows(lists, l.key, day).length : "–"}</b>
          </button>
        ))}
      </div>
      <div className="pl-teams__bar">
        <div className="search-box"><Icon name="search" size={13} /><input value={q} placeholder="Takım, il, sezon ya da lig ara" onChange={(e) => setQ(e.target.value)} aria-label="Listede ara" /></div>
        <span className="pl-fl"><Icon name="map" size={12} /><select className="select-sm" value={city} onChange={(e) => setCity(e.target.value)} aria-label="İl"><option value="">Tüm iller</option>{cities.map((c) => <option key={c} value={c}>{c}</option>)}</select></span>
        <span className="pl-fl"><Icon name="trophy" size={12} /><select className="select-sm" value={scope} onChange={(e) => setScope(e.target.value)} aria-label="Lig / sezon">{scopes.map((s) => <option key={s.value} value={s.value}>{s.indent ? "  " : ""}{s.value ? s.label : "Tüm lig ve sezonlar"}</option>)}</select></span>
        <select className="select-sm" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sırala">{TEAM_SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select>
        {list === "by_day" && <span className="pl-fl pl-fl--days">{[1, 2, 3, 4, 5, 6, 7].map((d) => <button key={d} type="button" className={day === d ? "is-on" : ""} title={DAY_LABELS[d]} onClick={() => setDay(d)}>{DAY_SHORT[d]} <small>{(lists.by_day?.[d] || []).length}</small></button>)}</span>}
        <span className="spacer" />
        <small className="muted">{meta.hint}</small>
      </div>
      {loading && !data ? <div className="pl-skeleton">{[0, 1, 2, 3].map((i) => <i key={i} />)}</div> : visible.length === 0 ? (
        <div className="empty"><span className="empty__icon"><Icon name="team" size={26} /></span><strong>{q || city ? "Süzgece uyan takım yok." : scope ? "Seçilen lig / sezonda bu listeye giren takım yok." : "Bu listede takım yok."}</strong></div>
      ) : (
        <>
          <ul className={`pl-teamrows ${isNew ? "is-new" : ""}`}>
            {shown.map((r) => <TeamRow key={r.team_id} row={r} teams={data?.teams} isNew={isNew} editing={editing === r.team_id} onEdit={() => setEditing(editing === r.team_id ? null : r.team_id)} onSaved={() => setReload((x) => x + 1)} onOpen={() => onOpenTeam(r.team_id)} onNewCard={onNewCard} />)}
          </ul>
          {visible.length > shown.length ? (
            <div className="row-gap pl-more"><span className="muted small">{shown.length} / {visible.length} takım</span><button type="button" className="btn btn--xs" onClick={() => setLimit(limit + PAGE)}>{Math.min(PAGE, visible.length - shown.length)} takım daha</button><button type="button" className="btn btn--xs btn--ghost" onClick={() => setLimit(visible.length)}>Tümünü göster</button></div>
          ) : <p className="muted small pl-more">{visible.length} takım</p>}
        </>
      )}
    </section>
  );
}

function TeamRow({ row, teams, isNew, editing, onEdit, onSaved, onOpen, onNewCard }) {
  const p = teamProfile(row);
  const c = contactOf(teams, row.team_id);
  return (
    <li className={`pl-teamrow ${row.inactive ? "is-muted" : ""}`}>
      <button type="button" className="pl-teamrow__id" onClick={onOpen}>
        <TeamAvatar name={row.team_name} logo={row.team_logo} size={42} />
        <span>
          <strong>{row.team_name}{row.inactive && <span className="pill pill--xs">Pasif</span>}</strong>
          {isNew ? <span className="pl-regcity"><Icon name="map" size={11} /> {registeredText(row)}</span> : <span className="pl-teamrow__city"><Icon name="map" size={10} /> {p.city || "İl bilinmiyor"}</span>}
        </span>
      </button>
      <div className="pl-teamrow__stats">
        <span className="pl-bignum"><strong>{p.total}</strong><small>maç</small></span>
        <span className="pl-teamrow__season">{p.top ? <><small>En çok oynadığı sezon</small><b title={p.top}>{p.topShort}</b><em>{row.top_season.played} maç{p.seasonsText ? ` · toplam ${p.seasonsText}` : ""}</em></> : <><small>Sezon</small><b className="muted">Sezon kaydı yok</b></>}</span>
      </div>
      <div className="pl-teamrow__habit">
        {!isNew && <span className={`pl-metric ${p.idle ? "is-warn" : ""}`}>{row.metric}</span>}
        <small className="muted">{row.summary}</small>
        <small className={p.idle ? "text-amber" : "muted"}>{[p.lastMatch, p.next].filter(Boolean).join(" · ")}</small>
      </div>
      <div className="pl-teamrow__contact">
        {row.last_contact_at ? <span className="pl-row__call"><OutcomeTag outcome={null} label={row.last_contact_label || "Görüşüldü"} /><small>{timeAgo(row.last_contact_at)}</small></span> : <span className="pl-row__call is-none"><Icon name="phone" size={11} /> Görüşülmedi</span>}
        <span className="pl-row__contact">
          {c.tel && <button type="button" className="ca-mini is-call" title={`Ara: ${c.phone}`} onClick={() => openExternal(c.tel)}><Icon name="phone" size={11} /></button>}
          {c.wa && <button type="button" className="ca-mini is-wa" title="WhatsApp" onClick={() => openExternal(c.wa)}><Icon name="message" size={11} /></button>}
          {c.mail && <button type="button" className="ca-mini" title={c.email} onClick={() => openExternal(c.mail)}><Icon name="mail" size={11} /></button>}
          <button type="button" className={`ca-mini ${editing ? "is-on" : ""}`} title="İletişim bilgisini düzenle" onClick={onEdit}><Icon name="user" size={11} /></button>
          {!c.tel && !c.wa && <small className="muted">telefon yok</small>}
        </span>
      </div>
      <div className="pl-teamrow__actions">
        <button type="button" className="btn btn--xs btn--soft" onClick={() => onNewCard({ kind: "match_request", teamId: row.team_id })}><Icon name="calendar" size={11} /> Talep aç</button>
        <button type="button" className="btn btn--xs btn--ghost" onClick={onOpen}>Kart <Icon name="chevronRight" size={11} /></button>
      </div>
      {editing && <div className="pl-teamrow__edit"><TeamContactForm teamId={row.team_id} teamName={row.team_name} manager={teams?.[row.team_id]?.account_manager || null} onCancel={onEdit} onSaved={onSaved} /></div>}
    </li>
  );
}

/* ================================ Takım kartı ================================ */

const PREFERENCE = { yes: "Bu sahada oynarız", maybe: "Zorda kalırsak", no: "Bize uymaz" };

export function TeamDrawer({ teamId, venues, bookingWindow, busy, refreshKey, actions, onOpenCell, onOpenRequest, onNewCard, onClose, notify }) {
  const [summary, setSummary] = useState(null);
  const [calls, setCalls] = useState(null);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editContact, setEditContact] = useState(false);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let off = false;
    setLoading(true);
    request({ path: `${A}/teams/${teamId}/summary` }).then((r) => {
      if (off) return;
      setLoading(false);
      if (r.ok) { setSummary(r.data); setCalls(r.data?.calls || []); } else { setSummary(null); notify?.(r.error?.message || "Takım kartı alınamadı."); }
    });
    return () => { off = true; };
  }, [teamId, refreshKey, version]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setEditContact(false); setAdding(false); }, [teamId]);
  const team = summary?.team;
  const contacts = team ? { [team.team_id]: team } : {};
  const contact = team ? contactOf(contacts, team.team_id) : null;
  const prof = summary?.profile || null;
  const openTasks = (summary?.tasks || []).filter((t) => t.status === "open");
  const logCall = async (values, place) => { const r = await actions.logCall(team.team_id, values, place); if (r?.item) setCalls((cur) => [r.item, ...(cur || [])]); return r; };
  const editCall = async (call, payload) => { const r = await actions.editCall(call, payload); if (r?.item) setCalls((cur) => (cur || []).map((x) => (x.call_id === call.call_id ? r.item : x))); return r; };

  return (
    <SidePanel className="pl-teamdrawer" width={940} onClose={onClose} eyebrow="Takım kartı"
      title={team ? (
        <span className="pl-reqhead">
          <TeamAvatar name={team.team_name} logo={team.team_logo} size={48} />
          <span>
            <span className="pl-reqhead__name">{team.team_name}</span>
            <span className="pl-reqhead__facts"><span><Icon name="map" size={11} /> {prof?.city || team.city || "İl bilinmiyor"}</span>{contact?.name && <span><Icon name="user" size={11} /> {contact.name}</span>}</span>
          </span>
        </span>
      ) : "Takım kartı"}>
      {loading && !summary ? <div className="pl-skeleton">{[0, 1, 2].map((i) => <i key={i} />)}</div> : !summary ? <p className="muted pl-empty">Takım kartı alınamadı.</p> : (
        <>
          <div className="pl-profilestrip">
            <div><small>İl</small><strong>{prof?.city || team.city || "—"}</strong></div>
            <div><small>Toplam maç</small><strong>{prof?.total_matches ?? "—"}</strong></div>
            <div><small>Sezon</small><strong>{prof?.season_count ?? "—"}</strong></div>
            <div className="is-wide"><small>En çok oynadığı sezon</small><strong>{prof?.top_season ? topSeasonText(prof.top_season) : "Sezon kaydı yok"}</strong></div>
            <div><small>Son maç</small><strong>{summary.habits?.days_since == null ? "—" : summary.habits.days_since === 0 ? "bugün" : `${summary.habits.days_since} gün önce`}</strong></div>
          </div>
          <div className="pl-teamdrawer__actions">
            {contact?.tel && <button type="button" className="btn btn--sm btn--primary" onClick={() => openExternal(contact.tel)}><Icon name="phone" size={12} /> Ara · {contact.phone}</button>}
            {contact?.wa && <button type="button" className="btn btn--sm" onClick={() => openExternal(contact.wa)}><Icon name="message" size={12} /> WhatsApp</button>}
            {contact?.mail && <button type="button" className="btn btn--sm btn--ghost" onClick={() => openExternal(contact.mail)}><Icon name="mail" size={12} /> E-posta</button>}
            <span className="spacer" />
            <button type="button" className="btn btn--sm btn--soft" onClick={() => onNewCard({ kind: "match_request", teamId: team.team_id })}><Icon name="calendar" size={12} /> Maç talebi aç</button>
            <button type="button" className="btn btn--sm" onClick={() => onNewCard({ kind: "personal", teamId: team.team_id })}><Icon name="note" size={12} /> Görev / not</button>
            <button type="button" className="btn btn--sm btn--ghost" disabled={busy} onClick={() => setAdding(!adding)}><Icon name="plus" size={12} /> Tek saate ekle</button>
            <button type="button" className={`btn btn--sm ${editContact ? "btn--soft" : "btn--ghost"}`} onClick={() => setEditContact(!editContact)}><Icon name="user" size={12} /> {contact?.hasAny ? "İletişimi düzenle" : "İletişim gir"}</button>
            {team.instagram && <button type="button" className="btn btn--sm btn--ghost" onClick={() => openExternal(team.instagram)}>Instagram</button>}
          </div>
          {editContact ? <div className="card"><h3 className="card__title"><Icon name="phone" /> İletişim bilgisi</h3><TeamContactForm key={team.team_id} teamId={team.team_id} teamName={team.team_name} manager={team.account_manager} onCancel={() => setEditContact(false)} onSaved={() => setVersion((v) => v + 1)} /></div>
            : contact && !contact.hasAny ? <button type="button" className="notice notice--warn pl-banner" onClick={() => setEditContact(true)}><Icon name="phone" size={13} /><span><strong>Bu takımın kayıtlı telefonu yok.</strong> İletişim bilgisini buradan girin; çağrı merkezinin her ekranında görünür.</span></button> : null}
          {adding && <div className="card"><MoveTargetPicker venues={venues} bookingWindow={bookingWindow} busy={busy} confirmLabel="Havuza ekle" onCancel={() => setAdding(false)} onConfirm={async (t) => { await actions.addToSlot(team.team_id, t); setAdding(false); setVersion((v) => v + 1); }} /></div>}
          <div className="pl-teamdrawer__grid">
            <div className="pl-teamdrawer__col">
              {openTasks.length > 0 && (
                <div className="card"><h3 className="card__title"><Icon name="inbox" /> Açık talepler ({openTasks.length})</h3>
                  <ul className="pl-facts">{openTasks.map((t) => { const d = dueInfo(t.due_at); return <li key={t.task_id}><Tag>{CARD_KINDS[t.kind]?.single || "Talep"}</Tag> <button type="button" className="link-btn" onClick={() => onOpenRequest(t)}>{t.title}</button> <small className="muted">{t.stage_label}{d.label ? ` · ${d.label}` : ""}</small></li>; })}</ul>
                </div>
              )}
              <Habit habits={summary.habits} />
              {summary.recommended_slots?.length > 0 && (
                <div className="card">
                  <h3 className="card__title"><Icon name="sparkles" /> Önerilen saatler</h3>
                  <ul className="pl-slotlist">
                    {summary.recommended_slots.map((s) => (
                      <li key={`${s.venue_public_id}-${s.date}-${s.hour}-${s.minute}`}>
                        <div><strong>{whenLabel(daysBetween(summary.today, s.date))} · {s.label}</strong> <span className="muted small">{s.venue_name}</span>{s.opponent && <Tag tone="green">Rakip hazır: {s.opponent.team_name}</Tag>}{s.reasons?.length > 0 && <small className="muted"> {s.reasons.slice(0, 3).join(" · ")}</small>}{s.warnings?.length > 0 && <small className="text-amber"> {s.warnings.join(" · ")}</small>}</div>
                        <div className="row-gap"><button type="button" className="btn btn--xs btn--primary" disabled={busy} onClick={async () => { await actions.addToSlot(team.team_id, { venueId: s.venue_public_id, date: s.date, hour: s.hour, minute: s.minute }); setVersion((v) => v + 1); }}><Icon name="plus" size={10} /> Havuza ekle</button><button type="button" className="btn btn--xs btn--ghost" onClick={() => onOpenCell(s)}>Saati aç</button></div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <TeamNotesPanel teamId={team.team_id} teamName={team.team_name} manager={team.account_manager} onChanged={() => setVersion((v) => v + 1)} />
              <div className="card pl-factcard">
                <Fact icon="layers" title={`Havuzda beklediği saatler (${summary.pool?.length || 0})`} empty="Havuzda kaydı yok." items={(summary.pool || []).map((e) => ({ key: e.entry_id, content: <><button type="button" className="link-btn" onClick={() => onOpenCell(e)}>{e.venue_name} · {dayLabel(e.date)} {timeLabel(e.hour, e.minute)}</button>{e.note && <em> — {e.note}</em>}</> }))} />
                <Fact icon="inbox" title={`Uygulamadan talepleri (${summary.requests?.length || 0})`} empty="Bekleyen ya da onaylı talebi yok." items={(summary.requests || []).map((r) => ({ key: r.public_id, content: <><Tag>{MATCH_REQUEST_STATUSES[r.status] || r.status}</Tag> <strong>{r.venue_name}</strong> · {(r.slots || []).map((s) => s.label).join(" · ")}{r.note && <em> — “{r.note}”</em>}</> }))} />
                <Fact icon="calendar" title={`Önümüzdeki maçları (${summary.upcoming_matches?.length || 0})`} empty="Planlanmış maçı yok." items={(summary.upcoming_matches || []).map((m) => ({ key: m.id, content: <><button type="button" className="link-btn" onClick={() => openSite(`/editor/maclar/${m.id}/oncesi`)}>{dayLabel(m.date)} {m.time}</button> · {m.home} – {m.away}{m.venue ? ` · ${m.venue}` : ""}</> }))} />
                <Fact icon="grid" title="Müsaitlik bildirimi" empty="Takım müsaitlik tablosu göndermemiş." items={(summary.availability || []).map((a) => ({ key: a.venue_id, content: <><strong>{a.venue_name}</strong> · {PREFERENCE[a.preference] || "Tercih yok"}{a.slot_count ? ` · ${a.slot_count} saat işaretli` : ""}</> }))} />
              </div>
            </div>
            <div className="pl-teamdrawer__col">
              <Conversation teamName={team.team_name} calls={calls || []} busy={busy} onLog={logCall} onEdit={editCall} />
            </div>
          </div>
        </>
      )}
    </SidePanel>
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
