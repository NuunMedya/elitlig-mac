// elitlig-media:// — uzak görseller / sohbet ekleri ana süreç üzerinden (disk önbellekli). 2.36.0:
// main.js'ten ayrıldı; Elitlig Stüdyo da (takım armaları, logo, oyuncu fotoğrafları) kullanır.
// Arayüzün güvenlik politikası dış adreslerden ses / video çalmaya izin vermediği için de gerekir.
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { mimeOf } = require("./chat");

const MEDIA_SCHEME = "elitlig-media";
const MEDIA_CACHE_MAX = 40 * 1024 * 1024;
const MEDIA_PRIVILEGES = { scheme: MEDIA_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } };

/** deps: { dataDir: () => string, fetch: (url, init) => Promise<Response>, userAgent: () => string } */
function createMediaProxy({ dataDir, fetch, userAgent }) {
  const mediaDir = () => path.join(dataDir(), "media");
  /** Eki getirir: önce disk önbelleği, sonra ağ (yalnız http/https). */
  async function fetchMedia(url) {
    if (!/^https?:\/\//i.test(url)) return null;
    const key = crypto.createHash("sha1").update(url).digest("hex");
    const file = path.join(mediaDir(), key);
    try {
      const meta = JSON.parse(fs.readFileSync(`${file}.json`, "utf8"));
      return { body: fs.readFileSync(file), type: meta.type || "application/octet-stream" };
    } catch { /* önbellekte yok */ }
    try {
      const res = await fetch(url, { headers: { "User-Agent": userAgent() } });
      if (!res.ok) return null;
      const body = Buffer.from(await res.arrayBuffer());
      const type = res.headers.get("content-type") || mimeOf(url.split("?")[0]);
      if (body.length <= MEDIA_CACHE_MAX) {
        fs.mkdirSync(mediaDir(), { recursive: true });
        fs.writeFileSync(file, body);
        fs.writeFileSync(`${file}.json`, JSON.stringify({ url, type, at: Date.now() }));
      }
      return { body, type };
    } catch {
      return null;
    }
  }
  function register(protocol) {
    protocol.handle(MEDIA_SCHEME, async (request) => {
      const u = new URL(request.url);
      const target = decodeURIComponent(u.pathname.replace(/^\//, ""));
      const media = await fetchMedia(target);
      if (!media) return new Response("", { status: 404 });
      return new Response(media.body, { status: 200, headers: { "Content-Type": media.type, "Content-Length": String(media.body.length), "Cache-Control": "max-age=31536000" } });
    });
  }
  return { fetchMedia, register };
}

module.exports = { MEDIA_SCHEME, MEDIA_PRIVILEGES, createMediaProxy };
