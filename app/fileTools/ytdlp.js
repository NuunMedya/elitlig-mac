// yt-dlp çözücü ve güncelleyici (Dosya Araçları → "Bağlantıdan indir").
//
// Hangi ikili kullanılır (ilk bulunan):
//   1. Kullanıcının seçtiği yol (Ayarlar → yt-dlp → "Başka bir yt-dlp seç…")
//   2. Uygulamanın indirdiği / güncellediği kopya: <userData>/yt-dlp/ — paketli
//      sürümden eskiyse atlanır (uygulama güncellenince paketli olan daha yenidir)
//   3. Uygulamayla gelen: Resources/yt-dlp/yt-dlp(.exe) (build/fetch-ytdlp.js)
//   4. Geliştirme: build/yt-dlp/<mac|win-x64|linux>/
//   5. Sistem: PATH, Mac'te Homebrew
//
// Güncelleme: GitHub'daki son sürüm (API; olmazsa PyPI sürüm numarası) indirilir,
// aynı sürümün SHA2-256SUMS dosyasıyla doğrulanır, çalıştırılıp sürümü okunur,
// sonra <userData>/yt-dlp/ altına yerleştirilir. Mac'te ad-hoc imzalanır.
//
// YouTube'un JS doğrulaması için yt-dlp'ye node uyumlu bir çalıştırıcı verilir:
// uygulamanın kendi Electron ikilisi, ELECTRON_RUN_AS_NODE=1 ile (ayrı kurulum gerekmez).
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const native = require("./native");
const { compareVersions, tagFromVersion, releaseAsset, parseSums } = require("./ytdlpArgs");

const REPO = "yt-dlp/yt-dlp";
const DEV_DIRS = { darwin: "mac", win32: "win-x64", linux: "linux" };

function createYtdlp({ app, net, appRoot, platform = process.platform, arch = process.arch, getUserPath = () => null, log = () => {}, execPath = process.execPath }) {
  const { asset, bin } = releaseAsset(platform, arch);
  const userDir = path.join(app.getPath("userData"), "yt-dlp");
  const userBin = path.join(userDir, bin);
  const resources = app.isPackaged ? process.resourcesPath : null;
  const bundledBin = resources ? path.join(resources, "yt-dlp", bin) : null;
  const devBin = appRoot ? path.join(appRoot, "build", "yt-dlp", DEV_DIRS[platform] || "linux", bin) : null;
  const readVersionFile = (dir) => { try { return fs.readFileSync(path.join(dir, "VERSION.txt"), "utf8").trim() || null; } catch { return null; } };
  const isExec = (p) => { try { fs.accessSync(p, platform === "win32" ? fs.constants.F_OK : fs.constants.X_OK); return fs.statSync(p).isFile(); } catch { return false; } };

  /** → [{ path, source, version? }] (var olanlar). */
  function candidates() {
    const out = [];
    const user = getUserPath();
    if (user && isExec(user)) out.push({ path: user, source: "user" });
    const packaged = [bundledBin, devBin].filter(Boolean).find(isExec);
    const packagedVersion = packaged ? readVersionFile(path.dirname(packaged)) : null;
    if (isExec(userBin)) {
      const v = readVersionFile(userDir);
      if (!packaged || !packagedVersion || !v || compareVersions(v, packagedVersion) >= 0) out.push({ path: userBin, source: "updated", version: v });
    }
    if (packaged) out.push({ path: packaged, source: packaged === bundledBin ? "bundled" : "dev", version: packagedVersion });
    const sys = native.findTool("yt-dlp", { platform });
    if (sys) out.push({ path: sys, source: "system" });
    return out;
  }
  const resolve = () => candidates()[0] || null;

  /** Çalıştırılacak ortam: Electron'u node olarak (YouTube JS doğrulaması) kullanabilsin. */
  const runEnv = () => ({ ...process.env, ELECTRON_RUN_AS_NODE: "1", PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1" });
  const jsRuntime = () => execPath;

  const versionCache = new Map();
  async function versionOf(p) {
    if (!p) return null;
    if (versionCache.has(p)) return versionCache.get(p);
    const res = await native.run(p, ["--version"], { timeout: 60000, env: runEnv() });
    const v = res.ok ? String(res.stdout).trim().split(/\s+/)[0] : null;
    if (v) versionCache.set(p, v);
    return v;
  }

  async function status() {
    const c = resolve();
    const version = c ? c.version || (await versionOf(c.path)) : null;
    return { available: Boolean(c), path: c?.path || null, source: c?.source || null, version, userPath: getUserPath() || null, canUpdate: true, updating: Boolean(updating) };
  }

  /* -------------------------------- güncelleme -------------------------------- */

  async function fetchText(url) {
    const res = await net.fetch(url, { headers: { "User-Agent": "ElitligAraclar", Accept: "application/json, text/plain" }, signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
    return res.text();
  }
  async function latestTag() {
    try {
      const j = JSON.parse(await fetchText(`https://api.github.com/repos/${REPO}/releases/latest`));
      if (j?.tag_name) return String(j.tag_name);
    } catch (e) { log("ytdlp: GitHub API", e?.message); }
    const p = JSON.parse(await fetchText("https://pypi.org/pypi/yt-dlp/json"));
    if (!p?.info?.version) throw new Error("Son sürüm bilgisi alınamadı.");
    return tagFromVersion(p.info.version);
  }

  let updating = null;
  /** Son sürümü indirir. onProgress({ phase, fraction }). → { ok, version, path, already } */
  function update({ onProgress = () => {} } = {}) {
    if (updating) return updating;
    updating = (async () => {
      onProgress({ phase: "check", fraction: null });
      const tag = await latestTag();
      const current = resolve();
      const currentVersion = current ? current.version || (await versionOf(current.path)) : null;
      if (current && current.source !== "user" && current.source !== "system" && currentVersion && compareVersions(currentVersion, tag) >= 0) {
        return { ok: true, version: currentVersion, path: current.path, already: true };
      }
      const base = `https://github.com/${REPO}/releases/download/${tag}`;
      const sums = parseSums(await fetchText(`${base}/SHA2-256SUMS`));
      const expected = sums[asset];
      if (!expected) throw new Error(`Sürüm ${tag} içinde ${asset} yok.`);
      const res = await net.fetch(`${base}/${asset}`, { headers: { "User-Agent": "ElitligAraclar" } });
      if (!res.ok || !res.body) throw new Error(`İndirilemedi (HTTP ${res.status}).`);
      const total = Number(res.headers.get("content-length")) || 0;
      fs.mkdirSync(userDir, { recursive: true });
      const part = path.join(userDir, `.${bin}.${process.pid}.part`);
      const hash = crypto.createHash("sha256");
      const out = fs.openSync(part, "w", 0o755);
      let got = 0;
      let last = 0;
      try {
        const reader = res.body.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          const buf = Buffer.from(value);
          hash.update(buf);
          fs.writeSync(out, buf);
          got += buf.length;
          if (total && Date.now() - last > 250) { last = Date.now(); onProgress({ phase: "download", fraction: got / total }); }
        }
      } finally { fs.closeSync(out); }
      const sum = hash.digest("hex");
      if (sum !== expected) { fs.rmSync(part, { force: true }); throw new Error("İndirilen yt-dlp doğrulanamadı (SHA-256 uyuşmuyor)."); }
      fs.chmodSync(part, 0o755);
      if (platform === "darwin") {
        // Apple Silicon imzasız ikiliyi çalıştırmaz: ad-hoc imza (codesign her Mac'te var).
        await native.run("/usr/bin/codesign", ["--force", "--sign", "-", part], { timeout: 60000 });
        await native.run("/usr/bin/xattr", ["-d", "com.apple.quarantine", part], { timeout: 10000 });
      }
      onProgress({ phase: "verify", fraction: null });
      const check = await native.run(part, ["--version"], { timeout: 120000, env: runEnv() });
      const version = check.ok ? String(check.stdout).trim().split(/\s+/)[0] : null;
      if (!version) { fs.rmSync(part, { force: true }); throw new Error("İndirilen yt-dlp çalıştırılamadı."); }
      fs.renameSync(part, userBin);
      fs.writeFileSync(path.join(userDir, "VERSION.txt"), `${version}\n`);
      versionCache.clear();
      log("ytdlp: güncellendi", version);
      return { ok: true, version, path: userBin, already: false };
    })().finally(() => { updating = null; });
    return updating;
  }

  return { resolve, candidates, status, versionOf, update, runEnv, jsRuntime, paths: { userBin, bundledBin, devBin } };
}

module.exports = { createYtdlp };
