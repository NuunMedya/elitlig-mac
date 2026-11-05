// Yayın Stüdyosu — kodlayıcı, YouTube, gol klibi ve kısayol yardımcıları (saf).

/* ------------------------------ kalite ------------------------------ */

export const QUALITY_PRESETS = [
  { key: "720p30", label: "720p · 30 fps", hint: "Önerilen (≥ 4 Mbps yükleme)", width: 1280, height: 720, fps: 30, videoBitrateKbps: 2500 },
  { key: "1080p30", label: "1080p · 30 fps", hint: "Güçlü bağlantı (≥ 8 Mbps)", width: 1920, height: 1080, fps: 30, videoBitrateKbps: 4500 },
  { key: "1080p60", label: "1080p · 60 fps", hint: "Fiber / kablolu (≥ 10 Mbps), güçlü Mac", width: 1920, height: 1080, fps: 60, videoBitrateKbps: 6000 },
];
export const AUDIO_BITRATE_KBPS = 128;
export const presetOf = (key) => QUALITY_PRESETS.find((p) => p.key === key) || QUALITY_PRESETS[0];

/* ------------------- kodlama: çözünürlük · fps · bit hızı (elle) ------------------- */

export const RESOLUTION_CHOICES = [
  { key: "720p", label: "720p", width: 1280, height: 720 },
  { key: "1080p", label: "1080p", width: 1920, height: 1080 },
];
export const FPS_CHOICES = [30, 60];
export const BITRATE_MIN_KBPS = 800;
export const BITRATE_MAX_KBPS = 20000;
/** Hazır bit hızları (YouTube önerileri: 720p30 ≈ 2,5–4 Mbps, 1080p60 ≈ 6–9 Mbps). */
export const BITRATE_PRESETS = [
  { kbps: 2500, label: "2,5 Mbps", hint: "Zayıf / mobil bağlantı" },
  { kbps: 4500, label: "4,5 Mbps", hint: "1080p30 için iyi" },
  { kbps: 6000, label: "6 Mbps", hint: "1080p60 için iyi" },
  { kbps: 9000, label: "9 Mbps", hint: "Fiber, en net görüntü" },
];

/** Çözünürlük + fps için önerilen bit hızı (kbps). */
export function recommendedBitrate(resolution, fps) {
  const hd = resolution === "1080p";
  const hi = Number(fps) >= 60;
  if (hd) return hi ? 6000 : 4500;
  return hi ? 4000 : 2500;
}

/**
 * Elle girilen bit hızı. Dönüş: { ok, value (kbps, sınırlı), message }.
 * Boş / sayı değil → ok:false; sınır dışı → ok:false ama value sınıra çekilmiş.
 */
export function validateBitrate(input) {
  const raw = String(input ?? "").trim().replace(/\s/g, "").replace(",", ".");
  if (!raw) return { ok: false, value: null, message: "Bit hızı gir (kbps)." };
  const n = Number(raw);
  if (!Number.isFinite(n)) return { ok: false, value: null, message: "Bit hızı sayı olmalı (ör. 4500)." };
  const v = Math.round(n);
  if (v < BITRATE_MIN_KBPS) return { ok: false, value: BITRATE_MIN_KBPS, message: `En az ${BITRATE_MIN_KBPS} kbps.` };
  if (v > BITRATE_MAX_KBPS) return { ok: false, value: BITRATE_MAX_KBPS, message: `En çok ${BITRATE_MAX_KBPS} kbps.` };
  return { ok: true, value: v, message: null };
}

/** Gereken yükleme hızı (Mbps): görüntü + ses, %50 pay. */
export const uploadNeedMbps = (kbps) => Math.round((((Number(kbps) || 0) + AUDIO_BITRATE_KBPS) * 1.5) / 100) / 10;

/** Bit hızı uyarısı (çözünürlüğe göre çok düşük / çok yüksek). */
export function bitrateAdvice(enc) {
  const rec = recommendedBitrate(enc.resolution, enc.fps);
  const v = Number(enc.bitrateKbps) || 0;
  if (v < rec * 0.6) return `Bu çözünürlük için düşük: görüntü bloklanabilir (önerilen ≈ ${rec} kbps).`;
  if (v > 12000) return "YouTube 1080p için 12 Mbps'ın üstü gereksiz; bağlantı zorlanabilir.";
  return null;
}

/**
 * Kayıtlı tercih → { resolution, fps, bitrateKbps }. Eski "quality" anahtarı
 * ("1080p60" …) da okunur.
 */
export function normalizeEncoding(raw, legacyQuality) {
  const legacy = legacyQuality ? presetOf(legacyQuality) : null;
  const resolution = RESOLUTION_CHOICES.some((r) => r.key === raw?.resolution) ? raw.resolution : legacy ? (legacy.height >= 1080 ? "1080p" : "720p") : "720p";
  const fps = FPS_CHOICES.includes(Number(raw?.fps)) ? Number(raw.fps) : legacy ? legacy.fps : 30;
  const b = validateBitrate(raw?.bitrateKbps);
  const bitrateKbps = b.ok ? b.value : b.value ?? (legacy ? legacy.videoBitrateKbps : recommendedBitrate(resolution, fps));
  return { resolution, fps, bitrateKbps };
}

/** Kodlayıcıya giden ayar: { key, width, height, fps, videoBitrateKbps }. */
export function encodingPreset(enc) {
  const e = normalizeEncoding(enc);
  const r = RESOLUTION_CHOICES.find((x) => x.key === e.resolution);
  return { key: `${e.resolution}${e.fps}`, width: r.width, height: r.height, fps: e.fps, videoBitrateKbps: e.bitrateKbps };
}

/** MediaRecorder biçimi: önce H.264 (ffmpeg kopyalar), yoksa VP8 (ffmpeg kodlar). */
export const MIME_PREFERENCE = [
  "video/x-matroska;codecs=avc1,opus",
  "video/webm;codecs=h264,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
];
/** Sessiz görüntü (açı kaydı, özet): ses kodeki olmadan. */
export const VIDEO_ONLY_MIME_PREFERENCE = [
  "video/x-matroska;codecs=avc1",
  "video/webm;codecs=h264",
  "video/webm;codecs=vp8",
  "video/webm",
];
export function pickMimeType(isSupported, list = MIME_PREFERENCE) {
  for (const type of list) {
    try { if (isSupported(type)) return type; } catch { /* sonraki */ }
  }
  return "";
}

/** MediaRecorder bit hızı: ffmpeg yeniden kodlayacağı için hedefin ~2 katı. */
export const recorderBitsPerSecond = (videoKbps) => Math.round(Math.max(500, Number(videoKbps) || 2500) * 2 * 1000);

/* ------------------------------ durum ------------------------------ */

export const ON_AIR_STATES = ["connecting", "live", "reconnecting"];
/** Kodlayıcı görüntü alıyor mu (canlı ya da prova kaydı). */
export const isEncoding = (state) => ["starting", "connecting", "live", "reconnecting", "recording"].includes(state);

/** "1:05:09" / "05:09" */
export function elapsedText(ms) {
  const total = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Üst çubuktaki durum hapı. */
export function statusPill(state, sinceMs, now = Date.now()) {
  switch (state) {
    case "starting":
    case "connecting":
      return { label: "BAĞLANIYOR", tone: "warn" };
    case "live":
      return { label: `CANLI ${elapsedText(sinceMs ? now - sinceMs : 0)}`, tone: "live" };
    case "reconnecting":
      return { label: "YENİDEN BAĞLANIYOR", tone: "warn" };
    case "recording":
      return { label: `PROVA KAYDI ${elapsedText(sinceMs ? now - sinceMs : 0)}`, tone: "rec" };
    case "failed":
      return { label: "YAYIN HATASI", tone: "error" };
    default:
      return { label: "YAYIN KAPALI", tone: "off" };
  }
}

/* ------------------------------ YouTube ------------------------------ */

export const PRIVACY_LABELS = { public: "Herkese açık", unlisted: "Liste dışı", private: "Özel" };

export function joinRtmp(base, key) {
  const url = String(base ?? "").trim();
  const k = String(key ?? "").trim();
  if (!url) return null;
  if (!k) return url;
  return `${url.replace(/\/+$/, "")}/${k.replace(/^\/+/, "")}`;
}

/** Sunucunun verdiği yayın adresi: rtmp_publish_url ya da rtmp_url + "/" + stream_key. */
export function ingestUrl(stream) {
  if (!stream) return null;
  return stream.rtmp_publish_url || joinRtmp(stream.rtmp_url, stream.stream_key);
}

export const isRtmpUrl = (url) => /^rtmps?:\/\/[^\s/]+\/\S+/i.test(String(url || "").trim());

export function streamStatusLabel(status) {
  switch (String(status ?? "").toLowerCase()) {
    case "created":
    case "ready": return "Hazır, görüntü bekleniyor";
    case "testing": return "Test ediliyor";
    case "live": return "YouTube'da yayında";
    case "complete": return "Yayın bitti";
    case "revoked": return "Yayın iptal edildi";
    case "deleted": return "Yayın silindi";
    case "error": return "YouTube hata bildirdi";
    default: return "Yayın açılmadı";
  }
}

/** YouTube yayını yeniden kullanılabilir mi (bitmemiş, adresi var). */
export const reusableStream = (stream) => Boolean(stream && stream.active !== false && !["complete", "revoked", "deleted"].includes(String(stream.status || "").toLowerCase()) && ingestUrl(stream));

/* ------------------------------ gol klipleri ------------------------------ */

export const CLIP_SECONDS = 10;

export function clipStatusLabel(clip) {
  switch (clip?.status) {
    case "saving": return "Kaydediliyor…";
    case "ready": return clip.settled ? "Yüklemeye hazır" : "Golcü bekleniyor";
    case "uploading": return "Yükleniyor…";
    case "uploaded": return "Profilde";
    case "failed": return "Yüklenemedi";
    case "local": return "Yalnız bu bilgisayarda";
    case "error": return clip.error || "Klip kaydedilemedi";
    default: return "";
  }
}

export const clipTone = (clip) => ({ saving: "amber", ready: "blue", uploading: "blue", uploaded: "green", failed: "red", local: "", error: "red" }[clip?.status] || "");

/** Klip yayına verilebilir mi. */
export const clipPlayable = (clip) => Boolean(clip?.url) && clip.status !== "saving" && clip.status !== "error";

/** Tekrar sırasında alt bant. */
export function replayEvent(clip) {
  if (!clip) return null;
  const own = String(clip.code || "").toUpperCase() === "GOAL_OWN";
  return { kind: "goal", label: own ? "KENDİ KALESİNE" : "GOL", player: clip.scorer ? String(clip.scorer).toLocaleUpperCase("tr-TR") : null };
}

/* ------------------------------ kısayollar ------------------------------ */

/** Yazı alanındayken ya da ⌘/⌃/⌥ basılıyken stüdyo kısayolları çalışmaz. */
export function isTypingTarget(target) {
  if (!target) return false;
  const tag = String(target.tagName || "").toUpperCase();
  return Boolean(target.isContentEditable) || tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

/**
 * Tuş → stüdyo eylemi. Dönüş: { type: "mic" | "replay" | "scene" | "transition" | "goal", ... } | null
 *   M mikrofon · R son tekrar · B "önemli an" tekrarı kaydet · 1–9 kutuyu önizlemeye al ·
 *   Boşluk / Enter geçiş · G sonra H (ev) / A (deplasman) gol.
 */
export function keyAction(e, { pendingGoal = false } = {}) {
  if (!e || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return null;
  if (isTypingTarget(e.target)) return null;
  const key = String(e.key || "");
  const lower = key.toLocaleLowerCase("en-US");
  if (pendingGoal) {
    if (lower === "h" || lower === "e") return { type: "goal", side: "home" };
    if (lower === "a" || lower === "d") return { type: "goal", side: "away" };
    return { type: "goalCancel" };
  }
  if (lower === "m") return { type: "mic" };
  if (lower === "r") return { type: "replay" };
  if (lower === "b") return { type: "moment" };
  if (lower === "g") return { type: "goalArm" };
  if (key === " " || key === "Enter") {
    // Düğmede Boşluk/Enter düğmeye basar; geçiş yapmaz.
    const tag = String(e.target?.tagName || "").toUpperCase();
    if (tag === "BUTTON" || tag === "A") return null;
    return { type: "transition" };
  }
  if (/^[1-9]$/.test(key)) return { type: "scene", index: Number(key) - 1 };
  return null;
}
