// Apple Developer kimliği olmadan dağıtılan uygulamayı "ad-hoc" imzalar.
//
// Electron'un hazır ikilileri imzalıdır; electron-builder Info.plist'i ve
// kaynakları değiştirince bu imza bozulur ve Apple Silicon Mac'ler uygulamayı
// "hasarlı" diye açmaz. Ad-hoc imza (codesign -s -) bunu önler. Evrensel
// (universal) derlemede ara x64/arm64 klasörleri imzalanmaz; yalnız birleşmiş
// uygulama imzalanır (içindeki ffmpeg önce, ayrıca).
"use strict";

const { execFileSync } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== "darwin" || process.platform !== "darwin") return;
  if (/-temp$/.test(context.appOutDir)) return;
  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  // Yayın Stüdyosu: Resources içindeki ffmpeg (lipo ile birleşmiş arm64 + x86_64)
  // "--deep" kapsamına girmez; Apple Silicon imzasız ikiliyi çalıştırmaz.
  const ffmpeg = path.join(appPath, "Contents", "Resources", "ffmpeg", "ffmpeg");
  if (fs.existsSync(ffmpeg)) execFileSync("codesign", ["--force", "--sign", "-", ffmpeg], { stdio: "inherit" });
  execFileSync("codesign", ["--force", "--deep", "--sign", "-", appPath], { stdio: "inherit" });
  execFileSync("codesign", ["--verify", "--deep", "--strict", appPath], { stdio: "inherit" });
};
