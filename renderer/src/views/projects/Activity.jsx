// İletişim: projenin tüm iletişim ve hareket geçmişi; süzgeç ve not ekleme.
import React, { useMemo, useState } from "react";
import { Empty, Icon } from "../../components/ui";
import { useCommand } from "../../api";
import { includesTr } from "../../lib/helpers";
import { Timeline } from "./LeadPanel";

export default function Activity({ ctx, embedded = false, step = null }) {
  const { activities, leads, steps, meta, canEdit, actions } = ctx;
  const [type, setType] = useState("");
  const [leadId, setLeadId] = useState("");
  const [stepId, setStepId] = useState(step ? String(step.id) : "");
  const [q, setQ] = useState("");
  const [hideSystem, setHideSystem] = useState(false);
  const [form, setForm] = useState({ type: "note", note: "", lead_id: "", step_id: step ? String(step.id) : "" });
  useCommand("new", () => { if (!embedded) document.getElementById("activity-note")?.focus(); });
  const shown = useMemo(() => activities.filter((a) => (!type || a.type === type) && (!leadId || String(a.lead_id) === leadId) && (!stepId || String(a.step_id) === stepId)
    && (!hideSystem || !["status", "system"].includes(a.type)) && (!q || includesTr(a.note, q))), [activities, type, leadId, stepId, hideSystem, q]);
  const types = (meta.activity_types || []);
  const submit = async (e) => {
    e.preventDefault();
    if (!form.note.trim()) return;
    const lead = form.lead_id ? leads.find((l) => String(l.id) === form.lead_id) : null;
    const r = await actions.logActivity({ type: form.type, note: form.note.trim(), lead_id: lead?.id || undefined, step_id: form.step_id ? Number(form.step_id) : undefined }, lead && form.type !== "note" ? { ...lead, contact_count: (lead.contact_count || 0) + 1, last_contact_at: new Date().toISOString() } : null);
    if (r) setForm({ ...form, note: "" });
  };
  return (
    <div className={`proj-section ${embedded ? "" : "activity-layout"}`}>
      {canEdit && (
        <form className="card activity-add" onSubmit={submit}>
          <textarea id="activity-note" rows={2} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Not, görüşme özeti, karar… (⌘↩ kaydet)" onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); e.currentTarget.form.requestSubmit(); } }} />
          <div className="row-gap">
            <select className="select-sm" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} aria-label="Tür">{types.filter((t) => !t.system).map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</select>
            <select className="select-sm" value={form.lead_id} onChange={(e) => setForm({ ...form, lead_id: e.target.value })} aria-label="Kişi"><option value="">Kişi seçin (isteğe bağlı)</option>{leads.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
            <select className="select-sm select-step" value={form.step_id} onChange={(e) => setForm({ ...form, step_id: e.target.value })} aria-label="Adım"><option value="">Adım (isteğe bağlı)</option>{steps.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}</select>
            <span className="spacer" />
            <button type="submit" className="btn btn--primary btn--sm" disabled={!form.note.trim()}><Icon name="plus" size={13} /> Kaydet</button>
          </div>
        </form>
      )}
      <div className="filters">
        <div className="search-box"><Icon name="search" size={14} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Notlarda ara" /></div>
        <select className="select-sm" value={type} onChange={(e) => setType(e.target.value)} aria-label="Tür"><option value="">Tüm türler</option>{types.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</select>
        <select className="select-sm" value={leadId} onChange={(e) => setLeadId(e.target.value)} aria-label="Kişi"><option value="">Tüm kişiler</option>{leads.filter((l) => activities.some((a) => a.lead_id === l.id)).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
        <select className="select-sm select-step" value={stepId} onChange={(e) => setStepId(e.target.value)} aria-label="Adım"><option value="">Tüm adımlar</option>{steps.filter((s) => activities.some((a) => a.step_id === s.id) || (step && s.id === step.id)).map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}</select>
        <label className="toggle"><input type="checkbox" checked={hideSystem} onChange={(e) => setHideSystem(e.target.checked)} /> Sistem kayıtlarını gizle</label>
        <span className="spacer" /><span className="muted small">{shown.length} kayıt</span>
      </div>
      <div className="card card--flat">{shown.length ? <Timeline items={shown} ctx={ctx} showSubject /> : <Empty icon="activity" title="Kayıt yok" text="Aramalar, notlar ve durum değişiklikleri burada birikir." />}</div>
    </div>
  );
}
