import { eventPayload, itemsOnDay, monthGrid, rangeFor, shiftCursor, dueReminders } from "../src/lib/agendaUtils";
import { filterEntries, parseAmount, periodRange, splitVat, toCsv, totals } from "../src/lib/ledgerUtils";
import { dateDiff, discountChain, evaluate, installment, splitCost, vat } from "../src/lib/calcUtils";
import { waNumber, letterOf } from "../src/lib/helpers";
import { matchesQuery } from "../src/lib/helpers";
import { formatClock } from "../src/lib/helpers";

describe("ajanda", () => {
  test("ay ızgarası pazartesi başlar ve 42 gündür", () => {
    const days = monthGrid(2026, 10); // Kasım 2026: 1 Kasım pazar
    expect(days).toHaveLength(42);
    expect(days[0].getDay()).toBe(1);
    expect(days[0].getDate()).toBe(26);
    expect(days[6].getDate()).toBe(1);
  });

  test("hafta aralığı ve gezinme", () => {
    const { from, to } = rangeFor("week", new Date(2026, 10, 4, 15));
    expect(from.getDate()).toBe(2);
    expect(to.getDate()).toBe(8);
    expect(shiftCursor("month", new Date(2026, 0, 31), 1).getMonth()).toBe(1);
  });

  test("birden çok güne yayılan etkinlik her güne düşer, tüm gün olan önce gelir", () => {
    const items = [
      { occurrence_key: "a", occurrence_start: new Date(2026, 10, 3, 9).toISOString(), occurrence_end: null, all_day: false },
      { occurrence_key: "b", occurrence_start: new Date(2026, 10, 2, 0).toISOString(), occurrence_end: new Date(2026, 10, 4, 23, 59).toISOString(), all_day: true },
    ];
    expect(itemsOnDay(items, new Date(2026, 10, 3)).map((i) => i.occurrence_key)).toEqual(["b", "a"]);
    expect(itemsOnDay(items, new Date(2026, 10, 5))).toHaveLength(0);
  });

  test("tüm gün formu gün başı/sonuna çekilir, tekrar yoksa bitiş tarihi gönderilmez", () => {
    const payload = eventPayload({ title: "Turnuva", all_day: true, start_date: "2026-11-07", end_date: "2026-11-08", recurrence: "none", repeat_until: "2026-12-01", remind_minutes: "60" });
    expect(new Date(payload.start_at).getHours()).toBe(0);
    expect(new Date(payload.end_at).getDate()).toBe(8);
    expect(payload.repeat_until).toBeNull();
    expect(payload.remind_minutes).toBe(60);
  });

  test("zamanı gelen hatırlatmalar", () => {
    const now = new Date(2026, 10, 3, 9, 50);
    const items = [
      { source: "event", remind_minutes: 10, occurrence_start: new Date(2026, 10, 3, 10).toISOString() },
      { source: "event", remind_minutes: 60, occurrence_start: new Date(2026, 10, 3, 12).toISOString() },
    ];
    expect(dueReminders(items, now)).toHaveLength(1);
  });
});

describe("ön muhasebe", () => {
  test("tutar ayrıştırma Türkçe yazımı anlar", () => {
    expect(parseAmount("1.250,50")).toBe(1250.5);
    expect(parseAmount("1.250")).toBe(1250);
    expect(parseAmount("12.5")).toBe(12.5);
    expect(parseAmount("₺ 300")).toBe(300);
  });

  test("KDV dahil tutardan matrah", () => {
    expect(splitVat("1200", 20)).toEqual({ gross: 1200, net: 1000, vat: 200 });
  });

  test("dönem aralıkları", () => {
    const today = new Date(2026, 10, 3);
    expect(periodRange("this_month", today)).toEqual({ from: "2026-11-01", to: "2026-11-30" });
    expect(periodRange("last_month", today)).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(periodRange("this_quarter", today)).toEqual({ from: "2026-10-01", to: "2026-12-31" });
    expect(periodRange("all", today)).toEqual({ from: "", to: "" });
  });

  test("süzme ve toplamlar; CSV Excel için noktalı virgüllü", () => {
    const entries = [
      { id: 1, type: "income", amount: 500, status: "paid", party: "Yıldız FK", category: "Saha kirası", vat_amount: 0, net_amount: 500, vat_rate: 0, method: "bank", entry_date: "2026-11-01" },
      { id: 2, type: "expense", amount: 200, status: "pending", due_date: "2000-01-01", description: "Hakem; 12. hafta", vat_amount: 0, net_amount: 200, vat_rate: 0, method: "cash", entry_date: "2026-11-02" },
    ];
    expect(filterEntries(entries, { query: "yıldız" })).toHaveLength(1);
    expect(filterEntries(entries, { status: "overdue" }).map((e) => e.id)).toEqual([2]);
    expect(filterEntries([...entries, { id: 3, type: "income", amount: 1, status: "paid", account_id: 7, entry_date: "2026-11-03" }], { account: "7" }).map((e) => e.id)).toEqual([3]);
    expect(filterEntries([...entries, { id: 3, type: "income", amount: 1, status: "paid", account_id: 7, entry_date: "2026-11-03" }], { account: "none" }).map((e) => e.id)).toEqual([1, 2]);
    expect(totals(entries)).toEqual({ count: 2, income: 500, expense: 200, net: 300 });
    const csv = toCsv(entries);
    expect(csv.startsWith("﻿Tarih;Tür")).toBe(true);
    expect(csv).toContain('"Hakem; 12. hafta"');
    expect(csv).toContain("500,00");
  });
});

describe("hesap araçları", () => {
  test("KDV ekleme ve ayırma", () => {
    expect(vat(1000, 20, "exclude")).toEqual({ net: 1000, vat: 200, gross: 1200 });
    expect(vat(1200, 20, "include")).toEqual({ net: 1000, vat: 200, gross: 1200 });
  });

  test("masraf bölüştürme yukarı yuvarlar ve fazlayı gösterir", () => {
    expect(splitCost(4200, 14, 0)).toMatchObject({ perPerson: 300, surplus: 0 });
    expect(splitCost(4000, 14, 5)).toMatchObject({ perPerson: 290, collected: 4060, surplus: 60 });
  });

  test("art arda iskonto ve taksit", () => {
    expect(discountChain(1000, [10, 10])).toMatchObject({ final: 810, effectiveRate: 19 });
    expect(installment(1200, 12, 0)).toMatchObject({ monthly: 100, interest: 0 });
    expect(installment(10000, 12, 2).monthly).toBeCloseTo(945.6, 1);
  });

  test("tarih farkı iş günlerini sayar", () => {
    expect(dateDiff("2026-11-02", "2026-11-09")).toEqual({ days: 7, weeks: 1, workdays: 5 });
  });

  test("hesap makinesi eval kullanmadan hesaplar", () => {
    expect(evaluate("2+3×4")).toBe(14);
    expect(evaluate("(2+3)×4")).toBe(20);
    expect(evaluate("200×15%")).toBe(30);
    expect(evaluate("10÷4")).toBe(2.5);
    expect(evaluate("1,5+1,5")).toBe(3);
    expect(evaluate("5÷0")).toBeNull();
    expect(evaluate("alert(1)")).toBeNull();
    expect(evaluate("2+")).toBeNull();
  });
});

describe("rehber, not defteri, odak sayacı", () => {
  test("WhatsApp numarası uluslararası biçime çevrilir", () => {
    expect(waNumber("0555 123 45 67")).toBe("905551234567");
    expect(waNumber("555 123 45 67")).toBe("905551234567");
    expect(waNumber("+90 (555) 123-4567")).toBe("905551234567");
  });

  test("harf dizini Türkçe harfleri tanır", () => {
    expect(letterOf("şükrü")).toBe("Ş");
    expect(letterOf("ismail")).toBe("İ");
    expect(letterOf("123")).toBe("#");
  });

  test("not araması başlık, metin, madde ve etikette arar", () => {
    const note = { title: "Malzeme", body: "", checklist: [{ text: "Krampon", done: false }], tags: ["Saha"] };
    expect(matchesQuery(note, "kramp")).toBe(true);
    expect(matchesQuery(note, "saha")).toBe(true);
    expect(matchesQuery(note, "forma")).toBe(false);
  });

  test("saat biçimi", () => {
    expect(formatClock(25 * 60000)).toBe("25:00");
    expect(formatClock(3723400, true)).toBe("1:02:03.4");
  });
});
