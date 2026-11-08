// Yayın Stüdyosu — şerit başına SES FİLTRELERİ ve SES GECİKMESİ (OBS "Filtreler" + "Senkron kayması").
//
//   giriş ─▶ gecikme (0–2000 ms) ─▶ gürültü kapısı ─▶ EQ (bas / orta / tiz) ─▶ sıkıştırıcı ─▶ kazanç (trim) ─▶ fader …
//
//   delayMs   ses / görüntü eşleme: kamera görüntüsü sesten geç geliyorsa sesi geciktir
//   gate      gürültü kapısı: eşik altı (fan, uğultu, uzak tribün) kesilir; açılış / kapanış süresi, bekleme
//   eq        3 bant: bas 120 Hz (raf), orta 1,2 kHz (tepe), tiz 6 kHz (raf); ±15 dB
//   comp      sıkıştırıcı: eşik, oran, atak, bırakma, telafi kazancı
// Kayıt: prefs.audio.strips[id].filters — yalnız varsayılandan farklı alanlar.

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
const r1 = (v) => Math.round(v * 10) / 10;

export const MAX_AUDIO_DELAY_MS = 2000;
export const GATE_DEFAULT = Object.freeze({ on: false, threshold: -45, attackMs: 5, holdMs: 150, releaseMs: 200 });
export const EQ_DEFAULT = Object.freeze({ on: false, low: 0, mid: 0, high: 0 });
export const COMP_DEFAULT = Object.freeze({ on: false, threshold: -20, ratio: 4, attackMs: 6, releaseMs: 150, makeup: 0 });
export const EQ_BANDS = Object.freeze([
  { key: "low", label: "Bas", type: "lowshelf", freq: 120, q: 0.7 },
  { key: "mid", label: "Orta", type: "peaking", freq: 1200, q: 0.9 },
  { key: "high", label: "Tiz", type: "highshelf", freq: 6000, q: 0.7 },
]);

/** Hazır ayarlar (tek tık). */
export const FILTER_PRESETS = [
  { key: "voice", label: "Spiker sesi", filters: { gate: { on: true, threshold: -48 }, eq: { on: true, low: -3, mid: 2, high: 3 }, comp: { on: true, threshold: -22, ratio: 3, makeup: 3 } } },
  { key: "crowd", label: "Saha / tribün", filters: { eq: { on: true, low: -6, mid: 0, high: 1 }, comp: { on: true, threshold: -16, ratio: 2.5, makeup: 1 } } },
  { key: "phone", label: "Telefon mikrofonu", filters: { gate: { on: true, threshold: -42 }, eq: { on: true, low: -8, mid: 3, high: 2 }, comp: { on: true, threshold: -24, ratio: 4, makeup: 4 } } },
  { key: "music", label: "Müzik (hafif)", filters: { comp: { on: true, threshold: -14, ratio: 2, makeup: 0 } } },
];

function normGate(g) {
  const x = { ...GATE_DEFAULT, ...(g || {}) };
  return { on: Boolean(x.on), threshold: r1(clamp(num(x.threshold, -45), -80, 0)), attackMs: Math.round(clamp(num(x.attackMs, 5), 1, 200)), holdMs: Math.round(clamp(num(x.holdMs, 150), 0, 2000)), releaseMs: Math.round(clamp(num(x.releaseMs, 200), 10, 3000)) };
}
function normEq(e) {
  const x = { ...EQ_DEFAULT, ...(e || {}) };
  return { on: Boolean(x.on), low: r1(clamp(num(x.low, 0), -15, 15)), mid: r1(clamp(num(x.mid, 0), -15, 15)), high: r1(clamp(num(x.high, 0), -15, 15)) };
}
function normComp(c) {
  const x = { ...COMP_DEFAULT, ...(c || {}) };
  return { on: Boolean(x.on), threshold: r1(clamp(num(x.threshold, -20), -60, 0)), ratio: r1(clamp(num(x.ratio, 4), 1, 20)), attackMs: Math.round(clamp(num(x.attackMs, 6), 0, 1000)), releaseMs: Math.round(clamp(num(x.releaseMs, 150), 10, 1000)), makeup: r1(clamp(num(x.makeup, 0), 0, 24)) };
}

const same = (a, b) => Object.keys(b).every((k) => a[k] === b[k]);

/** Tam biçim (her alan dolu). */
export function resolveFilters(f) {
  const x = f && typeof f === "object" ? f : {};
  return { delayMs: Math.round(clamp(num(x.delayMs, 0), 0, MAX_AUDIO_DELAY_MS)), gate: normGate(x.gate), eq: normEq(x.eq), comp: normComp(x.comp) };
}

/** Kayıt biçimi: yalnız varsayılandan farklı bölümler; hepsi varsayılansa null. */
export function compactFilters(f) {
  const r = resolveFilters(f);
  const out = {};
  if (r.delayMs) out.delayMs = r.delayMs;
  if (!same(r.gate, GATE_DEFAULT)) out.gate = r.gate;
  if (!same(r.eq, EQ_DEFAULT)) out.eq = r.eq;
  if (!same(r.comp, COMP_DEFAULT)) out.comp = r.comp;
  return Object.keys(out).length ? out : null;
}

/** Etkin filtre özeti ("Kapı · EQ · Sık. · 120 ms"); yoksa "". */
export function filtersSummary(f) {
  const r = resolveFilters(f);
  const parts = [];
  if (r.gate.on) parts.push("Kapı");
  if (r.eq.on) parts.push("EQ");
  if (r.comp.on) parts.push("Sık.");
  if (r.delayMs) parts.push(`${r.delayMs} ms`);
  return parts.join(" · ");
}

export const filtersActive = (f) => Boolean(filtersSummary(f));

/** Hazır ayarı uygula (geri kalan alanlar korunur, gecikme dokunulmaz). */
export function applyPreset(f, key) {
  const p = FILTER_PRESETS.find((x) => x.key === key);
  const cur = resolveFilters(f);
  if (!p) return compactFilters(cur);
  return compactFilters({
    delayMs: cur.delayMs,
    gate: { ...GATE_DEFAULT, ...(p.filters.gate || { on: false }) },
    eq: { ...EQ_DEFAULT, ...(p.filters.eq || { on: false }) },
    comp: { ...COMP_DEFAULT, ...(p.filters.comp || { on: false }) },
  });
}

/* ------------------------------ gürültü kapısı ------------------------------ */

/** Kapalıyken açılma eşiği eşiktir; açıkken kapanma eşiği 6 dB altı (çırpınma olmasın). */
export const GATE_HYSTERESIS_DB = 6;

/**
 * Kapı durumu bir adım ilerler. state: { open, holdLeft }. levelDb: tepe düzey (dBFS).
 * → { open, holdLeft, target (0|1), timeConstant (sn) }
 */
export function gateStep(state, levelDb, gate, dtMs) {
  const g = normGate(gate);
  const st = state || { open: false, holdLeft: 0 };
  if (!g.on) return { open: true, holdLeft: 0, target: 1, timeConstant: 0.01 };
  const lvl = Number.isFinite(levelDb) ? levelDb : -Infinity;
  if (lvl >= g.threshold) return { open: true, holdLeft: g.holdMs, target: 1, timeConstant: g.attackMs / 1000 / 3 };
  if (st.open && lvl >= g.threshold - GATE_HYSTERESIS_DB) return { open: true, holdLeft: g.holdMs, target: 1, timeConstant: g.attackMs / 1000 / 3 };
  if (st.open && st.holdLeft > 0) return { open: true, holdLeft: Math.max(0, st.holdLeft - dtMs), target: 1, timeConstant: g.attackMs / 1000 / 3 };
  return { open: false, holdLeft: 0, target: 0, timeConstant: g.releaseMs / 1000 / 3 };
}

/** Zaman alanı örneklerinin tepe düzeyi (dBFS). */
export function peakDb(buf) {
  let peak = 0;
  for (let i = 0; i < buf.length; i += 1) { const a = Math.abs(buf[i]); if (a > peak) peak = a; }
  return peak > 0 ? 20 * Math.log10(peak) : -Infinity;
}
