// Yayın Stüdyosu — "Yükleme günlüğü" (tanılama).
//
// Gol klibi, maç özeti ve röportaj yüklemelerinin HER denemesi kaydedilir:
// zaman, tür (clip | highlight | interview), yöntem, uç (sorgusuz yol; ön imzalı
// Spaces adresinin yalnız konak + yolu — imza / kimlik sorgusu YAZILMAZ),
// HTTP durumu, sunucunun hata kodu ve iletisi (ör. EVENT_NOT_GOAL, S3
// SignatureDoesNotMatch), süre, bayt. Jeton hiçbir zaman yazılmaz.
// Yüklemeye hiç gidilmeden düşen denemeler de (maç / olay seçilmemiş, dosya
// yok, 40 MB üstü, oturum kapalı) "yerel" olarak yazılır.
//
// Bellekte son MAX kayıt; userData/logs/uploads.json'a da yazılır (uygulama
// yeniden açılınca "neden kaydedilmedi?" sorusu yanıtlanabilsin).
// studio.diagnostics() → { …, uploads: [...] } (en yeni önce).
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { maskSecrets } = require("./ffmpeg");

const MAX = 200;
const STUDIO_UPLOAD_PATH = /^\/api\/admin\/live-streams\/(?:matches\/\d+\/(clips|highlight|interview)(?:\/upload-url)?|clips\/\d+)(?:\?|$)/;

/** Yoldan tür: /clips → clip, /highlight… → highlight, /interview… → interview. */
function kindOfPath(pathname) {
  const m = STUDIO_UPLOAD_PATH.exec(String(pathname || ""));
  if (!m) return null;
  return m[1] === "highlight" ? "highlight" : m[1] === "interview" ? "interview" : "clip";
}

/** Adresin imzasız biçimi: konak + yol (sorgu atılır). */
function safeEndpoint(url) {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}${u.pathname}`;
  } catch {
    return String(url || "").split("?")[0].slice(0, 300);
  }
}

const clean = (v, max = 300) => (v === null || v === undefined || v === "" ? null : maskSecrets(String(v)).replace(/Bearer\s+\S+/gi, "Bearer ***").replace(/X-Amz-[A-Za-z]+=[^&\s]+/g, "X-Amz-***").slice(0, max));

function createUploadLog({ file = null, max = MAX, now = () => Date.now(), onRecord = () => {} } = {}) {
  let entries = [];
  if (file) {
    try {
      const saved = JSON.parse(fs.readFileSync(file, "utf8"));
      if (Array.isArray(saved)) entries = saved.slice(-max);
    } catch { /* ilk açılış */ }
  }
  let writeTimer = null;
  let recorded = 0;
  const persist = () => {
    if (!file) return;
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(entries));
    } catch { /* disk: günlük isteğe bağlı */ }
  };

  /** Bir deneme. entry: { kind, method, endpoint, status, ok, code, message, durationMs, bytes, matchId, eventId, offline, local } */
  function record(entry = {}) {
    const e = {
      at: new Date(now()).toISOString(),
      kind: entry.kind || null,
      method: entry.method || null,
      endpoint: clean(entry.endpoint, 400),
      status: Number.isFinite(Number(entry.status)) ? Number(entry.status) : null,
      ok: Boolean(entry.ok),
      code: clean(entry.code, 80),
      message: clean(entry.message, 300),
      durationMs: Number.isFinite(entry.durationMs) ? Math.round(entry.durationMs) : null,
      bytes: Number.isFinite(entry.bytes) ? entry.bytes : null,
      matchId: Number(entry.matchId) > 0 ? Number(entry.matchId) : null,
      eventId: Number(entry.eventId) > 0 ? Number(entry.eventId) : null,
      offline: Boolean(entry.offline),
      local: Boolean(entry.local),
    };
    entries.push(e);
    recorded += 1;
    if (entries.length > max) entries = entries.slice(-max);
    // Disk yazımı tek seferde (ardışık denemeler tek yazım). Testler ve kapanış için hemen de yazılabilir.
    if (!writeTimer) {
      writeTimer = setTimeout(() => { writeTimer = null; persist(); }, 50);
      writeTimer.unref?.();
    }
    try { onRecord(e); } catch { /* yoksay */ }
    return e;
  }

  return {
    record,
    /** En yeni önce. */
    list: () => { if (writeTimer) { clearTimeout(writeTimer); writeTimer = null; persist(); } return [...entries].reverse(); },
    clear: () => { entries = []; persist(); },
    /** Toplam kayıt sayısı (en çok max) — deneme yazıldı mı denetimi için sayaç. */
    size: () => recorded,
    flush: () => { if (writeTimer) { clearTimeout(writeTimer); writeTimer = null; } persist(); },
    file,
  };
}

const matchOf = (pathname) => Number(/\/matches\/(\d+)\//.exec(String(pathname || ""))?.[1]) || null;
const eventOf = (pathname, body) => Number(/[?&]event_id=(\d+)/.exec(String(pathname || ""))?.[1] || body?.event_id) || null;

/**
 * api modülünü sarar: stüdyo yükleme uçlarına giden request / upload çağrıları
 * günlüğe yazılır; diğer çağrılar olduğu gibi geçer.
 */
function withUploadLog(api, log) {
  if (!api || !log) return api;
  const request = async (opts = {}) => {
    const kind = kindOfPath(opts.path);
    if (!kind) return api.request(opts);
    const t0 = Date.now();
    const res = await api.request(opts);
    log.record({
      kind, method: String(opts.method || "GET").toUpperCase(), endpoint: String(opts.path || "").split("?")[0],
      status: res.ok ? 200 : res.error?.status ?? 0, ok: res.ok, code: res.ok ? null : res.error?.code ?? (res.offline ? "NETWORK" : null),
      message: res.ok ? null : res.error?.message, durationMs: Date.now() - t0, matchId: matchOf(opts.path), eventId: eventOf(opts.path, opts.body), offline: res.offline,
      bytes: Number(opts.body?.size_bytes) || null,
    });
    return res;
  };
  const upload = async (pathname, payload, opts) => {
    const kind = kindOfPath(pathname);
    if (!kind) return api.upload(pathname, payload, opts);
    const t0 = Date.now();
    const res = await api.upload(pathname, payload, opts);
    log.record({
      kind, method: "POST", endpoint: String(pathname || "").split("?")[0],
      status: res.ok ? res.status ?? 201 : res.error?.status ?? 0, ok: res.ok, code: res.ok ? null : res.error?.code ?? (res.offline ? "NETWORK" : null),
      message: res.ok ? null : res.error?.message, durationMs: Date.now() - t0, bytes: payload?.body?.length ?? null,
      matchId: matchOf(pathname), eventId: eventOf(pathname), offline: res.offline,
    });
    return res;
  };
  return { ...api, request, upload };
}

/** putFile'ı sarar (ön imzalı PUT): uç = konak + yol, durum, S3 hata kodu. */
withUploadLog.put = (putImpl, log) => {
  if (!log) return putImpl;
  return async (url, opts = {}) => {
    const t0 = Date.now();
    const r = await putImpl(url, opts);
    log.record({
      kind: opts.kind || null, method: "PUT", endpoint: safeEndpoint(url), status: r.status ?? 0, ok: r.ok,
      code: r.ok ? null : r.code || (r.network ? "NETWORK" : null), message: r.ok ? null : r.message || (r.network ? "Bağlantı koptu / zaman aşımı." : null),
      durationMs: Date.now() - t0, bytes: opts.size ?? null, matchId: opts.matchId, offline: r.network,
    });
    return r;
  };
};

module.exports = { createUploadLog, withUploadLog, kindOfPath, safeEndpoint, MAX };
