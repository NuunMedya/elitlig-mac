// Yayın Stüdyosu — en küçük WebSocket sunucu ucu (RFC 6455; bağımlılıksız).
//
// Telefon kamerası sayfası sinyalleşmeyi (SDP / ICE, ayar, "yayında" ışığı) bu
// bağlantıyla yapar. Yalnız sunucu tarafı: el sıkışma, metin / ikili çerçeve,
// parçalı ileti, ping / pong (yaşam denetimi), kapanış. İstemci çerçeveleri
// maskeli olmak zorundadır (değilse bağlantı kesilir).
"use strict";

const crypto = require("node:crypto");
const { EventEmitter } = require("node:events");

const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

/** Sec-WebSocket-Key → Sec-WebSocket-Accept. */
const acceptKey = (key) => crypto.createHash("sha1").update(`${key}${GUID}`).digest("base64");

/** Sunucudan istemciye (maskesiz) çerçeve. */
function encodeFrame(opcode, payload) {
  const data = Buffer.isBuffer(payload) ? payload : Buffer.from(String(payload ?? ""), "utf8");
  const len = data.length;
  let head;
  if (len < 126) { head = Buffer.alloc(2); head[1] = len; } else if (len < 65536) { head = Buffer.alloc(4); head[1] = 126; head.writeUInt16BE(len, 2); } else { head = Buffer.alloc(10); head[1] = 127; head.writeBigUInt64BE(BigInt(len), 2); }
  head[0] = 0x80 | (opcode & 0x0f);
  return Buffer.concat([head, data]);
}

/**
 * Çerçeve ayrıştırıcı (akış). feed(buf) → [{ fin, opcode, payload }] ; maskesiz
 * istemci çerçevesi ya da sınırı aşan yük hata fırlatır.
 */
function createFrameParser({ maxPayload = 1 << 20, requireMask = true } = {}) {
  let buf = Buffer.alloc(0);
  return {
    feed(chunk) {
      buf = buf.length ? Buffer.concat([buf, chunk]) : chunk;
      const out = [];
      for (;;) {
        if (buf.length < 2) break;
        const fin = Boolean(buf[0] & 0x80);
        const opcode = buf[0] & 0x0f;
        const masked = Boolean(buf[1] & 0x80);
        let len = buf[1] & 0x7f;
        let off = 2;
        if (len === 126) { if (buf.length < 4) break; len = buf.readUInt16BE(2); off = 4; } else if (len === 127) {
          if (buf.length < 10) break;
          const big = buf.readBigUInt64BE(2);
          if (big > BigInt(maxPayload)) throw new Error("ileti çok büyük");
          len = Number(big); off = 10;
        }
        if (len > maxPayload) throw new Error("ileti çok büyük");
        if (requireMask && !masked) throw new Error("maskesiz istemci çerçevesi");
        const need = off + (masked ? 4 : 0) + len;
        if (buf.length < need) break;
        let payload = Buffer.from(buf.subarray(off + (masked ? 4 : 0), need));
        if (masked) {
          const m = buf.subarray(off, off + 4);
          for (let i = 0; i < payload.length; i += 1) payload[i] ^= m[i & 3];
        }
        out.push({ fin, opcode, payload });
        buf = buf.subarray(need);
      }
      return out;
    },
  };
}

/**
 * HTTP "upgrade" isteğini kabul eder. → bağlantı (EventEmitter):
 *   olaylar: message (metin: string, ikili: Buffer), close ({ code, reason })
 *   send(text | Buffer), close(code?, reason?), terminate(), remoteAddress, localAddress
 * Uygun değilse (sürüm / anahtar yok) 400 yazar ve null döner.
 */
function acceptUpgrade(req, socket, head, { maxPayload = 1 << 20, pingMs = 10000, timeoutMs = 25000, timers = { setInterval, clearInterval } } = {}) {
  const key = req.headers["sec-websocket-key"];
  const upgrade = String(req.headers.upgrade || "").toLowerCase();
  if (!key || upgrade !== "websocket" || String(req.headers["sec-websocket-version"] || "") !== "13") {
    try { socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n"); } catch { /* yoksay */ }
    return null;
  }
  socket.write([
    "HTTP/1.1 101 Switching Protocols",
    "Upgrade: websocket",
    "Connection: Upgrade",
    `Sec-WebSocket-Accept: ${acceptKey(key)}`,
    "", "",
  ].join("\r\n"));
  try { socket.setNoDelay(true); } catch { /* yoksay */ }
  const conn = new EventEmitter();
  const parser = createFrameParser({ maxPayload });
  let closed = false;
  let lastSeen = Date.now();
  let parts = [];
  let partOp = 0;
  conn.remoteAddress = String(socket.remoteAddress || "").replace(/^::ffff:/, "");
  conn.localAddress = String(socket.localAddress || "").replace(/^::ffff:/, "");
  const finish = (code = 1006, reason = "") => {
    if (closed) return;
    closed = true;
    timers.clearInterval(pinger);
    try { socket.destroy(); } catch { /* yoksay */ }
    conn.emit("close", { code, reason });
  };
  const write = (frame) => { if (!closed && socket.writable) socket.write(frame); };
  conn.send = (data) => write(encodeFrame(Buffer.isBuffer(data) ? 2 : 1, data));
  conn.close = (code = 1000, reason = "") => {
    if (closed) return;
    const body = Buffer.alloc(2 + Buffer.byteLength(reason));
    body.writeUInt16BE(code, 0);
    body.write(reason, 2);
    write(encodeFrame(8, body));
    try { socket.end(); } catch { /* yoksay */ }
    finish(code, reason);
  };
  conn.terminate = () => finish(1006, "terminated");
  conn.isOpen = () => !closed;
  const onFrames = (frames) => {
    for (const f of frames) {
      lastSeen = Date.now();
      if (f.opcode === 8) {
        const code = f.payload.length >= 2 ? f.payload.readUInt16BE(0) : 1005;
        write(encodeFrame(8, f.payload.subarray(0, 2)));
        try { socket.end(); } catch { /* yoksay */ }
        finish(code, f.payload.subarray(2).toString("utf8"));
        return;
      }
      if (f.opcode === 9) { write(encodeFrame(10, f.payload)); continue; }
      if (f.opcode === 10) continue;
      if (f.opcode === 1 || f.opcode === 2) { parts = [f.payload]; partOp = f.opcode; } else if (f.opcode === 0) parts.push(f.payload);
      else continue;
      if (!f.fin) continue;
      const data = parts.length === 1 ? parts[0] : Buffer.concat(parts);
      parts = [];
      conn.emit("message", partOp === 1 ? data.toString("utf8") : data);
    }
  };
  socket.on("data", (d) => {
    try { onFrames(parser.feed(d)); } catch { conn.close(1009, "bad frame"); }
  });
  socket.on("close", () => finish(1006, ""));
  socket.on("error", () => finish(1006, ""));
  const pinger = timers.setInterval(() => {
    if (Date.now() - lastSeen > timeoutMs) { finish(1006, "timeout"); return; }
    write(encodeFrame(9, Buffer.alloc(0)));
  }, pingMs);
  pinger.unref?.();
  // İlk baytlar (el sıkışmayla gelen çerçeve) çağıran dinleyicisini bağladıktan sonra işlenir.
  if (head && head.length) setImmediate(() => socket.emit("data", head));
  return conn;
}

module.exports = { acceptKey, encodeFrame, createFrameParser, acceptUpgrade };
