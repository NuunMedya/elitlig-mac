// Yayın Stüdyosu — "Bağlantı testi" (OBS'in otomatik yapılandırmasındaki bant genişliği testi gibi).
//
// Neden YouTube'a deneme yayını değil: YouTube'un (Twitch'teki ?bandwidthtest gibi) yayına
// çıkmayan bir test anahtarı yok; kullanıcının anahtarıyla veri basmak yayını başlatabilir.
// Bunun yerine:
//   1. Gecikme: YouTube giriş sunucusuna (a.rtmp.youtube.com:1935) 3 kez TCP bağlantısı
//      kurulup hemen kapatılır (veri gönderilmez) → bağlantı kurma süresi ≈ RTT.
//   2. Yükleme: TEK TCP bağlantısı üzerinde (RTMP de tek bağlantıdır) artan boyutlu HTTP POST'lar
//      Cloudflare'in herkese açık hız testi uç noktasına (speed.cloudflare.com/__up — kendi hız
//      testi sayfasının kullandığı uç nokta; adres değiştirilebilir). Bağlantı açık tutulur
//      (ısınmış tıkanıklık penceresi); her istek yanıtı gelene dek ölçülür, ≥ 1 MB'lık isteklerin
//      %90'lık dilimi alınır (Cloudflare'in kendi hesabı gibi). Varsayılan en çok ~10 sn / ~60 MB.
// Electron'a bağlı değildir; istek / bağlantı fabrikası dışarıdan verilebilir (testler).
"use strict";

const https = require("node:https");
const http = require("node:http");
const net = require("node:net");
const crypto = require("node:crypto");

const DEFAULT_ENDPOINT = "https://speed.cloudflare.com/__up";
const DEFAULT_SIZES = [256 * 1024, 1024 * 1024, 2 * 1024 * 1024, 4 * 1024 * 1024, 8 * 1024 * 1024, 8 * 1024 * 1024, 16 * 1024 * 1024, 16 * 1024 * 1024];

const percentile = (values, p) => {
  if (!values.length) return null;
  const v = [...values].sort((a, b) => a - b);
  const i = Math.min(v.length - 1, Math.max(0, Math.ceil((p / 100) * v.length) - 1));
  return v[i];
};

/** host:port'a TCP bağlantı kurma süresi (ms); bağlanamazsa null. */
function connectTime({ host, port, timeoutMs = 4000, connectImpl = net.connect, now = () => performance.now() }) {
  return new Promise((resolve) => {
    const t0 = now();
    let done = false;
    const sock = connectImpl({ host, port });
    const finish = (v) => { if (done) return; done = true; clearTimeout(timer); try { sock.destroy(); } catch { /* yoksay */ } resolve(v); };
    const timer = setTimeout(() => finish(null), timeoutMs);
    sock.once("connect", () => finish(Math.round(now() - t0)));
    sock.once("error", () => finish(null));
  });
}

/** Tek POST: gövde bytes uzunluğunda; yanıt bitene dek süre (ms). */
function postOnce({ url, bytes, agent, block, timeoutMs, now }) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === "http:" ? http : https;
    const t0 = now();
    const req = lib.request({
      method: "POST", hostname: u.hostname, port: u.port || undefined, path: `${u.pathname}${u.search}`, agent,
      headers: { "content-type": "application/octet-stream", "content-length": String(bytes) },
    }, (res) => {
      res.on("data", () => {});
      res.on("end", () => {
        if (res.statusCode >= 400) { reject(Object.assign(new Error(`HTTP ${res.statusCode}`), { code: "HTTP" })); return; }
        resolve({ ms: now() - t0 });
      });
      res.on("error", reject);
    });
    const timer = setTimeout(() => { req.destroy(Object.assign(new Error("zaman aşımı"), { code: "TIMEOUT" })); }, timeoutMs);
    req.on("error", (e) => { clearTimeout(timer); reject(e); });
    req.on("close", () => clearTimeout(timer));
    let sent = 0;
    const pump = () => {
      while (sent < bytes) {
        const n = Math.min(block.length, bytes - sent);
        sent += n;
        if (!req.write(n === block.length ? block : block.subarray(0, n))) { req.once("drain", pump); return; }
      }
      req.end();
    };
    pump();
  });
}

/**
 * Bağlantı testi. → { ok, uploadKbps, samples: [{ bytes, ms, kbps }], rttMs, ingest, endpoint, error? }
 * uploadKbps: tek bağlantının sürdürülebilir yükleme hızı (≥ 1 MB isteklerin %90'lık dilimi).
 */
async function runUplinkTest({
  endpoint = DEFAULT_ENDPOINT,
  ingestHost = "a.rtmp.youtube.com",
  ingestPort = 1935,
  sizes = DEFAULT_SIZES,
  maxMs = 10000,
  requestTimeoutMs = 15000,
  minSampleBytes = 1024 * 1024,
  connectImpl = net.connect,
  now = () => performance.now(),
  onProgress = () => {},
} = {}) {
  const result = { ok: false, uploadKbps: null, samples: [], rttMs: null, ingest: ingestHost ? `${ingestHost}:${ingestPort}` : null, endpoint };
  if (ingestHost) {
    const times = [];
    for (let i = 0; i < 3; i += 1) {
      const t = await connectTime({ host: ingestHost, port: ingestPort, connectImpl, now });
      if (t !== null) times.push(t);
    }
    result.rttMs = times.length ? percentile(times, 50) : null;
    result.ingestReachable = times.length > 0;
  }
  const u = (() => { try { return new URL(endpoint); } catch { return null; } })();
  if (!u || !/^https?:$/.test(u.protocol)) return { ...result, error: { code: "BAD_ENDPOINT", message: "Test adresi geçersiz." } };
  const agent = new (u.protocol === "http:" ? http : https).Agent({ keepAlive: true, maxSockets: 1 });
  const block = crypto.randomBytes(1024 * 1024); // sıkıştırılamaz
  const t0 = now();
  try {
    for (const bytes of sizes) {
      if (now() - t0 > maxMs) break;
      const { ms } = await postOnce({ url: endpoint, bytes, agent, block, timeoutMs: requestTimeoutMs, now });
      const kbps = Math.round((bytes * 8) / Math.max(1, ms));
      result.samples.push({ bytes, ms: Math.round(ms), kbps });
      onProgress({ bytes, ms, kbps, elapsedMs: now() - t0 });
    }
  } catch (e) {
    if (!result.samples.some((s) => s.bytes >= minSampleBytes)) {
      agent.destroy();
      return { ...result, error: { code: e.code || "NETWORK", message: `Yükleme testi yapılamadı (${e.message}).` } };
    }
  }
  agent.destroy();
  const big = result.samples.filter((s) => s.bytes >= minSampleBytes).map((s) => s.kbps);
  result.uploadKbps = percentile(big.length ? big : result.samples.map((s) => s.kbps), 90);
  result.ok = result.uploadKbps !== null;
  return result;
}

module.exports = { runUplinkTest, connectTime, percentile, DEFAULT_ENDPOINT };
