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
    // Masaüstü medya vekili: pencerede window.elitlig; çizim işçisinde ana taraf bayrağı (globalThis.__elitligMediaProxy).
    const proxied = (typeof window !== "undefined" && window.elitlig) || globalThis.__elitligMediaProxy ? [`elitlig-media://m/${encodeURIComponent(url)}`] : [];
    return [...proxied, url];
  }
  return [url];
}

/** Çizim işçisi (DOM yok): fetch → ImageBitmap (CORS'suz yanıt okunamaz: tuval kirlenmez). */
function loadBitmap(url, entry) {
  const list = candidates(url);
  const tryAt = (i) => {
    if (i >= list.length) { entry.state = "fail"; return; }
    fetch(list[i], /^(data|blob):/i.test(list[i]) ? undefined : { mode: "cors" })
      .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.blob(); })
      .then((b) => createImageBitmap(b))
      .then((bmp) => { entry.img = bmp; entry.state = "ok"; onAnyLoad?.(url); })
      .catch(() => tryAt(i + 1));
  };
  tryAt(0);
}

function load(url, entry) {
  if (typeof Image === "undefined") {
    if (typeof fetch === "function" && typeof createImageBitmap === "function" && typeof OffscreenCanvas === "function") loadBitmap(url, entry);
    else entry.state = "fail";
    return;
  }
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

/**
 * Hazır görseli önbelleğe koy (çizim işçisi: ana pencere yüklediği görseli ImageBitmap
 * olarak gönderir — işçide uzak adres CSP / CORS yüzünden yüklenemeyebilir).
 */
export function putImage(url, img) {
  if (!url || !img) return;
  const prev = cache.get(String(url));
  if (prev?.img && prev.img !== img) { try { prev.img.close?.(); } catch { /* yoksay */ } }
  cache.set(String(url), { img, state: "ok" });
  onAnyLoad?.(url);
}

/** Önceden yükle (snapshot oluşturulurken). */
export const preloadImages = (urls) => { (urls || []).forEach((u) => { if (u && typeof u === "string") getImage(u); }); };

export const imageState = (url) => cache.get(String(url))?.state || null;
export const clearImageCache = () => cache.clear();
