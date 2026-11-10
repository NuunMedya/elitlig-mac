// Masaüstü widget'ları — pencere katmanı ve malzemesi (macOS / Windows masaüstü widget'ları mantığı).
//
// Katmanlar (catalog.LEVELS):
//   desktop (varsayılan) — "masaüstü katmanı": diğer uygulama pencerelerinin altında kalır, öne çıkmaz,
//       odak çalmaz, Dock / görev çubuğu / ⌘Tab / Alt+Tab'da görünmez ama ETKİLEŞİMLİDİR.
//       • Tüm platformlar: focusable:false (tıklama pencereyi etkinleştirmez — Windows'ta WS_EX_NOACTIVATE,
//         macOS'ta anahtar pencere olamaz, X11'de input=false), skipTaskbar, alwaysOnTop:false,
//         showInactive. Yazı alanına tıklanınca pencere geçici olarak odaklanabilir yapılır
//         (widgets:focus) ve odak gidince eski hâline döner (focusRelease).
//       • Windows: gösterilince ve etkileşim bitince SetWindowPos(HWND_BOTTOM, SWP_NOACTIVATE) ile
//         Z sırasının en altına gönderilir (WorkerW/Progman'a gömmek kırılgan olduğu için yapılmaz).
//       • macOS: Electron'da pencere düzeyini kCGDesktopIconWindowLevel+1'e ayarlamanın yolu yoktur
//         (setAlwaysOnTop yalnız "normal" ve üstü düzeyleri verir; type:"desktop" etkileşimsizdir).
//         En yakın sağlam davranış: normal düzey + anahtar olamayan pencere + tüm Spaces'te görünür
//         (tam ekran uygulamaların üstüne çıkmaz) + Mission Control'de gizli. Başka bir pencereye
//         tıklanınca widget onun altında kalır; widget'a tıklamak odak çalmaz.
//   normal  — sıradan pencere (odaklanır, tıklayınca öne gelir).
//   top     — üstte sabit (floating).
//   embed   — yalnız macOS: type:"desktop" (masaüstü arka plan düzeyi, etkileşimsiz; saat / hava gibi).
//
// Malzeme (store.material): glass → macOS vibrancy "popover" + visualEffectState "active";
// Windows 11 (22H2+, derleme ≥ 22621) backgroundMaterial "acrylic"; soft → CSS yarı saydam degrade.
"use strict";

const os = require("node:os");

/** Windows 11 22H2+ (acrylic arka plan malzemesi destekli mi)? */
function winSupportsAcrylic(release = os.release()) {
  const build = Number(String(release || "").split(".")[2]);
  return Number.isFinite(build) && build >= 22621;
}

/** Bu platformda cam (sistem bulanıklığı) kullanılacak mı? */
function useGlass(material, platform, release) {
  if (material === "soft") return false;
  if (platform === "darwin") return true;
  if (platform === "win32") return winSupportsAcrylic(release);
  return false;
}

/** Katman platformda geçerli mi (embed yalnız macOS)? */
const effectiveLevel = (level, platform) => (level === "embed" && platform !== "darwin" ? "desktop" : level || "desktop");

/**
 * BrowserWindow seçenekleri (katman + malzemeye göre). Saf; widgets.test.js sınar.
 * Dönen `glass` arayüze iletilir (CSS arka planı buna göre saydamlaşır).
 */
function windowOptions({ level, material = "auto", platform = process.platform, release, locked = false }) {
  const lv = effectiveLevel(level, platform);
  const glass = useGlass(material, platform, release) && lv !== "embed";
  const base = {
    frame: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true, // Dock / görev çubuğu / Alt+Tab'da yok (Windows: WS_EX_TOOLWINDOW)
    movable: !locked,
    roundedCorners: true,
    hasShadow: lv !== "embed",
    alwaysOnTop: lv === "top",
    focusable: lv === "normal" || lv === "top", // desktop: tıklama odak çalmaz; embed: hiç
    show: false,
  };
  if (lv === "embed") Object.assign(base, { type: "desktop", focusable: false });
  if (glass && platform === "darwin") Object.assign(base, { transparent: true, backgroundColor: "#00000000", vibrancy: "popover", visualEffectState: "active" });
  else if (glass && platform === "win32") Object.assign(base, { transparent: false, backgroundColor: "#00000000", backgroundMaterial: "acrylic" });
  else Object.assign(base, { transparent: true, backgroundColor: "#00000000" });
  return { options: base, glass, level: lv };
}

/** HWND (getNativeWindowHandle tamponu) → ondalık metin. */
function hwndOf(buf) {
  if (!buf || !buf.length) return null;
  try { return (buf.length >= 8 ? buf.readBigUInt64LE(0) : BigInt(buf.readUInt32LE(0))).toString(); } catch { return null; }
}

const WIN_BOTTOM_SCRIPT = String.raw`$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class ElitligWidgetZ {
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);
}
"@
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) { break }
  foreach ($t in $line.Trim().Split(' ')) {
    if ($t -match '^[0-9]{1,20}$') { try { [void][ElitligWidgetZ]::SetWindowPos([IntPtr][int64]$t, [IntPtr]1, 0, 0, 0, 0, 0x0013) } catch { } }
  }
}
`;
// 0x0013 = SWP_NOSIZE | SWP_NOMOVE | SWP_NOACTIVATE; [IntPtr]1 = HWND_BOTTOM

/** Windows: pencereleri Z sırasının en altına gönderen uzun ömürlü PowerShell yardımcısı. */
function createWinBottom({ spawn, fs, path, tmpDir, log = () => {} }) {
  let child = null;
  let failures = 0;
  const start = () => {
    if (child) return child;
    if (failures >= 3) return null;
    try {
      fs.mkdirSync(tmpDir, { recursive: true });
      const file = path.join(tmpDir, "elitlig-widget-z.ps1");
      fs.writeFileSync(file, `﻿${WIN_BOTTOM_SCRIPT}`, "utf8");
      child = spawn("powershell.exe", ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", file], { windowsHide: true, stdio: ["pipe", "ignore", "pipe"] });
      child.stderr?.on("data", (d) => log("[widget] z:", String(d).slice(0, 200)));
      const dead = () => { child = null; failures += 1; };
      child.on("exit", dead);
      child.on("error", dead);
    } catch (e) { log("[widget] z başlatılamadı", e); child = null; failures += 1; }
    return child;
  };
  /** hwnd listesi (ondalık metin) → en alta. */
  const send = (hwnds) => {
    const list = (hwnds || []).filter((h) => /^[0-9]{1,20}$/.test(String(h)));
    if (!list.length) return false;
    const c = start();
    if (!c) return false;
    try { c.stdin.write(`${list.join(" ")}\n`); return true; } catch { return false; }
  };
  const dispose = () => { try { child?.stdin.end(); child?.kill(); } catch { /* yoksay */ } child = null; };
  return { send, dispose };
}

module.exports = { windowOptions, effectiveLevel, useGlass, winSupportsAcrylic, hwndOf, createWinBottom, WIN_BOTTOM_SCRIPT };
