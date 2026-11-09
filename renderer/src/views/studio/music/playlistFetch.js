// Müzik çalar — YouTube oynatma listesini AÇMA (parçalar, başlıklar, süreler).
//
//   1) Ana süreç (app/studio/ytplaylist.js, studio:music:playlist): liste sayfası (ytInitialData:
//      ilk ~100 parça, başlık + süre) ya da RSS akışı (feeds/videos.xml: en çok 15 parça, süresiz).
//      Arayüzün CSP'si youtube.com'a fetch'i engeller; bu yüzden ana süreçte.
//   2) Daha uzun liste (ya da ana süreç yoksa / açamadıysa): gizli IFrame oynatıcısına liste
//      yüklenir (cuePlaylist: ses çıkmaz) ve getPlaylist() video kimlikleri okunur (YouTube'un
//      verdiği kadar, pratikte ~200). Başlıklar oEmbed ile 5'erli gruplarla doldurulur; süreler
//      parça ilk çaldığında öğrenilir.
import { createHiddenPlayer } from "../goalmusic/youtubePlayer";
import { MAX_PLAYLIST_ITEMS } from "./playlistModel";

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const VID = /^[A-Za-z0-9_-]{11}$/;

/** Gizli oynatıcıyla liste kimliklerini oku → videoId[] */
export async function probeIframePlaylist(listId, { timeoutMs = 12_000, create = createHiddenPlayer } = {}) {
  const h = await create({});
  try {
    const p = h.player;
    try { p.mute?.(); } catch { /* yoksay */ }
    p.cuePlaylist({ list: listId, listType: "playlist", index: 0 });
    const t0 = Date.now();
    let last = [];
    let stable = 0;
    while (Date.now() - t0 < timeoutMs) {
      await wait(300);
      let ids = [];
      try { ids = p.getPlaylist?.() || []; } catch { ids = []; }
      if (Array.isArray(ids) && ids.length) {
        stable = ids.length === last.length ? stable + 1 : 0;
        last = ids;
        if (stable >= 2) break;
      }
    }
    return last.filter((v) => VID.test(v)).slice(0, MAX_PLAYLIST_ITEMS);
  } finally {
    try { h.destroy(); } catch { /* yoksay */ }
  }
}

/**
 * Listeyi aç. bridge: window.elitlig.studio.music (playlist?, oembed?) · probe: IFrame yedeği.
 * → { items: [{ v, t, d }], title, source: "page" | "feed" | "iframe", more }
 */
export async function fetchPlaylist(listId, { bridge = null, probe = probeIframePlaylist } = {}) {
  let res = null;
  if (bridge?.playlist) { try { res = await bridge.playlist(listId); } catch { res = null; } }
  let items = res?.ok ? (res.items || []).map((x) => ({ v: x.videoId, t: x.title || "", d: x.durationSec ?? null })) : [];
  let source = res?.ok ? res.source || "page" : null;
  let probeErr = null;
  if ((!items.length || res?.more) && probe) {
    try {
      const ids = await probe(listId);
      if (ids.length > items.length) {
        const known = new Map(items.map((i) => [i.v, i]));
        items = ids.map((v) => known.get(v) || { v, t: "", d: null });
        source = known.size ? source : "iframe";
      }
    } catch (e) { probeErr = e; }
  }
  if (!items.length) throw new Error(res?.error || probeErr?.message || "Oynatma listesi açılamadı (liste gizli ya da boş olabilir).");
  return { items: items.slice(0, MAX_PLAYLIST_ITEMS), title: res?.title || "", source, more: Boolean(res?.more) && items.length <= (res?.items?.length || 0) };
}

/** Başlığı olmayan parçalar için oEmbed (5'erli). onBatch([{ v, t }]) her grup bitince. */
export async function fillTitles(items, { bridge = null, onBatch, size = 5, limit = MAX_PLAYLIST_ITEMS } = {}) {
  if (!bridge?.oembed) return 0;
  const todo = items.filter((x) => !x.t).slice(0, limit);
  let n = 0;
  for (let i = 0; i < todo.length; i += size) {
    const batch = todo.slice(i, i + size);
    const got = await Promise.all(batch.map((x) => Promise.resolve(bridge.oembed(`https://www.youtube.com/watch?v=${x.v}`)).then((r) => (r?.ok && r.title ? { v: x.v, t: r.title } : null)).catch(() => null)));
    const ok = got.filter(Boolean);
    n += ok.length;
    if (ok.length) onBatch?.(ok);
  }
  return n;
}
