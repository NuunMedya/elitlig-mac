// Bugün panosu — SAF düzen modeli (renderer/test/today-dash.test.js sınar).
//
//   Durum  { v: 1, active: "<sayfa>", pages: [{ id, title, items: [Öğe] }] }
//   Öğe    { i, t, x, y, w, h, title?, accent?, head?, o? }
//            i  benzersiz kimlik · t  bileşen (registry id) · x/y/w/h  ızgara hücresi (12 sütun)
//            title  özel başlık · accent  vurgu rengi (#rrggbb) · head  false: başlık gizli · o  bileşen seçenekleri
//
// Kalıcılık: localStorage "today.dashboard.v1:<kullanıcı>" (Yayın Stüdyosu düzeni gibi; tarayıcı
// deposu yoksa bellekte çalışır). Eski / bozuk kayıt migrateState ile onarılır: bilinmeyen bileşen
// atılır, taşan öğe sığdırılır, yinelenen kimlik yenilenir. Kayıt yoksa varsayılan sayfalar
// (Genel = eski Bugün ekranının içeriği, Maç günü, Muhasebe) kurulur.
import { REGISTRY_MAP, TIERS, TIER_SIZES, defaultOptions, metaOf } from "./registry";

export const COLS = 12;
export const VERSION = 1;
export const STORAGE_PREFIX = "today.dashboard.v1";
export const MAX_PAGES = 12;
export const MAX_ITEMS = 120;
export const MAX_H = 16;
/** Görsel bileşeninin dosyadan gelen (küçültülmüş) veri adresi için üst sınır. */
export const MAX_IMAGE = 120000;
const LONG_KEYS = new Set(["buttons", "text", "items", "links"]);
const COLOR_RE = /^#[0-9a-f]{6}$/i;

const int = (v, d) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? n : d; };
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
let seq = 0;
export const newId = (p = "t") => `${p}${Date.now().toString(36)}${(seq += 1).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

/* ───────────────────────── boyut → kademe ───────────────────────── */

/**
 * Izgara boyutundan kademe: 1×1 / 2×1 / 1×2 düğme (xs); tek satırlık şerit en ≤ 4 küçük, daha
 * geniş şerit orta; tek sütun ya da alan ≤ 6 küçük; ≤ 16 orta; ≤ 36 büyük; üstü çok büyük.
 */
export function tierOf(w, h) {
  const W = Math.max(1, int(w, 1)), H = Math.max(1, int(h, 1));
  const a = W * H;
  if (a <= 2) return "xs";
  if (H === 1) return W <= 4 ? "s" : "m";
  if (W === 1) return "s";
  if (a <= 6) return "s";
  if (a <= 16) return "m";
  if (a <= 36) return "l";
  return "xl";
}
/** Bileşenin desteklediği kademeye indirger (yoksa en yakın küçük, o da yoksa en küçük desteklenen). */
export function effectiveTier(meta, w, h) {
  const t = tierOf(w, h);
  const list = meta?.tiers?.length ? meta.tiers : TIERS;
  if (list.includes(t)) return t;
  const idx = TIERS.indexOf(t);
  for (let k = idx - 1; k >= 0; k -= 1) if (list.includes(TIERS[k])) return TIERS[k];
  return list[0];
}
/** En küçük / en büyük boyut: bildirilmemişse kademelerden türetilir. */
const TIER_MIN = { xs: [1, 1], s: [2, 2], m: [3, 3], l: [4, 4], xl: [6, 5] };
export function sizeLimits(meta) {
  const tiers = meta?.tiers?.length ? meta.tiers : TIERS;
  const min = meta?.min || TIER_MIN[tiers[0]] || [1, 1];
  const max = meta?.max || [COLS, MAX_H];
  return { min, max };
}
/** Bir kademeye geçerken kullanılacak boyut (bileşenin sınırlarına sıkıştırılmış). */
export function sizeForTier(meta, tier) {
  const { min, max } = sizeLimits(meta);
  let [w, h] = TIER_SIZES[tier] || TIER_SIZES.m;
  // Varsayılan boyut o kademedeyse onu kullan (ör. hızlı görev şeridi 6×1).
  if (meta?.size && tierOf(meta.size[0], meta.size[1]) === tier) [w, h] = meta.size;
  return [clamp(w, min[0], Math.min(max[0], COLS)), clamp(h, min[1], max[1])];
}
/** Hazır boyutlar (düzenleme menüsü): en × boy, etiket. */
export const SIZE_PRESETS = [[1, 1], [2, 1], [3, 1], [6, 1], [12, 1], [2, 2], [3, 2], [4, 2], [3, 3], [4, 3], [6, 2], [4, 4], [6, 3], [6, 4], [8, 4], [6, 6], [8, 6], [12, 4], [12, 6]];

/* ───────────────────────── öğeler ───────────────────────── */

/** Öğeyi temizle; bilinmeyen bileşen → null. */
export function normalizeItem(raw, cols = COLS) {
  if (!raw || typeof raw !== "object") return null;
  const meta = metaOf(raw.t);
  if (!meta) return null;
  const { min, max } = sizeLimits(meta);
  const w = clamp(int(raw.w, meta.size[0]), Math.min(min[0], cols), Math.min(max[0], cols));
  const h = clamp(int(raw.h, meta.size[1]), min[1], Math.min(max[1], MAX_H));
  const x = clamp(int(raw.x, 0), 0, cols - w);
  const y = Math.max(0, int(raw.y, 0));
  const out = { i: String(raw.i || newId()).slice(0, 40), t: meta.id, x, y, w, h };
  if (typeof raw.title === "string" && raw.title.trim()) out.title = raw.title.trim().slice(0, 60);
  if (COLOR_RE.test(raw.accent || "")) out.accent = raw.accent.toLowerCase();
  if (raw.head === false) out.head = false;
  if (raw.o && typeof raw.o === "object" && !Array.isArray(raw.o)) {
    const o = {};
    for (const [k, v] of Object.entries(raw.o)) {
      if (["string", "number", "boolean"].includes(typeof v) || v === null) o[k] = typeof v === "string" ? v.slice(0, k === "src" && /^data:image\//.test(v) ? MAX_IMAGE : LONG_KEYS.has(k) ? 6000 : 2000) : v;
      else if (v && typeof v === "object") { try { const s = JSON.stringify(v); if (s.length < 4000) o[k] = JSON.parse(s); } catch { /* yoksay */ } }
    }
    if (Object.keys(o).length) out.o = o;
  }
  return out;
}
export const normalizeItems = (list, cols = COLS) => {
  const seen = new Set();
  const out = [];
  for (const raw of Array.isArray(list) ? list : []) {
    const it = normalizeItem(raw, cols);
    if (!it) continue;
    if (seen.has(it.i)) it.i = newId();
    seen.add(it.i);
    out.push(it);
    if (out.length >= MAX_ITEMS) break;
  }
  return out;
};

const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
/** İlk boş yer (yukarıdan aşağı, soldan sağa). */
export function findSpot(items, w, h, cols = COLS) {
  const cw = Math.min(cols, w);
  for (let y = 0; y < 400; y += 1) {
    for (let x = 0; x + cw <= cols; x += 1) {
      const box = { x, y, w: cw, h };
      if (!items.some((it) => overlaps(box, it))) return { x, y };
    }
  }
  return { x: 0, y: items.reduce((m, it) => Math.max(m, it.y + it.h), 0) };
}

/** Bileşen ekle (konum yoksa ilk boş yere, boyut yoksa bileşenin varsayılanı). */
export function addItem(items, t, { w = null, h = null, x = null, y = null, o = null, i = null, title, accent } = {}) {
  const meta = metaOf(t);
  if (!meta || items.length >= MAX_ITEMS) return items;
  const ww = w ?? meta.size[0], hh = h ?? meta.size[1];
  const spot = x == null || y == null ? findSpot(items, ww, hh) : { x, y };
  const it = normalizeItem({ i: i || newId(), t, w: ww, h: hh, ...spot, o: { ...defaultOptions(meta), ...(o || {}) }, title, accent });
  return it ? [...items, it] : items;
}
export const removeItem = (items, i) => items.filter((x) => x.i !== i);
export const patchItem = (items, i, patch) => items.map((x) => {
  if (x.i !== i) return x;
  const next = { ...x, ...patch, o: patch.o ? { ...(x.o || {}), ...patch.o } : x.o };
  if (patch.title === "" || patch.title === null) delete next.title;
  if (patch.accent === "" || patch.accent === null) delete next.accent;
  if (patch.head === true) delete next.head;
  return normalizeItem(next) || x;
});
export const resizeItem = (items, i, w, h) => items.map((x) => (x.i === i ? normalizeItem({ ...x, w, h }) || x : x));
export function setTier(items, i, tier) {
  const it = items.find((x) => x.i === i);
  if (!it) return items;
  const [w, h] = sizeForTier(metaOf(it.t), tier);
  return resizeItem(items, i, w, h);
}
/** Kopya: aynı boyut ve ayarlar, yeni kimlik; hemen sağına sığarsa oraya, yoksa ilk boş yere. */
export function duplicateItem(items, i) {
  const it = items.find((x) => x.i === i);
  if (!it) return items;
  const right = { x: it.x + it.w, y: it.y, w: it.w, h: it.h };
  const fits = right.x + right.w <= COLS && !items.some((o) => overlaps(right, o));
  const spot = fits ? { x: right.x, y: right.y } : findSpot(items, it.w, it.h);
  const copy = normalizeItem({ ...JSON.parse(JSON.stringify(it)), i: newId(), ...spot });
  return copy ? [...items, copy] : items;
}
/** react-grid-layout düzeni ([{ i, x, y, w, h }]) → öğeler (değişiklik yoksa aynı dizi). */
export function applyGrid(items, grid) {
  const by = new Map((grid || []).map((g) => [String(g.i), g]));
  let changed = false;
  const out = items.map((it) => {
    const g = by.get(it.i);
    if (!g || (g.x === it.x && g.y === it.y && g.w === it.w && g.h === it.h)) return it;
    changed = true;
    return normalizeItem({ ...it, x: g.x, y: g.y, w: g.w, h: g.h }) || it;
  });
  return changed ? out : items;
}

/**
 * Dar pencere düzeni: öğeler okuma sırasıyla (y, x) daha az sütuna yeniden dizilir; en oranla
 * küçülür (en az 1). Kademe saklanan boyuttan hesaplanır (dar pencerede işlev kaybolmaz).
 */
export function compactFor(items, cols) {
  if (cols >= COLS) return items.map(({ i, x, y, w, h }) => ({ i, x, y, w, h }));
  const k = cols / COLS;
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
  const placed = [];
  for (const it of sorted) {
    const w = clamp(Math.round(it.w * k) || 1, 1, cols);
    const ww = it.w >= COLS / 2 ? cols : Math.max(w, Math.min(cols, it.w <= 1 ? 1 : 2));
    const spot = findSpot(placed, ww, it.h, cols);
    placed.push({ i: it.i, x: spot.x, y: spot.y, w: ww, h: it.h });
  }
  return placed;
}
/**
 * Tuval eni ölçümü — salınım koruması. Kaydırma çubuğu belirip kaybolduğunda en iki değer arasında
 * gidip gelebilir (en → satır yüksekliği → içerik yüksekliği → kaydırma çubuğu → en). Aynı iki değer
 * kısa sürede (≤ 700 ms) A → B → A diye dönüyorsa küçük olanında sabitlenir; 2 pikselden küçük
 * değişiklikler yok sayılır. state: önceki çağrının döndürdüğü durum (ilk çağrıda null).
 */
export function settleWidth(state, measured, now = 0) {
  const hist = [...(state?.hist || []), { w: measured, t: now }].filter((x) => now - x.t <= 700).slice(-4);
  const cur = state?.width ?? measured;
  if (state?.locked && now - state.locked.t <= 1500 && (measured === state.locked.a || measured === state.locked.b)) return { width: Math.min(state.locked.a, state.locked.b), state: { ...state, hist } };
  if (Math.abs(measured - cur) < 2) return { width: cur, state: { width: cur, hist, locked: null } };
  const n = hist.length;
  if (n >= 3 && hist[n - 1].w === hist[n - 3].w && hist[n - 2].w !== hist[n - 1].w) {
    const a = hist[n - 1].w, b = hist[n - 2].w;
    const w = Math.min(a, b);
    return { width: w, state: { width: w, hist, locked: { a, b, t: now } } };
  }
  return { width: measured, state: { width: measured, hist, locked: null } };
}
/** Pencere enine göre sütun sayısı. */
export const colsForWidth = (width) => (width >= 760 ? COLS : width >= 520 ? 6 : 4);

/* ───────────────────────── şablonlar ───────────────────────── */

const I = (t, x, y, w, h, extra = {}) => ({ t, x, y, w, h, ...extra });
export const TEMPLATES = {
  genel: {
    title: "Genel", icon: "sun", hint: "Eski Bugün ekranı: özet, araçlar, işler, talepler, projeler, ajanda, muhasebe, notlar, odak",
    items: [
      I("hero", 0, 0, 12, 3), I("launcher", 0, 3, 12, 2), I("toolkit", 0, 5, 12, 1), I("quicktodo", 0, 6, 12, 1),
      I("todos", 0, 7, 8, 5), I("requests", 8, 7, 4, 5), I("followups", 0, 12, 4, 5), I("equipment", 4, 12, 4, 5), I("upcoming", 8, 12, 4, 5),
      I("balance", 0, 17, 4, 5), I("notes", 4, 17, 4, 5), I("focus", 8, 17, 4, 3), I("counts", 8, 20, 4, 2),
    ],
  },
  mac: {
    title: "Maç günü", icon: "ball", hint: "Günün maçları, canlı skor, görevliler, puan durumu, yayın, mesajlar",
    items: [
      I("route", 0, 0, 1, 1, { o: { route: "planning" } }), I("route", 1, 0, 1, 1, { o: { route: "studio" } }), I("action", 2, 0, 1, 1, { o: { action: "new-task" } }), I("download", 3, 0, 5, 1), I("clock", 8, 0, 2, 1), I("weather", 10, 0, 2, 1),
      I("matches", 0, 1, 8, 6), I("staffmatches", 8, 1, 4, 4), I("studio", 8, 5, 4, 2),
      I("standings", 0, 7, 6, 5), I("messages", 6, 7, 6, 5), I("quicktodo", 0, 12, 12, 1),
    ],
  },
  muhasebe: {
    title: "Muhasebe", icon: "wallet", hint: "Aylık özet, hızlı kayıt, düzenli ödemeler, bütçe, hesaplar, alacak / borç",
    items: [
      I("balance", 0, 0, 6, 4), I("quickledger", 6, 0, 6, 4),
      I("recurring", 0, 4, 4, 5), I("budget", 4, 4, 4, 5), I("receivables", 8, 4, 4, 5),
      I("accounts", 0, 9, 4, 4), I("trend", 4, 9, 8, 4),
      I("ledgerlist", 0, 13, 8, 5), I("rates", 8, 13, 4, 2), I("calc", 8, 15, 4, 3),
    ],
  },
  projeler: {
    title: "Projeler", icon: "layers", hint: "Proje etapları (düzenlenebilir), projelerim, takvim, takip",
    items: [
      I("newproject", 0, 0, 3, 2), I("quicktodo", 3, 0, 9, 1), I("route", 3, 1, 1, 1, { o: { route: "projects" } }), I("route", 4, 1, 1, 1, { o: { route: "agenda" } }),
      I("stages", 0, 2, 8, 7), I("projects", 8, 2, 4, 7),
      I("gantt", 0, 9, 8, 4), I("followups", 8, 9, 4, 4),
    ],
  },
  iletisim: {
    title: "İletişim", icon: "message", hint: "Mesajlar (gönder / yanıtla), talepler, rehber, hızlı not",
    items: [
      I("messages", 0, 0, 8, 7), I("requests", 8, 0, 4, 4), I("quicknote", 8, 4, 4, 3),
      I("contacts", 0, 7, 6, 3), I("sync", 6, 7, 3, 2), I("action", 9, 7, 1, 1, { o: { action: "new-chat" } }),
    ],
  },
  sade: {
    title: "Sade", icon: "grid", hint: "Yalnız düğmeler: tek tıkla her yere",
    items: [
      ...["todos", "agenda", "notes", "projects", "ledger", "messages", "contacts", "files", "studio", "toolkit", "sheets", "equipment"].map((r, n) => I("route", n, 0, 1, 1, { o: { route: r } })),
      I("action", 0, 1, 1, 1, { o: { action: "new-task" } }), I("action", 1, 1, 1, 1, { o: { action: "new-expense" } }), I("action", 2, 1, 1, 1, { o: { action: "new-note" } }), I("screenshot", 3, 1, 1, 1), I("download", 4, 1, 1, 1),
      I("messages", 5, 1, 1, 1), I("requests", 6, 1, 1, 1), I("balance", 7, 1, 2, 1), I("todos", 9, 1, 1, 1), I("focus", 10, 1, 1, 1), I("music", 11, 1, 1, 1),
    ],
  },
  bos: { title: "Boş sayfa", icon: "plus", hint: "Boş tuval: kütüphaneden ekleyin", items: [] },
};
export const DEFAULT_PAGES = ["genel", "mac", "muhasebe"];

export function pageFromTemplate(key, { id = null, title = null } = {}) {
  const tpl = TEMPLATES[key] || TEMPLATES.bos;
  const pid = id || newId("p");
  const items = normalizeItems(tpl.items.map((it, n) => ({ ...it, i: `${pid}-${n + 1}`, o: { ...defaultOptions(REGISTRY_MAP.get(it.t)), ...(it.o || {}) } })));
  return { id: pid, title: title || tpl.title, items };
}
export function defaultState() {
  const pages = DEFAULT_PAGES.map((k) => pageFromTemplate(k, { id: k }));
  return { v: VERSION, active: pages[0].id, pages };
}

/* ───────────────────────── durum, göç, kalıcılık ───────────────────────── */

export function normalizeState(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const ids = new Set();
  const pages = [];
  for (const p of Array.isArray(src.pages) ? src.pages : []) {
    if (!p || typeof p !== "object") continue;
    let id = String(p.id || "").slice(0, 40) || newId("p");
    if (ids.has(id)) id = newId("p");
    ids.add(id);
    pages.push({ id, title: String(p.title || "Sayfa").trim().slice(0, 40) || "Sayfa", items: normalizeItems(p.items) });
    if (pages.length >= MAX_PAGES) break;
  }
  if (!pages.length) return defaultState();
  const active = pages.some((p) => p.id === src.active) ? src.active : pages[0].id;
  return { v: VERSION, active, pages };
}

/**
 * Kayıttan durum: yok → varsayılan; v0 (tek sayfa { items }) ya da dizi → "Genel" sayfası;
 * v1 → temizlenmiş; daha yeni sürüm → okunabildiği kadarı (sayfalar yoksa varsayılan).
 */
export function migrateState(raw) {
  if (raw == null) return defaultState();
  if (Array.isArray(raw)) return normalizeState({ pages: [{ id: "genel", title: "Genel", items: raw }] });
  if (typeof raw !== "object") return defaultState();
  if (raw.v == null && Array.isArray(raw.items)) return normalizeState({ pages: [{ id: "genel", title: raw.title || "Genel", items: raw.items }] });
  return normalizeState(raw);
}

export const storageKey = (userId) => `${STORAGE_PREFIX}:${userId ?? "anon"}`;
export function loadState(storage, key) {
  try {
    const text = storage?.getItem(key);
    if (!text) return defaultState();
    return migrateState(JSON.parse(text));
  } catch { return defaultState(); }
}
export function saveState(storage, key, state) {
  try { storage?.setItem(key, JSON.stringify(normalizeState(state))); return true; } catch { return false; }
}

/* ───────────────────────── sayfa işlemleri ───────────────────────── */

export const activePage = (state) => state.pages.find((p) => p.id === state.active) || state.pages[0];
export const setActive = (state, id) => (state.pages.some((p) => p.id === id) ? { ...state, active: id } : state);
export function updateItems(state, pageId, fn) {
  return { ...state, pages: state.pages.map((p) => (p.id === pageId ? { ...p, items: fn(p.items) } : p)) };
}
export function addPage(state, templateKey = "bos", title = null) {
  if (state.pages.length >= MAX_PAGES) return state;
  const page = pageFromTemplate(templateKey, { title });
  return { ...state, pages: [...state.pages, page], active: page.id };
}
export function replacePage(state, pageId, templateKey) {
  return { ...state, pages: state.pages.map((p) => (p.id === pageId ? { ...pageFromTemplate(templateKey, { id: p.id }), title: p.title } : p)) };
}
export function renamePage(state, pageId, title) {
  const t = String(title || "").trim().slice(0, 40);
  if (!t) return state;
  return { ...state, pages: state.pages.map((p) => (p.id === pageId ? { ...p, title: t } : p)) };
}
export function removePage(state, pageId) {
  if (state.pages.length <= 1) return state;
  const idx = state.pages.findIndex((p) => p.id === pageId);
  if (idx < 0) return state;
  const pages = state.pages.filter((p) => p.id !== pageId);
  const active = state.active === pageId ? pages[Math.max(0, idx - 1)].id : state.active;
  return { ...state, pages, active };
}
export function movePage(state, pageId, dir) {
  const idx = state.pages.findIndex((p) => p.id === pageId);
  const j = idx + dir;
  if (idx < 0 || j < 0 || j >= state.pages.length) return state;
  const pages = [...state.pages];
  [pages[idx], pages[j]] = [pages[j], pages[idx]];
  return { ...state, pages };
}
