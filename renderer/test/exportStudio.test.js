// Yazdırma / PDF stüdyosu: sütun seçimi ve sırası, satır süzgeci, gruplama, 6 görünüm,
// 7 tema (Siyah-Beyaz'da dolgu yok), sayfa seçenekleri, Word teması, hazır ayarlar, ⌘P kaydı.
import { describe, expect, it } from "vitest";
import { LAYOUTS, THEMES, applyPreset, normalizeDesign, prepareReport, renderReport, suggestGroupColumn, themeCss, BUILTIN_PRESETS, presetFromDesign } from "../src/lib/export";
import { layoutBlocks, reportHtmlParts, titleIndex } from "../src/lib/export/exportHtml";
import { docxPalette } from "../src/lib/export/exportDocx";
import { _resetRegistry, handlePrintCommand, markPrintHandled, openPrimaryExport, primaryExport, registerExport } from "../src/lib/export/exportRegistry";

const NOW = new Date(2026, 10, 10, 14, 5);
const SAMPLE = {
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

const unzipText = (bytes) => {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const files = {};
  let pos = 0;
  while (v.getUint32(pos, true) === 0x04034b50) {
    const size = v.getUint32(pos + 18, true);
    const nameLen = v.getUint16(pos + 26, true);
    const name = new TextDecoder().decode(bytes.slice(pos + 30, pos + 30 + nameLen));
    files[name] = new TextDecoder().decode(bytes.slice(pos + 30 + nameLen, pos + 30 + nameLen + size));
    pos += 30 + nameLen + size;
  }
  return files;
};
const css = (d) => themeCss(normalizeDesign(d), { orientation: "portrait" });
const backgrounds = (text) => [...text.matchAll(/background(?:-color)?:\s*([^;}]+)/g)].map((m) => m[1].trim());

describe("rapor dönüşümü", () => {
  it("sütun seçimi seçilen SIRAYLA uygulanır (yeniden sıralama)", () => {
    const p = prepareReport(SAMPLE, { columns: { entries: ["amount", "desc", "date"] } });
    expect(p.sections[0].columns.map((c) => c.key)).toEqual(["amount", "desc", "date"]);
    expect(p.sections[0].groups[0].rows[0][0]).toBe(1500);
    // CSV / Excel de aynı sırayı izler
    const csv = renderReport(SAMPLE, "csv", { columns: { entries: ["amount", "date"] }, sections: ["entries"] }).data;
    expect(csv.split("\r\n")[0]).toBe("﻿Tutar;Tarih");
    const sheet = unzipText(renderReport(SAMPLE, "xlsx", { columns: { entries: ["paid", "date"] } }).data)["xl/worksheets/sheet2.xml"];
    expect(sheet.indexOf("Ödendi")).toBeLessThan(sheet.indexOf("Tarih"));
  });
  it("satır süzgeci (metin araması) ve toplamların kapatılması", () => {
    const p = prepareReport(SAMPLE, { query: "saha kirası", totals: false });
    expect(p.sections[0].rowCount).toBe(2);
    expect(p.sections[0].totals).toBeNull();
  });
  it("gruplama: ara toplamlar ve Gruplu görünümde otomatik sütun", () => {
    const g = suggestGroupColumn(SAMPLE.sections[0]);
    expect(g.key).toBe("type"); // Gider/Gelir: en az farklı değer, tarih değil
    const p = prepareReport(SAMPLE, { layout: "grouped" });
    const s = p.sections[0];
    expect(s.groupKey).toBe("type");
    expect(s.groups.map((x) => x.value)).toEqual(["Gider", "Gelir"]);
    expect(s.groups[0].subtotal.values[4]).toBe(5819.5);
    expect(s.groups[1].subtotal.values[4]).toBe(12500);
  });
  it("başlık / alt başlık geçersiz kılınır", () => {
    const p = prepareReport(SAMPLE, { title: "Yönetim Raporu", subtitle: "Kasım" });
    expect(p.title).toBe("Yönetim Raporu");
    expect(p.subtitle).toBe("Kasım");
  });
});

describe("görünümler", () => {
  const p = prepareReport(SAMPLE, { now: NOW, groupBy: { entries: "type" } });
  const s = p.sections[0];
  it("her görünüm HTML üretir ve kayıtları içerir", () => {
    expect(LAYOUTS.map((l) => l.key)).toEqual(["table", "compact", "cards", "list", "detail", "grouped"]);
    for (const l of LAYOUTS) {
      const html = layoutBlocks(s, l.key).join("");
      expect(html, l.key).toContain("Yıldız Spor &amp; Kartal FK &lt;ortak&gt;");
      const out = renderReport(SAMPLE, "pdf", { now: NOW, design: { layout: l.key } }).html;
      expect(out, l.key).toContain(`l-${l.key}`);
      expect(out, l.key).toContain("Sayfa \" counter(page)");
    }
    expect(layoutBlocks(s, "table").join("")).toContain('class="xd-t"');
    expect(layoutBlocks(s, "compact").join("")).toContain("l-compact");
    expect(layoutBlocks(s, "cards").join("")).toContain('class="xd-card"');
    expect(layoutBlocks(s, "list").join("")).toContain('<ol class="xd-list"');
    expect(layoutBlocks(s, "detail").join("").match(/class="xd-rec"/g)).toHaveLength(4);
  });
  it("Gruplu: grup başına tablo + ara toplam + grup özeti; grup sütunu tekrar edilmez", () => {
    const html = layoutBlocks(s, "grouped").join("");
    expect(html.match(/<h3 class="xd-gh"/g)).toHaveLength(3); // Gider, Gelir, Grup özeti
    expect(html).toContain("Grup özeti");
    expect(html).toContain("Genel toplam");
    expect(html).toContain("5.819,50 ₺");
    const firstTable = html.slice(html.indexOf("<table"), html.indexOf("</table>"));
    expect(firstTable).not.toContain(">Tür<");
  });
  it("kart başlığı en tanıtıcı metin sütunu", () => {
    expect(s.columns[titleIndex(s.columns, s)].key).toBe("category"); // Açıklama uzun metin; Kategori Tür'den ayırt edici
    const named = { columns: [{ key: "k", label: "Kategori" }, { key: "title", label: "Başlık" }], groups: [{ rows: [["a", "x"], ["a", "y"]] }] };
    expect(titleIndex(named.columns, named)).toBe(1);
    const distinct = { columns: [{ key: "k", label: "Kategori" }, { key: "c", label: "Cari" }], groups: [{ rows: [["a", "x"], ["a", "y"]] }] };
    expect(titleIndex(distinct.columns, distinct)).toBe(1);
  });
  it("boş tablo her görünümde çökmez", () => {
    const empty = { title: "Boş", sections: [{ columns: [{ key: "a", label: "A" }, { key: "n", label: "N", type: "money", total: "sum" }], rows: [] }] };
    for (const l of LAYOUTS) expect(() => renderReport(empty, "pdf", { design: { layout: l.key } })).not.toThrow();
  });
});

describe("temalar", () => {
  it("7 tema, her biri farklı CSS ve @page üretir", () => {
    expect(THEMES.length).toBeGreaterThanOrEqual(6);
    const all = THEMES.map((t) => css({ theme: t.key }));
    expect(new Set(all).size).toBe(THEMES.length);
    for (const c of all) expect(c).toMatch(/@page\{size:A4 portrait;margin:13mm 11mm 15mm 11mm;/);
    expect(css({ theme: "classic" })).toContain("Georgia");
    expect(css({ theme: "corporate" })).toContain("linear-gradient");
  });
  it("Siyah-Beyaz: hiçbir dolgu yok, tüm renkler siyah", () => {
    for (const zebra of [false, true]) {
      const c = css({ theme: "bw", zebra, accent: "#dc2626" });
      const bgs = backgrounds(c);
      expect(bgs.length).toBeGreaterThan(10);
      for (const b of bgs) expect(["none", "#fff", "#ffffff"]).toContain(b);
      const colors = [...c.matchAll(/(?<![-\w])color:\s*([^;}]+)/g)].map((m) => m[1].trim());
      for (const col of colors) expect(["#000000", "inherit", "transparent"]).toContain(col);
      if (zebra) expect(c).toContain("dotted #000000"); // zebra dolgu yerine noktalı çizgi
    }
    const html = renderReport(SAMPLE, "pdf", { design: { theme: "bw", layout: "cards" }, logo: "data:image/png;base64,AAAA" }).html;
    expect(html).toContain("grayscale(1) invert(1) brightness(0)"); // beyaz logo siyaha çevrilir
  });
  it("Mürekkep tasarrufu: dolgu yok, logo yok, TASLAK filigranı", () => {
    for (const b of backgrounds(css({ theme: "draft", zebra: true }))) expect(["none", "#fff", "#ffffff"]).toContain(b);
    const html = renderReport(SAMPLE, "pdf", { design: { theme: "draft" }, logo: "data:image/png;base64,AAAA" }).html;
    expect(html).not.toContain("<img");
    expect(html).toContain('class="xd-wm">TASLAK');
  });
  it("vurgu rengi renkli temalara uygulanır, S/B temalarda yok sayılır", () => {
    expect(css({ theme: "modern", accent: "#dc2626" })).toContain("#dc2626");
    expect(css({ theme: "bw", accent: "#dc2626" })).not.toContain("#dc2626");
  });
  it("yazı boyu, sıklık, kâğıt, yön, kenar boşluğu", () => {
    const c = css({ fontSize: "large", density: "airy", pageSize: "A3", margins: "wide" });
    expect(c).toContain("font:11pt/1.5");
    expect(c).toContain("padding:7px 8px");
    expect(c).toContain("@page{size:A3 portrait;margin:20mm 18mm 22mm 18mm;");
    const html = renderReport(SAMPLE, "pdf", { design: { orientation: "portrait", pageSize: "Letter" } }).html;
    expect(html).toContain("size:Letter portrait");
  });
});

describe("belge seçenekleri", () => {
  it("başlık / logo / süzgeç / özet / toplam / sayfa no / imza / alt not", () => {
    const off = renderReport(SAMPLE, "pdf", { design: { show: { header: false, filters: false, summary: false, totals: false, pageNumbers: false } } }).html;
    expect(off).not.toContain('class="strip"');
    expect(off).not.toContain("Süzgeç:");
    expect(off).not.toContain('class="cards"');
    expect(off).not.toContain('class="tot"');
    expect(off).not.toContain("counter(pages)");
    const on = renderReport(SAMPLE, "pdf", { design: { show: { signatures: true }, signatures: ["Hazırlayan", "Mali müşavir"], footerNote: "Gizlidir — iç kullanım", title: "Kasım raporu" } }).html;
    expect(on).toContain('class="xd-sign"');
    expect(on).toContain("Mali müşavir");
    expect(on).toContain('@bottom-left{content:"Gizlidir — iç kullanım"');
    expect(on).toContain("<h1>Kasım raporu</h1>");
    const noLogo = renderReport(SAMPLE, "pdf", { design: { show: { logo: false } }, logo: "data:image/png;base64,AAAA" }).html;
    expect(noLogo).not.toContain("<img");
  });
  it("önizleme parçaları: alt bilgi, sayfa no, kök sınıfları", () => {
    const parts = reportHtmlParts(prepareReport(SAMPLE), { design: { theme: "minimal", layout: "list" } });
    expect(parts.attrs.class).toBe("xd t-minimal l-list");
    expect(parts.foot.right).toBeTruthy();
    expect(parts.flow).toContain('data-split="items"');
  });
  it("Word: tema renkleri, S/B'de dolgu yok, kâğıt boyu, imza, alt not, seçili sütunlar", () => {
    const color = unzipText(renderReport(SAMPLE, "docx", { design: { theme: "vivid", accent: "#16a34a" } }).data);
    expect(color["word/document.xml"]).toContain('w:fill="16A34A"');
    const bw = unzipText(renderReport(SAMPLE, "docx", { columns: { entries: ["desc", "amount"] }, design: { theme: "bw", pageSize: "A3", orientation: "portrait", show: { signatures: true }, footerNote: "İç kullanım" }, logoPng: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 100, 0, 0, 0, 50]) }).data);
    const doc = bw["word/document.xml"];
    expect(doc).not.toMatch(/w:fill="(?!auto)/);
    expect(bw["word/header1.xml"]).not.toMatch(/w:fill=/);
    expect(bw["word/media/logo.png"]).toBeUndefined(); // beyaz logo S/B'de basılmaz
    expect(doc).toContain('w:w="16838" w:h="23811"'); // A3 dikey
    expect(doc).toContain("Ad Soyad / İmza / Tarih");
    expect(doc).not.toContain(">Tarih<");
    expect(doc.indexOf(">Açıklama<")).toBeLessThan(doc.indexOf(">Tutar<"));
    expect(bw["word/footer1.xml"]).toContain("İç kullanım");
    expect(docxPalette({ theme: "classic" }).FONT).toBe("Georgia");
    expect(bw["word/styles.xml"]).toContain('w:ascii="Calibri"');
  });
});

describe("hazır ayarlar ve tasarım", () => {
  it("normalizeDesign eski / bozuk kaydı onarır", () => {
    const d = normalizeDesign({ theme: "yok", layout: "cards", accent: "kırmızı", show: { logo: false }, signatures: "x" });
    expect(d.theme).toBe("corporate");
    expect(d.layout).toBe("cards");
    expect(d.accent).toBe("");
    expect(d.show.logo).toBe(false);
    expect(d.show.header).toBe(true);
    expect(d.signatures).toEqual(["Hazırlayan", "Onaylayan"]);
  });
  it("hazır ayar uygulanır; başlık korunur, kaydedilen ayar başlık taşımaz", () => {
    const cur = normalizeDesign({ title: "Özel başlık", theme: "modern" });
    const next = applyPreset(cur, BUILTIN_PRESETS.find((p) => p.id === "office-bw"));
    expect(next.theme).toBe("bw");
    expect(next.zebra).toBe(true);
    expect(next.title).toBe("Özel başlık");
    expect(presetFromDesign(cur).title).toBeUndefined();
  });
});

describe("⌘P kaydı", () => {
  const fakeEl = (top, left = 0) => ({ isConnected: true, closest: () => null, getClientRects: () => [1], getBoundingClientRect: () => ({ top, left }) });
  it("birincil: primary işaretli, yoksa en üstteki", async () => {
    _resetRegistry();
    const opened = [];
    const a = registerExport({ el: () => fakeEl(300), open: (f) => opened.push(["a", f]) });
    registerExport({ el: () => fakeEl(100), open: (f) => opened.push(["b", f]) });
    expect(openPrimaryExport()).toBe(true);
    expect(opened.at(-1)).toEqual(["b", "pdf"]);
    registerExport({ el: () => fakeEl(900), open: (f) => opened.push(["c", f]), primary: true });
    openPrimaryExport("xlsx");
    expect(opened.at(-1)).toEqual(["c", "xlsx"]);
    a();
    registerExport({ el: () => ({ ...fakeEl(0), getClientRects: () => [] }), open: () => opened.push(["gizli"]) });
    expect(primaryExport()).not.toBeNull();
    expect(opened.some((x) => x[0] === "gizli")).toBe(false);
  });
  it("ekranın kendi işleyicisi markPrintHandled derse açılmaz; kayıt yoksa yedek çalışır", async () => {
    _resetRegistry();
    let fallback = 0;
    handlePrintCommand(() => { fallback += 1; });
    markPrintHandled();
    await new Promise((r) => setTimeout(r, 5));
    expect(fallback).toBe(0);
    handlePrintCommand(() => { fallback += 1; });
    await new Promise((r) => setTimeout(r, 5));
    expect(fallback).toBe(1);
  });
});
