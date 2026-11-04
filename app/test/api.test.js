"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createApi } = require("../api");

const setup = (handler) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "elitlig-api-"));
  const calls = [];
  const state = { down: false };
  const fetchImpl = async (url, init) => {
    calls.push({ url, ...init, body: init.body ? JSON.parse(init.body) : undefined });
    if (state.down) throw new TypeError("fetch failed");
    const { status = 200, body = {} } = handler(url, init) || {};
    return { ok: status < 400, status, text: async () => JSON.stringify(body) };
  };
  const unauthorized = [];
  const api = createApi({ origin: "https://api.test", dataDir: dir, fetchImpl, sessionStore: { load: () => ({ token: "T" }) }, userAgent: "UA ElitligDesktop/2", onUnauthorized: (d) => unauthorized.push(d) });
  return { api, calls, state, unauthorized };
};

test("istekler masaüstü başlıkları ve jetonla gider", async () => {
  const { api, calls } = setup(() => ({ body: { items: [1] } }));
  const res = await api.request({ path: "/api/tools/notes", query: { archived: 0, empty: "" } });
  assert.deepEqual(res, { ok: true, data: { items: [1] } });
  assert.equal(calls[0].url, "https://api.test/api/tools/notes?archived=0");
  assert.equal(calls[0].headers.Authorization, "Bearer T");
  assert.equal(calls[0].headers["X-Client-Platform"], "desktop");
});

test("bağlantı yokken son veri önbellekten gelir", async () => {
  const { api, state } = setup(() => ({ body: { items: ["eski"] } }));
  await api.request({ path: "/api/tools/contacts" });
  state.down = true;
  const res = await api.request({ path: "/api/tools/contacts" });
  assert.equal(res.ok, true);
  assert.equal(res.offline, true);
  assert.deepEqual(res.data, { items: ["eski"] });
  assert.equal(api.isOnline(), false);
  const miss = await api.request({ path: "/api/tools/ledger" });
  assert.equal(miss.ok, false);
  assert.equal(miss.offline, true);
});

test("çevrimdışı yazmalar kuyruğa girer; geçici kimlik gerçek kimlikle değiştirilerek gönderilir", async () => {
  let nextId = 41;
  const { api, state, calls } = setup((url, init) => (init.method === "POST" ? { status: 201, body: { item: { id: (nextId += 1) } } } : { body: { item: {} } }));
  state.down = true;
  assert.equal((await api.request({ method: "POST", path: "/api/tools/notes", body: { title: "a" }, tempId: "tmp_1" })).queued, true);
  assert.equal((await api.request({ method: "PATCH", path: "/api/tools/notes/tmp_1", body: { pinned: true } })).queued, true);
  assert.equal((await api.request({ method: "DELETE", path: "/api/tools/notes/7" })).queued, true);
  // Kuyruğa alınmayan uç (tablolar) hata döner.
  assert.equal((await api.request({ method: "PATCH", path: "/api/tools/sheets/3", body: {} })).ok, false);
  assert.equal(api.pending(), 3);
  state.down = false;
  calls.length = 0;
  const result = await api.flush();
  assert.equal(result.sent, 3);
  assert.equal(api.pending(), 0);
  assert.deepEqual(calls.map((c) => `${c.method} ${new URL(c.url).pathname}`), ["POST /api/tools/notes", "PATCH /api/tools/notes/42", "DELETE /api/tools/notes/7"]);
});

test("401 oturumu kapatır, hata mesajı arayüze iletilir", async () => {
  const { api, unauthorized } = setup(() => ({ status: 401, body: { message: "Oturum sona erdi", code: "TOKEN_STALE" } }));
  const res = await api.request({ path: "/api/todos" });
  assert.equal(res.ok, false);
  assert.equal(res.error.status, 401);
  assert.equal(res.error.message, "Oturum sona erdi");
  assert.equal(unauthorized.length, 1);
});

test("projeler: iletişim kaydı, soru ve adım/kişi güncellemesi kuyruğa girer; oluşturma ve silme bağlantı ister", async () => {
  const { isQueueable } = require("../api");
  assert.equal(isQueueable("POST", "/api/tools/projects/12/activities"), true);
  assert.equal(isQueueable("POST", "/api/tools/projects/12/questions"), true);
  assert.equal(isQueueable("PATCH", "/api/tools/projects/12/questions/tmp_ab1"), true);
  assert.equal(isQueueable("PATCH", "/api/tools/projects/12/steps/5"), true);
  assert.equal(isQueueable("PATCH", "/api/tools/projects/12/leads/9"), true);
  assert.equal(isQueueable("DELETE", "/api/tools/projects/12/leads/9"), false);
  assert.equal(isQueueable("POST", "/api/tools/projects/12/leads"), false);
  assert.equal(isQueueable("POST", "/api/tools/projects"), false);
  assert.equal(isQueueable("PATCH", "/api/tools/projects/12"), false);
  assert.equal(isQueueable("POST", "/api/tools/projects/12/leads/9/portfolio"), false);
  const { api, state } = setup(() => ({ status: 201, body: { item: { id: 3 }, lead: null } }));
  state.down = true;
  assert.equal((await api.request({ method: "POST", path: "/api/tools/projects/12/activities", body: { lead_id: 9, type: "call", outcome: "ulasilamadi" } })).queued, true);
  const refused = await api.request({ method: "POST", path: "/api/tools/projects/12/leads", body: { name: "X" } });
  assert.equal(refused.ok, false);
  assert.equal(refused.offline, true);
  state.down = false;
  assert.equal((await api.flush()).sent, 1);
});
