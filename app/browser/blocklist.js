// Tarayıcı — yerleşik reklam / izleyici engelleyici (SAF; app/test/browser.test.js sınar).
//
// Basit ve hızlı: alan adı listesi (alt alan adları dahil). Ana çerçeve (sayfanın
// kendisi) hiç engellenmez; yalnız sayfanın yüklediği alt kaynaklar. Site başına
// kapatılabilir (adblockAllow) ve kullanıcı kendi alan adlarını ekleyebilir.
// Not: YouTube reklamları youtube.com'un kendisinden geldiği için alan adı
// listesiyle engellenemez (bilerek denenmez: oynatıcıyı bozar).
"use strict";

const DEFAULT_BLOCKLIST = Object.freeze([
  // Google reklam / ölçüm
  "doubleclick.net", "googlesyndication.com", "googleadservices.com", "google-analytics.com", "googletagmanager.com",
  "googletagservices.com", "adservice.google.com", "adservice.google.com.tr", "pagead2.googlesyndication.com", "app-measurement.com",
  // Reklam ağları
  "adnxs.com", "criteo.com", "criteo.net", "taboola.com", "outbrain.com", "amazon-adsystem.com", "adform.net", "pubmatic.com",
  "rubiconproject.com", "openx.net", "casalemedia.com", "smartadserver.com", "adsrvr.org", "bidswitch.net", "33across.com",
  "sharethrough.com", "teads.tv", "zedo.com", "popads.net", "propellerads.com", "exoclick.com", "admixer.net", "mgid.com",
  "revcontent.com", "media.net", "advertising.com", "serving-sys.com", "yieldmo.com", "contextweb.com", "lijit.com",
  "adition.com", "adtelligent.com", "onetag-sys.com", "3lift.com", "indexww.com", "sovrn.com", "undertone.com",
  "adskeeper.com", "adsterra.com", "popcash.net", "hilltopads.net", "trafficjunky.net", "juicyads.com",
  // Ölçüm / izleme
  "scorecardresearch.com", "quantserve.com", "quantcount.com", "moatads.com", "doubleverify.com", "adsafeprotected.com",
  "hotjar.com", "hotjar.io", "mc.yandex.ru", "mc.yandex.com", "ads-twitter.com", "static.ads-twitter.com", "analytics.tiktok.com",
  "bat.bing.com", "clarity.ms", "chartbeat.com", "chartbeat.net", "newrelic.com", "nr-data.net", "segment.io", "mouseflow.com",
  "crazyegg.com", "fullstory.com", "luckyorange.com", "krxd.net", "bluekai.com", "demdex.net", "everesttech.net",
  "rlcdn.com", "agkn.com", "tapad.com", "adroll.com", "gemius.pl", "effectivemeasure.net",
]);

const ALWAYS_PASS = new Set(["mainFrame"]);

/** "a.b.example.com" → ["a.b.example.com", "b.example.com", "example.com"] */
function hostSuffixes(host) {
  const parts = String(host || "").toLowerCase().replace(/\.$/, "").split(".").filter(Boolean);
  const out = [];
  for (let i = 0; i < parts.length - 1; i += 1) out.push(parts.slice(i).join("."));
  if (parts.length === 1) out.push(parts[0]);
  return out;
}

const hostOf = (url) => { try { return new URL(url).hostname.toLowerCase(); } catch { return ""; } };

function createBlocker(domains = DEFAULT_BLOCKLIST) {
  let set = new Set();
  const setDomains = (list) => { set = new Set([...(list || [])].map((d) => String(d || "").trim().toLowerCase().replace(/^\*?\.?/, "")).filter(Boolean)); };
  setDomains(domains);
  /** Alan adı (ya da üst alan adlarından biri) listede mi? */
  const matches = (host) => {
    const h = String(host || "").toLowerCase();
    if (!h) return false;
    for (const s of hostSuffixes(h)) if (set.has(s)) return true;
    return false;
  };
  /** Site (alan adı ya da üstü) izin listesinde mi (engelleyici o sitede kapalı)? */
  const siteAllowed = (pageHost, allow = []) => {
    if (!pageHost || !allow?.length) return false;
    const a = new Set(allow.map((x) => String(x).toLowerCase()));
    return hostSuffixes(pageHost).some((s) => a.has(s));
  };
  /**
   * { url, resourceType, pageUrl, enabled, allow: [site] } → true: iptal et.
   * Sayfanın kendi alan adından gelen kaynaklar engellenmez (site işlevi bozulmasın).
   */
  const shouldBlock = ({ url, resourceType, pageUrl, enabled = true, allow = [] }) => {
    if (!enabled || ALWAYS_PASS.has(resourceType)) return false;
    if (!/^(https?|wss?):/i.test(String(url || ""))) return false;
    const host = hostOf(url);
    if (!matches(host)) return false;
    const pageHost = hostOf(pageUrl);
    if (pageHost && siteAllowed(pageHost, allow)) return false;
    if (pageHost && matches(pageHost) && hostSuffixes(pageHost).slice(-2).some((s) => hostSuffixes(host).includes(s))) return false;
    return true;
  };
  return { matches, shouldBlock, siteAllowed, setDomains, size: () => set.size };
}

module.exports = { DEFAULT_BLOCKLIST, createBlocker, hostSuffixes };
