// Yönetim (gömülü web yönetim paneli) — GERÇEK Electron uygulamasıyla uçtan uca.
//
// Uygulama Playwright'ın _electron sürücüsüyle açılır; oturum test kancasıyla
// (ELITLIG_TEST_SESSION) verilir, API ve site yerel sahte sunuculardır. Sınananlar:
//   - Panel ayrı oturum bölmesinde açılır; jeton sayfa betiklerinden ÖNCE web'in
//     localStorage "accessToken" anahtarındadır (URL'de değil); köprü ve UA imi.
//   - Web'in bildirdiği menü masaüstü Yönetim listesine geçer (yeni bölümler dahil).
//   - Site dışına gezinme engellenir, sistem tarayıcısına gider; site içi window.open
//     uygulama içinde açılır.
//   - İndirme kaydedilir (test indirme klasörü), PDF çıktısı alınır.
//   - Web'in kişisel araç adresi yerel araca yönlenir.
//   - Web'den çıkış masaüstü oturumunu kapatır; panel ve verisi silinir.
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

const SITE_HTML = `<!doctype html><meta charset="utf-8"><title>Yönetim test</title>
<script>
  window.__boot = { token: localStorage.getItem("accessToken"), user: JSON.parse(localStorage.getItem("user") || "null"), bridge: typeof window.elitligDesktopPanel, panel: window.elitligDesktopPanel && window.elitligDesktopPanel.panel, ua: navigator.userAgent, href: location.href };
  if (window.elitligDesktopPanel) window.elitligDesktopPanel.publishNav([
    { key: "maclar", label: "Maçlar", icon: "ball", items: [{ name: "Maç listesi", path: "/editor/maclar", icon: "ball" }] },
    { key: "yeni", label: "Yeni Bölüm", icon: "star", items: [{ name: "Yeni sayfa", path: "/editor/yeni-sayfa" }] },
    { key: "araclar", label: "Araçlarım", tools: true, items: [{ name: "Ajanda", path: "/yonetim/araclar/ajanda" }] },
  ]);
</script><h1>Panel</h1>`;

function servers() {
  const log = [];
  const api = http.createServer((req, res) => {
    log.push({ url: req.url, auth: req.headers.authorization || "", ua: req.headers["user-agent"] || "" });
    if (req.headers.origin) { res.setHeader("Access-Control-Allow-Origin", req.headers.origin); res.setHeader("Access-Control-Allow-Credentials", "true"); }
    if (req.url.startsWith("/indir")) { res.writeHead(200, { "Content-Type": "text/csv", "Content-Disposition": "attachment; filename=\"liste.csv\"" }); res.end("a,b\n1,2\n"); return; }
    if (req.url.startsWith("/api/users/verify")) { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ user: USER })); return; }
    res.writeHead(200, { "Content-Type": "application/json" }); res.end(req.url.startsWith("/api/") ? "{}" : "[]");
  });
  const site = http.createServer((_req, res) => { res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); res.end(SITE_HTML); });
  const listen = (s) => new Promise((r) => s.listen(0, "127.0.0.1", () => r(`http://127.0.0.1:${s.address().port}`)));
  return Promise.all([listen(api), listen(site)]).then(([apiUrl, siteUrl]) => ({ api, site, apiUrl, siteUrl, log }));
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 20000) {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > ms) return null;
    await wait(250);
  }
}

test("Yönetim: gömülü panel masaüstü oturumuyla açılır, gezinme / indirme / çıkış eşitlenir", { skip: !READY && "Xvfb, Playwright ya da renderer/dist yok", timeout: 180000 }, async () => {
  const srv = await servers();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "elitlig-admin-"));
  const downloads = path.join(tmp, "indirilenler");
  fs.mkdirSync(downloads);
  const app = await PW._electron.launch({
    executablePath: ELECTRON,
    args: ["--no-sandbox", "--disable-gpu", `--user-data-dir=${path.join(tmp, "profil")}`, ROOT],
    env: {
      ...process.env, NODE_OPTIONS: "", ELITLIG_USER_DATA: path.join(tmp, "profil"),
      ELITLIG_TEST_SESSION: JSON.stringify({ token: TOKEN, user: USER }),
      ELITLIG_API_ORIGIN: srv.apiUrl, ELITLIG_SITE_ORIGIN: srv.siteUrl, ELITLIG_TEST_DOWNLOAD_DIR: downloads,
    },
    timeout: 60000,
  });
  try {
    await app.firstWindow();
    const win = await until(() => app.windows().find((w) => /index\.html$/.test(w.url())));
    assert.ok(win, "ana pencere");
    await win.waitForSelector(".sidebar", { timeout: 30000 });
    await app.evaluate(({ shell, dialog }) => {
      global.__external = [];
      shell.openExternal = async (u) => { global.__external.push(u); };
      dialog.showMessageBox = async () => ({ response: 0 });
    });

    // Kenar çubuğu: kopyadan gelen bölümler (yönetici: hepsi).
    const before = await win.locator(".admin-tree__section").allInnerTexts();
    assert.ok(before.includes("Maçlar") && before.includes("Oyuncular") && before.includes("Takımlar"), before.join(","));

    await win.click('.sidebar button.nav-item[data-tool="admin"]');
    const panel = await until(() => app.context().pages().find((p) => p.url().startsWith(srv.siteUrl)));
    assert.ok(panel, "gömülü panel sayfası");
    await panel.waitForFunction(() => window.__boot);
    const boot = await panel.evaluate(() => window.__boot);
    assert.equal(boot.token, TOKEN, "jeton sayfa betiklerinden önce localStorage'da");
    assert.equal(boot.user.username, "test.admin");
    assert.equal(boot.bridge, "object");
    assert.equal(boot.panel, true);
    assert.match(boot.ua, /ElitligDesktopPanel\//);
    assert.doesNotMatch(boot.ua, /ElitligDesktop\//, "eski kısıtlı mod imi yok");
    assert.ok(!boot.href.includes(TOKEN), "jeton adreste değil");

    // Web'in bildirdiği menü: yeni bölüm masaüstü listesinde, Araçlarım listede değil.
    await until(async () => (await win.evaluate(() => window.elitlig.admin.nav())).source === "web");
    await until(async () => (await win.locator(".admin-tree__section").allInnerTexts()).includes("Yeni Bölüm"));
    const after = await win.locator(".admin-tree__section").allInnerTexts();
    assert.deepEqual(after, ["Maçlar", "Yeni Bölüm"]);

    // Kenar çubuğundan sayfa açma.
    await win.click('.admin-tree__section:has-text("Yeni Bölüm")');
    await win.click('.admin-tree__item:has-text("Yeni sayfa")');
    await until(() => panel.url().endsWith("/editor/yeni-sayfa"));
    assert.ok(panel.url().endsWith("/editor/yeni-sayfa"), panel.url());

    // Site dışına gezinme engellenir → sistem tarayıcısı.
    await panel.evaluate(() => { location.href = "https://example.org/disari"; });
    await wait(1200);
    assert.ok(panel.url().startsWith(srv.siteUrl), panel.url());
    assert.deepEqual(await app.evaluate(() => global.__external), ["https://example.org/disari"]);

    // Site içi açılır pencere uygulama içinde, aynı oturumla.
    await panel.evaluate((site) => window.open(`${site}/editor/haberler`, "_blank"), srv.siteUrl);
    const popup = await until(() => app.context().pages().find((p) => p.url().endsWith("/editor/haberler")));
    assert.ok(popup, "açılır pencere");
    await popup.waitForFunction(() => window.__boot);
    assert.equal((await popup.evaluate(() => window.__boot)).token, TOKEN);
    await popup.close();

    // İndirme: kaydet diyaloğu yerine test klasörü.
    await panel.evaluate((api) => { const a = document.createElement("a"); a.href = `${api}/indir`; a.download = "liste.csv"; document.body.append(a); a.click(); }, srv.apiUrl);
    await until(() => fs.existsSync(path.join(downloads, "liste.csv")));
    assert.equal(fs.readFileSync(path.join(downloads, "liste.csv"), "utf8"), "a,b\n1,2\n");
    const list = await until(async () => (await win.evaluate(() => window.elitlig.admin.downloads())).find((d) => d.state === "completed"));
    assert.equal(list.name, "liste.csv");

    // PDF.
    const pdf = await win.evaluate(() => window.elitlig.admin.pdf());
    assert.ok(pdf.ok && fs.statSync(pdf.path).size > 500);

    // Web'in kişisel aracı (Ajanda) yerel araçta açılır.
    await panel.evaluate(() => { history.pushState({}, "", "/yonetim/araclar/ajanda"); });
    await until(async () => (await win.evaluate(() => localStorage.getItem("route"))) === "agenda");
    assert.equal(await win.evaluate(() => localStorage.getItem("route")), "agenda");

    // Web'den çıkış: masaüstü oturumu kapanır, panel silinir.
    await panel.evaluate(() => window.elitligDesktopPanel.signOut());
    await win.waitForSelector(".login", { timeout: 15000 });
    await until(() => !app.context().pages().some((p) => p.url().startsWith(srv.siteUrl)));
    assert.ok(!app.context().pages().some((p) => p.url().startsWith(srv.siteUrl)), "panel kapandı");
    // Panelin API'ye giden istekleri panel imini taşır (sunucu tarafı ayrım için).
    assert.ok(srv.log.some((r) => r.url.startsWith("/indir") && /ElitligDesktopPanel\//.test(r.ua)), "indirme isteği panel imiyle");
  } finally {
    await app.close().catch(() => {});
    srv.api.close();
    srv.site.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
