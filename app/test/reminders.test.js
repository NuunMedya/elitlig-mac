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
