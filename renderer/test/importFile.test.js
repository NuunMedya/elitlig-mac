// @vitest-environment jsdom
import fs from "fs";
import path from "path";
import { TextDecoder, TextEncoder } from "util";
import { DecompressionStream } from "stream/web";
import { importFile, decodeText } from "../src/lib/sheets/importFile";
import { workbookToXlsx } from "../src/lib/sheets/xlsxExport";
import { createEvaluator } from "../src/lib/sheets/sheetEngine";

if (typeof global.DecompressionStream === "undefined") global.DecompressionStream = DecompressionStream;
global.TextDecoder = TextDecoder;
global.TextEncoder = TextEncoder;

test("gerçek Excel dosyası içe aktarılır (hücreler dolu gelir)", async () => {
  const bytes = new Uint8Array(fs.readFileSync(path.join(__dirname, "__fixtures__", "excel-sample.xlsx")));
  const out = await importFile("Aidatlar.xlsx", bytes);
  expect(out.title).toBe("Aidatlar");
  expect(out.book.sheets.length).toBeGreaterThan(0);
  expect(Object.keys(out.book.sheets[0].cells).length).toBeGreaterThan(3);
});

test("kendi Excel çıktımız geri okunur", async () => {
  const book = { sheets: [{ name: "Kasa", rows: 20, cols: 5, cells: { A1: { v: "Tutar" }, A2: { v: "1250,5" }, A3: { v: "=TOPLA(A2:A2)" } }, colW: {} }] };
  const bytes = workbookToXlsx(book, createEvaluator(book));
  const out = await importFile("kasa.xlsx", bytes);
  expect(out.book.sheets[0].cells.A1.v).toBe("Tutar");
  expect(out.book.sheets[0].cells.A3.v).toMatch(/^=/);
});

test("CSV: noktalı virgül, UTF-8 BOM ve Windows-1254 Türkçe karakterler", async () => {
  const utf = new TextEncoder().encode("﻿Ad;Şehir;Tutar\nAyşe;İzmir;1.250,50\n");
  const a = await importFile("liste.csv", utf);
  expect(a.book.sheets[0].cells.B2.v).toBe("İzmir");
  // "Şehir" Windows-1254: Ş=0xDE, ı=0xFD
  const cp = new Uint8Array([0x41, 0x64, 0x3b, 0xde, 0x65, 0x68, 0x69, 0x72, 0x3b, 0x4b, 0xfd, 0x72, 0x0a, 0x41, 0x6c, 0x69, 0x3b, 0x31, 0x3b, 0x78, 0x0a]);
  expect(decodeText(cp).split("\n")[0]).toBe("Ad;Şehir;Kır");
  const b = await importFile("eski.csv", cp);
  expect(b.book.sheets[0].cells.B1.v).toBe("Şehir");
});

test(".xls için anlaşılır hata", async () => {
  await expect(importFile("eski.xls", new Uint8Array([0xd0, 0xcf, 0x11, 0xe0]))).rejects.toThrow(/xlsx/);
});
