// Muhasebe modülünün ortak parçaları.
import React, { useMemo, useState } from "react";
import { Field, Icon, Modal, useResult } from "../../components/ui";
import { post, patch, useResource } from "../../api";
import { formatMoney, isoDay } from "../../lib/helpers";
import { parseAmount } from "../../lib/ledgerUtils";

export const money = (v, d = 2) => formatMoney(v, d);
export const signed = (v) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${formatMoney(Math.abs(v))}`;

export const ACCOUNT_KINDS = { kasa: { icon: "wallet", label: "Kasa" }, banka: { icon: "bank", label: "Banka" }, kart: { icon: "receipt", label: "Kart" }, pos: { icon: "receipt", label: "POS" }, diger: { icon: "layers", label: "Diğer" } };
export const SCOPE_LABEL = { personal: "Kişisel", city: "İl", national: "Türkiye geneli" };
export const ACCOUNT_COLORS = ["#7c3aed", "#059669", "#0284c7", "#e11d48", "#d97706", "#0d9488", "#4f46e5", "#475569"];

const pad = (n) => String(n).padStart(2, "0");
const dayIso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Gün aralığı ön ayarları (YYYY-MM-DD). */
export function dayRange(key, today = new Date()) {
  const y = today.getFullYear();
  const m = today.getMonth();
  const mondayOffset = (today.getDay() + 6) % 7;
  const monday = new Date(y, m, today.getDate() - mondayOffset);
  switch (key) {
    case "this_week": return { from: dayIso(monday), to: dayIso(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6)) };
    case "last_week": return { from: dayIso(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() - 7)), to: dayIso(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() - 1)) };
    case "this_month": return { from: dayIso(new Date(y, m, 1)), to: dayIso(new Date(y, m + 1, 0)) };
    case "last_month": return { from: dayIso(new Date(y, m - 1, 1)), to: dayIso(new Date(y, m, 0)) };
    case "last_30": return { from: dayIso(new Date(y, m, today.getDate() - 29)), to: dayIso(today) };
    case "last_3m": return { from: dayIso(new Date(y, m - 2, 1)), to: dayIso(new Date(y, m + 1, 0)) };
    case "this_year": return { from: `${y}-01-01`, to: `${y}-12-31` };
    default: return null;
  }
}
export const DAY_PRESETS = [["this_week", "Bu hafta"], ["last_week", "Geçen hafta"], ["this_month", "Bu ay"], ["last_month", "Geçen ay"], ["last_30", "Son 30 gün"], ["last_3m", "Son 3 ay"], ["this_year", "Bu yıl"]];

/** Ay aralığı ön ayarları (YYYY-MM). */
export function monthRange(key, today = new Date()) {
  const y = today.getFullYear();
  const m = today.getMonth();
  const ym = (yy, mm) => { const d = new Date(yy, mm, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
  switch (key) {
    case "this_year": return { from: `${y}-01`, to: ym(y, m) };
    case "last_12": return { from: ym(y, m - 11), to: ym(y, m) };
    case "last_6": return { from: ym(y, m - 5), to: ym(y, m) };
    case "this_month": return { from: ym(y, m), to: ym(y, m) };
    case "last_year": return { from: `${y - 1}-01`, to: `${y - 1}-12` };
    default: return null;
  }
}
export const MONTH_PRESETS = [["this_year", "Bu yıl"], ["last_12", "Son 12 ay"], ["last_6", "Son 6 ay"], ["this_month", "Bu ay"], ["last_year", "Geçen yıl"]];

export function PeriodPicker({ presets, value, onChange, type = "date" }) {
  return (
    <div className="period">
      <div className="seg seg--sm">
        {presets.map(([key, label]) => <button key={key} type="button" className={value.preset === key ? "is-active" : ""} onClick={() => onChange({ preset: key })}>{label}</button>)}
      </div>
      <input type={type} className="select-sm" value={value.from || ""} onChange={(e) => onChange({ preset: "custom", from: e.target.value, to: value.to })} aria-label="Başlangıç" />
      <span className="muted">–</span>
      <input type={type} className="select-sm" value={value.to || ""} onChange={(e) => onChange({ preset: "custom", from: value.from, to: e.target.value })} aria-label="Bitiş" />
    </div>
  );
}

export function Kpi({ label, value, hint, tone = "", hero = false, icon }) {
  return (
    <div className={`kpi ${tone ? `kpi--${tone}` : ""} ${hero ? "kpi--hero" : ""}`}>
      <span>{icon && <Icon name={icon} size={12} />} {label}</span>
      <strong>{value}</strong>
      {hint && <small>{hint}</small>}
    </div>
  );
}

/** Yatay çubuk listesi: [{ key, label, value, tone }] */
export function Bars({ rows, total, format = (v) => money(v, 0), empty = "Veri yok." }) {
  const max = total ?? Math.max(1, ...rows.map((r) => Math.abs(r.value)));
  if (!rows.length) return <p className="muted small">{empty}</p>;
  return (
    <div className="bars">
      {rows.map((r) => (
        <div key={r.key || r.label} className="cat-bar">
          <span>{r.label} {r.sub && <small className="muted">{r.sub}</small>}</span>
          <strong className="tabular">{format(r.value)}</strong>
          <div className="cat-bar__track"><span className={r.tone === "red" ? "bg-red" : r.tone === "green" ? "bg-green" : ""} style={{ width: `${Math.min(100, (Math.abs(r.value) / max) * 100)}%`, ...(r.tone ? {} : { background: "linear-gradient(90deg, var(--tool), var(--tool-2))" }) }} /></div>
        </div>
      ))}
    </div>
  );
}

/** Gelir-gider sütun grafiği: [{ key, label, income, expense, net }] */
export function FlowChart({ rows, height = 220 }) {
  if (!rows?.length) return <p className="muted small">Grafik için veri yok.</p>;
  const W = Math.max(600, rows.length * 56);
  const H = height;
  const pad = 26;
  const max = Math.max(1, ...rows.flatMap((r) => [r.income || 0, r.expense || 0]));
  const bw = (W - pad * 2) / rows.length;
  const y = (v) => H - (v / max) * (H - 24);
  const netPts = rows.map((r, i) => `${pad + i * bw + bw / 2},${y(Math.max(0, r.net || 0))}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H + 34}`} className="chart" role="img" aria-label="Gelir ve gider grafiği">
      <defs>
        <linearGradient id="gIn" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#34d399" /><stop offset="1" stopColor="#059669" /></linearGradient>
        <linearGradient id="gOut" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fb7185" /><stop offset="1" stopColor="#e11d48" /></linearGradient>
      </defs>
      {[0.25, 0.5, 0.75, 1].map((f) => <line key={f} x1={pad} x2={W - pad} y1={H - f * (H - 24)} y2={H - f * (H - 24)} className="chart__grid" />)}
      {rows.map((r, i) => {
        const x = pad + i * bw;
        return (
          <g key={r.key}>
            <rect x={x + bw * 0.16} y={y(r.income || 0)} width={bw * 0.32} height={H - y(r.income || 0)} rx="4" className="chart__in"><title>{`${r.label}: gelir ${money(r.income)}`}</title></rect>
            <rect x={x + bw * 0.52} y={y(r.expense || 0)} width={bw * 0.32} height={H - y(r.expense || 0)} rx="4" className="chart__out"><title>{`${r.label}: gider ${money(r.expense)}`}</title></rect>
            <text x={x + bw / 2} y={H + 16} textAnchor="middle" className="chart__label">{r.label}</text>
            <text x={x + bw / 2} y={H + 30} textAnchor="middle" className={`chart__net ${(r.net || 0) >= 0 ? "is-pos" : "is-neg"}`}>{r.net ? `${r.net > 0 ? "+" : "−"}${Math.abs(r.net) >= 1000 ? `${Math.round(Math.abs(r.net) / 1000)}b` : Math.round(Math.abs(r.net))}` : ""}</text>
          </g>
        );
      })}
      <polyline points={netPts} className="chart__line" opacity="0.5" />
    </svg>
  );
}

export const Legend = () => (
  <div className="legend"><span><i style={{ background: "#10b981" }} />Gelir</span><span><i style={{ background: "#e11d48" }} />Gider</span><span className="muted">Alttaki sayı: net</span></div>
);

/* ------------------------------ hesaplar ------------------------------ */

export const useAccounts = () => useResource("/api/finance/accounts");

/** Kapsama göre gruplanmış hesap seçici seçenekleri. */
export function AccountSelect({ accounts, value, onChange, exclude, label }) {
  const groups = useMemo(() => ["personal", "city", "national"].map((scope) => ({ scope, items: accounts.filter((a) => a.scope === scope && a.can_manage && !a.archived && String(a.id) !== String(exclude)) })).filter((g) => g.items.length), [accounts, exclude]);
  return (
    <Field label={label}>
      <select value={value || ""} onChange={(e) => onChange(e.target.value)}>
        <option value="">Hesap seçin…</option>
        {groups.map((g) => (
          <optgroup key={g.scope} label={SCOPE_LABEL[g.scope]}>
            {g.items.map((a) => <option key={a.id} value={a.id}>{a.name}{a.city_name ? ` · ${a.city_name}` : ""} — {money(a.balance)}</option>)}
          </optgroup>
        ))}
      </select>
    </Field>
  );
}

export function TransferDialog({ accounts, transfer, defaults = {}, onClose, onSaved }) {
  const result = useResult();
  const [form, setForm] = useState({
    from_account_id: String(transfer?.from_account_id || defaults.from || ""),
    to_account_id: String(transfer?.to_account_id || defaults.to || ""),
    amount: transfer ? String(transfer.amount).replace(".", ",") : "",
    date: transfer?.transfer_date || isoDay(),
    note: transfer?.note || "",
  });
  const [busy, setBusy] = useState(false);
  const from = accounts.find((a) => String(a.id) === form.from_account_id);
  const to = accounts.find((a) => String(a.id) === form.to_account_id);
  const amount = parseAmount(form.amount);
  const save = async (e) => {
    e?.preventDefault();
    if (!from || !to || !(amount > 0)) return;
    setBusy(true);
    const body = { from_account_id: Number(form.from_account_id), to_account_id: Number(form.to_account_id), amount, date: form.date, note: form.note || null };
    const res = transfer ? await patch(`/api/finance/transfers/${transfer.id}`, body) : await post("/api/finance/transfers", body, { queue: false });
    setBusy(false);
    if (result(res, transfer ? "Virman güncellendi." : `${from.name} → ${to.name}: ${money(amount)} aktarıldı.`)) onSaved();
  };
  return (
    <Modal title={transfer ? "Virmanı düzenle" : "Hesaplar arası aktarma (virman)"} onClose={onClose} width={560} footer={<>
      <button type="button" className="btn" onClick={onClose}>Vazgeç</button>
      <button type="submit" form="transfer-form" className="btn btn--primary" disabled={busy || !from || !to || !(amount > 0)}><Icon name="swap" /> {busy ? "Aktarılıyor…" : "Aktar"}</button>
    </>}>
      <form id="transfer-form" className="form-grid" onSubmit={save}>
        <AccountSelect accounts={accounts} value={form.from_account_id} onChange={(v) => setForm({ ...form, from_account_id: v })} exclude={form.to_account_id} label="Kaynak hesap" />
        <AccountSelect accounts={accounts} value={form.to_account_id} onChange={(v) => setForm({ ...form, to_account_id: v })} exclude={form.from_account_id} label="Hedef hesap" />
        <Field label="Tutar (₺)"><input className="money-input" autoFocus inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0,00" /></Field>
        <Field label="Tarih"><input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
        <Field label="Açıklama" className="span2"><input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="örn. Kasım il payı merkeze" /></Field>
        {from && to && amount > 0 && (
          <div className="transfer-preview span2">
            <div><small>{from.name}</small><strong>{money(from.balance)}</strong><em className="text-red">→ {money(from.balance - amount)}</em></div>
            <Icon name="chevronRight" size={22} />
            <div><small>{to.name}</small><strong>{money(to.balance)}</strong><em className="text-green">→ {money(to.balance + amount)}</em></div>
          </div>
        )}
      </form>
    </Modal>
  );
}

/** Bir muhasebe sisteminin üstünde: o kapsamın hesapları ve bakiyeleri. */
export function AccountStrip({ accounts, scope, cityId, onTransfer, onManage }) {
  const list = accounts.filter((a) => a.scope === scope && !a.archived && (scope !== "city" || !cityId || Number(a.city_id) === Number(cityId)));
  return (
    <div className="account-strip">
      {list.map((a) => (
        <div key={a.id} className="account-chip" style={{ "--ac": a.color || "#7c3aed" }}>
          <span className="account-chip__icon"><Icon name={ACCOUNT_KINDS[a.kind]?.icon || "wallet"} size={14} /></span>
          <span><small>{a.name}{a.linked_method ? " · bağlı" : ""}</small><strong className={a.balance < 0 ? "text-red" : ""}>{money(a.balance)}</strong></span>
        </div>
      ))}
      {!list.length && <span className="muted small">Bu defter için tanımlı kasa/banka hesabı yok.</span>}
      <span className="spacer" />
      <button type="button" className="btn btn--sm btn--soft" onClick={onTransfer}><Icon name="swap" /> Virman</button>
      <button type="button" className="btn btn--sm btn--ghost" onClick={onManage}><Icon name="bank" /> Hesaplar</button>
    </div>
  );
}
