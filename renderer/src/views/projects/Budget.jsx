// Bütçe: projenin gelir / gider kalemleri (tahmin → bekliyor → ödendi), hesaba
// bağlı. "Ödendi" / "Tahsil edildi" yapılan kalem bağlı muhasebe hesabına
// işlenir. Adımın içinde (embedded) açıldığında o adıma süzülür.
import React, { useEffect, useMemo, useState } from "react";
import { Empty, ErrorNote, Icon, MenuButton, Spinner, useConfirm } from "../../components/ui";
import { EntryDialog, EntryStatusPill } from "../../components/finance";
import { del, patch, post, tempId, useCommand, useResource } from "../../api";
import { formatDate, isoDay } from "../../lib/helpers";
import { budgetGroups, entryTotals, filterFinanceEntries, markPaidPatch, payLabel } from "../../lib/financeUtils";
import { BASE, FINANCE_EVENT, money, useRun } from "./common";

/** Projenin bütçesi ve kayıt girilebilen hesaplar (Bütçe, kapanış pencereleri, Ayarlar). */
export function useProjectFinance(projectId, { enabled = true } = {}) {
  const res = useResource(`${BASE}/${projectId}/finance`, null, { enabled });
  const { reload } = res;
  useEffect(() => {
    const again = () => reload({ quiet: true });
    window.addEventListener(FINANCE_EVENT, again);
    return () => window.removeEventListener(FINANCE_EVENT, again);
  }, [reload]);
  return res;
}

const leadLabel = (l) => `${l.kind === "supplier" ? "Tedarikçi" : "Kişi"}: ${l.company && l.company !== l.name ? `${l.name} · ${l.company}` : l.name}`;

export default function Budget({ ctx, embedded = false, step = null }) {
  const { project, settings, canEdit, leads, steps } = ctx;
  const fin = useProjectFinance(project.id);
  const run = useRun();
  const confirm = useConfirm();
  const [f, setF] = useState({ q: "", status: "", step: step ? String(step.id) : "" });
  const [editing, setEditing] = useState(null); // { entry } | { draft }
  const d = fin.data;
  const items = useMemo(() => d?.items || [], [d]);
  const accounts = d?.accounts || [];
  const shown = useMemo(() => filterFinanceEntries(items, f), [items, f]);
  const groups = useMemo(() => budgetGroups(shown), [shown]);
  const totals = useMemo(() => entryTotals(f.step ? items.filter((e) => String(e.step_id) === f.step) : items), [items, f.step]);
  const defaultAccount = accounts.find((a) => Number(a.id) === Number(d?.default_account_id));
  const categories = settings.finance_categories || [];
  const links = useMemo(() => ({
    leads: leads.map((l) => ({ id: l.id, label: leadLabel(l) })),
    steps: steps.map((s) => ({ id: s.id, label: s.title })),
  }), [leads, steps]);
  const used = useMemo(() => {
    const ids = new Set([d?.default_account_id, ...items.map((e) => e.account_id)].filter(Boolean).map(Number));
    return accounts.filter((a) => ids.has(Number(a.id)));
  }, [accounts, items, d]);
  const reload = () => fin.reload({ quiet: true });
  useCommand("new", () => { if (!embedded && canEdit) setEditing({ draft: { type: "expense" } }); });

  const accountName = (e) => e.account_name || accounts.find((a) => Number(a.id) === Number(e.account_id))?.name || null;
  const markPaid = async (e) => {
    fin.setData((x) => ({ ...x, items: x.items.map((i) => (i.id === e.id ? markPaidPatch(i, isoDay()) : i)) }));
    const r = await patch(`${BASE}/${project.id}/finance/${e.id}`, { status: "paid" });
    const name = accountName(e);
    run(r, name ? `Hesaba işlendi: ${name} (${e.type === "income" ? "+" : "−"}${money(e.amount ?? e.estimate)})` : `${payLabel(e.type)} olarak işaretlendi. Hesap seçilmediği için bakiyeye yansımaz.`);
    // Çevrimdışıyken önbellekteki eski veri iyimser değişikliği ezmesin.
    if (!r.queued) reload();
  };
  const setStatus = async (e, status) => {
    fin.setData((x) => ({ ...x, items: x.items.map((i) => (i.id === e.id ? { ...i, status } : i)) }));
    const r = await patch(`${BASE}/${project.id}/finance/${e.id}`, { status });
    if (!run(r, status === "cancelled" ? "Kalem iptal edildi." : "Durum değişti.") || !r.queued) reload();
  };
  const remove = async (e) => {
    if (!(await confirm({ title: "Kalemi sil", message: `“${e.description || e.category || "Kalem"}” silinsin mi?${e.status === "paid" && e.account_id ? " Hesaba işlenen tutar geri alınır." : ""}`, confirmLabel: "Sil", danger: true }))) return;
    if (run(await del(`${BASE}/${project.id}/finance/${e.id}`), "Kalem silindi.")) { setEditing(null); reload(); }
  };
  const save = async (body) => {
    const current = editing?.entry;
    const tmp = current ? null : tempId();
    const r = current ? await patch(`${BASE}/${project.id}/finance/${current.id}`, body) : await post(`${BASE}/${project.id}/finance`, body, { tempId: tmp });
    const acc = accounts.find((a) => Number(a.id) === Number(body.account_id));
    const ok = run(r, body.status === "paid" && acc && current?.status !== "paid" ? `Hesaba işlendi: ${acc.name}` : current ? "Kalem güncellendi." : "Kalem eklendi.");
    if (ok && r.queued) {
      // Çevrimdışı: kalem ekranda hemen görünür, bağlantı gelince gönderilir.
      const local = { ...(current || {}), ...body, id: current?.id || tmp, project_id: project.id, account_name: acc?.name || null, effective: Number(body.amount ?? body.estimate ?? 0), can_edit: true, pending_sync: true };
      fin.setData((x) => ({ ...x, items: current ? x.items.map((i) => (i.id === current.id ? local : i)) : [local, ...x.items] }));
    } else if (ok) reload();
    return ok;
  };
  const add = (type) => setEditing({ draft: { type, account_id: d?.default_account_id || "", step_id: f.step || step?.id || "", status: "planned" } });

  if (fin.loading && !d) return <Spinner />;
  if (fin.error && !d) return <ErrorNote error={fin.error} onRetry={fin.reload} />;

  return (
    <div className={`proj-section budget ${embedded ? "budget--embedded" : ""}`}>
      <div className="kpis kpis--compact budget__kpis">
        <div className="kpi kpi--hero"><span><Icon name="trend" size={12} /> Tahmini net</span><strong>{money(totals.estimate_net)}</strong><small>gelir {money(totals.estimate_income)} · gider {money(totals.estimate_expense)}</small></div>
        <div className="kpi kpi--green"><span>Tahmini gelir</span><strong>{money(totals.estimate_income)}</strong><small>tahsil edilen {money(totals.paid_income)}</small></div>
        <div className="kpi kpi--red"><span>Tahmini gider</span><strong>{money(totals.estimate_expense)}</strong><small>ödenen {money(totals.paid_expense)}</small></div>
        <div className="kpi kpi--amber"><span>Bekleyen</span><strong>{money(totals.pending_income - totals.pending_expense)}</strong><small>+{money(totals.pending_income)} · −{money(totals.pending_expense)}</small></div>
        <div className="kpi kpi--blue"><span>Gerçekleşen</span><strong className={totals.paid_net < 0 ? "text-red" : ""}>{money(totals.paid_net)}</strong><small>hesaplara işlenen net</small></div>
        <div className="kpi"><span>Kalan</span><strong>{money(totals.open_income - totals.open_expense)}</strong><small>tahsil edilecek {money(totals.open_income)} · ödenecek {money(totals.open_expense)}</small></div>
      </div>

      <div className="budget__accounts">
        {used.length ? used.map((a) => (
          <div key={a.id} className="account-chip" style={{ "--ac": a.color || "#7c3aed" }} title={Number(a.id) === Number(d.default_account_id) ? "Varsayılan proje hesabı" : "Bu projede kullanılan hesap"}>
            <span className="account-chip__icon"><Icon name={a.kind === "banka" ? "bank" : "wallet"} size={14} /></span>
            <span><small>{a.name}{Number(a.id) === Number(d.default_account_id) ? " · varsayılan" : ""}</small><strong className={a.balance < 0 ? "text-red" : ""}>{money(a.balance)}</strong></span>
          </div>
        )) : <span className="muted small"><Icon name="alert" size={12} /> Varsayılan proje hesabı seçilmedi: “Ödendi” yapılan kalemler bir hesaba işlenmez. {canEdit && <button type="button" className="link-btn small" onClick={() => ctx.setTab("settings")}>Ayarlar → Bütçe ve muhasebe</button>}</span>}
        <span className="spacer" />
        {!defaultAccount && d?.default_account_id && <span className="pill pill--amber"><Icon name="lock" size={10} /> Varsayılan hesaba kayıt yetkiniz yok</span>}
        {!accounts.length && <span className="pill"><Icon name="lock" size={10} /> Kayıt girebileceğiniz muhasebe hesabı yok</span>}
      </div>

      <div className="filters">
        <div className="search-box"><Icon name="search" size={14} /><input value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} placeholder="Açıklama, cari, kategori, tedarikçi…" /></div>
        <select className="select-sm" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} aria-label="Durum"><option value="">Tüm durumlar</option><option value="open">Açık (tahmin + bekleyen)</option><option value="planned">Tahmin</option><option value="pending">Bekliyor</option><option value="paid">Ödendi / tahsil edildi</option><option value="cancelled">İptal</option></select>
        {!embedded && <select className="select-sm" value={f.step} onChange={(e) => setF({ ...f, step: e.target.value })} aria-label="Adım"><option value="">Tüm adımlar</option>{[...new Set(items.map((e) => e.step_id).filter(Boolean))].map((sid) => <option key={sid} value={sid}>{steps.find((s) => s.id === sid)?.title || `Adım #${sid}`}</option>)}</select>}
        {f.step && step && <span className="pill pill--tool"><Icon name="list" size={10} /> {step.title}</span>}
        <span className="spacer" />
        {canEdit && <>
          <button type="button" className="btn btn--green" onClick={() => add("income")}><Icon name="plus" /> Gelir</button>
          <button type="button" className="btn btn--red" onClick={() => add("expense")}><Icon name="plus" /> Gider</button>
        </>}
      </div>

      {items.length ? (
        <div className="budget__cols">
          {groups.map((g) => (
            <section key={g.type} className={`card budget-col budget-col--${g.type}`}>
              <header className="card__head">
                <h2 className="card__title"><span className="card__icon"><Icon name={g.type === "income" ? "trend" : "receipt"} size={15} /></span> {g.label}</h2>
                <span className="budget-col__sum"><strong>{money(g.total)}</strong><small>{g.type === "income" ? "tahsil" : "ödenen"} {money(g.paid)} · açık {money(g.open)}</small></span>
              </header>
              <div className="budget-col__track"><span style={{ width: `${g.total ? Math.min(100, (g.paid / g.total) * 100) : 0}%` }} /></div>
              {g.items.length ? (
                <ul className="budget-list">
                  {g.items.map((e) => {
                    const overdue = ["planned", "pending"].includes(e.status) && e.due_date && e.due_date < isoDay();
                    const acc = accountName(e);
                    return (
                      <li key={e.id} className={`budget-row is-${e.status} ${overdue ? "is-overdue" : ""}`} onDoubleClick={() => canEdit && e.can_edit !== false && setEditing({ entry: e })}>
                        <div className="budget-row__main">
                          <strong>{e.description || e.category || (e.type === "income" ? "Gelir" : "Gider")}{e.pending_sync && <span className="pill pill--xs pill--amber budget-row__sync"><Icon name="cloudOff" size={9} /> eşitlenecek</span>}</strong>
                          <small>
                            {[e.category && e.description ? e.category : null, e.lead_name, e.step_title, e.party && e.party !== e.lead_name ? e.party : null].filter(Boolean).join(" · ")}
                          </small>
                          <span className="budget-row__meta">
                            <EntryStatusPill entry={e} small />
                            {acc ? <span className="pill pill--xs"><Icon name="bank" size={9} /> {acc}</span> : <span className="pill pill--xs" title="Hesap seçilmedi">hesapsız</span>}
                            {e.status === "paid" ? <small className="muted">{formatDate(e.paid_date || e.entry_date)}</small>
                              : e.due_date ? <small className={overdue ? "text-red" : "muted"}>vade {formatDate(e.due_date)}</small> : null}
                          </span>
                        </div>
                        <div className="budget-row__amount">
                          <strong className={e.status === "cancelled" ? "muted" : g.type === "income" ? "text-green" : "text-red"}>{money(e.effective)}</strong>
                          {e.amount == null && e.estimate != null && <small className="muted">tahmini</small>}
                          {e.amount != null && e.estimate != null && e.estimate !== e.amount && <small className="muted">tahmin {money(e.estimate)}</small>}
                        </div>
                        {canEdit && e.can_edit !== false && (
                          <div className="budget-row__actions">
                            {["planned", "pending"].includes(e.status) && <button type="button" className="btn btn--xs btn--soft" onClick={() => markPaid(e)}><Icon name="check" size={11} /> {payLabel(e.type)}</button>}
                            <MenuButton label="Kalem işlemleri" items={[
                              { label: "Düzenle", icon: "sliders", onClick: () => setEditing({ entry: e }) },
                              e.status === "planned" && { label: "Bekliyor yap (kesinleşti)", icon: "clock", onClick: () => setStatus(e, "pending") },
                              e.status === "pending" && { label: "Tahmine al", icon: "clock", onClick: () => setStatus(e, "planned") },
                              e.status === "paid" && { label: "Ödenmedi (bekliyor yap)", icon: "undo", onClick: () => setStatus(e, "pending") },
                              e.status !== "cancelled" && { label: "İptal et", icon: "x", onClick: () => setStatus(e, "cancelled") },
                              e.status === "cancelled" && { label: "Yeniden aç", icon: "refresh", onClick: () => setStatus(e, "planned") },
                              "-",
                              { label: "Sil", icon: "trash", danger: true, onClick: () => remove(e) },
                            ]} />
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : <p className="muted small">{g.type === "income" ? "Gelir kalemi yok." : "Gider kalemi yok."}</p>}
            </section>
          ))}
        </div>
      ) : (
        <Empty icon="wallet" title="Bütçe henüz boş" text="Sponsorluk, katılım ücreti gibi gelirleri ve tesis, ödül, personel gibi giderleri tahminle başlayın; kesinleşince “Bekliyor”, ödenince “Ödendi” yapın — tutar bağlı muhasebe hesabına işlenir. Tedarik görüşmesini tamamladığınızda gider kendiliğinden buraya yazılır."
          action={canEdit && <div className="row-gap"><button type="button" className="btn btn--green" onClick={() => add("income")}><Icon name="plus" /> Gelir</button><button type="button" className="btn btn--red" onClick={() => add("expense")}><Icon name="plus" /> Gider</button></div>} />
      )}

      {editing && (
        <EntryDialog entry={editing.entry} draft={editing.draft} accounts={accounts} categories={categories} links={links} accountRequired={false}
          accountHint={!accounts.length ? "Kayıt girebileceğiniz muhasebe hesabı yok; kalem yalnız proje bütçesinde tutulur." : undefined}
          onClose={() => setEditing(null)} onSave={save} onDelete={remove} />
      )}
    </div>
  );
}
