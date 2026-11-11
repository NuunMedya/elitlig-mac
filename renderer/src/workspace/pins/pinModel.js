// Sabit katman (her sekmede / bölmede aynı yerde duran düğme ve bileşenler) — SAF model.
//
// Öğeler Bugün panosunun bileşen kütüphanesinden gelir (views/today/registry.js, dashModel.js —
// yalnız dışa açık işlevleri kullanılır). Öğe = pano öğesi { i, t, w, h, o, title?, accent?, head? }:
// w × h ızgara birimi (UNIT piksel), kademe boyuttan hesaplanır (küçük → düğme, büyük → tam bileşen).
//
//   docks.top|bottom|left|right: [öğe]   kenar çubukları — çalışma alanından YER AYIRIR
//                                        (gömülü tarayıcı görünümü hiçbir zaman bunların üstüne çizmez)
//   floats: [{ ...öğe, x, y, opacity, collapsed }]   pencere üstünde serbest yüzen kutular (piksel)
export const PIN_VERSION = 1;
export const EDGES = ["top", "bottom", "left", "right"];
export const EDGE_LABELS = { top: "Üst çubuk", bottom: "Alt çubuk", left: "Sol çubuk", right: "Sağ çubuk", float: "Yüzen" };
export const UNIT = 56; // tek birimlik kenar (düğme: 56 × 56 piksel)
export const UNIT_W = 76; // çok birimli bileşende birim eni / boyu (Bugün panosundaki hücreye yakın)
export const UNIT_H = 64;
export const GAP = 6;
export const PAD = 6;
export const MAX_PINS = 60;
export const MAX_W = 8;
export const MAX_H = 8;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const int = (v, d) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : d);
const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
let seq = 0;
export const pinId = () => `pin${Date.now().toString(36)}${(seq += 1).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

export const emptyPins = () => ({ v: PIN_VERSION, docks: { top: [], bottom: [], left: [], right: [] }, floats: [] });
export const pinCount = (s) => EDGES.reduce((n, e) => n + s.docks[e].length, 0) + s.floats.length;
export const hasPins = (s) => pinCount(s) > 0;

/** Kenar çubuğu kalınlığı (piksel): öğe yoksa 0. */
export function dockThickness(items, edge) {
  if (!items?.length) return 0;
  const horiz = edge === "top" || edge === "bottom";
  return Math.max(...items.map((i) => (horiz ? pxH(i.h) : pxW(i.w)))) + PAD * 2;
}
/** Birim → piksel (1 birim = 56 px düğme; daha büyükler pano hücresi ölçüsünde). */
export const pxW = (w) => (w <= 1 ? UNIT : w * UNIT_W + (w - 1) * GAP);
export const pxH = (h) => (h <= 1 ? UNIT : h * UNIT_H + (h - 1) * GAP);

function cleanItem(raw, isKnown) {
  if (!isObj(raw) || typeof raw.t !== "string" || !isKnown(raw.t)) return null;
  const it = { i: typeof raw.i === "string" && raw.i ? raw.i : pinId(), t: raw.t, w: clamp(int(raw.w, 1), 1, MAX_W), h: clamp(int(raw.h, 1), 1, MAX_H), x: 0, y: 0, o: isObj(raw.o) ? raw.o : {} };
  if (typeof raw.title === "string" && raw.title) it.title = raw.title.slice(0, 60);
  if (typeof raw.accent === "string" && raw.accent) it.accent = raw.accent;
  if (raw.head === false) it.head = false;
  return it;
}

/** Kayıttan okunan sabit katmanı onarır (bilinmeyen bileşen düşer, kimlik çakışması giderilir). */
export function normalizePins(raw, { isKnown = () => true } = {}) {
  const s = emptyPins();
  if (!isObj(raw)) return s;
  const seen = new Set();
  const uniq = (it) => { if (seen.has(it.i)) it.i = pinId(); seen.add(it.i); return it; };
  for (const e of EDGES) for (const r of Array.isArray(raw.docks?.[e]) ? raw.docks[e] : []) { const it = cleanItem(r, isKnown); if (it && pinCount(s) < MAX_PINS) s.docks[e].push(uniq(it)); }
  for (const r of Array.isArray(raw.floats) ? raw.floats : []) {
    const it = cleanItem(r, isKnown);
    if (!it || pinCount(s) >= MAX_PINS) continue;
    s.floats.push(uniq({ ...it, x: int(r.x, 80), y: int(r.y, 80), opacity: clamp(Number(r.opacity) || 1, 0.25, 1), collapsed: Boolean(r.collapsed) }));
  }
  return s;
}

/** Öğe nerede: { where: kenar | "float", index }. */
export function findPin(s, i) {
  for (const e of EDGES) { const k = s.docks[e].findIndex((x) => x.i === i); if (k >= 0) return { where: e, index: k, item: s.docks[e][k] }; }
  const k = s.floats.findIndex((x) => x.i === i);
  return k >= 0 ? { where: "float", index: k, item: s.floats[k] } : null;
}

/** Yeni öğe: item { t, w, h, o, title? } — boyut çağıran tarafından (kademe → boyut) verilir. */
export function addPin(s, item, where = "top", { x = 120, y = 120, index = null } = {}) {
  if (pinCount(s) >= MAX_PINS) return { state: s, id: null };
  const it = cleanItem({ ...item, i: pinId() }, () => true);
  if (!it) return { state: s, id: null };
  if (where === "float") return { state: { ...s, floats: [...s.floats, { ...it, x: int(x, 120), y: int(y, 120), opacity: 1, collapsed: false }] }, id: it.i };
  const e = EDGES.includes(where) ? where : "top";
  const list = [...s.docks[e]];
  list.splice(index == null ? list.length : clamp(index, 0, list.length), 0, it);
  return { state: { ...s, docks: { ...s.docks, [e]: list } }, id: it.i };
}

export function removePin(s, i) {
  return { ...s, docks: Object.fromEntries(EDGES.map((e) => [e, s.docks[e].filter((x) => x.i !== i)])), floats: s.floats.filter((x) => x.i !== i) };
}

/** Öğe alanlarını değiştirir (o birleşir; title/accent "" → silinir; head true → varsayılan). */
export function patchPin(s, i, patch) {
  const fix = (x) => {
    if (x.i !== i) return x;
    const next = { ...x, ...patch, o: patch.o ? { ...(x.o || {}), ...patch.o } : x.o };
    if (!next.title) delete next.title;
    if (!next.accent) delete next.accent;
    if (next.head !== false) delete next.head;
    if (patch.w != null) next.w = clamp(int(patch.w, x.w), 1, MAX_W);
    if (patch.h != null) next.h = clamp(int(patch.h, x.h), 1, MAX_H);
    if (patch.opacity != null) next.opacity = clamp(Number(patch.opacity) || 1, 0.25, 1);
    return next;
  };
  return { ...s, docks: Object.fromEntries(EDGES.map((e) => [e, s.docks[e].map(fix)])), floats: s.floats.map(fix) };
}

/** Öğeyi başka kenara / sıraya ya da yüzen konuma taşır. */
export function movePin(s, i, where, { index = null, x, y } = {}) {
  const at = findPin(s, i);
  if (!at) return s;
  const base = { ...at.item };
  delete base.opacity; delete base.collapsed;
  let next = removePin(s, i);
  if (where === "float") {
    const f = { ...base, x: int(x ?? at.item.x ?? 120, 120), y: int(y ?? at.item.y ?? 120, 120), opacity: at.item.opacity ?? 1, collapsed: Boolean(at.item.collapsed) };
    return { ...next, floats: [...next.floats, f] };
  }
  const e = EDGES.includes(where) ? where : "top";
  const list = [...next.docks[e]];
  let k = index == null ? list.length : index;
  if (at.where === e && index != null && index > at.index) k -= 1; // aynı çubukta sağa taşıma
  list.splice(clamp(k, 0, list.length), 0, { ...base, x: 0, y: 0 });
  next = { ...next, docks: { ...next.docks, [e]: list } };
  return next;
}

export function duplicatePin(s, i) {
  const at = findPin(s, i);
  if (!at) return s;
  const copy = JSON.parse(JSON.stringify(at.item));
  copy.i = pinId();
  if (at.where === "float") return { ...s, floats: [...s.floats, { ...copy, x: copy.x + 24, y: copy.y + 24 }] };
  const list = [...s.docks[at.where]];
  list.splice(at.index + 1, 0, copy);
  return { ...s, docks: { ...s.docks, [at.where]: list } };
}

/** Yüzen kutuyu pencere sınırlarına sıkıştırır; 8 px ızgaraya ve kenarlara yapıştırır. */
export function placeFloat(f, view, { snap = true, edge = 12 } = {}) {
  const w = f.collapsed ? 160 : pxW(f.w);
  const h = f.collapsed ? 34 : pxH(f.h);
  let x = int(f.x, 0), y = int(f.y, 0);
  if (snap) {
    x = Math.round(x / 8) * 8; y = Math.round(y / 8) * 8;
    if (x < edge) x = 0;
    if (y < edge) y = 0;
    if (view.width - (x + w) < edge) x = view.width - w;
    if (view.height - (y + h) < edge) y = view.height - h;
  }
  return { ...f, x: clamp(x, 0, Math.max(0, view.width - Math.min(w, view.width))), y: clamp(y, 0, Math.max(0, view.height - Math.min(h, view.height))) };
}

/** Kesişim (piksel dikdörtgenleri { x, y, width, height }). */
export const overlaps = (a, b) => Boolean(a && b) && a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/**
 * Gömülü (yerel) görünümün (tarayıcı, yönetim paneli) üstüne düşen yüzen kutular gizlenir:
 * yerel görünüm her zaman DOM'un üstüne çizer; kutu orada görünmez ve tıklanamaz olurdu.
 * → gizlenecek öğe kimlikleri.
 */
export function hiddenUnderNative(floats, nativeRects, view) {
  const out = new Set();
  for (const f of floats) {
    const p = placeFloat(f, view, { snap: false });
    const r = { x: p.x, y: p.y, width: f.collapsed ? 160 : pxW(f.w), height: f.collapsed ? 34 : pxH(f.h) };
    if (nativeRects.some((n) => overlaps(r, n))) out.add(f.i);
  }
  return out;
}
