// Yayın Stüdyosu — KISAYOL ŞERİDİ modeli (saf; localStorage "studio.rail.v1").
//
// Sol kenardaki iki sütunlu ızgara: her öğe { id, type, size: 1 | 2, opts? }.
//   size 1 = 1 hücre (1×1), size 2 = 4 hücre (2×2). Sıra = ızgaradaki sıra
//   (CSS grid-auto-flow: dense boşlukları doldurur).
// Katalog (RAIL_WIDGETS) her parçacığın adını, simgesini, grubunu ve varsayılan
// boyutunu tanımlar; parçacıkların kendisi ./widgets.jsx'tedir. "scene" türü
// birden çok kez eklenebilir (opts.sceneId), diğerleri bir kez.
export const RAIL_KEY = "studio.rail.v1";

export const RAIL_GROUPS = [
  { key: "yayin", label: "Yayın ve geçiş" },
  { key: "olay", label: "Tekrar, VAR ve olaylar" },
  { key: "grafik", label: "Grafikler" },
  { key: "diger", label: "Sahneler, LED ve ses" },
];

export const RAIL_WIDGETS = [
  { type: "golive", label: "Yayın", icon: "broadcast", group: "yayin", size: 2, hint: "Yayını başlat / durdur, süre ve durum" },
  { type: "mic", label: "Mikrofon", icon: "mic", group: "yayin", size: 1, hint: "Mikrofonu aç / kapat, ses seviyesi", hotkey: "mic" },
  { type: "transition", label: "Geçiş", icon: "chevronRight", group: "yayin", size: 1, hint: "Önizlemeyi yayına al (büyükte geçiş türü)", hotkey: "transition" },
  { type: "lastScene", label: "Son sahne", icon: "undo", group: "yayin", size: 1, hint: "Bir önceki sahneye dön", hotkey: "lastScene" },
  { type: "chapter", label: "Bölüm", icon: "flag", group: "yayin", size: 1, hint: "YouTube bölüm işareti", hotkey: "chapter" },
  { type: "fullscreen", label: "Tam ekran", icon: "overview", group: "yayin", size: 1, hint: "Programı (ya da önizlemeyi) tam ekran göster", hotkey: "fullscreen" },
  { type: "replay", label: "Tekrar", icon: "repeat", group: "olay", size: 2, hint: "Son tekrarın açılarını seç, önizle, yayına ver", hotkey: "replay" },
  { type: "moment", label: "Önemli an", icon: "star", group: "olay", size: 1, hint: "Son saniyeleri tekrar olarak kaydet", hotkey: "moment" },
  { type: "var", label: "VAR", icon: "target", group: "olay", size: 1, hint: "VAR kontrolünü aç / kapat", hotkey: "var" },
  { type: "event", label: "Olay gir", icon: "pencil", group: "olay", size: 1, hint: "Olay türü → oyuncu → kaydet", hotkey: "event" },
  { type: "goalHome", label: "Ev sahibi GOL", icon: "ball", group: "olay", size: 1, hint: "Ev sahibine gol (golcü seçilir)", hotkey: "goalHome" },
  { type: "goalAway", label: "Deplasman GOL", icon: "ball", group: "olay", size: 1, hint: "Deplasmana gol (golcü seçilir)", hotkey: "goalAway" },
  { type: "goalMusic", label: "Gol müziği", icon: "music", group: "olay", size: 1, hint: "Gol müziğini çal / durdur", hotkey: "goalMusic" },
  { type: "scoreboard", label: "Skorbord", icon: "trophy", group: "grafik", size: 2, hint: "Skorbord çeşidini değiştir" },
  { type: "subtitle", label: "Altyazı", icon: "list", group: "grafik", size: 1, hint: "Altyazı şeridini aç / kapat", hotkey: "subtitle" },
  { type: "interviewBand", label: "Röportaj bandı", icon: "users", group: "grafik", size: 1, hint: "Röportaj bandını yayına al / kaldır", hotkey: "interviewBand" },
  { type: "ledMode", label: "LED içeriği", icon: "grid", group: "grafik", size: 1, hint: "Sahadaki LED ekranın içeriği" },
  { type: "interview", label: "Röportaj kaydı", icon: "mic", group: "diger", size: 1, hint: "Röportaj kaydını başlat / bitir", hotkey: "interview" },
  { type: "led", label: "LED çıkışı", icon: "overview", group: "diger", size: 1, hint: "LED ekranda ne görünsün, aç / kapat" },
  { type: "ready", label: "Hazır ekranlar", icon: "clock", group: "diger", size: 2, hint: "Başlıyor · Devre arası · Bitti" },
  { type: "scene", label: "Sahne", icon: "layers", group: "diger", size: 1, hint: "Tık: önizleme · çift tık: yayın", multi: true },
];

export const widgetOf = (type) => RAIL_WIDGETS.find((w) => w.type === type) || null;

/** Varsayılan şerit: en sık kullanılanlar yukarıda. */
export const DEFAULT_RAIL = [
  { id: "w_golive", type: "golive", size: 2 },
  { id: "w_mic", type: "mic", size: 1 },
  { id: "w_var", type: "var", size: 1 },
  { id: "w_replay", type: "replay", size: 2 },
  { id: "w_moment", type: "moment", size: 1 },
  { id: "w_event", type: "event", size: 1 },
  { id: "w_goalHome", type: "goalHome", size: 1 },
  { id: "w_goalAway", type: "goalAway", size: 1 },
  { id: "w_scoreboard", type: "scoreboard", size: 2 },
  { id: "w_subtitle", type: "subtitle", size: 1 },
  { id: "w_interview", type: "interview", size: 1 },
  { id: "w_chapter", type: "chapter", size: 1 },
  { id: "w_led", type: "led", size: 1 },
];

let seq = 0;
export const newWidgetId = (type) => `w_${type}_${Date.now().toString(36)}${(seq++).toString(36)}`;

/** Bozuk / bilinmeyen kayıtları ayıklar; tek örnekli türlerin kopyalarını atar. */
export function normalizeRail(raw) {
  const list = Array.isArray(raw) ? raw : Array.isArray(raw?.items) ? raw.items : null;
  if (!list) return DEFAULT_RAIL.map((x) => ({ ...x }));
  const seen = new Set();
  const ids = new Set();
  const out = [];
  for (const it of list) {
    const w = widgetOf(it?.type);
    if (!w) continue;
    const key = w.multi ? `${w.type}:${it.opts?.sceneId || ""}` : w.type;
    if (seen.has(key)) continue;
    seen.add(key);
    let id = typeof it.id === "string" && it.id ? it.id : newWidgetId(w.type);
    if (ids.has(id)) id = newWidgetId(w.type);
    ids.add(id);
    out.push({ id, type: w.type, size: it.size === 2 ? 2 : 1, ...(it.opts && typeof it.opts === "object" ? { opts: { ...it.opts } } : {}) });
  }
  return out;
}

export function loadRail(storage) {
  try {
    const raw = storage?.getItem(RAIL_KEY);
    if (raw) return normalizeRail(JSON.parse(raw));
  } catch { /* yoksay */ }
  return normalizeRail(null);
}
export function saveRail(storage, items) {
  try { storage?.setItem(RAIL_KEY, JSON.stringify({ v: 1, items })); return true; } catch { return false; }
}

/** Katalogdan ekle (sona). Tek örnekli tür zaten varsa liste değişmez. */
export function addWidget(items, type, { size, opts } = {}) {
  const w = widgetOf(type);
  if (!w) return items;
  if (!w.multi && items.some((x) => x.type === type)) return items;
  if (w.multi && opts?.sceneId && items.some((x) => x.type === type && x.opts?.sceneId === opts.sceneId)) return items;
  return [...items, { id: newWidgetId(type), type, size: size === 2 || (size == null && w.size === 2) ? 2 : 1, ...(opts ? { opts } : {}) }];
}
export const removeWidget = (items, id) => items.filter((x) => x.id !== id);
export const resizeWidget = (items, id, size) => items.map((x) => (x.id === id ? { ...x, size: size === 2 ? 2 : 1 } : x));
export const toggleWidgetSize = (items, id) => items.map((x) => (x.id === id ? { ...x, size: x.size === 2 ? 1 : 2 } : x));

/** Sürükle-bırak: id'li öğeyi hedef öğenin yerine taşır (hedef null → sona). */
export function moveWidget(items, id, beforeId) {
  const from = items.findIndex((x) => x.id === id);
  if (from < 0 || id === beforeId) return items;
  const next = [...items];
  const [it] = next.splice(from, 1);
  const to = beforeId ? next.findIndex((x) => x.id === beforeId) : next.length;
  // Aşağı taşırken hedefin ARKASINA, yukarı taşırken ÖNÜNE yerleşir (beklenen davranış).
  const at = to < 0 ? next.length : from <= to ? to + 1 : to;
  next.splice(Math.min(at, next.length), 0, it);
  return next;
}

/** Katalogda eklenebilir mi (tek örnekli ve zaten ekliyse hayır). */
export const canAdd = (items, type) => Boolean(widgetOf(type)?.multi) || !items.some((x) => x.type === type);
