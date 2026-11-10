// elitlig-file:// — Dosya Araçları ve Ekran Görüntüleri rafının yerel dosyaları.
//
//   elitlig-file://f/<kimlik>/<ad>        izin listesindeki dosya (Range destekli: video/ses oynatma)
//   elitlig-file://icon/<kimlik>          dosyanın sistem simgesi (PNG)
//   elitlig-file://shelf/<kimlik>/<tür>   raf öğesinin görseli / küçük resmi (app/shelf)
//
// Güvenlik: adreste yol görünmez; kimlik, yolun özetidir ve yalnız izin
// listesine (kullanıcının sürüklediği / seçtiği / yapıştırdığı dosyalar ve
// uygulamanın ürettiği çıktılar) girmiş dosyalar sunulur.
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { Readable } = require("node:stream");
const { parseRange } = require("../studio/clips");
const { kindOf, extOf, mimeOf } = require("./formats");

const FILE_SCHEME = "elitlig-file";
const SCHEME_PRIVILEGES = { scheme: FILE_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } };
const ID = /^[0-9a-f]{24}$/;
const MAX_ENTRIES = 3000;

const idOf = (absPath) => crypto.createHash("sha256").update(path.resolve(String(absPath))).digest("hex").slice(0, 24);
const fileUrl = (id, name) => `${FILE_SCHEME}://f/${id}/${encodeURIComponent(String(name || "dosya").replace(/[\\/\0]/g, "_"))}`;

/** Kalıcı izin listesi: kimlik → mutlak yol. */
function createRegistry({ file } = {}) {
  let items = {};
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    if (raw?.items && typeof raw.items === "object") items = raw.items;
  } catch { /* ilk açılış */ }
  for (const [id, p] of Object.entries(items)) if (!ID.test(id) || typeof p !== "string" || !path.isAbsolute(p)) delete items[id];
  let timer = null;
  const save = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        const keys = Object.keys(items);
        if (keys.length > MAX_ENTRIES) for (const k of keys.slice(0, keys.length - MAX_ENTRIES)) delete items[k];
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(`${file}.tmp`, JSON.stringify({ version: 1, items }));
        fs.renameSync(`${file}.tmp`, file);
      } catch { /* yoksay */ }
    }, 300);
  };

  /** Dosyayı izin listesine alır; arayüze gidecek bilgi. Yoksa null. */
  function allow(absPath) {
    const p = String(absPath || "");
    if (!p || p.includes("\0") || !path.isAbsolute(p)) return null;
    let st;
    try { st = fs.statSync(p); } catch { return null; }
    const id = idOf(p);
    if (items[id] !== p) { delete items[id]; items[id] = p; save(); }
    const name = path.basename(p);
    return {
      id, path: p, name, ext: st.isDirectory() ? "" : extOf(p), kind: st.isDirectory() ? "folder" : kindOf(p), size: st.isDirectory() ? null : st.size,
      mtimeMs: st.mtimeMs, isDir: st.isDirectory(), url: st.isDirectory() ? null : fileUrl(id, name), icon: `${FILE_SCHEME}://icon/${id}`,
    };
  }
  const resolve = (id) => (ID.test(String(id)) ? items[id] || null : null);
  const flush = () => { clearTimeout(timer); };
  return { allow, resolve, flush };
}

/** Range destekli dosya yanıtı. */
function serveFile(request, file, type) {
  const cors = { "Access-Control-Allow-Origin": "*", "Cross-Origin-Resource-Policy": "cross-origin" };
  let size;
  try {
    const st = fs.statSync(file);
    if (!st.isFile()) return new Response("", { status: 404, headers: cors });
    size = st.size;
  } catch { return new Response("", { status: 404, headers: cors }); }
  const header = typeof request.headers?.get === "function" ? request.headers.get("range") : request.headers?.range;
  const range = parseRange(header, size);
  const base = { ...cors, "Content-Type": type || mimeOf(file), "Accept-Ranges": "bytes", "Cache-Control": "no-cache" };
  if (range?.invalid) return new Response("", { status: 416, headers: { ...base, "Content-Range": `bytes */${size}` } });
  const { start, end } = range || { start: 0, end: size - 1 };
  const headers = { ...base, "Content-Length": String(size ? end - start + 1 : 0) };
  if (range) headers["Content-Range"] = `bytes ${start}-${end}/${size}`;
  const method = String(request.method || "GET").toUpperCase();
  const body = method === "HEAD" || !size ? null : Readable.toWeb(fs.createReadStream(file, { start, end }));
  return new Response(body, { status: range ? 206 : 200, headers });
}

/**
 * Tek şema, birden çok kaynak: addRoute(host, async (request, parts) => Response).
 * register(protocol) uygulama hazır olunca bir kez çağrılır.
 */
function createFileProtocol() {
  const routes = new Map();
  return {
    addRoute(host, handler) { routes.set(host, handler); },
    register(protocol) {
      protocol.handle(FILE_SCHEME, async (request) => {
        try {
          const u = new URL(request.url);
          const handler = routes.get(u.hostname);
          if (!handler) return new Response("", { status: 404 });
          const parts = u.pathname.split("/").filter(Boolean).map((s) => decodeURIComponent(s));
          return (await handler(request, parts)) || new Response("", { status: 404 });
        } catch {
          return new Response("", { status: 500 });
        }
      });
    },
  };
}

module.exports = { FILE_SCHEME, SCHEME_PRIVILEGES, idOf, fileUrl, createRegistry, serveFile, createFileProtocol };
