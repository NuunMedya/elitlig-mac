// Yayın Stüdyosu — canlı giriş kaynakları (ana süreç): WebSocket ucu, yerel sertifika,
// telefon sunucusu (gerçek HTTPS + WSS sinyalleşme), akış komutları, yayın gecikmesi hattı.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const tls = require("node:tls");
const http = require("node:http");
const https = require("node:https");
const crypto = require("node:crypto");
const { acceptKey, encodeFrame, createFrameParser, acceptUpgrade } = require("../studio/live/ws");
const { loadOrCreate, createCertificates } = require("../studio/live/cert");
const { createPhoneServer, lanAddresses, addIpCandidates, ipCandidate, deviceOf } = require("../studio/live/phone");
const { buildFeedArgs, normalizeFeedSpec, classifyUrl, listenUrl, publishUrls, parseInputVideo, createFeeds } = require("../studio/live/feeds");
const { normalizeWebSpec } = require("../studio/live/web");
const { createDelayLine } = require("../studio/relay");

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "elitlig-live-"));

/** İstemci (maskeli) çerçeve. */
function clientFrame(opcode, text) {
  const data = Buffer.from(text);
  const mask = crypto.randomBytes(4);
  const head = data.length < 126 ? Buffer.from([0x80 | opcode, 0x80 | data.length]) : Buffer.concat([Buffer.from([0x80 | opcode, 0x80 | 126]), Buffer.from([data.length >> 8, data.length & 255])]);
  const body = Buffer.from(data.map((b, i) => b ^ mask[i & 3]));
  return Buffer.concat([head, mask, body]);
}

/** Basit WSS istemcisi (sertifika doğrulamalı). */
function wsConnect({ host = "127.0.0.1", port, pathName, ca }) {
  return new Promise((resolve, reject) => {
    const sock = tls.connect({ host, port, ca, servername: undefined, checkServerIdentity: (h, cert) => tls.checkServerIdentity("127.0.0.1", cert) }, () => {
      const key = crypto.randomBytes(16).toString("base64");
      sock.write(`GET ${pathName} HTTP/1.1\r\nHost: ${host}:${port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`);
      let buf = Buffer.alloc(0);
      const messages = [];
      const waiters = [];
      const parser = createFrameParser({ requireMask: false });
      let upgraded = false;
      sock.on("data", (d) => {
        if (!upgraded) {
          buf = Buffer.concat([buf, d]);
          const i = buf.indexOf("\r\n\r\n");
          if (i < 0) return;
          const headText = buf.subarray(0, i).toString();
          if (!/ 101 /.test(headText) || !headText.includes(acceptKey(key))) { reject(new Error(headText)); return; }
          upgraded = true;
          d = buf.subarray(i + 4);
          resolve(api);
          if (!d.length) return;
        }
        for (const f of parser.feed(d)) {
          if (f.opcode !== 1) continue;
          const m = JSON.parse(f.payload.toString());
          const w = waiters.findIndex((x) => x.pred(m));
          if (w >= 0) waiters.splice(w, 1)[0].resolve(m); else messages.push(m);
        }
      });
      const api = {
        send: (obj) => sock.write(clientFrame(1, JSON.stringify(obj))),
        next: (pred = () => true, ms = 3000) => {
          const i = messages.findIndex(pred);
          if (i >= 0) return Promise.resolve(messages.splice(i, 1)[0]);
          return new Promise((res, rej) => { const t = setTimeout(() => rej(new Error("ileti gelmedi")), ms); waiters.push({ pred, resolve: (m) => { clearTimeout(t); res(m); } }); });
        },
        close: () => sock.destroy(),
        sock,
      };
    });
    sock.on("error", reject);
  });
}

test("WebSocket: el sıkışma anahtarı (RFC 6455 örneği) ve çerçeveler", () => {
  assert.equal(acceptKey("dGhlIHNhbXBsZSBub25jZQ=="), "s3pPLMBiTxaQ9kYGzzhZRbK+xOo=");
  const p = createFrameParser();
  const big = "x".repeat(70000);
  const frames = p.feed(Buffer.concat([clientFrame(1, "merhaba"), clientFrame(1, "ğüş")]));
  assert.deepEqual(frames.map((f) => f.payload.toString()), ["merhaba", "ğüş"]);
  const enc = encodeFrame(1, big);
  assert.equal(enc[1], 127);
  const p2 = createFrameParser({ requireMask: false, maxPayload: 1 << 20 });
  assert.equal(p2.feed(enc.subarray(0, 100)).length, 0);
  assert.equal(p2.feed(enc.subarray(100))[0].payload.length, 70000);
  assert.throws(() => createFrameParser().feed(encodeFrame(1, "maskesiz")), /maskesiz/);
});

test("WebSocket: http sunucusunda ileti alışverişi ve kapanış", async () => {
  const srv = http.createServer();
  const got = [];
  let closed = null;
  srv.on("upgrade", (req, socket, head) => {
    const c = acceptUpgrade(req, socket, head);
    c.on("message", (m) => { got.push(m); c.send(`yanıt:${m}`); });
    c.on("close", (e) => { closed = e; });
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const net = require("node:net");
  const sock = net.connect(srv.address().port, "127.0.0.1");
  await new Promise((r) => sock.on("connect", r));
  sock.write("GET /ws HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n");
  const reply = await new Promise((resolve) => {
    let buf = Buffer.alloc(0);
    sock.on("data", (d) => { buf = Buffer.concat([buf, d]); const i = buf.indexOf("\r\n\r\n"); if (i > 0 && buf.length > i + 4 + 2) resolve(buf); });
    sock.write(clientFrame(1, "selam"));
  });
  assert.match(reply.toString(), /101 Switching Protocols/);
  assert.ok(reply.toString().includes("yanıt:selam"));
  sock.write(clientFrame(8, ""));
  await new Promise((r) => setTimeout(r, 100));
  assert.deepEqual(got, ["selam"]);
  assert.ok(closed);
  sock.destroy();
  srv.close();
});

test("yerel sertifika: kök imzalı sunucu sertifikası, IP değişince yalnız sunucu yenilenir", () => {
  const dir = tmp();
  const file = path.join(dir, "cert.json");
  const a = loadOrCreate(file, ["localhost", "127.0.0.1", "192.168.1.20"]);
  assert.equal(a.renewed, true);
  const leaf = new crypto.X509Certificate(a.cert);
  const ca = new crypto.X509Certificate(a.caCertPem);
  assert.ok(leaf.verify(ca.publicKey));
  assert.ok(ca.ca);
  assert.ok(!leaf.ca);
  assert.equal(leaf.checkIP("192.168.1.20"), "192.168.1.20");
  assert.equal(leaf.checkHost("localhost"), "localhost");
  const b = loadOrCreate(file, ["localhost", "127.0.0.1", "192.168.1.20"]);
  assert.equal(b.renewed, false);
  assert.equal(b.fingerprint, a.fingerprint);
  const c = loadOrCreate(file, ["localhost", "127.0.0.1", "10.0.0.7"]);
  assert.equal(c.renewed, true);
  assert.equal(c.fingerprint, a.fingerprint, "kök aynı kalmalı (telefondaki güven bozulmasın)");
  assert.equal(new crypto.X509Certificate(c.cert).checkIP("10.0.0.7"), "10.0.0.7");
  assert.ok(createCertificates(["localhost"]).caCertPem.startsWith("-----BEGIN CERTIFICATE-----"));
});

test("aday kopyaları (.local → IP) ve cihaz adı", () => {
  const sdp = "v=0\r\na=candidate:1 1 udp 2122260223 4f2a.local 54400 typ host generation 0\r\na=candidate:2 1 udp 2122260223 192.168.1.5 54401 typ host\r\n";
  const out = addIpCandidates(sdp, "192.168.1.30");
  assert.match(out, /a=candidate:19 1 udp 2122260222 192\.168\.1\.30 54400 typ host generation 0/);
  assert.equal(out.split("a=candidate").length, 4);
  assert.equal(addIpCandidates("a=candidate:1 1 udp 1 10.0.0.1 5 typ host", "1.1.1.1"), "a=candidate:1 1 udp 1 10.0.0.1 5 typ host");
  assert.equal(ipCandidate("candidate:7 1 udp 100 x.local 9 typ host", "10.0.0.2"), "candidate:79 1 udp 99 10.0.0.2 9 typ host");
  assert.equal(deviceOf("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)"), "iPhone");
  assert.equal(deviceOf("Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit"), "SM-S918B");
  const ips = lanAddresses({ lo: [{ family: "IPv4", address: "127.0.0.1", internal: true }], docker0: [{ family: "IPv4", address: "172.17.0.1", internal: false }], en0: [{ family: 4, address: "192.168.1.9", internal: false }, { family: "IPv6", address: "fe80::1", internal: false }], x: [{ family: "IPv4", address: "169.254.3.3", internal: false }] });
  assert.deepEqual(ips, ["192.168.1.9", "172.17.0.1"]);
});

test("telefon sunucusu: HTTPS sayfa, kök sertifika, WSS eşleme, sinyal iletimi, devralma", async () => {
  const dir = tmp();
  const signals = [];
  const presence = [];
  const phone = createPhoneServer({ certFile: path.join(dir, "c.json"), ports: [0], host: "127.0.0.1", addresses: () => ["127.0.0.1"], onSignal: (id, m) => signals.push([id, m]), onPresence: (id, p) => presence.push([id, p]) });
  const pair = await phone.pair("src_tel1", null, "Tribün telefonu");
  assert.match(pair.token, /^[a-f0-9]{12}$/);
  assert.equal(pair.url, `https://127.0.0.1:${pair.port}/p/${pair.token}`);
  const again = await phone.pair("src_tel1", pair.token);
  assert.equal(again.token, pair.token, "kayıtlı kod korunur");
  const other = await phone.pair("src_tel2", pair.token);
  assert.notEqual(other.token, pair.token, "başka kaynak aynı kodu alamaz");
  const ca = JSON.parse(fs.readFileSync(path.join(dir, "c.json"), "utf8")).caCertPem;
  const get = (p) => new Promise((resolve, reject) => https.get({ host: "127.0.0.1", port: pair.port, path: p, ca }, (res) => { const parts = []; res.on("data", (d) => parts.push(d)); res.on("end", () => resolve({ res, body: Buffer.concat(parts) })); }).on("error", reject));
  const page = await get(`/p/${pair.token}`);
  assert.equal(page.res.statusCode, 200);
  assert.match(page.res.headers["content-security-policy"], /connect-src 'self' wss:/);
  assert.match(page.body.toString(), /Kamerayı aç/);
  const crt = await get("/ca.crt");
  assert.equal(crt.res.headers["content-type"], "application/x-x509-ca-cert");
  assert.ok(new crypto.X509Certificate(crt.body).ca);
  assert.equal((await get("/yok")).res.statusCode, 404);

  // bilinmeyen kod
  const bad = await wsConnect({ port: pair.port, pathName: "/ws/zzzzzzzzzzzz", ca });
  assert.equal((await bad.next()).t, "unknown");
  bad.close();

  const ws = await wsConnect({ port: pair.port, pathName: `/ws/${pair.token}`, ca });
  assert.deepEqual(await ws.next((m) => m.t === "name"), { t: "name", name: "Tribün telefonu" });
  ws.send({ t: "hello", ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)" });
  ws.send({ t: "offer", sdp: "v=0\r\na=candidate:1 1 udp 5 abc.local 4000 typ host" });
  await new Promise((r) => setTimeout(r, 150));
  const offer = signals.find(([, m]) => m.t === "offer");
  assert.equal(offer[0], "src_tel1");
  assert.match(offer[1].sdp, /127\.0\.0\.1 4000 typ host/, "telefonun mDNS adayına gerçek IP eklenir");
  assert.ok(presence.some(([id, p]) => id === "src_tel1" && p.connected && p.device === "iPhone"));
  assert.ok(phone.connected("src_tel1"));
  assert.equal(phone.send("src_tel1", { t: "answer", sdp: "a=candidate:2 1 udp 9 def.local 5000 typ host" }), true);
  const ans = await ws.next((m) => m.t === "answer");
  assert.match(ans.sdp, /127\.0\.0\.1 5000 typ host/);
  phone.send("src_tel1", { t: "tally", state: "program" });
  assert.deepEqual(await ws.next((m) => m.t === "tally"), { t: "tally", state: "program" });

  // ikinci telefon aynı koda: ilki "replaced"
  const ws2 = await wsConnect({ port: pair.port, pathName: `/ws/${pair.token}`, ca });
  assert.equal((await ws.next((m) => m.t === "replaced")).t, "replaced");
  ws2.close();
  await new Promise((r) => setTimeout(r, 150));
  assert.ok(signals.some(([, m]) => m.t === "bye"));
  assert.equal(phone.unpair("src_tel1"), true);
  assert.equal(phone.send("src_tel1", { t: "tally" }), false);
  ws.close();
  phone.stop();
});

test("akış ayarları: doğrulama, adresler, ffmpeg komutu", () => {
  assert.equal(classifyUrl("rtsp://a:b@1.2.3.4/x"), "rtsp");
  assert.equal(classifyUrl("https://a/b/index.m3u8?t=1"), "hls");
  assert.equal(classifyUrl("http://cam/video.cgi"), "mjpeg");
  assert.equal(classifyUrl("file:///etc/passwd"), null);
  assert.ok(normalizeFeedSpec({ mode: "pull", url: "file:///x" }).error);
  assert.ok(normalizeFeedSpec({ mode: "listen", protocol: "rtmp", key: "bad key!" }).error);
  assert.ok(normalizeFeedSpec({ mode: "listen", protocol: "srt", key: "kisa" }).error);
  const rt = normalizeFeedSpec({ mode: "listen", protocol: "rtmp", port: 80, key: "drone1" });
  assert.equal(rt.port, 1024);
  assert.equal(listenUrl(rt), "rtmp://0.0.0.0:1024/live/drone1");
  const srt = normalizeFeedSpec({ mode: "listen", protocol: "srt", key: "gizli-sifre-123", latencyMs: 150 });
  assert.equal(srt.port, 9000);
  assert.equal(listenUrl(srt, "127.0.0.1"), "srt://127.0.0.1:9000?mode=listener&latency=150000&transtype=live&passphrase=gizli-sifre-123&pbkeylen=16");
  const urls = publishUrls(rt, ["192.168.1.20", "10.0.0.2"]);
  assert.deepEqual(urls[0], { host: "192.168.1.20", url: "rtmp://192.168.1.20:1024/live/drone1", server: "rtmp://192.168.1.20:1024/live", key: "drone1" });
  assert.match(publishUrls(srt, ["10.0.0.2"])[0].url, /^srt:\/\/10\.0\.0\.2:9000\?mode=caller&latency=150000&passphrase=/);
  const a = buildFeedArgs(rt);
  assert.ok(a.includes("-listen"));
  assert.equal(a[a.indexOf("-c:v") + 1], "copy");
  assert.equal(a[a.length - 1], "pipe:1");
  assert.ok(a.join(" ").includes("empty_moov+default_base_moof+frag_keyframe"));
  const t = buildFeedArgs(normalizeFeedSpec({ mode: "pull", url: "rtsp://x/y", rtspTransport: "udp" }), { transcode: true });
  assert.equal(t[t.indexOf("-rtsp_transport") + 1], "udp");
  assert.equal(t[t.indexOf("-c:v") + 1], "libx264");
  assert.ok(buildFeedArgs(normalizeFeedSpec({ mode: "pull", url: "srt://h:1" })).includes("srt://h:1?latency=200000"));
  assert.deepEqual(parseInputVideo("  Stream #0:0: Video: hevc (Main), yuv420p(tv), 3840x2160, 29.97 fps, 30 tbr"), { codec: "hevc", width: 3840, height: 2160, fps: 29.97 });
  assert.equal(parseInputVideo("Stream #0:1: Audio: aac"), null);
  assert.ok(normalizeWebSpec({ url: "javascript:alert(1)" }).error);
  assert.deepEqual(normalizeWebSpec({ url: "https://elitlig.com/skor", width: 99999, fps: 0 }), { url: "https://elitlig.com/skor", width: 3840, height: 1080, fps: 1, css: "", transparent: true, zoom: 1 });
});

test("akış yöneticisi: aynı portu iki kaynak dinleyemez; ffmpeg yoksa hata", async () => {
  const statuses = [];
  const feeds = createFeeds({ getFfmpeg: async () => ({ available: false }), onStatus: (id, s) => statuses.push([id, s.state, s.message]) });
  assert.equal(feeds.start("a", { mode: "listen", protocol: "rtmp", port: 19999, key: "k" }).ok, true);
  const r = feeds.start("b", { mode: "listen", protocol: "rtmp", port: 19999, key: "k" });
  assert.equal(r.ok, false);
  assert.equal(r.error.code, "PORT_TAKEN");
  await new Promise((res) => setTimeout(res, 20));
  assert.ok(statuses.some(([id, st, m]) => id === "a" && st === "error" && /ffmpeg/.test(m)));
  assert.equal(feeds.stop("a"), true);
  feeds.dispose();
});

test("yayın gecikmesi hattı: süre dolunca sırayla (işaretler dahil)", () => {
  let t = 0;
  const pending = [];
  const timers = { setTimeout: (fn) => { pending.push(fn); return pending.length; }, clearTimeout: () => {} };
  const out = [];
  const line = createDelayLine({ delayMs: 1000, now: () => t, timers, onData: (d) => out.push(d.toString()), onMarker: () => out.push("|") });
  assert.equal(line.active, true);
  line.mark();
  line.push(Buffer.from("a"));
  t = 400; line.push(Buffer.from("b"));
  const run = () => pending.splice(0).forEach((fn) => fn());
  t = 900; run();
  assert.deepEqual(out, []);
  assert.equal(line.pendingBytes(), 2);
  t = 1000; run();
  assert.deepEqual(out, ["|", "a"]);
  t = 1400; run();
  assert.deepEqual(out, ["|", "a", "b"]);
  assert.equal(line.pendingBytes(), 0);
  line.stop();
  assert.equal(line.pendingBytes(), 0);
  assert.equal(createDelayLine({ delayMs: 0, onData() {}, onMarker() {} }).active, false);
});
