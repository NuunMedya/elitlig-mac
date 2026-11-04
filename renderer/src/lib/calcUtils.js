// Hesap Araçları: saf hesaplar (testlerde doğrudan sınanır).

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
export const num = (value) => {
  if (typeof value === "number") return value;
  const raw = String(value ?? "").trim().replace(/\s/g, "");
  if (!raw) return 0;
  const thousands = /^[1-9]\d{0,2}(\.\d{3})+(,\d+)?$/.test(raw);
  const normalized = raw.includes(",") || thousands ? raw.replace(/\./g, "").replace(",", ".") : raw;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
};

/** KDV: mode "include" → tutar KDV dahil, "exclude" → tutar KDV hariç. */
export function vat(amount, rate, mode = "exclude") {
  const a = num(amount);
  const k = num(rate) / 100;
  if (mode === "include") {
    const net = a / (1 + k);
    return { net: r2(net), vat: r2(a - net), gross: r2(a) };
  }
  return { net: r2(a), vat: r2(a * k), gross: r2(a * (1 + k)) };
}

export const percentOf = (percent, base) => r2((num(percent) / 100) * num(base));
export const ratioPercent = (part, whole) => (num(whole) ? r2((num(part) / num(whole)) * 100) : 0);
export const percentChange = (from, to) => (num(from) ? r2(((num(to) - num(from)) / Math.abs(num(from))) * 100) : 0);

/** Art arda iskontolar (ör. %10 + %5) ya da zam (negatif değil, mode "markup"). */
export function discountChain(price, rates = [], mode = "discount") {
  let value = num(price);
  for (const rate of rates) {
    const k = num(rate) / 100;
    value = mode === "markup" ? value * (1 + k) : value * (1 - k);
  }
  const total = num(price);
  return { final: r2(value), difference: r2(value - total), effectiveRate: total ? r2(((total - value) / total) * 100) : 0 };
}

/**
 * Masraf bölüştürme: toplam tutar, kişi sayısı, isteğe bağlı yukarı yuvarlama
 * adımı (ör. 5 TL). Fazla toplanan tutar "surplus" olarak döner.
 */
export function splitCost(total, people, roundStep = 0) {
  const t = num(total);
  const p = Math.max(0, Math.floor(num(people)));
  if (!p) return { perPerson: 0, collected: 0, surplus: 0 };
  const exact = t / p;
  const step = num(roundStep);
  const perPerson = step > 0 ? Math.ceil(exact / step - 1e-9) * step : r2(exact);
  const collected = r2(perPerson * p);
  return { perPerson: r2(perPerson), collected, surplus: r2(collected - t), exact: r2(exact) };
}

/** Eşit taksit (anüite). Aylık faiz yüzde olarak; 0 ise faizsiz. */
export function installment(principal, months, monthlyRate = 0) {
  const P = num(principal);
  const n = Math.max(0, Math.floor(num(months)));
  const i = num(monthlyRate) / 100;
  if (!n) return { monthly: 0, total: 0, interest: 0 };
  const monthly = i ? (P * i) / (1 - (1 + i) ** -n) : P / n;
  return { monthly: r2(monthly), total: r2(monthly * n), interest: r2(monthly * n - P) };
}

const dayMs = 86400000;
const parseDay = (iso) => (iso ? new Date(`${iso}T12:00:00`) : null);

/** İki tarih arası gün, hafta ve iş günü (hafta sonu hariç). */
export function dateDiff(fromIso, toIso) {
  const a = parseDay(fromIso);
  const b = parseDay(toIso);
  if (!a || !b || Number.isNaN(a) || Number.isNaN(b)) return null;
  const sign = b >= a ? 1 : -1;
  const [start, end] = sign > 0 ? [a, b] : [b, a];
  const days = Math.round((end - start) / dayMs);
  let workdays = 0;
  for (let d = new Date(start); d < end; d = new Date(d.getTime() + dayMs)) {
    const wd = d.getDay();
    if (wd !== 0 && wd !== 6) workdays += 1;
  }
  return { days: sign * days, weeks: r2((sign * days) / 7), workdays: sign * workdays };
}

export function addDaysIso(iso, days) {
  const d = parseDay(iso);
  if (!d) return "";
  const out = new Date(d.getTime() + Math.round(num(days)) * dayMs);
  return `${out.getFullYear()}-${String(out.getMonth() + 1).padStart(2, "0")}-${String(out.getDate()).padStart(2, "0")}`;
}

/* ------------------------- güvenli hesap makinesi ------------------------- */

/**
 * + − × ÷ % ve parantez içeren ifadeyi eval kullanmadan hesaplar.
 * "%" bir önceki sayıyı yüzdeye çevirir (50% → 0.5). Hatalıysa null.
 */
export function evaluate(expression) {
  const src = String(expression).replace(/×/g, "*").replace(/÷/g, "/").replace(/−/g, "-").replace(/,/g, ".").replace(/\s/g, "");
  if (!src) return null;
  let pos = 0;
  const peek = () => src[pos];
  const eat = (ch) => { if (src[pos] === ch) { pos += 1; return true; } return false; };

  function number() {
    const start = pos;
    while (/[0-9.]/.test(src[pos] || "")) pos += 1;
    if (start === pos) throw new Error("sayı bekleniyordu");
    const value = Number(src.slice(start, pos));
    if (!Number.isFinite(value)) throw new Error("geçersiz sayı");
    return value;
  }
  function factor() {
    if (eat("-")) return -factor();
    if (eat("+")) return factor();
    let value;
    if (eat("(")) {
      value = expr();
      if (!eat(")")) throw new Error("parantez kapanmadı");
    } else {
      value = number();
    }
    while (eat("%")) value /= 100;
    return value;
  }
  function term() {
    let value = factor();
    for (;;) {
      if (eat("*")) value *= factor();
      else if (eat("/")) {
        const d = factor();
        if (d === 0) throw new Error("sıfıra bölme");
        value /= d;
      } else return value;
    }
  }
  function expr() {
    let value = term();
    for (;;) {
      if (eat("+")) value += term();
      else if (eat("-")) value -= term();
      else return value;
    }
  }
  try {
    const value = expr();
    if (pos !== src.length || peek() !== undefined) return null;
    return Math.round(value * 1e10) / 1e10;
  } catch {
    return null;
  }
}
