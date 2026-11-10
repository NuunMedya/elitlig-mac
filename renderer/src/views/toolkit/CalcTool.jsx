// Hızlı hesap + birim / para çevirici. Tek satır: "12*(4+3)", "5 km mi", "100 usd tl", "72 f c".
// Döviz kurları ana süreçte önbelleklenir (çevrimdışıyken son kur kullanılır).
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../../components/ui";
import { CATEGORIES, CURRENCIES, convertCurrency, convertUnit, formatNumber, parseNumber, parseQuery } from "./units";
import { deskkit, useCopy, useStored } from "./toolkitUi";

const plain = (n) => (Number.isFinite(n) ? String(Math.round(n * 1e10) / 1e10).replace(".", ",") : "");

export default function CalcTool() {
  const copy = useCopy();
  const [line, setLine] = useState("");
  const [history, setHistory] = useStored("toolkit.calcHistory", []);
  const [rates, setRates] = useState(null);
  const [ratesBusy, setRatesBusy] = useState(false);
  const inputRef = useRef(null);
  const loadRates = async (force = false) => {
    const dk = deskkit();
    if (!dk) return;
    setRatesBusy(true);
    try { setRates(await dk.rates(force)); } finally { setRatesBusy(false); }
  };
  useEffect(() => { loadRates(false); setTimeout(() => inputRef.current?.focus(), 50); }, []);
  const rateTable = rates?.ok ? rates.rates : null;
  const res = useMemo(() => parseQuery(line, rateTable), [line, rateTable]);
  const resultText = res?.kind === "convert" ? formatNumber(res.result) : res?.kind === "calc" ? res.label : "";
  const resultRaw = res?.kind === "convert" ? plain(res.result) : res?.kind === "calc" ? plain(res.value) : "";

  const commit = () => {
    if (!res || res.kind === "error") return;
    const entry = { q: line.trim(), a: res.kind === "convert" ? res.label : `${line.trim()} = ${res.label}` };
    setHistory((h) => [entry, ...h.filter((x) => x.q !== entry.q)].slice(0, 8));
    copy(resultRaw, `${resultText} kopyalandı`);
  };

  return (
    <div className="tk-calc">
      <form className="tk-calc__line" onSubmit={(e) => { e.preventDefault(); commit(); }}>
        <input ref={inputRef} value={line} onChange={(e) => setLine(e.target.value)} placeholder="12*(4+3) · 5 km mi · 100 usd tl · 72 f c" aria-label="Hesap ya da çeviri" spellCheck={false} />
        <output className={`tk-calc__out${res?.kind === "error" ? " is-err" : ""}`} aria-live="polite">{res?.kind === "error" ? res.message : resultText ? `= ${resultText}${res.kind === "convert" ? ` ${res.to}` : ""}` : ""}</output>
      </form>
      <p className="tk-note"><Icon name="info" size={12} /> Enter: sonucu kopyala. Yüzde: “200*18%”. Birim adları Türkçe de olur: “3 saat dk”, “2 dönüm m2”.</p>
      {history.length > 0 && (
        <section className="tk-sub">
          <div className="tk-sub__head"><h4>Son hesaplar</h4><button type="button" className="link-btn" onClick={() => setHistory([])}>Temizle</button></div>
          <ul className="tk-history">{history.map((h) => <li key={h.q}><button type="button" onClick={() => setLine(h.q)} title="Yeniden yaz">{h.a}</button></li>)}</ul>
        </section>
      )}
      <Converter rates={rates} ratesBusy={ratesBusy} onRefresh={() => loadRates(true)} copy={copy} />
    </div>
  );
}

function Converter({ rates, ratesBusy, onRefresh, copy }) {
  const [cat, setCat] = useStored("toolkit.convCat", "currency");
  const [pairs, setPairs] = useStored("toolkit.convPairs", {});
  const [value, setValue] = useState("1");
  const isCur = cat === "currency";
  const category = CATEGORIES.find((c) => c.key === cat);
  const options = isCur ? CURRENCIES.map((c) => ({ key: c.code, label: `${c.code} · ${c.label}` })) : Object.entries(category?.units || {}).map(([k, u]) => ({ key: k, label: u.label }));
  const def = isCur ? ["USD", "TRY"] : [options[0]?.key, options[1]?.key];
  const [from, to] = pairs[cat] || def;
  const setPair = (a, b) => setPairs((p) => ({ ...p, [cat]: [a, b] }));
  const n = parseNumber(value);
  const out = n == null ? null : isCur ? convertCurrency(n, from, to, rates?.ok ? rates.rates : null) : convertUnit(n, cat, from, to);
  return (
    <section className="tk-sub tk-conv" aria-label="Çevirici">
      <div className="tk-sub__head">
        <h4>Çevirici</h4>
        <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Tür">
          <option value="currency">Para</option>
          {CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
      </div>
      <div className="tk-conv__row">
        <input value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" aria-label="Değer" />
        <select value={from} onChange={(e) => setPair(e.target.value, to)} aria-label="Kaynak birim">{options.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}</select>
      </div>
      <button type="button" className="tk-conv__swap" onClick={() => setPair(to, from)} aria-label="Yer değiştir" title="Yer değiştir"><Icon name="swap" size={14} /></button>
      <div className="tk-conv__row">
        <button type="button" className="tk-conv__out" onClick={() => out != null && copy(plain(out), `${formatNumber(out)} kopyalandı`)} title="Kopyala" disabled={out == null}>{out == null ? "—" : formatNumber(out)}</button>
        <select value={to} onChange={(e) => setPair(from, e.target.value)} aria-label="Hedef birim">{options.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}</select>
      </div>
      {isCur && (
        <p className="tk-note">
          {rates?.ok ? <>Kur: {rates.date || "—"} · {rates.source}{rates.stale ? " · çevrimdışı, son kayıtlı kur" : ""}</> : rates ? rates.error : "Kurlar yükleniyor…"}
          <button type="button" className="link-btn" onClick={onRefresh} disabled={ratesBusy}>{ratesBusy ? "Yenileniyor…" : "Yenile"}</button>
        </p>
      )}
    </section>
  );
}
