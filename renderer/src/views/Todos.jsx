// Yapılacaklar: liste (gruplu), pano (sürükle-bırak) ve atadıklarım. Sağda
// seçili kartın ayrıntı paneli: aşamalar, etiketler, cevap, son tarih.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Empty, ErrorNote, Icon, MenuButton, Modal, OfflineNote, Segmented, Spinner, ViewHeader, useConfirm, useResult, Field } from "../components/ui";
import { del, get, patch, post, tempId, useCommand, useResource } from "../api";
import { formatDate, formatTime, groupTodos, includesTr, localInput, relativeDay } from "../lib/helpers";

const STATUSES = [
  { key: "open", label: "Yapılacak" },
  { key: "in_progress", label: "Sürüyor" },
  { key: "done", label: "Tamamlandı" },
];
const PRIORITY = { low: "Düşük", normal: "Normal", high: "Yüksek" };
const LABEL_COLORS = { red: "#ef4444", orange: "#f97316", yellow: "#eab308", green: "#22c55e", teal: "#14b8a6", blue: "#3b82f6", purple: "#8b5cf6", pink: "#ec4899", gray: "#6b7280" };
const GROUPS = [["overdue", "Gecikmiş"], ["today", "Bugün"], ["upcoming", "Yaklaşan"], ["nodate", "Tarihsiz"], ["done", "Tamamlanan"]];
const SOURCE = { mine: "Kendi kartım", assigned_to_me: "Bana atandı", assigned_by_me: "Atadığım", system: "Sistem" };
const SPECIAL_KINDS = new Set(["match_duty", "award_nomination", "award_coordination", "match_moment"]);

export default function Todos({ arg, go }) {
  const [mode, setMode] = useState(() => localStorage.getItem("todos:mode") || "list");
  const [query, setQuery] = useState("");
  const [showDone, setShowDone] = useState(false);
  const [selected, setSelected] = useState(arg && arg !== "new" ? Number(arg) || arg : null);
  const [creating, setCreating] = useState(arg === "new");
  const searchRef = useRef(null);
  const result = useResult();

  const view = mode === "board" ? "board" : mode === "assigned" ? "assigned" : "mine";
  const list = useResource("/api/todos", { view, status: mode === "board" ? undefined : showDone ? "all" : "active" });
  const catalog = useResource("/api/todos/catalog");

  useEffect(() => { try { localStorage.setItem("todos:mode", mode); } catch { /* yoksay */ } }, [mode]);
  useCommand("new", () => setCreating(true));
  useCommand("find", () => searchRef.current?.focus());

  const items = useMemo(() => (list.data?.items || []).filter((t) => !query || includesTr(`${t.title} ${t.body} ${t.labels?.map((l) => l.text).join(" ")} ${t.owner?.name}`, query)), [list.data, query]);
  const selectedTask = items.find((t) => String(t.id) === String(selected)) || (list.data?.items || []).find((t) => String(t.id) === String(selected));

  const replace = useCallback((item) => list.setData((d) => (d ? { ...d, items: d.items.map((t) => (t.id === item.id ? item : t)) } : d)), [list]);

  const update = useCallback(async (task, changes) => {
    replace({ ...task, ...changes, ...(changes.due_at !== undefined ? { dueAt: changes.due_at } : {}) });
    const res = await patch(`/api/todos/${task.id}`, changes);
    if (!result(res)) { list.reload({ quiet: true }); return null; }
    if (res.data?.item) replace(res.data.item);
    return res.data?.item || null;
  }, [replace, result, list]);

  const remove = useCallback(async (task) => {
    list.setData((d) => ({ ...d, items: d.items.filter((t) => t.id !== task.id) }));
    setSelected(null);
    const res = await del(`/api/todos/${task.id}`);
    if (!result(res, "Kart silindi.")) list.reload({ quiet: true });
  }, [list, result]);

  const counts = useMemo(() => {
    const g = groupTodos(list.data?.items || []);
    return { overdue: g.overdue.length, today: g.today.length };
  }, [list.data]);

  return (
    <div className="view view--split">
      <div className="split__main">
        <ViewHeader title="Yapılacaklar" subtitle={`${counts.overdue ? `${counts.overdue} gecikmiş · ` : ""}${counts.today} bugün`}>
          <div className="search-box"><Icon name="search" size={14} /><input ref={searchRef} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Kartlarda ara" /></div>
          <Segmented value={mode} onChange={setMode} size="sm" options={[{ value: "list", label: "Liste", icon: "list" }, { value: "board", label: "Pano", icon: "board" }, { value: "assigned", label: "Atadıklarım", icon: "share" }]} />
          <button type="button" className="btn btn--primary" onClick={() => setCreating(true)}><Icon name="plus" /> Yeni kart</button>
        </ViewHeader>
        <OfflineNote offline={list.offline} savedAt={list.savedAt} />
        <ErrorNote error={list.error && !list.data ? list.error : null} onRetry={list.reload} />
        {list.loading && !list.data ? <Spinner /> : mode === "board" ? (
          <Board items={items} onSelect={setSelected} selected={selected} onMove={async (task, status, ids) => {
            list.setData((d) => ({ ...d, items: d.items.map((t) => (t.id === task.id ? { ...t, status } : t)).map((t) => ({ ...t, position: ids.includes(t.id) ? ids.indexOf(t.id) : t.position })) }));
            const res = await post("/api/todos/reorder", { status, ids, moved_id: task.id }, { queue: false });
            if (!result(res)) list.reload({ quiet: true });
          }} />
        ) : (
          <TaskList items={items} mode={mode} showDone={showDone} setShowDone={setShowDone} selected={selected} onSelect={setSelected} onToggle={(t) => update(t, { status: t.status === "done" ? "open" : "done" })} />
        )}
      </div>
      {selectedTask && (
        <TaskDetail key={selectedTask.id} task={selectedTask} onClose={() => setSelected(null)} onUpdate={update} onDelete={remove} catalog={catalog.data} go={go} />
      )}
      {creating && (
        <NewTask catalog={catalog.data} onClose={() => setCreating(false)} onCreated={(created) => {
          setCreating(false);
          list.reload({ quiet: true });
          if (created?.[0]?.id) setSelected(created[0].id);
        }} />
      )}
    </div>
  );
}

/* ---------------------------------- liste ---------------------------------- */
function TaskList({ items, mode, showDone, setShowDone, selected, onSelect, onToggle }) {
  const groups = useMemo(() => groupTodos(items), [items]);
  if (!items.length) {
    return <Empty icon="checkSquare" title={mode === "assigned" ? "Başkasına atadığınız açık kart yok" : "Liste boş"} text="⌘N ile yeni kart ekleyin ya da ⌃⌥N ile her yerden hızlıca görev yazın." />;
  }
  return (
    <div className="task-groups">
      {GROUPS.filter(([key]) => groups[key].length).map(([key, label]) => (
        <section key={key} className="task-group">
          <h3 className={`task-group__title ${key === "overdue" ? "text-red" : ""}`}>{label} <span>{groups[key].length}</span></h3>
          <ul className="task-list">
            {groups[key].map((t) => <TaskRow key={t.id} task={t} active={String(selected) === String(t.id)} onSelect={onSelect} onToggle={onToggle} showOwner={mode === "assigned"} />)}
          </ul>
        </section>
      ))}
      <button type="button" className="link-btn" onClick={() => setShowDone((v) => !v)}>{showDone ? "Tamamlananları gizle" : "Tamamlananları göster"}</button>
    </div>
  );
}

function TaskRow({ task: t, active, onSelect, onToggle, showOwner }) {
  const doneSteps = t.checklist?.filter((c) => c.done).length || 0;
  return (
    <li className={`task-row ${active ? "is-active" : ""} ${t.status === "done" ? "is-done" : ""}`}>
      <button type="button" className={`check ${t.status === "done" ? "is-checked" : ""}`} onClick={() => onToggle(t)} disabled={!t.permissions?.canChangeStatus} aria-label={t.status === "done" ? "Geri aç" : "Tamamla"}>{t.status === "done" && <Icon name="check" size={12} strokeWidth={3} />}</button>
      <button type="button" className="task-row__main" onClick={() => onSelect(t.id)}>
        <span className="task-row__title">
          {t.pinned && <Icon name="pin" size={12} />}
          {t.priority === "high" && <Icon name="flag" size={12} className="text-red" />}
          {t.title}
        </span>
        <span className="task-row__meta">
          {t.status === "in_progress" && <span className="pill pill--blue">Sürüyor</span>}
          {t.kind !== "task" && t.kind !== "note" && <span className="pill">{t.kindLabel}</span>}
          {t.labels?.map((l) => <span key={l.text} className="label-dot" style={{ background: LABEL_COLORS[l.color] }}>{l.text}</span>)}
          {t.checklist?.length > 0 && <span className="muted"><Icon name="checkSquare" size={11} /> {doneSteps}/{t.checklist.length}</span>}
          {t.match && <span className="muted"><Icon name="ball" size={11} /> {t.match.label}</span>}
          {showOwner && t.owner && <span className="muted"><Icon name="user" size={11} /> {t.owner.name}</span>}
          {t.assignedBy && <span className="muted">← {t.assignedBy.name}</span>}
        </span>
      </button>
      {t.dueAt && <span className={`task-row__due ${t.overdue ? "text-red" : ""}`}>{relativeDay(t.dueAt)}<small>{formatTime(t.dueAt)}</small></span>}
    </li>
  );
}

/* ---------------------------------- pano ---------------------------------- */
function Board({ items, onSelect, selected, onMove }) {
  const [drag, setDrag] = useState(null);
  const [over, setOver] = useState(null);
  const columns = useMemo(() => {
    const out = {};
    for (const s of STATUSES) {
      out[s.key] = items.filter((t) => t.status === s.key).sort((a, b) => (a.position ?? 1e9) - (b.position ?? 1e9));
    }
    return out;
  }, [items]);

  const drop = (status, beforeId) => {
    const task = items.find((t) => t.id === drag);
    setDrag(null);
    setOver(null);
    if (!task || !task.permissions?.canChangeStatus && task.status !== status) return;
    const ids = columns[status].map((t) => t.id).filter((id) => id !== task.id);
    const at = beforeId ? ids.indexOf(beforeId) : ids.length;
    ids.splice(at < 0 ? ids.length : at, 0, task.id);
    onMove(task, status, ids);
  };

  return (
    <div className="board">
      {STATUSES.map((s) => (
        <section key={s.key} className={`board__col ${over === s.key ? "is-over" : ""}`}
          onDragOver={(e) => { e.preventDefault(); setOver(s.key); }}
          onDragLeave={() => setOver(null)}
          onDrop={(e) => { e.preventDefault(); drop(s.key, null); }}>
          <h3>{s.label} <span>{columns[s.key].length}</span></h3>
          <div className="board__cards">
            {columns[s.key].map((t) => (
              <article key={t.id} draggable className={`board-card ${String(selected) === String(t.id) ? "is-active" : ""} ${drag === t.id ? "is-dragging" : ""}`}
                onDragStart={(e) => { setDrag(t.id); e.dataTransfer.effectAllowed = "move"; }}
                onDragEnd={() => { setDrag(null); setOver(null); }}
                onDrop={(e) => { e.preventDefault(); e.stopPropagation(); drop(s.key, t.id); }}
                onClick={() => onSelect(t.id)}>
                {t.labels?.length > 0 && <div className="board-card__labels">{t.labels.map((l) => <span key={l.text} style={{ background: LABEL_COLORS[l.color] }} title={l.text} />)}</div>}
                <strong>{t.priority === "high" && <Icon name="flag" size={12} className="text-red" />} {t.title}</strong>
                <div className="board-card__meta">
                  {t.dueAt && <span className={t.overdue ? "text-red" : ""}><Icon name="clock" size={11} /> {relativeDay(t.dueAt)}</span>}
                  {t.checklist?.length > 0 && <span><Icon name="checkSquare" size={11} /> {t.checklist.filter((c) => c.done).length}/{t.checklist.length}</span>}
                  {t.source && t.source !== "mine" && <span className="pill pill--xs">{SOURCE[t.source] || t.source}</span>}
                </div>
              </article>
            ))}
            {!columns[s.key].length && <p className="board__empty">Kartı buraya sürükleyin</p>}
          </div>
        </section>
      ))}
    </div>
  );
}

/* ------------------------------- ayrıntı paneli ------------------------------- */
function TaskDetail({ task, onClose, onUpdate, onDelete, catalog, go }) {
  const confirm = useConfirm();
  const [title, setTitle] = useState(task.title);
  const [body, setBody] = useState(task.body || "");
  const [response, setResponse] = useState(task.response || "");
  const [step, setStep] = useState("");
  const [label, setLabel] = useState({ text: "", color: "blue" });
  const can = task.permissions || {};
  const special = SPECIAL_KINDS.has(task.kind);

  const saveText = (field, value) => { if ((task[field] || "") !== value) onUpdate(task, { [field]: value }); };
  const checklist = task.checklist || [];
  const setChecklist = (next) => onUpdate(task, { checklist: next.map((c) => ({ id: c.id, text: c.text, done: c.done })) });

  return (
    <aside className="split__side detail">
      <header className="detail__head">
        <span className="pill">{task.kindLabel}</span>
        <div className="row-gap">
          {can.isOwner && <button type="button" className={`icon-btn ${task.pinned ? "is-on" : ""}`} title="Sabitle" onClick={() => onUpdate(task, { pinned: !task.pinned })}><Icon name="pin" /></button>}
          <MenuButton items={[
            can.isOwner && { label: task.archived ? "Arşivden çıkar" : "Panodan kaldır (arşivle)", icon: "archive", onClick: () => onUpdate(task, { archived: !task.archived }) },
            special && { label: "Web'de aç (maç masası)", icon: "external", onClick: () => window.elitlig.app.openWeb("/yonetim/yapilacaklar") },
            task.sheet && { label: "Tabloyu aç", icon: "grid", onClick: () => go(`sheets:${task.sheet.id}`) },
            can.canDelete && "-",
            can.canDelete && { label: "Kartı sil", icon: "trash", danger: true, onClick: async () => { if (await confirm({ title: "Kartı sil", message: `“${task.title}” silinsin mi?`, confirmLabel: "Sil", danger: true })) onDelete(task); } },
          ]} />
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Kapat"><Icon name="x" /></button>
        </div>
      </header>

      <textarea className="detail__title" value={title} rows={1} readOnly={!can.canEdit} onChange={(e) => setTitle(e.target.value)} onBlur={() => title.trim() && saveText("title", title.trim())} />

      <div className="detail__props">
        <Field label="Durum">
          <select value={task.status} disabled={!can.canChangeStatus} onChange={(e) => onUpdate(task, { status: e.target.value })}>
            {STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </Field>
        <Field label="Öncelik">
          <select value={task.priority} disabled={!can.canEdit} onChange={(e) => onUpdate(task, { priority: e.target.value })}>
            {Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Son tarih">
          <input type="datetime-local" value={localInput(task.dueAt)} disabled={!can.canEdit || task.kind === "match_duty"} onChange={(e) => onUpdate(task, { due_at: e.target.value ? new Date(e.target.value).toISOString() : null })} />
        </Field>
      </div>

      {(task.owner || task.assignedBy) && (
        <p className="muted small">
          {task.assignedBy ? <>Atayan: <strong>{task.assignedBy.name}</strong> · </> : null}
          Sahibi: <strong>{task.owner?.name}</strong>
          {task.completedAt && <> · Tamamlandı {formatDate(task.completedAt)}</>}
        </p>
      )}

      {task.match && (
        <div className="info-box">
          <Icon name="ball" />
          <div>
            <strong>{task.match.label}</strong>
            <span className="muted small">{[task.match.date && formatDate(task.match.date), task.match.time, task.match.field, task.match.league].filter(Boolean).join(" · ")}</span>
            {task.dutyLabel && <span className="pill">{task.dutyLabel}</span>}
            {task.workflow && <span className="muted small">Aşamalar: {task.workflow.done}/{task.workflow.total}</span>}
          </div>
        </div>
      )}
      {task.sheet && (
        <button type="button" className="info-box info-box--btn" onClick={() => go(`sheets:${task.sheet.id}`)}>
          <Icon name="grid" /><div><strong>{task.sheet.title}</strong><span className="muted small">{task.sheet.sharedBy} paylaştı · {task.sheet.role === "editor" ? "düzenleyebilirsiniz" : "görüntüleyebilirsiniz"}</span></div>
        </button>
      )}
      {special && <p className="muted small">Bu kartın maç masası / aday seçimi gibi ayrıntılı işlemleri web panelinde. Durum, aşamalar ve cevap buradan yönetilebilir.</p>}

      <Field label="Açıklama">
        <textarea value={body} rows={4} readOnly={!can.canEdit} onChange={(e) => setBody(e.target.value)} onBlur={() => saveText("body", body)} placeholder={can.canEdit ? "Ayrıntı ekleyin…" : ""} />
      </Field>

      <section className="detail__section">
        <h4>Aşamalar {checklist.length > 0 && <span className="muted">{checklist.filter((c) => c.done).length}/{checklist.length}</span>}</h4>
        {checklist.length > 0 && <div className="progress"><span style={{ width: `${(checklist.filter((c) => c.done).length / checklist.length) * 100}%` }} /></div>}
        <ul className="checklist">
          {checklist.map((c) => (
            <li key={c.id}>
              <input type="checkbox" checked={c.done} onChange={() => setChecklist(checklist.map((x) => (x.id === c.id ? { ...x, done: !x.done } : x)))} />
              <span className={c.done ? "is-done" : ""}>{c.text}</span>
              <button type="button" className="icon-btn icon-btn--xs" onClick={() => setChecklist(checklist.filter((x) => x.id !== c.id))} aria-label="Sil"><Icon name="x" size={12} /></button>
            </li>
          ))}
        </ul>
        <form className="inline-add" onSubmit={(e) => { e.preventDefault(); if (!step.trim()) return; setChecklist([...checklist, { id: `c${Date.now().toString(36)}`, text: step.trim(), done: false }]); setStep(""); }}>
          <input value={step} onChange={(e) => setStep(e.target.value)} placeholder="Aşama ekle ve ↩" />
        </form>
      </section>

      <section className="detail__section">
        <h4>Etiketler</h4>
        <div className="labels">
          {(task.labels || []).map((l) => (
            <span key={l.text} className="label-chip" style={{ "--c": LABEL_COLORS[l.color] }}>
              {l.text}
              <button type="button" onClick={() => onUpdate(task, { labels: task.labels.filter((x) => x.text !== l.text) })} aria-label="Kaldır">×</button>
            </span>
          ))}
        </div>
        <form className="inline-add" onSubmit={(e) => { e.preventDefault(); if (!label.text.trim()) return; onUpdate(task, { labels: [...(task.labels || []), { text: label.text.trim(), color: label.color }] }); setLabel({ ...label, text: "" }); }}>
          <input value={label.text} maxLength={24} onChange={(e) => setLabel({ ...label, text: e.target.value })} placeholder="Etiket ekle" />
          <div className="color-dots">
            {(catalog?.labelColors || Object.keys(LABEL_COLORS)).map((c) => <button key={c} type="button" className={label.color === c ? "is-on" : ""} style={{ background: LABEL_COLORS[c] }} onClick={() => setLabel({ ...label, color: c })} aria-label={c} />)}
          </div>
        </form>
      </section>

      {(task.assignedBy || can.isOwner) && task.kind !== "note" && (
        <Field label={task.assignedBy ? "Cevabınız (atayan kişi görür)" : "Not / cevap"}>
          <textarea value={response} rows={3} readOnly={!can.isOwner} onChange={(e) => setResponse(e.target.value)} onBlur={() => saveText("response", response)} placeholder="Ne yapıldı, nerede kalındı…" />
        </Field>
      )}
    </aside>
  );
}

/* --------------------------------- yeni kart --------------------------------- */
function NewTask({ catalog, onClose, onCreated }) {
  const result = useResult();
  const [form, setForm] = useState({ kind: "task", title: "", body: "", priority: "normal", due_at: "", checklist: "" });
  const [assignees, setAssignees] = useState([]);
  const [people, setPeople] = useState([]);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const canAssign = Boolean(catalog?.canAssign) && form.kind !== "note";

  useEffect(() => {
    if (!canAssign) return;
    get("/api/todos/assignees", { search: search || undefined }).then((res) => res.ok && setPeople(res.data?.items || []));
  }, [canAssign, search]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    setBusy(true);
    const checklist = form.checklist.split("\n").map((t) => t.trim()).filter(Boolean).map((text, i) => ({ id: `c${Date.now().toString(36)}${i}`, text, done: false }));
    const res = await post("/api/todos", {
      kind: form.kind,
      title: form.title.trim(),
      body: form.body || null,
      priority: form.priority,
      due_at: form.due_at ? new Date(form.due_at).toISOString() : null,
      ...(checklist.length ? { checklist } : {}),
      ...(assignees.length ? { assignee_ids: assignees.map((a) => a.id) } : {}),
    }, { tempId: tempId() });
    setBusy(false);
    if (result(res, assignees.length ? `${assignees.length} kişiye atandı.` : "Kart eklendi.")) onCreated(res.data?.items);
  };

  const kinds = (catalog?.kinds || [{ key: "task", label: "Görev", creatable: true }, { key: "reminder", label: "Hatırlatma", creatable: true }, { key: "note", label: "Kişisel Not", creatable: true }])
    .filter((k) => k.creatable && k.key !== "award_nomination");

  return (
    <Modal title="Yeni kart" onClose={onClose} width={560} footer={<>
      <button type="button" className="btn" onClick={onClose}>Vazgeç</button>
      <button type="submit" form="new-task" className="btn btn--primary" disabled={busy || !form.title.trim()}>{busy ? "Kaydediliyor…" : "Ekle"}</button>
    </>}>
      <form id="new-task" className="form-grid" onSubmit={submit}>
        <Field label="Başlık" className="span2"><input autoFocus value={form.title} onChange={set("title")} placeholder="Ne yapılacak?" /></Field>
        <Field label="Tür"><select value={form.kind} onChange={set("kind")}>{kinds.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}</select></Field>
        <Field label="Öncelik"><select value={form.priority} onChange={set("priority")}>{Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        <Field label="Son tarih"><input type="datetime-local" value={form.due_at} onChange={set("due_at")} /></Field>
        <Field label="Açıklama" className="span2"><textarea rows={3} value={form.body} onChange={set("body")} /></Field>
        <Field label="Aşamalar (her satır bir aşama)" className="span2"><textarea rows={3} value={form.checklist} onChange={set("checklist")} placeholder={"Sahayı ara\nHakemi teyit et"} /></Field>
        {canAssign && (
          <div className="span2">
            <span className="field__label">Ata (boş bırakılırsa size)</span>
            <div className="chips">
              {assignees.map((a) => <span key={a.id} className="chip">{a.name}<button type="button" onClick={() => setAssignees(assignees.filter((x) => x.id !== a.id))}>×</button></span>)}
            </div>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Kişi ara…" />
            <div className="pick-list">
              {people.filter((p) => !assignees.some((a) => a.id === p.id)).slice(0, 8).map((p) => (
                <button key={p.id} type="button" onClick={() => setAssignees([...assignees, p])}>{p.name}{p.isSelf ? " (siz)" : ""}<small>{p.city}</small></button>
              ))}
            </div>
          </div>
        )}
      </form>
    </Modal>
  );
}
