// Süreç çökmeleri: grafik (GPU) süreci, arayüz (renderer), yardımcı süreçler — 2.36.0.
//
// Bir uygulama Windows'u tek başına mavi ekrana / kurtarma moduna düşüremez; ekran kartı
// sürücüsünün çökmesi (TDR) ise düşürebilir. Chromium'da bu, grafik sürecinin "crashed" /
// "launch-failed" ile gitmesi olarak görünür. Her olay userData/logs/crashes.log'a (JSON satırı)
// ve açık bir yayın tanılama günlüğüne yazılır, arayüze "app:processGone" ile bildirilir (toast).
// Grafik süreci 10 dakikada 3 kez çökerse güvenli modda yeniden başlatma önerilir.
//
// Önceki açılış beklenmedik şekilde kapandıysa (çalışma işareti silinmemiş) bu da günlüğe yazılır:
// Windows kurtarma / kapanma olaylarıyla zaman karşılaştırması bu satırla yapılabilir.
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const MAX_LINES = 300;
const GPU_WINDOW_MS = 10 * 60_000;
const GPU_REPEAT = 3;

/** Olay önemli mi (temiz çıkış ve uygulamanın kendi kapattıkları değil). */
const isFailure = (reason) => !["clean-exit", "killed"].includes(String(reason || ""));

/** Son GPU_WINDOW_MS içindeki grafik çökmesi sayısı. */
function recentGpuCrashes(list, now = Date.now(), windowMs = GPU_WINDOW_MS) {
  return (list || []).filter((t) => now - t <= windowMs).length;
}

/**
 * deps: { app, dir (logs klasörü), flags (perfFlags store), launch, notify(payload),
 *         onRepeatedGpuCrash(info) (güvenli mod önerisi), writeDiag(message, data) | null, shell, now }
 */
function createCrashMonitor({ app, dir, flags = null, launch = null, notify = () => {}, onRepeatedGpuCrash = null, writeDiag = null, shell = null, now = () => Date.now() }) {
  const file = path.join(dir, "crashes.log");
  const marker = path.join(dir, "running.json");
  let unclean = null;
  let diagWriter = writeDiag;

  const append = (entry) => {
    try {
      fs.mkdirSync(dir, { recursive: true });
      let lines = [];
      try { lines = fs.readFileSync(file, "utf8").split("\n").filter(Boolean); } catch { /* yok */ }
      lines.push(JSON.stringify(entry));
      if (lines.length > MAX_LINES) lines = lines.slice(-MAX_LINES);
      fs.writeFileSync(file, `${lines.join("\n")}\n`);
    } catch { /* yoksay */ }
  };

  const gpuStatus = () => { try { return app.getGPUFeatureStatus?.() || null; } catch { return null; } };

  function record(entry) {
    const e = { at: new Date(now()).toISOString(), version: app.getVersion?.() || null, safeMode: Boolean(launch?.safeMode), ...entry };
    append(e);
    try { diagWriter?.(`süreç gitti: ${e.type || e.kind} (${e.reason}${e.exitCode != null ? `, çıkış ${e.exitCode}` : ""})`, e); } catch { /* yoksay */ }
    if (!isFailure(e.reason)) return e;
    try { notify(e); } catch { /* yoksay */ }
    if (e.type === "GPU" && flags) {
      const st = flags.noteGpuCrash(now());
      const n = recentGpuCrashes(st.gpuCrashes, now());
      // Öneri en çok 30 dakikada bir; güvenli moddayken önerilmez.
      if (n >= GPU_REPEAT && !launch?.safeMode && (!st.safeModeSuggestedAt || now() - st.safeModeSuggestedAt > 30 * 60_000)) {
        flags.markSuggested(now());
        try { onRepeatedGpuCrash?.({ count: n, entry: e }); } catch { /* yoksay */ }
      }
    }
    return e;
  }

  const onChild = (_e, d = {}) => record({ kind: "child", type: d.type || null, reason: d.reason || null, exitCode: d.exitCode ?? null, name: d.name || null, serviceName: d.serviceName || null, gpu: d.type === "GPU" ? gpuStatus() : undefined });
  const onRenderer = (_e, wc, d = {}) => {
    let url = null;
    try { url = wc?.getURL?.() || null; } catch { /* yoksay */ }
    record({ kind: "renderer", type: "renderer", reason: d.reason || null, exitCode: d.exitCode ?? null, url: url ? String(url).replace(/^file:\/\/.*\/renderer\/dist\//, "app://") : null });
  };

  return {
    file,
    /** app.on olaylarını bağla ve önceki açılışın temiz kapanıp kapanmadığına bak. */
    install() {
      app.on("child-process-gone", onChild);
      app.on("render-process-gone", onRenderer);
      try {
        const prev = JSON.parse(fs.readFileSync(marker, "utf8"));
        unclean = { startedAt: prev.startedAt || null, version: prev.version || null, pid: prev.pid || null };
        record({ kind: "unclean-exit", type: "app", reason: "previous-session-not-closed", exitCode: null, previous: unclean });
      } catch { /* işaret yok: önceki açılış temiz kapandı */ }
      try { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(marker, JSON.stringify({ startedAt: new Date(now()).toISOString(), version: app.getVersion?.() || null, pid: process.pid })); } catch { /* yoksay */ }
      return this;
    },
    /** Temiz kapanış (will-quit). */
    markCleanExit() { try { fs.unlinkSync(marker); } catch { /* yoksay */ } },
    setDiagWriter(fn) { diagWriter = fn; },
    record,
    uncleanExit: () => unclean,
    recent(n = 20) {
      try { return fs.readFileSync(file, "utf8").split("\n").filter(Boolean).slice(-n).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean).reverse(); } catch { return []; }
    },
    reveal() {
      try {
        if (fs.existsSync(file)) { shell?.showItemInFolder?.(file); return true; }
        fs.mkdirSync(dir, { recursive: true });
        shell?.openPath?.(dir);
        return true;
      } catch { return false; }
    },
  };
}

module.exports = { createCrashMonitor, recentGpuCrashes, isFailure, GPU_REPEAT, GPU_WINDOW_MS };
