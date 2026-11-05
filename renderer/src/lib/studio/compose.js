// Yayın Stüdyosu — karıştırıcı yardımcıları (saf): geçiş, kare zamanlaması, ses seviyesi.

export const TRANSITIONS = [
  { key: "cut", label: "Kesme", ms: 0 },
  { key: "fade", label: "Geçiş (300 ms)", ms: 300 },
];

/** Geçişin ilerleyişi 0…1 (kesmede hemen 1). */
export function transitionProgress(transition, now) {
  if (!transition) return 1;
  const ms = Number(transition.ms) || 0;
  if (ms <= 0) return 1;
  const t = (now - transition.startedAt) / ms;
  return t >= 1 ? 1 : t <= 0 ? 0 : t;
}

/**
 * Arka planda (pencere gizli / örtülü) rAF yavaşlar; yedek zamanlayıcı ancak
 * son kareden bu yana bir buçuk kare süresi geçtiyse çizer (çift kare olmaz).
 */
export const fallbackDue = (lastDrawAt, now, fps) => now - lastDrawAt >= (1000 / Math.max(1, fps)) * 1.5;

/** Çıkış boyutunda kaynak ölçeği (önizleme düşük çözünürlükte çizilir). */
export const previewSize = (outW, outH, maxW = 960) => {
  const k = Math.min(1, maxW / outW);
  return { width: Math.round(outW * k), height: Math.round(outH * k) };
};

/** Zaman alanı örneklerinden seviye: { rms, db, pct } (−60 dB → 0, 0 dB → 100). */
export function levelFromSamples(samples) {
  if (!samples || !samples.length) return { rms: 0, db: -Infinity, pct: 0 };
  let sum = 0;
  let peak = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const v = samples[i];
    sum += v * v;
    const a = Math.abs(v);
    if (a > peak) peak = a;
  }
  const rms = Math.sqrt(sum / samples.length);
  const db = rms > 0 ? 20 * Math.log10(rms) : -Infinity;
  const pct = Number.isFinite(db) ? Math.max(0, Math.min(100, ((db + 60) / 60) * 100)) : 0;
  return { rms, db, pct, peak };
}

/** Kazanç kaydırıcısı 0…150 (%) → GainNode değeri; kapalıysa 0. */
export const gainValue = (volumePct, muted) => (muted ? 0 : Math.max(0, Math.min(1.5, (Number(volumePct) || 0) / 100)));
