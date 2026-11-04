"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { EventEmitter } = require("node:events");
const { createChatLink, diffIncoming, buildMultipart, mimeOf, unreadTotal, inboxThreads } = require("../chat");
const { accessFromUser, probeAccess, sameAccess } = require("../access");
const { createApi, isQueueable } = require("../api");

const conv = (id, extra = {}) => ({ id, title: `S${id}`, type: "direct", unread: 0, muted: false, last_message: { id: id * 10, kind: "text", body: "x", sender: { is_me: false } }, ...extra });

function fakeSocket() {
  const s = new EventEmitter();
  s.sent = [];
  s.emitServer = (name, payload) => EventEmitter.prototype.emit.call(s, name, payload);
  s.emit = (name, payload) => { s.sent.push([name, payload]); return true; };
  s.disconnect = () => { s.disconnected = true; };
  s.connect = () => {};
  return s;
}

const manualTimers = () => {
  const intervals = [];
  return {
    intervals,
    setInterval: (fn, ms) => { const t = { fn, ms }; intervals.push(t); return t; },
    clearInterval: (t) => { const i = intervals.indexOf(t); if (i >= 0) intervals.splice(i, 1); },
    setTimeout: (fn) => ({ fn }),
    clearTimeout: () => {},
  };
};

test("socket ana süreçte jetonla açılır, olaylar iletilir, okunmamış ve gelen mesaj bildirilir", async () => {
  let list = [conv(1), conv(2, { unread: 2, muted: true })];
  const api = { request: async () => ({ ok: true, data: { conversations: list } }), flush: () => {} };
  let socket;
  let opts;
  const timers = manualTimers();
  const link = createChatLink({ origin: "https://api.test", getToken: () => "TOKEN", ioFactory: (url, o) => { opts = o; socket = fakeSocket(); return socket; }, api, userAgent: "UA", timers });
  const seen = { events: [], incoming: [], unread: [], status: [] };
  link.events.on("event", (e) => seen.events.push(e.name));
  link.events.on("incoming", (e) => seen.incoming.push(e));
  link.events.on("unread", (n) => seen.unread.push(n));
  link.events.on("status", (s) => seen.status.push(s.state));
  link.connect();
  await new Promise((r) => setImmediate(r));
  let token;
  opts.auth((a) => { token = a.token; });
  assert.equal(token, "TOKEN");
  assert.equal(opts.extraHeaders["X-Client-Platform"], "desktop");
  assert.equal(link.status().state, "connecting");
  assert.ok(timers.intervals.some((t) => t.ms === 15000), "socket hazır değilken yoklama çalışır");
  assert.equal(link.unread(), 2);

  socket.emitServer("chat:ready", { user_id: 7 });
  await new Promise((r) => setImmediate(r));
  assert.equal(link.status().state, "connected");
  assert.ok(!timers.intervals.some((t) => t.ms === 15000), "bağlanınca yoklama durur");

  link.setActive(1);
  socket.emitServer("chat:message", { conversation_id: 1, message: { id: 11, kind: "text", body: "Selam", sender: { user_id: 2, is_me: false } } });
  socket.emitServer("chat:message", { conversation_id: 2, message: { id: 21, kind: "text", body: "Grup", sender: { user_id: 3, is_me: false } } });
  socket.emitServer("chat:message", { conversation_id: 2, message: { id: 22, kind: "text", body: "Benim", sender: { user_id: 7, is_me: true } } });
  socket.emitServer("chat:typing", { conversation_id: 1, user_id: 2, typing: true });
  assert.deepEqual(seen.events, ["chat:message", "chat:message", "chat:message", "chat:typing"]);
  assert.deepEqual(seen.incoming.map((i) => [i.message.id, i.muted]), [[11, false], [21, true]]);
  assert.equal(link.unread(), 3, "açık sohbet sayılmaz, benim mesajım sayılmaz");

  assert.deepEqual(link.emit("chat:typing", { conversation_id: 1, typing: true }), { ok: true });
  assert.equal(link.emit("call:invite", {}).ok, false);
  assert.deepEqual(socket.sent, [["chat:typing", { conversation_id: 1, typing: true }]]);

  socket.emitServer("disconnect");
  assert.equal(link.status().state, "connecting");
  assert.equal(link.emit("chat:read", {}).offline, true);
  // yoklama: yeni son mesaj bildirilir
  list = [conv(1, { last_message: { id: 99, kind: "text", body: "yeni", sender: { is_me: false } }, unread: 1 }), conv(2, { unread: 2, muted: true })];
  await link.refresh({ detect: true });
  assert.equal(seen.incoming.at(-1).message.id, 99);
  assert.equal(seen.incoming.at(-1).source, "poll");
  link.disconnect();
  assert.equal(socket.disconnected, true);
  assert.equal(link.unread(), 0);
});

test("yoklama karşılaştırması yalnız yeni, başkasından gelen mesajı verir", () => {
  const prev = new Map([[1, 10], [2, 20]]);
  const next = [conv(1), conv(2, { last_message: { id: 25, kind: "system", sender: {} } }), conv(3, { unread: 1, last_message: { id: 31, kind: "text", sender: { is_me: false } } }), conv(4, { last_message: { id: 41, kind: "text", sender: { is_me: true } } })];
  assert.deepEqual(diffIncoming(prev, next).map((x) => x.message.id), [31]);
  assert.deepEqual(diffIncoming(null, next), []);
  assert.equal(unreadTotal([{ unread: 2 }, { unread: 0, marked_unread: true }, { unread: 0 }]), 3);
});

test("multipart gövdesi ve dosya türü", () => {
  const { body, contentType } = buildMultipart("file", "rapor \"1\".pdf", "application/pdf", Buffer.from("PDF"), "BND");
  assert.equal(contentType, "multipart/form-data; boundary=BND");
  const text = body.toString("utf8");
  assert.match(text, /^--BND\r\nContent-Disposition: form-data; name="file"; filename="rapor _1_.pdf"/);
  assert.match(text, /Content-Type: application\/pdf\r\n\r\nPDF\r\n--BND--\r\n$/);
  assert.equal(mimeOf("Foto.JPG"), "image/jpeg");
  assert.equal(mimeOf("x.unknown"), "application/octet-stream");
});

test("çevrimdışı metin mesajı kuyruğa alınır; dosya mesajı alınmaz", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "elitlig-chat-"));
  const api = createApi({ origin: "https://api.test", dataDir: dir, fetchImpl: async () => { throw new TypeError("fetch failed"); }, sessionStore: { load: () => ({ token: "T" }) }, userAgent: "UA" });
  const text = await api.request({ method: "POST", path: "/api/chat/conversations/5/messages", body: { kind: "text", body: "Selam", client_id: "c1" } });
  assert.equal(text.queued, true);
  const image = await api.request({ method: "POST", path: "/api/chat/conversations/5/messages", body: { kind: "image", client_id: "c2", meta: {} } });
  assert.equal(image.ok, false);
  const react = await api.request({ method: "POST", path: "/api/chat/conversations/5/messages/9/reactions", body: { emoji: "👍" } });
  assert.equal(react.ok, false);
  assert.deepEqual(api.outbox().map((i) => i.body.client_id), ["c1"]);
  assert.equal(isQueueable("POST", "/api/chat/conversations/5/messages", { body: "x" }), false, "client_id olmadan kuyruk yok");
  const up = await api.upload("/api/chat/uploads/file", buildMultipart("file", "a.png", "image/png", Buffer.from("x")));
  assert.equal(up.offline, true);
});

test("üye mesajları: okunmamış birleşir, üye yazınca liste okunur ve bildirilir, yönetim yanıtı gelen sayılmaz", async () => {
  const mg = (id, unread, lastId, extra = {}) => ({ id, type: "management", title: `Takım ${id}`, entity: { kind: "team" }, unread, last_message: { id: lastId, kind: "text", body: "talep", sender: { user_id: 40, is_me: false, is_management: false } }, ...extra });
  let personal = [conv(1, { unread: 1 })];
  let inbox = [mg(50, 2, 500), mg(51, 0, 510), { id: 52, type: "management", entity: { kind: "member" }, unread: 0, last_message: null }, { id: 1, type: "direct", entity: { kind: "staff" }, unread: 1, last_message: { id: 10 } }];
  let inboxAllowed = true;
  const calls = [];
  const api = {
    flush: () => {},
    request: async ({ path, query }) => {
      calls.push(path);
      if (path === "/api/admin/chat/conversations") {
        assert.equal(query.limit, 100);
        return inboxAllowed ? { ok: true, data: { conversations: inbox } } : { ok: false, error: { status: 403 } };
      }
      return { ok: true, data: { conversations: personal } };
    },
  };
  const timeouts = [];
  const timers = { setInterval: () => ({}), clearInterval: () => {}, setTimeout: (fn) => { const t = { fn }; timeouts.push(t); return t; }, clearTimeout: (t) => { const i = timeouts.indexOf(t); if (i >= 0) timeouts.splice(i, 1); } };
  const runTimers = async () => { while (timeouts.length) timeouts.shift().fn(); await new Promise((r) => setImmediate(r)); await new Promise((r) => setImmediate(r)); };
  let socket;
  const link = createChatLink({ origin: "https://api.test", getToken: () => "T", ioFactory: () => { socket = fakeSocket(); return socket; }, api, timers, inboxEnabled: () => inboxAllowed });
  const seen = { incoming: [], requests: [] };
  link.events.on("incoming", (e) => seen.incoming.push(e));
  link.events.on("requests", (p) => seen.requests.push(p));
  link.connect();
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  assert.equal(link.inboxUnread(), 2, "yalnız üye sohbetleri sayılır (ekip sohbeti kişisel listede)");
  assert.equal(link.unread(), 3, "kişisel 1 + üye mesajları 2");
  assert.equal(link.conversation(50).title, "Takım 50");

  socket.emitServer("chat:ready", {});
  await new Promise((r) => setImmediate(r));
  // Üye yazdı: sunucu yalnız kimlik yollar → liste okunur, yeni mesaj bildirilir.
  inbox = [mg(50, 2, 500), mg(51, 1, 511)];
  socket.emitServer("chat:admin-inbox", { conversation_id: 51 });
  await runTimers();
  assert.deepEqual(seen.incoming.map((i) => [i.conversation.id, i.message.id, i.inbox]), [[51, 511, true]]);
  assert.equal(link.unread(), 4);

  // Yönetim adına yanıt (başka bir yönetici): gelen mesaj değildir, sayaç sıfırlanır.
  inbox = [mg(50, 0, 520, { last_message: { id: 520, kind: "text", body: "yanıt", sender: { user_id: null, is_management: true, is_me: false } } }), mg(51, 1, 511)];
  socket.emitServer("chat:message", { conversation_id: 50, admin: true, message: { id: 520, kind: "text", sender: { user_id: null, is_management: true, is_me: false } } });
  await runTimers();
  assert.equal(seen.incoming.length, 1, "yönetim yanıtı bildirilmez");
  assert.equal(link.unread(), 2);

  // Talepler olayı main.js'e iletilir.
  socket.emitServer("admin:requests", { id: 77, category: "transfer", type: "TRANSFER_OFFER_NEEDS_APPROVAL" });
  assert.deepEqual(seen.requests, [{ id: 77, category: "transfer", type: "TRANSFER_OFFER_NEEDS_APPROVAL" }]);

  // Yetki kalkınca (403) üye mesajları sayaçtan düşer.
  inbox = [mg(50, 5, 530)];
  inboxAllowed = false;
  await link.refreshInbox();
  assert.equal(link.inboxUnread(), 0);
  assert.equal(link.unread(), 1);
  assert.ok(calls.includes("/api/admin/chat/conversations"));
});

test("üye mesajı listesi ve yetkiler", async () => {
  assert.deepEqual(inboxThreads([{ id: 1, type: "management", entity: { kind: "player" }, last_message: { id: 1 } }, { id: 2, type: "management", last_message: null }, { id: 3, type: "direct", last_message: { id: 3 } }]).map((c) => c.id), [1]);
  assert.deepEqual(diffIncoming(new Map([[1, 1]]), [{ id: 1, unread: 0, last_message: { id: 2, kind: "text", sender: { is_management: true } } }]), [], "yönetim adına yazılan yanıt gelen sayılmaz");

  const full = accessFromUser({ isManagement: true, permissions: ["messages.view", "messages.reply", "messages.calls_view"] });
  assert.deepEqual(full, { known: true, inbox: true, reply: true, calls: true, listen: false, requests: true });
  assert.deepEqual(accessFromUser({ isManagement: true, permissions: [] }), { known: true, inbox: false, reply: false, calls: false, listen: false, requests: true });
  assert.equal(accessFromUser({ isManagement: true }).known, false, "eski oturum: liste yok");
  assert.equal(accessFromUser({ isManagement: true }, { inbox: true, calls: false }).inbox, true);
  assert.equal(accessFromUser(null).requests, false);
  assert.equal(sameAccess(full, { ...full }), true);
  assert.equal(sameAccess(full, { ...full, inbox: false }), false);

  const seen = [];
  const probe = await probeAccess(async (opts) => { seen.push(opts.path); return opts.path.endsWith("/reports") ? { ok: true, data: {} } : { ok: false, error: { status: 403 } }; });
  assert.deepEqual(probe, { inbox: true, calls: false });
  assert.deepEqual(seen.sort(), ["/api/admin/chat/calls", "/api/admin/chat/reports"]);
  assert.equal(await probeAccess(async () => ({ ok: false, offline: true })), null, "bağlantı yoksa bilinmiyor");
});
