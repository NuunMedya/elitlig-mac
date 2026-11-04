// Projeler ana sayfası: proje kartları, Takip ve genel Portföy.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Empty, ErrorNote, Icon, MenuButton, OfflineNote, Segmented, Spinner, ViewHeader } from "../../components/ui";
import { useCommand, useResource } from "../../api";
import { dueLabel, formatWhen, groupFollowups, PROJECT_STATUS_TONE } from "../../lib/projectUtils";
import { includesTr } from "../../lib/helpers";
import { Avatar, BASE, ProjectBadge, Progress, ROLE_LABEL, label, money } from "./common";
import NewProject from "./NewProject";
import { GlobalPortfolio } from "./Portfolio";

export default function Home({ section, newProject, nonce, onSection, onOpen, go, auth }) {
  const [archived, setArchived] = useState("0");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [creating, setCreating] = useState(Boolean(newProject));
  const list = useResource(BASE, { archived });
  const follow = useResource(`${BASE}/followups`, { days: 7 });
  const searchRef = useRef(null);
  useEffect(() => { if (newProject) setCreating(true); }, [newProject, nonce]);
  useCommand("new", () => setCreating(true));
  useCommand("find", () => searchRef.current?.focus());

  const items = useMemo(() => list.data?.items || [], [list.data]);
  const meta = list.data?.meta || {};
  const shown = items.filter((p) => (!status || p.status === status) && (!q || includesTr(`${p.name} ${p.description} ${p.owner_name}`, q)));
  const fu = useMemo(() => groupFollowups(follow.data), [follow.data]);
  const dueCount = fu.overdueLeads.length + fu.todayLeads.length + fu.overdueSteps.length;
  const totals = items.reduce((t, p) => ({ steps: t.steps + p.stats.steps.total, done: t.done + p.stats.steps.done, leads: t.leads + p.stats.leads.total, due: t.due + p.stats.leads.due }), { steps: 0, done: 0, leads: 0, due: 0 });

  const sections = [
    { key: "projects", label: "Projeler", icon: "layers", hint: items.length ? `${items.length} proje · ${totals.done}/${totals.steps} adım` : "Süreçler ve şablonlar" },
    { key: "followups", label: "Takip", icon: "bell", hint: dueCount ? `${fu.todayLeads.length + fu.overdueLeads.length} arama · ${fu.overdueSteps.length} geciken adım` : "Bugün aranacaklar, adımlarım" },
    { key: "portfolio", label: "Portföy", icon: "briefcase", hint: "Satışı kapananlar" },
  ];

  return (
    <div className="view view--projects">
      <ViewHeader icon="layers" title="Projeler" subtitle="Süreçlerinizi adım adım yönetin: sorumlular, sonuçlar, aranan kişiler, sorular ve portföy tek yerde.">
        <button type="button" className="btn btn--primary" onClick={() => setCreating(true)}><Icon name="plus" /> Yeni proje</button>
      </ViewHeader>
      <nav className="acc-tabs" aria-label="Projeler bölümleri">
        {sections.map((s) => (
          <button key={s.key} type="button" className={section === s.key ? "is-active" : ""} onClick={() => onSection(s.key)}>
            <span className="acc-tabs__icon"><Icon name={s.icon} size={17} strokeWidth={2} /></span>
            <span><strong>{s.label}{s.key === "followups" && dueCount > 0 && <em className="tab-count is-alert">{dueCount}</em>}</strong><small>{s.hint}</small></span>
          </button>
        ))}
      </nav>
      <OfflineNote offline={list.offline || follow.offline} savedAt={list.savedAt || follow.savedAt} />

      {section === "projects" && (<>
        <div className="filters">
          <div className="search-box"><Icon name="search" size={14} /><input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Projelerde ara" /></div>
          <select className="select-sm" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Durum">
            <option value="">Tüm durumlar</option>
            {(meta.project_statuses || []).map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <span className="spacer" />
          <Segmented size="sm" value={archived} onChange={setArchived} options={[{ value: "0", label: "Etkin" }, { value: "1", label: "Arşiv", icon: "archive" }]} />
        </div>
        {dueCount > 0 && archived === "0" && (
          <button type="button" className="follow-banner" onClick={() => onSection("followups")}>
            <span className="follow-banner__icon"><Icon name="bell" size={16} /></span>
            <span><strong>Bugün takipte {fu.todayLeads.length + fu.overdueLeads.length} kişi</strong>{fu.overdueLeads.length > 0 && <> · <b className="text-red">{fu.overdueLeads.length} gecikmiş arama</b></>}{fu.overdueSteps.length > 0 && <> · {fu.overdueSteps.length} geciken adım</>}</span>
            <span className="link-btn">Takibe git →</span>
          </button>
        )}
        <ErrorNote error={list.error && !list.data ? list.error : null} onRetry={list.reload} />
        {list.loading && !list.data ? <Spinner /> : (
          <div className="proj-grid">
            {shown.map((p) => <ProjectCard key={p.id} p={p} meta={meta} onOpen={(extra) => onOpen(p.id, extra)} onOpenStep={(stepId) => onOpen(p.id, { tab: "process", step: stepId })} onOpenLeads={() => onOpen(p.id, { tab: "leads", kind: "customer", leadFilter: { due: "due" } })} />)}
            {archived === "0" && !q && !status && (
              <button type="button" className="proj-card proj-card--new" onClick={() => setCreating(true)}>
                <span className="proj-card__plus"><Icon name="plus" size={22} /></span>
                <strong>Yeni proje</strong>
                <small>Organizasyon sezonu şablonuyla 19 aşama ve 208 adım hazır gelir.</small>
              </button>
            )}
            {!shown.length && (q || status || archived === "1") && <Empty icon="layers" title={archived === "1" ? "Arşivde proje yok" : "Eşleşen proje yok"} text="Süzgeçleri değiştirip yeniden deneyin." />}
          </div>
        )}
      </>)}

      {section === "followups" && <Followups res={follow} fu={fu} onOpen={onOpen} />}
      {section === "portfolio" && <GlobalPortfolio projects={items} onOpenProject={(id) => onOpen(id, { tab: "portfolio" })} />}

      {creating && <NewProject meta={meta} onClose={() => setCreating(false)} onCreated={(item) => { setCreating(false); list.reload({ quiet: true }); onOpen(item.id); }} />}
    </div>
  );
}

function ProjectCard({ p, meta, onOpen, onOpenStep, onOpenLeads }) {
  const s = p.stats;
  const tone = PROJECT_STATUS_TONE[p.status];
  return (
    <article className="proj-card" style={{ "--pc": p.color }} onClick={() => onOpen()} onKeyDown={(e) => { if (e.key === "Enter" && e.target === e.currentTarget) onOpen(); }} tabIndex={0} role="button" aria-label={p.name}>
      <header className="proj-card__head">
        <ProjectBadge project={p} size={42} />
        <div>
          <strong>{p.name}</strong>
          <small>{[label(meta.project_statuses, p.status), p.end_date ? `bitiş ${new Date(`${p.end_date}T12:00:00`).toLocaleDateString("tr-TR", { day: "numeric", month: "short" })}` : null].filter(Boolean).join(" · ")}</small>
        </div>
        <span className={`pill ${tone ? `pill--${tone}` : ""}`}>{label(meta.project_statuses, p.status)}</span>
        <MenuButton label="Proje kısayolları" items={[
          { label: "Süreç", icon: "list", onClick: () => onOpen({ tab: "process" }) },
          { label: "Müşteri görüşmeleri", icon: "users", onClick: () => onOpen({ tab: "leads", kind: "customer" }) },
          { label: "Tedarik görüşmeleri", icon: "handshake", onClick: () => onOpen({ tab: "leads", kind: "supplier" }) },
          { label: "Bütçe", icon: "wallet", onClick: () => onOpen({ tab: "budget" }) },
          { label: "Portföy", icon: "briefcase", onClick: () => onOpen({ tab: "portfolio" }) },
          "-",
          { label: "Ayarlar", icon: "sliders", onClick: () => onOpen({ tab: "settings" }) },
        ]} />
      </header>
      {p.description && <p className="proj-card__desc">{p.description}</p>}
      <div className="proj-card__progress">
        <div><strong>%{s.steps.progress}</strong><span>{s.steps.done}/{s.steps.total - s.steps.skipped} adım tamamlandı</span></div>
        <Progress value={s.steps.progress} color={p.color} />
      </div>
      <div className="proj-card__stats">
        <span className={s.steps.overdue ? "is-alert" : ""} title="Geciken adım"><Icon name="clock" size={12} /> {s.steps.overdue} geciken</span>
        <span title="Açık soru"><Icon name="help" size={12} /> {s.open_questions} soru</span>
        <button type="button" className={s.leads.due ? "is-warn" : ""} title="Bugün aranacak / gecikmiş" onClick={(e) => { e.stopPropagation(); onOpenLeads(); }}><Icon name="phone" size={12} /> {s.leads.due} aranacak</button>
        <span title="Portföy"><Icon name="briefcase" size={12} /> {s.portfolio} portföy</span>
        {s.finance && (s.finance.estimate_income || s.finance.estimate_expense) ? <button type="button" title="Tahmini net bütçe" className={s.finance.estimate_net < 0 ? "is-alert" : ""} onClick={(e) => { e.stopPropagation(); onOpen({ tab: "budget" }); }}><Icon name="wallet" size={12} /> {money(s.finance.estimate_net)}</button> : null}
      </div>
      {s.next_due && (
        <button type="button" className={`proj-card__next ${s.next_due.overdue ? "is-late" : ""}`} onClick={(e) => { e.stopPropagation(); onOpenStep(s.next_due.id); }}>
          <span>Sıradaki</span><strong>{s.next_due.title}</strong><em>{dueLabel(s.next_due.due_date)}</em>
        </button>
      )}
      <footer className="proj-card__foot">
        <Avatar name={p.owner_name || "?"} size={22} />
        <span>{p.owner_name}{p.member_count ? ` + ${p.member_count} üye` : ""}</span>
        {s.mine > 0 && <span className="pill pill--tool pill--xs">{s.mine} adım bende</span>}
        <span className="spacer" />
        <span className="pill pill--xs">{ROLE_LABEL[p.access?.role]}</span>
      </footer>
    </article>
  );
}

function Followups({ res, fu, onOpen }) {
  if (res.loading && !res.data) return <Spinner />;
  if (res.error && !res.data) return <ErrorNote error={res.error} onRetry={res.reload} />;
  const leads = [...fu.overdueLeads, ...fu.todayLeads, ...fu.upcomingLeads];
  const steps = [...fu.overdueSteps, ...fu.steps];
  return (
    <div className="follow-grid">
      <section className={`card ${fu.overdueLeads.length ? "due-col--alert" : ""}`}>
        <header className="card__head"><h2 className="card__title"><Icon name="phone" /> Aranacaklar</h2><span className="muted small">7 gün içinde · {leads.length}</span></header>
        {leads.length ? leads.map((l) => {
          const late = fu.overdueLeads.includes(l);
          return (
            <button key={`l${l.id}`} type="button" className="fu-row" onClick={() => onOpen(l.project_id, { tab: "leads", lead: l.id })}>
              <span className="fu-row__bar" style={{ background: l.project_color }} />
              <span className="fu-row__main"><strong>{l.name}{l.company && l.company !== l.name ? <small> · {l.company}</small> : null}</strong><small>{l.project_name} · {l.stage_label}{l.next_action ? ` · ${l.next_action}` : ""}</small></span>
              <span className={`fu-row__when ${late ? "text-red" : ""}`}>{late ? "Gecikti" : formatWhen(l.next_action_at).split(" ")[0]}<small>{new Date(l.next_action_at).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}</small></span>
            </button>
          );
        }) : <Empty icon="phone" title="Aranacak kimse yok" text="Görüşme sonucu girdiğinizde sonraki arama tarihi kendiliğinden buraya düşer." />}
      </section>
      <section className="card">
        <header className="card__head"><h2 className="card__title"><Icon name="checkSquare" /> Adımlarım ve yaklaşanlar</h2><span className="muted small">{steps.length}</span></header>
        {steps.length ? steps.slice(0, 60).map((s) => (
          <button key={`s${s.id}`} type="button" className="fu-row" onClick={() => onOpen(s.project_id, { tab: "process", step: s.id })}>
            <span className="fu-row__bar" style={{ background: s.project_color }} />
            <span className="fu-row__main"><strong>{s.title}</strong><small>{s.project_name}{s.responsible?.length ? ` · ${s.responsible.join(", ")}` : ""}</small></span>
            <span className={`fu-row__when ${fu.overdueSteps.includes(s) ? "text-red" : ""}`}>{s.due_date ? dueLabel(s.due_date) : "Tarihsiz"}</span>
          </button>
        )) : <Empty icon="checkSquare" title="Bekleyen adım yok" text="Size atanan ya da 7 gün içinde biten adımlar burada görünür." />}
      </section>
      <section className="card">
        <header className="card__head"><h2 className="card__title"><Icon name="help" /> Açık sorular</h2><span className="muted small">{fu.questions.length}</span></header>
        {fu.questions.length ? fu.questions.slice(0, 60).map((q) => (
          <button key={`q${q.id}`} type="button" className="fu-row" onClick={() => onOpen(q.project_id, { tab: "questions", question: q.id })}>
            <span className="fu-row__bar" style={{ background: q.project_color }} />
            <span className="fu-row__main"><strong>{q.question}</strong><small>{q.project_name}{q.category ? ` · ${q.category}` : ""}</small></span>
            {q.due_date && <span className="fu-row__when">{dueLabel(q.due_date)}</span>}
          </button>
        )) : <Empty icon="help" title="Açık soru yok" text="İhtiyaçlar ve müşteri soruları cevaplanınca listeden düşer." />}
      </section>
    </div>
  );
}
