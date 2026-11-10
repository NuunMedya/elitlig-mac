// Zamanlayıcı / kronometre: uygulamanın Odak Sayacı'nı (ana süreç, app/focus.js) yönetir;
// menü çubuğunda kalan süre görünür, süre dolunca bildirim gelir.
import React, { useEffect, useState } from "react";
import { Icon } from "../../components/ui";
import { formatClock } from "../../lib/helpers";

const PRESETS = [1, 3, 5, 10, 15, 25, 45, 60];
const MODE_LABEL = { pomodoro: "Pomodoro", timer: "Zamanlayıcı", stopwatch: "Kronometre" };

export default function TimerTool() {
  const focus = window.elitlig?.focus;
  const [s, setS] = useState(null);
  useEffect(() => {
    if (!focus) return undefined;
    focus.state().then(setS).catch(() => {});
    return focus.onState(setS);
  }, [focus]);
  if (!focus) return null;
  const cmd = (name, args) => focus.command(name, args).then(setS);
  const startTimer = async (min) => {
    await focus.command("mode", { mode: "timer" });
    await focus.command("settings", { timer: min });
    cmd("start");
  };
  const startMode = async (mode) => { await focus.command("mode", { mode }); cmd("start"); };
  const ms = s ? (s.mode === "stopwatch" ? s.elapsedMs : s.remainingMs) : 0;
  return (
    <div className="tk-timer">
      <div className={`tk-timer__face${s?.running ? " is-on" : ""}`}>
        <span>{s ? `${MODE_LABEL[s.mode]}${s.mode === "pomodoro" ? ` · ${s.phase === "focus" ? "odak" : s.phase === "short" ? "kısa mola" : "uzun mola"}` : ""}` : "…"}</span>
        <strong>{formatClock(ms)}</strong>
        <div className="tk-text__bar">
          <button type="button" className="btn btn--sm btn--primary" onClick={() => cmd("toggle")}><Icon name={s?.running ? "pause" : "play"} size={12} /> {s?.running ? "Duraklat" : "Başlat"}</button>
          <button type="button" className="btn btn--sm" onClick={() => cmd("reset")}><Icon name="rotate" size={12} /> Sıfırla</button>
          {s?.mode === "stopwatch" && <button type="button" className="btn btn--sm" onClick={() => cmd("lap")} disabled={!s.running}><Icon name="flag" size={12} /> Tur</button>}
        </div>
        {s?.mode === "stopwatch" && s.laps?.length > 0 && <ol className="tk-laps">{s.laps.slice(0, 4).map((l, i) => <li key={l}>Tur {s.laps.length - i}: {formatClock(l)}</li>)}</ol>}
      </div>
      <section className="tk-sub">
        <h4>Zamanlayıcı</h4>
        <div className="tk-chips">{PRESETS.map((m) => <button key={m} type="button" className="tk-chip" onClick={() => startTimer(m)}>{m} dk</button>)}</div>
      </section>
      <div className="tk-text__bar">
        <button type="button" className="btn btn--sm" onClick={() => startMode("stopwatch")}><Icon name="timer" size={12} /> Kronometre</button>
        <button type="button" className="btn btn--sm" onClick={() => startMode("pomodoro")}><Icon name="target" size={12} /> Pomodoro ({s?.settings?.focus || 25} dk)</button>
        <button type="button" className="btn btn--sm btn--ghost" onClick={() => window.elitlig.app.showMain("focus")}><Icon name="external" size={12} /> Odak Sayacı</button>
      </div>
    </div>
  );
}
