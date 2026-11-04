// Portföy: satışı kapanan kişi ve kurumlar. Proje içinde ve tüm projelerde (genel).
import React, { useMemo, useState } from "react";
import { Empty, ErrorNote, Field, Icon, Modal, Spinner, useConfirm } from "../../components/ui";
import { del, patch, request, useCommand, useResource } from "../../api";
import { includesTr, prettyPhone } from "../../lib/helpers";
import { mailLink, telLink, waLink } from "../../lib/projectUtils";
import { Avatar, BASE, money, saveRowsXlsx, useRun } from "./common";

const STATUSES = [{ key: "active", label: "Aktif" }, { key: "passive", label: "Pasif" }, { key: "renewal", label: "Yenilenecek" }];
const STATUS_TONE = { active: "green", passive: "", renewal: "amber" };

export function ProjectPortfolio({ ctx, embedded = false }) {
  const { portfolio, settings, canEdit, actions, project } = ctx;
  const [editing, setEditing] = useState(null);
  useCommand("new", () => { if (!embedded && canEdit) setEditing({}); });
  return (
    <PortfolioBody items={portfolio} categories={settings.portfolio_categories || []} canEdit={canEdit} title={project.name}
      onAdd={() => setEditing({})} onEdit={setEditing} onDelete={actions.deletePortfolio}
      onOpenLead={(id) => ctx.openLead(id)}
      dialog={editing && <PortfolioForm entry={editing.id ? editing : null} categories={settings.portfolio_categories || []} onClose={() => setEditing(null)} onSave={async (body) => { const r = await actions.savePortfolio(editing.id ? editing : null, body); if (r) setEditing(null); }} />} />
  );
}

export function GlobalPortfolio({ projects, onOpenProject }) {
  const run = useRun();
  const res = useResource(`${BASE}/portfolio`);
  const [editing, setEditing] = useState(null);
  useCommand("new", () => setEditing({}));
  const items = res.data?.items || [];
  const categories = useMemo(() => [...new Set([...(res.data?.categories || []), "Katılımcı takım", "Sponsor", "Tedarikçi", "Müşteri", "Partner"])], [res.data]);
  const save = async (body) => {
    const r = editing?.id ? await patch(`${BASE}/portfolio/${editing.id}`, body) : await request({ method: "POST", path: `${BASE}/portfolio`, body, queue: false });
    if (run(r, "Kaydedildi.")) { setEditing(null); res.reload({ quiet: true }); }
  };
  const remove = async (entry) => { if (run(await del(`${BASE}/portfolio/${entry.id}`), "Portföyden çıkarıldı.")) res.reload({ quiet: true }); };
  if (res.loading && !res.data) return <Spinner />;
  return (
    <>
      <ErrorNote error={res.error && !res.data ? res.error : null} onRetry={res.reload} />
      <PortfolioBody items={items} categories={categories} canEdit global title="Tüm projeler" onAdd={() => setEditing({})} onEdit={setEditing} onDelete={remove} onOpenProject={onOpenProject}
        dialog={editing && <PortfolioForm entry={editing.id ? editing : null} categories={categories} projects={(projects || []).filter((p) => p.access?.can_edit)} onClose={() => setEditing(null)} onSave={save} />} />
    </>
  );
}

function PortfolioBody({ items, categories, canEdit, global = false, title, onAdd, onEdit, onDelete, onOpenProject, onOpenLead, dialog }) {
  const confirm = useConfirm();
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const shown = items.filter((x) => (!category || x.category === category) && (!status || x.status === status) && (!q || includesTr(`${x.name} ${x.company} ${x.phone} ${x.email} ${x.city} ${x.note} ${x.project_name || ""}`, q)));
  const total = shown.reduce((s, x) => s + (Number(x.value) || 0), 0);
  const cats = [...new Set([...categories, ...items.map((x) => x.category).filter(Boolean)])];
  const byCat = cats.map((c) => ({ c, n: items.filter((x) => x.category === c).length })).filter((x) => x.n);
  const exportXlsx = () => saveRowsXlsx(`Portfoy-${title}`.replace(/[\\/:*?"<>|]/g, "-"), [["Ad", "Firma", "Kategori", "Durum", "Tutar", "Telefon", "E-posta", "Şehir", "Başlangıç", "Proje", "Not"], ...shown.map((x) => [x.name, x.company, x.category, STATUSES.find((s) => s.key === x.status)?.label || x.status, x.value == null ? "" : String(x.value), x.phone, x.email, x.city, x.start_date || "", x.project_name || "", x.note])], "Portföy", { A: 180, B: 180, K: 260 });
  return (
    <div className="proj-section">
      <div className="kpis kpis--compact">
        <div className="kpi kpi--hero"><span><Icon name="briefcase" size={12} /> Portföy</span><strong>{items.length}</strong><small>{items.filter((x) => x.status === "active").length} aktif</small></div>
        <div className="kpi kpi--green"><span>Toplam değer</span><strong>{money(items.reduce((s, x) => s + (Number(x.value) || 0), 0))}</strong><small>{shown.length !== items.length ? `süzülen: ${money(total)}` : "tüm kayıtlar"}</small></div>
        {byCat.slice(0, 3).map(({ c, n }) => <button key={c} type="button" className={`kpi kpi--btn ${category === c ? "kpi--blue" : ""}`} onClick={() => setCategory(category === c ? "" : c)}><span>{c}</span><strong>{n}</strong><small>{money(items.filter((x) => x.category === c).reduce((s, x) => s + (Number(x.value) || 0), 0))}</small></button>)}
      </div>
      <div className="filters">
        <div className="search-box"><Icon name="search" size={14} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Portföyde ara" /></div>
        <select className="select-sm" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Kategori"><option value="">Tüm kategoriler</option>{cats.map((c) => <option key={c} value={c}>{c}</option>)}</select>
        <select className="select-sm" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Durum"><option value="">Tüm durumlar</option>{STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select>
        <span className="spacer" />
        {items.length > 0 && <button type="button" className="btn btn--sm" onClick={exportXlsx}><Icon name="download" size={13} /> Excel</button>}
        {canEdit && <button type="button" className="btn btn--primary btn--sm" onClick={onAdd}><Icon name="plus" size={13} /> Portföye ekle</button>}
      </div>
      {shown.length ? (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Ad</th><th>Kategori</th><th>Durum</th><th>İletişim</th>{global && <th>Proje</th>}<th>Başlangıç</th><th className="num">Tutar</th><th /></tr></thead>
            <tbody>
              {shown.map((x) => (
                <tr key={x.id}>
                  <td><div className="lead-cell"><Avatar name={x.name} size={28} /><span><strong>{x.name}</strong><small>{[x.company !== x.name ? x.company : null, x.title, x.city].filter(Boolean).join(" · ")}</small></span></div></td>
                  <td>{x.category ? <span className="pill">{x.category}</span> : <span className="muted">—</span>}</td>
                  <td><span className={`pill ${STATUS_TONE[x.status] ? `pill--${STATUS_TONE[x.status]}` : ""}`}>{STATUSES.find((s) => s.key === x.status)?.label}</span></td>
                  <td><span className="lead-phone">{x.phone ? prettyPhone(x.phone) : x.email || "—"}</span>
                    <span className="contact-mini">
                      {telLink(x.phone) && <button type="button" className="icon-btn icon-btn--xs" title="Ara" onClick={() => window.elitlig.app.openExternal(telLink(x.phone))}><Icon name="phone" size={12} /></button>}
                      {waLink(x.phone) && <button type="button" className="icon-btn icon-btn--xs icon-btn--wa" title="WhatsApp" onClick={() => window.elitlig.app.openExternal(waLink(x.phone))}><Icon name="message" size={12} /></button>}
                      {mailLink(x.email) && <button type="button" className="icon-btn icon-btn--xs" title="E-posta" onClick={() => window.elitlig.app.openExternal(mailLink(x.email))}><Icon name="mail" size={12} /></button>}
                    </span>
                  </td>
                  {global && <td>{x.project_name ? <button type="button" className="link-btn small" onClick={() => onOpenProject?.(x.project_id)}><span className="dot-label" style={{ background: x.project_color }} />{x.project_name}</button> : <span className="muted small">Projesiz</span>}</td>}
                  <td className="muted">{x.start_date ? new Date(`${x.start_date}T12:00:00`).toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric" }) : "—"}</td>
                  <td className="num"><strong>{x.value != null ? money(x.value) : "—"}</strong></td>
                  <td><div className="row-actions">
                    {onOpenLead && x.lead_id && <button type="button" className="icon-btn icon-btn--xs" title="Kişi kaydını aç" onClick={() => onOpenLead(x.lead_id)}><Icon name="user" size={12} /></button>}
                    {(x.can_edit ?? canEdit) && <button type="button" className="icon-btn icon-btn--xs" title="Düzenle" onClick={() => onEdit(x)}><Icon name="sliders" size={12} /></button>}
                    {(x.can_edit ?? canEdit) && <button type="button" className="icon-btn icon-btn--xs" title="Sil" onClick={async () => { if (await confirm({ title: "Portföyden çıkar", message: `“${x.name}” portföyden silinsin mi?`, confirmLabel: "Sil", danger: true })) onDelete(x); }}><Icon name="trash" size={12} /></button>}
                  </div></td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr><td colSpan={global ? 6 : 5}>{shown.length} kayıt</td><td className="num">{money(total)}</td><td /></tr></tfoot>
          </table>
        </div>
      ) : <Empty icon="briefcase" title={items.length ? "Eşleşen kayıt yok" : "Portföy boş"} text="Kişiler sekmesinde “Satışı kapat → Portföye ekle” ile kazanılan kişiler buraya gelir; elle de ekleyebilirsiniz." />}
      {dialog}
    </div>
  );
}

function PortfolioForm({ entry, categories, projects = null, onClose, onSave }) {
  const [f, setF] = useState({ name: entry?.name || "", company: entry?.company || "", title: entry?.title || "", phone: entry?.phone || "", email: entry?.email || "", city: entry?.city || "", category: entry?.category || categories[0] || "", status: entry?.status || "active", value: entry?.value ?? "", start_date: entry?.start_date || "", note: entry?.note || "", project_id: entry?.project_id || "" });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal title={entry ? "Portföy kaydı" : "Portföye ekle"} onClose={onClose} width={580} footer={<><button type="button" className="btn" onClick={onClose}>Vazgeç</button><button type="submit" form="pf-form" className="btn btn--primary" disabled={!f.name.trim()}>Kaydet</button></>}>
      <form id="pf-form" className="form-grid" onSubmit={(e) => { e.preventDefault(); const body = { ...f, value: f.value === "" ? null : f.value, start_date: f.start_date || null }; if (projects && !entry) body.project_id = f.project_id ? Number(f.project_id) : undefined; else delete body.project_id; onSave(body); }}>
        <Field label="Ad / kurum"><input value={f.name} onChange={set("name")} maxLength={120} autoFocus /></Field>
        <Field label="Firma / takım"><input value={f.company} onChange={set("company")} maxLength={160} /></Field>
        <Field label="Kategori"><input list="pf-cats" value={f.category} onChange={set("category")} maxLength={60} /><datalist id="pf-cats">{categories.map((c) => <option key={c} value={c} />)}</datalist></Field>
        <Field label="Durum"><select value={f.status} onChange={set("status")}>{STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select></Field>
        <Field label="Telefon"><input value={f.phone} onChange={set("phone")} maxLength={40} /></Field>
        <Field label="E-posta"><input type="email" value={f.email} onChange={set("email")} maxLength={160} /></Field>
        <Field label="Tutar (₺)"><input inputMode="decimal" value={f.value} onChange={set("value")} /></Field>
        <Field label="Başlangıç"><input type="date" value={f.start_date} onChange={set("start_date")} /></Field>
        <Field label="Şehir"><input value={f.city} onChange={set("city")} maxLength={80} /></Field>
        <Field label="Unvan"><input value={f.title} onChange={set("title")} maxLength={80} /></Field>
        {projects && !entry && <Field label="Proje" className="span2"><select value={f.project_id} onChange={set("project_id")}><option value="">Projesiz (yalnız ben)</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>}
        <Field label="Not" className="span2"><textarea rows={2} value={f.note} onChange={set("note")} /></Field>
      </form>
    </Modal>
  );
}
