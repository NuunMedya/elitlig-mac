// Yayın Stüdyosu · ORTAK SANİYE SAATİ (2.35.0).
//
// Maç saati gibi saniyede bir değişen değerler stüdyo KÖKÜNDE durum olarak tutulunca bütün
// stüdyo ağacı (yüzlerce bileşen, dock panelleri) her saniye yeniden çiziliyordu. Artık kök
// yalnız DAKİKA değişince güncellenir; saniyeyi gösteren küçük bileşenler bu ortak saate
// abone olur (useSyncExternalStore; tek setInterval, abone yokken durur).
import React, { useSyncExternalStore } from "react";
import { timerNowMs } from "../../../lib/studio/match";
import { clockText } from "../../../lib/studio/scorebug";

const subs = new Set();
let now = Date.now();
let timer = 0;

function start() {
  if (timer || typeof setInterval !== "function") return;
  now = Date.now();
  // Saniye sınırına hizalı ilk tik; sonra 1 sn.
  timer = setTimeout(function tick() {
    now = Date.now();
    for (const f of [...subs]) { try { f(); } catch { /* yoksay */ } }
    timer = subs.size ? setTimeout(tick, 1000 - (Date.now() % 1000) + 5) : 0;
  }, 1000 - (now % 1000) + 5);
}

function subscribe(f) {
  subs.add(f);
  start();
  return () => {
    subs.delete(f);
    if (!subs.size && timer) { clearTimeout(timer); timer = 0; }
  };
}
const read = () => now;

/** Saniyede bir değişen ortak "şimdi" (ms). active=false iken abone olmaz (sabit değer). */
export function useSecondNow(active = true) {
  const v = useSyncExternalStore(active ? subscribe : noopSub, read, read);
  return active ? v : now;
}
const noopSub = () => () => {};

/** Canlı maç saati metni ("33:04"): yalnız bu metin saniyede bir çizilir. */
export function LiveClockText({ timer: t, fallbackMs = 0 }) {
  useSecondNow(Boolean(t?.running)); // abonelik: saniyede bir yalnız bu metin yeniden çizilir
  const ms = t ? timerNowMs(t, Date.now()) : fallbackMs;
  return React.createElement(React.Fragment, null, clockText(ms));
}

/** Test / tanılama: abone sayısı. */
export const clockSubscribers = () => subs.size;
