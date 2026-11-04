import { asInboxMessage, callRow, filterInbox, inboxCounts, inboxThreads, mergeChats, mergedUnread, unreadMerged } from "../src/lib/inboxUtils";

const at = (h) => new Date(2026, 10, 4, h, 0).toISOString();
const mgmt = (id, kind, extra = {}) => ({ id, type: "management", title: `Ü${id}`, subtitle: kind === "team" ? "Takım · Yetkili: Burak" : "Oyuncu · Kartallar", entity: { kind }, unread: 0, last_message_at: at(id), last_message: { id: id * 10, body: "selam", sender: { is_me: false } }, ...extra });

describe("ortak gelen kutusu listesi", () => {
  const raw = [
    mgmt(1, "team", { unread: 2 }),
    mgmt(2, "player"),
    { ...mgmt(3, "member"), last_message: null }, // yalnız talep kartı olan sohbet: listelenmez
    { ...mgmt(6, "member"), last_message: { id: 60, kind: "notification", audience: "management", body: "kart" } }, // eski kart
    { id: 4, type: "direct", title: "Zeynep", entity: { kind: "staff" }, last_message: { id: 1 } }, // ekip sohbeti: kişisel listede
    mgmt(5, "member", { unread: 1 }),
  ];
  test("yalnız üyelerin gerçek mesajlı yönetim sohbetleri, _inbox işaretiyle", () => {
    const list = inboxThreads(raw);
    expect(list.map((c) => c.id)).toEqual([1, 2, 5]);
    expect(list[0]).toMatchObject({ _inbox: true, kind: "team", archived: false });
    expect(inboxThreads(null)).toEqual([]);
  });
  test("sayılar ve tür süzgeci; okunmamış önde", () => {
    const list = inboxThreads(raw);
    expect(inboxCounts(list)).toEqual({ all: 3, unread: 2, team: 1, player: 0, member: 1, unreadMessages: 3 });
    expect(filterInbox(list).map((c) => c.id)).toEqual([5, 1, 2]);
    expect(filterInbox(list, { kind: "team" }).map((c) => c.id)).toEqual([1]);
    expect(filterInbox(list, { q: "yetkili" }).map((c) => c.id)).toEqual([1]);
    expect(filterInbox(list, { unreadOnly: true }).map((c) => c.id)).toEqual([5, 1]);
  });
  test("kişisel liste ile birleşme: aynı kimlik tekrar etmez, okunmamış toplanır", () => {
    const personal = [{ id: 2, type: "direct", title: "Kişisel", unread: 1, last_message_at: at(3) }, { id: 9, type: "group", unread: 0, marked_unread: true, last_message_at: at(2) }];
    const inbox = inboxThreads(raw);
    expect(mergeChats(personal, inbox).map((c) => c.id)).toEqual([2, 9, 1, 5]);
    expect(mergedUnread(personal, inbox)).toBe(1 + 1 + 2 + 1);
    expect(unreadMerged(personal, inbox).map((c) => c.id)).toEqual([5, 2, 9, 1]);
    expect(unreadMerged(personal, inbox, { q: "ü1" }).map((c) => c.id)).toEqual([1]);
  });
});

describe("yönetim adına yazılan mesajlar", () => {
  test("ElitLig Yönetimi mesajı bizim tarafımızda, yazan yönetici etikette", () => {
    const m = { id: 1, sender: { user_id: null, name: "ElitLig Yönetimi", is_me: false, is_management: true }, meta: { admin_name: "Ahmet Yılmaz" } };
    expect(asInboxMessage(m)).toMatchObject({ sender: { is_me: true, is_management: true }, _admin: "Ahmet Yılmaz" });
    const member = { id: 2, sender: { user_id: 40, is_me: false, is_management: false } };
    expect(asInboxMessage(member)).toBe(member);
  });
  test("arama kaydı satırı", () => {
    expect(callRow({ caller: { name: "Burak" }, callee: { name: "Ahmet" }, status: "ended", duration_seconds: 83, has_recording: true, recording_url: "https://x/r.webm" }))
      .toEqual({ from: "Burak", to: "Ahmet", duration: "1:23", missed: false, label: "Görüşme · 1:23", recording: true, url: "https://x/r.webm" });
    expect(callRow({ caller: { name: "Can" }, callee: null, status: "missed" })).toMatchObject({ to: "ElitLig Yönetimi", missed: true, label: "Cevapsız", url: null });
  });
});
