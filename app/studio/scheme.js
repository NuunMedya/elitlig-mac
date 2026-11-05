// Yayın Stüdyosu — elitlig-studio:// şeması (klipler, tekrarlar, öne çıkanlar).
//
//   elitlig-studio://clips/<clip-….mp4>                 eski gol klipleri (userData/clips)
//   elitlig-studio://replays/<tekrar kimliği>/<dosya>   program.mp4, angle-1.mp4, program.jpg …
//   elitlig-studio://highlights/<highlight-….mp4|jpg>   öne çıkanlar (userData/highlights)
//
// Yalnız beyaz listedeki adlar sunulur; yol klasör dışına çıkamaz (aksi 404).
// Range desteklidir (video oynatıcı ileri sarar).
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { Readable } = require("node:stream");
const { STUDIO_SCHEME, CLIP_NAME, parseRange } = require("./clips");

const REPLAY_ID = /^r\d{14}-[0-9a-f]{6}$/;
const REPLAY_FILE = /^(program|angle-\d{1,3})\.(mp4|jpg)$/;
const HIGHLIGHT_FILE = /^highlight-[\w-]{1,80}\.(mp4|jpg)$/;

const CONTENT_TYPES = { ".mp4": "video/mp4", ".jpg": "image/jpeg" };

/** root içinde, verilen göreli parçalardan güvenli yol; olmazsa null. */
function safeJoin(root, ...parts) {
  if (!root) return null;
  for (const p of parts) if (typeof p !== "string" || !p || p !== path.basename(p) || p === "." || p === ".." || /[\\/\0]/.test(p)) return null;
  const base = path.resolve(root);
  const full = path.resolve(base, ...parts);
  const rel = path.relative(base, full);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return full;
}

const safeReplayPath = (replaysDir, id, file) => (REPLAY_ID.test(String(id || "")) && REPLAY_FILE.test(String(file || "")) ? safeJoin(replaysDir, id, file) : null);
const safeHighlightPath = (highlightsDir, file) => (HIGHLIGHT_FILE.test(String(file || "")) ? safeJoin(highlightsDir, file) : null);

const replayUrl = (id, file) => `${STUDIO_SCHEME}://replays/${encodeURIComponent(id)}/${encodeURIComponent(file)}`;
const highlightUrl = (file) => `${STUDIO_SCHEME}://highlights/${encodeURIComponent(file)}`;

/** Şema adresi → diskteki dosya (ya da null). roots: { clips, replays, highlights } */
function resolveStudioUrl(roots, url) {
  let u;
  try { u = new URL(url); } catch { return null; }
  if (u.protocol !== `${STUDIO_SCHEME}:`) return null;
  let parts;
  try { parts = u.pathname.replace(/^\/+/, "").split("/").map(decodeURIComponent); } catch { return null; }
  if (u.hostname === "clips" && parts.length === 1 && CLIP_NAME.test(parts[0])) return safeJoin(roots.clips, parts[0]);
  if (u.hostname === "replays" && parts.length === 2) return safeReplayPath(roots.replays, parts[0], parts[1]);
  if (u.hostname === "highlights" && parts.length === 1) return safeHighlightPath(roots.highlights, parts[0]);
  return null;
}

/** Dosyayı Range destekli Response olarak sunar. */
function serveFile(file, request, contentType = CONTENT_TYPES[path.extname(file || "")] || "application/octet-stream") {
  const cors = { "Access-Control-Allow-Origin": "*", "Cross-Origin-Resource-Policy": "cross-origin" };
  if (!file) return new Response("", { status: 404, headers: cors });
  let size;
  try {
    const st = fs.statSync(file);
    if (!st.isFile()) throw new Error("dosya değil");
    size = st.size;
  } catch { return new Response("", { status: 404, headers: cors }); }
  const header = typeof request.headers?.get === "function" ? request.headers.get("range") : request.headers?.range;
  const range = parseRange(header, size);
  const base = { ...cors, "Content-Type": contentType, "Accept-Ranges": "bytes", "Cache-Control": "no-cache" };
  if (range?.invalid) return new Response("", { status: 416, headers: { ...base, "Content-Range": `bytes */${size}` } });
  const method = String(request.method || "GET").toUpperCase();
  const { start, end } = range || { start: 0, end: size - 1 };
  const headers = { ...base, "Content-Length": String(size ? end - start + 1 : 0) };
  if (range) headers["Content-Range"] = `bytes ${start}-${end}/${size}`;
  const body = method === "HEAD" || !size ? null : Readable.toWeb(fs.createReadStream(file, { start, end }));
  return new Response(body, { status: range ? 206 : 200, headers });
}

/** protocol.handle işleyicisi. */
const serveStudio = (roots, request) => serveFile(resolveStudioUrl(roots, request.url), request);

module.exports = {
  REPLAY_ID, REPLAY_FILE, HIGHLIGHT_FILE,
  safeJoin, safeReplayPath, safeHighlightPath, replayUrl, highlightUrl,
  resolveStudioUrl, serveFile, serveStudio,
};
