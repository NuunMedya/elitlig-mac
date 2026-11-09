// Yayın Stüdyosu — PANEL SÜTUNLARI (Playwright / Chromium).
//
// Panel başlığındaki "Sütun" denetimi: ana ızgara 1–8 sütun, sütun sınırları sürüklenerek genişlik,
// "Eşit dağıt", "Sıfırla"; bölümlü panelde (Reji: ev | orta | deplasman | gol müziği) bölüm → sütun.
// Sınananlar: 4 sütun seçilince 4 eşit iz; sınır sürüklenince sol sütun büyür, sağdaki küçülür
// (toplam aynı); yatay taşma yok; ayar kalıcı (studio.density.v1) ve yeniden açılışta uygulanır;
// bölüm başka sütuna alınır; Sıfırla panelin kendi düzenine döner (satır içi stiller temizlenir).
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
const SHOTS = process.env.STUDIO_SHOTS || null;
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

const leaf = (id, views, size) => ({ type: "leaf", data: { views, activeView: views[0], id }, size });
const layoutOf = (kind) => ({
  v: 1, rev: 2,
  dock: { grid: { root: { type: "branch", data: [leaf("g0", [kind], 1500)], size: 900 }, width: 1500, height: 900, orientation: "HORIZONTAL" }, panels: { [kind]: { id: kind, contentComponent: "studio", title: kind, params: { kind, opts: {} } } }, activeGroup: "g0" },
  boards: { rail: { title: "Kısayollar", cols: 2, rowH: 40, items: [] } }, removed: [], mins: {}, preset: null, autoHide: true,
});

const state = (page, kind) => page.evaluate((k) => {
  const frame = document.querySelector(`.pf[data-pf="${k}"]`);
  const body = frame?.querySelector(".pf__body");
  const el = frame?.querySelector("[data-pf-cols]");
  if (!el) return { el: false, over: body ? body.scrollWidth - body.clientWidth : null };
  const secs = Object.fromEntries([...el.querySelectorAll(":scope > [data-pf-sec]")].map((c) => [c.dataset.pfSec, { col: c.style.gridColumn, x: Math.round(c.getBoundingClientRect().x), w: Math.round(c.getBoundingClientRect().width) }]));
  return {
    el: true,
    tracks: getComputedStyle(el).gridTemplateColumns.split(/\s+/).map(parseFloat),
    over: body.scrollWidth - body.clientWidth,
    elOver: el.scrollWidth - el.clientWidth,
    handles: frame.querySelectorAll(".pf-colh").length,
    secs,
  };
}, kind);

async function open(browser, url, kind, density = null) {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 940 }, deviceScaleFactor: 1 });
  await ctx.addInitScript(studioMock, { layout: layoutOf(kind) });
  if (density) await ctx.addInitScript((d) => localStorage.setItem("studio.density.v1", d), density);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(url);
  await page.waitForSelector(`.pf[data-pf="${kind}"]`, { timeout: 20000 });
  await page.waitForTimeout(800);
  return { ctx, page, errors };
}

async function dragHandle(page, kind, i, dx) {
  const h = await page.locator(`.pf[data-pf="${kind}"] .pf-colh`).nth(i).boundingBox();
  const x = h.x + h.width / 2;
  const y = h.y + Math.min(60, h.height / 2);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx / 2, y, { steps: 4 });
  await page.mouse.move(x + dx, y, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(250);
}

test("panel sütunları: 4 sütun, sınır sürükleme, taşma yok, kalıcı, bölüm → sütun, sıfırla", { skip: (!PW && "Playwright yok") || (!HAS_DIST && "renderer/dist yok (npm run build)"), timeout: 180000 }, async () => {
  const server = await serve();
  const url = `http://127.0.0.1:${server.address().port}/index.html`;
  const browser = await PW.chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
  try {
    for (const kind of ["sahne", "yonetimReji"]) {
      const { ctx, page, errors } = await open(browser, url, kind);
      const frame = `.pf[data-pf="${kind}"]`;
      assert.equal((await state(page, kind)).el, false, `${kind}: başlangıçta oto`);
      await page.click(`${frame} [data-cols-btn]`);
      await page.click(`${frame} [data-cols-n="4"]`);
      await page.waitForTimeout(250);
      let s = await state(page, kind);
      assert.equal(s.tracks.length, 4, `${kind}: 4 sütun`);
      const total = s.tracks.reduce((a, b) => a + b, 0);
      for (const t of s.tracks) assert.ok(Math.abs(t - total / 4) < 2, `${kind}: eşit sütunlar ${s.tracks}`);
      assert.equal(s.handles, 3, `${kind}: 3 sınır tutamacı`);
      assert.ok(s.over <= 0 && s.elOver <= 0, `${kind}: yatay taşma yok (${s.over}, ${s.elOver})`);
      if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `columns-${kind}-4-esit.png`) });
      await page.keyboard.press("Escape");

      // 1. sınır +120 px: 1. sütun büyür, 2. küçülür, toplam aynı
      await dragHandle(page, kind, 0, 120);
      const before = s.tracks;
      s = await state(page, kind);
      assert.ok(s.tracks[0] > before[0] + 100 && s.tracks[0] < before[0] + 140, `${kind}: 1. sütun büyüdü ${before[0]} → ${s.tracks[0]}`);
      assert.ok(s.tracks[1] < before[1] - 100, `${kind}: 2. sütun küçüldü`);
      assert.ok(Math.abs(s.tracks.reduce((a, b) => a + b, 0) - total) < 2, `${kind}: toplam genişlik aynı`);
      // 3. sınır −80 px
      await dragHandle(page, kind, 2, -80);
      s = await state(page, kind);
      assert.ok(s.tracks[2] < before[2] - 60 && s.tracks[3] > before[3] + 60, `${kind}: 3. / 4. sütun ${s.tracks}`);
      // aşırı sürükleme: en dar sütun sınırı korunur, taşma yok
      await dragHandle(page, kind, 0, 900);
      s = await state(page, kind);
      assert.ok(Math.min(...s.tracks) >= 40, `${kind}: en dar sütun korunur ${s.tracks}`);
      assert.ok(s.over <= 0 && s.elOver <= 0, `${kind}: sürükleme sonrası taşma yok`);
      if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `columns-${kind}-4-surukle.png`) });

      const saved = await page.evaluate(() => localStorage.getItem("studio.density.v1"));
      const cols = JSON.parse(saved).panels[kind].cols;
      assert.equal(cols.n, 4);
      assert.ok(Math.abs(cols.w.reduce((a, b) => a + b, 0) - 4) < 0.01, "ağırlık toplamı = sütun sayısı");

      if (kind === "yonetimReji") {
        // bölümler: varsayılan ev 1, orta 2, deplasman 3, gol müziği tam satır
        assert.equal(s.secs.home.col, "1");
        assert.equal(s.secs.center.col, "2");
        assert.equal(s.secs.away.col, "3");
        assert.equal(s.secs.music.col, "1 / -1");
        await page.click(`${frame} [data-cols-btn]`);
        await page.selectOption(`${frame} [data-cols-sec="away"]`, "4");
        await page.selectOption(`${frame} [data-cols-sec="center"]`, "1");
        await page.waitForTimeout(250);
        s = await state(page, kind);
        assert.equal(s.secs.away.col, "4");
        assert.equal(s.secs.center.col, "1");
        assert.ok(s.secs.away.x > s.secs.home.x, "deplasman 4. sütunda (sağda)");
        // Eşit dağıt
        await page.click(`${frame} [data-cols-equal]`);
        await page.waitForTimeout(200);
        s = await state(page, kind);
        for (const t of s.tracks) assert.ok(Math.abs(t - total / 4) < 2, "eşit dağıtıldı");
        await page.keyboard.press("Escape");
      }

      // kalıcı: aynı ayarla yeniden açılınca uygulanır
      const again = await open(browser, url, kind, await page.evaluate(() => localStorage.getItem("studio.density.v1")));
      const s2 = await state(again.page, kind);
      assert.equal(s2.tracks.length, 4, `${kind}: yeniden açılışta 4 sütun`);
      assert.ok(Math.abs(s2.tracks[0] - s.tracks[0]) < 3, `${kind}: genişlikler korunur`);
      // Sıfırla → oto, satır içi stiller temizlenir
      await again.page.click(`${frame} [data-cols-btn]`);
      await again.page.click(`${frame} [data-cols-reset]`);
      await again.page.waitForTimeout(250);
      const s3 = await state(again.page, kind);
      assert.equal(s3.el, false, `${kind}: sıfırlandı`);
      const inline = await again.page.evaluate((f) => [...document.querySelectorAll(`${f} [style*="grid-template-columns: var(--pf-cols)"]`)].length, frame);
      assert.equal(inline, 0);
      assert.deepEqual(again.errors, []);
      await again.ctx.close();
      assert.deepEqual(errors, []);
      await ctx.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
});
