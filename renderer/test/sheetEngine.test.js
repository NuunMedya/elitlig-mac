import { adjustFormula, colIndex, colName, createEvaluator, formatValue, parseCsv, parseLiteral, rangeStats, shiftFormula } from "../src/lib/sheets/sheetEngine";

const book = (cells, extra = []) => ({ sheets: [{ name: "Sayfa1", cells: Object.fromEntries(Object.entries(cells).map(([k, v]) => [k, { v }])) }, ...extra] });
const calc = (cells, key, extra) => createEvaluator(book(cells, extra)).value(0, key);
const shown = (cells, key) => formatValue(calc(cells, key));

test("sütun adları", () => {
  expect(colName(0)).toBe("A");
  expect(colName(25)).toBe("Z");
  expect(colName(26)).toBe("AA");
  expect(colIndex("AZ")).toBe(51);
});

test("Türkçe sayı, yüzde ve tarih yazımı", () => {
  expect(parseLiteral("1.250,50")).toBe(1250.5);
  expect(parseLiteral("12,5")).toBe(12.5);
  expect(parseLiteral("%18")).toBeCloseTo(0.18);
  expect(parseLiteral("3.5")).toBe(3.5);
  expect(parseLiteral("0.185")).toBe(0.185);
  expect(parseLiteral("1.250")).toBe(1250);
  expect(parseLiteral("31.12.2026")).toEqual({ date: 46387 });
  expect(parseLiteral("Ali")).toBe("Ali");
  expect(parseLiteral("doğru")).toBe(true);
});

test("dört işlem, öncelik, üs, yüzde ve metin birleştirme", () => {
  expect(calc({ A1: "=2+3*4" }, "A1")).toBe(14);
  expect(calc({ A1: "=(2+3)*4" }, "A1")).toBe(20);
  expect(calc({ A1: "=2^3^2" }, "A1")).toBe(512);
  expect(calc({ A1: "=-2^2" }, "A1")).toBe(4);
  expect(calc({ A1: "=200*15%" }, "A1")).toBe(30);
  expect(calc({ A1: "=1,5*2" }, "A1")).toBe(3);
  expect(calc({ A1: "Ali", B1: "=A1&\" Kaya\"" }, "B1")).toBe("Ali Kaya");
  expect(calc({ A1: "=10/0" }, "A1").code).toBe("#BÖL/0!");
});

test("hücre ve aralık başvuruları, Türkçe ve İngilizce işlevler", () => {
  const cells = { A1: "10", A2: "20", A3: "30", A4: "metin", B1: "=TOPLA(A1:A4)", B2: "=AVERAGE(A1:A3)", B3: "=MAK(A1:A3)-MİN(A1:A3)", B4: "=BAĞ_DEĞ_SAY(A1:A4)", B5: "=BAĞ_DEĞ_DOLU_SAY(A1:A4)", B6: "=YUVARLA(10/3; 2)", B7: "=SUM(A1,A2;5)" };
  const ev = createEvaluator(book(cells));
  expect(ev.value(0, "B1")).toBe(60);
  expect(ev.value(0, "B2")).toBe(20);
  expect(ev.value(0, "B3")).toBe(20);
  expect(ev.value(0, "B4")).toBe(3);
  expect(ev.value(0, "B5")).toBe(4);
  expect(ev.value(0, "B6")).toBe(3.33);
  expect(ev.value(0, "B7")).toBe(35);
});

test("EĞER, VE, EĞERHATA, ETOPLA, EĞERSAY, DÜŞEYARA", () => {
  const cells = {
    A1: "Ali", B1: "Ödendi", C1: "300",
    A2: "Veli", B2: "Bekliyor", C2: "300",
    A3: "Can", B3: "Ödendi", C3: "250",
    D1: "=EĞER(C1>=300; \"Tam\"; \"Eksik\")",
    D2: "=ETOPLA(B1:B3; \"Ödendi\"; C1:C3)",
    D3: "=EĞERSAY(C1:C3; \">=300\")",
    D4: "=DÜŞEYARA(\"can\"; A1:C3; 3; YANLIŞ)",
    D5: "=EĞERHATA(1/0; \"yok\")",
    D6: "=VE(C1>0; C3>300)",
    D7: "=IF(C3<300,\"Eksik\",\"Tam\")",
  };
  const ev = createEvaluator(book(cells));
  expect(ev.value(0, "D1")).toBe("Tam");
  expect(ev.value(0, "D2")).toBe(550);
  expect(ev.value(0, "D3")).toBe(2);
  expect(ev.value(0, "D4")).toBe(250);
  expect(ev.value(0, "D5")).toBe("yok");
  expect(ev.value(0, "D6")).toBe(false);
  expect(ev.value(0, "D7")).toBe("Eksik");
});

test("başka sayfaya başvuru ve hatalar", () => {
  const extra = [{ name: "Ekim Ayı", cells: { A1: { v: "5" } } }];
  expect(calc({ A1: "='Ekim Ayı'!A1*2" }, "A1", extra)).toBe(10);
  expect(calc({ A1: "=Yok!A1" }, "A1").code).toBe("#BAŞV!");
  expect(calc({ A1: "=BİLİNMEYEN(1)" }, "A1").code).toBe("#AD?");
  expect(calc({ A1: "=A2", A2: "=A1" }, "A1").code).toBe("#DÖNGÜ!");
  expect(calc({ A1: "=1+" }, "A1").code).toBe("#DEĞER!");
  expect(calc({ A1: "x", A2: "=A1*2" }, "A2").code).toBe("#DEĞER!");
  expect(calc({ A1: "=1/0", A2: "=A1+1" }, "A2").code).toBe("#BÖL/0!");
});

test("METNEÇEVİR / TEXT", () => {
  expect(calc({ A1: "1234.5", B1: '=TEXT(A1,"#,##0.00")' }, "B1")).toBe("1.234,50");
  expect(calc({ A1: "1234.5", B1: '=METNEÇEVİR(A1;"0")' }, "B1")).toBe("1235");
  expect(calc({ A1: "0.185", B1: '=TEXT(A1,"0.0%")' }, "B1")).toBe("%18,5");
  expect(calc({ A1: "31.12.2026", B1: '=METNEÇEVİR(A1;"dd.mm.yyyy")' }, "B1")).toBe("31.12.2026");
});

test("tarih işlevleri", () => {
  expect(calc({ A1: "31.12.2026", B1: "=YIL(A1)" }, "B1")).toBe(2026);
  expect(calc({ A1: "01.01.2026", A2: "31.01.2026", B1: "=A2-A1" }, "B1")).toBe(30);
  expect(shown({ A1: "=TARİH(2026;12;31)" }, "A1")).toBe("31.12.2026");
});

test("kopyalarken göreli başvurular kayar, $ sabit kalır", () => {
  expect(shiftFormula("=A1+$B$1*B$2+$C3", 1, 1)).toBe("=B2+$B$1*C$2+$C4");
  expect(shiftFormula("=TOPLA(A1:A3)&\"A1\"", 2, 0)).toBe("=TOPLA(A3:A5)&\"A1\"");
  expect(shiftFormula("=A1", -1, 0)).toBe("=#BAŞV!");
});

test("satır ekleme/silme formülleri günceller", () => {
  expect(adjustFormula("=TOPLA(A1:A5)+B7", "row", 2, 1)).toBe("=TOPLA(A1:A6)+B8");
  expect(adjustFormula("=A3+A5", "row", 2, -1)).toBe("=#BAŞV!+A4");
  expect(adjustFormula("=C1+Diğer!C1", "col", 1, 1, { sheetName: "Sayfa1" })).toBe("=D1+Diğer!C1");
});

test("biçimler ve durum çubuğu", () => {
  expect(formatValue(1250.5, { f: "money" })).toBe("1.250,50 ₺");
  expect(formatValue(0.185, { f: "percent", d: 1 })).toBe("%18,5");
  expect(formatValue(12345.678, { f: "number" })).toBe("12.345,68");
  expect(formatValue(true)).toBe("DOĞRU");
  expect(rangeStats([1, 2, "x", null, 3])).toMatchObject({ count: 4, numbers: 3, sum: 6, avg: 2 });
});

test("CSV ayracını tanır ve tırnaklı alanları okur", () => {
  expect(parseCsv('Ad;Tutar\n"Kaya; Ali";1.250,50\n')).toEqual([["Ad", "Tutar"], ["Kaya; Ali", "1.250,50"]]);
  expect(parseCsv("a,b\n1,2")).toEqual([["a", "b"], ["1", "2"]]);
});
