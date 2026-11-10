"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { isQueueable } = require("../api");
const { createEquipmentFeed, equipmentNotifications } = require("../equipmentFeed");

test("ekipman: kart ve bakım / arıza yazmaları kuyruğa girer; zimmet, rezervasyon, toplu işlem bağlantı ister", () => {
  assert.equal(isQueueable("POST", "/api/tools/equipment/items"), true);
  assert.equal(isQueueable("PATCH", "/api/tools/equipment/items/12"), true);
  assert.equal(isQueueable("PATCH", "/api/tools/equipment/items/tmp_ab1"), true);
  assert.equal(isQueueable("POST", "/api/tools/equipment/items/12/maintenance"), true);
  assert.equal(isQueueable("POST", "/api/tools/equipment/items/12/fault"), true);
  assert.equal(isQueueable("DELETE", "/api/tools/equipment/items/12"), false);
  assert.equal(isQueueable("POST", "/api/tools/equipment/items/bulk"), false);
  assert.equal(isQueueable("POST", "/api/tools/equipment/items/import"), false);
  assert.equal(isQueueable("POST", "/api/tools/equipment/assign"), false);
  assert.equal(isQueueable("POST", "/api/tools/equipment/assignments/5/return"), false);
  assert.equal(isQueueable("POST", "/api/tools/equipment/reservations"), false);
  assert.equal(isQueueable("POST", "/api/tools/equipment/items/12/duplicate"), false);
});

const at = (h, dayOffset = 0) => new Date(2026, 10, 12 + dayOffset, h, 0, 0).getTime();

test("ekipman bildirimleri: iade yarın / bugün / gecikti, bakım zamanı; gece sessiz, tekrar yok", () => {
  const mine = [
    { id: 1, item_name: "Kamera", asset_tag: "EQ-0001", due_at: new Date(at(18, 1)).toISOString(), status: "open", purpose: "Final" },
    { id: 2, item_name: "Lens", asset_tag: "EQ-0002", due_at: new Date(at(17)).toISOString(), status: "open" },
    { id: 3, item_name: "Tripod", asset_tag: "EQ-0003", due_at: new Date(at(8, -2)).toISOString(), status: "open" },
    { id: 4, item_name: "Uzak", due_at: new Date(at(10, 9)).toISOString(), status: "open" },
    { id: 5, item_name: "Süresiz", due_at: null, status: "open" },
  ];
  const maintenance = [{ id: 9, name: "Jeneratör", asset_tag: "EQ-0009", next_at: "2026-11-10", days_left: -2, state: "overdue" }, { id: 10, name: "LED", next_at: "2026-12-01", days_left: 19, state: "ok" }];
  assert.deepEqual(equipmentNotifications({ mine, maintenance, now: at(7) }), []);
  const out = equipmentNotifications({ mine, maintenance, now: at(10) });
  assert.deepEqual(out.map((n) => n.title), ["İade yarın: Kamera", "İade bugün: Lens", "İade gecikti: Tripod", "Bakım zamanı: Jeneratör"]);
  assert.equal(out[0].route, "equipment:zimmet");
  assert.match(out[0].body, /EQ-0001 · Kamera · Final/);
  assert.equal(out[3].route, "equipment:bakim");
  assert.match(out[3].body, /2 gün gecikti/);
  const sent = new Set(out.flatMap((n) => [].concat(n.key)));
  assert.deepEqual(equipmentNotifications({ mine, maintenance, now: at(11), sent }), []);
  // Gecikme ertesi gün yeniden hatırlatılır.
  assert.deepEqual(equipmentNotifications({ mine, maintenance, now: at(10, 1), sent }).map((n) => n.title), ["İade bugün: Kamera", "İade gecikti: Lens", "İade gecikti: Tripod"]);
  // Çok sayıda bakım tek bildirimde toplanır.
  const many = Array.from({ length: 5 }, (_, i) => ({ id: 20 + i, name: `Kalem ${i}`, next_at: "2026-11-12", days_left: 0, state: "due_soon" }));
  const grouped = equipmentNotifications({ maintenance: many, now: at(10) });
  assert.equal(grouped.length, 1);
  assert.equal(grouped[0].title, "5 ekipmanın bakım zamanı geldi");
  assert.equal(grouped[0].key.length, 5);
});

test("ekipman akışı: önbellek, yetkisizlikte uzun bekleme, yazmada tazeleme", async () => {
  let calls = 0;
  let mode = "ok";
  const request = async ({ path }) => {
    calls += 1;
    if (mode === "denied") return { ok: false, error: { status: 403 } };
    if (mode === "down") return { ok: false, offline: true, error: { status: 0 } };
    return { ok: true, data: path.endsWith("/mine") ? { items: [{ id: 1 }] } : { due: [{ id: 2 }] } };
  };
  const feed = createEquipmentFeed({ request });
  const t0 = 1_000_000;
  assert.deepEqual(await feed.load(t0), { mine: [{ id: 1 }], maintenance: [{ id: 2 }] });
  await feed.load(t0 + 60000);
  assert.equal(calls, 2);
  feed.invalidate();
  mode = "down";
  assert.deepEqual((await feed.load(t0 + 120000)).mine, [{ id: 1 }]); // bağlantı yokken son veri
  mode = "denied";
  await feed.load(t0 + 30 * 60000);
  assert.deepEqual((await feed.load(t0 + 30 * 60000)).mine, []);
  const before = calls;
  await feed.load(t0 + 70 * 60000);
  assert.equal(calls, before); // yetkisizlikte bir saat sorulmaz
});
