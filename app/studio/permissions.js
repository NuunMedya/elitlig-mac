// Kamera / mikrofon ve diğer izinler: yalnız uygulamanın kendi arayüzüne (file:// ya da
// geliştirme adresi). Dış kaynaklara izin yok. 2.36.0: registerStudio'dan ayrıldı — Elitlig
// Araçlar stüdyoyu tembel yüklediği için izin işleyicileri açılışta ayrıca kurulur (Mesajlar'daki
// sesli arama da aynı denetimden geçer).
"use strict";

/** ses: Electron oturumu; isOwnUrl(url) → boolean. */
function installMediaPermissions(ses, { isOwnUrl }) {
  if (!ses?.setPermissionRequestHandler) return;
  const ownContents = (wc) => {
    try { return Boolean(wc) && !wc.isDestroyed() && isOwnUrl(wc.getURL()); } catch { return false; }
  };
  ses.setPermissionRequestHandler((wc, permission, callback, details = {}) => {
    const own = isOwnUrl(details.requestingUrl || "") || ownContents(wc);
    if (!own) return callback(false);
    if (permission === "media") {
      const types = Array.isArray(details.mediaTypes) ? details.mediaTypes : [];
      return callback(types.every((t) => t === "video" || t === "audio"));
    }
    return callback(true);
  });
  ses.setPermissionCheckHandler((wc, permission, requestingOrigin, details = {}) => {
    const own = isOwnUrl(requestingOrigin || "") || isOwnUrl(details.requestingUrl || "") || ownContents(wc);
    if (!own) return false;
    if (permission === "media") return !details.mediaType || details.mediaType === "video" || details.mediaType === "audio" || details.mediaType === "unknown";
    return true;
  });
}

module.exports = { installMediaPermissions };
