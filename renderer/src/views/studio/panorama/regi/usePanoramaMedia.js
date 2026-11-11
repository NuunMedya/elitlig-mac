// Panorama rejisi · MEDYA OYNATMA DENETİMİ: medya kutusundaki videoların çalışma anı (video öğesi
// karıştırıcının kaynak çalışma tablosunda: runtimeRef → pano_md_<id>). Yayına gelen öğe giriş
// noktasından başlar; çıkış noktasında döner ya da durur; ses düzeyi / sessiz; ses yalnız YAYINDAYKEN
// programa gider (karıştırıcının "media" şeridi, kapı). Küçük resim ve süre dosyadan çıkarılır.
import { useCallback, useEffect, useRef, useState } from "react";
import { inOutStep, isMediaScene, itemOfScene, mediaSourceId, playableUrl } from "../../../../lib/studio/panorama/mediaBin";

/** Öğenin şu an YAYINDA (programda görünür) olup olmadığı. */
export function onAirMedia(media, programId, angles) {
  const ids = new Set();
  const it = itemOfScene(media, programId);
  if (it) ids.add(it.id);
  if (media.overlay && !media.overlay.hideAt) ids.add(media.overlay.id);
  if (!isMediaScene(programId) && angles.some((a) => a.id === programId)) for (const id of Object.values(media.slots?.[programId] || {})) ids.add(id);
  return ids;
}

/** Küçük resim (160×90 data:) ve süre. */
export async function probeMedia(item) {
  const url = playableUrl(item.url);
  const c = document.createElement("canvas"); c.width = 192; c.height = 108;
  const ctx = c.getContext("2d");
  const fit = (w, h) => { const k = Math.min(c.width / w, c.height / h); const dw = w * k; const dh = h * k; return [(c.width - dw) / 2, (c.height - dh) / 2, dw, dh]; };
  ctx.fillStyle = "#000"; ctx.fillRect(0, 0, c.width, c.height);
  if (item.kind === "image") {
    const el = await new Promise((res, rej) => { const i = new Image(); i.crossOrigin = "anonymous"; i.onload = () => res(i); i.onerror = () => rej(new Error("Görsel açılamadı.")); i.src = url; });
    ctx.drawImage(el, ...fit(el.naturalWidth || 1, el.naturalHeight || 1));
    return { thumb: c.toDataURL("image/jpeg", 0.8), duration: 0 };
  }
  const v = document.createElement("video");
  v.crossOrigin = "anonymous"; v.muted = true; v.preload = "auto"; v.src = url;
  await new Promise((res, rej) => { v.onloadedmetadata = res; v.onerror = () => rej(new Error("Video açılamadı.")); setTimeout(res, 8000); });
  const dur = Number.isFinite(v.duration) ? v.duration : 0;
  try {
    v.currentTime = Math.min(Math.max(item.inSec || 0, dur * 0.1), Math.max(0, dur - 0.1));
    await new Promise((res) => { v.onseeked = res; setTimeout(res, 3000); });
    ctx.drawImage(v, ...fit(v.videoWidth || 16, v.videoHeight || 9));
  } catch { /* küçük resim yok */ }
  let thumb = null;
  try { thumb = c.toDataURL("image/jpeg", 0.8); } catch { thumb = null; }
  v.removeAttribute("src"); v.load();
  return { thumb, duration: dur };
}

export function usePanoramaMedia({ pano, setPano, runtimeRef, mixer, programId }) {
  const [tick, setTick] = useState(0);
  const prevAir = useRef(new Set());
  const items = pano.media.items;
  const airIds = onAirMedia(pano.media, programId, pano.angles);
  const airKey = [...airIds].sort().join(",");
  const elOf = useCallback((id) => { const rt = runtimeRef.current?.get(mediaSourceId(id)); return rt?.el instanceof HTMLVideoElement ? rt.el : null; }, [runtimeRef]);
  const stateRef = useRef({ items, airIds });
  stateRef.current = { items, airIds };

  // Yayına gelen video giriş noktasından başlar; yayından çıkan durur (bir sonraki yayına hazır).
  useEffect(() => {
    const now = new Set(airKey ? airKey.split(",") : []);
    for (const id of now) {
      if (prevAir.current.has(id)) continue;
      const it = items.find((x) => x.id === id);
      const el = elOf(id);
      if (it?.kind === "video" && el) { try { el.currentTime = it.inSec || 0; } catch { /* yoksay */ } el.play().catch(() => {}); }
    }
    prevAir.current = now;
  }, [airKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Giriş / çıkış noktası, ses düzeyi, ses kapısı (yalnız yayındaki öğe) — 200 ms'de bir.
  useEffect(() => {
    const t = setInterval(() => {
      const { items: list, airIds: air } = stateRef.current;
      for (const it of list) {
        if (it.kind !== "video") continue;
        const el = elOf(it.id);
        if (!el) continue;
        el.loop = it.loop && !(it.outSec > 0);
        const vol = it.muted ? 0 : it.volume;
        if (Math.abs(el.volume - vol) > 0.01) el.volume = Math.max(0, Math.min(1, vol));
        const step = inOutStep(it, el.currentTime);
        if (step.seek != null) { try { el.currentTime = step.seek; } catch { /* yoksay */ } }
        else if (step.stop && !el.paused) el.pause();
        if (mixer?.attachMedia) mixer.attachMedia(el, { strip: "media", on: air.has(it.id) && !it.muted });
      }
      setTick((n) => (n + 1) % 1e6);
    }, 200);
    return () => clearInterval(t);
  }, [elOf, mixer]);

  const control = useCallback((id, op, v) => {
    const el = elOf(id);
    if (!el) return false;
    if (op === "play") el.play().catch(() => {});
    else if (op === "pause") el.pause();
    else if (op === "toggle") { if (el.paused) el.play().catch(() => {}); else el.pause(); }
    else if (op === "seek") { try { el.currentTime = Math.max(0, Number(v) || 0); } catch { /* yoksay */ } }
    else if (op === "restart") { const it = stateRef.current.items.find((x) => x.id === id); try { el.currentTime = it?.inSec || 0; } catch { /* yoksay */ } el.play().catch(() => {}); }
    return true;
  }, [elOf]);
  const status = useCallback((id) => { const el = elOf(id); return el ? { t: el.currentTime || 0, d: Number.isFinite(el.duration) ? el.duration : 0, paused: el.paused } : null; }, [elOf]);

  // Küçük resmi olmayan öğeler (yeni eklenen) için küçük resim + süre.
  const probing = useRef(new Set());
  useEffect(() => {
    for (const it of items) {
      if (it.thumb || probing.current.has(it.id)) continue;
      probing.current.add(it.id);
      probeMedia(it).then((r) => setPano((p) => ({ ...p, media: { ...p.media, items: p.media.items.map((x) => (x.id === it.id ? { ...x, thumb: r.thumb, duration: r.duration || x.duration } : x)) } }))).catch(() => {});
    }
  }, [items, setPano]);

  return { airIds, control, status, tick };
}
