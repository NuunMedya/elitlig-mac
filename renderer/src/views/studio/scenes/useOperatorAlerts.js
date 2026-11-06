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
import { buildChapters, chapterRules, chapterSignature, chaptersText, goalChapterLabel, nextChapterStart } from "../youtube/chapters";

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
/** Yayındayken YouTube'a kendiliğinden gönderim aralığı (yalnız değiştiyse). */
export const SYNC_INTERVAL_MS = 180_000;

/**
 * YouTube BÖLÜMLERİ (maç başına, kalıcı): { startAt, startKind, items: [{ id, at, label, kind }], sync }.
 *   startAt  YouTube kaydının 0:00'ı = bu maçta İLK canlı yayın başlangıcı (engine.since).
 *            Yeniden bağlanmada sıfırlanmaz; provadan sonra ilk gerçek yayın provayı geçersiz kılar.
 *   items    goller (kind "goal": at = GOL'e basılan an, goal = skor + golcü; 45 sn'lik bölüm)
 *            ve "Bölüm" işaretleri (kind "mark"); adlandır, sil, zamanı kaydır.
 *   sync     YouTube'a gönderim: POST /matches/:id/chapters (yayındayken 3 dakikada bir,
 *            yalnız değiştiyse; görüntü durunca / "Yayını bitir"de flush() ile hemen; elle "YouTube'a gönder").
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

  /** İşaret ekle. opts.at: işaretin anı (varsayılan şimdi; gollerde GOL'e basılan an), opts.goal: gol bilgisi. */
  const add = useCallback((label = "Bölüm", { kind, at: atOpt, goal } = {}) => {
    const now = Date.now();
    const at = Number.isFinite(Number(atOpt)) && Number(atOpt) > 0 ? Number(atOpt) : now;
    const k = kind || (goal || /^gol\b/i.test(String(label)) ? "goal" : "mark");
    const item = { id: `ch_${now.toString(36)}${Math.random().toString(36).slice(2, 5)}`, at, label: String(label).slice(0, 80), kind: k, ...(goal ? { goal } : {}) };
    patchEntry((cur) => ({ ...cur, startAt: cur.startAt || at, items: [...(cur.items || []), item] }));
  }, [patchEntry]);
  /**
   * GOL bölümü: at = GOL'e basılan an; goal = { home, away, homeScore, awayScore, scorer, own }
   * (skor golden sonra). 45 sn: basıştan 15 sn önce başlar, 30 sn sonra maç devam eder.
   */
  const addGoal = useCallback(({ at, goal } = {}) => add(goalChapterLabel(goal), { kind: "goal", at, goal }), [add]);
  const remove = useCallback((id) => patchEntry((cur) => ({ ...cur, items: (cur.items || []).filter((x) => x.id !== id) })), [patchEntry]);
  /** Yeniden adlandır: gol bölümünde elle verilen ad kendiliğinden adın yerine geçer (custom). */
  const rename = useCallback((id, label) => patchEntry((cur) => ({ ...cur, items: (cur.items || []).map((x) => (x.id === id ? { ...x, label: String(label || "").slice(0, 80), ...(x.kind === "goal" ? { custom: true } : {}) } : x)) })), [patchEntry]);
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
  const normalized = useMemo(() => buildChapters(items), [items]);
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
  const inflightRef = useRef(null);
  const lastSentRef = useRef(null);
  const send = useCallback(async ({ quiet = false } = {}) => {
    if (!matchId || sendingRef.current) return { ok: false };
    const chapters = normRef.current;
    const sig = sigRef.current;
    sendingRef.current = true;
    setSending(true);
    const run = (async () => {
      const r = await api.postChapters(matchId, chapters);
      const ok = Boolean(r.ok && r.data?.ok !== false);
      const error = ok ? null : api.notSupported(r) ? "Sunucu bölüm göndermeyi henüz desteklemiyor: “Kopyala” ile açıklamaya yapıştır." : r.offline ? "Bağlantı yok: bölümler gönderilemedi." : r.error?.message || r.data?.message || "Bölümler gönderilemedi.";
      if (ok) lastSentRef.current = sig;
      patchEntry((cur) => ({ ...cur, sync: { ...(cur.sync || {}), lastAt: Date.now(), ...(ok ? { sentSig: sig, applied: r.data?.applied ?? true, error: null, description: r.data?.description ?? null } : { error, failedSig: sig, unsupported: api.notSupported(r) }) } }));
      return { ok, error, quiet };
    })();
    inflightRef.current = run;
    try { return await run; } finally { sendingRef.current = false; inflightRef.current = null; setSending(false); }
  }, [matchId, patchEntry]);

  const hasMarks = items.length > 0;
  const dirty = hasMarks && signature !== sync.sentSig;
  const canAuto = Boolean(matchId && broadcastId && !sync.unsupported);
  const autoRef = useRef({ canAuto, hasMarks, sentSig: sync.sentSig });
  autoRef.current = { canAuto, hasMarks, sentSig: sync.sentSig };
  const changed = () => autoRef.current.hasMarks && sigRef.current !== autoRef.current.sentSig && sigRef.current !== lastSentRef.current;
  // Yayındayken 3 dakikada bir, yalnız liste değiştiyse kendiliğinden.
  useEffect(() => {
    if (!canAuto || !active) return undefined;
    const t = setInterval(() => { if (changed() && !sendingRef.current) send({ quiet: true }); }, SYNC_INTERVAL_MS);
    return () => clearInterval(t);
  }, [canAuto, active, send]); // eslint-disable-line react-hooks/exhaustive-deps
  /**
   * Son durumu hemen gönder ve bitmesini bekle ("Yayını bitir" / görüntüyü durdur:
   * YouTube yayını kapanmadan önce). Değişiklik yoksa ya da YouTube yayını yoksa gönderilmez.
   */
  const flush = useCallback(async ({ timeoutMs = 10_000 } = {}) => {
    const run = (async () => {
      if (inflightRef.current) { try { await inflightRef.current; } catch { /* yoksay */ } }
      if (!autoRef.current.canAuto || !changed()) return { ok: true, skipped: true };
      try { return await send({ quiet: true }); } catch { return { ok: false }; }
    })();
    // Ağ yavaşsa yayını bitirmeyi sonsuza dek bekletme.
    let timer = null;
    const timeout = new Promise((res) => { timer = setTimeout(() => res({ ok: false, timeout: true }), timeoutMs); });
    try { return await Promise.race([run, timeout]); } finally { clearTimeout(timer); }
  }, [send]); // eslint-disable-line react-hooks/exhaustive-deps
  // Görüntü durunca / yayın bitince: bekleyen değişiklik hemen gider.
  const wasActive = useRef(active);
  useEffect(() => {
    if (wasActive.current && !active && canAuto && dirty) send({ quiet: true });
    wasActive.current = active;
  }, [active, canAuto, dirty, send]);

  const status = sending ? "sending" : sync.error && sync.failedSig === signature ? "error" : !hasMarks ? "empty" : dirty ? (canAuto ? "pending" : "local") : "sent";
  return {
    chapters: items, normalized, text, rules, add, addGoal, remove, rename, nudge, setTime, clear, resetStart,
    startAt: entry.startAt, startKind: entry.startKind,
    sync: { send, flush, status, lastAt: sync.lastAt || null, error: sync.error || null, applied: sync.applied ?? null, auto: canAuto, unsupported: Boolean(sync.unsupported), dirty, intervalMs: SYNC_INTERVAL_MS },
  };
}
