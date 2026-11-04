import {
  applyIncoming, applyReaction, canEdit, chatCounts, chatPreview, createDraftStore, dayLabel, directorySections, emojiOnlyCount,
  extractMentions, filterChats, formatBytes, groupMessages, insertMention, lastSeenLabel, listTime, markReadUntil, mediaUrl,
  mentionQuery, mergeMessages, nextVote, parseRich, pollResults, reactionSummary, sortChats, tickStatus, unreadTotal, upsertChat,
} from "../src/lib/chatUtils";

const NOW = new Date(2026, 10, 4, 15, 30); // 4 Kasım 2026 Çarşamba
const at = (dayOffset, h = 12, m = 0) => new Date(2026, 10, 4 + dayOffset, h, m).toISOString();
const msg = (id, extra = {}) => ({ id, kind: "text", body: `m${id}`, created_at: at(0), sender: { user_id: 2, name: "Ada", is_me: false }, ...extra });

describe("gün ayraçları ve gruplama", () => {
  test("gün etiketleri", () => {
    expect(dayLabel(at(0), NOW)).toBe("Bugün");
    expect(dayLabel(at(-1), NOW)).toBe("Dün");
    expect(dayLabel(at(-3), NOW)).toBe("Pazar");
    expect(dayLabel(at(-30), NOW)).toBe("5 Ekim");
    expect(dayLabel(new Date(2025, 0, 2), NOW)).toBe("2 Ocak 2025");
  });

  test("mesajlar günlere ve gönderen dizilerine ayrılır", () => {
    const list = [
      msg(1, { created_at: at(-1, 10, 0) }),
      msg(2, { created_at: at(0, 9, 0) }),
      msg(3, { created_at: at(0, 9, 2) }),
      msg(4, { created_at: at(0, 9, 3), sender: { user_id: 7, is_me: true } }),
      msg(5, { created_at: at(0, 9, 30) }),
      { id: 6, kind: "system", body: "Ada gruba katıldı", created_at: at(0, 9, 31), sender: {} },
    ];
    const items = groupMessages(list, NOW);
    expect(items.filter((i) => i.type === "day").map((i) => i.label)).toEqual(["Dün", "Bugün"]);
    const flags = items.filter((i) => i.type === "msg").map((i) => [i.message.id, i.first, i.last]);
    expect(flags).toEqual([[1, true, true], [2, true, false], [3, false, true], [4, true, true], [5, true, true], [6, true, true]]);
  });

  test("liste saati ve son görülme", () => {
    expect(listTime(at(0, 9, 5), NOW)).toBe("09:05");
    expect(listTime(at(-1), NOW)).toBe("Dün");
    expect(listTime(at(-2), NOW)).toBe("Pazartesi");
    expect(listTime(at(-20), NOW)).toBe("15.10.2026");
    expect(lastSeenLabel({ online: true }, NOW)).toBe("çevrimiçi");
    expect(lastSeenLabel({ online: false, last_seen: at(0, 14, 5) }, NOW)).toBe("son görülme bugün 14:05");
    expect(lastSeenLabel({ online: false, last_seen: at(-1, 22, 10) }, NOW)).toBe("son görülme dün 22:10");
    expect(formatBytes(2_400_000)).toBe("2,3 MB");
  });
});

describe("tikler ve tepkiler", () => {
  test("kendi mesajımın durumu", () => {
    const me = { user_id: 7, is_me: true };
    expect(tickStatus(msg(1))).toBe(null);
    expect(tickStatus({ client_id: "c1", sender: me, _pending: true })).toBe("pending");
    expect(tickStatus({ id: 2, sender: me, _failed: true })).toBe("failed");
    expect(tickStatus({ id: 3, sender: me, status: "sent", read_count: 0 })).toBe("sent");
    expect(tickStatus({ id: 4, sender: me, status: "sent", read_count: 2, recipient_count: 5 })).toBe("delivered");
    expect(tickStatus({ id: 5, sender: me, status: "read" })).toBe("read");
    expect(tickStatus({ id: 6, sender: me, deleted: true })).toBe(null);
  });

  test("tepki özeti ve iyimser değişiklik (kişi başına tek tepki)", () => {
    const base = [{ emoji: "❤️", count: 1, mine: false, users: [{ user_id: 2 }] }, { emoji: "👍", count: 3, mine: true, users: [{ user_id: 7 }, { user_id: 3 }, { user_id: 4 }] }];
    expect(reactionSummary(base)).toMatchObject({ top: ["👍", "❤️"], total: 4, mine: "👍" });
    const changed = applyReaction(base, "❤️", { user_id: 7, name: "Sen" });
    expect(changed.map((r) => [r.emoji, r.count, r.mine])).toEqual([["❤️", 2, true], ["👍", 2, false]]);
    const removed = applyReaction(changed, "❤️", { user_id: 7 });
    expect(removed.map((r) => [r.emoji, r.count])).toEqual([["👍", 2], ["❤️", 1]]);
    expect(applyReaction([], "😂", { user_id: 7 })).toEqual([{ emoji: "😂", count: 1, mine: true, users: [{ user_id: 7 }] }]);
  });

  test("anket sonuçları ve oy değişikliği", () => {
    const poll = { question: "Gün?", multiple: false, options: [{ id: "o1", text: "Salı" }, { id: "o2", text: "Perşembe" }], votes: { o1: [2, 3], o2: [7] } };
    const r = pollResults(poll, 7);
    expect(r.total).toBe(3);
    expect(r.rows.map((x) => [x.id, x.count, x.pct, x.mine])).toEqual([["o1", 2, 67, false], ["o2", 1, 33, true]]);
    expect(nextVote(poll, ["o2"], "o1")).toEqual(["o1"]);
    expect(nextVote(poll, ["o1"], "o1")).toEqual([]);
    expect(nextVote({ ...poll, multiple: true }, ["o1"], "o2")).toEqual(["o1", "o2"]);
  });
});

describe("metin: bağlantı, bahsetme, emoji", () => {
  const people = [{ user_id: 2, name: "Kartallar FK" }, { user_id: 3, name: "Ada" }];
  test("bağlantılar, @bahsetmeler ve kalın metin ayrıştırılır", () => {
    const parts = parseRich("Selam @Kartallar FK, *yarın* https://elitlig.com/mac/5. @Ada", people);
    expect(parts).toEqual([
      { t: "text", v: "Selam " }, { t: "mention", v: "@Kartallar FK", id: 2 }, { t: "text", v: ", " }, { t: "bold", v: "yarın" },
      { t: "text", v: " " }, { t: "link", v: "https://elitlig.com/mac/5" }, { t: "text", v: ". " }, { t: "mention", v: "@Ada", id: 3 },
    ]);
    expect(extractMentions("e-posta a@Ada değil, @ada evet", people)).toEqual([3]);
  });
  test("imleçteki @ sorgusu ve tamamlama", () => {
    expect(mentionQuery("Merhaba @Kar", 12)).toEqual({ query: "Kar", start: 8 });
    expect(mentionQuery("mail@x", 6)).toBe(null);
    expect(insertMention("Merhaba @Kar", 8, 12, "Kartallar FK")).toBe("Merhaba @Kartallar FK ");
  });
  test("yalnız emoji", () => {
    expect(emojiOnlyCount("👍")).toBe(1);
    expect(emojiOnlyCount("😂😂 ❤️")).toBe(3);
    expect(emojiOnlyCount("👍 tamam")).toBe(0);
    expect(emojiOnlyCount("👨‍👩‍👧")).toBe(1);
  });
});

describe("mesaj listesi", () => {
  test("iyimser mesaj sunucu yanıtıyla client_id üzerinden birleşir; alıntı korunur", () => {
    const pending = { client_id: "c1", body: "Selam", _pending: true, reply_to: { id: 1, body: "m1" }, sender: { is_me: true } };
    let list = mergeMessages([msg(1)], [pending]);
    expect(list.map((m) => m.id || m.client_id)).toEqual([1, "c1"]);
    list = mergeMessages(list, [{ id: 9, client_id: "c1", body: "Selam", reply_to: null, sender: { is_me: true }, status: "sent" }, msg(5)]);
    expect(list.map((m) => m.id)).toEqual([1, 5, 9]);
    expect(list[2].reply_to).toEqual({ id: 1, body: "m1" });
    expect(list[2]._pending).toBe(false);
    // tepkisiz gelen güncelleme eski tepkiyi korur
    list = mergeMessages([{ ...msg(1), reactions: [{ emoji: "👍", count: 1 }] }], [{ ...msg(1), body: "düzenlendi" }]);
    expect(list[0].reactions).toHaveLength(1);
  });
  test("okundu olayı kendi mesajlarımı okundu yapar", () => {
    const me = { user_id: 7, is_me: true };
    const list = [{ id: 1, sender: me, created_at: at(0, 9), status: "sent" }, { id: 2, sender: me, created_at: at(0, 11), status: "sent" }];
    expect(markReadUntil(list, at(0, 10)).map((m) => m.status)).toEqual(["read", "sent"]);
    const group = markReadUntil([{ id: 3, sender: me, created_at: at(0, 9), status: "sent", read_count: 1, recipient_count: 2 }], at(0, 10), { group: true });
    expect(group[0]).toMatchObject({ read_count: 2, status: "read" });
  });
  test("düzenleme süresi", () => {
    const mine = { id: 1, kind: "text", sender: { is_me: true }, created_at: new Date(NOW.getTime() - 10 * 60000).toISOString() };
    expect(canEdit(mine, NOW.getTime())).toBe(true);
    expect(canEdit({ ...mine, created_at: new Date(NOW.getTime() - 20 * 60000).toISOString() }, NOW.getTime())).toBe(false);
    expect(canEdit({ ...mine, kind: "image" }, NOW.getTime())).toBe(false);
  });
});

describe("sohbet listesi", () => {
  const chats = [
    { id: 1, title: "Ada", type: "direct", last_message_at: at(-1), unread: 0 },
    { id: 2, title: "Kaptanlar", type: "group", last_message_at: at(0, 10), unread: 3 },
    { id: 3, title: "Kartallar FK", type: "direct", last_message_at: at(-5), pinned: true, pinned_at: at(-2), other_user: { team_name: "Kartallar FK" } },
    { id: 4, title: "Eski grup", type: "group", last_message_at: at(0, 11), archived: true, unread: 1 },
    { id: 5, title: "Başkent SK", type: "direct", last_message_at: at(-3), pinned: true, pinned_at: at(-1), marked_unread: true },
  ];
  test("sabitlenenler üstte, sonra son mesaja göre", () => {
    expect(sortChats(chats).map((c) => c.id)).toEqual([5, 3, 4, 2, 1]);
  });
  test("süzgeçler: tümü arşivi gizler, okunmamış, gruplar, arşiv, arama", () => {
    expect(filterChats(chats).map((c) => c.id)).toEqual([5, 3, 2, 1]);
    expect(filterChats(chats, { filter: "unread" }).map((c) => c.id)).toEqual([5, 2]);
    expect(filterChats(chats, { filter: "groups" }).map((c) => c.id)).toEqual([2]);
    expect(filterChats(chats, { filter: "archive" }).map((c) => c.id)).toEqual([4]);
    expect(filterChats(chats, { q: "kartal" }).map((c) => c.id)).toEqual([3]);
    expect(filterChats(chats, { filter: "pinned" }).map((c) => c.id)).toEqual([5, 3]);
    expect(chatCounts(chats)).toEqual({ all: 4, unread: 2, groups: 1, pinned: 2, archive: 1 });
    expect(unreadTotal(chats)).toBe(5);
  });
  test("gelen mesaj ve sohbet yayını listeye işlenir", () => {
    const m = { id: 50, body: "Yeni", created_at: at(0, 12), sender: { user_id: 2, is_me: false } };
    const { list, found } = applyIncoming(chats, 1, m);
    expect(found).toBe(true);
    expect(list.find((c) => c.id === 1)).toMatchObject({ unread: 1, last_message: m });
    expect(applyIncoming(chats, 2, m, { active: true }).list.find((c) => c.id === 2).unread).toBe(0);
    const up = upsertChat(chats, { id: 3, title: "Kartallar FK", unread: 2 });
    expect(up.find((c) => c.id === 3)).toMatchObject({ pinned: true, unread: 2 });
    expect(upsertChat(chats, { id: 4, removed: true })).toHaveLength(4);
    expect(upsertChat(chats, { id: 9, title: "Yeni" })).toHaveLength(6);
  });
  test("önizleme: grupta gönderen adı, benimse Sen, türe göre simge", () => {
    expect(chatPreview({ type: "group", last_message: { kind: "text", body: "Selam", sender: { name: "Ada Yıldız" } } })).toEqual({ prefix: "Ada: ", text: "Selam" });
    expect(chatPreview({ type: "direct", last_message: { kind: "image", body: "📷 Fotoğraf", meta: { caption: null }, sender: { is_me: true } } })).toEqual({ prefix: "Sen: ", text: "📷 Fotoğraf" });
    expect(chatPreview({ type: "direct", last_message: { kind: "audio", meta: { audio: { duration_ms: 65000 } }, sender: {} } }).text).toBe("🎤 Sesli mesaj (1:05)");
    expect(chatPreview({ type: "direct", last_message: { deleted: true, sender: {} } }).text).toBe("Bu mesaj silindi");
  });
});

describe("taslaklar, rehber, medya", () => {
  test("taslak deposu sohbet başına tutar; boş metin siler", () => {
    const mem = new Map();
    const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
    const drafts = createDraftStore(storage);
    drafts.set(1, { text: "yarım kalan", reply: { id: 3 } });
    drafts.set(2, { text: "ikinci" });
    expect(drafts.get(1)).toMatchObject({ text: "yarım kalan", reply: { id: 3 } });
    drafts.set(2, { text: "   " });
    expect(drafts.get(2)).toBe(null);
    drafts.clear(1);
    expect(Object.keys(drafts.all())).toEqual([]);
    expect(createDraftStore({ getItem: () => { throw new Error("x"); }, setItem: () => {} }).get(1)).toBe(null);
  });
  test("rehber bölümleri: takım adı öne, seçilenler/hariçler düşer, arama takım adında da", () => {
    const dir = { staff: [{ user_id: 8, name: "Zeynep" }], managers: [{ user_id: 1, name: "Kartallar FK", team_name: "Kartallar FK", managed_team_id: 9, subtitle: "Takım Yöneticisi" }], players: [{ user_id: 2, name: "Ada", team_name: "Kartallar FK", subtitle: "Oyuncu · Kartallar FK" }, { user_id: 1, name: "Kartallar FK", managed_team_id: 9 }], members: [] };
    const all = directorySections(dir);
    expect(all.map((s) => [s.key, s.items.map((i) => i.user_id)])).toEqual([["staff", [8]], ["managers", [1]], ["players", [2]]]);
    expect(directorySections(dir, { q: "kartal", exclude: [1] }).map((s) => s.items.map((i) => i.name))).toEqual([["Ada"]]);
    expect(all[2].items[0].team).toBe("Kartallar FK");
  });
  test("medya adresi önbellekli protokole çevrilir", () => {
    expect(mediaUrl("https://cdn.test/a b.png")).toBe("elitlig-media://m/https%3A%2F%2Fcdn.test%2Fa%20b.png");
    expect(mediaUrl("ada.png")).toBe(null);
  });
});

describe("albümler", () => {
  test("art arda gelen fotoğraflar albüm olur; açıklama ve başka mesaj albümü kapatır", async () => {
    const { albumize } = await import("../src/lib/chatUtils");
    const img = (id, extra = {}) => msg(id, { kind: "image", created_at: at(0, 9, id), meta: { file: { url: `https://x/${id}.png` }, caption: null }, ...extra });
    const items = groupMessages([img(1), img(2), img(3, { meta: { file: {}, caption: "Saha" } }), img(4), msg(5, { created_at: at(0, 9, 5) }), img(6, { created_at: at(0, 9, 6) })], NOW);
    const out = albumize(items).filter((i) => i.type !== "day");
    expect(out.map((i) => (i.type === "album" ? i.messages.map((m) => m.id) : i.message.id))).toEqual([[1, 2, 3], 4, 5, 6]);
  });
});
