// Yayın Stüdyosu · Maç yönetimi — reji olayları ve kadro kuralları (saf işlevler).
//
// Kaynaklar (aynı sunucu):
//   mobil  lib/api/admin/matches.ts  EVENT_GROUPS, LineupPayloadRow, createRosterPlayer
//   web    editor_pages/MatchLiveStep.js  değişiklik (oyuncu_cikan_id / oyuncu_giren_id)
//   sunucu routes/MatchFlow.js  POST/PUT/DELETE /api/maclar/:id/olaylar, POST /api/maclar/:id/kadro
//
// Hata metinleri: masaüstü köprüsü (app/api.js) yalnız sunucunun "message"
// alanını taşır; "error" alanıyla dönen uçlarda metin "Sunucu hatası (400)."
// olur. friendlyError bunu duruma göre okunur Türkçe iletiye çevirir.

import { clientEventId, sortEvents } from "./match";

/* ------------------------------- hatalar ------------------------------- */

const GENERIC = /^Sunucu hatası \(\d+\)\.?$/;

/** { ok:false, error:{status,message,code} } → kullanıcıya gösterilecek ileti. */
export function friendlyError(res, fallback = "İşlem yapılamadı.") {
  if (!res) return fallback;
  if (res.offline) return "Bağlantı yok: bu işlem için internet gerekir.";
  const err = res.error || {};
  const status = Number(err.status) || 0;
  const message = String(err.message || "").trim();
  const generic = !message || GENERIC.test(message);
  if (status === 401) return "Oturumun sona ermiş; yeniden giriş yap.";
  if (status === 403) {
    if (!generic && err.code !== "PERMISSION_DENIED") return message;
    return "Bu işlem için yetkin yok. Yetki gerekiyorsa yöneticinden iste.";
  }
  if (!generic) return message;
  if (status === 404) return `${fallback} Kayıt bulunamadı.`;
  if (status === 400 || status === 422) return `${fallback} Gönderilen bilgiler geçersiz.`;
  if (status === 409) return `${fallback} Kayıt başka biri tarafından değiştirilmiş olabilir.`;
  if (status >= 500) return `${fallback} Sunucu hatası, biraz sonra yeniden dene.`;
  return fallback;
}

/* ------------------------------- olaylar ------------------------------- */

/** Reji panelindeki olay düğmeleri (web MatchLiveStep / mobil EVENT_GROUPS) — kodlar birebir. */
export const EVENT_GROUPS = [
  {
    key: "goals",
    title: "Gol ve asist",
    tone: "goal",
    items: [
      { code: "GOAL_RIGHT_FOOT", label: "Sağ ayak gol" },
      { code: "GOAL_LEFT_FOOT", label: "Sol ayak gol" },
      { code: "GOAL_LONG_RIGHT", label: "Uzaktan sağ ayak gol" },
      { code: "GOAL_LONG_LEFT", label: "Uzaktan sol ayak gol" },
      { code: "GOAL_PENALTY", label: "Penaltı golü" },
      { code: "GOAL_FREEKICK", label: "Frikik golü" },
      { code: "GOAL_HEADER", label: "Kafa golü" },
      { code: "GOAL_OWN", label: "Kendi kalesine" },
      { code: "ASSIST", label: "Asist" },
    ],
  },
  {
    key: "discipline",
    title: "Kart, faul, sakatlık",
    tone: "card",
    items: [
      { code: "YELLOW_CARD", label: "Sarı kart" },
      { code: "RED_CARD", label: "Kırmızı kart" },
      { code: "FOUL", label: "Faul" },
      { code: "INJURY", label: "Sakatlık" },
    ],
  },
  {
    key: "other",
    title: "Diğer olaylar",
    tone: "other",
    items: [
      { code: "SUBSTITUTION", label: "Değişiklik" },
      { code: "SAVE", label: "Kurtarış" },
      { code: "CHANCE_CREATED", label: "Tehlike" },
      { code: "DUEL_WON", label: "İkili mücadele" },
      { code: "AERIAL_WON", label: "Hava topu" },
      { code: "CRITICAL_BLOCK", label: "Kritik müdahale" },
    ],
  },
];

export const ALL_EVENT_CODES = EVENT_GROUPS.flatMap((g) => g.items.map((i) => i.code));
const CODE_LABEL = new Map(EVENT_GROUPS.flatMap((g) => g.items.map((i) => [i.code, i.label])));
const CODE_TONE = new Map(EVENT_GROUPS.flatMap((g) => g.items.map((i) => [i.code, g.tone])));

export const manageEventLabel = (code) => CODE_LABEL.get(String(code || "").toUpperCase()) || String(code || "Olay");
export const eventTone = (code) => {
  const c = String(code || "").toUpperCase();
  if (c === "YELLOW_CARD") return "yellow";
  if (c === "RED_CARD") return "red";
  if (c === "GOAL_OWN") return "own";
  return CODE_TONE.get(c) || "other";
};
export const isSubstitution = (code) => String(code || "").toUpperCase() === "SUBSTITUTION";

const toId = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
};
const toMinute = (v, fallback = 0) => {
  if (v === "" || v == null) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(200, Math.floor(n))) : fallback;
};
const toPeriod = (v) => (Number(v) > 0 ? Math.min(5, Math.floor(Number(v))) : 1);

/**
 * Olay gövdesi (POST /api/maclar/:id/olaylar). Değişiklikte oyuncu_id boş,
 * çıkan / giren ayrı alanlarda (web MatchLiveStep ile aynı).
 */
export function fullEventBody({ side, code, playerId, outId, inId, minute, period, note, homeTeamId, awayTeamId, userId }) {
  const sub = isSubstitution(code);
  const text = String(note ?? "").trim();
  return {
    takim_id: side === "home" ? toId(homeTeamId) : toId(awayTeamId),
    olay_kodu: String(code || "").toUpperCase(),
    dakika: toMinute(minute),
    devre: toPeriod(period),
    oyuncu_id: sub ? null : toId(playerId),
    oyuncu_cikan_id: sub ? toId(outId) : null,
    oyuncu_giren_id: sub ? toId(inId) : null,
    aciklama: text ? text.slice(0, 255) : null,
    olusturan_kullanici_id: toId(userId),
    side: side === "home" || side === "away" ? side : undefined,
    client_event_id: clientEventId(),
  };
}

/** Değişiklik gövdesi: çıkan ve giren zorunlu, aynı kişi olamaz. */
export function substitutionBody(input) {
  return fullEventBody({ ...input, code: "SUBSTITUTION" });
}

/** Olay formunun eksikleri; boşsa gönderilebilir. */
export function validateEvent({ side, code, outId, inId }) {
  if (side !== "home" && side !== "away") return "Takım seç.";
  if (!code) return "Olay türünü seç.";
  if (isSubstitution(code)) {
    if (!toId(outId)) return "Çıkan oyuncuyu seç.";
    if (!toId(inId)) return "Giren oyuncuyu seç.";
    if (String(outId) === String(inId)) return "Çıkan ve giren aynı oyuncu olamaz.";
  }
  return "";
}

/** PUT /api/maclar/:id/olaylar/:eventId gövdesi (yalnız düzenlenen alanlar). */
export function eventUpdateBody(form, { homeTeamId, awayTeamId }) {
  const body = fullEventBody({ ...form, homeTeamId, awayTeamId });
  delete body.client_event_id;
  delete body.olusturan_kullanici_id;
  return body;
}

/** Var olan olaydan düzenleme formu. */
export function eventToForm(ev, homeTeamId, awayTeamId) {
  const tid = Number(ev?.takim_id);
  const side = ev?.side === "home" || ev?.side === "away" ? ev.side : tid && tid === Number(homeTeamId) ? "home" : tid && tid === Number(awayTeamId) ? "away" : "home";
  return {
    side,
    code: String(ev?.olay_kodu || "").toUpperCase(),
    playerId: ev?.oyuncu_id ? String(ev.oyuncu_id) : "",
    outId: ev?.oyuncu_cikan_id ? String(ev.oyuncu_cikan_id) : "",
    inId: ev?.oyuncu_giren_id ? String(ev.oyuncu_giren_id) : "",
    minute: ev?.dakika == null ? "" : String(ev.dakika),
    period: Number(ev?.devre) > 0 ? Number(ev.devre) : 1,
    note: ev?.aciklama && ev.aciklama !== "none" ? String(ev.aciklama) : "",
  };
}

/**
 * Sahadaki oyuncular: ilk 11 + giren − çıkan (olay sırasına göre). Çıkan
 * seçicisinde sahadakiler, giren seçicisinde henüz girmemiş yedekler önce gelir.
 */
export function pitchState(squad, events, teamId, { exceptEventId } = {}) {
  const entered = new Set();
  const exited = new Set();
  const tid = Number(teamId);
  for (const ev of [...(events || [])].sort(sortEvents)) {
    if (!isSubstitution(ev?.olay_kodu)) continue;
    if (exceptEventId != null && Number(ev.id) === Number(exceptEventId)) continue;
    if (tid && Number(ev.takim_id) && Number(ev.takim_id) !== tid) continue;
    const inId = ev.oyuncu_giren_id ? String(ev.oyuncu_giren_id) : "";
    const outId = ev.oyuncu_cikan_id ? String(ev.oyuncu_cikan_id) : "";
    if (inId) { entered.add(inId); exited.delete(inId); }
    if (outId) { exited.add(outId); entered.delete(outId); }
  }
  const onPitch = (p) => !exited.has(p.id) && (entered.has(p.id) || p.role === "starter");
  const list = squad || [];
  return {
    onPitch: list.filter(onPitch),
    // Halı sahada çıkan oyuncu yeniden girebilir (web reji ile aynı).
    available: list.filter((p) => !onPitch(p)),
    out: list.filter((p) => exited.has(p.id)),
  };
}

/** Olay satırının okunur özeti: "Değişiklik · A → B". */
export function eventSummary(ev, nameOf) {
  const name = (id) => (id ? nameOf?.(id) || `#${id}` : "");
  if (isSubstitution(ev?.olay_kodu)) {
    const out = name(ev.oyuncu_cikan_id);
    const inn = name(ev.oyuncu_giren_id);
    return out || inn ? `${out || "?"} → ${inn || "?"}` : "";
  }
  return name(ev?.oyuncu_id);
}

/* -------------------------------- kadro -------------------------------- */

const rosterPlayerId = (p) => toId(p?.player_id ?? p?.id);
const rosterName = (p) => String(p?.player_name ?? p?.name ?? "").trim();
const rosterNumber = (p) => String(p?.jersey_number ?? p?.player_number ?? "").trim();
const rosterPosition = (p) => String(p?.team_position ?? p?.player_position ?? p?.position ?? "").trim();

/**
 * Kalıcı takım kadrosu (/oyuncu-takimlari/:teamId) + kayıtlı maç kadrosu
 * (/api/maclar/:id/kadro) → { [oyuncuId]: Pick } (mobil LineupStep ile aynı).
 * role: "starter" | "bench" | "" (kadroda değil)
 */
export function buildLineupSide(roster, saved, teamId) {
  const out = {};
  for (const p of roster || []) {
    const id = rosterPlayerId(p);
    if (!id) continue;
    out[id] = { id: String(id), name: rosterName(p) || `Oyuncu #${id}`, teamId: toId(p.team_id) || toId(teamId), role: "", number: rosterNumber(p), position: rosterPosition(p), captain: false, extra: false, guest: false };
  }
  for (const row of saved || []) {
    const id = String(row.playerId ?? row.oyuncu_id ?? row.id ?? "");
    if (!id) continue;
    const base = out[id];
    out[id] = {
      id,
      name: row.guestName || row.playerName || base?.name || `Oyuncu #${id}`,
      teamId: base?.teamId ?? (row.isGuest ? null : toId(teamId)),
      role: row.role === "starter" || row.role === "bench" ? row.role : "",
      number: row.number === "" || row.number == null ? base?.number ?? "" : String(row.number),
      position: row.position || base?.position || "",
      captain: Boolean(row.captain),
      extra: !base,
      guest: Boolean(row.isGuest),
    };
  }
  return out;
}

/** Bir oyuncuyu günceller; kaptan seçilince takımın diğer kaptanı kalkar. */
export function updateLineupPick(side, id, patch) {
  const current = side?.[id];
  if (!current) return side;
  let next = { ...side, [id]: { ...current, ...patch } };
  if (patch.role === "") next[id].captain = false;
  if (patch.captain) {
    next = Object.fromEntries(Object.entries(next).map(([k, v]) => [k, k === String(id) ? v : { ...v, captain: false }]));
  }
  return next;
}

/** Aramadan / yeni oyuncudan kadroya ekler (varsayılan: yedek). */
export function addLineupPick(side, player, { teamId, role = "bench", guest = false } = {}) {
  const id = String(rosterPlayerId(player) || player?.id || "");
  if (!id) return side;
  if (side?.[id]) return updateLineupPick(side, id, { role: side[id].role || role });
  return {
    ...side,
    [id]: { id, name: rosterName(player) || `Oyuncu #${id}`, teamId: toId(player.team_id) || (guest ? null : toId(teamId)), role, number: rosterNumber(player), position: rosterPosition(player), captain: false, extra: true, guest },
  };
}

export const lineupCounts = (side) => {
  const list = Object.values(side || {});
  return { starters: list.filter((p) => p.role === "starter").length, bench: list.filter((p) => p.role === "bench").length };
};

/** Görünen sıra: ilk 11, yedek, kadroda olmayanlar; her grupta forma no / ad. */
export function sortLineup(side) {
  const weight = (p) => (p.role === "starter" ? 0 : p.role === "bench" ? 1 : 2);
  const num = (p) => (p.number === "" || !Number.isFinite(Number(p.number)) ? 999 : Number(p.number));
  return Object.values(side || {}).sort((a, b) => weight(a) - weight(b) || num(a) - num(b) || a.name.localeCompare(b.name, "tr"));
}

/**
 * POST /api/maclar/:id/kadro tek tarafın satırları (sunucu normalizeKadroPayload):
 * yalnız starter / bench gider; takımın kadrosunda olmayan oyuncu misafir sayılır.
 */
export function buildLineupPayload(side, teamId) {
  const tid = toId(teamId);
  return Object.values(side || {})
    .filter((p) => p.role === "starter" || p.role === "bench")
    .map((p) => {
      const guest = p.guest === true || !p.teamId || p.teamId !== tid;
      const n = Number(p.number);
      return {
        playerId: Number(p.id),
        oyuncu_id: Number(p.id),
        role: p.role,
        position: String(p.position || "").slice(0, 30),
        number: p.number === "" || p.number == null || !Number.isFinite(n) ? "" : n,
        captain: Boolean(p.captain),
        isGuest: guest,
        ...(guest ? { guestName: p.name } : {}),
      };
    });
}

/** Kaydetmeden önce uyarılar (engellemez). */
export function lineupWarnings(side, label) {
  const { starters } = lineupCounts(side);
  const out = [];
  if (!starters) out.push(`${label}: ilk 11 seçilmedi.`);
  const nums = Object.values(side || {}).filter((p) => p.role && p.number !== "").map((p) => String(p.number));
  const dup = nums.filter((n, i) => nums.indexOf(n) !== i);
  if (dup.length) out.push(`${label}: aynı forma numarası (${[...new Set(dup)].join(", ")}).`);
  return out;
}

/* ============================ REJİ (birleşik) ============================ */

/**
 * Hızlı giriş ızgarasındaki olay türü: oyuncu nasıl seçilir?
 *   "player"  tek oyuncu (gol, kart, faul…)  → oyuncu seçici; "Oyuncusuz" da olur
 *   "sub"     değişiklik                       → çıkan + giren seçici
 *   "goal"    gol kodları (skor + tekrar kancası)
 */
export function eventInput(code) {
  const c = String(code || "").toUpperCase();
  if (c === "SUBSTITUTION") return "sub";
  if (c.startsWith("GOAL_")) return "goal";
  return "player";
}

/**
 * Izgara: sunucunun tanıdığı tüm kodlar (constants/matchEvents KNOWN_EVENT_CODES
 * ile kesişen EVENT_GROUPS). Her öğe { code, label, tone, input }.
 * Penaltı kaçırma / kurtarma gibi kodlar sunucuda tanımlı değil: gönderilmez.
 */
export const SERVER_EVENT_CODES = new Set([
  "GOAL_RIGHT_FOOT", "GOAL_LEFT_FOOT", "GOAL_HEADER", "GOAL_PENALTY", "GOAL_FREEKICK", "GOAL_LONG_RIGHT", "GOAL_LONG_LEFT",
  "GOAL", "PEN_GOAL", "OG", "OWN_GOAL", "GOAL_OWN", "YELLOW", "YELLOW_CARD", "RED", "RED_CARD", "SUBSTITUTION",
  "ASSIST", "SAVE", "CHANCE_CREATED", "CRITICAL_BLOCK", "AERIAL_WON", "DUEL_WON", "FOUL", "INJURY",
]);

export function quickEventCatalog() {
  return EVENT_GROUPS.map((g) => ({
    key: g.key,
    title: g.title,
    items: g.items.filter((it) => SERVER_EVENT_CODES.has(it.code)).map((it) => ({ ...it, tone: eventTone(it.code), input: eventInput(it.code) })),
  })).filter((g) => g.items.length);
}

/**
 * Reji sağ sütunu: en yeni üstte; filtre "all" | "home" | "away" |
 * "timeline" (gol / kart / değişiklik) | "stats".
 */
export function rejiEventRows(events, { filter = "all", homeTeamId, awayTeamId, nameOf, timelineCodes } = {}) {
  const sideOf = (ev) => {
    const tid = Number(ev.takim_id);
    if (tid && tid === Number(homeTeamId)) return "home";
    if (tid && tid === Number(awayTeamId)) return "away";
    return ev.side === "away" ? "away" : "home";
  };
  const isTimeline = (ev) => (timelineCodes ? timelineCodes.has(String(ev.olay_kodu).toUpperCase()) : true);
  return [...(events || [])]
    .sort(sortEvents)
    .reverse()
    .map((ev) => ({ ev, side: sideOf(ev), label: manageEventLabel(ev.olay_kodu), tone: eventTone(ev.olay_kodu), who: eventSummary(ev, nameOf), minute: Number(ev.dakika) || 0, period: Number(ev.devre) || 1 }))
    .filter((row) => {
      if (filter === "home" || filter === "away") return row.side === filter;
      if (filter === "timeline") return isTimeline(row.ev);
      if (filter === "stats") return !isTimeline(row.ev);
      return true;
    });
}

/** Takım başına olay sayıları (sağ sütun başlığı): { home: { goals, cards, subs, total }, away }. */
export function eventTally(events, homeTeamId, awayTeamId) {
  const out = { home: { goals: 0, cards: 0, subs: 0, total: 0 }, away: { goals: 0, cards: 0, subs: 0, total: 0 } };
  for (const ev of events || []) {
    const tid = Number(ev.takim_id);
    const side = tid && tid === Number(homeTeamId) ? "home" : tid && tid === Number(awayTeamId) ? "away" : null;
    if (!side) continue;
    const c = String(ev.olay_kodu).toUpperCase();
    out[side].total += 1;
    if (c.startsWith("GOAL_")) out[side].goals += 1;
    else if (c === "YELLOW_CARD" || c === "RED_CARD") out[side].cards += 1;
    else if (c === "SUBSTITUTION") out[side].subs += 1;
  }
  return out;
}

/* ============================ MAÇ SONU ============================ */
// mobil lib/api/admin/matches.ts (readPostContent, buildPostPayload,
// normalizeRating, saveRatings, getMatchStats…) ile birebir.

const cleanStr = (v) => {
  const t = String(v ?? "").trim();
  return t === "null" || t === "undefined" || t === "none" ? "" : t;
};

/** 0–10, tek ondalık; boş = puan verilmemiş (mobil normalizeRating). */
export function normalizeRating(value) {
  if (value === "" || value == null) return null;
  const n = Number(String(value).replace(",", "."));
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(10, Number(n.toFixed(1))));
}

export function isRatingInvalid(value) {
  if (value === "" || value == null) return false;
  const n = Number(String(value).replace(",", "."));
  return !Number.isFinite(n) || n < 0 || n > 10;
}

/** Puan düğmeleri: 1–10, yarım adım. */
export const RATING_STEPS = Array.from({ length: 19 }, (_, i) => 1 + i * 0.5);

/** Puanı yarım adım artır / azalt (1–10 arasında). */
export function stepRating(value, dir) {
  const cur = normalizeRating(value);
  const base = cur == null ? (dir > 0 ? 5.5 : 7) : Math.round(cur * 2) / 2;
  const next = Math.max(1, Math.min(10, base + (dir > 0 ? 0.5 : -0.5)));
  return String(next);
}

/** Kadro satırlarındaki kayıtlı puanlar: { "12": "7.5" }. */
export function readSavedRatings(lineup) {
  const out = {};
  for (const row of [...(lineup?.home || []), ...(lineup?.away || [])]) {
    const id = String(row.playerId ?? row.oyuncu_id ?? row.id ?? "");
    if (id && row.puan != null && row.puan !== "") out[id] = String(row.puan);
  }
  return out;
}

/**
 * PATCH /api/maclar/:id/kadro/puan gövdesi. Yalnız geçerli puanlar gider;
 * hiç puan yoksa null (sunucu boş listeyi 400 ile reddeder).
 */
export function ratingsPayload(players, ratings) {
  const rows = (players || [])
    .map((p) => ({ playerId: Number(p.id), oyuncu_id: Number(p.id), puan: normalizeRating(ratings?.[p.id]) }))
    .filter((r) => Number.isFinite(r.playerId) && r.playerId > 0 && r.puan != null);
  return rows.length ? { ratings: rows } : null;
}

export function ratingsSummary(players, ratings, saved = {}) {
  const list = players || [];
  return {
    filled: list.filter((p) => ratings?.[p.id] && !isRatingInvalid(ratings[p.id])).length,
    invalid: list.filter((p) => isRatingInvalid(ratings?.[p.id])).length,
    dirty: list.some((p) => String(ratings?.[p.id] ?? "") !== String(saved?.[p.id] ?? "")),
    total: list.length,
  };
}

/** Maçın enleri (web matchContentModel / mobil HIGHLIGHT_FIELDS). */
export const POST_HIGHLIGHT_FIELDS = [
  { key: "best_player", label: "Maçın oyuncusu (MVP)" },
  { key: "best_goalkeeper", label: "Maçın kalecisi" },
  { key: "best_defender", label: "Maçın defansı" },
  { key: "best_midfielder", label: "Maçın orta sahası" },
  { key: "best_forward", label: "Maçın forveti" },
  { key: "best_goal", label: "Maçın golü" },
  { key: "best_save", label: "Maçın kurtarışı" },
];

const POSITION_WORDS = {
  best_goalkeeper: ["kaleci", "goalkeeper", "gk"],
  best_defender: ["defans", "defender", "stoper", "bek"],
  best_midfielder: ["orta saha", "ortasaha", "midfielder", "orta"],
  best_forward: ["forvet", "forward", "santrafor", "kanat"],
};

/** Puan ve gollerden öneri: { best_player: { id, reason } }. */
export function highlightSuggestions(players, ratings, events) {
  const rated = (players || [])
    .map((p) => ({ ...p, score: normalizeRating(ratings?.[p.id]) }))
    .filter((p) => p.score != null)
    .sort((a, b) => b.score - a.score);
  const out = {};
  if (rated[0]) out.best_player = { id: rated[0].id, reason: `${rated[0].score} puan` };
  for (const [key, words] of Object.entries(POSITION_WORDS)) {
    const found = rated.find((p) => words.some((w) => String(p.position || "").toLocaleLowerCase("tr-TR").includes(w)));
    if (found) out[key] = { id: found.id, reason: `${found.score} puan` };
  }
  const scorers = new Set();
  for (const ev of events || []) {
    const c = String(ev.olay_kodu).toUpperCase();
    if (c.startsWith("GOAL_") && c !== "GOAL_OWN" && ev.oyuncu_id) scorers.add(String(ev.oyuncu_id));
  }
  if (scorers.size === 1) out.best_goal = { id: [...scorers][0], reason: "maçın tek golcüsü" };
  return out;
}

export function readPostContent(match) {
  return {
    title: cleanStr(match?.match_title ?? match?.post_manset),
    report: cleanStr(match?.match_comment ?? match?.post_rapor),
    coverImage: cleanStr(match?.match_picture),
    liveLink: cleanStr(match?.match_video),
    interview: cleanStr(match?.match_interview ?? match?.post_roportaj),
    photos: cleanStr(match?.match_images),
  };
}

/** PATCH /maclar/:id — maç sonu içerik + enler (mobil buildPostPayload). */
export function buildPostPayload(content, highlights, nameOf) {
  const award = {};
  for (const { key } of POST_HIGHLIGHT_FIELDS) {
    const id = highlights?.[key] || "";
    const name = id ? nameOf?.(id) || "" : "";
    award[`${key}_id`] = id;
    award[`${key}_name`] = name;
    award[key] = name;
  }
  const json = JSON.stringify(award);
  const mvp = Number(highlights?.best_player);
  const c = content || {};
  return {
    match_title: c.title || "", post_manset: c.title || "",
    match_comment: c.report || "", post_rapor: c.report || "",
    match_picture: c.coverImage || "",
    match_video: c.liveLink || "",
    match_interview: c.interview || "", post_roportaj: c.interview || "",
    match_images: c.photos || "",
    post_macin_enleri: json, post_enler: json,
    match_mvp: Number.isFinite(mvp) && mvp > 0 ? mvp : null,
  };
}

/** Maç özeti: golcüler / kartlar / değişiklik sayısı (mobil PostStep summary). */
export function postSummary(events, { homeTeamId, awayTeamId, nameOf = () => null } = {}) {
  const goals = { home: [], away: [] };
  const cards = { home: [], away: [] };
  let subs = 0;
  for (const ev of [...(events || [])].sort(sortEvents)) {
    const code = String(ev.olay_kodu).toUpperCase();
    const tid = Number(ev.takim_id);
    const s = tid && tid === Number(homeTeamId) ? "home" : tid && tid === Number(awayTeamId) ? "away" : null;
    if (!s) continue;
    const name = nameOf(ev.oyuncu_id) || (ev.oyuncu_id ? `Oyuncu #${ev.oyuncu_id}` : "Oyuncusuz");
    if (code.startsWith("GOAL_")) {
      const own = code === "GOAL_OWN";
      goals[own ? (s === "home" ? "away" : "home") : s].push({ name, minute: ev.dakika ?? null, own });
    } else if (code === "YELLOW_CARD" || code === "RED_CARD") cards[s].push({ name, minute: ev.dakika ?? null, red: code === "RED_CARD" });
    else if (code === "SUBSTITUTION") subs += 1;
  }
  return { goals, cards, subs };
}

/* ---------------------- oyuncu maç istatistiği (Enter_Stats) ---------------------- */

export const EMPTY_STAT = Object.freeze({ number_of_goals: 0, goals_minutes: "", yellow_card: 0, red_card: 0, points: 0, goal_to_himself: 0, goal_to_himself_minutes: "", player_position: "" });

/** GET /oyuncu-istatistikleri/mac/:id satırları → { [playerId]: row }. */
export function statsByPlayer(rows) {
  const out = {};
  for (const r of Array.isArray(rows) ? rows : []) if (r && r.player_id != null) out[String(r.player_id)] = r;
  return out;
}

/** Olaylardan istatistik taslağı (gol dakikaları, kartlar, kendi kalesine). */
export function statDraftFromEvents(playerId, events) {
  const id = String(playerId);
  const draft = { ...EMPTY_STAT };
  const goalMin = [];
  const ownMin = [];
  for (const ev of events || []) {
    if (String(ev.oyuncu_id ?? "") !== id) continue;
    const c = String(ev.olay_kodu).toUpperCase();
    if (c === "GOAL_OWN") ownMin.push(Number(ev.dakika) || 0);
    else if (c.startsWith("GOAL_")) goalMin.push(Number(ev.dakika) || 0);
    else if (c === "YELLOW_CARD") draft.yellow_card += 1;
    else if (c === "RED_CARD") draft.red_card += 1;
  }
  draft.number_of_goals = goalMin.length;
  draft.goals_minutes = goalMin.join(",");
  draft.goal_to_himself = ownMin.length;
  draft.goal_to_himself_minutes = ownMin.join(",");
  return draft;
}

const toCount = (v, max) => Math.max(0, Math.min(max, Math.floor(Number(v) || 0)));

/** POST /oyuncu-istatistikleri/ ya da PATCH /playerStat/:id gövdesi. */
export function playerStatBody(draft, { matchId, playerId, teamId, opponentTeamId, position = "" }) {
  const d = { ...EMPTY_STAT, ...(draft || {}) };
  return {
    player_id: Number(playerId),
    match_id: Number(matchId),
    team_id: toId(teamId),
    opponent_team_id: toId(opponentTeamId),
    number_of_goals: toCount(d.number_of_goals, 20),
    goals_minutes: String(d.goals_minutes || "").replace(/[^\d,]/g, "") || null,
    yellow_card: toCount(d.yellow_card, 2),
    red_card: toCount(d.red_card, 1),
    points: Math.max(0, Math.min(10, Number(d.points) || 0)),
    goal_to_himself: toCount(d.goal_to_himself, 10),
    goal_to_himself_minutes: String(d.goal_to_himself_minutes || "").replace(/[^\d,]/g, "") || null,
    player_position: String(d.player_position || position || "").slice(0, 30) || null,
  };
}

/**
 * Olayın yazılacağı taraf. Skor kartındaki +GOL'de taraf golden yararlanandır:
 * "Kendi kalesine" seçilirse golü atan rakip oyuncudur, olay rakibe yazılır
 * (scoreFromEvents kendi kalesine golü karşı hanesine sayar). Izgarada taraf
 * her zaman olayın takımıdır.
 */
export function eventSideFor(side, code, { fromScore = false } = {}) {
  const s = side === "away" ? "away" : "home";
  if (fromScore && String(code || "").toUpperCase() === "GOAL_OWN") return s === "home" ? "away" : "home";
  return s;
}
