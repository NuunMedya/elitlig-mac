// Yayın Stüdyosu — AÇI KAYDI: her kaynağın ayrı halka kaydı (çok açılı tekrar).
//
// Kodlayıcı (yayın ya da prova) açıkken ve "Tekrar & Özet" sekmesinde seçili
// kaynak varsa: studio.angles.start({ sources }) → ok gelince her kaynak için
// TAZE bir MediaRecorder (kaynağın kendi görüntü izi, 250 ms parça) kurulur;
// parçalar sırayla studio.angles.pushChunk(kaynakId, ArrayBuffer) ile gider.
// Ana süreç o kaynağın ffmpeg'ini yeniden başlatınca onRestartRecorder
// ({ sourceId }) gelir: yalnız o kaynağın kaydedicisi yeniden kurulur.
// Kaynağın akışı değişirse (kamera yeniden bağlandı) kaydedici de yenilenir.
//
// Kaynağın görüntü ayarı (fx) varsa açı da AYARLI kaydedilir (./fx/fxFeed: işlenmiş
// kare tuvalden captureStream); ayar açılıp kapanınca kaydedici yenilenir.
//
// API yoksa (eski motor) hiçbir şey yapmaz: tekrarlar yalnız program açısıyla.
import { useCallback, useEffect, useRef, useState } from "react";
import { VIDEO_ONLY_MIME_PREFERENCE, pickMimeType } from "../../lib/studio/broadcast";
import { effectiveFx } from "../../lib/studio/videoFx";
import { createFxFeed } from "./fx/fxFeed";

const studio = () => window.elitlig?.studio;
export const ANGLE_BITRATE_KBPS = 6000;

/** Kaynağın kaydedilebilir görüntü izi (kamera / ekran akışı ya da video dosyası). */
function videoTrackOf(rt) {
  if (!rt || rt.status !== "live") return null;
  const t = rt.stream?.getVideoTracks?.()[0];
  if (t && t.readyState !== "ended") return t;
  const el = rt.el;
  if (el instanceof HTMLVideoElement && typeof el.captureStream === "function") {
    try {
      if (!rt.capture) rt.capture = el.captureStream();
      return rt.capture.getVideoTracks()[0] || null;
    } catch { return null; }
  }
  return null;
}

export function useAngleRecorders({ active, sourceIds, sources, runtimeRef, version, onError }) {
  const api = studio()?.angles;
  const available = Boolean(api?.start && api?.pushChunk);
  const recs = useRef(new Map()); // sourceId → { rec, gen, chain, trackId }
  const startedRef = useRef(false);
  const [status, setStatus] = useState([]);
  const errRef = useRef(onError);
  errRef.current = onError;
  const namesRef = useRef(new Map());
  namesRef.current = new Map((sources || []).map((s) => [s.id, s.name]));
  const sourcesRef = useRef(new Map());
  sourcesRef.current = new Map((sources || []).map((s) => [s.id, s]));
  const feeds = useRef(new Map()); // sourceId → { feed, base } görüntü ayarlı akış
  // Görüntü ayarı açık kaynaklar (değişince ilgili kaydedici yenilenir).
  const fxSig = (sources || []).filter((s) => effectiveFx(s, null)).map((s) => s.id).sort().join(",");
  const key = active && available ? [...sourceIds].sort().join(",") : "";

  const stopOne = useCallback((id) => {
    const r = recs.current.get(id);
    if (!r) return;
    r.gen.value += 1;
    try { if (r.rec && r.rec.state !== "inactive") r.rec.stop(); } catch { /* yoksay */ }
    recs.current.delete(id);
    const f = feeds.current.get(id);
    if (f) { f.feed.stop(); feeds.current.delete(id); }
  }, []);

  /** Kaydedilecek iz: görüntü ayarı varsa işlenmiş akış, yoksa kaynağın kendi izi. */
  const trackFor = useCallback((id) => {
    const rt = runtimeRef.current.get(id);
    const base = videoTrackOf(rt);
    if (!base) return null;
    const src = sourcesRef.current.get(id);
    if (!src || !effectiveFx(src, null)) return base;
    const fps = Number(base.getSettings?.().frameRate) || Number(src.fps) || 30;
    const feed = createFxFeed(() => sourcesRef.current.get(id), () => runtimeRef.current.get(id), Math.min(60, Math.max(15, Math.round(fps))));
    if (!feed) return base;
    feeds.current.set(id, { feed, base: base.id });
    return feed.track;
  }, [runtimeRef]);

  const startOne = useCallback((id) => {
    if (!startedRef.current) return false;
    stopOne(id);
    const track = trackFor(id);
    if (!track) { recs.current.set(id, { rec: null, gen: { value: 0 }, trackId: null }); return false; }
    const mimeType = pickMimeType((t) => MediaRecorder.isTypeSupported(t), VIDEO_ONLY_MIME_PREFERENCE);
    let rec;
    try {
      rec = new MediaRecorder(new MediaStream([track]), {
        mimeType: mimeType || undefined,
        videoBitsPerSecond: ANGLE_BITRATE_KBPS * 1000,
        // 1 sn'de bir anahtar kare: ana süreç H.264 açıları yeniden kodlamadan
        // (copy) 1 sn'lik parçalara böler; tekrar penceresi bu sayede hassas olur.
        videoKeyFrameIntervalDuration: 1000,
      });
    } catch (e) {
      errRef.current?.(`Açı kaydı açılamadı (${namesRef.current.get(id) || id}): ${e?.message || e}`);
      return false;
    }
    const baseId = feeds.current.get(id)?.base || track.id;
    const gen = { value: 0 };
    const mine = 0;
    const entry = { rec, gen, trackId: baseId, fx: feeds.current.has(id), chain: Promise.resolve() };
    // İlk parça ≥ 4 KB olana dek biriktirilir: soğuk kodlayıcıda Chromium 1 baytlık
    // ilk parça verebiliyor; ana süreç tam kapsayıcı başlığı bekler.
    let head = [];
    let headBytes = 0;
    rec.ondataavailable = (e) => {
      if (gen.value !== mine || !e.data?.size) return;
      let blob = e.data;
      if (head) {
        head.push(blob);
        headBytes += blob.size;
        if (headBytes < 4096) return;
        blob = new Blob(head);
        head = null;
      }
      entry.chain = entry.chain.then(async () => {
        if (gen.value !== mine) return;
        const buf = await blob.arrayBuffer();
        if (gen.value !== mine) return;
        await studio()?.angles?.pushChunk?.(id, buf);
      }).catch(() => {});
    };
    rec.start(250);
    recs.current.set(id, entry);
    return true;
  }, [stopOne, trackFor]);

  const stopAll = useCallback(() => { for (const id of [...recs.current.keys()]) stopOne(id); }, [stopOne]);

  // Başlat / durdur (seçim ya da kodlayıcı durumu değişince baştan).
  useEffect(() => {
    if (!key) return undefined;
    const ids = key.split(",").filter(Boolean);
    if (!ids.length) return undefined;
    let cancelled = false;
    const list = ids.map((id) => ({ id, name: namesRef.current.get(id) || id }));
    const mimeType = typeof MediaRecorder !== "undefined" ? pickMimeType((t) => MediaRecorder.isTypeSupported(t), VIDEO_ONLY_MIME_PREFERENCE) : "";
    Promise.resolve(studio()?.angles?.start?.({ sources: list, mimeType, videoBitrateKbps: ANGLE_BITRATE_KBPS }))
      .then((res) => {
        if (cancelled) return;
        if (res && res.ok === false) { errRef.current?.(res.error?.message || "Açı kaydı başlatılamadı."); return; }
        startedRef.current = true;
        ids.forEach((id) => startOne(id));
      })
      .catch((e) => { if (!cancelled) errRef.current?.(e?.message || "Açı kaydı başlatılamadı."); });
    return () => {
      cancelled = true;
      const was = startedRef.current;
      startedRef.current = false;
      stopAll();
      if (was) Promise.resolve(studio()?.angles?.stop?.()).catch(() => {});
    };
  }, [key, startOne, stopAll]);

  // Kaynağın akışı değişti / ilk açılışta hazır değildi → kaydediciyi yenile.
  useEffect(() => {
    if (!startedRef.current) return;
    const fxOn = new Set(fxSig.split(",").filter(Boolean));
    for (const [id, r] of recs.current) {
      const track = videoTrackOf(runtimeRef.current.get(id));
      if ((track?.id || null) !== r.trackId || Boolean(r.fx) !== fxOn.has(id)) startOne(id);
    }
  }, [version, fxSig, startOne, runtimeRef]);

  useEffect(() => studio()?.angles?.onRestartRecorder?.((p) => {
    const id = p?.sourceId;
    if (id && startedRef.current && recs.current.has(id)) startOne(id);
  }), [startOne]);

  // Ara bellek durumu (2 sn'de bir, yalnız kayıt sürerken).
  useEffect(() => {
    if (!key) { setStatus([]); return undefined; }
    let alive = true;
    const poll = () => Promise.resolve(studio()?.angles?.status?.()).then((s) => { if (alive && Array.isArray(s)) setStatus(s); }).catch(() => {});
    poll();
    const t = setInterval(poll, 2000);
    return () => { alive = false; clearInterval(t); };
  }, [key]);

  return { available, status, recording: Boolean(key) };
}
