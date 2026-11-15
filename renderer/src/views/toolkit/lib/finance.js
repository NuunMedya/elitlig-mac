// Finans ve vergi araçları: brüt ↔ net maaş (TR 2026), fatura / serbest meslek (KDV, stopaj,
// tevkifat), kredi / taksit (BSMV, KKDF dahil) ve ödeme planı.
//
// Parametreler bir TABLODUR (TAX_2026): kaynağı yazılı, arayüzde düzenlenebilir (kullanıcı kendi
// değerini girerse o kullanılır). Emin olunmayan değerler `estimate: true` ile "tahmini" işaretlidir.

/**
 * 2026 parametreleri.
 * Kaynaklar:
 *  - Gelir vergisi tarifesi (ücretliler): GVK md. 103, 332 Seri No.lu GV Genel Tebliği (RG 31.12.2025):
 *    190.000 / 400.000 / 1.500.000 / 5.300.000 TL; %15 / %20 / %27 / %35 / %40.
 *  - Asgari ücret: Asgari Ücret Tespit Komisyonu kararı, RG 26.12.2025 sayı 33119: brüt 33.030,00 TL
 *    (net 28.075,50 TL). Asgari ücrete isabet eden gelir ve damga vergisi istisnadır (GVK md. 23/18, DVK).
 *  - SGK: işçi payı %14 + işsizlik %1; prime esas kazanç üst sınırı asgari ücretin 9 katı = 297.270 TL.
 *  - Damga vergisi: binde 7,59.
 *  - İşveren payı (%15,75 SGK + %2 işsizlik, 5 puan teşvikli) teşvike ve sektöre göre değişir → tahmini.
 */
export const TAX_2026 = Object.freeze({
  year: 2026,
  minWageGross: 33030,
  minWageNet: 28075.5,
  sgkEmployee: 0.14,
  unemploymentEmployee: 0.01,
  sgkCeiling: 297270,
  stampRate: 0.00759,
  employerSgk: 0.1575,
  employerUnemployment: 0.02,
  brackets: [
    { upTo: 190000, rate: 0.15 },
    { upTo: 400000, rate: 0.2 },
    { upTo: 1500000, rate: 0.27 },
    { upTo: 5300000, rate: 0.35 },
    { upTo: Infinity, rate: 0.4 },
  ],
  estimates: ["employerSgk", "employerUnemployment"],
  sources: [
    "Gelir vergisi tarifesi: 332 Seri No.lu GV Genel Tebliği (RG 31.12.2025)",
    "Asgari ücret: RG 26.12.2025 / 33119 (brüt 33.030 TL, net 28.075,50 TL)",
    "SGK tavanı: asgari ücretin 9 katı (297.270 TL)",
    "İşveren payı: 5 puan teşvikli varsayım — tahmini",
  ],
});

const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/** Kümülatif matrah üzerinden artan oranlı vergi. */
export function progressiveTax(base, brackets) {
  let tax = 0;
  let prev = 0;
  for (const b of brackets) {
    if (base <= prev) break;
    const top = Math.min(base, b.upTo);
    tax += (top - prev) * b.rate;
    prev = b.upTo;
  }
  return tax;
}

/** Asgari ücretin o aydaki gelir vergisi istisnası (kümülatif asgari matrah üzerinden). */
function minWageExemption(month, p) {
  const base = p.minWageGross * (1 - p.sgkEmployee - p.unemploymentEmployee);
  const before = base * (month - 1);
  return progressiveTax(before + base, p.brackets) - progressiveTax(before, p.brackets);
}

/**
 * Brütten nete, 12 ayın her biri için (kümülatif matrah: yıl içinde dilim değişir).
 * → { months: [{ month, gross, sgk, unemployment, incomeTax, stamp, net, cumBase, employerCost }], totals }
 */
export function grossToNetYear(monthlyGross, params = TAX_2026) {
  const p = { ...TAX_2026, ...params };
  let cum = 0;
  const months = [];
  for (let m = 1; m <= 12; m += 1) {
    const gross = Number(monthlyGross) || 0;
    const sgkBase = Math.min(gross, p.sgkCeiling);
    const sgk = sgkBase * p.sgkEmployee;
    const unemployment = sgkBase * p.unemploymentEmployee;
    const taxBase = gross - sgk - unemployment;
    const rawTax = progressiveTax(cum + taxBase, p.brackets) - progressiveTax(cum, p.brackets);
    cum += taxBase;
    const incomeTax = Math.max(0, rawTax - minWageExemption(m, p));
    const stamp = Math.max(0, gross * p.stampRate - p.minWageGross * p.stampRate);
    const net = gross - sgk - unemployment - incomeTax - stamp;
    const employerCost = gross + sgkBase * (p.employerSgk + p.employerUnemployment);
    months.push({ month: m, gross: r2(gross), sgk: r2(sgk), unemployment: r2(unemployment), incomeTax: r2(incomeTax), stamp: r2(stamp), net: r2(net), cumBase: r2(cum), employerCost: r2(employerCost) });
  }
  const sum = (k) => r2(months.reduce((s, x) => s + x[k], 0));
  return { months, totals: { gross: sum("gross"), sgk: sum("sgk"), unemployment: sum("unemployment"), incomeTax: sum("incomeTax"), stamp: sum("stamp"), net: sum("net"), employerCost: sum("employerCost") } };
}

/** Netten brüte (verilen ay için; ikili arama). */
export function netToGross(targetNet, month = 1, params = TAX_2026) {
  const t = Number(targetNet) || 0;
  if (t <= 0) return 0;
  let lo = t;
  let hi = t * 3 + 10000;
  for (let i = 0; i < 80; i += 1) {
    const mid = (lo + hi) / 2;
    const net = grossToNetYear(mid, params).months[month - 1].net;
    if (net < t) lo = mid; else hi = mid;
  }
  return r2(hi);
}

/* ------------------------------- fatura / makbuz ------------------------------- */

export const WITHHOLDING = [
  { key: "0", label: "Tevkifat yok", ratio: 0 },
  { key: "2/10", label: "2/10 (yapım, etüt-proje…)", ratio: 0.2 },
  { key: "3/10", label: "3/10", ratio: 0.3 },
  { key: "4/10", label: "4/10 (makine bakım…)", ratio: 0.4 },
  { key: "5/10", label: "5/10 (yemek, organizasyon…)", ratio: 0.5 },
  { key: "7/10", label: "7/10 (temizlik, servis…)", ratio: 0.7 },
  { key: "9/10", label: "9/10 (işgücü, güvenlik…)", ratio: 0.9 },
];

/**
 * Fatura / serbest meslek makbuzu.
 *  mode "gross": tutar = KDV hariç brüt hizmet bedeli.
 *  mode "net":   tutar = eline geçecek net (stopaj düşülmüş, KDV hariç) → brüt bulunur.
 *  mode "total": tutar = KDV dahil toplam fatura → KDV hariç bulunur.
 * stopaj: gelir vergisi kesintisi (serbest meslek %20); tevkifat: KDV'nin alıcıca ödenen kısmı.
 */
export function invoice(amount, { mode = "gross", vatRate = 0.2, stopaj = 0, withholding = 0 } = {}) {
  const a = Number(amount) || 0;
  let gross = a;
  if (mode === "net") gross = stopaj < 1 ? a / (1 - stopaj) : a;
  if (mode === "total") gross = a / (1 + vatRate);
  const vat = gross * vatRate;
  const stopajAmount = gross * stopaj;
  const withheldVat = vat * withholding;
  const collectedVat = vat - withheldVat;
  const net = gross - stopajAmount;
  return {
    gross: r2(gross), vat: r2(vat), total: r2(gross + vat), stopaj: r2(stopajAmount),
    withheldVat: r2(withheldVat), collectedVat: r2(collectedVat),
    netReceived: r2(net + collectedVat), net: r2(net),
  };
}

/* ------------------------------- kredi ------------------------------- */

/**
 * Eşit taksitli kredi. monthlyRate: aylık akdi faiz (%2,5 → 0.025). Tüketici kredisinde faize
 * BSMV (%15) ve KKDF (%15) eklenir (vergili efektif oran = r × (1 + bsmv + kkdf)); konut kredisi muaf.
 * → { payment, total, interest, taxes, schedule: [{ no, payment, interest, tax, principal, balance }] }
 */
export function loan(principal, months, monthlyRate, { bsmv = 0.15, kkdf = 0.15, taxed = true } = {}) {
  const P = Number(principal) || 0;
  const n = Math.max(1, Math.floor(Number(months) || 0));
  const r = Number(monthlyRate) || 0;
  const taxF = taxed ? bsmv + kkdf : 0;
  const re = r * (1 + taxF);
  const payment = re ? (P * re) / (1 - (1 + re) ** -n) : P / n;
  const schedule = [];
  let bal = P;
  for (let i = 1; i <= n; i += 1) {
    const interest = bal * r;
    const tax = interest * taxF;
    let principalPart = payment - interest - tax;
    if (i === n) principalPart = bal;
    bal = Math.max(0, bal - principalPart);
    schedule.push({ no: i, payment: r2(i === n ? principalPart + interest + tax : payment), interest: r2(interest), tax: r2(tax), principal: r2(principalPart), balance: r2(bal) });
  }
  const total = schedule.reduce((s, x) => s + x.payment, 0);
  return { payment: r2(payment), total: r2(total), interest: r2(schedule.reduce((s, x) => s + x.interest, 0)), taxes: r2(schedule.reduce((s, x) => s + x.tax, 0)), schedule };
}
