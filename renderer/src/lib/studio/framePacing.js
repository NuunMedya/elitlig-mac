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
//  3) İşçi zamanlayıcısı: Windows'ta 32 ms ve üstü bekleme düşük çözünürlüklü zamanlayıcıya
//     (≈15,6 ms adım) düşebilir → 31 / 47 ms'lik düzensiz tikler. 2.25.0'daki 4 ms'lik dilimler
//     (kare başına ~8 uyanma, saniyede ~250) gereksiz yük getiriyordu; 2.25.2: bekleme 30 ms'den
//     kısaysa TEK zamanlayıcı (yüksek çözünürlüklü), uzunsa önce kaba bir uyku (son tarihten
//     ≥ 16 ms önce biter, düşük çözünürlükte de geç kalmaz), sonra tek kısa bekleme: kare başına
//     1–2 uyanma.
//  4) Kamera kareleri: Chromium bir kamera izinden aynı anda AÇIK tutulabilecek VideoFrame
//     sayısını sınırlar (ölçüm: 2 kare açık tutulunca kamera DURUR — kare gelmez). Titreşim
//     tamponu bu yüzden VideoFrame değil kopya (ImageBitmap) tutar; VideoFrame hemen kapatılır
//     (lib: çizim işçisi). 2.25.0–2.25.1'de kuyruk 2–3 VideoFrame tutuyordu: kaynaklar 30 yerine
//     ~12 fps geliyordu (asıl takılma).
//  5) Ekranlar (önizleme / Program aynası) en çok 30 fps; ana iş parçacığı zorlanırsa
//     createMonitorGovernor kademeli düşürür (30 → 20 → 15 → 10), rahatlayınca geri çıkar.
//     Yayın çıkışı (işçi + kodlayıcı) bundan etkilenmez.

/** Tek zamanlayıcıyla beklenebilecek en uzun süre (ms; Windows yüksek çözünürlük sınırı 32 ms'nin altı). */
export const PRECISE_SLEEP_MS = 30;
/** Kaba uykunun son tarihe bıraktığı pay (ms; düşük çözünürlüklü zamanlayıcının bir adımı). */
export const COARSE_MARGIN_MS = 16;
/**
 * Bir sonraki uyanmaya kadar beklenecek süre (ms). remaining ≤ 30 ms → tamamı (tek zamanlayıcı);
 * daha uzunsa remaining − 16 ms (kaba uyku; ardından bir kısa bekleme daha). Kare başına 1–2 uyanma.
 */
export const nextSleepMs = (remainingMs) => {
  const r = Number(remainingMs) || 0;
  if (r <= 0) return 0;
  return r <= PRECISE_SLEEP_MS ? r : r - COARSE_MARGIN_MS;
};
/** Eski ad (2.25.0–2.25.1 dilimli uyku); artık nextSleepMs. */
export const sleepSlice = nextSleepMs;

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

/** Ekranlarda (önizleme, Program aynası) en yüksek gösterim hızı (fps). */
export const MONITOR_MAX_FPS = 30;
/** Ekranlarda gösterim hızı: proje hızı, en çok 30 fps (60 fps projede 30: yük yarıya iner). */
export const monitorFps = (fps, cap = MONITOR_MAX_FPS) => Math.max(1, Math.min(cap, Math.round(Number(fps) || 30)));

/** Kademeler (en yüksekten): proje hızı (≤ 30) → 20 → 15 → 10. */
export function monitorSteps(fps) {
  const top = monitorFps(fps);
  return [top, 20, 15, 10].filter((v, i, a) => v <= top && a.indexOf(v) === i);
}

/**
 * Ekran hızı yöneticisi (önizleme + Program aynası): saniyede bir ana iş parçacığı yükü
 * verilir, ekran fps'i kademeli düşer / çıkar. Yayın çıkışı etkilenmez.
 *   sample({ busyPct, blockingMs, longMaxMs, workerLate, workerFps }) → { fps, changed, reason }
 * Aşırı yük: busyPct ≥ 80 ya da blockingMs ≥ 150 (saniyede uzun görev engeli) ya da tek uzun
 * görev ≥ 200 ms ya da yayın çizimi geride (işçi fps hedefin %90'ının altında). 2 ardışık aşırı
 * saniye → bir kademe aşağı (en az 3 sn arayla). 15 ardışık rahat saniye (busyPct < 55,
 * blockingMs < 50, işçi yetişiyor) → bir kademe yukarı.
 */
export function createMonitorGovernor(fps, { downAfter = 2, upAfter = 15, cooldown = 3 } = {}) {
  let steps = monitorSteps(fps);
  let target = Number(fps) || 30;
  let level = 0;
  let hot = 0;
  let calm = 0;
  let sinceChange = cooldown;
  let reason = "";
  let downs = 0;
  const state = () => ({ fps: steps[level], level, max: steps[0], reason, limited: level > 0, downs });
  return {
    sample({ busyPct = null, blockingMs = 0, longMaxMs = 0, workerLate = 0, workerFps = null } = {}) {
      sinceChange += 1;
      const why = [];
      if (Number(busyPct) >= 80) why.push(`ana iş parçacığı %${Math.round(busyPct)}`);
      if (Number(blockingMs) >= 150) why.push(`uzun görev ${Math.round(blockingMs)} ms/sn`);
      if (Number(longMaxMs) >= 200) why.push(`tek görev ${Math.round(longMaxMs)} ms`);
      // Geç tik (late) tek başına ölçüt DEĞİL: Windows'un düşük çözünürlüklü zamanlayıcısında tikler
      // 15,6 ms adımlarla gecikebilir ama kare atlanmaz (seçim / damga ideal ızgarayla). Ölçüt kare hızı.
      const wBehind = Number.isFinite(workerFps) && workerFps > 0 && workerFps < target * 0.9;
      if (wBehind) why.push(`yayın çizimi geride (${workerFps} / ${Math.round(target)} fps${workerLate ? `, ${workerLate} geç tik` : ""})`);
      const relaxed = !wBehind && (busyPct == null || Number(busyPct) < 55) && Number(blockingMs) < 50;
      let changed = false;
      if (why.length) { hot += 1; calm = 0; } else { hot = 0; calm = relaxed ? calm + 1 : 0; }
      if (hot >= downAfter && level < steps.length - 1 && sinceChange >= cooldown) {
        level += 1; hot = 0; sinceChange = 0; changed = true; downs += 1; reason = why.join(", ");
      } else if (calm >= upAfter && level > 0) {
        level -= 1; calm = 0; sinceChange = 0; changed = true; reason = level > 0 ? reason : "";
      }
      return { ...state(), changed };
    },
    setFps(f) { target = Number(f) || 30; steps = monitorSteps(f); level = Math.min(level, steps.length - 1); },
    fps: () => steps[level],
    state,
  };
}

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
