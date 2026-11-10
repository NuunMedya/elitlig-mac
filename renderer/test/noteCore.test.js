import {
  applyFormat, backlinks, continueList, filterNotes, filterSlash, findByTitle as noteByTitle, fromTemplate, highlight, indentLines,
  noteToMarkdown, notebookPath, notebookTree, parseBlocks, parseInline, plainText, renameLinks, runSlash, searchNotes,
  quickNote, slashContext, taskStats, textStats, toggleTaskLine, wikiContext, wikiLinks,
} from "../src/lib/noteCore";

describe("Not Defteri çekirdeği", () => {
  test("satır içi biçim: kalın, italik, kod, bağlantı, not bağlantısı", () => {
    const tokens = parseInline("**Kalın** ve *eğik* `kod` [site](https://elitlig.com) [[Saha listesi|saha]] https://x.com/a.");
    expect(tokens.map((t) => t.type)).toEqual(["bold", "text", "italic", "text", "code", "text", "link", "text", "wiki", "text", "link", "text"]);
    expect(tokens[8]).toMatchObject({ title: "Saha listesi", text: "saha" });
    expect(tokens[10].href).toBe("https://x.com/a");
    // Kod içi ayrıştırılmaz; javascript: bağlantısı bağlantı sayılmaz.
    expect(parseInline("`**x**`")[0]).toEqual({ type: "code", text: "**x**" });
    expect(parseInline("[a](javascript:alert(1))").every((t) => t.type === "text")).toBe(true);
  });

  test("bloklar: başlık, liste, görev, alıntı, kod, tablo, ayraç", () => {
    const md = "# Başlık\nParagraf\nikinci satır\n\n- [ ] yap\n- [x] yapıldı\n\n1. bir\n2. iki\n\n> alıntı\n\n```\nkod\n```\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n---";
    const blocks = parseBlocks(md);
    expect(blocks.map((b) => b.type)).toEqual(["heading", "paragraph", "list", "list", "quote", "code", "table", "hr"]);
    expect(blocks[1].lines).toHaveLength(2);
    expect(blocks[2].items[1]).toMatchObject({ task: true, checked: true, line: 5 });
    expect(blocks[3].ordered).toBe(true);
    expect(blocks[6].rows[0][1][0].text).toBe("2");
  });

  test("onay kutusu satırı önizlemeden çevrilir; görev sayısı", () => {
    const md = "a\n- [ ] bir\n- [x] iki";
    expect(toggleTaskLine(md, 1)).toBe("a\n- [x] bir\n- [x] iki");
    expect(toggleTaskLine(md, 2)).toBe("a\n- [ ] bir\n- [ ] iki");
    expect(toggleTaskLine(md, 0)).toBe(md);
    expect(taskStats({ body: md, checklist: [{ text: "x", done: false }] })).toEqual({ open: 2, done: 1, total: 3 });
  });

  test("düz metin ve sayaçlar", () => {
    expect(plainText("# Başlık\n- [ ] **kalın** iş\n> alıntı")).toBe("Başlık\nkalın iş\nalıntı");
    expect(plainText("| A | B |\n| --- | --- |\n| 1 | 2 |")).toBe("A · B\n1 · 2");
    const stats = textStats({ title: "Maç", body: "Bugün üç gol attık." });
    expect(stats.words).toBe(5);
    expect(stats.minutes).toBe(1);
  });

  test("biçim komutları: sar / kaldır, satır önekleri", () => {
    expect(applyFormat("merhaba dünya", 0, 7, "bold")).toEqual({ value: "**merhaba** dünya", start: 2, end: 9 });
    expect(applyFormat("**merhaba** dünya", 2, 9, "bold").value).toBe("merhaba dünya");
    expect(applyFormat("", 0, 0, "italic")).toEqual({ value: "*metin*", start: 1, end: 6 });
    expect(applyFormat("bir\niki", 0, 7, "task").value).toBe("- [ ] bir\n- [ ] iki");
    expect(applyFormat("- [ ] bir", 0, 0, "task").value).toBe("bir");
    expect(applyFormat("bir\niki", 0, 7, "number").value).toBe("1. bir\n2. iki");
    expect(applyFormat("## eski", 0, 0, "h1").value).toBe("# eski");
  });

  test("Enter liste maddesini sürdürür, boş maddede bitirir; Tab içe kaydırır", () => {
    expect(continueList("- [x] bir", 9)).toEqual({ value: "- [x] bir\n- [ ] ", start: 16, end: 16 });
    expect(continueList("3. üç", 5).value).toBe("3. üç\n4. ");
    expect(continueList("a\n- ", 4)).toEqual({ value: "a\n", start: 2, end: 2 });
    expect(continueList("düz", 3)).toBeNull();
    expect(indentLines("- a", 3, 3).value).toBe("  - a");
    expect(indentLines("  - a", 5, 5, true).value).toBe("- a");
  });

  test("/ komut menüsü", () => {
    expect(slashContext("Merhaba /tab", 12)).toEqual({ from: 8, query: "tab" });
    expect(slashContext("http://x", 8)).toBeNull();
    expect(filterSlash("tab").map((c) => c.key)).toEqual(["table"]);
    expect(filterSlash("başlık").length).toBe(3);
    const cmd = filterSlash("ayraç")[0];
    expect(runSlash("Metin /ayraç", { from: 6, query: "ayraç" }, cmd).value).toBe("Metin \n---\n");
    const date = filterSlash("tarih")[0];
    expect(runSlash("/tarih", { from: 0, query: "tarih" }, date, new Date(2026, 10, 10)).value).toBe("10 Kasım 2026 Salı");
  });

  test("not bağlantıları, geri bağlantılar ve yeniden adlandırma", () => {
    const notes = [
      { id: 1, title: "Saha listesi", body: "", updatedAt: "2026-11-01" },
      { id: 2, title: "Toplantı", body: "Bakınız [[saha listesi]] ve [[Yok]]\nson", updatedAt: "2026-11-02" },
      { id: 3, title: "Çöp", body: "[[Saha listesi]]", deleted_at: "2026-11-03" },
    ];
    expect(wikiLinks(notes[1].body)).toEqual(["saha listesi", "Yok"]);
    expect(noteByTitle(notes, "SAHA LİSTESİ").id).toBe(1);
    const back = backlinks(notes, notes[0]);
    expect(back.map((b) => b.note.id)).toEqual([2]);
    expect(back[0].line).toBe("Bakınız saha listesi ve Yok");
    expect(renameLinks(notes[1].body, "Saha listesi", "Sahalar")).toBe("Bakınız [[Sahalar]] ve [[Yok]]\nson");
    expect(wikiContext("bkz [[Sah", 9)).toEqual({ from: 6, query: "Sah" });
  });

  test("tam metin arama: tüm kelimeler, başlık öne çıkar, vurgu", () => {
    const notes = [
      { id: 1, title: "Hakem ücretleri", body: "Kasım ödemeleri", tags: [], updatedAt: "2026-11-01" },
      { id: 2, title: "Toplantı", body: "Hakem ücretleri konuşuldu, kasım", tags: ["hakem"], updatedAt: "2026-11-05" },
      { id: 3, title: "Diğer", body: "ilgisiz", tags: [] },
    ];
    const res = searchNotes(notes, "hakem kasım");
    expect(res.map((r) => r.note.id)).toEqual([1, 2]);
    expect(res[1].snippet).toContain("Hakem ücretleri");
    expect(highlight("Hakem Ücreti", "hakem")).toEqual([{ text: "Hakem", hit: true }, { text: " Ücreti", hit: false }]);
  });

  test("akıllı listeler ve defter ağacı", () => {
    const now = new Date("2026-11-10T12:00:00Z").getTime();
    const notebooks = [{ id: 1, name: "Projeler", parent_id: null }, { id: 2, name: "Lig", parent_id: 1 }, { id: 3, name: "Arşivlik", parent_id: null, sort_order: -1 }];
    const notes = [
      { id: 1, pinned: true, notebook_id: 2, updatedAt: "2026-11-09T00:00:00Z", body: "- [ ] iş" },
      { id: 2, archived: true },
      { id: 3, deleted_at: "2026-11-01" },
      { id: 4, access: "editor", updatedAt: "2026-10-01T00:00:00Z", tags: ["Saha"] },
    ];
    expect(filterNotes(notes, { list: "all", now }).map((n) => n.id)).toEqual([1, 4]);
    expect(filterNotes(notes, { list: "pinned", now }).map((n) => n.id)).toEqual([1]);
    expect(filterNotes(notes, { list: "recent", now }).map((n) => n.id)).toEqual([1]);
    expect(filterNotes(notes, { list: "tasks", now }).map((n) => n.id)).toEqual([1]);
    expect(filterNotes(notes, { list: "shared", now }).map((n) => n.id)).toEqual([4]);
    expect(filterNotes(notes, { list: "archived", now }).map((n) => n.id)).toEqual([2]);
    expect(filterNotes(notes, { list: "trash", now }).map((n) => n.id)).toEqual([3]);
    expect(filterNotes(notes, { notebookId: 1, notebooks, now }).map((n) => n.id)).toEqual([1]);
    expect(filterNotes(notes, { tag: "saha", now }).map((n) => n.id)).toEqual([4]);
    expect(notebookTree(notebooks).map((n) => `${n.depth}:${n.name}`)).toEqual(["0:Arşivlik", "0:Projeler", "1:Lig"]);
    expect(notebookPath(notebooks, 2)).toBe("Projeler › Lig");
  });

  test("şablonlar ve Markdown dışa aktarma", () => {
    const meeting = fromTemplate("meeting", new Date(2026, 10, 10));
    expect(meeting.title).toBe("Toplantı — 10 Kasım 2026");
    expect(meeting.emoji).toBe("🗓️");
    expect(meeting.body).toContain("## Kararlar");
    expect(parseBlocks(fromTemplate("match").body).some((b) => b.type === "table")).toBe(true);
    const md = noteToMarkdown({ title: "Liste", emoji: "🛒", tags: ["alışveriş"], body: "", checklist: [{ text: "Top", done: true }] });
    expect(md).toBe("# 🛒 Liste\n\n_#alışveriş_\n\n- [x] Top");
  });

  test("hızlı not: ilk satır başlık, #etiketler etiket olur", () => {
    expect(quickNote("Saha listesi #saha\n- [ ] Kadıköy #fiyat")).toEqual({ title: "Saha listesi #saha", body: "- [ ] Kadıköy #fiyat", tags: ["saha", "fiyat"] });
    expect(quickNote("tek satır not")).toEqual({ title: null, body: "tek satır not", tags: [] });
  });
});
