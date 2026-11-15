// "Bağlantıdan indir" — yt-dlp argümanları, ilerleme ayrıştırma ve hata metinleri
// (saf işlevler; Electron'a bağlı değil, testlerde doğrudan kullanılır).
"use strict";

const path = require("node:path");

const SITES = [
  [/(^|\.)(youtube\.com|youtu\.be|youtube-nocookie\.com)$/, "youtube", "YouTube"],
  [/(^|\.)instagram\.com$/, "instagram", "Instagram"],
  [/(^|\.)(x\.com|twitter\.com)$/, "x", "X (Twitter)"],
  [/(^|\.)tiktok\.com$/, "tiktok", "TikTok"],
  [/(^|\.)(facebook\.com|fb\.watch|fb\.com)$/, "facebook", "Facebook"],
  [/(^|\.)vimeo\.com$/, "vimeo", "Vimeo"],
  [/(^|\.)twitch\.tv$/, "twitch", "Twitch"],
  [/(^|\.)dailymotion\.com$/, "dailymotion", "Dailymotion"],
  [/(^|\.)soundcloud\.com$/, "soundcloud", "SoundCloud"],
];

/** Bağlantının sitesi: { key, label } (tanınmıyorsa key "other"). */
function siteOf(url) {
  let host = "";
  try {
    const u = new URL(String(url).trim());
    if (!/^https?:$/.test(u.protocol) || !u.hostname) return { key: "invalid", label: "" };
    host = u.hostname.toLowerCase();
  } catch { return { key: "invalid", label: "" }; }
  for (const [re, key, label] of SITES) if (re.test(host)) return { key, label };
  return { key: "other", label: host.replace(/^www\./, "") };
}

const isHttpUrl = (s) => /^https?:\/\/[^\s/$.?#][^\s]*$/i.test(String(s || "").trim());

/** YouTube oynatma listesi içeren bağlantı mı (watch?v=…&list=… ya da /playlist?list=…)? */
function hasPlaylist(url) {
  try {
    const u = new URL(String(url));
    return siteOf(url).key === "youtube" && (u.searchParams.has("list") || /\/playlist$/.test(u.pathname));
  } catch { return false; }
}

const QUALITIES = Object.freeze({ best: null, 2160: 2160, 1080: 1080, 720: 720, 480: 480 });
const COOKIE_BROWSERS = Object.freeze(["chrome", "safari", "firefox", "edge", "brave", "chromium", "opera", "vivaldi"]);

/**
 * yt-dlp argümanları.
 * o: { url, mode: "video" | "audio" | "images", quality, audioFormat: "mp3" | "m4a",
 *      playlist (bool), withImages (bool), cookiesBrowser, cookiesFile, workDir, ffmpegPath, jsRuntime }
 * jsRuntime: YouTube'un JS doğrulaması için node uyumlu çalıştırıcı (Electron ikilisi,
 * ELECTRON_RUN_AS_NODE=1 ile) — yt-dlp 2025.11'den beri gerekir.
 */
function buildYtdlpArgs(o = {}) {
  const url = String(o.url || "").trim();
  if (!isHttpUrl(url)) throw new Error("Geçerli bir http(s) bağlantısı girin.");
  const mode = ["video", "audio", "images"].includes(o.mode) ? o.mode : "video";
  const args = [
    "--newline", "--no-mtime", "--no-part", "--windows-filenames", "--no-colors", "--ignore-config",
    "--retries", "5", "--fragment-retries", "5",
    // Çoklu öğe (oynatma listesi, Instagram çoklu gönderi): "3 - Başlık.mp4"
    "-o", path.join(o.workDir || ".", "%(playlist_index&{} - |)s%(title).150B.%(ext)s"),
  ];
  if (o.ffmpegPath) args.push("--ffmpeg-location", String(o.ffmpegPath));
  if (o.jsRuntime) args.push("--js-runtimes", `node:${o.jsRuntime}`);
  args.push(o.playlist ? "--yes-playlist" : "--no-playlist");
  if (o.playlist) args.push("--playlist-items", "1:300");
  // Tarayıcı profilinin çerezleri (app/browser): uygulamanın kendi yazdığı cookies.txt.
  if (o.cookiesFile) args.push("--cookies", String(o.cookiesFile));
  else if (o.cookiesBrowser) {
    const b = String(o.cookiesBrowser).toLowerCase();
    if (!COOKIE_BROWSERS.includes(b)) throw new Error("Desteklenmeyen tarayıcı.");
    args.push("--cookies-from-browser", b);
  }
  if (mode === "audio") {
    const fmt = o.audioFormat === "m4a" ? "m4a" : "mp3";
    args.push("-f", fmt === "m4a" ? "ba[ext=m4a]/ba/b" : "ba/b", "-x", "--audio-format", fmt, "--audio-quality", "0");
  } else if (mode === "images") {
    // Gönderi fotoğrafları (Instagram çoklu gönderi vb.): görsel öğenin "küçük resmi"
    // tam boyutlu fotoğrafın kendisidir; video indirilmez.
    args.push("--skip-download", "--write-thumbnail", "--convert-thumbnails", "jpg", "--ignore-no-formats-error");
  } else {
    const h = QUALITIES[o.quality] ?? null;
    // Mac / Windows'ta her oynatıcıda açılsın: H.264 + AAC tercih edilir, MP4'e birleştirilir.
    args.push("-f", h ? `bv*[height<=${h}]+ba/b[height<=${h}]/bv*+ba/b` : "bv*+ba/b", "-S", h ? `res:${h},vcodec:h264,acodec:m4a` : "vcodec:h264,res,acodec:m4a", "--merge-output-format", "mp4");
    if (o.withImages) args.push("--write-thumbnail", "--convert-thumbnails", "jpg", "--ignore-no-formats-error");
  }
  args.push("--", url);
  return args;
}

/**
 * yt-dlp stdout satırlarından ilerleme. state: önceki durum ({ index, count, pct }).
 * → { fraction (0..1) | null, note | null, state }
 */
function parseYtdlpProgress(chunk, state = { index: 1, count: 1, pct: 0 }) {
  let s = { ...state };
  let note = null;
  for (const line of String(chunk || "").split(/\r?\n/)) {
    const item = line.match(/\[download\] Downloading (?:item|video) (\d+) of (\d+)/i);
    if (item) { s = { index: Number(item[1]), count: Math.max(1, Number(item[2])), pct: 0 }; note = `${item[1]} / ${item[2]} indiriliyor`; continue; }
    const pct = line.match(/\[download\]\s+([\d.]+)%/);
    if (pct) { s.pct = Math.min(100, Number(pct[1])) / 100; continue; }
    if (/^\[(Merger|VideoConvertor|ExtractAudio|FixupM3u8|FixupM4a)\]/.test(line)) note = /ExtractAudio/.test(line) ? "Ses dönüştürülüyor…" : "Birleştiriliyor…";
    else if (/^\[(ThumbnailsConvertor|info)\].*(thumbnail|Writing)/i.test(line)) note = "Görseller kaydediliyor…";
  }
  const fraction = Math.max(0, Math.min(0.99, (s.index - 1 + s.pct) / s.count));
  return { fraction, note, state: s };
}

/** yt-dlp hata çıktısından kullanıcıya anlaşılır Türkçe ileti. site: siteOf().key */
function ytdlpError(stderr, { site = null, cookies = false } = {}) {
  const s = String(stderr || "");
  const last = s.split(/\r?\n/).map((l) => l.trim()).filter((l) => /^ERROR:/.test(l)).pop() || "";
  const cookieHint = cookies ? " Seçilen tarayıcıda siteye giriş yapmış olduğunuzdan emin olun." : " İndirme penceresinde “Tarayıcı çerezleri”nden siteye giriş yaptığınız tarayıcıyı seçip yeniden deneyin.";
  const rules = [
    [/could not find .* cookies database|failed to (decrypt|load) cookies|cookies.*(permission|Operation not permitted)|Full Disk Access|Keychain/i, "Tarayıcı çerezleri okunamadı. Tarayıcıyı kapatıp yeniden deneyin; Safari için Sistem Ayarları → Gizlilik ve Güvenlik → Tam Disk Erişimi'nden Elitlig Araçlar'a izin verin, ya da başka bir tarayıcı seçin."],
    [/Sign in to confirm (you.re not a bot|your age)|confirm you.re not a bot/i, `YouTube bu indirme için oturum istiyor (bot denetimi / yaş sınırı).${cookieHint}`],
    [/Instagram sent an empty media response|login required|Requested content is not available|rate-?limit|Please wait a few minutes|not granting access/i, `Instagram bu içerik için oturum istiyor.${cookieHint}`],
    [/There is no video in this post|No video formats found|no video could be found/i, site === "instagram" ? "Bu gönderide video yok: “Görseller” seçeneğiyle fotoğrafları indirin." : "Bu bağlantıda indirilebilir video bulunamadı."],
    [/Private video|This video is private|is private/i, "Video gizli: yalnız sahibinin izin verdiği hesaplar görebilir." + (cookies ? "" : cookieHint)],
    [/Video unavailable|This video has been removed|not available in your country|geo.?restrict/i, "Video kullanılamıyor (kaldırılmış ya da bu ülkede engelli)."],
    [/Unsupported URL/i, "Bu bağlantı desteklenmiyor. Videonun kendi sayfasının bağlantısını yapıştırın."],
    [/HTTP Error 403|Forbidden/i, `Site indirmeyi reddetti (403). Dosya Araçları → Ayarlar'dan yt-dlp'yi güncelleyin.${cookieHint}`],
    [/HTTP Error 429|Too Many Requests/i, "Site çok fazla istek nedeniyle geçici olarak engelledi (429). Birkaç dakika sonra deneyin."],
    [/Unable to download (webpage|JSON)|getaddrinfo|Name or service not known|timed out|Connection (reset|refused)|Network is unreachable/i, "Siteye bağlanılamadı. İnternet bağlantınızı denetleyin."],
    [/ffmpeg not found|ffprobe and ffmpeg not found|ffmpeg is not installed/i, "Birleştirme için ffmpeg bulunamadı."],
    [/is not a valid URL|Invalid URL/i, "Bağlantı geçersiz."],
  ];
  for (const [re, msg] of rules) if (re.test(s)) return msg;
  return last ? last.replace(/^ERROR:\s*(\[[^\]]+\]\s*)?(\S+:\s*)?/, "").slice(0, 240) : "İndirme başarısız.";
}

/** Sürüm karşılaştırma ("2026.10.26" / "2026.10.26.1"); a > b → 1. */
function compareVersions(a, b) {
  const pa = String(a || "").split(".").map((x) => Number(x) || 0);
  const pb = String(b || "").split(".").map((x) => Number(x) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0) ? 1 : -1;
  }
  return 0;
}

/** PyPI'nin sadeleştirdiği sürümden GitHub etiketi: "2026.1.5" → "2026.01.05". */
const tagFromVersion = (v) => String(v || "").split(".").map((p, i) => (i === 1 || i === 2 ? p.padStart(2, "0") : p)).join(".");

/** Platformun yt-dlp sürüm dosyası adı. */
function releaseAsset(platform = process.platform, arch = process.arch) {
  if (platform === "darwin") return { asset: "yt-dlp_macos", bin: "yt-dlp" };
  if (platform === "win32") return { asset: arch === "arm64" ? "yt-dlp_arm64.exe" : "yt-dlp.exe", bin: "yt-dlp.exe" };
  return { asset: arch === "arm64" ? "yt-dlp_linux_aarch64" : "yt-dlp_linux", bin: "yt-dlp" };
}

function parseSums(text) {
  const out = {};
  for (const line of String(text || "").split(/\r?\n/)) {
    const m = line.trim().match(/^([0-9a-f]{64})\s+\*?(.+)$/i);
    if (m) out[m[2].trim()] = m[1].toLowerCase();
  }
  return out;
}

module.exports = { siteOf, isHttpUrl, hasPlaylist, buildYtdlpArgs, parseYtdlpProgress, ytdlpError, compareVersions, tagFromVersion, releaseAsset, parseSums, COOKIE_BROWSERS, QUALITIES };
