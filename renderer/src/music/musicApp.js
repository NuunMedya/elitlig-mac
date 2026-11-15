// Uygulama geneli müzik çalar — saf yardımcılar (renderer/test/musicApp.test.js).
//
// Çalar Yayın Stüdyosu'nun motorunu (views/studio/music/useMusicPlayer) yeniden kullanır,
// ama listesini AYRI anahtarda tutar: stüdyonun yayın listesi ("studio.music.v1") genel
// dinlemeyle karışmasın. "Stüdyo listesinden aktar" iki listeyi birleştirebilir.
//
// Stüdyo kuralı: stüdyonun kendi müzik çaları yayına giden sesi yönetir. Genel çalar
//   "pause" (varsayılan): stüdyoya girince duraklar, çıkınca (yalnız biz duraklattıysak) sürer.
//   "keep": çalmaya devam eder (ses yalnız hoparlörden çıkar, yayına gitmez).
import { addMusicTrack, normalizeMusic } from "../views/studio/music/musicModel";

export const APP_MUSIC_KEY = "app.music.v1";
export const STUDIO_MUSIC_KEY = "studio.music.v1";
export const EMPTY_HINT = "Müzik listesi boş: Müzik görünümünden YouTube bağlantısı, oynatma listesi ya da ses dosyası ekleyin.";

export const isPlayingStatus = (s) => ["playing", "loading", "fadein", "xfade"].includes(s);

/**
 * Görünüm değişince ne yapılacak? prevRoute → route geçişi, kural ve çalma durumu.
 * pausedByStudio: daha önce stüdyo yüzünden biz mi duraklattık.
 * → { action: "pause" | "resume" | null, pausedByStudio }
 */
export function studioTransition({ prevRoute, route, rule = "pause", status = "idle", pausedByStudio = false }) {
  const enter = route === "studio" && prevRoute !== "studio";
  const leave = prevRoute === "studio" && route !== "studio";
  if (rule !== "pause") return { action: null, pausedByStudio: false };
  if (enter && isPlayingStatus(status)) return { action: "pause", pausedByStudio: true };
  if (leave && pausedByStudio) return { action: status === "paused" ? "resume" : null, pausedByStudio: false };
  return { action: null, pausedByStudio };
}

/** Ana sürece (menü çubuğu, araç takımı paneli) gidecek özet. */
export function publishPayload(mp, extra = {}) {
  const n = mp?.now || {};
  return {
    status: n.status || "idle",
    title: n.title || "",
    listTitle: n.listTitle || "",
    nextTitle: n.nextTitle || "",
    elapsedSec: Math.floor(Number(n.elapsedSec) || 0),
    lengthSec: n.lengthSec == null ? null : Math.round(n.lengthSec),
    volume: mp?.volume ?? 70,
    shuffle: Boolean(mp?.config?.shuffle),
    repeat: mp?.config?.repeat || "all",
    trackCount: mp?.tracks?.length || 0,
    ...extra,
  };
}

const KEY_FIELDS = ["status", "title", "listTitle", "nextTitle", "lengthSec", "volume", "shuffle", "repeat", "trackCount", "pausedByStudio"];
/** Yayınlansın mı? Önemli alan değiştiyse hemen; yalnız süre ilerlediyse en çok saniyede bir. */
export function shouldPublish(prev, next, nowMs, lastAt, minMs = 1000) {
  if (!prev) return true;
  if (KEY_FIELDS.some((k) => prev[k] !== next[k])) return true;
  return prev.elapsedSec !== next.elapsedSec && nowMs - lastAt >= minMs;
}

const keyOf = (t) => (t.kind === "playlist" ? `pl:${t.listId}` : t.kind === "file" ? `f:${t.fileUrl}` : `yt:${t.videoId}`);
/** Stüdyo listesindeki girişleri genel listeye ekle (aynı video / liste / dosya atlanır). → { config, added } */
export function importTracks(appConfig, sourceConfig) {
  let cfg = normalizeMusic(appConfig);
  const src = normalizeMusic(sourceConfig);
  const have = new Set(cfg.tracks.map(keyOf));
  let added = 0;
  for (const t of src.tracks) {
    const k = keyOf(t);
    if (have.has(k)) continue;
    const { id, ...rest } = t; // yeni kimlik: iki listedeki sanal kimlikler karışmasın
    const res = addMusicTrack(cfg, rest);
    if (!res.ok) break;
    cfg = res.config;
    have.add(k);
    added += 1;
  }
  return { config: cfg, added };
}

/** Saniye → "m:ss" (saat varsa "s:mm:ss"). */
export function clock(sec) {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${r}` : `${m}:${r}`;
}
