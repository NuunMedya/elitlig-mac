// Siteye yalnız masaüstü uygulamasında olunduğunu bildirir. Site bu nesneyi
// görünce yönetim menüsünde yalnız Araçlar'ı gösterir (elitlig-client
// src/utils/desktopApp.js). Node erişimi verilmez.
"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("elitligDesktop", {
  platform: process.platform,
  version: ipcRenderer.sendSync("elitlig:version"),
  retry: () => ipcRenderer.send("elitlig:retry"),
});
