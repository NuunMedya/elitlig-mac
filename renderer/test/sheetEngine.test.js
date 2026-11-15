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

test("çok koşullu işlevler: ÇOKETOPLA, ÇOKEĞERSAY, ÇOKEĞERORTALAMA, ÇOKEĞERMAK/MİN, TOPLA.ÇARPIM", () => {
  const cells = { A1: "Ali", A2: "Can", A3: "Ali", A4: "Ali", B1: "Gelir", B2: "Gelir", B3: "Gider", B4: "Gelir", C1: "100", C2: "50", C3: "30", C4: "70" };
  expect(calc({ ...cells, D1: '=ÇOKETOPLA(C1:C4; A1:A4; "Ali"; B1:B4; "Gelir")' }, "D1")).toBe(170);
  expect(calc({ ...cells, D1: '=SUMIFS(C1:C4,A1:A4,"Ali",C1:C4,">50")' }, "D1")).toBe(170);
  expect(calc({ ...cells, D1: '=ÇOKEĞERSAY(A1:A4; "Ali"; C1:C4; ">=70")' }, "D1")).toBe(2);
  expect(calc({ ...cells, D1: '=ÇOKEĞERORTALAMA(C1:C4; A1:A4; "Ali")' }, "D1")).toBeCloseTo(66.667, 2);
  expect(calc({ ...cells, D1: '=ÇOKEĞERMAK(C1:C4; B1:B4; "Gelir")' }, "D1")).toBe(100);
  expect(calc({ ...cells, D1: '=ÇOKEĞERMİN(C1:C4; B1:B4; "Gelir")' }, "D1")).toBe(50);
  expect(calc({ C1: "2", C2: "3", D1: "4", D2: "5", E1: "=TOPLA.ÇARPIM(C1:C2; D1:D2)" }, "E1")).toBe(23);
});

test("arama: ÇAPRAZARA, İNDİS/KAÇINCI, YATAYARA, ELEMAN", () => {
  const t = { A1: "Ali", A2: "Can", A3: "Ece", B1: "10", B2: "20", B3: "30" };
  expect(calc({ ...t, D1: '=ÇAPRAZARA("Can"; A1:A3; B1:B3)' }, "D1")).toBe(20);
  expect(calc({ ...t, D1: '=XLOOKUP("Zeki",A1:A3,B1:B3,"yok")' }, "D1")).toBe("yok");
  expect(calc({ ...t, D1: '=ÇAPRAZARA("Zeki"; A1:A3; B1:B3)' }, "D1").code).toBe("#YOK");
  expect(calc({ ...t, D1: "=ÇAPRAZARA(25; B1:B3; A1:A3; ; -1)" }, "D1")).toBe("Can");
  expect(calc({ ...t, D1: '=ÇAPRAZARA("E*"; A1:A3; B1:B3; ; 2)' }, "D1")).toBe(30);
  expect(calc({ ...t, D1: '=İNDİS(B1:B3; KAÇINCI("Ece"; A1:A3; 0))' }, "D1")).toBe(30);
  expect(calc({ ...t, D1: "=INDEX(A1:B3,2,2)" }, "D1")).toBe(20);
  expect(calc({ ...t, D1: "=KAÇINCI(25; B1:B3)" }, "D1")).toBe(2);
  expect(calc({ ...t, D1: '=KAÇINCI("c*"; A1:A3; 0)' }, "D1")).toBe(2);
  expect(calc({ A1: "Oca", B1: "Şub", A2: "5", B2: "7", D1: '=YATAYARA("Şub"; A1:B2; 2; YANLIŞ)' }, "D1")).toBe(7);
  expect(calc({ D1: '=ELEMAN(2; "a"; "b"; "c")' }, "D1")).toBe("b");
});

test("mantıksal ve metin: ÇOKEĞER, İLKEŞLEŞEN, EĞERYOKSA, PARÇAAL, BUL, YERİNEKOY, YAZIM.DÜZENİ, ESAYIYSA", () => {
  expect(calc({ A1: "75", B1: '=ÇOKEĞER(A1>=90; "A"; A1>=70; "B"; DOĞRU; "C")' }, "B1")).toBe("B");
  expect(calc({ A1: "2", B1: '=İLKEŞLEŞEN(A1; 1; "Bir"; 2; "İki"; "Diğer")' }, "B1")).toBe("İki");
  expect(calc({ A1: "9", B1: '=SWITCH(A1,1,"Bir","Diğer")' }, "B1")).toBe("Diğer");
  expect(calc({ B1: '=EĞERYOKSA(DÜŞEYARA("x"; A1:A2; 1; YANLIŞ); "Yok")' }, "B1")).toBe("Yok");
  expect(calc({ A1: "Elitlig Lig", B1: "=PARÇAAL(A1; 3; 5)" }, "B1")).toBe("itlig");
  expect(calc({ A1: "Elitlig", B1: '=BUL("l"; A1; 3)' }, "B1")).toBe(5);
  expect(calc({ A1: "Elitlig", B1: '=MBUL("L"; A1)' }, "B1")).toBe(2);
  expect(calc({ A1: "a-b-c", B1: '=YERİNEKOY(A1; "-"; "/")' }, "B1")).toBe("a/b/c");
  expect(calc({ A1: "a-b-c", B1: '=YERİNEKOY(A1; "-"; "/"; 2)' }, "B1")).toBe("a-b/c");
  expect(calc({ A1: "ali can ıŞık", B1: "=YAZIM.DÜZENİ(A1)" }, "B1")).toBe("Ali Can Işık");
  expect(calc({ A1: "5", B1: "=ESAYIYSA(A1)", B2: "=EBOŞSA(C9)", B3: "=EHATALIYSA(1/0)", B4: "=EMETİNSE(A1)" }, "B1")).toBe(true);
  expect(calc({ B2: "=EBOŞSA(C9)" }, "B2")).toBe(true);
  expect(calc({ B3: "=EHATALIYSA(1/0)" }, "B3")).toBe(true);
  expect(calc({ A1: "  çok   boşluk ", B1: "=UZUNLUK(KIRP(A1))" }, "B1")).toBe(10);
  expect(calc({ B1: '=SOLDAN("Elitlig"; 3)&SAĞDAN("Elitlig"; 3)' }, "B1")).toBe("Elilig");
  expect(calc({ B1: '=BİRLEŞTİR("a"; 1; DOĞRU)' }, "B1")).toBe("a1DOĞRU");
  expect(calc({ B1: '=SAYIYAÇEVİR("1.250,5")' }, "B1")).toBe(1250.5);
});

test("tarih ve saat: ZAMAN, SAAT, HAFTANINGÜNÜ, SERİTARİH, SERİAY, TAMİŞGÜNÜ, ETARİHLİ, METNEÇEVİR", () => {
  expect(formatValue(calc({ A1: "=ZAMAN(14; 30; 0)" }, "A1"))).toBe("14:30");
  expect(calc({ A1: "=SAAT(ZAMAN(14; 30; 0))" }, "A1")).toBe(14);
  expect(calc({ A1: "=DAKİKA(ZAMAN(14; 30; 0))" }, "A1")).toBe(30);
  expect(calc({ A1: "=HAFTANINGÜNÜ(TARİH(2026; 11; 16); 2)" }, "A1")).toBe(1); // Pazartesi
  expect(formatValue(calc({ A1: "=SERİTARİH(TARİH(2026; 1; 31); 1)" }, "A1"))).toBe("28.02.2026");
  expect(formatValue(calc({ A1: "=SERİAY(TARİH(2026; 2; 10); 0)" }, "A1"))).toBe("28.02.2026");
  expect(calc({ A1: "=TAMİŞGÜNÜ(TARİH(2026; 11; 16); TARİH(2026; 11; 22))" }, "A1")).toBe(5);
  expect(formatValue(calc({ A1: "=İŞGÜNÜ(TARİH(2026; 11; 20); 1)" }, "A1"))).toBe("23.11.2026");
  expect(calc({ A1: '=ETARİHLİ(TARİH(2000; 5; 20); TARİH(2026; 5; 19); "Y")' }, "A1")).toBe(25);
  expect(calc({ A1: '=METNEÇEVİR(TARİH(2026; 3; 5); "dd.mm.yyyy")' }, "A1")).toBe("05.03.2026");
  expect(calc({ A1: '=TEXT(1234.5,"#,##0.00")' }, "A1")).toBe("1.234,50");
  expect(typeof calc({ A1: "=BUGÜN()" }, "A1").date).toBe("number");
});

test("istatistik ve yuvarlama: BÜYÜK, KÜÇÜK, STDSAPMA, TAVANAYUVARLA, NSAT", () => {
  const n = { A1: "4", A2: "8", A3: "6", A4: "2" };
  expect(calc({ ...n, B1: "=BÜYÜK(A1:A4; 2)" }, "B1")).toBe(6);
  expect(calc({ ...n, B1: "=KÜÇÜK(A1:A4; 1)" }, "B1")).toBe(2);
  expect(calc({ ...n, B1: "=STDSAPMA(A1:A4)" }, "B1")).toBeCloseTo(2.582, 3);
  expect(calc({ B1: "=TAVANAYUVARLA(12; 5)" }, "B1")).toBe(15);
  expect(calc({ B1: "=TABANAYUVARLA(12; 5)" }, "B1")).toBe(10);
  expect(calc({ B1: "=NSAT(3,789; 1)" }, "B1")).toBeCloseTo(3.7);
  expect(calc({ B1: "=YUVARLA(2,345; 2)" }, "B1")).toBe(2.35);
  expect(calc({ B1: "=VE(1>0; YADA(0>1; 2>1))" }, "B1")).toBe(true);
  expect(calc({ A1: "1", A2: "a", A3: "", B1: "=BAĞ_DEĞ_SAY(A1:A3)+BAĞ_DEĞ_DOLU_SAY(A1:A3)*10" }, "B1")).toBe(21);
});
