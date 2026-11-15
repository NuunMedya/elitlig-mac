// Yayın Stüdyosu · YouTube kanal bağlantısı (saf; useYoutube ve BroadcastPanel).
//
// Sunucu (GET /config): configured, connected, channel, token_source ("db" | "env"), env_note.
// Kanal sunucunun YOUTUBE_REFRESH_TOKEN ortam değişkeninden geliyorsa (token_source "env")
// uygulamadan kesilemez; yeni kanal bağlanırsa o kullanılır (env_note bunu açıklar).

/** Sunucu yapılandırması → arayüz durumu. */
export function normalizeYoutubeConfig(c = {}, { ok = true, error = null } = {}) {
  const configured = Boolean(c.configured);
  const tokenSource = c.token_source || null;
  return {
    loading: false,
    configured,
    connected: c.connected != null ? Boolean(c.connected) : configured,
    channel: c.channel || null,
    oauthReady: c.oauth_ready !== false,
    oauthKnown: c.oauth_ready != null,
    privacy: c.privacy || "public",
    tokenSource,
    envNote: c.env_note || (tokenSource === "env" ? ENV_NOTE : null),
    error: ok ? null : error || null,
  };
}

const ENV_NOTE = "Yayınlar sunucu ayarındaki (YOUTUBE_REFRESH_TOKEN) YouTube kanalına açılıyor. Bu bağlantı uygulamadan kesilemez; başka kanal bağlarsanız yeni kanal kullanılır.";

/**
 * Bağlantı görünümü: "connected" (uygulamadan bağlı kanal) · "env" (yalnız sunucu ayarındaki
 * jeton: açıklama + bağla düğmesi) · "setup" (sunucuda OAuth kurulmamış) · "connect".
 */
export function youtubeConnectView(cfg) {
  if (!cfg) return "connect";
  if (cfg.configured && cfg.connected !== false) return "connected";
  if (cfg.configured && cfg.tokenSource === "env") return "env";
  if (cfg.oauthKnown && !cfg.oauthReady) return "setup";
  return "connect";
}

/** Bağlantı tamamlandı mı. switching: önceki kanal (kanal değiştirme) → kanal kimliği / adı değişmeli. */
export function connectDone(next, { switching = false, prevChannel = null } = {}) {
  if (!next?.configured || next.connected === false) return false;
  if (!switching) return true;
  const a = prevChannel || {};
  const b = next.channel || {};
  return (b.id || null) !== (a.id || null) || (b.title || null) !== (a.title || null);
}

/** Bağlantıyı kesme yanıtının kullanıcı iletisi. */
export function disconnectResult(data, envNote = null) {
  if (data?.env_fallback) {
    return { tone: "info", text: `Uygulamadan bağlanan kanal kaldırıldı; yayınlar artık sunucu ayarındaki kanala açılıyor. ${envNote || "Bu kanal (YOUTUBE_REFRESH_TOKEN) uygulamadan kesilemez; tamamen kaldırmak için sunucu ayarından silinmelidir."}` };
  }
  if (data && data.disconnected === false) return { tone: "info", text: "Kaldırılacak bağlı kanal bulunamadı." };
  return { tone: "success", text: "YouTube bağlantısı kesildi." };
}

/** Sunucu hatası → okunur ileti (yetki hatasında hangi izin gerektiği). */
export function youtubeErrorText(err, fallback) {
  const code = err?.code || null;
  const msg = err?.message || "";
  if (code === "PERMISSION_DENIED" || code === "FORBIDDEN" || /yetki/i.test(msg)) {
    const base = msg && msg !== fallback ? msg : "Bu işlem için yetkiniz yok.";
    return /YouTube kanalını bağlama/i.test(base) ? base : `${base} Gerekli izin: “YouTube kanalını bağlama ve bağlantıyı kesme” (integrations.manage).`;
  }
  return msg || fallback;
}
