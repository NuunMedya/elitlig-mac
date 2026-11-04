// Ekip takibi (todos.oversee) ve maç görevlendirme (staff.assign).
import React, { useMemo, useState } from "react";
import { Empty, Icon, Modal, Segmented, Spinner } from "../../components/ui";
import { useResource } from "../../api";
import { formatDate, formatTime, includesTr, relativeDay } from "../../lib/helpers";
import { CrewPanel } from "./MatchDesk";
import { STATUS_LABELS } from "./todoUtils";

export function TeamOverview({ onOpen }) {
  const [status, setStatus] = useState("active");
  const [cityId, setCityId] = useState("");
  const [userId, setUserId] = useState("");
  const [expanded, setExpanded] = useState(null);
  const res = useResource("/api/todos/overview", { status, city_id: cityId || undefined, user_id: userId || undefined });
  const d = res.data;
  if (res.loading && !d) return <Spinner />;
  if (!d) return <Empty icon="lock" title="Ekip takibi açılamadı" text={res.error?.message} />;
  return (
    <div className="team-overview">
      <div className="filters">
        {d.nationwide ? <select className="select-sm" value={cityId} onChange={(e) => { setCityId(e.target.value); setUserId(""); }}><option value="">Tüm iller</option>{(d.cities || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select> : d.city && <span className="pill pill--tool"><Icon name="map" size={11} /> {d.city.name}</span>}
        <Segmented size="sm" value={status} onChange={setStatus} options={[{ value: "active", label: "Yapılmayan" }, { value: "overdue", label: "Geciken" }, { value: "done", label: "Yapılan" }, { value: "all", label: "Tümü" }]} />
        <span className="muted small">{d.totals?.active} açık · {d.totals?.overdue} geciken · {d.totals?.done} yapılan</span>
      </div>
      <div className="team-overview__body">
        <aside className="people">
          <button type="button" className={!userId ? "is-active" : ""} onClick={() => setUserId("")}><strong>Herkes</strong><small>{d.people.length} kişi</small></button>
          {d.people.map((p) => (
            <button key={p.user.id} type="button" className={String(userId) === String(p.user.id) ? "is-active" : ""} onClick={() => setUserId(p.user.id)}>
              <span className="row-gap"><span className="avatar">{(p.user.name || "?")[0]}</span><strong>{p.user.name}</strong></span>
              <small>{p.user.city} · {p.counts.active} açık{p.counts.overdue ? ` · ${p.counts.overdue} geciken` : ""}</small>
              <div className="progress"><span style={{ width: `${p.counts.total ? (p.counts.done / p.counts.total) * 100 : 0}%` }} /></div>
            </button>
          ))}
        </aside>
        <div className="team-overview__list">
          {d.items.map((t) => (
            <article key={t.id} className={`ov-item ${t.overdue ? "is-late" : ""}`}>
              <header onClick={() => setExpanded(expanded === t.id ? null : t.id)}>
                <span className="pill">{t.kindLabel}</span>
                <strong>{t.title}</strong>
                <span className="spacer" />
                <span className={`pill ${t.status === "done" ? "pill--green" : t.overdue ? "pill--red" : "pill--amber"}`}>{t.status === "done" ? `Bitti · ${formatDate(t.completedAt, { day: "numeric", month: "short" })}` : STATUS_LABELS[t.status]}</span>
              </header>
              <small className="muted">{t.owner?.name}{t.assignedBy ? ` · atayan ${t.assignedBy.name}` : ""}{t.dueAt ? ` · ${relativeDay(t.dueAt)} ${formatTime(t.dueAt)}` : ""}{t.checklist?.length ? ` · ${t.checklist.filter((c) => c.done).length}/${t.checklist.length} aşama` : ""}</small>
              {expanded === t.id && (
                <div className="ov-item__more">
                  {t.body && <p>{t.body}</p>}
                  {t.workflow && <div className="chips">{t.workflow.stages.map((s) => <span key={s.key} className={`chip ${s.done ? "" : "chip--off"}`}>{s.done ? "✓ " : ""}{s.label}</span>)}</div>}
                  {t.checklist?.length > 0 && <div className="chips">{t.checklist.map((c) => <span key={c.id} className={`chip ${c.done ? "" : "chip--off"}`}>{c.done ? "✓ " : "○ "}{c.text}</span>)}</div>}
                  {t.response && <div className="note-box"><strong className="small">Cevap:</strong> {t.response}</div>}
                  {onOpen && t.permissions?.isOwner && <button type="button" className="link-btn small" onClick={() => onOpen(t.id)}>Kartı aç →</button>}
                </div>
              )}
            </article>
          ))}
          {!d.items.length && <Empty icon="check" title="Bu süzgeçte iş yok" />}
        </div>
      </div>
    </div>
  );
}

export function MatchAssign({ onClose, onSaved }) {
  const [range, setRange] = useState("upcoming");
  const [missing, setMissing] = useState(false);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(null);
  const res = useResource("/api/staff/matches", { range });
  const items = useMemo(() => (res.data?.items || []).filter((m) => (!missing || m.assignedCount < m.dutyCount) && (!q || includesTr(`${m.label} ${m.field} ${m.league}`, q))), [res.data, missing, q]);
  const byDay = useMemo(() => {
    const map = new Map();
    items.forEach((m) => { if (!map.has(m.day)) map.set(m.day, []); map.get(m.day).push(m); });
    return [...map.entries()];
  }, [items]);
  const short = { spiker: "SPK", reji: "RJ", hakem: "HKM", fotografci: "FOTO", saglikci: "SĞL" };
  return (
    <Modal title="Maç görevlendir" onClose={onClose} width={820} className="modal--wide">
      <div className="filters">
        <Segmented size="sm" value={range} onChange={setRange} options={[{ value: "upcoming", label: "Yaklaşan maçlar" }, { value: "past", label: "Son 7 gün" }]} />
        <label className="toggle"><input type="checkbox" checked={missing} onChange={(e) => setMissing(e.target.checked)} /> Görevlisi eksik olanlar ({(res.data?.items || []).filter((m) => m.assignedCount < m.dutyCount).length})</label>
        <div className="search-box"><Icon name="search" size={14} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Maç, saha, lig" /></div>
      </div>
      {res.loading && !res.data ? <Spinner /> : byDay.length ? byDay.map(([day, list]) => (
        <section key={day} className="assign-day">
          <h4 className="section-title">{relativeDay(`${day}T12:00:00`)} · {formatDate(day, { weekday: "long", day: "numeric", month: "long" })}</h4>
          {list.map((m) => (
            <div key={m.id} className="assign-row">
              <button type="button" className="assign-row__head" onClick={() => setOpen(open === m.id ? null : m.id)}>
                <span className="tabular">{m.time}</span>
                <span><strong>{m.label}</strong><small className="muted">{m.field} · {m.league}</small></span>
                <span className="spacer" />
                {(res.data?.duties || []).map((d) => <span key={d.key} className={`pill pill--xs ${m.crew?.[d.key] ? "pill--green" : ""}`} title={m.crew?.[d.key]?.name || `${d.label} yok`}>{short[d.key] || d.label}</span>)}
                <strong className={m.assignedCount < m.dutyCount ? "text-amber" : "text-green"}>{m.assignedCount}/{m.dutyCount}</strong>
              </button>
              {open === m.id && <CrewPanel matchId={m.id} crew={(res.data?.duties || []).map((d) => ({ duty: d.key, dutyLabel: d.label, name: m.crew?.[d.key]?.name }))} canAssign onSaved={() => { res.reload({ quiet: true }); onSaved?.(); }} />}
            </div>
          ))}
        </section>
      )) : <Empty icon="ball" title="Maç yok" />}
    </Modal>
  );
}
