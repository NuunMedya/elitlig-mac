// Adım ayrıntısı: her alan düzenlenir; adımın aracı ("Aracı aç") adımın içinde
// açılır; adımın soruları ve geçmişi/notları burada.
import React, { useEffect, useMemo, useState } from "react";
import { Field, Icon, MenuButton, useConfirm, useToast } from "../../components/ui";
import { post, tempId, useResource } from "../../api";
import { filterLeads, isStepOverdue, isValidLink, leadDueState, leadsOfKind, linkLabel, rolePerson, rolesOf } from "../../lib/projectUtils";
import { relativeTime } from "../../lib/helpers";
import { ACTIVITY_ICONS, Avatar, BASE, StatusSelect, TOOL_ICONS, TOOL_ROUTES, label, openLink } from "./common";
import { QuestionItem } from "./Questions";

export default function StepDrawer({ ctx, step, onClose }) {
  const { meta, phases, people, canEdit, actions, settings, steps, leads, questions, activities, project } = ctx;
  const confirm = useConfirm();
  const toast = useToast();
  const peopleRes = useResource(`${BASE}/people`);
  const team = peopleRes.data?.items || [];
  const [draft, setDraft] = useState({ title: step.title, description: step.description, result: step.result });
  const [role, setRole] = useState("");
  const [check, setCheck] = useState("");
  const [link, setLink] = useState({ label: "", url: "" });
  const [note, setNote] = useState("");
  const [question, setQuestion] = useState("");
  useEffect(() => setDraft({ title: step.title, description: step.description, result: step.result }), [step.id, step.title, step.description, step.result]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape" && !document.querySelector(".modal")) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const update = (changes) => actions.updateStep(step, changes);
  const commit = (key) => { const v = String(draft[key] ?? "").trim(); if (key === "title" && !v) { setDraft((d) => ({ ...d, title: step.title })); return; } if (v !== String(step[key] || "")) update({ [key]: v }); };
  const roles = useMemo(() => rolesOf(settings, steps), [settings, steps]);
  const phase = phases.find((p) => p.id === step.phase_id);
  const stepQuestions = questions.filter((q) => q.step_id === step.id);
  const history = activities.filter((a) => a.step_id === step.id);
  const checklist = step.checklist || [];
  const setChecklist = (next) => update({ checklist: next });
  const tool = step.tool ? meta.tools.find((t) => t.key === step.tool) : null;
  const crmTool = step.tool === "leads" || step.tool === "suppliers";
  const toolStages = step.tool === "suppliers" ? settings.supplier_stages || [] : settings.lead_stages;
  const toolStage = crmTool && step.tool_ref ? toolStages.find((s) => s.key === step.tool_ref) : null;
  const toolLeads = crmTool ? filterLeads(leadsOfKind(leads, step.tool === "suppliers" ? "supplier" : "customer"), toolStage ? { stage: toolStage.key } : {}) : [];
  const quoted = step.tool === "suppliers" ? toolLeads.filter((l) => l.value != null).length : 0;
  const toolDue = toolLeads.filter((l) => ["today", "overdue"].includes(leadDueState(l))).length;
  const overdue = isStepOverdue(step);
  const assigneeOptions = useMemo(() => {
    const list = team.map((u) => ({ id: u.id, name: u.name }));
    if (step.assignee_id && !list.some((u) => u.id === step.assignee_id)) list.push({ id: step.assignee_id, name: people[step.assignee_id]?.name || `#${step.assignee_id}` });
    return list;
  }, [team, step.assignee_id, people]);

  const addRole = (value) => { const v = value.trim(); if (!v || step.responsible.some((r) => r.toLocaleLowerCase("tr-TR") === v.toLocaleLowerCase("tr-TR"))) return; update({ responsible: [...step.responsible, v] }); setRole(""); };
  const sendToTodos = async () => {
    const res = await post("/api/todos", { kind: "task", title: step.title.slice(0, 200), body: `${project.name}${phase ? ` · ${phase.name}` : ""}${step.description ? `\n\n${step.description}` : ""}`, due_at: step.due_date ? new Date(`${step.due_date}T18:00:00`).toISOString() : null, priority: ["high", "urgent"].includes(step.priority) ? "high" : "normal" }, { tempId: tempId() });
    if (res.ok) { toast(res.queued ? "Çevrimdışı: görev bağlantı gelince eklenecek." : "Yapılacaklara eklendi.", { tone: res.queued ? "warn" : "success", action: res.queued ? null : { label: "Aç", run: () => ctx.go("todos") } }); window.dispatchEvent(new Event("elitlig:todos-changed")); }
    else toast(res.error?.message || "Eklenemedi.", { tone: "error" });
  };

  return (
    <aside className="split__side drawer proj-drawer">
      <header className="drawer__head">
        <span className="pill pill--tool" style={phase ? { background: `color-mix(in srgb, ${phase.color} 14%, transparent)`, color: phase.color } : undefined}><Icon name="list" size={11} /> {phase?.name || "Aşamasız"}</span>
        <div className="row-gap">
          <MenuButton items={[
            { label: "Yapılacaklara gönder", icon: "checkSquare", onClick: sendToTodos },
            canEdit && { label: "Kopyasını oluştur", icon: "copy", onClick: () => actions.createStep({ title: `${step.title} (kopya)`.slice(0, 200), phase_id: step.phase_id, responsible: step.responsible, description: step.description, priority: step.priority, tool: step.tool, tool_ref: step.tool_ref, links: step.links, checklist: checklist.map((c) => ({ text: c.text })) }) },
            canEdit && "-",
            canEdit && { label: "Adımı sil", icon: "trash", danger: true, onClick: async () => { if (await confirm({ title: "Adımı sil", message: `“${step.title}” silinsin mi? Soruları ve notları projede kalır.`, confirmLabel: "Sil", danger: true })) { onClose(); actions.deleteStep(step); } } },
          ]} />
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Kapat"><Icon name="x" /></button>
        </div>
      </header>

      <textarea className="drawer__title-input" rows={Math.min(4, Math.max(1, Math.ceil(String(draft.title || "").length / 30)))} value={draft.title} readOnly={!canEdit} onChange={(e) => setDraft({ ...draft, title: e.target.value })} onBlur={() => commit("title")} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } }} aria-label="Adım adı" />
      <div className="row-gap">
        <StatusSelect value={step.status} statuses={meta.step_statuses} disabled={!canEdit} onChange={(v) => update({ status: v })} />
        {step.status !== "done" && canEdit && <button type="button" className="btn btn--green btn--sm" onClick={() => update({ status: "done" })}><Icon name="check" size={13} /> Tamamla</button>}
        {overdue && <span className="chip chip--red"><Icon name="clock" size={11} /> Gecikti</span>}
        {step.done_at && step.status === "done" && <span className="muted small">{new Date(step.done_at).toLocaleDateString("tr-TR", { day: "numeric", month: "short" })} tamamlandı</span>}
      </div>

      {tool && (
        <div className="tool-card" data-tool-key={tool.key}>
          <span className="tool-card__icon"><Icon name={TOOL_ICONS[tool.key]} size={18} strokeWidth={2} /></span>
          <div className="tool-card__text">
            <strong>{tool.label}{toolStage ? ` · ${toolStage.label}` : ""}</strong>
            <small>{tool.key === "leads" ? `${toolLeads.length} kişi${toolDue ? ` · ${toolDue} bugün aranacak` : ""}` : tool.key === "suppliers" ? `${toolLeads.length} tedarikçi · ${quoted} teklif${toolDue ? ` · ${toolDue} bugün dönülecek` : ""}` : tool.key === "finance" ? "Bu adımın gelir / gider kalemleri — ödenince hesaba işlenir" : tool.key === "questions" ? `${stepQuestions.filter((q) => q.status === "open").length} açık soru bu adımda` : tool.key === "portfolio" ? `${ctx.portfolio.length} kayıt` : tool.key === "activity" ? `${history.length} kayıt bu adımda` : `Araçlar → ${tool.label}`}</small>
          </div>
          <button type="button" className="btn btn--primary btn--sm" onClick={() => ctx.openTool(tool.key, step)}><Icon name={tool.internal ? "external" : "chevronRight"} size={13} /> Aracı aç</button>
          {tool.internal && <button type="button" className="icon-btn" title="Sekmede aç" onClick={() => ctx.setTab({ leads: "leads", suppliers: "leads", finance: "budget", questions: "questions", portfolio: "portfolio", activity: "activity" }[tool.key], { ...(crmTool ? { kind: tool.key === "suppliers" ? "supplier" : "customer" } : {}), ...(crmTool && toolStage ? { leadFilter: { stage: toolStage.key } } : {}) })}><Icon name="layers" size={14} /></button>}
        </div>
      )}

      <section className="drawer__section drawer__result">
        <h4><Icon name="message" size={12} /> Sonuç / cevap</h4>
        <textarea rows={3} value={draft.result} readOnly={!canEdit} onChange={(e) => setDraft({ ...draft, result: e.target.value })} onBlur={() => commit("result")} placeholder="Ne yapıldı, ne cevap alındı, karar ne?" />
      </section>

      <div className="form-grid">
        <Field label="Aşama"><select value={step.phase_id ?? ""} disabled={!canEdit} onChange={(e) => update({ phase_id: e.target.value ? Number(e.target.value) : null })}><option value="">Aşamasız</option>{phases.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
        <Field label="Öncelik"><select value={step.priority} disabled={!canEdit} onChange={(e) => update({ priority: e.target.value })}>{meta.priorities.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}</select></Field>
        <Field label="Başlangıç"><input type="date" value={step.start_date || ""} disabled={!canEdit} onChange={(e) => update({ start_date: e.target.value || null })} /></Field>
        <Field label="Son tarih"><input type="date" value={step.due_date || ""} disabled={!canEdit} onChange={(e) => update({ due_date: e.target.value || null })} className={overdue ? "is-late" : ""} /></Field>
        <Field label="Atanan kişi" className="span2">
          <select value={step.assignee_id ?? ""} disabled={!canEdit} onChange={(e) => update({ assignee_id: e.target.value ? Number(e.target.value) : null })}>
            <option value="">Atanmadı</option>{assigneeOptions.map((u) => <option key={u.id} value={u.id}>{u.name}{u.id === ctx.me ? " (ben)" : ""}</option>)}
          </select>
        </Field>
      </div>

      <section className="drawer__section">
        <h4>Sorumlu</h4>
        <div className="labels">
          {step.responsible.map((r) => { const person = rolePerson(settings, r, people); return <span key={r} className="role-chip role-chip--lg">{r}{person && <small>{person}</small>}{canEdit && <button type="button" onClick={() => update({ responsible: step.responsible.filter((x) => x !== r) })} aria-label={`${r} kaldır`}>×</button>}</span>; })}
          {!step.responsible.length && <span className="muted small">Sorumlu yok</span>}
        </div>
        {canEdit && (<>
          <div className="chips">{roles.filter((r) => !step.responsible.includes(r)).slice(0, 10).map((r) => <button key={r} type="button" className="chip chip--off" onClick={() => addRole(r)}>+ {r}</button>)}</div>
          <form className="inline-add" onSubmit={(e) => { e.preventDefault(); addRole(role); }}><input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Başka rol ya da kişi yazın ve ↩" maxLength={60} /></form>
        </>)}
      </section>

      <section className="drawer__section">
        <h4>Açıklama</h4>
        <textarea rows={3} value={draft.description} readOnly={!canEdit} onChange={(e) => setDraft({ ...draft, description: e.target.value })} onBlur={() => commit("description")} placeholder="Ayrıntı, ihtiyaçlar, nasıl yapılacak…" />
      </section>

      <section className="drawer__section">
        <h4>Kontrol listesi {checklist.length > 0 && <span className="muted">{checklist.filter((c) => c.done).length}/{checklist.length}</span>}</h4>
        {checklist.length > 0 && <div className="progress"><span style={{ width: `${(checklist.filter((c) => c.done).length / checklist.length) * 100}%` }} /></div>}
        <ul className="checklist">
          {checklist.map((c) => (
            <li key={c.id}>
              <input type="checkbox" checked={c.done} disabled={!canEdit} onChange={() => setChecklist(checklist.map((x) => (x.id === c.id ? { ...x, done: !x.done } : x)))} />
              <span className={c.done ? "is-done" : ""}>{c.text}</span>
              {canEdit && <button type="button" className="icon-btn icon-btn--xs" onClick={() => setChecklist(checklist.filter((x) => x.id !== c.id))} aria-label="Sil"><Icon name="x" size={12} /></button>}
            </li>
          ))}
        </ul>
        {canEdit && <form className="inline-add" onSubmit={(e) => { e.preventDefault(); if (!check.trim()) return; setChecklist([...checklist, { text: check.trim().slice(0, 200), done: false }]); setCheck(""); }}><input value={check} onChange={(e) => setCheck(e.target.value)} placeholder="Madde ekle ve ↩" /></form>}
      </section>

      <section className="drawer__section">
        <h4>Bağlantılar</h4>
        {step.links.map((l, i) => (
          <div key={`${l.url}${i}`} className="link-row">
            <button type="button" className="link-row__main" onClick={() => openLink(l.url)}><Icon name={l.url.startsWith("/") ? "globe" : l.url.startsWith("mailto:") ? "mail" : l.url.startsWith("tel:") ? "phone" : "link"} size={13} /><span><strong>{l.label}</strong><small>{l.url.startsWith("/") ? `elitlig.com${l.url}` : linkLabel(l.url)}</small></span><Icon name="external" size={12} /></button>
            {canEdit && <button type="button" className="icon-btn icon-btn--xs" onClick={() => update({ links: step.links.filter((_, j) => j !== i) })} aria-label="Bağlantıyı kaldır"><Icon name="x" size={12} /></button>}
          </div>
        ))}
        {!step.links.length && !canEdit && <span className="muted small">Bağlantı yok</span>}
        {canEdit && (
          <form className="link-add" onSubmit={(e) => { e.preventDefault(); if (!isValidLink(link.url)) { toast("Bağlantı https://, / (site yolu), mailto: ya da tel: ile başlamalı.", { tone: "error" }); return; } update({ links: [...step.links, { label: link.label.trim() || link.url.trim(), url: link.url.trim() }] }); setLink({ label: "", url: "" }); }}>
            <input value={link.label} onChange={(e) => setLink({ ...link, label: e.target.value })} placeholder="Ad (ör. Maçlar)" maxLength={60} />
            <input value={link.url} onChange={(e) => setLink({ ...link, url: e.target.value })} placeholder="https://… ya da /editor/maclar" />
            <button type="submit" className="btn btn--sm" disabled={!link.url.trim()}>Ekle</button>
          </form>
        )}
      </section>

      <section className="drawer__section">
        <h4>Adımın aracı</h4>
        <div className="form-grid">
          <Field label="Araç"><select value={step.tool || ""} disabled={!canEdit} onChange={(e) => update({ tool: e.target.value || null, tool_ref: null })}><option value="">Yok</option><optgroup label="Proje içinde">{meta.tools.filter((t) => t.internal).map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</optgroup><optgroup label="Araçlar">{meta.tools.filter((t) => !t.internal).map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</optgroup></select></Field>
          {crmTool && <Field label={step.tool === "suppliers" ? "Tedarik aşaması" : "Kişi aşaması"}><select value={step.tool_ref || ""} disabled={!canEdit} onChange={(e) => update({ tool_ref: e.target.value || null })}><option value="">{step.tool === "suppliers" ? "Tüm tedarikçiler" : "Tüm kişiler"}</option>{toolStages.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select></Field>}
          {step.tool && !tool?.internal && TOOL_ROUTES[step.tool] && <p className="muted small span2">“Aracı aç” {tool?.label} aracına geçer.</p>}
        </div>
      </section>

      <section className="drawer__section">
        <h4>Sorular / ihtiyaçlar {stepQuestions.length > 0 && <span className="muted">{stepQuestions.filter((q) => q.status === "open").length} açık</span>}</h4>
        {stepQuestions.map((q) => <QuestionItem key={q.id} q={q} ctx={ctx} compact />)}
        {canEdit && <form className="inline-add" onSubmit={async (e) => { e.preventDefault(); if (!question.trim()) return; await actions.createQuestion({ question: question.trim(), step_id: step.id }); setQuestion(""); }}><input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Soru ya da ihtiyaç ekle ve ↩" /></form>}
      </section>

      <section className="drawer__section">
        <h4>Geçmiş ve notlar</h4>
        {canEdit && (
          <form className="note-add" onSubmit={async (e) => { e.preventDefault(); if (!note.trim()) return; await actions.logActivity({ type: "note", note: note.trim(), step_id: step.id }); setNote(""); }}>
            <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Not ekle: görüşme, karar, gelişme…" onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); e.currentTarget.form.requestSubmit(); } }} />
            <button type="submit" className="btn btn--sm btn--primary" disabled={!note.trim()}>Not ekle</button>
          </form>
        )}
        <ul className="mini-timeline">
          {history.map((a) => (
            <li key={a.id} className={a.pending ? "is-pending" : ""}>
              <span className={`tl-icon tl-icon--${a.type}`}><Icon name={ACTIVITY_ICONS[a.type] || "note"} size={12} /></span>
              <span className="mini-timeline__text"><small className="selectable">{a.note}</small></span>
              <span className="mini-timeline__when">{a.created_by && people[a.created_by] ? <Avatar name={people[a.created_by].name} size={18} /> : null}{a.pending ? "eşitlenecek" : relativeTime(a.occurred_at)}</span>
            </li>
          ))}
          {!history.length && <li className="muted small">Henüz kayıt yok. Durum değişiklikleri buraya kendiliğinden yazılır.</li>}
        </ul>
      </section>
      <p className="muted small">{step.updated_at && `Son değişiklik ${relativeTime(step.updated_at)}`}</p>
    </aside>
  );
}


