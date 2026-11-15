// Yayın Stüdyosu · KARE ZAMANLAMASI (saf; çizim işçisi, ana motor, önizleme ve Program aynası).
//
// Akıcılık sorunlarının üç kaynağı ve çözümü:
//
//  1) Kaynak karesi seçimi (titreşim tamponu): kamera kareleri DÜZENLİ zaman damgasıyla
//     (çekim anı) ama DÜZENSİZ varış zamanıyla gelir (USB / yakalama kartı / sürücü kuyruğu
//     ±birkaç ms). "Tik anında en son gelen kare" seçimi, çıkış ızgarası kaynak ızgarasıyla
//     aynı evrede olduğunda (30 → 30 fps) rastgele ÇİFT kare + ATLANAN kare üretir: görüntü
//     takılır. Burada her kare zaman damgasıyla yerel saate eşlenir (en küçük gecikme +
//     küçük bir pay; SABİT, çıkış ızgarasının ortasına hizalı) ve tik, İDEAL ızgara zamanına
//     göre "zamanı gelmiş en yeni kareyi" seçer: her tik tam bir kare ilerler, varış
//     titreşimi görüntüye yansımaz.
//  2) rAF tabanlı döngülerde kare hızı: "son çizimden beri ≥ aralık − 2 ms" kuralı ekran
//     yenileme hızı kare aralığını tam bölmüyorsa (75 / 144 Hz, 25 fps) hızı DÜŞÜRÜR
//     (ör. 144 Hz'de 60 fps → 48 fps, 75 Hz'de 30 fps → 25 fps). Biriken son tarih
//     (deadline) kullanılır: ortalama hız tam hedefte kalır.
//  3) İşçi zamanlayıcısı: tek uzun setTimeout (33 ms) Windows'ta düşük çözünürlüklü
//     zamanlayıcıya (≈15,6 ms adım) düşebilir → 31 / 47 ms'lik düzensiz tikler. Uyku kısa
//     dilimlerle yapılır (en çok SLEEP_SLICE_MS): tik ±1 ms'de kalır.

/** İşçi uykusunun en uzun dilimi (ms). */
export const SLEEP_SLICE_MS = 4;
/** Bir sonraki uyanmaya kadar beklenecek süre (ms): kısa dilimler (düşük çözünürlüklü zamanlayıcıdan kaçınır). */
export const sleepSlice = (remainingMs) => Math.max(0, Math.min(SLEEP_SLICE_MS, remainingMs));

/**
 * Zaman damgası → yerel saat eşlemesi (kaynak başına). observe(tsMs, arrivalMs) her karede;
 * dueAt(tsMs): karenin gösterilebileceği yerel an = damga + SABİT sunum gecikmesi (D).
 * D, ilk kareler gözlenince (en küçük gecikme + titreşim payı) kilitlenir ve SABİT kalır:
 * değişen bir gecikme, sınırda kalan kareleri tikten tike öne / arkaya kaydırıp çift / atlanan
 * kare üretir. align(tick, aralık, ts) ile D bir kez çıkış ızgarasının ORTASINA hizalanır
 * (kare zamanı tik sınırına denk gelmez). Kareler art arda geç gelirse D bir adım büyür.
 * Zaman damgası geri giderse / büyük sıçrarsa (döngü, yeniden bağlanma) eşleme sıfırlanır.
 */
export function createTimestampSync({ warmup = 15, maxPeriods = 2.5, raiseMs = 4 } = {}) {
  let off = null; // en küçük (varış − damga)
  let jitter = 0; // ortalama ek gecikme (ms)
  let maxExcess = 0; // ısınmada görülen en büyük ek gecikme
  let lastTs = null;
  let period = 0; // kaynak kare aralığı (ms, ortalama)
  let resets = 0;
  let seen = 0;
  let D = null; // kilitli sunum gecikmesi (ms)
  let aligned = false;
  let late = 0;
  let raises = 0;
  let offAtLock = null;
  let relocks = 0;
  const reset = () => { off = null; jitter = 0; maxExcess = 0; period = 0; seen = 0; D = null; aligned = false; late = 0; resets += 1; };
  const cap = () => off + Math.max(8, (period || 33) * maxPeriods);
  const api = {
    observe(tsMs, arrivalMs) {
      const d = arrivalMs - tsMs;
      if (lastTs !== null) {
        const dt = tsMs - lastTs;
        if (!(dt > 0) || dt > 1000) reset();
        else period = period ? period * 0.9 + dt * 0.1 : dt;
      }
      lastTs = tsMs;
      if (off === null || d < off) off = d;
      jitter = jitter * 0.9 + (d - off) * 0.1;
      seen += 1;
      // Kilitten sonra en küçük gecikme belirgin düştüyse (açılıştaki kuyruk boşaldı): gecikme
      // gereksiz büyük kalmasın, yeniden ısınılır (tek seferlik geçiş).
      if (D !== null && offAtLock !== null && off < offAtLock - 5) { D = null; aligned = false; seen = 1; maxExcess = 0; late = 0; relocks += 1; }
      if (D === null) {
        if (d - off > maxExcess) maxExcess = d - off;
        // Isınma bitti: en küçük gecikme + görülen en büyük titreşim + 2 ms (en çok ~2,5 kare).
        if (seen >= warmup) { D = Math.min(cap(), off + maxExcess + 2); offAtLock = off; }
      } else if (d > D) {
        // Zamanı geçtikten sonra gelen kare: üç kez olursa gecikme biraz büyür (üst sınırlı).
        late += 1;
        if (late >= 3) { D = Math.min(cap() + (aligned ? period : 0), D + raiseMs); late = 0; raises += 1; }
      } else if (late > 0 && seen % 30 === 0) late -= 1;
      return api;
    },
    /** D'yi bir kez çıkış ızgarasının ortasına hizala (tick: ideal tik anı, ts: gösterilen karenin damgası). */
    align(tickMs, intervalMs, tsMs) {
      if (D === null || aligned || !(intervalMs > 0)) return;
      const r = (((tsMs + D - tickMs) % intervalMs) + intervalMs) % intervalMs;
      D += (intervalMs / 2 - r + intervalMs) % intervalMs;
      aligned = true;
    },
    dueAt(tsMs) { return D === null ? -Infinity : tsMs + D; },
    ready: () => D !== null,
    stats: () => ({ jitterMs: Math.round(jitter * 10) / 10, periodMs: Math.round(period * 10) / 10, delayMs: D === null || off === null ? null : Math.round((D - off) * 10) / 10, aligned, raises, relocks, resets }),
  };
  return api;
}

/**
 * Kuyruktan (damgaya göre artan; [0] = şu an gösterilen) tikte gösterilecek karenin sırası:
 * zamanı gelmiş (dueAt ≤ tickMs) EN YENİ kare; hiçbiri gelmemişse 0 (gösterilen kalır).
 * queue: [{ ts }] · sync: createTimestampSync().
 */
export function pickDue(queue, tickMs, sync) {
  let idx = 0;
  for (let i = 1; i < queue.length; i += 1) {
    if (sync.dueAt(queue[i].ts) <= tickMs) idx = i;
    else break;
  }
  return idx;
}

/**
 * rAF döngüsü için kare kapısı: due(now) true ise çiz. Son tarih birikir (now'a eşitlenmez):
 * ekran yenileme hızı aralığı bölmese de ortalama hız hedefte kalır. Yarım ekran karesi
 * (en çok 4 ms) erken çizime izin verilir; çok geride kalınca (takılma) ızgara yeniden kurulur.
 */
export function createFrameGate(fps, { slackMs = 4 } = {}) {
  let interval = 1000 / Math.max(1, fps);
  let next = null;
  return {
    due(now) {
      if (next === null) { next = now + interval; return true; }
      const slack = Math.min(slackMs, interval * 0.25);
      if (now < next - slack) return false;
      next += interval;
      if (next < now - interval) next = now + interval; // takılma: biriken kare çizilmez
      return true;
    },
    /** Döngü dışında (yedek zamanlayıcıyla) çizildi: sıradaki son tarih buradan. */
    mark(now) { next = now + interval; },
    setFps(f) { interval = 1000 / Math.max(1, f); next = null; },
    reset() { next = null; },
    interval: () => interval,
  };
}

/** Ekranlarda (önizleme, Program aynası) gösterim hızı: proje hızı, en çok 60 fps. */
export const monitorFps = (fps) => Math.max(1, Math.min(60, Math.round(Number(fps) || 30)));

/**
 * Kare dizisi akıcılık ölçüsü (test / tanılama): ardışık kare sıra numaraları → çift (aynı kare
 * tekrar) ve atlama (bir kare kayıp) sayısı. Beklenen artış step (ör. 30 → 30 fps: 1).
 */
export function cadenceStats(indices, step = 1) {
  let dup = 0;
  let skip = 0;
  for (let i = 1; i < indices.length; i += 1) {
    const d = indices[i] - indices[i - 1];
    if (d < step) dup += 1;
    else if (d > step) skip += d - step;
  }
  return { frames: indices.length, dup, skip };
}

/** Aralık dizisi özeti (ms): ortalama, standart sapma, en küçük / en büyük. */
export function intervalStats(times) {
  const d = [];
  for (let i = 1; i < times.length; i += 1) d.push(times[i] - times[i - 1]);
  if (!d.length) return { n: 0, mean: 0, sd: 0, min: 0, max: 0 };
  const mean = d.reduce((a, b) => a + b, 0) / d.length;
  const sd = Math.sqrt(d.reduce((a, b) => a + (b - mean) ** 2, 0) / d.length);
  const r = (v) => Math.round(v * 100) / 100;
  return { n: d.length, mean: r(mean), sd: r(sd), min: r(Math.min(...d)), max: r(Math.max(...d)) };
}
