// Yayın Stüdyosu — maç verisi kuralları (mobil reji lib/api/admin/matches.ts,
// components/admin/matches/model.ts ve useLiveMatch ile birebir; saf işlevler).
//
//   GET  /api/maclar/:id            maç kaydı (önbelleksiz)
//   GET  /api/maclar/:id/olaylar    olaylar          POST / DELETE olay
//   GET  /api/maclar/:id/kadro      kadro (home / away)
//   GET  /api/maclar/:id/timer      sayaç            PUT, POST /timer/period
//   PATCH /maclar/:id               durum ve skor
//   GET  /api/live-matches/:id/snapshot   takım armaları (teams.home.logo)

import { teamShortCode } from "./scorebug";

export const HALF_MS = 25 * 60 * 1000;
export const BUG_EVENT_MS = 12_000;

/** Sunucu "zamanlandı"yı iki yazımla saklar. */
export function normalizeMatchStatus(raw) {
  const s = String(raw ?? "").trim().toLowerCase();
  if (!s) return null;
  if (s === "taslak" || s === "draft") return "taslak";
  if (s.startsWith("zamanlan") || s === "planlandi" || s === "scheduled") return "zamanlanmis";
  if (s.startsWith("canl") || s === "live") return "canli";
  if (s.startsWith("yay") || s === "bitti" || s === "published") return "yayinlanmis";
  return null;
}

/** Skor elle ya da hükmen tescil edildiyse olaylar skoru değiştirmez. */
export const isManualResult = (match) => Boolean(match?.score_source) && match?.score_source !== "events";

export const isGoalCode = (code) => String(code || "").toUpperCase().startsWith("GOAL_");

/** Olaylardan skor: kendi kalesine gol rakibin hanesine yazılır. */
export function scoreFromEvents(events, homeTeamId, awayTeamId) {
  let home = 0;
  let away = 0;
  for (const ev of events || []) {
    const code = String(ev.olay_kodu).toUpperCase();
    if (!code.startsWith("GOAL_")) continue;
    const own = code === "GOAL_OWN";
    const tid = Number(ev.takim_id);
    if (tid && tid === Number(homeTeamId)) { if (own) away += 1; else home += 1; }
    else if (tid && tid === Number(awayTeamId)) { if (own) home += 1; else away += 1; }
  }
  return { home, away };
}

export const sortEvents = (a, b) =>
  (Number(a.devre) || 1) - (Number(b.devre) || 1) ||
  (Number(a.dakika) || 0) - (Number(b.dakika) || 0) ||
  Number(a.id) - Number(b.id);

/** Sayaçtaki anlık süre (ms). */
export function timerNowMs(timer, now = Date.now()) {
  if (!timer) return 0;
  const base = Number(timer.base_ms) || 0;
  if (!timer.running || !timer.base_at) return base;
  const at = new Date(timer.base_at).getTime();
  return Number.isFinite(at) ? base + Math.max(0, now - at) : base;
}

export const PHASE_LABEL = {
  notStarted: "Başlamadı",
  kickoff: "Başlama bekleniyor",
  first: "1. yarı",
  halftime: "Devre arası",
  second: "2. yarı",
  extra: "Uzatma",
  paused: "Saat durdu",
  finished: "Maç bitti",
};

/** Maçın reji aşaması (mobil useLiveMatch phase ile aynı). */
export function livePhase({ status, period, running, clockMs }) {
  const p = Number(period) > 0 ? Number(period) : 1;
  if (status === "yayinlanmis") return "finished";
  if (status !== "canli") return "notStarted";
  if (p >= 3) return running ? "extra" : "paused";
  if (p === 2) return running ? "second" : "paused";
  if (running) return "first";
  if (!clockMs) return "kickoff";
  return clockMs >= HALF_MS ? "halftime" : "paused";
}

/** Aşamaya göre ana düğme. finish: onaylı "Maçı bitir". */
export function primaryControl(phase) {
  switch (phase) {
    case "notStarted": return { label: "Maçı başlat", icon: "play", action: "start" };
    case "kickoff": return { label: "1. yarıyı başlat", icon: "play", action: "kickoff" };
    case "first": return { label: "Devre arası", icon: "pause", action: "halftime" };
    case "halftime": return { label: "2. yarıyı başlat", icon: "skip", action: "second" };
    case "paused": return { label: "Saati sürdür", icon: "play", action: "resume" };
    case "second":
    case "extra": return { label: "Maçı bitir", icon: "flag", finish: true };
    case "finished": return { label: "Tekrar canlıya al", icon: "refresh", action: "reopen" };
    default: return { label: "Maçı başlat", icon: "play", action: "start" };
  }
}

/**
 * Eylemin sunucu adımları (sıra önemli). Her adım:
 *   { kind: "match", body } → PATCH /maclar/:id
 *   { kind: "timer", running, baseMs } → PUT /api/maclar/:id/timer
 *   { kind: "period", period } → POST /api/maclar/:id/timer/period
 */
export function controlSteps(action, { clockMs = 0, manual = false, score = { home: 0, away: 0 } } = {}) {
  switch (action) {
    case "start":
      return { message: "Maç başladı, saat çalışıyor.", steps: [{ kind: "match", body: { mac_durumu: "canli" } }, { kind: "timer", running: true, baseMs: clockMs }, { kind: "period", period: 1 }] };
    case "kickoff":
    case "resume":
      return { message: "Saat çalışıyor.", steps: [{ kind: "timer", running: true, baseMs: clockMs }] };
    case "pause":
      return { message: "Saat durduruldu.", steps: [{ kind: "timer", running: false, baseMs: clockMs }] };
    case "halftime":
      return { message: "Devre arası.", steps: [{ kind: "timer", running: false, baseMs: HALF_MS }] };
    case "second":
      return { message: "2. yarı başladı.", steps: [{ kind: "timer", running: true, baseMs: HALF_MS }, { kind: "period", period: 2 }] };
    case "extra":
      return { message: "Uzatma başladı.", steps: [{ kind: "period", period: 3 }, { kind: "timer", running: true, baseMs: clockMs }] };
    case "finish":
      return {
        message: "Maç bitti, skor tescil edildi.",
        steps: [
          { kind: "match", body: { mac_durumu: "yayinlanmis", ...(manual ? {} : { first_team_score: score.home, second_team_score: score.away }) } },
          { kind: "timer", running: false, baseMs: clockMs },
        ],
      };
    case "reopen":
      return { message: "Maç tekrar canlıya alındı.", steps: [{ kind: "match", body: { mac_durumu: "canli" } }] };
    default:
      return { message: "", steps: [] };
  }
}

/* ------------------------------ olaylar ------------------------------ */

export const EVENT_LABELS = {
  GOAL_RIGHT_FOOT: "Sağ ayak gol",
  GOAL_LEFT_FOOT: "Sol ayak gol",
  GOAL_LONG_RIGHT: "Uzaktan sağ ayak gol",
  GOAL_LONG_LEFT: "Uzaktan sol ayak gol",
  GOAL_PENALTY: "Penaltı golü",
  GOAL_FREEKICK: "Frikik golü",
  GOAL_HEADER: "Kafa golü",
  GOAL_OWN: "Kendi kalesine",
  ASSIST: "Asist",
  YELLOW_CARD: "Sarı kart",
  RED_CARD: "Kırmızı kart",
  FOUL: "Faul",
  INJURY: "Sakatlık",
  SUBSTITUTION: "Değişiklik",
  SAVE: "Kurtarış",
  CHANCE_CREATED: "Tehlike",
};
export const eventLabel = (code) => EVENT_LABELS[String(code || "").toUpperCase()] || String(code || "Olay");

/** Olay sekmesindeki hızlı düğmeler (mobil QUICK_EVENTS). */
export const QUICK_EVENTS = [
  { code: "YELLOW_CARD", label: "Sarı kart", tone: "yellow" },
  { code: "RED_CARD", label: "Kırmızı kart", tone: "red" },
  { code: "GOAL_PENALTY", label: "Penaltı golü", tone: "goal" },
  { code: "GOAL_HEADER", label: "Kafa golü", tone: "goal" },
  { code: "GOAL_FREEKICK", label: "Frikik golü", tone: "goal" },
  { code: "GOAL_OWN", label: "Kendi kalesine", tone: "own" },
];

/** Zaman çizelgesinde gösterilen olaylar. */
export const TIMELINE_CODES = new Set([
  "GOAL_RIGHT_FOOT", "GOAL_LEFT_FOOT", "GOAL_LONG_RIGHT", "GOAL_LONG_LEFT", "GOAL_PENALTY",
  "GOAL_FREEKICK", "GOAL_HEADER", "GOAL_OWN", "YELLOW_CARD", "RED_CARD", "SUBSTITUTION", "INJURY",
]);

/** Skorbord alt bandında gösterilecek olay mı; öyleyse türü ve etiketi. */
export function bugEventOf(ev) {
  if (!ev) return null;
  const code = String(ev.olay_kodu).toUpperCase();
  if (code === "GOAL_OWN") return { kind: "goal", label: "KENDİ KALESİNE" };
  if (isGoalCode(code)) return { kind: "goal", label: code === "GOAL_PENALTY" ? "PENALTI GOLÜ" : "GOL" };
  if (code === "YELLOW_CARD") return { kind: "yellow", label: "SARI KART" };
  if (code === "RED_CARD") return { kind: "red", label: "KIRMIZI KART" };
  if (code === "SUBSTITUTION") return { kind: "other", label: "DEĞİŞİKLİK" };
  return null;
}

/** Olayın tarafı: takım kimliği maçın ev/deplasman kimliğiyle eşlenir. */
export function eventSide(ev, homeTeamId, awayTeamId) {
  const tid = Number(ev?.takim_id);
  if (tid && tid === Number(homeTeamId)) return "home";
  if (tid && tid === Number(awayTeamId)) return "away";
  return null;
}

/** Benzersiz istemci olay kimliği — aynı olay iki kez gönderilirse sunucu tekini yazar. */
export const clientEventId = () => `d-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/** Olay gövdesi (POST /api/maclar/:id/olaylar). */
export function eventBody({ side, code, playerId, minute, period, homeTeamId, awayTeamId, userId }) {
  return {
    takim_id: side === "home" ? homeTeamId ?? null : awayTeamId ?? null,
    olay_kodu: code,
    dakika: Number.isFinite(minute) ? minute : 0,
    devre: Number(period) > 0 ? Number(period) : 1,
    oyuncu_id: Number(playerId) || null,
    oyuncu_cikan_id: null,
    oyuncu_giren_id: null,
    aciklama: null,
    olusturan_kullanici_id: userId ?? null,
    client_event_id: clientEventId(),
  };
}

/* ------------------------------ kadro ------------------------------ */

/** Kadro satırlarının sade biçimi; önce ilk 11, sonra yedekler. */
export function toSquad(rows) {
  const seen = new Set();
  const out = [];
  for (const row of rows || []) {
    const id = String(row.playerId ?? row.oyuncu_id ?? row.id ?? "");
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      name: row.guestName || row.playerName || `Oyuncu #${id}`,
      number: row.number == null ? "" : String(row.number),
      position: row.position || "",
      role: row.role || (row.starting ? "starter" : "bench"),
      captain: Boolean(row.captain),
      guest: Boolean(row.isGuest),
    });
  }
  const order = { starter: 0, bench: 1, reserve: 2 };
  return out.sort((a, b) => (order[a.role] ?? 3) - (order[b.role] ?? 3));
}

/* --------------------------- maç seçici --------------------------- */

/** "20:00:00" → "20:00" */
export const hhmm = (value) => {
  const m = String(value ?? "").match(/^(\d{1,2}):(\d{2})/);
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : "";
};

/** Günün maçları satırı (GET /api/chat/content/matches) → "ANG – KAR · 21:00". */
export function matchOptionLabel(m) {
  const home = teamShortCode(m?.home ?? m?.first_team_name);
  const away = teamShortCode(m?.away ?? m?.second_team_name);
  const time = hhmm(m?.time ?? m?.match_time);
  return `${home} – ${away}${time ? ` · ${time}` : ""}`;
}

/** Günün maçları: saate göre sıralı. */
export const sortDayMatches = (items) => [...(items || [])].sort((a, b) => String(a.time || "99").localeCompare(String(b.time || "99")) || Number(a.id) - Number(b.id));

/** Yerel takvim günü "YYYY-AA-GG". */
export const isoDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const shiftDay = (day, n) => {
  const [y, m, d] = String(day).split("-").map(Number);
  return isoDay(new Date(y, m - 1, d + n));
};

/**
 * GET /maclar satırını seçicinin biçimine çevirir
 * ({ id, date, time, home, away, field, status }).
 */
export function normalizeListMatch(m) {
  if (!m || m.id == null) return null;
  return {
    id: Number(m.id),
    date: String(m.date ?? m.match_date ?? "").slice(0, 10) || null,
    time: m.time ?? m.match_time ?? null,
    home: m.home ?? m.first_team_name ?? null,
    away: m.away ?? m.second_team_name ?? null,
    field: m.field ?? m.match_field ?? null,
    status: normalizeMatchStatus(m.status ?? m.mac_durumu),
  };
}

/**
 * Seçicinin listesi: canlı maçlar en üstte (gün ne olursa olsun), sonra seçilen
 * günün maçları saate göre. Aynı maç iki kaynaktan gelirse bir kez yazılır.
 */
export function buildMatchOptions({ day, dayItems = [], listItems = [] }) {
  const byId = new Map();
  const add = (raw) => {
    const m = normalizeListMatch(raw);
    if (!m) return;
    const prev = byId.get(m.id);
    if (!prev) { byId.set(m.id, m); return; }
    // İlk kaynağın dolu alanları korunur, boş olanlar ikinciden tamamlanır.
    const merged = { ...prev };
    Object.keys(m).forEach((k) => { if (merged[k] == null) merged[k] = m[k]; });
    byId.set(m.id, merged);
  };
  dayItems.forEach(add);
  listItems.forEach(add);
  const all = [...byId.values()];
  const live = sortDayMatches(all.filter((m) => m.status === "canli"));
  const liveIds = new Set(live.map((m) => m.id));
  const ofDay = sortDayMatches(all.filter((m) => !liveIds.has(m.id) && m.date === day));
  return { live, ofDay };
}
