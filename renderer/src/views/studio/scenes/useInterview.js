// Yayın Stüdyosu — RÖPORTAJ kaydı (bant stili ve isimler grafik modülünde: g.interview).
//
//   studio.interview.start({ matchId, label }) → { ok, id }   programı bu andan itibaren kaydeder
//   studio.interview.stop(id)                  → { ok, file: { name, path, url, durationMs, … } }
//   studio.interview.upload({ matchId, name }) → { ok, data: { url } }  maçın röportaj alanına
//   studio.onUploadProgress(p)                 p.kind === "interview" → { loaded, total }
// Başlayınca röportaj bandı yayına alınır (g.setInterviewOnAir?.(true)), bitince kalkar.
import { useCallback, useEffect, useRef, useState } from "react";

const api = () => window.elitlig?.studio?.interview;

export function useInterview({ matchId, graphics, encoding, toast }) {
  const [st, setSt] = useState({ status: "idle" }); // idle | starting | recording | stopping | uploading | done | error
  const gRef = useRef(graphics);
  gRef.current = graphics;
  const toastRef = useRef(toast);
  toastRef.current = toast;

  useEffect(() => window.elitlig?.studio?.onUploadProgress?.((p) => {
    if (!p || p.kind !== "interview") return;
    const done = p.loaded ?? p.sent;
    const pct = Number.isFinite(p.pct) ? p.pct : p.total ? Math.round((done / p.total) * 100) : null;
    setSt((s) => (s.status === "uploading" ? { ...s, progress: pct } : s));
  }), []);

  const start = useCallback(async (label = "Röportaj") => {
    if (!api()?.start) { toastRef.current?.("Röportaj kaydı bu uygulama sürümünde yok.", { tone: "warn" }); return; }
    if (!matchId) { toastRef.current?.("Önce maç seç (Maç yönetimi).", { tone: "warn" }); return; }
    if (!encoding) { toastRef.current?.("Röportaj kaydı için yayın ya da prova açık olmalı.", { tone: "warn", timeout: 4500 }); return; }
    setSt({ status: "starting" });
    try {
      const res = await api().start({ matchId, label });
      if (!res?.ok) throw new Error(res?.error?.message || "Röportaj kaydı başlatılamadı.");
      setSt({ status: "recording", id: res.id, startedAt: Date.now(), label });
      try { gRef.current?.setInterviewOnAir?.(true); } catch { /* yoksay */ }
    } catch (e) {
      setSt({ status: "error", error: e?.message || "Röportaj kaydı başlatılamadı." });
      toastRef.current?.(e?.message || "Röportaj kaydı başlatılamadı.", { tone: "error" });
    }
  }, [encoding, matchId]);

  const upload = useCallback(async (file) => {
    setSt((s) => ({ ...s, status: "uploading", file, progress: 0 }));
    try {
      const res = await api().upload({ matchId, name: file.name });
      if (!res?.ok) throw new Error(res?.error?.message || "Röportaj yüklenemedi.");
      setSt((s) => ({ ...s, status: "done", url: res.data?.url || null, progress: 100 }));
      toastRef.current?.("Röportaj maç sayfasına yüklendi.", { tone: "success", timeout: 5000 });
    } catch (e) {
      setSt((s) => ({ ...s, status: "error", error: e?.message || "Röportaj yüklenemedi." }));
      toastRef.current?.(e?.message || "Röportaj yüklenemedi.", { tone: "error", timeout: 6000 });
    }
  }, [matchId]);

  const stop = useCallback(async () => {
    const id = st.id;
    if (st.status !== "recording" || !id) return;
    setSt((s) => ({ ...s, status: "stopping" }));
    try { gRef.current?.setInterviewOnAir?.(false); } catch { /* yoksay */ }
    try {
      const res = await api().stop(id);
      if (!res?.ok || !res.file) throw new Error(res?.error?.message || "Röportaj kaydı kapatılamadı.");
      await upload(res.file);
    } catch (e) {
      setSt((s) => ({ ...s, status: "error", error: e?.message || "Röportaj kaydı kapatılamadı." }));
      toastRef.current?.(e?.message || "Röportaj kaydı kapatılamadı.", { tone: "error" });
    }
  }, [st.id, st.status, upload]);

  const retry = useCallback(() => { if (st.file) upload(st.file); }, [st.file, upload]);
  const dismiss = useCallback(() => setSt({ status: "idle" }), []);

  return { ...st, available: Boolean(api()?.start), recording: st.status === "recording", start, stop, retry, dismiss };
}

/** 00:42 biçimi. */
export const interviewClock = (ms) => {
  const t = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
};
