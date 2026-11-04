import { createEvaluator } from "../src/lib/sheets/sheetEngine";
import { mergeWorkbooks, TEMPLATES, blockFromText, copyBlock, fill, normRange, pasteBlock, renameSheet, shiftAxis, sortRange, styleRange, writeCells } from "../src/lib/sheets/sheetOps";

const book = (cells, name = "Sayfa1") => ({ sheets: [{ name, rows: 20, cols: 10, cells: Object.fromEntries(Object.entries(cells).map(([k, v]) => [k, { v }])), colW: {} }] });
const val = (b, key, si = 0) => createEvaluator(b).value(si, key);

test("yazma ve biçim; boşaltılan hücre silinir", () => {
  let b = writeCells(book({}), 0, { A1: { v: "5" } });
  b = styleRange(b, 0, normRange({ row: 0, col: 0 }, { row: 1, col: 0 }), { b: true });
  expect(b.sheets[0].cells.A1).toEqual({ v: "5", s: { b: true } });
  expect(b.sheets[0].cells.A2).toEqual({ v: "", s: { b: true } });
  b = styleRange(b, 0, normRange({ row: 1, col: 0 }), { b: null });
  expect(b.sheets[0].cells.A2).toBeUndefined();
});

test("kopyala-yapıştır formülü kaydırır, hedef büyükse tekrarlar", () => {
  const b = book({ A1: "1", A2: "2", B1: "=A1*10" });
  const block = copyBlock(b.sheets[0], normRange({ row: 0, col: 1 }));
  const out = pasteBlock(b, 0, normRange({ row: 1, col: 1 }, { row: 2, col: 1 }), block);
  expect(out.sheets[0].cells.B2.v).toBe("=A2*10");
  expect(out.sheets[0].cells.B3.v).toBe("=A3*10");
  expect(val(out, "B2")).toBe(20);
});

test("panodan sekmeli metin", () => {
  const out = pasteBlock(book({}), 0, normRange({ row: 0, col: 0 }), blockFromText("Ad\tPuan\nAli\t7\n"));
  expect(out.sheets[0].cells.B2.v).toBe("7");
});

test("aşağı doldur", () => {
  const out = fill(book({ A1: "1", A2: "2", A3: "3", B1: "=A1*2" }), 0, normRange({ row: 0, col: 1 }, { row: 2, col: 1 }), "down");
  expect(val(out, "B3")).toBe(6);
});

test("satır ekle/sil hücreleri kaydırır, formülleri ve diğer sayfaları günceller", () => {
  const b = book({ A1: "1", A2: "2", A3: "=TOPLA(A1:A2)" });
  b.sheets.push({ name: "Özet", rows: 10, cols: 5, cells: { A1: { v: "=Sayfa1!A3" } }, colW: {} });
  const ins = shiftAxis(b, 0, "row", 1, 1);
  expect(ins.sheets[0].cells.A3.v).toBe("2");
  expect(ins.sheets[0].cells.A4.v).toBe("=TOPLA(A1:A3)");
  expect(ins.sheets[1].cells.A1.v).toBe("=Sayfa1!A4");
  expect(val(ins, "A1", 1)).toBe(3);
  const del = shiftAxis(b, 0, "row", 0, -1);
  expect(del.sheets[0].cells.A2.v).toBe("=TOPLA(#BAŞV!:A1)");
  expect(val(del, "A2").code).toBe("#DEĞER!");
});

test("sıralama hesaplanmış değere göre, boşlar sonda", () => {
  const b = book({ A1: "Can", B1: "5", A2: "Ali", B2: "=3*3", A3: "Veli", A4: "Ece", B4: "1" });
  const ev = createEvaluator(b);
  const out = sortRange(b, 0, normRange({ row: 0, col: 0 }, { row: 3, col: 1 }), 1, false, (k) => ev.value(0, k));
  expect(["A1", "A2", "A3", "A4"].map((k) => out.sheets[0].cells[k].v)).toEqual(["Ali", "Can", "Ece", "Veli"]);
});

test("sayfa adı değişince başvurular güncellenir", () => {
  const b = book({ A1: "4" });
  b.sheets.push({ name: "Özet", rows: 5, cols: 5, cells: { A1: { v: "=Sayfa1!A1+'Sayfa1'!A1" } }, colW: {} });
  const out = renameSheet(b, 0, "Ekim Ayı");
  expect(out.sheets[1].cells.A1.v).toBe("='Ekim Ayı'!A1+'Ekim Ayı'!A1");
  expect(val(out, "A1", 1)).toBe(8);
});

test("şablonlar hatasız hesaplanır", () => {
  for (const tpl of TEMPLATES) {
    const b = tpl.build();
    const ev = createEvaluator(b);
    b.sheets.forEach((s, si) => Object.keys(s.cells).forEach((k) => {
      const v = ev.value(si, k);
      expect([tpl.key, k, v?.code]).toEqual([tpl.key, k, undefined]);
    }));
  }
  const dues = TEMPLATES.find((t) => t.key === "dues").build();
  expect(val(dues, "D10")).toBe(450);
  expect(val(TEMPLATES.find((t) => t.key === "standings").build(), "J2")).toBe(1);
});

test("eşzamanlı düzenleme: değişiklikler birleşir, benim dokunmadığım hücreler korunur", () => {

  const base = { sheets: [{ name: "S1", rows: 50, cols: 10, cells: { A1: { v: "1" }, B1: { v: "2" }, C1: { v: "3" } }, colW: {} }] };
  const mine = { sheets: [{ name: "S1", rows: 50, cols: 10, cells: { A1: { v: "benim" }, C1: { v: "3" }, D1: { v: "yeni" } }, colW: { A: 150 } }, { name: "Ek", rows: 10, cols: 5, cells: {}, colW: {} }] };
  const theirs = { sheets: [{ name: "S1", rows: 60, cols: 10, cells: { A1: { v: "1" }, B1: { v: "2" }, C1: { v: "onlar" }, E1: { v: "onların" } }, colW: {} }, { name: "Ek", rows: 10, cols: 5, cells: {}, colW: {} }] };
  const out = mergeWorkbooks(base, mine, theirs);
  expect(out.sheets[0].cells).toEqual({ A1: { v: "benim" }, C1: { v: "onlar" }, D1: { v: "yeni" }, E1: { v: "onların" } });
  expect(out.sheets[0].colW).toEqual({ A: 150 });
  expect(out.sheets[0].rows).toBe(60);
  // İki taraf da "Ek" eklediyse ikisi de korunur.
  expect(out.sheets.map((s) => s.name)).toEqual(["S1", "Ek", "Ek (2)"]);
});
