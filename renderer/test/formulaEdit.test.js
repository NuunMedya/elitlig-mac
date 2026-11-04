import {
  acceptFunction, autoSumFormula, canPoint, closeParens, colorSegments, cycleAbsolute, formatRef, functionContext, functionMatches,
  guessSumRange, isPointable, pointArrow, pointBase, pointInsert, pointLive, refAt, scanRefs, sheetPrefix, signatureParts, signatureText, wordAt,
} from "../src/lib/sheets/formulaEdit";
import { adjustFormula, createEvaluator, shiftFormula, tokenize } from "../src/lib/sheets/sheetEngine";

const p = (row, col) => ({ row, col });

test("başvuru eklenebilecek konumlar", () => {
  expect(isPointable("=", 1)).toBe(true);
  expect(isPointable("=TOPLA(", 7)).toBe(true);
  expect(isPointable("=A1+", 4)).toBe(true);
  expect(isPointable("=A1 ", 4)).toBe(true);
  expect(isPointable("=EĞER(A1>", 9)).toBe(true);
  expect(isPointable("=TOPLA(A1;", 10)).toBe(true);
  expect(isPointable("=A1&", 4)).toBe(true);
  expect(isPointable("=TOPLA()", 7)).toBe(true); // ")" öncesi
  expect(isPointable("=A1", 3)).toBe(false);
  expect(isPointable("=TOPLA", 6)).toBe(false);
  expect(isPointable("A1+", 3)).toBe(false); // formül değil
  expect(isPointable('="a+', 4)).toBe(false); // dizge içi
  expect(isPointable("=(A1", 2)).toBe(false); // sağında başvuru var
});

test("başvuru metni ve sayfa öneki", () => {
  expect(formatRef(p(0, 0))).toBe("A1");
  expect(formatRef(p(4, 1), p(0, 0))).toBe("A1:B5");
  expect(formatRef(p(0, 2), p(0, 0), "col")).toBe("A:C");
  expect(formatRef(p(4, 0), p(1, 0), "row")).toBe("2:5");
  expect(formatRef(p(0, 0), p(0, 0), "cell", "Sayfa2")).toBe("Sayfa2!A1");
  expect(formatRef(p(1, 1), p(1, 1), "cell", "Ekim Ayı")).toBe("'Ekim Ayı'!B2");
  expect(sheetPrefix("AB12")).toBe("'AB12'!");
});

test("formüldeki başvuruları bulur ve renklendirir", () => {
  const refs = scanRefs('=TOPLA(A1:A5)+B2*Sayfa2!C3+"D4"+A1:A5+\'Ekim Ayı\'!E1+B:B+3:3');
  expect(refs.map((r) => r.text)).toEqual(["A1:A5", "B2", "Sayfa2!C3", "A1:A5", "'Ekim Ayı'!E1", "B:B", "3:3"]);
  expect(refs[0].color).toBe(refs[3].color); // aynı başvuru aynı renk
  expect(refs[0].color).not.toBe(refs[1].color);
  expect(refs[2]).toMatchObject({ sheet: "Sayfa2", r1: 2, c1: 2 });
  expect(refs[4].sheet).toBe("Ekim Ayı");
  expect(refs[5]).toMatchObject({ kind: "col", c1: 1, c2: 1, r1: 0 });
  expect(refs[6]).toMatchObject({ kind: "row", r1: 2, r2: 2 });
  expect(scanRefs("=LOG10(2)+TOPLA(1)")).toEqual([]);
  const segs = colorSegments("=A1+B2");
  expect(segs.map((s) => s.text)).toEqual(["=", "A1", "+", "B2"]);
  expect(segs[1].color).toBeTruthy();
  expect(refAt("=A1+B22", 7).text).toBe("B22");
  expect(refAt("=A1+B22", 2).text).toBe("A1");
  expect(refAt("=A1+ B22", 4)).toBe(null);
});

test("tıklama başvuru ekler, ardından yeniden tıklama yerine geçer", () => {
  let s = pointInsert("=TOPLA(", 7, null, { anchor: p(0, 0) });
  expect(s.text).toBe("=TOPLA(A1");
  expect(s.caret).toBe(9);
  expect(pointLive(s.text, s.caret, s.point)).toBe(true);
  // Sürükleme: aynı başvuru aralığa dönüşür.
  s = pointInsert(s.text, s.caret, s.point, { anchor: p(0, 0), focus: p(4, 0) });
  expect(s.text).toBe("=TOPLA(A1:A5");
  // Yeniden tıklama: az önce eklenenin yerine geçer.
  s = pointInsert(s.text, s.caret, s.point, { anchor: p(1, 2) });
  expect(s.text).toBe("=TOPLA(C2");
  // Ctrl/⌘ + tıklama: ";" ile yeni başvuru.
  s = pointInsert(s.text, s.caret, s.point, { anchor: p(6, 3), add: true });
  expect(s.text).toBe("=TOPLA(C2;D7");
  expect(s.point.span).toEqual({ start: 10, end: 12 });
  // Başka sayfa.
  s = pointInsert(s.text, s.caret, s.point, { anchor: p(0, 0), sheet: "Sayfa2" });
  expect(s.text).toBe("=TOPLA(C2;Sayfa2!A1");
  // Yazmaya devam edilince işaretleme biter.
  expect(canPoint(`${s.text})`, s.caret + 1, s.point)).toBe(false);
  expect(canPoint(`${s.text}+`, s.caret + 1, s.point)).toBe(true);
  // Ortaya ekleme: imleçten sonrası korunur.
  const mid = pointInsert("=+B1", 1, null, { anchor: p(0, 0) });
  expect(mid.text).toBe("=A1+B1");
  // Ayraç zaten varsa Ctrl ile ";" eklenmez.
  expect(pointInsert("=TOPLA(A1;", 10, null, { anchor: p(1, 0), add: true }).text).toBe("=TOPLA(A1;A2");
});

test("Shift ile genişletme ve tam sütun / satır", () => {
  let s = pointInsert("=", 1, null, { anchor: p(0, 0) });
  const base = pointBase(s.text, s.caret, s.point);
  s = pointInsert(s.text, s.caret, base, { anchor: base.anchor, focus: p(2, 1) });
  expect(s.text).toBe("=A1:B3");
  // Yazılmış başvurunun ardından Shift+tık da genişletir.
  const typed = pointBase("=B2", 3, null);
  expect(typed.anchor).toEqual(p(1, 1));
  expect(pointInsert("=B2", 3, typed, { anchor: typed.anchor, focus: p(3, 2) }).text).toBe("=B2:C4");
  expect(pointBase("=TOPLA(", 7, null)).toBe(null);
  expect(pointInsert("=TOPLA(", 7, null, { anchor: p(0, 1), focus: p(0, 2), kind: "col" }).text).toBe("=TOPLA(B:C");
  expect(pointInsert("=TOPLA(", 7, null, { anchor: p(3, 0), kind: "row" }).text).toBe("=TOPLA(4:4");
});

test("ok tuşlarıyla işaretleme", () => {
  const bounds = { rows: 100, cols: 26 };
  const origin = p(5, 2); // C6 düzenleniyor
  let s = pointArrow("=", 1, null, { origin, dr: -1, dc: 0, bounds });
  expect(s.text).toBe("=C5");
  s = pointArrow(s.text, s.caret, s.point, { origin, dr: -1, dc: 0, bounds });
  expect(s.text).toBe("=C4");
  s = pointArrow(s.text, s.caret, s.point, { origin, dr: 0, dc: -1, extend: true, bounds });
  expect(s.text).toBe("=B4:C4");
  s = pointArrow(s.text, s.caret, s.point, { origin, dr: -1, dc: 0, extend: true, bounds });
  expect(s.text).toBe("=B3:C4");
  // Kenarda durur.
  const top = pointArrow("=", 1, null, { origin: p(0, 0), dr: -1, dc: -1, bounds });
  expect(top.text).toBe("=A1");
  // Shift: düzenlenen hücreden başlar.
  expect(pointArrow("=", 1, null, { origin, dr: 1, dc: 0, extend: true, bounds }).text).toBe("=C6:C7");
  // İşaretlenemeyen yerde null (imleç normal hareket eder).
  expect(pointArrow("=A1", 3, null, { origin, dr: 1, dc: 0, bounds })).toBe(null);
});

test("F4 mutlak başvuru döngüsü", () => {
  let r = cycleAbsolute("=A1+B2", 3);
  expect(r.text).toBe("=$A$1+B2");
  r = cycleAbsolute(r.text, r.caret);
  expect(r.text).toBe("=A$1+B2");
  r = cycleAbsolute(r.text, r.caret);
  expect(r.text).toBe("=$A1+B2");
  r = cycleAbsolute(r.text, r.caret);
  expect(r.text).toBe("=A1+B2");
  expect(cycleAbsolute("=TOPLA(A1:B5)", 12).text).toBe("=TOPLA($A$1:$B$5)");
  expect(cycleAbsolute("=Sayfa2!c3", 10).text).toBe("=Sayfa2!$C$3");
  expect(cycleAbsolute("=TOPLA(A:A)", 10).text).toBe("=TOPLA($A:$A)");
  expect(cycleAbsolute("=TOPLA(", 7)).toBe(null);
});

test("işlev önerileri ve ipucu", () => {
  const to = functionMatches("TO");
  expect(to[0].tr).toBe("TOPLA");
  expect(to[0].insert).toBe("TOPLA");
  expect(to[0].desc).toBeTruthy();
  expect(functionMatches("su").map((f) => f.insert)).toContain("SUM");
  expect(functionMatches("min")[0].tr).toBe("MİN");
  expect(functionMatches("birles")[0].tr).toBe("BİRLEŞTİR");
  expect(functionMatches("if")[0].insert).toBe("IF");
  expect(functionMatches("")).toEqual([]);
  expect(wordAt("=TO", 3)).toEqual({ start: 1, word: "TO" });
  expect(wordAt("=A1+ort", 7)).toEqual({ start: 4, word: "ort" });
  expect(wordAt("=A1", 3)).toBe(null);
  expect(wordAt('="TO', 4)).toBe(null);
  expect(wordAt("=Sayfa2!A", 9)).toBe(null);
  const acc = acceptFunction("=TO", 3, 1, "TOPLA");
  expect(acc).toEqual({ text: "=TOPLA(", caret: 7 });
  expect(acceptFunction("=TO()", 3, 1, "TOPLA")).toEqual({ text: "=TOPLA()", caret: 7 });
  const ctx = functionContext("=TOPLA(A1;", 10);
  expect(ctx.fn.en).toBe("SUM");
  expect(ctx.argIndex).toBe(1);
  expect(functionContext("=EĞER(A1>0;TOPLA(B1", 19).fn.en).toBe("SUM");
  expect(functionContext("=EĞER(A1>0;TOPLA(B1);", 21)).toMatchObject({ argIndex: 2 });
  expect(functionContext('=EĞER(A1;"a;b', 13).argIndex).toBe(1);
  expect(functionContext("=A1+B1", 6)).toBe(null);
  expect(signatureText(ctx.fn)).toBe("TOPLA(sayı1; [sayı2]; …)");
  const parts = signatureParts(ctx.fn, 5);
  expect(parts.find((x) => x.active).text).toBe("[sayı2]");
  expect(signatureParts(functionContext("=EĞER(", 6).fn, 0).find((x) => x.active).text).toBe("mantıksal_sınama");
  expect(closeParens("=TOPLA(EĞER(A1")).toBe("=TOPLA(EĞER(A1))");
  expect(closeParens('=BİRLEŞTİR("(";A1')).toBe('=BİRLEŞTİR("(";A1)');
});

test("otomatik toplam aralığı", () => {
  const nums = new Set(["0:0", "1:0", "2:0", "4:1", "4:2", "4:3"]);
  const isNum = (r, c) => nums.has(`${r}:${c}`);
  expect(guessSumRange(isNum, 3, 0)).toEqual({ r1: 0, c1: 0, r2: 2, c2: 0 });
  expect(guessSumRange(isNum, 4, 4)).toEqual({ r1: 4, c1: 1, r2: 4, c2: 3 });
  expect(guessSumRange(isNum, 9, 9)).toBe(null);
  const f = autoSumFormula({ r1: 0, c1: 0, r2: 2, c2: 0 });
  expect(f.text).toBe("=TOPLA(A1:A3)");
  expect(f.text.slice(f.point.span.start, f.point.span.end)).toBe("A1:A3");
  expect(pointLive(f.text, f.caret, f.point)).toBe(true);
  expect(autoSumFormula(null).text).toBe("=TOPLA()");
});

test("motor: tam sütun ve tam satır aralıkları", () => {
  const cells = { A1: "Başlık", A2: "10", A3: "20", A9: "5", B1: "1", C1: "2", D2: "=TOPLA(A:A)", D3: "=TOPLA(1:1)", D4: "=BAĞ_DEĞ_SAY($A:A)", D5: "=TOPLA(Sayfa2!B:B)", D6: "=TOPLA(A:A;B1)" };
  const book = { sheets: [{ name: "Sayfa1", rows: 20, cols: 6, cells: Object.fromEntries(Object.entries(cells).map(([k, v]) => [k, { v }])) }, { name: "Sayfa2", cells: { B1: { v: "4" }, B40: { v: "6" } } }] };
  const ev = createEvaluator(book);
  expect(ev.value(0, "D2")).toBe(35);
  expect(ev.value(0, "D3")).toBe(3);
  expect(ev.value(0, "D4")).toBe(3);
  expect(ev.value(0, "D5")).toBe(10);
  expect(ev.value(0, "D6")).toBe(36);
  expect(tokenize("TOPLA(A:B)")[2]).toMatchObject({ t: "ref", a: "A", b: "B", kind: "col" });
  expect(tokenize("Sayfa2!3:5")[0]).toMatchObject({ t: "ref", sheet: "Sayfa2", a: "3", b: "5", kind: "row" });
  // Kaydırma ve satır/sütun ekleme-silme.
  expect(shiftFormula("=TOPLA(A:A)+TOPLA($B:B)+TOPLA(1:1)", 2, 1)).toBe("=TOPLA(B:B)+TOPLA($B:C)+TOPLA(3:3)");
  expect(adjustFormula("=TOPLA(B:D)", "col", 0, 1)).toBe("=TOPLA(C:E)");
  expect(adjustFormula("=TOPLA(B:D)", "col", 2, -1)).toBe("=TOPLA(B:C)");
  expect(adjustFormula("=TOPLA(B:B)", "col", 1, -1)).toBe("=TOPLA(#BAŞV!)");
  expect(adjustFormula("=TOPLA(B:B)", "row", 0, 3)).toBe("=TOPLA(B:B)");
  expect(adjustFormula("=TOPLA(2:4)", "row", 0, 1)).toBe("=TOPLA(3:5)");
  // Var olan hücre başvuruları bozulmaz.
  expect(shiftFormula("=A1+$B$2+Sayfa2!C3", 1, 1)).toBe("=B2+$B$2+Sayfa2!D4");
});
