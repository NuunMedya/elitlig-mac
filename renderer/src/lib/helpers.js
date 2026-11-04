// Görünümlerin ortak saf yardımcıları (testlerde doğrudan sınanır).

/* ------------------------------- Rehber ------------------------------- */
export const letterOf = (name = "") => {
  const first = name.trim().charAt(0).toLocaleUpperCase("tr-TR");
  return /[A-ZÇĞİÖŞÜ]/.test(first) ? first : "#";
};
const digitsOf = (phone = "") => String(phone || "").replace(/\D/g, "");

/** WhatsApp için uluslararası numara: 0555… → 90555… */
export const waNumber = (phone = "") => {
  let digits = digitsOf(phone);
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = `90${digits.slice(1)}`;
  if (digits.length === 10 && digits.startsWith("5")) digits = `90${digits}`;
  return digits;
};

/** 05551234567 → 0555 123 45 67 */
export const prettyPhone = (phone = "") => {
  const d = digitsOf(phone);
  if (d.length === 11 && d.startsWith("0")) return `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7, 9)} ${d.slice(9)}`;
  if (d.length === 10 && d.startsWith("5")) return `0${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6, 8)} ${d.slice(8)}`;
  if (d.length === 12 && d.startsWith("90")) return `+90 ${d.slice(2, 5)} ${d.slice(5, 8)} ${d.slice(8, 10)} ${d.slice(10)}`;
  return phone || "";
};

/** Kişileri vCard (.vcf) olarak dışa aktarır: Kişiler uygulamasına sürüklenebilir. */
export const toVCard = (contacts) => contacts.map((c) => [
  "BEGIN:VCARD", "VERSION:3.0",
  `FN:${(c.name || "").replace(/[,;]/g, " ")}`,
  c.company ? `ORG:${c.company}` : null,
  c.title ? `TITLE:${c.title}` : null,
  c.phone ? `TEL;TYPE=CELL:${c.phone}` : null,
  c.email ? `EMAIL:${c.email}` : null,
  c.city ? `ADR;TYPE=WORK:;;;${c.city};;;` : null,
  c.note ? `NOTE:${String(c.note).replace(/\r?\n/g, "\\n")}` : null,
  "END:VCARD",
].filter(Boolean).join("\r\n")).join("\r\n");

/* ------------------------------- Notlar ------------------------------- */
export const noteText = (note) => [
  note.title,
  note.body,
  ...(note.checklist || []).map((item) => `${item.done ? "[x]" : "[ ]"} ${item.text}`),
].filter(Boolean).join("\n");

export const matchesQuery = (note, query) => {
  const q = query.trim().toLocaleLowerCase("tr-TR");
  if (!q) return true;
  return `${noteText(note)} ${(note.tags || []).join(" ")}`.toLocaleLowerCase("tr-TR").includes(q);
};

export const notesToMarkdown = (notes) => notes.map((note) => {
  const lines = [`## ${note.title || "Başlıksız not"}`];
  if (note.tags?.length) lines.push(note.tags.map((tag) => `#${tag}`).join(" "));
  if (note.body) lines.push("", note.body);
  if (note.checklist?.length) lines.push("", ...note.checklist.map((i) => `- [${i.done ? "x" : " "}] ${i.text}`));
  return lines.join("\n");
}).join("\n\n---\n\n");

/* ------------------------------ Odak sayacı ------------------------------ */
export const formatClock = (ms, withTenths = false) => {
  const total = Math.max(0, ms);
  const h = Math.floor(total / 3600000);
  const m = Math.floor((total % 3600000) / 60000);
  const s = Math.floor((total % 60000) / 1000);
  const t = Math.floor((total % 1000) / 100);
  const base = `${h ? `${h}:` : ""}${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return withTenths ? `${base}.${t}` : base;
};

/* ------------------------------- Biçimler ------------------------------- */
export const formatMoney = (value, digits = 2) =>
  `${new Intl.NumberFormat("tr-TR", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(Number(value) || 0)} ₺`;
export const formatTime = (value) => new Date(value).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
export const formatDate = (value, opts = { day: "numeric", month: "short", year: "numeric" }) =>
  value ? new Date(String(value).length === 10 ? `${value}T12:00:00` : value).toLocaleDateString("tr-TR", opts) : "";
export const isoDay = (date = new Date()) => {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
/** datetime-local girdisi için yerel "YYYY-MM-DDTHH:mm". */
export const localInput = (value) => {
  if (!value) return "";
  const d = new Date(value);
  return `${isoDay(d)}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

export function relativeDay(value, now = new Date()) {
  const d = new Date(value);
  const start = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(d) - start(now)) / 86400000);
  if (diff === 0) return "Bugün";
  if (diff === 1) return "Yarın";
  if (diff === -1) return "Dün";
  if (diff > 1 && diff < 7) return d.toLocaleDateString("tr-TR", { weekday: "long" });
  return d.toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
}

export function relativeTime(iso, now = Date.now()) {
  if (!iso) return "";
  const diff = Math.round((now - new Date(iso).getTime()) / 60000);
  if (diff < 1) return "az önce";
  if (diff < 60) return `${diff} dk önce`;
  if (diff < 1440) return `${Math.floor(diff / 60)} sa önce`;
  if (diff < 10080) return `${Math.floor(diff / 1440)} gün önce`;
  return formatDate(iso);
}

export const greeting = (hour) => (hour < 6 ? "İyi geceler" : hour < 12 ? "Günaydın" : hour < 18 ? "İyi günler" : "İyi akşamlar");

/** Türkçe duyarlı arama. */
export const includesTr = (haystack, needle) =>
  String(haystack || "").toLocaleLowerCase("tr-TR").includes(String(needle || "").trim().toLocaleLowerCase("tr-TR"));

/** Yapılacaklar: kartları gruplar (gecikmiş, bugün, yakında, tarihsiz, tamamlanan). */
export function groupTodos(items, now = new Date()) {
  const groups = { overdue: [], today: [], upcoming: [], nodate: [], done: [] };
  const todayKey = isoDay(now);
  for (const item of items) {
    if (item.status === "done") groups.done.push(item);
    else if (!item.dueAt) groups.nodate.push(item);
    else if (new Date(item.dueAt) < now && isoDay(item.dueAt) !== todayKey) groups.overdue.push(item);
    else if (isoDay(item.dueAt) === todayKey) groups.today.push(item);
    else groups.upcoming.push(item);
  }
  const byDue = (a, b) => new Date(a.dueAt) - new Date(b.dueAt);
  groups.overdue.sort(byDue);
  groups.today.sort(byDue);
  groups.upcoming.sort(byDue);
  return groups;
}

/** Doğal dille hızlı görev: "yarın 14:00 sahayı ara !" → { title, dueAt, priority } */
export function parseQuickTask(text, now = new Date()) {
  let rest = ` ${String(text || "").trim()} `;
  let date = null;
  let priority = "normal";
  if (/\s!{1,3}\s/.test(rest)) { priority = "high"; rest = rest.replace(/\s!{1,3}\s/, " "); }
  const dayWords = [[/\s(bugün)\s/i, 0], [/\s(yarın)\s/i, 1], [/\s(öbür gün|ertesi gün)\s/i, 2]];
  for (const [re, add] of dayWords) {
    if (re.test(rest)) { date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + add, 18, 0); rest = rest.replace(re, " "); break; }
  }
  const days = ["pazar", "pazartesi", "salı", "çarşamba", "perşembe", "cuma", "cumartesi"];
  if (!date) {
    const m = rest.match(/\s(pazartesi|salı|çarşamba|perşembe|cumartesi|cuma|pazar)\s/i);
    if (m) {
      const target = days.indexOf(m[1].toLocaleLowerCase("tr-TR"));
      let add = (target - now.getDay() + 7) % 7;
      if (add === 0) add = 7;
      date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + add, 18, 0);
      rest = rest.replace(m[0], " ");
    }
  }
  const time = rest.match(/\s(?:saat\s)?(\d{1,2})[:.](\d{2})\s/);
  if (time) {
    const h = Number(time[1]);
    const min = Number(time[2]);
    if (h < 24 && min < 60) {
      if (!date) {
        date = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, min);
        if (date < now) date = new Date(date.getTime() + 86400000);
      } else date.setHours(h, min, 0, 0);
      rest = rest.replace(time[0], " ");
    }
  }
  return { title: rest.replace(/\s+/g, " ").trim(), dueAt: date ? date.toISOString() : null, priority };
}
