import { manualRow, memberRow, mergeRows, rowContact } from "../src/lib/contactRows";
import { matchesAudiences } from "../src/lib/contactCore";

describe("rehber satırları (masaüstü)", () => {
  test("eski kart ve üye satırı; kitle süzgeciyle uyumlu anahtarlar", () => {
    const card = manualRow({ id: 3, name: "Selin", phone: "0533", audience_ids: [5] });
    expect(card).toMatchObject({ key: "m3", source: "manual", phone: "0533" });
    expect(card.card.phones).toEqual([{ label: "cep", value: "0533" }]);
    const member = memberRow({ id: 9, name: "Murat", categories: ["takim_baskani"], team: { id: 1, name: "Kartallar FK" } }, { id: 4, member_user_id: 9, name: "Murat", audience_ids: [5] });
    expect(member).toMatchObject({ key: "u9", team: { name: "Kartallar FK", captain: true } });
    expect(matchesAudiences(member, ["elitlig", "5"], "and", {})).toBe(true);
    expect(matchesAudiences(card, ["elitlig"], "or", {})).toBe(false);
  });
  test("birleştirme ve dışa aktarma kaydı", () => {
    const members = [memberRow({ id: 1, name: "Ali", createdAt: "2026-11-03" })];
    const cards = [manualRow({ id: 2, name: "Zeki", createdAt: "2026-11-04" })];
    expect(mergeRows(members, cards, "newest", false).map((r) => r.name)).toEqual(["Zeki", "Ali"]);
    const out = rowContact(memberRow({ id: 1, name: "Ali", phone: "0555", categories: ["oyuncu"], player: { team: "Kartallar" } }), ["Sponsor"]);
    expect(out).toMatchObject({ name: "Ali", company: "Kartallar", title: "Oyuncu", phones: [{ label: "cep", value: "0555" }], audienceNames: ["Sponsor"] });
  });
});
