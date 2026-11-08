// Yayın Stüdyosu — ÖNİZLEME → PROGRAM (saf durum makinesi) [önizleme-geçiş].
//
// KURAL: yayına gidebilecek her içerik (sahne, tekrar / açı, VAR, röportaj, özet,
// hazır ekranlar) tıklanınca önce ÖNİZLEME'ye yüklenir (stüdyo modunda). GEÇİŞ
// (Boşluk, şeritteki geçiş parçacıkları, önizleme düzenleyicisindeki "Yayına al")
// HER ZAMAN önizlemede ne görünüyorsa onu PROGRAM'a verir: aynı içerik, aynı
// açı(lar), aynı yakınlaştırma / kaydırma, aynı giriş / çıkış noktası ve hız.
//
// Önizleme durumu (tek doğruluk kaynağı):
//   { kind: "scene", sceneId }
//   { kind: "replay", mode: "tekrar", replayId, angle, angles, items, inSec, outSec, rate, zoom, view }
//   { kind: "var" | "interview" | "highlight", mode }
//   { kind: "none" }
// Program durumu:
//   { kind: "scene", sceneId }
//   { kind: <mod türü>, mode, payload, returnSceneId }   (returnSceneId: kipten önce yayındaki sahne)
//
// planTake(önizleme, program) → ne yapılacağı:
//   none   önizleme boş ya da zaten yayında
//   scene  sahneye geçiş (kip yayındaysa kip geçişle biter: endMode)
//   mode   kipi yayına al (replace: aynı kip yayındayken önizlemedeki yeni içerik)
// Geçişten sonra önizleme tutarlı kalır: yayından düşen sahne önizlemeye gelir
// (OBS / vMix stüdyo modu gibi) — ikinci GEÇİŞ geri döndürür. Tekrar kendiliğinden
// bitince program kipten önceki sahneye döner (programAfterModeEnd).

export const MODE_KIND = Object.freeze({ tekrar: "replay", var: "var", roportaj: "interview", ozet: "highlight" });
export const KIND_MODE = Object.freeze(Object.fromEntries(Object.entries(MODE_KIND).map(([m, k]) => [k, m])));
export const kindOfMode = (mode) => MODE_KIND[mode] || null;
export const modeOfKind = (kind) => KIND_MODE[kind] || null;

const defaultKey = (replayId, angle) => `${replayId || ""}|${angle || ""}`;
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const clampRate = (r) => Math.round(Math.min(2, Math.max(0.25, num(r, 1) || 1)) * 20) / 20;
const copyView = (v) => ({ zoom: num(v?.zoom, 1) || 1, cx: num(v?.cx, 0.5), cy: num(v?.cy, 0.5) });

/**
 * Yayın kuyruğu. playlist ([{ replayId, angle }], açık sıra — replayDeck) verilirse o sırayla;
 * yoksa seçimden (replayId → [açı]): tekrarlar eskiden yeniye, açılar kayıt sırasıyla.
 */
function queueOf(list, selection, order = null, playlist = null) {
  const out = [];
  if (Array.isArray(playlist)) {
    for (const e of playlist) {
      const r = (list || []).find((x) => x.id === e?.replayId);
      const a = r?.angles?.find((x) => x.angle === e.angle && x.url);
      if (r && a) out.push({ replay: r, angle: a });
    }
    return out;
  }
  const rank = (r) => { const i = order ? order.indexOf(r.id) : -1; return i >= 0 ? i : Infinity; };
  const sorted = [...(list || [])].sort((a, b) => (rank(a) - rank(b)) || (num(a.createdAt) - num(b.createdAt)));
  for (const r of sorted) {
    const want = selection?.[r.id];
    if (!want?.length) continue;
    for (const a of r.angles || []) if (a.url && want.includes(a.angle)) out.push({ replay: r, angle: a });
  }
  return out;
}

/**
 * Önizlemedeki tekrarın yükü (yayına aynen gider).
 *   list: tekrarlar · selection: { replayId: [açı] } · order: tekrar sırası (isteğe bağlı) · cursor: { replayId, angle } (önizlenen klip)
 *   inOf / outOf / viewOf / rateOf (anahtar → değer; rateOf: öğeye özel hız ya da null), keyOf(replayId, angle), rate
 *   playlist: açık sıralı oynatma listesi (verilirse selection / order yerine)
 * Önizleme imleçteki klibi gösterir; imleç seçili kuyruktaysa yayın o klipten
 * başlayıp kuyruğun kalanını sırayla oynar, değilse yalnız o klip yayına gider.
 * Dönüş: yük ya da null (önizlenecek klip yok).
 */
export function replayPayload({ list, selection, order = null, playlist = null, cursor, inOf, outOf, viewOf, rateOf, keyOf = defaultKey, rate = 1 } = {}) {
  const queue = queueOf(list, selection, order, playlist);
  let cur = null;
  if (cursor?.replayId) {
    const r = (list || []).find((x) => x.id === cursor.replayId);
    const a = r?.angles?.find((x) => x.angle === cursor.angle && x.url) || r?.angles?.find((x) => x.url);
    if (r && a) cur = { replay: r, angle: a };
  }
  if (!cur) cur = queue[0] || null;
  if (!cur) return null;
  const at = queue.findIndex((q) => q.replay.id === cur.replay.id && q.angle.angle === cur.angle.angle);
  const base = at >= 0 ? queue.slice(at) : [cur];
  const items = base.map(({ replay, angle }) => {
    const k = keyOf(replay.id, angle.angle);
    const startSec = Math.max(0, num(inOf?.(k), 0));
    const out = num(outOf?.(k), 0);
    const own = num(rateOf?.(k), 0);
    return {
      key: `${replay.id}/${angle.angle}`,
      replayId: replay.id,
      angle: angle.angle,
      url: angle.url,
      durationMs: angle.durationMs || replay.durationMs || 0,
      replay,
      startSec,
      endSec: out > startSec + 0.2 ? out : null,
      view: copyView(viewOf?.(k)),
      ...(own > 0 ? { rate: clampRate(own) } : {}),
    };
  });
  const first = items[0];
  return {
    kind: "replay",
    mode: "tekrar",
    replayId: first.replayId,
    angle: first.angle,
    angles: items.filter((x) => x.replayId === first.replayId).map((x) => x.angle),
    items,
    inSec: first.startSec,
    outSec: first.endSec,
    rate: clampRate(rate),
    zoom: first.view.zoom,
    view: first.view,
  };
}

/** Oynatıcı kuyruğu (useReplayPlayer): her öğe kendi giriş / çıkışı, görünümü ve donmuş hızıyla. */
export function playerQueueOf(payload) {
  if (!payload?.items?.length) return [];
  return payload.items.map((it) => ({ ...it, view: { ...it.view }, rate: it.rate > 0 ? it.rate : payload.rate }));
}

/** İki yük aynı mı (aynı klipler, açı, giriş / çıkış, görünüm, hız). */
export function samePayload(a, b) {
  if (!a || !b) return a === b;
  if (a.kind !== b.kind) return false;
  if (a.kind !== "replay") return true;
  if (a.rate !== b.rate || a.items.length !== b.items.length) return false;
  return a.items.every((x, i) => {
    const y = b.items[i];
    return x.replayId === y.replayId && x.angle === y.angle && x.startSec === y.startSec && x.endSec === y.endSec && (x.rate || 0) === (y.rate || 0)
      && x.view.zoom === y.view.zoom && x.view.cx === y.view.cx && x.view.cy === y.view.cy;
  });
}

/** Önizleme durumu: kip önizlemedeyse kip (tekrarda yüküyle), değilse önizleme sahnesi. */
export function previewStateOf({ previewSceneId = null, previewMode = null, payload = null } = {}) {
  const kind = kindOfMode(previewMode);
  if (kind === "replay") return payload ? { ...payload, kind, mode: previewMode } : { kind, mode: previewMode, empty: true };
  if (kind) return { kind, mode: previewMode, ...(payload && typeof payload === "object" ? { payload } : {}) };
  if (previewSceneId) return { kind: "scene", sceneId: previewSceneId };
  return { kind: "none" };
}

/** Program durumu. Kip çıkış geçişindeyse (leaving) program artık sahnedir. */
export function programStateOf({ programSceneId = null, airMode = null, airStage = "idle", airPayload = null } = {}) {
  const kind = kindOfMode(airMode);
  if (kind && airStage !== "idle" && airStage !== "leaving") return { kind, mode: airMode, payload: airPayload || null, returnSceneId: programSceneId };
  return { kind: "scene", sceneId: programSceneId };
}

const isMode = (s) => Boolean(s && s.kind !== "scene" && s.kind !== "none");
/** Programın altındaki sahne (kip yayındayken kipten önceki sahne). */
export const baseSceneOf = (program) => (isMode(program) ? program.returnSceneId : program?.sceneId) || null;

/**
 * GEÇİŞ planı. studioMode false: önizleme yoktur, yüklenen içerik anında yayına
 * gider ve "önizleme" yayındakini izler.
 */
export function planTake({ preview, program, studioMode = true } = {}) {
  const pv = preview || { kind: "none" };
  const pg = program || { kind: "scene", sceneId: null };
  const base = baseSceneOf(pg);
  if (pv.kind === "none") return { type: "none", reason: "Önizleme boş." };
  if (pv.kind === "scene") {
    if (!pv.sceneId) return { type: "none", reason: "Önizleme boş." };
    if (!isMode(pg) && pg.sceneId === pv.sceneId) return { type: "none", reason: "Bu sahne zaten yayında." };
    return {
      type: "scene",
      to: pv.sceneId,
      from: isMode(pg) ? pg.mode : base,
      endMode: isMode(pg),
      nextPreviewSceneId: studioMode ? base || pv.sceneId : pv.sceneId,
      clearPreviewMode: false,
    };
  }
  if (pv.kind === "replay" && (pv.empty || !pv.items?.length)) return { type: "none", reason: "Önizlemede tekrar yok: listeden bir tekrar seç." };
  const mode = pv.mode || modeOfKind(pv.kind);
  const replace = isMode(pg) && pg.mode === mode;
  if (replace && pv.kind !== "replay") return { type: "none", reason: "Bu içerik zaten yayında." };
  return {
    type: "mode",
    mode,
    payload: pv.kind === "replay" ? pv : pv.payload || null,
    replace,
    restart: replace && samePayload(pv, pg.payload),
    returnSceneId: base,
    nextPreviewSceneId: base,
    clearPreviewMode: true,
  };
}

/** Yükle, sonra (stüdyo modu kapalıysa ya da "doğrudan yayına" açıksa) aynı GEÇİŞ yoluyla yayına al. */
export const takeAfterLoad = ({ studioMode = true, direct = false } = {}) => !studioMode || Boolean(direct);

/** Kip kendiliğinden bitince (tekrar kuyruğu sona erdi) program kipten önceki sahneye döner. */
export function programAfterModeEnd(program) {
  if (!isMode(program)) return program || { kind: "scene", sceneId: null };
  return { kind: "scene", sceneId: program.returnSceneId || null };
}

/** GEÇİŞ düğmesinin metni. */
export const takeLabel = (preview) => (isMode(preview) ? "YAYINA AL" : "GEÇİŞ");

/** Önizlemedeki tekrarın kısa açıklaması: "2 açı · 0,5× · giriş 0:03". */
export function payloadSummary(p) {
  if (!p || p.kind !== "replay" || !p.items?.length) return "";
  const parts = [];
  if (p.items.length > 1) parts.push(`${p.items.length} klip sırayla`);
  if (p.rate !== 1) parts.push(`${String(p.rate).replace(".", ",")}×`);
  if (p.zoom > 1.001) parts.push(`${p.zoom.toFixed(1).replace(".", ",")}× yakın`);
  if (p.inSec > 0 || p.outSec) parts.push("kırpılmış");
  return parts.join(" · ");
}
