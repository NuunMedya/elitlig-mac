// Araç Takımı → Ağ ve Sistem: IP bilgisi, bağlantı gecikmesi ("ping", TCP ile — ICMP yönetici
// izni ister), DNS sorgusu, bağlantı hızı testi (Cloudflare'in herkese açık hız testi uç
// noktaları) ve sistem bilgisi. Saf Node; Electron'a yalnız register() bağlanır.
//
// IPC: nettools:info · nettools:ping · nettools:dns · nettools:speed · nettools:system
"use strict";

const os = require("node:os");
const fs = require("node:fs");
const dns = require("node:dns");
const https = require("node:https");
const { connectTime, percentile, runUplinkTest } = require("./studio/speedtest");

const HOST_RE = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$|^\d{1,3}(\.\d{1,3}){3}$|^[0-9a-f:]+$/i;
const DNS_TYPES = ["A", "AAAA", "MX", "TXT", "NS", "CNAME", "SOA", "CAA", "SRV", "PTR"];

/** "https://elitlig.com/x" → "elitlig.com"; geçersizse null. */
function cleanHost(input) {
  let h = String(input || "").trim();
  if (!h) return null;
  try { if (/^[a-z]+:\/\//i.test(h)) h = new URL(h).hostname; } catch { return null; }
  h = h.replace(/\/.*$/, "").replace(/^\[|\]$/g, "").toLowerCase();
  return HOST_RE.test(h) ? h : null;
}

function interfaces() {
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const a of list || []) if (!a.internal) out.push({ name, family: a.family === 4 ? "IPv4" : a.family === 6 ? "IPv6" : a.family, address: a.address, mac: a.mac, cidr: a.cidr });
  }
  return out.sort((a, b) => (a.family === b.family ? 0 : a.family === "IPv4" ? -1 : 1));
}

function getText(url, { timeoutMs = 6000 } = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: timeoutMs, headers: { "user-agent": "ElitligAraclar" } }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (c) => { body += c; if (body.length > 65536) req.destroy(); });
      res.on("end", () => (res.statusCode >= 400 ? reject(new Error(`HTTP ${res.statusCode}`)) : resolve(body)));
    });
    req.on("timeout", () => req.destroy(new Error("Zaman aşımı")));
    req.on("error", reject);
  });
}

/** Cloudflare trace: "ip=…\nloc=TR\ncolo=IST" → nesne. */
function parseTrace(text) {
  return Object.fromEntries(String(text || "").split("\n").map((l) => l.split("=")).filter((p) => p.length >= 2).map(([k, ...v]) => [k.trim(), v.join("=").trim()]));
}

async function info({ fetchText = getText } = {}) {
  const res = { ok: true, hostname: os.hostname(), interfaces: interfaces(), public: null, error: null };
  try {
    const t = parseTrace(await fetchText("https://www.cloudflare.com/cdn-cgi/trace"));
    res.public = { ip: t.ip || null, country: t.loc || null, colo: t.colo || null, warp: t.warp || null, http: t.http || null, tls: t.tls || null };
  } catch (e) {
    res.error = { code: "PUBLIC_IP", message: `Genel IP alınamadı (${e.message}). İnternet bağlantısını kontrol edin.` };
  }
  return res;
}

/** TCP ile gecikme: count kez bağlan-kapat. DNS çözümleme süresi ayrıca ölçülür. */
async function ping(input, { count = 5, port = 443, timeoutMs = 4000, connectImpl, lookup = dns.promises.lookup, now = () => performance.now() } = {}) {
  const host = cleanHost(input);
  if (!host) return { ok: false, error: { code: "BAD_HOST", message: "Geçerli bir alan adı ya da IP girin (ör. elitlig.com)." } };
  const n = Math.max(1, Math.min(20, Number(count) || 5));
  const p = Math.max(1, Math.min(65535, Number(port) || 443));
  let address = host;
  let dnsMs = null;
  try {
    const t0 = now();
    const r = await lookup(host);
    dnsMs = Math.round(now() - t0);
    address = r.address;
  } catch (e) {
    return { ok: false, host, error: { code: "DNS", message: `Ad çözümlenemedi: ${e.code || e.message}` } };
  }
  const samples = [];
  for (let i = 0; i < n; i += 1) samples.push(await connectTime({ host: address, port: p, timeoutMs, ...(connectImpl ? { connectImpl } : {}), now }));
  const okTimes = samples.filter((x) => x != null);
  const avg = okTimes.length ? Math.round(okTimes.reduce((a, b) => a + b, 0) / okTimes.length) : null;
  const jitter = okTimes.length > 1 ? Math.round(okTimes.slice(1).reduce((s, x, i) => s + Math.abs(x - okTimes[i]), 0) / (okTimes.length - 1)) : 0;
  return {
    ok: okTimes.length > 0, host, address, port: p, dnsMs, samples,
    min: okTimes.length ? Math.min(...okTimes) : null, max: okTimes.length ? Math.max(...okTimes) : null, avg, median: percentile(okTimes, 50), jitter,
    loss: Math.round(((n - okTimes.length) / n) * 100),
    error: okTimes.length ? null : { code: "UNREACHABLE", message: `${host}:${p} bağlantı kabul etmedi (zaman aşımı ya da kapalı port).` },
  };
}

const RESOLVERS = { system: null, cloudflare: ["1.1.1.1", "1.0.0.1"], google: ["8.8.8.8", "8.8.4.4"], quad9: ["9.9.9.9"] };

async function dnsQuery(input, type = "A", { resolver = "system" } = {}) {
  const host = cleanHost(input);
  const t = String(type || "A").toUpperCase();
  if (!host) return { ok: false, error: { code: "BAD_HOST", message: "Geçerli bir alan adı girin." } };
  if (!DNS_TYPES.includes(t)) return { ok: false, error: { code: "BAD_TYPE", message: "Desteklenmeyen kayıt türü." } };
  const r = new dns.promises.Resolver({ timeout: 4000, tries: 2 });
  if (RESOLVERS[resolver]) r.setServers(RESOLVERS[resolver]);
  const t0 = performance.now();
  try {
    let records;
    if (t === "PTR") records = await r.reverse(host);
    else records = await r.resolve(host, t);
    const list = (Array.isArray(records) ? records : [records]).map((x) => (typeof x === "string" ? x : Array.isArray(x) ? x.join("") : x));
    return { ok: true, host, type: t, resolver, ms: Math.round(performance.now() - t0), records: list };
  } catch (e) {
    const msg = e.code === "ENODATA" ? "Bu türde kayıt yok." : e.code === "ENOTFOUND" ? "Alan adı bulunamadı." : e.code === "ETIMEOUT" ? "DNS sunucusu yanıt vermedi." : e.message;
    return { ok: false, host, type: t, resolver, ms: Math.round(performance.now() - t0), records: [], error: { code: e.code || "DNS", message: msg } };
  }
}

/** İndirme ölçümü: artan boyutlarda GET; en çok maxMs. */
async function downloadTest({ base = "https://speed.cloudflare.com/__down?bytes=", sizes = [1e5, 1e6, 5e6, 10e6, 25e6, 25e6], maxMs = 10000, now = () => performance.now(), onProgress = () => {} } = {}) {
  const agent = new https.Agent({ keepAlive: true, maxSockets: 1 });
  const samples = [];
  const t0 = now();
  try {
    for (const bytes of sizes) {
      if (now() - t0 > maxMs) break;
      const ms = await new Promise((resolve, reject) => {
        const s = now();
        let got = 0;
        const req = https.get(`${base}${bytes}`, { agent, timeout: 15000 }, (res) => {
          if (res.statusCode >= 400) { res.resume(); reject(new Error(`HTTP ${res.statusCode}`)); return; }
          res.on("data", (c) => { got += c.length; });
          res.on("end", () => resolve({ ms: now() - s, got }));
          res.on("error", reject);
        });
        req.on("timeout", () => req.destroy(new Error("Zaman aşımı")));
        req.on("error", reject);
      });
      const kbps = Math.round((ms.got * 8) / Math.max(1, ms.ms));
      samples.push({ bytes: ms.got, ms: Math.round(ms.ms), kbps });
      onProgress({ phase: "download", kbps });
    }
  } catch (e) {
    if (!samples.length) { agent.destroy(); return { ok: false, error: { code: "NETWORK", message: `İndirme testi yapılamadı (${e.message}).` }, samples }; }
  }
  agent.destroy();
  const big = samples.filter((s) => s.bytes >= 1e6).map((s) => s.kbps);
  return { ok: true, downloadKbps: percentile(big.length ? big : samples.map((s) => s.kbps), 90), samples };
}

async function speed({ onProgress = () => {} } = {}) {
  const latency = await ping("speed.cloudflare.com", { count: 5 });
  const down = await downloadTest({ onProgress });
  const up = await runUplinkTest({ ingestHost: null, maxMs: 8000, sizes: [256 * 1024, 1024 * 1024, 2 * 1024 * 1024, 4 * 1024 * 1024, 8 * 1024 * 1024, 8 * 1024 * 1024], onProgress: (p) => onProgress({ phase: "upload", kbps: p.kbps }) });
  return {
    ok: Boolean(down.ok || up.ok), at: Date.now(),
    pingMs: latency.median, jitterMs: latency.jitter,
    downloadMbps: down.ok ? Math.round(down.downloadKbps / 100) / 10 : null,
    uploadMbps: up.ok ? Math.round(up.uploadKbps / 100) / 10 : null,
    error: !down.ok && !up.ok ? (down.error || up.error) : null,
    warnings: [down.ok ? null : down.error?.message, up.ok ? null : up.error?.message].filter(Boolean),
  };
}

function system({ app, screen } = {}) {
  const cpus = os.cpus() || [];
  let disk = null;
  try {
    const s = fs.statfsSync(os.homedir());
    disk = { total: s.blocks * s.bsize, free: s.bavail * s.bsize };
  } catch { /* eski Node / izin */ }
  return {
    ok: true,
    hostname: os.hostname(), user: (() => { try { return os.userInfo().username; } catch { return null; } })(),
    platform: process.platform, release: os.release(), arch: process.arch, osVersion: typeof os.version === "function" ? os.version() : null,
    cpu: { model: cpus[0]?.model?.trim() || null, cores: cpus.length, speedMHz: cpus[0]?.speed || null, load: os.loadavg() },
    memory: { total: os.totalmem(), free: os.freemem() },
    uptimeSec: Math.round(os.uptime()),
    disk,
    displays: screen ? screen.getAllDisplays().map((d) => ({ id: d.id, size: `${d.size.width}×${d.size.height}`, scale: d.scaleFactor, primary: d.id === screen.getPrimaryDisplay().id, refresh: d.displayFrequency || null })) : [],
    versions: { app: app?.getVersion?.() || null, electron: process.versions.electron || null, chrome: process.versions.chrome || null, node: process.versions.node },
  };
}

function register({ ipcMain, app, screen }) {
  ipcMain.handle("nettools:info", () => info());
  ipcMain.handle("nettools:ping", (_e, host, opts) => ping(host, { count: opts?.count, port: opts?.port }));
  ipcMain.handle("nettools:dns", (_e, host, type, opts) => dnsQuery(host, type, { resolver: Object.prototype.hasOwnProperty.call(RESOLVERS, opts?.resolver) ? opts.resolver : "system" }));
  let running = null;
  ipcMain.handle("nettools:speed", (e) => {
    if (!running) running = speed({ onProgress: (p) => { try { e.sender.send("nettools:speed:progress", p); } catch { /* pencere kapandı */ } } }).finally(() => { running = null; });
    return running;
  });
  ipcMain.handle("nettools:system", () => system({ app, screen }));
}

module.exports = { register, cleanHost, parseTrace, info, ping, dnsQuery, downloadTest, speed, system, DNS_TYPES };
