// Yayın Stüdyosu · DÜĞME SEÇENEKLERİ — her çok işlevli düğmenin sağ tık / uzun basma
// paneli. Düğme tanımı alan şeması verir; panel değerleri pano öğesine yazar
// (ctx.setItemOpts → item.o). Alan türleri:
//   select (çipler) · bool · number (kaydırıcı) · text · scene · scenes (çoklu) · strip (ses kanalı) · color
//
//   const W = withOptions({ render, popover?, popTitle? }, [{ key, label, type, def, … }]);
//   optsOf(item, fields) → seçenek değerleri (varsayılanlarla)
import React, { useState } from "react";
import { Icon } from "../../../components/ui";
import { Chip, FlowNote, openPop, useIntent } from "./wkit";
import { WIDGET_COLORS, WIDGET_STYLES, normColor, normStyle, textOn, wStyleAttrs } from "./wStyle";
import "./wStyle.css";

/** Kart (div) için sağ tık → seçenekler. */
export const optMenu = (item, togglePop) => ({
  onContextMenu: (e) => { e.preventDefault(); e.stopPropagation(); openPop(item, togglePop, { mode: "options" }); },
});

/** Öğenin seçenekleri (alan varsayılanlarıyla). */
export function optsOf(item, fields = []) {
  const o = item?.opts || {};
  const out = {};
  for (const f of fields) out[f.key] = o[f.key] !== undefined ? o[f.key] : typeof f.def === "function" ? f.def() : f.def;
  return { ...o, ...out };
}

function Field({ f, value, onChange, ctx }) {
  if (f.type === "bool") {
    return (
      <label className="wo-row is-bool">
        <span><strong>{f.label}</strong>{f.hint && <small>{f.hint}</small>}</span>
        <input type="checkbox" className="st-switch" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />
      </label>
    );
  }
  const head = <span className="wo-row__l"><strong>{f.label}</strong>{f.hint && <small>{f.hint}</small>}</span>;
  if (f.type === "select") {
    const choices = typeof f.choices === "function" ? f.choices(ctx) : f.choices || [];
    return (
      <div className="wo-row">
        {head}
        <div className="wo-chips">{choices.map(([k, l]) => <button key={String(k)} type="button" className={JSON.stringify(value) === JSON.stringify(k) ? "is-on" : ""} onClick={() => onChange(k)}>{l}</button>)}</div>
      </div>
    );
  }
  if (f.type === "number") {
    return (
      <div className="wo-row">
        {head}
        <div className="wo-num">
          <input type="range" min={f.min ?? 0} max={f.max ?? 100} step={f.step ?? 1} value={Number(value) || 0} onChange={(e) => onChange(Number(e.target.value))} />
          <b>{Number(value) || 0}{f.unit ? ` ${f.unit}` : ""}</b>
        </div>
      </div>
    );
  }
  if (f.type === "text") {
    return <label className="wo-row">{head}<input value={value || ""} maxLength={f.max || 120} placeholder={f.placeholder || ""} onChange={(e) => onChange(e.target.value)} /></label>;
  }
  if (f.type === "color") {
    return <label className="wo-row is-inline">{head}<input type="color" value={value || "#8b5cf6"} onChange={(e) => onChange(e.target.value)} /></label>;
  }
  if (f.type === "scene" || f.type === "scenes") {
    const scenes = ctx.scenes || [];
    const multi = f.type === "scenes";
    const sel = multi ? (Array.isArray(value) ? value : []) : value;
    return (
      <div className="wo-row">
        {head}
        <div className="wo-chips is-scenes">
          {!multi && <button type="button" className={!sel ? "is-on" : ""} onClick={() => onChange(null)}>{f.emptyLabel || "Program sahnesi"}</button>}
          {scenes.map((s) => {
            const on = multi ? sel.includes(s.id) : sel === s.id;
            return <button key={s.id} type="button" className={on ? "is-on" : ""} onClick={() => onChange(multi ? (on ? sel.filter((x) => x !== s.id) : [...sel, s.id]) : s.id)}>{multi && on ? `${sel.indexOf(s.id) + 1}. ` : ""}{s.name}</button>;
          })}
          {!scenes.length && <small className="muted">Sahne yok.</small>}
        </div>
      </div>
    );
  }
  if (f.type === "strip") {
    const strips = ctx.mixer?.strips || [];
    return (
      <div className="wo-row">
        {head}
        <div className="wo-chips">{strips.map((s) => <button key={s.id} type="button" className={value === s.id ? "is-on" : ""} onClick={() => onChange(s.id)}>{s.label}</button>)}{!strips.length && <small className="muted">Karıştırıcı hazır değil.</small>}</div>
      </div>
    );
  }
  return null;
}

/**
 * Renk + biçim seçici. value { c, s } (null: varsayılan — öğede grup rengi, grupta parçacığın kendi
 * rengi); onChange({ c } | { s }). Önizleme hapı etkin sonucu gösterir.
 */
export function WStyleEditor({ value, onChange, noneLabel = "Varsayılan", hint }) {
  const c = normColor(value?.c);
  const s = normStyle(value?.s);
  const custom = c && c !== "theme" && !WIDGET_COLORS.some(([k]) => k === c);
  const pv = wStyleAttrs(c || s ? { c: c || "theme", s: s || "soft" } : null);
  return (
    <div className="wsty">
      <div className="wsty__sw" role="radiogroup" aria-label="Renk">
        <button type="button" className={`is-none ${!c ? "is-on" : ""}`} onClick={() => onChange({ c: null })} title={noneLabel} aria-label={noneLabel} aria-checked={!c} role="radio">{!c ? <Icon name="check" size={12} /> : null}</button>
        <button type="button" className={`is-theme ${c === "theme" ? "is-on" : ""}`} onClick={() => onChange({ c: "theme" })} title="Tema rengi (temayla değişir)" aria-label="Tema rengi" aria-checked={c === "theme"} role="radio">{c === "theme" ? <Icon name="check" size={12} /> : null}</button>
        {WIDGET_COLORS.map(([k, l]) => (
          <button key={k} type="button" className={c === k ? "is-on" : ""} style={{ "--sw": k, "--sw-on": textOn(k) }} onClick={() => onChange({ c: k })} title={l} aria-label={l} aria-checked={c === k} role="radio">{c === k ? <Icon name="check" size={12} /> : null}</button>
        ))}
        <label className={custom ? "is-on" : ""} title="Serbest renk"><input type="color" value={custom ? c : "#ff7a00"} onChange={(e) => onChange({ c: e.target.value })} aria-label="Serbest renk" /></label>
      </div>
      <div className="wsty__row">
        <span>Biçim</span>
        <div className="wo-chips">
          {!s ? null : <button type="button" onClick={() => onChange({ s: null })}>{noneLabel}</button>}
          {WIDGET_STYLES.map(([k, l]) => <button key={k} type="button" className={(s || (c ? "soft" : null)) === k ? "is-on" : ""} onClick={() => onChange({ s: k })}>{l}</button>)}
        </div>
        <em className={`wsty__pv ${pv.className}`} style={pv.style}><i />Önizleme</em>
      </div>
      {hint && <p className="wsty__hint">{hint}</p>}
    </div>
  );
}

/** Seçenek paneli: değerleri anında kaydeder. */
export function OptionsForm({ ctx, item, fields, onClose, note, noStyle = false }) {
  const [vals, setVals] = useState(() => optsOf(item, fields));
  const save = (k, v) => {
    setVals((x) => ({ ...x, [k]: v }));
    if (ctx.setItemOpts) ctx.setItemOpts(item.id, { [k]: v });
    else ctx.toast?.("Seçenek bu panoda kaydedilemiyor.", { tone: "warn" });
  };
  return (
    <div className="wx-flow wo">
      <FlowNote icon="sliders">{note || "Düğme seçenekleri · değişiklik hemen kaydedilir."}</FlowNote>
      {fields.filter((f) => !f.when || f.when(vals, ctx)).map((f) => <Field key={f.key} f={f} value={vals[f.key]} ctx={ctx} onChange={(v) => save(f.key, v)} />)}
      {!noStyle && (
        <div className="wo-row is-style">
          <span className="wo-row__l"><strong>Renk ve biçim</strong><small>Bu düğmenin rengi · boş: grubun rengi (Kutu ekle › grup başlığı)</small></span>
          <WStyleEditor value={{ c: vals.wc, s: vals.ws }} noneLabel="Grup rengi" onChange={(p) => { if ("c" in p) save("wc", p.c); if ("s" in p) save("ws", p.s); }} />
        </div>
      )}
      <div className="wo-foot">
        <button type="button" className="btn btn--xs btn--ghost" onClick={() => { fields.forEach((f) => save(f.key, typeof f.def === "function" ? f.def() : f.def)); }}><Icon name="undo" size={11} /> Varsayılan</button>
        <button type="button" className="btn btn--xs btn--primary" onClick={onClose}><Icon name="check" size={11} /> Tamam</button>
      </div>
    </div>
  );
}

function OptionsOrFlow({ impl, fields, note, p }) {
  const intent = useIntent(p.item);
  if (intent.mode === "options" || !impl.popover) return <OptionsForm ctx={p.ctx} item={p.item} fields={fields} onClose={p.onClose} note={note} />;
  return impl.popover({ ...p, intent });
}

/** Düğme tanımına seçenek panelini ekler (akış paneli varsa niyetle seçilir). */
export function withOptions(impl, fields, { note = null } = {}) {
  return {
    ...impl,
    options: fields,
    popTitle: impl.popTitle || "Seçenekler",
    popover: (p) => <OptionsOrFlow impl={impl} fields={fields} note={note} p={p} />,
  };
}

/** Seçim çipi ızgarası (akışlarda). */
export const ChipGrid = ({ items, cols = 2 }) => <div className={`wx-grid ${cols === 3 ? "is-3" : cols === 4 ? "is-4" : ""}`}>{items.map((x) => <Chip key={x.key} {...x.props}>{x.label}</Chip>)}</div>;
