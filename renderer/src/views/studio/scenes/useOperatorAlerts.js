// Yayın Stüdyosu — operatör uyarıları ve YouTube bölümleri (yayına gitmez).
//
//   useSilenceWatch   yayındayken mikrofon N sn sessizse uyarı (yarım saniyede bir RMS)
//   useLowBitrate     kodlayıcı bit hızı hedefin %60'ının altında 10 sn kalırsa bildirim
//   useChapters       "Bölüm işareti" + gollerden YouTube bölüm listesi (maç başına saklanır)
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { chapterStamp, youtubeChapters } from "../../../lib/studio/broadcast";
import { isLowBitrate, silenceStep } from "../settings/settings";

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

/**
 * Bölümler (maç başına): { startAt, items: [{ id, at, label }] }. startAt = ilk yayın /
 * prova başlangıcı (YouTube kaydının 00:00'ı). since: engine.since.
 */
export function useChapters(matchId, since) {
  const key = String(matchId || "none");
  const [all, setAll] = useState(readAll);
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* yoksay */ } }, [all]);
  const entry = all[key] || { startAt: null, items: [] };
  useEffect(() => {
    if (!since) return;
    setAll((a) => (a[key]?.startAt ? a : { ...a, [key]: { startAt: since, items: a[key]?.items || [] } }));
  }, [key, since]);
  const add = useCallback((label = "Bölüm") => {
    const at = Date.now();
    setAll((a) => {
      const cur = a[key] || { startAt: null, items: [] };
      return { ...a, [key]: { startAt: cur.startAt || at, items: [...cur.items, { id: `ch_${at.toString(36)}`, at, label: String(label).slice(0, 80) }] } };
    });
  }, [key]);
  const remove = useCallback((id) => setAll((a) => ({ ...a, [key]: { ...(a[key] || {}), items: (a[key]?.items || []).filter((x) => x.id !== id) } })), [key]);
  const clear = useCallback(() => setAll((a) => ({ ...a, [key]: { startAt: null, items: [] } })), [key]);
  const items = useMemo(() => {
    const start = entry.startAt || 0;
    return entry.items.map((c) => ({ ...c, atMs: Math.max(0, c.at - start), stamp: chapterStamp(Math.max(0, c.at - start)) }));
  }, [entry]);
  const text = useMemo(() => youtubeChapters(items), [items]);
  return { chapters: items, add, remove, clear, text };
}
