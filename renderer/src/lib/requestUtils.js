// Talepler (onay merkezi) için saf yardımcılar: kategori sekmeleri, durum
// bölümleri, gün gruplama, eylem düğmesinin ne yapacağı (API çağrısı +
// onay penceresi ya da sitede sayfa açma).

export const REQUEST_STATUSES = [
  ["open", "Bekleyen"],
  ["info", "Bilgilendirme"],
  ["resolved", "Sonuçlanan"],
];

// Sunucunun Font Awesome adları yerine uygulamanın simgeleri.
export const CATEGORY_ICONS = {
  profile: "pencil",
  account: "shield",
  registration: "userPlus",
  transfer: "swap",
  roster: "list",
  match_request: "calendar",
  match: "ball",
  penalty: "flag",
  availability: "clock",
  message: "message",
  general: "bell",
};
export const categoryIcon = (key) => CATEGORY_ICONS[key] || "bell";

/**
 * Sekmeler: "Tümü" + sunucu sırasıyla kategoriler. Açık talebi olanlar önde,
 * olmayanlar sonda (soluk); seçili sekme her zaman listede kalır.
 */
export function categoryTabs(summary, active = "") {
  const cats = Array.isArray(summary?.categories) ? summary.categories : [];
  const withOpen = cats.filter((c) => Number(c.open) > 0);
  const rest = cats.filter((c) => !(Number(c.open) > 0));
  const total = Number(summary?.total) || withOpen.reduce((s, c) => s + Number(c.open), 0);
  return [
    { key: "", label: "Tümü", open: total, icon: "inbox", muted: false, active: !active },
    ...[...withOpen, ...rest].map((c) => ({ key: c.key, label: c.label || c.key, open: Number(c.open) || 0, icon: categoryIcon(c.key), path: c.path || null, muted: !(Number(c.open) > 0), active: active === c.key })),
  ];
}

/** Bugün kartı: açık talebi olan ilk n kategori. */
export function topCategories(summary, n = 4) {
  return (summary?.categories || []).filter((c) => Number(c.open) > 0).sort((a, b) => Number(b.open) - Number(a.open)).slice(0, n)
    .map((c) => ({ key: c.key, label: c.label || c.key, open: Number(c.open), icon: categoryIcon(c.key) }));
}

/** Yüklenen taleplerin kategori ve durum sayıları. */
export function countRequests(items) {
  const byCategory = {};
  const byStatus = { open: 0, info: 0, resolved: 0 };
  for (const r of items || []) {
    const c = r.category || "general";
    byCategory[c] = (byCategory[c] || 0) + 1;
    if (byStatus[r.status] !== undefined) byStatus[r.status] += 1;
  }
  return { byCategory, byStatus, total: (items || []).length };
}

const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime(); };

/** Talepleri güne göre gruplar (yeniden eskiye): Bugün / Dün / tarih. */
export function groupRequestsByDay(items, now = new Date()) {
  const today = startOfDay(now);
  const groups = [];
  const byKey = new Map();
  const sorted = [...(items || [])].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0) || Number(b.id) - Number(a.id));
  for (const r of sorted) {
    const t = r.created_at ? startOfDay(r.created_at) : today;
    const diff = Math.round((today - t) / 86400000);
    const key = String(t);
    if (!byKey.has(key)) {
      const label = diff <= 0 ? "Bugün" : diff === 1 ? "Dün" : new Date(t).toLocaleDateString("tr-TR", { day: "numeric", month: "long", ...(new Date(t).getFullYear() !== new Date(now).getFullYear() ? { year: "numeric" } : {}) });
      const g = { key, label, items: [] };
      byKey.set(key, g);
      groups.push(g);
    }
    byKey.get(key).items.push(r);
  }
  return groups;
}

/** Talep kartındaki zaman: bugün saat, sonra "dün 14:05", sonra tarih. */
export function requestTime(value, now = new Date()) {
  if (!value) return "";
  const d = new Date(value);
  const hm = d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
  const diff = Math.round((startOfDay(now) - startOfDay(d)) / 86400000);
  if (diff <= 0) return hm;
  if (diff === 1) return `dün ${hm}`;
  return `${d.toLocaleDateString("tr-TR", { day: "numeric", month: "short" })} ${hm}`;
}

const SAFE_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);

/**
 * Eylem düğmesinin planı.
 *   { kind: "api", method, path, body, confirm: { title, message, confirmLabel, danger } }
 *   { kind: "web", path }   — site sayfası tarayıcıda açılır
 *   null                    — uygulamada yapılacak bir şey yok
 * Yalnız kendi API'mize ("/api/...") istek atılır; dış adresler reddedilir.
 */
export function actionPlan(action) {
  if (!action) return null;
  const api = action.api;
  if (api && typeof api.url === "string" && /^\/api\//.test(api.url)) {
    const method = String(api.method || "POST").toUpperCase();
    if (SAFE_METHODS.has(method)) {
      const label = action.label || "İşlem";
      return {
        kind: "api",
        method,
        path: api.url,
        body: api.body && typeof api.body === "object" ? api.body : {},
        confirm: {
          title: `${label}?`,
          message: api.confirm || `“${label}” işlemi yapılsın mı?`,
          confirmLabel: label,
          danger: action.style === "danger",
        },
      };
    }
  }
  if (typeof action.web === "string" && action.web.startsWith("/")) return { kind: "web", path: action.web };
  return null;
}

/** Kartın düğmeleri: API eylemleri (onay/ret) önde, site bağlantıları sonda. */
export function splitActions(actions) {
  const list = (actions || []).map((a) => ({ action: a, plan: actionPlan(a) })).filter((x) => x.plan);
  return { api: list.filter((x) => x.plan.kind === "api"), web: list.filter((x) => x.plan.kind === "web") };
}

/** Eylemden sonra gösterilecek kısa sonuç metni. */
export function actionResultText(action, res) {
  if (res?.data?.message) return String(res.data.message);
  return `${action?.label || "İşlem"}: tamamlandı.`;
}

/** Elle kapatma isteğinin gövdesi. */
export const dismissBody = (label = "Kapatıldı") => ({ label: String(label || "Kapatıldı").slice(0, 160) });

/** Talebin kim tarafından geldiği ve nereye bağlandığı: takım → Rehber, üye → site üye kartı. */
export function actorTarget(item) {
  if (!item) return null;
  if (item.team_id) return { kind: "team", teamId: Number(item.team_id), label: item.actor?.name || "Takım" };
  if (item.actor_user_id) return { kind: "member", path: `/yonetim/admin/kullanicilar?uye=${encodeURIComponent(item.actor_user_id)}`, label: item.actor?.name || `Üye #${item.actor_user_id}` };
  return null;
}

/** Kenar çubuğu rozeti metni. */
export const badgeText = (n) => (Number(n) > 0 ? (Number(n) > 99 ? "99+" : String(Number(n))) : null);
