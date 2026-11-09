// Müzik çalar gizli penceresi (musichost.html) için en dar köprü: komut al, olay gönder.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("musicHost", {
  onCommand: (fn) => { ipcRenderer.on("musichost:cmd", (_e, msg) => { try { fn(msg); } catch { /* yoksay */ } }); },
  emit: (msg) => { if (msg && typeof msg === "object") ipcRenderer.send("musichost:event", msg); },
});
