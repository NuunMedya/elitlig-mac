// Ajanda: ay / hafta / gün / liste görünümü. Etkinlikler sürüklenerek başka
// güne taşınır; son tarihli görevler de takvimde görünür. Mac Takvim'ine .ics
// olarak aktarılabilir. Hatırlatmalar uygulama kapalıyken de bildirim olur.
// Projelerdeki tarihler (adımlar, son tarihler, proje başlangıç/bitiş, soru
// son tarihleri, görüşme takipleri) proje rengiyle, şerit ve simgeyle görünür;
// tıklayınca projeye gider. "Projeler" düğmesiyle açılıp kapanır.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Empty, ErrorNote, Field, Icon, Modal, OfflineNote, Segmented, ViewHeader, useConfirm, useResult } from "../components/ui";
import { del, patch, post, tempId, useCommand, useResource } from "../api";
import ExportButton from "../components/ExportButton";
import { agendaReport } from "../lib/export/reports";
import {
  CATEGORIES, RECURRENCES, REMINDERS, WEEKDAYS, categoryOf, colorOf, eventPayload, itemsOnDay,
  monthGrid, rangeFor, sameDay, shiftCursor, startOfDay, timeBox, titleFor, weekDays,
} from "../lib/agendaUtils";
import { formatTime, isoDay, localInput, formatDate } from "../lib/helpers";
import { toIcs } from "../lib/ics";
import { isProjectItem, projectKindOf, projectLegend, projectRoute, projectSubtitle, spanPart, visibleProjectItems } from "../lib/projectAgenda";
import "./agendaProjects.css";

const readJson = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
const writeJson = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* yoksay */ } };

const HOUR_PX = 44;

export default function Agenda({ arg, argSeq, go }) {
  const [view, setView] = useState(() => localStorage.getItem("agenda:view") || "month");
  const [cursor, setCursor] = useState(() => new Date());
  const [editing, setEditing] = useState(arg === "new" ? { draft: {} } : null);
  const [showTodos, setShowTodos] = useState(true);
  const [showProjects, setShowProjectsState] = useState(() => readJson("agenda:projects", true));
  const [hiddenProjects, setHiddenProjectsState] = useState(() => readJson("agenda:hiddenProjects", []));
  const setShowProjects = (v) => { setShowProjectsState(v); writeJson("agenda:projects", v); };
  const toggleProject = (id) => setHiddenProjectsState((cur) => { const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]; writeJson("agenda:hiddenProjects", next); return next; });
  const result = useResult();
  // Ajanda açıkken paletten "Yeni etkinlik" seçilince.
  useEffect(() => { if (arg === "new") setEditing({ draft: {} }); }, [arg, argSeq]);
  const range = useMemo(() => rangeFor(view, cursor), [view, cursor]);
  const data = useResource("/api/tools/events", { from: range.from.toISOString(), to: range.to.toISOString(), todos: showTodos ? undefined : "0" });

  const legend = useMemo(() => projectLegend(data.data?.projects || []), [data.data]);
  const items = useMemo(() => [
    ...(data.data?.items || []),
    ...(showTodos ? data.data?.todos || [] : []),
    ...visibleProjectItems(data.data?.projects || [], { show: showProjects, hidden: hiddenProjects }),
  ], [data.data, showTodos, showProjects, hiddenProjects]);
  const today = new Date();

  const changeView = (v) => { setView(v); try { localStorage.setItem("agenda:view", v); } catch { /* yoksay */ } };
  useCommand("new", () => setEditing({ draft: {} }));
  useCommand("export", () => exportIcs());

  const open = (item) => {
    if (item.source === "todo") { go(`todos:${item.id}`); return; }
    if (isProjectItem(item)) { go("projects", projectRoute(item.link)); return; }
    setEditing({ item });
  };

  // Sürükle-bırak: tekrarlanmayan etkinliği başka güne taşır (saat korunur).
  const moveTo = async (item, day) => {
    if (item.source !== "event" || item.recurrence !== "none") return;
    const start = new Date(item.start_at);
    const delta = startOfDay(day) - startOfDay(start);
    if (!delta) return;
    const body = { start_at: new Date(start.getTime() + delta).toISOString(), end_at: item.end_at ? new Date(new Date(item.end_at).getTime() + delta).toISOString() : null };
    data.setData((d) => ({ ...d, items: d.items.map((x) => (x.id === item.id ? { ...x, ...body, occurrence_start: body.start_at, occurrence_end: body.end_at } : x)) }));
    if (!result(await patch(`/api/tools/events/${item.id}`, body), "Etkinlik taşındı.")) data.reload({ quiet: true });
  };

  const exportIcs = async () => {
    const events = (data.data?.items || []).filter((x) => x.source === "event");
    if (!events.length) return;
    const res = await window.elitlig.files.save(`Elitlig-Ajanda-${isoDay(range.from)}.ics`, toIcs(events), [{ name: "Takvim", extensions: ["ics"] }]);
    if (res.ok) window.elitlig.files.reveal(res.path);
  };

  return (
    <div className="view view--agenda">
      <ViewHeader icon="calendar" title={titleFor(view, cursor)}>
        <div className="btn-group">
          <button type="button" className="icon-btn" onClick={() => setCursor(shiftCursor(view, cursor, -1))} aria-label="Önceki"><Icon name="chevronLeft" /></button>
          <button type="button" className="btn btn--sm" onClick={() => setCursor(new Date())}>Bugün</button>
          <button type="button" className="icon-btn" onClick={() => setCursor(shiftCursor(view, cursor, 1))} aria-label="Sonraki"><Icon name="chevronRight" /></button>
        </div>
        <Segmented value={view} onChange={changeView} size="sm" options={[{ value: "month", label: "Ay" }, { value: "week", label: "Hafta" }, { value: "day", label: "Gün" }, { value: "list", label: "Liste" }]} />
        <label className="toggle"><input type="checkbox" checked={showTodos} onChange={(e) => setShowTodos(e.target.checked)} /> Görevler</label>
        <button type="button" className={`ag-projtoggle ${showProjects ? "is-on" : ""}`} aria-pressed={showProjects} onClick={() => setShowProjects(!showProjects)} title="Projelerdeki tarihleri göster / gizle">
          <Icon name="layers" size={13} /> Projeler{(data.data?.projects || []).length > 0 && <b>{data.data.projects.length}</b>}
        </button>
        <ExportButton id="agenda" title="Ajanda" text="" extraItems={[{ label: "Takvim dosyası (.ics)", icon: "calendar", onClick: exportIcs }]}
          report={() => agendaReport(items, { title: `Ajanda — ${titleFor(view, cursor)}`, filters: [{ month: "Ay", week: "Hafta", day: "Gün", list: "Liste" }[view] + " görünümü", showTodos ? "görevler dahil" : "", showProjects ? "proje tarihleri dahil" : ""].filter(Boolean), groupBy: view === "day" ? "" : "day" })} />
        <button type="button" className="icon-btn" title="Mac Takvim'ine aktar (.ics)" onClick={exportIcs}><Icon name="download" /></button>
        <button type="button" className="btn btn--primary" onClick={() => setEditing({ draft: {} })}><Icon name="plus" /> Etkinlik</button>
      </ViewHeader>
      <OfflineNote offline={data.offline} savedAt={data.savedAt} />
      <ErrorNote error={data.error && !data.data ? data.error : null} onRetry={data.reload} />
      {showProjects && legend.length > 0 && (
        <div className="ag-legend" role="group" aria-label="Takvimde gösterilen projeler">
          {legend.map((p) => {
            const off = hiddenProjects.includes(p.id);
            return (
              <button key={p.id} type="button" className={`ag-legend__item ${off ? "is-off" : ""}`} style={{ "--c": p.color }} aria-pressed={!off} onClick={() => toggleProject(p.id)} title={off ? "Göster" : "Gizle"}>
                <span className="ag-legend__dot" />{p.name}<small>{p.count}</small>
              </button>
            );
          })}
        </div>
      )}

      {view === "month" && <MonthView cursor={cursor} items={items} today={today} onOpen={open} onCreate={(day) => setEditing({ draft: { day } })} onMove={moveTo} onDay={(day) => { setCursor(day); changeView("day"); }} />}
      {(view === "week" || view === "day") && <TimeGrid days={view === "week" ? weekDays(cursor) : [startOfDay(cursor)]} items={items} today={today} onOpen={open} onCreate={(day, hour) => setEditing({ draft: { day, hour } })} onMove={moveTo} />}
      {view === "list" && <ListView items={items} onOpen={open} />}

      {editing && (
        <EventEditor
          item={editing.item}
          draft={editing.draft}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); data.reload({ quiet: true }); }}
        />
      )}
    </div>
  );
}

function ProjectChip({ item, onOpen, day }) {
  const kind = projectKindOf(item);
  const part = spanPart(item, day);
  return (
    <button type="button" className={`ev-chip ev-chip--project ${item.done ? "is-done" : ""} ${item.overdue ? "is-late" : ""} ${part ? `is-span-${part}` : ""}`} style={{ "--c": item.color || item.project?.color }}
      onClick={(e) => { e.stopPropagation(); onOpen(item); }} title={`${kind.label}: ${item.title} · ${item.project?.name || ""}${item.done ? " (tamamlandı)" : ""}`}
      aria-label={`${kind.label}: ${item.title}, ${item.project?.name || "proje"}${item.done ? ", tamamlandı" : ""}`}>
      <Icon name={kind.icon} size={11} />
      {!item.all_day && <span className="ev-chip__time">{formatTime(item.occurrence_start)}</span>}
      <span className="ev-chip__title">{part === "middle" || part === "end" ? `↳ ${item.title}` : item.title}</span>
    </button>
  );
}

function Chip({ item, onOpen, draggable = true, day = null }) {
  if (isProjectItem(item)) return <ProjectChip item={item} onOpen={onOpen} day={day} />;
  return (
    <button type="button" className={`ev-chip ${item.source === "todo" ? "ev-chip--todo" : ""}`} style={{ "--c": colorOf(item) }}
      draggable={draggable && item.source === "event" && item.recurrence === "none"}
      onDragStart={(e) => e.dataTransfer.setData("text/elitlig-event", String(item.id))}
      onClick={(e) => { e.stopPropagation(); onOpen(item); }} title={item.title}>
      {!item.all_day && <span className="ev-chip__time">{formatTime(item.occurrence_start)}</span>}
      {item.source === "todo" && <Icon name="checkSquare" size={11} />}
      <span className="ev-chip__title">{item.title}</span>
    </button>
  );
}

function useDropTarget(items, onMove) {
  const [over, setOver] = useState(null);
  const bind = (day) => ({
    onDragOver: (e) => { if (e.dataTransfer.types.includes("text/elitlig-event")) { e.preventDefault(); setOver(isoDay(day)); } },
    onDragLeave: () => setOver(null),
    onDrop: (e) => {
      e.preventDefault();
      setOver(null);
      const id = e.dataTransfer.getData("text/elitlig-event");
      const item = items.find((x) => String(x.id) === id && x.source === "event");
      if (item) onMove(item, day);
    },
  });
  return { over, bind };
}

function MonthView({ cursor, items, today, onOpen, onCreate, onMove, onDay }) {
  const days = monthGrid(cursor.getFullYear(), cursor.getMonth());
  const { over, bind } = useDropTarget(items, onMove);
  return (
    <div className="month">
      {WEEKDAYS.map((d) => <div key={d} className="month__wd">{d}</div>)}
      {days.map((day) => {
        const list = itemsOnDay(items, day);
        const outside = day.getMonth() !== cursor.getMonth();
        return (
          <div key={day.toISOString()} className={`month__day ${outside ? "is-outside" : ""} ${sameDay(day, today) ? "is-today" : ""} ${over === isoDay(day) ? "is-over" : ""}`} onDoubleClick={() => onCreate(day)} {...bind(day)}>
            <button type="button" className="month__num" onClick={() => onDay(day)}>{day.getDate()}</button>
            <div className="month__items">
              {list.slice(0, 4).map((item) => <Chip key={item.occurrence_key} item={item} onOpen={onOpen} day={day} />)}
              {list.length > 4 && <button type="button" className="month__more" onClick={() => onDay(day)}>+{list.length - 4} daha</button>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TimeGrid({ days, items, today, onOpen, onCreate, onMove }) {
  const scrollRef = useRef(null);
  const { over, bind } = useDropTarget(items, onMove);
  const nowTop = (today.getHours() * 60 + today.getMinutes()) * (HOUR_PX / 60);
  // Açılışta 07:00'ye, daha erken etkinlik varsa onun saatine kaydırılır.
  React.useEffect(() => {
    const hours = days.flatMap((d) => itemsOnDay(items, d).filter((i) => !i.all_day && sameDay(new Date(i.occurrence_start), d)).map((i) => new Date(i.occurrence_start).getHours()));
    if (scrollRef.current) scrollRef.current.scrollTop = Math.max(0, Math.min(7, ...hours) * HOUR_PX - 8);
  }, [days.length, items.length]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="tgrid" style={{ "--cols": days.length }}>
      <div className="tgrid__head">
        <span />
        {days.map((d) => (
          <div key={d.toISOString()} className={`tgrid__dayhead ${sameDay(d, today) ? "is-today" : ""}`}>
            <span>{d.toLocaleDateString("tr-TR", { weekday: "short" })}</span><strong>{d.getDate()}</strong>
            <div className="tgrid__allday">{itemsOnDay(items, d).filter((i) => i.all_day).map((item) => <Chip key={item.occurrence_key} item={item} onOpen={onOpen} day={d} />)}</div>
          </div>
        ))}
      </div>
      <div className="tgrid__body" ref={scrollRef}>
        <div className="tgrid__hours">{Array.from({ length: 24 }, (_, h) => <span key={h} style={{ height: HOUR_PX }}>{String(h).padStart(2, "0")}:00</span>)}</div>
        {days.map((day) => (
          <div key={day.toISOString()} className={`tgrid__col ${over === isoDay(day) ? "is-over" : ""}`} style={{ height: 24 * HOUR_PX }} {...bind(day)}
            onDoubleClick={(e) => { const y = e.clientY - e.currentTarget.getBoundingClientRect().top; onCreate(day, Math.floor(y / HOUR_PX)); }}>
            {Array.from({ length: 24 }, (_, h) => <div key={h} className="tgrid__slot" style={{ height: HOUR_PX }} />)}
            {sameDay(day, today) && <div className="tgrid__now" style={{ top: nowTop }} />}
            {itemsOnDay(items, day).filter((i) => !i.all_day).map((item) => {
              const box = timeBox(item, day);
              return (
                <button type="button" key={item.occurrence_key} className={`tgrid__ev ${isProjectItem(item) ? "tgrid__ev--project" : ""}`} style={{ top: box.top * (HOUR_PX / 60), height: Math.max(20, box.height * (HOUR_PX / 60) - 2), "--c": colorOf(item) }}
                  onClick={(e) => { e.stopPropagation(); onOpen(item); }} draggable={item.source === "event" && item.recurrence === "none"} onDragStart={(e) => e.dataTransfer.setData("text/elitlig-event", String(item.id))}>
                  <strong>{item.title}</strong>
                  <span>{formatTime(item.occurrence_start)}{item.occurrence_end ? `–${formatTime(item.occurrence_end)}` : ""}{item.location ? ` · ${item.location}` : ""}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function ListView({ items, onOpen }) {
  const byDay = useMemo(() => {
    const map = new Map();
    [...items].sort((a, b) => a.occurrence_start.localeCompare(b.occurrence_start)).forEach((item) => {
      const key = isoDay(item.occurrence_start);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(item);
    });
    return [...map.entries()];
  }, [items]);
  if (!byDay.length) return <Empty icon="calendar" title="Önümüzdeki 60 gün boş" text="⌘N ile etkinlik ekleyin." />;
  return (
    <div className="agenda-list">
      {byDay.map(([day, list]) => (
        <section key={day}>
          <h3>{formatDate(day, { weekday: "long", day: "numeric", month: "long" })}</h3>
          {list.map((item) => (
            <button type="button" key={item.occurrence_key} className={`agenda-row ${isProjectItem(item) ? "agenda-row--project" : ""} ${item.done ? "is-done" : ""}`} onClick={() => onOpen(item)}>
              <span className="agenda-row__bar" style={{ background: colorOf(item) }} />
              <span className="agenda-row__time">{item.all_day ? (item.multi_day ? "Plan" : "Tüm gün") : formatTime(item.occurrence_start)}</span>
              <span className="agenda-row__title">
                {isProjectItem(item) && <Icon name={projectKindOf(item).icon} size={12} className="agenda-row__picon" />}
                {item.title}
                {item.location && <small><Icon name="map" size={11} /> {item.location}</small>}
                {isProjectItem(item) && <small>{projectSubtitle(item)}{item.multi_day ? ` · ${formatDate(item.end_date, { day: "numeric", month: "short" })} tarihine kadar` : ""}</small>}
              </span>
              {item.overdue && !item.done && <span className="pill pill--red">Gecikti</span>}
              <span className="pill">{item.source === "todo" ? "Görev" : isProjectItem(item) ? "Proje" : categoryOf(item.category).label}</span>
              {item.recurrence && item.recurrence !== "none" && <Icon name="rotate" size={13} className="muted" />}
              {item.remind_minutes != null && <Icon name="clock" size={13} className="muted" />}
            </button>
          ))}
        </section>
      ))}
    </div>
  );
}

function initialForm(item, draft = {}) {
  if (item) {
    return {
      title: item.title || "",
      description: item.description || "",
      location: item.location || "",
      category: item.category || "general",
      color: item.color || "",
      all_day: Boolean(item.all_day),
      start_at: localInput(item.start_at),
      end_at: localInput(item.end_at),
      start_date: isoDay(item.start_at),
      end_date: item.end_at ? isoDay(item.end_at) : isoDay(item.start_at),
      recurrence: item.recurrence || "none",
      repeat_until: item.repeat_until || "",
      remind_minutes: item.remind_minutes == null ? "" : String(item.remind_minutes),
    };
  }
  const base = draft.day ? new Date(draft.day) : new Date();
  const start = new Date(base.getFullYear(), base.getMonth(), base.getDate(), draft.hour ?? (draft.day ? 19 : new Date().getHours() + 1), 0);
  return {
    title: "", description: "", location: "", category: "general", color: "", all_day: false,
    start_at: localInput(start), end_at: localInput(new Date(start.getTime() + 3600000)),
    start_date: isoDay(start), end_date: isoDay(start), recurrence: "none", repeat_until: "", remind_minutes: "30",
  };
}

function EventEditor({ item, draft, onClose, onSaved }) {
  const result = useResult();
  const confirm = useConfirm();
  const [form, setForm] = useState(() => initialForm(item, draft));
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });

  const save = async (e) => {
    e?.preventDefault();
    if (!form.title.trim()) return;
    setBusy(true);
    const body = eventPayload(form);
    const res = item ? await patch(`/api/tools/events/${item.id}`, body) : await post("/api/tools/events", body, { tempId: tempId() });
    setBusy(false);
    if (result(res, item ? "Etkinlik güncellendi." : "Etkinlik eklendi.")) onSaved();
  };
  const remove = async () => {
    const recurring = item.recurrence && item.recurrence !== "none";
    if (!(await confirm({ title: "Etkinliği sil", message: recurring ? "Bu tekrarlanan etkinliğin tüm tekrarları silinir." : `“${item.title}” silinsin mi?`, confirmLabel: "Sil", danger: true }))) return;
    if (result(await del(`/api/tools/events/${item.id}`), "Etkinlik silindi.")) onSaved();
  };

  return (
    <Modal title={item ? "Etkinliği düzenle" : "Yeni etkinlik"} onClose={onClose} width={600} footer={<>
      {item && <button type="button" className="btn btn--danger-ghost" onClick={remove}><Icon name="trash" /> Sil</button>}
      <span className="spacer" />
      <button type="button" className="btn" onClick={onClose}>Vazgeç</button>
      <button type="submit" form="event-form" className="btn btn--primary" disabled={busy || !form.title.trim()}>{busy ? "Kaydediliyor…" : "Kaydet"}</button>
    </>}>
      <form id="event-form" className="form-grid" onSubmit={save}>
        <Field label="Başlık" className="span2"><input autoFocus value={form.title} onChange={set("title")} placeholder="Maç, toplantı, ödeme…" /></Field>
        <Field label="Tür">
          <select value={form.category} onChange={set("category")}>{CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select>
        </Field>
        <Field label="Yer"><input value={form.location} onChange={set("location")} placeholder="Saha, adres…" /></Field>
        <label className="toggle span2"><input type="checkbox" checked={form.all_day} onChange={set("all_day")} /> Tüm gün</label>
        {form.all_day ? (<>
          <Field label="Başlangıç günü"><input type="date" value={form.start_date} onChange={set("start_date")} /></Field>
          <Field label="Bitiş günü"><input type="date" value={form.end_date} min={form.start_date} onChange={set("end_date")} /></Field>
        </>) : (<>
          <Field label="Başlangıç"><input type="datetime-local" value={form.start_at} onChange={(e) => {
            const next = e.target.value;
            const dur = form.end_at && form.start_at ? new Date(form.end_at) - new Date(form.start_at) : 3600000;
            setForm({ ...form, start_at: next, end_at: next ? localInput(new Date(new Date(next).getTime() + Math.max(0, dur))) : form.end_at });
          }} /></Field>
          <Field label="Bitiş"><input type="datetime-local" value={form.end_at} min={form.start_at} onChange={set("end_at")} /></Field>
        </>)}
        <Field label="Tekrar"><select value={form.recurrence} onChange={set("recurrence")}>{RECURRENCES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}</select></Field>
        {form.recurrence !== "none" ? <Field label="Tekrar bitişi"><input type="date" value={form.repeat_until} onChange={set("repeat_until")} /></Field> : <span />}
        <Field label="Hatırlatma (masaüstü bildirimi)"><select value={form.remind_minutes} onChange={set("remind_minutes")}>{REMINDERS.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}</select></Field>
        <Field label="Renk">
          <div className="color-dots color-dots--lg">
            <button type="button" className={!form.color ? "is-on" : ""} style={{ background: categoryOf(form.category).color }} onClick={() => setForm({ ...form, color: "" })} title="Türün rengi" aria-label="Türün rengi" aria-pressed={!form.color} />
            {["#6366f1", "#7c3aed", "#0284c7", "#059669", "#dc2626", "#d97706", "#db2777", "#475569"].map((c) => <button key={c} type="button" className={form.color === c ? "is-on" : ""} style={{ background: c }} onClick={() => setForm({ ...form, color: c })} aria-label={`Renk ${c}`} aria-pressed={form.color === c} />)}
          </div>
        </Field>
        <Field label="Açıklama" className="span2"><textarea rows={3} value={form.description} onChange={set("description")} /></Field>
        {item?.recurrence && item.recurrence !== "none" && <p className="muted small span2">Değişiklik bu etkinliğin tüm tekrarlarına uygulanır.</p>}
      </form>
    </Modal>
  );
}

