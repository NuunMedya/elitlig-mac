"use strict";
// Node RTMP(S) yayıncısı (rtmppub.js) ve aktarıcının Node ağ ucu (relay.js publisher: "node").
//
// Ölçüm özeti (2.21.0; kullanıcı alanı WAN öykünücüsü, TUN + iki ağ ad alanı, gönderende
// cubic ve autocorking kapalı = macOS gibi; 12,6 Mbps 1080p TS, 25 Mbps / 40 ms):
//   ffmpeg RTMP + -tcp_nodelay 1 (2.20.1): ortam 12,2 Mbps → kabloda 21,0 Mbps, 22 359 paket/sn, %99,9'u < 300 B
//   ffmpeg RTMP, Nagle açık (yedek yol):    12,2 → 12,1 Mbps, 1 017 paket/sn
//   Node yayıncısı (4096 B parça):          12,2 → 12,0 Mbps, 1 023 paket/sn, sunucu onayı ölçülüyor
// Aşağıdaki "ffmpeg 128 B parça" testi bu farkın kaynağını gerçek ffmpeg ile doğrular.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");
const { spawn } = require("node:child_process");
const ff = require("../studio/ffmpeg");
const { createRtmpPublisher, createFlvReader, chunkMessage, parseRtmpUrl, amfDecode, amfEncode } = require("../studio/rtmppub");
const { createRelay } = require("../studio/relay");
const { createRtmpSink } = require("./rtmp-sink");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const candidate = ff.resolveFfmpeg({ resourcesPath: null });
let infoPromise = null;
const getInfo = () => (infoPromise ||= ff.probeFfmpeg(candidate));
const skipReason = async () => {
  if (!candidate) return "ffmpeg yok";
  const info = await getInfo();
  if (!info.available) return `ffmpeg eksik: ${info.error}`;
  if (!info.encoders.libx264) return "libx264 yok";
  return null;
};
const waitFor = async (fn, ms = 10000, step = 50) => {
  const end = Date.now() + ms;
  while (Date.now() < end) { const v = fn(); if (v) return v; await sleep(step); }
  return fn();
};

/* --------------------------------- birim --------------------------------- */

test("parçalama: 4096 baytlık parçalar, aralarda 1 baytlık fmt 3 başlığı; genişletilmiş zaman damgası her parçada", () => {
  const payload = Buffer.alloc(10000, 7);
  const m = chunkMessage({ csid: 6, type: 9, streamId: 1, timestamp: 1234, payload, chunkSize: 4096 });
  assert.equal(m.length, 12 + 10000 + 2);
  assert.equal(m[0], 6); // fmt 0, csid 6
  assert.equal(m.readUIntBE(1, 3), 1234);
  assert.equal(m.readUIntBE(4, 3), 10000);
  assert.equal(m[7], 9);
  assert.equal(m.readUInt32LE(8), 1);
  assert.equal(m[12 + 4096], 0xc6);
  assert.equal(m[12 + 4096 + 1 + 4096], 0xc6);
  const big = chunkMessage({ csid: 4, type: 8, timestamp: 0x1000000 + 5, payload: Buffer.alloc(5000), chunkSize: 4096 });
  assert.equal(big.readUIntBE(1, 3), 0xffffff);
  assert.equal(big.readUInt32BE(12), 0x1000000 + 5);
  assert.equal(big[16 + 4096], 0xc4);
  assert.equal(big.readUInt32BE(16 + 4096 + 1), 0x1000000 + 5);
  assert.equal(big.length, 16 + 5000 + 5);
});

test("FLV okuyucu: hizasız parçalardan etiketler; zaman damgası üst baytı", () => {
  const tag = (type, ts, data) => {
    const h = Buffer.alloc(11);
    h[0] = type; h.writeUIntBE(data.length, 1, 3); h.writeUIntBE(ts & 0xffffff, 4, 3); h[7] = (ts >>> 24) & 0xff;
    const prev = Buffer.alloc(4); prev.writeUInt32BE(11 + data.length);
    return Buffer.concat([h, data, prev]);
  };
  const flv = Buffer.concat([Buffer.from([0x46, 0x4c, 0x56, 1, 5, 0, 0, 0, 9, 0, 0, 0, 0]), tag(18, 0, Buffer.from("meta")), tag(9, 40, Buffer.alloc(3000, 1)), tag(8, 0x1234567, Buffer.alloc(10, 2))]);
  const r = createFlvReader();
  const tags = [];
  for (let i = 0; i < flv.length; i += 333) tags.push(...r.feed(flv.subarray(i, i + 333)));
  assert.deepEqual(tags.map((t) => [t.type, t.timestamp, t.data.length]), [[18, 0, 4], [9, 40, 3000], [8, 0x1234567, 10]]);
  assert.equal(r.pending(), 0);
});

test("adres: YouTube rtmp / rtmps, port, sorgu içeren anahtar", () => {
  assert.deepEqual(parseRtmpUrl("rtmp://a.rtmp.youtube.com/live2/abcd-efgh"), { tls: false, host: "a.rtmp.youtube.com", port: 1935, app: "live2", key: "abcd-efgh", tcUrl: "rtmp://a.rtmp.youtube.com/live2" });
  const s = parseRtmpUrl("rtmps://a.rtmps.youtube.com:443/live2/k1");
  assert.equal(s.tls, true); assert.equal(s.port, 443); assert.equal(s.tcUrl, "rtmps://a.rtmps.youtube.com:443/live2");
  assert.equal(parseRtmpUrl("rtmps://live-api-s.facebook.com:443/rtmp/FB-1-2?s_bl=1&a=b").key, "FB-1-2?s_bl=1&a=b");
  assert.equal(parseRtmpUrl("rtmp://host/onlyapp"), null);
  assert.deepEqual(amfDecode(Buffer.concat([amfEncode("x"), amfEncode(2), amfEncode(null), amfEncode({ a: true })])), ["x", 2, null, { a: true }]);
});

/** Yapay FLV akışı: başlık, onMetaData, AVC dizi başlığı, AAC yapılandırması, sonra n kare. */
function fakeFlv({ frames = 30, frameBytes = 9000, keyEvery = 10 } = {}) {
  const tag = (type, ts, data) => {
    const h = Buffer.alloc(11);
    h[0] = type; h.writeUIntBE(data.length, 1, 3); h.writeUIntBE(ts & 0xffffff, 4, 3); h[7] = (ts >>> 24) & 0xff;
    const prev = Buffer.alloc(4); prev.writeUInt32BE(11 + data.length);
    return Buffer.concat([h, data, prev]);
  };
  const parts = [Buffer.from([0x46, 0x4c, 0x56, 1, 5, 0, 0, 0, 9, 0, 0, 0, 0])];
  parts.push(tag(18, 0, Buffer.concat([amfEncode("onMetaData"), amfEncode({ width: 1920, height: 1080 })])));
  parts.push(tag(9, 0, Buffer.from([0x17, 0, 0, 0, 0, 1, 0x64, 0, 0x2a])));
  parts.push(tag(8, 0, Buffer.from([0xaf, 0, 0x11, 0x90])));
  for (let i = 0; i < frames; i += 1) {
    const v = Buffer.alloc(frameBytes, i & 0xff);
    v[0] = i % keyEvery === 0 ? 0x17 : 0x27; v[1] = 1;
    parts.push(tag(9, i * 33, v));
    parts.push(tag(8, i * 33, Buffer.from([0xaf, 1, 1, 2, 3])));
  }
  return Buffer.concat(parts);
}

test("yayıncı ↔ RTMP sunucusu: Set Chunk Size 4096, connect (app, tcUrl), publish anahtarı, @setDataFrame, ortam; sunucu onayı sayılır", async () => {
  const sink = createRtmpSink({ windowAck: 50000 });
  const port = await sink.listen();
  const pub = createRtmpPublisher({ url: `rtmp://127.0.0.1:${port}/live2/gizli-anahtar` });
  const errors = [];
  pub.events.on("error", (e) => errors.push(e));
  const flv = fakeFlv({ frames: 40 });
  // Yayın açılmadan gelen veri bekletilir (başlık + son GOP).
  pub.writeFlv(flv.subarray(0, 50000));
  pub.start();
  await waitFor(() => pub.isPublishing());
  assert.equal(pub.isPublishing(), true);
  pub.writeFlv(flv.subarray(50000));
  const ses = await waitFor(() => (sink.sessions[0]?.messages.filter((m) => m.type === 9).length >= 20 ? sink.sessions[0] : null));
  assert.ok(ses, "görüntü iletileri ulaşmadı");
  assert.equal(ses.clientChunk, 4096);
  assert.equal(ses.connect.app, "live2");
  assert.equal(ses.connect.tcUrl, `rtmp://127.0.0.1:${port}/live2`);
  assert.equal(ses.publish, "gizli-anahtar");
  assert.deepEqual(ses.commands.slice(0, 5), ["connect", "releaseStream", "FCPublish", "createStream", "publish"]);
  const meta = ses.messages.find((m) => m.type === 18);
  assert.equal(amfDecode(meta.payload)[0], "@setDataFrame");
  assert.equal(amfDecode(meta.payload)[1], "onMetaData");
  // Akış bir yapılandırma + anahtar kareyle başlar (bekletilen veride eski GOP atıldı).
  const vids = ses.messages.filter((m) => m.type === 9);
  assert.equal(vids[0].head[1], 0); // AVC dizi başlığı
  assert.equal(vids[1].head[0], 0x17); // anahtar kare
  // Parça sayısı: 9000 baytlık kare 3 parça (4096'lık) — ffmpeg'in 128'lik 71 parçası değil.
  assert.ok(ses.chunkHeaders < ses.messages.length * 3 + 10, `parça sayısı ${ses.chunkHeaders}`);
  await waitFor(() => pub.stats().ackedBytes > 0);
  assert.ok(pub.stats().ackedBytes > 50000, "sunucu onayı sayılmadı");
  assert.ok(pub.stats().sentBytes >= pub.stats().ackedBytes);
  assert.deepEqual(errors, []);
  pub.end();
  await sink.close();
});

test("yayıncı: sunucu yayını reddederse (BadName) AUTH hatası; el sıkışmada kapanırsa HANDSHAKE", async () => {
  const sink = createRtmpSink({ reject: "NetStream.Publish.BadName" });
  const port = await sink.listen();
  const pub = createRtmpPublisher({ url: `rtmp://127.0.0.1:${port}/live2/yanlis` });
  const err = new Promise((r) => pub.events.once("error", r));
  pub.start();
  assert.equal((await err).code, "AUTH");
  await sink.close();
  const sink2 = createRtmpSink({ closeAfterHandshake: true });
  const port2 = await sink2.listen();
  const pub2 = createRtmpPublisher({ url: `rtmp://127.0.0.1:${port2}/live2/k` });
  const err2 = new Promise((r) => pub2.events.once("error", r));
  pub2.start();
  assert.equal((await err2).code, "HANDSHAKE");
  await sink2.close();
  // Kapalı port: CONNECTION_REFUSED.
  const srv = net.createServer();
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const dead = srv.address().port;
  await new Promise((r) => srv.close(r));
  const pub3 = createRtmpPublisher({ url: `rtmp://127.0.0.1:${dead}/live2/k` });
  const err3 = new Promise((r) => pub3.events.once("error", r));
  pub3.start();
  assert.equal((await err3).code, "CONNECTION_REFUSED");
});

/* ------------------------- gerçek ffmpeg ile (tümleşik) ------------------------- */

async function makeTs(ffmpegPath, file, { seconds = 6, kbps = 3000, size = "640x360" } = {}) {
  const r = await ff.run(ffmpegPath, [
    "-hide_banner", "-loglevel", "error", "-y",
    "-f", "lavfi", "-i", `testsrc2=s=${size}:r=30,noise=alls=10:allf=t`, "-f", "lavfi", "-i", "sine=f=440:r=48000",
    "-t", String(seconds), "-c:v", "libx264", "-preset", "ultrafast", "-b:v", `${kbps}k`, "-maxrate", `${kbps}k`, "-bufsize", `${kbps}k`,
    "-g", "60", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-ac", "2", "-f", "mpegts", file,
  ], { timeout: 60000 });
  assert.equal(r.code, 0, r.stderr);
}

async function feedRealtime(relay, data, seconds) {
  const steps = Math.ceil((seconds * 1000) / 100);
  const size = Math.ceil(data.length / steps);
  for (let i = 0; i < steps; i += 1) { relay.write(data.subarray(i * size, (i + 1) * size)); await sleep(100); }
}

test("gerçek ffmpeg: yerleşik RTMP istemcisi 128 baytlık parçalarla yazar; Node yolu 4096 — aynı akış, ~30 kat az parça", { timeout: 90000 }, async (t) => {
  const why = await skipReason();
  if (why) { t.skip(why); return; }
  const info = await getInfo();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "studio-rtmppub-"));
  try {
    const ts = path.join(root, "in.ts");
    await makeTs(info.path, ts, { seconds: 5 });
    const data = fs.readFileSync(ts);
    const results = {};
    for (const publisher of ["ffmpeg", "node"]) {
      const sink = createRtmpSink();
      const port = await sink.listen();
      const notes = [];
      const relay = createRelay({ ffmpegPath: info.path, primaryUrl: `rtmp://127.0.0.1:${port}/live2/anahtar`, spawnImpl: spawn, publisher, note: (m) => notes.push(m), backoffMs: [200] });
      await feedRealtime(relay, data, 5);
      await waitFor(() => (sink.sessions[0]?.messages.filter((m) => m.type === 9).length || 0) > 100, 8000);
      const st = relay.status();
      await relay.stop();
      const ses = sink.sessions[0];
      assert.ok(ses, `${publisher}: bağlantı yok (${notes.slice(-5).join(" | ")})`);
      const media = ses.messages.filter((m) => m.type === 8 || m.type === 9);
      const mediaBytes = media.reduce((n, m) => n + m.length, 0);
      results[publisher] = { chunk: ses.clientChunk, chunksPerKB: ses.chunkHeaders / (mediaBytes / 1024), video: media.filter((m) => m.type === 9).length, audio: media.filter((m) => m.type === 8).length, publisherStatus: st.publisher };
      assert.ok(results[publisher].video > 100, `${publisher}: ${results[publisher].video} kare`);
      assert.ok(results[publisher].audio > 100, `${publisher}: ses ${results[publisher].audio}`);
      await sink.close();
    }
    assert.equal(results.ffmpeg.chunk, 128);
    assert.equal(results.node.chunk, 4096);
    assert.equal(results.node.publisherStatus, "node");
    assert.ok(results.ffmpeg.chunksPerKB > 7, JSON.stringify(results)); // ~8 parça / KB
    assert.ok(results.node.chunksPerKB < 1, JSON.stringify(results)); // ~0,3 parça / KB
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("gerçek ffmpeg: Node yayıncısı el sıkışmada art arda düşerse ffmpeg RTMP yoluna geçer ve yayın sürer", { timeout: 90000 }, async (t) => {
  const why = await skipReason();
  if (why) { t.skip(why); return; }
  const info = await getInfo();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "studio-rtmppub-fb-"));
  const sink = createRtmpSink();
  const port = await sink.listen();
  try {
    const ts = path.join(root, "in.ts");
    await makeTs(info.path, ts, { seconds: 6 });
    const data = fs.readFileSync(ts);
    const notes = [];
    // Bozuk Node yayıncısı (el sıkışmada kapanan sunucuyu taklit eder): fallbackAfter (2) kez düşer.
    let made = 0;
    const brokenFactory = (o) => { made += 1; return createRtmpPublisher({ ...o, url: o.url.replace(`:${port}/`, `:${port + 0}/`), connect: () => { const s = new net.Socket(); setImmediate(() => s.destroy(new Error("handshake failed"))); return s; } }); };
    const relay = createRelay({ ffmpegPath: info.path, primaryUrl: `rtmp://127.0.0.1:${port}/live2/anahtar`, spawnImpl: spawn, publisher: "node", publisherFactory: brokenFactory, note: (m) => notes.push(m), backoffMs: [100] });
    await feedRealtime(relay, data, 6);
    await waitFor(() => relay.status().state === "up", 5000);
    const st = relay.status();
    await relay.stop();
    assert.equal(made, 2, notes.join(" | "));
    assert.equal(st.publisher, "ffmpeg");
    assert.ok(notes.some((n) => /ffmpeg RTMP yoluna geçiliyor/.test(n)), notes.join(" | "));
    assert.ok((sink.sessions.at(-1)?.messages.filter((m) => m.type === 9).length || 0) > 20, "yedek yolda görüntü ulaşmadı");
  } finally {
    await sink.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("gerçek ffmpeg: Node yayıncısı RTMPS (TLS) ile yayınlar", { timeout: 90000 }, async (t) => {
  const why = await skipReason();
  if (why) { t.skip(why); return; }
  const tls = require("node:tls");
  const info = await getInfo();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "studio-rtmps-"));
  let sink = null;
  try {
    const key = path.join(root, "key.pem");
    const cert = path.join(root, "cert.pem");
    const r = await ff.run("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", key, "-out", cert, "-days", "1", "-subj", "/CN=127.0.0.1", "-addext", "subjectAltName=IP:127.0.0.1"], { timeout: 20000 }).catch(() => ({ code: -1 }));
    if (r.code !== 0) { t.skip("openssl yok"); return; }
    sink = createRtmpSink({ server: (handle) => tls.createServer({ key: fs.readFileSync(key), cert: fs.readFileSync(cert) }, handle) });
    const port = await sink.listen();
    const ts = path.join(root, "in.ts");
    await makeTs(info.path, ts, { seconds: 4 });
    const relay = createRelay({ ffmpegPath: info.path, primaryUrl: `rtmps://127.0.0.1:${port}/live2/anahtar`, spawnImpl: spawn, publisher: "node", publisherOptions: { tlsOptions: { ca: fs.readFileSync(cert), rejectUnauthorized: true } } });
    await feedRealtime(relay, fs.readFileSync(ts), 4);
    await waitFor(() => (sink.sessions[0]?.messages.filter((m) => m.type === 9).length || 0) > 60, 5000);
    const st = relay.status();
    await relay.stop();
    assert.equal(st.publisher, "node");
    assert.equal(sink.sessions[0].clientChunk, 4096);
    assert.ok(sink.sessions[0].messages.filter((m) => m.type === 9).length > 60);
  } finally {
    await sink?.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
