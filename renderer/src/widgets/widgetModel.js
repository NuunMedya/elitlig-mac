// Masaüstü widget'ları — saf hesaplar (widgetModel.test.js): süzgeç, özet, takvim ızgarası, hızlı kayıt.
import { groupTodos, isoDay, parseQuickTask } from "../lib/helpers";
import { parseAmount } from "../lib/ledgerUtils";
import { isUnread, unreadTotal } from "../lib/chatUtils";

const DONE = new Set(["done", "skipped"]);
const dayOf = (s) => String(s || "").slice(0, 10);

/* ------------------------------ yapılacaklar ------------------------------ */

/** Süzgeç: today (geciken + bugün) | overdue | upcoming | all; project: proje kimliği (null = hepsi). */
export function filterTodos(items, { filter = "today", project = null } = {}, now = new Date()) {
  const list = (items || []).filter((t) => t.status !== "done" && (!project || Number(t.project?.id ?? t.project_id ?? t.projectId) === Number(project)));
  const g = groupTodos(list, now);
  const late = g.overdue.map((t) => ({ ...t, late: true }));
  if (filter === "overdue") return late;
  if (filter === "upcoming") return g.upcoming;
  if (filter === "all") return [...late, ...g.today, ...g.upcoming, ...g.nodate];
  return [...late, ...g.today];
}
export function todoCounts(items, project = null, now = new Date()) {
  const list = (items || []).filter((t) => t.status !== "done" && (!project || Number(t.project?.id ?? t.project_id) === Number(project)));
  const g = groupTodos(list, now);
  return { today: g.overdue.length + g.today.length, overdue: g.overdue.length, upcoming: g.upcoming.length, all: list.length };
}

/* ------------------------------ projeler ------------------------------ */

/**
 * Proje ayrıntısı (GET /api/tools/projects/:id) → evre ve yaklaşan adımlar. Evre: sırayla ilk
 * bitmemiş adımı olan aşama (hepsi bittiyse son aşama). Yaklaşan: bitmemiş, son tarihi olan adımlar.
 */
export function projectDigest(detail, now = new Date()) {
  const phases = [...(detail?.phases || [])].sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.id - b.id);
  const steps = detail?.steps || [];
  const open = steps.filter((s) => !DONE.has(s.status));
  const current = phases.find((p) => open.some((s) => Number(s.phase_id) === Number(p.id))) || phases[phases.length - 1] || null;
  const phaseSteps = current ? steps.filter((s) => Number(s.phase_id) === Number(current.id)) : [];
  const today = isoDay(now);
  const upcoming = open.filter((s) => s.due_date).sort((a, b) => dayOf(a.due_date).localeCompare(dayOf(b.due_date))).slice(0, 3)
    .map((s) => ({ id: s.id, title: s.title, due: dayOf(s.due_date), overdue: dayOf(s.due_date) < today, status: s.status }));
  const doing = open.find((s) => s.status === "doing") || null;
  return {
    phase: current ? { id: current.id, name: current.name, color: current.color || null, index: phases.indexOf(current) + 1, total: phases.length, done: phaseSteps.filter((s) => DONE.has(s.status)).length, steps: phaseSteps.length } : null,
    upcoming,
    doing: doing ? { id: doing.id, title: doing.title } : null,
    overdue: open.filter((s) => s.due_date && dayOf(s.due_date) < today).length,
  };
}

/** Aktif projeler (arşivlenmemiş; planlama / yürütülüyor / beklemede), en yakın son tarihe göre. */
export function activeProjects(items) {
  return (items || [])
    .filter((p) => !p.archived && ["planning", "active", "on_hold"].includes(p.status || "active"))
    .sort((a, b) => (a.status === "on_hold") - (b.status === "on_hold") || String(a.stats?.next_due?.due_date || "9999").localeCompare(String(b.stats?.next_due?.due_date || "9999")) || String(b.updated_at || "").localeCompare(String(a.updated_at || "")));
}

/* ------------------------------ muhasebe ------------------------------ */

/** Yaklaşan / geciken düzenli ödemeler (GET /api/tools/recurring) → en yakın tarihten. */
export function upcomingPayments(rec, { days = 30, limit = 5 } = {}, now = new Date()) {
  const until = isoDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() + days));
  const seen = new Set();
  const list = [...(rec?.overdue || []), ...(rec?.occurrences || [])]
    .filter((o) => o && o.due_date && !["paid", "skipped", "untracked"].includes(o.status) && dayOf(o.due_date) <= until)
    .filter((o) => { const k = o.key || `${o.recurring_id}:${o.period}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => dayOf(a.due_date).localeCompare(dayOf(b.due_date)));
  return list.slice(0, limit).map((o) => ({ key: o.key || `${o.recurring_id}:${o.period}`, name: o.name, amount: Number(o.amount) || 0, type: o.type, due: dayOf(o.due_date), late: Boolean(o.late) || dayOf(o.due_date) < isoDay(now) }));
}

/* ------------------------------ mesajlar ------------------------------ */

const lastAt = (c) => String(c?.last_message?.created_at || c?.last_message_at || c?.updated_at || "");
/** Kişisel + üye mesajları birleşik, en yeni mesaj üstte; kaynak: all | personal | inbox. */
export function recentChats(personal, inbox, source = "all") {
  const ids = new Set((personal || []).map((c) => Number(c.id)));
  const list = source === "inbox" ? inbox || [] : source === "personal" ? personal || [] : [...(personal || []), ...(inbox || []).filter((c) => !ids.has(Number(c.id)))];
  return list.filter((c) => !c.archived && (c.last_message || isUnread(c))).sort((a, b) => (isUnread(b) - isUnread(a)) || lastAt(b).localeCompare(lastAt(a)));
}
export const chatUnread = (personal, inbox, source = "all") => (source === "inbox" ? 0 : unreadTotal(personal)) + (source === "personal" ? 0 : unreadTotal(inbox));

/* ------------------------------ takvim ------------------------------ */

/** Ay ızgarası: Pazartesi başlar, 6 hafta × 7 gün. Her gün { day: "YYYY-MM-DD", inMonth, today, count }. */
export function monthGrid(year, month, events = [], now = new Date()) {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7;
  const counts = new Map();
  for (const e of events || []) {
    const k = e.day || isoDay(new Date(e.occurrence_start || e.start_at));
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  const today = isoDay(now);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(year, month, 1 - offset + i);
    const k = isoDay(d);
    return { day: k, date: d.getDate(), inMonth: d.getMonth() === month, today: k === today, count: counts.get(k) || 0, weekend: d.getDay() === 0 || d.getDay() === 6 };
  });
}

/** Haftanın günleri (Pazartesi–Pazar) ve her güne düşen öğeler (saat sırasıyla; gün boyu önce). */
export function weekColumns(events = [], now = new Date(), weekOffset = 0) {
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7) + weekOffset * 7);
  const today = isoDay(now);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
    const k = isoDay(d);
    const items = (events || []).filter((e) => isoDay(new Date(e.occurrence_start || e.start_at)) === k)
      .sort((a, b) => (Boolean(b.all_day) - Boolean(a.all_day)) || String(a.occurrence_start || a.start_at).localeCompare(String(b.occurrence_start || b.start_at)));
    return { day: k, date: d, today: k === today, items };
  });
}

/* ------------------------------ hızlı kayıt ------------------------------ */

/**
 * Tek satır → kayıt isteği. kind: task | note | expense. Gider için tutar başta ya da sonda
 * ("1.250 hakem ücreti", "kırtasiye 250 tl"). Hızlı kayıt penceresiyle (views/Quick.jsx) aynı uçlar.
 */
export function quickRecord(kind, text, now = new Date()) {
  const value = String(text || "").trim();
  if (!value) return { error: "Bir şey yazın." };
  if (kind === "note") {
    const [first, ...rest] = value.split(/\n/);
    return { path: "/api/tools/notes", body: { title: first.slice(0, 120), body: rest.join("\n") || "" }, label: "Not" };
  }
  if (kind === "expense") {
    let m = value.match(/^([\d.,]+)\s*(?:tl|₺)?\s+(.*)$/i);
    let amount = m ? parseAmount(m[1]) : 0;
    let desc = m ? m[2] : "";
    if (!amount) {
      m = value.match(/^(.*?)\s+([\d.,]+)\s*(?:tl|₺)?$/i);
      amount = m ? parseAmount(m[2]) : 0;
      desc = m ? m[1] : "";
    }
    if (!amount) return { error: "Tutarı yazın: örn. 250 kırtasiye" };
    return { path: "/api/tools/ledger", body: { type: "expense", amount, description: desc.trim() || null, entry_date: isoDay(now), status: "paid", method: "cash", vat_rate: 0 }, label: "Gider" };
  }
  const p = parseQuickTask(value, now);
  return { path: "/api/todos", body: { kind: p.dueAt ? "reminder" : "task", title: p.title || value, due_at: p.dueAt, priority: p.priority }, label: "Görev", dueAt: p.dueAt };
}

/* ------------------------------ başlatıcı ------------------------------ */

/** Başlatıcı / araç çubuğu: seçilen araç anahtarları (yoksa varsayılan), görünür araçlarla kesişim. */
export const DEFAULT_LAUNCHER = ["projects", "todos", "ledger", "agenda", "notes", "contacts", "equipment", "messages", "requests", "studio", "admin", "toolkit"];
export const DEFAULT_DOCK = ["today", "messages", "todos", "projects", "agenda", "ledger", "notes", "contacts", "equipment", "toolkit"];
export function launcherTools(visible, chosen, fallback = DEFAULT_LAUNCHER) {
  const byKey = new Map((visible || []).map((t) => [t.key, t]));
  return (chosen?.length ? chosen : fallback).map((k) => byKey.get(k)).filter(Boolean);
}

/* ------------------------------ stüdyo ------------------------------ */

export function studioLabel(s) {
  if (!s?.available) return { text: "Stüdyo kapalı", tone: "" };
  if (!s.active) return { text: "Yayında değil", tone: "" };
  if (s.state === "reconnecting") return { text: "Yeniden bağlanıyor", tone: "amber" };
  if (s.state === "starting") return { text: "Başlatılıyor", tone: "amber" };
  if (s.recordOnly) return { text: "Kayıt alınıyor", tone: "blue" };
  return { text: "YAYINDA", tone: "red" };
}
export function durationLabel(ms) {
  const t = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  return `${h ? `${h}:` : ""}${String(m).padStart(h ? 2 : 1, "0")}:${String(s).padStart(2, "0")}`;
}
