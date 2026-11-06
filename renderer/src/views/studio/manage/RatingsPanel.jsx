// Maç sonu · OYUNCU PUANLARI — iki takım yan yana, 1–10 yarım adım
// (−/+ ya da elle 0–10 tek ondalık; mobil PostStep normalizeRating).
//   PATCH /api/maclar/:id/kadro/puan { ratings: [{ playerId, oyuncu_id, puan }] }
import React from "react";
import { Icon } from "../../../components/ui";
import { isRatingInvalid, normalizeRating, stepRating } from "../../../lib/studio/manage";

function Row({ p, value, onChange, disabled }) {
  const bad = isRatingInvalid(value);
  const n = normalizeRating(value);
  return (
    <li className={`mg-row pt-rate${bad ? " is-bad" : ""}`}>
      <span className="pt-rate__no">{p.number || "–"}</span>
      <span className="mg-row__main">
        <strong>{p.name}{p.captain ? " (K)" : ""}</strong>
        <small>{[p.role === "starter" ? "İlk 11" : p.role === "bench" ? "Yedek" : null, p.position].filter(Boolean).join(" · ")}</small>
      </span>
      <button type="button" className="icon-btn icon-btn--xs" disabled={disabled} onClick={() => onChange(stepRating(value, -1))} aria-label="Yarım puan azalt">−</button>
      <input className="pt-rate__input" value={value ?? ""} inputMode="decimal" placeholder="–" disabled={disabled} aria-label={`${p.name} puanı`}
        onChange={(e) => onChange(e.target.value.replace(/[^\d.,]/g, "").slice(0, 4))} />
      <button type="button" className="icon-btn icon-btn--xs" disabled={disabled} onClick={() => onChange(stepRating(value, 1))} aria-label="Yarım puan artır">+</button>
      <span className={`pt-rate__bar${n == null ? " is-empty" : ""}`} style={{ "--v": n == null ? 0 : n / 10 }} />
      {value !== "" && value != null && <button type="button" className="icon-btn icon-btn--xs" title="Puanı temizle" disabled={disabled} onClick={() => onChange("")}><Icon name="x" size={11} /></button>}
    </li>
  );
}

export default function RatingsPanel({ live, ratings, setRatings, summary, saving, onSave, onReset }) {
  const set = (id) => (v) => setRatings((r) => ({ ...r, [id]: v }));
  return (
    <div className="mg-stack">
      <div className="mg-inline mg-wrap">
        <span className="mg-muted">{summary.filled} / {summary.total} oyuncuya puan verildi{summary.invalid ? ` · ${summary.invalid} geçersiz` : ""} · 1–10, yarım adım (ondalık girilebilir)</span>
        <span className="mg-grow" />
        <button type="button" className="btn btn--sm btn--ghost" disabled={!summary.dirty || saving} onClick={onReset}>Geri al</button>
        <button type="button" className="btn btn--sm btn--primary" disabled={!summary.dirty || saving || summary.invalid > 0 || !summary.filled} onClick={onSave}><Icon name="check" size={13} /> Puanları kaydet</button>
      </div>
      <div className="mg-grid2">
        {["home", "away"].map((side) => {
          const squad = live?.squads?.[side] || [];
          return (
            <fieldset key={side} className="mg-box">
              <legend className={`is-${side}`}>{side === "home" ? live?.homeName : live?.awayName} <small>{squad.length} oyuncu</small></legend>
              {squad.length ? (
                <ul className="mg-rows">{squad.map((p) => <Row key={p.id} p={p} value={ratings[p.id] ?? ""} onChange={set(p.id)} disabled={saving} />)}</ul>
              ) : <p className="mg-muted">Kadro girilmemiş; puan vermek için önce “Kadro” sekmesini doldur.</p>}
            </fieldset>
          );
        })}
      </div>
    </div>
  );
}
