// Genel bakışın "Operasyon" bölümü: ilerleme, durum dağılımı, aşamalar, kişi hunisi, yaklaşan ve geciken
// adımlar, bugünkü takipler ve son hareketler.
import React, { useMemo } from "react";
import { Empty, Icon } from "../../components/ui";
import { dayKey, dueLabel, formatWhen, groupStepsByPhase, isStepOverdue, leadDueState, outcomeOf, stageOfLead } from "../../lib/projectUtils";
import { relativeTime } from "../../lib/helpers";
import { ACTIVITY_ICONS, Avatar, Progress, StagePill, label, money } from "./common";
import { AllocatedCard } from "../equipment/links";

const STATUS_COLORS = { todo: "#a7a3ba", doing: "#2563eb", waiting: "#d97706", blocked: "#e11d48", done: "#059669", skipped: "#cbd5e1" };

export default function OverviewOps({ ctx }) {
  const { project, steps, phases, leads, activities, settings, meta, people } = ctx;
  const st = ctx.stats.steps;
  const ls = ctx.stats.leads;
  const today = dayKey();
  const groups = useMemo(() => groupStepsByPhase(phases, steps, { keepEmpty: false }), [phases, steps]);
  const upcoming = useMemo(() => steps.filter((s) => s.due_date && !["done", "skipped"].includes(s.status)).sort((a, b) => a.due_date.localeCompare(b.due_date)).slice(0, 8), [steps]);
  const dueLeads = useMemo(() => leads.filter((l) => ["overdue", "today"].includes(leadDueState(l))).sort((a, b) => new Date(a.next_action_at) - new Date(b.next_action_at)), [leads]);
  const recent = activities.slice(0, 9);
  const maxStage = Math.max(1, ...settings.lead_stages.map((s) => ls.by_stage?.[s.key] || 0));
  const doing = steps.filter((s) => ["doing", "waiting", "blocked"].includes(s.status));

  return (
    <div className="proj-section">
      <div className="kpis kpis--six">
        <div className="kpi kpi--hero"><span><Icon name="trend" size={12} /> İlerleme</span><strong>%{st.progress}</strong><small>{st.done}/{st.total - st.skipped} adım tamamlandı{st.skipped ? ` · ${st.skipped} gerek yok` : ""}</small></div>
        <button type="button" className={`kpi kpi--btn ${st.overdue ? "kpi--alert" : ""}`} onClick={() => ctx.setTab("process", { processFilter: { status: "overdue" } })}><span>Geciken adım</span><strong>{st.overdue}</strong><small>{doing.length} adım sürüyor</small></button>
        <button type="button" className="kpi kpi--btn kpi--amber" onClick={() => ctx.setTab("leads", { leadFilter: { due: "due" } })}><span>Bugün aranacak</span><strong>{ls.due}</strong><small>{ls.open} açık · {ls.total} kişi</small></button>
        <button type="button" className="kpi kpi--btn kpi--green" onClick={() => ctx.setTab("portfolio")}><span>Kazanılan</span><strong>{money(ls.won_value)}</strong><small>{ls.won} satış · {ctx.portfolio.length} portföy</small></button>
        <div className="kpi kpi--blue"><span>Açık satış hattı</span><strong>{money(ls.pipeline_value)}</strong><small>açık kişilerin tutarı</small></div>
        <button type="button" className="kpi kpi--btn" onClick={() => ctx.setTab("questions")}><span>Açık soru</span><strong>{ctx.stats.open_questions}</strong><small>ihtiyaç ve müşteri soruları</small></button>
      </div>

      <div className="ov-grid">
        <section className="card ov-phases">
          <header className="card__head"><h2 className="card__title"><Icon name="list" /> Aşamalar</h2><button type="button" className="link-btn" onClick={() => ctx.setTab("process")}>Süreç →</button></header>
          <div className="status-bar" aria-label="Durum dağılımı">
            {(meta.step_statuses || []).map((s) => st.by_status?.[s.key] ? <span key={s.key} style={{ flex: st.by_status[s.key], background: STATUS_COLORS[s.key] }} title={`${s.label}: ${st.by_status[s.key]}`} /> : null)}
          </div>
          <div className="legend">{(meta.step_statuses || []).map((s) => <span key={s.key}><i style={{ background: STATUS_COLORS[s.key] }} />{s.label} {st.by_status?.[s.key] || 0}</span>)}</div>
          {groups.length ? (
            <ul className="phase-bars">
              {groups.map((g, i) => (
                <li key={g.key}>
                  <button type="button" onClick={() => ctx.setTab("process", { phase: g.key })}>
                    <span className="phase-bars__num" style={{ background: g.phase?.color || "#94a3b8" }}>{g.phase ? i + 1 : "–"}</span>
                    <span className="phase-bars__name">{g.phase?.name || "Aşamasız"}</span>
                    <span className="phase-bars__track"><Progress value={g.stats.progress} color={g.phase?.color} thin /></span>
                    <span className="phase-bars__val">{g.stats.done}/{g.stats.total - g.stats.skipped}{g.stats.overdue ? <b className="text-red"> · {g.stats.overdue}!</b> : null}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : <Empty icon="list" title="Henüz adım yok" text="Süreç sekmesinden aşama ve adım ekleyin ya da Excel'den aktarın." />}
        </section>

        <div className="ov-side">
          <section className="card">
            <header className="card__head"><h2 className="card__title"><Icon name="users" /> Kişi hunisi</h2><button type="button" className="link-btn" onClick={() => ctx.setTab("leads")}>Kişiler →</button></header>
            {ls.total ? (
              <div className="funnel">
                {settings.lead_stages.map((s) => (
                  <button key={s.key} type="button" className="funnel__row" onClick={() => ctx.setTab("leads", { leadFilter: { stage: s.key } })}>
                    <span className="funnel__label">{s.label}</span>
                    <span className="funnel__track"><span style={{ width: `${((ls.by_stage?.[s.key] || 0) / maxStage) * 100}%`, background: s.color }} /></span>
                    <strong>{ls.by_stage?.[s.key] || 0}</strong>
                  </button>
                ))}
              </div>
            ) : <Empty icon="users" title="Kişi yok" text="Aradığınız ya da arayacağınız kişileri Kişiler sekmesine ekleyin." />}
          </section>

          {project.stats?.finance && <BudgetCard f={project.stats.finance} suppliers={ctx.stats.suppliers} onOpen={() => ctx.setTab("budget")} />}

          <section className={`card ${dueLeads.some((l) => leadDueState(l) === "overdue") ? "due-col--alert" : ""}`}>
            <header className="card__head"><h2 className="card__title"><Icon name="phone" /> Bugünkü takipler</h2><span className="muted small">{dueLeads.length}</span></header>
            {dueLeads.length ? dueLeads.slice(0, 7).map((l) => (
              <button key={l.id} type="button" className="fu-row" onClick={() => { ctx.setTab("leads"); ctx.openLead(l.id); }}>
                <span className="fu-row__main"><strong>{l.kind === "supplier" ? l.company || l.name : l.name}</strong><small>{[l.kind === "supplier" ? `Tedarik${l.item ? `: ${l.item}` : ""}` : l.company, l.next_action].filter(Boolean).join(" · ")}</small></span>
                <StagePill stage={stageOfLead(settings, l)} small />
                <span className={`fu-row__when ${leadDueState(l) === "overdue" ? "text-red" : ""}`}>{formatWhen(l.next_action_at)}</span>
              </button>
            )) : <p className="muted small">Bugün aranacak kimse yok.</p>}
          </section>
        </div>

        <section className="card">
          <header className="card__head"><h2 className="card__title"><Icon name="clock" /> Yaklaşan ve geciken adımlar</h2></header>
          {upcoming.length ? upcoming.map((s) => (
            <button key={s.id} type="button" className="fu-row" onClick={() => { ctx.setTab("process"); ctx.openStep(s.id); }}>
              <span className="fu-row__bar" style={{ background: phases.find((p) => p.id === s.phase_id)?.color || "#94a3b8" }} />
              <span className="fu-row__main"><strong>{s.title}</strong><small>{[label(meta.step_statuses, s.status), s.responsible.join(", "), s.assignee_id ? people[s.assignee_id]?.name : null].filter(Boolean).join(" · ")}</small></span>
              <span className={`fu-row__when ${isStepOverdue(s, today) ? "text-red" : ""}`}>{dueLabel(s.due_date)}</span>
            </button>
          )) : <p className="muted small">Son tarihli açık adım yok. Adımlara son tarih verdikçe burada sıralanır.</p>}
        </section>

        <section className="card">
          <header className="card__head"><h2 className="card__title"><Icon name="activity" /> Son hareketler</h2><button type="button" className="link-btn" onClick={() => ctx.setTab("activity")}>İletişim →</button></header>
          {recent.length ? (
            <ul className="mini-timeline">
              {recent.map((a) => {
                const lead = a.lead_id ? leads.find((l) => l.id === a.lead_id) : null;
                const step = a.step_id ? steps.find((s) => s.id === a.step_id) : null;
                const outcome = outcomeOf(settings, a.outcome);
                return (
                  <li key={a.id}>
                    <span className={`tl-icon tl-icon--${a.type}`}><Icon name={ACTIVITY_ICONS[a.type] || "note"} size={12} /></span>
                    <span className="mini-timeline__text">
                      <strong>{lead?.name || step?.title || label(meta.activity_types, a.type)}</strong>
                      {outcome && <span className="pill pill--xs pill--tool">{outcome.label}</span>}
                      <small>{a.note}</small>
                    </span>
                    <span className="mini-timeline__when">{a.created_by && people[a.created_by] ? <Avatar name={people[a.created_by].name} size={18} /> : null}{relativeTime(a.occurred_at)}</span>
                  </li>
                );
              })}
            </ul>
          ) : <p className="muted small">Henüz hareket yok.</p>}
        </section>
        <AllocatedCard kind="project" id={project?.id} title="Projeye ayrılmış ekipman" />
      </div>
    </div>
  );
}

function BudgetCard({ f, suppliers, onOpen }) {
  const max = Math.max(1, f.estimate_income, f.estimate_expense);
  return (
    <section className="card ov-budget">
      <header className="card__head"><h2 className="card__title"><Icon name="wallet" /> Bütçe</h2><button type="button" className="link-btn" onClick={onOpen}>Bütçe →</button></header>
      <div className="ov-budget__rows">
        {[["Gelir", f.estimate_income, f.paid_income, "green"], ["Gider", f.estimate_expense, f.paid_expense, "red"]].map(([l, est, paid, tone]) => (
          <div key={l} className="ov-budget__row">
            <span>{l}</span>
            <span className="ov-budget__track"><span className={`bg-${tone}`} style={{ width: `${(est / max) * 100}%`, opacity: 0.3 }} /><span className={`bg-${tone}`} style={{ width: `${(paid / max) * 100}%` }} /></span>
            <strong>{money(est)}</strong>
          </div>
        ))}
      </div>
      <small className="muted">Tahmini net <b className={f.estimate_net < 0 ? "text-red" : "text-green"}>{money(f.estimate_net)}</b> · gerçekleşen {money(f.paid_net)}{suppliers?.total ? ` · ${suppliers.total} tedarikçi` : ""}</small>
    </section>
  );
}
