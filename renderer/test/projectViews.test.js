import { PROJECT_VIEWS, sortProjects } from "../src/lib/projectViews";

const p = (id, name, extra = {}) => ({ id, name, end_date: null, stats: { steps: { progress: 0, overdue: 0 } }, ...extra });

test("görünümler: kartlar, geniş, sıkı, liste, tablo", () => {
  expect(PROJECT_VIEWS.map((v) => v.key)).toEqual(["cards", "wide", "compact", "list", "table"]);
});

test("sıralama: ad (Türkçe), ilerleme, bitiş, geciken, son güncellenen", () => {
  const items = [
    p(1, "Şampiyonlar", { end_date: "2026-12-01", updatedAt: "2026-11-01", stats: { steps: { progress: 80, overdue: 0 } } }),
    p(2, "Çocuk ligi", { end_date: null, updatedAt: "2026-11-09", stats: { steps: { progress: 10, overdue: 5 } } }),
    p(3, "Elit Junior", { end_date: "2026-11-20", updatedAt: "2026-10-01", stats: { steps: { progress: 40, overdue: 2 } } }),
  ];
  expect(sortProjects(items, "name").map((x) => x.id)).toEqual([2, 3, 1]);
  expect(sortProjects(items, "progress").map((x) => x.id)).toEqual([2, 3, 1]);
  expect(sortProjects(items, "end").map((x) => x.id)).toEqual([3, 1, 2]);
  expect(sortProjects(items, "overdue").map((x) => x.id)).toEqual([2, 3, 1]);
  expect(sortProjects(items, "updated").map((x) => x.id)).toEqual([2, 1, 3]);
  expect(items.map((x) => x.id)).toEqual([1, 2, 3]);
});
