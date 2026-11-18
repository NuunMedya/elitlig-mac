// ELİTLİG STÜDYO — electron-builder yapılandırması (2.36.0).
//
// Aynı depodan, Elitlig Araçlar ile aynı sürümle (package.json "version") ikinci bir uygulama:
//   npx electron-builder --config build/studio-builder.config.js --mac dmg zip --universal
//   npx electron-builder --config build/studio-builder.config.js --win nsis zip --x64
// Çıktı: dist-studio/ (Elitlig Araçlar'ın dist/ klasörüyle karışmaz)
//   Elitlig-Studyo-<sürüm>.dmg · Elitlig-Studyo-<sürüm>-universal.zip
//   Elitlig-Studyo-Setup-<sürüm>.exe · Elitlig-Studyo-<sürüm>-win-x64.zip
//
// Ayrı appId (com.elitlig.studyo), ayrı ürün adı, ayrı protokol (elitlig-studyo://), ayrı simge;
// userData ana süreçte "<appData>/Elitlig Studyo" (app/studio-app/main.js). Otomatik güncelleme yok
// (Elitlig Araçlar'da da yok): publish kapalı, latest*.yml üretilmez — iki uygulamanın güncelleme
// dosyaları çakışamaz.
"use strict";

const pkg = require("../package.json");

// Stüdyonun hiç kullanmadığı ana süreç modülleri pakete girmez (require grafiği testle korunur:
// app/test/studio-app.test.js).
const EXCLUDE_APP = [
  "app/test/**", "app/main.js", "app/adminPanel/**", "app/browser/**", "app/launcher/**", "app/shelf/**", "app/widgets/**",
  "app/fileTools/**", "app/toolkit.js", "app/focus.js", "app/reminders.js", "app/equipmentFeed.js", "app/netTools.js",
  "app/clipboardIo.js", "app/windowLayouts.js", "app/windowManager.js",
];

module.exports = {
  appId: "com.elitlig.studyo",
  productName: "Elitlig Studyo",
  executableName: "Elitlig Studyo",
  copyright: "© Elitlig",
  // package.json'ın "build" alanı bu dosya verilince KULLANILMAZ; giriş ve ad buradan.
  extraMetadata: {
    main: "app/studio-app/main.js",
    name: "elitlig-studyo",
    productName: "Elitlig Studyo",
    description: "Elitlig Stüdyo — Mac ve Windows için bağımsız yayın uygulaması: kamera, ekran ve skorbordla YouTube/RTMP canlı yayın, reji, tekrar, VAR, röportaj, LED çıkışı, gol klipleri.",
  },
  protocols: [{ name: "Elitlig Stüdyo", schemes: ["elitlig-studyo"] }],
  directories: { output: "dist-studio", buildResources: "build" },
  files: ["app/**/*", ...EXCLUDE_APP.map((p) => `!${p}`), "renderer/dist/**/*", "package.json"],
  publish: null,
  afterPack: "build/afterPack.js",
  mac: {
    category: "public.app-category.video",
    icon: "build/studio-icon.png",
    identity: null,
    hardenedRuntime: false,
    gatekeeperAssess: false,
    darkModeSupport: true,
    artifactName: "Elitlig-Studyo-${version}-${arch}.${ext}",
    extraResources: [
      { from: "build/ffmpeg/${arch}", to: "ffmpeg", filter: ["ffmpeg", "LICENSE.txt"] },
      { from: "build/studio-icon.png", to: "studio-icon.png" },
    ],
    extendInfo: {
      NSCameraUsageDescription: "Elitlig Stüdyo kamera görüntüsünü canlı yayına almak için kamerayı kullanır.",
      NSMicrophoneUsageDescription: "Elitlig Stüdyo canlı yayın sesi için mikrofonu kullanır.",
      LSApplicationCategoryType: "public.app-category.video",
      CFBundleDisplayName: "Elitlig Stüdyo",
    },
  },
  dmg: {
    title: "Elitlig Stüdyo",
    artifactName: "Elitlig-Studyo-${version}.dmg",
    contents: [{ x: 150, y: 190, type: "file" }, { x: 390, y: 190, type: "link", path: "/Applications" }],
    window: { width: 540, height: 380 },
  },
  win: {
    target: [{ target: "nsis", arch: ["x64"] }, { target: "zip", arch: ["x64"] }],
    icon: "build/studio-icon.ico",
    artifactName: "Elitlig-Studyo-${version}-win-${arch}.${ext}",
    legalTrademarks: "Elitlig",
    extraResources: [
      { from: "build/ffmpeg/win-x64", to: "ffmpeg", filter: ["ffmpeg.exe", "LICENSE.txt"] },
      { from: "build/studio-icon.ico", to: "studio-icon.ico" },
      { from: "build/studio-icon.ico", to: "icon.ico" },
    ],
    signAndEditExecutable: true,
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    selectPerMachineByDefault: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: "Elitlig Stüdyo",
    uninstallDisplayName: "Elitlig Stüdyo",
    installerLanguages: ["tr_TR"],
    language: "1055",
    multiLanguageInstaller: false,
    runAfterFinish: true,
    deleteAppDataOnUninstall: false,
    artifactName: "Elitlig-Studyo-Setup-${version}.exe",
    installerIcon: "build/studio-icon.ico",
    uninstallerIcon: "build/studio-icon.ico",
    installerHeaderIcon: "build/studio-icon.ico",
  },
  linux: { target: ["dir"], icon: "build/studio-icon.png", category: "AudioVideo" },
  // Sürüm Elitlig Araçlar ile ortak.
  buildVersion: pkg.version,
};
