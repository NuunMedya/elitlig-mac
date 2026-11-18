// 2.36.0 · Arayüz tarafı performans tercihleri (localStorage "studio.perf.v1"; Ayarlar › Performans).
//   baseVideoWorker  kip (tekrar / VAR / röportaj / özet) videoları çizim işçisinde birleşir (varsayılan açık)
//   parkHidden       gizli dock sekmeleri dondurulur / kapatılır (varsayılan açık)
export const PERF_PREFS_KEY = "studio.perf.v1";
const DEFAULTS = { baseVideoWorker: true, parkHidden: true };

export function readPerfPrefs(storage = (() => { try { return localStorage; } catch { return null; } })()) {
  try {
    const raw = JSON.parse(storage?.getItem(PERF_PREFS_KEY) || "{}") || {};
    return { baseVideoWorker: raw.baseVideoWorker !== false, parkHidden: raw.parkHidden !== false };
  } catch { return { ...DEFAULTS }; }
}

export function writePerfPrefs(patch, storage = (() => { try { return localStorage; } catch { return null; } })()) {
  const next = { ...readPerfPrefs(storage), ...(patch || {}) };
  try { storage?.setItem(PERF_PREFS_KEY, JSON.stringify(next)); } catch { /* yoksay */ }
  return next;
}
