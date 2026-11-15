// Kimlik ve iletişim doğrulayıcıları: IBAN (ISO 13616, mod 97; TR banka adı), T.C. kimlik
// numarası (resmî algoritma), Türkiye telefon numarası biçimleme.

const IBAN_LENGTHS = { TR: 26, DE: 22, GB: 22, FR: 27, NL: 18, IT: 27, ES: 24, AT: 20, BE: 16, CH: 21, AZ: 28, GE: 22, CY: 28, GR: 27, BG: 22, RO: 24, PL: 28, SE: 24, DK: 18, NO: 15, FI: 18, IE: 22, PT: 25, LU: 20, AE: 23, SA: 24, QA: 29 };

/** TR IBAN'ında 5–9. haneler banka kodudur (EFT kodu). Yaygın bankalar. */
export const TR_BANKS = {
  "00001": "T.C. Merkez Bankası", "00010": "Ziraat Bankası", "00012": "Halkbank", "00015": "VakıfBank", "00032": "TEB",
  "00046": "Akbank", "00059": "Şekerbank", "00062": "Garanti BBVA", "00064": "İş Bankası", "00067": "Yapı Kredi",
  "00099": "ING", "00103": "Fibabanka", "00111": "QNB", "00123": "HSBC", "00124": "Alternatif Bank", "00125": "Burgan Bank",
  "00134": "DenizBank", "00135": "Anadolubank", "00146": "Odea Bank", "00203": "Albaraka Türk", "00205": "Kuveyt Türk",
  "00206": "Türkiye Finans", "00209": "Ziraat Katılım", "00210": "Vakıf Katılım", "00211": "Emlak Katılım",
  "00109": "ICBC Turkey", "00143": "Aktif Bank", "00829": "Papara", "00832": "Enpara.com",
};

export const cleanIban = (s) => String(s || "").toUpperCase().replace(/[^0-9A-Z]/g, "");
export const formatIban = (s) => cleanIban(s).replace(/(.{4})/g, "$1 ").trim();

/** mod 97 (büyük sayı, parça parça). */
function mod97(digits) {
  let rem = 0;
  for (let i = 0; i < digits.length; i += 7) rem = Number(String(rem) + digits.slice(i, i + 7)) % 97;
  return rem;
}

/** → { ok, iban, formatted, country, bank, error } */
export function validateIban(input) {
  const iban = cleanIban(input);
  const res = { ok: false, iban, formatted: formatIban(iban), country: iban.slice(0, 2), bank: null, error: null };
  if (!iban) return { ...res, error: "IBAN girin." };
  if (!/^[A-Z]{2}\d{2}[0-9A-Z]+$/.test(iban)) return { ...res, error: "IBAN iki harf ülke kodu ve iki haneli kontrol numarasıyla başlar (ör. TR12…)." };
  const len = IBAN_LENGTHS[res.country];
  if (len && iban.length !== len) return { ...res, error: `${res.country} IBAN'ı ${len} karakterdir (girilen: ${iban.length}).` };
  if (res.country === "TR" && !/^TR\d{24}$/.test(iban)) return { ...res, error: "TR IBAN'ında ülke kodundan sonra yalnız rakam olur." };
  const moved = iban.slice(4) + iban.slice(0, 4);
  const digits = moved.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  if (mod97(digits) !== 1) return { ...res, error: "Kontrol basamakları tutmuyor: IBAN'da yazım hatası var." };
  if (res.country === "TR") res.bank = TR_BANKS[iban.slice(4, 9)] || `Banka kodu ${iban.slice(4, 9)}`;
  return { ...res, ok: true };
}

/** Toplu: her satır bir IBAN. */
export const validateIbans = (text) => String(text || "").split("\n").map((l) => l.trim()).filter(Boolean).map(validateIban);

/** T.C. kimlik no: 11 hane, ilk hane 0 olamaz; 10. ve 11. haneler algoritmayla. */
export function validateTckn(input) {
  const s = String(input || "").replace(/\D/g, "");
  if (s.length !== 11) return { ok: false, error: `11 hane olmalı (girilen: ${s.length}).` };
  if (s[0] === "0") return { ok: false, error: "İlk hane 0 olamaz." };
  const d = s.split("").map(Number);
  const odd = d[0] + d[2] + d[4] + d[6] + d[8];
  const even = d[1] + d[3] + d[5] + d[7];
  const d10 = (((odd * 7 - even) % 10) + 10) % 10;
  if (d10 !== d[9]) return { ok: false, error: "10. hane algoritmaya uymuyor." };
  const d11 = d.slice(0, 10).reduce((a, b) => a + b, 0) % 10;
  if (d11 !== d[10]) return { ok: false, error: "11. hane algoritmaya uymuyor." };
  return { ok: true, error: null };
}

/**
 * Türkiye telefon numarası: "0532 123 45 67", "+90 532…", "5321234567", "90532…".
 * → { ok, type: "mobile"|"landline", e164, national, intl, wa, error }
 */
export function formatPhoneTr(input) {
  let s = String(input || "").replace(/[^\d+]/g, "");
  if (s.startsWith("+")) s = s.slice(1);
  if (s.startsWith("0090")) s = s.slice(4);
  else if (s.startsWith("90") && s.length === 12) s = s.slice(2);
  else if (s.startsWith("0") && s.length === 11) s = s.slice(1);
  if (!/^\d{10}$/.test(s)) return { ok: false, error: "10 haneli numara olmalı (alan kodu + numara)." };
  if (!/^[2-5]/.test(s)) return { ok: false, error: "Türkiye numarası 2, 3, 4 ya da 5 ile başlar." };
  const type = s[0] === "5" ? "mobile" : "landline";
  const g = `${s.slice(0, 3)} ${s.slice(3, 6)} ${s.slice(6, 8)} ${s.slice(8)}`;
  return { ok: true, type, e164: `+90${s}`, national: `0${g}`, intl: `+90 ${g}`, wa: `https://wa.me/90${s}`, digits: s, error: null };
}
