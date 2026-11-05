// Yayın Stüdyosu — gol klipleri.
//
// Klip, yayına giden görüntünün son ~10 sn'sidir: motorun 2 sn'lik MPEG-TS
// parçalarından en yeni tamamlanmışlar (ve 0,5 sn'den uzunsa yazılmakta olanın
// kopyası) seçilir, ffmpeg concat demuxer ile yeniden kodlamadan MP4'e
// birleştirilir (userData/clips/clip-<zaman>.mp4, yanında .json bilgi dosyası).
// Klip parça sınırında başladığı için istenenden en çok ~2 sn uzun olabilir.
// 24 saatten eski klipler açılışta silinir.
//
// Arayüz klibi elitlig-studio://clips/<ad> adresinden oynatır (Range destekli).
// Sunucuya yükleme: POST /api/admin/live-streams/matches/:id/clips?event_id=…
// (alanlar dosyadan ÖNCE: event_id, duration_ms, width, height, file).
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { Readable } = require("node:stream");
const ff = require("./ffmpeg");

const STUDIO_SCHEME = "elitlig-studio";
const CLIP_NAME = /^clip-[\w-]{1,80}\.mp4$/;
const MAX_AGE_MS = 24 * 3600 * 1000;
const UPLOAD_LIMIT = 40 * 1024 * 1024; // sunucu sınırı (413 VIDEO_TOO_LARGE)
const UPLOAD_TIMEOUT_MS = 180000;

const ERR = {
  NOT_STREAMING: "Klip için yayın ya da kayıt sürüyor olmalı.",
  NO_BUFFER: "Klip için yeterli görüntü yok (en az 1 sn). Birkaç saniye sonra yeniden deneyin.",
  CLIP_WRITE_FAILED: "Klip yazılamadı.",
  NOT_FOUND: "Klip bulunamadı.",
  TOO_LARGE: "Klip 40 MB'tan büyük; yüklenemez.",
  BAD_REQUEST: "Maç ya da gol olayı seçilmedi.",
};
const error = (code, message = ERR[code]) => ({ ok: false, error: { code, message } });

/* ----------------------------- parça seçimi ----------------------------- */

/**
 * En yeni parçalardan geriye doğru toplam ≥ seconds olana kadar seçer.
 * Yazılmakta olan parça 0,5 sn'den uzunsa dahil edilir (kopyalanarak).
 * Kodlayıcı değişmişse (VideoToolbox → x264) eski parçalara geçilmez.
 * → { items: [...kronolojik], durationSec, includesGrowing }
 */
function selectSegments({ complete = [], growing = null, seconds = 10, minGrowingSec = 0.5 }) {
  const picked = [];
  let total = 0;
  let encoder = null;
  if (growing && growing.durationSec > minGrowingSec) {
    picked.push({ ...growing, growing: true });
    total += growing.durationSec;
    encoder = growing.encoder || null;
  }
  const sorted = [...complete].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  for (let i = sorted.length - 1; i >= 0 && total < seconds; i -= 1) {
    const seg = sorted[i];
    if (encoder && seg.encoder && seg.encoder !== encoder) break;
    encoder = encoder || seg.encoder || null;
    const d = Number(seg.durationSec ?? (seg.end - seg.start));
    if (!(d > 0)) continue;
    picked.push(seg);
    total += d;
  }
  return { items: picked.reverse(), durationSec: total, includesGrowing: picked.some((p) => p.growing) };
}

/* ------------------------------ ad / yol güvenliği ------------------------------ */

/** Klip adını klasör içinde güvenli bir yola çevirir; olmazsa null. */
function safeClipPath(clipsDir, name) {
  const base = String(name || "");
  if (!CLIP_NAME.test(base) || base !== path.basename(base)) return null;
  const root = path.resolve(clipsDir);
  const full = path.resolve(root, base);
  if (path.dirname(full) !== root) return null;
  return full;
}

const clipUrl = (name) => `${STUDIO_SCHEME}://clips/${encodeURIComponent(name)}`;

/** elitlig-studio://clips/<ad> → ad (yalnız "clips" konağı). */
function nameFromUrl(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== `${STUDIO_SCHEME}:` || u.hostname !== "clips") return null;
    const name = decodeURIComponent(u.pathname.replace(/^\/+/, ""));
    return CLIP_NAME.test(name) ? name : null;
  } catch {
    return null;
  }
}

/**
 * HTTP Range başlığı → { start, end } (dahil), tüm dosya için null,
 * karşılanamazsa { invalid: true }. Yalnız tek aralık desteklenir.
 */
function parseRange(header, size) {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(header).trim());
  if (!m || (m[1] === "" && m[2] === "")) return { invalid: true };
  let start;
  let end;
  if (m[1] === "") {
    const suffix = Number(m[2]);
    if (!(suffix > 0)) return { invalid: true };
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (start >= size || end < start) return { invalid: true };
  return { start, end };
}

/** Şema isteğine yanıt (Range destekli). Klasör dışı / geçersiz ad → 404. */
function serveClip(clipsDir, request) {
  const name = nameFromUrl(request.url);
  const file = name && safeClipPath(clipsDir, name);
  const cors = { "Access-Control-Allow-Origin": "*", "Cross-Origin-Resource-Policy": "cross-origin" };
  if (!file) return new Response("", { status: 404, headers: cors });
  let size;
  try { size = fs.statSync(file).size; } catch { return new Response("", { status: 404, headers: cors }); }
  const header = typeof request.headers?.get === "function" ? request.headers.get("range") : request.headers?.range;
  const range = parseRange(header, size);
  const base = { ...cors, "Content-Type": "video/mp4", "Accept-Ranges": "bytes", "Cache-Control": "no-cache" };
  if (range?.invalid) return new Response("", { status: 416, headers: { ...base, "Content-Range": `bytes */${size}` } });
  const method = String(request.method || "GET").toUpperCase();
  const { start, end } = range || { start: 0, end: size - 1 };
  const headers = { ...base, "Content-Length": String(size ? end - start + 1 : 0) };
  if (range) headers["Content-Range"] = `bytes ${start}-${end}/${size}`;
  const body = method === "HEAD" || !size ? null : Readable.toWeb(fs.createReadStream(file, { start, end }));
  return new Response(body, { status: range ? 206 : 200, headers });
}

/* ------------------------------ çok parçalı gövde ------------------------------ */

/** Alanlar dosyadan önce: sunucu nesne anahtarına olay kimliğini yazar. */
function buildClipMultipart({ fields, file, boundary = `----elitligclip${Date.now().toString(16)}${Math.random().toString(16).slice(2)}` }) {
  const parts = [];
  for (const [key, value] of Object.entries(fields)) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`, "utf8"));
  }
  const safe = String(file.name || "klip.mp4").replace(/["\r\n]/g, "_");
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${safe}"\r\nContent-Type: ${file.mime || "video/mp4"}\r\n\r\n`, "utf8"));
  parts.push(Buffer.from(file.data));
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`, "utf8"));
  return { body: Buffer.concat(parts), contentType: `multipart/form-data; boundary=${boundary}` };
}

/* --------------------------------- depo --------------------------------- */

function createClipStore({ clipsDir, getFfmpegPath, runImpl = ff.run, now = () => Date.now(), maxAgeMs = MAX_AGE_MS, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  const ensureDir = () => fs.mkdirSync(clipsDir, { recursive: true });
  const metaPath = (file) => file.replace(/\.mp4$/, ".json");

  const describe = (name) => {
    const file = safeClipPath(clipsDir, name);
    if (!file) return null;
    let stat;
    try { stat = fs.statSync(file); } catch { return null; }
    let meta = {};
    try { meta = JSON.parse(fs.readFileSync(metaPath(file), "utf8")); } catch { /* bilgi dosyası yok */ }
    return {
      path: file,
      url: clipUrl(name),
      name,
      durationMs: meta.durationMs ?? null,
      width: meta.width ?? null,
      height: meta.height ?? null,
      sizeBytes: stat.size,
      createdAt: meta.createdAt || new Date(stat.mtimeMs).toISOString(),
      sessionId: meta.sessionId || null,
      uploaded: meta.uploaded || null,
    };
  };

  /** 24 saatten eski klipleri (ve yetim .json / iş klasörlerini) siler. */
  function prune() {
    let removed = 0;
    let names = [];
    try { names = fs.readdirSync(clipsDir); } catch { return 0; }
    for (const name of names) {
      const full = path.join(clipsDir, name);
      let stat;
      try { stat = fs.statSync(full); } catch { continue; }
      const old = now() - stat.mtimeMs > maxAgeMs;
      if (stat.isDirectory() && name.startsWith(".work-")) { fs.rmSync(full, { recursive: true, force: true }); continue; }
      if (old && (CLIP_NAME.test(name) || /^clip-.*\.json$/.test(name))) {
        try { fs.unlinkSync(full); removed += name.endsWith(".mp4") ? 1 : 0; } catch { /* yoksay */ }
      }
    }
    return removed;
  }

  function list() {
    let names = [];
    try { names = fs.readdirSync(clipsDir).filter((n) => CLIP_NAME.test(n)); } catch { return []; }
    return names.map(describe).filter((c) => c && now() - Date.parse(c.createdAt) <= maxAgeMs)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.name.localeCompare(a.name));
  }

  function remove(name) {
    const file = safeClipPath(clipsDir, name);
    if (!file) return false;
    try { fs.unlinkSync(file); } catch { /* yoksay */ }
    try { fs.unlinkSync(metaPath(file)); } catch { /* yoksay */ }
    return true;
  }

  async function probe(file) {
    const res = await runImpl(getFfmpegPath(), ["-hide_banner", "-nostdin", "-i", file], { timeout: 15000 });
    return ff.parseProbe(res.stderr);
  }

  /**
   * sources: motorun clipSources() çıktısı. → { ok, clip } | { ok:false, error }
   */
  async function save({ sources, seconds = 10, sessionId = null }) {
    if (!sources) return error("NOT_STREAMING");
    const want = Math.min(30, Math.max(1, Number(seconds) || 10));
    const pick = selectSegments({ complete: sources.complete, growing: sources.growing, seconds: want });
    if (pick.durationSec < 1) return error("NO_BUFFER");
    ensureDir();
    const stamp = new Date(now()).toISOString().replace(/[-:]/g, "").replace("T", "-").replace(/\..*$/, "");
    let name = `clip-${stamp}-${String(now() % 1000).padStart(3, "0")}.mp4`;
    for (let n = 2; fs.existsSync(path.join(clipsDir, name)); n += 1) name = name.replace(/(-\d+)?\.mp4$/, `-${n}.mp4`);
    const out = path.join(clipsDir, name);
    const work = fs.mkdtempSync(path.join(clipsDir, ".work-"));
    try {
      const files = pick.items.map((item, i) => {
        // Kopyala: parça halkası klip yazılırken silinebilir / büyümeye devam eder.
        const copy = path.join(work, `${String(i).padStart(3, "0")}.ts`);
        fs.copyFileSync(item.path, copy);
        return copy;
      });
      const listFile = path.join(work, "list.txt");
      fs.writeFileSync(listFile, `${files.map(ff.concatLine).join("\n")}\n`);
      const res = await runImpl(getFfmpegPath(), ff.buildConcatArgs(listFile, out), { timeout: 60000 });
      if (!res.ok || !fs.existsSync(out) || fs.statSync(out).size === 0) {
        try { fs.unlinkSync(out); } catch { /* yoksay */ }
        return error("CLIP_WRITE_FAILED", `${ERR.CLIP_WRITE_FAILED} ${String(res.stderr || "").trim().split("\n").pop() || ""}`.trim());
      }
      const meta = await probe(out);
      const info = {
        durationMs: meta.durationMs ?? Math.round(pick.durationSec * 1000),
        width: meta.width,
        height: meta.height,
        createdAt: new Date(now()).toISOString(),
        sessionId,
        segments: pick.items.length,
      };
      fs.writeFileSync(metaPath(out), JSON.stringify(info));
      return { ok: true, clip: describe(name) };
    } catch (e) {
      try { fs.unlinkSync(out); } catch { /* yoksay */ }
      return error("CLIP_WRITE_FAILED", `${ERR.CLIP_WRITE_FAILED} ${e.message}`);
    } finally {
      fs.rmSync(work, { recursive: true, force: true });
    }
  }

  /**
   * Klibi sunucuya yükler (api.upload: jetonlu, 180 sn). Ağ hatasında bir kez yeniden dener.
   * → api sonucu { ok, data | error }
   */
  async function upload(api, { matchId, eventId, name, durationMs, width, height } = {}) {
    const mid = Number(matchId);
    const eid = Number(eventId);
    if (!Number.isInteger(mid) || mid <= 0 || !Number.isInteger(eid) || eid <= 0) return error("BAD_REQUEST");
    const clip = describe(name);
    if (!clip) return error("NOT_FOUND");
    if (clip.sizeBytes > UPLOAD_LIMIT) return error("TOO_LARGE");
    const data = fs.readFileSync(clip.path);
    const fields = {
      event_id: String(eid),
      duration_ms: String(Math.round(Number(durationMs ?? clip.durationMs) || 0)),
      width: String(Math.round(Number(width ?? clip.width) || 0)),
      height: String(Math.round(Number(height ?? clip.height) || 0)),
    };
    const pathname = `/api/admin/live-streams/matches/${mid}/clips?event_id=${eid}`;
    const send = () => api.upload(pathname, buildClipMultipart({ fields, file: { name: `gol-${mid}-${eid}.mp4`, mime: "video/mp4", data } }), { timeout: UPLOAD_TIMEOUT_MS });
    let res = await send();
    if (!res.ok && res.offline) {
      await sleep(2000);
      res = await send();
    }
    if (res.ok) {
      try {
        const file = metaPath(clip.path);
        const meta = JSON.parse(fs.readFileSync(file, "utf8"));
        fs.writeFileSync(file, JSON.stringify({ ...meta, uploaded: { matchId: mid, eventId: eid, clipId: res.data?.id ?? null, url: res.data?.url ?? null, at: new Date(now()).toISOString() } }));
      } catch { /* bilgi dosyası yok */ }
    }
    return res;
  }

  return { save, list, remove, prune, describe, upload, resolve: (name) => safeClipPath(clipsDir, name), dir: clipsDir };
}

module.exports = {
  STUDIO_SCHEME,
  CLIP_NAME,
  selectSegments,
  safeClipPath,
  clipUrl,
  nameFromUrl,
  parseRange,
  serveClip,
  buildClipMultipart,
  createClipStore,
};
