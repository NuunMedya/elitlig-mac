// Parola üretici — saf; rastgelelik crypto.getRandomValues'tan (sınamada enjekte edilir).
// Sapmasız seçim (reddederek örnekleme), her seçili kümeden en az bir karakter.

export const SETS = {
  lower: "abcdefghijklmnopqrstuvwxyz",
  upper: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  digits: "0123456789",
  symbols: "!@#$%^&*()-_=+[]{};:,.?/~",
};
const AMBIGUOUS = /[Il1O0o|`'";:,.]/g;

/** 0 ≤ n < max tam sayı (sapmasız). bytes: (n) => Uint32Array */
export function randomInt(max, bytes = defaultBytes) {
  if (!(max > 0) || max > 2 ** 32) throw new Error("Geçersiz aralık.");
  const limit = Math.floor(2 ** 32 / max) * max;
  for (;;) {
    const [x] = bytes(1);
    if (x < limit) return x % max;
  }
}
function defaultBytes(n) { const a = new Uint32Array(n); globalThis.crypto.getRandomValues(a); return a; }

export const DEFAULT_OPTS = Object.freeze({ length: 20, lower: true, upper: true, digits: true, symbols: true, avoidAmbiguous: true });

/** opts: { length 4…128, lower, upper, digits, symbols, avoidAmbiguous } → parola */
export function generatePassword(opts = {}, bytes = defaultBytes) {
  const o = { ...DEFAULT_OPTS, ...opts };
  const length = Math.min(128, Math.max(4, Math.round(Number(o.length) || 20)));
  const pools = Object.keys(SETS).filter((k) => o[k]).map((k) => (o.avoidAmbiguous ? SETS[k].replace(AMBIGUOUS, "") : SETS[k]));
  if (!pools.length) pools.push(SETS.lower);
  const all = pools.join("");
  const chars = pools.map((p) => p[randomInt(p.length, bytes)]);
  while (chars.length < length) chars.push(all[randomInt(all.length, bytes)]);
  // Fisher–Yates: zorunlu karakterler başta kalmasın.
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1, bytes);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.slice(0, length).join("");
}

/** Tahmini güç: entropi (bit) ve etiket. */
export function strength(pw) {
  const s = String(pw || "");
  let pool = 0;
  if (/[a-z]/.test(s)) pool += 26;
  if (/[A-Z]/.test(s)) pool += 26;
  if (/\d/.test(s)) pool += 10;
  if (/[^a-zA-Z0-9]/.test(s)) pool += 25;
  const bits = s.length && pool ? Math.round(s.length * Math.log2(pool)) : 0;
  const level = bits >= 100 ? 4 : bits >= 75 ? 3 : bits >= 55 ? 2 : bits >= 35 ? 1 : 0;
  return { bits, level, label: ["Çok zayıf", "Zayıf", "Orta", "Güçlü", "Çok güçlü"][level] };
}
