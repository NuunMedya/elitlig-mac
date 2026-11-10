"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { dueNotifications } = require("../reminders");

const now = Date.UTC(2026, 10, 4, 9, 0);
const iso = (ms) => new Date(ms).toISOString();

test("hatırlatma zamanı gelen etkinlik ve görev bildirilir, gösterilen tekrarlanmaz", () => {
  const events = [
    { id: 1, occurrence_key: "1:0", title: "Toplantı", occurrence_start: iso(now + 30 * 60000), remind_minutes: 30, source: "event" },
    { id: 2, occurrence_key: "2:0", title: "Sonra", occurrence_start: iso(now + 90 * 60000), remind_minutes: 30, source: "event" },
    { id: 3, occurrence_key: "3:0", title: "Hatırlatmasız", occurrence_start: iso(now), remind_minutes: null, source: "event" },
  ];
  const todos = [
    { id: 9, title: "Sahayı ara", dueAt: iso(now - 60000), status: "open" },
    { id: 10, title: "Eski", dueAt: iso(now - 3 * 3600000), status: "open" },
    { id: 11, title: "Bitti", dueAt: iso(now), status: "done" },
  ];
  const due = dueNotifications({ events, todos, now });
  assert.deepEqual(due.map((d) => d.key), ["event:1:0:30", "todo:9:" + iso(now - 60000)]);
  assert.equal(due[1].title, "Zamanı geldi: Sahayı ara");
  assert.equal(dueNotifications({ events, todos, now, sent: new Set(due.map((d) => d.key)) }).length, 0);
});

/* ------------------------------ düzenli ödemeler ------------------------------ */

const { billNotifications } = require("../reminders");
const bill = (over = {}) => ({ key: "1:2026-11-15", name: "Elektrik", type: "expense", party: "Enerjisa", amount: 1200, estimated: true, status: "due_soon", late: false, days: 3, ...over });
const at = (h) => new Date(2026, 10, 12, h, 0, 0).getTime();

test("düzenli ödeme: yaklaşırken, vade günü ve gecikince birer kez; gece sessiz", () => {
  const soon = billNotifications({ bills: [bill()], now: at(10) });
  assert.equal(soon.length, 1);
  assert.equal(soon[0].key, "bill:1:2026-11-15:soon");
  assert.match(soon[0].body, /3 gün sonra · ~1\.200,00 ₺ · Enerjisa/);
  assert.equal(soon[0].route, "ledger:duzenli");
  assert.deepEqual(billNotifications({ bills: [bill()], now: at(10), sent: new Set(["bill:1:2026-11-15:soon"]) }), []);
  assert.equal(billNotifications({ bills: [bill({ days: 0 })], now: at(10) })[0].body.startsWith("Bugün son gün"), true);
  const late = billNotifications({ bills: [bill({ status: "overdue", late: true, days: -2 })], now: at(10) });
  assert.equal(late[0].title, "Gecikti: Elektrik");
  assert.deepEqual(billNotifications({ bills: [bill()], now: at(6) }), []);
  // Ödenmiş, atlanmış ve uzak dönemler bildirilmez; aynı dönem iki listede gelirse tek sayılır.
  assert.deepEqual(billNotifications({ bills: [bill({ status: "paid" }), bill({ key: "2:x", status: "skipped" }), bill({ key: "3:x", status: "upcoming", days: 12 })], now: at(10) }), []);
  assert.equal(billNotifications({ bills: [bill(), bill()], now: at(10) }).length, 1);
});

test("düzenli ödeme: çok sayıda bildirim tek bildirimde toplanır", () => {
  const many = [1, 2, 3, 4, 5].map((i) => bill({ key: `${i}:2026-11-01`, name: `Ödeme ${i}`, status: "overdue", late: true, days: -5 }));
  const out = billNotifications({ bills: many, now: at(10) });
  assert.equal(out.length, 1);
  assert.equal(out[0].title, "5 düzenli ödeme gecikti");
  assert.equal(out[0].key.length, 5);
  assert.match(out[0].body, /ve 2 tane daha/);
});

/* ------------------------------ proje adımları ------------------------------ */

const { projectNotifications } = require("../reminders");
const stepCard = (over = {}) => ({ id: 21, kind: "project_step", title: "Saha kirala", allDay: true, status: "open", dueAt: new Date(2026, 10, 12, 23, 59).toISOString(), project: { name: "Kış Turnuvası", phaseName: "Hazırlık" }, ...over });

test("proje adımının son günü sabah bir kez bildirilir; gece ve bitmiş adımda bildirim yok", () => {
  assert.deepEqual(projectNotifications({ todos: [stepCard()], now: at(7) }), []);
  const due = projectNotifications({ todos: [stepCard(), stepCard({ id: 22, status: "done" }), stepCard({ id: 23, dueAt: new Date(2026, 10, 13, 23, 59).toISOString() })], now: at(10) });
  assert.equal(due.length, 1);
  assert.equal(due[0].title, "Bugün son gün: Saha kirala");
  assert.equal(due[0].body, "Kış Turnuvası · Hazırlık");
  assert.equal(due[0].route, "todos");
  assert.deepEqual(projectNotifications({ todos: [stepCard()], now: at(15), sent: new Set([due[0].key]) }), []);
  // 23:59'daki "Zamanı geldi" bildirimi tüm gün proje adımında gösterilmez.
  assert.deepEqual(dueNotifications({ todos: [stepCard({ dueAt: new Date(at(10) - 60000).toISOString() })], now: at(10) }), []);
});

test("aynı gün çok proje adımı tek bildirimde toplanır", () => {
  const todos = [1, 2, 3, 4].map((id) => stepCard({ id, title: `Adım ${id}` }));
  const due = projectNotifications({ todos, now: at(10) });
  assert.equal(due.length, 1);
  assert.equal(due[0].title, "4 proje adımının bugün son günü");
  assert.equal(due[0].key.length, 4);
});
