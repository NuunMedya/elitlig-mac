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
// upload-url 404 dönerse (uç sunucuda henüz yok) açık Türkçe hata: SERVER_PENDING.
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

/**
 * Dosyayı ön imzalı adrese PUT eder (akış). → { ok, status, body } | { ok:false, network?, status?, body? }
 */
function putFile(url, { file, size, headers = {}, contentType = "application/octet-stream", onProgress = () => {}, idleTimeoutMs = PUT_IDLE_TIMEOUT_MS } = {}) {
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
      res.on("end", () => done({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, body }));
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
    stream.pipe(req);
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
    // Uç henüz yayında değil (eski sunucu): 404.
    if (urlRes.error?.status === 404) return fail("SERVER_PENDING", E.SERVER_PENDING, { status: 404 });
    return fail("UPLOAD_URL", `${E.UPLOAD_URL} ${urlRes.error?.message || ""}`.trim(), { status: urlRes.error?.status });
  }
  const target = unwrap(urlRes.data) || {};
  if (!target.upload_url || !target.key) return fail("UPLOAD_URL", `${E.UPLOAD_URL} Sunucu yanıtı eksik.`);

  let posterSize = 0;
  if (target.poster_upload_url && file.posterPath) {
    try { posterSize = fs.statSync(file.posterPath).size; } catch { posterSize = 0; }
  }
  const total = file.sizeBytes + posterSize;
  const progress = (loaded) => emitProgress({ kind, matchId: mid, loaded: Math.min(loaded, total), total });
  progress(0);
  const put = async (url, opts) => {
    let r = await putImpl(url, opts);
    if (!r.ok && r.network) {
      await sleep(2000);
      r = await putImpl(url, opts);
    }
    return r;
  };
  const video = await put(target.upload_url, { file: file.path, size: file.sizeBytes, headers: target.headers || {}, contentType: "video/mp4", onProgress: (l) => progress(l) });
  if (!video.ok) return fail(video.network ? "NETWORK" : "PUT_FAILED", video.network ? E.NETWORK : `${E.PUT_FAILED} (HTTP ${video.status})`, { status: video.status });

  let posterKey = null;
  if (posterSize > 0) {
    const poster = await put(target.poster_upload_url, { file: file.posterPath, size: posterSize, headers: target.poster_headers || {}, contentType: "image/jpeg", onProgress: (l) => progress(file.sizeBytes + l) });
    // Kapak yüklenemezse video yine bağlanır (kapak isteğe bağlı).
    if (poster.ok) posterKey = target.poster_key || null;
  }
  progress(total);

  const fin = await api.request({ method: "POST", path: base, body: { key: target.key, poster_key: posterKey, ...meta, size_bytes: file.sizeBytes }, cache: false, queue: false });
  if (!fin.ok) return fail(fin.offline ? "NETWORK" : "FINALIZE", fin.offline ? E.NETWORK : `${E.FINALIZE} ${fin.error?.message || ""}`.trim(), { status: fin.error?.status });
  return { ok: true, result: unwrap(fin.data), key: target.key, posterKey };
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

module.exports = { putFile, uploadPresigned, uploadHighlight, deleteHighlight, unwrap, validMatch, ERR };
