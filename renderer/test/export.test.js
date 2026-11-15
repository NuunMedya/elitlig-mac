// Ortak dışa aktarma çekirdeği: hazırlık, biçimler ve paket yapısı.
// EXPORT_OUT=/klasör verilirse örnek dosyalar oraya yazılır (gerçek doğrulama için).
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { crc32, zipStore } from "../src/lib/export/zip";
import { FORMATS, formatValue, mdBlocks, mdInline, prepareReport, renderReport, safeFileName, toNumber } from "../src/lib/export";
import { excelSerial, sheetNames } from "../src/lib/export/exportXlsx";
import { pngSize } from "../src/lib/export/exportDocx";
import { workbookToXlsx } from "../src/lib/sheets/xlsxExport";

const OUT = process.env.EXPORT_OUT;
const NOW = new Date(2026, 10, 10, 14, 5);

export const SAMPLE = {
  title: "Ön Muhasebe — Kasım 2026",
  subtitle: "Kişisel kayıtlar",
  filters: ["Kasım 2026", "Gider", "Saha kirası"],
  summary: [
    { label: "Gelir", value: 12500, type: "money", tone: "green" },
    { label: "Gider", value: 4820.5, type: "money", tone: "red" },
    { label: "Net", value: 7679.5, type: "money" },
    { label: "Kayıt", value: 4, type: "number", hint: "1 vadesi geçen" },
  ],
  sections: [{
    id: "entries",
    title: "Kayıtlar",
    dateKey: "date",
    columns: [
      { key: "date", label: "Tarih", type: "date" },
      { key: "type", label: "Tür" },
      { key: "category", label: "Kategori" },
      { key: "desc", label: "Açıklama", type: "longtext" },
      { key: "amount", label: "Tutar", type: "money", total: "sum" },
      { key: "vat", label: "KDV %", type: "percent" },
      { key: "paid", label: "Ödendi", type: "bool" },
      { key: "secret", label: "Gizli not", hidden: true },
    ],
    rows: [
      { date: "2026-11-02", type: "Gider", category: "Saha kirası", desc: "Çankaya Halı Saha — İğdır Şişli maçı", amount: 1500, vat: 20, paid: true, secret: "x" },
      { date: "2026-11-05", type: "Gider", category: "Saha kirası", desc: "Ğüşİöç özel karakter denemesi\nikinci satır", amount: 3320.5, vat: 20, paid: false },
      { date: "2026-11-09", type: "Gelir", category: "Sponsorluk", desc: "Yıldız Spor & Kartal FK <ortak>", amount: 12500, vat: 0, paid: true },
      { date: "2026-10-28", type: "Gider", category: "Ekipman", desc: "Ekim kaydı (aralık dışı)", amount: 999, vat: 10, paid: true },
    ],
  }, {
    id: "notes", title: "Notlar", kind: "text",
    text: "# Toplantı özeti\n\n**Kalın** ve *italik* metin, `kod`.\n\n- Birinci madde\n- İkinci madde\n  - Alt madde\n1. Numaralı\n- [x] Tamamlanan iş\n- [ ] Açık iş\n\n> Alıntı: Şampiyonluk yolu",
  }, {
    id: "info", title: "Künye", kind: "keyvalue",
    items: [{ label: "Proje", value: "Elitlig Kış Ligi" }, { label: "Bütçe", value: 250000, type: "money" }, { label: "Başlangıç", value: "2026-12-01", type: "date" }],
  }],
};

describe("biçim yardımcıları", () => {
  it("tr-TR para, tarih, yüzde, bool", () => {
    expect(formatValue(1234.5, "money")).toBe("1.234,50 ₺");
    expect(formatValue("2026-11-10", "date")).toBe("10.11.2026");
    expect(formatValue(20, "percent")).toBe("%20");
    expect(formatValue(true, "bool")).toBe("Evet");
    expect(formatValue(["a", "", "b"])).toBe("a, b");
    expect(toNumber("1.234,56")).toBe(1234.56);
    expect(toNumber("12.5")).toBe(12.5);
  });
  it("dosya adı Türkçe harfleri korur, geçersizleri atar", () => {
    expect(safeFileName('Ön/Muhasebe: "Kasım"?')).toBe("Ön-Muhasebe- -Kasım-");
  });
  it("Excel seri tarihi", () => {
    expect(excelSerial("2026-11-10")).toBe(46336);
    expect(excelSerial("1900-03-01")).toBe(61);
  });
  it("sayfa adları tekil ve ≤31", () => {
    expect(sheetNames(["Kayıtlar", "kayıtlar", "a".repeat(40), "x/y"])).toEqual(["Kayıtlar", "kayıtlar (2)", "a".repeat(31), "xy"]);
  });
  it("Markdown blokları ve satır içi", () => {
    const b = mdBlocks("# Başlık\n\nmetin\n- [x] iş\n1. bir");
    expect(b.map((x) => x.t)).toEqual(["h", "p", "li", "li"]);
    expect(b[2].checked).toBe(true);
    expect(mdInline("a **b** _c_").filter((r) => r.b || r.i).map((r) => r.text)).toEqual(["b", "c"]);
  });
  it("PNG boyutu", () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 218, 0, 0, 0, 200]);
    expect(pngSize(png)).toEqual({ width: 218, height: 200 });
  });
  it("biçim listesi", () => {
    expect(FORMATS.map((f) => f.key)).toEqual(["pdf", "xlsx", "docx", "csv", "md", "json"]);
  });
});

describe("prepareReport", () => {
  it("varsayılan: gizli sütun çıkmaz, toplam hesaplanır", () => {
    const p = prepareReport(SAMPLE, { now: NOW });
    const s = p.sections[0];
    expect(s.columns.map((c) => c.key)).not.toContain("secret");
    expect(s.totals.values[4]).toBe(18319.5);
    expect(s.totals.labels[0]).toBeNull(); // tarih sütunu dar: etiket ilk metin sütununda
    expect(s.totals.labels[1]).toBe("Toplam (4 kayıt)");
    expect(p.filterText).toBe("Kasım 2026 · Gider · Saha kirası");
  });
  it("tarih aralığı, sütun seçimi, gruplama, ara toplam", () => {
    const p = prepareReport(SAMPLE, { now: NOW, from: "2026-11-01", to: "2026-11-30", columns: { entries: ["date", "category", "amount"] }, groupBy: { entries: "type" }, includeSummary: false });
    const s = p.sections[0];
    expect(s.rowCount).toBe(3);
    expect(s.columns.map((c) => c.label)).toEqual(["Tarih", "Kategori", "Tutar"]);
    expect(s.groups.map((g) => g.label)).toEqual(["Tür: Gider", "Tür: Gelir"]);
    expect(s.groups[0].subtotal.values[2]).toBe(4820.5);
    expect(p.summary).toEqual([]);
    expect(p.filterText).toContain("01.11.2026 – 30.11.2026");
  });
  it("bölüm seçimi ve yön", () => {
    const p = prepareReport(SAMPLE, { sections: ["notes"], orientation: "landscape" });
    expect(p.sections.map((s) => s.id)).toEqual(["notes"]);
    expect(p.orientation).toBe("landscape");
    expect(prepareReport(SAMPLE).orientation).toBe("landscape"); // 7 sütun > 6
  });
});

const unzip = (bytes) => {
  // STORE ZIP: yerel başlıkları sırayla oku.
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const files = {};
  let pos = 0;
  while (v.getUint32(pos, true) === 0x04034b50) {
    const size = v.getUint32(pos + 18, true);
    const nameLen = v.getUint16(pos + 26, true);
    const name = new TextDecoder().decode(bytes.slice(pos + 30, pos + 30 + nameLen));
    const data = bytes.slice(pos + 30 + nameLen, pos + 30 + nameLen + size);
    expect(crc32(data)).toBe(v.getUint32(pos + 14, true));
    files[name] = data;
    pos += 30 + nameLen + size;
  }
  return files;
};
const text = (b) => new TextDecoder().decode(b);

describe("renderReport", () => {
  it("PDF HTML: şerit, süzgeç, kartlar, sayfa numarası, kaçış", () => {
    const out = renderReport(SAMPLE, "pdf", { now: NOW, logo: "data:image/png;base64,AAAA" });
    expect(out.fileName).toBe("Elitlig - Ön Muhasebe — Kasım 2026 - 2026-11-10.pdf");
    expect(out.html).toContain('class="strip"');
    expect(out.html).toContain("counter(pages)");
    expect(out.html).toContain("Yıldız Spor &amp; Kartal FK &lt;ortak&gt;");
    expect(out.html).toContain("18.319,50 ₺");
    expect(out.html).toContain("size:A4 landscape");
    expect(out.html).not.toContain("<script");
  });
  it("XLSX: paket parçaları, sayfalar, biçimler, toplam formülü", () => {
    const out = renderReport(SAMPLE, "xlsx", { now: NOW, groupBy: { entries: "type" } });
    const files = unzip(out.data);
    expect(Object.keys(files)).toEqual(expect.arrayContaining(["[Content_Types].xml", "xl/workbook.xml", "xl/styles.xml", "xl/worksheets/sheet1.xml", "xl/worksheets/sheet4.xml"]));
    const wb = text(files["xl/workbook.xml"]);
    expect(wb).toContain('name="Özet"');
    expect(wb).toContain('name="Kayıtlar"');
    const sh = text(files["xl/worksheets/sheet2.xml"]);
    expect(sh).toContain("SUBTOTAL(109,");
    expect(sh).toContain("Tür: Gider (3)");
    expect(sh).toContain("<v>46328</v>"); // 2026-11-02
    expect(sh).toContain('state="frozen"');
    expect(text(files["xl/styles.xml"])).toContain("&quot;₺&quot;");
  });
  it("DOCX: belge, stiller, başlık/alt bilgi, sayfa alanları, logo", () => {
    const logo = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 100, 0, 0, 0, 50]);
    const out = renderReport(SAMPLE, "docx", { now: NOW, logoPng: logo });
    const files = unzip(out.data);
    const doc = text(files["word/document.xml"]);
    expect(doc).toContain("Ğüşİöç özel karakter denemesi");
    expect(doc).toContain("<w:tblHeader/>");
    expect(doc).toContain('w:orient="landscape"');
    expect(doc).toContain('<w:numId w:val="1"/>');
    expect(text(files["word/footer1.xml"])).toContain("NUMPAGES");
    expect(text(files["word/_rels/header1.xml.rels"])).toContain("media/logo.png");
    expect(files["word/media/logo.png"].length).toBe(logo.length);
    expect(text(files["word/styles.xml"])).toContain('w:val="tr-TR"');
  });
  it("CSV: BOM, noktalı virgül, ondalık virgül, toplam", () => {
    const out = renderReport(SAMPLE, "csv", { now: NOW, columns: { entries: ["date", "desc", "amount"] }, sections: ["entries"] });
    const lines = out.data.split("\r\n");
    expect(out.data.charCodeAt(0)).toBe(0xfeff);
    expect(lines[0]).toBe("﻿Tarih;Açıklama;Tutar");
    expect(lines[2]).toBe('05.11.2026;"Ğüşİöç özel karakter denemesi\nikinci satır";3320,5');
    expect(lines.at(-1)).toBe(";Toplam (4 kayıt);18319,5");
  });
  it("Markdown ve JSON", () => {
    const md = renderReport(SAMPLE, "md", { now: NOW }).data;
    expect(md).toContain("# Ön Muhasebe — Kasım 2026");
    expect(md).toContain("| Tarih | Tür |");
    expect(md).toContain("- **Gelir:** 12.500,00 ₺");
    const json = JSON.parse(renderReport(SAMPLE, "json", { now: NOW }).data);
    expect(json.sections[0].rows[0].Tutar).toBe(1500);
  });
  it("boş tablo ve tek sütunlu rapor çökmez", () => {
    const empty = { title: "Boş", sections: [{ columns: [{ key: "a", label: "A" }], rows: [] }] };
    for (const f of FORMATS) expect(() => renderReport(empty, f.key)).not.toThrow();
  });
  it("Tablolar xlsx yazıcısıyla aynı ZIP imzası", () => {
    const a = zipStore([{ name: "a.txt", data: "ş" }], NOW);
    const book = { sheets: [{ name: "S", cells: { A1: { v: "1" } } }] };
    expect(new DataView(a.buffer).getUint32(0, true)).toBe(new DataView(workbookToXlsx(book, null).buffer).getUint32(0, true));
  });
});

if (OUT) {
  it("örnek dosyaları yaz", () => {
    fs.mkdirSync(OUT, { recursive: true });
    const logoPng = new Uint8Array(fs.readFileSync(path.join(__dirname, "../src/assets/logo-white.png")));
    const logo = `data:image/png;base64,${Buffer.from(logoPng).toString("base64")}`;
    for (const f of FORMATS) {
      const out = renderReport(SAMPLE, f.key, { now: NOW, logo, logoPng, fileName: `ornek`, groupBy: { entries: "type" } });
      fs.writeFileSync(path.join(OUT, `ornek.${f.key === "pdf" ? "html" : out.ext}`), typeof out.data === "string" ? out.data : Buffer.from(out.data));
    }
  });
}

describe("araç rapor modelleri", async () => {
  const R = await import("../src/lib/export/reports");
  it("matrixReport tür tahmini ve toplam", () => {
    const r = R.matrixReport("Maliyet", ["Kalem", "Tutar", "Adet", "Tarih"], [["Saha", "1500", 2, "2026-11-01"], ["Hakem", "250,5", 1, "2026-11-03"]]);
    expect(r.sections[0].columns.map((c) => c.type)).toEqual(["text", "money", "number", "date"]);
    expect(prepareReport(r).sections[0].totals.values[1]).toBe(1750.5);
  });
  it("ledgerReport işaretli tutar ve özet", () => {
    const r = R.ledgerReport([{ type: "income", amount: 1000, status: "paid", entry_date: "2026-11-01" }, { type: "expense", amount: 400, status: "pending", entry_date: "2026-11-02" }]);
    expect(r.summary.find((s) => s.label === "Net").value).toBe(600);
    expect(prepareReport(r).sections[0].totals.values[5]).toBe(600);
  });
  it("statementReport yürüyen bakiye", () => {
    const r = R.statementReport({ name: "Kasa" }, [{ date: "2026-11-02", amount: -50 }, { date: "2026-11-01", amount: 200 }], { opening: 100 });
    expect(r.sections[0].rows.map((m) => m.balance)).toEqual([300, 250]);
    expect(r.summary.at(-1).value).toBe(250);
  });
  it("chatReport gün gruplu döküm", () => {
    const r = R.chatReport([{ id: 2, created_at: "2026-11-10T09:00:00Z", sender: { name: "Elif" }, body: "Şişli" }, { id: 1, created_at: "2026-11-09T09:00:00Z", sender: { name: "Ayşe" }, body: "İğdır" }]);
    const p = prepareReport(r);
    expect(p.sections[0].groups).toHaveLength(2);
    expect(r.sections[0].rows[0].body).toBe("İğdır");
  });
  it("planningCells yalnız dolu saatleri sıralı verir", () => {
    const cells = R.planningCells([{ venue: { name: "Çankaya" }, cells: [{ date: "2026-11-11", hour: 21, status: "booked", home: { team_name: "Yıldız" }, away: { team_name: "Kartal" } }, { date: "2026-11-11", hour: 20, status: "open" }, { date: "2026-11-10", hour: 19, status: "awaiting", pool_count: 2 }] }]);
    expect(cells.map((c) => `${c.date} ${c.time} ${c.home_name || "-"}`)).toEqual(["2026-11-10 19:00 -", "2026-11-11 21:00 Yıldız"]);
  });
  it("projectReport ve projectBriefReport bölümleri", () => {
    const r = R.projectReport({ project: { name: "İzmir" }, stepRows: [["Aşama", "Görev"], ["Hazırlık", "Saha"]], leadRows: [["Ad", "Değer"], ["Gülşen", "75000"]] });
    expect(r.sections.map((s) => s.id)).toEqual(["steps", "leads", "questions", "portfolio", "activities"]);
    expect(r.sections[1].columns[1].type).toBe("money");
    const b = R.projectBriefReport({ project: { name: "İzmir" }, view: { brief: { venue: "Çeşme", budget_limit: 1000 }, costs: {}, lifecycle: { stages: [] } } });
    expect(b.sections.find((s) => s.id === "dates").items[0]).toEqual({ label: "Mekân", value: "Çeşme", type: undefined });
  });
  it("her model tüm biçimlere çökmeden çevrilir", () => {
    const models = [R.todosReport([]), R.agendaReport([]), R.notesReport([{ title: "Not", body: "# A" }]), R.contactsReport([]), R.recurringReport({ items: [] }), R.budgetReport([]),
      R.equipmentMaintenanceReport({}), R.equipmentReservationsReport([]), R.requestsReport([]), R.sheetReport("T", [{ name: "S", rows: [["A"], ["1"]] }]), R.planningReport({}), R.projectsListReport([]), R.projectBudgetReport([])];
    for (const m of models) for (const f of FORMATS) expect(() => renderReport(m, f.key)).not.toThrow();
  });
});

it("teklif önizlemesi: PDF sonrası 'Göster' doğru köprüyü çağırır (regresyon)", () => {
  const src = fs.readFileSync(path.join(__dirname, "../src/views/projects/proposals/salesCommon.jsx"), "utf8");
  expect(src).not.toMatch(/elitlig\.file\?\./);
  expect(src).toContain("window.elitlig.files.reveal(r.path)");
});

it("telefon / kod sütunları sayı sanılmaz (regresyon: 0532… → 5.320.000.000)", async () => {
  const R = await import("../src/lib/export/reports");
  const r = R.matrixReport("Kişiler", ["Ad", "Telefon", "Etiket no", "Tutar"], [["Gülşen", "05320000000", "EQ-0001", "1500"], ["Özgür", "0533 111 22 33", "12", "250"]]);
  expect(r.sections[0].columns.map((c) => c.type)).toEqual(["text", "text", "text", "money"]);
  expect(renderReport(r, "csv").data).toContain("05320000000");
});
