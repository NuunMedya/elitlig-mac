// Dosya Araçları "Bağlantıdan indir" (YouTube, Instagram, X, TikTok, Facebook…)
// için yt-dlp'yi indirir ve uygulamaya paketlenecek yere koyar:
//   Mac:     build/yt-dlp/mac/yt-dlp        (yt-dlp_macos — universal2: arm64 + x86_64)
//   Windows: build/yt-dlp/win-x64/yt-dlp.exe
//   Linux:   build/yt-dlp/linux/yt-dlp      (yalnız geliştirme / test; paketlenmez)
//
// electron-builder (package.json → build.mac / build.win extraResources) ikiliyi
// Resources/yt-dlp/ altına koyar. yt-dlp_macos zaten universal olduğundan Mac
// universal birleştirmesinde iki derlemede aynı dosyadır; build.mac.x64ArchFiles
// bu dosyayı lipo'dan muaf tutar. build/afterPack.js Mac'te ad-hoc imzalar.
//
// Kaynak: https://github.com/yt-dlp/yt-dlp/releases (Unlicense, kamu malı).
// Sürüm sabittir; her ikili hem bu dosyadaki SHA-256 ile hem de aynı sürümün
// SHA2-256SUMS dosyasıyla doğrulanır. Uygulama çalışırken daha yeni bir sürümü
// kullanıcı klasörüne indirebilir (Dosya Araçları → Ayarlar → yt-dlp: Güncelle).
//
//   node build/fetch-ytdlp.js                     # bu işletim sistemi için (Windows'ta win32, diğerlerinde Mac)
//   node build/fetch-ytdlp.js --platform win32    # Windows ikilisi
//   node build/fetch-ytdlp.js --platform darwin   # Mac ikilisi
//   node build/fetch-ytdlp.js --platform linux    # Linux (geliştirme)
//   node build/fetch-ytdlp.js --platform all      # Mac + Windows
//   node build/fetch-ytdlp.js --force             # yeniden indir
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");

const VERSION = "2026.10.26";
const BASE = `https://github.com/yt-dlp/yt-dlp/releases/download/${VERSION}`;
const TARGETS = {
  darwin: { dir: "mac", asset: "yt-dlp_macos", bin: "yt-dlp", sha: "0f922c15ccc0b83eefa1c8bc9104e434318c4bf16e408e1ee93b7745a6efe0aa" },
  win32: { dir: "win-x64", asset: "yt-dlp.exe", bin: "yt-dlp.exe", sha: "f5389d3698ecde4ef06f4e6b1ce0294fe9ac1396228c8990b8d3416d6d177a7d" },
  linux: { dir: "linux", asset: "yt-dlp_linux", bin: "yt-dlp", sha: "767ba9dce7052aa196f8b12652f433d76de128ba168966fa84b6394d5e6c6795" },
};

const OUT = path.join(__dirname, "yt-dlp");
const force = process.argv.includes("--force");
const argValue = (name) => {
  const i = process.argv.indexOf(name);
  if (i >= 0) return process.argv[i + 1];
  const eq = process.argv.find((a) => a.startsWith(`${name}=`));
  return eq ? eq.slice(name.length + 1) : undefined;
};
const PLATFORM = argValue("--platform") || (process.platform === "win32" ? "win32" : "darwin");
const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

/** SHA2-256SUMS metninden ad → özet. */
function parseSums(text) {
  const out = {};
  for (const line of String(text || "").split(/\r?\n/)) {
    const m = line.trim().match(/^([0-9a-f]{64})\s+\*?(.+)$/i);
    if (m) out[m[2].trim()] = m[1].toLowerCase();
  }
  return out;
}

const LICENSE = `Elitlig Araçlar — yt-dlp ${VERSION}

Bu uygulama yt-dlp'yi (https://github.com/yt-dlp/yt-dlp) ayrı bir program olarak
içerir ve yalnız komut satırından çalıştırır. yt-dlp, The Unlicense ile kamu
malıdır: https://github.com/yt-dlp/yt-dlp/blob/master/LICENSE
Paketli ikililer içinde üçüncü taraf bileşenlerin lisansları:
https://github.com/yt-dlp/yt-dlp/blob/master/THIRD_PARTY_LICENSES.txt

İkili: ${BASE}/<yt-dlp_macos | yt-dlp.exe>
`;

const curl = (url, out) => execFileSync("curl", ["-fsSL", "--retry", "4", "--retry-delay", "3", "--connect-timeout", "30", "-o", out, url], { stdio: "inherit" });

function fetchTarget(platform, sums) {
  const t = TARGETS[platform];
  const dir = path.join(OUT, t.dir);
  const bin = path.join(dir, t.bin);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "LICENSE.txt"), LICENSE);
  // Uygulama paketli sürümü buradan okur (indirilen güncellemeyle karşılaştırmak için).
  fs.writeFileSync(path.join(dir, "VERSION.txt"), `${VERSION}\n`);
  if (!force && fs.existsSync(bin) && sha256(bin) === t.sha) {
    console.log(`yt-dlp ${t.dir}: hazır (${bin})`);
    return;
  }
  const listed = sums()[t.asset];
  if (listed !== t.sha) throw new Error(`yt-dlp ${t.asset}: SHA2-256SUMS (${listed || "yok"}) sabit özetle uyuşmuyor`);
  const tmp = fs.mkdtempSync(path.join(OUT, `.dl-${t.dir}-`));
  try {
    const part = path.join(tmp, t.bin);
    console.log(`yt-dlp ${t.dir}: indiriliyor ${BASE}/${t.asset}`);
    curl(`${BASE}/${t.asset}`, part);
    const sum = sha256(part);
    if (sum !== t.sha) throw new Error(`yt-dlp ${t.asset}: SHA-256 uyuşmuyor (${sum})`);
    fs.chmodSync(part, 0o755);
    fs.rmSync(bin, { force: true });
    fs.renameSync(part, bin);
    console.log(`yt-dlp ${t.dir}: tamam (${(fs.statSync(bin).size / 1048576).toFixed(1)} MB)`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function main() {
  const list = PLATFORM === "all" ? ["darwin", "win32"] : [PLATFORM];
  if (!list.every((p) => TARGETS[p])) {
    console.error(`Bilinmeyen --platform: ${PLATFORM} (darwin | win32 | linux | all)`);
    process.exit(2);
  }
  fs.mkdirSync(OUT, { recursive: true });
  let cached = null;
  const sums = () => {
    if (cached) return cached;
    const file = path.join(fs.mkdtempSync(path.join(OUT, ".sums-")), "SHA2-256SUMS");
    try {
      curl(`${BASE}/SHA2-256SUMS`, file);
      cached = parseSums(fs.readFileSync(file, "utf8"));
    } finally {
      fs.rmSync(path.dirname(file), { recursive: true, force: true });
    }
    return cached;
  };
  for (const p of list) fetchTarget(p, sums);
}

if (require.main === module) main();

module.exports = { VERSION, TARGETS, parseSums };
