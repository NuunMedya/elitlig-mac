// Odak Sayacı (ana süreç).
//
// Sayaç pencereden bağımsız çalışır: pencere kapalıyken de devam eder, menü
// çubuğunda kalan süre görünür ve süre dolunca macOS bildirimi gelir.
// Kipler: pomodoro (odak/kısa mola/uzun mola), timer (geri sayım), stopwatch.
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { EventEmitter } = require("node:events");

const MIN = 60000;
const DEFAULTS = { focus: 25, short: 5, long: 15, longEvery: 4, timer: 10 };

const todayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function createFocus({ dataDir, now = () => Date.now() }) {
  const file = path.join(dataDir, "focus.json");
  const events = new EventEmitter();
  let saved = {};
  try { saved = JSON.parse(fs.readFileSync(file, "utf8")); } catch { /* ilk açılış */ }

  const state = {
    mode: "pomodoro",
    phase: "focus", // focus | short | long
    running: false,
    startedAt: null,
    endsAt: null,
    remainingMs: (saved.settings?.focus || DEFAULTS.focus) * MIN,
    elapsedMs: 0,
    round: 1,
    label: "",
    settings: { ...DEFAULTS, ...(saved.settings || {}) },
    stats: saved.stats?.day === todayKey() ? saved.stats : { day: todayKey(), sessions: 0, minutes: 0 },
    history: Array.isArray(saved.history) ? saved.history.slice(-200) : [],
    laps: [],
  };

  const persist = () => {
    try { fs.writeFileSync(file, JSON.stringify({ settings: state.settings, stats: state.stats, history: state.history })); } catch { /* yoksay */ }
  };

  const phaseMs = (phase) => (state.mode === "timer" ? state.settings.timer : state.settings[phase] || DEFAULTS.focus) * MIN;

  const snapshot = () => {
    const t = now();
    const remainingMs = state.running && state.endsAt ? Math.max(0, state.endsAt - t) : state.remainingMs;
    const elapsedMs = state.running && state.mode === "stopwatch" ? state.elapsedMs + (t - state.startedAt) : state.elapsedMs;
    if (state.stats.day !== todayKey()) state.stats = { day: todayKey(), sessions: 0, minutes: 0 };
    return { ...state, remainingMs, elapsedMs, totalMs: state.mode === "stopwatch" ? null : phaseMs(state.phase) };
  };

  const emit = () => events.emit("state", snapshot());

  const reset = (phase = state.mode === "pomodoro" ? "focus" : state.phase) => {
    state.running = false;
    state.phase = phase;
    state.startedAt = null;
    state.endsAt = null;
    state.elapsedMs = 0;
    state.laps = [];
    state.remainingMs = state.mode === "stopwatch" ? 0 : phaseMs(phase);
    emit();
  };

  const start = () => {
    if (state.running) return;
    state.running = true;
    state.startedAt = now();
    if (state.mode !== "stopwatch") state.endsAt = state.startedAt + state.remainingMs;
    emit();
  };

  const pause = () => {
    if (!state.running) return;
    const t = now();
    if (state.mode === "stopwatch") state.elapsedMs += t - state.startedAt;
    else state.remainingMs = Math.max(0, state.endsAt - t);
    state.running = false;
    state.startedAt = null;
    state.endsAt = null;
    emit();
  };

  /** Süresi dolan evreyi kapatır; pomodoroda bir sonraki evreyi hazırlar. */
  const complete = () => {
    const finished = state.phase;
    const minutes = Math.round(phaseMs(finished) / MIN);
    state.running = false;
    state.endsAt = null;
    if (state.mode === "pomodoro" && finished === "focus") {
      state.stats.sessions += 1;
      state.stats.minutes += minutes;
      state.history.push({ at: new Date(now()).toISOString(), minutes, label: state.label || null });
      state.history = state.history.slice(-200);
      persist();
      const next = state.round % state.settings.longEvery === 0 ? "long" : "short";
      events.emit("finished", { phase: finished, next, minutes, label: state.label });
      reset(next);
    } else if (state.mode === "pomodoro") {
      state.round += 1;
      events.emit("finished", { phase: finished, next: "focus", minutes });
      reset("focus");
    } else {
      events.emit("finished", { phase: "timer", minutes });
      reset();
    }
  };

  const tick = () => {
    if (state.running && state.mode !== "stopwatch" && now() >= state.endsAt) complete();
    else if (state.running) emit();
  };

  const command = (name, args = {}) => {
    switch (name) {
      case "start": start(); break;
      case "pause": pause(); break;
      case "toggle": (state.running ? pause : start)(); break;
      case "reset": state.round = 1; reset(state.mode === "pomodoro" ? "focus" : state.phase); break;
      case "skip":
        // Atlanan evre istatistiğe yazılmaz.
        if (state.mode === "pomodoro") {
          const next = state.phase === "focus" ? (state.round % state.settings.longEvery === 0 ? "long" : "short") : "focus";
          if (state.phase !== "focus") state.round += 1;
          reset(next);
        }
        break;
      case "lap": if (state.mode === "stopwatch") { state.laps = [snapshot().elapsedMs, ...state.laps].slice(0, 50); emit(); } break;
      case "mode":
        if (["pomodoro", "timer", "stopwatch"].includes(args.mode)) { state.mode = args.mode; state.round = 1; reset(args.mode === "pomodoro" ? "focus" : "focus"); }
        break;
      case "phase": if (state.mode === "pomodoro" && ["focus", "short", "long"].includes(args.phase)) reset(args.phase); break;
      case "label": state.label = String(args.label || "").slice(0, 80); emit(); break;
      case "settings": {
        const next = { ...state.settings };
        for (const key of Object.keys(DEFAULTS)) {
          const v = Number(args[key]);
          if (Number.isFinite(v) && v > 0 && v <= 600) next[key] = Math.round(v);
        }
        state.settings = next;
        persist();
        if (!state.running) reset(state.phase);
        break;
      }
      default: break;
    }
    return snapshot();
  };

  return { command, snapshot, tick, events };
}

/** Menü çubuğunda gösterilen kısa metin. */
function trayTitle(s) {
  const ms = s.mode === "stopwatch" ? s.elapsedMs : s.remainingMs;
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  const clock = `${h ? `${h}:` : ""}${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return s.running ? ` ${clock}` : "";
}

module.exports = { createFocus, trayTitle, DEFAULTS };
