// Yayın Stüdyosu · PERFORMANS RAPORU (ana süreç tarafı, 2.35.0).
//
// "Yayın tanılama › Performans raporu" düğmesi arayüzün ölçümlerini (React çizimleri, uzun
// görevler, kare süreleri, çizim motoru) bu sistem bilgisiyle birleştirir:
//   - uygulama / Electron / Chromium sürümü, işletim sistemi, işlemci, bellek
//   - grafik: app.getGPUFeatureStatus() (donanım hızlandırma, tuval, video çözme / kodlama),
//     app.getGPUInfo("basic") (kart, sürücü), WebGL adı arayüzden gelir
//   - süreçler: app.getAppMetrics() (her sürecin işlemci % ve belleği; ayrı pencereler, gömülü
//     tarayıcı / yönetim paneli görünümleri ayrı süreç olarak görünür)
// Rapor userData/logs/performans-raporu-*.json olarak kaydedilir; kullanıcı dosyayı gönderir.
"use strict";

const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

const round1 = (v) => (Number.isFinite(v) ? Math.round(v * 10) / 10 : null);
const mb = (bytes) => (Number.isFinite(bytes) ? Math.round(bytes / 1048576) : null);

/** Donanım hızlandırma durumundan kısa yorum (Windows'ta asıl sorun çoğu zaman bu). */
function gpuVerdict(status) {
  if (!status || typeof status !== "object") return { ok: null, text: "bilinmiyor" };
  const bad = (k) => /disabled|software|unavailable/i.test(String(status[k] || ""));
  const off = ["gpu_compositing", "2d_canvas", "rasterization"].filter(bad);
  const video = ["video_decode", "video_encode"].filter(bad);
  if (off.length) return { ok: false, text: `Donanım hızlandırma KAPALI ya da yazılım: ${off.join(", ")}. Görüntü işlemcide çiziliyor.` };
  if (video.length) return { ok: false, text: `Donanım video ${video.map((k) => (k === "video_decode" ? "çözme" : "kodlama")).join(" / ")} kapalı.` };
  return { ok: true, text: "Donanım hızlandırma açık." };
}

/** getGPUInfo("basic") çıktısından sade liste. */
function gpuDevices(info) {
  const list = Array.isArray(info?.gpuDevice) ? info.gpuDevice : [];
  return list.map((d) => ({
    active: Boolean(d.active),
    vendorId: d.vendorId != null ? `0x${Number(d.vendorId).toString(16)}` : null,
    deviceId: d.deviceId != null ? `0x${Number(d.deviceId).toString(16)}` : null,
    vendor: d.vendorString || null,
    device: d.deviceString || null,
    driver: d.driverVersion || null,
  }));
}

/** Süreç ölçümleri (app.getAppMetrics) → tür başına işlemci % ve bellek. */
function processSummary(metrics) {
  const list = Array.isArray(metrics) ? metrics : [];
  const rows = list.map((m) => ({
    pid: m.pid, type: m.type, name: m.name || m.serviceName || null,
    cpuPct: round1(m.cpu?.percentCPUUsage), memMB: mb((m.memory?.workingSetSize || 0) * 1024), priority: m.priority || null,
  }));
  const byType = {};
  for (const r of rows) {
    const e = byType[r.type] || (byType[r.type] = { count: 0, cpuPct: 0, memMB: 0 });
    e.count += 1;
    e.cpuPct = round1(e.cpuPct + (r.cpuPct || 0));
    e.memMB += r.memMB || 0;
  }
  return { rows: rows.sort((a, b) => (b.cpuPct || 0) - (a.cpuPct || 0)), byType };
}

async function collectSystemInfo({ app, processRef = process, osRef = os } = {}) {
  let featureStatus = null;
  let gpuInfo = null;
  let metrics = null;
  try { featureStatus = app?.getGPUFeatureStatus?.() || null; } catch { featureStatus = null; }
  try { gpuInfo = app?.getGPUInfo ? await Promise.race([app.getGPUInfo("basic"), new Promise((r) => setTimeout(() => r(null), 3000))]) : null; } catch { gpuInfo = null; }
  try { metrics = app?.getAppMetrics?.() || null; } catch { metrics = null; }
  const cpus = (() => { try { return osRef.cpus(); } catch { return []; } })();
  return {
    app: { version: app?.getVersion?.() || null, electron: processRef.versions?.electron || null, chrome: processRef.versions?.chrome || null, node: processRef.versions?.node || null },
    os: { platform: processRef.platform, arch: processRef.arch, release: (() => { try { return osRef.release(); } catch { return null; } })(), version: (() => { try { return osRef.version?.() || null; } catch { return null; } })() },
    cpu: { model: cpus[0]?.model || null, cores: cpus.length || null, parallelism: (() => { try { return osRef.availableParallelism?.() || cpus.length; } catch { return cpus.length; } })(), loadavg: (() => { try { return osRef.loadavg().map(round1); } catch { return null; } })() },
    memory: { totalMB: mb(osRef.totalmem?.()), freeMB: mb(osRef.freemem?.()) },
    gpu: { featureStatus, verdict: gpuVerdict(featureStatus), devices: gpuDevices(gpuInfo), auxAttributes: gpuInfo?.auxAttributes ? { optimus: gpuInfo.auxAttributes.optimus ?? null, amdSwitchable: gpuInfo.auxAttributes.amdSwitchable ?? null } : null },
    processes: processSummary(metrics),
    switches: (() => { try { return { forceHighPerformanceGpu: app?.commandLine?.hasSwitch?.("force_high_performance_gpu") || false, disableGpu: app?.commandLine?.hasSwitch?.("disable-gpu") || false }; } catch { return null; } })(),
    at: new Date().toISOString(),
  };
}

/** performans-raporu-2026-11-16-21-04-33.json */
function reportFileName(date = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `performans-raporu-${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}-${p(date.getHours())}-${p(date.getMinutes())}-${p(date.getSeconds())}.json`;
}

/** Raporu klasöre yazar (JSON + okunur metin); { ok, path, textPath }. */
function saveReport(dir, report, text = "", date = new Date()) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, reportFileName(date));
  fs.writeFileSync(file, JSON.stringify(report, null, 2));
  let textPath = null;
  if (text) { textPath = file.replace(/\.json$/, ".txt"); fs.writeFileSync(textPath, String(text)); }
  return { ok: true, path: file, textPath };
}

module.exports = { collectSystemInfo, gpuVerdict, gpuDevices, processSummary, reportFileName, saveReport };
