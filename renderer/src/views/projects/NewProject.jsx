// Yeni proje: şablon seçimi (aşamalar ve adım sayısı görünür), ad, renk, tarihler.
// Takvim planı: etkinlik tarihi girilince geriye doğru dönem planı önerilir
// (Planlama, Hazırlık, Tanıtım, Kayıt, Organizasyon, Kapanış + kilometre taşları);
// proje oluşunca /:id/periods/apply-plan ile projeye uygulanır.
import React, { useEffect, useState } from "react";
import { Field, Icon, Modal, Spinner, useConfirm } from "../../components/ui";
import { request, useResource } from "../../api";
import { PROJECT_COLORS } from "../../lib/projectUtils";
import { BASE, useRun } from "./common";
import { formatRange } from "../../lib/timelineUtils";
import "./timeline/timeline.css";

export default function NewProject({ meta, onClose, onCreated }) {
  const run = useRun();
  const confirm = useConfirm();
  const templates = useResource(`${BASE}/templates`);
  const items = templates.data?.items || [];
  const [form, setForm] = useState({ name: "", template: "organizasyon-sezonu", color: "", status: "active", start_date: "", end_date: "", description: "" });
  const [busy, setBusy] = useState(false);
  const planMeta = useResource(`${BASE}/timeline/meta`);
  const planTemplates = planMeta.data?.meta?.templates || [];
  const [plan, setPlan] = useState({ template: "", event_date: "", event_end: "" });
  const [planItems, setPlanItems] = useState([]);
  useEffect(() => {
    if (!plan.template || !plan.event_date) { setPlanItems([]); return undefined; }
    let alive = true;
    const t = setTimeout(async () => {
      const r = await request({ method: "POST", path: `${BASE}/timeline/plan-preview`, body: plan, queue: false });
      if (alive) setPlanItems(r.ok ? r.data?.items || [] : []);
    }, 200);
    return () => { alive = false; clearTimeout(t); };
  }, [plan]);
  const tpl = items.find((t) => t.key === form.template) || null;
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  useEffect(() => { if (items.length && !items.some((t) => t.key === form.template)) set("template", items[0].key); }, [items]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setBusy(true);
    const r = await request({ method: "POST", path: BASE, body: { ...form, color: form.color || tpl?.color || undefined, icon: tpl?.icon, template: form.template || null, start_date: form.start_date || null, end_date: form.end_date || null }, queue: false });
    let periods = 0;
    if (r.ok && plan.template && plan.event_date) {
      const p = await request({ method: "POST", path: `${BASE}/${r.data.item.id}/periods/apply-plan`, body: plan, queue: false });
      periods = p.ok ? p.data?.created || 0 : 0;
    }
    setBusy(false);
    const base = r.data?.created?.steps ? `Proje oluşturuldu: ${r.data.created.phases} aşama, ${r.data.created.steps} adım` : "Proje oluşturuldu";
    if (run(r, `${base}${periods ? `, takvimde ${periods} dönem` : ""}.`)) onCreated(r.data.item);
  };
  const removeTemplate = async (t) => {
    if (!(await confirm({ title: "Şablonu sil", message: `“${t.name}” şablonu silinsin mi? Bu şablondan açılmış projeler etkilenmez.`, confirmLabel: "Sil", danger: true }))) return;
    if (run(await request({ method: "DELETE", path: `${BASE}/templates/${t.key}` }), "Şablon silindi.")) templates.reload({ quiet: true });
  };

  return (
    <Modal title="Yeni proje" onClose={onClose} width={860} className="modal--wide"
      footer={<>
        {tpl && <span className="muted small spacer">{tpl.phase_count} aşama · {tpl.step_count} adım{tpl.roles?.length ? ` · ${tpl.roles.length} rol` : ""} oluşturulacak</span>}
        <button type="button" className="btn" onClick={onClose}>Vazgeç</button>
        <button type="submit" form="new-project" className="btn btn--primary" disabled={!form.name.trim() || busy}>{busy ? "Oluşturuluyor…" : "Projeyi oluştur"}</button>
      </>}>
      <form id="new-project" className="composer" onSubmit={submit}>
        <input className="composer__title" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Proje adı — örn. 2027 Bahar Sezonu" maxLength={120} autoFocus />
        <div className="section-title">Şablon</div>
        {templates.loading && !templates.data ? <Spinner /> : (
          <div className="tpl-grid">
            {items.map((t) => (
              <button key={t.key} type="button" className={`tpl-card ${form.template === t.key ? "is-on" : ""} ${t.key === "organizasyon-sezonu" ? "is-featured" : ""}`} style={{ "--pc": t.color }} onClick={() => set("template", t.key)}>
                <span className="tpl-card__icon"><Icon name={t.icon || "folder"} size={18} strokeWidth={2} /></span>
                <span className="tpl-card__text">
                  <strong>{t.name}{t.key === "organizasyon-sezonu" && <em>Önerilen</em>}{!t.builtin && <em className="is-mine">Benim</em>}</strong>
                  <small>{t.phase_count} aşama · {t.step_count} adım</small>
                </span>
                {!t.builtin && <span className="tpl-card__del" role="button" tabIndex={0} title="Şablonu sil" onClick={(e) => { e.stopPropagation(); removeTemplate(t); }}><Icon name="trash" size={13} /></span>}
              </button>
            ))}
          </div>
        )}
        {tpl && (
          <div className="tpl-preview" style={{ "--pc": tpl.color }}>
            <p>{tpl.description || "Açıklama yok."}</p>
            {tpl.phases.length > 0 && <div className="tpl-phases">{tpl.phases.map((p, i) => <span key={`${p}${i}`}><b>{i + 1}</b>{p}</span>)}</div>}
            {tpl.roles?.length > 0 && <p className="muted small"><Icon name="users" size={12} /> Roller: {tpl.roles.join(", ")} — kişilere Ayarlar'dan eşlenir.</p>}
          </div>
        )}
        <section className="pj-new__plan" aria-label="Takvim planı">
          <div className="section-title">Takvim planı <span className="muted small">(isteğe bağlı)</span></div>
          <div className="form-grid form-grid--3">
            <Field label="Plan şablonu">
              <select value={plan.template} onChange={(e) => setPlan((p) => ({ ...p, template: e.target.value }))} aria-label="Plan şablonu">
                <option value="">Plan yok</option>
                {planTemplates.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
            </Field>
            <Field label="Etkinlik başlangıcı"><input type="date" value={plan.event_date} onChange={(e) => setPlan((p) => ({ ...p, event_date: e.target.value }))} aria-label="Etkinlik başlangıcı" /></Field>
            <Field label="Etkinlik bitişi"><input type="date" value={plan.event_end} min={plan.event_date || undefined} onChange={(e) => setPlan((p) => ({ ...p, event_end: e.target.value }))} aria-label="Etkinlik bitişi" /></Field>
          </div>
          {plan.template && <p className="muted small">{planTemplates.find((t) => t.key === plan.template)?.hint}</p>}
          {planItems.length > 0 && (
            <ol className="pj-new__planlist" aria-label="Önerilen dönemler">
              {planItems.map((it) => (
                <li key={it.ref} style={{ "--pc": it.color }}><span className={it.kind === "milestone" ? "pj-new__ms" : "pj-new__swatch"} aria-hidden="true" /><strong>{it.name}</strong> <small>{formatRange(it.start_date, it.end_date)}</small></li>
              ))}
            </ol>
          )}
        </section>
        <div className="form-grid form-grid--3">
          <Field label="Durum">
            <select value={form.status} onChange={(e) => set("status", e.target.value)}>{(meta.project_statuses || [{ key: "active", label: "Yürütülüyor" }, { key: "planning", label: "Planlama" }]).map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select>
          </Field>
          <Field label="Başlangıç"><input type="date" value={form.start_date} onChange={(e) => set("start_date", e.target.value)} /></Field>
          <Field label="Bitiş"><input type="date" value={form.end_date} min={form.start_date || undefined} onChange={(e) => set("end_date", e.target.value)} /></Field>
          <Field label="Açıklama" className="span3"><input value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="İsteğe bağlı" /></Field>
          <Field label="Renk" className="span3">
            <div className="color-dots">{PROJECT_COLORS.map((c) => <button key={c} type="button" className={(form.color || tpl?.color) === c ? "is-on" : ""} style={{ background: c }} onClick={() => set("color", c)} aria-label={c} />)}</div>
          </Field>
        </div>
      </form>
    </Modal>
  );
}
