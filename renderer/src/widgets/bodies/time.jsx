// Zaman widget'ları: Odak sayacı (ana süreçteki sayacın denetimi: app/focus.js), haftalık ajanda,
// ay takvimi. Etkinlikler /api/tools/events (proje adımları dahil).
import React, { useEffect, useState } from "react";
import { Icon } from "../../components/ui";
import { formatClock, isoDay } from "../../lib/helpers";
import { W, dayStart, gate, openApp, useDataChanged, usePoll, useSignedIn, Hero, isBig, pick } from "../common";
import { monthGrid, weekColumns } from "../widgetModel";

/* ------------------------------ odak ------------------------------ */

const PHASE = { focus: "Odak", short: "Kısa mola", long: "Uzun mola", timer: "Zamanlayıcı" };
export function FocusWidget({ size }) {
  const focus = W().focus;
  const [s, setS] = useState(null);
  const [, tick] = useState(0);
  useEffect(() => { focus.state().then(setS); return focus.onState(setS); }, [focus]);
  useEffect(() => { if (!s?.running) return undefined; const t = setInterval(() => tick((n) => n + 1), 500); return () => clearInterval(t); }, [s?.running]);
  const cmd = (n, a) => focus.command(n, a).then(setS);
  if (!s) return <p className="wg-muted">…</p>;
  const stopwatch = s.mode === "stopwatch";
  const now = Date.now();
  const remaining = s.running && s.endsAt ? Math.max(0, s.endsAt - now) : s.remainingMs;
  const elapsed = s.running && stopwatch && s.startedAt ? s.elapsedMs + (now - s.startedAt) : s.elapsedMs;
  const ms = stopwatch ? elapsed : remaining;
  const pct = !stopwatch && s.totalMs ? Math.min(1, 1 - remaining / s.totalMs) : 0;
  const R = size === "small" ? 46 : 48;
  const C2 = 2 * Math.PI * R;
  const label = stopwatch ? "Kronometre" : s.mode === "timer" ? PHASE.timer : PHASE[s.phase] || "Odak";
  return (
    <div className={`wg-focus is-${size}${s.running ? " is-on" : ""} is-${s.phase || "focus"}`}>
      <div className="wg-ring" style={{ width: R * 2 + 12, height: R * 2 + 12 }}>
        <svg viewBox={`0 0 ${R * 2 + 12} ${R * 2 + 12}`} aria-hidden="true">
          <circle cx={R + 6} cy={R + 6} r={R} className="wg-ring__bg" />
          {!stopwatch && <circle cx={R + 6} cy={R + 6} r={R} className="wg-ring__fg" strokeDasharray={C2} strokeDashoffset={C2 * (1 - pct)} transform={`rotate(-90 ${R + 6} ${R + 6})`} />}
        </svg>
        <span className="wg-ring__in"><small>{label}</small><strong data-testid="focus-time">{formatClock(ms)}</strong>{s.mode === "pomodoro" && <small>Tur {s.round || 1}{s.stats ? ` · bugün ${s.stats.sessions}` : ""}</small>}</span>
      </div>
      <div className="wg-focus__side">
      <div className="wg-bar is-center">
        <button type="button" className="wg-ib is-main" onClick={() => cmd("toggle")} aria-label={s.running ? "Duraklat" : "Başlat"}><Icon name={s.running ? "pause" : "play"} size={14} strokeWidth={2.4} /></button>
        {s.mode === "pomodoro" && <button type="button" className="wg-ib" onClick={() => cmd("skip")} aria-label="Sonraki evreye geç" title="Atla"><Icon name="skip" size={13} /></button>}
        <button type="button" className="wg-ib" onClick={() => cmd("reset")} aria-label="Sıfırla" title="Sıfırla"><Icon name="rotate" size={13} /></button>
        {size !== "small" && <button type="button" className="wg-ib" onClick={() => openApp("focus")} aria-label="Odak Sayacı'nı aç" title="Odak Sayacı"><Icon name="external" size={12} /></button>}
      </div>
      {size !== "small" && (
        <div className="wg-seg is-center" role="radiogroup" aria-label="Sayaç türü">
          {[["pomodoro", "Pomodoro"], ["timer", "Zamanlayıcı"], ["stopwatch", "Kronometre"]].map(([v, l]) => <button key={v} type="button" role="radio" aria-checked={s.mode === v} className={s.mode === v ? "is-on" : ""} onClick={() => cmd("mode", { mode: v })}>{l}</button>)}
        </div>
      )}
      </div>
    </div>
  );
}

/* ------------------------------ ajanda verisi ------------------------------ */

function useEvents(signed, from, to) {
  const q = usePoll(async () => {
    if (!signed) return null;
    const res = await W().request({ path: "/api/tools/events", query: { from: from.toISOString(), to: to.toISOString(), todos: "0" } });
    if (!res.ok) throw new Error(res.error?.message || "Ajanda alınamadı.");
    return [...(res.data?.items || []), ...(res.data?.projects || []).filter((p) => p.occurrence_start || p.start_at)];
  }, 5 * 60000, [signed, from.getTime(), to.getTime()]);
  useDataChanged(["/events", "/projects"], q.reload);
  return q;
}

/* ------------------------------ haftalık ------------------------------ */

export function WeekWidget({ size }) {
  const signed = useSignedIn();
  const [offset, setOffset] = useState(0);
  const now = new Date();
  const monday = dayStart(now, -((now.getDay() + 6) % 7) + offset * 7);
  const q = useEvents(signed, monday, dayStart(monday, 7));
  const g = gate(signed, q);
  if (g) return g;
  const cols = weekColumns(q.data, now, offset);
  const max = pick(size, 0, 0, 5, 6);
  return (
    <div className={`wg-week is-${size}`}>
      <div className="wg-cal__head">
        <button type="button" className="wg-ib is-sm" onClick={() => setOffset((o) => o - 1)} aria-label="Önceki hafta"><Icon name="chevronLeft" size={12} /></button>
        <b>{offset === 0 ? "Bu hafta" : offset === 1 ? "Gelecek hafta" : offset === -1 ? "Geçen hafta" : `${cols[0].date.toLocaleDateString("tr-TR", { day: "numeric", month: "short" })} haftası`}</b>
        <button type="button" className="wg-ib is-sm" onClick={() => setOffset((o) => o + 1)} aria-label="Sonraki hafta"><Icon name="chevronRight" size={12} /></button>
        {offset !== 0 && <button type="button" className="wg-link" onClick={() => setOffset(0)}>Bugün</button>}
        <span className="wg__grow" />
        <button type="button" className="wg-ib is-sm" onClick={() => W().quick.show("event")} aria-label="Yeni etkinlik" title="Yeni etkinlik"><Icon name="plus" size={12} /></button>
      </div>
      <div className="wg-week__grid">
        {cols.map((c) => (
          <div key={c.day} className={`wg-week__col${c.today ? " is-today" : ""}`} data-day={c.day}>
            <button type="button" className="wg-week__day" onClick={() => openApp("agenda")}><small>{c.date.toLocaleDateString("tr-TR", { weekday: "short" })}</small><b>{c.date.getDate()}</b></button>
            {max === 0 && c.items.length > 0 && <span className="wg-week__dots" aria-label={`${c.items.length} etkinlik`}>{c.items.slice(0, 3).map((e, i) => <i key={i} style={e.color ? { background: e.color } : undefined} />)}</span>}
            {c.items.slice(0, max).map((e) => (
              <button key={`${e.id}-${e.occurrence_start || e.start_at}`} type="button" className={`wg-week__ev${e.source === "project" ? " is-proj" : ""}`} style={e.color ? { "--ev": e.color } : undefined} onClick={() => openApp(e.project_id ? `projects:${e.project_id}` : "agenda")} title={e.title}>
                {!e.all_day && isBig(size) && <i>{new Date(e.occurrence_start || e.start_at).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}</i>}{e.title}
              </button>
            ))}
            {max > 0 && c.items.length > max && <small className="wg-muted">+{c.items.length - max}</small>}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------ ay ------------------------------ */

export function MonthWidget({ size }) {
  const signed = useSignedIn();
  const now = new Date();
  const [cur, setCur] = useState(() => ({ y: now.getFullYear(), m: now.getMonth() }));
  const [sel, setSel] = useState(isoDay(now));
  const from = new Date(cur.y, cur.m, 1 - ((new Date(cur.y, cur.m, 1).getDay() + 6) % 7));
  const q = useEvents(signed, from, dayStart(from, 42));
  const g = gate(signed, q);
  if (g) return g;
  const grid = monthGrid(cur.y, cur.m, q.data, now);
  const move = (n) => setCur((c) => { const d = new Date(c.y, c.m + n, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
  const dayItems = (q.data || []).filter((e) => isoDay(new Date(e.occurrence_start || e.start_at)) === sel);
  const maxDay = pick(size, 0, 3, 3);
  return (
    <div className={`wg-month is-${size}`}>
      <div className="wg-cal__head">
        <button type="button" className="wg-ib is-sm" onClick={() => move(-1)} aria-label="Önceki ay"><Icon name="chevronLeft" size={12} /></button>
        <b>{new Date(cur.y, cur.m, 1).toLocaleDateString("tr-TR", { month: "long", year: "numeric" })}</b>
        <button type="button" className="wg-ib is-sm" onClick={() => move(1)} aria-label="Sonraki ay"><Icon name="chevronRight" size={12} /></button>
      </div>
      <div className="wg-month__grid" role="grid" aria-label="Ay takvimi">
        {["Pt", "Sa", "Ça", "Pe", "Cu", "Ct", "Pz"].map((d) => <small key={d} className="wg-month__wd">{d}</small>)}
        {grid.map((c) => (
          <button key={c.day} type="button" role="gridcell" data-day={c.day} className={`wg-month__d${c.inMonth ? "" : " is-out"}${c.today ? " is-today" : ""}${c.weekend ? " is-we" : ""}${sel === c.day ? " is-sel" : ""}`}
            onClick={() => setSel(c.day)} onDoubleClick={() => openApp("agenda")} aria-label={`${c.day}${c.count ? `, ${c.count} etkinlik` : ""}`}>
            {c.date}{c.count > 0 && <i className="wg-month__dot" data-n={Math.min(c.count, 3)} />}
          </button>
        ))}
      </div>
      {maxDay > 0 && <div className="wg-month__day">
        <h5>{new Date(`${sel}T12:00`).toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long" })}</h5>
        {dayItems.length ? dayItems.slice(0, maxDay).map((e) => (
          <button key={`${e.id}-${e.occurrence_start || e.start_at}`} type="button" className="wg-row" onClick={() => openApp(e.project_id ? `projects:${e.project_id}` : "agenda")}>
            <span className="wg-row__time">{e.all_day ? "Gün boyu" : new Date(e.occurrence_start || e.start_at).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}</span><span className="wg-row__text">{e.title}</span>
          </button>
        )) : <p className="wg-muted">Plan yok</p>}
        {dayItems.length > maxDay && <small className="wg-muted">+{dayItems.length - maxDay} etkinlik</small>}
      </div>}
    </div>
  );
}
