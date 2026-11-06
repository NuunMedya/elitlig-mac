// Yayın Stüdyosu — MAÇ ÖZETİ: oluştur (renderHighlight), önizle, maç sayfasına
// yükle, sil / yeniden oluştur.
//
//   GET  /api/match-highlights?match_id=   → { items: [{ id, url, poster_url, duration_ms, created_at }] }
//   studio.uploadHighlight({ matchId, name, durationMs, width, height }) → { ok, data }
//   studio.deleteHighlight({ matchId }) → { ok }
import { useCallback, useEffect, useRef, useState } from "react";
import { getMatchHighlights } from "./studioApi";
import { renderHighlight } from "./renderHighlight";
import { HIGHLIGHT_SIZE } from "../../lib/studio/highlights";

const studio = () => window.elitlig?.studio;

export function useHighlights(matchId) {
  const [server, setServer] = useState({ loading: false, item: null, error: null });
  const [job, setJob] = useState({ phase: "idle", progress: 0, elapsedMs: 0, file: null, error: null, loaded: 0, total: 0 });
  const signalRef = useRef(null);

  const reload = useCallback(async () => {
    if (!matchId) { setServer({ loading: false, item: null, error: null }); return; }
    setServer((s) => ({ ...s, loading: true }));
    const r = await getMatchHighlights(matchId);
    const items = r.ok ? (Array.isArray(r.data?.items) ? r.data.items : Array.isArray(r.data) ? r.data : []) : [];
    setServer({ loading: false, item: items[0] || null, error: r.ok ? null : r.error?.message || "Özet bilgisi alınamadı." });
  }, [matchId]);
  useEffect(() => { reload(); }, [reload]);
  useEffect(() => { setJob({ phase: "idle", progress: 0, elapsedMs: 0, file: null, error: null }); }, [matchId]);

  // Gelen ilerleme olayı (ana süreç dönüştürürken).
  // Ana süreç dönüştürürken: { renderId, outTimeMs, phase }; yüklerken: { kind: "highlight", loaded, total }.
  useEffect(() => studio()?.render?.onProgress?.((p) => {
    if (p && Number.isFinite(Number(p.outTimeMs))) setJob((j) => (j.phase === "finishing" && j.durationMs ? { ...j, progress: Math.min(1, Number(p.outTimeMs) / j.durationMs) } : j));
  }), []);
  useEffect(() => studio()?.onUploadProgress?.((p) => {
    if (p?.kind === "highlight" && p.total) setJob((j) => (j.phase === "uploading" ? { ...j, progress: Math.min(1, p.loaded / p.total) } : j));
  }), []);

  const build = useCallback(async ({ plan, info, images, boardOf, stingerKind }) => {
    if (signalRef.current) return;
    const signal = { cancelled: false };
    signalRef.current = signal;
    setJob({ phase: "preparing", progress: 0, elapsedMs: 0, file: null, error: null, durationMs: plan.durationMs });
    let last = 0;
    try {
      const res = await renderHighlight({
        plan, info, images, boardOf, signal, stingerKind,
        onPhase: (phase) => setJob((j) => ({ ...j, phase })),
        onProgress: (p, t, load) => {
          const now = performance.now();
          if (load) { setJob((j) => ({ ...j, loaded: load.loaded, total: load.total })); return; }
          if (now - last < 200 && p < 1) return; // arayüzü saniyede 5 kez güncelle
          last = now;
          setJob((j) => ({ ...j, progress: p, elapsedMs: t }));
        },
      });
      if (res.cancelled) setJob({ phase: "idle", progress: 0, elapsedMs: 0, file: null, error: null });
      else if (!res.ok) setJob((j) => ({ ...j, phase: "error", error: res.error?.message || "Özet oluşturulamadı." }));
      else setJob((j) => ({ ...j, phase: "done", progress: 1, file: res.file }));
    } catch (e) {
      setJob((j) => ({ ...j, phase: "error", error: e?.message || "Özet oluşturulamadı." }));
    } finally {
      signalRef.current = null;
    }
  }, []);

  const cancel = useCallback(() => { if (signalRef.current) signalRef.current.cancelled = true; }, []);
  useEffect(() => () => { if (signalRef.current) signalRef.current.cancelled = true; }, []);

  const upload = useCallback(async () => {
    const f = job.file;
    if (!f || !matchId) return { ok: false };
    setJob((j) => ({ ...j, phase: "uploading", progress: 0, error: null }));
    try {
      const res = await studio()?.uploadHighlight?.({ matchId: Number(matchId), name: f.name, path: f.path, durationMs: Math.round(f.durationMs || 0), width: f.width || HIGHLIGHT_SIZE.width, height: f.height || HIGHLIGHT_SIZE.height });
      if (!res?.ok) throw new Error(res?.error?.message || "Özet yüklenemedi.");
      setJob((j) => ({ ...j, phase: "uploaded" }));
      await reload();
      return { ok: true };
    } catch (e) {
      setJob((j) => ({ ...j, phase: "done", error: e?.message || "Özet yüklenemedi." }));
      return { ok: false, error: e?.message };
    }
  }, [job.file, matchId, reload]);

  const remove = useCallback(async () => {
    if (!matchId) return { ok: false };
    const res = await studio()?.deleteHighlight?.({ matchId: Number(matchId) });
    await reload();
    return res?.ok ? { ok: true } : { ok: false, error: res?.error?.message || "Özet silinemedi." };
  }, [matchId, reload]);

  const reset = useCallback(() => setJob({ phase: "idle", progress: 0, elapsedMs: 0, file: null, error: null }), []);

  return { server, job, build, cancel, upload, remove, reset, reload, available: Boolean(studio()?.render?.start) };
}
