// Ön Muhasebe: gelir-gider defteri, KDV, cari bakiyeler, vade takibi.
// Dönem seçimi, süzgeçler, 12 aylık grafik, kategori dağılımı; CSV, Excel ve
// PDF olarak dışa aktarma.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Empty, ErrorNote, Field, Icon, MenuButton, Modal, OfflineNote, Segmented, Spinner, ViewHeader, useConfirm, useResult } from "../../components/ui";
import { del, patch, post, tempId, useCommand, useResource } from "../../api";
import { METHODS, PERIODS, PRESET_CATEGORIES, STATUS_LABELS_BY_TYPE, TYPE_LABELS, VAT_RATES, filterEntries, isOverdue, parseAmount, periodRange, splitVat, toCsv, totals } from "../../lib/ledgerUtils";
import { formatDate, formatMoney, isoDay } from "../../lib/helpers";
import { workbookToXlsx } from "../../lib/sheets/xlsxExport";
import { addr, createEvaluator } from "../../lib/sheets/sheetEngine";
import { AccountStrip, Kpi } from "./common";
import { AccountSelectField } from "../../components/finance";
import ExportButton from "../../components/ExportButton";
import { ledgerReport } from "../../lib/export/reports";

const methodLabel = (key) => METHODS.find((m) => m.key === key)?.label || key;

export default function Personal({ arg, argSeq, accounts = [], onTransfer, onManageAccounts }) {
  const [period, setPeriod] = useState(() => localStorage.getItem("ledger:period") || "this_month");
  const [custom, setCustom] = useState({ from: "", to: "" });
  const [filters, setFilters] = useState({ type: "", status: "", category: "", query: "", account: "" });
  const [tab, setTab] = useState("entries");
  const [editing, setEditing] = useState(arg === "new" ? { draft: { type: "expense" } } : arg ? { id: arg } : null);
  const searchRef = useRef(null);
  useEffect(() => {
    if (arg === "new") setEditing({ draft: { type: "expense" } });
    else if (arg) setEditing({ id: arg });
  }, [arg, argSeq]);
  const result = useResult();
  const confirm = useConfirm();

  const range = periodRange(period, new Date(), custom);
  const data = useResource("/api/tools/ledger", { from: range.from || undefined, to: range.to || undefined });
  const entries = useMemo(() => data.data?.items || [], [data.data]);
  const shown = useMemo(() => filterEntries(entries, filters), [entries, filters]);
  const sum = data.data?.summary;
  const quick = totals(shown);
  const categories = useMemo(() => [...new Set(entries.map((e) => e.category || "Diğer"))].sort((a, b) => a.localeCompare(b, "tr")), [entries]);
  const editItem = editing?.id ? entries.find((e) => String(e.id) === String(editing.id)) : null;
  const accountNames = useMemo(() => new Map(accounts.map((a) => [String(a.id), a.name])), [accounts]);
  const postable = useMemo(() => accounts.filter((a) => a.can_post), [accounts]);
  const usedAccounts = useMemo(() => [...new Set(entries.map((e) => e.account_id).filter(Boolean).map(String))], [entries]);

  useCommand("new", () => setEditing({ draft: { type: "expense" } }));
  useCommand("find", () => searchRef.current?.focus());
  useCommand("export", () => exportXlsx());
  // ⌘P: yazdırma stüdyosu (ExportButton "ledger", lib/export/exportRegistry) açılır.

  const setPeriodSaved = (v) => { setPeriod(v); try { localStorage.setItem("ledger:period", v); } catch { /* yoksay */ } };
  const periodLabel = PERIODS.find((p) => p.key === period)?.label || "";

  const markPaid = async (entry) => {
    data.setData((d) => ({ ...d, items: d.items.map((e) => (e.id === entry.id ? { ...e, status: "paid" } : e)) }));
    if (result(await patch(`/api/tools/ledger/${entry.id}`, { status: "paid" }), entry.type === "income" ? "Tahsil edildi." : "Ödendi.")) data.reload({ quiet: true });
  };
  const remove = async (entry) => {
    if (!(await confirm({ title: "Kaydı sil", message: `${formatMoney(entry.amount)} tutarındaki kayıt silinsin mi?`, confirmLabel: "Sil", danger: true }))) return;
    if (result(await del(`/api/tools/ledger/${entry.id}`), "Kayıt silindi.")) { setEditing(null); data.reload({ quiet: true }); }
  };

  const exportCsv = async () => {
    const res = await window.elitlig.files.save(`Elitlig-Muhasebe-${range.from || "tumu"}.csv`, toCsv(shown), [{ name: "CSV", extensions: ["csv"] }]);
    if (res.ok) window.elitlig.files.reveal(res.path);
  };
  const exportXlsx = async () => {
    const header = ["Tarih", "Tür", "Kategori", "Cari", "Açıklama", "Tutar", "KDV %", "KDV", "Matrah", "Durum", "Vade", "Ödeme", "Belge no"];
    const cells = {};
    header.forEach((h, c) => { cells[addr(c, 0)] = { v: h, s: { b: true, bg: "#ede9fe" } }; });
    shown.forEach((e, i) => {
      const r = i + 1;
      [e.entry_date, TYPE_LABELS[e.type], e.category || "", e.party || "", e.description || "", String(e.amount), String(e.vat_rate), String(e.vat_amount), String(e.net_amount), STATUS_LABELS_BY_TYPE[e.type]?.[e.status] || e.status, e.due_date || "", methodLabel(e.method), e.document_no || ""]
        .forEach((v, c) => { if (v !== "") cells[addr(c, r)] = { v, ...(c >= 5 && c <= 8 && c !== 6 ? { s: { f: "money" } } : {}) }; });
    });
    const last = shown.length + 1;
    cells[addr(4, last)] = { v: "Toplam (gelir − gider)", s: { b: true } };
    cells[addr(5, last)] = { v: `=ETOPLA(B2:B${last};"Gelir";F2:F${last})-ETOPLA(B2:B${last};"Gider";F2:F${last})`, s: { b: true, f: "money" } };
    const book = { sheets: [{ name: "Kayıtlar", rows: Math.max(10, last + 2), cols: 13, cells, colW: { C: 130, D: 140, E: 220 }, freeze: true }] };
    const bytes = workbookToXlsx(book, createEvaluator(book), { title: `Ön Muhasebe ${periodLabel}` });
    const res = await window.elitlig.files.save(`Elitlig-Muhasebe-${range.from || "tumu"}.xlsx`, bytes, [{ name: "Excel", extensions: ["xlsx"] }]);
    if (res.ok) window.elitlig.files.reveal(res.path);
  };
  const printReport = (pdf) => {
    const html = reportHtml({ entries: shown, summary: sum, quick, title: `Ön Muhasebe — ${periodLabel}${range.from ? ` (${formatDate(range.from)} – ${formatDate(range.to)})` : ""}` });
    if (pdf) window.elitlig.pdf(html, `Elitlig-Muhasebe-${range.from || "tumu"}`);
    else window.elitlig.print(html, "Ön Muhasebe");
  };

  return (
    <div className="acc-section">
      <div className="filters">
        <select className="select-sm" value={period} onChange={(e) => setPeriodSaved(e.target.value)} aria-label="Dönem">{PERIODS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}</select>
        {period === "custom" && <>
          <input type="date" className="select-sm" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} aria-label="Başlangıç" />
          <input type="date" className="select-sm" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} aria-label="Bitiş" />
        </>}
        <span className="spacer" />
        <ExportButton id="ledger" title="Ön Muhasebe"
          scopes={[{ value: "view", label: `Süzülmüş kayıtlar (${shown.length})` }, { value: "all", label: `Dönemin tüm kayıtları (${entries.length})` }]}
          report={({ scope: sc }) => ledgerReport(sc === "all" ? entries : shown, {
            title: `Ön Muhasebe — ${periodLabel}`,
            filters: [range.from ? `${formatDate(range.from)} – ${formatDate(range.to)}` : "", ...(sc === "all" ? [] : [TYPE_LABELS[filters.type], filters.status && STATUS_LABELS_BY_TYPE[filters.type || "expense"]?.[filters.status], filters.category, filters.account && accountNames.get(String(filters.account)), filters.query && `"${filters.query}"`])].filter(Boolean),
            accountName: (e) => accountNames.get(String(e.account_id)) || "",
          })}
          extraItems={[
            { label: "Excel — formüllü klasik tablo", icon: "grid", onClick: exportXlsx },
            { label: "CSV — tüm alanlar (klasik)", icon: "download", onClick: exportCsv },
          ]} />
        <button type="button" className="btn btn--green" onClick={() => setEditing({ draft: { type: "income" } })}><Icon name="plus" /> Gelir</button>
        <button type="button" className="btn btn--red" onClick={() => setEditing({ draft: { type: "expense" } })}><Icon name="plus" /> Gider</button>
      </div>
      <AccountStrip accounts={accounts} scope="personal" onTransfer={onTransfer} onManage={onManageAccounts} />
      <OfflineNote offline={data.offline} savedAt={data.savedAt} />
      <ErrorNote error={data.error && !data.data ? data.error : null} onRetry={data.reload} />

      {sum && (
        <div className="kpis">
          <Kpi hero label="Net" value={formatMoney(sum.net)} hint={`${sum.count} kayıt`} icon="trend" />
          <Kpi label="Gelir" value={formatMoney(sum.income)} tone="green" />
          <Kpi label="Gider" value={formatMoney(sum.expense)} tone="red" />
          <Kpi label="Bekleyen alacak" value={formatMoney(sum.receivable)} tone="amber" />
          <Kpi label="Bekleyen borç" value={formatMoney(sum.payable)} tone="amber" />
          <Kpi label="KDV dengesi" value={formatMoney(sum.vat_balance)} tone="blue" hint={`Tahsil ${formatMoney(sum.vat_collected, 0)} · Ödenen ${formatMoney(sum.vat_paid, 0)}`} />
          {sum.overdue > 0 && <div className="kpi kpi--alert"><span>Vadesi geçen</span><strong>{sum.overdue} kayıt</strong><small>{formatMoney(sum.overdue_amount)}</small></div>}
        </div>
      )}

      <Segmented value={tab} onChange={setTab} size="sm" options={[{ value: "entries", label: "Kayıtlar", count: shown.length }, { value: "due", label: "Vade takibi", icon: "clock", count: entries.filter((e) => e.status === "pending").length }, { value: "trend", label: "Grafik", icon: "trend" }, { value: "parties", label: "Cari", count: sum?.parties?.length }, { value: "categories", label: "Kategoriler" }]} />

      {tab === "entries" && (<>
        <div className="filters">
          <div className="search-box"><Icon name="search" size={14} /><input ref={searchRef} value={filters.query} onChange={(e) => setFilters({ ...filters, query: e.target.value })} placeholder="Açıklama, cari, belge no…" /></div>
          <select className="select-sm" value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })}><option value="">Tüm türler</option><option value="income">Gelir</option><option value="expense">Gider</option></select>
          <select className="select-sm" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}><option value="">Tüm durumlar</option><option value="paid">Ödendi / tahsil edildi</option><option value="pending">Bekleyen</option><option value="overdue">Vadesi geçen</option></select>
          <select className="select-sm" value={filters.category} onChange={(e) => setFilters({ ...filters, category: e.target.value })}><option value="">Tüm kategoriler</option>{categories.map((c) => <option key={c} value={c}>{c}</option>)}</select>
          {(postable.length > 0 || usedAccounts.length > 0) && (
            <select className="select-sm" value={filters.account} onChange={(e) => setFilters({ ...filters, account: e.target.value })} aria-label="Hesap">
              <option value="">Tüm hesaplar</option>
              <option value="none">Hesap seçilmemiş</option>
              {[...new Set([...postable.map((a) => String(a.id)), ...usedAccounts])].map((id) => <option key={id} value={id}>{accountNames.get(id) || `Hesap #${id}`}</option>)}
            </select>
          )}
        </div>
        {data.loading && !data.data ? <Spinner /> : shown.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Tarih</th><th>Açıklama</th><th>Kategori</th><th>Cari</th><th>Durum</th><th className="num">KDV</th><th className="num">Tutar</th><th /></tr></thead>
              <tbody>
                {shown.map((e) => (
                  <tr key={e.id} onDoubleClick={() => setEditing({ id: e.id })} className={isOverdue(e) ? "is-overdue" : ""}>
                    <td>{formatDate(e.entry_date)}</td>
                    <td><strong>{e.description || "—"}</strong>{e.document_no && <small className="muted"> · {e.document_no}</small>}{e.account_id && <span className="pill pill--xs pill--tool ledger-account" title="Bu kayıt hesaba işlenir"><Icon name="bank" size={10} /> {accountNames.get(String(e.account_id)) || `Hesap #${e.account_id}`}</span>}</td>
                    <td>{e.category || "Diğer"}</td>
                    <td>{e.party || ""}</td>
                    <td>
                      <span className={`pill ${e.status === "paid" ? "pill--green" : isOverdue(e) ? "pill--red" : "pill--amber"}`}>{STATUS_LABELS_BY_TYPE[e.type]?.[e.status]}</span>
                      {e.status === "pending" && e.due_date && <small className="muted"> vade {formatDate(e.due_date)}</small>}
                    </td>
                    <td className="num muted">{e.vat_rate ? `%${e.vat_rate}` : ""}</td>
                    <td className={`num ${e.type === "income" ? "text-green" : "text-red"}`}>{e.type === "income" ? "+" : "−"}{formatMoney(e.amount)}</td>
                    <td className="row-actions">
                      {e.status === "pending" && <button type="button" className="btn btn--xs" onClick={() => markPaid(e)}>{e.type === "income" ? "Tahsil et" : "Öde"}</button>}
                      <MenuButton items={[
                        { label: "Düzenle", icon: "sliders", onClick: () => setEditing({ id: e.id }) },
                        { label: "Kopyala (yeni kayıt)", icon: "copy", onClick: () => setEditing({ draft: { ...e, id: undefined, entry_date: isoDay() } }) },
                        { label: "Sil", icon: "trash", danger: true, onClick: () => remove(e) },
                      ]} />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><td colSpan={5}>{quick.count} kayıt · Gelir {formatMoney(quick.income)} · Gider {formatMoney(quick.expense)}</td><td /><td className={`num ${quick.net >= 0 ? "text-green" : "text-red"}`}>{formatMoney(quick.net)}</td><td /></tr></tfoot>
            </table>
          </div>
        ) : <Empty icon="receipt" title="Bu dönemde kayıt yok" text="Gelir ya da gider ekleyin; ⌃⌥N ile her yerden gider yazabilirsiniz." />}
      </>)}

      {tab === "due" && <DueTab entries={entries} onPaid={markPaid} onEdit={(e) => setEditing({ id: e.id })} />}
      {tab === "trend" && <TrendChart trend={data.data?.trend || []} />}

      {tab === "parties" && (sum?.parties?.length ? (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Cari</th><th className="num">Gelir</th><th className="num">Gider</th><th className="num">Alacak</th><th className="num">Borç</th><th className="num">Bakiye</th></tr></thead>
            <tbody>{sum.parties.map((p) => (
              <tr key={p.name} onClick={() => { setFilters({ ...filters, query: p.name }); setTab("entries"); }} className="is-clickable">
                <td><strong>{p.name}</strong> <small className="muted">{p.count} kayıt</small></td>
                <td className="num">{formatMoney(p.income)}</td><td className="num">{formatMoney(p.expense)}</td>
                <td className="num">{formatMoney(p.receivable)}</td><td className="num">{formatMoney(p.payable)}</td>
                <td className={`num ${p.balance >= 0 ? "text-green" : "text-red"}`}><strong>{formatMoney(p.balance)}</strong></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ) : <Empty icon="users" title="Cari yok" text="Kayıtlara cari adı girdiğinizde bakiyeler burada toplanır." />)}

      {tab === "categories" && <CategoryBars categories={sum?.categories || []} />}

      {editing && (editing.draft || editItem) && (
        <EntryEditor entry={editItem} draft={editing.draft} categories={categories} accounts={postable}
          onClose={() => setEditing(null)} onDelete={remove}
          onSaved={() => { setEditing(null); data.reload({ quiet: true }); }} />
      )}
    </div>
  );
}

function DueTab({ entries, onPaid, onEdit }) {
  const pending = entries.filter((e) => e.status === "pending").sort((a, b) => String(a.due_date || "9999").localeCompare(String(b.due_date || "9999")));
  if (!pending.length) return <Empty icon="check" title="Bekleyen ödeme ya da tahsilat yok" />;
  const today = isoDay();
  const groups = [["Vadesi geçen", pending.filter((e) => e.due_date && e.due_date < today)], ["Bu hafta", pending.filter((e) => e.due_date && e.due_date >= today && e.due_date <= isoDay(new Date(Date.now() + 7 * 86400000)))], ["Daha sonra", pending.filter((e) => e.due_date && e.due_date > isoDay(new Date(Date.now() + 7 * 86400000)))], ["Vadesiz", pending.filter((e) => !e.due_date)]];
  return (
    <div className="due-columns">
      {groups.map(([label, list]) => (
        <section key={label} className={`card due-col ${label === "Vadesi geçen" && list.length ? "due-col--alert" : ""}`}>
          <h3 className="card__title">{label} <span className="pill">{list.length}</span></h3>
          {list.map((e) => (
            <div key={e.id} className="due-item">
              <button type="button" onClick={() => onEdit(e)}><strong>{e.description || e.party || e.category || "Kayıt"}</strong><small>{e.party ? `${e.party} · ` : ""}{e.due_date ? `vade ${formatDate(e.due_date)}` : "vadesiz"}</small></button>
              <strong className={e.type === "income" ? "text-green" : "text-red"}>{formatMoney(e.amount, 0)}</strong>
              <button type="button" className="btn btn--xs btn--soft" onClick={() => onPaid(e)}>{e.type === "income" ? "Tahsil et" : "Öde"}</button>
            </div>
          ))}
          {!list.length && <p className="muted small">Yok.</p>}
        </section>
      ))}
    </div>
  );
}

function TrendChart({ trend }) {
  if (!trend.length) return <Empty icon="trend" title="Grafik için veri yok" />;
  const max = Math.max(1, ...trend.flatMap((t) => [t.income, t.expense]));
  const W = 900; const H = 260; const pad = 30;
  const bw = (W - pad * 2) / trend.length;
  return (
    <div className="card chart-card">
      <h3 className="card__title">Son 12 ay (gerçekleşen)</h3>
      <svg viewBox={`0 0 ${W} ${H + 40}`} className="chart" role="img" aria-label="Aylık gelir ve gider">
        {[0.25, 0.5, 0.75, 1].map((f) => <line key={f} x1={pad} x2={W - pad} y1={H - f * (H - 20)} y2={H - f * (H - 20)} className="chart__grid" />)}
        {trend.map((t, i) => {
          const x = pad + i * bw;
          const hi = (t.income / max) * (H - 20);
          const he = (t.expense / max) * (H - 20);
          const label = new Date(`${t.month}-01T12:00:00`).toLocaleDateString("tr-TR", { month: "short" });
          return (
            <g key={t.month}>
              <rect x={x + bw * 0.14} y={H - hi} width={bw * 0.34} height={hi} rx="4" fill="#10b981"><title>{`${label}: gelir ${formatMoney(t.income)}`}</title></rect>
              <rect x={x + bw * 0.52} y={H - he} width={bw * 0.34} height={he} rx="4" fill="#e11d48"><title>{`${label}: gider ${formatMoney(t.expense)}`}</title></rect>
              <text x={x + bw / 2} y={H + 18} textAnchor="middle" className="chart__label">{label}</text>
              <text x={x + bw / 2} y={H + 34} textAnchor="middle" className={`chart__net ${t.net >= 0 ? "is-pos" : "is-neg"}`}>{t.net ? `${t.net > 0 ? "+" : ""}${Math.round(t.net / 1000)}b` : ""}</text>
            </g>
          );
        })}
      </svg>
      <div className="legend"><span><i style={{ background: "#10b981" }} /> Gelir</span><span><i style={{ background: "#e11d48" }} /> Gider</span><span className="muted">Alttaki sayı: aylık net (bin ₺)</span></div>
    </div>
  );
}

function CategoryBars({ categories }) {
  if (!categories.length) return <Empty icon="tag" title="Kategori yok" />;
  return (
    <div className="cat-columns">
      {["income", "expense"].map((type) => {
        const list = categories.filter((c) => c.type === type);
        const total = list.reduce((s, c) => s + c.total, 0) || 1;
        return (
          <section key={type} className="card">
            <h3 className="card__title">{type === "income" ? "Gelir" : "Gider"} kategorileri</h3>
            {list.map((c) => (
              <div key={c.name} className="cat-bar">
                <span>{c.name} <small className="muted">{c.count}</small></span>
                <strong>{formatMoney(c.total, 0)}</strong>
                <div className="cat-bar__track"><span className={type === "income" ? "bg-green" : "bg-red"} style={{ width: `${(c.total / total) * 100}%` }} /></div>
              </div>
            ))}
            {!list.length && <p className="muted">Kayıt yok.</p>}
          </section>
        );
      })}
    </div>
  );
}

function EntryEditor({ entry, draft, categories, accounts = [], onClose, onSaved, onDelete }) {
  const result = useResult();
  const src = entry || draft || {};
  const [form, setForm] = useState({
    type: src.type || "expense",
    amount: src.amount != null ? String(src.amount).replace(".", ",") : "",
    vat_rate: String(src.vat_rate ?? 0),
    category: src.category || "",
    party: src.party || "",
    description: src.description || "",
    entry_date: src.entry_date || isoDay(),
    due_date: src.due_date || "",
    status: src.status || "paid",
    method: src.method || "cash",
    document_no: src.document_no || "",
    note: src.note || "",
    account_id: src.account_id ? String(src.account_id) : "",
  });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const account = accounts.find((a) => String(a.id) === form.account_id);
  const vat = splitVat(form.amount, form.vat_rate);
  const presets = [...new Set([...PRESET_CATEGORIES[form.type], ...categories])];

  const save = async (e) => {
    e?.preventDefault();
    const amount = parseAmount(form.amount);
    if (!(amount > 0)) return;
    setBusy(true);
    const body = { ...form, amount, vat_rate: Number(form.vat_rate) || 0, due_date: form.due_date || null, account_id: form.account_id ? Number(form.account_id) : null };
    const res = entry ? await patch(`/api/tools/ledger/${entry.id}`, body) : await post("/api/tools/ledger", body, { tempId: tempId() });
    setBusy(false);
    if (result(res, entry ? "Kayıt güncellendi." : "Kayıt eklendi.")) onSaved();
  };

  return (
    <Modal title={entry ? "Kaydı düzenle" : form.type === "income" ? "Yeni gelir" : "Yeni gider"} onClose={onClose} width={620} footer={<>
      {entry && <button type="button" className="btn btn--danger-ghost" onClick={() => onDelete(entry)}><Icon name="trash" /> Sil</button>}
      <span className="spacer" />
      <button type="button" className="btn" onClick={onClose}>Vazgeç</button>
      <button type="submit" form="ledger-form" className="btn btn--primary" disabled={busy || !(parseAmount(form.amount) > 0)}>{busy ? "Kaydediliyor…" : "Kaydet"}</button>
    </>}>
      <form id="ledger-form" className="form-grid" onSubmit={save}>
        <div className="span2"><Segmented value={form.type} onChange={(v) => setForm({ ...form, type: v })} options={[{ value: "income", label: "Gelir" }, { value: "expense", label: "Gider" }]} /></div>
        <Field label="Tutar (KDV dahil, ₺)"><input autoFocus inputMode="decimal" value={form.amount} onChange={set("amount")} placeholder="0,00" /></Field>
        <Field label="KDV oranı" hint={vat.gross ? `Matrah ${formatMoney(vat.net)} · KDV ${formatMoney(vat.vat)}` : ""}>
          <select value={form.vat_rate} onChange={set("vat_rate")}>{VAT_RATES.map((r) => <option key={r} value={r}>%{r}</option>)}</select>
        </Field>
        <Field label="Kategori">
          <input list="ledger-cats" value={form.category} onChange={set("category")} placeholder="Seçin ya da yazın" />
          <datalist id="ledger-cats">{presets.map((c) => <option key={c} value={c} />)}</datalist>
        </Field>
        <Field label="Cari (kişi / kurum)"><input value={form.party} onChange={set("party")} placeholder="örn. Yıldız Halı Saha" /></Field>
        <Field label="Açıklama" className="span2"><input value={form.description} onChange={set("description")} /></Field>
        <Field label="İşlem tarihi"><input type="date" value={form.entry_date} onChange={set("entry_date")} /></Field>
        <Field label="Durum"><select value={form.status} onChange={set("status")}>{Object.entries(STATUS_LABELS_BY_TYPE[form.type]).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        <Field label="Vade tarihi"><input type="date" value={form.due_date} onChange={set("due_date")} /></Field>
        <Field label="Ödeme yöntemi"><select value={form.method} onChange={set("method")}>{METHODS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}</select></Field>
        <AccountSelectField accounts={accounts} value={form.account_id} onChange={(v) => setForm({ ...form, account_id: v })} className="span2"
          emptyLabel="Hesap seçme (ödeme yöntemine bağlı hesaba yansır)"
          hint={account ? `Ödendi olduğunda yalnız “${account.name}” bakiyesine ${form.type === "income" ? "eklenir" : "düşer"}; ödeme yöntemine bağlı hesapta ikinci kez sayılmaz.` : "Hesap seçmezseniz kayıt, ödeme yöntemine bağlı kişisel hesaba (varsa) yansır."} />
        <Field label="Belge no"><input value={form.document_no} onChange={set("document_no")} placeholder="Fatura / makbuz" /></Field>
        <span />
        <Field label="Not" className="span2"><textarea rows={2} value={form.note} onChange={set("note")} /></Field>
      </form>
    </Modal>
  );
}

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
function reportHtml({ entries, summary, quick, title }) {
  const rows = entries.map((e) => `<tr><td>${esc(formatDate(e.entry_date))}</td><td>${esc(e.description || "")}</td><td>${esc(e.category || "")}</td><td>${esc(e.party || "")}</td><td>${esc(STATUS_LABELS_BY_TYPE[e.type]?.[e.status])}</td><td class="n ${e.type}">${e.type === "income" ? "+" : "−"}${esc(formatMoney(e.amount))}</td></tr>`).join("");
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${esc(title)}</title><style>
    body{font:11px -apple-system,Helvetica,Arial,sans-serif;color:#111;margin:24px}h1{font-size:18px;margin:0 0 4px}p{color:#555;margin:0 0 14px}
    .k{display:flex;gap:18px;margin:10px 0 16px}.k div{border:1px solid #ddd;border-radius:6px;padding:8px 12px}.k b{display:block;font-size:14px}
    table{width:100%;border-collapse:collapse}th,td{padding:5px 6px;border-bottom:1px solid #e5e5e5;text-align:left}th{background:#f3f0fb}
    .n{text-align:right;white-space:nowrap}.income{color:#047857}.expense{color:#b91c1c}tfoot td{font-weight:bold}
  </style></head><body><h1>${esc(title)}</h1><p>Elitlig Araçlar · ${esc(new Date().toLocaleString("tr-TR"))}</p>
  ${summary ? `<div class="k"><div>Gelir<b>${esc(formatMoney(summary.income))}</b></div><div>Gider<b>${esc(formatMoney(summary.expense))}</b></div><div>Net<b>${esc(formatMoney(summary.net))}</b></div><div>Alacak<b>${esc(formatMoney(summary.receivable))}</b></div><div>Borç<b>${esc(formatMoney(summary.payable))}</b></div><div>KDV dengesi<b>${esc(formatMoney(summary.vat_balance))}</b></div></div>` : ""}
  <table><thead><tr><th>Tarih</th><th>Açıklama</th><th>Kategori</th><th>Cari</th><th>Durum</th><th class="n">Tutar</th></tr></thead><tbody>${rows}</tbody>
  <tfoot><tr><td colspan="5">${quick.count} kayıt</td><td class="n">${esc(formatMoney(quick.net))}</td></tr></tfoot></table></body></html>`;
}
