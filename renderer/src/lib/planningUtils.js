// Saha ve maç planlama (çağrı merkezi) için saf yardımcılar.
//
// Sitedeki /editor/sahalar ekranının (MatchVenues + venues/*) kurallarının
// masaüstü karşılığı: hafta tablosu, saat anahtarları, hücre durumu, havuz ve
// kart özetleri, iletişim bağlantıları, takım listeleri; Talepler gelen
// kutusu (kaynak, istenen gün / saat / saha, uygunluk, durum grubu), Program
// hafta panosunun hücre görünümü ve özeti, takım profili, görüşme kaydı ve
// düzenleme gövdeleri. Bileşenler yalnızca çizer.

export const DAY_LABELS = { 1: "Pazartesi", 2: "Salı", 3: "Çarşamba", 4: "Perşembe", 5: "Cuma", 6: "Cumartesi", 7: "Pazar" };
export const DAY_SHORT = { 1: "Pzt", 2: "Sal", 3: "Çar", 4: "Per", 5: "Cum", 6: "Cmt", 7: "Paz" };

export const SLOT_STATUS_LABELS = { open: "Uygun", closed: "Dolu", awaiting: "Rakip bekleniyor", booked: "Maç alındı" };
export const POOL_SOURCE_LABELS = { request: "Takım talebi", admin: "Yönetici ekledi" };
export const MATCH_REQUEST_STATUSES = { pending: "Bekliyor", approved: "Onaylandı", rejected: "Reddedildi", cancelled: "Geri çekildi" };
export const MINUTE_OPTIONS = [0, 15, 30, 45];
export const SLOT_MINUTE_OPTIONS = [
  { value: 60, label: "60 dakika (saat başı)" },
  { value: 30, label: "30 dakika (buçuklu)" },
  { value: 15, label: "15 dakika (çeyrek saat)" },
];

// Görüşme (arama) etiketleri: sunucudaki CALL_OUTCOMES ile aynı. date:
// "required" → tekrar arama zamanı zorunlu, "optional" → isteğe bağlı.
export const CALL_OUTCOMES = [
  { value: "interested", label: "Oynamak istiyor", icon: "check", tone: "green", color: "#059669" },
  { value: "declined", label: "Oynamayacak", icon: "x", tone: "red", color: "#e11d48" },
  { value: "no_answer", label: "Ulaşılamadı", icon: "phone", tone: "amber", color: "#d97706" },
  { value: "callback", label: "Tekrar aranacak", icon: "clock", tone: "blue", color: "#2563eb", date: "required" },
  { value: "will_return", label: "Geri dönecek", icon: "rotate", tone: "blue", color: "#0284c7", date: "optional" },
  { value: "thinking", label: "Düşünüp haber verecek", icon: "help", tone: "amber", color: "#ca8a04", date: "optional" },
  { value: "other_slot", label: "Başka gün / saat istiyor", icon: "swap", tone: "tool", color: "#7c3aed" },
  { value: "messaged", label: "Mesaj gönderildi", icon: "message", tone: "tool", color: "#0d9488" },
  { value: "note", label: "Not", icon: "note", tone: "", color: "#64748b" },
];
export const outcomeMeta = (value) => CALL_OUTCOMES.find((o) => o.value === value) || { value, label: value || "Görüşme", icon: "phone", tone: "", color: "#64748b" };
/** Takımdan haber beklenen / takımın aranacağı sonuçlar. */
export const FOLLOWUP_OUTCOMES = ["callback", "will_return", "thinking"];

export const CARD_KINDS = {
  match_request: { label: "Maç talepleri", single: "Maç talebi", icon: "calendar", tone: "purple", hint: "Takımın oynayabileceği bütün saha / gün / saatler tek kartta." },
  contact: { label: "Görüşmeler", single: "Görüşme", icon: "phone", tone: "blue", hint: "Takımla görüşmeler ve maç talebi öncesi süreç." },
  personal: { label: "Kişisel notlar", single: "Kişisel not", icon: "note", tone: "amber", hint: "Hatırlatma ve şikâyetler; takım bağlamak isteğe bağlı." },
};
export const CARD_KIND_ORDER = ["match_request", "contact", "personal"];
export const CARD_STAGES = {
  open: { label: "Açık", column: "open" },
  waiting_them: { label: "Haber bekleniyor", column: "waiting", tone: "orange" },
  waiting_us: { label: "Haber verilecek", column: "waiting", tone: "teal" },
  matched: { label: "Maç ayarlandı", column: "done", tone: "green" },
  declined: { label: "Olumsuz sonuçlandı", column: "done", tone: "red" },
  resolved: { label: "Tamamlandı", column: "done", tone: "green" },
  unresolved: { label: "Tamamlanamadı", column: "done", tone: "red" },
};
export const TASK_PRIORITIES = [{ value: "high", label: "Yüksek" }, { value: "normal", label: "Normal" }, { value: "low", label: "Düşük" }];
export const stagesFor = (kind) => (kind === "personal" ? ["open", "waiting_them", "waiting_us", "resolved", "unresolved"] : ["open", "waiting_them", "waiting_us", "matched", "declined"]);
export const columnOf = (card) => CARD_STAGES[card?.stage]?.column || "open";

export const SUGGESTION_TYPES = {
  awaiting: { label: "Rakip bekliyor", tone: "amber", icon: "clock" },
  ready_to_pair: { label: "Eşleştirmeye hazır", tone: "tool", icon: "users" },
  stranded: { label: "Taşınmalı", tone: "red", icon: "alert" },
  find_opponent: { label: "Rakip bul", tone: "blue", icon: "team" },
  idle_team: { label: "Uzun süredir oynamıyor", tone: "amber", icon: "pause" },
  open_slot: { label: "Boş saat", tone: "green", icon: "inbox" },
};
const URGENT = new Set(["awaiting", "ready_to_pair", "stranded"]);

/* ------------------------------ saat / tarih ------------------------------ */

const pad = (v) => String(v).padStart(2, "0");
export const cellKey = (date, hour, minute = 0) => `${date}-${Number(hour)}-${Number(minute || 0)}`;
export const optionKey = (o) => `${o.venueId}|${o.date}|${Number(o.hour)}|${Number(o.minute || 0)}`;
export const timeLabel = (hour, minute = 0) => `${pad(hour ?? 0)}:${pad(minute ?? 0)}`;
export const isoValid = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || "").slice(0, 10));
/** "2026-08-18" → "18.08" */
export const dateLabel = (value) => {
  const raw = String(value || "").slice(0, 10);
  return isoValid(raw) ? `${raw.slice(8, 10)}.${raw.slice(5, 7)}` : raw;
};
export const dayOfIso = (iso) => { const d = new Date(`${String(iso).slice(0, 10)}T00:00:00Z`).getUTCDay(); return d === 0 ? 7 : d; };
export const addDays = (iso, days) => new Date(Date.parse(`${String(iso).slice(0, 10)}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
export const localIso = (date = new Date()) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
/** Pazartesi başlangıçlı hafta. */
export const weekStartOf = (iso) => (isoValid(iso) ? addDays(String(iso).slice(0, 10), -(dayOfIso(iso) - 1)) : "");
/** "Salı 19.09" */
export const dayLabel = (iso) => (isoValid(iso) ? `${DAY_LABELS[dayOfIso(iso)]} ${dateLabel(iso)}` : String(iso || ""));
export const slotLabel = (slot) => [dateLabel(slot?.date), DAY_LABELS[slot?.day || (slot?.date ? dayOfIso(slot.date) : 0)], timeLabel(slot?.hour, slot?.minute)].filter(Boolean).join(" ");
export const cellTitle = (cell) => `${dateLabel(cell?.date)} ${DAY_LABELS[cell?.day || (cell?.date ? dayOfIso(cell.date) : 0)] || ""} · ${timeLabel(cell?.hour, cell?.minute)}`.replace(/\s+/g, " ").trim();

/** Tablo hücrelerini gün+saat anahtarıyla erişilebilir hale getirir. */
export function cellIndex(cells) {
  const map = new Map();
  (Array.isArray(cells) ? cells : []).forEach((c) => map.set(cellKey(c.date, c.hour, c.minute), c));
  return map;
}

export const emptyCell = (day, time) => ({ date: day.date, day: day.day, hour: time.hour, minute: time.minute || 0, status: "open", is_past: Boolean(day.is_past), is_bookable: day.is_bookable !== false, pool: [], pool_count: 0, available: [] });

/* ------------------------------ hücre durumu ------------------------------ */

export const SLOT_STATES = {
  open: { label: "Boş", tone: "open" },
  suggested: { label: "Müsait takım var", tone: "suggested" },
  pooled: { label: "Aday var", tone: "pooled" },
  awaiting: { label: "Rakip bekleniyor", tone: "awaiting" },
  booked: { label: "Maç alındı", tone: "booked" },
  external: { label: "Sistemde maç", tone: "external" },
  stranded: { label: "Dolu, bekleyen var", tone: "stranded" },
  closed: { label: "Dolu", tone: "closed" },
  played: { label: "Oynandı", tone: "played" },
  past: { label: "Geçti", tone: "past" },
};
export const hasMatch = (cell) => Boolean(cell?.fixture || cell?.external_match || (cell?.home && cell?.away));
export const isPastCell = (cell) => Boolean(cell?.is_past || cell?.is_bookable === false);

/** Hücrenin ekrandaki durumu (tek anahtar). */
export function slotState(cell) {
  if (!cell) return "open";
  if (isPastCell(cell)) return hasMatch(cell) ? "played" : "past";
  if (cell.status === "closed") return "closed";
  if (cell.status === "booked") return cell.pool_stranded ? "stranded" : "booked";
  if (cell.external_match) return cell.pool_stranded ? "stranded" : "external";
  if (cell.status === "awaiting") return "awaiting";
  if ((cell.pool_count || 0) > 0) return "pooled";
  if ((cell.available || []).length > 0) return "suggested";
  return "open";
}
/** Geçmiş saat açılabilir mi? (maçı ya da takımı olan saatler) */
export const isPastWithDetail = (cell) => Boolean(isPastCell(cell) && (hasMatch(cell) || cell?.home));
/** Toplu seçime girebilir mi? (geçmiş değil, takımsız) */
export const canSelectCell = (cell) => Boolean(cell && !isPastCell(cell) && !cell.home && !cell.away);

export const scoreText = (fx) => (fx && fx.home_score != null && fx.away_score != null && !["taslak", "zamanlandi"].includes(fx.status) ? `${fx.home_score}-${fx.away_score}` : "");

/** Satırda yazacak kısa özet. */
export function slotSummary(cell) {
  const pool = cell?.pool || [];
  const available = cell?.available || [];
  const fx = cell?.fixture || cell?.external_match;
  if (fx && (cell.is_past || cell.external_match || !cell.home)) {
    const score = scoreText(fx);
    return `${fx.home_name} ${score || "–"} ${fx.away_name}`;
  }
  if (cell?.status === "closed") return cell.note ? `Dolu · ${cell.note}` : "Dolu";
  if (cell?.home && cell?.away) return `${cell.home.team_name} – ${cell.away.team_name}`;
  if (cell?.home) return `${cell.home.team_name} · rakip bekleniyor`;
  if (pool.length) return pool.map((e) => e.team_name).join(", ");
  if (available.length) return `${available.length} takım bu saatte uygun olduğunu bildirdi`;
  return cell?.is_past ? "Maç yok" : "Boş";
}

/** Haftalık haritada hücrenin kısa yazısı. */
export function heatText(cell) {
  const state = slotState(cell);
  if (state === "played") return scoreText(cell.fixture || cell.external_match) || "maç";
  if (state === "closed") return "dolu";
  if (state === "external") return "sistem";
  if (cell.home && cell.away) return "maç";
  if (cell.home) return "rakip?";
  if (cell.pool_count) return `${cell.pool_count} aday`;
  return "";
}

/**
 * Haftalık tablo: sahanın gün × saat ızgarası. Sunucunun gönderdiği hücreler
 * yerine oturur; olmayan saatler boş hücre olur.
 * Döner: { days, times, rows: [{ time, cells: [cell] }], cellAt(day, time) }
 */
export function buildWeekGrid(board) {
  const venue = board?.venue || null;
  const days = venue?.grid?.days || [];
  const times = venue?.grid?.times || [];
  const index = cellIndex(board?.cells);
  const cellAt = (day, time) => index.get(cellKey(day.date, time.hour, time.minute)) || emptyCell(day, time);
  return { days, times, rows: times.map((time) => ({ time, cells: days.map((day) => cellAt(day, time)) })), cellAt };
}

/** Gün kartındaki özet: maç / rakip bekleyen / adaylı / dolu sayıları ve durum dizisi. */
export function dayStats(grid, day) {
  const list = grid.times.map((t) => grid.cellAt(day, t));
  return {
    booked: list.filter((c) => c.status === "booked" || c.external_match || (c.is_past && hasMatch(c))).length,
    awaiting: list.filter((c) => c.status === "awaiting").length,
    pooled: list.filter((c) => c.status === "open" && c.pool_count > 0).length,
    closed: list.filter((c) => c.status === "closed").length,
    total: list.length,
    states: list.map(slotState),
  };
}

/** Tablo özetleri: üst şeritteki sayaçlar. */
export function boardTotals(board) {
  const list = board?.cells || [];
  const bookable = list.filter((c) => !c.is_past && c.is_bookable);
  return {
    pool: board?.pool_total ?? list.reduce((s, c) => s + (c.pool_count || 0), 0),
    stranded: board?.stranded_total ?? list.reduce((s, c) => s + (c.pool_stranded ? c.pool_count : 0), 0),
    booked: list.filter((c) => c.status === "booked").length,
    awaiting: list.filter((c) => c.status === "awaiting").length,
    open: bookable.filter((c) => c.status === "open").length,
    closed: list.filter((c) => c.status === "closed").length,
  };
}
export const slotBody = (cell) => ({ date: cell.date, hour: cell.hour, minute: cell.minute || 0 });
/** Havuzdaki adayın kısa kimliği. */
export const poolKey = (e) => e?.entry_id || (e?.request_public_id ? `req-${e.request_public_id}` : `team-${e?.team_id}`);

/** Bir gün için toplu işlem listeleri: boş (dolu yapılabilir), kapalı (açılabilir), sistemde maçlı. */
export function dayBulkSets(cells = []) {
  return {
    free: cells.filter((c) => canSelectCell(c) && c.status === "open" && !c.external_match),
    closed: cells.filter((c) => c.status === "closed"),
    external: cells.filter((c) => c.external_match && c.status !== "closed" && !isPastCell(c)),
  };
}

/* ------------------------------ iletişim ------------------------------ */

/** Telefonu rakamlara indirger; 0 ile başlıyorsa ülke kodu eklenir. */
export function normalizePhone(value) {
  const d = String(value || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("90") && d.length === 12) return d;
  if (d.startsWith("0") && d.length === 11) return `90${d.slice(1)}`;
  if (d.length === 10) return `90${d}`;
  return d;
}
export const telHref = (v) => { const d = normalizePhone(v); return d ? `tel:+${d}` : ""; };
export const whatsappHref = (v) => { const d = normalizePhone(v); return d ? `https://wa.me/${d}` : ""; };
export const mailHref = (v) => (v && String(v).includes("@") ? `mailto:${String(v).trim()}` : "");

/** Takımın iletişim satırı (yanıtlardaki teams sözlüğünden). */
export function contactOf(teams, teamId) {
  const card = teams?.[Number(teamId)] || teams?.[String(teamId)] || null;
  const phone = card?.manager?.phone || "";
  const whatsapp = card?.whatsapp || phone;
  const phone2 = card?.admin_contact?.phone2 || "";
  return {
    name: card?.manager?.name || "",
    phone, phone2, email: card?.manager?.email || "", whatsapp,
    tel: telHref(phone), tel2: telHref(phone2), wa: whatsappHref(whatsapp), mail: mailHref(card?.manager?.email),
    hasAny: Boolean(phone || whatsapp || card?.manager?.email),
    missingManager: !card?.manager,
  };
}

/* ------------------------------ zaman ------------------------------ */

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const dayDiff = (a, b) => Math.round((startOfDay(a) - startOfDay(b)) / 86400000);
const clock = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const SHORT_BY_JS = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];

export const toLocalInput = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const isoToLocalInput = (v) => { if (!v) return ""; const d = new Date(v); return Number.isNaN(d.getTime()) ? "" : toLocalInput(d); };
export const QUICK_DUES = [
  { key: "hour", label: "1 saat sonra", make: (now) => new Date(now.getTime() + 3600000) },
  { key: "evening", label: "Bu akşam 19:00", make: (now) => new Date(now.getFullYear(), now.getMonth(), now.getDate(), 19, 0) },
  { key: "tomorrow", label: "Yarın 11:00", make: (now) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 11, 0) },
];

/** Vade bilgisi: etiket, gecikme ve grup (overdue | today | tomorrow | week | later | none). */
export function dueInfo(value, now = new Date()) {
  if (!value) return { label: "", late: false, group: "none" };
  const due = new Date(value);
  if (Number.isNaN(due.getTime())) return { label: "", late: false, group: "none" };
  const diff = dayDiff(due, now);
  const late = due.getTime() < now.getTime();
  let label;
  if (diff === 0) label = `Bugün ${clock(due)}`;
  else if (diff === 1) label = `Yarın ${clock(due)}`;
  else if (diff === -1) label = `Dün ${clock(due)}`;
  else if (diff > 1 && diff < 7) label = `${SHORT_BY_JS[due.getDay()]} ${clock(due)}`;
  else label = `${pad(due.getDate())}.${pad(due.getMonth() + 1)} ${clock(due)}`;
  const group = late ? "overdue" : diff === 0 ? "today" : diff === 1 ? "tomorrow" : diff < 7 ? "week" : "later";
  return { label, late, group };
}

/** "az önce", "12 dk önce", "3 sa önce", "dün 14:00", "4 gün önce", "12.09.2026" */
export function timeAgo(value, now = new Date()) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const minutes = Math.round((now - d) / 60000);
  if (minutes < 1) return "az önce";
  if (minutes < 60) return `${minutes} dk önce`;
  const days = dayDiff(now, d);
  if (days === 0) return `${Math.round(minutes / 60)} sa önce`;
  if (days === 1) return `dün ${clock(d)}`;
  if (days < 7) return `${days} gün önce`;
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}
export const whenLabel = (daysUntil) => (daysUntil == null ? "" : daysUntil <= 0 ? "Bugün" : daysUntil === 1 ? "Yarın" : `${daysUntil} gün sonra`);
export const daysBetween = (a, b) => (a && b ? Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000) : null);

const norm = (v) => String(v || "").toLocaleLowerCase("tr-TR").trim();
/** Türkçe duyarlı arama: alanlardan biri sorguyu içeriyor mu? */
export const matchesQuery = (query, ...fields) => { const t = norm(query); return !t || fields.some((f) => norm(f).includes(t)); };

/* ------------------------------ kartlar ------------------------------ */

const sortMinutes = (o) => ((o.hour < 6 ? o.hour + 24 : o.hour) * 60) + (o.minute || 0);
/** Maç talebi seçeneklerinin kısa özeti: "6 seçenek · 2 saha · Pzt, Sal · 22:00–23:00" */
export function summarizeOptions(options = []) {
  const waiting = options.filter((o) => o.status === "waiting" && !o.is_past);
  if (!waiting.length) return "";
  const venues = new Set(waiting.map((o) => o.venue_name));
  const days = [...new Set(waiting.map((o) => o.day))].sort((a, b) => a - b).map((d) => DAY_SHORT[d]);
  const m = waiting.map(sortMinutes).sort((a, b) => a - b);
  const lab = (v) => timeLabel(Math.floor(v / 60) % 24, v % 60);
  const range = m[0] === m[m.length - 1] ? lab(m[0]) : `${lab(m[0])}–${lab(m[m.length - 1])}`;
  return [`${waiting.length} seçenek`, venues.size === 1 ? [...venues][0] : `${venues.size} saha`, days.join(", "), range].join(" · ");
}

/** Seçenekleri gün → saha grubuna ayırır. */
export function groupOptions(options = []) {
  const map = new Map();
  options.forEach((o) => {
    if (!map.has(o.date)) map.set(o.date, { date: o.date, day: o.day, venues: new Map() });
    const g = map.get(o.date);
    if (!g.venues.has(o.venue_name)) g.venues.set(o.venue_name, []);
    g.venues.get(o.venue_name).push(o);
  });
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date)).map((g) => ({ ...g, venues: [...g.venues.entries()] }));
}

/** Saat seçimini sahaya göre özetler: saha → gün → saatler. */
export function summarizeSelection(options = [], venues = []) {
  const byVenue = new Map();
  options.forEach((o) => {
    if (!byVenue.has(o.venueId)) byVenue.set(o.venueId, new Map());
    const days = byVenue.get(o.venueId);
    if (!days.has(o.date)) days.set(o.date, []);
    days.get(o.date).push(o);
  });
  return [...byVenue.entries()].map(([venueId, days]) => ({
    venueId,
    name: venues.find((v) => v.public_id === venueId)?.name || "Saha",
    days: [...days.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, list]) => ({ date, items: list.sort((a, b) => a.hour * 60 + (a.minute || 0) - (b.hour * 60 + (b.minute || 0))) })),
  }));
}

/** Sistem önerisini karta çevirir (web ile aynı kural). */
export function suggestionToTask(item) {
  const place = item.venue_public_id && item.date ? { venueId: item.venue_public_id, date: item.date, hour: item.hour, minute: item.minute || 0 } : null;
  const mainTeam = item.team_id || item.holder?.team_id || item.pool?.[0]?.team_id || item.suggestions?.[0]?.team_id || null;
  const kind = ["awaiting", "ready_to_pair", "find_opponent"].includes(item.type) && mainTeam ? "match_request" : ["idle_team", "open_slot"].includes(item.type) && mainTeam ? "contact" : "personal";
  return {
    kind,
    title: item.title,
    note: [item.subtitle, item.label ? `${item.venue_name} · ${item.label}` : ""].filter(Boolean).join(" — ") || null,
    teamId: mainTeam,
    priority: URGENT.has(item.type) ? "high" : "normal",
    sourceKey: item.id,
    ...(kind === "match_request" && place ? { options: [place] } : {}),
    ...(kind === "contact" && place ? { venueId: place.venueId, date: place.date, hour: place.hour, minute: place.minute } : {}),
  };
}

/** Havuz satırı → bağlı maç talebi kartı. */
export function cardIndexOf(cards = []) {
  const byEntry = new Map();
  const byRequest = new Map();
  cards.forEach((c) => {
    if (c.kind !== "match_request") return;
    (c.options || []).forEach((o) => o.entry_id && byEntry.set(o.entry_id, c));
    (c.request_ids || []).forEach((r) => byRequest.set(Number(r), c));
    if (c.request_id) byRequest.set(Number(c.request_id), c);
  });
  return (entry) => (entry?.entry_id && byEntry.get(entry.entry_id)) || (entry?.request_id && byRequest.get(Number(entry.request_id))) || null;
}

/** Maç kurucuda rakip önerileri: aynı saati / günü isteyen açık talepler. */
export function opponentSuggestions(cards = [], slot, { homeId, excludeTaskId } = {}) {
  if (!slot?.venueId || !slot?.date || slot.hour === "" || slot.hour == null) return [];
  const same = (o) => o.venue_public_id === slot.venueId && o.date === slot.date && Number(o.hour) === Number(slot.hour) && Number(o.minute || 0) === Number(slot.minute || 0);
  const seen = new Set([Number(homeId)]);
  const out = [];
  cards.filter((c) => c.kind === "match_request" && c.status === "open" && c.team_id && c.task_id !== excludeTaskId).forEach((c) => {
    if (seen.has(Number(c.team_id))) return;
    const exact = (c.options || []).some((o) => o.status === "waiting" && same(o));
    const sameDay = (c.options || []).some((o) => o.status === "waiting" && o.date === slot.date);
    if (!exact && !sameDay) return;
    seen.add(Number(c.team_id));
    out.push({ team_id: c.team_id, team_name: c.team_name, exact });
  });
  return out.sort((a, b) => Number(b.exact) - Number(a.exact) || String(a.team_name).localeCompare(String(b.team_name), "tr"));
}

/* ------------------------------ takım listeleri ------------------------------ */

export const TEAM_LISTS = [
  { key: "all", label: "Tüm takımlar", icon: "users", hint: "Kapsamdaki bütün takımlar; pasif takımlar etiketle gösterilir." },
  { key: "new_teams", label: "Yeni kayıtlar", icon: "sparkles", hint: "Son 45 günde kaydolan takımlar: ilk maçlarını ayarlamak için arayın." },
  { key: "recent_contacts", label: "Son görüşülenler", icon: "phone", hint: "En son görüşülen takımlar üstte: arama / not kayıtları ve görüşme kartları." },
  { key: "most_matches", label: "Çok maç alanlar", icon: "trophy", hint: "En çok maç yapan takımlar (tüm zamanlar, sonra son 6 ay): boş saatleri doldurmak için ilk adaylar." },
  { key: "declining", label: "Azalanlar", icon: "trend", hint: "Önceden sık oynayıp son iki ayda seyrekleşen takımlar." },
  { key: "by_day", label: "Güne göre", icon: "calendar", hint: "Seçilen gün sık oynayan takımlar: o günün boş saatleri için ilk adaylar." },
  { key: "flexible", label: "Esnek", icon: "swap", hint: "En çok farklı gün ve saatte oynayan, müsaitliği geniş takımlar." },
  { key: "idle", label: "Uzun süredir yok", icon: "pause", hint: "Düzenli oynayıp 14 günden uzun süredir maç yapmayan takımlar." },
];
export const TEAM_SORTS = [
  { key: "default", label: "Liste sırası" },
  { key: "recent", label: "Son görüşülenler önce" },
  { key: "stale", label: "En uzun süredir görüşülmeyen" },
  { key: "name", label: "Ada göre (A–Z)" },
  { key: "newest", label: "Yeni kayıtlar önce" },
  { key: "played", label: "Son 6 ayda en çok maç" },
  { key: "total", label: "Toplam maça göre" },
];

/** "Çok maç alanlar": tüm takımlar listesinden, toplam maça (yoksa son 6 aydaki maça) göre. */
export const mostMatches = (all = [], limit = 100) => all.filter((r) => (Number(r.total_matches) > 0 || Number(r.played) > 0) && !r.inactive)
  .sort((a, b) => Number(b.total_matches || 0) - Number(a.total_matches || 0) || Number(b.played || 0) - Number(a.played || 0) || String(a.team_name).localeCompare(String(b.team_name), "tr"))
  .slice(0, limit)
  .map((r) => ({ ...r, metric: [r.total_matches ? `Toplam ${r.total_matches} maç` : null, r.played ? `son 6 ayda ${r.played}` : null].filter(Boolean).join(" · ") }));

/** Seçilen listenin satırları (gün listesi ve türetilen liste dahil). */
export function teamListRows(lists = {}, key, day) {
  if (key === "by_day") return lists.by_day?.[day] || [];
  if (key === "most_matches") return mostMatches(lists.all || []);
  return lists[key] || [];
}

const stamp = (v) => (v ? new Date(v).getTime() || 0 : 0);
export function sortTeamRows(rows = [], sort) {
  const list = [...rows];
  const byName = (a, b) => String(a.team_name || "").localeCompare(String(b.team_name || ""), "tr");
  if (sort === "recent") return list.sort((a, b) => stamp(b.last_contact_at) - stamp(a.last_contact_at) || byName(a, b));
  if (sort === "stale") return list.sort((a, b) => stamp(a.last_contact_at) - stamp(b.last_contact_at) || byName(a, b));
  if (sort === "name") return list.sort(byName);
  if (sort === "newest") return list.sort((a, b) => stamp(b.created_at) - stamp(a.created_at) || byName(a, b));
  if (sort === "total") return list.sort((a, b) => Number(b.total_matches || 0) - Number(a.total_matches || 0) || byName(a, b));
  if (sort === "played") return list.sort((a, b) => Number(b.played || 0) - Number(a.played || 0) || byName(a, b));
  return list;
}

/** Lig / sezon seçenekleri: Tümü, her lig (tüm sezonlar) ve lig · sezon. */
export function scopeOptions(leagues = [], seasons = []) {
  const out = [{ value: "", label: "Tümü" }];
  const byLeague = new Map();
  seasons.forEach((s) => { const k = s.league_id ? String(s.league_id) : `name:${s.league_name || ""}`; if (!byLeague.has(k)) byLeague.set(k, []); byLeague.get(k).push(s); });
  const seen = new Set();
  leagues.forEach((l) => {
    seen.add(String(l.id));
    out.push({ value: `l:${l.id}`, label: `${l.name} (tüm sezonlar)` });
    (byLeague.get(String(l.id)) || []).sort((a, b) => Number(b.id) - Number(a.id)).forEach((s) => out.push({ value: `s:${s.id}`, label: `${l.name} · ${s.name}`, indent: true }));
  });
  byLeague.forEach((items, k) => { if (!seen.has(k)) items.forEach((s) => out.push({ value: `s:${s.id}`, label: [s.league_name, s.name].filter(Boolean).join(" · ") })); });
  return out;
}
export const scopeParams = (v = "") => (v.startsWith("l:") ? { leagueId: v.slice(2) } : v.startsWith("s:") ? { seasonId: v.slice(2) } : {});


/* ------------------------------ hafta / maç ekranları ------------------------------ */

const MONTHS = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
const shortDay = (iso) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;
/** "3 – 9 Kas" ya da "28 Eki – 3 Kas" */
export function weekRangeLabel(start) {
  const end = addDays(start, 6);
  return start.slice(5, 7) === end.slice(5, 7) ? `${Number(start.slice(8, 10))} – ${shortDay(end)}` : `${shortDay(start)} – ${shortDay(end)}`;
}

/** Sitede maç yönetim ekranları. */
export const MATCH_SCREENS = [
  { key: "bilgiler", label: "Maç Bilgileri", path: (id) => `/editor/maclar/${id}/oncesi` },
  { key: "kadro", label: "Kadro", path: (id) => `/editor/maclar/${id}/kadro-gir` },
  { key: "reji", label: "Reji Paneli", path: (id) => `/editor/maclar/${id}/canli-akis` },
  { key: "mac-sonu", label: "Maç Sonu", path: (id) => `/editor/maclar/${id}/mac-sonu` },
];
/** Sitedeki maç durumu (Maçlar ekranıyla aynı etiketler). */
export const MATCH_STATUS_LABELS = { taslak: "Taslak", zamanlandi: "Zamanlandı", canli: "Canlı", yayinlanmis: "Tamamlandı" };
export const matchStatusLabel = (v) => MATCH_STATUS_LABELS[String(v || "").toLowerCase()] || (v ? String(v) : "Durum yok");
export const matchSitePath = (id) => `/editor/maclar/${id}/oncesi`;

/* ------------------------------ görüşme kaydı ------------------------------ */

const localToIso = (v) => { if (!v) return null; const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d.toISOString(); };

/** Görüşme formunun eksiği: "" | hata metni. v: { outcome, note, at } */
export function callError({ outcome, note, at } = {}) {
  if (!outcome) return "Görüşme etiketini seçin.";
  const meta = outcomeMeta(outcome);
  if (meta.date === "required" && !at) return "Tekrar arama zamanını seçin.";
  if (outcome === "note" && !String(note || "").trim()) return "Not yazın.";
  return "";
}

/** POST /admin/calls gövdesi. place: { venueId, date, hour, minute } (isteğe bağlı) */
export function callCreatePayload(teamId, { outcome, note, at } = {}, place = null) {
  const meta = outcomeMeta(outcome);
  const callbackAt = meta.date ? localToIso(at) : null;
  return {
    teamId: Number(teamId),
    outcome,
    ...(String(note || "").trim() ? { note: String(note).trim() } : {}),
    ...(callbackAt ? { callbackAt } : {}),
    ...(place?.venueId && place?.date ? { venueId: place.venueId, date: place.date, hour: Number(place.hour), minute: Number(place.minute || 0) } : {}),
  };
}

/**
 * PATCH /admin/calls/:id gövdesi: yalnız değişen alanlar (etiket, not,
 * tekrar arama zamanı). Değişiklik yoksa null; eksik varsa { error }.
 * draft: { outcome, note, at } (at: datetime-local değeri)
 */
export function callEditPayload(call, draft = {}) {
  const error = callError({ outcome: draft.outcome, note: draft.note, at: draft.at });
  if (error) return { error };
  const out = {};
  if (draft.outcome !== call.outcome) out.outcome = draft.outcome;
  const note = String(draft.note || "").trim();
  if (note !== String(call.note || "").trim()) out.note = note;
  const meta = outcomeMeta(draft.outcome);
  const before = isoToLocalInput(call.callback_at);
  const after = meta.date ? draft.at || "" : "";
  if (after !== before && (meta.date || before)) out.callback_at = after ? localToIso(after) : null;
  return Object.keys(out).length ? out : null;
}

/* ------------------------------ Talepler (gelen kutusu) ------------------------------ */

export const INBOX_SOURCES = {
  app: { label: "Uygulama", icon: "zap", tone: "tool", hint: "Takım uygulamadan talep gönderdi" },
  phone: { label: "Telefon", icon: "phone", tone: "blue", hint: "Telefonda / elle açıldı" },
  pool: { label: "Saat havuzu", icon: "layers", tone: "green", hint: "Bir saatin havuzunda aday olarak bekliyor" },
  callback: { label: "Geri arama", icon: "rotate", tone: "amber", hint: "Tekrar aranacak / haber verecek" },
  suggestion: { label: "Öneri", icon: "sparkles", tone: "", hint: "Sistem önerisinden açıldı" },
  manual: { label: "Elle", icon: "note", tone: "", hint: "Görev / not" },
};
export const INBOX_GROUPS = [
  { key: "new", label: "Yeni", hint: "Henüz görüşülmedi", icon: "inbox" },
  { key: "talking", label: "Görüşülüyor / haber bekleniyor", hint: "Görüşme başladı, karar bekleniyor", icon: "message" },
  { key: "followup", label: "Geri dönülecek", hint: "Tekrar aranacak, geri dönecek ya da düşünüp haber verecek", icon: "clock" },
  { key: "ready", label: "Eşleşmeye hazır", hint: "İstediği saatte rakip ya da aday var", icon: "users" },
  { key: "done", label: "Sonuçlanan", hint: "Maç ayarlandı ya da olumsuz sonuçlandı", icon: "check" },
];
export const AVAIL = {
  opponent: { label: "Rakip bekliyor", tone: "awaiting" },
  candidates: { label: "Aday var", tone: "pooled" },
  free: { label: "Boş", tone: "open" },
  taken: { label: "Dolu", tone: "closed" },
  matched: { label: "Maç alındı", tone: "booked" },
  past: { label: "Geçti", tone: "past" },
};
export const INBOX_SORTS = [
  { key: "newest", label: "En yeni" },
  { key: "due", label: "Vadesi yakın önce" },
  { key: "oldest", label: "En uzun bekleyen" },
];

/** Kartın kaynağı (Uygulama / Telefon / Havuz / Geri arama / Öneri / Elle). */
export function sourceOf(card) {
  if (!card) return "phone";
  if (card.from_app || card.source === "request") return "app";
  if (card.source === "callback") return "callback";
  if (card.source === "pool") return "pool";
  if (card.source === "suggestion") return "suggestion";
  if (card.kind === "personal") return "manual";
  return "phone";
}

/** Ne istiyor? { key, label } */
export function wantOf(card) {
  if (!card) return { key: "match", label: "Maç istiyor" };
  if (card.kind === "personal") return { key: "task", label: card.title || "Görev / not" };
  if (card.kind === "contact") return { key: "contact", label: card.stage === "waiting_us" ? "Aranmayı bekliyor" : "Görüşme / iletişim" };
  if (card.opponent_team_id) return { key: "specific", label: `${card.opponent_name || "Belirli rakip"} ile maç` };
  return { key: "match", label: "Maç istiyor · rakip aranıyor" };
}

const cellRef = (o) => `${o.venue_public_id || o.venueId || o.venue_id}|${o.date}|${Number(o.hour)}|${Number(o.minute || 0)}`;
/** Havuzdaki bekleyenler: saat → [takım] */
export function poolIndexOf(waiting = [], cards = []) {
  const map = new Map();
  const add = (o, team_id, team_name) => {
    if (!team_id) return;
    const k = cellRef(o);
    if (!map.has(k)) map.set(k, []);
    if (!map.get(k).some((t) => t.team_id === Number(team_id))) map.get(k).push({ team_id: Number(team_id), team_name });
  };
  waiting.forEach((e) => add(e, e.team_id, e.team_name));
  // Açık maç taleplerinin bekleyen saatleri de aynı saati isteyen aday sayılır.
  cards.filter((c) => c.status === "open" && c.kind === "match_request").forEach((c) => (c.options || []).filter((o) => o.status === "waiting" && !o.is_past).forEach((o) => add(o, c.team_id, c.team_name)));
  return map;
}

/** Bir seçeneğin uygunluğu: { avail, others: [takım] } */
export function optionAvailability(option, poolIndex = new Map(), teamId = null) {
  const others = (poolIndex.get(cellRef(option)) || []).filter((t) => Number(t.team_id) !== Number(teamId));
  if (option.status === "matched") return { avail: "matched", others };
  if (option.is_past) return { avail: "past", others };
  if (option.slot_status === "booked" || option.slot_status === "closed") return { avail: "taken", others };
  if (option.slot_status === "awaiting") return { avail: "opponent", others };
  if (others.length) return { avail: "candidates", others };
  return { avail: "free", others };
}

const nightMin = (h, m = 0) => ((Number(h) < 6 ? Number(h) + 24 : Number(h)) * 60) + Number(m || 0);
/** Seçeneklerden gün / saat / saha çipleri. */
export function optionChips(options = []) {
  const days = [...new Set(options.map((o) => Number(o.day || dayOfIso(o.date))))].sort((a, b) => a - b);
  const times = [...new Map(options.map((o) => [timeLabel(o.hour, o.minute), nightMin(o.hour, o.minute)])).entries()].sort((a, b) => a[1] - b[1]).map(([l]) => l);
  const venues = [...new Set(options.map((o) => o.venue_name).filter(Boolean))];
  const dates = [...new Set(options.map((o) => o.date))].sort();
  return { days, times, venues, dates };
}

const stampOf = (v) => (v ? new Date(v).getTime() || 0 : 0);

/**
 * Bütün açık talepleri tek listede toplar: kartlar (uygulama, telefon, geri
 * arama, öneri, görev) ve karta bağlı olmayan havuz adayları.
 * Döner: [{ key, type: card|pool, card, entry, source, want, team_id, team_name,
 *   city, options[{...o, avail, others}], chips, lastCall, due, group, created_at }]
 */
export function buildInbox({ cards = [], waiting = [], calls = [], teamCities = {}, now = new Date() } = {}) {
  const poolIndex = poolIndexOf(waiting, cards);
  const lastCallOf = new Map();
  [...calls].sort((a, b) => stampOf(b.created_at) - stampOf(a.created_at)).forEach((c) => { if (!lastCallOf.has(Number(c.team_id))) lastCallOf.set(Number(c.team_id), c); });
  const cardOf = cardIndexOf(cards);
  const rows = [];
  cards.forEach((card) => {
    if (card.status !== "open" && card.status !== "done") return;
    const base = (card.options || []).filter((o) => o.status !== "removed");
    let options = card.status === "open" ? base.filter((o) => o.status === "waiting" || o.status === "matched") : base;
    if (!options.length && card.venue_public_id && card.date) options = [{ venue_public_id: card.venue_public_id, venue_name: card.venue_name, date: card.date, day: dayOfIso(card.date), hour: card.hour, minute: card.minute || 0, label: card.slot_label, slot_status: "", is_past: card.date < localIso(now), status: card.stage === "matched" ? "matched" : "waiting", source: "card" }];
    const opts = options.map((o) => ({ ...o, ...optionAvailability(o, poolIndex, card.team_id) }));
    const lastCall = card.team_id ? lastCallOf.get(Number(card.team_id)) || null : null;
    rows.push(inboxRow({ type: "card", key: `c-${card.task_id}`, card, source: sourceOf(card), want: wantOf(card), options: opts, lastCall, teamCities, now }));
  });
  waiting.forEach((e) => {
    if (cardOf(e)) return;
    const opt = { venue_public_id: e.venue_public_id, venue_name: e.venue_name, date: e.date, day: e.day || dayOfIso(e.date), hour: e.hour, minute: e.minute || 0, label: e.label, slot_status: e.slot_status, is_past: false, status: "waiting", source: e.source === "request" ? "request" : "pool", entry_id: e.entry_id };
    const lastCall = lastCallOf.get(Number(e.team_id)) || null;
    rows.push(inboxRow({ type: "pool", key: `p-${poolKey(e)}`, entry: e, source: e.source === "request" ? "app" : "pool", want: { key: "match", label: "Bu saatte maç istiyor" }, options: [{ ...opt, ...optionAvailability(opt, poolIndex, e.team_id) }], lastCall, teamCities, now }));
  });
  return rows;
}

function inboxRow({ type, key, card = null, entry = null, source, want, options, lastCall, teamCities, now }) {
  const teamId = card ? card.team_id : entry.team_id;
  const created = card ? card.created_at : entry.created_at;
  const open = card ? card.status === "open" : true;
  const call = lastCall && (!created || stampOf(lastCall.created_at) >= stampOf(created) - 60000) ? lastCall : null;
  const due = dueInfo(card?.due_at || (call && FOLLOWUP_OUTCOMES.includes(call.outcome) ? call.callback_at : null), now);
  const live = options.filter((o) => !["past", "taken", "matched"].includes(o.avail));
  const ready = live.some((o) => o.avail === "opponent" || o.avail === "candidates");
  let group;
  if (!open) group = "done";
  else if (ready && (!card || card.kind === "match_request")) group = "ready";
  else if (card?.due_at || (call && FOLLOWUP_OUTCOMES.includes(call.outcome)) || source === "callback") group = "followup";
  else if (call || (card && ["waiting_them", "waiting_us"].includes(card.stage))) group = "talking";
  else group = "new";
  const shown = open ? options.filter((o) => o.avail !== "past") : options;
  return {
    key, type, card, entry, source, want, group,
    team_id: teamId ? Number(teamId) : null,
    team_name: card ? card.team_name || card.title : entry.team_name,
    team_logo: card ? card.team_logo : entry.team_logo,
    city: teamId ? teamCities[Number(teamId)] || "" : "",
    title: card?.title || "",
    note: card ? card.note : entry.request_note || entry.note || "",
    options: shown,
    chips: optionChips(shown),
    best: live.find((o) => o.avail === "opponent") || live.find((o) => o.avail === "candidates") || live[0] || null,
    lastCall: call || lastCall || null,
    due,
    priority: card?.priority === "high" || Boolean(entry?.priority),
    stranded: Boolean(entry?.stranded) || options.some((o) => o.avail === "taken" && o.status === "waiting" && open),
    created_at: created || null,
    stage: card?.stage || "open",
    stage_label: card ? CARD_STAGES[card.stage]?.label || card.stage_label || "" : "Havuzda",
  };
}

/** Talep süzgeci. f: { source, venue (ad), day, hourFrom, hourTo, group, q, kind } */
export function filterInbox(rows = [], f = {}) {
  const from = f.hourFrom === "" || f.hourFrom == null ? null : nightMin(f.hourFrom);
  const to = f.hourTo === "" || f.hourTo == null ? null : nightMin(f.hourTo);
  return rows.filter((r) => (!f.source || r.source === f.source)
    && (!f.group || r.group === f.group)
    && (!f.kind || (f.kind === "match" ? ["match", "specific"].includes(r.want.key) : r.want.key === f.kind))
    && (!f.venue || r.chips.venues.includes(f.venue))
    && (!f.day || r.chips.days.includes(Number(f.day)))
    && (from == null && to == null ? true : r.options.some((o) => { const m = nightMin(o.hour, o.minute); return (from == null || m >= from) && (to == null || m <= to); }))
    && matchesQuery(f.q, r.team_name, r.title, r.note, r.city, r.lastCall?.note, ...r.chips.venues));
}

export function sortInbox(rows = [], sort = "newest") {
  const list = [...rows];
  const byNew = (a, b) => stampOf(b.created_at) - stampOf(a.created_at);
  if (sort === "oldest") return list.sort((a, b) => stampOf(a.created_at) - stampOf(b.created_at));
  if (sort === "due") {
    const d = (r) => (r.card?.due_at ? stampOf(r.card.due_at) : r.due.label ? stampOf(r.lastCall?.callback_at) : Number.POSITIVE_INFINITY);
    return list.sort((a, b) => d(a) - d(b) || byNew(a, b));
  }
  return list.sort((a, b) => Number(b.priority) - Number(a.priority) || byNew(a, b));
}

/** Gruplara ayırır (boş gruplar da döner; Sonuçlanan en sonda). */
export function groupInbox(rows = []) {
  return INBOX_GROUPS.map((g) => ({ ...g, items: rows.filter((r) => r.group === g.key) }));
}

/** Üst şerit: yeni talep, bugün aranacak, bekleyen aday, bu hafta boş saat / maç. */
export function deskKpis({ rows = [], waiting = [], boards = [], now = new Date() } = {}) {
  const weeks = boards.filter(Boolean).map((b) => weekSummary(b));
  return {
    fresh: rows.filter((r) => r.group === "new").length,
    due: rows.filter((r) => r.group !== "done" && (r.due.group === "overdue" || r.due.group === "today")).length,
    overdue: rows.filter((r) => r.group !== "done" && r.due.late).length,
    candidates: waiting.length,
    free: weeks.reduce((s, w) => s + w.free, 0),
    freePrime: weeks.reduce((s, w) => s + w.freePrime, 0),
    matches: weeks.reduce((s, w) => s + w.matches, 0),
    ready: rows.filter((r) => r.group === "ready").length,
    now,
  };
}

/* ------------------------------ Program (hafta panosu) ------------------------------ */

/** "Kartallar FK" → "KF", "Şimşekler" → "Şİ" */
export function initials(name = "") {
  const words = String(name).trim().split(/\s+/).filter((w) => !/^(fk|sk|spor|gençlik)$/i.test(w) || String(name).trim().split(/\s+/).length === 1);
  const pick = words.length > 1 ? words[0][0] + words[1][0] : (words[0] || "").slice(0, 2);
  return pick.toLocaleUpperCase("tr-TR");
}

/**
 * Hafta panosundaki hücrenin görünümü: { state, tone, label, main, sub, chips, count, title }.
 * Durumlar: boş, müsait takım var, aday var (sayı + baş harfler), rakip
 * bekleniyor, maç alındı (takım adları), sistemde maç, dolu, dolu + bekleyen, oynandı, geçti.
 */
export function cellView(cell) {
  const state = slotState(cell);
  const meta = SLOT_STATES[state];
  const pool = cell?.pool || [];
  const fx = cell?.fixture || cell?.external_match;
  const out = { state, tone: meta.tone, label: meta.label, main: "", sub: "", chips: [], count: 0 };
  if (state === "played" || state === "external") {
    out.main = fx ? fx.home_name : cell.home?.team_name || "";
    out.sub = fx ? fx.away_name : cell.away?.team_name || "";
    out.score = state === "played" ? scoreText(fx) : "";
  } else if (state === "booked" || state === "stranded") {
    out.main = cell.home?.team_name || fx?.home_name || "";
    out.sub = cell.away?.team_name || fx?.away_name || "";
    if (state === "stranded") out.count = cell.pool_count || pool.length;
    if (!out.main && cell.status === "closed") { out.main = "Dolu"; out.sub = cell.note || ""; }
  } else if (state === "awaiting") {
    out.main = cell.home?.team_name || "";
    out.sub = pool.length ? `rakip aranıyor · ${pool.length} aday` : "rakip aranıyor";
    out.count = pool.length;
  } else if (state === "pooled") {
    out.count = cell.pool_count || pool.length;
    out.chips = pool.slice(0, 3).map((e) => initials(e.team_name));
    out.main = `${out.count} aday`;
    out.sub = pool.slice(0, 2).map((e) => e.team_name).join(", ");
  } else if (state === "suggested") {
    out.count = (cell.available || []).length;
    out.main = `${out.count} müsait`;
  } else if (state === "closed") {
    out.main = "Dolu";
    out.sub = cell.note || "";
  } else if (state === "open") out.main = "Boş";
  out.title = `${cellTitle(cell)} · ${meta.label}${slotSummary(cell) && state !== "open" ? ` · ${slotSummary(cell)}` : ""}`;
  return out;
}

const isPrime = (c, from, to) => { const m = nightMin(c.hour, c.minute); return m >= from * 60 && m <= to * 60; };
/** Haftanın özeti: maç, boş saat (prime-time 20:00–23:00), bekleyen aday, doluluk %. */
export function weekSummary(board, { primeFrom = 20, primeTo = 23 } = {}) {
  const grid = buildWeekGrid(board);
  const cells = grid.rows.flatMap((r) => r.cells);
  const live = cells.filter((c) => !isPastCell(c));
  const used = (c) => ["booked", "closed", "external", "stranded"].includes(slotState(c)) || c.status === "awaiting";
  const free = live.filter((c) => ["open", "suggested", "pooled"].includes(slotState(c)));
  return {
    matches: cells.filter((c) => c.status === "booked" || c.external_match || (isPastCell(c) && hasMatch(c))).length,
    free: free.length,
    freePrime: free.filter((c) => isPrime(c, primeFrom, primeTo)).length,
    candidates: cells.reduce((s, c) => s + (isPastCell(c) ? 0 : c.pool_count || 0), 0),
    awaiting: live.filter((c) => c.status === "awaiting").length,
    occupancy: cells.length ? Math.round((cells.filter(used).length / cells.length) * 100) : 0,
    total: cells.length,
  };
}

/** Çok sahalı gün görünümü: saatler (bütün sahaların birleşimi) × sahalar. */
export function dayAcross(boards = [], date) {
  const times = new Map();
  const cols = boards.filter(Boolean).map((b) => {
    const grid = buildWeekGrid(b);
    const day = grid.days.find((d) => d.date === date) || null;
    const cells = new Map();
    if (day) grid.times.forEach((t) => { times.set(timeLabel(t.hour, t.minute), t); cells.set(timeLabel(t.hour, t.minute), grid.cellAt(day, t)); });
    return { venue: b.venue, day, cells };
  });
  const sorted = [...times.entries()].sort((a, b) => nightMin(a[1].hour, a[1].minute) - nightMin(b[1].hour, b[1].minute)).map(([label, t]) => ({ label, hour: t.hour, minute: t.minute || 0 }));
  return { times: sorted, cols };
}

/* ------------------------------ talep ayrıntısı: mini hafta tablosu ------------------------------ */

/** Seçeneklerin düştüğü haftalar (Pazartesi), sıralı. */
export const optionWeeks = (options = []) => [...new Set(options.filter((o) => isoValid(o.date)).map((o) => weekStartOf(o.date)))].sort();

/**
 * Talep ayrıntısındaki saha başına mini hafta tablosu: günler (sahanın açık
 * günleri) × saatler; istenen hücreler işaretli, hücre durumu panodan.
 * Döner: { days, times, rows: [{ time, cells: [{ date, hour, minute, option, state, past }] }], requested }
 */
export function requestGrid({ venue, board = null, options = [], weekStart, today = localIso() }) {
  const open = Array.isArray(venue?.active_days) && venue.active_days.length ? venue.active_days.map(Number) : [1, 2, 3, 4, 5, 6, 7];
  const days = board?.venue?.grid?.days?.length && board.week_start === weekStart ? board.venue.grid.days
    : Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).filter((d) => open.includes(dayOfIso(d))).map((d) => ({ date: d, day: dayOfIso(d), is_today: d === today, is_past: d < today }));
  const times = board?.venue?.grid?.times?.length ? board.venue.grid.times : venue?.grid?.times || [];
  const mine = options.filter((o) => (o.venue_public_id || o.venueId) === venue?.public_id);
  const byCell = new Map(mine.map((o) => [cellKey(o.date, o.hour, o.minute), o]));
  const cells = board && board.week_start === weekStart ? cellIndex(board.cells) : new Map();
  // Tablo saatleri dışında kalan istenen saatler de satır olur.
  const all = [...times];
  mine.filter((o) => o.date >= weekStart && o.date <= addDays(weekStart, 6)).forEach((o) => { if (!all.some((t) => Number(t.hour) === Number(o.hour) && Number(t.minute || 0) === Number(o.minute || 0))) all.push({ hour: Number(o.hour), minute: Number(o.minute || 0) }); });
  all.sort((a, b) => nightMin(a.hour, a.minute) - nightMin(b.hour, b.minute));
  const rows = all.map((t) => ({
    time: t,
    cells: days.map((d) => {
      const option = byCell.get(cellKey(d.date, t.hour, t.minute)) || null;
      const cell = cells.get(cellKey(d.date, t.hour, t.minute));
      return { date: d.date, day: d.day, hour: t.hour, minute: t.minute || 0, option, cell: cell || null, state: cell ? slotState(cell) : d.is_past || d.date < today ? "past" : "open", past: Boolean(d.is_past || d.date < today) };
    }),
  }));
  return { days, times: all, rows, requested: mine.filter((o) => o.date >= weekStart && o.date <= addDays(weekStart, 6)).length };
}

/* ------------------------------ takım profili ------------------------------ */

/** "2026 Güz · Ankara Süper Lig · 14 maç" */
export const topSeasonText = (top) => (top ? [top.name, top.league, top.played != null ? `${top.played} maç` : null].filter(Boolean).join(" · ") : "");

/** Takım satırı / kartı için özet: il, toplam maç, sezon sayısı, en çok oynadığı sezon, son maç. */
export function teamProfile(row = {}) {
  const total = Number(row.total_matches || 0);
  return {
    city: row.registered_city || row.city || "",
    total,
    totalText: total ? `${total} maç` : "Maç yok",
    seasons: Number(row.season_count || 0),
    seasonsText: row.season_count ? `${row.season_count} sezon` : "",
    top: topSeasonText(row.top_season),
    topShort: row.top_season ? [row.top_season.name, row.top_season.league].filter(Boolean).join(" · ") : "",
    lastMatch: row.days_since == null ? (row.next_date ? "" : "Son 6 ayda maç yok") : row.days_since === 0 ? "Bugün oynadı" : `Son maç ${row.days_since} gün önce`,
    next: row.next_date ? `Sıradaki maç ${dayLabel(row.next_date)}` : "",
    idle: row.days_since != null && row.days_since >= 21,
  };
}

/** Yeni kayıt satırı: "Ankara · 5 gün önce kayıt oldu" */
export function registeredText(row = {}, now = new Date()) {
  const city = row.registered_city || row.city || "";
  const at = row.created_at ? new Date(row.created_at) : null;
  const days = at && !Number.isNaN(at.getTime()) ? Math.max(0, dayDiff(now, at)) : null;
  const when = days == null ? "" : days === 0 ? "bugün kayıt oldu" : `${days} gün önce kayıt oldu`;
  return [city || "İl bilinmiyor", when].filter(Boolean).join(" · ");
}

/** Takım listesi süzgeci: il ve arama. */
export const filterTeamRows = (rows = [], { city = "", q = "" } = {}) => rows.filter((r) => (!city || (r.registered_city || r.city || "") === city) && matchesQuery(q, r.team_name, r.metric, r.summary, r.city, r.top_season?.name, r.top_season?.league));
/** Takım listelerindeki iller (sıralı). */
export const teamCitiesOf = (rows = []) => [...new Set(rows.map((r) => r.registered_city || r.city).filter(Boolean))].sort((a, b) => a.localeCompare(b, "tr"));
