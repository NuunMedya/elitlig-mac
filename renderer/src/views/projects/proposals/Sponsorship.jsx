// Sponsorluk sekmesi: paket kartları (kontenjan, satış), hak kataloğu ve
// karşılaştırma matrisi (tıkla ✓, çift tıkla değer), firmalara bağlı paketler
// (satıldı → gelir kaydı + kazanıldı) ve markalı sunumlar (PDF, paylaş, gönder).
import React, { useState } from "react";
import { Empty, Field, Icon, MenuButton, Modal, Spinner, ErrorNote, useConfirm } from "../../../components/ui";
import { formatDate } from "../../../lib/helpers";
import { DEAL_STATUS, displayNumber, money, parseAmount } from "../../../lib/salesUtils";
import { DocPreview, SaleDialog, refreshSales, salesPath, useCall, useSales } from "./salesCommon";
import PackageForm from "./PackageForm";
import PresentationEditor from "./PresentationEditor";
import ProposalEditor from "./ProposalEditor";
import MailComposer from "./MailComposer";
import "./proposals.css";
import ExportButton from "../../../components/ExportButton";
import { sponsorshipReport } from "../../../lib/export/reports";

function Cell({ pkg, feature, canEdit, onSet }) {
  const v = pkg.features?.[String(feature.id)];
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  if (editing) {
    const commit = () => { setEditing(false); onSet(draft.trim() ? draft.trim() : true); };
    return <td className="sl-mx__cell is-editing"><input autoFocus value={draft} maxLength={60} placeholder="Değer" onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { e.stopPropagation(); setEditing(false); } }} aria-label={`${pkg.name} · ${feature.name} değeri`} /></td>;
  }
  return (
    <td className={`sl-mx__cell ${v ? "is-on" : ""}`} style={{ "--pk": pkg.color }}>
      <button type="button" disabled={!canEdit} onClick={() => onSet(v ? null : true)} onDoubleClick={() => { setDraft(v === true || !v ? "" : String(v)); setEditing(true); }} aria-pressed={Boolean(v)} aria-label={`${pkg.name} · ${feature.name}: ${v ? (v === true ? "var" : v) : "yok"}`} title="Tıkla: var / yok · Çift tıkla: değer yaz">
        {v ? (v === true ? <Icon name="check" size={14} strokeWidth={2.6} /> : <span>{v}</span>) : <span className="sl-mx__no">—</span>}
      </button>
    </td>
  );
}

function Matrix({ pid, sales, canEdit }) {
  const call = useCall();
  const confirm = useConfirm();
  const [add, setAdd] = useState({ name: "", group_name: "" });
  const groups = [...new Set(sales.features.map((f) => f.group_name || ""))];
  const setCell = async (pkg, f, value) => {
    const features = { ...pkg.features };
    if (value == null) delete features[String(f.id)]; else features[String(f.id)] = value;
    if (await call({ method: "PATCH", path: `${salesPath(pid)}/packages/${pkg.id}`, body: { features } })) refreshSales();
  };
  const addFeature = async (e) => {
    e.preventDefault();
    if (!add.name.trim()) return;
    if (await call({ method: "POST", path: `${salesPath(pid)}/features`, body: { name: add.name.trim(), group_name: add.group_name.trim() || null } })) { setAdd((a) => ({ ...a, name: "" })); refreshSales(); }
  };
  const rename = async (f, name) => { if (name.trim() && name !== f.name && await call({ method: "PATCH", path: `${salesPath(pid)}/features/${f.id}`, body: { name: name.trim() } })) refreshSales(); };
  const move = async (f, d) => {
    const ids = sales.features.map((x) => x.id);
    const i = ids.indexOf(f.id);
    if (i + d < 0 || i + d >= ids.length) return;
    [ids[i], ids[i + d]] = [ids[i + d], ids[i]];
    if (await call({ method: "POST", path: `${salesPath(pid)}/features/reorder`, body: { ids } })) refreshSales();
  };
  const remove = async (f) => {
    if (!(await confirm({ title: "Hak silinsin mi?", message: `“${f.name}” katalogdan ve tüm paketlerden kaldırılacak.`, confirmLabel: "Sil", danger: true }))) return;
    if (await call({ method: "DELETE", path: `${salesPath(pid)}/features/${f.id}` })) refreshSales();
  };
  return (
    <>
      <div className="table-wrap">
        <table className="sl-mx" aria-label="Paket karşılaştırma matrisi">
          <thead><tr><th className="sl-mx__feat">Hak / özellik</th>{sales.packages.map((p) => <th key={p.id} style={{ "--pk": p.color }}><span className="sl-mx__ph"><b>{p.name}</b><small>{money(p.prices?.net, { round: true })}</small></span></th>)}</tr></thead>
          <tbody>
            {groups.map((g) => (
              <React.Fragment key={g || "-"}>
                {g && <tr className="sl-mx__grp"><th colSpan={sales.packages.length + 1}>{g}</th></tr>}
                {sales.features.filter((f) => (f.group_name || "") === g).map((f) => (
                  <tr key={f.id}>
                    <th className="sl-mx__feat">
                      <input className="sl-mx__name" defaultValue={f.name} key={f.name} readOnly={!canEdit} onBlur={(e) => rename(f, e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} aria-label="Hak adı" />
                      {canEdit && <span className="sl-mx__tools"><button type="button" className="icon-btn" onClick={() => move(f, -1)} aria-label={`${f.name} yukarı`}><Icon name="chevronUp" size={12} /></button><button type="button" className="icon-btn" onClick={() => remove(f)} aria-label={`${f.name} sil`}><Icon name="trash" size={12} /></button></span>}
                    </th>
                    {sales.packages.map((p) => <Cell key={p.id} pkg={p} feature={f} canEdit={canEdit} onSet={(v) => setCell(p, f, v)} />)}
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
      {canEdit && (
        <form className="sl-mx__add" onSubmit={addFeature}>
          <input value={add.name} maxLength={160} onChange={(e) => setAdd((a) => ({ ...a, name: e.target.value }))} placeholder="Yeni hak (ör. Saha kenarı LED, VIP davetiye…)" aria-label="Yeni hak adı" />
          <input value={add.group_name} maxLength={60} list="sl-groups" onChange={(e) => setAdd((a) => ({ ...a, group_name: e.target.value }))} placeholder="Grup (ör. Saha, Yayın, Dijital)" aria-label="Hak grubu" />
          <datalist id="sl-groups">{groups.filter(Boolean).map((g) => <option key={g} value={g} />)}</datalist>
          <button type="submit" className="btn btn--primary btn--sm" disabled={!add.name.trim()}><Icon name="plus" size={12} /> Hak ekle</button>
          <small className="muted">Hücreye tıklayın: var / yok · çift tıklayın: değer yazın (ör. “3 gönderi”).</small>
        </form>
      )}
    </>
  );
}

function DealForm({ ctx, sales, initial, onClose }) {
  const call = useCall();
  const [f, setF] = useState({ package_id: initial || sales.packages[0]?.id || "", lead_id: "", company: "", price: "", note: "" });
  const pkg = sales.packages.find((p) => p.id === Number(f.package_id));
  const submit = async () => {
    const res = await call({ method: "POST", path: `${salesPath(ctx.project.id)}/deals`, body: { package_id: Number(f.package_id), ...(f.lead_id ? { lead_id: Number(f.lead_id) } : { company: f.company }), ...(f.price !== "" ? { price: f.price } : {}), note: f.note } }, "Paket firmaya bağlandı.");
    if (res) { refreshSales(); onClose(); }
  };
  return (
    <Modal title="Firmaya paket bağla" onClose={onClose} width={480} footer={<><button type="button" className="btn" onClick={onClose}>Vazgeç</button><button type="button" className="btn btn--primary" disabled={!f.package_id || (!f.lead_id && !f.company.trim())} onClick={submit}>Bağla</button></>}>
      <Field label="Paket"><select value={f.package_id} onChange={(e) => setF((x) => ({ ...x, package_id: e.target.value }))}>{sales.packages.map((p) => <option key={p.id} value={p.id}>{p.name}{p.remaining != null ? ` · ${p.remaining} kontenjan` : ""}</option>)}</select></Field>
      <Field label="Görüşme (kişi)"><select value={f.lead_id} onChange={(e) => setF((x) => ({ ...x, lead_id: e.target.value }))}><option value="">Listede yok — firma adı yaz</option>{ctx.leads.filter((l) => (l.kind || "customer") !== "supplier").map((l) => <option key={l.id} value={l.id}>{l.name}{l.company ? ` · ${l.company}` : ""}</option>)}</select></Field>
      {!f.lead_id && <Field label="Firma"><input value={f.company} onChange={(e) => setF((x) => ({ ...x, company: e.target.value }))} /></Field>}
      <div className="form-grid">
        <Field label={`Fiyat ₺ (KDV hariç)${pkg ? ` · liste ${money(pkg.prices?.net, { round: true })}` : ""}`}><input value={f.price} inputMode="decimal" onChange={(e) => setF((x) => ({ ...x, price: e.target.value }))} /></Field>
        <Field label="Not"><input value={f.note} onChange={(e) => setF((x) => ({ ...x, note: e.target.value }))} /></Field>
      </div>
    </Modal>
  );
}

function PackageCard({ p, canEdit, onEdit, menu }) {
  const pct = p.quota ? Math.round((p.sold / p.quota) * 100) : null;
  return (
    <article className={`sl-pkg ${p.active ? "" : "is-off"} ${p.highlight ? "is-hl" : ""}`} style={{ "--pk": p.color }}>
      <header className="sl-pkg__head">
        <div><small>{p.tier_label || "Sponsorluk paketi"}{p.highlight ? " · Önerilen" : ""}{p.active ? "" : " · Pasif"}</small><h4>{p.name}</h4>{p.tagline && <p>{p.tagline}</p>}</div>
        <span className="sl-pkg__menu"><MenuButton items={menu} label={`${p.name} işlemleri`} size={14} /></span>
      </header>
      <div className="sl-pkg__price"><b>{p.prices?.net != null ? money(p.prices.net, { round: true }) : "Fiyat yok"}</b>{p.prices?.net != null && <small>+ KDV · {money(p.prices.gross, { round: true })} KDV dahil</small>}</div>
      <div className="sl-pkg__quota">
        <span>{p.quota ? `${p.sold}/${p.quota} satıldı` : `${p.sold} satıldı · sınırsız`}{p.offered ? ` · ${p.offered} teklifte` : ""}</span>
        {p.quota ? <div className="sl-bar"><span style={{ width: `${pct}%`, background: p.color }} /></div> : null}
      </div>
      <ul className="sl-pkg__meta">
        {p.duration && <li><Icon name="calendar" size={11} /> {p.duration}</li>}
        <li><Icon name="checkSquare" size={11} /> {Object.keys(p.features || {}).length} hak</li>
        {p.metrics?.length > 0 && <li><Icon name="eye" size={11} /> {p.metrics.slice(0, 2).map((m) => `${m.value} ${m.label.toLocaleLowerCase("tr-TR")}`).join(" · ")}</li>}
      </ul>
      {canEdit && <button type="button" className="sl-pkg__edit" onClick={onEdit}><Icon name="pencil" size={12} /> Düzenle</button>}
    </article>
  );
}

export default function Sponsorship({ ctx }) {
  const pid = ctx.project.id;
  const { canEdit } = ctx;
  const call = useCall();
  const confirm = useConfirm();
  const res = useSales(pid);
  const sales = res.data;
  const [editing, setEditing] = useState(null);
  const [dealFor, setDealFor] = useState(null);
  const [selling, setSelling] = useState(null);
  const [proposal, setProposal] = useState(null);
  const [pres, setPres] = useState(null);
  const [previewPres, setPreviewPres] = useState(null);
  const [mailPres, setMailPres] = useState(null);

  if (!sales) return res.loading ? <Spinner /> : <ErrorNote error={res.error} onRetry={res.reload} />;
  const base = salesPath(pid);
  const savePackage = async (body) => {
    const r = await call(editing.pkg ? { method: "PATCH", path: `${base}/packages/${editing.pkg.id}`, body } : { method: "POST", path: `${base}/packages`, body }, editing.pkg ? "Paket kaydedildi." : "Paket eklendi.");
    if (r) { refreshSales(); setEditing(null); return true; }
    return false;
  };
  const move = async (p, d) => {
    const ids = sales.packages.map((x) => x.id);
    const i = ids.indexOf(p.id);
    [ids[i], ids[i + d]] = [ids[i + d], ids[i]];
    if (await call({ method: "POST", path: `${base}/packages/reorder`, body: { ids } })) refreshSales();
  };
  const menuFor = (p, i) => [
    { label: "Bu paketle teklif hazırla", icon: "file", onClick: () => setProposal({ packageIds: [p.id] }) },
    { label: "Firmaya bağla", icon: "handshake", onClick: () => setDealFor(p.id) },
    canEdit && "-",
    canEdit && { label: "Kopyala", icon: "copy", onClick: async () => { if (await call({ method: "POST", path: `${base}/packages/${p.id}/duplicate`, body: {} }, "Paket kopyalandı.")) refreshSales(); } },
    canEdit && i > 0 && { label: "Sola taşı", icon: "chevronLeft", onClick: () => move(p, -1) },
    canEdit && i < sales.packages.length - 1 && { label: "Sağa taşı", icon: "chevronRight", onClick: () => move(p, 1) },
    canEdit && { label: p.active ? "Satıştan kaldır (pasif)" : "Satışa al", icon: "eye", onClick: async () => { if (await call({ method: "PATCH", path: `${base}/packages/${p.id}`, body: { active: !p.active } })) refreshSales(); } },
    canEdit && { label: "Sil", icon: "trash", danger: true, onClick: async () => { if (await confirm({ title: "Paket silinsin mi?", message: `“${p.name}” silinecek.`, confirmLabel: "Sil", danger: true }) && await call({ method: "DELETE", path: `${base}/packages/${p.id}` }, "Paket silindi.")) refreshSales(); } },
  ];
  const updateDeal = async (d, body) => {
    const r = await call({ method: "PATCH", path: `${base}/deals/${d.id}`, body }, body.status === "sold" ? `${d.company || d.lead_name}: ${d.package_name} satıldı.` : null);
    if (r) { refreshSales(); if (r.entry || r.lead) ctx.actions.reload(); return true; }
    return false;
  };
  const newPresentation = async () => {
    const r = await call({ method: "POST", path: `${base}/presentations`, body: {} });
    if (r) { refreshSales(); setPres(r.item); }
  };
  const s = sales.stats;
  const remaining = sales.packages.filter((p) => p.active && p.quota != null).reduce((n, p) => n + p.remaining, 0);
  const presShares = (id) => sales.shares.filter((x) => x.kind === "presentation" && x.ref_id === id);

  return (
    <div className="proj-section sl-tab">
      <div className="kpis kpis--compact">
        <div className="kpi kpi--hero"><span><Icon name="award" size={12} /> Paket</span><strong>{sales.packages.filter((p) => p.active).length}</strong><small>{sales.features.length} hak tanımlı</small></div>
        <div className="kpi kpi--green"><span>Satılan</span><strong>{s.sold_count}</strong><small>{money(s.sold_value, { round: true })}</small></div>
        <div className="kpi kpi--blue"><span>Teklifte</span><strong>{sales.deals.filter((d) => d.status === "offered").length}</strong><small>firmaya bağlı paket</small></div>
        <div className="kpi kpi--amber"><span>Kalan kontenjan</span><strong>{remaining}</strong><small>kontenjanlı paketlerde</small></div>
      </div>

      <section className="card sl-card">
        <header className="sl-card__head"><h3><Icon name="award" size={15} /> Sponsorluk paketleri <span className="muted">{sales.packages.length}</span></h3><ExportButton id="sponsorship" title="Sponsorluk paketleri" text="" print={false} report={() => sponsorshipReport(sales, ctx.project?.name, { dealStatus: (k) => DEAL_STATUS[k]?.label || k, proposalNo: displayNumber })} />{canEdit && <button type="button" className="btn btn--primary btn--sm" onClick={() => setEditing({})}><Icon name="plus" size={12} /> Paket ekle</button>}</header>
        {!sales.packages.length ? (
          <Empty icon="award" title="Henüz paket yok" text="Ana sponsor, Altın, Gümüş… paketlerinizi oluşturun; haklarını işaretleyin, kontenjan ve fiyat verin. Hızlı başlamak için örnek seti kurabilirsiniz."
            action={canEdit && <div className="row-gap"><button type="button" className="btn btn--primary" onClick={async () => { if (await call({ method: "POST", path: `${base}/starter`, body: {} }, "Örnek hak kataloğu ve 4 paket eklendi.")) refreshSales(); }}><Icon name="sparkles" size={13} /> Örnek paket setini kur</button><button type="button" className="btn" onClick={() => setEditing({})}>Boş paket ekle</button></div>} />
        ) : <div className="sl-pkgs">{sales.packages.map((p, i) => <PackageCard key={p.id} p={p} canEdit={canEdit} onEdit={() => setEditing({ pkg: p })} menu={menuFor(p, i)} />)}</div>}
      </section>

      {sales.packages.length > 0 && (
        <section className="card sl-card">
          <header className="sl-card__head"><h3><Icon name="grid" size={15} /> Paket karşılaştırması <span className="muted">{sales.features.length} hak</span></h3></header>
          <Matrix pid={pid} sales={sales} canEdit={canEdit} />
        </section>
      )}

      <section className="card sl-card">
        <header className="sl-card__head"><h3><Icon name="handshake" size={15} /> Firmalar ve paketler <span className="muted">{sales.deals.length}</span></h3>{canEdit && sales.packages.length > 0 && <button type="button" className="btn btn--sm" onClick={() => setDealFor(sales.packages[0].id)}><Icon name="link" size={12} /> Firmaya paket bağla</button>}</header>
        {!sales.deals.length ? <p className="muted small">Henüz firmaya bağlanan paket yok. Teklif hazırladığınızda paket kalemleri burada otomatik görünür.</p> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Firma / kişi</th><th>Paket</th><th className="num">Fiyat</th><th>Durum</th><th>Teklif</th><th /></tr></thead>
              <tbody>
                {sales.deals.map((d) => {
                  const q = d.proposal_id ? sales.proposals.find((x) => x.id === d.proposal_id) : null;
                  const pkg = sales.packages.find((p) => p.id === d.package_id);
                  return (
                    <tr key={d.id}>
                      <td>{d.lead_id ? <button type="button" className="link-btn" onClick={() => ctx.openLead(d.lead_id)}>{d.company || d.lead_name}</button> : d.company}</td>
                      <td><span className="sl-dot" style={{ background: pkg?.color }} /> {d.package_name}</td>
                      <td className="num">{canEdit && d.status !== "sold" ? <input className="sl-deal-price" defaultValue={d.price ?? ""} key={d.price} inputMode="decimal" aria-label="Fiyat" onBlur={(e) => { const v = e.target.value === "" ? null : parseAmount(e.target.value); if (v !== d.price) updateDeal(d, { price: v }); }} /> : money(d.price)}</td>
                      <td>
                        <span className="stage-select" style={{ "--sc": DEAL_STATUS[d.status].color }}>
                          <select value={d.status} disabled={!canEdit || d.status === "sold"} aria-label={`Durum: ${d.company}`} onChange={(e) => (e.target.value === "sold" ? setSelling(d) : updateDeal(d, { status: e.target.value }))}>{Object.entries(DEAL_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
                        </span>
                        {d.finance_entry_id && <Icon name="wallet" size={12} className="sl-ok" title="Gelir kaydı açıldı" />}
                      </td>
                      <td>{q ? <button type="button" className="link-btn" onClick={() => setProposal({ id: q.id })}>{displayNumber(q.number, q.revision)}</button> : <span className="muted">—</span>}</td>
                      <td>{canEdit && d.status !== "sold" && <button type="button" className="icon-btn" aria-label="Kaldır" onClick={async () => { if (await call({ method: "DELETE", path: `${base}/deals/${d.id}` })) refreshSales(); }}><Icon name="trash" size={12} /></button>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card sl-card">
        <header className="sl-card__head"><h3><Icon name="image" size={15} /> Sunumlar <span className="muted">{sales.presentations.length}</span></h3>{canEdit && <button type="button" className="btn btn--primary btn--sm" onClick={newPresentation}><Icon name="plus" size={12} /> Yeni sunum</button>}</header>
        {!sales.presentations.length ? <p className="muted small">Paketlerden kapaklı, karşılaştırma tablolu, markalı bir sponsorluk sunumu oluşturun; PDF olarak kaydedin ya da bağlantıyla gönderin.</p> : (
          <ul className="sl-presl">
            {sales.presentations.map((x) => {
              const sh = presShares(x.id);
              return (
                <li key={x.id} className="sl-presl__item" style={{ "--pk": x.theme?.primary || ctx.project.color }}>
                  <button type="button" className="sl-presl__main" onClick={() => setPres(x)}>
                    <span className="sl-presl__thumb"><Icon name="image" size={16} /></span>
                    <span><strong>{x.title}</strong><small>{x.sections.length} bölüm · {formatDate(x.updated_at)}{sh.length ? ` · ${sh.filter((y) => y.active).length} bağlantı · ${sh.reduce((n, y) => n + y.view_count, 0)} görüntülenme` : ""}</small></span>
                  </button>
                  <button type="button" className="btn btn--sm" onClick={() => setPreviewPres(x)}><Icon name="download" size={12} /> PDF / Paylaş</button>
                  {canEdit && <button type="button" className="btn btn--sm" onClick={() => setMailPres(x)}><Icon name="mail" size={12} /> Gönder</button>}
                  {canEdit && <MenuButton label={`${x.title} işlemleri`} size={14} items={[
                    { label: "Kopyala", icon: "copy", onClick: async () => { if (await call({ method: "POST", path: `${base}/presentations/${x.id}/duplicate`, body: {} })) refreshSales(); } },
                    { label: "Sil", icon: "trash", danger: true, onClick: async () => { if (await confirm({ title: "Sunum silinsin mi?", message: `“${x.title}” ve paylaşım bağlantıları silinecek.`, confirmLabel: "Sil", danger: true }) && await call({ method: "DELETE", path: `${base}/presentations/${x.id}` })) refreshSales(); } },
                  ]} />}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {editing && <PackageForm pkg={editing.pkg} features={sales.features} onSave={savePackage} onClose={() => setEditing(null)} />}
      {dealFor && <DealForm ctx={ctx} sales={sales} initial={dealFor} onClose={() => setDealFor(null)} />}
      {selling && <SaleDialog pid={pid} title={`${selling.package_name} satıldı · ${selling.company || selling.lead_name}`} amount={Number(selling.price) || 0} lead={selling.lead_id ? ctx.leads.find((l) => Number(l.id) === Number(selling.lead_id)) : null} confirmLabel="Satıldı" onClose={() => setSelling(null)} onConfirm={async (opts) => { const ok = await updateDeal(selling, { status: "sold", ...opts }); if (ok) setSelling(null); return ok; }} />}
      {proposal && <ProposalEditor ctx={ctx} proposalId={proposal.id || null} packageIds={proposal.packageIds || []} onClose={() => setProposal(null)} />}
      {pres && <PresentationEditor ctx={ctx} presentation={pres} onClose={() => setPres(null)} />}
      {previewPres && <DocPreview pid={pid} canEdit={canEdit} title={previewPres.title} path={`${base}/presentations/${previewPres.id}/render`} shareRef={{ kind: "presentation", ref_id: previewPres.id }} shares={presShares(previewPres.id).filter((y) => !y.lead_id)} onClose={() => setPreviewPres(null)} />}
      {mailPres && <MailComposer ctx={ctx} presentationId={mailPres.id} templateKey="sponsorluk_davet" onClose={() => setMailPres(null)} />}
    </div>
  );
}
