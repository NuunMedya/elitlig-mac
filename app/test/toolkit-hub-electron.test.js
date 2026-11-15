// Birleşik Araç Takımı ve görsel düzenleyici "Vazgeç" — GERÇEK Electron (Playwright _electron, Xvfb).
//
// Hata (2.27.0): Dosya Araçları / Raflar görsel düzenleyicisinde değişiklik yapınca Vazgeç "tepki
// vermiyordu": onay penceresi düzenleyicinin ARKASINDA (z-index) açılıyordu. Burada: değişiklik →
// Vazgeç → onay en üstte ve tıklanabilir → "Kaydetmeden kapat" düzenleyiciyi kapatır. Ayrıca eski
// rota / kısayollar (⇧⌘D ⌘8 …) birleşik menünün bölümünü açar, kenar çubuğunda tek giriş kalır.
// Derlenmiş arayüz (npm run build), Playwright ve DISPLAY yoksa atlanır.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const zlib = require("node:zlib");

let PW = null;
try { PW = require("playwright"); } catch { try { PW = require("/opt/node22/lib/node_modules/playwright"); } catch { PW = null; } }
const ROOT = path.join(__dirname, "..", "..");
const ELECTRON = path.join(ROOT, "node_modules", "electron", "dist", process.platform === "win32" ? "electron.exe" : "electron");
const READY = PW && process.env.DISPLAY && fs.existsSync(path.join(ROOT, "renderer", "dist", "index.html")) && fs.existsSync(ELECTRON);

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const TOKEN = `${b64({ alg: "HS256" })}.${b64({ id: 7, iat: now, exp: now + 86400 * 30 })}.imza`;
const USER = { id: 7, username: "test", fullName: "Test Kullanıcı", role: "admin", isManagement: true, permissions: ["*"] };

/** 64×48 tek renkli PNG (bağımlılıksız). */
function png(w = 64, h = 48) {
  const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) raw.set([x * 4, y * 5, 160], y * (w * 3 + 1) + 1 + x * 3);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test("Araç Takımı birleşik menü + görsel düzenleyici Vazgeç (gerçek Electron)", { skip: !READY && "Xvfb, Playwright ya da renderer/dist yok", timeout: 180000 }, async () => {
  const api = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    if (req.url.startsWith("/api/users/verify")) return res.end(JSON.stringify({ user: USER }));
    return res.end(JSON.stringify({ items: [], total: 0 }));
  });
  await new Promise((r) => api.listen(0, "127.0.0.1", r));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "elitlig-hub-"));
  const img = path.join(tmp, "gorsel.png");
  fs.writeFileSync(img, png());
  const app = await PW._electron.launch({
    executablePath: ELECTRON,
    args: ["--no-sandbox", "--disable-gpu", `--user-data-dir=${path.join(tmp, "profil")}`, ROOT],
    env: { ...process.env, NODE_OPTIONS: "", TMPDIR: tmp, ELITLIG_USER_DATA: path.join(tmp, "profil"), ELITLIG_TEST_SESSION: JSON.stringify({ token: TOKEN, user: USER }), ELITLIG_API_ORIGIN: `http://127.0.0.1:${api.address().port}` },
    timeout: 90000,
  });
  try {
    let w = null;
    for (let i = 0; i < 100 && !w; i += 1) { w = app.windows().find((x) => /index\.html$/.test(x.url())); if (!w) await wait(200); }
    assert.ok(w, "ana pencere");
    await w.waitForSelector(".sidebar .nav-item", { timeout: 30000 });
    const side = await w.locator(".sidebar .nav-item").evaluateAll((els) => els.map((e) => e.dataset.tool));
    assert.ok(side.includes("toolkit"));
    for (const k of ["calc", "focus", "music", "desk", "files", "shelf"]) assert.ok(!side.includes(k), `${k} kenar çubuğunda olmamalı`);
    // Eski kısayol (menü öğesi) → birleşik menünün bölümü
    for (const [acc, key] of [["CmdOrCtrl+8", "calculators"], ["CmdOrCtrl+Shift+D", "files"]]) {
      await app.evaluate(({ Menu }, acc) => { const walk = (items) => { for (const i of items) { if (i.accelerator === acc) return i; if (i.submenu) { const r = walk(i.submenu.items); if (r) return r; } } return null; }; walk(Menu.getApplicationMenu().items).click(); }, acc);
      await w.waitForSelector(`.hub[data-hub-key="${key}"]`, { timeout: 10000 });
    }
    // Görsel düzenleyici: değişiklik → Vazgeç → onay en üstte → kaydetmeden kapat
    await app.evaluate(({ dialog }, p) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [p] }); }, img);
    await w.locator("button", { hasText: "Dosya seç" }).first().click();
    await w.waitForSelector(".ft-chip", { timeout: 10000 });
    await w.locator(".ft-tile3", { hasText: "Araçlar" }).first().click();
    await w.locator(".ft-tool", { hasText: "Kırp" }).first().click();
    await w.waitForSelector(".ie canvas", { timeout: 10000 });
    await wait(400);
    const box = await w.locator(".ie canvas").boundingBox();
    await w.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.3);
    await w.mouse.down();
    await w.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.6, { steps: 6 });
    await w.mouse.up();
    await w.locator(".ie__foot button", { hasText: "Vazgeç" }).click();
    await w.waitForSelector(".ie__ask", { timeout: 5000 });
    const onTop = await w.evaluate(() => { const m = document.querySelector(".ie__ask-box"); const r = m.getBoundingClientRect(); const el = document.elementFromPoint(r.x + r.width / 2, r.y + 10); return Boolean(el && m.contains(el)); });
    assert.equal(onTop, true, "onay düzenleyicinin üstünde olmalı");
    await w.locator(".ie__ask button", { hasText: "Kaydetmeden kapat" }).click({ timeout: 3000 });
    await w.waitForSelector(".ie", { state: "detached", timeout: 5000 });
  } finally {
    await app.close().catch(() => {});
    api.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
