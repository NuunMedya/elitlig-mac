// 2.36.0 · Elitlig Stüdyo (bağımsız uygulama), performans / güvenli mod bayrakları, çökme günlüğü,
// Elitlig Araçlar ⇄ Stüdyo bağlantısı (ayar aktarımı, şifreli oturum devri) ve paket yapılandırması.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { EventEmitter } = require("node:events");

const ROOT = path.join(__dirname, "..", "..");
const { applyStudioSwitches } = require("../studio/switches");
const { createPerfFlags, resolveLaunch, applyLaunchFlags, normalizeFlags, DEFAULT_FLAGS } = require("../perfFlags");
const { createCrashMonitor, recentGpuCrashes } = require("../crashMonitor");
const link = require("../studioLink");

const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));
const switchesApp = () => { const sw = new Map(); return { sw, app: { commandLine: { appendSwitch: (k, v = "") => sw.set(k, v), getSwitchValue: (k) => sw.get(k) || "" }, disableHardwareAcceleration() { this.hwOff = true; } } }; };

/* ─────────────────────────── bayraklar ─────────────────────────── */

test("bayraklar: güvenli varsayılanlar — güçlü kart açık, ffmpeg yüksek öncelik KAPALI, donanım hızlandırma açık", () => {
  assert.equal(DEFAULT_FLAGS.highPerfGpu, true);
  assert.equal(DEFAULT_FLAGS.ffmpegAboveNormal, false);
  assert.equal(DEFAULT_FLAGS.hardwareAcceleration, true);
  const n = normalizeFlags({ highPerfGpu: "evet", ffmpegAboveNormal: true, gpuCrashes: [1, "x", 3] });
  assert.equal(n.highPerfGpu, true);
  assert.equal(n.ffmpegAboveNormal, true);
  assert.deepEqual(n.gpuCrashes, [1, 3]);
});

test("bayraklar: dosyada saklanır; bilinmeyen alan yazılmaz", () => {
  const dir = tmp("perf-");
  const s = createPerfFlags({ dir });
  s.set({ ffmpegAboveNormal: true, zararli: true, highPerfGpu: "x" });
  const again = createPerfFlags({ dir }).get();
  assert.equal(again.ffmpegAboveNormal, true);
  assert.equal(again.highPerfGpu, true);
  assert.equal("zararli" in again, false);
});

test("güvenli mod: --safe-mode / --guvenli-mod / ortam / kalıcı / tek seferlik; her şeyi güvenliye çeker", () => {
  for (const argv of [["x", "--safe-mode"], ["x", "--guvenli-mod"]]) {
    const l = resolveLaunch({ highPerfGpu: true, ffmpegAboveNormal: true }, { argv, env: {} });
    assert.equal(l.safeMode, true);
    assert.equal(l.hardwareAcceleration, false);
    assert.equal(l.highPerfGpu, false);
    assert.equal(l.ffmpegAboveNormal, false);
    assert.equal(l.reason, "komut satırı");
  }
  assert.equal(resolveLaunch({}, { argv: [], env: { ELITLIG_SAFE_MODE: "1" } }).safeMode, true);
  assert.equal(resolveLaunch({ safeMode: true }, { argv: [], env: {} }).safeMode, true);
  assert.equal(resolveLaunch({}, { argv: [], env: {} }).safeMode, false);
  assert.equal(resolveLaunch({ hardwareAcceleration: false }, { argv: [], env: {} }).hardwareAcceleration, false);
});

test("applyLaunchFlags: tek seferlik güvenli mod tüketilir; donanım hızlandırma kapatılır; Windows'ta güçlü kart eklenmez", () => {
  const dir = tmp("perf-launch-");
  createPerfFlags({ dir }).set({ safeModeOnce: true });
  const { app, sw } = switchesApp();
  const { launch, store } = applyLaunchFlags(app, { dir, argv: [], env: {}, platform: "win32", applySwitches: applyStudioSwitches });
  assert.equal(launch.safeMode, true);
  assert.equal(app.hwOff, true);
  assert.equal(sw.has("force_high_performance_gpu"), false);
  assert.equal(sw.has("disable-renderer-backgrounding"), true, "yayın kısma bayrakları güvenli modda da var");
  assert.equal(store.get().safeModeOnce, false, "tek seferlik silindi");
  const second = applyLaunchFlags(switchesApp().app, { dir, argv: [], env: {}, platform: "win32", applySwitches: applyStudioSwitches });
  assert.equal(second.launch.safeMode, false);
});

test("Chromium bayrakları: Ayarlar › Performans'ta güçlü kart kapatılınca eklenmez", () => {
  const a = switchesApp(); applyStudioSwitches(a.app, "win32", { highPerfGpu: false });
  assert.equal(a.sw.has("force_high_performance_gpu"), false);
  const b = switchesApp(); applyStudioSwitches(b.app, "win32", { highPerfGpu: true });
  assert.equal(b.sw.has("force_high_performance_gpu"), true);
  assert.equal(b.sw.get("disable-features"), "CalculateNativeWinOcclusion");
});

test("ffmpeg önceliği: motor işlev alır, her başlatmada okur (varsayılan normal)", () => {
  const src = fs.readFileSync(path.join(ROOT, "app", "studio", "engine.js"), "utf8");
  assert.match(src, /typeof priority === "function" \? priority\(\) : priority/);
  const idx = fs.readFileSync(path.join(ROOT, "app", "studio", "index.js"), "utf8");
  assert.doesNotMatch(idx, /priority: "above-normal"/, "sabit yüksek öncelik kalmadı");
  assert.match(idx, /priority: ffmpegPriority/);
});

/* ─────────────────────────── çökme günlüğü ─────────────────────────── */

function fakeApp() {
  const app = new EventEmitter();
  app.getVersion = () => "2.36.0";
  app.getGPUFeatureStatus = () => ({ gpu_compositing: "enabled" });
  return app;
}

test("çökme günlüğü: grafik süreci çökmesi yazılır, bildirilir; temiz çıkış bildirilmez", () => {
  const dir = tmp("crash-");
  const app = fakeApp();
  const seen = [];
  const diag = [];
  const mon = createCrashMonitor({ app, dir, notify: (e) => seen.push(e), writeDiag: (m, d) => diag.push([m, d]) }).install();
  app.emit("child-process-gone", {}, { type: "GPU", reason: "crashed", exitCode: -1073741819 });
  app.emit("child-process-gone", {}, { type: "Utility", reason: "clean-exit", exitCode: 0, serviceName: "x" });
  app.emit("render-process-gone", {}, { getURL: () => "file:///a/renderer/dist/studio.html" }, { reason: "oom", exitCode: 1 });
  const recent = mon.recent();
  assert.equal(recent.length, 3);
  assert.equal(recent[2].type, "GPU");
  assert.equal(recent[2].exitCode, -1073741819);
  assert.deepEqual(recent[2].gpu, { gpu_compositing: "enabled" });
  assert.equal(recent[0].url, "app://studio.html");
  assert.equal(seen.length, 2, "temiz çıkış bildirilmez");
  assert.equal(diag.length, 3, "hepsi tanılama günlüğüne");
});

test("çökme günlüğü: 10 dk'da 3 grafik çökmesi → güvenli mod önerisi (bir kez, 30 dk içinde tekrar yok)", () => {
  const dir = tmp("crash-gpu-");
  const flags = createPerfFlags({ dir });
  const app = fakeApp();
  let t = 1_000_000;
  const asked = [];
  createCrashMonitor({ app, dir, flags, launch: { safeMode: false }, now: () => t, onRepeatedGpuCrash: (i) => asked.push(i.count) }).install();
  for (let i = 0; i < 4; i += 1) { app.emit("child-process-gone", {}, { type: "GPU", reason: "crashed", exitCode: 1 }); t += 60_000; }
  assert.deepEqual(asked, [3]);
  assert.equal(recentGpuCrashes([1, 2, 3], 10 * 60_000 + 2), 2);
});

test("çökme günlüğü: güvenli moddayken öneri yok", () => {
  const dir = tmp("crash-safe-");
  const app = fakeApp();
  const asked = [];
  createCrashMonitor({ app, dir, flags: createPerfFlags({ dir }), launch: { safeMode: true }, onRepeatedGpuCrash: () => asked.push(1) }).install();
  for (let i = 0; i < 5; i += 1) app.emit("child-process-gone", {}, { type: "GPU", reason: "crashed" });
  assert.equal(asked.length, 0);
});

test("çökme günlüğü: önceki açılış düzgün kapanmadıysa günlüğe yazılır; temiz çıkış işareti siler", () => {
  const dir = tmp("crash-unclean-");
  const a = createCrashMonitor({ app: fakeApp(), dir }).install();
  assert.equal(a.uncleanExit(), null);
  // kapanmadan yeniden açılış (çökme / güç kesintisi / Windows kurtarma)
  const b = createCrashMonitor({ app: fakeApp(), dir }).install();
  assert.ok(b.uncleanExit());
  assert.equal(b.recent()[0].kind, "unclean-exit");
  b.markCleanExit();
  const c = createCrashMonitor({ app: fakeApp(), dir }).install();
  assert.equal(c.uncleanExit(), null);
});

/* ─────────────────────────── ayar aktarımı ─────────────────────────── */

test("aktarım: yalnız stüdyo anahtarları; dosyalar Stüdyo'da yoksa kopyalanır; işaretten sonra yok", () => {
  const shared = tmp("shared-");
  const araclar = tmp("araclar-");
  const studyo = tmp("studyo-");
  fs.writeFileSync(path.join(araclar, "studio-settings.json"), JSON.stringify({ recordDir: "/kayit" }));
  fs.writeFileSync(path.join(araclar, "studio-media.json"), JSON.stringify({ a: 1 }));
  const entries = { "studio.v3": "{\"scenes\":[1]}", "studio.layout.v1": "{}", "elitlig.studio.youtubeCover.v1": "x", "route": "today", "sidebar.collapsed": "1", "studio.n": 5 };
  const res = link.writeStudioExport({ dir: shared, userDataDir: araclar, entries, version: "2.36.0" });
  assert.equal(res.keys, 3);
  assert.equal(res.files, 2);
  const imp = link.prepareImport({ dir: shared, userDataDir: studyo });
  assert.deepEqual(Object.keys(imp.entries).sort(), ["elitlig.studio.youtubeCover.v1", "studio.layout.v1", "studio.v3"]);
  assert.deepEqual(imp.copied.sort(), ["studio-media.json", "studio-settings.json"]);
  assert.equal(JSON.parse(fs.readFileSync(path.join(studyo, "studio-settings.json"), "utf8")).recordDir, "/kayit");
  link.markImported(studyo, { keys: 3 });
  assert.equal(link.prepareImport({ dir: shared, userDataDir: studyo }), null, "işaret varsa otomatik aktarım yok");
  // Zorla (menü): var olan dosyalar da yenilenir.
  fs.writeFileSync(path.join(studyo, "studio-settings.json"), "{}");
  const forced = link.prepareImport({ dir: shared, userDataDir: studyo, force: true });
  assert.ok(forced.copied.includes("studio-settings.json"));
});

test("aktarım: dışa aktarım yoksa null; bozuk dosya null", () => {
  const shared = tmp("shared-none-");
  assert.equal(link.prepareImport({ dir: shared, userDataDir: tmp("s-") }), null);
  fs.writeFileSync(path.join(shared, link.EXPORT_FILE), "{bozuk");
  assert.equal(link.readStudioExport(shared), null);
});

/* ─────────────────────────── oturum devri ─────────────────────────── */

test("oturum devri: şifreli dosya + bağlantıdaki anahtar; okununca silinir, ikinci kez kullanılamaz", () => {
  const dir = tmp("handoff-");
  const key = link.createHandoff({ dir, session: { token: "jwt.abc", user: { id: 7, username: "a" }, loginAt: 1 }, now: 1000 });
  assert.match(key, /^[0-9a-f]{64}$/);
  const raw = fs.readFileSync(path.join(dir, link.HANDOFF_FILE), "utf8");
  assert.doesNotMatch(raw, /jwt\.abc/, "jeton düz metin değil");
  assert.equal(link.handoffKeyFromArgv(["app", `elitlig-studyo://open?k=${key}`]), key);
  assert.equal(link.handoffKeyFromArgv(["app", "elitlig-studyo://open?k=zz"]), null);
  const s = link.consumeHandoff({ dir, keyHex: key, now: 2000 });
  assert.equal(s.token, "jwt.abc");
  assert.equal(s.user.id, 7);
  assert.equal(fs.existsSync(path.join(dir, link.HANDOFF_FILE)), false);
  assert.equal(link.consumeHandoff({ dir, keyHex: key, now: 2000 }), null);
});

test("oturum devri: yanlış anahtar ya da 2 dk'dan eski → null (dosya yine silinir)", () => {
  const dir = tmp("handoff-bad-");
  link.createHandoff({ dir, session: { token: "t" }, now: 1000 });
  assert.equal(link.consumeHandoff({ dir, keyHex: "a".repeat(64), now: 1000 }), null);
  assert.equal(fs.existsSync(path.join(dir, link.HANDOFF_FILE)), false);
  const k = link.createHandoff({ dir, session: { token: "t" }, now: 1000 });
  assert.equal(link.consumeHandoff({ dir, keyHex: k, now: 1000 + link.HANDOFF_MAX_AGE_MS + 1 }), null);
  assert.equal(link.createHandoff({ dir, session: null }), null, "oturum yoksa devir yok");
});

test("kurulum: protokol kaydı ya da bilinen klasör; yoksa indirme bağlantısı", () => {
  const appWith = { getApplicationNameForProtocol: () => "Elitlig Studyo" };
  const appNone = { getApplicationNameForProtocol: () => "" };
  assert.equal(link.studioInstallInfo({ app: appWith, platform: "win32", env: {}, exists: () => false }).installed, true);
  const none = link.studioInstallInfo({ app: appNone, platform: "win32", env: { LOCALAPPDATA: "C:\\U\\AppData\\Local" }, exists: () => false });
  assert.equal(none.installed, false);
  assert.match(none.downloadUrl, /releases\/latest$/);
  const byPath = link.studioInstallInfo({ app: appNone, platform: "win32", env: { LOCALAPPDATA: "/L" }, exists: (p) => p.includes("elitlig-studyo") });
  assert.equal(byPath.installed, true);
  assert.match(byPath.path, /Elitlig Studyo\.exe$/);
  assert.ok(link.studioCandidates({ platform: "darwin", home: "/Users/a" }).includes("/Applications/Elitlig Studyo.app"));
});

/* ─────────────────────────── paket ve modül sınırı ─────────────────────────── */

/** Bir giriş dosyasının göreli require grafiği (yalnız ./ ve ../). */
function requireGraph(entry) {
  const seen = new Set();
  const visit = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    const src = fs.readFileSync(file, "utf8");
    for (const m of src.matchAll(/require\("(\.{1,2}\/[^"]+)"\)/g)) {
      let p = path.resolve(path.dirname(file), m[1]);
      if (fs.existsSync(`${p}.js`)) p = `${p}.js`;
      else if (fs.existsSync(path.join(p, "index.js"))) p = path.join(p, "index.js");
      if (fs.existsSync(p) && p.endsWith(".js")) visit(p);
    }
  };
  visit(entry);
  return [...seen].map((f) => path.relative(ROOT, f).split(path.sep).join("/"));
}

test("Elitlig Stüdyo ana süreci araç takımı / tarayıcı / yönetim / raflar / widget / sohbet soketini YÜKLEMEZ", () => {
  const graph = requireGraph(path.join(ROOT, "app", "studio-app", "main.js"));
  assert.ok(graph.includes("app/studio/index.js"));
  assert.ok(graph.includes("app/api.js") && graph.includes("app/session.js"));
  const banned = /^app\/(main\.js|adminPanel|browser|launcher|shelf|widgets|fileTools|toolkit\.js|focus\.js|reminders\.js|equipmentFeed\.js|netTools\.js|windowManager\.js|windowLayouts\.js|clipboardIo\.js)/;
  assert.deepEqual(graph.filter((f) => banned.test(f)), []);
  const src = fs.readFileSync(path.join(ROOT, "app", "studio-app", "main.js"), "utf8");
  assert.doesNotMatch(src, /socket\.io-client/);
});

test("paket yapılandırması: ayrı appId / ad / çıktı / simge / protokol; dışarıda bırakılanlar Stüdyo'da kullanılmıyor", () => {
  const cfg = require("../../build/studio-builder.config.js");
  const pkg = require("../../package.json");
  assert.equal(cfg.appId, "com.elitlig.studyo");
  assert.notEqual(cfg.appId, pkg.build.appId);
  assert.equal(cfg.extraMetadata.main, "app/studio-app/main.js");
  assert.equal(cfg.directories.output, "dist-studio");
  assert.notEqual(cfg.directories.output, pkg.build.directories.output);
  assert.equal(cfg.publish, null, "güncelleme dosyası (latest*.yml) üretilmez");
  assert.deepEqual(cfg.protocols[0].schemes, ["elitlig-studyo"]);
  assert.equal(cfg.nsis.artifactName, "Elitlig-Studyo-Setup-${version}.exe");
  assert.equal(cfg.win.artifactName, "Elitlig-Studyo-${version}-win-${arch}.${ext}");
  assert.equal(cfg.dmg.artifactName, "Elitlig-Studyo-${version}.dmg");
  assert.equal(cfg.mac.artifactName, "Elitlig-Studyo-${version}-${arch}.${ext}");
  for (const f of [cfg.mac.icon, cfg.win.icon, cfg.nsis.installerIcon]) assert.ok(fs.existsSync(path.join(ROOT, f)), f);
  assert.ok(cfg.mac.extraResources.some((r) => /ffmpeg/.test(r.from)) && cfg.win.extraResources.some((r) => /ffmpeg/.test(r.from)));
  const graph = new Set(requireGraph(path.join(ROOT, "app", "studio-app", "main.js")));
  const excluded = cfg.files.filter((f) => f.startsWith("!")).map((f) => f.slice(1));
  for (const pat of excluded) {
    const re = new RegExp(`^${pat.replace(/[.]/g, "\\.").replace(/\/\*\*$/, "/").replace(/\*\*/g, ".*")}`);
    assert.deepEqual([...graph].filter((f) => re.test(f)), [], `${pat} pakette yok ama kullanılıyor`);
  }
  assert.ok(pkg.build.files.includes("!app/studio-app/**"), "Elitlig Araçlar paketine Stüdyo girişi girmez");
  assert.ok(pkg.scripts["pack:studio"].includes("build/studio-builder.config.js"));
});

test("Elitlig Araçlar: Yayın Stüdyosu ana süreç kodu tembel (yalnız ensureStudio içinde)", () => {
  const src = fs.readFileSync(path.join(ROOT, "app", "main.js"), "utf8");
  const hits = [...src.matchAll(/require\("\.\/studio"\)/g)].map((m) => m.index);
  assert.equal(hits.length, 1);
  const fn = src.indexOf("function ensureStudio()");
  assert.ok(fn > 0 && hits[0] > fn && hits[0] - fn < 200, "require ensureStudio içinde");
  assert.match(src, /ipcMain\.handle\("studio:ensure"/);
  assert.match(src, /installMediaPermissions\(electronSession\.defaultSession/);
});

test("iki uygulama yan yana: geçici parça klasörleri ayrı (açılışta birbirininkini silmez)", () => {
  const studioMain = fs.readFileSync(path.join(ROOT, "app", "studio-app", "main.js"), "utf8");
  assert.match(studioMain, /tempDirName: "elitlig-studyo"/);
  assert.match(studioMain, /"Elitlig Studyo"\)/, "ayrı userData");
  const idx = fs.readFileSync(path.join(ROOT, "app", "studio", "index.js"), "utf8");
  assert.match(idx, /tempDirName = "elitlig-studio"/);
});
