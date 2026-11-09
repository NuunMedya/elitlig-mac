// Yayın Stüdyosu · YAYIN BAĞLANTILARI (saf): YouTube izleme / YouTube Studio
// sayfası ve elitlig.com'daki herkese açık maç sayfası.
//
// Maç sayfası web istemcisinin (elitlig-client App.js) kalıcı rotasıdır:
//   /sehir/:cityId/mac/:matchId          (MatchPage; il kimliği varsa — standart)
//   /:citySlug/mac/:matchId              (eski rota; il kimliği yoksa il adından)
// YouTube canlı yayınının video kimliği yayın (broadcast) kimliğiyle aynıdır:
//   https://www.youtube.com/watch?v=<id> · https://studio.youtube.com/video/<id>/livestreaming
export const SITE_ORIGIN = "https://elitlig.com";

const YT_ID = /^[A-Za-z0-9_-]{6,20}$/;

/** "x" | { broadcast_id } | { watch_url } → video kimliği ya da null. */
export function youtubeVideoId(input) {
  if (!input) return null;
  if (typeof input === "string") {
    const s = input.trim();
    if (YT_ID.test(s)) return s;
    try {
      const u = new URL(s);
      const host = u.hostname.replace(/^www\.|^m\./, "");
      if (host === "youtu.be") { const id = u.pathname.split("/")[1]; return YT_ID.test(id || "") ? id : null; }
      if (host.endsWith("youtube.com")) {
        const v = u.searchParams.get("v");
        if (v && YT_ID.test(v)) return v;
        const m = u.pathname.match(/\/(?:live|embed|shorts|video)\/([A-Za-z0-9_-]{6,20})/);
        return m ? m[1] : null;
      }
    } catch { /* adres değil */ }
    return null;
  }
  if (typeof input === "object") return youtubeVideoId(input.broadcast_id || input.broadcastId || input.video_id || input.videoId || null) || youtubeVideoId(input.watch_url || input.watchUrl || null);
  return null;
}

/** İzleme adresi: yayının watch_url'si (YouTube'dan), yoksa kimlikten. */
export function youtubeWatchUrl(stream) {
  if (!stream) return null;
  const raw = typeof stream === "object" ? String(stream.watch_url || stream.watchUrl || "").trim() : "";
  if (/^https:\/\/(www\.|m\.)?(youtube\.com|youtu\.be)\//i.test(raw)) return raw;
  const id = youtubeVideoId(stream);
  return id ? `https://www.youtube.com/watch?v=${id}` : null;
}

/** YouTube Studio'da yayının canlı yayın denetim sayfası (kimlik biliniyorsa). */
export function youtubeStudioUrl(stream) {
  const id = typeof stream === "object" && stream ? youtubeVideoId(stream.broadcast_id || stream.broadcastId || null) : youtubeVideoId(stream);
  return id ? `https://studio.youtube.com/video/${id}/livestreaming` : null;
}

/** web istemcisi citySlug ile aynı: "İstanbul Anadolu" → "istanbul-anadolu". */
export function citySlug(city) {
  return String(city || "turkiye").toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i").replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ş/g, "s").replace(/ö/g, "o").replace(/ç/g, "c").replace(/i̇/g, "i")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "turkiye";
}

/**
 * Herkese açık maç sayfası. match: GET /api/maclar/:id kaydı ({ id, city_id, city }).
 * İl kimliği yoksa il adından eski rota; maç kimliği yoksa null.
 */
export function matchPageUrl(match, origin = SITE_ORIGIN) {
  const id = Number(match?.id);
  if (!(id > 0)) return null;
  const base = String(origin || SITE_ORIGIN).replace(/\/+$/, "");
  const cityId = Number(match?.city_id ?? match?.cityId);
  if (cityId > 0) return `${base}/sehir/${cityId}/mac/${id}`;
  const city = String(match?.city ?? "").trim();
  return city ? `${base}/${citySlug(city)}/mac/${id}` : null;
}

/**
 * Üst çubuk / Yayın paneli / parçacık bağlantıları. Her biri { key, label, url, reason }:
 * url yoksa reason düğmenin ipucunda gösterilir (düğme devre dışı).
 */
export function broadcastLinks({ stream = null, match = null, origin = SITE_ORIGIN } = {}) {
  const watch = youtubeWatchUrl(stream);
  const studio = youtubeStudioUrl(stream);
  const page = matchPageUrl(match, origin);
  const noMatch = !match ? "Önce bir maç seç." : null;
  return [
    { key: "youtube", label: "YouTube yayınını aç", icon: "video", url: watch, reason: watch ? null : "YouTube yayını henüz açılmadı (Yayın panelinden “YouTube'da canlı yayını başlat”)." },
    { key: "studio", label: "YouTube Studio'da aç", icon: "sliders", url: studio, reason: studio ? null : "Yayın kimliği bilinmiyor: YouTube yayını bu uygulamadan açılınca kullanılabilir." },
    { key: "match", label: "Maç sayfasını aç", icon: "globe", url: page, reason: page ? null : noMatch || "Maçın il bilgisi yok: sitede maç sayfası adresi kurulamadı." },
  ];
}

export const linkOf = (links, key) => (links || []).find((l) => l.key === key) || null;

/** QR kartı gösterim süreleri (sn); 0 = kapatılana kadar. */
export const QR_DURATIONS = Object.freeze([10, 20, 30, 60, 0]);

/** Programdaki QR kartının durumu (anlık görüntüye girer; ana çizim ve işçi aynı çizer). */
export function qrOverlay(url, { label = "", seconds = 20, now = Date.now(), corner = "br" } = {}) {
  const text = String(url || "").trim();
  if (!text) return null;
  const s = Number(seconds);
  return { text, label: String(label || "").slice(0, 40), since: now, until: s > 0 ? now + s * 1000 : null, corner: ["br", "bl", "tr", "tl"].includes(corner) ? corner : "br" };
}
export const qrVisible = (qr, now = Date.now()) => Boolean(qr?.text) && (!qr.until || now < qr.until);
