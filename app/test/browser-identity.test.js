// Tarayıcı kimliği (app/browser/identity.js): Chrome UA + istemci ipuçları, Firefox kipi,
// başlık yeniden yazımı, Google reddi algılama.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const id = require("../browser/identity");
const model = require("../browser/model");

test("GREASE marka listesi Chromium algoritmasıyla (bilinen Chrome sürümleri)", () => {
  // Gerçek Chrome başlıkları: 120 → "Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"
  assert.equal(id.brandHeader(id.brandList("120.0.6099.109")), '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"');
  // 131 → "Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"
  assert.equal(id.brandHeader(id.brandList("131.0.6778.86")), '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"');
  // 108 → "Not?A_Brand";v="8"
  assert.ok(id.brandHeader(id.brandList("108.0.5359.125")).includes('"Not?A_Brand";v="8"'));
  // Uygulamanın motoru (152): üç marka, Google Chrome dahil, tam sürüm listesi tutarlı
  const full = id.brandList("152.0.7977.167", { full: true });
  assert.deepEqual(full.map((b) => b.brand).sort(), ["Chromium", "Google Chrome", "Not?A_Brand"]);
  assert.equal(full.find((b) => b.brand === "Google Chrome").version, "152.0.7977.167");
  assert.equal(full.find((b) => b.brand === "Not?A_Brand").version, "24.0.0.0");
  assert.deepEqual(id.brandList("152.0.7977.167").map((b) => b.brand), full.map((b) => b.brand), "kısa ve tam liste aynı sırada");
});

test("Chrome UA: gerçek motor ana sürümü, platforma göre, Electron/uygulama imi yok", () => {
  const v = "152.0.7977.167";
  assert.equal(id.chromeUserAgent({ platform: "darwin", chromeVersion: v }), "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36");
  assert.equal(id.chromeUserAgent({ platform: "win32", chromeVersion: v }), "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36");
  assert.equal(id.chromeUserAgent({ platform: "linux", chromeVersion: v }), "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36");
  assert.match(id.chromeUserAgent({ platform: "darwin", chromeVersion: "160.1.2.3" }), /Chrome\/160\.0\.0\.0 /);
  assert.throws(() => id.chromeUserAgent({ chromeVersion: "" }));
  // Varsayılan: bu sürecin motoru
  const ident = id.buildIdentity({ chromeVersion: v, platform: "darwin", arch: "arm64", platformVersion: "15.1.0" });
  assert.doesNotMatch(ident.chrome.userAgent, /Electron|Elitlig/i);
});

test("istemci ipucu meta verisi platforma göre ve UA ile tutarlı", () => {
  const mac = id.chromeMetadata({ platform: "darwin", chromeVersion: "152.0.7977.167", arch: "arm64", platformVersion: "15.1.0" });
  assert.equal(mac.platform, "macOS");
  assert.equal(mac.architecture, "arm");
  assert.equal(mac.bitness, "64");
  assert.equal(mac.mobile, false);
  assert.equal(mac.fullVersion, "152.0.7977.167");
  assert.ok(mac.brands.some((b) => b.brand === "Google Chrome" && b.version === "152"));
  const win = id.chromeMetadata({ platform: "win32", chromeVersion: "152.0.7977.167", arch: "x64", platformVersion: "10.0.0" });
  assert.equal(win.platform, "Windows");
  assert.equal(win.architecture, "x86");
  assert.equal(id.chromeMetadata({ platform: "linux", chromeVersion: "152.0.1.2", arch: "x64", platformVersion: "6.8.0" }).platform, "Linux");
  assert.equal(id.platformVersionOf({ platform: "darwin", systemVersion: "14.6" }), "14.6.0");
  assert.equal(id.platformVersionOf({ platform: "win32", release: "10.0.22631" }), "15.0.0");
  assert.equal(id.platformVersionOf({ platform: "win32", release: "10.0.19045" }), "10.0.0");
  assert.equal(id.platformVersionOf({ platform: "linux", release: "6.18.44-fc-v378" }), "6.18.44");
});

test("Firefox UA: tarihe göre güncel sürüm, platforma göre biçim", () => {
  assert.equal(id.firefoxVersion(new Date(Date.UTC(2024, 10, 26))), 133);
  assert.equal(id.firefoxVersion(new Date(Date.UTC(2025, 0, 7))), 134);
  assert.ok(id.firefoxVersion(new Date(Date.UTC(2026, 10, 11))) >= 155);
  const d = new Date(Date.UTC(2026, 10, 11));
  const v = id.firefoxVersion(d);
  assert.equal(id.firefoxUserAgent({ platform: "darwin", date: d }), `Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:${v}.0) Gecko/20100101 Firefox/${v}.0`);
  assert.equal(id.firefoxUserAgent({ platform: "win32", date: d }), `Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:${v}.0) Gecko/20100101 Firefox/${v}.0`);
  assert.match(id.firefoxUserAgent({ platform: "linux", date: d }), /^Mozilla\/5\.0 \(X11; Linux x86_64; rv:\d+\.0\) Gecko\/20100101 Firefox\/\d+\.0$/);
});

test("kip seçimi: Firefox yalnız Google giriş sayfasında; Otomatik ret sonrası", () => {
  const G = "https://accounts.google.com/v3/signin/identifier?continue=x";
  for (const mode of ["auto", "chrome", "firefox", "bozuk"]) assert.equal(id.identityFor("https://www.youtube.com/", { mode, fallback: true }), "chrome", mode);
  assert.equal(id.identityFor("https://mail.google.com/", { mode: "firefox" }), "chrome");
  assert.equal(id.identityFor(G, { mode: "firefox" }), "firefox");
  assert.equal(id.identityFor(G, { mode: "chrome", fallback: true }), "chrome");
  assert.equal(id.identityFor(G, { mode: "auto", fallback: false }), "chrome");
  assert.equal(id.identityFor(G, { mode: "auto", fallback: true }), "firefox");
  assert.equal(id.identityFor("https://accounts.google.com.evil.com/", { mode: "firefox" }), "chrome");
  assert.equal(id.normalizeMode("x"), "auto");

  // Ret kararları
  assert.deepEqual(id.onRejected({ mode: "auto", identity: "chrome", autoTried: false }), { action: "fallback" });
  assert.deepEqual(id.onRejected({ mode: "auto", identity: "firefox", autoTried: true }), { action: "banner", next: "chrome" });
  assert.deepEqual(id.onRejected({ mode: "chrome", identity: "chrome" }), { action: "banner", next: "firefox" });
  assert.deepEqual(id.onRejected({ mode: "firefox", identity: "firefox" }), { action: "banner", next: "chrome" });
});

test("başlıklar: Chrome kimliği Sec-CH-UA'yı uydurur, Firefox kimliği siler", () => {
  const ident = id.buildIdentity({ chromeVersion: "152.0.7977.167", platform: "darwin", arch: "arm64", platformVersion: "15.1.0", date: new Date(Date.UTC(2026, 10, 11)) });
  const raw = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) elitlig-araclar/2.29.0 Chrome/152.0.7977.167 Electron/44.0.0 Safari/537.36",
    "sec-ch-ua": '"Chromium";v="152", "Not?A_Brand";v="24"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Linux"',
    "Sec-CH-UA-Full-Version-List": '"Chromium";v="152.0.7977.167"',
    "sec-ch-ua-arch": '"x86"',
    Accept: "text/html",
    Cookie: "a=1",
  };
  const c = id.rewriteHeaders(raw, ident.chrome);
  assert.equal(c["User-Agent"], ident.chrome.userAgent);
  assert.equal(Object.keys(c).filter((k) => /^user-agent$/i.test(k)).length, 1);
  assert.equal(c["sec-ch-ua"], '"Chromium";v="152", "Not?A_Brand";v="24", "Google Chrome";v="152"');
  assert.equal(c["sec-ch-ua-platform"], '"macOS"');
  assert.equal(c["sec-ch-ua-arch"], '"arm"');
  assert.match(c["Sec-CH-UA-Full-Version-List"], /"Google Chrome";v="152\.0\.7977\.167"/);
  assert.equal(c.Accept, "text/html");
  assert.equal(c.Cookie, "a=1");
  assert.ok(!("sec-ch-ua-platform-version" in c), "istenmeyen yüksek entropili ipucu eklenmez");
  assert.equal(raw["sec-ch-ua-platform"], '"Linux"', "girdi değişmez");

  const f = id.rewriteHeaders(raw, ident.firefox);
  assert.match(f["User-Agent"], /Firefox\/\d+\.0$/);
  assert.deepEqual(Object.keys(f).filter((k) => /^sec-ch-ua/i.test(k)), []);
  assert.equal(f.Cookie, "a=1");

  // CDP parametreleri
  assert.deepEqual(Object.keys(id.cdpOverride(ident.chrome, "tr-TR")).sort(), ["acceptLanguage", "userAgent", "userAgentMetadata"]);
  assert.equal(id.cdpOverride(ident.firefox).userAgentMetadata, undefined);
});

test("Google reddi: adres ve metin algılama, yeniden deneme adresi", () => {
  assert.equal(id.isRejectedUrl("https://accounts.google.com/v3/signin/rejected?continue=https%3A%2F%2Fmail.google.com&rrk=46"), true);
  assert.equal(id.isRejectedUrl("https://accounts.google.com/signin/rejected?rrk=46"), true);
  assert.equal(id.isRejectedUrl("https://accounts.google.com/v3/signin/identifier?continue=x"), false);
  assert.equal(id.isRejectedUrl("https://example.com/v3/signin/rejected"), false);
  assert.equal(id.isRejectedText("Couldn't sign you in\nThis browser or app may not be secure. Learn more"), true);
  assert.equal(id.isRejectedText("Oturum açılamadı Bu tarayıcı veya uygulama güvenli olmayabilir."), true);
  assert.equal(id.isRejectedText("Sign in to continue to Gmail"), false);
  assert.equal(id.retryUrl({ lastSignin: "https://accounts.google.com/v3/signin/identifier?flowName=x" }), "https://accounts.google.com/v3/signin/identifier?flowName=x");
  assert.equal(id.retryUrl({ rejected: "https://accounts.google.com/v3/signin/rejected?continue=https%3A%2F%2Fmail.google.com%2F" }), "https://accounts.google.com/ServiceLogin?continue=https%3A%2F%2Fmail.google.com%2F");
  assert.equal(id.retryUrl({ rejected: "https://accounts.google.com/v3/signin/rejected?continue=javascript%3Aalert(1)" }), "https://accounts.google.com/");
});

test("ayarlar: uyumluluk modu doğrulanır, öğrenilen profiller yalnız var olanlar", () => {
  const st = model.normalizeState({ profiles: [{ id: "kisisel" }, { id: "is" }], settings: { googleCompat: "firefox", googleFallback: ["is", "yok", "private", "is"] } });
  assert.equal(st.settings.googleCompat, "firefox");
  assert.deepEqual(st.settings.googleFallback, ["is"]);
  assert.equal(model.normalizeState({ settings: { googleCompat: "safari" } }).settings.googleCompat, "auto");
  assert.equal(model.defaultState().settings.googleCompat, "auto");
});

test("gezinme istekleri: düşük entropili ipuçları + Accept-CH ile istenenler eklenir", () => {
  const ident = id.buildIdentity({ chromeVersion: "152.0.7977.167", platform: "win32", arch: "x64", platformVersion: "10.0.0" });
  const req = id.parseAcceptCh(["Sec-CH-UA-Full-Version-List, Sec-CH-UA-Platform-Version", "DPR, Sec-CH-UA-Arch"]);
  assert.deepEqual(req, ["sec-ch-ua-full-version-list", "sec-ch-ua-platform-version", "sec-ch-ua-arch"]);
  const h = id.addNavigationHints({ "User-Agent": ident.chrome.userAgent }, ident.chrome, "https://accounts.google.com/", req);
  assert.equal(h["sec-ch-ua"], id.brandHeader(ident.chrome.metadata.brands));
  assert.equal(h["sec-ch-ua-mobile"], "?0");
  assert.equal(h["sec-ch-ua-platform"], '"Windows"');
  assert.equal(h["sec-ch-ua-platform-version"], '"10.0.0"');
  assert.equal(h["sec-ch-ua-arch"], '"x86"');
  assert.match(h["sec-ch-ua-full-version-list"], /"Google Chrome";v="152\.0\.7977\.167"/);
  // Var olan değiştirilmez, tekrarlanmaz (büyük/küçük harf)
  const h2 = id.addNavigationHints({ "Sec-CH-UA": "x" }, ident.chrome, "https://a.com/");
  assert.equal(h2["Sec-CH-UA"], "x");
  assert.ok(!("sec-ch-ua" in h2));
  // Güvensiz köken ve Firefox kimliği: eklenmez
  assert.deepEqual(id.addNavigationHints({}, ident.chrome, "http://example.com/"), {});
  assert.deepEqual(id.addNavigationHints({}, ident.firefox, "https://accounts.google.com/"), {});
  assert.ok(id.secureUrl("http://127.0.0.1:8080/"));
});
