// Yayın Stüdyosu — operatör uyarıları ve YouTube bölümleri (yayına gitmez).
//
//   useSilenceWatch   yayındayken mikrofon N sn sessizse uyarı (yarım saniyede bir RMS)
//   useLowBitrate     kodlayıcı bit hızı hedefin %60'ının altında 10 sn kalırsa bildirim
//   useChapters       "Bölüm işareti" + gollerden YouTube BÖLÜMLERİ (maç başına saklanır,
//                     yayındayken YouTube açıklamasına kendiliğinden gönderilir — youtube/chapters.js)
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { chapterStamp } from "../../../lib/studio/broadcast";
import { isLowBitrate, silenceStep } from "../settings/settings";
import * as api from "../studioApi";
import { chapterRules, chapterSignature, chaptersText, nextChapterStart, normalizeChapters } from "../youtube/chapters";

const rms = (buf) => {
  let sum = 0;
  for (let i = 0; i < buf.length; i += 1) sum += buf[i] * buf[i];
  return Math.sqrt(sum / (buf.length || 1));
};

/** Dönüş: sessizlik süresi (ms) uyarı eşiğini geçtiyse sayı, değilse 0. */
export function useSilenceWatch({ getAnalyser, active, enabled, limitSec = 30 }) {
  const [silentMs, setSilentMs] = useState(0);
  const ref = useRef(getAnalyser);
  ref.current = getAnalyser;
  useEffect(() => {
    if (!active || !enabled) { setSilentMs(0); return undefined; }
    let state = null;
    let buf = null;
    const t = setInterval(() => {
      const a = ref.current?.();
      let level = 0;
      if (a) {
        if (!buf || buf.length !== a.fftSize) buf = new Float32Array(a.fftSize);
        try { a.getFloatTimeDomainData(buf); level = rms(buf); } catch { level = 0; }
      }
      state = silenceStep(state, { level, now: Date.now(), active: true, limitMs: limitSec * 1000 });
      setSilentMs((cur) => {
        const next = state.warn ? Math.floor(state.silentForMs / 1000) * 1000 : 0;
        return cur === next ? cur : next;
      });
    }, 500);
    return () => clearInterval(t);
  }, [active, enabled, limitSec]);
  return silentMs;
}

export function useLowBitrate({ status, targetKbps, active, enabled, toast }) {
  const since = useRef(null);
  const warnedAt = useRef(0);
  useEffect(() => {
    if (!active || !enabled || status?.state !== "live") { since.current = null; return; }
    const now = Date.now();
    if (isLowBitrate(status, targetKbps)) {
      since.current ??= now;
      if (now - since.current > 10_000 && now - warnedAt.current > 60_000) {
        warnedAt.current = now;
        toast?.(`Düşük bit hızı: ${Math.round(status.bitrateKbps)} kbps (hedef ${targetKbps}). Bağlantı zayıf olabilir; kaliteyi düşürmeyi düşün.`, { tone: "warn", timeout: 7000 });
      }
    } else since.current = null;
  }, [active, enabled, status, targetKbps, toast]);
}

const KEY = "studio.chapters.v1";
const readAll = () => { try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch { return {}; } };
const SYNC_DEBOUNCE_MS = 6000;

/**
 * YouTube BÖLÜMLERİ (maç başına, kalıcı): { startAt, startKind, items: [{ id, at, label, kind }], sync }.
 *   startAt  YouTube kaydının 0:00'ı = bu maçta İLK canlı yayın başlangıcı (engine.since).
 *            Yeniden bağlanmada sıfırlanmaz; provadan sonra ilk gerçek yayın provayı geçersiz kılar.
 *   items    goller (kind "goal") ve "Bölüm" işaretleri (kind "mark"); adlandır, sil, zamanı kaydır.
 *   sync     YouTube'a gönderim: POST /matches/:id/chapters (yayındayken her değişiklikten
 *            ~6 sn sonra, görüntü durunca / yayın bitince hemen; elle "YouTube'a gönder").
 * opts: { mode: "live" | "rehearsal" | null, active, broadcastId } — gönderim yalnız açık bir
 * YouTube yayını (broadcastId) varken kendiliğinden yapılır.
 */
export function useChapters(matchId, since, opts = {}) {
  const { mode = null, active = false, broadcastId = null } = opts;
  const key = String(matchId || "none");
  const [all, setAll] = useState(readAll);
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* yoksay */ } }, [all]);
  const entry = all[key] || { startAt: null, startKind: null, items: [] };
  const patchEntry = useCallback((fn) => setAll((a) => ({ ...a, [key]: fn(a[key] || { startAt: null, startKind: null, items: [] }) })), [key]);

  // Başlangıç (0:00): ilk canlı yayın; yeniden bağlanmada korunur.
  useEffect(() => {
    if (!since) return;
    patchEntry((cur) => nextChapterStart(cur, { since, mode: mode || "live" }));
  }, [since, mode, patchEntry]);

  const add = useCallback((label = "Bölüm", { kind } = {}) => {
    const at = Date.now();
    const k = kind || (/^gol\b/i.test(String(label)) ? "goal" : "mark");
    patchEntry((cur) => ({ ...cur, startAt: cur.startAt || at, items: [...(cur.items || []), { id: `ch_${at.toString(36)}${Math.random().toString(36).slice(2, 5)}`, at, label: String(label).slice(0, 80), kind: k }] }));
  }, [patchEntry]);
  const remove = useCallback((id) => patchEntry((cur) => ({ ...cur, items: (cur.items || []).filter((x) => x.id !== id) })), [patchEntry]);
  const rename = useCallback((id, label) => patchEntry((cur) => ({ ...cur, items: (cur.items || []).map((x) => (x.id === id ? { ...x, label: String(label || "").slice(0, 80) } : x)) })), [patchEntry]);
  /** Zamanı kaydır (ms, + ileri / − geri); 0:00'ın altına inmez. */
  const nudge = useCallback((id, deltaMs) => patchEntry((cur) => ({ ...cur, items: (cur.items || []).map((x) => (x.id === id ? { ...x, at: Math.max(cur.startAt || 0, x.at + deltaMs) } : x)) })), [patchEntry]);
  /** Zamanı doğrudan ayarla (yayın başından ms). */
  const setTime = useCallback((id, atMs) => patchEntry((cur) => ({ ...cur, items: (cur.items || []).map((x) => (x.id === id ? { ...x, at: (cur.startAt || 0) + Math.max(0, atMs) } : x)) })), [patchEntry]);
  const clear = useCallback(() => patchEntry(() => ({ startAt: null, startKind: null, items: [] })), [patchEntry]);
  /** 0:00'ı şimdiye al (yayın YouTube'da geç başladıysa). */
  const resetStart = useCallback((at = Date.now()) => patchEntry((cur) => ({ ...cur, startAt: at, startKind: cur.startKind || "live" })), [patchEntry]);

  const items = useMemo(() => {
    const start = entry.startAt || 0;
    return [...(entry.items || [])].sort((a, b) => a.at - b.at).map((c) => ({ ...c, kind: c.kind || (/^gol\b/i.test(c.label) ? "goal" : "mark"), atMs: Math.max(0, c.at - start), stamp: chapterStamp(Math.max(0, c.at - start)) }));
  }, [entry]);
  const normalized = useMemo(() => normalizeChapters(items), [items]);
  const text = useMemo(() => chaptersText(normalized), [normalized]);
  const rules = useMemo(() => chapterRules(normalized), [normalized]);
  const signature = chapterSignature(normalized);

  /* ───────── YouTube'a gönderim ───────── */
  const sync = entry.sync || {};
  const [sending, setSending] = useState(false);
  const sigRef = useRef(signature);
  sigRef.current = signature;
  const normRef = useRef(normalized);
  normRef.current = normalized;
  const sendingRef = useRef(false);
  const send = useCallback(async ({ quiet = false } = {}) => {
    if (!matchId || sendingRef.current) return { ok: false };
    const chapters = normRef.current;
    const sig = sigRef.current;
    sendingRef.current = true;
    setSending(true);
    try {
      const r = await api.postChapters(matchId, chapters);
      const ok = Boolean(r.ok && r.data?.ok !== false);
      const error = ok ? null : api.notSupported(r) ? "Sunucu bölüm göndermeyi henüz desteklemiyor: “Kopyala” ile açıklamaya yapıştır." : r.offline ? "Bağlantı yok: bölümler gönderilemedi." : r.error?.message || r.data?.message || "Bölümler gönderilemedi.";
      patchEntry((cur) => ({ ...cur, sync: { ...(cur.sync || {}), lastAt: Date.now(), ...(ok ? { sentSig: sig, applied: r.data?.applied ?? true, error: null, description: r.data?.description ?? null } : { error, failedSig: sig, unsupported: api.notSupported(r) }) } }));
      return { ok, error, quiet };
    } finally { sendingRef.current = false; setSending(false); }
  }, [matchId, patchEntry]);

  const hasMarks = items.length > 0;
  const dirty = hasMarks && signature !== sync.sentSig;
  const canAuto = Boolean(matchId && broadcastId && !sync.unsupported);
  // Yayındayken her değişiklikten sonra (bekleyip) kendiliğinden.
  useEffect(() => {
    if (!canAuto || !active || !dirty || signature === sync.failedSig) return undefined;
    const t = setTimeout(() => { send({ quiet: true }); }, SYNC_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [canAuto, active, dirty, signature, sync.failedSig, send]);
  // Görüntü durunca / yayın bitince: bekleyen değişiklik hemen gider.
  const wasActive = useRef(active);
  useEffect(() => {
    if (wasActive.current && !active && canAuto && dirty) send({ quiet: true });
    wasActive.current = active;
  }, [active, canAuto, dirty, send]);

  const status = sending ? "sending" : sync.error && sync.failedSig === signature ? "error" : !hasMarks ? "empty" : dirty ? (canAuto ? "pending" : "local") : "sent";
  return {
    chapters: items, normalized, text, rules, add, remove, rename, nudge, setTime, clear, resetStart,
    startAt: entry.startAt, startKind: entry.startKind,
    sync: { send, status, lastAt: sync.lastAt || null, error: sync.error || null, applied: sync.applied ?? null, auto: canAuto, unsupported: Boolean(sync.unsupported), dirty },
  };
}
