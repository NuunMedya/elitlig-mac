// Ajanda hesapları: takvim ızgarası, görünüm aralığı ve güne düşen etkinlikler.
// Hafta pazartesi başlar.

export const CATEGORIES = [
  { key: "general", label: "Genel", color: "#6366f1", icon: "fa-regular fa-calendar" },
  { key: "match", label: "Maç", color: "#7c3aed", icon: "fa-regular fa-futbol" },
  { key: "meeting", label: "Toplantı", color: "#0284c7", icon: "fa-solid fa-people-group" },
  { key: "training", label: "Antrenman", color: "#059669", icon: "fa-solid fa-person-running" },
  { key: "deadline", label: "Son tarih", color: "#dc2626", icon: "fa-regular fa-flag" },
  { key: "payment", label: "Ödeme", color: "#d97706", icon: "fa-solid fa-turkish-lira-sign" },
  { key: "personal", label: "Kişisel", color: "#db2777", icon: "fa-regular fa-heart" },
];

export const RECURRENCES = [
  { key: "none", label: "Tekrarlanmaz" },
  { key: "daily", label: "Her gün" },
  { key: "weekly", label: "Her hafta" },
  { key: "monthly", label: "Her ay" },
  { key: "yearly", label: "Her yıl" },
];

export const REMINDERS = [
  { key: "", label: "Hatırlatma yok" },
  { key: "0", label: "Başladığında" },
  { key: "10", label: "10 dk önce" },
  { key: "30", label: "30 dk önce" },
  { key: "60", label: "1 saat önce" },
  { key: "1440", label: "1 gün önce" },
];

export const WEEKDAYS = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];

export const categoryOf = (key) => CATEGORIES.find((item) => item.key === key) || CATEGORIES[0];
export const colorOf = (item) => item.color || categoryOf(item.category).color;

export const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
export const addDays = (date, days) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days, date.getHours(), date.getMinutes());
export const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
/** Pazartesi = 0 … Pazar = 6 */
export const weekdayIndex = (date) => (date.getDay() + 6) % 7;
export const startOfWeek = (date) => addDays(startOfDay(date), -weekdayIndex(date));

/** Ay görünümü: ayın ilk haftasının pazartesisinden başlayan 6×7 gün. */
export function monthGrid(year, month) {
  const first = startOfWeek(new Date(year, month, 1));
  return Array.from({ length: 42 }, (_, index) => addDays(first, index));
}

export const weekDays = (date) => {
  const first = startOfWeek(date);
  return Array.from({ length: 7 }, (_, index) => addDays(first, index));
};

/** API'den istenecek aralık (görünümün ilk gününden son gününün sonuna). */
export function rangeFor(view, cursor) {
  let from;
  let days;
  if (view === "month") {
    from = monthGrid(cursor.getFullYear(), cursor.getMonth())[0];
    days = 42;
  } else if (view === "week") {
    from = startOfWeek(cursor);
    days = 7;
  } else if (view === "day") {
    from = startOfDay(cursor);
    days = 1;
  } else {
    // Liste: bugünden itibaren 60 gün.
    from = startOfDay(cursor);
    days = 60;
  }
  const to = new Date(addDays(from, days).getTime() - 1);
  return { from, to };
}

export function shiftCursor(view, cursor, step) {
  if (view === "month") return new Date(cursor.getFullYear(), cursor.getMonth() + step, 1);
  if (view === "week") return addDays(cursor, 7 * step);
  if (view === "day") return addDays(cursor, step);
  return addDays(cursor, 30 * step);
}

export function titleFor(view, cursor) {
  if (view === "month") return cursor.toLocaleDateString("tr-TR", { month: "long", year: "numeric" });
  if (view === "day") return cursor.toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  if (view === "week") {
    const days = weekDays(cursor);
    const first = days[0];
    const last = days[6];
    const sameMonth = first.getMonth() === last.getMonth();
    return `${first.toLocaleDateString("tr-TR", sameMonth ? { day: "numeric" } : { day: "numeric", month: "short" })} – ${last.toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" })}`;
  }
  return "Yaklaşan 60 gün";
}

const startOf = (item) => new Date(item.occurrence_start);
const endOf = (item) => (item.occurrence_end ? new Date(item.occurrence_end) : startOf(item));

/** Güne düşen etkinlikler: tüm gün olanlar önce, sonra başlama saatine göre. */
export function itemsOnDay(items, day) {
  const dayStart = startOfDay(day);
  const dayEnd = new Date(addDays(dayStart, 1).getTime() - 1);
  return items
    .filter((item) => startOf(item) <= dayEnd && endOf(item) >= dayStart)
    .sort((a, b) => Number(Boolean(b.all_day)) - Number(Boolean(a.all_day)) || startOf(a) - startOf(b));
}

/** Gün/hafta görünümünde saatli etkinliğin dikey konumu (dakika cinsinden). */
export function timeBox(item, day) {
  const dayStart = startOfDay(day);
  const start = Math.max(0, (startOf(item) - dayStart) / 60000);
  const rawEnd = item.occurrence_end ? (endOf(item) - dayStart) / 60000 : start + 45;
  const end = Math.min(24 * 60, Math.max(start + 30, rawEnd));
  return { top: start, height: end - start };
}

/** Form → API gövdesi. Tüm gün etkinliğinde saatler gün başı/sonuna çekilir. */
export function eventPayload(form) {
  const allDay = Boolean(form.all_day);
  const start = allDay ? new Date(`${form.start_date}T00:00:00`) : new Date(form.start_at);
  let end = null;
  if (allDay) {
    const lastDay = form.end_date || form.start_date;
    end = new Date(`${lastDay}T23:59:00`);
  } else if (form.end_at) {
    end = new Date(form.end_at);
  }
  return {
    title: form.title,
    description: form.description || null,
    location: form.location || null,
    category: form.category || "general",
    color: form.color || null,
    all_day: allDay,
    start_at: start.toISOString(),
    end_at: end ? end.toISOString() : null,
    recurrence: form.recurrence || "none",
    repeat_until: form.recurrence && form.recurrence !== "none" && form.repeat_until ? form.repeat_until : null,
    remind_minutes: form.remind_minutes === "" || form.remind_minutes == null ? null : Number(form.remind_minutes),
  };
}

/** Hatırlatma zamanı gelmiş (son `windowMs` içinde) etkinlikler. */
export function dueReminders(items, now = new Date(), windowMs = 60000) {
  return items.filter((item) => {
    if (item.source !== "event" || item.remind_minutes == null) return false;
    const at = startOf(item).getTime() - item.remind_minutes * 60000;
    return at <= now.getTime() && at > now.getTime() - windowMs;
  });
}
