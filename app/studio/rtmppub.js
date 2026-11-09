// Yayın Stüdyosu — Node RTMP(S) yayıncısı (aktarıcının ağ ucu).
//
// NEDEN (2.21.0, ölçüldü — app/test/studio-rtmppub.test.js ve tanılama notları):
// ffmpeg'in yerleşik RTMP istemcisi giden parça (chunk) boyunu 128 baytta bırakır ve
// her 128 baytlık parçayı + aradaki 1 baytlık parça başlığını AYRI send() çağrısıyla
// yazar (12 Mbps'te ~23 000 çağrı/sn). Bizim -tcp_nodelay 1 ile birlikte macOS'ta
// (Linux'taki "autocorking" yok) her çağrı ayrı TCP paketi olur: 12 Mbps görüntü kablo
// üstünde ~21 Mbps, ~22 000 paket/sn tuttu (paketlerin %99,9'u < 300 bayt). Wi-Fi /
// ev yönlendiricisinde paket başı maliyet yüzünden bağlantı OBS'in rahatça taşıdığı
// hızın yarısında bile tıkanıyordu. RTMPS'te her küçük yazma ayrı TLS kaydı (+29 bayt).
//
// Bu modül OBS gibi yayınlar: 4096 baytlık parçalar (Set Chunk Size), her FLV etiketi
// tek bir arabellek, bir veri olayındaki etiketler tek yazma (cork/uncork). ffmpeg yalnız
// TS → FLV yeniden paketlemesini yapar (-c copy, stdout'a FLV); RTMP el sıkışması,
// connect / createStream / publish ve parçalama burada.
//
// Ölçüm (gerçek, uydurma değil): sunucunun Acknowledgement iletileri (YouTube Window Ack
// Size gönderir) → sunucunun ALDIĞI bayt; soket yazma sayaçları → çekirdeğe verilen bayt;
// soket kuyruğu (henüz çekirdeğe verilemeyen) → ağ yetişmiyorsa büyür.
//
// Electron'a bağlı değildir; bağlantı fabrikası dışarıdan verilebilir (testler).
"use strict";

const net = require("node:net");
const tls = require("node:tls");
const crypto = require("node:crypto");
const { EventEmitter } = require("node:events");

const OUT_CHUNK = 4096;
const WINDOW_DEFAULT = 2500000;
const CS_CONTROL = 2;
const CS_COMMAND = 3;
const CS_AUDIO = 4;
const CS_DATA = 5;
const CS_VIDEO = 6;

/* --------------------------------- AMF0 --------------------------------- */

function amfEncode(v) {
  if (v === null || v === undefined) return Buffer.from([5]);
  if (typeof v === "number") { const b = Buffer.alloc(9); b[0] = 0; b.writeDoubleBE(v, 1); return b; }
  if (typeof v === "boolean") return Buffer.from([1, v ? 1 : 0]);
  if (typeof v === "string") {
    const s = Buffer.from(v, "utf8");
    const b = Buffer.alloc(3); b[0] = 2; b.writeUInt16BE(s.length, 1);
    return Buffer.concat([b, s]);
  }
  const parts = [Buffer.from([3])];
  for (const [k, val] of Object.entries(v)) {
    const kb = Buffer.from(k, "utf8");
    const l = Buffer.alloc(2); l.writeUInt16BE(kb.length);
    parts.push(l, kb, amfEncode(val));
  }
  parts.push(Buffer.from([0, 0, 9]));
  return Buffer.concat(parts);
}

function amfDecode(buf) {
  let o = 0;
  const out = [];
  const one = () => {
    const t = buf[o++];
    if (t === 0) { const v = buf.readDoubleBE(o); o += 8; return v; }
    if (t === 1) return buf[o++] !== 0;
    if (t === 2) { const l = buf.readUInt16BE(o); o += 2; const s = buf.toString("utf8", o, o + l); o += l; return s; }
    if (t === 12) { const l = buf.readUInt32BE(o); o += 4; const s = buf.toString("utf8", o, o + l); o += l; return s; }
    if (t === 3 || t === 8) {
      if (t === 8) o += 4;
      const obj = {};
      for (;;) {
        const l = buf.readUInt16BE(o); o += 2;
        if (l === 0 && buf[o] === 9) { o += 1; return obj; }
        const k = buf.toString("utf8", o, o + l); o += l;
        obj[k] = one();
      }
    }
    if (t === 5 || t === 6) return null;
    if (t === 10) { const n = buf.readUInt32BE(o); o += 4; const a = []; for (let i = 0; i < n; i += 1) a.push(one()); return a; }
    if (t === 11) { const v = buf.readDoubleBE(o); o += 10; return v; }
    throw new Error(`AMF türü ${t}`);
  };
  try { while (o < buf.length) out.push(one()); } catch { /* kalan çözülemedi: elde olan yeter */ }
  return out;
}

/* ------------------------------- parçalama ------------------------------- */

/**
 * Bir RTMP iletisini parçalara böler (tek Buffer): ilk parça fmt 0 (mutlak zaman damgası),
 * sonrakiler 1 baytlık fmt 3 başlığıyla. Zaman damgası ≥ 0xFFFFFF ise genişletilmiş damga
 * (4 bayt) her parçada yazılır (ffmpeg / librtmp ile aynı).
 */
function chunkMessage({ csid, type, streamId = 0, timestamp = 0, payload, chunkSize = OUT_CHUNK }) {
  const ts = Math.max(0, Math.floor(timestamp)) >>> 0;
  const ext = ts >= 0xffffff;
  const n = Math.max(1, Math.ceil(payload.length / chunkSize));
  const size = 12 + (ext ? 4 : 0) + payload.length + (n - 1) * (1 + (ext ? 4 : 0));
  const out = Buffer.allocUnsafe(size);
  let o = 0;
  out[o++] = csid & 0x3f;
  out.writeUIntBE(ext ? 0xffffff : ts, o, 3); o += 3;
  out.writeUIntBE(payload.length, o, 3); o += 3;
  out[o++] = type;
  out.writeUInt32LE(streamId >>> 0, o); o += 4;
  if (ext) { out.writeUInt32BE(ts, o); o += 4; }
  for (let off = 0; off < payload.length || off === 0; off += chunkSize) {
    if (off) {
      out[o++] = 0xc0 | (csid & 0x3f);
      if (ext) { out.writeUInt32BE(ts, o); o += 4; }
    }
    const end = Math.min(payload.length, off + chunkSize);
    payload.copy(out, o, off, end);
    o += end - off;
    if (!payload.length) break;
  }
  return out;
}

/* ------------------------------ FLV okuyucu ------------------------------ */

/** ffmpeg'in stdout'a yazdığı FLV akışı → { type, timestamp, data } etiketleri. */
function createFlvReader() {
  let buf = Buffer.alloc(0);
  let headerDone = false;
  return {
    feed(chunk) {
      buf = buf.length ? Buffer.concat([buf, chunk]) : chunk;
      const tags = [];
      if (!headerDone) {
        if (buf.length < 13) return tags;
        if (buf[0] !== 0x46 || buf[1] !== 0x4c || buf[2] !== 0x56) throw new Error("FLV başlığı bekleniyordu");
        const off = buf.readUInt32BE(5);
        if (buf.length < off + 4) return tags;
        buf = buf.subarray(off + 4);
        headerDone = true;
      }
      let o = 0;
      while (buf.length - o >= 11) {
        const type = buf[o] & 0x1f;
        const len = buf.readUIntBE(o + 1, 3);
        if (buf.length - o < 11 + len + 4) break;
        const timestamp = (buf.readUIntBE(o + 4, 3) | (buf[o + 7] << 24)) >>> 0;
        tags.push({ type, timestamp, data: buf.subarray(o + 11, o + 11 + len) });
        o += 11 + len + 4;
      }
      buf = o ? (o >= buf.length ? Buffer.alloc(0) : Buffer.from(buf.subarray(o))) : buf;
      return tags;
    },
    pending: () => buf.length,
  };
}

/* ----------------------------- el sıkışma ----------------------------- */

// ffmpeg'in (libavformat/rtmpproto.c) yayın el sıkışmasıyla aynı: C1'de Flash Player
// sürümü (9.0.124.2) ve HMAC-SHA256 özeti; C2 sunucunun S1'inin yankısı. Bugünkü yol
// (ffmpeg) YouTube'da bu el sıkışmayla çalışıyor.
const FP_KEY = Buffer.from("Genuine Adobe Flash Player 001", "latin1");

function digestPos(buf, off = 8, mod = 728, add = 12) {
  return ((buf[off] + buf[off + 1] + buf[off + 2] + buf[off + 3]) % mod) + add;
}

function handshakeC1() {
  const c1 = crypto.randomBytes(1536);
  c1.writeUInt32BE(0, 0);
  c1[4] = 9; c1[5] = 0; c1[6] = 124; c1[7] = 2;
  const pos = digestPos(c1);
  const h = crypto.createHmac("sha256", FP_KEY);
  h.update(c1.subarray(0, pos));
  h.update(c1.subarray(pos + 32));
  h.digest().copy(c1, pos);
  return c1;
}

/* ------------------------------- adres ------------------------------- */

/** rtmp(s)://sunucu[:port]/uygulama/anahtar[?…] → { tls, host, port, app, key, tcUrl } | null */
function parseRtmpUrl(url) {
  const m = /^(rtmps?):\/\/([^/:?#]+|\[[^\]]+\])(?::(\d+))?\/([^/?#]+)\/(.+)$/i.exec(String(url || "").trim());
  if (!m) return null;
  const secure = m[1].toLowerCase() === "rtmps";
  const host = m[2].replace(/^\[|\]$/g, "");
  const port = m[3] ? Number(m[3]) : secure ? 443 : 1935;
  return { tls: secure, host, port, app: m[4], key: m[5], tcUrl: `${m[1].toLowerCase()}://${m[2]}${m[3] ? `:${m[3]}` : ""}/${m[4]}` };
}

/* ------------------------------ yayıncı ------------------------------ */

const PUB_MESSAGES = {
  rejected: (code, desc) => `Yayın sunucusu yayını kabul etmedi (${code}${desc ? `: ${desc}` : ""}).`,
  handshake: "Yayın sunucusuyla RTMP el sıkışması tamamlanamadı.",
  closed: "Yayın sunucusu bağlantıyı kapattı.",
  badUrl: "Yayın adresi çözümlenemedi.",
};

/**
 * createRtmpPublisher({ url, connect?, now?, chunkSize?, connectTimeoutMs? })
 *   .start()                  bağlanır, el sıkışır, yayını açar ("publishing" olayı)
 *   .writeFlv(buf)            ffmpeg FLV çıktısı (yayın açılana dek bekletilir)
 *   .stats()                  { sentBytes, ackedBytes, queuedBytes, publishing, … }
 *   .end() / .destroy()
 * Olaylar: "publishing", "error" (Error{code}), "close", "drain".
 */
function createRtmpPublisher({ url, connect = null, now = () => Date.now(), chunkSize = OUT_CHUNK, connectTimeoutMs = 20000, pauseBytes = 1024 * 1024, tlsOptions = {}, setTimeoutImpl = setTimeout, clearTimeoutImpl = clearTimeout } = {}) {
  const events = new EventEmitter();
  const target = parseRtmpUrl(url);
  let sock = null;
  let phase = "idle"; // idle | handshake | connect | publish | publishing | closed
  let inBuf = Buffer.alloc(0);
  let inChunk = 128;
  let windowAck = WINDOW_DEFAULT;
  let windowAnnounced = false; // sunucu Window Acknowledgement Size gönderdi mi (onay bekleyebilir miyiz)
  let received = 0;
  let lastAckSent = 0;
  let ackedBytes = 0; // sunucunun bildirdiği (aldığı) bayt
  let ackAt = null;
  let streamId = 0;
  let txn = 1;
  const pendingTx = new Map();
  const cs = new Map();
  const reader = createFlvReader();
  let early = []; // yayın açılmadan gelen FLV etiketleri (başlık + ilk GOP)
  let earlyBytes = 0;
  let mediaBytes = 0;
  let headerBytes = 0; // RTMP'nin kendi baytları (el sıkışma, komutlar)
  let closed = false;
  let failed = false;
  let timer = null;
  let firstTs = null;
  let lastTs = 0;
  let startedAt = null;

  const fail = (code, message) => {
    if (failed || closed) return;
    failed = true;
    const e = new Error(message);
    e.code = code;
    events.emit("error", e);
    destroy();
  };

  function write(buf) {
    if (!sock || sock.destroyed) return false;
    return sock.write(buf);
  }

  function sendCommand(name, args = [], { csid = CS_COMMAND, sid = 0, expect = false } = {}) {
    const id = expect ? txn++ : 0;
    const payload = Buffer.concat([amfEncode(name), amfEncode(id), ...args.map(amfEncode)]);
    headerBytes += payload.length;
    if (expect) pendingTx.set(id, name);
    write(chunkMessage({ csid, type: 20, streamId: sid, timestamp: 0, payload, chunkSize }));
    return id;
  }

  function start() {
    if (!target) { setImmediate(() => fail("BAD_URL", PUB_MESSAGES.badUrl)); return; }
    startedAt = now();
    const opts = { host: target.host, port: target.port };
    const s = connect ? connect({ ...target })
      : target.tls ? tls.connect({ ...opts, servername: net.isIP(target.host) ? undefined : target.host, ...tlsOptions })
        : net.connect(opts);
    sock = s;
    try { s.setNoDelay(true); } catch { /* yoksay */ }
    try { s.setKeepAlive(true, 10000); } catch { /* yoksay */ }
    timer = setTimeoutImpl(() => { if (phase !== "publishing") fail("TIMEOUT", "Yayın sunucusuna bağlanılamadı (zaman aşımı)."); }, connectTimeoutMs);
    s.on(target.tls && !connect ? "secureConnect" : "connect", () => {
      phase = "handshake";
      write(Buffer.concat([Buffer.from([3]), handshakeC1()]));
    });
    s.on("data", onData);
    s.on("drain", () => events.emit("drain"));
    s.on("error", (e) => {
      const code = e.code === "ECONNREFUSED" ? "CONNECTION_REFUSED" : e.code === "ENOTFOUND" || e.code === "EAI_AGAIN" ? "DNS" : e.code === "ETIMEDOUT" ? "TIMEOUT" : /certificate|SSL|TLS|ERR_TLS|self.signed|UNABLE_TO|CERT_/i.test(`${e.code} ${e.message}`) ? "TLS" : "IO";
      fail(code, e.message || String(e.code || "IO"));
    });
    s.on("close", () => {
      if (!failed && !closed) fail(phase === "publishing" ? "IO" : "HANDSHAKE", phase === "publishing" ? PUB_MESSAGES.closed : PUB_MESSAGES.handshake);
      closed = true;
      if (timer) { clearTimeoutImpl(timer); timer = null; }
      events.emit("close");
    });
  }

  function onData(d) {
    received += d.length;
    inBuf = inBuf.length ? Buffer.concat([inBuf, d]) : d;
    if (phase === "handshake") {
      if (inBuf.length < 1 + 1536 + 1536) return;
      const s1 = inBuf.subarray(1, 1537);
      inBuf = inBuf.subarray(1 + 1536 + 1536);
      // C2 = S1'in yankısı.
      write(s1);
      phase = "connect";
      // Önce parça boyu: sunucu bizim iletilerimizi 4096'lık parçalarla okur.
      const cs4 = Buffer.alloc(4); cs4.writeUInt32BE(chunkSize);
      write(chunkMessage({ csid: CS_CONTROL, type: 1, payload: cs4, chunkSize: 128 }));
      sendCommand("connect", [{ app: target.app, type: "nonprivate", flashVer: "FMLE/3.0 (compatible; FMSc/1.0)", swfUrl: target.tcUrl, tcUrl: target.tcUrl }], { expect: true });
    }
    if (phase === "handshake") return;
    try { parseChunks(); } catch (e) { fail("IO", `RTMP çözümleme hatası: ${e.message}`); }
    if (received - lastAckSent >= windowAck) {
      lastAckSent = received;
      const a = Buffer.alloc(4); a.writeUInt32BE(received >>> 0);
      write(chunkMessage({ csid: CS_CONTROL, type: 3, payload: a, chunkSize }));
    }
  }

  function parseChunks() {
    for (;;) {
      if (inBuf.length < 1) return;
      let o = 1;
      const fmt = inBuf[0] >> 6;
      let csid = inBuf[0] & 0x3f;
      if (csid === 0) { if (inBuf.length < 2) return; csid = 64 + inBuf[1]; o = 2; } else if (csid === 1) { if (inBuf.length < 3) return; csid = 64 + inBuf[1] + inBuf[2] * 256; o = 3; }
      const st = cs.get(csid) || { ts: 0, delta: 0, len: 0, type: 0, sid: 0, parts: [], got: 0, ext: false };
      const hl = [11, 7, 3, 0][fmt];
      if (inBuf.length < o + hl) return;
      let ts = null;
      let ext = st.ext;
      if (fmt <= 2) { ts = inBuf.readUIntBE(o, 3); ext = ts === 0xffffff; }
      let { len, type, sid } = st;
      if (fmt <= 1) { len = inBuf.readUIntBE(o + 3, 3); type = inBuf[o + 6]; }
      if (fmt === 0) sid = inBuf.readUInt32LE(o + 7);
      o += hl;
      if (ext) { if (inBuf.length < o + 4) return; ts = inBuf.readUInt32BE(o); o += 4; }
      const need = Math.min(inChunk, len - st.got);
      if (inBuf.length < o + need) return;
      if (st.got === 0) {
        if (fmt === 0) st.ts = ts;
        else if (fmt === 1 || fmt === 2) { st.delta = ts; st.ts += ts; } else st.ts += st.delta;
      }
      Object.assign(st, { len, type, sid, ext });
      st.parts.push(inBuf.subarray(o, o + need));
      st.got += need;
      inBuf = inBuf.subarray(o + need);
      cs.set(csid, st);
      if (st.got >= st.len) {
        const payload = st.parts.length === 1 ? Buffer.from(st.parts[0]) : Buffer.concat(st.parts);
        st.parts = [];
        st.got = 0;
        onMessage(st.type, payload, st.sid);
        if (failed || closed) return;
      }
    }
  }

  function onMessage(type, payload) {
    switch (type) {
      case 1: inChunk = payload.readUInt32BE(0) & 0x7fffffff; return;
      case 3: {
        // Sunucunun aldığı toplam bayt (32 bit, sarar).
        const seq = payload.readUInt32BE(0);
        const prev = ackedBytes;
        const low = prev % 2 ** 32;
        ackedBytes = prev - low + seq + (seq < low ? 2 ** 32 : 0);
        ackAt = now();
        events.emit("ack", ackedBytes);
        return;
      }
      case 4: {
        const ev = payload.readUInt16BE(0);
        if (ev === 6) { // ping isteği → yanıt
          const r = Buffer.alloc(6); r.writeUInt16BE(7, 0); payload.copy(r, 2, 2, 6);
          write(chunkMessage({ csid: CS_CONTROL, type: 4, payload: r, chunkSize }));
        }
        return;
      }
      case 5: windowAck = payload.readUInt32BE(0) || WINDOW_DEFAULT; windowAnnounced = true; return;
      case 20: case 17: onCommand(amfDecode(type === 17 ? payload.subarray(1) : payload)); return;
      default:
    }
  }

  function onCommand([name, id, , info]) {
    const pending = pendingTx.get(id);
    if (pending) pendingTx.delete(id);
    if (name === "_error") {
      const code = info?.code || "";
      fail(/Rejected|BadName|Unauthori/i.test(code) ? "AUTH" : "REJECTED", PUB_MESSAGES.rejected(code || pending || "_error", info?.description));
      return;
    }
    if (name === "_result" && pending === "connect") {
      sendCommand("releaseStream", [null, target.key], { expect: true });
      sendCommand("FCPublish", [null, target.key], { expect: true });
      sendCommand("createStream", [null], { expect: true });
      return;
    }
    if (name === "_result" && pending === "createStream") {
      streamId = typeof info === "number" ? info : 1;
      phase = "publish";
      sendCommand("publish", [null, target.key, "live"], { csid: CS_AUDIO, sid: streamId });
      return;
    }
    if (name === "onStatus") {
      const code = String(info?.code || "");
      const level = String(info?.level || "");
      if (code === "NetStream.Publish.Start") { onPublishing(); return; }
      if (level === "error" || /Failed|Rejected|BadName|Unauthori|Error/i.test(code)) {
        fail(/BadName|Rejected|Unauthori/i.test(code) ? "AUTH" : "REJECTED", PUB_MESSAGES.rejected(code, info?.description));
      }
    }
  }

  function onPublishing() {
    if (phase === "publishing") return;
    phase = "publishing";
    if (timer) { clearTimeoutImpl(timer); timer = null; }
    events.emit("publishing");
    const q = early;
    early = [];
    earlyBytes = 0;
    sendTags(q);
  }

  /** Yapılandırma etiketi mi: betik (onMetaData), AVC dizi başlığı, AAC AudioSpecificConfig. */
  const isHeaderTag = (type, data) => type === 18 || (type === 9 && (data[0] & 0x0f) === 7 && data[1] === 0) || (type === 8 && (data[0] >> 4) === 10 && data[1] === 0);

  /** FLV etiketleri → RTMP iletileri; tek yazma (cork). */
  function sendTags(tags) {
    if (!tags.length || !sock || sock.destroyed) return;
    sock.cork();
    for (const t of tags) {
      let payload = t.data;
      let csid = CS_VIDEO;
      if (t.type === 8) csid = CS_AUDIO;
      else if (t.type === 18) {
        csid = CS_DATA;
        // FLV betik etiketi (onMetaData) → "@setDataFrame" önekiyle (ffmpeg / OBS ile aynı).
        payload = Buffer.concat([amfEncode("@setDataFrame"), payload]);
      } else if (t.type !== 9) continue;
      if (t.type === 9 || t.type === 8) {
        mediaBytes += payload.length;
        if (t.type === 9) { if (firstTs === null) firstTs = t.timestamp; lastTs = t.timestamp; }
      }
      write(chunkMessage({ csid, type: t.type, streamId, timestamp: t.timestamp, payload, chunkSize }));
    }
    sock.uncork();
  }

  function writeFlv(buf) {
    if (failed || closed) return false;
    let tags;
    try { tags = reader.feed(buf); } catch (e) { fail("IO", e.message); return false; }
    if (phase !== "publishing") {
      // Yayın açılana dek: başlık etiketleri (onMetaData, AVC / AAC yapılandırması) + SON GOP
      // tutulur; yeni anahtar kare gelince eski görüntü atılır (açılışta saniyelerce birikmiş
      // veri bir anda gönderilip gecikme yaratmasın; akış her zaman anahtar kareyle başlar).
      for (const t of tags) {
        const data = Buffer.from(t.data);
        if (!isHeaderTag(t.type, data) && t.type === 9 && (data[0] >> 4) === 1) {
          early = early.filter((x) => isHeaderTag(x.type, x.data));
          earlyBytes = early.reduce((n, x) => n + x.data.length, 0);
        }
        early.push({ ...t, data });
        earlyBytes += data.length;
      }
      return earlyBytes < 32 * 1024 * 1024;
    }
    sendTags(tags);
    return !sock || sock.writableLength < pauseBytes;
  }

  function stats() {
    const written = sock ? sock.bytesWritten || 0 : 0;
    const queued = sock ? sock.writableLength || 0 : 0;
    return {
      phase,
      publishing: phase === "publishing",
      chunkSize,
      tls: Boolean(target?.tls),
      sentBytes: Math.max(0, written - queued), // çekirdeğe verilen
      queuedBytes: queued, // uygulama kuyruğunda (çekirdek tamponu dolu)
      ackedBytes, // sunucunun aldığını bildirdiği (Window Ack Size'a bağlı, 0: sunucu bildirmiyor)
      ackAt,
      windowAck,
      windowAnnounced,
      mediaBytes,
      firstTs,
      lastTs,
      startedAt,
      earlyBytes,
    };
  }

  function end() {
    if (!sock || closed) return;
    try {
      if (phase === "publishing" && streamId) {
        sendCommand("FCUnpublish", [null, target.key]);
        sendCommand("deleteStream", [null, streamId]);
      }
    } catch { /* yoksay */ }
    closed = true;
    try { sock.end(); } catch { /* yoksay */ }
  }

  function destroy() {
    closed = true;
    if (timer) { clearTimeoutImpl(timer); timer = null; }
    try { sock?.destroy(); } catch { /* yoksay */ }
  }

  return { start, writeFlv, stats, end, destroy, events, target, isPublishing: () => phase === "publishing" };
}

module.exports = { createRtmpPublisher, createFlvReader, chunkMessage, parseRtmpUrl, amfEncode, amfDecode, OUT_CHUNK, PUB_MESSAGES };
