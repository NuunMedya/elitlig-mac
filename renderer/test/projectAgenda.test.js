import {
  isAllDayDue, mergeUpcoming, projectLegend, projectOptions, projectRoute, projectSubtitle, scopeMatches, spanPart, taskProjectRoute, validScope, visibleProjectItems,
} from "../src/lib/projectAgenda";

const project = { id: 7, name: "Kış Turnuvası", color: "#0ea5e9" };
const step = { source: "project", kind: "step", project, project_id: 7, title: "Saha kirala", phase_name: "Hazırlık", multi_day: true, start_date: "2026-11-18", end_date: "2026-11-21", link: { project_id: 7, tab: "surec", step_id: 41 } };
const lead = { source: "project", kind: "lead", project: { id: 8, name: "Ağustos Kampı", color: "#16a34a" }, link: { project_id: 8, tab: "kisiler", lead_id: 3 } };

test("ajanda öğesinin bağlantısı masaüstü Projeler sekmesine çevrilir", () => {
  expect(projectRoute(step.link)).toEqual({ id: 7, tab: "process", step: 41 });
  expect(projectRoute(lead.link)).toEqual({ id: 8, tab: "leads", lead: 3 });
  expect(projectRoute({ project_id: 5, tab: "sorular", question_id: 9 })).toEqual({ id: 5, tab: "questions", question: 9 });
  expect(projectRoute(null)).toEqual({ section: "projects" });
  expect(taskProjectRoute({ id: 7, stepId: 41 })).toEqual({ id: 7, tab: "process", step: 41 });
  expect(taskProjectRoute({ id: 8, leadId: 3 })).toEqual({ id: 8, tab: "leads", lead: 3 });
});

test("açıklama listesi, gizleme, alt satır ve çok günlü parça", () => {
  expect(projectLegend([step, lead, { source: "event" }]).map((p) => [p.name, p.count])).toEqual([["Ağustos Kampı", 1], ["Kış Turnuvası", 1]]);
  expect(visibleProjectItems([step, lead], { hidden: [8] })).toEqual([step]);
  expect(visibleProjectItems([step], { show: false })).toEqual([]);
  expect(projectSubtitle(step)).toBe("Proje adımı · Hazırlık · Kış Turnuvası");
  expect(spanPart(step, new Date(2026, 10, 18))).toBe("start");
  expect(spanPart(step, new Date(2026, 10, 19))).toBe("middle");
  expect(spanPart(step, new Date(2026, 10, 21))).toBe("end");
  expect(spanPart({ ...step, multi_day: false }, new Date(2026, 10, 19))).toBe(null);
});

test("Bugün / menü çubuğu: etkinlik ve proje öğeleri zamana göre birleşir", () => {
  const merged = mergeUpcoming({ upcoming: [{ occurrence_key: "e", occurrence_start: "2026-11-12T10:00:00Z" }], upcoming_projects: [{ occurrence_key: "p", occurrence_start: "2026-11-11T21:00:00Z" }] });
  expect(merged.map((i) => i.occurrence_key)).toEqual(["p", "e"]);
  expect(mergeUpcoming(null)).toEqual([]);
});

test("Yapılacaklar kapsamı: kişisel, projeler, tek proje; geçersiz kapsam Tümü'ne düşer", () => {
  const personal = { id: 1, status: "open", project: null };
  const stepCard = { id: 2, status: "open", kind: "project_step", allDay: true, project: { id: 7, name: "Kış Turnuvası", color: "#0ea5e9" } };
  const linked = { id: 3, status: "done", project: { id: 8, name: "Ağustos Kampı", color: "#16a34a" } };
  const all = [personal, stepCard, linked];
  expect(all.filter((t) => scopeMatches(t, "personal")).map((t) => t.id)).toEqual([1]);
  expect(all.filter((t) => scopeMatches(t, "project")).map((t) => t.id)).toEqual([2, 3]);
  expect(all.filter((t) => scopeMatches(t, "project:8")).map((t) => t.id)).toEqual([3]);
  const options = projectOptions(all, [{ id: 9, name: "Boş proje", color: "#000" }]);
  expect(options.map((p) => [p.name, p.open])).toEqual([["Ağustos Kampı", 0], ["Boş proje", 0], ["Kış Turnuvası", 1]]);
  expect(validScope("project:99", options)).toBe("all");
  expect(validScope("project:9", options)).toBe("project:9");
  expect(isAllDayDue(stepCard)).toBe(true);
  expect(isAllDayDue(personal)).toBe(false);
});
