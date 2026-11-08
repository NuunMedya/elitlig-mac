// Yayın Stüdyosu — YENİ KAYNAK TÜRLERİ (saf model; arayüz ve testler).
//
//   phone     Telefon kamerası (kablosuz): QR ile eşleşir, WebRTC (yerel ağ). iPhone
//             Süreklilik Kamerası ve USB ile bağlanan telefonlar "Kamera" türündedir.
//   ingest    RTMP / SRT girişi: drone (DJI), GoPro, aksiyon kamerası, başka bilgisayardaki
//             OBS / vMix, donanım kodlayıcı bu bilgisayara yayın yapar.
//   stream    Ağ akışı / IP kamera: RTSP, HLS (.m3u8), HTTP-FLV, RTMP, SRT, UDP adresinden çekme.
//   web       Web sayfası (tarayıcı kaynağı): saydam zemin, boyut, CSS, yenile.
//   ticker    Kayan yazı (alt bant haber şeridi).
//   playlist  Medya oynatma listesi: sıralı / karışık, döngü, sonraki / önceki.
//   region    Ekran bölgesi: bir ekranın seçilen dikdörtgeni.
//   (NDI: özel SDK gerektirir, desteklenmez → OBS NDI eklentisi + SRT girişi önerilir.)

export const LIVE_SOURCE_TYPES = [
  { kind: "phone", label: "Telefon kamerası (kablosuz)", icon: "phone", hint: "iPhone / Android: QR kodu okut, kamera Wi-Fi ile gelsin", group: "cihaz" },
  { kind: "ingest", label: "RTMP / SRT girişi (drone, GoPro, OBS)", icon: "broadcast", hint: "DJI, GoPro, başka bilgisayardaki OBS bu bilgisayara yayın yapar", group: "cihaz" },
  { kind: "stream", label: "IP kamera / ağ akışı", icon: "link", hint: "RTSP, HLS (.m3u8), HTTP-FLV, RTMP, SRT adresinden çek", group: "cihaz" },
  { kind: "web", label: "Web sayfası", icon: "globe", hint: "Skor sayfası, sosyal medya duvarı, alt bant (saydam zemin)", group: "grafik" },
  { kind: "ticker", label: "Kayan yazı", icon: "arrows", hint: "Alt bantta akan haber / sponsor yazısı", group: "grafik" },
  { kind: "playlist", label: "Medya oynatma listesi", icon: "list", hint: "Birden çok video sırayla ya da karışık; döngü", group: "medya" },
  { kind: "region", label: "Ekran bölgesi", icon: "target", hint: "Bir ekranın yalnız seçilen bölümü (taktik tahtası, skor penceresi)", group: "ekran" },
];

/** Desteklenmeyen / farklı yoldan bağlanan cihazlar ("nasıl bağlanır" kartları). */
export const CONNECT_GUIDE = [
  { key: "iphone", icon: "phone", title: "iPhone (kablolu / Süreklilik)", text: "Mac'te iPhone'u aynı Apple hesabıyla yakına getir ya da USB ile tak: “Kamera” türünde listede görünür (Süreklilik Kamerası). Kablosuz ve her bilgisayarda: “Telefon kamerası”." },
  { key: "android", icon: "phone", title: "Android (USB)", text: "Android 14+ telefonlar USB ile takılıp bildirimden “Web kamerası” seçilince “Kamera” türünde görünür. Kablosuz: “Telefon kamerası”." },
  { key: "dji", icon: "broadcast", title: "DJI drone", text: "DJI Fly / GO 4 › Canlı yayın › RTMP: “RTMP / SRT girişi”ndeki adresi yaz. Telefon ve bilgisayar aynı Wi-Fi'da (ya da telefonun erişim noktasında) olmalı." },
  { key: "gopro", icon: "video", title: "GoPro / aksiyon kamerası", text: "GoPro Quik › Canlı yayın › RTMP: “RTMP / SRT girişi” adresi. Yakalama kartı (HDMI) ile bağlıysa “Kamera” türü." },
  { key: "obs", icon: "overview", title: "Başka bilgisayardaki OBS / vMix", text: "OBS › Ayarlar › Yayın › Özel: sunucu ve anahtar “RTMP / SRT girişi”nden (SRT daha düşük gecikme). vMix: Dış çıkış › SRT." },
  { key: "ip", icon: "link", title: "IP kamera / NVR", text: "Kameranın RTSP adresini (rtsp://kullanıcı:şifre@IP:554/…) “IP kamera / ağ akışı”na yaz; TCP önerilir." },
  { key: "ndi", icon: "ban", title: "NDI", text: "NDI özel bir SDK ister; doğrudan desteklenmez. Gönderen bilgisayarda OBS + NDI eklentisi ile alıp SRT ile bu bilgisayara yollayın." },
];

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);

const randomKey = (n = 10) => {
  const abc = "abcdefghijkmnpqrstuvwxyz23456789";
  let s = "";
  const rnd = typeof crypto !== "undefined" && crypto.getRandomValues ? crypto.getRandomValues(new Uint8Array(n)) : Array.from({ length: n }, () => Math.floor(Math.random() * 256));
  for (let i = 0; i < n; i += 1) s += abc[rnd[i] % abc.length];
  return s;
};

/** Yeni kaynak taslağı (bu türler için). count: aynı türden kaç kaynak var. */
export function liveSourceDefaults(kind, { count = 0 } = {}) {
  const n = count + 1;
  switch (kind) {
    case "phone": return { kind, name: `Telefon ${n}`, token: null, facing: "environment", res: 720, fps: 30, mic: true };
    case "ingest": return { kind, name: n > 1 ? `Giriş ${n}` : "Drone / RTMP girişi", protocol: "rtmp", port: 1935 + count, key: randomKey(10), latencyMs: 200, transcode: false };
    case "stream": return { kind, name: n > 1 ? `IP kamera ${n}` : "IP kamera", url: "", rtspTransport: "tcp", latencyMs: 200, transcode: false };
    case "web": return { kind, name: "Web sayfası", url: "https://", width: 1920, height: 1080, fps: 30, css: "", transparent: true, zoom: 1 };
    case "ticker": return { kind, name: "Kayan yazı", text: "ElitLig canlı yayında · Bizi takip edin: @elitlig · ", speed: 120, font: "Archivo", size: 44, bold: true, color: "#ffffff", background: true, bgColor: "#54009c", direction: "left", separator: "  •  " };
    case "playlist": return { kind, name: "Oynatma listesi", items: [], loop: true, shuffle: false, restartOnShow: false };
    case "region": return { kind, name: "Ekran bölgesi", screenId: null, screenName: "", region: { x: 0, y: 0, w: 0.5, h: 0.5 } };
    default: return null;
  }
}

export const isLiveKind = (kind) => LIVE_SOURCE_TYPES.some((t) => t.kind === kind);
/** Ses taşıyan görüntü kaynakları: her biri kendi ses şeridini alır (Ses sekmesi). */
export const AV_KINDS = new Set(["phone", "ingest", "stream", "playlist"]);
/** ffmpeg ile ana süreçte çalışan akış kaynakları. */
export const FEED_KINDS = new Set(["ingest", "stream"]);

/** Akış kaynağının ana sürece gidecek ayarı. */
export function feedSpecOf(source) {
  if (source.kind === "ingest") return { mode: "listen", protocol: source.protocol === "srt" ? "srt" : "rtmp", port: num(source.port, 1935), key: String(source.key || ""), latencyMs: num(source.latencyMs, 200), transcode: Boolean(source.transcode) };
  if (source.kind === "stream") return { mode: "pull", url: String(source.url || "").trim(), rtspTransport: source.rtspTransport === "udp" ? "udp" : "tcp", latencyMs: num(source.latencyMs, 200), transcode: Boolean(source.transcode) };
  return null;
}

/** Ağ akışı adresi: tür etiketi (arayüz) ya da null. */
export function streamUrlKind(raw) {
  let u;
  try { u = new URL(String(raw || "").trim()); } catch { return null; }
  const p = u.protocol.replace(":", "").toLowerCase();
  if (p === "rtsp" || p === "rtsps") return "RTSP";
  if (p === "rtmp" || p === "rtmps") return "RTMP";
  if (p === "srt") return "SRT";
  if (p === "udp" || p === "rtp") return "UDP";
  if (p === "http" || p === "https") {
    const path = u.pathname.toLowerCase();
    if (path.endsWith(".m3u8")) return "HLS";
    if (path.endsWith(".flv")) return "HTTP-FLV";
    return "HTTP";
  }
  return null;
}

/** Kaynağın yeniden açılma imzası (bu türler). */
export function liveSignature(source) {
  switch (source.kind) {
    case "phone": return `phone|${source.token || ""}`;
    case "ingest":
    case "stream": return `feed|${JSON.stringify(feedSpecOf(source))}|${source.nonce || 0}`;
    case "web": return `web|${source.url}|${source.width}x${source.height}|${source.fps}|${source.transparent !== false}|${source.zoom || 1}|${(source.css || "").length}|${source.nonce || 0}`;
    case "playlist": return `playlist|${(source.items || []).map((i) => i.url).join("|").length}|${(source.items || []).length}|${source.loop !== false}|${Boolean(source.shuffle)}`;
    case "region": return `screen|${source.screenId || ""}|${source.nonce || 0}`;
    default: return null;
  }
}

/* ------------------------------ MSE canlı uç ------------------------------ */

/**
 * Canlı akışta oynatma kafası nerede durmalı. buffered: [[start, end], …] (sn).
 * → { action: "none" | "seek" | "speed", to?, rate? }
 *   gecikme > maxLag: canlı uca atla (end − target); target < gecikme ≤ maxLag: %5 hızlı oynat.
 */
export function liveEdgeAction(currentTime, buffered, { target = 0.25, maxLag = 1.5 } = {}) {
  if (!buffered?.length) return { action: "none" };
  const [start, end] = buffered[buffered.length - 1];
  if (currentTime < start - 0.05 || currentTime > end + 0.05) return { action: "seek", to: Math.max(start, end - target) };
  const lag = end - currentTime;
  if (lag > maxLag) return { action: "seek", to: Math.max(start, end - target) };
  if (lag > target * 2) return { action: "speed", rate: 1.05 };
  return { action: "speed", rate: 1 };
}

/** Eski tamponu sil: [0, currentTime − keep) (canlı akış hafızayı doldurmasın). */
export function trimRange(currentTime, buffered, keep = 6) {
  if (!buffered?.length) return null;
  const start = buffered[0][0];
  const until = currentTime - keep;
  return until - start > 4 ? [start, until] : null;
}

/* ------------------------------ kayan yazı ------------------------------ */

/**
 * Kayan yazının o anki kayması (px). speed: px/sn (1080p ölçeğinde), textW: bir tur genişliği.
 * Sağdan sola akar; textW periyoduyla döner (kesintisiz döngü).
 */
export function tickerOffset(now, speed, textW, scale = 1) {
  const w = Math.max(1, textW);
  const px = (now / 1000) * Math.max(5, num(speed, 120)) * scale;
  return px % w;
}

/* ------------------------------ oynatma listesi ------------------------------ */

/** Karışık sıra (tohumlu; testlerde belirli). */
export function shuffledOrder(n, seed = Date.now()) {
  const order = Array.from({ length: n }, (_, i) => i);
  let s = (Number(seed) >>> 0) || 1;
  const rnd = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  for (let i = n - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

/**
 * Sonraki öğe. state: { order, pos }. → { pos, index, ended }.
 * Döngü kapalıysa listenin sonunda ended: true (son öğede durur).
 */
export function playlistNext(state, { loop = true, step = 1 } = {}) {
  const n = state.order.length;
  if (!n) return { pos: 0, index: -1, ended: true };
  let pos = state.pos + step;
  if (pos >= n) { if (!loop) return { pos: n - 1, index: state.order[n - 1], ended: true }; pos = 0; }
  if (pos < 0) pos = loop ? n - 1 : 0;
  return { pos, index: state.order[pos], ended: false };
}

/* ------------------------------ ekran bölgesi ------------------------------ */

export function normalizeRegion(r) {
  let x = clamp(num(r?.x, 0), 0, 0.98);
  let y = clamp(num(r?.y, 0), 0, 0.98);
  const w = clamp(num(r?.w, 0.5), 0.02, 1 - x);
  const h = clamp(num(r?.h, 0.5), 0.02, 1 - y);
  x = Math.round(x * 1000) / 1000; y = Math.round(y * 1000) / 1000;
  return { x, y, w: Math.round(w * 1000) / 1000, h: Math.round(h * 1000) / 1000 };
}

/** Bölge (0…1) → kaynak pikseli. */
export function regionPixels(region, vw, vh) {
  const r = normalizeRegion(region);
  const sx = Math.round(r.x * vw);
  const sy = Math.round(r.y * vh);
  return { sx, sy, sw: Math.max(1, Math.min(vw - sx, Math.round(r.w * vw))), sh: Math.max(1, Math.min(vh - sy, Math.round(r.h * vh))) };
}

/* ------------------------------ görüntü gecikmesi (senkron) ------------------------------ */

export const MAX_VIDEO_DELAY_MS = 500;

/**
 * Halka tampon: her karede kopya alınır, `delayMs` önceki kare çizilir.
 * → { slots, pick(now) } — saf hesap: kaç kare tutulmalı.
 */
export const delaySlots = (delayMs, fps = 30) => Math.min(Math.ceil((MAX_VIDEO_DELAY_MS / 1000) * 60) + 1, Math.max(1, Math.ceil((clamp(num(delayMs, 0), 0, MAX_VIDEO_DELAY_MS) / 1000) * Math.max(1, fps)) + 1));

/** Zaman damgalı kareler arasından `now − delay`'e en yakın eski kare. frames: [{ t }] (eskiden yeniye). */
export function pickDelayed(frames, now, delayMs) {
  const want = now - delayMs;
  let best = -1;
  for (let i = 0; i < frames.length; i += 1) if (frames[i].t <= want) best = i;
  return best >= 0 ? best : (frames.length ? 0 : -1);
}

/* ------------------------------ telefon ------------------------------ */

export const PHONE_RESOLUTIONS = [
  { key: 480, label: "480p (zayıf Wi-Fi)" },
  { key: 720, label: "720p (önerilen)" },
  { key: 1080, label: "1080p" },
  { key: 2160, label: "4K (destekleyen telefon)" },
];

/** Telefonun bildirdiği medya bilgisi → kısa yazı. */
export function phoneMediaText(media) {
  if (!media) return "";
  const parts = [];
  if (media.width && media.height) parts.push(`${media.width}×${media.height}`);
  if (media.fps) parts.push(`${media.fps} fps`);
  if (media.facing) parts.push(media.facing === "user" ? "ön kamera" : "arka kamera");
  if (media.audio === false) parts.push("sessiz");
  return parts.join(" · ");
}
