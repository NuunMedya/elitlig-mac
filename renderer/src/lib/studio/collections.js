// Yayın Stüdyosu — SAHNE KOLEKSİYONLARI (OBS "Scene Collection"): adlandırılmış
// sahne + kaynak takımları. Örn. "Lig maçı", "Turnuva finali", "Röportaj stüdyosu".
//
// localStorage "studio.collections.v1":
//   { activeId, items: [{ id, name, savedAt, config }] }
//   config: sahne yapılandırmasının (studio.v3) kopyası; önizleme / program dahil.
// Geçiş: etkin koleksiyon önce güncel hâliyle kaydedilir, sonra seçilen yüklenir
// (kaynaklar yeniden açılır). Telefon eşleme kodları korunur (aynı QR çalışır).

export const COLLECTIONS_KEY = "studio.collections.v1";
const MAX = 30;

let seq = 0;
const uid = () => `col_${Date.now().toString(36)}${(seq++).toString(36)}`;
const str = (v, max = 60) => String(v ?? "").trim().slice(0, max);

export function normalizeCollections(raw) {
  const x = raw && typeof raw === "object" ? raw : {};
  const items = (Array.isArray(x.items) ? x.items : [])
    .filter((i) => i && typeof i.id === "string" && i.config && typeof i.config === "object" && Array.isArray(i.config.scenes) && Array.isArray(i.config.sources))
    .slice(0, MAX)
    .map((i) => ({ id: i.id, name: str(i.name) || "Koleksiyon", savedAt: Number(i.savedAt) || 0, config: i.config }));
  const activeId = items.some((i) => i.id === x.activeId) ? x.activeId : null;
  return { activeId, items };
}

export function loadCollections(storage) {
  try { return normalizeCollections(JSON.parse(storage?.getItem(COLLECTIONS_KEY) || "null")); } catch { return normalizeCollections(null); }
}

export function saveCollections(storage, cols) {
  try { storage?.setItem(COLLECTIONS_KEY, JSON.stringify(cols)); return true; } catch { return false; }
}

const snapshot = (config) => JSON.parse(JSON.stringify({ ...config, multiview: { show: null } }));

/** Şimdiki yapılandırmayı yeni koleksiyon olarak kaydet (etkin olur). */
export function saveAsCollection(cols, config, name, now = Date.now()) {
  const base = normalizeCollections(cols);
  const clean = str(name) || `Koleksiyon ${base.items.length + 1}`;
  const existing = base.items.find((i) => i.name.toLocaleLowerCase("tr") === clean.toLocaleLowerCase("tr"));
  if (existing) {
    const items = base.items.map((i) => (i.id === existing.id ? { ...i, config: snapshot(config), savedAt: now } : i));
    return { cols: { activeId: existing.id, items }, item: { ...existing, savedAt: now } };
  }
  const item = { id: uid(), name: clean, savedAt: now, config: snapshot(config) };
  return { cols: { activeId: item.id, items: [...base.items, item].slice(-MAX) }, item };
}

/** Etkin koleksiyonu güncel yapılandırmayla güncelle (geçişten önce). */
export function updateActive(cols, config, now = Date.now()) {
  const base = normalizeCollections(cols);
  if (!base.activeId) return base;
  return { ...base, items: base.items.map((i) => (i.id === base.activeId ? { ...i, config: snapshot(config), savedAt: now } : i)) };
}

/**
 * Koleksiyona geç: etkin olan güncel hâliyle saklanır, hedefin yapılandırması döner.
 * → { cols, config } | { cols, config: null } (bulunamadı)
 */
export function switchCollection(cols, currentConfig, targetId, now = Date.now()) {
  const saved = updateActive(cols, currentConfig, now);
  const target = saved.items.find((i) => i.id === targetId);
  if (!target) return { cols: saved, config: null };
  return { cols: { ...saved, activeId: target.id }, config: snapshot(target.config) };
}

export const renameCollection = (cols, id, name) => {
  const base = normalizeCollections(cols);
  return { ...base, items: base.items.map((i) => (i.id === id ? { ...i, name: str(name) || i.name } : i)) };
};

export function removeCollection(cols, id) {
  const base = normalizeCollections(cols);
  const items = base.items.filter((i) => i.id !== id);
  return { activeId: base.activeId === id ? null : base.activeId, items };
}

/** Dışa aktarım (JSON dosyası) ve içe aktarım. */
export const exportCollection = (item) => JSON.stringify({ type: "elitlig-scene-collection", version: 1, name: item.name, config: item.config }, null, 2);
export function importCollection(cols, text, now = Date.now()) {
  let raw;
  try { raw = JSON.parse(text); } catch { return { cols, error: "Dosya okunamadı (JSON değil)." }; }
  if (raw?.type !== "elitlig-scene-collection" || !raw.config || !Array.isArray(raw.config.scenes)) return { cols, error: "Bu dosya bir sahne koleksiyonu değil." };
  const base = normalizeCollections(cols);
  const item = { id: uid(), name: str(raw.name) || "İçe aktarılan", savedAt: now, config: raw.config };
  return { cols: { ...base, items: [...base.items, item].slice(-MAX) }, item };
}
