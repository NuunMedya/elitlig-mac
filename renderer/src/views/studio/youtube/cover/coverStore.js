// YouTube kapağı · ayar deposu (bu bilgisayarda, localStorage) + kapak verisi
// (maç, armalar, marka) + oluşturup YouTube'a yükleme.
//
//   useCoverSettings()        [ayarlar, güncelle] — Ayarlar › YouTube kapağı, kapak
//                             penceresi ve otomatik yükleme aynı depoyu paylaşır
//   loadCoverData(matchId, …) maç + takımlar (GET /api/live-matches/:id/snapshot)
//                             + marka (GET /api/maclar/:id/overlay-branding)
//   createAndUploadCover(…)   1280×720 JPEG (< 2 MB) → POST
//                             /api/admin/live-streams/matches/:id/thumbnail
import { useEffect, useState } from "react";
import { request } from "../../../../api";
import { buildCoverData, normalizeCoverSettings, SAMPLE_COVER_DATA } from "../../../../lib/studio/cover/model";
import { renderCoverJpeg } from "../../../../lib/studio/cover/render";
import { resolveBranding } from "../../../../lib/studio/graphics/branding";
import { getBranding } from "../../graphics/graphicsApi";
import * as studioApi from "../../studioApi";
import logoInline from "../../../../assets/elitlig-beyaz.png?inline";

export const DEFAULT_BRAND_LOGO = logoInline;

const KEY = "elitlig.studio.youtubeCover.v1";
const read = () => { try { return normalizeCoverSettings(JSON.parse(localStorage.getItem(KEY) || "null")); } catch { return normalizeCoverSettings(null); } };

let current = null;
const subs = new Set();
const ensure = () => { if (!current) current = read(); return current; };

export const getCoverSettings = () => ensure();

export function setCoverSettings(patch) {
  const cur = ensure();
  const p = typeof patch === "function" ? patch(cur) : patch;
  current = normalizeCoverSettings({ ...cur, ...p, show: p?.show ? { ...cur.show, ...p.show } : cur.show });
  try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* yer yoksa yalnız bellekte */ }
  subs.forEach((fn) => fn(current));
  return current;
}

export function useCoverSettings() {
  const [s, setS] = useState(ensure);
  useEffect(() => {
    subs.add(setS);
    setS(ensure());
    return () => { subs.delete(setS); };
  }, []);
  return [s, setCoverSettings];
}

/* ------------------------------ son kapak verisi ------------------------------ */
// Ayarlar sayfasındaki önizlemeler son açılan maçın verisiyle çizilir (yoksa örnek maç).

let lastData = null;
const dataSubs = new Set();
const setLastCoverData = (d) => { lastData = d; dataSubs.forEach((fn) => fn(d)); };

export function useLastCoverData() {
  const [d, setD] = useState(lastData);
  useEffect(() => { dataSubs.add(setD); setD(lastData); return () => { dataSubs.delete(setD); }; }, []);
  return d || SAMPLE_COVER_DATA;
}

const readExtras = (id) => { try { return JSON.parse(localStorage.getItem(`elitlig.studio.brandingExtras.${id}`) || "null") || null; } catch { return null; } };

/** Maçın kapak verisi; uçlardan biri yanıt vermezse eldeki verilerle yetinir. */
export async function loadCoverData(matchId, { match = null, homeName, awayName } = {}) {
  const id = Number(matchId) > 0 ? Number(matchId) : null;
  const [m, snap, brand] = await Promise.all([
    match || !id ? Promise.resolve(match) : studioApi.getMatch(id).then((r) => (r?.ok ? r.data : null)).catch(() => null),
    id ? studioApi.getSnapshot(id).then((r) => (r?.ok ? r.data : null)).catch(() => null) : null,
    id ? getBranding(id).then((r) => (r?.ok ? r.data?.branding || null : null)).catch(() => null) : null,
  ]);
  const teams = snap?.teams || {};
  const extras = id ? readExtras(id) : null;
  const data = buildCoverData({
    match: { ...(m || {}), id: m?.id ?? id },
    homeName: homeName || teams.home?.name,
    awayName: awayName || teams.away?.name,
    logos: { home: teams.home?.logo || null, away: teams.away?.logo || null },
    colors: { home: extras?.homeColor || null, away: extras?.awayColor || null },
    branding: brand ? { ...brand, extras: { ...(brand.extras || {}), ...(extras || {}) } } : (extras ? { extras } : null),
    brandAccent: brand ? resolveBranding(brand).accent : null,
  });
  setLastCoverData(data);
  return data;
}

/** POST …/matches/:id/thumbnail { image: data:image/jpeg;base64,…, set_match_picture? } */
export const uploadThumbnail = (matchId, dataUrl, { siteCover = true } = {}) => request({
  method: "POST",
  path: `/api/admin/live-streams/matches/${matchId}/thumbnail`,
  body: { image: dataUrl, ...(siteCover ? {} : { set_match_picture: false }) },
  cache: false,
  queue: false,
});

/** Kapağı üretir (JPEG) — yüklemeden. */
export const renderCover = (data, settings) => renderCoverJpeg(data, normalizeCoverSettings(settings), { defaultBrandLogo: DEFAULT_BRAND_LOGO });

/**
 * Kapağı üretir ve YouTube'a yükler. Hata: Error (message: sunucunun Türkçe iletisi, code).
 * @returns {Promise<{ cover: object, result: object }>}
 */
export async function createAndUploadCover(matchId, data, settings) {
  const s = normalizeCoverSettings(settings);
  const cover = await renderCover(data, s);
  const result = await studioApi.must(uploadThumbnail(matchId, cover.dataUrl, { siteCover: s.siteCover }), "Kapak YouTube'a yüklenemedi.");
  return { cover, result };
}

/**
 * Seçilen zemin fotoğrafını 1280×720 JPEG'e küçültür (localStorage'a sığsın).
 * @param {File|Blob} file
 */
export function shrinkBackground(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Görsel okunamadı."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Görsel açılamadı (JPEG / PNG seçin)."));
      img.onload = () => {
        const k = Math.max(1280 / img.naturalWidth, 720 / img.naturalHeight, 0.0001);
        const w = 1280; const h = 720;
        const c = document.createElement("canvas");
        c.width = w; c.height = h;
        const sw = w / k; const sh = h / k;
        c.getContext("2d").drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, 0, 0, w, h);
        resolve(c.toDataURL("image/jpeg", 0.82));
      };
      img.src = String(reader.result || "");
    };
    reader.readAsDataURL(file);
  });
}
