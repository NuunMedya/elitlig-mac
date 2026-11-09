// Uygulama simgesi yolu (pencere / tepsi). Windows: çok boyutlu .ico (16–256 piksel; görev çubuğu,
// Alt+Tab ve başlık çubuğu aynı simgeyi kullanır). Paketli uygulamada resources/icon.ico
// (electron-builder win.extraResources), geliştirmede app/assets/icon.ico. Mac / Linux: icon.png.
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ASSETS = path.join(__dirname, "assets");

function appIconPath(platform = process.platform, resourcesPath = process.resourcesPath) {
  if (platform !== "win32") return path.join(ASSETS, "icon.png");
  for (const p of [resourcesPath && path.join(resourcesPath, "icon.ico"), path.join(ASSETS, "icon.ico")].filter(Boolean)) {
    try { if (fs.existsSync(p)) return p; } catch { /* sonraki */ }
  }
  return path.join(ASSETS, "icon.png");
}

module.exports = { appIconPath, ASSETS };
