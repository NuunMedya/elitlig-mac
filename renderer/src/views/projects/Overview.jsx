// Genel bakış: projenin künyesi ve yaşam döngüsü en üstte — proje kimliği ve
// özet, evre çizelgesi (Fikir → Planlama → Hazırlık → Uygulama → Kapanış) ve
// ölçütleri, tarih şeridi ve geri sayım, büyük kartlar (Tarih & takvim,
// Maliyet, Hedef kitle, Hedefler & KPI, Ekip, Riskler), künyede eksikler ve
// "Proje özeti" (PDF / yazdır). Altında operasyon: OverviewOps.jsx
import React, { useMemo, useState } from "react";
import { Empty, Icon, Spinner } from "../../components/ui";
import { post } from "../../api";
import { RISK_COLORS, RISK_LABELS, RISK_STATUS_LABELS, STAGE_COLORS, countdownText, daysFrom, formatDay, kpiProgress, money, num, shortDay, summaryHtml, targetOf, timeline, timelineLayout } from "../../lib/lifecycleUtils";
import { Avatar, BASE, Progress, ROLE_LABEL, useRun } from "./common";
import BriefEditor, { sectionOf } from "./BriefEditor";
import OverviewOps from "./OverviewOps";
import { useBrief } from "./useLifecycle";
import "./lifecycle.css";
import ExportButton from "../../components/ExportButton";
import { projectBriefReport } from "../../lib/export/reports";

const TAB_OF = { surec: "process", maliyet: "costs", sorular: "questions", ayarlar: "settings", butce: "budget" };

export function LifecycleStepper({ lifecycle, selected, onSelect }) {
  return (
    <ol className="lc-stepper" aria-label="Yaşam döngüsü">
      {lifecycle.stages.map((s) => (
        <li key={s.key} className={`lc-stepper__item is-${s.state} ${selected === s.key ? "is-selected" : ""}`} style={{ "--sc": STAGE_COLORS[s.key] }}>
          <button type="button" onClick={() => onSelect(s.key)} aria-pressed={selected === s.key} aria-label={`${s.label}: ${s.met}/${s.total} ölçüt${s.state === "current" ? " (geçerli evre)" : ""}`}>
            <span className="lc-stepper__ring" style={{ "--v": s.progress }}>{s.state === "past" || s.progress === 100 ? <Icon name="check" size={18} strokeWidth={3} /> : <b>{s.index + 1}</b>}</span>
            <span className="lc-stepper__text"><strong>{s.label}</strong><small>{s.state === "current" ? "Şu an" : s.hint} · {s.met}/{s.total}</small></span>
          </button>
        </li>
      ))}
    </ol>
  );
}

function StagePanel({ stage, lifecycle, canEdit, onToggle, onTarget, onAddCustom, onRemoveCustom, onSetStage }) {
  const [draft, setDraft] = useState("");
  const isCurrent = lifecycle.stage === stage.key;
  const suggested = isCurrent && lifecycle.suggested_stage ? lifecycle.stages.find((s) => s.key === lifecycle.suggested_stage) : null;
  return (
    <div className="lc-stage" style={{ "--sc": STAGE_COLORS[stage.key] }}>
      <header className="lc-stage__head">
        <div><h4>{stage.label} <small>· {stage.hint}</small></h4><Progress value={stage.progress} color={STAGE_COLORS[stage.key]} thin /></div>
        {canEdit && !isCurrent && <button type="button" className="btn btn--sm" onClick={() => onSetStage(stage.key)}>Bu evreye geç</button>}
        {canEdit && suggested && <button type="button" className="btn btn--sm btn--primary" onClick={() => onSetStage(suggested.key)}><Icon name="chevronRight" size={13} /> {suggested.label} evresine geç</button>}
      </header>
      <ul className="lc-criteria">
        {stage.criteria.map((c) => {
          const target = targetOf(c.target);
          return (
            <li key={c.key} className={c.met ? "is-met" : ""}>
              <label className="lc-check"><input type="checkbox" checked={c.met} disabled={!canEdit || (c.auto && !c.custom)} onChange={() => onToggle(c)} aria-label={c.label} /><span>{c.label}</span></label>
              {c.auto && !c.custom && <span className="lc-tag" title="Projenin verisinden kendiliğinden hesaplandı">otomatik</span>}
              {c.manual && !c.auto && !c.custom && <span className="lc-tag is-manual">elle işaretlendi</span>}
              <span className="spacer" />
              {!c.met && target && <button type="button" className="btn btn--xs btn--ghost lc-cta" onClick={() => onTarget(target)}>Tamamla →</button>}
              {c.custom && canEdit && <button type="button" className="icon-btn icon-btn--xs" aria-label={`${c.label} maddesini sil`} onClick={() => onRemoveCustom(c)}><Icon name="trash" size={12} /></button>}
            </li>
          );
        })}
      </ul>
      {canEdit && (
        <form className="lc-stage__add" onSubmit={(e) => { e.preventDefault(); if (draft.trim()) { onAddCustom(stage.key, draft.trim()); setDraft(""); } }}>
          <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={`${stage.label} evresine madde ekle…`} aria-label={`${stage.label} evresine madde ekle`} />
          <button type="submit" className="btn btn--sm" disabled={!draft.trim()}>Ekle</button>
        </form>
      )}
    </div>
  );
}

function TimelineStrip({ brief }) {
  const layout = useMemo(() => timelineLayout(timeline(brief)), [brief]);
  if (!layout.points.length) return null;
  return (
    <div className="lc-timeline" aria-label="Tarih şeridi">
      <div className="lc-timeline__bar">
        {layout.today != null && <span className="lc-timeline__today" style={{ left: `${layout.today}%` }} title="Bugün"><em>Bugün</em></span>}
        {layout.points.map((p) => <span key={p.key} className={`lc-timeline__pt is-${p.kind} ${p.done ? "is-done" : ""}`} style={{ left: `${p.at}%` }} title={`${p.label} · ${shortDay(p.date)}`}><i aria-hidden="true" /></span>)}
      </div>
      <div className="lc-timeline__ends"><span>{shortDay(layout.points[0].date)}</span><span>{layout.points.length} tarih</span><span>{shortDay(layout.points[layout.points.length - 1].date)}</span></div>
    </div>
  );
}

const Card = ({ icon, title, tone, action, missing, children }) => (
  <section className={`card lc-card ${missing ? "is-missing" : ""}`} style={tone ? { "--cc": tone } : undefined}>
    <header className="card__head"><h2 className="card__title"><span className="lc-card__icon"><Icon name={icon} size={15} /></span> {title}</h2>{action}</header>
    {children}
  </section>
);
const Fill = ({ onClick, children = "Tamamla" }) => <button type="button" className="lc-fill" onClick={onClick}><Icon name="plus" size={11} /> {children}</button>;

export default function Overview({ ctx }) {
  const { project, canEdit, actions, people, members } = ctx;
  const brief = useBrief(project.id, { onSaved: () => actions.reload() });
  const run = useRun();
  const [editing, setEditing] = useState(null);
  const [stageKey, setStageKey] = useState(null);
  const view = brief.data;
  const team = useMemo(() => {
    const roles = (project.settings?.roles || []).filter((r) => r.user_id);
    const titleOf = (uid) => roles.filter((r) => Number(r.user_id) === Number(uid)).map((r) => r.name).join(", ");
    return [{ user_id: project.owner_id, role: "owner" }, ...members].map((m) => ({ ...m, name: people[m.user_id]?.name || `#${m.user_id}`, title: titleOf(m.user_id) }));
  }, [project, members, people]);

  if (!view) {
    return (
      <div className="proj-section">
        {brief.loading ? <Spinner /> : brief.error ? <div className="card"><Empty icon="file" title="Künye açılamadı" text={brief.error.status === 404 ? "Künye için sunucu güncellemesi henüz yayında değil." : brief.error.message} /></div> : null}
        <OverviewOps ctx={ctx} />
      </div>
    );
  }

  const b = view.brief;
  const c = view.costs;
  const lc = view.lifecycle;
  const selected = lc.stages.find((s) => s.key === (stageKey || lc.stage)) || lc.stages[0];
  const missingKeys = new Set(view.completeness.missing.map((m) => m.key));
  const isMissing = (...keys) => keys.every((k) => missingKeys.has(k));
  const open = (section) => setEditing(section);
  const goTarget = (t) => (t.type === "brief" ? open(t.key) : ctx.setTab(TAB_OF[t.key] || t.key));
  const save = (body, msg) => brief.save(body, msg);
  const toggle = (crit) => (crit.custom
    ? save({ lifecycle: { custom: b.lifecycle.custom.map((x) => (x.id === crit.key ? { ...x, done: !x.done } : x)) } })
    : save({ lifecycle: { checks: { ...b.lifecycle.checks, [crit.key]: !crit.manual } } }));
  const addCustom = (stage, text) => save({ lifecycle: { custom: [...b.lifecycle.custom, { stage, text, done: false }] } });
  const removeCustom = (crit) => save({ lifecycle: { custom: b.lifecycle.custom.filter((x) => x.id !== crit.key) } });
  const setStage = (key) => { save({ stage: key }, `Evre: ${lc.stages.find((s) => s.key === key)?.label}`); setStageKey(null); };
  const askQuestions = async () => {
    const r = await post(`${BASE}/${project.id}/brief/questions`, {}, { queue: false });
    if (run(r, r.data?.created ? `${r.data.created} künye sorusu açıldı (Sorular sekmesi).` : "Eksik alanların hepsinin zaten bir sorusu var.") && r.data?.created) { actions.reload(); brief.reload({ quiet: true }); }
  };
  const summary = (pdf) => {
    const html = summaryHtml({ project, view, team: team.map((m) => ({ name: m.name, role: m.title || ROLE_LABEL[m.role] })) });
    const title = `${project.name} - Proje ozeti`.replace(/[\\/:*?"<>|]/g, "-");
    if (pdf) window.elitlig.pdf(html, title); else window.elitlig.print(html, title);
  };
  const cd = view.countdown;
  const days = cd ? daysFrom(cd.date) : null;

  return (
    <div className="proj-section lc-overview">
      {brief.offline && <div className="offline-note"><Icon name="cloudOff" size={14} /> Çevrimdışı: künye önbellekten gösteriliyor, değişiklik için bağlantı gerekir.</div>}
      <section className="card lc-hero">
        <div className="lc-hero__main">
          <span className="lc-eyebrow"><Icon name="file" size={12} /> Proje künyesi · <b style={{ color: STAGE_COLORS[lc.stage] }}>{lc.stages.find((s) => s.state === "current")?.label} evresi</b></span>
          {b.summary ? <p className="lc-hero__summary selectable">{b.summary}</p> : <button type="button" className="lc-hero__empty" onClick={() => open("identity")}><Icon name="pencil" size={14} /> Projenin amacını ve özetini yazın — projenin ana hattı buradan başlar.</button>}
          <div className="lc-hero__chips">
            {(b.venue || b.city) && <span><Icon name="map" size={12} /> {[b.venue, b.city].filter(Boolean).join(", ")}</span>}
            {b.expected_count != null && <span><Icon name="users" size={12} /> {num(b.expected_count)} katılımcı</span>}
            {b.expected_teams != null && <span><Icon name="shirt" size={12} /> {num(b.expected_teams)} takım</span>}
            {c.cost.total > 0 && <span><Icon name="wallet" size={12} /> {money(c.cost.total)} maliyet</span>}
          </div>
          <div className="lc-hero__complete"><Progress value={view.completeness.percent} thin /><small>Künye %{view.completeness.percent} dolu{view.completeness.missing.length ? ` · ${view.completeness.missing.length} alan eksik` : " · tamam"}</small></div>
          <div className="row-gap">
            <button type="button" className={`btn btn--sm ${canEdit ? "btn--primary" : ""}`} onClick={() => open("identity")}><Icon name={canEdit ? "pencil" : "eye"} size={13} /> {canEdit ? "Künyeyi düzenle" : "Künyeyi gör"}</button>
            <button type="button" className="btn btn--sm" onClick={() => summary(true)}><Icon name="download" size={13} /> Proje özeti (PDF)</button>
            <button type="button" className="icon-btn" onClick={() => summary(false)} aria-label="Proje özetini yazdır" title="Yazdır"><Icon name="printer" size={15} /></button>
            <ExportButton id="project-brief" title="Proje künyesi" text="" print={false} report={() => projectBriefReport({ project, view, team: team.map((m) => ({ name: m.name, role: m.title || ROLE_LABEL[m.role] })) })} />
          </div>
        </div>
        <div className={`lc-hero__count ${days != null && days < 0 ? "is-past" : ""}`} aria-label="Geri sayım">
          {cd ? (<>
            <strong>{days > 0 ? days : days === 0 ? "Bugün" : Math.abs(days)}</strong>
            <span>{days > 0 ? `gün · ${cd.label.toLocaleLowerCase("tr-TR")} gününe` : days === 0 ? cd.label : `gün önce · ${cd.label.toLocaleLowerCase("tr-TR")}`}</span>
            <small>{formatDay(cd.date)}</small>
          </>) : <button type="button" className="lc-hero__nodate" onClick={() => open("dates")}><Icon name="calendar" size={14} /> Tarih belirleyin</button>}
        </div>
      </section>

      <section className="card lc-lifecycle">
        <header className="card__head"><h2 className="card__title"><Icon name="flag" /> Yaşam döngüsü</h2><span className="muted small">Genel ilerleme %{lc.progress}</span></header>
        <LifecycleStepper lifecycle={lc} selected={selected.key} onSelect={setStageKey} />
        <StagePanel stage={selected} lifecycle={lc} canEdit={canEdit} onToggle={toggle} onTarget={goTarget} onAddCustom={addCustom} onRemoveCustom={removeCustom} onSetStage={setStage} />
      </section>

      <div className="lc-cards">
        <Card icon="calendar" title="Tarih & takvim" tone="#2563eb" missing={isMissing("start_date", "end_date", "event_date")} action={<button type="button" className="link-btn" onClick={() => open("dates")}>{canEdit ? "Düzenle" : "Ayrıntı"}</button>}>
          <TimelineStrip brief={b} />
          <dl className="lc-dl">
            <div><dt>Başlangıç</dt><dd>{b.start_date ? formatDay(b.start_date) : <Fill onClick={() => open("dates")} />}</dd></div>
            <div><dt>Etkinlik</dt><dd>{b.event_date ? <>{formatDay(b.event_date)} <em>{countdownText(daysFrom(b.event_date))}</em></> : <Fill onClick={() => open("dates")} />}</dd></div>
            <div><dt>Bitiş</dt><dd>{b.end_date ? formatDay(b.end_date) : <Fill onClick={() => open("dates")} />}</dd></div>
          </dl>
          {b.key_dates.length > 0 && <ul className="lc-keydates">{b.key_dates.slice(0, 5).map((k) => <li key={k.id} className={k.done ? "is-done" : ""}><span>{k.date ? shortDay(k.date) : "—"}</span> {k.label}</li>)}</ul>}
        </Card>

        <Card icon="wallet" title="Maliyet" tone="#d97706" missing={!c.count.cost} action={<button type="button" className="link-btn" onClick={() => ctx.setTab("costs")}>Maliyet hesabı →</button>}>
          {!c.count.cost && !c.count.revenue ? (
            <div className="lc-cardempty"><p>Henüz maliyet kalemi yok. Kalem bazlı hesapla planlanan ve gerçekleşen maliyeti, katılımcı başı maliyeti ve başabaş noktasını görün.</p><Fill onClick={() => ctx.setTab("costs")}>Maliyet hesabını başlat</Fill></div>
          ) : (<>
            <div className="lc-money">
              <div><small>Planlanan</small><b>{money(c.cost.total)}</b></div>
              <div><small>Gerçekleşen</small><b>{money(c.actual.cost)}</b></div>
              <div><small>Kalan ödeme</small><b>{money(c.remaining_to_pay)}</b></div>
            </div>
            {c.budget.limit != null && (
              <div className="lc-budgetbar">
                <Progress value={Math.min(100, c.budget.used_pct || 0)} color={c.budget.used_pct > 100 ? "#dc2626" : c.budget.used_pct > 85 ? "#d97706" : "#16a34a"} />
                <small>Bütçe tavanı {money(c.budget.limit)} · {c.budget.left >= 0 ? `${money(c.budget.left)} pay kaldı` : <b className="text-red">{money(-c.budget.left)} aşım</b>}</small>
              </div>
            )}
            <dl className="lc-dl lc-dl--row">
              <div><dt>Katılımcı başı</dt><dd>{c.per_participant != null ? money(c.per_participant) : "—"}</dd></div>
              <div><dt>Takım başı</dt><dd>{c.per_team != null ? money(c.per_team) : "—"}</dd></div>
              <div><dt>Planlanan gelir</dt><dd>{money(c.revenue.total)}</dd></div>
              <div><dt>Kâr / zarar</dt><dd className={c.profit < 0 ? "text-red" : "text-green"}>{money(c.profit)}</dd></div>
            </dl>
          </>)}
        </Card>

        <Card icon="users" title="Hedef kitle" tone="#0891b2" missing={isMissing("audience")} action={<button type="button" className="link-btn" onClick={() => open("audience")}>{canEdit ? "Düzenle" : "Ayrıntı"}</button>}>
          {b.audience ? <p className="lc-text selectable">{b.audience}</p> : <Fill onClick={() => open("audience")}>Hedef kitleyi tanımlayın</Fill>}
          {b.segments.length > 0 && <div className="row-gap">{b.segments.map((s) => <span key={s} className="chip">{s}</span>)}</div>}
          <dl className="lc-dl lc-dl--row">
            <div><dt>Yaş</dt><dd>{b.age_min != null || b.age_max != null ? `${b.age_min ?? "…"}–${b.age_max ?? "…"}` : "—"}</dd></div>
            <div><dt>Katılımcı</dt><dd>{b.expected_count != null ? num(b.expected_count) : "—"}</dd></div>
            <div><dt>Takım</dt><dd>{b.expected_teams != null ? num(b.expected_teams) : "—"}</dd></div>
          </dl>
        </Card>

        <Card icon="target" title="Hedefler & KPI" tone="#7c3aed" missing={isMissing("kpis", "success_criteria")} action={<button type="button" className="link-btn" onClick={() => open("goals")}>{canEdit ? "Düzenle" : "Ayrıntı"}</button>}>
          {!b.kpis.length ? <Fill onClick={() => open("goals")}>Ölçülebilir hedef ekleyin</Fill> : (
            <ul className="lc-kpis">{b.kpis.map((k) => <li key={k.id}><span className="lc-kpis__name">{k.name}</span><span className="lc-kpis__val">{k.actual != null ? num(k.actual) : "—"} / {k.target != null ? num(k.target) : "—"} {k.unit || ""}</span><Progress value={kpiProgress(k)} thin /></li>)}</ul>
          )}
          {b.success_criteria.length > 0 && <ul className="lc-bullets">{b.success_criteria.map((s) => <li key={s}><Icon name="check" size={12} strokeWidth={2.6} /> {s}</li>)}</ul>}
          {(b.revenue_target != null || b.sponsorship_target != null) && (
            <dl className="lc-dl lc-dl--row">
              {b.revenue_target != null && <div><dt>Gelir hedefi</dt><dd>{money(b.revenue_target)}</dd></div>}
              {b.sponsorship_target != null && <div><dt>Sponsorluk hedefi</dt><dd>{money(b.sponsorship_target)}</dd></div>}
              {c.budget.revenue_gap != null && <div><dt>Hedefe kalan</dt><dd className={c.budget.revenue_gap > 0 ? "text-amber" : "text-green"}>{money(Math.max(0, c.budget.revenue_gap))}</dd></div>}
            </dl>
          )}
        </Card>

        <Card icon="team" title="Ekip" tone="#16a34a" action={<button type="button" className="link-btn" onClick={() => open("team")}>Paydaşlar</button>}>
          <ul className="lc-team">{team.map((m) => <li key={m.user_id}><Avatar name={m.name} size={28} /><span><b>{m.name}</b><small>{m.title || ROLE_LABEL[m.role]}</small></span></li>)}</ul>
          {b.stakeholders.length > 0 && (<><h4 className="lc-subhead">Paydaşlar</h4><ul className="lc-bullets">{b.stakeholders.map((p) => <li key={p.id}><Icon name="handshake" size={12} /> <b>{p.name}</b>{p.role ? ` · ${p.role}` : ""}</li>)}</ul></>)}
          {team.length === 1 && canEdit && <Fill onClick={() => ctx.setTab("settings")}>Ekibe üye ekleyin</Fill>}
        </Card>

        <Card icon="alert" title="Riskler" tone="#dc2626" missing={isMissing("risks")} action={<button type="button" className="link-btn" onClick={() => open("risks")}>{canEdit ? "Düzenle" : "Ayrıntı"}</button>}>
          {!b.risks.length ? <Fill onClick={() => open("risks")}>Riskleri değerlendirin</Fill> : (
            <ul className="lc-risks">{b.risks.map((r) => <li key={r.id} style={{ "--rc": RISK_COLORS[r.level] }} className={r.status === "closed" ? "is-closed" : ""}><span className="lc-risks__lvl">{RISK_LABELS[r.level]}</span><span><b>{r.title}</b>{r.mitigation && <small>Önlem: {r.mitigation}</small>}</span><em>{RISK_STATUS_LABELS[r.status]}</em></li>)}</ul>
          )}
        </Card>
      </div>

      {(view.completeness.missing.length > 0 || view.notes.length > 0) && (
        <div className="lc-grid2">
          {view.completeness.missing.length > 0 && (
            <section className="card lc-missing">
              <header className="card__head"><h2 className="card__title"><Icon name="checkSquare" /> Künyede eksikler <span className="pill pill--amber">{view.completeness.missing.length}</span></h2>{canEdit && <button type="button" className="btn btn--sm" onClick={askQuestions} title="Sorusu olmayan eksik alanlar için Sorular sekmesine soru açar">Ekibe soru olarak sor</button>}</header>
              <ul className="lc-todo">
                {view.completeness.missing.map((m) => (
                  <li key={m.key}>
                    <span>{m.label}</span><span className="spacer" />
                    {m.question_id && <button type="button" className="link-btn small" onClick={() => ctx.setTab("questions", { question: m.question_id })}>Soru</button>}
                    <button type="button" className="btn btn--xs" onClick={() => open(sectionOf(m.key))}>Tamamla</button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {view.notes.length > 0 && (
            <section className="card">
              <header className="card__head"><h2 className="card__title"><Icon name="note" /> Künye notları</h2></header>
              <ul className="lc-notes">{view.notes.map((n) => <li key={n.question_id}><button type="button" className="link-btn" onClick={() => ctx.setTab("questions", { question: n.question_id })}>{n.question}</button><p className="selectable">{n.answer}</p></li>)}</ul>
            </section>
          )}
        </div>
      )}

      <h3 className="lc-sectiontitle"><span className="lc-dot" /> Operasyon</h3>
      <OverviewOps ctx={ctx} />

      {editing && <BriefEditor ctx={ctx} view={view} initialSection={editing} onClose={() => setEditing(null)} onSave={(body) => save(body, "Künye kaydedildi.")} />}
    </div>
  );
}
