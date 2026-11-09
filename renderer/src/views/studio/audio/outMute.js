// Yayın Stüdyosu — "DIŞARI GİDEN TÜM SESLERİ KAPAT" (yerel çıkış: hoparlör / kulaklık).
//
// Yayın karışımından AYRI: gol müziği, müzik çalar (iki oynatıcı + gizli müzik penceresi), program /
// önizleme dinlemesi, video / tekrar yerel oynatımı, röportaj gözden geçirme, sayfadaki her
// HTMLMediaElement / WebAudio çıkışı hoparlöre gitmez; yayına giden ses değişmez.
//   kapsam "local"  yalnız dışarı giden (varsayılan)
//   kapsam "all"    "Yayın dahil hepsi": ayrıca karıştırıcının TÜMÜNÜ KAPAT'ı (yayına da ses gitmez)
//
// Uygulama: Electron'da ana süreç bütün pencerelerin ses çıkışını kapatır (app/studio/outmute.js ·
// webContents.setAudioMuted). Köprü yoksa (tarayıcı / sınama) karıştırıcının dinleme çıkışı kısılır.
// Durum oturum boyu (sessionStorage): uygulama yeniden açılınca ses açık başlar.
import { useSyncExternalStore } from "react";

export const OUT_MUTE_KEY = "studio.outMute.v1";
export const OUT_MUTE_SCOPES = [
  { key: "local", label: "Yalnız dışarı giden", hint: "Hoparlör / kulaklık susar, yayın sesi değişmez" },
  { key: "all", label: "Yayın dahil hepsi", hint: "Hoparlör + yayına giden bütün ses (Tümünü kapat)" },
];
const ss = () => { try { return typeof sessionStorage !== "undefined" ? sessionStorage : null; } catch { return null; } };
const bridge = () => { try { return window.elitlig?.studio?.outMute || null; } catch { return null; } };

export function normalizeOutMute(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  return { on: Boolean(r.on), scope: r.scope === "all" ? "all" : "local" };
}

let state = null;
const listeners = new Set();
const read = () => {
  if (state) return state;
  try { state = normalizeOutMute(JSON.parse(ss()?.getItem(OUT_MUTE_KEY) || "null")); } catch { state = normalizeOutMute(null); }
  return state;
};
export const getOutMute = () => read();
export function subscribeOutMute(fn) { listeners.add(fn); return () => listeners.delete(fn); }

/** Ana sürece uygula (köprü varsa). Sonuç: { ok, native }. */
export async function applyNative(on) {
  const b = bridge();
  if (!b?.set) return { ok: true, native: false };
  try { const r = await b.set(Boolean(on)); return { ok: r?.ok !== false, native: true }; } catch { return { ok: false, native: true }; }
}

/** Durumu değiştir: setOutMute(true | false | "toggle", { scope }). */
export function setOutMute(on, { scope } = {}) {
  const cur = read();
  const nextOn = on === "toggle" ? !cur.on : Boolean(on);
  const next = normalizeOutMute({ on: nextOn, scope: scope || cur.scope });
  if (next.on === cur.on && next.scope === cur.scope) return cur;
  state = next;
  try { ss()?.setItem(OUT_MUTE_KEY, JSON.stringify(next)); } catch { /* yoksay */ }
  applyNative(next.on);
  for (const l of [...listeners]) l();
  return next;
}
export const toggleOutMute = (opts) => setOutMute("toggle", opts);

export const useOutMute = () => useSyncExternalStore(subscribeOutMute, read, read);

/** Durum metni (üst çubuk / parçacık). */
export const outMuteLabel = (s) => (s?.on ? (s.scope === "all" ? "TÜM SES KAPALI" : "DIŞ SES KAPALI") : "DIŞ SES AÇIK");
