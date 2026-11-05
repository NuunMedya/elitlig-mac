// Yayın Stüdyosu için ffmpeg'i indirir: build/ffmpeg/{arm64,x64}/ffmpeg
//
// electron-builder (package.json → build.mac.extraResources, "${arch}") her
// mimarinin derlemesine kendi ikilisini Contents/Resources/ffmpeg/ffmpeg olarak
// koyar; universal birleştirmede @electron/universal bu iki farklı Mach-O
// dosyasını lipo ile tek (arm64 + x86_64) ikiliye çevirir.
//
// Kaynak: Martin Riedl'in FFmpeg derleme sunucusu (https://ffmpeg.martin-riedl.de),
// FFmpeg 7.1.1, statik (yalnız sistem çerçeveleri), macOS 12+, GPLv3
// (--enable-gpl --enable-version3, nonfree yok). İçinde: h264_videotoolbox,
// libx264, aac, tee, segment, flv, matroska/webm, concat, rtmp/rtmps (tls).
// Sürüm sabittir; zip ve ikili SHA-256 ile doğrulanır.
//
//   node build/fetch-ffmpeg.js          # eksikse indir
//   node build/fetch-ffmpeg.js --force  # yeniden indir
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");

const VERSION = "7.1.1";
const BASE = "https://ffmpeg.martin-riedl.de/download/macos";
const BUILDS = {
  arm64: { id: "arm64/1741000090_7.1.1", zip: "e18c39a330ad783c33d6d7b47784e82a42f8acdbb497a1f73550f1bc0e830d44", bin: "a0c8a9eb2234780c5ac102ecb4b12f2375fe45bf7f6e8263ae3ab54e8f87acfd" },
  x64: { id: "amd64/1741001873_7.1.1", zip: "fd05ab8709c015b0a1922c65623beb8cff7f964c1524d060531bbb7b213b4cd2", bin: "c1cfcc29736c12a38ee14e028cd46dd0a66757be13147e1d9007c2822241d825" },
};

const OUT = path.join(__dirname, "ffmpeg");
const force = process.argv.includes("--force");
const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

const LICENSE = `Yayın Stüdyosu — ffmpeg ${VERSION}

Bu uygulama FFmpeg'i (https://ffmpeg.org) ayrı bir program olarak içerir ve
yalnız komut satırından çalıştırır. FFmpeg bu derlemede GNU General Public
License sürüm 3 (GPLv3) ile lisanslıdır: https://www.gnu.org/licenses/gpl-3.0.html

İkililer: Martin Riedl FFmpeg Build Server — https://ffmpeg.martin-riedl.de
  arm64: ${BASE}/${BUILDS.arm64.id}/ffmpeg.zip
  x86_64: ${BASE}/${BUILDS.x64.id}/ffmpeg.zip
Kaynak kodu ve derleme betikleri: https://ffmpeg.org/download.html,
https://git.martin-riedl.de/ffmpeg/build-script
`;

function fetchArch(arch) {
  const build = BUILDS[arch];
  const dir = path.join(OUT, arch);
  const bin = path.join(dir, "ffmpeg");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "LICENSE.txt"), LICENSE);
  if (!force && fs.existsSync(bin) && sha256(bin) === build.bin) {
    console.log(`ffmpeg ${arch}: hazır (${bin})`);
    return;
  }
  const tmp = fs.mkdtempSync(path.join(OUT, `.dl-${arch}-`));
  try {
    const zip = path.join(tmp, "ffmpeg.zip");
    const url = `${BASE}/${build.id}/ffmpeg.zip`;
    console.log(`ffmpeg ${arch}: indiriliyor ${url}`);
    execFileSync("curl", ["-fsSL", "--retry", "4", "--retry-delay", "3", "--connect-timeout", "30", "-o", zip, url], { stdio: "inherit" });
    const zipSum = sha256(zip);
    if (zipSum !== build.zip) throw new Error(`ffmpeg ${arch}: zip SHA-256 uyuşmuyor (${zipSum})`);
    execFileSync("unzip", ["-o", "-q", zip, "ffmpeg", "-d", tmp], { stdio: "inherit" });
    const extracted = path.join(tmp, "ffmpeg");
    const binSum = sha256(extracted);
    if (binSum !== build.bin) throw new Error(`ffmpeg ${arch}: ikili SHA-256 uyuşmuyor (${binSum})`);
    fs.chmodSync(extracted, 0o755);
    fs.renameSync(extracted, bin);
    console.log(`ffmpeg ${arch}: tamam (${(fs.statSync(bin).size / 1048576).toFixed(1)} MB)`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

for (const arch of Object.keys(BUILDS)) fetchArch(arch);
