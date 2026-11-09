// Yayın Stüdyosu — YERLEŞİM SÜRÜKLE-BIRAK hizası, arayüz ölçeği %70…%125 (Playwright / Chromium).
//
// Hata (2.20.1 ve öncesi): stüdyo kökü CSS `zoom` ile ölçeklenir; Chromium'un standart zoom'unda
// getBoundingClientRect / clientX ölçekli, offsetWidth / style.left ölçeksiz pikseldir. dockview
// bırakma bölgesini ve önizleme kutusunu bu ikisini karıştırarak hesapladığından ölçek ≠ %100'de
// kutu imlecin başka yerinde çıkıyor, panel yanlış kenara bırakılıyordu. Düzeltme: Workspace
// dockview kökünde ölçeği geri alır (etkin ölçek 1), içerik yeniden ölçeklenir.
//
// Her ölçekte: "Ses" sekmesi "Önizleme" grubunun sol / sağ / üst / alt kenarına ve ortasına
// sürüklenir → önizleme kutusu imleci içermeli, doğru kenarı göstermeli; bırakınca düzen
// beklenen yerde olmalı. Ayrıca yüzen grup → ızgara ve pano öğesi (react-grid-layout) sürüklemesi.
//
// Derlenmiş arayüz (renderer/dist, `npm run build`) ve Playwright gerekir; yoksa atlanır.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const studioMock = require("./fixtures/studio-mock");

function loadPlaywright() {
  for (const p of ["playwright", "/opt/node-tools/node_modules/playwright", process.env.PLAYWRIGHT_PATH].filter(Boolean)) {
    try { return require(p); } catch { /* sonraki */ }
  }
  return null;
}
const PW = loadPlaywright();
const DIST = path.join(__dirname, "..", "..", "renderer", "dist");
const HAS_DIST = fs.existsSync(path.join(DIST, "index.html"));
const SCALES = (process.env.STUDIO_DND_SCALES || "70,85,100,125").split(",").map(Number);
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json" };

function serve() {
  const server = http.createServer((req, res) => {
    const u = decodeURIComponent(new URL(req.url, "http://x").pathname);
    const f = path.join(DIST, u === "/" ? "index.html" : u);
    if (!f.startsWith(DIST)) { res.writeHead(404); res.end(); return; }
    fs.readFile(f, (e, b) => {
      if (e) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { "Content-Type": TYPES[path.extname(f)] || "application/octet-stream" });
      res.end(b);
    });
  });
  return new Promise((r) => server.listen(0, "127.0.0.1", () => r(server)));
}

const grpRect = (page, title) => page.evaluate((t) => {
  const g = [...document.querySelectorAll(".dv-groupview")].find((x) => [...x.querySelectorAll(".lw-tab__t")].some((e) => e.textContent === t));
  if (!g) return null;
  const r = g.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height, tabs: [...g.querySelectorAll(".lw-tab__t")].map((e) => e.textContent) };
}, title);
const overlay = (page) => page.evaluate(() => {
  const o = [...document.querySelectorAll(".dv-drop-target-anchor")].find((e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none"; });
  if (!o) return null;
  const r = o.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height, cls: o.className };
});
async function dragTo(page, from, px, py) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 20, from.y - 20, { steps: 4 });
  await page.mouse.move(px, py, { steps: 12 });
  await page.waitForTimeout(200);
  await page.mouse.move(px + 1, py + 1, { steps: 2 });
  await page.waitForTimeout(200);
}
const inside = (o, x, y) => Boolean(o) && x >= o.x - 2 && x <= o.x + o.w + 2 && y >= o.y - 2 && y <= o.y + o.h + 2;

test("yerleşim sürükle-bırak: önizleme kutusu imleçte, bırakılan yer doğru (%70…%125)", { skip: (!PW && "Playwright yok") || (!HAS_DIST && "renderer/dist yok (npm run build)"), timeout: 600000 }, async () => {
  const server = await serve();
  const url = `http://127.0.0.1:${server.address().port}/index.html`;
  const browser = await PW.chromium.launch({ args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--autoplay-policy=no-user-gesture-required"] });
  const fails = [];
  try {
    for (const scale of SCALES) {
      const ctx = await browser.newContext({ viewport: { width: 1512, height: 982 }, deviceScaleFactor: 1, permissions: ["camera", "microphone"] });
      await ctx.addInitScript(studioMock, { YT: false, scale });
      const page = await ctx.newPage();
      await page.goto(url);
      await page.waitForSelector(".dv-groupview", { timeout: 20000 });
      await page.waitForTimeout(1500);
      const zoom = await page.evaluate(() => Number(getComputedStyle(document.querySelector(".studio")).zoom) || 1);
      assert.ok(Math.abs(zoom - scale / 100) < 0.01, `ölçek uygulanmadı: ${zoom}`);
      await page.locator(".st-top button", { hasText: "Düzenle" }).first().click();
      await page.waitForTimeout(500);

      // 1) sekme → grubun kenarları / ortası
      for (const [where, fx, fy] of [["left", 0.1, 0.5], ["right", 0.9, 0.5], ["top", 0.5, 0.12], ["bottom", 0.5, 0.88], ["center", 0.5, 0.5]]) {
        const sb = await page.locator(".dv-tab", { has: page.locator(".lw-tab__t", { hasText: /^Ses$/ }) }).first().boundingBox();
        const tg = await grpRect(page, "Önizleme");
        const px = tg.x + tg.w * fx, py = tg.y + tg.h * fy;
        await dragTo(page, { x: sb.x + sb.width / 2, y: sb.y + sb.height / 2 }, px, py);
        const ov = await overlay(page);
        await page.mouse.up();
        await page.waitForTimeout(600);
        const side = ov && (ov.cls.match(/dv-drop-target-(left|right|top|bottom)/) || [null, "center"])[1];
        if (!inside(ov, px, py)) fails.push(`%${scale} ${where}: önizleme kutusu imleçte değil (imleç ${Math.round(px)},${Math.round(py)}; kutu ${ov ? [ov.x, ov.y, ov.w, ov.h].map(Math.round).join(",") : "yok"})`);
        if (side !== where) fails.push(`%${scale} ${where}: kutu "${side}" kenarını gösteriyor`);
        const ses = await grpRect(page, "Ses");
        const pv = await grpRect(page, "Önizleme");
        const cx = ses.x + ses.w / 2, cy = ses.y + ses.h / 2, pcx = pv.x + pv.w / 2, pcy = pv.y + pv.h / 2;
        const ok = where === "center" ? ses.tabs.includes("Önizleme")
          : !ses.tabs.includes("Önizleme") && (where === "left" ? cx < pcx && Math.abs(cy - pcy) < 4 : where === "right" ? cx > pcx && Math.abs(cy - pcy) < 4 : where === "top" ? cy < pcy && Math.abs(cx - pcx) < 4 : cy > pcy && Math.abs(cx - pcx) < 4);
        if (!ok) fails.push(`%${scale} ${where}: bırakılan düzen yanlış`);
        await page.locator(".lw-editbar button", { hasText: "Varsayılana dön" }).click();
        await page.waitForTimeout(600);
      }

      // 2) pano öğesi (react-grid-layout) imleçle birlikte gider
      {
        const it = page.locator(".lw-panel.is-board .react-grid-item").first();
        const b0 = await it.boundingBox();
        const sx = b0.x + 30, sy = b0.y + 9;
        await page.mouse.move(sx, sy); await page.mouse.down();
        await page.mouse.move(sx + 5, sy + 5, { steps: 3 });
        await page.mouse.move(sx + 40, sy + 160, { steps: 12 });
        await page.waitForTimeout(150);
        const b1 = await it.boundingBox();
        await page.mouse.up();
        await page.waitForTimeout(300);
        if (Math.abs(b1.x - b0.x - 40) > 3 || Math.abs(b1.y - b0.y - 160) > 3) fails.push(`%${scale} pano öğesi imleçten kaydı: ${Math.round(b1.x - b0.x)},${Math.round(b1.y - b0.y)} (beklenen 40,160)`);
        await page.locator(".lw-editbar button", { hasText: "Varsayılana dön" }).click();
        await page.waitForTimeout(500);
      }

      // 3) yüzen grup → başka grubun sol kenarı
      {
        const grp = page.locator(".dv-groupview", { has: page.locator(".lw-tab__t", { hasText: /^Ses$/ }) }).first();
        await grp.hover();
        await grp.locator(".lw-gact__menu").last().locator("button").first().click();
        await page.waitForTimeout(200);
        await page.locator(".menu__list button, .menu__list [role=\"menuitem\"]", { hasText: "Yüzen pencereye al" }).first().click();
        await page.waitForTimeout(500);
        const fl = await page.locator(".dv-resize-container").first().boundingBox();
        assert.ok(fl && fl.width > 100, "yüzen pencere açılmadı");
        const sb = await page.locator(".dv-resize-container .dv-tab").first().boundingBox();
        const tg = await grpRect(page, "Program");
        const px = tg.x + tg.w * 0.1, py = tg.y + tg.h * 0.5;
        await dragTo(page, { x: sb.x + sb.width / 2, y: sb.y + sb.height / 2 }, px, py);
        const ov = await overlay(page);
        await page.mouse.up();
        await page.waitForTimeout(500);
        if (!inside(ov, px, py) || !ov.cls.includes("dv-drop-target-left")) fails.push(`%${scale} yüzen grup: önizleme kutusu imleçte / solda değil`);
        const ses = await grpRect(page, "Ses");
        const pg = await grpRect(page, "Program");
        const floating = await page.evaluate(() => Boolean(document.querySelector(".dv-resize-container .lw-tab__t")));
        if (floating || !(ses.x + ses.w / 2 < pg.x + pg.w / 2)) fails.push(`%${scale} yüzen grup ızgaraya doğru yere bırakılmadı`);
      }
      await ctx.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
  assert.deepEqual(fails, []);
});
