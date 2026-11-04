// Kayıtlar: talep hareketleri ve görüşmeler tek zaman çizelgesinde; tür,
// takım, saha ve tarih süzgeçleri, günlere göre başlıklar.
import React, { useEffect, useMemo, useState } from "react";
import { Icon } from "../../components/ui";
import { request } from "../../api";
import { CARD_KINDS, addDays, localIso, matchesQuery, outcomeMeta, timeLabel } from "../../lib/planningUtils";
import { A, OutcomeTag, Tag, TeamPicker } from "./shared";

const EVENT_LABELS = { created: "Talep açıldı", note: "Talep notu", stage: "Durum değişti", kind: "Türü değişti", options: "Saat seçenekleri", matched: "Maç ayarlandı", reopened: "Yeniden açıldı" };
const EVENT_ICONS = { created: "plus", note: "message", stage: "chevronRight", kind: "swap", options: "calendar", matched: "ball", reopened: "rotate" };
const TYPES = [{ key: "", label: "Tümü", icon: "list" }, { key: "calls", label: "Görüşmeler", icon: "phone" }, { key: "cards", label: "Talep hareketleri", icon: "inbox" }, { key: "matched", label: "Ayarlanan maçlar", icon: "ball" }];
const RANGES = [{ key: "", label: "Tüm tarihler" }, { key: "today", label: "Bugün" }, { key: "7", label: "Son 7 gün" }, { key: "30", label: "Son 30 gün" }];

const dayHead = (iso) => {
  const t = localIso();
  if (iso === t) return "Bugün";
  if (iso === addDays(t, -1)) return "Dün";
  return new Date(`${iso}T12:00:00`).toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long" });
};

const cardVenues = (c) => (c ? [c.venue_public_id, ...(c.options || []).map((o) => o.venue_public_id)].filter(Boolean) : []);

export function ActivityLog({ refreshKey, venues, allTeams, cards = [], onOpenTeam, onOpenCard, notify }) {
  const [rows, setRows] = useState(null);
  const [type, setType] = useState("");
  const [team, setTeam] = useState("");
  const [venue, setVenue] = useState("");
  const [range, setRange] = useState("");
  const [q, setQ] = useState("");
  useEffect(() => {
    let off = false;
    Promise.all([request({ path: `${A}/tasks/events`, query: { limit: 200 } }), request({ path: `${A}/calls`, query: { limit: 200 } })]).then(([ev, calls]) => {
      if (off) return;
      if (!calls.ok && !ev.ok) notify?.(calls.error?.message || "Kayıtlar alınamadı.");
      setRows([
        ...(ev.data?.items || []).map((e) => ({ ...e, source: "card", key: `e${e.id}` })),
        ...(calls.data?.items || []).map((c) => ({ ...c, source: "call", key: `c${c.call_id}` })),
      ].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)));
    });
    return () => { off = true; };
  }, [refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const venueId = venues.find((v) => v.public_id === venue)?.id;
  const from = range === "today" ? localIso() : range ? addDays(localIso(), -Number(range)) : "";
  const visible = useMemo(() => (rows || []).filter((r) => (!type || (type === "cards" && r.source === "card") || (type === "calls" && r.source === "call") || (type === "matched" && r.type === "matched"))
    && (!team || Number(r.team_id) === Number(team))
    && (!venue || (r.source === "call" ? Number(r.venue_id) === Number(venueId) : cardVenues(cards.find((c) => c.task_id === r.task_id)).includes(venue)))
    && (!from || localIso(new Date(r.created_at)) >= from)
    && matchesQuery(q, r.team_name, r.text, r.note, r.task_title, r.outcome_label)), [rows, type, team, venue, venueId, from, q, cards]);
  const days = [];
  visible.forEach((r) => { const d = localIso(new Date(r.created_at)); let g = days[days.length - 1]; if (!g || g.date !== d) { g = { date: d, items: [] }; days.push(g); } g.items.push(r); });
  const active = [type, team, venue, range].filter(Boolean).length;

  return (
    <section className="pl-log">
      <div className="pl-log__bar">
        <div className="pl-srcfilter" role="group" aria-label="Tür">{TYPES.map((t) => <button key={t.key} type="button" className={type === t.key ? "is-active" : ""} onClick={() => setType(t.key)}><Icon name={t.icon} size={12} /> {t.label}</button>)}</div>
        <div className="pl-log__team"><TeamPicker teams={allTeams} value={team} onChange={setTeam} placeholder="Takım" /></div>
        <span className="pl-fl"><Icon name="map" size={12} /><select className="select-sm" value={venue} onChange={(e) => setVenue(e.target.value)} aria-label="Saha"><option value="">Tüm sahalar</option>{venues.map((v) => <option key={v.public_id} value={v.public_id}>{v.name}</option>)}</select></span>
        <span className="pl-fl"><Icon name="calendar" size={12} /><select className="select-sm" value={range} onChange={(e) => setRange(e.target.value)} aria-label="Tarih">{RANGES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}</select></span>
        <div className="search-box"><Icon name="search" size={13} /><input value={q} placeholder="Not, takım ya da talep ara" onChange={(e) => setQ(e.target.value)} aria-label="Kayıtlarda ara" /></div>
        {active > 0 && <button type="button" className="link-btn small" onClick={() => { setType(""); setTeam(""); setVenue(""); setRange(""); }}><Icon name="x" size={10} /> Temizle</button>}
        <span className="spacer" />
        <small className="muted">{visible.length} / {(rows || []).length} kayıt</small>
      </div>
      {!rows ? <div className="pl-skeleton">{[0, 1, 2].map((i) => <i key={i} />)}</div> : visible.length === 0 ? <div className="empty"><span className="empty__icon"><Icon name="clock" size={26} /></span><strong>{rows.length ? "Süzgece uyan kayıt yok." : "Henüz kayıt yok."}</strong></div> : (
        <div className="pl-logdays">
          {days.map((g) => (
            <section key={g.date} className="pl-logday">
              <h3 className="pl-logday__head">{dayHead(g.date)} <small>{g.items.length} kayıt</small></h3>
              <ol className="pl-loglist">
                {g.items.map((r) => (r.source === "call" ? (
                  <li key={r.key} className="pl-logitem is-call">
                    <time>{timeLabel(new Date(r.created_at).getHours(), new Date(r.created_at).getMinutes())}</time>
                    <span className="tl-icon" style={{ background: `color-mix(in srgb, ${outcomeMeta(r.outcome).color} 16%, transparent)`, color: outcomeMeta(r.outcome).color }}><Icon name={outcomeMeta(r.outcome).icon} size={12} /></span>
                    <div className="pl-logitem__body">
                      <div className="row-gap"><button type="button" className="link-btn" onClick={() => onOpenTeam(r.team_id)}><strong>{r.team_name || `Takım #${r.team_id}`}</strong></button><OutcomeTag outcome={r.outcome} label={r.outcome_label} />{r.slot_label && <small className="muted"><Icon name="map" size={10} /> {r.venue_name ? `${r.venue_name} · ` : ""}{r.slot_label}</small>}</div>
                      {r.note && <p>{r.note}</p>}
                    </div>
                  </li>
                ) : (
                  <li key={r.key} className={`pl-logitem is-${r.type}`}>
                    <time>{timeLabel(new Date(r.created_at).getHours(), new Date(r.created_at).getMinutes())}</time>
                    <span className={`tl-icon pl-tl-ev is-${r.type}`}><Icon name={EVENT_ICONS[r.type] || "circle"} size={11} /></span>
                    <div className="pl-logitem__body">
                      <div className="row-gap"><button type="button" className="link-btn" onClick={() => onOpenCard({ task_id: r.task_id })}><strong>{r.task_title}</strong></button><Tag>{CARD_KINDS[r.task_kind]?.single || "Talep"}</Tag><span className="pill pill--xs">{EVENT_LABELS[r.type] || r.type}{["stage", "kind", "reopened"].includes(r.type) && r.to_label ? `: ${r.from_label} → ${r.to_label}` : ""}</span></div>
                      {r.text && <p>{r.text}</p>}
                      <small className="muted">{r.team_name && <button type="button" className="link-btn small" onClick={() => onOpenTeam(r.team_id)}>{r.team_name}</button>}{r.author ? `${r.team_name ? " · " : ""}${r.author}` : ""}</small>
                    </div>
                  </li>
                )))}
              </ol>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}
