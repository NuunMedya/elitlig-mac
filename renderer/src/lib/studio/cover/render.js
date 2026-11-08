// YouTube yayın kapağı · görsel yükleme (CORS-güvenli) ve JPEG üretimi.
//
// Uzak adresler önce masaüstü medya vekilinden (elitlig-media://, CORS'lu),
// sonra doğrudan (crossOrigin=anonymous) denenir; tuvali kirleten görsel
// kullanılmaz (toDataURL çalışmalı). Yüklenemeyen arma yerine baş harf rozeti
// çizilir — kapak her durumda üretilir.

import { COVER_H, COVER_W, dominantColor, encodeUnderBudget } from "./model";
import { drawCover } from "./draw";
import { loadStudioFonts } from "../fonts";

const cache = new Map(); // url → Promise<HTMLImageElement|null>
const LOAD_TIMEOUT_MS = 8000;

function candidates(url) {
  if (/^(data|blob):/i.test(url)) return [url];
  if (/^https?:\/\//i.test(url)) {
    const proxied = typeof window !== "undefined" && window.elitlig ? [`elitlig-media://m/${encodeURIComponent(url)}`] : [];
    return [...proxied, url];
  }
  return [url];
}

function readable(img) {
  try {
    const c = document.createElement("canvas");
    c.width = 2; c.height = 2;
    const cx = c.getContext("2d");
    cx.drawImage(img, 0, 0, 2, 2);
    cx.getImageData(0, 0, 1, 1);
    return true;
  } catch { return false; }
}

function tryLoad(src) {
  return new Promise((resolve) => {
    if (typeof Image === "undefined") { resolve(null); return; }
    const el = new Image();
    if (!/^(data|blob):/i.test(src)) el.crossOrigin = "anonymous";
    el.decoding = "async";
    const t = setTimeout(() => { el.src = ""; resolve(null); }, LOAD_TIMEOUT_MS);
    el.onload = () => { clearTimeout(t); resolve(readable(el) ? el : null); };
    el.onerror = () => { clearTimeout(t); resolve(null); };
    el.src = src;
  });
}

/** Görseli yükler; okunamıyorsa null (hata fırlatmaz). */
export function loadCoverImage(url) {
  if (!url) return Promise.resolve(null);
  if (typeof url === "object") return Promise.resolve(url);
  const key = String(url);
  if (!cache.has(key)) {
    const p = (async () => {
      for (const c of candidates(key)) {
        const img = await tryLoad(c); // eslint-disable-line no-await-in-loop
        if (img) return img;
      }
      return null;
    })();
    cache.set(key, p);
    p.then((img) => { if (!img) cache.delete(key); });
  }
  return cache.get(key);
}

/** Armanın baskın rengi (yüklenmiş görselden); okunamazsa null. */
export function logoColor(img) {
  if (!img || typeof document === "undefined") return null;
  try {
    const c = document.createElement("canvas");
    c.width = 48; c.height = 48;
    const cx = c.getContext("2d", { willReadFrequently: true });
    const w = img.naturalWidth || img.width; const h = img.naturalHeight || img.height;
    if (!w || !h) return null;
    const k = Math.min(48 / w, 48 / h);
    cx.drawImage(img, (48 - w * k) / 2, (48 - h * k) / 2, w * k, h * k);
    return dominantColor(cx.getImageData(0, 0, 48, 48).data);
  } catch { return null; }
}

/**
 * Kapak görsellerini yükler ve armalardan takım renklerini çıkarır.
 * @returns {Promise<{ images: { home, away, brand, bg }, data: object }>}  data: renkleri doldurulmuş kopya
 */
export async function prepareCover(data, settings, { defaultBrandLogo = null } = {}) {
  // Gömülü yazı tipleri yüklenmeden çizilirse yedek yazı tipine düşer: bekle.
  const [home, away, brand, bg] = await Promise.all([
    loadCoverImage(data?.home?.logo),
    loadCoverImage(data?.away?.logo),
    loadCoverImage(data?.brand?.logo || defaultBrandLogo).then((img) => img || (data?.brand?.logo && defaultBrandLogo ? loadCoverImage(defaultBrandLogo) : null)),
    loadCoverImage(settings?.background || null),
    loadStudioFonts(),
  ]);
  const next = {
    ...data,
    home: { ...data.home, color: data.home.color || logoColor(home) },
    away: { ...data.away, color: data.away.color || logoColor(away) },
  };
  return { images: { home, away, brand, bg }, data: next };
}

/** Önizleme tuvaline çizer (tuvalin kendi boyutunda). */
export function paintCover(canvas, data, settings, images) {
  const ctx = canvas.getContext("2d");
  return drawCover(ctx, data, settings, images, { width: canvas.width, height: canvas.height });
}

/**
 * Kapağı üretir: 1280×720 JPEG, 2 MB'ın altında.
 * @returns {Promise<{ dataUrl: string, bytes: number, quality: number, width: number, height: number, colors: object }>}
 */
export async function renderCoverJpeg(data, settings, { defaultBrandLogo = null } = {}) {
  const prepared = await prepareCover(data, settings, { defaultBrandLogo });
  const canvas = document.createElement("canvas");
  canvas.width = COVER_W; canvas.height = COVER_H;
  const colors = paintCover(canvas, prepared.data, settings, prepared.images);
  let out;
  try {
    out = encodeUnderBudget((q) => canvas.toDataURL("image/jpeg", q));
  } catch (e) {
    if (e?.name === "SecurityError") {
      const err = new Error("Kapak görseli okunamadı (bir görsel tuvali kirletti). Zemin fotoğrafını değiştirip tekrar deneyin.");
      err.code = "COVER_TAINTED";
      throw err;
    }
    throw e;
  }
  return { ...out, width: COVER_W, height: COVER_H, colors };
}
