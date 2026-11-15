// Araç takımına eklenen araçların saf yardımcıları: JSON, Base64 / URL / HTML, UUID, dolgu metni,
// yüzde / KDV, Türkçe sayı, tarih farkı / iş günü / geri sayım, karakter arama, araç listesi.
import { describe, expect, it } from "vitest";
import { base64Decode, base64Encode, formatJson, htmlEscape, htmlUnescape, isUuid, jsonErrorAt, lorem, parseTrNumber, percentOps, urlDecode, urlEncode, uuidV4, vat } from "../src/views/toolkit/devTools";
import { addToDate, countdown, dateDiff, holidayName, parseDay } from "../src/views/toolkit/dateTools";
import { CHAR_GROUPS, codePoints, searchChars } from "../src/views/toolkit/chars";

describe("JSON", () => {
  it("biçimler, sıkıştırır, anahtar sıralar, istatistik verir", () => {
    const r = formatJson('{"b":1,"a":[1,{"ç":true}]}', { sortKeys: true });
    expect(r.ok).toBe(true);
    expect(r.text.split("\n")[1]).toBe('  "a": [');
    expect(r.stats).toMatchObject({ keys: 3, depth: 3 });
    expect(formatJson('{ "a" : 1 }', { mode: "minify" }).text).toBe('{"a":1}');
    expect(formatJson("[1]", { indent: "tab" }).text).toBe("[\n\t1\n]");
    expect(formatJson("﻿{}").ok).toBe(true);
  });
  it("hatada satır / sütun", () => {
    const r = formatJson('{\n  "a": 1,\n}');
    expect(r.ok).toBe(false);
    expect(r.line).toBe(3);
    expect(r.error).toMatch(/satır 3/);
    expect(jsonErrorAt("abc\ndef", "Unexpected token at position 5")).toEqual({ line: 2, column: 2 });
    expect(formatJson("  ").ok).toBe(false);
  });
});

describe("kodlayıcılar", () => {
  it("Base64 UTF-8 güvenli, URL güvenli biçim, hatalı girdi", () => {
    const s = "Elitlig ğüşıöç İ ₺ ⚽";
    expect(base64Decode(base64Encode(s)).text).toBe(s);
    expect(base64Encode("şş?")).toBe("xZ/Fnz8=");
    expect(base64Encode("şş?", { urlSafe: true })).toBe("xZ_Fnz8");
    expect(base64Decode("xZ_Fnz8").text).toBe("şş?");
    expect(base64Decode("@@@").ok).toBe(false);
    expect(base64Decode("/w==").ok).toBe(false); // geçersiz UTF-8
  });
  it("URL ve HTML", () => {
    expect(urlEncode("a b&ç")).toBe("a%20b%26%C3%A7");
    expect(urlDecode("a+b%26%C3%A7").text).toBe("a b&ç");
    expect(urlDecode("%E0%A4%A").ok).toBe(false);
    expect(htmlEscape('<a href="x">&')).toBe("&lt;a href=&quot;x&quot;&gt;&amp;");
    expect(htmlUnescape("&lt;b&gt; &#8378; &#x20BA; &amp;")).toBe("<b> ₺ ₺ &");
  });
  it("UUID v4", () => {
    const u = uuidV4();
    expect(isUuid(u)).toBe(true);
    expect(u[14]).toBe("4");
    expect("89ab").toContain(u[19]);
    expect(uuidV4(() => new Uint8Array(16))).toBe("00000000-0000-4000-8000-000000000000");
    expect(new Set(Array.from({ length: 200 }, () => uuidV4())).size).toBe(200);
  });
});

describe("dolgu metni", () => {
  it("klasik açılış, adet, tohumla tekrarlanır, Türkçe", () => {
    expect(lorem({ unit: "words", count: 3, seed: 1 })).toBe("Lorem ipsum dolor");
    expect(lorem({ unit: "sentences", count: 4, seed: 2 }).startsWith("Lorem ipsum dolor sit amet, consectetur adipiscing elit.")).toBe(true);
    expect(lorem({ unit: "paragraphs", count: 3, seed: 3 }).split("\n\n")).toHaveLength(3);
    expect(lorem({ unit: "words", count: 50, seed: 9 })).toBe(lorem({ unit: "words", count: 50, seed: 9 }));
    const tr = lorem({ lang: "tr", unit: "words", count: 30, seed: 4 });
    expect(tr).not.toMatch(/lorem/i);
    expect(tr.split(" ").length).toBeGreaterThanOrEqual(30);
  });
});

describe("yüzde ve KDV", () => {
  it("yüzde işlemleri", () => {
    expect(percentOps(1500, 20)).toEqual({ of: 300, ratio: 7500, change: -98.67, plus: 1800, minus: 1200 });
    expect(percentOps(80, 100).change).toBe(25);
    expect(percentOps(0, 5).change).toBe(null);
    expect(percentOps(5, 0).ratio).toBe(null);
  });
  it("KDV hariç / dahil", () => {
    expect(vat(1000, 20)).toEqual({ net: 1000, vat: 200, gross: 1200 });
    expect(vat(1200, 20, { included: true })).toEqual({ net: 1000, vat: 200, gross: 1200 });
    expect(vat(110, 10, { included: true })).toEqual({ net: 100, vat: 10, gross: 110 });
    expect(vat("x", 20)).toBe(null);
  });
  it("Türkçe sayı", () => {
    expect(parseTrNumber("1.234,5")).toBe(1234.5);
    expect(parseTrNumber("1,234.5")).toBe(1234.5);
    expect(parseTrNumber("12,5 ₺")).toBe(12.5);
    expect(parseTrNumber("1.500")).toBe(1500);
    expect(parseTrNumber("2.5")).toBe(2.5);
    expect(parseTrNumber("")).toBe(null);
  });
});

describe("tarih", () => {
  it("resmî tatiller (sabit + dini bayram)", () => {
    expect(holidayName(parseDay("2026-10-29"))).toBe("Cumhuriyet Bayramı");
    expect(holidayName(parseDay("2026-03-21"))).toMatch(/Ramazan Bayramı 2/);
    expect(holidayName(parseDay("2026-05-27"))).toMatch(/Kurban Bayramı 1/);
    expect(holidayName(parseDay("2026-05-27"), { religiousOn: false })).toBe(null);
    expect(holidayName(parseDay("2026-11-10"))).toBe(null);
  });
  it("iki tarih arası: takvim / iş günü / ay", () => {
    // 2026-10-26 Pzt → 2026-11-02 Pzt: 7 gün; 29 Ekim Perşembe tatil → 4 iş günü
    const d = dateDiff("2026-10-26", "2026-11-02");
    expect(d).toMatchObject({ days: 7, weeks: 1, weekDays: 0, workDays: 4 });
    expect(d.holidays).toEqual([{ date: "2026-10-29", name: "Cumhuriyet Bayramı" }]);
    expect(dateDiff("2026-10-26", "2026-11-02", { saturdayWork: true }).workDays).toBe(5);
    const y = dateDiff("2025-01-31", "2026-03-15");
    expect([y.years, y.months, y.restDays]).toEqual([1, 1, 12]);
    expect(dateDiff("2026-11-10", "2026-11-01").sign).toBe(-1);
    expect(dateDiff("2026-02-30", "2026-03-01")).toBe(null);
  });
  it("yaz saati geçişinde gün sayısı kaymaz", () => {
    expect(dateDiff("2026-03-01", "2026-04-01").days).toBe(31);
  });
  it("gün / iş günü ekle", () => {
    expect(addToDate("2026-11-10", 5)).toBe("2026-11-15");
    expect(addToDate("2026-10-27", 2, { business: true })).toBe("2026-10-30", "29 Ekim atlanır");
    expect(addToDate("2026-10-27", 3, { business: true })).toBe("2026-11-02");
    expect(addToDate("2026-11-13", 1, { business: true })).toBe("2026-11-16", "Cuma + 1 = Pazartesi");
    expect(addToDate("2026-11-16", -1, { business: true })).toBe("2026-11-13");
    expect(addToDate("2026-03-19", 1, { business: true })).toBe("2026-03-23", "Ramazan Bayramı + hafta sonu");
  });
  it("geri sayım", () => {
    const now = new Date(2026, 0, 1, 0, 0, 0).getTime();
    expect(countdown(now + 2 * 86400000 + 3 * 3600000 + 4 * 60000 + 5000, now)).toMatchObject({ done: false, days: 2, hours: 3, minutes: 4, seconds: 5 });
    expect(countdown(now - 1, now).done).toBe(true);
  });
});

describe("karakterler", () => {
  it("Türkçe harfler, ₺, arama, kod noktası", () => {
    const all = CHAR_GROUPS.flatMap((g) => g.items.map((x) => x[0]));
    for (const c of ["ğ", "Ğ", "ı", "İ", "ş", "Ş", "₺", "©", "⚽"]) expect(all).toContain(c);
    expect(searchChars("lira").map((x) => x[0])).toContain("₺");
    expect(searchChars("KUPA").map((x) => x[0])).toContain("🏆");
    expect(searchChars("")).toEqual([]);
    expect(codePoints("₺")).toBe("U+20BA");
  });
});
