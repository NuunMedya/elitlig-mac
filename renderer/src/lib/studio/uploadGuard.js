// Yayın Stüdyosu — [gol-klip] YAYIN ÖNCELİKLİ YÜKLEME (saf; sınanır).
//
// Gol klibi canlı yayınla AYNI yükleme hattından gider. Kural: canlı yayının kalitesi
// her zaman önce gelir.
//   1. Yükleme zamanı gelince (varsayılan 60 sn) önce yayın sağlığına bakılır
//      (streamHealth): aktarıcı kuyruğu (sn), gönderim hızı ↔ kodlayıcı hızı, kopan /
//      atılan paketler, kare kaybı, yeniden bağlanma. Risk varsa yükleme ERTELENİR
//      (deferDecision: geri çekilmeyle 10 sn → 20 → 40 … en çok 2 dk) ve listede
//      "Yayın öncelikli: yükleme bekliyor" görünür.
//   2. Yükleme sürerken her saniye hız yeniden ayarlanır (nextUploadKbps — AIMD):
//      risk → DURAKLAT (bağlantı canlı tutulur), uyarı → hız yarıya, sağlıklı → %15
//      artar; tavan = ölçülen boş kapasitenin %25'i, taban 256 kbit/sn. Ana süreç PUT'u
//      bu hıza göre kısar (studio.uploadThrottle → app/studio/uploadgov.js).
//   3. Yayın yoksa (kayıt / prova / kapalı) sınır yoktur.
export const UPLOAD_MIN_KBPS = 256;
export const UPLOAD_SHARE = 0.25;
export const UPLOAD_MAX_KBPS = 8000;
/** Kapasite bilinmiyorsa varsayılan: kodlayıcı hızının 1,5 katı hat (yani %50 boş). */
export const DEFAULT_HEADROOM = 1.5;
export const DEFER_BASE_MS = 10_000;
export const DEFER_MAX_MS = 120_000;
/** Bu kadar ertelendikten sonra yine de (en düşük hızla, riskte duraklayarak) yüklenir. */
export const DEFER_GIVE_UP_MS = 10 * 60_000;
/** Başlamak için yayının kesintisiz sağlıklı kalması gereken süre. */
export const CALM_MS = 4000;

export const HEALTH_TEXT = Object.freeze({
  reconnecting: "yayın yeniden bağlanıyor",
  dropping: "yayın paket atıyor",
  buffer: "yayın kuyruğu doluyor",
  growing: "yayın kuyruğu büyüyor",
  behind: "gönderim kodlayıcıya yetişmiyor",
  frames: "kare kaybı var",
  network: "ağ uyarısı",
});

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const LIVE_STATES = new Set(["live", "reconnecting", "connecting"]);

/** Canlı yayın (RTMP) sürüyor mu: kayıt / prova değil. */
export const isLiveStatus = (status) => Boolean(status && LIVE_STATES.has(status.state) && status.recordOnly !== true);

/**
 * Yayın sağlığı. status: motor durumu (useEngine.status: state, recordOnly, bitrateKbps,
 * droppedFrames, warning, network: relay.status()); net: studio.network() (daha taze
 * aktarıcı durumu, isteğe bağlı); prev: önceki örnek (büyüme / artış için).
 * → { live, level: "ok" | "warn" | "risk", reasons: [anahtar], bufferSec, inKbps, sentKbps,
 *     targetKbps, dropEvents, droppedFrames, at }
 */
export function streamHealth(status, net = null, prev = null, at = Date.now()) {
  const live = isLiveStatus(status);
  const n = net || status?.network || null;
  const inKbps = num(n?.inKbps, 0) || num(status?.bitrateKbps, 0);
  const sentKbps = num(n?.sentKbps ?? status?.sentKbps, 0);
  const targetKbps = num(status?.bitrateKbps, 0) || inKbps;
  const pending = num(n?.pendingBytes, 0);
  const bufferSec = inKbps > 0 ? Math.round((pending * 8 / 1000 / inKbps) * 100) / 100 : 0;
  const dropEvents = num(n?.dropEvents, 0);
  const droppedFrames = num(status?.droppedFrames, 0);
  const out = { live, level: "ok", reasons: [], bufferSec, inKbps, sentKbps, targetKbps, dropEvents, droppedFrames, at };
  if (!live) return out;
  const risk = [];
  const warn = [];
  if (status.state === "reconnecting" || status.state === "connecting" || (n?.state && n.state !== "up")) risk.push("reconnecting");
  if (n?.dropping || (prev && dropEvents > num(prev.dropEvents, 0))) risk.push("dropping");
  if (bufferSec >= 2) risk.push("buffer");
  else if (bufferSec >= 0.8) warn.push("buffer");
  if (prev && prev.live && bufferSec > num(prev.bufferSec, 0) + 0.3 && bufferSec >= 0.4) warn.push("growing");
  if (inKbps > 300 && sentKbps > 0 && sentKbps < inKbps * 0.8) warn.push("behind");
  if (prev && droppedFrames - num(prev.droppedFrames, 0) > 5) warn.push("frames");
  if (status.warning === "network") risk.push("network");
  out.reasons = [...risk, ...warn.filter((w) => !risk.includes(w))];
  out.level = risk.length ? "risk" : warn.length ? "warn" : "ok";
  return out;
}

/** Sağlık metni: "Yayın öncelikli: yayın kuyruğu doluyor". */
export function healthText(h) {
  if (!h?.live || h.level === "ok") return "";
  return `Yayın öncelikli: ${h.reasons.map((r) => HEALTH_TEXT[r] || r).join(", ")}`;
}

/** Erteleme bekleme süresi (deneme 0 → 10 sn, 1 → 20 sn … en çok 2 dk). */
export const backoffMs = (attempt) => Math.min(DEFER_MAX_MS, DEFER_BASE_MS * 2 ** Math.max(0, Math.floor(num(attempt, 0))));

/**
 * Zamanı gelen yükleme başlasın mı?
 *   history: son sağlık örnekleri (eskiden yeniye) · deferredSince: ilk erteleme anı · attempt: kaçıncı erteleme
 * → { go: true, kbps } | { go: false, retryAt, reason, attempt }
 */
export function deferDecision(history, { now = Date.now(), deferredSince = null, attempt = 0, calmMs = CALM_MS } = {}) {
  const h = (history || []).filter(Boolean);
  const last = h[h.length - 1] || null;
  if (!last || !last.live) return { go: true, kbps: 0 };
  const recent = h.filter((x) => now - num(x.at, now) <= calmMs);
  const calm = recent.length > 0 && recent.every((x) => x.level !== "risk") && last.level === "ok";
  const gaveUp = deferredSince != null && now - deferredSince >= DEFER_GIVE_UP_MS;
  if (calm || (gaveUp && last.level !== "risk")) return { go: true, kbps: startKbps(last) };
  if (gaveUp) return { go: true, kbps: UPLOAD_MIN_KBPS, paused: true };
  const why = last.level === "ok" ? "yayın yeni toparlandı" : last.reasons.map((r) => HEALTH_TEXT[r] || r).join(", ");
  return { go: false, retryAt: now + backoffMs(attempt), reason: why, attempt: attempt + 1 };
}

/** Kapasite tahmini (kbit/sn): görülen en yüksek toplam (yayın + yükleme) ya da varsayılan pay. */
export function capacityKbps(health, seenKbps = 0) {
  const base = Math.max(num(health?.inKbps, 0), num(health?.targetKbps, 0));
  return Math.max(num(seenKbps, 0), base * DEFAULT_HEADROOM);
}

/** Yüklemenin tavanı: boş kapasitenin %25'i (taban 256 kbit/sn). */
export function uploadCapKbps(health, seenKbps = 0) {
  if (!health?.live) return 0; // sınırsız
  const spare = Math.max(0, capacityKbps(health, seenKbps) - Math.max(num(health.inKbps, 0), num(health.sentKbps, 0)));
  return Math.round(Math.min(UPLOAD_MAX_KBPS, Math.max(UPLOAD_MIN_KBPS, spare * UPLOAD_SHARE)));
}

/** İlk hız: tavanın yarısı (yavaş başla). */
export const startKbps = (health, seenKbps = 0) => (health?.live ? Math.max(UPLOAD_MIN_KBPS, Math.round(uploadCapKbps(health, seenKbps) / 2)) : 0);

/**
 * Yükleme sürerken sonraki hız (AIMD). → { kbps, paused }
 *   risk → duraklat (hız korunur, devam edince yarısından başlar) · uyarı → yarıya ·
 *   sağlıklı → %15 artış (tavana kadar). Yayın yoksa sınırsız (0).
 */
export function nextUploadKbps(prevKbps, health, seenKbps = 0) {
  if (!health?.live) return { kbps: 0, paused: false };
  const cap = uploadCapKbps(health, seenKbps);
  const prev = num(prevKbps, 0) > 0 ? num(prevKbps, 0) : startKbps(health, seenKbps);
  if (health.level === "risk") return { kbps: Math.max(UPLOAD_MIN_KBPS, Math.round(prev / 2)), paused: true };
  if (health.level === "warn") return { kbps: Math.max(UPLOAD_MIN_KBPS, Math.round(prev / 2)), paused: false };
  return { kbps: Math.min(cap, Math.max(UPLOAD_MIN_KBPS, Math.round(prev * 1.15))), paused: false };
}

/** Sağlık geçmişi: son N örnek (varsayılan 30 sn). */
export function pushHealth(history, h, { keepMs = 30_000 } = {}) {
  const l = [...(history || []), h].filter(Boolean);
  const at = num(h?.at, Date.now());
  return l.filter((x) => at - num(x.at, at) <= keepMs).slice(-60);
}
