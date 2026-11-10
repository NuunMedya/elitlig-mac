// Sorular: ihtiyaçlar, müşteri soruları ve açık konular; satır içinde cevaplanır.
import React, { useEffect, useMemo, useState } from "react";
import { Empty, Field, Icon, MenuButton, Segmented, useConfirm } from "../../components/ui";
import { useCommand } from "../../api";
import { dueLabel, dayKey } from "../../lib/projectUtils";
import { includesTr, relativeTime } from "../../lib/helpers";
import { label } from "./common";
import { BRIEF_FIELD_OPTIONS, briefFieldLabel } from "../../lib/lifecycleUtils";

export default function Questions({ ctx, embedded = false, step = null, highlight = null }) {
  const { questions, steps, leads, settings, meta, canEdit, actions } = ctx;
  const [status, setStatus] = useState("open");
  const [category, setCategory] = useState("");
  const [stepId, setStepId] = useState(step ? String(step.id) : "");
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  useCommand("new", () => { if (!embedded && canEdit) setAdding(true); });
  useEffect(() => { if (highlight) { setStatus("all"); setTimeout(() => document.querySelector(`[data-question="${highlight}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" }), 80); } }, [highlight]);
  const categories = useMemo(() => [...new Set([...(settings.question_categories || []), ...questions.map((x) => x.category).filter(Boolean)])], [settings, questions]);
  const base = questions.filter((x) => (!category || x.category === category) && (!stepId || String(x.step_id) === stepId) && (!q || includesTr(`${x.question} ${x.answer}`, q)));
  const shown = base.filter((x) => status === "all" || x.status === status);
  const count = (s) => base.filter((x) => s === "all" || x.status === s).length;

  return (
    <div className="proj-section">
      <div className="filters">
        <Segmented size="sm" value={status} onChange={setStatus} options={[...(meta.question_statuses || []).map((s) => ({ value: s.key, label: s.label, count: count(s.key) })), { value: "all", label: "Tümü", count: count("all") }]} />
        <div className="search-box"><Icon name="search" size={14} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Soru ve cevaplarda ara" /></div>
        <select className="select-sm" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Kategori"><option value="">Tüm kategoriler</option>{categories.map((c) => <option key={c} value={c}>{c}</option>)}</select>
        <select className="select-sm select-step" value={stepId} onChange={(e) => setStepId(e.target.value)} aria-label="Adım"><option value="">Tüm adımlar</option>{steps.filter((s) => questions.some((x) => x.step_id === s.id) || (step && s.id === step.id)).map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}</select>
        <span className="spacer" />
        {canEdit && <button type="button" className="btn btn--primary btn--sm" onClick={() => setAdding(true)}><Icon name="plus" size={13} /> Soru / ihtiyaç</button>}
      </div>
      {adding && <QuestionForm ctx={ctx} categories={categories} defaults={{ step_id: step?.id || (stepId ? Number(stepId) : "") }} onClose={() => setAdding(false)} onSave={async (body) => { const r = await actions.createQuestion(body); if (r) { setAdding(false); setStatus(body.answer ? "answered" : "open"); } }} />}
      {shown.length ? (
        <div className="q-list">{shown.map((x) => <QuestionItem key={x.id} q={x} ctx={ctx} highlight={String(highlight) === String(x.id)} />)}</div>
      ) : <Empty icon="help" title={status === "open" ? "Açık soru yok" : "Kayıt yok"} text="Müşterinin sorduğu, ekibin ihtiyaç duyduğu ya da cevap bekleyen her şeyi buraya yazın; cevabı geldikçe işleyin." />}
    </div>
  );
}

function QuestionForm({ ctx, categories, defaults, onClose, onSave }) {
  const [f, setF] = useState({ question: "", category: categories[0] || "", step_id: defaults.step_id || "", lead_id: "", priority: "normal", due_date: "", answer: "", brief_field: "" });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <form className="card q-form" onSubmit={(e) => { e.preventDefault(); if (!f.question.trim()) return; onSave({ ...f, question: f.question.trim(), answer: f.answer.trim() || undefined, step_id: f.step_id ? Number(f.step_id) : null, lead_id: f.lead_id ? Number(f.lead_id) : null, due_date: f.due_date || null, category: f.category || null, brief_field: f.brief_field || undefined }); }}>
      <textarea rows={2} value={f.question} onChange={set("question")} placeholder="Soru, ihtiyaç ya da açık konu…" autoFocus />
      <div className="form-grid form-grid--3">
        <Field label="Kategori"><select value={f.category} onChange={set("category")}><option value="">—</option>{categories.map((c) => <option key={c} value={c}>{c}</option>)}</select></Field>
        <Field label="Adım"><select value={f.step_id} onChange={set("step_id")}><option value="">—</option>{ctx.steps.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}</select></Field>
        <Field label="Kişi"><select value={f.lead_id} onChange={set("lead_id")}><option value="">—</option>{ctx.leads.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></Field>
        <Field label="Öncelik"><select value={f.priority} onChange={set("priority")}>{ctx.meta.priorities.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}</select></Field>
        <Field label="Son tarih"><input type="date" value={f.due_date} onChange={set("due_date")} /></Field>
        <Field label="Cevap (biliyorsanız)"><input value={f.answer} onChange={set("answer")} placeholder="İsteğe bağlı" /></Field>
        <Field label="Künyeye bağla" hint="Cevap proje künyesine işlenir"><select value={f.brief_field} onChange={set("brief_field")}><option value="">Bağlı değil</option>{BRIEF_FIELD_OPTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
      </div>
      <div className="row-gap"><span className="spacer" /><button type="button" className="btn btn--sm" onClick={onClose}>Vazgeç</button><button type="submit" className="btn btn--primary btn--sm" disabled={!f.question.trim()}>Ekle</button></div>
    </form>
  );
}

/** Tek soru: cevapla, kapat, yeniden aç, sil. */
export function QuestionItem({ q, ctx, compact = false, highlight = false }) {
  const { steps, leads, people, meta, canEdit, actions } = ctx;
  const confirm = useConfirm();
  const [answer, setAnswer] = useState(q.answer || "");
  const [open, setOpen] = useState(false);
  useEffect(() => setAnswer(q.answer || ""), [q.answer]);
  const step = q.step_id ? steps.find((s) => s.id === q.step_id) : null;
  const lead = q.lead_id ? leads.find((l) => l.id === q.lead_id) : null;
  const late = q.due_date && q.status === "open" && q.due_date < dayKey();
  return (
    <article data-question={q.id} className={`q-item q-item--${q.status} ${compact ? "q-item--compact" : ""} ${highlight ? "is-highlight" : ""}`}>
      <header>
        <span className={`q-item__mark is-${q.status}`}><Icon name={q.status === "open" ? "help" : "check"} size={12} strokeWidth={2.4} /></span>
        <button type="button" className="q-item__text" onClick={() => setOpen((v) => !v)}>{q.question}</button>
        {canEdit && <MenuButton items={[
          q.status !== "closed" && { label: "Kapat", icon: "archive", onClick: () => actions.updateQuestion(q, { status: "closed" }) },
          q.status !== "open" && { label: "Yeniden aç", icon: "rotate", onClick: () => actions.updateQuestion(q, { status: "open" }) },
          "-",
          { label: "Sil", icon: "trash", danger: true, onClick: async () => { if (await confirm({ title: "Soruyu sil", message: "Bu soru silinsin mi?", confirmLabel: "Sil", danger: true })) actions.deleteQuestion(q); } },
        ]} />}
      </header>
      <div className="q-item__meta">
        <span className={`pill pill--xs ${q.status === "open" ? "pill--amber" : q.status === "answered" ? "pill--green" : ""}`}>{label(meta.question_statuses, q.status)}</span>
        {q.category && <span className="pill pill--xs">{q.category}</span>}
        {q.brief_field && <button type="button" className="pill pill--xs pill--tool lc-qbrief" onClick={() => ctx.setTab("overview")} title="Cevap proje künyesine işlenir; künye doldurulunca bu soru da cevaplanır"><Icon name="file" size={10} /> Künye: {briefFieldLabel(q.brief_field)}</button>}
        {["high", "urgent"].includes(q.priority) && <span className="pill pill--xs pill--red">{label(meta.priorities, q.priority)}</span>}
        {!compact && step && <button type="button" className="link-btn small" onClick={() => ctx.openStep(step.id)}><Icon name="list" size={11} /> {step.title}</button>}
        {!compact && lead && <button type="button" className="link-btn small" onClick={() => ctx.openLead(lead.id)}><Icon name="user" size={11} /> {lead.name}</button>}
        {q.due_date && <span className={late ? "text-red" : ""}><Icon name="clock" size={11} /> {dueLabel(q.due_date)}</span>}
        <span className="muted">{q.asked_by && people[q.asked_by] ? `${people[q.asked_by].name} · ` : ""}{relativeTime(q.created_at)}</span>
        {canEdit && !open && <button type="button" className="link-btn small q-item__actions" onClick={() => setOpen(true)}><Icon name="message" size={11} /> {q.answer ? "Cevabı düzenle" : "Cevapla"}</button>}
      </div>
      {q.answer && !open && <p className="q-item__answer selectable"><Icon name="message" size={12} /> {q.answer}{q.answered_by && people[q.answered_by] ? <small> — {people[q.answered_by].name}</small> : null}</p>}
      {open && (canEdit ? (
        <form className="q-item__reply" onSubmit={(e) => { e.preventDefault(); if (answer.trim() !== (q.answer || "")) actions.updateQuestion(q, { answer: answer.trim() }); setOpen(false); }}>
          <textarea rows={2} value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Cevabı yazın…" onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); e.currentTarget.form.requestSubmit(); } }} />
          <div className="row-gap">
            <span className="muted small">⌘↩ kaydet</span><span className="spacer" />
            {q.status === "answered" && <button type="button" className="btn btn--xs btn--ghost" onClick={() => { actions.updateQuestion(q, { status: "closed" }); setOpen(false); }}>Kapat</button>}
            <button type="submit" className="btn btn--xs btn--primary" disabled={!answer.trim() || answer.trim() === (q.answer || "")}>{q.answer ? "Cevabı güncelle" : "Cevapla"}</button>
          </div>
        </form>
      ) : q.answer ? <p className="q-item__answer selectable">{q.answer}</p> : <p className="muted small">Henüz cevap yok.</p>)}
    </article>
  );
}
