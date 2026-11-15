// Dünya saatleri — saf (Intl saat dilimleri).

export const ZONES = [
  { tz: "Europe/Istanbul", label: "İstanbul" },
  { tz: "Europe/London", label: "Londra" },
  { tz: "Europe/Berlin", label: "Berlin" },
  { tz: "Europe/Paris", label: "Paris" },
  { tz: "Europe/Moscow", label: "Moskova" },
  { tz: "Asia/Baku", label: "Bakü" },
  { tz: "Asia/Dubai", label: "Dubai" },
  { tz: "Asia/Riyadh", label: "Riyad" },
  { tz: "Asia/Tehran", label: "Tahran" },
  { tz: "Asia/Kolkata", label: "Yeni Delhi" },
  { tz: "Asia/Shanghai", label: "Şanghay" },
  { tz: "Asia/Tokyo", label: "Tokyo" },
  { tz: "Australia/Sydney", label: "Sidney" },
  { tz: "America/New_York", label: "New York" },
  { tz: "America/Chicago", label: "Chicago" },
  { tz: "America/Los_Angeles", label: "Los Angeles" },
  { tz: "America/Sao_Paulo", label: "São Paulo" },
  { tz: "UTC", label: "UTC" },
];
export const DEFAULT_ZONES = ["Europe/Istanbul", "Europe/London", "America/New_York", "Asia/Tokyo"];
export const zoneLabel = (tz) => ZONES.find((z) => z.tz === tz)?.label || String(tz).split("/").pop().replace(/_/g, " ");

/** Saat diliminin o andaki UTC farkı (dakika). */
export function offsetMinutes(tz, date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(date);
  const get = (t) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"));
  return Math.round((asUtc - Math.floor(date.getTime() / 60000) * 60000) / 60000);
}

/** "+3 sa", "−5 sa", "+5,5 sa" — yerel saate göre fark. */
export function diffLabel(tz, localTz, date = new Date()) {
  const d = (offsetMinutes(tz, date) - offsetMinutes(localTz, date)) / 60;
  if (!d) return "aynı saat";
  const n = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(Math.abs(d));
  return `${d > 0 ? "+" : "−"}${n} sa`;
}

/** Saat, tarih ve gün/gece. */
export function zoneNow(tz, date = new Date()) {
  const time = new Intl.DateTimeFormat("tr-TR", { timeZone: tz, hour: "2-digit", minute: "2-digit" }).format(date);
  const day = new Intl.DateTimeFormat("tr-TR", { timeZone: tz, weekday: "short", day: "numeric", month: "short" }).format(date);
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hourCycle: "h23" }).format(date));
  return { time, day, hour, night: hour < 7 || hour >= 20 };
}

export function normalizeZones(list) {
  const ok = (tz) => { try { new Intl.DateTimeFormat("tr-TR", { timeZone: tz }); return true; } catch { return false; } };
  const out = [];
  for (const tz of Array.isArray(list) ? list : DEFAULT_ZONES) if (typeof tz === "string" && ok(tz) && !out.includes(tz)) out.push(tz);
  return out.slice(0, 8);
}
