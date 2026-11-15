// Yayın Stüdyosu · Panorama kartları için ağ / sistem yardımcıları (ana süreç).
//
// Arayüzün içerik güvenliği politikası (connect-src) dış adreslere istek atmayı engeller; bu yüzden
// Panorama'nın şu kartları veriyi ana süreçten alır:
//   studio:panorama:weather  ({ city?, lat?, lon? }) → { ok, weather: { place, temp, feels, wind, humidity, code, days[] } }
//                            Open-Meteo (anahtarsız): şehir adı → konum (geocoding) → anlık + 5 gün.
//   studio:panorama:linkMeta (url) → { ok, title, text, image, site, author, url }  sosyal medya / haber bağlantısının
//                            Open Graph / Twitter kartı etiketleri (yalnız http/https; yerel ağ adresleri reddedilir;
//                            en çok 1,5 MB, 8 sn).
//   studio:panorama:fonts    () → { ok, fonts: [aile adı] }  sistem yazı tipleri (Mac: yazı tipi klasörleri,
//                            Windows: kayıt defteri, Linux: fc-list). Arayüz tuvalde ölçerek yüklü olanları süzer.
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");

const TIMEOUT = 8000;
const MAX_HTML = 1_500_000;
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) ElitligStudio/2 Safari/605.1.15";

const signal = (ms = TIMEOUT) => (typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(ms) : undefined);
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);

/** Yerel / özel ağ adresi mi (bağlantı önizlemesi iç ağa istek atmasın). */
function privateHost(host) {
  const h = String(host || "").toLowerCase().replace(/^\[|\]$/g, "");
  if (!h || h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || h === "0.0.0.0" || h === "::1") return true;
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(h);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    return a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a === 0;
  }
  return /^(fc|fd|fe80)/.test(h);
}

const decode = (s) => String(s || "").replace(/&(#x?[0-9a-f]+|amp|lt|gt|quot|apos|#39);/gi, (_, e) => {
  const k = e.toLowerCase();
  if (k === "amp") return "&"; if (k === "lt") return "<"; if (k === "gt") return ">"; if (k === "quot") return "\""; if (k === "apos" || k === "#39") return "'";
  const n = k.startsWith("#x") ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10);
  return Number.isFinite(n) ? String.fromCodePoint(n) : "";
}).replace(/\s+/g, " ").trim();

/** HTML'den Open Graph / Twitter / <title> etiketleri (saf; sınanır). */
function parseMeta(html, baseUrl) {
  const metas = {};
  const re = /<meta\s+[^>]*>/gi;
  let m;
  while ((m = re.exec(html))) {
    const tag = m[0];
    const key = (/(?:property|name)\s*=\s*["']([^"']+)["']/i.exec(tag) || [])[1];
    const val = (/content\s*=\s*["']([^"']*)["']/i.exec(tag) || [])[1];
    if (key && val != null && !(key.toLowerCase() in metas)) metas[key.toLowerCase()] = decode(val);
  }
  const title = metas["og:title"] || metas["twitter:title"] || decode((/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html) || [])[1]);
  let image = metas["og:image"] || metas["og:image:url"] || metas["twitter:image"] || metas["twitter:image:src"] || "";
  try { if (image) image = new URL(image, baseUrl).toString(); } catch { image = ""; }
  let site = metas["og:site_name"] || "";
  try { if (!site) site = new URL(baseUrl).hostname.replace(/^www\./, ""); } catch { /* yoksay */ }
  return {
    title: String(title || "").slice(0, 300),
    text: String(metas["og:description"] || metas["twitter:description"] || metas.description || "").slice(0, 600),
    image: /^https?:\/\//i.test(image) ? image.slice(0, 1000) : "",
    site: String(site).slice(0, 60),
    author: String(metas.author || metas["article:author"] || metas["twitter:creator"] || "").slice(0, 80),
  };
}

function createPanoramaNet({ fetchImpl = globalThis.fetch, platform = process.platform, homedir = os.homedir(), run = execFile } = {}) {
  async function getJson(url) {
    const res = await fetchImpl(url, { signal: signal(), headers: { Accept: "application/json", "User-Agent": "ElitligStudio/2" } });
    if (!res?.ok) throw new Error(`HTTP ${res?.status || 0}`);
    return res.json();
  }

  async function weather(q = {}) {
    if (typeof fetchImpl !== "function") return { ok: false, error: "Ağ yok." };
    try {
      let lat = num(q.lat); let lon = num(q.lon); let place = String(q.city || "").trim().slice(0, 80);
      if (lat == null || lon == null) {
        if (!place) return { ok: false, error: "Şehir adı gir." };
        const g = await getJson(`https://geocoding-api.open-meteo.com/v1/search?count=1&language=tr&format=json&name=${encodeURIComponent(place)}`);
        const hit = g?.results?.[0];
        if (!hit) return { ok: false, error: `“${place}” bulunamadı.` };
        lat = hit.latitude; lon = hit.longitude; place = hit.name || place;
      }
      const f = await getJson(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min&forecast_days=5&timezone=Europe%2FIstanbul`);
      const c = f?.current || {};
      const d = f?.daily || {};
      const days = (d.time || []).slice(0, 5).map((date, i) => ({ date, code: num(d.weather_code?.[i]), max: num(d.temperature_2m_max?.[i]), min: num(d.temperature_2m_min?.[i]) }));
      return { ok: true, weather: { place, lat, lon, temp: num(c.temperature_2m), feels: num(c.apparent_temperature), humidity: num(c.relative_humidity_2m), wind: num(c.wind_speed_10m), code: num(c.weather_code), days, at: Date.now() } };
    } catch (e) {
      return { ok: false, error: e?.name === "TimeoutError" ? "Hava durumu zaman aşımı." : e?.message || "Hava durumu alınamadı." };
    }
  }

  async function linkMeta(raw) {
    let u;
    try { u = new URL(String(raw || "").trim()); } catch { return { ok: false, error: "Geçerli bir bağlantı gir (https://…)." }; }
    if (!/^https?:$/.test(u.protocol)) return { ok: false, error: "Yalnız http / https bağlantıları." };
    if (privateHost(u.hostname)) return { ok: false, error: "Yerel ağ adresleri desteklenmez." };
    if (typeof fetchImpl !== "function") return { ok: false, error: "Ağ yok." };
    try {
      const res = await fetchImpl(u.toString(), { signal: signal(), redirect: "follow", headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml", "Accept-Language": "tr,en;q=0.8" } });
      if (!res?.ok) return { ok: false, error: `Sayfa açılamadı (HTTP ${res?.status || 0}).` };
      let html = "";
      if (res.body?.getReader) {
        const reader = res.body.getReader();
        const dec = new TextDecoder("utf-8");
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          html += dec.decode(value, { stream: true });
          if (html.length > MAX_HTML || /<\/head>/i.test(html)) { try { await reader.cancel(); } catch { /* yoksay */ } break; }
        }
      } else html = String(await res.text()).slice(0, MAX_HTML);
      const meta = parseMeta(html, res.url || u.toString());
      if (!meta.title && !meta.image && !meta.text) return { ok: false, error: "Sayfada önizleme bilgisi yok (başlığı elle yaz)." };
      return { ok: true, url: res.url || u.toString(), ...meta };
    } catch (e) {
      return { ok: false, error: e?.name === "TimeoutError" ? "Sayfa zaman aşımına uğradı." : e?.message || "Sayfa okunamadı." };
    }
  }

  const exec = (cmd, args) => new Promise((resolve) => { try { run(cmd, args, { timeout: 6000, maxBuffer: 8 * 1024 * 1024 }, (err, out) => resolve(err ? "" : String(out || ""))); } catch { resolve(""); } });
  /** Dosya adından aile adı: "HelveticaNeue-Bold.ttf" → "Helvetica Neue". */
  const familyOfFile = (f) => path.basename(f).replace(/\.(ttf|otf|ttc|dfont|woff2?)$/i, "").replace(/[-_](Regular|Bold|Italic|Light|Medium|Black|Heavy|Thin|Semibold|SemiBold|Condensed|Oblique|Book|Roman|It|BoldItalic|UltraLight)+$/i, "").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[-_]+/g, " ").trim();

  let cache = null;
  async function fonts() {
    if (cache) return cache;
    const set = new Set();
    try {
      if (platform === "linux") {
        for (const line of (await exec("fc-list", [":", "family"])).split("\n")) for (const f of line.split(",")) if (f.trim()) set.add(f.trim());
      } else if (platform === "win32") {
        for (const hive of ["HKLM", "HKCU"]) {
          const out = await exec("reg", ["query", `${hive}\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts`]);
          for (const line of out.split(/\r?\n/)) { const m = /^\s+(.+?)\s+\((TrueType|OpenType)\)\s+REG_SZ/i.exec(line); if (m) set.add(m[1].replace(/\s+(Bold|Italic|Light|Semibold|Black|Regular)(\s+(Bold|Italic))?$/i, "").split(" & ")[0].trim()); }
        }
      } else {
        for (const dir of ["/System/Library/Fonts", "/System/Library/Fonts/Supplemental", "/Library/Fonts", path.join(homedir, "Library/Fonts")]) {
          let list = [];
          try { list = fs.readdirSync(dir); } catch { list = []; }
          for (const f of list) if (/\.(ttf|otf|ttc|dfont)$/i.test(f)) set.add(familyOfFile(f));
        }
      }
    } catch { /* yoksay */ }
    const out = [...set].filter((f) => f && f.length < 60 && !/^\./.test(f)).sort((a, b) => a.localeCompare(b, "tr")).slice(0, 600);
    cache = { ok: true, fonts: out, platform };
    return cache;
  }

  function register(ipcMain) {
    if (!ipcMain) return;
    ipcMain.handle("studio:panorama:weather", (_e, q) => weather(q && typeof q === "object" ? q : {}));
    ipcMain.handle("studio:panorama:linkMeta", (_e, url) => linkMeta(url));
    ipcMain.handle("studio:panorama:fonts", () => fonts());
  }

  return { weather, linkMeta, fonts, register };
}

module.exports = { createPanoramaNet, parseMeta, privateHost };
