// Türkiye Geneli Muhasebe: /api/admin/national-accounting
// İllerden alınacak maç başı ücretler (tahakkuk), tahsilatlar, ek kalemler,
// tutar düzeltmeleri ve tarifeler.
import React, { useMemo, useState } from "react";
import { Empty, ErrorNote, Field, Icon, MenuButton, Modal, Segmented, Spinner, useConfirm, useResult } from "../../components/ui";
import { request, useResource } from "../../api";
import { formatDate, includesTr, isoDay } from "../../lib/helpers";
import { parseAmount } from "../../lib/ledgerUtils";
import { toCsvText } from "../../lib/sheets/sheetEngine";
import { AccountStrip, FlowChart, Kpi, MONTH_PRESETS, PeriodPicker, money, monthRange } from "./common";

const BASE = "/api/admin/national-accounting";

export default function National({ accounts, onTransfer, onManageAccounts }) {
  const result = useResult();
  const [period, setPeriod] = useState({ preset: "this_year" });
  const [tab, setTab] = useState("cities");
  const [city, setCity] = useState(null);
  const [entry, setEntry] = useState(null);
  const [rate, setRate] = useState(null);
  const range = period.preset === "custom" ? { from: period.from, to: period.to } : monthRange(period.preset);
  const options = useResource(`${BASE}/options`);
  const st = useResource(`${BASE}/statement`, { from: range.from, to: range.to }, { enabled: !options.error });
  const rates = useResource(`${BASE}/rates`, undefined, { enabled: !options.error });
  const reload = () => { st.reload({ quiet: true }); rates.reload({ quiet: true }); };
  const call = async (method, path, body, msg) => {
    const res = await request({ method, path: `${BASE}${path}`, body, queue: false });
    const ok = result(res, msg || res.data?.message);
    if (ok) reload();
    return ok;
  };

  if (options.error?.status === 403) return <Empty icon="lock" title="Türkiye geneli muhasebeye erişiminiz yok" text={options.error.message} />;
  if (options.error && !options.data) return <ErrorNote error={options.error} onRetry={options.reload} />;
  const s = st.data;
  const t = s?.totals;
  const openCity = city && s ? s.cities.find((c) => c.cityId === city) : null;

  return (
    <div className="acc-section">
      <div className="filters">
        <PeriodPicker presets={MONTH_PRESETS} type="month" value={{ ...period, ...range }} onChange={setPeriod} />
        <span className="spacer" />
        <button type="button" className="btn btn--green" onClick={() => setEntry({ kind: "payment" })}><Icon name="plus" /> Tahsilat</button>
        <button type="button" className="btn btn--soft" onClick={() => setEntry({ kind: "charge" })}><Icon name="plus" /> Ek kalem</button>
        <MenuButton icon="download" label="Dışa aktar" items={[
          { label: "İller (CSV)", onClick: () => exportCsv("Iller", ["İl", "Devreden", "Maç", "Tahakkuk", "Tahsilat", "Bakiye"], (s?.cities || []).map((c) => [c.name, c.opening, c.matchCount, c.due, c.paid, c.balance])) },
          { label: "Sezon satırları (CSV)", onClick: () => exportCsv("Sezon-satirlari", ["İl", "Ay", "Sezon", "Maç", "Ücret", "Tutar"], (s?.cities || []).flatMap((c) => c.lines.map((l) => [c.name, l.period, l.seasonName || "", l.matchCount, l.fee, l.amount]))) },
        ]} />
      </div>
      <AccountStrip accounts={accounts} scope="national" onTransfer={onTransfer} onManage={onManageAccounts} />
      {s?.unassignedMatches > 0 && <div className="notice notice--warn"><Icon name="flag" size={14} /> İli belirlenemeyen {s.unassignedMatches} maç ücretlendirilmedi.</div>}
      {rates.data && !rates.data.items?.length && <div className="notice notice--warn"><Icon name="flag" size={14} /> Maç başı ücret tanımlı değil; “Ücretler” sekmesinden genel tarife ekleyin.</div>}
      {t && (
        <div className="kpis">
          <Kpi hero label="Toplam alacak" value={money(t.balance)} hint={`${t.debtorCount} il borçlu`} icon="globe" />
          <Kpi label="Dönem tahakkuku" value={money(t.due)} tone="blue" hint={t.adjustment ? `Düzeltme ${money(t.adjustment, 0)}` : `${t.cityCount} il`} />
          <Kpi label="Dönem tahsilatı" value={money(t.paid)} tone="green" />
          <Kpi label="Oynanan maç" value={t.matchCount} tone="amber" hint={s.defaultRate ? `Genel ücret ${money(s.defaultRate.fee, 0)} / maç` : null} />
          <Kpi label="Devreden" value={money(t.opening)} />
        </div>
      )}
      <Segmented value={tab} onChange={setTab} size="sm" options={[{ value: "cities", label: "İller", icon: "map" }, { value: "matrix", label: "Aylık tablo", icon: "grid" }, { value: "chart", label: "Grafik", icon: "trend" }, { value: "payments", label: "Tahsilatlar", icon: "wallet", count: s?.payments?.length }, { value: "rates", label: "Ücretler", icon: "percent" }]} />
      {st.loading && !s ? <Spinner /> : st.error && !s ? <ErrorNote error={st.error} onRetry={st.reload} /> : !s ? null : (
        <>
          {tab === "cities" && <CitiesTab s={s} onOpen={setCity} onPay={(c) => setEntry({ kind: "payment", cityId: c.cityId })} />}
          {tab === "matrix" && <MatrixTab s={s} />}
          {tab === "chart" && <section className="card"><FlowChart rows={s.monthly.map((m) => ({ key: m.period, label: m.label.slice(0, 3), income: m.paid, expense: m.due, net: m.paid - m.due }))} /><div className="legend"><span><i style={{ background: "#10b981" }} />Tahsilat</span><span><i style={{ background: "#e11d48" }} />Tahakkuk</span></div></section>}
          {tab === "payments" && <PaymentsTab s={s} onEdit={setEntry} />}
          {tab === "rates" && <RatesTab rates={rates.data?.items || []} onEdit={setRate} call={call} />}
        </>
      )}
      {openCity && <CityDialog city={openCity} onClose={() => setCity(null)} onEntry={setEntry} />}
      {entry && <EntryDialog entry={entry} options={options.data} onClose={() => setEntry(null)} call={call} />}
      {rate && <RateDialog rate={rate} options={options.data} onClose={() => setRate(null)} call={call} />}
    </div>
  );
}

const exportCsv = (name, header, rows) => window.elitlig.files.save(`Elitlig-Turkiye-${name}.csv`, toCsvText([header, ...rows.map((r) => r.map((v) => (typeof v === "number" ? String(v).replace(".", ",") : String(v ?? ""))))]), [{ name: "CSV", extensions: ["csv"] }]).then((r) => r.ok && window.elitlig.files.reveal(r.path));

function CitiesTab({ s, onOpen, onPay }) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("balance");
  const list = useMemo(() => s.cities.filter((c) => includesTr(c.name, q)).sort((a, b) => (sort === "name" ? a.name.localeCompare(b.name, "tr") : b[sort] - a[sort])), [s, q, sort]);
  return (
    <>
      <div className="filters">
        <div className="search-box"><Icon name="search" size={14} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="İl ara" /></div>
        <select className="select-sm" value={sort} onChange={(e) => setSort(e.target.value)}><option value="balance">Bakiyeye göre</option><option value="due">Tahakkuka göre</option><option value="matchCount">Maç sayısına göre</option><option value="name">Ada göre</option></select>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>İl</th><th className="num">Devreden</th><th className="num">Maç</th><th className="num">Tahakkuk</th><th className="num">Tahsilat</th><th className="num">Bakiye</th><th>Son ödeme</th><th /></tr></thead>
          <tbody>{list.map((c) => (
            <tr key={c.cityId} className="is-clickable" onClick={() => onOpen(c.cityId)}>
              <td><strong>{c.name}</strong></td>
              <td className="num">{money(c.opening, 0)}</td><td className="num">{c.matchCount}</td><td className="num">{money(c.due, 0)}</td>
              <td className="num text-green">{money(c.paid, 0)}</td>
              <td className={`num ${c.balance > 0 ? "text-red" : "text-green"}`}><strong>{money(c.balance)}</strong></td>
              <td>{c.lastPayment ? `${formatDate(c.lastPayment.date)} · ${money(c.lastPayment.amount, 0)}` : <span className="muted">—</span>}</td>
              <td className="row-actions" onClick={(e) => e.stopPropagation()}><button type="button" className="btn btn--xs btn--green" onClick={() => onPay(c)}>Tahsilat</button></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </>
  );
}

function MatrixTab({ s }) {
  const [metric, setMetric] = useState("due");
  const max = Math.max(1, ...s.cities.flatMap((c) => c.months.map((m) => Math.abs(m[metric] || 0))));
  const fmt = (v) => (metric === "matchCount" ? v : money(v, 0));
  return (
    <>
      <Segmented value={metric} onChange={setMetric} size="sm" options={[{ value: "matchCount", label: "Maç" }, { value: "due", label: "Tahakkuk" }, { value: "paid", label: "Tahsilat" }, { value: "balance", label: "Bakiye" }]} />
      <div className="table-wrap">
        <table className="table heat">
          <thead><tr><th>İl</th>{s.months.map((m) => <th key={m.period} className="num">{m.label}</th>)}</tr></thead>
          <tbody>{s.cities.map((c) => (
            <tr key={c.cityId}><td><strong>{c.name}</strong></td>{c.months.map((m) => {
              const v = m[metric] || 0;
              return <td key={m.period} className="num" style={{ background: v ? `color-mix(in srgb, var(--tool) ${Math.round((Math.abs(v) / max) * 40)}%, transparent)` : undefined }}>{v ? fmt(v) : <span className="muted">·</span>}</td>;
            })}</tr>
          ))}</tbody>
        </table>
      </div>
    </>
  );
}

function PaymentsTab({ s, onEdit }) {
  if (!s.payments.length) return <Empty icon="wallet" title="Bu dönemde tahsilat yok" />;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead><tr><th>Tarih</th><th>İl</th><th>Açıklama</th><th>Yöntem</th><th className="num">Tutar</th><th /></tr></thead>
        <tbody>{s.payments.map((p) => (
          <tr key={p.id}><td>{formatDate(p.date)}</td><td><strong>{p.cityName}</strong></td><td>{p.title || "—"}{p.note && <small className="muted"> · {p.note}</small>}</td><td>{p.paymentMethod || "—"}</td>
            <td className="num text-green"><strong>{money(p.amount)}</strong></td><td className="row-actions"><button type="button" className="btn btn--xs" onClick={() => onEdit(p)}>Düzenle</button></td></tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function RatesTab({ rates, onEdit }) {
  return (
    <>
      <div className="filters"><button type="button" className="btn btn--primary btn--sm" onClick={() => onEdit({})}><Icon name="plus" /> Ücret tarifesi</button><span className="muted small">En özel tarife geçerlidir: il + sezon &gt; il &gt; genel; aynı kapsamda en yeni “geçerlilik” ayı.</span></div>
      {rates.length ? (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Kapsam</th><th>İl</th><th>Sezon</th><th>Geçerlilik</th><th className="num">Maç başı</th><th>Not</th><th /></tr></thead>
            <tbody>{rates.map((r) => (
              <tr key={r.id}><td><span className="pill pill--tool">{r.scope === "general" ? "Genel" : r.scope === "city" ? "İl" : "Sezon"}</span></td><td>{r.cityName || "—"}</td><td>{r.seasonName ? `${r.leagueName || ""} ${r.seasonName}` : "—"}</td><td>{r.validFrom || "Her zaman"}</td>
                <td className="num"><strong>{money(r.fee)}</strong></td><td className="muted">{r.note || ""}</td><td className="row-actions"><button type="button" className="btn btn--xs" onClick={() => onEdit(r)}>Düzenle</button></td></tr>
            ))}</tbody>
          </table>
        </div>
      ) : <Empty icon="percent" title="Tarife yok" />}
    </>
  );
}

function CityDialog({ city, onClose, onEntry }) {
  const [open, setOpen] = useState(null);
  return (
    <Modal title={`${city.name} hesabı`} onClose={onClose} width={900} className="modal--wide" footer={<>
      <button type="button" className="btn btn--soft" onClick={() => onEntry({ kind: "charge", cityId: city.cityId })}><Icon name="plus" /> Ek kalem</button>
      <button type="button" className="btn btn--green" onClick={() => onEntry({ kind: "payment", cityId: city.cityId })}><Icon name="plus" /> Tahsilat</button>
    </>}>
      <div className="kpis">
        <Kpi label="Devreden" value={money(city.opening)} />
        <Kpi label="Tahakkuk" value={money(city.due)} tone="blue" hint={`${city.matchCount} maç`} />
        <Kpi label="Tahsilat" value={money(city.paid)} tone="green" />
        <Kpi hero label="Bakiye" value={money(city.balance)} />
      </div>
      <div className="table-wrap" style={{ boxShadow: "none" }}>
        <table className="table">
          <thead><tr><th>Ay</th><th className="num">Maç</th><th className="num">Hesaplanan</th><th className="num">Düzeltme</th><th className="num">Tahakkuk</th><th className="num">Tahsilat</th><th className="num">Bakiye</th></tr></thead>
          <tbody>{city.months.map((m) => (
            <React.Fragment key={m.period}>
              <tr className="is-clickable" onClick={() => setOpen(open === m.period ? null : m.period)}>
                <td><Icon name={open === m.period ? "chevronDown" : "chevronRight"} size={12} /> <strong>{m.label}</strong></td>
                <td className="num">{m.matchCount}</td><td className="num">{money(m.calculated, 0)}</td><td className="num">{m.adjustment ? money(m.adjustment, 0) : ""}</td>
                <td className="num">{money(m.due, 0)}</td><td className="num text-green">{m.paid ? money(m.paid, 0) : ""}</td><td className="num"><strong>{money(m.balance, 0)}</strong></td>
              </tr>
              {open === m.period && city.lines.filter((l) => l.period === m.period).map((l) => (
                <tr key={`${l.period}-${l.seasonId}`} className="subrow">
                  <td>{l.leagueName} · {l.seasonName || "Sezonsuz"}</td><td className="num">{l.matchCount}</td><td className="num">{l.matchCount} × {money(l.fee, 0)}</td>
                  <td className="num">{l.override ? <span className="pill pill--amber">{money(l.override.amount, 0)}</span> : ""}</td>
                  <td className="num">{money(l.amount, 0)}</td>
                  <td colSpan={2} className="row-actions"><button type="button" className="btn btn--xs" onClick={() => onEntry(l.override ? { ...l.override, kind: "override", cityId: city.cityId, period: l.period, seasonId: l.seasonId } : { kind: "override", cityId: city.cityId, period: l.period, seasonId: l.seasonId, amount: l.calculated })}>Tutarı düzelt</button></td>
                </tr>
              ))}
              {open === m.period && city.charges.filter((c) => c.period === m.period).map((c) => (
                <tr key={`c${c.id}`} className="subrow"><td colSpan={4}><span className="pill">Ek kalem</span> {c.title}</td><td className="num">{money(c.amount, 0)}</td><td colSpan={2} className="row-actions"><button type="button" className="btn btn--xs" onClick={() => onEntry(c)}>Düzenle</button></td></tr>
              ))}
            </React.Fragment>
          ))}</tbody>
        </table>
      </div>
      {city.payments.length > 0 && <>
        <h4 className="section-title">Tahsilatlar</h4>
        {city.payments.map((p) => <div key={p.id} className="extra-row"><span className="dot-label is-in" /><strong>{formatDate(p.date)}</strong><span className="muted">{p.title || p.paymentMethod || ""}</span><span className="spacer" /><strong className="text-green">{money(p.amount)}</strong><button type="button" className="icon-btn" onClick={() => onEntry(p)}><Icon name="sliders" /></button></div>)}
      </>}
    </Modal>
  );
}

function EntryDialog({ entry, options, onClose, call }) {
  const confirm = useConfirm();
  const kind = entry.kind;
  const [form, setForm] = useState({
    cityId: String(entry.cityId || options?.cities?.[0]?.id || ""),
    date: entry.date || isoDay(),
    period: entry.period || isoDay().slice(0, 7),
    seasonId: entry.seasonId ? String(entry.seasonId) : "",
    amount: entry.amount != null ? String(entry.amount).replace(".", ",") : "",
    paymentMethod: entry.paymentMethod || "havale",
    title: entry.title || "",
    note: entry.note || "",
  });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const editing = Boolean(entry.id);
  const titles = { payment: "Tahsilat", charge: "Ek kalem (eksi tutar indirim)", override: "Tutar düzeltme" };
  const submit = async (e) => {
    e?.preventDefault();
    const amount = parseAmount(form.amount);
    if (!Number.isFinite(amount)) return;
    const body = kind === "payment"
      ? { kind, cityId: Number(form.cityId), date: form.date, amount, paymentMethod: form.paymentMethod || null, title: form.title || null, note: form.note || null }
      : { kind, cityId: Number(form.cityId), period: form.period, seasonId: form.seasonId ? Number(form.seasonId) : null, amount, title: form.title || (kind === "override" ? null : ""), note: form.note || null, ...(kind === "charge" ? { date: form.date } : {}) };
    if (await call(editing ? "PUT" : "POST", editing ? `/entries/${entry.id}` : "/entries", body)) onClose();
  };
  return (
    <Modal title={`${editing ? "Düzenle: " : ""}${titles[kind]}`} onClose={onClose} width={560} footer={<>
      {editing && <button type="button" className="btn btn--danger-ghost" onClick={async () => { if (await confirm({ title: "Kaydı sil", message: "Bu kayıt silinsin mi?", danger: true, confirmLabel: "Sil" }) && await call("DELETE", `/entries/${entry.id}`)) onClose(); }}><Icon name="trash" /> Sil</button>}
      <span className="spacer" />
      <button type="button" className="btn" onClick={onClose}>Vazgeç</button>
      <button type="submit" form="nat-entry" className="btn btn--primary">Kaydet</button>
    </>}>
      <form id="nat-entry" className="form-grid" onSubmit={submit}>
        <Field label="İl"><select value={form.cityId} onChange={set("cityId")}>{(options?.cities || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        {kind === "payment" ? <Field label="Tarih"><input type="date" value={form.date} onChange={set("date")} /></Field> : <Field label="Ay"><input type="month" value={form.period} onChange={set("period")} /></Field>}
        <Field label={kind === "override" ? "Yeni tutar" : "Tutar"}><input className="money-input" autoFocus inputMode="decimal" value={form.amount} onChange={set("amount")} /></Field>
        {kind === "payment" ? (
          <Field label="Yöntem"><select value={form.paymentMethod} onChange={set("paymentMethod")}>{(options?.paymentMethods || []).map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}</select></Field>
        ) : (
          <Field label="Sezon"><select value={form.seasonId} onChange={set("seasonId")}><option value="">—</option>{(options?.seasons || []).filter((x) => !form.cityId || !x.cityId || String(x.cityId) === form.cityId).map((x) => <option key={x.id} value={x.id}>{x.leagueName} · {x.name}</option>)}</select></Field>
        )}
        <Field label={kind === "charge" ? "Başlık (zorunlu)" : "Başlık"} className="span2"><input value={form.title} onChange={set("title")} /></Field>
        <Field label="Not" className="span2"><input value={form.note} onChange={set("note")} /></Field>
      </form>
    </Modal>
  );
}

function RateDialog({ rate, options, onClose, call }) {
  const confirm = useConfirm();
  const [form, setForm] = useState({ cityId: rate.cityId ? String(rate.cityId) : "", seasonId: rate.seasonId ? String(rate.seasonId) : "", validFrom: rate.validFrom || "", fee: rate.fee != null ? String(rate.fee).replace(".", ",") : "", note: rate.note || "" });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const submit = async (e) => {
    e?.preventDefault();
    const body = { cityId: form.cityId ? Number(form.cityId) : null, seasonId: form.seasonId ? Number(form.seasonId) : null, validFrom: form.validFrom || null, fee: parseAmount(form.fee), note: form.note || null };
    if (await call(rate.id ? "PUT" : "POST", rate.id ? `/rates/${rate.id}` : "/rates", body)) onClose();
  };
  return (
    <Modal title={rate.id ? "Tarifeyi düzenle" : "Yeni ücret tarifesi"} onClose={onClose} width={520} footer={<>
      {rate.id && <button type="button" className="btn btn--danger-ghost" onClick={async () => { if (await confirm({ title: "Tarifeyi sil", message: "Bu tarife silinsin mi?", danger: true, confirmLabel: "Sil" }) && await call("DELETE", `/rates/${rate.id}`)) onClose(); }}><Icon name="trash" /> Sil</button>}
      <span className="spacer" />
      <button type="button" className="btn" onClick={onClose}>Vazgeç</button>
      <button type="submit" form="rate-form" className="btn btn--primary">Kaydet</button>
    </>}>
      <form id="rate-form" className="form-grid" onSubmit={submit}>
        <Field label="İl (boş: genel)"><select value={form.cityId} onChange={set("cityId")}><option value="">Genel (tüm iller)</option>{(options?.cities || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        <Field label="Sezon (isteğe bağlı)"><select value={form.seasonId} onChange={set("seasonId")}><option value="">—</option>{(options?.seasons || []).filter((x) => !form.cityId || String(x.cityId) === form.cityId).map((x) => <option key={x.id} value={x.id}>{x.leagueName} · {x.name}</option>)}</select></Field>
        <Field label="Geçerlilik başlangıcı (ay)"><input type="month" value={form.validFrom} onChange={set("validFrom")} /></Field>
        <Field label="Maç başı ücret (₺)"><input className="money-input" inputMode="decimal" value={form.fee} onChange={set("fee")} /></Field>
        <Field label="Not" className="span2"><input value={form.note} onChange={set("note")} /></Field>
      </form>
    </Modal>
  );
}
