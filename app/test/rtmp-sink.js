"use strict";
// Testler için en küçük RTMP(S) yayın alıcısı (YouTube ingest'e yakın davranış): el sıkışma,
// connect / createStream / publish yanıtları, Window Ack Size + Acknowledgement. Gelen iletiler
// ve istemcinin parça boyu kaydedilir. (Yalnız testler; uygulamaya girmez.)
const net = require("node:net");
const { amfEncode, amfDecode, chunkMessage } = require("../studio/rtmppub");

function createRtmpSink({ windowAck = 2500000, reject = null, closeAfterHandshake = false, noAcks = false, server: makeServer = null } = {}) {
  const sessions = [];
  const sockets = new Set();
  function handle(sock) {
    const ses = { messages: [], commands: [], clientChunk: 128, bytes: 0, chunkHeaders: 0, connect: null, publish: null, closed: false, ackSent: 0 };
    sessions.push(ses);
    sockets.add(sock);
    sock.on("close", () => sockets.delete(sock));
    sock.setNoDelay(true);
    let buf = Buffer.alloc(0);
    let phase = 0;
    let inChunk = 128;
    let lastAck = 0;
    const cs = new Map();
    const send = (b) => { if (!sock.destroyed) sock.write(b); };
    const cmd = (txn, name, ...args) => send(chunkMessage({ csid: 3, type: 20, payload: Buffer.concat([amfEncode(name), amfEncode(txn), ...args.map(amfEncode)]), chunkSize: 128 }));
    const onMessage = (m) => {
      ses.messages.push({ type: m.type, ts: m.ts, length: m.payload.length, head: m.payload.subarray(0, 16), payload: m.type === 18 ? m.payload : undefined });
      if (m.type === 1) { inChunk = m.payload.readUInt32BE(0) & 0x7fffffff; ses.clientChunk = inChunk; return; }
      if (m.type !== 20) return;
      const [name, txn, , arg] = amfDecode(m.payload);
      ses.commands.push(name);
      if (name === "connect") {
        ses.connect = amfDecode(m.payload)[2];
        const w = Buffer.alloc(4); w.writeUInt32BE(windowAck); send(chunkMessage({ csid: 2, type: 5, payload: w, chunkSize: 128 }));
        cmd(txn, "_result", { fmsVer: "FMS/3,0,1,123", capabilities: 31 }, { level: "status", code: "NetConnection.Connect.Success", description: "ok" });
      } else if (name === "createStream") cmd(txn, "_result", null, 1);
      else if (name === "publish") {
        ses.publish = arg;
        if (reject) send(chunkMessage({ csid: 5, type: 20, streamId: 1, payload: Buffer.concat([amfEncode("onStatus"), amfEncode(0), amfEncode(null), amfEncode({ level: "error", code: reject, description: "reddedildi" })]), chunkSize: 128 }));
        else send(chunkMessage({ csid: 5, type: 20, streamId: 1, payload: Buffer.concat([amfEncode("onStatus"), amfEncode(0), amfEncode(null), amfEncode({ level: "status", code: "NetStream.Publish.Start", description: "go" })]), chunkSize: 128 }));
      } else if (txn > 0) cmd(txn, "_result", null, null);
    };
    const parse = () => {
      for (;;) {
        if (phase === 0) {
          if (buf.length < 1537) return;
          const c1 = buf.subarray(1, 1537);
          send(Buffer.concat([Buffer.from([3]), Buffer.alloc(1536), c1]));
          buf = buf.subarray(1537); phase = 1;
          continue;
        }
        if (phase === 1) {
          if (buf.length < 1536) return;
          buf = buf.subarray(1536); phase = 2;
          if (closeAfterHandshake) { sock.destroy(); return; }
          continue;
        }
        if (!buf.length) return;
        let o = 1;
        const fmt = buf[0] >> 6;
        let csid = buf[0] & 0x3f;
        if (csid === 0) { if (buf.length < 2) return; csid = 64 + buf[1]; o = 2; } else if (csid === 1) { if (buf.length < 3) return; csid = 64 + buf[1] + buf[2] * 256; o = 3; }
        const st = cs.get(csid) || { ts: 0, delta: 0, len: 0, type: 0, parts: [], got: 0, ext: false };
        const hl = [11, 7, 3, 0][fmt];
        if (buf.length < o + hl) return;
        let ts = null; let ext = st.ext;
        if (fmt <= 2) { ts = buf.readUIntBE(o, 3); ext = ts === 0xffffff; }
        let { len, type } = st;
        if (fmt <= 1) { len = buf.readUIntBE(o + 3, 3); type = buf[o + 6]; }
        o += hl;
        if (ext) { if (buf.length < o + 4) return; ts = buf.readUInt32BE(o); o += 4; }
        const need = Math.min(inChunk, len - st.got);
        if (buf.length < o + need) return;
        if (st.got === 0) { if (fmt === 0) st.ts = ts; else if (fmt === 1 || fmt === 2) { st.delta = ts; st.ts += ts; } else st.ts += st.delta; }
        Object.assign(st, { len, type, ext });
        st.parts.push(buf.subarray(o, o + need)); st.got += need;
        ses.chunkHeaders += 1;
        buf = buf.subarray(o + need);
        cs.set(csid, st);
        if (st.got >= st.len) { const payload = Buffer.concat(st.parts); st.parts = []; st.got = 0; onMessage({ type: st.type, ts: st.ts, payload }); }
      }
    };
    sock.on("data", (d) => {
      ses.bytes += d.length;
      buf = buf.length ? Buffer.concat([buf, d]) : d;
      if (!noAcks && phase === 2 && ses.bytes - lastAck >= windowAck) {
        lastAck = ses.bytes;
        const a = Buffer.alloc(4); a.writeUInt32BE(ses.bytes >>> 0); send(chunkMessage({ csid: 2, type: 3, payload: a, chunkSize: 128 }));
        ses.ackSent += 1;
      }
      try { parse(); } catch { sock.destroy(); }
    });
    sock.on("close", () => { ses.closed = true; });
    sock.on("error", () => {});
  }
  const server = makeServer ? makeServer(handle) : net.createServer(handle);
  return {
    sessions,
    listen: () => new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server.address().port))),
    close: () => new Promise((resolve) => { for (const s of sockets) s.destroy(); server.close(() => resolve()); }),
    server,
  };
}

module.exports = { createRtmpSink };
