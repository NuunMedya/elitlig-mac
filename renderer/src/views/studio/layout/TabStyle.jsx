// Sekme şeridi biçimi: yer (üst / sol / sağ / gizli), boy, yazı kalınlığı, renkler, simgeler.
// <TabStyleFields value onChange inherit />  (grup menüsündeki pencere ve Ayarlar › Yerleşim ortak)
import React from "react";
import { Icon } from "../../../components/ui";
import { TAB_POSITIONS, TAB_SIZES, TAB_WEIGHTS } from "./layoutModel";

const COLORS = [
  ["accent", "Vurgu", "Etkin sekme çizgisi ve simgeler"],
  ["bg", "Şerit zemini", "Sekme şeridinin arka planı"],
  ["active", "Etkin sekme", "Seçili sekmenin zemini"],
];
const SWATCH = ["#8b5cf6", "#38bdf8", "#14b8a6", "#22c55e", "#f59e0b", "#ef4444", "#ec4899", "#94a3b8"];

export function TabStyleFields({ value, onChange }) {
  const v = value;
  return (
    <div className="lw-tsf">
      <div className="lw-tsf__row"><span>Sekmelerin yeri</span>
        <div className="st-seg">{TAB_POSITIONS.map(([k, l]) => <button key={k} type="button" className={v.pos === k ? "is-on" : ""} onClick={() => onChange({ pos: k })} data-tab-pos={k}>
          <Icon name={k === "left" ? "chevronLeft" : k === "right" ? "chevronRight" : k === "hidden" ? "eye" : "chevronUp"} size={12} /> {l}</button>)}</div>
      </div>
      <div className="lw-tsf__row"><span>Boyut</span>
        <div className="st-seg">{TAB_SIZES.map(([k, l]) => <button key={k} type="button" className={v.size === k ? "is-on" : ""} onClick={() => onChange({ size: k })}>{l}</button>)}</div>
      </div>
      <div className="lw-tsf__row"><span>Yazı kalınlığı</span>
        <div className="st-seg">{TAB_WEIGHTS.map(([k, l]) => <button key={k} type="button" className={v.weight === k ? "is-on" : ""} style={{ fontWeight: k }} onClick={() => onChange({ weight: k })}>{l}</button>)}</div>
      </div>
      {COLORS.map(([k, l, hint]) => (
        <div key={k} className="lw-tsf__row" title={hint}><span>{l}</span>
          <div className="lw-tsf__colors">
            <button type="button" className={`lw-tsf__sw is-auto ${!v[k] ? "is-on" : ""}`} onClick={() => onChange({ [k]: "" })} title="Temanın rengi">tema</button>
            {SWATCH.map((c) => <button key={c} type="button" className={`lw-tsf__sw ${v[k] === c ? "is-on" : ""}`} style={{ background: k === "accent" ? c : `color-mix(in srgb, ${c} ${k === "bg" ? 22 : 38}%, #0b0612)` }} onClick={() => onChange({ [k]: k === "accent" ? c : mixHex(c, k === "bg" ? 0.22 : 0.38) })} aria-label={c} />)}
            <input type="color" value={v[k] || "#8b5cf6"} onChange={(e) => onChange({ [k]: e.target.value })} aria-label={`${l} rengi seç`} />
          </div>
        </div>
      ))}
      <label className="lw-tsf__row is-check"><span>Simgeler</span><input type="checkbox" className="st-switch" checked={v.icons} onChange={(e) => onChange({ icons: e.target.checked })} /></label>
    </div>
  );
}

/** Rengi koyu zeminle karıştır (#rrggbb). */
export function mixHex(hex, k, base = [11, 6, 18]) {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((x, i) => Math.round(x * k + base[i] * (1 - k)));
  return `#${c.map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}

/** Küçük örnek: üst / yan sekme şeridi önizlemesi. */
export function TabStylePreview({ value }) {
  const v = value;
  const side = v.pos === "left" || v.pos === "right";
  return (
    <div className={`lw-tsp is-${v.pos} lw-ts-${v.size} ${v.icons ? "" : "lw-ts-noicons"}`} style={{ "--lw-tab-weight": v.weight, ...(v.accent ? { "--lw-tab-accent": v.accent } : {}), ...(v.bg ? { "--lw-tab-bg": v.bg } : {}), ...(v.active ? { "--lw-tab-active": v.active } : {}) }} aria-hidden="true">
      {v.pos !== "hidden" && (
        <div className="lw-tsp__bar">
          {["Reji", "Tekrar", "Ses"].map((t, i) => <span key={t} className={`lw-tsp__tab ${i === 0 ? "is-on" : ""}`}>{v.icons && <Icon name={["zap", "repeat", "mic"][i]} size={side ? 12 : 11} />}<em>{t}</em></span>)}
        </div>
      )}
      <div className="lw-tsp__body" />
    </div>
  );
}
