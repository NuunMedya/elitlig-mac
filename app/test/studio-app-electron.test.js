// 2.36.0 · Elitlig Stüdyo — GERÇEK Electron uygulamasıyla uçtan uca (app/studio-app/main.js).
//
//   - Elitlig Araçlar'ın yazdığı dışa aktarım (ortak klasör) ilk açılışta içe aktarılır:
//     sahneler / tür / ayarlar localStorage'a, studio-settings.json userData'ya; işaret yazılır.
//   - "Elitlig Araçlar ile giriş": bağlantıdaki anahtarla şifreli devir → giriş ekranı yok.
//   - Pencere studio.html'dir; Araçlar'ın kabuğu / görünümleri yüklenmez; araç takımı, raflar,
//     hızlı geçiş, sohbet soketi IPC'leri kayıtlı değildir; stüdyo, perf ve görsel yükleme vardır.
//   - Süreç sayısı ve bellek (getAppMetrics) ölçülür (rapor için ELITLIG_PERF_OUT).
//
// Xvfb (DISPLAY), Playwright ve derlenmiş arayüz (renderer/dist/studio.html) gerekir; yoksa atlanır.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const link = require("../studioLink");

let PW = null;
try { PW = require("playwright"); } catch { PW = null; }
const ROOT = path.join(__dirname, "..", "..");
const ELECTRON = path.join(ROOT, "node_modules", "electron", "dist", process.platform === "win32" ? "electron.exe" : "electron");
const READY = PW && process.env.DISPLAY && fs.existsSync(path.join(ROOT, "renderer", "dist", "studio.html")) && fs.existsSync(ELECTRON);

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const TOKEN = `${b64({ alg: "HS256" })}.${b64({ id: 7, iat: now, exp: now + 86400 * 30 })}.imza`;
const USER = { id: 7, username: "test.admin", fullName: "Test Yönetici", role: "admin", isManagement: true, permissions: [] };
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

test("Elitlig Stüdyo: Araçlar'dan ayar aktarımı + oturum devri; yalnız stüdyo yüklenir", { skip: !READY && "Xvfb, Playwright ya da renderer/dist yok", timeout: 180000 }, async () => {
  const api = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    if (req.url.startsWith("/api/users/verify")) { res.end(JSON.stringify({ user: USER })); return; }
    res.end(req.url.includes("matches") || req.url.includes("list") ? "[]" : "{}");
  });
  const apiUrl = await new Promise((r) => api.listen(0, "127.0.0.1", () => r(`http://127.0.0.1:${api.address().port}`)));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "elitlig-studyo-"));
  const xdg = path.join(tmp, "config");
  const shared = path.join(xdg, link.SHARED_DIR_NAME);
  const araclar = path.join(tmp, "araclar");
  fs.mkdirSync(araclar, { recursive: true });
  fs.writeFileSync(path.join(araclar, "studio-settings.json"), JSON.stringify({ recordDir: "/kayit/klasoru" }));
  const scenes = JSON.stringify({ v: 3, marker: "araclar-sahneleri", scenes: [], sources: [] });
  link.writeStudioExport({ dir: shared, userDataDir: araclar, entries: { "studio.mode": "match", "studio.v3.test": scenes, "studio.rail.v1": "{\"items\":[]}", "route": "today" }, version: "2.36.0" });
  const key = link.createHandoff({ dir: shared, session: { token: TOKEN, user: USER, loginAt: Date.now() } });
  const userData = path.join(tmp, "studyo");
  const app = await PW._electron.launch({
    executablePath: ELECTRON,
    args: ["--no-sandbox", "--disable-gpu", path.join(ROOT, "app", "studio-app", "main.js"), `elitlig-studyo://open?k=${key}`],
    env: { ...process.env, NODE_OPTIONS: "", XDG_CONFIG_HOME: xdg, ELITLIG_USER_DATA: userData, ELITLIG_API_ORIGIN: apiUrl, ELITLIG_SITE_ORIGIN: apiUrl },
    timeout: 60000,
  });
  try {
    const win = await until(() => app.windows().find((w) => /studio\.html/.test(w.url())), 30000);
    assert.ok(win, "studio.html penceresi");
    await win.waitForSelector(".studio", { timeout: 45000 });
    assert.equal(await win.locator(".login").count(), 0, "devirle giriş: giriş ekranı yok");
    assert.equal(await win.locator(".sidebar").count(), 0, "Araçlar kenar çubuğu yok");
    const ls = await win.evaluate(() => ({ mode: localStorage.getItem("studio.mode"), sc: localStorage.getItem("studio.v3.test"), route: localStorage.getItem("route"), app: document.documentElement.dataset.app }));
    assert.equal(ls.mode, "match");
    assert.equal(ls.sc, scenes);
    assert.equal(ls.route, null, "stüdyo dışı anahtar aktarılmaz");
    assert.equal(ls.app, "studio");
    assert.equal(JSON.parse(fs.readFileSync(path.join(userData, "studio-settings.json"), "utf8")).recordDir, "/kayit/klasoru");
    assert.ok(fs.existsSync(path.join(userData, "studio-import.json")), "aktarım işareti");
    assert.equal(fs.existsSync(path.join(shared, link.HANDOFF_FILE)), false, "devir dosyası silindi");
    // Yalnız stüdyo parçaları: Araçlar girişinin (index-*.js) ve görünümlerinin parçaları yüklenmez.
    const scripts = await win.evaluate(() => performance.getEntriesByType("resource").map((e) => e.name.split("/").pop()).filter((n) => n.endsWith(".js")));
    assert.deepEqual(scripts.filter((n) => /^(index|Today|Messages|Sheets|ToolkitPage|Projects|Planning|Accounting|Browser|AdminPanel|Workspace)-/.test(n)), []);
    // IPC: stüdyo + perf + görsel yükleme var; Araçlar'a özgüler yok.
    const handlers = await app.evaluate(({ ipcMain }) => [...(ipcMain._invokeHandlers?.keys?.() || [])]);
    if (handlers.length) {
      for (const h of ["studio:info", "studio:start", "perf:state", "chat:upload", "auth:state", "studioApp:importState"]) assert.ok(handlers.includes(h), h);
      for (const h of handlers) assert.doesNotMatch(h, /^(launcher|shelf|fileTools|deskkit|widgets|browser|admin|focus|requests|music|float|netTools):|^chat:(status|emit|refresh)$/, h);
    }
    const info = await win.evaluate(() => window.elitlig.studio.info());
    assert.equal(typeof info.ffmpeg, "object");
    // Süreç ve bellek (Elitlig Stüdyo, boşta, stüdyo açık).
    await wait(3000);
    const metrics = await app.evaluate(({ app: a }) => a.getAppMetrics().map((m) => ({ type: m.type, mem: m.memory?.workingSetSize || 0 })));
    const out = { processes: metrics.length, byType: metrics.reduce((o, m) => ({ ...o, [m.type]: (o[m.type] || 0) + 1 }), {}), workingSetMB: Math.round(metrics.reduce((a, m) => a + m.mem, 0) / 1024) };
    const heap = await win.evaluate(() => (performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null));
    if (process.env.ELITLIG_PERF_OUT) fs.writeFileSync(process.env.ELITLIG_PERF_OUT, JSON.stringify({ app: "studio", ...out, jsHeapMB: heap }, null, 1));
    assert.ok(out.processes >= 2);
  } finally {
    await app.close().catch(() => {});
    api.close();
  }
});
