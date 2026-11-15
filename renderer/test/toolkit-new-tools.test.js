// Araç Takımı'nın yeni araçlarının saf mantığı.
import { BYE, balanceTeams, buildBracket, drawGroups, fixtureRows, formatRoster, parseNames, parsePlayers, parseResults, parseRoster, perPerson, pickRandom, pickWinner, rng, roundDates, roundName, roundRobin, splitByWeight, standings, tally } from "../src/views/toolkit/lib/league";
import { TAX_2026, grossToNetYear, invoice, loan, netToGross, progressiveTax } from "../src/views/toolkit/lib/finance";
import { formatPhoneTr, validateIban, validateTckn } from "../src/views/toolkit/lib/validate";
import { csvToJson, diffLines, hashAll, jsonToRows, markdownToHtml, md5, parseCsv, regexTest, sniffDelimiter, toCsv } from "../src/views/toolkit/lib/textData";
import { barcodeSvg, code128, ean13, eanCheckDigit } from "../src/views/toolkit/lib/barcode";
import { coverRect, extractPalette, fmtStopwatch, inZone, lapRows, meetingNote, zonedToUtc } from "../src/views/toolkit/lib/misc";
import { runCommand } from "../src/views/toolkit/lib/command";

describe("fikstür (round-robin)", () => {
  test.each([4, 5, 6, 9, 12])("%i takım: herkes herkesle tam bir kez, haftada bir maç", (n) => {
    const teams = Array.from({ length: n }, (_, i) => `T${i + 1}`);
    const rounds = roundRobin(teams);
    expect(rounds).toHaveLength(n % 2 ? n : n - 1);
    const pairs = new Set();
    for (const rd of rounds) {
      const seen = new Set();
      for (const m of rd.matches) {
        expect(seen.has(m.home) || seen.has(m.away)).toBe(false);
        seen.add(m.home); seen.add(m.away);
        const k = [m.home, m.away].sort().join("|");
        expect(pairs.has(k)).toBe(false);
        pairs.add(k);
      }
      if (n % 2) expect(rd.bye).toBeTruthy();
    }
    expect(pairs.size).toBe((n * (n - 1)) / 2);
  });
  test("ev sahipliği dengeli (fark ≤ 1), rövanşlı devre ters", () => {
    const teams = ["A", "B", "C", "D", "E", "F"];
    const rounds = roundRobin(teams);
    const home = Object.fromEntries(teams.map((t) => [t, 0]));
    rounds.forEach((r) => r.matches.forEach((m) => { home[m.home] += 1; }));
    for (const t of teams) expect(Math.abs(home[t] - 2.5)).toBeLessThanOrEqual(1.5);
    const dbl = roundRobin(teams, { double: true });
    expect(dbl).toHaveLength(10);
    expect(dbl[5].matches[0]).toEqual({ home: rounds[0].matches[0].away, away: rounds[0].matches[0].home });
  });
  test("tablo satırları ve tarihler", () => {
    const rounds = roundRobin(["A", "B", "C"]);
    const rows = fixtureRows(rounds, { dates: roundDates("2026-11-14", rounds.length, 7) });
    expect(rows[0]).toEqual(["Hafta", "Tarih", "Ev sahibi", "Deplasman"]);
    expect(rows.filter((r) => r[3] === BYE)).toHaveLength(3);
    expect(rows[1][1]).toBe("14.11.2026");
  });
});

describe("eleme ağacı", () => {
  test("6 takım → 8'lik ağaç, ilk iki seribaşı BAY geçer", () => {
    const b = buildBracket(["A", "B", "C", "D", "E", "F"]);
    expect(b.size).toBe(8);
    expect(b.rounds).toHaveLength(3);
    expect(b.rounds[1][0].a).toBe("A");
    expect(b.rounds[1].some((m) => m.a === "B" || m.b === "B")).toBe(true);
    expect(roundName(0, 3)).toBe("Çeyrek final");
    expect(roundName(2, 3)).toBe("Final");
  });
  test("galip seç → üst tura taşınır; seçim değişince sonraki turlar temizlenir", () => {
    let b = buildBracket(["A", "B", "C", "D"]);
    b = pickWinner(b, 0, 0, "A");
    b = pickWinner(b, 0, 1, "B");
    expect(b.rounds[1][0]).toMatchObject({ a: "A", b: "B" });
    b = pickWinner(b, 1, 0, "B");
    expect(b.rounds[1][0].winner).toBe("B");
    b = pickWinner(b, 0, 1, "C");
    expect(b.rounds[1][0].b).toBe("C");
    expect(b.rounds[1][0].winner).toBeUndefined();
  });
  test("sırasız kipte iki BAY aynı maça düşmez", () => {
    const b = buildBracket(["A", "B", "C", "D", "E"], { seeded: false });
    expect(b.rounds[0].every((m) => !(m.a === null && m.b === null))).toBe(true);
  });
});

describe("puan durumu", () => {
  test("sonuçlardan tablo; puan, averaj, atılan gol ve ikili averaj", () => {
    const { results, errors } = parseResults("Kartallar 2-1 Aslanlar\nAslanlar 3 - 0 Kurtlar\nKurtlar 1:1 Kartallar\nbozuk satır\nKurtlar\t2\t0\tAslanlar");
    expect(results).toHaveLength(4);
    expect(errors).toEqual([{ line: 4, text: "bozuk satır" }]);
    const t = standings(results);
    expect(t.map((r) => [r.team, r.pts, r.gd])).toEqual([["Kartallar", 4, 1], ["Kurtlar", 4, -1], ["Aslanlar", 3, 0]]);
    expect(t[0]).toMatchObject({ team: "Kartallar", played: 2, won: 1, drawn: 1, lost: 0, gf: 3, ga: 2 });
  });
  test("özel puan sistemi ve maçı olmayan takım", () => {
    const t = standings([{ home: "A", away: "B", hg: 1, ag: 1 }], { teams: ["C"], points: { win: 2, draw: 1, loss: 0 } });
    expect(t.find((r) => r.team === "C").played).toBe(0);
    expect(t.find((r) => r.team === "A").pts).toBe(1);
  });
});

describe("kura, takım, bölüştürme, kadro, oylama", () => {
  test("isimler: virgül / satır, tekrarsız (Türkçe büyük-küçük)", () => {
    expect(parseNames("Ahmet, mehmet\nAli;ahmet\n\nİsmail, ismail")).toEqual(["Ahmet", "mehmet", "Ali", "İsmail"]);
  });
  test("tohumlu kura tekrarlanabilir; seçim tekrarsız", () => {
    const names = ["a", "b", "c", "d", "e"];
    expect(pickRandom(names, 3, rng(42))).toEqual(pickRandom(names, 3, rng(42)));
    expect(new Set(pickRandom(names, 5, rng(1))).size).toBe(5);
    const g = drawGroups(names, 2, rng(3));
    expect(g.map((x) => x.length).sort()).toEqual([2, 3]);
  });
  test("dengeli takımlar: güç farkı küçük, kişi sayısı eşit", () => {
    const players = parsePlayers("Ali 9\nVeli 8\nCan 7\nDeniz 6\nEmre 5\nFatih 4\nGökhan 3\nHakan 2");
    const t = balanceTeams(players, 2, rng(5));
    expect(t[0].players).toHaveLength(4);
    expect(Math.abs(t[0].total - t[1].total)).toBeLessThanOrEqual(2);
  });
  test("ağırlıklı bölüştürme: kuruş farkı dağıtılır, toplam tam", () => {
    const r = splitByWeight(1000, [{ name: "Hakem 1", weight: 3 }, { name: "Hakem 2", weight: 3 }, { name: "Gözlemci", weight: 1 }]);
    expect(r.items.reduce((s, x) => s + x.share, 0)).toBeCloseTo(1000, 6);
    expect(r.items[0].share).toBeCloseTo(428.57, 2);
    const r10 = splitByWeight(1000, [{ name: "a", weight: 1 }, { name: "b", weight: 2 }], { round: 10 });
    expect(r10.items.map((x) => x.share)).toEqual([330, 670]);
    expect(perPerson(2500, 14, 10)).toEqual({ exact: 178.57, each: 180, collected: 2520, surplus: 20 });
  });
  test("kadro: numara önde / sonda, kaptan, çakışan numara", () => {
    const r = parseRoster("10 ahmet YILMAZ (K)\nMehmet Kaya 7\n#7 - Ali Can\nKeremcan");
    expect(r.players[0]).toMatchObject({ no: 10, name: "Ahmet Yılmaz", captain: true });
    expect(r.duplicates).toEqual([7]);
    expect(r.missing).toEqual(["Keremcan"]);
    expect(formatRoster(r.players, { format: "short" }).split("\n").slice(0, 2)).toEqual(["7 A. Can", "7 M. Kaya"]);
    expect(formatRoster(r.players, { format: "upper" })).toContain("10 AHMET YILMAZ (K)");
  });
  test("oylama yüzdeleri", () => {
    const t = tally([{ label: "A", votes: 3 }, { label: "B", votes: 1 }]);
    expect(t.total).toBe(4);
    expect(t.rows[0]).toMatchObject({ pct: 75, leader: true });
  });
});

describe("finans (TR 2026)", () => {
  test("asgari ücret brütü → resmî net 28.075,50 TL (vergi ve damga istisnası)", () => {
    const y = grossToNetYear(TAX_2026.minWageGross);
    for (const m of y.months) { expect(m.net).toBeCloseTo(28075.5, 2); expect(m.incomeTax).toBe(0); expect(m.stamp).toBe(0); }
  });
  test("yüksek ücrette dilim yıl içinde değişir, SGK tavanı uygulanır", () => {
    const y = grossToNetYear(400000);
    expect(y.months[0].sgk).toBeCloseTo(297270 * 0.14, 2);
    expect(y.months[11].incomeTax).toBeGreaterThan(y.months[0].incomeTax);
    expect(progressiveTax(400000, TAX_2026.brackets)).toBeCloseTo(70500, 2);
    expect(progressiveTax(1500000, TAX_2026.brackets)).toBeCloseTo(367500, 2);
  });
  test("netten brüte gidiş-dönüş", () => {
    const g = netToGross(60000, 1);
    expect(grossToNetYear(g).months[0].net).toBeCloseTo(60000, 0);
  });
  test("serbest meslek makbuzu ve tevkifat", () => {
    const r = invoice(10000, { stopaj: 0.2, vatRate: 0.2 });
    expect(r).toMatchObject({ gross: 10000, vat: 2000, total: 12000, stopaj: 2000, net: 8000, netReceived: 10000 });
    expect(invoice(8000, { mode: "net", stopaj: 0.2 }).gross).toBe(10000);
    expect(invoice(12000, { mode: "total" }).gross).toBe(10000);
    expect(invoice(10000, { withholding: 0.5 })).toMatchObject({ withheldVat: 1000, collectedVat: 1000 });
  });
  test("kredi: eşit taksit, son bakiye sıfır; vergisiz konut kredisi", () => {
    const l = loan(100000, 12, 0.03, { taxed: false });
    expect(l.payment).toBeCloseTo(10046.21, 1);
    expect(l.schedule[11].balance).toBe(0);
    const t = loan(100000, 12, 0.03);
    expect(t.payment).toBeGreaterThan(l.payment);
    expect(t.taxes).toBeCloseTo(t.interest * 0.3, 0);
  });
});

describe("doğrulayıcılar", () => {
  test("IBAN: geçerli TR, banka adı; hatalı kontrol basamağı", () => {
    const v = validateIban("tr33 0006 1005 1978 6457 8413 26");
    expect(v.ok).toBe(true);
    expect(v.formatted).toBe("TR33 0006 1005 1978 6457 8413 26");
    expect(validateIban("TR34 0006 1005 1978 6457 8413 26").ok).toBe(false);
    expect(validateIban("TR33 0006").error).toMatch(/26 karakter/);
    expect(validateIban("GB82 WEST 1234 5698 7654 32").ok).toBe(true);
    // Ziraat (00010) için geçerli kontrol basamağı üret.
    const body = "0001000000000000123456" + "2927" + "00"; // BBAN + "TR" (29 27) + "00"
    let rem = 0; for (const ch of body) rem = (rem * 10 + Number(ch)) % 97;
    const iban = `TR${String(98 - rem).padStart(2, "0")}0001000000000000123456`;
    expect(validateIban(iban)).toMatchObject({ ok: true, bank: "Ziraat Bankası" });
  });
  test("T.C. kimlik algoritması", () => {
    expect(validateTckn("10000000146").ok).toBe(true);
    expect(validateTckn("10000000147").ok).toBe(false);
    expect(validateTckn("01234567890").ok).toBe(false);
    expect(validateTckn("123").error).toMatch(/11 hane/);
  });
  test("telefon biçimleme", () => {
    expect(formatPhoneTr("0532 123 45 67")).toMatchObject({ ok: true, type: "mobile", e164: "+905321234567", national: "0532 123 45 67", intl: "+90 532 123 45 67" });
    expect(formatPhoneTr("+90 (212) 555 11 22").type).toBe("landline");
    expect(formatPhoneTr("905321234567").ok).toBe(true);
    expect(formatPhoneTr("12345").ok).toBe(false);
  });
});

describe("metin ve veri", () => {
  test("satır karşılaştırma", () => {
    const d = diffLines("a\nb\nc", "a\nB\nc\nd");
    expect(d.parts.map((p) => p.op).join("")).toBe("=-+=+");
    expect(diffLines("a\nb", "A\nb", { ignoreCase: true }).added).toBe(0);
  });
  test("markdown güvenli: HTML kaçışlanır, javascript: bağlantısı yok", () => {
    const html = markdownToHtml("# Başlık\n\n**kalın** ve *eğik* `kod`\n\n- [x] bitti\n- iki\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n<script>x</script> [a](javascript:alert(1)) [b](https://elitlig.com)");
    expect(html).toContain("<h1>Başlık</h1>");
    expect(html).toContain("<strong>kalın</strong>");
    expect(html).toContain("<em>eğik</em>");
    expect(html).toContain('<li class="task"><input type="checkbox" disabled checked> bitti</li>');
    expect(html).toContain("<td>2</td>");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("javascript:");
    expect(html).toContain('href="https://elitlig.com"');
  });
  test("CSV ↔ JSON", () => {
    const csv = 'ad;yaş;not\n"Kaya; Ali";30;"dedi ki ""selam"""\nVeli;07;';
    expect(sniffDelimiter(csv)).toBe(";");
    expect(parseCsv(csv)[1]).toEqual(["Kaya; Ali", "30", 'dedi ki "selam"']);
    expect(csvToJson(csv)).toEqual([{ ad: "Kaya; Ali", yaş: 30, not: 'dedi ki "selam"' }, { ad: "Veli", yaş: "07", not: null }]);
    const rows = jsonToRows('[{"a":1,"b":"x"},{"a":2,"c":true}]');
    expect(rows).toEqual([["a", "b", "c"], [1, "x", ""], [2, "", true]]);
    expect(toCsv([["a", "b,c"], ['"q"', 1]])).toBe('a,"b,c"\n"""q""",1');
  });
  test("regex testi ve değiştirme", () => {
    const r = regexTest("(\\d+)-(\\d+)", "g", "2-1 ve 3-3", "$2-$1");
    expect(r.matches.map((m) => m.text)).toEqual(["2-1", "3-3"]);
    expect(r.matches[0].groups).toEqual(["2", "1"]);
    expect(r.replaced).toBe("1-2 ve 3-3");
    expect(regexTest("(", "g", "x").ok).toBe(false);
  });
  test("MD5 ve SHA özetleri (bilinen değerler)", async () => {
    expect(md5("")).toBe("d41d8cd98f00b204e9800998ecf8427e");
    expect(md5("The quick brown fox jumps over the lazy dog")).toBe("9e107d9d372bb6826bd81d3542a419d6");
    expect(md5("ğüşİöç")).toHaveLength(32);
    const h = await hashAll("abc");
    expect(h["SHA-256"]).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(h["SHA-1"]).toBe("a9993e364706816aba3e25717850c26c9cd0d89d");
  });
});

describe("barkod", () => {
  test("EAN-13 kontrol hanesi ve modül sayısı", () => {
    expect(eanCheckDigit("869000000000")).toBe(Number(ean13("869000000000").text[12]));
    expect(ean13("4006381333931").modules).toHaveLength(95);
    expect(() => ean13("4006381333932")).toThrow(/Kontrol hanesi/);
  });
  test("Code 128: uzun rakamlar C kümesiyle; Türkçe karakter reddedilir; SVG", () => {
    const a = code128("ELITLIG-2026");
    expect(a.codes[0]).toBe(104);
    const c = code128("12345678");
    expect(c.codes[0]).toBe(105);
    expect(c.codes.slice(1, 5)).toEqual([12, 34, 56, 78]);
    expect(c.modules.length).toBe((1 + 4 + 1) * 11 + 13);
    expect(() => code128("Şampiyon")).toThrow();
    expect(barcodeSvg(a)).toMatch(/^<svg[\s\S]*ELITLIG-2026<\/text><\/svg>$/);
  });
});

describe("diğer", () => {
  test("logodan palet: iki renkli görsel → iki baskın renk", () => {
    const px = new Uint8ClampedArray(100 * 4);
    for (let i = 0; i < 100; i += 1) { const red = i < 70; px.set(red ? [220, 20, 60, 255] : [10, 40, 200, 255], i * 4); }
    const p = extractPalette(px, 2);
    expect(p[0].hex).toBe("#DC143C");
    expect(p[0].share).toBeCloseTo(70, 0);
    expect(p[1].hex).toBe("#0A28C8");
  });
  test("saat dilimi: İstanbul 20:00 = Tokyo ertesi gün 02:00 (yaz saati yok)", () => {
    const utc = zonedToUtc("2026-11-10", "20:00", "Europe/Istanbul");
    expect(new Date(utc).toISOString()).toBe("2026-11-10T17:00:00.000Z");
    expect(inZone(utc, "Asia/Tokyo").time).toBe("02:00");
    expect(inZone(zonedToUtc("2026-07-01", "12:00", "Europe/London"), "Europe/Istanbul").time).toBe("14:00");
  });
  test("kronometre biçimi ve tur istatistikleri", () => {
    expect(fmtStopwatch(65430)).toBe("01:05,43");
    expect(fmtStopwatch(3723000)).toBe("1:02:03,00");
    const laps = lapRows([1000, 2500, 3100]);
    expect(laps.map((l) => l.lap)).toEqual([1000, 1500, 600]);
    expect(laps[2].best).toBe(true);
    expect(laps[1].worst).toBe(true);
  });
  test("toplantı notu: yapılacaklar görev listesi olur", () => {
    const md = meetingNote({ title: "Lig toplantısı", date: "10.11.2026", attendees: "Ali, Veli", template: "league", fields: { Kararlar: "Fikstür onaylandı", "Yapılacaklar": "Ali: hakem listesi" } });
    expect(md).toContain("# Lig toplantısı");
    expect(md).toContain("**Katılımcılar:** Ali, Veli");
    expect(md).toContain("- [ ] Ali: hakem listesi");
    expect(md).toContain("## Hakem ve görevliler");
  });
  test("kırparak doldur", () => {
    const c = coverRect(2000, 1000, 1080, 1080);
    expect([c.sx, c.sy, c.sw, c.sh].map(Math.round)).toEqual([500, 0, 1000, 1000]);
    expect(coverRect(1000, 1000, 1920, 1080, "contain")).toMatchObject({ dx: 420, dw: 1080 });
  });
});

describe("komut satırı", () => {
  const rates = { EUR: 1, USD: 1.1, TRY: 44 };
  test.each([
    ["hesap: 120*3", "360"],
    ["120*3", "360"],
    ["kdv 1500", "1.800"],
    ["kdv dahil 1800", "1.500"],
    ["yüzde 20 1500", "300"],
    ["maaş 33030", "28.075,5"],
    ["iban TR33 0006 1005 1978 6457 8413 26", "TR33 0006"],
    ["tc 10000000146", "Algoritmaya uygun"],
    ["tel 05321234567", "+90 532 123 45 67"],
  ])("%s", (q, expected) => {
    const r = runCommand(q, { rates });
    expect(r).toBeTruthy();
    expect(r.lines.map((l) => `${l.label} ${l.value}`).join(" | ")).toContain(expected);
  });
  test("çevir 100 usd → TL; kura; boş", () => {
    expect(runCommand("çevir 100 usd", { rates }).lines[0].value).toBe("4.000 TRY");
    const k = runCommand("kura ahmet, mehmet, ali", { rand: rng(9) });
    expect(["ahmet", "mehmet", "ali"]).toContain(k.lines[0].value);
    expect(runCommand("")).toBeNull();
    expect(runCommand("merhaba")).toBeNull();
  });
});
