// Yayın Stüdyosu — CANLI GİRİŞ kaynakları (ana süreç kaydı).
//
//   telefon kamerası   phone.js  (HTTPS + WebSocket sinyalleşme; WebRTC arayüzde)
//   RTMP / SRT girişi  feeds.js  (ffmpeg dinleyici → fMP4 → arayüzde MSE)
//   ağ akışı / IP kam. feeds.js  (ffmpeg çekme: RTSP / HLS / HTTP-FLV / RTMP / SRT)
//   web sayfası        web.js    (ekran dışı pencere → değişen bölge BGRA)
//
// IPC (preload "studio.live"):
//   invoke: studio:live:info, studio:live:phone:pair (kaynak, kod?, ad?), studio:live:phone:unpair,
//           studio:live:feed:start (kaynak, ayar), studio:live:feed:stop, studio:live:feed:transcode,
//           studio:live:web:open (kaynak, ayar), studio:live:web:close, studio:live:web:reload, studio:live:web:refresh
//   send:   studio:live:phone:send { id, msg }
//   olay:   studio:live:phone:signal { id, msg }, studio:live:phone:presence { id, … },
//           studio:live:feed:data { id, gen, data }, studio:live:feed:status { id, … },
//           studio:live:web:frame { id, gen, x, y, w, h, width, height, data }, studio:live:web:status { id, … }
// Veri olayları yalnız kaynağı açan pencereye gider.
"use strict";

const path = require("node:path");
const { createPhoneServer, lanAddresses } = require("./phone");
const { createFeeds, publishUrls, normalizeFeedSpec } = require("./feeds");
const { createWebSources } = require("./web");
const ff = require("../ffmpeg");

function registerLive({ ipcMain, app, BrowserWindow = null, electronSession = null, getFfmpeg, ownContents = () => true, log = () => {} }) {
  const owners = new Map(); // "kind:id" → webContents
  const sendTo = (key, channel, payload) => {
    const wc = owners.get(key);
    if (wc && !wc.isDestroyed()) wc.send(channel, payload);
  };
  const own = (key, wc) => { owners.set(key, wc); };

  /* ------------------------------ telefon ------------------------------ */
  const phone = createPhoneServer({
    certFile: path.join(app.getPath("userData"), "studio-phone-cert.json"),
    log: (m, d) => log(`studio telefon: ${m}`, d),
    onSignal: (id, msg) => sendTo(`phone:${id}`, "studio:live:phone:signal", { id, msg }),
    onPresence: (id, info) => sendTo(`phone:${id}`, "studio:live:phone:presence", { id, ...info }),
  });
  ipcMain.handle("studio:live:phone:pair", async (event, id, token, name) => {
    if (!ownContents(event.sender)) return { ok: false, error: { code: "FORBIDDEN", message: "İzin yok." } };
    own(`phone:${id}`, event.sender);
    try { return { ok: true, ...(await phone.pair(id, token, name)) }; } catch (e) {
      return { ok: false, error: { code: e.code || "PHONE", message: `Telefon sunucusu açılamadı: ${e.message}` } };
    }
  });
  ipcMain.handle("studio:live:phone:unpair", (_e, id) => { owners.delete(`phone:${id}`); return phone.unpair(id); });
  ipcMain.on("studio:live:phone:send", (event, payload) => {
    if (!payload || !ownContents(event.sender)) return;
    phone.send(payload.id, payload.msg);
  });

  /* ------------------------------ ağ girişleri ------------------------------ */
  let protocols = null;
  const probeProtocols = async () => {
    if (protocols) return protocols;
    const info = await getFfmpeg();
    if (!info?.available) return { rtmp: false, srt: false, rtsp: false, hls: false };
    try {
      const r = await ff.run(info.path, ["-hide_banner", "-protocols"], { timeout: 8000 });
      const text = `${r.stdout || ""}`;
      const input = text.split(/Output:/i)[0] || text;
      const has = (p) => new RegExp(`^\\s*${p}\\s*$`, "m").test(input);
      protocols = { rtmp: has("rtmp"), srt: has("srt"), rtsp: true, hls: has("http") || has("https"), https: has("https") };
    } catch { protocols = { rtmp: true, srt: false, rtsp: true, hls: true }; }
    return protocols;
  };
  const feeds = createFeeds({
    getFfmpeg,
    log: (m, d) => log(`studio giriş: ${m}`, d),
    onData: (id, chunk) => sendTo(`feed:${id}`, "studio:live:feed:data", { id, gen: chunk.gen, data: chunk.data }),
    onStatus: (id, st) => sendTo(`feed:${id}`, "studio:live:feed:status", { id, ...st }),
  });
  ipcMain.handle("studio:live:feed:start", async (event, id, spec) => {
    if (!ownContents(event.sender)) return { ok: false, error: { code: "FORBIDDEN", message: "İzin yok." } };
    const norm = normalizeFeedSpec(spec || {});
    if (norm.error) return { ok: false, error: norm.error };
    if (norm.mode === "listen" && norm.protocol === "srt") {
      const p = await probeProtocols();
      if (!p.srt) return { ok: false, error: { code: "NO_SRT", message: "Bu ffmpeg derlemesi SRT desteklemiyor; RTMP kullanın." } };
    }
    own(`feed:${id}`, event.sender);
    const r = feeds.start(String(id), spec || {});
    if (!r.ok) return r;
    return { ...r, urls: r.spec.mode === "listen" ? publishUrls(r.spec, lanAddresses()) : [] };
  });
  ipcMain.handle("studio:live:feed:stop", (_e, id) => { owners.delete(`feed:${id}`); return feeds.stop(String(id)); });
  ipcMain.handle("studio:live:feed:transcode", (_e, id) => feeds.requestTranscode(String(id)));

  /* ------------------------------ web sayfası ------------------------------ */
  const web = createWebSources({
    BrowserWindow,
    session: electronSession,
    log: (m, d) => log(`studio web: ${m}`, d),
    send: (id, frame) => sendTo(`web:${id}`, "studio:live:web:frame", frame),
    onStatus: (id, st) => sendTo(`web:${id}`, "studio:live:web:status", { id, ...st }),
  });
  ipcMain.handle("studio:live:web:open", (event, id, spec) => {
    if (!ownContents(event.sender)) return { ok: false, error: { code: "FORBIDDEN", message: "İzin yok." } };
    own(`web:${id}`, event.sender);
    return web.open(String(id), spec || {});
  });
  ipcMain.handle("studio:live:web:close", (_e, id) => { owners.delete(`web:${id}`); return web.close(String(id)); });
  ipcMain.handle("studio:live:web:reload", (_e, id) => web.reload(String(id)));
  ipcMain.handle("studio:live:web:refresh", (_e, id) => web.refresh(String(id)));

  ipcMain.handle("studio:live:info", async () => ({
    addresses: lanAddresses(),
    phonePort: phone.port(),
    protocols: await probeProtocols().catch(() => null),
    platform: process.platform,
  }));

  return {
    phone, feeds, web,
    dispose() {
      try { feeds.dispose(); } catch { /* yoksay */ }
      try { web.dispose(); } catch { /* yoksay */ }
      try { phone.stop(); } catch { /* yoksay */ }
    },
  };
}

module.exports = { registerLive };
