// Dış bağlantılar: app.openExternal ve pencere dışı bağlantılar için izinli şemalar.
//
// https / http (ör. https://accounts.google.com — YouTube hesabını bağlama,
// API sunucusunun OAuth adresleri, elitlig.com), mailto, tel, sms, whatsapp,
// facetime. file:, javascript:, data: ve özel şemalar açılmaz.
"use strict";

const EXTERNAL = /^(https?|mailto|tel|sms|whatsapp|facetime):/i;

function isAllowedExternal(url) {
  const s = String(url ?? "").trim();
  if (!EXTERNAL.test(s)) return false;
  if (/^https?:/i.test(s)) {
    try {
      const u = new URL(s);
      return Boolean(u.hostname);
    } catch {
      return false;
    }
  }
  return true;
}

module.exports = { isAllowedExternal };
