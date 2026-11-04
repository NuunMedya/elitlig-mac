// Bekleyenler (havuzda bekleyen bütün adaylar) ve Kayıtlar (kart hareketleri
// + görüşmeler tek akışta).
import React, { useEffect, useMemo, useState } from "react";
import { Icon } from "../../components/ui";
import { request } from "../../api";
import { CALL_OUTCOMES, CARD_KINDS, POOL_SOURCE_LABELS, dayLabel, matchesQuery, poolKey, timeAgo, timeLabel } from "../../lib/planningUtils";
import { A, ContactLinks, MoveTargetPicker, Tag } from "./shared";

export function WaitingList({ data, venues, loading, busy, bookingWindow, onOpenCell, onMove, onRemove, onRefresh, cardOf, onOpenCard, onNewCard }) {
  const [venue, setVenue] = useState("");
  const [onlyStranded, setOnlyStranded] = useState(false);
  const [q, setQ] = useState("");
  const [moving, setMoving] = useState(null);
  const allowed = useMemo(() => new Set(venues.map((v) => v.public_id)), [venues]);
  const items = (data?.items || []).filter((i) => allowed.has(i.venue_public_id)).filter((i) => !venue || i.venue_public_id === venue).filter((i) => !onlyStranded || i.stranded).filter((i) => matchesQuery(q, i.team_name, i.note, i.request_note));
  const groups = [];
  items.forEach((i) => { const k = `${i.venue_public_id}|${i.date}`; let g = groups.find((x) => x.key === k); if (!g) { g = { key: k, venue_name: i.venue_name, date: i.date, items: [] }; groups.push(g); } g.items.push(i); });
  const all = (data?.items || []).filter((i) => allowed.has(i.venue_public_id));
  const stranded = all.filter((i) => i.stranded).length;
  return (
    <section className="pl-waiting">
      <div className="filters">
        <p className="small spacer"><strong>{all.length} bekleyen kayıt</strong> · {new Set(all.map((i) => i.team_id)).size} takım{stranded ? <span className="text-red"> · {stranded} kayıt dolu saate düştü, taşınmalı</span> : ""}</p>
        <select className="select-sm" value={venue} onChange={(e) => setVenue(e.target.value)} aria-label="Saha"><option value="">Tüm sahalar</option>{venues.map((v) => <option key={v.public_id} value={v.public_id}>{v.name}</option>)}</select>
        <button type="button" className={`chip ${onlyStranded ? "" : "chip--off"}`} aria-pressed={onlyStranded} onClick={() => setOnlyStranded(!onlyStranded)}><Icon name="alert" size={10} /> Yalnız taşınması gerekenler</button>
        <div className="search-box"><Icon name="search" size={13} /><input value={q} placeholder="Takım ya da not" onChange={(e) => setQ(e.target.value)} aria-label="Takım / not ara" /></div>
        <button type="button" className="icon-btn" title="Yenile" disabled={busy || loading} onClick={onRefresh}><Icon name="refresh" size={14} /></button>
      </div>
      {loading && !data ? <p className="muted">Bekleyenler yükleniyor…</p> : groups.length === 0 ? <p className="muted pl-empty"><Icon name="layers" size={14} /> Bekleyen takım yok. Bir saate takım eklenince burada listelenir.</p> : groups.map((g) => (
        <div key={g.key} className="card pl-waitgroup">
          <h3 className="card__title">{dayLabel(g.date)} <span className="muted small">{g.venue_name}</span></h3>
          <ul className="pl-pool">
            {g.items.map((i) => {
              const k = poolKey(i);
              const card = cardOf?.(i);
              return (
                <li key={k} className={`pl-pool__row ${i.stranded ? "is-stranded" : ""} ${i.priority ? "is-priority" : ""}`}>
                  <div className="pl-pool__main">
                    <button type="button" className="pl-timebtn" title="Saati aç" onClick={() => onOpenCell(i)}>{timeLabel(i.hour, i.minute)}</button>
                    <div className="pl-pool__body">
                      <div className="row-gap"><strong>{i.team_name}</strong><Tag tone={i.source === "request" ? "tool" : ""}>{POOL_SOURCE_LABELS[i.source] || i.source}</Tag>{i.priority ? <Tag tone="amber" icon="star">Öncelikli</Tag> : null}{i.stranded && <Tag tone="red" icon="alert">Saat doldu — taşıyın</Tag>}</div>
                      <ContactLinks teams={data?.teams} teamId={i.team_id} />
                      {i.request_note && <p className="pl-quote">“{i.request_note}”</p>}
                      {i.note && <p className="pl-admin-note"><Icon name="phone" size={10} /> {i.note}</p>}
                    </div>
                  </div>
                  <div className="pl-pool__tools">
                    {card ? <button type="button" className="btn btn--xs btn--soft" onClick={() => onOpenCard(card)}><Icon name="calendar" size={10} /> Talep kartı</button>
                      : <button type="button" className="btn btn--xs btn--soft" onClick={() => onNewCard({ kind: "match_request", teamId: i.team_id, venueId: i.venue_public_id, options: [{ venueId: i.venue_public_id, date: i.date, hour: i.hour, minute: i.minute || 0 }] })}><Icon name="calendar" size={10} /> Seçenek ekle</button>}
                    <button type="button" className="icon-btn icon-btn--xs" title="Başka saate taşı" disabled={busy} onClick={() => setMoving(moving === k ? null : k)}><Icon name="swap" size={12} /></button>
                    <button type="button" className="icon-btn icon-btn--xs" title="Havuzdan çıkar" disabled={busy} onClick={() => onRemove(i)}><Icon name="x" size={12} /></button>
                  </div>
                  {moving === k && <MoveTargetPicker venues={venues} defaultVenueId={i.venue_public_id} defaultDate={i.date} bookingWindow={bookingWindow} busy={busy} onCancel={() => setMoving(null)} onConfirm={async (t) => { await onMove(i, t); setMoving(null); }} />}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}

const EVENT_LABELS = { created: "Kart açıldı", note: "Süreç notu", stage: "Taşındı", kind: "Kart çevrildi", options: "Seçenek eklendi", matched: "Maç ayarlandı", reopened: "Yeniden açıldı" };
const EVENT_ICONS = { created: "plus", note: "message", stage: "chevronRight", kind: "swap", options: "calendar", matched: "ball", reopened: "rotate" };
const FILTERS = [{ key: "", label: "Tümü" }, { key: "cards", label: "Kart hareketleri" }, { key: "calls", label: "Görüşmeler" }, { key: "matched", label: "Ayarlanan maçlar" }];

/** scope: null (bütün kayıtlar) | { taskIds:Set, teamIds:Set, venueIds:Set } — proje sahalarına süzer. */
export function ActivityLog({ refreshKey, scope, onOpenTeam, onOpenCard, notify }) {
  const [rows, setRows] = useState(null);
  const [filter, setFilter] = useState("");
  const [q, setQ] = useState("");
  useEffect(() => {
    let off = false;
    Promise.all([request({ path: `${A}/tasks/events`, query: { limit: 150 } }), request({ path: `${A}/calls`, query: { limit: 150 } })]).then(([ev, calls]) => {
      if (off) return;
      if (!calls.ok && !ev.ok) notify?.(calls.error?.message || "Kayıtlar alınamadı.");
      setRows([
        ...(ev.data?.items || []).map((e) => ({ ...e, source: "card", key: `e${e.id}` })),
        ...(calls.data?.items || []).map((c) => ({ ...c, source: "call", key: `c${c.call_id}` })),
      ].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)));
    });
    return () => { off = true; };
  }, [refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const scoped = (rows || []).filter((r) => !scope || (r.source === "card" ? scope.taskIds.has(r.task_id) : scope.venueIds.has(Number(r.venue_id)) || scope.teamIds.has(Number(r.team_id))));
  const visible = scoped.filter((r) => !filter || (filter === "cards" && r.source === "card") || (filter === "calls" && r.source === "call") || (filter === "matched" && r.type === "matched")).filter((r) => matchesQuery(q, r.team_name, r.text, r.note, r.task_title));
  return (
    <section className="pl-log">
      <div className="filters">
        <div className="seg seg--sm">{FILTERS.map((f) => <button key={f.key} type="button" className={filter === f.key ? "is-active" : ""} onClick={() => setFilter(f.key)}>{f.label}</button>)}</div>
        <span className="muted small spacer">Kart hareketleri ve görüşmeler · son {scoped.length} kayıt{scope ? " (proje sahaları ve takımları)" : ""}</span>
        <div className="search-box"><Icon name="search" size={13} /><input value={q} placeholder="Takım, kart ya da notta ara" onChange={(e) => setQ(e.target.value)} aria-label="Kayıtlarda ara" /></div>
      </div>
      {!rows ? <p className="muted">Kayıtlar yükleniyor…</p> : visible.length === 0 ? <p className="muted pl-empty">{scoped.length ? "Süzgece uyan kayıt yok." : "Henüz kayıt yok."}</p> : (
        <ol className="pl-loglist card">
          {visible.map((r) => {
            if (r.source === "call") {
              const m = CALL_OUTCOMES.find((o) => o.value === r.outcome);
              return (
                <li key={r.key}><span className={`tl-icon pl-tone-${m?.tone || "plain"}`}><Icon name={m?.icon || "phone"} size={11} /></span>
                  <div className="pl-loglist__body"><div className="row-gap"><button type="button" className="link-btn" onClick={() => onOpenTeam(r.team_id)}>{r.team_name || `Takım #${r.team_id}`}</button><Tag tone={m?.tone}>{r.outcome_label}</Tag></div>{r.note && <p>{r.note}</p>}{r.slot_label && <small className="muted">{r.venue_name ? `${r.venue_name} · ` : ""}{r.slot_label}</small>}</div>
                  <time className="muted small">{timeAgo(r.created_at)}</time>
                </li>
              );
            }
            const kind = CARD_KINDS[r.task_kind];
            return (
              <li key={r.key}><span className="tl-icon"><Icon name={EVENT_ICONS[r.type] || "circle"} size={11} /></span>
                <div className="pl-loglist__body">
                  <div className="row-gap"><button type="button" className="link-btn" onClick={() => onOpenCard({ task_id: r.task_id })}>{r.task_title}</button><Tag>{kind?.single || "Kart"}</Tag><span className="pill pill--xs">{EVENT_LABELS[r.type] || r.type}{["stage", "kind", "reopened"].includes(r.type) && r.to_label ? `: ${r.from_label} → ${r.to_label}` : ""}</span></div>
                  {r.text && <p>{r.text}</p>}
                  <small className="muted">{r.team_name && <button type="button" className="link-btn small" onClick={() => onOpenTeam(r.team_id)}>{r.team_name}</button>}{r.author ? `${r.team_name ? " · " : ""}${r.author}` : ""}</small>
                </div>
                <time className="muted small">{timeAgo(r.created_at)}</time>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
