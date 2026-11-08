// Yayın Stüdyosu — AĞ GİRİŞLERİ uçtan uca (gerçek ffmpeg, başsız):
//   RTMP dinleyici (doğru / yanlış anahtar) · SRT dinleyici · RTSP çekme (yerel RTSP sunucusu)
//   · HLS çekme (yerel HTTP) → fMP4 parçaları → (Playwright varsa) Chromium'da MSE ile oynatma.
// ffmpeg yoksa testler atlanır.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");
const http = require("node:http");
const dgram = require("node:dgram");
const { spawn, spawnSync } = require("node:child_process");
const { createFeeds } = require("../studio/live/feeds");

const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";
const probe = spawnSync(FFMPEG, ["-hide_banner", "-protocols"], { encoding: "utf8" });
const HAVE = probe.status === 0;
const HAVE_SRT = HAVE && /^\s*srt\s*$/m.test(probe.stdout.split(/Output:/)[0]);
const SRC = path.join(__dirname, "..", "..", "renderer", "src");
const { pathToFileURL } = require("node:url");
const mp4 = import(pathToFileURL(path.join(SRC, "lib", "studio", "mp4.js")).href);
mp4.catch(() => {}); // ffmpeg yokken testler atlanır; içe aktarma hatası yakalanmamış ret olmasın

function loadPlaywright() {
  for (const p of ["playwright", "/opt/node-tools/node_modules/playwright", process.env.PLAYWRIGHT_PATH].filter(Boolean)) {
    try { return require(p); } catch { /* sonraki */ }
  }
  return null;
}

const freePort = () => new Promise((resolve) => { const s = net.createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => resolve(p)); }); });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "elitlig-feed-"));

/** Test kaynağı: renk çubukları + ton. */
function publish(args, seconds = 4) {
  return spawn(FFMPEG, ["-hide_banner", "-loglevel", "error", "-re", "-f", "lavfi", "-i", "testsrc2=size=320x180:rate=30", "-f", "lavfi", "-i", "sine=f=440:sample_rate=44100",
    "-c:v", "libx264", "-preset", "ultrafast", "-tune", "zerolatency", "-g", "30", "-pix_fmt", "yuv420p", "-c:a", "aac", "-t", String(seconds), ...args], { stdio: "ignore" });
}

const ALL = new Set(); // test bitince (başarısız da olsa) tüm akışlar kapanır: süreç asılı kalmaz
test.afterEach(() => { for (const c of ALL) { try { c.feeds.dispose(); } catch { /* yoksay */ } } ALL.clear(); });

function collector() {
  const c = { chunks: [], statuses: [], firstAt: null, bytes: 0, gens: new Set(), onChunk: null };
  c.feeds = createFeeds({
    getFfmpeg: async () => ({ available: true, path: FFMPEG }),
    bind: "127.0.0.1",
    onData: (id, { gen, data }) => { if (!c.firstAt) c.firstAt = Date.now(); c.chunks.push({ gen, data, at: Date.now() }); c.bytes += data.length; c.gens.add(gen); c.onChunk?.(gen, data); },
    onStatus: (id, st) => c.statuses.push({ ...st, at: Date.now() }),
  });
  ALL.add(c);
  c.buffer = (gen = [...c.gens][0]) => Buffer.concat(c.chunks.filter((x) => x.gen === gen).map((x) => x.data));
  return c;
}

async function checkFmp4(buf, { width = 320, height = 180, audio = true } = {}) {
  const { parseInit, boxes } = await mp4;
  const init = parseInit(new Uint8Array(buf));
  assert.equal(init.complete, true, "başlangıç parçası (ftyp + moov)");
  assert.match(init.codecs[0], /^avc1\./);
  if (audio) assert.equal(init.codecs[1], "mp4a.40.2");
  assert.deepEqual([init.video.width, init.video.height], [width, height]);
  const moofs = boxes(new Uint8Array(buf)).filter((b) => b.type === "moof").length;
  assert.ok(moofs >= 10, `parçalı (moof sayısı ${moofs})`);
  // Gerçekten çözülebiliyor mu: ffmpeg tüm kareleri çözer.
  const f = path.join(tmp(), "out.mp4");
  fs.writeFileSync(f, buf);
  const dec = spawnSync(FFMPEG, ["-v", "error", "-i", f, "-f", "null", "-"], { encoding: "utf8" });
  assert.equal(dec.status, 0, dec.stderr);
  return init;
}

test("RTMP girişi: doğru anahtarla fMP4 akar, yanlış anahtar reddedilir, yayıncı ayrılınca yeniden dinler", { skip: !HAVE && "ffmpeg yok", timeout: 60000 }, async () => {
  const port = await freePort();
  const c = collector();
  const r = c.feeds.start("drone", { mode: "listen", protocol: "rtmp", port, key: "dogruAnahtar" });
  assert.equal(r.ok, true);
  await wait(700);
  // yanlış anahtar
  const bad = publish(["-f", "flv", `rtmp://127.0.0.1:${port}/live/yanlis`], 2);
  await new Promise((res) => bad.on("exit", res));
  await wait(1500);
  assert.equal(c.bytes, 0, "yanlış anahtarla görüntü alınmamalı");
  assert.ok(c.statuses.some((s) => /Yanlış yayın anahtarı/.test(s.message || "")));
  // doğru anahtar
  const t0 = Date.now();
  const pub = publish(["-f", "flv", `rtmp://127.0.0.1:${port}/live/dogruAnahtar`], 4);
  await new Promise((res) => pub.on("exit", res));
  await wait(1200);
  assert.ok(c.firstAt && c.firstAt - t0 < 9000, `ilk veri ${c.firstAt - t0} ms`);
  assert.ok(c.statuses.some((s) => s.state === "live" && s.video?.codec === "h264"));
  assert.ok(c.statuses.some((s) => s.state === "live" && s.kbps > 0), "bit hızı bildirilir");
  await checkFmp4(c.buffer());
  // yayıncı ayrıldı: yeniden "bekleniyor"
  assert.equal(c.statuses[c.statuses.length - 1].state, "waiting");
  c.feeds.dispose();
});

test("SRT girişi (dinleyici, şifreli)", { skip: (!HAVE && "ffmpeg yok") || (!HAVE_SRT && "ffmpeg SRT desteklemiyor"), timeout: 60000 }, async () => {
  const port = await freePort();
  const c = collector();
  assert.equal(c.feeds.start("obs", { mode: "listen", protocol: "srt", port, key: "gizli-sifre-42", latencyMs: 120 }).ok, true);
  await wait(700);
  const pub = publish(["-f", "mpegts", `srt://127.0.0.1:${port}?mode=caller&latency=120000&passphrase=gizli-sifre-42&pbkeylen=16`], 4);
  await new Promise((res) => pub.on("exit", res));
  await wait(1200);
  await checkFmp4(c.buffer());
  c.feeds.dispose();
});

/**
 * En küçük RTSP sunucusu: ffmpeg RTP (UDP) üretir; sunucu SDP'yi DESCRIBE'da verir,
 * PLAY'den sonra RTP paketlerini TCP içinde ($ kanal uzunluk) iletir.
 */
async function startRtspServer() {
  const rtpPort = await freePort();
  const dir = tmp();
  const sdpFile = path.join(dir, "s.sdp");
  const udp = dgram.createSocket("udp4");
  await new Promise((r) => udp.bind(rtpPort, "127.0.0.1", r));
  const gen = spawn(FFMPEG, ["-hide_banner", "-loglevel", "error", "-re", "-f", "lavfi", "-i", "testsrc2=size=320x180:rate=30", "-t", "20", "-c:v", "libx264", "-preset", "ultrafast", "-tune", "zerolatency", "-g", "30", "-pix_fmt", "yuv420p", "-bsf:v", "dump_extra", "-f", "rtp", "-payload_type", "96", "-sdp_file", sdpFile, `rtp://127.0.0.1:${rtpPort}`], { stdio: "ignore" });
  for (let i = 0; i < 50 && !fs.existsSync(sdpFile); i += 1) await wait(100);
  const sdp = fs.readFileSync(sdpFile, "utf8").replace(/c=IN IP4 \S+/g, "c=IN IP4 0.0.0.0").replace(/m=video \d+/, "m=video 0") + "a=control:trackID=0\r\n";
  const players = new Set();
  udp.on("message", (pkt) => {
    const head = Buffer.from([0x24, 0, pkt.length >> 8, pkt.length & 255]);
    for (const s of players) if (!s.destroyed) s.write(Buffer.concat([head, pkt]));
  });
  const server = net.createServer((sock) => {
    let buf = "";
    sock.on("data", (d) => {
      if (players.has(sock)) return; // oynatıcıdan gelen RTCP yok sayılır
      buf += d.toString("latin1");
      let i;
      while ((i = buf.indexOf("\r\n\r\n")) >= 0) {
        const req = buf.slice(0, i);
        buf = buf.slice(i + 4);
        const [line] = req.split("\r\n");
        const method = line.split(" ")[0];
        const cseq = (/CSeq:\s*(\d+)/i.exec(req) || [])[1] || "0";
        const ok = (extra = "", body = "") => sock.write(`RTSP/1.0 200 OK\r\nCSeq: ${cseq}\r\n${extra}${body ? `Content-Length: ${Buffer.byteLength(body)}\r\n` : ""}\r\n${body}`);
        if (method === "OPTIONS") ok("Public: DESCRIBE, SETUP, PLAY, TEARDOWN\r\n");
        else if (method === "DESCRIBE") ok("Content-Type: application/sdp\r\n", sdp);
        else if (method === "SETUP") ok("Transport: RTP/AVP/TCP;unicast;interleaved=0-1\r\nSession: 12345678\r\n");
        else if (method === "PLAY") { ok("Session: 12345678\r\n"); players.add(sock); }
        else ok();
      }
    });
    sock.on("close", () => players.delete(sock));
    sock.on("error", () => {});
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return { url: `rtsp://127.0.0.1:${server.address().port}/test`, close() { gen.kill("SIGKILL"); udp.close(); server.close(); for (const s of players) s.destroy(); } };
}

test("RTSP çekme (IP kamera benzetimi, TCP üzerinden)", { skip: !HAVE && "ffmpeg yok", timeout: 60000 }, async () => {
  const rtsp = await startRtspServer();
  const c = collector();
  assert.equal(c.feeds.start("ipcam", { mode: "pull", url: rtsp.url, rtspTransport: "tcp" }).ok, true);
  for (let i = 0; i < 80 && c.bytes < 60000; i += 1) await wait(100);
  await wait(1500);
  c.feeds.stop("ipcam");
  rtsp.close();
  await checkFmp4(c.buffer(), { audio: false });
  assert.ok(c.statuses.some((s) => s.state === "live"));
  c.feeds.dispose();
});

test("HLS çekme (yerel HTTP sunucusundaki .m3u8)", { skip: !HAVE && "ffmpeg yok", timeout: 60000 }, async () => {
  const dir = tmp();
  const gen = spawn(FFMPEG, ["-hide_banner", "-loglevel", "error", "-re", "-f", "lavfi", "-i", "testsrc2=size=320x180:rate=30", "-f", "lavfi", "-i", "sine=f=330", "-t", "20", "-c:v", "libx264", "-preset", "ultrafast", "-g", "30", "-pix_fmt", "yuv420p", "-c:a", "aac", "-f", "hls", "-hls_time", "1", "-hls_list_size", "6", "-hls_flags", "delete_segments", path.join(dir, "live.m3u8")], { stdio: "ignore" });
  const server = http.createServer((req, res) => {
    const f = path.join(dir, path.basename(new URL(req.url, "http://x").pathname));
    fs.readFile(f, (e, b) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { "Content-Type": f.endsWith(".m3u8") ? "application/vnd.apple.mpegurl" : "video/mp2t" }); res.end(b); });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  for (let i = 0; i < 60 && !fs.existsSync(path.join(dir, "live.m3u8")); i += 1) await wait(100);
  await wait(1500);
  const c = collector();
  assert.equal(c.feeds.start("hls", { mode: "pull", url: `http://127.0.0.1:${server.address().port}/live.m3u8` }).ok, true);
  for (let i = 0; i < 100 && c.bytes < 80000; i += 1) await wait(100);
  await wait(1500);
  c.feeds.dispose();
  gen.kill("SIGKILL");
  server.close();
  await checkFmp4(c.buffer());
});

test("RTMP girişi → arayüz oynatıcısı (feedPlayer, Chromium MSE): görüntü canlı ve gecikme düşük", { skip: (!HAVE && "ffmpeg yok") || (!loadPlaywright() && "Playwright yok"), timeout: 90000 }, async () => {
  const { chromium } = loadPlaywright();
  // renderer/src'yi sunan statik sunucu (ES modülleri olduğu gibi).
  const server = http.createServer((req, res) => {
    const u = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (u === "/") { res.writeHead(200, { "Content-Type": "text/html" }); res.end("<!doctype html><video id=v muted playsinline autoplay></video>"); return; }
    const f = path.join(SRC, u);
    if (!f.startsWith(SRC)) { res.writeHead(403); res.end(); return; }
    fs.readFile(f, (e, b) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { "Content-Type": "text/javascript" }); res.end(b); });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
  try {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.evaluate(async () => {
      const { createFeedPlayer } = await import("/views/studio/live/feedPlayer.js");
      window.__init = null;
      window.__player = createFeedPlayer(document.getElementById("v"), { onInit: (i) => { window.__init = i; }, onUnsupported: (i) => { window.__unsupported = i; } });
    });
    const port = await freePort();
    const c = collector();
    let chain = Promise.resolve();
    c.onChunk = (gen, data) => { const b64 = data.toString("base64"); chain = chain.then(() => page.evaluate(([g, s]) => window.__player.push(g, Uint8Array.from(atob(s), (ch) => ch.charCodeAt(0))), [gen, b64])).catch(() => {}); };
    c.feeds.start("drone", { mode: "listen", protocol: "rtmp", port, key: "k" });
    await wait(700);
    const pub = publish(["-f", "flv", `rtmp://127.0.0.1:${port}/live/k`], 7);
    await wait(5000);
    await chain;
    const st = await page.evaluate(() => { const v = document.getElementById("v"); return { w: v.videoWidth, h: v.videoHeight, t: v.currentTime, ready: v.readyState, stats: window.__player.stats(), init: window.__init, uns: window.__unsupported || null }; });
    await new Promise((res) => pub.on("exit", res));
    c.feeds.dispose();
    assert.equal(st.uns, null, "codec tarayıcıda desteklenmeli");
    assert.equal(st.init.codecs[0].slice(0, 4), "avc1");
    assert.deepEqual([st.w, st.h], [320, 180]);
    assert.ok(st.ready >= 2 && st.t > 1, `oynuyor (t=${st.t})`);
    assert.ok(st.stats.latency != null && st.stats.latency < 2, `canlı uca yakın (gecikme ${st.stats.latency} sn)`);
  } finally {
    await browser.close();
    server.close();
  }
});
