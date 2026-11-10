"use strict";
// Bağlantıdan indir (yt-dlp): argümanlar, ilerleme, hata metinleri, sürüm / çözücü,
// paketleme betiği. Ağ ve gerçek ikili gerekmez.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const y = require("../fileTools/ytdlpArgs");
const { createYtdlp } = require("../fileTools/ytdlp");

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "ytdlp-"));
const flag = (args, name) => args[args.indexOf(name) + 1];

test("site tanıma ve oynatma listesi", () => {
  assert.equal(y.siteOf("https://youtu.be/abc").key, "youtube");
  assert.equal(y.siteOf("https://www.instagram.com/reel/X/").key, "instagram");
  assert.equal(y.siteOf("https://x.com/a/status/1").key, "x");
  assert.equal(y.siteOf("https://twitter.com/a/status/1").key, "x");
  assert.equal(y.siteOf("https://vm.tiktok.com/Z").key, "tiktok");
  assert.equal(y.siteOf("https://fb.watch/abc").key, "facebook");
  assert.deepEqual(y.siteOf("https://ornek.com/v"), { key: "other", label: "ornek.com" });
  assert.equal(y.siteOf("ftp:/x").key, "invalid");
  assert.equal(y.hasPlaylist("https://www.youtube.com/watch?v=a&list=PL1"), true);
  assert.equal(y.hasPlaylist("https://www.youtube.com/playlist?list=PL1"), true);
  assert.equal(y.hasPlaylist("https://www.youtube.com/watch?v=a"), false);
});

test("argümanlar: video kalitesi H.264/MP4, ffmpeg, JS çalıştırıcı, tek video", () => {
  const a = y.buildYtdlpArgs({ url: "https://www.youtube.com/watch?v=a&list=PL", workDir: "/w", quality: "1080", ffmpegPath: "/ff", jsRuntime: "/Elitlig" });
  assert.equal(flag(a, "-f"), "bv*[height<=1080]+ba/b[height<=1080]/bv*+ba/b");
  assert.match(flag(a, "-S"), /^res:1080,vcodec:h264/);
  assert.equal(flag(a, "--merge-output-format"), "mp4");
  assert.equal(flag(a, "--ffmpeg-location"), "/ff");
  assert.equal(flag(a, "--js-runtimes"), "node:/Elitlig");
  assert.ok(a.includes("--no-playlist"));
  assert.equal(flag(a, "-o"), path.join("/w", "%(playlist_index&{} - |)s%(title).150B.%(ext)s"));
  assert.deepEqual(a.slice(-2), ["--", "https://www.youtube.com/watch?v=a&list=PL"], "bağlantı seçenek olarak yorumlanamaz");
  const best = y.buildYtdlpArgs({ url: "https://x.com/a/status/1", workDir: "/w" });
  assert.equal(flag(best, "-f"), "bv*+ba/b");
  assert.ok(!best.includes("--cookies-from-browser"));
});

test("argümanlar: yalnız ses, görseller, oynatma listesi, tarayıcı çerezleri", () => {
  const mp3 = y.buildYtdlpArgs({ url: "https://youtu.be/a", mode: "audio" });
  assert.deepEqual([flag(mp3, "-x") === "--audio-format", flag(mp3, "--audio-format")], [true, "mp3"]);
  const m4a = y.buildYtdlpArgs({ url: "https://youtu.be/a", mode: "audio", audioFormat: "m4a" });
  assert.equal(flag(m4a, "--audio-format"), "m4a");
  const img = y.buildYtdlpArgs({ url: "https://www.instagram.com/p/X/", mode: "images", cookiesBrowser: "Safari" });
  assert.ok(img.includes("--skip-download") && img.includes("--write-thumbnail") && img.includes("--ignore-no-formats-error"));
  assert.equal(flag(img, "--cookies-from-browser"), "safari");
  const pl = y.buildYtdlpArgs({ url: "https://www.youtube.com/playlist?list=PL", playlist: true });
  assert.ok(pl.includes("--yes-playlist"));
  assert.equal(flag(pl, "--playlist-items"), "1:300");
  const carousel = y.buildYtdlpArgs({ url: "https://www.instagram.com/p/X/", withImages: true });
  assert.ok(carousel.includes("--write-thumbnail"), "video + gönderi fotoğrafları");
  assert.throws(() => y.buildYtdlpArgs({ url: "https://a.com", cookiesBrowser: "netscape; rm -rf" }), /Desteklenmeyen tarayıcı/);
  assert.throws(() => y.buildYtdlpArgs({ url: "--exec=evil" }), /Geçerli bir/);
  assert.throws(() => y.buildYtdlpArgs({ url: "file:///etc/passwd" }), /Geçerli bir/);
});

test("ilerleme: tek dosya yüzdesi, çoklu öğe toplamı, birleştirme notu", () => {
  let r = y.parseYtdlpProgress("[download]  42.0% of ~ 3.00MiB at 1.00MiB/s ETA 00:02\n");
  assert.equal(r.fraction, 0.42);
  r = y.parseYtdlpProgress("[download] Downloading item 2 of 4\n[download]  50.0% of 1MiB\n", r.state);
  assert.equal(r.fraction, (1 + 0.5) / 4);
  assert.equal(r.note, "2 / 4 indiriliyor");
  r = y.parseYtdlpProgress('[Merger] Merging formats into "a.mp4"\n', r.state);
  assert.equal(r.note, "Birleştiriliyor…");
  r = y.parseYtdlpProgress("[download] 100% of 1MiB\n", { index: 1, count: 1, pct: 0 });
  assert.equal(r.fraction, 0.99, "bitince iş tamamlanana dek %99");
});

test("hata metinleri: oturum / bot denetimi / 403 / desteklenmeyen / ağ", () => {
  const bot = "ERROR: [youtube] a: Sign in to confirm you’re not a bot. This helps protect our community.";
  assert.match(y.ytdlpError(bot, { site: "youtube" }), /YouTube bu indirme için oturum istiyor.*Tarayıcı çerezleri/);
  assert.match(y.ytdlpError(bot, { site: "youtube", cookies: true }), /giriş yapmış olduğunuzdan/);
  assert.match(y.ytdlpError("ERROR: [Instagram] X: Instagram sent an empty media response.", { site: "instagram" }), /Instagram bu içerik için oturum istiyor/);
  assert.match(y.ytdlpError("ERROR: [Instagram] X: There is no video in this post", { site: "instagram" }), /Görseller/);
  assert.match(y.ytdlpError("ERROR: unable to download video data: HTTP Error 403: Forbidden"), /403.*güncelleyin/);
  assert.match(y.ytdlpError("ERROR: Unsupported URL: https://a.com"), /desteklenmiyor/);
  assert.match(y.ytdlpError("ERROR: [generic] Unable to download webpage: <urlopen error [Errno -2] Name or service not known>"), /bağlanılamadı/);
  assert.match(y.ytdlpError("ERROR: could not find chrome cookies database in \"/x\""), /çerezleri okunamadı/);
  assert.equal(y.ytdlpError("ERROR: [foo] 1: Bilinmeyen sorun"), "Bilinmeyen sorun");
});

test("sürümler, GitHub etiketi, sürüm dosyası, SHA2-256SUMS", () => {
  assert.equal(y.compareVersions("2026.10.26", "2026.10.26"), 0);
  assert.equal(y.compareVersions("2026.11.1", "2026.10.26"), 1);
  assert.equal(y.compareVersions("2026.10.26", "2026.10.26.1"), -1);
  assert.equal(y.tagFromVersion("2026.1.5"), "2026.01.05");
  assert.equal(y.tagFromVersion("2026.10.26.1"), "2026.10.26.1");
  assert.deepEqual(y.releaseAsset("darwin", "arm64"), { asset: "yt-dlp_macos", bin: "yt-dlp" });
  assert.deepEqual(y.releaseAsset("win32", "x64"), { asset: "yt-dlp.exe", bin: "yt-dlp.exe" });
  assert.equal(y.releaseAsset("linux", "arm64").asset, "yt-dlp_linux_aarch64");
  const sums = y.parseSums(`${"a".repeat(64)}  yt-dlp.exe\n${"B".repeat(64)} *yt-dlp_macos\nbozuk satır\n`);
  assert.deepEqual(sums, { "yt-dlp.exe": "a".repeat(64), "yt-dlp_macos": "b".repeat(64) });
});

test("paketleme betiği: sabit sürüm ve özetler; package.json extraResources", () => {
  const { VERSION, TARGETS, parseSums } = require("../../build/fetch-ytdlp");
  assert.match(VERSION, /^\d{4}\.\d{2}\.\d{2}(\.\d+)?$/);
  for (const t of Object.values(TARGETS)) assert.match(t.sha, /^[0-9a-f]{64}$/);
  assert.equal(TARGETS.darwin.asset, "yt-dlp_macos");
  assert.equal(TARGETS.win32.bin, "yt-dlp.exe");
  assert.equal(parseSums(`${TARGETS.win32.sha}  yt-dlp.exe`)["yt-dlp.exe"], TARGETS.win32.sha);
  const pkg = require("../../package.json");
  const mac = pkg.build.mac.extraResources.find((r) => r.to === "yt-dlp");
  const win = pkg.build.win.extraResources.find((r) => r.to === "yt-dlp");
  assert.equal(mac.from, "build/yt-dlp/mac");
  assert.ok(mac.filter.includes("yt-dlp") && mac.filter.includes("VERSION.txt"));
  assert.equal(win.from, "build/yt-dlp/win-x64");
  assert.ok(win.filter.includes("yt-dlp.exe"));
  assert.equal(pkg.build.mac.x64ArchFiles, "Contents/Resources/yt-dlp/yt-dlp", "universal birleştirmede aynı (universal2) dosya");
  assert.match(pkg.scripts.dist, /npm run ytdlp/);
  assert.match(pkg.scripts["dist:win"], /npm run ytdlp:win/);
});

test("çözücü: seçilen yol → güncellenmiş (paketliden eski değilse) → paketli / geliştirme → sistem", () => {
  const root = tmp();
  const userData = path.join(root, "ud");
  const appRoot = path.join(root, "app");
  const exe = (p, version) => {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, "#!/bin/sh\necho 1\n", { mode: 0o755 });
    if (version) fs.writeFileSync(path.join(path.dirname(p), "VERSION.txt"), `${version}\n`);
  };
  let userPath = null;
  const app = { getPath: () => userData, isPackaged: false };
  const mk = () => createYtdlp({ app, net: null, appRoot, platform: "linux", arch: "x64", getUserPath: () => userPath });
  const dev = path.join(appRoot, "build", "yt-dlp", "linux", "yt-dlp");
  exe(dev, "2026.10.26");
  assert.equal(mk().resolve().source, "dev");
  const updated = path.join(userData, "yt-dlp", "yt-dlp");
  exe(updated, "2026.09.01");
  assert.equal(mk().resolve().source, "dev", "paketliden eski güncelleme kullanılmaz");
  fs.writeFileSync(path.join(userData, "yt-dlp", "VERSION.txt"), "2026.11.02\n");
  assert.equal(mk().resolve().source, "updated");
  assert.equal(mk().resolve().version, "2026.11.02");
  const custom = path.join(root, "benim", "yt-dlp");
  exe(custom);
  userPath = custom;
  assert.deepEqual([mk().resolve().source, mk().resolve().path], ["user", custom]);
  userPath = path.join(root, "yok");
  assert.equal(mk().resolve().source, "updated", "olmayan özel yol atlanır");
  const env = mk().runEnv();
  assert.equal(env.ELECTRON_RUN_AS_NODE, "1", "YouTube JS doğrulaması için Electron node olarak çalışır");
});

test("iptal: süreç grubu öldürülür (yt-dlp tek dosyalık ikilisi işi alt süreçte yapar)", { skip: process.platform !== "linux" }, () => {
  // Ayrı bir node sürecinde: ebeveyn kabuk uzun süren bir alt süreç başlatır (PyInstaller
  // önyükleyicisi gibi); iş iptal edilince alt sürecin durumu /proc'tan okunur.
  const { execFileSync } = require("node:child_process");
  const code = `
    const { createJobs } = require(${JSON.stringify(path.join(__dirname, "..", "fileTools", "jobs"))});
    const fs = require("fs"), os = require("os"), path = require("path");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gk-")); const pidFile = path.join(dir, "c.pid");
    const group = process.argv[1] === "1";
    const jobs = createJobs({ dir, killImpl: (c) => c.kill("SIGKILL") });
    const job = jobs.enqueue({ op: "x", label: "x", inputs: [], outDir: dir, run: (ctx) => ctx.spawn("/bin/sh", ["-c", 'sleep 30 & echo $! > "' + pidFile + '"; wait'], { group, onStdout: () => {} }) });
    const wait = setInterval(() => {
      if (!fs.existsSync(pidFile) || !fs.readFileSync(pidFile, "utf8").trim()) return;
      clearInterval(wait);
      const pid = Number(fs.readFileSync(pidFile, "utf8"));
      jobs.cancel(job.id);
      setTimeout(() => {
        let st = "gone";
        try { st = fs.readFileSync("/proc/" + pid + "/stat", "utf8").split(") ")[1][0]; } catch {}
        try { process.kill(pid, "SIGKILL"); } catch {}
        process.stdout.write(st);
        process.exit(0);
      }, 400);
    }, 30);`;
  const stateWith = (group) => execFileSync(process.execPath, ["-e", code, group ? "1" : "0"], { encoding: "utf8", timeout: 20000 });
  assert.ok(["Z", "gone"].includes(stateWith(true)), "grup öldürülünce alt süreç de durur");
  assert.equal(stateWith(false), "S", "yalnız ebeveyn öldürülürse alt süreç sürer (düzeltmenin gerekçesi)");
});
