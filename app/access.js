// Yetkiler: oturumdaki kullanıcının (giriş / /api/users/verify yanıtı)
// "permissions" listesinden masaüstündeki yönetim bölümlerinin açılıp
// açılmayacağı çıkarılır. Sunucu asıl kontrolü her uçta yine yapar.
//
//   inbox   — Mesajlar'da "Üye mesajları" (ortak gelen kutusu): messages.view
//   reply   — üye sohbetine ElitLig Yönetimi adına yazma: messages.reply
//   calls   — arama kayıtları: messages.calls_view (ses: messages.listen)
//   requests — Talepler: tüm yönetim hesapları (onay / ret uçları kendi yetkisini ister)
//   content — Mesajlar'da hazır içerikler (günün maçları, ben talibim): yönetim hesapları
//   assign  — "Ben talibim" anketinde talip olanı maça görevlendirme: staff.assign
//   award   — Haftanın Enleri anketi (aday öneri kartları açar): todos.assign
//
// Liste oturumda yoksa (eski oturum) "known: false" döner; ana süreç bu
// durumda uçları yoklar ve 403'ü "erişim yok" sayar (probeAccess).
"use strict";

const PERMS = Object.freeze({ inbox: "messages.view", reply: "messages.reply", calls: "messages.calls_view", listen: "messages.listen", assign: "staff.assign", award: "todos.assign" });

function accessFromUser(user, probed = null) {
  const list = Array.isArray(user?.permissions) ? user.permissions : null;
  const requests = Boolean(user) && user.isManagement !== false;
  if (!list) {
    const p = probed || {};
    // Liste yoksa görevlendirme / haftanın enleri düğmeleri gösterilir; sunucu yetkiyi denetler.
    return { known: Boolean(probed), inbox: Boolean(p.inbox), reply: Boolean(p.inbox), calls: Boolean(p.calls), listen: Boolean(p.calls), requests, content: requests, assign: requests, award: requests };
  }
  const has = (key) => list.includes(key) || list.includes("*");
  return { known: true, inbox: has(PERMS.inbox), reply: has(PERMS.reply), calls: has(PERMS.calls), listen: has(PERMS.listen), requests, content: requests, assign: requests && has(PERMS.assign), award: requests && has(PERMS.award) };
}

/**
 * Yetki listesi bilinmiyorsa uçları yoklar. /api/admin/chat/summary yetkisiz
 * yönetim hesabına da açıktır (ekip sohbeti), bu yüzden messages.view için
 * yalnız onu isteyen /reports, kayıtlar için /calls yoklanır. 403 → yok;
 * ağ hatası → bilinmiyor (null).
 */
async function probeAccess(request) {
  const [reports, calls] = await Promise.all([
    request({ path: "/api/admin/chat/reports", query: { limit: 1 }, cache: false, queue: false }),
    request({ path: "/api/admin/chat/calls", query: { limit: 1 }, cache: false, queue: false }),
  ]);
  if (reports.offline || calls.offline) return null;
  return { inbox: Boolean(reports.ok), calls: Boolean(calls.ok) };
}

const sameAccess = (a, b) => ["known", "inbox", "reply", "calls", "listen", "requests", "content", "assign", "award"].every((k) => Boolean(a?.[k]) === Boolean(b?.[k]));

module.exports = { accessFromUser, probeAccess, sameAccess, PERMS };
