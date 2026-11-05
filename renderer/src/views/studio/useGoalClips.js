// Yayın Stüdyosu — GOL KLİPLERİ KUYRUĞU (mobil useGoalClips ile aynı akış).
//
//   1. GOL'e basıldığı AN capture(): ana süreç yayının son 10 saniyesini
//      (program görüntüsü + gömülü skorbord + ses) dosyaya yazar. Golcü seçimi
//      beklenmez — "o an" basış anıdır.
//   2. Olay sunucuya yazılınca attach(key, eventId, scorer) klibi olaya bağlar.
//   3. Dosya + olay hazır olunca klip arka planda yüklenir (studio.uploadClip);
//      başarısızsa "yeniden dene". Yüklenen klip oyuncunun profilinde ve maç
//      sayfasında "gol videosu" olarak görünür.
//   4. Olay kaydedilmezse (seçim iptal) klip yalnız bu bilgisayarda kalır;
//      tekrar için yine kullanılabilir.
//
// Klip yayından (ya da prova kaydından) alınır; kodlayıcı kapalıyken alınmaz.
import { useCallback, useEffect, useRef, useState } from "react";
import { CLIP_SECONDS } from "../../lib/studio/broadcast";

const studio = () => window.elitlig?.studio;
const errText = (e, fallback) => e?.message || (typeof e === "string" ? e : fallback);

export function useGoalClips(matchId) {
  const [clips, setClips] = useState([]);
  const [older, setOlder] = useState([]);
  const uploading = useRef(new Set());

  const patchClip = useCallback((key, patch) => setClips((list) => list.map((c) => (c.key === key ? { ...c, ...patch } : c))), []);

  // Önceki oturumların klipleri (yalnız bu bilgisayarda).
  const loadOlder = useCallback(async () => {
    try {
      const res = await studio()?.listClips?.();
      const list = Array.isArray(res) ? res : Array.isArray(res?.clips) ? res.clips : [];
      setOlder(list);
    } catch { setOlder([]); }
  }, []);
  useEffect(() => { loadOlder(); }, [loadOlder]);

  /** GOL basışı: son 10 saniyeyi kaydet. */
  const capture = useCallback(({ side, code, minute }) => {
    const key = `clip-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    setClips((list) => [{ key, createdAt: Date.now(), side, code, minute, url: null, name: null, path: null, durationMs: 0, width: 0, height: 0, eventId: null, scorer: null, settled: false, status: "saving" }, ...list]);
    Promise.resolve(studio()?.saveClip?.({ seconds: CLIP_SECONDS }))
      .then((res) => {
        if (!res?.ok || !res.clip) throw new Error(res?.error?.message || "Klip kaydedilemedi.");
        const c = res.clip;
        patchClip(key, { url: c.url, name: c.name, path: c.path, durationMs: c.durationMs, width: c.width, height: c.height, sizeBytes: c.sizeBytes, status: "ready" });
      })
      .catch((e) => patchClip(key, { status: "error", error: errText(e, "Klip kaydedilemedi.") }));
    return key;
  }, [patchClip]);

  /** Olay kaydedildi: klibi olaya bağla (eventId null → yalnız yerel). */
  const attach = useCallback((key, eventId, scorer, side, code) => {
    patchClip(key, { eventId: eventId || null, scorer: scorer || null, settled: true, ...(side ? { side } : {}), ...(code ? { code } : {}) });
  }, [patchClip]);

  const upload = useCallback(async (clip) => {
    if (!clip.name || !clip.eventId || uploading.current.has(clip.key)) return;
    uploading.current.add(clip.key);
    patchClip(clip.key, { status: "uploading", error: null });
    try {
      const res = await studio()?.uploadClip?.({ matchId: Number(matchId), eventId: Number(clip.eventId), name: clip.name, durationMs: Math.round(clip.durationMs || 0), width: clip.width, height: clip.height });
      if (!res?.ok) throw new Error(res?.error?.message || "Yüklenemedi.");
      patchClip(clip.key, { status: "uploaded", serverId: res.data?.id ?? null, serverUrl: res.data?.url ?? null });
    } catch (e) {
      patchClip(clip.key, { status: "failed", error: errText(e, "Yüklenemedi.") });
    } finally {
      uploading.current.delete(clip.key);
    }
  }, [matchId, patchClip]);

  // Dosya + olay hazır olan klipleri yükle.
  useEffect(() => {
    for (const clip of clips) {
      if (clip.status === "ready" && clip.settled) {
        if (clip.eventId) upload(clip);
        else patchClip(clip.key, { status: "local" });
      }
    }
  }, [clips, patchClip, upload]);

  const retry = useCallback((key) => {
    const clip = clips.find((c) => c.key === key);
    if (clip) upload({ ...clip, status: "ready" });
  }, [clips, upload]);

  const remove = useCallback((key) => setClips((list) => list.filter((c) => c.key !== key)), []);

  const deleteFile = useCallback(async (name) => {
    try { await studio()?.deleteClip?.(name); } catch { /* yoksay */ }
    setClips((list) => list.filter((c) => c.name !== name));
    loadOlder();
  }, [loadOlder]);

  const reveal = useCallback((name) => { if (name) studio()?.revealClip?.(name); }, []);

  /** Tekrar için en yeni oynatılabilir klip. */
  const latest = clips.find((c) => c.url && c.status !== "saving" && c.status !== "error") ?? null;

  return { clips, older, capture, attach, retry, remove, deleteFile, reveal, latest, reloadOlder: loadOlder };
}
