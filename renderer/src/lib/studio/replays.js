// Yayın Stüdyosu — ÇOK AÇILI TEKRARLAR (saf yardımcılar).
//
// Ana süreç her kaynak ("açı") için ayrı halka kayıt tutar; studio.saveReplay
// istenen açıların son N saniyesini dosyaya yazar:
//   replay = { id, createdAt, label, kind: "goal" | "moment", eventId,
//              durationMs, inSummary?, playerName?,
//              angles: [{ angle: "program" | kaynakId, name, url, path, durationMs, width, height }] }
// "program" açısı yayına giden görüntüdür (skorbord gömülü); gol klibi olarak
// oyuncu profiline yüklenen odur.
//
// Yerelde tekrar başına küçük bilgi de tutulur (meta: maç, taraf, dakika,
// devre, olay kodu) — özet sırasında o anın skoru buradan hesaplanır.
import { isGoalCode } from "./match";

export const PROGRAM_ANGLE = "program";
export const REPLAY_SECONDS = 15;
/** Açı kaydı yapılabilen kaynak türleri (görsel / renk plakası hareketsiz). */
export const RECORDABLE_KINDS = new Set(["camera", "screen", "video"]);

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

/** Sunucu / ana süreç kaydını güvenli biçime çevirir; geçersizse null. */
export function normalizeReplay(r) {
  if (!r || r.id == null) return null;
  const angles = (Array.isArray(r.angles) ? r.angles : [])
    .filter((a) => a && a.angle != null && (a.url || a.path))
    .map((a) => ({ angle: String(a.angle), name: a.name || null, url: a.url || null, path: a.path || null, durationMs: num(a.durationMs), width: num(a.width), height: num(a.height), posterUrl: a.posterUrl || a.thumbUrl || null }));
  const created = typeof r.createdAt === "string" ? Date.parse(r.createdAt) : num(r.createdAt, 0);
  return {
    id: String(r.id),
    createdAt: Number.isFinite(created) ? created : 0,
    label: r.label || null,
    kind: r.kind === "goal" ? "goal" : "moment",
    eventId: r.eventId != null && Number(r.eventId) > 0 ? Number(r.eventId) : null,
    durationMs: num(r.durationMs) || Math.max(0, ...angles.map((a) => a.durationMs)),
    inSummary: Boolean(r.inSummary),
    playerName: r.playerName || null,
    minute: r.minute != null && Number.isFinite(Number(r.minute)) ? Number(r.minute) : null,
    uploaded: Boolean(r.uploaded),
    matchId: r.matchId != null && Number(r.matchId) > 0 ? Number(r.matchId) : null,
    angles,
  };
}

/** Liste: geçerli olanlar, en yeni önce. */
export const normalizeReplays = (list) => (Array.isArray(list) ? list : []).map(normalizeReplay).filter(Boolean).sort((a, b) => b.createdAt - a.createdAt || (a.id < b.id ? 1 : -1));

/**
 * Eski sürüm (yalnız program klibi: studio.saveClip) sonucunu tekrar biçimine
 * çevirir — motor çok açılı kaydı henüz sunmuyorsa.
 */
export function replayFromClip(clip, { kind = "goal", label = null, eventId = null, createdAt = Date.now() } = {}) {
  if (!clip?.url && !clip?.path) return null;
  return normalizeReplay({ id: `clip:${clip.name || createdAt}`, createdAt, kind, label, eventId, durationMs: clip.durationMs, angles: [{ angle: PROGRAM_ANGLE, ...clip }] });
}

/** Tekrarın yerel bilgisi + kayıttaki dakika (yerel bilgi önceliklidir). */
export const metaFor = (replay, metaMap) => ({ ...(replay?.minute != null ? { minute: replay.minute } : {}), ...((metaMap && replay && metaMap[replay.id]) || {}) });

/** Açının okunur adı. */
export function angleLabel(angle, sources = []) {
  const id = typeof angle === "string" ? angle : angle?.angle;
  if (id === PROGRAM_ANGLE) return "Program";
  const src = sources.find((s) => s.id === id);
  return src?.name || (typeof angle === "object" && angle?.name) || "Kaynak";
}

/** Açı kaydı yapılabilen kaynaklar. */
export const recordableSources = (sources) => (sources || []).filter((s) => RECORDABLE_KINDS.has(s.kind));

/**
 * Kaydedilecek açılar: ["program", ...kaynaklar]. pref: { program, all, sources: [id] }.
 * all → tüm kayıt yapılabilir kaynaklar; olmayan kaynak kimlikleri atılır.
 */
export function anglesToRecord(pref, sources) {
  const p = pref || {};
  const rec = recordableSources(sources);
  const ids = p.all ? rec.map((s) => s.id) : (p.sources || []).filter((id) => rec.some((s) => s.id === id));
  return [...(p.program !== false ? [PROGRAM_ANGLE] : []), ...ids];
}

export const toggleIn = (list, id) => ((list || []).includes(id) ? list.filter((x) => x !== id) : [...(list || []), id]);

/** Tekrardaki açı kimlikleri (kaydın sırasıyla). */
export const anglesOf = (replay) => (replay?.angles || []).filter((a) => a.url).map((a) => a.angle);

/**
 * Tekrarın varsayılan oynatma açıları: tercih edilenlerden tekrarda olanlar;
 * hiçbiri yoksa program, o da yoksa ilk açı.
 */
export function defaultAngles(replay, preferred = [PROGRAM_ANGLE]) {
  const have = anglesOf(replay);
  const picked = have.filter((a) => (preferred || []).includes(a));
  if (picked.length) return picked;
  if (have.includes(PROGRAM_ANGLE)) return [PROGRAM_ANGLE];
  return have.slice(0, 1);
}

/** En yeni oynatılabilir tekrar. */
export const latestReplay = (replays) => (replays || []).filter((r) => anglesOf(r).length).sort((a, b) => b.createdAt - a.createdAt)[0] || null;

/**
 * Klibin SESİ. Kamera / kaynak açıları sessiz kaydedilir (açı kaydedicisi yalnız görüntü
 * izi alır); o anın sesi (yorum mikrofonu dahil program sesi) program açısındadır. Program
 * dışı açıda ses program açısının aynı anından alınır: iki kayıt da aynı anda (yakalama
 * anında) BİTER → program klibinde başlangıç = süre farkı.
 * → {} (açının kendi sesi) | { audioUrl, audioOffsetMs }
 */
export function clipAudio(replay, angle) {
  if (!angle || angle.angle === PROGRAM_ANGLE) return {};
  const p = (replay?.angles || []).find((x) => x.angle === PROGRAM_ANGLE && x.url);
  if (!p) return {};
  const pd = Number(p.durationMs || replay.durationMs) || 0;
  const ad = Number(angle.durationMs || replay.durationMs) || 0;
  return { audioUrl: p.url, audioOffsetMs: Math.max(0, Math.round(pd - ad)) };
}

/**
 * Yayın kuyruğu: seçilen her tekrar için seçilen açılar sırayla.
 *   selection: { [replayId]: [açı, …] } (boş dizi → o tekrar atlanır)
 *   order: tekrar kimlikleri sırası (verilmezse eskiden yeniye)
 * Dönüş: [{ key, replayId, angle, url, durationMs, replay }]
 */
export function buildReplayQueue(replays, selection, { order = null } = {}) {
  const byId = new Map((replays || []).map((r) => [r.id, r]));
  const ids = order ? order.filter((id) => byId.has(id)) : [...byId.values()].sort((a, b) => a.createdAt - b.createdAt).map((r) => r.id);
  const out = [];
  for (const id of ids) {
    const want = selection?.[id];
    if (!want || !want.length) continue;
    const r = byId.get(id);
    for (const a of r.angles) {
      if (!a.url || !want.includes(a.angle)) continue;
      out.push({ key: `${id}/${a.angle}`, replayId: id, angle: a.angle, url: a.url, durationMs: a.durationMs || r.durationMs, replay: r, ...clipAudio(r, a) });
    }
  }
  return out;
}

/** Tekrar sırasında alt bant: { kind, label, player }. */
export function replayBanner(replay, meta = {}) {
  if (!replay) return null;
  const player = replay.playerName || meta.scorer || null;
  if (replay.kind === "goal" || isGoalCode(meta.code)) {
    const own = String(meta.code || "").toUpperCase() === "GOAL_OWN";
    return { kind: "goal", label: own ? "KENDİ KALESİNE" : "GOL", player: player ? String(player).toLocaleUpperCase("tr-TR") : null };
  }
  const label = replay.label && !/^önemli an$/i.test(replay.label) ? String(replay.label).toLocaleUpperCase("tr-TR") : null;
  return { kind: "other", label: "ÖNEMLİ AN", player: label };
}

/** Listede başlık: "12' GOL · Can Aydın" / "27' Önemli an". */
export function replayTitle(replay, meta = {}) {
  const min = meta.minute != null ? `${meta.minute}' ` : "";
  if (replay.kind === "goal") return `${min}${String(meta.code || "").toUpperCase() === "GOAL_OWN" ? "Kendi kalesine" : "GOL"}${replay.playerName || meta.scorer ? ` · ${replay.playerName || meta.scorer}` : ""}`;
  return `${min}${replay.label || "Önemli an"}`;
}

/** Tekrar bu maçın mı (bilinmiyorsa true: eski kayıtlar listede kalsın). */
export function replayOfMatch(replay, meta, matchId) {
  const m = replay.matchId ?? meta?.matchId ?? null;
  return !matchId || !m || Number(m) === Number(matchId);
}

/** Saniye metni: 10 500 → "10,5 sn". */
export const secondsText = (ms) => (ms ? `${(Math.round(ms / 100) / 10).toLocaleString("tr-TR")} sn` : "");
