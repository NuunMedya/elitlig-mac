// Bütçe: kategori başına aylık gider limiti (ya da gelir hedefi). Gerçekleşen
// ve bekleyen tutar Ön Muhasebe kayıtlarından (düzenli ödemelerden işlenenler
// dahil) sunucuda hesaplanır (/api/tools/budgets); son 3 ay ortalaması ve
// bütçesi olmayan harcamalar da gösterilir.
import React, { useState } from "react";
import { Empty, ErrorNote, Field, Icon, Modal, OfflineNote, Segmented, Spinner, useConfirm, useResult } from "../../components/ui";
import { del, patch, post, useCommand, useResource } from "../../api";
import ExportButton from "../../components/ExportButton";
import { budgetReport } from "../../lib/export/reports";
import { PRESET_CATEGORIES, parseAmount } from "../../lib/ledgerUtils";
import { formatMoney } from "../../lib/helpers";
import { budgetBar, currentMonth, monthTitle, shiftMonth } from "../../lib/recurringUtils";
import { Kpi } from "./common";

const moneyInput = (v) => (v == null || v === "" ? "" : String(v).replace(".", ","));
const SUGGESTED = [...new Set([...PRESET_CATEGORIES.expense, "Fatura", "Personel", "Kira", "Abonelik", "Kredi / taksit", "Sigorta"])];

export default function Budget() {
  const [month, setMonth] = useState(currentMonth());
  const [editing, setEditing] = useState(null);
  const result = useResult();
  const confirm = useConfirm();
  const data = useResource("/api/tools/budgets", { month });
  const d = data.data;
  const items = d?.items || [];
  const expense = items.filter((b) => b.type === "expense");
  const income = items.filter((b) => b.type === "income");
  const totals = d?.totals;
  useCommand("new", () => setEditing({ type: "expense" }));

  const remove = async (b) => {
    if (!(await confirm({ title: "Bütçeyi sil", message: `"${b.category}" bütçesi silinsin mi?`, confirmLabel: "Sil", danger: true }))) return;
    if (result(await del(`/api/tools/budgets/${b.id}`), "Bütçe silindi.")) { setEditing(null); data.reload({ quiet: true }); }
  };

  return (
    <div className="acc-section">
      <div className="filters">
        <div className="rec-month">
          <button type="button" className="btn btn--sm" onClick={() => setMonth((m) => shiftMonth(m, -1))} aria-label="Önceki ay"><Icon name="chevronLeft" /></button>
          <h3>{monthTitle(month)}</h3>
          <button type="button" className="btn btn--sm" onClick={() => setMonth((m) => shiftMonth(m, 1))} aria-label="Sonraki ay"><Icon name="chevronRight" /></button>
          {month !== currentMonth() && <button type="button" className="btn btn--sm btn--soft" onClick={() => setMonth(currentMonth())}>Bu ay</button>}
        </div>
        <span className="spacer" />
        {d && <ExportButton id="budget" title="Bütçe" report={() => {
          const r = budgetReport(items.map((b) => ({ category: b.category, type: b.type, planned: b.amount, actual: (Number(b.actual) || 0) + (Number(b.pending) || 0) })), { title: `Bütçe — ${monthTitle(month)}` });
          if (d.unbudgeted?.length) r.sections.push({ id: "unbudgeted", title: "Bütçesi olmayan harcamalar", columns: [{ key: "category", label: "Kategori" }, { key: "count", label: "Kayıt", type: "number", total: "sum" }, { key: "spent", label: "Harcanan", type: "money", total: "sum", get: (u) => (Number(u.actual) || 0) + (Number(u.pending) || 0) }, { key: "avg3", label: "3 ay ortalaması", type: "money" }], rows: d.unbudgeted });
          return r;
        }} />}
        <button type="button" className="btn btn--primary" onClick={() => setEditing({ type: "expense" })}><Icon name="plus" /> Bütçe</button>
      </div>
      <OfflineNote offline={data.offline} savedAt={data.savedAt} />
      {data.error?.status === 404 ? <div className="error-note"><span>Bütçe için sunucu güncellemesi henüz yayında değil.</span></div>
        : <ErrorNote error={data.error && !d ? data.error : null} onRetry={data.reload} />}

      {totals && (
        <div className="kpis">
          <Kpi hero label="Toplam bütçe" value={formatMoney(totals.budget)} hint={`${expense.length} kategori`} icon="target" />
          <Kpi label="Harcanan" value={formatMoney(totals.spent)} tone="red" hint="bekleyenler dahil" />
          {totals.remaining >= 0
            ? <Kpi label="Kalan" value={formatMoney(totals.remaining)} tone="green" hint="Limitler içinde" />
            : <div className="kpi kpi--alert"><span>Aşım</span><strong>{formatMoney(-totals.remaining)}</strong><small>{totals.over_count} kategori aşıldı</small></div>}
          <Kpi label="Bütçesiz harcama" value={formatMoney(totals.unbudgeted)} tone="amber" hint={`${d.unbudgeted.length} kategori`} />
        </div>
      )}

      {data.loading && !d ? <Spinner /> : d && (items.length === 0 && d.unbudgeted.length === 0 ? (
        <Empty icon="target" title="Henüz bütçe yok" text="Saha kirası, hakem ücreti, faturalar gibi kategorilere aylık limit koyun; harcama arttıkça uyarı görün."
          action={<button type="button" className="btn btn--primary" onClick={() => setEditing({ type: "expense" })}><Icon name="plus" /> Bütçe ekle</button>} />
      ) : (
        <div className="bud-grid">
          <section className="card">
            <h3 className="card__title">Gider limitleri</h3>
            {expense.length ? <div className="bud-list">{expense.map((b) => <BudgetRow key={b.id} b={b} onEdit={setEditing} />)}</div> : <p className="muted small">Gider bütçesi yok.</p>}
            {income.length > 0 && <>
              <h3 className="card__title">Gelir hedefleri</h3>
              <div className="bud-list">{income.map((b) => <BudgetRow key={b.id} b={b} onEdit={setEditing} />)}</div>
            </>}
          </section>
          <section className="card">
            <h3 className="card__title">Bütçesi olmayan harcamalar</h3>
            {d.unbudgeted.length ? d.unbudgeted.map((u) => (
              <div key={u.category} className="bud-free">
                <span><strong>{u.category}</strong><small className="muted">{u.count} kayıt{u.avg3 ? ` · 3 ay ort. ${formatMoney(u.avg3, 0)}` : ""}</small></span>
                <strong className="tabular">{formatMoney(u.actual + u.pending)}</strong>
                <button type="button" className="btn btn--xs btn--soft" onClick={() => setEditing({ type: "expense", category: u.category, amount: Math.ceil(Math.max(u.actual + u.pending, u.avg3) / 100) * 100 })}>Bütçe koy</button>
              </div>
            )) : <p className="muted small">Bu ay tüm harcamalar bir bütçeye bağlı.</p>}
          </section>
        </div>
      ))}

      {editing && <BudgetEditor budget={editing} onClose={() => setEditing(null)} onDelete={remove} onSaved={() => { setEditing(null); data.reload({ quiet: true }); }} />}
    </div>
  );
}

function BudgetRow({ b, onEdit }) {
  const bar = budgetBar(b);
  const income = b.type === "income";
  const tone = income ? "" : bar.over ? " is-over" : bar.warn ? " is-warn" : "";
  return (
    <button type="button" className={`bud-row${tone}${income ? " is-income" : ""}`} onClick={() => onEdit(b)}>
      <span className="bud-row__top"><strong>{b.category}</strong><span className="tabular"><strong>{formatMoney(b.actual + b.pending)}</strong> / {formatMoney(b.amount)}</span></span>
      <span className="bud-bar"><span className="bud-bar__paid" style={{ width: `${bar.paid}%` }} /><span className="bud-bar__pending" style={{ width: `${bar.pending}%` }} /></span>
      <span className="bud-row__meta">
        <small className="muted">%{b.ratio} · {b.count} kayıt{b.pending ? ` · ${formatMoney(b.pending, 0)} bekleyen` : ""}{b.avg3 ? ` · 3 ay ort. ${formatMoney(b.avg3, 0)}` : ""}</small>
        <small className={!income && b.remaining < 0 ? "text-red" : "text-green"}>{income ? (b.remaining > 0 ? `${formatMoney(b.remaining)} eksik` : "Hedefe ulaşıldı") : b.remaining < 0 ? `${formatMoney(-b.remaining)} aşıldı` : `${formatMoney(b.remaining)} kaldı`}</small>
      </span>
    </button>
  );
}

function BudgetEditor({ budget, onClose, onSaved, onDelete }) {
  const result = useResult();
  const editing = Boolean(budget.id);
  const [form, setForm] = useState({ type: budget.type || "expense", category: budget.category || "", amount: moneyInput(budget.amount), note: budget.note || "" });
  const [busy, setBusy] = useState(false);
  const amount = parseAmount(form.amount);
  const save = async (e) => {
    e?.preventDefault();
    if (!form.category.trim() || !(amount > 0)) return;
    setBusy(true);
    const body = { ...form, amount };
    const res = editing ? await patch(`/api/tools/budgets/${budget.id}`, body) : await post("/api/tools/budgets", body);
    setBusy(false);
    if (result(res, editing ? "Bütçe güncellendi." : "Bütçe eklendi.")) onSaved();
  };
  return (
    <Modal title={editing ? "Bütçeyi düzenle" : "Yeni bütçe"} onClose={onClose} width={480} footer={<>
      {editing && <button type="button" className="btn btn--danger-ghost" onClick={() => onDelete(budget)}><Icon name="trash" /> Sil</button>}
      <span className="spacer" />
      <button type="button" className="btn" onClick={onClose}>Vazgeç</button>
      <button type="submit" form="budget-form" className="btn btn--primary" disabled={busy || !form.category.trim() || !(amount > 0)}>{busy ? "Kaydediliyor…" : "Kaydet"}</button>
    </>}>
      <form id="budget-form" className="form-grid" onSubmit={save}>
        <div className="span2"><Segmented value={form.type} onChange={(v) => setForm({ ...form, type: v })} options={[{ value: "expense", label: "Gider limiti" }, { value: "income", label: "Gelir hedefi" }]} /></div>
        <Field label="Kategori" hint="Ön Muhasebe kategorisiyle aynı yazın.">
          <input autoFocus list="budget-cats" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} maxLength={60} />
          <datalist id="budget-cats">{(form.type === "income" ? PRESET_CATEGORIES.income : SUGGESTED).map((c) => <option key={c} value={c} />)}</datalist>
        </Field>
        <Field label={form.type === "income" ? "Aylık hedef (₺)" : "Aylık limit (₺)"}><input inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0,00" /></Field>
        <Field label="Not" className="span2"><input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} maxLength={300} /></Field>
      </form>
    </Modal>
  );
}
