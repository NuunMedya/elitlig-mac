// Finans ve vergi: brüt ↔ net maaş (TR 2026, düzenlenebilir parametre tablosu), fatura / serbest
// meslek (KDV, stopaj, tevkifat), kredi / taksit (ödeme planı). Mantık: ../lib/finance.js.
import React, { useMemo, useState } from "react";
import { Icon, Segmented } from "../../../components/ui";
import { useCopy, useStored } from "../toolkitUi";
import { TAX_2026, WITHHOLDING, grossToNetYear, invoice, loan, netToGross } from "../lib/finance";
import { ExportBar, Field, Results, Table, fmtNum, fmtTl, num } from "./common";

const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

/* ------------------------------- maaş ------------------------------- */

const PARAM_FIELDS = [
  ["minWageGross", "Asgari ücret (brüt, ₺)", 1],
  ["sgkCeiling", "SGK tavanı (₺)", 1],
  ["sgkEmployee", "SGK işçi payı (%)", 100],
  ["unemploymentEmployee", "İşsizlik işçi payı (%)", 100],
  ["stampRate", "Damga vergisi (binde)", 1000],
  ["employerSgk", "SGK işveren payı (%) — tahmini", 100],
  ["employerUnemployment", "İşsizlik işveren payı (%) — tahmini", 100],
];

export function SalaryTool() {
  const copy = useCopy();
  const [mode, setMode] = useStored("tt.salary.mode", "gross");
  const [amount, setAmount] = useStored("tt.salary.amount", "50000");
  const [month, setMonth] = useStored("tt.salary.month", new Date().getMonth() + 1);
  const [custom, setCustom] = useStored("tt.salary.params", {});
  const [showParams, setShowParams] = useState(false);
  const params = useMemo(() => ({ ...TAX_2026, ...custom, brackets: custom.brackets || TAX_2026.brackets }), [custom]);
  const gross = mode === "gross" ? num(amount) : netToGross(num(amount), Number(month), params);
  const year = useMemo(() => grossToNetYear(gross, params), [gross, params]);
  const m = year.months[Number(month) - 1];
  const edited = Object.keys(custom).length > 0;
  const setParam = (key, scale, v) => setCustom({ ...custom, [key]: num(v) / scale });
  const setBracket = (i, field, v) => {
    const b = params.brackets.map((x) => ({ ...x }));
    b[i][field] = field === "rate" ? num(v) / 100 : num(v) || Infinity;
    setCustom({ ...custom, brackets: b });
  };
  const rows = () => [["Ay", "Brüt", "SGK", "İşsizlik", "Gelir vergisi", "Damga", "Net", "Kümülatif matrah", "İşveren maliyeti (tahmini)"], ...year.months.map((x) => [MONTHS[x.month - 1], x.gross, x.sgk, x.unemployment, x.incomeTax, x.stamp, x.net, x.cumBase, x.employerCost]), ["Toplam", year.totals.gross, year.totals.sgk, year.totals.unemployment, year.totals.incomeTax, year.totals.stamp, year.totals.net, "", year.totals.employerCost]];
  return (
    <div className="tt">
      <Segmented value={mode} onChange={setMode} size="sm" ariaLabel="Yön" options={[{ value: "gross", label: "Brütten nete" }, { value: "net", label: "Netten brüte" }]} />
      <div className="tt-cols3">
        <Field label={mode === "gross" ? "Aylık brüt (₺)" : "İstenen aylık net (₺)"}><input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Tutar" /></Field>
        <Field label="Ay"><select value={month} onChange={(e) => setMonth(Number(e.target.value))} aria-label="Ay">{MONTHS.map((n, i) => <option key={n} value={i + 1}>{n}</option>)}</select></Field>
      </div>
      <Results onCopy={copy} items={[
        { label: `${MONTHS[m.month - 1]} neti`, value: fmtTl(m.net), copy: m.net, strong: true },
        { label: "Brüt", value: fmtTl(m.gross), copy: m.gross },
        { label: "SGK + işsizlik", value: fmtTl(m.sgk + m.unemployment) },
        { label: "Gelir vergisi", value: fmtTl(m.incomeTax) },
        { label: "Damga vergisi", value: fmtTl(m.stamp) },
        { label: "İşveren maliyeti (tahmini)", value: fmtTl(m.employerCost) },
        { label: "Yıllık net", value: fmtTl(year.totals.net) },
      ]} />
      <Table rows={[["Ay", "Brüt", "Gelir v.", "Damga", "Net"], ...year.months.map((x) => [MONTHS[x.month - 1], fmtNum(x.gross), fmtNum(x.incomeTax), fmtNum(x.stamp), fmtNum(x.net)])]} highlight={(_, i) => (i + 1 === Number(month) ? "is-top" : "")} />
      <ExportBar title={`Maaş ${fmtNum(gross)} TL brüt (2026)`} rows={rows} />
      <p className="tt-muted">Asgari ücrete isabeden gelir ve damga vergisi istisnası, kümülatif matrah ve SGK tavanı uygulanır. Engellilik indirimi, BES, AGİ benzeri özel durumlar dahil değildir.</p>
      <button type="button" className="link-btn" onClick={() => setShowParams((v) => !v)} style={{ alignSelf: "flex-start" }}><Icon name="sliders" size={12} /> {TAX_2026.year} parametreleri ve kaynaklar{edited ? " (düzenlendi)" : ""}</button>
      {showParams && (
        <div className="tt">
          <div className="tt-cols3">
            {PARAM_FIELDS.map(([key, label, scale]) => (
              <Field key={key} label={label}><input inputMode="decimal" key={`${key}-${params[key]}`} defaultValue={fmtNum(params[key] * scale, 4)} onBlur={(e) => setParam(key, scale, e.target.value)} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} aria-label={label} /></Field>
            ))}
          </div>
          <Table rows={[["Dilim üst sınırı (₺)", "Oran (%)"], ...params.brackets.map((b, i) => [
            b.upTo === Infinity ? "üzeri" : <input key={`u${b.upTo}`} inputMode="decimal" defaultValue={fmtNum(b.upTo, 0)} onBlur={(e) => setBracket(i, "upTo", e.target.value)} aria-label={`${i + 1}. dilim sınırı`} />,
            <input key={`r${b.rate}`} inputMode="decimal" defaultValue={fmtNum(b.rate * 100, 2)} onBlur={(e) => setBracket(i, "rate", e.target.value)} aria-label={`${i + 1}. dilim oranı`} style={{ width: 70 }} />,
          ])]} />
          <ul className="tt-muted" style={{ margin: 0, paddingLeft: 18 }}>{TAX_2026.sources.map((s) => <li key={s}>{s}</li>)}</ul>
          {edited && <button type="button" className="btn btn--sm" onClick={() => setCustom({})} style={{ alignSelf: "flex-start" }}>Resmî 2026 değerlerine dön</button>}
        </div>
      )}
    </div>
  );
}

/* ------------------------------- fatura / makbuz ------------------------------- */

export function InvoiceTool() {
  const copy = useCopy();
  const [o, setO] = useStored("tt.invoice", { amount: "10000", mode: "gross", vat: 20, stopaj: 0, withholding: "0" });
  const set = (p) => setO({ ...o, ...p });
  const r = invoice(num(o.amount), { mode: o.mode, vatRate: Number(o.vat) / 100, stopaj: Number(o.stopaj) / 100, withholding: WITHHOLDING.find((w) => w.key === o.withholding)?.ratio || 0 });
  return (
    <div className="tt">
      <div className="tt-cols3">
        <Field label="Tutar (₺)"><input inputMode="decimal" value={o.amount} onChange={(e) => set({ amount: e.target.value })} aria-label="Tutar" /></Field>
        <Field label="Bu tutar"><select value={o.mode} onChange={(e) => set({ mode: e.target.value })} aria-label="Tutar türü"><option value="gross">KDV hariç brüt</option><option value="net">Elime geçecek net</option><option value="total">KDV dahil toplam</option></select></Field>
        <Field label="KDV"><select value={o.vat} onChange={(e) => set({ vat: Number(e.target.value) })} aria-label="KDV oranı"><option value={20}>%20</option><option value={10}>%10</option><option value={1}>%1</option><option value={0}>%0</option></select></Field>
        <Field label="Stopaj (gelir v. kesintisi)"><select value={o.stopaj} onChange={(e) => set({ stopaj: Number(e.target.value) })} aria-label="Stopaj"><option value={0}>Yok (fatura)</option><option value={20}>%20 (serbest meslek)</option><option value={17}>%17 (telif)</option><option value={15}>%15</option><option value={10}>%10</option></select></Field>
        <Field label="KDV tevkifatı"><select value={o.withholding} onChange={(e) => set({ withholding: e.target.value })} aria-label="Tevkifat">{WITHHOLDING.map((w) => <option key={w.key} value={w.key}>{w.label}</option>)}</select></Field>
      </div>
      <Results onCopy={copy} items={[
        { label: "KDV hariç brüt", value: fmtTl(r.gross), copy: r.gross },
        { label: "KDV", value: fmtTl(r.vat), copy: r.vat },
        { label: "Belge toplamı", value: fmtTl(r.total), copy: r.total, strong: true },
        o.stopaj ? { label: "Stopaj (alıcı öder)", value: fmtTl(r.stopaj) } : null,
        r.withheldVat ? { label: "Tevkif edilen KDV", value: fmtTl(r.withheldVat) } : null,
        { label: "Hesaba geçecek", value: fmtTl(r.netReceived), copy: r.netReceived, strong: true },
      ]} />
      <p className="tt-muted">Serbest meslek makbuzunda: brüt − %20 stopaj + KDV = tahsil edilen. Tevkifatta KDV'nin belirtilen kısmını alıcı doğrudan vergi dairesine öder.</p>
    </div>
  );
}

/* ------------------------------- kredi ------------------------------- */

export function LoanTool() {
  const copy = useCopy();
  const [o, setO] = useStored("tt.loan", { principal: "250000", months: 24, rate: "3,49", kind: "consumer" });
  const set = (p) => setO({ ...o, ...p });
  const r = useMemo(() => loan(num(o.principal), o.months, num(o.rate) / 100, { taxed: o.kind === "consumer" }), [o]);
  return (
    <div className="tt">
      <div className="tt-cols3">
        <Field label="Kredi tutarı (₺)"><input inputMode="decimal" value={o.principal} onChange={(e) => set({ principal: e.target.value })} aria-label="Kredi tutarı" /></Field>
        <Field label="Vade (ay)"><input type="number" min="1" max="360" value={o.months} onChange={(e) => set({ months: Number(e.target.value) })} aria-label="Vade" /></Field>
        <Field label="Aylık faiz (%)"><input inputMode="decimal" value={o.rate} onChange={(e) => set({ rate: e.target.value })} aria-label="Aylık faiz" /></Field>
        <Field label="Kredi türü"><select value={o.kind} onChange={(e) => set({ kind: e.target.value })} aria-label="Kredi türü"><option value="consumer">İhtiyaç / taşıt (BSMV %15 + KKDF %15)</option><option value="housing">Konut / ticari vergisiz</option></select></Field>
      </div>
      <Results onCopy={copy} items={[
        { label: "Aylık taksit", value: fmtTl(r.payment), copy: r.payment, strong: true },
        { label: "Toplam geri ödeme", value: fmtTl(r.total) },
        { label: "Toplam faiz", value: fmtTl(r.interest) },
        { label: "BSMV + KKDF", value: fmtTl(r.taxes) },
      ]} />
      <Table rows={[["No", "Taksit", "Faiz", "Vergi", "Anapara", "Kalan"], ...r.schedule.map((x) => [x.no, fmtNum(x.payment), fmtNum(x.interest), fmtNum(x.tax), fmtNum(x.principal), fmtNum(x.balance)])]} />
      <ExportBar title="Kredi ödeme planı" rows={() => [["No", "Taksit", "Faiz", "Vergi", "Anapara", "Kalan"], ...r.schedule.map((x) => [x.no, x.payment, x.interest, x.tax, x.principal, x.balance])]} />
      <p className="tt-muted">Dosya masrafı ve sigorta dahil değildir; bankanın ödeme planı küçük yuvarlama farkları gösterebilir.</p>
    </div>
  );
}
