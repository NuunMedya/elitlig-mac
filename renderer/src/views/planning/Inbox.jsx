// Talepler: bütün açık talepler tek listede (uygulamadan gelenler, telefonla /
// elle açılanlar, saat havuzunda bekleyen adaylar, geri aramalar). Her satır
// ilk bakışta kaynağı, takımı (il, iletişim), ne istediğini, hangi gün / saat /
// sahayı istediğini, seçeneklerin uygunluğunu, son görüşmeyi ve sıradaki işi
// gösterir. Satır → talep ayrıntısı (saha başına mini hafta tablosu, maç kurma,
// seçenekler, taşıma, ret; görüşme paneli ve düzenlenebilir zaman çizelgesi).
import React, { useEffect, useMemo, useState } from "react";
import { Field, Icon, MenuButton } from "../../components/ui";
import { request } from "../../api";
import {
  AVAIL, CARD_KIND_ORDER, CARD_KINDS, CARD_STAGES, DAY_LABELS, DAY_SHORT, INBOX_SORTS, INBOX_SOURCES, QUICK_DUES, SLOT_STATES, TASK_PRIORITIES, cellKey, contactOf, dateLabel,
  filterInbox, groupInbox, isoToLocalInput, optionWeeks, requestGrid, sortInbox, stagesFor, timeAgo, timeLabel, toLocalInput, topSeasonText, weekRangeLabel, weekStartOf,
} from "../../lib/planningUtils";
import { A, DayChips, DuePicker, MoveTargetPicker, OptionPill, OutcomeTag, SidePanel, SourceBadge, Tag, TeamAvatar, TeamNotesPanel, openExternal, openSite } from "./shared";
import { Conversation, placesOf } from "./Conversation";
import { MatchBuilder, SlotPicker, SuggestionFeed } from "./Cards";
import { CrewPanel } from "../todos/MatchDesk";

const HOURS = [17, 18, 19, 20, 21, 22, 23, 0, 1];
const KINDS = [{ key: "", label: "Hepsi" }, { key: "match", label: "Maç" }, { key: "contact", label: "Görüşme" }, { key: "task", label: "Görev / not" }];
const EMPTY_F = { q: "", source: "", group: "", venue: "", day: "", hourFrom: "", hourTo: "", kind: "" };

/* ================================ Liste ================================ */

export function Inbox({ rows, loading, busy, venues, teams, preset, onOpen, onBulk, onNew, onOpenTeam, onOpenCell, feed }) {
  const [f, setF] = useState(EMPTY_F);
  const [sort, setSort] = useState(() => { try { return localStorage.getItem("planning:inbox-sort") || "newest"; } catch { return "newest"; } });
  const [selected, setSelected] = useState(() => new Set());
  const [showDone, setShowDone] = useState(false);
  const [showFeed, setShowFeed] = useState(false);
  useEffect(() => { if (preset) setF({ ...EMPTY_F, ...preset.filter }); }, [preset]);
  const visible = useMemo(() => sortInbox(filterInbox(rows, f), sort), [rows, f, sort]);
  const groups = groupInbox(visible);
  const count = (k, v) => rows.filter((r) => r[k] === v).length;
  const venueNames = useMemo(() => [...new Set([...venues.map((v) => v.name), ...rows.flatMap((r) => r.chips.venues)])], [venues, rows]);
  const set = (k, v) => setF((cur) => ({ ...cur, [k]: cur[k] === v ? "" : v }));
  const active = Object.entries(f).filter(([k, v]) => v !== "" && k !== "q").length;
  const toggle = (key) => setSelected((s) => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  const picked = rows.filter((r) => selected.has(r.key));
  const saveSort = (v) => { setSort(v); try { localStorage.setItem("planning:inbox-sort", v); } catch { /* yoksay */ } };

  return (
    <section className="pl-inbox">
      <div className="pl-inbox__bar">
        <div className="search-box pl-inbox__search"><Icon name="search" size={14} /><input value={f.q} placeholder="Takım, il, not ya da saha ara" onChange={(e) => setF({ ...f, q: e.target.value })} aria-label="Taleplerde ara" /></div>
        <div className="pl-srcfilter" role="group" aria-label="Kaynak">
          <button type="button" className={!f.source ? "is-active" : ""} onClick={() => setF({ ...f, source: "" })}>Tüm kaynaklar <b>{rows.filter((r) => r.group !== "done").length}</b></button>
          {Object.entries(INBOX_SOURCES).filter(([k]) => count("source", k)).map(([k, m]) => (
            <button key={k} type="button" className={`is-${m.tone || "plain"} ${f.source === k ? "is-active" : ""}`} onClick={() => set("source", k)} title={m.hint}><Icon name={m.icon} size={12} /> {m.label} <b>{rows.filter((r) => r.source === k && r.group !== "done").length}</b></button>
          ))}
        </div>
      </div>
      <div className="pl-inbox__filters">
        <span className="pl-fl"><Icon name="map" size={12} />
          <select className="select-sm" value={f.venue} onChange={(e) => setF({ ...f, venue: e.target.value })} aria-label="Saha"><option value="">Tüm sahalar</option>{venueNames.map((n) => <option key={n} value={n}>{n}</option>)}</select>
        </span>
        <span className="pl-fl pl-fl--days" role="group" aria-label="Gün">{[1, 2, 3, 4, 5, 6, 7].map((d) => <button key={d} type="button" className={Number(f.day) === d ? "is-on" : ""} title={DAY_LABELS[d]} onClick={() => set("day", d)}>{DAY_SHORT[d]}</button>)}</span>
        <span className="pl-fl"><Icon name="clock" size={12} />
          <select className="select-sm" value={f.hourFrom} onChange={(e) => setF({ ...f, hourFrom: e.target.value })} aria-label="Saatten"><option value="">Her saat</option>{HOURS.map((h) => <option key={h} value={h}>{timeLabel(h, 0)}'dan</option>)}</select>
          <select className="select-sm" value={f.hourTo} onChange={(e) => setF({ ...f, hourTo: e.target.value })} aria-label="Saate"><option value="">—</option>{HOURS.map((h) => <option key={h} value={h}>{timeLabel(h, 0)}'a</option>)}</select>
        </span>
        <span className="pl-fl pl-fl--seg" role="group" aria-label="Talep türü">{KINDS.map((k) => <button key={k.key} type="button" className={f.kind === k.key ? "is-on" : ""} onClick={() => setF({ ...f, kind: k.key })}>{k.label}</button>)}</span>
        <select className="select-sm" value={f.group} onChange={(e) => setF({ ...f, group: e.target.value })} aria-label="Durum"><option value="">Tüm durumlar</option>{groupInbox([]).map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}</select>
        {active > 0 && <button type="button" className="link-btn small" onClick={() => setF({ ...EMPTY_F, q: f.q })}><Icon name="x" size={10} /> Süzgeçleri temizle ({active})</button>}
        <span className="spacer" />
        <span className="muted small">{visible.filter((r) => r.group !== "done").length} açık talep</span>
        <select className="select-sm" value={sort} onChange={(e) => saveSort(e.target.value)} aria-label="Sırala">{INBOX_SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select>
        {feed && <button type="button" className={`btn btn--sm ${showFeed ? "btn--soft" : ""}`} aria-pressed={showFeed} onClick={() => { setShowFeed(!showFeed); if (!showFeed) feed.onLoad?.(); }}><Icon name="sparkles" size={13} /> Öneriler{feed.data?.tasks?.length ? ` (${feed.data.tasks.length})` : ""}</button>}
      </div>

      {picked.length > 0 && <BulkBar rows={picked} busy={busy} onClear={() => setSelected(new Set())} onRun={async (action, extra) => { if ((await onBulk(picked, action, extra)) !== null) setSelected(new Set()); }} />}

      <div className={`pl-inbox__body ${showFeed ? "has-feed" : ""}`}>
        <div className="pl-inbox__groups">
          {loading && !rows.length ? <div className="pl-skeleton">{[0, 1, 2].map((i) => <i key={i} />)}</div> : !rows.length ? (
            <div className="empty"><span className="empty__icon"><Icon name="inbox" size={28} /></span><strong>Açık talep yok.</strong><p className="muted small">Uygulamadan gelen talepler, telefonla açılanlar ve havuzda bekleyen adaylar burada toplanır.</p><button type="button" className="btn btn--primary" onClick={() => onNew({ kind: "match_request" })}><Icon name="plus" size={13} /> Yeni talep</button></div>
          ) : groups.map((g) => {
            if (!g.items.length && (g.key === "done" || f.group)) return null;
            const collapsed = g.key === "done" && !showDone && !f.group;
            return (
              <section key={g.key} className={`pl-group is-${g.key}`}>
                <header className="pl-group__head">
                  <button type="button" className="pl-group__title" onClick={() => g.key === "done" && setShowDone(!showDone)} disabled={g.key !== "done"}>
                    <span className={`pl-group__icon is-${g.key}`}><Icon name={g.icon} size={13} /></span>
                    <h3>{g.label}</h3><b>{g.items.length}</b>
                    {g.key === "done" && <Icon name={collapsed ? "chevronDown" : "chevronUp"} size={13} />}
                  </button>
                  <small className="muted">{g.hint}</small>
                </header>
                {collapsed ? null : g.items.length === 0 ? <p className="muted small pl-group__empty">Bu grupta talep yok.</p> : (
                  <ul className="pl-rows">{(g.key === "done" ? g.items.slice(0, 40) : g.items).map((r) => <InboxRow key={r.key} row={r} teams={teams} selected={selected.has(r.key)} onSelect={() => toggle(r.key)} onOpen={() => onOpen(r)} onOpenTeam={onOpenTeam} onOpenCell={onOpenCell} />)}</ul>
                )}
              </section>
            );
          })}
          {rows.length > 0 && !visible.length && <p className="muted pl-empty">Süzgece uyan talep yok.</p>}
        </div>
        {showFeed && feed && <SuggestionFeed {...feed} busy={busy} />}
      </div>
    </section>
  );
}

function InboxRow({ row, teams, selected, onSelect, onOpen, onOpenTeam, onOpenCell }) {
  const c = row.team_id ? contactOf(teams, row.team_id) : null;
  const shown = row.options.slice(0, 4);
  const more = row.options.length - shown.length;
  const done = row.group === "done";
  return (
    <li className={`pl-row is-${row.group} ${selected ? "is-selected" : ""} ${row.priority && !done ? "is-high" : ""} ${row.due.late && !done ? "is-late" : ""}`}>
      <label className="pl-row__check" title="Seç"><input type="checkbox" checked={selected} onChange={onSelect} aria-label={`${row.team_name} seç`} /></label>
      <div className="pl-row__team">
        <TeamAvatar name={row.team_name} logo={row.team_logo} size={38} />
        <div>
          {row.team_id ? <button type="button" className="pl-row__name" onClick={() => onOpenTeam(row.team_id)}>{row.team_name}</button> : <strong className="pl-row__name">{row.title || "Görev"}</strong>}
          <span className="pl-row__city">{row.city ? <><Icon name="map" size={10} /> {row.city}</> : row.team_id ? "İl bilinmiyor" : "Takımsız"}</span>
          {c && (c.tel || c.wa) && (
            <span className="pl-row__contact">
              {c.tel && <button type="button" className="ca-mini is-call" title={`Ara: ${c.phone}`} onClick={() => openExternal(c.tel)}><Icon name="phone" size={11} /></button>}
              {c.wa && <button type="button" className="ca-mini is-wa" title="WhatsApp" onClick={() => openExternal(c.wa)}><Icon name="message" size={11} /></button>}
              <small className="muted">{c.name || c.phone}</small>
            </span>
          )}
        </div>
      </div>
      <button type="button" className="pl-row__main" onClick={onOpen}>
        <span className="pl-row__want">
          <strong>{row.want.label}</strong>
          {row.stage !== "open" && row.card && <Tag tone={row.stage === "matched" ? "green" : row.stage === "declined" || row.stage === "unresolved" ? "red" : "amber"}>{row.stage_label}</Tag>}
          {row.stranded && !done && <Tag tone="red" icon="alert">Saat doldu · taşıyın</Tag>}
          {row.priority && !done && <Tag tone="red" icon="flag">Öncelikli</Tag>}
        </span>
        {row.options.length > 0 ? (
          <span className="pl-row__when">
            <DayChips days={row.chips.days} />
            <span className="pl-row__hours">{row.chips.times.slice(0, 6).map((t) => <i key={t}>{t}</i>)}{row.chips.times.length > 6 && <i>+{row.chips.times.length - 6}</i>}</span>
            <span className="pl-row__venues">{row.chips.venues.map((v) => <i key={v}><Icon name="map" size={9} /> {v}</i>)}</span>
          </span>
        ) : row.want.key === "match" || row.want.key === "specific" ? <span className="small text-amber"><Icon name="alert" size={11} /> Saat seçeneği yok — gün / saat sorulmalı</span> : null}
        {shown.length > 0 && <span className="pl-row__opts">{shown.map((o) => <OptionPill key={`${o.venue_public_id}-${o.date}-${o.hour}-${o.minute}`} option={o} />)}{more > 0 && <span className="muted small">+{more} saat</span>}</span>}
        {row.note && <span className="pl-row__note">“{row.note}”</span>}
      </button>
      <div className="pl-row__side">
        <SourceBadge source={row.source} at={row.created_at} />
        {row.lastCall ? (
          <span className="pl-row__call"><OutcomeTag outcome={row.lastCall.outcome} label={row.lastCall.outcome_label} /><small>{row.lastCall.note ? `${row.lastCall.note.slice(0, 70)}${row.lastCall.note.length > 70 ? "…" : ""} · ` : ""}{timeAgo(row.lastCall.created_at)}</small></span>
        ) : !done && <span className="pl-row__call is-none"><Icon name="phone" size={11} /> Henüz görüşülmedi</span>}
        {!done && <NextAction row={row} onOpenCell={onOpenCell} />}
      </div>
    </li>
  );
}

function NextAction({ row, onOpenCell }) {
  if (row.due.label) return <span className={`pl-next ${row.due.late ? "is-late" : row.due.group === "today" ? "is-today" : ""}`}><Icon name="clock" size={11} /> {row.due.late ? "Gecikti · " : ""}{row.due.label}</span>;
  if (row.group === "ready" && row.best) return <button type="button" className="pl-next is-ready" onClick={() => onOpenCell(row.best)}><Icon name="users" size={11} /> {row.best.avail === "opponent" ? "Rakip hazır" : `${row.best.others.length} aday`} · {DAY_SHORT[row.best.day]} {timeLabel(row.best.hour, row.best.minute)}</button>;
  if (row.group === "new") return <span className="pl-next is-new"><Icon name="phone" size={11} /> Aranmalı</span>;
  return null;
}

function BulkBar({ rows, busy, onRun, onClear }) {
  const [at, setAt] = useState("");
  const [asking, setAsking] = useState(false);
  const cards = rows.filter((r) => r.card && r.card.status === "open");
  return (
    <div className="pl-bulk" role="region" aria-label="Seçilen talepler">
      <strong>{rows.length} talep seçildi</strong>{cards.length < rows.length && <small className="muted">({rows.length - cards.length} havuz adayı — yalnız “reddet / çıkar” uygulanır)</small>}
      <span className="spacer" />
      <button type="button" className="btn btn--sm" disabled={busy || !cards.length} onClick={() => onRun("waiting")}><Icon name="clock" size={12} /> Haber bekleniyor</button>
      <button type="button" className={`btn btn--sm ${asking ? "btn--soft" : ""}`} disabled={busy || !rows.some((r) => r.team_id)} onClick={() => setAsking(!asking)}><Icon name="rotate" size={12} /> Geri arama ata</button>
      <button type="button" className="btn btn--sm btn--danger-ghost" disabled={busy} onClick={() => onRun("decline")}><Icon name="x" size={12} /> Olumsuz / reddet</button>
      <button type="button" className="btn btn--sm btn--ghost" onClick={onClear}>Seçimi temizle</button>
      {asking && (
        <div className="pl-bulk__due">
          <DuePicker value={at} onChange={setAt} required label="Hepsi ne zaman aranacak?" />
          <button type="button" className="btn btn--sm btn--primary" disabled={busy || !at} onClick={() => onRun("callback", { at })}><Icon name="check" size={12} /> Geri arama ata</button>
        </div>
      )}
    </div>
  );
}

/* ================================ Talep ayrıntısı ================================ */

export function RequestDrawer({ row, card, teams, venues, allTeams, cards, leagues, seasons, busy, refreshKey, actions, onClose, onOpenCell, onOpenTeam }) {
  const teamId = row.team_id;
  const [calls, setCalls] = useState(null);
  const [profile, setProfile] = useState(null);
  const [mode, setMode] = useState(null); // build | options | move | details
  const [pickedOpt, setPickedOpt] = useState(null);
  const [draftOptions, setDraftOptions] = useState([]);
  useEffect(() => {
    if (!teamId) { setCalls([]); return undefined; }
    let off = false;
    request({ path: `${A}/calls`, query: { teamId, limit: 60 } }).then((r) => { if (!off) setCalls(r.ok ? r.data?.items || [] : []); });
    return () => { off = true; };
  }, [teamId, refreshKey]);
  useEffect(() => {
    if (!teamId) return undefined;
    let off = false;
    request({ path: `${A}/teams/${teamId}/summary` }).then((r) => { if (!off && r.ok) setProfile(r.data?.profile || null); });
    return () => { off = true; };
  }, [teamId]);
  useEffect(() => { setMode(null); setPickedOpt(null); }, [row.key]);

  const c = card || row.card;
  const entry = row.entry;
  const open = c ? c.status === "open" : true;
  const matched = c?.stage === "matched";
  const options = row.options;
  const contact = teamId ? contactOf(teams, teamId) : null;
  const venueIds = [...new Set(options.map((o) => o.venue_public_id).filter(Boolean))];
  const gridVenues = venueIds.map((id) => venues.find((v) => v.public_id === id)).filter(Boolean);
  const editable = (c?.options || []).filter((o) => o.status === "waiting" && !o.is_past).map((o) => ({ venueId: o.venue_public_id, date: o.date, hour: o.hour, minute: o.minute }));
  const logCall = async (values, place) => { const r = await actions.logCall(teamId, values, place); if (r) setCalls((cur) => [r.item, ...(cur || [])].filter(Boolean)); return r; };
  const editCall = async (call, payload) => { const r = await actions.editCall(call, payload); if (r?.item) setCalls((cur) => (cur || []).map((x) => (x.call_id === call.call_id ? r.item : x))); return r; };
  const builderInit = pickedOpt ? { venueId: pickedOpt.venue_public_id, date: pickedOpt.date, hour: pickedOpt.hour, minute: pickedOpt.minute, homeTeamId: teamId } : { homeTeamId: teamId };

  return (
    <SidePanel className="pl-reqdrawer" width={980} onClose={onClose}
      eyebrow={<span className="row-gap"><SourceBadge source={row.source} at={row.created_at} />{c && <Tag tone={matched ? "green" : c.stage === "declined" || c.stage === "unresolved" ? "red" : c.stage === "open" ? "" : "amber"} solid={matched}>{CARD_STAGES[c.stage]?.label || c.stage}</Tag>}{c?.created_by_name && <small className="muted">· {c.created_by_name}</small>}</span>}
      title={
        <span className="pl-reqhead">
          <TeamAvatar name={row.team_name} logo={row.team_logo} size={44} />
          <span>
            {teamId ? <button type="button" className="link-btn pl-reqhead__name" onClick={() => onOpenTeam(teamId)}>{row.team_name}</button> : <span className="pl-reqhead__name">{c?.title || "Görev"}</span>}
            <span className="pl-reqhead__facts">
              {(profile?.city || row.city) && <span><Icon name="map" size={11} /> {profile?.city || row.city}</span>}
              {profile && <span><Icon name="ball" size={11} /> {profile.total_matches ? `${profile.total_matches} maç` : "Maç kaydı yok"}{profile.season_count ? ` · ${profile.season_count} sezon` : ""}</span>}
              {profile?.top_season && <span title="En çok maça çıktığı sezon"><Icon name="trophy" size={11} /> En çok: {topSeasonText(profile.top_season)}</span>}
            </span>
          </span>
        </span>
      }
      footer={c ? (
        <div className="row-gap">
          <span className="muted small spacer">Açıldı {timeAgo(c.created_at)}{c.updated_at && c.updated_at !== c.created_at ? ` · güncellendi ${timeAgo(c.updated_at)}` : ""}</span>
          <MenuButton label="Talep işlemleri" text="Diğer" items={[
            ...stagesFor(c.kind).filter((s) => s !== c.stage && s !== "matched").map((s) => ({ label: `Durum: ${CARD_STAGES[s].label}`, icon: "chevronRight", onClick: () => actions.moveCard(c, { stage: s }) })),
            "-",
            ...CARD_KIND_ORDER.filter((k) => k !== c.kind).map((k) => ({ label: `Türünü çevir: ${CARD_KINDS[k].single}`, icon: CARD_KINDS[k].icon, onClick: () => actions.moveCard(c, { kind: k }) })),
            { label: "Ayrıntılar (not, hatırlatma, öncelik)", icon: "sliders", onClick: () => setMode("details") },
            "-",
            { label: "Talebi sil", icon: "trash", danger: true, onClick: () => actions.deleteCard(c) },
          ]} />
        </div>
      ) : entry ? <div className="row-gap"><span className="muted small spacer">Havuza eklendi {timeAgo(entry.created_at)} · {entry.source === "request" ? "takım talebi" : "yönetici ekledi"}</span></div> : null}>
      <div className="pl-reqdrawer__grid">
        <div className="pl-reqdrawer__left">
          {contact && (
            <div className="contact-actions-lg">
              <button type="button" className="ca-btn ca-btn--call" disabled={!contact.tel} onClick={() => openExternal(contact.tel)}><Icon name="phone" size={16} /><span>Ara</span><small>{contact.phone || "telefon yok"}</small></button>
              <button type="button" className="ca-btn ca-btn--wa" disabled={!contact.wa} onClick={() => openExternal(contact.wa)}><Icon name="message" size={16} /><span>WhatsApp</span><small>{contact.wa ? "mesaj yaz" : "—"}</small></button>
              <button type="button" className="ca-btn ca-btn--mail" disabled={!contact.mail} onClick={() => openExternal(contact.mail)}><Icon name="mail" size={16} /><span>E-posta</span><small>{contact.email || "e-posta yok"}</small></button>
            </div>
          )}
          {contact && <small className="muted pl-reqdrawer__mgr"><Icon name="user" size={11} /> {contact.name ? `Yetkili: ${contact.name}` : "Yetkili kaydı yok"}{contact.phone2 ? ` · 2. tel: ${contact.phone2}` : ""}</small>}

          <section className="pl-want">
            <small>Ne istiyor?</small>
            <strong>{row.want.label}</strong>
            {row.note && <p className="pl-quote">“{row.note}”</p>}
            {c?.due_at && <span className={`pl-next ${row.due.late ? "is-late" : ""}`}><Icon name="clock" size={11} /> Hatırlatma: {row.due.label}</span>}
          </section>

          {matched && (c.opponent_name || c.slot_label) && (
            <section className="pl-match">
              <div className="pl-match__teams"><div><small>Ev sahibi</small><strong>{c.team_name}</strong></div><span>vs</span><div><small>Deplasman</small><strong>{c.opponent_name || "—"}</strong></div></div>
              <p className="muted small"><Icon name="map" size={11} /> {c.venue_name} · {c.slot_label}{c.match_id ? " · fikstürde" : " · fikstüre yazılmadı"}</p>
              <div className="row-gap">
                {c.match_id && <button type="button" className="btn btn--xs btn--ghost" onClick={() => openSite(`/editor/maclar/${c.match_id}/oncesi`)}><Icon name="external" size={11} /> Fikstür kaydı</button>}
                {c.venue_public_id && c.date && <button type="button" className="btn btn--xs btn--ghost" onClick={() => onOpenCell({ venue_public_id: c.venue_public_id, date: c.date, hour: c.hour, minute: c.minute })}>Programda aç</button>}
              </div>
              {c.match_id && <CrewPanel matchId={c.match_id} canAssign />}
            </section>
          )}

          {(options.length > 0 || (c?.kind === "match_request" && open)) && !matched && (
            <section className="pl-section">
              <div className="pl-section__head">
                <h3><Icon name="grid" size={13} /> İstenen saatler <span className="muted">({options.length})</span></h3>
                {c && c.kind === "match_request" && open && mode !== "options" && <button type="button" className="btn btn--xs" onClick={() => { setDraftOptions(editable); setMode("options"); }}><Icon name="plus" size={11} /> Seçenek ekle / çıkar</button>}
              </div>
              {mode === "options" ? (
                <div className="pl-subpanel">
                  <SlotPicker venues={venues} initialOptions={editable} onChange={setDraftOptions} />
                  <div className="row-gap"><span className="spacer" /><button type="button" className="btn btn--sm btn--ghost" onClick={() => setMode(null)}>Vazgeç</button><button type="button" className="btn btn--sm btn--primary" disabled={busy} onClick={async () => { if ((await actions.setOptions(c, draftOptions)) !== null) setMode(null); }}><Icon name="check" size={12} /> Kaydet ({draftOptions.length} seçenek)</button></div>
                </div>
              ) : !options.length ? <p className="muted small">Henüz saat seçeneği yok. “Seçenek ekle” ile saha tablosundan seçin ya da görüşmede sorun.</p> : (
                <>
                  {gridVenues.map((v) => <MiniWeek key={v.public_id} venue={v} options={options} picked={pickedOpt} onPick={(o) => setPickedOpt(pickedOpt && cellKey(pickedOpt.date, pickedOpt.hour, pickedOpt.minute) === cellKey(o.date, o.hour, o.minute) && pickedOpt.venue_public_id === o.venue_public_id ? null : o)} />)}
                  {options.filter((o) => !gridVenues.some((v) => v.public_id === o.venue_public_id)).length > 0 && <div className="pl-row__opts">{options.filter((o) => !gridVenues.some((v) => v.public_id === o.venue_public_id)).map((o) => <OptionPill key={o.option_id || o.label} option={o} onClick={() => setPickedOpt(o)} />)}</div>}
                  <div className="legend pl-legend pl-legend--sm">{["opponent", "candidates", "free", "taken"].map((k) => <span key={k}><i className={`pl-dot is-${AVAIL[k].tone}`} />{AVAIL[k].label}</span>)}<span><i className="pl-dot is-req" />İstenen saat</span></div>
                  {pickedOpt && (
                    <div className="pl-picked">
                      <OptionPill option={pickedOpt} />
                      {pickedOpt.others?.length > 0 && <small className="muted">Aynı saatte: {pickedOpt.others.map((t) => t.team_name).join(", ")}</small>}
                      <span className="spacer" />
                      {open && pickedOpt.avail !== "taken" && <button type="button" className="btn btn--xs btn--primary" onClick={() => setMode("build")}><Icon name="ball" size={11} /> Bu saatte maçı kur</button>}
                      <button type="button" className="btn btn--xs" onClick={() => onOpenCell(pickedOpt)}><Icon name="calendar" size={11} /> Programda aç</button>
                      {open && (entry || pickedOpt.entry_id) && <button type="button" className="btn btn--xs btn--ghost" onClick={() => setMode("move")}><Icon name="swap" size={11} /> Başka saate taşı</button>}
                    </div>
                  )}
                  {mode === "move" && pickedOpt && <MoveTargetPicker venues={venues} defaultVenueId={pickedOpt.venue_public_id} defaultDate={pickedOpt.date} busy={busy} onCancel={() => setMode(null)} onConfirm={async (t) => { if ((await actions.moveOption(row, pickedOpt, t)) !== null) { setMode(null); setPickedOpt(null); } }} />}
                </>
              )}
            </section>
          )}

          {open && !matched && c?.kind !== "personal" && teamId && (
            mode === "build" ? (
              <section className="pl-section is-focus">
                <div className="pl-section__head"><h3><Icon name="ball" size={13} /> Maçı kur</h3></div>
                <MatchBuilder key={pickedOpt ? `${pickedOpt.venue_public_id}${pickedOpt.date}${pickedOpt.hour}` : "x"} card={c ? { ...c, team_id: teamId } : { team_id: teamId, options: options.map((o) => ({ ...o, status: "waiting" })) }} cards={cards} allTeams={allTeams} venues={venues} leagues={leagues} seasons={seasons} busy={busy}
                  initial={builderInit} onCancel={() => setMode(null)} onSubmit={async (v) => { if ((await actions.createMatch(row, v)) !== null) setMode(null); }} />
              </section>
            ) : (
              <div className="pl-reqactions">
                <button type="button" className="btn btn--primary" onClick={() => setMode("build")}><Icon name="ball" size={14} /> {row.group === "ready" ? "Eşleştir · maçı kur" : "Maçı kur"}</button>
                {c && <button type="button" className="btn" disabled={busy || c.stage === "waiting_them"} onClick={() => actions.moveCard(c, { stage: "waiting_them" })}><Icon name="clock" size={13} /> Haber bekleniyor</button>}
                {!c && entry && <button type="button" className="btn" onClick={() => actions.newCardFromEntry(entry)}><Icon name="plus" size={13} /> Talep kartı aç</button>}
                <button type="button" className="btn btn--danger-ghost" disabled={busy} onClick={() => actions.decline(row)}><Icon name="x" size={13} /> {entry && !c ? (entry.request_public_id ? "Talebi reddet" : "Havuzdan çıkar") : "Olumsuz sonuçlandı"}</button>
              </div>
            )
          )}
          {c && !open && <div className="pl-reqactions"><button type="button" className="btn" disabled={busy} onClick={() => actions.moveCard(c, { stage: "open" })}><Icon name="rotate" size={13} /> Yeniden aç</button></div>}
          {c?.kind === "personal" && open && <div className="pl-reqactions"><button type="button" className="btn btn--primary" disabled={busy} onClick={() => actions.moveCard(c, { stage: "resolved" })}><Icon name="check" size={13} /> Tamamlandı</button><button type="button" className="btn" disabled={busy} onClick={() => actions.moveCard(c, { stage: "waiting_us" })}><Icon name="clock" size={13} /> Haber verilecek</button></div>}

          {mode === "details" && c && <CardDetails card={c} busy={busy} onCancel={() => setMode(null)} onSave={async (v) => { if ((await actions.updateCard(c, v)) !== null) setMode(null); }} />}
          {teamId && <TeamNotesPanel key={teamId} teamId={teamId} teamName={row.team_name} manager={teams?.[teamId]?.account_manager || null} />}
        </div>
        <div className="pl-reqdrawer__right">
          {teamId ? (
            <Conversation teamName={row.team_name} calls={calls || []} loading={calls === null} events={card?.events || []} places={placesOf(options)} busy={busy}
              onLog={logCall} onEdit={editCall} onAddNote={c ? (text) => actions.addNote(c, text) : null} />
          ) : (
            <Conversation calls={[]} events={card?.events || []} busy={busy} onLog={async () => null} onAddNote={c ? (text) => actions.addNote(c, text) : null} />
          )}
        </div>
      </div>
    </SidePanel>
  );
}

/** Saha başına mini hafta tablosu: istenen hücreler uygunluk rengiyle, diğerleri panodaki durumuyla. */
function MiniWeek({ venue, options, picked, onPick }) {
  const weeks = optionWeeks(options.filter((o) => o.venue_public_id === venue.public_id));
  const [wi, setWi] = useState(0);
  const week = weeks[Math.min(wi, weeks.length - 1)] || weekStartOf(options[0]?.date);
  const [board, setBoard] = useState(null);
  useEffect(() => {
    let off = false;
    request({ path: `${A}/venues/${venue.public_id}/board`, query: { weekStart: week } }).then((r) => { if (!off) setBoard(r.ok ? r.data : null); });
    return () => { off = true; };
  }, [venue.public_id, week]);
  const g = requestGrid({ venue, board, options, weekStart: week });
  const byKey = new Map(options.filter((o) => o.venue_public_id === venue.public_id).map((o) => [cellKey(o.date, o.hour, o.minute), o]));
  return (
    <div className="pl-mini">
      <div className="pl-mini__head">
        <strong><Icon name="map" size={12} /> {venue.name}</strong>
        <small className="muted">{g.requested} istenen saat</small>
        <span className="spacer" />
        {weeks.length > 1 && <span className="pl-pager"><button type="button" className="icon-btn icon-btn--xs" disabled={wi <= 0} onClick={() => setWi(wi - 1)} aria-label="Önceki hafta"><Icon name="chevronLeft" size={12} /></button><small>{weekRangeLabel(week)}</small><button type="button" className="icon-btn icon-btn--xs" disabled={wi >= weeks.length - 1} onClick={() => setWi(wi + 1)} aria-label="Sonraki hafta"><Icon name="chevronRight" size={12} /></button></span>}
        {weeks.length <= 1 && <small className="muted">{weekRangeLabel(week)}</small>}
      </div>
      <div className="pl-mini__wrap">
        <table className="pl-mini__table">
          <thead><tr><th />{g.days.map((d) => <th key={d.date} className={d.is_today ? "is-today" : ""}>{DAY_SHORT[d.day]}<small>{dateLabel(d.date)}</small></th>)}</tr></thead>
          <tbody>
            {g.rows.map((r) => (
              <tr key={timeLabel(r.time.hour, r.time.minute)}>
                <th scope="row">{timeLabel(r.time.hour, r.time.minute)}</th>
                {r.cells.map((cell) => {
                  const o = cell.option ? byKey.get(cellKey(cell.date, cell.hour, cell.minute)) || cell.option : null;
                  const isPicked = o && picked && picked.venue_public_id === venue.public_id && cellKey(picked.date, picked.hour, picked.minute) === cellKey(o.date, o.hour, o.minute);
                  if (o) {
                    const a = AVAIL[o.avail] || AVAIL.free;
                    return <td key={cell.date}><button type="button" className={`pl-mini__cell is-req is-${a.tone} ${isPicked ? "is-picked" : ""}`} title={`${DAY_LABELS[cell.day]} ${timeLabel(cell.hour, cell.minute)} · istenen · ${a.label}${o.others?.length ? `: ${o.others.map((t) => t.team_name).join(", ")}` : ""}`} onClick={() => onPick(o)}>{o.avail === "opponent" ? "rakip" : o.avail === "candidates" ? `${o.others.length} aday` : o.avail === "taken" ? "dolu" : <Icon name="check" size={11} />}</button></td>;
                  }
                  return <td key={cell.date}><span className={`pl-mini__cell is-${SLOT_STATES[cell.state]?.tone || "open"}`} title={`${DAY_LABELS[cell.day]} ${timeLabel(cell.hour, cell.minute)} · ${SLOT_STATES[cell.state]?.label || ""}`} /></td>;
                })}
              </tr>
            ))}
            {!g.rows.length && <tr><td colSpan={g.days.length + 1} className="muted small">Sahanın saat tablosu yok.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CardDetails({ card, busy, onSave, onCancel }) {
  const [d, setD] = useState({ title: card.title || "", note: card.note || "", due: isoToLocalInput(card.due_at), priority: card.priority || "normal" });
  return (
    <section className="pl-section is-focus">
      <div className="pl-section__head"><h3><Icon name="sliders" size={13} /> Ayrıntılar</h3></div>
      <Field label="Başlık"><input value={d.title} maxLength={200} onChange={(e) => setD({ ...d, title: e.target.value })} /></Field>
      <Field label="Açıklama"><textarea rows={3} value={d.note} maxLength={1000} onChange={(e) => setD({ ...d, note: e.target.value })} /></Field>
      <div className="form-grid">
        <Field label="Hatırlatma"><input type="datetime-local" value={d.due} onChange={(e) => setD({ ...d, due: e.target.value })} /></Field>
        <Field label="Öncelik"><div className="seg seg--sm">{TASK_PRIORITIES.map((p) => <button key={p.value} type="button" className={d.priority === p.value ? "is-active" : ""} onClick={() => setD({ ...d, priority: p.value })}>{p.label}</button>)}</div></Field>
      </div>
      <div className="chips">{QUICK_DUES.map((q) => { const v = toLocalInput(q.make(new Date())); return <button key={q.key} type="button" className={`chip ${d.due === v ? "" : "chip--off"}`} onClick={() => setD({ ...d, due: v })}>{q.label}</button>; })}{d.due && <button type="button" className="chip chip--off" onClick={() => setD({ ...d, due: "" })}>Kaldır</button>}</div>
      <div className="row-gap"><span className="spacer" /><button type="button" className="btn btn--sm btn--ghost" onClick={onCancel}>Vazgeç</button><button type="button" className="btn btn--sm btn--primary" disabled={busy || !d.title.trim()} onClick={() => onSave({ title: d.title.trim(), note: d.note, dueAt: d.due ? new Date(d.due).toISOString() : null, priority: d.priority })}>Kaydet</button></div>
    </section>
  );
}
