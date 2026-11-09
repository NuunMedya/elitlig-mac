"use strict";
// Bağlantı testi (speedtest.js): giriş sunucusuna bağlantı süresi + tek bağlantılı yükleme hızı.
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const net = require("node:net");
const { runUplinkTest, percentile } = require("../studio/speedtest");

/** Gövdeyi bytesPerSec hızında tüketen yerel yükleme sunucusu (yanıt gövde bitince). */
function throttledServer(bytesPerSec, { status = 200 } = {}) {
  const conns = new Set();
  const srv = http.createServer((req, res) => {
    conns.add(req.socket);
    let got = 0;
    const t0 = Date.now();
    req.on("data", (d) => {
      got += d.length;
      const due = (got / bytesPerSec) * 1000 - (Date.now() - t0);
      if (due > 5) { req.pause(); setTimeout(() => req.resume(), due); }
    });
    req.on("end", () => { res.writeHead(status); res.end("ok"); });
  });
  return {
    listen: () => new Promise((r) => srv.listen(0, "127.0.0.1", () => r(srv.address().port))),
    close: () => new Promise((r) => { for (const c of conns) c.destroy(); srv.close(r); }),
    keepAliveSockets: () => conns.size,
  };
}

test("yüzdelik", () => {
  assert.equal(percentile([5, 1, 3, 2, 4], 90), 5);
  assert.equal(percentile([5, 1, 3, 2, 4], 50), 3);
  assert.equal(percentile([], 50), null);
});

test("bağlantı testi: ölçülen yükleme ≈ sunucunun tükettiği hız; tek bağlantı; giriş sunucusuna bağlantı süresi", { timeout: 30000 }, async () => {
  const srv = throttledServer(4 * 1024 * 1024); // ≈ 33,5 Mbps
  const port = await srv.listen();
  const ingest = net.createServer((s) => s.destroy());
  await new Promise((r) => ingest.listen(0, "127.0.0.1", r));
  try {
    const r = await runUplinkTest({ endpoint: `http://127.0.0.1:${port}/__up`, ingestHost: "127.0.0.1", ingestPort: ingest.address().port, sizes: [256 * 1024, 1024 * 1024, 2 * 1024 * 1024, 4 * 1024 * 1024], maxMs: 8000 });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.samples.length, 4);
    assert.ok(r.uploadKbps > 22000 && r.uploadKbps < 42000, `ölçülen ${r.uploadKbps} kbps`);
    assert.equal(srv.keepAliveSockets(), 1); // RTMP gibi tek TCP bağlantısı
    assert.ok(Number.isFinite(r.rttMs) && r.rttMs >= 0);
    assert.equal(r.ingestReachable, true);
  } finally {
    await srv.close();
    await new Promise((r) => ingest.close(r));
  }
});

test("bağlantı testi: sunucu hatası / geçersiz adres → ok:false ve Türkçe ileti; giriş sunucusuna ulaşılamazsa rttMs null", { timeout: 20000 }, async () => {
  const srv = throttledServer(50 * 1024 * 1024, { status: 500 });
  const port = await srv.listen();
  try {
    const r = await runUplinkTest({ endpoint: `http://127.0.0.1:${port}/__up`, ingestHost: null, sizes: [1024 * 1024] });
    assert.equal(r.ok, false);
    assert.match(r.error.message, /Yükleme testi yapılamadı/);
    const bad = await runUplinkTest({ endpoint: "ftp://x", ingestHost: null });
    assert.equal(bad.error.code, "BAD_ENDPOINT");
    const dead = net.createServer();
    await new Promise((r2) => dead.listen(0, "127.0.0.1", r2));
    const deadPort = dead.address().port;
    await new Promise((r2) => dead.close(r2));
    const nr = await runUplinkTest({ endpoint: "ftp://x", ingestHost: "127.0.0.1", ingestPort: deadPort });
    assert.equal(nr.rttMs, null);
    assert.equal(nr.ingestReachable, false);
  } finally {
    await srv.close();
  }
});
