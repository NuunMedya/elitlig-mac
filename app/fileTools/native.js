// Dosya Araçları — işletim sistemi araçları ve isteğe bağlı kütüphaneler.
//
//   Mac:     sips (görsel biçimleri, HEIC), ditto (ZIP), gs (varsa: PDF sıkıştırma)
//   Windows: PowerShell Compress-Archive / Expand-Archive (ZIP), ffmpeg (HEIC/TIFF)
//   Diğer:   zip / unzip (geliştirme, test)
//   İsteğe bağlı JS kütüphaneleri: pdf-lib (PDF birleştir / böl / sırala / döndür),
//   jsqr (QR okuma, BarcodeDetector'ın olmadığı sistemlerde). Yüklü değillerse
//   ilgili araç "güncelleme gerekiyor" der; uygulama yine açılır.
//
// Tüm çağrılar argüman dizisiyle yapılır (kabuk yok). PowerShell'e yollar ortam
// değişkeninde JSON olarak verilir: komut metnine hiçbir yol karışmaz.
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { execFile } = require("node:child_process");

/** Kütüphane yüklü değilse null (uygulama derlenir ve açılır; araç güncelleme ister). */
function loadOptional(name, requireImpl = require) {
  try { return requireImpl(name); } catch { return null; }
}

const UPDATE_NEEDED = "Bu özellik için uygulama güncellemesi gerekiyor.";

const isExec = (p) => {
  try { fs.accessSync(p, fs.constants.X_OK); return fs.statSync(p).isFile(); } catch { return false; }
};

/** PATH + Homebrew içinde araç arar; yoksa null. */
function findTool(name, { env = process.env, platform = process.platform, extra = [] } = {}) {
  const win = platform === "win32";
  const P = win ? path.win32 : path.posix;
  const exe = win && !/\.exe$/i.test(name) ? `${name}.exe` : name;
  const dirs = [...extra];
  if (platform === "darwin") dirs.push("/usr/bin", "/opt/homebrew/bin", "/usr/local/bin");
  const pathVar = env.PATH ?? env.Path ?? env.path ?? "";
  dirs.push(...String(pathVar).split(P.delimiter).filter(Boolean).map((d) => d.replace(/^"|"$/g, "")));
  for (const d of dirs) {
    const candidate = P.join(d, exe);
    if (isExec(candidate)) return candidate;
  }
  return null;
}

function powershellPath(env = process.env) {
  const root = env.SystemRoot || env.windir || "C:\\Windows";
  const p = path.win32.join(root, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  return isExec(p) ? p : findTool("powershell", { env, platform: "win32" });
}

/** Kısa süreli araç çağrısı (iş kuyruğu dışında: yoklama, küçük dönüşümler). */
const run = (file, args, { timeout = 60000, env, cwd } = {}) => new Promise((resolve) => {
  execFile(file, args, { timeout, env, cwd, maxBuffer: 16 * 1024 * 1024, windowsHide: true }, (error, stdout, stderr) => {
    resolve({ ok: !error, stdout: String(stdout || ""), stderr: String(stderr || ""), error });
  });
});

/* ---------------------------------- sips ---------------------------------- */

const SIPS_FORMATS = { jpg: "jpeg", jpeg: "jpeg", png: "png", tiff: "tiff", tif: "tiff", bmp: "bmp", gif: "gif", heic: "heic", pdf: "pdf" };

/** sips argümanları: biçim dönüştürme (+ isteğe bağlı kalite 0–100). */
function sipsArgs(input, output, outExt, { quality = null } = {}) {
  const fmt = SIPS_FORMATS[outExt];
  if (!fmt) throw new Error("sips bu biçimi yazamaz.");
  const q = quality != null && (fmt === "jpeg" || fmt === "heic") ? ["-s", "formatOptions", String(Math.round(Math.max(1, Math.min(100, quality))))] : [];
  return ["-s", "format", fmt, ...q, input, "--out", output];
}

/* ----------------------------------- ZIP ----------------------------------- */

/**
 * ZIP oluşturma komutu: { file, args, env, cwd, staging } — staging: önce kopyaların
 * konacağı klasör (Mac ve diğerleri; Windows doğrudan yollarla çalışır).
 */
function zipCommand({ inputs, output, workDir, platform = process.platform, env = process.env }) {
  if (platform === "win32") {
    const ps = powershellPath(env);
    const script = "$ErrorActionPreference='Stop'; $p = $env:ELITLIG_ARGS | ConvertFrom-Json; Compress-Archive -LiteralPath $p.src -DestinationPath $p.dest -CompressionLevel Optimal";
    return { file: ps, args: ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script], env: { ...env, ELITLIG_ARGS: JSON.stringify({ src: inputs, dest: output }) }, staging: null };
  }
  const staging = path.join(workDir, "zip-staging");
  if (platform === "darwin") return { file: "/usr/bin/ditto", args: ["-c", "-k", "--sequesterRsrc", staging, output], staging };
  return { file: findTool("zip", { env, platform }) || "zip", args: ["-r", "-q", "-X", output, "."], cwd: staging, staging };
}

function unzipCommand({ input, dest, platform = process.platform, env = process.env }) {
  if (platform === "win32") {
    const script = "$ErrorActionPreference='Stop'; $p = $env:ELITLIG_ARGS | ConvertFrom-Json; Expand-Archive -LiteralPath $p.src -DestinationPath $p.dest";
    return { file: powershellPath(env), args: ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script], env: { ...env, ELITLIG_ARGS: JSON.stringify({ src: input, dest }) } };
  }
  if (platform === "darwin") return { file: "/usr/bin/ditto", args: ["-x", "-k", input, dest] };
  return { file: findTool("unzip", { env, platform }) || "unzip", args: ["-q", input, "-d", dest] };
}

/** ZIP için kopyaları hazırlar (APFS'te klonlanır, yer kaplamaz). Aynı adlar numaralanır. */
function stageInputs(inputs, staging) {
  fs.mkdirSync(staging, { recursive: true });
  const used = new Set();
  for (const src of inputs) {
    const base = path.basename(src);
    let name = base;
    for (let n = 2; used.has(name.toLowerCase()); n += 1) {
      const ext = path.extname(base);
      name = `${path.basename(base, ext)} (${n})${ext}`;
    }
    used.add(name.toLowerCase());
    fs.cpSync(src, path.join(staging, name), { recursive: true, mode: fs.constants.COPYFILE_FICLONE, verbatimSymlinks: true });
  }
}

/* ----------------------------------- PDF ----------------------------------- */

function pdfLib() {
  const lib = loadOptional("pdf-lib");
  if (!lib?.PDFDocument) throw Object.assign(new Error(UPDATE_NEEDED), { code: "UPDATE_NEEDED" });
  return lib;
}

async function loadPdf(file) {
  const { PDFDocument } = pdfLib();
  try {
    return await PDFDocument.load(fs.readFileSync(file), { updateMetadata: false });
  } catch (e) {
    if (/encrypt/i.test(String(e?.message || e?.name))) throw new Error(`${path.basename(file)}: parola korumalı PDF işlenemez.`);
    throw new Error(`${path.basename(file)}: PDF okunamadı.`);
  }
}

async function pdfInfo(file) {
  const doc = await loadPdf(file);
  return { pages: doc.getPageCount(), sizes: doc.getPages().slice(0, 500).map((p) => { const { width, height } = p.getSize(); return { width: Math.round(width), height: Math.round(height), rotate: p.getRotation().angle || 0 }; }) };
}

async function pdfMerge(inputs, output) {
  const { PDFDocument } = pdfLib();
  const out = await PDFDocument.create();
  for (const file of inputs) {
    const src = await loadPdf(file);
    const pages = await out.copyPages(src, src.getPageIndices());
    pages.forEach((p) => out.addPage(p));
  }
  fs.writeFileSync(output, await out.save({ useObjectStreams: true }));
  return out.getPageCount();
}

/** pages: [{ index (0'dan), rotate (derece, ek döndürme) }] — sıralama, silme, çoğaltma, döndürme. */
async function pdfOrganize(input, pages, output) {
  const { PDFDocument, degrees } = pdfLib();
  const src = await loadPdf(input);
  const count = src.getPageCount();
  const list = (Array.isArray(pages) ? pages : []).filter((p) => Number.isInteger(p?.index) && p.index >= 0 && p.index < count);
  if (!list.length) throw new Error("En az bir sayfa kalmalı.");
  const out = await PDFDocument.create();
  const copied = await out.copyPages(src, list.map((p) => p.index));
  copied.forEach((page, i) => {
    const extra = ((Math.round(Number(list[i].rotate) / 90) * 90) % 360 + 360) % 360;
    if (extra) page.setRotation(degrees((page.getRotation().angle + extra) % 360));
    out.addPage(page);
  });
  fs.writeFileSync(output, await out.save({ useObjectStreams: true }));
  return out.getPageCount();
}

/** groups: [[1,2,3],[4]] (1'den başlayan sayfa numaraları) → her grup ayrı dosya. */
async function pdfSplit(input, groups, outputFor) {
  const { PDFDocument } = pdfLib();
  const src = await loadPdf(input);
  const files = [];
  for (let g = 0; g < groups.length; g += 1) {
    const out = await PDFDocument.create();
    const pages = await out.copyPages(src, groups[g].map((n) => n - 1));
    pages.forEach((p) => out.addPage(p));
    const file = outputFor(g, groups[g]);
    fs.writeFileSync(file, await out.save({ useObjectStreams: true }));
    files.push(file);
  }
  return files;
}

/** Yalnız yeniden yazma (nesne akışları): gs yoksa küçük bir kazanç sağlar. */
async function pdfResave(input, output) {
  const doc = await loadPdf(input);
  fs.writeFileSync(output, await doc.save({ useObjectStreams: true }));
}

/** Ghostscript ile PDF sıkıştırma argümanları. quality: screen | ebook | printer */
function gsCompressArgs(input, output, quality = "ebook") {
  const q = ["screen", "ebook", "printer"].includes(quality) ? quality : "ebook";
  return ["-sDEVICE=pdfwrite", "-dCompatibilityLevel=1.6", `-dPDFSETTINGS=/${q}`, "-dNOPAUSE", "-dQUIET", "-dBATCH", "-dSAFER", `-sOutputFile=${output}`, input];
}

/* ------------------------------------ QR ------------------------------------ */

/** BGRA (nativeImage.toBitmap) → RGBA. */
function bgraToRgba(buf) {
  const out = new Uint8ClampedArray(buf.length);
  for (let i = 0; i < buf.length; i += 4) {
    out[i] = buf[i + 2]; out[i + 1] = buf[i + 1]; out[i + 2] = buf[i]; out[i + 3] = buf[i + 3];
  }
  return out;
}

/** jsQR ile görseldeki QR kodu (nativeImage verilir). → [{ text }] */
function readQr(image) {
  const jsQR = loadOptional("jsqr");
  if (typeof jsQR !== "function") throw Object.assign(new Error(UPDATE_NEEDED), { code: "UPDATE_NEEDED" });
  let img = image;
  const size = img.getSize();
  if (!size.width) throw new Error("Görsel okunamadı.");
  const results = [];
  for (const max of [1600, 900, 2600]) {
    const scaled = Math.max(size.width, size.height) > max ? img.resize({ [size.width >= size.height ? "width" : "height"]: max, quality: "best" }) : img;
    const { width, height } = scaled.getSize();
    const hit = jsQR(bgraToRgba(scaled.toBitmap()), width, height, { inversionAttempts: "attemptBoth" });
    if (hit?.data) { results.push({ text: hit.data }); break; }
    if (scaled === img) break;
  }
  return results;
}

module.exports = {
  loadOptional, UPDATE_NEEDED, findTool, powershellPath, run, SIPS_FORMATS, sipsArgs, zipCommand, unzipCommand, stageInputs,
  pdfLib, pdfInfo, pdfMerge, pdfOrganize, pdfSplit, pdfResave, gsCompressArgs, bgraToRgba, readQr,
};
