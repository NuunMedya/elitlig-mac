// Muhasebe: aylık özet, trend, düzenli ödemeler, bütçe, hesap bakiyeleri, alacak / borç, son hareketler.
import React, { useMemo, useState } from "react";
import { Icon } from "../../../components/ui";
import { patch, post } from "../../../api";
import { formatDate, formatMoney, isoDay } from "../../../lib/helpers";
import { upcomingPayments } from "../../../widgets/widgetModel";
import { refreshData, useData } from "../data";
import { Bar, Big, List, Row, State, Stats, XsButton } from "../parts";

const short = (v) => {
  const n = Math.abs(Number(v) || 0);
  const sign = Number(v) < 0 ? "−" : "";
  if (n >= 1e6) return `${sign}${(n / 1e6).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} mn ₺`;
  if (n >= 1e4) return `${sign}${(n / 1e3).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} bin ₺`;
  return `${sign}${Math.round(n).toLocaleString("tr-TR")} ₺`;
};
const money = (v) => formatMoney(v, 0);
const afterWrite = () => { refreshData("/api/tools"); refreshData("/api/finance"); };

export function BalanceTile({ tier, go, bar }) {
  const q = useData("/api/tools/overview");
  const rec = useData("/api/tools/recurring", null, { enabled: tier === "xl" });
  const l = q.data?.ledger;
  if (tier === "xs") return <XsButton icon="wallet" value={l ? short(l.net) : "–"} label="bu ay net" tone={l && l.net < 0 ? "red" : "green"} wide={bar} onClick={() => go("ledger")} />;
  if (!l) return <State q={q} />;
  if (tier === "s" || bar) {
    return <Big value={short(l.net)} label="bu ay net" tone={l.net >= 0 ? "green" : "red"} sub={`+${short(l.income)} · −${short(l.expense)}`} onClick={() => go("ledger")} />;
  }
  const stats = [
    { label: "Gelir", value: money(l.income), tone: "green", onClick: () => go("ledger") },
    { label: "Gider", value: money(l.expense), tone: "red", onClick: () => go("ledger") },
    { label: "Net", value: money(l.net), tone: l.net >= 0 ? "green" : "red", onClick: () => go("ledger") },
  ];
  if (tier !== "m") stats.push({ label: "Bekleyen alacak", value: money(l.receivable), onClick: () => go("ledger") }, { label: "Bekleyen borç", value: money(l.payable), onClick: () => go("ledger") }, { label: "Vadesi geçen", value: l.overdue, tone: l.overdue ? "red" : "", onClick: () => go("ledger") });
  const r = q.data?.recurring;
  return (
    <State q={q}>
      <Stats items={stats} />
      {r?.count > 0 && tier !== "m" && (
        <button type="button" className={`today-bills${r.overdue ? " is-late" : ""}`} onClick={() => go("ledger:duzenli")}>
          <Icon name="repeat" />
          <span>
            <strong>{r.overdue ? `${r.overdue} geciken düzenli ödeme` : r.due_week ? `7 günde ${r.due_week} ödeme · ${money(r.due_week_amount)}` : "Yaklaşan düzenli ödeme yok"}</strong>
            {r.next && <small>Sıradaki: {r.next.name} · {formatDate(r.next.due_date)}</small>}
          </span>
          <Icon name="chevronRight" size={14} />
        </button>
      )}
      {tier === "xl" && rec.data && <List>{upcomingPayments(rec.data, { days: 30, limit: 4 }).map((p) => <Row key={p.key} icon="repeat" title={p.name} sub={formatDate(p.due)} right={money(p.amount)} tone={p.late ? "red" : ""} onClick={() => go("ledger:duzenli")} />)}</List>}
    </State>
  );
}

export function TrendTile({ tier, go }) {
  const q = useData("/api/tools/ledger");
  const trend = q.data?.trend || [];
  const months = trend.slice(tier === "s" ? -4 : tier === "m" ? -6 : -12);
  const max = Math.max(1, ...months.map((m) => Math.max(m.income, m.expense)));
  return (
    <State q={q} empty={q.data && !trend.length ? "Henüz kayıt yok." : null} emptyIcon="trend">
      <div className="dt-chart" role="img" aria-label="Aylık gelir ve gider">
        {months.map((m) => (
          <button key={m.month} type="button" className="dt-chart__col" onClick={() => go("ledger")} title={`${m.month}: gelir ${money(m.income)}, gider ${money(m.expense)}, net ${money(m.net)}`}>
            <span className="dt-chart__bars"><i className="is-in" style={{ height: `${(m.income / max) * 100}%` }} /><i className="is-out" style={{ height: `${(m.expense / max) * 100}%` }} /></span>
            <small>{new Date(`${m.month}-15`).toLocaleDateString("tr-TR", { month: "short" })}</small>
          </button>
        ))}
      </div>
      {tier !== "s" && <p className="dt-legend"><i className="is-in" /> Gelir <i className="is-out" /> Gider {months.length ? <b className={months.at(-1).net >= 0 ? "text-green" : "text-red"}>Bu ay net {money(months.at(-1).net)}</b> : null}</p>}
    </State>
  );
}

export function RecurringTile({ tier, go, lines, result }) {
  const q = useData("/api/tools/recurring");
  const [busy, setBusy] = useState(null);
  const list = useMemo(() => (q.data ? upcomingPayments(q.data, { days: 30, limit: 20 }) : []), [q.data]);
  const occ = useMemo(() => new Map([...(q.data?.overdue || []), ...(q.data?.occurrences || [])].map((o) => [o.key || `${o.recurring_id}:${o.period}`, o])), [q.data]);
  const late = list.filter((p) => p.late);
  if (tier === "xs") return <XsButton icon="repeat" value={late.length || list.length} label={late.length ? "geciken" : "yaklaşan"} tone={late.length ? "red" : ""} title="Düzenli ödemeler" onClick={() => go("ledger:duzenli")} />;
  if (tier === "s") {
    const p = list[0];
    return <State q={q}><Big value={p ? money(p.amount) : "—"} label={p ? p.name : "Yaklaşan ödeme yok"} sub={p ? `${p.late ? "Gecikti · " : ""}${formatDate(p.due)}` : "30 gün içinde"} tone={p?.late ? "red" : ""} onClick={() => go("ledger:duzenli")} /></State>;
  }
  const act = async (p, kind) => {
    const o = occ.get(p.key);
    if (!o) return;
    setBusy(p.key);
    const res = kind === "pay"
      ? await post(`/api/tools/recurring/${o.recurring_id}/post`, { period: o.period, amount: o.amount, status: "paid", entry_date: isoDay(), method: "cash" }, { queue: false })
      : await post(`/api/tools/recurring/${o.recurring_id}/skip`, { period: o.period, undo: false }, { queue: false });
    setBusy(null);
    if (result(res, kind === "pay" ? `${p.name}: ${o.type === "income" ? "tahsil edildi" : "ödendi"} ve muhasebeye işlendi.` : `${p.name} bu dönem atlandı.`)) { q.reload(); afterWrite(); }
  };
  const big = tier === "l" || tier === "xl";
  const s = q.data?.summary;
  return (
    <State q={q} empty={q.data && !list.length ? "30 gün içinde düzenli ödeme yok." : null} emptyIcon="repeat">
      {big && s && <Stats items={[{ label: "aylık gider", value: short(s.monthly_expense) }, { label: "kalan", value: short(s.remaining_expense) }, { label: "geciken", value: s.overdue_count, tone: s.overdue_count ? "red" : "" }]} />}
      <List>
        {list.slice(0, Math.max(2, lines - (big ? 2 : 0))).map((p) => (
          <Row key={p.key} icon={p.type === "income" ? "arrowDown" : "repeat"} title={p.name} sub={`${p.late ? "Gecikti · " : ""}${formatDate(p.due)}`} right={money(p.amount)} tone={p.late ? "red" : ""} onClick={() => go("ledger:duzenli")}>
            {big && <span className="dt-row__acts">
              <button type="button" className="btn btn--xs btn--primary" disabled={busy === p.key} onClick={() => act(p, "pay")}>{p.type === "income" ? "Tahsil" : "Öde"}</button>
              <button type="button" className="btn btn--xs" disabled={busy === p.key} onClick={() => act(p, "skip")} title="Bu dönemi atla">Atla</button>
            </span>}
          </Row>
        ))}
      </List>
    </State>
  );
}

export function BudgetTile({ tier, go, lines }) {
  const q = useData("/api/tools/budgets");
  const items = (q.data?.items || []).filter((b) => b.type !== "income");
  const t = q.data?.totals;
  const pct = t?.budget ? Math.round((t.spent / t.budget) * 100) : 0;
  if (tier === "xs") return <XsButton icon="target" value={t?.budget ? `%${pct}` : "–"} label="bütçe" tone={pct >= 100 ? "red" : pct >= 80 ? "amber" : ""} onClick={() => go("ledger")} />;
  if (q.data && !items.length) return <State empty="Bu ay bütçe tanımlı değil. Muhasebe → Bütçe'den ekleyin." emptyIcon="target" />;
  if (tier === "s") return <State q={q}><Big value={`%${pct}`} label="bütçe kullanıldı" sub={`${short(t?.spent)} / ${short(t?.budget)}`} tone={pct >= 100 ? "red" : pct >= 80 ? "amber" : ""} onClick={() => go("ledger")}><Bar pct={pct} tone={pct >= 100 ? "red" : pct >= 80 ? "amber" : ""} /></Big></State>;
  const sorted = [...items].sort((a, b) => (b.ratio || 0) - (a.ratio || 0));
  return (
    <State q={q}>
      {tier !== "m" && t && <Stats items={[{ label: "bütçe", value: short(t.budget) }, { label: "harcanan", value: short(t.spent) }, { label: "kalan", value: short(t.remaining), tone: t.remaining < 0 ? "red" : "green" }]} />}
      <ul className="dt-budget">
        {sorted.slice(0, Math.max(2, Math.floor(lines / (tier === "m" ? 1.3 : 1.2)) - (tier !== "m" ? 2 : 0))).map((b) => (
          <li key={b.id}>
            <span><b>{b.category}</b><small>{money(b.actual)} / {money(b.amount)}{b.pending ? ` · +${money(b.pending)} bekleyen` : ""}</small></span>
            <Bar pct={b.ratio} tone={b.ratio >= 100 ? "red" : b.ratio >= 80 ? "amber" : "green"} label={b.category} />
          </li>
        ))}
      </ul>
      {(tier === "xl") && (q.data?.unbudgeted || []).length > 0 && <p className="dt-hint">Bütçesiz: {(q.data.unbudgeted || []).map((u) => `${u.category} ${money(u.actual + (u.pending || 0))}`).join(" · ")}</p>}
    </State>
  );
}

export function AccountsTile({ tier, go, lines }) {
  const q = useData("/api/finance/accounts");
  const items = (q.data?.items || []).filter((a) => !a.archived);
  const total = q.data?.totals?.all ?? items.reduce((s, a) => s + (Number(a.balance) || 0), 0);
  const kinds = new Map((q.data?.kinds || []).map((k) => [k.key, k.label]));
  if (tier === "xs") return <XsButton icon="bank" value={q.data ? short(total) : "–"} label="bakiye" onClick={() => go("ledger")} />;
  if (q.data && !items.length) return <State empty="Hesap yok. Muhasebe → Hesaplar'dan kasa / banka ekleyin." emptyIcon="bank" />;
  if (tier === "s") return <State q={q}><Big value={short(total)} label="toplam bakiye" sub={`${items.length} hesap`} tone={total < 0 ? "red" : ""} onClick={() => go("ledger")} /></State>;
  return (
    <State q={q}>
      {tier !== "m" && <Big value={money(total)} label="toplam bakiye" tone={total < 0 ? "red" : ""} />}
      <List>{items.slice(0, Math.max(2, lines - (tier !== "m" ? 3 : 0))).map((a) => <Row key={a.id} color={a.color || undefined} icon={a.kind === "banka" ? "bank" : a.kind === "kart" ? "wallet" : "box"} title={a.name} sub={`${kinds.get(a.kind) || a.kind}${a.city_name ? ` · ${a.city_name}` : ""}${a.pending?.income || a.pending?.expense ? ` · bekleyen ${money((a.pending.income || 0) - (a.pending.expense || 0))}` : ""}`} right={money(a.balance)} tone={a.balance < 0 ? "red" : ""} onClick={() => go("ledger")} />)}</List>
    </State>
  );
}

export function ReceivablesTile({ tier, go, lines, result }) {
  const q = useData("/api/tools/ledger");
  const [busy, setBusy] = useState(null);
  const today = isoDay();
  const pending = (q.data?.items || []).filter((e) => e.status === "pending").sort((a, b) => String(a.due_date || "9999").localeCompare(String(b.due_date || "9999")));
  const overdue = pending.filter((e) => e.due_date && e.due_date < today);
  const s = q.data?.summary;
  if (tier === "xs") return <XsButton icon="receipt" value={overdue.length || pending.length} label={overdue.length ? "vadesi geçen" : "bekleyen"} tone={overdue.length ? "red" : ""} onClick={() => go("ledger")} />;
  if (tier === "s") return <State q={q}><Big value={short((s?.receivable || 0) - (s?.payable || 0))} label="alacak − borç" sub={`Alacak ${short(s?.receivable)} · Borç ${short(s?.payable)}`} tone={overdue.length ? "red" : ""} onClick={() => go("ledger")} /></State>;
  const settle = async (e) => {
    setBusy(e.id);
    const res = await patch(`/api/tools/ledger/${e.id}`, { status: "paid", entry_date: isoDay() });
    setBusy(null);
    if (result(res, e.type === "income" ? "Tahsil edildi." : "Ödendi.")) { q.reload(); afterWrite(); }
  };
  const big = tier === "l" || tier === "xl";
  return (
    <State q={q} empty={q.data && !pending.length ? "Bekleyen alacak ya da borç yok ✓" : null} emptyIcon="checks">
      <Stats items={[{ label: "alacak", value: short(s?.receivable), tone: "green" }, { label: "borç", value: short(s?.payable), tone: "red" }, { label: "vadesi geçen", value: overdue.length, tone: overdue.length ? "red" : "" }]} />
      <List>
        {pending.slice(0, Math.max(2, lines - 2)).map((e) => {
          const late = e.due_date && e.due_date < today;
          return (
            <Row key={e.id} icon={e.type === "income" ? "arrowDown" : "receipt"} title={e.party || e.description || (e.type === "income" ? "Alacak" : "Borç")} sub={`${e.type === "income" ? "Alacak" : "Borç"}${e.due_date ? ` · vade ${formatDate(e.due_date)}` : ""}${e.document_no ? ` · ${e.document_no}` : ""}`} right={money(e.amount)} tone={late ? "red" : ""} onClick={() => go("ledger")}>
              {big && <span className="dt-row__acts"><button type="button" className="btn btn--xs btn--primary" disabled={busy === e.id} onClick={() => settle(e)}>{e.type === "income" ? "Tahsil edildi" : "Ödendi"}</button></span>}
            </Row>
          );
        })}
      </List>
    </State>
  );
}

export function LedgerListTile({ tier, go, lines }) {
  const q = useData("/api/tools/ledger");
  const [type, setType] = useState("all");
  const items = (q.data?.items || []).filter((e) => type === "all" || e.type === type);
  return (
    <State q={q} empty={q.data && !(q.data.items || []).length ? "Henüz muhasebe kaydı yok." : null} emptyIcon="receipt">
      {tier !== "s" && (
        <div className="dt-chips">
          {[["all", "Tümü"], ["income", "Gelir"], ["expense", "Gider"]].map(([v, l]) => <button key={v} type="button" className={type === v ? "is-on" : ""} onClick={() => setType(v)}>{l}</button>)}
        </div>
      )}
      <List>{items.slice(0, Math.max(2, lines - (tier !== "s" ? 1 : 0))).map((e) => <Row key={e.id} icon={e.type === "income" ? "arrowDown" : "receipt"} title={e.description || e.category || e.party || (e.type === "income" ? "Gelir" : "Gider")} sub={tier === "s" ? null : `${formatDate(e.entry_date)}${e.category ? ` · ${e.category}` : ""}${e.status === "pending" ? " · bekliyor" : ""}`} right={`${e.type === "income" ? "+" : "−"}${money(e.amount)}`} tone={e.type === "income" ? "green" : "red"} onClick={() => go("ledger")} />)}</List>
    </State>
  );
}
