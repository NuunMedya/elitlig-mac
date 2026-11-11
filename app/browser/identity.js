// Tarayıcı kimliği — SAF yardımcılar (Electron'a dokunmaz; app/test/browser-identity.test.js sınar).
//
// Gömülü tarayıcı kendini sıradan bir masaüstü tarayıcısı olarak tanıtır (Min, Ferdium,
// Rambox, Wavebox gibi Electron tabanlı tarayıcıların yaptığı gibi). Amaç, kullanıcının KENDİ
// Google hesaplarına kendi profillerinde girebilmesidir; yalnız kimlik sunumu yapılır.
//
//   • Chrome kimliği: motorun gerçek ana sürümüyle (process.versions.chrome) standart Chrome
//     kullanıcı aracısı (Chrome'un "azaltılmış" biçimi: Chrome/<ana>.0.0.0) + buna uyan istemci
//     ipuçları (Sec-CH-UA*, navigator.userAgentData): marka listesi Chromium'un GREASE
//     algoritmasıyla, "Google Chrome" dahil.
//   • Firefox kimliği: yalnız Google giriş sayfası (accounts.google.com) için güncel Firefox
//     kullanıcı aracısı; Firefox istemci ipucu göndermez → Sec-CH-UA* başlıkları silinir.
//   • Uyumluluk kipi: "auto" (Chrome; Google reddederse o profilde giriş sayfası için Firefox),
//     "chrome", "firefox".
"use strict";

const COMPAT_MODES = Object.freeze(["auto", "chrome", "firefox"]);
const COMPAT_LABELS = Object.freeze({ auto: "Otomatik", chrome: "Chrome", firefox: "Firefox" });

/** Firefox kimliğinin kullanıldığı (Google giriş) alan adları. */
const GOOGLE_SIGNIN_HOSTS = Object.freeze(["accounts.google.com", "accounts.youtube.com"]);
const DEFAULT_SIGNIN_URL = "https://accounts.google.com/";

const normalizeMode = (m) => (COMPAT_MODES.includes(m) ? m : "auto");

/** "darwin" | "win32" | diğer (linux) → istemci ipucu platform adı. */
function platformName(platform) {
  if (platform === "darwin") return "macOS";
  if (platform === "win32") return "Windows";
  if (platform === "android") return "Android";
  if (platform === "cros") return "Chrome OS";
  return "Linux";
}

function chromeMajor(version) {
  const n = parseInt(String(version || "").split(".")[0], 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Chromium'un GREASE markası (components/embedder_support/user_agent_utils.cc,
 * GetGreasedUserAgentBrandVersion): tohum = ana sürüm.
 */
function greasedBrand(major) {
  const chars = [" ", "(", ":", "-", ".", "/", ")", ";", "=", "?", "_"];
  const versions = ["8", "99", "24"];
  return { brand: `Not${chars[major % 11]}A${chars[(major + 1) % 11]}Brand`, version: versions[major % 3] };
}

/**
 * Chrome'un marka listesi (GenerateBrandVersionList): üç öğe, sırası tohuma göre karıştırılır.
 * full=true → tam sürümler (Sec-CH-UA-Full-Version-List / fullVersionList).
 */
function brandList(chromeVersion, { full = false } = {}) {
  const major = chromeMajor(chromeVersion);
  const g = greasedBrand(major);
  const v = full ? String(chromeVersion) : String(major);
  const greasey = { brand: g.brand, version: full ? `${g.version}.0.0.0` : g.version };
  const chromium = { brand: "Chromium", version: v };
  const chrome = { brand: "Google Chrome", version: v };
  const orders = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
  const order = orders[major % 6];
  const out = [];
  out[order[0]] = greasey;
  out[order[1]] = chromium;
  out[order[2]] = chrome;
  return out;
}

/** Marka listesi → başlık değeri: "Google Chrome";v="152", "Chromium";v="152", … */
const brandHeader = (brands) => brands.map((b) => `"${b.brand}";v="${b.version}"`).join(", ");

/** Kullanıcı aracısındaki platform parçası (Chrome'un azaltılmış UA'sı sabit değerler kullanır). */
function chromePlatformToken(platform) {
  if (platform === "darwin") return "Macintosh; Intel Mac OS X 10_15_7";
  if (platform === "win32") return "Windows NT 10.0; Win64; x64";
  return "X11; Linux x86_64";
}

/** Standart Chrome kullanıcı aracısı (Chrome 110+ azaltılmış biçim: küçük sürüm hep 0.0.0). */
function chromeUserAgent({ platform = process.platform, chromeVersion } = {}) {
  const major = chromeMajor(chromeVersion);
  if (!major) throw new Error("Chrome sürümü bilinmiyor.");
  return `Mozilla/5.0 (${chromePlatformToken(platform)}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36`;
}

/**
 * Güncel Firefox ana sürümü: dört haftalık yayın takvimine göre tarihten kestirilir
 * (Firefox 133 = 26 Kasım 2024; her 28 günde bir yeni sürüm). Takvim kayarsa bir-iki
 * sürüm sapma olur; Google için yeterince "güncel"dir.
 */
function firefoxVersion(date = new Date()) {
  const base = Date.UTC(2024, 10, 26);
  const t = date instanceof Date ? date.getTime() : Number(date);
  const steps = Math.floor((t - base) / (28 * 86400000));
  return Math.max(133, 133 + steps);
}

function firefoxUserAgent({ platform = process.platform, date = new Date() } = {}) {
  const v = firefoxVersion(date);
  const os = platform === "darwin" ? "Macintosh; Intel Mac OS X 10.15" : platform === "win32" ? "Windows NT 10.0; Win64; x64" : "X11; Linux x86_64";
  return `Mozilla/5.0 (${os}; rv:${v}.0) Gecko/20100101 Firefox/${v}.0`;
}

/** os.release() / process.getSystemVersion() → Chrome'un Sec-CH-UA-Platform-Version biçimi. */
function platformVersionOf({ platform = process.platform, release = "", systemVersion = "" } = {}) {
  const three = (s) => { const p = String(s || "").split(/[.-]/).map((x) => parseInt(x, 10)).filter((n) => Number.isFinite(n)); while (p.length < 3) p.push(0); return p.slice(0, 3).join("."); };
  if (platform === "darwin") return three(systemVersion || "15.0.0");
  if (platform === "win32") {
    // Windows 11 (derleme ≥ 22000) Chrome'da "13.0.0"+ olarak bildirilir; Windows 10 → "10.0.0".
    const build = parseInt(String(release || "").split(".")[2], 10);
    return Number.isFinite(build) && build >= 22000 ? "15.0.0" : "10.0.0";
  }
  return three(release || "6.0.0");
}

/** CDP Emulation.UserAgentMetadata (Chrome kimliği). */
function chromeMetadata({ platform = process.platform, chromeVersion, arch = process.arch, platformVersion = "" } = {}) {
  return {
    brands: brandList(chromeVersion),
    fullVersionList: brandList(chromeVersion, { full: true }),
    fullVersion: String(chromeVersion),
    platform: platformName(platform),
    platformVersion: platformVersion || platformVersionOf({ platform }),
    architecture: /arm/.test(arch) ? "arm" : "x86",
    model: "",
    mobile: false,
    bitness: /64/.test(arch) ? "64" : "32",
    wow64: false,
    formFactors: ["Desktop"],
  };
}

/** Bir ortam için iki kimlik: { chrome: { userAgent, metadata }, firefox: { userAgent } }. */
function buildIdentity(env = {}) {
  const ctx = { platform: env.platform || process.platform, chromeVersion: env.chromeVersion || process.versions.chrome, arch: env.arch || process.arch, platformVersion: env.platformVersion || "" };
  return {
    chrome: { kind: "chrome", userAgent: chromeUserAgent(ctx), metadata: chromeMetadata(ctx) },
    firefox: { kind: "firefox", userAgent: firefoxUserAgent({ platform: ctx.platform, date: env.date || new Date() }), metadata: null },
  };
}

const hostOf = (url) => { try { return new URL(url).hostname.toLowerCase(); } catch { return ""; } };
const isGoogleSignIn = (url) => GOOGLE_SIGNIN_HOSTS.includes(hostOf(url));

/**
 * Bir sayfa (üst çerçeve adresi) için kullanılacak kimlik: "chrome" | "firefox".
 * Firefox yalnız Google giriş sayfasında; kip "firefox" ya da "auto" + bu profilde ret görülmüş.
 */
function identityFor(pageUrl, { mode = "auto", fallback = false } = {}) {
  if (!isGoogleSignIn(pageUrl)) return "chrome";
  const m = normalizeMode(mode);
  if (m === "firefox") return "firefox";
  if (m === "auto" && fallback) return "firefox";
  return "chrome";
}

/** İstek başlıkları adı büyük/küçük harf duyarsız. */
const CH_RE = /^sec-ch-ua(-|$)/i;

/**
 * İstek başlıklarını kimliğe uydurur (yeni nesne döner; girdi değişmez).
 *   chrome: User-Agent = Chrome UA; VAR OLAN Sec-CH-UA* değerleri Chrome meta verisiyle yazılır
 *           (eklenmez: sunucu yüksek entropili ipuçlarını Accept-CH ile ister, motor gönderir).
 *   firefox: User-Agent = Firefox UA; tüm Sec-CH-UA* silinir (Firefox göndermez).
 */
function rewriteHeaders(headers, identity) {
  const out = {};
  const kind = identity?.kind || "chrome";
  for (const [k, v] of Object.entries(headers || {})) {
    if (/^user-agent$/i.test(k)) continue;
    if (CH_RE.test(k)) {
      if (kind === "firefox") continue;
      const nv = chHeaderValue(k.toLowerCase(), identity.metadata);
      out[k] = nv == null ? v : nv;
      continue;
    }
    out[k] = v;
  }
  out["User-Agent"] = identity.userAgent;
  return out;
}

const q = (s) => `"${s}"`;
function chHeaderValue(name, md) {
  if (!md) return null;
  switch (name) {
    case "sec-ch-ua": return brandHeader(md.brands);
    case "sec-ch-ua-full-version-list": return brandHeader(md.fullVersionList);
    case "sec-ch-ua-full-version": return q(md.fullVersion);
    case "sec-ch-ua-platform": return q(md.platform);
    case "sec-ch-ua-platform-version": return q(md.platformVersion);
    case "sec-ch-ua-arch": return q(md.architecture);
    case "sec-ch-ua-bitness": return q(md.bitness);
    case "sec-ch-ua-model": return q(md.model);
    case "sec-ch-ua-mobile": return md.mobile ? "?1" : "?0";
    case "sec-ch-ua-wow64": return md.wow64 ? "?1" : "?0";
    case "sec-ch-ua-form-factors": return (md.formFactors || ["Desktop"]).map(q).join(", ");
    default: return null;
  }
}

/* ------------------- gezinme istekleri için istemci ipuçları ------------------- */
// Chrome üst/alt çerçeve gezinmesinde (güvenli kökene) düşük entropili üç ipucunu HER ZAMAN,
// sitenin Accept-CH ile istediklerini de ekler. Electron gezinme isteklerine hiç eklemez
// (gömülü tarayıcıda yalnız alt kaynaklarda vardı) → kimlik tutarsız görünürdü.
const LOW_ENTROPY = ["sec-ch-ua", "sec-ch-ua-mobile", "sec-ch-ua-platform"];
const HINT_NAMES = new Set([...LOW_ENTROPY, "sec-ch-ua-full-version-list", "sec-ch-ua-full-version", "sec-ch-ua-platform-version", "sec-ch-ua-arch", "sec-ch-ua-bitness", "sec-ch-ua-model", "sec-ch-ua-wow64", "sec-ch-ua-form-factors"]);

/** Accept-CH başlık değeri → istenen UA ipucu adları (küçük harf). */
function parseAcceptCh(value) {
  const list = Array.isArray(value) ? value.join(",") : String(value || "");
  return [...new Set(list.split(",").map((x) => x.trim().toLowerCase()).filter((x) => HINT_NAMES.has(x)))];
}

/** İpuçlarının gönderileceği güvenli köken mi (https ya da yerel). */
function secureUrl(url) {
  try { const u = new URL(url); return u.protocol === "https:" || (u.protocol === "http:" && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(u.hostname)); } catch { return false; }
}

/**
 * Gezinme isteğine eksik ipuçlarını ekler (Chrome kimliği, güvenli köken). Var olanlar
 * rewriteHeaders ile zaten uydurulmuştur; yalnız eksikler eklenir.
 */
function addNavigationHints(headers, identity, url, requested = []) {
  if (identity?.kind !== "chrome" || !identity.metadata || !secureUrl(url)) return headers;
  const out = { ...headers };
  const have = new Set(Object.keys(out).map((k) => k.toLowerCase()));
  for (const name of [...LOW_ENTROPY, ...requested]) {
    if (have.has(name)) continue;
    const v = chHeaderValue(name, identity.metadata);
    if (v != null) { out[name] = v; have.add(name); }
  }
  return out;
}

/** CDP Emulation.setUserAgentOverride parametreleri. */
function cdpOverride(identity, acceptLanguage) {
  const p = { userAgent: identity.userAgent };
  if (acceptLanguage) p.acceptLanguage = acceptLanguage;
  if (identity.metadata) p.userAgentMetadata = identity.metadata;
  return p;
}

/* ------------------------------ Google reddi ------------------------------ */

/** Google'ın "Bu tarayıcı veya uygulama güvenli olmayabilir" sayfası adresi. */
function isRejectedUrl(url) {
  const s = String(url || "");
  if (!isGoogleSignIn(s)) return false;
  try {
    const u = new URL(s);
    return /\/signin\/(v\d\/)?rejected\b/i.test(u.pathname) || /\/(deniedsigninrejected|signin\/v2\/deniedsigninrejected)\b/i.test(u.pathname);
  } catch { return false; }
}

const REJECT_TEXTS = [
  /this browser or app may not be secure/i,
  /bu tarayıcı veya uygulama güvenli olmayabilir/i,
  /dieser browser oder diese app ist möglicherweise nicht sicher/i,
  /ce navigateur ou cette application ne sont peut-être pas sécurisés/i,
];
/** Sayfa metninde ret iletisi var mı (yalnız Google giriş sayfası için çağrılır). */
const isRejectedText = (text) => REJECT_TEXTS.some((re) => re.test(String(text || "")));

/**
 * Ret görüldüğünde ne yapılır:
 *   { action: "fallback" } — Otomatik kipte Chrome reddedildi: bu profilde Firefox'a geç, yeniden dene
 *   { action: "banner", next } — kullanıcıya şerit; "next" önerilen kip (Chrome ↔ Firefox)
 */
function onRejected({ mode = "auto", identity = "chrome", autoTried = false } = {}) {
  const m = normalizeMode(mode);
  if (m === "auto" && identity === "chrome" && !autoTried) return { action: "fallback" };
  return { action: "banner", next: identity === "firefox" ? "chrome" : "firefox" };
}

/** Ret sonrası yeniden denenecek giriş adresi: son ret dışı Google giriş adresi, yoksa ret adresindeki "continue". */
function retryUrl({ lastSignin = "", rejected = "" } = {}) {
  if (lastSignin && isGoogleSignIn(lastSignin) && !isRejectedUrl(lastSignin)) return lastSignin;
  try {
    const c = new URL(rejected).searchParams.get("continue");
    if (c && /^https:\/\//.test(c)) return `${DEFAULT_SIGNIN_URL}ServiceLogin?continue=${encodeURIComponent(c)}`;
  } catch { /* yoksay */ }
  return DEFAULT_SIGNIN_URL;
}

module.exports = {
  COMPAT_MODES, COMPAT_LABELS, GOOGLE_SIGNIN_HOSTS, DEFAULT_SIGNIN_URL,
  normalizeMode, platformName, chromeMajor, greasedBrand, brandList, brandHeader, chromeUserAgent,
  firefoxVersion, firefoxUserAgent, platformVersionOf, chromeMetadata, buildIdentity,
  isGoogleSignIn, identityFor, rewriteHeaders, chHeaderValue, cdpOverride, parseAcceptCh, secureUrl, addNavigationHints,
  isRejectedUrl, isRejectedText, onRejected, retryUrl,
};
