// Arayüze açılan köprü. Arayüz Node'a ve ağa doğrudan erişemez; yalnız bu
// işlevleri kullanır. Jeton arayüze hiç verilmez.
"use strict";

const { contextBridge, ipcRenderer, webUtils } = require("electron");

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
    listScreens: (opts) => ipcRenderer.invoke("studio:listScreens", opts || {}),
    selectScreen: (id) => ipcRenderer.invoke("studio:selectScreen", id),
    // Kalıcı yerel dosyalar (video / görsel / ses kaynakları): dosyanın tam yolu ana süreçteki
    // izin listesine yazılır, elitlig-studio://media/<kimlik>/<ad> ile sunulur (yeniden açılışta da çalışır).
    // allowFile(File) → { id, url, path, name, type, sizeBytes } | null (yalnız kullanıcının seçtiği File'ın yolu vardır).
    // pick({ kind: "video" | "image" | "audio", multiple }) → { ok, files: [aynı biçim], canceled? }
    media: {
      allowFile: (file) => {
        let p = "";
        try { p = webUtils?.getPathForFile?.(file) || ""; } catch { p = ""; }
        return p ? ipcRenderer.invoke("studio:media:allow", p) : Promise.resolve(null);
      },
      pick: (opts) => ipcRenderer.invoke("studio:media:pick", opts || {}),
      check: (ids) => ipcRenderer.invoke("studio:media:check", Array.isArray(ids) ? ids : []),
      forget: (id) => ipcRenderer.invoke("studio:media:forget", id),
    },
    // Müzik çalar (app/studio/musichost.js): "Yayına da ver" için gizli müzik penceresi
    // (iki YouTube oynatıcısı), sesinin yakalanması, YouTube başlığı (oEmbed).
    music: {
      host: (msg) => ipcRenderer.invoke("studio:music:host", msg && typeof msg === "object" ? msg : {}),
      armCapture: (mode) => ipcRenderer.invoke("studio:music:armCapture", mode === "loopback" ? "loopback" : "frame"),
      capability: () => ipcRenderer.invoke("studio:music:capability"),
      oembed: (url) => ipcRenderer.invoke("studio:music:oembed", String(url || "")),
      onHostEvent: on("studio:music:hostEvent"),
    },
    // Canlı giriş kaynakları (app/studio/live): telefon kamerası (WebRTC sinyalleşme),
    // RTMP / SRT girişi ve ağ akışları (ffmpeg → fMP4 → MSE), web sayfası (ekran dışı pencere).
    live: {
      info: () => ipcRenderer.invoke("studio:live:info"),
      phone: {
        pair: (id, token, name) => ipcRenderer.invoke("studio:live:phone:pair", String(id), token ? String(token) : null, name ? String(name) : ""),
        unpair: (id) => ipcRenderer.invoke("studio:live:phone:unpair", String(id)),
        send: (id, msg) => { if (msg && typeof msg === "object") ipcRenderer.send("studio:live:phone:send", { id: String(id), msg }); },
        onSignal: on("studio:live:phone:signal"),
        onPresence: on("studio:live:phone:presence"),
      },
      feed: {
        start: (id, spec) => ipcRenderer.invoke("studio:live:feed:start", String(id), spec && typeof spec === "object" ? spec : {}),
        stop: (id) => ipcRenderer.invoke("studio:live:feed:stop", String(id)),
        transcode: (id) => ipcRenderer.invoke("studio:live:feed:transcode", String(id)),
        onData: on("studio:live:feed:data"),
        onStatus: on("studio:live:feed:status"),
      },
      web: {
        open: (id, spec) => ipcRenderer.invoke("studio:live:web:open", String(id), spec && typeof spec === "object" ? spec : {}),
        close: (id) => ipcRenderer.invoke("studio:live:web:close", String(id)),
        reload: (id) => ipcRenderer.invoke("studio:live:web:reload", String(id)),
        refresh: (id) => ipcRenderer.invoke("studio:live:web:refresh", String(id)),
        onFrame: on("studio:live:web:frame"),
        onStatus: on("studio:live:web:status"),
      },
    },
    start: (opts) => ipcRenderer.invoke("studio:start", opts),
    // Yanıtsız, sık çağrılır: ArrayBuffer ya da Uint8Array (Blob değil: önce blob.arrayBuffer()).
    pushChunk: (data) => {
      const bytes = toBytes(data);
      if (bytes && bytes.byteLength) ipcRenderer.send("studio:chunk", bytes);
    },
    stop: () => ipcRenderer.invoke("studio:stop"),
    // start({ …, backupUrl?, keepDisplayAwake? }) — backupUrl: yedek giriş adresi (YouTube backup ingest).
    // status: { state, message, rtmp, reconnects, ingest, sentKbps, lastError, network: { state, attempt, … } }
    onStatus: on("studio:status"),
    onRestartRecorder: on("studio:restartRecorder"),
    // Görüntü izi takıldı: kodlayıcı yeni başlıkla yeniden başlar (onRestartRecorder gelir).
    // options: { videoCopy: false } → kodlama yolu değişir (WebCodecs → eski yol).
    restartEncoder: (reason, options) => ipcRenderer.invoke("studio:restartEncoder", reason || null, options && typeof options === "object" ? { videoCopy: options.videoCopy } : null),
    // Arayüzün kodlama sayaçları (tanılama günlüğü); düz nesne.
    reportStats: (stats) => { if (stats && typeof stats === "object") ipcRenderer.send("studio:reportStats", stats); },
    // Yayın tanılama: { pipeline, encoder, fps, speed, sentKbps, relayPendingBytes, client: {…} } | null
    health: () => ipcRenderer.invoke("studio:health"),
    // Bağlantı testi: { endpoint?, ingestHost?, ingestPort? } → { ok, uploadKbps, rttMs, samples, error? }
    speedTest: (opts) => ipcRenderer.invoke("studio:speedTest", opts && typeof opts === "object" ? { endpoint: opts.endpoint, ingestHost: opts.ingestHost, ingestPort: opts.ingestPort } : {}),
    network: () => ipcRenderer.invoke("studio:network"),
    saveClip: (opts) => ipcRenderer.invoke("studio:saveClip", opts || {}),
    listClips: () => ipcRenderer.invoke("studio:listClips"),
    deleteClip: (name) => ipcRenderer.invoke("studio:deleteClip", name),
    uploadClip: (opts) => ipcRenderer.invoke("studio:uploadClip", opts || {}),
    // [gol-klip] yayın öncelikli yükleme: { kbps, paused } · { reset: true } · { cancel: true } · null → durum
    uploadThrottle: (opts) => ipcRenderer.invoke("studio:uploadThrottle", opts ?? null),
    revealClip: (name) => ipcRenderer.invoke("studio:revealClip", name),
    // Çok açılı kayıt: her kaynak (kamera vb.) için ayrı MediaRecorder akışı (Matroska/WebM).
    // sources: [{ id, name, width, height, fps, mimeType }] — mimeType H.264 ise
    // ("video/x-matroska;codecs=avc1", 1 sn'de bir anahtar kare) ffmpeg yeniden kodlamaz (kopya).
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
    // { kind: "highlight" | "interview", matchId, loaded, total }
    onUploadProgress: on("studio:uploadProgress"),
    // Yayın sağlığı: oturum günlüğü (userData/logs/studio-<zaman>.log) ve son hatalar.
    // → { logPath, lastErrors, ffmpegErrors, truncated, uploads: [Yükleme günlüğü, en yeni önce], uploadLogPath }
    diagnostics: () => ipcRenderer.invoke("studio:diagnostics"),
    clearUploadLog: () => ipcRenderer.invoke("studio:clearUploadLog"),
    revealDiagnostics: () => ipcRenderer.invoke("studio:revealDiagnostics"),
    // Yerel tam kayıt: start({ …, localRecord: { enabled, dir?, videoBitrateKbps?, height?, fps?, allowSoftware? } });
    // kalite yayından farklıysa ikinci kodlayıcı (yalnız donanım kodlayıcıda; info().localQuality.supported).
    // start → { …, localQuality: { separate, width, height, fps, videoBitrateKbps } | { separate: false, reason, message } }
    // klasör seçimi hatırlanır.
    recordDir: () => ipcRenderer.invoke("studio:recordDir"),
    chooseRecordDir: () => ipcRenderer.invoke("studio:chooseRecordDir"),
    revealLocal: (path) => ipcRenderer.invoke("studio:revealLocal", path || null),
    onLocalRecord: on("studio:localRecord"),
    // Röportaj: program parçaları o andan sabitlenir; stop → MP4 (userData/interviews/).
    interview: {
      start: (opts) => ipcRenderer.invoke("studio:interview:start", opts || {}),
      stop: (id) => ipcRenderer.invoke("studio:interview:stop", id),
      status: () => ipcRenderer.invoke("studio:interview:status"),
      list: () => ipcRenderer.invoke("studio:interview:list"),
      delete: (name) => ipcRenderer.invoke("studio:interview:delete", name),
      reveal: (name) => ipcRenderer.invoke("studio:interview:reveal", name),
      upload: (opts) => ipcRenderer.invoke("studio:interview:upload", opts || {}),
      onStatus: on("studio:interview:status"),
    },
    // LED çıkışı: ikinci ekranda tam ekran pencere (web: elitlig.com/led/<maç>; studio: #led-output).
    displays: () => ipcRenderer.invoke("studio:displays"),
    onDisplaysChanged: on("studio:displays:changed"),
    led: {
      open: (opts) => ipcRenderer.invoke("studio:led:open", opts || {}),
      close: () => ipcRenderer.invoke("studio:led:close"),
      status: () => ipcRenderer.invoke("studio:led:status"),
      onStatus: on("studio:led:status"),
      // Stüdyo → LED (yanıtsız); LED penceresi onState ile alır, açılışta getState ile son durumu ister.
      sendState: (state) => ipcRenderer.send("studio:led:sendState", state ?? null),
      getState: () => ipcRenderer.invoke("studio:led:getState"),
      onState: on("studio:led:state"),
    },
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
