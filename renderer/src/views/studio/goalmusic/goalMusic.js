// Yayın Stüdyosu — GOL MÜZİĞİ (saf işlevler: bağlantı / zaman ayrıştırma, ayarlar).
//
// Ayarlar takım KİMLİĞİNE göre saklanır (localStorage, maçtan maça kalır):
//   {
//     volume: 0…100, autoOnGoal: bool, fadeMs,
//     teams: { [teamId]: { mode: "active" | "random" | "rotate", activeId, rotate, playSec,
//                          tracks: [{ id, url, videoId, start, end }] } }
//   }
// start / end saniye (end boşsa sonuna kadar çalar). Bir takımın birden çok
// bağlantısı olabilir: "Etkin" seçilen, "Rastgele" ya da "Sırayla" çalınır.
// ÇALMA SÜRESİ (takım başına playSec): N saniye (hazır 10/15/20/30/45/60 ya da özel)
// ya da null = "Süresiz" (durdurulana / parça bitene kadar). Süre dolmadan fadeMs
// önce ses kısılmaya başlar, süre dolunca müzik durur (musicPlan / musicProgress).

export const GOAL_MUSIC_KEY = "studio.goalMusic.v1";
export const PLAY_SEC_PRESETS = [10, 15, 20, 30, 45, 60];
export const MAX_PLAY_SEC = 600;

/** Çalma süresi: null (süresiz) ya da 1…600 tam saniye. "süresiz" / "" / 0 / geçersiz → null. */
export function normalizePlaySec(v) {
  if (v == null || v === "" || v === false) return null;
  if (typeof v === "string" && /^s[üu]resiz$/i.test(v.trim())) return null;
  const n = typeof v === "number" ? v : parseTime(v);
  if (n == null || !Number.isFinite(n) || n <= 0) return null;
  return Math.min(MAX_PLAY_SEC, Math.max(1, Math.round(n)));
}

/** Çalma süresinin metni: "Süresiz" · "20 sn" · "1:30". */
export const playSecLabel = (sec) => {
  const n = normalizePlaySec(sec);
  if (n == null) return "Süresiz";
  return n < 60 ? `${n} sn` : formatTime(n);
};

/**
 * Çalma planı: çalma süresi ile bağlantının bitişinden kısa olanı.
 *   lengthSec   çalınacak süre (null: süresiz, parça bitene ya da durdurulana kadar)
 *   fadeMs      sondaki ses kısma (sürenin yarısını geçmez)
 *   fadeAtSec   kısmanın başladığı an (çalma başından, saniye) ya da null
 *   endSeconds  YouTube'a verilecek bitiş (zamanlayıcıdan biraz sonra: kısma yarım kalmasın)
 */
export function musicPlan(track, playSec, fadeMs = DEFAULT_FADE_MS) {
  const start = Math.max(0, Number(track?.start) || 0);
  const trackLen = track?.end != null && Number(track.end) > start ? Number(track.end) - start : null;
  const want = normalizePlaySec(playSec);
  let lengthSec = want;
  if (trackLen != null) lengthSec = lengthSec == null ? trackLen : Math.min(lengthSec, trackLen);
  const fade = lengthSec == null ? 0 : Math.round(Math.min(Math.max(0, Number(fadeMs) || 0), (lengthSec * 1000) / 2));
  return {
    startSeconds: start,
    lengthSec,
    fadeMs: fade,
    fadeAtSec: lengthSec == null ? null : Math.max(0, lengthSec - fade / 1000),
    endSeconds: lengthSec == null ? null : Math.round((start + lengthSec + 1) * 10) / 10,
    limited: want != null && (trackLen == null || want < trackLen),
  };
}

/**
 * Çalma anındaki durum (elapsedMs: çalma başından geçen süre).
 * → { elapsedSec, remainingSec (null: süresiz), ratio 0…1 (null: süresiz), fade: kısma başlamalı mı, done }
 */
export function musicProgress(plan, elapsedMs) {
  const el = Math.max(0, Number(elapsedMs) || 0) / 1000;
  if (!plan || plan.lengthSec == null) return { elapsedSec: el, remainingSec: null, ratio: null, fade: false, done: false };
  const remainingSec = Math.max(0, plan.lengthSec - el);
  return {
    elapsedSec: el,
    remainingSec,
    ratio: plan.lengthSec > 0 ? Math.min(1, el / plan.lengthSec) : 1,
    fade: el >= plan.fadeAtSec,
    done: el >= plan.lengthSec,
  };
}
export const GOAL_MUSIC_MODES = [
  { key: "active", label: "Seçilen", hint: "Her golde işaretli bağlantı" },
  { key: "random", label: "Rastgele", hint: "Her golde rastgele bir bağlantı" },
  { key: "rotate", label: "Sırayla", hint: "Her golde sıradaki bağlantı" },
];
export const MAX_TRACKS = 12;
export const DEFAULT_FADE_MS = 1000;

const ID_RE = /^[A-Za-z0-9_-]{11}$/;

/**
 * Süre / zaman metni → saniye. "83", "1:23", "01:02:03", "1m23s", "2h1m", "90s",
 * "1.5" (ondalık saniye), "1,5". Boş / geçersizse null.
 */
export function parseTime(v) {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) && v >= 0 ? Math.round(v * 10) / 10 : null;
  const s = String(v).trim().toLowerCase().replace(",", ".");
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) return Math.round(Number(s) * 10) / 10;
  if (/^\d+(:\d{1,2}){1,2}(\.\d+)?$/.test(s)) {
    const parts = s.split(":").map(Number);
    if (parts.slice(1).some((p) => p >= 60)) return null;
    const sec = parts.reduce((acc, p) => acc * 60 + p, 0);
    return Math.round(sec * 10) / 10;
  }
  const m = s.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+(?:\.\d+)?)s?)?$/);
  if (m && (m[1] || m[2] || m[3])) return Math.round(((Number(m[1]) || 0) * 3600 + (Number(m[2]) || 0) * 60 + (Number(m[3]) || 0)) * 10) / 10;
  return null;
}

/** Saniye → "1:23" (saatliyse "1:02:03"; ondalık korunur). */
export function formatTime(sec) {
  const n = Number(sec);
  if (sec == null || sec === "" || !Number.isFinite(n) || n < 0) return "";
  const whole = Math.floor(n);
  const frac = Math.round((n - whole) * 10);
  const h = Math.floor(whole / 3600);
  const m = Math.floor(whole / 60) % 60;
  const s = whole % 60;
  const tail = `${String(s).padStart(2, "0")}${frac ? `.${frac}` : ""}`;
  return h ? `${h}:${String(m).padStart(2, "0")}:${tail}` : `${m}:${tail}`;
}

/**
 * YouTube bağlantısı → { videoId, start } | null. Desteklenen biçimler:
 * watch?v=ID, youtu.be/ID, shorts/ID, embed/ID, live/ID, v/ID, music.youtube.com,
 * m.youtube.com, youtube-nocookie.com, çıplak 11 karakterlik kimlik.
 * Başlangıç: t= / start= / #t= (83, 1m23s, 1:23).
 */
export function parseYoutubeUrl(input) {
  const raw = String(input || "").trim();
  if (!raw) return null;
  if (ID_RE.test(raw)) return { videoId: raw, start: null };
  let u;
  try { u = new URL(/^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw}`); } catch { return null; }
  const host = u.hostname.toLowerCase().replace(/^(www|m|music)\./, "");
  let id = null;
  if (host === "youtu.be") id = u.pathname.split("/")[1] || null;
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (u.pathname === "/watch" || u.pathname === "/watch/") id = u.searchParams.get("v");
    else {
      const m = u.pathname.match(/^\/(?:shorts|embed|live|v|e)\/([^/?#]+)/);
      if (m) id = m[1];
    }
  } else return null;
  if (!id || !ID_RE.test(id)) return null;
  const hash = new URLSearchParams(u.hash.replace(/^#/, ""));
  const t = u.searchParams.get("t") ?? u.searchParams.get("start") ?? hash.get("t");
  return { videoId: id, start: t != null ? parseTime(t) : null };
}

/** Bağlantının kısa gösterimi. */
export const trackLabel = (t) => (t?.videoId ? `youtu.be/${t.videoId}` : "");

let seq = 0;
const newId = () => `gm_${Date.now().toString(36)}${(seq += 1).toString(36)}`;

/** Tek bağlantı: url → videoId; start / end saniye (end > start değilse yok sayılır). */
export function normalizeTrack(t) {
  const x = t && typeof t === "object" ? t : { url: t };
  const parsed = parseYoutubeUrl(x.url || x.videoId);
  if (!parsed) return null;
  const start = parseTime(x.start) ?? parsed.start ?? 0;
  let end = parseTime(x.end);
  if (end != null && end <= start) end = null;
  return { id: String(x.id || newId()), url: String(x.url || parsed.videoId).slice(0, 300), videoId: parsed.videoId, start, end, title: String(x.title || "").slice(0, 80) };
}

export function normalizeTeamMusic(v) {
  const x = v && typeof v === "object" ? v : {};
  const tracks = (Array.isArray(x.tracks) ? x.tracks : []).map(normalizeTrack).filter(Boolean).slice(0, MAX_TRACKS);
  const mode = GOAL_MUSIC_MODES.some((m) => m.key === x.mode) ? x.mode : "active";
  const activeId = tracks.some((t) => t.id === x.activeId) ? x.activeId : tracks[0]?.id || null;
  const rotate = Number.isInteger(x.rotate) && x.rotate >= 0 ? x.rotate % Math.max(1, tracks.length) : 0;
  return { mode, activeId, rotate, playSec: normalizePlaySec(x.playSec), tracks };
}
/** Takım ayarı saklanmaya değer mi (bağlantı ya da çalma süresi var). */
const keepTeam = (t) => t.tracks.length > 0 || t.playSec != null;

export function normalizeGoalMusic(v) {
  const x = v && typeof v === "object" ? v : {};
  const teams = {};
  for (const [k, t] of Object.entries(x.teams && typeof x.teams === "object" ? x.teams : {})) {
    if (!k || k === "undefined" || k === "null") continue;
    const n = normalizeTeamMusic(t);
    if (keepTeam(n)) teams[String(k)] = n;
  }
  const vol = Number(x.volume);
  return {
    volume: Number.isFinite(vol) ? Math.round(Math.min(100, Math.max(0, vol))) : 80,
    autoOnGoal: Boolean(x.autoOnGoal),
    fadeMs: Math.round(Math.min(5000, Math.max(0, Number(x.fadeMs ?? DEFAULT_FADE_MS) || 0))),
    teams,
  };
}

/** Takım anahtarı (kimlik yoksa null: ayar yapılamaz). */
export const teamKey = (id) => (id == null || id === "" || Number(id) === 0 ? null : String(id));

export const teamMusicOf = (config, teamId) => {
  const k = teamKey(teamId);
  return normalizeTeamMusic(k ? config?.teams?.[k] : null);
};

/** Takımın ayarını değiştirir (fn(team) → team). Saf: yeni config döner. */
export function updateTeamMusic(config, teamId, fn) {
  const k = teamKey(teamId);
  const c = normalizeGoalMusic(config);
  if (!k) return c;
  const cur = teamMusicOf(c, k);
  const next = normalizeTeamMusic(typeof fn === "function" ? fn(cur) : { ...cur, ...fn });
  const teams = { ...c.teams };
  if (keepTeam(next)) teams[k] = next; else delete teams[k];
  return { ...c, teams };
}

/** Bağlantı ekle (geçersizse config aynen döner, ok: false). */
export function addTrack(config, teamId, input) {
  const t = normalizeTrack(typeof input === "string" ? { url: input } : input);
  if (!t || !teamKey(teamId)) return { config: normalizeGoalMusic(config), ok: false, track: null };
  const team = teamMusicOf(config, teamId);
  if (team.tracks.length >= MAX_TRACKS) return { config: normalizeGoalMusic(config), ok: false, track: null };
  const next = updateTeamMusic(config, teamId, (tm) => ({ ...tm, tracks: [...tm.tracks, t], activeId: tm.activeId || t.id }));
  return { config: next, ok: true, track: t };
}

/**
 * Çalınacak bağlantı. rand: () => 0…1 (sınanabilir).
 * → { track, next } (next: rotate modunda sayaç ilerlemiş takım ayarı) | null
 */
export function pickTrack(team, rand = Math.random) {
  const t = normalizeTeamMusic(team);
  if (!t.tracks.length) return null;
  if (t.mode === "random") return { track: t.tracks[Math.min(t.tracks.length - 1, Math.floor(rand() * t.tracks.length))], next: t };
  if (t.mode === "rotate") {
    const i = t.rotate % t.tracks.length;
    return { track: t.tracks[i], next: { ...t, rotate: (i + 1) % t.tracks.length } };
  }
  return { track: t.tracks.find((x) => x.id === t.activeId) || t.tracks[0], next: t };
}

/** loadVideoById seçenekleri. plan (musicPlan) verilirse bitiş plandan (zamanlayıcıdan biraz sonra). */
export const playerArgs = (track, plan = null) => {
  const end = plan ? plan.endSeconds : track.end;
  return { videoId: track.videoId, startSeconds: track.start || 0, ...(end != null ? { endSeconds: end } : {}) };
};

/** Ses azaltma eğrisi: t (0…1) anındaki ses düzeyi (0…vol). */
export const fadeLevel = (vol, t) => Math.max(0, Math.round(vol * (1 - Math.min(1, Math.max(0, t))) ** 2));

export function readGoalMusic(storage) {
  try { return normalizeGoalMusic(JSON.parse(storage?.getItem(GOAL_MUSIC_KEY) || "null")); } catch { return normalizeGoalMusic(null); }
}
export function writeGoalMusic(storage, config) {
  try { storage?.setItem(GOAL_MUSIC_KEY, JSON.stringify(normalizeGoalMusic(config))); return true; } catch { return false; }
}
