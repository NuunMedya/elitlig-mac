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

test("katalog: 28 tür (eski 11 tür korunur, 17 yeni), kategorisi ve macOS boyut ailesinden boyutları var", () => {
  const types = C.CATALOG.map((c) => c.type);
  for (const t of ["clock", "agenda", "todos", "note", "music", "clipboard", "timer", "system", "weather", "matches", "rates"]) assert.ok(types.includes(t), t);
  for (const t of ["messages", "requests", "projects", "ledger", "equipment", "today", "contacts", "notes", "quickadd", "focus", "week", "month", "livematch", "standings", "studio", "launcher", "dock"]) assert.ok(types.includes(t), t);
  assert.equal(new Set(types).size, types.length);
  const cats = new Set(C.CATEGORIES.map((c) => c.key));
  for (const c of C.CATALOG) {
    assert.ok(cats.has(c.category), `${c.type} kategori`);
    // Araç çubuğu (dock) ızgara dışı yatay şerittir; diğerleri standart boyut ailesinden seçer.
    if (c.bar) { assert.deepEqual(Object.keys(c.sizes), ["small", "medium"]); continue; }
    assert.ok(Object.keys(c.sizes).length >= 1, c.type);
    for (const [k, dims] of Object.entries(c.sizes)) assert.deepEqual(dims, C.SIZE_DIMS[k], `${c.type} ${k}`);
  }
  assert.deepEqual(C.SIZE_DIMS, { small: [170, 170], medium: [364, 170], large: [364, 364], xlarge: [752, 364] });
  // standart boyutlar ızgara hücresinin katlarıdır (170 + 24 aralık)
  for (const [w, h] of Object.values(C.SIZE_DIMS)) for (const v of [w, h]) assert.equal((v + C.GRID.gap) % (C.GRID.unit + C.GRID.gap), 0);
  for (const t of ["messages", "projects", "ledger", "agenda", "todos", "clock", "weather", "matches"]) assert.ok(Object.keys(C.catalogOf(t).sizes).length >= 2, `${t}: en az 2 boyut`);
  {
  }
  assert.ok(C.WITH_SETTINGS.has("messages") && C.WITH_SETTINGS.has("standings") && !C.WITH_SETTINGS.has("system"));
});

test("yeni widget seçenekleri süzülür", () => {
  assert.deepEqual(C.normalizeOptions("messages", { source: "x" }), { source: "all", reply: true });
  assert.deepEqual(C.normalizeOptions("messages", { source: "inbox", reply: 0 }), { source: "inbox", reply: false });
  assert.deepEqual(C.normalizeOptions("todos", { filter: "overdue", project: "7" }), { filter: "overdue", project: 7 });
  assert.deepEqual(C.normalizeOptions("todos", { filter: "drop table", project: -1 }), { filter: "today", project: null });
  assert.deepEqual(C.normalizeOptions("livematch", { matchId: "11152", label: "A – B" }), { matchId: 11152, label: "A – B" });
  assert.equal(C.normalizeOptions("livematch", { matchId: "1; x" }).matchId, null);
  assert.deepEqual(C.normalizeOptions("standings", { leagueId: 1, seasonId: 160.4, leagueName: "FREELİG" }), { leagueId: 1, seasonId: 160, leagueName: "FREELİG", team: "" });
  assert.deepEqual(C.normalizeOptions("launcher", { tools: ["projects", "todos", "projects", "../x", "Ledger"] }), { tools: ["projects", "todos"] });
  assert.deepEqual(C.normalizeOptions("dock", {}), { tools: null });
});

test("canlı maç / lig / puan durumu ayrıştırma", () => {
  const now = new Date(2026, 10, 10, 22, 0).getTime();
  const live = F.parseMatchRow({ id: 5, first_team_name: " A FC ", second_team_name: "B", first_team_score: 2, second_team_score: "1", mac_durumu: "canli", date: "2026-11-10T00:00:00.000Z", time: "21:00:00", league_name: "L", city: "Ankara" }, now);
  assert.equal(live.state, "live");
  assert.equal(live.home, "A FC");
  assert.deepEqual([live.homeScore, live.awayScore], [2, 1]);
  const fx = F.parseMatchRow({ id: 6, first_team_name: "A", second_team_name: "B", first_team_score: null, mac_durumu: "", is_it_fixture: true, date: "2026-11-11T00:00:00.000Z", time: "20:00:00" }, now);
  assert.equal(fx.state, "fixture");
  assert.equal(fx.homeScore, null);
  assert.equal(fx.startsIn, 22 * 60);
  assert.equal(F.parseMatchRow({ id: 7, is_it_fixture: false, first_team_score: 0, second_team_score: 3 }).state, "done");
  assert.equal(F.parseMatchRow(null), null);
  const leagues = F.parseLeagues([{ id: 2, league_name: "B Lig", city: "İzmir" }, { id: 1, league_name: "A Lig", city: "Ankara" }, { id: 3, league_name: "Eski", city: "Ankara", is_archived: true }]);
  assert.deepEqual(leagues.map((l) => l.id), [1, 2]);
  const season = F.currentSeason([{ id: 84, league_id: 1, season_priority: 3, season_year: "2025" }, { id: 160, league_id: 1, season_priority: 1, season_year: "2026", season_name: "15. SEZON" }, { id: 9, league_id: 2, season_priority: 1 }, { id: 200, league_id: 1, season_priority: 0, is_archived: true }], 1);
  assert.equal(season.id, 160);
  assert.equal(F.currentSeason([], 1), null);
  const rows = F.parseStandings([
    { team_name: "C", display_points: 52, goal_diff: 103 }, { team_name: "A", display_points: 94, goal_diff: 142 },
    { team_name: "B", display_points: 55, goal_diff: 94 }, { team_name: "D", total_points: 55, goal_diff: 90, goals_for: 1 }, { team_name: "" },
  ]);
  assert.deepEqual(rows.map((r) => [r.rank, r.team, r.points]), [[1, "A", 94], [2, "B", 55], [3, "D", 55], [4, "C", 52]]);
});

test("Yayın Stüdyosu durumu özeti", () => {
  const { studioStatus } = require("../widgets");
  assert.deepEqual(studioStatus(null), { ok: true, available: false });
  const idle = studioStatus({ engine: { status: () => ({ state: "stopped" }), active: () => false } });
  assert.equal(idle.active, false);
  assert.equal(idle.state, "idle");
  const on = studioStatus({ engine: { status: () => ({ state: "live", recordOnly: false, outTimeMs: 65000, bitrateKbps: 4500, fps: 30, rtmp: "up" }), active: () => true }, led: { status: () => ({ open: true }) } });
  assert.equal(on.onAir, true);
  assert.equal(on.durationMs, 65000);
  assert.equal(on.bitrateKbps, 4500);
  assert.equal(on.led, true);
  const rec = studioStatus({ engine: { status: () => ({ state: "live", recordOnly: true, bitrateKbps: null }), active: () => true } });
  assert.equal(rec.onAir, false);
  assert.equal(rec.bitrateKbps, null);
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
  assert.deepEqual({ x: clock.x, y: clock.y, size: clock.size, opacity: clock.opacity, level: clock.level }, { x: 11, y: 20, size: "small", opacity: 30, level: "desktop" });
  assert.deepEqual(clock.options, { zones: ["Europe/London", "America/New_York"], seconds: true });
  assert.deepEqual(rates.options.codes, ["USD", "GBP"], "TRY ve geçersiz kod atılır");
  assert.equal(weather.options.city, "Ankara", "boş şehir → varsayılan");
});

test("sürüm 1 kaydından geçiş: eski gömülü → embed, eski normal → masaüstü katmanı; desteklenmeyen boyut → varsayılan", () => {
  const s = C.normalizeStore({ items: [
    { id: "aaa111", type: "clock", level: "desktop" },
    { id: "bbb222", type: "todos", level: "normal" },
    { id: "ccc333", type: "todos", level: "top" },
    { id: "ddd444", type: "quickadd", size: "small" },
  ] });
  assert.equal(s.v, 2);
  assert.deepEqual(s.items.map((i) => i.level), ["embed", "desktop", "top", "desktop"]);
  assert.equal(s.items[3].size, "medium", "hızlı kayıt yalnız orta");
  assert.deepEqual({ grid: s.grid, dim: s.dim, material: s.material, atLogin: s.atLogin }, { grid: true, dim: false, material: "auto", atLogin: false });
  // sürüm 2 kaydı olduğu gibi kalır
  const s2 = C.normalizeStore({ v: 2, grid: false, dim: true, material: "soft", atLogin: true, items: [{ id: "eee555", type: "clock", level: "normal", disp: { id: 7, rx: 2, ry: 0.5 } }] });
  assert.equal(s2.items[0].level, "normal");
  assert.deepEqual(s2.items[0].disp, { id: 7, rx: 1, ry: 0.5 });
  assert.deepEqual({ grid: s2.grid, dim: s2.dim, material: s2.material, atLogin: s2.atLogin }, { grid: false, dim: true, material: "soft", atLogin: true });
});

test("ızgara: hizalama, çakışmada en yakın boş hücre, yeni widget sağ üstten, oransal konum ve ekran değişimi", () => {
  const wa = { x: 0, y: 25, width: 1440, height: 875 };
  const disp = [{ id: 1, workArea: wa }];
  const small = { width: 170, height: 170 };
  // en yakın hücreye: kenar boşluğu 24, adım 194
  assert.deepEqual(C.snapToGrid({ x: 230, y: 260, ...small }, wa), { x: 24 + 194, y: 25 + 24 + 194 });
  assert.deepEqual(C.snapToGrid({ x: -50, y: 5000, ...small }, wa).x, 24, "ekran içinde kalır");
  // çakışma: dolu hücre yerine en yakın boş
  const occupied = [{ x: 218, y: 243, ...small }];
  const p = C.arrange({ x: 225, y: 250, ...small }, occupied, disp);
  assert.notDeepEqual(p, { x: 218, y: 243 });
  assert.ok(!(p.x < 218 + 170 && 218 < p.x + 170 && p.y < 243 + 170 && 243 < p.y + 170), "çakışmaz");
  assert.ok(Math.abs(p.x - 218) + Math.abs(p.y - 243) <= 194 * 1.01, "komşu hücre");
  // ızgara kapalıyken yalnız ekrana sığdırılır
  assert.deepEqual(C.arrange({ x: 1400, y: 100, ...small }, [], disp, { grid: false }), { x: 1440 - 170, y: 100 });
  // yeni widget: sağ üstteki ilk boş hücre, sonra altı
  const a = C.placeOnGrid(small, [], wa);
  const span = Math.floor((1440 - 48 - 170) / 194);
  assert.deepEqual(a, { x: 24 + span * 194, y: 49 });
  const b = C.placeOnGrid(small, [{ ...a, ...small }], wa);
  assert.deepEqual(b, { x: a.x, y: 49 + 194 });
  // oransal konum: çözünürlük değişince oran korunur ve ızgaraya hizalanır
  const rel = C.relativePos({ x: 24 + 3 * 194, y: 49 + 194, ...small }, disp[0]);
  assert.equal(rel.id, 1);
  const bigger = [{ id: 1, workArea: { x: 0, y: 25, width: 2880, height: 1775 } }];
  const moved = C.resolvePosition({ x: 0, y: 0, disp: rel }, small, bigger);
  assert.ok(moved.x > 24 + 3 * 194, "daha geniş ekranda sağa kayar (oran korunur)");
  assert.equal((moved.x - 24) % 194, 0, "ızgarada");
  // kaydedildiği ekran çıkarıldıysa görünür alana
  const gone = C.resolvePosition({ x: 3000, y: 300, disp: { id: 9, rx: 0.5, ry: 0.5 } }, small, disp);
  assert.ok(gone.x <= 1440 - 170 && gone.x >= 0);
  // ikinci ekranda kalır
  const two = [disp[0], { id: 2, workArea: { x: 1440, y: 0, width: 1920, height: 1080 } }];
  assert.equal(C.displayOf({ x: 1500, y: 100, ...small }, two).id, 2);
  assert.ok(C.arrange({ x: 1500, y: 100, ...small }, [], two).x >= 1440);
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

function harness({ stored = null, displays = null, platform = "darwin", packaged = false } = {}) {
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
    setFocusable(v) { this.focusable = v; }
    focus() { this.focused = true; }
    getNativeWindowHandle() { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(1000 + wcIdOf(this))); return b; }
    setMovable(v) { this.movable = v; }
    setAlwaysOnTop(v) { this.top = v; }
    setVisibleOnAllWorkspaces() { this.allSpaces = true; }
    setHiddenInMissionControl() {}
    static fromWebContents(wc) { return windows.find((w) => w.webContents === wc) || null; }
  }
  const wcIdOf = (win) => win.webContents.id;
  const spawned = [];
  const fakeSpawn = (cmd, args) => { const child = Object.assign(new EventEmitter(), { writes: [], cmd, args, stdin: { write: (t) => { child.writes.push(t); return true; }, end() {} }, stderr: new EventEmitter(), kill() {} }); spawned.push(child); return child; };
  const loginCalls = [];
  const loaded = [];
  const shown = [];
  const broadcasts = [];
  const menus = [];
  const musicFns = [];
  const scr = displays || [{ id: 1, bounds: { x: 0, y: 0, width: 1440, height: 900 }, workArea: { x: 0, y: 25, width: 1440, height: 875 } }];
  const app = Object.assign(new EventEmitter(), { getPath: () => dir, isPackaged: packaged, setLoginItemSettings: (o) => loginCalls.push(o), getLoginItemSettings: () => ({ wasOpenedAtLogin: false }) });
  const screenEv = new EventEmitter();
  const w = registerWidgets({
    app, BrowserWindow: FakeWin,
    ipcMain: { handle: (ch, fn) => handlers.set(ch, fn) },
    Menu: { buildFromTemplate: (t) => ({ popup: () => menus.push(t) }) },
    screen: Object.assign(screenEv, { getAllDisplays: () => scr, getPrimaryDisplay: () => scr[0] }),
    net: { fetch: async () => { throw new Error("çevrimdışı"); } },
    nativeTheme: new EventEmitter(),
    loadRenderer: (win, hash) => { loaded.push(hash); setImmediate(() => win.emit("ready-to-show")); },
    webPreferences: () => ({}), guardNavigation: () => {},
    showMain: (r) => shown.push(r), broadcast: (ch, p) => broadcasts.push({ ch, p }),
    deskkit: { settings: () => ({ widgets: { shortcut: "Control+Alt+W" } }), getRates: async () => ({ ok: true, rates: { EUR: 1, TRY: 50 } }), onMusicState: (fn) => musicFns.push(fn) },
    publicOrigin: "https://api.example", isMac: platform === "darwin", platform, spawn: fakeSpawn,
  });
  const invoke = (ch, sender, ...args) => handlers.get(ch)({ sender: sender || {} }, ...args);
  const tick = () => new Promise((r) => setImmediate(r));
  return { w, dir, windows, loaded, shown, broadcasts, menus, musicFns, invoke, tick, app, scr, screenEv, spawned, loginCalls };
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
  // masaüstü katmanı (varsayılan): üstte değil, tıklayınca odak almaz; macOS cam malzeme
  assert.equal(win.opts.alwaysOnTop, false);
  assert.equal(win.opts.focusable, false);
  assert.equal(win.opts.type, undefined, "etkileşimli kalır (type:desktop değil)");
  assert.equal(win.opts.vibrancy, "popover");
  assert.equal(win.opts.visualEffectState, "active");
  assert.deepEqual([win.opts.width, win.opts.height], [170, 170], "macOS küçük boyut");
  assert.equal(win.allSpaces, true, "macOS: tüm Spaces");
  assert.equal(win.visible, true, "odak çalmadan gösterilir");
  assert.match(h.loaded[0], /^widget=clock&id=[a-z0-9]+$/);
  const saved = JSON.parse(fs.readFileSync(path.join(h.dir, "widgets.json"), "utf8"));
  assert.equal(saved.items[0].type, "clock");
  assert.deepEqual({ x: saved.items[0].x, y: saved.items[0].y }, { x: 24 + 6 * 194, y: 25 + 24 }, "sağ üstteki ilk ızgara hücresi");
  assert.equal(saved.items[0].level, "desktop");
  assert.equal(saved.items[0].disp.id, 1, "ekranı ile kaydedilir");
  assert.equal(saved.v, 2);
  assert.ok(h.broadcasts.some((b) => b.ch === "widgets:changed"));
  assert.equal((await h.invoke("widgets:add", null, "yok")).ok, false);
  // widget penceresi kendi kaydını sorar
  const self = await h.invoke("widgets:self", win.webContents);
  assert.equal(self.item.id, r.item.id);
});

test("widget ayarla: boyut, sabitle, üstte sabit, masaüstüne göm (pencere yeniden kurulur), seçenekler, ızgaraya hizalama", async () => {
  const h = harness();
  const { item } = await h.invoke("widgets:add", null, "weather");
  await h.tick();
  const win = h.windows[0];
  await h.invoke("widgets:update", null, item.id, { size: "medium", locked: true, level: "top", opacity: 70, options: { city: "İzmir" } });
  assert.equal(win.destroyed, true, "katman değişti → pencere yeniden kuruldu");
  const wTop = h.windows[1];
  assert.deepEqual([wTop.opts.width, wTop.opts.height], [364, 170]);
  assert.ok(wTop.opts.x + 364 <= 1440, "büyüyen widget ekrandan taşmaz");
  assert.equal(wTop.opts.alwaysOnTop, true);
  assert.equal(wTop.opts.focusable, true);
  assert.equal(wTop.opts.movable, false, "sabitli");
  wTop.webContents.emit("did-finish-load");
  const cfg = wTop.sent.filter((s) => s.ch === "widget:config").at(-1).p;
  assert.equal(cfg.item.options.city, "İzmir");
  assert.equal(cfg.item.opacity, 70);
  assert.equal(cfg.glass, true);
  assert.equal(cfg.level, "top");
  await h.invoke("widgets:update", null, item.id, { level: "embed", locked: false });
  assert.equal(wTop.destroyed, true, "gömülü düzey pencere türüyle kurulur");
  const w2 = h.windows[2];
  assert.equal(w2.opts.type, "desktop");
  assert.equal(w2.opts.focusable, false);
  assert.equal(w2.opts.vibrancy, undefined, "gömülüde cam yok");
  // taşınınca ızgaraya hizalanır ve (ekranıyla) kaydedilir
  w2.bounds = { ...w2.bounds, x: 500, y: 300 };
  w2.emit("moved");
  await new Promise((r) => setTimeout(r, 650));
  assert.deepEqual([w2.bounds.x, w2.bounds.y], [24 + 2 * 194, 25 + 24 + 194]);
  const saved = JSON.parse(fs.readFileSync(path.join(h.dir, "widgets.json"), "utf8"));
  assert.deepEqual([saved.items[0].x, saved.items[0].y], [412, 243]);
  assert.equal(saved.items[0].disp.id, 1);
  // etkileşimli widget gömülemez
  const t = await h.invoke("widgets:add", null, "todos");
  await h.invoke("widgets:update", null, t.item.id, { level: "embed" });
  assert.equal(h.w.list().find((i) => i.id === t.item.id).level, "desktop");
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
  for (const l of ["Boyut", "Arka plan saydamlığı", "Katman", "Masaüstüne sabitle (sürüklenmez)", "Widget'ları düzenle", "Izgaraya hizala", "Bu widget'ı kaldır"]) assert.ok(labels.includes(l), l);
  const katman = h.menus[0].find((i) => i.label === "Katman").submenu.map((i) => i.label);
  assert.ok(katman[0].startsWith("Masaüstü") && katman.some((l) => l.startsWith("Masaüstüne göm")));
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
  assert.deepEqual([h.windows[0].bounds.x, h.windows[0].bounds.y, h.windows[0].bounds.width], [100, 200, 364]);
  assert.equal(h.windows[0].opts.alwaysOnTop, true);
  assert.equal(h.windows[1].bounds.x, 1440 - 170);
  assert.equal(h.windows[1].opts.focusable, false, "eski varsayılan normal → masaüstü katmanı");
  assert.ok(h.windows.every((w) => w.visible));
  const hidden = harness({ stored: { visible: false, items: [{ id: "ccc333", type: "clock", x: 10, y: 40 }] } });
  hidden.w.restore();
  await hidden.tick();
  assert.equal(hidden.windows[0].visible, false, "gizli bırakıldıysa gizli açılır");
});

test("büyüyen widget ekrandan taşmaz (fitInWorkArea)", () => {
  const displays = [{ workArea: { x: 0, y: 25, width: 1600, height: 975 } }, { workArea: { x: 1600, y: 0, width: 1280, height: 1024 } }];
  // sağ kenarda küçük (290) → orta (350): sola itilir
  assert.deepEqual(C.fitInWorkArea({ x: 1294, y: 41, width: 350, height: 420 }, displays), { x: 1242, y: 41 });
  // alt kenardan taşan: yukarı itilir
  assert.deepEqual(C.fitInWorkArea({ x: 100, y: 800, width: 300, height: 400 }, displays), { x: 100, y: 592 });
  // ikinci ekranda kalır
  assert.deepEqual(C.fitInWorkArea({ x: 2700, y: 10, width: 330, height: 200 }, displays), { x: 2542, y: 10 });
  // sığıyorsa dokunulmaz
  assert.deepEqual(C.fitInWorkArea({ x: 40, y: 60, width: 200, height: 100 }, displays), { x: 40, y: 60 });
});

test("masaüstü katmanı: yazı alanı için geçici odak, odak gidince geri alınır", async () => {
  const h = harness();
  const { item } = await h.invoke("widgets:add", null, "todos");
  await h.tick();
  const win = h.windows[0];
  assert.equal(win.opts.focusable, false);
  assert.deepEqual(await h.invoke("widgets:focus", win.webContents), { ok: true });
  assert.equal(win.focusable, true);
  assert.equal(win.focused, true);
  win.emit("blur");
  assert.equal(win.focusable, true, "odak hiç gelmediyse (başarısız deneme) dokunulmaz");
  win.emit("focus");
  win.emit("blur");
  assert.equal(win.focusable, false, "odak gidince tıklama yine odak çalmaz");
  // üstte sabit katmanda gerek yok
  await h.invoke("widgets:update", null, item.id, { level: "top" });
  assert.deepEqual(await h.invoke("widgets:focus", h.windows[1].webContents), { ok: false });
});

test("düzenleme kipi: sabitli widget'lar da taşınır, çıkınca kilit geri gelir; arayüze bildirilir", async () => {
  const h = harness();
  const a = await h.invoke("widgets:add", null, "clock");
  await h.invoke("widgets:update", null, a.item.id, { locked: true });
  await h.tick();
  const win = h.windows[0];
  assert.equal(win.movable, false);
  assert.deepEqual(await h.invoke("widgets:edit", null, true), { ok: true, editing: true });
  assert.equal(win.movable, true);
  assert.equal(win.sent.filter((s) => s.ch === "widget:config").at(-1).p.editing, true);
  assert.equal((await h.invoke("widgets:state")).editing, true);
  await h.invoke("widgets:edit", null, false);
  assert.equal(win.movable, false);
});

test("genel ayarlar: malzeme değişince pencereler yeniden kurulur; girişte başlat yalnız paketlide sisteme yazılır", async () => {
  const h = harness();
  await h.invoke("widgets:add", null, "clock");
  await h.tick();
  const r = await h.invoke("widgets:settings", null, { material: "soft", dim: true, atLogin: true });
  assert.equal(r.material, "soft");
  assert.equal(r.dim, true);
  assert.equal(h.windows[0].destroyed, true);
  assert.equal(h.windows[1].opts.vibrancy, undefined, "yarı saydam: cam yok");
  assert.equal(h.loginCalls.length, 0, "geliştirmede sisteme yazılmaz");
  const p = harness({ packaged: true });
  await p.invoke("widgets:settings", null, { atLogin: true });
  assert.deepEqual(p.loginCalls.at(-1), { openAtLogin: true, openAsHidden: true, args: ["--elitlig-login"] });
});

test("Windows: masaüstü katmanındaki widget'lar gösterilince ve odak gidince HWND_BOTTOM ile en alta; akrilik malzeme", async () => {
  const h = harness({ platform: "win32" });
  await h.invoke("widgets:add", null, "todos");
  await h.tick();
  const win = h.windows[0];
  assert.equal(win.opts.focusable, false, "WS_EX_NOACTIVATE: tıklama etkinleştirmez");
  assert.equal(win.opts.skipTaskbar, true, "görev çubuğunda ve Alt+Tab'da yok");
  assert.ok(["acrylic", undefined].includes(win.opts.backgroundMaterial));
  assert.equal(h.spawned.length, 1);
  assert.equal(h.spawned[0].cmd, "powershell.exe");
  assert.match(h.spawned[0].writes[0], /^\d+\n$/);
  win.emit("focus");
  win.emit("blur");
  assert.equal(h.spawned[0].writes.length, 2);
  const L = require("../widgets/layer");
  assert.match(L.WIN_BOTTOM_SCRIPT, /SetWindowPos\(\[IntPtr\]\[int64\]\$t, \[IntPtr\]1, 0, 0, 0, 0, 0x0013\)/, "HWND_BOTTOM + NOSIZE|NOMOVE|NOACTIVATE");
  assert.equal(L.winSupportsAcrylic("10.0.22631"), true);
  assert.equal(L.winSupportsAcrylic("10.0.19045"), false);
  const opts = L.windowOptions({ level: "desktop", platform: "win32", release: "10.0.22631" }).options;
  assert.equal(opts.backgroundMaterial, "acrylic");
  assert.equal(opts.transparent, false);
  assert.equal(L.windowOptions({ level: "embed", platform: "win32" }).level, "desktop", "gömülü yalnız macOS");
});

test("çoklu ekran: ekran çıkarılınca görünür alana, geri gelince / çözünürlük değişince oransal yerine", async () => {
  const two = [
    { id: 1, bounds: { x: 0, y: 0, width: 1440, height: 900 }, workArea: { x: 0, y: 25, width: 1440, height: 875 } },
    { id: 2, bounds: { x: 1440, y: 0, width: 1920, height: 1080 }, workArea: { x: 1440, y: 0, width: 1920, height: 1080 } },
  ];
  const h = harness({ displays: two });
  const { item } = await h.invoke("widgets:add", null, "clock");
  await h.tick();
  const win = h.windows[0];
  win.bounds = { ...win.bounds, x: 1440 + 600, y: 400 };
  win.emit("moved");
  await new Promise((r) => setTimeout(r, 300));
  const it = h.w.list().find((i) => i.id === item.id);
  assert.equal(it.disp.id, 2);
  // ikinci ekran çıkarıldı
  h.scr.splice(1, 1);
  h.w.relayout();
  assert.ok(win.bounds.x + 170 <= 1440, "görünür alana çekildi");
  assert.equal(it.disp.id, 2, "oransal kayıt korunur");
  // geri takıldı (daha yüksek çözünürlükle)
  h.scr.push({ id: 2, bounds: { x: 1440, y: 0, width: 2560, height: 1440 }, workArea: { x: 1440, y: 0, width: 2560, height: 1440 } });
  h.w.relayout();
  assert.ok(win.bounds.x >= 1440, "kendi ekranına döndü");
  assert.equal((win.bounds.x - 1440 - 24) % 194, 0, "ızgarada");
  // uyku dönüşü: kapanmış pencere yeniden kurulur
  win.destroy();
  h.w.revalidate();
  assert.equal(h.windows.length, 2);
  assert.ok(h.screenEv.listenerCount("display-removed") > 0, "ekran olayları dinlenir");
});
