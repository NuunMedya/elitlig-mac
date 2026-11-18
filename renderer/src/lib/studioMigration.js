// Elitlig Araçlar → Elitlig Stüdyo: stüdyo ayarlarının taşınması (2.36.0).
//
// Stüdyo ayarlarının çoğu arayüzün localStorage'ındadır (Chromium leveldb: başka uygulama
// okuyamaz). Elitlig Araçlar her açılışta stüdyo anahtarlarını ana sürece verir (ortak klasöre
// JSON); Elitlig Stüdyo ilk açılışta, React kurulmadan önce bunları kendi localStorage'ına yazar.
// Anahtarlar: studio.* ve elitlig.studio.* (sahneler studio.v3, yerleşim studio.layout.v1, kısayol
// panosu studio.rail.v1, klavye kısayolları ve ayarlar studio.settings.v1, makrolar, ön ayarlar,
// LED, ses, grafik paketleri, YouTube şablonları …).

export const isStudioKey = (k) => typeof k === "string" && /^(elitlig\.)?studio[.:]/.test(k);
/** Stüdyonun "kurulmuş" sayıldığı anahtar (sahneler): varsa otomatik içe aktarma yapılmaz. */
export const SCENES_KEY = "studio.v3";

/** storage içindeki stüdyo anahtarları → { anahtar: değer }. */
export function collectStudioEntries(storage) {
  const out = {};
  if (!storage) return out;
  try {
    for (let i = 0; i < storage.length; i += 1) {
      const k = storage.key(i);
      if (!isStudioKey(k)) continue;
      const v = storage.getItem(k);
      if (typeof v === "string") out[k] = v;
    }
  } catch { /* yoksay */ }
  return out;
}

/** Girdileri yazar (force değilse yalnız yoksa). Yazılan anahtar sayısı. */
export function applyStudioEntries(storage, entries, { force = false } = {}) {
  let n = 0;
  if (!storage || !entries || typeof entries !== "object") return 0;
  for (const [k, v] of Object.entries(entries)) {
    if (!isStudioKey(k) || typeof v !== "string") continue;
    try {
      if (!force && storage.getItem(k) != null) continue;
      storage.setItem(k, v);
      n += 1;
    } catch { /* kota */ }
  }
  return n;
}

/**
 * Elitlig Stüdyo açılışı: içe aktarılacak bir dışa aktarım varsa ve (force ya da) stüdyo henüz
 * kurulmamışsa (sahne anahtarı yok) yazar. bridge: window.elitlig.studioApp.
 * → { imported: n, skipped?: true } | null (dışa aktarım yok).
 */
export async function importFromAraclar(bridge, storage, { force = false } = {}) {
  if (!bridge?.importState) return null;
  let st = null;
  try { st = await bridge.importState({ force }); } catch { st = null; }
  if (!st || !st.entries) return null;
  const configured = (() => { try { return storage?.getItem(SCENES_KEY) != null; } catch { return false; } })();
  if (configured && !force) {
    try { await bridge.importDone({ keys: 0, skipped: true, from: st.version || null }); } catch { /* yoksay */ }
    return { imported: 0, skipped: true };
  }
  const n = applyStudioEntries(storage, st.entries, { force: true });
  try { await bridge.importDone({ keys: n, from: st.version || null }); } catch { /* yoksay */ }
  return { imported: n, copied: st.copied || [], at: st.at || null };
}
