// Yayın Stüdyosu — [gol-klip] GOL / ÖNEMLİ AN klibinin yakalama, gecikmeli yükleme ve
// seçilen açılar mantığı (saf; sınanır).
//
//   YAKALAMA  Butona basıldığı an + "Butondan sonra kaydedilecek süre" (varsayılan 4 sn):
//             kayıt postSec dolunca yazılır, pencere = öncesi + sonrası (geri sayım listede).
//   YÜKLEME   Olay bağlanınca "Yükleme gecikmesi" (varsayılan 60 sn) beklenir; bu sürede
//             operatörün tekrar için seçtiği / yayına verdiği açılar (markAiredSelection)
//             kaydedilir. Yükleme anında: bölüm varsa o bölümlerin kurgusu (ana süreç
//             replays.composeSelection), yalnız açı seçildiyse açıların tamamı sırayla,
//             hiçbiri yoksa program açısı (eskisi gibi).
//   ÖZET      Varsayılan özet listesi: yayına verilen / seçilen konumlar aynı açı ve
//             bölümleriyle, kronolojik.
import { PROGRAM_ANGLE, anglesOf, defaultAngles } from "./replays";

export const POST_ROLL_DEFAULT = 4;
export const POST_ROLL_MAX = 15;
export const UPLOAD_DELAY_DEFAULT = 60;
export const UPLOAD_DELAY_MAX = 600;

const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
export const clampPostRoll = (v) => Math.round(Math.min(POST_ROLL_MAX, Math.max(0, num(v, POST_ROLL_DEFAULT))));
export const clampUploadDelay = (v) => Math.round(Math.min(UPLOAD_DELAY_MAX, Math.max(0, num(v, UPLOAD_DELAY_DEFAULT))));

/**
 * Yakalama penceresi: { seconds (öncesi + sonrası, en çok 60), saveDelayMs }.
 * pre: basıştan geriye (3…45), post: basıştan sonra (0…15).
 */
export function captureWindow(pre, post) {
  const p = Math.round(Math.min(45, Math.max(3, num(pre, 15))));
  const q = clampPostRoll(post);
  return { pre: p, post: q, seconds: Math.min(60, p + q), saveDelayMs: q * 1000 };
}

/** 42 000 → "0:42"; 125 000 → "2:05". */
export function countdownText(ms) {
  const s = Math.max(0, Math.ceil((Number(ms) || 0) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

const round3 = (v) => Math.round(Number(v) * 1000) / 1000;

/**
 * Tekrar modunun yayın yükünden (lib/studio/previewTake › replayPayload) tekrar başına
 * yayına verilen açılar ve bölümler: { [replayId]: { angles, segments: [{ angle, inSec, outSec }] } }.
 * outSec null → klibin sonuna kadar.
 */
export function selectionFromPayload(payload) {
  const out = {};
  for (const it of payload?.items || []) {
    if (!it?.replayId || !it.angle) continue;
    const e = out[it.replayId] || (out[it.replayId] = { angles: [], segments: [] });
    if (!e.angles.includes(it.angle)) e.angles.push(it.angle);
    const inSec = Math.max(0, Number(it.startSec) || 0);
    const end = Number(it.endSec);
    e.segments.push({ angle: String(it.angle), inSec: round3(inSec), outSec: Number.isFinite(end) && end > inSec + 0.2 ? round3(end) : null });
  }
  return out;
}

/** Seçimi güvenli biçime çevirir: { angles, segments, aired, at } | null. */
export function normalizeAired(sel, replay = null) {
  if (!sel || typeof sel !== "object") return null;
  const have = replay ? new Set(anglesOf(replay)) : null;
  const ok = (a) => typeof a === "string" && a && (!have || have.has(a));
  const angles = (Array.isArray(sel.angles) ? sel.angles : []).filter((a, i, l) => ok(a) && l.indexOf(a) === i);
  const segments = (Array.isArray(sel.segments) ? sel.segments : [])
    .filter((s) => s && ok(String(s.angle)))
    .map((s) => {
      const inSec = Math.max(0, Number(s.inSec) || 0);
      const o = Number(s.outSec);
      return { angle: String(s.angle), inSec: round3(inSec), outSec: Number.isFinite(o) && o > inSec + 0.2 ? round3(o) : null };
    })
    .slice(0, 12);
  if (!angles.length && !segments.length) return null;
  return { angles: angles.length ? angles : [...new Set(segments.map((s) => s.angle))], segments, aired: Boolean(sel.aired), at: Number(sel.at) || Date.now() };
}

/**
 * Yüklenecek seçim = YAYINA VERİLEN bölümler + operatörün o pozisyon için SEÇTİĞİ açılar.
 *   aired: { angles, segments } (yayındaki giriş / çıkışlarla) | null
 *   picks: [açı] (pozisyonun seçili açıları, tıklama sırası) | null
 * Seçim varsa yükleme ONU izler (yükleme anına kadar değiştirilebilir): seçili her açı için
 * yayındaki bölümleri (varsa, aynı giriş / çıkışla) yoksa tüm klibi, seçim sırasıyla.
 * Seçim yoksa yayına verilen; o da yoksa null (→ program açısı).
 */
export function effectiveSelection({ aired = null, picks = null } = {}, replay = null) {
  const a = normalizeAired(aired, replay);
  const have = replay ? new Set(anglesOf(replay)) : null;
  const p = (Array.isArray(picks) ? picks : []).filter((x, i, l) => typeof x === "string" && x && (!have || have.has(x)) && l.indexOf(x) === i);
  if (!p.length) return a ? { ...a, aired: true } : null;
  const segments = [];
  for (const angle of p) {
    const own = (a?.segments || []).filter((s) => s.angle === angle);
    if (own.length) segments.push(...own.map((s) => ({ ...s })));
    else segments.push({ angle, inSec: 0, outSec: null });
  }
  return normalizeAired({ angles: p, segments, aired: Boolean(a), at: Date.now() }, replay);
}

/**
 * Yüklemede ne gönderilir:
 *   { mode: "program" }                              seçim yok ya da yalnız program
 *   { mode: "angles", segments, count }              bölümler (yayına verilen) ya da seçilen açılar sırayla
 */
export function uploadPlanOf(replay, sel) {
  const s = normalizeAired(sel, replay);
  if (!s) return { mode: "program", count: 0 };
  let segments = s.segments;
  if (!segments.length) segments = s.angles.map((angle) => ({ angle, inSec: 0, outSec: null }));
  const onlyProgramFull = segments.length === 1 && segments[0].angle === PROGRAM_ANGLE && !segments[0].inSec && segments[0].outSec == null;
  if (!segments.length || onlyProgramFull) return { mode: "program", count: 0 };
  return { mode: "angles", segments, count: new Set(segments.map((x) => x.angle)).size };
}

/** Listede yükleme satırı: "Yükleme 0:42 sonra · 2 açı seçili". */
export function scheduledText(dueAt, plan, now = Date.now()) {
  const left = countdownText(Math.max(0, dueAt - now));
  const tail = plan?.mode === "angles" ? ` · ${plan.count} açı seçili` : " · program açısı";
  return `Yükleme ${left} sonra${tail}`;
}

/**
 * Reji (Maç yönetimi) GOL dokunuşları: olay kaydedilince bekleyen kliplerden hangisi
 * bağlanır. EN YENİ aynı taraf (eskiden en ESKİ seçiliyordu: iptal edilmiş eski bir
 * dokunuşun klibi — başka bir anın görüntüsü — yeni golün videosu oluyordu); aynı taraf
 * yoksa (kendi kalesine) en yeni. → dizin | -1
 */
export function pickDockClip(list, side) {
  const l = list || [];
  for (let i = l.length - 1; i >= 0; i -= 1) if (!side || l[i].side === side) return i;
  return l.length ? l.length - 1 : -1;
}

/**
 * ÖZET varsayılanı: goller + "özete ekle" işaretli anlar + YAYINA VERİLEN / SEÇİLEN
 * konumlar; kronolojik. Seçimi olan öğe aynı açılar ve bölümlerle gelir.
 *   selectionOf(replayId) → { angles, segments } | null
 * Dönüş: [{ replayId, angles, segments? }]
 */
export function defaultSummaryItems(replays, { preferredAngles = [PROGRAM_ANGLE], selectionOf = () => null, include = () => true } = {}) {
  return [...(replays || [])]
    .filter((r) => include(r) && r.angles.some((a) => a.url))
    .map((r) => ({ r, sel: normalizeAired(selectionOf(r.id), r) }))
    .filter(({ r, sel }) => r.kind === "goal" || r.inSummary || sel)
    .sort((a, b) => a.r.createdAt - b.r.createdAt)
    .map(({ r, sel }) => {
      if (!sel) return { replayId: r.id, angles: defaultAngles(r, preferredAngles) };
      const segments = sel.segments.length ? sel.segments : null;
      return { replayId: r.id, angles: sel.angles, ...(segments ? { segments } : {}) };
    });
}

/* ───────────── canlı maç olayları: eski yoklamanın yeni olayı silmesine karşı ───────────── */

export const LOCAL_EVENT_GRACE_MS = 30_000;

/**
 * Sunucu listesi + yerel değişiklikler. Yoklama (6 sn) olay yazılmadan ÖNCE başlayıp SONRA
 * dönerse yeni golü içermeyen eski listeyle durum değişiyor, gol listeden / skordan
 * kayboluyordu (skor eşitlemesi de bu eski listeyle maç kaydına ESKİ skoru yazabiliyordu).
 *   local: { created: Map(id → { ev, at }), removed: Map(id → at) }
 * Sunucuda henüz görünmeyen yeni olay GRACE süresince listede tutulur; silinen olay
 * sunucu geç kalırsa geri gelmez. Yanıtlar sırasız dönebilir (yoklama + skor eşitlemesi):
 * issuedAt = isteğin GÖNDERİLDİĞİ an; değişiklikten önce gönderilmiş yanıt yerel kaydı
 * düşürmez. Değişiklikten sonra gönderilmiş bir yanıt durumu doğrulayınca yerel kayıt düşer.
 */
export function mergeEvents(server, local, now = Date.now(), { issuedAt = now, graceMs = LOCAL_EVENT_GRACE_MS } = {}) {
  const list = Array.isArray(server) ? server : [];
  const created = local?.created || new Map();
  const removed = local?.removed || new Map();
  const ids = new Set(list.map((e) => Number(e?.id)));
  for (const [id, at] of [...removed]) {
    if (now - at > graceMs || (issuedAt > at && !ids.has(id))) removed.delete(id);
  }
  const out = list.filter((e) => !removed.has(Number(e?.id)));
  for (const [id, x] of [...created]) {
    if (now - x.at > graceMs || (issuedAt > x.at && ids.has(id))) { created.delete(id); continue; }
    if (!ids.has(id) && !removed.has(id)) out.push(x.ev);
  }
  return out;
}
