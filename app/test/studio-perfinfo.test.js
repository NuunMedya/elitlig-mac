// 2.35.0 · Performans raporu (ana süreç): grafik / süreç bilgisi, dosya; Windows'ta canlı
// kodlayıcı önceliği.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { collectSystemInfo, gpuVerdict, gpuDevices, processSummary, reportFileName, saveReport } = require("../studio/perfinfo");
const { processPriorityFor } = require("../studio/engine");

test("gpuVerdict: yazılım çizimi / kapalı donanım hızlandırma yakalanır", () => {
  assert.equal(gpuVerdict({ gpu_compositing: "enabled", "2d_canvas": "enabled", rasterization: "enabled", video_decode: "enabled", video_encode: "enabled" }).ok, true);
  const v = gpuVerdict({ gpu_compositing: "disabled_software", "2d_canvas": "unavailable_software", rasterization: "disabled_software" });
  assert.equal(v.ok, false);
  assert.match(v.text, /KAPALI/);
  assert.equal(gpuVerdict({ gpu_compositing: "enabled", "2d_canvas": "enabled", rasterization: "enabled", video_encode: "disabled_software" }).ok, false);
  assert.equal(gpuVerdict(null).ok, null);
});

test("gpuDevices ve processSummary: sade liste", () => {
  const d = gpuDevices({ gpuDevice: [{ active: true, vendorId: 0x10de, deviceId: 0x2786, vendorString: "NVIDIA", deviceString: "RTX 4070", driverVersion: "32.0.15.6636" }] });
  assert.deepEqual(d[0], { active: true, vendorId: "0x10de", deviceId: "0x2786", vendor: "NVIDIA", device: "RTX 4070", driver: "32.0.15.6636" });
  const p = processSummary([
    { pid: 1, type: "Browser", cpu: { percentCPUUsage: 2 }, memory: { workingSetSize: 200 * 1024 } },
    { pid: 2, type: "Tab", cpu: { percentCPUUsage: 30 }, memory: { workingSetSize: 500 * 1024 } },
    { pid: 3, type: "Tab", cpu: { percentCPUUsage: 1.5 }, memory: { workingSetSize: 100 * 1024 } },
    { pid: 4, type: "GPU", cpu: { percentCPUUsage: 12 }, memory: { workingSetSize: 300 * 1024 } },
  ]);
  assert.equal(p.rows[0].pid, 2);
  assert.deepEqual(p.byType.Tab, { count: 2, cpuPct: 31.5, memMB: 600 });
});

test("collectSystemInfo: Electron app API'leriyle (sahte) tam rapor", async () => {
  const app = {
    getVersion: () => "2.35.0",
    getGPUFeatureStatus: () => ({ gpu_compositing: "enabled", "2d_canvas": "enabled", rasterization: "enabled" }),
    getGPUInfo: async (kind) => { assert.equal(kind, "basic"); return { gpuDevice: [{ active: true, vendorString: "NVIDIA", deviceString: "RTX" }], auxAttributes: { optimus: false } }; },
    getAppMetrics: () => [{ pid: 9, type: "GPU", cpu: { percentCPUUsage: 5 }, memory: { workingSetSize: 1024 } }],
    commandLine: { hasSwitch: (s) => s === "force_high_performance_gpu" },
  };
  const r = await collectSystemInfo({ app });
  assert.equal(r.app.version, "2.35.0");
  assert.equal(r.gpu.verdict.ok, true);
  assert.equal(r.gpu.devices[0].device, "RTX");
  assert.equal(r.processes.byType.GPU.count, 1);
  assert.equal(r.switches.forceHighPerformanceGpu, true);
  assert.ok(r.cpu.cores >= 1);
  assert.ok(r.memory.totalMB > 0);
});

test("saveReport: JSON + metin, okunur dosya adı", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "perf-"));
  const at = new Date(2026, 10, 16, 21, 4, 33);
  assert.equal(reportFileName(at), "performans-raporu-2026-11-16-21-04-33.json");
  const res = saveReport(dir, { kind: "x", v: 1 }, "metin", at);
  assert.equal(res.ok, true);
  assert.deepEqual(JSON.parse(fs.readFileSync(res.path, "utf8")), { kind: "x", v: 1 });
  assert.equal(fs.readFileSync(res.textPath, "utf8"), "metin");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("canlı kodlayıcı önceliği: yalnız Windows'ta 'normalin üstü'", () => {
  assert.equal(processPriorityFor("above-normal", "win32"), os.constants.priority.PRIORITY_ABOVE_NORMAL);
  assert.equal(processPriorityFor("above-normal", "darwin"), null);
  assert.equal(processPriorityFor(null, "win32"), null);
});
