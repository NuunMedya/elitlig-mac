// Projeler ↔ Ajanda / Yapılacaklar / Bugün (saf, testli).
//
// Sunucu /api/tools/events yanıtında projelerdeki tarihleri ayrı "projects"
// dizisinde verir (adımlar, son tarihler, proje başlangıç/bitiş, soru son
// tarihleri, görüşme takipleri); /api/tools/overview "upcoming_projects"
// taşır. Kişiye atanan proje adımları ve görüşme takipleri Yapılacaklar'da
// "project_step" / "project_followup" kartıdır ve kart.project alanını taşır.

export const PROJECT_KINDS = {
  project_start: { label: "Proje başlangıcı", icon: "flag" },
  project_end: { label: "Proje bitişi", icon: "target" },
  step: { label: "Proje adımı", icon: "layers" },
  deadline: { label: "Adım son günü", icon: "clock" },
  question: { label: "Soru son tarihi", icon: "help" },
  lead: { label: "Görüşme takibi", icon: "phone" },
};
export const PROJECT_TODO_KINDS = ["project_step", "project_followup"];

export const isProjectItem = (item) => item?.source === "project";
export const projectKindOf = (item) => PROJECT_KINDS[item?.kind] || PROJECT_KINDS.step;

// Sunucunun (web) sekme adları → masaüstü Projeler sekmeleri.
const TAB_MAP = { genel: "overview", surec: "process", kisiler: "leads", sorular: "questions", butce: "budget", iletisim: "activity", portfoy: "portfolio" };

/** go("projects", …) argümanı: { id, tab, step | lead | question }. */
export function projectRoute(link) {
  if (!link?.project_id) return { section: "projects" };
  const route = { id: Number(link.project_id), tab: TAB_MAP[link.tab] || link.tab || "overview" };
  if (link.step_id) route.step = Number(link.step_id);
  if (link.lead_id) route.lead = Number(link.lead_id);
  if (link.question_id) route.question = Number(link.question_id);
  return route;
}

/** Yapılacaklar kartının projedeki yeri. */
export function taskProjectRoute(project) {
  if (!project?.id) return { section: "projects" };
  if (project.stepId) return { id: Number(project.id), tab: "process", step: Number(project.stepId) };
  if (project.leadId) return { id: Number(project.id), tab: "leads", lead: Number(project.leadId) };
  return { id: Number(project.id), tab: "overview" };
}

/** Ajandadaki projeler: ad, renk, öğe sayısı (ada göre). */
export function projectLegend(items = []) {
  const map = new Map();
  items.forEach((item) => {
    if (!isProjectItem(item) || !item.project) return;
    const id = item.project.id;
    if (!map.has(id)) map.set(id, { id, name: item.project.name, color: item.project.color || item.color, count: 0 });
    map.get(id).count += 1;
  });
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "tr"));
}

export const visibleProjectItems = (items = [], { show = true, hidden = [] } = {}) =>
  (show ? items.filter((item) => !hidden.includes(item.project?.id)) : []);

export const projectSubtitle = (item) => [projectKindOf(item).label, item.phase_name, item.project?.name].filter(Boolean).join(" · ");

/** Çok günlü öğe bu günde: start | middle | end (tek günlükte null). */
export function spanPart(item, day) {
  if (!item?.multi_day || !day) return null;
  const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
  if (key === item.start_date) return "start";
  if (key === item.end_date) return "end";
  return "middle";
}

/** Bugün / menü çubuğu: etkinlikler + önümüzdeki 7 günün proje öğeleri, zamana göre. */
export function mergeUpcoming(overview, limit = 8) {
  const events = Array.isArray(overview?.upcoming) ? overview.upcoming : [];
  const projects = Array.isArray(overview?.upcoming_projects) ? overview.upcoming_projects : [];
  return [...events, ...projects].sort((a, b) => String(a.occurrence_start).localeCompare(String(b.occurrence_start))).slice(0, limit);
}

/* ----------------------------- Yapılacaklar ----------------------------- */

/** scope: "all" | "personal" | "project" | "project:<id>" */
export function scopeMatches(task, scope) {
  if (!scope || scope === "all") return true;
  if (scope === "personal") return !task.project;
  if (scope === "project") return Boolean(task.project);
  if (String(scope).startsWith("project:")) return Number(task.project?.id) === Number(String(scope).slice(8));
  return true;
}

/** Kartlardaki ve bağlanabilir projeler birleşik (açık kart sayısıyla). */
export function projectOptions(items = [], linkable = []) {
  const map = new Map();
  linkable.forEach((p) => map.set(Number(p.id), { id: Number(p.id), name: p.name, color: p.color, open: 0 }));
  items.forEach((t) => {
    if (!t.project) return;
    const id = Number(t.project.id);
    if (!map.has(id)) map.set(id, { id, name: t.project.name, color: t.project.color, open: 0 });
    if (t.status !== "done") map.get(id).open += 1;
  });
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "tr"));
}

export function validScope(scope, options = []) {
  if (!scope || ["all", "personal", "project"].includes(scope)) return scope || "all";
  return options.some((p) => `project:${p.id}` === scope) ? scope : "all";
}

/** Saatsiz (tüm gün) son tarih mi? Proje adımında 23:59 gösterilmez. */
export const isAllDayDue = (task) => Boolean(task?.allDay);
