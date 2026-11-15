import { describe, expect, it } from "vitest";
import { CODE39, code39Bars, code39Svg, code39Text, filterParams, holderPayload, includesFold, labelSheetHtml, parseAmount, previewValue, receiptHtml, rowsToObjects, selectionSummary, todaySummary } from "../src/lib/equipmentUtils";

describe("ekipman yardımcıları", () => {
  it("Code 39: tablo, sadeleştirme ve SVG", () => {
    const values = Object.values(CODE39);
    expect(new Set(values).size).toBe(values.length);
    values.forEach((bits) => expect([...bits].filter((b) => b === "1")).toHaveLength(3));
    expect(code39Text("eq-0042")).toBe("EQ-0042");
    expect(code39Text("Şut-1")).toBe("SUT-1");
    expect(code39Text("a*b")).toBeNull();
    expect(code39Bars("A").bars).toHaveLength(15);
    expect(code39Svg("EQ-1")).toContain('aria-label="Barkod EQ-1"');
  });

  it("tutar, önizleme, süzgeç ve kişi gövdesi", () => {
    expect(parseAmount("3.500")).toBe(3500);
    expect(parseAmount("1.234,56")).toBe(1234.56);
    expect(previewValue({ purchase_price: "1000", life_years: "2", salvage_value: "100", purchase_date: "2001-01-01", tracking: "unit" }).book).toBe(100);
    expect(filterParams({ q: "", status: ["broken"], alert: "overdue" })).toEqual({ status: "broken", alert: "overdue" });
    expect(holderPayload({ type: "user", id: 7 })).toEqual({ holder_type: "user", holder_user_id: 7, holder_phone: undefined });
    expect(includesFold("İSTANBUL Depo", "istanbul")).toBe(true);
    expect(selectionSummary([{ id: 1, can_edit: true, tracking: "bulk", available_quantity: 3, book_value: 10 }], [1]).assignable).toEqual([1]);
    expect(rowsToObjects([["Ad", "Adet"], ["Top", "40"]])).toEqual([{ Ad: "Top", Adet: "40" }]);
  });

  it("tutanak ve etiket HTML'i betik içermez (ana süreç yazdırır)", () => {
    const html = receiptHtml({ assignments: [{ id: 1, kind: "checkout", holder_name: "Reji", asset_tag: "EQ-0001", item_name: "Kamera", start_at: "2026-11-10T10:00:00Z", due_at: "2026-11-11T10:00:00Z" }] });
    expect(html).toContain("ÇIKIŞ / TESLİM FORMU");
    expect(html).not.toContain("<script");
    const labels = labelSheetHtml([{ asset_tag: "EQ-0001", name: "Kamera" }], { size: "large", origin: "https://elitlig.com" });
    expect(labels).toContain("grid-template-columns:repeat(2,1fr)");
    expect(labels).not.toContain("<script");
  });

  it("Bugün özeti: benim gecikenim ve yaklaşan iadem, geciken iadeler ve bakım", () => {
    const now = Date.now();
    const dash = { totals: { items: 5, assigned: 2, in_use: 1, overdue_returns: 1, maintenance_due: 1, low_stock: 0, open_faults: 0 },
      alerts: { overdue_returns: [{ id: 3, item_id: 9, item_name: "Tripod", holder_name: "Ali", asset_tag: "EQ-9", days_late: 2 }], maintenance: [{ id: 4, name: "Jeneratör", asset_tag: "EQ-4", days_left: -1, state: "overdue" }] } };
    const mine = [{ id: 1, item_id: 1, item_name: "Kamera", asset_tag: "EQ-1", due_at: new Date(now - 3600000).toISOString() }, { id: 2, item_id: 2, item_name: "Lens", asset_tag: "EQ-2", due_at: new Date(now + 86400000).toISOString() }];
    const s = todaySummary(dash, mine);
    expect(s.myLate).toBe(1);
    expect(s.mySoon).toBe(1);
    expect(s.assigned).toBe(3);
    expect(s.rows.map((r) => r.key)).toEqual(["ml1", "ms2", "o3", "m4"]);
    expect(todaySummary(null)).toBeNull();
  });
});

describe("ekipman bağları", async () => {
  const { depreciationRows, matchReservationDefaults, personTone } = await import("../src/lib/equipmentUtils");
  it("Rehber kişisi contact olarak gönderilir (kişi seçici)", () => {
    expect(holderPayload({ type: "contact", id: 4 }, "", "0312")).toEqual({ holder_type: "contact", holder_contact_id: 4, holder_phone: "0312" });
    expect(holderPayload({ type: "user", id: 15 })).toEqual({ holder_type: "user", holder_user_id: 15, holder_phone: undefined });
  });
  it("maç seçilince rezervasyon adı ve saati maçtan önerilir", () => {
    const d = matchReservationDefaults({ date: "2026-11-19", time: "21:00", label: "Kartal FK – Yıldız Spor" });
    expect(d.title).toBe("Kartal FK – Yıldız Spor maçı");
    expect(d.end - d.start).toBe(6 * 3600000);
    expect(matchReservationDefaults({ date: "2026-11-19", time: "21:00", label: "X" }, "Final yayını").title).toBe("Final yayını");
    expect(matchReservationDefaults({})).toBeNull();
  });
  it("amortisman raporu satırları ve avatar rengi", () => {
    const rows = depreciationRows({ year: 2026, rows: [{ asset_tag: "EQ-0001", name: "Kamera", purchase_value: 185000, year_depreciation: 37000, accumulated: 43000, book_value: 142000, expensed: true }], totals: { count: 1, purchase_value: 185000, year_depreciation: 37000, accumulated: 43000, book_value: 142000 } });
    expect(rows).toHaveLength(2);
    expect(rows[0]["2026 amortismanı"]).toBe(37000);
    expect(rows[0]["Gider işlendi"]).toBe("Evet");
    expect(rows[1].Etiket).toBe("Toplam");
    expect(personTone("Ayşe")).toBe(personTone("Ayşe"));
  });
});
