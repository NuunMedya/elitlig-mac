// Veri bileşeni ailesi: bir kaynak (sources.js) + görünüm (sayı / liste / tablo / çubuk / pasta /
// takvim / gösterge / küçük resimler). Kademe: 1×1 sayı düğmesi · küçük: büyük sayı · orta: seçili
// görünüm · büyük ve üstü: sayı başlığı + görünüm (daha çok satır).
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../../../components/ui";
import { useData } from "../data";
import { sourceOf } from "../sources";
import { runAction } from "../actions";
import { post } from "../../../api";
import { Big, Fail, List, Loading, Row, XsButton } from "../parts";

/** Köprü kaynağı: oku + (varsa) olay aboneliği + yoklama. */
function useBridgeSource(src, o, enabled) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const oKey = JSON.stringify(o || {});
  const ref = useRef(src);
  ref.current = src;
  useEffect(() => {
    if (!enabled || !src?.bridge) return undefined;
    let alive = true;
    const opts = JSON.parse(oKey);
    const load = () => {
      let p;
      try { p = Promise.resolve(ref.current.bridge(opts)); } catch (e) { p = Promise.reject(e); }
      p.then((d) => { if (!alive) return; if (d && d.ok === false) setState((s) => ({ data: s.data, error: d.error?.message || d.error || "Veri alınamadı.", loading: false })); else setState({ data: d, error: null, loading: false }); })
        .catch((e) => alive && setState((s) => ({ data: s.data, error: String(e?.message || e), loading: false })));
    };
    load();
    const t = src.poll ? setInterval(load, src.poll) : null;
    let off = null;
    try { off = src.subscribe?.((d) => alive && d && setState({ data: d, error: null, loading: false })); } catch { /* yoksay */ }
    return () => { alive = false; if (t) clearInterval(t); if (typeof off === "function") off(); };
  }, [src, oKey, enabled]);
  return { ...state, reload: () => {} };
}

export function useSource(key, o = {}, { enabled = true } = {}) {
  const src = sourceOf(key);
  const isPath = Boolean(src?.path);
  const q1 = useData(isPath ? src.path : null, src?.query || null, { enabled: enabled && isPath, poll: src?.poll || 0, ttl: 20000 });
  const q2 = useBridgeSource(isPath ? null : src, o, enabled && !isPath);
  const q = isPath ? q1 : q2;
  const view = useMemo(() => {
    if (!src || q.data == null) return null;
    try { return src.map(q.data, o) || null; } catch (e) { return { error: String(e?.message || e) }; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, q.data, JSON.stringify(o)]);
  return { q, view, src };
}

/** Satır / dilim tıklaması. */
export function openTarget(target, { go, toast }) {
  if (!target) return;
  if (typeof target === "string") { go(target); return; }
  if (target.spec) { runAction(target.spec, { go, toast, post }); return; }
  if (target.route) { go(target.route, target.arg || null); return; }
  if (target.browserTab) { window.elitlig.browser?.cmd?.("activate", { id: target.browserTab }); go("browser"); return; }
  if (target.reveal) { window.elitlig.files?.reveal?.(target.reveal); return; }
  if (target.shelfCopy) { window.elitlig.shelf?.copy?.([target.shelfCopy]).then(() => toast?.("Panoya kopyalandı.", { tone: "success", timeout: 1500 })); }
}

/* ────────────────────────────── görünümler ────────────────────────────── */

export function Donut({ slices, size = 92, label }) {
  const total = slices.reduce((s, x) => s + x.value, 0) || 1;
  let acc = 0;
  const r = 15.9155;
  return (
    <svg className="dt-donut" viewBox="0 0 42 42" width={size} height={size} role="img" aria-label={label || "Dağılım"}>
      <circle cx="21" cy="21" r={r} fill="none" stroke="var(--surface-3)" strokeWidth="6" />
      {slices.map((s) => {
        const pct = (s.value / total) * 100;
        const el = <circle key={s.label} cx="21" cy="21" r={r} fill="none" stroke={s.color} strokeWidth="6" strokeDasharray={`${pct} ${100 - pct}`} strokeDashoffset={25 - acc}><title>{`${s.label}: ${s.value.toLocaleString("tr-TR")}`}</title></circle>;
        acc += pct;
        return el;
      })}
    </svg>
  );
}
function PieView({ slices, compact, fmt }) {
  if (!slices?.length) return <Empty />;
  const total = slices.reduce((s, x) => s + x.value, 0);
  return (
    <div className={`dt-pie${compact ? " is-compact" : ""}`}>
      <Donut slices={slices} size={compact ? 70 : 96} />
      <ul className="dt-pie__legend">
        {slices.slice(0, compact ? 4 : 8).map((s) => <li key={s.label}><i style={{ background: s.color }} /><span>{s.label}</span><b>{fmt ? fmt(s.value) : s.value.toLocaleString("tr-TR")}</b><small>%{Math.round((s.value / (total || 1)) * 100)}</small></li>)}
      </ul>
    </div>
  );
}
function BarsView({ bars, onOpen, fmt }) {
  if (!bars?.length) return <Empty />;
  const max = Math.max(1, ...bars.map((b) => Math.max(b.a || 0, b.b || 0)));
  const two = bars.some((b) => b.b != null);
  return (
    <div className="dt-chart" role="img" aria-label="Grafik">
      {bars.map((b, i) => (
        <button key={`${b.label}${i}`} type="button" className="dt-chart__col" onClick={onOpen} title={`${b.label}: ${fmt ? fmt(b.a) : b.a}${two ? ` / ${fmt ? fmt(b.b) : b.b}` : ""}`}>
          <span className="dt-chart__bars"><i className="is-in" style={{ height: `${((b.a || 0) / max) * 100}%` }} />{two && <i className="is-out" style={{ height: `${((b.b || 0) / max) * 100}%` }} />}</span>
          <small>{b.label}</small>
        </button>
      ))}
    </div>
  );
}
function TableView({ rows, max, onOpen }) {
  if (!rows?.length) return <Empty />;
  return (
    <table className="dt-table">
      <tbody>
        {rows.slice(0, max).map((r, i) => (
          <tr key={`${r.title}${i}`} className={r.tone ? `is-${r.tone}` : ""} onClick={r.open ? () => onOpen(r.open) : undefined}>
            <td>{r.color && <i className="dt-dot" style={{ background: r.color }} />}{r.title}</td>
            <td className="muted">{r.sub || ""}</td>
            <td className={`num${r.tone ? ` text-${r.tone}` : ""}`}>{r.right ?? ""}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
function ListView({ rows, max, onOpen }) {
  if (!rows?.length) return <Empty />;
  return (
    <List>
      {rows.slice(0, max).map((r, i) => (
        <Row key={`${r.title}${i}`} icon={r.icon} color={r.color} title={r.title} sub={r.sub} right={r.right} tone={r.tone} onClick={r.open ? () => onOpen(r.open) : undefined}>
          {r.phone && <a className="dt-row__acts icon-btn icon-btn--xs" href={`tel:${r.phone}`} title={`Ara: ${r.phone}`} aria-label={`Ara ${r.phone}`}><Icon name="phone" size={12} /></a>}
        </Row>
      ))}
    </List>
  );
}
function CalView({ days, onOpen }) {
  if (!days?.length) return <Empty />;
  return (
    <div className="dt-week7">
      {days.map((d) => (
        <button key={d.date} type="button" className={`dt-week7__day${d.today ? " is-today" : ""}${d.items.length ? " has-items" : ""}`} onClick={onOpen}>
          <b>{d.label}</b>
          {d.items.slice(0, 3).map((x, i) => <span key={i} className={x.tone ? `is-${x.tone}` : ""}>{x.time ? <em>{x.time}</em> : null}{x.title}</span>)}
          {d.items.length > 3 && <small>+{d.items.length - 3}</small>}
        </button>
      ))}
    </div>
  );
}
function GaugeView({ pct, kpi }) {
  const p = Math.max(0, Math.min(100, pct || 0));
  return (
    <div className="dt-gauge">
      <svg viewBox="0 0 42 42" width="88" height="88" role="img" aria-label={`${kpi?.label}: ${kpi?.value}`}>
        <circle cx="21" cy="21" r="15.9155" fill="none" stroke="var(--surface-3)" strokeWidth="5" />
        <circle cx="21" cy="21" r="15.9155" fill="none" stroke={p >= 85 ? "var(--red)" : p >= 60 ? "#d97706" : "var(--accent)"} strokeWidth="5" strokeDasharray={`${p} ${100 - p}`} strokeDashoffset="25" strokeLinecap="round" />
      </svg>
      <span><strong>{kpi?.value}</strong><small>{kpi?.label}</small>{kpi?.sub && <small>{kpi.sub}</small>}</span>
    </div>
  );
}
function ThumbsView({ thumbs, max, onOpen }) {
  if (!thumbs?.length) return <Empty text="Görüntü yok. ⌃⌥A ile ekranı yakalayın." />;
  return <div className="dt-thumbs">{thumbs.slice(0, max).map((t) => <button key={t.id} type="button" onClick={() => onOpen({ shelfCopy: t.id })} title={`${t.title || "Görüntü"}: kopyala`}>{t.src ? <img src={t.src} alt="" loading="lazy" /> : <Icon name="image" />}</button>)}</div>;
}
const Empty = ({ text = "Gösterilecek kayıt yok." }) => <div className="dt-empty"><Icon name="check" size={16} /><span>{text}</span></div>;
const KpiHead = ({ kpi, onClick }) => (kpi ? (
  <button type="button" className={`dt-kpihead${kpi.tone ? ` is-${kpi.tone}` : ""}`} onClick={onClick}>
    <strong>{kpi.value}</strong><span>{kpi.label}</span>{kpi.sub ? <small>{kpi.sub}</small> : null}
  </button>
) : null);

/**
 * Kaynaktan görünüm. meta.src kaynak, meta.view varsayılan görünüm (o.view ile değişir).
 */
export function DataTile({ tier, meta, o, go, toast, lines, bar, preview }) {
  const { q, view } = useSource(meta.src, o, { enabled: true });
  const kind = o.view || meta.view || "list";
  const open = (t) => openTarget(t, { go, toast });
  const openMain = () => (meta.route ? go(meta.route) : null);
  const kpi = view?.kpi;
  if (tier === "xs") return <XsButton icon={meta.icon} value={kpi ? kpi.value : "–"} label={kpi?.label || meta.label} tone={kpi?.tone || ""} wide={bar} title={`${meta.label}${kpi?.sub ? ` · ${kpi.sub}` : ""}`} onClick={openMain} />;
  if (q.error && !view) return <Fail text={String(q.error?.message || q.error)} onRetry={q.reload} />;
  if (!view) return <Loading />;
  if (view.error) return <Fail text={view.error} />;
  if (tier === "s" || bar) {
    if (kind === "gauge") return <GaugeView pct={view.gauge} kpi={kpi} />;
    return <Big value={kpi?.value ?? "—"} label={kpi?.label} sub={kpi?.sub} tone={kpi?.tone || ""} onClick={openMain} />;
  }
  const big = tier === "l" || tier === "xl";
  const max = Math.max(2, lines - (big ? 2 : 0));
  const fmt = meta.money ? (v) => `${Math.round(v).toLocaleString("tr-TR")} ₺` : null;
  let body;
  switch (kind) {
    case "kpi": body = <Big value={kpi?.value ?? "—"} label={kpi?.label} sub={kpi?.sub} tone={kpi?.tone || ""} onClick={openMain} />; break;
    case "gauge": body = <GaugeView pct={view.gauge} kpi={kpi} />; break;
    case "pie": body = <PieView slices={view.slices} compact={tier === "m"} fmt={fmt} />; break;
    case "bars": body = <BarsView bars={view.bars} onOpen={openMain} fmt={fmt} />; break;
    case "table": body = <TableView rows={view.rows} max={max} onOpen={open} />; break;
    case "cal": body = <CalView days={view.days} onOpen={openMain} />; break;
    case "thumbs": body = <ThumbsView thumbs={view.thumbs} max={tier === "m" ? 6 : 18} onOpen={open} />; break;
    default: body = <ListView rows={view.rows} max={max} onOpen={open} />;
  }
  return (
    <div className={`dt-data is-${kind}`} data-src={meta.src}>
      {big && kind !== "kpi" && kind !== "gauge" && <KpiHead kpi={kpi} onClick={openMain} />}
      {body}
      {q.offline && <p className="dt-offline"><Icon name="cloudOff" size={11} /> Çevrimdışı · son veri</p>}
      {preview ? null : null}
    </div>
  );
}
