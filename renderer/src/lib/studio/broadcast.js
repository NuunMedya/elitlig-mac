// Yayın Stüdyosu — kodlayıcı, YouTube, gol klibi ve kısayol yardımcıları (saf).

/* ------------------------------ kalite ------------------------------ */

export const QUALITY_PRESETS = [
  { key: "720p30", label: "720p · 30 fps", hint: "Önerilen (≥ 4 Mbps yükleme)", width: 1280, height: 720, fps: 30, videoBitrateKbps: 2500 },
  { key: "1080p30", label: "1080p · 30 fps", hint: "Güçlü bağlantı (≥ 8 Mbps)", width: 1920, height: 1080, fps: 30, videoBitrateKbps: 4500 },
  { key: "1080p60", label: "1080p · 60 fps", hint: "Fiber / kablolu (≥ 10 Mbps), güçlü Mac", width: 1920, height: 1080, fps: 60, videoBitrateKbps: 6000 },
];
/** Yayın sesi (AAC-LC 48 kHz stereo): 192 kbps (128 kbps'de 16 kHz üstü belirgin kesilir; YouTube ≥ 128 ister). */
export const AUDIO_BITRATE_KBPS = 192;
export const presetOf = (key) => QUALITY_PRESETS.find((p) => p.key === key) || QUALITY_PRESETS[0];

/* ------------------- kodlama: çözünürlük · fps · bit hızı (elle) ------------------- */

export const RESOLUTION_CHOICES = [
  { key: "720p", label: "720p", width: 1280, height: 720 },
  { key: "1080p", label: "1080p", width: 1920, height: 1080 },
  { key: "1440p", label: "1440p", width: 2560, height: 1440 },
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
  { kbps: 12000, label: "12 Mbps", hint: "1080p60 üst sınırı (YouTube)" },
  { kbps: 18000, label: "18 Mbps", hint: "1440p60 (YouTube 9–18 Mbps)" },
];

/**
 * Çözünürlük + fps için önerilen bit hızı (kbps). YouTube önerisi (H.264):
 * 720p30 1,5–4, 720p60 2,25–6, 1080p30 4,5–9, 1080p60 6–9+ (en çok 12),
 * 1440p30 6–13, 1440p60 9–18 Mbps; hareketli (futbol) görüntüde aralığın üst
 * yarısı: blok blok görüntü olmasın.
 */
export function recommendedBitrate(resolution, fps) {
  const hi = Number(fps) >= 60;
  if (resolution === "1440p") return hi ? 18000 : 12000;
  if (resolution === "1080p") return hi ? 9000 : 6000;
  return hi ? 4500 : 3000;
}

/** Çözünürlüğe göre anlamlı üst bit hızı (kbps): üstü YouTube'da fark yaratmaz, bağlantıyı zorlar. */
export const maxUsefulBitrate = (resolution) => (resolution === "1440p" ? 20000 : resolution === "1080p" ? 12000 : 7500);

/** "Yayın kalitesi" hızlı ayarları (Yayın sekmesi ve Ayarlar › Yayın). */
export const STREAM_QUALITY_PRESETS = [
  { key: "smooth", label: "Akıcı", detail: "720p · 60 fps · 4,5 Mbps", hint: "Hızlı hareket akıcı; ≥ 7 Mbps yükleme", resolution: "720p", fps: 60, bitrateKbps: 4500 },
  { key: "balanced", label: "Dengeli", detail: "1080p · 30 fps · 6 Mbps", hint: "Önerilen; ≥ 9 Mbps yükleme", resolution: "1080p", fps: 30, bitrateKbps: 6000 },
  { key: "high", label: "Yüksek", detail: "1080p · 60 fps · 9 Mbps", hint: "Fiber / kablolu; ≥ 14 Mbps yükleme", resolution: "1080p", fps: 60, bitrateKbps: 9000 },
  { key: "ultra", label: "Çok yüksek", detail: "1080p · 60 fps · 12 Mbps", hint: "YouTube'un 1080p60 üst sınırı; ≥ 18 Mbps kararlı yükleme", resolution: "1080p", fps: 60, bitrateKbps: 12000, heavy: true },
  { key: "qhd", label: "1440p", detail: "1440p · 60 fps · 18 Mbps", hint: "YouTube 1440p60 (9–18 Mbps); ≥ 27 Mbps kararlı yükleme, güçlü bilgisayar (donanım kodlayıcı)", resolution: "1440p", fps: 60, bitrateKbps: 18000, heavy: true },
];

/**
 * Ağır hızlı ayar uyarısı (yükleme hızı): ≥ 12 Mbps görüntüde, bağlantının kararlı
 * olarak taşıması gereken hız ve ne olacağı. Ağır değilse null.
 */
export function heavyPresetWarning(enc) {
  const v = Number(enc?.bitrateKbps) || 0;
  if (v < 12000 && enc?.resolution !== "1440p") return null;
  return `Bu kalite ≈ ${String(uploadNeedMbps(v)).replace(".", ",")} Mbps kararlı yükleme ister. Bağlantı yetmezse yayın takılır ve tekrar bağlanır; yayından önce hız testi yapın (kablolu bağlantı önerilir).`;
}
/** Kodlama ayarı bir hızlı ayara denk geliyorsa anahtarı, değilse null. */
export const qualityPresetKey = (enc) => STREAM_QUALITY_PRESETS.find((p) => p.resolution === enc?.resolution && p.fps === Number(enc?.fps) && p.bitrateKbps === Number(enc?.bitrateKbps))?.key || null;

/**
 * Ağa göre kalite önerisi (yayın sürerken RTMP aktarıcısının sayaçlarından):
 * aktarıcı kare atlıyorsa (dropEvents) ya da gönderim hedefin %85'inin altında
 * kalıyorsa bağlantının taşıyabildiği (gönderilen bit hızı) %30 payla hesaplanır
 * ve ona sığan en yüksek hızlı ayar önerilir. Sorun yoksa null (bağlantının daha
 * fazlasını taşıyıp taşımadığı yayın sırasında ölçülemez).
 * → { key, label, reason, capacityKbps } | null
 */
export function recommendQuality({ network = null, targetKbps = 0, audioKbps = AUDIO_BITRATE_KBPS } = {}) {
  if (!network || network.state !== "up") return null;
  const sent = Number(network.sentKbps) || 0;
  const target = (Number(targetKbps) || 0) + (Number(audioKbps) || 0);
  const dropping = Boolean(network.dropping) || Number(network.dropEvents) > 0;
  const behind = sent > 0 && target > 0 && sent < target * 0.85;
  if (!dropping && !behind) return null;
  const capacityKbps = sent || target * 0.6;
  const fits = [...STREAM_QUALITY_PRESETS].reverse().find((p) => (p.bitrateKbps + audioKbps) * 1.3 <= capacityKbps);
  const pick = fits || STREAM_QUALITY_PRESETS[0];
  const lower = fits ? null : Math.max(BITRATE_MIN_KBPS, Math.floor((capacityKbps / 1.3 - audioKbps) / 100) * 100);
  const why = dropping ? "Bağlantı yayına yetişemiyor (kareler atlandı)" : `Gönderim ${Math.round(sent / 100) / 10} Mbps, hedefin altında`;
  return {
    key: pick.key,
    label: fits ? `${pick.label} (${pick.detail})` : `${pick.label}, bit hızı ≈ ${lower} kbps`,
    bitrateKbps: fits ? pick.bitrateKbps : lower,
    reason: `${why}; bir sonraki yayında “${fits ? pick.label : `${pick.label} · ${lower} kbps`}” önerilir.`,
    capacityKbps: Math.round(capacityKbps),
  };
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
  const max = maxUsefulBitrate(enc.resolution);
  if (v > max) return `YouTube ${enc.resolution || "720p"} için ${String(Math.round(max / 100) / 10).replace(".", ",")} Mbps'ın üstü gereksiz; bağlantı zorlanabilir.`;
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

/**
 * Yedek giriş adresi (YouTube backup ingest): sunucu tam adresi backup_ingest_url
 * olarak verir; eski / başka adlar (backup_ingestion_address, backupIngestionAddress)
 * yalnız taban adresse anahtar eklenir. Ana adresle aynıysa ya da RTMP değilse null.
 * Motor 3 ardışık kopmadan sonra buna geçer (ve geri döner).
 */
export function backupIngestUrl(stream) {
  if (!stream) return null;
  const full = stream.backup_ingest_url || stream.backupIngestUrl || null;
  const base = stream.backup_ingestion_address || stream.backupIngestionAddress || null;
  const url = full ? String(full).trim() : base ? joinRtmp(base, stream.stream_key || stream.streamName || stream.stream_name) : null;
  if (!url || !isRtmpUrl(url) || url === ingestUrl(stream)) return null;
  return url;
}

export const isRtmpUrl = (url) =>/^rtmps?:\/\/[^\s/]+\/\S+/i.test(String(url || "").trim());

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

/** Varsayılan tuşlar (settings/settings.js DEFAULT_HOTKEYS ile aynı). */
export const KEY_DEFAULTS = { transition: [" ", "Enter"], lastScene: ["l"], mic: ["m"], replay: ["r"], moment: ["b"], goalArm: ["g"], var: ["v"], chapter: ["c"], help: ["?"] };

/**
 * Tuş → stüdyo eylemi. Dönüş: { type: "mic" | "replay" | "scene" | "transition" | "goal" | … } | null
 *   Varsayılan: M mikrofon · R son tekrar · B "önemli an" · 1–9 sahneyi önizlemeye al ·
 *   Boşluk / Enter geçiş · L son sahne · C bölüm işareti · G sonra H (ev) / A (deplasman) gol.
 * opts.hotkeys: { eylem: [tuş] } (Ayarlar › Kısayollar ile değiştirilir).
 */
export function keyAction(e, { pendingGoal = false, hotkeys = KEY_DEFAULTS } = {}) {
  if (!e || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return null;
  if (isTypingTarget(e.target)) return null;
  const key = String(e.key || "");
  const lower = key.length === 1 ? key.toLocaleLowerCase("en-US") : key;
  if (pendingGoal) {
    if (lower === "h" || lower === "e") return { type: "goal", side: "home" };
    if (lower === "a" || lower === "d") return { type: "goal", side: "away" };
    return { type: "goalCancel" };
  }
  if (/^[1-9]$/.test(key)) return { type: "scene", index: Number(key) - 1 };
  for (const [type, list] of Object.entries(hotkeys || KEY_DEFAULTS)) {
    if (!Array.isArray(list) || !list.includes(lower)) continue;
    if (type === "transition" && (key === " " || key === "Enter")) {
      // Düğmede Boşluk/Enter düğmeye basar; geçiş yapmaz.
      const tag = String(e.target?.tagName || "").toUpperCase();
      if (tag === "BUTTON" || tag === "A") return null;
    }
    return { type };
  }
  return null;
}

/* ------------------------------ YouTube bölümleri ------------------------------ */

/** "0:00" / "12:31" / "1:02:09" (YouTube bölüm damgası). */
export function chapterStamp(ms) {
  const t = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = String(t % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${String(m).padStart(2, "0")}:${sec}`;
}

/**
 * Bölüm işaretleri → YouTube açıklamasına yapıştırılan liste.
 * markers: [{ atMs (yayın başından), label }]. YouTube kuralları: ilk bölüm 00:00,
 * bölümler en az 10 sn arayla (yakın olanlar birleştirilir), sıralı.
 */
export function youtubeChapters(markers, { first = "Başlangıç", minGapMs = 10_000 } = {}) {
  const list = [...(markers || [])].filter((m) => Number.isFinite(Number(m?.atMs))).sort((a, b) => a.atMs - b.atMs);
  const out = [{ atMs: 0, label: first }];
  for (const m of list) {
    const label = String(m.label || "Bölüm").trim().slice(0, 80) || "Bölüm";
    const last = out[out.length - 1];
    if (m.atMs - last.atMs < minGapMs) {
      if (m.atMs < minGapMs && out.length === 1) { out[0] = { atMs: 0, label }; continue; }
      if (!last.label.includes(label)) last.label = `${last.label} · ${label}`;
      continue;
    }
    out.push({ atMs: m.atMs, label });
  }
  return out.map((m) => `${chapterStamp(m.atMs)} ${m.label}`).join("\n");
}

/* ------------------------------ yayın sağlığı ------------------------------ */

/**
 * Yayın sağlığı özeti (üst çubuk göstergesi). status: ana süreç onStatus
 * ({ fps, droppedFrames, bitrateKbps, speed }); draw: karıştırıcı
 * ({ fps, drawMs, stalls }); targetFps: çıkış kare hızı.
 * Dönüş { tone: "ok" | "warn" | "bad" | "idle", fps, dropped, bitrateKbps, speed, warnings: [metin] }.
 * speed < 0,95: kodlayıcı gerçek zamana yetişemiyor (YouTube kesintisi / tamponlama).
 */
export function streamHealth({ status = {}, draw = {}, targetFps = 30, encoding = false } = {}) {
  const fps = Number.isFinite(status.fps) ? Math.round(status.fps) : Number(draw.fps) || 0;
  const speed = Number.isFinite(Number(status.speed)) ? Number(status.speed) : null;
  const dropped = Number(status.droppedFrames) || 0;
  const bitrateKbps = Number.isFinite(status.bitrateKbps) ? Math.round(status.bitrateKbps) : null;
  const warnings = [];
  let tone = encoding ? "ok" : "idle";
  const worse = (t) => { if (t === "bad" || (t === "warn" && tone !== "bad")) tone = t; };
  if (encoding && speed != null && speed < 0.95) { warnings.push(`Kodlayıcı hızı ${speed.toFixed(2)}× — gerçek zamana yetişemiyor (kaliteyi / bit hızını düşür).`); worse(speed < 0.85 ? "bad" : "warn"); }
  if (Number(draw.fps) && Number(draw.fps) < targetFps * 0.85) { warnings.push(`Program çizimi ${draw.fps} fps (hedef ${targetFps}).`); worse(encoding ? "warn" : tone); }
  if (Number(draw.stalls) > 0) { warnings.push(`Son saniyede ${draw.stalls} takılma (uygulama meşgul).`); worse(encoding ? "warn" : tone); }
  if (encoding && status.state === "reconnecting") { warnings.push(status.message || "Yayın sunucusuna yeniden bağlanılıyor."); worse("bad"); }
  const network = status.network || null;
  if (encoding && network?.dropping) { warnings.push("Bağlantı yayına yetişemiyor: bazı kareler atlanıyor (bit hızını düşür)."); worse("warn"); }
  if (encoding && network?.target === "backup") warnings.push("Yedek yayın sunucusu kullanılıyor.");
  return {
    tone, fps, dropped, bitrateKbps, speed, drawMs: Number(draw.drawMs) || 0, warnings,
    // Ağ (RTMP aktarıcısı): gönderilen bit hızı, yeniden bağlanma sayısı, son hata.
    sentKbps: Number.isFinite(network?.sentKbps) ? network.sentKbps : null,
    reconnects: Number(network?.reconnects) || 0,
    lastError: network?.lastError?.message || null,
  };
}

const mbpsText = (kbps) => `${(Number(kbps) / 1000).toFixed(1).replace(".", ",")} Mbps`;

/**
 * Ağ kuyruğu (sn): aktarıcıda bekleyen veri / gelen bit hızı. Node yayıncısında
 * pendingBytes = aktarıcı ffmpeg girişi + soket kuyruğu (çekirdeğe verilemeyen).
 */
export function networkQueueSec(network) {
  const n = network || null;
  const kbps = Number(n?.inKbps) || Number(n?.sentKbps) || 0;
  const bytes = Number(n?.pendingBytes) || 0;
  return kbps > 0 ? Math.round(((bytes * 8) / (kbps * 1000)) * 10) / 10 : 0;
}

/**
 * Darboğaz sınıflaması (Yayın tanılama): sorun nerede?
 *   network  "Ağ yetmiyor"          — aktarıcı kare atlıyor / ağ kuyruğu büyüyor / sunucuya ulaşan < üretilen
 *   encoder  "Kodlayıcı yetişmiyor" — WebCodecs kuyruğu ≥ 3 kare ya da kodlanan fps < çizilen; eski yolda ffmpeg hızı < 0,95×
 *   busy     "Bilgisayar meşgul"     — ana iş parçacığı takılıyor (çizim takılması)
 *   draw     "Çizim yetişmiyor"      — program çizimi hedef fps'in altında
 *   ok       "Sorun yok"
 * Sıra önemlidir: ağ yetmezse kodlayıcı / çizim normal görünür; kodlayıcı takılırsa ağ boş kalır.
 * → { key, label, detail, tone }
 */
export function bottleneckCause({ status = {}, draw = {}, enc = null, targetFps = 30, encoding = false } = {}) {
  if (!encoding) return { key: "idle", label: "Yayın kapalı", detail: "", tone: "idle" };
  const n = status.network || null;
  const fps = Number(targetFps) || 30;
  if (n && (n.state === "down" || n.state === "connecting" || status.state === "reconnecting")) {
    return { key: "network", label: "Ağ yetmiyor", detail: n.lastError?.message || "Yayın sunucusuna yeniden bağlanılıyor.", tone: "bad" };
  }
  if (n && n.state === "up") {
    const q = networkQueueSec(n);
    const produced = Number(n.inKbps) || 0;
    const reach = Number.isFinite(n.ackKbps) ? n.ackKbps : Number.isFinite(n.uplinkKbps) ? n.uplinkKbps : Number(n.sentKbps) || 0;
    const behind = produced > 300 && reach > 0 && reach < produced * 0.85;
    if (n.dropping || q >= 2 || (behind && q >= 1)) {
      const parts = [];
      if (reach > 0) parts.push(`bağlantı ≈ ${mbpsText(reach)} taşıyor`);
      if (produced > 0) parts.push(`yayın ${mbpsText(produced)}`);
      parts.push(`kuyruk ${String(q).replace(".", ",")} sn`);
      return { key: "network", label: "Ağ yetmiyor", detail: `${parts.join(", ")}${n.dropping ? "; kareler atlanıyor" : ""}. Bit hızını düşürün ya da kablolu bağlantı kullanın.`, tone: n.dropping || q >= 4 ? "bad" : "warn" };
    }
  }
  const drawFps = Number(draw.fps) || 0;
  if (enc && enc.pipeline === "webcodecs") {
    const encFps = Number(enc.encodedFps) || 0;
    if (Number(enc.queue) >= 3 || (drawFps >= fps * 0.9 && encFps > 0 && encFps < Math.min(drawFps, fps) * 0.9)) {
      return { key: "encoder", label: "Kodlayıcı yetişmiyor", detail: `kodlanan ${encFps} fps (çizilen ${drawFps}), kuyruk ${enc.queue || 0} kare. Bit hızını / çözünürlüğü düşürün${enc.hardware ? "" : " ya da donanım kodlayıcıyı açın"}.`, tone: "warn" };
    }
  } else if (Number.isFinite(Number(status.speed)) && Number(status.speed) < 0.95) {
    return { key: "encoder", label: "Kodlayıcı yetişmiyor", detail: `ffmpeg hızı ${Number(status.speed).toFixed(2)}× (gerçek zaman 1,00×).`, tone: "warn" };
  }
  if (Number(draw.stalls) > 0) return { key: "busy", label: "Bilgisayar meşgul", detail: `son saniyede ${draw.stalls} takılma (en uzun çizim ${Number(draw.drawMs) || 0} ms). Başka uygulamaları kapatın.`, tone: "warn" };
  if (drawFps && drawFps < fps * 0.85) return { key: "draw", label: "Çizim yetişmiyor", detail: `program ${drawFps} / ${fps} fps. Katman / efekt sayısını azaltın.`, tone: "warn" };
  return { key: "ok", label: "Sorun yok", detail: "", tone: "ok" };
}

/**
 * Bağlantı testi sonucu → öneri (OBS otomatik yapılandırması gibi): tek bağlantının ölçülen
 * yükleme hızının ≈ %75'i kullanılır (dalgalanma + ses + RTMP payı); ona sığan en yüksek
 * hızlı ayar, sığmıyorsa doğrudan bit hızı. → { key, label, bitrateKbps, usableKbps, text } | null
 */
export function speedTestAdvice(result, audioKbps = AUDIO_BITRATE_KBPS) {
  const up = Number(result?.uploadKbps) || 0;
  if (!result?.ok || up <= 0) return null;
  const usable = Math.round(up * 0.75);
  const fits = [...STREAM_QUALITY_PRESETS].reverse().find((p) => p.bitrateKbps + audioKbps <= usable);
  const lower = Math.max(BITRATE_MIN_KBPS, Math.floor((usable - audioKbps) / 100) * 100);
  const pick = fits || STREAM_QUALITY_PRESETS[0];
  const rtt = Number.isFinite(result.rttMs) ? ` · YouTube'a gecikme ${result.rttMs} ms` : "";
  return {
    key: pick.key,
    label: fits ? `${pick.label} (${pick.detail})` : `${pick.label}, bit hızı ≈ ${lower} kbps`,
    bitrateKbps: fits ? pick.bitrateKbps : Math.min(pick.bitrateKbps, lower),
    usableKbps: usable,
    text: `Yükleme ≈ ${mbpsText(up)} (tek bağlantı)${rtt}. Önerilen: ${fits ? `${pick.label} · ${pick.detail}` : `${pick.label} · ${lower} kbps`}.`,
  };
}

/** Kısa ağ özeti (üst çubuk ipucu): "Gönderim 4,6 Mbps · 2 kez yeniden bağlandı". */
export function networkSummary(status = {}) {
  const n = status?.network;
  if (!n) return null;
  const parts = [];
  if (Number.isFinite(n.sentKbps)) parts.push(`Gönderim ${(n.sentKbps / 1000).toFixed(1).replace(".", ",")} Mbps`);
  if (n.reconnects) parts.push(`${n.reconnects} kez yeniden bağlandı`);
  if (n.target === "backup") parts.push("yedek sunucu");
  if (n.state !== "up" && n.attempt) parts.push(`${n.attempt}. deneme`);
  if (n.state !== "up" && n.lastError?.message) parts.push(n.lastError.message);
  return parts.length ? parts.join(" · ") : null;
}
