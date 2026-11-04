// Hesap Araçları: KDV, yüzde, iskonto zinciri, masraf bölüştürme, taksit,
// tarih farkı ve klavyeyle kullanılan hesap makinesi (geçmişiyle).
import React, { useState } from "react";
import { Field, Icon, ViewHeader } from "../components/ui";
import { addDaysIso, dateDiff, discountChain, evaluate, installment, num, percentChange, percentOf, ratioPercent, splitCost, vat } from "../lib/calcUtils";
import { formatMoney, isoDay } from "../lib/helpers";

const fmt = (n, d = 2) => new Intl.NumberFormat("tr-TR", { maximumFractionDigits: d }).format(Number(n) || 0);
const copy = (value) => navigator.clipboard.writeText(String(value));
const Result = ({ label, value, strong }) => (
  <button type="button" className={`calc-result ${strong ? "is-strong" : ""}`} onClick={() => copy(value)} title="Kopyalamak için tıklayın">
    <span>{label}</span><strong>{value}</strong>
  </button>
);

export default function Calculators() {
  return (
    <div className="view">
      <ViewHeader icon="calculator" title="Hesap Araçları" subtitle="Sonuçlara tıklayınca panoya kopyalanır." />
      <div className="calc-grid">
        <Calculator />
        <VatCard />
        <PercentCard />
        <SplitCard />
        <DiscountCard />
        <InstallmentCard />
        <DateCard />
      </div>
    </div>
  );
}

function Calculator() {
  const [expr, setExpr] = useState("");
  const [history, setHistory] = useState(() => { try { return JSON.parse(localStorage.getItem("calc:history") || "[]"); } catch { return []; } });
  const value = evaluate(expr);
  const commit = () => {
    if (value == null || !expr.trim()) return;
    const next = [{ expr, value }, ...history].slice(0, 12);
    setHistory(next);
    try { localStorage.setItem("calc:history", JSON.stringify(next)); } catch { /* yoksay */ }
    setExpr(String(value).replace(".", ","));
  };
  const keys = ["7", "8", "9", "÷", "4", "5", "6", "×", "1", "2", "3", "−", "0", ",", "%", "+"];
  return (
    <section className="card calc-card calc-card--tall">
      <h3 className="card__title"><Icon name="calculator" /> Hesap makinesi</h3>
      <input className="calc-display" value={expr} onChange={(e) => setExpr(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === "=") { e.preventDefault(); commit(); } if (e.key === "Escape") setExpr(""); }} placeholder="örn. 1250 × 3 + %18" aria-label="İşlem" />
      <div className="calc-preview">{value != null && expr ? `= ${fmt(value, 10)}` : " "}</div>
      <div className="calc-keys">
        {keys.map((k) => <button key={k} type="button" onClick={() => setExpr(expr + k)}>{k}</button>)}
        <button type="button" onClick={() => setExpr(expr.slice(0, -1))}>⌫</button>
        <button type="button" onClick={() => setExpr(expr + "(")}>(</button>
        <button type="button" onClick={() => setExpr(expr + ")")}>)</button>
        <button type="button" className="is-primary" onClick={commit}>=</button>
      </div>
      {history.length > 0 && (
        <ul className="calc-history">
          {history.map((h, i) => <li key={i}><button type="button" onClick={() => setExpr(String(h.value).replace(".", ","))}><span>{h.expr}</span><strong>{fmt(h.value, 10)}</strong></button></li>)}
        </ul>
      )}
    </section>
  );
}

function VatCard() {
  const [amount, setAmount] = useState("");
  const [rate, setRate] = useState("20");
  const [mode, setMode] = useState("exclude");
  const r = vat(amount, rate, mode);
  return (
    <section className="card calc-card">
      <h3 className="card__title">KDV</h3>
      <div className="form-grid">
        <Field label="Tutar"><input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" /></Field>
        <Field label="Oran"><select value={rate} onChange={(e) => setRate(e.target.value)}>{["0", "1", "10", "20"].map((x) => <option key={x} value={x}>%{x}</option>)}</select></Field>
        <Field label="Tutar" className="span2"><select value={mode} onChange={(e) => setMode(e.target.value)}><option value="exclude">KDV hariç (üstüne ekle)</option><option value="include">KDV dahil (içinden ayır)</option></select></Field>
      </div>
      <Result label="Matrah" value={formatMoney(r.net)} /><Result label="KDV" value={formatMoney(r.vat)} /><Result label="Toplam" value={formatMoney(r.gross)} strong />
    </section>
  );
}

function PercentCard() {
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  return (
    <section className="card calc-card">
      <h3 className="card__title">Yüzde</h3>
      <div className="form-grid">
        <Field label="A"><input inputMode="decimal" value={a} onChange={(e) => setA(e.target.value)} /></Field>
        <Field label="B"><input inputMode="decimal" value={b} onChange={(e) => setB(e.target.value)} /></Field>
      </div>
      <Result label={`B'nin %A'sı`} value={fmt(percentOf(a, b))} />
      <Result label="A, B'nin yüzde kaçı" value={`%${fmt(ratioPercent(a, b))}`} />
      <Result label="A → B değişim" value={`%${fmt(percentChange(a, b))}`} strong />
    </section>
  );
}

function SplitCard() {
  const [total, setTotal] = useState("");
  const [people, setPeople] = useState("14");
  const [step, setStep] = useState("5");
  const r = splitCost(total, people, step);
  return (
    <section className="card calc-card">
      <h3 className="card__title">Masraf bölüştürme <small className="muted">saha, hakem, aidat</small></h3>
      <div className="form-grid">
        <Field label="Toplam tutar"><input inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} /></Field>
        <Field label="Kişi sayısı"><input inputMode="numeric" value={people} onChange={(e) => setPeople(e.target.value)} /></Field>
        <Field label="Yukarı yuvarla" className="span2"><select value={step} onChange={(e) => setStep(e.target.value)}><option value="0">Yuvarlama yok</option><option value="1">1 ₺</option><option value="5">5 ₺</option><option value="10">10 ₺</option><option value="50">50 ₺</option></select></Field>
      </div>
      <Result label="Kişi başı" value={formatMoney(r.perPerson)} strong />
      <Result label="Toplanan" value={formatMoney(r.collected)} />
      <Result label="Artan (kasaya)" value={formatMoney(r.surplus)} />
    </section>
  );
}

function DiscountCard() {
  const [price, setPrice] = useState("");
  const [rates, setRates] = useState("10, 5");
  const [mode, setMode] = useState("discount");
  const r = discountChain(price, rates.split(/[,;+ ]+/).filter(Boolean), mode);
  return (
    <section className="card calc-card">
      <h3 className="card__title">İskonto / zam zinciri</h3>
      <div className="form-grid">
        <Field label="Fiyat"><input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} /></Field>
        <Field label="Oranlar (%)"><input value={rates} onChange={(e) => setRates(e.target.value)} placeholder="10, 5" /></Field>
        <Field label="İşlem" className="span2"><select value={mode} onChange={(e) => setMode(e.target.value)}><option value="discount">İskonto</option><option value="markup">Zam</option></select></Field>
      </div>
      <Result label="Sonuç" value={formatMoney(r.final)} strong /><Result label="Fark" value={formatMoney(r.difference)} /><Result label="Etkin oran" value={`%${fmt(Math.abs(r.effectiveRate))}`} />
    </section>
  );
}

function InstallmentCard() {
  const [p, setP] = useState("");
  const [n, setN] = useState("6");
  const [i, setI] = useState("0");
  const r = installment(p, n, i);
  return (
    <section className="card calc-card">
      <h3 className="card__title">Taksit</h3>
      <div className="form-grid">
        <Field label="Tutar"><input inputMode="decimal" value={p} onChange={(e) => setP(e.target.value)} /></Field>
        <Field label="Ay"><input inputMode="numeric" value={n} onChange={(e) => setN(e.target.value)} /></Field>
        <Field label="Aylık faiz (%)" className="span2"><input inputMode="decimal" value={i} onChange={(e) => setI(e.target.value)} /></Field>
      </div>
      <Result label="Aylık" value={formatMoney(r.monthly)} strong /><Result label="Toplam" value={formatMoney(r.total)} /><Result label="Faiz" value={formatMoney(r.interest)} />
    </section>
  );
}

function DateCard() {
  const [from, setFrom] = useState(isoDay());
  const [to, setTo] = useState(isoDay(new Date(Date.now() + 30 * 86400000)));
  const [days, setDays] = useState("30");
  const r = dateDiff(from, to);
  return (
    <section className="card calc-card">
      <h3 className="card__title">Tarih</h3>
      <div className="form-grid">
        <Field label="Başlangıç"><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="Bitiş"><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
      </div>
      {r && <><Result label="Gün" value={fmt(r.days, 0)} strong /><Result label="İş günü" value={fmt(r.workdays, 0)} /><Result label="Hafta" value={fmt(r.weeks)} /></>}
      <div className="form-grid">
        <Field label="Başlangıca gün ekle"><input inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} /></Field>
        <Result label="Tarih" value={addDaysIso(from, num(days)) ? new Date(`${addDaysIso(from, num(days))}T12:00:00`).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric", weekday: "short" }) : "—"} />
      </div>
    </section>
  );
}
