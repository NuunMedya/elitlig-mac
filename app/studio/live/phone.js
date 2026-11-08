// Yayın Stüdyosu — TELEFON KAMERASI sunucusu (yerel ağ, HTTPS + WebSocket sinyalleşme).
//
//   telefon tarayıcısı ──https://<IP>:8787/p/<kod>──▶ sayfa (phonePage.js)
//        │  wss://<IP>:8787/ws/<kod>  (teklif / yanıt SDP, "yayında" ışığı, ayar)
//        ▼
//   bu sunucu (ana süreç) ──IPC──▶ arayüz (RTCPeerConnection yanıtlayıcı)
//
// Görüntü ana süreçten GEÇMEZ: WebRTC telefonla arayüz arasında doğrudan kurulur
// (STUN yok, yalnız yerel ağ adayları). Ana süreç yalnız iletileri taşır.
//
//   - Her telefon kaynağının kendi eşleme kodu vardır (kaynak ayarında saklanır:
//     uygulama yeniden açılınca aynı QR yine çalışır). Birden çok telefon aynı anda.
//   - Aynı koda ikinci telefon bağlanırsa eskisi "replaced" alır ve kapanır.
//   - mDNS (.local) adayları: tarayıcılar yerel IP'yi gizleyebilir. Her iki yönde
//     .local adaylarının yanına bağlantının gerçek IP'siyle bir kopya eklenir
//     (telefon → bilgisayar: telefonun IP'si; bilgisayar → telefon: telefonun
//     ulaştığı yerel adres). mDNS çözülemeyen ağlarda da bağlantı kurulur.
//   - Sertifika: cert.js (yerel kök + sunucu sertifikası, tek seferlik onay).
"use strict";

const os = require("node:os");
const https = require("node:https");
const crypto = require("node:crypto");
const { acceptUpgrade } = require("./ws");
const { loadOrCreate } = require("./cert");
const { PHONE_PAGE } = require("./phonePage");

const TOKEN_RE = /^[a-z0-9]{8,32}$/;
const PORTS = [8787, 8788, 8789, 8790, 8791, 8792];

/** Yerel ağ IPv4 adresleri (özel aralıklar önce; bağlantı yerel 169.254 ve iç adresler hariç). */
function lanAddresses(ifaces = os.networkInterfaces()) {
  const out = [];
  for (const [name, list] of Object.entries(ifaces || {})) {
    for (const a of list || []) {
      const fam = typeof a.family === "number" ? (a.family === 4 ? "IPv4" : "IPv6") : a.family;
      if (fam !== "IPv4" || a.internal || /^169\.254\./.test(a.address)) continue;
      out.push({ name, address: a.address });
    }
  }
  const rank = (x) => {
    const ip = x.address;
    const virtual = /^(docker|br-|veth|vmnet|vboxnet|utun|tun|tap|zt|tailscale|awdl|llw|bridge)/i.test(x.name) ? 10 : 0;
    if (/^192\.168\./.test(ip)) return 0 + virtual;
    if (/^10\./.test(ip)) return 1 + virtual;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return 2 + virtual;
    return 5 + virtual;
  };
  return [...new Set(out.sort((a, b) => rank(a) - rank(b)).map((x) => x.address))];
}

const newToken = () => crypto.randomBytes(8).toString("hex").slice(0, 12);

/**
 * SDP / aday dizgisindeki ".local" (mDNS) adaylarına gerçek IP'li kopya ekler.
 * Dönüş: yeni SDP (değişmediyse aynısı).
 */
function addIpCandidates(sdp, ip) {
  if (!sdp || !ip || !/\.local\b/.test(sdp)) return sdp;
  const lines = String(sdp).split(/\r\n|\n/);
  const out = [];
  for (const line of lines) {
    out.push(line);
    const m = /^a=candidate:(\S+) (\d+) (\S+) (\d+) (\S+\.local) (\d+) (typ host.*)$/i.exec(line);
    if (m) out.push(`a=candidate:${m[1]}9 ${m[2]} ${m[3]} ${Math.max(1, Number(m[4]) - 1)} ${ip} ${m[6]} ${m[7]}`);
  }
  return out.join("\r\n");
}

/** Tek aday dizgisi ("candidate:… x.local …") → IP'li kopya ya da null. */
function ipCandidate(candidate, ip) {
  const m = /^candidate:(\S+) (\d+) (\S+) (\d+) (\S+\.local) (\d+) (typ host.*)$/i.exec(String(candidate || ""));
  return m && ip ? `candidate:${m[1]}9 ${m[2]} ${m[3]} ${Math.max(1, Number(m[4]) - 1)} ${ip} ${m[6]} ${m[7]}` : null;
}

/**
 * Telefon sunucusu.
 *   certFile:   userData/studio-phone-cert.json
 *   onSignal(sourceId, msg)       telefondan gelen ileti (offer / state / battery / bye)
 *   onPresence(sourceId, info)    { connected, remote, device, since }
 */
function createPhoneServer({ certFile, onSignal = () => {}, onPresence = () => {}, log = () => {}, ports = PORTS, host = "0.0.0.0", addresses = () => lanAddresses() } = {}) {
  const tokens = new Map(); // kod → { sourceId, name }
  const bySource = new Map(); // kaynak → kod
  const conns = new Map(); // kod → { conn, remote, local, since, device }
  let server = null;
  let port = null;
  let starting = null;
  let cert = null;

  function presence(token) {
    const t = tokens.get(token);
    if (!t) return;
    const c = conns.get(token);
    onPresence(t.sourceId, c ? { connected: true, remote: c.remote, device: c.device || null, since: c.since } : { connected: false });
  }

  function handleRequest(req, res) {
    const url = new URL(req.url, "https://x");
    const p = url.pathname;
    const head = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" };
    if (p === "/ca.crt") {
      res.writeHead(200, { ...head, "Content-Type": "application/x-x509-ca-cert", "Content-Disposition": "attachment; filename=\"elitlig-yerel-kok.crt\"" });
      res.end(cert.caDer);
      return;
    }
    const m = /^\/p\/([a-z0-9]+)\/?$/.exec(p);
    if (m) {
      res.writeHead(200, {
        ...head,
        "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy": "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self' wss: ws:; media-src 'self' blob: mediastream:; img-src 'self' data:; base-uri 'none'; form-action 'none'",
        "Permissions-Policy": "camera=(self), microphone=(self)",
      });
      res.end(PHONE_PAGE);
      return;
    }
    if (p === "/" || p === "") {
      res.writeHead(200, { ...head, "Content-Type": "text/html; charset=utf-8" });
      res.end("<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width'><body style='font:16px -apple-system,sans-serif;background:#0b0612;color:#eee;padding:20px'><h3>Elitlig Araçlar · Telefon kamerası</h3><p>Stüdyoda <b>Kaynak ekle › Telefon kamerası</b> penceresindeki QR kodu okutun.</p><p><a style='color:#c4b5fd' href='/ca.crt'>Yerel sertifikayı yükle</a> (isteğe bağlı: uyarıyı kalıcı kaldırır).</p></body>");
      return;
    }
    res.writeHead(404, head);
    res.end();
  }

  function handleUpgrade(req, socket, head) {
    const m = /^\/ws\/([a-z0-9]+)$/.exec(new URL(req.url, "https://x").pathname);
    const conn = m ? acceptUpgrade(req, socket, head) : null;
    if (!conn) { if (!m) socket.destroy(); return; }
    const token = m[1];
    if (!tokens.has(token)) {
      conn.send(JSON.stringify({ t: "unknown" }));
      setTimeout(() => conn.close(4004, "unknown"), 50);
      return;
    }
    const prev = conns.get(token);
    if (prev) {
      try { prev.conn.send(JSON.stringify({ t: "replaced" })); prev.conn.close(4001, "replaced"); } catch { /* yoksay */ }
    }
    const entry = { conn, remote: conn.remoteAddress, local: conn.localAddress, since: Date.now(), device: null };
    conns.set(token, entry);
    log("telefon bağlandı", { remote: entry.remote });
    const name = tokens.get(token)?.name;
    if (name) conn.send(JSON.stringify({ t: "name", name }));
    presence(token);
    conn.on("message", (raw) => {
      if (typeof raw !== "string" || raw.length > 256 * 1024) return;
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }
      if (!msg || typeof msg.t !== "string") return;
      const t = tokens.get(token);
      if (!t || conns.get(token) !== entry) return;
      if (msg.t === "hello") {
        entry.device = deviceOf(msg.ua);
        presence(token);
      }
      if (msg.t === "offer" && typeof msg.sdp === "string") msg.sdp = addIpCandidates(msg.sdp, entry.remote);
      if (msg.t === "ice" && msg.candidate?.candidate) {
        onSignal(t.sourceId, msg);
        const extra = ipCandidate(msg.candidate.candidate, entry.remote);
        if (extra) onSignal(t.sourceId, { ...msg, candidate: { ...msg.candidate, candidate: extra } });
        return;
      }
      onSignal(t.sourceId, msg);
    });
    conn.on("close", () => {
      if (conns.get(token) !== entry) return;
      conns.delete(token);
      const t = tokens.get(token);
      if (t) onSignal(t.sourceId, { t: "bye" });
      presence(token);
    });
  }

  function listenOn(srv, p) {
    return new Promise((resolve, reject) => {
      const onErr = (e) => { srv.removeListener("listening", onOk); reject(e); };
      const onOk = () => { srv.removeListener("error", onErr); resolve(srv.address().port); };
      srv.once("error", onErr);
      srv.once("listening", onOk);
      srv.listen(p, host);
    });
  }

  /** Sunucuyu aç (bir kez). → { port, addresses } */
  function start() {
    if (server) return Promise.resolve({ port, addresses: addresses() });
    if (starting) return starting;
    starting = (async () => {
      const hosts = ["localhost", "127.0.0.1", ...addresses()];
      cert = loadOrCreate(certFile, hosts);
      const srv = https.createServer({ key: cert.key, cert: cert.cert, minVersion: "TLSv1.2" }, handleRequest);
      srv.on("upgrade", handleUpgrade);
      srv.on("tlsClientError", () => { /* telefon uyarıda bekliyor: yoksay */ });
      let lastErr = null;
      for (const p of [...ports, 0]) {
        try { port = await listenOn(srv, p); lastErr = null; break; } catch (e) { lastErr = e; }
      }
      if (lastErr) throw lastErr;
      server = srv;
      log("telefon sunucusu açıldı", { port });
      return { port, addresses: addresses() };
    })().finally(() => { starting = null; });
    return starting;
  }

  /** Kaynağı eşle (kayıtlı kod verilirse o). → { token, url, urls, port, fingerprint } */
  async function pair(sourceId, token = null, name = "") {
    const info = await start();
    const id = String(sourceId);
    let tok = TOKEN_RE.test(String(token || "")) ? String(token) : bySource.get(id) || newToken();
    const owner = tokens.get(tok);
    if (owner && owner.sourceId !== id) tok = newToken(); // çoğaltılmış kaynak aynı kodu alamaz
    const old = bySource.get(id);
    if (old && old !== tok) { tokens.delete(old); conns.get(old)?.conn.close(4002, "unpaired"); conns.delete(old); }
    tokens.set(tok, { sourceId: id, name: String(name || tokens.get(tok)?.name || "").slice(0, 60) });
    bySource.set(id, tok);
    const urls = info.addresses.map((a) => `https://${a}:${info.port}/p/${tok}`);
    presence(tok);
    return { token: tok, url: urls[0] || `https://127.0.0.1:${info.port}/p/${tok}`, urls, port: info.port, addresses: info.addresses, fingerprint: cert?.fingerprint || null };
  }

  function unpair(sourceId) {
    const id = String(sourceId);
    const tok = bySource.get(id);
    if (!tok) return false;
    bySource.delete(id);
    tokens.delete(tok);
    const c = conns.get(tok);
    if (c) { conns.delete(tok); try { c.conn.close(4002, "unpaired"); } catch { /* yoksay */ } }
    return true;
  }

  /** Telefona ileti (answer / ice / tally / config / renegotiate). */
  function send(sourceId, msg) {
    const tok = bySource.get(String(sourceId));
    const c = tok && conns.get(tok);
    if (!c || !msg || typeof msg.t !== "string") return false;
    let m = msg;
    if (m.t === "answer" && typeof m.sdp === "string") m = { ...m, sdp: addIpCandidates(m.sdp, c.local) };
    c.conn.send(JSON.stringify(m));
    if (m.t === "ice" && m.candidate?.candidate) {
      const extra = ipCandidate(m.candidate.candidate, c.local);
      if (extra) c.conn.send(JSON.stringify({ ...m, candidate: { ...m.candidate, candidate: extra } }));
    }
    return true;
  }

  const connected = (sourceId) => { const tok = bySource.get(String(sourceId)); return Boolean(tok && conns.has(tok)); };

  function stop() {
    for (const c of conns.values()) { try { c.conn.close(1001, "closing"); } catch { /* yoksay */ } }
    conns.clear();
    try { server?.close(); } catch { /* yoksay */ }
    server = null;
  }

  return { start, pair, unpair, send, connected, stop, port: () => port, addresses };
}

/** Tarayıcı kimliğinden kısa cihaz adı. */
function deviceOf(ua) {
  const s = String(ua || "");
  if (/iPhone/.test(s)) return "iPhone";
  if (/iPad/.test(s)) return "iPad";
  const a = /Android [\d.]+; ([^;)]+?)(?: Build|\))/.exec(s);
  if (a) return a[1].trim().slice(0, 40);
  if (/Android/.test(s)) return "Android";
  if (/Macintosh/.test(s)) return "Mac";
  if (/Windows/.test(s)) return "Windows";
  return "Tarayıcı";
}

module.exports = { createPhoneServer, lanAddresses, addIpCandidates, ipCandidate, deviceOf, newToken };
