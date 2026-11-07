// Yayın Stüdyosu — öne çıkanlar videosunu sunucuya yükleme (ön imzalı adres).
//
//   1. POST /api/admin/live-streams/matches/:id/highlight/upload-url
//        { size_bytes, content_type: "video/mp4", duration_ms, width, height }
//        → { upload_url, headers, key, poster_upload_url?, poster_key? }
//   2. PUT dosya → upload_url (diskten akıtılır, belleğe alınmaz; yalnız dönen
//      başlıklar gönderilir, jeton YOK). İlerleme: "studio:uploadProgress"
//      { kind: "highlight", matchId, loaded, total }. Kapak varsa → poster_upload_url.
//   3. POST /api/admin/live-streams/matches/:id/highlight
//        { key, poster_key, duration_ms, width, height, size_bytes } → öne çıkan nesnesi
// Silme: DELETE /api/admin/live-streams/matches/:id/highlight
// JSON çağrıları jetonlu api modülünden geçer (api.request).
//
// Röportaj (interview.js) aynı akışı kullanır (uploadPresigned):
//   POST …/matches/:id/interview/upload-url → PUT → POST …/matches/:id/interview
// upload-url 404 dönerse ve sunucu bir hata kodu vermediyse (uç sunucuda henüz
// yok) açık Türkçe hata: SERVER_PENDING. Kodlu 404 (MATCH_NOT_FOUND,
// EVENT_NOT_FOUND …) sunucunun kendi iletisiyle gösterilir.
// Gol klibi de (clips.js uploadClipPresigned) aynı akışı kullanır:
//   POST …/matches/:id/clips/upload-url { event_id, … } → PUT → POST …/matches/:id/clips (JSON)
//
// Her hata kullanıcıya ve yükleme günlüğüne açık Türkçe iletiyle döner:
// S3 / Spaces kodları (SignatureDoesNotMatch, RequestTimeTooSkewed, AccessDenied …)
// describeS3Error ile, sunucunun JSON olmayan yanıtları (Heroku hata sayfası)
// "Sunucu yanıtı okunamadı (HTTP n)" olarak çevrilir.
"use strict";

const fs = require("node:fs");
const http = require("node:http");
const https = require("node:https");
const { describeHighlight, readHighlightMeta } = require("./render");
const { safeHighlightPath } = require("./scheme");

const PUT_IDLE_TIMEOUT_MS = 60000;

const ERR = {
  BAD_REQUEST: "Maç seçilmedi.",
  NOT_FOUND: "Öne çıkanlar videosu bulunamadı.",
  UPLOAD_URL: "Yükleme adresi alınamadı.",
  PUT_FAILED: "Video depolama alanına yüklenemedi.",
  NETWORK: "Bağlantı yok: video yüklenemedi. İnternet bağlantınızı kontrol edin.",
  FINALIZE: "Video yüklendi ama maça bağlanamadı.",
  DELETE: "Öne çıkanlar videosu silinemedi.",
  SERVER_PENDING: "Sunucu güncellemesi bekleniyor: maç özeti yükleme ucu henüz yayında değil.",
};
const fail = (code, message = ERR[code], extra = {}) => ({ ok: false, error: { code, message, ...extra } });

/** Spaces / S3 hata kodlarının Türkçe açıklaması (yükleme günlüğünde ve arayüzde). */
const S3_HINTS = {
  SignatureDoesNotMatch: "Spaces imzayı kabul etmedi: gönderilen başlıklar imzalananlarla aynı değil ya da dosya imza alındıktan sonra değişti.",
  RequestTimeTooSkewed: "Bilgisayarın saati yanlış; Spaces isteği reddetti. Tarih ve saati otomatik ayarlayıp yeniden deneyin.",
  AccessDenied: "Spaces erişimi reddetti: yükleme adresinin süresi dolmuş ya da sunucunun Spaces anahtarı yetkisiz.",
  ExpiredToken: "Yükleme adresinin süresi doldu; yeniden deneyin.",
  NoSuchBucket: "Sunucudaki depolama alanı (SPACE_BUCKET) bulunamadı; sunucu ayarı yanlış.",
  InvalidAccessKeyId: "Sunucunun Spaces erişim anahtarı geçersiz (AWS_ACCESS_KEY).",
  EntityTooLarge: "Dosya depolama alanının tek seferlik yükleme sınırını aşıyor.",
  MissingContentLength: "Dosya boyutu (Content-Length) gönderilemedi.",
  IncompleteBody: "Dosyanın tamamı gönderilemedi (bağlantı kesildi).",
  BadDigest: "Dosya aktarım sırasında bozuldu; yeniden deneyin.",
  XAmzContentSHA256Mismatch: "Dosya aktarım sırasında bozuldu; yeniden deneyin.",
  SlowDown: "Depolama alanı yoğun; biraz sonra yeniden deneyin.",
  ServiceUnavailable: "Depolama alanı şu an yanıt vermiyor; biraz sonra yeniden deneyin.",
  InternalError: "Depolama alanında geçici hata; yeniden deneyin.",
};
const describeS3Error = (code) => S3_HINTS[code] || null;

/** Sunucunun JSON olmayan yanıtı (ör. Heroku hata sayfası) iletiye HTML olarak girmesin. */
function serverMessage(error) {
  const text = String(error?.message || "").trim();
  if (/^<!doctype|^<html|<\/html>|<body/i.test(text)) return `Sunucu yanıtı okunamadı (HTTP ${error?.status || "?"}).`;
  return text;
}

/** Sunucu uç yok (eski sunucu): 404 ve hata kodu yok. */
const isMissingRoute = (res) => Boolean(res && !res.ok && !res.offline && Number(res.error?.status) === 404 && !res.error?.code);
const RETRY_STATUS = new Set([500, 502, 503, 504]);

/** S3 / Spaces XML hata gövdesi → { code, message } (ör. SignatureDoesNotMatch, RequestTimeTooSkewed). */
function s3Error(body) {
  const text = String(body || "");
  const code = /<Code>([^<]{1,80})<\/Code>/.exec(text)?.[1] || null;
  const message = /<Message>([^<]{1,300})<\/Message>/.exec(text)?.[1] || null;
  return { code, message };
}

/**
 * Dosyayı ön imzalı adrese PUT eder (akış). → { ok, status, body } | { ok:false, network?, status?, body?, code?, message? }
 * Gövde Content-Length ile gider (chunked DEĞİL: Spaces 411 verir); sunucunun
 * imzaladığı başlıklar (Content-Type, Cache-Control, x-amz-acl, Content-Length)
 * aynen gönderilir. Dosya boyutu imzadaki boyuttan farklıysa gönderilmez.
 */
/**
 * Hız sınırı (bayt/sn): canlı yayın sürerken gol klibi yüklemesi yayının yükleme hattını
 * doldurmasın (aynı bağlantıda RTMP kuyruğu dolup kare atlanıyor / yayın kopabiliyordu).
 * 64 KB'lık dilimler; her dilimden sonra hedef hıza göre beklenir.
 */
function throttle(bytesPerSec, { sleep = (ms) => new Promise((r) => setTimeout(r, ms)), now = () => Date.now() } = {}) {
  const { Transform } = require("node:stream");
  const t0 = now();
  let sent = 0;
  const SLICE = 64 * 1024;
  return new Transform({
    transform(chunk, _enc, cb) {
      (async () => {
        for (let i = 0; i < chunk.length; i += SLICE) {
          const part = chunk.subarray(i, i + SLICE);
          sent += part.length;
          const wait = t0 + (sent / bytesPerSec) * 1000 - now();
          if (wait > 0) await sleep(wait);
          this.push(part);
        }
      })().then(() => cb(), cb);
    },
  });
}

function putFile(url, { file, size, headers = {}, contentType = "application/octet-stream", onProgress = () => {}, idleTimeoutMs = PUT_IDLE_TIMEOUT_MS, maxBytesPerSec = 0 } = {}) {
  return new Promise((resolve) => {
    let u;
    try { u = new URL(url); } catch { resolve({ ok: false, status: 0, body: "geçersiz adres" }); return; }
    const mod = u.protocol === "http:" ? http : https;
    const hdrs = { ...headers };
    const has = (name) => Object.keys(hdrs).some((k) => k.toLowerCase() === name);
    if (!has("content-type")) hdrs["Content-Type"] = contentType;
    for (const k of Object.keys(hdrs)) if (k.toLowerCase() === "content-length" || k.toLowerCase() === "authorization") delete hdrs[k];
    hdrs["Content-Length"] = String(size);
    let settled = false;
    const done = (r) => { if (!settled) { settled = true; resolve(r); } };
    const req = mod.request(u, { method: "PUT", headers: hdrs }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (d) => { if (body.length < 4000) body += d; });
      res.on("end", () => {
        const ok = res.statusCode >= 200 && res.statusCode < 300;
        done(ok ? { ok, status: res.statusCode, body } : { ok, status: res.statusCode, body, ...s3Error(body) });
      });
      res.on("error", () => done({ ok: false, network: true, status: 0 }));
    });
    req.setTimeout(idleTimeoutMs, () => req.destroy(new Error("zaman aşımı")));
    req.on("error", () => done({ ok: false, network: true, status: 0 }));
    const stream = fs.createReadStream(file);
    let loaded = 0;
    stream.on("data", (chunk) => {
      loaded += chunk.length;
      onProgress(loaded, size);
    });
    stream.on("error", () => { req.destroy(); done({ ok: false, status: 0, body: "dosya okunamadı" }); });
    if (Number(maxBytesPerSec) > 0) stream.pipe(throttle(Number(maxBytesPerSec))).pipe(req);
    else stream.pipe(req);
  });
}

const unwrap = (data) => (data && typeof data === "object" && data.data && typeof data.data === "object" && !Array.isArray(data.data) ? data.data : data);
const validMatch = (matchId) => Number.isInteger(Number(matchId)) && Number(matchId) > 0;

/**
 * Ön imzalı yükleme akışı (öne çıkanlar, röportaj).
 *   file: { path, sizeBytes, posterPath?, durationMs, width, height }
 *   base: "/api/admin/live-streams/matches/<id>/<tür>"
 *   kind: ilerleme olayındaki tür ("highlight" | "interview")
 *   errors: ERR ile aynı anahtarlar (türe özgü iletiler)
 * → { ok, result, key, posterKey } | { ok:false, error }
 */
async function uploadPresigned(api, { kind, matchId, base, file, meta, errors = ERR }, { putImpl = putFile, emitProgress = () => {}, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  const E = { ...ERR, ...errors };
  const mid = Number(matchId);
  const urlRes = await api.request({ method: "POST", path: `${base}/upload-url`, body: { size_bytes: file.sizeBytes, content_type: "video/mp4", ...meta }, cache: false, queue: false });
  if (!urlRes.ok) {
    if (urlRes.offline) return fail("NETWORK", E.NETWORK);
    // Uç henüz yayında değil (eski sunucu): kodsuz 404.
    if (isMissingRoute(urlRes)) return fail("SERVER_PENDING", E.SERVER_PENDING, { status: 404 });
    return fail(urlRes.error?.code === "EVENT_NOT_GOAL" || urlRes.error?.code === "EVENT_NOT_FOUND" ? urlRes.error.code : "UPLOAD_URL", `${E.UPLOAD_URL} ${serverMessage(urlRes.error)}`.trim(), { status: urlRes.error?.status, serverCode: urlRes.error?.code || null });
  }
  const target = unwrap(urlRes.data) || {};
  if (!target.upload_url || !target.key) return fail("UPLOAD_URL", `${E.UPLOAD_URL} Sunucu yanıtı eksik (upload_url / key yok).`);

  let posterSize = 0;
  if (target.poster_upload_url && file.posterPath) {
    try { posterSize = fs.statSync(file.posterPath).size; } catch { posterSize = 0; }
  }
  const total = file.sizeBytes + posterSize;
  const progress = (loaded) => emitProgress({ kind, matchId: mid, loaded: Math.min(loaded, total), total });
  progress(0);
  // Ağ kopması ya da Spaces'in geçici hatası (5xx, SlowDown): bir kez daha dene.
  const put = async (url, opts) => {
    let r = await putImpl(url, opts);
    if (!r.ok && (r.network || RETRY_STATUS.has(Number(r.status)) || r.code === "SlowDown")) {
      await sleep(2000);
      r = await putImpl(url, opts);
    }
    return r;
  };
  const video = await put(target.upload_url, { file: file.path, size: file.sizeBytes, headers: target.headers || {}, contentType: "video/mp4", onProgress: (l) => progress(l), kind, matchId: mid });
  if (!video.ok) {
    if (video.network) return fail("NETWORK", E.NETWORK, { status: 0 });
    const hint = describeS3Error(video.code) || (video.message ? `Spaces: ${video.message}` : null);
    return fail("PUT_FAILED", `${String(E.PUT_FAILED).replace(/\.$/, "")} (HTTP ${video.status}${video.code ? ` ${video.code}` : ""})${hint ? `: ${hint}` : ""}`, { status: video.status, s3Code: video.code || null });
  }

  let posterKey = null;
  let posterError = null;
  if (posterSize > 0) {
    const poster = await put(target.poster_upload_url, { file: file.posterPath, size: posterSize, headers: target.poster_headers || {}, contentType: "image/jpeg", onProgress: (l) => progress(file.sizeBytes + l), kind, matchId: mid });
    // Kapak yüklenemezse video yine bağlanır (kapak isteğe bağlı); neden günlükte görünür.
    if (poster.ok) posterKey = target.poster_key || null;
    else posterError = poster.network ? "Bağlantı koptu" : `HTTP ${poster.status}${poster.code ? ` ${poster.code}` : ""}`;
  }
  progress(total);

  // Tamamlama idempotenttir (aynı anahtar aynı kaydı yazar): ağ / geçici sunucu hatasında bir kez daha.
  const finalize = () => api.request({ method: "POST", path: base, body: { key: target.key, poster_key: posterKey, ...meta, size_bytes: file.sizeBytes }, cache: false, queue: false });
  let fin = await finalize();
  if (!fin.ok && (fin.offline || RETRY_STATUS.has(Number(fin.error?.status)))) {
    await sleep(2000);
    fin = await finalize();
  }
  if (!fin.ok) {
    if (fin.offline) return fail("NETWORK", E.NETWORK);
    return fail("FINALIZE", `${E.FINALIZE} ${serverMessage(fin.error)}`.trim(), { status: fin.error?.status, serverCode: fin.error?.code || null });
  }
  return { ok: true, result: unwrap(fin.data), key: target.key, posterKey, ...(posterError ? { posterError } : {}) };
}

/**
 * Öne çıkanlar videosunu yükler. emitProgress({ kind, matchId, loaded, total }).
 * → { ok, highlight } | { ok:false, error }
 */
async function uploadHighlight(api, { highlightsDir, matchId, name, durationMs, width, height } = {}, { putImpl = putFile, emitProgress = () => {}, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), now = () => Date.now() } = {}) {
  if (!validMatch(matchId)) return fail("BAD_REQUEST");
  const mid = Number(matchId);
  const file = describeHighlight(highlightsDir, name);
  if (!file) return fail("NOT_FOUND");
  const meta = {
    duration_ms: Math.round(Number(durationMs ?? file.durationMs) || 0),
    width: Math.round(Number(width ?? file.width) || 0),
    height: Math.round(Number(height ?? file.height) || 0),
  };
  const base = `/api/admin/live-streams/matches/${mid}/highlight`;
  const res = await uploadPresigned(api, { kind: "highlight", matchId: mid, base, file, meta }, { putImpl, emitProgress, sleep });
  if (!res.ok) return res;
  const highlight = res.result?.highlight ?? res.result;
  // Yerel bilgi dosyasına işle.
  try {
    const mp4 = safeHighlightPath(highlightsDir, name);
    const m = readHighlightMeta(highlightsDir, name) || {};
    fs.writeFileSync(mp4.replace(/\.mp4$/, ".json"), JSON.stringify({ ...m, uploaded: { matchId: mid, key: res.key, posterKey: res.posterKey, id: highlight?.id ?? null, url: highlight?.url ?? null, at: new Date(now()).toISOString() } }));
  } catch { /* yoksay */ }
  return { ok: true, highlight };
}

async function deleteHighlight(api, { matchId } = {}) {
  if (!validMatch(matchId)) return fail("BAD_REQUEST");
  const res = await api.request({ method: "DELETE", path: `/api/admin/live-streams/matches/${Number(matchId)}/highlight`, cache: false, queue: false });
  if (!res.ok) return fail(res.offline ? "NETWORK" : "DELETE", res.offline ? "Bağlantı yok: öne çıkanlar videosu silinemedi." : `${ERR.DELETE} ${res.error?.message || ""}`.trim(), { status: res.error?.status });
  return { ok: true, data: res.data ?? null };
}

module.exports = { putFile, throttle, s3Error, describeS3Error, serverMessage, isMissingRoute, uploadPresigned, uploadHighlight, deleteHighlight, unwrap, validMatch, ERR };
