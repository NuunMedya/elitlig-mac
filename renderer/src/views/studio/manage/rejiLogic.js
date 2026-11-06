// Maç yönetimi · Reji — saf yardımcılar (sınanır): akış düğmeleri, takım
// sütunlarının olay düğmeleri, golden yararlanan taraf.
import { primaryControl } from "../../../lib/studio/match";
import { SERVER_EVENT_CODES, quickEventCatalog } from "../../../lib/studio/manage";

export const other = (side) => (side === "away" ? "home" : "away");

/** Aşamaya göre akış düğmeleri: { key, label, icon, action, enabled, next, finish? }. */
export function flowButtons(phase, { period = 1, running = false } = {}) {
  const p = Number(period) || 1;
  const live = !["notStarted", "finished"].includes(phase);
  const startLabel = phase === "notStarted" ? "Maçı başlat" : phase === "kickoff" ? "1. yarıyı başlat" : "Sürdür";
  const startAction = phase === "notStarted" ? "start" : phase === "kickoff" ? "kickoff" : "resume";
  const next = primaryControl(phase);
  const list = [
    { key: "start", label: startLabel, icon: "play", action: startAction, enabled: ["notStarted", "kickoff", "paused"].includes(phase) },
    { key: "pause", label: "Durdur", icon: "pause", action: "pause", enabled: live && Boolean(running) },
    { key: "halftime", label: "Devre arası", icon: "pause", action: "halftime", enabled: phase === "first" || (phase === "paused" && p === 1) },
    { key: "second", label: "2. yarı", icon: "skip", action: "second", enabled: phase === "halftime" || (phase === "paused" && p === 1) },
    { key: "extra", label: "Uzatma", icon: "clock", action: "extra", enabled: phase === "second" || (phase === "paused" && p === 2) },
    { key: "finish", label: "Bitir", icon: "flag", action: "finish", finish: true, enabled: live },
  ];
  return list.map((b) => ({ ...b, next: Boolean(b.enabled && (next.finish ? b.key === "finish" : next.action === b.action)) }));
}

/** Penaltı kaçtı: sunucuda ayrı kod yok → "Tehlike" + açıklama. */
export const PENALTY_MISS = Object.freeze({ code: "CHANCE_CREATED", note: "Penaltı kaçtı" });

/**
 * Takım sütununun olay düğmeleri. Her öğe { key, code, label, input, tone, note?, kbd? }.
 * input: "goal" (skor + tekrar + gol müziği), "player", "sub".
 * Yalnız sunucunun tanıdığı kodlar (kod yoksa düğme çıkmaz).
 */
export function teamActions() {
  const known = (c) => SERVER_EVENT_CODES.has(c);
  const main = [
    { key: "own", code: "GOAL_OWN", label: "Kendi kalesine", input: "goal", tone: "own" },
    { key: "assist", code: "ASSIST", label: "Asist", input: "player", tone: "goal" },
    { key: "yellow", code: "YELLOW_CARD", label: "Sarı kart", input: "player", tone: "yellow" },
    { key: "red", code: "RED_CARD", label: "Kırmızı kart", input: "player", tone: "red" },
    { key: "penGoal", code: "GOAL_PENALTY", label: "Penaltı gol", input: "goal", tone: "goal" },
    { key: "penMiss", code: PENALTY_MISS.code, note: PENALTY_MISS.note, label: "Penaltı kaçtı", input: "player", tone: "other" },
    { key: "sub", code: "SUBSTITUTION", label: "Değişiklik", input: "sub", tone: "other" },
    { key: "foul", code: "FOUL", label: "Faul", input: "player", tone: "card" },
  ].filter((a) => known(a.code));
  const used = new Set([...main.map((a) => a.code), "GOAL_RIGHT_FOOT"]);
  const rest = quickEventCatalog().flatMap((g) => g.items)
    .filter((it) => !used.has(it.code) && !it.code.startsWith("GOAL_"))
    .map((it) => ({ key: it.code, code: it.code, label: it.label, input: it.input, tone: it.tone }));
  return { goal: { key: "goal", code: "GOAL_RIGHT_FOOT", label: "GOL", input: "goal", tone: "goal" }, main, rest };
}

/** Gol çeşidi çipleri (oyuncu seçicide; kendi kalesine ayrı düğmede). */
export const GOAL_KIND_CODES = ["GOAL_RIGHT_FOOT", "GOAL_LEFT_FOOT", "GOAL_HEADER", "GOAL_PENALTY", "GOAL_FREEKICK", "GOAL_LONG_RIGHT", "GOAL_LONG_LEFT"];

/** Golden yararlanan taraf (kendi kalesine: rakip). side = olayın takımı. */
export const goalBeneficiary = (side, code) => (String(code || "").toUpperCase() === "GOAL_OWN" ? other(side) : side === "away" ? "away" : "home");

/** İki takımlı oyuncu listesi (takım seçilmeden olay): ilk 11 önce, aramaya göre süzülür. */
export function dualPlayerLists(squads, query = "") {
  const q = String(query || "").trim().toLocaleLowerCase("tr-TR");
  const pick = (list) => {
    const all = (list || []).filter((p) => !q || String(p.number) === q || String(p.name || "").toLocaleLowerCase("tr-TR").includes(q));
    return [...all.filter((p) => p.role === "starter"), ...all.filter((p) => p.role !== "starter")];
  };
  return { home: pick(squads?.home), away: pick(squads?.away) };
}
