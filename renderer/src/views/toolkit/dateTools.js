// Araç takımı — tarih hesapları (saf): iki tarih arası fark, iş günü (hafta sonu + resmî tatiller),
// tarihe gün / iş günü ekleme, geri sayım. Tarihler yerel saatte "YYYY-AA-GG" olarak alınır.

/** Sabit tarihli resmî tatiller (AA-GG). 28 Ekim ve arifeler yarım gün: iş günü sayılır. */
export const FIXED_HOLIDAYS = {
  "01-01": "Yılbaşı",
  "04-23": "Ulusal Egemenlik ve Çocuk Bayramı",
  "05-01": "Emek ve Dayanışma Günü",
  "05-19": "Atatürk'ü Anma, Gençlik ve Spor Bayramı",
  "07-15": "Demokrasi ve Millî Birlik Günü",
  "08-30": "Zafer Bayramı",
  "10-29": "Cumhuriyet Bayramı",
};

/**
 * Dini bayramlar (ilk gün; Ramazan 3, Kurban 4 gün). Diyanet'in hesap yöntemiyle (kavuşumdan sonraki
 * gün). 2025–2026 resmî takvimle aynıdır; 2027–2028 hesaplanmıştır, resmî takvim çıkınca doğrulanmalı.
 */
export const RELIGIOUS_HOLIDAYS = [
  { start: "2025-03-30", days: 3, name: "Ramazan Bayramı" },
  { start: "2025-06-06", days: 4, name: "Kurban Bayramı" },
  { start: "2026-03-20", days: 3, name: "Ramazan Bayramı" },
  { start: "2026-05-27", days: 4, name: "Kurban Bayramı" },
  { start: "2027-03-09", days: 3, name: "Ramazan Bayramı" },
  { start: "2027-05-16", days: 4, name: "Kurban Bayramı" },
  { start: "2028-02-27", days: 3, name: "Ramazan Bayramı" },
  { start: "2028-05-05", days: 4, name: "Kurban Bayramı" },
];

const DAY = 86400000;
/** "YYYY-AA-GG" → yerel gece yarısı Date (geçersizse null). */
export function parseDay(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || "").trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.getMonth() === Number(m[2]) - 1 ? d : null;
}
export const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
/** Yaz saati değişiminden etkilenmeyen gün farkı. */
const diffDays = (a, b) => Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / DAY);

let religiousMap = null;
function religious() {
  if (religiousMap) return religiousMap;
  religiousMap = new Map();
  for (const h of RELIGIOUS_HOLIDAYS) {
    const s = parseDay(h.start);
    for (let i = 0; i < h.days; i += 1) religiousMap.set(dayKey(addDays(s, i)), `${h.name} ${i + 1}. gün`);
  }
  return religiousMap;
}

/** O gün resmî tatil mi? → ad | null. religiousOn: dini bayramlar dahil. */
export function holidayName(d, { religiousOn = true } = {}) {
  const k = dayKey(d);
  return FIXED_HOLIDAYS[k.slice(5)] || (religiousOn ? religious().get(k) : null) || null;
}
export const isWeekend = (d, { saturday = false } = {}) => d.getDay() === 0 || (!saturday && d.getDay() === 6);

/**
 * İki tarih arası: takvim günü, hafta, ay+gün, iş günü (başlangıç hariç, bitiş dahil — "kaç iş günü
 * sonra" sorusunun yanıtı), aradaki tatiller. saturdayWork: cumartesi iş günü sayılır.
 */
export function dateDiff(fromStr, toStr, { religiousOn = true, saturdayWork = false } = {}) {
  const a0 = parseDay(fromStr);
  const b0 = parseDay(toStr);
  if (!a0 || !b0) return null;
  const sign = b0 >= a0 ? 1 : -1;
  const [a, b] = sign > 0 ? [a0, b0] : [b0, a0];
  const days = diffDays(a, b);
  let work = 0;
  const holidays = [];
  for (let i = 1; i <= days; i += 1) {
    const d = addDays(a, i);
    const h = holidayName(d, { religiousOn });
    if (h && !isWeekend(d, { saturday: saturdayWork })) holidays.push({ date: dayKey(d), name: h });
    if (!h && !isWeekend(d, { saturday: saturdayWork })) work += 1;
  }
  let months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  if (b.getDate() < a.getDate()) months -= 1;
  const anchor = new Date(a.getFullYear(), a.getMonth() + months, a.getDate());
  const restDays = diffDays(anchor, b);
  return { sign, days, weeks: Math.floor(days / 7), weekDays: days % 7, years: Math.floor(months / 12), months: months % 12, restDays, workDays: work, holidays };
}

/** Tarihe gün ya da iş günü ekle (negatif: çıkar). */
export function addToDate(fromStr, n, { business = false, religiousOn = true, saturdayWork = false } = {}) {
  const start = parseDay(fromStr);
  const count = Math.round(Number(n));
  if (!start || !Number.isFinite(count)) return null;
  if (!business) return dayKey(addDays(start, count));
  const step = count >= 0 ? 1 : -1;
  let d = start;
  let left = Math.abs(count);
  let guard = 0;
  while (left > 0 && guard < 20000) {
    d = addDays(d, step);
    guard += 1;
    if (!isWeekend(d, { saturday: saturdayWork }) && !holidayName(d, { religiousOn })) left -= 1;
  }
  return dayKey(d);
}

/** Geri sayım: hedef anına kalan { done, days, hours, minutes, seconds, totalMs }. */
export function countdown(targetMs, now = Date.now()) {
  const total = Number(targetMs) - now;
  const t = Math.max(0, total);
  return {
    done: total <= 0,
    totalMs: total,
    days: Math.floor(t / DAY),
    hours: Math.floor((t % DAY) / 3600000),
    minutes: Math.floor((t % 3600000) / 60000),
    seconds: Math.floor((t % 60000) / 1000),
  };
}

const WEEKDAYS = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];
export const weekdayName = (d) => WEEKDAYS[d.getDay()];
