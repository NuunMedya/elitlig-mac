// Masaüstü widget'ları — SAF parçalar: katalog, kayıt biçimi, yerleşim hesapları.
// Electron'a dokunmaz; app/widgets/index.js kullanır, app/test/widgets.test.js sınar.
"use strict";

/**
 * macOS masaüstü widget'ları gibi standart boyut ailesi ve ızgara: hücre 170 nokta, aralık 24.
 *   küçük 170×170 · orta 364×170 · büyük 364×364 · ekstra büyük 752×364
 * Her tür bu boyutlardan desteklediklerini seçer (ilk sıradaki varsayılandır). Araç çubuğu (dock)
 * ızgara dışı yatay şerittir.
 */
const GRID = Object.freeze({ unit: 170, gap: 24, margin: 24 });
const STEP = GRID.unit + GRID.gap;
const SIZE_DIMS = Object.freeze({ small: [170, 170], medium: [364, 170], large: [364, 364], xlarge: [752, 364] });
const SIZE_LABELS = Object.freeze({ small: "Küçük", medium: "Orta", large: "Büyük", xlarge: "Ekstra büyük" });
const SIZE_KEYS = Object.keys(SIZE_DIMS);
const SZ = (...keys) => Object.fromEntries(keys.map((k) => [k, SIZE_DIMS[k]]));

/**
 * Widget türleri. sizes: desteklenen boyutlar → [genişlik, yükseklik] (nokta / DIP); ilk anahtar
 * varsayılan. session: oturum gerekir (sunucu verisi). net: internet gerekir. interactive: tıklanır /
 * yazılır (etkileşimsiz "masaüstüne göm" katmanına konamaz).
 */
const CATALOG = [
  { type: "clock", category: "time", label: "Saat ve tarih", icon: "clock", hint: "Yerel saat, tarih ve dünya saatleri", settings: true, sizes: SZ("small", "medium") },
  { type: "agenda", category: "time", label: "Ajanda", icon: "calendar", hint: "Bugün ve yarının etkinlikleri", session: true, interactive: true, sizes: SZ("small", "medium", "large") },
  { type: "week", category: "time", label: "Haftalık ajanda", icon: "calendar", hint: "Bu haftanın 7 günü: etkinlikler ve proje adımları", session: true, interactive: true, sizes: SZ("medium", "large", "xlarge") },
  { type: "month", category: "time", label: "Takvim (ay)", icon: "calendar", hint: "Ay görünümü; dolu günler işaretli, güne tıkla", session: true, interactive: true, sizes: SZ("small", "medium", "large") },
  { type: "timer", category: "time", label: "Sayaç / odak", icon: "timer", hint: "Odak sayacı, zamanlayıcı, kronometre", interactive: true, sizes: SZ("small", "medium") },
  { type: "focus", category: "time", label: "Odak sayacı", icon: "target", hint: "Pomodoro halkası, tur, mola; başlat / atla / sıfırla", interactive: true, sizes: SZ("small", "medium") },

  { type: "messages", category: "comm", label: "Mesajlar", icon: "message", hint: "Okunmamış, son sohbetler ve hızlı yanıt; üye mesajları", session: true, interactive: true, settings: true, sizes: SZ("medium", "small", "large") },
  { type: "requests", category: "comm", label: "Talepler", icon: "inbox", hint: "Bekleyen talep sayısı, türlere göre", session: true, interactive: true, sizes: SZ("small", "medium") },

  { type: "today", category: "work", label: "Bugün özeti", icon: "sun", hint: "Bugünün işleri, etkinlikleri ve ödemeleri", session: true, interactive: true, sizes: SZ("medium", "small", "large") },
  { type: "todos", category: "work", label: "Yapılacaklar", icon: "checkSquare", hint: "Bugün / geciken / tümü, proje süzgeci; işaretlenebilir", session: true, interactive: true, settings: true, sizes: SZ("small", "medium", "large") },
  { type: "projects", category: "work", label: "Projeler", icon: "layers", hint: "Aktif projeler: evre, ilerleme, yaklaşan adımlar", session: true, interactive: true, sizes: SZ("medium", "small", "large") },
  { type: "quickadd", category: "work", label: "Hızlı kayıt", icon: "zap", hint: "Tek satırda görev, not ya da gider", session: true, interactive: true, sizes: SZ("medium") },
  { type: "notes", category: "work", label: "Sabit notlar", icon: "pin", hint: "Sabitlenen notlar ve hızlı not", session: true, interactive: true, sizes: SZ("small", "medium", "large") },
  { type: "note", category: "work", label: "Karalama", icon: "note", hint: "Karalama alanı, son notlar ve yeni not", interactive: true, sizes: SZ("small", "medium", "large") },
  { type: "contacts", category: "work", label: "Rehber", icon: "users", hint: "Favori kişiler: ara, WhatsApp, e-posta", session: true, interactive: true, sizes: SZ("small", "medium", "large") },
  { type: "equipment", category: "work", label: "Ekipman", icon: "box", hint: "Zimmetim, geciken iadeler, bakımı gelenler", session: true, interactive: true, sizes: SZ("small", "medium", "large") },

  { type: "ledger", category: "finance", label: "Muhasebe", icon: "wallet", hint: "Bu ay gelir / gider / net, alacak, borç, yaklaşan ödemeler", session: true, interactive: true, sizes: SZ("small", "medium", "large") },
  { type: "rates", category: "finance", label: "Döviz kurları", icon: "swap", hint: "USD, EUR, GBP… → ₺", net: true, settings: true, sizes: SZ("small", "medium") },

  { type: "livematch", category: "sport", label: "Canlı maç", icon: "ball", hint: "Seçtiğin maçın skorunu izle", net: true, interactive: true, settings: true, sizes: SZ("small", "medium") },
  { type: "matches", category: "sport", label: "Yaklaşan maçlar", icon: "ball", hint: "Elitlig canlı ve yaklaşan maçlar", net: true, interactive: true, settings: true, sizes: SZ("small", "medium", "large") },
  { type: "standings", category: "sport", label: "Puan durumu", icon: "trophy", hint: "Lig seç; sıra, oynanan, averaj, puan", net: true, interactive: true, settings: true, sizes: SZ("medium", "large") },

  { type: "studio", category: "media", label: "Yayın Stüdyosu", icon: "broadcast", hint: "Yayında mı, süre, bit hızı, bağlantı", interactive: true, sizes: SZ("small", "medium") },
  { type: "music", category: "media", label: "Müzik çalar", icon: "music", hint: "Çalan parça ve denetimler", interactive: true, sizes: SZ("small", "medium") },
  { type: "clipboard", category: "media", label: "Pano", icon: "clipboard", hint: "Son kopyalananlar; tıkla, yeniden kopyala", interactive: true, sizes: SZ("medium", "large") },

  { type: "launcher", category: "access", label: "Başlatıcı", icon: "grid", hint: "Tüm araçlar tek tıkla + yeni görev / gider / not", interactive: true, sizes: SZ("small", "medium", "large") },
  { type: "dock", category: "access", label: "Araç çubuğu", icon: "toolbox", hint: "Dock benzeri yatay şerit: sık araçlar", interactive: true, bar: true, sizes: { small: [470, 74], medium: [720, 88] } },

  { type: "system", category: "info", label: "Sistem", icon: "activity", hint: "İşlemci, bellek, disk ve pil", sizes: SZ("small", "medium") },
  { type: "weather", category: "info", label: "Hava durumu", icon: "sun", hint: "Şehir seçilir; Open-Meteo (anahtarsız)", net: true, settings: true, sizes: SZ("small", "medium", "large") },
];
/** Galeri kategorileri (sırasıyla). */
const CATEGORIES = [
  { key: "access", label: "Hızlı erişim" },
  { key: "comm", label: "Mesajlar" },
  { key: "work", label: "İş araçları" },
  { key: "time", label: "Zaman ve takvim" },
  { key: "finance", label: "Finans" },
  { key: "sport", label: "Spor" },
  { key: "media", label: "Medya ve yayın" },
  { key: "info", label: "Bilgi ve sistem" },
];
const TYPES = new Set(CATALOG.map((c) => c.type));
/** Ayarlar paneli olan türler (⋯ menüsünde "Ayarlar…"). */
const WITH_SETTINGS = new Set(CATALOG.filter((c) => c.settings).map((c) => c.type));
const catalogOf = (type) => CATALOG.find((c) => c.type === type) || null;
/**
 * Katmanlar: desktop (varsayılan — masaüstü katmanı: diğer pencerelerin altında kalır, tıklayınca odak /
 * öne gelme yok, etkileşimli), normal (sıradan pencere), top (üstte sabit), embed (yalnız macOS: masaüstü
 * düzeyine gömülü, etkileşimsiz). Ayrıntı: app/widgets/layer.js.
 */
const LEVELS = ["desktop", "normal", "top", "embed"];
const STORE_VERSION = 2;
const MATERIALS = ["auto", "glass", "soft"];
const THEMES = ["auto", "light", "dark"];

const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const cleanId = (v) => (typeof v === "string" && /^[a-z0-9]{4,24}$/i.test(v) ? v : null);

/** Türe özgü seçenekleri süz (yalnız bilinen alanlar, sınırlı uzunluk). */
function normalizeOptions(type, o) {
  const x = o && typeof o === "object" ? o : {};
  const str = (v, n = 80) => String(v == null ? "" : v).slice(0, n);
  switch (type) {
    case "clock": return { zones: (Array.isArray(x.zones) ? x.zones : ["Europe/London", "America/New_York"]).map((z) => str(z, 60)).filter((z) => /^[A-Za-z_]+(\/[A-Za-z0-9_+-]+){0,2}$/.test(z)).slice(0, 4), seconds: Boolean(x.seconds) };
    case "weather": return { city: str(x.city || "Ankara", 60).trim() || "Ankara" };
    case "rates": return { codes: (Array.isArray(x.codes) ? x.codes : ["USD", "EUR", "GBP"]).map((c) => str(c, 8).trim().toUpperCase()).filter((c, i, a) => /^[A-Z]{3}$/.test(c) && c !== "TRY" && a.indexOf(c) === i).slice(0, 6) };
    case "matches": return { city: str(x.city, 40).trim() };
    case "note": return { text: str(x.text, 4000) };
    case "messages": return { source: ["all", "personal", "inbox"].includes(x.source) ? x.source : "all", reply: x.reply == null ? true : Boolean(x.reply) };
    case "todos": return { filter: ["today", "overdue", "upcoming", "all"].includes(x.filter) ? x.filter : "today", project: Number.isInteger(Number(x.project)) && Number(x.project) > 0 ? Number(x.project) : null };
    case "livematch": return { matchId: Number.isInteger(Number(x.matchId)) && Number(x.matchId) > 0 ? Number(x.matchId) : null, label: str(x.label, 100) };
    case "standings": return { leagueId: Number(x.leagueId) > 0 ? Math.round(Number(x.leagueId)) : null, seasonId: Number(x.seasonId) > 0 ? Math.round(Number(x.seasonId)) : null, leagueName: str(x.leagueName, 80), team: str(x.team, 60) };
    case "launcher":
    case "dock": return { tools: Array.isArray(x.tools) ? x.tools.map((t) => str(t, 20)).filter((t, i, a) => /^[a-z]+$/.test(t) && a.indexOf(t) === i).slice(0, 16) : null };
    default: return {};
  }
}

/** Türün desteklediği boyut; değilse varsayılan (ilk). */
function sizeKeyOf(type, size) {
  const c = catalogOf(type);
  if (!c) return "small";
  return Object.prototype.hasOwnProperty.call(c.sizes, size) ? size : Object.keys(c.sizes)[0];
}

/** Kayıtlı bir widget'ı süz; geçersizse null. */
function normalizeItem(it) {
  if (!it || typeof it !== "object" || !TYPES.has(it.type)) return null;
  const id = cleanId(it.id);
  if (!id) return null;
  return {
    id,
    type: it.type,
    x: Math.round(num(it.x, 0)),
    y: Math.round(num(it.y, 0)),
    size: sizeKeyOf(it.type, it.size),
    opacity: Math.round(clamp(num(it.opacity, 92), 30, 100)),
    locked: Boolean(it.locked),
    level: LEVELS.includes(it.level) ? it.level : "desktop",
    disp: it.disp && Number.isFinite(Number(it.disp.id)) ? { id: Number(it.disp.id), rx: clamp(num(it.disp.rx, 0), 0, 1), ry: clamp(num(it.disp.ry, 0), 0, 1) } : null,
    options: normalizeOptions(it.type, it.options),
  };
}

/**
 * userData/widgets.json → { v, visible, theme, grid, dim, material, atLogin, items }.
 * Sürüm 1'den geçiş: eski "desktop" (gömülü, etkileşimsiz) → "embed"; eski varsayılan "normal" → yeni
 * varsayılan "desktop" (masaüstü katmanı).
 */
function normalizeStore(input) {
  const x = input && typeof input === "object" ? input : {};
  const legacy = !(Number(x.v) >= STORE_VERSION);
  const seen = new Set();
  const items = [];
  for (const raw0 of Array.isArray(x.items) ? x.items : []) {
    const raw = legacy && raw0 && typeof raw0 === "object" ? { ...raw0, level: raw0.level === "desktop" ? "embed" : raw0.level === "top" ? "top" : "desktop" } : raw0;
    const it = normalizeItem(raw);
    if (it && !seen.has(it.id)) { seen.add(it.id); items.push(it); }
    if (items.length >= 24) break;
  }
  return {
    v: STORE_VERSION,
    visible: x.visible == null ? true : Boolean(x.visible),
    theme: THEMES.includes(x.theme) ? x.theme : "auto",
    grid: x.grid == null ? true : Boolean(x.grid),
    dim: Boolean(x.dim),
    material: MATERIALS.includes(x.material) ? x.material : "auto",
    atLogin: Boolean(x.atLogin),
    items,
  };
}

/** Widget boyutu (seçili boyuta göre). */
function sizeOf(item) {
  const c = catalogOf(item.type);
  const [width, height] = (c && c.sizes[item.size]) || [240, 160];
  return { width, height };
}

const overlap = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/**
 * Yeni widget'ın yeri: birincil ekranın çalışma alanında sağ üstten başlayarak, var olan
 * widget'larla çakışmayan ilk boşluk (sütun sütun sola doğru). Boşluk yoksa basamaklı.
 */
function placeNew(size, existing, workArea, margin = 16) {
  const wa = workArea;
  for (let col = 0; col < 8; col += 1) {
    const x = wa.x + wa.width - margin - size.width - col * (size.width + margin);
    if (x < wa.x + margin) break;
    for (let y = wa.y + margin; y + size.height <= wa.y + wa.height - margin; y += 12) {
      const r = { x, y, width: size.width, height: size.height };
      const hit = existing.find((e) => overlap({ x: r.x - margin / 2, y: r.y - margin / 2, width: r.width + margin, height: r.height + margin }, e));
      if (!hit) return { x, y };
      y = hit.y + hit.height + margin - 12; // çakışanın altına atla
    }
  }
  const n = existing.length % 10;
  return { x: wa.x + wa.width - margin - size.width - n * 24, y: wa.y + margin + n * 24 };
}

/**
 * Kayıtlı konum hâlâ bir ekranda görünüyor mu? Görünmüyorsa (ekran çıkarıldı) en yakın
 * ekranın çalışma alanına sığdırılır. En az `keep` piksel görünür kalmalı.
 */
function clampToDisplays(rect, displays, keep = 48) {
  if (!displays.length) return { x: rect.x, y: rect.y };
  const visible = displays.some((d) => {
    const a = d.workArea;
    const w = Math.min(rect.x + rect.width, a.x + a.width) - Math.max(rect.x, a.x);
    const h = Math.min(rect.y + rect.height, a.y + a.height) - Math.max(rect.y, a.y);
    return w >= Math.min(keep, rect.width) && h >= Math.min(keep, rect.height) && rect.y >= a.y - 4;
  });
  if (visible) return { x: rect.x, y: rect.y };
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  let best = displays[0];
  let bestD = Infinity;
  for (const d of displays) {
    const a = d.workArea;
    const dx = Math.max(a.x - cx, 0, cx - (a.x + a.width));
    const dy = Math.max(a.y - cy, 0, cy - (a.y + a.height));
    const dist = dx * dx + dy * dy;
    if (dist < bestD) { bestD = dist; best = d; }
  }
  const a = best.workArea;
  return {
    x: Math.round(clamp(rect.x, a.x, a.x + Math.max(0, a.width - rect.width))),
    y: Math.round(clamp(rect.y, a.y, a.y + Math.max(0, a.height - rect.height))),
  };
}

/**
 * Boyut büyüyünce (küçük → orta) pencere ekrandan taşmasın: sağ / alt kenardan taşıyorsa
 * içinde kaldığı ekranın çalışma alanına geri itilir (sol / üst kenar korunur).
 */
function fitInWorkArea(rect, displays, margin = 8) {
  const cx = rect.x + Math.min(rect.width, 48) / 2;
  const cy = rect.y + 10;
  const d = (displays || []).find((x) => cx >= x.workArea.x && cx < x.workArea.x + x.workArea.width && cy >= x.workArea.y && cy < x.workArea.y + x.workArea.height) || (displays || [])[0];
  if (!d) return { x: rect.x, y: rect.y };
  const a = d.workArea;
  return {
    x: Math.round(Math.max(a.x, Math.min(rect.x, a.x + a.width - rect.width - margin))),
    y: Math.round(Math.max(a.y, Math.min(rect.y, a.y + a.height - rect.height - margin))),
  };
}

/* ------------------------------ ızgara ------------------------------ */

/** Dikdörtgenin merkezinin düştüğü ekran (yoksa en yakın / ilk). */
function displayOf(rect, displays) {
  const list = displays || [];
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + Math.min(rect.height, 40) / 2;
  const inside = list.find((d) => { const a = d.workArea; return cx >= a.x && cx < a.x + a.width && cy >= a.y && cy < a.y + a.height; });
  if (inside) return inside;
  let best = list[0] || null;
  let bestD = Infinity;
  for (const d of list) {
    const a = d.workArea;
    const dx = Math.max(a.x - cx, 0, cx - (a.x + a.width));
    const dy = Math.max(a.y - cy, 0, cy - (a.y + a.height));
    if (dx * dx + dy * dy < bestD) { bestD = dx * dx + dy * dy; best = d; }
  }
  return best;
}

/** Çalışma alanında ızgara sütun / satır sayısı (bu boyut için son geçerli hücre). */
function gridSpan(size, wa) {
  return {
    cols: Math.max(0, Math.floor((wa.width - 2 * GRID.margin - size.width) / STEP)),
    rows: Math.max(0, Math.floor((wa.height - 2 * GRID.margin - size.height) / STEP)),
  };
}
const cellPos = (wa, col, row) => ({ x: wa.x + GRID.margin + col * STEP, y: wa.y + GRID.margin + row * STEP });

/** En yakın ızgara hücresine hizala (ekran içinde kalır). */
function snapToGrid(rect, wa) {
  const span = gridSpan(rect, wa);
  const col = clamp(Math.round((rect.x - wa.x - GRID.margin) / STEP), 0, span.cols);
  const row = clamp(Math.round((rect.y - wa.y - GRID.margin) / STEP), 0, span.rows);
  return cellPos(wa, col, row);
}

/**
 * Sürükleme bitince yerleşim: ızgaraya hizala; başka widget'la çakışırsa aynı ekrandaki en yakın boş
 * hücreye geç (macOS'taki gibi widget'lar üst üste binmez). grid=false: yalnız ekrana sığdır.
 */
function arrange(rect, others, displays, { grid = true } = {}) {
  const d = displayOf(rect, displays);
  if (!d) return { x: rect.x, y: rect.y };
  const wa = d.workArea;
  if (!grid) return fitInWorkArea(rect, [d], 0);
  const first = snapToGrid(rect, wa);
  const free = (p) => !others.some((o) => overlap({ ...p, width: rect.width, height: rect.height }, o));
  if (free(first)) return first;
  const span = gridSpan(rect, wa);
  let best = null;
  let bestD = Infinity;
  for (let col = 0; col <= span.cols; col += 1) {
    for (let row = 0; row <= span.rows; row += 1) {
      const p = cellPos(wa, col, row);
      if (!free(p)) continue;
      const dd = (p.x - rect.x) ** 2 + (p.y - rect.y) ** 2;
      if (dd < bestD) { bestD = dd; best = p; }
    }
  }
  return best || first;
}

/** Yeni widget: birincil ekranda sağ üstten başlayarak ilk boş ızgara hücresi (sütun sütun sola). */
function placeOnGrid(size, existing, wa) {
  const span = gridSpan(size, wa);
  for (let col = span.cols; col >= 0; col -= 1) {
    for (let row = 0; row <= span.rows; row += 1) {
      const p = cellPos(wa, col, row);
      if (!existing.some((e) => overlap({ ...p, ...size }, e))) return p;
    }
  }
  return placeNew(size, existing, wa);
}

/** Ekran içi oransal konum (çözünürlük değişince korunur). */
function relativePos(rect, display) {
  const a = display.workArea;
  return { id: display.id, rx: clamp((rect.x - a.x) / Math.max(1, a.width - rect.width), 0, 1), ry: clamp((rect.y - a.y) / Math.max(1, a.height - rect.height), 0, 1) };
}

/**
 * Kayıtlı widget'ın konumu: kaydedildiği ekran hâlâ bağlıysa o ekranda oransal konumdan (çözünürlük
 * değiştiyse oran korunur, ızgaraya hizalanır); ekran çıkarıldıysa görünür alana çekilir.
 */
function resolvePosition(item, size, displays, { grid = true } = {}) {
  const d = item.disp ? (displays || []).find((x) => x.id === item.disp.id) : null;
  if (d) {
    const a = d.workArea;
    const rect = { x: Math.round(a.x + item.disp.rx * Math.max(0, a.width - size.width)), y: Math.round(a.y + item.disp.ry * Math.max(0, a.height - size.height)), ...size };
    return grid ? snapToGrid(rect, a) : fitInWorkArea(rect, [d], 0);
  }
  return clampToDisplays({ x: item.x, y: item.y, ...size }, displays || []);
}

/** Kısa rastgele kimlik. */
const newId = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);

module.exports = {
  CATALOG, CATEGORIES, WITH_SETTINGS, TYPES, LEVELS, THEMES, MATERIALS, GRID, SIZE_DIMS, SIZE_LABELS, SIZE_KEYS, STORE_VERSION,
  catalogOf, sizeKeyOf, normalizeOptions, normalizeItem, normalizeStore, sizeOf, placeNew, clampToDisplays, fitInWorkArea,
  displayOf, snapToGrid, arrange, placeOnGrid, relativePos, resolvePosition, newId,
};
