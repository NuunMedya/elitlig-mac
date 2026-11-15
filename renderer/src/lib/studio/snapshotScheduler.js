// Yayın Stüdyosu · DURAĞAN KÜÇÜK RESİM ZAMANLAYICISI (kaynak kartları, kısayol sahne kutuları).
//
// Küçük resim VİDEO DEĞİLDİR: kaynağın / sahnenin tek bir karesi, 30 sn'de bir yeniden alınır.
//   - döngü yok: rAF / setInterval kurulmaz; tek bir setTimeout yalnız en yakın işe uyanır
//   - kademeli: aynı anda vadesi gelenler arasına `staggerMs` konur (hepsi aynı anda çizilmez);
//     her kaydın ilk vadesi de sırayla kaydırılır
//   - görünmeyen (ekran dışı / gizli sekme) kayıt çizilmez; görünür olunca eskimişse hemen yenilenir
//   - refresh(): kaynak / sahne değişince sıradaki kademede yeniden çizer
//   - paint() false dönerse (kare yok) en çok 3 erken deneme (3 / 8 / 15 sn), sonra 30 sn
//
//   const s = createSnapshotScheduler();
//   const h = s.add(() => drawOnce(canvas));   // ilk kare kısa süre içinde
//   h.setVisible(false) · h.refresh() · h.remove()
export const SNAPSHOT_INTERVAL_MS = 30_000;
export const SNAPSHOT_STAGGER_MS = 150;
/** Kare yokken (kaynak açılıyor) sınırlı erken denemeler; sonra olağan 30 sn. */
const RETRY_MS = [3_000, 8_000, 15_000];

const defaultHidden = () => typeof document !== "undefined" && document.visibilityState === "hidden";

export function createSnapshotScheduler({
  intervalMs = SNAPSHOT_INTERVAL_MS,
  staggerMs = SNAPSHOT_STAGGER_MS,
  now = () => Date.now(),
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (t) => clearTimeout(t),
  isHidden = defaultHidden,
} = {}) {
  const interval = Math.max(SNAPSHOT_INTERVAL_MS, Number(intervalMs) || 0);
  const entries = new Set();
  let timer = null;
  let wakeAt = 0;
  let lastSlot = 0; // son ayrılan kademe zamanı (ilk çizimler sırayla)
  let stats = { paints: 0 };

  const slot = () => {
    const t = Math.max(now(), lastSlot + staggerMs);
    lastSlot = t;
    return t;
  };

  function arm() {
    if (isHidden()) { if (timer) { clearTimer(timer); timer = null; } return; }
    let next = Infinity;
    for (const e of entries) if (e.visible && e.due < next) next = e.due;
    if (next === Infinity) { if (timer) { clearTimer(timer); timer = null; } return; }
    if (timer && wakeAt <= next) return;
    if (timer) clearTimer(timer);
    wakeAt = next;
    timer = setTimer(tick, Math.max(0, next - now()));
  }

  function tick() {
    timer = null;
    if (isHidden()) return;
    const t = now();
    // Vadesi gelenlerden YALNIZ BİRİ çizilir; kalanlar bir kademe sonraya kayar.
    let pick = null;
    for (const e of entries) if (e.visible && e.due <= t && (!pick || e.due < pick.due)) pick = e;
    if (pick) {
      pick.due = t + interval;
      stats.paints += 1;
      let ok = true;
      try { ok = pick.paint() !== false; } catch { ok = false; }
      if (ok) { pick.paintedAt = t; pick.misses = 0; } else if (pick.misses < RETRY_MS.length) {
        // Henüz kare yok (kamera açılıyor): birkaç kez daha erken dene, sonra olağan aralık.
        pick.due = t + RETRY_MS[pick.misses];
        pick.misses += 1;
      }
      let k = 1;
      for (const e of entries) if (e !== pick && e.visible && e.due <= t) { e.due = t + staggerMs * k; k += 1; }
    }
    arm();
  }

  function add(paint) {
    const e = { paint, visible: true, due: slot(), paintedAt: 0, misses: 0 };
    entries.add(e);
    arm();
    return {
      setVisible(v) {
        const was = e.visible;
        e.visible = Boolean(v);
        // Görünür oldu ve son kare eskidi → kısa süre içinde yenile.
        if (e.visible && !was && now() - e.paintedAt >= interval) e.due = Math.min(e.due, slot());
        arm();
      },
      refresh() { e.misses = 0; e.due = Math.min(e.due, slot()); arm(); },
      remove() { entries.delete(e); arm(); },
    };
  }

  /** Sekme görünür olunca: eskimişler kademeli yenilenir. */
  function wake() {
    const t = now();
    for (const e of entries) if (e.visible && t - e.paintedAt >= interval) e.due = Math.min(e.due, slot());
    arm();
  }

  return {
    add,
    wake,
    get size() { return entries.size; },
    get intervalMs() { return interval; },
    stats: () => ({ ...stats, entries: entries.size, armed: Boolean(timer) }),
    dispose() { if (timer) clearTimer(timer); timer = null; entries.clear(); },
  };
}

let shared = null;
/** Uygulama geneli tek zamanlayıcı (kaynak kartları + kısayol sahne kutuları birlikte kademelenir). */
export function sharedSnapshotScheduler() {
  if (shared) return shared;
  shared = createSnapshotScheduler();
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") shared.wake(); });
  return shared;
}
