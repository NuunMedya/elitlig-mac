// Kişi ayrıntısı: tek tıkla ara / WhatsApp / e-posta, aşama, sonraki aksiyon,
// HIZLI GÖRÜŞME SONUCU düğmeleri, ayrıntılı kayıt, zaman çizelgesi, soruları,
// "Satışı kapat → Portföye ekle" ve "Kaybedildi".
import React, { useEffect, useMemo, useState } from "react";
import { Field, Icon, MenuButton, Modal, useConfirm, useToast } from "../../components/ui";
import { post, tempId } from "../../api";
import { formatWhen, leadDueState, mailLink, outcomePreview, stageOf, telLink, waLink } from "../../lib/projectUtils";
import { prettyPhone, relativeTime, formatMoney } from "../../lib/helpers";
import { ACTIVITY_ICONS, Avatar, StagePill, dayHeading, fromLocalInput, label, toLocalInput } from "./common";
import { QuestionItem } from "./Questions";

const CONTACT_TYPES = [["call", "Arama", "phone"], ["whatsapp", "WhatsApp", "message"], ["email", "E-posta", "mail"], ["meeting", "Görüşme", "users"], ["visit", "Ziyaret", "map"], ["sms", "SMS", "message"]];

export default function LeadPanel({ ctx, lead, onClose, step = null }) {
  const { settings, meta, people, canEdit, actions, activities, questions } = ctx;
  const confirm = useConfirm();
  const toast = useToast();
  const [type, setType] = useState("call");
  const [quickNote, setQuickNote] = useState("");
  const [detailed, setDetailed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [nextEdit, setNextEdit] = useState(false);
  const [winOpen, setWinOpen] = useState(false);
  const [lostOpen, setLostOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(null);
  const stage = stageOf(settings, lead.stage);
  const due = leadDueState(lead);
  const lostStage = settings.lead_stages.find((s) => s.lost);
  const timeline = useMemo(() => activities.filter((a) => String(a.lead_id) === String(lead.id)), [activities, lead.id]);
  const leadQuestions = questions.filter((q) => String(q.lead_id) === String(lead.id));
  const tel = telLink(lead.phone);
  const wa = waLink(lead.phone);
  const mail = mailLink(lead.email);
  useEffect(() => { setQuickNote(""); setDetailed(false); setEditing(false); }, [lead.id]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape" && !document.querySelector(".modal")) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  /** Sonucu tek tıkla kaydeder; kişi sunucunun kurallarıyla anında güncellenir. */
  const logOutcome = async (outcome, extra = {}) => {
    if (!canEdit) return;
    setBusy(outcome?.key || "note");
    const body = { lead_id: lead.id, type: extra.type || type, outcome: outcome?.key || undefined, note: (extra.note ?? quickNote).trim() || undefined, ...(step ? { step_id: step.id } : {}), ...extra.body };
    const preview = outcomePreview(lead, settings, { outcome: body.outcome, type: body.type, stage: body.stage, next_action_at: body.next_action_at, next_action: body.next_action });
    const r = await actions.logActivity(body, { ...lead, ...preview.patch });
    setBusy(null);
    if (!r) return;
    setQuickNote("");
    const next = r.lead || { ...lead, ...preview.patch };
    toast(`${outcome ? outcome.label : "Kayıt"} kaydedildi${next.next_action_at ? ` · sonraki: ${formatWhen(next.next_action_at)}` : ""}.`, { tone: "success" });
  };

  const addToAgenda = async () => {
    if (!lead.next_action_at) return;
    const start = new Date(lead.next_action_at);
    const res = await post("/api/tools/events", { title: `${lead.next_action || "Ara"}: ${lead.name}`.slice(0, 200), description: [lead.company, lead.phone, ctx.project.name].filter(Boolean).join(" · "), start_at: start.toISOString(), end_at: new Date(start.getTime() + 30 * 60000).toISOString(), all_day: false, category: "meeting", remind_minutes: 10 }, { tempId: tempId() });
    if (res.ok) toast(res.queued ? "Çevrimdışı: etkinlik bağlantı gelince eklenecek." : "Ajandaya eklendi (10 dk önce hatırlatma).", { tone: res.queued ? "warn" : "success", action: res.queued ? null : { label: "Ajanda", run: () => ctx.go("agenda") } });
    else toast(res.error?.message || "Eklenemedi.", { tone: "error" });
  };

  return (
    <div className="lead-panel">
      <header className="drawer__head">
        <div className="lead-panel__id">
          <Avatar name={lead.name} size={44} color={stage?.color} />
          <div>
            <h2 className="drawer__title">{lead.name}</h2>
            <p className="muted small">{[lead.company !== lead.name ? lead.company : null, lead.title, lead.city].filter(Boolean).join(" · ") || "—"}</p>
          </div>
        </div>
        <div className="row-gap">
          <MenuButton items={[
            canEdit && { label: "Bilgileri düzenle", icon: "sliders", onClick: () => setEditing(true) },
            lead.next_action_at && { label: "Sonraki aksiyonu ajandaya ekle", icon: "calendar", onClick: addToAgenda },
            lead.phone && { label: "Numarayı kopyala", icon: "copy", onClick: () => { navigator.clipboard.writeText(lead.phone); toast("Kopyalandı."); } },
            canEdit && "-",
            canEdit && { label: "Kişiyi sil", icon: "trash", danger: true, onClick: async () => { if (await confirm({ title: "Kişiyi sil", message: `“${lead.name}” ve iletişim geçmişi silinsin mi?`, confirmLabel: "Sil", danger: true })) { onClose(); actions.deleteLead(lead); } } },
          ]} />
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Kapat"><Icon name="x" /></button>
        </div>
      </header>

      <div className="contact-actions-lg">
        <button type="button" className="ca-btn ca-btn--call" disabled={!tel} onClick={() => window.elitlig.app.openExternal(tel)} title={tel ? prettyPhone(lead.phone) : "Telefon yok"}><Icon name="phone" size={16} /><span>Ara</span><small>{lead.phone ? prettyPhone(lead.phone) : "telefon yok"}</small></button>
        <button type="button" className="ca-btn ca-btn--wa" disabled={!wa} onClick={() => window.elitlig.app.openExternal(wa)}><Icon name="message" size={16} /><span>WhatsApp</span><small>{wa ? "mesaj yaz" : "—"}</small></button>
        <button type="button" className="ca-btn ca-btn--mail" disabled={!mail} onClick={() => window.elitlig.app.openExternal(mail)} title={lead.email}><Icon name="mail" size={16} /><span>E-posta</span><small>{lead.email || "e-posta yok"}</small></button>
      </div>

      <section className="drawer__section">
        <h4>Aşama {lead.portfolio_id && <span className="pill pill--green pill--xs"><Icon name="briefcase" size={10} /> Portföyde</span>}</h4>
        <div className="stage-chips">
          {settings.lead_stages.map((s) => (
            <button key={s.key} type="button" disabled={!canEdit} className={lead.stage === s.key ? "is-on" : ""} style={{ "--sc": s.color }} onClick={() => lead.stage !== s.key && (s.lost ? setLostOpen(true) : actions.updateLead(lead, { stage: s.key }))}>{s.label}</button>
          ))}
        </div>
      </section>

      <section className={`next-box ${due ? `is-${due}` : ""}`}>
        <Icon name="clock" size={16} />
        {nextEdit && canEdit ? (
          <NextActionForm lead={lead} onCancel={() => setNextEdit(false)} onSave={async (changes) => { await actions.updateLead(lead, changes); setNextEdit(false); }} />
        ) : (<>
          <div className="next-box__text">
            <small>Sonraki aksiyon</small>
            <strong>{lead.next_action_at ? `${formatWhen(lead.next_action_at)}${due === "overdue" ? " · gecikti" : ""}` : stage?.won || stage?.lost ? "Kapandı" : "Planlanmadı"}</strong>
            {lead.next_action && <span>{lead.next_action}</span>}
          </div>
          {canEdit && <button type="button" className="btn btn--sm" onClick={() => setNextEdit(true)}>{lead.next_action_at ? "Değiştir" : "Planla"}</button>}
          {lead.next_action_at && <button type="button" className="icon-btn" title="Ajandaya ekle" onClick={addToAgenda}><Icon name="calendar" size={14} /></button>}
        </>)}
      </section>

      {canEdit && (
        <section className="outcome-box">
          <header>
            <h4>Görüşme sonucu</h4>
            <div className="type-pick">{CONTACT_TYPES.slice(0, 4).map(([k, l, ic]) => <button key={k} type="button" className={type === k ? "is-on" : ""} onClick={() => setType(k)} title={l}><Icon name={ic} size={12} /> {l}</button>)}</div>
          </header>
          <input value={quickNote} onChange={(e) => setQuickNote(e.target.value)} placeholder="Kısa not (isteğe bağlı) — örn. “akşam 7'den sonra arayın”" maxLength={2000} onKeyDown={(e) => { if (e.key === "Enter" && quickNote.trim()) { e.preventDefault(); logOutcome(null); } }} />
          <div className="outcomes">
            {settings.outcomes.map((o) => {
              const target = o.stage ? stageOf(settings, o.stage) : null;
              return (
                <button key={o.key} type="button" className="outcome-btn" style={{ "--sc": target?.color || "#64748b" }} disabled={Boolean(busy)} onClick={() => logOutcome(o)}>
                  <strong>{busy === o.key ? "Kaydediliyor…" : o.label}</strong>
                  <small>{[target && target.key !== lead.stage ? `→ ${target.label}` : null, o.next_days != null ? (o.next_days === 0 ? "bugün" : `+${o.next_days} gün`) : null].filter(Boolean).join(" · ") || "kayıt"}</small>
                </button>
              );
            })}
          </div>
          <div className="row-gap">
            <button type="button" className="link-btn small" onClick={() => setDetailed((v) => !v)}>{detailed ? "Ayrıntılı kaydı kapat" : "Ayrıntılı kayıt (tarih, sonraki aksiyon, aşama)…"}</button>
            <span className="spacer" />
            {quickNote.trim() && <button type="button" className="btn btn--sm" onClick={() => logOutcome(null)}>Yalnız notu kaydet</button>}
          </div>
          {detailed && <ActivityForm lead={lead} settings={settings} meta={meta} initialType={type} initialNote={quickNote} onSave={async (body) => { await logOutcome(body.outcome ? settings.outcomes.find((o) => o.key === body.outcome) : null, { type: body.type, note: body.note || "", body }); setDetailed(false); }} />}
        </section>
      )}

      {canEdit && !stage?.lost && (
        <div className="win-row">
          {!lead.portfolio_id ? <button type="button" className="btn btn--green" onClick={() => setWinOpen(true)}><Icon name="briefcase" size={14} /> Satışı kapat → Portföye ekle</button>
            : <button type="button" className="btn btn--soft" onClick={() => ctx.setTab("portfolio")}><Icon name="briefcase" size={14} /> Portföyde görüntüle</button>}
          {lostStage && !stage?.won && <button type="button" className="btn btn--danger-ghost" onClick={() => setLostOpen(true)}><Icon name="x" size={14} /> Kaybedildi</button>}
        </div>
      )}
      {stage?.lost && lead.lost_reason && <div className="notice notice--error"><span><strong>Kaybedildi:</strong> {lead.lost_reason}</span></div>}

      <dl className="lead-facts">
        <div><dt>Değer</dt><dd>{lead.value != null ? formatMoney(lead.value, 0) : "—"}</dd></div>
        <div><dt>Görüşme</dt><dd>{lead.contact_count || 0}{lead.last_contact_at ? <small> · son {relativeTime(lead.last_contact_at)}</small> : null}</dd></div>
        <div><dt>Kaynak</dt><dd>{lead.source || "—"}</dd></div>
        <div><dt>Takip eden</dt><dd>{lead.owner_id ? people[lead.owner_id]?.name || "—" : "—"}</dd></div>
      </dl>
      {lead.note && <p className="note-box selectable">{lead.note}</p>}

      <section className="drawer__section">
        <h4>Sorular {leadQuestions.length > 0 && <span className="muted">{leadQuestions.filter((q) => q.status === "open").length} açık</span>}</h4>
        {leadQuestions.map((q) => <QuestionItem key={q.id} q={q} ctx={ctx} compact />)}
        {canEdit && <form className="inline-add" onSubmit={async (e) => { e.preventDefault(); if (!question.trim()) return; await actions.createQuestion({ question: question.trim(), lead_id: lead.id, category: "Müşteri sorusu" }); setQuestion(""); }}><input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Kişinin sorusu / ihtiyacı ve ↩" /></form>}
      </section>

      <section className="drawer__section">
        <h4>Zaman çizelgesi <span className="muted">{timeline.length}</span></h4>
        <Timeline items={timeline} ctx={ctx} />
      </section>

      {editing && <LeadForm lead={lead} ctx={ctx} onClose={() => setEditing(false)} onSave={async (changes) => { const r = await actions.updateLead(lead, changes); if (r) setEditing(false); }} />}
      {winOpen && <WinDialog lead={lead} ctx={ctx} onClose={() => setWinOpen(false)} onSave={async (body) => { const r = await actions.winLead(lead, body); if (r) setWinOpen(false); }} />}
      {lostOpen && <LostDialog onClose={() => setLostOpen(false)} onSave={async (reason) => { await actions.updateLead(lead, { stage: lostStage.key, lost_reason: reason || null }); setLostOpen(false); }} />}
    </div>
  );
}

export function Timeline({ items, ctx, showSubject = false }) {
  const { settings, meta, people, leads, steps, me, isOwner, actions, canEdit } = ctx;
  const confirm = useConfirm();
  if (!items.length) return <p className="muted small">Henüz kayıt yok. Görüşme sonucu girdikçe burada birikir.</p>;
  let lastDay = null;
  return (
    <ol className="timeline">
      {items.map((a) => {
        const day = dayHeading(a.occurred_at);
        const head = day !== lastDay ? day : null;
        lastDay = day;
        const outcome = a.outcome ? settings.outcomes.find((o) => o.key === a.outcome) : null;
        const lead = showSubject && a.lead_id ? leads.find((l) => l.id === a.lead_id) : null;
        const step = showSubject && a.step_id ? steps.find((s) => s.id === a.step_id) : null;
        const canDelete = canEdit && !a.pending && (["status", "system"].includes(a.type) ? isOwner : (a.created_by === me || isOwner));
        return (
          <React.Fragment key={a.id}>
            {head && <li className="timeline__day">{head}</li>}
            <li className={`timeline__item ${a.pending ? "is-pending" : ""} ${["status", "system"].includes(a.type) ? "is-system" : ""}`}>
              <span className={`tl-icon tl-icon--${a.type}`}><Icon name={ACTIVITY_ICONS[a.type] || "note"} size={12} /></span>
              <div className="timeline__body">
                <div className="timeline__top">
                  <strong>{label(meta.activity_types, a.type)}</strong>
                  {outcome && <span className="pill pill--xs pill--tool">{outcome.label}</span>}
                  {lead && <button type="button" className="link-btn small" onClick={() => ctx.openLead(lead.id)}>{lead.name}</button>}
                  {step && <button type="button" className="link-btn small" onClick={() => ctx.openStep(step.id)}>{step.title}</button>}
                  <span className="spacer" />
                  <small className="muted">{a.pending ? "eşitlenecek" : new Date(a.occurred_at).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}</small>
                  {canDelete && <button type="button" className="icon-btn icon-btn--xs timeline__del" title="Kaydı sil" onClick={async () => { if (await confirm({ title: "Kaydı sil", message: "Bu iletişim kaydı silinsin mi?", confirmLabel: "Sil", danger: true })) actions.deleteActivity(a); }}><Icon name="trash" size={11} /></button>}
                </div>
                {a.note && <p className="selectable">{a.note}</p>}
                <small className="muted">{a.created_by && people[a.created_by] ? people[a.created_by].name : ""}{a.next_action_at ? ` · sonraki: ${formatWhen(a.next_action_at)}` : ""}</small>
              </div>
            </li>
          </React.Fragment>
        );
      })}
    </ol>
  );
}

function NextActionForm({ lead, onSave, onCancel }) {
  const [at, setAt] = useState(toLocalInput(lead.next_action_at) || toLocalInput(new Date(new Date().setHours(new Date().getHours() + 24, 0, 0, 0)).toISOString()));
  const [text, setText] = useState(lead.next_action || "Ara");
  const preset = (days, hour = 10) => { const d = new Date(); d.setDate(d.getDate() + days); d.setHours(hour, 0, 0, 0); setAt(toLocalInput(d.toISOString())); };
  return (
    <form className="next-form" onSubmit={(e) => { e.preventDefault(); onSave({ next_action_at: fromLocalInput(at), next_action: text.trim() || null }); }}>
      <div className="row-gap">
        <input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} />
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Ne yapılacak" maxLength={200} />
      </div>
      <div className="row-gap">
        {[[0, "Bugün", 17], [1, "Yarın"], [2, "2 gün"], [7, "1 hafta"]].map(([d, l, h]) => <button key={l} type="button" className="btn btn--xs btn--ghost" onClick={() => preset(d, h)}>{l}</button>)}
        <span className="spacer" />
        {lead.next_action_at && <button type="button" className="btn btn--xs btn--danger-ghost" onClick={() => onSave({ next_action_at: null, next_action: null })}>Temizle</button>}
        <button type="button" className="btn btn--xs" onClick={onCancel}>Vazgeç</button>
        <button type="submit" className="btn btn--xs btn--primary">Kaydet</button>
      </div>
    </form>
  );
}

function ActivityForm({ lead, settings, meta, initialType, initialNote, onSave }) {
  const [f, setF] = useState({ type: initialType, outcome: "", note: initialNote || "", occurred_at: toLocalInput(new Date().toISOString()), next_action_at: undefined, next_action: undefined, stage: "" });
  const preview = outcomePreview(lead, settings, { outcome: f.outcome || undefined, type: f.type, stage: f.stage || undefined, next_action_at: f.next_action_at === undefined ? undefined : fromLocalInput(f.next_action_at), next_action: f.next_action });
  const types = (meta.activity_types || []).filter((t) => !t.system);
  return (
    <form className="activity-form" onSubmit={(e) => { e.preventDefault(); const body = { type: f.type, outcome: f.outcome || undefined, note: f.note.trim(), occurred_at: fromLocalInput(f.occurred_at) }; if (f.next_action_at !== undefined) body.next_action_at = fromLocalInput(f.next_action_at); if (f.next_action !== undefined) body.next_action = f.next_action; if (f.stage) body.stage = f.stage; onSave(body); }}>
      <div className="form-grid">
        <Field label="Tür"><select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>{types.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</select></Field>
        <Field label="Sonuç"><select value={f.outcome} onChange={(e) => setF({ ...f, outcome: e.target.value })}><option value="">Sonuç yok</option>{settings.outcomes.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}</select></Field>
        <Field label="Görüşme zamanı"><input type="datetime-local" value={f.occurred_at} onChange={(e) => setF({ ...f, occurred_at: e.target.value })} /></Field>
        <Field label="Aşamayı değiştir"><select value={f.stage} onChange={(e) => setF({ ...f, stage: e.target.value })}><option value="">Sonuca göre</option>{settings.lead_stages.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select></Field>
        <Field label="Sonraki aksiyon tarihi"><input type="datetime-local" value={f.next_action_at ?? toLocalInput(preview.patch.next_action_at || lead.next_action_at)} onChange={(e) => setF({ ...f, next_action_at: e.target.value })} /></Field>
        <Field label="Sonraki aksiyon"><input value={f.next_action ?? (preview.patch.next_action ?? lead.next_action ?? "")} onChange={(e) => setF({ ...f, next_action: e.target.value })} placeholder="örn. Teklif gönder" /></Field>
        <Field label="Not" className="span2"><textarea rows={3} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Görüşmede ne konuşuldu?" /></Field>
      </div>
      <div className="preview-line">
        <Icon name="zap" size={12} />
        <span>Kaydedince: {preview.patch.stage ? <>aşama <StagePill stage={stageOf(settings, preview.patch.stage)} small /></> : "aşama aynı kalır"}{" · "}
          {"next_action_at" in preview.patch ? (preview.patch.next_action_at ? `sonraki aksiyon ${formatWhen(preview.patch.next_action_at)}` : "sonraki aksiyon temizlenir") : "sonraki aksiyon değişmez"}</span>
        <span className="spacer" />
        <button type="submit" className="btn btn--primary btn--sm" disabled={!f.note.trim() && !f.outcome}>Kaydet</button>
      </div>
    </form>
  );
}

function LeadForm({ lead, ctx, onClose, onSave }) {
  const [f, setF] = useState({ name: lead.name, company: lead.company, title: lead.title, phone: lead.phone, email: lead.email, city: lead.city, source: lead.source, value: lead.value ?? "", owner_id: lead.owner_id ?? "", note: lead.note });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const owners = [...new Map([...ctx.members.map((m) => [m.user_id, m.name]), [ctx.project.owner_id, ctx.project.owner_name], ...Object.values(ctx.people).map((p) => [p.id, p.name])]).entries()];
  return (
    <Modal title="Kişi bilgileri" onClose={onClose} width={560} footer={<><button type="button" className="btn" onClick={onClose}>Vazgeç</button><button type="submit" form="lead-form" className="btn btn--primary" disabled={!String(f.name || "").trim()}>Kaydet</button></>}>
      <form id="lead-form" className="form-grid" onSubmit={(e) => { e.preventDefault(); onSave({ ...f, value: f.value === "" ? null : f.value, owner_id: f.owner_id ? Number(f.owner_id) : null }); }}>
        <Field label="Ad soyad"><input value={f.name} onChange={set("name")} maxLength={120} /></Field>
        <Field label="Firma / takım"><input value={f.company} onChange={set("company")} maxLength={160} /></Field>
        <Field label="Telefon"><input value={f.phone} onChange={set("phone")} maxLength={40} /></Field>
        <Field label="E-posta"><input type="email" value={f.email} onChange={set("email")} maxLength={160} /></Field>
        <Field label="Unvan"><input value={f.title} onChange={set("title")} maxLength={80} /></Field>
        <Field label="Şehir"><input value={f.city} onChange={set("city")} maxLength={80} /></Field>
        <Field label="Kaynak"><input list="lead-sources" value={f.source} onChange={set("source")} maxLength={80} /><datalist id="lead-sources">{(ctx.settings.lead_sources || []).map((s) => <option key={s} value={s} />)}</datalist></Field>
        <Field label="Değer (₺)"><input inputMode="decimal" value={f.value} onChange={set("value")} placeholder="örn. 15.000" /></Field>
        <Field label="Takip eden" className="span2"><select value={f.owner_id} onChange={set("owner_id")}><option value="">—</option>{owners.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></Field>
        <Field label="Not" className="span2"><textarea rows={3} value={f.note} onChange={set("note")} /></Field>
      </form>
    </Modal>
  );
}

function WinDialog({ lead, ctx, onClose, onSave }) {
  const cats = ctx.settings.portfolio_categories || [];
  const [f, setF] = useState({ category: cats[0] || "", value: lead.value ?? "", note: lead.note || "", start_date: new Date().toISOString().slice(0, 10) });
  return (
    <Modal title="Satışı kapat → Portföye ekle" onClose={onClose} width={480} footer={<><button type="button" className="btn" onClick={onClose}>Vazgeç</button><button type="submit" form="win-form" className="btn btn--green"><Icon name="check" size={14} /> Portföye ekle</button></>}>
      <form id="win-form" className="composer" onSubmit={(e) => { e.preventDefault(); onSave({ ...f, value: f.value === "" ? null : f.value }); }}>
        <div className="info-box"><Icon name="briefcase" /><div><strong>{lead.name}</strong><span className="muted small">“{ctx.settings.lead_stages.find((s) => s.won)?.label || "Kazanıldı"}” aşamasına alınır, sonraki aksiyonu temizlenir ve portföye eklenir.</span></div></div>
        <div className="form-grid">
          <Field label="Kategori"><select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{cats.map((c) => <option key={c} value={c}>{c}</option>)}<option value="">Kategorisiz</option></select></Field>
          <Field label="Tutar (₺)"><input inputMode="decimal" className="money-input" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} placeholder="0" /></Field>
          <Field label="Başlangıç"><input type="date" value={f.start_date} onChange={(e) => setF({ ...f, start_date: e.target.value })} /></Field>
          <Field label="Not" className="span2"><textarea rows={2} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
        </div>
      </form>
    </Modal>
  );
}

function LostDialog({ onClose, onSave }) {
  const [reason, setReason] = useState("");
  const presets = ["Bütçe yetersiz", "Başka organizasyona katıldı", "Tarihler uymadı", "İlgilenmiyor", "Ulaşılamadı"];
  return (
    <Modal title="Kaybedildi" onClose={onClose} width={440} footer={<><button type="button" className="btn" onClick={onClose}>Vazgeç</button><button type="submit" form="lost-form" className="btn btn--primary btn--danger">Kaybedildi olarak işaretle</button></>}>
      <form id="lost-form" className="composer" onSubmit={(e) => { e.preventDefault(); onSave(reason.trim()); }}>
        <Field label="Neden"><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Kısaca neden?" maxLength={200} /></Field>
        <div className="chips">{presets.map((p) => <button key={p} type="button" className="chip chip--off" onClick={() => setReason(p)}>{p}</button>)}</div>
      </form>
    </Modal>
  );
}

