// Proje takvimi (Gantt) saf yardımcıları ve Ajanda dönem şeritleri.
import {
  addDays, computeLoad, dragResult, filterProjects, ganttHtml, headerUnits, packLanes, periodRows, printPx, rangeFromIndexes, shiftAnchor, windowFor,
} from "../src/lib/timelineUtils";
import { bandsOnDay, periodBands, projectRoute } from "../src/lib/projectAgenda";

const per = (id, project_id, name, start, end, extra = {}) => ({ id, project_id, kind: "period", name, stage: "preparation", color: "#0ea5e9", start_date: start, end_date: end, progress: 0, depends_on: null, ...extra });
const A = { id: 1, name: "A Ligi", color: "#7c3aed", periods: [per(11, 1, "Hazırlık", "2026-11-01", "2026-11-30"), per(12, 1, "Organizasyon", "2026-12-01", "2027-01-31", { stage: "execution", responsible_id: 2, depends_on: 11 }), { ...per(13, 1, "Final", "2027-01-31", "2027-01-31"), kind: "milestone" }] };
const B = { id: 2, name: "B <Kupa>", color: "#16a34a", periods: [per(21, 2, "Turnuva", "2027-01-20", "2027-02-10", { stage: "execution" })] };

test("pencere / kaydırma / başlık birimleri", () => {
  expect(windowFor("month", "2026-11-10")).toEqual({ from: "2026-11-01", to: "2027-02-28", days: 120 });
  expect(windowFor("year", "2026-11-10")).toMatchObject({ from: "2026-01-01", to: "2027-12-31" });
  expect(shiftAnchor("quarter", "2026-11-10", 1)).toBe("2027-02-10");
  expect(shiftAnchor("week", "2026-11-10", -1)).toBe("2026-11-03");
  expect(headerUnits("month", "2026-11-01", 61).top.map((u) => [u.label, u.span])).toEqual([["Kasım 2026", 30], ["Aralık 2026", 31]]);
});

test("sürükle-bırak sonucu ve aralık seçimi", () => {
  const p = per(1, 1, "a", "2026-01-10", "2026-01-20");
  expect(dragResult(p, "move", -3)).toEqual({ start_date: "2026-01-07", end_date: "2026-01-17" });
  expect(dragResult(p, "end", 4)).toEqual({ start_date: "2026-01-10", end_date: "2026-01-24" });
  expect(dragResult(p, "end", -30)).toEqual({ start_date: "2026-01-10", end_date: "2026-01-10" });
  expect(rangeFromIndexes("2026-01-01", 9, 2)).toEqual({ start_date: "2026-01-03", end_date: "2026-01-10" });
  expect(packLanes([per(1, 1, "a", "2026-01-01", "2026-01-10"), per(2, 1, "b", "2026-01-10", "2026-01-12")]).lanes).toBe(2);
});

test("yoğunluk: aynı günlerde iki projenin organizasyon evresi çakışır", () => {
  const conflicts = computeLoad([A, B]).filter((x) => x.count > 1);
  expect(conflicts).toEqual([{ from: "2027-01-20", to: "2027-01-31", count: 2, project_ids: [1, 2] }]);
  expect(computeLoad([A, B], { stage: null }).some((x) => x.from === "2026-11-01")).toBe(true);
  expect(filterProjects([A, B], { responsibleId: "2" }).map((p) => p.id)).toEqual([1]);
});

test("Excel satırları ve yazdırma HTML'i (A3 yatay, kaçışlı)", () => {
  const rows = periodRows([A], { 2: "Can" });
  expect(rows[1]).toMatchObject({ name: "Organizasyon", responsible: "Can", depends: "Hazırlık", days: 62 });
  const html = ganttHtml({ projects: [A, B], from: "2026-11-01", to: "2027-02-28", paper: "A3", today: "2026-11-10" });
  expect(html).toContain("@page { size: A3 landscape");
  expect(html).toContain("B &lt;Kupa&gt;");
  expect(html).not.toContain("<script");
  expect(html.match(/class="bar"/g)).toHaveLength(3);
  expect(html).toContain('class="today"');
  expect(printPx("A3", 120, 190)).toBeGreaterThan(printPx("A4", 120, 190));
  expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
});

test("Ajanda şeritleri ve takvim sekmesine derin bağlantı", () => {
  const periods = [
    { ...per(1, 7, "Kayıt", "2026-11-03", "2026-11-12"), project: { id: 7 }, occurrence_key: "a" },
    { ...per(2, 7, "Tanıtım", "2026-11-05", "2026-11-20"), project: { id: 7 }, occurrence_key: "b" },
    { ...per(3, 8, "Kura", "2026-11-14", "2026-11-14"), kind: "milestone", project: { id: 8 }, occurrence_key: "c" },
  ];
  const bands = periodBands(periods);
  expect(bands.lanes).toBe(2);
  const d = bandsOnDay(bands, new Date(2026, 10, 15));
  expect(d.lanes[0]).toBeNull();
  expect(d.lanes[1]).toMatchObject({ part: "middle" });
  expect(bandsOnDay(bands, new Date(2026, 10, 14)).milestones).toHaveLength(1);
  expect(periodBands(periods, { hidden: [7] }).ranged).toEqual([]);
  expect(projectRoute({ project_id: 7, tab: "takvim" })).toEqual({ id: 7, tab: "timeline" });
});
