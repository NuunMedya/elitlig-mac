// Düzenli Ödemeler: sabit giderler ve tekrar eden ödemeler — fatura, maaş,
// kira, abonelik, kredi taksiti, vergi / SGK, sigorta ve düzenli gelirler.
// Dönemler sunucuda tanımdan hesaplanır (/api/tools/recurring). "Öde" ile o
// dönem Ön Muhasebe'ye fiş olarak işlenir (hesap bakiyesi, KDV, cari tek
// defterden beslenir); "Fatura geldi" ile tutar ve son ödeme tarihi girilip
// ödenecek olarak kaydedilir. Vadesi yaklaşan ödemeler için masaüstü bildirimi
// gelir (app/reminders.js).
//
//   Ödeme takvimi  ayın dönemleri, gecikenler, öde / fatura geldi / atla / geri al
//   Tanımlar       tüm kalemler, aylık sabit gider dağılımı, durdur / sürdür
//   Nakit akışı    6 aylık beklenen gelir-gider ve dönem sonu bakiyesi
import React, { useMemo, useState } from "react";
import { Empty, ErrorNote, Field, Icon, MenuButton, Modal, OfflineNote, Segmented, Spinner, useConfirm, useResult } from "../../components/ui";
import { AccountSelectField } from "../../components/finance";
import { del, patch, post, useCommand, useResource } from "../../api";
import { METHODS, VAT_RATES, parseAmount, splitVat } from "../../lib/ledgerUtils";
import { formatDate, formatMoney, isoDay } from "../../lib/helpers";
import {
  FREQUENCIES, KINDS, currentMonth, daysText, endModeOf, frequencyLabel, kindOf, monthShort, monthTitle, occStatusLabel, recurringCsv, shiftMonth, withBalance,
} from "../../lib/recurringUtils";
import { AccountStrip, Kpi } from "./common";

const moneyInput = (v) => (v == null || v === "" ? "" : String(v).replace(".", ","));
const OPEN = ["overdue", "due_soon", "upcoming"];
const PILL = { paid: "pill--green", accrued: "pill--amber", overdue: "pill--red", due_soon: "pill--blue", upcoming: "", skipped: "", untracked: "" };

const blankItem = (kind = "bill") => ({
  type: kind === "income" ? "income" : "expense", kind, name: "", party: "", category: "", amount: "", variable_amount: kind === "bill", vat_rate: kind === "bill" ? 20 : 0,
  method: "bank", account_id: "", frequency: "monthly", start_date: isoDay(), end_date: "", total_count: "", reminder_days: 3, subscriber_no: "", note: "", active: true,
});

export default function Recurring({ accounts = [], startBalance = null, onTransfer, onManageAccounts, onBalanceChange }) {
  const [month, setMonth] = useState(currentMonth());
  const [tab, setTab] = useState(() => localStorage.getItem("recurring:tab") || "calendar");
  const [editing, setEditing] = useState(null);
  const [paying, setPaying] = useState(null);
  const [filter, setFilter] = useState({ kind: "", status: "active", query: "" });
  // Başlangıç bakiyesi yazılırken metin olarak tutulur ("12," ya da "-" ara değerleri silinmesin).
  const [openingText, setOpeningText] = useState(null);
  const result = useResult();
  const confirm = useConfirm();
  const data = useResource("/api/tools/recurring", { month });
  const d = data.data;
  const items = useMemo(() => d?.items || [], [d]);
  const postable = useMemo(() => accounts.filter((a) => a.can_post), [accounts]);
  const summary = d?.summary;
  const today = d?.today || isoDay();
  const earlier = (d?.overdue || []).filter((o) => o.period < `${month}-01`);
  const shownItems = useMemo(() => {
    const q = filter.query.trim().toLocaleLowerCase("tr-TR");
    return items.filter((i) => (!filter.kind || i.kind === filter.kind)
      && (filter.status === "all" || (filter.status === "active" ? i.active : !i.active))
      && (!q || [i.name, i.party, i.subscriber_no, i.note].filter(Boolean).join(" ").toLocaleLowerCase("tr-TR").includes(q)));
  }, [items, filter]);
  const opening = openingText == null ? null : parseAmount(openingText);
  const flow = useMemo(() => withBalance(d?.forecast || [], opening ?? startBalance ?? 0), [d, opening, startBalance]);

  const chooseTab = (v) => { setTab(v); try { localStorage.setItem("recurring:tab", v); } catch { /* yoksay */ } };
  const reload = () => data.reload({ quiet: true });
  useCommand("new", () => setEditing(blankItem("bill")));
  useCommand("export", () => exportCsv());

  // Ödeme / tahsilat / geri alma hesap bakiyesini değiştirir: hesaplar da tazelenir
  // (nakit akışının başlangıç bakiyesi ve üstteki hesap şeridi onlardan gelir).
  const run = async (promise, message, { balance = false } = {}) => { if (result(await promise, message)) { reload(); if (balance) onBalanceChange?.(); } };
  const onSkip = (o, undo = false) => run(post(`/api/tools/recurring/${o.recurring_id}/skip`, { period: o.period, undo }, { queue: false }), undo ? "Atlama geri alındı." : `${o.period_label} atlandı.`);
  const onSettle = (o) => run(patch(`/api/tools/ledger/${o.entry_id}`, { status: "paid", entry_date: isoDay() }), o.type === "income" ? "Tahsil edildi." : "Ödendi.", { balance: true });
  const onUndo = async (o) => {
    if (!(await confirm({ title: "İşlemi geri al", message: `${o.name} · ${o.period_label}: Ön Muhasebe'deki kayıt silinir.`, confirmLabel: "Geri al", danger: true }))) return;
    run(del(`/api/tools/ledger/${o.entry_id}`), "İşlem geri alındı.", { balance: true });
  };
  const toggle = (i) => run(patch(`/api/tools/recurring/${i.id}`, { active: !i.active }), i.active ? "Durduruldu; yeni dönem açılmaz." : "Yeniden etkinleştirildi.");
  const remove = async (i) => {
    if (!(await confirm({ title: "Düzenli ödemeyi sil", message: `"${i.name}" silinsin mi? İşlenmiş kayıtlar Ön Muhasebe'de kalır.`, confirmLabel: "Sil", danger: true }))) return;
    if (result(await del(`/api/tools/recurring/${i.id}`), "Silindi.")) { setEditing(null); reload(); }
  };
  async function exportCsv() {
    const res = await window.elitlig.files.save(`Elitlig-Duzenli-Odemeler-${today}.csv`, recurringCsv(shownItems), [{ name: "CSV", extensions: ["csv"] }]);
    if (res.ok) window.elitlig.files.reveal(res.path);
  }

  const rowProps = { onPay: (o) => setPaying({ o, mode: "paid" }), onAccrue: (o) => setPaying({ o, mode: "pending" }), onSkip, onSettle, onUndo };
  const progress = summary?.expected_expense ? Math.min(100, Math.round((summary.paid_expense / summary.expected_expense) * 100)) : 0;
  const notDeployed = data.error?.status === 404;

  return (
    <div className="acc-section">
      <div className="filters">
        <Segmented value={tab} onChange={chooseTab} size="sm" options={[
          { value: "calendar", label: "Ödeme takvimi", icon: "calendar", count: summary?.overdue_count || undefined },
          { value: "items", label: "Tanımlar", icon: "list", count: items.length || undefined },
          { value: "cashflow", label: "Nakit akışı", icon: "trend" },
        ]} />
        <span className="spacer" />
        <MenuButton icon="download" label="Dışa aktar" items={[{ label: "Tanımlar (CSV / Excel)", icon: "download", onClick: exportCsv }]} />
        <button type="button" className="btn btn--primary" onClick={() => setEditing(blankItem("bill"))}><Icon name="plus" /> Düzenli ödeme</button>
      </div>
      <AccountStrip accounts={accounts} scope="personal" onTransfer={onTransfer} onManage={onManageAccounts} />
      <OfflineNote offline={data.offline} savedAt={data.savedAt} />
      {notDeployed ? <div className="error-note"><span>Düzenli Ödemeler için sunucu güncellemesi henüz yayında değil.</span></div>
        : <ErrorNote error={data.error && !d ? data.error : null} onRetry={data.reload} />}

      {summary && (
        <div className="kpis">
          <Kpi hero label="Aylık sabit gider" value={formatMoney(summary.monthly_expense)} hint={`${summary.active_count} aktif kalem · yıllık ${formatMoney(summary.monthly_expense * 12, 0)}`} icon="repeat" />
          <Kpi label="Aylık düzenli gelir" value={formatMoney(summary.monthly_income)} tone="green" hint={summary.monthly_income ? `Net ${formatMoney(summary.monthly_income - summary.monthly_expense)}` : "Aidat, sponsorluk, kira geliri"} />
          <Kpi label={`${monthTitle(month)} kalan`} value={formatMoney(summary.remaining_expense)} tone="amber" hint={`${summary.paid_count}/${summary.count} dönem işlendi`} />
          <Kpi label={`${monthTitle(month)} ödenen`} value={formatMoney(summary.paid_expense)} tone="blue" hint={`Beklenen ${formatMoney(summary.expected_expense, 0)}`} />
          {summary.overdue_count > 0
            ? <div className="kpi kpi--alert"><span>Geciken</span><strong>{formatMoney(summary.overdue_amount)}</strong><small>{summary.overdue_count} dönem ödenmedi</small></div>
            : <Kpi label="Geciken" value="Yok" tone="green" hint="Tüm vadeler zamanında" />}
        </div>
      )}

      {data.loading && !d ? <Spinner /> : d && tab === "calendar" && (items.length === 0 ? (
        <Empty icon="repeat" title="Henüz düzenli ödeme yok" text="Elektrik, su, internet faturaları; çalışan maaşları; kira, abonelik ve kredi taksitlerini bir kez tanımlayın, her ay vadesi gelince burada görün ve bildirim alın."
          action={<div className="rec-kinds rec-kinds--center">{KINDS.filter((k) => ["bill", "salary", "rent", "subscription", "loan", "tax"].includes(k.key)).map((k) => (
            <button key={k.key} type="button" className="rec-kind" style={{ "--kc": k.color }} onClick={() => setEditing(blankItem(k.key))}><Icon name={k.icon} size={14} /> {k.label}</button>
          ))}</div>} />
      ) : (<>
        <div className="rec-month">
          <button type="button" className="btn btn--sm" onClick={() => setMonth((m) => shiftMonth(m, -1))} aria-label="Önceki ay"><Icon name="chevronLeft" /></button>
          <h3>{monthTitle(month)}</h3>
          <button type="button" className="btn btn--sm" onClick={() => setMonth((m) => shiftMonth(m, 1))} aria-label="Sonraki ay"><Icon name="chevronRight" /></button>
          {month !== currentMonth() && <button type="button" className="btn btn--sm btn--soft" onClick={() => setMonth(currentMonth())}>Bu ay</button>}
          {summary?.expected_expense > 0 && <span className="rec-progress"><span className="rec-progress__bar"><span style={{ width: `${progress}%` }} /></span><small>%{progress} ödendi</small></span>}
        </div>
        {earlier.length > 0 && (
          <section className="card rec-late">
            <h3 className="card__title"><Icon name="alert" /> Önceki aylardan geciken {earlier.length} ödeme</h3>
            <ul className="rec-list">{earlier.map((o) => <OccurrenceRow key={o.key} o={o} {...rowProps} />)}</ul>
          </section>
        )}
        {d.occurrences.length ? <ul className="rec-list">{d.occurrences.map((o) => <OccurrenceRow key={o.key} o={o} {...rowProps} />)}</ul>
          : <Empty icon="calendar" title={`${monthTitle(month)} için ödeme yok`} text="Bu ay vadesi gelen düzenli ödeme bulunmuyor." />}
      </>))}

      {d && tab === "items" && (<>
        {summary?.by_kind?.length > 0 && (
          <div className="rec-mix">
            <div className="rec-mix__bar">{summary.by_kind.map((k) => <span key={k.kind} style={{ width: `${(k.monthly / Math.max(1, summary.monthly_expense)) * 100}%`, background: kindOf(k.kind).color }} title={`${k.label}: ${formatMoney(k.monthly)}`} />)}</div>
            <div className="rec-mix__legend">{summary.by_kind.map((k) => (
              <button key={k.kind} type="button" className={filter.kind === k.kind ? "is-active" : ""} onClick={() => setFilter((f) => ({ ...f, kind: f.kind === k.kind ? "" : k.kind }))}>
                <i style={{ background: kindOf(k.kind).color }} /> {k.label} <strong>{formatMoney(k.monthly, 0)}</strong><small>/ay · {k.count}</small>
              </button>
            ))}</div>
          </div>
        )}
        <div className="filters">
          <div className="search-box"><Icon name="search" size={14} /><input value={filter.query} onChange={(e) => setFilter({ ...filter, query: e.target.value })} placeholder="Ad, cari, abone no…" /></div>
          <select className="select-sm" value={filter.kind} onChange={(e) => setFilter({ ...filter, kind: e.target.value })} aria-label="Tür"><option value="">Tüm türler</option>{KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}</select>
          <select className="select-sm" value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value })} aria-label="Durum"><option value="active">Aktif</option><option value="paused">Durdurulan</option><option value="all">Tümü</option></select>
        </div>
        {shownItems.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Ödeme</th><th>Tekrar</th><th className="num">Tutar</th><th className="num">Aylık</th><th>Sonraki vade</th><th>Son işlem</th><th className="num">Bu yıl</th><th /></tr></thead>
              <tbody>
                {shownItems.map((i) => {
                  const kind = kindOf(i.kind);
                  return (
                    <tr key={i.id} className={i.active ? "" : "is-muted"} onDoubleClick={() => setEditing(i)}>
                      <td><span className="rec-name"><span className="rec-dot" style={{ background: i.color || kind.color }}><Icon name={kind.icon} size={12} /></span><span><strong>{i.name}</strong><small className="muted">{[kind.label, i.party, i.subscriber_no].filter(Boolean).join(" · ")}{i.active ? "" : " · durduruldu"}</small></span></span></td>
                      <td>{frequencyLabel(i.frequency)}{i.total_count ? <small className="muted"> · {i.paid_count}/{i.total_count} taksit</small> : i.end_date ? <small className="muted"> · {formatDate(i.end_date)} bitiş</small> : null}</td>
                      <td className={`num ${i.type === "income" ? "text-green" : "text-red"}`}>{i.variable_amount ? "~" : ""}{formatMoney(i.amount)}</td>
                      <td className="num">{formatMoney(i.monthly_amount)}</td>
                      <td>{i.next_due ? <><span className={`pill ${PILL[i.next_due.status] || ""}`}>{formatDate(i.next_due.due_date)}</span> <small className="muted">{daysText(Math.round((new Date(`${i.next_due.due_date}T00:00:00`) - new Date(`${today}T00:00:00`)) / 86400000))}</small></> : <span className="muted">—</span>}</td>
                      <td>{i.last_paid ? <>{formatDate(i.last_paid.entry_date)} <small className="muted">{formatMoney(i.last_paid.amount, 0)}</small></> : <span className="muted">—</span>}</td>
                      <td className="num">{i.paid_total_year ? formatMoney(i.paid_total_year) : "—"}</td>
                      <td className="row-actions">
                        <MenuButton items={[
                          { label: "Düzenle", icon: "sliders", onClick: () => setEditing(i) },
                          { label: i.active ? "Durdur" : "Sürdür", icon: i.active ? "pause" : "play", onClick: () => toggle(i) },
                          { label: "Kopyala (yeni tanım)", icon: "copy", onClick: () => setEditing({ ...i, id: undefined, name: `${i.name} (kopya)`, start_date: i.next_due?.period || isoDay() }) },
                          { label: "Sil", icon: "trash", danger: true, onClick: () => remove(i) },
                        ]} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot><tr>
                <td colSpan={3}>{shownItems.length} kalem</td>
                <td className="num"><strong>{formatMoney(shownItems.filter((i) => i.active).reduce((s, i) => s + (i.type === "income" ? -1 : 1) * i.monthly_amount, 0))}</strong></td>
                <td colSpan={2} className="muted">aylık net gider</td>
                <td className="num"><strong>{formatMoney(shownItems.reduce((s, i) => s + (i.paid_total_year || 0), 0))}</strong></td>
                <td />
              </tr></tfoot>
            </table>
          </div>
        ) : <Empty icon="list" title={items.length ? "Süzgece uyan kalem yok" : "Henüz düzenli ödeme yok"} action={<button type="button" className="btn btn--primary" onClick={() => setEditing(blankItem(filter.kind || "bill"))}><Icon name="plus" /> Ekle</button>} />}
      </>)}

      {d && tab === "cashflow" && (
        <section className="card">
          <div className="filters">
            <p className="muted small rec-flow__note">Önümüzdeki 6 ay: işlenmemiş düzenli ödemeler + Ön Muhasebe'deki vadeli alacak ve borçlar. Geciken tutarlar bu aya yazılır.</p>
            <span className="spacer" />
            <label className="rec-flow__start">Başlangıç bakiyesi
              <input inputMode="decimal" className="select-sm" value={openingText ?? moneyInput(startBalance ?? 0)} onChange={(e) => setOpeningText(e.target.value)} aria-label="Başlangıç bakiyesi" />
            </label>
            {openingText != null && startBalance != null && <button type="button" className="btn btn--xs btn--soft" onClick={() => setOpeningText(null)}>Kişisel hesaplar</button>}
          </div>
          <div className="rec-flow">
            {flow.map((m) => {
              const max = Math.max(1, ...flow.flatMap((x) => [x.income, x.expense]));
              return (
                <div key={m.month} className="rec-flow__col">
                  <div className="rec-flow__bars">
                    <span className="bg-green" style={{ height: `${(m.income / max) * 100}%` }} title={`Gelir ${formatMoney(m.income)}`} />
                    <span className="bg-red" style={{ height: `${(m.expense / max) * 100}%` }} title={`Gider ${formatMoney(m.expense)}`} />
                  </div>
                  <small>{monthShort(m.month)}</small>
                  <strong className={m.balance < 0 ? "text-red" : ""}>{formatMoney(m.balance, 0)}</strong>
                </div>
              );
            })}
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Ay</th><th className="num">Düzenli gelir</th><th className="num">Bekleyen alacak</th><th className="num">Düzenli gider</th><th className="num">Bekleyen borç</th><th className="num">Net</th><th className="num">Dönem sonu bakiye</th></tr></thead>
              <tbody>{flow.map((m) => (
                <tr key={m.month}>
                  <td>{monthTitle(m.month)}</td>
                  <td className="num">{formatMoney(m.recurring_income)}</td><td className="num">{formatMoney(m.pending_income)}</td>
                  <td className="num">{formatMoney(m.recurring_expense)}</td><td className="num">{formatMoney(m.pending_expense)}</td>
                  <td className={`num ${m.net >= 0 ? "text-green" : "text-red"}`}>{formatMoney(m.net)}</td>
                  <td className={`num ${m.balance < 0 ? "text-red" : ""}`}><strong>{formatMoney(m.balance)}</strong></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          {flow.some((m) => m.balance < 0) && <div className="error-note"><span>Projeksiyona göre {monthTitle(flow.find((m) => m.balance < 0).month)} ayında bakiye eksiye düşüyor.</span></div>}
        </section>
      )}

      {editing && <RecurringEditor item={editing} accounts={postable} onClose={() => setEditing(null)} onDelete={remove} onSaved={() => { setEditing(null); reload(); }} />}
      {paying && <PayDialog occurrence={paying.o} item={items.find((i) => i.id === paying.o.recurring_id)} mode={paying.mode} accounts={postable} onClose={() => setPaying(null)} onSaved={(status) => { setPaying(null); reload(); if (status === "paid") onBalanceChange?.(); }} />}
    </div>
  );
}

function OccurrenceRow({ o, onPay, onAccrue, onSkip, onSettle, onUndo }) {
  const kind = kindOf(o.kind);
  const income = o.type === "income";
  const open = OPEN.includes(o.status);
  return (
    <li className={`rec-occ rec-occ--${o.status}${o.late ? " is-late" : ""}`} style={{ "--kc": o.color || kind.color }}>
      <span className="rec-occ__date"><strong>{Number(o.due_date.slice(8, 10))}</strong><small>{monthShort(o.due_date.slice(0, 7))}</small></span>
      <span className="rec-dot rec-dot--lg"><Icon name={kind.icon} size={15} /></span>
      <span className="rec-occ__main">
        <strong>{o.name}{o.total_count ? <small className="muted"> {o.index}/{o.total_count}</small> : null}</strong>
        <small>{[kind.label, o.party, o.document_no && `Belge ${o.document_no}`, o.status === "paid" && o.entry_date && `${formatDate(o.entry_date)} tarihinde`].filter(Boolean).join(" · ")}</small>
      </span>
      <span className={`pill ${o.late ? "pill--red" : PILL[o.status] || ""}`}>{occStatusLabel(o)}{(open && o.status !== "upcoming") || o.status === "accrued" ? ` · ${daysText(o.days)}` : ""}</span>
      <strong className={`rec-occ__amt ${income ? "text-green" : "text-red"}`}>{o.estimated ? <small className="muted" title="Tahmini tutar">~</small> : null}{income ? "+" : "−"}{formatMoney(o.amount)}</strong>
      <span className="rec-occ__actions">
        {open && <button type="button" className="btn btn--xs btn--primary" onClick={() => onPay(o)}><Icon name="check" size={12} /> {income ? "Tahsil et" : "Öde"}</button>}
        {open && !income && <button type="button" className="btn btn--xs" onClick={() => onAccrue(o)} title="Tutar ve son ödeme tarihini girin">Fatura geldi</button>}
        {o.status === "accrued" && <button type="button" className="btn btn--xs btn--primary" onClick={() => onSettle(o)}><Icon name="check" size={12} /> {income ? "Tahsil edildi" : "Ödendi"}</button>}
        {open && <button type="button" className="btn btn--xs btn--soft" onClick={() => onSkip(o)} title="Bu dönemi atla" aria-label="Bu dönemi atla"><Icon name="skip" size={12} /></button>}
        {o.status === "skipped" && <button type="button" className="btn btn--xs" onClick={() => onSkip(o, true)}>Geri al</button>}
        {(o.status === "paid" || o.status === "accrued") && <button type="button" className="btn btn--xs btn--soft" onClick={() => onUndo(o)} title="İşlemi geri al (Ön Muhasebe kaydını sil)" aria-label="İşlemi geri al"><Icon name="undo" size={12} /></button>}
      </span>
    </li>
  );
}

function RecurringEditor({ item, accounts, onClose, onSaved, onDelete }) {
  const result = useResult();
  const editing = Boolean(item.id);
  const [form, setForm] = useState(() => ({
    ...blankItem(item.kind), ...item,
    amount: moneyInput(item.amount), account_id: item.account_id ? String(item.account_id) : "",
    end_mode: endModeOf(item), end_date: item.end_date || "", total_count: item.total_count || "", track_past: false,
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const kind = kindOf(form.kind);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  const pickKind = (key) => setForm((f) => ({
    ...f, kind: key, type: key === "income" ? "income" : f.kind === "income" ? "expense" : f.type,
    variable_amount: editing ? f.variable_amount : key === "bill", vat_rate: editing ? f.vat_rate : key === "bill" ? 20 : 0,
  }));
  const past = !editing && form.start_date && form.start_date < isoDay();

  const save = async (e) => {
    e?.preventDefault();
    const amount = parseAmount(form.amount);
    if (!form.name.trim()) { setError("Ödemeye bir ad verin."); return; }
    if (!form.variable_amount && !(amount > 0)) { setError("Sıfırdan büyük bir tutar girin (değişken tutarlıysa tahmini tutar)."); return; }
    setBusy(true);
    setError("");
    const body = {
      type: form.type, kind: form.kind, name: form.name, party: form.party, category: form.category, amount: amount || 0, variable_amount: form.variable_amount,
      vat_rate: Number(form.vat_rate) || 0, method: form.method, account_id: form.account_id ? Number(form.account_id) : null, frequency: form.frequency,
      start_date: form.start_date, end_date: form.end_mode === "date" ? form.end_date || null : null, total_count: form.end_mode === "count" ? Number(form.total_count) || null : null,
      reminder_days: Number(form.reminder_days) || 0, subscriber_no: form.subscriber_no, note: form.note, active: form.active,
    };
    if (past && form.track_past) body.track_from = form.start_date;
    const res = editing ? await patch(`/api/tools/recurring/${item.id}`, body) : await post("/api/tools/recurring", body);
    setBusy(false);
    if (result(res, editing ? "Düzenli ödeme güncellendi." : "Düzenli ödeme eklendi.")) onSaved();
  };

  return (
    <Modal title={editing ? "Düzenli ödemeyi düzenle" : "Yeni düzenli ödeme"} onClose={onClose} width={680} footer={<>
      {editing && <button type="button" className="btn btn--danger-ghost" onClick={() => onDelete(item)}><Icon name="trash" /> Sil</button>}
      <span className="spacer" />
      <button type="button" className="btn" onClick={onClose}>Vazgeç</button>
      <button type="submit" form="recurring-form" className="btn btn--primary" disabled={busy}>{busy ? "Kaydediliyor…" : "Kaydet"}</button>
    </>}>
      <form id="recurring-form" className="form-grid" onSubmit={save}>
        {error && <div className="error-note span2"><span>{error}</span></div>}
        <div className="span2 rec-kinds" role="radiogroup" aria-label="Ödeme türü">
          {KINDS.map((k) => (
            <button key={k.key} type="button" role="radio" aria-checked={form.kind === k.key} className={`rec-kind${form.kind === k.key ? " is-active" : ""}`} style={{ "--kc": k.color }} onClick={() => pickKind(k.key)}><Icon name={k.icon} size={13} /> {k.label}</button>
          ))}
        </div>
        {form.kind === "other" && <div className="span2"><Segmented value={form.type} onChange={(v) => setForm({ ...form, type: v })} options={[{ value: "expense", label: "Gider" }, { value: "income", label: "Gelir" }]} /></div>}
        <Field label="Ad" className="span2">
          <input autoFocus list="rec-names" value={form.name} onChange={set("name")} placeholder={kind.names[0] ? `örn. ${kind.names[0]}` : "örn. Ofis temizliği"} maxLength={120} />
          <datalist id="rec-names">{kind.names.map((n) => <option key={n} value={n} />)}</datalist>
        </Field>
        <Field label={kind.party}><input value={form.party || ""} onChange={set("party")} placeholder={form.kind === "salary" ? "Ad soyad" : "örn. Enerjisa"} maxLength={120} /></Field>
        <Field label={form.kind === "salary" ? "Sicil / IBAN notu" : "Abone / sözleşme no"}><input value={form.subscriber_no || ""} onChange={set("subscriber_no")} maxLength={60} /></Field>
        <Field label={form.variable_amount ? "Tahmini tutar (₺)" : "Tutar (KDV dahil, ₺)"}><input inputMode="decimal" value={form.amount} onChange={set("amount")} placeholder="0,00" aria-label="Tutar" /></Field>
        <label className="toggle"><input type="checkbox" checked={form.variable_amount} onChange={set("variable_amount")} /> Her dönem değişir (fatura gelince girilir)</label>
        <Field label="Tekrar"><select value={form.frequency} onChange={set("frequency")} aria-label="Tekrar sıklığı">{FREQUENCIES.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}</select></Field>
        <Field label="İlk vade / ödeme günü" hint="Sonraki dönemler buna göre hesaplanır."><input type="date" value={form.start_date} onChange={set("start_date")} required aria-label="İlk vade" /></Field>
        <Field label="Bitiş"><Segmented size="sm" value={form.end_mode} onChange={(v) => setForm({ ...form, end_mode: v })} options={[{ value: "none", label: "Süresiz" }, { value: "date", label: "Tarihte" }, { value: "count", label: "Taksitle" }]} /></Field>
        {form.end_mode === "date" && <Field label="Son ödeme tarihi"><input type="date" value={form.end_date} onChange={set("end_date")} aria-label="Bitiş tarihi" /></Field>}
        {form.end_mode === "count" && <Field label="Taksit / tekrar sayısı"><input type="number" min="1" max="600" value={form.total_count} onChange={set("total_count")} aria-label="Taksit sayısı" /></Field>}
        {form.end_mode === "none" && <span />}
        <Field label="Hatırlat (gün önce)" hint="Masaüstü bildirimi bu kadar gün önce gelir."><input type="number" min="0" max="60" value={form.reminder_days} onChange={set("reminder_days")} aria-label="Hatırlatma günü" /></Field>
        <Field label="KDV oranı"><select value={form.vat_rate} onChange={set("vat_rate")}>{VAT_RATES.map((r) => <option key={r} value={r}>%{r}</option>)}</select></Field>
        <Field label="Ödeme yöntemi"><select value={form.method} onChange={set("method")}>{METHODS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}</select></Field>
        <Field label="Ön Muhasebe kategorisi" hint="Boşsa türün adı kullanılır."><input value={form.category || ""} onChange={set("category")} placeholder={form.kind === "salary" ? "Personel" : kind.label} maxLength={60} /></Field>
        <AccountSelectField accounts={accounts} value={form.account_id} onChange={(v) => setForm({ ...form, account_id: v })} className="span2" emptyLabel="Hesap seçme (ödeme yöntemine bağlı hesaba yansır)" hint="Öde dediğinizde kayıt bu hesaba işlenir." />
        <Field label="Not" className="span2"><textarea rows={2} value={form.note || ""} onChange={set("note")} /></Field>
        {past && <label className="toggle span2"><input type="checkbox" checked={form.track_past} onChange={set("track_past")} /> {formatDate(form.start_date)} tarihinden bugüne kadarki dönemleri de takip et (ödenmemişler “gecikti” görünür)</label>}
        {editing && <label className="toggle span2"><input type="checkbox" checked={form.active} onChange={set("active")} /> Aktif (kapatırsanız yeni dönem açılmaz)</label>}
      </form>
    </Modal>
  );
}

function PayDialog({ occurrence: o, item, mode, accounts, onClose, onSaved }) {
  const result = useResult();
  const income = o.type === "income";
  const [form, setForm] = useState({
    status: mode, amount: o.variable_amount ? "" : moneyInput(o.amount), entry_date: mode === "paid" ? isoDay() : o.period, due_date: o.period,
    document_no: "", account_id: item?.account_id ? String(item.account_id) : "", method: item?.method || "bank", note: "",
  });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const vat = splitVat(form.amount, item?.vat_rate || 0);
  const amount = parseAmount(form.amount);

  const save = async (e) => {
    e?.preventDefault();
    if (!(amount > 0)) return;
    setBusy(true);
    const res = await post(`/api/tools/recurring/${o.recurring_id}/post`, {
      period: o.period, amount, status: form.status, entry_date: form.entry_date, due_date: form.status === "pending" ? form.due_date : null,
      document_no: form.document_no, note: form.note, method: form.method, account_id: form.account_id ? Number(form.account_id) : null,
    }, { queue: false });
    setBusy(false);
    if (result(res, form.status === "paid" ? "İşlendi; Ön Muhasebe'ye kaydedildi." : "Ödenecek olarak Ön Muhasebe'ye kaydedildi.")) onSaved(form.status);
  };

  return (
    <Modal title={`${o.name} · ${o.period_label}${o.total_count ? ` (${o.index}/${o.total_count})` : ""}`} onClose={onClose} width={560} footer={<>
      <span className="spacer" />
      <button type="button" className="btn" onClick={onClose}>Vazgeç</button>
      <button type="submit" form="pay-form" className="btn btn--primary" disabled={busy || !(amount > 0)}>{busy ? "İşleniyor…" : form.status === "paid" ? (income ? "Tahsil edildi" : "Ödendi olarak işle") : "Ödenecek olarak kaydet"}</button>
    </>}>
      <form id="pay-form" className="form-grid" onSubmit={save}>
        <div className="span2"><Segmented value={form.status} onChange={(v) => setForm({ ...form, status: v })} options={[{ value: "paid", label: income ? "Tahsil edildi" : "Ödendi" }, { value: "pending", label: income ? "Tahakkuk (tahsil edilecek)" : "Fatura geldi, ödenecek" }]} /></div>
        <Field label="Tutar (KDV dahil, ₺)" hint={vat.gross && item?.vat_rate ? `Matrah ${formatMoney(vat.net)} · KDV %${item.vat_rate} ${formatMoney(vat.vat)}` : o.variable_amount && o.amount ? `Tahmini ${formatMoney(o.amount)}` : ""}>
          <input autoFocus inputMode="decimal" value={form.amount} onChange={set("amount")} placeholder="0,00" aria-label="Tutar" />
        </Field>
        <Field label="Fatura / belge no"><input value={form.document_no} onChange={set("document_no")} maxLength={60} /></Field>
        {form.status === "paid"
          ? <Field label={income ? "Tahsil tarihi" : "Ödeme tarihi"}><input type="date" value={form.entry_date} onChange={set("entry_date")} /></Field>
          : <>
            <Field label="Fatura tarihi"><input type="date" value={form.entry_date} onChange={set("entry_date")} /></Field>
            <Field label="Son ödeme tarihi"><input type="date" value={form.due_date} onChange={set("due_date")} aria-label="Son ödeme tarihi" /></Field>
          </>}
        <Field label="Ödeme yöntemi"><select value={form.method} onChange={set("method")}>{METHODS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}</select></Field>
        <AccountSelectField accounts={accounts} value={form.account_id} onChange={(v) => setForm({ ...form, account_id: v })} className="span2" emptyLabel="Hesap seçme (ödeme yöntemine bağlı hesaba yansır)" />
        <Field label="Not" className="span2"><input value={form.note} onChange={set("note")} maxLength={500} /></Field>
        <p className="muted small span2">Kayıt Ön Muhasebe'ye “{item?.category || kindOf(o.kind).label}” kategorisiyle düşer; oradan düzenleyebilirsiniz. Bu işlem bağlantı ister.</p>
      </form>
    </Modal>
  );
}
