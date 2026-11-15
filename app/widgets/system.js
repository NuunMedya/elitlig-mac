// Sistem widget'ı: işlemci, bellek, disk (Node os / fs). Pil arayüzde navigator.getBattery() ile okunur.
"use strict";

const os = require("node:os");
const fs = require("node:fs");

/** İki os.cpus() örneği arasındaki toplam kullanım yüzdesi (0–100). */
function cpuPercent(prev, next) {
  if (!Array.isArray(prev) || !Array.isArray(next) || prev.length !== next.length || !next.length) return null;
  let idle = 0;
  let total = 0;
  for (let i = 0; i < next.length; i += 1) {
    const a = prev[i].times;
    const b = next[i].times;
    const t = (b.user - a.user) + (b.nice - a.nice) + (b.sys - a.sys) + (b.idle - a.idle) + (b.irq - a.irq);
    total += t;
    idle += b.idle - a.idle;
  }
  if (total <= 0) return null;
  return Math.round(Math.min(100, Math.max(0, (1 - idle / total) * 100)));
}

function createSystemStats({ home = os.homedir() } = {}) {
  let last = os.cpus();
  let lastAt = Date.now();
  let lastCpu = null;
  return async function stats() {
    const now = os.cpus();
    // Çok sık istenirse (iki widget) bir önceki ölçüm kullanılır: en az 700 ms aralık.
    if (Date.now() - lastAt >= 700) {
      lastCpu = cpuPercent(last, now);
      last = now;
      lastAt = Date.now();
    }
    const total = os.totalmem();
    const free = os.freemem();
    let disk = null;
    try {
      const s = await fs.promises.statfs(home);
      const size = s.blocks * s.bsize;
      const avail = s.bavail * s.bsize;
      if (size > 0) disk = { total: size, free: avail, percent: Math.round(((size - avail) / size) * 100) };
    } catch { /* desteklenmiyor */ }
    return {
      ok: true,
      cpu: lastCpu,
      cores: now.length,
      model: String(now[0]?.model || "").replace(/\s+/g, " ").trim().slice(0, 60),
      load: os.loadavg()[0],
      memory: { total, free, percent: total ? Math.round(((total - free) / total) * 100) : null },
      disk,
      uptime: os.uptime(),
      host: os.hostname().slice(0, 40),
      platform: process.platform,
    };
  };
}

module.exports = { createSystemStats, cpuPercent };
