// Saha ve maç planlama (çağrı merkezi) için saf yardımcılar.
//
// Sitedeki /editor/sahalar ekranının (MatchVenues + venues/*) kurallarının
// masaüstü karşılığı: hafta tablosu, saat anahtarları, hücre durumu, havuz ve
// kart özetleri, iletişim bağlantıları, takım listeleri. Projeler → Saha ve
// maç sekmesinin maç listesi (haftalara gruplama, süzgeç) ve maç ücretlerinin
// önizlemesi de buradadır. Bileşenler yalnızca çizer.

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

export const CALL_OUTCOMES = [
  { value: "interested", label: "Oynamak istiyor", icon: "check", tone: "green" },
  { value: "declined", label: "Oynamayacak", icon: "x", tone: "red" },
  { value: "no_answer", label: "Ulaşılamadı", icon: "phone", tone: "amber" },
  { value: "callback", label: "Tekrar ara", icon: "clock", tone: "blue" },
  { value: "messaged", label: "Mesaj attım", icon: "message", tone: "tool" },
  { value: "note", label: "Not", icon: "note", tone: "" },
];

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
export const BOARD_COLUMNS = [
  { key: "open", label: "Açık talepler", icon: "inbox" },
  { key: "waiting", label: "Bekleme durumu", icon: "clock" },
  { key: "done", label: "Tamamlandı", icon: "check" },
];
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

/** Liste görünümündeki işaret kutusunun sonraki adımı: { stage } | { focus: "result" }. */
export function nextStep(card) {
  const col = columnOf(card);
  if (col === "open") return { stage: "waiting_them" };
  if (col === "waiting") return card.kind === "personal" ? { stage: "resolved" } : { focus: "result" };
  return { stage: "open" };
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

export const FOCUS_FILTERS = {
  waiting_them: { label: "Haber bekleniyor", test: (c) => c.stage === "waiting_them" },
  waiting_us: { label: "Haber verilecek", test: (c) => c.stage === "waiting_us" },
  late: { label: "Gecikenler", test: (c) => c.status === "open" && dueInfo(c.due_at).late },
  open: { label: "Açık kartlar", test: (c) => columnOf(c) === "open" },
};

/** Kart panosunun süzgeci ve sırası. f: { kind, focus, q, basis: created|request, order: asc|desc, from, to } */
export function filterCards(items = [], f = {}) {
  const basis = f.basis || "created";
  const dateOf = (c) => (basis === "request" ? c.request_date || "" : c.created_at ? localIso(new Date(c.created_at)) : "");
  return items
    .filter((c) => !f.kind || c.kind === f.kind)
    .filter((c) => !f.focus || FOCUS_FILTERS[f.focus]?.test(c))
    .filter((c) => matchesQuery(f.q, c.title, c.note, c.team_name, c.opponent_name, c.venue_name))
    .filter((c) => { if (!f.from && !f.to) return true; const d = dateOf(c); return Boolean(d) && (!f.from || d >= f.from) && (!f.to || d <= f.to); })
    .sort((a, b) => {
      const l = basis === "request" ? a.request_date || "" : a.created_at || "";
      const r = basis === "request" ? b.request_date || "" : b.created_at || "";
      if (!l && r) return 1;
      if (l && !r) return -1;
      return f.order === "asc" ? String(l).localeCompare(String(r)) : String(r).localeCompare(String(l));
    });
}

/** Panodaki özet kutucukları (web ile aynı). */
export function cardKpis(items = []) {
  const live = items.filter((c) => c.status === "open");
  const open = live.filter((c) => columnOf(c) === "open");
  return {
    match_request: open.filter((c) => c.kind === "match_request").length,
    contact: open.filter((c) => c.kind === "contact").length,
    personal: open.filter((c) => c.kind === "personal").length,
    waiting_them: live.filter((c) => c.stage === "waiting_them").length,
    waiting_us: live.filter((c) => c.stage === "waiting_us").length,
    late: live.filter((c) => dueInfo(c.due_at).late).length,
  };
}

/** Kart proje sahalarından birine mi ait? (kartın sahası ya da saat seçeneklerinden biri) */
export const cardInVenues = (card, venueIds) => {
  if (!venueIds) return true;
  const ids = new Set(venueIds.map(Number));
  return ids.has(Number(card.venue_id)) || (card.options || []).some((o) => ids.has(Number(o.venue_id)));
};

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
  { key: "recent_contacts", label: "Son görüşülenler", icon: "phone", hint: "En son görüşülen takımlar üstte: arama / not kayıtları ve görüşme kartları." },
  { key: "new_teams", label: "Yeni kayıtlar", icon: "sparkles", hint: "Son 45 günde kaydolan takımlar: ilk maçlarını ayarlamak için arayın." },
  { key: "most_matches", label: "Çok maç alanlar", icon: "trophy", hint: "Son 6 ayda en çok maç yapan takımlar: boş saatleri doldurmak için ilk adaylar." },
  { key: "declining", label: "Azalanlar", icon: "trend", hint: "Önceden sık oynayıp son iki ayda seyrekleşen takımlar." },
  { key: "by_day", label: "Günlere göre", icon: "calendar", hint: "Seçilen gün sık oynayan takımlar: o günün boş saatleri için ilk adaylar." },
  { key: "flexible", label: "Esnek takımlar", icon: "swap", hint: "En çok farklı gün ve saatte oynayan, müsaitliği geniş takımlar." },
  { key: "idle", label: "Uzun süredir yok", icon: "pause", hint: "Düzenli oynayıp 14 günden uzun süredir maç yapmayan takımlar." },
];
export const TEAM_SORTS = [
  { key: "default", label: "Liste sırası" },
  { key: "recent", label: "Son görüşülenler önce" },
  { key: "stale", label: "En uzun süredir görüşülmeyen" },
  { key: "name", label: "Ada göre (A–Z)" },
  { key: "newest", label: "Yeni kayıtlar önce" },
  { key: "played", label: "En çok maç yapan" },
];

/** "Çok maç alanlar": sunucunun tüm takımlar listesinden (played) türetilir. */
export const mostMatches = (all = [], limit = 100) => all.filter((r) => Number(r.played) > 0 && !r.inactive)
  .sort((a, b) => Number(b.played) - Number(a.played) || String(a.team_name).localeCompare(String(b.team_name), "tr"))
  .slice(0, limit)
  .map((r) => ({ ...r, metric: `Son 6 ayda ${r.played} maç` }));

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

/* ------------------------------ proje maçları ------------------------------ */

export const MATCH_STAGE_TONE = { planlandi: "", teyit_bekleniyor: "amber", teyit_edildi: "blue", oynandi: "green", ertelendi: "red" };
export const SOURCE_LABELS = { manual: "Projeye bağlı", venue: "Proje sahası", league: "Proje ligi / sezonu" };

const MONTHS = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
const shortDay = (iso) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;
/** "3 – 9 Kas" ya da "28 Eki – 3 Kas" */
export function weekRangeLabel(start) {
  const end = addDays(start, 6);
  return start.slice(5, 7) === end.slice(5, 7) ? `${Number(start.slice(8, 10))} – ${shortDay(end)}` : `${shortDay(start)} – ${shortDay(end)}`;
}

/**
 * Maçları haftalara ve günlere gruplar (Pazartesi başlangıçlı). Haftalar
 * tarih sırasıyla; tarihsiz maçlar en sonda "Tarihsiz" grubunda.
 * Döner: [{ key, label, current, past, days: [{ date, label, items }], count }]
 */
export function groupMatchesByWeek(items = [], today = localIso()) {
  const thisWeek = weekStartOf(today);
  const weeks = new Map();
  [...items].sort((a, b) => `${a.date || "9999"} ${a.time || ""}`.localeCompare(`${b.date || "9999"} ${b.time || ""}`)).forEach((m) => {
    const key = isoValid(m.date) ? weekStartOf(m.date) : "none";
    if (!weeks.has(key)) weeks.set(key, new Map());
    const days = weeks.get(key);
    const dk = isoValid(m.date) ? m.date.slice(0, 10) : "none";
    if (!days.has(dk)) days.set(dk, []);
    days.get(dk).push(m);
  });
  return [...weeks.entries()].map(([key, days]) => ({
    key,
    label: key === "none" ? "Tarihsiz" : key === thisWeek ? `Bu hafta · ${weekRangeLabel(key)}` : key === addDays(thisWeek, 7) ? `Gelecek hafta · ${weekRangeLabel(key)}` : key === addDays(thisWeek, -7) ? `Geçen hafta · ${weekRangeLabel(key)}` : weekRangeLabel(key),
    current: key === thisWeek,
    past: key !== "none" && key < thisWeek,
    days: [...days.entries()].map(([date, list]) => ({ date, label: date === "none" ? "Tarihsiz" : `${dayLabel(date)}${date === today ? " · bugün" : ""}`, items: list })),
    count: [...days.values()].reduce((s, l) => s + l.length, 0),
  }));
}

/** Maç listesi süzgeci. f: { stage (ya da "unconfirmed" = planlandı + teyit bekleniyor), venue (saha adı), when: upcoming|past|"", q, fees: missing } */
export function filterMatches(items = [], f = {}, today = localIso()) {
  return items.filter((m) => (!f.stage || (f.stage === "unconfirmed" ? ["planlandi", "teyit_bekleniyor"].includes(m.stage) : m.stage === f.stage))
    && (!f.venue || norm(m.field) === norm(f.venue))
    && (!f.when || (f.when === "upcoming" ? (m.date || "") >= today : (m.date || "") < today))
    && (f.fees !== "missing" || (!m.fees_at && m.stage !== "ertelendi"))
    && matchesQuery(f.q, m.home, m.away, m.field, m.league, m.note));
}

/** Maçın kontrol listesi: kayıtlı liste ya da ayarlardaki maddeler (işaretsiz). */
export const matchChecklist = (match, settings) => (Array.isArray(match?.checklist) ? match.checklist : (settings?.checklist || []).map((text) => ({ text, done: false })));

/**
 * Maç ücretlerinin bütçeye yazılacak satırları (sunucudaki createMatchFees ile
 * aynı kural): tutarı 0 olan kalem atlanır; per=home → ev sahibi, away →
 * deplasman, team → iki takım için ayrı ayrı, match → tek satır (giderde cari
 * saha). Döner: [{ key, label, type, amount, party, description }]
 */
export function feePreview(match, fees = []) {
  const label = `${match?.home || ""} – ${match?.away || ""}`;
  const date = match?.date ? String(match.date).slice(0, 10) : "";
  const out = [];
  fees.filter((f) => Number(f.amount) > 0).forEach((f, i) => {
    const parties = f.per === "home" ? [match?.home] : f.per === "away" ? [match?.away] : f.per === "team" ? [match?.home, match?.away] : [f.type === "expense" ? match?.field || null : null];
    parties.forEach((party, j) => out.push({ key: `${f.key || i}-${j}`, label: f.label, type: f.type === "expense" ? "expense" : "income", amount: Math.round(Number(f.amount) * 100) / 100, party: party || null, description: `${f.label} — ${label}${date ? ` (${date})` : ""}` }));
  });
  return out;
}
export function feeTotals(lines = []) {
  const income = lines.filter((l) => l.type === "income").reduce((s, l) => s + l.amount, 0);
  const expense = lines.filter((l) => l.type === "expense").reduce((s, l) => s + l.amount, 0);
  const r = (v) => Math.round(v * 100) / 100;
  return { income: r(income), expense: r(expense), net: r(income - expense) };
}

/** Saha adına göre proje sahası (maçın match_field'ı saha adıdır). */
export const venueOfMatch = (match, venues = []) => venues.find((v) => norm(v.name) === norm(match?.field)) || null;

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

/**
 * Adımın "Saha ve maç" aracı hangi görünümde açılsın? Adım adından tahmin
 * edilir (şablon adımları: sahalar ve program, talepler, takım iletişimi,
 * eşleştirme, teyit, maç günü, ücretler).
 */
export function deskViewForStep(title = "") {
  const t = String(title).toLocaleLowerCase("tr-TR");
  if (/teyit|maç günü|hakem|görevli|ücret/.test(t)) return "matches";
  if (/havuz|eşleştir|program|saat|saha/.test(t)) return "schedule";
  if (/talep|görüşme|arama|ara\b/.test(t)) return "tasks";
  if (/takım|rehber|kayıt/.test(t)) return "team";
  if (/bekley/.test(t)) return "waiting";
  return "matches";
}
