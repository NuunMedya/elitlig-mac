// Yayın Stüdyosu — RÖPORTAJ KAYDI (bant stili ve konuklar grafik modülünde: g.interview).
//
// TEK AKIŞ (bant kayıttan BAĞIMSIZ):
//   1. Operatör herhangi bir kamera sahnesini normal yayına alır.
//   2. Röportaj sekmesinde bant şablonunu ve konuğu seçer, "Bant" anahtarıyla
//      bandı yayındaki programın üstüne açar (kapatana kadar kalır).
//   3. "Röportajı kaydet" → program çıkışı kaydedilir; "Bitir" → kayıt kapanır.
//   4. İnceleme penceresi: klip izlenir → "Web sitesine yükle" (maçın röportaj
//      bölümüne) ya da "Sil".
//
// IPC (app/studio/interview.js — değiştirilmez):
//   studio.interview.start({ matchId, label }) → { ok, id?, interview: { id, startedAt, … } }
//   studio.interview.stop(id)                  → { ok, interview|file: { name, url, durationMs, … } }
//   studio.interview.upload({ matchId, name }) → { ok, data: { url }, interview, result }
//   studio.interview.delete(name)              → bool
//   studio.interview.status()                  → { active: [{ id, matchId, startedAt, … }] }
//   studio.interview.onStatus(cb)              cb({ active, finished? })  (oturum biterken kendiliğinden bitirilenler)
//   studio.onUploadProgress(p)                 p.kind === "interview" → { loaded, total }
//
// Durum TEK bir paylaşılan depoda tutulur: kancayı birden çok yer kullansa da
// (üst çubuk düğmesi, Röportaj sekmesi) aynı kayıt görünür, IPC olayları bir
// kez işlenir (eskiden iki örnek aynı bitişi iki kez yüklüyordu).
import { useEffect, useMemo, useSyncExternalStore } from "react";

const api = () => (typeof window !== "undefined" ? window.elitlig?.studio?.interview : null);

/** start yanıtından kimlik (eski / yeni biçim). */
export const interviewIdOf = (res) => (res?.interview?.id ?? res?.id ?? null);
/** stop yanıtından dosya (eski / yeni biçim). */
export const interviewFileOf = (res) => (res?.interview?.name ? res.interview : res?.file?.name ? res.file : null);
/** En kısa kayıt (ana süreç 1 sn'den kısa röportajı "boş" sayar ve siler). */
export const MIN_INTERVIEW_MS = 1500;

/** Durumlar: idle | starting | recording | stopping | review | uploading | done | error */
export const INTERVIEW_BUSY = ["starting", "stopping", "uploading"];

/* ───────── paylaşılan depo ───────── */
const IDLE = Object.freeze({ status: "idle" });
let state = IDLE;
const subs = new Set();
const emit = () => subs.forEach((f) => f());
const set = (patch) => { state = typeof patch === "function" ? patch(state) : patch; emit(); };
const ctx = { matchId: null, graphics: null, encoding: false, toast: null };
const say = (m, o) => { try { ctx.toast?.(m, o); } catch { /* yoksay */ } };

let wired = false;
function wire() {
  if (wired || !api()) return;
  wired = true;
  window.elitlig?.studio?.onUploadProgress?.((p) => {
    if (!p || p.kind !== "interview") return;
    const done = p.loaded ?? p.sent;
    const pct = Number.isFinite(p.pct) ? p.pct : p.total ? Math.round((done / p.total) * 100) : null;
    if (state.status === "uploading") set((s) => ({ ...s, progress: pct }));
  });
  // Yayın durunca ana süreç süren röportajı kendisi bitirir: incelemeye al.
  api().onStatus?.((ev) => {
    const s = state;
    if (s.status !== "recording" || !s.id) return;
    if ((ev?.active || []).some((r) => r.id === s.id)) return;
    if (ev?.finished?.name) {
      set({ status: "review", file: ev.finished, matchId: s.matchId, label: s.label, auto: true });
      say("Yayın durduğu için röportaj kaydı bitti: kaydı izleyip yükleyebilirsin.", { tone: "info", timeout: 6000 });
    } else set(IDLE);
  });
}

/** Açılışta süren röportajı geri al (bir kez, maç başına). */
let resumedFor = undefined;
function resume(matchId) {
  const a = api();
  if (!a?.status || resumedFor === matchId) return;
  resumedFor = matchId;
  Promise.resolve(a.status()).then((res) => {
    if (state.status !== "idle") return;
    const mine = (res?.active || []).find((r) => !matchId || !r.matchId || Number(r.matchId) === Number(matchId));
    if (mine) set({ status: "recording", id: mine.id, matchId: mine.matchId ?? matchId, startedAt: Date.parse(mine.startedAt) || Date.now() - (mine.elapsedMs || 0), label: mine.label || "Röportaj" });
  }).catch(() => {});
}

const actions = {
  /** Kaydı başlat (bant ETKİLENMEZ; { band: true } verilirse ayrıca açılır). */
  async start(label = "Röportaj", { band = false } = {}) {
    if (!api()?.start) { say("Röportaj kaydı bu uygulama sürümünde yok.", { tone: "warn" }); return false; }
    const matchId = ctx.matchId;
    if (!matchId) { say("Önce maç seç (Maç yönetimi).", { tone: "warn" }); return false; }
    if (!ctx.encoding) { say("Röportaj kaydı için yayın ya da prova açık olmalı (program kaydedilir).", { tone: "warn", timeout: 4500 }); return false; }
    if (["starting", "recording", "stopping", "uploading"].includes(state.status)) return false;
    if (state.status === "review") {
      set((s) => ({ ...s, hidden: false })); // inceleme penceresini yeniden aç
      say("Önce önceki röportaj kaydı için karar ver (yükle ya da sil).", { tone: "warn" });
      return false;
    }
    set({ status: "starting" });
    try {
      const res = await api().start({ matchId, label });
      if (!res?.ok) throw new Error(res?.error?.message || "Röportaj kaydı başlatılamadı.");
      let id = interviewIdOf(res);
      if (!id) {
        const list = await Promise.resolve(api().status?.()).catch(() => null);
        id = (list?.active || []).find((r) => Number(r.matchId) === Number(matchId))?.id || null;
      }
      if (!id) throw new Error("Röportaj kaydının kimliği alınamadı.");
      set({ status: "recording", id, matchId, startedAt: Date.now(), label });
      if (band) { try { ctx.graphics?.setInterviewOnAir?.(true); } catch { /* yoksay */ } }
      return true;
    } catch (e) {
      set({ status: "error", error: e?.message || "Röportaj kaydı başlatılamadı." });
      say(e?.message || "Röportaj kaydı başlatılamadı.", { tone: "error" });
      return false;
    }
  },

  /** Kaydı bitir → inceleme (yükleme operatör onayıyla). */
  async stop() {
    const s = state;
    if (s.status !== "recording" || !s.id) return false;
    const wait = MIN_INTERVIEW_MS - (Date.now() - (s.startedAt || 0));
    set((x) => ({ ...x, status: "stopping" }));
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    try {
      const res = await api().stop(s.id);
      const file = interviewFileOf(res);
      if (!res?.ok || !file) {
        const code = res?.error?.code;
        if (code === "NOT_FOUND" || code === "EMPTY") {
          set(IDLE);
          say(res.error.message || "Röportaj kaydı bulunamadı.", { tone: "warn", timeout: 5000 });
          return false;
        }
        throw new Error(res?.error?.message || "Röportaj kaydı kapatılamadı.");
      }
      set({ status: "review", file, matchId: s.matchId, label: s.label });
      return true;
    } catch (e) {
      set({ status: "error", error: e?.message || "Röportaj kaydı kapatılamadı." });
      say(e?.message || "Röportaj kaydı kapatılamadı.", { tone: "error" });
      return false;
    }
  },

  /** Web sitesine (maçın röportaj bölümüne) yükle. */
  async upload(fileArg) {
    const file = fileArg || state.file;
    if (!file?.name) return false;
    const matchId = state.matchId || ctx.matchId;
    set((s) => ({ ...s, status: "uploading", file, progress: 0, error: null }));
    try {
      const res = await api().upload({ matchId, name: file.name });
      if (!res?.ok) throw new Error(res?.error?.message || "Röportaj yüklenemedi.");
      const url = res.data?.url || res.result?.url || res.result?.post_roportaj || res.interview?.uploaded?.url || null;
      set((s) => ({ ...s, status: "done", url, progress: 100 }));
      say("Röportaj maç sayfasına yüklendi.", { tone: "success", timeout: 5000 });
      return true;
    } catch (e) {
      set((s) => ({ ...s, status: "error", error: e?.message || "Röportaj yüklenemedi." }));
      say(e?.message || "Röportaj yüklenemedi.", { tone: "error", timeout: 6000 });
      return false;
    }
  },

  /** Kaydı bu bilgisayardan sil (yüklemeden). */
  async discard() {
    const file = state.file;
    if (file?.name) { try { await api()?.delete?.(file.name); } catch { /* yoksay */ } }
    set(IDLE);
    say("Röportaj kaydı silindi.", { tone: "info" });
    return true;
  },

  retry() { return state.file ? actions.upload(state.file) : Promise.resolve(false); },
  /** İnceleme penceresini gizle / yeniden aç (karar sonraya). */
  hideReview(hidden = true) { if (state.status === "review") set((s) => ({ ...s, hidden })); },
  dismiss() { set(IDLE); },
};

/** Sınama için: depoyu sıfırla. */
export function __resetInterviewStore() { state = IDLE; resumedFor = undefined; emit(); }

export function useInterview({ matchId, graphics, encoding, toast } = {}) {
  // Son çağıranın bağlamı geçerli (tüm örnekler aynı maç / yayın durumunu verir).
  ctx.matchId = matchId || null;
  ctx.graphics = graphics || null;
  ctx.encoding = Boolean(encoding);
  ctx.toast = toast || ctx.toast;
  const st = useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => state, () => state);
  useEffect(() => { wire(); resume(matchId || null); }, [matchId]);
  const available = Boolean(api()?.start);
  return useMemo(() => ({
    ...st,
    available,
    recording: st.status === "recording",
    reviewing: st.status === "review",
    busy: INTERVIEW_BUSY.includes(st.status),
    ...actions,
  }), [st, available]);
}

/** 00:42 biçimi. */
export const interviewClock = (ms) => {
  const t = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
};
