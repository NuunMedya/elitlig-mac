// Dosya Araçları — biçim ve araç kataloğu (saf; arayüz ve testler kullanır).
//
// Uzantı listeleri ana süreçteki app/fileTools/formats.js ile aynıdır
// (renderer/test/files-catalog.test.js denetler).
//
// Her araç: { id, group: "convert" | "tools" | "actions", label, icon, kinds,
//   min, max, run: "client" | "main" | "editor" | "media" | "pdf" | "dialog" | "action",
//   op (ana süreç işlemi), needs (yetenek: ffmpeg, pdfLib, qr, zip, unzip, ytdlp, mac) }

export const KIND_EXTS = Object.freeze({
  image: ["jpg", "jpeg", "png", "webp", "gif", "bmp", "tif", "tiff", "heic", "heif", "avif", "ico"],
  video: ["mp4", "mov", "m4v", "webm", "mkv", "avi", "wmv", "flv", "mpg", "mpeg", "3gp", "ts", "mts"],
  audio: ["mp3", "m4a", "aac", "wav", "ogg", "oga", "opus", "flac", "aif", "aiff", "wma", "caf"],
  pdf: ["pdf"],
  archive: ["zip"],
  subtitle: ["srt", "vtt"],
  text: ["txt", "csv", "tsv", "md", "json", "xml", "log", "ini", "yml", "yaml"],
  html: ["html", "htm"],
});

export const KIND_LABELS = Object.freeze({
  image: "Görsel", video: "Video", audio: "Ses", pdf: "PDF", archive: "Arşiv", subtitle: "Altyazı", text: "Metin", html: "Web sayfası", folder: "Klasör", other: "Dosya",
});
export const KIND_ICONS = Object.freeze({
  image: "image", video: "video", audio: "music", pdf: "file", archive: "archive", subtitle: "message", text: "note", html: "globe", folder: "folder", other: "file",
});

const EXT_KIND = Object.fromEntries(Object.entries(KIND_EXTS).flatMap(([k, exts]) => exts.map((e) => [e, k])));
export const extOf = (name) => (String(name || "").match(/\.([^./\\]+)$/)?.[1] || "").toLowerCase();
export const kindOf = (name) => EXT_KIND[extOf(name)] || "other";

/** Tarayıcının (canvas) doğrudan çözebildiği görseller; diğerleri (HEIC, TIFF) önce ana süreçte PNG'ye çevrilir. */
export const BROWSER_IMAGE = new Set(["jpg", "jpeg", "png", "webp", "gif", "bmp", "avif", "ico"]);
/** canvas'ın yazabildiği biçimler. */
export const CANVAS_OUT = Object.freeze({ jpg: "image/jpeg", png: "image/png", webp: "image/webp" });

export const CONVERT_TARGETS = Object.freeze({
  image: ["jpg", "png", "webp", "heic", "tiff", "bmp", "gif", "pdf"],
  video: ["mp4", "mov", "webm", "mkv", "gif", "mp3", "m4a", "wav"],
  audio: ["mp3", "m4a", "wav", "ogg", "flac"],
  subtitle: ["srt", "vtt"],
  text: ["pdf"],
  html: ["pdf"],
});

const ALL = ["image", "video", "audio", "pdf", "archive", "subtitle", "text", "html", "folder", "other"];
const FILES = ALL.filter((k) => k !== "folder");
const AV = ["video", "audio"];

export const TOOLS = Object.freeze([
  // Görsel
  { id: "imgResize", group: "tools", label: "Yeniden boyutlandır", icon: "maximize", kinds: ["image"], run: "dialog" },
  { id: "imgRotate", group: "tools", label: "Döndür / çevir", icon: "rotate", kinds: ["image"], run: "dialog" },
  { id: "imgCrop", group: "tools", label: "Kırp", icon: "crop", kinds: ["image"], max: 1, run: "editor", mode: "crop" },
  { id: "imgCompress", group: "tools", label: "Sıkıştır", icon: "minimize", kinds: ["image"], run: "dialog" },
  { id: "imgAdjust", group: "tools", label: "Ayarlar (parlaklık, kontrast)", icon: "sliders", kinds: ["image"], max: 1, run: "editor", mode: "adjust" },
  { id: "imgMarkup", group: "tools", label: "İşaretle", icon: "pencil", kinds: ["image"], max: 1, run: "editor", mode: "markup" },
  { id: "imgFrame", group: "tools", label: "Arka plan / çerçeve", icon: "frame", kinds: ["image"], max: 1, run: "editor", mode: "frame" },
  { id: "imgRedact", group: "tools", label: "Sansürle / bulanıklaştır", icon: "eyeOff", kinds: ["image"], max: 1, run: "editor", mode: "redact" },
  { id: "imgCollage", group: "tools", label: "Kolaj", icon: "overview", kinds: ["image"], min: 2, max: 36, run: "dialog" },
  { id: "imgStrip", group: "tools", label: "Meta veriyi temizle", icon: "shield", kinds: ["image"], run: "client" },
  { id: "imgToPdf", group: "tools", label: "Görsellerden PDF", icon: "file", kinds: ["image"], run: "dialog", op: "imagesToPdf" },
  { id: "qrRead", group: "tools", label: "QR kodu oku", icon: "qr", kinds: ["image"], max: 10, run: "client", needs: "qr" },
  // Ses / video
  { id: "avTrim", group: "tools", label: "Kırp (zaman)", icon: "scissors", kinds: AV, max: 1, run: "media", mode: "trim", needs: "ffmpeg" },
  { id: "avCompress", group: "tools", label: "Sıkıştır", icon: "minimize", kinds: AV, run: "dialog", op: "compress", needs: "ffmpeg" },
  { id: "avSpeed", group: "tools", label: "Hız", icon: "fast", kinds: AV, run: "dialog", op: "speed", needs: "ffmpeg" },
  { id: "avMute", group: "tools", label: "Sesi kapat", icon: "volumeX", kinds: ["video"], run: "main", op: "mute", needs: "ffmpeg" },
  { id: "avExtract", group: "tools", label: "Sesi ayıkla", icon: "music", kinds: ["video"], run: "dialog", op: "extractAudio", needs: "ffmpeg" },
  { id: "avJoin", group: "tools", label: "Birleştir", icon: "merge", kinds: AV, min: 2, max: 50, run: "dialog", op: "join", needs: "ffmpeg" },
  { id: "avSplit", group: "tools", label: "Böl", icon: "split", kinds: AV, run: "dialog", op: "split", needs: "ffmpeg" },
  { id: "avSnapshot", group: "tools", label: "Kare yakala", icon: "camera", kinds: ["video"], max: 1, run: "media", mode: "snapshot", needs: "ffmpeg" },
  { id: "avNormalize", group: "tools", label: "Ses normalize", icon: "activity", kinds: AV, run: "main", op: "normalize", needs: "ffmpeg" },
  { id: "avResize", group: "tools", label: "Çözünürlük", icon: "maximize", kinds: ["video"], run: "dialog", op: "resize", needs: "ffmpeg" },
  { id: "avCrop", group: "tools", label: "Görüntüyü kırp (oran)", icon: "crop", kinds: ["video"], run: "dialog", op: "cropAspect", needs: "ffmpeg" },
  { id: "avRotate", group: "tools", label: "Döndür", icon: "rotate", kinds: ["video"], run: "dialog", op: "rotate", needs: "ffmpeg" },
  { id: "avGif", group: "tools", label: "GIF yap", icon: "film", kinds: ["video"], max: 1, run: "media", mode: "gif", needs: "ffmpeg" },
  // PDF
  { id: "pdfMerge", group: "tools", label: "Birleştir", icon: "merge", kinds: ["pdf"], min: 2, max: 100, run: "main", op: "pdfMerge", needs: "pdfLib" },
  { id: "pdfSplit", group: "tools", label: "Böl", icon: "split", kinds: ["pdf"], max: 1, run: "dialog", op: "pdfSplit", needs: "pdfLib" },
  { id: "pdfPages", group: "tools", label: "Sayfaları düzenle", icon: "layers", kinds: ["pdf"], max: 1, run: "pdf", needs: "pdfLib" },
  { id: "pdfRotate", group: "tools", label: "Döndür", icon: "rotate", kinds: ["pdf"], max: 1, run: "dialog", op: "pdfOrganize", needs: "pdfLib" },
  { id: "pdfCompress", group: "tools", label: "Sıkıştır", icon: "minimize", kinds: ["pdf"], run: "main", op: "pdfCompress" },
  // Diğer
  { id: "zipExtract", group: "tools", label: "ZIP aç", icon: "archive", kinds: ["archive"], run: "main", op: "zipExtract", needs: "unzip" },
  { id: "textEncode", group: "tools", label: "Metin kodlaması", icon: "type", kinds: ["text", "subtitle", "html"], run: "dialog", op: "textEncode" },
  // Dosya işlemleri
  { id: "float", group: "actions", label: "Float rafına ekle", icon: "paperclip", kinds: ALL, max: 200, run: "action" },
  { id: "reveal", group: "actions", label: "Klasörde göster", icon: "folder", kinds: ALL, max: 1, run: "action" },
  { id: "zipCreate", group: "actions", label: "ZIP oluştur", icon: "archive", kinds: ALL, run: "dialog", op: "zipCreate", needs: "zip" },
  { id: "rename", group: "actions", label: "Yeniden adlandır (kopya)", icon: "type", kinds: FILES, run: "dialog", op: "renameCopies" },
  { id: "copyPath", group: "actions", label: "Yolu kopyala", icon: "copy", kinds: ALL, run: "action" },
  { id: "preview", group: "actions", label: "Önizle", icon: "eye", kinds: FILES, max: 1, run: "action" },
  { id: "remove", group: "actions", label: "Listeden kaldır", icon: "x", kinds: ALL, run: "action" },
]);

export const GROUPS = Object.freeze([
  { key: "convert", label: "Dönüştür", icon: "swap" },
  { key: "tools", label: "Araçlar", icon: "sliders" },
  { key: "actions", label: "Dosya işlemleri", icon: "folder" },
]);

/** Seçimin türleri (yinelenmeyen). */
export const kindsOf = (files) => [...new Set((files || []).map((f) => (f.isDir ? "folder" : f.kind || kindOf(f.name))))];

/** Seçimdeki tüm türlerin ortak dönüştürme hedefleri. */
export function convertTargets(files) {
  const kinds = kindsOf(files);
  if (!kinds.length) return [];
  let common = null;
  for (const k of kinds) {
    const t = CONVERT_TARGETS[k] || [];
    common = common ? common.filter((x) => t.includes(x)) : [...t];
  }
  return common || [];
}

/** Hedefe göre dönüşüm aracı tanımı. */
export function convertTool(files, target) {
  const kinds = kindsOf(files);
  const label = target.toUpperCase();
  if (kinds.every((k) => k === "image")) {
    if (target === "pdf") return { id: "toPdf", group: "convert", label: "PDF", icon: "file", run: "dialog", op: "imagesToPdf", target };
    if (CANVAS_OUT[target]) return { id: `to-${target}`, group: "convert", label, icon: "image", run: "client", op: "canvasConvert", target };
    return { id: `to-${target}`, group: "convert", label, icon: "image", run: "main", op: "imageConvert", target, needs: target === "heic" ? "mac" : null };
  }
  if (kinds.every((k) => k === "subtitle")) return { id: `to-${target}`, group: "convert", label, icon: "message", run: "main", op: "subtitleConvert", target };
  if (kinds.every((k) => k === "text" || k === "html")) return { id: "toPdf", group: "convert", label: "PDF", icon: "file", run: "main", op: kinds.includes("html") && kinds.length === 1 ? "htmlToPdf" : "textToPdf", target };
  const audio = ["mp3", "m4a", "wav", "ogg", "flac"].includes(target);
  return { id: `to-${target}`, group: "convert", label, icon: target === "gif" ? "film" : audio ? "music" : "video", run: target === "gif" ? "dialog" : "main", op: "convert", target, needs: "ffmpeg" };
}

/**
 * Seçime uyan araçlar (gruplu). caps: yetenekler ({ ffmpeg, pdfLib, … }); verilmezse hepsi var sayılır.
 * Uymayan ama yetenek eksikliğinden kapalı olanlar disabled + reason ile döner.
 */
export function toolsFor(files, caps = null) {
  const list = files || [];
  const kinds = kindsOf(list);
  const n = list.length;
  const out = { convert: [], tools: [], actions: [] };
  if (!n) return out;
  const reason = (needs) => {
    if (!caps || !needs) return null;
    if (needs === "qr") return caps.qrNative || caps.jsqr ? null : "QR okuma için güncelleme gerekiyor.";
    if (needs === "mac") return caps.platform === "darwin" || caps.sips ? null : "Yalnız Mac'te.";
    if (caps[needs] === false) return { ffmpeg: "ffmpeg bulunamadı.", pdfLib: "Bu özellik için güncelleme gerekiyor.", zip: "ZIP aracı bulunamadı.", unzip: "ZIP aracı bulunamadı.", ytdlp: "yt-dlp yüklü değil." }[needs] || "Kullanılamıyor.";
    return null;
  };
  for (const target of convertTargets(list)) {
    const t = convertTool(list, target);
    const r = reason(t.needs);
    out.convert.push(r ? { ...t, disabled: true, reason: r } : t);
  }
  for (const tool of TOOLS) {
    if (!kinds.every((k) => tool.kinds.includes(k))) continue;
    if (n < (tool.min || 1) || n > (tool.max || Infinity)) continue;
    const r = reason(tool.needs);
    out[tool.group].push(r ? { ...tool, disabled: true, reason: r } : tool);
  }
  return out;
}

/** Bayt sayısı → "1,2 MB". */
export function formatBytes(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0) return "";
  if (v < 1024) return `${v} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let x = v / 1024;
  let i = 0;
  while (x >= 1024 && i < units.length - 1) { x /= 1024; i += 1; }
  return `${x.toLocaleString("tr-TR", { maximumFractionDigits: x < 10 ? 1 : 0 })} ${units[i]}`;
}

/** Milisaniye → "1:02:03.4" / "2:03.4". */
export function formatTime(ms, { tenths = true } = {}) {
  const t = Math.max(0, Number(ms) || 0);
  const h = Math.floor(t / 3600000);
  const m = Math.floor((t % 3600000) / 60000);
  const s = Math.floor((t % 60000) / 1000);
  const d = Math.floor((t % 1000) / 100);
  const mm = h ? String(m).padStart(2, "0") : String(m);
  return `${h ? `${h}:` : ""}${mm}:${String(s).padStart(2, "0")}${tenths ? `.${d}` : ""}`;
}

/** "1:02.5" / "62.5" / "1:02:03" → ms (geçersizse null). */
export function parseTime(text) {
  const s = String(text || "").trim().replace(",", ".");
  if (!s) return null;
  const parts = s.split(":");
  if (parts.length > 3 || parts.some((p) => !/^\d+(\.\d+)?$/.test(p))) return null;
  const nums = parts.map(Number);
  const secs = nums.reduce((acc, v) => acc * 60 + v, 0);
  return Math.round(secs * 1000);
}

/** İş durumu etiketi. */
export const JOB_STATUS = Object.freeze({ queued: "Sırada", running: "Çalışıyor", done: "Bitti", error: "Hata", canceled: "İptal edildi" });
