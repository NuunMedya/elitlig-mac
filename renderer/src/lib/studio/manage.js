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
