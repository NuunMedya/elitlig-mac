// Teklif düzenleyici: alıcı, tarih / geçerlilik, kalemler (miktar, birim fiyat,
// indirim, KDV) ya da sponsorluk paketi, canlı toplamlar, ödeme planı, şartlar.
// Yan sütun: durum akışı, sürümler, PDF / yazdır, paylaşım, e-postayla gönder.
// Gönderilen teklif kilitlenir; "Revize et" yeni sürüm açar.
import React, { useEffect, useMemo, useState } from "react";
import { Field, Icon, MenuButton, Modal, useConfirm, useToast } from "../../../components/ui";
import { get } from "../../../api";
import { formatDate, isoDay } from "../../../lib/helpers";
import { PROPOSAL_STATUS, VAT_RATES, computeTotals, daysLeft, emptyItem, money, packageItem, parseAmount } from "../../../lib/salesUtils";
import { DocPreview, SaleDialog, ShareRow, StatusPill, refreshSales, salesPath, useCall, useSales, useSalesMeta } from "./salesCommon";
import MailComposer from "./MailComposer";

const plus = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return isoDay(d); };
const PRESETS = [
  ["Peşin", [{ label: "Sözleşmede tamamı", percent: 100 }]],
  ["%50 / %50", [{ label: "Sözleşmede peşinat", percent: 50 }, { label: "Organizasyon başlangıcı", percent: 50 }]],
  ["%40 / %30 / %30", [{ label: "Sözleşmede peşinat", percent: 40 }, { label: "2. taksit", percent: 30 }, { label: "Son taksit", percent: 30 }]],
];
const fromItem = (q) => ({
  title: q.title || "", lead_id: q.lead_id || "", recipient_name: q.recipient_name || "", recipient_company: q.recipient_company || "", recipient_email: q.recipient_email || "",
  issue_date: q.issue_date || isoDay(), valid_until: q.valid_until || "", intro: q.intro || "", terms: q.terms || "", note: q.note || "",
  items: (q.items || []).map((i) => ({ ...emptyItem(), ...i, unit_price: i.unit_price ?? "", details: i.details || "" })),
  payment_plan: (q.payment_plan || []).map((p) => ({ label: p.label || "", percent: p.percent ?? "", due_date: p.due_date || "" })),
  presentation_id: q.presentation_id || "",
});

export default function ProposalEditor({ ctx, proposalId = null, leadIds = [], packageIds = [], onClose }) {
  const pid = ctx.project.id;
  const call = useCall();
  const toast = useToast();
  const confirm = useConfirm();
  const meta = useSalesMeta();
  const { data: sales } = useSales(pid);
  const [item, setItem] = useState(null);
  const [extra, setExtra] = useState({ shares: [], mail_log: [] });
  const [form, setForm] = useState(null);
  const [recipients, setRecipients] = useState(leadIds.map(Number));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [preview, setPreview] = useState(false);
  const [mailing, setMailing] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [noteFor, setNoteFor] = useState(null);
  const [note, setNote] = useState("");
  const isNew = !item;
  const editable = ctx.canEdit && (isNew || ["draft", "revision"].includes(item.status));
  const customers = ctx.leads.filter((l) => (l.kind || "customer") !== "supplier");

  useEffect(() => {
    if (proposalId || form || !sales) return;
    const pkgs = packageIds.map((id) => sales.packages.find((p) => p.id === id)).filter(Boolean);
    const first = recipients.length === 1 ? ctx.leads.find((l) => Number(l.id) === recipients[0]) : null;
    setForm(fromItem({ title: pkgs.length === 1 ? `${pkgs[0].name} sponsorluk teklifi` : "Sponsorluk teklifi", lead_id: first?.id || "", valid_until: plus(15), terms: meta?.default_terms || "", items: pkgs.length ? pkgs.map(packageItem) : [emptyItem()] }));
  }, [sales, meta]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (form && isNew && !form.terms && meta?.default_terms) setForm((f) => ({ ...f, terms: meta.default_terms })); }, [meta]); // eslint-disable-line react-hooks/exhaustive-deps

  const load = async (id) => {
    const r = await get(`${salesPath(pid)}/proposals/${id}`);
    if (!r.ok) { setError(r.error?.message || "Teklif açılamadı."); return; }
    setItem(r.data.item);
    setExtra({ shares: r.data.shares || [], mail_log: r.data.mail_log || [] });
    setForm(fromItem(r.data.item));
  };
  useEffect(() => { if (proposalId) load(proposalId); }, [proposalId]); // eslint-disable-line react-hooks/exhaustive-deps

  const totals = useMemo(() => computeTotals(form?.items || []), [form]);
  const setF = (patch) => setForm((f) => ({ ...f, ...patch }));
  const setLine = (i, patch) => setForm((f) => ({ ...f, items: f.items.map((x, j) => (j === i ? { ...x, ...patch } : x)) }));
  const setPlan = (i, patch) => setForm((f) => ({ ...f, payment_plan: f.payment_plan.map((x, j) => (j === i ? { ...x, ...patch } : x)) }));
  const lead = form?.lead_id ? ctx.leads.find((l) => Number(l.id) === Number(form.lead_id)) : null;

  const body = () => ({
    title: form.title, issue_date: form.issue_date || null, valid_until: form.valid_until || null, intro: form.intro, terms: form.terms, note: form.note,
    items: form.items.filter((i) => String(i.description).trim()).map((i) => ({ ...i, unit_price: parseAmount(i.unit_price) ?? 0, quantity: parseAmount(i.quantity) ?? 1, discount: parseAmount(i.discount) ?? 0 })),
    payment_plan: form.payment_plan.filter((p) => p.label || p.percent !== "").map((p) => ({ label: p.label, percent: p.percent === "" ? null : p.percent, due_date: p.due_date || null })),
    presentation_id: form.presentation_id ? Number(form.presentation_id) : null,
    ...(form.lead_id ? {} : { recipient_name: form.recipient_name, recipient_company: form.recipient_company, recipient_email: form.recipient_email }),
  });
  const save = async ({ quiet = false } = {}) => {
    if (!form.title.trim()) return null;
    setBusy("save");
    let out = null;
    if (isNew) {
      const ids = recipients.length ? recipients : form.lead_id ? [Number(form.lead_id)] : [];
      const res = await call({ method: "POST", path: `${salesPath(pid)}/proposals`, body: { ...body(), lead_ids: ids } });
      if (res) {
        refreshSales();
        ctx.actions.reload();
        if (res.items.length > 1) { setBusy(""); toast(`${res.items.length} kişiye ayrı numaralı teklif hazırlandı.`, { tone: "success" }); onClose(); return null; }
        setItem(res.item);
        setForm(fromItem(res.item));
        out = res.item;
      }
    } else {
      const res = await call({ method: "PATCH", path: `${salesPath(pid)}/proposals/${item.id}`, body: { ...body(), lead_id: form.lead_id ? Number(form.lead_id) : null } }, quiet ? null : "Teklif kaydedildi.");
      if (res) { setItem(res.item); refreshSales(); out = res.item; }
    }
    setBusy("");
    return out;
  };
  const ensureSaved = async () => (editable ? save({ quiet: true }) : item);
  const setStatus = async (status, opts = {}) => {
    setBusy(status);
    const res = await call({ method: "POST", path: `${salesPath(pid)}/proposals/${item.id}/status`, body: { status, ...opts } }, status === "accepted" ? "Teklif kabul edildi." : `Durum: ${PROPOSAL_STATUS[status].label}`);
    setBusy("");
    if (!res) return false;
    setItem(res.item);
    setForm(fromItem(res.item));
    refreshSales();
    ctx.actions.reload();
    return true;
  };
  const revise = async () => {
    const res = await call({ method: "POST", path: `${salesPath(pid)}/proposals/${item.id}/revise`, body: {} }, "Yeni sürüm açıldı.");
    if (res) { setItem(res.item); setForm(fromItem(res.item)); refreshSales(); }
  };
  const duplicate = async () => {
    const res = await call({ method: "POST", path: `${salesPath(pid)}/proposals/${item.id}/duplicate`, body: {} }, "Kopya oluşturuldu.");
    if (res) { refreshSales(); load(res.item.id); }
  };
  const remove = async () => {
    if (!(await confirm({ title: "Teklif silinsin mi?", message: `${item.display_number} ve paylaşım bağlantıları silinecek. Açılmış gelir kaydı bütçede kalır.`, confirmLabel: "Sil", danger: true }))) return;
    if (await call({ method: "DELETE", path: `${salesPath(pid)}/proposals/${item.id}` }, "Teklif silindi.")) { refreshSales(); onClose(); }
  };
  const revokeShare = async (s) => {
    if (await call({ method: "DELETE", path: `${salesPath(pid)}/shares/${s.id}` }, "Bağlantı iptal edildi.")) setExtra((x) => ({ ...x, shares: x.shares.map((y) => (y.id === s.id ? { ...y, active: false } : y)) }));
  };

  if (error) return <Modal title="Teklif" onClose={onClose} width={420}><div className="error-note"><span>{error}</span></div></Modal>;
  if (!form) return <Modal title="Teklif" onClose={onClose} width={420}><p className="muted">Yükleniyor…</p></Modal>;
  const st = item ? PROPOSAL_STATUS[item.status] : PROPOSAL_STATUS.draft;
  const left = daysLeft(form.valid_until);
  const multi = isNew && recipients.length > 1;
  const pkgMenu = (sales?.packages || []).filter((p) => p.active).map((p) => ({ label: `${p.name} · ${money(p.prices?.net, { round: true })}`, icon: "award", onClick: () => setForm((f) => ({ ...f, items: [...f.items.filter((i) => String(i.description).trim()), packageItem(p)] })) }));

  return (
    <Modal title={item ? `${item.display_number} · ${item.title}` : multi ? `Yeni teklif · ${recipients.length} kişi` : "Yeni teklif"} onClose={onClose} width={1240} className="modal--tool sl-proposal" footer={<>
      {item && ctx.canEdit && <button type="button" className="btn btn--danger-ghost" onClick={remove}><Icon name="trash" size={13} /> Sil</button>}
      <span className="spacer" />
      <span className="sl-totalbar"><small>Genel toplam</small><b>{money(totals.total)}</b></span>
      {item && <button type="button" className="btn" onClick={async () => { if (editable) await save({ quiet: true }); setPreview(true); }}><Icon name="eye" size={13} /> Önizle / PDF</button>}
      {editable && <button type="button" className="btn btn--primary" disabled={busy === "save" || !form.title.trim()} onClick={() => save()}>{busy === "save" ? "Kaydediliyor…" : isNew ? (multi ? `${recipients.length} teklif oluştur` : "Teklifi oluştur") : "Kaydet"}</button>}
    </>}>
      <div className="sl-proposal__grid">
        <div className="sl-proposal__main">
          {!editable && item && <p className="sl-note"><Icon name="lock" size={13} /> Bu teklif {st.label.toLocaleLowerCase("tr-TR")}; içerik kilitli.{item.status !== "accepted" && ctx.canEdit ? " Değiştirmek için “Revize et” ile yeni sürüm açın." : ""}</p>}
          <fieldset className="sl-fieldset" disabled={!editable}>
            <div className="sl-proposal__head">
              <Field label="Başlık"><input className="sl-title" value={form.title} onChange={(e) => setF({ title: e.target.value })} maxLength={200} aria-label="Teklif başlığı" /></Field>
              {multi ? (
                <Field label="Alıcılar (her kişiye ayrı numara)"><div className="sl-recips">{recipients.map((id) => { const l = ctx.leads.find((x) => Number(x.id) === id); return l ? <span key={id} className="sl-recip">{l.name}<button type="button" onClick={() => setRecipients((r) => r.filter((x) => x !== id))} aria-label={`${l.name} çıkar`}><Icon name="x" size={11} /></button></span> : null; })}</div></Field>
              ) : (
                <Field label="Alıcı (görüşme)">
                  <select value={form.lead_id} onChange={(e) => setF({ lead_id: e.target.value ? Number(e.target.value) : "" })} aria-label="Alıcı">
                    <option value="">Listede yok — elle yaz</option>
                    {customers.map((l) => <option key={l.id} value={l.id}>{l.name}{l.company ? ` · ${l.company}` : ""}</option>)}
                  </select>
                </Field>
              )}
              <Field label="Teklif tarihi"><input type="date" value={form.issue_date} onChange={(e) => setF({ issue_date: e.target.value })} /></Field>
              <Field label={`Geçerlilik${left == null ? "" : left < 0 ? " · geçti" : ` · ${left} gün`}`}><input type="date" value={form.valid_until} onChange={(e) => setF({ valid_until: e.target.value })} aria-label="Geçerlilik tarihi" /></Field>
            </div>
            {!form.lead_id && !multi && (
              <div className="form-grid form-grid--3">
                <Field label="Firma"><input value={form.recipient_company} onChange={(e) => setF({ recipient_company: e.target.value })} /></Field>
                <Field label="Yetkili"><input value={form.recipient_name} onChange={(e) => setF({ recipient_name: e.target.value })} /></Field>
                <Field label="E-posta"><input type="email" value={form.recipient_email} onChange={(e) => setF({ recipient_email: e.target.value })} /></Field>
              </div>
            )}
            {lead && <p className="muted small">{[lead.company, lead.title, lead.email].filter(Boolean).join(" · ") || lead.name}</p>}

            <section className="sl-items" aria-label="Kalemler">
              <div className="sl-items__row sl-items__row--head" aria-hidden="true"><span>#</span><span>Açıklama</span><span>Miktar</span><span>Birim fiyat ₺</span><span>İnd. %</span><span>KDV</span><span>Tutar</span><span /></div>
              {form.items.map((it, i) => {
                const line = totals.items[i];
                return (
                  <div key={i} className={`sl-items__row ${it.package_id ? "is-pkg" : ""}`}>
                    <span className="sl-items__no">{i + 1}</span>
                    <span className="sl-items__desc">
                      <input value={it.description} onChange={(e) => setLine(i, { description: e.target.value })} placeholder="Açıklama" aria-label={`${i + 1}. kalem açıklaması`} />
                      <input className="sl-items__details" value={it.details} onChange={(e) => setLine(i, { details: e.target.value })} placeholder="Ayrıntı (isteğe bağlı)" aria-label={`${i + 1}. kalem ayrıntısı`} />
                      {it.package_id && <small className="sl-items__pkgtag"><Icon name="award" size={10} /> Sponsorluk paketi</small>}
                    </span>
                    <span className="sl-items__qty">
                      <input value={it.quantity} inputMode="decimal" onChange={(e) => setLine(i, { quantity: e.target.value })} aria-label={`${i + 1}. kalem miktarı`} />
                      <input value={it.unit} onChange={(e) => setLine(i, { unit: e.target.value })} aria-label={`${i + 1}. kalem birimi`} />
                    </span>
                    <input className="num" value={it.unit_price} inputMode="decimal" placeholder="0" onChange={(e) => setLine(i, { unit_price: e.target.value })} aria-label={`${i + 1}. kalem birim fiyatı`} />
                    <input className="num" value={it.discount} inputMode="decimal" onChange={(e) => setLine(i, { discount: e.target.value })} aria-label={`${i + 1}. kalem indirimi`} />
                    <select value={it.vat_rate} onChange={(e) => setLine(i, { vat_rate: Number(e.target.value) })} aria-label={`${i + 1}. kalem KDV`}>{[...new Set([...VAT_RATES, Number(it.vat_rate)])].map((r) => <option key={r} value={r}>%{r}</option>)}</select>
                    <span className="sl-items__total">{money(line?.line_net)}{line?.line_discount ? <small>−{money(line.line_discount)}</small> : null}</span>
                    <span className="sl-items__acts">
                      <button type="button" className="icon-btn" disabled={i === 0} onClick={() => setForm((f) => { const items = [...f.items]; [items[i - 1], items[i]] = [items[i], items[i - 1]]; return { ...f, items }; })} aria-label="Yukarı"><Icon name="chevronUp" size={13} /></button>
                      <button type="button" className="icon-btn" onClick={() => setForm((f) => ({ ...f, items: f.items.filter((_, j) => j !== i) }))} aria-label={`${i + 1}. kalemi sil`}><Icon name="trash" size={13} /></button>
                    </span>
                  </div>
                );
              })}
              {editable && (
                <div className="row-gap">
                  <button type="button" className="btn btn--sm btn--soft" onClick={() => setForm((f) => ({ ...f, items: [...f.items, emptyItem()] }))}><Icon name="plus" size={12} /> Kalem ekle</button>
                  {pkgMenu.length > 0 && <MenuButton icon="award" text="Sponsorluk paketi ekle" className="btn btn--sm btn--soft" label="Paketten ekle" items={pkgMenu} />}
                </div>
              )}
            </section>

            <div className="sl-proposal__cols">
              <section className="sl-box">
                <h4><Icon name="calendar" size={13} /> Ödeme planı</h4>
                {form.payment_plan.map((p, i) => (
                  <div key={i} className="sl-plan">
                    <input value={p.label} placeholder="Açıklama" onChange={(e) => setPlan(i, { label: e.target.value })} aria-label={`${i + 1}. ödeme`} />
                    <input className="num" value={p.percent} placeholder="%" inputMode="decimal" onChange={(e) => setPlan(i, { percent: e.target.value })} aria-label={`${i + 1}. ödeme oranı`} />
                    <input type="date" value={p.due_date} onChange={(e) => setPlan(i, { due_date: e.target.value })} aria-label={`${i + 1}. ödeme tarihi`} />
                    <b className="sl-plan__amt">{p.percent !== "" && parseAmount(p.percent) != null ? money((totals.total * parseAmount(p.percent)) / 100) : ""}</b>
                    <button type="button" className="icon-btn" onClick={() => setForm((f) => ({ ...f, payment_plan: f.payment_plan.filter((_, j) => j !== i) }))} aria-label={`${i + 1}. ödemeyi sil`}><Icon name="x" size={12} /></button>
                  </div>
                ))}
                {editable && <div className="row-gap"><button type="button" className="btn btn--sm btn--soft" onClick={() => setForm((f) => ({ ...f, payment_plan: [...f.payment_plan, { label: "", percent: "", due_date: "" }] }))}><Icon name="plus" size={12} /> Ödeme ekle</button>{PRESETS.map(([l, plan]) => <button key={l} type="button" className="btn btn--xs" onClick={() => setF({ payment_plan: plan.map((x) => ({ ...x, due_date: "" })) })}>{l}</button>)}</div>}
              </section>
              <section className="sl-box sl-totals" aria-label="Toplamlar">
                <div><span>Ara toplam</span><b>{money(totals.subtotal)}</b></div>
                {totals.discount_total > 0 && <div><span>İndirim</span><b>−{money(totals.discount_total)}</b></div>}
                {totals.vat_breakdown.map((v) => <div key={v.rate}><span>KDV %{v.rate}{totals.vat_breakdown.length > 1 ? <small> · matrah {money(v.base)}</small> : null}</span><b>{money(v.vat)}</b></div>)}
                <div className="is-grand"><span>Genel toplam</span><b>{money(totals.total)}</b></div>
              </section>
            </div>
            <div className="form-grid">
              <Field label="Giriş metni" hint="teklif sayfasında kalemlerin üstünde"><textarea rows={3} value={form.intro} onChange={(e) => setF({ intro: e.target.value })} /></Field>
              <Field label="Not" hint="ödeme planının altında"><textarea rows={3} value={form.note} onChange={(e) => setF({ note: e.target.value })} /></Field>
              <Field label="Şartlar ve koşullar" className="span2"><textarea rows={6} value={form.terms} onChange={(e) => setF({ terms: e.target.value })} /></Field>
              <Field label="Sunum teması" hint="teklif belgesi bu sunumun renk, logo ve tanıtımını kullanır">
                <select value={form.presentation_id} onChange={(e) => setF({ presentation_id: e.target.value })}>
                  <option value="">Proje renkleri (varsayılan)</option>
                  {(sales?.presentations || []).map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
                </select>
              </Field>
            </div>
          </fieldset>
        </div>

        <aside className="sl-proposal__side">
          <div className="sl-statuscard" style={{ "--sc": st.color }}>
            <small>{item ? item.display_number : "Yeni teklif"}</small>
            <strong><Icon name={st.icon} size={14} /> {st.label}</strong>
            {item?.expired && <StatusPill color="#dc2626" icon="clock">Süresi doldu</StatusPill>}
            <ul className="sl-dates">
              {item?.sent_at && <li><Icon name="send" size={11} /> Gönderildi: {formatDate(item.sent_at)}</li>}
              {item?.viewed_at && <li><Icon name="eye" size={11} /> Görüldü: {formatDate(item.viewed_at)}</li>}
              {item?.decided_at && <li><Icon name="flag" size={11} /> Karar: {formatDate(item.decided_at)}{item.decision_note ? ` — ${item.decision_note}` : ""}</li>}
              {item?.finance_entry_id && <li><Icon name="wallet" size={11} /> Gelir kaydı açıldı</li>}
            </ul>
          </div>
          {item && ctx.canEdit && (
            <div className="sl-actions">
              <button type="button" className="btn btn--primary" onClick={async () => { if (await ensureSaved()) setMailing(true); }}><Icon name="mail" size={13} /> E-postayla gönder</button>
              {item.status === "draft" && <button type="button" className="btn" disabled={Boolean(busy)} onClick={() => setStatus("sent")}><Icon name="send" size={13} /> Gönderildi olarak işaretle</button>}
              {["sent", "viewed", "revision", "draft"].includes(item.status) && <button type="button" className="btn btn--green" onClick={() => setAccepting(true)}><Icon name="check" size={13} /> Kabul edildi</button>}
              {["sent", "viewed"].includes(item.status) && <button type="button" className="btn" onClick={() => { setNote(""); setNoteFor("revision"); }}><Icon name="refresh" size={13} /> Revize istendi</button>}
              {["sent", "viewed", "revision"].includes(item.status) && <button type="button" className="btn btn--danger-ghost" onClick={() => { setNote(""); setNoteFor("rejected"); }}><Icon name="x" size={13} /> Reddedildi</button>}
              {item.status !== "accepted" && item.status !== "draft" && <button type="button" className="btn" onClick={revise}><Icon name="layers" size={13} /> Revize et (yeni sürüm)</button>}
              <button type="button" className="btn btn--sm btn--ghost" onClick={duplicate}><Icon name="copy" size={12} /> Kopyasını oluştur</button>
            </div>
          )}
          {extra.shares.length > 0 && <section className="sl-sidesec"><h4>Paylaşım bağlantıları</h4>{extra.shares.map((s) => <ShareRow key={s.id} share={s} onRevoke={ctx.canEdit ? revokeShare : null} />)}</section>}
          {item?.revisions?.length > 0 && (
            <section className="sl-sidesec"><h4>Sürümler</h4>
              <ul className="sl-revs">{item.revisions.slice().reverse().map((r) => <li key={r.revision}><b>R{r.revision}</b><span>{PROPOSAL_STATUS[r.status]?.label || r.status}</span><span>{money(r.total)}</span><small>{formatDate(r.saved_at)}</small></li>)}<li className="is-current"><b>R{item.revision}</b><span>Güncel</span><span>{money(item.total)}</span></li></ul>
            </section>
          )}
          {extra.mail_log.length > 0 && <section className="sl-sidesec"><h4>Gönderimler</h4><ul className="sl-maillog">{extra.mail_log.slice(0, 8).map((l) => <li key={l.id} className={l.status === "failed" ? "is-bad" : ""}><Icon name={l.transport === "smtp" ? "cloud" : "mail"} size={11} /> <span>{l.to_name || l.to_email}</span><small>{formatDate(l.created_at)}{l.status === "failed" ? " · gönderilemedi" : ""}</small></li>)}</ul></section>}
        </aside>
      </div>
      {preview && item && <DocPreview pid={pid} canEdit={ctx.canEdit} title={`${item.display_number} · önizleme`} path={`${salesPath(pid)}/proposals/${item.id}/render`} shareRef={{ kind: "proposal", ref_id: item.id }} shares={extra.shares} onClose={() => { setPreview(false); load(item.id); }} />}
      {mailing && item && <MailComposer ctx={ctx} leadIds={item.lead_id ? [item.lead_id] : []} proposalId={item.id} presentationId={item.presentation_id} templateKey="teklif_gonderim" onClose={() => { setMailing(false); load(item.id); }} />}
      {accepting && item && <SaleDialog pid={pid} title={`${item.display_number} kabul edildi`} amount={item.total} lead={item.lead_id ? ctx.leads.find((l) => Number(l.id) === Number(item.lead_id)) : null} confirmLabel="Kabul edildi" noteField onClose={() => setAccepting(false)} onConfirm={async (opts) => { const ok = await setStatus("accepted", opts); if (ok) setAccepting(false); return ok; }} />}
      {noteFor && (
        <Modal title={noteFor === "rejected" ? "Teklif reddedildi" : "Revize istendi"} onClose={() => setNoteFor(null)} width={440} footer={<>
          <button type="button" className="btn" onClick={() => setNoteFor(null)}>Vazgeç</button>
          <button type="button" className={`btn ${noteFor === "rejected" ? "btn--danger" : "btn--primary"}`} onClick={async () => { if (await setStatus(noteFor, { note })) setNoteFor(null); }}>Kaydet</button>
        </>}>
          <Field label={noteFor === "rejected" ? "Neden?" : "Ne değişsin?"}><textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder={noteFor === "rejected" ? "Ör. bütçe bu yıl ayrılmadı" : "Ör. forma logosu yerine LED süresi isteniyor"} /></Field>
        </Modal>
      )}
    </Modal>
  );
}
