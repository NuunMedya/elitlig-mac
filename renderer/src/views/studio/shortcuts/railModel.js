// Yayın Stüdyosu — KISAYOL ŞERİDİ modeli (saf; localStorage "studio.rail.v1").
//
// Sol kenardaki iki sütunlu ızgara: her öğe { id, type, w, h, opts? }.
//   w × h (genişlik × yükseklik, hücre): 1×1, 1×2 (dar-uzun), 2×1 (geniş), 2×2.
//   Eski kayıtlar (size: 1 | 2) 1×1 / 2×2'ye göç eder. Sıra = ızgaradaki sıra
//   (CSS grid-auto-flow: dense boşlukları doldurur).
// Katalog (RAIL_WIDGETS): her ÇEŞİT ayrı bir giriştir (ör. Tekrar'ın 6 çeşidi:
// açı seçimi, "Son tekrarı ver", açı ızgarası, son 3 tekrar, ağır çekim, kuyruk);
// her biri izin verdiği boyutları (sizes) ve varsayılan boyutu (size) taşır.
// Parçacıkların kendisi ./widgets.jsx'tedir. "scene" türü birden çok kez
// eklenebilir (opts.sceneId), diğerleri bir kez.
export const RAIL_KEY = "studio.rail.v1";

export const RAIL_SIZES = {
  "1x1": { w: 1, h: 1, label: "1×1", hint: "küçük kare" },
  "1x2": { w: 1, h: 2, label: "1×2", hint: "dar ve uzun" },
  "2x1": { w: 2, h: 1, label: "2×1", hint: "geniş şerit" },
  "2x2": { w: 2, h: 2, label: "2×2", hint: "büyük panel" },
};
export const SIZE_KEYS = Object.keys(RAIL_SIZES);
const ALL = SIZE_KEYS;

export const RAIL_GROUPS = [
  { key: "yayin", label: "Yayın, ses ve geçiş" },
  { key: "tekrar", label: "Tekrar" },
  { key: "olay", label: "VAR, gol ve olaylar" },
  { key: "grafik", label: "Grafikler" },
  { key: "diger", label: "Sahneler, LED ve röportaj" },
];

/** family: aynı işlevin çeşitleri (katalogda yan yana, önizlemede gruplanır). */
export const RAIL_WIDGETS = [
  // ── yayın, ses, geçiş ──
  { type: "golive", family: "golive", label: "Yayın", icon: "broadcast", group: "yayin", size: "2x2", sizes: ["1x1", "2x1", "2x2"], hint: "Yayını başlat / durdur, süre ve durum" },
  { type: "mic", family: "mic", label: "Mikrofon", icon: "mic", group: "yayin", size: "1x1", sizes: ALL, hint: "Mikrofonu aç / kapat, ses seviyesi", hotkey: "mic" },
  { type: "micPtt", family: "mic", label: "Bas-konuş", icon: "mic", group: "yayin", size: "2x1", sizes: ["1x1", "2x1", "2x2"], hint: "Basılı tuttukça mikrofon açık, bırakınca kapanır" },
  { type: "mixer", family: "mic", label: "Ses karıştırıcı", icon: "sliders", group: "yayin", size: "2x2", sizes: ["2x1", "1x2", "2x2"], hint: "Kanalların sesi kapat / aç, seviye, ölçer" },
  { type: "transition", family: "transition", label: "Geçiş", icon: "chevronRight", group: "yayin", size: "1x1", sizes: ["1x1", "2x1", "2x2"], hint: "Önizlemeyi yayına al (büyükte geçiş türü)", hotkey: "transition" },
  { type: "transitionKinds", family: "transition", label: "Geçiş + tür ızgarası", icon: "swap", group: "yayin", size: "2x2", sizes: ["2x1", "2x2"], hint: "Büyük GEÇİŞ düğmesi ve geçiş türleri tek dokunuşta" },
  { type: "lastScene", family: "transition", label: "Son sahne", icon: "undo", group: "yayin", size: "1x1", sizes: ["1x1", "2x1"], hint: "Bir önceki sahneye dön", hotkey: "lastScene" },
  { type: "clock", family: "clock", label: "Maç saati", icon: "clock", group: "yayin", size: "2x1", sizes: ["1x1", "2x1", "2x2"], hint: "Saat, devre; başlat / durdur, ±10 sn / ±1 dk" },
  { type: "chapter", family: "chapter", label: "Bölüm", icon: "flag", group: "yayin", size: "1x1", sizes: ["1x1", "2x1"], hint: "YouTube bölüm işareti", hotkey: "chapter" },
  { type: "chapterList", family: "chapter", label: "Bölümler · son işaretler", icon: "flag", group: "yayin", size: "2x2", sizes: ["1x2", "2x2"], hint: "Son bölüm işaretleri ve hızlı ekle" },
  { type: "fullscreen", family: "fullscreen", label: "Tam ekran", icon: "overview", group: "yayin", size: "1x1", sizes: ["1x1", "2x1", "2x2"], hint: "Programı (ya da önizlemeyi) tam ekran göster", hotkey: "fullscreen" },
  // ── tekrar ──
  { type: "replay", family: "replay", label: "Tekrar · açı seç", icon: "repeat", group: "tekrar", size: "2x2", sizes: ["1x1", "2x1", "2x2"], hint: "Son tekrarın açılarını seç, önizle, yayına ver", hotkey: "replay" },
  { type: "replayGo", family: "replay", label: "Son tekrarı ver", icon: "play", group: "tekrar", size: "2x1", sizes: ALL, hint: "Tek büyük düğme: son tekrar hemen yayında", hotkey: "replay" },
  { type: "replayAngles", family: "replay", label: "Açı ızgarası (canlı)", icon: "video", group: "tekrar", size: "2x2", sizes: ["2x1", "2x2"], hint: "Son tekrarın açıları canlı küçük resimle; tık: o açı yayında" },
  { type: "replayRecent", family: "replay", label: "Son 3 tekrar", icon: "list", group: "tekrar", size: "2x2", sizes: ["1x2", "2x1", "2x2"], hint: "Son üç tekrar; tık: yayına ver" },
  { type: "replaySlow", family: "replay", label: "Ağır çekim", icon: "repeat", group: "tekrar", size: "2x1", sizes: ["2x1", "2x2"], hint: "Hız (0,25× – 1×) ve son tekrarı oynat" },
  { type: "replayQueue", family: "replay", label: "Tekrar kuyruğu", icon: "list", group: "tekrar", size: "2x2", sizes: ["1x2", "2x2"], hint: "Tekrarları sırayla seç, kuyruğu yayına ver" },
  { type: "moment", family: "moment", label: "Önemli an", icon: "star", group: "tekrar", size: "1x1", sizes: ["1x1", "2x1", "2x2"], hint: "Son saniyeleri tekrar olarak kaydet", hotkey: "moment" },
  // ── olay ──
  { type: "var", family: "var", label: "VAR", icon: "target", group: "olay", size: "1x1", sizes: ["1x1", "2x1", "2x2"], hint: "VAR kontrolünü aç / kapat", hotkey: "var" },
  { type: "event", family: "event", label: "Olay gir", icon: "pencil", group: "olay", size: "1x1", sizes: ["1x1", "2x1", "2x2"], hint: "Olay türü → oyuncu → kaydet", hotkey: "event" },
  { type: "goalHome", family: "goal", label: "Ev sahibi GOL", icon: "ball", group: "olay", size: "1x1", sizes: ALL, hint: "Ev sahibine gol (golcü seçilir)", hotkey: "goalHome" },
  { type: "goalAway", family: "goal", label: "Deplasman GOL", icon: "ball", group: "olay", size: "1x1", sizes: ALL, hint: "Deplasmana gol (golcü seçilir)", hotkey: "goalAway" },
  { type: "goalBoth", family: "goal", label: "GOL · iki takım", icon: "ball", group: "olay", size: "2x1", sizes: ["2x1", "2x2"], hint: "İki takımın GOL düğmesi yan yana, skorla" },
  { type: "goalMusic", family: "goalMusic", label: "Gol müziği", icon: "music", group: "olay", size: "1x1", sizes: ["1x1", "2x1", "2x2"], hint: "Gol müziğini çal / durdur", hotkey: "goalMusic" },
  // ── grafik ──
  { type: "scoreboard", family: "scoreboard", label: "Skorbord · açılır liste", icon: "trophy", group: "grafik", size: "2x2", sizes: ["1x1", "2x1", "2x2"], hint: "Skorbord çeşidini değiştir" },
  { type: "scoreChips", family: "scoreboard", label: "Skorbord · çeşit ızgarası", icon: "grid", group: "grafik", size: "2x2", sizes: ["2x1", "2x2"], hint: "Tüm skorbord çeşitleri çip ızgarasında" },
  { type: "scoreControl", family: "scoreboard", label: "Skor +/−", icon: "trophy", group: "grafik", size: "2x2", sizes: ["2x1", "2x2"], hint: "Takım başına + (gol, golcü seçilir) / − (son golü geri al)" },
  { type: "subtitle", family: "subtitle", label: "Altyazı", icon: "list", group: "grafik", size: "1x1", sizes: ["1x1", "2x1"], hint: "Altyazı şeridini aç / kapat", hotkey: "subtitle" },
  { type: "subtitleQuick", family: "subtitle", label: "Altyazı · hazır metinler", icon: "list", group: "grafik", size: "2x2", sizes: ["1x2", "2x2"], hint: "Tek dokunuşla hazır metni ekle ve yayına al" },
  { type: "interviewBand", family: "interviewBand", label: "Röportaj bandı", icon: "users", group: "grafik", size: "1x1", sizes: ["1x1", "2x1"], hint: "Röportaj bandını yayına al / kaldır", hotkey: "interviewBand" },
  { type: "ledMode", family: "led", label: "LED içeriği", icon: "grid", group: "grafik", size: "1x1", sizes: ["1x1", "2x1"], hint: "Sahadaki LED ekranın içeriği" },
  // ── sahneler, LED, röportaj ──
  { type: "interview", family: "interview", label: "Röportaj kaydı", icon: "mic", group: "diger", size: "1x1", sizes: ["1x1", "2x1", "2x2"], hint: "Röportaj kaydını başlat / bitir", hotkey: "interview" },
  { type: "led", family: "led", label: "LED çıkışı · yönlendirme", icon: "overview", group: "diger", size: "1x1", sizes: ["1x1", "2x1", "2x2"], hint: "LED ekranda ne görünsün, aç / kapat" },
  { type: "ready", family: "ready", label: "Hazır ekranlar", icon: "clock", group: "diger", size: "2x2", sizes: ["1x2", "2x1", "2x2"], hint: "Başlıyor · Devre arası · Bitti" },
  { type: "sceneGrid", family: "scene", label: "Sahne ızgarası (mini)", icon: "layers", group: "diger", size: "2x2", sizes: ["2x1", "1x2", "2x2"], hint: "İlk sahneler canlı küçük resimle; tık: önizleme · çift tık: yayın" },
  { type: "scene", family: "scene", label: "Sahne", icon: "layers", group: "diger", size: "1x1", sizes: ALL, hint: "Tek sahne: tık önizleme · çift tık yayın", multi: true },
];

export const widgetOf = (type) => RAIL_WIDGETS.find((w) => w.type === type) || null;
export const sizesOf = (type) => widgetOf(type)?.sizes || ["1x1", "2x2"];
export const sizeKey = (it) => `${it?.w === 2 ? 2 : 1}x${it?.h === 2 ? 2 : 1}`;
/** "2x1" → { w: 2, h: 1 }; izin verilmeyen boyut → en yakın izinli (aynı alan, sonra varsayılan). */
export function fitSize(type, key) {
  const allowed = sizesOf(type);
  if (allowed.includes(key)) return { ...RAIL_SIZES[key] };
  const want = RAIL_SIZES[key] || RAIL_SIZES["1x1"];
  const same = allowed.find((k) => RAIL_SIZES[k].w * RAIL_SIZES[k].h === want.w * want.h);
  const pick = same || widgetOf(type)?.size || allowed[0];
  return { ...RAIL_SIZES[pick] };
}

/** Varsayılan şerit: en sık kullanılanlar yukarıda. */
export const DEFAULT_RAIL = [
  { id: "w_golive", type: "golive", w: 2, h: 2 },
  { id: "w_mic", type: "mic", w: 1, h: 1 },
  { id: "w_var", type: "var", w: 1, h: 1 },
  { id: "w_replay", type: "replay", w: 2, h: 2 },
  { id: "w_replayGo", type: "replayGo", w: 2, h: 1 },
  { id: "w_moment", type: "moment", w: 1, h: 1 },
  { id: "w_event", type: "event", w: 1, h: 1 },
  { id: "w_goalBoth", type: "goalBoth", w: 2, h: 1 },
  { id: "w_scoreboard", type: "scoreboard", w: 2, h: 2 },
  { id: "w_subtitle", type: "subtitle", w: 1, h: 1 },
  { id: "w_interview", type: "interview", w: 1, h: 1 },
  { id: "w_chapter", type: "chapter", w: 1, h: 1 },
  { id: "w_led", type: "led", w: 1, h: 1 },
];

let seq = 0;
export const newWidgetId = (type) => `w_${type}_${Date.now().toString(36)}${(seq++).toString(36)}`;

/** Öğenin boyutu: yeni biçim (w, h) ya da eski (size: 1 | 2). */
function sizeOfRaw(it, type) {
  if (it?.w != null || it?.h != null) return fitSize(type, `${Number(it.w) === 2 ? 2 : 1}x${Number(it.h) === 2 ? 2 : 1}`);
  if (it?.size === 2 || it?.size === "2x2") return fitSize(type, "2x2");
  if (typeof it?.size === "string" && RAIL_SIZES[it.size]) return fitSize(type, it.size);
  return fitSize(type, "1x1");
}

/** Bozuk / bilinmeyen kayıtları ayıklar; tek örnekli türlerin kopyalarını atar; eski boyutları göç ettirir. */
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
    const sz = sizeOfRaw(it, w.type);
    out.push({ id, type: w.type, w: sz.w, h: sz.h, ...(it.opts && typeof it.opts === "object" ? { opts: { ...it.opts } } : {}) });
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
  try { storage?.setItem(RAIL_KEY, JSON.stringify({ v: 2, items })); return true; } catch { return false; }
}

/** Katalogdan ekle (sona). Tek örnekli tür zaten varsa liste değişmez. size: "2x1" | 1 | 2 | { w, h }. */
export function addWidget(items, type, { size, opts } = {}) {
  const w = widgetOf(type);
  if (!w) return items;
  if (!w.multi && items.some((x) => x.type === type)) return items;
  if (w.multi && opts?.sceneId && items.some((x) => x.type === type && x.opts?.sceneId === opts.sceneId)) return items;
  const key = size == null ? w.size : size === 2 ? "2x2" : size === 1 ? "1x1" : typeof size === "object" ? `${size.w}x${size.h}` : String(size);
  const sz = fitSize(type, key);
  return [...items, { id: newWidgetId(type), type, w: sz.w, h: sz.h, ...(opts ? { opts } : {}) }];
}
export const removeWidget = (items, id) => items.filter((x) => x.id !== id);
/** Boyutla: "1x2" (ya da eski 1 | 2). İzin verilmeyen boyut en yakın izinliye çekilir. */
export const resizeWidget = (items, id, size) => items.map((x) => {
  if (x.id !== id) return x;
  const key = size === 2 ? "2x2" : size === 1 ? "1x1" : String(size);
  const sz = fitSize(x.type, key);
  return { ...x, w: sz.w, h: sz.h };
});
/** Sağ tık "büyüt / küçült": izinli boyutlar arasında sırayla döner. */
export const cycleWidgetSize = (items, id) => items.map((x) => {
  if (x.id !== id) return x;
  const list = SIZE_KEYS.filter((k) => sizesOf(x.type).includes(k));
  const next = list[(list.indexOf(sizeKey(x)) + 1) % list.length] || list[0];
  return { ...x, ...RAIL_SIZES[next] };
});
/** Eski API: 1×1 ↔ 2×2 (izinliyse). */
export const toggleWidgetSize = (items, id) => items.map((x) => {
  if (x.id !== id) return x;
  const big = x.w === 2 && x.h === 2;
  const sz = fitSize(x.type, big ? "1x1" : "2x2");
  return { ...x, w: sz.w, h: sz.h };
});

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
