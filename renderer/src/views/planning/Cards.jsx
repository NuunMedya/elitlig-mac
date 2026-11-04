// Talepler ve görevler: kart panosu (pano / yapılacaklar listesi), sistem
// önerileri, kart ayrıntısı, yeni kart penceresi, maç kurucu ve saha tablolu
// saat seçici.
import React, { useEffect, useMemo, useState } from "react";
import { Field, Icon, MenuButton, Modal } from "../../components/ui";
import { request } from "../../api";
import {
  BOARD_COLUMNS, CARD_KIND_ORDER, CARD_KINDS, CARD_STAGES, DAY_LABELS, DAY_SHORT, FOCUS_FILTERS, QUICK_DUES, SUGGESTION_TYPES, TASK_PRIORITIES, addDays, cellIndex, cellKey,
  columnOf, contactOf, dateLabel, dayOfIso, dueInfo, filterCards, groupOptions, isoToLocalInput, localIso, nextStep, opponentSuggestions, optionKey, stagesFor, summarizeOptions,
  summarizeSelection, timeAgo, timeLabel, toLocalInput, weekStartOf, whenLabel,
} from "../../lib/planningUtils";
import { A, ContactLinks, SidePanel, Tag, TeamNotesPanel, TeamPicker, openExternal, openSite } from "./shared";
import { SuggestionList } from "./Schedule";
import { CrewPanel } from "../todos/MatchDesk";

const KIND_TONE = { purple: "tool", blue: "blue", amber: "amber", green: "green" };
const STAGE_TONE = { orange: "amber", teal: "blue", green: "green", red: "red" };
const kindTag = (kind) => { const m = CARD_KINDS[kind] || CARD_KINDS.personal; return <Tag tone={KIND_TONE[m.tone]} icon={m.icon}>{m.single}</Tag>; };
const stageTag = (stage) => { const s = CARD_STAGES[stage]; return s && s.column !== "open" ? <Tag tone={STAGE_TONE[s.tone]} solid>{s.label}</Tag> : null; };

const RANGES = [
  { key: "", label: "Tüm tarihler" }, { key: "today", label: "Bugün" }, { key: "next7", label: "Önümüzdeki 7 gün" }, { key: "last7", label: "Son 7 gün" }, { key: "month", label: "Bu ay" }, { key: "custom", label: "Özel aralık" },
];
function rangeOf(key, custom) {
  const t = localIso();
  if (key === "today") return [t, t];
  if (key === "next7") return [t, addDays(t, 6)];
  if (key === "last7") return [addDays(t, -6), t];
  if (key === "month") return [`${t.slice(0, 8)}01`, `${t.slice(0, 8)}31`];
  if (key === "custom") return [custom.from || "", custom.to || ""];
  return ["", ""];
}
const DONE_LIMIT = 30;

/* ================================ Pano ================================ */

export function CardBoard({ items, teams, allTeams, loading, busy, onOpenCard, onMove, onNew, onCreate, preset, feed, showFeed, onToggleFeed, scopeToggle }) {
  const [layout, setLayout] = useState(() => { try { return localStorage.getItem("planning:tasks") === "list" ? "list" : "board"; } catch { return "board"; } });
  const [kind, setKind] = useState("");
  const [focus, setFocus] = useState("");
  const [q, setQ] = useState("");
  const [basis, setBasis] = useState("created");
  const [order, setOrder] = useState("desc");
  const [range, setRange] = useState("");
  const [custom, setCustom] = useState({ from: "", to: "" });
  const [drag, setDrag] = useState(null);
  const [drop, setDrop] = useState(null);
  const [allDone, setAllDone] = useState(false);
  useEffect(() => { if (preset) { setKind(preset.kind || ""); setFocus(preset.focus || ""); } }, [preset]);
  const [from, to] = rangeOf(range, custom);
  const visible = useMemo(() => filterCards(items, { kind, focus, q, basis, order, from, to }), [items, kind, focus, q, basis, order, from, to]);
  const counts = useMemo(() => Object.fromEntries([["", items.length], ...CARD_KIND_ORDER.map((k) => [k, items.filter((c) => c.kind === k).length])]), [items]);
  const saveLayout = (v) => { setLayout(v); try { localStorage.setItem("planning:tasks", v); } catch { /* yoksay */ } };
  const onDrop = (col) => {
    const card = items.find((c) => c.task_id === drag);
    setDrag(null); setDrop(null);
    if (!card || columnOf(card) === col) return;
    if (col === "open") onMove(card, { stage: "open" });
    else if (col === "waiting") onMove(card, { stage: "waiting_them" });
    else onOpenCard(card, { focus: "result" });
  };
  return (
    <section className="pl-board">
      <div className="filters">
        <div className="seg seg--sm" role="radiogroup" aria-label="Görev görünümü">
          <button type="button" className={layout === "board" ? "is-active" : ""} onClick={() => saveLayout("board")}><Icon name="board" size={13} /> Pano</button>
          <button type="button" className={layout === "list" ? "is-active" : ""} onClick={() => saveLayout("list")}><Icon name="checkSquare" size={13} /> Liste</button>
        </div>
        <div className="pl-kindfilter">
          <button type="button" className={`pl-kindchip ${!kind ? "is-active" : ""}`} onClick={() => setKind("")}>Tümü <b>{counts[""]}</b></button>
          {CARD_KIND_ORDER.map((k) => <button key={k} type="button" className={`pl-kindchip is-${KIND_TONE[CARD_KINDS[k].tone]} ${kind === k ? "is-active" : ""}`} onClick={() => setKind(kind === k ? "" : k)}><i />{CARD_KINDS[k].single} <b>{counts[k]}</b></button>)}
        </div>
        <div className="search-box"><Icon name="search" size={13} /><input value={q} placeholder="Takım, başlık ya da notta ara" onChange={(e) => setQ(e.target.value)} aria-label="Kartlarda ara" /></div>
        <span className="spacer" />
        {scopeToggle}
        <button type="button" className={`btn btn--sm ${showFeed ? "btn--soft" : ""}`} aria-pressed={showFeed} onClick={onToggleFeed}><Icon name="sparkles" size={13} /> Öneriler{feed?.data?.tasks?.length ? ` (${feed.data.tasks.length})` : ""}</button>
        <button type="button" className="btn btn--sm btn--primary" onClick={() => onNew(kind || "")}><Icon name="plus" size={13} /> Yeni kart</button>
      </div>
      <div className="filters pl-board__filters">
        <select className="select-sm" value={basis} onChange={(e) => setBasis(e.target.value)} aria-label="Tarih türü"><option value="created">Oluşturma tarihi</option><option value="request">Talep tarihi</option></select>
        <select className="select-sm" value={order} onChange={(e) => setOrder(e.target.value)} aria-label="Sıralama"><option value="desc">{basis === "request" ? "Uzaktan yakına" : "Yeniden eskiye"}</option><option value="asc">{basis === "request" ? "Yakından uzağa" : "Eskiden yeniye"}</option></select>
        <select className="select-sm" value={range} onChange={(e) => setRange(e.target.value)} aria-label="Tarih aralığı">{RANGES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}</select>
        {range === "custom" && <><input type="date" className="pl-input-sm" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} aria-label="Başlangıç" /><span className="muted">–</span><input type="date" className="pl-input-sm" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} aria-label="Bitiş" /></>}
        {focus && <button type="button" className="chip" onClick={() => setFocus("")}><Icon name="filter" size={10} /> {FOCUS_FILTERS[focus]?.label} ×</button>}
        <span className="muted small">{visible.length} kart</span>
      </div>
      <div className={`pl-board__body ${showFeed ? "has-feed" : ""}`}>
        {loading && !items.length ? <p className="muted">Kartlar yükleniyor…</p> : layout === "list" ? (
          <TaskList items={visible} allTeams={allTeams} busy={busy} onOpenCard={onOpenCard} onMove={onMove} onCreate={onCreate} />
        ) : (
          <div className="pl-columns">
            {BOARD_COLUMNS.map((col) => {
              const list = visible.filter((c) => columnOf(c) === col.key);
              const shown = col.key === "done" && !allDone ? list.slice(0, DONE_LIMIT) : list;
              return (
                <div key={col.key} className={`pl-column is-${col.key} ${drop === col.key ? "is-drop" : ""}`} onDragOver={(e) => { if (drag) { e.preventDefault(); setDrop(col.key); } }} onDragLeave={() => setDrop((c) => (c === col.key ? null : c))} onDrop={(e) => { e.preventDefault(); onDrop(col.key); }}>
                  <header className="pl-column__head"><h3><Icon name={col.icon} size={13} /> {col.label}</h3><span className="pill pill--xs">{list.length}</span></header>
                  {list.length === 0 ? <p className="muted small pl-column__empty">{drag ? "Buraya bırakın" : "Kart yok"}</p> : (
                    <ul className="pl-column__list">{shown.map((c) => <CardItem key={c.task_id} card={c} basis={basis} teams={teams} busy={busy} onOpen={(o) => onOpenCard(c, o)} onMove={(v) => onMove(c, v)} onDragStart={() => setDrag(c.task_id)} onDragEnd={() => { setDrag(null); setDrop(null); }} />)}</ul>
                  )}
                  {col.key === "done" && list.length > DONE_LIMIT && <button type="button" className="link-btn small" onClick={() => setAllDone(!allDone)}>{allDone ? "Daha az göster" : `${list.length - DONE_LIMIT} kart daha`}</button>}
                </div>
              );
            })}
          </div>
        )}
        {showFeed && <SuggestionFeed {...feed} busy={busy} />}
      </div>
    </section>
  );
}

function CardItem({ card, basis, teams, busy, onOpen, onMove, onDragStart, onDragEnd }) {
  const meta = CARD_KINDS[card.kind] || CARD_KINDS.personal;
  const due = dueInfo(card.due_at);
  const contact = card.team_id ? contactOf(teams, card.team_id) : null;
  const isOpen = card.status === "open";
  const matched = card.stage === "matched";
  const summary = card.kind === "match_request" && !matched ? summarizeOptions(card.options) : "";
  const dateLine = basis === "request" ? (card.request_date ? `Talep: ${DAY_SHORT[dayOfIso(card.request_date)]} ${dateLabel(card.request_date)}` : "Talep tarihi yok") : `Açıldı ${timeAgo(card.created_at)}`;
  const moveItems = [
    ...stagesFor(card.kind).filter((s) => s !== card.stage && s !== "matched").map((s) => ({ label: CARD_STAGES[s].label, icon: "chevronRight", onClick: () => onMove({ stage: s }) })),
    card.kind !== "personal" && card.stage !== "matched" && { label: "Maç ayarlandı… (maçı kur)", icon: "ball", onClick: () => onOpen({ focus: "match" }) },
    "-",
    ...CARD_KIND_ORDER.filter((k) => k !== card.kind).map((k) => ({ label: `Kartı çevir: ${CARD_KINDS[k].single}`, icon: CARD_KINDS[k].icon, onClick: () => onMove({ kind: k }) })),
  ];
  return (
    <li className={`pl-card is-${KIND_TONE[meta.tone]} ${card.priority === "high" && isOpen ? "is-high" : ""} ${due.late && isOpen ? "is-late" : ""}`} draggable onDragStart={(e) => { e.dataTransfer?.setData?.("text/plain", card.task_id); onDragStart(); }} onDragEnd={onDragEnd}>
      <div className="pl-card__tags">{kindTag(card.kind)}{stageTag(card.stage)}{card.from_app && <Tag icon="phone" title="Takım uygulamadan gönderdi">Uygulama</Tag>}{card.priority === "high" && isOpen && <Tag tone="red" icon="flag">Öncelikli</Tag>}</div>
      <button type="button" className="pl-card__open" onClick={() => onOpen()}>
        {matched && card.opponent_name ? (<><strong className="pl-card__match">{card.team_name} <em>–</em> {card.opponent_name}</strong><small className="text-green"><Icon name="map" size={10} /> {card.venue_name} · {card.slot_label}{card.match_id ? " · fikstürde" : ""}</small></>)
          : (<><strong>{card.title}</strong>{card.team_name && !card.title.includes(card.team_name) && <small><Icon name="team" size={10} /> {card.team_name}</small>}</>)}
        {summary && <small><Icon name="calendar" size={10} /> {summary}</small>}
        {card.kind === "match_request" && !matched && isOpen && !summary && <small className="text-amber"><Icon name="alert" size={10} /> Saat seçeneği yok</small>}
        {card.note && card.kind !== "match_request" && <span className="pl-card__note">{card.note}</span>}
      </button>
      <div className="pl-card__foot">
        <span className={`small ${due.late && isOpen ? "text-red" : "muted"}`}>{due.label && isOpen ? <><Icon name="clock" size={10} /> {due.label}</> : dateLine}</span>
        <span className="row-gap">
          {contact?.tel && <button type="button" className="icon-btn icon-btn--xs" title={`Ara: ${contact.phone}`} onClick={() => openExternal(contact.tel)}><Icon name="phone" size={11} /></button>}
          {contact?.wa && <button type="button" className="icon-btn icon-btn--xs" title="WhatsApp" onClick={() => openExternal(contact.wa)}><Icon name="message" size={11} /></button>}
          {!busy && <MenuButton label={`${card.title}: taşı`} icon="more" size={14} items={moveItems} />}
        </span>
      </div>
    </li>
  );
}

const SECTIONS = [
  { key: "open", label: "Yapılacak", icon: "circle", empty: "Açık görev yok. Yukarıdan yeni görev ekleyin." },
  { key: "waiting", label: "Beklemede", icon: "clock", empty: "Bekleyen görev yok." },
  { key: "done", label: "Tamamlandı", icon: "check", empty: "Henüz tamamlanan görev yok." },
];
const CHECK_LABELS = { open: "Beklemeye al", waiting: "Tamamlandı yap", done: "Yeniden aç" };

export function TaskList({ items, allTeams, busy, onOpenCard, onMove, onCreate }) {
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState("personal");
  const [teamId, setTeamId] = useState("");
  const [showTeam, setShowTeam] = useState(false);
  const [collapsed, setCollapsed] = useState({});
  const grouped = useMemo(() => {
    const out = { open: [], waiting: [], done: [] };
    items.forEach((c) => out[columnOf(c)].push(c));
    const urg = (c) => (dueInfo(c.due_at).late ? 2 : 0) + (c.priority === "high" ? 1 : 0);
    ["open", "waiting"].forEach((k) => { out[k] = out[k].map((c, i) => ({ c, i })).sort((a, b) => urg(b.c) - urg(a.c) || a.i - b.i).map(({ c }) => c); });
    return out;
  }, [items]);
  const ready = title.trim() && (kind !== "contact" || teamId);
  const submit = async (e) => {
    e.preventDefault();
    if (!ready || busy) return;
    if ((await onCreate({ kind, title: title.trim(), teamId: teamId ? Number(teamId) : null, stage: "open", priority: "normal" })) !== null) { setTitle(""); setTeamId(""); setShowTeam(false); }
  };
  const toggle = (c) => { const s = nextStep(c); if (s.focus) onOpenCard(c, { focus: s.focus }); else onMove(c, { stage: s.stage }); };
  return (
    <div className="pl-tasklist">
      <form className="pl-quickadd" onSubmit={submit}>
        <Icon name="plus" size={14} />
        <input value={title} maxLength={200} placeholder={kind === "contact" ? "Görüşme konusu (ör. hafta sonu maçı için ara)…" : "Yeni görev yazın ve Enter'a basın…"} onChange={(e) => setTitle(e.target.value)} aria-label="Görev başlığı" />
        <div className="seg seg--sm">{["personal", "contact"].map((k) => <button key={k} type="button" className={kind === k ? "is-active" : ""} onClick={() => { setKind(k); if (k === "contact") setShowTeam(true); }}>{k === "personal" ? "Görev" : "Görüşme"}</button>)}</div>
        <button type="button" className={`btn btn--xs ${showTeam || teamId ? "btn--soft" : "btn--ghost"}`} onClick={() => setShowTeam(!showTeam)}><Icon name="team" size={11} /> {teamId ? allTeams.find((t) => String(t.id) === String(teamId))?.team_name || "Takım" : "Takım"}</button>
        <button type="submit" className="btn btn--sm btn--primary" disabled={!ready || busy}>Ekle</button>
        {showTeam && <div className="pl-quickadd__team"><TeamPicker teams={allTeams} value={teamId} onChange={setTeamId} placeholder={kind === "contact" ? "Takım (zorunlu)" : "Takım (isteğe bağlı)"} /></div>}
      </form>
      {SECTIONS.map((s) => {
        const list = grouped[s.key];
        return (
          <section key={s.key} className={`pl-tasksec is-${s.key}`}>
            <button type="button" className="pl-tasksec__head" onClick={() => setCollapsed({ ...collapsed, [s.key]: !collapsed[s.key] })}><Icon name={collapsed[s.key] ? "chevronRight" : "chevronDown"} size={12} /><Icon name={s.icon} size={12} /> {s.label} <b>{list.length}</b></button>
            {collapsed[s.key] ? null : list.length === 0 ? <p className="muted small">{s.empty}</p> : (
              <ul className="pl-taskrows">
                {(s.key === "done" ? list.slice(0, 20) : list).map((c) => {
                  const col = columnOf(c);
                  const failed = c.stage === "declined" || c.stage === "unresolved";
                  const due = dueInfo(c.due_at);
                  const opts = c.kind === "match_request" && c.stage !== "matched" ? summarizeOptions(c.options) : "";
                  return (
                    <li key={c.task_id} className={`pl-taskrow is-${col} ${failed ? "is-failed" : ""} ${due.late && c.status === "open" ? "is-late" : ""}`}>
                      <button type="button" className={`pl-check is-${col} ${failed ? "is-failed" : ""}`} disabled={busy} title={CHECK_LABELS[col]} onClick={() => toggle(c)}>{col === "done" ? <Icon name={failed ? "x" : "check"} size={11} strokeWidth={3} /> : col === "waiting" ? <Icon name="clock" size={11} /> : null}</button>
                      <button type="button" className="pl-taskrow__main" onClick={() => onOpenCard(c)}>
                        <strong>{c.title}</strong>
                        <span className="row-gap">{kindTag(c.kind)}{stageTag(c.stage)}{c.team_name && !c.title.includes(c.team_name) && <small className="muted"><Icon name="team" size={10} /> {c.team_name}</small>}{c.stage === "matched" && c.slot_label && <small className="muted"><Icon name="map" size={10} /> {c.venue_name} · {c.slot_label}</small>}{opts && <small className="muted"><Icon name="calendar" size={10} /> {opts}</small>}</span>
                      </button>
                      <span className={`small ${due.late && c.status === "open" ? "text-red" : "muted"}`}>{due.label && c.status === "open" ? due.label : timeAgo(c.completed_at || c.updated_at || c.created_at)}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

/* ================================ Öneriler ================================ */

export function SuggestionFeed({ data, loading, busy, onRefresh, onAddTask, onDismiss, onAddToPool, onLogCall, onOpenCell, onOpenTeam }) {
  const [type, setType] = useState("");
  const [openId, setOpenId] = useState(null);
  const all = Array.isArray(data?.tasks) ? data.tasks : [];
  const items = all.filter((i) => !type || i.type === type);
  const types = Object.entries(SUGGESTION_TYPES).filter(([k]) => all.some((i) => i.type === k));
  return (
    <aside className="pl-feed card">
      <header className="card__head"><h2 className="card__title"><Icon name="sparkles" /> Öneriler</h2><button type="button" className="icon-btn" title="Önerileri yenile" disabled={loading} onClick={onRefresh}><Icon name="refresh" size={14} /></button></header>
      <p className="muted small">Oynama alışkanlıklarına göre, önümüzdeki {data?.horizon?.days || 14} gün</p>
      {types.length > 1 && <select className="select-sm" value={type} onChange={(e) => setType(e.target.value)} aria-label="Öneri türü"><option value="">Tüm öneriler ({all.length})</option>{types.map(([k, m]) => <option key={k} value={k}>{m.label} ({all.filter((i) => i.type === k).length})</option>)}</select>}
      {loading && !data ? <p className="muted small">Öneriler hesaplanıyor…</p> : items.length === 0 ? <p className="muted small">Şu an öneri yok.</p> : (
        <ul className="pl-feed__list">
          {items.map((it) => {
            const meta = SUGGESTION_TYPES[it.type] || { label: it.type, tone: "", icon: "circle" };
            const open = openId === it.id;
            const place = it.venue_public_id && it.date ? { venueId: it.venue_public_id, date: it.date, hour: it.hour, minute: it.minute || 0 } : null;
            const people = it.suggestions?.length ? it.suggestions : it.pool || [];
            const main = it.team_id || it.holder?.team_id || null;
            return (
              <li key={it.id} className={`pl-sugg is-${meta.tone}`}>
                <div className="row-gap"><Tag tone={meta.tone} icon={meta.icon}>{meta.label}</Tag><span className="spacer" /><button type="button" className="icon-btn icon-btn--xs" title="Gizle" disabled={busy} onClick={() => onDismiss(it)}><Icon name="x" size={11} /></button></div>
                <button type="button" className="pl-sugg__title" onClick={() => setOpenId(open ? null : it.id)}>{it.title}</button>
                {place && <p className="small"><strong>{whenLabel(it.days_until)}</strong> · {it.venue_name} · {it.label}</p>}
                {!open && people.length > 0 && <p className="muted small">{it.suggestions?.length ? "Aranabilir: " : ""}{people.slice(0, 3).map((p) => p.team_name).join(", ")}{people.length > 3 ? ` +${people.length - 3}` : ""}</p>}
                {open && (
                  <div className="pl-sugg__detail">
                    {main && <div className="row-gap"><ContactLinks teams={data?.teams} teamId={main} /><button type="button" className="link-btn small" onClick={() => onOpenTeam(main)}>Takım kartı →</button></div>}
                    {it.reasons?.length > 0 && <ul className="pl-reasons">{it.reasons.map((r) => <li key={r}><Icon name="check" size={10} /> {r}</li>)}</ul>}
                    {it.suggestions?.length ? <SuggestionList items={it.suggestions} teams={data?.teams} busy={busy} compact onPrimary={place ? (p) => onAddToPool(p.team_id, place) : null} onLogCall={(p, v) => onLogCall(p.team_id, v, place)} />
                      : it.pool?.length ? <ul className="pl-people">{it.pool.map((p) => <li key={p.team_id}><strong>{p.team_name}</strong><ContactLinks teams={data?.teams} teamId={p.team_id} compact /></li>)}</ul> : null}
                  </div>
                )}
                <div className="row-gap">
                  <button type="button" className="btn btn--xs btn--soft" disabled={busy} onClick={() => onAddTask(it)}><Icon name="plus" size={10} /> Karta çevir</button>
                  {place && <button type="button" className="btn btn--xs btn--ghost" onClick={() => onOpenCell(place)}>Saati aç</button>}
                  {it.type === "idle_team" && place && <button type="button" className="btn btn--xs btn--ghost" disabled={busy} onClick={() => onAddToPool(it.team_id, place)}>Önerilen saate ekle</button>}
                  {!open && (it.suggestions?.length || main) ? <button type="button" className="link-btn small" onClick={() => setOpenId(it.id)}>Ayrıntı</button> : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}

/* ================================ Kart ayrıntısı ================================ */

const EVENT_ICONS = { created: "plus", note: "message", stage: "chevronRight", kind: "swap", options: "calendar", matched: "ball", reopened: "rotate" };
const EVENT_TITLES = { created: "Kart açıldı", matched: "Maç ayarlandı", options: "Seçenekler", note: "Not" };

export function CardDrawer({ card, focus, teams, cards, allTeams, venues, leagues, seasons, defaults, busy, onClose, onUpdate, onMove, onAddNote, onSetOptions, onCreateMatch, onDelete, onOpenCell, onOpenTeam }) {
  const meta = CARD_KINDS[card.kind] || CARD_KINDS.personal;
  const [comment, setComment] = useState("");
  const [noteText, setNoteText] = useState("");
  const [editTitle, setEditTitle] = useState(null);
  const [editing, setEditing] = useState(false);
  const [draftOptions, setDraftOptions] = useState([]);
  const [building, setBuilding] = useState(focus === "match" && card.kind !== "personal" && card.status === "open");
  const pick = () => ({ note: card.note || "", due: isoToLocalInput(card.due_at), priority: card.priority || "normal", teamId: card.team_id ? String(card.team_id) : "" });
  const [details, setDetails] = useState(pick);
  useEffect(() => setDetails(pick()), [card.task_id, card.note, card.due_at, card.priority, card.team_id]); // eslint-disable-line react-hooks/exhaustive-deps
  const move = async (values) => { if ((await onMove(card, { ...values, comment: comment.trim() || undefined })) !== null) setComment(""); };
  const pickStage = (s) => { if (s === card.stage) return; if (s === "matched") { setBuilding(true); return; } move({ stage: s }); };
  const changed = JSON.stringify(details) !== JSON.stringify(pick());
  const saveDetails = () => onUpdate(card, { note: details.note, dueAt: details.due ? new Date(details.due).toISOString() : null, priority: details.priority, ...(details.teamId !== (card.team_id ? String(card.team_id) : "") ? { teamId: details.teamId ? Number(details.teamId) : null } : {}) });
  const waiting = (card.options || []).filter((o) => o.status === "waiting" && !o.is_past);
  const matched = card.stage === "matched";
  const isOpen = card.status === "open";
  const editable = waiting.map((o) => ({ venueId: o.venue_public_id, date: o.date, hour: o.hour, minute: o.minute }));
  return (
    <SidePanel className={`pl-carddrawer is-${KIND_TONE[meta.tone]}`} width={560} onClose={onClose}
      eyebrow={<span className="row-gap">{kindTag(card.kind)}<Tag tone={STAGE_TONE[CARD_STAGES[card.stage]?.tone]} solid={Boolean(CARD_STAGES[card.stage]?.tone)}>{CARD_STAGES[card.stage]?.label || card.stage}</Tag></span>}
      title={editTitle !== null ? (
        <span className="input-with-btn"><input value={editTitle} maxLength={200} autoFocus onChange={(e) => setEditTitle(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { onUpdate(card, { title: editTitle }); setEditTitle(null); } }} aria-label="Kart başlığı" /><button type="button" className="btn btn--xs btn--primary" disabled={busy || !editTitle.trim()} onClick={() => { onUpdate(card, { title: editTitle }); setEditTitle(null); }}>Kaydet</button></span>
      ) : <>{matched && card.opponent_name ? `${card.team_name} – ${card.opponent_name}` : card.title} <button type="button" className="icon-btn icon-btn--xs" aria-label="Başlığı düzenle" onClick={() => setEditTitle(card.title)}><Icon name="sliders" size={11} /></button></>}
      badge={card.team_id ? <span className="row-gap"><button type="button" className="link-btn" onClick={() => onOpenTeam(card.team_id)}><Icon name="team" size={12} /> {card.team_name}</button><ContactLinks teams={teams} teamId={card.team_id} /></span> : null}
      footer={<div className="row-gap"><span className="muted small spacer">Açıldı {timeAgo(card.created_at)}{card.created_by_name ? ` · ${card.created_by_name}` : ""}</span><button type="button" className="btn btn--sm btn--danger-ghost" disabled={busy} onClick={() => onDelete(card)}><Icon name="trash" size={12} /> Kartı sil</button></div>}>
      {card.team_id && <TeamNotesPanel key={card.team_id} teamId={card.team_id} teamName={card.team_name} manager={teams?.[card.team_id]?.account_manager || null} />}
      <section className={`pl-section ${focus === "result" ? "is-focus" : ""}`}>
        <div className="pl-section__head"><h3>Durum</h3><span className="muted small">{card.from_app ? "Takım uygulamadan gönderdi" : ""}</span></div>
        <div className="pl-stagebar" role="radiogroup" aria-label="Kart durumu">
          {stagesFor(card.kind).map((s) => <button key={s} type="button" role="radio" aria-checked={card.stage === s} disabled={busy || (matched && s === "matched")} className={`is-${STAGE_TONE[CARD_STAGES[s].tone] || "plain"} ${card.stage === s ? "is-active" : ""}`} onClick={() => pickStage(s)}>{CARD_STAGES[s].label}</button>)}
        </div>
        <input value={comment} maxLength={1000} placeholder="Taşırken durum notu (isteğe bağlı): ör. Ay sonunda dönecekler" onChange={(e) => setComment(e.target.value)} aria-label="Durum notu" />
        <div className="row-gap"><span className="muted small">Kartı çevir:</span>{CARD_KIND_ORDER.filter((k) => k !== card.kind).map((k) => <button key={k} type="button" className="chip chip--off" disabled={busy} onClick={() => move({ kind: k })}><Icon name={CARD_KINDS[k].icon} size={10} /> {CARD_KINDS[k].single}</button>)}</div>
      </section>
      {matched && (card.opponent_name || card.slot_label) && (
        <section className="pl-match">
          <div className="pl-match__teams"><div><strong>{card.team_name}</strong></div><span>vs</span><div><strong>{card.opponent_name || "—"}</strong></div></div>
          <p className="muted small"><Icon name="map" size={11} /> {card.venue_name} · {card.slot_label}{card.match_id ? " · fikstürde" : " · fikstüre yazılmadı"}</p>
          <div className="row-gap">
            {card.match_id && <button type="button" className="btn btn--xs btn--ghost" onClick={() => openSite(`/editor/maclar/${card.match_id}/oncesi`)}><Icon name="external" size={11} /> Fikstür kaydı</button>}
            {card.venue_public_id && card.date && <button type="button" className="btn btn--xs btn--ghost" onClick={() => onOpenCell({ venue_public_id: card.venue_public_id, date: card.date, hour: card.hour, minute: card.minute })}>Programda aç</button>}
          </div>
          {card.match_id && <CrewPanel matchId={card.match_id} canAssign />}
        </section>
      )}
      {card.kind === "match_request" && !matched && (
        <section className="pl-section">
          <div className="pl-section__head"><h3>Müsait olduğu saatler <span className="muted">({waiting.length})</span></h3>{isOpen && !editing && <button type="button" className="btn btn--xs" onClick={() => { setDraftOptions(editable); setEditing(true); }}><Icon name="grid" size={11} /> Seçenekleri düzenle</button>}</div>
          {editing ? (
            <div className="pl-subpanel">
              <SlotPicker venues={venues} initialOptions={editable} onChange={setDraftOptions} />
              <div className="row-gap"><span className="spacer" /><button type="button" className="btn btn--sm btn--ghost" onClick={() => setEditing(false)}>Vazgeç</button><button type="button" className="btn btn--sm btn--primary" disabled={busy} onClick={async () => { if ((await onSetOptions(card, draftOptions)) !== null) setEditing(false); }}><Icon name="check" size={12} /> Kaydet ({draftOptions.length} seçenek)</button></div>
            </div>
          ) : waiting.length === 0 ? <p className="muted small">Henüz saat seçeneği yok. “Seçenekleri düzenle” ile saha tablosundan seçin.</p> : (
            <ul className="pl-optgroups">
              {groupOptions(waiting).map((g) => (
                <li key={g.date}><span className="pl-optgroups__day">{DAY_SHORT[g.day]} {dateLabel(g.date)}</span>
                  <div>{g.venues.map(([vn, list]) => <div key={vn} className="row-gap"><span className="muted small">{vn}</span>{list.map((o) => <button key={o.option_id} type="button" className={`pl-optchip ${o.slot_status === "booked" || o.slot_status === "closed" ? "is-blocked" : ""}`} title="Programda aç" onClick={() => onOpenCell({ venue_public_id: o.venue_public_id, date: o.date, hour: o.hour, minute: o.minute })}>{timeLabel(o.hour, o.minute)}</button>)}</div>)}</div>
                </li>
              ))}
            </ul>
          )}
          {isOpen && !building && !editing && <button type="button" className="btn btn--primary btn--block" onClick={() => setBuilding(true)}><Icon name="ball" size={13} /> Saatlerden birini seçip maçı oluştur</button>}
        </section>
      )}
      {card.kind === "contact" && isOpen && !building && <button type="button" className="btn btn--soft btn--block" onClick={() => setBuilding(true)}><Icon name="ball" size={13} /> Bu takımla maç oluştur</button>}
      {building && isOpen && card.kind !== "personal" && (
        <section className="pl-section is-focus">
          <div className="pl-section__head"><h3>Maçı oluştur</h3></div>
          <MatchBuilder card={card} cards={cards} allTeams={allTeams} venues={venues} leagues={leagues} seasons={seasons} defaults={defaults} busy={busy} onCancel={() => setBuilding(false)} onSubmit={(v) => onCreateMatch(card, v)} />
        </section>
      )}
      <section className="pl-section">
        <div className="pl-section__head"><h3>Ayrıntılar</h3></div>
        <Field label="Açıklama"><textarea rows={3} value={details.note} maxLength={1000} onChange={(e) => setDetails({ ...details, note: e.target.value })} /></Field>
        <div className="form-grid">
          <Field label="Hatırlatma"><input type="datetime-local" value={details.due} onChange={(e) => setDetails({ ...details, due: e.target.value })} /></Field>
          <Field label="Öncelik"><div className="seg seg--sm">{TASK_PRIORITIES.map((p) => <button key={p.value} type="button" className={details.priority === p.value ? "is-active" : ""} onClick={() => setDetails({ ...details, priority: p.value })}>{p.label}</button>)}</div></Field>
        </div>
        <div className="chips">{QUICK_DUES.map((d) => { const v = toLocalInput(d.make(new Date())); return <button key={d.key} type="button" className={`chip ${details.due === v ? "" : "chip--off"}`} onClick={() => setDetails({ ...details, due: v })}>{d.label}</button>; })}{details.due && <button type="button" className="chip chip--off" onClick={() => setDetails({ ...details, due: "" })}>Kaldır</button>}</div>
        {card.kind === "personal" && <TeamPicker label="Bağlı takım (isteğe bağlı)" teams={allTeams} value={details.teamId} onChange={(v) => setDetails({ ...details, teamId: v })} />}
        {changed && <div className="row-gap"><span className="spacer" /><button type="button" className="btn btn--sm btn--primary" disabled={busy} onClick={saveDetails}>Değişiklikleri kaydet</button></div>}
      </section>
      <section className="pl-section">
        <div className="pl-section__head"><h3>Süreç notları ve geçmiş</h3></div>
        <div className="note-add">
          <textarea rows={2} value={noteText} maxLength={1000} placeholder="Not yazın: ör. Kaptanla konuştum, cuma dönecek." onChange={(e) => setNoteText(e.target.value)} onKeyDown={async (e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && noteText.trim()) { if ((await onAddNote(card, noteText.trim())) !== null) setNoteText(""); } }} />
          <button type="button" className="btn btn--sm btn--primary" disabled={busy || !noteText.trim()} onClick={async () => { if ((await onAddNote(card, noteText.trim())) !== null) setNoteText(""); }}>Notu ekle</button>
        </div>
        {card.events?.length ? (
          <ol className="pl-timeline">
            {card.events.map((ev) => (
              <li key={ev.id} className={`is-${ev.type}`}><span className="tl-icon"><Icon name={EVENT_ICONS[ev.type] || "circle"} size={11} /></span>
                <div><strong>{["stage", "kind", "reopened"].includes(ev.type) ? `${ev.from_label || ""} → ${ev.to_label || ""}` : EVENT_TITLES[ev.type] || "Not"}</strong>{ev.text && <p>{ev.text}</p>}<small className="muted">{timeAgo(ev.created_at)}{ev.author ? ` · ${ev.author}` : ""}</small></div>
              </li>
            ))}
          </ol>
        ) : <p className="muted small">Henüz not yok.</p>}
      </section>
    </SidePanel>
  );
}

/* ================================ Maç kurucu ================================ */

const timesOf = (v) => (Array.isArray(v?.grid?.times) ? v.grid.times : []);
export function MatchBuilder({ card, cards = [], allTeams, venues, leagues, seasons, defaults = {}, busy, initial = {}, submitLabel = "Maçı oluştur ve fikstüre ekle", onSubmit, onCancel }) {
  const [homeId, setHomeId] = useState(String(initial.homeTeamId || card?.team_id || ""));
  const [awayId, setAwayId] = useState(String(initial.awayTeamId || card?.opponent_team_id || ""));
  const waitingOpts = (card?.options || []).filter((o) => o.status === "waiting" && !o.is_past && o.slot_status !== "booked" && o.slot_status !== "closed");
  const first = waitingOpts[0];
  const preset = initial.venueId ? { venueId: initial.venueId, date: initial.date || "", hour: initial.hour ?? "", minute: initial.minute || 0 }
    : card?.venue_public_id && card?.date && !first ? { venueId: card.venue_public_id, date: card.date, hour: card.hour ?? "", minute: card.minute || 0 } : null;
  const [slot, setSlot] = useState(() => preset || (first ? { venueId: first.venue_public_id, date: first.date, hour: first.hour, minute: first.minute } : { venueId: venues.length === 1 ? venues[0].public_id : "", date: "", hour: "", minute: 0 }));
  const [manual, setManual] = useState(!first || Boolean(preset));
  const [league, setLeague] = useState(String(card?.league_id || initial.leagueId || defaults.league || ""));
  const [season, setSeason] = useState(String(card?.season_id || initial.seasonId || defaults.season || ""));
  const venue = venues.find((v) => v.public_id === slot.venueId) || null;
  const slotReady = Boolean(slot.venueId && slot.date && slot.hour !== "" && slot.hour != null);
  const opponents = useMemo(() => opponentSuggestions(cards, slot, { homeId, excludeTaskId: card?.task_id }), [cards, slot, homeId, card]);
  const scopedSeasons = league ? seasons.filter((s) => String(s.league_id) === String(league)) : seasons;
  const ready = homeId && awayId && homeId !== awayId && slotReady;
  const name = (id) => allTeams.find((t) => String(t.id) === String(id))?.team_name || "";
  const same = (o) => o.venue_public_id === slot.venueId && o.date === slot.date && Number(o.hour) === Number(slot.hour) && Number(o.minute || 0) === Number(slot.minute || 0);
  return (
    <div className="pl-builder">
      <div className="pl-builder__teams">
        <TeamPicker label="Ev sahibi" teams={allTeams} value={homeId} exclude={awayId} onChange={setHomeId} placeholder="Takım seçin" />
        <button type="button" className="icon-btn" title="Yer değiştir" onClick={() => { setHomeId(awayId); setAwayId(homeId); }}><Icon name="swap" size={14} /></button>
        <TeamPicker label="Deplasman" teams={allTeams} value={awayId} exclude={homeId} onChange={setAwayId} placeholder="Rakip seçin" />
      </div>
      <div className="pl-builder__block">
        <h4>Saat</h4>
        {waitingOpts.length > 0 && (
          <div className="chips">
            {waitingOpts.map((o) => <button key={o.option_id} type="button" className={`chip ${!manual && same(o) ? "" : "chip--off"}`} onClick={() => { setManual(false); setSlot({ venueId: o.venue_public_id, date: o.date, hour: o.hour, minute: o.minute }); }}>{o.label} · {o.venue_name}</button>)}
            <button type="button" className={`chip ${manual ? "" : "chip--off"}`} onClick={() => setManual(true)}>Başka saat</button>
          </div>
        )}
        {manual && (
          <div className="form-grid form-grid--3">
            <Field label="Saha"><select value={slot.venueId} onChange={(e) => setSlot({ ...slot, venueId: e.target.value, hour: "" })}><option value="">Saha seçin</option>{venues.map((v) => <option key={v.public_id} value={v.public_id}>{v.name}</option>)}</select></Field>
            <Field label="Gün"><input type="date" value={slot.date} onChange={(e) => setSlot({ ...slot, date: e.target.value })} /></Field>
            <Field label="Saat"><select value={slot.hour === "" ? "" : timeLabel(slot.hour, slot.minute)} disabled={!venue} onChange={(e) => { const t = timesOf(venue).find((x) => timeLabel(x.hour, x.minute) === e.target.value); setSlot({ ...slot, hour: t ? t.hour : "", minute: t ? t.minute : 0 }); }}><option value="">Saat</option>{timesOf(venue).map((t) => { const l = timeLabel(t.hour, t.minute); return <option key={l} value={l}>{l}</option>; })}</select></Field>
          </div>
        )}
      </div>
      {slotReady && (
        <div className="pl-builder__block">
          <h4>Önerilen rakipler</h4>
          {opponents.length === 0 ? <p className="muted small">Bu gün için açık maç talebi olan başka takım yok; rakibi yukarıdan arayın.</p> : (
            <div className="chips">{opponents.map((o) => <button key={o.team_id} type="button" className={`chip ${String(awayId) === String(o.team_id) || String(homeId) === String(o.team_id) ? "" : "chip--off"}`} onClick={() => (homeId ? setAwayId(String(o.team_id)) : setHomeId(String(o.team_id)))}>{o.team_name} · {o.exact ? "bu saati istiyor" : "aynı gün talebi var"}</button>)}</div>
          )}
        </div>
      )}
      <div className="form-grid">
        <Field label="Lig"><select value={league} onChange={(e) => { setLeague(e.target.value); setSeason(""); }}><option value="">Lig seçin</option>{leagues.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></Field>
        <Field label="Sezon"><select value={season} onChange={(e) => setSeason(e.target.value)}><option value="">Sezon seçin</option>{scopedSeasons.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
      </div>
      {ready && !(league && season) && <p className="small text-amber"><Icon name="alert" size={11} /> Lig ve sezon seçilmezse maç programa yazılır ama fikstüre eklenmez.</p>}
      <div className="row-gap pl-builder__foot">
        <span className="muted small spacer">{ready ? `${name(homeId)} – ${name(awayId)} · ${venue?.name || ""} · ${dateLabel(slot.date)} ${timeLabel(slot.hour, slot.minute)}` : "İki takım ve saat seçin."}</span>
        {onCancel && <button type="button" className="btn btn--sm btn--ghost" onClick={onCancel}>Vazgeç</button>}
        <button type="button" className="btn btn--primary" disabled={busy || !ready} onClick={() => onSubmit({ homeTeamId: Number(homeId), awayTeamId: Number(awayId), venueId: slot.venueId, date: slot.date, hour: Number(slot.hour), minute: Number(slot.minute || 0), leagueId: league || null, seasonId: season || null, label: `${name(homeId)} – ${name(awayId)}` })}><Icon name="ball" size={13} /> {submitLabel}</button>
      </div>
    </div>
  );
}

/* ================================ Saat seçici ================================ */

const fallbackDays = (venue, ws) => {
  const today = localIso();
  const open = Array.isArray(venue?.active_days) && venue.active_days.length ? venue.active_days.map(Number) : [1, 2, 3, 4, 5, 6, 7];
  return Array.from({ length: 7 }, (_, i) => addDays(ws, i)).filter((d) => open.includes(dayOfIso(d))).map((d) => ({ date: d, day: dayOfIso(d), label: DAY_LABELS[dayOfIso(d)], date_label: dateLabel(d), is_past: d < today, is_bookable: d >= today, is_today: d === today }));
};

export function SlotPicker({ venues, initialOptions = [], initialVenueId = "", onChange }) {
  const active = useMemo(() => venues.filter((v) => v.status === "active" || v.status === undefined), [venues]);
  const [selected, setSelected] = useState(() => new Map(initialOptions.map((o) => [optionKey(o), { venueId: o.venueId, date: o.date, hour: Number(o.hour), minute: Number(o.minute || 0) }])));
  const [venueId, setVenueId] = useState(() => initialVenueId || initialOptions[0]?.venueId || active[0]?.public_id || "");
  const [weekStart, setWeekStart] = useState(() => { const f = initialOptions.map((o) => o.date).sort()[0]; return f ? weekStartOf(f) : ""; });
  const [boards, setBoards] = useState({});
  const bkey = `${venueId}|${weekStart || "first"}`;
  useEffect(() => {
    if (!venueId || boards[bkey] !== undefined) return undefined;
    let off = false;
    request({ path: `${A}/venues/${venueId}/board`, query: weekStart ? { weekStart } : undefined }).then((r) => {
      if (off) return;
      const data = r.ok ? r.data : null;
      setBoards((c) => ({ ...c, [bkey]: data, ...(data?.week_start ? { [`${venueId}|${data.week_start}`]: data } : {}) }));
      if (!weekStart && data?.week_start) setWeekStart(data.week_start);
    });
    return () => { off = true; };
  }, [venueId, weekStart, bkey, boards]);
  const options = useMemo(() => [...selected.values()], [selected]);
  useEffect(() => { onChange?.(options); }, [options]); // eslint-disable-line react-hooks/exhaustive-deps
  const venue = active.find((v) => v.public_id === venueId) || null;
  const board = boards[bkey] || null;
  const week = weekStart || board?.week_start || weekStartOf(localIso());
  const days = board?.venue?.grid?.days || fallbackDays(venue, week);
  const times = board?.venue?.grid?.times || venue?.grid?.times || [];
  const cells = useMemo(() => cellIndex(board?.cells), [board]);
  const weeks = board?.weeks || [];
  const wi = weeks.findIndex((w) => w.start === week);
  const blocked = (d, t) => { if (d.is_past || d.is_bookable === false) return "Geçti"; const c = cells.get(cellKey(d.date, t.hour, t.minute)); return c?.status === "booked" ? "Dolu" : c?.status === "closed" ? "Kapalı" : ""; };
  const k = (d, t) => optionKey({ venueId, date: d.date, hour: t.hour, minute: t.minute });
  const setMany = (pairs, on) => setSelected((cur) => { const n = new Map(cur); pairs.forEach(([d, t]) => { if (blocked(d, t)) return; if (on) n.set(k(d, t), { venueId, date: d.date, hour: t.hour, minute: t.minute || 0 }); else n.delete(k(d, t)); }); return n; });
  const toggleAll = (pairs) => { const free = pairs.filter(([d, t]) => !blocked(d, t)); setMany(free, !free.every(([d, t]) => selected.has(k(d, t)))); };
  const countFor = (id) => options.filter((o) => o.venueId === id).length;
  const summary = summarizeSelection(options, active);
  return (
    <div className="pl-slotpicker">
      <div className="chips">{active.map((v) => <button key={v.public_id} type="button" className={`chip ${v.public_id === venueId ? "" : "chip--off"}`} onClick={() => setVenueId(v.public_id)}><Icon name="map" size={10} /> {v.name}{countFor(v.public_id) ? <b> {countFor(v.public_id)}</b> : null}</button>)}</div>
      {venue ? (
        <>
          <div className="row-gap"><strong>{venue.name}</strong><span className="muted small">{venue.open_label}–{venue.close_label}</span>
            {weeks.length > 0 && <span className="pl-pager"><button type="button" className="icon-btn icon-btn--xs" disabled={wi <= 0} onClick={() => setWeekStart(weeks[wi - 1].start)} aria-label="Önceki hafta"><Icon name="chevronLeft" size={12} /></button><span className="small">{weeks[wi]?.label || ""}</span><button type="button" className="icon-btn icon-btn--xs" disabled={wi < 0 || wi >= weeks.length - 1} onClick={() => setWeekStart(weeks[wi + 1].start)} aria-label="Sonraki hafta"><Icon name="chevronRight" size={12} /></button></span>}
            {countFor(venueId) > 0 && <button type="button" className="link-btn small" onClick={() => setSelected((c) => new Map([...c.entries()].filter(([, o]) => o.venueId !== venueId)))}>Bu sahadaki seçimi temizle</button>}
          </div>
          <div className="pl-heat-wrap">
            <table className="pl-grid">
              <thead><tr><th />{days.map((d) => <th key={d.date}><button type="button" className={`pl-grid__head ${d.is_today ? "is-today" : ""}`} disabled={d.is_past || d.is_bookable === false} onClick={() => toggleAll(times.map((t) => [d, t]))} title="Bu günün bütün saatlerini seç"><small>{DAY_SHORT[d.day]}</small> {d.date_label || dateLabel(d.date)}</button></th>)}</tr></thead>
              <tbody>
                {times.map((t) => (
                  <tr key={timeLabel(t.hour, t.minute)}>
                    <th scope="row"><button type="button" className="pl-grid__head" onClick={() => toggleAll(days.map((d) => [d, t]))} title="Bu saati bütün günlerde seç">{timeLabel(t.hour, t.minute)}</button></th>
                    {days.map((d) => { const reason = blocked(d, t); const on = selected.has(k(d, t)); const c = cells.get(cellKey(d.date, t.hour, t.minute));
                      return <td key={d.date}><button type="button" className={`pl-grid__cell ${on ? "is-on" : ""} ${reason ? "is-blocked" : ""}`} disabled={Boolean(reason)} aria-pressed={on} aria-label={`${venue.name} ${d.date} ${timeLabel(t.hour, t.minute)}${reason ? ` · ${reason}` : ""}`} onClick={() => setMany([[d, t]], !on)}>{on ? <Icon name="check" size={12} /> : reason || (c?.status === "awaiting" ? "rakip bekliyor" : c?.pool_count ? `${c.pool_count} aday` : "")}</button></td>; })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : <p className="muted small">Önce saha ekleyin.</p>}
      <div className={`pl-slotpicker__summary ${options.length ? "is-ready" : ""}`}><strong>{options.length} seçenek</strong><span className="muted small">{options.length ? `${summary.length} saha · ${new Set(options.map((o) => o.date)).size} gün` : "Sahaya tıklayıp tablodan gün ve saat seçin."}</span></div>
      {summary.map((g) => (
        <div key={g.venueId} className="pl-slotpicker__venue"><button type="button" className="link-btn small" onClick={() => setVenueId(g.venueId)}>{g.name}</button>
          {g.days.map((d) => <div key={d.date} className="row-gap"><span className="muted small">{DAY_SHORT[dayOfIso(d.date)]} {dateLabel(d.date)}</span>{d.items.map((o) => <button key={optionKey(o)} type="button" className="pl-optchip" onClick={() => setSelected((c) => { const n = new Map(c); n.delete(optionKey(o)); return n; })}>{timeLabel(o.hour, o.minute)} ×</button>)}</div>)}
        </div>
      ))}
    </div>
  );
}

/* ================================ Yeni kart ================================ */

const TILES = [...CARD_KIND_ORDER.map((k) => ({ key: k, ...CARD_KINDS[k] })), { key: "match_entry", single: "Maç girişi", icon: "ball", tone: "green", hint: "İki takımı saat, lig ve sezonla eşleştirip fikstüre yaz." }];

export function NewCardDialog({ prefill = {}, allTeams, venues, cards, leagues, seasons, defaults, busy, onCreate, onCreateMatch, onClose }) {
  const [kind, setKind] = useState(prefill.kind || "");
  const [teamId, setTeamId] = useState(prefill.teamId ? String(prefill.teamId) : "");
  const [title, setTitle] = useState(prefill.title || "");
  const [note, setNote] = useState(prefill.note || "");
  const [stage, setStage] = useState("open");
  const [due, setDue] = useState("");
  const [priority, setPriority] = useState(prefill.priority || "normal");
  const [options, setOptions] = useState([]);
  const tile = TILES.find((t) => t.key === kind);
  const needsTeam = kind === "match_request" || kind === "contact";
  const ready = kind && kind !== "match_entry" && (!needsTeam || teamId) && (kind !== "personal" || title.trim()) && (kind !== "match_request" || options.length);
  const submit = async () => {
    if (!ready) return;
    const body = { kind, title: title.trim() || undefined, note: note.trim() || undefined, teamId: teamId ? Number(teamId) : null, priority, dueAt: due ? new Date(due).toISOString() : null, ...(prefill.sourceKey ? { sourceKey: prefill.sourceKey } : {}) };
    if (kind !== "match_request") body.stage = stage; else body.options = options;
    if ((await onCreate(body)) !== null) onClose();
  };
  return (
    <Modal title={tile ? `Yeni kart · ${tile.single}` : "Yeni kart — ne eklemek istiyorsunuz?"} onClose={onClose} width={kind === "match_request" || kind === "match_entry" ? 860 : 640} className="pl-newcard"
      footer={kind && kind !== "match_entry" ? <>
        <span className="muted small spacer">{kind === "match_request" ? (options.length ? `${options.length} saat seçeneği tek kartta kaydedilecek; havuza ve programa da yazılır.` : "Sahaya tıklayıp tablodan gün ve saat seçin.") : needsTeam && !teamId ? "Takım seçin." : ""}</span>
        <button type="button" className="btn" onClick={onClose}>Vazgeç</button>
        <button type="button" className="btn btn--primary" disabled={busy || !ready} onClick={submit}><Icon name="check" size={13} /> Kaydet</button>
      </> : null}>
      <div className="pl-kindpick">
        {TILES.map((t) => <button key={t.key} type="button" className={`pl-kindtile is-${KIND_TONE[t.tone]} ${kind === t.key ? "is-active" : ""}`} onClick={() => setKind(t.key)}><Icon name={t.icon} size={16} /><strong>{t.single}</strong><small>{t.hint}</small></button>)}
      </div>
      {kind && kind !== "match_entry" && (
        <div className="pl-newcard__body">
          <div className="form-grid">
            <TeamPicker label={needsTeam ? "Takım *" : "Takım (isteğe bağlı)"} teams={allTeams} value={teamId} onChange={setTeamId} />
            <Field label={kind === "personal" ? "Başlık *" : "Başlık (isteğe bağlı)"}><input value={title} maxLength={200} placeholder={kind === "personal" ? "Ör. Oyuncu kaydı hatalı görünüyor" : "Boş bırakılırsa takım adından oluşur"} onChange={(e) => setTitle(e.target.value)} /></Field>
          </div>
          {kind === "match_request" && <SlotPicker venues={venues} initialOptions={prefill.options || []} initialVenueId={prefill.venueId || ""} onChange={setOptions} />}
          {kind !== "match_request" && <Field label="Durum"><div className="seg seg--sm">{["open", "waiting_them", "waiting_us"].map((s) => <button key={s} type="button" className={stage === s ? "is-active" : ""} onClick={() => setStage(s)}>{CARD_STAGES[s].label}</button>)}</div></Field>}
          <Field label={kind === "contact" ? "Görüşme notu" : "Not"}><textarea rows={3} value={note} maxLength={1000} placeholder={kind === "contact" ? "Kiminle konuşuldu, ne dendi?" : kind === "match_request" ? "Ör. Pazartesi ya da salı, 22–24 arası" : "Ayrıntılar"} onChange={(e) => setNote(e.target.value)} /></Field>
          {kind !== "match_request" && (
            <div className="form-grid">
              <Field label="Hatırlatma"><input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} /><span className="chips">{QUICK_DUES.map((d) => { const v = toLocalInput(d.make(new Date())); return <button key={d.key} type="button" className={`chip ${due === v ? "" : "chip--off"}`} onClick={() => setDue(v)}>{d.label}</button>; })}</span></Field>
              <Field label="Öncelik"><div className="seg seg--sm">{TASK_PRIORITIES.map((p) => <button key={p.value} type="button" className={priority === p.value ? "is-active" : ""} onClick={() => setPriority(p.value)}>{p.label}</button>)}</div></Field>
            </div>
          )}
        </div>
      )}
      {kind === "match_entry" && (
        <MatchBuilder cards={cards} allTeams={allTeams} venues={venues} leagues={leagues} seasons={seasons} defaults={defaults} busy={busy}
          initial={{ homeTeamId: prefill.teamId, venueId: prefill.options?.[0]?.venueId || prefill.venueId, date: prefill.options?.[0]?.date, hour: prefill.options?.[0]?.hour, minute: prefill.options?.[0]?.minute }}
          onSubmit={async (v) => { if ((await onCreateMatch(v)) !== null) onClose(); }} />
      )}
    </Modal>
  );
}
