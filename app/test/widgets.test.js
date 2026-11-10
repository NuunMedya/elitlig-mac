"use strict";
// Masaüstü widget'ları (app/widgets): katalog / kayıt / yerleşim (saf), hava ve maç ayrıştırma,
// işlemci ölçümü ve sahte Electron ile pencere yönetimi (ekle, ayarla, gizle, kaldır, geri yükle).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { EventEmitter } = require("node:events");
const C = require("../widgets/catalog");
const F = require("../widgets/feeds");
const { cpuPercent } = require("../widgets/system");
const { registerWidgets } = require("../widgets");

test("katalog: 11 tür, her birinin küçük ve orta boyutu var", () => {
  assert.deepEqual(C.CATALOG.map((c) => c.type), ["clock", "agenda", "todos", "note", "music", "clipboard", "timer", "system", "weather", "matches", "rates"]);
  for (const c of C.CATALOG) for (const s of ["small", "medium"]) assert.ok(c.sizes[s][0] >= 150 && c.sizes[s][1] >= 90, `${c.type} ${s}`);
});

test("kayıt süzülür: bilinmeyen tür / kimlik atılır, değerler sınırlanır, seçenekler temizlenir", () => {
  const s = C.normalizeStore({
    visible: false, theme: "mor",
    items: [
      { id: "abc123", type: "clock", x: 10.6, y: "20", size: "huge", opacity: 5, level: "uzay", options: { zones: ["Europe/London", "x; rm -rf", "America/New_York"], seconds: 1 } },
      { id: "abc123", type: "clock" }, // aynı kimlik
      { id: "zzz999", type: "bilinmez" },
      { id: "../..", type: "todos" },
      { id: "rate01", type: "rates", options: { codes: ["usd", "TRY", "EURO", "gbp"] } },
      { id: "wthr01", type: "weather", options: { city: "  " } },
    ],
  });
  assert.equal(s.visible, false);
  assert.equal(s.theme, "auto");
  assert.equal(s.items.length, 3);
  const [clock, rates, weather] = s.items;
  assert.deepEqual({ x: clock.x, y: clock.y, size: clock.size, opacity: clock.opacity, level: clock.level }, { x: 11, y: 20, size: "small", opacity: 30, level: "normal" });
  assert.deepEqual(clock.options, { zones: ["Europe/London", "America/New_York"], seconds: true });
  assert.deepEqual(rates.options.codes, ["USD", "GBP"], "TRY ve geçersiz kod atılır");
  assert.equal(weather.options.city, "Ankara", "boş şehir → varsayılan");
});

test("yerleşim: yeni widget sağ üstten boşluğa; ekran çıkarılınca görünür alana çekilir", () => {
  const wa = { x: 0, y: 25, width: 1440, height: 875 };
  const a = C.placeNew({ width: 200, height: 120 }, [], wa);
  assert.deepEqual(a, { x: 1440 - 16 - 200, y: 25 + 16 });
  const b = C.placeNew({ width: 200, height: 120 }, [{ ...a, width: 200, height: 120 }], wa);
  assert.equal(b.x, a.x);
  assert.ok(b.y >= a.y + 120 + 16, "altına");
  // sütun dolunca sola geçer
  const col = Array.from({ length: 6 }, (_, i) => ({ x: a.x, y: 41 + i * 140, width: 200, height: 120 }));
  const c = C.placeNew({ width: 200, height: 120 }, col, wa);
  assert.ok(c.x < a.x);
  const displays = [{ workArea: { x: 0, y: 25, width: 1440, height: 875 } }];
  assert.deepEqual(C.clampToDisplays({ x: 100, y: 100, width: 200, height: 120 }, displays), { x: 100, y: 100 }, "görünürse dokunulmaz");
  assert.deepEqual(C.clampToDisplays({ x: 3000, y: 200, width: 200, height: 120 }, displays), { x: 1240, y: 200 }, "çıkarılan ikinci ekrandan geri");
  assert.deepEqual(C.clampToDisplays({ x: 50, y: -400, width: 200, height: 120 }, displays), { x: 50, y: 25 }, "menü çubuğunun üstüne kaçmaz");
});

test("hava durumu: Open-Meteo ve wttr.in yanıtları ortak biçime", () => {
  const om = F.parseOpenMeteo({ current: { temperature_2m: 6.4, weather_code: 61, relative_humidity_2m: 80, wind_speed_10m: 12.2, is_day: 0 }, daily: { time: ["2026-11-10", "2026-11-11"], temperature_2m_max: [8.6, 11], temperature_2m_min: [-1.5, 0], weather_code: [3, 0] } }, "Ankara");
  assert.deepEqual({ t: om.temp, k: om.kind, txt: om.text, day: om.isDay }, { t: 6, k: "rain", txt: "Yağmurlu", day: false });
  assert.deepEqual(om.days.map((d) => d.kind), ["cloudy", "clear"]);
  assert.equal(F.parseOpenMeteo({ error: true, reason: "limit" }), null);
  const wt = F.parseWttr({ current_condition: [{ temp_C: "6", weatherCode: "122", lang_tr: [{ value: "Kapalı" }], humidity: "59", windspeedKmph: "10" }], weather: [{ date: "2026-11-10", maxtempC: "6", mintempC: "-2", hourly: [{}, {}, {}, {}, { weatherCode: "317" }] }], nearest_area: [{ areaName: [{ value: "Ankara" }] }] }, "Ankara");
  assert.deepEqual({ t: wt.temp, k: wt.kind, txt: wt.text }, { t: 6, k: "cloudy", txt: "Kapalı" });
  assert.equal(wt.days[0].kind, "snow");
  assert.equal(F.wmoKind(95), "storm");
  assert.equal(F.wwoKind(113), "clear");
});

test("maçlar: canlı + fikstür, geçmiş fikstür atılır, şehir süzgeci Türkçe harf duyarsız", () => {
  const now = new Date(2026, 10, 10, 18, 0).getTime();
  const live = [{ id: 1, first_team_name: "A", second_team_name: "B", first_team_score: 2, second_team_score: 1, date: "2026-11-10T00:00:00.000Z", time: "17:30:00", city: "Ankara" }];
  const fx = [
    { id: 5, first_team_name: "Eski", second_team_name: "Maç", date: "2026-02-13T00:00:00.000Z", time: "20:00:00", city: "Ankara" },
    { id: 7, first_team_name: "İzmir FK", second_team_name: "C", date: "2026-11-11T00:00:00.000Z", time: "21:00:00", city: "İzmir" },
    { id: 6, first_team_name: "D", second_team_name: "E", date: "2026-11-10T00:00:00.000Z", time: "20:30:00", city: "Ankara", match_field: "Ostim" },
  ];
  const all = F.parseMatches(live, fx, { now });
  assert.equal(all.live[0].homeScore, 2);
  assert.deepEqual(all.upcoming.map((m) => m.id), [6, 7], "eski fikstür yok, tarihe göre");
  assert.equal(new Date(all.upcoming[0].start).getHours(), 20);
  const izmir = F.parseMatches(live, fx, { now, city: "izmir" });
  assert.deepEqual(izmir.upcoming.map((m) => m.id), [7]);
  assert.equal(izmir.live.length, 0);
  assert.equal(F.matchStart({ date: "bozuk" }), null);
});

test("hava/maç getirici: önbellek, yedek kaynak, çevrimdışı son veri", async () => {
  let calls = [];
  let offline = false;
  const net = { fetch: async (url) => {
    calls.push(url);
    if (offline) throw new Error("ağ yok");
    if (url.includes("geocoding")) return { ok: true, json: async () => ({ results: [{ name: "Ankara", latitude: 39.9, longitude: 32.8 }] }) };
    if (url.includes("api.open-meteo")) return { ok: false, status: 429, json: async () => ({}) }; // günlük sınır
    if (url.includes("wttr.in")) return { ok: true, json: async () => ({ current_condition: [{ temp_C: "4", weatherCode: "113", humidity: "50", windspeedKmph: "5" }], weather: [] }) };
    if (url.includes("/maclar/live")) return { ok: true, json: async () => [] };
    if (url.includes("/maclar/fixtures")) return { ok: true, json: async () => [{ id: 9, first_team_name: "X", second_team_name: "Y", date: "2099-01-01T00:00:00.000Z", time: "20:00:00" }] };
    return { ok: false, status: 404 };
  } };
  const feeds = F.createFeeds({ net, publicOrigin: "https://api.example" });
  const w = await feeds.weather("Ankara");
  assert.equal(w.ok, true);
  assert.equal(w.source, "wttr.in", "Open-Meteo hata verince wttr.in");
  const n = calls.length;
  await feeds.weather("ankara");
  assert.equal(calls.length, n, "önbellekten");
  const m = await feeds.matches({});
  assert.equal(m.ok, true);
  assert.equal(m.upcoming[0].id, 9);
  assert.ok(calls.some((u) => u.startsWith("https://api.example/maclar/fixtures?") && u.includes("date_from=")));
  offline = true;
  const none = await feeds.weather("İzmir");
  assert.equal(none.ok, false);
});

test("işlemci yüzdesi iki örnekten", () => {
  const a = [{ times: { user: 100, nice: 0, sys: 100, idle: 800, irq: 0 } }];
  const b = [{ times: { user: 150, nice: 0, sys: 150, idle: 900, irq: 0 } }];
  assert.equal(cpuPercent(a, b), 50);
  assert.equal(cpuPercent(a, a), null);
  assert.equal(cpuPercent(a, [...b, ...b]), null);
});

/* ------------------------------ sahte Electron ------------------------------ */

function harness({ stored = null, displays = null } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "widgets-"));
  if (stored) fs.writeFileSync(path.join(dir, "widgets.json"), JSON.stringify(stored));
  const handlers = new Map();
  const windows = [];
  let wcId = 0;
  class FakeWin extends EventEmitter {
    constructor(opts) {
      super();
      this.opts = opts;
      this.bounds = { x: opts.x, y: opts.y, width: opts.width, height: opts.height };
      this.visible = false;
      this.destroyed = false;
      this.movable = opts.movable !== false;
      this.top = Boolean(opts.alwaysOnTop);
      this.sent = [];
      wcId += 1;
      this.webContents = Object.assign(new EventEmitter(), { id: wcId, send: (ch, p) => this.sent.push({ ch, p }) });
      windows.push(this);
    }
    isDestroyed() { return this.destroyed; }
    destroy() { this.destroyed = true; this.emit("closed"); }
    showInactive() { this.visible = true; }
    hide() { this.visible = false; }
    isVisible() { return this.visible; }
    getBounds() { return { ...this.bounds }; }
    setBounds(b) { this.bounds = { ...b }; }
    setMovable(v) { this.movable = v; }
    setAlwaysOnTop(v) { this.top = v; }
    setVisibleOnAllWorkspaces() { this.allSpaces = true; }
    setHiddenInMissionControl() {}
    static fromWebContents(wc) { return windows.find((w) => w.webContents === wc) || null; }
  }
  const loaded = [];
  const shown = [];
  const broadcasts = [];
  const menus = [];
  const musicFns = [];
  const scr = displays || [{ id: 1, bounds: { x: 0, y: 0, width: 1440, height: 900 }, workArea: { x: 0, y: 25, width: 1440, height: 875 } }];
  const app = Object.assign(new EventEmitter(), { getPath: () => dir });
  const w = registerWidgets({
    app, BrowserWindow: FakeWin,
    ipcMain: { handle: (ch, fn) => handlers.set(ch, fn) },
    Menu: { buildFromTemplate: (t) => ({ popup: () => menus.push(t) }) },
    screen: { getAllDisplays: () => scr, getPrimaryDisplay: () => scr[0] },
    net: { fetch: async () => { throw new Error("çevrimdışı"); } },
    nativeTheme: new EventEmitter(),
    loadRenderer: (win, hash) => { loaded.push(hash); setImmediate(() => win.emit("ready-to-show")); },
    webPreferences: () => ({}), guardNavigation: () => {},
    showMain: (r) => shown.push(r), broadcast: (ch, p) => broadcasts.push({ ch, p }),
    deskkit: { settings: () => ({ widgets: { shortcut: "Control+Alt+W" } }), getRates: async () => ({ ok: true, rates: { EUR: 1, TRY: 50 } }), onMusicState: (fn) => musicFns.push(fn) },
    publicOrigin: "https://api.example", isMac: true, platform: "darwin",
  });
  const invoke = (ch, sender, ...args) => handlers.get(ch)({ sender: sender || {} }, ...args);
  const tick = () => new Promise((r) => setImmediate(r));
  return { w, dir, windows, loaded, shown, broadcasts, menus, musicFns, invoke, tick, app };
}

test("widget ekle: çerçevesiz, şeffaf, görev çubuğunda yok, tüm masaüstlerinde; kayıt dosyaya yazılır", async () => {
  const h = harness();
  const r = await h.invoke("widgets:add", null, "clock");
  assert.equal(r.ok, true);
  await h.tick();
  const win = h.windows[0];
  assert.equal(win.opts.frame, false);
  assert.equal(win.opts.transparent, true);
  assert.equal(win.opts.skipTaskbar, true);
  assert.equal(win.opts.resizable, false);
  assert.equal(win.allSpaces, true, "macOS: tüm Spaces");
  assert.equal(win.visible, true, "odak çalmadan gösterilir");
  assert.match(h.loaded[0], /^widget=clock&id=[a-z0-9]+$/);
  const saved = JSON.parse(fs.readFileSync(path.join(h.dir, "widgets.json"), "utf8"));
  assert.equal(saved.items[0].type, "clock");
  assert.deepEqual({ x: saved.items[0].x, y: saved.items[0].y }, { x: 1440 - 16 - 200, y: 41 });
  assert.ok(h.broadcasts.some((b) => b.ch === "widgets:changed"));
  assert.equal((await h.invoke("widgets:add", null, "yok")).ok, false);
  // widget penceresi kendi kaydını sorar
  const self = await h.invoke("widgets:self", win.webContents);
  assert.equal(self.item.id, r.item.id);
});

test("widget ayarla: boyut, kilit, üstte sabit, masaüstüne göm (pencere yeniden kurulur), seçenekler", async () => {
  const h = harness();
  const { item } = await h.invoke("widgets:add", null, "weather");
  await h.tick();
  const win = h.windows[0];
  await h.invoke("widgets:update", null, item.id, { size: "medium", locked: true, level: "top", opacity: 70, options: { city: "İzmir" } });
  assert.deepEqual([win.bounds.width, win.bounds.height], [280, 230]);
  assert.equal(win.movable, false);
  assert.equal(win.top, true);
  const cfg = win.sent.filter((s) => s.ch === "widget:config").at(-1).p;
  assert.equal(cfg.item.options.city, "İzmir");
  assert.equal(cfg.item.opacity, 70);
  await h.invoke("widgets:update", null, item.id, { level: "desktop" });
  assert.equal(win.destroyed, true, "masaüstü düzeyi pencere türüyle kurulur");
  const w2 = h.windows[1];
  assert.equal(w2.opts.type, "desktop");
  assert.equal(w2.opts.focusable, false);
  // konum: taşınınca kaydedilir
  w2.bounds = { ...w2.bounds, x: 500, y: 300 };
  w2.emit("moved");
  await new Promise((r) => setTimeout(r, 650));
  const saved = JSON.parse(fs.readFileSync(path.join(h.dir, "widgets.json"), "utf8"));
  assert.deepEqual([saved.items[0].x, saved.items[0].y], [500, 300]);
});

test("göster/gizle, kaldır, menü ve geri yükleme", async () => {
  const h = harness();
  const a = await h.invoke("widgets:add", null, "system");
  const b = await h.invoke("widgets:add", null, "todos");
  await h.tick();
  await h.invoke("widgets:toggle");
  assert.ok(h.windows.every((w) => !w.visible));
  assert.equal(h.w.visible(), false);
  await h.invoke("widgets:toggle");
  assert.ok(h.windows.every((w) => w.visible));
  // yerel menü: boyut / saydamlık / katman / kilit / kaldır
  await h.invoke("widgets:menu", h.windows[0].webContents);
  const labels = h.menus[0].map((i) => i.label);
  for (const l of ["Boyut", "Arka plan saydamlığı", "Katman", "Kilitle (sürüklenmez)", "Bu widget'ı kaldır"]) assert.ok(labels.includes(l), l);
  h.menus[0].find((i) => i.label === "Boyut").submenu[1].click();
  assert.equal(h.w.list()[0].size, "medium");
  await h.invoke("widgets:remove", null, b.item.id);
  assert.equal(h.w.list().length, 1);
  assert.equal(h.windows[1].destroyed, true);
  // müzik durumu yalnız müzik widget'larına gider
  await h.invoke("widgets:add", null, "music");
  await h.tick();
  h.musicFns[0]({ status: "playing", title: "x" });
  assert.ok(h.windows[2].sent.some((s) => s.ch === "music:state"));
  assert.ok(!h.windows[0].sent.some((s) => s.ch === "music:state"));
  // kur: deskkit'ten
  assert.equal((await h.invoke("widgets:rates", null, false)).rates.TRY, 50);
  // hiç widget yokken kısayol galeriyi açar
  const empty = harness();
  empty.w.toggleAll();
  assert.equal(empty.shown.at(-1), "toolkit:widgets");
  void a;
});

test("açılışta geri yükleme: kayıtlı konum; çıkarılmış ekrandaki widget görünür alana", async () => {
  const h = harness({ stored: { visible: true, theme: "dark", items: [
    { id: "aaa111", type: "clock", x: 100, y: 200, size: "medium", level: "top" },
    { id: "bbb222", type: "rates", x: 2600, y: 300 }, // ikinci ekran artık yok
  ] } });
  h.w.restore();
  await h.tick();
  assert.equal(h.windows.length, 2);
  assert.deepEqual([h.windows[0].bounds.x, h.windows[0].bounds.y, h.windows[0].bounds.width], [100, 200, 280]);
  assert.equal(h.windows[0].opts.alwaysOnTop, true);
  assert.equal(h.windows[1].bounds.x, 1440 - 210);
  assert.ok(h.windows.every((w) => w.visible));
  const hidden = harness({ stored: { visible: false, items: [{ id: "ccc333", type: "clock", x: 10, y: 40 }] } });
  hidden.w.restore();
  await hidden.tick();
  assert.equal(hidden.windows[0].visible, false, "gizli bırakıldıysa gizli açılır");
});
