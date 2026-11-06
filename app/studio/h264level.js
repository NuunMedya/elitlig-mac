// Yayın Stüdyosu — H.264 düzeyi (level) hesabı.
//
// Sitede siyah görüntü hatası: 1080p60 klipte level 4.0 yazılıydı (1080p60 için
// düşük); tarayıcı kod çözücüsü akışı reddedebiliyor. Yazdığımız her MP4'e
// (concat kopyası, tekrar, öne çıkanlar) çözünürlük ve kare hızına uygun düzey
// `-bsf:v h264_metadata=level=<düzey>` ile yazılır.
//
// Kural (H.264 Ek A, MaxFS / MaxMBPS sınırları): gereken en düşük düzey bulunur,
// sonra tabana çekilir: en az 4.1 (720p / 1080p30; 4.0'dan yüksek bit hızı payı),
// 4.2'yi aşan her şey en az 5.1. Örnek: 1080p30 → 4.1, 1080p60 → 4.2,
// 1440p30 → 5.1, 2160p30 → 5.1, 2160p60 → 5.2. Saf işlevler (testli).
"use strict";

// [düzey, MaxFS (makroblok), MaxMBPS (makroblok/sn)]
const LEVELS = [
  ["3.0", 1620, 40500],
  ["3.1", 3600, 108000],
  ["3.2", 5120, 216000],
  ["4.0", 8192, 245760],
  ["4.1", 8192, 245760],
  ["4.2", 8704, 522240],
  ["5.0", 22080, 589824],
  ["5.1", 36864, 983040],
  ["5.2", 36864, 2073600],
  ["6.0", 139264, 4177920],
  ["6.1", 139264, 8355840],
  ["6.2", 139264, 16711680],
];
const order = (lv) => LEVELS.findIndex(([name]) => name === lv);

/** Çözünürlük ve kare hızına uygun H.264 düzeyi ("4.1" | "4.2" | "5.1" | …). */
function computeH264Level(width, height, fps) {
  const w = Number(width) > 0 ? Number(width) : 1920;
  const h = Number(height) > 0 ? Number(height) : 1080;
  // 59,94 → 60; kare hızı bilinmiyorsa 60 varsayılır (güvenli taraf).
  const f = Number(fps) > 0 ? Math.ceil(Number(fps) - 0.01) : 60;
  const mbs = Math.ceil(w / 16) * Math.ceil(h / 16);
  const mbps = mbs * f;
  let need = LEVELS.find(([, maxFs, maxMbps]) => mbs <= maxFs && mbps <= maxMbps)?.[0] || "6.2";
  if (order(need) < order("4.1")) need = "4.1";
  else if (order(need) > order("4.2") && order(need) < order("5.1")) need = "5.1";
  return need;
}

/** "4.2" → 42 (SPS level_idc). */
const levelIdc = (level) => Math.round(Number(level) * 10);

/** concat kopyası / kodlama çıktısı için bit akışı süzgeci. */
const levelBsfArgs = (width, height, fps) => ["-bsf:v", `h264_metadata=level=${computeH264Level(width, height, fps)}`];

module.exports = { computeH264Level, levelIdc, levelBsfArgs, LEVELS };
