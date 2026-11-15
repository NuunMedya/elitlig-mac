// Yönetim paneli menüsü (masaüstü tarafı).
//
// Kaynak web'in kendi menüsüdür (elitlig-client src/editor_pages/adminNav.js
// NAV_GROUPS). İki yoldan gelir:
//   1) adminNav.snapshot.json — derlemeye giren kopya (scripts/sync-admin-nav.mjs
//      üretir). Gömülü panel henüz açılmadan ve çevrimdışıyken kullanılır;
//      yetki süzmesi web'in kurallarıyla (canSeeNavItem / hasPermission) burada yapılır.
//   2) Gömülü panel yüklenince web, kullanıcıya GÖRÜNEN menüyü köprüden
//      bildirir (publishNav). Bu liste web'in kendi süzmesidir; kullanıcı ve
//      yetkileri değişmedikçe kopyanın yerini alır (yeni eklenen web sayfaları
//      da böylece masaüstüne kendiliğinden gelir).
"use strict";

const SNAPSHOT = require("./adminNav.snapshot.json");

const DASHBOARD_PATH = "/editor";

// Web'in kişisel araçları ve iş akışı sayfaları masaüstünde yerel olarak var:
// gömülü panelde bu adreslere gidilince (ayar açıksa) yerel araç açılır.
// Yalnız kök adres (sorgusuz) eşlenir; alt sayfalar (ör. tek bir tablo) panelde kalır.
const NATIVE_ROUTES = Object.freeze({
  "/yonetim/araclar": "today",
  "/yonetim/araclar/projeler": "projects",
  "/yonetim/yapilacaklar": "todos",
  "/yonetim/araclar/ajanda": "agenda",
  "/yonetim/araclar/not-defteri": "notes",
  "/yonetim/araclar/muhasebe": "ledger",
  "/yonetim/araclar/tablolar": "sheets",
  "/yonetim/araclar/mesajlar": "messages",
  "/yonetim/araclar/rehber": "contacts",
  "/yonetim/araclar/ekipman": "equipment",
  "/yonetim/araclar/hesap-araclari": "calc",
  "/yonetim/araclar/odak-sayaci": "focus",
  "/yonetim/talepler": "requests",
});

const normalizePath = (value = "") => String(value).replace(/ı/g, "i").replace(/\/+$/, "") || "/";

/** Web'in hasPermission kuralı (utils/roleManagement.js): admin her şeyi görür; liste yoksa yönetim hesabı. */
function hasPermission(user, permission) {
  if (!user || !permission) return false;
  if (user.role === "admin") return true;
  if (!Array.isArray(user.permissions)) return user.isManagement !== false;
  return user.permissions.includes(permission) || user.permissions.includes("*");
}
const hasAnyPermission = (user, permissions = []) => permissions.some((p) => hasPermission(user, p));

/** Web'in canSeeNavItem kuralı (adminNav.js). */
const canSeeNavItem = (user, item) =>
  (!item.roles || item.roles.includes(user?.role)) &&
  (!item.excludeRoles || !item.excludeRoles.includes(user?.role)) &&
  (!item.permissions || hasAnyPermission(user, item.permissions)) &&
  (!item.hideWithPermissions || !hasAnyPermission(user, item.hideWithPermissions));

const cleanItem = (item) => ({
  name: String(item.name || ""),
  path: String(item.path || ""),
  icon: item.icon ? String(item.icon) : undefined,
  keywords: [item.keywords, item.formerly].filter(Boolean).join(" ") || undefined,
});

/** Kopyadan, kullanıcının yetkisine göre süzülmüş gruplar (boş gruplar düşer). */
function groupsFromSnapshot(user, snapshot = SNAPSHOT) {
  return (snapshot.groups || []).map((group) => ({
    key: group.key,
    label: group.label,
    short: group.short,
    icon: group.icon,
    top: Boolean(group.top),
    tools: Boolean(group.tools),
    items: group.items.filter((item) => canSeeNavItem(user, item)).map(cleanItem),
  })).filter((group) => group.items.length > 0);
}

/** Komut paletindeki web işlemleri ("Yeni maç oluştur", "Kura çek"…), yetkiye göre. */
const actionsFor = (user, snapshot = SNAPSHOT) =>
  (snapshot.actions || []).filter((a) => canSeeNavItem(user, a)).map((a) => ({ key: a.key, ...cleanItem(a) }));

/** Kullanıcı + yetkiler için anahtar: web'in bildirdiği menü yalnız aynı anahtarla geçerlidir. */
const userKey = (user) => (user ? `${user.id ?? user.username ?? ""}|${user.role || ""}|${JSON.stringify(Array.isArray(user.permissions) ? [...user.permissions].sort() : null)}` : "");

/** Web'in bildirdiği menüyü doğrular / sadeleştirir (köprüden gelen veri güvenilmez sayılır). */
function sanitizePublished(groups) {
  if (!Array.isArray(groups)) return null;
  const out = groups.slice(0, 40).map((g) => ({
    key: String(g?.key || "").slice(0, 60),
    label: String(g?.label || "").slice(0, 80),
    short: g?.short ? String(g.short).slice(0, 40) : undefined,
    icon: g?.icon ? String(g.icon).slice(0, 40) : undefined,
    top: Boolean(g?.top),
    tools: Boolean(g?.tools),
    items: (Array.isArray(g?.items) ? g.items : []).slice(0, 80)
      .filter((i) => typeof i?.path === "string" && i.path.startsWith("/") && !i.path.startsWith("//"))
      .map((i) => ({ name: String(i.name || "").slice(0, 120), path: i.path.slice(0, 300), icon: i.icon ? String(i.icon).slice(0, 40) : undefined, keywords: i.keywords ? String(i.keywords).slice(0, 600) : undefined })),
  })).filter((g) => g.key && g.items.length);
  return out.length ? out : null;
}

/**
 * Masaüstünde kullanılacak menü: web'in bildirdiği (aynı kullanıcı ve
 * yetkilerle) varsa o, yoksa kopyadan süzülen.
 */
function navFor(user, published = null) {
  const key = userKey(user);
  const fromWeb = published && published.userKey === key && Array.isArray(published.groups) ? published.groups : null;
  return { source: fromWeb ? "web" : "snapshot", groups: fromWeb || groupsFromSnapshot(user), actions: actionsFor(user) };
}

/** Gömülü panelin yolu yerel bir araca karşılık geliyor mu? (sorgulu adresler panelde kalır) */
function nativeRouteFor(urlOrPath, siteOrigin) {
  try {
    const u = new URL(urlOrPath, siteOrigin);
    if (siteOrigin && u.origin !== new URL(siteOrigin).origin) return null;
    if (u.search) return null;
    return NATIVE_ROUTES[normalizePath(u.pathname)] || null;
  } catch {
    return null;
  }
}

/** Açık sayfaya en iyi uyan menü öğesi (web'in findActiveNav kuralının sade hâli). */
function findActive(pathname, groups) {
  const path = normalizePath(String(pathname || "").split("?")[0]);
  let best = null;
  let bestScore = -1;
  for (const group of groups || []) {
    for (const item of group.items) {
      const target = normalizePath(item.path.split("?")[0]);
      const exact = path === target;
      const prefix = !exact && target !== DASHBOARD_PATH && path.startsWith(`${target}/`);
      if (!exact && !prefix) continue;
      const score = target.length * 2 + (exact ? 1000 : 0) + (item.path.includes("?") ? -1 : 0);
      if (score > bestScore) { best = { group: group.key, path: item.path, name: item.name }; bestScore = score; }
    }
  }
  return best;
}

/** Yalnız site içi yol kabul edilir: "/editor/maclar?q=x" (mutlak adres ya da "//" değil). */
function safeSitePath(value) {
  const s = String(value || "").trim();
  if (!s.startsWith("/") || s.startsWith("//") || /[\s\\]/.test(s)) return null;
  return s.slice(0, 500);
}

module.exports = {
  SNAPSHOT, NATIVE_ROUTES, DASHBOARD_PATH,
  hasPermission, canSeeNavItem, groupsFromSnapshot, actionsFor, userKey, sanitizePublished, navFor,
  nativeRouteFor, findActive, safeSitePath, normalizePath,
};
