// Tek proje: başlık, sekmeler, adım ve kişi çekmeceleri, adım içinde açılan araçlar.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ErrorNote, Icon, MenuButton, Modal, OfflineNote, Spinner } from "../../components/ui";
import { useCommand } from "../../api";
import { kindSettings, leadStats, leadsOfKind, leadsToRows, PROJECT_STATUS_TONE, stepStats, stepsToRows } from "../../lib/projectUtils";
import { ProjectBadge, Progress, ROLE_LABEL, TOOL_ICONS, label, saveRowsCsv, saveRowsXlsx, useProject } from "./common";
import Overview from "./Overview";
import Process from "./Process";
import StepDrawer from "./StepDrawer";
import Leads from "./Leads";
import LeadPanel from "./LeadPanel";
import Questions from "./Questions";
import Activity from "./Activity";
import { ProjectPortfolio } from "./Portfolio";
import Settings from "./Settings";
import Budget from "./Budget";
import Costs from "./Costs";
import Feed from "./Feed";
import "./lifecycle.css";
import ExportButton from "../../components/ExportButton";
import { projectReport } from "../../lib/export/reports";
import { useFeedUnread } from "./useLifecycle";
import ProposalsTab from "./proposals/Proposals";
import SponsorshipTab from "./proposals/Sponsorship";

const TABS = [
  { key: "overview", label: "Genel bakış", icon: "overview" },
  { key: "process", label: "Süreç", icon: "list" },
  { key: "leads", label: "Kişiler", icon: "users" },
  { key: "budget", label: "Bütçe", icon: "wallet" },
  { key: "costs", label: "Maliyet", icon: "calculator" },
  { key: "feed", label: "Akış", icon: "message" },
  { key: "questions", label: "Sorular", icon: "help" },
  { key: "activity", label: "İletişim", icon: "activity" },
  { key: "portfolio", label: "Portföy", icon: "briefcase" },
  { key: "proposals", label: "Teklifler", icon: "file" },
  { key: "sponsorship", label: "Sponsorluk", icon: "award" },
  { key: "settings", label: "Ayarlar", icon: "sliders" },
];

export default function ProjectView({ id, route, setRoute, onBack, go, auth }) {
  const me = auth.user?.id;
  const project = useProject(id, me);
  const { data, actions } = project;
  const tab = TABS.some((t) => t.key === route.tab) ? route.tab : "overview";
  const [stepId, setStepId] = useState(route.step || null);
  const [leadId, setLeadId] = useState(route.lead || null);
  const [toolPanel, setToolPanel] = useState(null); // { tool, step }
  const feedUnread = useFeedUnread(id, { active: tab === "feed" });
  useEffect(() => { setStepId(route.step || null); setLeadId(route.lead || null); }, [route.nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  const setTab = useCallback((key, extra = {}) => setRoute((r) => ({ id: r.id, nonce: r.nonce, tab: key, ...extra })), [setRoute]);
  const openStep = useCallback((sid) => { setLeadId(null); setStepId(sid); }, []);
  const openLead = useCallback((lid) => { setStepId(null); setLeadId(lid); }, []);

  const item = data?.item;
  const ctx = useMemo(() => {
    if (!data) return null;
    const settings = item.settings;
    return {
      project: item, settings, meta: data.meta, phases: data.phases, steps: data.steps, leads: data.leads, questions: data.questions,
      activities: data.activities, portfolio: data.portfolio, members: data.members, people: data.people || {},
      stats: {
        steps: stepStats(data.steps, data.meta.step_statuses),
        leads: leadStats(leadsOfKind(data.leads, "customer"), settings),
        suppliers: leadStats(leadsOfKind(data.leads, "supplier"), kindSettings(settings, "supplier")),
        open_questions: data.questions.filter((q) => q.status === "open").length,
      },
      canEdit: Boolean(item.access?.can_edit), isOwner: Boolean(item.access?.is_owner), me, actions,
      openStep, openLead, setTab, go,
      openTool: (tool, step) => {
        if (["leads", "suppliers", "finance", "questions", "portfolio", "activity"].includes(tool)) setToolPanel({ tool, step });
        else if (tool === "accounting") go("ledger");
        else if (tool) go(tool);
      },
    };
  }, [data, item, me, actions, openStep, openLead, setTab, go]);

  const exportSteps = (fmt) => {
    const rows = stepsToRows({ phases: data.phases, steps: data.steps, people: data.people, meta: data.meta });
    const name = `${item.name}-Surec`.replace(/[\\/:*?"<>|]/g, "-");
    return fmt === "csv" ? saveRowsCsv(name, rows) : saveRowsXlsx(name, rows, "Süreç", { A: 180, B: 320, C: 200, I: 260, J: 260 });
  };
  const exportLeads = (fmt) => {
    const rows = leadsToRows({ leads: data.leads, settings: item.settings });
    const name = `${item.name}-Kisiler`.replace(/[\\/:*?"<>|]/g, "-");
    return fmt === "csv" ? saveRowsCsv(name, rows) : saveRowsXlsx(name, rows, "Kişiler", { A: 180, B: 180, D: 130, E: 180, J: 200, N: 260 });
  };
  useCommand("export", () => { if (data) (tab === "leads" ? exportLeads : exportSteps)("xlsx"); });

  if (!data) {
    return (
      <div className="view">
        <button type="button" className="link-btn back-link" onClick={() => onBack()}><Icon name="chevronLeft" size={14} /> Projeler</button>
        {project.loading ? <Spinner /> : <ErrorNote error={project.error || { message: "Proje bulunamadı." }} onRetry={project.reload} />}
      </div>
    );
  }

  const st = ctx.stats.steps;
  const step = stepId ? data.steps.find((s) => String(s.id) === String(stepId)) : null;
  const lead = leadId ? data.leads.find((l) => String(l.id) === String(leadId)) : null;
  const tone = PROJECT_STATUS_TONE[item.status];
  const counts = {
    process: `${st.done}/${st.total - st.skipped}`, leads: data.leads.length || null, questions: ctx.stats.open_questions || null,
    portfolio: data.portfolio.length || null,
  };
  counts.feed = feedUnread || null;

  return (
    <div className="view view--project" style={{ "--pc": item.color }}>
      <div className="proj-main">
        <button type="button" className="link-btn back-link" onClick={() => onBack()}><Icon name="chevronLeft" size={14} /> Projeler</button>
        <header className="proj-head">
          <ProjectBadge project={item} size={50} />
          <div className="proj-head__text">
            <h1>{item.name}</h1>
            <p>
              <span className={`pill ${tone ? `pill--${tone}` : ""}`}>{label(data.meta.project_statuses, item.status)}</span>
              {item.archived && <span className="pill"><Icon name="archive" size={10} /> Arşivde</span>}
              {(item.start_date || item.end_date) && <span><Icon name="calendar" size={12} /> {[item.start_date, item.end_date].filter(Boolean).map((d) => new Date(`${d}T12:00:00`).toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric" })).join(" – ")}</span>}
              <span><Icon name="user" size={12} /> {item.owner_name}{data.members.length ? ` + ${data.members.length} üye` : ""}</span>
              {!ctx.canEdit && <span className="pill pill--amber"><Icon name="eye" size={10} /> {ROLE_LABEL.viewer} · yalnız görüntüleme</span>}
            </p>
          </div>
          <div className="proj-head__progress">
            <strong>%{st.progress}</strong>
            <Progress value={st.progress} color={item.color} />
            <small>{st.done}/{st.total - st.skipped} adım{st.overdue ? <> · <b className="text-red">{st.overdue} geciken</b></> : ""}</small>
          </div>
          <ExportButton id="project" title={item.name} text=""
            report={() => projectReport({
              project: item, statusLabel: label(data.meta.project_statuses, item.status), people: data.people || {},
              stepRows: stepsToRows({ phases: data.phases, steps: data.steps, people: data.people, meta: data.meta }),
              leadRows: leadsToRows({ leads: data.leads, settings: item.settings }),
              questions: data.questions, portfolio: data.portfolio, activities: data.activities || [],
              portfolioStatus: (k) => ({ active: "Aktif", passive: "Pasif", renewal: "Yenilenecek" }[k] || k),
            })}
            extraItems={[
            { label: "Adımlar — Excel (.xlsx)", icon: "grid", onClick: () => exportSteps("xlsx") },
            { label: "Adımlar — CSV", icon: "download", onClick: () => exportSteps("csv") },
            "-",
            { label: "Kişiler — Excel (.xlsx)", icon: "grid", onClick: () => exportLeads("xlsx") },
            { label: "Kişiler — CSV", icon: "download", onClick: () => exportLeads("csv") },
          ]} />
        </header>
        <nav className="proj-tabs" role="tablist" aria-label="Proje bölümleri" onWheel={(e) => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && e.currentTarget.scrollWidth > e.currentTarget.clientWidth) e.currentTarget.scrollLeft += e.deltaY; }}>
          {TABS.map((t) => (
            <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className={tab === t.key ? "is-active" : ""} onClick={(e) => { setTab(t.key); e.currentTarget.scrollIntoView({ block: "nearest", inline: "nearest" }); }}>
              <Icon name={t.icon} size={14} /> {t.label}{counts[t.key] ? <span className="proj-tabs__count">{counts[t.key]}</span> : null}
            </button>
          ))}
        </nav>
        <OfflineNote offline={project.offline} savedAt={project.savedAt} />
        <div className="proj-body" key={tab}>
          {tab === "overview" && <Overview ctx={ctx} />}
          {tab === "process" && <Process ctx={ctx} selectedId={stepId} focusPhase={route.phase} initialFilter={route.processFilter} />}
          {tab === "leads" && <Leads ctx={ctx} selectedId={leadId} initialFilter={route.leadFilter} initialKind={route.kind} />}
          {tab === "budget" && <Budget ctx={ctx} />}
          {tab === "costs" && <Costs ctx={ctx} />}
          {tab === "feed" && <Feed ctx={ctx} />}
          {tab === "questions" && <Questions ctx={ctx} highlight={route.question} />}
          {tab === "activity" && <Activity ctx={ctx} />}
          {tab === "portfolio" && <ProjectPortfolio ctx={ctx} />}
          {tab === "proposals" && <ProposalsTab ctx={ctx} />}
          {tab === "sponsorship" && <SponsorshipTab ctx={ctx} />}
          {tab === "settings" && <Settings ctx={ctx} onDeleted={() => onBack()} openProject={(pid) => setRoute({ id: pid, tab: "overview", nonce: Date.now() })} />}
        </div>
      </div>
      {step && <StepDrawer key={step.id} ctx={ctx} step={step} onClose={() => setStepId(null)} />}
      {lead && !step && (
        <aside className="split__side drawer proj-drawer">
          <LeadPanel key={lead.id} ctx={ctx} lead={lead} onClose={() => setLeadId(null)} />
        </aside>
      )}
      {toolPanel && <ToolPanel ctx={ctx} {...toolPanel} onClose={() => setToolPanel(null)} />}
    </div>
  );
}

const PANEL_TITLES = { leads: "Kişiler / CRM", suppliers: "Tedarik görüşmeleri", finance: "Bütçe / gelir-gider", questions: "Soru-cevap", portfolio: "Portföy", activity: "İletişim geçmişi" };
const PANEL_TABS = { leads: "leads", suppliers: "leads", finance: "budget", questions: "questions", portfolio: "portfolio", activity: "activity" };

/** Adımın aracı, adımdan çıkmadan büyük bir pencerede açılır. */
function ToolPanel({ ctx, tool, step, onClose }) {
  const stages = tool === "suppliers" ? ctx.settings.supplier_stages : ctx.settings.lead_stages;
  const stage = ["leads", "suppliers"].includes(tool) && step?.tool_ref ? (stages || []).find((s) => s.key === step.tool_ref) : null;
  return (
    <Modal title={`${PANEL_TITLES[tool]}${step ? ` · ${step.title}` : ""}`} onClose={onClose} width={1180} className="modal--tool"
      footer={<>
        <span className="muted small spacer"><Icon name={TOOL_ICONS[tool]} size={12} /> Adımdan çıkmadan çalışıyorsunuz{stage ? ` · “${stage.label}” aşamasına süzüldü` : ""}. Değişiklikler projeye anında yazılır.</span>
        <button type="button" className="btn" onClick={() => { onClose(); ctx.setTab(PANEL_TABS[tool], tool === "suppliers" ? { kind: "supplier" } : tool === "leads" ? { kind: "customer" } : {}); }}><Icon name="external" size={13} /> Sekmede aç</button>
        <button type="button" className="btn btn--primary" onClick={onClose}>Adıma dön</button>
      </>}>
      {tool === "leads" && <Leads ctx={ctx} embedded initialFilter={step?.tool_ref ? { stage: step.tool_ref } : undefined} step={step} />}
      {tool === "suppliers" && <Leads ctx={ctx} embedded initialKind="supplier" initialFilter={step?.tool_ref ? { stage: step.tool_ref } : undefined} step={step} />}
      {tool === "finance" && <Budget ctx={ctx} embedded step={step} />}
      {tool === "questions" && <Questions ctx={ctx} embedded step={step} />}
      {tool === "portfolio" && <ProjectPortfolio ctx={ctx} embedded />}
      {tool === "activity" && <Activity ctx={ctx} embedded step={step} />}
    </Modal>
  );
}
