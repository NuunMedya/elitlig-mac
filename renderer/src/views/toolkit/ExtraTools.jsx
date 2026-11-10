// Araç takımına eklenen pratik araçlar: emoji / özel karakter, dolgu metni, JSON, Base64 / URL,
// UUID, tarih farkı / iş günü / geri sayım, yüzde / KDV. Hepsi yerel çalışır (ağ yok).
import React, { useEffect, useMemo, useState } from "react";
import { Icon } from "../../components/ui";
import { CHAR_GROUPS, codePoints, searchChars } from "./chars";
import { addToDate, countdown, dateDiff, dayKey, parseDay, weekdayName } from "./dateTools";
import { base64Decode, base64Encode, formatJson, htmlEscape, htmlUnescape, lorem, parseTrNumber, percentOps, urlDecode, urlEncode, uuidV4, vat } from "./devTools";
import { useCopy, useStored } from "./toolkitUi";

const fmt = (n, d = 2) => (n == null || !Number.isFinite(n) ? "—" : n.toLocaleString("tr-TR", { maximumFractionDigits: d }));

/* ------------------------------ karakterler ------------------------------ */

export function CharsTool() {
  const copy = useCopy();
  const [group, setGroup] = useStored("toolkit.charGroup", "tr");
  const [q, setQ] = useState("");
  const [recent, setRecent] = useStored("toolkit.charRecent", []);
  const [buffer, setBuffer] = useState("");
  const list = q.trim() ? searchChars(q) : (CHAR_GROUPS.find((g) => g.key === group) || CHAR_GROUPS[0]).items;
  const pick = (c) => {
    copy(c, `${c} kopyalandı`);
    setBuffer((b) => (b + c).slice(-200));
    setRecent((r) => [c, ...r.filter((x) => x !== c)].slice(0, 16));
  };
  return (
    <div className="tk-chars">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ara: lira, onay, kupa, ğ…" aria-label="Karakter ara" />
      {!q.trim() && (
        <div className="tk-chips" role="tablist" aria-label="Gruplar">
          {CHAR_GROUPS.map((g) => <button key={g.key} type="button" role="tab" aria-selected={group === g.key} className={`tk-chip${group === g.key ? " is-on" : ""}`} onClick={() => setGroup(g.key)}>{g.label}</button>)}
        </div>
      )}
      <div className="tk-chars__grid" role="list">
        {list.map(([c, name]) => (
          <button key={c + name} type="button" role="listitem" className="tk-char" onClick={() => pick(c)} title={`${name} · ${codePoints(c)} — tıkla: kopyala`} aria-label={`${c} ${name}`}>{c}</button>
        ))}
        {!list.length && <p className="muted">Sonuç yok.</p>}
      </div>
      {recent.length > 0 && (
        <section className="tk-sub">
          <div className="tk-sub__head"><h4>Son kullanılanlar</h4><button type="button" className="link-btn" onClick={() => setRecent([])}>Temizle</button></div>
          <div className="tk-chars__grid is-recent">{recent.map((c) => <button key={c} type="button" className="tk-char" onClick={() => pick(c)} aria-label={c}>{c}</button>)}</div>
        </section>
      )}
      <div className="tk-inline">
        <input value={buffer} onChange={(e) => setBuffer(e.target.value)} placeholder="Tıkladıkça burada birikir…" aria-label="Biriken karakterler" />
        <button type="button" className="btn btn--sm btn--primary" onClick={() => copy(buffer, "Metin kopyalandı")} disabled={!buffer}><Icon name="copy" size={12} /> Kopyala</button>
      </div>
    </div>
  );
}

/* ------------------------------ dolgu metni ------------------------------ */

export function LoremTool() {
  const copy = useCopy();
  const [opts, setOpts] = useStored("toolkit.lorem", { unit: "paragraphs", count: 3, lang: "latin", classic: true });
  const [seed, setSeed] = useState(() => Date.now());
  const text = useMemo(() => lorem({ ...opts, seed }), [opts, seed]);
  const set = (p) => setOpts((o) => ({ ...o, ...p }));
  return (
    <div className="tk-text">
      <div className="tk-form-row">
        <input type="number" min={1} max={opts.unit === "words" ? 2000 : 50} value={opts.count} onChange={(e) => set({ count: Number(e.target.value) || 1 })} aria-label="Adet" style={{ width: 80 }} />
        <select value={opts.unit} onChange={(e) => set({ unit: e.target.value })} aria-label="Birim">
          <option value="paragraphs">paragraf</option><option value="sentences">cümle</option><option value="words">sözcük</option>
        </select>
        <select value={opts.lang} onChange={(e) => set({ lang: e.target.value })} aria-label="Dil">
          <option value="latin">Lorem ipsum (Latince)</option><option value="tr">Türkçe örnek metin</option>
        </select>
      </div>
      {opts.lang === "latin" && <label className="tk-check"><input type="checkbox" checked={opts.classic} onChange={(e) => set({ classic: e.target.checked })} /> “Lorem ipsum dolor sit amet…” ile başlasın</label>}
      <textarea readOnly value={text} aria-label="Üretilen metin" style={{ minHeight: 160 }} />
      <div className="tk-text__bar">
        <button type="button" className="btn btn--sm btn--primary" onClick={() => copy(text, "Dolgu metni kopyalandı")}><Icon name="copy" size={12} /> Kopyala</button>
        <button type="button" className="btn btn--sm" onClick={() => setSeed(Date.now())}><Icon name="refresh" size={12} /> Yenile</button>
        <span className="tk-note">{text.split(/\s+/).filter(Boolean).length} sözcük · {text.length} karakter</span>
      </div>
    </div>
  );
}

/* ------------------------------ JSON ------------------------------ */

export function JsonTool() {
  const copy = useCopy();
  const [input, setInput] = useStored("toolkit.json", "");
  const [opts, setOpts] = useStored("toolkit.jsonOpts", { indent: 2, sortKeys: false });
  const [out, setOut] = useState(null);
  const run = (mode) => {
    const r = formatJson(input, { mode, indent: opts.indent, sortKeys: opts.sortKeys });
    setOut(r);
    if (r.ok) setInput(r.text);
  };
  const live = useMemo(() => (input.trim() ? formatJson(input) : null), [input]);
  return (
    <div className="tk-text">
      <textarea value={input} onChange={(e) => { setInput(e.target.value); setOut(null); }} placeholder='{"takım": "Elitlig", "puan": 21}' aria-label="JSON" spellCheck={false} className="is-mono" style={{ minHeight: 170 }} />
      <div className="tk-text__bar">
        <button type="button" className="btn btn--sm btn--primary" onClick={() => run("pretty")} disabled={!input.trim()}>Biçimle</button>
        <button type="button" className="btn btn--sm" onClick={() => run("minify")} disabled={!input.trim()}>Sıkıştır</button>
        <select value={opts.indent} onChange={(e) => setOpts((o) => ({ ...o, indent: e.target.value === "tab" ? "tab" : Number(e.target.value) }))} aria-label="Girinti">
          <option value={2}>2 boşluk</option><option value={4}>4 boşluk</option><option value="tab">Sekme</option>
        </select>
        <label className="tk-check"><input type="checkbox" checked={opts.sortKeys} onChange={(e) => setOpts((o) => ({ ...o, sortKeys: e.target.checked }))} /> Anahtarları sırala</label>
        <button type="button" className="btn btn--sm btn--ghost" onClick={() => copy(input, "JSON kopyalandı")} disabled={!input}><Icon name="copy" size={12} /> Kopyala</button>
      </div>
      {(out || live) && ((out || live).ok
        ? <p className="tk-ok" role="status"><Icon name="check" size={12} /> Geçerli JSON · {(out || live).stats.keys} anahtar · derinlik {(out || live).stats.depth} · {(out || live).stats.bytes.toLocaleString("tr-TR")} bayt</p>
        : <p className="tk-err" role="alert">{(out || live).error}</p>)}
    </div>
  );
}

/* ------------------------------ kodlayıcı ------------------------------ */

const CODECS = [
  { key: "b64", label: "Base64", enc: (t, o) => ({ ok: true, text: base64Encode(t, { urlSafe: o.urlSafe }) }), dec: (t) => base64Decode(t) },
  { key: "url", label: "URL", enc: (t) => ({ ok: true, text: urlEncode(t) }), dec: (t) => urlDecode(t) },
  { key: "html", label: "HTML", enc: (t) => ({ ok: true, text: htmlEscape(t) }), dec: (t) => ({ ok: true, text: htmlUnescape(t) }) },
];

export function EncodeTool() {
  const copy = useCopy();
  const [codec, setCodec] = useStored("toolkit.codec", "b64");
  const [text, setText] = useStored("toolkit.codecText", "");
  const [urlSafe, setUrlSafe] = useState(false);
  const [res, setRes] = useState(null);
  const c = CODECS.find((x) => x.key === codec) || CODECS[0];
  const run = (dir) => { const r = dir === "enc" ? c.enc(text, { urlSafe }) : c.dec(text); setRes(r); };
  return (
    <div className="tk-text">
      <div className="tk-chips" role="tablist" aria-label="Kodlama">
        {CODECS.map((x) => <button key={x.key} type="button" role="tab" aria-selected={codec === x.key} className={`tk-chip${codec === x.key ? " is-on" : ""}`} onClick={() => { setCodec(x.key); setRes(null); }}>{x.label}</button>)}
      </div>
      <textarea value={text} onChange={(e) => { setText(e.target.value); setRes(null); }} placeholder="Metin ya da kodlanmış değer…" aria-label="Girdi" spellCheck={false} className="is-mono" />
      <div className="tk-text__bar">
        <button type="button" className="btn btn--sm btn--primary" onClick={() => run("enc")} disabled={!text}>Kodla</button>
        <button type="button" className="btn btn--sm" onClick={() => run("dec")} disabled={!text}>Çöz</button>
        {codec === "b64" && <label className="tk-check"><input type="checkbox" checked={urlSafe} onChange={(e) => setUrlSafe(e.target.checked)} /> URL güvenli</label>}
      </div>
      {res && (res.ok ? (
        <div className="tk-result">
          <pre aria-label="Sonuç">{res.text}</pre>
          <div className="tk-text__bar">
            <button type="button" className="btn btn--sm btn--primary" onClick={() => copy(res.text, "Sonuç kopyalandı")}><Icon name="copy" size={12} /> Kopyala</button>
            <button type="button" className="btn btn--sm btn--ghost" onClick={() => { setText(res.text); setRes(null); }}><Icon name="arrowDown" size={12} /> Girdiye al</button>
          </div>
        </div>
      ) : <p className="tk-err" role="alert">{res.error}</p>)}
    </div>
  );
}

/* ------------------------------ UUID ------------------------------ */

export function UuidTool() {
  const copy = useCopy();
  const [opts, setOpts] = useStored("toolkit.uuid", { count: 5, upper: false, hyphens: true });
  const [seed, setSeed] = useState(0);
  const list = useMemo(() => Array.from({ length: Math.max(1, Math.min(50, opts.count)) }, () => {
    let u = uuidV4();
    if (!opts.hyphens) u = u.replace(/-/g, "");
    return opts.upper ? u.toUpperCase() : u;
  }), [opts, seed]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (p) => setOpts((o) => ({ ...o, ...p }));
  return (
    <div className="tk-text">
      <div className="tk-form-row">
        <input type="number" min={1} max={50} value={opts.count} onChange={(e) => set({ count: Number(e.target.value) || 1 })} aria-label="Adet" style={{ width: 80 }} />
        <label className="tk-check"><input type="checkbox" checked={opts.upper} onChange={(e) => set({ upper: e.target.checked })} /> BÜYÜK harf</label>
        <label className="tk-check"><input type="checkbox" checked={opts.hyphens} onChange={(e) => set({ hyphens: e.target.checked })} /> Tireli</label>
      </div>
      <ul className="tk-uuids">{list.map((u) => <li key={u}><button type="button" onClick={() => copy(u, "UUID kopyalandı")} title="Kopyala">{u}</button></li>)}</ul>
      <div className="tk-text__bar">
        <button type="button" className="btn btn--sm btn--primary" onClick={() => copy(list.join("\n"), `${list.length} UUID kopyalandı`)}><Icon name="copy" size={12} /> Hepsini kopyala</button>
        <button type="button" className="btn btn--sm" onClick={() => setSeed((s) => s + 1)}><Icon name="refresh" size={12} /> Yenile</button>
      </div>
      <p className="tk-note"><Icon name="shield" size={12} /> Sürüm 4 (rastgele) UUID, tarayıcının güvenli rastgele üreteciyle.</p>
    </div>
  );
}

/* ------------------------------ tarih ------------------------------ */

const today = () => dayKey(new Date());
const pretty = (s) => { const d = parseDay(s); return d ? `${d.toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" })} ${weekdayName(d)}` : "—"; };

export function DateTool() {
  const [mode, setMode] = useStored("toolkit.dateMode", "diff");
  return (
    <div className="tk-text">
      <div className="tk-chips" role="tablist" aria-label="Tarih aracı">
        {[["diff", "İki tarih arası"], ["add", "Gün / iş günü ekle"], ["countdown", "Geri sayım"]].map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={mode === k} className={`tk-chip${mode === k ? " is-on" : ""}`} onClick={() => setMode(k)}>{l}</button>
        ))}
      </div>
      {mode === "diff" && <DateDiff />}
      {mode === "add" && <DateAdd />}
      {mode === "countdown" && <Countdown />}
    </div>
  );
}

function HolidayOpts({ opts, set }) {
  return (
    <div className="tk-form-row">
      <label className="tk-check"><input type="checkbox" checked={opts.religiousOn} onChange={(e) => set({ religiousOn: e.target.checked })} /> Dini bayramlar tatil</label>
      <label className="tk-check"><input type="checkbox" checked={opts.saturdayWork} onChange={(e) => set({ saturdayWork: e.target.checked })} /> Cumartesi iş günü</label>
    </div>
  );
}

function DateDiff() {
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(() => dayKey(new Date(Date.now() + 30 * 86400000)));
  const [opts, setOpts] = useStored("toolkit.dateOpts", { religiousOn: true, saturdayWork: false });
  const d = dateDiff(from, to, opts);
  return (
    <>
      <div className="tk-form-row">
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Başlangıç" />
        <Icon name="chevronRight" size={14} />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Bitiş" />
      </div>
      <HolidayOpts opts={opts} set={(p) => setOpts((o) => ({ ...o, ...p }))} />
      {d ? (
        <>
          <dl className="tk-stats">
            <div><dt>Takvim günü</dt><dd>{d.days.toLocaleString("tr-TR")}</dd></div>
            <div><dt>İş günü</dt><dd>{d.workDays.toLocaleString("tr-TR")}</dd></div>
            <div><dt>Hafta</dt><dd>{d.weeks}{d.weekDays ? ` + ${d.weekDays} g` : ""}</dd></div>
          </dl>
          <p className="tk-note">{d.years ? `${d.years} yıl ` : ""}{d.months ? `${d.months} ay ` : ""}{d.restDays} gün{d.sign < 0 ? " (bitiş başlangıçtan önce)" : ""} · {pretty(from)} → {pretty(to)}</p>
          {d.holidays.length > 0 && <p className="tk-note"><Icon name="calendar" size={12} /> Aradaki tatiller: {d.holidays.slice(0, 8).map((h) => `${h.name} (${h.date.slice(8)}.${h.date.slice(5, 7)})`).join(", ")}{d.holidays.length > 8 ? "…" : ""}</p>}
        </>
      ) : <p className="tk-err">Geçerli iki tarih girin.</p>}
      <p className="tk-note">İş günü: başlangıç günü hariç, bitiş dahil; hafta sonu ve resmî tatiller sayılmaz (arifeler yarım gün olduğu için iş günü sayılır).</p>
    </>
  );
}

function DateAdd() {
  const [from, setFrom] = useState(today);
  const [n, setN] = useState("10");
  const [business, setBusiness] = useState(true);
  const [opts, setOpts] = useStored("toolkit.dateOpts", { religiousOn: true, saturdayWork: false });
  const r = addToDate(from, Number(n), { business, ...opts });
  return (
    <>
      <div className="tk-form-row">
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Başlangıç" />
        <input type="number" value={n} onChange={(e) => setN(e.target.value)} aria-label="Gün sayısı" style={{ width: 90 }} />
        <select value={business ? "b" : "d"} onChange={(e) => setBusiness(e.target.value === "b")} aria-label="Gün türü"><option value="b">iş günü</option><option value="d">takvim günü</option></select>
      </div>
      {business && <HolidayOpts opts={opts} set={(p) => setOpts((o) => ({ ...o, ...p }))} />}
      <div className="tk-big" aria-live="polite">{r ? pretty(r) : "—"}</div>
      <p className="tk-note">Negatif sayı geriye doğru sayar (ör. −5 iş günü önce).</p>
    </>
  );
}

function Countdown() {
  const [targets, setTargets] = useStored("toolkit.countdowns", [{ id: "yilbasi", title: "Yılbaşı", at: `${new Date().getFullYear() + 1}-01-01T00:00` }]);
  const [title, setTitle] = useState("");
  const [at, setAt] = useState(() => `${dayKey(new Date(Date.now() + 7 * 86400000))}T20:00`);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const add = (e) => {
    e.preventDefault();
    if (!at || Number.isNaN(new Date(at).getTime())) return;
    setTargets((l) => [...l, { id: `c${Date.now().toString(36)}`, title: title.trim() || "Hedef", at }].slice(-8));
    setTitle("");
  };
  return (
    <>
      <ul className="tk-countdowns">
        {targets.map((t) => {
          const c = countdown(new Date(t.at).getTime(), now);
          return (
            <li key={t.id} className={c.done ? "is-done" : ""}>
              <span className="tk-countdowns__title"><strong>{t.title}</strong><small>{new Date(t.at).toLocaleString("tr-TR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}</small></span>
              <span className="tk-countdowns__left">{c.done ? "Geldi 🎉" : `${c.days} g ${String(c.hours).padStart(2, "0")}:${String(c.minutes).padStart(2, "0")}:${String(c.seconds).padStart(2, "0")}`}</span>
              <button type="button" className="icon-btn icon-btn--xs" onClick={() => setTargets((l) => l.filter((x) => x.id !== t.id))} aria-label={`${t.title} kaldır`}><Icon name="x" size={12} /></button>
            </li>
          );
        })}
      </ul>
      <form className="tk-form-row" onSubmit={add}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ad (ör. Sezon finali)" aria-label="Hedef adı" />
        <input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} aria-label="Hedef tarih" />
        <button type="submit" className="btn btn--sm btn--primary"><Icon name="plus" size={12} /> Ekle</button>
      </form>
    </>
  );
}

/* ------------------------------ yüzde / KDV ------------------------------ */

export function PercentTool({ onOpenCalc }) {
  const copy = useCopy();
  const [a, setA] = useStored("toolkit.pctA", "1500");
  const [b, setB] = useStored("toolkit.pctB", "20");
  const [amount, setAmount] = useStored("toolkit.vatAmount", "1000");
  const [rate, setRate] = useStored("toolkit.vatRate", 20);
  const [included, setIncluded] = useStored("toolkit.vatIncluded", false);
  const x = parseTrNumber(a);
  const y = parseTrNumber(b);
  const p = x != null && y != null ? percentOps(x, y) : null;
  const v = vat(parseTrNumber(amount), Number(rate), { included });
  const Row = ({ label, value }) => <button type="button" className="tk-copy" onClick={() => value != null && copy(String(value).replace(".", ","), `${fmt(value)} kopyalandı`)}><span className="tk-copy__label" style={{ width: 170 }}>{label}</span><span className="tk-copy__value is-mono">{fmt(value)}</span><Icon name="copy" size={13} /></button>;
  return (
    <div className="tk-text">
      <div className="tk-form-row">
        <label className="tk-lbl">A <input value={a} onChange={(e) => setA(e.target.value)} inputMode="decimal" aria-label="A sayısı" /></label>
        <label className="tk-lbl">B <input value={b} onChange={(e) => setB(e.target.value)} inputMode="decimal" aria-label="B sayısı" /></label>
      </div>
      <div className="tk-copies">
        <Row label={`A'nın %B'si`} value={p?.of} />
        <Row label="A, B'nin yüzde kaçı" value={p?.ratio} />
        <Row label="A'dan B'ye değişim (%)" value={p?.change} />
        <Row label="A + %B" value={p?.plus} />
        <Row label="A − %B (indirim)" value={p?.minus} />
      </div>
      <section className="tk-sub">
        <h4>KDV</h4>
        <div className="tk-form-row">
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" aria-label="Tutar" />
          <select value={rate} onChange={(e) => setRate(Number(e.target.value))} aria-label="KDV oranı">{[1, 10, 20].map((r) => <option key={r} value={r}>%{r}</option>)}</select>
          <select value={included ? "in" : "ex"} onChange={(e) => setIncluded(e.target.value === "in")} aria-label="Tutar türü"><option value="ex">KDV hariç</option><option value="in">KDV dahil</option></select>
        </div>
        <div className="tk-copies">
          <Row label="KDV hariç (matrah)" value={v?.net} />
          <Row label={`KDV (%${rate})`} value={v?.vat} />
          <Row label="KDV dahil (toplam)" value={v?.gross} />
        </div>
      </section>
      <p className="tk-note"><Icon name="info" size={12} /> Tevkifat, stopaj, kredi, maaş ve diğer hesaplar için <button type="button" className="link-btn" onClick={() => (onOpenCalc ? onOpenCalc() : window.elitlig?.app?.showMain("calc"))}>Hesap Araçları</button>.</p>
    </div>
  );
}
