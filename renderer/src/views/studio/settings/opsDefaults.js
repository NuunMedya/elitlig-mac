// Yayın Stüdyosu — İŞLETİM AYARLARI (saf; studio.settings.v1 › ops). Ayarlar › İşletim
// sayfaları (LED, Röportaj, Özet, Reji / Maç, Makrolar) bunu düzenler; çok işlevli
// düğmeler varsayılanlarını, sürelerini ve davranışlarını buradan okur (ctx.ops).
//
//   led    yeni içerik varsayılanı, parlaklık, kayan yazı (metin, hız), ayna kare hızı,
//          sponsor süresi, geri sayım (dakika, başlık), tekrar yayındayken LED'e ayna
//   iv     bant başlığı ve şablonu, kayıtla bant, hedef süre, an işareti saniyesi,
//          röportaj mikrofonu (kanal) ve öbür mikrofonları kapat, silmeden önce sor
//   hl     giriş / kapanış kartı (uzun · kısa · yok), önemli anları kat, müzik seviyesi /
//          kısma, yüklemeden önce sor, oluşunca önizlemeye al
//   mac    devre süresi ve sayısı, uzatma üst sınırı, bitirmeden önce sor, puan adımı,
//          topla oynama altyazıya, sayaç türleri, kısa ad uzunluğu
//   macro  çalıştırmadan önce sor, adımlar arası bekleme
export const CARD_LENGTHS = [
  { key: "long", label: "Uzun", introMs: 5000, outroMs: 4200 },
  { key: "short", label: "Kısa", introMs: 2500, outroMs: 2200 },
  { key: "none", label: "Yok", introMs: 0, outroMs: 0 },
];
export const cardLengthOf = (key) => CARD_LENGTHS.find((c) => c.key === key) || CARD_LENGTHS[0];
export const HALF_PRESETS = [20, 25, 30, 35, 40, 45];
export const STAT_COUNTERS = [
  { key: "shots", label: "Şut" },
  { key: "onTarget", label: "İsabetli şut" },
  { key: "corners", label: "Korner" },
  { key: "offsides", label: "Ofsayt" },
  { key: "fouls", label: "Faul" },
  { key: "saves", label: "Kurtarış" },
  { key: "freeKicks", label: "Serbest vuruş" },
  { key: "throwIns", label: "Taç" },
];
export const STAT_KEYS = STAT_COUNTERS.map((s) => s.key);

export const DEFAULT_OPS = Object.freeze({
  led: { content: "scene", brightness: 100, tickerText: "Elit Lig canlı yayında · elitlig.com", tickerSpeed: 120, mirrorFps: 10, sponsorSec: 8, countdownMin: 5, countdownLabel: "MAÇ BAŞLIYOR", mirrorOnReplay: false },
  iv: { title: "RÖPORTAJ", style: "classic", bandWithRecord: true, targetMin: 3, markSeconds: 15, micStrip: "mic", muteOthers: false, confirmDelete: true, recentLimit: 8 },
  hl: { intro: "long", outro: "long", includeMoments: true, musicDb: -12, duckDb: -14, confirmUpload: true, previewWhenDone: false },
  mac: { halfMin: 25, periods: 2, injuryMax: 10, confirmFinish: true, ratingStep: 0.5, possessionToSubtitle: true, statKeys: ["shots", "onTarget", "corners", "offsides", "fouls", "saves"], codeLen: 3 },
  macro: { confirmRun: false, stepDelayMs: 300 },
});

const clamp = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const bool = (v, d) => (typeof v === "boolean" ? v : d);
const pick = (v, list, d) => (list.includes(v) ? v : d);
const str = (v, n, d) => (typeof v === "string" && v.trim() ? v.slice(0, n) : d);

export function normalizeOps(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const d = DEFAULT_OPS;
  const L = r.led || {}, I = r.iv || {}, Hl = r.hl || {}, M = r.mac || {}, Mc = r.macro || {};
  const cards = CARD_LENGTHS.map((c) => c.key);
  return {
    led: {
      content: str(L.content, 20, d.led.content),
      brightness: Math.round(clamp(L.brightness, 10, 100, d.led.brightness)),
      tickerText: str(L.tickerText, 300, d.led.tickerText),
      tickerSpeed: Math.round(clamp(L.tickerSpeed, 20, 400, d.led.tickerSpeed)),
      mirrorFps: Math.round(clamp(L.mirrorFps, 2, 15, d.led.mirrorFps)),
      sponsorSec: Math.round(clamp(L.sponsorSec, 3, 60, d.led.sponsorSec)),
      countdownMin: Math.round(clamp(L.countdownMin, 1, 180, d.led.countdownMin)),
      countdownLabel: str(L.countdownLabel, 60, d.led.countdownLabel),
      mirrorOnReplay: bool(L.mirrorOnReplay, d.led.mirrorOnReplay),
    },
    iv: {
      title: str(I.title, 60, d.iv.title),
      style: str(I.style, 20, d.iv.style),
      bandWithRecord: bool(I.bandWithRecord, d.iv.bandWithRecord),
      targetMin: Math.round(clamp(I.targetMin, 1, 30, d.iv.targetMin)),
      markSeconds: Math.round(clamp(I.markSeconds, 5, 30, d.iv.markSeconds)),
      micStrip: str(I.micStrip, 40, d.iv.micStrip),
      muteOthers: bool(I.muteOthers, d.iv.muteOthers),
      confirmDelete: bool(I.confirmDelete, d.iv.confirmDelete),
      recentLimit: Math.round(clamp(I.recentLimit, 2, 20, d.iv.recentLimit)),
    },
    hl: {
      intro: pick(Hl.intro, cards, d.hl.intro),
      outro: pick(Hl.outro, cards, d.hl.outro),
      includeMoments: bool(Hl.includeMoments, d.hl.includeMoments),
      musicDb: Math.round(clamp(Hl.musicDb, -40, 0, d.hl.musicDb)),
      duckDb: Math.round(clamp(Hl.duckDb, -40, 0, d.hl.duckDb)),
      confirmUpload: bool(Hl.confirmUpload, d.hl.confirmUpload),
      previewWhenDone: bool(Hl.previewWhenDone, d.hl.previewWhenDone),
    },
    mac: {
      halfMin: Math.round(clamp(M.halfMin, 5, 60, d.mac.halfMin)),
      periods: pick(Number(M.periods), [1, 2, 3, 4], d.mac.periods),
      injuryMax: Math.round(clamp(M.injuryMax, 3, 20, d.mac.injuryMax)),
      confirmFinish: bool(M.confirmFinish, d.mac.confirmFinish),
      ratingStep: pick(Number(M.ratingStep), [0.5, 1], d.mac.ratingStep),
      possessionToSubtitle: bool(M.possessionToSubtitle, d.mac.possessionToSubtitle),
      statKeys: Array.isArray(M.statKeys) ? [...new Set(M.statKeys.filter((k) => STAT_KEYS.includes(k)))] : [...d.mac.statKeys],
      codeLen: pick(Number(M.codeLen), [2, 3, 4, 5], d.mac.codeLen),
    },
    macro: {
      confirmRun: bool(Mc.confirmRun, d.macro.confirmRun),
      stepDelayMs: Math.round(clamp(Mc.stepDelayMs, 0, 3000, d.macro.stepDelayMs)),
    },
  };
}

/** Alt bölüm yaması: patchOps(ops, "led", { brightness: 80 }). */
export const patchOps = (ops, sub, patch) => normalizeOps({ ...ops, [sub]: { ...(ops?.[sub] || {}), ...patch } });
