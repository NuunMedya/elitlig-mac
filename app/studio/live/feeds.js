// Yayın Stüdyosu — AĞ GİRİŞLERİ: RTMP / SRT dinleyici ve URL'den çekilen akışlar.
//
//   drone (DJI Fly / GO, Litchi), GoPro, aksiyon kamerası, başka bilgisayardaki OBS,
//   donanım kodlayıcı ──RTMP / SRT──▶ ffmpeg (-listen 1 | mode=listener)
//   IP kamera (RTSP), HLS (.m3u8), HTTP-FLV, RTMP / SRT çağrı ──▶ ffmpeg (çekme)
//                         │  görüntü: H.264 ise KOPYA (yeniden kodlama yok), değilse libx264
//                         │  ses: AAC 48 kHz stereo
//                         ▼
//          parçalı MP4 (fMP4, 100 ms parçalar) ── stdout ──▶ IPC ──▶ arayüzde MSE <video>
//
// Kurallar:
//   - Dinleyici (listen): yayıncı bağlantıyı kesince ffmpeg biter → hemen yeniden
//     dinlemeye geçer ("Yayın bekleniyor"); kaynak hiç kapanmaz.
//   - Çekme (pull): akış biterse / koparsa 1, 2, 4, 8, 10 … sn arayla yeniden dener.
//   - Bekçi: veri akarken 8 sn çıkış gelmezse (ağ askıda) süreç öldürülür, yeniden kurulur.
//   - RTMP yayın anahtarı: ffmpeg yanlış anahtarı yalnız uyarır ("Unexpected stream"):
//     uyarı görülünce süreç kesilir (yanlış anahtarla görüntü alınmaz).
//   - SRT: anahtar = şifre (passphrase, en az 10 karakter); gecikme ms.
//   - Görüntü H.264 değilse (HEVC drone, MJPEG IP kamera) ilk denemede kod çözücüye
//     bakılır ve libx264 ile yeniden başlatılır; arayüz MSE'de oynatamazsa da istenir.
//   - Her süreç "gen" (kuşak) numarası taşır: arayüz yeni kuşakta MSE'yi sıfırlar
//     (yeni başlatma = yeni başlangıç parçası).
//
// Electron'a bağlı değildir (testler gerçek ffmpeg ile çalıştırır).
"use strict";

const { spawn } = require("node:child_process");
const { EventEmitter } = require("node:events");

const BACKOFF_MS = Object.freeze([1000, 2000, 4000, 8000, 10000]);
const DEFAULT_PORTS = Object.freeze({ rtmp: 1935, srt: 9000 });
const KEY_RE = /^[A-Za-z0-9_-]{1,64}$/;
const PASS_RE = /^[\x21-\x7e]{10,79}$/;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const int = (v, d) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : d);

/** Çekilecek adresin türü (ya da null: desteklenmiyor). */
function classifyUrl(raw) {
  let u;
  try { u = new URL(String(raw || "").trim()); } catch { return null; }
  const p = u.protocol.replace(":", "").toLowerCase();
  if (p === "rtsp" || p === "rtsps") return "rtsp";
  if (p === "rtmp" || p === "rtmps") return "rtmp";
  if (p === "srt") return "srt";
  if (p === "udp" || p === "rtp") return "udp";
  if (p === "http" || p === "https") {
    const path = u.pathname.toLowerCase();
    if (path.endsWith(".m3u8")) return "hls";
    if (path.endsWith(".flv")) return "flv";
    if (/\.(mjpg|mjpeg|cgi)$/.test(path) || /mjpe?g|videostream|video\.cgi/.test(path + u.search.toLowerCase())) return "mjpeg";
    return "http";
  }
  return null;
}

/** Kaynak ayarı → güvenli süreç tanımı. Geçersizse { error }. */
function normalizeFeedSpec(s = {}) {
  const mode = s.mode === "pull" ? "pull" : "listen";
  if (mode === "pull") {
    const url = String(s.url || "").trim();
    const type = classifyUrl(url);
    if (!type) return { error: { code: "BAD_URL", message: "Adres desteklenmiyor: rtsp://, rtmp://, srt://, udp://, http(s)://…(.m3u8 / .flv) olmalı." } };
    return {
      mode, url, type,
      rtspTransport: s.rtspTransport === "udp" ? "udp" : "tcp",
      latencyMs: clamp(int(s.latencyMs, 200), 20, 8000),
      transcode: Boolean(s.transcode),
    };
  }
  const protocol = s.protocol === "srt" ? "srt" : "rtmp";
  const port = clamp(int(s.port, DEFAULT_PORTS[protocol]), 1024, 65535);
  const key = String(s.key ?? "").trim();
  if (protocol === "rtmp" && key && !KEY_RE.test(key)) return { error: { code: "BAD_KEY", message: "Yayın anahtarı yalnız harf, rakam, - ve _ içerebilir (en çok 64)." } };
  if (protocol === "srt" && key && !PASS_RE.test(key)) return { error: { code: "BAD_KEY", message: "SRT şifresi 10–79 karakter olmalı (boşluksuz)." } };
  return {
    mode, protocol, port, key,
    app: "live",
    latencyMs: clamp(int(s.latencyMs, 200), 20, 8000),
    transcode: Boolean(s.transcode),
  };
}

/** Dinleyici için ffmpeg giriş adresi. */
function listenUrl(spec, bind = "0.0.0.0") {
  if (spec.protocol === "srt") {
    const q = [`mode=listener`, `latency=${spec.latencyMs * 1000}`, `transtype=live`];
    if (spec.key) q.push(`passphrase=${encodeURIComponent(spec.key)}`, "pbkeylen=16");
    return `srt://${bind}:${spec.port}?${q.join("&")}`;
  }
  return `rtmp://${bind}:${spec.port}/${spec.app}/${spec.key || "elitlig"}`;
}

/** Yayıncıya verilecek adresler (yerel IP'ler için). */
function publishUrls(spec, addresses = []) {
  const hosts = addresses.length ? addresses : ["127.0.0.1"];
  if (spec.protocol === "srt") {
    return hosts.map((h) => ({ host: h, url: `srt://${h}:${spec.port}?mode=caller&latency=${spec.latencyMs * 1000}${spec.key ? `&passphrase=${encodeURIComponent(spec.key)}&pbkeylen=16` : ""}`, server: `srt://${h}:${spec.port}`, key: spec.key || "" }));
  }
  const key = spec.key || "elitlig";
  return hosts.map((h) => ({ host: h, url: `rtmp://${h}:${spec.port}/${spec.app}/${key}`, server: `rtmp://${h}:${spec.port}/${spec.app}`, key }));
}

/** ffmpeg komutu. transcode: görüntüyü H.264'e yeniden kodla. */
function buildFeedArgs(spec, { transcode = spec.transcode, bind = "0.0.0.0" } = {}) {
  const args = ["-hide_banner", "-nostdin", "-loglevel", "info", "-nostats", "-progress", "pipe:2", "-stats_period", "1"];
  // Düşük gecikme: arabellek yok, kısa yoklama.
  args.push("-fflags", "nobuffer+genpts", "-flags", "low_delay", "-probesize", "1000000", "-analyzeduration", "1500000");
  if (spec.mode === "listen") {
    if (spec.protocol === "rtmp") args.push("-listen", "1");
    args.push("-i", listenUrl(spec, bind));
  } else {
    if (spec.type === "rtsp") args.push("-rtsp_transport", spec.rtspTransport, "-timeout", "10000000");
    else if (spec.type === "hls") args.push("-live_start_index", "-1", "-rw_timeout", "15000000");
    else if (spec.type === "http" || spec.type === "flv" || spec.type === "mjpeg") args.push("-reconnect", "1", "-reconnect_streamed", "1", "-reconnect_delay_max", "4", "-rw_timeout", "10000000");
    else if (spec.type === "rtmp") args.push("-rw_timeout", "10000000");
    let url = spec.url;
    if (spec.type === "srt" && !/[?&]latency=/.test(url)) url += `${url.includes("?") ? "&" : "?"}latency=${spec.latencyMs * 1000}`;
    args.push("-i", url);
  }
  args.push("-map", "0:v:0?", "-map", "0:a:0?");
  if (transcode) {
    args.push("-c:v", "libx264", "-preset", "veryfast", "-tune", "zerolatency", "-pix_fmt", "yuv420p", "-profile:v", "high", "-crf", "21", "-maxrate", "12M", "-bufsize", "12M", "-g", "60", "-bf", "0");
  } else {
    args.push("-c:v", "copy");
  }
  args.push("-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-ac", "2");
  args.push("-f", "mp4", "-movflags", "empty_moov+default_base_moof+frag_keyframe", "-frag_duration", "100000", "-flush_packets", "1", "-muxdelay", "0", "pipe:1");
  return args;
}

/** ffmpeg giriş satırından görüntü kodlayıcısı ("h264", "hevc", "mjpeg" …) ve boyut. */
function parseInputVideo(line) {
  const m = /Stream #0:\d+.*?: Video: (\w+)/.exec(line);
  if (!m) return null;
  const size = /, (\d{2,5})x(\d{2,5})/.exec(line);
  const fps = /, ([\d.]+) fps/.exec(line);
  return { codec: m[1], width: size ? Number(size[1]) : null, height: size ? Number(size[2]) : null, fps: fps ? Number(fps[1]) : null };
}

function parseInputAudio(line) {
  const m = /Stream #0:\d+.*?: Audio: (\w+)/.exec(line);
  return m ? { codec: m[1] } : null;
}

const FEED_MESSAGES = {
  waiting: "Yayın bekleniyor — cihazdan bu adrese yayın başlatın.",
  connecting: "Bağlanıyor…",
  reconnecting: (n) => `Bağlantı koptu, yeniden deneniyor (${n}. deneme)…`,
  badKey: "Yanlış yayın anahtarı: cihazdaki anahtarı kontrol edin.",
  portBusy: (p) => `Port ${p} kullanımda (başka bir program dinliyor). Başka bir port seçin.`,
  noSrt: "Bu ffmpeg SRT desteklemiyor.",
  noFfmpeg: "ffmpeg bulunamadı.",
  stalled: "Görüntü gelmiyor (bağlantı askıda); yeniden kuruluyor.",
};

/**
 * Akış yöneticisi.
 *   getFfmpeg(): Promise<{ available, path }>
 *   onData(id, { gen, data })      fMP4 baytları
 *   onStatus(id, status)            { state: waiting|connecting|live|reconnecting|error|stopped, message, kbps, fps, video, audio, gen, transcode }
 */
function createFeeds({ getFfmpeg, spawnImpl = spawn, onData = () => {}, onStatus = () => {}, log = () => {}, timers = { setTimeout, clearTimeout, setInterval, clearInterval }, now = () => Date.now(), stallMs = 8000, bind = "0.0.0.0" } = {}) {
  const feeds = new Map(); // id → kayıt
  const events = new EventEmitter();
  let gen = 0;

  const emit = (f, patch = {}) => {
    Object.assign(f.status, patch);
    const st = { ...f.status, gen: f.gen, transcode: f.transcode, mode: f.spec.mode };
    onStatus(f.id, st);
    events.emit("status", f.id, st);
  };

  const specKey = (spec) => JSON.stringify(spec);

  async function spawnFeed(f) {
    if (f.stopped) return;
    const info = await getFfmpeg();
    if (f.stopped) return;
    if (!info?.available || !info.path) { emit(f, { state: "error", message: FEED_MESSAGES.noFfmpeg }); return; }
    const args = buildFeedArgs(f.spec, { transcode: f.transcode, bind });
    f.gen = ++gen;
    const run = { gen: f.gen, startedAt: now(), bytes: 0, lastDataAt: null, rateAt: now(), rateBytes: 0, killedFor: null, sawOutput: false, child: null };
    f.run = run;
    emit(f, { state: f.spec.mode === "listen" ? "waiting" : f.attempt ? "reconnecting" : "connecting", message: f.spec.mode === "listen" ? FEED_MESSAGES.waiting : f.attempt ? FEED_MESSAGES.reconnecting(f.attempt) : FEED_MESSAGES.connecting, kbps: null, fps: null });
    let child;
    try { child = spawnImpl(info.path, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true }); } catch (e) {
      emit(f, { state: "error", message: e.message });
      return;
    }
    run.child = child;
    child.stdout.on("data", (d) => {
      if (f.run !== run) return;
      run.bytes += d.length;
      run.lastDataAt = now();
      if (!run.sawOutput) {
        run.sawOutput = true;
        f.attempt = 0;
        emit(f, { state: "live", message: null, since: now() });
      }
      onData(f.id, { gen: run.gen, data: d });
    });
    let errBuf = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (d) => {
      errBuf += d;
      let i;
      while ((i = errBuf.search(/[\r\n]/)) >= 0) {
        const line = errBuf.slice(0, i).trim();
        errBuf = errBuf.slice(i + 1);
        if (line) onLine(f, run, line);
      }
    });
    child.on("error", (e) => { if (f.run === run) { run.killedFor = run.killedFor || "error"; emit(f, { state: "error", message: e.message }); } });
    child.on("exit", (code) => onExit(f, run, code));
  }

  function onLine(f, run, line) {
    if (f.run !== run) return;
    f.tail.push(line);
    if (f.tail.length > 40) f.tail.shift();
    const v = parseInputVideo(line);
    if (v) {
      run.video = v;
      f.status.video = v;
      // H.264 değilse kopyalanamaz (MSE / MP4): libx264 ile yeniden başlat.
      if (!f.transcode && v.codec !== "h264") {
        f.transcode = true;
        f.autoTranscode = true;
        log("feed: yeniden kodlamaya geçiliyor", { id: f.id, codec: v.codec });
        kill(run, "transcode");
      }
      return;
    }
    const a = parseInputAudio(line);
    if (a) { f.status.audio = a; return; }
    if (/Unexpected stream (\S+), expecting/.test(line)) { kill(run, "badKey"); return; }
    if (/Address already in use|bind failed|Cannot assign requested address/i.test(line)) { run.killedFor = "portBusy"; return; }
    if (/Protocol not found|Unknown protocol/i.test(line) && f.spec.protocol === "srt") { run.killedFor = "noSrt"; return; }
    const kv = /^(\w+)=(.*)$/.exec(line);
    if (kv) {
      if (kv[1] === "fps") { const n = Number(kv[2]); if (Number.isFinite(n)) f.status.fps = Math.round(n * 10) / 10; }
      if (kv[1] === "progress") {
        const t = now();
        const dt = t - run.rateAt;
        if (dt >= 900) {
          f.status.kbps = Math.round(((run.bytes - run.rateBytes) * 8) / dt);
          run.rateAt = t;
          run.rateBytes = run.bytes;
          if (run.sawOutput) emit(f);
        }
      }
    }
  }

  function kill(run, reason) {
    run.killedFor = run.killedFor || reason;
    try { run.child?.kill("SIGKILL"); } catch { /* yoksay */ }
  }

  function onExit(f, run, code) {
    if (f.run !== run) return;
    f.run = null;
    if (f.stopped) return; // stop() zaten bildirdi
    const reason = run.killedFor;
    if (reason === "portBusy") { emit(f, { state: "error", message: FEED_MESSAGES.portBusy(f.spec.port) }); return; }
    if (reason === "noSrt") { emit(f, { state: "error", message: FEED_MESSAGES.noSrt }); return; }
    if (reason === "badKey") {
      emit(f, { state: "waiting", message: FEED_MESSAGES.badKey });
      f.timer = timers.setTimeout(() => spawnFeed(f), 1500);
      return;
    }
    if (reason === "transcode") { spawnFeed(f); return; }
    if (f.spec.mode === "listen") {
      // Yayıncı ayrıldı: hemen yeniden dinle (çok hızlı biterse kısa bekleme).
      const quick = now() - run.startedAt < 1500 && !run.sawOutput;
      f.quickExits = quick ? (f.quickExits || 0) + 1 : 0;
      if (f.quickExits >= 5) { emit(f, { state: "error", message: (f.tail.slice(-3).join(" · ") || `ffmpeg çıktı (${code})`).slice(0, 300) }); return; }
      f.timer = timers.setTimeout(() => spawnFeed(f), quick ? 1000 : 200);
      return;
    }
    f.attempt += 1;
    const wait = BACKOFF_MS[Math.min(BACKOFF_MS.length - 1, f.attempt - 1)];
    emit(f, { state: "reconnecting", message: `${FEED_MESSAGES.reconnecting(f.attempt)}${f.tail.length ? ` ${shortError(f.tail)}` : ""}`, kbps: null, fps: null });
    f.timer = timers.setTimeout(() => spawnFeed(f), wait);
  }

  const shortError = (tail) => {
    const bad = [...tail].reverse().find((l) => /error|failed|refused|timed out|not found|denied|401|404|unauthorized/i.test(l) && !/^\w+=/.test(l));
    return bad ? `(${bad.replace(/^\[[^\]]+\]\s*/, "").slice(0, 140)})` : "";
  };

  // Bekçi: canlıyken çıkış kesildiyse süreci yeniden kur.
  const watch = timers.setInterval(() => {
    const t = now();
    for (const f of feeds.values()) {
      const r = f.run;
      if (!r || !r.sawOutput || !r.lastDataAt) continue;
      if (t - r.lastDataAt > stallMs) {
        log("feed: veri kesildi, yeniden kuruluyor", { id: f.id });
        emit(f, { state: "reconnecting", message: FEED_MESSAGES.stalled });
        kill(r, "stall");
      }
    }
  }, 1000);
  watch.unref?.();

  /** Akışı başlat (aynı ayarla çalışıyorsa dokunmaz). → { ok, spec } | { ok: false, error } */
  function start(id, raw) {
    const spec = normalizeFeedSpec(raw);
    if (spec.error) return { ok: false, error: spec.error };
    const key = specKey(spec);
    const cur = feeds.get(id);
    if (cur && cur.key === key && !cur.stopped) return { ok: true, spec, gen: cur.gen, status: cur.status };
    if (cur) stop(id);
    // Aynı portu dinleyen başka kaynak varsa reddet.
    if (spec.mode === "listen") {
      for (const f of feeds.values()) {
        if (f.spec.mode === "listen" && f.spec.port === spec.port && !f.stopped) return { ok: false, error: { code: "PORT_TAKEN", message: `Port ${spec.port} başka bir giriş kaynağında kullanılıyor.` } };
      }
    }
    const f = { id: String(id), spec, key, transcode: spec.transcode, autoTranscode: false, attempt: 0, gen: 0, run: null, timer: null, stopped: false, tail: [], status: { state: "connecting", message: null } };
    feeds.set(f.id, f);
    spawnFeed(f);
    return { ok: true, spec };
  }

  function stop(id) {
    const f = feeds.get(String(id));
    if (!f) return false;
    f.stopped = true;
    if (f.timer) timers.clearTimeout(f.timer);
    if (f.run) kill(f.run, "stop");
    feeds.delete(f.id);
    onStatus(f.id, { state: "stopped", message: null });
    return true;
  }

  /** Arayüz bu akışı çözemiyor (MSE codec): yeniden kodlamayla baştan. */
  function requestTranscode(id) {
    const f = feeds.get(String(id));
    if (!f || f.transcode) return false;
    f.transcode = true;
    if (f.run) kill(f.run, "transcode"); else spawnFeed(f);
    return true;
  }

  const status = (id) => feeds.get(String(id))?.status || null;
  const list = () => [...feeds.values()].map((f) => ({ id: f.id, spec: f.spec, status: f.status, gen: f.gen }));
  function dispose() {
    timers.clearInterval(watch);
    for (const id of [...feeds.keys()]) stop(id);
  }

  return { start, stop, requestTranscode, status, list, dispose, events };
}

module.exports = { createFeeds, buildFeedArgs, normalizeFeedSpec, classifyUrl, listenUrl, publishUrls, parseInputVideo, FEED_MESSAGES, DEFAULT_PORTS };
