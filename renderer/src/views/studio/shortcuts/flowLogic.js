// Yayın Stüdyosu · ÇOK İŞLEVLİ DÜĞMELER — saf akış mantığı (sınanır).
//
// Düğmeler (./wReji, ./wSes, ./wTekrar, ./wYayin) tek tıkla ana işi yapar; ayrıntı
// gerektirenler küçük bir açılır akış açar (gol türü → golcü → asist, kart rengi →
// takım → oyuncu → neden, değişiklik çıkan → giren, penaltı sonucu…). Bu dosya o
// akışların adımlarını ve kaydedilecek olay formlarını üretir; sunucuya yazma Studio'nun
// tek yolundan (railCtx.flow.submit → live.addFullEvent) geçer — iş kuralı kopyalanmaz.
//
// Olay kodları yalnız sunucunun tanıdıkları (lib/studio/manage › SERVER_EVENT_CODES):
// sunucuda olmayan bir kod (ör. KORNER) düğme olarak hiç çıkmaz.
import { SERVER_EVENT_CODES, eventTone, manageEventLabel, quickEventCatalog } from "../../../lib/studio/manage";
import { GOAL_KIND_CODES, PENALTY_MISS, other } from "../manage/rejiLogic";

export const hasCode = (code) => SERVER_EVENT_CODES.has(String(code || "").toUpperCase());
export { other };

/* ───────────────────────── gol ───────────────────────── */

const GOAL_SHORT = {
  GOAL_RIGHT_FOOT: "Sağ ayak", GOAL_LEFT_FOOT: "Sol ayak", GOAL_HEADER: "Kafa", GOAL_PENALTY: "Penaltı",
  GOAL_FREEKICK: "Serbest vuruş", GOAL_LONG_RIGHT: "Uzaktan (sağ)", GOAL_LONG_LEFT: "Uzaktan (sol)", GOAL_OWN: "Kendi kalesine",
};
const GOAL_ICON = { GOAL_HEADER: "user", GOAL_PENALTY: "target", GOAL_FREEKICK: "flag", GOAL_OWN: "undo" };

/** Gol türü çipleri (sunucunun tanıdığı kodlar, kendi kalesine en sonda). */
export const GOAL_KINDS = [...GOAL_KIND_CODES, "GOAL_OWN"].filter(hasCode).map((code) => ({
  code, label: GOAL_SHORT[code] || manageEventLabel(code), icon: GOAL_ICON[code] || "ball", tone: code === "GOAL_OWN" ? "own" : "goal",
}));

/** Golün olay tarafı: kendi kalesine gol rakip oyuncunun olayıdır (yararlanan side). */
export const goalEventSide = (side, code) => (String(code || "").toUpperCase() === "GOAL_OWN" ? other(side) : side === "away" ? "away" : "home");
/** Asist sorulur mu (kendi kalesine ve penaltıda sorulmaz; sunucu ASSIST'i tanımalı). */
export const goalAsksAssist = (code) => hasCode("ASSIST") && !["GOAL_OWN", "GOAL_PENALTY"].includes(String(code || "").toUpperCase());

/**
 * Gol akışı: { step: "kind" | "scorer" | "assist" | "done", side (yararlanan), code, scorerId, assistId }.
 * Saf: her işlev yeni durum döner.
 */
export const goalStart = (side, code = null) => ({ step: code ? "scorer" : "kind", side: side === "away" ? "away" : "home", code: code || null, scorerId: null, assistId: null });
export const goalPickKind = (st, code) => ({ ...st, code, step: "scorer", scorerId: null, assistId: null });
export function goalPickScorer(st, playerId) {
  const scorerId = playerId ? String(playerId) : null;
  return { ...st, scorerId, step: goalAsksAssist(st.code) && scorerId ? "assist" : "done" };
}
export const goalPickAssist = (st, playerId) => ({ ...st, assistId: playerId && String(playerId) !== st.scorerId ? String(playerId) : null, step: "done" });
export function goalBack(st) {
  if (st.step === "assist") return { ...st, step: "scorer", assistId: null };
  if (st.step === "scorer") return { ...st, step: "kind", scorerId: null };
  return st;
}
/** Kaydedilecek formlar: [gol, asist?] (live.addFullEvent biçimi). */
export function goalForms(st) {
  if (!st?.code) return [];
  const goal = { side: goalEventSide(st.side, st.code), code: st.code, playerId: st.scorerId || "", note: "" };
  const out = [goal];
  if (st.assistId && goalAsksAssist(st.code)) out.push({ side: st.side, code: "ASSIST", playerId: st.assistId, note: "" });
  return out;
}

/* ───────────────────────── kart ───────────────────────── */

export const CARD_REASONS = ["Faul", "Sert müdahale", "İtiraz", "Zaman geçirme", "Sportmenlik dışı", "Elle oynama", "Gol fırsatını engelleme"];
export const cardCode = (color) => (color === "red" ? "RED_CARD" : "YELLOW_CARD");
/** { step: "color" | "team" | "player" | "reason" | "done", color, side, playerId, reason } */
export const cardStart = ({ color = null, side = null } = {}) => ({ step: !color ? "color" : !side ? "team" : "player", color, side, playerId: null, reason: "" });
export const cardPickColor = (st, color) => ({ ...st, color, step: st.side ? "player" : "team" });
export const cardPickTeam = (st, side) => ({ ...st, side, step: "player" });
export const cardPickPlayer = (st, playerId) => ({ ...st, playerId: playerId ? String(playerId) : null, step: "reason" });
export const cardPickReason = (st, reason) => ({ ...st, reason: String(reason || ""), step: "done" });
export function cardBack(st) {
  if (st.step === "reason") return { ...st, step: "player", playerId: null };
  if (st.step === "player") return { ...st, step: "team", playerId: null };
  if (st.step === "team") return { ...st, step: "color" };
  return st;
}
export const cardForm = (st) => (st?.color && st.side ? { side: st.side, code: cardCode(st.color), playerId: st.playerId || "", note: st.reason || "" } : null);

/* ───────────────────────── değişiklik ───────────────────────── */

/** { step: "team" | "out" | "in" | "done", side, outId, inId } */
export const subStart = (side = null) => ({ step: side ? "out" : "team", side, outId: null, inId: null });
export const subPickTeam = (st, side) => ({ ...st, side, step: "out" });
export const subPickOut = (st, id) => ({ ...st, outId: String(id), inId: null, step: "in" });
export const subPickIn = (st, id) => (String(id) === st.outId ? st : { ...st, inId: String(id), step: "done" });
export function subBack(st) {
  if (st.step === "in") return { ...st, step: "out", outId: null };
  if (st.step === "out") return { ...st, step: "team" };
  return st;
}
export const subForm = (st) => (st?.side && st.outId && st.inId ? { side: st.side, code: "SUBSTITUTION", outId: st.outId, inId: st.inId, playerId: "" } : null);

/* ───────────────────────── penaltı ───────────────────────── */

export const PENALTY_RESULTS = [
  { key: "goal", label: "GOL", icon: "ball", tone: "green", hint: "Penaltı golü (skor + tekrar + gol müziği)" },
  { key: "miss", label: "KAÇTI", icon: "x", tone: "danger", hint: "Penaltıyı kullanan oyuncu" },
  { key: "saved", label: "KURTARILDI", icon: "shield", tone: "amber", hint: "Kurtaran kaleci (rakip takım)" },
].filter((r) => (r.key === "goal" ? hasCode("GOAL_PENALTY") : r.key === "miss" ? hasCode(PENALTY_MISS.code) : hasCode("SAVE")));
/** { step: "team" | "result" | "player" | "done", side (penaltıyı kullanan), result, playerId } */
export const penStart = (side = null) => ({ step: side ? "result" : "team", side, result: null, playerId: null });
export const penPickTeam = (st, side) => ({ ...st, side, step: "result" });
export const penPickResult = (st, result) => ({ ...st, result, step: "player" });
export const penPickPlayer = (st, id) => ({ ...st, playerId: id ? String(id) : null, step: "done" });
export function penBack(st) {
  if (st.step === "player") return { ...st, step: "result", playerId: null };
  if (st.step === "result") return { ...st, step: "team" };
  return st;
}
/** Oyuncunun seçileceği takım: kurtarışta rakibin kalecisi. */
export const penPlayerSide = (st) => (st?.result === "saved" ? other(st.side) : st?.side);
export function penForm(st) {
  if (!st?.side || !st.result) return null;
  if (st.result === "goal") return { side: st.side, code: "GOAL_PENALTY", playerId: st.playerId || "", note: "" };
  if (st.result === "miss") return { side: st.side, code: PENALTY_MISS.code, playerId: st.playerId || "", note: PENALTY_MISS.note };
  return { side: other(st.side), code: "SAVE", playerId: st.playerId || "", note: "Penaltı kurtarıldı" };
}

/* ───────────────────────── evrensel olay (tür → takım → oyuncu) ───────────────────────── */

/** Tür ızgarası: sunucunun tanıdığı tüm kodlar, gruplu ({ key, title, items: [{ code, label, tone, input }] }). */
export const eventTypeGroups = () => quickEventCatalog();
/** { step: "type" | "team" | "player" | "done", code, input, side, playerId } (değişiklik ayrı akışta) */
export const evStart = () => ({ step: "type", code: null, input: null, side: null, playerId: null });
export const evPickType = (st, code, input) => ({ ...st, code, input: input || "player", step: "team" });
export const evPickTeam = (st, side) => ({ ...st, side, step: "player" });
export const evPickPlayer = (st, id) => ({ ...st, playerId: id ? String(id) : null, step: "done" });
export function evBack(st) {
  if (st.step === "player") return { ...st, step: "team", playerId: null };
  if (st.step === "team") return { ...st, step: "type", code: null };
  return st;
}
/** Takım düğmesi = olayın takımı (kendi kalesine: golü atan oyuncunun takımı). */
export const evForm = (st) => (st?.code && st.side ? { side: st.side, code: st.code, playerId: st.playerId || "", note: "" } : null);

/** Takım düğmeli hızlı istatistik olayları (faul, kurtarış, tehlike…). Korner sunucuda yok: çıkmaz. */
export const STAT_CODES = ["FOUL", "SAVE", "CHANCE_CREATED", "DUEL_WON", "AERIAL_WON", "CRITICAL_BLOCK", "INJURY", "CORNER"].filter(hasCode)
  .map((code) => ({ code, label: manageEventLabel(code), tone: eventTone(code) }));

/* ───────────────────────── istatistik ───────────────────────── */

/** Takım başına sayılar: { home: { goals, yellow, red, subs, fouls, saves, chances, total }, away }. */
export function teamStats(events, homeTeamId, awayTeamId) {
  const blank = () => ({ goals: 0, yellow: 0, red: 0, subs: 0, fouls: 0, saves: 0, chances: 0, total: 0 });
  const out = { home: blank(), away: blank() };
  for (const ev of events || []) {
    const tid = Number(ev?.takim_id);
    const side = tid && tid === Number(homeTeamId) ? "home" : tid && tid === Number(awayTeamId) ? "away" : null;
    if (!side) continue;
    const c = String(ev.olay_kodu || "").toUpperCase();
    const s = out[side];
    s.total += 1;
    if (c === "GOAL_OWN") out[other(side)].goals += 1;
    else if (c.startsWith("GOAL_")) s.goals += 1;
    else if (c === "YELLOW_CARD") s.yellow += 1;
    else if (c === "RED_CARD") s.red += 1;
    else if (c === "SUBSTITUTION") s.subs += 1;
    else if (c === "FOUL") s.fouls += 1;
    else if (c === "SAVE") s.saves += 1;
    else if (c === "CHANCE_CREATED") s.chances += 1;
  }
  return out;
}
/** Çubuk oranı (iki takımın payı, 0…1; ikisi de 0 ise 0,5). */
export const shareOf = (a, b) => (a + b > 0 ? a / (a + b) : 0.5);

/* ───────────────────────── oyuncu ızgarası ───────────────────────── */

/** Arama (forma no tam eşleşme ya da ad içinde) + ilk 11 önce + istenmeyenler hariç. */
export function filterPlayers(list, query = "", { exclude = [], prefer = null } = {}) {
  const q = String(query || "").trim().toLocaleLowerCase("tr-TR");
  const ex = new Set((exclude || []).map(String));
  const all = (list || []).filter((p) => !ex.has(String(p.id)) && (!q || String(p.number) === q || String(p.name || "").toLocaleLowerCase("tr-TR").includes(q)));
  if (prefer) {
    const pref = new Set(prefer.map((p) => String(p.id ?? p)));
    return [...all.filter((p) => pref.has(String(p.id))), ...all.filter((p) => !pref.has(String(p.id)))];
  }
  return [...all.filter((p) => p.role === "starter"), ...all.filter((p) => p.role !== "starter")];
}
/** Ad baş harfleri (fotoğraf yoksa). */
export const initials = (name) => String(name || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0] || "").join("").toLocaleUpperCase("tr-TR") || "?";

/* ───────────────────────── ses ───────────────────────── */

export const PRESET_KEY = "studio.audioPresets.v1";
export const PRESET_SLOTS = ["A", "B", "C", "D"];

/** Karıştırıcı anlık görüntüsü (şerit fader / sessiz / solo, ana çıkış). "Tümünü kapat" alınmaz. */
export function mixerSnapshot(settings, { name = "", at = Date.now() } = {}) {
  const strips = {};
  for (const [id, s] of Object.entries(settings?.strips || {})) strips[id] = { fader: Number.isFinite(s.fader) ? s.fader : null, mute: Boolean(s.mute), solo: Boolean(s.solo), trim: Number(s.trim) || 0 };
  return { name: String(name || "").slice(0, 24), at, strips, master: { fader: Number.isFinite(settings?.master?.fader) ? settings.master.fader : 0 } };
}
/**
 * Anlık görüntüyü karıştırıcı ayarına uygula (saf): yalnız bugün var olan şeritler
 * değişir; patchStrip ile (mikrofon / giriş sessizi kendi alanına) — ayrıntı useAudioMixer'da.
 */
export function applyMixerSnapshot(settings, snap, patchStrip) {
  if (!snap?.strips) return settings;
  let next = settings;
  for (const [id, s] of Object.entries(snap.strips)) {
    if (!next?.strips?.[id]) continue;
    next = patchStrip(next, id, { fader: s.fader == null ? -Infinity : s.fader, mute: s.mute, solo: s.solo, trim: s.trim });
  }
  return { ...next, master: { ...(next.master || {}), fader: Number.isFinite(snap.master?.fader) ? snap.master.fader : 0 } };
}
export function loadPresets(storage) {
  try { const v = JSON.parse(storage?.getItem(PRESET_KEY) || "null"); return v && typeof v === "object" ? v : {}; } catch { return {}; }
}
export function savePresets(storage, presets) {
  try { storage?.setItem(PRESET_KEY, JSON.stringify(presets || {})); return true; } catch { return false; }
}

/** Kısma (ducking): mikrofon açılınca müzik `depth` dB aşağı; kapanınca eski düzey. */
export const DUCK_DEPTHS = [6, 12, 18, 24];
export const duckedDb = (db, depth = 12) => (Number.isFinite(db) ? Math.max(-60, Math.round((db - Math.abs(depth)) * 10) / 10) : db);

/** Karıştırıcı parçacığında gösterilecek şeritler: seçilenler (sırasıyla) yoksa ilk n. */
export function pickStrips(strips, ids, n) {
  const list = strips || [];
  const chosen = (Array.isArray(ids) ? ids : []).map((id) => list.find((s) => s.id === id)).filter(Boolean);
  const out = chosen.length ? chosen : list;
  return out.slice(0, Math.max(1, n || out.length));
}

/** "Sessize al N sn": kalan ms ve oran (0…1). */
export function dumpLeft(endsAt, totalMs, now = Date.now()) {
  if (!endsAt) return { left: 0, frac: 0, active: false };
  const left = Math.max(0, endsAt - now);
  return { left, frac: totalMs > 0 ? left / totalMs : 0, active: left > 0 };
}

/* ───────────────────────── tekrar ───────────────────────── */

/** Açı dizisi: tık ekler (sona), tekrar tık çıkarır. */
export const seqToggle = (list, angle) => (list.includes(angle) ? list.filter((a) => a !== angle) : [...list, angle]);
/** Sıradaki öğeyi bir yukarı / aşağı taşı. */
export function seqMove(list, index, dir) {
  const to = index + (dir < 0 ? -1 : 1);
  if (index < 0 || index >= list.length || to < 0 || to >= list.length) return list;
  const next = [...list];
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}
/** Son N gol tekrarı (en yeni başta; açısı olanlar). */
export const goalReplays = (list, n = 3) => (list || []).filter((r) => r?.kind === "goal" && (r.angles || []).some((a) => a.url)).slice(0, n);
/** Jog: imleci sınırlar içinde taşı. */
export const jogTo = (cur, delta, duration) => {
  const t = (Number(cur) || 0) + delta;
  const d = Number(duration);
  return Math.max(0, Number.isFinite(d) && d > 0 ? Math.min(d - 0.01, t) : t);
};
export const secText = (sec) => {
  const s = Math.max(0, Number(sec) || 0);
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}.${Math.floor((s % 1) * 10)}`;
};
export const MOMENT_SECONDS = [10, 15, 20, 30];
export const RATE_STEPS = [0.25, 0.33, 0.5, 0.75, 1];

/* ───────────────────────── sahne, grafik ───────────────────────── */

/** Sıradaki / önceki sahne (önizlemedeki sahneden; uçlarda döner). */
export function sceneStep(scenes, currentId, dir) {
  const list = scenes || [];
  if (!list.length) return null;
  const i = list.findIndex((s) => s.id === currentId);
  const n = list.length;
  const j = i < 0 ? (dir < 0 ? n - 1 : 0) : (i + (dir < 0 ? -1 : 1) + n) % n;
  return list[j]?.id || null;
}
export const SUB_DURATIONS = [0, 5, 10, 15, 30, 60];
export const TRANSITION_MS_STEPS = [250, 500, 800, 1200, 2000];
export const READY_MINUTES = [1, 3, 5, 10, 15];

/** İlerleme halkası çizgisi (r yarıçap, frac 0…1). */
export function ringDash(frac, r) {
  const c = 2 * Math.PI * r;
  const f = Math.min(1, Math.max(0, Number(frac) || 0));
  return { c, dash: `${(c * f).toFixed(2)} ${c.toFixed(2)}` };
}
/** Parçacık biçimi: "small" (1×1) · "tall" (1×2) · "wide" (2×1, 3×1…) · "big" (2×2) · "huge" (3×2, 4×2). */
export const shapeOf = (w, h) => (h >= 2 ? (w >= 3 ? "huge" : w === 2 ? "big" : "tall") : w >= 2 ? "wide" : "small");
