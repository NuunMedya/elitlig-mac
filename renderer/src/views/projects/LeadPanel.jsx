// Kişi ayrıntısı: tek tıkla ara / WhatsApp / e-posta, aşama, sonraki aksiyon,
// HIZLI GÖRÜŞME SONUCU düğmeleri, ayrıntılı kayıt, zaman çizelgesi, soruları,
// "Satışı kapat → Portföye ekle" ve "Kaybedildi".
import React, { useEffect, useMemo, useState } from "react";
import { Field, Icon, MenuButton, Modal, Segmented, useConfirm, useToast } from "../../components/ui";
import { post, tempId } from "../../api";
import { formatWhen, kindSettings, leadDueState, leadKind, mailLink, outcomeOf, outcomePreview, stageOf, supplierQuotes, telLink, waLink } from "../../lib/projectUtils";
import { prettyPhone, relativeTime, formatMoney, isoDay } from "../../lib/helpers";
import { parseAmount } from "../../lib/ledgerUtils";
import { AccountSelectField } from "../../components/finance";
import { ACTIVITY_ICONS, Avatar, StagePill, dayHeading, fromLocalInput, label, money, toLocalInput } from "./common";
import { QuestionItem } from "./Questions";
import { useProjectFinance } from "./Budget";

const CONTACT_TYPES = [["call", "Arama", "phone"], ["whatsapp", "WhatsApp", "message"], ["email", "E-posta", "mail"], ["meeting", "Görüşme", "users"], ["visit", "Ziyaret", "map"], ["sms", "SMS", "message"]];

export default function LeadPanel({ ctx, lead, onClose, step = null }) {
  const { meta, people, canEdit, actions, activities, questions } = ctx;
  const kind = leadKind(lead);
  const supplier = kind === "supplier";
  const settings = useMemo(() => kindSettings(ctx.settings, kind), [ctx.settings, kind]);
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
  const [quote, setQuote] = useState("");
  const [askQuote, setAskQuote] = useState(null);
  const [busy, setBusy] = useState(null);
  const stage = stageOf(settings, lead.stage);
  const due = leadDueState(lead);
  const lostStage = settings.lead_stages.find((s) => s.lost);
  const timeline = useMemo(() => activities.filter((a) => String(a.lead_id) === String(lead.id)), [activities, lead.id]);
  const leadQuestions = questions.filter((q) => String(q.lead_id) === String(lead.id));
  const tel = telLink(lead.phone);
  const wa = waLink(lead.phone);
  const mail = mailLink(lead.email);
  useEffect(() => { setQuickNote(""); setDetailed(false); setEditing(false); setQuote(""); }, [lead.id]);
  const quotes = useMemo(() => (supplier && lead.item ? supplierQuotes(ctx.leads, lead, ctx.settings) : null), [supplier, ctx.leads, lead, ctx.settings]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape" && !document.querySelector(".modal")) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  /** Sonucu tek tıkla kaydeder; kişi sunucunun kurallarıyla anında güncellenir. */
  const logOutcome = async (outcome, extra = {}) => {
    if (!canEdit) return;
    setBusy(outcome?.key || "note");
    const value = supplier ? (extra.value ?? (quote.trim() ? parseAmount(quote) : null)) : null;
    const body = { lead_id: lead.id, type: extra.type || type, outcome: outcome?.key || undefined, note: (extra.note ?? quickNote).trim() || undefined, ...(step ? { step_id: step.id } : {}), ...(value ? { value } : {}), ...extra.body };
    const preview = outcomePreview(lead, settings, { outcome: body.outcome, type: body.type, stage: body.stage, next_action_at: body.next_action_at, next_action: body.next_action });
    const r = await actions.logActivity(body, { ...lead, ...preview.patch, ...(value ? { value } : {}) });
    setBusy(null);
    if (!r) return;
    setQuickNote("");
    setQuote("");
    const next = r.lead || { ...lead, ...preview.patch };
    toast(`${outcome ? outcome.label : "Kayıt"} kaydedildi${value ? ` · teklif ${money(value)}` : ""}${next.next_action_at ? ` · sonraki: ${formatWhen(next.next_action_at)}` : ""}.`, { tone: "success" });
  };
  /** Tedarikte "Fiyat alındı": teklif tutarı girilmemişse sorulur. */
  const pickOutcome = (o) => {
    if (supplier && isQuoteOutcome(o) && !quote.trim()) { setAskQuote(o); return; }
    logOutcome(o);
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
            <h2 className="drawer__title">{supplier ? lead.company || lead.name : lead.name}</h2>
            <p className="muted small">{supplier ? [lead.item ? `Konu: ${lead.item}` : null, lead.company && lead.name !== lead.company ? lead.name : null, lead.source].filter(Boolean).join(" · ") || "Tedarikçi" : [lead.company !== lead.name ? lead.company : null, lead.title, lead.city].filter(Boolean).join(" · ") || "—"}</p>
          </div>
        </div>
        <div className="row-gap">
          <MenuButton items={[
            canEdit && { label: "Bilgileri düzenle", icon: "sliders", onClick: () => setEditing(true) },
            lead.next_action_at && { label: "Sonraki aksiyonu ajandaya ekle", icon: "calendar", onClick: addToAgenda },
            lead.phone && { label: "Numarayı kopyala", icon: "copy", onClick: () => { navigator.clipboard.writeText(lead.phone); toast("Kopyalandı."); } },
            canEdit && "-",
            canEdit && { label: supplier ? "Müşteri görüşmesine çevir" : "Tedarik görüşmesine çevir", icon: "swap", onClick: () => actions.updateLead(lead, { kind: supplier ? "customer" : "supplier" }) },
            canEdit && { label: supplier ? "Tedarikçiyi sil" : "Kişiyi sil", icon: "trash", danger: true, onClick: async () => { if (await confirm({ title: supplier ? "Tedarikçiyi sil" : "Kişiyi sil", message: `“${lead.name}” ve iletişim geçmişi silinsin mi?`, confirmLabel: "Sil", danger: true })) { onClose(); actions.deleteLead(lead); } } },
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
          <div className={supplier ? "outcome-box__inputs" : undefined}>
            <input value={quickNote} onChange={(e) => setQuickNote(e.target.value)} placeholder={supplier ? "Kısa not — örn. “KDV hariç, 10 gün teslim”" : "Kısa not (isteğe bağlı) — örn. “akşam 7'den sonra arayın”"} maxLength={2000} onKeyDown={(e) => { if (e.key === "Enter" && quickNote.trim()) { e.preventDefault(); logOutcome(null); } }} />
            {supplier && <input inputMode="decimal" value={quote} onChange={(e) => setQuote(e.target.value)} placeholder={lead.value != null ? `Teklif ${formatMoney(lead.value, 0)}` : "Teklif ₺"} aria-label="Teklif tutarı" title="Teklif tutarı (₺): girilirse sonuçla birlikte kaydedilir" />}
          </div>
          <div className="outcomes">
            {settings.outcomes.map((o) => {
              const target = o.stage ? stageOf(settings, o.stage) : null;
              return (
                <button key={o.key} type="button" className="outcome-btn" style={{ "--sc": target?.color || "#64748b" }} disabled={Boolean(busy)} onClick={() => pickOutcome(o)}>
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
          {detailed && <ActivityForm lead={lead} settings={settings} meta={meta} initialType={type} initialNote={quickNote} supplier={supplier} onSave={async (body) => { await logOutcome(body.outcome ? settings.outcomes.find((o) => o.key === body.outcome) : null, { type: body.type, note: body.note || "", body, value: body.value }); setDetailed(false); }} />}
        </section>
      )}

      {canEdit && !stage?.lost && (
        <div className="win-row">
          {supplier ? (
            stage?.won && lead.won_at ? <button type="button" className="btn btn--soft" onClick={() => ctx.setTab("budget")}><Icon name="wallet" size={14} /> Bütçede görüntüle</button>
              : <button type="button" className="btn btn--red" onClick={() => setWinOpen(true)}><Icon name="check" size={14} /> İşlemi tamamla → Gidere yaz</button>
          ) : !lead.portfolio_id ? <button type="button" className="btn btn--green" onClick={() => setWinOpen(true)}><Icon name="briefcase" size={14} /> Satışı kapat → Portföye ekle</button>
            : <button type="button" className="btn btn--soft" onClick={() => ctx.setTab("portfolio")}><Icon name="briefcase" size={14} /> Portföyde görüntüle</button>}
          {lostStage && !stage?.won && <button type="button" className="btn btn--danger-ghost" onClick={() => setLostOpen(true)}><Icon name="x" size={14} /> {lostStage.label}</button>}
        </div>
      )}
      {stage?.lost && lead.lost_reason && <div className="notice notice--error"><span><strong>{lostStage?.label || "Kaybedildi"}:</strong> {lead.lost_reason}</span></div>}

      {quotes && quotes.rows.length > 0 && <QuoteCompare quotes={quotes} lead={lead} settings={settings} onOpen={(id) => ctx.openLead(id)} />}

      <dl className="lead-facts">
        <div><dt>{supplier ? "Teklif" : "Değer"}</dt><dd>{lead.value != null ? formatMoney(lead.value, 0) : "—"}</dd></div>
        <div><dt>Görüşme</dt><dd>{lead.contact_count || 0}{lead.last_contact_at ? <small> · son {relativeTime(lead.last_contact_at)}</small> : null}</dd></div>
        <div><dt>{supplier ? "Kategori" : "Kaynak"}</dt><dd>{lead.source || "—"}</dd></div>
        <div><dt>Takip eden</dt><dd>{lead.owner_id ? people[lead.owner_id]?.name || "—" : "—"}</dd></div>
      </dl>
      {lead.note && <p className="note-box selectable">{lead.note}</p>}

      <section className="drawer__section">
        <h4>Sorular {leadQuestions.length > 0 && <span className="muted">{leadQuestions.filter((q) => q.status === "open").length} açık</span>}</h4>
        {leadQuestions.map((q) => <QuestionItem key={q.id} q={q} ctx={ctx} compact />)}
        {canEdit && <form className="inline-add" onSubmit={async (e) => { e.preventDefault(); if (!question.trim()) return; await actions.createQuestion({ question: question.trim(), lead_id: lead.id, category: "Müşteri sorusu" }); setQuestion(""); }}><input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder={supplier ? "Tedarikçiye sorulacak / sorusu ve ↩" : "Kişinin sorusu / ihtiyacı ve ↩"} /></form>}
      </section>

      <section className="drawer__section">
        <h4>Zaman çizelgesi <span className="muted">{timeline.length}</span></h4>
        <Timeline items={timeline} ctx={ctx} />
      </section>

      {editing && <LeadForm lead={lead} ctx={ctx} onClose={() => setEditing(false)} onSave={async (changes) => { const r = await actions.updateLead(lead, changes); if (r) setEditing(false); }} />}
      {winOpen && <CloseDialog lead={lead} ctx={ctx} onClose={() => setWinOpen(false)} onSave={async (body) => { const r = await actions.closeLead(lead, body); if (r) setWinOpen(false); }} />}
      {lostOpen && <LostDialog supplier={supplier} title={lostStage?.label} onClose={() => setLostOpen(false)} onSave={async (reason) => { await actions.updateLead(lead, { stage: lostStage.key, lost_reason: reason || null }); setLostOpen(false); }} />}
      {askQuote && <QuoteDialog lead={lead} outcome={askQuote} onClose={() => setAskQuote(null)} onSave={async (value) => { const o = askQuote; setAskQuote(null); await logOutcome(o, { value }); }} />}
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
        const outcome = outcomeOf(settings, a.outcome);
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

function ActivityForm({ lead, settings, meta, initialType, initialNote, onSave, supplier = false }) {
  const [f, setF] = useState({ type: initialType, outcome: "", note: initialNote || "", occurred_at: toLocalInput(new Date().toISOString()), next_action_at: undefined, next_action: undefined, stage: "", value: "" });
  const preview = outcomePreview(lead, settings, { outcome: f.outcome || undefined, type: f.type, stage: f.stage || undefined, next_action_at: f.next_action_at === undefined ? undefined : fromLocalInput(f.next_action_at), next_action: f.next_action });
  const types = (meta.activity_types || []).filter((t) => !t.system);
  return (
    <form className="activity-form" onSubmit={(e) => { e.preventDefault(); const body = { type: f.type, outcome: f.outcome || undefined, note: f.note.trim(), occurred_at: fromLocalInput(f.occurred_at) }; if (f.next_action_at !== undefined) body.next_action_at = fromLocalInput(f.next_action_at); if (f.next_action !== undefined) body.next_action = f.next_action; if (f.stage) body.stage = f.stage; if (supplier && f.value.trim()) body.value = parseAmount(f.value); onSave(body); }}>
      <div className="form-grid">
        <Field label="Tür"><select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>{types.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</select></Field>
        <Field label="Sonuç"><select value={f.outcome} onChange={(e) => setF({ ...f, outcome: e.target.value })}><option value="">Sonuç yok</option>{settings.outcomes.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}</select></Field>
        <Field label="Görüşme zamanı"><input type="datetime-local" value={f.occurred_at} onChange={(e) => setF({ ...f, occurred_at: e.target.value })} /></Field>
        <Field label="Aşamayı değiştir"><select value={f.stage} onChange={(e) => setF({ ...f, stage: e.target.value })}><option value="">Sonuca göre</option>{settings.lead_stages.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select></Field>
        <Field label="Sonraki aksiyon tarihi"><input type="datetime-local" value={f.next_action_at ?? toLocalInput(preview.patch.next_action_at || lead.next_action_at)} onChange={(e) => setF({ ...f, next_action_at: e.target.value })} /></Field>
        <Field label="Sonraki aksiyon"><input value={f.next_action ?? (preview.patch.next_action ?? lead.next_action ?? "")} onChange={(e) => setF({ ...f, next_action: e.target.value })} placeholder="örn. Teklif gönder" /></Field>
        {supplier && <Field label="Teklif tutarı (₺)" hint="Girilirse tedarikçinin teklifi güncellenir."><input inputMode="decimal" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} placeholder={lead.value != null ? formatMoney(lead.value, 0) : "0"} /></Field>}
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
  const supplier = lead.kind === "supplier";
  const [f, setF] = useState({ name: lead.name, company: lead.company, title: lead.title, phone: lead.phone, email: lead.email, city: lead.city, source: lead.source, value: lead.value ?? "", owner_id: lead.owner_id ?? "", note: lead.note, item: lead.item || "" });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const owners = [...new Map([...ctx.members.map((m) => [m.user_id, m.name]), [ctx.project.owner_id, ctx.project.owner_name], ...Object.values(ctx.people).map((p) => [p.id, p.name])]).entries()];
  return (
    <Modal title={supplier ? "Tedarikçi bilgileri" : "Kişi bilgileri"} onClose={onClose} width={560} footer={<><button type="button" className="btn" onClick={onClose}>Vazgeç</button><button type="submit" form="lead-form" className="btn btn--primary" disabled={!String(f.name || "").trim()}>Kaydet</button></>}>
      <form id="lead-form" className="form-grid" onSubmit={(e) => { e.preventDefault(); const { item, ...rest } = f; onSave({ ...rest, ...(supplier ? { item: item.trim() || null } : {}), value: f.value === "" ? null : f.value, owner_id: f.owner_id ? Number(f.owner_id) : null }); }}>
        <Field label="Ad soyad"><input value={f.name} onChange={set("name")} maxLength={120} /></Field>
        <Field label="Firma / takım"><input value={f.company} onChange={set("company")} maxLength={160} /></Field>
        <Field label="Telefon"><input value={f.phone} onChange={set("phone")} maxLength={40} /></Field>
        <Field label="E-posta"><input type="email" value={f.email} onChange={set("email")} maxLength={160} /></Field>
        <Field label="Unvan"><input value={f.title} onChange={set("title")} maxLength={80} /></Field>
        <Field label="Şehir"><input value={f.city} onChange={set("city")} maxLength={80} /></Field>
        {supplier && <Field label="Tedarik konusu" className="span2" hint="Aynı konudaki tedarikçilerin teklifleri karşılaştırılır."><input list="supplier-items-form" value={f.item} onChange={set("item")} maxLength={160} placeholder="örn. Kupa ve madalya" /><datalist id="supplier-items-form">{[...new Set(ctx.leads.filter((l) => l.kind === "supplier" && l.item).map((l) => l.item))].map((i) => <option key={i} value={i} />)}</datalist></Field>}
        <Field label={supplier ? "Kategori" : "Kaynak"}><input list="lead-sources" value={f.source} onChange={set("source")} maxLength={80} /><datalist id="lead-sources">{((supplier ? ctx.settings.supplier_categories : ctx.settings.lead_sources) || []).map((s) => <option key={s} value={s} />)}</datalist></Field>
        <Field label={supplier ? "Teklif (₺)" : "Değer (₺)"}><input inputMode="decimal" value={f.value} onChange={set("value")} placeholder="örn. 15.000" /></Field>
        <Field label="Takip eden" className="span2"><select value={f.owner_id} onChange={set("owner_id")}><option value="">—</option>{owners.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></Field>
        <Field label="Not" className="span2"><textarea rows={3} value={f.note} onChange={set("note")} /></Field>
      </form>
    </Modal>
  );
}

/** Tedarikte teklif tutarı soran sonuçlar ("Fiyat alındı" ve o aşamaya götürenler). */
const isQuoteOutcome = (o) => o?.key === "fiyat_alindi" || o?.stage === "fiyat_alindi" || /fiyat al[ıi]nd[ıi]|teklif al/i.test(o?.label || "");

function QuoteDialog({ lead, outcome, onClose, onSave }) {
  const [value, setValue] = useState(lead.value != null ? String(lead.value).replace(".", ",") : "");
  const amount = parseAmount(value);
  return (
    <Modal title={outcome.label} onClose={onClose} width={420} footer={<><button type="button" className="btn" onClick={onClose}>Vazgeç</button><button type="button" className="btn btn--ghost" onClick={() => onSave(null)}>Tutarsız kaydet</button><button type="submit" form="quote-form" className="btn btn--primary" disabled={!(amount > 0)}>Teklifi kaydet</button></>}>
      <form id="quote-form" className="composer" onSubmit={(e) => { e.preventDefault(); if (amount > 0) onSave(amount); }}>
        <p className="muted small">{lead.company || lead.name}{lead.item ? ` · ${lead.item}` : ""}: verilen fiyat tedarikçinin teklifi olarak kaydedilir ve aynı konudaki diğer tekliflerle karşılaştırılır.</p>
        <Field label="Teklif tutarı (₺)"><input className="money-input" autoFocus inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder="örn. 18.500" /></Field>
      </form>
    </Modal>
  );
}

/** Aynı tedarik konusundaki teklifler, ucuzdan pahalıya; en ucuz vurgulu. */
function QuoteCompare({ quotes, lead, settings, onOpen }) {
  return (
    <section className="drawer__section quote-compare">
      <h4><Icon name="arrows" size={12} /> Fiyat karşılaştırması · {quotes.item} <span className="muted">{quotes.quoted} teklif</span></h4>
      <ul>
        {quotes.rows.map(({ lead: l, value, cheapest, diff, ratio, excluded }) => {
          const st = stageOf(settings, l.stage);
          const self = l.id === lead.id;
          return (
            <li key={l.id} className={`${cheapest ? "is-best" : ""} ${self ? "is-self" : ""}`}>
              <button type="button" onClick={() => !self && onOpen(l.id)} disabled={self}>
                <span className="quote-compare__name"><strong>{l.company || l.name}</strong><small>{st?.label}{self ? " · bu kayıt" : ""}</small></span>
                <span className="quote-compare__bar"><span style={{ width: `${Math.max(4, ratio * 100)}%` }} /></span>
                <span className="quote-compare__val">
                  {value != null ? <strong>{money(value)}</strong> : <span className="muted">teklif yok</span>}
                  {cheapest ? <small className="text-green">en uygun</small> : diff ? <small className="muted">+{money(diff)}</small> : excluded ? <small className="muted">vazgeçildi</small> : null}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * Kapanış: müşteride "Satışı kapat" (portföy + istenirse gelir kaydı),
 * tedarikte "İşlemi tamamla" (gider kaydı; istenirse tedarikçi portföye).
 */
function CloseDialog({ lead, ctx, onClose, onSave }) {
  const supplier = lead.kind === "supplier";
  const fin = useProjectFinance(ctx.project.id);
  const accounts = fin.data?.accounts || [];
  const settings = ctx.settings;
  const cats = settings.portfolio_categories || [];
  const finCats = settings.finance_categories || [];
  const [f, setF] = useState({
    category: supplier ? "Tedarikçi" : cats[0] || "",
    value: lead.value != null ? String(lead.value).replace(".", ",") : "",
    note: lead.note || "",
    start_date: isoDay(),
    portfolio: !supplier,
    entry: supplier || lead.value != null,
    account_id: "",
    status: "pending",
    due_date: "",
    entry_category: supplier ? lead.source || "" : finCats.find((c) => /sponsor/i.test(c)) || finCats[0] || "",
    description: supplier ? `${lead.item || "Tedarik"} — ${lead.company || lead.name}` : `${lead.company || lead.name} — satış`,
  });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const accountId = f.account_id || (fin.data?.default_account_id ? String(fin.data.default_account_id) : "");
  const amount = parseAmount(f.value);
  const account = accounts.find((a) => String(a.id) === accountId);
  const valid = !supplier || amount > 0;
  const won = (supplier ? settings.supplier_stages : settings.lead_stages).find((s) => s.won);
  const submit = (e) => {
    e.preventDefault();
    if (!valid) return;
    onSave({
      portfolio: f.portfolio,
      category: f.portfolio ? f.category || null : undefined,
      value: f.value === "" ? null : amount,
      ...(f.portfolio ? { note: f.note, start_date: f.start_date } : {}),
      entry: f.entry && (amount > 0) ? { amount, account_id: accountId ? Number(accountId) : null, status: f.status, due_date: f.status === "paid" ? null : f.due_date || null, category: f.entry_category || null, description: f.description || null } : false,
    });
  };
  return (
    <Modal title={supplier ? "İşlemi tamamla → Gidere yaz" : "Satışı kapat"} onClose={onClose} width={600}
      footer={<><button type="button" className="btn" onClick={onClose}>Vazgeç</button><button type="submit" form="close-form" className={`btn ${supplier ? "btn--red" : "btn--green"}`} disabled={!valid}><Icon name="check" size={14} /> {supplier ? (f.status === "paid" ? "Tamamla ve öde" : "Tamamla ve gidere yaz") : f.entry && amount > 0 ? "Kapat, portföye ve gelire ekle" : f.portfolio ? "Kapat ve portföye ekle" : "Satışı kapat"}</button></>}>
      <form id="close-form" className="composer" onSubmit={submit}>
        <div className="info-box"><Icon name={supplier ? "handshake" : "briefcase"} /><div>
          <strong>{supplier ? lead.company || lead.name : lead.name}{supplier && lead.item ? ` · ${lead.item}` : ""}</strong>
          <span className="muted small">“{won?.label || (supplier ? "Anlaşıldı" : "Kazanıldı")}” aşamasına alınır, sonraki aksiyon temizlenir{supplier ? "; anlaşılan tutar projenin bütçesine gider olarak yazılır." : "."}</span>
        </div></div>
        <div className="form-grid">
          <Field label={supplier ? "Anlaşılan tutar (₺)" : "Satış tutarı (₺)"} hint={supplier && lead.value != null ? `Son teklif: ${formatMoney(lead.value, 0)}` : ""}><input className="money-input" autoFocus inputMode="decimal" value={f.value} onChange={set("value")} placeholder="0" /></Field>
          {!supplier && <Field label="Portföy kategorisi"><select value={f.category} onChange={set("category")} disabled={!f.portfolio}>{cats.map((c) => <option key={c} value={c}>{c}</option>)}<option value="">Kategorisiz</option></select></Field>}
          {supplier && <Field label="Gider kategorisi"><input list="close-cats" value={f.entry_category} onChange={set("entry_category")} placeholder="örn. Ödül" /><datalist id="close-cats">{[...new Set([...(settings.supplier_categories || []), ...finCats])].map((c) => <option key={c} value={c} />)}</datalist></Field>}
        </div>
        <div className={`close-entry ${f.entry ? "is-on" : ""} ${supplier ? "is-expense" : "is-income"}`}>
          {supplier ? <strong className="close-entry__title"><Icon name="receipt" size={14} /> Gider kaydı</strong>
            : <label className="toggle close-entry__title"><input type="checkbox" checked={f.entry} onChange={(e) => setF({ ...f, entry: e.target.checked })} /> <Icon name="trend" size={14} /> Gelir kaydı aç</label>}
          {f.entry && (
            <div className="form-grid">
              <AccountSelectField accounts={accounts} value={accountId} onChange={(v) => setF({ ...f, account_id: v })} emptyLabel="Hesapsız (yalnız bütçede)" className="span2"
                hint={fin.loading && !fin.data ? "Hesaplar yükleniyor…" : account ? `${f.status === "paid" ? "Şimdi" : "“Ödendi” olunca"} ${account.name} bakiyesine ${supplier ? "düşer" : "eklenir"}.` : accounts.length ? "" : "Kayıt girebileceğiniz hesap yok; kalem yalnız proje bütçesinde tutulur."} />
              <Field label="Durum">
                <Segmented size="sm" value={f.status} onChange={(v) => setF({ ...f, status: v })} options={[{ value: "planned", label: "Tahmin" }, { value: "pending", label: "Bekliyor" }, { value: "paid", label: supplier ? "Ödendi" : "Tahsil edildi" }]} />
              </Field>
              {f.status !== "paid" ? <Field label="Vade tarihi"><input type="date" value={f.due_date} onChange={set("due_date")} /></Field> : <span />}
              {!supplier && <Field label="Gelir kategorisi"><input list="close-fcats" value={f.entry_category} onChange={set("entry_category")} /><datalist id="close-fcats">{finCats.map((c) => <option key={c} value={c} />)}</datalist></Field>}
              <Field label="Açıklama" className={supplier ? "span2" : ""}><input value={f.description} onChange={set("description")} maxLength={255} /></Field>
            </div>
          )}
        </div>
        <label className="toggle"><input type="checkbox" checked={f.portfolio} onChange={(e) => setF({ ...f, portfolio: e.target.checked })} /> {supplier ? "Tedarikçiyi portföye de ekle (Tedarikçi)" : "Portföye ekle"}</label>
        {f.portfolio && !supplier && (
          <div className="form-grid">
            <Field label="Başlangıç"><input type="date" value={f.start_date} onChange={set("start_date")} /></Field>
            <Field label="Not"><input value={f.note} onChange={set("note")} /></Field>
          </div>
        )}
      </form>
    </Modal>
  );
}

function LostDialog({ onClose, onSave, supplier = false, title }) {
  const [reason, setReason] = useState("");
  const presets = supplier ? ["Fiyat yüksek", "Daha uygun teklif var", "Teslim süresi uymadı", "Kalite yetersiz", "Ulaşılamadı"] : ["Bütçe yetersiz", "Başka organizasyona katıldı", "Tarihler uymadı", "İlgilenmiyor", "Ulaşılamadı"];
  const name = title || (supplier ? "Vazgeçildi" : "Kaybedildi");
  return (
    <Modal title={name} onClose={onClose} width={440} footer={<><button type="button" className="btn" onClick={onClose}>Vazgeç</button><button type="submit" form="lost-form" className="btn btn--primary btn--danger">{name} olarak işaretle</button></>}>
      <form id="lost-form" className="composer" onSubmit={(e) => { e.preventDefault(); onSave(reason.trim()); }}>
        <Field label="Neden"><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Kısaca neden?" maxLength={200} /></Field>
        <div className="chips">{presets.map((p) => <button key={p} type="button" className="chip chip--off" onClick={() => setReason(p)}>{p}</button>)}</div>
      </form>
    </Modal>
  );
}

