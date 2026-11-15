import {
  contactMatches, contactToVcf, contactsToCsv, findDuplicates, formatBirthday, groupByAudience, guessMapping, letterOf,
  matchesAudiences, normalizeContact, parseCsv, parseVcf, rowsToContacts, sectionsByLetter, socialUrl, upcomingBirthdays, waNumber,
} from "../src/lib/contactCore";

describe("Rehber çekirdeği", () => {
  test("Türk alfabesiyle bölümler ve harf", () => {
    expect(letterOf("ıslak")).toBe("I");
    expect(letterOf("İsmail")).toBe("İ");
    expect(letterOf("şule")).toBe("Ş");
    expect(letterOf("123")).toBe("#");
    const sections = sectionsByLetter([{ name: "Zeki" }, { name: "Çağla" }, { name: "Cem" }, { name: "Ümit" }, { name: "@x" }]);
    expect(sections.map((s) => s.letter)).toEqual(["C", "Ç", "Ü", "Z", "#"]);
  });

  test("eski kişi kaydı tek biçime gelir; arama telefon rakamlarıyla da çalışır", () => {
    const c = normalizeContact({ name: "Ali", phone: "0555 111 22 33", email: "a@x.com" });
    expect(c.phones).toEqual([{ label: "cep", value: "0555 111 22 33" }]);
    expect(c.emails[0].value).toBe("a@x.com");
    expect(contactMatches(c, "5551112233")).toBe(true);
    expect(contactMatches({ name: "Ali", company: "Yeşil Saha", tags: ["sponsor"] }, "yeşil sponsor")).toBe(true);
    expect(contactMatches({ name: "Ali" }, "veli")).toBe(false);
    expect(waNumber("0555 111 22 33")).toBe("905551112233");
  });

  test("yaklaşan doğum günleri; yılsız ve 29 Şubat", () => {
    const today = new Date(2026, 10, 10);
    const list = upcomingBirthdays([
      { name: "A", birthday: "1990-11-12" },
      { name: "B", birthday: "1904-11-10" },
      { name: "C", birthday: "1988-02-29" },
      { name: "D", birthday: "1990-10-01" },
    ], { today, days: 120 });
    expect(list.map((b) => [b.contact.name, b.inDays, b.age])).toEqual([["B", 0, null], ["A", 2, 36], ["C", 110, 39]]);
    expect(list[2].date).toBe("2027-02-28");
    expect(formatBirthday("1904-03-14")).toBe("14 Mart");
    expect(formatBirthday("1990-03-14")).toBe("14 Mart 1990");
  });

  test("hedef kitle süzgeci: VEYA / VE, Elitlig sistem kitlesi, gruplama", () => {
    const memberAudiences = { 100: [5] };
    const rows = [
      { key: "m1", source: "manual", id: 1, card: { id: 1, audience_ids: [5, 6] } },
      { key: "m2", source: "manual", id: 2, card: { id: 2, audience_ids: [6] } },
      { key: "u100", source: "member", id: 100 },
      { key: "u101", source: "member", id: 101 },
    ];
    expect(rows.filter((r) => matchesAudiences(r, ["5", "6"], "or", memberAudiences)).map((r) => r.key)).toEqual(["m1", "m2", "u100"]);
    expect(rows.filter((r) => matchesAudiences(r, ["5", "6"], "and", memberAudiences)).map((r) => r.key)).toEqual(["m1"]);
    expect(rows.filter((r) => matchesAudiences(r, ["elitlig", "5"], "and", memberAudiences)).map((r) => r.key)).toEqual(["u100"]);
    const groups = groupByAudience(rows, [{ id: "elitlig", name: "Elitlig" }, { id: 5, name: "Sponsor" }, { id: 7, name: "Boş" }], memberAudiences);
    expect(groups.map((g) => [g.audience.name, g.rows.length])).toEqual([["Elitlig", 2], ["Sponsor", 2], ["Kitlesiz", 1]]);
  });

  test("vCard: yaz ve geri oku (çoklu telefon, yılsız doğum günü, sosyal)", () => {
    const vcf = contactToVcf({ name: "Selin Ak", company: "Ak; Matbaa", phones: [{ label: "cep", value: "0533 000 11 22" }, { label: "iş", value: "0312 000 00 00" }], emails: [{ label: "iş", value: "selin@ak.com" }], birthday: "1904-03-14", socials: [{ network: "instagram", value: "selinak" }], tags: ["matbaa"], note: "Satır 1\nSatır 2" });
    expect(vcf).toContain("ORG:Ak\\; Matbaa");
    expect(vcf).toContain("BDAY:--0314");
    expect(vcf).toContain("X-SOCIALPROFILE;TYPE=instagram:https://instagram.com/selinak");
    const [back] = parseVcf(vcf);
    expect(back).toMatchObject({ name: "Selin Ak", company: "Ak; Matbaa", birthday: "--03-14", note: "Satır 1\nSatır 2", tags: ["matbaa"] });
    expect(back.phones).toEqual([{ label: "cep", value: "0533 000 11 22" }, { label: "iş", value: "0312 000 00 00" }]);
    expect(back.socials[0].network).toBe("instagram");
  });

  test("vCard: telefonun dışa aktardığı biçim (2.1, katlanmış satır, N alanı)", () => {
    const text = "BEGIN:VCARD\r\nVERSION:2.1\r\nN:Yılmaz;Ahmet;;;\r\nTEL;CELL:+905551112233\r\nTEL;WORK;VOICE:0212 000 00 00\r\nEMAIL;HOME:ahmet@\r\n x.com\r\nEND:VCARD\r\nBEGIN:VCARD\r\nVERSION:3.0\r\nEND:VCARD";
    const list = parseVcf(text);
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe("Ahmet Yılmaz");
    expect(list[0].phones.map((p) => p.label)).toEqual(["cep", "iş"]);
    expect(list[0].emails[0].value).toBe("ahmet@x.com");
  });

  test("CSV: ayırıcı tahmini, tırnaklı alan, alan eşleme", () => {
    const rows = parseCsv("﻿Ad;Soyad;Cep Telefonu;E-posta;Firma;Not\nAli;Kaya;0555 111 22 33;ali@x.com;\"Kaya; İnşaat\";\"çok\nsatırlı\"\n");
    expect(rows).toHaveLength(2);
    expect(rows[1][4]).toBe("Kaya; İnşaat");
    const mapping = guessMapping(rows[0]);
    expect(mapping).toMatchObject({ first: 0, last: 1, phone: 2, email: 3, company: 4, note: 5 });
    const [c] = rowsToContacts(rows, mapping);
    expect(c).toMatchObject({ name: "Ali Kaya", company: "Kaya; İnşaat", note: "çok\nsatırlı" });
    expect(c.phones).toEqual([{ label: "cep", value: "0555 111 22 33" }]);
    expect(parseCsv("a,b\n1,2")[1]).toEqual(["1", "2"]);
    const csv = contactsToCsv([{ name: "Ali", phones: [{ value: "1" }, { value: "2" }], audienceNames: ["Sponsor"] }]);
    expect(csv.split("\r\n")[1]).toBe("Ali;;;\"1, 2\";;;;;;;Sponsor;;");
  });

  test("yinelenenler: ortak telefon / e-posta / ad; en dolu kart kalır", () => {
    const groups = findDuplicates([
      { id: 1, name: "Ahmet Baskı", phone: "0532 111 22 33" },
      { id: 2, name: "Ahmet B.", phones: [{ value: "+90 532 111 22 33" }], email: "a@b.com", company: "Baskı" },
      { id: 3, name: "Zeynep", email: "z@x.com" },
      { id: 4, name: "zeynep ", phone: "0500 000 00 00" },
      { id: 5, name: "Tek" },
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0].keep.id).toBe(2);
    expect(groups[0].reasons).toEqual(["telefon"]);
    expect(groups[1].reasons).toEqual(["ad"]);
  });

  test("sosyal hesap adresi", () => {
    expect(socialUrl("instagram", "@elitlig")).toBe("https://instagram.com/elitlig");
    expect(socialUrl("diğer", "https://a.com/b")).toBe("https://a.com/b");
  });
});
