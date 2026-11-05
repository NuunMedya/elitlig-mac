// Yayın Stüdyosu — MAÇ ÖZETİ ("Özet çıkar") planı (saf yardımcılar).
//
// Seçilen tekrarlar (varsayılan: tüm goller + "özete ekle" işaretli önemli
// anlar) sırayla, seçilen açılarla 1920×1080 ekran dışı tuvalde oynatılır:
//
//   [giriş kartı] ⟶ klip 1 ⟶ klip 2 … ⟶ [kapanış kartı]
//              ElitLig logo geçişi her sınırın tam ortasında
//
// Klip boyunca orta-alt büyük skorbord o anın skorunu gösterir (golün olayı
// varsa o gol dahil; önemli anda kaydın dakikasına kadarki goller).
// Tuval MediaRecorder ile kaydedilir, parçalar studio.render'a gider.
import { STINGER_MS } from "./stinger";
import { isGoalCode, sortEvents } from "./match";
import { PROGRAM_ANGLE, defaultAngles } from "./replays";

export const HIGHLIGHT_SIZE = Object.freeze({ width: 1920, height: 1080, fps: 30, videoBitrateKbps: 8000 });
export const INTRO_MS = 3500;
export const OUTRO_MS = 3500;
export const MIN_CLIP_MS = 1500;

/** Olaylardan, verilen olay DAHİL o ana kadarki skor; olay yoksa null. */
export function scoreThroughEvent(events, eventId, homeTeamId, awayTeamId) {
  const sorted = [...(events || [])].sort(sortEvents);
  const idx = sorted.findIndex((e) => Number(e.id) === Number(eventId));
  if (idx < 0) return null;
  return countGoals(sorted.slice(0, idx + 1), homeTeamId, awayTeamId);
}

/** Devre + dakikaya kadar (dahil) atılan goller. */
export function scoreAtMinute(events, { period = 1, minute = 0 } = {}, homeTeamId, awayTeamId) {
  const p = Number(period) || 1;
  const m = Number(minute) || 0;
  const upto = (events || []).filter((e) => {
    const ep = Number(e.devre) || 1;
    const em = Number(e.dakika) || 0;
    return ep < p || (ep === p && em <= m);
  });
  return countGoals(upto, homeTeamId, awayTeamId);
}

function countGoals(list, homeTeamId, awayTeamId) {
  let home = 0;
  let away = 0;
  for (const ev of list) {
    const code = String(ev.olay_kodu || "").toUpperCase();
    if (!isGoalCode(code)) continue;
    const own = code === "GOAL_OWN";
    const tid = Number(ev.takim_id);
    if (tid && tid === Number(homeTeamId)) { if (own) away += 1; else home += 1; }
    else if (tid && tid === Number(awayTeamId)) { if (own) home += 1; else away += 1; }
  }
  return { home, away };
}

/**
 * Tekrarın anındaki skor: olay → o gol dahil; meta dakikası → o dakikaya
 * kadar; bilinmiyorsa son skor (fallback).
 */
export function scoreForReplay(replay, meta, { events, homeTeamId, awayTeamId, fallback = { home: 0, away: 0 } }) {
  if (replay?.eventId) {
    const s = scoreThroughEvent(events, replay.eventId, homeTeamId, awayTeamId);
    if (s) return s;
  }
  if (meta && meta.minute != null) return scoreAtMinute(events, { period: meta.period, minute: meta.minute }, homeTeamId, awayTeamId);
  return { ...fallback };
}

/** Golcü satırları için: verilen olay dahil o ana kadarki olaylar. */
export function eventsUntil(events, replay, meta) {
  const sorted = [...(events || [])].sort(sortEvents);
  if (replay?.eventId) {
    const idx = sorted.findIndex((e) => Number(e.id) === Number(replay.eventId));
    if (idx >= 0) return sorted.slice(0, idx + 1);
  }
  if (meta && meta.minute != null) {
    const p = Number(meta.period) || 1;
    return sorted.filter((e) => (Number(e.devre) || 1) < p || ((Number(e.devre) || 1) === p && (Number(e.dakika) || 0) <= Number(meta.minute)));
  }
  return sorted;
}

/**
 * Varsayılan özet listesi: bu maçın tüm golleri + "özete ekle" işaretli anlar,
 * eskiden yeniye; her biri tercih edilen açılarla.
 * Dönüş: [{ replayId, angles: [...] }]
 */
export function defaultHighlightItems(replays, { preferredAngles = [PROGRAM_ANGLE], include = () => true } = {}) {
  return [...(replays || [])]
    .filter((r) => include(r) && (r.kind === "goal" || r.inSummary) && r.angles.some((a) => a.url))
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((r) => ({ replayId: r.id, angles: defaultAngles(r, preferredAngles) }));
}

/** Listede öğe taşı (sürükle-bırak ya da yukarı / aşağı). */
export function moveItem(list, from, to) {
  if (from === to || from < 0 || from >= list.length) return list;
  const next = [...list];
  const [it] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(next.length, to)), 0, it);
  return next;
}

/**
 * Oynatma planı. Her (tekrar, açı) bir klip parçasıdır; parçalar arka arkaya,
 * logo geçişi her sınırın ortasına denk gelir (yarısı önceki, yarısı sonraki
 * parçanın üstünde).
 *   segments: [{ type: "intro" | "clip" | "outro", start, end, ms, ... }]
 *   stingers: [{ start, end, at }]
 */
export function buildHighlightPlan({ items, replays, introMs = INTRO_MS, outroMs = OUTRO_MS, stingerMs = STINGER_MS, scoreOf = () => null }) {
  const byId = new Map((replays || []).map((r) => [r.id, r]));
  const segments = [];
  let t = 0;
  const push = (seg) => {
    const ms = Math.max(seg.type === "clip" ? MIN_CLIP_MS : stingerMs, Math.round(seg.ms));
    segments.push({ ...seg, start: t, end: t + ms, ms });
    t += ms;
  };
  push({ type: "intro", ms: introMs });
  for (const item of items || []) {
    const r = byId.get(item.replayId);
    if (!r) continue;
    for (const angle of item.angles || []) {
      const a = r.angles.find((x) => x.angle === angle && x.url);
      if (!a) continue;
      push({ type: "clip", replayId: r.id, angle, url: a.url, ms: a.durationMs || r.durationMs || 10_000, replay: r, score: scoreOf(r) });
    }
  }
  push({ type: "outro", ms: outroMs });
  const stingers = [];
  for (let i = 1; i < segments.length; i += 1) {
    const at = segments[i].start;
    stingers.push({ at, start: at - stingerMs / 2, end: at + stingerMs / 2 });
  }
  return { segments, stingers, durationMs: t, clipCount: segments.filter((s) => s.type === "clip").length };
}

/** Planın t anı: { index, segment, local (ms), stinger: 0…1 | null, done }. */
export function planAt(plan, t) {
  const segs = plan.segments;
  if (!segs.length) return { index: -1, segment: null, local: 0, stinger: null, done: true };
  if (t >= plan.durationMs) return { index: segs.length - 1, segment: segs[segs.length - 1], local: segs[segs.length - 1].ms, stinger: null, done: true };
  let index = segs.findIndex((s) => t >= s.start && t < s.end);
  if (index < 0) index = 0;
  const st = plan.stingers.find((x) => t >= x.start && t < x.end);
  return { index, segment: segs[index], local: Math.max(0, t - segs[index].start), stinger: st ? (t - st.start) / (st.end - st.start) : null, done: false };
}

/** "1:05" */
export const mmss = (ms) => {
  const s = Math.max(0, Math.round((Number(ms) || 0) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** Özet dosya adı: "ozet-<maç>-<zaman>.mp4" (yükleme ana süreçte bu adla). */
export const highlightName = (matchId, now = Date.now()) => `ozet-${Number(matchId) || 0}-${now.toString(36)}`;
