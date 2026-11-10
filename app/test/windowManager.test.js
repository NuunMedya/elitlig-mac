"use strict";
// Pencere yerleştirme arka uçları: betik üretimi ve sahte osascript / PowerShell ile uçtan uca akış.
// (Gerçek Mac / Windows penceresi bu ortamda denenemez; burada üretilen komutlar sınanır.)
const test = require("node:test");
const assert = require("node:assert/strict");
const os = require("node:os");
const fs = require("node:fs");
const path = require("node:path");
const { EventEmitter } = require("node:events");
const W = require("../windowManager");
const { parseRates, sanitizeMusicState } = require("../toolkit");

const display = (id, x, y, w, h, menu = 0, scale = 1) => ({ id, scaleFactor: scale, bounds: { x, y, width: w, height: h }, workArea: { x, y: y + menu, width: w, height: h - menu } });
const fakeScreen = (displays) => ({ getAllDisplays: () => displays });
const noWindows = { getFocusedWindow: () => null, getAllWindows: () => [], fromId: () => null };

test("mac betikleri yalnız tam sayı içerir; geçersiz değer reddedilir", () => {
  const read = W.macReadScript(1234).join("\n");
  assert.match(read, /unix id is 1234/);
  assert.match(W.macReadScript(null).join("\n"), /whose frontmost is true/);
  const set = W.macSetScript(1234, { x: -1920, y: 25, width: 960, height: 1055 }, true);
  assert.ok(set.includes("set position of w to {-1920, 25}"));
  assert.ok(set.includes("set size of w to {960, 1055}"));
  assert.equal(set.filter((l) => l.startsWith("set position")).length, 2, "konum → boyut → konum");
  assert.ok(set.includes("set frontmost of p to true"));
  assert.throws(() => W.macSetScript("1234; do shell script \"x\"", { x: 0, y: 0, width: 1, height: 1 }));
  assert.throws(() => W.macSetScript(12, { x: "0}, {do shell script", y: 0, width: 1, height: 1 }));
  assert.throws(() => W.macSetScript(12, { x: 0, y: 0, width: 0, height: 10 }));
  assert.throws(() => W.macReadScript(-5));
  // Hiçbir satırda tırnak dışı kullanıcı verisi yok: başlık betiğe yazılmaz.
  assert.ok(!set.join("\n").includes("name of"));
});

test("mac okuma çıktısı ve hata kodları", () => {
  assert.deepEqual(W.parseMacRead("501\t-10\t25\t800\t600\tBelge \"1\"\ttab\n"), { pid: 501, rect: { x: -10, y: 25, width: 800, height: 600 }, title: "Belge \"1\"\ttab" });
  assert.equal(W.parseMacRead("501\tNOWIN").error, "nowindow");
  assert.equal(W.parseMacRead("501\tFULLSCREEN").error, "fullscreen");
  assert.equal(W.parseMacRead("").error, "read");
  assert.equal(W.macErrorCode("execution error: System Events got an error: osascript is not allowed assistive access. (-1719)"), "permission");
  assert.equal(W.macErrorCode("Not authorized to send Apple events to System Events. (-1743)"), "automation");
  assert.equal(W.macErrorCode("bilinmeyen"), "failed");
});

test("mac akışı: ön plandaki pencere okunur, sol yarıya konur, geri alınır", async () => {
  const calls = [];
  let rect = { x: 200, y: 200, width: 900, height: 700 };
  const execFile = (cmd, args, _opts, cb) => {
    const script = args.filter((_, i) => i % 2 === 1).join("\n");
    calls.push({ cmd, script });
    if (/set size of w to \{(\d+), (\d+)\}/.test(script)) {
      const [, w, h] = script.match(/set size of w to \{(\d+), (\d+)\}/);
      const [, x, y] = script.match(/set position of w to \{(-?\d+), (-?\d+)\}/);
      rect = { x: +x, y: +y, width: +w, height: +h };
      return cb(null, "", "");
    }
    return cb(null, `777\t${rect.x}\t${rect.y}\t${rect.width}\t${rect.height}\tSafari\n`, "");
  };
  const wm = W.createWindowManager({
    platform: "darwin", screen: fakeScreen([display(1, 0, 0, 1440, 900, 25, 2)]), BrowserWindow: noWindows,
    systemPreferences: { isTrustedAccessibilityClient: () => true }, shell: { openExternal: async () => {} }, execFile, spawn: null, tmpDir: os.tmpdir(),
  });
  const r = await wm.apply("leftHalf");
  assert.equal(r.ok, true);
  assert.deepEqual(rect, { x: 0, y: 25, width: 720, height: 875 });
  assert.equal(calls[0].cmd, "osascript");
  assert.match(calls[0].script, /frontmost is true/);
  assert.match(calls[1].script, /unix id is 777/);
  const back = await wm.apply("restore");
  assert.equal(back.ok, true);
  assert.deepEqual(rect, { x: 200, y: 200, width: 900, height: 700 });
});

test("mac: izin yoksa betik çalışmaz, izin istenir", async () => {
  let asked = 0;
  let ran = 0;
  const wm = W.createWindowManager({
    platform: "darwin", screen: fakeScreen([display(1, 0, 0, 1440, 900)]), BrowserWindow: noWindows,
    systemPreferences: { isTrustedAccessibilityClient: (prompt) => { if (prompt) asked += 1; return false; } },
    shell: { openExternal: async () => {} }, execFile: () => { ran += 1; }, tmpDir: os.tmpdir(),
  });
  const r = await wm.apply("maximize");
  assert.equal(r.ok, false);
  assert.equal(r.code, "permission");
  assert.equal(r.needsPermission, true);
  assert.equal(asked, 1);
  assert.equal(ran, 0);
  assert.deepEqual(wm.permission(), { platform: "darwin", needed: true, granted: false });
});

test("uygulamanın kendi penceresi Electron ile taşınır", async () => {
  let bounds = { x: 50, y: 60, width: 1000, height: 700 };
  const own = { id: 9, isDestroyed: () => false, isFullScreen: () => false, isMaximized: () => false, getBounds: () => bounds, setBounds: (b) => { bounds = b; }, focus: () => {} };
  const wm = W.createWindowManager({
    platform: "darwin", screen: fakeScreen([display(1, 0, 0, 1200, 800)]), BrowserWindow: { getFocusedWindow: () => own, getAllWindows: () => [own], fromId: () => own },
    systemPreferences: { isTrustedAccessibilityClient: () => false }, shell: {}, execFile: () => assert.fail("osascript çağrılmamalı"), tmpDir: os.tmpdir(),
  });
  assert.equal((await wm.apply("rightThird")).ok, true);
  assert.deepEqual(bounds, { x: 800, y: 0, width: 400, height: 800 });
  assert.deepEqual(await wm.captureTarget(), { kind: "own", id: 9 });
});

test("Windows komut satırı ve bilgi ayrıştırma", () => {
  assert.equal(W.winCommand(3, "SET", [132456, -7, 0, 974, 1047, 1]), "3 SET 132456 -7 0 974 1047 1\n");
  assert.throws(() => W.winCommand(1, "SET", ["1; Remove-Item"]));
  assert.throws(() => W.winCommand(1, "Invoke-Expression", []));
  assert.throws(() => W.winCommand(1, "SET", [1.5]));
  const info = W.parseWinInfo("OK 132456 93 0 974 727 100 0 960 720 1 4321 Chrome_WidgetWin_1");
  assert.deepEqual(info.outer, { x: 93, y: 0, width: 974, height: 727 });
  assert.deepEqual(info.frame, { x: 100, y: 0, width: 960, height: 720 });
  assert.equal(info.maximized, true);
  assert.equal(info.className, "Chrome_WidgetWin_1");
  assert.equal(W.parseWinInfo("ERR nowindow").error, "nowindow");
  // Yardımcı betik: user32 + DWM + DPI farkındalığı, tek döngü.
  for (const s of ["GetForegroundWindow", "SetWindowPos", "DwmGetWindowAttribute", "SetThreadDpiAwarenessContext", "GetWindowRect", "[Console]::In.ReadLine()"]) assert.ok(W.WIN_HELPER.includes(s), s);
  assert.ok(!/Invoke-Expression|iex /.test(W.WIN_HELPER), "gelen satırlar komut olarak çalıştırılmaz");
});

/** Sahte PowerShell: komutları alır, pencereyi (görünmez kenar paylı) taşır. */
function fakePowerShell(state) {
  return (cmd, args) => {
    state.spawned = { cmd, args, script: fs.readFileSync(args[args.indexOf("-File") + 1], "utf8") };
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stdout.setEncoding = () => {};
    child.stderr = new EventEmitter();
    child.kill = () => {};
    const reply = (s) => setImmediate(() => child.stdout.emit("data", `${s}\r\n`));
    const info = () => {
      const o = state.outer;
      const f = { x: o.x + 7, y: o.y, width: o.width - 14, height: o.height - 7 };
      return `OK ${state.hwnd} ${o.x} ${o.y} ${o.width} ${o.height} ${f.x} ${f.y} ${f.width} ${f.height} ${state.max ? 1 : 0} 4321 Notepad`;
    };
    child.stdin = {
      end: () => {},
      write: (line) => {
        state.lines.push(line.trim());
        const [id, op, ...a] = line.trim().split(" ");
        if (op === "FG" || op === "GET") reply(`${id} ${info()}`);
        else if (op === "RESTORE") { state.max = false; state.outer = { ...state.restored }; reply(`${id} OK`); }
        else if (op === "SET") { const [, x, y, w, h] = a.map(Number); state.outer = { x, y, width: w, height: h }; reply(`${id} OK`); }
        else reply(`${id} OK`);
      },
    };
    return child;
  };
}

test("Windows akışı: büyütülmüş pencere geri yüklenir, kenar payıyla yerleşir (150% DPI)", async () => {
  const state = { hwnd: 4242, max: true, outer: { x: -12, y: -12, width: 2584, height: 1404 }, restored: { x: 293, y: 143, width: 974, height: 727 }, lines: [] };
  const d = display(1, 0, 0, 1707, 960, 0, 1.5); // 2560×1440 fiziksel, %150
  d.workArea = { x: 0, y: 0, width: 1707, height: 912 }; // görev çubuğu hariç
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wm-"));
  const wm = W.createWindowManager({
    platform: "win32", screen: fakeScreen([d]), BrowserWindow: noWindows, systemPreferences: null, shell: {}, execFile: null,
    spawn: fakePowerShell(state), tmpDir: tmp,
  });
  const r = await wm.apply("leftHalf", { front: true });
  assert.equal(r.ok, true, r.error);
  assert.equal(state.spawned.cmd, "powershell.exe");
  assert.ok(state.spawned.args.includes("-NoProfile") && state.spawned.args.includes("-File"));
  assert.ok(state.spawned.script.includes("ElitligWin"));
  assert.ok(state.lines.some((l) => / RESTORE 4242$/.test(l)), "önce geri yüklenir");
  // Hedef (DIP) 0,0 854×912 → fiziksel 0,0 1281×1368; görünen çerçeve buna oturur.
  const o = state.outer;
  assert.deepEqual({ x: o.x + 7, y: o.y, width: o.width - 14, height: o.height - 7 }, { x: 0, y: 0, width: 1281, height: 1368 });
  assert.ok(/ SET 4242 .* 1$/.test(state.lines[state.lines.length - 1]), "sonda öne getirilir");
  wm.dispose();
});

test("Windows: masaüstü / görev çubuğu taşınmaz", async () => {
  const state = { hwnd: 1, max: false, outer: { x: 0, y: 0, width: 100, height: 100 }, lines: [] };
  const spawn = (...a) => {
    const c = fakePowerShell(state)(...a);
    const w = c.stdin.write;
    c.stdin.write = (line) => { const [id, op] = line.trim().split(" "); if (op === "FG") setImmediate(() => c.stdout.emit("data", `${id} OK 1 0 0 1920 1080 0 0 1920 1080 0 99 Progman\n`)); else w(line); };
    return c;
  };
  const wm = W.createWindowManager({ platform: "win32", screen: fakeScreen([display(1, 0, 0, 1920, 1080)]), BrowserWindow: noWindows, shell: {}, spawn, tmpDir: fs.mkdtempSync(path.join(os.tmpdir(), "wm-")) });
  const r = await wm.apply("maximize");
  assert.equal(r.code, "shell");
  assert.equal(await wm.captureTarget(), null);
  wm.dispose();
});

test("Linux: yalnız kendi pencerelerimiz (Electron) yerleştirilir", async () => {
  const wm = W.createWindowManager({ platform: "linux", screen: fakeScreen([display(1, 0, 0, 1000, 800, 30)]), BrowserWindow: noWindows, tmpDir: os.tmpdir() });
  assert.equal(wm.supported, true);
  assert.equal(wm.scope, "own");
  assert.equal(wm.permission().needed, false);
  assert.equal((await wm.apply("leftHalf")).code, "ownonly", "başka uygulama yok");
  // Odaktaki kendi penceremiz taşınır.
  let bounds = { x: 100, y: 100, width: 500, height: 400 };
  const bw = { id: 7, isDestroyed: () => false, isFullScreen: () => false, isMaximized: () => false, unmaximize: () => {}, getBounds: () => bounds, setBounds: (r) => { bounds = r; }, focus: () => {} };
  const own = W.createWindowManager({ platform: "linux", screen: fakeScreen([display(1, 0, 0, 1000, 800, 30)]), BrowserWindow: { getFocusedWindow: () => bw, getAllWindows: () => [bw], fromId: () => bw }, tmpDir: os.tmpdir() });
  const r = await own.apply("rightHalf");
  assert.equal(r.ok, true);
  assert.deepEqual(bounds, { x: 500, y: 30, width: 500, height: 770 });
  assert.deepEqual(await own.captureTarget(), { kind: "own", id: 7 });
  await own.apply("restore");
  assert.deepEqual(bounds, { x: 100, y: 100, width: 500, height: 400 }, "geri al");
});

test("kendi penceremiz en küçük boyuttan dar bölgeye: sağa yaslı düzen ekrandan taşmaz", async () => {
  // Ana pencere en az 980 genişlikte: 1600'lük ekranın sağ yarısı (800) sığmaz.
  let bounds = { x: 100, y: 100, width: 1000, height: 700 };
  const bw = { id: 3, isDestroyed: () => false, isFullScreen: () => false, isMaximized: () => false, unmaximize: () => {}, getBounds: () => bounds,
    setBounds: (r) => { bounds = { ...r, width: Math.max(980, r.width) }; }, setPosition: (x, y) => { bounds = { ...bounds, x, y }; }, focus: () => {} };
  const wm = W.createWindowManager({ platform: "darwin", screen: fakeScreen([display(1, 0, 0, 1600, 1000, 25)]), BrowserWindow: { getFocusedWindow: () => bw, getAllWindows: () => [bw], fromId: () => bw }, tmpDir: os.tmpdir() });
  const r = await wm.apply("rightHalf");
  assert.equal(r.ok, true);
  assert.equal(r.clamped, true);
  assert.deepEqual(bounds, { x: 620, y: 25, width: 980, height: 975 }, "sağ kenara yaslı");
  await wm.apply("leftHalf");
  assert.equal(bounds.x, 0, "sola yaslı düzen olduğu gibi kalır");
});

test("döviz kuru yanıtları ortak biçime çevrilir", () => {
  const f = parseRates({ amount: 1, base: "EUR", date: "2026-11-09", rates: { USD: 1.0812, TRY: 37.42, GBP: "0.86", XX: 3, BAD: -1 } });
  assert.deepEqual(f, { base: "EUR", date: "2026-11-09", rates: { EUR: 1, USD: 1.0812, TRY: 37.42, GBP: 0.86 } });
  const e = parseRates({ result: "success", base_code: "EUR", time_last_update_unix: 1793750400, rates: { EUR: 1, USD: 1.1, TRY: 37 } });
  assert.equal(e.base, "EUR");
  assert.match(e.date, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(parseRates({ result: "error", rates: {} }), null);
  assert.equal(parseRates(null), null);
  assert.equal(parseRates({ base: "EUR", rates: { USD: 1 } }), null, "çok az kur");
});

test("müzik durumu süzülür", () => {
  const s = sanitizeMusicState({ status: "playing", title: "x".repeat(500), volume: 300, repeat: "zzz", trackCount: "4", evil: () => {} });
  assert.equal(s.status, "playing");
  assert.equal(s.title.length, 140);
  assert.equal(s.volume, 100);
  assert.equal(s.repeat, "all");
  assert.equal(s.trackCount, 4);
  assert.ok(!("evil" in s));
  assert.equal(sanitizeMusicState({ status: "hack" }).status, "idle");
});
