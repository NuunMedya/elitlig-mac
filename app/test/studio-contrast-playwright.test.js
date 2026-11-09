// Yayın Stüdyosu — AÇIK TEMALAR KONTRAST DENETİMİ (Playwright / Chromium).
//
// Hata (2.23.0): açık temada (Açık, Kağıt, Buz) bazı düğme / çip / parçacıklarda simge ya da yazı
// zeminle aynı renkteydi (ör. dolu biçimli parçacıkta seçili çip beyaz üstüne beyaz, sarı renkli
// parçacıkta beyaz yazı, açı küçük resminde koyu simge siyah zeminde, "YAYINDA" hapında koyu yazı).
//
// Her açık temada şu ekranlar açılır ve görünür her simge (svg.ic, currentColor) ile yazının ETKİN
// zemine karşı kontrastı ölçülür (fixtures/contrast-audit.js: ata zincirindeki yarı saydam renkler ve
// gradyan katmanları; en kötüsü): simge ≥ 3:1, yazı ≥ 4,5:1 (büyük yazı ≥ 3:1). Etkin olmayanlar sayılmaz.
//   · varsayılan stüdyo (+ düğme / sekme / çip üzerine gelme: CSS :hover zorlanır)
//   · TÜM parçacık kataloğu: varsayılan, dolu (tema rengi), çerçeve (sarı), yumuşak (mavi), dolu (sarı)
//   · Kontrol merkezi, Ayarlar (Görünüm, Reji / Maç, Makrolar, Klavye kısayolları), müzik çalar
//
// Derlenmiş arayüz (renderer/dist, `npm run build`) ve Playwright gerekir; yoksa atlanır.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const studioMock = require("./fixtures/studio-mock");
const auditContrast = require("./fixtures/contrast-audit");

function loadPlaywright() {
  for (const p of ["playwright", "/opt/node-tools/node_modules/playwright", process.env.PLAYWRIGHT_PATH].filter(Boolean)) {
    try { return require(p); } catch { /* sonraki */ }
  }
  return null;
}
const PW = loadPlaywright();
const ROOT = path.join(__dirname, "..", "..");
const DIST = path.join(ROOT, "renderer", "dist");
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

/** Parçacık kataloğu (railModel.RAIL_WIDGETS: tür + varsayılan boy). */
function widgetTypes() {
  const src = fs.readFileSync(path.join(ROOT, "renderer/src/views/studio/shortcuts/railModel.js"), "utf8");
  const block = src.slice(src.indexOf("export const RAIL_WIDGETS"), src.indexOf("export const widgetOf"));
  return [...block.matchAll(/\{ type: "(\w+)",[^\n]*?size: "(\d)x(\d)"/g)].map((m) => ({ t: m[1], w: Number(m[2]), h: Number(m[3]) }));
}
const dockOf = (id, kind, opts = {}) => ({ grid: { root: { type: "branch", data: [{ type: "leaf", data: { views: [id], activeView: id, id: "g1" }, size: 1500 }], size: 900 }, width: 1500, height: 900, orientation: "HORIZONTAL" }, panels: { [id]: { id, contentComponent: "studio", title: id, params: { kind, opts } } }, activeGroup: "g1" });
function boardLayout(items, cols = 8) {
  let x = 0, y = 0, rowH = 0;
  const out = items.map((it, i) => {
    const w = Math.min(cols, it.w * 2), h = it.h * 2;
    if (x + w > cols) { x = 0; y += rowH; rowH = 0; }
    const r = { i: `w${i}`, t: `w:${it.t}`, x, y, w, h, ...(it.o ? { o: it.o } : {}) };
    x += w; rowH = Math.max(rowH, h);
    return r;
  });
  return { v: 1, rev: 2, dock: dockOf("board~all", "board", { board: "all" }), boards: { rail: { title: "Kısayollar", cols: 2, rowH: 40, items: [] }, all: { title: "Tümü", cols, rowH: 36, items: out } }, removed: [], mins: {}, preset: null, autoHide: true };
}
const panelLayout = (kind) => ({ v: 1, rev: 2, dock: dockOf(kind, kind), boards: { rail: { title: "Kısayollar", cols: 2, rowH: 40, items: [] } }, removed: [], mins: {}, preset: null, autoHide: true });

const HOVER = ".studio button, .studio [role=tab], .studio .st-chip, .studio [role=button]";
async function forceHover(page, on) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("DOM.enable");
  await cdp.send("CSS.enable");
  const { root } = await cdp.send("DOM.getDocument", { depth: -1 });
  const { nodeIds } = await cdp.send("DOM.querySelectorAll", { nodeId: root.nodeId, selector: HOVER });
  for (const id of nodeIds.slice(0, 500)) await cdp.send("CSS.forcePseudoState", { nodeId: id, forcedPseudoClasses: on ? ["hover"] : [] }).catch(() => {});
  await cdp.detach().catch(() => {});
}

const THEMES = [["acik", "Açık"], ["kagit", "Kağıt"], ["buz", "Buz"]];
const types = widgetTypes();

for (const [theme, name] of THEMES) {
  test(`açık tema kontrastı: ${name} — simge ≥ 3:1, yazı ≥ 4,5:1 (stüdyo, tüm parçacıklar, renk biçimleri, kontrol merkezi, ayarlar)`, { skip: (!PW && "Playwright yok") || (!HAS_DIST && "renderer/dist yok (npm run build)"), timeout: 240000 }, async () => {
    const server = await serve();
    const url = `http://127.0.0.1:${server.address().port}/index.html`;
    const browser = await PW.chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
    const fails = [];
    let checked = 0;
    const run = async (page, screen) => {
      const r = await page.evaluate(auditContrast, {});
      checked += r.checked;
      for (const f of r.fails) fails.push(`${screen}: ${f.kind} ${f.ratio}:1 (< ${f.min}) ${f.fg} / ${f.bg} · ${f.path} · “${f.text}”`);
    };
    const screens = [
      { name: "stüdyo", layout: null, hover: true, extra: true },
      { name: "parçacıklar", layout: boardLayout(types), hover: true },
      { name: "parçacıklar · dolu (tema)", layout: boardLayout(types.map((x) => ({ ...x, o: { wc: "theme", ws: "fill" } }))) },
      { name: "parçacıklar · çerçeve (sarı)", layout: boardLayout(types.map((x) => ({ ...x, o: { wc: "#eab308", ws: "outline" } }))) },
      { name: "parçacıklar · yumuşak (mavi)", layout: boardLayout(types.map((x) => ({ ...x, o: { wc: "#2563eb", ws: "soft" } }))) },
      { name: "parçacıklar · dolu (sarı)", layout: boardLayout(types.map((x) => ({ ...x, o: { wc: "#eab308", ws: "fill" } }))) },
      { name: "müzik çalar", layout: panelLayout("muzikCalar") },
    ];
    try {
      for (const sc of screens) {
        const ctx = await browser.newContext({ viewport: { width: 1500, height: 940 }, deviceScaleFactor: 1 });
        await ctx.addInitScript(studioMock, { layout: sc.layout });
        await ctx.addInitScript((t) => localStorage.setItem("studio.settings.v1", JSON.stringify({ view: { scale: 100, hints: true, tooltips: true, theme: t } })), theme);
        const page = await ctx.newPage();
        await page.goto(url);
        await page.waitForSelector(".studio", { timeout: 20000 });
        await page.waitForTimeout(2000);
        assert.equal(await page.evaluate(() => document.documentElement.dataset.stTone), "light");
        await run(page, sc.name);
        if (sc.hover) { await forceHover(page, true); await run(page, `${sc.name} (üzerine gelince)`); await forceHover(page, false); }
        if (SHOTS && (sc.name === "stüdyo" || sc.name.startsWith("parçacıklar"))) await page.screenshot({ path: path.join(SHOTS, `light-after-${theme}-${sc.name.replace(/[^a-zçğıöşü]+/gi, "-")}.png`) });
        if (sc.extra) {
          await page.click(".st-ccbtn");
          await page.waitForTimeout(600);
          await run(page, "kontrol merkezi");
          for (const i of [1, 3]) {
            await page.locator(".cc__list .cc__item").nth(i).click().catch(() => {});
            await page.waitForTimeout(300);
            await run(page, `kontrol merkezi #${i}`);
          }
          await page.click(".st-ccbtn");
          await page.click(".st-gear");
          await page.waitForTimeout(500);
          for (const label of ["Görünüm", "Reji / Maç", "Makrolar", "Klavye kısayolları"]) {
            await page.locator(".st-set__nav button", { hasText: label }).first().click().catch(() => {});
            await page.waitForTimeout(300);
            await run(page, `ayarlar › ${label}`);
          }
        }
        await ctx.close();
      }
    } finally {
      await browser.close();
      server.close();
    }
    assert.ok(checked > 2000, `denetlenen öğe sayısı az: ${checked}`);
    assert.deepEqual([...new Set(fails)].slice(0, 40), [], `${name}: düşük kontrast (${fails.length})`);
  });
}
