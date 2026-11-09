// Yayın Stüdyosu — MÜZİK ÇALAR tıkla-çal ve YouTube oynatma listesi (Playwright / Chromium,
// sahte YouTube IFrame API'si).
//
// Hata (2.22.0 ve öncesi): müzik listesi satırının kendisinde tıklama işleyicisi yoktu (yalnız küçük
// ▶ / ⏭ simgeleri çalıyordu); satırın büyük kısmını parça adı <input>'u kaplıyordu (tık = metin
// düzenleme) ve satır bütünüyle draggable olduğundan basılı tutulan tık sürüklemeye dönüşüyordu.
// Düzeltme: satıra tek tık = çal (çalarken geçişle), ad kalemle düzenlenir, sürükleme yalnız tutamaktan.
//
// Sınananlar: satıra tık → gizli oynatıcıya loadVideoById (başlangıç saniyesiyle); düğme / tutamak
// tıkı çalmaz; ikinci satıra tık → ikinci (B) oynatıcıda geçiş. Oynatma listesi: list=… bağlantısı
// → IFrame yedeği (cuePlaylist + getPlaylist) ile parçalar, oEmbed başlıkları, varsayılan başlangıç,
// liste parçasına tık, karışık. Ana süreçten açma (başlık + süre).
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

/** Sahte YouTube IFrame API'si + müzik köprüsü (sayfa betiklerinden önce). */
function ytMock({ playlists = {}, mainPlaylist = null }) {
  window.__yt = [];
  window.__ytPlaylists = playlists;
  let seq = 0;
  class Player {
    constructor(mount, opts) {
      this.n = (seq += 1);
      this.opts = opts;
      this.t = 0;
      this.at = 0;
      this.state = -1;
      this.list = null;
      window.__yt.push([this.n, "new"]);
      setTimeout(() => opts.events?.onReady?.({ target: this }), 15);
    }
    rec(m, a) { window.__yt.push([this.n, m, a === undefined ? null : JSON.parse(JSON.stringify(a))]); }
    emit(st) { this.state = st; setTimeout(() => this.opts.events?.onStateChange?.({ data: st, target: this }), 20); }
    loadVideoById(o) { this.rec("loadVideoById", o); this.t = o.startSeconds || 0; this.at = Date.now(); this.emit(1); }
    cueVideoById(o) { this.rec("cueVideoById", o); }
    playVideo() { this.rec("playVideo"); this.at = Date.now(); this.emit(1); }
    pauseVideo() { this.rec("pauseVideo"); this.t = this.getCurrentTime(); this.emit(2); }
    stopVideo() { this.rec("stopVideo"); this.state = 5; }
    seekTo(s) { this.rec("seekTo", s); this.t = s; this.at = Date.now(); }
    setVolume(v) { this.vol = v; }
    mute() {} unMute() {}
    getCurrentTime() { return this.state === 1 ? this.t + (Date.now() - this.at) / 1000 : this.t; }
    getDuration() { return 240; }
    getPlayerState() { return this.state; }
    cuePlaylist(o) { this.rec("cuePlaylist", o); this.list = o.list; }
    getPlaylist() { return window.__ytPlaylists[this.list] || []; }
    destroy() { this.rec("destroy"); }
  }
  window.YT = { Player, PlayerState: { ENDED: 0, PLAYING: 1, PAUSED: 2 } };
  const titles = (id) => `Liste parçası ${id.slice(-2)}`;
  const install = () => {
    if (!window.elitlig?.studio) { setTimeout(install, 0); return; }
    window.elitlig.studio.music = {
      oembed: (url) => Promise.resolve({ ok: true, title: titles(String(url).slice(-11)) }),
      ...(mainPlaylist ? { playlist: (id) => { window.__mainPl = id; return Promise.resolve(mainPlaylist); } } : {}),
    };
  };
  install();
}

const LAYOUT = (() => {
  const leaf = (id, views) => ({ type: "leaf", data: { views, activeView: views[0], id }, size: 900 });
  const panel = (id, kind, title, opts = {}) => ({ id, contentComponent: "studio", title, params: { kind, opts } });
  return {
    v: 1, rev: 2,
    dock: { grid: { root: { type: "branch", data: [leaf("g1", ["muzikCalar"]), { ...leaf("g2", ["board~mu"]), size: 600 }], size: 900 }, width: 1500, height: 900, orientation: "HORIZONTAL" }, panels: { muzikCalar: panel("muzikCalar", "muzikCalar", "Müzik çalar"), "board~mu": panel("board~mu", "board", "Müzik düğmeleri", { board: "mu" }) }, activeGroup: "g1" },
    boards: { rail: { title: "Kısayollar", cols: 2, rowH: 40, items: [] }, mu: { title: "Müzik düğmeleri", cols: 6, rowH: 40, items: [{ i: "w1", t: "w:musicPlaylist", x: 0, y: 0, w: 4, h: 4 }, { i: "w2", t: "w:musicNext", x: 4, y: 0, w: 2, h: 2 }] } },
    removed: [], mins: {}, preset: null, autoHide: true,
  };
})();
const MUSIC = {
  volume: 70, crossfadeMs: 2000, curve: "equal", fadeOutMs: 1000, repeat: "all", autoNext: true, toAir: false,
  tracks: [
    { id: "mu_a", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", title: "Stadyum girişi", start: 12, volume: 100 },
    { id: "mu_b", url: "https://youtu.be/aaaaaaaaaaa", title: "Devre arası", start: 65, volume: 80 },
    { id: "mu_c", url: "https://youtu.be/bbbbbbbbbbb", title: "Isınma", start: 0, volume: 90 },
  ],
};
const loads = (page) => page.evaluate(() => window.__yt.filter((c) => c[1] === "loadVideoById").map((c) => ({ player: c[0], ...c[2] })));
async function waitFor(fn, ms = 6000) {
  const t0 = Date.now();
  for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) return v; await new Promise((r) => setTimeout(r, 100)); }
}

async function open(browser, url, mockArgs, music = MUSIC) {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 940 }, deviceScaleFactor: 1, permissions: ["camera", "microphone"] });
  await ctx.addInitScript(studioMock, { YT: false, layout: LAYOUT });
  await ctx.addInitScript((m) => localStorage.setItem("studio.music.v1", JSON.stringify(m)), music);
  await ctx.addInitScript(ytMock, mockArgs);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(url);
  await page.waitForSelector(".mu-panel", { timeout: 20000 });
  return { ctx, page, errors };
}

test("müzik çalar: satıra tık çalar, düğmeler çalmaz; oynatma listesi açılır ve çalar", { skip: (!PW && "Playwright yok") || (!HAS_DIST && "renderer/dist yok (npm run build)"), timeout: 180000 }, async () => {
  const server = await serve();
  const url = `http://127.0.0.1:${server.address().port}/index.html`;
  const browser = await PW.chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required", "--use-fake-ui-for-media-stream"] });
  try {
    /* 1) tıkla-çal */
    {
      const ids = Array.from({ length: 6 }, (_, i) => `plvideo00${i}`.slice(0, 9) + String(i).padStart(2, "0"));
      const { ctx, page, errors } = await open(browser, url, { playlists: { PLtestlist0001: ids } });
      const rowB = page.locator('.mu-tr[data-track="mu_b"]');
      await rowB.locator(".mu-tr__fav, .mu-fav").first().click(); // sık kullanılan: çalmaz
      await rowB.locator(".mu-tr__grip").click(); // tutamak: çalmaz
      await page.waitForTimeout(400);
      assert.equal((await loads(page)).length, 0, "düğme / tutamak tıkı çalmamalı");
      await rowB.locator(".mu-tr__main small").click(); // satırın boş yeri
      const l1 = await waitFor(async () => (await loads(page)).length >= 1 && loads(page));
      assert.ok(l1 && l1.length >= 1, "satır tıkı oynatıcıya loadVideoById göndermeli");
      assert.deepEqual({ videoId: l1[0].videoId, startSeconds: l1[0].startSeconds }, { videoId: "aaaaaaaaaaa", startSeconds: 65 });
      await waitFor(() => page.locator('.mu-tr.is-cur[data-track="mu_b"]').count());
      assert.equal(await page.locator('.mu-tr.is-cur[data-track="mu_b"]').count(), 1);
      // başlığa tık (eskiden düzenleme alanıydı) → geçişle diğer oynatıcıda
      await page.locator('.mu-tr[data-track="mu_c"] .mu-tr__t').click();
      const l2 = await waitFor(async () => { const l = await loads(page); return l.length >= 2 && l; });
      assert.equal(l2[1].videoId, "bbbbbbbbbbb");
      assert.notEqual(l2[1].player, l2[0].player, "geçiş ikinci (B) oynatıcıda olmalı");
      await waitFor(async () => /Geçiş|Çalıyor/.test(await page.locator(".mu-now__status").first().innerText()));
      // çalan satıra tık: duraklat
      await page.waitForTimeout(2300);
      await page.locator('.mu-tr[data-track="mu_c"] .mu-tr__main small').click();
      await waitFor(async () => (await page.locator(".mu-now__status").first().innerText()) === "Duraklatıldı");
      assert.equal(await page.locator(".mu-now__status").first().innerText(), "Duraklatıldı");

      /* 2) oynatma listesi: IFrame yedeği (köprüde playlist yok) */
      await page.locator(".gm-add__url").fill("https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLtestlist0001");
      await page.locator('.gm-add input[aria-label="Başlangıç"]').fill("0:07");
      await page.locator(".gm-add button", { hasText: "Listeyi ekle" }).click();
      await waitFor(() => page.locator(".mu-pi").count().then((n) => n === 6));
      assert.equal(await page.locator(".mu-pi").count(), 6, "liste parçaları açılmalı");
      const cue = await page.evaluate(() => window.__yt.find((c) => c[1] === "cuePlaylist"));
      assert.deepEqual(cue[2], { list: "PLtestlist0001", listType: "playlist", index: 0 });
      await waitFor(async () => (await page.locator(".mu-pi").nth(1).innerText()).includes("Liste parçası"));
      assert.match(await page.locator(".mu-pi").nth(1).innerText(), /Liste parçası 01/);
      const before = (await loads(page)).length;
      await page.locator(".mu-pi").nth(1).locator(".mu-pi__t").click();
      const l3 = await waitFor(async () => { const l = await loads(page); return l.length > before && l; });
      assert.deepEqual({ videoId: l3.at(-1).videoId, startSeconds: l3.at(-1).startSeconds }, { videoId: ids[1], startSeconds: 7 });
      await waitFor(async () => /1\.?\s*|2\/6/.test(await page.locator(".mu-now__idx").first().innerText()));
      assert.match(await page.locator(".mu-now__idx").first().innerText(), /2\/6/);
      // parçaya özel başlangıç
      await page.locator(".mu-pi").nth(2).locator('input[aria-label^="Başlangıç"]').fill("1:00");
      await page.locator(".mu-pi").nth(2).locator('input[aria-label^="Başlangıç"]').press("Enter");
      await page.waitForTimeout(2300); // geçiş bitsin
      await page.locator(".wmu-pl button[title='Sonraki (geçişle)']").click();
      const l4 = await waitFor(async () => { const l = await loads(page); return l.length > l3.length && l; });
      assert.deepEqual({ videoId: l4.at(-1).videoId, startSeconds: l4.at(-1).startSeconds }, { videoId: ids[2], startSeconds: 60 });
      // karışık
      await page.locator(".mu-pl__seg button", { hasText: "Karışık" }).click();
      const order = await page.evaluate(() => JSON.parse(localStorage.getItem("studio.music.v1")).tracks.find((t) => t.kind === "playlist").order);
      assert.equal(order, "shuffle");
      assert.deepEqual(errors, []);
      await ctx.close();
    }
    /* 3) ana süreçten açma: başlık + süre */
    {
      const main = { ok: true, title: "Tribün marşları", source: "page", more: false, items: [{ videoId: "ccccccccccc", title: "Marş bir", durationSec: 125 }, { videoId: "ddddddddddd", title: "Marş iki", durationSec: 61 }] };
      const { ctx, page, errors } = await open(browser, url, { mainPlaylist: main }, { ...MUSIC, tracks: [] });
      await page.locator(".gm-add__url").fill("https://music.youtube.com/playlist?list=PLmainlist0002");
      await page.locator(".gm-add button", { hasText: "Listeyi ekle" }).click();
      await waitFor(() => page.locator(".mu-pi").count().then((n) => n === 2));
      assert.equal(await page.evaluate(() => window.__mainPl), "PLmainlist0002");
      assert.match(await page.locator(".mu-pl__head").innerText(), /Tribün marşları/);
      assert.match(await page.locator(".mu-pi").first().innerText(), /Marş bir[\s\S]*2:05/);
      assert.equal(await page.evaluate(() => window.__yt.filter((c) => c[1] === "cuePlaylist").length), 0, "ana süreç yetince IFrame yedeği kullanılmaz");
      // liste başlığına tık: listeyi sırayla ilk parçadan çal
      await page.locator(".mu-pl__head .mu-tr__main small").click();
      const l = await waitFor(async () => { const x = await loads(page); return x.length && x; });
      assert.equal(l[0].videoId, "ccccccccccc");
      assert.deepEqual(errors, []);
      await ctx.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
});
