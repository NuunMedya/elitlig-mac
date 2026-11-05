// Arayüze açılan köprü. Arayüz Node'a ve ağa doğrudan erişemez; yalnız bu
// işlevleri kullanır. Jeton arayüze hiç verilmez.
"use strict";

const { contextBridge, ipcRenderer } = require("electron");

const on = (channel) => (callback) => {
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

// Yayın Stüdyosu parçaları: ArrayBuffer ya da Uint8Array (Blob değil: önce blob.arrayBuffer()).
const toBytes = (data) => (data instanceof ArrayBuffer ? new Uint8Array(data) : ArrayBuffer.isView(data) ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength) : null);

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
  // Talepler: özet (rozet) ana süreçte tutulur; socket "admin:requests" olayları buradan gelir.
  requests: {
    summary: () => ipcRenderer.invoke("requests:summary"),
    refresh: () => ipcRenderer.invoke("requests:refresh"),
    onSummary: on("requests:summary"),
    onChange: on("requests:changed"),
  },
  // Yayın Stüdyosu: ffmpeg ana süreçte; arayüz MediaRecorder parçalarını pushChunk ile yollar.
  studio: {
    info: () => ipcRenderer.invoke("studio:info"),
    mediaAccess: () => ipcRenderer.invoke("studio:mediaAccess"),
    requestMediaAccess: (kind) => ipcRenderer.invoke("studio:requestMediaAccess", kind),
    listScreens: () => ipcRenderer.invoke("studio:listScreens"),
    selectScreen: (id) => ipcRenderer.invoke("studio:selectScreen", id),
    start: (opts) => ipcRenderer.invoke("studio:start", opts),
    // Yanıtsız, sık çağrılır: ArrayBuffer ya da Uint8Array (Blob değil: önce blob.arrayBuffer()).
    pushChunk: (data) => {
      const bytes = toBytes(data);
      if (bytes && bytes.byteLength) ipcRenderer.send("studio:chunk", bytes);
    },
    stop: () => ipcRenderer.invoke("studio:stop"),
    onStatus: on("studio:status"),
    onRestartRecorder: on("studio:restartRecorder"),
    saveClip: (opts) => ipcRenderer.invoke("studio:saveClip", opts || {}),
    listClips: () => ipcRenderer.invoke("studio:listClips"),
    deleteClip: (name) => ipcRenderer.invoke("studio:deleteClip", name),
    uploadClip: (opts) => ipcRenderer.invoke("studio:uploadClip", opts || {}),
    revealClip: (name) => ipcRenderer.invoke("studio:revealClip", name),
    // Çok açılı kayıt: her kaynak (kamera vb.) için ayrı MediaRecorder akışı (Matroska/WebM).
    angles: {
      start: (opts) => ipcRenderer.invoke("studio:angles:start", opts || {}),
      pushChunk: (sourceId, data) => {
        const bytes = toBytes(data);
        if (bytes && bytes.byteLength) ipcRenderer.send("studio:angleChunk", { id: String(sourceId), data: bytes });
      },
      stop: (sourceId) => ipcRenderer.invoke("studio:angles:stop", sourceId ?? null),
      status: () => ipcRenderer.invoke("studio:angles:status"),
      onStatus: on("studio:angles:status"),
      onRestartRecorder: on("studio:angles:restartRecorder"),
    },
    // Tekrarlar: program + açılar aynı zaman penceresinden (userData/replays/<kimlik>/).
    saveReplay: (opts) => ipcRenderer.invoke("studio:saveReplay", opts || {}),
    listReplays: () => ipcRenderer.invoke("studio:listReplays"),
    getReplay: (id) => ipcRenderer.invoke("studio:getReplay", id),
    updateReplay: (id, patch) => ipcRenderer.invoke("studio:updateReplay", id, patch || {}),
    deleteReplay: (id) => ipcRenderer.invoke("studio:deleteReplay", id),
    revealReplay: (id, angle) => ipcRenderer.invoke("studio:revealReplay", id, angle || "program"),
    // Öne çıkanlar: ekran dışı canvas'ın MediaRecorder parçaları → H.264 MP4 (userData/highlights/).
    render: {
      start: (opts) => ipcRenderer.invoke("studio:render:start", opts || {}),
      pushChunk: (renderId, data) => {
        const bytes = toBytes(data);
        if (bytes && bytes.byteLength) ipcRenderer.send("studio:renderChunk", { id: String(renderId), data: bytes });
      },
      finish: (renderId) => ipcRenderer.invoke("studio:render:finish", renderId),
      cancel: (renderId) => ipcRenderer.invoke("studio:render:cancel", renderId),
      onProgress: on("studio:render:progress"),
    },
    uploadHighlight: (opts) => ipcRenderer.invoke("studio:uploadHighlight", opts || {}),
    deleteHighlight: (opts) => ipcRenderer.invoke("studio:deleteHighlight", opts || {}),
    onUploadProgress: on("studio:uploadProgress"),
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
