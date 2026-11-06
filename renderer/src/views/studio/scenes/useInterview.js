// Yayın Stüdyosu — RÖPORTAJ kaydı (bant stili ve isimler grafik modülünde: g.interview).
//
//   studio.interview.start({ matchId, label }) → { ok, id, interview: { id, startedAt, … } }
//   studio.interview.stop(id)                  → { ok, id, interview, file: { name, path, url, durationMs, … } }
//   studio.interview.upload({ matchId, name }) → { ok, data: { url }, interview, result }
//   studio.interview.status()                  → { active: [{ id, matchId, startedAt, … }] }
//   studio.interview.onStatus(cb)              cb({ active, finished? })  (oturum biterken kendiliğinden bitirilenler)
//   studio.onUploadProgress(p)                 p.kind === "interview" → { loaded, total }
// Başlayınca röportaj bandı yayına alınabilir (bandOnStart), bitince kalkar.
//
// HATA (düzeltildi) "Röportaj kaydı başlatılabiliyor ama durdurulamıyor":
// ana süreç start'ta kimliği { ok, interview: { id } } içinde döndürüyor;
// arayüz res.id okuyordu → kimlik undefined kalıyor, stop() "!id" denetiminde
// sessizce geri dönüyordu (düğme basılıyor ama hiçbir şey olmuyordu). Aynı
// biçimde stop yanıtındaki dosya res.interview'da (arayüz res.file bekliyordu).
// Şimdi iki biçim de okunur; kimlik yoksa ana süreçten status() ile bulunur;
// oturum sonunda ana sürecin kendiliğinden bitirdiği röportaj da yakalanıp yüklenir.
import { useCallback, useEffect, useRef, useState } from "react";

const api = () => window.elitlig?.studio?.interview;

/** start yanıtından kimlik (eski / yeni biçim). */
export const interviewIdOf = (res) => (res?.interview?.id ?? res?.id ?? null);
/** stop yanıtından dosya (eski / yeni biçim). */
export const interviewFileOf = (res) => (res?.interview?.name ? res.interview : res?.file?.name ? res.file : null);
/** En kısa kayıt (ana süreç 1 sn'den kısa röportajı "boş" sayar ve siler). */
export const MIN_INTERVIEW_MS = 1500;

export function useInterview({ matchId, graphics, encoding, toast }) {
  const [st, setSt] = useState({ status: "idle" }); // idle | starting | recording | stopping | uploading | done | error
  const stRef = useRef(st);
  stRef.current = st;
  const gRef = useRef(graphics);
  gRef.current = graphics;
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const bandRef = useRef(true);

  useEffect(() => window.elitlig?.studio?.onUploadProgress?.((p) => {
    if (!p || p.kind !== "interview") return;
    const done = p.loaded ?? p.sent;
    const pct = Number.isFinite(p.pct) ? p.pct : p.total ? Math.round((done / p.total) * 100) : null;
    setSt((s) => (s.status === "uploading" ? { ...s, progress: pct } : s));
  }), []);

  const upload = useCallback(async (file) => {
    setSt((s) => ({ ...s, status: "uploading", file, progress: 0, error: null }));
    try {
      const res = await api().upload({ matchId, name: file.name });
      if (!res?.ok) throw new Error(res?.error?.message || "Röportaj yüklenemedi.");
      const url = res.data?.url || res.result?.url || res.result?.post_roportaj || res.interview?.uploaded?.url || null;
      setSt((s) => ({ ...s, status: "done", url, progress: 100 }));
      toastRef.current?.("Röportaj maç sayfasına yüklendi.", { tone: "success", timeout: 5000 });
    } catch (e) {
      setSt((s) => ({ ...s, status: "error", error: e?.message || "Röportaj yüklenemedi." }));
      toastRef.current?.(e?.message || "Röportaj yüklenemedi.", { tone: "error", timeout: 6000 });
    }
  }, [matchId]);
  const uploadRef = useRef(upload);
  uploadRef.current = upload;

  // Açılışta süren röportajı geri al; ana süreç bitirdiğinde (yayın durdu) yükle.
  useEffect(() => {
    const a = api();
    if (!a) return undefined;
    let alive = true;
    Promise.resolve(a.status?.()).then((res) => {
      if (!alive || stRef.current.status !== "idle") return;
      const mine = (res?.active || []).find((r) => !matchId || !r.matchId || Number(r.matchId) === Number(matchId));
      if (mine) setSt({ status: "recording", id: mine.id, startedAt: Date.parse(mine.startedAt) || Date.now() - (mine.elapsedMs || 0), label: mine.label || "Röportaj" });
    }).catch(() => {});
    const off = a.onStatus?.((ev) => {
      const s = stRef.current;
      if (s.status !== "recording" || !s.id) return;
      if ((ev?.active || []).some((r) => r.id === s.id)) return;
      try { gRef.current?.setInterviewOnAir?.(false); } catch { /* yoksay */ }
      if (ev?.finished?.name) uploadRef.current(ev.finished);
      else setSt({ status: "idle" });
    });
    return () => { alive = false; off?.(); };
  }, [matchId]);

  const start = useCallback(async (label = "Röportaj", { band = true } = {}) => {
    if (!api()?.start) { toastRef.current?.("Röportaj kaydı bu uygulama sürümünde yok.", { tone: "warn" }); return; }
    if (!matchId) { toastRef.current?.("Önce maç seç (Maç yönetimi).", { tone: "warn" }); return; }
    if (!encoding) { toastRef.current?.("Röportaj kaydı için yayın ya da prova açık olmalı.", { tone: "warn", timeout: 4500 }); return; }
    if (["starting", "recording", "stopping"].includes(stRef.current.status)) return;
    setSt({ status: "starting" });
    try {
      const res = await api().start({ matchId, label });
      if (!res?.ok) throw new Error(res?.error?.message || "Röportaj kaydı başlatılamadı.");
      let id = interviewIdOf(res);
      if (!id) {
        const list = await Promise.resolve(api().status?.()).catch(() => null);
        id = (list?.active || []).find((r) => Number(r.matchId) === Number(matchId))?.id || null;
      }
      if (!id) throw new Error("Röportaj kaydının kimliği alınamadı.");
      setSt({ status: "recording", id, startedAt: Date.now(), label });
      bandRef.current = band;
      if (band) { try { gRef.current?.setInterviewOnAir?.(true); } catch { /* yoksay */ } }
    } catch (e) {
      setSt({ status: "error", error: e?.message || "Röportaj kaydı başlatılamadı." });
      toastRef.current?.(e?.message || "Röportaj kaydı başlatılamadı.", { tone: "error" });
    }
  }, [encoding, matchId]);

  const stop = useCallback(async () => {
    const s = stRef.current;
    if (s.status !== "recording" || !s.id) return;
    const wait = MIN_INTERVIEW_MS - (Date.now() - (s.startedAt || 0));
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    setSt((x) => ({ ...x, status: "stopping" }));
    if (bandRef.current) { try { gRef.current?.setInterviewOnAir?.(false); } catch { /* yoksay */ } }
    try {
      const res = await api().stop(s.id);
      const file = interviewFileOf(res);
      if (!res?.ok || !file) {
        const code = res?.error?.code;
        if (code === "NOT_FOUND" || code === "EMPTY") {
          setSt({ status: "idle" });
          toastRef.current?.(res.error.message || "Röportaj kaydı bulunamadı.", { tone: "warn", timeout: 5000 });
          return;
        }
        throw new Error(res?.error?.message || "Röportaj kaydı kapatılamadı.");
      }
      await upload(file);
    } catch (e) {
      setSt((x) => ({ ...x, status: "error", error: e?.message || "Röportaj kaydı kapatılamadı." }));
      toastRef.current?.(e?.message || "Röportaj kaydı kapatılamadı.", { tone: "error" });
    }
  }, [upload]);

  const retry = useCallback(() => { if (stRef.current.file) upload(stRef.current.file); }, [upload]);
  const dismiss = useCallback(() => setSt({ status: "idle" }), []);

  return { ...st, available: Boolean(api()?.start), recording: st.status === "recording", busy: ["starting", "stopping", "uploading"].includes(st.status), start, stop, retry, dismiss };
}

/** 00:42 biçimi. */
export const interviewClock = (ms) => {
  const t = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
};
