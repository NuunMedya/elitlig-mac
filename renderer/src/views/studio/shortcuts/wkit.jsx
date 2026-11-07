// Yayın Stüdyosu · ÇOK İŞLEVLİ DÜĞMELER — ortak parçalar (kart kabuğu, başlık, tuş çipi,
// ilerleme halkası, takım seçici, oyuncu ızgarası, adım çubuğu, uzun basma).
//
// Açılır akışlar mevcut kısayol açılır paneli (RailPopover / Board › FloatPop) üzerinden
// açılır: parçacık togglePop() çağırır, açılır panel item.id ile "niyet" okur (hangi takım,
// akış mı seçenekler mi). Sağ tık ya da uzun basma = seçenekler (kanal seçimi, süre…).
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "../../../components/ui";
import { keyText } from "../settings/settings";
import { filterPlayers, initials, ringDash, shapeOf } from "./flowLogic";

/* ───────── açılır panel niyeti ───────── */
const intents = new Map();
/** Açılır paneli bir niyetle aç: { mode: "flow" | "options", ...ek }. */
export function openPop(item, togglePop, intent = {}) {
  if (item?.id) intents.set(item.id, { mode: "flow", ...intent });
  togglePop?.();
}
/** Açılır panel ilk çizimde okur (bir kez). */
export function useIntent(item) {
  const [v] = useState(() => { const x = intents.get(item?.id) || { mode: "flow" }; intents.delete(item?.id); return x; });
  return v;
}

/** Tık = ana eylem; sağ tık ya da 550 ms basılı tutma = seçenekler. */
export function usePress(onClick, onLong, ms = 550) {
  const t = useRef(null);
  const longed = useRef(false);
  const clear = () => { clearTimeout(t.current); t.current = null; };
  useEffect(() => clear, []);
  if (!onLong) return { onClick };
  return {
    onPointerDown: (e) => { if (e.button !== 0) return; longed.current = false; clear(); t.current = setTimeout(() => { longed.current = true; onLong(); }, ms); },
    onPointerUp: clear,
    onPointerLeave: clear,
    onClick: (e) => { if (longed.current) { longed.current = false; e.preventDefault(); return; } onClick?.(e); },
    onContextMenu: (e) => { e.preventDefault(); e.stopPropagation(); clear(); onLong(); },
  };
}

export const hk = (ctx, action) => {
  if (!ctx?.hints) return null;
  const k = ctx.hotkeys?.[action]?.[0];
  return k ? keyText(k) : null;
};
export const Kbd = ({ k }) => (k ? <span className="wx-kbd">{k}</span> : null);

/** Saniyede birkaç kez yenile. */
export function useNow(active, ms = 500) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return undefined;
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [active, ms]);
  return now;
}

/**
 * Kart kabuğu. tone: renk ailesi (danger, green, amber, violet, blue, home, away, plain);
 * state: "air" (yayında kırmızı) · "pvw" (önizlemede yeşil) · "armed" (hazır sarı) · null.
 */
export function Shell({ tone = "plain", w = 1, h = 1, state = null, className = "", title, children, as = "div", ...rest }) {
  const T = as;
  const cls = `st-w is-${tone} is-panel wx wx--${w}x${h} is-${shapeOf(w, h)} ${state ? `wx-is-${state}` : ""} ${className}`;
  return <T className={cls} title={title} {...(as === "button" ? { type: "button" } : {})} {...rest}>{children}</T>;
}
/** Kart başlığı: simge, etiket, sağda rozet / tuş. */
export function Head({ icon, label, right, kbd, dot }) {
  return (
    <span className="wx-head">
      {dot && <i className={`wx-dot is-${dot}`} />}
      {icon && <Icon name={icon} size={12} strokeWidth={2.2} />}
      <span className="wx-head__t">{label}</span>
      {right}
      <Kbd k={kbd} />
    </span>
  );
}
/** Durum hapı (YAYINDA / ÖNİZLEME / HAZIR…). */
export const Pill = ({ tone = "plain", children }) => <em className={`wx-pill is-${tone}`}>{children}</em>;

/** İlerleme halkası (frac 0…1), ortasında içerik. */
export function Ring({ frac = 0, size = 34, stroke = 3.5, tone = "c", children }) {
  const r = (size - stroke) / 2;
  const { dash } = ringDash(frac, r);
  return (
    <span className={`wx-ring is-${tone}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="wx-ring__bg" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="wx-ring__fg" strokeDasharray={dash} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <span className="wx-ring__in">{children}</span>
    </span>
  );
}

/** Büyük çip düğmesi (akışlarda ve kartlarda). */
export function Chip({ on, tone, icon, children, sub, className = "", ...rest }) {
  return (
    <button type="button" className={`wx-chip ${on ? "is-on" : ""} ${tone ? `is-${tone}` : ""} ${className}`} aria-pressed={on || undefined} {...rest}>
      {icon && <Icon name={icon} size={13} strokeWidth={2.2} />}
      <span>{children}</span>
      {sub && <small>{sub}</small>}
    </button>
  );
}

/* ───────── akış (açılır panel) ───────── */

/** Adım çubuğu: geri, adım adları (geçilenler işaretli), sağda ek. */
export function FlowBar({ steps, step, onBack, right, busy }) {
  const at = steps.findIndex((s) => s.key === step);
  return (
    <div className="wx-flowbar">
      <button type="button" className="wx-back" onClick={onBack} disabled={busy || at <= 0} aria-label="Geri"><Icon name="chevronLeft" size={13} /></button>
      <ol className="wx-steps">
        {steps.map((s, i) => <li key={s.key} className={i < at ? "is-done" : i === at ? "is-on" : ""}><b>{i < at ? "✓" : i + 1}</b>{s.label}{s.value ? <em>{s.value}</em> : null}</li>)}
      </ol>
      {right}
    </div>
  );
}

/** İki büyük takım düğmesi. */
export function TeamPick({ ctx, onPick, sub, busy }) {
  const E = ctx.event || {};
  return (
    <div className="wx-teams">
      {["home", "away"].map((s) => (
        <button key={s} type="button" className={`wx-team is-${s}`} disabled={busy} onClick={() => onPick(s)}>
          <i />
          <strong>{s === "home" ? E.homeName || "Ev sahibi" : E.awayName || "Deplasman"}</strong>
          {sub && <small>{typeof sub === "function" ? sub(s) : sub}</small>}
        </button>
      ))}
    </div>
  );
}

/** Kadro ızgarası: forma no, fotoğraf (yoksa baş harfler), ad; arama; "oyuncusuz". */
export function PlayerGrid({ players, side, onPick, exclude, prefer, busy, emptyLabel = "Oyuncusuz kaydet", allowEmpty = true, skipLabel = null, onSkip, groups = null }) {
  const [q, setQ] = useState("");
  const list = filterPlayers(players, q, { exclude, prefer });
  const prefSet = new Set((prefer || []).map((p) => String(p.id ?? p)));
  const pick = useCallback((id) => onPick(id), [onPick]);
  return (
    <div className={`wx-pg is-${side}`}>
      <div className="wx-pg__bar">
        <input type="search" placeholder="Forma no ya da ad…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus
          onKeyDown={(e) => { if (e.key === "Enter" && list.length === 1) pick(list[0].id); }} />
        {skipLabel && <button type="button" className="wx-skip" disabled={busy} onClick={onSkip}>{skipLabel} <Icon name="chevronRight" size={12} /></button>}
      </div>
      <div className="wx-pg__grid">
        {list.map((p, i) => (
          <button key={p.id} type="button" className={`wx-pl ${p.role !== "starter" && i > 0 && list[i - 1].role === "starter" && !groups ? "is-firstsub" : ""} ${prefSet.has(String(p.id)) ? "is-pref" : ""}`} disabled={busy} onClick={() => pick(p.id)} title={p.name}>
            <span className="wx-pl__ph">{p.image ? <img src={p.image} alt="" loading="lazy" /> : <span>{initials(p.name)}</span>}<b>{p.number || "–"}</b></span>
            <span className="wx-pl__n">{p.name}</span>
          </button>
        ))}
        {!list.length && <p className="wx-hint">{(players || []).length ? "Eşleşen oyuncu yok." : "Kadro girilmemiş (Maç yönetimi › Kadro)."}</p>}
      </div>
      {allowEmpty && <button type="button" className="wx-nobody" disabled={busy} onClick={() => pick(null)}>{emptyLabel}</button>}
    </div>
  );
}

/** Akış sonucu: "Kaydediliyor…" ya da uyarı. */
export const FlowNote = ({ tone = "info", icon = "info", children }) => <p className={`wx-note is-${tone}`}><Icon name={icon} size={13} /> {children}</p>;

/** Zamanlı eylem: N sn sonra kendiliğinden geri al (bileşen dışı: parçacık yeniden çizilse de sürer). */
const timers = new Map();
export function startTimer(key, ms, onEnd) {
  clearTimeout(timers.get(key)?.t);
  const endsAt = Date.now() + ms;
  timers.set(key, { endsAt, ms, t: setTimeout(() => { timers.delete(key); onEnd?.(); }, ms) });
  return endsAt;
}
export const timerOf = (key) => timers.get(key) || null;
export function stopTimer(key, run = false, onEnd) {
  const x = timers.get(key);
  if (!x) return;
  clearTimeout(x.t);
  timers.delete(key);
  if (run) onEnd?.();
}
