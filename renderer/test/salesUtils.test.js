import { computeTotals, daysLeft, displayNumber, fileSafe, insertAt, isValidEmail, packageItem, packagePrices, parseAmount, usedVariables } from "../src/lib/salesUtils";

test("teklif toplamları: indirim, KDV dökümü, genel toplam (sunucuyla aynı)", () => {
  const t = computeTotals([
    { description: "Altın paket", quantity: 1, unit_price: "350.000", discount: 10, vat_rate: 20 },
    { description: "Forma", quantity: 120, unit_price: "85,50", vat_rate: 10 },
    { description: "Ödül", quantity: 3, unit_price: 1000, vat_rate: 0 },
  ]);
  expect(t.subtotal).toBe(363260);
  expect(t.discount_total).toBe(35000);
  expect(t.vat_total).toBe(64026);
  expect(t.total).toBe(392286);
  expect(t.vat_breakdown.map((v) => [v.rate, v.base, v.vat])).toEqual([[20, 315000, 63000], [10, 10260, 1026], [0, 3000, 0]]);
});

test("paket fiyatı ve teklif kalemi", () => {
  expect(packagePrices({ price: 100000, vat_rate: 20 })).toEqual({ net: 100000, vat: 20000, gross: 120000 });
  expect(packagePrices({ price: 120000, vat_rate: 20, price_includes_vat: true })).toEqual({ net: 100000, vat: 20000, gross: 120000 });
  expect(packagePrices({ price: "" }).net).toBeNull();
  expect(packageItem({ id: 4, name: "Gümüş", price: 50000, vat_rate: 20, duration: "1 sezon" })).toMatchObject({ description: "Gümüş sponsorluk paketi", unit_price: 50000, package_id: 4, details: "1 sezon" });
});

test("yardımcılar: tutar, numara, değişken, adres, dosya adı, kalan gün", () => {
  expect(parseAmount("12.500,50")).toBe(12500.5);
  expect(Number.isNaN(parseAmount("x"))).toBe(true);
  expect(displayNumber("TKL-2026-0012", 2)).toBe("TKL-2026-0012-R2");
  expect(insertAt("Merhaba ", null, null, "{{ilk_ad}}")).toEqual({ value: "Merhaba {{ilk_ad}}", caret: 18 });
  expect(usedVariables("{{ Gönderen }} {{sunum_linki}}")).toEqual(["gonderen", "sunum_linki"]);
  expect(isValidEmail("a@b.com")).toBe(true);
  expect(isValidEmail("a@b")).toBe(false);
  expect(fileSafe("TKL/2026: Teklif?")).toBe("TKL-2026- Teklif-");
  expect(daysLeft("2026-11-15", new Date(2026, 10, 10))).toBe(5);
});
