// Yapılacaklar — web sürümündeki tüm özellikler:
// görünümler (bugün, yaklaşan, tümü, bana atananlar, atadıklarım, maç
// görevleri, ekip takibi, etiketler, tamamlanan), hızlı ekleme, gruplu liste,
// sürükle-bırak pano, kart ayrıntısı (maç masası, haftanın enleri, maç anı),
// görev atama, maç görevlendirme, arşivleme ve geri alma.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Empty, ErrorNote, Icon, OfflineNote, Segmented, Spinner, useConfirm, useResult, useToast } from "../../components/ui";
import { del, patch, post, request, tempId, useCommand, useResource } from "../../api";
import { formatTime, relativeDay } from "../../lib/helpers";
import Composer from "./Composer";
import Drawer from "./Drawer";
import { MatchAssign, TeamOverview } from "./Team";
import { KINDS, KIND_ICON, LABEL_COLORS, STATUSES, dateBucket, dueOf, endOfDay, groupRows, isDelegated, matchesSearch, orderAfterDrop, sortColumn, viewsFor } from "./todoUtils";

const store = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
const save = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* yoksay */ } };

export default function Todos({ arg, go }) {
  const result = useResult();
  const toast = useToast();
  const confirm = useConfirm();
  const [layout, setLayout] = useState(() => store("todo:layout", "list"));
  const [viewKey, setViewKey] = useState(() => store("todo:view", "today"));
  const [groupBy, setGroupBy] = useState(() => store("todo:groupBy", "date"));
  const [collapsed, setCollapsed] = useState(() => store("todo:collapsed", { done: true }));
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("");
  const [selected, setSelected] = useState(arg && arg !== "new" ? Number(arg) : null);
  const [composer, setComposer] = useState(arg === "new" ? {} : null);
  const [assignOpen, setAssignOpen] = useState(false);
  const list = useResource("/api/todos", { view: "board" });
  const catalog = useResource("/api/todos/catalog");
  const cat = catalog.data || {};
  const items = useMemo(() => list.data?.items || [], [list.data]);
  const quickRef = useRef(null);

  useEffect(() => save("todo:layout", layout), [layout]);
  useEffect(() => save("todo:view", viewKey), [viewKey]);
  useEffect(() => save("todo:groupBy", groupBy), [groupBy]);
  useEffect(() => save("todo:collapsed", collapsed), [collapsed]);
  useCommand("new", () => setComposer({}));
  useCommand("find", () => document.getElementById("todo-search")?.focus());
  useEffect(() => {
    const onKey = (e) => {
      if (e.key.toLowerCase() !== "n" || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target.closest?.("input, textarea, select, [contenteditable]") || document.querySelector(".modal")) return;
      e.preventDefault();
      quickRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const views = useMemo(() => viewsFor(items, { canOversee: cat.canOversee, canAssignCrew: cat.canAssignCrew }), [items, cat.canOversee, cat.canAssignCrew]);
  const view = views.find((v) => v.key === viewKey) || views.find((v) => v.key === "all");
  useEffect(() => { if (list.data && !views.some((v) => v.key === viewKey)) setViewKey("all"); }, [views, viewKey, list.data]);
  const shown = useMemo(() => items.filter((t) => view.match(t) && matchesSearch(t, q) && (!kind || t.kind === kind)), [items, view, q, kind]);
  const allLabels = useMemo(() => { const m = new Map(); items.forEach((t) => (t.labels || []).forEach((l) => m.set(l.text, l))); return [...m.values()]; }, [items]);
  const selectedTask = items.find((t) => t.id === selected);
  const viewCount = (v) => items.filter((t) => v.match(t) && t.status !== "done").length;
  const todayCount = items.filter((t) => !isDelegated(t) && t.status !== "done" && ["overdue", "today"].includes(dateBucket(t))).length;
  const lateCount = items.filter((t) => !isDelegated(t) && t.status !== "done" && dateBucket(t) === "overdue").length;
  const openCount = items.filter((t) => !isDelegated(t) && t.status !== "done").length;

  const replace = useCallback((item) => {
    if (!item) { list.reload({ quiet: true }); return; }
    list.setData((d) => (d ? { ...d, items: d.items.map((t) => (t.id === item.id ? item : t)) } : d));
  }, [list]);
  const notifyChanged = () => window.dispatchEvent(new Event("elitlig:todos-changed"));

  const update = useCallback(async (task, changes, { undo = true } = {}) => {
    const before = task;
    list.setData((d) => ({ ...d, items: d.items.map((t) => (t.id === task.id ? { ...t, ...changes, ...(changes.due_at !== undefined ? { dueAt: changes.due_at } : {}) } : t)) }));
    const res = await patch(`/api/todos/${task.id}`, changes);
    if (!result(res)) { list.reload({ quiet: true }); return null; }
    if (res.data?.item) replace(res.data.item);
    notifyChanged();
    if (undo && changes.status === "done" && before.status !== "done") {
      toast(`“${task.title}” tamamlandı.`, { tone: "success", timeout: 6000, action: { label: "Geri al", run: () => update(res.data?.item || task, { status: before.status }, { undo: false }) } });
    }
    if (changes.archived) list.setData((d) => ({ ...d, items: d.items.filter((t) => t.id !== task.id) }));
    return res.data?.item;
  }, [list, replace, result, toast]);

  const remove = async (task) => {
    list.setData((d) => ({ ...d, items: d.items.filter((t) => t.id !== task.id) }));
    setSelected(null);
    if (!result(await del(`/api/todos/${task.id}`), "Kart silindi.")) list.reload({ quiet: true });
    notifyChanged();
  };

  const archiveDone = async () => {
    if (!(await confirm({ title: "Tamamlananları arşivle", message: "Size ait tamamlanan kartlar panodan kaldırılır (silinmez).", confirmLabel: "Arşivle" }))) return;
    const res = await post("/api/todos/archive-done", {}, { queue: false });
    if (result(res, res.data?.message)) list.setData((d) => ({ ...d, items: d.items.filter((t) => !(t.status === "done" && t.permissions?.isOwner)) }));
  };

  const created = (newItems) => {
    setComposer(null);
    list.reload({ quiet: true });
    notifyChanged();
    const first = newItems?.[0];
    if (first && !view.match(first)) toast("Kart eklendi; bu görünümde gösterilmiyor.", { tone: "info" });
  };

  return (
    <div className="view view--todos">
      <aside className="todo-nav">
        <div className="todo-nav__head">
          <span className="view-head__badge" style={{ width: 38, height: 38 }}><Icon name="checkSquare" size={18} strokeWidth={2} /></span>
          <div><h1>Yapılacaklar</h1><small className="muted">{new Date().toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long" })}</small></div>
        </div>
        {[...new Set(views.map((v) => v.group))].map((group) => (
          <section key={group}>
            <h5>{group}</h5>
            {views.filter((v) => v.group === group).map((v) => (
              <button key={v.key} type="button" className={`todo-nav__item ${view.key === v.key ? "is-active" : ""}`} onClick={() => { setViewKey(v.key); setSelected(null); }}>
                {v.color ? <span className="todo-nav__dot" style={{ background: LABEL_COLORS[v.color] }} /> : <Icon name={v.icon} size={15} />}
                <span>{v.label}</span>
                {v.key !== "team" && viewCount(v) > 0 && <em className={v.key === "today" && lateCount ? "is-alert" : ""}>{viewCount(v)}</em>}
              </button>
            ))}
          </section>
        ))}
      </aside>

      <div className="todo-main">
        <header className="todo-head">
          <div>
            <h2>{view.label}</h2>
            <p className="muted">Bugün {todayCount} iş{lateCount ? <> · <strong className="text-red">{lateCount} geciken</strong></> : ""} · toplam {openCount} açık iş</p>
          </div>
          <div className="row-gap">
            {cat.canAssignCrew && <button type="button" className="btn" onClick={() => setAssignOpen(true)}><Icon name="ball" /> Maç görevlendir</button>}
            {cat.canAssign && <button type="button" className="btn btn--soft" onClick={() => setComposer({ audience: "team" })}><Icon name="team" /> Görev ata</button>}
            <button type="button" className="btn btn--primary" onClick={() => setComposer({})}><Icon name="plus" /> Yeni iş</button>
          </div>
        </header>

        {view.key === "team" ? <TeamOverview onOpen={setSelected} /> : (<>
          {!["assigned_to_me", "system", "done"].includes(view.key) && (view.key === "assigned_by_me"
            ? <button type="button" className="quickbar quickbar--cta" onClick={() => setComposer({ audience: "team" })}><Icon name="team" /> Ekibe yeni görev ver</button>
            : <QuickAdd inputRef={quickRef} defaultWhen={view.key === "today" ? "today" : view.key === "upcoming" ? "tomorrow" : "none"} label={view.key.startsWith("label:") ? allLabels.find((l) => `label:${l.text}` === view.key) : null}
              onDetailed={(title) => setComposer({ title })}
              onAdd={async (body) => { const res = await post("/api/todos", body, { tempId: tempId() }); if (result(res, "Eklendi.")) created(res.data?.items); }} />)}

          <div className="filters">
            <div className="search-box"><Icon name="search" size={14} /><input id="todo-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Kartlarda ara" /></div>
            <select className="select-sm" value={kind} onChange={(e) => setKind(e.target.value)}>{KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}</select>
            {layout === "list" && (["all", "assigned_to_me", "system"].includes(view.key) || view.key.startsWith("label:")) && <select className="select-sm" value={groupBy} onChange={(e) => setGroupBy(e.target.value)}><option value="date">Tarihe göre</option><option value="status">Duruma göre</option></select>}
            {(q || kind) && <button type="button" className="link-btn small" onClick={() => { setQ(""); setKind(""); }}>Süzgeçleri temizle · {shown.length} kart</button>}
            <span className="spacer" />
            {view.key !== "done" && <Segmented size="sm" value={layout} onChange={setLayout} options={[{ value: "list", label: "Liste", icon: "list" }, { value: "board", label: "Pano", icon: "board" }]} />}
          </div>
          <OfflineNote offline={list.offline} savedAt={list.savedAt} />
          <ErrorNote error={list.error && !list.data ? list.error : null} onRetry={list.reload} />

          {list.loading && !list.data ? <Spinner /> : layout === "board" && view.key !== "done" ? (
            <Board items={shown} selected={selected} onSelect={setSelected} onArchive={archiveDone}
              onAdd={async (status, title) => { const res = await post("/api/todos", { kind: "task", title, status }, { tempId: tempId() }); if (result(res)) created(res.data?.items); }}
              onMove={async (task, status, ids) => {
                list.setData((d) => ({ ...d, items: d.items.map((t) => (t.id === task.id ? { ...t, status } : t)).map((t) => (ids.includes(t.id) && t.permissions?.isOwner ? { ...t, position: ids.indexOf(t.id) } : t)) }));
                const res = await request({ method: "POST", path: "/api/todos/reorder", body: { status, ids, moved_id: task.id }, queue: false });
                if (!result(res)) list.reload({ quiet: true });
                else { (res.data?.items || []).forEach(replace); notifyChanged(); }
              }} />
          ) : (
            <List groups={groupRows(shown, { view: view.key, groupBy })} collapsed={collapsed} setCollapsed={setCollapsed} selected={selected} onSelect={setSelected} onUpdate={update} onArchive={archiveDone}
              empty={<Empty icon="checkSquare" title={view.key === "today" ? "Bugün için iş yok" : "Bu görünümde kart yok"} text="N tuşuyla hızlıca iş ekleyin; ⌃⌥N ile her yerden." />} />
          )}
        </>)}
      </div>

      {selectedTask && <Drawer key={selectedTask.id} task={selectedTask} catalog={cat} allLabels={allLabels} go={go} onClose={() => setSelected(null)} onUpdate={update} onDelete={remove} onEdit={(t) => setComposer({ task: t })} onReplace={replace} />}
      {composer && <Composer catalog={cat} task={composer.task} initial={composer} onClose={() => setComposer(null)} onSaved={(r) => (composer.task ? (setComposer(null), replace(r)) : created(r))} />}
      {assignOpen && <MatchAssign onClose={() => setAssignOpen(false)} onSaved={() => list.reload({ quiet: true })} />}
    </div>
  );
}

function QuickAdd({ inputRef, defaultWhen, label, onAdd, onDetailed }) {
  const [title, setTitle] = useState("");
  const [when, setWhen] = useState(defaultWhen);
  const [date, setDate] = useState("");
  const [high, setHigh] = useState(false);
  useEffect(() => setWhen(defaultWhen), [defaultWhen]);
  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    const due = when === "today" ? endOfDay(0) : when === "tomorrow" ? endOfDay(1) : when === "date" && date ? new Date(`${date}T23:59:00`).toISOString() : null;
    await onAdd({ kind: "task", title: title.trim().slice(0, 200), due_at: due, priority: high ? "high" : "normal", ...(label ? { labels: [label] } : {}) });
    setTitle("");
    setHigh(false);
  };
  return (
    <form className="quickbar" onSubmit={submit}>
      <Icon name="plus" size={18} />
      <input ref={inputRef} value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") { setTitle(""); e.currentTarget.blur(); } }} placeholder={`Yeni iş ekle${label ? ` (#${label.text})` : ""}…  (N)`} />
      <div className="quickbar__opts">
        {[["none", "Tarihsiz"], ["today", "Bugün"], ["tomorrow", "Yarın"], ["date", "Tarih"]].map(([k, l]) => <button key={k} type="button" className={when === k ? "is-on" : ""} onClick={() => setWhen(k)}>{l}</button>)}
        {when === "date" && <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />}
        <button type="button" className={`quickbar__flag ${high ? "is-on" : ""}`} title="Önemli" onClick={() => setHigh((v) => !v)}><Icon name="flag" size={14} /></button>
        <button type="button" className="link-btn small" onClick={() => onDetailed(title)}>Ayrıntılı</button>
        <button type="submit" className="btn btn--primary btn--sm" disabled={!title.trim()}>Ekle</button>
      </div>
    </form>
  );
}

function Row({ t, active, onSelect, onUpdate }) {
  const can = t.permissions || {};
  const due = dueOf(t);
  const progress = t.workflow ? { done: t.workflow.done, total: t.workflow.total } : t.checklist?.length ? { done: t.checklist.filter((c) => c.done).length, total: t.checklist.length } : null;
  return (
    <li className={`trow ${active ? "is-active" : ""} ${t.status === "done" ? "is-done" : ""} ${t.priority === "high" ? "is-high" : ""}`}>
      {can.canChangeStatus ? (
        <button type="button" className={`check ${t.status === "done" ? "is-checked" : ""}`} onClick={() => onUpdate(t, { status: t.status === "done" ? "open" : "done" })} aria-label={t.status === "done" ? "Geri aç" : "Tamamla"}>{t.status === "done" && <Icon name="check" size={12} strokeWidth={3} />}</button>
      ) : <span className="check check--ro" title={`${t.owner?.name} yürütüyor`}><Icon name="eye" size={11} /></span>}
      <button type="button" className="trow__main" onClick={() => onSelect(t.id)}>
        <span className="trow__title">
          {t.pinned && <Icon name="pin" size={12} />}
          {t.kind !== "task" && <Icon name={KIND_ICON[t.kind] || "checkSquare"} size={13} className="text-tool" />}
          {t.title}
        </span>
        <span className="trow__meta">
          {t.status === "in_progress" && <span className="pill pill--blue">Sürüyor</span>}
          {t.kind !== "task" && <span className="pill">{t.dutyLabel || t.kindLabel}</span>}
          {t.match && <span><Icon name="ball" size={11} /> {t.match.label}{t.match.field ? ` · ${t.match.field}` : ""}</span>}
          {t.sheet && <span><Icon name="grid" size={11} /> {t.sheet.title}</span>}
          {t.player && <span><Icon name="user" size={11} /> {t.player.name}</span>}
          {t.team && <span><Icon name="shirt" size={11} /> {t.team.name}</span>}
          {progress && <span><Icon name="checkSquare" size={11} /> {progress.done}/{progress.total}</span>}
          {t.body && <Icon name="note" size={11} />}
          {(t.labels || []).map((l) => <span key={l.text} className="label-dot" style={{ background: LABEL_COLORS[l.color] }}>{l.text}</span>)}
          {t.source === "assigned_by_me" && <span>→ {t.owner?.name}</span>}
          {t.assignedBy && t.source === "assigned_to_me" && <span>{t.assignedBy.name} atadı</span>}
        </span>
      </button>
      {can.canChangeStatus && t.status !== "done" && <button type="button" className="btn btn--xs btn--ghost trow__start" onClick={() => onUpdate(t, { status: t.status === "in_progress" ? "open" : "in_progress" })}>{t.status === "in_progress" ? "Duraklat" : "Başla"}</button>}
      {due && <span className={`trow__due ${t.overdue ? "text-red" : ""}`}>{t.overdue ? (t.kind === "match_duty" ? "Maç saati geçti" : "Gecikti") : relativeDay(due)}<small>{formatTime(due)}</small></span>}
    </li>
  );
}

function List({ groups, collapsed, setCollapsed, selected, onSelect, onUpdate, onArchive, empty }) {
  if (!groups.length) return empty;
  return (
    <div className="tgroups">
      {groups.map((g) => {
        const isCollapsed = collapsed[g.key] ?? Boolean(g.collapsed);
        return (
          <section key={g.key} className="tgroup">
            <header className={`tgroup__head ${g.tone === "red" ? "text-red" : ""}`}>
              <button type="button" onClick={() => setCollapsed({ ...collapsed, [g.key]: !isCollapsed })}><Icon name={isCollapsed ? "chevronRight" : "chevronDown"} size={14} /> {g.label} <span>{g.items.length}</span></button>
              {g.progress && <span className="tgroup__progress"><span className="progress"><span style={{ width: `${(g.progress.done / g.progress.total) * 100}%` }} /></span><small>{g.progress.done}/{g.progress.total} tamamlandı</small></span>}
              {g.key.startsWith("done") && <button type="button" className="link-btn small" onClick={onArchive}>Arşivle</button>}
            </header>
            {!isCollapsed && <ul className="tlist">{g.items.map((t) => <Row key={t.id} t={t} active={selected === t.id} onSelect={onSelect} onUpdate={onUpdate} />)}</ul>}
          </section>
        );
      })}
    </div>
  );
}

function Board({ items, selected, onSelect, onMove, onAdd, onArchive }) {
  const [drag, setDrag] = useState(null);
  const [over, setOver] = useState(null);
  const [adding, setAdding] = useState(null);
  const [text, setText] = useState("");
  const columns = useMemo(() => Object.fromEntries(STATUSES.map((s) => [s.key, sortColumn(items.filter((t) => t.status === s.key), s.key)])), [items]);
  const drop = (status, beforeId) => {
    const task = items.find((t) => t.id === drag);
    setDrag(null);
    setOver(null);
    if (!task || !task.permissions?.canChangeStatus) return;
    onMove(task, status, orderAfterDrop(columns[status].map((t) => t.id), task.id, beforeId));
  };
  const shift = (task, dir) => {
    const idx = STATUSES.findIndex((s) => s.key === task.status);
    const next = STATUSES[idx + dir];
    if (next) onMove(task, next.key, [task.id, ...columns[next.key].map((t) => t.id)]);
  };
  return (
    <div className="board">
      {STATUSES.map((s, si) => (
        <section key={s.key} className={`board__col board__col--${s.key} ${over === s.key ? "is-over" : ""}`} onDragOver={(e) => { e.preventDefault(); setOver(s.key); }} onDragLeave={(e) => { if (e.currentTarget === e.target) setOver(null); }} onDrop={(e) => { e.preventDefault(); drop(s.key, null); }}>
          <header><h3>{s.label} <span>{columns[s.key].length}</span></h3>{s.key === "done" && <><small className="muted">Son 30 gün</small><button type="button" className="link-btn small" onClick={onArchive}>Arşivle</button></>}</header>
          <div className="board__cards">
            {columns[s.key].map((t) => {
              const can = t.permissions?.canChangeStatus;
              const due = dueOf(t);
              return (
                <article key={t.id} draggable={can} className={`board-card ${selected === t.id ? "is-active" : ""} ${drag === t.id ? "is-dragging" : ""} ${t.priority === "high" ? "is-high" : ""}`}
                  onDragStart={(e) => { setDrag(t.id); e.dataTransfer.effectAllowed = "move"; }} onDragEnd={() => { setDrag(null); setOver(null); }}
                  onDrop={(e) => { e.preventDefault(); e.stopPropagation(); drop(s.key, t.id); }} onClick={() => onSelect(t.id)}>
                  {t.labels?.length > 0 && <div className="board-card__labels">{t.labels.map((l) => <span key={l.text} style={{ background: LABEL_COLORS[l.color] }} title={l.text} />)}</div>}
                  <strong>{t.pinned && <Icon name="pin" size={11} />} {t.title}</strong>
                  <div className="board-card__meta">
                    {t.kind !== "task" && <span className="pill pill--xs"><Icon name={KIND_ICON[t.kind]} size={10} /> {t.dutyLabel || t.kindLabel}</span>}
                    {due && <span className={t.overdue ? "text-red" : ""}><Icon name="clock" size={11} /> {relativeDay(due)}</span>}
                    {t.checklist?.length > 0 && <span><Icon name="checkSquare" size={11} /> {t.checklist.filter((c) => c.done).length}/{t.checklist.length}</span>}
                    {!can && <span className="muted">{t.owner?.name} yürütüyor</span>}
                  </div>
                  {can && <div className="board-card__move" onClick={(e) => e.stopPropagation()}>
                    {si > 0 && <button type="button" className="icon-btn icon-btn--xs" onClick={() => shift(t, -1)} title="Sola taşı"><Icon name="chevronLeft" size={12} /></button>}
                    {si < STATUSES.length - 1 && <button type="button" className="icon-btn icon-btn--xs" onClick={() => shift(t, 1)} title="Sağa taşı"><Icon name="chevronRight" size={12} /></button>}
                  </div>}
                </article>
              );
            })}
            {adding === s.key ? (
              <textarea className="board__add" autoFocus rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Kart başlığı… (↩ ekle, esc vazgeç)"
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (text.trim()) onAdd(s.key, text.trim()); setText(""); } if (e.key === "Escape") { setAdding(null); setText(""); } }} onBlur={() => { if (!text.trim()) setAdding(null); }} />
            ) : <button type="button" className="board__addbtn" onClick={() => setAdding(s.key)}><Icon name="plus" size={13} /> Kart ekle</button>}
          </div>
        </section>
      ))}
    </div>
  );
}
