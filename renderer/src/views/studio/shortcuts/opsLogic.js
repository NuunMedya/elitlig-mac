// Yayın Stüdyosu · İŞLETİM DÜĞMELERİ — saf yardımcılar (test edilir): maç yönetimi
// (devre süresi, uzatma, kart özeti, kadro / kaptan / kaleci yükü, topla oynama ve
// sayaçlar), röportaj (son konuklar), özet (seçim), sahne (otomatik dönüş, PiP
// katmanları), genel (kronometre, istem kartları).
import { other } from "./flowLogic";

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

/* ═════════════════════════ maç ═════════════════════════ */

export const MATCH_STATUSES = [
  { key: "zamanlanmis", label: "Zamanlandı", icon: "calendar", hint: "Maç henüz başlamadı" },
  { key: "canli", label: "Başladı", icon: "play", hint: "Maç canlı (saat başlar)" },
  { key: "devre", label: "Devre arası", icon: "pause", hint: "Saat devre süresinde durur" },
  { key: "bitti", label: "Bitti", icon: "flag", hint: "Skor tescil edilir (onaylı)" },
  { key: "ertelendi", label: "Ertelendi", icon: "ban", hint: "Sunucu destekliyorsa durum yazılır" },
];

/** Devre süresi (ms) ve maçın şu anki durumuna göre kalan süre. */
export const halfMs = (min) => Math.max(1, num(min, 25)) * 60_000;
export function periodInfo({ clockMs = 0, period = 1, halfMin = 25 } = {}) {
  const H = halfMs(halfMin);
  const p = Math.max(1, num(period, 1));
  const end = Math.min(p, 2) * H;
  const left = end - num(clockMs);
  return { endMs: end, leftMs: Math.max(0, left), overMs: Math.max(0, -left), over: left < 0, frac: Math.min(1, Math.max(0, 1 - left / H)) };
}
/** "45+2" biçimi: dakika, devre sonu dakikası, uzatma. */
export function stoppageLabel({ clockMs = 0, period = 1, halfMin = 25, added = 0 } = {}) {
  const i = periodInfo({ clockMs, period, halfMin });
  const endMin = Math.round(i.endMs / 60_000);
  if (i.over) return `${endMin}+${Math.ceil(i.overMs / 60_000)}`;
  return added ? `${endMin}+${added}` : `${Math.floor(num(clockMs) / 60_000)}'`;
}

/** Kart özeti: { home: { yellow, red, players: [{ id, name, yellow, red }] }, away: … }. */
export function cardsSummary(events, { homeTeamId, awayTeamId, nameOf = () => null } = {}) {
  const out = { home: { yellow: 0, red: 0, players: [] }, away: { yellow: 0, red: 0, players: [] } };
  const by = { home: new Map(), away: new Map() };
  for (const ev of events || []) {
    const code = String(ev?.olay_kodu || "").toUpperCase();
    if (code !== "YELLOW_CARD" && code !== "RED_CARD") continue;
    const tid = Number(ev.takim_id);
    const side = tid && tid === Number(homeTeamId) ? "home" : tid && tid === Number(awayTeamId) ? "away" : null;
    if (!side) continue;
    const k = code === "RED_CARD" ? "red" : "yellow";
    out[side][k] += 1;
    const pid = ev.oyuncu_id != null ? String(ev.oyuncu_id) : "";
    const cur = by[side].get(pid) || { id: pid, name: (pid && nameOf(pid)) || (pid ? `#${pid}` : "Oyuncusuz"), yellow: 0, red: 0, lastMinute: 0 };
    cur[k] += 1;
    cur.lastMinute = Math.max(cur.lastMinute, num(ev.dakika));
    by[side].set(pid, cur);
  }
  for (const s of ["home", "away"]) out[s].players = [...by[s].values()].sort((a, b) => b.red - a.red || b.yellow - a.yellow || b.lastMinute - a.lastMinute);
  return out;
}
/** İkinci sarı (kırmızıya dönmeli) uyarısı alan oyuncular. */
export const secondYellow = (summary) => ["home", "away"].flatMap((s) => (summary?.[s]?.players || []).filter((p) => p.yellow >= 2 && !p.red).map((p) => ({ ...p, side: s })));

/**
 * Kayıtlı kadro satırları (GET /kadro: { home: [row], away: [row] }) → POST /kadro gövdesi,
 * yamayla: patch(side, row) → row | null. Sunucu biçimi (buildLineupPayload ile aynı alanlar).
 */
export function lineupBody(lineup, patch = (s, r) => r) {
  const out = {};
  for (const side of ["home", "away"]) {
    out[side] = (lineup?.[side] || []).map((row) => patch(side, { ...row })).filter(Boolean).map((r) => {
      const id = Number(r.playerId ?? r.oyuncu_id ?? r.id);
      const n = Number(r.number);
      const role = r.role === "bench" ? "bench" : "starter";
      return {
        playerId: id, oyuncu_id: id, role,
        position: String(r.position || "").slice(0, 30),
        number: r.number === "" || r.number == null || !Number.isFinite(n) ? "" : n,
        captain: Boolean(r.captain),
        isGuest: Boolean(r.isGuest),
        ...(r.isGuest ? { guestName: r.guestName || r.playerName || "" } : {}),
      };
    }).filter((r) => r.playerId > 0);
  }
  return out;
}
const rowId = (r) => String(r?.playerId ?? r?.oyuncu_id ?? r?.id ?? "");
/** İlk 11 ↔ yedek yer değiştirme (çıkan yedeğe, giren ilk 11'e). */
export const swapLineup = (lineup, side, outId, inId) => lineupBody(lineup, (s, r) => {
  if (s !== side) return r;
  if (rowId(r) === String(outId)) return { ...r, role: "bench", captain: false };
  if (rowId(r) === String(inId)) return { ...r, role: "starter" };
  return r;
});
/** Kaptan (takımda tek). */
export const setCaptain = (lineup, side, id) => lineupBody(lineup, (s, r) => (s !== side ? r : { ...r, captain: rowId(r) === String(id) }));
/** Kaleci işareti: pozisyon "Kaleci" (başka kaleci varsa onun pozisyonu boşalır). */
export const KEEPER = "Kaleci";
export const isKeeper = (p) => /^(kaleci|gk|goalkeeper|k)$/i.test(String(p?.position || "").trim());
export const setKeeper = (lineup, side, id) => lineupBody(lineup, (s, r) => {
  if (s !== side) return r;
  if (rowId(r) === String(id)) return { ...r, position: KEEPER };
  return isKeeper(r) ? { ...r, position: "" } : r;
});

/** Topla oynama: { side: "home"|"away"|null, since, home, away } (ms). */
export const POSSESSION_ZERO = Object.freeze({ side: null, since: null, home: 0, away: 0 });
export function possessionSwitch(p, side, now = Date.now()) {
  const cur = { ...POSSESSION_ZERO, ...(p || {}) };
  if (cur.side && cur.since != null) cur[cur.side] += Math.max(0, now - cur.since);
  return { ...cur, side: side === "home" || side === "away" ? side : null, since: side === "home" || side === "away" ? now : null };
}
export function possessionPct(p, now = Date.now()) {
  const cur = { ...POSSESSION_ZERO, ...(p || {}) };
  const home = cur.home + (cur.side === "home" && cur.since != null ? now - cur.since : 0);
  const away = cur.away + (cur.side === "away" && cur.since != null ? now - cur.since : 0);
  const t = home + away;
  if (!t) return { home: 50, away: 50, totalMs: 0 };
  const h = Math.round((home / t) * 100);
  return { home: h, away: 100 - h, totalMs: t };
}
/** Sayaç: counters[side][key] += d (en az 0). */
export function bumpCounter(counters, side, key, d = 1) {
  const c = { home: { ...(counters?.home || {}) }, away: { ...(counters?.away || {}) } };
  c[side][key] = Math.max(0, num(c[side][key]) + d);
  return c;
}

/** Kısa ad (skorbord): harf / rakam, büyük, en çok n harf. */
export const shortCode = (s, n = 3) => String(s || "").toLocaleUpperCase("tr-TR").replace(/[^0-9A-ZÇĞİÖŞÜ]/g, "").slice(0, n);

/* ═════════════════════════ röportaj ═════════════════════════ */

/** Son konuklar: yeni başa, ad + görev eşsiz, en çok n. */
export function pushRecent(list, person, n = 8) {
  if (!person?.name) return list || [];
  const key = (p) => `${String(p.name).trim().toLocaleLowerCase("tr-TR")}|${String(p.role || "").trim().toLocaleLowerCase("tr-TR")}`;
  return [person, ...(list || []).filter((p) => key(p) !== key(person))].slice(0, n);
}

/* ═════════════════════════ özet ═════════════════════════ */

/** Seçimi aç / kapat (öğeler { replayId, angles }). */
export function toggleHighlight(items, replay, angles) {
  const list = items || [];
  if (list.some((x) => x.replayId === replay.id)) return list.filter((x) => x.replayId !== replay.id);
  return [...list, { replayId: replay.id, angles: angles && angles.length ? angles : [(replay.angles || []).find((a) => a.url)?.angle].filter(Boolean) }];
}

/* ═════════════════════════ sahne ═════════════════════════ */

/** Otomatik dönüş: listedeki sonraki sahne (yoksa ilki). */
export function nextInRotation(ids, currentId) {
  const list = (ids || []).filter(Boolean);
  if (!list.length) return null;
  const i = list.indexOf(currentId);
  return list[(i + 1) % list.length];
}
export const ROTATE_SECONDS = [5, 8, 10, 15, 20, 30, 60];
/** Sahnenin üst katmanları (taban dışı; PiP, logo…): tam ekran olmayan ya da ilk katmandan sonrakiler. */
export const pipLayers = (scene) => (scene?.layers || []).filter((l, i) => i > 0 && (l.w < 0.99 || l.h < 0.99 || l.x || l.y));

/* ═════════════════════════ genel ═════════════════════════ */

/** Kronometre: { running, since, acc, laps } → ms. */
export const SW_ZERO = Object.freeze({ running: false, since: null, acc: 0, laps: [] });
export const swElapsed = (sw, now = Date.now()) => num(sw?.acc) + (sw?.running && sw.since != null ? Math.max(0, now - sw.since) : 0);
export const swToggle = (sw, now = Date.now()) => (sw?.running ? { ...sw, running: false, since: null, acc: swElapsed(sw, now) } : { ...SW_ZERO, ...(sw || {}), running: true, since: now });
export const swLap = (sw, now = Date.now()) => ({ ...SW_ZERO, ...(sw || {}), laps: [swElapsed(sw, now), ...((sw?.laps) || [])].slice(0, 20) });
export const TIMER_PRESETS = [30, 60, 120, 300, 600, 900];

/** "01:05.3" (ondalıklı) ya da "1:02:03". */
export function swText(ms, tenths = true) {
  const t = Math.max(0, Math.floor(num(ms)));
  const h = Math.floor(t / 3_600_000);
  const m = Math.floor((t % 3_600_000) / 60_000);
  const s = Math.floor((t % 60_000) / 1000);
  const d = Math.floor((t % 1000) / 100);
  const mm = String(m).padStart(2, "0"), ss = String(s).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}${tenths ? `.${d}` : ""}`;
}

/** İstem kartları: [{ id, title, text }] (en çok 40). */
export function normalizeCues(raw) {
  return (Array.isArray(raw) ? raw : []).filter((c) => c && (c.title || c.text)).slice(0, 40).map((c, i) => ({ id: String(c.id || `cue${i}`), title: String(c.title || "").slice(0, 60), text: String(c.text || "").slice(0, 600) }));
}

export { other };
