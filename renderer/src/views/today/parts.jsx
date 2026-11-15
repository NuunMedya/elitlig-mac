// Bugün panosu — bileşenlerin ortak parçaları: 1×1 düğme, büyük değer, satır listesi, durum notları.
import React from "react";
import { Icon } from "../../components/ui";
import { errorText } from "./data";

/** 1×1 / 2×1 düğme: simge, kısa etiket, isteğe bağlı rozet ya da değer. */
export function XsButton({ icon, label, value, badge, tone = "", onClick, title, busy = false, wide = false }) {
  return (
    <button type="button" className={`dt-xs${tone ? ` is-${tone}` : ""}${wide ? " is-wide" : ""}${busy ? " is-busy" : ""}`} onClick={onClick} title={title || label} aria-label={title || label}>
      <span className="dt-xs__icon"><Icon name={icon} size={wide ? 18 : 20} strokeWidth={2} />{badge ? <em className="dt-badge">{badge > 99 ? "99+" : badge}</em> : null}</span>
      <span className="dt-xs__txt">
        {value != null && value !== "" ? <strong className="dt-xs__value">{value}</strong> : null}
        <span className="dt-xs__label">{label}</span>
      </span>
    </button>
  );
}

/** Büyük ana değer + etiket + alt satırlar (küçük kademe). */
export function Big({ value, label, sub, tone = "", onClick, children }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag type={onClick ? "button" : undefined} className={`dt-big${tone ? ` is-${tone}` : ""}`} onClick={onClick}>
      <strong className="dt-big__value">{value}</strong>
      {label && <span className="dt-big__label">{label}</span>}
      {sub && <span className="dt-big__sub">{sub}</span>}
      {children}
    </Tag>
  );
}

/** Sayı kutuları (2–6 adet). */
export function Stats({ items }) {
  return (
    <div className="dt-stats">
      {items.filter(Boolean).map((s) => (
        <button key={s.label} type="button" className="dt-stat" onClick={s.onClick} disabled={!s.onClick}>
          <strong className={s.tone ? `text-${s.tone}` : ""}>{s.value}</strong><span>{s.label}</span>
        </button>
      ))}
    </div>
  );
}

/** Liste satırı: renk çubuğu, simge, başlık + alt satır, sağda değer ve eylemler. */
export function Row({ color, icon, title, sub, right, tone = "", onClick, children, className = "" }) {
  return (
    <li className={`dt-row${tone ? ` is-${tone}` : ""} ${className}`}>
      {color && <span className="dt-row__bar" style={{ background: color }} />}
      <button type="button" className="dt-row__main" onClick={onClick} disabled={!onClick}>
        {icon && <Icon name={icon} size={13} className="dt-row__icon" />}
        <span className="dt-row__text"><span>{title}</span>{sub ? <small>{sub}</small> : null}</span>
      </button>
      {right != null && <span className={`dt-row__right${tone ? ` text-${tone}` : ""}`}>{right}</span>}
      {children}
    </li>
  );
}

export const List = ({ children, className = "" }) => <ul className={`dt-list ${className}`}>{children}</ul>;

/** Yüklenme / hata / boş / çevrimdışı. */
export function State({ q, empty, emptyIcon = "check", children, need = true }) {
  if (q && need) {
    if (q.error && !q.data) return <Fail text={errorText(q.error)} onRetry={() => q.reload()} />;
    if (q.loading && !q.data) return <Loading />;
  }
  if (empty) return <div className="dt-empty"><Icon name={emptyIcon} size={18} /><span>{empty}</span></div>;
  return <>{children}{q?.offline && <p className="dt-offline"><Icon name="cloudOff" size={11} /> Çevrimdışı · son veri</p>}</>;
}
export const Loading = () => <div className="dt-loading" role="status"><span className="spinner__dot" /> Yükleniyor…</div>;
export const Fail = ({ text, onRetry }) => (
  <div className="dt-empty is-err"><Icon name="alert" size={16} /><span>{text}</span>{onRetry && <button type="button" className="btn btn--xs" onClick={onRetry}>Yeniden dene</button>}</div>
);

/** Yatay ilerleme çubuğu (0–100). */
export const Bar = ({ pct, tone = "", label }) => (
  <span className={`dt-bar${tone ? ` is-${tone}` : ""}`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct || 0)} aria-label={label}>
    <i style={{ width: `${Math.max(0, Math.min(100, pct || 0))}%` }} />
  </span>
);

/** Kısa düğme sırası. */
export const Actions = ({ children }) => <div className="dt-actions">{children}</div>;

/** Durum notu (gönderildi, hata…). */
export const Note = ({ note }) => (note ? <p className={`dt-note is-${note.tone || "muted"}`} role="status">{note.text}</p> : null);

export const pickTier = (tier, map) => map[tier] ?? map.m ?? map.s;
export const maxRows = (tier, h, base = 1) => Math.max(1, Math.floor((h - base) * 1.4)) + (tier === "xl" ? 2 : 0);
