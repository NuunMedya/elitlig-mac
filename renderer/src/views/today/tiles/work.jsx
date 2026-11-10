// Yapılacaklar ve takvim: odaktaki işler, önümüzdeki 7 gün, son notlar, ekipman, kayıt sayıları.
import React, { useMemo, useState } from "react";
import { Icon } from "../../../components/ui";
import { patch, post, tempId } from "../../../api";
import { formatTime, groupTodos, parseQuickTask, relativeDay } from "../../../lib/helpers";
import { colorOf } from "../../../lib/agendaUtils";
import { isAllDayDue, isProjectItem, mergeUpcoming, projectKindOf, projectRoute } from "../../../lib/projectAgenda";
import { todaySummary } from "../../../lib/equipmentUtils";
import { refreshData, useData } from "../data";
import { Big, List, Row, State, Stats, XsButton } from "../parts";

const todoQuery = { view: "mine", status: "active" };

export function TodosTile({ tier, go, lines, result }) {
  const q = useData("/api/todos", todoQuery);
  const [text, setText] = useState("");
  const now = new Date();
  const groups = useMemo(() => groupTodos(q.data?.items || [], now), [q.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const focus = [...groups.overdue, ...groups.today];
  if (tier === "xs") return <XsButton icon="checkSquare" value={q.data ? focus.length : "–"} label="bugün iş" tone={groups.overdue.length ? "red" : ""} onClick={() => go("todos")} />;
  const toggle = async (t) => {
    q.setData((d) => (d ? { ...d, items: d.items.map((x) => (x.id === t.id ? { ...x, status: "done" } : x)) } : d));
    const res = await patch(`/api/todos/${t.id}`, { status: "done" });
    if (!result(res, `“${t.title}” tamamlandı.`)) q.reload(); else window.dispatchEvent(new Event("elitlig:todos-changed"));
  };
  if (tier === "s") {
    const top = focus[0];
    return <State q={q}><Big value={focus.length} label="bugünün işi" sub={groups.overdue.length ? `${groups.overdue.length} gecikmiş · ${top?.title || ""}` : top ? top.title : "Bugün için iş yok ✓"} tone={groups.overdue.length ? "red" : ""} onClick={() => go("todos")} /></State>;
  }
  const add = async (e) => {
    e.preventDefault();
    const p = parseQuickTask(text);
    if (!p.title) return;
    const res = await post("/api/todos", { kind: p.dueAt ? "reminder" : "task", title: p.title, due_at: p.dueAt, priority: p.priority }, { tempId: tempId() });
    if (result(res, "Görev eklendi.")) { setText(""); refreshData("/api/todos"); }
  };
  const big = tier === "l" || tier === "xl";
  const row = (t) => (
    <li key={t.id} className="dt-task">
      <button type="button" className="check" onClick={() => toggle(t)} aria-label={`Tamamla: ${t.title}`} disabled={t.permissions && !t.permissions.canChangeStatus} />
      <button type="button" className="dt-task__title" onClick={() => go(`todos:${t.id}`)}>
        {t.priority === "high" && <Icon name="flag" size={12} className="text-red" />}
        <span>{t.title}</span>
        {big && t.project && <span className="proj-badge" style={{ "--c": t.project.color || "#6d28d9" }} title={`Proje: ${t.project.name}`}><span className="proj-badge__dot" />{t.project.name}</span>}
      </button>
      <span className={`dt-task__due ${t.overdue || groups.overdue.includes(t) ? "text-red" : ""}`}>{t.dueAt ? `${relativeDay(t.dueAt)}${isAllDayDue(t) ? "" : ` ${formatTime(t.dueAt)}`}` : ""}</span>
    </li>
  );
  const sections = tier === "xl"
    ? [["Gecikmiş", groups.overdue], ["Bugün", groups.today], ["Yaklaşan", groups.upcoming]]
    : [[null, focus]];
  let budget = Math.max(2, lines - (big ? 2 : 0));
  return (
    <State q={q}>
      {big && (
        <form className="dt-inline" onSubmit={add}>
          <Icon name="plus" size={13} className="dt-inline__icon" />
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Görev ekle — “yarın 14:00 sahayı ara !”" aria-label="Görev ekle" />
        </form>
      )}
      {!focus.length && tier !== "xl" ? <div className="dt-empty"><Icon name="check" size={18} /><span>Bugün için iş yok{groups.upcoming.length ? ` · yaklaşan ${groups.upcoming.length} iş` : ""}.</span></div> : (
        <div className={tier === "xl" ? "dt-cols" : ""}>
          {sections.map(([label, list]) => {
            if (budget <= 0 && tier !== "xl") return null;
            const show = tier === "xl" ? list.slice(0, Math.max(2, lines - 3)) : list.slice(0, budget);
            budget -= show.length;
            return (
              <section key={label || "f"}>
                {label && <h4 className="dt-sub">{label} <b>{list.length}</b></h4>}
                <ul className="dt-tasks">{show.map(row)}</ul>
                {label && !list.length && <p className="dt-hint">Yok.</p>}
              </section>
            );
          })}
        </div>
      )}
    </State>
  );
}

export function UpcomingTile({ tier, go, lines }) {
  const q = useData("/api/tools/overview");
  const upcoming = useMemo(() => mergeUpcoming(q.data), [q.data]);
  if (tier === "xs") return <XsButton icon="calendar" value={q.data ? upcoming.length : "–"} label="7 gün" onClick={() => go("agenda")} />;
  if (tier === "s") {
    const n = upcoming[0];
    return <State q={q}><Big value={upcoming.length} label="plan 7 günde" sub={n ? `${relativeDay(n.occurrence_start)} · ${n.title}` : "Takvim boş"} onClick={() => go("agenda")} /></State>;
  }
  return (
    <State q={q} empty={q.data && !upcoming.length ? "Takvim boş: maç, toplantı ya da ödeme günlerini ekleyin." : null} emptyIcon="calendar">
      <ul className="upcoming">
        {upcoming.slice(0, Math.max(2, Math.floor(lines / 1.25))).map((item) => (
          <li key={item.occurrence_key} className={isProjectItem(item) ? "upcoming--project" : undefined}>
            <span className="upcoming__bar" style={{ background: colorOf(item) }} />
            <span className="upcoming__when">{relativeDay(item.occurrence_start)}<small>{item.all_day ? (item.multi_day ? "Plan" : "Tüm gün") : formatTime(item.occurrence_start)}</small></span>
            {isProjectItem(item) ? (
              <button type="button" className="upcoming__title link-btn" onClick={() => go("projects", projectRoute(item.link))} title="Projede aç">
                {item.title}
                <small><Icon name={projectKindOf(item).icon} size={11} /> {item.project?.name}{item.phase_name ? ` · ${item.phase_name}` : ""}</small>
              </button>
            ) : (
              <span className="upcoming__title">{item.title}{item.location && <small><Icon name="map" size={11} /> {item.location}</small>}</span>
            )}
          </li>
        ))}
      </ul>
    </State>
  );
}

export function NotesTile({ tier, go, lines }) {
  const q = useData("/api/tools/overview");
  const notes = q.data?.notes || [];
  if (tier === "xs") return <XsButton icon="note" value={q.data?.counts?.notes ?? "–"} label="not" onClick={() => go("notes")} />;
  if (tier === "s") {
    const n = notes[0];
    return <State q={q}><Big value={q.data?.counts?.notes ?? 0} label="not" sub={n ? (n.title || String(n.body || "").slice(0, 50)) : "Not yok · ⌃⌥N ile her yerden not alın"} onClick={() => go(n ? `notes:${n.id}` : "notes")} /></State>;
  }
  return (
    <State q={q} empty={q.data && !notes.length ? "Not yok. ⌃⌥N ile her yerden not alın." : null} emptyIcon="note">
      <div className="note-mini">
        {notes.slice(0, Math.max(2, Math.floor(lines / 1.6))).map((n) => (
          <button key={n.id} type="button" className="note-mini__item" style={n.color ? { "--note": n.color } : undefined} onClick={() => go(`notes:${n.id}`)}>
            {n.pinned && <Icon name="pin" size={12} />}
            <strong>{n.title || (n.body || n.checklist?.[0]?.text || "Not").slice(0, 50)}</strong>
            {n.body && n.title && tier !== "m" && <span>{n.body.slice(0, 80)}</span>}
          </button>
        ))}
      </div>
    </State>
  );
}

export function EquipmentTile({ tier, go, lines }) {
  const dash = useData("/api/tools/equipment/dashboard", null, { ttl: 60000 });
  const mine = useData("/api/tools/equipment/mine", null, { ttl: 60000 });
  const s = todaySummary(dash.data, mine.data?.items || []);
  if (dash.error && !dash.data) return <State q={dash} />;
  if (tier === "xs") return <XsButton icon="box" value={s ? s.overdue + s.myLate + s.maintenance : "–"} label="dikkat" tone={s && (s.overdue || s.myLate) ? "red" : ""} onClick={() => go("equipment")} />;
  if (!s) return <State q={dash} />;
  const stats = <Stats items={[{ label: "zimmetimde", value: s.myCount, tone: s.myLate ? "red" : "", onClick: () => go("equipment:zimmetim") }, { label: "geciken iade", value: s.overdue, tone: s.overdue ? "red" : "", onClick: () => go("equipment:zimmet") }, { label: "bakım zamanı", value: s.maintenance, tone: s.maintenance ? "red" : "", onClick: () => go("equipment:bakim") }]} />;
  if (tier === "s") return stats;
  return (
    <>
      {stats}
      {s.rows.length ? <List>{s.rows.slice(0, Math.max(1, lines - 2)).map((r) => <Row key={r.key} icon="box" title={r.title} sub={r.sub} right={r.when} tone={r.late ? "red" : ""} onClick={() => go("equipment", { id: r.id })} />)}</List>
        : <p className="dt-hint">{s.items} ekipman · {s.assigned} kişide / çıkışta · bugün dikkat isteyen yok.</p>}
    </>
  );
}

export function CountsTile({ tier, go }) {
  const q = useData("/api/tools/overview");
  const todos = useData("/api/todos", todoQuery);
  const c = q.data?.counts || {};
  if (tier === "xs") return <XsButton icon="grid" value={c.notes ?? "–"} label="not" onClick={() => go("notes")} />;
  return (
    <div className="counts">
      <button type="button" onClick={() => go("notes")}><strong>{c.notes ?? "–"}</strong><span>not</span></button>
      <button type="button" onClick={() => go("contacts")}><strong>{c.contacts ?? "–"}</strong><span>kişi</span></button>
      <button type="button" onClick={() => go("sheets")}><strong>{c.sheets ?? "–"}</strong><span>tablo</span></button>
      <button type="button" onClick={() => go("todos")}><strong>{todos.data?.items?.length ?? "–"}</strong><span>açık iş</span></button>
    </div>
  );
}

