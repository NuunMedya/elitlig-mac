// Tarayıcı — GERÇEK Electron uygulamasıyla uçtan uca (Playwright _electron + Xvfb).
//
// Sınananlar (yerel test sunucusunda):
//   - İki profil: aynı sitede iki ayrı çerez (oturum) — yan yana açık.
//   - target=_blank yeni sekme olur; sayfanın file:// gezinmesi engellenir.
//   - Medya paneli: srcset'ten en büyük görsel; görsel ve video dosyası indirilir.
//   - Sabitle: sekmenin görünümü her zaman üstte yüzen pencereye taşınır, sayfa
//     yeniden yüklenmez; kaldırınca sekmeye döner.
//   - Kalıcılık: yeniden açılışta sekmeler ve profiller geri gelir.
//
// Xvfb (DISPLAY), Playwright ve derlenmiş arayüz (renderer/dist) gerekir; yoksa atlanır.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");

let PW = null;
try { PW = require("playwright"); } catch { PW = null; }
const ROOT = path.join(__dirname, "..", "..");
const ELECTRON = path.join(ROOT, "node_modules", "electron", "dist", process.platform === "win32" ? "electron.exe" : "electron");
const READY = PW && process.env.DISPLAY && fs.existsSync(path.join(ROOT, "renderer", "dist", "index.html")) && fs.existsSync(ELECTRON);

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const TOKEN = `${b64({ alg: "HS256" })}.${b64({ id: 7, iat: now, exp: now + 86400 * 30 })}.imza`;
const USER = { id: 7, username: "test.admin", fullName: "Test Yönetici", role: "admin", isManagement: true, permissions: [] };
// Geçerli, tek renk PNG (zlib ile; görsel gerçekten yüklenir, boyutu doğru okunur).
const zlib = require("node:zlib");
function png(w, h) {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(w * 3, 0x60)]);
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
const PNG_BIG = png(1920, 1080);
const PNG_SMALL = png(480, 270);
const VIDEO = Buffer.alloc(256 * 1024, 7);

function server() {
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, "http://x");
    const html = (body, head = "") => { res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); res.end(`<!doctype html><meta charset="utf-8">${head}${body}`); };
    if (u.pathname.startsWith("/api/")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(u.pathname.startsWith("/api/users/verify") ? JSON.stringify({ user: USER }) : /summary|status/.test(u.pathname) ? "{}" : "[]");
    }
    if (u.pathname.startsWith("/m/")) {
      const name = path.basename(u.pathname);
      const body = name === "klip.mp4" ? VIDEO : name === "buyuk.png" ? PNG_BIG : PNG_SMALL;
      res.writeHead(200, { "Content-Type": name.endsWith(".mp4") ? "video/mp4" : "image/png", "Content-Length": body.length });
      return res.end(req.method === "HEAD" ? undefined : body);
    }
    if (u.pathname === "/set") { res.setHeader("Set-Cookie", `hesap=${u.searchParams.get("v")}; Path=/; Max-Age=3600`); return html(`<title>Yazıldı</title>ok`); }
    if (u.pathname === "/kim") { const m = (req.headers.cookie || "").match(/hesap=([^;]+)/); return html(`<title>Kim</title><h1 id="who">${m ? m[1] : "yok"}</h1>`); }
    if (u.pathname === "/acilir") return html(`<title>Açılır</title><a id="nt" href="/kim" target="_blank">yeni</a>`);
    return html(`<title>Medya</title><img src="/m/kucuk.png" srcset="/m/kucuk.png 480w, /m/buyuk.png 1920w" sizes="400px" width="400"><a href="/m/klip.mp4">video</a>`);
  });
  return new Promise((r) => srv.listen(0, "127.0.0.1", () => r(srv)));
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 15000) {
  const t0 = Date.now();
  for (;;) {
    let v;
    try { v = await fn(); } catch { v = null; }
    if (v) return v;
    if (Date.now() - t0 > ms) return null;
    await wait(200);
  }
}

async function launch(profileDir, srvUrl, downloads) {
  const app = await PW._electron.launch({
    executablePath: ELECTRON,
    args: ["--no-sandbox", "--disable-gpu", `--user-data-dir=${profileDir}`, ROOT],
    env: { ...process.env, NODE_OPTIONS: "", ELITLIG_USER_DATA: profileDir, ELITLIG_TEST_SESSION: JSON.stringify({ token: TOKEN, user: USER }), ELITLIG_API_ORIGIN: srvUrl, ELITLIG_SITE_ORIGIN: srvUrl, ELITLIG_TEST_DOWNLOAD_DIR: downloads },
    timeout: 60000,
  });
  await app.firstWindow();
  const win = await until(() => app.windows().find((w) => /index\.html$/.test(w.url())));
  await win.waitForSelector(".sidebar", { timeout: 30000 });
  return { app, win };
}

test("Tarayıcı: profiller ayrı oturum, medya indirme, sabitleme, kalıcılık", { skip: !READY && "Xvfb, Playwright ya da renderer/dist yok", timeout: 180000 }, async () => {
  const srv = await server();
  const U = `http://127.0.0.1:${srv.address().port}`;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "elitlig-browser-"));
  const downloads = path.join(tmp, "indirilenler");
  fs.mkdirSync(downloads);
  let app;
  let win;
  try {
  ({ app, win } = await launch(path.join(tmp, "profil"), U, downloads));
  const B = (name, arg) => win.evaluate(([n, a]) => window.elitlig.browser.cmd(n, a), [name, arg]);
  const st = () => win.evaluate(() => window.elitlig.browser.state());
  const page = (pred) => until(() => app.context().pages().find((p) => pred(p.url())));
  try {
    await win.click('.sidebar button.nav-item[data-tool="browser"]');
    await win.waitForSelector(".br-tabs");
    const first = (await st()).activeId;

    // İki profil, aynı site, iki ayrı oturum.
    const prof = await B("profileCreate", { name: "İş" });
    assert.equal(prof.id, "is");
    await B("navigate", { id: first, input: `${U}/set?v=kisisel` });
    const second = await B("newTab", { url: `${U}/set?v=is`, profileId: "is" });
    await until(async () => (await st()).tabs.every((t) => !t.loading && /Yazıldı/.test(t.title)));
    await B("navigate", { id: first, input: `${U}/kim` });
    await B("navigate", { id: second, input: `${U}/kim` });
    await until(async () => (await st()).tabs.filter((t) => t.title === "Kim").length === 2);
    const who = await until(async () => {
      const list = await Promise.all(app.context().pages().filter((p) => p.url().endsWith("/kim")).map((p) => p.evaluate(() => document.getElementById("who")?.textContent)));
      return list.length === 2 && list.every(Boolean) ? list.sort() : null;
    });
    assert.deepEqual(who, ["is", "kisisel"]);
    const ua = await (await page((u) => u.endsWith("/kim"))).evaluate(() => navigator.userAgent);
    assert.doesNotMatch(ua, /Electron|Elitlig/i, "sıradan Chrome kullanıcı aracısı");
    // Tutarlı Chrome kimliği (CDP): UA motorun ana sürümüyle, userAgentData "Google Chrome" içerir.
    const kimlik = await (await page((u) => u.endsWith("/kim"))).evaluate(() => ({ ua: navigator.userAgent, brands: navigator.userAgentData?.brands?.map((b) => `${b.brand}/${b.version}`) || [] }));
    const major = kimlik.ua.match(/Chrome\/(\d+)\.0\.0\.0 Safari/)?.[1];
    assert.ok(major, kimlik.ua);
    assert.ok(kimlik.brands.includes(`Google Chrome/${major}`) && kimlik.brands.includes(`Chromium/${major}`), kimlik.brands.join(","));

    // target=_blank → yeni sekme (aynı profil); file:// engellenir.
    await B("navigate", { id: first, input: `${U}/acilir` });
    const ap = await page((u) => u.endsWith("/acilir"));
    await ap.waitForLoadState("load");
    const n0 = (await st()).tabs.length;
    await ap.click("#nt");
    await until(async () => (await st()).tabs.length === n0 + 1);
    const opened = (await st()).tabs.find((t) => t.url.endsWith("/kim") && t.id !== second && t.id !== first);
    assert.equal(opened?.profileId, "kisisel");
    await ap.evaluate(() => { location.href = "file:///etc/hosts"; });
    await wait(700);
    assert.ok(ap.url().endsWith("/acilir"), "file:// engellendi");

    // Medya: en büyük srcset adayı; görsel ve video indirilir.
    await B("activate", first);
    await B("navigate", { id: first, input: `${U}/` });
    await until(async () => (await st()).tabs.find((t) => t.id === first)?.title === "Medya");
    const media = await B("media", { id: first });
    const big = media.items.find((m) => m.url.endsWith("/m/buyuk.png"));
    assert.equal(big?.width, 1920);
    assert.ok(!media.items.some((m) => m.url.endsWith("/m/kucuk.png")), "küçük aday listede yok");
    const vid = media.items.find((m) => m.kind === "video");
    assert.equal(vid?.bytes, VIDEO.length);
    await B("saveMedia", { id: first, url: big.url });
    await B("saveMedia", { id: first, url: vid.url });
    const files = await until(() => { const f = fs.readdirSync(downloads); return f.includes("buyuk.png") && f.includes("klip.mp4") && fs.statSync(path.join(downloads, "klip.mp4")).size === VIDEO.length ? f : null; });
    assert.ok(files, fs.readdirSync(downloads).join(","));
    const dl = await win.evaluate(() => window.elitlig.browser.downloads());
    assert.ok(dl.filter((d) => d.state === "completed").length >= 2);

    // Sabitle: görünüm yüzen pencereye taşınır (yeniden yüklenmez), başka sekmeye geçilir.
    const p1 = await page((u) => u === `${U}/`);
    await p1.evaluate(() => { window.__marker = 42; });
    await B("pin", { id: first, mode: "float" });
    const pip = await until(() => app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().endsWith("#browser-pip"));
      return w ? { top: w.isAlwaysOnTop(), children: w.contentView.children.length } : null;
    }));
    assert.deepEqual(pip, { top: true, children: 1 });
    let s = await st();
    assert.equal(s.pip.tabId, first);
    assert.notEqual(s.activeId, first);
    assert.equal(await p1.evaluate(() => window.__marker), 42, "sayfa yeniden yüklenmedi");
    await win.click('.sidebar button.nav-item[data-tool="today"]');
    await wait(500);
    assert.ok(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().some((x) => x.webContents.getURL().endsWith("#browser-pip"))), "başka araçta da açık");
    await win.click('.sidebar button.nav-item[data-tool="browser"]');
    await B("unpin");
    await until(() => app.evaluate(({ BrowserWindow }) => !BrowserWindow.getAllWindows().some((x) => x.webContents.getURL().endsWith("#browser-pip"))));
    s = await st();
    assert.equal(s.pip, null);
    assert.equal(await p1.evaluate(() => window.__marker), 42);
  } finally {
    await app.close();
  }

  // Kalıcılık: sekmeler, profiller ve yer imleri yeniden açılışta.
  ({ app, win } = await launch(path.join(tmp, "profil"), U, downloads));
  try {
    const s = await win.evaluate(() => window.elitlig.browser.state());
    assert.ok(s.tabs.length >= 3, `sekmeler: ${s.tabs.length}`);
    assert.ok(s.tabs.some((t) => t.profileId === "is"));
    assert.deepEqual(s.profiles.map((p) => p.id), ["kisisel", "is", "private"]);
  } finally {
    await app.close();
  }
  } finally {
    srv.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
