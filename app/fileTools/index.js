// Dosya Araçları — ana süreç kaydı (IPC, iş kuyruğu, Float rafı).
//
// Arayüz (renderer/src/views/files) dosyaları sürükle-bırak / seç / yapıştır ile
// ekler; preload webUtils.getPathForFile ile yolu bulur, burada izin listesine
// alınır (protocol.js). İşlemler:
//   - Görsel düzenleme / JPG-PNG-WEBP dönüştürme / sıkıştırma / kolaj: arayüzde
//     canvas ile; çıktı baytları "ft:client:*" ile buraya yazılır.
//   - Ses / video: ffmpeg (Yayın Stüdyosu'nun bulduğu ikili; app/studio/ffmpeg.js).
//   - HEIC / TIFF / BMP / GIF: Mac'te sips, diğerlerinde ffmpeg.
//   - PDF: pdf-lib (isteğe bağlı bağımlılık), görsel / HTML / metin → PDF: printToPDF.
//   - ZIP: Mac ditto, Windows PowerShell.  Altyazı / metin kodlaması: saf JS (text.js).
//   - Web'den medya (YouTube, Instagram, X, TikTok, Facebook…): yt-dlp — uygulamayla
//     gelir (build/fetch-ytdlp.js), uygulama içinden güncellenir (ytdlp.js).
// Çıktılar ayarlardaki klasöre (varsayılan İndirilenler/Elitlig Dosyalar) ya da
// kaynağın yanına yazılır; orijinal dosyalar asla değişmez.
//
// IPC: ft:* (bkz. preload.js "fileTools"), float:* (Float rafı).
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL, fileURLToPath } = require("node:url");
const { createClipboardIo } = require("../clipboardIo");
const ff = require("../studio/ffmpeg");
const { killProcess } = require("../studio/proc");
const { createJobs } = require("./jobs");
const { createRegistry, serveFile, idOf } = require("./protocol");
const { createFloat } = require("./float");
const { kindOf, extOf, TARGETS } = require("./formats");
const { buildMediaArgs, buildJoinArgs, buildImageConvertArgs, parseEncoders } = require("./ffargs");
const native = require("./native");
const text = require("./text");
const { sanitizeName, stemOf } = require("./paths");
const { createYtdlp } = require("./ytdlp");
const { buildYtdlpArgs, parseYtdlpProgress, ytdlpError, siteOf, isHttpUrl } = require("./ytdlpArgs");

const MEDIA_OPS = new Set(["convert", "trim", "compress", "speed", "mute", "extractAudio", "normalize", "resize", "cropAspect", "rotate", "gif", "snapshot", "split"]);
const SUFFIX = {
  trim: "kirpildi", compress: "sikistirildi", mute: "sessiz", normalize: "normalize", rotate: "donduruldu", snapshot: "kare", split: "parca",
};
const LABELS = {
  convert: "Dönüştür", trim: "Kırp", compress: "Sıkıştır", speed: "Hız", mute: "Sesi kapat", extractAudio: "Sesi ayıkla", normalize: "Ses normalize",
  resize: "Çözünürlük", cropAspect: "Görüntü kırp", rotate: "Döndür", gif: "GIF yap", snapshot: "Kare yakala", split: "Böl", join: "Birleştir",
  imageConvert: "Görsel dönüştür", imagesToPdf: "Görsellerden PDF", pdfMerge: "PDF birleştir", pdfSplit: "PDF böl", pdfOrganize: "PDF sayfaları",
  pdfCompress: "PDF sıkıştır", htmlToPdf: "HTML → PDF", textToPdf: "Metin → PDF", zipCreate: "ZIP oluştur", zipExtract: "ZIP aç",
  subtitleConvert: "Altyazı dönüştür", textEncode: "Metin kodlaması", renameCopies: "Yeniden adlandır", webDownload: "Web'den indir",
};

const escapeHtml = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function registerFileTools(deps) {
  const {
    ipcMain, app, BrowserWindow, dialog, shell, clipboard, nativeImage, screen, electronSession,
    fileProtocol, preloadPath, loadRenderer, broadcast, appRoot, isOwnUrl, guardWindow, log = () => {},
  } = deps;
  const platform = process.platform;
  const IS_MAC = platform === "darwin";
  const baseDir = path.join(app.getPath("userData"), "file-tools");
  fs.mkdirSync(baseDir, { recursive: true });
  const importsDir = path.join(baseDir, "imports");
  const cacheDir = path.join(baseDir, "cache");
  try { fs.rmSync(cacheDir, { recursive: true, force: true }); } catch { /* yoksay */ }

  const registry = createRegistry({ file: path.join(baseDir, "allow.json") });
  const jobs = createJobs({ dir: baseDir, killImpl: (child) => killProcess(child) });
  jobs.events.on("job", (job) => broadcast("ft:job", job));
  jobs.events.on("library", () => broadcast("ft:library", null));

  const ownSender = (event) => {
    const url = event?.senderFrame?.url || event?.sender?.getURL?.() || "";
    return !isOwnUrl || isOwnUrl(url);
  };
  const handle = (channel, fn) => ipcMain.handle(channel, async (event, ...args) => {
    if (!ownSender(event)) return { ok: false, error: { message: "İzin yok." } };
    try { return await fn(event, ...args); } catch (e) {
      return { ok: false, error: { code: e?.code || null, message: String(e?.message || e || "İşlem yapılamadı.") } };
    }
  });

  /* -------------------------------- ayarlar -------------------------------- */

  const settingsFile = path.join(baseDir, "settings.json");
  const defaultOutDir = () => path.join(app.getPath("downloads"), "Elitlig Dosyalar");
  let settings = { outDir: null, nextToSource: false, revealWhenDone: false, ytdlpPath: null };
  try { settings = { ...settings, ...JSON.parse(fs.readFileSync(settingsFile, "utf8")) }; } catch { /* varsayılan */ }
  const saveSettings = () => { try { fs.writeFileSync(settingsFile, JSON.stringify(settings)); } catch { /* yoksay */ } };
  const outDirFor = (inputPath) => (settings.nextToSource && inputPath ? path.dirname(inputPath) : settings.outDir && path.isAbsolute(settings.outDir) ? settings.outDir : defaultOutDir());
  const publicSettings = () => ({ ...settings, outDir: settings.outDir || defaultOutDir(), defaultOutDir: defaultOutDir() });

  /* ------------------------------- araçlar -------------------------------- */

  let ffmpegInfo = null;
  async function getFfmpeg() {
    if (ffmpegInfo?.path) return ffmpegInfo;
    const candidate = ff.resolveFfmpeg({ appRoot, resourcesPath: app.isPackaged ? process.resourcesPath : null });
    if (!candidate) { ffmpegInfo = { path: null }; return ffmpegInfo; }
    const res = await native.run(candidate.path, ["-hide_banner", "-encoders"], { timeout: 15000 });
    ffmpegInfo = { path: candidate.path, source: candidate.source, encoders: res.ok ? parseEncoders(res.stdout) : {} };
    log("files: ffmpeg", { path: candidate.path, source: candidate.source });
    return ffmpegInfo;
  }
  const needFfmpeg = async () => {
    const info = await getFfmpeg();
    if (!info.path) throw new Error("ffmpeg bulunamadı. Ses ve video işlemleri için uygulamanın tam sürümü gerekir.");
    return info;
  };
  const ytdlp = createYtdlp({ app, net: deps.net || require("electron").net, appRoot, getUserPath: () => settings.ytdlpPath, log });
  const tools = () => ({
    sips: IS_MAC ? native.findTool("sips", { platform }) : null,
    gs: native.findTool("gs", { platform }),
    ytdlp: ytdlp.resolve()?.path || null,
    zip: platform === "win32" ? native.powershellPath() : IS_MAC ? "/usr/bin/ditto" : native.findTool("zip", { platform }),
    unzip: platform === "win32" ? native.powershellPath() : IS_MAC ? "/usr/bin/ditto" : native.findTool("unzip", { platform }),
  });

  async function capabilities() {
    const info = await getFfmpeg();
    const t = tools();
    return {
      ok: true, platform,
      ffmpeg: Boolean(info.path), ffmpegSource: info.source || null,
      sips: Boolean(t.sips), gs: Boolean(t.gs), ytdlp: Boolean(t.ytdlp), ytdlpSource: ytdlp.resolve()?.source || null, zip: Boolean(t.zip), unzip: Boolean(t.unzip),
      pdfLib: Boolean(native.loadOptional("pdf-lib")?.PDFDocument), jsqr: typeof native.loadOptional("jsqr") === "function",
      heic: Boolean(t.sips) || Boolean(info.path),
    };
  }

  /** ffmpeg -i ile süre / boyut / ses bilgisi. */
  async function probe(file) {
    const info = await needFfmpeg();
    const res = await native.run(info.path, ["-hide_banner", "-nostdin", "-i", file], { timeout: 20000 });
    const p = ff.parseProbe(res.stderr);
    const line = res.stderr.split(/\r?\n/).find((l) => /Stream #\S+.*?Video:/.test(l)) || "";
    const fps = Number(line.match(/([\d.]+) fps/)?.[1]) || null;
    const hasVideo = Boolean(line) && !/Video: (png|mjpeg).*attached pic/i.test(res.stderr);
    return { ...p, fps, hasVideo };
  }

  /* ------------------------------ dosya ekleme ------------------------------ */

  const entries = (paths) => (paths || []).slice(0, 500).map((p) => registry.allow(String(p))).filter(Boolean);

  /** Pano: dosyalar (Finder / Gezgin), görsel, bağlantı ya da metin. Electron 44: eşzamansız (app/clipboardIo.js). */
  const clipIo = createClipboardIo({ clipboard, ClipboardItem: deps.ClipboardItem || require("electron").ClipboardItem, nativeImage });
  async function readClipboardFiles() {
    const found = [];
    try {
      const fm = await clipIo.formats();
      if (IS_MAC && fm.includes("NSFilenamesPboardType")) {
        const plist = String((await clipIo.readRaw("NSFilenamesPboardType")) || "");
        for (const m of plist.matchAll(/<string>([^<]+)<\/string>/g)) found.push(m[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">"));
      }
      if (!found.length && IS_MAC && fm.includes("public.file-url")) {
        const url = String((await clipIo.readRaw("public.file-url")) || "").replace(/\0+$/, "");
        if (url.startsWith("file://")) found.push(fileUrlToPath(url));
      }
      if (!found.length && platform === "win32" && fm.includes("FileNameW")) {
        const raw = await clipIo.readRaw("FileNameW");
        if (raw?.length) found.push(raw.toString("utf16le").replace(/\0+$/g, ""));
      }
      if (!found.length && fm.includes("text/uri-list")) {
        const list = String((await clipIo.readRaw("text/uri-list")) || "");
        for (const line of list.split(/\r?\n/)) if (line.startsWith("file://")) found.push(fileUrlToPath(line.trim()));
      }
    } catch { /* yoksay */ }
    return found.filter((p) => p && path.isAbsolute(p));
  }
  const fileUrlToPath = (u) => { try { return fileURLToPath(u); } catch { return ""; } };

  const stamp = () => new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
  async function paste() {
    const files = await readClipboardFiles();
    if (files.length) return { ok: true, kind: "files", files: entries(files) };
    const png = await clipIo.readImagePng();
    if (png?.length) {
      fs.mkdirSync(importsDir, { recursive: true });
      const p = path.join(importsDir, `Pano ${stamp()}.png`);
      fs.writeFileSync(p, png);
      return { ok: true, kind: "image", files: entries([p]) };
    }
    const t = await clipIo.readText();
    if (t && t.trim()) {
      const trimmed = t.trim();
      if (/^https?:\/\/\S+$/i.test(trimmed)) return { ok: true, kind: "link", url: trimmed, files: [] };
      fs.mkdirSync(importsDir, { recursive: true });
      const p = path.join(importsDir, `Pano ${stamp()}.txt`);
      fs.writeFileSync(p, t, "utf8");
      return { ok: true, kind: "text", files: entries([p]) };
    }
    return { ok: false, error: { message: "Panoda dosya, görsel ya da metin yok." } };
  }

  /* --------------------------- görsel çözme (HEIC) --------------------------- */

  /** Tarayıcının çözemediği görseli (HEIC, TIFF…) geçici PNG'ye çevirir. */
  async function decodeToPng(file) {
    fs.mkdirSync(cacheDir, { recursive: true });
    const out = path.join(cacheDir, `${registry.allow(file)?.id || Date.now()}-${sanitizeName(stemOf(file))}.png`);
    if (fs.existsSync(out)) return out;
    const t = tools();
    if (t.sips) {
      const res = await native.run(t.sips, native.sipsArgs(file, out, "png"), { timeout: 60000 });
      if (res.ok && fs.existsSync(out)) return out;
    }
    const info = await getFfmpeg();
    if (info.path) {
      const res = await native.run(info.path, ["-hide_banner", "-nostdin", "-y", "-loglevel", "error", "-i", file, "-frames:v", "1", out], { timeout: 60000 });
      if (res.ok && fs.existsSync(out)) return out;
    }
    throw new Error(`${path.basename(file)} çözülemedi${IS_MAC ? "" : " (HEIC için güncel ffmpeg gerekir)"}.`);
  }

  /* ------------------------------ PDF yazdırma ------------------------------ */

  let printSession = null;
  const getPrintSession = () => {
    if (printSession) return printSession;
    printSession = electronSession.fromPartition("elitlig-file-print");
    // Yerel dosya ve veri dışındaki her istek engellenir (uzak kaynak, izleme yok).
    printSession.webRequest.onBeforeRequest((details, cb) => cb({ cancel: !/^(file|data|blob|about|devtools):/i.test(details.url) }));
    printSession.setPermissionRequestHandler((_wc, _p, cb) => cb(false));
    return printSession;
  };

  async function printFileToPdf(htmlFile, output, { landscape = false, pageSize = "A4", preferCSSPageSize = false, margins = null } = {}) {
    const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, javascript: false, session: getPrintSession(), images: true } });
    try {
      await win.loadFile(htmlFile);
      const data = await win.webContents.printToPDF({ printBackground: true, landscape, pageSize, preferCSSPageSize, ...(margins ? { margins } : {}) });
      fs.writeFileSync(output, data);
    } finally {
      win.destroy();
    }
  }

  function imagesPdfHtml(files, { page = "a4", marginMm = 10 }) {
    const m = Math.max(0, Math.min(40, Number(marginMm) || 0));
    const rules = page === "fit" ? "" : `@page { size: A4 ${page === "a4-landscape" ? "landscape" : "portrait"}; margin: ${m}mm; }`;
    const pages = files.map((f, i) => {
      const src = pathToFileURL(f.path).href;
      if (page === "fit") {
        // Sayfa görsel boyutunda (96 dpi varsayımı, en çok A3'e ölçeklenir).
        const w = Math.max(50, Math.round(f.width || 800));
        const h = Math.max(50, Math.round(f.height || 600));
        const scale = Math.min(1, 1123 / Math.max(w, h)) * 1;
        return `<style>@page p${i} { size: ${Math.round(w * scale)}px ${Math.round(h * scale)}px; margin: 0; }</style><section style="page: p${i}; width:${Math.round(w * scale)}px; height:${Math.round(h * scale)}px; break-after: page;"><img src="${escapeHtml(src)}" style="width:100%;height:100%;object-fit:contain"></section>`;
      }
      return `<section style="height: calc(100vh - 1px); display:flex; align-items:center; justify-content:center; break-after: page;"><img src="${escapeHtml(src)}" style="max-width:100%;max-height:100%;object-fit:contain"></section>`;
    }).join("");
    return `<!doctype html><html><head><meta charset="utf-8"><style>${rules} html,body{margin:0;padding:0} section:last-child{break-after:auto}</style></head><body>${pages}</body></html>`;
  }

  /* ---------------------------------- işler ---------------------------------- */

  /** İş tanımını doğrular ve kuyruğa koyar. spec: { op, ids, options } */
  async function runOp({ op, ids = [], options = {} } = {}) {
    const files = (Array.isArray(ids) ? ids : []).map((id) => registry.resolve(id)).filter(Boolean);
    const o = options && typeof options === "object" ? options : {};
    const first = files[0] || null;
    const outDir = outDirFor(first);
    const label = LABELS[op] || op;
    const mk = (run, extra = {}) => jobs.enqueue({ op, label: extra.label || label, kind: extra.kind || (first ? kindOf(first) : null), inputs: files, outDir, options: o, run });
    const need = (n = 1) => { if (files.length < n) throw new Error(n > 1 ? `En az ${n} dosya seçin.` : "Dosya seçin."); };

    if (MEDIA_OPS.has(op)) {
      need(1);
      const info = await needFfmpeg();
      return mk(async (ctx) => {
        for (let i = 0; i < files.length; i += 1) {
          const input = files[i];
          const kind = kindOf(input) === "audio" ? "audio" : "video";
          const p = await probe(input);
          const inExt = extOf(input);
          let outExt = String(o.format || "").toLowerCase() || inExt;
          if (op === "convert" && !o.format) throw new Error("Hedef biçim seçin.");
          if (op === "extractAudio") outExt = ["mp3", "m4a", "wav", "flac", "ogg"].includes(o.format) ? o.format : "m4a";
          if (op === "gif") outExt = "gif";
          if (op === "snapshot") outExt = o.format === "jpg" ? "jpg" : "png";
          if (["mute", "normalize", "rotate", "split"].includes(op) && !o.format) outExt = inExt;
          if (["compress", "speed", "resize", "cropAspect"].includes(op) && !o.format) outExt = kind === "audio" ? inExt : ["mp4", "mov", "webm", "mkv", "m4v"].includes(inExt) ? inExt : "mp4";
          if (op === "trim" && !o.format) outExt = o.copy ? inExt : kind === "audio" ? inExt : ["mp4", "mov", "webm", "mkv", "m4v"].includes(inExt) ? inExt : "mp4";
          if (kind === "video" && op === "convert" && ["mp3", "m4a", "wav", "ogg", "flac"].includes(outExt) && !p.hasAudio) throw new Error(`${path.basename(input)}: dosyada ses yok.`);
          if (op === "extractAudio" && !p.hasAudio) throw new Error(`${path.basename(input)}: dosyada ses yok.`);
          const many = op === "split" || (op === "snapshot" && Number(o.everySec) > 0);
          const tmp = path.join(ctx.workDir, many ? `out-${i}-%03d.${outExt}` : `out-${i}.${outExt}`);
          const { args, expectedMs } = buildMediaArgs({ op, input, output: tmp, kind, probe: p, outExt, options: o, encoders: info.encoders, platform });
          await ctx.spawn(info.path, args, { expectedMs, base: i / files.length, span: 1 / files.length });
          const stem = stemOf(input);
          const suffix = op === "speed" ? `${Number(o.factor) || 1}x` : op === "resize" ? `${o.height || 720}p` : op === "cropAspect" ? String(o.aspect || "1:1").replace(/[:/]/g, "x") : SUFFIX[op] || "";
          if (many) {
            const made = fs.readdirSync(ctx.workDir).filter((n) => n.startsWith(`out-${i}-`)).sort();
            if (!made.length) throw new Error("Çıktı oluşmadı.");
            made.forEach((n, k) => ctx.output(path.join(ctx.workDir, n), { name: `${stem}-${suffix}-${String(k + 1).padStart(3, "0")}`, ext: outExt, dir: outDirFor(input) }));
          } else {
            ctx.output(tmp, { name: suffix ? `${stem}-${suffix}` : stem, ext: outExt, dir: outDirFor(input) });
          }
        }
      }, { label: op === "convert" ? `${label} → ${String(o.format || "").toUpperCase()}` : label });
    }

    switch (op) {
      case "join": {
        need(2);
        const info = await needFfmpeg();
        const kinds = new Set(files.map((f) => (kindOf(f) === "audio" ? "audio" : "video")));
        if (kinds.size > 1) throw new Error("Ses ve video dosyaları birlikte birleştirilemez.");
        const kind = [...kinds][0];
        const outExt = kind === "audio" ? (["mp3", "m4a", "wav", "flac"].includes(o.format) ? o.format : "m4a") : (["mp4", "mov", "mkv", "webm"].includes(o.format) ? o.format : "mp4");
        return mk(async (ctx) => {
          ctx.setProgress(0, { indeterminate: true });
          const probes = [];
          for (const f of files) probes.push(await probe(f));
          const tmp = path.join(ctx.workDir, `joined.${outExt}`);
          const { args, expectedMs } = buildJoinArgs({ inputs: files, probes, output: tmp, kind, outExt, encoders: info.encoders, platform });
          await ctx.spawn(info.path, args, { expectedMs });
          ctx.output(tmp, { name: `${stemOf(first)}-birlestirildi`, ext: outExt });
        }, { kind });
      }
      case "imageConvert": {
        need(1);
        const target = String(o.format || "").toLowerCase();
        if (!TARGETS.image.includes(target)) throw new Error("Desteklenmeyen hedef biçim.");
        const t = tools();
        if (target === "heic" && !t.sips) throw new Error("HEIC'e dönüştürme yalnız Mac'te yapılabilir.");
        return mk(async (ctx) => {
          for (let i = 0; i < files.length; i += 1) {
            const input = files[i];
            const tmp = path.join(ctx.workDir, `img-${i}.${target}`);
            ctx.setProgress(i / files.length);
            if (t.sips && native.SIPS_FORMATS[target]) {
              await ctx.spawn(t.sips, native.sipsArgs(input, tmp, target, { quality: o.quality ?? null }), { onStdout: () => {} });
            } else {
              const info = await needFfmpeg();
              const src = /^(heic|heif)$/.test(extOf(input)) ? await decodeToPng(input) : input;
              await ctx.spawn(info.path, buildImageConvertArgs({ input: src, output: tmp, outExt: target }).args, { onStdout: () => {} });
            }
            ctx.output(tmp, { name: stemOf(input), ext: target === "jpeg" ? "jpg" : target, dir: outDirFor(input) });
          }
        }, { label: `${label} → ${target.toUpperCase()}` });
      }
      case "imagesToPdf": {
        need(1);
        return mk(async (ctx) => {
          ctx.setProgress(0, { indeterminate: true });
          const list = [];
          for (const f of files) {
            const src = /^(heic|heif|tif|tiff)$/.test(extOf(f)) ? await decodeToPng(f) : f;
            const size = nativeImage.createFromPath(src).getSize();
            list.push({ path: src, width: size.width, height: size.height });
          }
          const html = path.join(ctx.workDir, "sayfalar.html");
          fs.writeFileSync(html, imagesPdfHtml(list, { page: o.page || "a4", marginMm: o.marginMm ?? 10 }));
          const tmp = path.join(ctx.workDir, "gorseller.pdf");
          await printFileToPdf(html, tmp, { preferCSSPageSize: true, margins: { marginType: "none" } });
          ctx.output(tmp, { name: files.length > 1 ? `${stemOf(first)} ve ${files.length - 1} görsel` : stemOf(first), ext: "pdf" });
        });
      }
      case "htmlToPdf":
      case "textToPdf": {
        need(1);
        return mk(async (ctx) => {
          for (let i = 0; i < files.length; i += 1) {
            const input = files[i];
            ctx.setProgress(i / files.length, { indeterminate: true });
            let html = input;
            if (op === "textToPdf" || kindOf(input) !== "html") {
              const bytes = fs.readFileSync(input);
              const body = text.decodeText(bytes);
              html = path.join(ctx.workDir, `metin-${i}.html`);
              fs.writeFileSync(html, `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(path.basename(input))}</title><style>@page{size:A4;margin:16mm} body{font:10.5pt/1.5 ui-monospace,Menlo,Consolas,monospace;color:#111} pre{white-space:pre-wrap;word-wrap:break-word;margin:0}</style></head><body><pre>${escapeHtml(body)}</pre></body></html>`);
            }
            const tmp = path.join(ctx.workDir, `belge-${i}.pdf`);
            await printFileToPdf(html, tmp, { landscape: Boolean(o.landscape) });
            ctx.output(tmp, { name: stemOf(input), ext: "pdf", dir: outDirFor(input) });
          }
        });
      }
      case "pdfMerge": {
        need(2);
        native.pdfLib();
        return mk(async (ctx) => {
          ctx.setProgress(0, { indeterminate: true });
          const tmp = path.join(ctx.workDir, "birlesik.pdf");
          await native.pdfMerge(files, tmp);
          ctx.output(tmp, { name: `${stemOf(first)}-birlestirildi`, ext: "pdf" });
        });
      }
      case "pdfSplit": {
        need(1);
        native.pdfLib();
        return mk(async (ctx) => {
          ctx.setProgress(0, { indeterminate: true });
          const { pages } = await native.pdfInfo(first);
          const groups = o.ranges ? text.parsePageRanges(o.ranges, pages) : Array.from({ length: pages }, (_, i) => [i + 1]);
          if (!groups) throw new Error(`Sayfa aralığı geçersiz (1–${pages}).`);
          const made = await native.pdfSplit(first, groups, (g) => path.join(ctx.workDir, `parca-${g}.pdf`));
          made.forEach((f, g) => {
            const pg = groups[g];
            ctx.output(f, { name: `${stemOf(first)}-s${pg.length > 1 ? `${pg[0]}-${pg[pg.length - 1]}` : pg[0]}`, ext: "pdf" });
          });
        });
      }
      case "pdfOrganize": {
        need(1);
        native.pdfLib();
        return mk(async (ctx) => {
          ctx.setProgress(0, { indeterminate: true });
          const tmp = path.join(ctx.workDir, "duzenli.pdf");
          let pages = o.pages;
          if (!Array.isArray(pages) && Number(o.rotateAll)) {
            const { pages: count } = await native.pdfInfo(first);
            pages = Array.from({ length: count }, (_, i) => ({ index: i, rotate: Number(o.rotateAll) }));
          }
          await native.pdfOrganize(first, pages, tmp);
          ctx.output(tmp, { name: `${stemOf(first)}-duzenlendi`, ext: "pdf" });
        });
      }
      case "pdfCompress": {
        need(1);
        const t = tools();
        if (!t.gs) native.pdfLib();
        return mk(async (ctx) => {
          for (let i = 0; i < files.length; i += 1) {
            const input = files[i];
            const tmp = path.join(ctx.workDir, `kucuk-${i}.pdf`);
            ctx.setProgress(i / files.length, { indeterminate: true });
            if (t.gs) await ctx.spawn(t.gs, native.gsCompressArgs(input, tmp, o.quality), { onStdout: () => {} });
            else await native.pdfResave(input, tmp);
            const before = fs.statSync(input).size;
            const after = fs.statSync(tmp).size;
            if (!t.gs) ctx.setNote("Ghostscript bulunamadı: yalnız PDF yapısı yeniden yazıldı (görseller küçültülmedi).");
            if (after >= before) ctx.setNote("Dosya zaten sıkıştırılmış; daha küçük bir sürüm elde edilemedi.");
            ctx.output(tmp, { name: `${stemOf(input)}-sikistirildi`, ext: "pdf", dir: outDirFor(input) });
          }
        });
      }
      case "zipCreate": {
        need(1);
        return mk(async (ctx) => {
          const tmp = path.join(ctx.workDir, "arsiv.zip");
          const cmd = native.zipCommand({ inputs: files, output: tmp, workDir: ctx.workDir, platform });
          if (!cmd.file) throw new Error("ZIP aracı bulunamadı.");
          ctx.setProgress(0, { indeterminate: true });
          if (cmd.staging) native.stageInputs(files, cmd.staging);
          await ctx.spawn(cmd.file, cmd.args, { cwd: cmd.cwd || ctx.workDir, env: cmd.env, onStdout: () => {} });
          ctx.output(tmp, { name: o.name ? sanitizeName(o.name) : files.length === 1 ? path.basename(first, path.extname(first)) || "Arşiv" : "Arşiv", ext: "zip" });
        }, { kind: "archive" });
      }
      case "zipExtract": {
        need(1);
        return mk(async (ctx) => {
          for (let i = 0; i < files.length; i += 1) {
            const input = files[i];
            const dest = path.join(ctx.workDir, `ac-${i}`);
            fs.mkdirSync(dest, { recursive: true });
            const cmd = native.unzipCommand({ input, dest, platform });
            if (!cmd.file) throw new Error("ZIP aracı bulunamadı.");
            ctx.setProgress(i / files.length, { indeterminate: true });
            await ctx.spawn(cmd.file, cmd.args, { env: cmd.env, onStdout: () => {} });
            ctx.outputDir(dest, stemOf(input));
          }
        }, { kind: "archive" });
      }
      case "subtitleConvert": {
        need(1);
        const target = o.format === "vtt" ? "vtt" : "srt";
        return mk(async (ctx) => {
          for (const input of files) {
            const tmp = path.join(ctx.workDir, `${Math.random().toString(36).slice(2)}.${target}`);
            fs.writeFileSync(tmp, text.convertSubtitles(text.decodeText(fs.readFileSync(input)), target), "utf8");
            ctx.output(tmp, { name: stemOf(input), ext: target, dir: outDirFor(input) });
          }
        }, { label: `${label} → ${target.toUpperCase()}` });
      }
      case "textEncode": {
        need(1);
        const to = String(o.to || "utf-8");
        if (!text.ENCODINGS.some((e) => e.key === to)) throw new Error("Desteklenmeyen kodlama.");
        return mk(async (ctx) => {
          let lost = 0;
          for (const input of files) {
            const bytes = fs.readFileSync(input);
            const from = o.from && o.from !== "auto" ? o.from : text.detectEncoding(bytes);
            const decoded = text.withLineEndings(text.decodeText(bytes, from), o.lineEndings || null);
            const enc = text.encodeText(decoded, to);
            lost += enc.lost;
            const tmp = path.join(ctx.workDir, `${Math.random().toString(36).slice(2)}.txt`);
            fs.writeFileSync(tmp, enc.bytes);
            ctx.output(tmp, { name: `${stemOf(input)}-${to.replace(/[^a-z0-9]/gi, "")}`, ext: extOf(input) || "txt", dir: outDirFor(input) });
          }
          if (lost) ctx.setNote(`${lost} karakterin hedef kodlamada karşılığı yok; "?" yazıldı.`);
        });
      }
      case "renameCopies": {
        need(1);
        return mk(async (ctx) => {
          const start = Number.isFinite(Number(o.start)) ? Number(o.start) : 1;
          const pad = Math.max(0, Math.min(6, Number(o.pad) || String(start + files.length - 1).length));
          files.forEach((input, i) => {
            const st = fs.statSync(input);
            if (st.isDirectory()) return;
            const ext = extOf(input);
            const name = text.applyRenameTemplate(o.template || "{ad}-{n}", { name: path.basename(input), ext, mtimeMs: st.mtimeMs, folder: path.basename(path.dirname(input)) }, i, { start, pad });
            const tmp = path.join(ctx.workDir, `r-${i}`);
            fs.copyFileSync(input, tmp, fs.constants.COPYFILE_FICLONE);
            ctx.output(tmp, { name, ext, dir: outDirFor(input) });
            ctx.setProgress((i + 1) / files.length);
          });
        });
      }
      case "webDownload": {
        const tool = ytdlp.resolve();
        if (!tool) throw Object.assign(new Error("yt-dlp bulunamadı. Dosya Araçları → Ayarlar'dan “yt-dlp'yi indir” ile kurun."), { code: "NO_YTDLP" });
        const url = String(o.url || "").trim();
        if (!isHttpUrl(url)) throw new Error("Geçerli bir http(s) bağlantısı girin.");
        const site = siteOf(url);
        const info = await getFfmpeg();
        const mode = ["video", "audio", "images"].includes(o.mode) ? o.mode : o.audioOnly ? "audio" : "video";
        const opts = { url, mode, quality: o.quality || "best", audioFormat: o.audioFormat === "m4a" ? "m4a" : "mp3", playlist: Boolean(o.playlist), withImages: Boolean(o.withImages), cookiesBrowser: o.cookiesBrowser || null };
        buildYtdlpArgs({ ...opts, workDir: "/" }); // seçenekleri kuyruğa koymadan doğrula
        const labelMode = mode === "audio" ? ` · ${opts.audioFormat.toUpperCase()}` : mode === "images" ? " · görseller" : opts.quality !== "best" ? ` · ${opts.quality}p` : "";
        return jobs.enqueue({
          op, label: `İndir · ${site.label || "Web"}${labelMode}`, kind: mode === "audio" ? "audio" : mode === "images" ? "image" : "video", inputs: [], outDir: outDirFor(null), options: { ...opts, site: site.key },
          run: async (ctx) => {
            const args = buildYtdlpArgs({ ...opts, workDir: ctx.workDir, ffmpegPath: info.path || null, jsRuntime: ytdlp.jsRuntime() });
            let state;
            ctx.setProgress(0, { indeterminate: true });
            try {
              await ctx.spawn(tool.path, args, {
                env: ytdlp.runEnv(),
                group: true,
                onStdout: (s) => {
                  const r = parseYtdlpProgress(s, state);
                  state = r.state;
                  if (r.note) ctx.setNote(r.note);
                  if (/\[download\]\s+[\d.]+%/.test(s)) ctx.setProgress(r.fraction);
                },
              });
            } catch (e) {
              if (e?.canceled) throw e;
              throw new Error(ytdlpError(e?.stderr || e?.message, { site: site.key, cookies: Boolean(opts.cookiesBrowser) }));
            }
            const made = fs.readdirSync(ctx.workDir).filter((n) => !/\.(part|ytdl|temp|tmp)$|^\./i.test(n) && fs.statSync(path.join(ctx.workDir, n)).isFile()).sort((a, b) => a.localeCompare(b, "tr", { numeric: true }));
            if (!made.length) throw new Error(mode === "images" ? "Bu bağlantıda indirilebilir görsel bulunamadı." : "İndirilecek dosya bulunamadı.");
            for (const n of made) ctx.output(path.join(ctx.workDir, n), { name: path.basename(n, path.extname(n)), ext: extOf(n) });
            ctx.setNote(null);
          },
        });
      }
      default:
        throw new Error(`Bilinmeyen işlem: ${op}`);
    }
  }

  /* ---------------------------------- Float ---------------------------------- */

  const float = createFloat({ dir: baseDir, registry, BrowserWindow, screen, loadRenderer, preloadPath, broadcast, isMac: IS_MAC, guard: guardWindow });

  /** Sürükleme simgesi (eşzamanlı: startDrag sürükleme olayı içinde çağrılmalı). */
  const dragIcon = (file) => {
    try {
      if (kindOf(file) === "image" && !/^(heic|heif|tif|tiff)$/.test(extOf(file))) {
        const img = nativeImage.createFromPath(file);
        if (!img.isEmpty()) return img.resize({ width: 64, quality: "good" });
      }
    } catch { /* yoksay */ }
    const icon = nativeImage.createFromPath(path.join(__dirname, "..", "assets", "icon.png"));
    return icon.isEmpty() ? icon : icon.resize({ width: 48 });
  };
  const knownPath = (p) => {
    const s = String(p || "");
    return path.isAbsolute(s) && Boolean(registry.resolve(idOf(s))) && fs.existsSync(s);
  };

  /* ----------------------------------- IPC ----------------------------------- */

  handle("ft:capabilities", () => capabilities());
  handle("ft:allow", (_e, paths) => ({ ok: true, files: entries(Array.isArray(paths) ? paths : []) }));
  handle("ft:pick", async (event, opts = {}) => {
    const parent = BrowserWindow.fromWebContents(event.sender) || undefined;
    const res = await dialog.showOpenDialog(parent, { title: "Dosya seç", buttonLabel: "Ekle", properties: [opts?.directory ? "openDirectory" : "openFile", "multiSelections"] });
    if (res.canceled) return { ok: false, canceled: true, files: [] };
    return { ok: true, files: entries(res.filePaths) };
  });
  handle("ft:paste", () => paste());
  handle("ft:probe", async (_e, id) => {
    const file = registry.resolve(id);
    if (!file) throw new Error("Dosya bulunamadı.");
    return { ok: true, ...(await probe(file)) };
  });
  handle("ft:decode", async (_e, id) => {
    const file = registry.resolve(id);
    if (!file) throw new Error("Dosya bulunamadı.");
    return { ok: true, file: registry.allow(await decodeToPng(file)) };
  });
  handle("ft:pdfInfo", async (_e, id) => {
    const file = registry.resolve(id);
    if (!file) throw new Error("Dosya bulunamadı.");
    return { ok: true, ...(await native.pdfInfo(file)) };
  });
  handle("ft:qr", async (_e, id) => {
    const file = registry.resolve(id);
    if (!file) throw new Error("Dosya bulunamadı.");
    const src = /^(heic|heif|tif|tiff)$/.test(extOf(file)) ? await decodeToPng(file) : file;
    return { ok: true, results: native.readQr(nativeImage.createFromPath(src)) };
  });
  handle("ft:textInfo", async (_e, id) => {
    const file = registry.resolve(id);
    if (!file) throw new Error("Dosya bulunamadı.");
    const fd = fs.openSync(file, "r");
    const buf = Buffer.alloc(Math.min(fs.fstatSync(fd).size, 64 * 1024));
    fs.readSync(fd, buf, 0, buf.length, 0);
    fs.closeSync(fd);
    const encoding = text.detectEncoding(buf);
    return { ok: true, encoding, preview: text.decodeText(buf, encoding).slice(0, 1200), encodings: text.ENCODINGS };
  });
  handle("ft:run", async (_e, spec) => ({ ok: true, job: await runOp(spec || {}) }));
  // yt-dlp: durum, indir / güncelle, başka bir ikili seç, varsayılana dön.
  handle("ft:ytdlp:status", async () => ({ ok: true, ...(await ytdlp.status()) }));
  handle("ft:ytdlp:update", async () => {
    const res = await ytdlp.update({ onProgress: (p) => broadcast("ft:ytdlp:progress", p) });
    broadcast("ft:ytdlp:progress", { phase: "done", fraction: 1 });
    return { ...res, status: await ytdlp.status() };
  });
  handle("ft:ytdlp:choose", async (event) => {
    const parent = BrowserWindow.fromWebContents(event.sender) || undefined;
    const res = await dialog.showOpenDialog(parent, { title: "yt-dlp seç", buttonLabel: "Kullan", properties: ["openFile"] });
    if (res.canceled || !res.filePaths[0]) return { ok: false, canceled: true };
    const v = await ytdlp.versionOf(res.filePaths[0]);
    if (!v) throw new Error("Seçilen dosya çalışan bir yt-dlp değil.");
    settings.ytdlpPath = res.filePaths[0];
    saveSettings();
    return { ok: true, status: await ytdlp.status() };
  });
  handle("ft:ytdlp:reset", async () => { settings.ytdlpPath = null; saveSettings(); return { ok: true, status: await ytdlp.status() }; });
  // Panodaki bağlantı (indirme penceresi öneri olarak gösterir; pano değişmez).
  handle("ft:clipboardLink", async () => {
    const t = (await clipIo.readText()).trim();
    return { ok: true, url: isHttpUrl(t) && !/\s/.test(t) ? t : null, site: isHttpUrl(t) ? siteOf(t) : null };
  });
  handle("ft:cancel", (_e, id) => ({ ok: jobs.cancel(id) }));
  handle("ft:jobs", () => ({ ok: true, items: jobs.list() }));
  handle("ft:removeJob", (_e, id) => ({ ok: jobs.remove(id) }));
  handle("ft:clearLibrary", () => { jobs.clear(); return { ok: true }; });
  handle("ft:client:start", (_e, spec = {}) => {
    const files = (spec.ids || []).map((id) => registry.resolve(id)).filter(Boolean);
    return { ok: true, job: jobs.startClient({ op: spec.op, label: spec.label || LABELS[spec.op] || spec.op, kind: spec.kind || "image", inputs: files, outDir: outDirFor(files[0] || null), options: spec.options || null }) };
  });
  handle("ft:client:file", (_e, jobId, file = {}) => {
    const p = jobs.clientFile(jobId, { name: file.name, ext: file.ext, bytes: file.bytes, progress: file.progress });
    return { ok: true, path: p, file: registry.allow(p) };
  });
  handle("ft:client:done", (_e, jobId, result = {}) => {
    const job = jobs.clientDone(jobId, result || {});
    if (job?.status === "done" && settings.revealWhenDone && job.outputs[0]) shell.showItemInFolder(job.outputs[0].path);
    return { ok: Boolean(job), job };
  });
  handle("ft:outputs", (_e, jobId) => {
    const job = jobs.get(jobId);
    if (!job) throw new Error("İş bulunamadı.");
    return { ok: true, files: entries((job.outputs || []).map((o) => o.path)), inputs: entries((job.inputs || []).map((i) => i.path)) };
  });
  const libraryPath = (p) => {
    const s = String(p || "");
    if (knownPath(s)) return true;
    return jobs.list().some((j) => [...(j.outputs || []), ...(j.inputs || [])].some((o) => o.path === s));
  };
  handle("ft:reveal", (_e, p) => { if (!libraryPath(p)) throw new Error("Dosya bulunamadı."); shell.showItemInFolder(String(p)); return { ok: true }; });
  handle("ft:openPath", async (_e, p) => { if (!libraryPath(p)) throw new Error("Dosya bulunamadı."); const err = await shell.openPath(String(p)); return { ok: !err, error: err ? { message: err } : null }; });
  handle("ft:preview", async (event, p) => {
    if (!libraryPath(p)) throw new Error("Dosya bulunamadı.");
    const win = BrowserWindow.fromWebContents(event.sender);
    if (IS_MAC && win) { win.previewFile(String(p)); return { ok: true }; }
    const err = await shell.openPath(String(p));
    return { ok: !err };
  });
  handle("ft:copyPaths", async (_e, paths) => { await clipIo.writeText((paths || []).map(String).join("\n")); return { ok: true }; });
  handle("ft:settings", () => ({ ok: true, settings: publicSettings() }));
  handle("ft:setSettings", (_e, patch = {}) => {
    if (typeof patch.nextToSource === "boolean") settings.nextToSource = patch.nextToSource;
    if (typeof patch.revealWhenDone === "boolean") settings.revealWhenDone = patch.revealWhenDone;
    if (patch.outDir === null) settings.outDir = null;
    saveSettings();
    return { ok: true, settings: publicSettings() };
  });
  handle("ft:chooseOutDir", async (event) => {
    const parent = BrowserWindow.fromWebContents(event.sender) || undefined;
    const res = await dialog.showOpenDialog(parent, { title: "Çıktı klasörü", buttonLabel: "Seç", defaultPath: settings.outDir || defaultOutDir(), properties: ["openDirectory", "createDirectory"] });
    if (res.canceled || !res.filePaths[0]) return { ok: false, canceled: true };
    settings.outDir = res.filePaths[0];
    saveSettings();
    return { ok: true, settings: publicSettings() };
  });
  // Başka uygulamaya sürükleme: dragstart içinde yanıtsız çağrılır.
  ipcMain.on("ft:drag", (event, paths) => {
    if (!ownSender(event)) return;
    const files = (Array.isArray(paths) ? paths : []).map(String).filter((p) => libraryPath(p) || float.items().some((i) => i.path === p));
    if (!files.length) return;
    try { event.sender.startDrag({ file: files[0], files, icon: dragIcon(files[0]) }); } catch (e) { log("files: drag", e?.message); }
  });

  handle("float:show", () => ({ ok: float.show() }));
  handle("float:hide", () => { float.hide(); return { ok: true }; });
  handle("float:list", () => ({ ok: true, items: float.items() }));
  handle("float:add", (_e, paths) => {
    const list = (Array.isArray(paths) ? paths : []).map(String).filter((p) => knownPath(p) || libraryPath(p));
    const added = float.add(list);
    return { ok: true, added, items: float.items() };
  });
  handle("float:remove", (_e, paths) => { float.remove(paths); return { ok: true }; });
  handle("float:clear", () => { float.clear(); return { ok: true }; });
  handle("float:expand", (_e, on) => { float.setExpanded(on); return { ok: true }; });
  handle("float:openMain", (_e, ids) => { deps.showMain?.("files"); setTimeout(() => broadcast("ft:select", (ids || []).map(String)), 300); return { ok: true }; });

  /* ------------------------------ elitlig-file:// ------------------------------ */

  fileProtocol.addRoute("f", (request, parts) => {
    const file = registry.resolve(parts[0]);
    return file ? serveFile(request, file) : null;
  });
  fileProtocol.addRoute("icon", async (_request, parts) => {
    const file = registry.resolve(parts[0]);
    if (!file) return null;
    try {
      const img = await app.getFileIcon(file, { size: "normal" });
      return new Response(img.toPNG(), { headers: { "Content-Type": "image/png", "Cache-Control": "max-age=3600" } });
    } catch { return null; }
  });

  return {
    registry,
    float,
    jobs,
    allow: (p) => registry.allow(p),
    dispose() { jobs.dispose(); registry.flush(); },
  };
}

module.exports = { registerFileTools, LABELS };
