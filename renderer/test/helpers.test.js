import { groupTodos, parseQuickTask, toVCard, prettyPhone } from "../src/lib/helpers";
import { toIcs } from "../src/lib/ics";

describe("hızlı görev ayrıştırma", () => {
  const now = new Date(2026, 10, 4, 10, 0); // 4 Kasım 2026 Çarşamba 10:00
  test("yarın + saat + öncelik", () => {
    const r = parseQuickTask("yarın 14:00 sahayı ara !", now);
    expect(r.title).toBe("sahayı ara");
    expect(r.priority).toBe("high");
    const d = new Date(r.dueAt);
    expect([d.getDate(), d.getHours(), d.getMinutes()]).toEqual([5, 14, 0]);
  });
  test("gün adı: cuma 20.30", () => {
    const d = new Date(parseQuickTask("cuma 20.30 hakem toplantısı", now).dueAt);
    expect([d.getDay(), d.getHours(), d.getMinutes()]).toEqual([5, 20, 30]);
  });
  test("geçmiş saat ertesi güne kayar; tarihsiz metin tarihsiz kalır", () => {
    expect(new Date(parseQuickTask("09:00 rapor", now).dueAt).getDate()).toBe(5);
    expect(parseQuickTask("forma siparişi", now)).toEqual({ title: "forma siparişi", dueAt: null, priority: "normal" });
  });
});

test("görevler gecikmiş / bugün / yaklaşan / tarihsiz / tamamlanan olarak gruplanır", () => {
  const now = new Date(2026, 10, 4, 12, 0);
  const g = groupTodos([
    { id: 1, status: "open", dueAt: new Date(2026, 10, 3, 9).toISOString() },
    { id: 2, status: "open", dueAt: new Date(2026, 10, 4, 18).toISOString() },
    { id: 3, status: "open", dueAt: new Date(2026, 10, 6, 9).toISOString() },
    { id: 4, status: "in_progress", dueAt: null },
    { id: 5, status: "done", dueAt: null },
  ], now);
  expect(Object.fromEntries(Object.entries(g).map(([k, v]) => [k, v.map((t) => t.id)]))).toEqual({ overdue: [1], today: [2], upcoming: [3], nodate: [4], done: [5] });
});

test("vCard ve telefon biçimi", () => {
  const v = toVCard([{ name: "Kerem Aksoy", phone: "05551234567", email: "k@x.com", company: "Hakem Kurulu" }]);
  expect(v).toContain("FN:Kerem Aksoy");
  expect(v).toContain("TEL;TYPE=CELL:05551234567");
  expect(prettyPhone("05551234567")).toBe("0555 123 45 67");
});

test(".ics: tekrar kuralı, tüm gün, hatırlatma; tekrar eden etkinlik bir kez yazılır", () => {
  const ics = toIcs([
    { id: 1, title: "Lig maçları", start_at: "2026-11-05T17:00:00Z", end_at: "2026-11-05T20:00:00Z", recurrence: "weekly", repeat_until: "2026-12-31", remind_minutes: 60 },
    { id: 1, title: "Lig maçları", start_at: "2026-11-05T17:00:00Z", recurrence: "weekly" },
    { id: 2, title: "Saha; kira, ödemesi", start_at: "2026-11-08T00:00:00", end_at: "2026-11-08T23:59:00", all_day: true, recurrence: "none" },
  ], { now: new Date("2026-11-04T00:00:00Z") });
  expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
  expect(ics).toContain("RRULE:FREQ=WEEKLY;UNTIL=20261231T235959Z");
  expect(ics).toContain("TRIGGER:-PT60M");
  expect(ics).toContain("DTSTART;VALUE=DATE:20261108");
  expect(ics).toContain("DTEND;VALUE=DATE:20261109");
  expect(ics).toContain(String.raw`SUMMARY:Saha\; kira\, ödemesi`);
});
