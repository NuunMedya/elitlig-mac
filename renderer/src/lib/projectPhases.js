// Projeler ↔ Yapılacaklar: ETAP ETİKETİ (saf, testli).
//
// Sunucuda projenin her adımı Yapılacaklar'da tek karttır (kind
// "project_step"); adımın aşaması kartta etap etiketidir:
//   task.project.phase = { id, name, color } | null, task.project.unlabeled
// Kartta etap değişince (PATCH phase_id) adım o aşamaya taşınır; yeni ad
// (phase_name) projede yeni aşama açar; phase_id: null "Askıda"ya bırakır.
// /api/todos/projects her projeyle etaplarını (phases) verir.

export const UNLABELED = "Askıda";
export const UNLABELED_LONG = "Askıda (etiketlenmemiş)";

/** Projenin etapları (bağlanabilir projeler listesinden). */
export const phasesOf = (projects = [], projectId) => projects.find((p) => Number(p.id) === Number(projectId))?.phases || [];

/** Kartın etap çipi bilgisi: { text, color, unlabeled } | null */
export function phaseChipOf(task) {
  const project = task?.project;
  if (!project) return null;
  if (project.phase) return { text: project.phase.name, color: project.phase.color || "#7c3aed", unlabeled: false };
  if (project.unlabeled) return { text: UNLABELED, color: "#64748b", unlabeled: true };
  return null;
}

/**
 * Etap seçiminden PATCH/POST gövdesi. choice: "" (Askıda) | id | "new"
 * current: kartın şu anki etap kimliği (yeni kartta undefined).
 */
export function phasePayload(choice, newName = "", current) {
  if (choice === "new") return String(newName || "").trim() ? { phase_name: String(newName).trim() } : {};
  const next = choice === "" || choice == null ? null : Number(choice);
  if (current === undefined) return next == null ? {} : { phase_id: next };
  return (current ?? null) === next ? {} : { phase_id: next };
}

/** Liste "Etaba göre": etaplar, sonra Askıda, en sonda proje dışı. */
export function phaseGroups(list = []) {
  const map = new Map();
  const loose = [];
  const other = [];
  list.forEach((t) => {
    const ph = t.project?.phase;
    if (ph) {
      const key = `ph:${t.project.id}:${ph.id}`;
      if (!map.has(key)) map.set(key, { key, label: ph.name, color: ph.color, hint: t.project.name, items: [] });
      map.get(key).items.push(t);
    } else if (t.project?.unlabeled) loose.push(t);
    else other.push(t);
  });
  const out = [...map.values()];
  if (loose.length) out.push({ key: "ph:none", label: UNLABELED_LONG, items: loose });
  if (other.length) out.push({ key: "ph:other", label: "Proje dışı", items: other });
  return out;
}

/** Tek proje kapsamında ayrıca gelen kartlar (başka üyelerdekiler) kendi kartlarımla birleşir. */
export function mergeProjectItems(mine = [], shared = []) {
  const ids = new Set(mine.map((t) => t.id));
  return [...mine, ...shared.filter((t) => !ids.has(t.id))];
}

/** Proje adımı kartı silinirken sorulacak metin. */
export const deleteQuestion = (task) => (task?.isProjectStep
  ? `“${task.title}” projedeki bir adımdır. Kart silinirse adım da “${task.project?.name || "projeden"}” projesinden silinir.`
  : `“${task?.title}” silinsin mi?`);
