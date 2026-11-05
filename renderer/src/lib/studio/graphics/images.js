// Yayın grafikleri · görsel önbelleği (çizim karesinde eşzamanlı okunur).
//
// getImage(url) → yüklenmiş HTMLImageElement ya da null (yükleme başlar,
// hazır olunca sonraki karede çizilir). Uzak adresler önce masaüstü medya
// vekilinden (elitlig-media://, CORS'lu) sonra doğrudan (crossOrigin) denenir;
// tuvali kirletecek görsel kullanılmaz (yayın çıktısı okunabilir kalsın).
// Bir HTMLImageElement / tuval doğrudan verilirse olduğu gibi döner.

const cache = new Map(); // url → { img, state: "loading" | "ok" | "fail", listeners }
const MAX = 160;
let onAnyLoad = null;

/** Herhangi bir görsel yüklenince çağrılır (ör. önizlemeyi yeniden çiz). */
export const setImageLoadListener = (fn) => { onAnyLoad = typeof fn === "function" ? fn : null; };

function candidates(url) {
  if (/^(data|blob):/i.test(url)) return [url];
  if (/^https?:\/\//i.test(url)) {
    const proxied = typeof window !== "undefined" && window.elitlig ? [`elitlig-media://m/${encodeURIComponent(url)}`] : [];
    return [...proxied, url];
  }
  return [url];
}

function load(url, entry) {
  if (typeof Image === "undefined") { entry.state = "fail"; return; }
  const list = candidates(url);
  const tryAt = (i) => {
    if (i >= list.length) { entry.state = "fail"; return; }
    const el = new Image();
    if (!/^(data|blob):/i.test(list[i])) el.crossOrigin = "anonymous";
    el.decoding = "async";
    el.onload = () => {
      // Kirli tuval denetimi: okunamayan görseli kullanma.
      try {
        if (typeof document !== "undefined") {
          const c = document.createElement("canvas");
          c.width = 2; c.height = 2;
          const cx = c.getContext("2d");
          cx.drawImage(el, 0, 0, 2, 2);
          cx.getImageData(0, 0, 1, 1);
        }
        entry.img = el;
        entry.state = "ok";
        onAnyLoad?.(url);
      } catch { tryAt(i + 1); }
    };
    el.onerror = () => tryAt(i + 1);
    el.src = list[i];
  };
  tryAt(0);
}

export function getImage(src) {
  if (!src) return null;
  if (typeof src === "object") return src; // HTMLImageElement / tuval / ImageBitmap
  const url = String(src);
  let entry = cache.get(url);
  if (!entry) {
    if (cache.size >= MAX) {
      for (const [k, v] of cache) { if (v.state !== "loading") { cache.delete(k); break; } }
    }
    entry = { img: null, state: "loading" };
    cache.set(url, entry);
    load(url, entry);
  }
  return entry.state === "ok" ? entry.img : null;
}

/** Önceden yükle (snapshot oluşturulurken). */
export const preloadImages = (urls) => { (urls || []).forEach((u) => { if (u && typeof u === "string") getImage(u); }); };

export const imageState = (url) => cache.get(String(url))?.state || null;
export const clearImageCache = () => cache.clear();
