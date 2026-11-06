// YouTube BÖLÜMLERİ — saf yardımcılar (sunucuya POST /matches/:id/chapters ile gider).
//
// YouTube kuralları: ilk bölüm 0:00'da, en az 3 bölüm, her bölüm en az 10 sn.
// İşaretler yayın başından (YouTube kaydının 0:00'ı) ms cinsinden tutulur.
//
// GOL bölümü (45 sn): GOL'e BASILDIĞI andan 15 sn önce başlar; 30 sn sonra
// devam bölümü gelir ("<Ev> 1 - 0 <Dep>"); bu arada başka bölüm başlıyorsa devam
// bölümü konmaz. Ad: "<Ev> 1 - 0 <Dep> | Gol: <Golcü>" (skor golden SONRA; kendi
// kalesine: "Gol: <Oyuncu> (k.k.)"). Yakın bölümler (10 sn'den az arayla) birleşir:
// iki gol → "Gol: A, B" (son skor), gol + işaret → gol kalır, iki işaret → "A · B";
// ilk 10 sn'deki bölüm 0:00'ın adı olur. Sunucu da aynı kurallarla düzeltir.
import { chapterStamp } from "../../../lib/studio/broadcast";
import { scoreFromEvents } from "../../../lib/studio/match";

export const CHAPTER_MIN_GAP_MS = 10_000;
export const CHAPTER_MIN_COUNT = 3;
export const CHAPTER_LABEL_MAX = 80;
export const GOAL_CHAPTER_BEFORE_MS = 15_000;
export const GOAL_CHAPTER_AFTER_MS = 30_000;
export const RESUME_LABEL = "Maç devam ediyor";

const label = (v) => String(v ?? "").replace(/[<>\r\n]/g, " ").replace(/\s+/g, " ").trim().slice(0, CHAPTER_LABEL_MAX);
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export const isOwnGoalCode = (code) => String(code || "").toUpperCase() === "GOAL_OWN";

/** "Yazici FK 1 - 0 Yazici Team" (takım adı yoksa "Maç devam ediyor"). */
export function scoreLabel(g) {
  if (!g || (!label(g.home) && !label(g.away))) return RESUME_LABEL;
  return label(`${label(g.home)} ${num(g.homeScore)} - ${num(g.awayScore)} ${label(g.away)}`);
}

/** Gol adı: "<Ev> 1 - 0 <Dep> | Gol: <Golcü>" (kendi kalesine "(k.k.)"); g.scorers: birleşen goller. */
export function goalChapterLabel(g) {
  if (!g) return "Gol";
  const scorers = (Array.isArray(g.scorers) ? g.scorers : [{ scorer: g.scorer, own: g.own }])
    .map((x) => (label(x?.scorer) ? `${label(x.scorer)}${x.own ? " (k.k.)" : ""}` : null)).filter(Boolean);
  const head = label(g.home) || label(g.away) ? scoreLabel(g) : `${num(g.homeScore)} - ${num(g.awayScore)}`;
  const tail = scorers.length ? `Gol: ${scorers.join(", ")}` : "Gol";
  const full = `${head} | ${tail}`;
  if (full.length <= CHAPTER_LABEL_MAX) return full;
  // Uzun adlarda önce skor kısmı (takım adları) kısalır, golcüler korunur.
  const room = Math.max(12, CHAPTER_LABEL_MAX - tail.length - 3);
  return label(`${head.slice(0, room).trim()} | ${tail}`);
}

/**
 * Golden SONRAKİ skor. Olay (created: { id, takim_id, olay_kodu }) varsa maçın
 * olaylarıyla yeniden sayılır (kendi kalesine gol rakibe yazılır); skor elle
 * tutuluyorsa ya da olay bilgisi yoksa önceki skora bir gol eklenir.
 */
export function goalScoreAfter({ events = [], created = null, homeTeamId, awayTeamId, manual = false, score = null, side = null, code = null } = {}) {
  const tid = Number(created?.takim_id);
  if (!manual && created && tid && (tid === Number(homeTeamId) || tid === Number(awayTeamId))) {
    const list = (Array.isArray(events) ? events : []).filter((e) => Number(e?.id) !== Number(created.id));
    return scoreFromEvents([...list, { ...created, olay_kodu: created.olay_kodu || code }], homeTeamId, awayTeamId);
  }
  const own = isOwnGoalCode(code ?? created?.olay_kodu);
  const scorerSide = side === "away" ? "away" : "home";
  const benefit = own ? (scorerSide === "home" ? "away" : "home") : scorerSide;
  const out = { home: num(score?.home), away: num(score?.away) };
  out[benefit] += 1;
  return out;
}

/**
 * Kayıtlı işaretler → bölüm başlangıçları (normalizeChapters'a girer).
 * items: [{ atMs, label, kind: "goal"|"mark", goal?: { home, away, homeScore, awayScore, scorer, own }, custom? }]
 * Gol: başlangıç atMs − 15 sn; atMs + 30 sn'de devam bölümü (araya başka bölüm girmezse).
 * custom: ad elle değiştirildi (kayıtlı ad kullanılır).
 */
export function chapterSegments(items, { before = GOAL_CHAPTER_BEFORE_MS, after = GOAL_CHAPTER_AFTER_MS } = {}) {
  const segs = (Array.isArray(items) ? items : [])
    .map((m) => ({ ...m, at: Math.round(Number(m?.atMs ?? m?.at_ms)) }))
    .filter((m) => Number.isFinite(m.at))
    .map((m) => {
      if (m.kind !== "goal") return { atMs: Math.max(0, m.at), label: label(m.label) || "Bölüm", kind: "mark" };
      const custom = Boolean(m.custom || !m.goal);
      return {
        atMs: Math.max(0, m.at - before), label: custom ? label(m.label) || "Gol" : goalChapterLabel(m.goal), kind: "goal",
        goal: custom ? null : m.goal, end: Math.max(0, m.at) + after, resume: scoreLabel(m.goal),
      };
    })
    .sort((a, b) => a.atMs - b.atMs);
  const out = [];
  segs.forEach((g, i) => {
    out.push({ atMs: g.atMs, label: g.label, kind: g.kind, goal: g.goal || null });
    if (g.kind !== "goal") return;
    const next = segs[i + 1];
    if (next && next.atMs <= g.end) return; // başka bölüm devamdan önce başlıyor
    out.push({ atMs: g.end, label: g.resume, kind: "resume" });
  });
  return out.sort((a, b) => a.atMs - b.atMs);
}

/** İki gol bölümünü birleştir (son skor, golcüler sırayla). */
function mergeGoals(a, b) {
  if (!a.goal || !b.goal) return { ...a, kind: "goal", label: a.label.includes(b.label) ? a.label : label(`${a.label} · ${b.label}`) };
  const list = (g) => (Array.isArray(g.scorers) ? g.scorers : [{ scorer: g.scorer, own: g.own }]);
  const goal = { ...b.goal, scorers: [...list(a.goal), ...list(b.goal)] };
  return { ...a, kind: "goal", goal, label: goalChapterLabel(goal) };
}

/**
 * İşaretler [{ atMs | at_ms, label, kind?, goal? }] → YouTube'a gidecek liste [{ at_ms, label }].
 * Sıralı, ilk 0:00, aralar ≥ minGapMs (yakınlar türüne göre birleşir), boş adlar "Bölüm".
 * kind: "mark" (varsayılan) | "goal" | "resume" (gol sonrası devam: yakınında bölüm varsa düşer).
 */
export function normalizeChapters(markers, { first = "Başlangıç", minGapMs = CHAPTER_MIN_GAP_MS } = {}) {
  const list = (Array.isArray(markers) ? markers : [])
    .map((m) => ({ at: Math.max(0, Math.round(Number(m?.atMs ?? m?.at_ms))), label: label(m?.label) || "Bölüm", kind: m?.kind === "goal" || m?.kind === "resume" ? m.kind : "mark", goal: m?.goal || null }))
    .filter((m) => Number.isFinite(m.at))
    .sort((a, b) => a.at - b.at);
  const out = [{ at_ms: 0, label: label(first) || "Başlangıç", named: false, kind: "start", goal: null }];
  for (const m of list) {
    let last = out[out.length - 1];
    // Devam bölümü yakındaki gerçek bir bölüme yer açar.
    while (out.length > 1 && last.kind === "resume" && m.kind !== "resume" && m.at - last.at_ms < minGapMs) { out.pop(); last = out[out.length - 1]; }
    if (m.at - last.at_ms < minGapMs) {
      if (m.kind === "resume") continue;
      if (out.length === 1 && !last.named && m.at < minGapMs) { out[0] = { at_ms: 0, label: m.label, named: true, kind: m.kind, goal: m.goal }; continue; }
      if (m.kind === "goal" && last.kind === "goal") { out[out.length - 1] = mergeGoals(last, m); continue; }
      if (m.kind === "goal") { out[out.length - 1] = { ...last, label: m.label, kind: "goal", goal: m.goal, named: true }; continue; }
      if (last.kind === "goal") continue;
      if (!last.label.includes(m.label)) last.label = label(`${last.label} · ${m.label}`);
      continue;
    }
    out.push({ at_ms: m.at, label: m.label, named: true, kind: m.kind, goal: m.goal });
  }
  return out.map(({ at_ms, label: l }) => ({ at_ms, label: l }));
}

/** Kayıtlı işaretlerden YouTube listesi: gol pencereleri + birleştirme + kurallar. */
export const buildChapters = (items, opts) => normalizeChapters(chapterSegments(items), opts);

/** Liste YouTube'da bölüm olarak görünür mü → { ok, problems: [metin] }. */
export function chapterRules(chapters, { minGapMs = CHAPTER_MIN_GAP_MS, minCount = CHAPTER_MIN_COUNT } = {}) {
  const list = Array.isArray(chapters) ? chapters : [];
  const problems = [];
  if (!list.length || list[0].at_ms !== 0) problems.push("İlk bölüm 0:00'da olmalı.");
  if (list.length < minCount) problems.push(`En az ${minCount} bölüm gerekir (şu an ${list.length}).`);
  for (let i = 1; i < list.length; i += 1) {
    if (list[i].at_ms - list[i - 1].at_ms < minGapMs) { problems.push(`Bölümler en az ${Math.round(minGapMs / 1000)} sn olmalı.`); break; }
  }
  return { ok: problems.length === 0, problems };
}

/** Açıklamaya yapıştırılan metin ("00:00 Başlangıç\n12:31 Gol – Ali"). */
export const chaptersText = (chapters) => (Array.isArray(chapters) ? chapters : []).map((c) => `${chapterStamp(c.at_ms)} ${c.label}`).join("\n");

/** Değişiklik imzası (aynı liste yeniden gönderilmez). */
export const chapterSignature = (chapters) => (Array.isArray(chapters) ? chapters : []).map((c) => `${c.at_ms}:${c.label}`).join("|");

/**
 * Bölüm başlangıcı (YouTube kaydının 0:00'ı). Kayıt: { startAt, startKind }.
 * since: engine.since (bu bağlantının başlangıcı), mode: "live" | "rehearsal".
 * Yeniden bağlanmada (aynı yayın) başlangıç SIFIRLANMAZ; provadan sonra ilk
 * gerçek yayın başlangıcı provayı geçersiz kılar (provadaki işaretler atılır).
 */
export function nextChapterStart(entry, { since, mode }) {
  const cur = entry || { startAt: null, startKind: null, items: [] };
  if (!since) return cur;
  if (mode === "live" && cur.startKind !== "live") {
    return { ...cur, startAt: since, startKind: "live", items: (cur.items || []).filter((x) => x.at >= since) };
  }
  if (!cur.startAt) return { ...cur, startAt: since, startKind: mode === "live" ? "live" : "rehearsal" };
  return cur;
}

/** "mm:ss" / "h:mm:ss" / "ss" → ms (geçersizse null). */
export function parseStamp(text) {
  const parts = String(text ?? "").trim().split(":").map((x) => x.trim());
  if (!parts.length || parts.length > 3 || parts.some((p) => !/^\d{1,3}$/.test(p))) return null;
  const n = parts.map(Number);
  const sec = n.length === 3 ? n[0] * 3600 + n[1] * 60 + n[2] : n.length === 2 ? n[0] * 60 + n[1] : n[0];
  return sec * 1000;
}
