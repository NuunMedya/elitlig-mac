// Yayın Stüdyosu — alt süreç sonlandırma (macOS / Windows).
//
// macOS / Linux: SIGKILL. Windows'ta sinyal yoktur: child.kill() (TerminateProcess)
// ve ardından süreç ağacı için `taskkill /pid <pid> /T /F`. Nazik durdurma her
// zaman önce stdin'i kapatmaktır (ffmpeg kuyruğu boşaltıp çıkar); bu işlev yalnız
// süre dolunca ya da hata durumunda çağrılır.
"use strict";

const { spawn } = require("node:child_process");

function killProcess(child, { platform = process.platform, spawnImpl = spawn } = {}) {
  if (!child) return;
  if (platform !== "win32") {
    try { child.kill("SIGKILL"); } catch { /* yoksay */ }
    return;
  }
  try { child.kill(); } catch { /* yoksay */ }
  if (!child.pid) return;
  try {
    const tk = spawnImpl("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
    tk?.on?.("error", () => { /* süreç zaten bitmiş */ });
  } catch { /* yoksay */ }
}

module.exports = { killProcess };
