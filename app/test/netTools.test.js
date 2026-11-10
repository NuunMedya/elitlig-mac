// Araç Takımı → Ağ ve Sistem (app/netTools.js): ağ olmadan, sahte bağlantı / çözümleyici ile.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const n = require("../netTools");

test("cleanHost: URL'den alan adı, geçersiz girdi reddedilir", () => {
  assert.equal(n.cleanHost("https://elitlig.com/maclar?x=1"), "elitlig.com");
  assert.equal(n.cleanHost(" Elitlig.COM "), "elitlig.com");
  assert.equal(n.cleanHost("1.1.1.1"), "1.1.1.1");
  assert.equal(n.cleanHost("kötü ad"), null);
  assert.equal(n.cleanHost("a;rm -rf"), null);
  assert.equal(n.cleanHost(""), null);
});

test("parseTrace", () => {
  assert.deepEqual(n.parseTrace("ip=1.2.3.4\nloc=TR\ncolo=IST\n"), { ip: "1.2.3.4", loc: "TR", colo: "IST" });
});

test("info: genel IP alınamazsa yerel arayüzler yine döner", async () => {
  const r = await n.info({ fetchText: async () => { throw new Error("çevrimdışı"); } });
  assert.equal(r.ok, true);
  assert.ok(Array.isArray(r.interfaces));
  assert.equal(r.public, null);
  assert.match(r.error.message, /çevrimdışı/);
});

function fakeConnect(times) {
  let i = 0;
  let clock = 0;
  const now = () => clock;
  const connectImpl = () => {
    const s = new EventEmitter();
    s.destroy = () => {};
    const t = times[i++];
    setImmediate(() => { if (t == null) s.emit("error", new Error("ECONNREFUSED")); else { clock += t; s.emit("connect"); } });
    return s;
  };
  return { connectImpl, now };
}

test("ping: ortalama, titreşim, kayıp", async () => {
  const { connectImpl, now } = fakeConnect([20, 30, null, 10]);
  const r = await n.ping("example.com", { count: 4, connectImpl, now, lookup: async () => ({ address: "93.184.216.34" }) });
  assert.equal(r.ok, true);
  assert.equal(r.address, "93.184.216.34");
  assert.deepEqual(r.samples, [20, 30, null, 10]);
  assert.equal(r.avg, 20);
  assert.equal(r.min, 10);
  assert.equal(r.loss, 25);
  assert.equal(r.jitter, 15);
});

test("ping: çözümlenemeyen ad ve geçersiz girdi", async () => {
  const r = await n.ping("yok.invalid", { lookup: async () => { throw Object.assign(new Error("x"), { code: "ENOTFOUND" }); } });
  assert.equal(r.ok, false);
  assert.match(r.error.message, /ENOTFOUND/);
  assert.equal((await n.ping("a b")).error.code, "BAD_HOST");
});

test("dnsQuery: geçersiz tür ve ad", async () => {
  assert.equal((await n.dnsQuery("elitlig.com", "XYZ")).error.code, "BAD_TYPE");
  assert.equal((await n.dnsQuery("", "A")).error.code, "BAD_HOST");
});

test("system: temel alanlar", () => {
  const s = n.system({ app: { getVersion: () => "2.27.0" } });
  assert.equal(s.ok, true);
  assert.ok(s.cpu.cores >= 1);
  assert.ok(s.memory.total > 0);
  assert.equal(s.versions.app, "2.27.0");
});
