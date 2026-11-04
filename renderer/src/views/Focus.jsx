// Odak Sayacı: pomodoro, geri sayım ve kronometre. Sayaç ana süreçte çalışır;
// pencere kapalıyken de menü çubuğunda kalan süre görünür, bitince bildirim gelir.
import React, { useEffect, useState } from "react";
import { Field, Icon, Segmented, ViewHeader } from "../components/ui";
import { formatClock, formatTime } from "../lib/helpers";

const PHASES = [{ value: "focus", label: "Odak" }, { value: "short", label: "Kısa mola" }, { value: "long", label: "Uzun mola" }];

export default function Focus() {
  const [s, setS] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  useEffect(() => {
    window.elitlig.focus.state().then(setS);
    return window.elitlig.focus.onState(setS);
  }, []);
  useEffect(() => {
    const onKey = (e) => {
      if (e.target?.closest?.("input, textarea, select, button")) return;
      if (e.code === "Space") { e.preventDefault(); window.elitlig.focus.command("toggle"); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  if (!s) return null;

  const cmd = (name, args) => window.elitlig.focus.command(name, args).then(setS);
  const stopwatch = s.mode === "stopwatch";
  const shown = stopwatch ? s.elapsedMs : s.remainingMs;
  const progress = stopwatch || !s.totalMs ? 0 : 1 - s.remainingMs / s.totalMs;
  const R = 120;
  const C = 2 * Math.PI * R;
  const todayHistory = (s.history || []).filter((h) => new Date(h.at).toDateString() === new Date().toDateString()).reverse();

  return (
    <div className="view view--focus">
      <ViewHeader title="Odak Sayacı" subtitle="Boşluk tuşu başlatır/duraklatır. Sayaç menü çubuğunda da görünür.">
        <Segmented value={s.mode} onChange={(mode) => cmd("mode", { mode })} size="sm" options={[{ value: "pomodoro", label: "Pomodoro" }, { value: "timer", label: "Geri sayım" }, { value: "stopwatch", label: "Kronometre" }]} />
        <button type="button" className="icon-btn" title="Süreler" onClick={() => setSettingsOpen((v) => !v)}><Icon name="sliders" /></button>
      </ViewHeader>

      <div className="focus-layout">
        <section className={`focus-dial focus-dial--${s.phase} ${s.running ? "is-running" : ""}`}>
          {s.mode === "pomodoro" && <Segmented value={s.phase} onChange={(phase) => cmd("phase", { phase })} size="sm" options={PHASES} />}
          <svg viewBox="0 0 280 280" className="focus-ring" aria-hidden="true">
            <circle cx="140" cy="140" r={R} className="focus-ring__track" />
            {!stopwatch && <circle cx="140" cy="140" r={R} className="focus-ring__bar" strokeDasharray={C} strokeDashoffset={C * (1 - progress)} transform="rotate(-90 140 140)" />}
          </svg>
          <div className="focus-time">
            <strong>{formatClock(shown, stopwatch)}</strong>
            <span>{s.mode === "pomodoro" ? `${PHASES.find((p) => p.value === s.phase)?.label} · ${s.round}. tur` : stopwatch ? "Kronometre" : "Geri sayım"}</span>
            {s.running && s.endsAt && <small>Bitiş {formatTime(s.endsAt)}</small>}
          </div>
          <input className="focus-label" value={s.label} onChange={(e) => cmd("label", { label: e.target.value })} placeholder="Ne üzerinde çalışıyorsunuz?" />
          <div className="focus-controls">
            <button type="button" className="icon-btn icon-btn--lg" title="Sıfırla" onClick={() => cmd("reset")}><Icon name="rotate" size={20} /></button>
            <button type="button" className="focus-play" onClick={() => cmd("toggle")} aria-label={s.running ? "Duraklat" : "Başlat"}><Icon name={s.running ? "pause" : "play"} size={30} /></button>
            {stopwatch ? (
              <button type="button" className="icon-btn icon-btn--lg" title="Tur" disabled={!s.running} onClick={() => cmd("lap")}><Icon name="flag" size={20} /></button>
            ) : (
              <button type="button" className="icon-btn icon-btn--lg" title="Atla" disabled={s.mode !== "pomodoro"} onClick={() => cmd("skip")}><Icon name="skip" size={20} /></button>
            )}
          </div>
          {stopwatch && s.laps?.length > 0 && (
            <ol className="laps">{s.laps.map((lap, i) => <li key={i}><span>Tur {s.laps.length - i}</span><strong>{formatClock(lap, true)}</strong></li>)}</ol>
          )}
        </section>

        <aside className="focus-side">
          {settingsOpen && (
            <section className="card">
              <h3 className="card__title">Süreler (dakika)</h3>
              <div className="form-grid">
                {[["focus", "Odak"], ["short", "Kısa mola"], ["long", "Uzun mola"], ["longEvery", "Uzun mola her … turda"], ["timer", "Geri sayım"]].map(([key, label]) => (
                  <Field key={key} label={label}><input type="number" min="1" max="600" defaultValue={s.settings[key]} onBlur={(e) => cmd("settings", { [key]: e.target.value })} /></Field>
                ))}
              </div>
            </section>
          )}
          <section className="card">
            <h3 className="card__title">Bugün</h3>
            <div className="focus-mini">
              <div><strong>{s.stats.sessions}</strong><span>tur</span></div>
              <div><strong>{s.stats.minutes}</strong><span>dakika</span></div>
            </div>
            {todayHistory.length > 0 && (
              <ul className="focus-history">{todayHistory.map((h, i) => <li key={i}><span>{formatTime(h.at)}</span><span>{h.label || "Odak"}</span><strong>{h.minutes} dk</strong></li>)}</ul>
            )}
          </section>
          <section className="card">
            <h3 className="card__title">Maç süresi</h3>
            <p className="muted small">Halı saha maçı için hızlı geri sayım:</p>
            <div className="row-gap">
              {[20, 25, 30, 45].map((m) => <button key={m} type="button" className="btn btn--sm" onClick={async () => { await cmd("mode", { mode: "timer" }); await cmd("settings", { timer: m }); cmd("start"); }}>{m} dk</button>)}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
