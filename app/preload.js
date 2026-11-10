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
      playlist: (listId) => ipcRenderer.invoke("studio:music:playlist", String(listId || "")),
      onHostEvent: on("studio:music:hostEvent"),
    },
    // Dışarı giden tüm sesleri kapat (app/studio/outmute.js): bütün pencerelerin hoparlör çıkışı.
    outMute: {
      set: (on) => ipcRenderer.invoke("studio:outMute:set", Boolean(on)),
      get: () => ipcRenderer.invoke("studio:outMute:get"),
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
  // Dosya Araçları (app/fileTools): dosyalar yolla izin listesine alınır, işler ana süreçte
  // (ffmpeg, sips, ZIP, PDF) ya da arayüzde (canvas; çıktı client.file ile yazılır).
  fileTools: {
    // File dizisi (sürükle-bırak, <input type=file>) → izin listesindeki girdiler. FileList
    // contextBridge'den geçerken File kimliğini yitirir: çağıran Array.from(...) vermeli.
    addFiles: (list) => {
      const paths = [];
      for (const f of Array.from(list || [])) {
        try { const p = webUtils?.getPathForFile?.(f); if (p) paths.push(p); } catch { /* yolu olmayan File */ }
      }
      return paths.length ? ipcRenderer.invoke("ft:allow", paths) : Promise.resolve({ ok: false, files: [], error: { message: "Dosya yolu okunamadı." } });
    },
    pick: (opts) => ipcRenderer.invoke("ft:pick", opts || {}),
    paste: () => ipcRenderer.invoke("ft:paste"),
    capabilities: () => ipcRenderer.invoke("ft:capabilities"),
    probe: (id) => ipcRenderer.invoke("ft:probe", String(id || "")),
    decode: (id) => ipcRenderer.invoke("ft:decode", String(id || "")),
    pdfInfo: (id) => ipcRenderer.invoke("ft:pdfInfo", String(id || "")),
    qr: (id) => ipcRenderer.invoke("ft:qr", String(id || "")),
    textInfo: (id) => ipcRenderer.invoke("ft:textInfo", String(id || "")),
    run: (spec) => ipcRenderer.invoke("ft:run", spec && typeof spec === "object" ? spec : {}),
    cancel: (id) => ipcRenderer.invoke("ft:cancel", String(id || "")),
    jobs: () => ipcRenderer.invoke("ft:jobs"),
    outputs: (jobId) => ipcRenderer.invoke("ft:outputs", String(jobId || "")),
    removeJob: (id) => ipcRenderer.invoke("ft:removeJob", String(id || "")),
    clearLibrary: () => ipcRenderer.invoke("ft:clearLibrary"),
    client: {
      start: (spec) => ipcRenderer.invoke("ft:client:start", spec && typeof spec === "object" ? spec : {}),
      file: (jobId, file) => ipcRenderer.invoke("ft:client:file", String(jobId || ""), { name: file?.name, ext: file?.ext, progress: file?.progress, bytes: toBytes(file?.bytes) }),
      done: (jobId, result) => ipcRenderer.invoke("ft:client:done", String(jobId || ""), result && typeof result === "object" ? result : {}),
    },
    reveal: (p) => ipcRenderer.invoke("ft:reveal", String(p || "")),
    openPath: (p) => ipcRenderer.invoke("ft:openPath", String(p || "")),
    preview: (p) => ipcRenderer.invoke("ft:preview", String(p || "")),
    copyPaths: (paths) => ipcRenderer.invoke("ft:copyPaths", Array.isArray(paths) ? paths.map(String) : []),
    settings: () => ipcRenderer.invoke("ft:settings"),
    setSettings: (patch) => ipcRenderer.invoke("ft:setSettings", patch && typeof patch === "object" ? patch : {}),
    chooseOutDir: () => ipcRenderer.invoke("ft:chooseOutDir"),
    // dragstart içinde çağrılır (e.preventDefault() ile): dosyalar başka uygulamaya taşınır.
    startDrag: (paths) => ipcRenderer.send("ft:drag", Array.isArray(paths) ? paths.map(String) : []),
    // yt-dlp (Bağlantıdan indir): durum, indir / güncelle, başka ikili seç, varsayılan.
    ytdlp: {
      status: () => ipcRenderer.invoke("ft:ytdlp:status"),
      update: () => ipcRenderer.invoke("ft:ytdlp:update"),
      choose: () => ipcRenderer.invoke("ft:ytdlp:choose"),
      reset: () => ipcRenderer.invoke("ft:ytdlp:reset"),
      onProgress: on("ft:ytdlp:progress"),
    },
    clipboardLink: () => ipcRenderer.invoke("ft:clipboardLink"),
    onJob: on("ft:job"),
    onLibrary: on("ft:library"),
    onSelect: on("ft:select"),
  },
  // Float rafı: dosya referansları (orijinaller taşınmaz / silinmez).
  float: {
    show: () => ipcRenderer.invoke("float:show"),
    hide: () => ipcRenderer.invoke("float:hide"),
    list: () => ipcRenderer.invoke("float:list"),
    add: (paths) => ipcRenderer.invoke("float:add", Array.isArray(paths) ? paths.map(String) : []),
    remove: (paths) => ipcRenderer.invoke("float:remove", Array.isArray(paths) ? paths.map(String) : []),
    clear: () => ipcRenderer.invoke("float:clear"),
    expand: (on) => ipcRenderer.invoke("float:expand", Boolean(on)),
    openMain: (ids) => ipcRenderer.invoke("float:openMain", Array.isArray(ids) ? ids.map(String) : []),
    onChange: on("float:changed"),
  },
  // Ekran Görüntüleri ve Pano rafı (app/shelf). show(): raflar penceresi (⌃⌥T ile aynı).
  shelf: {
    list: (filter, page) => ipcRenderer.invoke("shelf:list", filter || {}, page || {}),
    get: (id) => ipcRenderer.invoke("shelf:get", String(id || "")),
    update: (id, patch) => ipcRenderer.invoke("shelf:update", String(id || ""), patch || {}),
    updateMany: (ids, patch) => ipcRenderer.invoke("shelf:updateMany", Array.isArray(ids) ? ids.map(String) : [], patch || {}),
    takeDown: (ids) => ipcRenderer.invoke("shelf:takeDown", Array.isArray(ids) ? ids.map(String) : []),
    undo: () => ipcRenderer.invoke("shelf:undo"),
    trash: (ids) => ipcRenderer.invoke("shelf:trash", Array.isArray(ids) ? ids.map(String) : []),
    restore: (ids) => ipcRenderer.invoke("shelf:restore", Array.isArray(ids) ? ids.map(String) : []),
    purge: (ids) => ipcRenderer.invoke("shelf:purge", Array.isArray(ids) ? ids.map(String) : []),
    emptyTrash: () => ipcRenderer.invoke("shelf:emptyTrash"),
    copy: (ids, opts) => ipcRenderer.invoke("shelf:copy", Array.isArray(ids) ? ids.map(String) : [], { close: Boolean(opts?.close) }),
    addNote: (note) => ipcRenderer.invoke("shelf:addNote", { text: String(note?.text || ""), title: String(note?.title || "") }),
    importFiles: (list) => {
      const paths = [];
      for (const f of Array.from(list || [])) {
        try { const p = webUtils?.getPathForFile?.(f); if (p) paths.push(p); } catch { /* yoksay */ }
      }
      return ipcRenderer.invoke("shelf:importFiles", paths);
    },
    importImage: (bytes) => ipcRenderer.invoke("shelf:importImage", toBytes(bytes)),
    saveEdit: (id, bytes) => ipcRenderer.invoke("shelf:saveEdit", String(id || ""), toBytes(bytes)),
    revertEdit: (id) => ipcRenderer.invoke("shelf:revertEdit", String(id || "")),
    export: (ids) => ipcRenderer.invoke("shelf:export", Array.isArray(ids) ? ids.map(String) : []),
    startDrag: (ids) => ipcRenderer.send("shelf:drag", Array.isArray(ids) ? ids.map(String) : []),
    capture: () => ipcRenderer.invoke("shelf:capture"),
    show: (opts) => ipcRenderer.invoke("shelf:show", { search: Boolean(opts?.search), shelf: opts?.shelf || null }),
    hide: (opts) => ipcRenderer.invoke("shelf:hide", { returnFocus: opts?.returnFocus !== false }),
    hold: (on) => ipcRenderer.invoke("shelf:hold", Boolean(on)),
    openLibrary: (arg) => ipcRenderer.invoke("shelf:openLibrary", arg ? String(arg) : null),
    openLink: (id) => ipcRenderer.invoke("shelf:openLink", String(id || "")),
    reveal: (id) => ipcRenderer.invoke("shelf:reveal", String(id || "")),
    enrich: (id) => ipcRenderer.invoke("shelf:enrich", String(id || "")),
    folderCreate: (name, parentId) => ipcRenderer.invoke("shelf:folderCreate", String(name || ""), parentId || null),
    folderRename: (id, name) => ipcRenderer.invoke("shelf:folderRename", String(id || ""), String(name || "")),
    folderMove: (id, parentId) => ipcRenderer.invoke("shelf:folderMove", String(id || ""), parentId || null),
    folderDelete: (id) => ipcRenderer.invoke("shelf:folderDelete", String(id || "")),
    settings: () => ipcRenderer.invoke("shelf:settings"),
    setSettings: (patch) => ipcRenderer.invoke("shelf:setSettings", patch && typeof patch === "object" ? patch : {}),
    addDir: () => ipcRenderer.invoke("shelf:addDir"),
    importRecent: (days) => ipcRenderer.invoke("shelf:importRecent", Number(days) || 7),
    onChange: on("shelf:changed"),
    onOpen: on("shelf:open"),
    onNotice: on("shelf:notice"),
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
  // Masaüstü araç takımı (app/toolkit.js): pencere düzeni, panel, kısayol ayarları, uyanık tut, kur.
  deskkit: {
    settings: () => ipcRenderer.invoke("deskkit:settings"),
    setSettings: (patch) => ipcRenderer.invoke("deskkit:settings:set", patch && typeof patch === "object" ? patch : {}),
    layout: (key) => ipcRenderer.invoke("deskkit:layout", String(key || "")),
    permission: () => ipcRenderer.invoke("deskkit:permission"),
    requestPermission: () => ipcRenderer.invoke("deskkit:permission:request"),
    openPermission: (kind) => ipcRenderer.invoke("deskkit:permission:open", kind === "automation" ? "automation" : "accessibility"),
    showPanel: (tab) => ipcRenderer.invoke("deskkit:panel:show", tab ? String(tab) : null),
    hidePanel: () => ipcRenderer.invoke("deskkit:panel:hide"),
    pinPanel: (on) => ipcRenderer.invoke("deskkit:panel:pin", Boolean(on)),
    suspendShortcuts: (on) => ipcRenderer.invoke("deskkit:shortcuts:suspend", Boolean(on)),
    awake: () => ipcRenderer.invoke("deskkit:awake"),
    setAwake: (opts) => ipcRenderer.invoke("deskkit:awake:set", opts && typeof opts === "object" ? { on: Boolean(opts.on), minutes: Number(opts.minutes) || null } : { on: false }),
    rates: (force) => ipcRenderer.invoke("deskkit:rates", Boolean(force)),
    // Pano / ekran görüntüsü kütüphanesi ("files" aracı) penceresi; yoksa hata döner.
    openShelf: () => ipcRenderer.invoke("shelf:show"),
    onSettings: on("deskkit:settings"),
    onAwake: on("deskkit:awake"),
    onPanelOpen: on("deskkit:panel:open"),
  },
  // Masaüstü widget'ları (app/widgets): galeri, ekle / kaldır / ayarla, veri kaynakları.
  widgets: {
    state: () => ipcRenderer.invoke("widgets:state"),
    add: (type, options, size) => ipcRenderer.invoke("widgets:add", String(type || ""), options && typeof options === "object" ? options : {}, typeof size === "string" ? size.slice(0, 10) : undefined),
    update: (id, patch) => ipcRenderer.invoke("widgets:update", String(id || ""), patch && typeof patch === "object" ? patch : {}),
    remove: (id) => ipcRenderer.invoke("widgets:remove", String(id || "")),
    setVisible: (on) => ipcRenderer.invoke("widgets:visible", Boolean(on)),
    toggle: () => ipcRenderer.invoke("widgets:toggle"),
    setTheme: (theme) => ipcRenderer.invoke("widgets:theme", String(theme || "")),
    self: () => ipcRenderer.invoke("widgets:self"),
    menu: () => ipcRenderer.invoke("widgets:menu"),
    system: () => ipcRenderer.invoke("widgets:system"),
    weather: (city) => ipcRenderer.invoke("widgets:weather", String(city || "")),
    matches: (opts) => ipcRenderer.invoke("widgets:matches", { city: String(opts?.city || "") }),
    rates: (force) => ipcRenderer.invoke("widgets:rates", Boolean(force)),
    open: (route) => ipcRenderer.invoke("widgets:open", route ? String(route) : null),
    // Yeni widget verileri: canlı maç, puan durumu (herkese açık API), Yayın Stüdyosu durumu.
    match: (id) => ipcRenderer.invoke("widgets:match", Number(id) || 0),
    leagues: () => ipcRenderer.invoke("widgets:leagues"),
    standings: (opts) => ipcRenderer.invoke("widgets:standings", { leagueId: Number(opts?.leagueId) || 0, seasonId: Number(opts?.seasonId) || 0 }),
    studio: () => ipcRenderer.invoke("widgets:studio"),
    // macOS widget mantığı: düzenleme kipi, genel ayarlar (ızgara, soluk görünüm, malzeme, girişte başlat),
    // masaüstü katmanında yazı alanı için geçici odak.
    edit: (on) => ipcRenderer.invoke("widgets:edit", on == null ? null : Boolean(on)),
    settings: (patch) => ipcRenderer.invoke("widgets:settings", patch && typeof patch === "object" ? patch : {}),
    focus: () => ipcRenderer.invoke("widgets:focus"),
    focusable: (on) => ipcRenderer.invoke("widgets:focusable", Boolean(on)),
    onChange: on("widgets:changed"),
    onConfig: on("widget:config"),
    onSettings: on("widget:settings"),
  },
  // Uygulama geneli müzik çalar: çalar ana pencerede yaşar; panel ve menü çubuğu komut yollar.
  music: {
    publish: (state) => { if (state && typeof state === "object") ipcRenderer.send("music:publish", state); },
    command: (name, args) => ipcRenderer.invoke("music:command", String(name || ""), args && typeof args === "object" ? args : {}),
    state: () => ipcRenderer.invoke("music:state"),
    onState: on("music:state"),
    onCommand: on("music:command"),
  },
  // Yönetim (app/adminPanel): gömülü elitlig.com yönetim paneli. Jeton arayüze verilmez;
  // ana süreç paneli kendi oturum bölmesinde açar, arayüz yalnız konumunu ve komutları yollar.
  admin: {
    nav: () => ipcRenderer.invoke("admin:nav"),
    state: () => ipcRenderer.invoke("admin:state"),
    attach: (bounds) => ipcRenderer.invoke("admin:attach", bounds || null),
    bounds: (bounds) => ipcRenderer.invoke("admin:bounds", bounds || null),
    detach: () => ipcRenderer.invoke("admin:detach"),
    cover: (on) => ipcRenderer.invoke("admin:cover", Boolean(on)),
    go: (path) => ipcRenderer.invoke("admin:go", String(path || "")),
    command: (name, arg) => ipcRenderer.invoke("admin:command", String(name || ""), arg ?? null),
    pdf: () => ipcRenderer.invoke("admin:pdf"),
    downloads: () => ipcRenderer.invoke("admin:downloads"),
    download: (id, action) => ipcRenderer.invoke("admin:download", { id: String(id || ""), action: String(action || "") }),
    prefs: (patch) => ipcRenderer.invoke("admin:prefs", patch && typeof patch === "object" ? patch : null),
    onState: on("admin:state"),
    onNav: on("admin:nav"),
    onDownloads: on("admin:downloads"),
    onFocus: on("admin:focus"),
  },
  // Hızlı geçiş (app/launcher, ⌃⌥O): araç aç, yeni kayıt, Dock / atlama listesi ile aynı liste.
  launcher: {
    state: () => ipcRenderer.invoke("launcher:state"),
    open: (route, arg) => ipcRenderer.invoke("launcher:open", String(route || ""), arg && typeof arg === "object" ? arg : null),
    action: (id) => ipcRenderer.invoke("launcher:action", String(id || "")),
    show: (query) => ipcRenderer.invoke("launcher:show", typeof query === "string" ? query : ""),
    hide: () => ipcRenderer.invoke("launcher:hide"),
    onOpen: on("launcher:open"),
  },
  onNavigate: on("navigate"),
  onCommand: on("command"),
  onTheme: on("theme"),
});
