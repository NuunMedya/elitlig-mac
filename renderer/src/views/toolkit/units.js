// Birim ve para çevirici — saf. Hızlı hesap satırı "5 km mi", "100 usd try", "72 f c",
// "3 saat dk" gibi ifadeleri çözer; döviz kurları ana süreçten (EUR tabanlı, önbellekli) gelir.
import { evaluate } from "../../lib/calcUtils";

/** Kategoriler: birim → { ad, katsayı (temel birime), takma adlar }. Sıcaklık özel. */
export const CATEGORIES = [
  { key: "length", label: "Uzunluk", base: "m", units: {
    mm: { label: "Milimetre", f: 0.001, alias: ["milimetre"] },
    cm: { label: "Santimetre", f: 0.01, alias: ["santim", "santimetre"] },
    m: { label: "Metre", f: 1, alias: ["metre"] },
    km: { label: "Kilometre", f: 1000, alias: ["kilometre"] },
    in: { label: "İnç", f: 0.0254, alias: ["inç", "inch", "inc", "\""] },
    ft: { label: "Fit", f: 0.3048, alias: ["feet", "foot", "fit"] },
    yd: { label: "Yarda", f: 0.9144, alias: ["yarda", "yard"] },
    mi: { label: "Mil", f: 1609.344, alias: ["mil", "mile", "miles"] },
    nmi: { label: "Deniz mili", f: 1852, alias: ["denizmili"] },
  } },
  { key: "mass", label: "Ağırlık", base: "kg", units: {
    mg: { label: "Miligram", f: 1e-6, alias: ["miligram"] },
    g: { label: "Gram", f: 0.001, alias: ["gr", "gram"] },
    kg: { label: "Kilogram", f: 1, alias: ["kilo", "kilogram"] },
    t: { label: "Ton", f: 1000, alias: ["ton"] },
    oz: { label: "Ons", f: 0.028349523125, alias: ["ons", "ounce"] },
    lb: { label: "Libre (pound)", f: 0.45359237, alias: ["lbs", "pound", "libre"] },
  } },
  { key: "temp", label: "Sıcaklık", base: "c", units: {
    c: { label: "Santigrat (°C)", alias: ["°c", "santigrat", "celsius", "derece"] },
    f: { label: "Fahrenheit (°F)", alias: ["°f", "fahrenheit"] },
    k: { label: "Kelvin (K)", alias: ["kelvin"] },
  } },
  { key: "area", label: "Alan", base: "m2", units: {
    cm2: { label: "Santimetrekare", f: 1e-4, alias: ["cm²"] },
    m2: { label: "Metrekare", f: 1, alias: ["m²", "metrekare"] },
    donum: { label: "Dönüm", f: 1000, alias: ["dönüm", "dekar", "da"] },
    ha: { label: "Hektar", f: 10000, alias: ["hektar"] },
    km2: { label: "Kilometrekare", f: 1e6, alias: ["km²"] },
    ft2: { label: "Fitkare", f: 0.09290304, alias: ["ft²", "sqft"] },
    acre: { label: "Akre", f: 4046.8564224, alias: ["akre", "ac"] },
  } },
  { key: "volume", label: "Hacim", base: "l", units: {
    ml: { label: "Mililitre", f: 0.001, alias: ["mililitre"] },
    l: { label: "Litre", f: 1, alias: ["lt", "litre", "liter"] },
    m3: { label: "Metreküp", f: 1000, alias: ["m³", "metreküp"] },
    gal: { label: "Galon (ABD)", f: 3.785411784, alias: ["galon", "gallon"] },
    floz: { label: "Sıvı ons (ABD)", f: 0.0295735295625, alias: ["fl oz"] },
    cup: { label: "Su bardağı (200 ml)", f: 0.2, alias: ["bardak", "subardağı"] },
  } },
  { key: "speed", label: "Hız", base: "ms", units: {
    ms: { label: "Metre / saniye", f: 1, alias: ["m/s"] },
    kmh: { label: "Kilometre / saat", f: 1 / 3.6, alias: ["km/h", "km/sa", "kmsa"] },
    mph: { label: "Mil / saat", f: 0.44704, alias: ["mil/sa"] },
    kn: { label: "Knot", f: 1852 / 3600, alias: ["knot", "kt", "deniz mili/sa"] },
  } },
  { key: "time", label: "Süre", base: "s", units: {
    ms_: { label: "Milisaniye", f: 0.001, alias: ["milisaniye", "msn"] },
    s: { label: "Saniye", f: 1, alias: ["sn", "saniye", "sec"] },
    min: { label: "Dakika", f: 60, alias: ["dk", "dakika"] },
    h: { label: "Saat", f: 3600, alias: ["sa", "saat", "hour"] },
    d: { label: "Gün", f: 86400, alias: ["gün", "gun", "day"] },
    wk: { label: "Hafta", f: 604800, alias: ["hafta", "week"] },
    mo: { label: "Ay (30 gün)", f: 2592000, alias: ["ay", "month"] },
    yr: { label: "Yıl (365 gün)", f: 31536000, alias: ["yıl", "yil", "year"] },
  } },
  { key: "data", label: "Veri", base: "b", units: {
    b: { label: "Bayt", f: 1, alias: ["bayt", "byte"] },
    kb: { label: "Kilobayt (KB)", f: 1024, alias: ["kib"] },
    mb: { label: "Megabayt (MB)", f: 1024 ** 2, alias: ["mib"] },
    gb: { label: "Gigabayt (GB)", f: 1024 ** 3, alias: ["gib"] },
    tb: { label: "Terabayt (TB)", f: 1024 ** 4, alias: ["tib"] },
  } },
];

/** Para birimleri (ekranda gösterilenler; kur tablosundaki her ISO kodu da çalışır). */
export const CURRENCIES = [
  { code: "TRY", label: "Türk lirası", alias: ["tl", "₺", "lira"] },
  { code: "USD", label: "ABD doları", alias: ["$", "dolar", "dollar"] },
  { code: "EUR", label: "Euro", alias: ["€", "avro", "euro"] },
  { code: "GBP", label: "İngiliz sterlini", alias: ["£", "sterlin", "pound sterling"] },
  { code: "CHF", label: "İsviçre frangı", alias: ["frank"] },
  { code: "JPY", label: "Japon yeni", alias: ["¥", "yen"] },
  { code: "SAR", label: "Suudi riyali", alias: ["riyal"] },
  { code: "AZN", label: "Azerbaycan manatı", alias: ["manat"] },
  { code: "RUB", label: "Rus rublesi", alias: ["ruble"] },
  { code: "CNY", label: "Çin yuanı", alias: ["yuan"] },
];

const norm = (s) => String(s || "").trim().toLocaleLowerCase("tr-TR").replace(/\s+/g, " ");
const UNIT_INDEX = (() => {
  const map = new Map();
  for (const cat of CATEGORIES) {
    for (const [code, u] of Object.entries(cat.units)) {
      const display = code.replace(/_$/, "");
      for (const name of [display, ...(u.alias || [])]) if (!map.has(norm(name))) map.set(norm(name), { cat: cat.key, code });
    }
  }
  return map;
})();
const CURRENCY_INDEX = (() => {
  const map = new Map();
  for (const c of CURRENCIES) for (const name of [c.code, ...c.alias]) map.set(norm(name), c.code);
  return map;
})();

/** Ad → { kind: "unit", cat, code } | { kind: "currency", code } | null (rates verilirse her ISO kodu). */
export function findUnit(name, rates = null) {
  const k = norm(name);
  if (!k) return null;
  if (CURRENCY_INDEX.has(k)) return { kind: "currency", code: CURRENCY_INDEX.get(k) };
  const u = UNIT_INDEX.get(k);
  if (u) return { kind: "unit", ...u };
  const up = k.toUpperCase();
  if (rates && /^[A-Z]{3}$/.test(up) && rates[up]) return { kind: "currency", code: up };
  return null;
}

function toKelvin(v, from) { return from === "c" ? v + 273.15 : from === "f" ? ((v - 32) * 5) / 9 + 273.15 : v; }
function fromKelvin(k, to) { return to === "c" ? k - 273.15 : to === "f" ? ((k - 273.15) * 9) / 5 + 32 : k; }

/** Birim çevir (aynı kategoride). → sayı | null */
export function convertUnit(value, catKey, from, to) {
  const v = Number(value);
  const cat = CATEGORIES.find((c) => c.key === catKey);
  if (!cat || !Number.isFinite(v) || !cat.units[from] || !cat.units[to]) return null;
  if (cat.key === "temp") return fromKelvin(toKelvin(v, from), to);
  return (v * cat.units[from].f) / cat.units[to].f;
}

/** Para çevir. rates: { KOD: 1 EUR (taban) karşılığı }. → sayı | null */
export function convertCurrency(value, from, to, rates) {
  const v = Number(value);
  if (!rates || !Number.isFinite(v) || !rates[from] || !rates[to]) return null;
  return (v / rates[from]) * rates[to];
}

/** Okunur biçim (Türkçe; çok küçük / büyük sayılar bilimsel değil, anlamlı basamakla). */
export function formatNumber(n, maxDigits = 6) {
  if (n == null || !Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  const digits = abs >= 1000 ? 2 : abs >= 1 ? 4 : maxDigits;
  return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: digits }).format(n);
}

/** "1.250,5" / "1250.5" / "1,5" → sayı (Türkçe ondalık virgül). */
export function parseNumber(s) {
  let t = String(s || "").trim().replace(/\s/g, "");
  if (!t) return null;
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) t = t.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d+,\d+$/.test(t)) t = t.replace(",", ".");
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/**
 * Hızlı satır: "5 km mi" · "5km to mi" · "100 usd try" · "100 $ tl" · "72 f c" · "3 saat dk" ·
 * "2*(3+4)" (yalnız hesap). → { kind: "calc", value } | { kind: "convert", value, from, to, result, label } | null
 */
export function parseQuery(input, rates = null) {
  const raw = String(input || "").trim();
  if (!raw) return null;
  const m = raw.match(/^([\d\s().,+\-*/%×÷−]*\d[\d\s().,+\-*/%×÷−]*?)\s*([^\s\d][^\s]*)\s+(?:(?:to|in|=|->|→|>|kaç)\s+)?([^\s\d][^\s]*)$/i);
  if (m) {
    const amount = parseNumber(m[1]) ?? evaluate(m[1]);
    const a = findUnit(m[2], rates);
    const b = findUnit(m[3], rates);
    if (amount != null && a && b) {
      if (a.kind === "currency" && b.kind === "currency") {
        const result = convertCurrency(amount, a.code, b.code, rates);
        if (result == null) return { kind: "error", message: "Döviz kuru yok (bağlantı gerekir)." };
        return { kind: "convert", value: amount, from: a.code, to: b.code, result, label: `${formatNumber(amount)} ${a.code} = ${formatNumber(result)} ${b.code}` };
      }
      if (a.kind === "unit" && b.kind === "unit" && a.cat === b.cat) {
        const result = convertUnit(amount, a.cat, a.code, b.code);
        const nm = (u) => u.code.replace(/_$/, "");
        return { kind: "convert", value: amount, from: nm(a), to: nm(b), result, label: `${formatNumber(amount)} ${nm(a)} = ${formatNumber(result)} ${nm(b)}` };
      }
      if (a.kind === "unit" && b.kind === "unit") return { kind: "error", message: "Birimler aynı türden değil." };
    }
  }
  const value = evaluate(raw);
  return value == null ? null : { kind: "calc", value, label: formatNumber(value, 10) };
}
