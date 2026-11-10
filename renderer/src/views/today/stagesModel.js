// Proje etapları bileşeninin saf hesapları (renderer/test/today-dash.test.js).
const DONE = new Set(["done", "skipped"]);
const day = (s) => String(s || "").slice(0, 10);
const pad = (n) => String(n).padStart(2, "0");
const isoDay = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const STEP_STATUSES = [
  ["todo", "Bekliyor"], ["doing", "Devam ediyor"], ["waiting", "Yanıt bekleniyor"], ["blocked", "Takıldı"], ["done", "Tamamlandı"], ["skipped", "Gerek yok"],
];
export const LIFECYCLE = [["idea", "Fikir"], ["planning", "Planlama"], ["preparation", "Hazırlık"], ["execution", "Uygulama"], ["closing", "Kapanış"]];
export const statusLabel = (k) => (STEP_STATUSES.find(([v]) => v === k) || [k, k])[1];

/**
 * Proje ayrıntısı (GET /api/tools/projects/:id) → aşamalar ve ilerleme.
 * Her aşama: { id, name, color, total, done, open, overdue, progress, current, steps }.
 * Geçerli aşama: sırayla ilk bitmemiş adımı olan (hepsi bitmişse son aşama).
 * "Gerek yok" adımlar ilerleme paydasından düşer.
 */
export function stageView(detail, now = new Date()) {
  const today = isoDay(now);
  const phases = [...(detail?.phases || [])].sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.id - b.id);
  const steps = [...(detail?.steps || [])].sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.id - b.id);
  const rows = phases.map((p) => {
    const list = steps.filter((s) => Number(s.phase_id) === Number(p.id));
    const skipped = list.filter((s) => s.status === "skipped").length;
    const done = list.filter((s) => s.status === "done").length;
    const counted = list.length - skipped;
    return {
      id: p.id, name: p.name, color: p.color || null, total: list.length, done, open: list.filter((s) => !DONE.has(s.status)).length,
      overdue: list.filter((s) => !DONE.has(s.status) && s.due_date && day(s.due_date) < today).length,
      progress: counted ? Math.round((done / counted) * 100) : list.length ? 100 : 0, steps: list, current: false,
    };
  });
  const loose = steps.filter((s) => s.phase_id == null);
  const cur = rows.find((r) => r.open > 0) || rows[rows.length - 1] || null;
  if (cur) cur.current = true;
  const skipped = steps.filter((s) => s.status === "skipped").length;
  const done = steps.filter((s) => s.status === "done").length;
  const counted = steps.length - skipped;
  return {
    phases: rows,
    current: cur,
    index: cur ? rows.indexOf(cur) + 1 : 0,
    total: rows.length,
    loose,
    progress: counted ? Math.round((done / counted) * 100) : 0,
    overdue: rows.reduce((s, r) => s + r.overdue, 0) + loose.filter((s) => !DONE.has(s.status) && s.due_date && day(s.due_date) < today).length,
    next: steps.filter((s) => !DONE.has(s.status) && s.due_date).sort((a, b) => day(a.due_date).localeCompare(day(b.due_date)))[0] || null,
  };
}

/** Dönemlerin (periods) bir aralıkta çubuk konumları: { left%, width%, ...period }. */
export function periodBars(periods, from, to) {
  const a = new Date(`${from}T00:00:00`).getTime();
  const b = new Date(`${to}T00:00:00`).getTime() + 86400000;
  const span = Math.max(1, b - a);
  return (periods || []).filter((p) => p.start_date && day(p.end_date || p.start_date) >= from && day(p.start_date) <= to).map((p) => {
    const s = Math.max(a, new Date(`${day(p.start_date)}T00:00:00`).getTime());
    const e = Math.min(b, new Date(`${day(p.end_date || p.start_date)}T00:00:00`).getTime() + 86400000);
    return { ...p, left: ((s - a) / span) * 100, width: Math.max(0.8, ((e - s) / span) * 100) };
  });
}
export const addDays = (iso, n) => { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() + n); return isoDay(d); };
export { isoDay };
