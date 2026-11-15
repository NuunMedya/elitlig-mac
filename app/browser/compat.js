// Tarayıcı kimliği — çalışma zamanı (ana süreç). Saf kurallar identity.js'te.
//
//   • Her sekme ve açılır pencere webContents'ine webContents.debugger ile bağlanılır ve
//     CDP Emulation.setUserAgentOverride (userAgentMetadata ile) gönderilir: User-Agent
//     başlığı, Sec-CH-UA* başlıkları, navigator.userAgent ve navigator.userAgentData aynı
//     Chrome kimliğini söyler. Üst çerçeve Google giriş sayfasına gidip kip Firefox'u
//     gerektirdiğinde (did-start-navigation) kimlik Firefox'a geçer, çıkınca geri döner.
//     Emulation ve (Firefox kimliğinde userAgentData'yı gizleyen betik için) Page alanı
//     kullanılır; Runtime etkinleştirilmez, sayfaya uygulama API'si verilmez. DevTools (F12)
//     aynı anda açılabilir (Chromium birden çok istemciyi destekler; sınandı).
//     Electron gezinme isteklerine Sec-CH-UA eklemez: Chrome gibi düşük entropili ipuçları ve
//     sitenin Accept-CH ile istedikleri eklenir.
//   • Oturum düzeyinde (profil başına) session.setUserAgent + webRequest.onBeforeSendHeaders:
//     webContents'i olmayan istekler (service worker, ses.fetch) ve alt çerçeveler de aynı
//     kimliği taşır; Firefox kimliğinde Sec-CH-UA* silinir.
//   • Google reddi (…/signin/rejected ya da sayfa metni) algılanır → onRejection.
"use strict";

const identity = require("./identity");

const ACCEPT_LANGUAGE = "tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7";
const FIREFOX_SHAPE = "(() => { try { if (/ Firefox\\/\\d/.test(navigator.userAgent)) delete Navigator.prototype.userAgentData; } catch (e) {} })();";
const REJECT_TEXT_CODE = "(() => { try { return (document.body && document.body.innerText || '').slice(0, 6000); } catch { return ''; } })()";

function systemPlatformVersion() {
  try {
    if (process.platform === "darwin" && typeof process.getSystemVersion === "function") return identity.platformVersionOf({ platform: "darwin", systemVersion: process.getSystemVersion() });
    return identity.platformVersionOf({ platform: process.platform, release: require("node:os").release() });
  } catch { return ""; }
}

/**
 * deps:
 *   mode() → "auto" | "chrome" | "firefox"
 *   hasFallback(profileId) / addFallback(profileId) — Otomatik kipte öğrenilen Firefox geçişi
 *   onRejection({ wc, profileId, url, kind, decision })
 *   isolatedWorld — metin okuma için yalıtılmış dünya kimliği
 */
function createCompat({ mode, hasFallback, addFallback, onRejection, isolatedWorld = 1077, log = () => {}, env = {} } = {}) {
  const ident = identity.buildIdentity({ platformVersion: systemPlatformVersion(), ...env });
  const originOf = (url) => { try { return new URL(url).origin; } catch { return ""; } };
  const attachedWcs = new Map(); // wc.id → { wc, profileId, kind, seen, lastSignin, navs, shapeFrom }

  const kindFor = (url, profileId) => identity.identityFor(url, { mode: mode(), fallback: hasFallback(profileId) });
  const identityOf = (kind) => (kind === "firefox" ? ident.firefox : ident.chrome);

  /* ------------------------------ oturum düzeyi ------------------------------ */

  function setupSession(ses, profileId) {
    const acceptCh = new Map(); // köken → istenen ipuçları (profil başına, bellekte)
    ses.setUserAgent(ident.chrome.userAgent, ACCEPT_LANGUAGE);
    ses.webRequest.onBeforeSendHeaders({ urls: ["<all_urls>"] }, (details, callback) => {
      let pageUrl = "";
      try {
        if (details.resourceType === "mainFrame") pageUrl = details.url;
        else if (details.webContents && !details.webContents.isDestroyed()) pageUrl = details.webContents.getURL() || details.url;
        else pageUrl = details.url;
      } catch { pageUrl = details.url; }
      const ident = identityOf(kindFor(pageUrl, profileId));
      let headers = identity.rewriteHeaders(details.requestHeaders, ident);
      if (details.resourceType === "mainFrame" || details.resourceType === "subFrame") {
        headers = identity.addNavigationHints(headers, ident, details.url, acceptCh.get(originOf(details.url)) || []);
      }
      callback({ requestHeaders: headers });
    });
    // Sitenin Accept-CH ile istediği ipuçları (köken başına, bellekte) sonraki gezinmelere eklenir.
    ses.webRequest.onHeadersReceived({ urls: ["https://*/*"], types: ["mainFrame", "subFrame"] }, (details, callback) => {
      const h = details.responseHeaders || {};
      const key = Object.keys(h).find((k) => k.toLowerCase() === "accept-ch");
      if (key) {
        const origin = originOf(details.url);
        if (origin) {
          if (acceptCh.size > 500) acceptCh.clear();
          acceptCh.set(origin, identity.parseAcceptCh(h[key]));
        }
      }
      callback({});
    });
  }

  /* ------------------------------ webContents düzeyi ------------------------------ */

  // Komutlar BEKLEMEDEN art arda gönderilir: Chromium bunları gezinme işlenmeden önce sırayla
  // alır (await zinciri gezinmenin belgeyi işlemesinden sonraya kalıyordu — sınandı).
  function send(entry, kind) {
    const { wc } = entry;
    if (wc.isDestroyed() || !wc.debugger.isAttached()) return;
    const dbg = wc.debugger;
    const params = identity.cdpOverride(identityOf(kind), ACCEPT_LANGUAGE);
    dbg.sendCommand("Emulation.setUserAgentOverride", params).catch((e) => {
      // Eski motorlarda formFactors alanı yok: onsuz yeniden dene.
      if (!params.userAgentMetadata?.formFactors || wc.isDestroyed()) { log("[tarayıcı] kimlik", e?.message); return; }
      const { formFactors, ...md } = params.userAgentMetadata;
      dbg.sendCommand("Emulation.setUserAgentOverride", { ...params, userAgentMetadata: md }).catch((e2) => log("[tarayıcı] kimlik", e2?.message));
    });
  }

  // Firefox'ta navigator.userAgentData YOKTUR. Her sekmeye bir kez, sayfa betiklerinden önce
  // çalışan koşullu betik kaydedilir: yalnız kullanıcı aracısı Firefox iken (= Firefox kimliği,
  // yalnız Google giriş sayfası) userAgentData kaldırılır; Chrome kimliğinde hiçbir şey yapmaz.
  // Chromium kaydı ANCAK sonraki belgeden itibaren uygular (sınandı): kayıttan önceki belge
  // Firefox kimliğiyle açıldıysa bir kez yeniden yüklenir (bkz. did-navigate).
  function ensureShape(entry) {
    if (entry.shapeFrom) return;
    const dbg = entry.wc.debugger;
    const fail = (e) => log("[tarayıcı] kimlik betiği", e?.message);
    entry.shapeFrom = entry.navs + 1;
    dbg.sendCommand("Page.enable").catch(fail); // betik kaydı Page alanı açıkken işler
    dbg.sendCommand("Page.addScriptToEvaluateOnNewDocument", { source: FIREFOX_SHAPE }).catch(fail);
  }

  /**
   * Üst çerçeve gezinmesinin başında (did-start-navigation) gönderilir: Chromium geçersiz kılmayı
   * o gezinmenin isteğine ve yeni belgeye uygular (sınandı). Hiç gezinmemiş bir webContents'e
   * komut GÖNDERİLMEZ (hedef yok; söz hiç çözülmez) — ilk gezinme olayı bekler.
   */
  function apply(entry, url, { force = false } = {}) {
    const kind = kindFor(url, entry.profileId);
    if (!force && kind === entry.kind) return;
    entry.kind = kind;
    send(entry, kind);
  }

  function attachDebugger(entry) {
    const { wc } = entry;
    try {
      if (!wc.debugger.isAttached()) wc.debugger.attach("1.3");
      return true;
    } catch (e) {
      log("[tarayıcı] debugger", e?.message);
      return false;
    }
  }

  /** Sekme / açılır pencere webContents'ine kimlik uygular (ilk gezinmeden önce çağrılmalı). */
  function attach(wc, profileId, { onSignin } = {}) {
    if (!wc || wc.isDestroyed()) return false;
    if (attachedWcs.has(wc.id)) return true;
    const entry = { wc, profileId, kind: null, seen: new Set(), lastSignin: "", navs: 0, shapeFrom: 0, shapeReloaded: false };
    attachedWcs.set(wc.id, entry);
    if (attachDebugger(entry) && wc.getURL()) apply(entry, wc.getURL());

    wc.debugger.on("detach", (_e, reason) => {
      // Sekme kapanırken "target closed"; başka bir nedenle koparsa yeniden bağlan.
      if (wc.isDestroyed() || /target closed/i.test(String(reason || ""))) return;
      setTimeout(() => { if (!wc.isDestroyed() && attachDebugger(entry)) { entry.shapeFrom = 0; if (wc.getURL()) apply(entry, wc.getURL(), { force: true }); } }, 250);
    });
    wc.on("did-start-navigation", (details) => {
      // Her belge gezinmesinde yeniden gönderilir (süreç değişse de kimlik kesin kalır).
      if (!details?.isMainFrame || details.isSameDocument || !details.url) return;
      entry.navs += 1;
      apply(entry, details.url, { force: true });
      if (wc.debugger.isAttached()) ensureShape(entry);
    });
    wc.on("did-redirect-navigation", (details) => {
      if (details?.isMainFrame && details.url) apply(entry, details.url);
    });
    const check = (url, full) => {
      if (!identity.isGoogleSignIn(url)) { entry.seen.clear(); return; }
      if (identity.isRejectedUrl(url)) { rejected(entry, url); return; }
      if (full) entry.lastSignin = url;
      onSignin?.(url);
    };
    wc.on("did-navigate", (_e, url) => {
      if (entry.kind === "firefox" && entry.navs < entry.shapeFrom && !entry.shapeReloaded && /^https:/.test(url)) {
        entry.shapeReloaded = true;
        // ilk belge: Firefox biçimlendirme betiği henüz etkin değildi → belge hazır olunca bir kez yenile
        wc.once("dom-ready", () => { if (!wc.isDestroyed()) wc.reload(); });
        return;
      }
      check(url, true);
    });
    wc.on("did-navigate-in-page", (_e, url, isMainFrame) => { if (isMainFrame) check(url, false); setTimeout(() => readText(entry), 700); });
    wc.on("did-stop-loading", () => readText(entry));
    wc.once("destroyed", () => attachedWcs.delete(wc.id));
    return true;
  }

  async function readText(entry) {
    const { wc } = entry;
    if (wc.isDestroyed()) return;
    const url = wc.getURL();
    if (!identity.isGoogleSignIn(url) || identity.isRejectedUrl(url)) return;
    let text = "";
    try { text = await wc.executeJavaScriptInIsolatedWorld(isolatedWorld, [{ code: REJECT_TEXT_CODE }], false); } catch { return; }
    if (identity.isRejectedText(text)) rejected(entry, url);
  }

  function rejected(entry, url) {
    const key = `${entry.kind}|${url}`;
    if (entry.seen.has(key)) return;
    entry.seen.add(key);
    const kind = entry.kind || "chrome";
    const decision = identity.onRejected({ mode: mode(), identity: kind, autoTried: hasFallback(entry.profileId) });
    const retry = identity.retryUrl({ lastSignin: entry.lastSignin, rejected: url });
    if (decision.action === "fallback") {
      addFallback(entry.profileId);
      log("[tarayıcı] Google reddetti; bu profilde giriş sayfası Firefox kimliğiyle yeniden deneniyor.");
      retryIn(entry.wc, retry);
    }
    onRejection?.({ wc: entry.wc, profileId: entry.profileId, url, retry, kind, decision });
  }

  /** Adresi güncel kiple yeniden yükler (kimlik did-start-navigation'da kurulur). */
  function retryIn(wc, url) {
    const entry = attachedWcs.get(wc?.id);
    if (!entry || wc.isDestroyed()) return false;
    entry.seen.clear();
    wc.loadURL(url).catch(() => {});
    return true;
  }

  /** Kip değişti: canlı sayfaların kimliğini güncel adreslerine göre yenile. */
  function refreshAll() {
    for (const entry of attachedWcs.values()) if (!entry.wc.isDestroyed() && entry.wc.getURL()) apply(entry, entry.wc.getURL());
  }

  const lastSigninOf = (wc) => attachedWcs.get(wc?.id)?.lastSignin || "";

  return {
    setupSession, attach, retryIn, refreshAll, lastSigninOf,
    info: () => ({
      mode: identity.normalizeMode(mode()),
      chrome: ident.chrome.userAgent,
      firefox: ident.firefox.userAgent,
      brands: identity.brandHeader(ident.chrome.metadata.brands),
      platform: ident.chrome.metadata.platform,
      platformVersion: ident.chrome.metadata.platformVersion,
    }),
    _ident: ident,
  };
}

module.exports = { createCompat, ACCEPT_LANGUAGE };
