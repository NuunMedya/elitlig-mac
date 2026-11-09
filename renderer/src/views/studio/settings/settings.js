// Yayın Stüdyosu — AYARLAR modeli (saf; localStorage "studio.settings.v1").
//
//   stream    kodlayıcı tercihi, anahtar kare aralığı, ses bit hızı (çözünürlük /
//             fps / görüntü bit hızı Yayın sekmesiyle ortak: prefs.encoding)
//   record    yerel kayıt: açık mı, klasör, KAYIT KALİTESİ (yayından ayrı)
//   replay    gol öncesi kaç saniye tekrar yazılsın (varsayılan 15; v1 kayıtlarındaki eski
//             varsayılan 10 → 15), butondan SONRA kaç saniye (postSeconds, 4), gol klibinin
//             yükleme gecikmesi (uploadDelaySec, 60 — bu sürede seçilen açılar yüklenir); eski
//             varsayılan 10, kullanıcı değiştirmemiş sayılıp 15'e taşınır — migrateReplaySeconds)
//   view      ipuçları ve kısayol rozetleri, arayüz ölçeği
//   hotkeys   ana eylemlerin tuşları (yeniden atanabilir)
//   notify    mikrofon açık uyarısı (VAR), düşük bit hızı, sessiz yayın
//
// Geçiş türü / süresi, çalışma alanı, yayın kodlaması, tekrar açıları / hızı
// stüdyo tercihlerinde (studio.prefs.v1), LED ekranı ve yönlendirmesi LED
// tercihlerinde (studio.led.v2) kalır; Ayarlar sayfası onları da aynı yerden
// düzenler (tek doğruluk kaynağı).
export const SETTINGS_KEY = "studio.settings.v1";
import { PIPELINES, normalizePipeline } from "../../../lib/studio/encodepath";
import { COMPOSITOR_ENGINES, normalizeCompositorEngine } from "../../../lib/studio/renderBudget";
import { DEFAULT_OPS, normalizeOps } from "./opsDefaults";
export { PIPELINES, COMPOSITOR_ENGINES };

export const ENCODER_PREFS = [
  { key: "auto", label: "Otomatik (önerilen)", hint: "Donanım kodlayıcı varsa o, yoksa x264" },
  { key: "hardware", label: "Donanım (VideoToolbox / NVENC)", hint: "İşlemciyi yormaz" },
  { key: "software", label: "Yazılım (x264)", hint: "En uyumlu, işlemci kullanır" },
];
export const KEYFRAME_CHOICES = [1, 2, 4];
/** Yayın gecikmesi (sn): yalnız YouTube / RTMP'ye giden görüntü gecikir (OBS "Stream Delay"). */
export const STREAM_DELAY_CHOICES = [0, 5, 10, 15, 30, 60, 120];
/**
 * RTMP göndericisi (2.21.0): "auto" — Node yayıncısı (4096 B parça, sunucu onayı ölçülür;
 * bağlanamazsa ya da sunucu veri almıyorsa kendiliğinden ffmpeg'e döner) · "ffmpeg" — eski yol.
 */
export const RTMP_PUBLISHERS = [
  { key: "auto", label: "Otomatik (yeni, hızlı)", hint: "Büyük parçalarla gönderir: aynı bit hızında ~20 kat az paket. Sorun olursa kendiliğinden eskiye döner." },
  { key: "ffmpeg", label: "ffmpeg (eski)", hint: "2.20 ve öncesindeki gönderici. Yeni gönderici sorun çıkarırsa seçin." },
];
export const AUDIO_KBPS_CHOICES = [128, 160, 192, 256]; // 96 kbps AAC stereo cızırtılı; kodlayıcı en az 128 yazar

/** Kayıt kalitesi (yayından ayrı). videoKbps null = yayınla aynı. */
export const RECORD_QUALITIES = [
  { key: "stream", label: "Yayınla aynı", hint: "Ayrı kodlama yok, işlemciyi yormaz", videoKbps: null, height: null },
  { key: "high", label: "Yüksek · 1080p", hint: "Arşiv ve kurgu için", videoKbps: 12000, height: 1080 },
  { key: "medium", label: "Orta · 1080p", hint: "Kalite / boyut dengesi", videoKbps: 8000, height: 1080 },
  { key: "low", label: "Düşük · 720p", hint: "Az disk alanı", videoKbps: 4000, height: 720 },
  { key: "custom", label: "Özel", hint: "Bit hızını kendin seç", videoKbps: null, height: null },
];
export const recordQualityOf = (key) => RECORD_QUALITIES.find((q) => q.key === key) || RECORD_QUALITIES[0];

/** Yeniden atanabilir eylemler (1–9 sahne tuşları sabit). */
export const HOTKEY_ACTIONS = [
  { key: "transition", label: "Önizlemeyi yayına geçir (Geçiş)", default: [" ", "Enter"] },
  { key: "lastScene", label: "Son sahneye dön", default: ["l"] },
  { key: "mic", label: "Mikrofonu aç / kapat", default: ["m"] },
  { key: "replay", label: "Son tekrarı önizlemeye al (Ayarlar › Tekrar: R = doğrudan yayına)", default: ["r"] },
  { key: "moment", label: "Önemli an: son saniyeleri tekrar olarak kaydet", default: ["b"] },
  { key: "goalArm", label: "Gol (sonra H: ev sahibi, A: deplasman)", default: ["g"] },
  { key: "var", label: "VAR önizlemeye / yayındaysa canlıya dön", default: ["v"] },
  { key: "chapter", label: "Bölüm işareti (YouTube bölümleri)", default: ["c"] },
  { key: "help", label: "Kısayol yardımı", default: ["?"] },
  // Kısayol şeridindeki parçacıklarla aynı eylemler (varsayılan tuşu yok; Ayarlar › Kısayollar'dan atanır).
  { key: "event", label: "Olay gir (tür → oyuncu)", default: [] },
  { key: "goalHome", label: "Ev sahibine GOL (golcü seçilir)", default: [] },
  { key: "goalAway", label: "Deplasmana GOL (golcü seçilir)", default: [] },
  { key: "goalMusic", label: "Gol müziği çal / durdur", default: [] },
  { key: "goalMusicStop", label: "Gol müziğini KES (çalarken)", default: ["k"] },
  { key: "outMute", label: "Dışarı giden tüm sesleri kapat / aç (hoparlör, kulaklık; yayın değişmez)", default: [] },
  { key: "subtitle", label: "Altyazıyı aç / kapat", default: [] },
  { key: "interviewBand", label: "Röportaj bandını aç / kapat", default: [] },
  { key: "interview", label: "Röportaj kaydını başlat / bitir", default: [] },
  { key: "fullscreen", label: "Programı tam ekran göster / kapat", default: [] },
  { key: "closeBroadcast", label: "Yayını kapat (tamamen: YouTube yayını da bitirilir, onaylı)", default: [] },
];
export const DEFAULT_HOTKEYS = Object.fromEntries(HOTKEY_ACTIONS.map((a) => [a.key, a.default]));
/** Atanamayan tuşlar: sahne tuşları ve gol yanıtları. */
export const RESERVED_KEYS = new Set(["1", "2", "3", "4", "5", "6", "7", "8", "9", "h", "a", "e", "d", "Escape", "Tab"]);

/** Arayüz ölçeği seçenekleri (%); ⌘ + / − / 0 bunlar arasında gezer. */
export const UI_SCALES = [70, 75, 80, 85, 90, 100, 110, 125];
/** ⌘ + / ⌘ − : bir sonraki / önceki ölçek; ⌘ 0 : %100. */
export function stepScale(cur, dir) {
  if (!dir) return 100;
  const i = UI_SCALES.indexOf(Number(cur));
  const at = i < 0 ? UI_SCALES.indexOf(100) : i;
  return UI_SCALES[Math.min(UI_SCALES.length - 1, Math.max(0, at + (dir > 0 ? 1 : -1)))];
}
/** Panel arayüzü renk temaları (studio.css: <html data-st-theme / data-st-tone>); tone: "light" açık tema. sw: önizleme renkleri [zemin, yüzey, vurgu, ikinci vurgu]. */
export const UI_THEMES = [
  { key: "gece", label: "Gece mavisi", hint: "Koyu mor-lacivert, mor vurgu (varsayılan)", sw: ["#07040b", "#1d1229", "#8b5cf6", "#c026d3"] },
  { key: "grafit", label: "Grafit", hint: "Nötr gri, gök mavisi vurgu: göz yormaz", sw: ["#0b0c0e", "#1c1e22", "#38bdf8", "#94a3b8"] },
  { key: "okyanus", label: "Okyanus", hint: "Derin lacivert-yeşil, turkuaz vurgu", sw: ["#03101a", "#0f2433", "#14b8a6", "#0ea5e9"] },
  { key: "kirmizi", label: "Kırmızı reji", hint: "Siyah zemin, kırmızı vurgu (karanlık reji odası)", sw: ["#0a0505", "#1f1012", "#ef4444", "#f97316"] },
  { key: "acik", label: "Açık", tone: "light", hint: "Nötr gri-beyaz, mor vurgu: aydınlık oda, gündüz", sw: ["#e6e8ee", "#ffffff", "#6d28d9", "#a21caf"] },
  { key: "kagit", label: "Kağıt", tone: "light", hint: "Sıcak krem zemin, kiremit vurgu: göz yormayan açık", sw: ["#e9e2d4", "#fffdf8", "#b9410e", "#a16207"] },
  { key: "buz", label: "Buz", tone: "light", hint: "Soğuk mavi-beyaz, deniz mavisi vurgu", sw: ["#dfe8f2", "#fbfdff", "#0369a1", "#0e7490"] },
];
/** Temanın tonu: "light" | "dark" (<html data-st-tone>; açık temada görüntü adaları koyu kalır). */
export const themeTone = (key) => (UI_THEMES.find((t) => t.key === key)?.tone === "light" ? "light" : "dark");
export const DEFAULT_SETTINGS = {
  v: 3,
  // pipeline: kodlama yolu — "auto" | "webcodecs" (tek kodlama) | "legacy" (MediaRecorder + ffmpeg)
  // audioKbps 192: AAC 128 kbps'de 16 kHz üstü belirgin kesilir (ölçüm: kaynak −41,9 dB → 128k −49,7 / 192k −46,0 dB).
  // compositor: çizim motoru — "auto" | "worker" (ayrı iş parçacığı) | "main" (ana iş parçacığı; eski yol)
  stream: { encoder: "auto", keyframeSec: 2, audioKbps: 192, pipeline: "auto", delaySec: 0, publisher: "auto", compositor: "auto" },
  record: { enabled: false, dir: null, quality: "stream", customKbps: 10000, customHeight: 1080 },
  // tekrar klibi 15 sn: önizlemede giriş–çıkışla istenen bölüm seçilir. directTake: R kısayolu
  // son tekrarı önizlemeye yükleyip AYNI GEÇİŞ yoluyla hemen yayına alır [önizleme-geçiş]
  replay: { seconds: 15, directTake: false, postSeconds: 4, uploadDelaySec: 60 },
  view: { hints: true, tooltips: true, scale: 100, theme: "gece" },
  hotkeys: DEFAULT_HOTKEYS,
  notify: { micOpen: true, lowBitrate: true, silence: true, silenceSec: 30 },
  // İşletim varsayılanları (LED, röportaj, özet, reji / maç, makrolar): ./opsDefaults
  ops: normalizeOps(DEFAULT_OPS),
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
const bool = (v, d) => (typeof v === "boolean" ? v : d);
const pick = (v, list, d) => (list.includes(v) ? v : d);

/** Tuş adını saklanan biçime çevirir (harfler küçük). */
export const normKey = (key) => (typeof key === "string" && key.length === 1 ? key.toLocaleLowerCase("en-US") : String(key || ""));
/** Ekranda tuş adı. */
export const keyText = (key) => (key === " " ? "Boşluk" : key === "Enter" ? "Enter" : key === "Backspace" ? "⌫" : key.length === 1 ? key.toLocaleUpperCase("tr-TR") : key);

function normHotkeys(raw) {
  const out = {};
  const used = new Set();
  for (const a of HOTKEY_ACTIONS) {
    const list = Array.isArray(raw?.[a.key]) ? raw[a.key] : a.default;
    out[a.key] = list.map(normKey).filter((k) => k && !RESERVED_KEYS.has(k) && !used.has(k)).slice(0, 2);
    out[a.key].forEach((k) => used.add(k));
  }
  return out;
}

/** Eski varsayılan tekrar süresi (v1). */
export const LEGACY_REPLAY_SECONDS = 10;
/**
 * Tekrar süresi göçü: v1 kaydında süre eski varsayılanda (10 sn) ise kullanıcı
 * değiştirmemiş sayılır → yeni varsayılan (15 sn). Başka bir değer seçildiyse
 * ya da kayıt v2 ise (kullanıcı 10'u bilerek seçtiyse) dokunulmaz.
 */
export function migrateReplaySeconds(r) {
  const sec = r?.replay?.seconds;
  if (sec == null) return undefined;
  const v = Number(r?.v) || 1;
  return v < 2 && Number(sec) === LEGACY_REPLAY_SECONDS ? DEFAULT_SETTINGS.replay.seconds : sec;
}

/**
 * Eski varsayılan ses bit hızı (128 kbps) yeni varsayılana (192) taşınır: kayıt
 * sürümü 3'ten küçükse ve değer eski varsayılansa kullanıcı değiştirmemiş sayılır.
 * 160 / 192 / 256 seçildiyse ya da kayıt v3 ise dokunulmaz.
 */
export function migrateAudioKbps(r) {
  const k = r?.stream?.audioKbps;
  if (k == null) return undefined;
  const v = Number(r?.v) || 1;
  return v < 3 && Number(k) === 128 ? DEFAULT_SETTINGS.stream.audioKbps : k;
}

export function normalizeSettings(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const d = DEFAULT_SETTINGS;
  return {
    v: 3,
    stream: {
      encoder: pick(r.stream?.encoder, ENCODER_PREFS.map((e) => e.key), d.stream.encoder),
      keyframeSec: pick(Number(r.stream?.keyframeSec), KEYFRAME_CHOICES, d.stream.keyframeSec),
      audioKbps: pick(Number(migrateAudioKbps(r)), AUDIO_KBPS_CHOICES, d.stream.audioKbps),
      pipeline: normalizePipeline(r.stream?.pipeline),
      delaySec: pick(Number(r.stream?.delaySec), STREAM_DELAY_CHOICES, d.stream.delaySec),
      publisher: pick(r.stream?.publisher, RTMP_PUBLISHERS.map((p) => p.key), d.stream.publisher),
      compositor: normalizeCompositorEngine(r.stream?.compositor),
    },
    record: {
      enabled: bool(r.record?.enabled, d.record.enabled),
      dir: typeof r.record?.dir === "string" && r.record.dir ? r.record.dir : null,
      quality: pick(r.record?.quality, RECORD_QUALITIES.map((q) => q.key), d.record.quality),
      customKbps: clamp(Math.round(num(r.record?.customKbps, d.record.customKbps)), 1000, 50000),
      customHeight: pick(Number(r.record?.customHeight), [720, 1080], d.record.customHeight),
    },
    replay: {
      seconds: clamp(Math.round(num(migrateReplaySeconds(r), d.replay.seconds)), 5, 30),
      directTake: bool(r.replay?.directTake, d.replay.directTake),
      // [gol-klip] butondan SONRA kaydedilen süre (0–15 sn) ve gol klibi yükleme gecikmesi (0–600 sn)
      postSeconds: clamp(Math.round(num(r.replay?.postSeconds, d.replay.postSeconds)), 0, 15),
      uploadDelaySec: clamp(Math.round(num(r.replay?.uploadDelaySec, d.replay.uploadDelaySec)), 0, 600),
    },
    view: {
      hints: bool(r.view?.hints, d.view.hints),
      tooltips: bool(r.view?.tooltips, d.view.tooltips),
      scale: pick(Number(r.view?.scale), UI_SCALES, d.view.scale),
      theme: pick(String(r.view?.theme || ""), UI_THEMES.map((t) => t.key), d.view.theme),
    },
    hotkeys: normHotkeys(r.hotkeys),
    notify: {
      micOpen: bool(r.notify?.micOpen, d.notify.micOpen),
      lowBitrate: bool(r.notify?.lowBitrate, d.notify.lowBitrate),
      silence: bool(r.notify?.silence, d.notify.silence),
      silenceSec: clamp(Math.round(num(r.notify?.silenceSec, d.notify.silenceSec)), 10, 300),
    },
    ops: normalizeOps(r.ops),
  };
}

/** Kayıt yoksa eski tercihlerden (prefs.localRec: yerel kayıt açık mı, klasör) başlar. */
export function loadSettings(storage, legacyPrefs = null) {
  try {
    const raw = storage?.getItem(SETTINGS_KEY);
    if (raw) return normalizeSettings(JSON.parse(raw));
  } catch { /* yoksay */ }
  if (legacyPrefs) {
    return normalizeSettings({ record: { enabled: legacyPrefs.localRec?.enabled, dir: legacyPrefs.localRec?.dir } });
  }
  return normalizeSettings(null);
}

export function saveSettings(storage, settings) {
  try { storage?.setItem(SETTINGS_KEY, JSON.stringify(settings)); return true; } catch { return false; }
}

/** İç içe alan güncelle: patchSettings(s, "record", { quality: "high" }). */
export const patchSettings = (s, section, patch) => normalizeSettings({ ...s, [section]: { ...s[section], ...patch } });

/* ------------------------------ kayıt boyutu ------------------------------ */

/** Kaydın görüntü bit hızı (kbps): kalite seçimine göre; "stream" = yayın bit hızı. */
export function recordVideoKbps(record, streamVideoKbps) {
  const q = recordQualityOf(record?.quality);
  if (q.key === "custom") return Math.round(Number(record.customKbps) || streamVideoKbps || 0);
  return q.videoKbps ?? Math.round(Number(streamVideoKbps) || 0);
}

/** (görüntü kbps + ses kbps) × saniye / 8 → bayt (kbps = 1000 bit/sn). */
export const recordBytes = (videoKbps, audioKbps, seconds = 600) => Math.round(((Math.max(0, Number(videoKbps) || 0) + Math.max(0, Number(audioKbps) || 0)) * 1000 * seconds) / 8);

/** "≈ 450 MB / 10 dk" (1 MB = 10^6 bayt, 1 GB = 10^9). */
export function formatSizeEstimate(bytes, minutes = 10) {
  const mb = bytes / 1e6;
  const size = mb >= 1000 ? `${(mb / 1000).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} GB` : `${Math.round(mb / 10) * 10 || Math.round(mb)} MB`;
  return `≈ ${size} / ${minutes} dk`;
}

/** Ayarlardan tahmin: { videoKbps, audioKbps, bytes10, text, perHourText }. */
export function recordEstimate(record, { streamVideoKbps, audioKbps }) {
  const v = recordVideoKbps(record, streamVideoKbps);
  const bytes10 = recordBytes(v, audioKbps, 600);
  return { videoKbps: v, audioKbps, bytes10, text: formatSizeEstimate(bytes10, 10), perHourText: formatSizeEstimate(bytes10 * 6, 60) };
}

/**
 * studio.start'a giden localRecord: { enabled, dir?, videoBitrateKbps?, height? }.
 * Yayınla aynı kalitede ayrı alan gönderilmez (ana süreç yayın kalitesinde kaydeder).
 */
export function localRecordOptions(record, { streamVideoKbps } = {}) {
  if (!record?.enabled) return null;
  const out = { enabled: true, ...(record.dir ? { dir: record.dir } : {}) };
  const q = recordQualityOf(record.quality);
  if (q.key === "stream") return out;
  out.videoBitrateKbps = recordVideoKbps(record, streamVideoKbps);
  out.height = q.key === "custom" ? Number(record.customHeight) || 1080 : q.height;
  return out;
}

/* ------------------------------ kısayollar ------------------------------ */

/** Tuşu bir eyleme atar; başka eylemdeki aynı tuş oradan kaldırılır. */
export function bindHotkey(hotkeys, action, key, { replace = true } = {}) {
  const k = normKey(key);
  if (!k || RESERVED_KEYS.has(k)) return hotkeys;
  const next = {};
  for (const [a, list] of Object.entries(hotkeys)) next[a] = list.filter((x) => x !== k);
  next[action] = replace ? [k] : [...(next[action] || []), k].slice(0, 2);
  return next;
}

/** Tuş → eylem anahtarı (yoksa null). */
export function actionForKey(hotkeys, key) {
  const k = normKey(key);
  for (const [a, list] of Object.entries(hotkeys || DEFAULT_HOTKEYS)) if (list.includes(k)) return a;
  return null;
}

/* ------------------------------ uyarılar ------------------------------ */

/** Düşük bit hızı: kodlayıcı hedefin %60'ının altında (canlıyken). */
export const isLowBitrate = (status, targetKbps) => Number.isFinite(status?.bitrateKbps) && Number(targetKbps) > 0 && status.bitrateKbps < targetKbps * 0.6;

/**
 * Sessizlik izleyici (saf): her örnekte { level 0…1, now } verilir.
 * Dönüş { silentForMs, warn }. level < eşik → sessiz; ses gelince sıfırlanır.
 */
export function silenceStep(state, { level, now, active, thresholdLevel = 0.012, limitMs = 30_000 }) {
  if (!active) return { since: null, silentForMs: 0, warn: false };
  const silent = !(Number(level) >= thresholdLevel);
  const since = silent ? (state?.since ?? now) : null;
  const silentForMs = since == null ? 0 : now - since;
  return { since, silentForMs, warn: silentForMs >= limitMs };
}
