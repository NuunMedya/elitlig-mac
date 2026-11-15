// Projeler ↔ Yapılacaklar: etap etiketi yardımcıları (lib/projectPhases.js),
// "Etaba göre" gruplama (todoUtils.groupRows) ve Süreç'te Askıda grubu.
import { UNLABELED_LONG, deleteQuestion, mergeProjectItems, phaseChipOf, phaseGroups, phasePayload, phasesOf } from "../src/lib/projectPhases";
import { groupRows } from "../src/views/todos/todoUtils";
import { groupStepsByPhase } from "../src/lib/projectUtils";

const PLAN = { id: 11, name: "Planlama", color: "#7c3aed" };
const card = (id, project, extra = {}) => ({ id, title: `Kart ${id}`, kind: project ? "project_step" : "task", status: "open", priority: "normal", dueAt: null, source: "own", permissions: { isOwner: true }, project, isProjectStep: Boolean(project), ...extra });
const proj = (extra = {}) => ({ id: 7, name: "Yaz Kupası", color: "#0ea5e9", phase: null, unlabeled: false, ...extra });

test("etap çipi: aşama rengiyle; etapsız proje adımı Askıda; proje dışı yok", () => {
  expect(phaseChipOf(card(1, proj({ phase: PLAN })))).toEqual({ text: "Planlama", color: "#7c3aed", unlabeled: false });
  expect(phaseChipOf(card(2, proj({ unlabeled: true })))).toMatchObject({ text: "Askıda", unlabeled: true });
  expect(phaseChipOf(card(3, null))).toBeNull();
});

test("etap seçimi gövdesi: var olan, Askıda, yeni etap; değişmeyen gönderilmez", () => {
  expect(phasePayload("11", "", undefined)).toEqual({ phase_id: 11 });
  expect(phasePayload("", "", undefined)).toEqual({});
  expect(phasePayload("new", " Lojistik ", undefined)).toEqual({ phase_name: "Lojistik" });
  expect(phasePayload("new", "", 11)).toEqual({});
  expect(phasePayload("", "", 11)).toEqual({ phase_id: null });
  expect(phasePayload("11", "", 11)).toEqual({});
  expect(phasesOf([{ id: 7, phases: [PLAN] }], 7)).toEqual([PLAN]);
  expect(phasesOf([], 7)).toEqual([]);
});

test("Etaba göre gruplama: etaplar, Askıda, proje dışı", () => {
  const items = [card(1, proj({ unlabeled: true })), card(2, proj({ phase: PLAN })), card(3, null)];
  expect(phaseGroups(items).map((g) => g.label)).toEqual(["Planlama", UNLABELED_LONG, "Proje dışı"]);
  const rows = groupRows(items, { view: "all", groupBy: "phase" });
  expect(rows.map((g) => g.label)).toEqual(["Planlama", UNLABELED_LONG, "Proje dışı"]);
  expect(rows[0].color).toBe("#7c3aed");
});

test("tek proje kapsamı: başka üyelerdeki kartlar eklenir, kopya olmaz; silme uyarısı", () => {
  const mine = [card(1, proj()), card(2, null)];
  expect(mergeProjectItems(mine, [card(1, proj()), card(9, proj())]).map((t) => t.id)).toEqual([1, 2, 9]);
  expect(deleteQuestion(card(1, proj()))).toMatch(/adım da “Yaz Kupası” projesinden silinir/);
  expect(deleteQuestion(card(2, null))).toBe("“Kart 2” silinsin mi?");
});

test("Süreç: düzenleyende boş olsa da Askıda grubu", () => {
  const phases = [{ id: 1, name: "Planlama", position: 0 }];
  expect(groupStepsByPhase(phases, []).map((g) => g.key)).toEqual(["1"]);
  expect(groupStepsByPhase(phases, [], { alwaysLoose: true }).map((g) => g.key)).toEqual(["1", "none"]);
});
