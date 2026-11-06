// Yayın Stüdyosu — SAHNE ALANI IZGARASI (saf). Önizleme / program / sahne şeridi /
// LED önizleme / tekrar açıları / geçiş / ses ölçerleri / saat kutuları sol şeritteki
// gibi hücre ızgarasına yerleştirilir: yapboz gibi taşınır, köşeden boyutlanır
// (1×1 … 5×5 ya da serbest G×Y), çakışan kutu en yakın boş yere kayar, "Sıkıştır"
// boşlukları yukarı doğru kapatır. Hazır düzenler tek tıkla uygulanır.
//
// Kayıt (localStorage "studio.stage.v1"): { v: 1, preset, custom, tiles: [Kutu] }
//   Kutu: { id, type, x, y, w, h, opts? }   x/y/w/h hücre cinsinden (0 tabanlı)
// Eski çalışma alanı anahtarları (scenesWorkspace.js WORKSPACES) aynı adlı hazır
// düzene eşlenir: classic, program, single, grid4, grid9 (+ eski studio / mv4 …).
import { LEGACY_WORKSPACES } from "./scenesWorkspace";

export const STAGE_KEY = "studio.stage.v1";
export const STAGE_COLS = 12;
export const STAGE_ROWS = 8;

/** Kutu türleri. unique: düzende en çok bir tane; min / def: [g, y] hücre. */
export const STAGE_TILES = [
  { type: "preview", label: "Önizleme", icon: "eye", unique: true, min: [2, 2], def: [5, 4], hint: "Önizlemedeki sahne; tekrar yüklenince yakınlaştırma ve zaman çizelgesi burada" },
  { type: "program", label: "Program", icon: "broadcast", unique: true, min: [2, 2], def: [5, 4], hint: "Yayına giden görüntü" },
  { type: "transition", label: "Geçiş paneli", icon: "swap", unique: true, min: [1, 2], def: [2, 3], hint: "GEÇİŞ (Boşluk), geçiş türü, son sahneye dön" },
  { type: "scenes", label: "Sahne şeridi", icon: "layers", unique: true, min: [2, 1], def: [12, 2], hint: "Tüm sahneler (çoklu görünüm): kutunun biçimine göre şerit, liste ya da ızgara" },
  { type: "scene", label: "Sahne hücresi", icon: "video", unique: false, min: [1, 1], def: [3, 3], hint: "Sıradaki bir sahne (kamera) tek kutuda; numarası seçilir" },
  { type: "led", label: "LED önizleme", icon: "overview", unique: true, min: [2, 2], def: [4, 3], hint: "LED ekranda görünen içerik (yönlendirmeye göre)" },
  { type: "angles", label: "Tekrar açıları", icon: "repeat", unique: true, min: [2, 1], def: [4, 2], hint: "Son tekrarın açıları: tıkla → önizlemede düzenle" },
  { type: "meters", label: "Ses ölçerleri", icon: "mic", unique: true, min: [2, 1], def: [4, 1], hint: "Program sesi ve mikrofon seviyeleri" },
  { type: "clock", label: "Saat", icon: "clock", unique: false, min: [1, 1], def: [2, 1], hint: "Saat ve maç dakikası" },
];
export const stageTileOf = (type) => STAGE_TILES.find((t) => t.type === type) || null;

/** Boyut menüsü: kare 1×1 … 5×5 ve sık kullanılan dikdörtgenler. */
export const STAGE_SIZES = [[1, 1], [2, 2], [3, 3], [4, 4], [5, 5], [2, 1], [3, 2], [4, 2], [4, 3], [6, 4], [6, 5], [12, 2]];

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const int = (v, d) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : d);
let seq = 0;
export const stageTileId = (type) => `t_${type}_${Date.now().toString(36)}${(seq++).toString(36)}`;

const T = (type, x, y, w, h, opts) => ({ id: `t_${type}${opts?.index != null ? `_${opts.index}` : ""}`, type, x, y, w, h, ...(opts ? { opts } : {}) });

/** Hazır düzenler (tek tık). workspace: eşlenen eski çalışma alanı anahtarı. */
export const STAGE_PRESETS = [
  { key: "classic", label: "Klasik", hint: "Önizleme | geçiş | Program yan yana, altta sahne şeridi", tiles: [
    T("preview", 0, 0, 5, 6), T("transition", 5, 0, 2, 6), T("program", 7, 0, 5, 6), T("scenes", 0, 6, 12, 2),
  ] },
  { key: "program", label: "Büyük program", hint: "Program büyük; yanda önizleme, geçiş ve sahne listesi", tiles: [
    T("program", 0, 0, 8, 8), T("preview", 8, 0, 4, 3), T("transition", 8, 3, 4, 1), T("scenes", 8, 4, 4, 4),
  ] },
  { key: "single", label: "Tek program", hint: "Yalnız program (önizleme yok: sahneye tık doğrudan yayına)", tiles: [
    T("program", 0, 0, 10, 6), T("transition", 10, 0, 2, 4), T("clock", 10, 4, 2, 2), T("scenes", 0, 6, 12, 2),
  ] },
  { key: "pp4", label: "Program + önizleme + 4 kamera", hint: "Üstte önizleme ve program, altta dört sahne hücresi", tiles: [
    T("preview", 0, 0, 5, 4), T("transition", 5, 0, 2, 4), T("program", 7, 0, 5, 4),
    T("scene", 0, 4, 3, 4, { index: 0 }), T("scene", 3, 4, 3, 4, { index: 1 }), T("scene", 6, 4, 3, 4, { index: 2 }), T("scene", 9, 4, 3, 4, { index: 3 }),
  ] },
  { key: "grid4", label: "Çoklu 2×2", hint: "Solda dört sahne; sağda program, önizleme ve geçiş", tiles: [
    T("scene", 0, 0, 3, 4, { index: 0 }), T("scene", 3, 0, 3, 4, { index: 1 }), T("scene", 0, 4, 3, 4, { index: 2 }), T("scene", 3, 4, 3, 4, { index: 3 }),
    T("program", 6, 0, 6, 5), T("preview", 6, 5, 4, 3), T("transition", 10, 5, 2, 3),
  ] },
  { key: "grid9", label: "Çoklu 3×3", hint: "Solda dokuz sahnelik ızgara; sağda program, önizleme ve geçiş", tiles: [
    T("scenes", 0, 0, 6, 8), T("program", 6, 0, 6, 5), T("preview", 6, 5, 4, 3), T("transition", 10, 5, 2, 3),
  ] },
  { key: "led", label: "LED operatörü", hint: "LED önizleme büyük, yanında program; altta önizleme, geçiş ve sahneler", tiles: [
    T("led", 0, 0, 6, 5), T("program", 6, 0, 6, 5), T("preview", 0, 5, 3, 3), T("transition", 3, 5, 2, 3), T("scenes", 5, 5, 7, 3),
  ] },
  { key: "replay", label: "Tekrar operatörü", hint: "Büyük önizleme (tekrar düzenleme), açılar, program ve geçiş", tiles: [
    T("preview", 0, 0, 7, 6), T("program", 7, 0, 5, 3), T("transition", 7, 3, 2, 3), T("angles", 9, 3, 3, 3), T("scenes", 0, 6, 9, 2), T("meters", 9, 6, 3, 1), T("clock", 9, 7, 3, 1),
  ] },
];
export const stagePresetOf = (key) => STAGE_PRESETS.find((p) => p.key === key) || null;

/** Eski çalışma alanı anahtarı → hazır düzen anahtarı. */
export function presetForWorkspace(key) {
  const k = LEGACY_WORKSPACES[key] || key;
  return stagePresetOf(k) ? k : "classic";
}

/* ------------------------------ geometri ------------------------------ */

export const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
export const inBounds = (t, cols = STAGE_COLS, rows = STAGE_ROWS) => t.x >= 0 && t.y >= 0 && t.x + t.w <= cols && t.y + t.h <= rows;

/** Kutuyu ızgaraya sığdırır (en küçük boy ve sınırlar). */
export function fitTile(t, cols = STAGE_COLS, rows = STAGE_ROWS) {
  const def = stageTileOf(t.type);
  const [mw, mh] = def?.min || [1, 1];
  const w = clamp(int(t.w, def?.def?.[0] || 2), Math.min(mw, cols), cols);
  const h = clamp(int(t.h, def?.def?.[1] || 2), Math.min(mh, rows), rows);
  return { ...t, w, h, x: clamp(int(t.x, 0), 0, cols - w), y: clamp(int(t.y, 0), 0, rows - h) };
}

/** w×h kutu için boş yer; (nearX, nearY)'ye en yakın olan. Yoksa null. */
export function findSpot(tiles, w, h, { nearX = 0, nearY = 0, cols = STAGE_COLS, rows = STAGE_ROWS } = {}) {
  let best = null;
  for (let y = 0; y + h <= rows; y += 1) {
    for (let x = 0; x + w <= cols; x += 1) {
      const c = { x, y, w, h };
      if (tiles.some((t) => overlaps(t, c))) continue;
      const d = Math.abs(x - nearX) + Math.abs(y - nearY) * 1.2;
      if (!best || d < best.d) best = { x, y, d };
    }
  }
  return best ? { x: best.x, y: best.y } : null;
}

/**
 * Kutuyu yeni konuma / boya koyar; çakışan kutular en yakın boş yere kayar.
 * Yer bulunamazsa null (işlem yapılmaz).
 */
export function placeTile(tiles, id, rect, { cols = STAGE_COLS, rows = STAGE_ROWS } = {}) {
  const cur = tiles.find((t) => t.id === id);
  if (!cur) return null;
  const moved = fitTile({ ...cur, ...rect }, cols, rows);
  const placed = [moved];
  const hit = [];
  for (const t of tiles) {
    if (t.id === id) continue;
    if (overlaps(t, moved)) hit.push(t); else placed.push(t);
  }
  // Çakışanlar: önce büyükler (küçük kutu kolay yer bulur).
  hit.sort((a, b) => b.w * b.h - a.w * a.h);
  for (const t of hit) {
    let spot = findSpot(placed, t.w, t.h, { nearX: t.x, nearY: t.y, cols, rows });
    if (!spot) {
      // Yer değiştir: çakışan kutu taşınan kutunun eski yerine sığıyorsa oraya.
      const swap = fitTile({ ...t, x: cur.x, y: cur.y }, cols, rows);
      if (swap.w === t.w && swap.h === t.h && !placed.some((o) => overlaps(o, swap))) spot = { x: swap.x, y: swap.y };
    }
    if (!spot) return null;
    placed.push({ ...t, ...spot });
  }
  const order = new Map(tiles.map((t, i) => [t.id, i]));
  return placed.sort((a, b) => order.get(a.id) - order.get(b.id));
}

/** Boşlukları kapatır: her kutu (yukarıdan aşağı) gidebildiği en üste, sonra en sola kayar. */
export function compactTiles(tiles, { cols = STAGE_COLS } = {}) {
  void cols;
  const order = [...tiles].sort((a, b) => a.y - b.y || a.x - b.x);
  const out = [];
  for (const t of order) {
    let c = { ...t };
    while (c.y > 0 && !out.some((o) => overlaps(o, { ...c, y: c.y - 1 }))) c = { ...c, y: c.y - 1 };
    while (c.x > 0 && !out.some((o) => overlaps(o, { ...c, x: c.x - 1 }))) c = { ...c, x: c.x - 1 };
    out.push(c);
  }
  const ids = tiles.map((t) => t.id);
  return out.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
}

/** Yeni kutu ekler (varsayılan boyda; sığmazsa küçülterek). Eklenemezse null. */
export function addStageTile(tiles, type, opts = null, { cols = STAGE_COLS, rows = STAGE_ROWS } = {}) {
  const def = stageTileOf(type);
  if (!def) return null;
  if (def.unique && tiles.some((t) => t.type === type)) return null;
  let [w, h] = def.def;
  const [mw, mh] = def.min;
  for (;;) {
    const spot = findSpot(tiles, w, h, { cols, rows });
    if (spot) {
      const nextIndex = type === "scene" ? tiles.filter((t) => t.type === "scene").length : null;
      const o = opts || (type === "scene" ? { index: nextIndex } : null);
      return [...tiles, { id: stageTileId(type), type, ...spot, w, h, ...(o ? { opts: o } : {}) }];
    }
    if (w <= mw && h <= mh) return null;
    if (w >= h && w > mw) w -= 1; else if (h > mh) h -= 1; else w -= 1;
  }
}

export const removeStageTile = (tiles, id) => tiles.filter((t) => t.id !== id);
export const setTileOpts = (tiles, id, opts) => tiles.map((t) => (t.id === id ? { ...t, opts: { ...(t.opts || {}), ...opts } } : t));

/** Düzende önizleme kutusu var mı (yoksa stüdyo modu kapalı sayılır: tık doğrudan yayına). */
export const stageHasPreview = (tiles) => tiles.some((t) => t.type === "preview");

/** Eklenebilir kutu türleri. */
export const addableTiles = (tiles) => STAGE_TILES.filter((d) => !d.unique || !tiles.some((t) => t.type === d.type));

/* ------------------------------ kayıt ------------------------------ */

export function normalizeStageTiles(raw, { cols = STAGE_COLS, rows = STAGE_ROWS } = {}) {
  if (!Array.isArray(raw)) return null;
  const seen = new Set();
  const ids = new Set();
  const out = [];
  for (const r of raw) {
    const def = stageTileOf(r?.type);
    if (!def) continue;
    if (def.unique && seen.has(def.type)) continue;
    const t = fitTile({ id: typeof r.id === "string" && !ids.has(r.id) ? r.id : stageTileId(def.type), type: def.type, x: r.x, y: r.y, w: r.w, h: r.h, ...(r.opts && typeof r.opts === "object" ? { opts: { ...r.opts } } : {}) }, cols, rows);
    if (out.some((o) => overlaps(o, t))) {
      const spot = findSpot(out, t.w, t.h, { nearX: t.x, nearY: t.y, cols, rows });
      if (!spot) continue;
      Object.assign(t, spot);
    }
    seen.add(def.type);
    ids.add(t.id);
    out.push(t);
  }
  return out.length ? out : null;
}

export const presetTiles = (key) => (stagePresetOf(key) || STAGE_PRESETS[0]).tiles.map((t) => ({ ...t, ...(t.opts ? { opts: { ...t.opts } } : {}) }));

/** Kayıttan düzen; yoksa çalışma alanının hazır düzeni. */
export function normalizeStage(raw, workspace = "classic") {
  const preset = stagePresetOf(raw?.preset) ? raw.preset : presetForWorkspace(workspace);
  const tiles = normalizeStageTiles(raw?.tiles);
  if (!tiles) return { v: 1, preset, custom: false, tiles: presetTiles(preset) };
  return { v: 1, preset, custom: Boolean(raw.custom), tiles };
}

export function loadStage(storage, workspace) {
  try {
    const raw = storage?.getItem(STAGE_KEY);
    return normalizeStage(raw ? JSON.parse(raw) : null, workspace);
  } catch { return normalizeStage(null, workspace); }
}

export function saveStage(storage, stage) {
  try { storage?.setItem(STAGE_KEY, JSON.stringify(stage)); return true; } catch { return false; }
}

/**
 * Sahne şeridi kutusunun iç yerleşimi: n küçük resim (16:9 + ad çubuğu) W×H alana
 * en büyük boyda sığacak sütun sayısı. Dönüş { cols, rows, tileW }.
 */
export function stripGrid(n, W, H, { gap = 4, bar = 26, minW = 96 } = {}) {
  const count = Math.max(1, n);
  let best = { cols: count, rows: 1, tileW: 0 };
  for (let cols = 1; cols <= count; cols += 1) {
    const rows = Math.ceil(count / cols);
    const wByW = (W - gap * (cols - 1)) / cols;
    const hAvail = (H - gap * (rows - 1)) / rows - bar;
    const tileW = Math.min(wByW, (hAvail * 16) / 9);
    if (tileW > best.tileW) best = { cols, rows, tileW };
  }
  // Çok küçükse tek sıra şerit (yatay kaydırma) ya da tek sütun liste.
  if (best.tileW < minW) {
    const tall = H > W;
    return tall ? { cols: 1, rows: count, tileW: Math.max(minW, W), scroll: "y" } : { cols: count, rows: 1, tileW: Math.max(minW, ((H - bar) * 16) / 9), scroll: "x" };
  }
  return best;
}
