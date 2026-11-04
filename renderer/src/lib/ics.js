// Ajanda etkinliklerini iCalendar (.ics) biçimine çevirir; Mac Takvim'i,
// Google Takvim ve Outlook doğrudan açar. Tekrar kuralları RRULE olarak yazılır.

const pad = (n) => String(n).padStart(2, "0");
const utc = (value) => {
  const d = new Date(value);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
};
const localDate = (value) => {
  const d = new Date(value);
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
};
const escape = (text) => String(text || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const FREQ = { daily: "DAILY", weekly: "WEEKLY", monthly: "MONTHLY", yearly: "YEARLY" };

/** Uzun satırları RFC 5545'e göre 75 karakterde katlar. */
const fold = (line) => {
  const out = [];
  let rest = line;
  while (rest.length > 74) { out.push(rest.slice(0, 74)); rest = ` ${rest.slice(74)}`; }
  out.push(rest);
  return out.join("\r\n");
};

export function toIcs(events, { now = new Date() } = {}) {
  const seen = new Set();
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Elitlig//Araclar//TR", "CALSCALE:GREGORIAN", "X-WR-CALNAME:Elitlig Ajanda"];
  for (const ev of events) {
    if (seen.has(ev.id)) continue; // tekrarlanan etkinlik bir kez, kuralıyla yazılır
    seen.add(ev.id);
    const start = ev.start_at || ev.occurrence_start;
    const end = ev.end_at || ev.occurrence_end;
    lines.push("BEGIN:VEVENT", `UID:elitlig-event-${ev.id}@elitlig.com`, `DTSTAMP:${utc(now)}`);
    if (ev.all_day) {
      const last = new Date(end || start);
      lines.push(`DTSTART;VALUE=DATE:${localDate(start)}`, `DTEND;VALUE=DATE:${localDate(new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1))}`);
    } else {
      lines.push(`DTSTART:${utc(start)}`, `DTEND:${utc(end || new Date(new Date(start).getTime() + 3600000))}`);
    }
    lines.push(`SUMMARY:${escape(ev.title)}`);
    if (ev.location) lines.push(`LOCATION:${escape(ev.location)}`);
    if (ev.description) lines.push(`DESCRIPTION:${escape(ev.description)}`);
    if (FREQ[ev.recurrence]) lines.push(`RRULE:FREQ=${FREQ[ev.recurrence]}${ev.repeat_until ? `;UNTIL=${ev.repeat_until.replace(/-/g, "")}T235959Z` : ""}`);
    if (ev.remind_minutes != null) lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${escape(ev.title)}`, `TRIGGER:-PT${Number(ev.remind_minutes)}M`, "END:VALARM");
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return `${lines.map(fold).join("\r\n")}\r\n`;
}
