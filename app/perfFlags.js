// Performans ve güvenli mod bayrakları (Ayarlar › Performans) — 2.36.0.
//
// Bayraklar Chromium'a app HAZIR OLMADAN verilmeli (donanım hızlandırma, ekran kartı seçimi);
// bu yüzden ayarlar arayüzün localStorage'ında değil, userData/performance.json'da durur.
// Elitlig Araçlar ve Elitlig Stüdyo aynı modülü kullanır (her biri kendi userData'sında).
//
//   highPerfGpu        Windows: force_high_performance_gpu (iki kartlı dizüstünde güçlü kart). Varsayılan açık.
//   ffmpegAboveNormal  Windows: canlı ffmpeg kodlayıcısı "normalin üstü" öncelikte (2.35.0). Varsayılan KAPALI:
//                      donanım kodlayıcıda (NVENC / QSV / AMF) gereksiz; yazılım kodlamada masaüstünü aç bırakabilir.
//   hardwareAcceleration  false → app.disableHardwareAcceleration() (yalnız sorun gidermede).
//   safeMode           kalıcı güvenli mod (her açılışta).
//   safeModeOnce       yalnız bir sonraki açılışta güvenli mod (sonra kendiliğinden silinir).
//
// GÜVENLİ MOD: donanım hızlandırma kapalı, güçlü kart zorlanmaz, ffmpeg normal öncelik; arayüz
// çizim motorunu ana iş parçacığına alır (Yayın Stüdyosu). Komut satırından: --safe-mode ya da
// --guvenli-mod; ortam değişkeni ELITLIG_SAFE_MODE=1.
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const FILE = "performance.json";
const DEFAULT_FLAGS = Object.freeze({ highPerfGpu: true, ffmpegAboveNormal: false, hardwareAcceleration: true, safeMode: false, safeModeOnce: false });
const SAFE_ARGS = ["--safe-mode", "--guvenli-mod"];

const bool = (v, d) => (typeof v === "boolean" ? v : d);

function normalizeFlags(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const out = {};
  for (const [k, d] of Object.entries(DEFAULT_FLAGS)) out[k] = bool(r[k], d);
  // Son grafik süreci çökmeleri (ms zaman damgası; en çok 20): art arda çökme → güvenli mod önerisi.
  out.gpuCrashes = Array.isArray(r.gpuCrashes) ? r.gpuCrashes.map(Number).filter(Number.isFinite).slice(-20) : [];
  out.safeModeSuggestedAt = Number.isFinite(Number(r.safeModeSuggestedAt)) ? Number(r.safeModeSuggestedAt) : 0;
  return out;
}

function createPerfFlags({ dir }) {
  const file = path.join(dir, FILE);
  let cache = null;
  const read = () => {
    if (cache) return cache;
    try { cache = normalizeFlags(JSON.parse(fs.readFileSync(file, "utf8"))); } catch { cache = normalizeFlags(null); }
    return cache;
  };
  const write = (next) => {
    cache = normalizeFlags(next);
    try { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(file, JSON.stringify(cache, null, 1)); } catch { /* yoksay */ }
    return cache;
  };
  return {
    file,
    get: () => ({ ...read() }),
    /** Yalnız bilinen alanlar değişir. */
    set(patch = {}) {
      const cur = read();
      const next = { ...cur };
      for (const k of Object.keys(DEFAULT_FLAGS)) if (typeof patch?.[k] === "boolean") next[k] = patch[k];
      return write(next);
    },
    noteGpuCrash(at = Date.now()) { const cur = read(); return write({ ...cur, gpuCrashes: [...cur.gpuCrashes, at] }); },
    markSuggested(at = Date.now()) { const cur = read(); return write({ ...cur, safeModeSuggestedAt: at }); },
    clearGpuCrashes() { const cur = read(); return write({ ...cur, gpuCrashes: [] }); },
  };
}

/** Bu açılışın etkin ayarları. argv / env güvenli modu zorlar. */
function resolveLaunch(flags, { argv = process.argv, env = process.env } = {}) {
  const f = normalizeFlags(flags);
  const byArg = (argv || []).some((a) => SAFE_ARGS.includes(String(a)));
  const byEnv = env?.ELITLIG_SAFE_MODE === "1";
  const safeMode = Boolean(byArg || byEnv || f.safeMode || f.safeModeOnce);
  const reason = byArg ? "komut satırı" : byEnv ? "ortam değişkeni" : f.safeModeOnce ? "tek seferlik (Ayarlar / çökme sonrası)" : f.safeMode ? "Ayarlar › Performans" : null;
  return {
    safeMode,
    reason,
    hardwareAcceleration: safeMode ? false : f.hardwareAcceleration,
    highPerfGpu: safeMode ? false : f.highPerfGpu,
    ffmpegAboveNormal: safeMode ? false : f.ffmpegAboveNormal,
  };
}

/**
 * App hazır olmadan: bayrakları oku, tek seferlik güvenli modu tüket, Chromium'a uygula.
 * applySwitches(app, platform, { highPerfGpu, safeMode }) — studio/switches.applyStudioSwitches.
 * Dönüş: { store, launch }.
 */
function applyLaunchFlags(app, { dir, argv = process.argv, env = process.env, platform = process.platform, applySwitches = null } = {}) {
  const store = createPerfFlags({ dir });
  const launch = resolveLaunch(store.get(), { argv, env });
  if (store.get().safeModeOnce) store.set({ safeModeOnce: false });
  if (!launch.hardwareAcceleration) { try { app.disableHardwareAcceleration(); } catch { /* yoksay */ } }
  if (applySwitches) applySwitches(app, platform, { highPerfGpu: launch.highPerfGpu, safeMode: launch.safeMode });
  return { store, launch };
}

/** Ayarlar › Performans için IPC (perf:*). relaunch({ safeMode }) yeniden başlatır. */
function registerPerfIpc({ ipcMain, app, store, launch, crashes = null, platform = process.platform }) {
  ipcMain.handle("perf:state", () => ({ flags: store.get(), launch, platform, crashes: crashes ? crashes.recent(20) : [], uncleanExit: crashes?.uncleanExit?.() || null }));
  ipcMain.handle("perf:set", (_e, patch) => store.set(patch && typeof patch === "object" ? patch : {}));
  ipcMain.handle("perf:relaunch", (_e, opts = {}) => {
    const args = process.argv.slice(1).filter((a) => !SAFE_ARGS.includes(a));
    if (opts?.safeMode) args.push("--safe-mode");
    try { app.relaunch({ args }); } catch { /* yoksay */ }
    // quit (exit değil): will-quit çalışsın — ffmpeg süreçleri kapatılır, parça klasörleri silinir.
    setTimeout(() => app.quit(), 50);
    return true;
  });
  ipcMain.handle("perf:revealCrashLog", () => crashes?.reveal?.() || false);
}

module.exports = { DEFAULT_FLAGS, SAFE_ARGS, normalizeFlags, createPerfFlags, resolveLaunch, applyLaunchFlags, registerPerfIpc };
