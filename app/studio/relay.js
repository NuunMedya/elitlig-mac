// Yayın Stüdyosu — RTMP aktarıcısı (ağ bacağı ayrı, gözetimli süreç).
//
// Neden: RTMP bağlantısı kodlayıcı (ffmpeg) ile aynı süreçteyken her kopma
// kodlayıcıyı, MediaRecorder'ı, tekrar halkasını ve yerel kaydı yeniden
// başlatıyordu; YouTube (OAuth ile açılan yayın) bağlantıyı daha sık kestiğinde
// yayın sık sık düşüyordu. Artık:
//
//   kodlayıcı ffmpeg ──tee──▶ [segment halkası] [yerel .mkv]
//                     └─────▶ MPEG-TS → tcp://127.0.0.1:<port> (bu modül)
//                                          │  son GOP tamponda (anahtar kareden)
//                                          ▼
//                         aktarıcı ffmpeg (-c copy, FLV) ──▶ rtmp(s)://…
//
//   - Aktarıcı ölürse / bağlantı askıda kalırsa yalnız o yeniden başlar:
//     1, 2, 4, 8, 10, 10 … sn geri çekilmeyle, kullanıcı durdurana kadar SONSUZ.
//     Kodlayıcı, kaydedici, halka ve yerel kayıt hiç kesilmez.
//   - Yeni aktarıcı son anahtar kareden (PAT/PMT dahil) beslenir: YouTube'a
//     giden akış her zaman çözülebilir bir kareyle başlar.
//   - failoverAfter (3) ardışık hatadan sonra yedek giriş adresine
//     (YouTube backup ingest) geçilir; orada da 3 hata olursa ana adrese döner.
//   - Ağ yetişemezse (aktarıcının stdin'i highWater'ı aşarsa) gerçek zamanı
//     korumak için sonraki anahtar kareye kadar GÖRÜNTÜ paketleri ATILIR (kuyruk
//     büyümez); SES (görüntü dışı PID'ler: ses, PAT/PMT) kesilmeden gitmeye devam eder.
//     Eskiden ses de birlikte atılıyordu: her atlamada YouTube'a 1–2 sn'lik ses boşluğu
//     gidiyor, boşluğun iki ucu izleyicide "patlama / cızırtı" olarak duyuluyordu (yerel
//     kayıtta aktarıcı olmadığından sorun yoktu). Kuyruk hardWater'ı da aşarsa (ağ tamamen
//     tıkalı) ses de atılır. Eşik bit hızına göre ~8 sn'lik veridir (4–24 MB; eskiden
//     sabit 4 MB): kısa ağ dalgalanması kare attırmaz, yalnız süren darlık attırır.
//   - Bağlantı askıda (stallMs boyunca gönderilen bayt artmıyor) ya da ilk
//     bağlantı connectTimeoutMs içinde kurulamadıysa aktarıcı öldürülür.
//   - Kodlayıcı yeniden başlarsa (yeni TCP bağlantısı, zaman damgaları sıfırdan)
//     aktarıcı geri çekilme beklemeden yeniden kurulur.
//   - YAYIN GECİKMESİ (delayMs, OBS "Stream Delay"): kodlayıcıdan gelen TS bir gecikme
//     hattında bekletilir, süre dolunca yukarıdaki yola girer (GOP tamponu, yeniden bağlanma
//     dahil her şey gecikmiş akışla çalışır). Kodlayıcı yeniden başlaması da hatta işaret
//     olarak sıraya girer. Bellek: bit hızı × süre (6 Mbps × 30 sn ≈ 23 MB). Kayıt / tekrar anlık.
//
// Electron'a bağlı değildir; süreç başlatma, saat ve zamanlayıcılar dışarıdan
// verilebilir (testler).
"use strict";

const net = require("node:net");
const { EventEmitter } = require("node:events");
const ff = require("./ffmpeg");
const { killProcess } = require("./proc");

const TS_PACKET = 188;
const RELAY_BACKOFF_MS = Object.freeze([1000, 2000, 4000, 8000, 10000]);
const MAX_GOP_BYTES = 24 * 1024 * 1024;
const VIDEO_STREAM_TYPES = new Set([0x01, 0x02, 0x1b, 0x24]); // MPEG-1/2, H.264, HEVC

const RELAY_MESSAGES = {
  reconnecting: (n) => `Yeniden bağlanıyor… (${n}. deneme)`,
  backup: "yedek sunucu",
  connectTimeout: "Yayın sunucusuna bağlanılamadı (zaman aşımı).",
  stalled: "Yayın sunucusuna veri gitmiyor (bağlantı askıda).",
  dropping: "Bağlantı yayına yetişemiyor; gerçek zamanda kalmak için bazı kareler atlandı (ses sürüyor). Bit hızını düşürmeyi deneyin.",
  unknown: "Yayın bağlantısı koptu.",
};

/** Geri çekilme: n. deneme (1'den) için bekleme; listenin sonu tavandır. */
const backoffFor = (attempt, list = RELAY_BACKOFF_MS) => list[Math.min(list.length - 1, Math.max(0, attempt - 1))];

/* ------------------------------ MPEG-TS tamponu ------------------------------ */

/** TS paketinin yük başlangıcı (uyarlama alanı atlanır); yük yoksa -1. */
function payloadStart(p) {
  const afc = (p[3] >> 4) & 3;
  if (!(afc & 1)) return -1;
  const start = afc & 2 ? 5 + p[4] : 4;
  return start < TS_PACKET ? start : -1;
}

/** PSI bölümünün başlangıcı (pointer_field atlanır); -1: bölüm başı değil. */
function sectionStart(p) {
  if (!(p[1] & 0x40)) return -1;
  const start = payloadStart(p);
  if (start < 0) return -1;
  const s = start + 1 + p[start];
  return s < TS_PACKET - 3 ? s : -1;
}

/**
 * Son GOP'u (son video anahtar karesinden önceki PAT'tan itibaren) tutan TS
 * tamponu. feed(buf) gelen veriyi 188 baytlık paketlere hizalar ve
 * { data: hizalı Buffer | null, keyframe: bool } döndürür. snapshot(): son
 * anahtar kareden bugüne kadarki veri (yeni aktarıcıyı beslemek için).
 */
function createTsGopBuffer({ maxBytes = MAX_GOP_BYTES } = {}) {
  let carry = null;
  let pmtPid = -1;
  let videoPid = -1;
  let gop = [];
  let gopBytes = 0;
  let hasKey = false;
  let sincePat = []; // son PAT'tan bu yana hizalı parçalar (anahtar kare öncesi başlık)
  let sincePatBytes = 0;

  function align(chunk) {
    let buf = carry ? Buffer.concat([carry, chunk]) : chunk;
    carry = null;
    // Senkron kaybı: ardışık iki 0x47'yi ara.
    if (buf.length && buf[0] !== 0x47) {
      let i = 1;
      while (i < buf.length && !(buf[i] === 0x47 && (i + TS_PACKET >= buf.length || buf[i + TS_PACKET] === 0x47))) i += 1;
      buf = buf.subarray(i);
    }
    const whole = buf.length - (buf.length % TS_PACKET);
    if (whole < buf.length) carry = Buffer.from(buf.subarray(whole));
    return whole ? buf.subarray(0, whole) : null;
  }

  function parsePat(p) {
    const s = sectionStart(p);
    if (s < 0 || p[s] !== 0x00) return;
    const len = ((p[s + 1] & 0x0f) << 8) | p[s + 2];
    const end = Math.min(TS_PACKET, s + 3 + len - 4);
    for (let i = s + 8; i + 4 <= end; i += 4) {
      const program = (p[i] << 8) | p[i + 1];
      if (program !== 0) { pmtPid = ((p[i + 2] & 0x1f) << 8) | p[i + 3]; return; }
    }
  }

  function parsePmt(p) {
    const s = sectionStart(p);
    if (s < 0 || p[s] !== 0x02) return;
    const len = ((p[s + 1] & 0x0f) << 8) | p[s + 2];
    const end = Math.min(TS_PACKET, s + 3 + len - 4);
    const infoLen = ((p[s + 10] & 0x0f) << 8) | p[s + 11];
    for (let i = s + 12 + infoLen; i + 5 <= end;) {
      const type = p[i];
      const pid = ((p[i + 1] & 0x1f) << 8) | p[i + 2];
      const esLen = ((p[i + 3] & 0x0f) << 8) | p[i + 4];
      if (VIDEO_STREAM_TYPES.has(type)) { videoPid = pid; return; }
      i += 5 + esLen;
    }
  }

  function feed(chunk) {
    const data = align(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    if (!data) return { data: null, keyframe: false };
    let lastPat = -1;
    let lastKey = -1;
    let keyPat = -1; // anahtar karenin önündeki PAT (bu parçada)
    for (let off = 0; off < data.length; off += TS_PACKET) {
      const p = data.subarray(off, off + TS_PACKET);
      if (p[0] !== 0x47) continue;
      const pid = ((p[1] & 0x1f) << 8) | p[2];
      if (pid === 0) { parsePat(p); lastPat = off; continue; }
      if (pid === pmtPid) { parsePmt(p); continue; }
      if (pid !== videoPid || !(p[1] & 0x40)) continue;
      const afc = (p[3] >> 4) & 3;
      if ((afc & 2) && p[4] > 0 && (p[5] & 0x40)) { lastKey = off; keyPat = lastPat; }
    }
    if (lastKey >= 0) {
      // Yeni GOP: anahtar karenin önündeki son PAT'tan (yoksa önceki parçalardan) başlar.
      if (keyPat >= 0) gop = [data.subarray(keyPat)];
      else gop = [...sincePat, data];
      gopBytes = gop.reduce((t, b) => t + b.length, 0);
      hasKey = true;
    } else if (hasKey) {
      gop.push(data);
      gopBytes += data.length;
      if (gopBytes > maxBytes) { gop = []; gopBytes = 0; hasKey = false; } // anahtar kare gelmiyor
    }
    if (lastPat >= 0) { sincePat = [data.subarray(lastPat)]; sincePatBytes = data.length - lastPat; } else {
      sincePat.push(data);
      sincePatBytes += data.length;
      if (sincePatBytes > 2 * 1024 * 1024) { sincePat = []; sincePatBytes = 0; }
    }
    // resumeAt: anahtar karenin önündeki PAT (yoksa anahtar kare paketinin kendisi).
    return { data, keyframe: lastKey >= 0, resumeAt: lastKey >= 0 ? (keyPat >= 0 ? keyPat : lastKey) : -1 };
  }

  /** Görüntü PID'i dışındaki paketler (ses, PAT/PMT, SDT): atlama sırasında ses sürsün. */
  function nonVideo(data) {
    if (videoPid < 0) return data;
    const keep = [];
    let runStart = -1;
    for (let off = 0; off < data.length; off += TS_PACKET) {
      const pid = ((data[off + 1] & 0x1f) << 8) | data[off + 2];
      if (pid !== videoPid) { if (runStart < 0) runStart = off; } else if (runStart >= 0) { keep.push(data.subarray(runStart, off)); runStart = -1; }
    }
    if (runStart >= 0) keep.push(data.subarray(runStart));
    return keep.length === 1 ? keep[0] : keep.length ? Buffer.concat(keep) : null;
  }

  return {
    feed,
    nonVideo,
    hasKey: () => hasKey,
    snapshot: () => (hasKey ? Buffer.concat(gop) : null),
    gopBytes: () => gopBytes,
    videoPid: () => videoPid,
    reset() { carry = null; gop = []; gopBytes = 0; hasKey = false; sincePat = []; sincePatBytes = 0; pmtPid = -1; videoPid = -1; },
  };
}

/* ------------------------------ gecikme hattı ------------------------------ */

/**
 * Zaman damgalı FIFO: push(veri) / mark() (akış başı işareti); süresi dolan öğeler
 * sırayla onData / onMarker'a verilir. delayMs 0 ise etkin değildir.
 */
function createDelayLine({ delayMs = 0, now = () => Date.now(), timers = { setTimeout, clearTimeout }, tickMs = 40, onData, onMarker }) {
  const ms = Math.max(0, Number(delayMs) || 0);
  const queue = [];
  let head = 0;
  let bytes = 0;
  let timer = null;
  let stopped = false;
  const schedule = () => {
    if (timer || stopped || head >= queue.length) return;
    timer = timers.setTimeout(tick, tickMs);
  };
  function tick() {
    timer = null;
    const t = now();
    while (head < queue.length && t - queue[head].at >= ms) {
      const it = queue[head];
      queue[head] = null;
      head += 1;
      if (it.data) { bytes -= it.data.length; onData(it.data); } else onMarker();
    }
    if (head > 512 && head * 2 > queue.length) { queue.splice(0, head); head = 0; }
    schedule();
  }
  return {
    active: ms > 0,
    delayMs: ms,
    push(data) { if (stopped) return; queue.push({ at: now(), data }); bytes += data.length; schedule(); },
    mark() { if (stopped) return; queue.push({ at: now(), data: null }); schedule(); },
    pendingBytes: () => bytes,
    pendingMs: () => (head < queue.length ? Math.max(0, now() - queue[head].at) : 0),
    stop() { stopped = true; if (timer) timers.clearTimeout(timer); timer = null; queue.length = 0; head = 0; bytes = 0; },
  };
}

/* --------------------------------- aktarıcı --------------------------------- */

function createRelay({
  ffmpegPath,
  primaryUrl,
  backupUrl = null,
  spawnImpl,
  timers = { setTimeout, clearTimeout },
  now = () => Date.now(),
  platform = process.platform,
  killImpl = (child) => killProcess(child, { platform, spawnImpl }),
  buildArgs = ff.buildRelayArgs,
  backoffMs = RELAY_BACKOFF_MS,
  failoverAfter = 3,
  connectTimeoutMs = 20000,
  stallMs = 15000,
  stableMs = 30000,
  watchMs = 1000,
  // Ağ yetişemezse atlama eşiği. Verilmezse bit hızına göre: ~8 sn'lik veri (en az 4, en çok
  // 24 MB) — kısa ağ dalgalanmalarında hiç kare atılmaz (atma = izleyicide anahtar kareye kadar donma).
  highWaterBytes = null,
  lowWaterBytes = null,
  highWaterSec = 8,
  hardWaterBytes = null, // bunu da aşarsa ses de atılır (varsayılan 4 × highWater)
  stopTimeoutMs = 3000,
  note = () => {},
  log = () => {},
  delayMs = 0,
  delayTickMs = 40,
} = {}) {
  const events = new EventEmitter();
  const delay = createDelayLine({ delayMs, now, timers, tickMs: delayTickMs, onData: (d) => write(d), onMarker: () => newStream() });
  const gopBuf = createTsGopBuffer();
  const backup = backupUrl && backupUrl !== primaryUrl ? backupUrl : null;
  let server = null;
  let port = null;
  let socket = null;
  let armed = 0;
  let streams = 0;
  let pusher = null; // { child, target, startedAt, connected, lastSize, lastSizeAt, stderrTail, failReason, restartNow, stopping }
  let feeding = false;
  let audioOnly = false; // atlama: yalnız ses (görüntü dışı paketler) gider
  let stopping = false;
  let stopped = false;
  let retryTimer = null;
  let watchTimer = null;
  let stableTimer = null;
  let nextRetryAt = null;
  const st = {
    state: "waiting", // waiting | connecting | up | down | stopped
    target: "primary",
    attempt: 0, // ardışık başarısız deneme (sağlam bağlantıdan sonra sıfırlanır)
    failures: 0, // bu adreste ardışık hata (yedeğe geçiş için)
    reconnects: 0, // kopmadan sonra başarılı yeniden bağlanma
    everUp: false,
    lastError: null,
    upSince: null,
    sentBytes: 0,
    sentKbps: null,
    inBytes: 0,
    droppedBytes: 0,
    dropEvents: 0,
    dropping: false,
    starts: 0,
  };
  let rate = { at: null, bytes: 0 };
  let inRate = { at: null, bytes: 0, bps: 0 }; // kodlayıcıdan gelen bayt/sn (eşikler için)
  const MIN_HIGH = 4 * 1024 * 1024;
  const MAX_HIGH = 24 * 1024 * 1024;
  const highWater = () => highWaterBytes ?? Math.min(MAX_HIGH, Math.max(MIN_HIGH, Math.round(inRate.bps * highWaterSec)));
  const lowWater = () => lowWaterBytes ?? Math.min(2 * 1024 * 1024, Math.max(512 * 1024, Math.round(inRate.bps)));

  const clear = (name) => {
    const t = { retryTimer, watchTimer, stableTimer }[name];
    if (t) timers.clearTimeout(t);
    if (name === "retryTimer") retryTimer = null;
    if (name === "watchTimer") watchTimer = null;
    if (name === "stableTimer") stableTimer = null;
  };

  function status() {
    return {
      state: st.state,
      target: st.target,
      backupAvailable: Boolean(backup),
      attempt: st.attempt,
      failures: st.failures,
      reconnects: st.reconnects,
      everUp: st.everUp,
      lastError: st.lastError,
      upSince: st.upSince,
      sentBytes: st.sentBytes,
      sentKbps: st.sentKbps,
      inBytes: st.inBytes,
      droppedBytes: st.droppedBytes,
      dropEvents: st.dropEvents,
      dropping: st.dropping,
      pendingBytes: pusher?.child?.stdin?.writableLength ?? 0,
      highWaterBytes: highWater(),
      inKbps: Math.round((inRate.bps * 8) / 1000),
      delayMs: delay.delayMs,
      delayBufferedBytes: delay.pendingBytes(),
      nextRetryInMs: nextRetryAt === null ? null : Math.max(0, nextRetryAt - now()),
      message: message(),
    };
  }

  function message() {
    if (st.state === "up") return st.dropping ? RELAY_MESSAGES.dropping : null;
    if (st.attempt > 0 && (st.state === "down" || st.state === "connecting")) {
      const parts = [RELAY_MESSAGES.reconnecting(st.attempt)];
      if (st.target === "backup") parts.push(`(${RELAY_MESSAGES.backup})`);
      const reason = st.lastError?.message;
      return `${parts.join(" ")}${reason ? ` ${reason}` : ""}`;
    }
    return null;
  }

  const emit = () => events.emit("status", status());
  const setState = (state) => { st.state = state; emit(); };

  /* --------------------------- TCP (kodlayıcıdan) --------------------------- */

  function listen() {
    if (server) return Promise.resolve(url());
    return new Promise((resolve, reject) => {
      const srv = net.createServer((sock) => onConnection(sock));
      srv.on("error", (e) => { if (!port) reject(e); else note("aktarıcı sunucu hatası", { error: e.message }); });
      srv.listen(0, "127.0.0.1", () => {
        server = srv;
        port = srv.address().port;
        try { srv.unref(); } catch { /* yoksay */ }
        resolve(url());
      });
    });
  }

  const url = () => (port ? `tcp://127.0.0.1:${port}` : null);

  /** Kodlayıcı başlatılmadan önce: yalnız beklenen bağlantı kabul edilir (başka yerel süreç akış sokamaz). */
  const arm = () => { armed += 1; };

  function onConnection(sock) {
    if (stopping || armed <= 0) { sock.destroy(); return; }
    armed = 0;
    if (socket) { try { socket.destroy(); } catch { /* yoksay */ } }
    socket = sock;
    try { sock.setNoDelay(true); } catch { /* yoksay */ }
    sock.on("data", (d) => { if (socket === sock) { if (delay.active) delay.push(d); else write(d); } });
    sock.on("error", () => { /* kodlayıcı kapanıyor */ });
    sock.on("close", () => { if (socket === sock) socket = null; });
    if (delay.active) delay.mark(); else newStream();
  }

  /** Kodlayıcı yeni akış başlattı (ilk ya da yeniden başlatma). */
  function newStream() {
    streams += 1;
    gopBuf.reset();
    feeding = false;
    audioOnly = false;
    if (streams > 1 && pusher && !pusher.stopping) {
      // Zaman damgaları sıfırlandı: aktarıcı geri çekilmeden yeniden kurulur.
      note("aktarıcı yeniden kuruluyor (kodlayıcı yeniden başladı)");
      pusher.restartNow = true;
      endPusher(pusher);
    }
  }

  /** Kodlayıcıdan gelen TS verisi (testler doğrudan da çağırır). */
  function write(chunk) {
    if (stopped) return;
    const { data, keyframe, resumeAt } = gopBuf.feed(chunk);
    if (!data) return;
    st.inBytes += data.length;
    const t = now();
    if (inRate.at === null) inRate = { at: t, bytes: st.inBytes, bps: 0 };
    else if (t - inRate.at >= 2000) {
      const bps = ((st.inBytes - inRate.bytes) * 1000) / (t - inRate.at);
      inRate = { at: t, bytes: st.inBytes, bps: inRate.bps ? inRate.bps * 0.7 + bps * 0.3 : bps };
    }
    if (stopping) return;
    if (!pusher) {
      if (!retryTimer && gopBuf.hasKey()) spawnPusher();
      return;
    }
    const stdin = pusher.child.stdin;
    if (!stdin || stdin.destroyed || !stdin.writable) return;
    if (feeding) {
      if (stdin.writableLength > highWater()) {
        // Ağ yetişemiyor: kuyruk büyütülmez, sonraki anahtar kareye kadar GÖRÜNTÜ atlanır; ses sürer.
        feeding = false;
        audioOnly = true;
        st.dropEvents += 1;
        if (!st.dropping) { st.dropping = true; note("ağ yetişemiyor; anahtar kareye kadar görüntü atlanıyor (ses sürüyor)", { pendingBytes: stdin.writableLength, highWaterBytes: highWater(), inKbps: Math.round((inRate.bps * 8) / 1000), sentKbps: st.sentKbps }); emit(); }
        writeAudioOnly(stdin, data);
        return;
      }
      stdin.write(data);
      return;
    }
    if (audioOnly) {
      if (keyframe && resumeAt >= 0 && stdin.writableLength <= lowWater()) {
        // Aynı aktarıcı sürüyor (başlık zaten gitti): anahtar kareye dek yalnız ses, sonra hepsi.
        if (resumeAt > 0) writeAudioOnly(stdin, data.subarray(0, resumeAt));
        stdin.write(data.subarray(resumeAt));
        audioOnly = false;
        feeding = true;
        return;
      }
      writeAudioOnly(stdin, data);
      return;
    }
    if (keyframe && stdin.writableLength <= lowWater()) {
      stdin.write(gopBuf.snapshot());
      feeding = true;
      return;
    }
    st.droppedBytes += data.length;
  }

  /** Atlama sırasında: görüntü paketleri atılır, ses (görüntü dışı PID) yazılır; ağ tamamen tıkalıysa o da atılır. */
  function writeAudioOnly(stdin, data) {
    const keep = stdin.writableLength > (hardWaterBytes ?? highWater() * 4) ? null : gopBuf.nonVideo(data);
    st.droppedBytes += data.length - (keep ? keep.length : 0);
    if (keep && keep.length) stdin.write(keep);
  }

  /* -------------------------------- aktarıcı -------------------------------- */

  function spawnPusher() {
    if (stopping || pusher) return;
    clear("retryTimer");
    nextRetryAt = null;
    const target = st.target;
    const dest = target === "backup" ? backup : primaryUrl;
    const args = buildArgs({ url: dest });
    st.starts += 1;
    note(`RTMP aktarıcısı başlıyor (${target === "backup" ? "yedek" : "ana"} adres, deneme ${st.attempt})`, { url: ff.maskUrl(dest), args: ff.maskSecrets(args.join(" ")) });
    let child;
    try {
      child = spawnImpl(ffmpegPath, args, { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    } catch (error) {
      pusher = { child: null, target, startedAt: now(), connected: false, lastSize: 0, lastSizeAt: now(), stderrTail: [], failReason: { code: "SPAWN", message: error.message } };
      onPusherExit(pusher, -1, null);
      return;
    }
    const p = { child, target, startedAt: now(), connected: false, lastSize: 0, lastSizeAt: now(), stderrTail: [], failReason: null, restartNow: false, stopping: false };
    pusher = p;
    feeding = false;
    audioOnly = false;
    const parser = ff.createProgressParser((prog) => onPusherProgress(p, prog));
    child.stdout?.setEncoding?.("utf8");
    child.stdout?.on("data", (d) => parser.feed(d));
    let errBuf = "";
    child.stderr?.setEncoding?.("utf8");
    child.stderr?.on("data", (d) => {
      errBuf += d;
      let i;
      while ((i = errBuf.search(/[\r\n]/)) >= 0) {
        const line = errBuf.slice(0, i).trim();
        errBuf = errBuf.slice(i + 1);
        if (!line) continue;
        p.stderrTail.push(line);
        if (p.stderrTail.length > 30) p.stderrTail.shift();
        note(`aktarıcı: ${ff.maskSecrets(line)}`);
      }
    });
    child.stdin?.on?.("error", () => { /* EPIPE: süreç kapanıyor */ });
    child.on("error", (error) => { if (!p.exited) { p.failReason = p.failReason || { code: "SPAWN", message: error.message }; onPusherExit(p, -1, null); } });
    child.on("exit", (code, signal) => onPusherExit(p, code, signal));
    // Son anahtar kareden besle.
    const snap = gopBuf.snapshot();
    if (snap && child.stdin?.writable !== false) { child.stdin.write(snap); feeding = true; }
    setState("connecting");
    scheduleWatch(p);
  }

  function onPusherProgress(p, prog) {
    if (pusher !== p) return;
    const size = prog.totalSize;
    if (!(size > p.lastSize)) return;
    const t = now();
    st.sentBytes += size - p.lastSize;
    if (rate.at !== null && t > rate.at) st.sentKbps = Math.round(((st.sentBytes - rate.bytes) * 8) / (t - rate.at));
    rate = { at: t, bytes: st.sentBytes };
    p.lastSize = size;
    p.lastSizeAt = t;
    if (st.dropping && feeding) st.dropping = false;
    if (!p.connected) {
      p.connected = true;
      if (st.everUp) st.reconnects += 1;
      st.everUp = true;
      st.upSince = t;
      note(st.reconnects ? `RTMP yeniden bağlandı (${st.reconnects}. kez)` : "RTMP bağlandı", { target: p.target, attempt: st.attempt });
      log("studio: RTMP bağlandı", { target: p.target });
      clear("stableTimer");
      stableTimer = timers.setTimeout(() => {
        stableTimer = null;
        if (pusher === p && p.connected) { st.attempt = 0; st.failures = 0; emit(); }
      }, stableMs);
      setState("up");
      return;
    }
    emit();
  }

  function scheduleWatch(p) {
    clear("watchTimer");
    watchTimer = timers.setTimeout(() => {
      watchTimer = null;
      if (pusher !== p || p.exited || p.stopping) return;
      const t = now();
      if (!p.connected && t - p.startedAt >= connectTimeoutMs) {
        p.failReason = { code: "TIMEOUT", message: RELAY_MESSAGES.connectTimeout };
        note("aktarıcı öldürülüyor: bağlantı kurulamadı", { afterMs: t - p.startedAt });
        kill(p);
        return;
      }
      if (p.connected && t - p.lastSizeAt >= stallMs) {
        p.failReason = { code: "STALLED", message: RELAY_MESSAGES.stalled };
        note("aktarıcı öldürülüyor: veri gitmiyor (bağlantı askıda)", { sinceMs: t - p.lastSizeAt, pendingBytes: p.child?.stdin?.writableLength ?? 0 });
        kill(p);
        return;
      }
      scheduleWatch(p);
    }, watchMs);
  }

  function kill(p) {
    if (!p?.child) return;
    try { p.child.stdin?.destroy?.(); } catch { /* yoksay */ }
    killImpl(p.child);
  }

  /** Nazik kapatma: stdin kapanır (ffmpeg kalanı yazıp çıkar), süre dolunca öldürülür. */
  function endPusher(p) {
    if (!p?.child || p.stopping) return;
    p.stopping = true;
    clear("watchTimer");
    try { p.child.stdin?.end?.(); } catch { /* yoksay */ }
    p.killTimer = timers.setTimeout(() => { if (!p.exited) kill(p); }, stopTimeoutMs);
  }

  function onPusherExit(p, code, signal) {
    if (p.exited) return;
    p.exited = true;
    if (p.killTimer) timers.clearTimeout(p.killTimer);
    if (pusher !== p) return;
    pusher = null;
    feeding = false;
    audioOnly = false;
    clear("watchTimer");
    clear("stableTimer");
    if (p.connected) st.upSince = null;
    if (stopping) { p.onStopped?.(); events.emit("pusherExit"); return; }
    if (p.restartNow) {
      // Kodlayıcı yeniden başladı: hata sayılmaz, yeni akışın ilk anahtar karesiyle hemen.
      setState(st.everUp ? "down" : "waiting");
      if (gopBuf.hasKey()) spawnPusher();
      return;
    }
    const tail = p.stderrTail.join("\n");
    const reason = p.failReason || (tail ? ff.mapFfmpegError(tail) : { code: "UNKNOWN", message: RELAY_MESSAGES.unknown });
    st.lastError = { code: reason.code, message: reason.code === "UNKNOWN" ? RELAY_MESSAGES.unknown : reason.message, at: now() };
    st.attempt += 1;
    st.failures += 1;
    log("studio: RTMP aktarıcısı durdu", { code, signal, reason: reason.code });
    note("RTMP aktarıcısı durdu", { code, signal, reason: reason.code, connected: p.connected, attempt: st.attempt, tail: p.stderrTail.slice(-6).map(ff.maskSecrets) });
    if (backup && st.failures >= failoverAfter) {
      st.target = st.target === "backup" ? "primary" : "backup";
      st.failures = 0;
      note(`RTMP ${st.target === "backup" ? "yedek" : "ana"} adrese geçiliyor`);
    }
    const delay = backoffFor(st.attempt, backoffMs);
    nextRetryAt = now() + delay;
    clear("retryTimer");
    retryTimer = timers.setTimeout(() => {
      retryTimer = null;
      nextRetryAt = null;
      if (stopping) return;
      if (gopBuf.hasKey()) spawnPusher();
      else setState("down"); // ilk anahtar kare gelince write() başlatır
    }, delay);
    setState("down");
  }

  /* ---------------------------------- API ---------------------------------- */

  function closeServer() {
    try { socket?.destroy(); } catch { /* yoksay */ }
    socket = null;
    try { server?.close(); } catch { /* yoksay */ }
  }

  /** Nazik durdurma: aktarıcı kalan veriyi yollar; stopTimeoutMs'de öldürülür. */
  function stop() {
    if (stopped) return Promise.resolve(true);
    stopping = true;
    delay.stop();
    for (const t of ["retryTimer", "watchTimer", "stableTimer"]) clear(t);
    closeServer();
    const p = pusher;
    const done = () => { stopped = true; st.state = "stopped"; emit(); };
    if (!p?.child || p.exited) { pusher = null; done(); return Promise.resolve(true); }
    return new Promise((resolve) => {
      p.onStopped = () => { pusher = null; done(); resolve(true); };
      p.stopping = false; // endPusher yeniden işaretler
      endPusher(p);
    });
  }

  /** Eşzamanlı kapatma (uygulama çıkışı). */
  function dispose() {
    stopping = true;
    stopped = true;
    delay.stop();
    for (const t of ["retryTimer", "watchTimer", "stableTimer"]) clear(t);
    closeServer();
    if (pusher) { const p = pusher; pusher = null; kill(p); }
  }

  return {
    listen,
    url,
    arm,
    write,
    newStream,
    stop,
    dispose,
    status,
    active: () => !stopped,
    events,
  };
}

module.exports = { createRelay, createDelayLine, createTsGopBuffer, backoffFor, RELAY_BACKOFF_MS, RELAY_MESSAGES, TS_PACKET };
