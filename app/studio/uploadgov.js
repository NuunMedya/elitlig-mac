// Yayın Stüdyosu — [gol-klip] YÜKLEME HIZ YÖNETİCİSİ (ana süreç).
//
// Gol klibi PUT'u canlı yayınla aynı yükleme hattını kullanır. Arayüz (useReplays ›
// lib/studio/uploadGuard) yayın sağlığına göre her saniye hız sınırı / duraklatma gönderir:
//   studio:uploadThrottle { kbps, paused } · { reset: true } · { cancel: true } · null (yalnız durum)
// Bütün klip PUT'ları TEK bir bayt kovasını paylaşır (aynı anda iki yükleme sınırı aşmasın).
// Duraklatılmışken bağlantı kopmasın diye birkaç saniyede bir küçük dilim gönderilir (PUT
// boşta kalma zaman aşımı 60 sn). Arayüzden 15 sn haber gelmezse (pencere kapandı / dondu)
// varsayılana dönülür: yayın sürüyorsa sabit güvenli hız (defaultBytesPerSec()), yoksa sınırsız.
// İptal: sürmekte olan akışlar hata ile kesilir; kısa süre (30 sn) yeni deneme de kesilir.
const { Transform } = require("node:stream");

const SLICE = 16 * 1024;
const KEEPALIVE_BYTES = 512;
const KEEPALIVE_MS = 8000;
const POLL_MS = 250;
const STALE_MS = 15_000;
const MAX_PAUSE_MS = 5 * 60_000;
const CANCEL_HOLD_MS = 30_000;

function createUploadGovernor({ now = () => Date.now(), sleep = (ms) => new Promise((r) => setTimeout(r, ms)), staleMs = STALE_MS, maxPauseMs = MAX_PAUSE_MS } = {}) {
  let ctl = { bytesPerSec: 0, paused: false, at: 0, pausedAt: null, explicit: false };
  let cancelUntil = 0;
  let active = 0;
  let nextAt = 0; // ortak kova: sıradaki dilimin gönderilebileceği an
  const meter = []; // [{ at, bytes }] son 5 sn

  /** Arayüzden: { kbps | bytesPerSec, paused } · { reset } · { cancel }. → state() */
  function set(opts) {
    if (!opts || typeof opts !== "object") return state();
    const t = now();
    if (opts.cancel) { cancelUntil = t + CANCEL_HOLD_MS; return state(); }
    if (opts.reset) { ctl = { bytesPerSec: 0, paused: false, at: 0, pausedAt: null, explicit: false }; cancelUntil = 0; return state(); }
    const bps = opts.bytesPerSec != null ? Number(opts.bytesPerSec) : Number(opts.kbps) * 125; // kbit/sn → bayt/sn
    const paused = Boolean(opts.paused);
    ctl = { bytesPerSec: Number.isFinite(bps) && bps > 0 ? Math.round(bps) : 0, paused, at: t, pausedAt: paused ? (ctl.paused && ctl.pausedAt ? ctl.pausedAt : t) : null, explicit: true };
    return state();
  }

  /** O anki geçerli sınır: { bytesPerSec (0: sınırsız), paused }. */
  function effective(defaultBps = 0) {
    const t = now();
    if (!ctl.explicit || t - ctl.at > staleMs) return { bytesPerSec: Math.max(0, Number(defaultBps) || 0), paused: false };
    if (ctl.paused && ctl.pausedAt != null && t - ctl.pausedAt > maxPauseMs) return { bytesPerSec: ctl.bytesPerSec || Math.max(0, Number(defaultBps) || 0), paused: false };
    return { bytesPerSec: ctl.bytesPerSec, paused: ctl.paused };
  }

  function measure(bytes) {
    const t = now();
    meter.push({ at: t, bytes });
    while (meter.length && t - meter[0].at > 5000) meter.shift();
  }
  function measuredKbps() {
    const t = now();
    const recent = meter.filter((m) => t - m.at <= 5000);
    if (!recent.length) return 0;
    const span = Math.max(1000, t - recent[0].at);
    return Math.round((recent.reduce((s, m) => s + m.bytes, 0) * 8) / span);
  }

  function state() {
    const e = effective(0);
    return { kbps: Math.round(ctl.bytesPerSec / 125), paused: e.paused, explicit: ctl.explicit, active, cancelled: now() < cancelUntil, measuredKbps: measuredKbps() };
  }

  /**
   * PUT gövdesine takılan akış (highlights.putFile throttleStream). defaultBps(): arayüz
   * sessizken kullanılacak sınır (yayın sürüyorsa güvenli hız, yoksa 0).
   */
  function stream(defaultBps = () => 0) {
    if (now() < cancelUntil) {
      const t = new Transform({ transform(_c, _e, cb) { cb(new Error("Yükleme iptal edildi.")); } });
      return t;
    }
    active += 1;
    let lastPush = now();
    let done = false;
    const release = () => { if (!done) { done = true; active = Math.max(0, active - 1); } };
    const tr = new Transform({
      transform(chunk, _enc, cb) {
        (async () => {
          let i = 0;
          while (i < chunk.length) {
            if (now() < cancelUntil) throw new Error("Yükleme iptal edildi.");
            const e = effective(defaultBps());
            if (e.paused) {
              if (now() - lastPush >= KEEPALIVE_MS) {
                const part = chunk.subarray(i, i + KEEPALIVE_BYTES);
                i += part.length; lastPush = now(); measure(part.length);
                this.push(part);
              } else await sleep(POLL_MS);
              continue;
            }
            const part = chunk.subarray(i, i + SLICE);
            if (e.bytesPerSec > 0) {
              const t = now();
              if (nextAt < t - 500) nextAt = t; // boşta biriken kredi en çok 0,5 sn
              const wait = nextAt - t;
              if (wait > 0) await sleep(Math.min(wait, 1000));
              if (nextAt - now() > 0) continue; // sınır değişmiş olabilir: yeniden değerlendir
              nextAt += (part.length / e.bytesPerSec) * 1000;
            }
            i += part.length; lastPush = now(); measure(part.length);
            this.push(part);
          }
        })().then(() => cb(), (err) => { release(); cb(err); });
      },
      flush(cb) { release(); cb(); },
    });
    tr.on("close", release);
    tr.on("error", release);
    return tr;
  }

  return { set, effective, state, stream };
}

module.exports = { createUploadGovernor, SLICE, KEEPALIVE_MS };
