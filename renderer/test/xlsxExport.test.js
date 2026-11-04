import { TextEncoder } from "util";
import { createEvaluator } from "../src/lib/sheets/sheetEngine";
import { TEMPLATES } from "../src/lib/sheets/sheetOps";
import { crc32, excelSheetNames, toExcelFormula, workbookToXlsx, zipStore } from "../src/lib/sheets/xlsxExport";

if (typeof global.TextEncoder === "undefined") global.TextEncoder = TextEncoder;

const OUT = process.env.XLSX_OUT;

test("CRC32 bilinen değer", () => {
  expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
});

test("ZIP yerel başlık ve merkez dizin imzaları", () => {
  const zip = zipStore([{ name: "a.txt", data: "merhaba" }]);
  const view = new DataView(zip.buffer);
  expect(view.getUint32(0, true)).toBe(0x04034b50);
  expect(view.getUint32(zip.length - 22, true)).toBe(0x06054b50);
});

test("formüller Excel söz dizimine çevrilir", () => {
  const names = new Map([["ekim ayı", "Ekim Ayı"]]);
  expect(toExcelFormula("=TOPLA(A1:A5; 2,5)")).toBe("SUM(A1:A5,2.5)");
  expect(toExcelFormula("=EĞER(B2>=300; \"Tam\"; \"Eksik\")")).toBe('IF(B2>=300,"Tam","Eksik")');
  expect(toExcelFormula("=ETOPLA(B2:B9;\"Ödendi\";C2:C9)+BAĞ_DEĞ_SAY($A$1:A9)")).toBe('SUMIF(B2:B9,"Ödendi",C2:C9)+COUNT($A$1:A9)');
  expect(toExcelFormula("='Ekim Ayı'!B2*2")).toBe("'Ekim Ayı'!B2*2");
  expect(toExcelFormula("=BİRLEŞTİR(A1;\" \";B1)&YANLIŞ")).toBe('_xlfn.CONCAT(A1," ",B1)&FALSE');
  expect(toExcelFormula("=A1*15%")).toBe("A1*15%");
  expect(toExcelFormula("=#BAŞV!+A1")).toBeNull();
  expect(toExcelFormula("=Sheet_2!A1", names)).toBe("Sheet_2!A1");
});

test("sayfa adları Excel sınırına uyar", () => {
  expect(excelSheetNames([{ name: "Çok uzun bir sayfa adı ki 31 karakteri aşar" }, { name: "Çok uzun bir sayfa adı ki 31 karakteri aşar bu da" }]).map((n) => n.length <= 31)).toEqual([true, true]);
});

const stress = () => ({
  sheets: [
    {
      name: "Veriler ve Formüller", rows: 100, cols: 26, freeze: true, colW: { A: 160, B: 90 },
      cells: {
        A1: { v: "Ad", s: { b: true, bg: "#ede9fe", al: "center" } }, B1: { v: "Tutar", s: { b: true, bg: "#ede9fe" } }, C1: { v: "Oran", s: { b: true } }, D1: { v: "Tarih", s: { b: true } },
        A2: { v: "Ali <&> \"Kaya\"" }, B2: { v: "1.250,50", s: { f: "money" } }, C2: { v: "%18", s: { f: "percent" } }, D2: { v: "31.12.2026" },
        A3: { v: "Şükrü Öğüt" }, B3: { v: "300", s: { f: "money", c: "#dc2626" } }, C3: { v: "0,5", s: { f: "percent", d: 1 } }, D3: { v: "=TARİH(2026;1;15)", s: { f: "date" } },
        A4: { v: "'00123", s: { f: "text" } }, B4: { v: "=TOPLA(B2:B3)", s: { b: true, i: true, u: true } },
        E2: { v: "=B2*C2" }, E3: { v: "=YUVARLA(B2/3; 2)" }, E4: { v: "=EĞER(B4>1000; \"Yüksek\"; \"Düşük\")" },
        E5: { v: "=ETOPLA(A2:A3; \"Ş*\"; B2:B3)" }, E6: { v: "=EĞERSAY(B2:B3; \">=300\")" }, E7: { v: "=DÜŞEYARA(\"Şükrü Öğüt\"; A2:B3; 2; YANLIŞ)" },
        E8: { v: "=BİRLEŞTİR(A3; \" - \"; B3)" }, E9: { v: "=ORTALAMA(B2:B3)" }, E10: { v: "=MAK(B2:B3)-MİN(B2:B3)" }, E11: { v: "=1/0" }, E12: { v: "=VE(B2>0; B3>0)" },
        E13: { v: "=YIL(D2)" }, E14: { v: "=D2-D3" }, E15: { v: "=2^10" }, E16: { v: "=UZUNLUK(A3)" }, E17: { v: "='Özet Sayfası'!A1*2" },
        E18: { v: "=B2*C2", s: { f: "number", d: 3 } }, E19: { v: "DOĞRU" },
      },
    },
    { name: "Özet Sayfası", rows: 20, cols: 5, cells: { A1: { v: "21" }, B1: { v: "='Veriler ve Formüller'!B4" } }, colW: {} },
  ],
});

test("xlsx dosyaları üretilir (şablonlar ve zorlayıcı örnek)", () => {
  const books = [...TEMPLATES.map((t) => [t.key, t.build()]), ["stress", stress()]];
  for (const [key, book] of books) {
    const ev = createEvaluator(book);
    const bytes = workbookToXlsx(book, ev, { title: key });
    expect(bytes.length).toBeGreaterThan(1000);
    if (OUT) {
      // eslint-disable-next-line global-require
      const fs = require("fs");
      fs.writeFileSync(`${OUT}/${key}.xlsx`, Buffer.from(bytes));
      const values = book.sheets.map((s, si) => Object.fromEntries(Object.keys(s.cells).map((k) => {
        const v = ev.value(si, k);
        return [k, v && typeof v === "object" ? ("date" in v ? v.date : v.code) : v];
      })));
      fs.writeFileSync(`${OUT}/${key}.expected.json`, JSON.stringify(values));
    }
  }
});
