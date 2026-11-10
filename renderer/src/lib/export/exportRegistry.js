// Sayfanın birincil dışa aktarması (⌘P / "Bu sayfayı yazdır").
// BU DOSYA elitlig-mac ve elitlig-client depolarında AYNIDIR.
//
// Her ExportButton bağlanınca kendini kaydeder. Kısayol ya da üst çubuktaki yazdır düğmesi
// görünür düğmelerden birincilini açar: `primary` işaretli olan, yoksa sayfada en üstte
// (sonra en solda) duran. Hiç yoksa çağıran, sayfa içeriğinden genel bir rapor kurar.
//
// Kendi ⌘P işleyicisi olan ekranlar (tablo düzenleyici, ön muhasebe yazdırma…) işleyicisinde
// markPrintHandled() çağırır; böylece aynı kısayolda iki pencere açılmaz.

const entries = new Set();
let handled = false;

/** entry: { el: () => HTMLElement, open: (format) => void, primary?: boolean, title? } → kaydı siler */
export function registerExport(entry) {
  entries.add(entry);
  return () => entries.delete(entry);
}

const visible = (el) => {
  if (!el || !el.isConnected) return false;
  if (el.closest?.("[hidden],[aria-hidden='true'],[inert]")) return false;
  const rects = el.getClientRects?.();
  // jsdom yerleşim yapmaz (dikdörtgen yok): orada bağlı her öğe görünür sayılır.
  return !rects || rects.length > 0 || (typeof navigator !== "undefined" && /jsdom/i.test(navigator.userAgent || ""));
};

/** Görünür kayıtlar arasından birincil olan. */
export function primaryExport() {
  const list = [...entries].filter((e) => visible(e.el?.()));
  if (!list.length) return null;
  const marked = list.filter((e) => e.primary);
  const pool = marked.length ? marked : list;
  const pos = (e) => { const r = e.el?.()?.getBoundingClientRect?.(); return r ? [Math.round(r.top / 8), r.left] : [0, 0]; };
  return pool.slice().sort((a, b) => { const [at, al] = pos(a); const [bt, bl] = pos(b); return at - bt || al - bl; })[0];
}

/** Birincil dışa aktarmayı açar; yoksa false. */
export function openPrimaryExport(format = "pdf") {
  const e = primaryExport();
  if (!e) return false;
  e.open(format);
  return true;
}

export const markPrintHandled = () => { handled = true; };

/**
 * ⌘P komutu: aynı olay döngüsündeki ekran işleyicileri önce çalışır; hiçbiri
 * markPrintHandled() demediyse birincil dışa aktarma ya da fallback() açılır.
 */
export function handlePrintCommand(fallback) {
  handled = false;
  setTimeout(() => {
    if (handled) { handled = false; return; }
    if (typeof document !== "undefined" && document.querySelector(".xp-layer")) return; // pencere zaten açık
    if (!openPrimaryExport("pdf")) fallback?.();
  }, 0);
}

/** Testler için. */
export const _resetRegistry = () => { entries.clear(); handled = false; };
