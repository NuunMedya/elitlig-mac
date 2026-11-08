// Yayın Stüdyosu — TELEFON KAMERASI uçtan uca (Playwright / Chromium, sahte kamera):
//   gerçek HTTPS telefon sunucusu → telefon sayfası (getUserMedia sahte aygıt) → WSS sinyalleşme
//   → stüdyo sayfasında phonePeer.js (WebRTC yanıtlayıcı) → görüntü + ses geliyor;
//   "yayında" ışığı, uzaktan çözünürlük değişimi ve yeniden anlaşma (yeniden bağlanma) denetlenir.
// Playwright yoksa atlanır.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { createPhoneServer } = require("../studio/live/phone");

function loadPlaywright() {
  for (const p of ["playwright", "/opt/node-tools/node_modules/playwright", process.env.PLAYWRIGHT_PATH].filter(Boolean)) {
    try { return require(p); } catch { /* sonraki */ }
  }
  return null;
}
const PW = loadPlaywright();
const SRC = path.join(__dirname, "..", "..", "renderer", "src");
const SHOTS = process.env.STUDIO_SHOTS || null;
const until = async (fn, ms = 15000, step = 150) => {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) return v;
    await new Promise((r) => setTimeout(r, step));
  }
};

test("telefon eşleme sayfası: kamera açılır, stüdyoya WebRTC ile görüntü gelir, ışık ve uzaktan ayar çalışır", { skip: !PW && "Playwright yok", timeout: 120000 }, async () => {
  const { chromium } = PW;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "elitlig-phone-"));
  let studio = null;
  const pendingSignals = [];
  const phone = createPhoneServer({
    certFile: path.join(dir, "cert.json"), ports: [0], host: "127.0.0.1", addresses: () => ["127.0.0.1"],
    onSignal: (id, msg) => { if (studio) studio.evaluate((m) => window.__peer.handle(m), msg).catch(() => {}); else pendingSignals.push(msg); },
  });
  const pair = await phone.pair("src_tel", null, "Kale arkası telefonu");
  const server = http.createServer((req, res) => {
    const u = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (u === "/") { res.writeHead(200, { "Content-Type": "text/html" }); res.end("<!doctype html><body style='margin:0;background:#000'><video id=v muted playsinline autoplay style='width:640px;height:360px'></video></body>"); return; }
    const f = path.join(SRC, u);
    fs.readFile(f, (e, b) => { if (e || !f.startsWith(SRC)) { res.writeHead(404); res.end(); return; } res.writeHead(200, { "Content-Type": "text/javascript" }); res.end(b); });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const browser = await chromium.launch({ args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--autoplay-policy=no-user-gesture-required"] });
  try {
    // Stüdyo tarafı (arayüzdeki phonePeer.js ile aynı modül).
    const sctx = await browser.newContext();
    studio = await sctx.newPage();
    await studio.exposeFunction("__send", (msg) => phone.send("src_tel", msg));
    await studio.goto(`http://127.0.0.1:${server.address().port}/`);
    await studio.evaluate(async () => {
      const { createPhonePeer } = await import("/views/studio/live/phonePeer.js");
      window.__states = [];
      window.__peer = createPhonePeer({
        send: (m) => window.__send(m),
        onStream: (s) => { const v = document.getElementById("v"); v.srcObject = s; v.play().catch(() => {}); window.__stream = s; },
        onState: (st, info) => window.__states.push([st, JSON.parse(JSON.stringify(info || {}))]),
      });
    });
    for (const m of pendingSignals.splice(0)) await studio.evaluate((x) => window.__peer.handle(x), m);

    // Telefon tarafı: kendi imzalı yerel sertifika (gerçek telefonda tek seferlik "devam et").
    const pctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, permissions: ["camera", "microphone"], userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1" });
    const ph = await pctx.newPage();
    const errors = [];
    ph.on("pageerror", (e) => errors.push(e.message));
    await ph.goto(pair.url);
    if (SHOTS) await ph.screenshot({ path: path.join(SHOTS, "src-phone-page-ready.png") });
    await ph.click("#go");
    const connected = await until(() => ph.evaluate(() => window.__phone.state().pc === "connected"));
    assert.ok(connected, "telefon bağlandı");
    const frames = await until(() => studio.evaluate(() => { const v = document.getElementById("v"); return v.videoWidth > 0 && v.currentTime > 0.3 ? { w: v.videoWidth, h: v.videoHeight, audio: window.__stream.getAudioTracks().length } : null; }));
    assert.ok(frames, "stüdyoda telefon görüntüsü oynuyor");
    assert.ok(frames.w >= 320, `genişlik ${frames.w}`);
    assert.equal(frames.audio, 1, "mikrofon sesi de geliyor");
    assert.equal(await ph.title(), "Kale arkası telefonu · Elitlig");
    const states = await studio.evaluate(() => window.__states.map((s) => s[0]));
    assert.ok(states.includes("live"));

    // "yayında" ışığı
    await studio.evaluate(() => window.__peer.tally("program"));
    assert.ok(await until(() => ph.evaluate(() => document.getElementById("stage").classList.contains("is-program"))), "telefonda kırmızı çerçeve");
    if (SHOTS) {
      await ph.screenshot({ path: path.join(SHOTS, "src-phone-page-live.png") });
      await studio.screenshot({ path: path.join(SHOTS, "src-phone-studio-receive.png") });
    }
    // uzaktan çözünürlük (yeniden anlaşmadan, replaceTrack)
    await studio.evaluate(() => window.__peer.config({ res: 480 }));
    assert.ok(await until(() => ph.evaluate(() => document.getElementById("res").value === "480")));
    // yeniden anlaşma (kopan bağlantı yolu): telefon yeni teklif yollar, stüdyo yeniden yanıtlar
    const before = await studio.evaluate(() => window.__states.filter((s) => s[0] === "live").length);
    await studio.evaluate(() => window.__peer.renegotiate());
    assert.ok(await until(() => studio.evaluate((n) => window.__states.filter((s) => s[0] === "live").length > n, before)), "yeniden bağlandı");
    assert.ok(await until(() => studio.evaluate(() => document.getElementById("v").videoWidth > 0)));
    assert.deepEqual(errors, []);
    // durdur: stüdyoya "ayrıldı"
    await ph.click("#go");
    assert.ok(await until(() => studio.evaluate(() => window.__states.some((s) => s[0] === "standby"))), "telefon ayrılınca bekleme");
  } finally {
    await browser.close();
    server.close();
    phone.stop();
  }
});
