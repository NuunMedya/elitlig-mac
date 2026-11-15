// Tablolar: ızgara geometrisi (arayüzden bağımsız, testli).
//
// Satır/sütun konumları önek toplamı dizisinde tutulur (20 000 satırda bile
// birkaç yüz KB); gizli satır/sütunların boyu 0'dır. Konumdan indeks ikili
// aramayla bulunur. Değerler %100 yakınlaştırmadaki piksellerdir; çizim
// sırasında yakınlaştırma katsayısıyla çarpılır.
import { colName } from "./sheetEngine";
import { DEF_H, DEF_W, getFrozen, hiddenColSet, hiddenRowSet } from "./sheetModel";

/** count öğeli eksen: size(i) boy, pos[i] başlangıç, total toplam. */
export function buildAxis(count, sizeOf) {
  const pos = new Float64Array(count + 1);
  for (let i = 0; i < count; i += 1) pos[i + 1] = pos[i] + sizeOf(i);
  return {
    count,
    pos,
    total: pos[count],
    start: (i) => pos[Math.max(0, Math.min(count, i))],
    end: (i) => pos[Math.max(0, Math.min(count, i + 1))],
    size: (i) => (i >= 0 && i < count ? pos[i + 1] - pos[i] : 0),
    /** px konumundaki indeks (gizlileri atlar; dışarıdaysa en yakın uç). */
    indexAt(px) {
      if (px <= 0) return firstVisible(pos, count, 0);
      if (px >= pos[count]) return lastVisible(pos, count);
      let lo = 0;
      let hi = count - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (pos[mid] <= px) lo = mid; else hi = mid - 1;
      }
      // Boyu 0 olan (gizli) indekslerden sonraki görünür olana geç.
      while (lo < count - 1 && pos[lo + 1] - pos[lo] === 0) lo += 1;
      return lo;
    },
    hidden: (i) => pos[i + 1] - pos[i] === 0,
  };
}
const firstVisible = (pos, count, from) => { let i = from; while (i < count - 1 && pos[i + 1] - pos[i] === 0) i += 1; return i; };
const lastVisible = (pos, count) => { let i = count - 1; while (i > 0 && pos[i + 1] - pos[i] === 0) i -= 1; return i; };

const layoutCache = new WeakMap();
/**
 * Sayfanın geometrisi. extraHiddenRows: süzgeçle gizlenen satırlar (Set).
 * Aynı sayfa nesnesi ve süzgeç için önbelleğe alınır.
 */
export function sheetLayout(sheet, extraHiddenRows = null) {
  const cached = layoutCache.get(sheet);
  if (cached && cached.extra === extraHiddenRows) return cached.layout;
  const hr = hiddenRowSet(sheet);
  const hc = hiddenColSet(sheet);
  const rowH = sheet.rowH || {};
  const colW = sheet.colW || {};
  const rows = buildAxis(sheet.rows, (r) => (hr.has(r) || extraHiddenRows?.has(r) ? 0 : rowH[r + 1] || DEF_H));
  const cols = buildAxis(sheet.cols, (c) => (hc.has(c) ? 0 : colW[colName(c)] || DEF_W));
  const frozen = getFrozen(sheet);
  const fr = Math.min(frozen.r, sheet.rows - 1);
  const fc = Math.min(frozen.c, sheet.cols - 1);
  const layout = { rows, cols, fr: Math.max(0, fr), fc: Math.max(0, fc), frozenH: rows.start(fr), frozenW: cols.start(fc) };
  layoutCache.set(sheet, { extra: extraHiddenRows, layout });
  return layout;
}

/**
 * Ekran ↔ hücre dönüşümü. view: { zoom, scrollTop, scrollLeft, headW, headH }.
 * Dondurulmuş bölüm kaydırılmaz; kaydırma yalnız dondurulmamış bölüme uygulanır.
 */
export function screenX(layout, view, c) {
  const { cols, fc, frozenW } = layout;
  const z = view.zoom;
  if (c < fc) return view.headW + cols.start(c) * z;
  return view.headW + frozenW * z + (cols.start(c) - frozenW) * z - view.scrollLeft;
}
export function screenY(layout, view, r) {
  const { rows, fr, frozenH } = layout;
  const z = view.zoom;
  if (r < fr) return view.headH + rows.start(r) * z;
  return view.headH + frozenH * z + (rows.start(r) - frozenH) * z - view.scrollTop;
}
/** Hücrenin (ya da { r1, c1, r2, c2 } aralığının) ekran dikdörtgeni. */
export function screenRect(layout, view, rect) {
  const x = screenX(layout, view, rect.c1);
  const y = screenY(layout, view, rect.r1);
  const z = view.zoom;
  const w = (layout.cols.end(rect.c2) - layout.cols.start(rect.c1)) * z;
  const h = (layout.rows.end(rect.r2) - layout.rows.start(rect.r1)) * z;
  return { x, y, w, h };
}

/** Ekran x → sütun (başlık bölgesindeyse -1). */
export function colAtX(layout, view, x) {
  if (x < view.headW) return -1;
  const z = view.zoom;
  const fx = view.headW + layout.frozenW * z;
  const model = x < fx ? (x - view.headW) / z : layout.frozenW + (x - fx + view.scrollLeft) / z;
  return layout.cols.indexAt(model);
}
export function rowAtY(layout, view, y) {
  if (y < view.headH) return -1;
  const z = view.zoom;
  const fy = view.headH + layout.frozenH * z;
  const model = y < fy ? (y - view.headH) / z : layout.frozenH + (y - fy + view.scrollTop) / z;
  return layout.rows.indexAt(model);
}

/** Görünür (dondurulmamış) bölümdeki ilk/son indeksler. */
export function visibleSpan(axis, frozenCount, frozenPx, scroll, viewport, zoom) {
  const startPx = frozenPx + scroll / zoom;
  const endPx = startPx + Math.max(0, viewport) / zoom;
  const first = Math.max(frozenCount, axis.indexAt(startPx));
  const last = Math.min(axis.count - 1, axis.indexAt(endPx));
  return [first, last];
}

/**
 * Hücreyi görünür kılmak için gereken kaydırma: { top, left } (değişmeyen
 * eksen için mevcut değer).
 */
export function scrollToReveal(layout, view, r, c, viewW, viewH) {
  const z = view.zoom;
  let { scrollTop: top, scrollLeft: left } = view;
  if (r >= layout.fr) {
    const y1 = (layout.rows.start(r) - layout.frozenH) * z;
    const y2 = (layout.rows.end(r) - layout.frozenH) * z;
    const avail = viewH - view.headH - layout.frozenH * z;
    if (y1 < top) top = y1;
    else if (y2 > top + avail) top = Math.max(0, y2 - avail);
  }
  if (c >= layout.fc) {
    const x1 = (layout.cols.start(c) - layout.frozenW) * z;
    const x2 = (layout.cols.end(c) - layout.frozenW) * z;
    const avail = viewW - view.headW - layout.frozenW * z;
    if (x1 < left) left = x1;
    else if (x2 > left + avail) left = Math.max(0, Math.min(x1, x2 - avail));
  }
  return { top, left };
}
