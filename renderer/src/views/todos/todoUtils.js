// Yapılacaklar: görünümler, gruplama, sıralama ve yardımcılar (saf, testli).

export const STATUSES = [
  { key: "open", label: "Yapılacak" },
  { key: "in_progress", label: "Sürüyor" },
  { key: "done", label: "Tamamlandı" },
];
export const STATUS_LABELS = { open: "Yapılacak", in_progress: "Sürüyor", done: "Tamamlandı" };
export const PRIORITIES = [{ key: "low", label: "Düşük" }, { key: "normal", label: "Normal" }, { key: "high", label: "Yüksek" }];
export const LABEL_COLORS = { red: "#ef4444", orange: "#f97316", yellow: "#eab308", green: "#22c55e", teal: "#14b8a6", blue: "#3b82f6", purple: "#8b5cf6", pink: "#ec4899", gray: "#6b7280" };
export const KINDS = [
  { key: "", label: "Tüm türler" }, { key: "task", label: "Görev" }, { key: "reminder", label: "Hatırlatma" }, { key: "note", label: "Kişisel not" },
  { key: "match_duty", label: "Maç görevi" }, { key: "match_moment", label: "Maç anı" }, { key: "award_nomination", label: "Haftanın enleri önerisi" },
  { key: "award_coordination", label: "Haftanın enleri koordinasyonu" }, { key: "sheet_share", label: "Paylaşılan tablo" },
];
export const KIND_ICON = { task: "checkSquare", reminder: "bell", note: "note", match_duty: "ball", match_moment: "flag", award_nomination: "award", award_coordination: "award", sheet_share: "grid" };
export const MOMENT_PERIOD = { 1: "1. devre", 2: "2. devre", 3: "Uzatma" };

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const dayDiff = (a, b) => Math.round((startOfDay(a) - startOfDay(b)) / 86400000);
export const dueOf = (t) => t.dueAt || (t.kind === "match_duty" ? t.match?.startsAt : null) || null;
export const isDelegated = (t) => t.source === "assigned_by_me" && !t.permissions?.isOwner;
export const isLate = (t) => Boolean(t.overdue && t.status !== "done");

/** Gün sonu (23:59) — hızlı eklemedeki "Bugün/Yarın/Haftaya". */
export function endOfDay(offset = 0, from = new Date()) {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + offset, 23, 59, 0, 0);
  return d.toISOString();
}

/** Tarih kovası: overdue | today | tomorrow | week | later | none */
export function dateBucket(t, now = new Date()) {
  const due = dueOf(t);
  if (!due) return "none";
  const d = new Date(due);
  const diff = dayDiff(d, now);
  if (d < now && diff < 0) return "overdue";
  if (diff <= 0) return isLate(t) ? "overdue" : "today";
  if (diff === 1) return "tomorrow";
  if (diff <= 7) return "week";
  return "later";
}

const PRIO = { high: 0, normal: 1, low: 2 };
const time = (v) => (v ? new Date(v).getTime() : Number.POSITIVE_INFINITY);
/** Liste sıralaması: sabit, sürüyor, yüksek öncelik, son tarih, sıra, yeni. */
export function sortRows(list) {
  return [...list].sort((a, b) => {
    if (a.status === "done" && b.status === "done") return time(b.completedAt || b.updatedAt) * -1 - time(a.completedAt || a.updatedAt) * -1;
    if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
    if ((a.status === "in_progress") !== (b.status === "in_progress")) return a.status === "in_progress" ? -1 : 1;
    if ((PRIO[a.priority] ?? 1) !== (PRIO[b.priority] ?? 1)) return (PRIO[a.priority] ?? 1) - (PRIO[b.priority] ?? 1);
    const due = time(dueOf(a)) - time(dueOf(b));
    if (due) return due;
    const pos = (a.position ?? 1e9) - (b.position ?? 1e9);
    if (pos) return pos;
    return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
  });
}

/** Pano sütunu sıralaması: sabit üstte; sırası olmayanlar önce (son tarihe göre), sonra sıra. */
export function sortColumn(list, status) {
  return [...list].sort((a, b) => {
    if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
    const ap = a.position == null;
    const bp = b.position == null;
    if (status === "done" && ap && bp) return time(b.completedAt) - time(a.completedAt);
    if (ap !== bp) return ap ? -1 : 1;
    if (ap && bp) return time(dueOf(a)) - time(dueOf(b)) || String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
    return a.position - b.position;
  });
}

const isToday = (iso, now) => iso && dayDiff(new Date(iso), now) === 0;

/** Kenar çubuğu görünümleri. labels: kartlardaki tüm etiket metinleri. */
export function viewsFor(items, { canOversee = false, canAssignCrew = false, now = new Date() } = {}) {
  const labels = [...new Set(items.flatMap((t) => (t.labels || []).map((l) => l.text)))].sort((a, b) => a.localeCompare(b, "tr"));
  const views = [
    { key: "today", label: "Bugün", icon: "sun", group: "Kişisel plan", match: (t) => !isDelegated(t) && ((t.status !== "done" && dueOf(t) && dayDiff(new Date(dueOf(t)), now) <= 0) || (t.status === "done" && isToday(t.completedAt, now))) },
    { key: "upcoming", label: "Yaklaşan", icon: "calendar", group: "Kişisel plan", match: (t) => !isDelegated(t) && t.status !== "done" && dueOf(t) && dayDiff(new Date(dueOf(t)), now) > 0 },
    { key: "all", label: "Tüm işler", icon: "list", group: "Kişisel plan", match: () => true },
    { key: "assigned_to_me", label: "Bana atananlar", icon: "inbox", group: "Ekip", match: (t) => t.source === "assigned_to_me" },
    { key: "assigned_by_me", label: "Atadıklarım", icon: "share", group: "Ekip", match: (t) => t.source === "assigned_by_me" },
  ];
  if (canAssignCrew || items.some((t) => t.source === "system")) views.push({ key: "system", label: "Maç görevleri", icon: "ball", group: "Ekip", match: (t) => t.source === "system" });
  if (canOversee) views.push({ key: "team", label: "Ekip takibi", icon: "team", group: "Ekip", match: () => false });
  labels.forEach((text) => views.push({ key: `label:${text}`, label: text, icon: "tag", group: "Etiketler", color: items.flatMap((t) => t.labels || []).find((l) => l.text === text)?.color, match: (t) => (t.labels || []).some((l) => l.text === text) }));
  views.push({ key: "done", label: "Tamamlanan", icon: "check", group: "Arşiv", match: (t) => t.status === "done" });
  return views;
}

const BUCKET_LABELS = { overdue: "Geciken", today: "Bugün", tomorrow: "Yarın", week: "Önümüzdeki 7 gün", later: "Daha sonra", none: "Tarihsiz" };

/** Liste grupları: [{ key, label, items, tone }] */
export function groupRows(list, { view, groupBy = "date", now = new Date() } = {}) {
  const done = list.filter((t) => t.status === "done");
  const active = list.filter((t) => t.status !== "done");
  const out = [];
  const push = (key, label, items, extra = {}) => { if (items.length) out.push({ key, label, items: key.startsWith("done") ? items : sortRows(items), ...extra }); };
  if (view === "done") { push("done", "Tamamlanan", sortRows(done)); return out; }
  if (view === "assigned_by_me") {
    const byPerson = new Map();
    for (const t of list) {
      const name = t.owner?.name || "Kişi";
      if (!byPerson.has(name)) byPerson.set(name, []);
      byPerson.get(name).push(t);
    }
    [...byPerson.entries()].sort((a, b) => b[1].filter((t) => t.status !== "done").length - a[1].filter((t) => t.status !== "done").length || a[0].localeCompare(b[0], "tr"))
      .forEach(([name, items]) => push(`p:${name}`, name, items, { progress: { done: items.filter((t) => t.status === "done").length, total: items.length } }));
    return out;
  }
  if (view === "upcoming") {
    for (let i = 1; i <= 7; i += 1) {
      const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
      push(`d${i}`, i === 1 ? "Yarın" : day.toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long" }), active.filter((t) => dayDiff(new Date(dueOf(t)), now) === i));
    }
    push("later", "Daha sonra", active.filter((t) => dayDiff(new Date(dueOf(t)), now) > 7));
    return out;
  }
  if (view === "today") {
    push("overdue", "Geciken", active.filter((t) => dateBucket(t, now) === "overdue"), { tone: "red" });
    push("today", "Bugün", active.filter((t) => dateBucket(t, now) !== "overdue"));
    push("done-today", "Bugün tamamladıkların", done);
    return out;
  }
  const delegated = active.filter(isDelegated);
  const mine = active.filter((t) => !isDelegated(t));
  if (groupBy === "status") {
    push("in_progress", "Sürüyor", mine.filter((t) => t.status === "in_progress"));
    push("open", "Yapılacak", mine.filter((t) => t.status === "open"));
  } else {
    for (const key of ["overdue", "today", "tomorrow", "week", "later", "none"]) push(key, BUCKET_LABELS[key], mine.filter((t) => dateBucket(t, now) === key), key === "overdue" ? { tone: "red" } : {});
  }
  push("delegated", "Başkalarına atadıklarım", delegated);
  push("done", "Tamamlanan", sortRows(done), { collapsed: true });
  return out;
}

/** Arama: başlık, açıklama, oyuncu, takım, maç, kişi ve etiketler. */
export function matchesSearch(t, q) {
  const needle = String(q || "").trim().toLocaleLowerCase("tr-TR");
  if (!needle) return true;
  return [t.title, t.body, t.player?.name, t.team?.name, t.match?.label, t.owner?.name, t.assignedBy?.name, ...(t.labels || []).map((l) => l.text)]
    .filter(Boolean).join(" ").toLocaleLowerCase("tr-TR").includes(needle);
}

/** Panoda bırakma sonrası sütunun yeni kimlik sırası. */
export function orderAfterDrop(columnIds, movedId, beforeId) {
  const ids = columnIds.filter((id) => id !== movedId);
  const at = beforeId == null ? ids.length : ids.indexOf(beforeId);
  ids.splice(at < 0 ? ids.length : at, 0, movedId);
  return ids;
}

/* ------------------------------ WhatsApp ------------------------------ */

export const whatsappNumber = (value) => {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("90")) return digits;
  if (digits.startsWith("0")) return `9${digits}`;
  return digits.length === 10 ? `90${digits}` : digits;
};
export const whatsappUrl = (number, text) => `https://wa.me/${number ? whatsappNumber(number) : ""}?text=${encodeURIComponent(text)}`;

export function buildLineupMessage({ member, team, match, origin = "https://elitlig.com" }) {
  const link = member ? `${origin}/panel?mac=${match?.id}` : `${origin}/kayit-ol`;
  const greeting = team?.contact?.name ? `Merhaba ${team.contact.name},` : "Merhaba,";
  const when = match?.startsAt ? new Date(match.startsAt).toLocaleString("tr-TR", { day: "numeric", month: "long", weekday: "long", hour: "2-digit", minute: "2-digit" }) : "";
  const label = match?.label || "maç";
  const text = member
    ? `${greeting} ${when ? `${when} tarihli ` : ""}${label} maçı için ${team?.name || "takımınızın"} kadrosunu girmenizi rica ediyoruz. Aşağıdaki bağlantıdan elitlig panelinize girip maçın kadrosunu girebilirsiniz:\n${link}\n\nTeşekkürler, elitlig yayın ekibi`
    : `${greeting} ${when ? `${when} tarihli ` : ""}${label} maçı için ${team?.name || "takımınızın"} kadrosunu sistemden girebilmeniz için elitlig'e üye olmanız gerekiyor. Aşağıdaki bağlantıdan üye olup profil tipi olarak takım başkanını seçerek takımınızı bağlayabilirsiniz:\n${link}\n\nÜyeliğiniz tamamlanınca maçın kadrosunu panelinizden girebilirsiniz. Teşekkürler, elitlig yayın ekibi`;
  return { link, text };
}

/* --------------------------- Haftanın enleri --------------------------- */

export const INDIVIDUAL = [
  { key: "WEEKLY_PLAYER", label: "Haftanın Oyuncusu" },
  { key: "WEEKLY_GOALKEEPER", label: "Haftanın Kalecisi" },
  { key: "WEEKLY_DEFENDER", label: "Haftanın Defans Oyuncusu" },
  { key: "WEEKLY_MIDFIELDER", label: "Haftanın Orta Saha Oyuncusu" },
  { key: "WEEKLY_FORWARD", label: "Haftanın Forveti" },
  { key: "WEEKLY_FAIR_PLAY", label: "Haftanın Fair Play Oyuncusu" },
];
export const TEAM_KEY = "WEEKLY_TEAM";
export const SQUAD_KEY = "WEEKLY_SQUAD_PLAYER";
export const ALL_AWARD = [...INDIVIDUAL, { key: TEAM_KEY, label: "Haftanın Takımı" }, { key: SQUAD_KEY, label: "Haftanın Kadrosu" }];
export const FORMATIONS = { 7: ["1-2-3-1", "1-3-2-1", "1-2-2-2", "1-3-1-2"], 8: ["1-3-3-1", "1-3-2-2", "1-2-3-2", "1-4-2-1"] };
export const GROUPS = ["GK", "DEF", "MID", "FWD"];
export const GROUP_LABELS = { GK: "Kaleci", DEF: "Defans", MID: "Orta saha", FWD: "Forvet" };

export function slotsFor(formation) {
  const parts = String(formation || "").split("-").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0)) return [];
  return GROUPS.flatMap((g, i) => Array.from({ length: parts[i] }, (_, k) => `${g}${k + 1}`));
}
export const groupOfSlot = (slot) => GROUPS.find((g) => String(slot).startsWith(g)) || "MID";

export function toDraft(view) {
  const draft = { individual: {}, team: null, squad: null, note: view?.note || "" };
  Object.entries(view?.individual || {}).forEach(([key, v]) => {
    if (v?.player?.id || v?.player_id) draft.individual[key] = { player: v.player || { id: v.player_id, name: `Oyuncu #${v.player_id}` }, note: v.note || "" };
  });
  if (view?.team) {
    const info = view.team.info || { id: view.team.team_id, name: `Takım #${view.team.team_id}` };
    draft.team = { id: info.id, name: info.name, note: view.team.note || "" };
  }
  if (view?.squad) draft.squad = { formation: view.squad.formation, slots: { ...(view.squad.slots || {}) } };
  return draft;
}

export function toPayload(draft) {
  const individual = {};
  Object.entries(draft?.individual || {}).forEach(([key, v]) => { if (v?.player?.id) individual[key] = { player_id: v.player.id, note: v.note || null }; });
  const slots = {};
  Object.entries(draft?.squad?.slots || {}).forEach(([slot, p]) => { if (p?.id) slots[slot] = p.id; });
  return { individual, team: draft?.team?.id ? { team_id: draft.team.id, note: draft.team.note || null } : null, squad: draft?.squad?.formation ? { formation: draft.squad.formation, slots } : null, note: draft?.note || null };
}

/** Koordinasyon: boş kategorileri en çok oy alanla doldurur. */
export function autofill(draft, suggestions, { categories = [], squadSize = 7 } = {}) {
  const next = { ...draft, individual: { ...draft.individual }, squad: draft.squad ? { ...draft.squad, slots: { ...draft.squad.slots } } : null };
  for (const c of INDIVIDUAL) {
    if (!categories.includes(c.key) || next.individual[c.key]?.player) continue;
    const top = suggestions?.individual?.[c.key]?.[0];
    if (top) next.individual[c.key] = { player: top, note: "" };
  }
  if (categories.includes(TEAM_KEY) && !next.team && suggestions?.team?.[0]) next.team = { id: suggestions.team[0].id, name: suggestions.team[0].name, note: "" };
  if (categories.includes(SQUAD_KEY)) {
    const allowed = FORMATIONS[squadSize] || FORMATIONS[7];
    const formation = next.squad?.formation || (suggestions?.formations || []).map((f) => f.formation).find((f) => allowed.includes(f)) || allowed[0];
    const slots = { ...(next.squad?.slots || {}) };
    const used = new Set(Object.values(slots).filter(Boolean).map((p) => p.id));
    for (const slot of slotsFor(formation)) {
      if (slots[slot]) continue;
      const pick = (suggestions?.squad?.[groupOfSlot(slot)] || []).find((p) => !used.has(p.id));
      if (pick) { slots[slot] = pick; used.add(pick.id); }
    }
    next.squad = { formation, slots };
  }
  return next;
}
