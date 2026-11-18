// Yayın Stüdyosu — Chromium bayrakları ve şema adı (hafif modül).
//
// main.js (Elitlig Araçlar) ve studio-app/main.js (Elitlig Stüdyo) bunları app hazır
// olmadan çağırır. Ağır stüdyo modüllerini (ffmpeg, motor, açılar …) YÜKLEMEZ: Elitlig
// Araçlar stüdyo açılmadıkça stüdyo kodunu belleğe almaz (2.36.0, bkz. main.js ensureStudio).
"use strict";

/** elitlig-studio:// (klipler, tekrarlar, öne çıkanlar, yerel medya). */
const STUDIO_SCHEME = "elitlig-studio";

/**
 * Pencere arkada, örtülü ya da küçültülmüşken çizim / zamanlayıcı kısılmasın. Aksi halde
 * canvas.captureStream() kare üretmeyi bırakır, MediaRecorder parça yollamaz, motor
 * "takıldı" deyip ffmpeg'i yeniden başlatır ve YouTube yayını kopar. Windows'ta örtülen
 * pencerelerin çizimi ayrıca CalculateNativeWinOcclusion ile durur.
 */
const STUDIO_SWITCHES = Object.freeze(["disable-renderer-backgrounding", "disable-background-timer-throttling", "disable-backgrounding-occluded-windows"]);
const STUDIO_DISABLED_FEATURES = Object.freeze(["CalculateNativeWinOcclusion"]);
/**
 * Windows: iki ekran kartlı dizüstülerde (Intel + NVIDIA / AMD) Chromium çoğu zaman tümleşik
 * kartı seçer — tuval / VideoFrame kopyaları ve kodlama zayıf karta biner. Yayın uygulaması
 * olduğu için güçlü kart istenir (tek kartlı masaüstünde etkisiz). 2.36.0: Ayarlar › Performans
 * ile kapatılabilir; güvenli modda hiç eklenmez.
 */
const STUDIO_WIN_SWITCHES = Object.freeze(["force_high_performance_gpu"]);

/**
 * opts: { highPerfGpu = true, safeMode = false }.
 * Güvenli mod: yalnız kısma kapatma bayrakları (yayın kopmasın); ekran kartı seçimi Windows'a kalır.
 */
function applyStudioSwitches(app, platform = process.platform, opts = {}) {
  const cl = app?.commandLine;
  if (!cl) return;
  const { highPerfGpu = true, safeMode = false } = opts || {};
  for (const sw of STUDIO_SWITCHES) cl.appendSwitch(sw);
  if (platform === "win32" && highPerfGpu && !safeMode) for (const sw of STUDIO_WIN_SWITCHES) cl.appendSwitch(sw);
  const existing = typeof cl.getSwitchValue === "function" ? cl.getSwitchValue("disable-features") : "";
  const features = [...new Set([...String(existing || "").split(",").filter(Boolean), ...STUDIO_DISABLED_FEATURES])];
  cl.appendSwitch("disable-features", features.join(","));
}

module.exports = { STUDIO_SCHEME, STUDIO_SWITCHES, STUDIO_WIN_SWITCHES, STUDIO_DISABLED_FEATURES, applyStudioSwitches };
