// Yayın grafikleri · SAHNE BAZLI GÖRÜNÜRLÜK ve maç başına yerel durum (saf).
//
//   visibility = { scorebug: "all" | [sceneId…], subtitle: …, interview: … }
//
// "all" (varsayılan): grafik her sahnede çizilir. Dizi: yalnız o sahnelerde
// (boş dizi = hiçbir sahnede). drawGraphics(ctx, { sceneId }, snap) sahne
// verilmezse süzmez (eski davranış).
//
// Stüdyoya özgü grafik durumu (çeşit, altyazı / röportaj yayında mı,
// görünürlük…) maç başına localStorage'da: elitlig.studio.graphics.<maçId>.
// Bir maçta yapılan değişiklik başka maçın kaydına asla yazılmaz.

export const VISIBILITY_KEYS = ["scorebug", "subtitle", "interview"];
export const VISIBILITY_LABELS = { scorebug: "Skorbord", subtitle: "Altyazı", interview: "Röportaj bandı" };

const cleanIds = (list) => [...new Set((Array.isArray(list) ? list : []).map((x) => String(x ?? "").trim()).filter(Boolean))];

/** Tek grafik için: "all" ya da benzersiz sahne kimlikleri dizisi. */
export function normalizeVisibilityValue(value) {
  if (Array.isArray(value)) return cleanIds(value);
  return "all";
}

/** Tüm grafikler için görünürlük (eksik / bozuk alanlar "all"). */
export function normalizeVisibility(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const out = {};
  for (const key of VISIBILITY_KEYS) out[key] = normalizeVisibilityValue(src[key]);
  return out;
}

/** Grafik bu sahnede görünür mü? sceneId yoksa her zaman evet. */
export function isVisibleIn(visibility, key, sceneId) {
  if (sceneId == null || sceneId === "") return true;
  const v = visibility && typeof visibility === "object" ? visibility[key] : undefined;
  if (!Array.isArray(v)) return true;
  return v.map(String).includes(String(sceneId));
}

/**
 * Bir sahneyi aç / kapa. "all" iken bir sahne kapatılırsa diğer tüm sahneler
 * seçili kalır; tüm sahneler seçilince yeniden "all" olur.
 */
export function toggleSceneVisibility(value, sceneId, allSceneIds = []) {
  const all = cleanIds(allSceneIds);
  const id = String(sceneId);
  const cur = Array.isArray(value) ? cleanIds(value) : all.slice();
  const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
  if (all.length && all.every((x) => next.includes(x))) return "all";
  // Sırayı sahne listesine göre tut (görüntü ve karşılaştırma tutarlı olsun).
  return all.length ? all.filter((x) => next.includes(x)).concat(next.filter((x) => !all.includes(x))) : next;
}

/** Görünürlüğün kısa özeti: "Tüm sahneler", "Gizli", "2 sahne: A, B". */
export function visibilitySummary(value, scenes = []) {
  if (!Array.isArray(value)) return "Tüm sahneler";
  if (!value.length) return "Hiçbir sahnede";
  const names = value.map((id) => scenes.find((s) => String(s.id) === String(id))?.name || id);
  return `${value.length} sahne: ${names.join(", ")}`;
}

/* ------------------------------ maç başına yerel durum ------------------------------ */

export const graphicsStoreKey = (matchId) => `elitlig.studio.graphics.${Number(matchId) > 0 ? Number(matchId) : "none"}`;

const safeStorage = (storage) => storage || (typeof localStorage !== "undefined" ? localStorage : null);

/** Maçın stüdyo grafik durumu (yoksa {}). */
export function readMatchGraphics(matchId, storage) {
  const s = safeStorage(storage);
  try {
    const v = JSON.parse(s?.getItem(graphicsStoreKey(matchId)) || "null");
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

/**
 * Yalnız bu maçın kaydını yamalar ve yeni durumu döner. base verilmezse
 * kayıttan okunur (başka maçın bellekteki durumu asla taban alınmaz).
 */
export function patchMatchGraphics(matchId, patch, { storage, base } = {}) {
  const s = safeStorage(storage);
  const next = { ...(base && typeof base === "object" ? base : readMatchGraphics(matchId, s)), ...(patch || {}) };
  if (Number(matchId) > 0) {
    try { s?.setItem(graphicsStoreKey(matchId), JSON.stringify(next)); } catch { /* yoksay */ }
  }
  return next;
}
