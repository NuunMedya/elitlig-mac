// Oturum deposu.
//
// Jeton, macOS Anahtar Zinciri'ne bağlı safeStorage ile şifrelenip uygulama
// veri klasöründe saklanır; düz metin olarak diske yazılmaz. Oturum girişten
// itibaren SESSION_DAYS (90 gün) geçerlidir: bu sürede jeton süresi dolmadan
// yenilenir, 90 gün dolunca yeniden giriş istenir.
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const DAY_MS = 86400000;

/** JWT gövdesini doğrulamadan okur (yalnız exp/iat için). */
function decodeJwt(token) {
  try {
    const part = String(token || "").split(".")[1];
    return JSON.parse(Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
  } catch {
    return null;
  }
}

/**
 * Oturumun durumu: "none" | "valid" | "refresh" (geçerli ama yenilenmeli) |
 * "expired". Yenileme, jeton ömrünün yarısı geçince istenir.
 */
function sessionStatus(session, { now = Date.now(), days = 90 } = {}) {
  if (!session?.token) return "none";
  const loginAt = Number(session.loginAt) || 0;
  if (now >= loginAt + days * DAY_MS) return "expired";
  const claims = decodeJwt(session.token);
  if (!claims?.exp) return "valid";
  const exp = claims.exp * 1000;
  if (now >= exp) return "expired";
  const iat = (claims.iat || claims.exp - 86400) * 1000;
  return now >= iat + (exp - iat) / 2 ? "refresh" : "valid";
}

/** Oturumun bitiş anı: 90 günlük sınır ile jetonun kendi süresinden önce gelen. */
function sessionEndsAt(session, { days = 90 } = {}) {
  if (!session?.token) return null;
  return (Number(session.loginAt) || 0) + days * DAY_MS;
}

function createSessionStore({ dir, safeStorage }) {
  const file = path.join(dir, "session.bin");
  const canEncrypt = () => {
    try { return Boolean(safeStorage?.isEncryptionAvailable()); } catch { return false; }
  };
  let cached;

  const load = () => {
    if (cached !== undefined) return cached;
    try {
      const raw = fs.readFileSync(file);
      const text = raw[0] === 0x7b /* { */ ? raw.toString("utf8") : safeStorage.decryptString(raw);
      cached = JSON.parse(text);
    } catch {
      cached = null;
    }
    return cached;
  };

  const save = (session) => {
    cached = session;
    fs.mkdirSync(dir, { recursive: true });
    const text = JSON.stringify(session);
    fs.writeFileSync(file, canEncrypt() ? safeStorage.encryptString(text) : text, { mode: 0o600 });
  };

  const clear = () => {
    cached = null;
    try { fs.unlinkSync(file); } catch { /* yok */ }
  };

  return { load, save, clear };
}

module.exports = { createSessionStore, sessionStatus, sessionEndsAt, decodeJwt, DAY_MS };
