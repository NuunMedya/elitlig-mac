// Yayın Stüdyosu · gömülü yazı tipleri (tuval çizimleri için).
//
// Inter (metin, etiket, rakam) ve Barlow Condensed (manşet, skor, rozet) —
// ikisi de SIL Open Font License 1.1 (assets/fonts/OFL-*.txt). Dosyalar
// uygulamayla gelir (ağ gerekmez); latin + latin-ext alt kümeleri Türkçe
// harfleri (ç ğ ı İ ö ş ü) kapsar.
//
// Tuval, yazı tipi yüklenmeden çizerse yedek yazı tipine düşer: kapak üretimi
// loadStudioFonts()'u bekler; VAR / önizleme gibi her kare çizilen yüzeyler
// yüklemeyi başlatır ve yüklenince yeniden çizer (onStudioFontsReady).

export const SANS = "\"Inter\", \"SF Pro Text\", \"Helvetica Neue\", \"Segoe UI\", Arial, sans-serif";
export const COND = "\"Barlow Condensed\", \"Arial Narrow\", \"Helvetica Neue\", Arial, sans-serif";

const LATIN = "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD";
const LATIN_EXT = "U+0100-02AF,U+0304,U+0308,U+0329,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF";

// Vite: dosya adresleri (paketlenmiş varlık). Test ortamında da yol döner.
const FILES = import.meta.glob("../../assets/fonts/*.woff2", { eager: true, query: "?url", import: "default" });

/** Dosya adından yüz tanımı: inter-latin-ext-700-normal.woff2 → { family, subset, weight, style }. */
export function parseFontFile(path) {
  const m = /(inter|barlow-condensed)-(latin(?:-ext)?)-(\d{3})-(normal|italic)\.woff2$/.exec(String(path));
  if (!m) return null;
  return { family: m[1] === "inter" ? "Inter" : "Barlow Condensed", subset: m[2], weight: m[3], style: m[4] };
}

/** Yüklenecek yüzler: [{ family, weight, style, unicodeRange, url }]. */
export const STUDIO_FONT_FACES = Object.freeze(Object.entries(FILES).map(([path, url]) => {
  const f = parseFontFile(path);
  return f ? { family: f.family, weight: f.weight, style: f.style, unicodeRange: f.subset === "latin" ? LATIN : LATIN_EXT, url: String(url) } : null;
}).filter(Boolean));

let promise = null;
let ready = false;
const waiters = new Set();

/** Yazı tipleri yüklendi mi (tuval çizimi hazır)? */
export const studioFontsReady = () => ready;

/** Yüklenince bir kez çağrılır (zaten yüklüyse hemen). → aboneliği kaldıran işlev. */
export function onStudioFontsReady(cb) {
  if (ready) { cb(); return () => {}; }
  waiters.add(cb);
  loadStudioFonts();
  return () => waiters.delete(cb);
}

/**
 * Gömülü yazı tiplerini belgeye ekler ve yükler (bir kez). Hata fırlatmaz:
 * yüklenemezse (ör. test ortamı) false ile çözülür, çizim yedek yazı tipiyle sürer.
 */
export function loadStudioFonts({ timeoutMs = 4000 } = {}) {
  if (promise) return promise;
  if (typeof FontFace === "undefined" || typeof document === "undefined" || !document.fonts) {
    promise = Promise.resolve(false);
    return promise;
  }
  const faces = STUDIO_FONT_FACES.map((f) => {
    try {
      const face = new FontFace(f.family, `url(${f.url}) format("woff2")`, { weight: f.weight, style: f.style, unicodeRange: f.unicodeRange, display: "swap" });
      document.fonts.add(face);
      return face.load().catch(() => null);
    } catch { return Promise.resolve(null); }
  });
  const all = Promise.all(faces).then((list) => list.some(Boolean));
  const timeout = new Promise((r) => { setTimeout(() => r(false), timeoutMs); });
  promise = Promise.race([all, timeout]).then((ok) => {
    ready = true;
    for (const cb of [...waiters]) { try { cb(); } catch { /* yoksay */ } }
    waiters.clear();
    return ok;
  });
  return promise;
}
