// Mesajlar: ana süreçteki gerçek-zaman bağlantısı.
//
// Socket.IO bağlantısı ana süreçte açılır; jeton arayüze verilmez. Sunucunun
// sohbet olayları (chat:message, chat:conversation, chat:read, chat:typing,
// chat:deleted, chat:updated) IPC ile arayüze iletilir; arayüzden gelen
// "yazıyor" ve "okundu" olayları socket'e yazılır.
//
//   - Kopunca socket.io kendi üstel geri çekilmesiyle yeniden bağlanır
//     (1 sn → 30 sn, rastgele dağıtılmış). Bağlantı yokken sohbet listesi
//     belirli aralıkla REST'ten okunur (yoklama) ve arayüze "chat:poll"
//     gönderilir; yeni gelen mesajlar bu karşılaştırmayla da yakalanır.
//   - Sohbet listesinin anlık görüntüsü okunmamış toplamını (kenar çubuğu,
//     Dock rozeti, menü çubuğu) ve sessize alınan sohbetleri verir.
//   - Gelen mesaj (benim değilse, sistem satırı değilse) onIncoming ile
//     bildirilir; bildirim kararını main.js verir.
"use strict";

const { EventEmitter } = require("node:events");

const FORWARDED_EVENTS = ["chat:message", "chat:conversation", "chat:read", "chat:typing", "chat:deleted", "chat:updated", "call:incoming", "call:ended"];
const EMITTABLE = new Set(["chat:typing", "chat:read"]);
const POLL_MS = 15000;
const DRIFT_MS = 120000;

/** Okunmamış toplamı: okunmamış mesajlar + "okunmadı" işaretli sohbetler (1 sayılır). */
const unreadTotal = (list) => (list || []).reduce((s, c) => s + (Number(c.unread) > 0 ? Number(c.unread) : c.marked_unread ? 1 : 0), 0);

/** Önceki anlık görüntüye göre yeni gelen son mesajlar (yoklama modunda bildirim için). */
function diffIncoming(prev, next) {
  if (!prev) return [];
  const out = [];
  for (const c of next || []) {
    const m = c.last_message;
    if (!m || !m.id || m.sender?.is_me || m.kind === "system" || m.deleted) continue;
    const known = prev.get(Number(c.id));
    if (known === undefined ? Number(c.unread) > 0 : Number(m.id) > known) out.push({ conversation: c, message: m });
  }
  return out;
}

/**
 * multipart/form-data gövdesi (tek dosya alanı). Electron'un net.fetch'i
 * FormData'yı her sürümde taşımadığından gövde elle kurulur.
 */
function buildMultipart(field, filename, mime, data, boundary = `----elitlig${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`) {
  const safe = String(filename || "dosya").replace(/["\r\n]/g, "_");
  const head = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${field}"; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(safe)}\r\nContent-Type: ${mime || "application/octet-stream"}\r\n\r\n`, "utf8");
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`, "utf8");
  return { body: Buffer.concat([head, Buffer.from(data), tail]), contentType: `multipart/form-data; boundary=${boundary}` };
}

const MIME = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp", heic: "image/heic", heif: "image/heif",
  pdf: "application/pdf", doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", csv: "text/csv",
  ppt: "application/vnd.ms-powerpoint", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain", zip: "application/zip", rar: "application/vnd.rar", mp4: "video/mp4", mov: "video/quicktime",
  m4a: "audio/mp4", mp3: "audio/mpeg", webm: "audio/webm", ogg: "audio/ogg",
};
const mimeOf = (name) => MIME[String(name || "").split(".").pop().toLowerCase()] || "application/octet-stream";

function createChatLink({ origin, getToken, ioFactory, api, userAgent, isSignedIn = () => true, timers = { setInterval, clearInterval, setTimeout, clearTimeout }, pollMs = POLL_MS }) {
  const events = new EventEmitter();
  let socket = null;
  let state = "off"; // off | connecting | connected
  let snapshot = null; // Map(conversationId → last message id)
  let conversations = [];
  let unread = 0;
  let active = null;
  let pollTimer = null;
  let driftTimer = null;
  let refreshTimer = null;
  let refreshing = null;

  const setState = (next) => {
    if (state === next) return;
    state = next;
    events.emit("status", { state, unread });
    schedulePolling();
  };

  const muted = (id) => Boolean(conversations.find((c) => Number(c.id) === Number(id))?.muted);
  const conversation = (id) => conversations.find((c) => Number(c.id) === Number(id)) || null;

  /** Sohbet listesini okur; okunmamış toplamını ve yoklamadaki yeni mesajları çıkarır. */
  function refresh({ detect = state !== "connected" } = {}) {
    if (!isSignedIn()) return Promise.resolve(null);
    if (refreshing) return refreshing;
    refreshing = (async () => {
      const res = await api.request({ path: "/api/chat/conversations" });
      if (!res.ok || !Array.isArray(res.data?.conversations)) return null;
      const list = res.data.conversations;
      const incoming = detect ? diffIncoming(snapshot, list) : [];
      conversations = list;
      snapshot = new Map(list.map((c) => [Number(c.id), Number(c.last_message?.id) || 0]));
      const total = unreadTotal(list);
      if (total !== unread) { unread = total; events.emit("unread", unread); }
      if (!res.offline) incoming.forEach((item) => events.emit("incoming", { ...item, muted: Boolean(item.conversation.muted), source: "poll" }));
      return list;
    })().finally(() => { refreshing = null; });
    return refreshing;
  }

  const refreshSoon = (ms = 1200) => {
    if (refreshTimer) timers.clearTimeout(refreshTimer);
    refreshTimer = timers.setTimeout(() => { refreshTimer = null; refresh({ detect: false }); }, ms);
  };

  function schedulePolling() {
    if (pollTimer) { timers.clearInterval(pollTimer); pollTimer = null; }
    if (state === "off" && !isSignedIn()) return;
    if (state !== "connected") {
      // Socket yokken: liste yoklanır, arayüz açık sohbeti tazeler.
      pollTimer = timers.setInterval(async () => {
        if (!isSignedIn()) return;
        await refresh({ detect: true });
        events.emit("event", { name: "chat:poll", payload: { at: Date.now() } });
      }, pollMs);
    }
  }

  function onSocketEvent(name, payload) {
    events.emit("event", { name, payload });
    if (name === "chat:message" && payload?.message) {
      const m = payload.message;
      const id = Number(payload.conversation_id);
      if (snapshot && m.id) snapshot.set(id, Math.max(snapshot.get(id) || 0, Number(m.id)));
      if (!m.sender?.is_me && m.kind !== "system") {
        const conv = conversation(id);
        events.emit("incoming", { conversation: conv || { id, title: m.sender?.name || "Mesaj", type: "direct" }, message: m, muted: muted(id), source: "socket" });
        if (Number(active) !== id) { unread += 1; events.emit("unread", unread); }
      }
      refreshSoon(conversation(id) ? 2500 : 600);
    } else if (name === "chat:conversation" || name === "chat:deleted") refreshSoon();
  }

  function connect() {
    if (socket || !isSignedIn()) return;
    setState("connecting");
    socket = ioFactory(origin, {
      path: "/socket.io",
      transports: ["websocket", "polling"],
      auth: (cb) => cb({ token: getToken() }),
      extraHeaders: { "User-Agent": userAgent || "ElitligDesktop", "X-Client-Platform": "desktop" },
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30000,
      randomizationFactor: 0.5,
      timeout: 10000,
    });
    // Kimlik doğrulanınca sunucu "chat:ready" yollar; yalnız bağlanmak yetmez
    // (jetonsuz bağlantılar da kabul edilir ama sohbet olayı almaz).
    socket.on("chat:ready", () => { setState("connected"); refresh({ detect: true }); api.flush?.(); });
    socket.on("disconnect", () => setState("connecting"));
    socket.on("connect_error", () => setState("connecting"));
    FORWARDED_EVENTS.forEach((name) => socket.on(name, (payload) => onSocketEvent(name, payload)));
    if (!driftTimer) driftTimer = timers.setInterval(() => refresh({ detect: false }), DRIFT_MS);
    refresh({ detect: false });
  }

  function disconnect() {
    if (socket) { try { socket.removeAllListeners?.(); socket.disconnect(); } catch { /* yoksay */ } }
    socket = null;
    if (driftTimer) { timers.clearInterval(driftTimer); driftTimer = null; }
    if (pollTimer) { timers.clearInterval(pollTimer); pollTimer = null; }
    snapshot = null;
    conversations = [];
    unread = 0;
    state = "off";
    events.emit("status", { state, unread });
    events.emit("unread", 0);
  }

  /** Uyku dönüşü / ağ değişimi: hemen yeniden dene. */
  function kick() {
    if (!isSignedIn()) return;
    if (!socket) return connect();
    if (state !== "connected") { try { socket.connect(); } catch { /* yoksay */ } }
    refresh({ detect: true });
  }

  function emit(name, payload) {
    if (!EMITTABLE.has(name)) return { ok: false, error: "Bu olay gönderilemez." };
    if (!socket || state !== "connected") return { ok: false, offline: true };
    socket.emit(name, payload || {});
    return { ok: true };
  }

  return {
    events,
    connect,
    disconnect,
    kick,
    emit,
    refresh,
    refreshSoon,
    setActive: (id) => { active = id ? Number(id) : null; },
    active: () => active,
    status: () => ({ state, unread }),
    unread: () => unread,
    isMuted: muted,
    conversation,
  };
}

module.exports = { createChatLink, diffIncoming, unreadTotal, buildMultipart, mimeOf, FORWARDED_EVENTS };
