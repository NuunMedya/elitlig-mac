// Tablolar: diskten açılan dosyayı (xlsx/xlsm/csv/tsv/txt) çalışma kitabına çevirir.
import { addr, parseCsv } from "./sheetEngine";
import { blankSheet, MAX_COLS, MAX_ROWS } from "./sheetOps";
import { XlsxImportError, xlsxToWorkbook } from "./xlsxImport";

const isZip = (bytes) => bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;

/**
 * Metin kodlamasını tahmin eder: BOM'lu/geçerli UTF-8 değilse Türkçe Excel'in
 * kaydettiği Windows-1254 kabul edilir (ş, ğ, ı bozulmasın).
 */
export function decodeText(bytes) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^﻿/, "");
  } catch {
    return new TextDecoder("windows-1254").decode(bytes);
  }
}

export function csvToWorkbook(text, name = "Sayfa1") {
  const rows = parseCsv(text).filter((r, i, all) => i < all.length - 1 || r.some((v) => v !== "")).slice(0, MAX_ROWS);
  if (!rows.length) throw new XlsxImportError("Dosya boş.");
  const cols = Math.min(MAX_COLS, Math.max(1, ...rows.map((r) => r.length)));
  const cells = {};
  rows.forEach((row, r) => row.slice(0, cols).forEach((v, c) => {
    const value = String(v ?? "").trim() === "" ? "" : String(v);
    // CSV'deki "=" ile başlayan metin formül sayılmaz (Excel'in yaptığı gibi).
    if (value !== "") cells[addr(c, r)] = { v: value.startsWith("=") ? `'${value}` : value };
  }));
  return { sheets: [{ ...blankSheet(name.slice(0, 40) || "Sayfa1"), rows: Math.min(MAX_ROWS, Math.max(100, rows.length + 20)), cols: Math.max(26, cols), cells }] };
}

/** { title, book, warnings } döner; okunamazsa XlsxImportError fırlatır. */
export async function importFile(fileName, data) {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const title = String(fileName || "").replace(/\.[^.]+$/, "").slice(0, 120) || "İçe aktarılan tablo";
  if (/\.xls$/i.test(fileName) && !isZip(bytes)) {
    throw new XlsxImportError("Eski Excel biçimi (.xls) desteklenmiyor. Dosyayı Excel'de “.xlsx” olarak kaydedip yeniden deneyin.");
  }
  if (isZip(bytes)) {
    const { book, warnings } = await xlsxToWorkbook(bytes);
    return { title, book, warnings: warnings || [] };
  }
  if (/\.(numbers|ods)$/i.test(fileName)) throw new XlsxImportError("Bu dosya türü desteklenmiyor. Numbers'ta Dışa Aktar → Excel ile .xlsx kaydedin.");
  return { title, book: csvToWorkbook(decodeText(bytes), title), warnings: [] };
}
