// Yayın Stüdyosu için ffmpeg'i indirir:
//   Mac:     build/ffmpeg/{arm64,x64}/ffmpeg
//   Windows: build/ffmpeg/win-x64/ffmpeg.exe
//
// ---------------------------------- Mac ----------------------------------
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
// -------------------------------- Windows --------------------------------
//
// electron-builder (build.win.extraResources) ikiliyi resources/ffmpeg/ffmpeg.exe
// olarak koyar. Kaynak: Gyan Doshi'nin FFmpeg Windows derlemeleri
// (https://www.gyan.dev/ffmpeg/builds/, GitHub: GyanD/codexffmpeg, sabit
// "7.1.1" sürüm etiketi), "essentials" statik derleme, GPLv3 (--enable-gpl
// --enable-version3, nonfree yok). İçinde: libx264, h264_nvenc (NVIDIA),
// h264_qsv (Intel, libvpl), h264_amf (AMD), h264_mf (Media Foundation), aac,
// tee, segment, flv, matroska, concat, rtmp/rtmps (gnutls). Zip yalnız
// Node ile açılır (unzip/tar gerekmez); zip ve ffmpeg.exe SHA-256 ile doğrulanır.
// ffprobe kullanılmaz (klip yoklaması "ffmpeg -i" ile yapılır).
//
//   node build/fetch-ffmpeg.js                     # bu işletim sistemi için (Windows'ta win32, diğerlerinde Mac)
//   node build/fetch-ffmpeg.js --platform win32    # Windows ikilisi (Mac/Linux'ta da indirilebilir)
//   node build/fetch-ffmpeg.js --platform darwin   # Mac ikilileri
//   node build/fetch-ffmpeg.js --platform all      # hepsi
//   node build/fetch-ffmpeg.js --force             # yeniden indir
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const zlib = require("node:zlib");
const { execFileSync } = require("node:child_process");

const VERSION = "7.1.1";
const BASE = "https://ffmpeg.martin-riedl.de/download/macos";
const BUILDS = {
  arm64: { id: "arm64/1741000090_7.1.1", zip: "e18c39a330ad783c33d6d7b47784e82a42f8acdbb497a1f73550f1bc0e830d44", bin: "a0c8a9eb2234780c5ac102ecb4b12f2375fe45bf7f6e8263ae3ab54e8f87acfd" },
  x64: { id: "amd64/1741001873_7.1.1", zip: "fd05ab8709c015b0a1922c65623beb8cff7f964c1524d060531bbb7b213b4cd2", bin: "c1cfcc29736c12a38ee14e028cd46dd0a66757be13147e1d9007c2822241d825" },
};

const WIN = {
  dir: "win-x64",
  version: "7.1.1",
  url: "https://github.com/GyanD/codexffmpeg/releases/download/7.1.1/ffmpeg-7.1.1-essentials_build.zip",
  member: "ffmpeg-7.1.1-essentials_build/bin/ffmpeg.exe",
  zip: "04861d3339c5ebe38b56c19a15cf2c0cc97f5de4fa8910e4d47e5e6404e4a2d4",
  bin: "b90225987bdd042cca09a1efb5e34e9848f2d1dbf5fbcd388753a44145522997",
};

const OUT = path.join(__dirname, "ffmpeg");
const force = process.argv.includes("--force");
const argValue = (name) => {
  const i = process.argv.indexOf(name);
  if (i >= 0) return process.argv[i + 1];
  const eq = process.argv.find((a) => a.startsWith(`${name}=`));
  return eq ? eq.slice(name.length + 1) : undefined;
};
const PLATFORM = argValue("--platform") || (process.platform === "win32" ? "win32" : "darwin");
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

/* -------------------------------- Windows -------------------------------- */

const WIN_LICENSE = `Yayın Stüdyosu — ffmpeg ${WIN.version} (Windows x64)

Bu uygulama FFmpeg'i (https://ffmpeg.org) ayrı bir program olarak içerir ve
yalnız komut satırından çalıştırır. FFmpeg bu derlemede GNU General Public
License sürüm 3 (GPLv3) ile lisanslıdır: https://www.gnu.org/licenses/gpl-3.0.html

İkili: Gyan Doshi FFmpeg Windows derlemesi (essentials) — https://www.gyan.dev/ffmpeg/builds/
  ${WIN.url}
Kaynak kodu: https://ffmpeg.org/download.html, https://github.com/FFmpeg/FFmpeg
(derleme yapılandırması: ffmpeg.exe -version)
`;

/** Zip içinden tek bir dosyayı (stored / deflate) çıkarır; dış araç gerekmez. */
function extractZipMember(zipFile, member) {
  const buf = fs.readFileSync(zipFile);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("zip: dizin sonu bulunamadı");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("zip: merkezi dizin bozuk");
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    if (name === member) {
      if (compSize === 0xffffffff || local === 0xffffffff) throw new Error("zip: zip64 desteklenmiyor");
      if (buf.readUInt32LE(local) !== 0x04034b50) throw new Error("zip: yerel başlık bozuk");
      const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
      const data = buf.subarray(start, start + compSize);
      if (method === 0) return Buffer.from(data);
      if (method === 8) return zlib.inflateRawSync(data);
      throw new Error(`zip: desteklenmeyen sıkıştırma (${method})`);
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error(`zip: ${member} yok`);
}

function fetchWindows() {
  const dir = path.join(OUT, WIN.dir);
  const bin = path.join(dir, "ffmpeg.exe");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "LICENSE.txt"), WIN_LICENSE);
  if (!force && fs.existsSync(bin) && sha256(bin) === WIN.bin) {
    console.log(`ffmpeg win-x64: hazır (${bin})`);
    return;
  }
  const tmp = fs.mkdtempSync(path.join(OUT, ".dl-win-x64-"));
  try {
    const zip = path.join(tmp, "ffmpeg.zip");
    console.log(`ffmpeg win-x64: indiriliyor ${WIN.url}`);
    execFileSync("curl", ["-fsSL", "--retry", "4", "--retry-delay", "3", "--connect-timeout", "30", "-o", zip, WIN.url], { stdio: "inherit" });
    const zipSum = sha256(zip);
    if (zipSum !== WIN.zip) throw new Error(`ffmpeg win-x64: zip SHA-256 uyuşmuyor (${zipSum})`);
    const data = extractZipMember(zip, WIN.member);
    const binSum = crypto.createHash("sha256").update(data).digest("hex");
    if (binSum !== WIN.bin) throw new Error(`ffmpeg win-x64: ikili SHA-256 uyuşmuyor (${binSum})`);
    const part = path.join(tmp, "ffmpeg.exe");
    fs.writeFileSync(part, data, { mode: 0o755 });
    fs.rmSync(bin, { force: true });
    fs.renameSync(part, bin);
    console.log(`ffmpeg win-x64: tamam (${(data.length / 1048576).toFixed(1)} MB)`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

if (!["darwin", "win32", "all"].includes(PLATFORM)) {
  console.error(`Bilinmeyen --platform: ${PLATFORM} (darwin | win32 | all)`);
  process.exit(2);
}
if (PLATFORM === "darwin" || PLATFORM === "all") for (const arch of Object.keys(BUILDS)) fetchArch(arch);
if (PLATFORM === "win32" || PLATFORM === "all") fetchWindows();
