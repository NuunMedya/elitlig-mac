// Yayın Stüdyosu — MÜZİK ÇALAR (saf işlevler: müzik listesi, geçiş eğrileri, çalma planı).
//
// Ayarlar localStorage "studio.music.v1" (maçtan bağımsız, kalıcı):
//   {
//     tracks: [{ id, kind: "youtube" | "file", url, videoId?, mediaId?, fileUrl?, title, start, end, volume 0…100, air: "inherit" | "on" | "off" }],
//     volume 0…100, crossfadeMs 0…10000, curve, fadeOutMs, shuffle, repeat: "all" | "one" | "off",
//     autoNext, toAir (genel "Yayına da ver"), airMode: "frame" | "loopback", duckOnGoal, duckLevel 0…100
//   }
// Parça başlangıç saniyesinden çalar; bitiş (end) yoksa sonuna kadar. Otomatik sıradakine
// geçişte bitişten crossfadeMs önce iki parça eğriye göre karışır.
// YouTube bağlantı / zaman ayrıştırması gol müziğiyle ortaktır (../goalmusic/goalMusic).
import { formatTime, parseTime, parseYoutubeUrl } from "../goalmusic/goalMusic";
import { findPlayable, itemTrack, normalizePlaylistEntry, playlistStep, splitItemId } from "./playlistModel";

export { formatTime, parseTime, parseYoutubeUrl };
export const MUSIC_KEY = "studio.music.v1";
export const MAX_MUSIC_TRACKS = 60;
export const MAX_XFADE_MS = 10_000;
export const XFADE_PRESETS = [0, 1000, 2000, 3000, 5000, 8000, 10000];

/** Geçiş eğrileri: t (0…1) → { out: çıkan parçanın kazancı, in: giren parçanınki }. */
export const CURVES = [
  { key: "equal", label: "Eşit güç", hint: "Ortada ses düşmez (önerilen)" },
  { key: "linear", label: "Doğrusal", hint: "Düz çizgi; ortada hafif çukur" },
  { key: "scurve", label: "S eğrisi", hint: "Yumuşak başlar, yumuşak biter" },
  { key: "exp", label: "Hızlı çıkış", hint: "Çıkan parça hızlı kısılır" },
];
export const REPEAT_MODES = [
  { key: "all", label: "Liste döngüsü" },
  { key: "one", label: "Parça döngüsü" },
  { key: "off", label: "Döngü yok" },
];
export const AIR_CHOICES = [
  { key: "inherit", label: "Genel ayar" },
  { key: "on", label: "Yayına ver" },
  { key: "off", label: "Yalnız hoparlör" },
];

const clamp01 = (t) => Math.min(1, Math.max(0, Number(t) || 0));
export function crossfadeGains(t, curve = "equal") {
  const x = clamp01(t);
  switch (curve) {
    case "linear": return { out: 1 - x, in: x };
    case "scurve": { const s = x * x * (3 - 2 * x); return { out: 1 - s, in: s }; }
    case "exp": return { out: (1 - x) ** 3, in: 1 - (1 - x) ** 3 };
    default: return { out: Math.cos((x * Math.PI) / 2), in: Math.sin((x * Math.PI) / 2) };
  }
}
/** Tek yönlü kısma (durdur): t → 0…1 kazanç (çıkış eğrisi). */
export const fadeOutGain = (t, curve = "equal") => crossfadeGains(t, curve).out;

/** Oynatıcıya verilecek ses (0…100 tam sayı): genel × parça × kazanç × kısma. */
export function deckVolume(masterVol, trackVol = 100, gain = 1, duck = 1) {
  const v = (Number(masterVol) || 0) * ((trackVol == null ? 100 : Number(trackVol)) / 100) * clamp01(gain) * clamp01(duck);
  return Math.round(Math.min(100, Math.max(0, v)));
}

let seq = 0;
export const newTrackId = () => `mu_${Date.now().toString(36)}${(seq += 1).toString(36)}`;
const pct = (v, d) => { const n = Number(v); return Number.isFinite(n) ? Math.round(Math.min(100, Math.max(0, n))) : d; };

/** Parça: YouTube bağlantısı ya da yerel ses dosyası (kalıcı izin listesi: mediaId + fileUrl). */
export function normalizeMusicTrack(t) {
  const x = t && typeof t === "object" ? t : { url: t };
  const air = AIR_CHOICES.some((a) => a.key === x.air) ? x.air : "inherit";
  const base = { id: String(x.id || newTrackId()).replace(/~/g, "_"), title: String(x.title || "").slice(0, 100), volume: pct(x.volume, 100), air, ...(x.fav ? { fav: true } : {}) };
  if (x.kind === "playlist") return normalizePlaylistEntry(x, base);
  let start = parseTime(x.start);
  let end = parseTime(x.end);
  if (x.kind === "file" || (!x.url && x.fileUrl)) {
    if (!x.fileUrl || !/^(elitlig-studio|elitlig-media|blob|file|https?):/i.test(String(x.fileUrl))) return null;
    start = start ?? 0;
    if (end != null && end <= start) end = null;
    return { ...base, kind: "file", url: "", fileUrl: String(x.fileUrl).slice(0, 500), mediaId: x.mediaId ? String(x.mediaId).slice(0, 80) : null, name: String(x.name || "").slice(0, 120), start, end, title: base.title || String(x.name || "").replace(/\.[a-z0-9]{2,4}$/i, "").slice(0, 100) };
  }
  const parsed = parseYoutubeUrl(x.url || x.videoId);
  if (!parsed) return null;
  start = start ?? parsed.start ?? 0;
  if (end != null && end <= start) end = null;
  return { ...base, kind: "youtube", url: String(x.url || parsed.videoId).slice(0, 300), videoId: parsed.videoId, start, end };
}

export const DEFAULT_MUSIC = Object.freeze({
  tracks: [], volume: 70, crossfadeMs: 3000, curve: "equal", fadeOutMs: 2000, shuffle: false, repeat: "all",
  autoNext: true, toAir: false, airMode: "frame", duckOnGoal: true, duckLevel: 0,
});

export function normalizeMusic(v) {
  const x = v && typeof v === "object" ? v : {};
  const ids = new Set();
  const tracks = (Array.isArray(x.tracks) ? x.tracks : []).map(normalizeMusicTrack).filter((t) => t && !ids.has(t.id) && ids.add(t.id)).slice(0, MAX_MUSIC_TRACKS);
  const ms = (k, max, d) => { const n = Number(x[k]); return Number.isFinite(n) ? Math.round(Math.min(max, Math.max(0, n))) : d; };
  return {
    tracks,
    volume: pct(x.volume, DEFAULT_MUSIC.volume),
    crossfadeMs: ms("crossfadeMs", MAX_XFADE_MS, DEFAULT_MUSIC.crossfadeMs),
    curve: CURVES.some((c) => c.key === x.curve) ? x.curve : DEFAULT_MUSIC.curve,
    fadeOutMs: ms("fadeOutMs", MAX_XFADE_MS, DEFAULT_MUSIC.fadeOutMs),
    shuffle: Boolean(x.shuffle),
    repeat: REPEAT_MODES.some((r) => r.key === x.repeat) ? x.repeat : DEFAULT_MUSIC.repeat,
    autoNext: x.autoNext == null ? true : Boolean(x.autoNext),
    toAir: Boolean(x.toAir),
    airMode: x.airMode === "loopback" ? "loopback" : "frame",
    duckOnGoal: x.duckOnGoal == null ? true : Boolean(x.duckOnGoal),
    duckLevel: pct(x.duckLevel, DEFAULT_MUSIC.duckLevel),
  };
}

/* ───────── liste işlemleri (saf, yeni config döner) ───────── */
export function addMusicTrack(config, input) {
  const c = normalizeMusic(config);
  const t = normalizeMusicTrack(typeof input === "string" ? { url: input } : input);
  if (!t || c.tracks.length >= MAX_MUSIC_TRACKS) return { config: c, ok: false, track: null };
  return { config: { ...c, tracks: [...c.tracks, t] }, ok: true, track: t };
}
export const updateMusicTrack = (config, id, patch) => {
  const c = normalizeMusic(config);
  return normalizeMusic({ ...c, tracks: c.tracks.map((t) => (t.id === id ? { ...t, ...(typeof patch === "function" ? patch(t) : patch) } : t)) });
};
export const removeMusicTrack = (config, id) => { const c = normalizeMusic(config); return { ...c, tracks: c.tracks.filter((t) => t.id !== id) }; };
/** Parçayı to sırasına taşı (to: hedef dizin ya da ±1). */
export function moveMusicTrack(config, id, to, relative = false) {
  const c = normalizeMusic(config);
  const i = c.tracks.findIndex((t) => t.id === id);
  if (i < 0) return c;
  const j = Math.min(c.tracks.length - 1, Math.max(0, relative ? i + Number(to) : Number(to)));
  if (i === j) return c;
  const tracks = [...c.tracks];
  const [t] = tracks.splice(i, 1);
  tracks.splice(j, 0, t);
  return { ...c, tracks };
}

/**
 * Sıradaki parçanın dizini. dir: +1 sonraki, -1 önceki. auto: parça kendiliğinden bittiyse
 * (parça döngüsü aynı parçayı, "Döngü yok" listenin sonunda -1 döndürür).
 * rand: () => 0…1 (karışık çalma, sınanabilir; aynı parçayı seçmemeye çalışır).
 */
export function nextIndex(config, cur, dir = 1, { auto = false, rand = Math.random } = {}) {
  const n = config?.tracks?.length || 0;
  if (!n) return -1;
  if (cur == null || cur < 0 || cur >= n) return dir < 0 ? n - 1 : 0;
  if (auto && config.repeat === "one") return cur;
  if (config.shuffle && n > 1) {
    const r = Math.floor(clamp01(rand()) * (n - 1)) % (n - 1);
    return r >= cur ? r + 1 : r;
  }
  const j = cur + (dir < 0 ? -1 : 1);
  if (j >= 0 && j < n) return j;
  if (auto && config.repeat === "off") return -1;
  return (j + n) % n;
}

/**
 * Çalma planı (oynatıcı saati = videonun kendi saniyesi).
 *   startSec  başlangıç · endSec bitiş (parçanın end'i ya da süresi; bilinmiyorsa null)
 *   lengthSec çalınacak uzunluk · xfadeAtSec otomatik geçişin başlayacağı oynatıcı saniyesi
 */
export function trackPlan(track, durationSec = null, crossfadeMs = 0) {
  const startSec = Math.max(0, Number(track?.start) || 0);
  const dur = Number(durationSec) > 0 ? Number(durationSec) : null;
  let endSec = track?.end != null && Number(track.end) > startSec ? Number(track.end) : dur;
  if (dur != null && endSec != null) endSec = Math.min(endSec, dur);
  const lengthSec = endSec != null ? Math.max(0, endSec - startSec) : null;
  const xf = Math.min(Math.max(0, Number(crossfadeMs) || 0) / 1000, lengthSec != null ? lengthSec / 2 : Infinity);
  return { startSec, endSec, lengthSec, xfadeSec: lengthSec != null ? xf : Math.max(0, Number(crossfadeMs) || 0) / 1000, xfadeAtSec: endSec != null ? Math.max(startSec, endSec - xf) : null };
}

/** Çalma anındaki ilerleme (timeSec: oynatıcı saati). */
export function trackProgress(plan, timeSec) {
  const t = Math.max(0, Number(timeSec) || 0);
  const elapsedSec = Math.max(0, t - (plan?.startSec || 0));
  if (!plan || plan.lengthSec == null) return { elapsedSec, lengthSec: null, ratio: null, remainingSec: null, xfadeDue: false, ended: false };
  const remainingSec = Math.max(0, plan.endSec - t);
  return {
    elapsedSec: Math.min(elapsedSec, plan.lengthSec),
    lengthSec: plan.lengthSec,
    ratio: plan.lengthSec > 0 ? Math.min(1, elapsedSec / plan.lengthSec) : 1,
    remainingSec,
    xfadeDue: plan.xfadeAtSec != null && t >= plan.xfadeAtSec,
    ended: t >= plan.endSec - 0.05,
  };
}

/** Geçişin o anki durumu (startedAt / now: ms). */
export function fadeState(startedAt, now, ms, curve = "equal") {
  const t = ms > 0 ? clamp01((now - startedAt) / ms) : 1;
  const g = crossfadeGains(t, curve);
  return { t, out: g.out, in: g.in, done: t >= 1 };
}

/** Parça yayına gitsin mi (parça ayarı > genel ayar). */
export const trackToAir = (config, track) => (track?.air === "on" ? true : track?.air === "off" ? false : Boolean(config?.toAir));

/**
 * Bu parça yayına verilebilir mi? capability: ana süreçten { frameAudio, loopback, platform } (yoksa null).
 * → { ok, how: "file" | "frame" | "loopback" | null, reason }
 */
export function airSupport(track, capability, airMode = "frame") {
  if (track?.kind === "file") return { ok: true, how: "file", reason: null };
  if (!capability) return { ok: false, how: null, reason: "Bu ortamda YouTube sesi yayına alınamıyor (masaüstü uygulaması gerekir). Yerel ses dosyası ekle: dosyalar yayına gider." };
  if (airMode === "loopback") {
    if (capability.loopback) return { ok: true, how: "loopback", reason: null };
    if (capability.frameAudio) return { ok: true, how: "frame", reason: null };
  }
  if (capability.frameAudio) return { ok: true, how: "frame", reason: null };
  return { ok: false, how: null, reason: "Bu sistemde müzik penceresinin sesi yakalanamıyor. Yerel ses dosyası (mp3 / m4a / wav) ekle." };
}

export const trackName = (t) => (t ? t.title || (t.kind === "file" ? t.name : t.kind === "playlist" ? "YouTube listesi" : `youtu.be/${t.videoId}`) || "Parça" : "");
/** Liste girişini çalmaya başlarken ilk parça (liste: sırasına / karışığa göre; boş liste → null). */
export function entryStart(entry, dir = 1, rand = Math.random) {
  if (!entry) return null;
  if (entry.kind !== "playlist") return entry;
  const st = playlistStep(entry, -1, dir, { rand });
  return st.index >= 0 ? itemTrack(entry, entry.items[st.index]) : null;
}

/**
 * Sıradaki parça (liste parçaları dahil). cur: çalan parça (sanal olabilir) ya da null.
 * history: son çalınan sanal kimlikler (karışık listede tekrar etmesin).
 * → parça | null (liste sonu, "Döngü yok")
 */
export function nextTrack(config, cur, dir = 1, { auto = false, rand = Math.random, history = [] } = {}) {
  const list = config?.tracks || [];
  if (!list.length) return null;
  const startFrom = (i, d) => {
    // boş listeleri atla (en çok bir tur)
    for (let k = 0, j = i; k < list.length; k += 1) {
      const t = entryStart(list[j], d, rand);
      if (t) return t;
      j = nextIndex({ ...config, shuffle: false, repeat: "all" }, j, d);
    }
    return null;
  };
  if (!cur) return startFrom(dir < 0 ? list.length - 1 : 0, dir);
  if (cur.playlistId) {
    const pi = list.findIndex((t) => t.id === cur.playlistId);
    const pl = list[pi];
    if (pl) {
      const sp = splitItemId(cur.id);
      const ci = pl.items.findIndex((x) => x.v === sp?.v);
      const hist = history.filter((h) => h.startsWith(`${pl.id}~`)).map((h) => splitItemId(h).v);
      const st = playlistStep(pl, ci, dir, { auto, rand, history: hist });
      if (st.index >= 0) return itemTrack(pl, pl.items[st.index]);
      const ni = nextIndex({ ...config, repeat: config.repeat === "one" ? "all" : config.repeat }, pi, dir, { auto, rand });
      if (ni < 0) return null;
      if (ni === pi && list.length === 1 && auto && pl.repeat === "off") return null;
      return startFrom(ni, dir);
    }
  }
  const i = list.findIndex((t) => t.id === cur.id);
  const ni = nextIndex(config, i, dir, { auto, rand });
  if (ni < 0) return null;
  if (ni === i) return list[i];
  return startFrom(ni, dir);
}

/** Kimlikten çalınacak parça: üst düzey parça, liste parçası ya da liste girişi (→ ilk parçası). */
export function resolvePlayable(config, id, rand = Math.random) {
  const p = findPlayable(config, id);
  if (p) return p;
  const e = (config?.tracks || []).find((t) => t.id === id);
  return e ? entryStart(e, 1, rand) : null;
}

export const trackRange = (t) => (t ? `${formatTime(t.start || 0)}${t.end != null ? ` – ${formatTime(t.end)}` : " →"}` : "");

// key: uygulama geneli müzik çalar kendi listesini ayrı anahtarda tutar ("app.music.v1").
export function readMusic(storage, key = MUSIC_KEY) {
  try { return normalizeMusic(JSON.parse(storage?.getItem(key) || "null")); } catch { return normalizeMusic(null); }
}
export function writeMusic(storage, config, key = MUSIC_KEY) {
  try { storage?.setItem(key, JSON.stringify(normalizeMusic(config))); return true; } catch { return false; }
}
