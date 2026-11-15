"use strict";
// Masaüstünden her araca erişim (app/launcher): araç listesi, derin bağlantı, Dock menüsü,
// Windows atlama listesi, tepsi "Araçlar" alt menüsü ve sahte Electron ile hızlı geçiş penceresi.
const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const T = require("../launcher/tools");
const { registerLauncher, sanitizeArg } = require("../launcher");

const labels = (tpl) => tpl.map((i) => (i.type === "separator" ? "—" : i.label));

test("araçlar: istenen her araç listede, yetkiye göre süzülür", () => {
  const keys = T.TOOLS.map((t) => t.key);
  for (const k of ["projects", "todos", "ledger", "agenda", "notes", "contacts", "equipment", "messages", "requests", "studio", "admin", "toolkit"]) assert.ok(keys.includes(k), k);
  const member = T.visibleTools({ requests: false, live: false }).map((t) => t.key);
  assert.ok(!member.includes("requests") && !member.includes("admin") && !member.includes("studio"));
  const admin = T.visibleTools({ requests: true, live: true }).map((t) => t.key);
  assert.ok(admin.includes("requests") && admin.includes("admin") && admin.includes("studio"));
  // eski oturum: live alanı yoksa yönetim hesabına açık (App.jsx ile aynı kural)
  assert.ok(T.visibleTools({ requests: true }).some((t) => t.key === "studio"));
});

test("hedef doğrulama: bilinmeyen araç / zararlı alt değer reddedilir", () => {
  assert.equal(T.cleanRoute("projects"), "projects");
  assert.equal(T.cleanRoute("projects:12"), "projects:12");
  assert.equal(T.cleanRoute("ledger:duzenli"), "ledger:duzenli");
  assert.equal(T.cleanRoute("account"), "account");
  assert.equal(T.cleanRoute("evil"), null);
  assert.equal(T.cleanRoute("projects:../../x"), null);
  assert.equal(T.cleanRoute("projects:1 2"), null);
  assert.equal(T.cleanRoute(""), null);
});

test("derin bağlantı: elitlig-araclar://projects/12 ve diğer biçimler", () => {
  assert.deepEqual(T.parseDeepLink("elitlig-araclar://projects/12"), { route: "projects:12" });
  assert.deepEqual(T.parseDeepLink("elitlig-araclar://projects"), { route: "projects" });
  assert.deepEqual(T.parseDeepLink("elitlig-araclar://projects/"), { route: "projects" });
  assert.deepEqual(T.parseDeepLink("ELITLIG-ARACLAR://todos/5?x=1#a"), { route: "todos:5" });
  assert.deepEqual(T.parseDeepLink("elitlig-araclar://open/ledger/duzenli"), { route: "ledger:duzenli" });
  assert.deepEqual(T.parseDeepLink("elitlig-araclar://new/task"), { action: "new-task" });
  assert.deepEqual(T.parseDeepLink("elitlig-araclar://yeni/expense"), { action: "new-expense" });
  assert.deepEqual(T.parseDeepLink("elitlig-araclar://launcher"), { launcher: true });
  assert.deepEqual(T.parseDeepLink("elitlig-araclar://widgets"), { widgets: true });
  assert.deepEqual(T.parseDeepLink("elitlig-araclar://"), { route: "today" });
  assert.equal(T.parseDeepLink("elitlig-araclar://new/rm-rf"), null);
  assert.equal(T.parseDeepLink("elitlig-araclar://hacker/1"), null);
  assert.equal(T.parseDeepLink("https://elitlig.com/projects/12"), null);
  assert.equal(T.parseDeepLink(null), null);
  assert.equal(T.linkFromArgv(["/x/electron", "/app", "--flag", "elitlig-araclar://agenda"]), "elitlig-araclar://agenda");
  assert.equal(T.linkFromArgv(["/x/electron", "/app"]), null);
  assert.equal(T.linkFor({ route: "projects:12" }), "elitlig-araclar://projects/12");
  assert.equal(T.linkFor({ action: "new-note" }), "elitlig-araclar://new/note");
  // gidiş-dönüş
  for (const t of T.TOOLS) assert.deepEqual(T.parseDeepLink(T.linkFor({ route: t.key })), { route: t.key });
  for (const a of T.ACTIONS) assert.deepEqual(T.parseDeepLink(T.linkFor({ action: a.id })), { action: a.id });
});

test("Dock menüsü: hızlı geçiş, hızlı kayıt, yeni kayıt alt menüsü, tüm (yetkili) araçlar, widget", () => {
  const calls = [];
  const handlers = { open: (r) => calls.push(["open", r]), action: (a) => calls.push(["action", a]), launcher: () => calls.push(["launcher"]), quick: () => calls.push(["quick"]), widgets: () => calls.push(["widgets"]) };
  const tpl = T.dockMenuTemplate({ access: { requests: true, live: true }, handlers, shortcuts: { launcher: "Control+Alt+O", quick: "Control+Alt+N" } });
  const l = labels(tpl);
  assert.equal(l[0], "Hızlı geçiş…");
  assert.equal(tpl[0].accelerator, "Control+Alt+O");
  assert.equal(tpl[0].registerAccelerator, false);
  assert.equal(l[1], "Hızlı kayıt…");
  const yeni = tpl.find((i) => i.label === "Yeni kayıt");
  assert.deepEqual(yeni.submenu.map((i) => i.label), ["Yeni görev", "Yeni gider", "Yeni not", "Yeni etkinlik", "Yeni proje", "Yeni kişi", "Yeni sohbet"]);
  for (const t of T.TOOLS) assert.ok(l.includes(t.label), t.label);
  tpl.find((i) => i.label === "Projeler").click();
  yeni.submenu[1].click();
  tpl[0].click();
  tpl.find((i) => i.label === "Widget'ları göster / gizle").click();
  assert.deepEqual(calls, [["open", "projects"], ["action", "new-expense"], ["launcher"], ["widgets"]]);
  const member = labels(T.dockMenuTemplate({ access: { requests: false, live: false }, handlers }));
  assert.ok(!member.includes("Talepler") && !member.includes("Yönetim paneli") && !member.includes("Yayın Stüdyosu"));
});

test("Windows atlama listesi: Araçlar kategorisi + görevler; her öğe derin bağlantıyla çalıştırır", () => {
  const jl = T.jumpList({ access: { requests: true, live: true }, program: "C:\\Program Files\\Elitlig\\Elitlig Araclar.exe" });
  assert.equal(jl.length, 2);
  assert.equal(jl[0].type, "custom");
  assert.equal(jl[0].name, "Araçlar");
  assert.ok(jl[0].items.length <= 12 && jl[0].items.length >= 10);
  const proj = jl[0].items.find((i) => i.title === "Projeler");
  assert.equal(proj.type, "task");
  assert.equal(proj.args, "elitlig-araclar://projects");
  assert.equal(proj.program, "C:\\Program Files\\Elitlig\\Elitlig Araclar.exe");
  assert.equal(proj.iconIndex, 0);
  assert.equal(jl[1].type, "tasks");
  const titles = jl[1].items.map((i) => i.title);
  assert.deepEqual(titles.slice(0, 4), ["Hızlı geçiş", "Yeni görev", "Yeni gider", "Yeni not"]);
  assert.equal(jl[1].items.find((i) => i.title === "Yeni gider").args, "elitlig-araclar://new/expense");
  // paketlenmemiş: electron <uygulama klasörü> <url>; boşluklu yol tırnaklanır
  const dev = T.jumpList({ access: {}, program: "/e/electron", appArgs: ["/home/u/my app"] });
  assert.equal(dev[0].items[0].args, "\"/home/u/my app\" elitlig-araclar://today");
  // setUserTasks biçimi
  const ut = T.userTasks({ access: {}, program: "x.exe" });
  assert.ok(ut.every((t) => typeof t.arguments === "string" && t.program === "x.exe" && !("type" in t) && !("args" in t)));
  assert.ok(ut.some((t) => t.title === "Yeni görev"));
});

test("tepsi Araçlar alt menüsü: hepsi + yeni kayıt", () => {
  const handlers = { open() {}, action() {}, launcher() {}, quick() {}, widgets() {} };
  const item = T.trayToolsItem({ access: { requests: true, live: true }, handlers, shortcuts: { launcher: "Control+Alt+O" } });
  assert.equal(item.label, "Araçlar");
  const l = labels(item.submenu);
  for (const t of T.TOOLS) assert.ok(l.includes(t.label), t.label);
  for (const a of T.ACTIONS) assert.ok(l.includes(a.label), a.label);
});

test("sanitizeArg yalnız düz alanları geçirir", () => {
  assert.deepEqual(sanitizeArg({ id: 3, tab: "leads", lead: 9, x: { y: 1 }, "bad-key": 1, fn: () => 1, ok: true }), { id: 3, tab: "leads", lead: 9, ok: true });
});

/* ------------------------------ sahte Electron ------------------------------ */

function fakeElectron({ platform = "darwin", packaged = false, shortcutOk = true } = {}) {
  const log = { dock: [], jump: [], tasks: [], protocol: [], shortcuts: [], shown: [], sent: [] };
  const handlers = new Map();
  class FakeWin extends EventEmitter {
    constructor(opts) { super(); this.opts = opts; this.visible = false; this.focused = false; this.destroyed = false; this.webContents = Object.assign(new EventEmitter(), { isLoading: () => false, send: (ch, p) => log.sent.push([ch, p]), isDevToolsOpened: () => false }); FakeWin.last = this; }
    isDestroyed() { return this.destroyed; }
    setPosition(x, y) { this.pos = [x, y]; }
    show() { this.visible = true; }
    focus() { this.focused = true; }
    hide() { this.visible = false; this.focused = false; }
    isVisible() { return this.visible; }
    isFocused() { return this.focused; }
  }
  const app = Object.assign(new EventEmitter(), {
    isPackaged: packaged, isReady: () => true, whenReady: () => Promise.resolve(), getAppPath: () => "/app",
    dock: platform === "darwin" ? { setMenu: (m) => log.dock.push(m) } : undefined,
    setJumpList: (c) => { log.jump.push(c); return "ok"; },
    setUserTasks: (t) => { log.tasks.push(t); return true; },
    setAsDefaultProtocolClient: (s) => { log.protocol.push(s); return true; },
  });
  const deps = {
    app, platform, isMac: platform === "darwin",
    ipcMain: { handle: (ch, fn) => handlers.set(ch, fn) },
    BrowserWindow: FakeWin,
    globalShortcut: { register: (acc, fn) => { log.shortcuts.push(acc); log.fire = fn; return shortcutOk; }, unregister() {} },
    screen: { getCursorScreenPoint: () => ({ x: 0, y: 0 }), getDisplayNearestPoint: () => ({ workArea: { x: 0, y: 0, width: 1600, height: 1000 } }) },
    Menu: { buildFromTemplate: (t) => ({ template: t }) },
    loadRenderer: (w, hash) => { w.hash = hash; },
    webPreferences: () => ({}),
    guardNavigation() {},
    showMain: (r) => log.shown.push(r),
    showQuick: (k) => log.shown.push(["quick", k]),
    access: () => ({ requests: true, live: true }),
  };
  return { deps, log, handlers, FakeWin };
}

test("hızlı geçiş: kısayol, pencere, araç / eylem / bağlantı açma, yetki", async () => {
  const { deps, log, handlers, FakeWin } = fakeElectron();
  const L = registerLauncher(deps);
  assert.deepEqual(log.shortcuts, ["Control+Alt+O"]);
  assert.equal(L.shortcut(), "Control+Alt+O");
  assert.deepEqual(log.protocol, [], "paketlenmemişte protokol kaydı yapılmaz");
  // kısayol → pencere açılır, #launcher yüklenir, launcher:open gönderilir
  log.fire();
  const w = FakeWin.last;
  assert.equal(w.hash, "launcher");
  assert.equal(w.visible, true);
  assert.equal(w.pos[0], Math.round((1600 - 640) / 2));
  assert.equal(log.sent.at(-1)[0], "launcher:open");
  // ikinci basış (öndeyse) gizler
  log.fire();
  assert.equal(w.visible, false);
  // odak kaybı gizler
  L.show(); w.emit("blur"); assert.equal(w.visible, false);
  // IPC: durum
  const st = await handlers.get("launcher:state")();
  assert.ok(st.tools.some((t) => t.key === "studio"));
  assert.equal(st.shortcut, "Control+Alt+O");
  // araç aç → ana pencere o görünüme
  assert.deepEqual(await handlers.get("launcher:open")({}, "projects"), { ok: true, route: "projects" });
  assert.deepEqual(await handlers.get("launcher:open")({}, "equipment", { id: 4, junk: { a: 1 } }), { ok: true, route: "equipment" });
  assert.equal((await handlers.get("launcher:open")({}, "nope")).ok, false);
  // eylem: hızlı kayıt penceresi türüyle; form eylemi ana pencerede
  assert.equal((await handlers.get("launcher:action")({}, "new-expense")).ok, true);
  assert.equal((await handlers.get("launcher:action")({}, "new-project")).ok, true);
  assert.equal((await handlers.get("launcher:action")({}, "x")).ok, false);
  assert.deepEqual(log.shown, ["projects", { route: "equipment", arg: { id: 4 } }, ["quick", "expense"], "projects:new"]);
  // ikinci örnekten gelen bağlantı
  log.shown.length = 0;
  assert.equal(L.handleArgv(["electron", "/app", "elitlig-araclar://projects/12"]), true);
  assert.equal(L.handleArgv(["electron", "/app"]), false);
  assert.equal(L.openUrl("elitlig-araclar://new/task"), true);
  assert.equal(L.openUrl("elitlig-araclar://bilinmez"), false);
  assert.deepEqual(log.shown, ["projects:12", ["quick", "task"]]);
});

test("yetkisiz araç açılmaz", async () => {
  const { deps, log, handlers } = fakeElectron();
  deps.access = () => ({ requests: false, live: false });
  registerLauncher(deps);
  const r = await handlers.get("launcher:open")({}, "admin");
  assert.equal(r.ok, false);
  assert.deepEqual(log.shown, []);
  const st = await handlers.get("launcher:state")();
  assert.ok(!st.tools.some((t) => t.key === "admin"));
});

test("Dock menüsü (Mac) ve atlama listesi (Windows) kurulur; değişmeyince yenilenmez", () => {
  const mac = fakeElectron({ platform: "darwin" });
  let acc = { requests: true, live: true };
  mac.deps.access = () => acc;
  const Lm = registerLauncher(mac.deps);
  Lm.refreshOsMenus();
  assert.equal(mac.log.dock.length, 1);
  assert.equal(mac.log.dock[0].template[0].label, "Hızlı geçiş…");
  assert.equal(mac.log.jump.length, 0);
  Lm.refreshOsMenus({ force: false });
  assert.equal(mac.log.dock.length, 1, "aynı yetkiyle yeniden kurulmaz");
  acc = { requests: false };
  Lm.refreshOsMenus({ force: false });
  assert.equal(mac.log.dock.length, 2, "yetki değişince yeniden kurulur");

  const win = fakeElectron({ platform: "win32", packaged: true });
  const Lw = registerLauncher(win.deps);
  assert.deepEqual(win.log.protocol, ["elitlig-araclar"], "paketli uygulama protokolü kaydeder");
  Lw.refreshOsMenus();
  assert.equal(win.log.jump.length, 1);
  assert.equal(win.log.jump[0][0].name, "Araçlar");
  assert.equal(win.log.jump[0][0].items[0].args, "elitlig-araclar://today", "paketli: yalnız bağlantı");
  assert.equal(win.log.tasks.length, 0);
  // setJumpList başarısızsa setUserTasks
  win.deps.app.setJumpList = () => "customCategoryAccessDeniedError";
  Lw.refreshOsMenus();
  assert.equal(win.log.tasks.length, 1);
  assert.ok(win.log.tasks[0].some((t) => t.title === "Projeler" && t.arguments === "elitlig-araclar://projects"));
});

test("kısayol alınamazsa boş kalır, menüde gösterilmez", () => {
  const { deps } = fakeElectron({ shortcutOk: false });
  const L = registerLauncher(deps);
  assert.equal(L.shortcut(), "");
  assert.equal(L.dockMenu().template[0].accelerator, undefined);
});
