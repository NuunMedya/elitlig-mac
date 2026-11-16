// Yayın Stüdyosu · ORTAK YANIP SÖNME (2.35.0) — bkz. blink.css.
// Tek zamanlayıcı <html data-st-blink="0|1"> değiştirir; yalnız yanıp sönen bir öğe varken.
import "./blink.css";

export const BLINK_SELECTOR = ".au-dot, .mg-live__dot, .st-w__state > i.is-rec, .wx-dot.is-rec, .wx-recdot.is-on, .st-pill.is-live i, .st-iv.is-rec i, .gx-dot, .rdk-dot, .rpx-flow__s i, .rpx-stage.is-air i, .rpx-health.is-risk i, .md-chip.is-live i, .md-state.is-on i, .st-w.is-blink, .st-w.st-wptt.is-on, .wx-kill.is-on, .wx-var__go.is-air, .wx-outmute.is-on, .st-var-top.is-on, .st-micwarn, .st-outmute.is-on";
export const BLINK_MS = 700;

let users = 0;
let timer = 0;
let phase = 0;

function tick() {
  const root = typeof document !== "undefined" ? document.documentElement : null;
  if (!root) return;
  const reduce = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const any = !reduce && !document.hidden && document.querySelector(BLINK_SELECTOR);
  phase = any ? 1 - phase : 0;
  const v = String(phase);
  if (root.dataset.stBlink !== v) root.dataset.stBlink = v;
}

/** Stüdyo açılınca çağrılır; dönüş: bırak (son kullanıcı bırakınca zamanlayıcı durur). */
export function startBlink() {
  users += 1;
  if (!timer && typeof setInterval === "function") timer = setInterval(tick, BLINK_MS);
  return () => {
    users = Math.max(0, users - 1);
    if (!users && timer) {
      clearInterval(timer);
      timer = 0;
      try { delete document.documentElement.dataset.stBlink; } catch { /* yoksay */ }
    }
  };
}
