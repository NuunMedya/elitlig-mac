// Elitlig API istemcisi (ana süreç).
//
// Arayüz sunucuya hiçbir zaman doğrudan bağlanmaz; tüm istekler buradan geçer.
// Böylece jeton arayüze verilmez ve uygulama çevrimdışı çalışabilir:
//   - Başarılı her GET yanıtı diske yazılır. Bağlantı yokken aynı istek
//     önbellekten yanıtlanır (offline: true, savedAt).
//   - Bağlantı yokken yapılan yazma işlemleri (not, görev, etkinlik, muhasebe
//     kaydı, kişi; projelerde arama sonucu, not, soru-cevap, adım/kişi
//     güncellemesi; hesap hareketi ve proje bütçe kalemi ekleme / ödendi
//     yapma) kuyruğa alınır ve bağlantı gelince sırayla gönderilir.
//     Çevrimdışı oluşturulan kaydın geçici kimliği ("tmp_…") gönderim sırasında
//     sunucunun verdiği gerçek kimlikle değiştirilir.
//   - Mesajlar: çevrimdışı yazılan metin mesajı kuyruğa alınır (client_id ile).
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { EventEmitter } = require("node:events");

const QUEUEABLE = /^\/api\/(tools\/(notes|events|ledger|contacts)|todos)(\/[\w-]+)?$/;
// Projeler: sahada en çok yapılan, sırası önemsiz ve kimliğe bağımlı olmayan
// yazmalar kuyruğa alınır: iletişim kaydı (arama sonucu, not), soru ekleme ve
// cevaplama, adımın ve kişinin alan güncellemesi. Proje, aşama, adım ve kişi
// oluşturma / silme bağlantı ister (sıra ve kimlikler sunucuda belirlenir).
// Saha ve maç planlama (/api/match-requests/admin: saat, havuz, kart, görüşme
// kaydı ve düzenlemesi, maç oluşturma) kuyruğa alınmaz: saat ve kart durumları
// sunucuda birbirine bağlıdır, maç sitede oluşur; bu işlemler çevrimdışıyken
// açık hata verir. Okumalar (program, talepler, takım listeleri) önbellekten gelir.
const PROJECT_QUEUEABLE = /^\/api\/tools\/projects\/\d+\/(activities|questions(\/[\w-]+)?|(steps|leads)\/\d+)$/;
// Gelir / gider kayıtları: hesap hareketi ve proje bütçe kalemi ekleme ve
// güncelleme (ör. "Ödendi" yapma) kuyruğa alınır; çevrimdışı eklenen kaydın
// geçici kimliği sonraki düzenlemede eşlenir. Yetki sunucuda gönderim sırasında
// denetlenir (yetkisizse kayıt "gönderilemedi" listesine düşer). Kayıt silme,
// hesap / virman / yetki değişikliği, görüşme kapanışı ve rehberden aktarma
// bağlantı ister.
const FINANCE_QUEUEABLE = /^\/api\/(finance\/entries|tools\/projects\/\d+\/finance)(\/[\w-]+)?$/;
// Mesajlar: bağlantı yokken yazılan METİN mesajı kuyruğa alınır ve saat
// simgesiyle gösterilir. Sunucu client_id ile çift kaydı önlediğinden yeniden
// gönderim güvenlidir. Diğer sohbet yazmaları (tepki, düzenleme, dosya, grup
// işlemleri) bağlantı ister.
const CHAT_QUEUEABLE = /^\/api\/chat\/conversations\/\d+\/messages$/;
const isChatQueueable = (method, pathname, body) => method === "POST" && CHAT_QUEUEABLE.test(pathname)
  && (!body?.kind || body.kind === "text") && Boolean(body?.client_id) && Boolean(String(body?.body || "").trim());
const isQueueable = (method, pathname, body) => QUEUEABLE.test(pathname)
  || ((method === "POST" || method === "PATCH") && (PROJECT_QUEUEABLE.test(pathname) || FINANCE_QUEUEABLE.test(pathname)))
  || isChatQueueable(method, pathname, body);
const TEMP_ID = /^tmp_[\w-]+$/;

class ApiError extends Error {
  constructor(status, message, code, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const buildUrl = (origin, pathname, query) => {
  const url = new URL(pathname, origin);
  for (const [key, value] of Object.entries(query || {})) {
    if (value === undefined || value === null || value === "") continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
};

const cacheName = (key) => `${crypto.createHash("sha1").update(key).digest("hex")}.json`;

function createApi({ origin, dataDir, fetchImpl, sessionStore, userAgent, timeoutMs = 20000, onUnauthorized = () => {} }) {
  const events = new EventEmitter();
  const cacheDir = path.join(dataDir, "cache");
  const outboxFile = path.join(dataDir, "outbox.json");
  fs.mkdirSync(cacheDir, { recursive: true });

  let online = true;
  const setOnline = (value) => {
    if (online === value) return;
    online = value;
    events.emit("online", value);
  };

  /* ------------------------------ önbellek ------------------------------ */
  const readCache = (key) => {
    try { return JSON.parse(fs.readFileSync(path.join(cacheDir, cacheName(key)), "utf8")); } catch { return null; }
  };
  const writeCache = (key, data) => {
    try { fs.writeFileSync(path.join(cacheDir, cacheName(key)), JSON.stringify({ savedAt: new Date().toISOString(), data })); } catch { /* yoksay */ }
  };
  const clearCache = () => {
    for (const name of fs.readdirSync(cacheDir)) { try { fs.unlinkSync(path.join(cacheDir, name)); } catch { /* yoksay */ } }
  };

  /* -------------------------------- kuyruk -------------------------------- */
  const readOutbox = () => {
    try { return JSON.parse(fs.readFileSync(outboxFile, "utf8")); } catch { return []; }
  };
  const writeOutbox = (items) => {
    fs.writeFileSync(outboxFile, JSON.stringify(items));
    events.emit("outbox", items.length);
  };

  /* ------------------------------- istek ------------------------------- */
  async function send(method, pathname, { query, body } = {}) {
    const session = sessionStore.load();
    const headers = {
      Accept: "application/json",
      "X-Client-Platform": "desktop",
      "User-Agent": userAgent,
    };
    if (session?.token) headers.Authorization = `Bearer ${session.token}`;
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetchImpl(buildUrl(origin, pathname, query), {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
        credentials: "omit",
      });
    } catch (error) {
      const err = new ApiError(0, "Sunucuya ulaşılamıyor. İnternet bağlantınızı kontrol edin.", "NETWORK");
      err.network = true;
      err.cause = error;
      throw err;
    } finally {
      clearTimeout(timer);
    }
    setOnline(true);
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { message: text.slice(0, 300) }; }
    if (!response.ok) {
      if (response.status === 401 && session?.token) onUnauthorized(data);
      throw new ApiError(response.status, data?.message || `Sunucu hatası (${response.status}).`, data?.code, data?.details);
    }
    return data;
  }

  /**
   * Arayüzün kullandığı tek giriş noktası. Hiç fırlatmaz:
   * { ok, data, offline?, savedAt?, queued?, error? } döner.
   */
  async function request({ method = "GET", path: pathname, query, body, cache = true, queue = true, tempId } = {}) {
    method = String(method).toUpperCase();
    const key = `${pathname}?${JSON.stringify(query || {})}`;
    try {
      const data = await send(method, pathname, { query, body });
      if (method === "GET" && cache) writeCache(key, data);
      return { ok: true, data };
    } catch (error) {
      if (error.network) {
        setOnline(false);
        if (method === "GET") {
          const hit = cache ? readCache(key) : null;
          if (hit) return { ok: true, data: hit.data, offline: true, savedAt: hit.savedAt };
        } else if (queue && isQueueable(method, pathname, body)) {
          const items = readOutbox();
          items.push({ id: crypto.randomUUID(), method, path: pathname, query, body, tempId: tempId || null, at: new Date().toISOString() });
          writeOutbox(items);
          return { ok: true, queued: true, offline: true, data: null };
        }
      }
      return { ok: false, offline: Boolean(error.network), error: { status: error.status, message: error.message, code: error.code, details: error.details } };
    }
  }

  /**
   * Dosya yükleme (multipart). Gövde hazır gelir (chat.js buildMultipart);
   * kuyruğa alınmaz, önbelleğe yazılmaz.
   */
  async function upload(pathname, { body, contentType }, { timeout = 180000 } = {}) {
    const session = sessionStore.load();
    const headers = { Accept: "application/json", "X-Client-Platform": "desktop", "User-Agent": userAgent, "Content-Type": contentType };
    if (session?.token) headers.Authorization = `Bearer ${session.token}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    let response;
    try {
      response = await fetchImpl(buildUrl(origin, pathname), { method: "POST", headers, body, signal: controller.signal, credentials: "omit" });
    } catch {
      setOnline(false);
      return { ok: false, offline: true, error: { status: 0, message: "Bağlantı yok: dosya gönderilemedi." } };
    } finally {
      clearTimeout(timer);
    }
    setOnline(true);
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { message: text.slice(0, 300) }; }
    if (!response.ok) {
      if (response.status === 401 && session?.token) onUnauthorized(data);
      return { ok: false, error: { status: response.status, message: data?.message || `Yükleme başarısız (${response.status}).`, code: data?.code } };
    }
    return { ok: true, data };
  }

  /** Kuyruktaki yazmaları sırayla gönderir. Ağ hatasında durur, kalanlar kalır. */
  let flushing = null;
  function flush() {
    if (flushing) return flushing;
    flushing = (async () => {
      let items = readOutbox();
      const idMap = {};
      let sent = 0;
      const failed = [];
      while (items.length) {
        const item = items[0];
        const swap = (s) => s.replace(/tmp_[\w-]+/g, (m) => idMap[m] || m);
        const target = swap(item.path);
        // Sunucuya hiç gitmemiş kaydın silinmesi ya da düzenlenmesi: kimliği eşlenmediyse atla.
        const unresolved = target.split("/").some((part) => TEMP_ID.test(part));
        try {
          if (!unresolved) {
            const data = await send(item.method, target, { query: item.query, body: item.body });
            if (item.tempId) {
              const created = data?.item || data?.items?.[0];
              if (created?.id) idMap[item.tempId] = String(created.id);
            }
            sent += 1;
          }
        } catch (error) {
          if (error.network) { setOnline(false); break; }
          failed.push({ ...item, error: error.message });
        }
        items = items.slice(1);
        writeOutbox(items);
      }
      if (sent || failed.length) events.emit("synced", { sent, failed });
      return { sent, failed, pending: readOutbox().length };
    })().finally(() => { flushing = null; });
    return flushing;
  }

  return {
    request,
    send,
    upload,
    outbox: () => readOutbox(),
    flush,
    events,
    clearCache,
    pending: () => readOutbox().length,
    clearOutbox: () => writeOutbox([]),
    isOnline: () => online,
    setOnline,
  };
}

module.exports = { createApi, ApiError, buildUrl, QUEUEABLE, PROJECT_QUEUEABLE, FINANCE_QUEUEABLE, CHAT_QUEUEABLE, isQueueable, isChatQueueable };
