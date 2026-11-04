// Arayüze açılan köprü. Arayüz Node'a ve ağa doğrudan erişemez; yalnız bu
// işlevleri kullanır. Jeton arayüze hiç verilmez.
"use strict";

const { contextBridge, ipcRenderer } = require("electron");

const on = (channel) => (callback) => {
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

contextBridge.exposeInMainWorld("elitlig", {
  platform: process.platform,
  auth: {
    state: () => ipcRenderer.invoke("auth:state"),
    login: (username, password) => ipcRenderer.invoke("auth:login", { username, password }),
    logout: () => ipcRenderer.invoke("auth:logout"),
    onChange: on("auth:changed"),
  },
  request: (opts) => ipcRenderer.invoke("api:request", opts),
  onDataChanged: on("data:changed"),
  sync: {
    status: () => ipcRenderer.invoke("sync:status"),
    flush: () => ipcRenderer.invoke("sync:flush"),
    onStatus: on("sync:status"),
    onDone: on("sync:done"),
  },
  focus: {
    state: () => ipcRenderer.invoke("focus:state"),
    command: (name, args) => ipcRenderer.invoke("focus:command", name, args),
    onState: on("focus:state"),
  },
  files: {
    save: (name, data, filters) => ipcRenderer.invoke("file:save", { name, data, filters }),
    open: (filters) => ipcRenderer.invoke("file:open", { filters }),
    reveal: (path) => ipcRenderer.invoke("file:reveal", path),
  },
  // Mesajlar: socket ana süreçte; olaylar buradan gelir, ekler buradan yüklenir.
  chat: {
    status: () => ipcRenderer.invoke("chat:status"),
    refresh: () => ipcRenderer.invoke("chat:refresh"),
    onEvent: on("chat:event"),
    onStatus: on("chat:status"),
    onUnread: on("chat:unread"),
    emit: (name, payload) => ipcRenderer.invoke("chat:emit", { name, payload }),
    setActive: (conversationId) => ipcRenderer.invoke("chat:active", conversationId || null),
    pending: () => ipcRenderer.invoke("chat:pending"),
    upload: (kind, file) => ipcRenderer.invoke("chat:upload", { kind, name: file.name, mime: file.mime, data: file.data }),
    pick: (options) => ipcRenderer.invoke("chat:pick", options || {}),
    download: (url, name) => ipcRenderer.invoke("chat:download", { url, name }),
    openFile: (url, name) => ipcRenderer.invoke("chat:openFile", { url, name }),
  },
  print: (html, title) => ipcRenderer.invoke("print:html", { html, title }),
  pdf: (html, title, options = {}) => ipcRenderer.invoke("print:html", { html, title, pdf: options }),
  app: {
    info: () => ipcRenderer.invoke("app:info"),
    openExternal: (url) => ipcRenderer.invoke("app:openExternal", url),
    openWeb: (pathname) => ipcRenderer.invoke("app:openWeb", pathname),
    notify: (title, body) => ipcRenderer.invoke("app:notify", { title, body }),
    focused: () => ipcRenderer.invoke("app:focused"),
    showMain: (route) => ipcRenderer.invoke("app:showMain", route),
  },
  quick: {
    hide: () => ipcRenderer.invoke("quick:hide"),
    show: (kind) => ipcRenderer.invoke("quick:show", kind),
    onOpen: on("quick:open"),
  },
  onNavigate: on("navigate"),
  onCommand: on("command"),
  onTheme: on("theme"),
});
