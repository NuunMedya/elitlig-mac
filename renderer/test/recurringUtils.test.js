import { budgetBar, daysText, endModeOf, monthTitle, recurringCsv, shiftMonth, withBalance } from "../src/lib/recurringUtils";

test("ay kaydırma ve başlık", () => {
  expect(shiftMonth("2026-11", 2)).toBe("2027-01");
  expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  expect(monthTitle("2026-02")).toBe("Şubat 2026");
});

test("gün metni, bitiş türü, dönem sonu bakiyesi", () => {
  expect(daysText(-2)).toBe("2 gün geçti");
  expect(daysText(0)).toBe("Bugün");
  expect(daysText(1)).toBe("Yarın");
  expect(endModeOf({ total_count: 12 })).toBe("count");
  expect(endModeOf({ end_date: "2027-01-01" })).toBe("date");
  expect(endModeOf({})).toBe("none");
  expect(withBalance([{ net: -500 }, { net: 200 }], 1000).map((r) => r.balance)).toEqual([500, 700]);
});

test("bütçe çubuğu ve CSV", () => {
  expect(budgetBar({ amount: 1000, actual: 600, pending: 300 })).toMatchObject({ paid: 60, pending: 30, over: false, warn: true });
  expect(budgetBar({ amount: 1000, actual: 900, pending: 300 })).toMatchObject({ paid: 90, pending: 10, over: true });
  const csv = recurringCsv([{ name: "Elektrik; ofis", kind: "bill", type: "expense", amount: 1250.5, monthly_amount: 1250.5, frequency: "monthly", active: true }]);
  expect(csv).toContain('"Elektrik; ofis";Fatura;Gider;;1250,50');
});
