// @vitest-environment jsdom
import fs from "fs";
import path from "path";
import { TextDecoder, TextEncoder } from "util";
import { DecompressionStream } from "stream/web";
import { createEvaluator, formatValue } from "../src/lib/sheets/sheetEngine";
import { TEMPLATES } from "../src/lib/sheets/sheetOps";
import { workbookToXlsx } from "../src/lib/sheets/xlsxExport";
import { XlsxImportError, fromExcelFormula, mapNumFmt, xlsxToWorkbook } from "../src/lib/sheets/xlsxImport";

if (typeof global.TextEncoder === "undefined") global.TextEncoder = TextEncoder;
if (typeof global.TextDecoder === "undefined") global.TextDecoder = TextDecoder;
if (typeof global.DecompressionStream === "undefined") global.DecompressionStream = DecompressionStream;

const fixture = () => new Uint8Array(fs.readFileSync(path.join(__dirname, "__fixtures__", "excel-sample.xlsx")));
const shown = (book, si, key) => formatValue(createEvaluator(book).value(si, key), book.sheets[si].cells[key]?.s);

test("Excel formülleri Türkçe söz dizimine çevrilir", () => {
  expect(fromExcelFormula("SUM(A1:A5,2.5)")).toBe("=TOPLA(A1:A5;2.5)");
  expect(fromExcelFormula('IF(B2>=300,"Tam","Eksik")')).toBe('=EĞER(B2>=300;"Tam";"Eksik")');
  expect(fromExcelFormula("_xlfn.CONCAT(A1,\" \",B1)&TRUE")).toBe('=BİRLEŞTİR(A1;" ";B1)&DOĞRU');
  expect(fromExcelFormula("SUM(C:C)")).toBe("=TOPLA(C1:C1000)");
  expect(fromExcelFormula("SUM('Özet'!$B:$B)")).toBe("=TOPLA(Özet!$B1:$B1000)");
  expect(fromExcelFormula("XLOOKUP(A1,B:B,C:C)")).toBe("=XLOOKUP(A1;B1:B1000;C1:C1000)");
});

test("sayı biçimi kodları eşlenir", () => {
  expect(mapNumFmt('#,##0.00 "₺"')).toEqual({ f: "money", d: 2 });
  expect(mapNumFmt("[$₺-41F] #,##0")).toEqual({ f: "money", d: 0 });
  expect(mapNumFmt("0.0%")).toEqual({ f: "percent", d: 1 });
  expect(mapNumFmt("dd.mm.yyyy")).toEqual({ f: "date" });
  expect(mapNumFmt("#,##0")).toEqual({ f: "number", d: 0 });
  expect(mapNumFmt("@")).toEqual({ f: "text" });
  expect(mapNumFmt("General")).toEqual({});
});

test("gerçek Excel dosyası: sıkıştırma, ortak metin, paylaşılan formül, tema rengi, biçimler", async () => {
  const { book, warnings } = await xlsxToWorkbook(fixture());
  expect(book.sheets.map((s) => s.name)).toEqual(["Kadro & Aidat", "Özet"]);
  const [s1] = book.sheets;
  expect(s1.freeze).toBe(true);
  expect(s1.colW.A).toBeGreaterThan(150);
  // Başlık: kalın, beyaz yazı, tema (accent1) dolgusu, ortalı
  expect(s1.cells.A1.v).toBe("Oyuncu");
  expect(s1.cells.A1.s).toMatchObject({ b: true, c: "#ffffff", al: "center" });
  expect(s1.cells.A1.s.bg).toMatch(/^#[0-9a-f]{6}$/);
  // Paylaşılan formül D3 = B3-C3
  expect(s1.cells.D2.v).toBe("=B2-C2");
  expect(s1.cells.D4.v).toBe("=B4-C4");
  expect(shown(book, 0, "D4")).toBe("450,50 ₺");
  expect(s1.cells.E2.v).toBe("=EĞERHATA(C2/B2;0)");
  expect(shown(book, 0, "E2")).toBe("%50,0");
  expect(shown(book, 0, "F2")).toBe("02.10.2026");
  // Metin olarak kalan "00123", mantıksal, hata, tam sütun
  expect(shown(book, 0, "G2")).toBe("00123");
  expect(shown(book, 0, "G3")).toBe("DOĞRU");
  expect(shown(book, 0, "G4")).toBe("#BÖL/0!");
  expect(s1.cells.C7.v).toBe("=TOPLA(C1:C1000)");
  expect(createEvaluator(book).value(0, "B7")).toBe(1350.5);
  // C sütununun içindeki =SUM(C:C) kendine başvurur; Excel de döngü uyarısı verir.
  expect(createEvaluator(book).value(0, "C7").code).toBe("#DÖNGÜ!");
  expect(createEvaluator(book).value(0, "B8")).toBe(450.5);
  expect(createEvaluator(book).value(0, "D8")).toBe(42);
  expect(s1.cells.A7.s).toMatchObject({ b: true, i: true, u: true, c: "#dc2626" });
  // Diğer sayfadan başvuru ve virgül/noktalı virgül içeren metin
  expect(createEvaluator(book).value(1, "B1")).toBe(1350.5);
  expect(book.sheets[1].cells.A2.v).toBe("Metin, virgüllü; noktalı");
  // G5: =CONCAT(A2," - ",TEXT(B2,"0")) artık desteklenir
  expect(createEvaluator(book).value(0, "G5")).toBe("Ali Yılmaz - 300");
  expect(warnings.join(" ")).not.toMatch(/Desteklenmeyen/);
});

test("kendi dışa aktarımımızla gidiş-dönüş: değerler aynı kalır", async () => {
  for (const tpl of TEMPLATES.filter((t) => t.key !== "blank")) {
    const book = tpl.build();
    const ev = createEvaluator(book);
    const { book: back } = await xlsxToWorkbook(workbookToXlsx(book, ev));
    const ev2 = createEvaluator(back);
    book.sheets.forEach((s, si) => Object.keys(s.cells).forEach((k) => {
      expect([tpl.key, k, formatValue(ev2.value(si, k), back.sheets[si].cells[k]?.s)]).toEqual([tpl.key, k, formatValue(ev.value(si, k), s.cells[k]?.s)]);
    }));
  }
});

test("desteklenmeyen işlevler uyarıda adıyla listelenir", () => {
  const unknown = new Set();
  fromExcelFormula("XLOOKUP(A1,B:B,C:C)+SUM(A1)", { unknown });
  expect([...unknown]).toEqual(["XLOOKUP"]);
});

test("Excel olmayan dosya anlaşılır hatayla reddedilir", async () => {
  await expect(xlsxToWorkbook(new TextEncoder().encode("bu bir excel değil"))).rejects.toBeInstanceOf(XlsxImportError);
});
