// Maç Muhasebesi (il defteri): /api/admin/accounting
// Defter (maç maç sabit kutucuklar), genel kayıtlar, raporlar, personel
// ödemeleri, takım tahsilatları, eksikler ve ayarlar. Hepsi web panelindeki
// il muhasebesiyle aynı veridir.
import React, { useEffect, useMemo, useState } from "react";
import { Empty, ErrorNote, Field, Icon, MenuButton, Modal, Segmented, Spinner, useConfirm, useResult, useToast } from "../../components/ui";
import { request, useResource } from "../../api";
import { formatDate, includesTr, isoDay } from "../../lib/helpers";
import { parseAmount } from "../../lib/ledgerUtils";
import { toCsvText } from "../../lib/sheets/sheetEngine";
import { AccountStrip, Bars, DAY_PRESETS, FlowChart, Kpi, Legend, PeriodPicker, dayRange, money } from "./common";

const BASE = "/api/admin/accounting";
const TABS = [
  { value: "ledger", label: "Defter", icon: "list" },
  { value: "general", label: "Genel kayıtlar", icon: "receipt" },
  { value: "reports", label: "Raporlar", icon: "trend" },
  { value: "staff", label: "Personel", icon: "users" },
  { value: "teams", label: "Takımlar", icon: "shirt" },
  { value: "missing", label: "Eksikler", icon: "flag" },
  { value: "settings", label: "Ayarlar", icon: "sliders" },
];
const TEMPLATES = [
  ["diger", "Saha kirası"], ["diger", "Ekipman"], ["diger", "Ulaşım"], ["diger", "Su / ikram"], ["diger", "Reklam"], ["diger", "Kupa / ödül"],
  ["gelir_diger", "Sponsor geliri"], ["gelir_diger", "Bağış"],
];

export default function MatchBook({ accounts, cities, nationwide, onTransfer, onManageAccounts }) {
  const result = useResult();
  const toast = useToast();
  const [cityId, setCityId] = useState(() => localStorage.getItem("acc:city") || "");
  const [period, setPeriod] = useState({ preset: "this_month" });
  const [tab, setTab] = useState("ledger");
  const [drawer, setDrawer] = useState(null);
  const range = period.preset === "custom" ? { from: period.from, to: period.to } : dayRange(period.preset);
  const q = { cityId: nationwide && cityId ? cityId : undefined };
  const meta = useResource(`${BASE}/meta`, q);
  const book = useResource(`${BASE}/book`, { ...q, from: range.from, to: range.to, compare: 1 }, { enabled: !meta.error });
  const staff = useResource(`${BASE}/staff`, q, { enabled: !meta.error });
  useEffect(() => { try { localStorage.setItem("acc:city", cityId); } catch { /* yoksay */ } }, [cityId]);

  const call = async (method, path, body, msg) => {
    const res = await request({ method, path: `${BASE}${path}`, query: q, body, queue: false });
    const ok = result(res, msg);
    if (ok) book.reload({ quiet: true });
    return ok ? res.data || {} : null;
  };

  if (meta.error?.status === 403) return <Empty icon="lock" title="Maç muhasebesine erişiminiz yok" text={meta.error.message || "“Muhasebe görüntüleme” yetkisi gerekir."} />;
  if (meta.error && !meta.data) return <ErrorNote error={meta.error} onRetry={meta.reload} />;

  const b = book.data;
  const cats = meta.data?.categories || [];
  const fixed = cats.filter((c) => c.fixed);
  const s = b?.summary;
  const prev = b?.previous?.summary;
  const delta = (cur, old) => (old ? `${cur >= old ? "▲" : "▼"} ${Math.abs(Math.round(((cur - old) / Math.abs(old || 1)) * 100))}% önceki döneme göre` : null);
  const bookCityId = b?.book?.cityId || null;

  return (
    <div className="acc-section">
      <div className="filters">
        {nationwide && (
          <select className="select-sm" value={cityId} onChange={(e) => setCityId(e.target.value)} aria-label="İl">
            <option value="">Tüm iller (ortak defter)</option>
            {cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
        {!nationwide && b?.book?.cityName && <span className="pill pill--tool"><Icon name="map" size={11} /> {b.book.cityName}</span>}
        <PeriodPicker presets={DAY_PRESETS} value={{ ...period, ...range }} onChange={setPeriod} />
        <span className="spacer" />
        <button type="button" className="btn btn--sm" onClick={async () => { const r = await call("POST", "/apply-defaults", { from: range.from, to: range.to }); if (r) toast(`${r.created || 0} kutucuk dolduruldu, ${r.updated || 0} güncellendi.`, { tone: "success" }); }}><Icon name="zap" /> Varsayılanları uygula</button>
        <MenuButton icon="download" label="Dışa aktar" items={[
          { label: "Defter (CSV)", onClick: () => exportLedger(b, cats) },
          { label: "Personel raporu (CSV)", onClick: () => exportRows("Personel", ["Personel", "Görev", "Kazanç", "Ödenen", "Bekleyen"], (b?.reports?.staff || []).map((x) => [x.name, x.tasks, x.earned, x.paid, x.pending])) },
          { label: "Takım tahsilatları (CSV)", onClick: () => exportRows("Takimlar", ["Takım", "Maç", "Faturalanan", "Tahsil", "Kalan"], (b?.reports?.teams || []).map((x) => [x.name, x.matches, x.billed, x.collected, x.outstanding])) },
        ]} />
      </div>

      <AccountStrip accounts={accounts} scope="city" cityId={bookCityId} onTransfer={onTransfer} onManage={onManageAccounts} />

      {b?.settings?.lockedUntil && <div className="notice notice--info"><Icon name="lock" size={14} /> {formatDate(b.settings.lockedUntil)} ve öncesi kilitli: tutarlar değişmez, durum ve yöntem değişebilir.</div>}
      {b && !b.settings?.seasonIds?.length && <div className="notice notice--warn"><Icon name="flag" size={14} /> Bu defterde sezon seçilmemiş. Ayarlar sekmesinden muhasebeye dahil edilecek sezonları seçin.</div>}

      {s && (
        <div className="kpis">
          <Kpi hero label="Net" value={money(s.net)} hint={delta(s.net, prev?.net) || `Kâr marjı %${Math.round((s.margin || 0) * 100) / 100}`} icon="trend" />
          <Kpi label="Gelir" value={money(s.income)} tone="green" hint={delta(s.income, prev?.income)} />
          <Kpi label="Gider" value={money(s.expense)} tone="red" hint={delta(s.expense, prev?.expense)} />
          <Kpi label="Tahsil edilecek" value={money(s.receivable)} tone="amber" hint={`Tahsil edilen ${money(s.collected, 0)}`} />
          <Kpi label="Ödenecek" value={money(s.payable)} tone="amber" hint={`Ödenen ${money(s.paidOut, 0)}`} />
          <Kpi label="Maç" value={s.matchCount} tone="blue" hint={`Maç başı net ${money(s.averageNetPerMatch || 0, 0)}`} />
        </div>
      )}

      <Segmented value={tab} onChange={setTab} size="sm" options={TABS} />
      {book.loading && !b ? <Spinner /> : book.error && !b ? <ErrorNote error={book.error} onRetry={book.reload} /> : !b ? null : (
        <>
          {tab === "ledger" && <LedgerTab b={b} fixed={fixed} call={call} openMatch={setDrawer} />}
          {tab === "general" && <GeneralTab b={b} cats={cats} staff={staff.data?.items || []} call={call} />}
          {tab === "reports" && <ReportsTab b={b} />}
          {tab === "staff" && <StaffTab b={b} call={call} />}
          {tab === "teams" && <TeamsTab b={b} call={call} />}
          {tab === "missing" && <MissingTab b={b} call={call} openMatch={setDrawer} />}
          {tab === "settings" && <SettingsTab b={b} fixed={fixed} cats={cats} q={q} staff={staff.data?.items || []} onSaved={() => book.reload({ quiet: true })} />}
        </>
      )}
      {drawer && <MatchDrawer match={drawer} fixed={fixed} settings={b?.settings} staff={staff.data?.items || []} methods={meta.data?.paymentMethods || []} call={call} onClose={() => setDrawer(null)} />}
    </div>
  );
}

/* --------------------------------- yardımcı --------------------------------- */

function suggested(match, cat, settings = {}) {
  if (cat.key === "saha" && match.field && settings.fieldRates?.[match.field] != null) return settings.fieldRates[match.field];
  if (cat.team === "home" && settings.teamRates?.[match.homeTeamId] != null) return settings.teamRates[match.homeTeamId];
  if (cat.team === "away" && settings.teamRates?.[match.awayTeamId] != null) return settings.teamRates[match.awayTeamId];
  const crew = cat.duty ? match.crew?.[cat.duty] : null;
  if (crew?.staffId && settings.staffRates?.[crew.staffId] != null) return settings.staffRates[crew.staffId];
  return settings.defaults?.[cat.key] ?? null;
}

function save(name, text) {
  window.elitlig.files.save(name, text, [{ name: "CSV", extensions: ["csv"] }]).then((r) => r.ok && window.elitlig.files.reveal(r.path));
}
function exportRows(name, header, rows) { save(`Elitlig-${name}.csv`, toCsvText([header, ...rows.map((r) => r.map((v) => (typeof v === "number" ? String(v).replace(".", ",") : String(v ?? ""))))])); }
function exportLedger(b, cats) {
  if (!b) return;
  const label = (k) => cats.find((c) => c.key === k)?.label || k;
  const rows = [];
  for (const d of b.days) {
    for (const m of d.matches) {
      for (const e of [...Object.values(m.cells || {}), ...(m.extras || [])]) rows.push([d.date, `${m.home} - ${m.away}`, label(e.category), e.title || "", e.direction === "income" ? "Gelir" : "Gider", String(e.amount).replace(".", ","), e.status === "paid" ? "Ödendi" : "Bekliyor", e.paymentMethod || "", e.staffName || ""]);
    }
    for (const e of d.entries || []) rows.push([d.date, "Genel", label(e.category), e.title || "", e.direction === "income" ? "Gelir" : "Gider", String(e.amount).replace(".", ","), e.status === "paid" ? "Ödendi" : "Bekliyor", e.paymentMethod || "", e.staffName || ""]);
  }
  save(`Elitlig-Mac-Muhasebesi-${b.range.from}.csv`, toCsvText([["Tarih", "Maç", "Kalem", "Başlık", "Tür", "Tutar", "Durum", "Yöntem", "Personel"], ...rows]));
}

/* ---------------------------------- defter ---------------------------------- */

function Cell({ match, cat, entry, settings, call, locked }) {
  const [value, setValue] = useState(entry ? String(entry.amount).replace(".", ",") : "");
  useEffect(() => setValue(entry ? String(entry.amount).replace(".", ",") : ""), [entry?.amount]); // eslint-disable-line react-hooks/exhaustive-deps
  const hint = suggested(match, cat, settings);
  const commit = async () => {
    const current = entry ? String(entry.amount).replace(".", ",") : "";
    if (value.trim() === current) return;
    const amount = value.trim() === "" ? null : parseAmount(value);
    await call("PUT", `/matches/${match.id}/cells`, { cells: { [cat.key]: amount == null ? null : { amount, status: entry?.status } } });
  };
  return (
    <td className={`bcell ${cat.direction === "income" ? "bcell--in" : "bcell--out"} ${entry ? `is-${entry.status}` : ""}`}>
      <div className="bcell__wrap">
        {entry && <button type="button" className="bcell__dot" title={entry.status === "paid" ? (cat.direction === "income" ? "Tahsil edildi" : "Ödendi") + " — değiştirmek için tıklayın" : "Bekliyor — tıklayınca ödendi olur"} onClick={() => call("PATCH", `/entries/${entry.id}`, { status: entry.status === "paid" ? "pending" : "paid" })} />}
        <input value={value} disabled={locked} placeholder={hint != null ? String(hint) : "—"} onChange={(e) => setValue(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") { setValue(entry ? String(entry.amount) : ""); e.currentTarget.blur(); } }} inputMode="decimal" />
      </div>
    </td>
  );
}

function LedgerTab({ b, fixed, call, openMatch }) {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState("all");
  const incomeCats = fixed.filter((c) => c.direction === "income");
  const expenseCats = fixed.filter((c) => c.direction === "expense");
  const days = b.days
    .map((d) => ({ ...d, matches: d.matches.filter((m) => (!query || includesTr(`${m.home} ${m.away} ${m.field} ${m.league}`, query)) && (mode === "all" || (mode === "missing" ? !Object.keys(m.cells || {}).length || fixed.some((c) => !m.cells?.[c.key]) : [...Object.values(m.cells || {}), ...(m.extras || [])].some((e) => e.status === "pending"))) ) }))
    .filter((d) => d.matches.length || (mode === "all" && !query && d.entries?.length));
  if (!b.days.length) return <Empty icon="calendar" title="Bu dönemde maç yok" text="Ayarlar sekmesinde sezon seçili mi kontrol edin." />;
  return (
    <div className="ledger">
      <div className="filters">
        <div className="search-box"><Icon name="search" size={14} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Takım, saha, lig…" /></div>
        <Segmented value={mode} onChange={setMode} size="sm" options={[{ value: "all", label: "Tümü" }, { value: "missing", label: "Eksik girişli" }, { value: "pending", label: "Bekleyen ödemeler" }]} />
        <span className="muted small">Hücreye tutar yazıp ↩. Noktaya tıklayınca ödendi/bekliyor değişir. Gri sayı varsayılan tutardır.</span>
      </div>
      <div className="table-wrap book-wrap">
        <table className="table book">
          <thead>
            <tr>
              <th className="book__match">Maç</th>
              {incomeCats.map((c) => <th key={c.key} className="bcell-h bcell-h--in" title={c.label}>{c.short || c.label}</th>)}
              {expenseCats.map((c) => <th key={c.key} className="bcell-h bcell-h--out" title={c.label}>{c.short || c.label}</th>)}
              <th className="num">Net</th>
            </tr>
          </thead>
          <tbody>
            {days.map((d) => (
              <React.Fragment key={d.date}>
                <tr className="book__day"><td colSpan={fixed.length + 2}>
                  <strong>{formatDate(d.date, { weekday: "long", day: "numeric", month: "long" })}</strong>
                  <span className="muted"> · {d.matches.length} maç · gelir {money(d.totals?.income || 0, 0)} · gider {money(d.totals?.expense || 0, 0)} · </span>
                  <strong className={(d.totals?.net || 0) >= 0 ? "text-green" : "text-red"}>net {money(d.totals?.net || 0, 0)}</strong>
                </td></tr>
                {d.matches.map((m) => (
                  <tr key={m.id} className={m.locked ? "is-locked" : ""}>
                    <td className="book__match">
                      <button type="button" className="book__matchbtn" onClick={() => openMatch(m)}>
                        <strong>{m.home} – {m.away}</strong>
                        <small>{m.time || ""}{m.field ? ` · ${m.field}` : ""}{m.score ? ` · ${m.score}` : ""}{m.extras?.length ? ` · +${m.extras.length} kalem` : ""}</small>
                      </button>
                    </td>
                    {[...incomeCats, ...expenseCats].map((c) => <Cell key={c.key} match={m} cat={c} entry={m.cells?.[c.key]} settings={b.settings} call={call} locked={m.locked} />)}
                    <td className={`num ${(m.totals?.net || 0) >= 0 ? "text-green" : "text-red"}`}><strong>{money(m.totals?.net || 0, 0)}</strong></td>
                  </tr>
                ))}
                {(d.entries || []).map((e) => (
                  <tr key={`e${e.id}`} className="book__entry">
                    <td colSpan={fixed.length + 1}><span className="pill">Genel</span> {e.title || e.categoryLabel} <small className="muted">{e.status === "paid" ? "ödendi" : "bekliyor"}</small></td>
                    <td className={`num ${e.direction === "income" ? "text-green" : "text-red"}`}>{e.direction === "income" ? "+" : "−"}{money(e.amount, 0)}</td>
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ------------------------------- maç penceresi ------------------------------- */

function MatchDrawer({ match, fixed, settings, staff, methods, call, onClose }) {
  const confirm = useConfirm();
  const [cells, setCells] = useState(() => Object.fromEntries(fixed.map((c) => {
    const e = match.cells?.[c.key];
    return [c.key, { amount: e ? String(e.amount).replace(".", ",") : "", status: e?.status || "pending", paymentMethod: e?.paymentMethod || "", staffId: e?.staffId ? String(e.staffId) : "", note: e?.note || "" }];
  })));
  const [extra, setExtra] = useState({ category: "diger", title: "", amount: "", status: "pending" });
  const [busy, setBusy] = useState(false);
  const set = (key, field, value) => setCells({ ...cells, [key]: { ...cells[key], [field]: value } });
  const saveAll = async () => {
    setBusy(true);
    const body = {};
    for (const c of fixed) {
      const v = cells[c.key];
      const had = match.cells?.[c.key];
      if (!v.amount.trim()) { if (had) body[c.key] = null; continue; }
      body[c.key] = { amount: parseAmount(v.amount), status: v.status, paymentMethod: v.paymentMethod || null, note: v.note || null, ...(c.direction === "expense" ? { staffId: v.staffId ? Number(v.staffId) : null } : {}) };
    }
    const ok = await call("PUT", `/matches/${match.id}/cells`, { cells: body }, "Maç kaydedildi.");
    setBusy(false);
    if (ok) onClose();
  };
  const fillDefaults = () => {
    const next = { ...cells };
    for (const c of fixed) if (!next[c.key].amount) { const h = suggested(match, c, settings); if (h != null) next[c.key] = { ...next[c.key], amount: String(h) }; }
    setCells(next);
  };
  return (
    <Modal title={`${match.home} – ${match.away}`} onClose={onClose} width={860} className="modal--wide" footer={<>
      <button type="button" className="btn btn--ghost" onClick={fillDefaults}><Icon name="zap" /> Boşları varsayılanla doldur</button>
      <span className="spacer" />
      <button type="button" className="btn" onClick={onClose}>Vazgeç</button>
      <button type="button" className="btn btn--primary" disabled={busy || match.locked} onClick={saveAll}>Kaydet</button>
    </>}>
      <p className="muted">{formatDate(match.date, { weekday: "long", day: "numeric", month: "long" })} {match.time} · {match.field} · {match.league}{match.score ? ` · Skor ${match.score}` : ""}</p>
      {match.locked && <div className="notice notice--info"><Icon name="lock" size={14} /> Bu maç kilitli dönemde: yalnız durum, yöntem ve not değişebilir.</div>}
      <div className="table-wrap" style={{ boxShadow: "none" }}>
        <table className="table">
          <thead><tr><th>Kalem</th><th>Tutar</th><th>Durum</th><th>Yöntem</th><th>Personel</th><th>Not</th></tr></thead>
          <tbody>
            {fixed.map((c) => {
              const v = cells[c.key];
              const crew = c.duty ? match.crew?.[c.duty] : null;
              return (
                <tr key={c.key}>
                  <td><span className={`dot-label ${c.direction === "income" ? "is-in" : "is-out"}`} />{c.label}</td>
                  <td style={{ width: 120 }}><input inputMode="decimal" value={v.amount} placeholder={suggested(match, c, settings) ?? ""} onChange={(e) => set(c.key, "amount", e.target.value)} /></td>
                  <td style={{ width: 140 }}><select value={v.status} onChange={(e) => set(c.key, "status", e.target.value)}><option value="pending">{c.direction === "income" ? "Tahsil edilecek" : "Ödenecek"}</option><option value="paid">{c.direction === "income" ? "Tahsil edildi" : "Ödendi"}</option></select></td>
                  <td style={{ width: 130 }}><select value={v.paymentMethod} onChange={(e) => set(c.key, "paymentMethod", e.target.value)}><option value="">—</option>{methods.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}</select></td>
                  <td style={{ width: 160 }}>{c.direction === "expense" ? (
                    <select value={v.staffId} onChange={(e) => set(c.key, "staffId", e.target.value)}><option value="">{crew?.name ? `Görevli: ${crew.name}` : "—"}</option>{staff.filter((p) => !c.duty || p.duties?.includes(c.duty)).map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}</select>
                  ) : <span className="muted small">—</span>}</td>
                  <td><input value={v.note} onChange={(e) => set(c.key, "note", e.target.value)} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <h4 className="section-title">Ek kalemler</h4>
      {(match.extras || []).map((e) => (
        <div key={e.id} className="extra-row">
          <span className={`dot-label ${e.direction === "income" ? "is-in" : "is-out"}`} />
          <strong>{e.title}</strong>
          <span className="muted small">{e.categoryLabel}</span>
          <span className="spacer" />
          <button type="button" className={`pill ${e.status === "paid" ? "pill--green" : "pill--amber"}`} onClick={() => call("PATCH", `/entries/${e.id}`, { status: e.status === "paid" ? "pending" : "paid" })}>{e.status === "paid" ? "Ödendi" : "Bekliyor"}</button>
          <strong className="tabular">{money(e.amount)}</strong>
          <button type="button" className="icon-btn" onClick={async () => { if (await confirm({ title: "Kalemi sil", message: `${e.title} silinsin mi?`, danger: true, confirmLabel: "Sil" })) call("DELETE", `/entries/${e.id}`, undefined, "Silindi."); }}><Icon name="trash" /></button>
        </div>
      ))}
      <form className="extra-add" onSubmit={async (e) => {
        e.preventDefault();
        if (!extra.title.trim() || !(parseAmount(extra.amount) > 0)) return;
        if (await call("POST", "/entries", { matchId: match.id, category: extra.category, title: extra.title.trim(), amount: parseAmount(extra.amount), status: extra.status }, "Kalem eklendi.")) setExtra({ ...extra, title: "", amount: "" });
      }}>
        <select className="select-sm" value={extra.category} onChange={(e) => setExtra({ ...extra, category: e.target.value })}><option value="diger">Gider</option><option value="gelir_diger">Gelir</option></select>
        <input value={extra.title} onChange={(e) => setExtra({ ...extra, title: e.target.value })} placeholder="Başlık (örn. top, su)" />
        <input value={extra.amount} onChange={(e) => setExtra({ ...extra, amount: e.target.value })} placeholder="Tutar" inputMode="decimal" style={{ width: 120 }} />
        <select className="select-sm" value={extra.status} onChange={(e) => setExtra({ ...extra, status: e.target.value })}><option value="pending">Bekliyor</option><option value="paid">Ödendi</option></select>
        <button type="submit" className="btn btn--sm btn--soft"><Icon name="plus" /> Ekle</button>
      </form>
    </Modal>
  );
}

/* ------------------------------ genel kayıtlar ------------------------------ */

function GeneralTab({ b, cats, staff, call }) {
  const confirm = useConfirm();
  const entries = useMemo(() => b.days.flatMap((d) => d.entries || []).sort((a, c) => c.date.localeCompare(a.date)), [b]);
  const free = cats.filter((c) => !c.fixed || c.key === "saha");
  const [form, setForm] = useState({ date: isoDay(), category: "diger", title: "", amount: "", status: "paid", paymentMethod: "nakit", seasonId: "", staffId: "", note: "" });
  const [filter, setFilter] = useState("all");
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const list = entries.filter((e) => filter === "all" || (filter === "pending" ? e.status === "pending" : e.direction === filter));
  const submit = async (e) => {
    e.preventDefault();
    const amount = parseAmount(form.amount);
    if (!(amount > 0) || (!form.title.trim() && !cats.find((c) => c.key === form.category)?.fixed)) return;
    const body = { date: form.date, category: form.category, title: form.title.trim() || undefined, amount, status: form.status, paymentMethod: form.paymentMethod || null, note: form.note || null, ...(form.seasonId ? { seasonId: Number(form.seasonId) } : {}), ...(form.staffId ? { staffId: Number(form.staffId) } : {}) };
    if (await call("POST", "/entries", body, "Kayıt eklendi.")) setForm({ ...form, title: "", amount: "", note: "" });
  };
  return (
    <div className="general">
      <form className="card general-form" onSubmit={submit}>
        <h3 className="card__title"><span className="card__icon"><Icon name="plus" size={15} /></span> Maça bağlı olmayan kayıt</h3>
        <div className="chips">{TEMPLATES.map(([cat, title]) => <button key={title} type="button" className="chip" onClick={() => setForm({ ...form, category: cat, title })}>{title}</button>)}</div>
        <div className="form-grid form-grid--3">
          <Field label="Tarih"><input type="date" value={form.date} onChange={set("date")} /></Field>
          <Field label="Kalem"><select value={form.category} onChange={set("category")}>{free.map((c) => <option key={c.key} value={c.key}>{c.direction === "income" ? "Gelir · " : "Gider · "}{c.label}</option>)}</select></Field>
          <Field label="Tutar"><input inputMode="decimal" value={form.amount} onChange={set("amount")} placeholder="0,00" /></Field>
          <Field label="Başlık" className="span2"><input value={form.title} onChange={set("title")} placeholder="örn. Kasım saha kirası" /></Field>
          <Field label="Durum"><select value={form.status} onChange={set("status")}><option value="paid">Ödendi / tahsil edildi</option><option value="pending">Bekliyor</option></select></Field>
          <Field label="Yöntem"><select value={form.paymentMethod} onChange={set("paymentMethod")}><option value="">—</option><option value="nakit">Nakit</option><option value="havale">Havale / EFT</option><option value="kart">Kredi kartı</option><option value="diger">Diğer</option></select></Field>
          <Field label="Sezon"><select value={form.seasonId} onChange={set("seasonId")}><option value="">—</option>{(b.selectedSeasons || []).map((x) => <option key={x.id} value={x.id}>{x.league} · {x.name}</option>)}</select></Field>
          <Field label="Personel"><select value={form.staffId} onChange={set("staffId")}><option value="">—</option>{staff.map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}</select></Field>
          <Field label="Not" className="span3"><input value={form.note} onChange={set("note")} /></Field>
        </div>
        <div className="row-gap"><button type="submit" className="btn btn--primary"><Icon name="plus" /> Kaydet</button></div>
      </form>
      <div className="filters"><Segmented value={filter} onChange={setFilter} size="sm" options={[{ value: "all", label: "Tümü", count: entries.length }, { value: "expense", label: "Giderler" }, { value: "income", label: "Gelirler" }, { value: "pending", label: "Bekleyenler" }]} /></div>
      {list.length ? (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Tarih</th><th>Başlık</th><th>Kalem</th><th>Durum</th><th className="num">Tutar</th><th /></tr></thead>
            <tbody>{list.map((e) => (
              <tr key={e.id}>
                <td>{formatDate(e.date)}</td>
                <td><strong>{e.title || "—"}</strong>{e.note && <small className="muted"> · {e.note}</small>}</td>
                <td>{e.categoryLabel}</td>
                <td><button type="button" className={`pill ${e.status === "paid" ? "pill--green" : "pill--amber"}`} onClick={() => call("PATCH", `/entries/${e.id}`, { status: e.status === "paid" ? "pending" : "paid" })}>{e.status === "paid" ? "Ödendi" : "Bekliyor"}</button></td>
                <td className={`num ${e.direction === "income" ? "text-green" : "text-red"}`}>{e.direction === "income" ? "+" : "−"}{money(e.amount)}</td>
                <td className="row-actions"><MenuButton items={[
                  { label: "Sonraki aya kopyala", icon: "copy", onClick: () => { const d = new Date(`${e.date}T12:00:00`); d.setMonth(d.getMonth() + 1); call("POST", "/entries", { date: isoDay(d), category: e.category, title: e.title, amount: e.amount, status: "pending", paymentMethod: e.paymentMethod, note: e.note }, "Sonraki aya kopyalandı."); } },
                  { label: "Sil", icon: "trash", danger: true, onClick: async () => { if (await confirm({ title: "Kaydı sil", message: `${e.title || e.categoryLabel} silinsin mi?`, danger: true, confirmLabel: "Sil" })) call("DELETE", `/entries/${e.id}`, undefined, "Silindi."); } },
                ]} /></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ) : <Empty icon="receipt" title="Genel kayıt yok" />}
    </div>
  );
}

/* --------------------------------- raporlar --------------------------------- */

function ReportsTab({ b }) {
  const r = b.reports || {};
  const [grain, setGrain] = useState(() => ((new Date(b.range.to) - new Date(b.range.from)) / 86400000 > 62 ? "monthly" : "daily"));
  const rows = (r[grain] || []).map((x) => ({ ...x, label: grain === "monthly" ? new Date(`${x.key}-01T12:00:00`).toLocaleDateString("tr-TR", { month: "short" }) : grain === "weekly" ? `${x.week}. hf` : new Date(`${x.key}T12:00:00`).getDate() }));
  const target = b.settings?.monthlyTarget;
  return (
    <div className="report-grid">
      <section className="card card--span2">
        <header className="card__head">
          <h3 className="card__title"><span className="card__icon"><Icon name="trend" size={15} /></span> Gelir – gider akışı</h3>
          <Segmented value={grain} onChange={setGrain} size="sm" options={[{ value: "daily", label: "Günlük" }, { value: "weekly", label: "Haftalık" }, { value: "monthly", label: "Aylık" }]} />
        </header>
        <FlowChart rows={rows} />
        <Legend />
        {target ? <p className="muted small">Aylık kâr hedefi: {money(target, 0)}</p> : null}
      </section>
      <section className="card"><h3 className="card__title">Gider dağılımı</h3><Bars rows={(r.expenseBreakdown || []).map((x) => ({ key: x.key, label: x.label, value: x.amount, tone: "red" }))} /></section>
      <section className="card"><h3 className="card__title">Gelir dağılımı</h3><Bars rows={(r.incomeBreakdown || []).map((x) => ({ key: x.key, label: x.label, value: x.amount, tone: "green" }))} /></section>
      <section className="card"><h3 className="card__title">Saha bazında net</h3><Bars rows={(r.byField || []).map((x) => ({ key: x.key, label: x.key || "Saha yok", value: x.net, sub: `${x.matchCount} maç`, tone: x.net >= 0 ? "green" : "red" }))} /></section>
      <section className="card"><h3 className="card__title">Lig bazında net</h3><Bars rows={(r.byLeague || []).map((x) => ({ key: x.key, label: x.key, value: x.net, sub: `${x.matchCount} maç`, tone: x.net >= 0 ? "green" : "red" }))} /></section>
      <section className="card"><h3 className="card__title">Ödeme yöntemleri (gerçekleşen)</h3>
        <table className="table"><thead><tr><th>Yöntem</th><th className="num">Gelir</th><th className="num">Gider</th><th className="num">Net</th></tr></thead>
          <tbody>{(r.byMethod || []).map((m) => <tr key={m.key}><td>{m.label}</td><td className="num text-green">{money(m.income, 0)}</td><td className="num text-red">{money(m.expense, 0)}</td><td className="num"><strong>{money(m.income - m.expense, 0)}</strong></td></tr>)}</tbody></table>
      </section>
      <section className="card"><h3 className="card__title">Vade yaşlandırma</h3>
        <table className="table"><thead><tr><th>Gün</th><th className="num">Alacak</th><th className="num">Borç</th></tr></thead>
          <tbody>{(r.aging?.receivable || []).map((a, i) => <tr key={a.key}><td>{a.label}</td><td className="num">{money(a.amount, 0)} <small className="muted">({a.count})</small></td><td className="num">{money(r.aging?.payable?.[i]?.amount || 0, 0)} <small className="muted">({r.aging?.payable?.[i]?.count || 0})</small></td></tr>)}</tbody></table>
      </section>
      <section className="card"><h3 className="card__title">Haftanın günleri</h3><Bars rows={(r.byWeekday || []).map((x) => ({ key: x.key, label: x.label || x.key, value: x.net, tone: x.net >= 0 ? "green" : "red" }))} /></section>
    </div>
  );
}

/* --------------------------------- personel --------------------------------- */

function StaffTab({ b, call }) {
  const [method, setMethod] = useState("nakit");
  const list = b.reports?.staff || [];
  if (!list.length) return <Empty icon="users" title="Bu dönemde personel ödemesi yok" />;
  return (
    <>
      <div className="filters"><span className="muted small">Ödeme yöntemi:</span><select className="select-sm" value={method} onChange={(e) => setMethod(e.target.value)}><option value="nakit">Nakit</option><option value="havale">Havale / EFT</option><option value="kart">Kart</option><option value="diger">Diğer</option></select></div>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Personel</th><th className="num">Görev</th><th className="num">Maç</th><th className="num">Hak ediş</th><th className="num">Ödenen</th><th className="num">Bekleyen</th><th /></tr></thead>
          <tbody>{list.map((p) => (
            <tr key={p.staffId || p.name}>
              <td><strong>{p.name}</strong><small className="muted"> · ort. {money(p.average || 0, 0)}</small></td>
              <td className="num">{p.tasks}</td><td className="num">{p.matchCount}</td>
              <td className="num">{money(p.earned)}</td><td className="num text-green">{money(p.paid)}</td>
              <td className={`num ${p.pending ? "text-red" : ""}`}><strong>{money(p.pending)}</strong></td>
              <td className="row-actions">{p.pendingEntryIds?.length > 0 && <button type="button" className="btn btn--xs btn--green" onClick={() => call("POST", "/entries/status", { ids: p.pendingEntryIds, status: "paid", paymentMethod: method }, `${p.name}: ${money(p.pending)} ödendi.`)}>Ödendi</button>}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </>
  );
}

/* --------------------------------- takımlar --------------------------------- */

function TeamsTab({ b, call }) {
  const toast = useToast();
  const list = b.reports?.teams || [];
  if (!list.length) return <Empty icon="shirt" title="Bu dönemde takım ücreti yok" />;
  const statement = (t) => `${t.name} — ${formatDate(b.range.from)} – ${formatDate(b.range.to)}\n${t.matches} maç · Faturalanan ${money(t.billed)} · Ödenen ${money(t.collected)}\nKalan borç: ${money(t.outstanding)}${t.oldestPending ? `\nEn eski bekleyen: ${formatDate(t.oldestPending)}` : ""}\n\nElitlig`;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead><tr><th>Takım</th><th className="num">Maç</th><th className="num">Faturalanan</th><th className="num">Tahsil</th><th className="num">Kalan</th><th>En eski</th><th /></tr></thead>
        <tbody>{list.map((t) => (
          <tr key={t.teamId}>
            <td><strong>{t.name}</strong>{t.unbilledMatches ? <small className="text-amber"> · {t.unbilledMatches} maç faturasız</small> : null}</td>
            <td className="num">{t.matches}</td><td className="num">{money(t.billed)}</td><td className="num text-green">{money(t.collected)}</td>
            <td className={`num ${t.outstanding ? "text-red" : ""}`}><strong>{money(t.outstanding)}</strong></td>
            <td>{t.oldestPending ? formatDate(t.oldestPending) : "—"}</td>
            <td className="row-actions">
              <button type="button" className="icon-btn" title="Hesap özetini kopyala (WhatsApp için)" onClick={() => { navigator.clipboard.writeText(statement(t)); toast("Hesap özeti kopyalandı.", { tone: "success" }); }}><Icon name="copy" /></button>
              {t.pendingEntryIds?.length > 0 && <button type="button" className="btn btn--xs btn--green" onClick={() => call("POST", "/entries/status", { ids: t.pendingEntryIds, status: "paid" }, `${t.name}: tahsil edildi.`)}>Tahsil edildi</button>}
            </td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

/* --------------------------------- eksikler --------------------------------- */

function MissingTab({ b, call, openMatch }) {
  const list = b.reports?.missing || [];
  const matches = new Map(b.days.flatMap((d) => d.matches).map((m) => [m.id, m]));
  if (!list.length) return <Empty icon="check" title="Eksik giriş yok" text="Bu dönemdeki tüm maçların gelir ve gideri girilmiş." />;
  return (
    <>
      <div className="filters"><button type="button" className="btn btn--primary btn--sm" onClick={() => call("POST", "/apply-defaults", { from: b.range.from, to: b.range.to, matchIds: list.map((x) => x.matchId) }, "Eksikler varsayılanlarla dolduruldu.")}><Icon name="zap" /> Tümünü varsayılanla doldur</button></div>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Tarih</th><th>Maç</th><th>Eksik</th><th /></tr></thead>
          <tbody>{list.map((x) => (
            <tr key={x.matchId}>
              <td>{formatDate(x.date)}</td><td><strong>{x.label}</strong></td>
              <td>{x.noIncome && <span className="pill pill--amber">Gelir yok</span>} {x.noExpense && <span className="pill pill--red">Gider yok</span>}</td>
              <td className="row-actions">{matches.get(x.matchId) && <button type="button" className="btn btn--xs" onClick={() => openMatch(matches.get(x.matchId))}>Gir</button>}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </>
  );
}

/* ---------------------------------- ayarlar ---------------------------------- */

function SettingsTab({ b, fixed, cats, q, staff, onSaved }) {
  const result = useResult();
  const seasons = useResource(`${BASE}/seasons`, q);
  const [st, setSt] = useState(() => JSON.parse(JSON.stringify(b.settings || {})));
  const [busy, setBusy] = useState(false);
  const fields = useMemo(() => [...new Set(b.days.flatMap((d) => d.matches.map((m) => m.field)).filter(Boolean))].sort(), [b]);
  const teams = useMemo(() => { const map = new Map(); b.days.forEach((d) => d.matches.forEach((m) => { map.set(m.homeTeamId, m.home); map.set(m.awayTeamId, m.away); })); return [...map.entries()].filter(([id]) => id).sort((a, c) => String(a[1]).localeCompare(String(c[1]), "tr")); }, [b]);
  const setMap = (key, k, v) => setSt({ ...st, [key]: { ...(st[key] || {}), [k]: v === "" ? undefined : parseAmount(v) } });
  const toggleSeason = (id) => { const set = new Set(st.seasonIds || []); set.has(id) ? set.delete(id) : set.add(id); setSt({ ...st, seasonIds: [...set] }); };
  const save = async () => {
    setBusy(true);
    const clean = (o) => Object.fromEntries(Object.entries(o || {}).filter(([, v]) => v != null && Number.isFinite(v)));
    const body = { ...st, defaults: clean(st.defaults), fieldRates: clean(st.fieldRates), teamRates: clean(st.teamRates), staffRates: clean(st.staffRates), budgets: clean(st.budgets), monthlyTarget: st.monthlyTarget === "" || st.monthlyTarget == null ? null : parseAmount(st.monthlyTarget), lockedUntil: st.lockedUntil || null };
    const res = await request({ method: "PUT", path: `${BASE}/settings`, query: q, body: { settings: body }, queue: false });
    setBusy(false);
    if (result(res, "Ayarlar kaydedildi.")) onSaved();
  };
  const val = (v) => (v == null ? "" : String(v).replace(".", ","));
  return (
    <div className="settings-grid">
      <section className="card card--span2">
        <h3 className="card__title"><span className="card__icon"><Icon name="layers" size={15} /></span> Defterdeki sezonlar</h3>
        {seasons.loading && !seasons.data ? <Spinner /> : (seasons.data?.leagues || []).map((l) => (
          <div key={l.leagueId} className="season-row">
            <strong>{l.league}{l.archived ? <small className="muted"> (arşiv)</small> : null}</strong>
            <div className="chips">{l.seasons.map((x) => <button key={x.id} type="button" className={`chip ${(st.seasonIds || []).includes(x.id) ? "" : "chip--off"}`} onClick={() => toggleSeason(x.id)}>{(st.seasonIds || []).includes(x.id) ? "✓ " : ""}{x.name} <small>· {x.matchCount} maç</small></button>)}</div>
          </div>
        ))}
        <label className="toggle"><input type="checkbox" checked={Boolean(st.excludeDrafts)} onChange={(e) => setSt({ ...st, excludeDrafts: e.target.checked })} /> Taslak maçları dahil etme</label>
      </section>
      <section className="card">
        <h3 className="card__title">Varsayılan tutarlar (maç başı)</h3>
        <div className="form-grid">{fixed.map((c) => <Field key={c.key} label={c.label}><input inputMode="decimal" value={val(st.defaults?.[c.key])} onChange={(e) => setMap("defaults", c.key, e.target.value)} /></Field>)}</div>
      </section>
      <section className="card">
        <h3 className="card__title">Aylık bütçe ve hedef</h3>
        <Field label="Aylık kâr hedefi"><input inputMode="decimal" value={val(st.monthlyTarget)} onChange={(e) => setSt({ ...st, monthlyTarget: e.target.value })} /></Field>
        <div className="form-grid">{cats.filter((c) => c.direction === "expense").map((c) => <Field key={c.key} label={`Bütçe · ${c.label}`}><input inputMode="decimal" value={val(st.budgets?.[c.key])} onChange={(e) => setMap("budgets", c.key, e.target.value)} /></Field>)}</div>
        <Field label="Dönem kilidi (bu tarih ve öncesi)"><input type="date" value={st.lockedUntil || ""} onChange={(e) => setSt({ ...st, lockedUntil: e.target.value })} /></Field>
      </section>
      <section className="card">
        <h3 className="card__title">Saha ücretleri</h3>
        {fields.length ? <div className="form-grid">{fields.map((f) => <Field key={f} label={f}><input inputMode="decimal" value={val(st.fieldRates?.[f])} onChange={(e) => setMap("fieldRates", f, e.target.value)} /></Field>)}</div> : <p className="muted small">Bu dönemde saha yok.</p>}
      </section>
      <section className="card">
        <h3 className="card__title">Takım ücretleri</h3>
        {teams.length ? <div className="form-grid">{teams.map(([id, name]) => <Field key={id} label={name}><input inputMode="decimal" value={val(st.teamRates?.[id])} onChange={(e) => setMap("teamRates", id, e.target.value)} /></Field>)}</div> : <p className="muted small">Bu dönemde takım yok.</p>}
      </section>
      <section className="card card--span2">
        <h3 className="card__title">Personel ücretleri</h3>
        {staff.length ? <div className="form-grid form-grid--3">{staff.map((p) => <Field key={p.id} label={`${p.fullName}${p.duties?.length ? ` · ${p.duties.join(", ")}` : ""}`}><input inputMode="decimal" value={val(st.staffRates?.[p.id])} onChange={(e) => setMap("staffRates", p.id, e.target.value)} /></Field>)}</div> : <p className="muted small">Personel yok.</p>}
      </section>
      <div className="settings-save"><button type="button" className="btn btn--primary btn--lg" disabled={busy} onClick={save}>{busy ? "Kaydediliyor…" : "Ayarları kaydet"}</button></div>
    </div>
  );
}
