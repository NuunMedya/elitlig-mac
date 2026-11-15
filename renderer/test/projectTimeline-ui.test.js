// @vitest-environment jsdom
// Proje takvimi bileşeni: birden çok proje satırı, fareyle sürükleyerek tarih
// değiştirme (PATCH), boş alanda sürükleyerek yeni dönem, izleyici taşıyamaz.
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { addDays, todayDay, windowFor } from "../src/lib/timelineUtils";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const T = todayDay();
const per = (id, project_id, name, start, end, extra = {}) => ({ id, project_id, kind: "period", name, stage: "preparation", color: "#0ea5e9", start_date: start, end_date: end, progress: 0, depends_on: null, phase_ids: [], ...extra });
const A = { id: 1, name: "A Ligi", color: "#7c3aed", can_edit: true, periods: [per(11, 1, "Hazırlık", T, addDays(T, 9)), per(12, 1, "Organizasyon", addDays(T, 10), addDays(T, 30), { stage: "execution" })] };
const B = { id: 2, name: "B Kupası", color: "#16a34a", can_edit: false, periods: [per(21, 2, "Turnuva", addDays(T, 20), addDays(T, 25), { stage: "execution" })] };
const calls = [];
const noop = () => () => {};
window.elitlig = {
  request: async (o) => {
    calls.push(o);
    if (o.path.endsWith("/timeline")) return { ok: true, data: { projects: [A, B], people: {}, meta: { presets: [{ key: "hazirlik", label: "Hazırlık", stage: "preparation", color: "#0ea5e9" }], milestones: [], stages: [{ key: "execution", label: "Uygulama" }], templates: [] } } };
    if (o.path.endsWith("/people")) return { ok: true, data: { items: [{ id: 1, name: "Ayşe" }] } };
    if (o.method === "PATCH") return { ok: true, data: { items: A.periods.map((p) => (p.id === 11 ? { ...p, ...o.body } : p)), project: {}, warnings: [] } };
    if (o.method === "POST") return { ok: true, data: { item: { id: 99 }, items: A.periods, project: {}, warnings: [] } };
    return { ok: true, data: { items: [], phases: [] } };
  },
  sync: { onDone: noop }, onCommand: noop,
};
const mouse = (target, type, clientX) => act(async () => { target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX })); });

test("Gantt: sürükle-bırak 5 gün taşır, boş alanda seçim yeni dönem penceresini açar", async () => {
  localStorage.setItem("projects:timeline:scale", "month");
  const { default: Timeline } = await import("../src/views/projects/timeline/Timeline");
  const { ToastProvider, ConfirmProvider } = await import("../src/components/ui");
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => { root.render(React.createElement(ToastProvider, null, React.createElement(ConfirmProvider, null, React.createElement(Timeline, { onOpenProject: () => {} })))); });
  await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
  expect(host.querySelectorAll(".ptl-row:not(.ptl-row--load)").length).toBe(2);
  expect(host.querySelector(".ptl-load.is-conflict").dataset.count).toBe("2");

  const bar = host.querySelector('.ptl-bar[data-period-id="11"]');
  const left0 = parseFloat(bar.style.left);
  await mouse(bar, "mousedown", 200);
  await mouse(window, "mousemove", 200 + 12 * 5);
  expect(parseFloat(host.querySelector('.ptl-bar[data-period-id="11"]').style.left)).toBe(left0 + 60); // önizleme: 5 gün × 12 px
  await mouse(window, "mouseup", 200 + 12 * 5);
  await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
  const patchCall = calls.find((c) => c.method === "PATCH");
  expect(patchCall).toMatchObject({ path: "/api/tools/projects/1/periods/11", body: { start_date: addDays(T, 5), end_date: addDays(T, 14) }, queue: false });

  // İzleyici projesinin çubuğu taşınmaz.
  const n = calls.length;
  const viewerBar = host.querySelector('.ptl-bar[data-period-id="21"]');
  expect(viewerBar.querySelector("[data-handle]")).toBeNull();
  await mouse(viewerBar, "mousedown", 300);
  await mouse(window, "mouseup", 400);
  expect(calls.slice(n).some((c) => c.method === "PATCH")).toBe(false);

  // Boş alanda 4. günden 12. güne sürükle → "Yeni dönem" penceresi o aralıkla.
  const { from } = windowFor("month", T);
  const canvas = host.querySelector('.ptl-canvas[data-row="pr-1"]');
  await mouse(canvas, "mousedown", 12 * 4 + 2);
  await mouse(window, "mousemove", 12 * 12 + 2);
  expect(canvas.querySelector(".ptl-select")).not.toBeNull();
  await mouse(window, "mouseup", 12 * 12 + 2);
  const dialog = document.querySelector('[role="dialog"]');
  expect(dialog.textContent).toContain("Yeni dönem");
  expect(dialog.querySelector('input[aria-label="Başlangıç"]').value).toBe(addDays(from, 4));
  expect(dialog.querySelector('input[aria-label="Bitiş"]').value).toBe(addDays(from, 12));
  await act(async () => { root.unmount(); });
});
