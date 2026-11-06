// YouTube bölümleri — GOL'e BASILAN anlar (saf). Gol bölümü olayın kaydedildiği
// an değil, GOL düğmesine basıldığı an (reji GOL'ü, G+H/A kısayolu, şerit gol
// parçacıkları, olay girişinde gol türü) üzerinden kurulur: basış burada
// saklanır, olay kaydedilince aynı taraftaki en eski basış alınır.
//   tap(side)   basışı kaydet → zaman (ms)
//   take(side)  olay kaydedildi: aynı taraf → tarafsız → en eski basış; yoksa null
//   drop(side)  vazgeçildi: o taraftaki en yeni basışı sil
// Basışlar ttlMs (3 dk) sonra düşer (golcü seçimi iptal edildiyse).

export const GOAL_TAP_TTL_MS = 180_000;

export function createGoalTaps({ ttlMs = GOAL_TAP_TTL_MS, now = () => Date.now() } = {}) {
  let list = [];
  const prune = () => { const t = now(); list = list.filter((x) => t - x.at <= ttlMs); };
  return {
    tap(side = null) {
      prune();
      const at = now();
      list.push({ at, side: side || null });
      return at;
    },
    take(side = null) {
      prune();
      let i = side ? list.findIndex((x) => x.side === side) : -1;
      if (i < 0) i = list.findIndex((x) => !x.side);
      if (i < 0) i = list.length ? 0 : -1;
      if (i < 0) return null;
      return list.splice(i, 1)[0].at;
    },
    drop(side = null) {
      for (let i = list.length - 1; i >= 0; i -= 1) if ((list[i].side || null) === (side || null)) { list.splice(i, 1); return true; }
      return false;
    },
    size() { prune(); return list.length; },
    clear() { list = []; },
  };
}
