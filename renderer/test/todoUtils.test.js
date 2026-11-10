import { autofill, boardAddBody, buildLineupMessage, dateBucket, endOfDay, groupRows, orderAfterDrop, slotsFor, sortColumn, toDraft, toPayload, viewsFor, whatsappNumber } from "../src/views/todos/todoUtils";

const now = new Date(2026, 10, 4, 12, 0);
const at = (d, h = 10) => new Date(2026, 10, d, h).toISOString();
const task = (id, extra = {}) => ({ id, title: `Kart ${id}`, status: "open", priority: "normal", source: "own", permissions: { isOwner: true, canChangeStatus: true }, ...extra });

test("tarih kovaları ve görünümler", () => {
  expect(dateBucket(task(1, { dueAt: at(3), overdue: true }), now)).toBe("overdue");
  expect(dateBucket(task(2, { dueAt: at(4, 20) }), now)).toBe("today");
  expect(dateBucket(task(3, { dueAt: at(5) }), now)).toBe("tomorrow");
  expect(dateBucket(task(4, { dueAt: at(9) }), now)).toBe("week");
  expect(dateBucket(task(5), now)).toBe("none");
  const items = [task(1, { dueAt: at(3), overdue: true }), task(2, { dueAt: at(6) }), task(3, { source: "assigned_by_me", permissions: { isOwner: false } }), task(4, { source: "system", kind: "match_duty", labels: [{ text: "yayın", color: "blue" }] })];
  const views = viewsFor(items, { canOversee: true, now });
  const keys = views.map((v) => v.key);
  expect(keys).toEqual(expect.arrayContaining(["today", "upcoming", "all", "assigned_to_me", "assigned_by_me", "system", "team", "label:yayın", "done"]));
  const today = views.find((v) => v.key === "today");
  expect(items.filter(today.match).map((t) => t.id)).toEqual([1]);
});

test("gruplar: geciken önce, atadıklarım kişiye göre, tamamlanan kapalı", () => {
  const items = [task(1, { dueAt: at(3), overdue: true }), task(2, { dueAt: at(4, 18) }), task(3, { status: "done" }), task(4, { source: "assigned_by_me", permissions: { isOwner: false }, owner: { name: "Zeynep" } })];
  const g = groupRows(items, { view: "all", now });
  expect(g.map((x) => x.key)).toEqual(["overdue", "today", "delegated", "done"]);
  expect(g.find((x) => x.key === "done").collapsed).toBe(true);
  const people = groupRows(items.filter((t) => t.source === "assigned_by_me"), { view: "assigned_by_me", now });
  expect(people[0].label).toBe("Zeynep");
});

test("pano sırası ve bırakma", () => {
  const col = sortColumn([task(1, { position: 1 }), task(2, { position: 0 }), task(3, { pinned: true, position: 5 })], "open");
  expect(col.map((t) => t.id)).toEqual([3, 2, 1]);
  expect(orderAfterDrop([1, 2, 3], 3, 1)).toEqual([3, 1, 2]);
  expect(orderAfterDrop([1, 2], 9, null)).toEqual([1, 2, 9]);
});

test("WhatsApp kadro talebi", () => {
  expect(whatsappNumber("0555 123 45 67")).toBe("905551234567");
  const { link, text } = buildLineupMessage({ member: true, team: { name: "Kartallar", contact: { name: "Burak" } }, match: { id: 55, label: "Kartallar - Şimşekler" } });
  expect(link).toBe("https://elitlig.com/panel?mac=55");
  expect(text).toMatch(/^Merhaba Burak, Kartallar - Şimşekler maçı için Kartallar kadrosunu/);
  expect(buildLineupMessage({ member: false, team: {}, match: { id: 1 } }).link).toBe("https://elitlig.com/kayit-ol");
});

test("haftanın enleri: yuvalar, taslak dönüşümü, en çok oyla doldurma", () => {
  expect(slotsFor("1-3-2-1")).toEqual(["GK1", "DEF1", "DEF2", "DEF3", "MID1", "MID2", "FWD1"]);
  const draft = toDraft({ individual: { WEEKLY_PLAYER: { player: { id: 3, name: "Can" }, note: "2 gol" } }, team: { team_id: 4, info: { id: 4, name: "Kartallar" } }, squad: null });
  expect(toPayload(draft)).toEqual({ individual: { WEEKLY_PLAYER: { player_id: 3, note: "2 gol" } }, team: { team_id: 4, note: null }, squad: null, note: null });
  const sug = { individual: { WEEKLY_GOALKEEPER: [{ id: 9, name: "Kaleci", votes: 3 }] }, squad: { GK: [{ id: 9, name: "Kaleci" }], DEF: [{ id: 1 }, { id: 2 }, { id: 3 }], MID: [{ id: 4 }, { id: 5 }], FWD: [{ id: 6 }] }, formations: [{ formation: "1-3-2-1", votes: 2 }] };
  const filled = autofill(draft, sug, { categories: ["WEEKLY_PLAYER", "WEEKLY_GOALKEEPER", "WEEKLY_SQUAD_PLAYER"], squadSize: 7 });
  expect(filled.individual.WEEKLY_PLAYER.player.id).toBe(3);
  expect(filled.individual.WEEKLY_GOALKEEPER.player.id).toBe(9);
  expect(filled.squad.formation).toBe("1-3-2-1");
  expect(Object.keys(filled.squad.slots)).toHaveLength(7);
});

describe("boardAddBody (pano 'Kart ekle')", () => {
  const now = new Date(2026, 10, 10, 9, 0);
  it("tek proje kapsamında kartı projeye bağlar", () => {
    expect(boardAddBody("open", "DENEME", { viewKey: "all", project: { id: 5, name: "ELİTLİG TÜRKİYE" } }, now))
      .toEqual({ kind: "task", title: "DENEME", status: "open", project_id: 5 });
  });
  it("etiket ve Bugün/Yaklaşan gününü işler", () => {
    const label = { text: "acil", color: "red" };
    expect(boardAddBody("doing", "x", { viewKey: "today", label }, now)).toMatchObject({ labels: [label], due_at: endOfDay(0, now) });
    expect(boardAddBody("open", "x", { viewKey: "upcoming" }, now).due_at).toBe(endOfDay(1, now));
    expect(boardAddBody("open", "x", {}, now)).toEqual({ kind: "task", title: "x", status: "open" });
  });
});
