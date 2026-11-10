// Projeler: proje etapları (aşama / adım / dönem görüntüle ve düzenle), projelerim, projelerde bugün, Gantt.
import React, { useEffect, useMemo, useState } from "react";
import { Icon } from "../../../components/ui";
import { patch, post, request } from "../../../api";
import { activeProjects } from "../../../widgets/widgetModel";
import { dayKey, dueLabel, formatWhen, groupFollowups } from "../../../lib/projectUtils";
import { LIFECYCLE, STEP_STATUSES, addDays, isoDay, periodBars, stageView, statusLabel } from "../stagesModel";
import { refreshData, useData } from "../data";
import { Bar, Big, List, Row, State, Stats, XsButton } from "../parts";

const BASE = "/api/tools/projects";
const tone = { todo: "", doing: "blue", waiting: "amber", blocked: "red", done: "green", skipped: "" };

/** Seçili ya da otomatik (en yakın son tarihli aktif) proje. */
function useProjectChoice(o) {
  const list = useData(BASE, null, { ttl: 60000 });
  const active = useMemo(() => activeProjects(list.data?.items || []), [list.data]);
  const chosen = o.project ? (list.data?.items || []).find((p) => String(p.id) === String(o.project)) : null;
  const project = chosen || active[0] || null;
  return { list, active, project };
}

function ProjectPicker({ value, items, onChange }) {
  return (
    <select className="dt-picker" value={value || ""} onChange={(e) => onChange(e.target.value || null)} aria-label="Proje seç">
      <option value="">Otomatik (en yakın)</option>
      {items.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
    </select>
  );
}

function StepRow({ s, edit, onStatus, onDue, onOpen, compact }) {
  const today = isoDay();
  const late = s.due_date && !["done", "skipped"].includes(s.status) && String(s.due_date).slice(0, 10) < today;
  return (
    <li className={`dt-step is-${s.status}${late ? " is-late" : ""}`} data-step={s.id}>
      <button type="button" className={`dt-step__check${s.status === "done" ? " is-on" : ""}`} onClick={() => onStatus(s, s.status === "done" ? "todo" : "done")} aria-label={s.status === "done" ? "Tamamlanmadı yap" : "Tamamlandı yap"} title={s.status === "done" ? "Geri al" : "Tamamlandı"}>{s.status === "done" && <Icon name="check" size={11} strokeWidth={3} />}</button>
      <button type="button" className="dt-step__title" onClick={() => onOpen(s)} title="Projede aç">{s.title}</button>
      {edit ? (
        <>
          <select className={`dt-step__status is-${tone[s.status] || "none"}`} value={s.status} onChange={(e) => onStatus(s, e.target.value)} aria-label={`${s.title} durumu`}>
            {STEP_STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          {!compact && <input type="date" className="dt-step__date" value={String(s.due_date || "").slice(0, 10)} onChange={(e) => onDue(s, e.target.value || null)} aria-label={`${s.title} son tarihi`} />}
        </>
      ) : (
        <span className={`pill${tone[s.status] ? ` pill--${tone[s.status]}` : ""}`}>{statusLabel(s.status)}</span>
      )}
      {compact && s.due_date && <small className={late ? "text-red" : "muted"}>{dueLabel(String(s.due_date).slice(0, 10))}</small>}
    </li>
  );
}

export function StagesTile({ tier, o, set, go, lines, result, w }) {
  const { list, active, project } = useProjectChoice(o);
  const pid = project?.id;
  const detail = useData(pid ? `${BASE}/${pid}` : null, null, { enabled: Boolean(pid) && tier !== "xs" ? true : Boolean(pid), ttl: 30000 });
  const big = tier === "l" || tier === "xl";
  const brief = useData(pid ? `${BASE}/${pid}/brief` : null, null, { enabled: Boolean(pid) && big, ttl: 60000 });
  const periods = useData(pid ? `${BASE}/${pid}/periods` : null, null, { enabled: Boolean(pid) && tier === "xl", ttl: 60000 });
  const view = useMemo(() => stageView(detail.data), [detail.data]);
  const [openPhase, setOpenPhase] = useState(null);
  const [newStep, setNewStep] = useState("");
  useEffect(() => { setOpenPhase(null); }, [pid]);
  const phase = view.phases.find((p) => p.id === openPhase) || view.current;

  const openProject = (extra = {}) => (pid ? go("projects", { id: pid, tab: "process", ...extra }) : go("projects"));
  if (list.data && !project) {
    return tier === "xs" ? <XsButton icon="layers" label="Proje yok" onClick={() => go("projects:new")} />
      : <State empty="Aktif proje yok. Yeni proje oluşturun." emptyIcon="layers" />;
  }
  if (tier === "xs") {
    return <XsButton icon="layers" value={view.total ? `${view.index}/${view.total}` : "…"} label={view.current?.name || project?.name || "Proje"} title={`${project?.name || ""}: ${view.current?.name || ""}`} onClick={() => openProject()} />;
  }
  if (!detail.data) return <State q={detail.data ? null : (pid ? detail : list)} />;

  // Yazma: iyimser, hata olursa yeniden okunur.
  const swapStep = (sid, changes) => detail.setData((d) => (d ? { ...d, steps: d.steps.map((s) => (s.id === sid ? { ...s, ...changes } : s)) } : d));
  const onStatus = async (s, status) => {
    if (status === s.status) return;
    swapStep(s.id, { status });
    const res = await patch(`${BASE}/${pid}/steps/${s.id}`, { status });
    if (!result(res, `“${s.title}”: ${statusLabel(status)}`)) detail.reload();
    else { refreshData(BASE); refreshData("/api/todos"); }
  };
  const onDue = async (s, due) => {
    swapStep(s.id, { due_date: due });
    const res = await patch(`${BASE}/${pid}/steps/${s.id}`, { due_date: due });
    if (!result(res, due ? `Son tarih: ${new Date(`${due}T12:00`).toLocaleDateString("tr-TR")}` : "Son tarih kaldırıldı.")) detail.reload();
    else refreshData(BASE);
  };
  const completePhase = async (p) => {
    const open = p.steps.filter((s) => !["done", "skipped"].includes(s.status));
    if (!open.length) return;
    open.forEach((s) => swapStep(s.id, { status: "done" }));
    const results = await Promise.all(open.map((s) => patch(`${BASE}/${pid}/steps/${s.id}`, { status: "done" })));
    const bad = results.find((r) => !r.ok);
    if (bad) { result(bad); detail.reload(); } else { result({ ok: true }, `“${p.name}” aşaması tamamlandı (${open.length} adım).`); refreshData(BASE); }
  };
  const addStep = async (e) => {
    e.preventDefault();
    const title = newStep.trim();
    if (!title || !phase) return;
    const res = await post(`${BASE}/${pid}/steps`, { title, phase_id: phase.id });
    if (result(res, "Adım eklendi.")) { setNewStep(""); detail.reload(); }
  };
  const setStage = async (stage) => {
    brief.setData((d) => (d ? { ...d, lifecycle: { ...d.lifecycle, stage } } : d));
    const res = await patch(`${BASE}/${pid}/brief`, { stage });
    if (!result(res, `Evre: ${(LIFECYCLE.find(([k]) => k === stage) || [0, stage])[1]}`)) brief.reload();
  };
  const setPeriod = async (p, changes) => {
    periods.setData((d) => (d ? { ...d, items: d.items.map((x) => (x.id === p.id ? { ...x, ...changes } : x)) } : d));
    const res = await patch(`${BASE}/${pid}/periods/${p.id}`, changes);
    if (!result(res, `${p.name}: kaydedildi.`)) periods.reload(); else refreshData(`${BASE}/timeline`);
  };

  const pc = project?.color || "#7c3aed";
  const head = (
    <div className="dt-proj-head" style={{ "--pc": pc }}>
      <span className="dt-proj-head__dot" />
      {tier === "s" ? <strong className="dt-proj-head__name">{project.name}</strong> : <ProjectPicker value={o.project} items={list.data?.items?.filter((p) => !p.archived) || active} onChange={(v) => set({ project: v })} />}
      <span className="dt-proj-head__pct">%{view.progress}</span>
    </div>
  );
  if (tier === "s") {
    const cur = view.current;
    return (
      <button type="button" className="dt-stage-s" onClick={() => openProject(cur ? { phase: cur.id } : {})} style={{ "--pc": pc }}>
        {head}
        <span className="dt-stage-s__phase"><small>Aşama {view.index}/{view.total}</small><b>{cur?.name || "—"}</b></span>
        <Bar pct={cur?.progress || 0} label={`${cur?.name} ilerlemesi`} />
        <small className="dt-stage-s__meta">{cur ? `${cur.done}/${cur.total - cur.steps.filter((s) => s.status === "skipped").length} adım` : ""}{view.overdue ? ` · ${view.overdue} gecikmiş` : ""}</small>
      </button>
    );
  }
  const stage = brief.data?.lifecycle?.stage;
  const phaseList = (
    <ol className="dt-phases">
      {view.phases.map((p, n) => (
        <li key={p.id} className={`${p.current ? "is-current " : ""}${phase?.id === p.id ? "is-open " : ""}${p.progress === 100 ? "is-done" : ""}`} style={{ "--ph": p.color || pc }}>
          <button type="button" onClick={() => setOpenPhase(p.id === openPhase ? null : p.id)} aria-expanded={phase?.id === p.id}>
            <span className="dt-phases__n">{p.progress === 100 ? <Icon name="check" size={10} strokeWidth={3} /> : n + 1}</span>
            <span className="dt-phases__name">{p.name}</span>
            <span className="dt-phases__count">{p.done}/{p.total}{p.overdue ? <em className="text-red"> · {p.overdue}!</em> : null}</span>
            <Bar pct={p.progress} label={`${p.name} ilerlemesi`} />
          </button>
        </li>
      ))}
    </ol>
  );
  const steps = phase ? phase.steps : [];
  const stepBox = phase && (
    <div className="dt-steps">
      <div className="dt-steps__head">
        <strong style={{ color: phase.color || pc }}>{phase.name}</strong>
        <small>{phase.done}/{phase.total} · %{phase.progress}</small>
        <span className="dt-grow" />
        {big && phase.open > 0 && <button type="button" className="btn btn--xs" onClick={() => completePhase(phase)} title="Bu aşamadaki açık adımların hepsini tamamlandı yap">Aşamayı tamamla</button>}
        <button type="button" className="link-btn" onClick={() => openProject({ phase: phase.id })}>Aç →</button>
      </div>
      <ul className="dt-steplist">
        {steps.slice(0, tier === "m" ? Math.max(2, lines - view.phases.length - 2) : 60).map((s) => (
          <StepRow key={s.id} s={s} edit compact={tier === "m" || w < 7} onStatus={onStatus} onDue={onDue} onOpen={(x) => openProject({ step: x.id })} />
        ))}
        {!steps.length && <li className="dt-hint">Bu aşamada adım yok.</li>}
      </ul>
      {big && (
        <form className="dt-inline" onSubmit={addStep}>
          <Icon name="plus" size={13} className="dt-inline__icon" />
          <input value={newStep} onChange={(e) => setNewStep(e.target.value)} placeholder={`“${phase.name}” aşamasına adım ekle`} aria-label="Yeni adım" />
          <button type="submit" className="btn btn--xs btn--primary" disabled={!newStep.trim()}>Ekle</button>
        </form>
      )}
    </div>
  );
  if (tier === "m") {
    return (
      <div className="dt-stack">
        {head}
        {openPhase ? stepBox : phaseList}
        {openPhase && <button type="button" className="link-btn" onClick={() => setOpenPhase(null)}>← Tüm aşamalar</button>}
      </div>
    );
  }
  const today = isoDay();
  const from = addDays(today, -30), to = addDays(today, 120);
  const bars = periodBars((periods.data?.items || []).filter((p) => p.kind !== "milestone"), from, to);
  const todayLeft = ((new Date(`${today}T00:00:00`) - new Date(`${from}T00:00:00`)) / (new Date(`${to}T00:00:00`) - new Date(`${from}T00:00:00`) + 86400000)) * 100;
  return (
    <div className="dt-stack">
      <div className="dt-proj-top">
        {head}
        {brief.data && (
          <div className="dt-lifecycle" role="radiogroup" aria-label="Proje evresi">
            {LIFECYCLE.map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={stage === k} className={stage === k ? "is-on" : ""} onClick={() => setStage(k)}>{l}</button>)}
          </div>
        )}
      </div>
      <div className="dt-stage-cols">
        {phaseList}
        {stepBox}
      </div>
      {tier === "xl" && (
        <section className="dt-periods">
          <h4 className="dt-sub">Dönemler (takvim) <button type="button" className="link-btn" onClick={() => go("projects", { section: "timeline" })}>Proje takvimi →</button></h4>
          <State q={periods} empty={periods.data && !bars.length ? "Bu projeye dönem eklenmemiş." : null} emptyIcon="calendar">
            <div className="dt-gantt is-edit">
              <span className="dt-gantt__overlay" style={{ right: 316 }}><i className="dt-gantt__today" style={{ left: `${todayLeft}%` }} title="Bugün" /></span>
              {bars.map((p) => (
                <div key={p.id} className="dt-gantt__row">
                  <span className="dt-gantt__label" title={p.name}>{p.name}</span>
                  <span className="dt-gantt__track"><i style={{ left: `${p.left}%`, width: `${p.width}%`, background: p.color }} title={`${p.start_date} – ${p.end_date}`}><b style={{ width: `${p.progress}%` }} /></i></span>
                  <input type="date" value={p.start_date} onChange={(e) => e.target.value && setPeriod(p, { start_date: e.target.value })} aria-label={`${p.name} başlangıç`} />
                  <input type="date" value={p.end_date} onChange={(e) => e.target.value && setPeriod(p, { end_date: e.target.value })} aria-label={`${p.name} bitiş`} />
                  <input type="number" min={0} max={100} step={10} value={p.progress} onChange={(e) => setPeriod(p, { progress: Number(e.target.value) })} aria-label={`${p.name} ilerleme yüzdesi`} />
                </div>
              ))}
            </div>
          </State>
        </section>
      )}
    </div>
  );
}

export function ProjectsTile({ tier, go, lines, result }) {
  const q = useData(BASE, null, { ttl: 60000 });
  const items = useMemo(() => activeProjects(q.data?.items || []), [q.data]);
  const statuses = q.data?.meta?.project_statuses || [];
  if (tier === "xs") return <XsButton icon="briefcase" value={q.data ? items.length : "–"} label="proje" onClick={() => go("projects")} />;
  if (tier === "s") {
    const next = items.find((p) => p.stats?.next_due);
    return <State q={q}><Big value={items.length} label="aktif proje" sub={next ? `Sıradaki: ${next.stats.next_due.title || next.name} · ${dueLabel(next.stats.next_due.due_date)}` : "Yaklaşan son tarih yok"} onClick={() => go("projects")} /></State>;
  }
  const setStatus = async (p, status) => {
    q.setData((d) => (d ? { ...d, items: d.items.map((x) => (x.id === p.id ? { ...x, status } : x)) } : d));
    const res = await patch(`${BASE}/${p.id}`, { status });
    if (!result(res, `${p.name}: ${statuses.find((s) => s.key === status)?.label || status}`)) q.reload();
  };
  const big = tier === "l" || tier === "xl";
  return (
    <State q={q} empty={q.data && !items.length ? "Aktif proje yok." : null} emptyIcon="layers">
      <ul className="dt-projlist">
        {items.slice(0, Math.max(2, Math.floor(lines / (big ? 1.6 : 1.3)))).map((p) => {
          const st = p.stats?.steps || {};
          return (
            <li key={p.id} style={{ "--pc": p.color || "#7c3aed" }}>
              <button type="button" className="dt-projlist__main" onClick={() => go("projects", { id: p.id })}>
                <span className="dt-proj-head__dot" />
                <span className="dt-projlist__text"><b>{p.name}</b><small>{st.done || 0}/{(st.total || 0) - (st.skipped || 0)} adım{st.overdue ? ` · ${st.overdue} gecikmiş` : ""}{p.stats?.next_due ? ` · ${dueLabel(p.stats.next_due.due_date)}` : ""}</small></span>
                <span className="dt-projlist__pct">%{st.progress || 0}</span>
              </button>
              <Bar pct={st.progress || 0} label={`${p.name} ilerlemesi`} />
              {big && statuses.length > 0 && p.access !== "view" && (
                <select value={p.status} onChange={(e) => setStatus(p, e.target.value)} aria-label={`${p.name} durumu`}>{statuses.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select>
              )}
            </li>
          );
        })}
      </ul>
    </State>
  );
}

export function FollowupsTile({ tier, go, lines }) {
  const res = useData(`${BASE}/followups`, { days: 1 });
  const fu = useMemo(() => groupFollowups(res.data), [res.data]);
  const today = dayKey();
  const leads = [...fu.overdueLeads, ...fu.todayLeads];
  const steps = [...fu.overdueSteps, ...fu.steps.filter((s) => s.due_date && s.due_date <= today)];
  const late = fu.overdueLeads.length + fu.overdueSteps.length;
  if (tier === "xs") return <XsButton icon="phone" value={leads.length + steps.length} label="takip" tone={late ? "red" : ""} onClick={() => go("projects", { section: "followups" })} />;
  const rows = [
    ...leads.map((l) => ({ key: `l${l.id}`, icon: "phone", title: l.name, sub: `${l.project_name} · ${l.stage_label}${l.next_action ? ` · ${l.next_action}` : ""}`, when: fu.overdueLeads.includes(l) ? "Gecikti" : formatWhen(l.next_action_at).replace("Bugün ", ""), late: fu.overdueLeads.includes(l), color: l.project_color, open: () => go("projects", { id: l.project_id, tab: "leads", lead: l.id }) })),
    ...steps.map((s) => ({ key: `s${s.id}`, icon: "list", title: s.title, sub: s.project_name, when: dueLabel(s.due_date), late: fu.overdueSteps.includes(s), color: s.project_color, open: () => go("projects", { id: s.project_id, tab: "process", step: s.id }) })),
  ];
  const counts = <Stats items={[{ label: "aranacak", value: leads.length, onClick: () => go("projects", { section: "followups" }) }, { label: "gecikmiş", value: late, tone: late ? "red" : "", onClick: () => go("projects", { section: "followups" }) }, { label: "açık soru", value: fu.questions.length, onClick: () => go("projects", { section: "followups" }) }]} />;
  if (tier === "s") return <State q={res}>{counts}</State>;
  const max = Math.max(1, lines - 2);
  return (
    <State q={res} empty={res.data && !rows.length ? "Projelerde bugün iş yok." : null} emptyIcon="layers">
      {counts}
      <List>{rows.slice(0, max).map((r) => <Row key={r.key} color={r.color} icon={r.icon} title={r.title} sub={r.sub} right={r.when} tone={r.late ? "red" : ""} onClick={r.open} />)}</List>
      {rows.length > max && <p className="dt-hint">+{rows.length - max} kayıt daha</p>}
    </State>
  );
}

export function GanttTile({ tier, go, lines }) {
  const today = isoDay();
  const span = { s: [7, 30], m: [14, 60], l: [30, 120], xl: [45, 180] }[tier] || [14, 60];
  const from = addDays(today, -span[0]), to = addDays(today, span[1]);
  const q = useData(`${BASE}/timeline`, { from, to }, { ttl: 60000 });
  const projects = (q.data?.projects || []).filter((p) => (p.periods || []).length);
  const total = new Date(`${to}T00:00:00`) - new Date(`${from}T00:00:00`) + 86400000;
  const todayLeft = ((new Date(`${today}T00:00:00`) - new Date(`${from}T00:00:00`)) / total) * 100;
  const nowPeriods = projects.flatMap((p) => p.periods.filter((x) => x.kind !== "milestone" && x.start_date <= today && (x.end_date || x.start_date) >= today).map((x) => ({ ...x, project: p })));
  if (tier === "s") return <State q={q}><Big value={nowPeriods.length} label="dönem bugün sürüyor" sub={nowPeriods.slice(0, 2).map((x) => `${x.project.name}: ${x.name}`).join(" · ") || "Bugün süren dönem yok"} onClick={() => go("projects", { section: "timeline" })} /></State>;
  const months = [];
  for (let d = new Date(`${from}T12:00:00`); d <= new Date(`${to}T12:00:00`); d = new Date(d.getFullYear(), d.getMonth() + 1, 1, 12)) {
    const left = ((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - new Date(`${from}T00:00:00`)) / total) * 100;
    months.push({ key: `${d.getFullYear()}-${d.getMonth()}`, left: Math.max(0, left), label: d.toLocaleDateString("tr-TR", { month: "short" }) });
  }
  const perRow = tier === "xl" || tier === "l";
  return (
    <State q={q} empty={q.data && !projects.length ? "Bu aralıkta planlanmış proje dönemi yok." : null} emptyIcon="calendar">
      <div className="dt-gantt">
        <div className="dt-gantt__months">{months.map((m) => <span key={m.key} style={{ left: `${m.left}%` }}>{m.label}</span>)}</div>
        <span className="dt-gantt__overlay"><i className="dt-gantt__today" style={{ left: `${todayLeft}%` }} title="Bugün" /></span>
        {projects.slice(0, Math.max(1, lines - 1)).map((p) => {
          const bars = periodBars(p.periods, from, to);
          return (
            <div key={p.id} className="dt-gantt__row">
              <button type="button" className="dt-gantt__label" onClick={() => go("projects", { id: p.id })} title={p.name} style={{ "--pc": p.color }}>{p.name}</button>
              <span className="dt-gantt__track">
                {bars.map((b) => <i key={b.id} className={b.kind === "milestone" ? "is-ms" : ""} style={{ left: `${b.left}%`, width: b.kind === "milestone" ? undefined : `${b.width}%`, background: b.color }} title={`${b.name}: ${b.start_date}${b.end_date && b.end_date !== b.start_date ? ` – ${b.end_date}` : ""}`}>{perRow && b.width > 9 && b.kind !== "milestone" ? <span>{b.name}</span> : null}</i>)}
              </span>
            </div>
          );
        })}
      </div>
    </State>
  );
}
